#!/usr/bin/env node
// EEO 结构化数据生成器：品牌信息卡 → 全套 JSON-LD（零依赖，纯 Node）
// 用法：
//   node tools/gen-schema.cjs examples/brand-profile-card.json                      # 全部类型输出到 stdout
//   node tools/gen-schema.cjs card.json --type organization,faq,product            # 只出指定类型
//   node tools/gen-schema.cjs datasets/brands-1k.json --out schemas/               # 批量：每品牌 schemas/{slug}/
// 生成类型：Organization / LocalBusiness / FAQPage / Product / Service / WebSite / BreadcrumbList
// 字段缺失的类型整体跳过，不编造值，不写 null
// 属性名对齐 schema.org 词汇表（可用 google/schema-dts 的 Organization/LocalBusiness 类型核对）

const fs = require('fs');
const path = require('path');

// ---------- 基础工具 ----------
function str(v) { return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim()); }
function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
function jsonForEmbed(o) { return JSON.stringify(o, null, 2).replace(/</g, '\\u003c'); }

// ---------- slug：与 gen-site.cjs 完全一致 ----------
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

// ---------- 字段读取 ----------
// founded 归一：只接受 年 / 年-月 / 年-月-日 形态，其余（含 '1988年'）取开头的年份数字，再取不到则放弃该字段
function foundingDateOf(b) {
  const v = str(b.founded);
  const m = v.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return '';
  return m[0];
}
// sameAs：aliases 里形如 URL 的项；wikidata 实体 id（Q 开头）换算成规范实体页
function sameAsOf(b) {
  const out = [];
  for (const a of arr(b.aliases)) {
    if (/^https?:\/\//.test(a) && !out.includes(a)) out.push(a);
  }
  const wd = str(b.wikidata);
  if (/^Q\d+$/.test(wd)) {
    const u = 'https://www.wikidata.org/wiki/' + wd;
    if (!out.includes(u)) out.push(u);
  }
  return out;
}
// address：字符串直取；对象取 street/streetAddress 键
function streetOf(b) {
  const a = b.address;
  if (typeof a === 'string') return str(a);
  if (obj(a)) return str(a.streetAddress) || str(a.street);
  return '';
}
function latLngOf(b) {
  const g = obj(b.geolocation) || obj(b.geo);
  if (!g) return null;
  const la = g.latitude, lo = g.longitude;
  if (la == null && lo == null) return null;
  const geo = { '@type': 'GeoCoordinates' };
  if (la != null) geo.latitude = la;
  if (lo != null) geo.longitude = lo;
  return geo;
}
// openingHours：字符串或字符串数组原样透传
function openingHoursOf(b) {
  const v = b.openingHours;
  if (typeof v === 'string') return str(v);
  if (Array.isArray(v)) {
    const list = v.map(str).filter(Boolean);
    return list.length ? (list.length === 1 ? list[0] : list) : '';
  }
  return '';
}
// numberOfEmployees：仅接受字符串与数字
function employeesOf(b) {
  const v = b.numberOfEmployees;
  if (typeof v === 'number' || typeof v === 'string') return str(v);
  return '';
}

// ---------- 类型构造器（缺字段返回 null） ----------
function buildOrganization(b) {
  const name = str(b.name);
  if (!name) return null;
  const o = { '@context': 'https://schema.org', '@type': 'Organization', name };
  const aliases = arr(b.aliases).map(str).filter(Boolean);
  if (aliases.length) o.alternateName = aliases.length === 1 ? aliases[0] : aliases;
  if (str(b.legalName)) o.legalName = str(b.legalName);
  if (str(b.website)) o.url = str(b.website);
  if (str(b.description)) o.description = str(b.description);
  const fd = foundingDateOf(b);
  if (fd) o.foundingDate = fd;
  const city = str(b.city), country = str(b.country), street = streetOf(b);
  if (city || country || street) {
    o.address = { '@type': 'PostalAddress' };
    if (street) o.address.streetAddress = street;
    if (city) o.address.addressLocality = city;
    if (country) o.address.addressCountry = country;
  }
  const tel = str(b.telephone), mail = str(b.email);
  if (tel || mail) {
    o.contactPoint = { '@type': 'ContactPoint' };
    if (tel) o.contactPoint.telephone = tel;
    if (mail) o.contactPoint.email = mail;
  }
  const sameAs = sameAsOf(b);
  if (sameAs.length) o.sameAs = sameAs.length === 1 ? sameAs[0] : sameAs;
  const emp = employeesOf(b);
  if (emp) o.numberOfEmployees = emp;
  if (str(b.slogan)) o.slogan = str(b.slogan);
  return o;
}

// LocalBusiness 是 Organization 的子类型：继承全部字段，再补营业与地理信息
function buildLocalBusiness(b, org) {
  if (!org) return null;
  const city = str(b.city), street = streetOf(b);
  if (!city || !street) return null; // 有城市且有具体地址才算实体门店
  const o = JSON.parse(JSON.stringify(org));
  o['@type'] = 'LocalBusiness';
  const oh = openingHoursOf(b);
  if (oh) o.openingHours = oh;
  const geo = latLngOf(b);
  if (geo) o.geo = geo;
  return o;
}

// faq：[{question, answer}]，缺问答对的条目跳过，全部无效则整体不出
function buildFaq(b) {
  const items = arr(b.faq)
    .map((f) => {
      const q = obj(f) ? (str(f.question) || str(f.q)) : '';
      const a = obj(f) ? (str(f.answer) || str(f.a)) : '';
      return q && a ? { '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } } : null;
    })
    .filter(Boolean);
  if (!items.length) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items };
}

// offers：price 与 priceCurrency 成对才出（schema.org Offer 的最低要求），availability 原样透传
function buildOffers(item) {
  const src = obj(item) || {};
  const price = src.price, currency = str(src.priceCurrency);
  const hasPrice = (typeof price === 'number' && isFinite(price)) || (typeof price === 'string' && str(price));
  if (!hasPrice || !currency) return null;
  const offer = { '@type': 'Offer', price: typeof price === 'string' ? str(price) : price, priceCurrency: currency };
  if (str(src.availability)) offer.availability = str(src.availability);
  return offer;
}

function buildProducts(b) {
  const name = str(b.name);
  return arr(b.products)
    .map((p) => {
      const src = obj(p);
      const n = src ? str(src.name) : '';
      if (!src || !n) return null;
      const o = { '@context': 'https://schema.org', '@type': 'Product', name: n };
      if (str(src.description)) o.description = str(src.description);
      if (str(src.url)) o.url = str(src.url);
      const offers = buildOffers(src);
      if (offers) o.offers = offers;
      if (name) o.brand = { '@type': 'Brand', name };
      return o;
    })
    .filter(Boolean);
}

function buildServices(b) {
  const name = str(b.name);
  return arr(b.services)
    .map((s) => {
      const src = obj(s);
      const n = src ? str(src.name) : '';
      if (!src || !n) return null;
      const o = { '@context': 'https://schema.org', '@type': 'Service', name: n };
      if (str(src.description)) o.description = str(src.description);
      if (str(src.url)) o.url = str(src.url);
      if (name) o.provider = { '@type': 'Organization', name };
      const offers = buildOffers(src);
      if (offers) o.offers = offers;
      return o;
    })
    .filter(Boolean);
}

function buildWebsite(b) {
  const url = str(b.website);
  if (!url) return null;
  const o = { '@context': 'https://schema.org', '@type': 'WebSite', url };
  if (str(b.name)) o.name = str(b.name);
  if (str(b.description)) o.description = str(b.description);
  const su = str(b.search_url) || str(b.searchUrl);
  if (su) {
    o.potentialAction = {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: su },
      'query-input': 'required name=search_term_string',
    };
  }
  return o;
}

