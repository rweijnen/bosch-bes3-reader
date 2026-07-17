// Pure protocol logic for Bosch Smart System (BES3) "MCSP" reads. No Node/USB-
// specific code here on purpose — this file (and addresses.js) are reusable
// as-is from a future browser/WebUSB tool.
//
// Confirmed encoding for a plain "readable data point" request, generalized
// across every component (DriveUnit, Battery, RemoteControl, ...), not just
// DriveUnit's own 0x18xx range as originally thought:
//
//   request  MCSP frame: 30 <len> 0e 10 <marker> <addrLowVarint...> <seq>
//   response MCSP frame: 30 <len> <addrHigh> <addrLowEcho> 8e 10 <seq+0x10> <payload...>
//
// where `marker` = 0x80 | (address >> 8) and the address's low byte travels
// as a protobuf-style LEB128 varint. Verified against the real capture for
// two different components: DriveUnit (PRODUCT_CODE=6147=0x1803, marker 0x98)
// and RemoteControl (PRODUCT_CODE=8293=0x2065, marker 0xa0) both decoded
// correctly using this same rule — it isn't a DriveUnit-specific opcode.
//
// Only `readable` addresses (see addresses.js) are known to work with this
// request shape — callable RPCs (e.g. READ_UDAM_VALUES) need an argument and
// a different invocation we have not cracked yet.

(function () {
const RESPONSE_FIXED = [0x8e, 0x10]; // constant bytes seen in every read response
const BLOCK_OP = 0x30;               // MCSP "block read" op byte

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

// Builds the MCSP payload to hand to the transport's doMcspWrite().
function buildReadRequestFrame(addr, seq) {
  const highByte = (addr >> 8) & 0xff;
  const lowByte = addr & 0xff;
  const marker = 0x80 | highByte;
  const varint = encodeVarint(lowByte);
  const body = [0x0e, 0x10, marker, ...varint, seq & 0xff];
  return Uint8Array.from([BLOCK_OP, body.length, ...body]);
}

// Parses a raw MCSP frame (as received from the reader loop) into a structured
// result, or null if it doesn't look like a read-response frame at all (e.g.
// the bundled multi-field identify block, which has a different shape).
function parseReadResponseFrame(bytes) {
  if (!bytes || bytes.length < 2 || bytes[0] !== BLOCK_OP) return null;
  const len = bytes[1];
  const body = bytes.slice(2, 2 + len);
  if (body.length < 5) return null;
  if (body[0] & 0x80) return null; // response always has the marker bit cleared
  if (body[2] !== RESPONSE_FIXED[0] || body[3] !== RESPONSE_FIXED[1]) return null;
  return {
    addrHigh: body[0],
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

const protocolExports = {
  encodeVarint,
  buildReadRequestFrame,
  parseReadResponseFrame,
  decodeValue,
  toHex,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = protocolExports;
} else if (typeof window !== 'undefined') {
  window.Bes3Protocol = protocolExports;
}
})();
