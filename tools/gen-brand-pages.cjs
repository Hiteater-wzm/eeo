#!/usr/bin/env node
'use strict';
/*
 * gen-brand-pages.cjs — 为 AI 引擎生成可抓取的品牌静态页（Pages 部署时运行，产物不入库）
 *
 * 两类产物（--out 目录，默认 public/brands）：
 *   1) 品牌详情页 brands/<QID>.html + brands/<QID>.md
 *      覆盖：brands-1k 种子集 ∪ 已认领/已验证条目 ∪ 注册表质量序前 --top N 条（默认 5000）
 *      HTML 含 JSON-LD（Organization）与零依赖内联样式；MD 为同内容纯文本版（AI 直读）
 *   2) 全库名字索引 brands/index/<首字符>/<页码>.html
 *      每页 2000 行 "QID 名称"（纯文本，供爬虫建立全库名单），brands/index.html 为总入口
 *
 * 确定性：同输入同输出（顺序固定：注册表序）。
 */
const fs = require('fs');
const path = require('path');
const { readRegistry } = require('./registry-lib.cjs');

const ROOT = path.join(__dirname, '..');

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CLAIM_LABEL = { unclaimed: '未认领', claimed: '已认领', verified: '已验证', claiming: '认领中' };
const CONF_LABEL = { high: '高', medium: '中', low: '低' };

function parseArgs() {
  const argv = process.argv.slice(2);
  const opt = { out: 'public/brands', top: 5000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opt.out = argv[++i];
    else if (argv[i] === '--top') opt.top = parseInt(argv[++i], 10) || 0;
  }
  return opt;
}

function brandHtml(c, mdUrl) {
  const status = (c.claim && c.claim.status) || 'unclaimed';
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: c.name,
    alternateName: (c.aliases || []).slice(0, 5),
    url: c.website || undefined,
    description: c.description || undefined,
    address: [c.city, c.country].filter(Boolean).join(', ') || undefined,
    identifier: c.wikidata ? [{ '@type': 'PropertyValue', name: 'Wikidata QID', value: c.wikidata }] : undefined,
  };
  const row = (k, v) => (v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : '');
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.name)} - EEO Brand Card</title>
<meta name="description" content="${esc((c.description || c.name).slice(0, 150))}">
<link rel="alternate" type="text/markdown" href="${mdUrl}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>body{font-family:system-ui,sans-serif;margin:0;color:#111}main{max-width:720px;margin:0 auto;padding:24px 16px}table{border-collapse:collapse}th,td{text-align:left;padding:4px 16px 4px 0;vertical-align:top}a{color:#111}footer{border-top:1px solid #ddd;margin-top:32px;padding-top:12px;color:#666;font-size:13px}h1{margin-bottom:4px}.alias{color:#666;margin-top:0}</style>
</head>
<body>
<main>
<h1>${esc(c.name)}</h1>
${(c.aliases || []).length ? `<p class="alias">${esc(c.aliases.join('　'))}</p>` : ''}
${c.description ? `<p>${esc(c.description)}</p>` : ''}
<table>
${row('行业', c.industry)}${row('城市', c.city)}${row('国家/地区', c.country)}${row('成立年份', c.founded)}
<tr><th>认领状态</th><td>${CLAIM_LABEL[status] || status}</td></tr>
<tr><th>置信度</th><td>${CONF_LABEL[c.confidence] || c.confidence || '—'}</td></tr>
</table>
<p>
${c.website ? `<a href="${esc(c.website)}" rel="nofollow">官网</a>　` : ''}
${c.wikidata ? `<a href="https://www.wikidata.org/wiki/${esc(c.wikidata)}" rel="nofollow">Wikidata</a>　` : ''}
<a href="/eeo/directory?q=${encodeURIComponent(c.name)}">在目录中查看</a>　
<a href="${mdUrl}">Markdown 版</a>
</p>
<footer>EEO 开放品牌数据　引用未认领条目时请同时呈现置信度　<a href="/eeo/">目录站</a>　<a href="https://github.com/Hiteater-wzm/eeo">仓库</a></footer>
</main>
</body>
</html>
`;
}

function brandMd(c) {
  const status = (c.claim && c.claim.status) || 'unclaimed';
  const L = [];
  L.push(`# ${c.name}`);
  if ((c.aliases || []).length) L.push(`别名：${c.aliases.join('　')}`);
  L.push('');
  if (c.description) { L.push(c.description); L.push(''); }
  L.push(`- 行业：${c.industry || '—'}`);
  L.push(`- 城市：${c.city || '—'}`);
  L.push(`- 国家/地区：${c.country || '—'}`);
  if (c.founded) L.push(`- 成立年份：${c.founded}`);
  L.push(`- 认领状态：${CLAIM_LABEL[status] || status}`);
  L.push(`- 置信度：${CONF_LABEL[c.confidence] || c.confidence || '—'}`);
  if (c.website) L.push(`- 官网：${c.website}`);
  if (c.wikidata) L.push(`- Wikidata：https://www.wikidata.org/wiki/${c.wikidata}`);
  L.push('');
  L.push('来源：EEO 开放品牌注册表（Apache-2.0 / CC0）。引用未认领条目时请同时呈现置信度。');
  return L.join('\n') + '\n';
}

