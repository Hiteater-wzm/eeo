#!/usr/bin/env node
'use strict';
/*
 * EEO Agent Swarm Daemon — 企业级智能体节点
 *
 * 每台设备跑一个，全员安装，层级权限分级。
 * 上级可看下级工作记录，下级看不到上级。
 *
 * 三件事：
 *   1. 本机调度：发现并调用这台设备上的其他 AI Agent（Claude/ChatGPT/GLM等），共享额度
 *   2. 工作监控：记录员工通过 Agent 做了什么，自动评分量化
 *   3. 层级汇报：工作摘要定期上报给上级的 Daemon
 *
 * 零依赖 Node.js，与 EEO 仓库同哲学。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

/* ==================== 配置 ==================== */
const CFG = {
  port: parseInt(process.env.SWARM_PORT || '3720', 10),
  dataDir: path.join(__dirname, '..', 'data', 'swarm'),
  // 层级：3=负责人 2=管理员 1=员工
  level: parseInt(process.env.SWARM_LEVEL || '1', 10),
  org: process.env.SWARM_ORG || '',
  name: process.env.SWARM_NAME || '',
  // 上级 Daemon 地址（为空则不上报）
  superior: process.env.SWARM_SUPERIOR || '',
  reportInterval: parseInt(process.env.SWARM_REPORT_SEC || '300', 10) * 1000,
};

fs.mkdirSync(CFG.dataDir, { recursive: true });

/* ==================== 身份 ==================== */
const AGENT_ID = 'agt_' + crypto.randomBytes(4).toString('hex');
const LEVEL_NAME = { 1: '员工', 2: '管理员', 3: '负责人' };
const identity = {
  schema: 'eeo.agent.v1',
  agent_id: AGENT_ID,
  name: CFG.name || `${LEVEL_NAME[CFG.level]} Agent`,
  owner: { type: 'organization', registry_card: CFG.org, verified: false },
  level: CFG.level,
  capabilities: [],
  constraints: {},
  created: new Date().toISOString().slice(0, 10),
  claim: { status: 'unclaimed' },
};

/* ==================== 审计链 ==================== */
const auditFile = path.join(CFG.dataDir, AGENT_ID + '-audit.jsonl');
const auditChain = [];
function auditAppend(event, detail) {
  const e = { ts: new Date().toISOString(), event, detail: detail || {}, prev: auditChain.length ? auditChain[auditChain.length - 1].hash : 'GENESIS' };
  e.hash = crypto.createHash('sha256').update(JSON.stringify(e)).digest('hex');
  auditChain.push(e);
  fs.appendFileSync(auditFile, JSON.stringify(e) + '\n');
  return e.hash;
}
auditAppend('daemon_start', { agent_id: AGENT_ID, level: CFG.level });

/* ==================== 工作记录与评分 ==================== */
const workLog = [];
function logWork(category, summary, metadata) {
  const entry = {
    ts: new Date().toISOString(),
    category, // 查询 / 文档 / 分析 / 优化 / 会议 / 其他
    summary: String(summary || '').slice(0, 200),
    metadata: metadata || {},
    score: null, // 待评分
  };
  workLog.push(entry);
  if (workLog.length > 1000) workLog.splice(0, workLog.length - 800);
  auditAppend('work_log', { category, summary: entry.summary });
  return entry;
}

function scoreWork(entry) {
  // 基于工作量、类别、多样性的简单评分（0-100）
  let score = 20; // 基础分：有产出就有
  // 类别加分：分析类 > 文档类 > 查询类
  const catBonus = { 分析: 30, 优化: 25, 文档: 20, 查询: 10, 会议: 15, 其他: 5 };
  score += catBonus[entry.category] || 5;
  // 长度加分：产出内容越充分越高（上限 20）
  score += Math.min(20, Math.floor(entry.summary.length / 10));
  // 是否调用了工具（说明做了实际工作）
  if (entry.metadata.tools_used) score += 15;
  return Math.min(100, score);
}

function generateReport() {
  const recent = workLog.slice(-50);
  const scored = recent.map((e) => ({ ...e, score: e.score ?? scoreWork(e) }));
  const avgScore = scored.length ? Math.round(scored.reduce((s, e) => s + e.score, 0) / scored.length) : 0;
  const byCategory = {};
  for (const e of scored) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
  return {
    agent_id: AGENT_ID,
    agent_name: identity.name,
    level: CFG.level,
    period: { from: scored[0]?.ts || '', to: scored[scored.length - 1]?.ts || '' },
    total_tasks: scored.length,
    avg_score: avgScore,
    by_category: byCategory,
    tasks: scored.map((e) => ({ ts: e.ts, category: e.category, summary: e.summary.slice(0, 80), score: e.score })),
  };
}

/* ==================== 上级汇报 ==================== */
async function reportToSuperior() {
  if (!CFG.superior) return;
  const report = generateReport();
  try {
    await fetch(CFG.superior + '/api/swarm/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(10000),
    });
    auditAppend('report_sent', { to: CFG.superior, tasks: report.total_tasks, avg_score: report.avg_score });
  } catch (e) {
    auditAppend('report_failed', { to: CFG.superior, error: String(e.message || e).slice(0, 100) });
  }
}
if (CFG.superior && CFG.reportInterval > 0) {
  setInterval(reportToSuperior, CFG.reportInterval);
}

