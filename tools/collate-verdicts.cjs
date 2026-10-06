#!/usr/bin/env node
/* collate-verdicts.cjs — 汇总全部判定：verdicts/*.tsv -> verdicts-summary.json + 单行统计
 * 产物：{ passCount, dropCount, byCode: {EVENT: n, ...}, passQids: [...] }
 * apply-verdicts.cjs 按 passQids 把候选并回注册表。 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..', 'datasets', 'harvest');
const VERDICT_DIR = path.join(BASE, 'verdicts');

const verdict = new Map();
for (const f of fs.readdirSync(VERDICT_DIR).filter((x) => x.endsWith('.tsv')).sort()) {
  for (const line of fs.readFileSync(path.join(VERDICT_DIR, f), 'utf8').split('\n')) {
    const t = line.trim().split('\t');
    if (!t[0] || !t[1]) continue;
    verdict.set(t[0], t[1] === 'PASS' ? 'PASS' : 'DROP:' + (t[2] || '?'));
  }
}
const passQids = [];
const byCode = {};
for (const [qid, v] of verdict) {
  if (v === 'PASS') passQids.push(qid);
  else byCode[v] = (byCode[v] || 0) + 1;
}
const passCount = passQids.length;
const dropCount = verdict.size - passCount;
fs.writeFileSync(path.join(BASE, 'verdicts-summary.json'), JSON.stringify({ passCount, dropCount, byCode, passQids }));
console.log(JSON.stringify({ total: verdict.size, passCount, dropCount, byCode }));
