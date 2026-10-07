#!/usr/bin/env node
'use strict';
/*
 * merge-handcrafted.cjs — 手编品牌卡并入注册表
 * 读取 datasets/handcrafted/*.jsonl，按「名称归一化 + 国家相容」与注册表去重
 * （与 brands-1k 同一套归一规则：NFKC 全半角统一、去空白、大小写折叠），
 * 新卡追加进分片注册表。之后照常 clean-registry / gen-stats / build-index。
 */
const fs = require('fs');
const path = require('path');
const { readRegistry, writeRegistry } = require('./registry-lib.cjs');
const { normalizeCountry, normalizeLabel } = require('./normalize-labels.cjs');
const { mapIndustry } = require('./industry-map.cjs');

const DIR = path.join(__dirname, '..', 'datasets', 'handcrafted');

const normName = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();

const main = () => {
  if (!fs.existsSync(DIR)) { console.log('无手编目录'); return; }
  const registry = readRegistry();
  const known = new Set();
  for (const c of registry) known.add(normName(c.name) + '\x00' + (c.country || ''));

  let added = 0, dup = 0, bad = 0, total = 0;
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.jsonl')).sort()) {
    for (const line of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      total++;
      let c;
      try { c = JSON.parse(line); } catch { bad++; continue; }
      if (!c || !c.name || c.schema !== 'eeo.brand.v1') { bad++; continue; }
      // 规范化：国家白名单 + 行业归位（与注册表同规）
      c.country = normalizeCountry(String(c.country || ''));
      if (c.industry) c.industry = mapIndustry(c.industry);
      c.name = String(c.name).trim();
      if (!c.name || c.name.replace(/\s+/g, '').length < 2) { bad++; continue; }
      const key = normName(c.name) + '\x00' + (c.country || '');
      if (known.has(key)) { dup++; continue; }
      known.add(key);
      registry.push(c);
      added++;
    }
  }
  writeRegistry(registry);
  console.log(`手编并入：读取 ${total} 张　新增 ${added}　与已有重复跳过 ${dup}　无效 ${bad}　注册表现有 ${registry.length}`);
};

main();