/* ==================== 下级报告接收 ==================== */
const subordinateReports = [];
function receiveReport(report) {
  subordinateReports.push({ received_at: new Date().toISOString(), report });
  if (subordinateReports.length > 500) subordinateReports.splice(0, subordinateReports.length - 400);
  auditAppend('report_received', { from: report.agent_id, tasks: report.total_tasks, avg_score: report.avg_score });
}

/* ==================== 本机 Agent 发现 ==================== */
function discoverLocalAgents() {
  const agents = [];
  // 检查常见 AI Agent 的存在（通过端口/进程/配置文件）
  const checks = [
    { name: 'Claude Desktop', type: 'claude', check: () => fs.existsSync(path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude')) },
    { name: 'OpenAI Codex', type: 'codex', check: () => process.env.OPENAI_API_KEY },
    { name: 'GLM', type: 'glm', check: () => process.env.GLM_API_KEY || fs.existsSync(path.join(CFG.dataDir, '..', 'config.json')) },
    { name: 'DeepSeek', type: 'deepseek', check: () => process.env.DEEPSEEK_API_KEY },
  ];
  for (const c of checks) {
    try { if (c.check()) agents.push({ name: c.name, type: c.type, available: true }); } catch { /* skip */ }
  }
  return agents;
}

/* ==================== 额度共享 ==================== */
const quotaPool = new Map(); // agent_type -> { used, limit }
function getQuota(agentType) {
  if (!quotaPool.has(agentType)) quotaPool.set(agentType, { used: 0, limit: Infinity });
  return quotaPool.get(agentType);
}
function useQuota(agentType, tokens) {
  const q = getQuota(agentType);
  q.used += tokens;
  auditAppend('quota_used', { agent: agentType, tokens, total_used: q.used });
}

/* ==================== HTTP API ==================== */
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    if (req.method === 'GET' && p === '/health') {
      return json(res, 200, { status: 'ok', agent_id: AGENT_ID, level: CFG.level, uptime: Math.round(process.uptime()) });
    }

    if (req.method === 'GET' && p === '/api/swarm/identity') {
      return json(res, 200, { ...identity, local_agents: discoverLocalAgents() });
    }

    // 工作记录（自己或上级查看）
    if (req.method === 'GET' && p === '/api/swarm/work') {
      return json(res, 200, generateReport());
    }

    // 上级查看下级报告（仅 level >= 2）
    if (req.method === 'GET' && p === '/api/swarm/subordinates') {
      if (CFG.level < 2) return json(res, 403, { error: 'insufficient level' });
      return json(res, 200, { count: subordinateReports.length, reports: subordinateReports.slice(-20) });
    }

    // 接收下级报告
    if (req.method === 'POST' && p === '/api/swarm/report') {
      let body = '';
      req.on('data', (c) => body += c);
      req.on('end', () => {
        try {
          const report = JSON.parse(body);
          receiveReport(report);
          return json(res, 200, { received: true });
        } catch { return json(res, 400, { error: 'invalid report' }); }
      });
      return;
    }

    // 添加工作记录
    if (req.method === 'POST' && p === '/api/swarm/work') {
      let body = '';
      req.on('data', (c) => body += c);
      req.on('end', () => {
        try {
          const { category, summary, metadata } = JSON.parse(body);
          const entry = logWork(category || '其他', summary, metadata);
          entry.score = scoreWork(entry);
          return json(res, 200, { logged: true, score: entry.score });
        } catch { return json(res, 400, { error: 'invalid work entry' }); }
      });
      return;
    }

    // 审计查询
    if (req.method === 'GET' && p === '/api/swarm/audit') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      return json(res, 200, { total: auditChain.length, recent: auditChain.slice(-limit) });
    }

    // 本机 Agent 列表
    if (req.method === 'GET' && p === '/api/swarm/agents') {
      return json(res, 200, { agents: discoverLocalAgents() });
    }

    // 手动触发上报
    if (req.method === 'POST' && p === '/api/swarm/report-now') {
      await reportToSuperior();
      return json(res, 200, { triggered: true });
    }

    // 静态文件（Swarm Web UI）
    if (req.method === 'GET') {
      const webDir = path.join(__dirname, 'web', 'dist');
      let fp = p === '/' ? path.join(webDir, 'index.html') : path.join(webDir, p);
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        const ext = path.extname(fp);
        const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
        res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
        return res.end(fs.readFileSync(fp));
      }
      const idx = path.join(webDir, 'index.html');
      if (fs.existsSync(idx)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(idx));
      }
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(CFG.port, () => {
  console.log(`[EEO Swarm] ${identity.name} (${AGENT_ID})`);
  console.log(`  端口: ${CFG.port}  层级: ${LEVEL_NAME[CFG.level]}`);
  console.log(`  上级: ${CFG.superior || '无（未配置上报）'}`);
  console.log(`  本机 Agent: ${discoverLocalAgents().map((a) => a.name).join(', ') || '未发现'}`);
});
