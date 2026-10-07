#!/usr/bin/env node
'use strict';
/*
 * review2-collate.cjs — 汇总 v2 复审：s1 判定 + s2 对抗降级 → 最终 PASS/DROP
 * 产出 review2/final.json：
 *   { total, pass, drop, byCode, dropQids:[{qid,code,stage}], uncertainQids:[...] }
 * UNCERTAIN 不自动剔除，进人工复核名单。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'datasets', 'harvest', 'review2');
const CHUNKS = path.join(BASE, 'chunks');
const VERDICTS = path.join(BASE, 'verdicts');

const main = () => {
  const files = fs.readdirSync(VERDICTS).filter((f) => f.endsWith('.tsv')).sort();
  const final = new Map(); // qid -> {v, code, stage}
  for (const f of files) {
    const stage = f.includes('-s2-') ? 2 : 1;
    for (const line of fs.readFileSync(path.join(VERDICTS, f), 'utf8').split('\n')) {
      const t = line.trim().split('\t');
      if (!t[0] || !t[1]) continue;
      const v = t[1] === 'PASS' ? 'PASS' : 'DROP';
      const code = t[2] || (v === 'DROP' ? '?' : '');
      if (v === 'PASS') {
        // s2 的 PASS 才是终局；s1 的 PASS 等待 s2 覆盖（无 s2 时保留）
        if (!final.has(t[0]) || stage === 2) final.set(t[0], { v, code: '', stage });
      } else {
        final.set(t[0], { v, code, stage });
      }
    }
  }
  let pass = 0;
  const byCode = {};
  const dropQids = [], uncertainQids = [];
  for (const [qid, r] of final) {
    if (r.v === 'PASS') pass++;
    else if (r.code === 'UNCERTAIN') uncertainQids.push(qid);
    else { byCode[r.code] = (byCode[r.code] || 0) + 1; dropQids.push({ qid, code: r.code, stage: r.stage }); }
  }
  const out = { total: final.size, pass, drop: dropQids.length, uncertain: uncertainQids.length, byCode, dropQids, uncertainQids };
  fs.writeFileSync(path.join(BASE, 'final.json'), JSON.stringify(out));
  console.log(JSON.stringify({ total: out.total, pass, drop: out.drop, uncertain: out.uncertain, byCode }));
};

main();
