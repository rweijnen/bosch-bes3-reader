// Pure protocol logic for Bosch Smart System (BES3) "MCSP"/MessageBus reads.
// No Node/USB-specific code here on purpose — this file (and addresses.js)
// are reusable as-is from a future browser/WebUSB tool.
//
// The message-bus frame layout (confirmed from the actual Bosch codec,
// com.bosch.ebike.messagebus.message.MessageDecodingKt), carried inside an
// MCSP `0x30` block read/write:
//
//   byte[0..1]  source address (16-bit, MSB-flagged, see below)
//   byte[2..3]  destination address (16-bit, MSB-flagged)
//   byte[4]     (type << 4) | (sequence & 0x0F)   <-- NOT a free-running byte!
//   byte[5]     explicit ResponseMessageStatusCode  <-- present only if
//               the destination-address MSB is CLEAR
//   ...         payload (only for types that carry one)
//
// Address MSB convention: only the low 15 bits of each 16-bit address field
// are the real address (ADDRESS_MASK_BIT = 0x7FFF); the top bit is a flag.
// For the destination field: MSB set -> implicit SUCCESS, no status byte;
// MSB clear -> an explicit ResponseMessageStatusCode byte follows at offset 5.
// (For the source field, MSB set flags an unsolicited NotifyMessage/push —
// a different shape entirely, not handled here.)
//
// Our own message-bus address (the "source" on every outgoing request) is
// fixed: 0x0e10 (2064) — this is the literal origin of the `0e 10` bytes
// that looked like a constant preamble in every captured request; they're
// just our own node address, unchanging because we always send from the
// same logical node.
//
// MessageType raw values (com.bosch.ebike.messagebus.constants.MessageType):
//   READ=0  READ_RESPONSE=1  WRITE=2  WRITE_RESPONSE=3  RPC=4  RPC_RESPONSE=5
//   SUBSCRIBE=6  SUBSCRIBE_RESPONSE=7  UNSUBSCRIBE=8  UNSUBSCRIBE_RESPONSE=9
// Response type is always request type + 1.
//
// IMPORTANT BUG FIX (see private research notes for the full writeup): an
// earlier version of this file built the trailing byte as a free-running
// counter (1, 2, 3, ... 0xFF) with no fixed type field. Since that byte is
// actually (type<<4)|seq, roughly 15 out of 16 requests were accidentally
// encoded as WRITE/SUBSCRIBE/UNSUBSCRIBE/etc. instead of READ, causing
// exactly the "same address works on one run, times out on the next"
// flakiness previously misdiagnosed as a session-priming issue. Fixed here:
// the type nibble is always forced to the correct value; only the low
// nibble (0-15) is a real, wrapping sequence counter.
//
// ResponseMessageStatusCode raw values:
//   SUCCESS=0  OVERLOADED=1  NO_ROUTE_FOUND=2  NOT_READY=3  UNSUPPORTED=4
//   DENIED=6  INVALID_VALUE=7  MALFORMED=8  TIMEOUT=9  TOO_LARGE=10

(function () {
const BLOCK_OP = 0x30; // MCSP "block read" op byte
const HOST_ADDRESS = 0x0e10; // our own fixed message-bus node address

const MessageType = {
  READ: 0,
  READ_RESPONSE: 1,
  WRITE: 2,
  WRITE_RESPONSE: 3,
  RPC: 4,
  RPC_RESPONSE: 5,
  SUBSCRIBE: 6,
  SUBSCRIBE_RESPONSE: 7,
  UNSUBSCRIBE: 8,
  UNSUBSCRIBE_RESPONSE: 9,
};

const STATUS_CODES = {
  0: 'SUCCESS',
  1: 'OVERLOADED',
  2: 'NO_ROUTE_FOUND',
  3: 'NOT_READY',
  4: 'UNSUPPORTED',
  6: 'DENIED',
  7: 'INVALID_VALUE',
  8: 'MALFORMED',
  9: 'TIMEOUT',
  10: 'TOO_LARGE',
};
function statusCodeName(byte) {
  return STATUS_CODES[byte] || `UNKNOWN_ERROR(${byte})`;
}

function encodeVarint(n) {
  const bytes = [];
  let v = n >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v > 0) b |= 0x80;
    bytes.push(b);
  } while (v > 0);
  return bytes;
}

