#!/usr/bin/env node
/* verify-verdicts.cjs — 核对每块判定文件齐全且行数一致，输出 JSON {ok, bad:[...]} */
'use strict';
const fs = require('fs');
const path = require('path');
const CHUNK_DIR = path.join(__dirname, '..', 'datasets', 'harvest', 'chunks');
const VERDICT_DIR = path.join(__dirname, '..', 'datasets', 'harvest', 'verdicts');

const bad = [];
let ok = 0;
for (const f of fs.readdirSync(CHUNK_DIR).filter((x) => x.endsWith('.tsv')).sort()) {
  const v = path.join(VERDICT_DIR, f);
  if (!fs.existsSync(v)) { bad.push(f + ':missing'); continue; }
  const cLines = fs.readFileSync(path.join(CHUNK_DIR, f), 'utf8').split('\n').filter(Boolean).length;
  const vLines = fs.readFileSync(v, 'utf8').split('\n').filter((l) => l.trim()).length;
  if (cLines !== vLines) { bad.push(`${f}:${vLines}/${cLines}`); continue; }
  ok++;
}
console.log(JSON.stringify({ ok, bad }));
