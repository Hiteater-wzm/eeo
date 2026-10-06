// EEO 工具：llms.txt 生成器（零依赖）
// 用法：node gen-llms.cjs https://example.com [输出目录]
// 流程：抓 sitemap.xml → 逐页提取标题与描述 → 组装 llms.txt / llms-full.txt
// 服务于 EEO 技术卫生层第一步（给甲方站点生成 AI 可读入口文件）
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const site = process.argv[2];
const outDir = process.argv[3] || '.';
if (!site) { console.error('用法: node gen-llms.cjs https://example.com [输出目录]'); process.exit(1); }
const base = site.replace(/\/+$/, '');

function fetchText(url, maxMs = 20000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'EEO-LLMS-Gen/1.0 (+llms.txt generator)' } }, (res) => {
      if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location) {
        res.resume();
        return resolve(fetchText(new URL(res.headers.location, url).href, maxMs));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let buf = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => { buf += c; if (buf.length > 2_000_000) req.destroy(); });
      res.on('end', () => resolve(buf));
    });
    req.on('error', reject);
    req.setTimeout(maxMs, () => req.destroy(new Error('timeout')));
  });
}

function strip(html) { return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, ''); }
function title(html) { const m = html.match(/<title[^>]*>([^<]*)<\/title>/i); return m ? m[1].trim() : ''; }
function desc(html) { const m = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i); return m ? m[1].trim() : ''; }
function h1(html) { const m = strip(html).match(/<h1[^>]*>([^<]*)<\/h1>/i); return m ? m[1].trim() : ''; }

(async () => {
  console.log('[1/3] 抓取 sitemap……');
  let urls = [];
  try {
    const sm = await fetchText(base + '/sitemap.xml');
    urls = [...sm.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).filter((u) => !/\.(jpg|png|gif|webp|ico|mp4|pdf|zip)$/i.test(u));
  } catch {
    console.log('  sitemap 不可用。仅处理首页。');
  }
  if (!urls.length) urls = [base + '/'];
  urls = urls.slice(0, 100);
  console.log(`  共 ${urls.length} 个页面`);

  console.log('[2/3] 逐页提取标题与描述……');
  const pages = [];
  for (const u of urls) {
    try {
      const html = await fetchText(u);
      pages.push({ url: u, t: title(html) || h1(html) || u, d: desc(html) });
      process.stdout.write(`  ok ${pages.length}/${urls.length}\r`);
    } catch (e) { pages.push({ url: u, t: u, d: '', err: String(e.message) }); }
  }
  console.log('');

  console.log('[3/3] 生成文件……');
  const home = pages[0] || { t: base, d: '' };
  const llms = `# ${home.t}\n\n> ${home.d || base}\n\n` + pages.map((p) => `- [${p.t}](${p.url})${p.d ? ': ' + p.d : ''}`).join('\n') + '\n';
  const full = `# ${home.t}（全文版）\n\n> 由 EEO 工具自动生成。原文以各页面 HTML 为准。\n\n` + pages.map((p) => `## ${p.t}\n\n地址: ${p.url}\n${p.d ? '描述: ' + p.d + '\n' : ''}`).join('\n');
  fs.writeFileSync(path.join(outDir, 'llms.txt'), llms, 'utf-8');
  fs.writeFileSync(path.join(outDir, 'llms-full.txt'), full, 'utf-8');
  console.log('完成: llms.txt / llms-full.txt 已写入 ' + path.resolve(outDir));
})();
