#!/usr/bin/env node
'use strict';
/*
 * judge.cjs — 对一份快照跑立场裁判（CLI 入口，实现在 lib/judge.cjs）
 *
 * 用法：node tools/judge.cjs snapshots/<快照目录> [--judges id1,id2]
 * 裁判引擎从 config.json 取（建议两个不同家族，如 deepseek + glm），
 * 判定按回答哈希缓存在快照目录内；重跑只补缺，已判的不重花钱。
 * 之后 score-snapshot.cjs 只读缓存打分，全程零网络请求。
 */
const fs = require('fs');
const path = require('path');
const { judgeSnapshot } = require('../lib/judge.cjs');

async function main() {
  const argv = process.argv.slice(2);
  const dir = argv[0];
  if (!dir || !fs.existsSync(path.join(dir, 'answers.jsonl'))) {
    console.error('用法：node tools/judge.cjs <快照目录> [--judges id1,id2]');
    process.exit(1);
  }
  const cfgPath = path.join(__dirname, '..', 'config.json');
  if (!fs.existsSync(cfgPath)) throw new Error('缺 config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  let engines = (cfg.engines || []).filter((e) => e.enabled && e.apiKey);
  if (argv.includes('--judges')) {
    const ids = argv[argv.indexOf('--judges') + 1].split(',').map((s) => s.trim());
    engines = engines.filter((e) => ids.includes(e.id));
  }
  if (!engines.length) throw new Error('没有可用裁判引擎');
  if (engines.length > 2) engines = engines.slice(0, 2);

  const rows = fs.readFileSync(path.join(dir, 'answers.jsonl'), 'utf8').split('\n')
    .filter((l) => l.trim()).map((l) => JSON.parse(l));
  console.log(`待判 ${rows.length} 条回答，裁判 ${engines.map((e) => e.id).join(' + ')}（已判条目自动跳过）`);
  const t0 = Date.now();
  await judgeSnapshot(rows, engines.map((e) => ({ id: e.id, engine: e, apiKey: e.apiKey })), dir,
    (calls) => console.log(`  裁判调用 ${calls} 次…`));
  console.log(`裁判完成（${Math.round((Date.now() - t0) / 1000)}s）。现在可运行：node tools/score-snapshot.cjs ${dir}`);
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
