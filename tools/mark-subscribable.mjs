#!/usr/bin/env node
// One-time tagging pass: marks every registry address that Flow's own MessageBus interface
// declares as a *SubscribableDataPoint (as opposed to a plain readable/writable one) with
// `subscribable: true`. Source data (tools/subscribable-datapoints.json) was extracted by
// decompiling com.bosch.ebike.messagebus.MessageBus from the full eBike Flow app (v1.36.5)
// and collecting every getter whose return type contains "Subscribable" — 443 across 9
// components. This was the concrete finding behind DriveUnit.REACHABLE_RANGE declining every
// plain read: it's one of these, and needs an actual MCSP SUBSCRIBE (not READ) to work.
//
// Matched by (component, name) against the existing registry, which — being generated from
// this same overall protocol research — already uses matching UPPER_SNAKE_CASE names for the
// vast majority of entries (439/443 matched cleanly; the 4 misses are just naming variants,
// e.g. Flow's own getPresentBatteryVoltage vs. our PRESENT_CELL_VOLTAGE, which independently
// corroborates that field actually being pack/battery voltage, not per-cell).
//
// Usage: node tools/mark-subscribable.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const registryPath = path.join(root, 'src/address-registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const subscribable = JSON.parse(readFileSync(path.join(__dirname, 'subscribable-datapoints.json'), 'utf8'));

const byKey = new Map();
for (const [component, name, returnType] of subscribable) {
  byKey.set(`${component}.${name}`, returnType);
}

let tagged = 0;
const missed = [];
for (const entry of registry.addresses) {
  const key = `${entry.component}.${entry.name}`;
  if (byKey.has(key)) {
    entry.subscribable = true;
    tagged++;
    byKey.delete(key);
  }
}
for (const key of byKey.keys()) missed.push(key);

writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
console.log(`Tagged ${tagged} addresses as subscribable.`);
if (missed.length) {
  console.log(`${missed.length} entries from the decompile had no matching registry address (naming variants, not chased further):`);
  for (const m of missed) console.log(`  ${m}`);
}
