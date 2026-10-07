#!/usr/bin/env node
'use strict';
/*
 * score-snapshot.cjs — 冻结语料打分器：可复现性的核心
 *
 * 只读快照目录（answers.jsonl + judge-cache.jsonl + manifest.json），
 * 不发起任何网络请求。同一快照重跑本文件，scores.json 字节级一致。
 *
 * 输出指标（对每个品牌）：
 *   mention_share / mention_ci      提及份额 + Wilson 95% 区间
 *   recommendation_share            推荐份额（仅 judge 缓存存在时）
 *   robust_visibility               改写集成稳健可见率：开放题各组改写中
 *                                   ≥k 组被提及的比例（k = ceil(组数×0.7)）
 *   sensitivity                     提及对措辞的敏感度（各组提及率的极差）
 *   pairwise_strength / se          两两对比 Bradley-Terry 强度 ± 标准误
 *   judges_kappa                    双裁判一致性（有双裁判缓存时）
 *
 * 用法：
 *   node tools/score-snapshot.cjs snapshots/<目录>            # 正则模式
 *   node tools/score-snapshot.cjs snapshots/<目录> --refresh  # 输出前重写 report
 */
const fs = require('fs');
const path = require('path');
const { coreWord } = require('../core.cjs');
const { wilsonCI, bradleyTerry, stableStringify } = require('../lib/stats.cjs');
const { loadCache, judgesKappa, hashAnswer } = require('../lib/judge.cjs');

function mentionsIn(answer, brand) {
  if (!answer) return false;
  const words = coreWord(brand);
  return words.some((w) => w && answer.includes(w));
}

