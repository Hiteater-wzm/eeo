#!/usr/bin/env node
// EEO 品牌认领核验（PR 侧）。零依赖，Node >= 18。
//
// 做什么：
//   1. 读 PR 中被修改的 JSON 文件（命令行参数，或环境变量 PR_FILES，换行分隔）
//   2. 找出 schema=eeo.brand.v1 且 claim.status=claiming 的品牌卡
//   3. 逐张校验字段，抓取 https://{claim.domain}/eeo-claim-{claim.token}.txt，
//      响应内容包含品牌名（与卡内 name 完全一致）即核验通过
//   4. 结果打到控制台（✅/❌），有任何失败 exit 1，阻止合并
//
// 安全：
//   - 只抓 https；claim.domain 必须与卡片 website 同域（www 与裸域名均可）
//   - SSRF 防护：拒绝 localhost/.local/.internal、IP 字面量（v4/v6）、
//     DNS 解析到内网/保留地址的域名；重定向逐跳重新过同一套检查
//   - token 限制 [A-Za-z0-9_-]{6,64}，防止拼进 URL 时的路径注入
//   - 响应体上限 64KB，单请求超时 15s，重定向最多 3 跳
//
// 自测（不联网，mock fetch/DNS）：node platform/claim-verify.cjs --self-test

'use strict';

const fs = require('fs');
const dns = require('dns');

// ---------- 网络层注入点（self-test 时整体替换，不发出真实请求） ----------
let doFetch = (url, opts) => fetch(url, opts);
let doResolve = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

const FETCH_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;
const MAX_FILE_BYTES = 64 * 1024;

// ---------- 小工具 ----------
function str(v) { return typeof v === 'string' ? v.trim() : ''; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }

function collectFiles(argv) {
  const files = [];
  for (const a of argv) {
    if (a.startsWith('--')) continue;
    files.push(a);
  }
  if (files.length) return files;
  for (const line of String(process.env.PR_FILES || '').split(/\r?\n/)) {
    const t = line.trim();
    if (t && !files.includes(t)) files.push(t);
  }
  return files;
}

// JSON 顶层可能是单张卡（对象）或卡数组（datasets/brands-1k.json）
function* iterCards(data) {
  if (Array.isArray(data)) {
    for (const item of data) if (obj(item)) yield item;
  } else if (obj(data)) {
    yield data;
  }
}

// ---------- 域名与 SSRF 防护 ----------
const HOST_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{6,64}$/;

// hostname 已经过 URL 解析（无 scheme、无 userinfo、无端口）后的公网性检查
function assertPublicHost(host) {
  if (!host) throw new Error('域名为空');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error(`域名 ${host} 指向本机/内网名称，已拒绝`);
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    throw new Error(`域名不能是 IP 字面量（${host}），须为域名`);
  }
  if (!HOST_RE.test(host)) throw new Error(`不是合法域名：${host}`);
  if (host.length > 253) throw new Error('域名超长（>253）');
}

// claim.domain 的输入可能是裸域名，也可能带 scheme/路径，先归一再检查
function normalizeDomain(input) {
  let s = str(input);
  if (!s) throw new Error('claim.domain 为空');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    const scheme = s.slice(0, s.indexOf('://')).toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') throw new Error('claim.domain 只接受 http/https 或裸域名');
    s = s.slice(s.indexOf('://') + 3);
  }
  s = s.split('?')[0].split('#')[0];
  s = s.replace(/\/+$/, ''); // 容忍末尾斜杠
  if (s.includes('/')) throw new Error('claim.domain 不应包含路径，只填域名');
  if (s.includes('@')) throw new Error('claim.domain 不允许携带 userinfo（@）');
  if (s.includes(':')) throw new Error('claim.domain 不能携带端口，也不能是 IPv6 字面量');
  s = s.toLowerCase().replace(/\.$/, '');
  assertPublicHost(s);
  return s;
}

