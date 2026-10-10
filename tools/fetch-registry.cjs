#!/usr/bin/env node
'use strict';
/*
 * fetch-registry.cjs — download registry shards from GitHub Releases
 * Run once after cloning; the pipeline tools expect datasets/registry/ to exist.
 * Shard count is discovered from the Release API — no hardcoded count.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'datasets', 'registry');
const TAG = process.argv[2] || 'data-v1';
const REPO = 'Hiteater-wzm/eeo';

(async () => {
  // discover shard list from Release assets
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) { console.error(`cannot fetch release info: HTTP ${res.status}`); process.exit(1); }
  const release = await res.json();
  const shards = (release.assets || [])
    .map((a) => a.name)
    .filter((n) => /^part-\d+\.jsonl$/.test(n))
    .sort();
  if (!shards.length) { console.error('no .jsonl shards found in release'); process.exit(1); }

  // skip if all shards already present
  const have = shards.filter((n) => {
    const p = path.join(DIR, n);
    return fs.existsSync(p) && fs.statSync(p).size > 1024;
  });
  if (have.length === shards.length) {
    console.log(`all ${shards.length} shards present, skipping`);
    process.exit(0);
  }

  fs.mkdirSync(DIR, { recursive: true });
  const base = `https://github.com/${REPO}/releases/download/${TAG}`;
  for (const name of shards) {
    const out = path.join(DIR, name);
    if (fs.existsSync(out) && fs.statSync(out).size > 1024) continue;
    console.log(`downloading ${name}...`);
    const r = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(600000) });
    if (!r.ok) { console.error(`HTTP ${r.status} for ${name}`); process.exit(1); }
    fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  }
  console.log(`done: ${shards.length} shards`);
})();
