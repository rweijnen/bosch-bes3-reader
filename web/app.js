(function () {
  const { ALL_ADDRESSES } = window.Bes3Addresses;
  const { buildReadRequestFrame, parseReadResponseFrame, decodeValue } = window.Bes3Protocol;
  const { decodeTyped } = window.Bes3MessageTypes;
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
      if (parsed.addrHigh !== (addr >> 8) || parsed.addrLow !== (addr & 0xff)) continue;
      return parsed.payload;
    }
    return null;
  }

  function addRow(component, name, addr) {
    const tr = document.createElement('tr');
    const addrHex = '0x' + addr.toString(16).padStart(4, '0');
    tr.innerHTML = `<td>${component}</td><td>${name}</td><td>${addrHex}</td><td>…</td>`;
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

    setStatus('Connected. Sweeping known addresses across all components...');

    let seq = 1;
    let done = 0;
    let total = 0;
    for (const entries of Object.values(ALL_ADDRESSES)) {
      total += entries.filter((e) => e.readable === true).length;
    }

    const notSupported = [];

    for (const [component, entries] of Object.entries(ALL_ADDRESSES)) {
      const readable = entries.filter((e) => e.readable === true);
      notSupported.push(...entries.filter((e) => e.readable !== true).map((e) => ({ component, ...e })));

      for (const entry of readable) {
        seq = (seq + 1) & 0xff;
        const row = addRow(component, entry.name, entry.addr);
        let payload = null;
        try {
          payload = await readOne(transport, entry.addr, seq);
        } catch (err) {
          row.cells[3].textContent = 'error: ' + err.message;
          done++;
          progressEl.textContent = `${done}/${total}`;
          continue;
        }
        if (payload === null) {
          row.cells[3].textContent = '(no response / timeout)';
        } else {
          const typed = decodeTyped(entry.addr, payload);
          const decoded = typed || decodeValue(payload);
          row.cells[3].textContent = typed ? `[${decoded.label}] ${decoded.display}` : decoded.display;
          if (typed) row.classList.add('typed');
        }
        done++;
        progressEl.textContent = `${done}/${total}`;
        await sleep(15);
      }
    }

    for (const entry of notSupported) {
      const li = document.createElement('li');
      li.textContent = `${entry.component}.${entry.name} (0x${entry.addr.toString(16).padStart(4, '0')})`;
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
