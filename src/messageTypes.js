// Per-address typed decoding, based on the actual Bosch protobuf message
// definitions and DriveUnitMessageBusWrapper field declarations (each
// address's exact wire type was individually confirmed, not guessed — see
// the private research notes for provenance). Fields not listed here fall
// back to the generic best-effort decoder in protocol.js; that fallback is
// intentionally still labeled as a guess, never presented as confirmed.
//
// decode "kind" values:
//   string          - protobuf field 1, length-delimited UTF-8 string
//   normFactor      - protobuf field 1, varint int (zigzag if `signed: true` — confirmed per
//                     type: Uint16NormFactor100Message/SafeUint16NormFactor10 use plain
//                     writeUInt32; Int16NormFactor10Message uses writeSInt32, i.e. zigzag),
//                     divide by `factor` for the real value
//   bool            - protobuf field 1, varint bool (0/1); proto3 omits the field entirely when false
//   uuid            - protobuf field 1 wraps a nested message whose own field 1 is 16 raw bytes
//   enum            - protobuf field 1, varint enum ordinal; look up in `enumTable`
//   tuningDetection - protobuf field 1 = bool flag, field 2 = varint counter

const REGIO_SPEED_CONFIGURATION_ENUM = {
  0: { name: 'UNSPECIFIED', label: 'Unspecified' },
  1: { name: 'EUROPE_AUSTRALIA25KMH', label: 'Europe / Australia, 25 km/h' },
  2: { name: 'USA_CANADA_NEW_ZEALAND20MPH', label: 'USA / Canada / New Zealand, 20 mph' },
  3: { name: 'JAPAN24KMH', label: 'Japan, 24 km/h' },
  4: { name: 'SOUTH_KOREA25KMH', label: 'South Korea, 25 km/h' },
  5: { name: 'TAIWAN25KMH', label: 'Taiwan, 25 km/h' },
  6: { name: 'EUROPE45KMH', label: 'Europe, 45 km/h (S-Pedelec class)' },
  7: { name: 'USA28MPH', label: 'USA, 28 mph' },
  8: { name: 'EUROPE_ATHLETE25KMH', label: 'Europe, "Athlete" 25 km/h' },
  9: { name: 'USA_ATHLETE20MPH', label: 'USA, "Athlete" 20 mph' },
  '-1': { name: 'UNRECOGNIZED', label: 'Unrecognized' },
};

// Labels are Bosch's own UI strings (from DiagnosticTool 3's enum_en.properties,
// ConfigurationDetailsI18n.BikeCategoryEnum.*) — the actual dealer-facing text.
const BIKE_CATEGORY_ENUM = {
  0: { name: 'BIKE_CATEGORY_NOT_CONFIGURED', label: 'Not configured' },
  1: { name: 'CITY', label: 'eCity' },
  2: { name: 'TREKKING', label: 'eTrekking' },
  3: { name: 'M_T_B_TOUR', label: 'eMTB (Tour)' },
  4: { name: 'M_T_B_TRAIL', label: 'eMTB (Trail)' },
  5: { name: 'ROAD', label: 'eRoad' },
  6: { name: 'GRAVEL', label: 'eGravel' },
  7: { name: 'KIDS', label: 'eKids' },
  8: { name: 'CARGO', label: 'eCargo Long John' },
  9: { name: 'FLEET', label: 'eFleet' },
  10: { name: 'OTHERS', label: 'Other' },
  11: { name: 'E_CARGO_LONG_TAIL', label: 'eCargo Long Tail' },
  '-1': { name: 'UNRECOGNIZED', label: 'Unknown' },
};

// Address -> typed decode metadata. Address values match DriveUnitAddresses
// in addresses.js. Labels for plain fields are Bosch's own DiagnosticTool 3
// UI strings where a matching one was found (diagnostic_en.properties),
// otherwise a plain descriptive label.
const FIELD_TYPES = {
  6145: { label: 'Serial Number', kind: 'string' },
  6146: { label: 'Part Number', kind: 'string' },
  6147: { label: 'Product Code', kind: 'string' },
  6148: { label: 'Hardware Version', kind: 'string' }, // ShortVersion, same wrapper as 6149/6151
  6149: { label: 'HW/SW Version', kind: 'string' },
  6150: { label: 'SW Version', kind: 'string' },
  6151: { label: 'FBL Version', kind: 'string' }, // "FBL" = Bosch's own term for the bootloader
  6163: { label: 'Maximum Legal Bike Speed', kind: 'normFactor', factor: 100, unit: 'km/h' },
  6166: { label: 'Maximum Gear Ratio', kind: 'normFactor', factor: 100 },
  6167: { label: 'Maximum Assistance Speed', kind: 'normFactor', factor: 100, unit: 'km/h' },
  6183: { label: 'Product Line', kind: 'string' },
  6184: { label: 'Rear Wheel Circumference (OEM)', kind: 'normFactor', factor: 10, unit: 'mm' }, // SafeUint16NormFactor10 — has a field-2 checksum we ignore
  6186: { label: 'OEM Brand Identifier', kind: 'string' },
  6187: { label: 'Gearing System', kind: 'string' },
  6188: { label: 'eBike ID', kind: 'uuid' },
  6190: { label: 'Product Name', kind: 'string' },
  6196: { label: 'Component Locked', kind: 'bool' },
  6198: { label: 'Sample Software', kind: 'bool' },
  6210: { label: 'Maximum Assistance Speed (IBD)', kind: 'normFactor', factor: 100, unit: 'km/h' },
  6212: { label: 'In Software Installation State', kind: 'bool' },
  6214: { label: 'UDAM Modification Possible', kind: 'bool' },
  6216: { label: 'Connect Module Ready', kind: 'bool' },
  6217: { label: 'Range Extender Ready', kind: 'bool' },
  6220: { label: 'Production Plant Code', kind: 'string' },
  6225: { label: 'Tuning Detection', kind: 'tuningDetection' },
  6228: { label: 'Front ABS Assembled', kind: 'bool' },
  6229: { label: 'Bike Category', kind: 'enum', enumTable: BIKE_CATEGORY_ENUM },
  6238: { label: 'OEM Bike ID', kind: 'string' },
  6239: { label: 'OEM Manufacturing Location', kind: 'string' },
  6240: { label: 'OEM Manufacturing Line', kind: 'string' },
  6242: { label: 'OEM Free Text Field', kind: 'string' },
  6252: { label: 'OEM Brand Name', kind: 'string' },
  6261: { label: 'OEM Bike Model ID', kind: 'string' },
  6269: { label: 'Regional Speed Configuration ("Speed ID")', kind: 'enum', enumTable: REGIO_SPEED_CONFIGURATION_ENUM },
  6276: { label: 'Present PCB Temperature', kind: 'normFactor', factor: 10, unit: '°C', signed: true }, // Int16NormFactor10Message — zigzag varint (writeSInt32)
  6302: { label: 'Motor Product Code', kind: 'string' },
};

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}
function decodeUtf8(bytes) {
  return new TextDecoder('utf-8').decode(Uint8Array.from(bytes));
}

