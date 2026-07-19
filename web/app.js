(function () {
  const { ALL_ADDRESSES } = window.Bes3Addresses;
  const {
    buildReadRequestFrame, buildRpcCallFrame, buildRpcCallFrameWithArg,
    encodeConfigIdArg, decodeAssistModeStatistics, decodeConfigIdList,
    parseReadResponseFrame, decodeValue,
  } = window.Bes3Protocol;
  const { decodeTyped } = window.Bes3MessageTypes;
  const { Bes3WebUsbTransport, requestDevice } = window.Bes3WebUsb;
  const { Bes3LiveDataBleTransport, requestLiveDataDevice } = window.Bes3LiveDataBle;

  const $ = (id) => document.getElementById(id);
  const els = {
    debugLogBtn: $('debugLogBtn'),
    themeToggle: $('themeToggle'),
    statusDot: $('statusDot'),
    statusLabel: $('statusLabel'),
    progressText: $('progressText'),
    cancelBtn: $('cancelBtn'),
    disconnectBtn: $('disconnectBtn'),
    readAgainBtn: $('readAgainBtn'),

    chooserScreen: $('chooserScreen'),
    pickUsbBtn: $('pickUsbBtn'),
    pickBleBtn: $('pickBleBtn'),
    methodBlurb: $('methodBlurb'),
    methodReq: $('methodReq'),
    bleUnsupportedWarn: $('bleUnsupportedWarn'),
    fullReadToggleRow: $('fullReadToggleRow'),
    attemptFullBleRead: $('attemptFullBleRead'),
    connectErrorBox: $('connectErrorBox'),
    connectErrorText: $('connectErrorText'),
    connectMainBtn: $('connectMainBtn'),

    scanningScreen: $('scanningScreen'),
    cancelScanBtn: $('cancelScanBtn'),

    connectingScreen: $('connectingScreen'),
    connectingTitle: $('connectingTitle'),
    connectingBar: $('connectingBar'),
    connectingSub: $('connectingSub'),
    cancelConnectingBtn: $('cancelConnectingBtn'),

    dashboard: $('dashboard'),
    bikeName: $('bikeName'),
    bikeId: $('bikeId'),
    bikeSerial: $('bikeSerial'),
    bikeCategory: $('bikeCategory'),
    bikeIconFallback: $('bikeIconFallback'),
    bikePhotoWrap: $('bikePhotoWrap'),
    bikePhoto: $('bikePhoto'),
    bikePhotoCaption: $('bikePhotoCaption'),
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
    assistModeHistogram: $('assistModeHistogram'),
    rawToggle: $('rawToggle'),
    rawSummary: $('rawSummary'),
    rawBody: $('rawBody'),
    rawRows: $('rawRows'),
    exportBtn: $('exportBtn'),
    loginBtn: $('loginBtn'),
    loginSoonNote: $('loginSoonNote'),

    bleDashboard: $('bleDashboard'),
    bleLiveGrid: $('bleLiveGrid'),
    loginBtnBle: $('loginBtnBle'),
    loginSoonNoteBle: $('loginSoonNoteBle'),

    disclaimerModal: $('disclaimerModal'),
    ackCheckbox: $('ackCheckbox'),
    acceptDisclaimerBtn: $('acceptDisclaimerBtn'),
  };

  // phase: idle | scanning (ble only) | connecting | connected
  let phase = 'idle';
  let method = 'usb'; // usb | ble
  let theme = null; // null = follow system
  let lastResults = []; // USB: flat list of {component, name, addr, status, decoded, typed}
  let rawOpen = false;
  let transport = null;
  let abortRequested = false;
  let bleLiveState = {};
  // Set when the bike drops off AFTER a read completed (its results are on
  // screen). Lets us keep the dashboard instead of wiping back to the start
  // screen — a post-read disconnect (usually the bike sleeping) is not a failure.
  let disconnectedAfterRead = false;

  // ---------- disclaimer (first run) ----------
  const ACK_KEY = 'bes3-risk-ack';
  function initDisclaimer() {
    let acked = false;
    try { acked = localStorage.getItem(ACK_KEY) === '1'; } catch (_) {}
    els.disclaimerModal.style.display = acked ? 'none' : 'flex';
  }
  els.ackCheckbox.addEventListener('change', () => {
    els.acceptDisclaimerBtn.disabled = !els.ackCheckbox.checked;
  });
  els.acceptDisclaimerBtn.addEventListener('click', () => {
    if (!els.ackCheckbox.checked) return;
    try { localStorage.setItem(ACK_KEY, '1'); } catch (_) {}
    els.disclaimerModal.style.display = 'none';
  });

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

  els.debugLogBtn.addEventListener('click', () => {
    if (window.Bes3DebugLog) window.Bes3DebugLog.download();
  });

  // ---------- cloud lookups (not implemented yet) ----------
  // Deliberately NOT a login form: a UI that visually collects real Bosch
  // credentials without actually authenticating is a phishing-shaped pattern
  // regardless of intent. Real OAuth (PKCE against Bosch's Keycloak realm) is
  // a separate, not-yet-solved piece of work — see private research notes on
  // the redirect-handling problem for a static client-only page.
  function wireComingSoon(button, note) {
    button.addEventListener('click', () => {
      note.style.display = 'inline';
      setTimeout(() => { note.style.display = 'none'; }, 2500);
    });
  }
  wireComingSoon(els.loginBtn, els.loginSoonNote);
  wireComingSoon(els.loginBtnBle, els.loginSoonNoteBle);

  // ---------- phase / screen rendering ----------
  function renderPhase() {
    els.chooserScreen.style.display = phase === 'idle' ? 'flex' : 'none';
    els.scanningScreen.style.display = phase === 'scanning' ? 'flex' : 'none';
    els.connectingScreen.style.display = phase === 'connecting' ? 'flex' : 'none';
    els.dashboard.style.display = phase === 'connected' && (method === 'usb' || method === 'ble-mcsp') ? 'flex' : 'none';
    els.bleDashboard.style.display = phase === 'connected' && method === 'ble' ? 'flex' : 'none';

    els.cancelBtn.style.display = 'none'; // scanning/connecting screens have their own cancel buttons
    // Nothing to disconnect once the bike has already dropped; keep "Read again".
    els.disconnectBtn.style.display = phase === 'connected' && !disconnectedAfterRead ? '' : 'none';
    els.readAgainBtn.style.display = phase === 'connected' ? '' : 'none';

    if (phase === 'connected' && disconnectedAfterRead) {
      els.statusDot.style.background = 'var(--muted)';
      els.statusDot.style.boxShadow = 'none';
      els.statusDot.style.animation = 'none';
      els.statusLabel.textContent = 'DISCONNECTED · SHOWING LAST READ';
    } else if (phase === 'connected') {
      els.statusDot.style.background = 'var(--good)';
      els.statusDot.style.boxShadow = '0 0 6px var(--good)';
      els.statusDot.style.animation = 'none';
      els.statusLabel.textContent = method === 'ble' ? 'BLUETOOTH · CONNECTED'
        : method === 'ble-mcsp' ? 'BLUETOOTH · FULL READ (EXPERIMENTAL) · CONNECTED'
        : 'USB · DRIVE UNIT · CONNECTED';
    } else if (phase === 'connecting' || phase === 'scanning') {
      els.statusDot.style.background = 'var(--accent)';
      els.statusDot.style.boxShadow = 'none';
      els.statusDot.style.animation = 'pulse 1s infinite';
      els.statusLabel.textContent = phase === 'scanning' ? 'BLUETOOTH · SCANNING…'
        : method === 'ble' ? 'BLUETOOTH · CONNECTING…'
        : method === 'ble-mcsp' ? 'BLUETOOTH · READING (EXPERIMENTAL)…'
        : 'USB · READING…';
    } else {
      els.statusDot.style.background = 'var(--border2)';
      els.statusDot.style.boxShadow = 'none';
      els.statusDot.style.animation = 'none';
      els.statusLabel.textContent = 'NOT CONNECTED';
    }
  }

  function setProgress(text) {
    if (!text) {
      els.progressText.style.display = 'none';
      return;
    }
    els.progressText.style.display = '';
    els.progressText.textContent = text;
  }

  function renderChooser() {
    const isBle = method === 'ble';
    els.pickUsbBtn.classList.toggle('active', !isBle);
    els.pickBleBtn.classList.toggle('active', isBle);
    els.methodBlurb.textContent = isBle
      ? 'Wireless link over Bluetooth (Bosch’s official Live Data Interface). Make sure Bluetooth is enabled on this device and the bike is switched on and awake.'
      : 'Wired link to the drive unit over USB-C. The most complete path — full access, no fields denied.';
    els.methodReq.textContent = isBle
      ? 'Requires Chrome or Edge on desktop or Android (Web Bluetooth). Uses Bosch’s official Live Data Interface — ride telemetry only, no battery health or serials. The experimental full-read option below reads the same ~370 points as USB, but a set of config/manufacturing/test fields are denied over BLE (dealer-tool-only access).'
      : 'Requires Chrome or Edge on desktop (WebUSB).';
    const bleSupported = 'bluetooth' in navigator;
    const locked = isBle && !bleSupported;
    els.bleUnsupportedWarn.style.display = locked ? 'flex' : 'none';
    els.fullReadToggleRow.style.display = isBle ? 'flex' : 'none';
    els.connectMainBtn.disabled = locked;
    els.connectMainBtn.style.cursor = locked ? 'default' : 'pointer';
    els.connectMainBtn.style.opacity = locked ? '0.6' : '1';
    els.connectMainBtn.textContent = isBle && els.attemptFullBleRead.checked ? 'Scan for bike (experimental)' : isBle ? 'Scan for bike' : 'Connect & Read';
  }
  els.attemptFullBleRead.addEventListener('change', renderChooser);
  function showConnectError(message) {
    if (!message) {
      els.connectErrorBox.style.display = 'none';
      return;
    }
    els.connectErrorBox.style.display = 'flex';
    els.connectErrorText.textContent = message;
  }

  els.pickUsbBtn.addEventListener('click', () => { method = 'usb'; showConnectError(''); renderChooser(); });
  els.pickBleBtn.addEventListener('click', () => { method = 'ble'; showConnectError(''); renderChooser(); });

  function goIdle(message) {
    if (message && window.Bes3DebugLog) window.Bes3DebugLog.log('app', 'goIdle', message);
    abortRequested = false;
    disconnectedAfterRead = false;
    phase = 'idle';
    transport = null;
    renderPhase();
    setProgress('');
    showConnectError(message || '');
    renderChooser();
  }

  // ---------- disconnect (both transports) ----------
  function handleDisconnect(auto) {
    if (phase !== 'connected' && phase !== 'connecting' && phase !== 'scanning') return;
    stopKeepAlive();
    // A read already completed and its results are on screen (phase 'connected').
    // A disconnect now — typically the bike sleeping right after the sweep — must
    // NOT wipe the dashboard back to the start screen. Keep the data, mark the
    // bike as gone, and let "Read again" re-scan when the user wants fresh data.
    if (phase === 'connected') {
      transport = null;
      disconnectedAfterRead = true;
      renderPhase();
      if (auto) setProgress(method === 'ble' ? 'bike disconnected — showing last live values' : 'bike disconnected — showing the last read');
      return;
    }
    const wasMethod = method;
    goIdle(auto ? 'bike disconnected — power it on and connect again' : '');
    if (auto) setProgress(wasMethod === 'ble' ? 'bike disconnected' : 'bike disconnected — power it on and read again');
  }

  if ('usb' in navigator) {
    navigator.usb.addEventListener('disconnect', (e) => {
      if (method === 'usb' && (!transport || !transport.device || e.device === transport.device)) {
        handleDisconnect(true);
      }
    });
  }

  els.disconnectBtn.addEventListener('click', () => {
    if (method === 'ble' && transport) transport.disconnect();
    else if (transport) { stopKeepAlive(); try { transport.close(); } catch (_) {} }
    goIdle('');
  });
  els.readAgainBtn.addEventListener('click', () => {
    const wasMethod = method;
    if (wasMethod === 'ble' && transport) { try { transport.disconnect(); } catch (_) {} }
    else if (transport) { stopKeepAlive(); try { transport.close(); } catch (_) {} }
    transport = null;
    if (wasMethod === 'ble') connectBle();
    else if (wasMethod === 'ble-mcsp') runSweep('ble-mcsp');
    else runSweep('usb');
  });
  function cancelInFlight() {
    abortRequested = true;
    if (phase === 'scanning') goIdle('');
    setProgress('cancelling…');
  }
  els.cancelScanBtn.addEventListener('click', cancelInFlight);
  els.cancelConnectingBtn.addEventListener('click', cancelInFlight);

  els.connectMainBtn.addEventListener('click', () => {
    showConnectError('');
    const picked = method === 'ble' ? (els.attemptFullBleRead.checked ? 'ble-mcsp (experimental full read)' : 'ble (official Live Data Interface)') : 'usb';
    if (window.Bes3DebugLog) window.Bes3DebugLog.log('app', 'Connect clicked', picked);
    if (method === 'ble') {
      if (!('bluetooth' in navigator)) return;
      if (els.attemptFullBleRead.checked) runSweep('ble-mcsp');
      else connectBle();
    } else {
      if (!('usb' in navigator)) {
        showConnectError('WebUSB is not available in this browser. Use Chrome, Edge, or another Chromium-based browser on desktop.');
        return;
      }
      runSweep('usb');
    }
  });

  // ================= USB: full MessageBus sweep =================

  // RemoteControlAddresses.RESET_INACTIVITY_SHUTDOWN_TIMER (8454 = 0x2106) —
  // an argument-less RPC call, not a read. The stock tool fires this
  // essentially continuously while a diagnostic session is open; without it
  // the bike's inactivity timer eventually shuts the session down and the
  // controller drops off USB mid-sweep. See private research notes for how
  // this was found (it's also the source of the "0xa1 0x06" frames that
  // looked like an unexplained heartbeat in the very first capture).
  const KEEP_ALIVE_ADDR = 8454;
  const KEEP_ALIVE_INTERVAL_MS = 800;
  let keepAliveTimer = null;
  let keepAliveSeq = 0;

  function startKeepAlive() {
    stopKeepAlive();
    keepAliveTimer = setInterval(() => {
      if (!transport) return;
      keepAliveSeq = (keepAliveSeq + 1) & 0x0f;
      transport.doMcspWrite(buildRpcCallFrame(KEEP_ALIVE_ADDR, keepAliveSeq)).catch(() => {});
    }, KEEP_ALIVE_INTERVAL_MS);
  }
  function stopKeepAlive() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Fields worth painting first, so the dashboard fills in immediately instead of
  // after a full ~2 min sweep. Ordered most-interesting-first; the rest backfill.
  const PRIORITY = [
    ['DriveUnit', 'SERIAL_NUMBER'], ['DriveUnit', 'PRODUCT_CODE'], ['DriveUnit', 'PRODUCT_NAME'],
    ['DriveUnit', 'PRODUCT_LINE'], ['DriveUnit', 'SOFTWARE_VERSION'], ['DriveUnit', 'HARDWARE_VERSION'],
    ['DriveUnit', 'BOOTLOADER_SOFTWARE_VERSION'], ['DriveUnit', 'BIKE_ID'], ['DriveUnit', 'BIKE_CATEGORY'],
    ['DriveUnit', 'MAXIMUM_LEGAL_BIKE_SPEED'], ['DriveUnit', 'MAXIMUM_ASSISTANCE_SPEED'],
    ['DriveUnit', 'REGIO_SPEED_CONFIGURATION'], ['DriveUnit', 'REAR_WHEEL_CIRCUMFERENCE_OEM'],
    ['DriveUnit', 'TUNING_DETECTION'], ['DriveUnit', 'ODOMETER'], ['DriveUnit', 'POWER_ON_TIME'],
    ['DriveUnit', 'GEARING_SYSTEM'], ['DriveUnit', 'PRESENT_PCB_TEMPERATURE'],
    ['DriveUnit', 'OEM_BIKE_ID'], ['DriveUnit', 'OEM_BRAND_NAME'],
    ['Battery', 'STATE_OF_CHARGE'], ['Battery', 'STATE_OF_HEALTH'], ['Battery', 'PRODUCT_CODE'],
    ['Battery', 'PRODUCT_NAME'], ['Battery', 'NUMBER_OF_FULL_CHARGE_CYCLES'],
    ['Battery', 'REMAINING_ENERGY'], ['Battery', 'PRESENT_PACK_TEMPERATURE'],
  ];

  // Always present on a Smart System bike — exempt from the absent-component skip.
  const CORE_COMPONENTS = new Set(['DriveUnit', 'Battery', 'RemoteControl']);

  // Reads one address. Two things make this reliable:
  //  1. Pre-drain: clear any late/stale frame left in the bridge buffer from a
  //     previous read BEFORE sending, so it can't be mistaken for this response.
  //  2. Retry: resend a couple of times; present fields almost always answer on
  //     the first try, but the occasional miss is recovered instead of shown "—".
  let seqCounter = 0;
  function nextSeq() {
    seqCounter = (seqCounter + 1) & 0x0f;
    return seqCounter;
  }

  async function readOne(addr) {
    for (let attempt = 0; attempt < 2; attempt++) {
      for (let i = 0; i < 4; i++) {
        if (!(await transport.readNextFrame(1, 2))) break; // drain stale frames
      }
      await transport.doMcspWrite(buildReadRequestFrame(addr, nextSeq()));
      const deadline = Date.now() + 300;
      while (Date.now() < deadline) {
        const raw = await transport.readNextFrame(4, 4);
        if (!raw) continue;
        const parsed = parseReadResponseFrame(raw);
        if (!parsed) continue;
        if (parsed.addrHigh !== (addr >> 8) || parsed.addrLow !== (addr & 0xff)) continue;
        if (!parsed.ok) return { declined: true, statusName: parsed.statusName };
        return { payload: parsed.payload };
      }
    }
    return null;
  }

  // Ride distance per assist mode — a CallableDataPoint RPC
  // (GET_ASSIST_MODE_STATISTICS), not a plain read: takes a ConfigId{value:
  // string} argument, returns AssistModeStatistics{distance, consumedEnergy}.
  //
  // The ConfigId argument is NOT "1".."4" — that was this file's first cut
  // and a real hardware test proved it wrong (mismatched names/colors,
  // confirming the wrong modes were being queried). Traced properly against
  // Flow's own decompiled source (com.bosch.ebike.appcore.bike.internal.
  // datasources.ebike.readers.driveunit.AssistModeRefKt): Flow builds its
  // list of ConfigIds from `ACTIVE_ASSIST_MODES` (`ArrayOf4ActiveAssistModeIdentifier`,
  // `repeated ConfigId`) plus a hardcoded `ConfigId("0")` prepended for the
  // off/walk mode (`createOffAssistModeRef`) — so the real per-mode IDs are
  // whatever strings the bike itself reports there (e.g. "A100M0002"), read
  // fresh each session, never guessed. See src/protocol.js's decodeConfigIdList.
  //
  // Names/colors: AssistModeInformation's nameShort/nameLong/color turned out
  // NOT to match what the Flow app displays (also confirmed by hardware
  // test) — traced why: AssistModePositionEnum only has generic
  // ASSIST_MODE_POSITION0..4 values, and no jar in this project (DiagnosticTool
  // 3 or Flow) contains a name/color lookup keyed off it — that mapping is a
  // client-side-only UI convention inside Flow, not bike-reported data. So
  // this histogram uses its own fixed design palette and generic position
  // labels instead of asserting a "real" name/color that isn't actually
  // sourced from the bike.
  const ASSIST_MODE_STATS_ADDR = (ALL_ADDRESSES.DriveUnit.find((e) => e.name === 'GET_ASSIST_MODE_STATISTICS') || {}).addr;
  const ACTIVE_ASSIST_MODES_ADDR = (ALL_ADDRESSES.DriveUnit.find((e) => e.name === 'ACTIVE_ASSIST_MODES') || {}).addr;
  const ASSIST_MODE_PALETTE = ['#8a8f98', '#4caf50', '#2196f3', '#ff9800', '#e53935', '#9c27b0'];
  let assistModeStats = []; // [{ index, configId, label, status, distance, consumedEnergy, detail, color }]

  async function rpcCallWithConfigId(addr, configId, decodeFn) {
    const arg = encodeConfigIdArg(configId);
    const dlog = window.Bes3DebugLog;
    for (let attempt = 0; attempt < 2; attempt++) {
      for (let i = 0; i < 4; i++) {
        if (!(await transport.readNextFrame(1, 2))) break; // drain stale frames
      }
      const frame = buildRpcCallFrameWithArg(addr, nextSeq(), arg);
      if (dlog) dlog.log('assist-rpc', `-> addr 0x${addr.toString(16)} configId="${configId}" attempt ${attempt}`, frame);
      await transport.doMcspWrite(frame);
      const deadline = Date.now() + 500; // RPC round-trip can be slower than a plain read
      while (Date.now() < deadline) {
        const raw = await transport.readNextFrame(4, 4);
        if (!raw) continue;
        if (dlog) dlog.log('assist-rpc', '<- raw frame', raw);
        const parsed = parseReadResponseFrame(raw);
        if (!parsed) continue;
        if (parsed.addrHigh !== (addr >> 8) || parsed.addrLow !== (addr & 0xff)) continue;
        if (!parsed.ok) {
          if (dlog) dlog.log('assist-rpc', `<- declined: ${parsed.statusName}`);
          return { declined: true, statusName: parsed.statusName };
        }
        if (dlog) dlog.log('assist-rpc', '<- ok, payload', parsed.payload);
        return decodeFn(parsed.payload);
      }
    }
    if (dlog) dlog.log('assist-rpc', `<- timeout, no matching response for addr 0x${addr.toString(16)}`);
    return null;
  }

  async function readAllAssistModeStats() {
    assistModeStats = [];
    if (!ASSIST_MODE_STATS_ADDR || !ACTIVE_ASSIST_MODES_ADDR) return;

    const activeModes = await readOne(ACTIVE_ASSIST_MODES_ADDR);
    const dlog = window.Bes3DebugLog;
    if (dlog) dlog.log('assist-rpc', 'ACTIVE_ASSIST_MODES read result', activeModes && activeModes.payload ? activeModes.payload : JSON.stringify(activeModes));
    const configIds = ['0']; // off/walk — confirmed hardcoded in Flow, always first
    if (activeModes && !activeModes.declined && activeModes.payload) {
      for (const id of decodeConfigIdList(activeModes.payload)) {
        if (id && !configIds.includes(id)) configIds.push(id);
      }
    }
    if (dlog) dlog.log('assist-rpc', 'resolved configIds', JSON.stringify(configIds));

    configIds.forEach((configId, index) => {
      if (!assistModeStats.some((e) => e.configId === configId)) {
        assistModeStats.push({ index, configId, label: index === 0 ? 'Off / walk' : `Position ${index}`, color: ASSIST_MODE_PALETTE[index % ASSIST_MODE_PALETTE.length] });
      }
    });

    for (const entry of assistModeStats) {
      if (phase !== 'connecting' || !transport) return;
      try {
        const r = await rpcCallWithConfigId(ASSIST_MODE_STATS_ADDR, entry.configId, decodeAssistModeStatistics);
        if (!r) entry.status = 'timeout';
        else if (r.declined) { entry.status = 'declined'; entry.detail = r.statusName; }
        else { entry.status = 'ok'; entry.distance = r.distance; entry.consumedEnergy = r.consumedEnergy; }
      } catch (err) {
        entry.status = 'error';
        entry.detail = err.message;
      }
    }
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

  // ---------- bike photo (public "emd" catalog cache, no login/OAuth) ----------
  // Bosch publishes an unauthenticated bike-model catalog (brand/model
  // pictures keyed by GTIN) on bosch-ebike.com. `tools/build-model-cache.mjs`
  // pre-resolves that catalog offline into web/data/bike-model-cache.json,
  // which is all this ever loads — no per-user API call, no OAuth token.
  let modelCache = null; // null = not loaded yet, Map once loaded
  let modelCacheLoading = null;
  function loadModelCache() {
    if (modelCache) return Promise.resolve(modelCache);
    if (modelCacheLoading) return modelCacheLoading;
    modelCacheLoading = fetch('web/data/bike-model-cache.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        modelCache = new Map(data ? Object.entries(data.models) : []);
        return modelCache;
      })
      .catch(() => {
        modelCache = new Map();
        return modelCache;
      });
    return modelCacheLoading;
  }

  function renderBikePhoto() {
    const gtin = valueOf('DriveUnit', 'OEM_BIKE_MODEL_ID');
    const showFallback = () => {
      els.bikePhotoWrap.style.display = 'none';
      els.bikeIconFallback.style.display = '';
    };
    if (!gtin) { showFallback(); return; }
    loadModelCache().then((cache) => {
      // Bail if the dashboard has moved on to a different bike/read since
      // this lookup started (cache fetch is async).
      if (valueOf('DriveUnit', 'OEM_BIKE_MODEL_ID') !== gtin) return;
      const entry = cache.get(String(gtin));
      if (!entry || !entry.imageUrl) { showFallback(); return; }
      els.bikePhoto.src = entry.imageUrl;
      els.bikePhoto.alt = `${entry.brand || ''} ${entry.model || ''}`.trim();
      els.bikePhotoCaption.textContent = [entry.brand, entry.model, entry.modelYear]
        .filter(Boolean).join(' · ');
      els.bikePhotoWrap.style.display = '';
      els.bikeIconFallback.style.display = 'none';
    });
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
    els.bikeName.textContent = displayOf('DriveUnit', 'PRODUCT_NAME');
    els.bikeId.textContent = displayOf('DriveUnit', 'BIKE_ID');
    els.bikeSerial.textContent = displayOf('DriveUnit', 'SERIAL_NUMBER');
    els.bikeCategory.textContent = displayOf('DriveUnit', 'BIKE_CATEGORY');
    renderBikePhoto();

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

    els.driveUnitGrid.innerHTML = '';
    kvRow(els.driveUnitGrid, 'Product code', displayOf('DriveUnit', 'PRODUCT_CODE'));
    kvRow(els.driveUnitGrid, 'Part number', displayOf('DriveUnit', 'PART_NUMBER'));
    kvRow(els.driveUnitGrid, 'Hardware', displayOf('DriveUnit', 'HARDWARE_VERSION'));
    kvRow(els.driveUnitGrid, 'Software', displayOf('DriveUnit', 'SOFTWARE_VERSION'));
    kvRow(els.driveUnitGrid, 'Bootloader', displayOf('DriveUnit', 'BOOTLOADER_SOFTWARE_VERSION'));
    kvRow(els.driveUnitGrid, 'Product line', displayOf('DriveUnit', 'PRODUCT_LINE'));
    kvRow(els.driveUnitGrid, 'PCB temp', displayOf('DriveUnit', 'PRESENT_PCB_TEMPERATURE'));

    els.drivetrainGrid.innerHTML = '';
    kvRow(els.drivetrainGrid, 'Gearing', displayOf('DriveUnit', 'GEARING_SYSTEM'));
    kvRow(els.drivetrainGrid, 'Max legal speed', displayOf('DriveUnit', 'MAXIMUM_LEGAL_BIKE_SPEED'));
    kvRow(els.drivetrainGrid, 'Max assist speed', displayOf('DriveUnit', 'MAXIMUM_ASSISTANCE_SPEED'));
    kvRow(els.drivetrainGrid, 'Wheel circ. (OEM)', displayOf('DriveUnit', 'REAR_WHEEL_CIRCUMFERENCE_OEM'));
    kvRow(els.drivetrainGrid, 'Wheel circ. (user)', displayOf('DriveUnit', 'REAR_WHEEL_CIRCUMFERENCE_USER'));
    kvRow(els.drivetrainGrid, 'Max motor torque', displayOf('DriveUnit', 'MAXIMUM_AVAILABLE_MOTOR_TORQUE'));
    kvRow(els.drivetrainGrid, 'Region / speed class', displayOf('DriveUnit', 'REGIO_SPEED_CONFIGURATION'));
    const tuning = findResult('DriveUnit', 'TUNING_DETECTION');
    const tv = tuning && tuning.status === 'ok' && tuning.typed ? tuning.typed.value : null;
    const tuningLabel =
      tv && typeof tv === 'object' ? (tv.flag ? `FLAGGED (x${tv.counter})` : 'CLEAN') : '—';
    const tRow = document.createElement('span');
    tRow.textContent = 'Tuning detection';
    const tVal = document.createElement('span');
    tVal.textContent = tuningLabel;
    if (tuningLabel === 'CLEAN') tVal.className = 'good';
    else if (tuningLabel.startsWith('FLAGGED')) tVal.className = 'bad';
    els.drivetrainGrid.appendChild(tRow);
    els.drivetrainGrid.appendChild(tVal);

    els.usageGrid.innerHTML = '';
    const odometerM = valueOf('DriveUnit', 'ODOMETER');
    kvRow(els.usageGrid, 'Odometer (total)', odometerM == null ? '—' : `${(odometerM / 1000).toFixed(1)} km`);
    kvRow(els.usageGrid, 'Power-on time', displayOf('DriveUnit', 'POWER_ON_TIME'));
    kvRow(els.usageGrid, 'OEM bike ID', displayOf('DriveUnit', 'OEM_BIKE_ID'));
    kvRow(els.usageGrid, 'OEM brand', displayOf('DriveUnit', 'OEM_BRAND_NAME'));

    renderAssistModeHistogram();
  }

  function renderAssistModeHistogram() {
    const okEntries = assistModeStats.filter((e) => e.status === 'ok' && e.distance != null);
    els.assistModeHistogram.style.display = assistModeStats.length ? '' : 'none';
    els.assistModeHistogram.innerHTML = '';
    if (!assistModeStats.length) return;
    const maxDistance = Math.max(1, ...okEntries.map((e) => e.distance));
    for (const entry of assistModeStats) {
      const row = document.createElement('div');
      row.className = 'histogram-row';
      const label = document.createElement('span');
      label.className = 'histogram-label';
      label.textContent = entry.label;
      label.title = entry.label;
      const track = document.createElement('div');
      track.className = 'histogram-track';
      const value = document.createElement('span');
      value.className = 'histogram-value';
      if (entry.status === 'ok') {
        const fill = document.createElement('div');
        fill.className = 'histogram-fill';
        fill.style.width = `${Math.max(1, (entry.distance / maxDistance) * 100)}%`;
        if (entry.color) fill.style.background = entry.color;
        track.appendChild(fill);
        value.textContent = `${(entry.distance / 1000).toFixed(1)} km`;
      } else {
        value.textContent = entry.status === 'declined' ? 'n/a' : '—';
        value.className += ' muted';
      }
      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(value);
      els.assistModeHistogram.appendChild(row);
    }
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
      } else if (r.status === 'declined') {
        valCell.textContent = `(declined: ${r.detail})`; // e.g. NOT_READY, DENIED — a real answer, just not data
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

  // transportKind: 'usb' (normal path) | 'ble-mcsp' (experimental full read
  // over BLE, reusing the reverse-engineered MessageBus protocol instead of
  // Bosch's official Live Data Interface — see transport-webble-mcsp.js).
  // Both produce the exact same lastResults shape, so the rest of the
  // dashboard/raw-table code is unaware which transport was used.
  async function runSweep(transportKind) {
    disconnectedAfterRead = false;
    assistModeStats = [];
    let device;
    try {
      device = transportKind === 'ble-mcsp'
        ? await window.Bes3BleMcsp.requestMcspDevice()
        : await requestDevice();
    } catch (err) {
      return; // user cancelled the picker
    }

    method = transportKind === 'ble-mcsp' ? 'ble-mcsp' : 'usb';
    abortRequested = false;
    phase = 'connecting';
    renderPhase();
    els.connectingTitle.textContent = transportKind === 'ble-mcsp'
      ? 'Reading drive unit over BLE (experimental)…'
      : 'Reading drive unit…';
    els.connectingBar.style.width = '0%';
    els.connectingSub.textContent = '';

    transport = transportKind === 'ble-mcsp'
      ? new window.Bes3BleMcsp.Bes3BleMcspTransport(device)
      : new Bes3WebUsbTransport(device);
    try {
      await transport.open();
    } catch (err) {
      goIdle('Failed to open device: ' + err.message);
      return;
    }
    if (transportKind === 'ble-mcsp') {
      device.addEventListener('gattserverdisconnected', () => handleDisconnect(true));
      // The bike won't honor plain reads until it's satisfied with its own
      // boot-stage handshake against us (acting as its "MobileApp" peer) —
      // see transport-webble-mcsp.js's inbound-request responder and private
      // research notes. Bounded wait with a proceed-anyway fallback, same
      // shape as the official Flow app's own behavior.
      els.connectingSub.textContent = 'waiting for bike boot handshake…';
      await transport.waitForBikeReady();
    }

    // Warm-up: the drive unit needs a beat after init before it answers reliably.
    els.connectingSub.textContent = 'starting…';
    for (let i = 0; i < 8; i++) {
      if (await readOne(6145)) break;
    }

    startKeepAlive();

    const all = [];
    for (const [component, entries] of Object.entries(ALL_ADDRESSES)) {
      for (const e of entries) {
        if (e.readable === true) all.push({ component, ...e });
      }
    }
    const priIndex = new Map(PRIORITY.map(([c, n], i) => [c + '.' + n, i]));
    const readable = all.slice().sort((a, b) => {
      const pa = priIndex.has(a.component + '.' + a.name) ? priIndex.get(a.component + '.' + a.name) : Infinity;
      const pb = priIndex.has(b.component + '.' + b.name) ? priIndex.get(b.component + '.' + b.name) : Infinity;
      return pa - pb;
    });

    const results = [];
    const compStats = {};
    let done = 0;
    let aborted = false;
    for (const entry of readable) {
      if (phase !== 'connecting') return; // disconnected mid-sweep
      if (abortRequested) { aborted = true; break; }

      const cs = compStats[entry.component] || (compStats[entry.component] = { ok: 0, timeouts: 0 });
      if (!CORE_COMPONENTS.has(entry.component) && cs.ok === 0 && cs.timeouts >= 3) {
        results.push({ ...entry, status: 'skipped', detail: 'component not detected', decoded: null, typed: null });
        done++;
        continue;
      }

      let result = null;
      let status = 'ok';
      let detail = '';
      try {
        result = await readOne(entry.addr);
      } catch (err) {
        if (/disconnect|no device|not found/i.test(err.name + ' ' + err.message)) {
          handleDisconnect(true);
          return;
        }
        status = 'error';
        detail = err.message;
      }
      if (status === 'ok' && result === null) status = 'timeout';
      if (status === 'ok' && result.declined) {
        status = 'declined';
        detail = result.statusName;
      }
      if (status === 'ok') cs.ok++;
      else if (status === 'timeout') cs.timeouts++;

      let decoded = null;
      let typed = null;
      if (status === 'ok') {
        typed = decodeTyped(entry.addr, result.payload);
        decoded = typed || decodeValue(result.payload);
      }
      results.push({ ...entry, status, detail, decoded, typed });
      done++;
      els.connectingBar.style.width = Math.round((done / readable.length) * 100) + '%';
      els.connectingSub.textContent = `${done}/${readable.length} points`;
      if (done <= PRIORITY.length || done % 15 === 0) {
        lastResults = results;
      }
      await sleep(10);
    }

    if (!aborted && phase === 'connecting') {
      els.connectingSub.textContent = 'reading per-mode ride statistics…';
      try { await readAllAssistModeStats(); } catch (_) {}
    }

    lastResults = results;
    phase = 'connected';
    renderPhase();
    const okCount = results.filter((r) => r.status === 'ok').length;
    const noResp = results.filter((r) => r.status === 'timeout' || r.status === 'error').length;
    const skippedCount = results.filter((r) => r.status === 'skipped').length;
    const sweepSummary =
      (aborted ? 'cancelled' : 'done') +
        ` · ${okCount} values read` +
        (noResp ? ` · ${noResp} no response` : '') +
        (skippedCount ? ` · ${skippedCount} not present` : '');
    setProgress(sweepSummary);
    if (window.Bes3DebugLog) window.Bes3DebugLog.log('app', `sweep (${transportKind}) finished`, sweepSummary);
    renderDashboard();
    renderRawTable();

    stopKeepAlive();
    try { await transport.close(); } catch (_) {}
    transport = null;
  }

  // ================= BLE: official Live Data Interface =================

  const BLE_FIELD_LABELS = {
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

  function renderBleLive() {
    els.bleLiveGrid.innerHTML = '';
    for (const [key, [label, fmt]] of Object.entries(BLE_FIELD_LABELS)) {
      const hasValue = Object.prototype.hasOwnProperty.call(bleLiveState, key);
      kvRow(els.bleLiveGrid, label, hasValue ? fmt(bleLiveState[key]) : '—');
    }
  }

  async function connectBle() {
    method = 'ble';
    abortRequested = false;
    disconnectedAfterRead = false;
    phase = 'scanning';
    renderPhase();

    let device;
    try {
      device = await requestLiveDataDevice();
    } catch (err) {
      if (err && err.name === 'NotFoundError') { goIdle(''); return; } // user cancelled the chooser
      goIdle('BLE connection failed: ' + (err.message || err));
      return;
    }
    if (abortRequested) { goIdle(''); return; }

    phase = 'connecting';
    renderPhase();
    els.connectingTitle.textContent = 'Connecting…';
    els.connectingBar.style.width = '100%';
    els.connectingSub.textContent = 'establishing secure link';

    try {
      transport = new Bes3LiveDataBleTransport(device);
      await transport.connect();
      bleLiveState = {};
      Object.assign(bleLiveState, await transport.readOnce());

      await transport.subscribe((partial) => {
        Object.assign(bleLiveState, partial);
        if (phase === 'connected' && method === 'ble') renderBleLive();
      });

      device.addEventListener('gattserverdisconnected', () => handleDisconnect(true));
    } catch (err) {
      goIdle('BLE connection failed: ' + (err.message || err));
      return;
    }
    if (window.Bes3DebugLog) window.Bes3DebugLog.log('app', 'Live Data Interface connected + subscribed', JSON.stringify(bleLiveState));

    phase = 'connected';
    renderPhase();
    setProgress('connected · live telemetry streaming');
    renderBleLive();
  }

  // ---------- init ----------
  initDisclaimer();
  method = 'usb';
  renderChooser();
  renderPhase();
})();
