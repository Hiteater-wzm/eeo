#!/usr/bin/env node
// EEO Audit 命令行批量检测（零依赖，Node 18+）
// 引擎配置读同目录 config.json，题库与引擎逻辑在 core.cjs
// 用法见 --help

'use strict';

const fs = require('fs');
const path = require('path');
const { runAudit, DEPTHS } = require(path.join(__dirname, 'core.cjs'));

// ---------- 终端基础 ----------
const TTY = !!process.stdout.isTTY;
const COLOR = TTY && !process.env.NO_COLOR;
const c = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const GRADE_CODE = { S: 95, A: 92, B: 93, C: 33, D: 91 };
const gLetter = g => (COLOR ? `\x1b[1;${GRADE_CODE[g] || 0}m${g}\x1b[0m` : g);
const SEP = c('2', '─'.repeat(50));

function strWidth(s) { let w = 0; for (const ch of String(s)) w += ch.codePointAt(0) > 0xff ? 2 : 1; return w; }
function padW(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - strWidth(s))); }
function fmtDur(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + '秒';
  return Math.floor(s / 60) + '分' + String(s % 60).padStart(2, '0') + '秒';
}
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function die(msg) { console.error('错误：' + msg); process.exit(1); }
function splitList(v) { return typeof v === 'string' ? v.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : (v || []); }

// ---------- 参数 ----------
const VAL_FLAGS = new Set(['industry', 'city', 'competitors', 'depth', 'engine', 'concurrency', 'limit', 'json', 'csv']);
const BOOL_FLAGS = new Set(['quiet']);

function parseArgs(argv) {
  const pos = [], o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { o.help = true; continue; }
    if (a.startsWith('--')) {
      let key = a.slice(2), val, eq = key.indexOf('=');
      if (eq !== -1) { val = key.slice(eq + 1); key = key.slice(0, eq); }
      if (BOOL_FLAGS.has(key)) { o[key] = true; continue; }
      if (!VAL_FLAGS.has(key)) die(`未知选项 ${a}，用 --help 看用法`);
      if (val === undefined) {
        val = argv[++i];
        if (val === undefined || val.startsWith('--')) die(`--${key} 需要一个参数`);
      }
      o[key] = val;
    } else pos.push(a);
  }
  return { pos, o };
}

function helpText() {
  return [
    'EEO Audit 命令行批量检测',
    '',
    '用法',
    '  node cli.cjs check <品牌> [选项]        单品牌检测',
    '  node cli.cjs batch <文件> [选项]        批量检测（txt 每行一个品牌，或 JSON 数组）',
    '  node cli.cjs dataset <关键词> [选项]    按行业关键词从 datasets/brands-1k.json 拉品牌',
    '  node cli.cjs watch <子命令> [选项]      定时监测（add / run / list / history / diff / remove）',
    '',
    '选项',
    '  --industry <行业>      行业，默认 综合',
    '  --city <城市>          所在城市',
    '  --competitors <a,b,c>  竞品名单，用于提及对比',
    '  --depth <档位>         quick | standard | deep，默认 quick',
    '  --engine <ids>         引擎子集，逗号分隔，如 --engine ds,glm',
    '  --concurrency <n>      并发品牌数，默认 1（串行，照顾接口限流）',
    '  --limit <n>            dataset 拉取条数，默认 10',
    '  --json <路径>          完整报告写入 JSON 文件',
    '  --csv <路径>           汇总写入 CSV 文件（brand,grade,overall,awareRate,mentionRate,engines）',
    '  --quiet                watch run 静默档，只输出有变化的品牌',
    '  -h, --help             本说明',
    '',
    '示例',
    '  node cli.cjs check 蜜雪冰城 --industry 餐饮 --depth quick',
    '  node cli.cjs batch brands.txt --industry 餐饮 --csv result.csv',
    '  node cli.cjs dataset 白酒 --limit 10 --depth quick --concurrency 2',
    '  node cli.cjs watch add 蜜雪冰城 --industry 餐饮',
    '  node cli.cjs watch run --quiet --json watch-last.json',
    '',
    '说明',
    '  引擎读同目录 config.json（复制 config.example.json 后填 Key）',
    '  中文输出需终端 UTF-8（cmd 先执行 chcp 65001）',
    '  批量中途 Ctrl-C：已完成结果先落盘再退出',
    '  watch run 出现报警（评级档位变化或综合分波动超 15）时退出码 1，供 cron / CI 判断',
  ].join('\n');
}

// ---------- 引擎配置 ----------
function loadEngines(o) {
  const cfgPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(cfgPath)) die('未找到 config.json，先在同目录复制 config.example.json 并填入 API Key');
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) { die('config.json 解析失败：' + e.message); }
  const usable = [];
  for (const e of (cfg.engines || [])) {
    if (!e || !e.id || e.enabled === false) continue;
    const key = typeof e.apiKey === 'string' ? e.apiKey.trim() : '';
    if (!key || key.startsWith('在此填入')) { console.error(`跳过引擎 ${e.name || e.id}（未填 API Key）`); continue; }
    usable.push(e);
  }
  if (!usable.length) die('config.json 里没有可用引擎（缺 API Key）');
  if (!o.engine) return usable;
  const ALIAS = { ds: 'deepseek' };
  const picked = [];
  for (const t of o.engine.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
    const want = ALIAS[t] || t;
    const hit = usable.find(e =>
      e.id === want || e.id.toLowerCase().includes(want) ||
      (e.name || '').toLowerCase().includes(want) || want.includes(e.id.toLowerCase()));
    if (hit && !picked.includes(hit)) picked.push(hit);
    else if (!hit) console.error(`--engine ${t} 未匹配到引擎，忽略`);
  }
  if (!picked.length) die(`--engine ${o.engine} 未匹配任何已配置引擎（可用：${usable.map(e => e.id).join(',')}）`);
  return picked;
}

