#!/usr/bin/env node
'use strict';
/*
 * review2-prepare.cjs — 复审 v2 的抽样与分块（细审：250 行/块 + 全证据列）
 *
 * 从注册表按种子抽样（--sample N --seed S）或全量（--all），
 * 产出 datasets/harvest/review2/chunks/w<批>-s1-NNNN.tsv：
 * 列 = QID 名称 主别名 行业 城市 国家 官网域名 描述(截160)
 */
const fs = require('fs');
const path = require('path');
const { readRegistry } = require('./registry-lib.cjs');

const BASE = path.join(__dirname, '..', 'datasets', 'harvest', 'review2');
const SIZE = 250;

function domainOf(u) {
  const m = String(u || '').replace(/^https?:\/\//, '').match(/^([^\/]+)/);
  return m ? m[1] : '';
}

function main() {
  const argv = process.argv.slice(2);
  let sample = 0, seed = 42;
  if (argv.includes('--all')) sample = 0;
  else if (argv.includes('--sample')) sample = parseInt(argv[argv.indexOf('--sample') + 1], 10) || 30000;
  if (argv.includes('--seed')) seed = parseInt(argv[argv.indexOf('--seed') + 1], 10) || 42;

  let cards = readRegistry();
  if (sample > 0 && sample < cards.length) {
    // 确定性种子抽样（xorshift）
    let s = seed >>> 0 || 42;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    const picked = [];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    picked.push(...cards.slice(0, sample));
    picked.sort((a, b) => String(a.wikidata || '').localeCompare(String(b.wikidata || '')));
    cards = picked;
  }

  const dir = path.join(BASE, 'chunks');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(BASE, 'verdicts'), { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith('w')) fs.unlinkSync(path.join(dir, f));
  const TAG = 'w' + new Date().toISOString().replace(/[-:T]/g, '').slice(3, 14);

  let n = 0;
  for (let i = 0; i < cards.length; i += SIZE) {
    const part = cards.slice(i, i + SIZE);
    const lines = part.map((c) => [
      c.wikidata || '',
      String(c.name || ''),
      (c.aliases || [])[0] || '',
      String(c.industry || ''),
      String(c.city || ''),
      String(c.country || ''),
      domainOf(c.website),
      String(c.description || '').slice(0, 160),
    ].map((x) => String(x).replace(/[\t\n\r]/g, ' ')).join('\t'));
    fs.writeFileSync(path.join(dir, `${TAG}-s1-${String(n).padStart(4, '0')}.tsv`), lines.join('\n') + '\n');
    n++;
  }
  console.log(`复审v2抽样 ${cards.length} 条（seed=${sample ? seed : 'all'}）分 ${n} 块（每块 ${SIZE} 行全证据列）`);
}

main();
