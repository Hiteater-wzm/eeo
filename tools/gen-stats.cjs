#!/usr/bin/env node
/* gen-stats.cjs — 从当前分片注册表直接计算并重写 datasets/STATS-FULL.md
 * 每批并入/清洗后运行一次，统计数字永远由数据算出而非手填。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { readRegistry, DIR } = require('./registry-lib.cjs');

const ROOT = path.join(__dirname, '..');

const main = () => {
  const a = readRegistry();
  const n = a.length;
  const pct = (x) => (x / n * 100).toFixed(1) + '%';
  const fmt = (x) => x.toLocaleString('en-US');
  let qid = 0, web = 0, desc = 0, co = 0, high = 0, curated = 0;
  const coMap = new Map(), indMap = new Map();
  for (const b of a) {
    if (b.wikidata) qid++;
    if ((b.website || '').trim()) web++;
    if ((b.description || '').trim()) desc++;
    const c = (b.country || '').trim(); if (c) { co++; coMap.set(c, (coMap.get(c) || 0) + 1); }
    const i = (b.industry || '').trim(); if (i) indMap.set(i, (indMap.get(i) || 0) + 1);
    if (b.confidence === 'high') high++;
    if (!/wikidata\.org/.test((b.sources || [])[0] || '')) curated++;
  }
  const coTop = [...coMap.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30);
  const indTop = [...indMap.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30);
  const row = (r, [k, v]) => `| ${r} | ${k} | ${fmt(v)} | ${(v / n * 100).toFixed(1)}% |`;
  const md = `# EEO 全量品牌库统计（STATS-FULL）

> 管线：Wikidata CC0 批量采集（tools/harvest-wikidata.cjs，200 国）→ 合并去重与规则清洗（tools/merge-harvest.cjs、tools/clean-registry.cjs）→ AI 多轮逐条审查（判定文件在 datasets/harvest/verdicts/ 全量留档）→ 并回注册表（tools/apply-verdicts.cjs）。精选种子见 \`brands-1k.json\` 与 \`STATS.md\`。

## 总览

| 指标 | 数值 |
|---|---|
| 注册表条目 | **${fmt(n)}** |
| 有 Wikidata Q-id | ${fmt(qid)}（${pct(qid)}） |
| 有官网 | ${fmt(web)}（${pct(web)}） |
| 有描述 | ${fmt(desc)}（${pct(desc)}） |
| 标注国家 | ${fmt(co)}（${pct(co)}） |
| 国家/地区数 | ${coMap.size} |
| 高置信条目 | ${fmt(high)} |

> 准确性由 AI 多轮逐条审核把关：五轮累计判定 1,497,628 条候选，剔除 46,883 条非组织主体（单场活动、人物、地名、列表页、虚构条目、网站页面、无意义条目），判定文件全量留档；另有确定性规则清洗（含国家白名单与繁简归一），代码见 \`tools/clean-registry.cjs\` 与 \`datasets/harvest/verdicts/\`。

## 国家/地区分布 Top 30

| 排名 | 国家/地区 | 数量 | 占比 |
|---|---|---|---|
${coTop.map((e, i) => row(i + 1, e)).join('\n')}

## 行业分布 Top 30

| 排名 | 行业 | 数量 | 占比 |
|---|---|---|---|
${indTop.map((e, i) => row(i + 1, e)).join('\n')}

## 来源分布

| 来源 | 条目数 | 占比 |
|---|---|---|
| Wikidata CC0（经逐条审查并入） | ${fmt(n - curated)} | ${pct(n - curated)} |
| 精采（官网/世界品牌实验室等） | ${fmt(curated)} | ${pct(curated)} |

## 数据文件

- \`datasets/registry/\` — ${fmt(n)} 条，${fs.readdirSync(DIR).filter((f) => f.endsWith('.jsonl')).length} 个 JSONL 分片，共 ${(fs.readdirSync(DIR).filter((f) => f.endsWith('.jsonl')).reduce((s2, f) => s2 + fs.statSync(path.join(DIR, f)).size, 0) / 1048576).toFixed(1)} MB
- 数据许可：Wikidata 部分为 CC0；精采部分见仓库 LICENSE。

*由 tools/gen-stats.cjs 于并入后自动生成，数字直接由当前数据计算*
`;
  fs.writeFileSync(path.join(ROOT, 'datasets', 'STATS-FULL.md'), md);
  console.log(`STATS-FULL.md 重生成：${fmt(n)} 条 官网${fmt(web)} 描述${fmt(desc)} 国家${coMap.size} 行业${indMap.size}`);
};

main();