// ---------- 数据集 ----------
function loadDataset() {
  const p = path.join(__dirname, 'datasets', 'brands-1k.json');
  if (!fs.existsSync(p)) die('未找到 datasets/brands-1k.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { die('brands-1k.json 解析失败：' + e.message); }
}

function tokenize(q) {
  const toks = new Set();
  for (const w of (q.match(/[A-Za-z0-9][A-Za-z0-9\-']*/g) || [])) toks.add(w.toLowerCase());
  for (const run of (q.match(/[\u4e00-\u9fff]+/g) || [])) {
    if (run.length <= 2) toks.add(run);
    else for (let i = 0; i + 2 <= run.length; i++) toks.add(run.slice(i, i + 2));
  }
  return [...toks].filter(t => t.length >= 2);
}

// 数据集条目若主名是英文，取第一个中文别名送检（中文引擎答中文品牌名，命中率才准）
function hasCJK(s) { return /[\u4e00-\u9fff]/.test(s); }
function pickName(entry) {
  if (hasCJK(entry.name)) return entry.name;
  const zh = (entry.aliases || []).find(hasCJK);
  return zh || entry.name;
}

// 行业精确 > 行业包含 > 名称/别名 > 简介 > 优势
function searchDataset(ds, kw, limit) {
  const toks = tokenize(kw);
  if (!toks.length) return [];
  const out = [];
  ds.forEach((e, i) => {
    const ind = e.industry || '';
    const names = [e.name, ...(e.aliases || [])].join(' ');
    const desc = e.description || '';
    const adv = (e.advantages || []).join(' ');
    let score = 0;
    const fields = new Set();
    if (ind === kw) { score += 100; fields.add('行业'); }
    for (const t of toks) {
      if (ind.includes(t)) { score += 6; fields.add('行业'); }
      if (names.includes(t)) { score += 4; fields.add('名称'); }
      if (desc.includes(t)) { score += 2; fields.add('简介'); }
      if (adv.includes(t)) { score += 1; fields.add('优势'); }
    }
    if (score > 0) out.push({ entry: e, score, fields: [...fields], idx: i });
  });
  out.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return out.slice(0, limit);
}

// ---------- 批次文件 ----------
function loadBatchFile(p) {
  if (!fs.existsSync(p)) die('找不到文件 ' + p);
  const raw = fs.readFileSync(p, 'utf8').trim();
  if (!raw) die('文件是空的：' + p);
  let items = [];
  if (raw.startsWith('[') || raw.startsWith('{')) {
    let arr;
    try { arr = JSON.parse(raw); } catch (e) { die('JSON 解析失败：' + e.message); }
    if (!Array.isArray(arr)) die('JSON 文件需是数组');
    items = arr.map(it => typeof it === 'string'
      ? { brand: it.trim() }
      : { brand: String(it.brand || it.name || '').trim(), industry: it.industry, city: it.city, competitors: it.competitors });
  } else {
    items = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => ({ brand: l }));
  }
  items = items.filter(it => it.brand);
  if (!items.length) die('文件里没有可用品牌');
  return items;
}

function inputOf(item, o) {
  return {
    brand: item.brand,
    industry: (o.industry || item.industry || '综合').trim(),
    city: (o.city || item.city || '').trim(),
    competitors: o.competitors ? splitList(o.competitors) : (item.competitors || []),
    depth: o.depth,
  };
}

// ---------- 进度显示 ----------
function makeUI(mode) {
  const st = {
    qTotal: 0, engines: [], counters: {},          // check：单品牌各引擎计数
    totalBrands: 0, doneBrands: 0,                 // batch：品牌计数
    active: new Map(),                             // batch：brand -> {cap, perEng}
    answers: 0, answersCap: 0,
  };
  let lastDraw = 0;

  function draw(force) {
    if (!TTY) return;
    const now = Date.now();
    if (!force && now - lastDraw < 200) return;
    lastDraw = now;
    if (mode === 'check') {
      const done = st.engines.reduce((a, e) => a + (st.counters[e.id] || 0), 0);
      const grand = Math.max(1, st.qTotal * st.engines.length);
      const f = Math.round((done / grand) * 18);
      process.stdout.write('\r\x1b[K ' + '█'.repeat(f) + '░'.repeat(18 - f) +
        ` ${done}/${grand}  ` + st.engines.map(e => `${e.name} ${st.counters[e.id] || 0}/${st.qTotal}`).join('  '));
    } else {
      const names = [...st.active.keys()];
      process.stdout.write('\r\x1b[K 批次 ' + st.doneBrands + '/' + st.totalBrands +
        ' · 作答 ' + st.answers + (st.answersCap ? '/' + st.answersCap : '') +
        (names.length ? ' · 进行中 ' + names.join('、') : ''));
    }
  }

  return {
    st,
    gen(brand) {
      const t = mode === 'check' ? '生成题库…' : brand + ' 生成题库…';
      if (TTY) process.stdout.write('\r\x1b[K ' + t);
      else if (mode === 'check') console.log(t);
    },
    setQ(qTotal, engines) { st.qTotal = qTotal; st.engines = engines; },
    tick(brand, e, n, total) {
      if (mode === 'check') { st.counters[e.id] = n; }
      else {
        let m = st.active.get(brand);
        if (!m) { m = { cap: 0, perEng: {} }; st.active.set(brand, m); }
        if (!m.cap) { m.cap = total * st.engines.length; st.answersCap += m.cap; }
        m.perEng[e.id] = n;
        let sum = 0; for (const b of st.active.values()) for (const k in b.perEng) sum += b.perEng[k];
        st.answers = sum;
      }
      draw();
    },
    line(text) {          // 永久行：先清进度行再打印，再补画进度
      if (TTY) process.stdout.write('\r\x1b[K');
      process.stdout.write(text + '\n');
      draw(true);
    },
    brandDone(brand) {
      st.doneBrands++;
      st.active.delete(brand);
      let sum = 0; for (const b of st.active.values()) for (const k in b.perEng) sum += b.perEng[k];
      st.answers = sum;
      draw(true);
    },
    finish() { if (TTY) process.stdout.write('\r\x1b[K'); },
  };
}

// ---------- 报告输出 ----------
function printReport(rep) {
  const s = rep.score, g = s.grade;
  console.log('');
  console.log(SEP);
  console.log('  ┌───┐');
  console.log('  │ ' + gLetter(g.g) + ' │   ' + rep.input.brand + ' · ' + rep.input.industry + (rep.input.city ? ' · ' + rep.input.city : ''));
  console.log('  └───┘   ' + c(GRADE_CODE[g.g] || 0, g.g + ' 级 · ' + g.t));
  console.log('');
  console.log('  综合分 ' + c('1', String(s.overall)) + '    认知率 ' + s.awareRate + '%    提及率 ' + s.mentionRate + '%');
  console.log('  ' + rep.questions.length + ' 题 · ' + Object.keys(rep.results).length + ' 引擎 · 耗时 ' + fmtDur((rep.durationSec || 0) * 1000));
  console.log('');
  console.log('  分引擎');
  for (const id of Object.keys(rep.results)) {
    const r = rep.results[id];
    const comp = Object.entries(r.comp).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([n, k]) => n + '×' + k).join(' ');
    console.log('    ' + padW(r.name, 14) + ' 认知 ' + r.aware + '/' + r.awareTotal +
      '   提及 ' + r.mention + ' 次' + (comp ? '   对手 ' + comp : ''));
  }
  console.log('');
  console.log('  AI 原话（前 3 条）');
  let shown = 0;
  for (const q of rep.questions) {
    if (shown >= 3) break;
    for (const id of Object.keys(rep.results)) {
      const a = q.answers && q.answers[id];
      if (a) {
        console.log('    [' + rep.results[id].name + ' · ' + q.cat + '] 「' +
          a.replace(/\s+/g, ' ').trim().slice(0, 64) + '…」');
        shown++;
        break;
      }
    }
  }
  if (!shown) console.log('    （无回答）');
  console.log(SEP);
}

function printRanking(results) {
  const ok = results.filter(r => r.ok).sort((a, b) => b.rep.score.overall - a.rep.score.overall);
  const bad = results.filter(r => !r.ok);
  if (!results.length) return;
  const wName = Math.max(6, ...results.map(r => strWidth(r.brand))) + 2;
  console.log('');
  console.log('排行（按综合分降序）');
  ok.forEach((r, i) => {
    const s = r.rep.score;
    console.log(' ' + String(i + 1).padStart(2) + '  ' + padW(r.brand, wName) + ' ' + gLetter(s.grade.g) +
      '  ' + String(s.overall).padStart(3) + '   认知 ' + String(s.awareRate).padStart(3) +
      '  提及 ' + String(s.mentionRate).padStart(3) + '   ' + fmtDur(r.ms));
  });
  bad.forEach(r => console.log('  ×  ' + padW(r.brand, wName) + '失败 ' + r.error));
}

// ---------- 落盘 ----------
function ensureDir(p) { const d = path.dirname(p); if (d && d !== '.') fs.mkdirSync(d, { recursive: true }); }
function writeJson(p, reports) { ensureDir(p); fs.writeFileSync(p, JSON.stringify(reports, null, 1)); }

function csvCell(v) {
  v = String(v == null ? '' : v);
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function buildCsv(reports) {
  const rows = [['brand', 'grade', 'overall', 'awareRate', 'mentionRate', 'engines']];
  for (const r of reports) {
    if (!r.score) { rows.push([r.brand, '-', '', '', '', '失败：' + (r.error || '')]); continue; }
    const eng = Object.keys(r.results || {}).map(id => {
      const s = r.results[id];
      return s.name + ' 认知' + s.aware + '/' + s.awareTotal + ' 提及' + s.mention;
    }).join('；');
    rows.push([r.brand || r.input.brand, r.score.grade.g, r.score.overall, r.score.awareRate, r.score.mentionRate, eng]);
  }
  return '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
function writeCsvFile(p, reports) { ensureDir(p); fs.writeFileSync(p, buildCsv(reports)); }

function writeOutputs(o, reports) {
  if (o.json) { writeJson(o.json, reports); console.log('已写入 ' + o.json + '（' + reports.length + ' 条）'); }
  if (o.csv) { writeCsvFile(o.csv, reports); console.log('已写入 ' + o.csv + '（' + reports.length + ' 条）'); }
}

// ---------- 中断保护 ----------
const STATE = { reports: [], outJson: null, outCsv: null };
let INTERRUPTED = false;

function dumpPartial() {
  const files = [];
  if (STATE.outJson) { writeJson(STATE.outJson, STATE.reports); files.push(STATE.outJson); }
  if (STATE.outCsv) { writeCsvFile(STATE.outCsv, STATE.reports); files.push(STATE.outCsv); }
  if (!files.length && STATE.reports.length) {
    const f = path.join(process.cwd(), 'eeo-partial-' + stamp() + '.json');
    writeJson(f, STATE.reports);
    files.push(f);
  }
  return files;
}

function onInterrupt() {
  if (INTERRUPTED) process.exit(130);
  INTERRUPTED = true;
  try {
    const files = dumpPartial();
    process.stdout.write('\r\x1b[K\n');
    if (files.length) console.log('收到中断，' + STATE.reports.length + ' 个已完成结果已落盘：' + files.join('、'));
    else console.log('收到中断，还没有已完成结果');
  } catch (e) {
    console.error('中断落盘失败：' + e.message);
  }
  process.exit(130);
}
process.on('SIGINT', onInterrupt);

// ---------- 命令 ----------
async function cmdCheck(o, engines) {
  const brand = o._pos[0];
  if (!brand) die('check 需要一个品牌名，如：node cli.cjs check 蜜雪冰城');
  const dep = DEPTHS[o.depth];
  const input = {
    brand,
    industry: (o.industry || '综合').trim(),
    city: (o.city || '').trim(),
    competitors: splitList(o.competitors),
    depth: o.depth,
  };
  console.log('');
  console.log(brand + ' · ' + input.industry + (input.city ? ' · ' + input.city : '') +
    ' · ' + dep.label + '（' + dep.total + ' 题 × ' + engines.length + ' 引擎）');
  console.log('引擎 ' + engines.map(e => e.name).join('、'));
  const ui = makeUI('check');
  ui.setQ(dep.total, engines.map(e => ({ id: e.id, name: e.name })));
  ui.gen(brand);
  const t0 = Date.now();
  let rep;
  try {
    rep = await runAudit(input, engines, (e, n) => ui.tick(brand, e, n));
  } catch (e) {
    die('检测失败：' + (e && e.message || e));
  }
  ui.finish();
  rep.brand = brand;
  rep.durationSec = Math.round((Date.now() - t0) / 1000);
  rep.finishedAt = new Date().toISOString();
  STATE.reports.push(rep);
  printReport(rep);
  writeOutputs(o, [rep]);
}

async function runBatch(items, o, engines) {
  const dep = DEPTHS[o.depth];
  const wName = Math.max(6, ...items.map(it => strWidth(it.brand))) + 2;
  console.log('');
  console.log('批量 ' + items.length + ' 个品牌 · ' + dep.label + '（' + dep.total + ' 题 × ' + engines.length +
    ' 引擎）· 并发 ' + o.concurrency + ' · 引擎 ' + engines.map(e => e.name).join('、'));
  const ui = makeUI('batch');
  ui.setQ(dep.total, engines.map(e => ({ id: e.id, name: e.name })));
  ui.st.totalBrands = items.length;

  const results = new Array(items.length);
  let idx = 0;
  const t0 = Date.now();
  async function worker() {
    while (!INTERRUPTED) {
      const my = idx++;
      if (my >= items.length) return;
      const item = items[my];
      ui.line('[' + (my + 1) + '/' + items.length + '] ' + item.brand + ' 开始');
      const bt = Date.now();
      try {
        const rep = await runAudit(inputOf(item, o), engines, (e, n, tot) => ui.tick(item.brand, e, n, tot));
        const ms = Date.now() - bt;
        rep.brand = item.brand;
        rep.durationSec = Math.round(ms / 1000);
        rep.finishedAt = new Date().toISOString();
        results[my] = { ok: true, brand: item.brand, rep, ms };
        STATE.reports.push(rep);
        const s = rep.score;
        ui.line('√ [' + (my + 1) + '/' + items.length + '] ' + padW(item.brand, wName) + ' ' + gLetter(s.grade.g) +
          '  综合 ' + String(s.overall).padStart(3) + '  认知 ' + String(s.awareRate).padStart(3) +
          '  提及 ' + String(s.mentionRate).padStart(3) + '  ' + fmtDur(ms));
      } catch (err) {
        const msg = String((err && err.message) || err);
        results[my] = { ok: false, brand: item.brand, error: msg, ms: Date.now() - bt };
        STATE.reports.push({ brand: item.brand, industry: (o.industry || item.industry || '综合'), error: msg, finishedAt: new Date().toISOString() });
        ui.line('× [' + (my + 1) + '/' + items.length + '] ' + padW(item.brand, wName) + '失败 ' + msg);
      }
      ui.brandDone(item.brand);
    }
  }
  await Promise.all(Array.from({ length: o.concurrency }, worker));
  ui.finish();

  const okN = results.filter(r => r && r.ok).length;
  console.log('');
  console.log(SEP);
  console.log('完成 ' + okN + '/' + items.length + ' · 总耗时 ' + fmtDur(Date.now() - t0));
  printRanking(results.filter(Boolean));
  writeOutputs(o, STATE.reports);
}

async function cmdBatch(o, engines) {
  const file = o._pos[0];
  if (!file) die('batch 需要一个文件路径（txt 每行一个品牌，或 JSON 数组）');
  const items = loadBatchFile(path.resolve(file));
  await runBatch(items, o, engines);
}

async function cmdDataset(o, engines) {
  const kw = o._pos[0];
  if (!kw) die('dataset 需要一个行业关键词，如：node cli.cjs dataset 白酒');
  const ds = loadDataset();
  const matches = searchDataset(ds, kw, o.limit);
  if (!matches.length) {
    console.error('数据集里没有匹配「' + kw + '」的品牌');
    console.error('可换关键词重试，或直接检测：node cli.cjs check 品牌 --industry ' + kw);
    process.exit(1);
  }
  console.log('');
  console.log('从数据集匹配 ' + matches.length + ' 个品牌（关键词「' + kw + '」，不足 ' + o.limit + ' 个时按匹配度取前若干）');
  matches.forEach((m, i) => {
    console.log('  ' + String(i + 1).padStart(2) + '. ' + padW(m.entry.name, 26) +
      '[' + (m.entry.industry || '未分行业') + ']  命中 ' + m.fields.join('/'));
  });
  const items = matches.map(m => {
    const brand = pickName(m.entry);
    if (brand !== m.entry.name) console.log('      ' + m.entry.name + ' 按中文名送检：' + brand);
    return { brand, industry: m.entry.industry, city: m.entry.city };
  });
  await runBatch(items, o, engines);
}

// ---------- watch 监测（清单 / 历史轮次 / 对比报警） ----------
const WATCH_DIR = path.join(__dirname, 'watch');
const HISTORY_DIR = path.join(WATCH_DIR, 'history');
const WATCHLIST_PATH = path.join(WATCH_DIR, 'watchlist.json');
const GORDER = { S: 4, A: 3, B: 2, C: 1, D: 0 };

// 品牌 slug：保留中文与字母数字，去空格和特殊符号（做历史文件名）
function slugify(name) {
  const s = String(name || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[^\u4e00-\u9fff\w-]/g, '');
  return s.slice(0, 40) || 'brand';
}

// 原子落盘：先写 .tmp 再改名，中途断电不损坏旧文件
function atomicWriteJson(p, data) {
  ensureDir(p);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, p);
}

function loadWatchlist() {
  try {
    const wl = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
    return (wl && Array.isArray(wl.brands)) ? wl : { brands: [] };
  } catch { return { brands: [] }; }
}
function historyPath(brand) { return path.join(HISTORY_DIR, slugify(brand) + '.json'); }
function loadHistory(brand) {
  try {
    const arr = JSON.parse(fs.readFileSync(historyPath(brand), 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function appendHistory(brand, entry) {
  const arr = loadHistory(brand);
  arr.push(entry);
  atomicWriteJson(historyPath(brand), arr);
  return arr.length;
}

function fmtTs(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso || '');
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// 与上一轮对比：档位变化或综合分波动超 15 记为报警（升降都报）
function cmpPrev(prev, cur) {
  if (!prev) return { first: true, dg: 0, dOverall: 0, dAware: 0, dMention: 0, alarmed: false, reasons: [] };
  const dg = (GORDER[cur.grade] || 0) - (GORDER[prev.grade] || 0);
  const dOverall = (cur.overall || 0) - (prev.overall || 0);
  const dAware = (cur.awareRate || 0) - (prev.awareRate || 0);
  const dMention = (cur.mentionRate || 0) - (prev.mentionRate || 0);
  const reasons = [];
  if (dg !== 0) reasons.push('评级 ' + prev.grade + '→' + cur.grade + (dg > 0 ? '（升档）' : '（降档）'));
  if (Math.abs(dOverall) > 15) reasons.push('综合 ' + (dOverall > 0 ? '+' : '') + dOverall);
  return { first: false, dg, dOverall, dAware, dMention, alarmed: reasons.length > 0, reasons };
}

// 报警行黄底加粗；无色终端退化为 [报警] 前缀，日志里仍可辨
const hlRow = s => (COLOR ? '\x1b[1;43;30m ' + s + '\x1b[0m' : '[报警] ' + s);
const arrowOf = d => (d > 0 ? c('32', '↑') : d < 0 ? c('31', '↓') : c('2', '→'));
const deltaTxt = d => (d > 0 ? c('32', '+' + d) : d < 0 ? c('31', String(d)) : c('2', '持平'));

function watchRowLine(r, wName) {
  if (!r.ok) return '  ×  ' + padW(r.brand, wName) + c('31', '失败 ' + (r.error || ''));
  const cur = r.cur, cmp = r.cmp;
  let line = '  ' + padW(r.brand, wName) + ' ' + gLetter(cur.grade) + ' ' + String(cur.overall).padStart(3) +
    '   认知 ' + String(cur.awareRate).padStart(3) + '   提及 ' + String(cur.mentionRate).padStart(3) + '   ';
  if (cmp.first) {
    line += c('2', '首次监测，建立基线');
  } else {
    line += c('2', r.prev.grade + ' ' + r.prev.overall) + ' ' + arrowOf(cmp.dOverall) +
      (cmp.dOverall ? (cmp.dOverall > 0 ? '+' : '') + cmp.dOverall : '');
    if (cmp.alarmed) line += '  ' + cmp.reasons.join('，');
  }
  return cmp.alarmed ? hlRow(line) : line;
}

// 汇总输出：quiet 只含有变化的品牌，全无变化则一行不出
function renderWatchSummary(rows, quiet, msTotal) {
  const out = [];
  const alarmed = rows.filter(r => r.ok && r.cmp.alarmed);
  const changed = rows.filter(r => r.ok && !r.cmp.first &&
    (r.cmp.dg !== 0 || r.cmp.dOverall !== 0 || r.cmp.dAware !== 0 || r.cmp.dMention !== 0));
  const show = quiet ? changed : rows;
  if (!show.length) {
    if (!quiet) out.push('', '本轮 ' + rows.length + ' 个品牌，分数与上次一致');
    return out;
  }
  const wName = Math.max(6, ...rows.map(r => strWidth(r.brand))) + 2;
  if (!quiet) {
    out.push('', SEP);
    out.push('监测汇总 · 成功 ' + rows.filter(r => r.ok).length + '/' + rows.length + ' · 耗时 ' + fmtDur(msTotal));
  }
  for (const r of show) out.push(watchRowLine(r, wName));
  if (!quiet) {
    out.push('');
    if (alarmed.length) {
      out.push(c('1', '报警 ' + alarmed.length + ' 条（评级档位变化或综合分波动超 15），本轮退出码 1'));
      for (const r of alarmed) out.push('  ' + r.brand + '：' + r.cmp.reasons.join('，'));
    } else {
      out.push('无报警，退出码 0');
    }
    out.push(SEP);
  }
  return out;
}

function buildWatchJson(rows, o, msTotal) {
  return {
    ranAt: new Date().toISOString(),
    depth: o.depth,
    durationSec: Math.round(msTotal / 1000),
    brands: rows.map(r => {
      if (!r.ok) return { brand: r.brand, ok: false, error: r.error };
      const cur = r.cur, cmp = r.cmp;
      return {
        brand: r.brand, ok: true, ts: cur.ts, grade: cur.grade,
        overall: cur.overall, awareRate: cur.awareRate, mentionRate: cur.mentionRate,
        perEngine: cur.perEngine,
        prev: r.prev ? { ts: r.prev.ts, grade: r.prev.grade, overall: r.prev.overall, awareRate: r.prev.awareRate, mentionRate: r.prev.mentionRate } : null,
        delta: cmp.first ? null : { overall: cmp.dOverall, awareRate: cmp.dAware, mentionRate: cmp.dMention },
        alarmed: cmp.alarmed, reasons: cmp.reasons,
      };
    }),
    okCount: rows.filter(r => r.ok).length,
    alarmedCount: rows.filter(r => r.ok && r.cmp.alarmed).length,
  };
}

// 数据集补默认值：add 时没给行业/城市，且品牌在 brands-1k 里，直接借用
function findInDataset(name) {
  const p = path.join(__dirname, 'datasets', 'brands-1k.json');
  if (!fs.existsSync(p)) return null;
  try {
    const ds = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(ds) ? (ds.find(e => e && (e.name === name || (e.aliases || []).includes(name))) || null) : null;
  } catch { return null; }
}

function watchHelp() {
  return [
    'watch 定时监测',
    '',
    '用法',
    '  node cli.cjs watch add <品牌> [--industry 行业] [--city 城市] [--competitors a,b]   登记监测',
    '  node cli.cjs watch run [--depth quick] [--quiet] [--json 路径] [--engine ids]      跑一轮全部品牌',
    '  node cli.cjs watch list                监测清单与最近一次分数',
    '  node cli.cjs watch history <品牌>      该品牌历次分数时间线',
    '  node cli.cjs watch diff <品牌>         最近两轮变化（评级 / 分数 / 各引擎）',
    '  node cli.cjs watch remove <品牌>       移除监测（历史文件保留）',
    '',
    '说明',
    '  清单存 watch/watchlist.json，历史存 watch/history/<品牌slug>.json（只存分数，不存全文）',
    '  watch run 出现报警（评级档位变化或综合分波动超 15）时黄底高亮该行，退出码 1，供 cron / CI 判断',
    '  --quiet 只输出有变化的品牌，全无变化则静默且退出码 0',
    '  add 时未给行业/城市且品牌在 datasets/brands-1k.json 里，自动借用数据集里的值',
    '',
    'cron 示例（每天 08:00 跑一轮，有变化才留日志）',
    '  0 8 * * * cd /path/to/eeo-open && node cli.cjs watch run --quiet >> watch.log 2>&1',
  ].join('\n');
}

function cmdWatchAdd(o) {
  const brand = String(o._pos[1] || '').trim();
  if (!brand) die('watch add 需要品牌名，如：node cli.cjs watch add 蜜雪冰城 --industry 餐饮');
  const wl = loadWatchlist();
  const dup = wl.brands.find(x => x.brand === brand || slugify(x.brand) === slugify(brand));
  if (dup) die('「' + brand + '」已在监测清单（与「' + dup.brand + '」同名或文件名相同）');
  const ent = {
    brand,
    industry: String(o.industry || '').trim(),
    city: String(o.city || '').trim(),
    competitors: splitList(o.competitors),
    addedAt: new Date().toISOString(),
  };
  if (!ent.industry || !ent.city) {
    const hit = findInDataset(brand);
    if (hit) {
      if (!ent.industry && hit.industry) { ent.industry = String(hit.industry).trim(); console.log('行业取自数据集：' + ent.industry); }
      if (!ent.city && hit.city) { ent.city = String(hit.city).trim(); console.log('城市取自数据集：' + ent.city); }
    }
  }
  if (!ent.industry) ent.industry = '综合';
  wl.brands.push(ent);
  atomicWriteJson(WATCHLIST_PATH, wl);
  console.log('已登记监测：' + brand + '（' + ent.industry + (ent.city ? ' · ' + ent.city : '') + '）');
  console.log('分数历史将写入 watch/history/' + slugify(brand) + '.json');
}

function cmdWatchRemove(o) {
  const brand = String(o._pos[1] || '').trim();
  if (!brand) die('watch remove 需要品牌名，如：node cli.cjs watch remove 蜜雪冰城');
  const wl = loadWatchlist();
  const i = wl.brands.findIndex(x => x.brand === brand || slugify(x.brand) === slugify(brand));
  if (i === -1) die('监测清单里没有「' + brand + '」');
  const ent = wl.brands.splice(i, 1)[0];
  atomicWriteJson(WATCHLIST_PATH, wl);
  const n = loadHistory(ent.brand).length;
  console.log('已移除监测：' + ent.brand + '（清单剩 ' + wl.brands.length + ' 个' +
    (n ? '，历史 ' + n + ' 轮保留于 watch/history/' + slugify(ent.brand) + '.json' : '') + '）');
}

function cmdWatchList() {
  const wl = loadWatchlist();
  if (!wl.brands.length) { console.log('监测清单是空的，先用 watch add 登记品牌'); return; }
  const wName = Math.max(6, ...wl.brands.map(b => strWidth(b.brand))) + 2;
  console.log('');
  console.log('监测清单（' + wl.brands.length + ' 个品牌 · watch/watchlist.json）');
  for (const ent of wl.brands) {
    const hist = loadHistory(ent.brand);
    const last = hist.length ? hist[hist.length - 1] : null;
    const meta = '[' + (ent.industry || '综合') + (ent.city ? ' · ' + ent.city : '') + ']';
    const score = last
      ? gLetter(last.grade) + ' ' + String(last.overall).padStart(3) + '   ' + c('2', '最近 ' + fmtTs(last.ts) + ' · ' + hist.length + ' 轮')
      : c('2', '未监测');
    console.log('  ' + padW(ent.brand, wName) + padW(meta, 24) + score);
  }
}

function cmdWatchHistory(o) {
  const brand = String(o._pos[1] || '').trim();
  if (!brand) die('watch history 需要品牌名，如：node cli.cjs watch history 蜜雪冰城');
  const hist = loadHistory(brand);
  if (!hist.length) die('「' + brand + '」还没有监测记录，先跑 watch run');
  console.log('');
  console.log(brand + ' 历次分数（' + hist.length + ' 轮 · watch/history/' + slugify(brand) + '.json）');
  for (const h of hist) {
    console.log('  ' + fmtTs(h.ts) + '   ' + gLetter(h.grade) + '  ' + String(h.overall).padStart(3) +
      '   认知 ' + String(h.awareRate).padStart(3) + '   提及 ' + String(h.mentionRate).padStart(3));
  }
}

function cmdWatchDiff(o) {
  const brand = String(o._pos[1] || '').trim();
  if (!brand) die('watch diff 需要品牌名，如：node cli.cjs watch diff 蜜雪冰城');
  const hist = loadHistory(brand);
  if (!hist.length) die('「' + brand + '」还没有监测记录，先跑 watch run');
  if (hist.length < 2) die('「' + brand + '」只有 1 轮记录，再跑一轮 watch run 才能对比');
  const prev = hist[hist.length - 2], cur = hist[hist.length - 1];
  const cmp = cmpPrev(prev, cur);
  console.log('');
  console.log(brand + ' 最近两轮对比');
  console.log('  时间    ' + fmtTs(prev.ts) + '  →  ' + fmtTs(cur.ts));
  console.log('  评级    ' + gLetter(prev.grade) + ' → ' + gLetter(cur.grade) +
    (cmp.dg === 0 ? '   持平' : cmp.dg > 0 ? '   ' + c('32', '升档') : '   ' + c('31', '降档')));
  console.log('  综合分  ' + String(prev.overall).padStart(3) + ' → ' + String(cur.overall).padStart(3) + '   ' + deltaTxt(cmp.dOverall));
  console.log('  认知率  ' + String(prev.awareRate).padStart(3) + ' → ' + String(cur.awareRate).padStart(3) + '   ' + deltaTxt(cmp.dAware));
  console.log('  提及率  ' + String(prev.mentionRate).padStart(3) + ' → ' + String(cur.mentionRate).padStart(3) + '   ' + deltaTxt(cmp.dMention));
  console.log('  分引擎（认知按题数，提及按次数）');
  const pE = prev.perEngine || {}, cE = cur.perEngine || {};
  const names = [...new Set([...Object.keys(pE), ...Object.keys(cE)])];
  for (const nm of names) {
    const p = pE[nm], q = cE[nm];
    console.log('    ' + padW(nm, 12) +
      ' 认知 ' + (p ? p.aware : '—') + '→' + (q ? q.aware : '—') +
      '   提及 ' + (p ? p.mention : '—') + '→' + (q ? q.mention : '—') +
      (p && q ? '  ' + deltaTxt(q.mention - p.mention) : '  ' + c('2', p ? '已不在本轮' : '本轮新增')));
  }
  if (cmp.alarmed) {
    console.log('');
    console.log(hlRow('报警：' + cmp.reasons.join('，')));
  }
}

async function cmdWatchRun(o) {
  const quiet = !!o.quiet;
  const wl = loadWatchlist();
  if (!wl.brands.length) { console.error('监测清单是空的，先用 watch add 登记品牌'); process.exit(1); }
  const engines = loadEngines(o);
  const dep = DEPTHS[o.depth];
  const n = wl.brands.length;
  const wName = Math.max(6, ...wl.brands.map(b => strWidth(b.brand))) + 2;
  if (!quiet) {
    console.log('');
    console.log('监测轮 ' + n + ' 个品牌 · ' + dep.label + '（' + dep.total + ' 题 × ' + engines.length +
      ' 引擎）· 引擎 ' + engines.map(e => e.name).join('、'));
  }
  const ui = quiet ? null : makeUI('batch');
  if (ui) { ui.setQ(dep.total, engines.map(e => ({ id: e.id, name: e.name }))); ui.st.totalBrands = n; }
  const t0 = Date.now();
  const rows = [];
  for (let i = 0; i < n; i++) {
    if (INTERRUPTED) break;
    const ent = wl.brands[i];
    const hist = loadHistory(ent.brand);
    const prev = hist.length ? hist[hist.length - 1] : null;
    if (ui) ui.line('[' + (i + 1) + '/' + n + '] ' + ent.brand + ' 开始');
    const bt = Date.now();
    let rep = null, error = null;
    try {
      rep = await runAudit({
        brand: ent.brand,
        industry: (ent.industry || '综合').trim(),
        city: (ent.city || '').trim(),
        competitors: ent.competitors || [],
        depth: o.depth,
      }, engines, (e, cnt, tot) => { if (ui) ui.tick(ent.brand, e, cnt, tot); });
    } catch (err) { error = String((err && err.message) || err); }
    if (rep) {
      const s = rep.score;
      const entry = { ts: new Date().toISOString(), grade: s.grade.g, overall: s.overall, awareRate: s.awareRate, mentionRate: s.mentionRate, perEngine: {} };
      for (const id of Object.keys(rep.results)) {
        const rr = rep.results[id];
        entry.perEngine[rr.name] = { aware: rr.aware, mention: rr.mention };
      }
      appendHistory(ent.brand, entry);
      rep.brand = ent.brand;
      rep.durationSec = Math.round((Date.now() - bt) / 1000);
      STATE.reports.push(rep);
      rows.push({ ok: true, brand: ent.brand, cur: entry, prev, cmp: cmpPrev(prev, entry) });
      if (ui) ui.line('√ [' + (i + 1) + '/' + n + '] ' + padW(ent.brand, wName) + ' ' + gLetter(s.grade.g) +
        ' ' + String(s.overall).padStart(3) + '  ' + fmtDur(Date.now() - bt));
    } else {
      rows.push({ ok: false, brand: ent.brand, error });
      if (ui) ui.line('× [' + (i + 1) + '/' + n + '] ' + padW(ent.brand, wName) + '失败 ' + error);
    }
    if (ui) ui.brandDone(ent.brand);
  }
  if (ui) ui.finish();
  const msTotal = Date.now() - t0;
  for (const l of renderWatchSummary(rows, quiet, msTotal)) console.log(l);
  if (o.json) {
    writeJson(o.json, buildWatchJson(rows, o, msTotal));
    if (!quiet) console.log('已写入 ' + o.json);
  }
  const okN = rows.filter(r => r.ok).length;
  if (rows.some(r => r.ok && r.cmp.alarmed) || okN === 0) process.exitCode = 1;
}

async function cmdWatch(o) {
  const sub = String(o._pos[0] || '').toLowerCase();
  if (!sub || sub === 'help') { console.log(watchHelp()); return; }
  if (sub === 'add') return cmdWatchAdd(o);
  if (sub === 'remove') return cmdWatchRemove(o);
  if (sub === 'list') return cmdWatchList();
  if (sub === 'history') return cmdWatchHistory(o);
  if (sub === 'diff') return cmdWatchDiff(o);
  if (sub === 'run') return cmdWatchRun(o);
  die('未知 watch 子命令 ' + sub + '，node cli.cjs watch 看用法');
}

// ---------- 入口 ----------
async function main() {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < 18) die('需要 Node 18 及以上（当前 ' + process.versions.node + '）');
  const cmd = process.argv[2];
  const { pos, o } = parseArgs(process.argv.slice(3));
  o._pos = pos;
  if (o.help || cmd === '-h' || cmd === '--help' || cmd === 'help') { console.log(helpText()); return; }
  if (!cmd) { console.error(helpText()); process.exit(1); }
  if (!['check', 'batch', 'dataset', 'watch'].includes(cmd)) die('未知命令 ' + cmd + '，用 --help 看用法');

  o.depth = o.depth || 'quick';
  if (!DEPTHS[o.depth]) die('--depth 仅支持 quick / standard / deep');
  o.concurrency = Math.max(1, parseInt(o.concurrency || '1', 10) || 1);
  if (o.concurrency > 4) console.error('并发 ' + o.concurrency + ' 偏高，注意接口限流');
  o.limit = Math.max(1, parseInt(o.limit || '10', 10) || 1);

  // watch：--json 由 watch run 自己写（汇总格式），不走 check/batch 的完整报告落盘
  if (cmd === 'watch') { await cmdWatch(o); return; }

  STATE.outJson = o.json || null;
  STATE.outCsv = o.csv || null;

  const engines = loadEngines(o);
  if (cmd === 'check') await cmdCheck(o, engines);
  else if (cmd === 'batch') await cmdBatch(o, engines);
  else await cmdDataset(o, engines);
}

if (require.main === module) {
  main().catch(e => die((e && e.stack) || String(e)));
} else {
  // 供测试
  module.exports = { tokenize, searchDataset, buildCsv, csvCell, parseArgs, strWidth, padW, fmtDur, loadBatchFile, inputOf, STATE, dumpPartial, helpText,
    slugify, cmpPrev, renderWatchSummary, buildWatchJson, loadWatchlist, loadHistory, appendHistory, watchHelp };
}
