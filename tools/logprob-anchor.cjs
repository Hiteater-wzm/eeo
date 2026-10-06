#!/usr/bin/env node
'use strict';
/*
 * logprob-anchor.cjs — 确定性锚点：对支持 logprobs 的开源/兼容引擎
 * 用对比概率代替采样，逐字可复现（方向六）。
 *
 * 做法：对同一问题，把回答的开头固定为受限候选（"我会推荐"），
 * 取下一 token 的 top_logprobs，比较各品牌首 token 的对数概率差。
 * 温度无关、无采样噪声；同引擎同版本重跑结果一致。
 *
 * 用法：node tools/logprob-anchor.cjs --question "买奶茶推荐什么牌子" \
 *   --brands 蜜雪冰城 喜茶 奈雪 [--engine glm]
 * 引擎需 config.json 启用且 baseURL 支持 logprobs 参数；不支持的会标注。
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const argv = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--question') opt.question = argv[++i];
    else if (argv[i] === '--brands') opt.brands = argv[++i].split(/[,，、\s]+/).filter(Boolean);
    else if (argv[i] === '--engine') opt.engine = argv[++i];
  }
  if (!opt.question || !opt.brands || opt.brands.length < 2) {
    console.error('用法见文件头注释');
    process.exit(1);
  }
  const cfgPath = path.join(__dirname, '..', 'config.json');
  if (!fs.existsSync(cfgPath)) throw new Error('缺 config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const eng = (cfg.engines || []).find((e) => e.enabled && e.apiKey && (!opt.engine || e.id === opt.engine));
  if (!eng) throw new Error('没有可用引擎');

  // 品牌首 token：中文品牌取第一个字符；拉丁品牌取首词
  const firstTok = (b) => (/[A-Za-z]/.test(b[0]) ? b.split(/\s+/)[0] : b[0]);
  const prompt = `问题：${opt.question}\n回答：我会推荐`;
  const body = {
    model: eng.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1,
    temperature: 0,
    logprobs: true,
    top_logprobs: 20,
  };
  const r = await fetch(eng.baseURL + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + eng.apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) {
    console.error(`引擎不支持或调用失败：HTTP ${r.status} ${String(await r.text()).slice(0, 200)}`);
    process.exit(2);
  }
  const d = await r.json();
  const top = d.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs || [];
  if (!top.length) { console.error('引擎未返回 top_logprobs（不支持确定性锚点）'); process.exit(3); }
  const lp = new Map(top.map((t) => [t.token, t.logprob]));
  const rows = opt.brands.map((b) => {
    const tok = firstTok(b);
    const v = lp.get(tok);
    return { brand: b, first_token: tok, logprob: v === undefined ? null : +v.toFixed(4) };
  });
  const best = rows.filter((x) => x.logprob !== null).sort((a, b) => b.logprob - a.logprob);
  console.log(JSON.stringify({ engine: eng.id, model: d.model || eng.model, question: opt.question, anchor: '我会推荐', rows, ranking: best.map((x) => x.brand) }, null, 1));
  console.error('确定性锚点：同引擎同版本重跑结果一致；未上榜品牌 = 候选首 token 未进 top20');
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
