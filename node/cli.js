#!/usr/bin/env node
// Read-only Bosch Smart System component dumper.
//
// Connects to the bike's system controller over USB and sweeps every known
// "readable data point" address across every component (drive unit, both
// battery slots, remote control, head unit, connect module, ABS, the tool's
// own app-info block), printing whatever comes back. Read-only: never sends
// a write/RPC/tuning command, never touches licensing. Not all addresses
// will respond — some are callable RPCs (need an input argument) or use a
// request shape we haven't cracked yet; those are listed separately at the
// end rather than silently skipped.

const { ALL_ADDRESSES } = require('../src/addresses');
const { buildReadRequestFrame, parseReadResponseFrame, decodeValue } = require('../src/protocol');
const { decodeTyped } = require('../src/messageTypes');
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
    if (!parsed) continue; // unrelated frame (e.g. the bundled identify block) - ignore
    if (parsed.addrHigh !== (addr >> 8) || parsed.addrLow !== (addr & 0xff)) continue; // reply to a different address
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

  const notSupported = [];
  let seq = 1;

  for (const [component, entries] of Object.entries(ALL_ADDRESSES)) {
    const readable = entries.filter((e) => e.readable === true);
    const skipped = entries.filter((e) => e.readable !== true);
    notSupported.push(...skipped.map((e) => ({ component, ...e })));

    if (readable.length === 0) continue;

    console.log(`\n=== ${component} ===`);
    for (const entry of readable) {
      seq = (seq + 1) & 0xff;
      let payload = null;
      let status = 'ok';
      let detail = '';
      try {
        payload = await readOne(transport, entry.addr, seq);
      } catch (err) {
        status = 'error';
        detail = err.message;
      }
      const addrHex = '0x' + entry.addr.toString(16).padStart(4, '0');

      if (status === 'error') {
        console.log(`  ${entry.name.padEnd(42)} ${addrHex}  (error: ${detail})`);
      } else if (payload === null) {
        console.log(`  ${entry.name.padEnd(42)} ${addrHex}  (no response / timeout)`);
      } else {
        const typed = decodeTyped(entry.addr, payload);
        const decoded = typed || decodeValue(payload);
        const marker = typed ? '*' : ' ';
        const label = typed ? ` (${decoded.label})` : '';
        console.log(`${marker} ${entry.name.padEnd(42)} ${addrHex}${label.padEnd(34)} ${decoded.display}`);
      }
      await sleep(15); // be gentle on the bus
    }
  }

  console.log(`\n(* = typed/confirmed decode; unmarked = generic best-effort guess)`);

  console.log(`\n=== Not attempted (RPC/callable addresses, or unclassified) ===`);
  for (const entry of notSupported) {
    console.log(`${entry.component}.${entry.name.padEnd(42)} 0x${entry.addr.toString(16).padStart(4, '0')}`);
  }

  transport.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
