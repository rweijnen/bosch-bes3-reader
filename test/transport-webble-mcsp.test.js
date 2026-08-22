const test = require('node:test');
const assert = require('node:assert/strict');

const {
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
} = require('../web/transport-webble-mcsp.js');

const {
  isAllowedBleValidationCommand,
  isAllowedOutboundBleValidationMessageBusBody,
  isAllowedBikeOriginatedStartupRequest,
  isAllowedMobileAppStartupResponse,
  isAllowedBleValidationOperation,
  CommandType,
  Direction,
} = require('../src/ble-validation-allowlist.js');
const { parseReadResponseFrame } = require('../src/protocol.js');

function bytes(values) {
  return Uint8Array.from(values);
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function responseBody({ src = 0x1817, destHigh = 0xc1, destLow = 0x80, type = MessageType.READ_RESPONSE, seq = 1, payload = [] } = {}) {
  return bytes([
    (src >> 8) & 0xff,
    src & 0xff,
    destHigh,
    destLow,
    ((type & 0x0f) << 4) | (seq & 0x0f),
    ...payload,
  ]);
}

function makeTransport(logs = []) {
  global.window = {
    Bes3DebugLog: {
      log(category, message, data) {
        logs.push({ category, message, data });
      },
    },
  };
  const writes = [];
  const transport = new Bes3BleMcspTransport({
    gatt: { disconnect() {} },
  });
  transport.txChar = {
    async writeValueWithoutResponse(frame) {
      writes.push(frame);
    },
  };
  return { transport, writes };
}

test('segmentation encode/decode is deterministic and decodes packed frames', () => {
  const a = encodeSegmentationFrame(Channel.MESSAGE_BUS, false, bytes([1, 2, 3]));
  const b = encodeSegmentationFrame(Channel.COMMAND, true, bytes([4]));
  assert.deepEqual(Array.from(a), [0x20, 0x03, 1, 2, 3]);
  assert.deepEqual(Array.from(b), [0x10, 0x01, 4]);

  const frames = decodeSegmentationFrames(concat(a, b));
  assert.equal(frames.length, 2);
  assert.equal(frames[0].channel, Channel.MESSAGE_BUS);
  assert.equal(frames[0].endOfChannel, false);
  assert.deepEqual(Array.from(frames[0].payload), [1, 2, 3]);
  assert.equal(frames[1].channel, Channel.COMMAND);
  assert.equal(frames[1].endOfChannel, true);
  assert.deepEqual(Array.from(frames[1].payload), [4]);
});

test('incomplete trailing segmentation bytes are retained for the caller', () => {
  const complete = encodeSegmentationFrame(Channel.COMMAND, true, bytes([0x01, 0x03]));
  const partial = encodeSegmentationFrame(Channel.MESSAGE_BUS, true, bytes([9, 8, 7])).slice(0, 4);
  const decoded = decodeSegmentationFramesWithRemainder(concat(complete, partial));
  assert.equal(decoded.frames.length, 1);
  assert.deepEqual(Array.from(decoded.remainder), Array.from(partial));
});

test('multi-notification channel reassembly preserves response body bytes exactly', async () => {
  const { transport } = makeTransport();
  const body = responseBody({ payload: [0xaa, 0xbb, 0xcc, 0xdd] });

  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, false, body.slice(0, 4)));
  assert.equal(transport._readQueue.length, 0);
  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, true, body.slice(4)));

  assert.equal(transport._readQueue.length, 1);
  assert.deepEqual(Array.from(await transport.readNextFrame(1, 0)), Array.from(wrapMessageBusBodyForUsb(body)));
});

test('reassembled MessageBus bodies over 255 bytes use the 12-bit MCSP length and parse correctly', async () => {
  const { transport } = makeTransport();
  const payload = Array.from({ length: 300 }, (_, i) => i & 0xff);
  const body = responseBody({ payload });

  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, false, body.slice(0, 200)));
  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, true, body.slice(200)));

  const wrapped = await transport.readNextFrame(1, 0);
  assert.equal(wrapped[0], 0x31);
  assert.equal(wrapped[1], 0x31);
  const parsed = parseReadResponseFrame(wrapped);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 0);
  assert.deepEqual(Array.from(parsed.payload), payload);
});

