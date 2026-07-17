(function () {
  const { DRIVE_UNIT_ADDRESSES } = window.Bes3Addresses;
  const { isSimpleReadable, buildReadRequestFrame, parseReadResponseFrame, decodeValue } = window.Bes3Protocol;
  const { Bes3WebUsbTransport, requestDevice } = window.Bes3WebUsb;

  const connectBtn = document.getElementById('connectBtn');
  const statusEl = document.getElementById('status');
  const resultsBody = document.getElementById('resultsBody');
  const notSupportedEl = document.getElementById('notSupported');
  const progressEl = document.getElementById('progress');

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = isError ? 'status error' : 'status';
  }

  async function readOne(transport, addr, seq) {
    const frame = buildReadRequestFrame(addr, seq);
    await transport.doMcspWrite(frame);

    const deadline = Date.now() + 400;
    while (Date.now() < deadline) {
      const raw = await transport.readNextFrame(5, 5);
      if (!raw) continue;
      const parsed = parseReadResponseFrame(raw);
      if (!parsed) continue;
      if (parsed.addrLow !== (addr & 0xff)) continue;
      return parsed.payload;
    }
    return null;
  }

  function addRow(name, addr, statusText) {
    const tr = document.createElement('tr');
    const addrHex = '0x' + addr.toString(16).padStart(4, '0');
    tr.innerHTML = `<td>${name}</td><td>${addrHex}</td><td>${statusText}</td>`;
    resultsBody.appendChild(tr);
    return tr;
  }

  async function runSweep() {
    resultsBody.innerHTML = '';
    notSupportedEl.innerHTML = '';

    let device;
    try {
      device = await requestDevice();
    } catch (err) {
      setStatus('No device selected.', true);
      return;
    }

    const transport = new Bes3WebUsbTransport(device);
    try {
      await transport.open();
    } catch (err) {
      setStatus('Failed to open device: ' + err.message, true);
      return;
    }

    setStatus('Connected. Sweeping known DriveUnit addresses...');

    const readable = DRIVE_UNIT_ADDRESSES.filter((e) => isSimpleReadable(e.addr));
    const notSupported = DRIVE_UNIT_ADDRESSES.filter((e) => !isSimpleReadable(e.addr));

    let seq = 1;
    let done = 0;
    for (const entry of readable) {
      seq = (seq + 1) & 0xff;
      const row = addRow(entry.name, entry.addr, '…');
      let payload = null;
      try {
        payload = await readOne(transport, entry.addr, seq);
      } catch (err) {
        row.cells[2].textContent = 'error: ' + err.message;
        done++;
        progressEl.textContent = `${done}/${readable.length}`;
        continue;
      }
      if (payload === null) {
        row.cells[2].textContent = '(no response / timeout)';
      } else {
        const decoded = decodeValue(payload);
        row.cells[2].textContent = decoded.display;
      }
      done++;
      progressEl.textContent = `${done}/${readable.length}`;
      await sleep(15);
    }

    for (const entry of notSupported) {
      const li = document.createElement('li');
      li.textContent = `${entry.name} (0x${entry.addr.toString(16).padStart(4, '0')})`;
      notSupportedEl.appendChild(li);
    }

    setStatus('Done.');
    await transport.close();
  }

  connectBtn.addEventListener('click', () => {
    if (!('usb' in navigator)) {
      setStatus('WebUSB is not available. Use Chrome, Edge, or another Chromium-based browser on desktop.', true);
      return;
    }
    runSweep().catch((err) => setStatus('Unexpected error: ' + err.message, true));
  });
})();
