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
    // The bike advertises the 16-bit service 0xFE02; the Live Data service UUID
    // below is only in the GATT table once connected, NOT in the advertisement.
    // Filtering on the LDI UUID directly matched no devices (empty picker) —
    // filter on the advertised service and request the LDI service as optional
    // so we can reach it after connecting.
    filters: [{ services: [0xfe02] }],
    optionalServices: [LIVE_DATA_SERVICE_UUID],
  });
}

class Bes3LiveDataBleTransport {
  constructor(device) {
    this.device = device;
    this.characteristic = null;
    this._onData = null;
  }

  // Windows Web Bluetooth flakes right after pairing — gatt.connect() (and the
  // discovery right after) can throw "Connection attempt failed" on the first
  // 1-2 tries then succeed. Retry with backoff, disconnecting any half-open link
  // between attempts. "Not paired" won't self-heal (missing OS bond) — bail out
  // early with guidance. Self-contained so it doesn't depend on helpers from the
  // other transport files (they share global scope).
  async connect() {
    const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    log && log('ble-live', `device: ${this.device.name || '(unnamed)'} id=${this.device.id}`);
    const backoffsMs = [0, 400, 900, 1600];
    let lastErr;
    for (let attempt = 0; attempt < backoffsMs.length; attempt++) {
      if (backoffsMs[attempt]) await delay(backoffsMs[attempt]);
      try {
        log && log('ble-live', `gatt.connect() attempt ${attempt + 1}/${backoffsMs.length}…`);
        const server = await this.device.gatt.connect();
        log && log('ble-live', 'connected, discovering Live Data service', LIVE_DATA_SERVICE_UUID);
        const service = await server.getPrimaryService(LIVE_DATA_SERVICE_UUID);
        this.characteristic = await service.getCharacteristic(LIVE_DATA_CHARACTERISTIC_UUID);
        log && log('ble-live', 'connect() complete');
        return;
      } catch (err) {
        lastErr = err;
        log && log('ble-live', `connect attempt ${attempt + 1}/${backoffsMs.length} failed: ${err.message}`);
        try { this.device.gatt.disconnect(); } catch (_) {}
        if (/not paired|encryption|not authori|authentication/i.test(err.message || '')) break;
      }
    }
    const m = (lastErr && lastErr.message) || String(lastErr) || 'unknown error';
    if (/not paired|encryption|not authori|authentication/i.test(m)) {
      throw new Error(`Bike not paired. Pair "smart system eBike" in Windows Bluetooth settings (with the bike in pairing mode), then reconnect. [${m}]`);
    }
    if (/connection attempt failed|unreachable|gatt operation failed|no longer|disconnected|not connected/i.test(m)) {
      throw new Error(`Could not reach the bike over BLE. Make sure it's awake, in range, and (first time) in pairing mode, then try again — Windows BLE often needs a couple of attempts. [${m}]`);
    }
    throw new Error(m);
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
    const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
    log && log('ble-live', 'readValue()…');
    const value = await this.characteristic.readValue();
    const bytes = new Uint8Array(value.buffer);
    log && log('ble-live', `readValue() returned ${bytes.length} bytes`, bytes);
    const decoded = decodeLiveData(bytes);
    log && log('ble-live', 'decoded', JSON.stringify(decoded));
    return decoded;
  }

  // Subscribes to change notifications; callback receives a partial
  // LiveData object containing only the fields that changed (per spec,
  // the server may also include some unchanged fields — known bug LDI-002
  // in the v19 release notes, harmless to ignore).
  async subscribe(callback) {
    const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
    this._onData = callback;
    this._handleNotify = (event) => {
      const bytes = new Uint8Array(event.target.value.buffer);
      log && log('ble-live', `notification (${bytes.length} bytes)`, bytes);
      const decoded = decodeLiveData(bytes);
      log && log('ble-live', 'decoded', JSON.stringify(decoded));
      this._onData(decoded);
    };
    this.characteristic.addEventListener('characteristicvaluechanged', this._handleNotify);
    log && log('ble-live', 'startNotifications()…');
    await this.characteristic.startNotifications();
    log && log('ble-live', 'subscribed');
  }
}

window.Bes3LiveDataBle = {
  Bes3LiveDataBleTransport,
  requestLiveDataDevice,
  decodeLiveData,
  LIVE_DATA_SERVICE_UUID,
  LIVE_DATA_CHARACTERISTIC_UUID,
};
