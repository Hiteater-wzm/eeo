#!/usr/bin/env node
'use strict';
/*
 * review2-arbiter-prepare.cjs — 第三道仲裁的分块准备
 * 取 final.json 里全部 DROP + UNCERTAIN 条目（两道复审标记过的），
 * 从注册表还原完整证据行，分块到 chunks/w<批>-s3-NNNN.tsv。
 * 仲裁裁决为终局：PASS 恢复入库，DROP 确认剔除，UNCERTAIN 转人工名单。
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

const main = () => {
  const f = JSON.parse(fs.readFileSync(path.join(BASE, 'final.json'), 'utf8'));
  const flagged = new Set([
    ...(f.dropQids || []).map((x) => x.qid),
    ...(f.uncertainQids || []),
  ]);
  if (!flagged.size) { console.log('无可仲裁条目'); return; }
  const registry = readRegistry();
  const rows = [];
  const byQid = new Map(registry.map((c) => [c.wikidata, c]));
  for (const qid of flagged) {
    const c = byQid.get(qid);
    if (!c) continue;
    rows.push([
      c.wikidata || '', String(c.name || ''), (c.aliases || [])[0] || '',
      String(c.industry || ''), String(c.city || ''), String(c.country || ''),
      domainOf(c.website), String(c.description || '').slice(0, 160),
    ].map((x) => String(x).replace(/[\t\n\r]/g, ' ')).join('\t'));
  }
  const dir = path.join(BASE, 'chunks');
  for (const fn of fs.readdirSync(dir)) if (fn.includes('-s3-')) fs.unlinkSync(path.join(dir, fn));
  const tag = 'w' + new Date().toISOString().replace(/[-:T]/g, '').slice(3, 14);
  let n = 0;
  for (let i = 0; i < rows.length; i += SIZE) {
    fs.writeFileSync(path.join(dir, `${tag}-s3-${String(n).padStart(4, '0')}.tsv`), rows.slice(i, i + SIZE).join('\n') + '\n');
    n++;
  }
  console.log(`仲裁分块：被标记 ${flagged.size} 条（注册表命中 ${rows.length}）分 ${n} 块`);
};

main();
