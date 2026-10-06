#!/usr/bin/env node
'use strict';
/*
 * snapshot-run.cjs — 面板采样层：跑出一份可发布的引擎快照（冻结语料）
 *
 * 快照 = 面板 × 引擎 × 每题每改写 n 次采样的全部原始回答。
 * 采样本身不可复现（模型在变），所以快照的价值在"存档"：
 * manifest 记录引擎型号、参数、时间、面板哈希；answers.jsonl 一行一样本。
 * 之后打分（score-snapshot.cjs）只在冻结语料上跑——那才是 Pact 第 2 条
 * 要求的可复现层。
 *
 * 用法：node tools/snapshot-run.cjs standards/panels/xx.json --samples 5
 * 引擎与密钥读 config.json（与 CLI / server 同一份）。
 */
const fs = require('fs');
const path = require('path');
const { askEngine } = require('../core.cjs');
const { pool } = require('../core.cjs');

async function loadConfig() {
  const f = path.join(__dirname, '..', 'config.json');
  if (!fs.existsSync(f)) throw new Error('缺 config.json（复制 config.example.json 填引擎与密钥）');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

async function main() {
  const argv = process.argv.slice(2);
  const panelPath = argv[0];
  const samples = argv.includes('--samples') ? parseInt(argv[argv.indexOf('--samples') + 1], 10) : 5;
  const only = argv.includes('--engines') ? argv[argv.indexOf('--engines') + 1].split(',').map((s) => s.trim()) : null;
  if (!panelPath || !fs.existsSync(panelPath)) throw new Error('用法：node tools/snapshot-run.cjs <panel.json> [--samples 5] [--engines id1,id2]');
  const cfg = await loadConfig();
  const engines = (cfg.engines || []).filter((e) => e.enabled && e.apiKey && (!only || only.includes(e.id)));
  if (!engines.length) throw new Error('没有可用引擎（config.json engines 需 enabled+apiKey）');

  const panel = JSON.parse(fs.readFileSync(panelPath, 'utf8'));
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const dir = path.join(__dirname, '..', 'snapshots', `${panel.id}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const jobs = [];
  for (const q of panel.questions) {
    const variants = q.kind === 'pairwise' ? [q.text, ...q.paraphrases.slice(1)] : q.paraphrases;
    variants.forEach((text, pi) => {
      for (let s = 0; s < (q.kind === 'pairwise' ? Math.max(1, Math.ceil(samples / 2)) : samples); s++) {
        for (const e of engines) {
          jobs.push({ q, text, pi, s, e });
        }
      }
    });
  }

  const answersFile = path.join(dir, 'answers.jsonl');
  let done = 0, fail = 0;
  const manifest = {
    schema: 'eeo.snapshot.v1',
    panel: { id: panel.id, hash: panel.hash, file: path.basename(panelPath) },
    samples_per_variant: samples,
    engines: engines.map((e) => ({ id: e.id, name: e.name, model: e.model, baseURL: e.baseURL, temperature: e.temperature ?? 0.7 })),
    started: new Date().toISOString(),
    params_note: '采样层不可复现；本快照的价值是冻结存档，测量复现在 score-snapshot.cjs',
  };

  await pool(jobs, 3, async (job) => {
    let answer = '';
    try { answer = await askEngine(job.e, job.text, job.e.apiKey); }
    catch (err) { answer = ''; fail++; }
    const row = {
      qid: job.q.id, kind: job.q.kind, para: job.pi, sample: job.s, engine: job.e.id,
      question: job.text, brands: job.q.brands, answer,
      ts: new Date().toISOString(),
    };
    fs.appendFileSync(answersFile, JSON.stringify(row) + '\n');
    done++;
    if (done % 20 === 0) console.log(`进度 ${done}/${jobs.length}（失败 ${fail}）`);
  });

  manifest.finished = new Date().toISOString();
  manifest.samples = done;
  manifest.failures = fail;
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`快照完成：${path.relative(process.cwd(), dir)}　样本 ${done}　失败 ${fail}`);
  console.log('下一步：node tools/score-snapshot.cjs <快照目录>   # 若要立场判定，先跑 --judge');
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
