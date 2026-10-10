#!/usr/bin/env node
'use strict';
/*
 * EEO Protocol Reference Implementation — Agent Runtime
 *
 * 零依赖 Node.js，与仓库其余部分同哲学。
 *
 * 一个可部署的企业级 Agent 需要四件事：
 *   1. 身份（Agent Identity Card，注册进 EEO 注册表）
 *   2. 能力（Capability Manifest，声明能做什么、需要什么数据）
 *   3. 执行（Tool Runner，按 MCP 兼容协议调用外部工具/API）
 *   4. 审计（Audit Chain，每次交互追加哈希链记录）
 *
 * 本文件是四件事的最小完整实现，可直接部署。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ==================== Agent Identity ==================== */

class AgentIdentity {
  constructor(card) {
    if (!card || card.schema !== 'eeo.agent.v1') throw new Error('invalid card schema');
    if (!card.agent_id || !card.name) throw new Error('card missing agent_id or name');
    this.card = card;
  }

  static generate(name, ownerOrgQid) {
    const id = 'agt_' + crypto.randomBytes(4).toString('hex');
    return new AgentIdentity({
      schema: 'eeo.agent.v1',
      agent_id: id,
      name,
      owner: { type: ownerOrgQid ? 'organization' : 'individual', registry_card: ownerOrgQid || '', verified: false },
      capabilities: [],
      constraints: { data_access: [], rate_limit: 100 },
      public_key: crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString().trim(),
      created: new Date().toISOString().slice(0, 10),
      claim: { status: 'unclaimed' },
    });
  }

  addCapability(cap) {
    if (!this.card.capabilities.includes(cap)) this.card.capabilities.push(cap);
  }

  toJSON() { return { ...this.card }; }
}

/* ==================== Capability Manifest ==================== */

class CapabilityManifest {
  constructor() {
    this.tools = new Map();
  }

  /** 注册一个工具：名称、描述、参数 schema、执行函数 */
  register(name, description, paramSchema, handler) {
    this.tools.set(name, { name, description, paramSchema, handler });
  }

  /** 输出 MCP 兼容的 tools/list */
  toMCPList() {
    return [...this.tools.values()].map(({ name, description, paramSchema }) => ({
      name, description, inputSchema: paramSchema,
    }));
  }

  /** 验证参数 */
  validate(toolName, params) {
    const tool = this.tools.get(toolName);
    if (!tool) return { ok: false, error: `unknown tool: ${toolName}` };
    const schema = tool.paramSchema;
    for (const [key, rule] of Object.entries(schema.properties || {})) {
      if (schema.required && schema.required.includes(key) && (params[key] === undefined || params[key] === null)) {
        return { ok: false, error: `missing required parameter: ${key}` };
      }
      if (params[key] !== undefined && rule.type) {
        const t = Array.isArray(params[key]) ? 'array' : typeof params[key];
        if (t !== rule.type) return { ok: false, error: `${key}: expected ${rule.type}, got ${t}` };
      }
    }
    return { ok: true };
  }
}

/* ==================== Audit Chain ==================== */

class AuditChain {
  constructor(file) {
    this.file = file;
    this.chain = [];
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (line.trim()) this.chain.push(JSON.parse(line));
      }
    }
  }

  _prevHash() {
    return this.chain.length ? this.chain[this.chain.length - 1].hash : 'GENESIS';
  }

  /** 追加一条审计记录（不可篡改：哈希链接到前一条） */
  append(event, detail) {
    const entry = {
      ts: new Date().toISOString(),
      event,
      detail: detail || {},
      prev: this._prevHash(),
    };
    entry.hash = crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex');
    this.chain.push(entry);
    fs.appendFileSync(this.file, JSON.stringify(entry) + '\n');
    return entry.hash;
  }

  /** 验证链条完整性 */
  verify() {
    for (let i = 0; i < this.chain.length; i++) {
      const e = this.chain[i];
      const prev = i === 0 ? 'GENESIS' : this.chain[i - 1].hash;
      if (e.prev !== prev) return { ok: false, broken_at: i, reason: 'prev hash mismatch' };
      const { hash, ...rest } = e;
      const expected = crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
      if (hash !== expected) return { ok: false, broken_at: i, reason: 'entry hash mismatch' };
    }
    return { ok: true, length: this.chain.length };
  }

  /** 查询审计记录 */
  query(filter) {
    return this.chain.filter((e) => {
      for (const [k, v] of Object.entries(filter)) {
        if (e.event === k || (e.detail[k] !== undefined && e.detail[k] === v)) continue;
        return false;
      }
      return true;
    });
  }
}

/* ==================== Agent Runtime ==================== */

class Agent {
  constructor(identity, manifest, auditFile) {
    this.identity = identity;
    this.manifest = manifest;
    this.audit = new AuditChain(auditFile);
    this.concurrency = 0;
    this.maxConcurrency = identity.card.constraints.rate_limit || 100;
    this.audit.append('agent_start', { agent_id: identity.card.agent_id, capabilities: identity.card.capabilities });
  }

  /** MCP tools/list */
  listTools() { return this.manifest.toMCPList(); }

  /** MCP tools/call（带参数验证、审计记录、限流） */
  async call(toolName, params) {
    const auditEntry = { tool: toolName, params_keys: Object.keys(params || {}) };

    if (this.concurrency >= this.maxConcurrency) {
      this.audit.append('rate_limited', auditEntry);
      return { error: 'rate limit exceeded' };
    }

    const validation = this.manifest.validate(toolName, params);
    if (!validation.ok) {
      this.audit.append('validation_failed', { ...auditEntry, error: validation.error });
      return { error: validation.error };
    }

    this.concurrency++;
    try {
      this.audit.append('tool_call', auditEntry);
      const result = await this.manifest.tools.get(toolName).handler(params || {});
      this.audit.append('tool_result', { ...auditEntry, success: true });
      return { result };
    } catch (e) {
      this.audit.append('tool_error', { ...auditEntry, error: String(e.message || e).slice(0, 200) });
      return { error: String(e.message || e) };
    } finally {
      this.concurrency--;
    }
  }

