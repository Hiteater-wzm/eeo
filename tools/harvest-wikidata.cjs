#!/usr/bin/env node
/*
 * harvest-wikidata.cjs — Wikidata CC0 品牌批量采集（v2，扩容版）
 *
 * 与 v1（brand-registry/bulk-import.py）的差异：
 *   - 不再强制官网字段（无官网但有描述的实体同样入库，质量门槛交给 clean-registry）；
 *   - 国家清单自动发现（P31=Q3624078 主权国家），不再手工维护；
 *   - 类目取 business 直接类与其父类 organization 的 P279* 子树（可切换）；
 *   - 断点续跑：已有产物文件的国家跳过；每国分页拉满。
 *
 * 产物：datasets/harvest/<classKey>/<国家QID>.json（数组，eeo.brand.v1 卡片字段）
 * staging 目录不入库（.gitignore），合并去重由 merge 步骤处理。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STAGE = path.join(ROOT, 'datasets', 'harvest');
const ENDPOINT = 'https://query.wikidata.org/sparql';
const UA = 'EEO-Brand-Registry-harvest/2.0 (open data; github.com/Hiteater-wzm/eeo)';
const PAGE = 40000;

// mode=business 直接类（快）；mode=businessTree 走 P279* 子树（结果多、查询重）
const MODE = process.argv[2] === 'tree' ? 'tree' : 'direct';
const CLASS_KEY = MODE === 'tree' ? 'businessTree' : 'business';
const CLASS_LINE = MODE === 'tree'
  ? '?item wdt:P31/wdt:P279* wd:Q4830453 .'
  : '?item wdt:P31 wd:Q4830453 .';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query, tries = 4) {
  const url = ENDPOINT + '?query=' + encodeURIComponent(query) + '&format=json';
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA }, signal: AbortSignal.timeout(parseInt(process.env.HARVEST_TIMEOUT_MS || '120000', 10)) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.error('  sparql retry ' + (i + 1) + '/' + tries + ': ' + String(e.message).slice(0, 90));
      await sleep(6000 * (i + 1));
    }
  }
  return null;
}

const pick = (b, k) => (b[k] && b[k].value) || '';

async function countryList() {
  const cache = path.join(STAGE, 'countries.json');
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const q = `SELECT ?c ?cLabel WHERE { ?c wdt:P31 wd:Q3624078 . MINUS { ?c wdt:P582 [] } SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". } }`;
  const d = await sparql(q);
  const list = d.results.bindings.map((b) => ({ qid: pick(b, 'c').rsplit_id || pick(b, 'c').split('/').pop(), name: pick(b, 'cLabel') })).filter((x) => /^Q\d+$/.test(x.qid));
  fs.mkdirSync(STAGE, { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(list));
  return list;
}

function toCard(b, countryName) {
  const qid = pick(b, 'item').split('/').pop();
  const alts = pick(b, 'itemAltLabel').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
  return {
    schema: 'eeo.brand.v1',
    name: pick(b, 'itemLabel').trim(),
    wikidata: qid,
    aliases: alts,
    website: pick(b, 'website'),
    industry: pick(b, 'industryLabel'),
    city: '',
    country: countryName,
    description: pick(b, 'itemDescription').trim(),
    advantages: [],
    claim: { status: 'unclaimed' },
    sources: ['https://www.wikidata.org/wiki/' + qid],
    confidence: 'medium',
  };
}

async function harvestCountry(c, dir) {
  const out = path.join(dir, c.qid + '.json');
  if (fs.existsSync(out)) return 'skip';
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const q = `SELECT ?item ?itemLabel ?itemDescription ?itemAltLabel ?website ?industryLabel WHERE {
  ${CLASS_LINE}
  ?item wdt:P17 wd:${c.qid} .
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P452 ?ind . ?ind rdfs:label ?industryLabel FILTER(LANG(?industryLabel)="zh" || LANG(?industryLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
} LIMIT ${PAGE} OFFSET ${offset}`;
    const d = await sparql(q);
    if (!d) return 'fail';
    const rows = d.results.bindings;
    for (const r of rows) {
      const card = toCard(r, c.name);
      if (card.name && card.name !== card.wikidata) all.push(card);
    }
    if (rows.length < PAGE) break;
    await sleep(1200);
  }
  fs.writeFileSync(out, JSON.stringify(all));
  return all.length;
}

(async () => {
  const dir = path.join(STAGE, CLASS_KEY);
  fs.mkdirSync(dir, { recursive: true });
  const countries = await countryList();
  console.log(`[${CLASS_KEY}] 国家 ${countries.length} 个，开始（每国上限分页拉满，产物 ${dir}）`);
  let done = 0, fail = 0, total = 0;
  for (const c of countries) {
    const r = await harvestCountry(c, dir);
    if (r === 'skip') { done++; continue; }
    if (r === 'fail') { fail++; console.error('FAIL ' + c.qid + ' ' + c.name); continue; }
    total += r; done++;
    console.log(`${done}/${countries.length} ${c.name}(${c.qid}): ${r}`);
    await sleep(1500);
  }
  console.log(`DONE class=${CLASS_KEY} 国家完成${done} 失败${fail} 新采条目${total}`);
})();
