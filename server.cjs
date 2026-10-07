// EEO Audit - 开源的 AI 可见性体检工具
// 流程：输入品牌 -> 生成买家问题 -> 双引擎采集 -> 提及分析 -> 报告页/分享链接
// 维护 信阳市浉河区清白软件工作室 Apache-2.0
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = __dirname;
const CFG_PATH = path.join(ROOT, 'config.json');
if (!fs.existsSync(CFG_PATH)) {
  console.error('[eeo-audit] 未找到 config.json。请复制 config.example.json 为 config.json，并填入你的模型 API Key 后再启动。');
  process.exit(1);
}
const CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const JOBS_DIR = path.join(ROOT, 'jobs');
if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });

// ---------- 工具 ----------
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
  for (const p of pats) {
    let i = -1;
    while ((i = text.indexOf(p, i + 1)) !== -1) n++;
  }
  return n;
}
const NOINFO_RE = /(没有|无法|暂未|未能|不在我|没听说过|缺乏|查不到|查不到任何|没有查到)[^。！？]{0,100}(信息|资料|了解|掌握|记录|听说过|数据|机构|品牌|公司)|并不是一个广为人知|无法确认其|没有可靠信息|没有听说过该|并未听说过/;
const AMBIG_RE = /不同语境|含义差别很大|如果(你说的?|指的是)|可能指(代|的是)?|指的是哪个|哪个方面|具体指什么|能具体说说|请(你)?补充|告诉我(更多|具体|是什么)|需要更多信息|上下文|几种(可能|情况)|缩写(有点)?模糊|有时候并不是|并不(一定)?是品牌|可能是以下几种|先列几个最常见的|无法确定(它|你|该)|需要你提供/;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function json(res, code, obj) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length });
  res.end(buf);
}
function clientIp(req) {
  // 取 XFF 末段：nginx 会把真实客户端 IP 追加在最后。首段可被伪造
  const xf = req.headers['x-forwarded-for'];
  if (!xf) return req.socket.remoteAddress;
  const parts = String(xf).split(',').map((x) => x.trim()).filter(Boolean);
  return parts[parts.length - 1] || req.socket.remoteAddress;
}

// ---------- 模型调用 ----------
async function askEngine(engine, question) {
  const body = JSON.stringify({
    model: engine.model,
    messages: [{ role: 'user', content: question }],
    max_tokens: engine.maxTokens,
    temperature: 0.7,
    stream: false,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), engine.timeoutMs);
  try {
    const r = await fetch(engine.baseURL + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + engine.apiKey },
      body, signal: ctrl.signal,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
    const d = await r.json();
    const text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    if (!text) throw new Error('empty content (thinking budget?)');
    return { text, secs: 0 };
  } finally { clearTimeout(timer); }
}

