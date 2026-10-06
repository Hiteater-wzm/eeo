#!/usr/bin/env node
/* apply-verdicts.cjs — 把审查通过的候选并回注册表
 * 读 verdicts-summary.json 的 passQids，从 harvest 暂存取完整卡片，
 * 追加进分片注册表 datasets/registry/（QID 已存在的跳过）。
 * 之后请依次运行 clean-registry.cjs 与 web 侧 build（含 build-index）。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { readRegistry, writeRegistry } = require('./registry-lib.cjs');

const BASE = path.join(__dirname, '..', 'datasets');
const STAGE = process.env.EEO_HARVEST_DIR ? path.resolve(process.env.EEO_HARVEST_DIR) : path.join(BASE, 'harvest');

const main = () => {
  const summary = JSON.parse(fs.readFileSync(path.join(STAGE, 'verdicts-summary.json'), 'utf8'));
  const pass = new Set(summary.passQids || []);
  if (pass.size === 0) { console.log('passQids 为空，无条目可并入'); return; }

  const registry = readRegistry();
  const known = new Set(registry.map((b) => b.wikidata).filter(Boolean));

  let added = 0;
  for (const d of fs.readdirSync(STAGE).sort()) {
    const dir = path.join(STAGE, d);
    if (!fs.statSync(dir).isDirectory() || d === 'chunks' || d === 'verdicts') continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.json')) continue;
      for (const card of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
        const qid = card.wikidata || '';
        if (!pass.has(qid) || known.has(qid)) continue;
        known.add(qid);
        registry.push(card);
        added++;
      }
    }
  }
  writeRegistry(registry);
  console.log(`审查通过 ${pass.size}　新并入 ${added}　注册表现有 ${registry.length}`);
};

main();
