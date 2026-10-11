#!/usr/bin/env node
'use strict';
/*
 * EEO Tools API — 供 Dify / n8n / 任何 OpenAPI 兼容平台调用的工具服务
 *
 * 零依赖 Node.js，REST API，API Key 认证。
 * 企业部署 Dify 后导入 dify-schema.yaml 即可让 Agent 使用以下工具。
 *
 * 端点：
 *   GET /health
 *   GET /api/v1/brand/lookup?name=xxx       品牌查询（154 万注册表）
 *   GET /api/v1/brand/visibility?brand=xxx   品牌可见性快照
 *   GET /api/v1/audit?limit=50               审计链查询
 *   GET /api/v1/agent/identity               当前 Agent 身份卡
 *
 * 环境变量：
 *   PORT=3700           端口
 *   API_KEYS=key1,key2   API Key 白名单（逗号分隔，空=无需认证）
 *   AGENT_NAME=...       Agent 显示名
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const CFG = {
  port: parseInt(process.env.PORT || '3700', 10),
  apiKeys: (process.env.API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean),
  agentName: process.env.AGENT_NAME || 'EEO Agent',
  registryDir: process.env.EEO_REGISTRY_DIR || path.join(__dirname, '..', '..', 'datasets', 'registry'),
  snapshotDir: path.join(__dirname, '..', '..', 'snapshots'),
};

/* ==================== 身份卡 ==================== */
const AGENT_ID = 'agt_' + crypto.randomBytes(4).toString('hex');
const identityCard = {
  schema: 'eeo.agent.v1',
  agent_id: AGENT_ID,
  name: CFG.agentName,
  owner: { type: 'individual', verified: false },
  capabilities: ['brand_lookup', 'brand_visibility', 'audit_query'],
  constraints: { rate_limit: 100 },
  created: new Date().toISOString().slice(0, 10),
  claim: { status: 'unclaimed' },
};

/* ==================== 审计链 ==================== */
const auditFile = path.join(__dirname, '..', 'data', 'tools-audit.jsonl');
fs.mkdirSync(path.dirname(auditFile), { recursive: true });
const auditChain = [];
if (fs.existsSync(auditFile)) {
  for (const l of fs.readFileSync(auditFile, 'utf8').split('\n')) {
    if (l.trim()) auditChain.push(JSON.parse(l));
  }
}
function auditAppend(event, detail) {
  const e = { ts: new Date().toISOString(), event, detail: detail || {}, prev: auditChain.length ? auditChain[auditChain.length - 1].hash : 'GENESIS' };
  e.hash = crypto.createHash('sha256').update(JSON.stringify(e)).digest('hex');
  auditChain.push(e);
  fs.appendFileSync(auditFile, JSON.stringify(e) + '\n');
}
auditAppend('server_start', { agent_id: AGENT_ID, tools: identityCard.capabilities });

/* ==================== 品牌查询 ==================== */
let registryCache = null;
function loadRegistry() {
  if (registryCache) return registryCache;
  const dir = CFG.registryDir;
  if (!fs.existsSync(dir)) return null;
  const file = path.join(dir, 'part-0000.jsonl');
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  registryCache = lines.slice(0, 100000).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  return registryCache;
}

function brandLookup(name) {
  const reg = loadRegistry();
  if (!reg) return { error: 'registry not loaded. Run node tools/fetch-registry.cjs first.' };
  const q = String(name || '').toLowerCase();
  const hits = [];
  for (const c of reg) {
    if (c.name && c.name.toLowerCase().includes(q)) {
      hits.push({
        name: c.name,
        country: c.country || '',
        industry: c.industry || '',
        website: c.website || '',
        description: (c.description || '').slice(0, 120),
        has_lei: !!(c.reg && c.reg.lei),
        claim_status: c.claim ? c.claim.status : 'unclaimed',
      });
      if (hits.length >= 5) break;
    }
  }
  return hits.length ? { results: hits, total_shown: hits.length } : { results: [], message: `no match for "${name}"` };
}

/* ==================== 可见性查询 ==================== */
function brandVisibility(brand) {
  if (!fs.existsSync(CFG.snapshotDir)) return { error: 'no snapshots published' };
  const dirs = fs.readdirSync(CFG.snapshotDir).filter((d) => fs.statSync(path.join(CFG.snapshotDir, d)).isDirectory());
  if (!dirs.length) return { error: 'no snapshots published' };
  const snapDir = path.join(CFG.snapshotDir, dirs[0]);
  const scoresFile = path.join(snapDir, 'scores.json');
  if (!fs.existsSync(scoresFile)) return { error: 'no scores in snapshot' };
  const scores = JSON.parse(fs.readFileSync(scoresFile, 'utf8'));
  const match = scores.brands ? scores.brands.find((b) => b.brand.includes(brand) || brand.includes(b.brand)) : null;
  return {
    snapshot: scores.snapshot,
    panel: scores.panel,
    engines: scores.engines,
    brand: match ? match.brand : brand,
    found: !!match,
    metrics: match || { message: 'brand not in this snapshot' },
  };
}

/* ==================== HTTP 服务 ==================== */
function json(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // 认证
  if (CFG.apiKeys.length) {
    const key = req.headers['x-api-key'] || url.searchParams.get('api_key') || '';
    if (!CFG.apiKeys.includes(key)) return json(res, 401, { error: 'invalid API key' });
  }

  try {
    if (req.method === 'GET' && p === '/health') {
      return json(res, 200, { status: 'ok', agent: CFG.agentName, version: '1.0.0', uptime: Math.round(process.uptime()) });
    }

    if (req.method === 'GET' && p === '/api/v1/brand/lookup') {
      const name = url.searchParams.get('name') || '';
      if (!name) return json(res, 400, { error: 'name parameter required' });
      const result = brandLookup(name);
      auditAppend('tool_call', { tool: 'brand_lookup', query: name, results: result.results ? result.results.length : 0 });
      return json(res, 200, result);
    }

    if (req.method === 'GET' && p === '/api/v1/brand/visibility') {
      const brand = url.searchParams.get('brand') || '';
      if (!brand) return json(res, 400, { error: 'brand parameter required' });
      const result = brandVisibility(brand);
      auditAppend('tool_call', { tool: 'brand_visibility', query: brand });
      return json(res, 200, result);
    }

    if (req.method === 'GET' && p === '/api/v1/audit') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const recent = auditChain.slice(-Math.min(limit, 200));
      auditAppend('tool_call', { tool: 'audit_query', limit });
      return json(res, 200, { total: auditChain.length, recent });
    }

    if (req.method === 'GET' && p === '/api/v1/agent/identity') {
      return json(res, 200, identityCard);
    }

    return json(res, 404, { error: 'not found', available: ['/health', '/api/v1/brand/lookup', '/api/v1/brand/visibility', '/api/v1/audit', '/api/v1/agent/identity'] });
  } catch (e) {
    auditAppend('server_error', { path: p, error: String(e.message || e).slice(0, 200) });
    return json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(CFG.port, () => {
  console.log(`[EEO Tools API] ${CFG.agentName} on http://localhost:${CFG.port}`);
  console.log(`  Agent ID: ${AGENT_ID}`);
  console.log(`  Auth: ${CFG.apiKeys.length ? 'API key required' : 'open'}`);
  console.log(`  Tools: brand_lookup, brand_visibility, audit_query, agent_identity`);
  console.log(`  Schema: import protocol/tools/dify-schema.yaml into Dify`);
});
