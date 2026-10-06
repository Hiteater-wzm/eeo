#!/usr/bin/env node
/* registry-lib.cjs — 分片注册表读写公共件
 * 注册表正本 = datasets/registry/part-NNNN.jsonl（每行一张 eeo.brand.v1 卡）。
 * GitHub 单文件 100MB 上限决定了百万级注册表必须分片；brands-all.json 不再入库。 */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = process.env.EEO_REGISTRY_DIR
  ? path.resolve(process.env.EEO_REGISTRY_DIR)
  : path.join(__dirname, '..', 'datasets', 'registry');
const PER_SHARD = parseInt(process.env.EEO_SHARD_LINES || process.env.REGISTRY_SHARD_LINES || '120000', 10);

function readRegistry() {
  const out = [];
  if (!fs.existsSync(DIR)) return out;
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.jsonl')).sort()) {
    for (const line of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
      const t = line.trim();
      if (t) out.push(JSON.parse(t));
    }
  }
  return out;
}

function writeRegistry(cards) {
  fs.mkdirSync(DIR, { recursive: true });
  for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f));
  for (let i = 0; i < cards.length; i += PER_SHARD) {
    const part = cards.slice(i, i + PER_SHARD);
    fs.writeFileSync(path.join(DIR, 'part-' + String(i / PER_SHARD).padStart(4, '0') + '.jsonl'), part.map((c) => JSON.stringify(c)).join('\n') + '\n');
  }
  return Math.ceil(cards.length / PER_SHARD);
}

module.exports = { readRegistry, writeRegistry, DIR, PER_SHARD };
