// Pure protocol logic for Bosch Smart System (BES3) "MCSP" reads (DriveUnit
// component). No Node/USB-specific code here on purpose — this file (and
// addresses.js) are reusable as-is from a future browser/WebUSB tool.
//
// Confirmed encoding for a plain "readable data point" request:
//   request  MCSP frame: 30 <len> 0e 10 98 <addrLowVarint...> <seq>
//   response MCSP frame: 30 <len> 18 <addrLowEcho> 8e 10 <seq+0x10> <payload...>
// Only addresses whose high byte is 0x18 (readable data points, ~6144-6399) are
// known to work with this request shape. The 0x10xx range (callable RPCs, e.g.
// READ_UDAM_VALUES) needs an argument and a different invocation we have not
// cracked yet — callers should skip those (see isSimpleReadable).

const READ_OPCODE = 0x98;      // "read one data point" sub-opcode (request)
const READ_RESPONSE_MARKER = 0x18; // same sub-opcode with the request bit cleared
const RESPONSE_FIXED = [0x8e, 0x10]; // constant bytes seen in every read response
const BLOCK_OP = 0x30;         // MCSP "block read" op byte

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

function isSimpleReadable(addr) {
  return (addr >> 8) === 0x18;
}

// Builds the MCSP payload to hand to the transport's doMcspWrite().
function buildReadRequestFrame(addr, seq) {
  const lowByte = addr & 0xff; // only the low byte travels; high byte 0x18 is implicit
  const varint = encodeVarint(lowByte);
  const body = [0x0e, 0x10, READ_OPCODE, ...varint, seq & 0xff];
  return Uint8Array.from([BLOCK_OP, body.length, ...body]);
}

// Parses a raw MCSP frame (as received from the reader loop) into a structured
// result, or null if it doesn't look like a read-response frame at all (e.g. the
// periodic 0xa1/0xa0 "heartbeat" pushes, or the bundled 5-field identify block).
function parseReadResponseFrame(bytes) {
  if (!bytes || bytes.length < 2 || bytes[0] !== BLOCK_OP) return null;
  const len = bytes[1];
  const body = bytes.slice(2, 2 + len);
  if (body.length < 5) return null;
  if (body[0] !== READ_RESPONSE_MARKER) return null;
  if (body[2] !== RESPONSE_FIXED[0] || body[3] !== RESPONSE_FIXED[1]) return null;
  return {
    addrLow: body[1],
    seqEcho: body[4],
    payload: body.slice(5),
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

// Best-effort generic decode — we haven't ported every Bosch message type
// (ProductCode, ShortVersion, RegioSpeedConfigurationEnumMessage, ...), so this
// makes a reasonable guess rather than fully typed decoding. Good enough for a
// "dump everything" tool; refine per-field later if needed.
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

const exportsObj = {
  encodeVarint,
  isSimpleReadable,
  buildReadRequestFrame,
  parseReadResponseFrame,
  decodeValue,
  toHex,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportsObj;
} else if (typeof window !== 'undefined') {
  window.Bes3Protocol = exportsObj;
}
