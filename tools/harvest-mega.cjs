#!/usr/bin/env node
/*
 * harvest-mega.cjs — 巨型国家专用采集（business 子树，VALUES 类目分批）
 *
 * P279* 全树 + 大国在 WDQS 必超时；改为两步：
 *   1. 一次性取 business 的全部子类 QID（该查询本身可过）；
 *   2. 每国按 40 个类一批 VALUES 直查 P31（走索引，快），批内 OFFSET 分页，
 *      国内按 QID 去重后落 datasets/harvest/businessTree/<国家QID>.json。
 * 断点续跑：产物已存在的国家跳过。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const STAGE = path.join(__dirname, '..', 'datasets', 'harvest');
const OUT_DIR = path.join(STAGE, 'businessTree');
const ENDPOINT = 'https://query.wikidata.org/sparql';
const UA = 'EEO-Brand-Registry-harvest/2.0 (open data; github.com/Hiteater-wzm/eeo)';
const PAGE = 40000;
const BATCH = 40;

const MEGA = {
  Q30: '美国', Q142: '法国', Q155: '巴西', Q183: '德国', Q252: '印度尼西亚', Q668: '印度',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query, tries = 5) {
  const url = ENDPOINT + '?query=' + encodeURIComponent(query) + '&format=json';
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA }, signal: AbortSignal.timeout(parseInt(process.env.HARVEST_TIMEOUT_MS || '180000', 10)) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.error('  retry ' + (i + 1) + '/' + tries + ': ' + String(e.message).slice(0, 90));
      await sleep(8000 * (i + 1));
    }
  }
  return null;
}

const pick = (b, k) => (b[k] && b[k].value) || '';

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

async function subclasses() {
  const cache = path.join(STAGE, 'business-subclasses.json');
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const d = await sparql('SELECT DISTINCT ?c WHERE { ?c wdt:P279* wd:Q4830453 }');
  if (!d) throw new Error('子类查询失败');
  const list = d.results.bindings.map((b) => pick(b, 'c').split('/').pop()).filter((q) => /^Q\d+$/.test(q));
  fs.writeFileSync(cache, JSON.stringify(list));
  return list;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const classes = await subclasses();
  console.log(`business 子类 ${classes.length} 个，目标国家 ${Object.keys(MEGA).length} 个`);
  for (const [cq, cname] of Object.entries(MEGA)) {
    const out = path.join(OUT_DIR, cq + '.json');
    if (fs.existsSync(out)) { console.log(`skip ${cname}`); continue; }
    const byQid = new Map();
    for (let i = 0; i < classes.length; i += BATCH) {
      const vals = classes.slice(i, i + BATCH).map((q) => 'wd:' + q).join(' ');
      for (let offset = 0; ; offset += PAGE) {
        const q = `SELECT ?item ?itemLabel ?itemDescription ?itemAltLabel ?website ?industryLabel WHERE {
  ?item wdt:P31 ?cc .
  VALUES ?cc { ${vals} }
  ?item wdt:P17 wd:${cq} .
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P452 ?ind . ?ind rdfs:label ?industryLabel FILTER(LANG(?industryLabel)="zh" || LANG(?industryLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
} LIMIT ${PAGE} OFFSET ${offset}`;
        const d = await sparql(q);
        if (!d) { console.error(`  批 ${i / BATCH} 页 ${offset} 失败，跳过该页`); break; }
        for (const r of d.results.bindings) {
          const card = toCard(r, cname);
          if (card.name && card.name !== card.wikidata && !byQid.has(card.wikidata)) byQid.set(card.wikidata, card);
        }
        if (d.results.bindings.length < PAGE) break;
        await sleep(1500);
      }
      process.stdout.write(`  ${cname} 批 ${i / BATCH + 1}/${Math.ceil(classes.length / BATCH)} 累计 ${byQid.size}\n`);
      await sleep(800);
    }
    fs.writeFileSync(out, JSON.stringify([...byQid.values()]));
    console.log(`${cname}(${cq}) 完成 ${byQid.size} 条`);
  }
  console.log('MEGA DONE');
})();
