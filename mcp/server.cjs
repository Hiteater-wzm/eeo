#!/usr/bin/env node
// EEO Audit MCP Server：stdio 传输，JSON-RPC 2.0，MCP 2025-06-18
// 零依赖（只用 Node 内置），检测逻辑复用上层 core.cjs，引擎配置读 ../config.json
// stdout 只输出协议消息，日志走 stderr，密钥不外泄
const fs = require('fs');
const path = require('path');
const { runAudit, DEPTHS } = require('../core.cjs');

const PROTOCOL_LATEST = '2025-06-18';
const SUPPORTED_VERSIONS = ['2024-11-05', '2025-03-26', PROTOCOL_LATEST];
const SERVER_NAME = 'eeo-audit-mcp';
const SERVER_VERSION = '1.0.0';
const CFG_PATH = path.join(__dirname, '..', 'config.json');
const MAX_BATCH = 10;
const KEY_PLACEHOLDER = '在此填入';

// ---------- 通信 ----------
function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function reply(id, result) { if (id !== undefined) send({ jsonrpc: '2.0', id, result }); }
function rpcError(id, code, message) { if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code, message } }); }
function notify(method, params) { send({ jsonrpc: '2.0', method, params }); }
function log(...a) { process.stderr.write('[eeo-mcp] ' + a.join(' ') + '\n'); }

// ---------- 配置 ----------
function readConfig() {
  if (!fs.existsSync(CFG_PATH)) {
    throw new Error('未找到 config.json。请复制 config.example.json 为 config.json，填入引擎 API Key 后重试。路径：' + CFG_PATH);
  }
  try {
    return JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
  } catch (e) {
    throw new Error('config.json 解析失败：' + e.message);
  }
}
function engineReady(e) {
  return !!(e && e.enabled !== false && e.apiKey && !String(e.apiKey).startsWith(KEY_PLACEHOLDER));
}
function loadEngines() {
  const engines = (readConfig().engines || []).filter(engineReady);
  if (!engines.length) throw new Error('config.json 中没有可用引擎（需要 enabled 且已填入真实 apiKey）');
  return engines;
}

// ---------- 工具实现 ----------
function getEngines() {
  const list = (readConfig().engines || []).map(e => ({
    id: e.id, name: e.name, model: e.model, ready: engineReady(e),
  }));
  return {
    configPath: CFG_PATH,
    engineCount: list.length,
    readyCount: list.filter(x => x.ready).length,
    engines: list,
  };
}

function parseCompetitors(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,，、]/);
  return arr.map(x => String(x).trim()).filter(Boolean);
}

async function checkBrand(args, progressToken) {
  const brand = String(args.brand || '').trim();
  if (!brand) throw new Error('brand 不能为空');
  const depth = args.depth || 'quick';
  if (!DEPTHS[depth]) throw new Error('depth 必须是 quick / standard / deep 之一');
  const engines = loadEngines();
  const input = {
    brand,
    industry: String(args.industry || '').trim() || '综合',
    city: String(args.city || '').trim(),
    audience: '',
    competitors: parseCompetitors(args.competitors),
    depth,
  };
  const started = Date.now();
  log('开始检测', brand, 'depth=' + depth, 'engines=' + engines.map(e => e.id).join(','));
  let done = 0, grandTotal = 0;
  const audit = await runAudit(input, engines, (eng, d, t) => {
    done++; grandTotal = t * engines.length;
    if (progressToken !== undefined && (done === grandTotal || done % 6 === 0)) {
      notify('notifications/progress', { progressToken, progress: done, total: grandTotal, message: eng.name + ' ' + d + '/' + t });
    }
  });
  const sec = Math.round((Date.now() - started) / 1000);
  log('检测完成', brand, sec + 's');
  return buildReport(audit, engines, started);
}

