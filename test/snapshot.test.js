'use strict';
/* snapshot.test.js — 面板测量内核的单元测试（node:test，零依赖）
 * 覆盖：Wilson 区间、Cohen's kappa、Bradley-Terry、面板确定性、
 * 打分器在夹具快照上的确定性与指标正确性。 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { wilsonCI, cohenKappa, bradleyTerry, stableStringify } = require('../lib/stats.cjs');
const { buildPanel } = require('../tools/panel-build.cjs');
const { parseStances } = require('../lib/judge.cjs');
const { scoreSnapshot } = require('../tools/score-snapshot.cjs');

test('wilson 区间：完全一致时收窄，小样本时放宽', () => {
  const [lo1, hi1] = wilsonCI(10, 10);
  const [lo2, hi2] = wilsonCI(100, 100);
  assert.ok(hi1 <= 1 && lo1 > 0.7);
  assert.ok(lo2 > lo1, '更大样本同比例区间应更窄');
});

test('wilson 区间：零提及下界为 0', () => {
  const [lo] = wilsonCI(0, 50);
  assert.strictEqual(lo, 0);
});

test('cohen kappa：完全一致为 1，独立时为 0，完全反向为 -1', () => {
  assert.ok(Math.abs(cohenKappa(['a', 'a', 'b'], ['a', 'a', 'b']) - 1) < 1e-12);
  assert.ok(Math.abs(cohenKappa(['a', 'a', 'b', 'b'], ['a', 'b', 'a', 'b'])) < 1e-12);
  assert.ok(Math.abs(cohenKappa(['a', 'b', 'a', 'b'], ['b', 'a', 'b', 'a']) + 1) < 1e-12);
});

test('bradley-terry：常胜者强度最高，对称样本强度相等', () => {
  const ids = ['A', 'B', 'C'];
  const wins = [
    [0, 10, 10],
    [0, 0, 10],
    [0, 0, 0],
  ];
  const r = bradleyTerry(ids, wins);
  assert.strictEqual(r[0].id, 'A');
  assert.ok(r[0].strength > r[1].strength && r[1].strength > r[2].strength);
  const sym = bradleyTerry(['X', 'Y'], [[0, 5], [5, 0]]);
  assert.ok(Math.abs(sym[0].strength - sym[1].strength) < 1e-6);
});

test('面板构建：同参数字节确定，改写模板内容等价', () => {
  const a = buildPanel({ industry: '餐饮', category: '奶茶', brands: ['蜜雪冰城', '喜茶', '奈雪'] });
  const b = buildPanel({ industry: '餐饮', category: '奶茶', brands: ['蜜雪冰城', '喜茶', '奈雪'] });
  assert.strictEqual(stableStringify(a), stableStringify(b));
  assert.strictEqual(a.hash, b.hash);
  assert.ok(a.questions.every((q) => q.paraphrases.length >= 3));
});

test('judge 解析：五档立场 JSON 提取', () => {
  const out = parseStances('前置说明 [{"brand":"蜜雪冰城","stance":"RECOMMENDED"},{"brand":"喜茶","stance":"ABSENT"}]', ['蜜雪冰城', '喜茶']);
  assert.strictEqual(out.get('蜜雪冰城'), 'RECOMMENDED');
  assert.strictEqual(out.get('喜茶'), 'ABSENT');
  assert.strictEqual(parseStances('完全不是 JSON', ['a']), null);
});

/* 夹具快照：3 开放题 × 4 改写 × 2 样本 × 1 引擎 + 3 对比题，手工构造 */
function fixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eeo-snap-'));
  const brands = ['甲品牌', '乙品牌', '丙品牌'];
  const answers = [];
  const paras = 4;
  // 开放题：甲在 4/4 改写组被提及（稳健），乙 2/4（不稳健），丙 0/4
  for (let q = 0; q < 3; q++) {
    for (let p = 0; p < paras; p++) {
      for (let s = 0; s < 2; s++) {
        let ans = '这个问题我觉得要看需求。';
        if (p < 4) ans += '甲品牌是常见选择。';
        if (p < 2 && q === 0) ans += '乙品牌也有人提。';
        answers.push({ qid: `open-${q}`, kind: 'open', para: p, sample: s, engine: 'mock', question: `q${q}p${p}`, brands, answer: ans, ts: '2026-10-06T00:00:00Z' });
      }
    }
  }
  // 对比题：甲胜乙 4 次，乙胜丙 3 次
  const pairRows = [
    ['甲品牌', '乙品牌', '推荐甲品牌，门店多。'],
    ['甲品牌', '乙品牌', '我会选甲品牌。'],
    ['甲品牌', '乙品牌', '甲品牌性价比高。'],
    ['甲品牌', '乙品牌', '这俩里甲品牌更稳。'],
    ['乙品牌', '丙品牌', '乙品牌更好一点。'],
    ['乙品牌', '丙品牌', '选乙品牌。'],
    ['乙品牌', '丙品牌', '乙品牌口碑好些。'],
  ];
  pairRows.forEach(([a, b, ans], i) => {
    answers.push({ qid: `pair-${String(i).padStart(2, '0')}`, kind: 'pairwise', para: 0, sample: 0, engine: 'mock', question: '对比', brands: [a, b], answer: ans, ts: '2026-10-06T00:00:00Z' });
  });
  fs.writeFileSync(path.join(dir, 'answers.jsonl'), answers.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ schema: 'eeo.snapshot.v1', panel: { id: 'panel-x-v1', hash: 'abc123', file: 'x.json' }, engines: [{ id: 'mock' }] }));
  return dir;
}

test('打分器：指标正确且字节级确定', () => {
  const dir = fixtureDir();
  const s1 = scoreSnapshot(dir);
  const s2 = scoreSnapshot(dir);
  assert.strictEqual(stableStringify(s1), stableStringify(s2), '同一快照重算必须字节一致');
  const jia = s1.brands.find((b) => b.brand === '甲品牌');
  const yi = s1.brands.find((b) => b.brand === '乙品牌');
  const bing = s1.brands.find((b) => b.brand === '丙品牌');
  assert.strictEqual(jia.robust_visibility, 1, '甲在全部改写组被提及，稳健可见率应为 1');
  assert.strictEqual(yi.robust_visibility, 0, '乙只在一个题的部分改写组出现，不应稳健');
  assert.strictEqual(bing.mention_share, 0);
  assert.strictEqual(s1.pairwise_ranking[0].brand, '甲品牌');
  assert.ok(jia.sensitivity <= yi.sensitivity, '乙的措辞敏感度不低于甲');
  assert.strictEqual(s1.robust_threshold_k, 3, '4 组改写的 70% 阈值 = 3');
});