// Builds a message-bus frame for a given address and MessageType, wrapped in
// the MCSP 0x30 block. `seq` is masked to 4 bits (the real sequence range);
// `payload` (a plain array of bytes) is appended for types that carry one
// (e.g. an RPC call argument) — omit/empty for plain reads.
function buildFrame(addr, type, seq, payload) {
  const highByte = (addr >> 8) & 0xff;
  const lowByte = addr & 0xff;
  const marker = 0x80 | highByte; // destination address, MSB always set on outgoing requests (confirmed convention, distinct from the response-side MSB meaning above)
  const varint = encodeVarint(lowByte);
  const typeSeq = ((type & 0x0f) << 4) | (seq & 0x0f);
  const body = [0x0e, 0x10, marker, ...varint, typeSeq, ...(payload || [])];
  return Uint8Array.from([BLOCK_OP, body.length, ...body]);
}

// Plain read request (MessageType.READ) — the common case, used by the
// address sweep for every `readable: true` data point.
function buildReadRequestFrame(addr, seq) {
  return buildFrame(addr, MessageType.READ, seq);
}

// Plain write (MessageType.WRITE) — a WritableDataPoint, confirmed via
// Flow's MessageEncodingKt.encodeMessage to use the identical frame shape
// as a read/RPC, just with type=WRITE and the new value as payload. Used
// for START_ASSIST_MODE_CONFIGURATION (addr 6180) — this tool's second,
// equally narrow write, alongside RESET_UDAM_VALUES.
function buildWriteFrame(addr, seq, payload) {
  return buildFrame(addr, MessageType.WRITE, seq, payload);
}

// Encodes a single-field protobuf enum value (field 1, varint) — the wire
// shape of StartAssistModePositionEnumMessage (writeEnum(1, value), which
// is plain varint encoding, same as any int field). Reusable for any other
// single-enum WritableDataPoint with the same shape.
function encodeEnumArg(value) {
  return [0x08, ...encodeVarint(value)];
}

// Argument-less RPC call (MessageType.RPC) — used for the session keep-alive
// (RemoteControlAddresses.RESET_INACTIVITY_SHUTDOWN_TIMER) and any other
// ArgumentLessCallableDataPoint.
function buildRpcCallFrame(addr, seq) {
  return buildFrame(addr, MessageType.RPC, seq);
}

// RPC call carrying a protobuf-encoded argument (CallableDataPoint<Arg, Result>,
// e.g. GET_ASSIST_MODE_STATISTICS(ConfigId) -> AssistModeStatistics — confirmed
// via decompile of com.bosch.ebike.diagnostic.adapter.bike3.core.Bes3BduAdapterImpl).
function buildRpcCallFrameWithArg(addr, seq, argPayload) {
  return buildFrame(addr, MessageType.RPC, seq, argPayload);
}

// Encodes a Bosch `ConfigId` protobuf message ({ value: string }, field 1,
// length-delimited) — the argument type for GET_ASSIST_MODE_STATISTICS and
// several other per-mode RPCs (GET_ASSIST_MODE_INFORMATION, udam values/defaults).
// Confirmed shape from com.bosch.ebike.bes3.messagebus.ConfigId (decompiled);
// confirmed usage as a decimal-string mode index from
// BduAssistModeReader.getOffModeDistance$eds_adapter_bike3_core, which hardcodes
// ConfigId.newBuilder().setValue("0") for the off/no-assist/walk mode. The
// indices for the other (configurable) assist levels follow Bosch's
// conventional 1-4 numbering but are NOT independently confirmed from
// decompile — treat results for those as provisional until checked against a
// real bike's own display/app.
function encodeConfigIdArg(idString) {
  const strBytes = Array.from(new TextEncoder().encode(String(idString)));
  return [0x0a, ...encodeVarint(strBytes.length), ...strBytes];
}

