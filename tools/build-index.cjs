#!/usr/bin/env node
/*
 * build-index.cjs — 从分片注册表生成目录页用的轻量索引。
 *
 * 输出 web/public/data/brand-index-pN.json（随 vite build 复制进 dist/data/）。
 *
 * 编码策略：
 *   - country / industry 全量去重成字典数组，条目内只存下标；
 *   - claim.status / confidence 只在偏离默认值时写入；
 *   - wikidata 主来源由字段还原，索引只留额外来源；
 *   - description 全量保留（检索需要，实测截断省不了多少）；
 *   - stats 预计算（国家/行业计数、已认领数），首页不再扫全量。
 *
 * 分片：单文件超过 85MB 就均分为 N 片（GitHub 单文件 100MB 上限），
 * 第 0 片携带字典与统计，其余片只含 rows；条目保持注册表的质量序。
 *
 * 校验：条数不低于护栏值且首中尾抽检回读一致，否则退出码 1。
 */
'use strict';

const fs = require('fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = process.env.EEO_INDEX_DIR ? path.resolve(process.env.EEO_INDEX_DIR) : path.join(ROOT, 'web', 'public', 'data');
/* 条数为动态值（注册表随批次增长），仅做下限护栏 */
const MIN_COUNT = 50000;
const SPLIT_BYTES = 22 * 1048576;   // 渐进加载：首片约 22MB 秒开，其余后台续载

function fail(msg) {
  console.error('[build-index] FAIL: ' + msg);
  process.exit(1);
}

let brands;
try {
  brands = require('./registry-lib.cjs').readRegistry();
} catch (e) {
  fail('读取分片注册表失败：' + e.message);
}
if (!Array.isArray(brands)) fail('注册表读取结果不是数组');
if (brands.length < MIN_COUNT) {
  fail(`条数异常偏少：${brands.length} < ${MIN_COUNT}（数据源是否损坏）`);
}

// 字典编码：country / industry
const countries = [];
const industries = [];
const coMap = new Map();
const indMap = new Map();
const coCount = [];
const indCount = [];
function dictIndex(list, map, counts, v) {
  let i = map.get(v);
  if (i === undefined) {
    i = list.length;
    list.push(v);
    map.set(v, i);
    counts.push(0);
  }
  counts[i]++;
  return i;
}

const WIKIDATA_RE = /wikidata\.org/;
let withWebsite = 0;
let withAliases = 0;
let withDesc = 0;
let claimed = 0;
let withLei = 0, listedCnt = 0;
const tierCount = { 3: 0, 2: 0, 1: 0 };

// UTF-16 单元长度（对齐 JS String.length 语义）
const u16len = (str) => {
  let n = 0;
  for (const ch of str) n += ch.codePointAt(0) >= 0x10000 ? 2 : 1;
  return n;
};

const rows = brands.map((b) => {
  const o = { n: String(b.name || '') };
  if (Array.isArray(b.aliases) && b.aliases.length) { o.a = b.aliases; withAliases++; }
  if (b.website) { o.w = b.website; withWebsite++; }
  if (b.industry) o.i = dictIndex(industries, indMap, indCount, b.industry);
  if (b.city) o.ct = b.city;
  if (b.country) o.co = dictIndex(countries, coMap, coCount, b.country);
  if (b.description) { o.d = b.description; withDesc++; }
  if (b.wikidata) o.q = b.wikidata;
  const st = b.claim && b.claim.status;
  if (st && st !== 'unclaimed') { o.cs = st; claimed++; }
  if (b.confidence && b.confidence !== 'medium') o.cf = b.confidence;
  if (Array.isArray(b.advantages) && b.advantages.length) o.adv = b.advantages;
  const extra = (Array.isArray(b.sources) ? b.sources : []).filter((s) => !WIKIDATA_RE.test(s));
  if (extra.length) o.src = extra;
  if (b.founded) o.f = b.founded;
  if (b.reg && (b.reg.lei || b.reg.listed)) o.rg = { lei: b.reg.lei ? b.reg.lei.slice(0, 2) : undefined, listed: b.reg.listed ? 1 : undefined };
  // 质量档：3=完整（有官网且描述≥20字）2=标准（描述≥10字或有官网）1=存根
  const dl = u16len(o.d || '');
  if (o.rg) { if (o.rg.lei) withLei++; if (o.rg.listed) listedCnt++; }
  const tier = (dl >= 20 && o.w) ? 3 : ((dl >= 10 || o.w) ? 2 : 1);
  o.tr = tier;
  tierCount[tier]++;
  return o;
});

const head = {
  schema: 'eeo.brand-index.v3',
  count: rows.length,
  countries,
  industries,
  stats: {
    claimed,
    tiers: { full: tierCount[3], standard: tierCount[2], stub: tierCount[1] },
    regBadges: { lei: withLei, listed: listedCnt },
    countriesCounted: countries.map((c, i) => [c, coCount[i]]).sort((x, y) => y[1] - x[1]),
    industriesCounted: industries.map((c, i) => [c, indCount[i]]).sort((x, y) => y[1] - x[1]),
  },
};

const full = { ...head, b: rows };
const json = JSON.stringify(full);
const bytes = Buffer.byteLength(json);
const parts = Math.max(1, Math.ceil(bytes / SPLIT_BYTES));

fs.mkdirSync(OUT_DIR, { recursive: true });
// 清掉旧索引（含 v2 单文件），避免残片混入构建
for (const f of fs.readdirSync(OUT_DIR)) {
  if (f === 'brand-index.json' || /^brand-index-p\d+\.json$/.test(f)) fs.unlinkSync(path.join(OUT_DIR, f));
}

const per = Math.ceil(rows.length / parts);
const written = [];
for (let p = 0; p < parts; p++) {
  const slice = rows.slice(p * per, (p + 1) * per);
  const payload = p === 0
    ? { ...head, part: 0, parts, b: slice }
    : { schema: head.schema, count: head.count, part: p, parts, b: slice };
  const f = 'brand-index-p' + p + '.json';
  fs.writeFileSync(path.join(OUT_DIR, f), JSON.stringify(payload));
  written.push({ f, n: slice.length, mb: (fs.statSync(path.join(OUT_DIR, f)).size / 1048576).toFixed(1) });
}

// 回读抽检（第 0 片头部 + 最后一片末条）
const p0 = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'brand-index-p0.json'), 'utf8'));
if (p0.count !== rows.length || p0.parts !== parts) fail(`第 0 片头部不符：count=${p0.count} parts=${p0.parts}`);
const pl = JSON.parse(fs.readFileSync(path.join(OUT_DIR, written[written.length - 1].f), 'utf8'));
for (const [file, row, src] of [
  ['p0', p0.b[0], brands[0]],
  ['p0-mid', p0.b[Math.floor(p0.b.length / 2)], brands[Math.floor(p0.b.length / 2)]],
  ['last', pl.b[pl.b.length - 1], brands[brands.length - 1]],
]) {
  if (!row || row.n !== src.name) fail(`${file} 抽检名称不一致`);
  const coName = row.co != null ? p0.countries[row.co] : '';
  if (coName !== (src.country || '')) fail(`${file} 抽检 country 解码不一致`);
}
if (written.reduce((s, w) => s + w.n, 0) !== rows.length) fail('分片条数合计不符');

const rawMB = (bytes / 1048576).toFixed(1);
const gzMB = (zlib.gzipSync(json).length / 1048576).toFixed(1);
console.log('[build-index] OK');
console.log(`  条目        ${rows.length}（已认领 ${claimed}）`);
console.log(`  分片        ${parts} 片 ${written.map((w) => w.f + '=' + w.mb + 'MB').join(' ')}`);
console.log(`  合计体积    ${rawMB} MB（gzip 后约 ${gzMB} MB）`);
console.log(`  字典        countries=${countries.length} industries=${industries.length}`);
console.log(`  字段覆盖    website=${withWebsite} aliases=${withAliases} description=${withDesc}`);
