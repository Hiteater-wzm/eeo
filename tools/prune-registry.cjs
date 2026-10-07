#!/usr/bin/env node
'use strict';
/*
 * prune-registry.cjs — 按复审 v2 的 final.json 剔除注册表条目
 * 只剔确定 DROP（UNCERTAIN 留给人工复核，不动）。
 * 之后依次跑 clean-registry / gen-stats / build-index。
 */
const fs = require('fs');
const path = require('path');
const { readRegistry, writeRegistry } = require('./registry-lib.cjs');

const FINAL = path.join(__dirname, '..', 'datasets', 'harvest', 'review2', 'final-verdict.json');

const main = () => {
  const f = JSON.parse(fs.readFileSync(FINAL, 'utf8'));
  const drop = new Set((f.finalDropQids || []).map((x) => x.qid));
  if (!drop.size) { console.log('final.json 无确定剔除项，注册表未动'); return; }
  const registry = readRegistry();
  const kept = [];
  let removed = 0;
  for (const c of registry) {
    if (drop.has(c.wikidata)) { removed++; continue; }
    kept.push(c);
  }
  writeRegistry(kept);
  console.log(`剔除 ${removed} / ${registry.length}（final.json 判 DROP ${drop.size} 条中命中 ${removed}）　注册表现有 ${kept.length}`);
  console.log(`仲裁恢复 ${f.restored || 0} 条；人工复核名单 ${f.human_review || 0} 条在 final-verdict.json。`);
};

main();
