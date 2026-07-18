// UI wiring for the official BLE Live Data Interface (see transport-webble.js).
// Deliberately kept separate from app.js's USB sweep state machine — this is
// an independent, unrelated connection/data path (different transport,
// different Bosch-sanctioned service, different data set).

(function () {
  const FIELD_LABELS = {
    speedKmh: ['Speed', (v) => `${v.toFixed(1)} km/h`],
    cadenceRpm: ['Cadence', (v) => `${v} rpm`],
    riderPowerW: ['Rider power', (v) => `${v} W`],
    ambientBrightnessLux: ['Ambient brightness', (v) => `${v.toFixed(1)} lux`],
    batterySocPercent: ['Battery SoC', (v) => `${v}%`],
    timeUnixSeconds: ['Bike time (UTC)', (v) => new Date(v * 1000).toISOString()],
    odometerMeters: ['Odometer', (v) => `${(v / 1000).toFixed(1)} km`],
    bikeLight: ['Bike light', (v) => v],
    systemLocked: ['System locked', (v) => (v ? 'yes' : 'no')],
    chargerConnected: ['Charger connected', (v) => (v ? 'yes' : 'no')],
    lightReserveState: ['Light reserve', (v) => (v ? 'yes' : 'no')],
    diagnosisProgramActive: ['Diagnosis tool connected', (v) => (v ? 'yes' : 'no')],
    bikeNotDriving: ['Bike not driving', (v) => (v ? 'yes' : 'no')],
  };

  const state = {};
  let transport = null;

  function render() {
    const grid = document.getElementById('bleLiveGrid');
    grid.innerHTML = '';
    for (const [key, [label, fmt]] of Object.entries(FIELD_LABELS)) {
      const hasValue = Object.prototype.hasOwnProperty.call(state, key);
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      const valueEl = document.createElement('span');
      valueEl.textContent = hasValue ? fmt(state[key]) : '—';
      grid.appendChild(labelEl);
      grid.appendChild(valueEl);
    }
  }

  async function connectBle() {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth is not available in this browser (needs Chrome/Edge on desktop or Android).');
      return;
    }
    try {
      const device = await Bes3LiveDataBle.requestLiveDataDevice();
      transport = new Bes3LiveDataBle.Bes3LiveDataBleTransport(device);
      await transport.connect();
      document.getElementById('bleLivePanel').style.display = '';

      Object.assign(state, await transport.readOnce());
      render();

      await transport.subscribe((partial) => {
        Object.assign(state, partial);
        render();
      });

      device.addEventListener('gattserverdisconnected', () => {
        document.getElementById('bleLivePanel').style.display = 'none';
      });
    } catch (err) {
      if (err && err.name === 'NotFoundError') return; // user cancelled the chooser
      console.error(err);
      alert(`BLE connection failed: ${err.message || err}`);
    }
  }

  document.getElementById('connectBleBtn').addEventListener('click', connectBle);
})();
