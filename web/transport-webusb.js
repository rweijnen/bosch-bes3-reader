// Browser WebUSB transport — same MCSP framing as ../node/transport-node-usb.js,
// implemented against navigator.usb instead of the `usb` npm package. Exposes
// the same doMcspWrite()/readNextFrame() shape so app.js can stay transport-agnostic.

const VENDOR_ID = 0x108c; // Bosch
const PRODUCT_IDS = [448, 452, 454, 462]; // Smart System "system controller" PIDs
const EP_IN = 3;   // bulk IN endpoint number
const EP_OUT = 4;  // bulk OUT endpoint number

const REQ_GET_IN_STATE = 0x44;
const REQ_SET_IN_DONE = 0x45;
const REQ_GET_OUT_STATE = 0x47;
const REQ_SET_OUT_SIZE = 0x48;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestDevice() {
  const filters = PRODUCT_IDS.map((productId) => ({ vendorId: VENDOR_ID, productId }));
  const device = await navigator.usb.requestDevice({ filters });
  return device;
}

class Bes3WebUsbTransport {
  constructor(device) {
    this.device = device;
    // Writes run one at a time through this chain: a write is a 3-step control
    // sequence (set size -> send -> poll status), and two overlapping writes
    // corrupt it. A write that never completes can't be cancelled either, so
    // after 2 timeouts in a row the next write first rebuilds the USB
    // connection (_recover), that clears a wedged bus without a replug.
    this._writeChain = Promise.resolve();
    this._wedgeStreak = 0;
  }

  async open() {
    await this.device.open();
    await this.device.claimInterface(0);
    await this.init();
  }

  // Full USB re-establishment, bounded: used for wedge recovery only.
  async _recover() {
    const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
    log && log('usb', 'attempting USB recovery (close → open → claim → bridge init)');
    try { await this.device.close(); } catch (_) {}
    await this.device.open();
    await this.device.claimInterface(0);
    await this.init();
    this._wedgeStreak = 0;
    log && log('usb', 'USB recovery succeeded');
  }

