#!/usr/bin/env node
// ONE-TIME migration script (feature/declarative-registry): reads the existing
// src/addresses.js + src/messageTypes.js, joins them by address number, and emits
// src/address-registry.json — the new single source of truth for every address.
//
// Provenance (source/confirmed/notes) is heuristically extracted from messageTypes.js's
// own trailing `//` comments where present. This is a best-effort mechanical pass, not a
// hand-authored one — spot-check results before trusting them, and expect to refine
// source/confirmed by hand over time as addresses get individually revisited.
//
// Not part of the ongoing build — run once to produce the initial registry, then the
// registry itself becomes the thing you edit going forward.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const { ALL_ADDRESSES } = require(path.join(root, 'src/addresses.js'));
const { FIELD_TYPES } = require(path.join(root, 'src/messageTypes.js'));

// Parse messageTypes.js's own source text to recover per-address trailing comments —
// these hold real provenance info (e.g. "Flow decompile, confidence: high — matches
// RemoteControl.diagnosisProgramActive domain field") that only exists as a code comment
// today, not as a queryable fact.
const messageTypesSrc = readFileSync(path.join(root, 'src/messageTypes.js'), 'utf8');
const commentByAddr = new Map();
// Matches lines like: `  8273: { label: "...", kind: "bool" }, // Flow decompile, confidence: high — ...`
// Deliberately [ \t]* (not \s*) between the closing brace and `//` — \s matches newlines too,
// which let this regex cross into the *next* line's leading comment (a comment describing the
// following entry) and misattribute it as this entry's trailing note. Confirmed as a real bug:
// it grabbed a comment mentioning "addr 6231" as address 6158's own note.
const lineRe = /^\s*(\d+):\s*\{.*?\},?[ \t]*\/\/\s*(.+)$/gm;
let m;
while ((m = lineRe.exec(messageTypesSrc))) {
  commentByAddr.set(Number(m[1]), m[2].trim());
}

function inferProvenance(addr) {
  const comment = commentByAddr.get(addr) || '';
  let source = '';
  if (/flow decompile/i.test(comment)) source = 'Flow decompile';
  else if (/diagnostictool ?3/i.test(comment)) source = 'DiagnosticTool 3 decompile';
  else if (/real capture/i.test(comment)) source = 'real capture';
  else if (/inferred|guess/i.test(comment)) source = 'inferred';
  const confirmed = /confirmed against|verified against real|matches .*domain field|confidence: high/i.test(comment);
  return { source, confirmed, notes: comment };
}

// Turns SCREAMING_SNAKE_CASE into a readable fallback label for addresses that never got
// a FIELD_TYPES entry at all (still address-only / undecoded).
function humanize(name) {
  return name
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const addresses = [];
for (const [component, entries] of Object.entries(ALL_ADDRESSES)) {
  for (const entry of entries) {
    const addr = entry.addr;
    const meta = FIELD_TYPES[addr];
    const { source, confirmed, notes } = inferProvenance(addr);

    const out = {
      component,
      name: entry.name,
      address: addr,
      label: (meta && meta.label) || humanize(entry.name),
      readable: !!entry.readable,
      writable: !!entry.writable,
    };

    if (meta) {
      out.kind = meta.kind || 'unknown';
      if (meta.unit) out.unit = meta.unit;
      if (meta.enumTable) out.enumTable = meta.enumTable;
      if (meta.fields) out.fields = meta.fields;
      if (meta.factor !== undefined) out.factor = meta.factor;
      if (meta.signed !== undefined) out.signed = meta.signed;
    } else {
      out.kind = 'unknown';
    }

    out.source = source;
    out.confirmed = confirmed;
    out.notes = notes;
    out.dependsOn = null;
    // ui blocks are added by a separate, hand-authored pass (tools/add-ui-mappings.mjs) —
    // auto-deriving card/row/label from app.js's kvRow call sites via regex was judged too
    // fragile to trust for the ~35-40 addresses that actually need one.

    addresses.push(out);
  }
}

const registry = {
  _meta: {
    registryVersion: '1.0.0',
    license: 'CC-BY-4.0',
    attribution: 'Bosch BES3 address registry — github.com/rweijnen/bosch-bes3-reader',
    sourceUrl: 'https://github.com/rweijnen/bosch-bes3-reader',
  },
  addresses,
};

const outPath = path.join(root, 'src/address-registry.json');
writeFileSync(outPath, JSON.stringify(registry, null, 2) + '\n');

const withComments = addresses.filter((a) => a.notes).length;
const withKind = addresses.filter((a) => a.kind !== 'unknown').length;
console.log(`Wrote ${outPath}`);
console.log(`  total addresses: ${addresses.length}`);
console.log(`  with decode kind: ${withKind}`);
console.log(`  with extracted provenance comment: ${withComments}`);
console.log(`  confirmed: ${addresses.filter((a) => a.confirmed).length}`);