// ---------- 题库生成 ----------
async function genQuestions(job) {
  const { brand, industry, competitors, website, city, audience, depth } = job;
  const dep = DEPTHS[depth] || DEPTHS.quick;
  const ds = CFG.engines.find(e => e.id === 'deepseek');
  const sys = '你是市场调研助手。只输出 JSON，不要任何解释文字。';
  const usr =
    `为品牌「${brand}」（行业：${industry}${website ? '，官网 ' + website : ''}${city ? '，所在城市 ' + city : ''}${audience ? '，目标客户 ' + audience : ''}）生成 ${dep.total} 个中文提问，模拟真实买家向 AI 助手咨询时的问法。要求：\n` +
    `1. cat="品牌" 共 ${dep.brand} 题：直接问 ${brand} 的情况，例如「${brand}是什么」「${brand}靠谱吗」「${brand}怎么收费」「${brand}和${competitors[0] || '同类机构'}比哪个好」；\n` +
    `2. cat="品类" 共 ${dep.cat} 题：买家不带品牌名、比较和选择${industry}产品/服务的问题，围绕${audience || '真实买家'}的需求和顾虑，问法多样；\n` +
    `3. cat="场景" 共 ${dep.scene} 题：结合具体情境${city ? '（必须含 ' + city + ' 本地问法）' : '（城市、人群、场合）'}的问法。\n` +
    (competitors.length ? `个别品类题可自然提到这些名字作为选项：${competitors.join('、')}。\n` : '') +
    `输出格式：[{"cat":"品牌","q":"..."},{"cat":"品类","q":"..."},{"cat":"场景","q":"..."}]`;
  try {
    const body = JSON.stringify({ model: ds.model, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], max_tokens: 4000, temperature: 0.5, stream: false });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ds.timeoutMs);
    let text = '';
    try {
      const r = await fetch(ds.baseURL + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ds.apiKey }, body, signal: ctrl.signal });
      const d = await r.json();
      text = d.choices[0].message.content;
    } finally { clearTimeout(timer); }
    const s = text.indexOf('['), e = text.lastIndexOf(']');
    const qs = JSON.parse(text.slice(s, e + 1));
    if (Array.isArray(qs) && qs.length >= Math.min(10, dep.total) && qs.every(x => x && typeof x.q === 'string' && x.q.length >= 6)) {
      return qs.slice(0, dep.total).map((x, i) => ({ id: i + 1, cat: ['品牌', '品类', '场景'].includes(x.cat) ? x.cat : '品类', q: x.q.slice(0, 80) }));
    }
    throw new Error('bad shape');
  } catch (e) {
    // 兜底模板（按深度档扩展）
    const comp = competitors[0] || '同类机构';
    const out = [
      { id: 1, cat: '品牌', q: `${brand}是什么？` },
      { id: 2, cat: '品牌', q: `${brand}靠谱吗？` },
      { id: 3, cat: '品牌', q: `${brand}怎么收费？` },
      { id: 4, cat: '品牌', q: `${brand}和${comp}比哪个好？` },
      { id: 5, cat: '品类', q: `${industry}有哪些值得推荐的机构或平台？` },
      { id: 6, cat: '品类', q: `想选${industry}的服务，怎么挑比较好？` },
      { id: 7, cat: '品类', q: `${industry}哪家性价比高？` },
      { id: 8, cat: '品类', q: `${industry}的头部品牌都有哪些？` },
      { id: 9, cat: '品类', q: `第一次接触${industry}，从哪里入手？` },
      { id: 10, cat: '品类', q: `${industry}线上和线下怎么选？` },
      { id: 11, cat: '场景', q: city ? `${city}有哪些${industry}？` : `本地找${industry}，有什么靠谱的选择？` },
      { id: 12, cat: '场景', q: city ? `${city}选${industry}要注意什么？` : `新手想尝试${industry}，应该注意什么？` },
    ];
    const catQs = [`${industry}的价格一般是多少？`, `怎么判断${industry}哪家专业？`, `${industry}有哪些坑要注意？`, `${industry}的口碑怎么看？`, `选${industry}最看重什么？`, `${industry}怎么规划预算？`, `选择${industry}时最常犯的错误是什么？`, `${industry}领域，大家最关心什么？`, `${industry}服务怎么对比不同家？`, `决策前应该问对方什么问题？`, `${industry}一般怎么收费？`, `${industry}售后怎么样？`, `${industry}有哪些套路？`, `${industry}的旺季是什么时候？`, `${industry}适合什么人？`, `${industry}怎么开始比较合适？`, `${industry}的行业标准是什么？`, `${industry}哪家评价好？`];
    for (let i = out.length; i < 4 + dep.cat; i++) out.push({ id: i + 1, cat: '品类', q: catQs[(i - 10) % catQs.length] });
    const scQs = [`第一次购买${industry}服务的人，有什么建议？`, `${audience || '新手'}适合什么样的${industry}服务？`, `预算有限时怎么选${industry}？`, `怎么判断${industry}服务的真实水平？`, `线上做${industry}决策，怎么核实对方资质？`, `${industry}的退换政策一般怎样？`];
    for (let i = out.length; i < 4 + dep.cat + dep.scene; i++) out.push({ id: i + 1, cat: '场景', q: scQs[(i - 2) % scQs.length] });
    return out.slice(0, dep.total);
  }
}