  /** 身份卡导出（注册用） */
  exportIdentity() { return this.identity.toJSON(); }

  /** 审计报告 */
  auditReport() {
    const v = this.audit.verify();
    const events = {};
    for (const e of this.audit.chain) events[e.event] = (events[e.event] || 0) + 1;
    return { chain_valid: v.ok, total_entries: this.audit.chain.length, event_summary: events };
  }
}

/* ==================== MCP Server (stdio) ==================== */

function startMCPServer(agent) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      handleMCP(agent, line);
    }
  });
}

async function handleMCP(agent, line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  let result;

  switch (method) {
    case 'initialize':
      result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: agent.identity.card.name, version: '1.0.0' } };
      break;
    case 'tools/list':
      result = { tools: agent.listTools() };
      break;
    case 'tools/call':
      result = await agent.call(params.name, params.arguments);
      break;
    case 'resources/list':
      result = { resources: [{ uri: `eeo://agents/${agent.identity.card.agent_id}`, mimeType: 'application/json', name: 'Agent Identity Card' }] };
      break;
    case 'resources/read':
      if (params.uri === `eeo://agents/${agent.identity.card.agent_id}`) {
        result = { contents: [{ uri: params.uri, mimeType: 'application/json', text: JSON.stringify(agent.exportIdentity()) }] };
      } else {
        result = { error: 'resource not found' };
      }
      break;
    default:
      result = { error: `unknown method: ${method}` };
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

/* ==================== CLI ==================== */

const help = () => {
  console.log(`EEO Protocol Agent Runtime
Usage: node agent.cjs <command>

Commands:
  init <name> [org_qid]   Create a new agent identity card
  serve                   Start agent as MCP server (stdio)
  audit                   Show audit report
  identity                Print identity card as JSON
`);
};

if (require.main === module) {
  const cmd = process.argv[2];
  const dataDir = path.join(__dirname, '..', '..', 'data', 'agents');
  fs.mkdirSync(dataDir, { recursive: true });

  if (cmd === 'init') {
    const name = process.argv[3];
    if (!name) { console.error('agent name required'); process.exit(1); }
    const orgQid = process.argv[4] || '';
    const identity = AgentIdentity.generate(name, orgQid);
    const cardFile = path.join(dataDir, identity.card.agent_id + '.json');
    fs.writeFileSync(cardFile, JSON.stringify(identity.toJSON(), null, 2));
    console.log(`agent created: ${identity.card.agent_id}`);
    console.log(`identity card: ${cardFile}`);
    process.exit(0);
  }

  // 其余命令需要已有身份卡
  const cardFiles = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((f) => f.endsWith('.json')) : [];
  if (!cardFiles.length) { console.error('no agent found. Run: node agent.cjs init <name>'); process.exit(1); }
  const card = JSON.parse(fs.readFileSync(path.join(dataDir, cardFiles[0]), 'utf8'));
  const identity = new AgentIdentity(card);
  const manifest = new CapabilityManifest();
  const auditFile = path.join(dataDir, identity.card.agent_id + '-audit.jsonl');
  const agent = new Agent(identity, manifest, auditFile);

  // 注册默认工具（企业常用示例）
  manifest.register(
    'web_search', 'Search the web for information',
    { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
    async (params) => {
      const r = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(params.query)}&per_page=3`, {
        headers: { 'User-Agent': 'EEO-Agent/1.0' }, signal: AbortSignal.timeout(15000),
      });
      const d = await r.json();
      return (d.items || []).map((x) => ({ name: x.full_name, description: (x.description || '').slice(0, 100), stars: x.stargazers_count }));
    }
  );

  manifest.register(
    'brand_lookup', 'Look up a brand in the EEO registry',
    { type: 'object', properties: { name: { type: 'string', description: 'Brand name to search' } }, required: ['name'] },
    async (params) => {
      const idxFile = path.join(dataDir, '..', 'brand-index-p0.json');
      if (!fs.existsSync(idxFile)) return { error: 'registry index not found. Run node tools/fetch-registry.cjs first.' };
      const idx = JSON.parse(fs.readFileSync(idxFile, 'utf8').slice(0, 5000000));
      const q = params.name.toLowerCase();
      const hits = (idx.b || []).filter((o) => (o.n || '').toLowerCase().includes(q)).slice(0, 5);
      return hits.map((o) => ({ name: o.n, country: o.co != null ? (idx.countries || [])[o.co] : '', has_website: !!o.w }));
    }
  );

  if (cmd === 'serve') {
    startMCPServer(agent);
  } else if (cmd === 'audit') {
    console.log(JSON.stringify(agent.auditReport(), null, 2));
  } else if (cmd === 'identity') {
    console.log(JSON.stringify(agent.exportIdentity(), null, 2));
  } else if (cmd === 'test') {
    (async () => {
      console.log('testing tools...');
      const r1 = await agent.call('brand_lookup', { name: '腾讯' });
      console.log('brand_lookup:', JSON.stringify(r1.result || r1.error));
      const r2 = await agent.call('web_search', { query: 'MCP protocol' });
      console.log('web_search:', JSON.stringify(r2.result || r2.error));
      console.log('audit:', JSON.stringify(agent.auditReport()));
    })();
  } else {
    help();
  }
}

module.exports = { AgentIdentity, CapabilityManifest, AuditChain, Agent, startMCPServer };
