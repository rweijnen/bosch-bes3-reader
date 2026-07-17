// Node-specific USB transport (uses the `usb` npm package, libusb-backed).
// Implements the MCSP framing over vendor control + bulk transfers. This is
// the ONLY file that should need changing for a browser/WebUSB port —
// protocol.js and addresses.js are transport-agnostic.

const usb = require('usb');

const VENDOR_ID = 0x108c; // Bosch
const PRODUCT_IDS = [448, 452, 454, 462]; // Smart System "system controller" PIDs
const EP_IN = 3;   // bulk IN endpoint number
const EP_OUT = 4;  // bulk OUT endpoint number

// Vendor-class, interface-recipient control requests (see RESEARCH.md).
const REQ_GET_IN_STATE = 0x44;   // IN, 7 bytes: poll pending-read length
const REQ_SET_IN_DONE = 0x45;    // OUT, empty: ack a completed read
const REQ_GET_OUT_STATE = 0x47;  // IN, 3 bytes: poll write ACK/status
const REQ_SET_OUT_SIZE = 0x48;   // OUT, 4 bytes LE: announce upcoming write length

const BM_VENDOR_IFACE_OUT = 0x41; // dir=host->device, type=vendor, recipient=interface
const BM_VENDOR_IFACE_IN = 0xc1;  // dir=device->host, type=vendor, recipient=interface

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function controlTransfer(device, bmRequestType, bRequest, wValue, wIndex, dataOrLength) {
  return new Promise((resolve, reject) => {
    device.controlTransfer(bmRequestType, bRequest, wValue, wIndex, dataOrLength, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function findDevice() {
  const devices = usb.getDeviceList();
  const match = devices.find(
    (d) => d.deviceDescriptor.idVendor === VENDOR_ID && PRODUCT_IDS.includes(d.deviceDescriptor.idProduct)
  );
  if (!match) return null;
  return match;
}

class Bes3UsbTransport {
  constructor(device) {
    this.device = device;
    this.iface = null;
    this.epIn = null;
    this.epOut = null;
  }

  open() {
    this.device.open();
    this.iface = this.device.interface(0);
    try {
      this.iface.claim();
    } catch (e) {
      if (this.iface.isKernelDriverActive && this.iface.isKernelDriverActive()) {
        this.iface.detachKernelDriver();
        this.iface.claim();
      } else {
        throw e;
      }
    }
    this.epOut = this.iface.endpoints.find((e) => e.address === EP_OUT || e.address === (EP_OUT | 0x00));
    this.epIn = this.iface.endpoints.find((e) => e.address === (EP_IN | 0x80));
    if (!this.epIn || !this.epOut) {
      throw new Error(`Could not find expected bulk endpoints (in=${EP_IN}, out=${EP_OUT})`);
    }
  }

  close() {
    try {
      this.iface.release(true, () => {
        try {
          this.device.close();
        } catch (_) {}
      });
    } catch (_) {}
  }

  bulkOut(data) {
    return new Promise((resolve, reject) => {
      this.epOut.transfer(Buffer.from(data), (err) => (err ? reject(err) : resolve()));
    });
  }

  bulkIn(length) {
    return new Promise((resolve, reject) => {
      this.epIn.transfer(length, (err, data) => (err ? reject(err) : resolve(data)));
    });
  }

  async doMcspWrite(payload) {
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(payload.length, 0);
    await controlTransfer(this.device, BM_VENDOR_IFACE_OUT, REQ_SET_OUT_SIZE, 0, 0, lengthBuf);

    const padding = payload.length % 64;
    const padded = padding > 0 ? Buffer.concat([Buffer.from(payload), Buffer.alloc(64 - padding)]) : Buffer.from(payload);
    await this.bulkOut(padded);

    for (let tries = 0; tries < 10; tries++) {
      const ack = await controlTransfer(this.device, BM_VENDOR_IFACE_IN, REQ_GET_OUT_STATE, 0, 0, 3);
      if (!ack || ack.length < 3) {
        await sleep(20);
        continue;
      }
      if (ack[1] === 3) {
        // busy / transfer still running, retry
        await sleep(20);
        continue;
      }
      if (ack[2] !== 0) {
        throw new Error(`Write error, status byte = ${ack[2]}`);
      }
      return; // success
    }
    throw new Error('Write ACK timeout');
  }

  // Reads and returns the next available MCSP frame, or null if nothing is
  // pending within the given number of poll attempts.
  async readNextFrame(maxPolls = 50, pollDelayMs = 5) {
    for (let i = 0; i < maxPolls; i++) {
      const lenBuf = await controlTransfer(this.device, BM_VENDOR_IFACE_IN, REQ_GET_IN_STATE, 0, 0, 7);
      if (!lenBuf || lenBuf.length < 4) {
        await sleep(pollDelayMs);
        continue;
      }
      const length = lenBuf.readUInt32LE(0);
      if (length === 0) {
        await sleep(pollDelayMs);
        continue;
      }
      if (length > 65536) {
        await sleep(pollDelayMs);
        continue;
      }
      const data = await this.bulkIn(length);
      await controlTransfer(this.device, BM_VENDOR_IFACE_OUT, REQ_SET_IN_DONE, 0, 0, Buffer.alloc(0));
      return data;
    }
    return null;
  }
}

module.exports = { Bes3UsbTransport, findDevice, VENDOR_ID, PRODUCT_IDS };