// ---------- 并发池 ----------
async function pool(items, limit, worker) {
  const ret = new Array(items.length);
  let idx = 0;
  async function runner() {
    while (idx < items.length) {
      const my = idx++;
      ret[my] = await worker(items[my], my).catch(e => ({ error: String(e && e.message || e) }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return ret;
}

// ---------- 深度档与评分 ----------
const DEPTHS = {
  quick:    { label: '快速体检', brand: 4,  cat: 6,  scene: 2, total: 12, minutes: '5-9' },
  standard: { label: '标准体检', brand: 8,  cat: 16, scene: 6, total: 30, minutes: '12-20' },
  deep:     { label: '深度体检', brand: 12, cat: 28, scene: 8, total: 48, minutes: '20-35' },
};
function gradeOf(x) {
  if (x >= 0.8) return { g: 'S', t: 'AI 眼中的默认选项' };
  if (x >= 0.6) return { g: 'A', t: '认知稳固，推荐在列' };
  if (x >= 0.4) return { g: 'B', t: '有认知，推荐缺席' };
  if (x >= 0.15) return { g: 'C', t: '边缘存在' };
  return { g: 'D', t: 'AI 视野之外' };
}
function buildAdvice(brand, city, per, compMax) {
  const adv = [];
  const rates = Object.values(per);
  const awareRate = rates.length ? rates.reduce((a, s) => a + (s.awareTotal ? s.aware / s.awareTotal : 0), 0) / rates.length : 0;
  const mention = rates.reduce((a, s) => a + s.mention, 0);
  if (awareRate < 0.5) adv.push({ title: '让 AI 认识你：第三方内容铺设', detail: '人工智能对品牌的认知来自训练语料与检索源。在知乎、CSDN、公众号及行业目录发布实名介绍是最直接的认知入口。目标为三个月内品牌直接题从「没有信息」变为有实料。' });
  if (mention === 0) adv.push({ title: '进入推荐名单：占住品类词', detail: '买家提问不带品牌名时人工智能按品类组织答案。围绕「怎么选、哪家好」类买家问题撰写第三方内容。将「' + brand + '」写入被引用的名单。' });
  if (city) adv.push({ title: '本地信号补全：地图与点评收录', detail: 'AI 回答本地问题时会引导用户去地图和点评平台。' + city + '的地图标注与点评收录是本地类问题的前提。缺失即构成断路。' });
  if (compMax && compMax > mention) adv.push({ title: '对标竞品差距', detail: '竞品最高提及 ' + compMax + ' 次。你为 ' + mention + ' 次。内容足迹数量决定差距。按竞品名单逐项建立「品牌+品类」的内容存在。' });
  if (!adv.length) adv.push({ title: '保持复测', detail: '当前状态良好。建议每季度复测一次。监测模型更新带来的波动。' });
  return adv;
}

// ---------- 主流水线 ----------
const jobs = new Map(); // id -> job 对象（含运行态）
function saveJob(job) {
  const persist = {
    id: job.id, brand: job.brand, industry: job.industry, competitors: job.competitors,
    website: job.website, city: job.city, audience: job.audience, depth: job.depth, drafts: job.drafts, reusedBank: job.reusedBank,
    createdAt: job.createdAt, phase: job.phase, engines: job.engines, questions: job.questions,
    summary: job.summary, error: job.error, durationSec: job.durationSec,
  };
  fs.writeFileSync(path.join(JOBS_DIR, job.id + '.json'), JSON.stringify(persist), 'utf8');
}

async function runPipeline(job) {
  const t0 = Date.now();
  try {
    job.phase = 'gen';
    saveJob(job);
    // 题库银行：同品牌同深度复用固定题库，保证复测可比性
    const bankKey = crypto.createHash('md5').update(job.brand.trim() + '|' + job.depth).digest('hex').slice(0, 12);
    const bankFile = path.join(JOBS_DIR, 'bank', 'q-' + bankKey + '.json');
    let qs = null;
    try {
      if (fs.existsSync(bankFile)) qs = JSON.parse(fs.readFileSync(bankFile, 'utf8'));
      if (!Array.isArray(qs) || !qs.length) qs = null;
    } catch { qs = null; }
    if (qs) {
      job.reusedBank = true;
    } else {
      job.reusedBank = false;
      qs = await genQuestions(job);
      try {
        fs.mkdirSync(path.dirname(bankFile), { recursive: true });
        fs.writeFileSync(bankFile, JSON.stringify(qs), 'utf8');
      } catch { /* 写入失败不影响本次检测 */ }
    }
    job.questions = qs.map(q => ({ answers: {}, id: q.id, cat: q.cat, q: q.q }));
    job.phase = 'collect';
    saveJob(job);

    const pats = coreWord(job.brand);
    const compPats = {};
    for (const c of job.competitors) compPats[c] = coreWord(c);

    for (const eng of CFG.engines) {
      if (!eng.enabled) continue;
      const st = job.engines.find(x => x.id === eng.id);
      st.total = job.questions.length;
      await pool(job.questions, eng.concurrency, async (q) => {
        let ok = false;
        for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
          try {
            const t = Date.now();
            const r = await askEngine(eng, q.q);
            q.answers[eng.id] = { text: r.text, secs: Math.round((Date.now() - t) / 1000) };
            ok = true;
          } catch (e) {
            if (attempt === 2) q.answers[eng.id] = { text: '', error: String(e && e.message || e).slice(0, 100) };
            else await sleep(eng.gapMs * 4);
          }
        }
        st.done++;
        saveJob(job);
        await sleep(eng.gapMs);
      });
    }

    job.phase = 'analyze';
    const sum = { perEngine: {}, quotes: [] };
    for (const eng of CFG.engines) {
      if (!eng.enabled) continue;
      let aware = null, awareTotal = 0, mention = 0, mentionTotal = 0, comp = {};
      for (const q of job.questions) {
        const a = (q.answers[eng.id] || {}).text || '';
        if (!a) continue;
        if (q.cat === '品牌') {
          awareTotal++;
          const noinfo = NOINFO_RE.test(a);
          const ambig = AMBIG_RE.test(a);
          const brandHit = pats.some((p) => a.indexOf(p) !== -1);
          const hasReal = !noinfo && !ambig && brandHit && a.length > 150;
          if (hasReal) aware = (aware || 0) + 1;
          else if (sum.quotes.length < 6 && noinfo) {
            sum.quotes.push({ engine: eng.name, q: q.q, snippet: a.replace(/\s+/g, ' ').slice(0, 90) + '……' });
          }
        } else {
          mentionTotal++;
          mention += countHits(a, pats);
          for (const c of job.competitors) {
            const n = countHits(a, compPats[c]);
            if (n) comp[c] = (comp[c] || 0) + n;
          }
        }
      }
      sum.perEngine[eng.id] = { name: eng.name, aware: aware || 0, awareTotal, mention, mentionTotal, competitors: comp };
    }
    // 逐题判定统一下发（消除前后端双套逻辑漂移）
    for (const q of job.questions) {
      q.labels = {};
      for (const eng of CFG.engines) {
        if (!eng.enabled) continue;
        const a = (q.answers[eng.id] || {}).text || '';
        if (!a) { q.labels[eng.id] = '未答'; continue; }
        const noinfo = NOINFO_RE.test(a), ambig = AMBIG_RE.test(a);
        const hit = pats.some((p) => a.indexOf(p) !== -1);
        if (q.cat === '品牌') q.labels[eng.id] = (hit && !noinfo && !ambig) ? '有实料' : '无实料';
        else q.labels[eng.id] = hit ? '提及' : '未提及';
      }
    }
    // 提及性质分析：对品类/场景题中含品牌名的回答逐条判定
    job.phase = 'classify';
    const dsEng = CFG.engines.find(e => e.id === 'deepseek');
    if (dsEng && dsEng.enabled) {
      const hits = [];
      for (const q of job.questions) {
        if (q.cat === '品牌') continue;
        for (const eng of CFG.engines) {
          if (!eng.enabled) continue;
          const a = (q.answers[eng.id] || {}).text || '';
          if (a && countHits(a, pats)) hits.push({ qid: q.id, q: q.q, engine: eng.name, engineId: eng.id, text: a });
        }
      }
      const TYPES = ['主动推荐', '中性列举', '对比评价', '负面提及'];
      const details = [];
      await pool(hits.slice(0, 20), 2, async (h) => {
        try {
          const body = JSON.stringify({
            model: dsEng.model,
            messages: [
              { role: 'system', content: '你是市场分析师。只输出 JSON。' },
              { role: 'user', content: `买家问题：「${h.q}」\nAI 回答节选：「${h.text.slice(0, 600)}」\n判断该回答对品牌「${job.brand}」的提及性质。输出 {"type":"主动推荐|中性列举|对比评价|负面提及","quote":"回答中提及该品牌的一句原文"}。推荐选择或强调优势为主动推荐。罗列名单为中性别举。与其他品牌比较为对比评价。指出缺点为负面提及。` },
            ],
            max_tokens: 200, temperature: 0.3, stream: false,
          });
          const r = await fetch(dsEng.baseURL + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + dsEng.apiKey }, body, signal: AbortSignal.timeout(30000) });
          const d = await r.json();
          const raw = (d.choices[0].message.content || '').trim();
          const m = raw.match(/\{[\s\S]*\}/);
          const parsed = m ? JSON.parse(m[0]) : null;
          details.push({ qid: h.qid, q: h.q, engine: h.engine, type: parsed && TYPES.includes(parsed.type) ? parsed.type : '中性列举', quote: (parsed && parsed.quote ? String(parsed.quote) : '').slice(0, 120) });
        } catch {
          details.push({ qid: h.qid, q: h.q, engine: h.engine, type: '中性列举', quote: '' });
        }
      });
      details.sort((a, b) => a.qid - b.qid);
      sum.mentionDetail = details;
      const tc = { 主动推荐: 0, 中性列举: 0, 对比评价: 0, 负面提及: 0 };
      for (const d of details) tc[d.type]++;
      sum.mentionTypes = tc;
    }
    const engIds = Object.keys(sum.perEngine);
    const avgAware = engIds.length ? engIds.reduce((a, k) => a + (sum.perEngine[k].awareTotal ? sum.perEngine[k].aware / sum.perEngine[k].awareTotal : 0), 0) / engIds.length : 0;
    const totalMention = engIds.reduce((a, k) => a + sum.perEngine[k].mention, 0);
    const mentionCap = engIds.reduce((a, k) => a + sum.perEngine[k].mentionTotal, 0) || 1;
    const mentionRate = Math.min(1, totalMention / (mentionCap * 0.3)); // 每三题被提一次视为满
    const overall = avgAware * 0.5 + mentionRate * 0.5;
    sum.score = { overall: Math.round(overall * 100), awareRate: Math.round(avgAware * 100), mentionRate: Math.round(mentionRate * 100), grade: gradeOf(overall) };
    let compMax = 0;
    for (const k of engIds) for (const c in sum.perEngine[k].competitors) compMax = Math.max(compMax, sum.perEngine[k].competitors[c]);
    sum.advice = buildAdvice(job.brand, job.city, sum.perEngine, compMax);
    const dt = new Date(job.createdAt);
    const ds = dt.getFullYear() + String(dt.getMonth() + 1).padStart(2, '0') + String(dt.getDate()).padStart(2, '0');
    sum.reportNo = 'GEO-' + ds + '-' + job.id.slice(0, 6).toUpperCase();
    job.summary = sum;
    job.phase = 'done';
    job.durationSec = Math.round((Date.now() - t0) / 1000);
    saveJob(job);
  } catch (e) {
    job.phase = 'error';
    job.error = String(e && e.message || e);
    saveJob(job);
  }
}

// ---------- 限流 ----------
const ipCount = new Map(); // ip -> {day, n}
function allowIp(ip) {
  const day = new Date().toISOString().slice(0, 10);
  let rec = ipCount.get(ip);
  if (!rec || rec.day !== day) { rec = { day, n: 0 }; ipCount.set(ip, rec); }
  if (rec.n >= CFG.ipDailyLimit) return false;
  rec.n++;
  return true;
}

// ---------- HTTP ----------
function loadJob(id) {
  if (jobs.has(id)) return jobs.get(id);
  try {
    const d = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, id + '.json'), 'utf8'));
    jobs.set(id, d);
    return d;
  } catch { return null; }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > 4096) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch { reject(new Error('bad json')); } });
  });
}
// Markdown 内容协商（Cloudflare Agents Markdown 的自托管等价实现）：
// 为 HTML 页面找磁盘上的对应 .md——page.html 找 page.md；index.html 找同目录内唯一的 .md
// （gen-site 每品牌产出 <slug>/<slug>.md）。找不到返回 null 走原 HTML 逻辑
function mdForHtml(htmlPath) {
  if (!htmlPath.endsWith('.html')) return null;
  const cands = [htmlPath.slice(0, -5) + '.md'];
  if (path.basename(htmlPath) === 'index.html') {
    try {
      const mds = fs.readdirSync(path.dirname(htmlPath)).filter((f) => f.endsWith('.md'));
      if (mds.length === 1) cands.push(path.join(path.dirname(htmlPath), mds[0]));
    } catch { /* 目录读取失败 忽略 */ }
  }
  for (const c of cands) {
    try { fs.accessSync(c); return c; } catch { /* 不存在 继续找 */ }
  }
  return null;
}

