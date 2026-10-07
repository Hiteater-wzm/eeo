#!/usr/bin/env node
'use strict';
/*
 * review2-stage2.cjs — 从初审(s1)判定生成对抗复审(s2)分块
 * 只把 s1 判 PASS 的行重新分块（250/块），供第二道专找拒绝理由的复审。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'datasets', 'harvest', 'review2');
const CHUNKS = path.join(BASE, 'chunks');
const VERDICTS = path.join(BASE, 'verdicts');
const SIZE = 250;

const main = () => {
  const chunkFiles = fs.readdirSync(CHUNKS).filter((f) => f.includes('-s1-')).sort();
  const passRows = [];
  let drops = 0, total = 0;
  for (const f of chunkFiles) {
    const rows = fs.readFileSync(path.join(CHUNKS, f), 'utf8').split('\n').filter((l) => l.trim());
    const vf = path.join(VERDICTS, f);
    if (!fs.existsSync(vf)) continue; // 未完成的块由工作流补审后再重跑本步
    const verd = fs.readFileSync(vf, 'utf8').split('\n').filter((l) => l.trim());
    if (verd.length !== rows.length) continue;
    const vmap = new Map(verd.map((l) => { const t = l.split('\t'); return [t[0], t[1]]; }));
    for (const row of rows) {
      const qid = row.split('\t')[0];
      total++;
      if (vmap.get(qid) === 'PASS') passRows.push(row);
      else drops++;
    }
  }
  for (const f of fs.readdirSync(CHUNKS)) if (f.includes('-s2-')) fs.unlinkSync(path.join(CHUNKS, f));
  const tag = chunkFiles[0] ? chunkFiles[0].split('-s1-')[0] : 'w0';
  let n = 0;
  for (let i = 0; i < passRows.length; i += SIZE) {
    fs.writeFileSync(path.join(CHUNKS, `${tag}-s2-${String(n).padStart(4, '0')}.tsv`), passRows.slice(i, i + SIZE).join('\n') + '\n');
    n++;
  }
  console.log(JSON.stringify({ s1_total: total, s1_drop: drops, s1_pass: passRows.length, s2_chunks: n }));
};

main();
