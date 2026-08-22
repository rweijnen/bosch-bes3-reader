// EXPERIMENTAL, UNCONFIRMED: a full-protocol BLE transport, distinct from
// transport-webble.js (which talks to Bosch's official, deliberately
// limited Live Data Interface). This one attempts to speak the same
// reverse-engineered MCSP/MessageBus protocol used over USB
// (transport-webusb.js, src/protocol.js) — the same ~370-point read — but
// over Bluetooth Low Energy instead.
//
// GATT layout and framing below are derived from decompiling the official
// Bosch Flow Android app (not from any live BLE capture against real
// hardware) — see this project's private research notes. Whether a real
// bike's BLE stack actually accepts and answers this has NEVER been
// confirmed on hardware. Treat every result from this transport with
// suspicion until validated.
//
// Service/characteristic UUIDs (Bes3EbikeGattService / McspGattConfig):
const ADVERTISED_SERVICE_UUID = '0000fe02-0000-1000-8000-00805f9b34fb';
const MCSP_SERVICE_UUID = '00000010-eaa2-11e9-81b4-2a2ae2dbcce4';
const RX_CHARACTERISTIC_UUID = '00000011-eaa2-11e9-81b4-2a2ae2dbcce4'; // notify, bike -> phone
const TX_CHARACTERISTIC_UUID = '00000012-eaa2-11e9-81b4-2a2ae2dbcce4'; // write, phone -> bike

// Control-command types (channel-0 payloads): [type, ...args]
const CommandType = {
  VERSION: 0x01,
  ADVANCE_TRANSMIT_WINDOW: 0x02,
  DISABLE_FLOW_CONTROL: 0x03,
  MAX_SEGMENTATION_PACKET: 0x04,
};

// Logical channels multiplexed under the 2-byte segmentation header.
// Application (message-bus) traffic rides channel 1 exclusively — confirmed
// by cross-referencing the USB side's own McspChannel.MESSAGE_BUS = 1.
const Channel = {
  COMMAND: 0,
  MESSAGE_BUS: 1,
  LBTP_PULL: 2,
  LBTP_PUSH: 3,
};

// MessageType nibble values (see src/protocol.js for the full table).
const MessageType = {
  READ: 0, READ_RESPONSE: 1, WRITE: 2, WRITE_RESPONSE: 3, RPC: 4, RPC_RESPONSE: 5,
};
const ResponseStatus = {
  SUCCESS: 0,
  UNSUPPORTED: 4,
  MALFORMED: 8,
};

// The bike expects the phone to act as a message-bus PEER with its own
// "MobileApp" component, not just a client issuing reads — discovered by
// tracing the Flow app's connection-lifecycle code (DefaultBoschRemoteControl/
// DefaultBikeInitialisationIndicator/StaticFeatureProperties). Until this
// project's transport first surfaced this, every plain read timed out on
// real hardware: the bike was stuck retrying these same requests against us
// and getting no answer, exactly mirroring what our own reads were doing to
// it. See private research notes for the full trace and the hardware
// capture that led here.
//
// MobileAppAddresses (com.bosch.ebike.messagebus.constants), high byte 0x40:
const MOBILE_APP_HIGH_BYTE = 0x40;
const MOBILE_APP_LOW = {
  UI_PRIORITY: 0x81,                        // 16513
  STARTUP_STAGE: 0xa9,                      // 16553 — bike WRITEs its boot stage here (0=UNINITIALIZED .. 9=STAGE9/done)
  MOBILE_APP_STATIC_FEATURE_PROPERTIES: 0xaa, // 16554 — bike READs this; must report stagedStartup=true or it won't proceed
};
const STARTUP_STAGE_DONE = 9;