let crawlerCache = null;
// 启动扫尾：服务重启后运行中的任务已成僵尸。统一标记为中断（P0-5）
try {
  for (const f of fs.readdirSync(JOBS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const p2 = path.join(JOBS_DIR, f);
      const j = JSON.parse(fs.readFileSync(p2, 'utf8'));
      if (j.phase && j.phase !== 'done' && j.phase !== 'error') {
        j.phase = 'error';
        j.error = '服务重启导致检测中断。请重新发起';
        fs.writeFileSync(p2, JSON.stringify(j), 'utf8');
      }
    } catch { /* 跳过损坏文件 */ }
  }
} catch { /* jobs 目录不存在时忽略 */ }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // SPA 以 /eeo/ 为 base（自建部署可能是 /geo/）：api/assets/data 请求剥掉路径前缀再路由
  const p = url.pathname.replace(/^\/(eeo|geo)(?=\/(api|assets|data)\/)/, '');
  try {
    if (req.method === 'POST' && p === '/api/start') {
      const body = await readBody(req);
      const brand = String(body.brand || '').replace(/[<>"'`&{}$]/g, '').trim().slice(0, 30);
      const industry = String(body.industry || '').trim().slice(0, 20) || '教育培训';
      const clean = (x) => String(x).replace(/[<>"'`&{}$]/g, '').trim();
      const competitors = String(body.competitors || '').split(/[,，、\s]+/).map(s => clean(s)).filter(Boolean).slice(0, 5);
      const website = String(body.website || '').trim().slice(0, 60);
      const city = String(body.city || '').trim().slice(0, 20);
      const audience = String(body.audience || '').trim().slice(0, 20);
      const depth = ['quick', 'standard', 'deep'].includes(body.depth) ? body.depth : 'quick';
      if (brand.length < 2) return json(res, 400, { error: '品牌名至少 2 个字' });
      if (!allowIp(clientIp(req))) return json(res, 429, { error: '今日检测次数已用完。明日可继续使用' });
      const id = crypto.randomBytes(6).toString('hex');
      const job = {
        id, brand, industry, competitors, website, city, audience, depth,
        createdAt: Date.now(), phase: 'gen', durationSec: 0,
        engines: CFG.engines.filter(e => e.enabled).map(e => ({ id: e.id, name: e.name, model: e.model, done: 0, total: 0 })),
        questions: [], summary: null, error: null,
      };
      jobs.set(id, job);
      saveJob(job);
      runPipeline(job); // 异步
      return json(res, 200, { jobId: id });
    }
    const mStatus = p.match(/^\/api\/status\/([a-f0-9]+)$/);
    if (req.method === 'GET' && mStatus) {
      const job = loadJob(mStatus[1]);
      if (!job) return json(res, 404, { error: 'not found' });
      return json(res, 200, {
        phase: job.phase, brand: job.brand, engines: job.engines.map(e => ({ ...e })),
        questionCount: job.questions.length, error: job.error,
      });
    }
    if (req.method === 'GET' && p === '/api/crawler') {
      // AI 爬虫访问监测：解析 nginx 日志（60 秒缓存）
      crawlerCache = crawlerCache && Date.now() - crawlerCache.at < 60000 ? crawlerCache : null;
      if (!crawlerCache) {
        const BOTS = [
          ['GPTBot', 'OpenAI 模型训练'], ['OAI-SearchBot', 'ChatGPT 搜索'], ['ChatGPT-User', 'ChatGPT 用户实访'],
          ['ClaudeBot', 'Anthropic 模型训练'], ['Claude-SearchBot', 'Claude 搜索'], ['claude-web', 'Claude 用户实访'],
          ['PerplexityBot', 'Perplexity 搜索'], ['Google-Extended', 'Gemini 训练'], ['Bytespider', '字节豆包'],
          ['YisouSpider', '有道搜索'], ['Amazonbot', '亚马逊 Alexa'], ['ccpb', '腾讯元宝'],
        ];
        let raw = '';
        try { raw = execSync("zcat -f /var/log/nginx/access.log* 2>/dev/null | head -c 20000000", { encoding: 'utf8', timeout: 20000 }); }
        catch (e) { raw = (e.stdout || ''); }
        const lineRe = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\w+) (\S+)[^"]*" (\d+) \S+ "[^"]*" "([^"]*)"/;
        const daily = {}, total = { hits: 0 };
        const bots = BOTS.map(([key, belong]) => ({ key, name: key, belong, hits: 0, lastSeen: '', paths: {} }));
        // 白名单：仅统计本站真实页面与文件的到访。剔除伪装 UA 的扫描
        const GOOD = ['/', '/free', '/courses', '/course/', '/shop', '/quiz', '/agent', '/works', '/about', '/terms', '/privacy', '/geo', '/eeo', '/directory', '/audit', '/data/', '/llms.txt', '/llms-full.txt', '/sitemap', '/robots.txt', '/img/', '/assets/', '/favicon', '/pay/', '/learn', '/enroll', '/me'];
        const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
        for (const line of raw.split('\n')) {
          const m = line.match(lineRe);
          if (!m) continue;
          const ua = m[6];
          const pathLower = m[4].toLowerCase();
          const pathOk = pathLower === '/' || GOOD.slice(1).some((g) => pathLower.startsWith(g));
          if (!pathOk) continue;
          for (const b of bots) {
            if (!ua.includes(b.key)) continue;
            b.hits++;
            const dm = m[2].match(/(\d+)\/(\w+)\/(\d+)/);
            const day = dm ? dm[3] + '-' + (MON[dm[2]] || dm[2]) + '-' + dm[1].padStart(2, '0') : m[2].slice(0, 11);
            daily[day] = (daily[day] || 0) + 1;
            total.hits++;
            if (day > b.lastSeen) b.lastSeen = day;
            if (!m[4].includes('.') && m[4] !== '/') b.paths[m[4]] = (b.paths[m[4]] || 0) + 1;
            break;
          }
        }
        for (const b of bots) b.topPaths = Object.entries(b.paths).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([p, n]) => p + ' ×' + n);
        crawlerCache = { at: Date.now(), total: total.hits, bots: bots.filter((b) => b.hits > 0).sort((x, y) => y.hits - x.hits), daily };
      }
      return json(res, 200, crawlerCache);
    }
    const mDraft = p.match(/^\/api\/draft\/([a-f0-9]+)$/);
    if (req.method === 'POST' && mDraft) {
      // 内容执行包：依据体检结果生成第三方内容草稿
      // 配额护栏：与检测同享日限流；refresh 重生成同任务最多 3 次（缓存 1 小时内本就直接返回）
      if (!allowIp(clientIp(req))) return json(res, 429, { error: '今日额度已用完。明日可继续使用' });
      const job = loadJob(mDraft[1]);
      if (!job) return json(res, 404, { error: 'not found' });
      if (job.drafts && Date.now() - job.drafts.at < 3600000 && !url.searchParams.get('refresh')) {
        return json(res, 200, job.drafts);
      }
      if (url.searchParams.get('refresh')) {
        job.draftRegen = (job.draftRegen || 0) + 1;
        if (job.draftRegen > 3) return json(res, 429, { error: '该报告的草稿重生成次数已用完' });
        saveJob(job);
      }
      const ds = CFG.engines.find(e => e.id === 'deepseek');
      if (!ds || !ds.enabled) return json(res, 503, { error: '引擎不可用' });
      const catQs = (job.questions || []).filter(q => q.cat !== '品牌').slice(0, 6).map(q => q.q).join('\n');
      const usr =
        `品牌：「${job.brand}」
行业：${job.industry} ${job.city ? '（' + job.city + '）' : ''}
目标客户：${job.audience || '未填'}
竞品：${job.competitors.length ? job.competitors.join('、') : '未填'}
` +
        `该品牌的典型买家问题：
${catQs}

` +
        `请为该品牌的 EEO 第三方内容铺设生成四份草稿。铁律：禁止编造任何事实——不得虚构第一人称使用经历、价格数字、线下活动、企业事实、口号；凡涉及具体事实（价格、地址、活动、数据）一律用【待填】占位；口吻自然、不浮夸、必须自然包含品牌实名：
` +
        `1. platform="知乎回答1"：选一个买家问题，以从业者视角写专业回答（400字左右），观点客观，品牌作为其中一个选项自然出现
` +
        `2. platform="知乎回答2"：换一个买家问题，以用户/家长视角写体验向回答（400字左右）
` +
        `3. platform="公众号文章大纲"：标题+五段式大纲，每段两句话说明
` +
        `4. platform="百科词条文案"：品牌简介一段（200字），客观陈述式
` +
        `只输出 JSON：{"drafts":[{"platform":"...","title":"...","content":"..."}]}`;
      try {
        const body = JSON.stringify({ model: ds.model, messages: [{ role: 'system', content: '你是内容策划。只输出 JSON。' }, { role: 'user', content: usr }], max_tokens: 6000, temperature: 0.6, stream: false });
        const r = await fetch(ds.baseURL + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ds.apiKey }, body, signal: AbortSignal.timeout(180000) });
        const d = await r.json();
        const raw = (d.choices[0].message.content || '').trim();
        const m2 = raw.match(/\{[\s\S]*\}/);
        if (!m2) return json(res, 502, { error: '草稿生成失败。稍后重试' });
        const parsed = JSON.parse(m2[0]);
        const drafts = { at: Date.now(), items: (parsed.drafts || []).filter(x => x.platform && x.content) };
        job.drafts = drafts;
        saveJob(job);
        return json(res, 200, drafts);
      } catch (e) {
        return json(res, 502, { error: '草稿生成失败。稍后重试' });
      }
    }
    if (req.method === 'GET' && p === '/api/history') {
      const brand = String(url.searchParams.get('brand') || '').trim();
      if (!brand) return json(res, 400, { error: 'missing brand' });
      const list = [];
      for (const f of fs.readdirSync(JOBS_DIR)) {
        if (!f.endsWith('.json')) continue;
        try {
          const j = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f), 'utf8'));
          if (j.phase !== 'done' || !j.summary || (j.brand || '').trim() !== brand) continue;
          const sc = j.summary.score || {};
          list.push({
            id: j.id, createdAt: j.createdAt, depth: j.depth, reportNo: j.summary.reportNo || '',
            grade: sc.grade ? sc.grade.g : '-', overall: sc.overall || 0,
            aware: Object.values(j.summary.perEngine || {}).reduce((a, s) => a + s.aware, 0),
                awareTotal: Object.values(j.summary.perEngine || {}).reduce((a, s) => a + s.awareTotal, 0),
            mention: Object.values(j.summary.perEngine || {}).reduce((a, s) => a + s.mention, 0),
          });
        } catch { /* 跳过损坏文件 */ }
      }
      list.sort((a, b) => a.createdAt - b.createdAt);
      return json(res, 200, { brand, count: list.length, reports: list });
    }
    const mReport = p.match(/^\/api\/report\/([a-f0-9]+)$/);
    if (req.method === 'GET' && mReport) {
      const job = loadJob(mReport[1]);
      if (!job) return json(res, 404, { error: 'not found' });
      const { id, brand, industry, competitors, website, city, audience, depth, createdAt, phase, engines, questions, summary, durationSec, error, drafts, reusedBank } = job;
      return json(res, 200, { id, brand, industry, competitors, website, city, audience, depth, createdAt, phase, engines, questions, summary, durationSec, error, drafts, reusedBank });
    }
    // 静态：dist 产物（assets）+ SPA 路由（/ 与 /r/{id}）
    if (req.method === 'GET') {
      const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };
      const PUB = path.join(ROOT, 'public');
      let filePath = null;
      if (p.startsWith('/assets/') || p.startsWith('/data/')) {
        const safe = path.normalize(path.join(PUB, p));
        if (safe.startsWith(PUB)) filePath = safe;
      } else if (!p.startsWith('/api')) {
        // SPA fallback：其余 GET 路径一律返回单页（/、/method、/start、/r/* 等）
        filePath = path.join(PUB, 'index.html');
      }
      if (filePath) {
        // 内容协商：Accept 含 text/markdown 且存在对应 .md 时返回 Markdown 版（text/markdown）
        if (String(req.headers.accept || '').includes('text/markdown')) {
          const md = mdForHtml(filePath);
          if (md) {
            try {
              const mbuf = fs.readFileSync(md);
              res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache' });
              return res.end(mbuf);
            } catch { /* 读取失败 回退 HTML */ }
          }
        }
        try {
          const buf = fs.readFileSync(filePath);
          res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
            'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=86400',
          });
          return res.end(buf);
        } catch { /* 落到 404 */ }
      }
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(CFG.port, '127.0.0.1', () => {
  console.log('[geo-audit] listening on 127.0.0.1:' + CFG.port);
});

// 供测试与二次开发取用（node server.cjs 直接启动时此赋值无副作用）
if (typeof module !== 'undefined') {
  module.exports = { coreWord, countHits, NOINFO_RE, AMBIG_RE, DEPTHS, gradeOf, askEngine, genQuestions, pool, buildAdvice };
}