// Reads a single protobuf varint starting at offset; returns [value, nextOffset].
function readVarint(bytes, offset) {
  let result = 0;
  let shift = 0;
  let i = offset;
  while (true) {
    const b = bytes[i++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return [result >>> 0, i];
}

// Protobuf zigzag decode (used by sint32 fields, e.g. Int16NormFactor10Message) —
// maps the unsigned wire value back to a signed int: 0,1,2,3,4 -> 0,-1,1,-2,2 ...
function zigzagDecode(n) {
  return (n >>> 1) ^ -(n & 1);
}

// Parses top-level protobuf fields (tag + value) out of a message body.
// Only handles what this protocol actually uses: varints and length-delimited.
function parseFields(bytes) {
  const fields = {};
  let i = 0;
  while (i < bytes.length) {
    const [tagByte, afterTag] = readVarint(bytes, i);
    i = afterTag;
    const fieldNum = tagByte >>> 3;
    const wireType = tagByte & 0x7;
    if (wireType === 0) {
      const [value, next] = readVarint(bytes, i);
      fields[fieldNum] = { wireType, value };
      i = next;
    } else if (wireType === 2) {
      const [len, next] = readVarint(bytes, i);
      const content = bytes.slice(next, next + len);
      fields[fieldNum] = { wireType, value: content };
      i = next + len;
    } else {
      break; // unsupported wire type for this protocol — stop rather than misparse
    }
  }
  return fields;
}

function decodeTyped(addr, payload) {
  const meta = FIELD_TYPES[addr];
  if (!meta) return null; // no confirmed type — caller should fall back to generic decode

  if (!payload || payload.length === 0) {
    // proto3 omits default-value scalar fields entirely — for bool this means false;
    // for others it usually means "not present / zero value".
    if (meta.kind === 'bool') return { label: meta.label, display: 'false' };
    return { label: meta.label, display: '(empty / default)' };
  }

  const fields = parseFields(payload);
  const f1 = fields[1];

  switch (meta.kind) {
    case 'string': {
      if (!f1 || f1.wireType !== 2) return { label: meta.label, display: '(unexpected encoding)' };
      return { label: meta.label, display: decodeUtf8(f1.value) };
    }
    case 'normFactor': {
      if (!f1 || f1.wireType !== 0) return { label: meta.label, display: '(unexpected encoding)' };
      const raw = meta.signed ? zigzagDecode(f1.value) : f1.value;
      const real = raw / meta.factor;
      return { label: meta.label, display: meta.unit ? `${real} ${meta.unit}` : String(real) };
    }
    case 'bool': {
      if (!f1) return { label: meta.label, display: 'false' };
      return { label: meta.label, display: f1.value ? 'true' : 'false' };
    }
    case 'enum': {
      if (!f1 || f1.wireType !== 0) return { label: meta.label, display: '(unexpected encoding)' };
      const entry = meta.enumTable[f1.value] || meta.enumTable[String(f1.value)];
      return {
        label: meta.label,
        display: entry ? `${entry.label} [${entry.name}=${f1.value}]` : `unknown enum value ${f1.value}`,
      };
    }
    case 'uuid': {
      if (!f1 || f1.wireType !== 2) return { label: meta.label, display: '(unexpected encoding)' };
      // f1.value is itself a nested message: field 1, length-delimited, 16 raw bytes
      const inner = parseFields(f1.value);
      const raw = inner[1] && inner[1].wireType === 2 ? inner[1].value : null;
      if (!raw || raw.length !== 16) return { label: meta.label, display: `hex: ${toHex(f1.value)}` };
      const hex = toHex(raw).replace(/ /g, '');
      const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      return { label: meta.label, display: uuid };
    }
    case 'tuningDetection': {
      const flag = fields[1] ? !!fields[1].value : false;
      const counter = fields[2] ? fields[2].value : 0;
      return { label: meta.label, display: `flag=${flag}, counter=${counter}` };
    }
    default:
      return null;
  }
}

const exportsObj = { FIELD_TYPES, decodeTyped, REGIO_SPEED_CONFIGURATION_ENUM, BIKE_CATEGORY_ENUM };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportsObj;
} else if (typeof window !== 'undefined') {
  window.Bes3MessageTypes = exportsObj;
}
