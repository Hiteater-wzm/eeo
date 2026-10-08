import { useCallback, useEffect, useState } from 'react';
import { Github } from 'lucide-react';
import Home from './pages/Home.jsx';
import Directory from './pages/Directory.jsx';

const DATA_URL = (n) => import.meta.env.BASE_URL + 'data/brand-index-p' + n + '.json';
const GITHUB_REPO = 'https://github.com/Hiteater-wzm/eeo';

/**
 * 品牌目录 SPA：内部 state 切换 home / directory（不引入 react-router）。
 * 数据为分片紧凑索引（tools/build-index.cjs 输出）：第 0 片带字典与统计，
 * 其余片只含条目；下载完成后按片序拼接。百万级条目不做对象展开，
 * 检索与渲染直接吃紧凑行（见 pages/Directory.jsx）。
 */
export default function BrandDirectoryApp({ initialView = 'directory' }) {
  const [view, setView] = useState(initialView); // 'home' | 'directory'
  const [brands, setBrands] = useState(null);
  const [error, setError] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ done: 0, total: 0 }); // 渐进加载进度
  const [pendingFilters, setPendingFilters] = useState(() => {
    // 支持 /directory?industry=xx&country=xx&q=xx 带参进入
    const sp = new URLSearchParams(window.location.search);
    const f = {};
    for (const k of ['q', 'industry', 'country']) {
      const v = (sp.get(k) || '').trim();
      if (v) f[k] = v;
    }
    return f;
  });

  const load = useCallback(() => {
    setError(false);
    setLoadProgress({ done: 0, total: 0 });
    fetch(DATA_URL(0))
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(async (d) => {
        let rows = d.b || [];
        const total = d.count || rows.length;
        const parts = d.parts || 1;
        setLoadProgress({ done: 1, total: parts });
        // 首片即刻可用：先渲染，其余片后台续载。
        // 合并必须产出新数组引用（concat）：既避开超大参数展开的栈上限，
        // 也让下游 useMemo（检索索引/筛选）感知数据变化——原地 push 会让搜索永远停在首片。
        setBrands({ rows, countries: d.countries || [], industries: d.industries || [], stats: d.stats || null, count: total });
        for (let p = 1; p < parts; p++) {
          try {
            const part = await fetch(DATA_URL(p)).then((r) => {
              if (!r.ok) throw new Error(String(r.status));
              return r.json();
            });
            rows = rows.concat(part.b);
            setBrands((cur) => (cur ? { ...cur, rows } : cur));
            setLoadProgress({ done: p + 1, total: parts });
          } catch (e) {
            setError(true);
            break;
          }
        }
      })
      .catch(() => setError(true));
  }, []);

  useEffect(load, [load]);

  /* 目录视图期间给 body 挂 on-dir：页面背景与滚动条切浅色 */
  useEffect(() => {
    document.body.classList.add('on-dir');
    return () => document.body.classList.remove('on-dir');
  }, []);

  const goHome = () => { setPendingFilters({}); setView('home'); };
  const goDirectory = (filters = {}) => { setPendingFilters(filters); setView('directory'); window.scrollTo(0, 0); };

  /* 文字式导航（按钮禁方块规矩）：无底无边框，悬停变色，选中字重+下划线 */
  const navBtn = (active) =>
    `inline-flex h-8 items-center gap-1.5 px-1.5 text-sm transition-colors ${
      active ? 'font-semibold text-[#0F172A] underline underline-offset-8' : 'text-[#64748B] hover:text-[#0F172A] hover:underline hover:underline-offset-8'
    }`;

  return (
    <div className="eeo-dir min-h-screen bg-white text-neutral-900">
      {/* 头部 */}
      <header className="sticky top-0 z-40 border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <button onClick={goHome} className="text-left leading-tight">
            <span className="block text-[15px] font-semibold tracking-tight text-[#0F172A]">EEO Brand Directory</span>
            <span className="block text-[10px] font-medium tracking-widest text-[#64748B] uppercase">eeo.brand.v2</span>
          </button>
          <nav className="flex items-center gap-3">
            {brands && loadProgress.total > 1 && loadProgress.done < loadProgress.total && (
              <span className="text-xs text-[#64748B] tabular-nums" aria-live="polite">
                数据加载 {loadProgress.done}/{loadProgress.total}
              </span>
            )}
            <button className={navBtn(view === 'home')} onClick={goHome}>
              首页
            </button>
            <button className={navBtn(view === 'directory')} onClick={() => goDirectory({})}>
              品牌目录
            </button>
            <a
              href={(import.meta.env.BASE_URL.replace(/\/+$/, '')) + '/audit'}
              className="inline-flex h-8 items-center px-1.5 text-sm text-[#64748B] transition-colors hover:text-[#0F172A] hover:underline hover:underline-offset-8"
            >
              体检工具
            </a>
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 px-1.5 text-sm text-[#64748B] transition-colors hover:text-[#0F172A] hover:underline hover:underline-offset-8"
            >
              <Github className="size-4" /> GitHub
            </a>
          </nav>
        </div>
      </header>

      {/* 主体 */}
      <main className="min-h-[calc(100vh-10rem)]">
        {error ? (
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-24 text-center">
            <p className="text-sm text-[#64748B]">品牌数据加载失败，请检查网络后重试。</p>
            <button
              onClick={load}
              className="text-sm font-medium text-[#0F172A] underline underline-offset-4 hover:text-[#64748B]"
            >
              重新加载
            </button>
          </div>
        ) : view === 'home' ? (
          <Home
            brands={brands}
            onSearch={(q) => goDirectory(q ? { q } : {})}
            onIndustry={(industry) => goDirectory({ industry })}
          />
        ) : (
          <Directory brands={brands} initialFilters={pendingFilters} onBackHome={goHome} />
        )}
      </main>

      {/* 脚部 */}
      <footer className="border-t border-border bg-[#F8FAFC]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-xs text-[#64748B] sm:flex-row">
          <span>EEO 开放品牌知识库　多轮逐条审查　权威注册背书　可复现测量　开放数据（Apache-2.0 / CC0）</span>
          <a href={GITHUB_REPO} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            <Github className="size-3.5" /> Hiteater-wzm/eeo
          </a>
        </div>
      </footer>
    </div>
  );
}