  // Initialize the USB<->MCSP bridge. WITHOUT this the bridge never forwards our
  // bulk writes to the drive unit's serial bus: writes still ACK at the USB layer
  // (0x47 -> 02 00 00) but the inbound register (0x44) stays 0 forever, so every
  // read times out. Captured verbatim from the stock tool's connect sequence:
  //   1) one vendor IN  request 0x01 (reads a 1-byte bridge status)
  //   2) five vendor OUT control transfers (0x00, 0x43, 0x23, 0x41, 0x21) that
  //      configure the bridge; 0x43/0x23 carry a fixed 9-byte config blob.
  //   3) the MCSP session handshake: 0x10-opcode frames that arm the drive unit
  //      to answer 0x30 block reads. We drain their responses so they don't leak
  //      into later read matching.
  async init() {
    const cfg = Uint8Array.from([0x00, 0x80, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
    // EVERY transfer in here is bounded: init also runs during wedge recovery, and a
    // wedged bus hangs unbounded transfers forever (transport.open() never returning
    // is the worst possible failure shape, nothing on screen ever changes).
    const bres = (p, label) => this._boundTransfer(p, 3000, label);
    const versionRes = await bres(
      this.device.controlTransferIn(
        { requestType: 'vendor', recipient: 'interface', request: 0x01, value: 0, index: 0 },
        1
      ),
      'init version read'
    );
    if (!versionRes) throw new Error('bridge init failed — version read timed out');
    const vout = async (request, data) => {
      const r = await bres(
        this.device.controlTransferOut(
          { requestType: 'vendor', recipient: 'interface', request, value: 0, index: 0 },
          data || new Uint8Array(0)
        ),
        'init setup 0x' + request.toString(16)
      );
      if (!r) throw new Error(`bridge init failed — setup transfer 0x${request.toString(16)} timed out`);
      return r;
    };
    await vout(0x00);
    await vout(0x43, cfg);
    await vout(0x23, cfg);
    await vout(0x41);
    await vout(0x21);

    const handshake = [
      [0x10, 0x02, 0x01, 0x03],
      [0x10, 0x03, 0x04, 0x04, 0x00],
      [0x10, 0x06, 0x02, 0x01, 0x00, 0x10, 0x00, 0x00],
      [0x10, 0x06, 0x02, 0x02, 0x00, 0x10, 0x00, 0x00],
      [0x10, 0x06, 0x02, 0x03, 0x00, 0x10, 0x00, 0x00],
      [0x10, 0x06, 0x02, 0x04, 0x00, 0x00, 0x00, 0x00],
      [0x10, 0x06, 0x02, 0x05, 0x00, 0x00, 0x00, 0x00],
      [0x10, 0x06, 0x02, 0x06, 0x00, 0x00, 0x00, 0x00],
      [0x10, 0x06, 0x02, 0x07, 0x00, 0x00, 0x00, 0x00],
    ];
    // Raw write, not doMcspWrite: recovery may already hold the chain here.
    // Still capped at 4 s: without a cap, a wedged bus hangs open() forever.
    for (const frame of handshake) {
      await this._withDeadline(
        this._doMcspWriteLocked(Uint8Array.from(frame)),
        4000,
        'bridge init write timed out — transfer did not complete within 4 s'
      );
      for (let i = 0; i < 4; i++) {
        if (!(await this.readNextFrame(2, 3))) break;
      }
    }
  }

  async close() {
    try {
      await this.device.close();
    } catch (_) {}
  }

  async doMcspWrite(payload) {
    // 4 s cap per write — WebUSB transfers have no timeout, and one stuck write
    // would block every later write on the chain. The deadline starts when this
    // write's turn comes, not when it was queued, so time spent waiting behind
    // another write (or a recovery) doesn't count against it.
    const run = this._writeChain.then(async () => {
      if (this._wedgeStreak >= 2) {
        // Bus looks wedged, rebuild the USB connection before this write.
        await this._withDeadline(this._recover(), 8000, 'USB recovery timed out');
      }
      return this._withDeadline(
        this._doMcspWriteLocked(payload),
        4000,
        'USB write timed out — transfer did not complete within 4 s'
      );
    });
    // The chain itself never rejects (that would skip every later write's body);
    // it only counts consecutive failures to trigger recovery above.
    this._writeChain = run.then(
      () => { this._wedgeStreak = 0; },
      () => { this._wedgeStreak += 1; }
    );
    return run;
  }

  async _doMcspWriteLocked(payload) {
    const lengthBuf = new Uint8Array(4);
    new DataView(lengthBuf.buffer).setUint32(0, payload.length, true);
    await this.device.controlTransferOut(
      { requestType: 'vendor', recipient: 'interface', request: REQ_SET_OUT_SIZE, value: 0, index: 0 },
      lengthBuf
    );

    const padding = payload.length % 64;
    const padded = new Uint8Array(padding > 0 ? payload.length + (64 - padding) : payload.length);
    padded.set(payload);
    await this.device.transferOut(EP_OUT, padded);

    for (let tries = 0; tries < 10; tries++) {
      const res = await this.device.controlTransferIn(
        { requestType: 'vendor', recipient: 'interface', request: REQ_GET_OUT_STATE, value: 0, index: 0 },
        3
      );
      if (res.status !== 'ok' || !res.data || res.data.byteLength < 3) {
        await sleep(20);
        continue;
      }
      const ack = new Uint8Array(res.data.buffer);
      if (ack[1] === 3) {
        await sleep(20);
        continue;
      }
      if (ack[2] !== 0) {
        throw new Error(`Write error, status byte = ${ack[2]}`);
      }
      return;
    }
    throw new Error('Write ACK timeout');
  }

  // Rejects with `message` if `promise` hasn't settled within `ms`; the timer is
  // cleared as soon as it does. The underlying transfer can't be cancelled — on
  // timeout it keeps running in the background, which is why repeated timeouts
  // trigger _recover() rather than just another attempt.
  _withDeadline(promise, ms, message) {
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
  }

  // Race a USB transfer against a deadline: WebUSB transfers have no timeout,
  // so one that never completes would hang its caller forever. On expiry or
  // error, resolve to null (= "no data"), letting the caller's poll loop move on.
  _boundTransfer(promise, ms, label) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const log = window.Bes3DebugLog && window.Bes3DebugLog.log;
        log && log('usb', `${label} did not complete within ${ms} ms — transfer wedged?`);
        resolve(null);
      }, ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        () => { clearTimeout(timer); resolve(null); } // transfer error — same as a failed poll
      );
    });
  }

  async readNextFrame(maxPolls = 50, pollDelayMs = 5) {
    for (let i = 0; i < maxPolls; i++) {
      const res = await this._boundTransfer(
        this.device.controlTransferIn(
          { requestType: 'vendor', recipient: 'interface', request: REQ_GET_IN_STATE, value: 0, index: 0 },
          7
        ),
        2000,
        'GET_IN_STATE poll'
      );
      if (!res || res.status !== 'ok' || !res.data || res.data.byteLength < 4) {
        await sleep(pollDelayMs);
        continue;
      }
      const length = res.data.getUint32(0, true);
      if (length === 0 || length > 65536) {
        await sleep(pollDelayMs);
        continue;
      }
      const inRes = await this._boundTransfer(this.device.transferIn(EP_IN, length), 5000, 'bulk IN read');
      if (!inRes || inRes.status !== 'ok') {
        await sleep(pollDelayMs);
        continue;
      }
      await this._boundTransfer(
        this.device.controlTransferOut(
          { requestType: 'vendor', recipient: 'interface', request: REQ_SET_IN_DONE, value: 0, index: 0 },
          new Uint8Array(0)
        ),
        2000,
        'SET_IN_DONE'
      );
      return new Uint8Array(inRes.data.buffer);
    }
    return null;
  }
}

window.Bes3WebUsb = { Bes3WebUsbTransport, requestDevice, VENDOR_ID, PRODUCT_IDS };
