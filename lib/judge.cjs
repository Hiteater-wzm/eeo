'use strict';
/*
 * judge.cjs — 立场裁判层：把"名字出现没有"升级为"AI 把它当选项没有"
 *
 * 五档立场：RECOMMENDED 明确推荐 / CONTRAST 作为对照或竞品提及 /
 *           NEUTRAL 中立提及 / NEGATIVE 负面 / ABSENT 未出现
 *
 * 复现设计：裁判判定按「回答哈希 × 品牌集」缓存在快照目录的
 * judge-cache.jsonl，打分器只读缓存不调接口——同一快照重算分数，
 * 字节级一致，零 API 成本。双裁判（两个不同家族引擎）交叉 +
 * Cohen's kappa 一致性；不一致条目计为 DISPUTED，不入推荐份额。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { askEngine, pool } = require('../core.cjs');
const { cohenKappa } = require('./stats.cjs');

const STANCES = ['RECOMMENDED', 'CONTRAST', 'NEUTRAL', 'NEGATIVE', 'ABSENT'];

const PROMPT = (question, answer, brands) => `你是中立的品牌可见性审计员。下面是买家的问题、某个 AI 引擎的回答原文，以及品牌列表。对列表中的每个品牌，判断该回答对它的立场：

RECOMMENDED 回答明确把它作为推荐选项（列出、点名推荐、给好评）
CONTRAST 作为对照或竞品被提及（"也可以看看X""相比X"）
NEUTRAL 中立提及（仅出现，无倾向）
NEGATIVE 负面评价或劝退
ABSENT 未出现

问题：${question}
回答原文：${answer}
品牌列表：${brands.join('、')}

只输出 JSON 数组，每项 {"brand":"品牌名","stance":"上述五档之一"}，覆盖全部品牌，不要输出其他内容。`;

function hashAnswer(answer, brands) {
  return crypto.createHash('sha256').update(answer + '\x00' + brands.slice().sort().join('\x00')).digest('hex').slice(0, 24);
}

/** 从裁判原始输出解析立场表；解析失败返回 null */
function parseStances(text, brands) {
  const m = String(text || '').match(/\[[\s\S]*\]/);
  if (!m) return null;
  let arr;
  try { arr = JSON.parse(m[0]); } catch { return null; }
  const out = new Map();
  for (const it of arr) {
    if (!it || typeof it.brand !== 'string') continue;
    const key = brands.find((b) => b === it.brand || it.brand.includes(b) || b.includes(it.brand));
    if (key && STANCES.includes(it.stance)) out.set(key, it.stance);
  }
  return out.size ? out : null;
}

function loadCache(dir) {
  const cache = new Map();
  const f = path.join(dir, 'judge-cache.jsonl');
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try { const j = JSON.parse(t); if (j.h && j.v) cache.set(j.h, j.v); } catch { /* 跳过坏行 */ }
    }
  }
  return cache;
}

/**
 * 对一份快照跑双裁判（或单裁判）并写缓存。
 * answers: [{qid, para, engine, sample, question, answer, brands}]
 * judges:  [{ id, engine, apiKey }]（1 或 2 个，两个不同家族最佳）
 */
async function judgeSnapshot(answers, judges, cacheDir, onProgress) {
  const cache = loadCache(cacheDir);
  const pending = answers.filter((a) => !cache.has(hashAnswer(a.answer, a.brands)));
  let done = 0;
  await pool(pending, 4, async (a) => {
    const h = hashAnswer(a.answer, a.brands);
    const verdicts = [];
    for (const j of judges) {
      try {
        const out = await askEngine(j.engine, PROMPT(a.question, a.answer, a.brands), j.apiKey);
        const st = parseStances(out, a.brands);
        verdicts.push(st ? { judge: j.id, stances: Object.fromEntries(st) } : { judge: j.id, stances: null });
      } catch (e) {
        verdicts.push({ judge: j.id, stances: null, error: String(e.message || e).slice(0, 120) });
      }
    }
    cache.set(h, verdicts);
    fs.appendFileSync(path.join(cacheDir, 'judge-cache.jsonl'), JSON.stringify({ h, v: verdicts }) + String.fromCharCode(10));
    done++;
    if (onProgress && (done % 25 === 0 || done === pending.length)) onProgress(done);
  });
    return cache;
}

/** 打分侧：从缓存取一个回答的最终立场（双裁判一致→该立场；不一致→DISPUTED；缺→UNKNOWN） */
function finalStance(verdicts) {
  const valid = (verdicts || []).filter((v) => v && v.stances);
  if (!valid.length) return 'UNKNOWN';
  const labs = [];
  for (const key of Object.keys(valid[0].stances)) {
    const vs = valid.map((v) => v.stances[key]).filter(Boolean);
    if (!vs.length) continue;
    labs.push(vs.every((x) => x === vs[0]) ? vs[0] : 'DISPUTED');
  }
  return labs; // 数组形式：按品牌序（与 brands 对齐见调用方）
}

/** 双裁判整体 kappa（对所有已判条目的主品牌立场） */
function judgesKappa(cache) {
  const a = [], b = [];
  for (const v of cache.values()) {
    const valid = (v || []).filter((x) => x && x.stances);
    if (valid.length < 2) continue;
    for (const key of Object.keys(valid[0].stances)) {
      const x = valid[0].stances[key], y = valid[1].stances[key];
      if (x && y) { a.push(x); b.push(y); }
    }
  }
  return a.length >= 2 ? cohenKappa(a, b) : null;
}

module.exports = { STANCES, hashAnswer, parseStances, judgeSnapshot, finalStance, judgesKappa, loadCache };
