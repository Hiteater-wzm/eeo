#!/usr/bin/env node
/*
 * chunk-candidates.cjs — 把候选池切成审查块（TSV），供审查工作流逐块分发
 * 输入 datasets/harvest/candidates.json（merge-harvest 产物）
 * 输出 datasets/harvest/chunks/chunk-NNNN.tsv：qid<TAB>name<TAB>desc<TAB>country
 * 幂等：已审过的 qid（verdicts/*.tsv 中出现过的）自动跳过。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CAND = path.join(ROOT, 'datasets', 'harvest', 'candidates.json');
const CHUNK_DIR = path.join(ROOT, 'datasets', 'harvest', 'chunks');
const VERDICT_DIR = path.join(ROOT, 'datasets', 'harvest', 'verdicts');
const SIZE = parseInt(process.argv[2] || '800', 10);
/* 批次前缀：防止新一轮分块覆盖上一轮同名判定文件 */
const TAG = 'w' + new Date().toISOString().replace(/[-:T]/g, '').slice(3, 14);

const main = () => {
  const cands = JSON.parse(fs.readFileSync(CAND, 'utf8'));
  fs.mkdirSync(CHUNK_DIR, { recursive: true });
  fs.mkdirSync(VERDICT_DIR, { recursive: true });

  const reviewed = new Set();
  for (const f of fs.readdirSync(VERDICT_DIR)) {
    if (!f.endsWith('.tsv')) continue;
    for (const line of fs.readFileSync(path.join(VERDICT_DIR, f), 'utf8').split('\n')) {
      const qid = line.split('\t')[0];
      if (qid) reviewed.add(qid);
    }
  }

  const todo = cands.filter((c) => !reviewed.has(c.wikidata));
  // 清掉旧块文件（本轮重新分块），判定文件按批次前缀隔离、只增不覆盖
  for (const f of fs.readdirSync(CHUNK_DIR)) fs.unlinkSync(path.join(CHUNK_DIR, f));
  let files = 0;
  for (let i = 0; i < todo.length; i += SIZE) {
    const part = todo.slice(i, i + SIZE);
    const lines = part.map((c) => [c.wikidata, c.name, c.description, c.country].map((x) => String(x || '').replace(/[\t\n\r]/g, ' ')).join('\t'));
    fs.writeFileSync(path.join(CHUNK_DIR, TAG + '-chunk-' + String(files).padStart(4, '0') + '.tsv'), lines.join('\n') + '\n');
    files++;
  }
  console.log(`候选 ${cands.length}　已审 ${reviewed.size}　本轮待审 ${todo.length}　块数 ${files}（每块 ${SIZE}）`);
};

main();