// ---------- IP 黑名单（v4 区段 + v6 常见保留形态） ----------
function ipv4ToInt(ip) {
  const p = ip.split('.').map(Number);
  return (((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0);
}
const V4_BLOCKED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
function v4Blocked(ip) {
  const n = ipv4ToInt(ip);
  for (const [base, bits] of V4_BLOCKED) {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((n & mask) === (ipv4ToInt(base) & mask)) return true;
  }
  return false;
}
function ipBlocked(ip) {
  const s0 = String(ip).toLowerCase().split('%')[0]; // 去掉 zone id
  // IPv6 十六进制写法的 IPv4 映射地址（::ffff:7f00:1 / 0:0:0:0:0:ffff:7f00:1）
  // 先展开为 8 组，识别 ::ffff:0:0/96 后换算回点分再查 v4 段——绕开"压缩/全写两态"的漏网
  const hexMapped = s0.match(/^(?:(?:0:){1,5}|::)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    // IPv4 映射形态（::ffff:0:0/96）按段核对——公网域名解析不应返回映射地址，两种写法一律拦
    const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
    return v4Blocked(((hi >> 8) & 255) + '.' + (hi & 255) + '.' + ((lo >> 8) & 255) + '.' + (lo & 255)) || true;
  }
  // IPv4 兼容/全零前缀地址（::x / 0:0:…:x）全部视为保留——公网单播 IPv6 的前 48 位不会全零
  if (/^::/.test(s0) || /^0(?::0){4,}/.test(s0)) return true;
  const s = s0;
  if (s.includes('.')) return v4Blocked(s);
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Blocked(mapped[1]);
  if (s === '::' || s === '::1') return true;
  const h = parseInt((s.split(':')[0] || '0'), 16) || 0;
  if ((h & 0xfe00) === 0xfc00) return true;        // fc00::/7 ULA
  if ((h & 0xffc0) === 0xfe80) return true;        // fe80::/10 链路本地
  if ((h & 0xffff) === 0x2002) return true;        // 2002::/16 6to4
  if (s.startsWith('64:ff9b')) return true;        // NAT64
  if (s.startsWith('2001:db8')) return true;       // 文档专用
  return false;
}

// DNS 解析后的地址逐一过黑名单
async function guardResolvedIps(hostname) {
  let addrs;
  try {
    addrs = await doResolve(hostname);
  } catch (e) {
    throw new Error(`域名无法解析：${hostname}（${e.code || e.message}）`);
  }
  const list = Array.isArray(addrs) ? addrs : [addrs];
  for (const a of list) {
    if (ipBlocked(a.address)) {
      throw new Error(`域名 ${hostname} 解析到内网/保留地址 ${a.address}，已拒绝（SSRF 防护）`);
    }
  }
}

// ---------- 与卡片 website 的同源检查 ----------
function hostOf(website) {
  const u = new URL(str(website)); // 非法直接抛
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('website 须为 http/https URL');
  return u.hostname.toLowerCase().replace(/\.$/, '');
}
function sameSite(a, b) {
  return a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
}

// ---------- 抓取验证文件（手动跟随重定向，每一跳重新做 SSRF 检查） ----------
function fetchUrl(url) {
  return doFetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'user-agent': 'EEO-Claim-Verify/1.0 (GitHub Actions)' },
  });
}

async function readBodyCapped(res) {
  const cl = Number(res.headers.get('content-length') || 0);
  if (cl && cl > MAX_FILE_BYTES) throw new Error(`验证文件超过 ${MAX_FILE_BYTES} 字节上限`);
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let out = '', got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (got > MAX_FILE_BYTES) {
        try { reader.cancel(); } catch (_) { /* 已断开 */ }
        throw new Error(`验证文件超过 ${MAX_FILE_BYTES} 字节上限`);
      }
      out += dec.decode(value, { stream: true });
    }
    return out + dec.decode();
  }
  return res.text();
}