test('trailing notification bytes are completed by the next notification', () => {
  const { transport } = makeTransport();
  const body = responseBody({ payload: [0x55] });
  const frame = encodeSegmentationFrame(Channel.MESSAGE_BUS, true, body);
  transport._handleNotification(frame.slice(0, 3));
  assert.equal(transport._readQueue.length, 0);
  assert.deepEqual(Array.from(transport._segmentationRemainder), Array.from(frame.slice(0, 3)));

  transport._handleNotification(frame.slice(3));
  assert.deepEqual(Array.from(transport._readQueue[0]), Array.from(wrapMessageBusBodyForUsb(body)));
  assert.equal(transport._segmentationRemainder.length, 0);
});

test('address translation rewrites BLE host to USB host while preserving destination status MSB', () => {
  const ok = wrapMessageBusBodyForUsb(responseBody({ destHigh: 0xc1, destLow: 0x80, payload: [0x01] }));
  assert.deepEqual(Array.from(ok.slice(4, 6)), [0x8e, 0x10]);

  const explicitStatus = wrapMessageBusBodyForUsb(responseBody({ destHigh: 0x41, destLow: 0x80, payload: [0x06] }));
  assert.deepEqual(Array.from(explicitStatus.slice(4, 7)), [0x0e, 0x10, 0x11]);
  assert.deepEqual(parseReadResponseFrame(explicitStatus), {
    addrHigh: 0x18,
    addrLow: 0x17,
    type: MessageType.READ_RESPONSE,
    seq: 1,
    status: 0x06,
    statusName: 'DENIED',
    ok: false,
    payload: bytes([]),
  });
});

test('address translation preserves non-host 0x41xx destinations byte-for-byte', () => {
  for (const destLow of [0x7f, 0x81]) {
    for (const destHigh of [0x41, 0xc1]) {
      const body = responseBody({ destHigh, destLow, payload: [0x01] });
      const wrapped = wrapMessageBusBodyForUsb(body);
      assert.deepEqual(Array.from(wrapped.slice(2)), Array.from(body));
    }
  }
});

test('MobileApp READ 0x40AA returns stagedStartup=true', async () => {
  const { transport, writes } = makeTransport();
  const request = bytes([0x21, 0x06, 0x40, MOBILE_APP_LOW.MOBILE_APP_STATIC_FEATURE_PROPERTIES, 0x03]);
  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, true, request));
  await Promise.resolve();

  const written = decodeSegmentationFrames(writes[0])[0].payload;
  assert.deepEqual(Array.from(written), [
    0x40,
    MOBILE_APP_LOW.MOBILE_APP_STATIC_FEATURE_PROPERTIES,
    0xa1,
    0x06,
    0x13,
    ...STATIC_FEATURE_PROPERTIES_RESPONSE,
  ]);
});

test('MobileApp WRITE 0x40A9 is acknowledged and tracks startup stage', async () => {
  const { transport, writes } = makeTransport();
  const request = bytes([0x21, 0x06, 0x40, MOBILE_APP_LOW.STARTUP_STAGE, 0x24, 0x08, STARTUP_STAGE_DONE]);
  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, true, request));
  await Promise.resolve();

  assert.equal(transport.startupStage, STARTUP_STAGE_DONE);
  const written = decodeSegmentationFrames(writes[0])[0].payload;
  assert.deepEqual(Array.from(written), [0x40, MOBILE_APP_LOW.STARTUP_STAGE, 0xa1, 0x06, 0x34]);
});

test('unrecognized MobileApp READ and WRITE return explicit UNSUPPORTED without changing startup stage', async () => {
  const { transport, writes } = makeTransport();
  transport.startupStage = 3;

  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, true, bytes([0x21, 0x06, 0x40, 0x81, 0x05])));
  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, true, bytes([0x21, 0x06, 0x40, 0x82, 0x26, 0x08, 0x01])));
  await Promise.resolve();

  assert.equal(transport.startupStage, 3);
  assert.deepEqual(Array.from(decodeSegmentationFrames(writes[0])[0].payload), [0x40, 0x81, 0x21, 0x06, 0x15, 0x04]);
  assert.deepEqual(Array.from(decodeSegmentationFrames(writes[1])[0].payload), [0x40, 0x82, 0x21, 0x06, 0x36, 0x04]);
});