function buildReport(audit, engines, started) {
  const modelById = {};
  engines.forEach(e => { modelById[e.id] = e.model; });
  const engineRows = Object.keys(audit.results).map(id => {
    const r = audit.results[id];
    return {
      id, name: r.name, model: modelById[id] || '',
      awarenessRate: r.awareTotal ? Math.round(100 * r.aware / r.awareTotal) : 0,
      awareAnswers: r.aware, brandQuestions: r.awareTotal,
      mentions: r.mention, categoryQuestions: r.mentionTotal,
      competitorMentions: r.comp,
    };
  });
  const questions = audit.questions.map(q => ({ id: q.id, cat: q.cat, q: q.q, labels: audit.labels[q.id] || {} }));
  const s = audit.score;
  return {
    brand: audit.input.brand,
    industry: audit.input.industry,
    city: audit.input.city,
    depth: audit.input.depth,
    durationSeconds: Math.round((Date.now() - started) / 1000),
    grade: s.grade.g,
    gradeLabel: s.grade.t,
    overallScore: s.overall,
    awarenessRate: s.awareRate,
    mentionRate: s.mentionRate,
    engines: engineRows,
    quotes: audit.quotes,
    questions,
  };
}

async function batchCheck(args, progressToken) {
  const brands = args.brands;
  if (!Array.isArray(brands) || !brands.length) throw new Error('brands 必须是非空数组');
  if (brands.length > MAX_BATCH) throw new Error('brands 一次最多 ' + MAX_BATCH + ' 个');
  const list = brands.map(b => String(b || '').trim()).filter(Boolean);
  if (!list.length) throw new Error('brands 里没有有效的品牌名');
  const started = Date.now();
  const rows = [];
  for (let i = 0; i < list.length; i++) {
    log('批量检测', (i + 1) + '/' + list.length, list[i]);
    try {
      const rep = await checkBrand({ brand: list[i], industry: args.industry, city: args.city, competitors: args.competitors, depth: args.depth }, undefined);
      const perEngine = {};
      rep.engines.forEach(e => { perEngine[e.id] = e.awarenessRate; });
      rows.push({
        brand: rep.brand, grade: rep.grade, gradeLabel: rep.gradeLabel,
        overallScore: rep.overallScore, awarenessRate: rep.awarenessRate, mentionRate: rep.mentionRate,
        perEngineAwarenessRate: perEngine,
      });
    } catch (e) {
      rows.push({ brand: list[i], error: String(e.message || e) });
    }
    if (progressToken !== undefined) {
      notify('notifications/progress', { progressToken, progress: i + 1, total: list.length, message: list[i] });
    }
  }
  return {
    count: rows.length,
    failed: rows.filter(r => r.error).length,
    durationSeconds: Math.round((Date.now() - started) / 1000),
    summary: rows,
  };
}

