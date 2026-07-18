// Browser Web Bluetooth transport for Bosch's OFFICIAL "eBike Live Data
// Interface" (smart system control unit v19+, published 2026-05-01,
// Apache-2.0 licensed spec — see docs/ebike_live_data.proto).
//
// This is a *separate*, purpose-built GATT service distinct from the
// reverse-engineered MessageBus/MCSP protocol used by transport-webusb.js —
// a single characteristic carrying a small protobuf message (~13 fields:
// speed, cadence, rider power, SoC, odometer, lock/charger/light states,
// etc.), notified whenever a value changes. No account, license, or pairing
// secret required beyond standard LE Secure Connections "Just Works"
// bonding — this is Bosch's own sanctioned, publicly documented interface,
// not something we reverse-engineered.
//
// It intentionally does NOT expose diagnostic/health data (e.g. battery
// SoH, cycle count, serials) — see README for why the fuller MessageBus
// read path (USB today, BLE later) remains necessary for that.

const LIVE_DATA_SERVICE_UUID = '0000eb20-eaa2-11e9-81b4-2a2ae2dbcce4';
const LIVE_DATA_CHARACTERISTIC_UUID = '0000eb21-eaa2-11e9-81b4-2a2ae2dbcce4';

const LightState = { 0: 'INVALID', 1: 'OFF', 2: 'ON' };

// Generic protobuf varint reader (little-endian base-128, up to 64 bits).
// Returns [valueAsBigInt, nextOffset].
function readVarint(bytes, offset) {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  for (;;) {
    const b = bytes[pos++];
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7n;
  }
  return [result, pos];
}

// Decodes a com.bosch.ebike.LiveData protobuf message (proto3, all scalar
// fields — no strings/submessages, so every field is wire type 0/1/5 or a
// length-delimited field we simply skip). Unrecognized field numbers are
// skipped per the spec's forward-compatibility rules, not treated as errors.
function decodeLiveData(bytes) {
  const out = {};
  let pos = 0;
  while (pos < bytes.length) {
    const [tag, afterTag] = readVarint(bytes, pos);
    pos = afterTag;
    const fieldNumber = Number(tag >> 3n);
    const wireType = Number(tag & 0x7n);

    let raw;
    if (wireType === 0) {
      const [v, next] = readVarint(bytes, pos);
      raw = v;
      pos = next;
    } else if (wireType === 1) {
      raw = 0n;
      pos += 8; // 64-bit fixed — unused by this message, skip
    } else if (wireType === 5) {
      raw = 0n;
      pos += 4; // 32-bit fixed — unused by this message, skip
    } else if (wireType === 2) {
      const [len, next] = readVarint(bytes, pos);
      pos = next + Number(len); // length-delimited — unused by this message, skip
      continue;
    } else {
      break; // unknown wire type — nothing safe to do, stop parsing
    }

    switch (fieldNumber) {
      case 1: out.speedKmh = Number(raw) / 100; break;
      case 2: out.cadenceRpm = Number(BigInt.asIntN(32, raw)); break;
      case 5: out.riderPowerW = Number(raw); break;
      case 9: out.ambientBrightnessLux = Number(raw) / 1000; break;
      case 10: out.batterySocPercent = Number(raw); break;
      case 11: out.timeUnixSeconds = Number(raw); break;
      case 12: out.odometerMeters = Number(raw); break;
      case 17: out.bikeLight = LightState[Number(raw)] || `UNKNOWN(${raw})`; break;
      case 21: out.systemLocked = raw !== 0n; break;
      case 22: out.chargerConnected = raw !== 0n; break;
      case 23: out.lightReserveState = raw !== 0n; break;
      case 24: out.diagnosisProgramActive = raw !== 0n; break;
      case 25: out.bikeNotDriving = raw !== 0n; break;
      default: break; // unrecognized field — forward-compat, ignore per spec
    }
  }
  return out;
}

async function requestLiveDataDevice() {
  return navigator.bluetooth.requestDevice({
    filters: [{ services: [LIVE_DATA_SERVICE_UUID] }],
    optionalServices: [LIVE_DATA_SERVICE_UUID],
  });
}

class Bes3LiveDataBleTransport {
  constructor(device) {
    this.device = device;
    this.characteristic = null;
    this._onData = null;
  }

  async connect() {
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(LIVE_DATA_SERVICE_UUID);
    this.characteristic = await service.getCharacteristic(LIVE_DATA_CHARACTERISTIC_UUID);
  }

  disconnect() {
    try {
      if (this.characteristic) {
        this.characteristic.removeEventListener('characteristicvaluechanged', this._handleNotify);
      }
      this.device.gatt.disconnect();
    } catch (_) {}
  }

  // Reads the characteristic once (server returns latest values of all
  // currently-available fields, per spec section 2.2.3.2).
  async readOnce() {
    const value = await this.characteristic.readValue();
    return decodeLiveData(new Uint8Array(value.buffer));
  }

  // Subscribes to change notifications; callback receives a partial
  // LiveData object containing only the fields that changed (per spec,
  // the server may also include some unchanged fields — known bug LDI-002
  // in the v19 release notes, harmless to ignore).
  async subscribe(callback) {
    this._onData = callback;
    this._handleNotify = (event) => {
      const bytes = new Uint8Array(event.target.value.buffer);
      this._onData(decodeLiveData(bytes));
    };
    this.characteristic.addEventListener('characteristicvaluechanged', this._handleNotify);
    await this.characteristic.startNotifications();
  }
}

window.Bes3LiveDataBle = {
  Bes3LiveDataBleTransport,
  requestLiveDataDevice,
  decodeLiveData,
  LIVE_DATA_SERVICE_UUID,
  LIVE_DATA_CHARACTERISTIC_UUID,
};
