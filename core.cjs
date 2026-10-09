// EEO Audit 核心引擎：题库生成 / 引擎调用 / 提及分析 / 评级
// 从 server.cjs 抽出的共享模块，供 MCP / CLI / GitHub Action 复用
// 零依赖：只用 Node 内置

// ---------- 品牌名处理 ----------
const SUFFIX_RE = /(工坊|工作室|科技|教育|信息技术|有限公司|网络|学院|平台|中心|机构|学堂|编程|ai|AI)$/g;
function coreWord(brand) {
  const b = brand.trim();
  if (b.length < 4) return [b];
  let w = b;
  let changed = true;
  while (changed && w.length >= 3) {
    changed = false;
    const m = w.match(SUFFIX_RE);
    if (m && w.length - m[0].length >= 2) { w = w.slice(0, w.length - m[0].length); changed = true; }
  }
  return (w !== b && w.length >= 2) ? [b, w] : [b];
}
function countHits(text, pats) {
  let n = 0;
  for (const p of pats) { let i = text.indexOf(p); while (i !== -1) { n++; i = text.indexOf(p, i + 1); } }
  return n;
}

// ---------- 判定规则 ----------
const NOINFO_RE = /(没有|无法|暂未|未能|不在我|没听说过|缺乏|查不到|查不到任何|没有查到)[^。！？]{0,100}(信息|资料|了解|掌握|记录|听说过|数据|机构|品牌|公司)|并不是一个广为人知|无法确认其|没有可靠信息|没有听说过该|并未听说过/;
const AMBIG_RE = /不同语境|含义差别很大|如果(你说的?|指的是)|可能指(代|的是)?|指的是哪个|哪个方面|具体指什么|能具体说说|请(你)?补充|告诉我(更多|具体|是什么)|需要更多信息|上下文|几种(可能|情况)|缩写(有点)?模糊|有时候并不是|并不(一定)?是品牌|可能是以下几种|先列几个最常见的|无法确定(它|你|该)|需要你提供/;

// ---------- 评级 ----------
const DEPTHS = {
  quick: { label: '快速体检', brand: 4, cat: 6, scene: 2, total: 12 },
  standard: { label: '标准体检', brand: 8, cat: 16, scene: 6, total: 30 },
  deep: { label: '深度体检', brand: 12, cat: 28, scene: 8, total: 48 },
};
function gradeOf(x) {
  if (x >= 0.8) return { g: 'S', t: 'AI 眼中的默认选项' };
  if (x >= 0.6) return { g: 'A', t: '认知稳固 推荐在列' };
  if (x >= 0.4) return { g: 'B', t: '有认知 推荐缺席' };
  if (x >= 0.15) return { g: 'C', t: '边缘存在' };
  return { g: 'D', t: 'AI 视野之外' };
}