async function fetchClaimFile(host, token, name) {
  let url = `https://${host}/eeo-claim-${token}.txt`;
  let res;
  for (let hop = 0; ; hop++) {
    res = await fetchUrl(url);
    if (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
      if (hop >= MAX_REDIRECTS) throw new Error('重定向次数过多（>3）');
      const loc = res.headers.get('location') || '';
      if (!loc) throw new Error(`HTTP ${res.status} 未携带 Location 头`);
      let next;
      try { next = new URL(loc, url); } catch (_) { throw new Error('重定向地址非法'); }
      if (next.protocol !== 'https:') throw new Error(`重定向到非 https（${next.protocol}），已拒绝`);
      if (next.port && next.port !== '443') throw new Error('重定向携带非默认端口，已拒绝');
      const nh = next.hostname.toLowerCase().replace(/\.$/, '');
      assertPublicHost(nh);
      await guardResolvedIps(nh);
      url = next.href;
      continue;
    }
    break;
  }
  if (res.status !== 200) throw new Error(`HTTP ${res.status}（抓取 ${url} 失败）`);
  const body = await readBodyCapped(res);
  if (!body.includes(name)) {
    throw new Error('验证文件内容不含品牌名（须包含与品牌卡 name 完全一致的字符串）');
  }
  return { url };
}

// ---------- 单卡校验 ----------
// 返回：null = 与认领无关；{ok:true} = 通过；{ok:false, reason} = 失败
async function verifyCard(card, file, baseCard) {
  const name = str(card.name);
  const claim = obj(card.claim) || {};
  const status = str(claim.status);

  // 基准身份绑定：认领 PR 不允许顺带改动品牌名或官网——
  // 把 website 和 claim.domain 一起换成自己的域名不应得到"验证通过"的背书
  if (baseCard) {
    if (str(baseCard.name) && str(baseCard.name) !== name) {
      return { name: name || file, file, ok: false, domain: '', reason: `品牌名与基准分支不一致（基准 ${str(baseCard.name)}），改名请另开 PR 单独说明` };
    }
    if (str(baseCard.website) && str(baseCard.website) !== str(card.website || '')) {
      return { name: name || file, file, ok: false, domain: '', reason: `官网与基准分支不一致（基准 ${str(baseCard.website)}），变更官网请另开 PR 单独审核` };
    }
  }

  if (status !== 'claiming') {
    if (status === 'claimed') {
      return { name: name || file, file, ok: false, domain: '', reason: 'PR 里不能直接把 claim.status 写成 claimed——认领须走验证流程，合并后由 CI 自动盖章' };
    }
    if (status && !['unclaimed', 'manual-review'].includes(status)) {
      return { name: name || file, file, ok: false, domain: '', reason: `claim.status 取值非法：${status}（应为 unclaimed / claiming）` };
    }
    return null;
  }

  if (!name) return { name: '(缺少 name)', file, ok: false, domain: '', reason: '品牌卡缺少 name，无法核验' };
  const domain = str(claim.domain);
  const token = str(claim.token);

  if (!domain) return { name, file, ok: false, domain: '', reason: 'claim.domain 为空' };
  if (!token || !TOKEN_RE.test(token)) {
    return { name, file, ok: false, domain, reason: 'claim.token 缺失或非法（须 6-64 位 [A-Za-z0-9_-]）' };
  }

  let host;
  try {
    host = normalizeDomain(domain);
  } catch (e) {
    return { name, file, ok: false, domain, reason: e.message };
  }

  let websiteHost;
  try {
    websiteHost = hostOf(card.website);
  } catch (_) {
    return { name, file, ok: false, domain: host, reason: 'website 缺失或不是合法的 http(s) URL' };
  }
  if (!sameSite(websiteHost, host)) {
    return { name, file, ok: false, domain: host, reason: `claim.domain（${host}）与卡片 website（${websiteHost}）不同源` };
  }

  try {
    await guardResolvedIps(host);
    const r = await fetchClaimFile(host, token, name);
    return { name, file, ok: true, domain: host, url: r.url };
  } catch (e) {
    return { name, file, ok: false, domain: host, reason: e.message };
  }
}

