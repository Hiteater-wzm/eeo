#!/usr/bin/env node
'use strict';
/*
 * apply-badges.cjs — 权威注册背书写入注册表
 * datasets/sources/wikidata-P1278.json（LEI 码）与 wikidata-P414.json（上市交易所）
 * 按 QID 直连注册表卡片，写入 card.reg = { lei } / { listed }（值数组或 true）。
 * 之后重建索引时 reg 映射为行内 rg 字段与统计 regBadges。
 */
const fs = require('fs');
const path = require('path');
const { readRegistry, writeRegistry } = require('./registry-lib.cjs');

const SRC = path.join(__dirname, '..', 'datasets', 'sources');

const load = (f) => (fs.existsSync(path.join(SRC, f)) ? JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')) : []);

const main = () => {
  const lei = load('wikidata-P1278.json');
  const listed = load('wikidata-P414.json');
  if (!lei.length && !listed.length) { console.log('无徽章源数据'); return; }

  const leiMap = new Map();
  for (const x of lei) {
    const q = x.id;
    if (!leiMap.has(q)) leiMap.set(q, []);
    leiMap.get(q).push(x.value);
  }
  const listedSet = new Set(listed.map((x) => x.id));

  const registry = readRegistry();
  let nLei = 0, nListed = 0;
  for (const c of registry) {
    if (!c.wikidata) continue;
    const l = leiMap.get(c.wikidata);
    const s = listedSet.has(c.wikidata);
    if (!l && !s) continue;
    const reg = {};
    if (l) { reg.lei = l.slice(0, 3); nLei++; }
    if (s) { reg.listed = true; nListed++; }
    c.reg = reg;
  }
  writeRegistry(registry);
  console.log(`徽章写入：LEI ${nLei} 条　上市 ${nListed} 条（可重叠）`);
};

main();
