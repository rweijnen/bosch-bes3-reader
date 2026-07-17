(function () {
  const { ALL_ADDRESSES } = window.Bes3Addresses;
  const { buildReadRequestFrame, parseReadResponseFrame, decodeValue } = window.Bes3Protocol;
  const { decodeTyped } = window.Bes3MessageTypes;
  const { Bes3WebUsbTransport, requestDevice } = window.Bes3WebUsb;

  const $ = (id) => document.getElementById(id);
  const els = {
    connectBtn: $('connectBtn'),
    themeToggle: $('themeToggle'),
    statusDot: $('statusDot'),
    statusLabel: $('statusLabel'),
    progressText: $('progressText'),
    emptyState: $('emptyState'),
    dashboard: $('dashboard'),
    webUsbWarning: $('webUsbWarning'),
    bikeName: $('bikeName'),
    bikeId: $('bikeId'),
    bikeSerial: $('bikeSerial'),
    bikeCategory: $('bikeCategory'),
    batterySoc: $('batterySoc'),
    batterySocUnit: $('batterySocUnit'),
    socBar: $('socBar'),
    batterySoh: $('batterySoh'),
    batteryCycles: $('batteryCycles'),
    batteryEnergy: $('batteryEnergy'),
    batteryTemp: $('batteryTemp'),
    driveUnitGrid: $('driveUnitGrid'),
    drivetrainGrid: $('drivetrainGrid'),
    usageGrid: $('usageGrid'),
    rawToggle: $('rawToggle'),
    rawSummary: $('rawSummary'),
    rawBody: $('rawBody'),
    rawRows: $('rawRows'),
    exportBtn: $('exportBtn'),
  };

  let state = 'disconnected'; // disconnected | connecting | connected
  let theme = null; // null = follow system
  let lastResults = []; // flat list of {component, name, addr, status, decoded, typed}
  let rawOpen = false;
  let transport = null;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---------- theme ----------
  function effectiveDark() {
    if (theme) return theme === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function applyTheme() {
    document.documentElement.dataset.theme = effectiveDark() ? 'dark' : 'light';
  }
  els.themeToggle.addEventListener('click', () => {
    theme = effectiveDark() ? 'light' : 'dark';
    applyTheme();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!theme) applyTheme();
  });
  applyTheme();

  // ---------- status chip ----------
  function renderStatus() {
    if (state === 'connected') {
      els.statusDot.style.background = 'var(--good)';
      els.statusDot.style.boxShadow = '0 0 6px var(--good)';
      els.statusDot.style.animation = 'none';
      els.statusLabel.textContent = 'USB · DRIVE UNIT · CONNECTED';
      els.connectBtn.textContent = 'Read again';
      els.connectBtn.disabled = false;
    } else if (state === 'connecting') {
      els.statusDot.style.background = 'var(--accent)';
      els.statusDot.style.boxShadow = 'none';
      els.statusDot.style.animation = 'pulse 1s infinite';
      els.statusLabel.textContent = 'USB · READING…';
      els.connectBtn.textContent = 'Reading…';
      els.connectBtn.disabled = true;
    } else {
      els.statusDot.style.background = 'var(--border2)';
      els.statusDot.style.boxShadow = 'none';
      els.statusDot.style.animation = 'none';
      els.statusLabel.textContent = 'NOT CONNECTED';
      els.connectBtn.textContent = 'Connect & Read';
      els.connectBtn.disabled = false;
    }
    els.emptyState.style.display = state === 'disconnected' ? 'flex' : 'none';
    els.dashboard.style.display = state === 'disconnected' ? 'none' : 'flex';
  }

  function setProgress(text) {
    if (!text) {
      els.progressText.style.display = 'none';
      return;
    }
    els.progressText.style.display = '';
    els.progressText.textContent = text;
  }

  // ---------- read plumbing ----------
  async function readOne(addr, seq) {
    const frame = buildReadRequestFrame(addr, seq);
    await transport.doMcspWrite(frame);
    const deadline = Date.now() + 400;
    while (Date.now() < deadline) {
      const raw = await transport.readNextFrame(5, 5);
      if (!raw) continue;
      const parsed = parseReadResponseFrame(raw);
      if (!parsed) continue;
      if (parsed.addrHigh !== (addr >> 8) || parsed.addrLow !== (addr & 0xff)) continue;
      return parsed.payload;
    }
    return null;
  }

  function findResult(component, name) {
    return lastResults.find((r) => r.component === component && r.name === name);
  }
  function displayOf(component, name, fallback) {
    const r = findResult(component, name);
    if (!r || r.status !== 'ok') return fallback ?? '—';
    const d = r.typed || r.decoded;
    return d ? d.display : fallback ?? '—';
  }
  function valueOf(component, name) {
    const r = findResult(component, name);
    if (!r || r.status !== 'ok' || !r.typed) return null;
    return r.typed.value;
  }

  function kvRow(container, label, value) {
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('span');
    v.textContent = value;
    container.appendChild(l);
    container.appendChild(v);
  }

  function renderDashboard() {
    // BIKE card
    els.bikeName.textContent = displayOf('DriveUnit', 'PRODUCT_NAME');
    els.bikeId.textContent = displayOf('DriveUnit', 'BIKE_ID');
    els.bikeSerial.textContent = displayOf('DriveUnit', 'SERIAL_NUMBER');
    els.bikeCategory.textContent = displayOf('DriveUnit', 'BIKE_CATEGORY');

    // BATTERY card
    const soc = valueOf('Battery', 'STATE_OF_CHARGE');
    els.batterySoc.textContent = soc == null ? '—' : soc;
    els.batterySocUnit.textContent = soc == null ? '' : '%';
    els.socBar.innerHTML = '';
    const segs = 5;
    const filled = soc == null ? 0 : Math.round((soc / 100) * segs);
    for (let i = 0; i < segs; i++) {
      const seg = document.createElement('div');
      seg.className = 'soc-seg' + (i < filled ? ' filled' : '');
      els.socBar.appendChild(seg);
    }
    els.batterySoh.textContent = displayOf('Battery', 'STATE_OF_HEALTH');
    els.batteryCycles.textContent = displayOf('Battery', 'NUMBER_OF_FULL_CHARGE_CYCLES');
    els.batteryEnergy.textContent = displayOf('Battery', 'REMAINING_ENERGY');
    els.batteryTemp.textContent = displayOf('Battery', 'PRESENT_PACK_TEMPERATURE');

    // DRIVE UNIT card
    els.driveUnitGrid.innerHTML = '';
    kvRow(els.driveUnitGrid, 'Product code', displayOf('DriveUnit', 'PRODUCT_CODE'));
    kvRow(els.driveUnitGrid, 'Part number', displayOf('DriveUnit', 'PART_NUMBER'));
    kvRow(els.driveUnitGrid, 'Hardware', displayOf('DriveUnit', 'HARDWARE_VERSION'));
    kvRow(els.driveUnitGrid, 'Software', displayOf('DriveUnit', 'SOFTWARE_VERSION'));
    kvRow(els.driveUnitGrid, 'Bootloader', displayOf('DriveUnit', 'BOOTLOADER_SOFTWARE_VERSION'));
    kvRow(els.driveUnitGrid, 'Product line', displayOf('DriveUnit', 'PRODUCT_LINE'));
    kvRow(els.driveUnitGrid, 'PCB temp', displayOf('DriveUnit', 'PRESENT_PCB_TEMPERATURE'));

    // DRIVETRAIN card
    els.drivetrainGrid.innerHTML = '';
    kvRow(els.drivetrainGrid, 'Gearing', displayOf('DriveUnit', 'GEARING_SYSTEM'));
    kvRow(els.drivetrainGrid, 'Max legal speed', displayOf('DriveUnit', 'MAXIMUM_LEGAL_BIKE_SPEED'));
    kvRow(els.drivetrainGrid, 'Max assist speed', displayOf('DriveUnit', 'MAXIMUM_ASSISTANCE_SPEED'));
    kvRow(els.drivetrainGrid, 'Wheel circ. (OEM)', displayOf('DriveUnit', 'REAR_WHEEL_CIRCUMFERENCE_OEM'));
    kvRow(els.drivetrainGrid, 'Region / speed class', displayOf('DriveUnit', 'REGIO_SPEED_CONFIGURATION'));
    const tuning = findResult('DriveUnit', 'TUNING_DETECTION');
    const tuningLabel =
      tuning && tuning.status === 'ok' && tuning.typed
        ? tuning.typed.value.flag
          ? `FLAGGED (x${tuning.typed.value.counter})`
          : 'CLEAN'
        : '—';
    const tRow = document.createElement('span');
    tRow.textContent = 'Tuning detection';
    const tVal = document.createElement('span');
    tVal.textContent = tuningLabel;
    if (tuningLabel === 'CLEAN') tVal.className = 'good';
    else if (tuningLabel.startsWith('FLAGGED')) tVal.className = 'bad';
    els.drivetrainGrid.appendChild(tRow);
    els.drivetrainGrid.appendChild(tVal);

    // USAGE card
    els.usageGrid.innerHTML = '';
    kvRow(els.usageGrid, 'Odometer', displayOf('DriveUnit', 'ODOMETER'));
    kvRow(els.usageGrid, 'Power-on time', displayOf('DriveUnit', 'POWER_ON_TIME'));
    kvRow(els.usageGrid, 'OEM bike ID', displayOf('DriveUnit', 'OEM_BIKE_ID'));
    kvRow(els.usageGrid, 'OEM brand', displayOf('DriveUnit', 'OEM_BRAND_NAME'));
  }

  function renderRawTable() {
    const attempted = lastResults.filter((r) => r.status !== 'skipped');
    els.rawSummary.innerHTML =
      (rawOpen ? '&#9662;' : '&#9656;') +
      ` RAW ADDRESS TABLE &mdash; ${attempted.length} data points read`;
    els.rawBody.style.display = rawOpen ? '' : 'none';
    if (!rawOpen) return;

    els.rawRows.innerHTML = '';
    for (const r of attempted) {
      const row = document.createElement('div');
      row.className = 'raw-row';
      const addrHex = '0x' + r.addr.toString(16).padStart(4, '0');
      const nameCell = document.createElement('span');
      nameCell.textContent = `${r.component}.${r.name}`;
      const addrCell = document.createElement('span');
      addrCell.textContent = addrHex;
      const markCell = document.createElement('span');
      markCell.className = 'typed-marker';
      markCell.textContent = r.typed ? '●' : '';
      const valCell = document.createElement('span');
      if (r.status === 'ok') {
        valCell.textContent = (r.typed || r.decoded).display;
      } else if (r.status === 'timeout') {
        valCell.textContent = '(no response / timeout)';
      } else {
        valCell.textContent = `(error: ${r.detail})`;
      }
      row.appendChild(nameCell);
      row.appendChild(addrCell);
      row.appendChild(markCell);
      row.appendChild(valCell);
      els.rawRows.appendChild(row);
    }
  }

  els.rawToggle.addEventListener('click', (e) => {
    if (e.target === els.exportBtn) return;
    rawOpen = !rawOpen;
    renderRawTable();
  });

  els.exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const report = {
      generatedAt: new Date().toISOString(),
      tool: 'bosch-bes3-reader',
      results: lastResults.map((r) => ({
        component: r.component,
        name: r.name,
        address: '0x' + r.addr.toString(16).padStart(4, '0'),
        status: r.status,
        typed: !!r.typed,
        value: r.status === 'ok' ? (r.typed || r.decoded).display : null,
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bes3-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ---------- main sweep ----------
  async function runSweep() {
    let device;
    try {
      device = await requestDevice();
    } catch (err) {
      return; // user cancelled the picker
    }

    state = 'connecting';
    renderStatus();

    transport = new Bes3WebUsbTransport(device);
    try {
      await transport.open();
    } catch (err) {
      state = 'disconnected';
      renderStatus();
      setProgress('');
      alert('Failed to open device: ' + err.message);
      return;
    }

    const readable = [];
    for (const [component, entries] of Object.entries(ALL_ADDRESSES)) {
      for (const e of entries) {
        if (e.readable === true) readable.push({ component, ...e });
      }
    }

    const results = [];
    let seq = 1;
    let done = 0;
    for (const entry of readable) {
      seq = (seq + 1) & 0xff;
      let payload = null;
      let status = 'ok';
      let detail = '';
      try {
        payload = await readOne(entry.addr, seq);
      } catch (err) {
        status = 'error';
        detail = err.message;
      }
      if (status === 'ok' && payload === null) status = 'timeout';

      let decoded = null;
      let typed = null;
      if (status === 'ok') {
        typed = decodeTyped(entry.addr, payload);
        decoded = typed || decodeValue(payload);
      }
      results.push({ ...entry, status, detail, decoded, typed });
      done++;
      setProgress(`reading ${done}/${readable.length} points…`);
      // live-update every ~20 reads so the dashboard fills in progressively
      if (done % 20 === 0) {
        lastResults = results;
        renderDashboard();
      }
      await sleep(15);
    }

    lastResults = results;
    state = 'connected';
    renderStatus();
    setProgress(`read ${results.filter((r) => r.status === 'ok').length}/${readable.length} points`);
    renderDashboard();
    renderRawTable();

    await transport.close();
  }

  els.connectBtn.addEventListener('click', () => {
    if (!('usb' in navigator)) {
      els.webUsbWarning.style.display = '';
      els.webUsbWarning.textContent =
        'WebUSB is not available in this browser. Use Chrome, Edge, or another Chromium-based browser on desktop.';
      return;
    }
    runSweep().catch((err) => {
      state = 'disconnected';
      renderStatus();
      setProgress('');
      alert('Unexpected error: ' + err.message);
    });
  });

  renderStatus();
})();
