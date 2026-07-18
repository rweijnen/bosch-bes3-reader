// Lightweight in-memory diagnostic log, exportable as a file. Exists so a
// failed/odd connection (especially the experimental BLE full-read path,
// which has never been tested against real hardware) can be captured and
// shared precisely — raw GATT bytes and exact error messages — instead of
// relying on a verbal description or the user having to dig through
// DevTools manually.
//
// Everything logged here is local protocol/diagnostic detail (hex bytes,
// phase transitions, error messages) about the user's own bike session —
// nothing is sent anywhere; "export" is a local file download only.

(function () {
  const MAX_ENTRIES = 4000;
  const entries = [];
  const startedAt = Date.now();

  function toHex(bytes) {
    if (!bytes) return '';
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
  }

  function log(category, message, data) {
    entries.push({
      t: Date.now() - startedAt,
      category,
      message,
      data: data === undefined ? undefined : (data instanceof Uint8Array || Array.isArray(data)) ? toHex(data) : data,
    });
    if (entries.length > MAX_ENTRIES) entries.shift();
  }

  function buildReport() {
    const lines = [];
    lines.push(`BES3 Reader debug log`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`User agent: ${navigator.userAgent}`);
    lines.push(`WebUSB available: ${'usb' in navigator}`);
    lines.push(`Web Bluetooth available: ${'bluetooth' in navigator}`);
    lines.push('');
    lines.push('--- Timeline (ms since page load) ---');
    for (const e of entries) {
      const dataStr = e.data === undefined ? '' : `  | ${e.data}`;
      lines.push(`[${String(e.t).padStart(7, ' ')}] ${e.category.padEnd(10, ' ')} ${e.message}${dataStr}`);
    }
    return lines.join('\n');
  }

  function download() {
    const blob = new Blob([buildReport()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bes3-debug-log-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  window.addEventListener('error', (e) => {
    log('error', 'uncaught exception', `${e.message} @ ${e.filename}:${e.lineno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    log('error', 'unhandled promise rejection', String(e.reason && e.reason.stack ? e.reason.stack : e.reason));
  });

  window.Bes3DebugLog = { log, download, toHex };
})();
