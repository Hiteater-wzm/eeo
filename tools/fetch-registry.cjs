#!/usr/bin/env node
'use strict';
/*
 * fetch-registry.cjs — download registry shards from GitHub Releases
 * Run once after cloning; the pipeline tools expect datasets/registry/ to exist.
 */
const fs = require('fs');
const path = require('path');


const DIR = path.join(__dirname, '..', 'datasets', 'registry');
const TAG = process.argv[2] || 'data-v1';
const REPO = 'Hiteater-wzm/eeo';

(async () => {
if (fs.existsSync(DIR) && fs.readdirSync(DIR).filter((f) => f.endsWith('.jsonl')).length >= 13) {
  console.log('registry shards already present, skipping');
  process.exit(0);
}

fs.mkdirSync(DIR, { recursive: true });
const base = `https://github.com/${REPO}/releases/download/${TAG}`;
for (let i = 0; i < 13; i++) {
  const name = `part-${String(i).padStart(4, '0')}.jsonl`;
  const out = path.join(DIR, name);
  if (fs.existsSync(out) && fs.statSync(out).size > 1024) continue;
  console.log(`downloading ${name}...`);
  const r = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(300000) });
  if (!r.ok) { console.error(`HTTP ${r.status} for ${name}`); process.exit(1); }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(out, buf);
}
console.log('done');
})();