// 品牌在目录中的路径：首页 → 品牌页（url 与 gen-site 目录页的 {slug}/ 相对写法一致）
function buildBreadcrumb(b, slug) {
  const name = str(b.name) || slug;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: '/' },
      { '@type': 'ListItem', position: 2, name, item: slug + '/' },
    ],
  };
}

// ---------- 汇总：一张品牌卡 → 有序的类型清单 ----------
const TYPE_KEYS = ['organization', 'localbusiness', 'faq', 'product', 'service', 'website', 'breadcrumb'];
const TYPE_ALIAS = {
  org: 'organization', organization: 'organization',
  'local-business': 'localbusiness', localbusiness: 'localbusiness', business: 'localbusiness',
  faq: 'faq',
  product: 'product', products: 'product', service: 'product', services: 'product',
  web: 'website', website: 'website', site: 'website',
  breadcrumb: 'breadcrumb', breadcrumbs: 'breadcrumb', crumb: 'breadcrumb',
};

function buildAll(b, slug, wanted) {
  const out = [];
  const org = buildOrganization(b);
  const push = (key, file, label, node) => { if (node) out.push({ key, file, label, node }); };

  if (wanted.has('organization')) push('organization', 'organization.jsonld', 'Organization', org);
  if (wanted.has('localbusiness')) push('localbusiness', 'localbusiness.jsonld', 'LocalBusiness', buildLocalBusiness(b, org));
  if (wanted.has('faq')) push('faq', 'faq.jsonld', 'FAQPage', buildFaq(b));
  if (wanted.has('product')) {
    buildProducts(b).forEach((p, i) => push('product', 'product-' + (i + 1) + '.jsonld', 'Product', p));
    buildServices(b).forEach((s, i) => push('service', 'service-' + (i + 1) + '.jsonld', 'Service', s));
  }
  if (wanted.has('website')) push('website', 'website.jsonld', 'WebSite', buildWebsite(b));
  if (wanted.has('breadcrumb')) push('breadcrumb', 'breadcrumb.jsonld', 'BreadcrumbList', buildBreadcrumb(b, slug));
  return out;
}

