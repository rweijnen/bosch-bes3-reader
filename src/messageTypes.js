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
//   uint            - protobuf field 1, raw varint uint, no message wrapper (bare Kotlin scalar
//                     type — UByte/UShort/UInt); inferred from the confirmed 'bool' pattern,
//                     see the FIELD_TYPES header note — not byte-confirmed like the above
//   uuid            - protobuf field 1 wraps a nested message whose own field 1 is 16 raw bytes
//   enum            - protobuf field 1, varint enum ordinal; look up in `enumTable`
//   tuningDetection - protobuf field 1 = bool flag, field 2 = varint counter
//   unixTimestamp   - protobuf field 1, SINT64 (zigzag varint — confirmed from decompile:
//                     Timestamp.value_ is read via codedInputStream.readSInt64(), not plain
//                     readInt64() — a real hardware capture caught this: an un-zigzag-decoded
//                     read showed a date ~2x too far in the future, exactly the zigzag-of-a-
//                     positive-value signature), Unix epoch seconds (com.bosch.ebike.bes3.
//                     messagebus.Timestamp — distinct from the separate TimestampInMilliseconds
//                     class Bosch also has, confirming this one is seconds, not ms)
//   uint32List      - protobuf field 1, repeated varint uint32 (com.bosch.ebike.bes3.messagebus.
//                     ArrayOf8Uint32) — up to 8 packed values, e.g. per-LED color codes
//   serviceDue      - protobuf field 1 = nested Timestamp submessage (same sint64/zigzag field as
//                     unixTimestamp above), field 2 = varint odometer (meters, same unit as
//                     ODOMETER elsewhere) — com.bosch.ebike.bes3.messagebus.ServiceDue

