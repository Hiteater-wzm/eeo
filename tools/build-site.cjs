#!/usr/bin/env node
// EEO 站点构建流水线：gen-site 生成 → 预生成搜索索引 → 注入纯前端搜索 UI
// 用法：
//   node tools/build-site.cjs                                  # 默认 datasets/brands-1k.json
//   node tools/build-site.cjs datasets/brands-all.json        # 全量数据
//   可选 --out <目录>（默认 docs/site/）  --theme light|dark（默认 dark）
//
// 为什么不用 Pagefind（2026-10-05 实测结论，详见 docs/publishing-stack.md 的 CJK 风险条款）：
//   Pagefind 1.5.2 Extended 在本数据集上中文分词索引与查询分词不一致，
//   搜索"腾讯/京东/字节跳动/小红书/五粮液"返回 0 结果，"老干妈"命中的是别的品牌。
//   --force-language zh 无改善。故按预案回退为纯前端 JS 搜索：
//   构建期把品牌名/别名/行业/城市写入 search-index.json，浏览器端做确定性子串过滤，
//   中文品牌名 100% 可命中，零分词依赖，零运行时依赖。
//
// 设计说明：
//   1. gen-site.cjs 保持零依赖不动，本脚本只调用它并后处理其输出
//   2. slug 复制自 gen-site.cjs 的 slugify（必须与其保持同步，否则索引里的链接会错）
//   3. 搜索 UI 注入根目录页，重跑 gen-site 后不会丢失
//   4. 资产全部相对路径（search-index.json），本地预览与 GitHub Pages 项目子路径（/eeo/）均可用

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

// ---------- slugify：与 tools/gen-site.cjs 逐字符一致（勿改动单方） ----------
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
function str(v) { return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim()); }
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

// ---------- 搜索索引 ----------
function buildSearchIndex(data) {
  const used = new Set();
  const brands = data.map((b) => ({
    s: slugify(b.name, used),           // slug = 子目录名
    n: str(b.name),                     // 名称
    a: Array.isArray(b.aliases) ? b.aliases.map(str).filter(Boolean) : [],
    i: str(b.industry),                 // 行业
    c: str(b.city),                     // 城市
  }));
  return { count: brands.length, brands };
}

// ---------- 注入到根目录页的搜索区块（黑黄设计系统） ----------
const SEARCH_BLOCK = `
  <section class="card" id="brand-search">
  <h2>搜索品牌</h2>
  <style>
#brand-search input{width:100%;box-sizing:border-box;font:inherit;font-weight:700;padding:10px 14px;background:#161616;color:#FFFBEB;border:3px solid #FFDE59;box-shadow:4px 4px 0 #FFDE59;outline:none;border-radius:0}
#brand-search input::placeholder{color:#C7BFA8;font-weight:400}
#brand-search .hint{font-size:13px;color:#C7BFA8;margin:8px 0 0}
#brand-search .hits{margin:14px 0 0;padding:0;list-style:none}
#brand-search .hits li{border-top:2px dashed #C7BFA8}
#brand-search .hits li:first-child{border-top:none}
#brand-search .hits a{display:flex;justify-content:space-between;gap:14px;padding:9px 4px;text-decoration:none;flex-wrap:wrap}
#brand-search .hits a:hover{background:#1F1D16}
#brand-search .hits .alias{color:#C7BFA8;font-weight:400}
#brand-search .hits .m{color:#C7BFA8;font-size:13px;font-weight:400;white-space:nowrap}
  </style>
  <form action="#" onsubmit="return false">
  <input id="brand-q" type="search" placeholder="输入品牌名 / 别名 / 行业 / 城市，如：腾讯、BYD、白酒" autocomplete="off" autofocus>
  </form>
  <p class="hint" id="brand-hint">输入即筛选，结果实时显示在下方</p>
  <ul class="hits" id="brand-hits"></ul>
  <script>
  (function () {
    var IDX = null;
    // 匹配规则：全字段小写子串匹配；名称前缀 > 名称包含 > 别名 > 行业/城市
    function rank(item, q) {
      var n = item.n.toLowerCase();
      if (n.indexOf(q) === 0) return 0;
      if (n.indexOf(q) !== -1) return 1;
      for (var k = 0; k < item.a.length; k++) if (item.a[k].toLowerCase().indexOf(q) !== -1) return 2;
      if (item.i.toLowerCase().indexOf(q) !== -1 || item.c.toLowerCase().indexOf(q) !== -1) return 3;
      return -1;
    }
    function search(q) {
      q = (q || '').trim().toLowerCase();
      if (!IDX || !q) return { total: 0, hits: [] };
      var out = [];
      for (var j = 0; j < IDX.length; j++) {
        var r = rank(IDX[j], q);
        if (r >= 0) out.push([r, j, IDX[j]]);
      }
      out.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
      return { total: out.length, hits: out.slice(0, 30).map(function (x) { return x[2]; }) };
    }
    window.__eeoSearch = { load: function (d) { IDX = d; }, search: search };
    var input = document.getElementById('brand-q');
    var hits = document.getElementById('brand-hits');
    var hint = document.getElementById('brand-hint');
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function render() {
      var res = search(input.value);
      hits.innerHTML = res.hits.map(function (b) {
        var meta = [b.i, b.c].filter(Boolean).join('\\u3000');
        var alias = b.a.length ? ' <span class="alias">' + esc(b.a.join('\\u3001')) + '</span>' : '';
        return '<li><a href="' + encodeURIComponent(b.s) + '/">' + esc(b.n) + alias +
          (meta ? '<span class="m">' + esc(meta) + '</span>' : '') + '</a></li>';
      }).join('');
      var q = input.value.trim();
      hint.textContent = !q ? '输入即筛选，结果实时显示在下方'
        : '命中 ' + res.total + ' 个品牌' + (res.total > res.hits.length ? '（仅显示前 30，可继续输入缩小范围）' : '');
    }
    input.addEventListener('input', render);
    fetch('search-index.json').then(function (r) { return r.json(); }).then(function (d) {
      window.__eeoSearch.load(d.brands);
      render();
    }).catch(function () { hint.textContent = '搜索索引加载失败，请检查 search-index.json 是否与页面同源部署'; });
  })();
  </script>
  </section>`;

