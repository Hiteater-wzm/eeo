#!/usr/bin/env node
'use strict';
/*
 * review2-finalize.cjs — 并入仲裁裁决，产出终局 final-verdict.json
 * 规则：s3 仲裁 PASS → 恢复；s3 DROP+代码 → 确认剔除；s3 UNCERTAIN → 人工名单；
 *       s3 缺裁（未跑到的行）→ 沿用两道复审结果中的 DROP/UNCERTAIN 保守处理为人工名单。
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'datasets', 'harvest', 'review2');

const main = () => {
  const f = JSON.parse(fs.readFileSync(path.join(BASE, 'final.json'), 'utf8'));
  const flagged = new Map();
  for (const d of f.dropQids || []) flagged.set(d.qid, d.code);
  for (const q of f.uncertainQids || []) flagged.set(q, 'UNCERTAIN');

  const arb = new Map(); // s3 裁决
  const dir = path.join(BASE, 'verdicts');
  for (const fn of fs.readdirSync(dir).filter((x) => x.includes('-s3-')).sort()) {
    for (const line of fs.readFileSync(path.join(dir, fn), 'utf8').split('\n')) {
      const t = line.trim().split('\t');
      if (t[0] && t[1]) arb.set(t[0], t[1] === 'PASS' ? 'PASS' : 'DROP:' + (t[2] || '?'));
    }
  }

  const finalDrop = [], human = [], restored = [];
  for (const [qid, oldCode] of flagged) {
    const a = arb.get(qid);
    if (a === 'PASS') restored.push(qid);
    else if (a && a.startsWith('DROP:')) finalDrop.push({ qid, code: a.slice(5), arbiter: true });
    else human.push({ qid, oldCode, note: a === 'UNCERTAIN' ? '仲裁存疑' : '仲裁未覆盖' });
  }
  const out = {
    source_sample: { total: f.total, drop: f.drop, uncertain: f.uncertain },
    restored: restored.length, confirmed_drop: finalDrop.length, human_review: human.length,
    byCode: finalDrop.reduce((m, x) => { m[x.code] = (m[x.code] || 0) + 1; return m; }, {}),
    finalDropQids: finalDrop, humanReviewQids: human,
  };
  fs.writeFileSync(path.join(BASE, 'final-verdict.json'), JSON.stringify(out));
  console.log(JSON.stringify({ restored: out.restored, confirmed_drop: out.confirmed_drop, human_review: out.human_review, byCode: out.byCode }));
};

main();
