#!/usr/bin/env node
'use strict';
/*
 * panel-build.cjs — 构建版本化测量面板（固定题板，复现测量的第一步）
 *
 * 面板 = 品类级买家意图题 × 每题 10 个语义等价改写 + 竞品两两对比题。
 * 改写由确定性模板生成（零 API 依赖），面板发布后内容与哈希不再变。
 *
 * 用法：
 *   node tools/panel-build.cjs --industry 餐饮 --category 奶茶 \
 *     --brands 蜜雪冰城 喜茶 奈雪 --out standards/panels/food-tea-v1.json
 * 同参数重跑输出字节一致（题序、改写序全确定）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* 十个确定性改写模板：同一购买意图的不同措辞（内容等价） */
const PARAPHRASE_TEMPLATES = [
  (c) => `买${c}的话，选哪个牌子好？`,
  (c) => `${c}有什么值得买的品牌？给我推荐几个`,
  (c) => `想买${c}，比较推荐的品牌有哪些？`,
  (c) => `我第一次买${c}，有什么牌子比较靠谱？`,
  (c) => `买${c}有哪些牌子是大家公认不错的？`,
  (c) => `预算合适的前提下，${c}买什么品牌好？`,
  (c) => `送人的话，${c}哪些牌子拿得出手？`,
  (c) => `大家平时买${c}一般认哪些牌子？`,
  (c) => `${c}里质量和口碑长期在线的品牌有哪些？`,
  (c) => `${c}推荐品牌`,
];

/* 品类认知题（不带品牌名的开放式提问） */
const OPEN_INTENTS = [
  { id: 'rec', q: (c) => `买${c}的话，选哪个牌子好？` },
  { id: 'local', q: (c) => `在国内买${c}，大家一般选哪些牌子？` },
  { id: 'budget', q: (c) => `${c}性价比高的牌子有哪些？` },
  { id: 'premium', q: (c) => `${c}里偏高端的牌子是哪几个？` },
  { id: 'gift', q: (c) => `送人选${c}，哪些品牌合适？` },
];

function buildPanel({ industry, category, brands, version = 1, perParaphrase = 10 }) {
  if (!industry || !category || !Array.isArray(brands) || brands.length < 2) {
    throw new Error('需要 --industry --category 与至少两个 --brands');
  }
  const questions = [];
  OPEN_INTENTS.forEach((intent, i) => {
    const paras = PARAPHRASE_TEMPLATES.slice(0, perParaphrase).map((t) => t(category));
    questions.push({
      id: `open-${intent.id}`,
      kind: 'open',
      intent: intent.id,
      text: intent.q(category),
      paraphrases: [...new Set([intent.q(category), ...paras])].slice(0, Math.max(perParaphrase, 1)),
      brands,
    });
  });
  // 两两对比：全配对轮转（品牌数 ≤6 时全配对，超出取相邻轮转控制题量）
  const pairs = [];
  if (brands.length <= 6) {
    for (let i = 0; i < brands.length; i++)
      for (let j = i + 1; j < brands.length; j++) pairs.push([brands[i], brands[j]]);
  } else {
    for (let i = 0; i < brands.length; i++) pairs.push([brands[i], brands[(i + 1) % brands.length]]);
  }
  pairs.forEach(([a, b], i) => {
    questions.push({
      id: `pair-${String(i).padStart(2, '0')}`,
      kind: 'pairwise',
      text: `${a}和${b}，买${category}你会推荐哪个？只回答一个品牌名并说明理由`,
      paraphrases: [
        `${a}和${b}，买${category}你会推荐哪个？只回答一个品牌名并说明理由`,
        `想买${category}，${a}与${b}二选一你选谁？给出一个答案`,
        `只在这两个里选：${a} 还是 ${b}？说说你的推荐和理由`,
      ],
      brands: [a, b],
    });
  });
  const panel = {
    schema: 'eeo.panel.v1',
    id: `panel-${category}-v${version}`,
    industry,
    category,
    brands,
    version,
    created: new Date().toISOString().slice(0, 10),
    questions,
  };
  panel.hash = crypto.createHash('sha256').update(JSON.stringify({ ...panel, hash: undefined })).digest('hex').slice(0, 16);
  return panel;
}

function main() {
  const argv = process.argv.slice(2);
  const opt = { brands: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--industry') opt.industry = argv[++i];
    else if (argv[i] === '--category') opt.category = argv[++i];
    else if (argv[i] === '--brands') {
      // 吞掉后续所有非旗标参数作为品牌名
      opt.brands = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opt.brands.push(argv[++i]);
    }
    else if (argv[i] === '--out') opt.out = argv[++i];
    else if (argv[i] === '--version') opt.version = parseInt(argv[++i], 10) || 1;
  }
  opt.brands = opt.brands.join(' ').split(/[,，、\s]+/).filter(Boolean);
  const panel = buildPanel(opt);
  const json = JSON.stringify(panel, null, 1);
  if (opt.out) {
    fs.mkdirSync(path.dirname(opt.out), { recursive: true });
    fs.writeFileSync(opt.out, json);
    console.log(`面板写入 ${opt.out}　题数 ${panel.questions.length}（开放 ${OPEN_INTENTS.length} × 每题 ${panel.questions[0].paraphrases.length} 改写 + 对比 ${panel.questions.length - OPEN_INTENTS.length}）　哈希 ${panel.hash}`);
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) main();
module.exports = { buildPanel, PARAPHRASE_TEMPLATES };