// Decodes a Bosch `AssistModeStatistics` protobuf message: field 1 = distance
// (uint32, meters — same unit as ODOMETER), field 2 = consumedEnergy (uint32,
// unit not confirmed from decompile — plausibly Wh, not independently
// verified). Confirmed field shape from
// com.bosch.ebike.bes3.messagebus.AssistModeStatistics (decompiled).
function decodeAssistModeStatistics(payload) {
  let i = 0;
  let distance = null;
  let consumedEnergy = null;
  while (i < payload.length) {
    const tag = payload[i];
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x7;
    i += 1;
    if (wireType !== 0) break; // both fields are varints — anything else, stop rather than misparse
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = payload[i];
      i += 1;
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    const value = result >>> 0;
    if (fieldNum === 1) distance = value;
    else if (fieldNum === 2) consumedEnergy = value;
  }
  return { distance, consumedEnergy };
}

// Parses a raw MCSP frame (as received from the reader loop) into a
// structured result, or null if it doesn't look like a message-bus
// read/RPC response at all (e.g. the bundled multi-field identify block,
// which has a different shape, or a NotifyMessage/push).
function parseReadResponseFrame(bytes) {
  if (!bytes || bytes.length < 2 || bytes[0] !== BLOCK_OP) return null;
  const len = bytes[1];
  const body = bytes.slice(2, 2 + len);
  if (body.length < 5) return null;

  const srcHigh = body[0];
  const srcLow = body[1];
  const destHigh = body[2];
  // destLow = body[3]; // unused — destination is always our own echoed address
  const typeSeq = body[4];

  if (srcHigh & 0x80) return null; // source MSB set = unsolicited NotifyMessage, different shape
  if ((destHigh & 0x7f) !== ((HOST_ADDRESS >> 8) & 0x7f)) return null; // not addressed back to us

  const destMsbSet = !!(destHigh & 0x80);
  const type = (typeSeq >> 4) & 0x0f;
  const seq = typeSeq & 0x0f;

  let statusByte = 0; // SUCCESS, implicit
  let payloadStart = 5;
  if (!destMsbSet) {
    statusByte = body[5];
    payloadStart = 6;
  }

  return {
    addrHigh: srcHigh & 0x7f,
    addrLow: srcLow,
    type,
    seq,
    status: statusByte,
    statusName: statusCodeName(statusByte),
    ok: statusByte === 0,
    payload: body.slice(payloadStart),
  };
}