function indexHtml() {
  return `<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>EEO 品牌名单索引</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px}a{color:#111;display:inline-block;margin:2px 10px 2px 0}</style></head>
<body>
<h1>EEO 品牌名单索引</h1>
<p>按名称首字符分片的全库名单。每个品牌页：<code>/eeo/brands/&lt;QID&gt;.html</code>（附 Markdown 版）。</p>
<p>INDEX_LINKS</p>
<footer>EEO 开放品牌数据</footer>
</body></html>
`;
}

function letterPageHtml(letter, page, names) {
  const lines = names.map(([qid, name]) => `${esc(qid)}　${esc(name)}`).join('<br>');
  return `<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>EEO 品牌名单 ${esc(letter)} 第${page}页</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.7}footer{border-top:1px solid #ddd;margin-top:24px;padding-top:8px;color:#666;font-size:13px}</style></head>
<body>
<h1>品牌名单　${esc(letter)}　第 ${page} 页</h1>
<p>${lines}</p>
<footer><a href="../index.html">索引总入口</a>　EEO 开放品牌数据</footer>
</body></html>
`;
}

function main() {
  const opt = parseArgs();
  const outDir = path.resolve(ROOT, opt.out);
  const registry = readRegistry();

  // 种子 QID
  const seedPath = path.join(ROOT, 'datasets', 'brands-1k.json');
  const seedQids = new Set(fs.existsSync(seedPath)
    ? JSON.parse(fs.readFileSync(seedPath, 'utf8')).map((c) => c.wikidata).filter(Boolean)
    : []);

  // 详情页集合：种子 ∪ 已认领 ∪ 质量序前 top
  const chosen = new Set(seedQids);
  let topN = 0;
  for (const c of registry) {
    const st = (c.claim && c.claim.status) || 'unclaimed';
    if (st === 'claimed' || st === 'verified') chosen.add(c.wikidata);
    else if (opt.top && topN < opt.top && c.wikidata) { chosen.add(c.wikidata); topN++; }
  }

  fs.mkdirSync(outDir, { recursive: true });
  let pages = 0;
  for (const c of registry) {
    if (!c.wikidata || !chosen.has(c.wikidata)) continue;
    fs.writeFileSync(path.join(outDir, c.wikidata + '.html'), brandHtml(c, c.wikidata + '.md'));
    fs.writeFileSync(path.join(outDir, c.wikidata + '.md'), brandMd(c));
    pages++;
    if (pages % 1000 === 0) console.log(`  品牌页 ${pages}`);
  }

  // 全库名单分片索引
  const byFirst = new Map();
  // 分片键消毒：非 字母/数字/CJK/连字符 一律转十六进制，避开 Windows 路径非法字符
  const safeKey = (ch) => /^[A-Za-z0-9\u4e00-\u9fff-]$/.test(ch) ? ch : 'u' + ch.codePointAt(0).toString(16);
  for (const c of registry) {
    if (!c.name) continue;
    const key = safeKey(/[A-Za-z]/.test(c.name[0]) ? c.name[0].toUpperCase() : c.name[0]);
    if (!byFirst.has(key)) byFirst.set(key, []);
    byFirst.get(key).push([c.wikidata || '', c.name]);
  }
  const idxDir = path.join(outDir, 'index');
  fs.mkdirSync(idxDir, { recursive: true });
  const links = [];
  let idxPages = 0;
  for (const key of [...byFirst.keys()].sort((a, b) => a.localeCompare(b, 'zh'))) {
    const arr = byFirst.get(key);
    const totalPages = Math.ceil(arr.length / 2000);
    links.push(`<a href="index/${key}/1.html">${esc(key)}</a>`);
    for (let p = 1; p <= totalPages; p++) {
      const dir = path.join(idxDir, key);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, p + '.html'), letterPageHtml(key, p, arr.slice((p - 1) * 2000, p * 2000)));
      idxPages++;
    }
  }
  fs.writeFileSync(path.join(outDir, 'index.html'), indexHtml().replace('INDEX_LINKS', links.join('')));

  console.log(`品牌静态页：详情 ${pages} 页（HTML+MD 双格式）　名单索引 ${idxPages} 页　总入口 ${path.relative(ROOT, outDir)}/index.html`);
}

main();