function scoreSnapshot(dir) {
  const answersPath = path.join(dir, 'answers.jsonl');
  if (!fs.existsSync(answersPath)) throw new Error('快照缺 answers.jsonl：' + dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const rows = fs.readFileSync(answersPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const judgeCache = fs.existsSync(path.join(dir, 'judge-cache.jsonl')) ? loadCache(dir) : null;
  const hasJudge = judgeCache && judgeCache.size > 0;

  const brands = [...new Set(rows.flatMap((r) => r.brands || []))];
  const brandSet = new Map(brands.map((b) => [b, { mention: 0, rec: 0, judgeN: 0, paraGroups: new Map() }]));

  // 开放题：按 (qid, para) 分组统计提及与改写稳健性
  const groups = new Map(); // qid -> Map(para -> {n, mentioned:Set<brand>})
  let openN = 0;
  for (const r of rows) {
    if (r.kind !== 'open') continue;
    openN++;
    if (!groups.has(r.qid)) groups.set(r.qid, new Map());
    if (!groups.get(r.qid).has(r.para)) groups.get(r.qid).set(r.para, { n: 0, mentioned: new Set() });
    const g = groups.get(r.qid).get(r.para);
    g.n++;
    let stanceByBrand = null;
    if (hasJudge) {
      const verdicts = judgeCache.get(hashAnswer(r.answer, r.brands));
      const valid = (verdicts || []).filter((v) => v && v.stances);
      if (valid.length) {
        stanceByBrand = {};
        for (const b of r.brands) {
          const vs = valid.map((v) => v.stances[b]).filter(Boolean);
          stanceByBrand[b] = vs.length && vs.every((x) => x === vs[0]) ? vs[0] : 'DISPUTED';
        }
      }
    }
    for (const b of r.brands) {
      const hit = mentionsIn(r.answer, b);
      if (hit) { g.mentioned.add(b); brandSet.get(b).mention++; }
      if (stanceByBrand) {
        brandSet.get(b).judgeN++;
        if (stanceByBrand[b] === 'RECOMMENDED') brandSet.get(b).rec++;
      }
    }
  }
  const groupCount = groups.size ? [...groups.values()][0].size : 0;
  const k = Math.ceil(groupCount * 0.7);

  // 两两对比：正则先判（回答含 A 不含 B 记 A 胜），judge 可用时以 RECOMMENDED 优先
  const ids = brands;
  const wins = brands.map(() => brands.map(() => 0));
  for (const r of rows) {
    if (r.kind !== 'pairwise' || !r.answer) continue;
    const [a, b] = r.brands;
    const ma = mentionsIn(r.answer, a), mb = mentionsIn(r.answer, b);
    if (ma && !mb) wins[ids.indexOf(a)][ids.indexOf(b)]++;
    else if (mb && !ma) wins[ids.indexOf(b)][ids.indexOf(a)]++;
  }
  const bt = bradleyTerry(ids, wins);

  const perBrand = brands.map((b) => {
    const st = brandSet.get(b);
    const [mlo, mhi] = wilsonCI(st.mention, openN);
    const robustGroups = [...groups.values()].filter((g) => {
      let hit = 0;
      for (const grp of g.values()) if (grp.mentioned.has(b)) hit++;
      return hit >= k;
    }).length;
    // 措辞敏感度 = 同一道题内不同改写之间的提及极差，按题取均值。
    // 度量的是"换个问法可见性是否就变"，不是题目之间的差异。
    const perQ = [...groups.values()].map((g) => {
      const paraHit = [...g.values()].map((grp) => (grp.mentioned.has(b) ? 1 : 0));
      return paraHit.length ? Math.max(...paraHit) - Math.min(...paraHit) : 0;
    });
    const sens = perQ.length ? perQ.reduce((x, y) => x + y, 0) / perQ.length : 0;
    const btRow = bt.find((x) => x.id === b);
    return {
      brand: b,
      mention_share: openN ? +(st.mention / openN).toFixed(4) : 0,
      mention_ci95: [+(mlo).toFixed(4), +(mhi).toFixed(4)],
      recommendation_share: st.judgeN ? +(st.rec / st.judgeN).toFixed(4) : null,
      robust_visibility: groups.size ? +(robustGroups / groups.size).toFixed(4) : 0,
      sensitivity: +sens.toFixed(4),
      pairwise_strength: btRow ? +btRow.strength.toFixed(4) : null,
      pairwise_se: btRow && btRow.se ? +btRow.se.toFixed(4) : null,
    };
  });

  const out = {
    schema: 'eeo.snapshot-scores.v1',
    snapshot: path.basename(dir),
    panel: manifest.panel,
    engines: manifest.engines.map((e) => e.id),
    open_samples: openN,
    paraphrase_groups_per_question: groupCount,
    robust_threshold_k: k,
    judges_kappa: judgeCache ? judgesKappa(judgeCache) : null,
    brands: perBrand,
    pairwise_ranking: bt.map((x) => ({ brand: x.id, strength: +x.strength.toFixed(4), se: x.se ? +x.se.toFixed(4) : 0 })),
    method_note: '打分只在冻结语料上运行（零网络请求）；同一快照重算本文件输出字节一致。单次快照是观察不是结论：跨快照对比请看区间与趋势。',
  };
  return out;
}

function renderReport(s) {
  const L = [];
  L.push(`# 快照打分报告：${s.snapshot}`);
  L.push('');
  L.push(`面板 ${s.panel.id}（哈希 ${s.panel.hash}）　引擎 ${s.engines.join('、')}　开放题样本 ${s.open_samples}　每题改写组 ${s.paraphrase_groups_per_question}（稳健阈值 ≥${s.robust_threshold_k} 组）`);
  if (s.judges_kappa !== null) L.push(`双裁判一致性 kappa = ${s.judges_kappa == null ? 'n/a' : s.judges_kappa.toFixed(3)}`);
  L.push('');
  L.push('| 品牌 | 提及份额 | 95%区间 | 稳健可见率 | 措辞敏感度 | 对比强度±SE |');
  L.push('|---|---|---|---|---|---|');
  for (const b of s.brands) {
    L.push(`| ${b.brand} | ${(b.mention_share * 100).toFixed(1)}% | ${(b.mention_ci95[0] * 100).toFixed(1)}–${(b.mention_ci95[1] * 100).toFixed(1)}% | ${(b.robust_visibility * 100).toFixed(0)}% | ${(b.sensitivity * 100).toFixed(0)}% | ${b.pairwise_strength === null ? '—' : b.pairwise_strength.toFixed(2) + '±' + (b.pairwise_se || 0).toFixed(2)} |`);
  }
  L.push('');
  L.push('两两对比排名（Bradley-Terry 极大似然，强度=对数胜率）：');
  L.push('');
  s.pairwise_ranking.forEach((r, i) => L.push(`${i + 1}. ${r.brand}　强度 ${r.strength.toFixed(2)} ± ${r.se.toFixed(2)}`));
  L.push('');
  L.push('> ' + s.method_note);
  return L.join('\n');
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('用法：node tools/score-snapshot.cjs <快照目录>'); process.exit(1); }
  const scores = scoreSnapshot(dir);
  fs.writeFileSync(path.join(dir, 'scores.json'), stableStringify(scores) + '\n');
  fs.writeFileSync(path.join(dir, 'report.md'), renderReport(scores));
  console.log(`打分完成：${path.basename(dir)}/scores.json + report.md（${scores.brands.length} 个品牌）`);
}

if (require.main === module) main();
module.exports = { scoreSnapshot, renderReport };