function isPrintableAscii(bytes) {
  if (bytes.length === 0) return false;
  for (const b of bytes) {
    if (b < 0x20 || b > 0x7e) return false;
  }
  return true;
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

// TextDecoder is available in both browsers and modern Node — keeps this
// file free of Node-only APIs (no `Buffer`) so it works unchanged in a
// WebUSB page.
function decodeUtf8(bytes) {
  return new TextDecoder('utf-8').decode(Uint8Array.from(bytes));
}

// Best-effort generic decode, used only as a fallback when messageTypes.js
// has no confirmed type for this address. Never presented as exact — see
// messageTypes.js for fields whose wire format has actually been verified.
function decodeValue(payload) {
  if (!payload || payload.length === 0) {
    return { kind: 'empty', value: null, display: '(empty)' };
  }
  // Protobuf-style: tag 0x0a (field 1, length-delimited) + len + bytes
  if (payload[0] === 0x0a && payload.length >= 2) {
    const strLen = payload[1];
    const content = payload.slice(2, 2 + strLen);
    if (content.length === strLen && isPrintableAscii(content)) {
      const str = decodeUtf8(content);
      return { kind: 'string', value: str, display: str };
    }
    return { kind: 'bytes', value: toHex(content), display: `hex: ${toHex(content)}` };
  }
  // Short raw payload with no protobuf tag — dump as hex, and as a little-endian
  // integer if it's 1-4 bytes (many enums/booleans/uint16s show up this way).
  if (payload.length <= 4) {
    let n = 0;
    for (let i = payload.length - 1; i >= 0; i--) n = n * 256 + payload[i];
    return { kind: 'raw', value: toHex(payload), display: `hex: ${toHex(payload)}  (as uint: ${n})` };
  }
  if (isPrintableAscii(payload)) {
    const str = decodeUtf8(payload);
    return { kind: 'string', value: str, display: str };
  }
  return { kind: 'raw', value: toHex(payload), display: `hex: ${toHex(payload)}` };
}

// Decodes a Bosch `AssistModeInformation` protobuf message — the response
// to GET_ASSIST_MODE_INFORMATION(ConfigId), the RPC that returns a mode's
// actual display name (field 1 = ApplicationIdentifier submessage, skipped
// here; field 2 = nameShort string; field 3 = nameLong string; field 4 =
// color uint32; field 5 = assistModePosition enum ordinal; field 6/7 =
// userAdjustable/userAdjusted bool). Confirmed field shape from
// com.bosch.ebike.bes3.messagebus.AssistModeInformation (decompiled).
function decodeAssistModeInformation(payload) {
  let i = 0;
  const out = { nameShort: null, nameLong: null, color: null, assistModePosition: null, userAdjustable: null, userAdjusted: null };
  while (i < payload.length) {
    const tag = payload[i];
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x7;
    i += 1;
    if (wireType === 0) {
      let result = 0;
      let shift = 0;
      for (;;) {
        const b = payload[i];
        i += 1;
        result |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      const value = result >>> 0;
      if (fieldNum === 4) out.color = value;
      else if (fieldNum === 5) out.assistModePosition = value;
      else if (fieldNum === 6) out.userAdjustable = !!value;
      else if (fieldNum === 7) out.userAdjusted = !!value;
    } else if (wireType === 2) {
      let len = 0;
      let shift = 0;
      for (;;) {
        const b = payload[i];
        i += 1;
        len |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      const content = payload.slice(i, i + len);
      i += len;
      if (fieldNum === 2) out.nameShort = decodeUtf8(content);
      else if (fieldNum === 3) out.nameLong = decodeUtf8(content);
      // field 1 (identifier submessage) intentionally not parsed — not needed for a display name
    } else {
      break;
    }
  }
  return out;
}

// Decodes `ArrayOf4ActiveAssistModeIdentifier` (ACTIVE_ASSIST_MODES) —
// `repeated ConfigId value = 1`, i.e. each top-level field-1 entry wraps its
// OWN nested field-1 string (ConfigId{value: string}). Confirmed shape from
// Flow's decompiled source (com.bosch.ebike.bes3.messagebus.
// ArrayOf4ActiveAssistModeIdentifier) — this is the actual list of per-mode
// ConfigId argument strings the bike expects for GET_ASSIST_MODE_STATISTICS/
// GET_ASSIST_MODE_INFORMATION; they are NOT simply "1".."4" (that was an
// unconfirmed guess in an earlier version of this file that a real hardware
// test proved wrong — see RESEARCH.md).
function decodeConfigIdList(payload) {
  const ids = [];
  let i = 0;
  while (i < payload.length) {
    const tag = payload[i];
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x7;
    i += 1;
    if (wireType !== 2) break; // only field 1 (length-delimited submessages) expected
    let len = 0;
    let shift = 0;
    for (;;) {
      const b = payload[i];
      i += 1;
      len |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    const entry = payload.slice(i, i + len);
    i += len;
    if (fieldNum !== 1) continue;
    // entry should itself be a ConfigId message: field 1 (tag 0x0a), varint
    // len, utf8 bytes. Parse that one level in; if it doesn't look like a
    // valid nested tag, fall back to treating `entry` as the raw string
    // directly (defensive — covers a single-entry capture seen where the
    // nesting looked flatter than the confirmed proto shape predicts).
    if (entry.length >= 2 && entry[0] === 0x0a) {
      const innerLen = entry[1];
      const inner = entry.slice(2, 2 + innerLen);
      if (inner.length === innerLen) {
        ids.push(decodeUtf8(inner));
        continue;
      }
    }
    ids.push(decodeUtf8(entry));
  }
  return ids;
}

// Decodes a Bosch `UdamParams` protobuf message — the response to
// GET_UDAM_VALUES(ConfigId)/GET_UDAM_DEFAULT_VALUES(ConfigId), the per-mode
// assist parameters (confirmed from decompile of
// com.bosch.ebike.bes3.messagebus.UdamParams): field 1 = assistLevel
// (uint32), field 2 = maximumMotorTorque (uint32), field 3 =
// accelerationResponse (uint32), field 4 = maximumBikeSpeed (uint32),
// field 5 = maximumMotorPower (uint32), field 6 = extendedBoost (uint32,
// proto3 optional), field 7 = tractionControl (uint32, proto3 optional),
// field 8 = driveTrainTensioner (bool, proto3 optional). Only
// assistLevel/accelerationResponse/maximumBikeSpeed have a confirmed
// normalization factor (÷100, from MessageBus.DriveUnit.Companion's
// normalizeUdamParams* helpers) — the rest are returned as raw ints/bool,
// undecoded, rather than guessing a unit/scale.
function decodeUdamParams(payload) {
  const out = {
    assistLevel: null, maximumMotorTorque: null, accelerationResponse: null,
    maximumBikeSpeed: null, maximumMotorPower: null, extendedBoost: null,
    tractionControl: null, driveTrainTensioner: null,
  };
  let i = 0;
  while (i < payload.length) {
    const tag = payload[i];
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x7;
    i += 1;
    if (wireType !== 0) break; // every field here is a varint (uint32 or bool)
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = payload[i];
      i += 1;
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    const value = result >>> 0;
    switch (fieldNum) {
      case 1: out.assistLevel = value; break;
      case 2: out.maximumMotorTorque = value; break;
      case 3: out.accelerationResponse = value; break;
      case 4: out.maximumBikeSpeed = value; break;
      case 5: out.maximumMotorPower = value; break;
      case 6: out.extendedBoost = value; break;
      case 7: out.tractionControl = value; break;
      case 8: out.driveTrainTensioner = !!value; break;
      default: break;
    }
  }
  return out;
}

// Decodes the plain `bool` response of RESET_UDAM_VALUES(ConfigId) — proto3
// bool, field 1, omitted entirely (i.e. empty payload) when false.
function decodeBoolResponse(payload) {
  if (!payload || payload.length === 0) return false;
  const tag = payload[0];
  if ((tag >>> 3) !== 1 || (tag & 0x7) !== 0) return false;
  return !!payload[1];
}

const protocolExports = {
  MessageType,
  encodeVarint,
  buildFrame,
  buildReadRequestFrame,
  buildWriteFrame,
  encodeEnumArg,
  buildRpcCallFrame,
  buildRpcCallFrameWithArg,
  encodeConfigIdArg,
  decodeAssistModeStatistics,
  decodeAssistModeInformation,
  decodeConfigIdList,
  decodeUdamParams,
  decodeBoolResponse,
  parseReadResponseFrame,
  statusCodeName,
  decodeValue,
  toHex,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = protocolExports;
} else if (typeof window !== 'undefined') {
  window.Bes3Protocol = protocolExports;
}
})();