test('malformed STARTUP_STAGE writes return MALFORMED and do not mutate stage', async () => {
  const { transport, writes } = makeTransport();
  transport.startupStage = 2;

  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, true, bytes([0x21, 0x06, 0x40, MOBILE_APP_LOW.STARTUP_STAGE, 0x27, 0x09, STARTUP_STAGE_DONE])));
  await Promise.resolve();

  assert.equal(transport.startupStage, 2);
  assert.deepEqual(Array.from(decodeSegmentationFrames(writes[0])[0].payload), [0x40, MOBILE_APP_LOW.STARTUP_STAGE, 0x21, 0x06, 0x37, 0x08]);
});

test('malformed frames, bodies over 4095 bytes, and bounded oversize reassembly are rejected', () => {
  const logs = [];
  const { transport } = makeTransport(logs);
  transport._handleNotification(bytes([0x20, 0x05, 0x01]));
  assert.equal(transport._readQueue.length, 0);
  assert.equal(transport._segmentationRemainder.length, 3);

  transport._segmentationRemainder = bytes([]);
  const overFrameMax = bytes(new Array(4096).fill(0xaa));
  overFrameMax.set(responseBody(), 0);
  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, false, overFrameMax.slice(0, 4095)));
  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, true, overFrameMax.slice(4095)));
  assert.equal(transport._readQueue.length, 0);
  assert.ok(logs.some((entry) => /too large/.test(entry.message)));
  assert.throws(() => wrapMessageBusBodyForUsb(bytes(new Array(4096).fill(0))), /too large/);

  const state = {};
  assert.throws(() => {
    reassembleSegmentationFrame(state, { channel: Channel.MESSAGE_BUS, endOfChannel: false, payload: bytes(new Array(MAX_REASSEMBLED_MESSAGE_BYTES + 1).fill(0)) });
  }, /reassembly exceeded/);
});

test('close resets disconnect state', async () => {
  const { transport } = makeTransport();
  transport._readQueue.push(bytes([1]));
  transport._commandsSeen.push(bytes([2]));
  transport._segmentationRemainder = bytes([3]);
  transport._reassembly[Channel.MESSAGE_BUS] = [bytes([4])];
  transport.startupStage = 4;

  await transport.close();
  assert.deepEqual(transport._readQueue, []);
  assert.deepEqual(transport._commandsSeen, []);
  assert.equal(transport._segmentationRemainder.length, 0);
  assert.deepEqual(transport._reassembly, {});
  assert.equal(transport.startupStage, null);
});

test('privacy logging omits device metadata and payloads by default', async () => {
  const logs = [];
  const { transport } = makeTransport(logs);
  const sensitiveDeviceMarker = ['sensitive', 'device', 'marker'].join('-');
  const sensitiveDeviceLabel = ['Sensitive', 'Bike', 'Label'].join(' ');
  const sensitivePayload = ['SENSITIVE', 'PAYLOAD', 'MARKER'].join('-');
  transport.device = {
    id: sensitiveDeviceMarker,
    name: sensitiveDeviceLabel,
    gatt: {
      connect: async () => ({
        getPrimaryService: async () => ({
          getCharacteristic: async () => ({
            addEventListener() {},
            removeEventListener() {},
            startNotifications: async () => {},
            writeValueWithoutResponse: async () => {},
          }),
        }),
      }),
      disconnect() {},
    },
  };
  transport._handshake = async () => {};
  await transport.open();
  transport._handleNotification(encodeSegmentationFrame(Channel.MESSAGE_BUS, true, bytes([0x00, 0x01, 0xc1, 0x80, 0x10, ...Buffer.from(sensitivePayload) ])));

  const rendered = JSON.stringify(logs);
  assert.equal(rendered.includes(sensitiveDeviceMarker), false);
  assert.equal(rendered.includes(sensitiveDeviceLabel), false);
  assert.equal(rendered.includes(sensitivePayload), false);
  assert.equal(logs.some((entry) => entry.category === 'ble-rx' && entry.data instanceof Uint8Array), false);
});

