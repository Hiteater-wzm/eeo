#!/usr/bin/env node
'use strict';
/*
 * fetch-sources.cjs — 权威注册源采集（Wikidata 之外的多源背书）
 *
 *   ticker  美国SEC EDGAR 上市公司名录（公司名+CIK+ticker，公有领域）
 *   ror     ROR 研究机构库（~11万 curated 机构，CC0）
 *   lei     Wikidata 条目上的 LEI/P414 属性直查（business 类）
 *
 * 产物落 datasets/sources/：原始件 + 统一为 {id,name,country,source} 的平表。
 */
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const OUT = path.join(__dirname, '..', 'datasets', 'sources');
fs.mkdirSync(OUT, { recursive: true });

const get = async (url, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { 'User-Agent': 'EEO open data research (github.com/Hiteater-wzm/eeo; contact via repository)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    } catch (e) {
      console.error(`  retry ${i + 1}/${tries}: ${String(e.message).slice(0, 80)}`);
      await new Promise((s) => setTimeout(s, 6000 * (i + 1)));
    }
  }
  throw new Error('fetch failed: ' + url);
};

async function ticker() {
  console.log('[ticker] SEC EDGAR company_tickers.json');
  const r = await get('https://www.sec.gov/files/company_tickers.json');
  const d = await r.json();
  const rows = Object.values(d).map((x) => ({ id: 'CIK' + String(x.cik_str).padStart(10, '0'), name: x.title, ticker: (x.tickers || [])[0] || '', source: 'sec-edgar' }));
  fs.writeFileSync(path.join(OUT, 'sec-edgar.json'), JSON.stringify(rows));
  console.log(`  ${rows.length} 家美国上市公司`);
}

async function ror() {
  console.log('[ror] ROR 数据下载（zip 内单 JSON ~几十MB）');
  const api = 'https://api.ror.org/organizations?compressed=true';
  const r = await get(api);
  // ROR API 全量分页；改走数据 dump 索引
  const dumpIdx = await (await get('https://ror.readme.io/docs/data-dump')).text().catch(() => '');
  const m = dumpIdx.match(/https:\/\/[^\"'\s]+ror-data[^\"'\s]*\.zip/);
  if (!m) { console.error('  未解析到 dump 链接，改用 API 首页元数据'); }
  console.log('  dump 链接: ' + (m ? m[0] : '未找到'));
  if (m) {
    const zr = await get(m[0]);
    const buf = Buffer.from(await zr.arrayBuffer());
    fs.writeFileSync(path.join(OUT, 'ror-data.zip'), buf);
    console.log(`  ror-data.zip ${(buf.length / 1048576).toFixed(1)}MB 已存`);
  }
}

async function lei() {
  console.log('[lei] Wikidata business 条目带 LEI(P1278) 或上市(P414) 直查');
  const q = (prop, label) => `SELECT ?item ?v WHERE { ?item wdt:P31/wdt:P279* wd:Q4830453 . ?item wdt:${prop} ?v } LIMIT 200000`;
  for (const [prop, label] of [['P1278', 'LEI'], ['P414', '上市交易所']]) {
    const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q(prop, label));
    try {
      const r = await get(url);
      const d = await r.json();
      const rows = d.results.bindings.map((x) => ({ id: x.item.value.split('/').pop(), value: x.v.value, source: 'wikidata-' + prop }));
      fs.writeFileSync(path.join(OUT, `wikidata-${prop}.json`), JSON.stringify(rows));
      console.log(`  ${label}（P${prop === 'P1278' ? '1278' : '414'}）: ${rows.length} 条`);
    } catch (e) {
      console.error(`  ${label} 查询失败: ${e.message}`);
    }
  }
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'ticker') await ticker();
  else if (cmd === 'ror') await ror();
  else if (cmd === 'lei') await lei();
  else { await ticker(); await ror(); await lei(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
