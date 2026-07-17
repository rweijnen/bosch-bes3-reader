#!/usr/bin/env node
// Read-only Bosch Smart System drive-unit dumper.
//
// Connects to the bike's system controller over USB and sweeps every known
// "readable data point" address, printing whatever comes back. Read-only:
// never sends a write/RPC/tuning command, never touches licensing. Not all
// ~120 known addresses will respond — many are RPCs (callable actions
// needing an argument) or subscribable-only data points that use a request
// shape we haven't cracked yet; those are listed separately at the end
// rather than silently skipped.

const { DRIVE_UNIT_ADDRESSES } = require('../src/addresses');
const { isSimpleReadable, buildReadRequestFrame, parseReadResponseFrame, decodeValue } = require('../src/protocol');
const { Bes3UsbTransport, findDevice } = require('./transport-node-usb');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readOne(transport, addr, seq) {
  const frame = buildReadRequestFrame(addr, seq);
  await transport.doMcspWrite(frame);

  const deadline = Date.now() + 400; // per-address timeout
  while (Date.now() < deadline) {
    const raw = await transport.readNextFrame(5, 5);
    if (!raw) continue;
    const parsed = parseReadResponseFrame(raw);
    if (!parsed) continue; // unrelated frame (heartbeat, push, etc.) - ignore
    if (parsed.addrLow !== (addr & 0xff)) continue; // reply to a different address
    return parsed.payload;
  }
  return null; // timeout
}

async function main() {
  const device = findDevice();
  if (!device) {
    console.error('No Bosch Smart System device found. Is the bike connected via USB-C and powered on?');
    process.exit(1);
  }

  const transport = new Bes3UsbTransport(device);
  transport.open();
  console.log('Connected. Sweeping known DriveUnit addresses...\n');

  const readable = DRIVE_UNIT_ADDRESSES.filter((e) => isSimpleReadable(e.addr));
  const notSupported = DRIVE_UNIT_ADDRESSES.filter((e) => !isSimpleReadable(e.addr));

  const results = [];
  let seq = 1;
  for (const entry of readable) {
    seq = (seq + 1) & 0xff;
    let payload = null;
    try {
      payload = await readOne(transport, entry.addr, seq);
    } catch (err) {
      results.push({ name: entry.name, addr: entry.addr, status: 'error', detail: err.message });
      continue;
    }
    if (payload === null) {
      results.push({ name: entry.name, addr: entry.addr, status: 'timeout' });
      continue;
    }
    const decoded = decodeValue(payload);
    results.push({ name: entry.name, addr: entry.addr, status: 'ok', decoded });
    await sleep(15); // be gentle on the bus
  }

  console.log('=== Results ===');
  for (const r of results) {
    const addrHex = '0x' + r.addr.toString(16).padStart(4, '0');
    if (r.status === 'ok') {
      console.log(`${r.name.padEnd(42)} ${addrHex}  ${r.decoded.display}`);
    } else if (r.status === 'timeout') {
      console.log(`${r.name.padEnd(42)} ${addrHex}  (no response / timeout)`);
    } else {
      console.log(`${r.name.padEnd(42)} ${addrHex}  (error: ${r.detail})`);
    }
  }

  console.log(`\n=== Not attempted (RPC/callable addresses, encoding not yet cracked) ===`);
  for (const entry of notSupported) {
    console.log(`${entry.name.padEnd(42)} 0x${entry.addr.toString(16).padStart(4, '0')}`);
  }

  transport.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