test('identification and unknown message-bus payloads are not public log data', () => {
  global.window = { Bes3BleMcspFrameLogging: true };
  assert.equal(publicFrameLogData({ channel: Channel.MESSAGE_BUS, payload: bytes([0x00, 0x01, 0xc1, 0x80, 0x10, 1, 2]) }), '[omitted message-bus payload]');
  assert.equal(publicFrameLogData({ channel: Channel.MESSAGE_BUS, payload: bytes([1, 2]) }), '[omitted message-bus payload]');
});

test('read-only BLE validation allowlist permits only Gate A operations', () => {
  assert.equal(isAllowedBleValidationCommand(bytes([CommandType.VERSION, 0x03])), true);
  assert.equal(isAllowedBleValidationCommand(bytes([CommandType.ADVANCE_TRANSMIT_WINDOW, 0x01])), false);

  const read1817 = bytes([0x41, 0x80, 0x98, 0x17, 0x01]);
  const read1842 = bytes([0x41, 0x80, 0x98, 0x42, 0x01]);
  const read187d = bytes([0x41, 0x80, 0x98, 0x7d, 0x01]);
  const read181e = bytes([0x41, 0x80, 0x98, 0x1e, 0x01]);
  const write1842 = bytes([0x41, 0x80, 0x98, 0x42, 0x21, 0x01]);
  const rpc1093 = bytes([0x41, 0x80, 0x90, 0x93, 0x41]);
  const reset224fWrite = bytes([0x41, 0x80, 0xa2, 0x4f, 0x21, 0x01]);
  const reset224fRpc = bytes([0x41, 0x80, 0xa2, 0x4f, 0x41]);
  const startupWriteFromBike = bytes([0x21, 0x06, 0x40, MOBILE_APP_LOW.STARTUP_STAGE, 0x24, 0x08, STARTUP_STAGE_DONE]);
  const startupWriteResponse = bytes([0x40, MOBILE_APP_LOW.STARTUP_STAGE, 0xa1, 0x06, 0x34]);
  const unknownRead = bytes([0x41, 0x80, 0x99, 0x99, 0x01]);
  const unknownChannel = { channel: 7, payload: bytes([0x01]) };

  assert.equal(isAllowedOutboundBleValidationMessageBusBody(read1817), true);
  assert.equal(isAllowedOutboundBleValidationMessageBusBody(read1842), true);
  assert.equal(isAllowedOutboundBleValidationMessageBusBody(read187d), true);
  assert.equal(isAllowedOutboundBleValidationMessageBusBody(read181e), true);
  assert.equal(isAllowedOutboundBleValidationMessageBusBody(write1842), false);
  assert.equal(isAllowedOutboundBleValidationMessageBusBody(rpc1093), false);
  assert.equal(isAllowedOutboundBleValidationMessageBusBody(reset224fWrite), false);
  assert.equal(isAllowedOutboundBleValidationMessageBusBody(reset224fRpc), false);
  assert.equal(isAllowedOutboundBleValidationMessageBusBody(startupWriteFromBike), false);
  assert.equal(isAllowedOutboundBleValidationMessageBusBody(unknownRead), false);
  assert.equal(isAllowedBikeOriginatedStartupRequest(startupWriteFromBike), true);
  assert.equal(isAllowedMobileAppStartupResponse(startupWriteResponse), true);
  assert.equal(isAllowedBleValidationOperation({ channel: Channel.MESSAGE_BUS, messageType: MessageType.READ, address: 0x1842 }), true);
  assert.equal(isAllowedBleValidationOperation({ channel: Channel.MESSAGE_BUS, messageType: MessageType.RPC, address: 0x1093 }), false);
  assert.equal(isAllowedBleValidationOperation({ channel: Channel.MESSAGE_BUS, body: startupWriteFromBike }), false);
  assert.equal(isAllowedBleValidationOperation({ direction: Direction.BIKE_ORIGINATED_STARTUP, channel: Channel.MESSAGE_BUS, body: startupWriteFromBike }), true);
  assert.equal(isAllowedBleValidationOperation(unknownChannel), false);
  assert.equal(isAllowedBleValidationOperation(null), false);
});