// ---------- 引擎调用（OpenAI 兼容 + Anthropic Messages） ----------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function askEngine(engine, question, apiKey) {
  const isAnthropic = engine.apiType === 'anthropic';
  const body = isAnthropic
    ? JSON.stringify({ model: engine.model, max_tokens: engine.maxTokens, messages: [{ role: 'user', content: question }] })
    : // temperature is sampling-phase only; scoring on frozen snapshots is deterministic regardless
    JSON.stringify({ model: engine.model, messages: [{ role: 'user', content: question }], max_tokens: engine.maxTokens, temperature: 0.7, stream: false });
  const headers = isAnthropic
    ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    : { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), engine.timeoutMs || 120000);
  try {
    const r = await fetch(engine.baseURL + (isAnthropic ? '/v1/messages' : '/chat/completions'), { method: 'POST', headers, body, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
    const d = await r.json();
    const text = isAnthropic
      ? (d.content && d.content[0] && d.content[0].text)
      : (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content);
    if (!text) throw new Error('empty content');
    return text;
  } finally { clearTimeout(timer); }
}

// ---------- 题库生成 ----------
async function genQuestions(input, dsEngine, dsKey) {
  const { brand, industry, city, audience, competitors, depth } = input;
  const dep = DEPTHS[depth] || DEPTHS.quick;
  const usr =
    `为品牌「${brand}」（行业：${industry}${city ? '，所在城市 ' + city : ''}${audience ? '，目标客户 ' + audience : ''}）生成 ${dep.total} 个中文提问，模拟真实买家向 AI 助手咨询时的问法。要求：\n` +
    `1. cat="品牌" 共 ${dep.brand} 题：直接问 ${brand} 的情况\n` +
    `2. cat="品类" 共 ${dep.cat} 题：买家不带品牌名的比较与选择问题\n` +
    `3. cat="场景" 共 ${dep.scene} 题：结合具体情境${city ? '（含 ' + city + ' 本地问法）' : ''}的问法\n` +
    (competitors && competitors.length ? `个别品类题可自然提到：${competitors.join('、')}\n` : '') +
    `只输出 JSON 数组：[{"cat":"品牌","q":"..."}]`;
  const txt = await askEngine(dsEngine, usr, dsKey);
  const m = txt.match(/\[[\s\S]*\]/);
  const qs = JSON.parse(m[0]);
  if (Array.isArray(qs) && qs.length >= Math.min(10, dep.total)) {
    return qs.slice(0, dep.total).map((x, i) => ({ id: i + 1, cat: ['品牌', '品类', '场景'].includes(x.cat) ? x.cat : '品类', q: String(x.q).slice(0, 80) }));
  }
  throw new Error('题库格式异常');
}

// ---------- 并发池 ----------
async function pool(items, limit, worker) {
  return new Promise((resolve) => {
    let idx = 0, alive = 0, done = 0;
    const total = items.length;
    if (!total) return resolve();
    function next() {
      if (done >= total) return resolve();
      while (alive < limit && idx < total) {
        const my = idx++; alive++;
        worker(items[my], my).catch(() => {}).then(() => { alive--; done++; next(); });
      }
    }
    next();
  });
}

// ---------- 引用来源分析 ----------
// 从回答原文提取 URL 与平台提及，回答品牌方"AI 推荐竞品时引用的是谁的内容"
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#\[\]]+/g;
// 平台清单：domains 按主机名后缀归类（特殊子域放前面）；words 抓纯文本提及（如无 URL 时的"知乎上有人说"）
const PLATFORMS = [
  { name: '微信公众号', domains: ['mp.weixin.qq.com'], words: ['微信公众号', '公众号'] },
  { name: '腾讯新闻', domains: ['news.qq.com'], words: ['腾讯新闻'] },
  { name: '知乎', domains: ['zhihu.com'], words: ['知乎'] },
  { name: 'CSDN', domains: ['csdn.net'], words: ['CSDN'] },
  { name: '维基百科', domains: ['wikipedia.org'], words: ['维基百科'] },
  { name: 'GitHub', domains: ['github.com'], words: ['GitHub'] },
  { name: '百度百科', domains: ['baike.baidu.com'], words: ['百度百科'] },
  { name: '微博', domains: ['weibo.com'], words: ['微博'] },
  { name: 'B站', domains: ['bilibili.com', 'b23.tv'], words: ['B站', '哔哩哔哩', 'bilibili'] },
  { name: '36氪', domains: ['36kr.com'], words: ['36氪', '36kr'] },
  { name: '搜狐', domains: ['sohu.com'], words: ['搜狐'] },
  { name: '网易', domains: ['163.com'], words: ['网易'] },
  { name: '新浪', domains: ['sina.com', 'sina.com.cn'], words: ['新浪'] },
];
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function platformOfHost(host) {
  if (!host) return null;
  for (const p of PLATFORMS) for (const d of p.domains) if (host === d || host.endsWith('.' + d)) return p.name;
  return null;
}
function rootDomain(host) {
  const h = host.replace(/^www\./i, '');
  const m2 = h.match(/([^.]+\.(?:com|net|org|gov|edu|ac)\.(?:cn|hk|tw|jp|uk))$/i);
  if (m2) return m2[1]; // 二级后缀（如 sina.com.cn）保留三段
  const m = h.match(/([^.]+\.[^.]+)$/);
  return m ? m[1] : h;
}
function trimUrl(raw) {
  // URL 后常贴中文标点（，。；、）》等）——先剥尾部标点，再按括号配平去掉多余右括号
  let s = raw.replace(/[.,;:!?'"，。；：！？、）》」』】\]]+$/, '');
  let bal = 0;
  for (const ch of s) { if (ch === '(') bal++; else if (ch === ')') bal--; }
  while (bal < 0 && s.endsWith(')')) { s = s.slice(0, -1); bal++; }
  return s;
}
function hostOf(u) {
  const m = u.match(/^https?:\/\/([^/?#]+)/i);
  if (!m) return null;
  return m[1].split('@').pop().split(':')[0].toLowerCase();
}
function countPlatformWords(lowText, words) {
  // 最长词优先，避免"微信公众号"被"公众号"重复计数
  const re = new RegExp(words.map(w => escRe(w.toLowerCase())).sort((a, b) => b.length - a.length).join('|'), 'g');
  const m = lowText.match(re);
  return m ? m.length : 0;
}
// 纯函数：questions（含各引擎 answers）→ sources 统计；competitors 可选，用于竞品引用上下文
function extractSources(questions, competitors) {
  const urlCounts = {};      // 去重 URL → 出现次数
  const domainCounts = {};   // 根域名 → 出现次数
  const platformCounts = {}; // 平台 → 次数（URL 域名归类 + 纯文本提及，合并口径）
  const byQuestion = {};     // 题号 → 来源列表（平台名或完整 URL；URL 以 http 开头自标识来源类型）
  (questions || []).forEach(q => {
    const perQ = new Set();
    const answers = q.answers ? Object.values(q.answers) : [];
    answers.forEach(a => {
      if (!a) return;
      const text = String(a);
      const urls = (text.match(URL_RE) || []).map(trimUrl).filter(u => /^https?:\/\//i.test(u));
      urls.forEach(u => {
        urlCounts[u] = (urlCounts[u] || 0) + 1;
        const host = hostOf(u);
        if (host) {
          const rd = rootDomain(host);
          if (rd) domainCounts[rd] = (domainCounts[rd] || 0) + 1;
          const pn = platformOfHost(host);
          if (pn) { platformCounts[pn] = (platformCounts[pn] || 0) + 1; perQ.add(pn); }
        }
        perQ.add(u);
      });
      // 纯文本平台提及：先移除 URL 再数词，避免把 URL 里的 csdn 之类误算成文字提及
      const bare = text.replace(URL_RE, ' ').toLowerCase();
      PLATFORMS.forEach(p => {
        const n = countPlatformWords(bare, p.words);
        if (n) { platformCounts[p.name] = (platformCounts[p.name] || 0) + n; perQ.add(p.name); }
      });
    });
    byQuestion[q.id] = Array.from(perQ);
  });
  const topUrls = Object.keys(urlCounts).map(u => ({ url: u, count: urlCounts[u] }))
    .sort((a, b) => b.count - a.count || (a.url < b.url ? -1 : 1));
  const topDomains = Object.keys(domainCounts).map(d => ({ domain: d, count: domainCounts[d] }))
    .sort((a, b) => b.count - a.count || (a.domain < b.domain ? -1 : 1));
  // 竞品引用上下文（核心卖点）：竞品被提及的那些题里，AI 同时引用了哪些来源
  const competitorContext = (Array.isArray(competitors) ? competitors : []).map(c => {
    const pats = coreWord(c);
    const src = new Set();
    let mentioned = 0;
    (questions || []).forEach(q => {
      const answers = q.answers ? Object.values(q.answers) : [];
      const hit = answers.some(a => a && pats.some(p => String(a).indexOf(p) !== -1));
      if (hit) { mentioned++; (byQuestion[q.id] || []).forEach(s => src.add(s)); }
    });
    return { competitor: c, mentioned, sources: Array.from(src) };
  });
  return {
    totalUrls: topUrls.reduce((a, x) => a + x.count, 0), // URL 总出现次数，去重清单见 topUrls
    topUrls, topDomains,
    byPlatform: platformCounts,
    byQuestion,
    competitorContext,
  };
}

// ---------- 分析 ----------
function analyze(input, questions, results) {
  const pats = coreWord(input.brand);
  const compPats = {};
  (input.competitors || []).forEach(c => compPats[c] = coreWord(c));
  const quotes = [];
  Object.keys(results).forEach(eid => {
    const s = results[eid];
    questions.forEach(q => {
      const a = (q.answers && q.answers[eid]) || '';
      if (!a) return;
      if (q.cat === '品牌') {
        s.awareTotal++;
        const noinfo = NOINFO_RE.test(a), ambig = AMBIG_RE.test(a);
        const hit = pats.some(p => a.indexOf(p) !== -1);
        if (hit && !noinfo && !ambig && a.length > 150) s.aware++;
        else if (noinfo && quotes.length < 6) quotes.push({ engine: s.name, q: q.q, snippet: a.replace(/\s+/g, ' ').slice(0, 90) + '……' });
      } else {
        s.mentionTotal++;
        s.mention += countHits(a, pats);
        (input.competitors || []).forEach(c => {
          const n = countHits(a, compPats[c]);
          if (n) s.comp[c] = (s.comp[c] || 0) + n;
        });
      }
    });
  });
  const ids = Object.keys(results);
  const avgAware = ids.length ? ids.reduce((a, k) => a + (results[k].awareTotal ? results[k].aware / results[k].awareTotal : 0), 0) / ids.length : 0;
  const totalMention = ids.reduce((a, k) => a + results[k].mention, 0);
  const mentionCap = ids.reduce((a, k) => a + results[k].mentionTotal, 0) || 1;
  const mentionRate = Math.min(1, totalMention / (mentionCap * 0.3));
  const overall = avgAware * 0.5 + mentionRate * 0.5;
  const labels = {};
  questions.forEach(q => {
    labels[q.id] = {};
    ids.forEach(eid => {
      const a = (q.answers && q.answers[eid]) || '';
      if (!a) { labels[q.id][eid] = '未答'; return; }
      const noinfo = NOINFO_RE.test(a), ambig = AMBIG_RE.test(a);
      const hit = pats.some(p => a.indexOf(p) !== -1);
      if (q.cat === '品牌') labels[q.id][eid] = (hit && !noinfo && !ambig) ? '有实料' : '无实料';
      else labels[q.id][eid] = hit ? '提及' : '未提及';
    });
  });
  return {
    results, questions, quotes, labels,
    score: { overall: Math.round(overall * 100), awareRate: Math.round(avgAware * 100), mentionRate: Math.round(mentionRate * 100), grade: gradeOf(overall) },
    sources: extractSources(questions, input.competitors),
  };
}

// ---------- 完整检测（进度回调可选） ----------
async function runAudit(input, engines, onProgress) {
  // engines: [{ id, name, model, baseURL, apiKey, maxTokens, timeoutMs, apiType?, concurrency? }]
  const active = engines.filter(e => e.apiKey);
  if (!active.length) throw new Error('没有可用引擎（缺 API Key）');
  const dsE = active.find(e => e.id === 'deepseek') || active[0];
  let questions;
  try {
    questions = await genQuestions(input, dsE, dsE.apiKey);
  } catch (e) {
    throw new Error('题库生成失败：' + e.message);
  }
  const tasks = [];
  const counters = {};
  active.forEach(e => counters[e.id] = 0);
  active.forEach(e => questions.forEach(q => tasks.push({ e, q })));
  const errors = {}; // 引擎级失败计数：全部作答失败时不能照常出低分报告
  await pool(tasks, 4, async (t) => {
    try {
      const txt = await askEngine(t.e, t.q.q, t.e.apiKey);
      t.q.answers = t.q.answers || {};
      t.q.answers[t.e.id] = txt;
    } catch (err) {
      t.q.answers = t.q.answers || {};
      t.q.answers[t.e.id] = '';
      errors[t.e.id] = (errors[t.e.id] || 0) + 1;
    }
    counters[t.e.id]++;
    if (onProgress) onProgress(t.e, counters[t.e.id], questions.length);
  });
  const results = {};
  active.forEach(e => results[e.id] = { name: e.name, aware: 0, awareTotal: 0, mention: 0, mentionTotal: 0, comp: {} });
  questions.forEach(q => {
    q.answers = q.answers || {};
    active.forEach(e => { if (!(e.id in q.answers)) q.answers[e.id] = ''; });
  });
  // 有效样本护栏：某引擎全部作答失败时标记 degraded 并剔除该引擎，
  // 全部引擎无有效作答时直接判失败——接口故障不得被误读为品牌表现差。
  const failedEngines = active.filter(e => errors[e.id] && errors[e.id] >= questions.length);
  let degraded = null;
  if (failedEngines.length) {
    degraded = { engines: failedEngines.map(e => e.id), note: '以下引擎全部作答失败，其结果不计入：' + failedEngines.map(e => e.name).join('、') };
    const bad = new Set(failedEngines.map(e => e.id));
    questions.forEach(q => { q.answers = q.answers || {}; bad.forEach(id => delete q.answers[id]); });
  }
  const validEngines = active.filter(e => !failedEngines.includes(e));
  if (!validEngines.length) {
    return { input, phase: 'error', error: '所有引擎作答均失败（接口故障或密钥无效），本次结果不代表品牌表现', summary: null };
  }
  const summary = analyze(input, questions, results);
  return { input, ...(degraded ? { degraded } : {}), ...summary };
}

module.exports = { coreWord, countHits, NOINFO_RE, AMBIG_RE, DEPTHS, gradeOf, askEngine, genQuestions, pool, extractSources, analyze, runAudit };
