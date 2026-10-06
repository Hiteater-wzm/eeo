#!/usr/bin/env node
// EEO 发布引擎：品牌信息卡 → AI 友好静态站点（零依赖，纯 Node 字符串模板）
// 用法：
//   node tools/gen-site.cjs examples/brand-profile-card.json --out site/
//   node tools/gen-site.cjs datasets/brands-1k.json --out sites/     批量：每品牌一个子目录
//   可选 --theme light|dark（默认 light）
// 每品牌产出 index.html / {slug}.md / llms.txt / brand.jsonld / robots.txt
// 批量模式额外产出根目录 index.html（品牌目录页）llms.txt（全量索引）AGENTS.md 与 robots.txt

const fs = require('fs');
const path = require('path');

// ---------- 设计系统常量 ----------
const YELLOW = '#FFDE59';
// 评级配色与短语（对齐 core.cjs gradeOf）
const GRADE_STYLE = {
  S: { bg: '#FFDE59', fg: '#000000', phrase: 'AI 眼中的默认选项' },
  A: { bg: '#00C853', fg: '#000000', phrase: '认知稳固 推荐在列' },
  B: { bg: '#000000', fg: '#FFFFFF', phrase: '有认知 推荐缺席' },
  C: { bg: '#FF8A00', fg: '#000000', phrase: '边缘存在' },
  D: { bg: '#FF4D4D', fg: '#FFFFFF', phrase: 'AI 视野之外' },
};
const CLAIM_METHOD = { 'domain-file': '官网文件核验', 'manual-review': '人工审核' };
const CONFIDENCE_TXT = { high: '高', medium: '中', low: '低' };
const DEPTH_LABEL = { quick: '快速体检', standard: '标准体检', deep: '深度体检' };
// hiteater 站同款 AI 爬虫名单（全量放行）
const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-SearchBot', 'claude-web',
  'PerplexityBot', 'Google-Extended',
  'Bytespider', 'YisouSpider', 'Amazonbot', 'ccpb',
];

// ---------- 基础工具 ----------
function str(v) { return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim()); }
function arr(v) { return Array.isArray(v) ? v.map(str).filter(Boolean) : []; }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jsonForEmbed(o) { return JSON.stringify(o, null, 2).replace(/</g, '\\u003c'); }
function firstSentence(s, max) {
  const t = str(s).split(/[。！？!?]/)[0].replace(/[,，、；;]$/, '');
  return t.length > max ? t.slice(0, max) : t;
}