// ---------- 输出 ----------
function scriptTag(node) {
  return '<script type="application/ld+json">\n' + jsonForEmbed(node) + '\n</script>';
}
function allHtml(list) {
  return list.map((it) => scriptTag(it.node)).join('\n') + '\n';
}

// ---------- CLI ----------
function usage() {
  return [
    'EEO JSON-LD 生成器（零依赖）',
    '',
    '用法:',
    '  node tools/gen-schema.cjs <品牌卡 JSON> [--type a,b,c]            输出到 stdout',
    '  node tools/gen-schema.cjs <品牌卡 JSON> --out <目录>              写入目录',
    '  node tools/gen-schema.cjs <数据集 JSON 数组> --out schemas/       批量：每品牌 schemas/{slug}/',
    '',
    '类型（--type 逗号分隔，默认 all）:',
    '  organization localbusiness faq product website breadcrumb',
    '  product 同时覆盖 products 与 services 两个字段',
    '',
    '产出:',
    '  每个类型一个 .jsonld 文件，另加 all.html（全部 script 标签，可直接嵌入 HTML）',
    '  品牌卡缺字段时对应类型自动跳过，不补空值',
  ].join('\n');
}

function fail(msg) { console.error('错误 ' + msg); process.exit(1); }

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('-h') || argv.includes('--help')) { console.log(usage()); process.exit(argv.length ? 0 : 1); }
  const input = argv[0];
  const opts = { out: null, type: 'all' };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--out') {
      if (!argv[i + 1]) fail('--out 需要一个目录参数');
      opts.out = argv[++i];
    } else if (argv[i] === '--type' || argv[i] === '--types') {
      if (!argv[i + 1]) fail('--type 需要一个类型列表');
      opts.type = argv[++i];
    } else {
      fail('无法识别的参数 ' + argv[i]);
    }
  }

  const wanted = new Set();
  for (const t of opts.type.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if (t === 'all') { TYPE_KEYS.forEach((k) => wanted.add(k)); continue; }
    const key = TYPE_ALIAS[t];
    if (!key) fail('未知类型 ' + t + ' 可选 ' + TYPE_KEYS.join(' '));
    wanted.add(key);
  }
  if (!wanted.size) TYPE_KEYS.forEach((k) => wanted.add(k));

  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  } catch (e) {
    fail('输入文件读取或解析失败 ' + e.message);
  }

  const t0 = Date.now();

  if (Array.isArray(data)) {
    // 批量：数组必须有 --out
    if (!opts.out) fail('数据集为数组 需要 --out 输出目录（如 --out schemas/）');
    const outRoot = path.resolve(opts.out);
    const used = new Set();
    let files = 0;
    const skipped = []; // 无 name 的条目
    for (const b of data) {
      if (!str(b && b.name)) { skipped.push(b); continue; }
      const slug = slugify(b.name, used);
      const list = buildAll(b, slug, wanted);
      const dir = path.join(outRoot, slug);
      fs.mkdirSync(dir, { recursive: true });
      for (const it of list) fs.writeFileSync(path.join(dir, it.file), JSON.stringify(it.node, null, 2) + '\n', 'utf8');
      fs.writeFileSync(path.join(dir, 'all.html'), allHtml(list), 'utf8');
      files += list.length + 1;
    }
    console.log(`模式  批量 ${data.length} 个品牌`);
    console.log(`输出  ${outRoot}`);
    console.log(`文件  ${files} 个（含 all.html）`);
    if (skipped.length) console.log(`跳过  ${skipped.length} 个无 name 条目`);
    console.log(`耗时  ${Date.now() - t0} 毫秒`);
  } else if (data && typeof data === 'object' && str(data.name)) {
    // 单品牌
    const slug = slugify(data.name, new Set());
    const list = buildAll(data, slug, wanted);
    if (!list.length) fail('品牌卡字段不足以生成任何 JSON-LD 类型');
    if (opts.out) {
      const dir = path.resolve(opts.out);
      fs.mkdirSync(dir, { recursive: true });
      for (const it of list) fs.writeFileSync(path.join(dir, it.file), JSON.stringify(it.node, null, 2) + '\n', 'utf8');
      fs.writeFileSync(path.join(dir, 'all.html'), allHtml(list), 'utf8');
      console.log('模式  单品牌');
      console.log(`输出  ${dir}`);
      console.log(`类型  ${list.map((it) => it.label).join(' ')}`);
      console.log(`文件  ${list.length + 1} 个（含 all.html）`);
      console.log(`耗时  ${Date.now() - t0} 毫秒`);
    } else {
      process.stdout.write(list.map((it) => scriptTag(it.node)).join('\n') + '\n');
      console.error(`已输出 ${list.length} 个 JSON-LD：${list.map((it) => it.label).join(' ')}`);
    }
  } else {
    fail('无法识别的输入格式 需为品牌卡对象或品牌数组');
  }
}

main();
