#!/usr/bin/env node
// Builds src/address-registry.generated.js from src/address-registry.json.
//
// The JSON file is the edited source of truth for every address — decode
// behavior, provenance, UI placement, all in one place. It's loaded as plain
// JSON (fully toolable — docs generation, external consumers, validation).
// But the app itself loads a plain <script> tag with zero server required,
// including opening index.html directly via file:// (see README) — a bare
// fetch() of a .json file would break that, since Chrome blocks fetch()
// against file:// origins. This script bridges the two: run it whenever
// address-registry.json changes, commit both files (same pattern as
// bike-model-cache.json — the generated file is not gitignored).
//
// Usage: node tools/build-address-registry.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const jsonPath = path.join(root, 'src/address-registry.json');
const outPath = path.join(root, 'src/address-registry.generated.js');

const raw = readFileSync(jsonPath, 'utf8');
// Parse-then-stringify (not a raw string copy) so a hand-edit mistake in the JSON
// (trailing comma, comment, etc.) fails loudly here rather than shipping broken.
const registry = JSON.parse(raw);

const banner =
  '// GENERATED FILE — do not edit directly.\n' +
  '// Source of truth: src/address-registry.json — edit that, then run\n' +
  '// `node tools/build-address-registry.mjs` to regenerate this file.\n';

const body =
  `const ADDRESS_REGISTRY = ${JSON.stringify(registry, null, 2)};\n\n` +
  'if (typeof module !== \'undefined\' && module.exports) {\n' +
  '  module.exports = { ADDRESS_REGISTRY };\n' +
  '} else if (typeof window !== \'undefined\') {\n' +
  '  window.Bes3AddressRegistry = { ADDRESS_REGISTRY };\n' +
  '}\n';

writeFileSync(outPath, banner + '\n' + body);
console.log(`Wrote ${outPath} (${registry.addresses.length} addresses, registryVersion ${registry._meta.registryVersion})`);
