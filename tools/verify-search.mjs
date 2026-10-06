#!/usr/bin/env node
// EEO 站点搜索验证：抽取生成站点根目录页里实际内联的搜索脚本，在 vm 中以 DOM/fetch 桩运行，
// 加载真实的 search-index.json，验证品牌名都能过滤出结果。
// 用法：node tools/verify-search.mjs [站点目录，默认 docs/site]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.resolve(REPO, process.argv[2] || 'docs/site');

const htmlPath = path.join(siteDir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/<script>\s*(\(function \(\) \{[\s\S]*?\}\)\(\);)\s*<\/script>/);
if (!m) { console.error('FAIL: 搜索脚本未注入根目录页 ' + htmlPath); process.exit(1); }

const el = () => ({ addEventListener() {}, style: {}, innerHTML: '', textContent: '' });
const sandbox = {
  window: {},
  document: { getElementById: el },
  fetch: () => Promise.reject(new Error('verify 模式不走网络')),
  console,
};
vm.createContext(sandbox);
vm.runInContext(m[1], sandbox);

const idxPath = path.join(siteDir, 'search-index.json');
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
sandbox.window.__eeoSearch.load(idx.brands);

let failed = 0;
const fail = (msg) => { failed++; console.log('[FAIL] ' + msg); };

// 1) 抽样：每第 20 个品牌，用自身名称搜索必须出现在前 5 个结果里
for (let i = 0; i < idx.brands.length; i += 20) {
  const b = idx.brands[i];
  const r = sandbox.window.__eeoSearch.search(b.n);
  if (!r.hits.slice(0, 5).some((h) => h.s === b.s)) fail(`自检 "${b.n}" 未出现在前 5 结果`);
}
console.log(`[OK] 自检抽样 ${Math.ceil(idx.brands.length / 20)} 个品牌名`);

// 2) 固定探针（均为数据集内常见品牌，须以该品牌为第一名）
for (const q of ['腾讯', 'Tencent', 'BYD', 'byd', '3M']) {
  const r = sandbox.window.__eeoSearch.search(q);
  const top = r.hits[0];
  if (!top) { fail(`"${q}" 0 结果`); continue; }
  const nameHit = top.n.toLowerCase().indexOf(q.toLowerCase()) === 0
    || top.a.some((a) => a.toLowerCase().indexOf(q.toLowerCase()) !== -1);
  if (!nameHit) fail(`"${q}" 首位结果不是该品牌：${top.n}`);
  else console.log(`[OK] "${q}" -> ${r.total} 结果，首位 ${top.n}`);
}

// 3) 中文整名（Pagefind 时代漏掉的类型）：数据集里存在该品牌时必须命中
for (const q of ['腾讯', '京东', '字节跳动', '五粮液', '比亚迪', '华为', '阿里巴巴']) {
  const exists = idx.brands.some((b) => b.n === q || b.a.includes(q));
  const r = sandbox.window.__eeoSearch.search(q);
  if (exists && r.hits[0]?.n !== q) fail(`中文整名 "${q}" 存在但首位不是它：${r.hits[0]?.n ?? '无结果'}`);
  else console.log(`[OK] 中文整名 "${q}" -> ${r.total} 结果`);
}

// 4) 抽样 slug 目录必须真实存在
let missing = 0;
for (let i = 0; i < idx.brands.length; i += 25) {
  if (!fs.existsSync(path.join(siteDir, idx.brands[i].s, 'index.html'))) { missing++; fail('slug 目录缺失 ' + idx.brands[i].s); }
}
if (!missing) console.log('[OK] slug 目录抽样全部存在');

console.log(failed === 0 ? 'SEARCH VERIFY: ALL PASS' : `SEARCH VERIFY: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