(function () {
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
  10: { name: 'SOUTH_AFRICA25KMH', label: 'South Africa, 25 km/h' },
  11: { name: 'NEW_ZEALAND45KMH', label: 'New Zealand, 45 km/h (S-Pedelec class)' },
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
  12: { name: 'COMPACT', label: 'eCompact' },
  '-1': { name: 'UNRECOGNIZED', label: 'Unknown' },
};

// com.bosch.ebike.bes3.messagebus.StartAssistModePositionEnumType — confirmed
// via decompile. Backs both START_ASSIST_MODE_CONFIGURATION (addr 6180,
// writable — see below) and its _OEM counterpart (addr 6179, read-only
// manufacturer default).
const START_ASSIST_MODE_POSITION_ENUM = {
  0: { name: 'START_ASSIST_MODE_NOT_CONFIGURED', label: 'Not configured' },
  1: { name: 'START_ASSIST_MODE_LAST_USED', label: 'Last used mode' },
  2: { name: 'START_ASSIST_MODE_POSITION0', label: 'Position 0 (off/walk)' },
  3: { name: 'START_ASSIST_MODE_POSITION1', label: 'Position 1' },
  4: { name: 'START_ASSIST_MODE_POSITION2', label: 'Position 2' },
  5: { name: 'START_ASSIST_MODE_POSITION3', label: 'Position 3' },
  6: { name: 'START_ASSIST_MODE_POSITION4', label: 'Position 4' },
  '-1': { name: 'UNRECOGNIZED', label: 'Unrecognized' },
};

// com.bosch.ebike.bes3.messagebus.UnitEnumType — confirmed via decompile
// (RemoteControlMessageBusWrapper.getUnits(): ReadableWritableSubscribableDataPoint<UnitEnumMessage>).
const UNIT_ENUM = {
  0: { name: 'METRIC', label: 'Metric' },
  1: { name: 'IMPERIAL', label: 'Imperial' },
  '-1': { name: 'UNRECOGNIZED', label: 'Unrecognized' },
};

// com.bosch.ebike.bes3.messagebus.TimeFormatEnumType — confirmed via decompile
// (RemoteControlMessageBusWrapper.getTimeFormat(): ReadableWritableSubscribableDataPoint<TimeFormatEnumMessage>).
const TIME_FORMAT_ENUM = {
  0: { name: 'HOUR24', label: '24-hour' },
  1: { name: 'HOUR12', label: '12-hour' },
  '-1': { name: 'UNRECOGNIZED', label: 'Unrecognized' },
};

// Address -> typed decode metadata, across all components (address ranges
// don't overlap — see addresses.js). Labels for plain fields are Bosch's own
// DiagnosticTool 3 UI strings where a matching one was found
// (diagnostic_en.properties), otherwise a plain descriptive label.
//
// Fields marked "inferred" use kind 'uint': these are bare Kotlin scalar
// types (UByte/UShort/UInt), not one of Bosch's own protobuf message wrapper
// classes. We haven't captured a real nonzero example of one on the wire —
// the inference rests on the CONFIRMED behavior of 'bool' fields (also a
// bare scalar type, verified empty-for-false against a real capture),
// generalized to other bit-widths of the same no-wrapper pattern. Reasonable,
// but a notch below the byte-confirmed fields above it.
const FIELD_TYPES = {
  // --- DriveUnit ---
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
  // NOT a plain enum, despite the name suggesting it's just the OEM default position — confirmed
  // via decompile of the real Bosch DiagnosticTool 3 UI (AssistModesTilesModel/ViewModel,
  // eds-bdp-ui-assistmode-17.9.3.jar): StartAssistModeConfigurationOem is a 2-field protobuf message,
  // field 1 = startAssistModePosition (enum, the OEM default — what we already decoded), field 2 =
  // startAssistModePositionConfigurable (bool, proto3-omitted when false). The official UI reads
  // ONLY field 2 to decide whether to let the user change START_ASSIST_MODE_CONFIGURATION (6180) at
  // all — shows a "locked by manufacturer" tooltip and treats the control as non-configurable when
  // false. Our own write path never checked this flag before — a real hardware test showed a write
  // to 6180 get a genuine WRITE_RESPONSE/SUCCESS ack that didn't durably stick, and this gate is the
  // leading candidate explanation (firmware silently no-ops the write when field2 is false here).
  6179: { label: 'Start Assist Mode (OEM default)', kind: 'startAssistModeOem', enumTable: START_ASSIST_MODE_POSITION_ENUM },
  6180: { label: 'Start Assist Mode', kind: 'enum', enumTable: START_ASSIST_MODE_POSITION_ENUM }, // writable — MessageBus.DriveUnit.getStartAssistModeConfiguration() is ReadableWritableSubscribableDataPoint, no dealer/HSM gate found
  6183: { label: 'Product Line', kind: 'string' },
  6184: { label: 'Rear Wheel Circumference (OEM)', kind: 'normFactor', factor: 10, unit: 'mm' }, // SafeUint16NormFactor10 — has a field-2 checksum we ignore
  6185: { label: 'Rear Wheel Circumference (User)', kind: 'normFactor', factor: 10, unit: 'mm' }, // MessageBus.DriveUnit.Companion.normalizeRearWheelCircumferenceUser (Flow source)
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
  6263: { label: 'Maximum Available Motor Torque', kind: 'normFactor', factor: 10, unit: 'Nm' }, // MessageBus.DriveUnit.Companion.normalizeMotorTorque (Flow source)
  6269: { label: 'Regional Speed Configuration ("Speed ID")', kind: 'enum', enumTable: REGIO_SPEED_CONFIGURATION_ENUM },
  6276: { label: 'Present PCB Temperature', kind: 'normFactor', factor: 10, unit: '°C', signed: true }, // Int16NormFactor10Message — zigzag varint (writeSInt32)
  6302: { label: 'Motor Product Code', kind: 'string' },
  6168: { label: 'Odometer', kind: 'uint', unit: 'm' }, // inferred — bare UInt, see file header
  6169: { label: 'Power-On Time', kind: 'uint', unit: 's' }, // inferred — bare UShort
  // Read-only (ReadableSubscribableDataPoint<Boolean>, no write method anywhere) — this is the
  // trigger flag behind the "distracted riding" disclaimer flow, see the private research notes
  // for the full trigger/display-mechanism writeup. Baked into the signed region config; not
  // independently settable from the client side.
  6161: { label: 'Distracted Riding Alert', kind: 'bool' },

  // --- Battery (slot 1) ---
  129: { label: 'Serial Number', kind: 'string' },
  130: { label: 'Part Number', kind: 'string' },
  131: { label: 'Product Code', kind: 'string' },
  132: { label: 'Hardware Version', kind: 'string' },
  134: { label: 'SW Version', kind: 'string' },
  135: { label: 'FBL Version', kind: 'string' },
  136: { label: 'State of Charge', kind: 'uint', unit: '%' }, // inferred — bare UByte
  139: { label: 'Present Pack Temperature', kind: 'normFactor', factor: 10, unit: '°C', signed: true }, // Bosch's own wrapper calls the identical address "presentCellTemperature" — same data point, our own address-table name predates that discovery
  140: { label: 'Present Cell Voltage', kind: 'uint', unit: 'mV' }, // inferred — bare UShort, confirmed via decompile (BatteryMessageBusWrapper.getPresentCellVoltage())
  145: { label: 'Remaining Energy (Rider)', kind: 'normFactor', factor: 10, unit: 'Wh' },
  146: { label: 'Remaining Energy', kind: 'normFactor', factor: 10, unit: 'Wh' },
  150: { label: 'Full Charge Cycles', kind: 'normFactor', factor: 10 },
  153: { label: 'Deactivation Proof', kind: 'deactivationProof' }, // DeactivationProof: field1=deactivationState (bool), field2=certificateSerialNumber (nested submessage), field3=signature (bytes) — confirmed via decompile
  154: { label: 'Deactivation Enabled', kind: 'bool' }, // confirmed via decompile — ReadableDataPoint<Boolean>
  155: { label: 'Product Name', kind: 'string' },
  157: { label: 'Duration in Thermal Protection', kind: 'uint', unit: 's' }, // inferred — bare UInt, confirmed via decompile (BatteryMessageBusWrapper.getDurationInThermalProtection())
  158: { label: 'Last End-of-Charge Voltage', kind: 'normFactor', factor: 10, unit: 'V' }, // Uint16NormFactor10Message, confirmed via decompile
  159: { label: 'Maximum Charging Current', kind: 'normFactor', factor: 10, unit: 'A', signed: true }, // Int16NormFactor10Message, confirmed via decompile
  160: { label: 'Maximum Pack Temperature', kind: 'normFactor', factor: 10, unit: '°C', signed: true }, // Int16NormFactor10Message, confirmed via decompile
  161: { label: 'Minimum Pack Temperature', kind: 'normFactor', factor: 10, unit: '°C', signed: true }, // Int16NormFactor10Message, confirmed via decompile
  162: { label: 'SoC Lower Limit', kind: 'uint', unit: '%' }, // inferred — bare UByte, writable (see addresses.js)
  163: { label: 'SoC Upper Limit', kind: 'uint', unit: '%' }, // inferred — bare UByte, writable (see addresses.js)
  210: { label: 'Present FET Temperature', kind: 'normFactor', factor: 10, unit: '°C', signed: true }, // Int16NormFactor10Message, confirmed via decompile
  215: { label: 'Delivered Ah (Lifetime)', kind: 'uint', unit: 'mAh' }, // inferred unit — bare UInt (no norm-factor wrapper), mAh is a plausible-but-NOT-independently-confirmed guess (checked against a real capture: 557064 raw / 51.2 charge cycles ≈ 10.9 Ah/cycle, a plausible per-cycle capacity — not proof)
  220: { label: 'Self-Discharging Rate', kind: 'normFactor', factor: 10 }, // Uint8NullableNormFactor10Message, confirmed via decompile — "Nullable" just means protobuf presence-tracking, decodes the same as any other NormFactor10 on the wire
  224: { label: 'Device Certificate', kind: 'certificateBytes' }, // Certificate: field1 = raw bytes (ByteString), confirmed via decompile — likely an X.509 or Bosch CVC-format cert, not parsed further (see decode comment)
  156: { label: 'Delivered Wh (Lifetime)', kind: 'uint', unit: 'Wh' }, // inferred — bare UInt
  216: { label: 'State of Health', kind: 'uint', unit: '%' }, // inferred — bare UByte

  // --- RemoteControl (BRC) — all confirmed via decompile of RemoteControlMessageBusWrapper.
  // LANGUAGE/UNITS/TIME/TIME_FORMAT/LED_COLORS/SERVICE_DUE are all declared writable
  // (ReadableWritable[Subscribable]DataPoint) — same trust tier as START_ASSIST_MODE_CONFIGURATION,
  // but none of these write paths have been traced/tested the way that one has (see private
  // research notes) — decoded here as read-only for now, no write UI added.
  8226: { label: 'Time', kind: 'unixTimestamp' },
  8354: { label: 'LED Colors', kind: 'uint32List' },
  8577: { label: 'Language', kind: 'string' },
  8578: { label: 'Units', kind: 'enum', enumTable: UNIT_ENUM },
  8579: { label: 'Time Format', kind: 'enum', enumTable: TIME_FORMAT_ENUM },
  8581: { label: 'Service Due', kind: 'serviceDue' },
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

// --- CVC (Card Verifiable Certificate, ISO 7816-8 / EAC) parser ---
// Used only for DEVICE_CERTIFICATE (addr 224) so far. Confirmed against a real captured
// battery certificate: this is the same certificate family already documented elsewhere in
// this project's private research (BES3CONFIG's dealer/OEM signing chain, tags 5F25/5F24/5F37) —
// also used, apparently, for a per-battery device identity certificate. Verified end-to-end
// against a real capture: the OID decodes to Ed25519 (1.3.101.112), the 5F25 "valid from" date
// decodes to exactly this battery's own real MANUFACTURING_DATE, the holder-reference and
// authorization-template fields contain this battery's own serial number and product code in
// plain ASCII, and the signature is exactly 64 bytes (Ed25519 signature size) — not a guess.

// BER tag: 1 byte, or 2 bytes if the low 5 bits of the first byte are all set (0x1F) — this
// format never goes beyond 2-byte tags in the samples seen. "Constructed" (contains nested
// TLVs) is bit 0x20 of the first tag byte, standard ASN.1/BER convention.
function readCvcTag(bytes, i) {
  const first = bytes[i];
  if ((first & 0x1f) === 0x1f) return [(first << 8) | bytes[i + 1], 2, !!(first & 0x20)];
  return [first, 1, !!(first & 0x20)];
}
// BER length: short form (high bit clear) is the length itself; long form (high bit set) says
// how many following bytes encode the big-endian length.
function readCvcLen(bytes, i) {
  const b = bytes[i];
  if ((b & 0x80) === 0) return [b, 1];
  const n = b & 0x7f;
  let val = 0;
  for (let k = 0; k < n; k++) val = (val << 8) | bytes[i + 1 + k];
  return [val, 1 + n];
}
function parseCvcTlv(bytes, start, end) {
  let i = start;
  const items = [];
  while (i < end) {
    const [tag, tagLen, constructed] = readCvcTag(bytes, i);
    i += tagLen;
    const [len, lenLen] = readCvcLen(bytes, i);
    i += lenLen;
    items.push({ tag, value: bytes.slice(i, i + len), constructed });
    i += len;
  }
  return items;
}
function findCvcTag(items, tag) {
  return items.find((it) => it.tag === tag);
}
// Extracts printable-ASCII runs (length >= 4) from a byte value — these CVC fields mix binary
// identifiers with embedded plain-text identifiers (bike/component serials, product codes);
// this surfaces the readable parts without asserting exact field semantics for the rest.
function cvcAsciiRuns(bytes) {
  const runs = [];
  let cur = [];
  for (const b of bytes) {
    if (b >= 0x20 && b <= 0x7e) cur.push(b);
    else { if (cur.length >= 4) runs.push(decodeUtf8(cur)); cur = []; }
  }
  if (cur.length >= 4) runs.push(decodeUtf8(cur));
  return runs;
}
// CVC dates (tags 5F25/5F24): 6 bytes, each byte's plain decimal value (0-9, not BCD-packed) is
// one digit of YYMMDD. Confirmed against the real capture: bytes [02,03,00,01,01,02] -> "230112"
// -> 2023-01-12, which is exactly this battery's own MANUFACTURING_DATE.
function decodeCvcDate(bytes) {
  if (bytes.length !== 6) return null;
  const digits = Array.from(bytes).join('');
  return `20${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
}
const CVC_KEY_OIDS = { '2b6570': 'Ed25519', '2b6571': 'Ed448' };
function parseCvcCertificate(bytes) {
  // A single leading byte (not part of the CVC TLV itself — likely a container version/count
  // byte) precedes the outer 7F21 template in the one real sample this was checked against.
  let start = 0;
  if (bytes[0] !== 0x7f && bytes[1] === 0x7f && bytes[2] === 0x21) start = 1;
  const outer = parseCvcTlv(bytes, start, bytes.length);
  const cert = findCvcTag(outer, 0x7f21);
  if (!cert || !cert.constructed) return null; // not a recognized CVC — caller falls back to raw hex

  const body = findCvcTag(parseCvcTlv(cert.value, 0, cert.value.length), 0x7f4e);
  const sig = findCvcTag(parseCvcTlv(cert.value, 0, cert.value.length), 0x5f37);
  if (!body) return null;
  const bodyItems = parseCvcTlv(body.value, 0, body.value.length);

  const car = findCvcTag(bodyItems, 0x42); // Certification Authority Reference
  const pubKeyItem = findCvcTag(bodyItems, 0x7f49);
  let keyAlgorithm = null, publicKey = null;
  if (pubKeyItem && pubKeyItem.constructed) {
    const pkItems = parseCvcTlv(pubKeyItem.value, 0, pubKeyItem.value.length);
    const oid = findCvcTag(pkItems, 0x06);
    const key = findCvcTag(pkItems, 0x86);
    keyAlgorithm = oid ? (CVC_KEY_OIDS[toHex(oid.value).replace(/ /g, '')] || `OID ${toHex(oid.value)}`) : null;
    publicKey = key ? toHex(key.value).replace(/ /g, '') : null;
  }
  const holderRef = findCvcTag(bodyItems, 0x5f20); // Certificate Holder Reference
  const authTemplate = findCvcTag(bodyItems, 0x7f4c); // Certificate Holder Authorization Template
  const validFromItem = findCvcTag(bodyItems, 0x5f25);
  const validUntilItem = findCvcTag(bodyItems, 0x5f24);
  const serialItem = findCvcTag(bodyItems, 0x5f34);

  return {
    keyAlgorithm,
    publicKeyHex: publicKey,
    caReferenceHex: car ? toHex(car.value).replace(/ /g, '') : null,
    holderReferenceText: holderRef ? cvcAsciiRuns(holderRef.value).join(' / ') : null,
    authorizationText: authTemplate && authTemplate.constructed
      ? parseCvcTlv(authTemplate.value, 0, authTemplate.value.length)
          .flatMap((it) => cvcAsciiRuns(it.value))
          .join(' / ')
      : null,
    validFrom: validFromItem ? decodeCvcDate(validFromItem.value) : null,
    validUntil: validUntilItem ? decodeCvcDate(validUntilItem.value) : null,
    serialHex: serialItem ? toHex(serialItem.value).replace(/ /g, '') : null,
    signatureHex: sig ? toHex(sig.value).replace(/ /g, '') : null,
    signatureLength: sig ? sig.value.length : null,
  };
}

function decodeTyped(addr, payload) {
  const meta = FIELD_TYPES[addr];
  if (!meta) return null; // no confirmed type — caller should fall back to generic decode

  if (!payload || payload.length === 0) {
    // proto3 omits default-value scalar fields entirely — for bool this means false;
    // for a bare uint it means the value really is 0; for everything else it
    // usually means "not present".
    if (meta.kind === 'bool') return { label: meta.label, display: 'false', value: false };
    if (meta.kind === 'uint') return { label: meta.label, display: meta.unit ? `0 ${meta.unit}` : '0', value: 0 };
    // proto3 omits a false flag / zero counter entirely — an empty tuningDetection
    // read means "no tuning detected", not "unknown". Return a real value object so
    // callers can read .flag / .counter without a null guard.
    if (meta.kind === 'tuningDetection') return { label: meta.label, display: 'flag=false, counter=0', value: { flag: false, counter: 0 } };
    if (meta.kind === 'startAssistModeOem') {
      const entry = meta.enumTable[0];
      return { label: meta.label, display: `${entry.label} [${entry.name}=0], configurable=false`, value: { position: entry.name, configurable: false } };
    }
    // Pre-existing gap fixed here: proto3 omits an enum field entirely when its value is the
    // default (0) — same reasoning as 'bool'/'uint' above, just not handled for 'enum' until now.
    // Affects any enum-kind field whenever the bike reports its 0 value (e.g. UNITS=METRIC,
    // TIME_FORMAT=HOUR24) — previously misreported as "(empty / default)" instead of resolving
    // to the real enum-0 value.
    if (meta.kind === 'enum') {
      const entry = meta.enumTable[0];
      return { label: meta.label, display: entry ? `${entry.label} [${entry.name}=0]` : 'unknown enum value 0', value: entry ? entry.name : 0 };
    }
    // Unlike a 0-value counter or false flag, an epoch-0 timestamp (1970-01-01) is never a
    // real bike-reported clock value — showing it as a literal date would be misleading, so
    // this is deliberately displayed as "(not set)" rather than following strict proto3-omission
    // semantics like the kinds above.
    if (meta.kind === 'unixTimestamp') return { label: meta.label, display: '(not set)', value: 0 };
    if (meta.kind === 'uint32List') return { label: meta.label, display: '(none)', value: [] };
    if (meta.kind === 'serviceDue') return { label: meta.label, display: '(not set)', value: { timestamp: 0, odometer: 0 } };
    if (meta.kind === 'deactivationProof') return { label: meta.label, display: 'not deactivated (no proof present)', value: { deactivated: false, signatureLength: 0 } };
    if (meta.kind === 'certificateBytes') return { label: meta.label, display: '(no certificate)', value: null };
    return { label: meta.label, display: '(empty / default)', value: null };
  }

  const fields = parseFields(payload);
  const f1 = fields[1];

  switch (meta.kind) {
    case 'string': {
      if (!f1 || f1.wireType !== 2) return { label: meta.label, display: '(unexpected encoding)', value: null };
      const str = decodeUtf8(f1.value);
      return { label: meta.label, display: str, value: str };
    }
    case 'normFactor': {
      if (!f1 || f1.wireType !== 0) return { label: meta.label, display: '(unexpected encoding)', value: null };
      const raw = meta.signed ? zigzagDecode(f1.value) : f1.value;
      const real = raw / meta.factor;
      return { label: meta.label, display: meta.unit ? `${real} ${meta.unit}` : String(real), value: real };
    }
    case 'bool': {
      if (!f1) return { label: meta.label, display: 'false', value: false };
      return { label: meta.label, display: f1.value ? 'true' : 'false', value: !!f1.value };
    }
    case 'uint': {
      if (!f1 || f1.wireType !== 0) return { label: meta.label, display: '(unexpected encoding)', value: null };
      return { label: meta.label, display: meta.unit ? `${f1.value} ${meta.unit}` : String(f1.value), value: f1.value };
    }
    case 'enum': {
      if (!f1 || f1.wireType !== 0) return { label: meta.label, display: '(unexpected encoding)', value: null };
      const entry = meta.enumTable[f1.value] || meta.enumTable[String(f1.value)];
      return {
        label: meta.label,
        display: entry ? `${entry.label} [${entry.name}=${f1.value}]` : `unknown enum value ${f1.value}`,
        value: entry ? entry.name : f1.value,
      };
    }
    case 'uuid': {
      if (!f1 || f1.wireType !== 2) return { label: meta.label, display: '(unexpected encoding)', value: null };
      // f1.value is itself a nested message: field 1, length-delimited, 16 raw bytes
      const inner = parseFields(f1.value);
      const raw = inner[1] && inner[1].wireType === 2 ? inner[1].value : null;
      if (!raw || raw.length !== 16) return { label: meta.label, display: `hex: ${toHex(f1.value)}`, value: null };
      const hex = toHex(raw).replace(/ /g, '');
      const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      return { label: meta.label, display: uuid, value: uuid };
    }
    case 'tuningDetection': {
      const flag = fields[1] ? !!fields[1].value : false;
      const counter = fields[2] ? fields[2].value : 0;
      return { label: meta.label, display: `flag=${flag}, counter=${counter}`, value: { flag, counter } };
    }
    case 'startAssistModeOem': {
      const posValue = f1 && f1.wireType === 0 ? f1.value : 0;
      const entry = meta.enumTable[posValue] || meta.enumTable[String(posValue)];
      const position = entry ? entry.name : posValue;
      const positionLabel = entry ? `${entry.label} [${entry.name}=${posValue}]` : `unknown enum value ${posValue}`;
      const configurable = fields[2] ? !!fields[2].value : false;
      return {
        label: meta.label,
        display: `${positionLabel}, configurable=${configurable}`,
        value: { position, configurable },
      };
    }
    case 'unixTimestamp': {
      if (!f1 || f1.wireType !== 0) return { label: meta.label, display: '(unexpected encoding)', value: null };
      const seconds = zigzagDecode(f1.value); // sint64 — see file header note
      const iso = new Date(seconds * 1000).toISOString();
      return { label: meta.label, display: iso, value: seconds };
    }
    case 'uint32List': {
      if (!f1 || f1.wireType !== 2) return { label: meta.label, display: '(unexpected encoding)', value: null };
      // proto3 packed repeated scalar encoding: field 1 is one length-delimited run of
      // concatenated varints, not one wire entry per element.
      const values = [];
      let i = 0;
      while (i < f1.value.length) {
        const [v, next] = readVarint(f1.value, i);
        values.push(v);
        i = next;
      }
      return { label: meta.label, display: values.length ? values.join(', ') : '(none)', value: values };
    }
    case 'serviceDue': {
      let timestamp = 0;
      if (fields[1] && fields[1].wireType === 2) {
        const inner = parseFields(fields[1].value);
        // field 1 of the nested Timestamp submessage is sint64 (zigzag) — same field as
        // unixTimestamp above, see the file header note.
        timestamp = inner[1] && inner[1].wireType === 0 ? zigzagDecode(inner[1].value) : 0;
      }
      const odometer = fields[2] && fields[2].wireType === 0 ? fields[2].value : 0;
      const display = timestamp
        ? `${new Date(timestamp * 1000).toISOString()}, odometer ${odometer} m`
        : `odometer ${odometer} m`;
      return { label: meta.label, display, value: { timestamp, odometer } };
    }
    case 'deactivationProof': {
      // DeactivationProof: field1=deactivationState (bool), field2=certificateSerialNumber
      // (nested submessage, not decoded further — no confirmed shape), field3=signature (bytes).
      const deactivated = fields[1] ? !!fields[1].value : false;
      const sig = fields[3] && fields[3].wireType === 2 ? fields[3].value : null;
      const display = deactivated
        ? `DEACTIVATED (signed proof, ${sig ? sig.length : 0}-byte signature)`
        : `not deactivated${sig ? ` (${sig.length}-byte signature present)` : ''}`;
      return { label: meta.label, display, value: { deactivated, signatureLength: sig ? sig.length : 0 } };
    }
    case 'certificateBytes': {
      if (!f1 || f1.wireType !== 2) return { label: meta.label, display: '(unexpected encoding)', value: null };
      const raw = f1.value;
      const cvc = parseCvcCertificate(raw);
      if (!cvc) {
        // Not a recognized CVC — show what we can without asserting a format we haven't verified.
        return {
          label: meta.label,
          display: `${raw.length} bytes, unrecognized format (not X.509/CVC-parsed) — hex: ${toHex(raw).slice(0, 60)}...`,
          value: { raw: toHex(raw).replace(/ /g, '') },
        };
      }
      const display =
        `${cvc.keyAlgorithm || 'unknown key alg'}, holder: ${cvc.holderReferenceText || '?'}, ` +
        `valid ${cvc.validFrom || '?'} to ${cvc.validUntil || '?'}`;
      return { label: meta.label, display, value: cvc };
    }
    default:
      return null;
  }
}

const messageTypesExports = { FIELD_TYPES, decodeTyped, REGIO_SPEED_CONFIGURATION_ENUM, BIKE_CATEGORY_ENUM };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = messageTypesExports;
} else if (typeof window !== 'undefined') {
  window.Bes3MessageTypes = messageTypesExports;
}
})();