// ---------- 工具定义 ----------
const brandProps = {
  industry: { type: 'string', description: '行业，如 茶饮连锁 / 少儿编程 / SaaS' },
  city: { type: 'string', description: '品牌所在城市，会用于生成本地化问题' },
  competitors: { type: 'string', description: '竞品名，逗号分隔，如 喜茶,古茗' },
  depth: { type: 'string', enum: ['quick', 'standard', 'deep'], description: '检测深度：quick 12 题 / standard 30 题 / deep 48 题，默认 quick' },
};
const TOOLS = [
  {
    name: 'eeo_check_brand',
    description: '对单个品牌做完整的 AI 可见性检测：生成买家真实问题，逐个询问已配置的 LLM 引擎，返回 S/A/B/C/D 评级、认知率、提及率、每引擎明细、AI 原话摘录和逐题标签。需要真实调用各引擎，检测需数分钟（quick 约 3-6 分钟，standard/deep 更久），适合异步任务，不要在需要即时返回的对话里调用。Full AI-visibility audit for one brand; takes minutes, treat it as a background task.',
    inputSchema: {
      type: 'object',
      properties: Object.assign({ brand: { type: 'string', description: '品牌名（必填）' } }, brandProps),
      required: ['brand'],
    },
  },
  {
    name: 'eeo_batch_check',
    description: '批量检测多个品牌的 AI 可见性并返回汇总对比表（每个品牌一行：评级/认知率/提及率/各引擎认知率）。串行执行，耗时随品牌数线性增长（每个 quick 约 3-6 分钟，最多 ' + MAX_BATCH + ' 个），适合异步任务。Batch audit up to ' + MAX_BATCH + ' brands; time scales linearly per brand.',
    inputSchema: {
      type: 'object',
      properties: Object.assign({ brands: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: MAX_BATCH, description: '品牌名列表，最多 ' + MAX_BATCH + ' 个' } }, brandProps),
      required: ['brands'],
    },
  },
  {
    name: 'eeo_get_engines',
    description: '列出 config.json 中配置的检测引擎（id/名称/模型/是否就绪），不返回密钥。跑检测前可先调它确认引擎就绪。',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ---------- 方法分发 ----------
async function handleCall(msg) {
  const params = msg.params || {};
  const name = params.name;
  if (!name || typeof name !== 'string') return rpcError(msg.id, -32602, 'params.name 缺失');
  if (!TOOLS.some(t => t.name === name)) return rpcError(msg.id, -32602, '未知工具: ' + name);
  const args = params.arguments || {};
  const progressToken = params._meta && params._meta.progressToken;
  try {
    let result;
    if (name === 'eeo_get_engines') result = getEngines();
    else if (name === 'eeo_check_brand') result = await checkBrand(args, progressToken);
    else result = await batchCheck(args, progressToken);
    reply(msg.id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
  } catch (e) {
    reply(msg.id, { content: [{ type: 'text', text: String(e && e.message || e) }], isError: true });
  }
}

const HANDLERS = {
  initialize(msg) {
    const reqV = msg.params && msg.params.protocolVersion;
    reply(msg.id, {
      protocolVersion: SUPPORTED_VERSIONS.includes(reqV) ? reqV : PROTOCOL_LATEST,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: 'EEO 品牌可见性检测。eeo_get_engines 查看引擎配置（不泄漏密钥）；eeo_check_brand 单品牌完整检测，需数分钟，适合异步任务；eeo_batch_check 批量对比（最多 ' + MAX_BATCH + ' 个品牌）。检测引擎与密钥来自 eeo-open/config.json。',
    });
  },
  ping(msg) { reply(msg.id, {}); },
  'tools/list'(msg) { reply(msg.id, { tools: TOOLS }); },
  'tools/call': handleCall,
};

let pending = 0;
let stdinClosed = false;
function maybeExit() {
  if (!stdinClosed || pending > 0) return;
  // 等待 stdout 排空再退出，避免截断最后一条响应（管道写入是异步的）
  if (process.stdout.writableLength > 0) process.stdout.once('drain', () => process.exit(0));
  else process.exit(0);
}

async function handleMsg(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return rpcError(null, -32600, 'invalid request');
  const hasId = Object.prototype.hasOwnProperty.call(msg, 'id');
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (hasId) rpcError(msg.id, -32600, 'invalid request');
    return;
  }
  if (!hasId) return; // 通知不回包
  const h = HANDLERS[msg.method];
  if (!h) return rpcError(msg.id, -32601, 'method not found: ' + msg.method);
  pending++;
  try { await h(msg); }
  catch (e) { rpcError(msg.id, -32603, 'internal error: ' + (e && e.message)); }
  finally { pending--; maybeExit(); }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).replace(/\r$/, '');
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { rpcError(null, -32700, 'parse error'); continue; }
    if (Array.isArray(msg)) msg.forEach(m => handleMsg(m)); // 兼容批量
    else handleMsg(msg);
  }
});
process.stdin.on('end', () => { stdinClosed = true; maybeExit(); });
process.stdin.on('error', () => {});
process.on('uncaughtException', e => { log('uncaught:', e && e.message); });
log('started', SERVER_NAME, SERVER_VERSION, 'config=' + (fs.existsSync(CFG_PATH) ? 'found' : 'missing'));
