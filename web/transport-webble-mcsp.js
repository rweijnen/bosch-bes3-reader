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
// for USB. But the Flow app's own source (AddressesKt.MobileAppBrokerAddress
// = 16384 = 0x4000) uses a DIFFERENT self-identity address on BLE — 0x0e10
// may be specific to the dealer tool's own identity, not a universal "any
// client" address. If the bike's BLE-side routing only accepts requests from
// a recognized source address, using 0x0e10 here would explain exactly the
// observed symptom (boot handshake fine, every plain read/RPC silently
// ignored). Substituted at this transport's boundary only — protocol.js and
// the USB transport are untouched, so this is purely a BLE-specific
// hypothesis test, not a protocol.js change.
const BLE_HOST_HIGH = 0x40;
const BLE_HOST_LOW = 0x00;
const USB_HOST_HIGH = 0x0e; // what protocol.js hardcodes; rewritten back to this on the way in
const USB_HOST_LOW = 0x10;
// MobileAppStaticFeatureProperties: proto3 bools, field 3 = stagedStartup.
// Only the true field needs encoding (proto3 omits false/default fields):
// tag=(3<<3)|0=0x18, value=1.
const STATIC_FEATURE_PROPERTIES_RESPONSE = Uint8Array.from([0x18, 0x01]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
function decodeSegmentationFrames(buffer) {
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
    if (payloadEnd > buffer.length) break; // incomplete trailing frame — shouldn't happen, ignore
    frames.push({ channel, endOfChannel, payload: buffer.slice(payloadStart, payloadEnd) });
    offset = payloadEnd;
  }
  return frames;
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
    const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
    log && log('ble-mcsp', `device: ${this.device.name || '(unnamed)'} id=${this.device.id}`);
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
    const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
    log && log('ble-rx', `raw notification (${bytes.length} bytes)`, bytes);
    for (const frame of decodeSegmentationFrames(bytes)) {
      log && log('ble-rx', `frame: channel=${frame.channel} endOfChannel=${frame.endOfChannel} len=${frame.payload.length}`, frame.payload);
      if (frame.channel === Channel.MESSAGE_BUS && frame.endOfChannel) {
        if (this._handleInboundMobileAppRequest(frame.payload)) continue;
        // Reconstruct as the exact bytes transport-webusb.js's readNextFrame()
        // would have returned, so the existing, unmodified
        // parseReadResponseFrame() can be reused as-is. Only correct for
        // single-fragment bodies under 256 bytes — true for every plain
        // read/RPC this tool issues, but a real limitation if that ever
        // changes (e.g. a bulk/multi-field response).
        if (frame.payload.length < 256) {
          const wrapped = new Uint8Array(2 + frame.payload.length);
          wrapped[0] = 0x30;
          wrapped[1] = frame.payload.length;
          wrapped.set(frame.payload, 2);
          // Rewrite the echoed destination (our own BLE address, 0x40 0x00,
          // masked with the response-direction MSB flag) back to the fixed
          // 0x0e10 protocol.js's parseReadResponseFrame() expects as "us" —
          // see BLE_HOST_HIGH/LOW above for why these differ.
          if (wrapped.length >= 6 && (wrapped[4] & 0x7f) === BLE_HOST_HIGH) {
            wrapped[4] = 0x80 | USB_HOST_HIGH;
            wrapped[5] = USB_HOST_LOW;
          }
          this._readQueue.push(wrapped);
        }
      } else if (frame.channel === Channel.COMMAND) {
        this._commandsSeen.push(frame.payload);
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

    const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
    let responseType;
    let payload = [];

    if (reqType === MessageType.READ) {
      responseType = MessageType.READ_RESPONSE;
      if (destLow === MOBILE_APP_LOW.MOBILE_APP_STATIC_FEATURE_PROPERTIES) {
        payload = Array.from(STATIC_FEATURE_PROPERTIES_RESPONSE);
        log && log('ble-mcsp', 'answered bike READ of MobileApp.MOBILE_APP_STATIC_FEATURE_PROPERTIES (stagedStartup=true)');
      } else {
        log && log('ble-mcsp', `answered bike READ of unrecognized MobileApp field 0x${destLow.toString(16)} (empty ack)`);
      }
    } else {
      responseType = MessageType.WRITE_RESPONSE;
      if (destLow === MOBILE_APP_LOW.STARTUP_STAGE) {
        // StartupStageEnumMessage — single enum field, same single-field-varint
        // shape as every other enum-wrapper message already confirmed
        // elsewhere in this protocol. Payload here is the request's own
        // payload (after the 5-byte envelope), e.g. [0x08, stageValue].
        const stagePayload = body.slice(5);
        const stage = stagePayload.length >= 2 ? stagePayload[1] : null;
        this.startupStage = stage;
        log && log('ble-mcsp', `bike WROTE MobileApp.STARTUP_STAGE = ${stage}${stage === STARTUP_STAGE_DONE ? ' (done)' : ''}`);
      } else {
        log && log('ble-mcsp', `acked bike WRITE to unrecognized MobileApp field 0x${destLow.toString(16)}`);
      }
    }

    const responseBody = [
      MOBILE_APP_HIGH_BYTE,          // srcHigh: us, unflagged
      destLow,                        // srcLow: echo which field this was about
      0x80 | (reqSrcHigh & 0x7f),    // destHigh: echo requester, implicit-success flag set
      reqSrcLow,                      // destLow: echo requester's own low byte
      ((responseType & 0x0f) << 4) | (seq & 0x0f),
      ...payload,
    ];
    this._writeFrame(Channel.MESSAGE_BUS, Uint8Array.from(responseBody)).catch(() => {});
    return true;
  }

  // Waits for the bike to report STARTUP_STAGE == 9 (its own boot-complete
  // signal) before the caller proceeds with the normal read sweep — mirrors
  // the Flow app's own behavior (DefaultBikeInitialisationIndicator), which
  // waits the same way with the same kind of bounded timeout-then-proceed
  // fallback rather than blocking forever if a bike/firmware never sends
  // this handshake at all.
  async waitForBikeReady(timeoutMs = 8000) {
    const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
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
    const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
    log && log('ble-tx', `write: channel=${channel} len=${payload.length}`, frame);
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
    const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
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
    // this transport's own BLE identity (MobileAppBrokerAddress = 0x4000) —
    // see BLE_HOST_HIGH/LOW above.
    if (body.length >= 2 && body[0] === USB_HOST_HIGH && body[1] === USB_HOST_LOW) {
      body[0] = BLE_HOST_HIGH;
      body[1] = BLE_HOST_LOW;
      const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
      log && log('ble-mcsp', 'rewrote outgoing source 0x0e10 -> 0x4000 (MobileAppBrokerAddress)');
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
  }
}

window.Bes3BleMcsp = { Bes3BleMcspTransport, requestMcspDevice, ADVERTISED_SERVICE_UUID, MCSP_SERVICE_UUID };
