#!/usr/bin/env node
// Builds web/data/bike-model-cache.json from Bosch's public "emd" bike
// catalog (https://www.bosch-ebike.com/emd/data/emd-{N}.json) — a fully
// public, unauthenticated, CDN-cached JSON no login/OAuth ever touches.
//
// This is an offline build step, run manually/periodically by a maintainer.
// It is NOT part of the shipped web app — the browser only ever loads the
// small derived index this script produces.
//
// Usage: node tools/build-model-cache.mjs

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locale index -> emd-N.json, per artifacts/emd_catalog_reference.md's full
// sweep. Merged in this order; later locales only fill in GTINs the earlier
// ones missed or improve on (see mergeVariant below).
const LOCALE_INDICES = [0, 1, 3, 10, 5, 6, 7, 8, 9, 11, 12, 13, 14, 17, 18, 19, 21, 24, 32, 73];
const BASE = 'https://www.bosch-ebike.com';

function betterImage(a, b) {
  // Prefer whichever has an image; among two with images, no strong
  // preference — first-seen wins (earlier locale in LOCALE_INDICES order).
  if (!a) return true;
  if (a.imageUrl && b.imageUrl) return false;
  return !a.imageUrl && b.imageUrl;
}

async function fetchLocale(idx) {
  const url = `${BASE}/emd/data/emd-${idx}.json`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json,*/*',
    },
  });
  if (!res.ok) throw new Error(`emd-${idx}.json: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const index = new Map(); // gtin -> entry

  for (const idx of LOCALE_INDICES) {
    let data;
    try {
      data = await fetchLocale(idx);
    } catch (err) {
      console.warn(`skip emd-${idx}.json: ${err.message}`);
      continue;
    }
    const brandsById = new Map(data.brands.map((b) => [b.uid, b]));
    let added = 0, improved = 0;
    for (const model of data.models) {
      const brand = brandsById.get(model.brand);
      for (const variant of model.variants || []) {
        if (!variant.gtin) continue;
        const imagePath = variant.image?.webp || null;
        const entry = {
          gtin: variant.gtin,
          brand: brand?.title || null,
          model: model.name,
          modelYear: model.model_year ?? null,
          size: variant.size || null,
          color: variant.color_name || variant.color || null,
          imageUrl: imagePath ? `${BASE}${imagePath.split('?')[0]}` : null,
        };
        const existing = index.get(variant.gtin);
        if (!existing) {
          index.set(variant.gtin, entry);
          added++;
        } else if (betterImage(existing, entry)) {
          index.set(variant.gtin, entry);
          improved++;
        }
      }
    }
    console.log(`emd-${idx}.json: +${added} new, ${improved} improved (total ${index.size})`);
  }

  const withImage = [...index.values()].filter((e) => e.imageUrl).length;
  console.log(`\nFinal index: ${index.size} GTINs, ${withImage} with a photo (${((withImage / index.size) * 100).toFixed(1)}%)`);

  const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'https://www.bosch-ebike.com/emd/data/emd-{N}.json (public, unauthenticated)',
    count: index.size,
    models: Object.fromEntries(index),
  };

  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'data', 'bike-model-cache.json');
  await writeFile(outPath, JSON.stringify(out));
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