// ---------- 报告 ----------
function cell(s) {
  return String(s == null ? '' : s).replace(/\|/g, '／').replace(/\r?\n/g, ' ');
}
function buildReport(results, scanned) {
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  const lines = [];
  lines.push('## 认领核验 / Claim verification');
  lines.push('');
  lines.push(`扫描 ${scanned} 张品牌卡，待认领 ${results.length} 张：**${ok} 通过 / ${fail} 失败**`);
  lines.push('');
  lines.push('| 品牌 | 验证域名 | 结果 |');
  lines.push('| --- | --- | --- |');
  for (const r of results) {
    lines.push(`| ${cell(r.name)} | ${cell(r.domain) || '—'} | ${r.ok ? '✅ 验证文件核验通过' : '❌ ' + cell(r.reason)} |`);
  }
  lines.push('');
  if (fail) {
    lines.push('- 修复 ❌ 项后向本 PR push 新提交，核验会自动重跑 / Push a new commit to re-run.');
    lines.push('- 常见原因：验证文件不在官网根目录、文件内容与品牌卡 name 不一致、claim.domain 与 website 不同源。');
  } else {
    lines.push('- 全部通过，等待维护者合并；合并后认领自动生效 / All passed; the claim takes effect on merge.');
  }
  lines.push('');
  lines.push(`Result: ${ok} passed, ${fail} failed.`);
  return lines.join('\n');
}

// ---------- 主流程 ----------
const { execSync } = require('child_process');

