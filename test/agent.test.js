'use strict';
/* agent.test.js — EEO Protocol Agent Runtime 单元测试 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AgentIdentity, CapabilityManifest, AuditChain, Agent } = require('../protocol/reference/agent.cjs');

test('identity: generate creates valid eeo.agent.v1 card', () => {
  const id = AgentIdentity.generate('Test Agent', 'Q123');
  assert.strictEqual(id.card.schema, 'eeo.agent.v1');
  assert.ok(id.card.agent_id.startsWith('agt_'));
  assert.strictEqual(id.card.owner.type, 'organization');
  assert.ok(id.card.public_key.includes('BEGIN PUBLIC KEY'));
});

test('identity: invalid schema rejected', () => {
  assert.throws(() => new AgentIdentity({ schema: 'wrong' }), /invalid card schema/);
  assert.throws(() => new AgentIdentity(null), /invalid card schema/);
});

test('manifest: register and list tools (MCP format)', () => {
  const m = new CapabilityManifest();
  m.register('echo', 'Echo input', { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, async (p) => p.text);
  const list = m.toMCPList();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, 'echo');
  assert.ok(list[0].inputSchema);
});

test('manifest: validate catches missing required and wrong type', () => {
  const m = new CapabilityManifest();
  m.register('calc', 'Calculate', { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] }, async (p) => p.n);
  assert.strictEqual(m.validate('calc', {}).ok, false);
  assert.strictEqual(m.validate('calc', { n: 'str' }).ok, false);
  assert.strictEqual(m.validate('calc', { n: 42 }).ok, true);
  assert.strictEqual(m.validate('nonexistent', {}).ok, false);
});

test('audit: chain grows and verifies', () => {
  const tmp = path.join(os.tmpdir(), 'eeo-audit-test.jsonl');
  const chain = new AuditChain(tmp);
  chain.append('test_event', { foo: 'bar' });
  chain.append('another_event', { baz: 1 });
  const v = chain.verify();
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.length, 2);
  fs.unlinkSync(tmp);
});

test('audit: tampered entry detected', () => {
  const tmp = path.join(os.tmpdir(), 'eeo-audit-tamper.jsonl');
  const chain = new AuditChain(tmp);
  chain.append('event1', {});
  chain.append('event2', {});
  // 篡改第一条的 detail
  chain.chain[0].detail = { hacked: true };
  const v = chain.verify();
  assert.strictEqual(v.ok, false);
  fs.unlinkSync(tmp);
});

test('agent: full lifecycle (call tool, audit, rate limit)', async () => {
  const tmp = path.join(os.tmpdir(), 'eeo-agent-test');
  fs.mkdirSync(tmp, { recursive: true });
  const id = AgentIdentity.generate('Lifecycle Agent');
  id.addCapability('echo');
  const manifest = new CapabilityManifest();
  manifest.register('echo', 'Echo', { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, async (p) => p.text);
  const agent = new Agent(id, manifest, path.join(tmp, 'audit.jsonl'));

  // 正常调用
  const r = await agent.call('echo', { text: 'hello' });
  assert.strictEqual(r.result, 'hello');

  // 参数缺失
  const r2 = await agent.call('echo', {});
  assert.ok(r2.error.includes('missing required'));

  // 未知工具
  const r3 = await agent.call('nope', {});
  assert.ok(r3.error.includes('unknown tool'));

  // 审计报告
  const report = agent.auditReport();
  assert.strictEqual(report.chain_valid, true);
  assert.ok(report.total_entries >= 4); // start + call + result + validation_failed + tool_error

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('agent: rate limit enforced', async () => {
  const tmp = path.join(os.tmpdir(), 'eeo-agent-ratelimit');
  fs.mkdirSync(tmp, { recursive: true });
  const id = AgentIdentity.generate('RateLimit Agent');
  id.card.constraints.rate_limit = 1;
  const manifest = new CapabilityManifest();
  manifest.register('slow', 'Slow tool', { type: 'object', properties: {} }, () => new Promise((s) => setTimeout(() => s('done'), 50)));
  const agent = new Agent(id, manifest, path.join(tmp, 'audit.jsonl'));

  const p1 = agent.call('slow', {});
  const r2 = await agent.call('slow', {});
  assert.ok(r2.error.includes('rate limit'));
  const r1 = await p1;
  assert.strictEqual(r1.result, 'done');

  fs.rmSync(tmp, { recursive: true, force: true });
});