// ---------- slug：去空格与特殊字符，中文保留 ----------
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
function slugify(name, used) {
  let s = str(name)
    .replace(/[\s\u00A0]+/g, '-')
    .replace(/[^\u4e00-\u9fffA-Za-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s || WIN_RESERVED.test(s)) s = 'b-' + (s || 'brand');
  const base = s;
  let i = 2;
  while (used.has(s)) s = base + '-' + i++;
  used.add(s);
  return s;
}

// ---------- latest_audit 解析（大字母徽章） ----------
function auditOf(b) {
  const la = b.latest_audit;
  if (!la || typeof la !== 'object') return null;
  let g = la.grade, phrase = '';
  if (g && typeof g === 'object') { phrase = str(g.t); g = g.g; }
  g = str(g).toUpperCase().slice(0, 1);
  if (!g) return null;
  const st = GRADE_STYLE[g] || { bg: YELLOW, fg: '#000000', phrase: '' };
  const score = la.score;
  return {
    g, bg: st.bg, fg: st.fg, phrase: phrase || st.phrase || '',
    date: str(la.date || la.auditedAt || la.time),
    score: typeof score === 'number' ? String(score) : str(score),
    depth: DEPTH_LABEL[str(la.depth)] || str(la.depth),
  };
}

// ---------- 主题 ----------
const THEMES = {
  light: {
    bg: '#FFFBEB', ink: '#000000', card: '#FFFFFF', line: '#000000', shadow: '#000000',
    muted: '#5C5340', link: '#000000', hover: '#FDF3CD',
    footbg: '#000000', footink: '#FFDE59', mark: '#FFFBEB',
  },
  dark: {
    bg: '#0A0A0A', ink: '#FFFBEB', card: '#161616', line: '#FFDE59', shadow: '#FFDE59',
    muted: '#C7BFA8', link: '#FFDE59', hover: '#1F1D16',
    footbg: '#FFDE59', footink: '#000000', mark: '#0A0A0A',
  },
};

function css(t) {
  return `*,*::before,*::after{box-sizing:border-box;border-radius:0!important}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:${t.bg};color:${t.ink};font:16px/1.75 "PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",Arial,sans-serif}
a{color:${t.link};font-weight:700;text-decoration:underline;text-decoration-color:${YELLOW};text-decoration-thickness:3px;overflow-wrap:anywhere}
a:hover{background:${YELLOW};color:#000}
.mast{border-bottom:3px solid ${t.line};background:${t.bg}}
.mast-in{max-width:880px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;gap:12px}
.mark{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:3px solid ${t.line};background:${YELLOW};color:#000;font-weight:900;font-size:13px;box-shadow:3px 3px 0 ${t.shadow};flex:none}
.mast b{font-size:15px;font-weight:900;letter-spacing:3px}
.mast .badge{margin-left:auto}
main{max-width:880px;margin:0 auto;padding:34px 20px 54px}
h1{font-size:38px;line-height:1.25;margin:0;letter-spacing:1px}
.alias{color:${t.muted};font-size:15px;margin:8px 0 0}
address{font-style:normal;display:inline-block;margin:12px 0 0;font-size:14px;font-weight:700;border:2px solid ${t.line};background:${t.card};padding:2px 12px}
.badge{display:inline-block;border:2px solid ${t.line};padding:1px 10px;font-size:13px;font-weight:900;letter-spacing:2px}
.badge.on{background:${YELLOW};color:#000}
.badge.off{background:${t.card};color:${t.muted}}
.card{background:${t.card};border:3px solid ${t.line};box-shadow:4px 4px 0 ${t.shadow};padding:22px 24px;margin:26px 0}
h2{font-size:19px;margin:0 0 14px;padding-left:10px;border-left:8px solid ${YELLOW};letter-spacing:1px}
dl{display:grid;grid-template-columns:112px 1fr;gap:8px 18px;margin:0}
dt{font-weight:900;font-size:14px;color:${t.muted};padding-top:2px}
dd{margin:0;overflow-wrap:anywhere}
.lead{font-size:17px;margin:0}
ol.adv{margin:0;padding:0;list-style:none;counter-reset:adv}
ol.adv li{counter-increment:adv;position:relative;padding:7px 0 7px 46px}
ol.adv li::before{content:counter(adv);position:absolute;left:0;top:9px;width:30px;height:30px;border:2px solid ${t.line};background:${YELLOW};color:#000;font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center}
ul.src{margin:0;padding:0;list-style:none}
ul.src li{padding:4px 0;border-top:2px dashed ${t.muted}}
ul.src li:first-child{border-top:none}
.audit{display:flex;gap:22px;align-items:center;flex-wrap:wrap}
.gradebox{width:86px;height:86px;border:3px solid ${t.line};font-size:52px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:4px 4px 0 ${t.shadow};flex:none}
.audit-meta p{margin:2px 0;font-size:14px;color:${t.muted}}
.audit-meta .phrase{font-size:17px;font-weight:900;color:${t.ink}}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{border:2px solid ${t.line};padding:8px 12px;text-align:left;vertical-align:top}
th{background:${YELLOW};color:#000;font-weight:900;white-space:nowrap}
tbody tr:hover{background:${t.hover}}
.count{font-size:14px;font-weight:900;letter-spacing:1px;color:${t.muted};margin:0 0 18px}
footer{border-top:3px solid ${t.line};background:${t.footbg};color:${t.footink}}
footer .in{max-width:880px;margin:0 auto;padding:16px 20px;font-size:13px;font-weight:700;letter-spacing:1px}
footer a{color:inherit;border-bottom-color:currentColor}
@media(max-width:640px){h1{font-size:30px}dl{grid-template-columns:1fr}dt{padding-top:0}}`;
}

// ---------- robots.txt ----------
// Content Signals 用途指令（IETF AIPREF 草案格式）：EEO 默认姿态为全面开放 三项均 yes
// 不识别这些指令的老爬虫会按 robots 规范直接忽略 不影响原有放行
const AI_SIGNALS = 'Search: yes\nAI-Input: yes\nAI-Train: yes';
function robotsTxt() {
  const blocks = AI_BOTS.map((b) => `User-agent: ${b}\nAllow: /\n${AI_SIGNALS}`).join('\n\n');
  return `# EEO 品牌信息站\n# 向主流 AI 爬虫与搜索引擎全面开放抓取\n# Search/AI-Input/AI-Train 为 Content Signals 用途指令（IETF AIPREF 草案）\n\nUser-agent: *\nAllow: /\n\n${blocks}\n`;
}

// ---------- JSON-LD ----------
function buildJsonLd(b) {
  const o = { '@context': 'https://schema.org', '@type': 'Organization', name: str(b.name) };
  const aliases = arr(b.aliases);
  if (aliases.length) o.alternateName = aliases.length === 1 ? aliases[0] : aliases;
  if (str(b.legalName)) o.legalName = str(b.legalName);
  if (str(b.website)) o.url = str(b.website);
  if (str(b.description)) o.description = str(b.description);
  if (str(b.founded)) o.foundingDate = str(b.founded);
  const city = str(b.city), country = str(b.country);
  if (city || country) {
    o.address = { '@type': 'PostalAddress' };
    if (city) o.address.addressLocality = city;
    if (country) o.address.addressCountry = country;
  }
  const tel = str(b.telephone), mail = str(b.email);
  if (tel || mail) {
    o.contactPoint = { '@type': 'ContactPoint' };
    if (tel) o.contactPoint.telephone = tel;
    if (mail) o.contactPoint.email = mail;
  }
  return o;
}

// ---------- llms.txt ----------
// 认领状态一行字（llms.txt 与 {slug}.md 共用 同一份数据两种渲染）
function claimText(claim) {
  if (!claim || claim.status !== 'claimed') return '未认领';
  const m = CLAIM_METHOD[str(claim.method)] || str(claim.method);
  let v = '已认领';
  if (m) v += `（${m}`;
  if (str(claim.claimedAt)) v += ` ${str(claim.claimedAt)}`;
  if (m) v += '）';
  return v;
}
function buildLlms(b) {
  const L = [];
  L.push(`# ${str(b.name)}`, '');
  if (str(b.description)) L.push(`> ${str(b.description)}`, '');
  const rows = [
    ['官方网站', str(b.website)],
    ['所属行业', str(b.industry)],
    ['所在城市', str(b.city)],
    ['所在国家', str(b.country)],
    ['成立年份', str(b.founded)],
    ['别名', arr(b.aliases).join('、')],
    ['法定主体', str(b.legalName)],
  ];
  rows.push(['认领状态', claimText(b.claim)]);
  if (str(b.confidence)) rows.push(['信息置信度', CONFIDENCE_TXT[str(b.confidence)] || str(b.confidence)]);
  for (const [k, v] of rows) if (v) L.push(`- ${k}: ${v}`);
  const adv = arr(b.advantages);
  if (adv.length) {
    L.push('', '## 优势', '');
    for (const a of adv) L.push(`- ${a}`);
  }
  const src = arr(b.sources);
  if (src.length) {
    L.push('', '## 信息来源', '');
    for (const s of src) L.push(`- ${s}`);
  }
  L.push('', '---', '', '依据 EEO 品牌信息规范（eeo.brand.v1）生成', '');
  return L.join('\n');
}

// ---------- 品牌页 Markdown（{slug}.md 与 index.html 同源 同一品牌卡渲染两种格式） ----------
function brandMd(b, slug) {
  const name = str(b.name);
  const aliases = arr(b.aliases);
  const industry = str(b.industry), city = str(b.city), country = str(b.country);
  const website = str(b.website), desc = str(b.description), founded = str(b.founded);
  const legalName = str(b.legalName);
  const conf = CONFIDENCE_TXT[str(b.confidence)] || str(b.confidence);
  const adv = arr(b.advantages);
  const src = arr(b.sources);
  const history = arr((b.claim || {}).history);
  const audit = auditOf(b);

  // 标题与网页版一致：行业在前 缺则取描述首句 再缺取城市
  const oneLine = industry || firstSentence(desc, 40) || city;
  const pageTitle = oneLine ? `${name} ${oneLine}` : name;

  const L = [];
  L.push(`# ${pageTitle}`, '');
  if (aliases.length) L.push(`别名：${aliases.join('、')}`, '');
  if (desc) L.push(`> ${desc}`, '');
  L.push(`[网页版](index.html) · [llms.txt](llms.txt) · [brand.jsonld](brand.jsonld)`, '');

  const loc = [country, city].filter(Boolean).join(' ');
  const rows = [
    ['所属行业', industry],
    ['所在城市', loc],
    ['成立年份', founded],
    ['法定主体', legalName],
    ['官方网站', website ? `[${website}](${website})` : ''],
    ['认领状态', claimText(b.claim)],
    ['信息置信度', conf],
  ];
  for (const [k, v] of rows) if (v) L.push(`- ${k}: ${v}`);

  if (audit) {
    L.push('', '## 最近检测评级', '', `**${audit.g}**${audit.phrase ? '　' + audit.phrase : ''}`);
    const meta = [audit.depth, audit.date ? `检测日期 ${audit.date}` : '', audit.score ? `综合得分 ${audit.score}` : ''].filter(Boolean).join('　');
    if (meta) L.push('', meta);
  }
  if (adv.length) {
    L.push('', '## 可核验优势', '');
    adv.forEach((a, i) => L.push(`${i + 1}. ${a}`));
  }
  if (history.length) {
    L.push('', '## 认领记录', '');
    history.forEach((h, i) => L.push(`${i + 1}. ${h}`));
  }
  if (src.length) {
    L.push('', '## 信息来源', '');
    for (const s of src) L.push(`- [${s}](${s})`);
  }
  L.push('', '---', '', '依据 EEO 品牌信息规范（eeo.brand.v1）生成', '');
  return L.join('\n');
}

// ---------- 品牌页 HTML ----------
function brandHtml(b, theme, slug) {
  const t = THEMES[theme];
  const name = str(b.name);
  const aliases = arr(b.aliases);
  const industry = str(b.industry), city = str(b.city), country = str(b.country);
  const website = str(b.website), desc = str(b.description), founded = str(b.founded);
  const legalName = str(b.legalName);
  const claim = b.claim || {};
  const claimed = claim.status === 'claimed';
  const conf = CONFIDENCE_TXT[str(b.confidence)] || str(b.confidence);
  const adv = arr(b.advantages);
  const src = arr(b.sources);
  const history = arr(claim.history);
  const audit = auditOf(b);

  // 标题一句话：行业在前 缺则取描述首句 再缺取城市
  const oneLine = industry || firstSentence(desc, 40) || city;
  const pageTitle = oneLine ? `${name} ${oneLine}` : name;
  const metaDesc = desc || [name, industry, '品牌信息'].filter(Boolean).join(' ');

  // 头部：认领状态 徽章
  const badge = `<span class="badge ${claimed ? 'on' : 'off'}">${claimed ? '已认领' : '未认领'}</span>`;

  // 评级徽章区（latest_audit 缺失则整块不输出）
  let auditHtml = '';
  if (audit) {
    const meta = [];
    if (audit.phrase) meta.push(`<p class="phrase">${esc(audit.phrase)}</p>`);
    const line = [audit.depth, audit.date ? `检测日期 ${esc(audit.date)}` : '', audit.score ? `综合得分 ${esc(audit.score)}` : ''].filter(Boolean).join('　');
    if (line) meta.push(`<p>${esc(line)}</p>`);
    auditHtml = `<section class="card audit"><div class="gradebox" style="background:${audit.bg};color:${audit.fg}">${esc(audit.g)}</div><div class="audit-meta"><h2>最近检测评级</h2>${meta.join('')}</div></section>`;
  }

  // 基本信息
  const infoRows = [
    ['所属行业', industry],
    ['所在城市', city],
    ['所在国家', country],
    ['成立年份', founded],
    ['法定主体', legalName],
    ['信息置信度', conf],
  ];
  let infoDl = '';
  const hasInfo = infoRows.some((r) => r[1]);
  if (hasInfo) {
    infoDl = `<dl>${infoRows.filter((r) => r[1]).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  }
  const locParts = [country, city].filter(Boolean).join(' ');
  const addressTag = locParts ? `\n    <address>${esc(locParts)}</address>` : '';

  const sections = [];
  if (auditHtml) sections.push(auditHtml);
  if (hasInfo) sections.push(`<section class="card"><h2>基本信息</h2>${infoDl}</section>`);
  if (desc) sections.push(`<section class="card"><h2>业务概述</h2><p class="lead">${esc(desc)}</p></section>`);
  if (website) sections.push(`<section class="card"><h2>官方网站</h2><p class="lead"><a href="${esc(website)}" rel="noopener">${esc(website)}</a></p></section>`);
  if (adv.length) sections.push(`<section class="card"><h2>可核验优势</h2><ol class="adv">${adv.map((a) => `<li>${esc(a)}</li>`).join('')}</ol></section>`);
  if (claimed && (str(claim.method) || str(claim.claimedAt) || history.length)) {
    const crows = [
      ['认领方式', CLAIM_METHOD[str(claim.method)] || str(claim.method)],
      ['认领时间', str(claim.claimedAt)],
    ].filter((r) => r[1]);
    let inner = crows.length ? `<dl>${crows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '';
    if (history.length) inner += `<h2>认领记录</h2><ol class="adv">${history.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>`;
    sections.push(`<section class="card"><h2>认领信息</h2>${inner}</section>`);
  }
  if (src.length) sections.push(`<section class="card"><h2>信息来源</h2><ul class="src">${src.map((s) => `<li><a href="${esc(s)}" rel="noopener">${esc(s)}</a></li>`).join('')}</ul></section>`);

  const og = [
    ['og:title', pageTitle],
    ['og:description', metaDesc],
    ['og:type', 'website'],
    ['og:site_name', 'EEO 品牌信息'],
    ['og:locale', 'zh_CN'],
  ];
  if (website) og.push(['og:url', website]);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${t.bg}">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(metaDesc)}">
${og.map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`).join('\n')}
<script type="application/ld+json">
${jsonForEmbed(buildJsonLd(b))}
</script>
<style>
${css(t)}
</style>
</head>
<body>
<header class="mast">
  <div class="mast-in">
    <span class="mark">EEO</span><b>品牌信息</b>${badge}
  </div>
</header>
<main>
  <article>
    <h1>${esc(name)}</h1>${aliases.length ? `\n    <p class="alias">别名 ${esc(aliases.join('、'))}</p>` : ''}${addressTag}
    ${sections.join('\n    ')}
  </article>
</main>
<footer>
  <div class="in">本页依据 EEO 品牌信息规范生成　机器可读版本见 <a href="llms.txt">llms.txt</a> 与 <a href="brand.jsonld">brand.jsonld</a>　Markdown 版见 <a href="${esc(slug)}.md">${esc(slug)}.md</a></div>
</footer>
</body>
</html>
`;
}

// ---------- 目录页 HTML（批量模式） ----------
function dirJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map(({ slug, brand: b }, i) => ({
      '@type': 'ListItem', position: i + 1, url: `${slug}/`, name: str(b.name),
    })),
  };
}
function dirHtml(items, theme) {
  const t = THEMES[theme];
  const rows = items.map(({ slug, brand: b }) => {
    const audit = auditOf(b);
    const grade = audit
      ? `<span class="gradebox" style="width:26px;height:26px;font-size:15px;background:${audit.bg};color:${audit.fg};box-shadow:2px 2px 0 ${t.shadow}">${esc(audit.g)}</span>`
      : '';
    return `<tr><td><a href="${esc(slug)}/">${esc(str(b.name))}</a></td><td>${esc(str(b.industry))}</td><td>${esc(str(b.city))}</td><td>${grade}</td></tr>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${t.bg}">
<title>品牌目录</title>
<meta name="description" content="EEO 品牌信息目录 共 ${items.length} 个品牌">
<meta property="og:title" content="品牌目录">
<meta property="og:description" content="EEO 品牌信息目录 共 ${items.length} 个品牌">
<meta property="og:type" content="website">
<meta property="og:site_name" content="EEO 品牌信息">
<meta property="og:locale" content="zh_CN">
<script type="application/ld+json">
${jsonForEmbed(dirJsonLd(items))}
</script>
<style>
${css(t)}
</style>
</head>
<body>
<header class="mast">
  <div class="mast-in">
    <span class="mark">EEO</span><b>品牌目录</b>
  </div>
</header>
<main>
  <h1>品牌目录</h1>
  <p class="count">共 ${items.length} 个品牌</p>
  <section class="card" style="padding:0;overflow:auto">
    <table>
      <thead><tr><th>名称</th><th>行业</th><th>城市</th><th>评级</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </section>
</main>
<footer>
  <div class="in">本目录依据 EEO 品牌信息规范生成　各品牌详情见子站</div>
</footer>
</body>
</html>
`;
}

// ---------- 根目录 llms.txt（批量模式 全量索引 每品牌 HTML 与 .md 双链接） ----------
function dirLlms(items) {
  const L = [
    '# EEO 品牌信息目录',
    '',
    `> 共 ${items.length} 个品牌的官方信息站，依据 EEO 品牌信息规范（eeo.brand.v1）生成。每个品牌同时提供网页版与 Markdown 版。`,
    '',
  ];
  for (const { slug, brand: b } of items) {
    const bits = [str(b.industry), str(b.city)].filter(Boolean).join('　');
    L.push(`- [${str(b.name)}](${slug}/)（[md](${slug}/${slug}.md)）${bits ? ': ' + bits : ''}`);
  }
  L.push('');
  return L.join('\n');
}

// ---------- 根目录 AGENTS.md（批量模式 告诉 AI Agent 这批站点是什么） ----------
function agentsMd(items) {
  return `# EEO 品牌信息站

这是 EEO 品牌信息库的静态发布，共 ${items.length} 个品牌，由 tools/gen-site.cjs 从品牌卡数据集生成。每个子目录是一个品牌的官方信息站。

## 目录约定

- \`<slug>/index.html\`：品牌信息页，人类访问的网页版
- \`<slug>/<slug>.md\`：同一页面的 Markdown 版，与 index.html 出自同一份品牌卡数据
- \`<slug>/llms.txt\` 与 \`<slug>/brand.jsonld\`：单品牌机器可读版本
- \`llms.txt\`：全量索引，每个品牌同时给 HTML 与 .md 两个链接
- \`robots.txt\`：AI 爬虫放行名单，附 Content Signals 用途指令（Search / AI-Input / AI-Train）

## 维护规则

- 本目录全部是生成产物，不要手改。要修正信息，改品牌卡 JSON 后重跑 node tools/gen-site.cjs <数据集> --out <目录>
- slug 由品牌名生成（中文保留，空格与特殊字符去除），同批次重名自动追加 -2、-3 后缀
- 数据结构遵循 EEO 品牌信息规范 eeo.brand.v1
- 自托管版 server.cjs 已内置内容协商：请求头 Accept 含 text/markdown 时，同一 URL 返回对应 .md
`;
}
function writeFiles(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c, 'utf8');
}

// ---------- CLI ----------
function usage() {
  return [
    'EEO 站点生成器（零依赖）',
    '',
    '用法:',
    '  node tools/gen-site.cjs <品牌卡 JSON> --out <目录> [--theme light|dark]',
    '  node tools/gen-site.cjs <数据集 JSON 数组> --out <目录> [--theme light|dark]',
    '',
    '说明:',
    '  单品牌：五个文件直接写入输出目录（index.html、{slug}.md、llms.txt、brand.jsonld、robots.txt）',
    '  批量：每品牌一个子目录（名称 slug 化） 额外生成根目录页、全量 llms.txt、AGENTS.md 与 robots.txt',
    '  主题：light 奶油白底（默认） dark 黑底黄字',
  ].join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('-h') || argv.includes('--help')) { console.log(usage()); process.exit(argv.length ? 0 : 1); }
  const input = argv[0];
  const opts = { out: null, theme: 'light' };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = argv[++i];
    else if (argv[i] === '--theme') opts.theme = argv[++i];
    else { console.error('错误 无法识别的参数 ' + argv[i]); process.exit(1); }
  }
  if (!opts.out) { console.error('错误 缺少 --out 输出目录'); process.exit(1); }
  if (!THEMES[opts.theme]) { console.error('错误 主题仅支持 light 或 dark'); process.exit(1); }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  } catch (e) {
    console.error('错误 输入文件读取或解析失败 ' + e.message);
    process.exit(1);
  }

  const t0 = Date.now();
  const outRoot = path.resolve(opts.out);
  const FILES = ['index.html', '{slug}.md', 'llms.txt', 'brand.jsonld', 'robots.txt'];
  const robots = robotsTxt();

  if (Array.isArray(data)) {
    // 批量模式
    const used = new Set();
    const items = data.map((b) => ({ slug: slugify(b.name, used), brand: b }));
    let n = 0;
    for (const it of items) {
      writeFiles(path.join(outRoot, it.slug), {
        'index.html': brandHtml(it.brand, opts.theme, it.slug),
        [`${it.slug}.md`]: brandMd(it.brand, it.slug),
        'llms.txt': buildLlms(it.brand),
        'brand.jsonld': jsonForEmbed(buildJsonLd(it.brand)) + '\n',
        'robots.txt': robots,
      });
      n++;
      if (n % 200 === 0) console.log(`进度 ${n}/${items.length}`);
    }
    writeFiles(outRoot, {
      'index.html': dirHtml(items, opts.theme),
      'llms.txt': dirLlms(items),
      'AGENTS.md': agentsMd(items),
      'robots.txt': robots,
    });
    console.log(`模式  批量 ${items.length} 个品牌`);
    console.log(`主题  ${opts.theme}`);
    console.log(`输出  ${outRoot}`);
    console.log(`每品牌  ${FILES.join(' ')}`);
    console.log(`根目录  index.html llms.txt AGENTS.md robots.txt`);
    console.log(`完成  耗时 ${Date.now() - t0} 毫秒`);
  } else if (data && typeof data === 'object' && str(data.name)) {
    // 单品牌模式
    const slug = slugify(data.name, new Set());
    writeFiles(outRoot, {
      'index.html': brandHtml(data, opts.theme, slug),
      [`${slug}.md`]: brandMd(data, slug),
      'llms.txt': buildLlms(data),
      'brand.jsonld': jsonForEmbed(buildJsonLd(data)) + '\n',
      'robots.txt': robots,
    });
    console.log('模式  单品牌');
    console.log(`主题  ${opts.theme}`);
    console.log(`输出  ${outRoot}`);
    console.log(`写入  ${FILES.join(' ')}`);
    console.log(`完成  耗时 ${Date.now() - t0} 毫秒`);
  } else {
    console.error('错误 无法识别的输入格式 需为品牌卡对象或品牌数组');
    process.exit(1);
  }
}

main();