// 取基准分支版本的文件内容（CI 里 BASE_SHA 由 workflow 注入；本地无基准时返回 null）
function baseFileText(f) {
  const sha = str(process.env.BASE_SHA);
  if (!sha) return null;
  try {
    return execSync(`git show ${sha}:${JSON.stringify(f)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch (_) {
    return null; // 新增文件或路径不在基准里
  }
}

// 任意格式（JSON 对象/数组 或 JSONL）解析为卡数组
function parseCards(text, isJsonl) {
  if (text == null) return [];
  if (isJsonl) {
    const out = [];
    for (const line of String(text).split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try { const c = JSON.parse(t); if (obj(c)) out.push(c); } catch { /* 坏行忽略：新文件侧才严格 */ }
    }
    return out;
  }
  try { return [...iterCards(JSON.parse(text))]; } catch { return []; }
}

const cardKey = (c) => str(c.wikidata) || ('name:' + str(c.name));
const canon = (c) => JSON.stringify({ ...c, claim: undefined });

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) return selfTest();

  const files = collectFiles(argv);
  if (!files.length) {
    console.error('未指定待核验文件：请传 JSON/JSONL 文件路径参数，或设置 PR_FILES 环境变量（换行分隔）');
    process.exit(1);
  }

  const results = [];
  let scanned = 0;

  for (const f of files) {
    const isJsonl = f.endsWith('.jsonl');
    if (!isJsonl && !f.endsWith('.json')) continue;
    if (!fs.existsSync(f)) {
      results.push({ name: f, file: f, ok: false, domain: '', reason: '文件不存在（检出内容与 diff 不一致）' });
      continue;
    }
    if (isJsonl) {
      // 注册表分片可能十几万行：逐行流式比对，只把真正变更的条目送核验
      const baseText = baseFileText(f);
      const baseMap = new Map(parseCards(baseText, true).map((c) => [cardKey(c), c]));
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t) continue;
        let card;
        try { card = JSON.parse(t); } catch (e) {
          results.push({ name: f + ':' + (i + 1), file: f, ok: false, domain: '', reason: 'JSONL 第 ' + (i + 1) + ' 行解析失败：' + e.message });
          continue;
        }
        if (!obj(card) || str(card.schema) !== 'eeo.brand.v1') continue;
        const base = baseMap.get(cardKey(card)) || null;
        const claimChanged = !base || JSON.stringify(obj(card.claim) || null) !== JSON.stringify(obj(base.claim) || null);
        if (base && !claimChanged && canon(card) === canon(base)) continue; // 条目整体未变：跳过
        scanned++;
        if (str(card.claim && card.claim.status) === 'claiming' || claimChanged) {
          const r = await verifyCard(card, f, base);
          if (r) results.push(r);
        }
      }
      continue;
    }
    // JSON（单卡或数组）：同样只核验有变更的卡；基准缺失时按老规则全量扫
    const baseText = baseFileText(f);
    const baseMap = new Map(parseCards(baseText, false).map((c) => [cardKey(c), c]));
    let data;
    try {
      data = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      results.push({ name: f, file: f, ok: false, domain: '', reason: 'JSON 解析失败：' + e.message });
      continue;
    }
    for (const card of iterCards(data)) {
      if (str(card.schema) !== 'eeo.brand.v1') continue; // 非 EEO 品牌卡，跳过
      const base = baseMap.size ? (baseMap.get(cardKey(card)) || null) : null;
      const claimChanged = base == null || JSON.stringify(obj(card.claim) || null) !== JSON.stringify(obj(base.claim) || null);
      if (base && !claimChanged && canon(card) === canon(base)) continue; // 无变更条目不再拦截
      scanned++;
      const r = await verifyCard(card, f, base);
      if (r) results.push(r);
    }
  }

  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  for (const r of results) {
    console.log(r.ok ? `✅ ${r.name} verified — ${r.url}` : `❌ ${r.name}：${r.reason}`);
  }
  console.log(`\n${scanned} 张品牌卡扫描，${results.length} 张待认领：${ok} 通过，${fail} 失败`);

  if (results.length) {
    const report = buildReport(results, scanned);
    if (process.env.CLAIM_REPORT) {
      fs.writeFileSync(process.env.CLAIM_REPORT, report + '\n');
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n\n');
    }
  }
  process.exit(fail > 0 ? 1 : 0);
}

// ---------- 自测（不联网） ----------
async function selfTest() {
  let pass = 0, fail = 0;
  const t = (label, cond) => {
    if (cond) { pass++; console.log('  ✅ ' + label); }
    else { fail++; console.log('  ❌ ' + label); }
  };
  const rejectsDomain = (input, label) => {
    try { normalizeDomain(input); t(label, false); } catch (_) { t(label, true); }
  };

  console.log('[1] 域名输入校验（SSRF 第一层）');
  rejectsDomain('localhost', '拒绝 localhost');
  rejectsDomain('127.0.0.1', '拒绝 127.0.0.1');
  rejectsDomain('10.0.0.1', '拒绝 10.0.0.1');
  rejectsDomain('172.16.0.1', '拒绝 172.16.0.1');
  rejectsDomain('192.168.1.1', '拒绝 192.168.1.1');
  rejectsDomain('169.254.1.1', '拒绝链路本地 169.254.1.1');
  rejectsDomain('0.0.0.0', '拒绝 0.0.0.0');
  rejectsDomain('100.64.0.1', '拒绝 CGNAT 100.64.0.1');
  rejectsDomain('::1', '拒绝 IPv6 字面量 ::1');
  rejectsDomain('[::1]', '拒绝 IPv6 字面量 [::1]');
  rejectsDomain('198.18.0.5', '拒绝基准测试段 198.18.0.5');
  rejectsDomain('203.0.113.5', '拒绝文档段 203.0.113.5');
  rejectsDomain('ftp://good.example', '拒绝非 http(s) scheme');
  rejectsDomain('http://good.example:8080', '拒绝携带端口');
  rejectsDomain('user@good.example', '拒绝携带 userinfo');
  rejectsDomain('good.example/../../admin', '拒绝路径注入形态');
  rejectsDomain('-bad.example', '拒绝非法开头连字符');
  rejectsDomain('ba d.example', '拒绝带空格');
  try {
    const h = normalizeDomain('https://WWW.Good.Example/');
    t('归一化 https://WWW.Good.Example/ → www.good.example', h === 'www.good.example');
  } catch (_) { t('归一化 https://WWW.Good.Example/ → www.good.example', false); }

  console.log('[2] token 校验');
  t('拒绝路径注入 token "../etc"', !TOKEN_RE.test('../etc'));
  t('拒绝 5 位 token', !TOKEN_RE.test('abc12'));
  t('拒绝 65 位 token', !TOKEN_RE.test('a'.repeat(65)));
  t('接受 abc123', TOKEN_RE.test('abc123'));
  t('接受 ab_c-123', TOKEN_RE.test('ab_c-123'));

  console.log('[3] IP 黑名单');
  t('172.31.255.255 命中 172.16/12', ipBlocked('172.31.255.255'));
  t('172.32.0.1 不在黑名单', !ipBlocked('172.32.0.1'));
  t('192.169.0.1 不在黑名单', !ipBlocked('192.169.0.1'));
  t('8.8.8.8 不在黑名单', !ipBlocked('8.8.8.8'));
  t('224.0.0.1 命中组播段', ipBlocked('224.0.0.1'));
  t('::ffff:10.0.0.5 命中 v4 映射', ipBlocked('::ffff:10.0.0.5'));
  t('fc00::1 命中 ULA', ipBlocked('fc00::1'));
  t('fe80::1 命中链路本地', ipBlocked('fe80::1'));

  console.log('[4] DNS 解析防护（mock）');
  doResolve = async () => [{ address: '192.168.1.1' }, { address: '8.8.8.8' }];
  try { await guardResolvedIps('rebind.example'); t('解析结果含 192.168.1.1 时拒绝', false); }
  catch (e) { t('解析结果含 192.168.1.1 时拒绝', /内网/.test(e.message)); }
  doResolve = async () => [{ address: '93.184.216.34' }];
  try { await guardResolvedIps('good.example'); t('解析结果全为公网地址时放行', true); }
  catch (_) { t('解析结果全为公网地址时放行', false); }

  console.log('[5] 验证函数（mock fetch）');
  const NAME = '测试品牌';
  const routes = new Map([
    ['https://good.example/eeo-claim-abc123.txt', { status: 200, body: 'eeo-claim-v1\n' + NAME + '\n' }],
    ['https://wrongcontent.example/eeo-claim-abc123.txt', { status: 200, body: 'another brand' }],
    ['https://redir-http.example/eeo-claim-abc123.txt', { status: 302, location: 'http://good.example/eeo-claim-abc123.txt' }],
    ['https://redir-priv.example/eeo-claim-abc123.txt', { status: 302, location: 'https://192.168.0.1/eeo-claim-abc123.txt' }],
    ['https://redir-pub.example/eeo-claim-abc123.txt', { status: 302, location: 'https://good.example/eeo-claim-abc123.txt' }],
  ]);
  doFetch = async (url) => {
    const r = routes.get(url) || { status: 404, body: '' };
    const body = r.body || '';
    const headers = new Map();
    if (r.location) headers.set('location', r.location);
    headers.set('content-length', String(Buffer.byteLength(body)));
    return { status: r.status, headers, text: async () => body };
  };
  doResolve = async () => [{ address: '93.184.216.34' }];
  const card = (claim, extra) => Object.assign(
    { schema: 'eeo.brand.v1', name: NAME, website: 'https://www.good.example', claim }, extra);

  let r = await verifyCard(card({ status: 'claiming', domain: 'good.example', token: 'abc123' }), 't.json');
  t('正常路径：验证通过', r && r.ok === true);
  const onSite = (domain) => card({ status: 'claiming', domain, token: 'abc123' }, { website: 'https://www.' + domain });
  const tr = async (label, c, regex) => {
    const r = await verifyCard(c, 't.json');
    const good = r && ((regex && r.ok === false && regex.test(r.reason)) || (!regex && r.ok === true));
    t(good ? label : label + '（实际 reason: ' + (r && r.reason) + '）', !!good);
  };
  await tr('验证文件不存在：报 HTTP 404', onSite('missing.example'), /HTTP 404/);
  await tr('文件内容不含品牌名：拒绝', onSite('wrongcontent.example'), /不含品牌名/);
  await tr('重定向到 http：拒绝', onSite('redir-http.example'), /非 https/);
  await tr('重定向到内网 IP：拒绝', onSite('redir-priv.example'), /IP 字面量/);
  await tr('重定向到公网同源文件：通过', onSite('redir-pub.example'), null);
  r = await verifyCard(card({ status: 'claimed', method: 'domain-file' }), 't.json');
  t('PR 里直接写 claimed：拒绝', r && r.ok === false && /claimed/.test(r.reason));
  r = await verifyCard(card({ status: 'claiming', domain: 'good.example', token: 'abc123' }, { website: 'https://other.example' }), 't.json');
  t('claim.domain 与 website 不同源：拒绝', r && r.ok === false && /不同源/.test(r.reason));
  r = await verifyCard(card({ status: 'claiming', domain: 'good.example' }), 't.json');
  t('缺 token：拒绝', r && r.ok === false && /token/.test(r.reason));
  r = await verifyCard(card({ status: 'unclaimed' }), 't.json');
  t('unclaimed 卡：跳过（返回 null）', r === null);

  console.log(`\nself-test：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('claim-verify 崩溃：', e);
  process.exit(1);
});