// The fixed "host" node address 0x0e10 used throughout src/protocol.js was
// captured from a real USB DiagnosticTool 3 session and confirmed correct
// for USB. The Flow app uses a DIFFERENT self-identity address on BLE — but
// NOT AddressesKt.MobileAppBrokerAddress (0x4000, that's the address Flow
// answers AS when the bike addresses IT as a "MobileApp" peer — see
// MOBILE_APP_HIGH_BYTE above, a separate role). The address Flow actually
// stamps as the SOURCE on every outgoing request it sends TO the bike
// (reads, writes, RPCs alike) is MobileAppGatewaysAddresses.E_BIKE = 16768 =
// 0x4180 — confirmed via BluetoothGateway's constructor default
// (`getAddress()` returns this, and InternalGatewayImpl/BluetoothGateway use
// it as `source` for every RpcCallMessage/ReadMessage/WriteMessage). Using
// the wrong one of these two addresses here plausibly explains both the
// original "every read timed out" symptom AND the confirmed UNSUPPORTED
// response for GET_ASSIST_MODE_STATISTICS: reads/writes tolerate a
// not-quite-right source address, but the bike's stricter checks (some
// fields, and evidently this RPC) don't.
const BLE_HOST_HIGH = 0x41;
const BLE_HOST_LOW = 0x80;
const USB_HOST_HIGH = 0x0e; // what protocol.js hardcodes; rewritten back to this on the way in
const USB_HOST_LOW = 0x10;
const BLOCK_OP = 0x30;
const MAX_REASSEMBLED_MESSAGE_BYTES = 16 * 1024;
const FRAME_LOGGING_FLAG = 'Bes3BleMcspFrameLogging';
// MobileAppStaticFeatureProperties: proto3 bools, field 3 = stagedStartup.
// Only the true field needs encoding (proto3 omits false/default fields):
// tag=(3<<3)|0=0x18, value=1.
const STATIC_FEATURE_PROPERTIES_RESPONSE = Uint8Array.from([0x18, 0x01]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDebugLog() {
  if (typeof window === 'undefined') return null;
  return window.Bes3DebugLog && window.Bes3DebugLog.log;
}

function isFrameLoggingEnabled() {
  return typeof window !== 'undefined' && window[FRAME_LOGGING_FLAG] === true;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// Segmentation frame header (2 bytes), generic — does not hardcode any
// particular channel/length, unlike the USB side's historical BLOCK_OP=0x30
// constant (which turned out to just be this exact header for channel 1,
// end-of-channel set, and a payload under 256 bytes — see private research
// notes for how that was discovered).
function encodeSegmentationFrame(channel, endOfChannel, payload) {
  if (payload.length > 4095) throw new Error('payload too large for a single segmentation frame');
  const header0 = ((channel & 0x07) << 5) | (endOfChannel ? 0x10 : 0) | ((payload.length >> 8) & 0x0f);
  const header1 = payload.length & 0xff;
  const frame = new Uint8Array(2 + payload.length);
  frame[0] = header0;
  frame[1] = header1;
  frame.set(payload, 2);
  return frame;
}

// Decodes as many complete [header][payload] frames as fit in `buffer` —
// multiple frames can be packed back-to-back into a single physical BLE
// write/notification.
function decodeSegmentationFramesWithRemainder(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const header0 = buffer[offset];
    const header1 = buffer[offset + 1];
    const channel = (header0 >> 5) & 0x07;
    const endOfChannel = !!(header0 & 0x10);
    const length = ((header0 & 0x0f) << 8) | header1;
    const payloadStart = offset + 2;
    const payloadEnd = payloadStart + length;
    if (payloadEnd > buffer.length) break;
    frames.push({ channel, endOfChannel, payload: buffer.slice(payloadStart, payloadEnd) });
    offset = payloadEnd;
  }
  return { frames, remainder: buffer.slice(offset) };
}

function decodeSegmentationFrames(buffer) {
  return decodeSegmentationFramesWithRemainder(buffer).frames;
}

function wrapMessageBusBodyForUsb(body) {
  if (body.length > 4095) throw new Error(`message-bus body too large for MCSP segmentation frame: ${body.length} bytes`);
  const translated = body.slice();
  if (translated.length >= 4 && (translated[2] & 0x7f) === BLE_HOST_HIGH && translated[3] === BLE_HOST_LOW) {
    const successFlag = translated[2] & 0x80;
    translated[2] = successFlag | USB_HOST_HIGH;
    translated[3] = USB_HOST_LOW;
  }
  return encodeSegmentationFrame(Channel.MESSAGE_BUS, true, translated);
}

function reassembleSegmentationFrame(state, frame, maxBytes = MAX_REASSEMBLED_MESSAGE_BYTES) {
  if (!state[frame.channel]) state[frame.channel] = [];
  const parts = state[frame.channel];
  parts.push(frame.payload);
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  if (total > maxBytes) {
    state[frame.channel] = [];
    throw new Error(`segmentation reassembly exceeded ${maxBytes} bytes on channel ${frame.channel}`);
  }
  if (!frame.endOfChannel) return null;
  const body = concatBytes(parts);
  state[frame.channel] = [];
  return body;
}

function publicFrameLogData(frame) {
  if (!isFrameLoggingEnabled()) return undefined;
  if (frame.channel === Channel.MESSAGE_BUS) {
    return '[omitted message-bus payload]';
  }
  return frame.payload;
}

function buildMobileAppResponseBody(reqSrcHigh, reqSrcLow, srcLow, responseType, seq, payload, status = ResponseStatus.SUCCESS) {
  const success = status === ResponseStatus.SUCCESS;
  return Uint8Array.from([
    MOBILE_APP_HIGH_BYTE,
    srcLow,
    (success ? 0x80 : 0x00) | (reqSrcHigh & 0x7f),
    reqSrcLow,
    ((responseType & 0x0f) << 4) | (seq & 0x0f),
    ...(success ? Array.from(payload || []) : [status]),
  ]);
}

function decodeStartupStagePayload(payload) {
  if (!payload || payload.length !== 2 || payload[0] !== 0x08 || payload[1] > STARTUP_STAGE_DONE) return null;
  return payload[1];
}

function clearTransportState(transport) {
  transport._readQueue = [];
  transport._commandsSeen = [];
  transport._segmentationRemainder = new Uint8Array(0);
  transport._reassembly = {};
  transport.startupStage = null;
}

function encodeCommand(type, args) {
  return Uint8Array.from([type, ...(args || [])]);
}

async function requestMcspDevice() {
  return navigator.bluetooth.requestDevice({
    filters: [{ services: [ADVERTISED_SERVICE_UUID] }],
    optionalServices: [MCSP_SERVICE_UUID],
  });
}

class Bes3BleMcspTransport {
  constructor(device) {
    this.device = device;
    this.rxChar = null;
    this.txChar = null;
    this._readQueue = []; // reconstructed USB-shaped frames, ready for protocol.js's parseReadResponseFrame
    this._commandsSeen = [];
    this._segmentationRemainder = new Uint8Array(0);
    this._reassembly = {};
    this.startupStage = null; // last STARTUP_STAGE value the bike has written to us, or null if never seen
  }

  // On Windows, Web Bluetooth's gatt.connect() (and the discovery calls right
  // after it) are flaky right after pairing — "Connection Error: Connection
  // attempt failed" on the first 1-2 tries, then success. Retry the whole
  // connect+discover+subscribe sequence with backoff, disconnecting any
  // half-open link between attempts. A "Not paired" error is the exception: it
  // won't fix itself by retrying (the OS bond is missing), so bail out early
  // with guidance instead of hammering.
  async open() {
    const log = getDebugLog();
    log && log('ble-mcsp', 'device selected for BLE MCSP transport');
    const backoffsMs = [0, 400, 900, 1600];
    let lastErr;
    for (let attempt = 0; attempt < backoffsMs.length; attempt++) {
      if (backoffsMs[attempt]) await sleep(backoffsMs[attempt]);
      try {
        await this._openOnce(log, attempt + 1, backoffsMs.length);
        log && log('ble-mcsp', 'open() complete');
        return;
      } catch (err) {
        lastErr = err;
        log && log('ble-mcsp', `open attempt ${attempt + 1}/${backoffsMs.length} failed: ${err.message}`);
        try { this.device.gatt.disconnect(); } catch (_) {}
        if (this.rxChar && this._onNotify) {
          try { this.rxChar.removeEventListener('characteristicvaluechanged', this._onNotify); } catch (_) {}
        }
        if (/not paired|encryption|not authori|authentication/i.test(err.message || '')) break;
      }
    }
    throw new Error(this._friendlyOpenError(lastErr));
  }

  async _openOnce(log, attempt, total) {
    log && log('ble-mcsp', `gatt.connect() attempt ${attempt}/${total}…`);
    const server = await this.device.gatt.connect();
    log && log('ble-mcsp', 'connected, discovering MCSP service', MCSP_SERVICE_UUID);
    const service = await server.getPrimaryService(MCSP_SERVICE_UUID);
    this.rxChar = await service.getCharacteristic(RX_CHARACTERISTIC_UUID);
    this.txChar = await service.getCharacteristic(TX_CHARACTERISTIC_UUID);
    log && log('ble-mcsp', 'found rx/tx characteristics, starting notifications');

    this._onNotify = (event) => this._handleNotification(new Uint8Array(event.target.value.buffer));
    this.rxChar.addEventListener('characteristicvaluechanged', this._onNotify);
    await this.rxChar.startNotifications();

    await this._handshake();
  }

  _friendlyOpenError(err) {
    const m = (err && err.message) || String(err) || 'unknown error';
    if (/not paired|encryption|not authori|authentication/i.test(m)) {
      return `Bike not paired. Pair "smart system eBike" in Windows Bluetooth settings (with the bike in pairing mode), then reconnect. [${m}]`;
    }
    if (/connection attempt failed|unreachable|gatt operation failed|no longer|disconnected|not connected/i.test(m)) {
      return `Could not reach the bike over BLE. Make sure it's awake, in range, and (first time) in pairing mode, then try again — Windows BLE often needs a couple of attempts. [${m}]`;
    }
    return m;
  }

  _handleNotification(bytes) {
    const log = getDebugLog();
    const combined = concatBytes([this._segmentationRemainder, bytes]);
    const decoded = decodeSegmentationFramesWithRemainder(combined);
    this._segmentationRemainder = decoded.remainder;
    log && log('ble-rx', `notification (${bytes.length} bytes, ${decoded.frames.length} complete frame(s), ${decoded.remainder.length} trailing byte(s))`);
    for (const frame of decoded.frames) {
      log && log('ble-rx', `frame: channel=${frame.channel} endOfChannel=${frame.endOfChannel} len=${frame.payload.length}`, publicFrameLogData(frame));
      let body;
      try {
        body = reassembleSegmentationFrame(this._reassembly, frame);
      } catch (err) {
        log && log('ble-rx', err.message);
        continue;
      }
      if (!body) continue;
      if (frame.channel === Channel.MESSAGE_BUS) {
        if (this._handleInboundMobileAppRequest(body)) continue;
        try {
          this._readQueue.push(wrapMessageBusBodyForUsb(body));
        } catch (err) {
          log && log('ble-rx', err.message);
        }
      } else if (frame.channel === Channel.COMMAND) {
        this._commandsSeen.push(body);
      }
      // LBTP_PULL/PUSH and channels 4-7 not handled — not used by any plain read/RPC.
    }
  }

  // The bike addresses US as a "MobileApp" message-bus component (see the
  // MOBILE_APP_* constants above) — a plain READ/WRITE request, not a
  // response to anything we sent. Recognized by: destination high byte
  // (masked) == 0x40, and a request-shaped type (READ or WRITE, not a
  // *_RESPONSE/RPC type). Returns true if the frame was handled as such
  // (caller should not also treat it as a response to our own pending read).
  _handleInboundMobileAppRequest(body) {
    if (body.length < 5) return false;
    const reqSrcHigh = body[0];
    const reqSrcLow = body[1];
    const destHigh = body[2];
    const destLow = body[3];
    const typeSeq = body[4];
    const reqType = (typeSeq >> 4) & 0x0f;
    const seq = typeSeq & 0x0f;
    if ((destHigh & 0x7f) !== MOBILE_APP_HIGH_BYTE) return false;
    if (reqType !== MessageType.READ && reqType !== MessageType.WRITE) return false;

    const log = getDebugLog();
    let responseType;
    let payload = [];
    let status = ResponseStatus.SUCCESS;

    if (reqType === MessageType.READ) {
      responseType = MessageType.READ_RESPONSE;
      if (destLow === MOBILE_APP_LOW.MOBILE_APP_STATIC_FEATURE_PROPERTIES) {
        payload = Array.from(STATIC_FEATURE_PROPERTIES_RESPONSE);
        log && log('ble-mcsp', 'answered bike READ of MobileApp.MOBILE_APP_STATIC_FEATURE_PROPERTIES (stagedStartup=true)');
      } else {
        status = ResponseStatus.UNSUPPORTED;
        log && log('ble-mcsp', `declined bike READ of unrecognized MobileApp field 0x${destLow.toString(16)} (UNSUPPORTED)`);
      }
    } else {
      responseType = MessageType.WRITE_RESPONSE;
      if (destLow === MOBILE_APP_LOW.STARTUP_STAGE) {
        // StartupStageEnumMessage — single enum field, same single-field-varint
        // shape as every other enum-wrapper message already confirmed
        // elsewhere in this protocol. Payload here is the request's own
        // payload (after the 5-byte envelope), e.g. [0x08, stageValue].
        const stage = decodeStartupStagePayload(body.slice(5));
        if (stage === null) {
          status = ResponseStatus.MALFORMED;
          log && log('ble-mcsp', 'declined malformed bike WRITE to MobileApp.STARTUP_STAGE');
        } else {
          this.startupStage = stage;
          log && log('ble-mcsp', `bike WROTE MobileApp.STARTUP_STAGE = ${stage}${stage === STARTUP_STAGE_DONE ? ' (done)' : ''}`);
        }
      } else {
        status = ResponseStatus.UNSUPPORTED;
        log && log('ble-mcsp', `declined bike WRITE to unrecognized MobileApp field 0x${destLow.toString(16)} (UNSUPPORTED)`);
      }
    }

    const responseBody = buildMobileAppResponseBody(reqSrcHigh, reqSrcLow, destLow, responseType, seq, payload, status);
    this._writeFrame(Channel.MESSAGE_BUS, responseBody).catch(() => {});
    return true;
  }

  // Waits for the bike to report STARTUP_STAGE == 9 (its own boot-complete
  // signal) before the caller proceeds with the normal read sweep — mirrors
  // the Flow app's own behavior (DefaultBikeInitialisationIndicator), which
  // waits the same way with the same kind of bounded timeout-then-proceed
  // fallback rather than blocking forever if a bike/firmware never sends
  // this handshake at all.
  async waitForBikeReady(timeoutMs = 8000) {
    const log = getDebugLog();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.startupStage === STARTUP_STAGE_DONE) {
        log && log('ble-mcsp', 'bike reached STARTUP_STAGE=9 — proceeding');
        return;
      }
      await sleep(100);
    }
    log && log('ble-mcsp', `STARTUP_STAGE never reached 9 within ${timeoutMs}ms (last seen: ${this.startupStage}) — proceeding anyway`);
  }

  async _writeFrame(channel, payload) {
    const frame = encodeSegmentationFrame(channel, true, payload);
    const log = getDebugLog();
    log && log('ble-tx', `write: channel=${channel} len=${payload.length}`, publicFrameLogData({ channel, payload: frame }));
    if (this.txChar.writeValueWithoutResponse) {
      await this.txChar.writeValueWithoutResponse(frame);
    } else {
      await this.txChar.writeValue(frame);
    }
  }

  // Version/capability negotiation — confirmed (via decompile) to involve no
  // crypto/pairing, just this 3-step exchange. Proceeds best-effort even if
  // the bike's own ack isn't observed within the deadline: the exact ack
  // semantics are unconfirmed on real hardware, and refusing to proceed
  // would make this transport unable to even attempt a read.
  async _handshake() {
    await this._writeFrame(Channel.COMMAND, encodeCommand(CommandType.VERSION, [3]));
    await this._writeFrame(Channel.COMMAND, encodeCommand(CommandType.MAX_SEGMENTATION_PACKET, [0x02, 0x00])); // request 512
    for (const ch of [1, 2, 3, 4, 5, 6, 7]) {
      await this._writeFrame(Channel.COMMAND, encodeCommand(CommandType.DISABLE_FLOW_CONTROL, [ch]));
    }
    const log = getDebugLog();
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const sawVersion = this._commandsSeen.some((p) => p[0] === CommandType.VERSION);
      const sawMaxPacket = this._commandsSeen.some((p) => p[0] === CommandType.MAX_SEGMENTATION_PACKET);
      if (sawVersion && sawMaxPacket) {
        log && log('ble-mcsp', 'handshake ack observed (VERSION + MAX_SEGMENTATION_PACKET from bike)');
        return;
      }
      await sleep(50);
    }
    log && log('ble-mcsp', 'handshake ack NOT observed within 3s — proceeding anyway (best-effort)');
  }

  // Accepts the exact same fully-wrapped bytes buildReadRequestFrame()/
  // buildRpcCallFrame() produce for USB (`[0x30, bodyLen, ...body]`) —
  // strips that 2-byte prefix and re-wraps the same body as a proper
  // generic channel-1 segmentation frame instead of assuming the prefix is
  // already correct (it usually is, for small bodies, but this is explicit
  // rather than relying on that coincidence).
  async doMcspWrite(payload) {
    const body = payload.slice(2);
    // Rewrite the fixed USB host address (0x0e10, baked in by protocol.js) to
    // this transport's own BLE identity (MobileAppGatewaysAddresses.E_BIKE =
    // 0x4180) — see BLE_HOST_HIGH/LOW above.
    if (body.length >= 2 && body[0] === USB_HOST_HIGH && body[1] === USB_HOST_LOW) {
      body[0] = BLE_HOST_HIGH;
      body[1] = BLE_HOST_LOW;
      const log = getDebugLog();
      log && log('ble-mcsp', 'rewrote outgoing source 0x0e10 -> 0x4180 (MobileAppGatewaysAddresses.E_BIKE)');
    }
    await this._writeFrame(Channel.MESSAGE_BUS, body);
  }

  async readNextFrame(maxPolls = 50, pollDelayMs = 5) {
    for (let i = 0; i < maxPolls; i++) {
      if (this._readQueue.length) return this._readQueue.shift();
      await sleep(pollDelayMs);
    }
    return null;
  }

  async close() {
    try {
      if (this.rxChar) this.rxChar.removeEventListener('characteristicvaluechanged', this._onNotify);
    } catch (_) {}
    try {
      this.device.gatt.disconnect();
    } catch (_) {}
    clearTransportState(this);
  }
}

const browserBleMcspExports = {
  Bes3BleMcspTransport,
  requestMcspDevice,
  ADVERTISED_SERVICE_UUID,
  MCSP_SERVICE_UUID,
};

const nodeBleMcspExports = {
  Bes3BleMcspTransport,
  Channel,
  MessageType,
  MOBILE_APP_LOW,
  STARTUP_STAGE_DONE,
  STATIC_FEATURE_PROPERTIES_RESPONSE,
  MAX_REASSEMBLED_MESSAGE_BYTES,
  encodeSegmentationFrame,
  decodeSegmentationFrames,
  decodeSegmentationFramesWithRemainder,
  reassembleSegmentationFrame,
  wrapMessageBusBodyForUsb,
  publicFrameLogData,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = nodeBleMcspExports;
} else if (typeof window !== 'undefined') {
  window.Bes3BleMcsp = browserBleMcspExports;
}
