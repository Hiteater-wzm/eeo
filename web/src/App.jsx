import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Search, ArrowRight, Sparkles } from 'lucide-react';
import { API, BASE_PATH, PageWrap, Reveal, BouncyCard, CountUp, SPRING, Lines } from './ui.jsx';
import MethodPage from './MethodPage.jsx';
import StartPage from './StartPage.jsx';
import { RunView, ErrView, ReportView } from './ReportPage.jsx';
import CrawlerPage from './CrawlerPage.jsx';
import BrandDirectoryApp from './BrandDirectoryApp.jsx';

// ---------- 路由 ----------
function usePath() {
  const [path, setPath] = useState(() => normalize(location.pathname));
  useEffect(() => {
    const on = () => { setPath(normalize(location.pathname)); window.scrollTo(0, 0); };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}
function normalize(p) {
  let x = p.startsWith(BASE_PATH) ? p.slice(BASE_PATH.length) : p;
  x = x.replace(/\/+$/, '');
  return x || '/';
}
const nav = (to) => {
  history.pushState(null, '', BASE_PATH + to);
  window.scrollTo(0, 0);
  dispatchEvent(new PopStateEvent('popstate'));
};

// ---------- 头尾 ----------
function Header({ path }) {
  const item = (to, label) => (
    <button onClick={() => nav(to)} className={`px-0.5 text-[13px] font-bold transition-colors ${path === to ? 'text-black underline underline-offset-[6px] decoration-2' : 'text-zinc-600 hover:text-black hover:underline hover:underline-offset-[6px]'}`}>{label}</button>
  );
  return (
    <header className="sticky top-0 z-40 border-b-2 border-black bg-[#FFFBEB]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <button className="flex items-center gap-2" onClick={() => nav('/audit')}>
          <Bot size={20} strokeWidth={2.5} />
          <div className="text-left">
            <div className="text-[15px] font-black tracking-wide">EEO 体检</div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-zinc-500">EEO AUDIT</div>
          </div>
        </button>
        <nav className="hidden items-center gap-3 md:flex">
          {item('/', '首页')}
          {item('/method', '方法')}
          {item('/crawler', '爬虫监测')}
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={SPRING} onClick={() => nav('/start')} className="btn-primary px-4 py-2 text-[13px]">开始体检</motion.button>
        </nav>
        <button onClick={() => nav('/start')} className="btn-primary px-3.5 py-1.5 text-[13px] md:hidden">开始</button>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-10">
      <div className="stripe-bar" />
      <div className="bg-black py-8 text-center text-[12px] font-bold tracking-wide text-[#FFDE59]">
        EEO AUDIT 开源项目 双引擎交叉采样 逐题原文可查
      </div>
    </footer>
  );
}

// ---------- 首页 ----------
function Home() {
  const stats = [
    ['2', '独立引擎交叉验证'], ['12-48', '买家视角问题可选'],
    ['4', '维度：认知/推荐/竞品/原话'], ['3 档', '快速/标准/深度体检'],
  ];
  const cards = [
    [Search, '出题', '买家视角题库', '依据品牌与行业自动生成买家视角问题。三类问法如下。直接询问品牌（认知）。不带品牌名的比较（推荐）。具体场景（本地）。'],
    [Bot, '采样', '双引擎独立作答', '由 DeepSeek 与智谱GLM 逐题独立作答。两引擎互为交叉验证。原文逐题完整留存。支持逐条查阅。结论可复核。'],
    [Bot, '分析', '提及与对照', '统计品牌提及次数。识别无实料回答（含认错对象情形）。对照竞品数据。汇总生成 S/A/B/C/D 评级与改进建议。'],
  ];
  return (
    <div>
      <div className="stripe-bar" />
      <div className="border-y-2 border-black bg-black py-2 text-center text-[13px] font-bold tracking-wide text-[#FFDE59]">
        EEO 监测 双引擎交叉验证 原文逐题留存 报告即时生成
      </div>

      <div className="mx-auto max-w-6xl px-5 py-20 text-center">
        <motion.div
          initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...SPRING }}
          className="mb-6 inline-flex items-center gap-2 border-2 border-black bg-white px-3 py-1 text-[12px] font-bold shadow-[3px_3px_0_#000]"
        >
          <Sparkles size={13} strokeWidth={2.5} /> EEO 监测 自建引擎 原文逐题可查
        </motion.div>

        <motion.h1
          initial={{ scale: 0.86, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 240, damping: 20 }}
          className="mx-auto max-w-4xl text-5xl font-black leading-tight tracking-tight md:text-6xl"
        >
          买家向 AI 咨询时<br />
          <motion.span
            initial={{ scale: 0.6, rotate: -3, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.15 }}
            className="mt-4 inline-block border-2 border-black bg-[#FFDE59] px-3 shadow-[5px_5px_0_#000]"
          >AI 推荐了谁</motion.span>
        </motion.h1>

        <motion.p initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...SPRING, delay: 0.25 }} className="mx-auto mt-8 max-w-xl text-[15px] font-medium text-zinc-600">
          检测人工智能对贵品牌的认知与推荐现状
        </motion.p>

        <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...SPRING, delay: 0.35 }} className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} transition={SPRING} onClick={() => nav('/start')} className="btn-primary inline-flex items-center gap-2 px-7 py-3 text-[15px]">开始体检<ArrowRight size={15} strokeWidth={2.5} /></motion.button>
          <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} transition={SPRING} onClick={() => nav('/directory')} className="btn-ghost inline-flex items-center gap-2 px-7 py-3 text-[15px]">品牌目录<ArrowRight size={15} strokeWidth={2.5} /></motion.button>
        </motion.div>

        <div className="mt-12 flex flex-wrap justify-center gap-x-10 gap-y-6">
          {stats.map(([n, l], i) => (
            <motion.div key={l} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...SPRING, delay: 0.45 + i * 0.08 }} className="text-center">
              <div className="inline-block border-2 border-black bg-[#FFDE59] px-3 py-1 text-2xl font-black tabular-nums shadow-[3px_3px_0_#000]"><CountUp text={n} /></div>
              <div className="mt-2 text-[12px] font-bold text-zinc-600">{l}</div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map(([Icon, tag, t, d], i) => (
            <Reveal key={t} delay={i * 0.07}>
              <BouncyCard className="card-hover h-full border-2 border-black bg-white p-6 shadow-[4px_4px_0_#000]">
                <div className="mb-4 flex h-10 w-10 items-center justify-center border-2 border-black bg-[#FFDE59] shadow-[2px_2px_0_#000]"><Icon size={19} strokeWidth={2.5} /></div>
                <div className="mb-1.5 inline-block bg-black px-1.5 text-[11px] font-bold tracking-widest text-[#FFDE59]">{tag}</div>
                <div className="mb-2.5 text-[15px] font-black">{t}</div>
                <Lines text={d} className="text-[13px] font-medium leading-relaxed text-zinc-700" />
              </BouncyCard>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1} className="mt-10 text-center">
          <button onClick={() => nav('/method')} className="border-b-2 border-black text-[13px] font-bold hover:text-zinc-600">查阅方法说明与常见问题</button>
        </Reveal>
      </div>

      <div className="stripe-bar" />
      <div className="border-t-2 border-black bg-[#FFDE59] py-14 text-center">
        <Reveal>
          <div className="text-3xl font-black">即刻开始检测</div>
          <div className="mt-2 text-[14px] font-bold text-zinc-700">无需注册 报告支持转发 数据留存可查</div>
          <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} transition={SPRING} onClick={() => nav('/start')} className="btn-primary mt-6 inline-flex items-center gap-2 px-9 py-3.5 text-[16px]">开始体检<ArrowRight size={16} strokeWidth={2.5} /></motion.button>
        </Reveal>
      </div>
    </div>
  );
}