function usage() {
  return [
    'EEO 站点构建流水线（gen-site + 纯前端搜索）',
    '',
    '用法:',
    '  node tools/build-site.cjs [数据集 JSON] [--out <目录>] [--theme light|dark]',
    '',
    '步骤:',
    '  1. node tools/gen-site.cjs <数据集> --out <目录> --theme <主题>',
    '  2. 从同一数据集预生成 <目录>/search-index.json（品牌名/别名/行业/城市）',
    '  3. 根目录页注入搜索 UI（黑黄配色，客户端子串过滤，无运行时依赖）',
    '',
    '注意:',
    '  重跑前请先删除输出目录（rm -rf docs/site），避免残留旧品牌子目录',
  ].join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) { console.log(usage()); process.exit(0); }
  const opts = { dataset: 'datasets/brands-1k.json', out: 'docs/site', theme: 'dark' };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = argv[++i];
    else if (argv[i] === '--theme') opts.theme = argv[++i];
    else pos.push(argv[i]);
  }
  if (pos.length) opts.dataset = pos[0];

  const outRoot = path.resolve(REPO, opts.out);
  const t0 = Date.now();

  // ---- 步骤 1：gen-site 生成 ----
  console.log(`[1/3] gen-site  ${opts.dataset} -> ${opts.out}（主题 ${opts.theme}）`);
  const gen = spawnSync(process.execPath, [path.join('tools', 'gen-site.cjs'), opts.dataset, '--out', opts.out, '--theme', opts.theme], { cwd: REPO, stdio: 'inherit' });
  if (gen.status !== 0) { console.error('错误 gen-site 执行失败'); process.exit(gen.status || 1); }

  // ---- 步骤 2：预生成搜索索引 ----
  console.log('[2/3] 生成 search-index.json');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.resolve(REPO, opts.dataset), 'utf8'));
  } catch (e) {
    console.error('错误 数据集读取或解析失败 ' + e.message);
    process.exit(1);
  }
  if (!Array.isArray(data)) { console.error('错误 数据集需为品牌数组'); process.exit(1); }
  const index = buildSearchIndex(data);
  index.generated = new Date().toISOString().slice(0, 10);
  index.source = path.basename(opts.dataset);
  fs.writeFileSync(path.join(outRoot, 'search-index.json'), JSON.stringify(index), 'utf8');
  console.log(`      ${index.count} 个品牌 ${(fs.statSync(path.join(outRoot, 'search-index.json')).size / 1024).toFixed(0)} KB`);

  // ---- 步骤 3：根目录页注入搜索 UI ----
  console.log('[3/3] 注入搜索 UI 到根目录页');
  const indexPath = path.join(outRoot, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  if (html.includes('id="brand-search"')) {
    console.log('      已存在搜索区块，跳过');
  } else if (/<p class="count">[^<]*<\/p>/.test(html)) {
    html = html.replace(/(<p class="count">[^<]*<\/p>)/, `$1\n${SEARCH_BLOCK}`);
    fs.writeFileSync(indexPath, html, 'utf8');
  } else {
    console.error('错误 根目录页未找到注入锚点（p.count）'); process.exit(1);
  }

  console.log(`完成  耗时 ${Date.now() - t0} 毫秒  输出 ${outRoot}`);
}

main();
