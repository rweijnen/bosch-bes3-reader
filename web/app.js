(function () {
  // Bump this on every meaningful app.js/index.html change. Shown in the
  // header and logged as the first debug-log line so a "did my reload
  // actually pick up the new build?" question can be answered by looking,
  // not assumed — browser/CDN caching can otherwise make a hard refresh
  // silently keep serving a stale bundle.
  const APP_VERSION = '2026-11-06.1-subscribe-live-data';

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
    encodeBoolArg, encodeStringArg, encodeStartAssistModeOemArg,
    buildRpcCallFrame, buildRpcCallFrameWithArg,
    buildSubscribeRequestFrame, buildUnsubscribeRequestFrame, parseNotifyMessage,
    encodeConfigIdArg, decodeAssistModeStatistics, decodeConfigIdList, decodeStringList,
    decodeUdamParams, decodeBoolResponse, decodeUdamLimits, encodeSetUdamValuesParametersArg,
    DiagnosticCommand, diagnosticReturnValueName, encodeExecuteInformationManagerCommandArg,
    decodeExecuteInformationManagerCommandReturn,
    parseReadResponseFrame, decodeValue, toHex,
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
    writeLabComponentFilter: $('writeLabComponentFilter'),
    writeLabSearch: $('writeLabSearch'),
    writeLabAddressList: $('writeLabAddressList'),
    writeLabDetail: $('writeLabDetail'),
    liveCard: $('liveCard'),
    liveSearch: $('liveSearch'),
    liveDatalist: $('liveDatalist'),
    liveDefaultsBtn: $('liveDefaultsBtn'),
    liveSubscribeShownBtn: $('liveSubscribeShownBtn'),
    liveAllBtn: $('liveAllBtn'),
    liveStopAllBtn: $('liveStopAllBtn'),
    liveStatus: $('liveStatus'),
    liveTableWrap: $('liveTableWrap'),
    liveTBody: $('liveTBody'),
    livePicker: $('livePicker'),
    diagnosticsCatalogStatus: $('diagnosticsCatalogStatus'),
    diagnosticsScanBtn: $('diagnosticsScanBtn'),
    diagnosticsResults: $('diagnosticsResults'),
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

    updateLiveCard();
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
    // Hide the background "Loading more bike data…" badge: on a disconnect the sweep
    // loop exits silently, and a counter frozen at its last value reads like a hang.
    els.sweepProgress.style.display = 'none';
    clearInterval(sweepWatchdogTimer);
    sweepWatchdogAddr = null;
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
  let keepAliveSeq = 0;

  // Back off the keep-alive when writes keep failing: 3 in a row suspends it
  // for 15 s, so USB recovery isn't fighting a queue of doomed keep-alives.
  let keepAliveFailStreak = 0;
  let keepAliveSuspendedUntil = 0;

  // Sends the keep-alive RPC and waits briefly for the matching RPC_RESPONSE,
  // logging the outcome — so an idle-period debug log shows whether the bike's
  // session was still alive throughout, not just whether we tried. A bike that
  // silently stopped answering while our USB writes still succeed is exactly the
  // failure mode a fire-and-forget ping can't see (see private research notes).
  async function sendKeepAlive() {
    if (!transport) return;
    const dlog = window.Bes3DebugLog;
    if (Date.now() < keepAliveSuspendedUntil) return;
    // Something else (a sweep read, an assist-mode RPC, a write) holds or is
    // waiting for the transport — don't send our own ping. Two concurrent readers
    // pulling from the same frame queue could steal each other's responses, and
    // it's redundant anyway: any real command resets the bike's inactivity timer
    // just as well as a dedicated keep-alive would.
    const lock = tryAcquireTransport();
    if (!lock) {
      if (dlog) dlog.log('keepalive', 'skipped (transport busy with real activity)');
      return;
    }
    try {
      keepAliveSeq = (keepAliveSeq + 1) & 0x0f;
      const addr = KEEP_ALIVE_ADDR;
      await transport.doMcspWrite(buildRpcCallFrame(addr, keepAliveSeq));
      const deadline = Date.now() + 300;
      while (Date.now() < deadline) {
        const raw = await transport.readNextFrame(2, 5);
        if (!raw) continue;
        if (liveRescueFrame(raw)) continue; // a live NOTIFY / live-ack — not the keep-alive's response
        const parsed = parseReadResponseFrame(raw);
        if (!parsed) continue;
        if (parsed.addrHigh !== (addr >> 8) || parsed.addrLow !== (addr & 0xff)) continue;
        if (dlog) dlog.log('keepalive', parsed.ok ? 'ok' : `declined: ${parsed.statusName}`);
        keepAliveFailStreak = 0;
        return;
      }
      if (dlog) dlog.log('keepalive', 'no response (timeout)');
    } catch (err) {
      if (dlog) dlog.log('keepalive', 'write failed: ' + err.message);
      keepAliveFailStreak += 1;
      if (keepAliveFailStreak >= 3) {
        keepAliveSuspendedUntil = Date.now() + 15000;
        if (dlog) dlog.log('keepalive', `suspending for 15 s after ${keepAliveFailStreak} consecutive failures`);
        keepAliveFailStreak = 0;
      }
    } finally {
      releaseTransport(lock);
    }
  }

  // Self-scheduling loop rather than setInterval: the next ping starts 800 ms
  // after the PREVIOUS one finished, so a slow send (a failing write can block
  // for seconds) can't pile up overlapping keep-alives. The generation counter
  // is the off switch — bumping it makes the running loop exit at its next check.
  let keepAliveGeneration = 0;
  function startKeepAlive() {
    stopKeepAlive();
    const generation = ++keepAliveGeneration;
    (async function loop() {
      while (generation === keepAliveGeneration) {
        await sendKeepAlive();
        if (generation !== keepAliveGeneration) break;
        await sleep(KEEP_ALIVE_INTERVAL_MS);
      }
    })();
  }
  function stopKeepAlive() {
    keepAliveGeneration++;
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

  // Transport lock: held for the duration of any exchange that polls
  // transport.readNextFrame() — two concurrent readers pulling from the same
  // underlying frame queue could steal a response meant for the other one.
  // Never set directly: take it with acquireTransport() (real requests, waits)
  // or tryAcquireTransport() (background keep-alive / live pump, gives way),
  // and give it back with releaseTransport(id).
  let transportBusy = false;
  // Lock ownership: each acquire gets a fresh id and only the current owner's
  // release clears the flag, so a holder that was taken over (see below) can't
  // unlock the next owner from its `finally`.
  let transportLockId = 0;
  let transportWaiters = 0; // real requesters queued in acquireTransport()

  // Waits for the transport, then takes it. Used by every request/response exchange
  // (reads, RPCs, writes, one-shot subscribes). If the holder hasn't let go after
  // maxWaitMs it's presumed wedged and we take over rather than hang forever.
  async function acquireTransport(maxWaitMs = 5000) {
    if (transportBusy) {
      const deadline = Date.now() + maxWaitMs;
      transportWaiters += 1;
      try {
        while (transportBusy && Date.now() < deadline) await sleep(5);
      } finally {
        transportWaiters -= 1;
      }
      if (transportBusy && window.Bes3DebugLog) {
        window.Bes3DebugLog.log('transport', `lock still held after ${maxWaitMs} ms — taking over`);
      }
    }
    transportBusy = true;
    return ++transportLockId;
  }

  // Non-blocking acquire for background work (keep-alive, live pump): fails if the
  // lock is held OR a real requester is waiting for it, so background polling
  // always yields to actual reads/RPCs instead of starving them. Returns 0 on failure.
  function tryAcquireTransport() {
    if (transportBusy || transportWaiters > 0) return 0;
    transportBusy = true;
    return ++transportLockId;
  }

  function releaseTransport(id) {
    if (id && id === transportLockId) transportBusy = false;
  }

  // Reads one address: drain stale frames, send, wait for the answer (2 attempts).
  // hardBudgetMs caps the TOTAL time — without it, a stalling field can stack its
  // bounded steps into 20-40 s and look stuck. We never abandon an in-flight step
  // (an orphaned read would steal frames from the next field); the deadline is
  // checked between steps, so worst case overshoots by one bounded step (~4 s).
  async function readOne(addr, hardBudgetMs = 12000) {
    const lock = await acquireTransport();
    const hardStop = Date.now() + hardBudgetMs;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (Date.now() >= hardStop) break;
        for (let i = 0; i < 4; i++) {
          const stale = await transport.readNextFrame(1, 2);
          if (!stale) break; // nothing buffered
          liveRescueFrame(stale); // normally dropped — keep live NOTIFYs alive during sweeps
        }
        await transport.doMcspWrite(buildReadRequestFrame(addr, nextSeq()));
        const deadline = Math.min(Date.now() + 300, hardStop);
        while (Date.now() < deadline) {
          const raw = await transport.readNextFrame(4, 4);
          if (!raw) continue;
          if (liveRescueFrame(raw)) continue; // a live NOTIFY / live-ack — not this read's response
          const parsed = parseReadResponseFrame(raw);
          if (!parsed) continue;
          if (parsed.addrHigh !== (addr >> 8) || parsed.addrLow !== (addr & 0xff)) continue;
          if (!parsed.ok) return { declined: true, statusName: parsed.statusName };
          return { payload: parsed.payload };
        }
      }
      return null;
    } finally {
      releaseTransport(lock);
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
  // frame was observed arriving during a write's response window; see
  // writeAndReadBack's own seq-matching for the same fix). Matters even more here since this is
  // also used for the UDAM write below — accepting a stray frame as "success"
  // for a write is worse than for a read.
  async function rpcCallWithArg(addr, argPayload, decodeFn, logLabel) {
    const lock = await acquireTransport();
    const hardStop = Date.now() + 12000; // same hard per-call budget as readOne — bounded waits must not stack
    try {
      const dlog = window.Bes3DebugLog;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (Date.now() >= hardStop) break;
        for (let i = 0; i < 4; i++) {
          const stale = await transport.readNextFrame(1, 2);
          if (!stale) break; // nothing buffered
          liveRescueFrame(stale); // normally dropped — keep live NOTIFYs alive during RPCs
        }
        const sentSeq = nextSeq();
        const frame = buildRpcCallFrameWithArg(addr, sentSeq, argPayload);
        if (dlog) dlog.log('assist-rpc', `-> addr 0x${addr.toString(16)}${logLabel ? ' ' + logLabel : ''} attempt ${attempt} seq ${sentSeq}`, frame);
        await transport.doMcspWrite(frame);
        const deadline = Math.min(Date.now() + 500, hardStop); // RPC round-trip can be slower than a plain read
        while (Date.now() < deadline) {
          const raw = await transport.readNextFrame(4, 4);
          if (!raw) continue;
          if (dlog) dlog.log('assist-rpc', '<- raw frame', raw);
          if (liveRescueFrame(raw)) continue; // a live NOTIFY / live-ack — not this RPC's response
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
      releaseTransport(lock);
    }
  }

  async function rpcCallWithConfigId(addr, configId, decodeFn) {
    return rpcCallWithArg(addr, encodeConfigIdArg(configId), decodeFn, `configId="${configId}"`);
  }

  // Subscribes to a *SubscribableDataPoint address, waits briefly for the bike's pushed
  // NotifyMessage carrying its actual value, then always unsubscribes before returning —
  // read-only in effect (it doesn't change any bike setting, only registers momentary interest
  // in push updates), but a genuinely different MCSP operation than a plain read. Exists because
  // a real capture showed DriveUnit.REACHABLE_RANGE (addr 6231) declining every plain-read
  // attempt with DENIED, and tracing Flow's own decompiled per-mode range display back to its
  // source found it uses exactly this — driveUnit.getReachableRange().subscribe(), never a
  // one-shot read (see the address-registry.json entry for the full trace). Confirmed via
  // decompile of com.bosch.ebike.messagebus.MessageBus that 439 other addresses across every
  // component are declared the same *SubscribableDataPoint way — this is the first one attempted
  // for real, not a generic mechanism proven to work everywhere yet.
  async function subscribeOnce(addr, waitForNotifyMs = 2000) {
    const lock = await acquireTransport();
    const dlog = window.Bes3DebugLog;
    try {
      for (let i = 0; i < 4; i++) {
        const stale = await transport.readNextFrame(1, 2);
        if (!stale) break; // nothing buffered
        liveRescueFrame(stale); // normally dropped — keep live NOTIFYs alive under a one-shot subscribe
      }
      const subSeq = nextSeq();
      const subFrame = buildSubscribeRequestFrame(addr, subSeq);
      if (dlog) dlog.log('range-subscribe', `-> SUBSCRIBE addr 0x${addr.toString(16)} seq ${subSeq}`, subFrame);
      await transport.doMcspWrite(subFrame);

      let ack = null;
      const ackDeadline = Date.now() + 500;
      while (Date.now() < ackDeadline) {
        const raw = await transport.readNextFrame(4, 4);
        if (!raw) continue;
        if (liveRescueFrame(raw)) continue; // a live NOTIFY / live-ack — not this subscribe's ack
        const parsed = parseReadResponseFrame(raw);
        if (parsed && parsed.type === MessageType.SUBSCRIBE_RESPONSE && parsed.seq === subSeq) { ack = parsed; break; }
      }
      if (dlog) dlog.log('range-subscribe', '<- SUBSCRIBE_RESPONSE', ack ? `ok=${ack.ok} status=${ack.statusName}` : 'no response within 500ms');
      if (!ack || !ack.ok) return { subscribed: false, ackStatus: ack ? ack.statusName : 'timeout' };

      let notify = null;
      const notifyDeadline = Date.now() + waitForNotifyMs;
      while (Date.now() < notifyDeadline) {
        const raw = await transport.readNextFrame(4, 4);
        if (!raw) continue;
        if (liveRescueFrame(raw)) continue; // a push for a *live* subscription — route it there
        const n = parseNotifyMessage(raw);
        if (n && n.addr === addr) { notify = n; break; }
      }
      if (dlog) dlog.log('range-subscribe', notify ? '<- NotifyMessage received' : `<- no NotifyMessage within ${waitForNotifyMs}ms`, notify ? notify.payload : undefined);
      return { subscribed: true, notify };
    } finally {
      try {
        const unsubSeq = nextSeq();
        const unsubFrame = buildUnsubscribeRequestFrame(addr, unsubSeq);
        if (dlog) dlog.log('range-subscribe', `-> UNSUBSCRIBE addr 0x${addr.toString(16)} seq ${unsubSeq}`, unsubFrame);
        await transport.doMcspWrite(unsubFrame);
        for (let i = 0; i < 4; i++) {
          const drained = await transport.readNextFrame(2, 3);
          if (!drained) break; // best-effort drain of the ack, don't block on it
          liveRescueFrame(drained); // a live NOTIFY caught in the drain — keep it
        }
      } catch (_) { /* best-effort cleanup only */ }
      releaseTransport(lock);
    }
  }

  // ================= Live data: persistent MCSP subscriptions =================
  //
  // subscribeOnce() above proves the mechanism for one address; this section turns it
  // into a real live-data view: SUBSCRIBE many addresses, keep them subscribed, and
  // decode the NOTIFY frames the bike pushes as values change.
  //
  // The lifecycle rules mirror Bosch's own subscription manager in BDT3
  // (eds-communication-bike3: SubscriptionRetrier + UsbGateway + Bes3CommunicationSetting):
  //   - subscribe requests are sent ONE at a time from a serial queue, spaced
  //     BikeDelaySubscriptions (100 ms) apart — BDT3 never blasts a burst;
  //   - each request must be ACKed within SubscribeTimeout (5 s);
  //   - only OVERLOADED / NOT_READY / TIMEOUT responses are retried (with a FRESH
  //     sequence number — the old one was consumed by the failed exchange), at most
  //     MaxRetryCountPerRequest (4) times; DENIED and friends are final;
  //   - reconnects renew every subscription (UsbGateway.renewSubscriptions bumps
  //     brcConnectSequence so stale queued requests retire themselves) — here a
  //     reconnect is a teardown instead, since this app re-scans from scratch;
  //   - nowhere in BDT3 is there a hard cap on concurrent subscriptions; load is
  //     handled by pacing (100 ms) and honouring the bike's own OVERLOADED backpressure.

  const LIVE_DEFAULT_SET = [
    // [component, name] — real-time ride telemetry the bike is known to push.
    ['Battery', 'CHARGING_ACTIVE'], ['Battery', 'PRESENT_CELL_VOLTAGE'],
    ['Battery', 'PRESENT_PACK_TEMPERATURE'], ['Battery', 'CHARGER_CONNECTED'],
    ['Battery', 'REMAINING_ENERGY'], ['Battery', 'REMAINING_ENERGY_FOR_RIDER'],
    ['RemoteControl', 'AMBIENT_BRIGHTNESS'],
    ['DriveUnit', 'DISPLAYED_BIKE_SPEED'], ['DriveUnit', 'PRESENT_PCB_TEMPERATURE'],
    ['DriveUnit', 'ASSIST_MODE'], ['DriveUnit', 'ASSIST_MODE_COLORS'],
    ['DriveUnit', 'AVERAGE_RIDER_CADENCE'], ['DriveUnit', 'BIKE_LIGHT'],
    ['DriveUnit', 'BIKE_LIGHT_CONFIGURATION'], ['DriveUnit', 'BIKE_LIGHT_POWER'],
    ['DriveUnit', 'ROAD_SLOPE'],
    ['AntiLockBrakeSystem', 'FRONT_WHEEL_SPEED'], ['AntiLockBrakeSystem', 'REAR_WHEEL_SPEED'],
  ];

  const liveState = {
    entries: new Map(),      // addr -> {addr, component, name, label, kind, state, statusName, statusDetail, retries, cancelRequested, display, technical, rawHex, count, lastAt, window: []}
    queue: [],               // fresh ops: {kind: 'sub'|'unsub', addr} — always processed first
    deferred: [],            // timed-out subscribes parked here: processed only when `queue`
                             // is empty, so a newly added field never waits behind the
                             // 2 s x 4 timeout carousel of dead addresses (minutes in total)
    paceMs: 100,             // fixed at BDT3's BikeDelaySubscriptions default — one subscribe per 100 ms
    workerRunning: false,
    pumpRunning: false,
    totalNotifies: 0,
    notifyWindow: [],        // performance.now() stamps (5 s) for the global push rate
    renderScheduled: false,
    uiTimer: null,
    pickerTerm: '',
    pickerResults: [],       // registry entries currently shown by the picker
  };
  // Single in-flight ack wait (subscribe ops are serial, so one slot is enough —
  // matches SubscriptionRetrier's requestsInFlight handling of one request at a time).
  let liveAckWaiter = null; // {addr, seq, respType, resolve}

  function liveSubscribableRegistryEntries() {
    return window.Bes3AddressRegistry.ADDRESS_REGISTRY.addresses.filter((e) => e.subscribable);
  }

  // Feeds one inbound frame to the live machinery. Returns true only when the frame
  // was consumed here (a NOTIFY for a subscribed address, or the ack of an in-flight
  // live subscribe/unsubscribe) — callers use that to decide whether the frame is
  // still theirs to match. Called from the pump below AND from the frame-dropping
  // paths of readOne/rpcCallWithArg/subscribeOnce/writeAndReadBack/sendKeepAlive, so live updates keep
  // flowing even while a sweep or a write is in progress.
  function liveRescueFrame(raw) {
    if (!raw) return false;
    if (liveState.entries.size > 0) {
      const n = parseNotifyMessage(raw);
      if (n && liveState.entries.has(n.addr)) {
        liveHandleNotify(n);
        return true;
      }
    }
    const parsed = parseReadResponseFrame(raw);
    if (parsed && liveAckWaiter) {
      const w = liveAckWaiter;
      if (parsed.type === w.respType && parsed.seq === w.seq &&
          parsed.addrHigh === (w.addr >> 8) && parsed.addrLow === (w.addr & 0xff)) {
        liveAckWaiter = null;
        w.resolve(parsed);
        return true;
      }
    }
    return false;
  }

  function liveAwaitAck(addr, seq, respType, timeoutMs) {
    return new Promise((resolve) => {
      const self = { addr, seq, respType, resolve };
      liveAckWaiter = self;
      // SubscribeTimeout — on expiry the caller treats it as TIMEOUT (retryable),
      // exactly like SubscriptionRetrier.checkTimeouts re-enqueuing expired requests.
      // (sleep() is setTimeout-based, so a hidden tab's timer throttling can stretch
      // this; that only delays a retry, and an ack that does arrive still resolves it.)
      sleep(timeoutMs).then(() => {
        if (liveAckWaiter === self) {
          liveAckWaiter = null;
          resolve(null);
        }
      });
    });
  }

  // Fallback for subscribed addresses with no confirmed type (FIELD_TYPES has no entry —
  // decodeTyped returns null): most unknown-kind scalars push a bare protobuf field-1
  // varint (tag 0x08), which generic decodeValue would misrender as big-endian hex.
  // Decoding the varint is still honest about being undecoded — the "(raw)" suffix.
  function liveDecodeRawFallback(payload) {
    if (payload && payload.length >= 2 && payload[0] === 0x08) {
      let v = 0;
      let shift = 0;
      for (let i = 1; i < payload.length; i++) {
        v += (payload[i] & 0x7f) * Math.pow(2, shift);
        if ((payload[i] & 0x80) === 0) return { display: `${v} (raw)`, value: v };
        shift += 7;
      }
    }
    return decodeValue(payload);
  }

  function liveHandleNotify(n) {
    const entry = liveState.entries.get(n.addr);
    if (!entry) return;
    const now = performance.now();
    // A pushed NOTIFY is hard proof the bike has us subscribed. If the ack was lost
    // (USB race, timeout) and the entry sits in queued/failed/denied, correct it.
    if (entry.state !== 'active') {
      const dlog = window.Bes3DebugLog;
      if (dlog) dlog.log('live', `push received for ${entry.component}.${entry.name} while state=${entry.state} — marking active`);
      entry.state = 'active';
      entry.statusName = '';
      entry.statusDetail = '';
      entry.retries = 0;
    }
    entry.count += 1;
    entry.lastAt = Date.now();
    entry.window.push(now);
    const cutoff = now - 5000;
    while (entry.window.length && entry.window[0] < cutoff) entry.window.shift();
    const decoded = decodeTyped(n.addr, n.payload) || liveDecodeRawFallback(n.payload);
    entry.display = decoded.display;
    entry.technical = decoded.technical;
    entry.rawHex = toHex(n.payload);
    if (entry.count === 1) {
      const dlog = window.Bes3DebugLog;
      if (dlog) dlog.log('live', `first push: ${entry.component}.${entry.name} = ${decoded.display}`);
    }
    liveState.totalNotifies += 1;
    liveState.notifyWindow.push(now);
    while (liveState.notifyWindow.length && liveState.notifyWindow[0] < cutoff) liveState.notifyWindow.shift();
    liveRenderSoon();
  }

  function liveEntryFromRegistry(regEntry) {
    return {
      addr: regEntry.address, component: regEntry.component, name: regEntry.name,
      label: regEntry.label || regEntry.name, kind: regEntry.kind || 'unknown',
      state: 'queued', statusName: '', statusDetail: '', retries: 0, cancelRequested: false,
      display: null, technical: null, rawHex: null, count: 0, lastAt: 0, window: [],
    };
  }

  function liveKickWorker() {
    liveWorkerLoop().catch(() => {});
    livePumpLoop().catch(() => {});
  }

  // Serial op processor — SubscriptionRetrier.subscriptionLoop's counterpart. Fresh ops
  // (queue) always preempt deferred ones: a deferred op is taken only when the fresh
  // queue is empty, so dead-address retry passes never block a newly clicked subscribe.
  async function liveWorkerLoop() {
    if (liveState.workerRunning) return;
    liveState.workerRunning = true;
    const dlog = window.Bes3DebugLog;
    try {
      while (liveState.queue.length > 0 || liveState.deferred.length > 0) {
        if (!transport || phase !== 'connected' || disconnectedAfterRead) {
          liveState.queue.length = 0; // stale by definition — the bike-side session is gone
          liveState.deferred.length = 0;
          break;
        }
        const op = liveState.queue.length > 0 ? liveState.queue.shift() : liveState.deferred.shift();
        if (op.kind === 'sub') {
          const entry = liveState.entries.get(op.addr);
          if (!entry || entry.cancelRequested) continue; // removed before its turn
          await liveSubscribeOp(entry);
        } else {
          await liveUnsubscribeOp(op.addr);
        }
        liveRenderSoon();
        await sleep(liveState.paceMs);
      }
    } finally {
      liveState.workerRunning = false;
      liveRenderSoon();
    }
    if (dlog && liveState.queue.length === 0 && liveState.deferred.length === 0 && liveState.entries.size === 0) {
      dlog.log('live', 'worker idle (no entries, no queue)');
    }
  }

  // Sends one frame under the transport lock: a write overlapping the live pump's
  // read polls is what caused the intermittent "A transfer error has occurred"
  // failures. Lock covers the write only — the pump must stay free to read the ack.
  async function liveWriteFrame(frame) {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!transport || phase !== 'connected' || disconnectedAfterRead) break;
      // Background-priority acquire: gives way to real reads/RPCs waiting for the
      // lock, and fails with an error rather than taking over a held lock.
      const waitDeadline = Date.now() + 5000;
      let lock;
      while (!(lock = tryAcquireTransport())) {
        if (!transport || phase !== 'connected' || disconnectedAfterRead || Date.now() > waitDeadline) {
          return { ok: false, err: new Error('timed out waiting for the transport lock') };
        }
        await sleep(10);
      }
      let retryPause = false;
      try {
        await transport.doMcspWrite(frame);
        return { ok: true };
      } catch (err) {
        lastErr = err;
        retryPause = true; // one retry — transient bridge hiccups recover, dead buses don't
      } finally {
        releaseTransport(lock);
      }
      if (retryPause) await sleep(150); // outside the lock — don't stall the pump on a retry pause
    }
    return { ok: false, err: lastErr };
  }

  async function liveSubscribeOp(entry) {
    const dlog = window.Bes3DebugLog;
    const maxRetries = 4; // MaxRetryCountPerRequest
    // First attempt gets BDT3's full 5 s budget (the bike can legitimately take
    // seconds to answer mid-batch); retries use 2 s so dead fields cycle fast.
    const ackTimeoutMs = entry.retries === 0 ? 5000 : 2000;
    for (;;) {
      if (!transport || phase !== 'connected' || disconnectedAfterRead) return;
      if (liveState.entries.get(entry.addr) !== entry) return; // replaced/removed meanwhile
      if (entry.cancelRequested) return;
      // A deferred re-attempt can be obsolete: if pushes arrived meanwhile (self-heal
      // flipped the entry active via liveHandleNotify), the subscription is already
      // live — re-sending would be redundant work and UI flicker.
      if (entry.state === 'active') return;
      if (entry.retries >= maxRetries) {
        entry.state = 'failed';
        entry.statusName = entry.statusName || 'retries exceeded';
        if (dlog) dlog.log('live', `gave up on ${entry.component}.${entry.name}: ${entry.statusName}`);
        return;
      }
      entry.state = 'subscribing';
      const seq = nextSeq();
      // Register the ack waiter BEFORE writing: the bike can answer before the
      // write call even returns, and the pump drops frames no waiter matches.
      const ackPromise = liveAwaitAck(entry.addr, seq, MessageType.SUBSCRIBE_RESPONSE, ackTimeoutMs);
      const writeResult = await liveWriteFrame(buildSubscribeRequestFrame(entry.addr, seq));
      if (!writeResult.ok) {
        entry.state = 'failed';
        entry.statusName = 'USB write failed'; // short badge text; full detail lives in statusDetail
        entry.statusDetail = writeResult.err ? writeResult.err.message : '';
        return;
      }
      const ack = await ackPromise;
      if (liveState.entries.get(entry.addr) !== entry) return; // removed while waiting
      // Pushes arrived while the ack was pending (liveHandleNotify flipped the entry
      // active) — the subscription is proven live, so a lost/late ack changes nothing.
      if (entry.state === 'active') return;
      if (ack && ack.ok) {
        entry.state = 'active';
        entry.statusName = '';
        entry.statusDetail = '';
        entry.retries = 0;
        if (dlog) dlog.log('live', `subscribed: ${entry.component}.${entry.name} (addr ${entry.addr}, seq ${seq})`);
        return;
      }
      const statusName = ack ? ack.statusName : 'TIMEOUT';
      entry.statusName = statusName;
      if (ack && statusName !== 'OVERLOADED' && statusName !== 'NOT_READY' && statusName !== 'TIMEOUT') {
        // DENIED / UNSUPPORTED / … are final — BDT3 logs and moves on, and so do we.
        entry.state = 'denied';
        if (dlog) dlog.log('live', `subscribe refused: ${entry.component}.${entry.name}: ${statusName}`);
        return;
      }
      entry.retries += 1;
      if (statusName === 'TIMEOUT') {
        // No ack at all, park in the DEFERRED lane, processed only when the fresh
        // queue is empty: dead addresses must not delay newly added fields. The
        // retry count is kept, so they still give up after maxRetries passes.
        entry.state = 'queued';
        entry.statusName = `deferred ${entry.retries}/${maxRetries}`;
        liveState.deferred.push({ kind: 'sub', addr: entry.addr });
        if (dlog) dlog.log('live', `deferred ${entry.component}.${entry.name} to the low-priority lane (timeout, retry ${entry.retries}/${maxRetries})`);
        return;
      }
      // OVERLOADED / NOT_READY: the bike ANSWERED and asked for patience — retry in
      // place with exponential backoff, exactly like BDT3 does.
      const backoff = 100 * Math.pow(2, entry.retries - 1);
      if (dlog) dlog.log('live', `retry ${entry.retries}/${maxRetries} for ${entry.component}.${entry.name} (${statusName}) in ${backoff} ms`);
      await sleep(backoff);
    }
  }

  // Unsubscribes are best-effort single attempts (BDT3 drains their acks without
  // blocking either) — if the bike never answers, its session is over anyway.
  // Map membership is deliberately NOT touched here: remove/re-add of the same address
  // queues [unsub, sub] in that order, and the fresh entry must survive its own unsub.
  async function liveUnsubscribeOp(addr) {
    if (!transport || phase !== 'connected' || disconnectedAfterRead) return;
    const seq = nextSeq();
    // Same waiter-before-write and transport-lock ordering as liveSubscribeOp —
    // see the race notes there and on liveWriteFrame.
    const ackPromise = liveAwaitAck(addr, seq, MessageType.UNSUBSCRIBE_RESPONSE, 1000);
    const writeResult = await liveWriteFrame(buildUnsubscribeRequestFrame(addr, seq));
    if (writeResult.ok) {
      try { await ackPromise; } catch (_) { /* best-effort */ }
    }
  }

  // The only background frame reader while live entries exist. Request paths (readOne,
  // RPCs, writes, keep-alive) hold the transport lock for their whole exchange; the
  // pump takes it with tryAcquireTransport() only for each single poll and yields
  // whenever a request is waiting, so those requests — including the 800 ms keep-alive,
  // which matters because pump reads alone don't reset the bike's inactivity timer —
  // always get through.
  async function livePumpLoop() {
    if (liveState.pumpRunning) return;
    liveState.pumpRunning = true;
    try {
      while ((liveState.entries.size > 0 || liveState.queue.length > 0 || liveState.deferred.length > 0) &&
             transport && phase === 'connected' && !disconnectedAfterRead && !abortRequested) {
        const lock = tryAcquireTransport();
        if (!lock) { await sleep(15); continue; }
        let raw = null;
        try { raw = await transport.readNextFrame(1, 2); } catch (_) { raw = null; } finally { releaseTransport(lock); }
        if (!raw) await sleep(8);
        else liveRescueFrame(raw); // a frame that isn't a live NOTIFY/ack (e.g. a late sweep response) is dropped
      }
    } finally {
      liveState.pumpRunning = false;
    }
  }

  // Registers one entry and queues its subscribe — no worker kick, no render, so bulk
  // adds (subscribe all / subscribe results) can enqueue hundreds and render once.
  function liveEnqueue(regEntry) {
    if (!liveControlsEnabled()) return false; // belt-and-braces: buttons are disabled, this catches stray calls
    if (!regEntry || liveState.entries.has(regEntry.address)) return false;
    liveState.entries.set(regEntry.address, liveEntryFromRegistry(regEntry));
    liveState.queue.push({ kind: 'sub', addr: regEntry.address });
    return true;
  }

  function liveAddMany(regEntries) {
    let added = 0;
    for (const regEntry of regEntries) if (liveEnqueue(regEntry)) added++;
    if (added) {
      liveKickWorker();
      liveRenderSoon();
      renderLivePicker();
    }
    return added;
  }

  function liveAdd(regEntry) {
    return liveAddMany([regEntry]) > 0;
  }

  function liveRemove(addr) {
    const entry = liveState.entries.get(addr);
    if (!entry) return;
    entry.cancelRequested = true;
    liveState.queue = liveState.queue.filter((op) => !(op.kind === 'sub' && op.addr === addr));
    liveState.deferred = liveState.deferred.filter((op) => !(op.kind === 'sub' && op.addr === addr));
    if ((entry.state === 'active' || entry.state === 'subscribing') && transport &&
        phase === 'connected' && !disconnectedAfterRead) {
      liveState.queue.push({ kind: 'unsub', addr });
      liveKickWorker();
    }
    liveState.entries.delete(addr);
    liveRenderSoon();
    renderLivePicker();
  }

  function liveStopAll() {
    const dlog = window.Bes3DebugLog;
    for (const entry of liveState.entries.values()) {
      entry.cancelRequested = true;
      if ((entry.state === 'active' || entry.state === 'subscribing') && transport &&
          phase === 'connected' && !disconnectedAfterRead) {
        liveState.queue.push({ kind: 'unsub', addr: entry.addr });
      }
    }
    liveState.deferred.length = 0; // pending re-attempts die with the stop; unsubscribes go via the fresh lane
    liveState.entries.clear();
    liveState.totalNotifies = 0;
    liveState.notifyWindow = [];
    if (dlog) dlog.log('live', 'stopped all subscriptions');
    liveKickWorker(); // drains the unsubscribe ops
    liveRenderSoon();
    renderLivePicker();
  }

  // Bike gone / new sweep starting — nothing can be sent, so don't even queue.
  function liveTeardown() {
    liveState.queue.length = 0;
    liveState.deferred.length = 0;
    liveState.entries.clear();
    liveState.totalNotifies = 0;
    liveState.notifyWindow = [];
    liveRenderSoon();
    renderLivePicker();
  }

  // ---------- live UI ----------

  // The card is shown whenever the USB / BLE-full-read dashboard is — including when
  // there's no live bike behind it (report loaded from file, bike dropped off after a
  // read, or the initial sweep still running), in which case it's visible but disabled.
  function liveCardShown() {
    return phase === 'connected' && (method === 'usb' || method === 'ble-mcsp');
  }

  // Controls are clickable only with a live bike AND a finished initial read —
  // subscribing mid-sweep would compete with it for the bus, and there is no bus
  // at all for a file-loaded report or a bike that dropped off USB.
  function liveControlsEnabled() {
    return liveCardShown() && !disconnectedAfterRead && !loadedFromFile && sweepFullyLoaded;
  }

  // Why the controls are disabled, shown in the status line and the picker head.
  function liveDisabledHint() {
    if (loadedFromFile) return 'offline — report loaded from file (connect the bike to subscribe)';
    if (disconnectedAfterRead) return 'bike disconnected — Read again to subscribe';
    if (!sweepFullyLoaded) return 'waiting for the initial read to finish';
    return '';
  }

  // Called on every phase change. The card stays visible on the dashboard; when the
  // bike is gone the controls go disabled and any active subscriptions are stopped.
  // Always re-renders — with no subscriptions there's no teardown, but the buttons'
  // enabled state and the status hint still depend on the new phase.
  function updateLiveCard() {
    els.liveCard.style.display = liveCardShown() ? '' : 'none';
    if (liveState.entries.size > 0 && !liveControlsEnabled()) {
      liveTeardown(); // re-renders itself
    } else {
      renderLivePicker();
      liveRenderSoon();
    }
  }

  function liveAgeText(ms) {
    if (ms < 60000) return Math.round(ms / 100) / 10 + ' s';
    if (ms < 3600000) return Math.floor(ms / 60000) + ' min';
    return Math.floor(ms / 3600000) + ' h ' + Math.floor((ms % 3600000) / 60000) + ' min';
  }

  // Rows are persistent and only their cell TEXT is updated on refresh — rebuilding
  // the table on every push would destroy any text the user has selected, making
  // values impossible to copy. A structural rebuild happens only when the row set
  // itself changes: an address joins/leaves, or moves between the live group and the
  // failed/refused group below the separator.
  const liveRowEls = new Map(); // addr -> {tr, tdValue, tdCount, tdHz, tdAge, stateSpan, retryBtn}
  let liveStructureKey = '';

  function liveBuildRow(entry) {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'live-v-name';
    tdName.textContent = `${entry.component}.${entry.name} `;
    tdName.title = `${entry.component}.${entry.name} (${entry.addr}, ${entry.kind})`; // full name on hover — the cell itself ellipsizes
    const small = document.createElement('small');
    small.textContent = `${entry.addr} · ${entry.kind}`;
    tdName.appendChild(small);
    tr.appendChild(tdName);

    const tdValue = document.createElement('td');
    tdValue.className = 'live-v-value';
    tr.appendChild(tdValue);

    const tdCount = document.createElement('td');
    tdCount.className = 'live-v-num';
    tr.appendChild(tdCount);

    const tdHz = document.createElement('td');
    tdHz.className = 'live-v-num';
    tr.appendChild(tdHz);

    const tdAge = document.createElement('td');
    tdAge.className = 'live-v-num';
    tr.appendChild(tdAge);

    const tdState = document.createElement('td');
    const stateSpan = document.createElement('span');
    tdState.appendChild(stateSpan);
    tr.appendChild(tdState);

    const tdX = document.createElement('td');
    tdX.className = 'live-v-actions'; // keeps ↻ and ✕ on one line however narrow the column
    const actions = document.createElement('span'); // flex lives here, not on the <td>
    tdX.appendChild(actions);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'live-retry';
    retry.title = 'Retry subscription';
    retry.textContent = '↻';
    retry.style.display = 'none'; // shown only for refused/failed rows in the update pass
    retry.addEventListener('click', () => liveRetry(entry.addr));
    actions.appendChild(retry);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'live-remove';
    x.title = 'Unsubscribe';
    x.textContent = '✕';
    x.addEventListener('click', () => liveRemove(entry.addr));
    actions.appendChild(x);
    tr.appendChild(tdX);

    return { tr, tdValue, tdCount, tdHz, tdAge, stateSpan, retryBtn: retry };
  }

  function renderLiveActive() {
    const entries = Array.from(liveState.entries.values());
    const byName = (a, b) =>
      a.component === b.component ? a.name.localeCompare(b.name) : a.component.localeCompare(b.component);
    // Live subscriptions on top; refused/failed ones below a separator so a long
    // subscribe-all doesn't bury the working fields among the casualties.
    const liveGroup = entries.filter((e) => e.state === 'queued' || e.state === 'subscribing' || e.state === 'active').sort(byName);
    const goneGroup = entries.filter((e) => e.state === 'denied' || e.state === 'failed').sort(byName);

    els.liveTableWrap.style.display = entries.length ? '' : 'none';
    const structureKey =
      liveGroup.map((e) => `${e.addr}L`).join(',') + '|' + goneGroup.map((e) => `${e.addr}G`).join(',');
    if (structureKey !== liveStructureKey) {
      liveStructureKey = structureKey;
      liveRowEls.clear();
      els.liveTBody.innerHTML = '';
      const addRows = (group) => {
        for (const entry of group) {
          const row = liveBuildRow(entry);
          liveRowEls.set(entry.addr, row);
          els.liveTBody.appendChild(row.tr);
        }
      };
      addRows(liveGroup);
      if (goneGroup.length) {
        const sep = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.className = 'live-sep';
        td.textContent = `failed / refused (${goneGroup.length})`;
        sep.appendChild(td);
        els.liveTBody.appendChild(sep);
        addRows(goneGroup);
      }
    }

    const now = performance.now();
    for (const entry of entries) {
      const row = liveRowEls.get(entry.addr);
      if (!row) continue;

      if (entry.display != null) {
        if (row.tdValue.textContent !== entry.display) row.tdValue.textContent = entry.display;
        row.tdValue.classList.remove('pending');
      } else {
        const pending = entry.state === 'active' ? '— waiting for first push' : '—';
        if (row.tdValue.textContent !== pending) row.tdValue.textContent = pending;
        row.tdValue.classList.add('pending');
      }
      row.tdValue.title = entry.rawHex
        ? (entry.technical ? entry.technical + '\n' : '') + 'raw: ' + entry.rawHex
        : (entry.technical || '');

      const countText = String(entry.count);
      if (row.tdCount.textContent !== countText) row.tdCount.textContent = countText;

      const span0 = entry.window.length > 1 ? entry.window[0] : now;
      const hzSpan = Math.max((now - span0) / 1000, 0.001);
      const hzText = entry.window.length > 1 ? (entry.window.length / hzSpan).toFixed(1) : '—';
      if (row.tdHz.textContent !== hzText) row.tdHz.textContent = hzText;

      const ageText = entry.lastAt ? liveAgeText(Date.now() - entry.lastAt) : '—';
      if (row.tdAge.textContent !== ageText) row.tdAge.textContent = ageText;

      // State badge: replace the span only when its rendered text actually changes,
      // so a hover (or a selection crossing it) isn't disturbed by every refresh.
      const map = {
        queued: 'queued', subscribing: 'subscribing…', active: 'active',
        denied: 'refused', failed: 'failed', unsubscribing: 'stopping…',
      };
      const clsMap = { subscribing: 'st-subscribing', active: 'st-active', denied: 'st-denied', failed: 'st-failed', unsubscribing: 'st-subscribing' };
      const baseText = map[entry.state] || entry.state;
      const badgeText = entry.statusName && entry.state !== 'active' && entry.state !== 'queued'
        ? `${baseText} · ${entry.statusName}` : baseText;
      const badgeCls = 'live-state' + (clsMap[entry.state] ? ' ' + clsMap[entry.state] : '');
      if (row.stateSpan.textContent !== badgeText) row.stateSpan.textContent = badgeText;
      if (row.stateSpan.className !== badgeCls) row.stateSpan.className = badgeCls;
      if (row.stateSpan.title !== (entry.statusDetail || '')) row.stateSpan.title = entry.statusDetail || '';

      // Retry arrow appears only where it can do something (refused/failed rows).
      const showRetry = entry.state === 'denied' || entry.state === 'failed';
      const retryDisplay = showRetry ? '' : 'none';
      if (row.retryBtn.style.display !== retryDisplay) row.retryBtn.style.display = retryDisplay;
    }

    const counts = { active: 0, subscribing: 0, queued: 0, denied: 0, failed: 0 };
    for (const e of liveState.entries.values()) if (counts[e.state] != null) counts[e.state]++;
    const wn = liveState.notifyWindow;
    const wSpan = wn.length > 1 ? (performance.now() - wn[0]) / 1000 : 0;
    const rate = wSpan >= 0.5 ? (wn.length / wSpan).toFixed(1) + '/s' : '—';
    const parts = [
      counts.active && `${counts.active} active`,
      counts.subscribing && `${counts.subscribing} subscribing`,
      counts.queued && `${counts.queued} queued`,
      counts.denied && `${counts.denied} refused`,
      counts.failed && `${counts.failed} failed`,
      `${liveState.totalNotifies} pushes · ${rate}`,
    ].filter(Boolean);
    els.liveStatus.textContent = parts.join(' · ') ||
      (liveCardShown() ? liveDisabledHint() : '') ||
      'no subscriptions — pick fields below';
  }

  function renderLivePicker() {
    if (!els.livePicker) return;
    const term = liveState.pickerTerm.trim().toLowerCase();
    const pool = liveSubscribableRegistryEntries();
    let candidates;
    let totalMatches = 0;
    if (term) {
      candidates = pool.filter((e) =>
        e.name.toLowerCase().includes(term) || e.component.toLowerCase().includes(term) ||
        (e.label || '').toLowerCase().includes(term) || String(e.address) === term);
      totalMatches = candidates.length;
    } else {
      // Empty search: offer the recommended ride-telemetry set that isn't subscribed yet.
      const wanted = new Set(LIVE_DEFAULT_SET.map(([c, n]) => `${c}.${n}`));
      candidates = pool.filter((e) => wanted.has(`${e.component}.${e.name}`) && !liveState.entries.has(e.address));
    }
    candidates = candidates.slice(0, 80);
    liveState.pickerResults = candidates;

    els.livePicker.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'live-picker-head';
    head.textContent = term
      ? `${totalMatches} subscribable field${totalMatches === 1 ? '' : 's'} matching “${term}”` +
        (totalMatches > candidates.length ? ` (showing first ${candidates.length})` : '')
      : `recommended live fields (search above for all ${pool.length})`;
    const disabledHint = liveCardShown() ? liveDisabledHint() : '';
    if (disabledHint) head.textContent += ' — ' + disabledHint;
    els.livePicker.appendChild(head);

    const list = document.createElement('div');
    list.className = 'live-candidates';
    if (!candidates.length) {
      const empty = document.createElement('div');
      empty.className = 'live-status';
      empty.textContent = term ? 'no matching subscribable fields' : 'everything in the recommended set is already subscribed';
      list.appendChild(empty);
    }
    for (const regEntry of candidates) {
      const row = document.createElement('div');
      row.className = 'live-candidate';

      const name = document.createElement('span');
      name.className = 'live-c-name';
      name.textContent = `${regEntry.component}.${regEntry.name} `;
      const small = document.createElement('small');
      small.textContent = String(regEntry.address);
      name.appendChild(small);
      name.title = regEntry.label || regEntry.name;
      row.appendChild(name);

      const kind = document.createElement('span');
      kind.className = 'live-c-kind';
      kind.textContent = regEntry.kind || 'unknown';
      row.appendChild(kind);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'live-btn';
      btn.textContent = '+ subscribe';
      btn.disabled = !liveControlsEnabled();
      btn.addEventListener('click', () => liveAdd(regEntry));
      row.appendChild(btn);

      list.appendChild(row);
    }
    els.livePicker.appendChild(list);

    // Subscribe buttons need liveControlsEnabled (live bike + finished sweep);
    // Stop-all just needs the card on screen with something to stop.
    const controlsEnabled = liveControlsEnabled();
    els.liveSubscribeShownBtn.disabled = !controlsEnabled || !candidates.length;
    els.liveDefaultsBtn.disabled = !controlsEnabled || !term; // with an empty search the list IS the recommended set
    els.liveAllBtn.disabled = !controlsEnabled;
    els.liveStopAllBtn.disabled = !liveCardShown() || liveState.entries.size === 0;
  }

  function liveRenderSoon() {
    if (!liveCardShown() && liveState.entries.size === 0) return;
    if (liveState.renderScheduled) return;
    liveState.renderScheduled = true;
    setTimeout(() => {
      liveState.renderScheduled = false;
      renderLiveActive();
    }, 200);
    if (!liveState.uiTimer && liveState.entries.size > 0) {
      // Refresh AGE/HZ cells once a second even when no new pushes arrive.
      liveState.uiTimer = setInterval(() => {
        if (liveState.entries.size === 0) {
          clearInterval(liveState.uiTimer);
          liveState.uiTimer = null;
          return;
        }
        renderLiveActive();
      }, 1000);
    }
  }

  function liveSubscribeShown() {
    const targets = liveState.pickerResults.filter((e) => !liveState.entries.has(e.address));
    if (!targets.length) return;
    const dlog = window.Bes3DebugLog;
    if (dlog) dlog.log('live', `queueing ${targets.length} subscriptions (paced at ${liveState.paceMs} ms)`);
    liveAddMany(targets);
  }

  function liveSubscribeAll() {
    const pool = liveSubscribableRegistryEntries().filter((e) => !liveState.entries.has(e.address));
    if (!pool.length) return;
    const dlog = window.Bes3DebugLog;
    // Priority order: fields whose initial sweep read came back OK are most likely to
    // subscribe cleanly, so they go first; denied/timeout/skipped/never-swept fields
    // queue behind them (each still gets its chance, and silent ones self-defer).
    const sweepStatus = new Map(lastResults.map((r) => [r.address, r.status]));
    const okFirst = [];
    const rest = [];
    for (const regEntry of pool) {
      (sweepStatus.get(regEntry.address) === 'ok' ? okFirst : rest).push(regEntry);
    }
    if (dlog) dlog.log('live', `queueing ALL subscriptions: ${okFirst.length} sweep-OK first, then ${rest.length} denied/unknown (paced at ${liveState.paceMs} ms)`);
    liveAddMany(okFirst.concat(rest));
  }

  // Per-row retry for refused/failed entries: resets the retry budget and re-queues a
  // single subscribe. Refusals can be state-dependent on the bike side (NOT_READY /
  // UNSUPPORTED answers observed flipping between sessions for the same address), so
  // a manual re-attempt after waking the relevant component is worth one click.
  function liveRetry(addr) {
    const entry = liveState.entries.get(addr);
    if (!entry) return;
    if (entry.state === 'active' || entry.state === 'subscribing' || entry.state === 'queued') return;
    entry.cancelRequested = false;
    entry.retries = 0;
    entry.statusName = '';
    entry.statusDetail = '';
    entry.display = null;
    entry.technical = null;
    entry.rawHex = null;
    entry.state = 'queued';
    liveState.queue.push({ kind: 'sub', addr });
    liveKickWorker();
    liveRenderSoon();
  }

  els.liveSearch.addEventListener('input', () => {
    liveState.pickerTerm = els.liveSearch.value;
    renderLivePicker();
  });
  els.liveDefaultsBtn.addEventListener('click', () => {
    liveState.pickerTerm = '';
    els.liveSearch.value = '';
    renderLivePicker();
  });
  els.liveSubscribeShownBtn.addEventListener('click', liveSubscribeShown);
  els.liveAllBtn.addEventListener('click', liveSubscribeAll);
  els.liveStopAllBtn.addEventListener('click', liveStopAll);
  // datalist for the search box — same affordance as the Write Lab's.
  function writeLiveDatalist() {
    if (!els.liveDatalist) return;
    els.liveDatalist.innerHTML = '';
    for (const e of liveSubscribableRegistryEntries()) {
      const opt = document.createElement('option');
      opt.value = `${e.component}.${e.name}`;
      els.liveDatalist.appendChild(opt);
    }
  }
  writeLiveDatalist();
  renderLivePicker(); // initial recommended-set view, before any search input

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
    // Diagnostic only — does not feed the dashboard. Confirmed on real hardware that a plain
    // read of DriveUnit.REACHABLE_RANGE (addr 6231) always declines with DENIED, with or
    // without a ConfigId argument — and confirmed via decompile that Flow itself only ever
    // reads this address via .subscribe(), never a one-shot get (see this address's registry
    // notes for the full trace). Trying the real SUBSCRIBE mechanism here for the first time.
    if (REACHABLE_RANGE_ADDR) {
      try {
        const result = await subscribeOnce(REACHABLE_RANGE_ADDR);
        if (dlog) {
          if (!result.subscribed) {
            dlog.log('range-subscribe', 'result', `subscribe declined: ${result.ackStatus}`);
          } else if (result.notify) {
            const typed = decodeTyped(REACHABLE_RANGE_ADDR, result.notify.payload);
            dlog.log('range-subscribe', 'result', `subscribed, got value: ${typed ? JSON.stringify(typed.value) : '(undecoded)'} raw: ${result.notify.payload}`);
          } else {
            dlog.log('range-subscribe', 'result', 'subscribed, but no value pushed before timeout');
          }
        }
      } catch (err) {
        if (dlog) dlog.log('range-subscribe', 'threw', err.message);
      }
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

    // Range estimate, computed client-side — NOT read from the bike. An earlier version of
    // this tool read DriveUnit.REACHABLE_RANGE (addr 6231) believing it to be the bike-computed
    // value behind Flow's own "range estimate" screen; that address consistently declined on
    // real hardware, and a closer look at Flow's decompile found no adapter/view-model anywhere
    // that actually reads it — nothing wires it to any screen. Since Flow shows a range estimate
    // even offline (no bike connected), it can't be a live device value anyway; it has to be
    // computed from data already on the phone. We have the same ingredients: each mode's
    // lifetime distance/consumedEnergy (from GET_ASSIST_MODE_STATISTICS, just read above) gives
    // a Wh/km efficiency, and REMAINING_ENERGY (already read as part of the battery card) gives
    // what's left — divide one by the other. Verified against a real capture: ECO mode decoded
    // to distance=18225 m, consumedEnergy=58 Wh (3.18 Wh/km); at 532.3 Wh remaining that's a
    // plausible ~167 km estimate.
    const remainingEnergyWh = valueOf('Battery', 'REMAINING_ENERGY');
    if (remainingEnergyWh != null) {
      for (const entry of assistModeStats) {
        if (entry.status !== 'ok' || !entry.distance || !entry.consumedEnergy) continue;
        const whPerKm = entry.consumedEnergy / (entry.distance / 1000);
        if (whPerKm > 0) entry.reachableRangeKm = Math.round(remainingEnergyWh / whPerKm);
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
  // Value Escape resolves with — the Cancel-equivalent (first non-primary) button if there is
  // one, otherwise the dialog's only button (a plain alert just gets dismissed).
  let appDialogEscapeValue = null;
  function appDialog({ title, message, buttons }) {
    return new Promise((resolve) => {
      // A dialog opened while one is already open would leak the previous resolve().
      if (appDialogResolve) appDialogResolve(false);
      appDialogResolve = resolve;
      appDialogEscapeValue = (buttons.find((b) => !b.primary) || buttons[0]).value;
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

  // Shared by every write path below (the Write Lab, and previously the per-address probes it
  // replaced) — sends one WRITE, waits for a genuine sequence-matched WRITE_RESPONSE, then
  // re-reads the address regardless of outcome. An ack (even SUCCESS) does not by itself tell us
  // what the bike now reports — real hardware precedent: START_ASSIST_MODE_CONFIGURATION got a
  // genuine, sequence-matched ack yet a later fresh read still showed the old value — so every
  // caller re-reads rather than assumes.
  async function writeAndReadBack(addr, payload, tag) {
    const dlog = window.Bes3DebugLog;
    if (dlog) dlog.log(tag, 'payload before write', payload);
    let ok = false;
    let statusName = null;
    const lock = await acquireTransport();
    try {
      let done = false;
      for (let attempt = 0; attempt < 2 && !done; attempt++) {
        for (let i = 0; i < 4; i++) {
          const stale = await transport.readNextFrame(1, 2);
          if (!stale) break;
          liveRescueFrame(stale); // normally dropped — keep live NOTIFYs alive during writes
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
          if (liveRescueFrame(raw)) continue; // a live NOTIFY / live-ack — not this write's response
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
      releaseTransport(lock);
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

  // ---------- Write Lab: generic, opt-in raw write against ANY known address ----------
  // Replaces the earlier per-address WRITE_EXPERIMENTS/RPC_EXPERIMENTS arrays (one hardcoded
  // probe per field) with a single searchable tool that works for any component/address in the
  // registry — trading bespoke per-field encoders for one generic path: friendly inputs for the
  // simple kinds (bool/enum/uint/string), raw hex bytes for everything else. Every write still
  // goes through writeAndReadBack() above, so the result is always a genuine sequence-matched
  // WRITE_RESPONSE (never assumed) and the address is always re-read afterward.
  const WRITE_LAB_COMPONENTS = [
    ['DriveUnit', 'Drive Unit'],
    ['Battery', 'Battery'],
    ['Battery2', 'Battery 2'],
    ['RemoteControl', 'Remote'],
    ['HeadUnit', 'Head Unit'],
    ['ConnectModule', 'Connect Module'],
    ['AntiLockBrakeSystem', 'ABS'],
    ['MobileApp', 'Mobile App'],
    ['BoschDiagnoseApp', 'Diagnose App'],
    ['CanTestNode', 'CAN Test Node'],
  ];
  const writeLabActiveComponents = new Set(WRITE_LAB_COMPONENTS.map(([c]) => c)); // default: all on
  let writeLabState = null; // null | 'pending' | 'done' | 'failed'
  let writeLabMode = 'write'; // 'write' | 'rpc' — RPC simulates a button press (ArgumentLessCallableDataPoint), not a state write
  let writeLabIncludeArg = false; // rpc mode only — most CallableDataPoints Flow declares take no argument at all
  let writeLabLastResult = null; // {forComponent, forName, mode, beforeDisplay, payloadHex, ok, statusName, resultPayloadHex, afterDisplay} | null

  function writeLabAddresses() {
    return window.Bes3AddressRegistry.ADDRESS_REGISTRY.addresses
      .filter((a) => writeLabActiveComponents.has(a.component))
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function writeLabOptionText(a) {
    return `${a.label} — ${a.component}.${a.name} (0x${a.address.toString(16)})`;
  }

  function findWriteLabEntry(searchValue) {
    return window.Bes3AddressRegistry.ADDRESS_REGISTRY.addresses.find(
      (a) => writeLabOptionText(a) === searchValue
    ) || null;
  }

  function renderWriteLabComponentFilter() {
    els.writeLabComponentFilter.innerHTML = '';
    for (const [component, label] of WRITE_LAB_COMPONENTS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'write-lab-chip' + (writeLabActiveComponents.has(component) ? ' active' : '');
      chip.textContent = label;
      chip.addEventListener('click', () => {
        if (writeLabActiveComponents.has(component)) writeLabActiveComponents.delete(component);
        else writeLabActiveComponents.add(component);
        renderWriteLab();
      });
      els.writeLabComponentFilter.appendChild(chip);
    }
  }

  // Bool/enum/uint share the same wire shape (protobuf field 1) — only the friendly input
  // differs. String gets its own length-delimited encoder. Everything else (submessage/unknown/
  // and the long tail of bespoke kinds like normFactor/uuid/tuningDetection) falls back to raw
  // hex bytes: least friendly, but the one encoding that's never wrong, since what you type is
  // exactly what gets sent.
  function buildWriteLabInput(entry) {
    const wrap = document.createElement('div');
    wrap.className = 'write-lab-input';
    if (entry.kind === 'bool') {
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      label.append(check, document.createTextNode(' true'));
      wrap.appendChild(label);
      return { el: wrap, getPayload: () => encodeBoolArg(check.checked) };
    }
    if (entry.kind === 'enum' && entry.enumTable) {
      const select = document.createElement('select');
      for (const [ordinal, e] of Object.entries(entry.enumTable)) {
        const opt = document.createElement('option');
        opt.value = ordinal;
        opt.textContent = `${e.label} (${e.name}=${ordinal})`;
        select.appendChild(opt);
      }
      wrap.appendChild(select);
      return { el: wrap, getPayload: () => encodeEnumArg(Number(select.value)) };
    }
    if (entry.kind === 'uint') {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.placeholder = 'integer value';
      wrap.appendChild(input);
      return {
        el: wrap,
        getPayload: () => {
          const n = Number(input.value);
          return Number.isInteger(n) && n >= 0 ? encodeEnumArg(n) : null;
        },
      };
    }
    if (entry.kind === 'string') {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'text value';
      wrap.appendChild(input);
      return { el: wrap, getPayload: () => encodeStringArg(input.value) };
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'write-lab-hex-input';
    input.placeholder = 'raw hex bytes, e.g. 08 01';
    wrap.appendChild(input);
    return {
      el: wrap,
      getPayload: () => {
        const cleaned = input.value.trim().replace(/0x/gi, '').replace(/[\s,]+/g, '');
        if (cleaned === '') return [];
        if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length % 2 !== 0) return null;
        const bytes = [];
        for (let i = 0; i < cleaned.length; i += 2) bytes.push(parseInt(cleaned.slice(i, i + 2), 16));
        return bytes;
      },
    };
  }

  async function attemptWriteLab(entry, payload) {
    if (!transport) {
      await appAlert('Not connected to the bike anymore — reconnect (Read again) and try again.');
      return;
    }
    writeLabState = 'pending';
    renderWriteLab();
    const beforeDisplay = displayOf(entry.component, entry.name, '(never read)');
    const { ok, statusName, readBack } = await writeAndReadBack(
      entry.address, payload, `write-lab-${entry.component}.${entry.name}`
    );
    writeLabState = ok ? 'done' : 'failed';
    // writeAndReadBack only decodes via decodeTyped(), which returns null for the ~520
    // "unknown"-kind addresses (no confirmed FIELD_TYPES entry) — the majority of what this
    // generic tool searches over. Re-read the raw payload ourselves and fall back to decodeValue
    // (the same generic hex/string/uint guesser the rest of the dashboard uses) so "after" still
    // shows something real for those addresses instead of always reading as unchanged.
    let afterDisplay = readBack ? readBack.display : null;
    if (!readBack && transport) {
      try {
        const r = await readOne(entry.address);
        if (r && !r.declined) afterDisplay = decodeValue(r.payload).display;
      } catch { /* leave afterDisplay as null — shown as "(unchanged / declined)" */ }
    }
    writeLabLastResult = {
      forComponent: entry.component,
      forName: entry.name,
      mode: 'write',
      beforeDisplay,
      payloadHex: toHex(payload),
      ok,
      statusName,
      afterDisplay,
    };
    if (readBack) {
      const idx = lastResults.findIndex((x) => x.component === entry.component && x.name === entry.name);
      if (idx >= 0) { lastResults[idx].status = 'ok'; lastResults[idx].typed = readBack; lastResults[idx].decoded = readBack; }
    }
    renderDashboard();
  }

  // Simulates a button press: sends addr as an RPC (MessageType.RPC), not a WRITE. Confirmed via
  // decompile that some addresses (e.g. RemoteControl.TOGGLE_BIKE_LIGHT) are declared
  // ArgumentLessCallableDataPoint<Boolean> in Flow's own schema — a plain command, not a
  // readable/writable state, which is exactly why they decline a normal read/write and need this
  // separate path. Argument defaults to none (matching the common case); writeLabIncludeArg lets
  // the same kind-matched input from Write mode double as the RPC argument for the few
  // CallableDataPoints that do take one (e.g. ASSIST_MODE_UP/DOWN's bool arg).
  async function attemptRpcLab(entry, argPayload) {
    if (!transport) {
      await appAlert('Not connected to the bike anymore — reconnect (Read again) and try again.');
      return;
    }
    writeLabState = 'pending';
    renderWriteLab();
    const beforeDisplay = displayOf(entry.component, entry.name, '(never read)');
    const result = await rpcCallWithArg(
      entry.address, argPayload, (p) => p, `write-lab-rpc-${entry.component}.${entry.name}`
    );
    let ok;
    let statusName;
    let resultPayloadHex = null;
    if (result === null) { ok = false; statusName = 'timeout'; }
    else if (result && result.declined) { ok = false; statusName = result.statusName; }
    else { ok = true; statusName = 'SUCCESS'; resultPayloadHex = toHex(result); }
    writeLabState = ok ? 'done' : 'failed';
    // The call's own return value (if any) is separate from the data point's stored value — a
    // command can succeed and return nothing meaningful while still changing bike state, so
    // always re-read the address afterward too, same reasoning as the write path.
    let afterDisplay = null;
    try {
      const r = await readOne(entry.address);
      if (r && !r.declined) {
        const typed = decodeTyped(entry.address, r.payload);
        afterDisplay = typed ? typed.display : decodeValue(r.payload).display;
      }
    } catch { /* leave afterDisplay as null — shown as "(unchanged / declined)" */ }
    writeLabLastResult = {
      forComponent: entry.component,
      forName: entry.name,
      mode: 'rpc',
      beforeDisplay,
      payloadHex: toHex(argPayload),
      ok,
      statusName,
      resultPayloadHex,
      afterDisplay,
    };
    renderDashboard();
  }

  function renderWriteLab() {
    renderWriteLabComponentFilter();
    els.writeLabAddressList.innerHTML = '';
    for (const a of writeLabAddresses()) {
      const opt = document.createElement('option');
      opt.value = writeLabOptionText(a);
      els.writeLabAddressList.appendChild(opt);
    }

    els.writeLabDetail.innerHTML = '';
    const entry = findWriteLabEntry(els.writeLabSearch.value);
    if (!entry) return;

    const addr = entry.address;

    const beforeRow = document.createElement('div');
    beforeRow.className = 'write-lab-row';
    beforeRow.innerHTML = `<span>Current value</span><span></span>`;
    beforeRow.lastElementChild.textContent = displayOf(entry.component, entry.name, '(not read yet)');
    els.writeLabDetail.appendChild(beforeRow);

    const kindRow = document.createElement('div');
    kindRow.className = 'write-lab-row';
    kindRow.innerHTML = `<span>Kind (registry)</span><span></span>`;
    kindRow.lastElementChild.textContent = entry.kind + (entry.writable ? '' : ' — registry says not writable');
    els.writeLabDetail.appendChild(kindRow);

    // Mode toggle: WRITE (a state, MessageType.WRITE) vs CALL (a command/button-press,
    // MessageType.RPC — needed for the addresses Flow declares ArgumentLessCallableDataPoint,
    // which decline a plain read/write since they were never a stored value to begin with).
    const modeRow = document.createElement('div');
    modeRow.className = 'write-lab-component-filter';
    for (const [mode, label] of [['write', 'Write'], ['rpc', 'Call (RPC / button press)']]) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'write-lab-chip' + (writeLabMode === mode ? ' active' : '');
      chip.textContent = label;
      chip.addEventListener('click', () => { writeLabMode = mode; renderWriteLab(); });
      modeRow.appendChild(chip);
    }
    els.writeLabDetail.appendChild(modeRow);

    let getPayload = () => [];
    if (writeLabMode === 'write') {
      const { el: inputEl, getPayload: gp } = buildWriteLabInput(entry);
      els.writeLabDetail.appendChild(inputEl);
      getPayload = gp;
    } else {
      const argLabel = document.createElement('label');
      const argCheck = document.createElement('input');
      argCheck.type = 'checkbox';
      argCheck.checked = writeLabIncludeArg;
      argLabel.append(argCheck, document.createTextNode(' include an argument (most commands take none)'));
      els.writeLabDetail.appendChild(argLabel);
      let gp = () => [];
      if (writeLabIncludeArg) {
        const { el: inputEl, getPayload: gp2 } = buildWriteLabInput(entry);
        els.writeLabDetail.appendChild(inputEl);
        gp = gp2;
      }
      getPayload = gp;
      argCheck.addEventListener('change', () => { writeLabIncludeArg = argCheck.checked; renderWriteLab(); });
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'histogram-reset-btn';
    if (writeLabState === 'pending') { btn.textContent = 'Sending…'; btn.disabled = true; }
    else if (!sweepFullyLoaded) { btn.textContent = 'Loading…'; btn.disabled = true; }
    else { btn.textContent = writeLabMode === 'write' ? 'Write' : 'Call'; }
    btn.addEventListener('click', async () => {
      const payload = getPayload();
      if (payload === null) {
        await appAlert('Could not parse that value into bytes — check the input.');
        return;
      }
      const verb = writeLabMode === 'write' ? 'Write to' : 'Call (RPC)';
      const risk = writeLabMode === 'write'
        ? 'This is a highly experimental, generic raw write — it goes straight to the protocol ' +
          'level with no per-field validation beyond basic type encoding.'
        : 'This is a highly experimental, generic RPC call — it simulates whatever button/command ' +
          'this address represents, straight at the protocol level.';
      const confirmed = await appConfirm(
        `${verb} ${entry.component}.${entry.name} (addr ${addr}, 0x${addr.toString(16)})?\n\n` +
        `Bytes to send: ${toHex(payload) || '(empty)'}\n\n` +
        `${risk} It may be silently ignored, explicitly denied, or in rare cases could leave the ` +
        'bike in an unexpected state. Only proceed if you understand what this field does and ' +
        'accept that risk.'
      );
      if (!confirmed) return;
      if (writeLabMode === 'write') attemptWriteLab(entry, payload);
      else attemptRpcLab(entry, payload);
    });
    els.writeLabDetail.appendChild(btn);

    const r = writeLabLastResult;
    if (r && r.forComponent === entry.component && r.forName === entry.name && r.mode === writeLabMode) {
      const result = document.createElement('div');
      result.className = 'write-lab-result';
      const rows = [
        ['Before', r.beforeDisplay],
        ['Sent (hex)', r.payloadHex || '(empty)'],
        ['Response', r.statusName || (r.ok ? 'SUCCESS' : 'no response')],
      ];
      if (r.mode === 'rpc') rows.push(['Call returned', r.resultPayloadHex || '(no payload)']);
      rows.push(['After (re-read)', r.afterDisplay ?? '(unchanged / declined)']);
      for (const [k, v] of rows) {
        const row = document.createElement('div');
        row.className = 'write-lab-row';
        const kEl = document.createElement('span');
        kEl.textContent = k;
        const vEl = document.createElement('span');
        vEl.textContent = v;
        if (k === 'Response') vEl.className = r.ok ? 'good' : 'bad';
        row.append(kEl, vEl);
        result.appendChild(row);
      }
      els.writeLabDetail.appendChild(result);
    }
  }
  if (els.writeLabSearch) {
    els.writeLabSearch.addEventListener('input', renderWriteLab);
  }

  // ---------- Diagnostics: active issues via EXECUTE_INFORMATION_MANAGER_COMMAND_BOSCH ----------
  // Confirmed via decompile that this is a real, non-dealer-gated diagnostic RPC — Flow's own
  // consumer code (DefaultReadActiveIssues) uses exactly this "Bosch" access tier (of five:
  // Bosch/Ibd/Oem/Rider/Sp) to read active issues per component. Read-only: only GET_ISSUE_COUNT
  // and READ_ISSUE_BY_NUMBER are ever sent, never DELETE_ISSUE/DELETE_ALL_ISSUES/GET_ISSUE_STATE
  // even though the protocol supports them.
  const DIAGNOSTICS_COMPONENTS = [
    ['DriveUnit', 'Drive Unit'],
    ['Battery', 'Battery'],
    ['Battery2', 'Battery 2'],
    ['ConnectModule', 'Connect Module'],
    ['AntiLockBrakeSystem', 'ABS'],
    ['HeadUnit', 'Head Unit'],
    ['RemoteControl', 'Remote'],
  ];

  // Priority order: DiagnosticTool 3's dealer-tier catalogs (IBD/OEM/SP) are richer than Flow's
  // consumer-facing Rider catalog, so try those first if present. None of these files are ever
  // bundled or committed by this project — each user supplies their own, extracted from an app
  // they legitimately have access to (see docs/diagnostics.md and the web/data/issues/ gitignore
  // entry). The tool works fine with none present — falls back to raw numeric issue IDs.
  const ISSUE_CATALOG_FILES = [
    { tier: 'IBD', file: 'data/issues/issues_en_IBD.json' },
    { tier: 'OEM', file: 'data/issues/issues_en_OEM.json' },
    { tier: 'SP', file: 'data/issues/issues_en_SP.json' },
    { tier: 'Rider', file: 'data/issues/issues_en_Rider.json' },
  ];

  let diagnosticsCatalog = null; // null (not checked yet) | false (none found) | {tier, file, issues, count}
  let diagnosticsState = null; // null | 'scanning' | 'done'
  let diagnosticsResultsByComponent = {}; // component -> {status, statusName?, issues: [{issueId, timestamp, activationCount}]}
  const diagnosticsExpanded = new Set(); // `${component}:${issueId}` keys currently expanded

  async function loadIssueCatalogOnce() {
    if (diagnosticsCatalog !== null) return diagnosticsCatalog;
    for (const { tier, file } of ISSUE_CATALOG_FILES) {
      try {
        const res = await fetch(file);
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.issues) {
          diagnosticsCatalog = { tier, file, issues: data.issues, count: Object.keys(data.issues).length };
          return diagnosticsCatalog;
        }
      } catch { /* file not present / not valid JSON locally — try the next tier */ }
    }
    diagnosticsCatalog = false;
    return diagnosticsCatalog;
  }

  function lookupIssue(issueId) {
    if (!diagnosticsCatalog) return null;
    return diagnosticsCatalog.issues[issueId.toString(16).toUpperCase()] || null;
  }

  async function attemptDiagnosticsScan() {
    if (!transport) {
      await appAlert('Not connected to the bike anymore — reconnect (Read again) and try again.');
      return;
    }
    diagnosticsState = 'scanning';
    diagnosticsResultsByComponent = {};
    renderDiagnostics();
    await loadIssueCatalogOnce();
    for (const [component] of DIAGNOSTICS_COMPONENTS) {
      const addr = addrOf(component, 'EXECUTE_INFORMATION_MANAGER_COMMAND_BOSCH');
      if (!addr) {
        diagnosticsResultsByComponent[component] = { status: 'unavailable', issues: [] };
        renderDiagnostics();
        continue;
      }
      const countArg = encodeExecuteInformationManagerCommandArg(DiagnosticCommand.GET_ISSUE_COUNT, 0);
      const countResult = await rpcCallWithArg(
        addr, countArg, decodeExecuteInformationManagerCommandReturn, `diagnostics-count-${component}`
      );
      if (!countResult || countResult.declined || countResult.returnValue !== 0) {
        diagnosticsResultsByComponent[component] = {
          status: !countResult ? 'timeout' : 'declined',
          statusName: countResult
            ? (countResult.declined ? countResult.statusName : diagnosticReturnValueName(countResult.returnValue))
            : null,
          issues: [],
        };
        renderDiagnostics();
        continue;
      }
      const entryCount = countResult.entryCount || 0;
      const issues = [];
      diagnosticsResultsByComponent[component] = { status: 'ok', issues };
      renderDiagnostics();
      for (let n = 0; n < entryCount; n++) {
        const arg = encodeExecuteInformationManagerCommandArg(DiagnosticCommand.READ_ISSUE_BY_NUMBER, n);
        const result = await rpcCallWithArg(
          addr, arg, decodeExecuteInformationManagerCommandReturn, `diagnostics-read-${component}-${n}`
        );
        if (!result || result.declined || result.returnValue === 1 /* DOES_NOT_EXIST */) break;
        if (result.returnValue === 0 /* SUCCESS */ && result.issueId != null) {
          issues.push({ issueId: result.issueId, timestamp: result.timestamp, activationCount: result.activationCount });
        }
        renderDiagnostics();
      }
    }
    diagnosticsState = 'done';
    renderDiagnostics();
  }

  function formatDiagnosticsTimestamp(ts) {
    if (!ts) return '—';
    try { return new Date(ts * 1000).toLocaleString(); } catch { return String(ts); }
  }

  function renderDiagnostics() {
    if (diagnosticsCatalog === null) {
      els.diagnosticsCatalogStatus.textContent = 'Local issue-code catalog: checking…';
    } else if (diagnosticsCatalog === false) {
      els.diagnosticsCatalogStatus.textContent =
        'No local issue-code catalog found — showing raw codes only. See docs/diagnostics.md to add your own.';
    } else {
      els.diagnosticsCatalogStatus.textContent =
        `Using local catalog: issues_en_${diagnosticsCatalog.tier}.json (${diagnosticsCatalog.count.toLocaleString()} codes)`;
    }

    els.diagnosticsScanBtn.disabled = diagnosticsState === 'scanning' || !sweepFullyLoaded;
    els.diagnosticsScanBtn.textContent = diagnosticsState === 'scanning' ? 'Scanning…' : 'Scan for active issues';

    els.diagnosticsResults.innerHTML = '';
    for (const [component, label] of DIAGNOSTICS_COMPONENTS) {
      const result = diagnosticsResultsByComponent[component];
      if (!result) continue; // not scanned this session yet

      const group = document.createElement('div');
      group.className = 'diagnostics-component-group';
      const heading = document.createElement('span');
      heading.className = 'diagnostics-component-name';
      heading.textContent = label;
      group.appendChild(heading);

      if (result.status !== 'ok') {
        const empty = document.createElement('div');
        empty.className = 'diagnostics-empty';
        empty.textContent = result.status === 'unavailable'
          ? 'Not available on this component.'
          : `Could not read issues (${result.statusName || 'no response'}).`;
        group.appendChild(empty);
      } else if (result.issues.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'diagnostics-empty';
        empty.textContent = 'No active issues.';
        group.appendChild(empty);
      } else {
        for (const issue of result.issues) {
          const catalogEntry = lookupIssue(issue.issueId);
          const idHex = issue.issueId.toString(16).toUpperCase();
          const key = `${component}:${issue.issueId}`;
          const row = document.createElement('div');
          row.className = 'diagnostics-issue';

          const head = document.createElement('div');
          head.className = 'diagnostics-issue-head';

          const sevText = catalogEntry ? catalogEntry.severity : null;
          const sev = document.createElement('span');
          sev.className = 'diagnostics-severity ' + (
            sevText === 'CRITICAL_ERROR' ? 'sev-critical'
              : sevText === 'ERROR' ? 'sev-error'
              : sevText === 'WARNING' ? 'sev-warning'
              : 'sev-info'
          );
          sev.textContent = sevText || '—';

          const title = document.createElement('span');
          title.className = 'diagnostics-issue-title';
          title.textContent = catalogEntry
            ? (catalogEntry.AppRiderErrorTitle || catalogEntry.component_name || `Issue 0x${idHex}`)
            : `Issue 0x${idHex}`;

          const meta = document.createElement('span');
          meta.className = 'diagnostics-issue-meta';
          meta.textContent = `${formatDiagnosticsTimestamp(issue.timestamp)} · ×${issue.activationCount ?? '?'}`;

          head.append(sev, title, meta);
          row.appendChild(head);

          if (catalogEntry && (catalogEntry.description || catalogEntry.measures)) {
            const detail = document.createElement('div');
            detail.className = 'diagnostics-issue-detail';
            detail.style.display = diagnosticsExpanded.has(key) ? '' : 'none';
            detail.innerHTML =
              (catalogEntry.description ? `<p>${catalogEntry.description}</p>` : '') +
              (catalogEntry.measures ? `<p>${catalogEntry.measures}</p>` : '');
            row.appendChild(detail);
            head.style.cursor = 'pointer';
            head.addEventListener('click', () => {
              if (diagnosticsExpanded.has(key)) diagnosticsExpanded.delete(key);
              else diagnosticsExpanded.add(key);
              renderDiagnostics();
            });
          }

          group.appendChild(row);
        }
      }

      els.diagnosticsResults.appendChild(group);
    }
  }
  if (els.diagnosticsScanBtn) {
    els.diagnosticsScanBtn.addEventListener('click', () => { attemptDiagnosticsScan(); });
  }
  loadIssueCatalogOnce().then(() => renderDiagnostics());

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
    renderWriteLab();
    renderDiagnostics();

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

  // Escape closes whichever popup is open, same as clicking its backdrop (or, for the
  // alert/confirm dialog, same as clicking Cancel/OK). Deliberately excludes the disclaimer
  // modal (els.disclaimerModal) — that one requires an explicit acknowledgment click, not a
  // dismiss.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (els.assistModeModalBackdrop.style.display !== 'none') closeAssistModeModal();
    else if (els.certModalBackdrop.style.display !== 'none') closeCertModal();
    else if (els.appDialogBackdrop.style.display !== 'none' && appDialogResolve) {
      els.appDialogBackdrop.style.display = 'none';
      const resolve = appDialogResolve;
      appDialogResolve = null;
      resolve(appDialogEscapeValue);
    }
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
      writeLabLastResult = null;
      diagnosticsResultsByComponent = {};
      diagnosticsState = null;
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
    writeLabLastResult = null;
    diagnosticsResultsByComponent = {};
    diagnosticsState = null;
    liveTeardown(); // a new session invalidates every old subscription (BDT3 renews; we re-scan)
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

    // Keep-alive starts BEFORE the warm-up, not after: the drive unit can doze off
    // while the USB bridge stays up (observed on real hardware), and the one RPC
    // that resets its inactivity timer must already be flowing for it to come back —
    // the warm-up itself needs an answering drive unit.
    startKeepAlive();

    // Warm-up: the drive unit needs a beat after init before it answers reliably.
    // Short per-read budget: 6145 answers in ms when the DU is awake, and a dozing
    // DU must not burn the full default budget eight times (minutes of a frozen
    // connecting screen — the "hangs after reconnect" symptom). Progress and an
    // all-failed outcome are shown on the connecting screen.
    let warmupOk = false;
    for (let i = 0; i < 8; i++) {
      els.connectingSub.textContent = `waking drive unit… (${i + 1}/8)`;
      if (await readOne(6145, 2500)) { warmupOk = true; break; }
    }
    if (!warmupOk) {
      els.connectingSub.textContent = 'drive unit not answering — wake the bike (press a button on the remote / light), then Read again';
      setProgress('drive unit not answering — it may have gone to sleep; wake it and read again');
    }

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
    // Consecutive timeouts = the bike stopped answering everything while the USB
    // device may still be present. A long streak grinds the sweep at ~1 s/field,
    // which looks like a freeze unless it's said on screen.
    let noAnswerStreak = 0;
    let sleepHintShown = false;
    // A failed warm-up means the same thing from the very first field; shown until
    // any field answers (the per-field text below would otherwise overwrite the
    // warm-up's own message after one field).
    let warmupHint = !warmupOk;
    sweepWatchdogFired = false;
    sweepWatchdogTimer = setInterval(() => {
      if (sweepWatchdogFired || !sweepWatchdogAddr) return;
      const stuckMs = Date.now() - sweepWatchdogStart;
      if (stuckMs < 8000) return;
      sweepWatchdogFired = true;
      // readOne() has a hard per-field budget — a slow field is skipped automatically
      // (shown as a timeout), so this warning means "slow transport", not "hang".
      // Reconnecting is only needed if the progress counter itself stops moving.
      if (window.Bes3DebugLog) {
        window.Bes3DebugLog.log('sweep', 'slow field', `${sweepWatchdogAddr} — no response after ${stuckMs}ms; it will be skipped (hard per-field budget) once its bounded steps run out`);
      }
      // Shown on screen both pre- and post-reveal: during the background "Loading
      // more…" phase a stalled counter with no explanation looks like a hang.
      if (!revealed) els.connectingSub.textContent = `slow field: ${sweepWatchdogAddr} — it will be skipped automatically; reconnect only if nothing progresses`;
      else if (els.sweepProgressText) {
        els.sweepProgressText.textContent = `slow field: ${sweepWatchdogAddr} — skipping it automatically, continuing…`;
      }
    }, 1000);
    for (const entry of readable) {
      if (!transport) { clearInterval(sweepWatchdogTimer); return; } // disconnected mid-sweep
      if (abortRequested) { aborted = true; break; }

      const cs = compStats[entry.component] || (compStats[entry.component] = { ok: 0, fails: 0, sleepStreak: 0 });
      if (!CORE_COMPONENTS.has(entry.component) && cs.ok === 0 && cs.fails >= 3) {
        results.push({ ...entry, status: 'skipped', detail: 'component not detected (no route)', decoded: null, typed: null });
        done++;
        continue;
      }
      // Mid-sweep sleeper: a component that answered fine earlier can doze off (the
      // remote control does exactly this — its whole address block then burns the
      // per-field budget at 12-30 s apiece, which reads as "the sweep hangs around
      // item ~530"). Ten consecutive no-answers from one component skips its
      // remainder; a single answering field resets the streak.
      if (cs.sleepStreak >= 10) {
        results.push({ ...entry, status: 'skipped', detail: 'component stopped answering mid-sweep (went to sleep?)', decoded: null, typed: null });
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
      // What counts as an "absent component" signal, for the skip below. Only a timeout or a
      // NO_ROUTE_FOUND decline means genuinely absent — there is no route to the endpoint. Every
      // OTHER decline proves the component is PRESENT and answering: DENIED (exists, policy-gated),
      // NOT_READY (present, busy), UNSUPPORTED (routed to the component, field not implemented).
      // The previous version counted ALL declines as absence, so a present component whose first
      // few addresses happen to be DENIED — e.g. a Kiox head unit, whose 0x0c11-0x0c13 are DENIED —
      // was wrongly marked "not detected" and its readable fields (hardware/bootloader version,
      // display brightness, feature flags) were never read. Verified on hardware: with this change
      // the head unit's ~18 readable fields appear; without it, zero.
      if (status === 'ok') cs.ok++;
      else if (status === 'timeout' ||
               (status === 'declined' && detail === 'NO_ROUTE_FOUND')) cs.fails++;
      if (status === 'timeout' || status === 'error') {
        noAnswerStreak += 1;
        cs.sleepStreak += 1;
      } else {
        noAnswerStreak = 0;
        cs.sleepStreak = 0;
        warmupHint = false;
      }
      if (noAnswerStreak >= 15 && !sleepHintShown) {
        sleepHintShown = true;
        if (window.Bes3DebugLog) window.Bes3DebugLog.log('sweep', 'bike not answering', `${noAnswerStreak} consecutive fields with no response, bike may have gone to sleep`);
      }

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
        els.connectingSub.textContent = `${done}/${priorityCount} points` +
          (sleepHintShown || warmupHint ? ' — bike not answering, it may have gone to sleep (wake it, or reconnect)' : '');
      } else {
        const backTotal = Math.max(1, readable.length - priorityCount);
        const backDone = done - priorityCount;
        els.sweepProgressFill.style.width = Math.round((backDone / backTotal) * 100) + '%';
        els.sweepProgressText.textContent = sleepHintShown || warmupHint
          ? `Loading more bike data… ${backDone}/${backTotal} — bike not answering, it may have gone to sleep (wake it, or Read again)`
          : `Loading more bike data… ${backDone}/${backTotal}`;
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
    // Live-subscription controls were gated on the sweep finishing, flip them on now.
    renderLivePicker();
    renderLiveActive();
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