// ---------- 主应用 ----------
export default function App() {
  const path = usePath();
  const [rstate, setRstate] = useState(null); // {view:'run'|'report'|'err', jobId, status, rep, err}
  const [busy, setBusy] = useState(false);

  const isReport = path.startsWith('/r/');
  const page = isReport ? 'report' : path;

  const start = async (form) => {
    setBusy(true);
    try {
      const r = await fetch(API + 'start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: form.brand.trim(), website: form.website.trim(), city: form.city.trim(),
          industry: form.industry, audience: form.audience, competitors: form.competitors, depth: form.depth,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.jobId) { setRstate({ view: 'err', err: d.error || '提交失败' }); return; }
      history.pushState(null, '', BASE_PATH + '/r/' + d.jobId);
      dispatchEvent(new PopStateEvent('popstate'));
      setRstate({ view: 'run', jobId: d.jobId, status: null });
    } catch { setRstate({ view: 'err', err: '网络异常请稍后重试' }); } finally { setBusy(false); }
  };

  const loadReport = useCallback(async (id) => {
    const r = await fetch(API + 'report/' + id);
    const d = await r.json();
    if (d.phase !== 'done') { setRstate({ view: 'err', err: '报告尚未生成请稍后刷新' }); return; }
    setRstate({ view: 'report', rep: d });
  }, []);

  // 报告路由进入
  useEffect(() => {
    if (!isReport) { setRstate(null); return; }
    const id = path.split('/r/')[1];
    setRstate((s) => (s && s.jobId === id ? s : { view: 'run', jobId: id, status: null }));
    fetch(API + 'status/' + id).then((r) => r.json()).then((s) => {
      if (s.phase === 'done') loadReport(id);
      else if (s.phase === 'error') setRstate({ view: 'err', err: '体检中断：' + (s.error || '') });
      else if (!s.phase) setRstate({ view: 'err', err: '链接无效或报告已过期' });
      else setRstate((cur) => (cur && cur.view === 'run' ? { ...cur, status: s } : cur));
    }).catch(() => {});
  }, [isReport, path, loadReport]);

  // 轮询
  useEffect(() => {
    if (!isReport || !rstate || rstate.view !== 'run' || !rstate.jobId) return;
    const startedAt = Date.now();
    const t = setInterval(async () => {
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        clearInterval(t);
        setRstate((cur) => (cur && cur.view === 'run' ? { view: 'err', err: '检测超时。请稍后刷新或重新发起' } : cur));
        return;
      }
      try {
        const s = await (await fetch(API + 'status/' + rstate.jobId)).json();
        setRstate((cur) => (cur && cur.view === 'run' ? { ...cur, status: s } : cur));
        if (s.phase === 'done') { clearInterval(t); loadReport(rstate.jobId); }
        if (s.phase === 'error') { clearInterval(t); setRstate({ view: 'err', err: '体检中断：' + (s.error || '') }); }
      } catch { /* 忽略瞬时网络错误 */ }
    }, 3000);
    return () => clearInterval(t);
  }, [isReport, rstate, loadReport]);

  // 站点门面 = 品牌目录（白底 SPA 不套体检头尾）；体检工具首页在 /audit
  if (page === '/') return <BrandDirectoryApp initialView="home" />;
  if (page === '/directory') return <BrandDirectoryApp initialView="directory" />;

  return (
    <div className="min-h-screen">
      <Header path={page} />
      <AnimatePresence mode="wait">
        <PageWrap key={isReport ? 'r' : page} k={isReport ? 'r' : page}>
          {isReport && rstate?.view === 'run' && <RunView status={rstate.status} />}
          {isReport && rstate?.view === 'report' && <ReportView rep={rstate.rep} onBack={() => nav('/')} />}
          {isReport && rstate?.view === 'err' && <ErrView err={rstate.err} onBack={() => nav('/')} />}
          {page === '/audit' && <Home />}
          {page === '/method' && <MethodPage nav={nav} />}
          {page === '/start' && <StartPage onStart={start} busy={busy} />}
          {page === '/crawler' && <CrawlerPage />}
        </PageWrap>
      </AnimatePresence>
      <Footer />
    </div>
  );
}
