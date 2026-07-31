(function () {
  // Bump this on every meaningful app.js/index.html change. Shown in the
  // header and logged as the first debug-log line so a "did my reload
  // actually pick up the new build?" question can be answered by looking,
  // not assumed — browser/CDN caching can otherwise make a hard refresh
  // silently keep serving a stale bundle.
  const APP_VERSION = '2026-07-31.9-assist-stats-before-background';

  // Bump whenever the exported-report JSON schema changes (new/renamed fields the loader
  // depends on). Lets loadReportFile() below tell an old export apart from the current shape
  // instead of silently mis-rendering when a field it expects (like rawValue) is missing.
  const REPORT_FORMAT_VERSION = 1;

  // Single named-address lookup against the registry — replaces the old
  // `ALL_ADDRESSES.DriveUnit.find((e) => e.name === X).addr` pattern for the RPC/write-experiment
  // address constants below, now that addresses.js is retired.
  function addrOf(component, name) {
    const entry = window.Bes3AddressRegistry.ADDRESS_REGISTRY.addresses.find(
      (e) => e.component === component && e.name === name
    );
    return entry ? entry.address : undefined;
  }

  const {
    MessageType, buildReadRequestFrame, buildWriteFrame, encodeEnumArg,
    encodeBoolArg, encodeStartAssistModeOemArg,
    buildRpcCallFrame, buildRpcCallFrameWithArg,
    encodeConfigIdArg, decodeAssistModeStatistics, decodeConfigIdList, decodeStringList,
    decodeUdamParams, decodeBoolResponse, decodeUdamLimits, encodeSetUdamValuesParametersArg,
    parseReadResponseFrame, decodeValue,
  } = window.Bes3Protocol;
  const { decodeTyped, FIELD_TYPES, reformatDisplayFromRaw } = window.Bes3MessageTypes;
  const { Bes3WebUsbTransport, requestDevice } = window.Bes3WebUsb;
  const { Bes3LiveDataBleTransport, requestLiveDataDevice } = window.Bes3LiveDataBle;

  const $ = (id) => document.getElementById(id);
  const els = {
    appVersion: $('appVersion'),
    debugLogBtn: $('debugLogBtn'),
    themeToggle: $('themeToggle'),
    statusDot: $('statusDot'),
    statusLabel: $('statusLabel'),
    progressText: $('progressText'),
    sweepProgress: $('sweepProgress'),
    sweepProgressFill: $('sweepProgressFill'),
    sweepProgressText: $('sweepProgressText'),
    cancelBtn: $('cancelBtn'),
    disconnectBtn: $('disconnectBtn'),
    readAgainBtn: $('readAgainBtn'),

    chooserScreen: $('chooserScreen'),
    loadReportLink: $('loadReportLink'),
    loadReportInput: $('loadReportInput'),
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
    bikeOemId: $('bikeOemId'),
    bikeSerial: $('bikeSerial'),
    bikeBrand: $('bikeBrand'),
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
    batteryHeadlineRow: $('batteryHeadlineRow'),
    batteryModel: $('batteryModel'),
    batteryPhoto: $('batteryPhoto'),
    driveUnitHeadlineRow: $('driveUnitHeadlineRow'),
    driveUnitModel: $('driveUnitModel'),
    driveUnitGrid: $('driveUnitGrid'),
    driveUnitPhoto: $('driveUnitPhoto'),
    drivetrainGrid: $('drivetrainGrid'),
    usageGrid: $('usageGrid'),
    remoteGrid: $('remoteGrid'),
    remoteControlHeadlineRow: $('remoteControlHeadlineRow'),
    remoteControlModel: $('remoteControlModel'),
    remoteControlPhoto: $('remoteControlPhoto'),
    assistModeHistogram: $('assistModeHistogram'),
    writeExperiments: $('writeExperiments'),
    assistModeModalBackdrop: $('assistModeModalBackdrop'),
    assistModeModalTitle: $('assistModeModalTitle'),
    assistModeModalBody: $('assistModeModalBody'),
    assistModeModalActions: $('assistModeModalActions'),
    assistModeModalClose: $('assistModeModalClose'),
    batteryDetailGrid: $('batteryDetailGrid'),
    batteryCertBtn: $('batteryCertBtn'),
    certModalBackdrop: $('certModalBackdrop'),
    certModalTitle: $('certModalTitle'),
    certModalBody: $('certModalBody'),
    certModalClose: $('certModalClose'),
    appDialogBackdrop: $('appDialogBackdrop'),
    appDialogTitle: $('appDialogTitle'),
    appDialogMessage: $('appDialogMessage'),
    appDialogActions: $('appDialogActions'),
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
  let loadedFromFile = false; // true when the dashboard is showing a previously exported report, not a live read
  // False from the moment a sweep starts until every address (priority AND background) plus
  // per-mode ride stats have been read. Write-experiment buttons stay disabled the whole time —
  // acting on a field before its own read (and everything it might gate on) has landed is how
  // stale-state bugs happen.
  let sweepFullyLoaded = false;
  // Tracks the address currently in flight during the sweep, so a stall-watchdog (below) can name
  // names — a real hang on real hardware ("stuck around item 540") left nothing in the debug log to
  // pin down, because readOne() itself never logs. A single stuck low-level USB transfer has no
  // timeout of its own (WebUSB gives us no way to cancel one), so this can't un-stick the sweep —
  // it only makes sure the NEXT occurrence is diagnosable and the user isn't left guessing.
  let sweepWatchdogAddr = null;
  let sweepWatchdogStart = 0;
  let sweepWatchdogTimer = null;
  let sweepWatchdogFired = false;

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
      els.statusLabel.textContent = loadedFromFile ? 'OFFLINE · LOADED FROM REPORT FILE' : 'DISCONNECTED · SHOWING LAST READ';
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

  // Previously fire-and-forget: sent the keep-alive RPC but never checked
  // for a response, so it could only ever detect an outright USB write
  // failure (device unplugged), never "the bike silently stopped answering
  // but our own USB write still succeeds" — exactly the failure mode
  // suspected after a write got zero response following a long idle gap
  // (see private research notes). Now waits briefly for the matching
  // RPC_RESPONSE and logs the outcome, so an idle-period debug log actually
  // shows whether the bike's session was still alive throughout, not just
  // whether we tried.
  async function sendKeepAlive() {
    if (!transport) return;
    const dlog = window.Bes3DebugLog;
    // Something else (a sweep read, an assist-mode RPC, a write) is already
    // waiting on transport.readNextFrame() — don't send our own ping here.
    // Two concurrent readers pulling from the same frame queue could steal a
    // response meant for the other one, and it's redundant anyway: any real
    // command already exchanges data with the bike, which resets its
    // inactivity timer just as well as a dedicated keep-alive ping would.
    if (transportBusy) {
      if (dlog) dlog.log('keepalive', 'skipped (transport busy with real activity)');
      return;
    }
    keepAliveSeq = (keepAliveSeq + 1) & 0x0f;
    const addr = KEEP_ALIVE_ADDR;
    try {
      await transport.doMcspWrite(buildRpcCallFrame(addr, keepAliveSeq));
      const deadline = Date.now() + 300;
      while (Date.now() < deadline) {
        const raw = await transport.readNextFrame(2, 5);
        if (!raw) continue;
        const parsed = parseReadResponseFrame(raw);
        if (!parsed) continue;
        if (parsed.addrHigh !== (addr >> 8) || parsed.addrLow !== (addr & 0xff)) continue;
        if (dlog) dlog.log('keepalive', parsed.ok ? 'ok' : `declined: ${parsed.statusName}`);
        return;
      }
      if (dlog) dlog.log('keepalive', 'no response (timeout)');
    } catch (err) {
      if (dlog) dlog.log('keepalive', 'write failed: ' + err.message);
    }
  }

  function startKeepAlive() {
    stopKeepAlive();
    keepAliveTimer = setInterval(() => { sendKeepAlive(); }, KEEP_ALIVE_INTERVAL_MS);
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

  // Which fields to read first is now data, not code: each address that feeds a UI element
  // carries `priority: true` directly in addresses.js. Flipping a field's read order is a
  // one-line data change there — no app.js edit, no separate list to keep in sync.

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

  // Set for the duration of any function that polls transport.readNextFrame()
  // waiting for a specific response — the keep-alive timer checks this
  // before doing its own read-wait, since two concurrent readers pulling
  // from the same underlying frame queue could steal a response meant for
  // the other one (e.g. keep-alive firing mid-sweep). Fire-and-forget
  // (write only, no wait) whenever something else is already waiting.
  let transportBusy = false;

  async function readOne(addr) {
    transportBusy = true;
    try {
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
    } finally {
      transportBusy = false;
    }
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
  // client-side-only UI convention inside Flow, not bike-reported data. Real
  // names DO come from the bike (ASSIST_MODE_SHORT_NAMES/LONG_NAMES below), and
  // real colors turned out to as well — from a different address entirely
  // (ASSIST_MODE_COLORS, see below) that was simply never wired up until a
  // real capture showed the fixed design palette didn't match what the
  // rider's own bike/app displays for AUTO (orange here vs. purple on the
  // bike). ASSIST_MODE_PALETTE now only serves as a fallback for whichever
  // slots ASSIST_MODE_COLORS doesn't cover, and for generic position labels
  // when the name reads don't line up.
  const ASSIST_MODE_STATS_ADDR = addrOf('DriveUnit', 'GET_ASSIST_MODE_STATISTICS');
  const ACTIVE_ASSIST_MODES_ADDR = addrOf('DriveUnit', 'ACTIVE_ASSIST_MODES');
  // Real bike-reported mode names — NOT the per-mode GET_ASSIST_MODE_INFORMATION
  // RPC (tried earlier; its nameShort/nameLong don't match what Flow displays
  // and Flow doesn't use it for this). Flow's actual source is these two bulk
  // repeated-string data points, one entry per active mode in the same order
  // as ACTIVE_ASSIST_MODES — confirmed from Flow's decompiled source
  // (AssistModeShortNames/AssistModeLongNames, both `repeated string value=1`).
  const ASSIST_MODE_SHORT_NAMES_ADDR = addrOf('DriveUnit', 'ASSIST_MODE_SHORT_NAMES');
  const ASSIST_MODE_LONG_NAMES_ADDR = addrOf('DriveUnit', 'ASSIST_MODE_LONG_NAMES');
  // Real bike-reported per-mode colors — see messageTypes.js's FIELD_TYPES[6158] comment for
  // how the byte layout was inferred and verified (AUTO decoded to purple, matching what the
  // rider's own Flow app/head unit shows). Falls back to ASSIST_MODE_PALETTE below when this
  // read fails or the entry count doesn't line up, same fallback strategy as the name reads above.
  const ASSIST_MODE_COLORS_ADDR = addrOf('DriveUnit', 'ASSIST_MODE_COLORS');
  // Real, live, bike-computed per-mode range estimate — confirmed via Flow's own decompile
  // (DriveUnitAddresses.REACHABLE_RANGE, addr 6231) to be the actual source behind Flow's
  // "range estimate" screen, not a client-side formula. Same alignment/fallback strategy as
  // the name/color reads above.
  const REACHABLE_RANGE_ADDR = addrOf('DriveUnit', 'REACHABLE_RANGE');
  // Per-mode assist parameters (assist level / max speed / acceleration
  // response) — same ConfigId argument as the stats RPC above. Read-only.
  const UDAM_VALUES_ADDR = addrOf('DriveUnit', 'READ_UDAM_VALUES');
  // RESET_UDAM_VALUES(ConfigId) -> bool — the ONE write this tool performs,
  // added deliberately and only after real-world confirmation (2026-07-19/20
  // hardware incident) that: (a) it's a plain consumer-tier RPC the official
  // Flow app itself exposes via a UI "reset to default" button on a mode's
  // detail screen (traced in DefaultResetAssistModeParams — identical
  // ConfigId argument, no dealer/HSM gate), and (b) it's exactly what
  // resolved a real corrupted-assist-mode fault on the maintainer's own
  // bike. Scope is narrow and specific: resets ONE mode's assist
  // level/max-speed/acceleration-response to Bosch factory defaults. It
  // does not touch tuning, region/speed-class, or any other mode. See
  // RESEARCH.md (private repo) for the full incident writeup and trace.
  const RESET_UDAM_VALUES_ADDR = addrOf('DriveUnit', 'RESET_UDAM_VALUES');
  // Per-mode min/max bounds for the 3 editable UDAM fields — read-only,
  // used to keep the change UI from ever offering a value the bike itself
  // wouldn't already permit for this mode.
  const UDAM_LIMITS_ADDR = addrOf('DriveUnit', 'READ_UDAM_LIMITS');
  // SET_UDAM_VALUES_PARAMETERS(ConfigId, UdamParams) -> bool — the second
  // write this tool performs on UDAM data (alongside RESET_UDAM_VALUES).
  // Mirrors Flow's own "customize this mode" screen: a plain consumer-tier
  // feature, not tuning — every value offered is bounded by this mode's own
  // reported UDAM_LIMITS, so it can never request something the bike
  // wouldn't already allow a user to set via Flow. Only the 3 fields with a
  // confirmed unit/factor (assistLevel, accelerationResponse,
  // maximumBikeSpeed) are editable; the rest are carried through unchanged
  // from the mode's current values.
  const SET_UDAM_VALUES_PARAMETERS_ADDR = addrOf('DriveUnit', 'SET_UDAM_VALUES_PARAMETERS');
  const ASSIST_MODE_PALETTE = ['#8a8f98', '#4caf50', '#2196f3', '#ff9800', '#e53935', '#9c27b0'];
  let assistModeStats = []; // [{ index, configId, label, status, distance, consumedEnergy, detail, color, udam, resetState }]

  // Generic RPC-with-argument caller. Validates both the response's address
  // AND its type/sequence before accepting it — address-only matching was
  // confirmed unsafe on real hardware (a same-address, wrong-type/wrong-seq
  // frame was observed arriving during a write's response window; see the
  // attemptWriteExperiment fix). Matters even more here since this is
  // also used for the UDAM write below — accepting a stray frame as "success"
  // for a write is worse than for a read.
  async function rpcCallWithArg(addr, argPayload, decodeFn, logLabel) {
    transportBusy = true;
    try {
      const dlog = window.Bes3DebugLog;
      for (let attempt = 0; attempt < 2; attempt++) {
        for (let i = 0; i < 4; i++) {
          if (!(await transport.readNextFrame(1, 2))) break; // drain stale frames
        }
        const sentSeq = nextSeq();
        const frame = buildRpcCallFrameWithArg(addr, sentSeq, argPayload);
        if (dlog) dlog.log('assist-rpc', `-> addr 0x${addr.toString(16)}${logLabel ? ' ' + logLabel : ''} attempt ${attempt} seq ${sentSeq}`, frame);
        await transport.doMcspWrite(frame);
        const deadline = Date.now() + 500; // RPC round-trip can be slower than a plain read
        while (Date.now() < deadline) {
          const raw = await transport.readNextFrame(4, 4);
          if (!raw) continue;
          if (dlog) dlog.log('assist-rpc', '<- raw frame', raw);
          const parsed = parseReadResponseFrame(raw);
          if (!parsed) continue;
          if (parsed.addrHigh !== (addr >> 8) || parsed.addrLow !== (addr & 0xff)) continue;
          if (parsed.type !== MessageType.RPC_RESPONSE || parsed.seq !== sentSeq) {
            if (dlog) dlog.log('assist-rpc', `<- ignoring mismatched response (type ${parsed.type}, seq ${parsed.seq}, expected RPC_RESPONSE seq ${sentSeq})`);
            continue;
          }
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
    } finally {
      transportBusy = false;
    }
  }

  async function rpcCallWithConfigId(addr, configId, decodeFn) {
    return rpcCallWithArg(addr, encodeConfigIdArg(configId), decodeFn, `configId="${configId}"`);
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

    // Real names. Originally assumed (from Flow's decompiled
    // createOffAssistMode()/ensureOffAssistModePresent()) that off/walk is
    // synthesized client-side and excluded from these lists — real hardware
    // proved that wrong: a live capture showed ["OFF","ECO","TOUR+","AUTO",
    // "TURBO"], i.e. "OFF" IS the first entry, aligning 1:1 with
    // assistModeStats (index 0 = off/walk). Try that direct alignment first;
    // fall back to the offset-by-one alignment in case some other bike/
    // firmware version really does exclude it. If neither count matches,
    // leave the generic "Position N" labels rather than mismatching modes.
    if (ASSIST_MODE_SHORT_NAMES_ADDR) {
      try {
        const shortRes = await readOne(ASSIST_MODE_SHORT_NAMES_ADDR);
        if (shortRes && !shortRes.declined && shortRes.payload) {
          const names = decodeStringList(shortRes.payload);
          if (dlog) dlog.log('assist-rpc', 'ASSIST_MODE_SHORT_NAMES decoded', JSON.stringify(names));
          if (names.length === assistModeStats.length) {
            names.forEach((name, i) => { if (name) assistModeStats[i].label = name; });
          } else if (names.length === assistModeStats.length - 1) {
            names.forEach((name, i) => { if (name) assistModeStats[i + 1].label = name; });
          }
        }
      } catch (_) { /* leave generic labels */ }
    }
    if (ASSIST_MODE_LONG_NAMES_ADDR) {
      try {
        const longRes = await readOne(ASSIST_MODE_LONG_NAMES_ADDR);
        if (longRes && !longRes.declined && longRes.payload) {
          const names = decodeStringList(longRes.payload);
          if (dlog) dlog.log('assist-rpc', 'ASSIST_MODE_LONG_NAMES decoded', JSON.stringify(names));
          if (names.length === assistModeStats.length) {
            names.forEach((name, i) => { if (name) assistModeStats[i].longLabel = name; });
          } else if (names.length === assistModeStats.length - 1) {
            names.forEach((name, i) => { if (name) assistModeStats[i + 1].longLabel = name; });
          }
        }
      } catch (_) { /* leave generic labels */ }
    }
    if (ASSIST_MODE_COLORS_ADDR) {
      try {
        const colorRes = await readOne(ASSIST_MODE_COLORS_ADDR);
        if (colorRes && !colorRes.declined && colorRes.payload) {
          const typed = decodeTyped(ASSIST_MODE_COLORS_ADDR, colorRes.payload);
          const colors = typed ? typed.value : [];
          if (dlog) dlog.log('assist-rpc', 'ASSIST_MODE_COLORS decoded', JSON.stringify(colors));
          if (colors.length === assistModeStats.length) {
            colors.forEach((c, i) => { assistModeStats[i].color = c.hex; });
          } else if (colors.length === assistModeStats.length - 1) {
            colors.forEach((c, i) => { assistModeStats[i + 1].color = c.hex; });
          }
        }
      } catch (_) { /* leave the design-palette colors already assigned above */ }
    }
    if (REACHABLE_RANGE_ADDR) {
      try {
        const rangeRes = await readOne(REACHABLE_RANGE_ADDR);
        if (rangeRes && !rangeRes.declined && rangeRes.payload) {
          const typed = decodeTyped(REACHABLE_RANGE_ADDR, rangeRes.payload);
          const ranges = typed ? typed.value : [];
          if (dlog) dlog.log('assist-rpc', 'REACHABLE_RANGE decoded', JSON.stringify(ranges));
          if (ranges.length === assistModeStats.length) {
            ranges.forEach((km, i) => { assistModeStats[i].reachableRangeKm = km; });
          } else if (ranges.length === assistModeStats.length - 1) {
            ranges.forEach((km, i) => { assistModeStats[i + 1].reachableRangeKm = km; });
          }
        }
      } catch (_) { /* leave range unset — histogram just omits it for this mode */ }
    }

    for (const entry of assistModeStats) {
      if (!transport) return; // disconnected mid-read — `phase` is deliberately already 'connected' here
      try {
        const r = await rpcCallWithConfigId(ASSIST_MODE_STATS_ADDR, entry.configId, decodeAssistModeStatistics);
        if (!r) entry.status = 'timeout';
        else if (r.declined) { entry.status = 'declined'; entry.detail = r.statusName; }
        else { entry.status = 'ok'; entry.distance = r.distance; entry.consumedEnergy = r.consumedEnergy; }
      } catch (err) {
        entry.status = 'error';
        entry.detail = err.message;
      }

      if (UDAM_VALUES_ADDR) {
        if (!transport) return; // disconnected mid-read — `phase` is deliberately already 'connected' here
        try {
          const u = await rpcCallWithConfigId(UDAM_VALUES_ADDR, entry.configId, decodeUdamParams);
          if (u && !u.declined) entry.udam = u;
        } catch (_) { /* leave entry.udam unset — rendered as "—" */ }
      }

      if (UDAM_LIMITS_ADDR) {
        if (!transport) return; // disconnected mid-read — `phase` is deliberately already 'connected' here
        try {
          const l = await rpcCallWithConfigId(UDAM_LIMITS_ADDR, entry.configId, decodeUdamLimits);
          if (l && !l.declined) entry.udamLimits = l;
        } catch (_) { /* leave entry.udamLimits unset — change UI stays hidden for this mode */ }
      }
    }
  }

  // The one write this tool performs — see the comment on
  // RESET_UDAM_VALUES_ADDR above for why this exists and what it's scoped
  // to. Never called automatically; only from an explicit button click
  // behind its own confirmation dialog (see index.html/renderAssistModeHistogram).
  async function resetUdamValuesForMode(entry) {
    if (!RESET_UDAM_VALUES_ADDR || !transport) {
      await appAlert('Not connected to the bike anymore — reconnect (Read again) and try the reset again.');
      return { ok: false, error: 'not connected' };
    }
    entry.resetState = 'pending';
    renderAssistModeHistogram();
    try {
      const r = await rpcCallWithConfigId(RESET_UDAM_VALUES_ADDR, entry.configId, decodeBoolResponse);
      if (r && !r.declined && r === true) {
        entry.resetState = 'done';
        // Re-read this mode's UDAM values so the dashboard reflects the
        // restored defaults instead of the stale (possibly corrupt) ones.
        try {
          const u = await rpcCallWithConfigId(UDAM_VALUES_ADDR, entry.configId, decodeUdamParams);
          if (u && !u.declined) entry.udam = u;
        } catch (_) {}
      } else {
        entry.resetState = 'failed';
      }
    } catch (err) {
      entry.resetState = 'failed';
      if (window.Bes3DebugLog) window.Bes3DebugLog.log('assist-rpc', 'reset failed', err.message);
    }
    renderAssistModeHistogram();
    return { ok: entry.resetState === 'done' };
  }

  // The second UDAM write this tool performs — see the comment on
  // SET_UDAM_VALUES_PARAMETERS_ADDR above for scope/rationale. `changes` only
  // carries the fields the user actually edited (assistLevel/
  // accelerationResponse/maximumBikeSpeed); every other field is carried
  // through unchanged from the mode's last-read UDAM values, so this can
  // never touch anything the user didn't explicitly set. Never called
  // automatically; only from the change UI's own confirmation dialog.
  async function setUdamValuesForMode(entry, changes) {
    if (!SET_UDAM_VALUES_PARAMETERS_ADDR || !transport) {
      await appAlert('Not connected to the bike anymore — reconnect (Read again) and try again.');
      return { ok: false, error: 'not connected' };
    }
    if (!entry.udam) {
      await appAlert('No current settings read for this mode yet — cannot build a safe write.');
      return { ok: false, error: 'no current udam' };
    }
    const merged = { ...entry.udam, ...changes };
    entry.setState = 'pending';
    renderAssistModeHistogram();
    try {
      const r = await rpcCallWithArg(
        SET_UDAM_VALUES_PARAMETERS_ADDR,
        encodeSetUdamValuesParametersArg(entry.configId, merged),
        decodeBoolResponse,
        `configId="${entry.configId}" set`
      );
      if (r && !r.declined && r === true) {
        entry.setState = 'done';
        // Re-read to reflect the bike's actual current value, not just our
        // assumption that the write took effect.
        try {
          const u = await rpcCallWithConfigId(UDAM_VALUES_ADDR, entry.configId, decodeUdamParams);
          if (u && !u.declined) entry.udam = u;
        } catch (_) {}
      } else {
        entry.setState = 'failed';
      }
    } catch (err) {
      entry.setState = 'failed';
      if (window.Bes3DebugLog) window.Bes3DebugLog.log('assist-rpc', 'set udam values failed', err.message);
    }
    renderAssistModeHistogram();
    return { ok: entry.setState === 'done' };
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
  // The raw enum name=ordinal pair (e.g. "TREKKING=2"), for a hover tooltip next to a
  // human-friendly kv-row value — undefined when the decoder has no technical detail to add.
  function technicalOf(component, name) {
    const r = findResult(component, name);
    if (!r || r.status !== 'ok') return undefined;
    const d = r.typed || r.decoded;
    return d ? d.technical : undefined;
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

  // Part photos bundled inside Bosch's own Flow app (extracted with the repo owner's explicit
  // go-ahead — plain product photography, not creative art) — see web/data/part-images.json for
  // provenance and matching rules. Loaded once, same pattern as the bike-model cache above.
  let partImageCache = null;
  let partImageCacheLoading = null;
  function loadPartImages() {
    if (partImageCache) return Promise.resolve(partImageCache);
    if (partImageCacheLoading) return partImageCacheLoading;
    partImageCacheLoading = fetch('web/data/part-images.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { partImageCache = data || {}; return partImageCache; })
      .catch(() => { partImageCache = {}; return partImageCache; });
    return partImageCacheLoading;
  }

  // Exact code match wins (needed for the two drive-unit prefixes that cover more than one
  // product line); otherwise the longest matching prefix, since shorter prefixes are also
  // valid substrings of longer real codes (e.g. 'BBP375' would spuriously match a hypothetical
  // 'BBP3750').
  function partImageFor(component, productCode, table) {
    if (!productCode || !table || !table[component]) return null;
    const entries = table[component];
    if (entries[productCode]) return 'web/parts/' + entries[productCode];
    const prefixes = Object.keys(entries).sort((a, b) => b.length - a.length);
    const hit = prefixes.find((p) => productCode.startsWith(p));
    return hit ? 'web/parts/' + entries[hit] : null;
  }

  // A card's own product name sits under its generic all-caps label (see index.html comment on
  // .part-headline-row) — but if the read didn't resolve a name (component absent / declined),
  // there's nothing to show, so hide the row rather than leave it blank.
  function renderPartHeadline(rowEl, textEl, name) {
    textEl.textContent = name || '';
    rowEl.style.display = name ? '' : 'none';
  }

  function renderPartPhoto(imgEl, component, productCode) {
    if (!productCode) { imgEl.style.display = 'none'; return; }
    loadPartImages().then((table) => {
      // Bail if the dashboard has moved on to a different bike/read since this lookup started.
      // Must match how the caller obtained `productCode` in the first place (displayOf, not
      // valueOf) — valueOf only returns a value when the address has a FIELD_TYPES entry, which
      // RemoteControl's PRODUCT_CODE (among others) doesn't; that mismatch made this guard always
      // fail during a live sweep, hiding the remote's photo every time despite a correct decode.
      if (displayOf(component, 'PRODUCT_CODE', '') !== productCode) return;
      const src = partImageFor(component, productCode, table);
      if (!src) { imgEl.style.display = 'none'; return; }
      imgEl.src = src;
      imgEl.alt = `${component} ${productCode}`;
      imgEl.style.display = '';
    });
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
      if (entry && entry.brand && entry.model) els.bikeName.textContent = `${entry.brand} ${entry.model}`;
      if (!entry || !entry.imageUrl) { showFallback(); return; }
      els.bikePhoto.src = entry.imageUrl;
      els.bikePhoto.alt = `${entry.brand || ''} ${entry.model || ''}`.trim();
      els.bikePhotoCaption.textContent = [entry.brand, entry.model, entry.modelYear]
        .filter(Boolean).join(' · ');
      els.bikePhotoWrap.style.display = '';
      els.bikeIconFallback.style.display = 'none';
    });
  }

  function kvRow(container, label, value, writable, technical) {
    const l = document.createElement('span');
    l.textContent = label;
    if (writable) {
      const w = document.createElement('span');
      w.className = 'writable-marker';
      w.textContent = '✎';
      // Same caveat as the raw-table marker (see there for the full explanation): this is a
      // STATIC protocol-level fact from Bosch's own code, not a live check of this bike, and not
      // a safety claim — a field can be statically writable yet have an untested/untraced
      // precondition, the way START_ASSIST_MODE_CONFIGURATION did.
      w.title = 'Statically writable in Bosch’s own code (not a live check of this bike, not a safety claim)';
      l.appendChild(w);
    }
    const v = document.createElement('span');
    v.textContent = value;
    // Raw enum name=ordinal (or similar wire-level detail) on hover only — the row itself
    // stays human-friendly; the technical value is one hover away, not shown inline.
    if (technical) v.title = technical;
    container.appendChild(l);
    container.appendChild(v);
  }

  // Single-value formatters, named from a `ui.formatter` string in the address registry — the
  // registry can't hold real functions (it's JSON), so it holds a lookup key into this table
  // instead. Only for genuine unit/format conversions; anything that needs to manipulate real DOM
  // elements (photos, buttons) stays dedicated code, not a formatter.
  const UI_FORMATTERS = {
    metersToKm: (value) => (value == null ? '—' : `${(value / 1000).toFixed(1)} km`),
    secondsToHours: (value) => (value == null ? '—' : `${(value / 3600).toFixed(1)} h`),
    // `values` is [lowerLimitDisplay, upperLimitDisplay] (formatted strings, e.g. "20 %") - see
    // the combinesWith branch in renderCard(), which passes displayOf() output here, not raw
    // values, since this formatter doesn't do math - it just joins two already-formatted values.
    socRange: (values) => values.join(' – '),
  };

  // Flattens the registry's per-component arrays into one list with `component` attached to each
  // entry, same shape the old ALL_ADDRESSES-based code used to build ad hoc.
  function collectRegistryEntries() {
    return window.Bes3AddressRegistry.ADDRESS_REGISTRY.addresses;
  }

  // Generic renderer for a card's plain kv-grid rows, driven entirely by `ui.card`/`ui.row`
  // entries in the address registry — replaces hand-written kvRow(...) call chains. Entries with
  // a `ui.card` but no `ui.row` (widget-fed addresses: photos, headlines, SoC bar, etc.) are
  // deliberately skipped here; dedicated code elsewhere still renders those.
  function renderCard(cardId, container) {
    const entries = collectRegistryEntries()
      .filter((e) => e.ui && e.ui.card === cardId && e.ui.row !== undefined)
      .sort((a, b) => a.ui.row - b.ui.row);

    const seenRows = new Map();
    for (const e of entries) {
      const key = e.ui.row;
      if (seenRows.has(key)) {
        console.warn(`renderCard('${cardId}'): row ${key} used by both ${seenRows.get(key)} and ${e.component}.${e.name} - one will be hidden by the other`);
      }
      seenRows.set(key, `${e.component}.${e.name}`);
    }

    for (const e of entries) {
      const label = e.ui.label || e.label;
      let displayValue;
      if (e.ui.formatter) {
        if (e.ui.combinesWith && e.ui.combinesWith.length) {
          // Multi-address rows join already-formatted display strings (e.g. "20 %"), not raw
          // numbers - there's no unit math to do here, just combining values that are each
          // already correctly formatted on their own.
          const values = [displayOf(e.component, e.name), ...e.ui.combinesWith.map((n) => displayOf(e.component, n))];
          displayValue = UI_FORMATTERS[e.ui.formatter](values);
        } else {
          // Single-value formatters (unit conversions like meters->km) need the raw number to do
          // math on, not a pre-formatted string.
          displayValue = UI_FORMATTERS[e.ui.formatter](valueOf(e.component, e.name));
        }
      } else {
        displayValue = displayOf(e.component, e.name);
      }
      const technical = e.ui.technical ? technicalOf(e.component, e.name) : undefined;
      kvRow(container, label, displayValue, !!e.ui.writable, technical);
    }
  }

  // Themed replacement for window.alert()/window.confirm() — native browser dialogs can't be
  // styled and look out of place against this app's own dark/light theme. Both resolve a Promise
  // instead of blocking synchronously, so every call site awaits them from an async function/
  // handler instead of relying on alert()/confirm()'s synchronous return value.
  let appDialogResolve = null;
  function appDialog({ title, message, buttons }) {
    return new Promise((resolve) => {
      // A dialog opened while one is already open would leak the previous resolve() — clicking
      // Escape/backdrop isn't wired up here, but a stray double-open still shouldn't hang a caller.
      if (appDialogResolve) appDialogResolve(false);
      appDialogResolve = resolve;
      els.appDialogTitle.textContent = title;
      els.appDialogMessage.textContent = message;
      els.appDialogActions.innerHTML = '';
      for (const btn of buttons) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = btn.primary ? 'primary-btn' : 'ghost-btn';
        b.textContent = btn.label;
        b.addEventListener('click', () => {
          els.appDialogBackdrop.style.display = 'none';
          appDialogResolve = null;
          resolve(btn.value);
        });
        els.appDialogActions.appendChild(b);
      }
      els.appDialogBackdrop.style.display = 'flex';
    });
  }
  function appAlert(message, title) {
    return appDialog({ title: title || 'Notice', message, buttons: [{ label: 'OK', value: true, primary: true }] });
  }
  function appConfirm(message, title) {
    return appDialog({
      title: title || 'Confirm',
      message,
      buttons: [{ label: 'Cancel', value: false }, { label: 'OK', value: true, primary: true }],
    });
  }

  const START_ASSIST_MODE_LAST_USED = 1;

  // Unified panel: one row per field, each showing its own live current value plus a single
  // action button that writes, logs, re-reads, and updates the shown value in place — replaces
  // the earlier split between a start-mode-specific action and a separate "protocol probes"
  // block, which looked like 3 identical buttons with no clear indication of which one did what.
  //
  // START_ASSIST_MODE_CONFIGURATION (6180) is the one genuinely declared-writable field here
  // (ReadableWritableSubscribableDataPoint, confirmed via decompile, no dealer/HSM gate) — gated
  // on its own OEM precondition (6179's `configurable` field), same gate Bosch's own UI uses,
  // with a labeled override to bypass that gate on purpose for testing.
  //
  // The other two rows are deliberate protocol-level PROBES, not supported writes: both addresses
  // are read-only in Bosch's own client (no writer exists anywhere in the decompiled adapter code)
  // — sent anyway purely to see how firmware itself responds. Already confirmed once on real
  // hardware: firmware returns an explicit WRITE_RESPONSE/DENIED for both, not a silent accept —
  // see the private research notes.
  const WRITE_EXPERIMENTS = [
    {
      id: 'startMode',
      addrName: 'START_ASSIST_MODE_CONFIGURATION',
      label: 'Start mode (6180)',
      isRealWrite: true,
      // Short form only — the full decoded display ("Position 0 (off/walk)
      // [START_ASSIST_MODE_POSITION0=2]") is too long for this row's fixed layout, pushing the
      // action button off the edge of the card.
      formatValue: (typed) => {
        const entry = Object.values(FIELD_TYPES[6180].enumTable).find((v) => v.name === (typed && typed.value));
        return entry ? entry.label : (typed ? typed.value : '—');
      },
      buildPayload: () => encodeEnumArg(START_ASSIST_MODE_LAST_USED),
      gate: () => {
        const oem = valueOf('DriveUnit', 'START_ASSIST_MODE_CONFIGURATION_OEM');
        return oem && typeof oem === 'object' ? oem.configurable : null;
      },
      confirmText: (gated) => gated === false
        ? 'Attempt the write anyway, despite the "locked by manufacturer" flag?\n\n' +
          'This bike reports START_ASSIST_MODE_CONFIGURATION_OEM.configurable = false — the same ' +
          'flag Bosch\'s own DiagnosticTool 3 checks before offering this control at all. This ' +
          'bypasses that gate on purpose so the write can actually be attempted, logged, and ' +
          're-read.\n\nExpected outcome: an explicit DENIED (as already seen for the other two ' +
          'rows here), or an accepted ack that doesn\'t durably stick. Either way the result and ' +
          'a re-read are both logged, not assumed.'
        : 'Set the bike to always start in your last-used assist mode?\n\n' +
          'This writes ONE setting (START_ASSIST_MODE_CONFIGURATION) so the bike resumes whichever ' +
          'assist mode you were last using, instead of always powering on in off/walk mode. It ' +
          'does not touch region, speed-class, tuning, or any per-mode assist parameters.',
    },
    {
      id: 'startModeOemConfigurable',
      addrName: 'START_ASSIST_MODE_CONFIGURATION_OEM',
      label: 'Start mode OEM configurable (6179)',
      isRealWrite: false,
      // Just the bool this experiment cares about — the position half of this field duplicates
      // the "Start mode" row above and isn't relevant to what this probe is testing.
      formatValue: (typed) => (typed && typeof typed.value === 'object' ? String(typed.value.configurable) : '—'),
      buildPayload: () => {
        const oem = valueOf('DriveUnit', 'START_ASSIST_MODE_CONFIGURATION_OEM');
        const positionName = oem && typeof oem === 'object' ? oem.position : 'START_ASSIST_MODE_NOT_CONFIGURED';
        const enumTable = FIELD_TYPES[6180].enumTable; // same enum table as START_ASSIST_MODE_CONFIGURATION
        const entry = Object.entries(enumTable).find(([, v]) => v.name === positionName);
        const positionValue = entry ? Number(entry[0]) : 0;
        return encodeStartAssistModeOemArg(positionValue, true);
      },
      confirmText: () =>
        'Attempt to write START_ASSIST_MODE_CONFIGURATION_OEM (addr 6179) with configurable=true, ' +
        'at the protocol level?\n\nThis field is read-only in Bosch\'s own client (no writer exists ' +
        'in the decompiled adapter code) — this sends a raw WRITE frame anyway. Already tested once ' +
        'on real hardware: firmware returned an explicit DENIED. The result (including a re-read ' +
        'afterward) is only logged, not assumed.',
    },
    {
      id: 'distractedRidingAlert',
      addrName: 'DISTRACTED_RIDING_ALERT',
      label: 'Distracted riding alert (6161)',
      isRealWrite: false,
      formatValue: (typed) => (typed ? String(typed.value) : '—'),
      buildPayload: () => encodeBoolArg(false),
      confirmText: () =>
        'Attempt to write DISTRACTED_RIDING_ALERT (addr 6161) to false, at the protocol level?\n\n' +
        'This field is read-only in Bosch\'s own client (no writer exists in the decompiled adapter ' +
        'code) — this sends a raw WRITE frame anyway. Already tested once on real hardware: ' +
        'firmware returned an explicit DENIED. The result (including a re-read afterward) is only ' +
        'logged, not assumed.',
    },
  ];
  const experimentState = {}; // id -> null | 'pending' | 'done' | 'failed' ("done" = got a response, not "it worked")

  // Shared by attemptWriteExperiment and attemptTryAllStartModeValues — sends one WRITE, waits
  // for a genuine sequence-matched WRITE_RESPONSE, then re-reads the address regardless of
  // outcome. An ack (even SUCCESS) does not by itself tell us what the bike now reports — real
  // hardware precedent: START_ASSIST_MODE_CONFIGURATION got a genuine, sequence-matched ack yet
  // a later fresh read still showed the old value — so every caller re-reads rather than assumes.
  async function writeAndReadBack(addr, payload, tag) {
    const dlog = window.Bes3DebugLog;
    if (dlog) dlog.log(tag, 'payload before write', payload);
    let ok = false;
    let statusName = null;
    transportBusy = true;
    try {
      let done = false;
      for (let attempt = 0; attempt < 2 && !done; attempt++) {
        for (let i = 0; i < 4; i++) {
          if (!(await transport.readNextFrame(1, 2))) break;
        }
        const sentSeq = nextSeq();
        const frame = buildWriteFrame(addr, sentSeq, payload);
        if (dlog) dlog.log(tag, `-> WRITE addr 0x${addr.toString(16)} attempt ${attempt} seq ${sentSeq}`, frame);
        await transport.doMcspWrite(frame);
        const deadline = Date.now() + 500;
        while (Date.now() < deadline) {
          const raw = await transport.readNextFrame(4, 4);
          if (!raw) continue;
          if (dlog) dlog.log(tag, '<- raw frame', raw);
          const parsed = parseReadResponseFrame(raw);
          if (!parsed) continue;
          if (parsed.addrHigh !== (addr >> 8) || parsed.addrLow !== (addr & 0xff)) continue;
          // Address alone isn't enough to trust this as *our* response — a stray frame from an
          // unrelated exchange (confirmed to happen on real hardware) can share the same address.
          // Only accept a genuine WRITE_RESPONSE whose sequence matches what we just sent.
          if (parsed.type !== MessageType.WRITE_RESPONSE || parsed.seq !== sentSeq) {
            if (dlog) dlog.log(tag, `<- ignoring mismatched response (type ${parsed.type}, seq ${parsed.seq}, expected WRITE_RESPONSE seq ${sentSeq})`);
            continue;
          }
          done = true;
          ok = parsed.ok;
          statusName = parsed.statusName;
          if (dlog) dlog.log(tag, `<- WRITE_RESPONSE ok=${parsed.ok} status=${parsed.statusName}`);
          break;
        }
      }
    } catch (err) {
      if (dlog) dlog.log(tag, 'write failed', err.message);
      statusName = 'error';
    } finally {
      transportBusy = false;
    }
    let readBack = null;
    try {
      const r = await readOne(addr);
      if (dlog) dlog.log(tag, 'post-write re-read result', r);
      if (r && !r.declined && r.payload) {
        readBack = decodeTyped(addr, r.payload);
        if (dlog) dlog.log(tag, 'post-write re-read decoded', readBack);
      }
    } catch (err) {
      if (dlog) dlog.log(tag, 'post-write re-read failed', err.message);
    }
    return { ok, statusName, readBack };
  }

  async function attemptWriteExperiment(id) {
    const exp = WRITE_EXPERIMENTS.find((e) => e.id === id);
    const addr = addrOf('DriveUnit', exp.addrName);
    if (!addr || !transport) {
      await appAlert('Not connected to the bike anymore — reconnect (Read again) and try again.');
      return;
    }
    experimentState[id] = 'pending';
    renderWriteExperiments();
    const payload = exp.buildPayload();
    const { ok, readBack } = await writeAndReadBack(addr, payload, `write-${id}`);
    experimentState[id] = ok ? 'done' : 'failed';
    if (readBack) {
      const idx = lastResults.findIndex((x) => x.component === 'DriveUnit' && x.name === exp.addrName);
      if (idx >= 0) { lastResults[idx].status = 'ok'; lastResults[idx].typed = readBack; lastResults[idx].decoded = readBack; }
    }
    renderDashboard();
  }

  // Diagnostic sweep requested after real hardware showed writing LAST_USED got a SUCCESS ack
  // that didn't stick: is that gate (OEM configurable=false) blocking every possible value
  // equally, or does it only affect some? Writes each non-zero START_ASSIST_MODE_CONFIGURATION
  // enum value in turn, re-reading immediately after each, so one connected session settles it
  // instead of clicking the single-value button repeatedly.
  let startModeTryAllResults = null; // null | 'running' | [{ordinal, name, label, ok, statusName, stuck}]

  async function attemptTryAllStartModeValues() {
    const addr = addrOf('DriveUnit', 'START_ASSIST_MODE_CONFIGURATION');
    if (!addr || !transport) {
      await appAlert('Not connected to the bike anymore — reconnect (Read again) and try again.');
      return;
    }
    const enumTable = FIELD_TYPES[6180].enumTable;
    const ordinals = Object.keys(enumTable).map(Number).filter((n) => n !== 0).sort((a, b) => a - b);
    startModeTryAllResults = 'running';
    renderWriteExperiments();
    const results = [];
    for (const ordinal of ordinals) {
      const entry = enumTable[ordinal];
      const payload = encodeEnumArg(ordinal);
      const { ok, statusName, readBack } = await writeAndReadBack(addr, payload, `write-startMode-tryAll-${entry.name}`);
      const stuck = !!(readBack && readBack.value === entry.name);
      results.push({ ordinal, name: entry.name, label: entry.label, ok, statusName, stuck });
      if (readBack) {
        const idx = lastResults.findIndex((x) => x.component === 'DriveUnit' && x.name === 'START_ASSIST_MODE_CONFIGURATION');
        if (idx >= 0) { lastResults[idx].status = 'ok'; lastResults[idx].typed = readBack; lastResults[idx].decoded = readBack; }
      }
      startModeTryAllResults = results.slice(); // progressive update — render after each value, not just at the end
      renderWriteExperiments();
    }
    const dlog = window.Bes3DebugLog;
    if (dlog) dlog.log('write-startMode-tryAll', 'summary', JSON.stringify(results));
    startModeTryAllResults = results;
    renderDashboard();
  }

  function renderWriteExperiments() {
    els.writeExperiments.innerHTML = '';
    for (const exp of WRITE_EXPERIMENTS) {
      if (addrOf('DriveUnit', exp.addrName) === undefined) continue;
      const current = valueOf('DriveUnit', exp.addrName);
      if (current == null) continue; // not read yet / declined — nothing to show or act on

      const row = document.createElement('div');
      row.className = 'write-experiment-row' + (exp.isRealWrite ? ' write-experiment-real' : '');

      const label = document.createElement('span');
      label.className = 'write-experiment-label';
      label.textContent = exp.label;

      const result = findResult('DriveUnit', exp.addrName);
      const typed = result && result.status === 'ok' ? result.typed : null;
      const value = document.createElement('span');
      value.className = 'write-experiment-value';
      value.textContent = exp.formatValue ? exp.formatValue(typed) : displayOf('DriveUnit', exp.addrName);

      const state = experimentState[exp.id];
      const gated = exp.gate ? exp.gate() : null;

      if (exp.isRealWrite && current === 'START_ASSIST_MODE_LAST_USED' && state !== 'failed') {
        // Already set — show the value, no action needed.
        const done = document.createElement('span');
        done.className = 'write-experiment-value good';
        done.textContent = 'already set';
        row.append(label, value, done);
        els.writeExperiments.appendChild(row);
        if (exp.id === 'startMode') renderStartModeTryAllBlock();
        continue;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = exp.isRealWrite ? 'histogram-reset-btn' : 'histogram-change-btn secondary';
      if (state === 'pending') { btn.textContent = 'Sending…'; btn.disabled = true; }
      else if (!sweepFullyLoaded) { btn.textContent = 'Loading…'; btn.disabled = true; }
      else if (exp.isRealWrite && gated === false) { btn.textContent = state === 'failed' ? 'Denied — retry anyway?' : 'Attempt anyway (locked)'; }
      else if (state === 'done') { btn.textContent = exp.isRealWrite ? 'Set ✓' : 'Sent — see value/log'; }
      else if (state === 'failed') { btn.textContent = 'No response — retry?'; }
      else { btn.textContent = exp.isRealWrite ? 'Set to last-used' : 'Send probe'; }
      btn.addEventListener('click', async () => {
        if (await appConfirm(exp.confirmText(gated))) attemptWriteExperiment(exp.id);
      });

      row.append(label, value, btn);
      els.writeExperiments.appendChild(row);
      if (exp.id === 'startMode') renderStartModeTryAllBlock();
    }
  }

  // Shared by both branches above (the "already set" early-exit and the normal button path) —
  // the try-all-values diagnostic is useful regardless of whether last-used happens to be set.
  function renderStartModeTryAllBlock() {
    const tryAllRow = document.createElement('div');
    tryAllRow.className = 'write-experiment-tryall-row';
    const tryAllBtn = document.createElement('button');
    tryAllBtn.type = 'button';
    tryAllBtn.className = 'histogram-change-btn secondary';
    if (startModeTryAllResults === 'running') { tryAllBtn.textContent = 'Testing…'; tryAllBtn.disabled = true; }
    else if (!sweepFullyLoaded) { tryAllBtn.textContent = 'Loading…'; tryAllBtn.disabled = true; }
    else { tryAllBtn.textContent = 'Try all values'; }
    tryAllBtn.addEventListener('click', async () => {
      if (await appConfirm(
        'Write EVERY possible Start mode (6180) value in turn, re-reading after each?\n\n' +
        'Sends up to 6 separate WRITE frames back-to-back (last-used, plus positions 0-4), ' +
        'each immediately followed by a re-read to check whether it actually stuck. Purely ' +
        'diagnostic — finds out whether the "locked by manufacturer" gate blocks every value ' +
        'equally or only some. Every result is logged, not assumed.'
      )) attemptTryAllStartModeValues();
    });
    tryAllRow.appendChild(tryAllBtn);
    if (Array.isArray(startModeTryAllResults)) {
      const results = document.createElement('div');
      results.className = 'write-experiment-tryall-results';
      for (const r of startModeTryAllResults) {
        const item = document.createElement('span');
        item.className = 'write-experiment-tryall-item' + (r.stuck ? ' good' : r.ok ? '' : ' bad');
        item.textContent = `${r.label}: ${r.ok ? (r.stuck ? 'stuck' : 'ack, no change') : (r.statusName || 'no response')}`;
        results.appendChild(item);
      }
      tryAllRow.appendChild(results);
    }
    els.writeExperiments.appendChild(tryAllRow);
  }

  function renderDashboard() {
    // PRODUCT_NAME here is really the drive unit's own product line (e.g. "Performance Line CX")
    // — identical text on any brand that happens to use the same motor, not the bike itself. Brand
    // name is genuine bike-identifying info the drive unit already tells us directly, so it's a
    // better default heading than the motor's name; renderBikePhoto() upgrades this further to the
    // real brand + model whenever the bike's GTIN resolves in the catalog cache.
    els.bikeName.textContent = displayOf('DriveUnit', 'OEM_BRAND_NAME', '') || displayOf('DriveUnit', 'PRODUCT_NAME');
    els.bikeId.textContent = displayOf('DriveUnit', 'BIKE_ID');
    els.bikeOemId.textContent = displayOf('DriveUnit', 'OEM_BIKE_ID');
    els.bikeSerial.textContent = displayOf('DriveUnit', 'SERIAL_NUMBER');
    els.bikeBrand.textContent = displayOf('DriveUnit', 'OEM_BRAND_NAME');
    els.bikeCategory.textContent = displayOf('DriveUnit', 'BIKE_CATEGORY');
    const bikeCategoryTechnical = technicalOf('DriveUnit', 'BIKE_CATEGORY');
    if (bikeCategoryTechnical) els.bikeCategory.title = bikeCategoryTechnical;
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
    const batteryProductName = displayOf('Battery', 'PRODUCT_NAME', '');
    const batteryProductCode = displayOf('Battery', 'PRODUCT_CODE', '');
    renderPartHeadline(els.batteryHeadlineRow, els.batteryModel, batteryProductName);
    renderPartPhoto(els.batteryPhoto, 'Battery', batteryProductCode);
    const cert = valueOf('Battery', 'DEVICE_CERTIFICATE');
    els.batteryCertBtn.style.display = cert ? '' : 'none';

    els.batteryDetailGrid.innerHTML = '';
    renderCard('battery', els.batteryDetailGrid);

    const driveUnitProductLine = displayOf('DriveUnit', 'PRODUCT_LINE', '');
    const driveUnitProductCode = displayOf('DriveUnit', 'PRODUCT_CODE', '');
    renderPartHeadline(els.driveUnitHeadlineRow, els.driveUnitModel, driveUnitProductLine);
    renderPartPhoto(els.driveUnitPhoto, 'DriveUnit', driveUnitProductCode);

    els.driveUnitGrid.innerHTML = '';
    renderCard('driveUnit', els.driveUnitGrid);

    els.drivetrainGrid.innerHTML = '';
    renderCard('drivetrain', els.drivetrainGrid);
    // Tuning detection / Distracted riding alert stay dedicated code (not part of renderCard) -
    // both apply a semantic CSS class based on the decoded value's meaning, not just format text;
    // their registry entries carry ui.card but no ui.row, so renderCard() already skips them.
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
    // Read-only (see private research notes for the full disclaimer-mechanism writeup) — this is
    // the bike-side flag behind Flow's "distracted riding" disclaimer. true on this bike is
    // consistent with running a non-standard/tuned region config.
    const dra = valueOf('DriveUnit', 'DISTRACTED_RIDING_ALERT');
    const draRow = document.createElement('span');
    draRow.textContent = 'Distracted riding alert';
    const draVal = document.createElement('span');
    draVal.textContent = dra == null ? '—' : String(dra);
    if (dra === true) draVal.className = 'bad';
    else if (dra === false) draVal.className = 'good';
    els.drivetrainGrid.appendChild(draRow);
    els.drivetrainGrid.appendChild(draVal);
    renderWriteExperiments();

    els.usageGrid.innerHTML = '';
    const odometerM = valueOf('DriveUnit', 'ODOMETER');
    kvRow(els.usageGrid, 'Odometer (total)', odometerM == null ? '—' : `${(odometerM / 1000).toFixed(1)} km`);
    kvRow(els.usageGrid, 'Power-on time', displayOf('DriveUnit', 'POWER_ON_TIME'));
    const motorSupportSeconds = valueOf('DriveUnit', 'POWER_ON_TIME_WITH_MOTOR_SUPPORT');
    kvRow(els.usageGrid, 'Running hours (motor support)', motorSupportSeconds == null ? '—' : `${(motorSupportSeconds / 3600).toFixed(1)} h`);

    const remoteControlProductName = displayOf('RemoteControl', 'PRODUCT_NAME', '');
    const remoteControlProductCode = displayOf('RemoteControl', 'PRODUCT_CODE', '');
    renderPartHeadline(els.remoteControlHeadlineRow, els.remoteControlModel, remoteControlProductName);
    renderPartPhoto(els.remoteControlPhoto, 'RemoteControl', remoteControlProductCode);

    els.remoteGrid.innerHTML = '';
    // All of these (bar Product code/Bike name) are declared writable in Bosch's own
    // RemoteControl adapter (see the ✎ marker and its tooltip / README) — read-only display here,
    // no write UI built for any of them yet; none have had their write path traced/tested the way
    // START_ASSIST_MODE_CONFIGURATION has.
    renderCard('remote', els.remoteGrid);

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
      label.className = 'histogram-label' + (entry.udam ? ' histogram-label-clickable' : '');
      label.textContent = entry.label;
      label.title = entry.longLabel || entry.label;
      if (entry.udam) {
        label.addEventListener('click', () => openAssistModeModal(entry));
      }
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

      // Bike-computed range estimate for this mode — same value Flow's own "range estimate"
      // screen shows, confirmed via decompile (DriveUnitAddresses.REACHABLE_RANGE, addr 6231).
      // Not shown for off/walk mode (the bike doesn't report one) or when unread/misaligned.
      if (entry.reachableRangeKm != null) {
        const rangeRow = document.createElement('div');
        rangeRow.className = 'histogram-settings-row';
        const rangeText = document.createElement('span');
        rangeText.className = 'histogram-settings-summary';
        rangeText.textContent = `Estimated range: ~${entry.reachableRangeKm} km`;
        rangeRow.appendChild(rangeText);
        els.assistModeHistogram.appendChild(rangeRow);
      }

      // Per-mode assist settings (UDAM values) + the one write this tool
      // performs. Only shown once we actually have UDAM data for this mode.
      if (entry.udam) {
        const settingsRow = document.createElement('div');
        settingsRow.className = 'histogram-settings-row';

        const summary = document.createElement('span');
        summary.className = 'histogram-settings-summary';
        const parts = [];
        // assistLevel/accelerationResponse: the confirmed ÷100 factor yields
        // a fraction (1.50 = 150%) that already IS the percentage once
        // multiplied back by 100 — i.e. the raw value itself is the percent
        // integer. Dividing by 100 here double-applies the factor (150 raw
        // -> 1.5 -> "2%" instead of "150%", confirmed against a real Turbo
        // mode capture). maximumBikeSpeed is different: its real unit is
        // km/h, not a percentage, so ÷100 (centi-km/h -> km/h) is correct.
        if (entry.udam.assistLevel != null) parts.push(`assist ${entry.udam.assistLevel}%`);
        if (entry.udam.maximumBikeSpeed != null) parts.push(`max ${(entry.udam.maximumBikeSpeed / 100).toFixed(0)} km/h`);
        if (entry.udam.accelerationResponse != null) parts.push(`accel ${entry.udam.accelerationResponse}%`);
        summary.textContent = parts.join(' · ') || 'no settings data';

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'histogram-reset-btn';
        if (entry.resetState === 'pending') {
          resetBtn.textContent = 'Resetting…';
          resetBtn.disabled = true;
        } else if (entry.resetState === 'done') {
          resetBtn.textContent = 'Reset ✓';
          resetBtn.disabled = true;
        } else if (entry.resetState === 'failed') {
          resetBtn.textContent = 'Reset failed — retry?';
        } else {
          resetBtn.textContent = 'Reset to default';
        }
        resetBtn.addEventListener('click', async () => {
          const confirmed = await appConfirm(
            `Reset "${entry.label}" to Bosch factory defaults?\n\n` +
            `This resets ONLY this mode's assist level, max speed, and ` +
            `acceleration response back to the bike's factory settings — the ` +
            `same operation the Bosch Flow app's own "Reset" button performs ` +
            `on a mode's detail screen. It does not touch tuning, region/` +
            `speed-class, or any other assist mode. This is the one write ` +
            `operation this tool performs, and only runs when you click this ` +
            `button.`
          );
          if (confirmed) resetUdamValuesForMode(entry);
        });

        settingsRow.appendChild(summary);
        settingsRow.appendChild(resetBtn);
        els.assistModeHistogram.appendChild(settingsRow);

      }
    }
  }

  function closeAssistModeModal() {
    els.assistModeModalBackdrop.style.display = 'none';
    els.assistModeModalBody.innerHTML = '';
    els.assistModeModalActions.innerHTML = '';
  }
  els.assistModeModalClose.addEventListener('click', closeAssistModeModal);
  els.assistModeModalBackdrop.addEventListener('click', (e) => {
    if (e.target === els.assistModeModalBackdrop) closeAssistModeModal();
  });

  // Certificate popup (currently only Battery's DEVICE_CERTIFICATE — a real EAC/ISO 7816-8 CVC,
  // see messageTypes.js's parseCvcCertificate for the confirmed field semantics). Everything
  // shown here is inherently public (a certificate's own public key + metadata + a signature
  // meant to be publicly verifiable) — nothing sensitive.
  function closeCertModal() {
    els.certModalBackdrop.style.display = 'none';
    els.certModalBody.innerHTML = '';
  }
  els.certModalClose.addEventListener('click', closeCertModal);
  els.certModalBackdrop.addEventListener('click', (e) => {
    if (e.target === els.certModalBackdrop) closeCertModal();
  });
  function openCertModal(title, cvc) {
    els.certModalTitle.textContent = title;
    els.certModalBody.innerHTML = '';
    const addRow = (label, value) => {
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'cert-value';
      v.textContent = value == null ? '—' : value;
      els.certModalBody.append(l, v);
    };
    if (cvc.raw) {
      addRow('Format', 'Not recognized as CVC/X.509 — showing raw bytes');
      addRow('Raw (hex)', cvc.raw);
      els.certModalBackdrop.style.display = 'flex';
      return;
    }
    addRow('Key algorithm', cvc.keyAlgorithm);
    addRow('Public key', cvc.publicKeyHex);
    addRow('Holder reference', cvc.holderReferenceText);
    addRow('Authorization', cvc.authorizationText);
    addRow('Valid from', cvc.validFrom);
    addRow('Valid until', cvc.validUntil);
    addRow('CA reference (hex)', cvc.caReferenceHex);
    addRow('Serial (hex)', cvc.serialHex);
    addRow('Signature', cvc.signatureHex ? `${cvc.signatureLength} bytes: ${cvc.signatureHex}` : null);
    els.certModalBackdrop.style.display = 'flex';
  }
  els.batteryCertBtn.addEventListener('click', () => {
    const cvc = valueOf('Battery', 'DEVICE_CERTIFICATE');
    if (!cvc) return;
    openCertModal('Battery device certificate', cvc);
  });

  // Popup showing all 8 UDAM fields (the 3 shown in the compact summary
  // plus the 5 that are decoded but otherwise hidden). When this mode's
  // UDAM_LIMITS were read successfully, the 3 fields with a confirmed
  // unit/factor are directly editable, bounded to this mode's own reported
  // min/max so it can never request something the bike wouldn't already
  // permit. "Save changes" starts disabled and only lights up once a value
  // actually differs from what was last read — no separate "enter edit
  // mode" step needed.
  function openAssistModeModal(entry) {
    const u = entry.udam;
    els.assistModeModalTitle.textContent = entry.longLabel || entry.label;
    els.assistModeModalBody.innerHTML = '';
    els.assistModeModalActions.innerHTML = '';

    // 3 direct grid children per field (label / value / unit) — NOT wrapped
    // in a row div — so the parent grid's fixed value/unit column widths
    // apply to every field equally, editable or not. That's what keeps the
    // numbers themselves in one vertical column regardless of how wide each
    // row's unit suffix is ("%" vs "km/h").
    const addField = (label, valueText, unit) => {
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'amf-value';
      v.textContent = valueText;
      const un = document.createElement('span');
      un.className = 'amf-unit';
      un.textContent = unit || '';
      els.assistModeModalBody.append(l, v, un);
    };

    const canEdit = entry.udamLimits && entry.udamLimits.min && entry.udamLimits.max;
    const editableInputs = []; // [{ input, key, fromDisplay, original }]

    let saveBtn = null;
    const updateDirty = () => {
      if (!saveBtn) return;
      const dirty = editableInputs.some(({ input, fromDisplay, original }) => {
        const displayVal = parseFloat(input.value);
        if (Number.isNaN(displayVal)) return false;
        return fromDisplay(displayVal) !== original;
      });
      saveBtn.disabled = !dirty || entry.setState === 'pending';
    };

    if (canEdit) {
      const lim = entry.udamLimits;
      const addEditableField = (label, key, unit, toDisplay, fromDisplay) => {
        const l = document.createElement('span');
        l.textContent = label;
        const v = document.createElement('span');
        v.className = 'amf-value';
        const input = document.createElement('input');
        input.type = 'number';
        if (u[key] != null) input.value = toDisplay(u[key]);
        if (lim.min[key] != null) input.min = toDisplay(lim.min[key]);
        if (lim.max[key] != null) input.max = toDisplay(lim.max[key]);
        input.addEventListener('input', updateDirty);
        v.appendChild(input);
        const un = document.createElement('span');
        un.className = 'amf-unit';
        un.textContent = unit || '';
        els.assistModeModalBody.append(l, v, un);
        editableInputs.push({ input, key, fromDisplay, original: u[key] });
      };
      addEditableField('Assist level', 'assistLevel', '%', (v) => v, (v) => Math.round(v));
      addEditableField('Max bike speed', 'maximumBikeSpeed', 'km/h', (v) => (v / 100).toFixed(1), (v) => Math.round(v * 100));
      addEditableField('Acceleration resp.', 'accelerationResponse', '%', (v) => v, (v) => Math.round(v));
    } else {
      addField('Assist level', u.assistLevel != null ? String(u.assistLevel) : '—', '%');
      addField('Max bike speed', u.maximumBikeSpeed != null ? (u.maximumBikeSpeed / 100).toFixed(1) : '—', 'km/h');
      addField('Acceleration resp.', u.accelerationResponse != null ? String(u.accelerationResponse) : '—', '%');
    }
    // Fields with no confirmed unit/factor from decompile — shown as raw
    // values, never made editable (see decodeUdamParams's header comment).
    addField('Max motor torque (raw)', u.maximumMotorTorque != null ? String(u.maximumMotorTorque) : '—');
    addField('Max motor power (raw)', u.maximumMotorPower != null ? String(u.maximumMotorPower) : '—');
    addField('Extended boost (raw)', u.extendedBoost != null ? String(u.extendedBoost) : '—');
    addField('Traction control (raw)', u.tractionControl != null ? String(u.tractionControl) : '—');
    addField('Drive-train tensioner', u.driveTrainTensioner == null ? '—' : (u.driveTrainTensioner ? 'true' : 'false'));

    if (canEdit) {
      saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'histogram-change-btn';
      saveBtn.textContent = entry.setState === 'pending' ? 'Saving…' : 'Save changes';
      saveBtn.disabled = true; // nothing changed yet
      saveBtn.addEventListener('click', async () => {
        const changes = {};
        const lines = [];
        editableInputs.forEach(({ input, key, fromDisplay, original }) => {
          const displayVal = parseFloat(input.value);
          if (Number.isNaN(displayVal)) return;
          const rawVal = fromDisplay(displayVal);
          if (rawVal !== original) {
            changes[key] = rawVal;
            lines.push(`  ${key}: ${original} -> ${rawVal}`);
          }
        });
        if (!lines.length) return; // save button is disabled in this case anyway
        const confirmed = await appConfirm(
          `Change "${entry.label}" settings?\n\n` +
          lines.join('\n') + '\n\n' +
          `Only these fields change — everything else in this mode's ` +
          `settings is sent back unchanged. Values are bounded by this ` +
          `mode's own reported limits, the same as Bosch Flow's own ` +
          `"customize this mode" screen.`
        );
        if (confirmed) {
          closeAssistModeModal();
          setUdamValuesForMode(entry, changes);
        }
      });
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'histogram-change-btn secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', closeAssistModeModal);
      els.assistModeModalActions.appendChild(saveBtn);
      els.assistModeModalActions.appendChild(cancelBtn);
    } else {
      const note = document.createElement('span');
      note.className = 'histogram-settings-summary';
      note.textContent = "no limits data — can't safely offer changes for this mode";
      els.assistModeModalActions.appendChild(note);
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'histogram-change-btn secondary';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', closeAssistModeModal);
      els.assistModeModalActions.appendChild(closeBtn);
    }

    els.assistModeModalBackdrop.style.display = 'flex';
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
      if (r.writable) {
        const w = document.createElement('span');
        w.className = 'writable-marker';
        w.textContent = '✎'; // pencil
        // IMPORTANT distinction (see private research notes): this marks a STATIC protocol fact —
        // Bosch's own code declares this MessageBus address as a writable data point for every
        // Smart System bike — not a live capability check of THIS bike. START_ASSIST_MODE_CONFIGURATION
        // (6180) is always statically "writable" in this sense too, yet whether a write to it actually
        // sticks depends on a separate live flag read from a DIFFERENT address (6179's `configurable`
        // field) that our tool now checks before offering that write. None of the other fields marked
        // here have had a similar hidden-precondition check traced — this badge is not a safety claim.
        w.title = 'Statically writable in Bosch’s own code (protocol-level fact, not a live check of this bike) — whether a write actually sticks may depend on an untraced precondition, as it did for start-assist-mode';
        markCell.appendChild(w);
      }
      const valCell = document.createElement('span');
      if (r.status === 'ok') {
        const d = r.typed || r.decoded;
        valCell.textContent = d.display;
        if (d.technical) valCell.title = d.technical;
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
      reportVersion: REPORT_FORMAT_VERSION,
      results: lastResults.map((r) => ({
        component: r.component,
        name: r.name,
        address: '0x' + r.addr.toString(16).padStart(4, '0'),
        status: r.status,
        typed: !!r.typed,
        // Statically writable per Bosch's own code — not a live check of this bike, see the
        // matching UI tooltip / README for the important caveat (start-assist-mode precedent).
        writable: !!r.writable,
        // The exported report keeps the full technical detail (e.g. "eTrekking [TREKKING=2]")
        // even though the live UI now shows only the human-friendly label with that same
        // detail moved to a hover tooltip — this file is a technical record, not a dashboard.
        value: r.status === 'ok'
          ? (() => {
              const d = r.typed || r.decoded;
              return d.technical ? `${d.display} [${d.technical}]` : d.display;
            })()
          : null,
        // The underlying typed value (number/bool/string/plain object), not just its display
        // string — lets "load a saved report" (below) reconstruct a dashboard that behaves
        // like a live read (percentages, gates, etc.) instead of only showing text.
        rawValue: r.status === 'ok' ? (r.typed || r.decoded).value : null,
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

  // Reusable offline path: view any previously exported report — same dashboard, same cards,
  // no bike or transport required. Doesn't need a live connection at all; the existing "not
  // connected" guard on every write button already prevents write experiments from doing
  // anything harmful against this loaded, disconnected state.
  function buildResultsFromReport(report) {
    const results = [];
    for (const r of report.results || []) {
      const addr = parseInt(r.address, 16);
      if (!r.component || !r.name || Number.isNaN(addr)) continue; // skip anything unparseable
      let typed = null;
      if (r.status === 'ok') {
        // rawValue is the real typed value (number/bool/string/plain object) — added alongside
        // this load-from-file feature (REPORT_FORMAT_VERSION 1). A report exported without it
        // has only the display STRING to fall back to (e.g. "88 %" instead of the number 88),
        // which breaks any downstream computation (SoC bar fill, odometer km conversion, gate
        // checks) — loadReportFile() below warns the user up front when that's the case, rather
        // than silently mis-rendering.
        const value = Object.prototype.hasOwnProperty.call(r, 'rawValue') ? r.rawValue : r.value;
        // Re-derive the display string from rawValue where that's environment-dependent (right
        // now: timestamps, which render in whoever's *viewing* them — the exported "value" string
        // is frozen from whichever machine/locale produced the report, not this one). Falls back
        // to the report's own stored string for every other kind, unchanged from before.
        const display = reformatDisplayFromRaw(addr, value) ?? r.value;
        typed = { label: r.name, display, value };
      }
      results.push({
        component: r.component,
        name: r.name,
        addr,
        readable: true,
        writable: !!r.writable,
        status: r.status,
        detail: r.status === 'ok' ? '' : 'unknown — loaded from file',
        decoded: typed,
        typed,
      });
    }
    return results;
  }

  function loadReportFile(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      let report;
      try {
        report = JSON.parse(reader.result);
      } catch (err) {
        await appAlert('Could not parse that file as JSON: ' + err.message);
        return;
      }
      if (!report || !Array.isArray(report.results)) {
        await appAlert('That doesn\'t look like a BES3 Reader export — expected a "results" array.');
        return;
      }
      if (report.reportVersion !== REPORT_FORMAT_VERSION) {
        const proceed = await appConfirm(
          `This report was exported by an older/different version of the tool (missing or ` +
          `mismatched reportVersion — expected ${REPORT_FORMAT_VERSION}, got ${report.reportVersion ?? 'none'}).\n\n` +
          `It's missing the real typed values this loader needs, so numbers will fall back to ` +
          `their display text (e.g. "88 %" instead of 88) — things like the battery bar and ` +
          `odometer conversion won't render correctly.\n\nLoad it anyway?`
        );
        if (!proceed) return;
      }
      lastResults = buildResultsFromReport(report);
      // Not part of the exported report (it's a separate RPC sweep, not an address read) — the
      // assist-mode histogram simply stays empty for a loaded file, same as it would for any
      // bike where that RPC sweep hasn't run yet.
      assistModeStats = [];
      for (const key of Object.keys(experimentState)) delete experimentState[key];
      startModeTryAllResults = null;
      transport = null;
      method = 'usb';
      phase = 'connected';
      disconnectedAfterRead = true;
      loadedFromFile = true;
      sweepFullyLoaded = true; // no live sweep is running against a loaded report — nothing to wait on
      renderChooser();
      renderPhase();
      renderDashboard();
      const dlog = window.Bes3DebugLog;
      if (dlog) dlog.log('app', `loaded report from file: ${file.name}`, `${lastResults.length} entries, generated ${report.generatedAt || 'unknown time'}`);
    };
    reader.onerror = () => appAlert('Could not read that file.');
    reader.readAsText(file);
  }

  els.loadReportLink.addEventListener('click', (e) => {
    e.preventDefault();
    els.loadReportInput.click();
  });
  els.loadReportInput.addEventListener('change', () => {
    const file = els.loadReportInput.files && els.loadReportInput.files[0];
    if (file) loadReportFile(file);
    els.loadReportInput.value = '';
  });

  // transportKind: 'usb' (normal path) | 'ble-mcsp' (experimental full read
  // over BLE, reusing the reverse-engineered MessageBus protocol instead of
  // Bosch's official Live Data Interface — see transport-webble-mcsp.js).
  // Both produce the exact same lastResults shape, so the rest of the
  // dashboard/raw-table code is unaware which transport was used.
  async function runSweep(transportKind) {
    disconnectedAfterRead = false;
    loadedFromFile = false;
    assistModeStats = [];
    for (const key of Object.keys(experimentState)) delete experimentState[key];
    startModeTryAllResults = null;
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
    sweepFullyLoaded = false;
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

    // Sourced from the address registry, not ALL_ADDRESSES — "priority" (read-first) is now
    // derived from having a `ui` block (i.e. this address feeds a dashboard element) rather than
    // a separately-maintained flag, so there's nothing to keep in sync with what's actually shown.
    const registryAddresses = window.Bes3AddressRegistry.ADDRESS_REGISTRY.addresses;
    const all = registryAddresses
      .filter((e) => e.readable === true)
      .map((e) => ({
        component: e.component,
        name: e.name,
        addr: e.address,
        readable: e.readable,
        writable: e.writable,
        priority: !!e.ui,
      }));
    // Stable sort (spec-guaranteed in modern JS): priority entries keep their registry order
    // among themselves, same for the rest — no separate index/rank needed.
    const readable = all.slice().sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0));
    const priorityCount = readable.filter((e) => e.priority).length;

    const results = [];
    const compStats = {};
    let done = 0;
    let aborted = false;
    // Once the priority batch (everything the dashboard actually renders) is in, switch to the
    // dashboard screen right away and keep reading the rest of the sweep in the background —
    // rather than making the user stare at a progress bar for a ~2 min full sweep before seeing
    // anything. `transport` (not `phase`) is the loop's stay-alive check from here on, since we
    // deliberately flip `phase` to 'connected' mid-sweep; handleDisconnect() already treats a
    // disconnect during phase 'connected' as "keep the dashboard, mark it stale", which is
    // exactly right for a disconnect during this background backfill too.
    let revealed = false;
    sweepWatchdogFired = false;
    sweepWatchdogTimer = setInterval(() => {
      if (sweepWatchdogFired || !sweepWatchdogAddr) return;
      const stuckMs = Date.now() - sweepWatchdogStart;
      if (stuckMs < 8000) return;
      sweepWatchdogFired = true;
      if (window.Bes3DebugLog) {
        window.Bes3DebugLog.log('sweep', 'possible transport stall', `${sweepWatchdogAddr} — no response after ${stuckMs}ms; a stuck USB transfer can't be cancelled, reconnect if this doesn't clear`);
      }
      if (!revealed) els.connectingSub.textContent = `stuck on ${sweepWatchdogAddr} — try reconnecting if this doesn't clear`;
    }, 1000);
    for (const entry of readable) {
      if (!transport) { clearInterval(sweepWatchdogTimer); return; } // disconnected mid-sweep
      if (abortRequested) { aborted = true; break; }

      const cs = compStats[entry.component] || (compStats[entry.component] = { ok: 0, fails: 0 });
      if (!CORE_COMPONENTS.has(entry.component) && cs.ok === 0 && cs.fails >= 3) {
        results.push({ ...entry, status: 'skipped', detail: 'component not detected', decoded: null, typed: null });
        done++;
        continue;
      }

      let result = null;
      let status = 'ok';
      let detail = '';
      sweepWatchdogAddr = `${entry.component}.${entry.name}`;
      sweepWatchdogStart = Date.now();
      sweepWatchdogFired = false;
      try {
        result = await readOne(entry.addr);
      } catch (err) {
        if (/disconnect|no device|not found/i.test(err.name + ' ' + err.message)) {
          clearInterval(sweepWatchdogTimer);
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
      // A clean 'declined' is just as good a "not present" signal as a 'timeout' — a component
      // that's genuinely absent (no ABS, no second battery, no display) answers every one of its
      // addresses with a fast decline, and would otherwise never trip this skip since it never times out.
      if (status === 'ok') cs.ok++;
      else if (status === 'timeout' || status === 'declined') cs.fails++;

      let decoded = null;
      let typed = null;
      if (status === 'ok') {
        typed = decodeTyped(entry.addr, result.payload);
        decoded = typed || decodeValue(result.payload);
      }
      results.push({ ...entry, status, detail, decoded, typed });
      done++;

      if (!revealed && done >= priorityCount) {
        revealed = true;
        lastResults = results;
        phase = 'connected';
        renderPhase();
        renderDashboard();
        if (done < readable.length) {
          els.sweepProgress.style.display = 'flex';
        }
        // Per-assist-mode usage (the histogram) is UI-visible data, same as everything else in
        // the priority batch — it should load before the ~740 non-displayed background addresses,
        // not after all of them. readAllAssistModeStats() is fully self-contained (does its own
        // reads, doesn't depend on any result from this sweep loop), so it's safe to run here
        // rather than after the entire sweep finishes, which is where it used to run — a real gap
        // caught by asking "is usage data actually loaded before non-displayed data?" (it wasn't).
        // The transport is single-threaded (one read in flight at a time), so this does pause the
        // background sweep below while it runs - that's the intended trade-off, not a side effect.
        if (!aborted && transport) {
          els.sweepProgressText.textContent = 'reading per-mode ride statistics…';
          // Keep the stall watchdog's "what's it stuck on" naming accurate for this window too —
          // readAllAssistModeStats() does its own reads outside this loop's per-iteration tracking.
          sweepWatchdogAddr = 'per-mode ride statistics';
          sweepWatchdogStart = Date.now();
          sweepWatchdogFired = false;
          try { await readAllAssistModeStats(); } catch (_) {}
          lastResults = results;
          renderDashboard();
        }
      }
      if (!revealed) {
        els.connectingBar.style.width = Math.round((done / Math.max(1, priorityCount)) * 100) + '%';
        els.connectingSub.textContent = `${done}/${priorityCount} points`;
      } else {
        const backTotal = Math.max(1, readable.length - priorityCount);
        const backDone = done - priorityCount;
        els.sweepProgressFill.style.width = Math.round((backDone / backTotal) * 100) + '%';
        els.sweepProgressText.textContent = `Loading more… ${backDone}/${backTotal}`;
        if (done % 10 === 0 || done === readable.length) {
          lastResults = results;
          renderDashboard();
        }
      }
      await sleep(10);
    }
    clearInterval(sweepWatchdogTimer);
    sweepWatchdogAddr = null;

    if (!revealed) {
      // Aborted/disconnected before the priority batch finished — still reveal what we have
      // rather than leaving the connecting screen up with no way forward.
      lastResults = results;
      phase = 'connected';
      renderPhase();
    }

    // Fallback only — the normal path already ran this right at the reveal point above, as soon
    // as the priority batch finished. This only fires if the sweep was aborted/disconnected
    // before ever reaching that point, so `revealed` (and therefore the earlier call) never
    // happened.
    if (!revealed && !aborted && transport) {
      els.sweepProgress.style.display = 'flex';
      els.sweepProgressText.textContent = 'reading per-mode ride statistics…';
      try { await readAllAssistModeStats(); } catch (_) {}
    }

    lastResults = results;
    sweepFullyLoaded = true;
    els.sweepProgress.style.display = 'none';
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

    // Deliberately NOT closing the transport here (an earlier version of
    // this file always did). The per-mode "reset to default" repair action
    // needs a live connection to call RESET_UDAM_VALUES after the user has
    // seen the dashboard and explicitly chosen to use it — keep-alive keeps
    // running too, so the session doesn't expire while they decide. The
    // existing Disconnect button already handles closing a still-open
    // transport correctly.
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
  els.appVersion.textContent = `v${APP_VERSION}`;
  if (window.Bes3DebugLog) window.Bes3DebugLog.log('app', `BES3 Reader version ${APP_VERSION}`);
  initDisclaimer();
  method = 'usb';
  renderChooser();
  renderPhase();
})();
