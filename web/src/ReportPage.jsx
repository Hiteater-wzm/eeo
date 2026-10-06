import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Share2, AlertTriangle, RotateCcw, TrendingUp, TrendingDown, Minus, History, FileText, Copy, RefreshCw } from 'lucide-react';
import { API, BASE_PATH, GRADE_COLOR, GRADE_TX, markFor, SPRING, Reveal, Lines } from './ui.jsx';

const TYPE_STYLE = {
  主动推荐: 'bg-[#00C853] text-white',
  中性列举: 'bg-black text-white',
  对比评价: 'bg-[#FFDE59] text-black',
  负面提及: 'bg-[#FF4D4D] text-white',
};

const STAGE_TXT = { gen: '买家问题生成中', collect: '正在向各引擎逐题提问', classify: '提及性质分析中', analyze: '提及与竞品分析中' };

export function RunView({ status }) {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-20 pb-16">
      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING} className="border-[3px] border-black bg-white p-8 shadow-[8px_8px_0_#000]">
        <div className="mb-6 flex items-center gap-3 text-[16px] font-black">
          <span className="inline-block h-3 w-3 animate-pulse border-2 border-black bg-[#FFDE59]" />
          {STAGE_TXT[status?.phase] || status?.phase || '准备中'}
        </div>
        {(status?.engines || []).map((e) => (
          <div key={e.id} className="mb-4 flex items-center gap-3.5 text-[13px] font-bold">
            <span className="w-20">{e.name}</span>
            <div className="h-5 flex-1 border-2 border-black bg-white">
              <motion.div className="bar-fill h-full" animate={{ width: `${e.total ? Math.round((e.done / e.total) * 100) : 0}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
            </div>
            <span className="w-12 text-right tabular-nums text-zinc-700">{e.done}/{e.total || '?'}</span>
          </div>
        ))}
        <Lines text="全程自动执行。本页每 3 秒刷新进度。完成后自动生成报告" className="mt-6 text-[12px] font-medium text-zinc-600" />
      </motion.div>
    </div>
  );
}

export function ErrView({ err, onBack }) {
  return (
    <div className="mx-auto max-w-2xl px-5 pt-20">
      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING} className="border-[3px] border-black bg-white p-8 shadow-[8px_8px_0_#000]">
        <div className="mb-3 flex items-center gap-2 text-[15px] font-black text-[#FF4D4D]"><AlertTriangle size={16} strokeWidth={2.5} /><Lines text={err} /></div>
        <button className="btn-ghost px-6 py-2.5 text-[14px]" onClick={onBack}><span className="inline-flex items-center gap-1.5"><RotateCcw size={13} strokeWidth={2.5} />返回</span></button>
      </motion.div>
    </div>
  );
}

function ScoreBar({ label, val, delay = 0 }) {
  return (
    <div className="flex items-center gap-3 text-[13px] font-bold">
      <span className="w-20 shrink-0 text-zinc-700">{label}</span>
      <div className="h-4 flex-1 border-2 border-black bg-white">
        <motion.div className="bar-fill h-full" initial={{ width: 0 }} animate={{ width: `${Math.min(100, val)}%` }} transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      <span className="w-12 text-right tabular-nums">{val} 分</span>
    </div>
  );
}

export function ReportView({ rep, onBack }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState(rep.drafts && rep.drafts.items ? rep.drafts.items : null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftErr, setDraftErr] = useState('');
  const [copiedIdx, setCopiedIdx] = useState(-1);
  const genDraft = () => {
    setDraftBusy(true); setDraftErr('');
    fetch(API + 'draft/' + rep.id, { method: 'POST' }).then((r) => r.json()).then((d) => {
      if (d.items) setDraft(d.items); else setDraftErr(d.error || '草稿生成失败');
    }).catch(() => setDraftErr('网络异常请稍后重试')).finally(() => setDraftBusy(false));
  };
  const sum = rep.summary || {};
  const sc = sum.score || {};
  const per = sum.perEngine || {};
  const brand = rep.brand;
  const pats = [brand];
  if (brand.length >= 4) {
    const w = brand.replace(/(工坊|工作室|科技|教育|信息技术|有限公司|网络|学院|平台|中心|机构|学堂)$/g, '');
    if (w.length >= 2) pats.push(w);
  }
  const g = sc.grade || { g: '-', t: '' };
  const gcolor = GRADE_COLOR[g.g] || '#E4E4E7';
  const gtx = GRADE_TX[g.g] || '#000';
  const depLabel = { quick: '快速 12 题', standard: '标准 30 题', deep: '深度 48 题' }[rep.depth] || '';
  const copy = () => { navigator.clipboard.writeText(location.origin + BASE_PATH + '/r/' + rep.id).then(() => setCopied(true)); };
  const [history, setHistory] = useState(null);
  useEffect(() => {
    fetch(API + 'history?brand=' + encodeURIComponent(brand)).then((r) => r.json()).then(setHistory).catch(() => {});
  }, [brand]);
  const curAware = Object.values(per).reduce((a, s) => a + s.aware, 0);
  const curAwareTotal = Object.values(per).reduce((a, s) => a + s.awareTotal, 0);
  const curMention = Object.values(per).reduce((a, s) => a + s.mention, 0);
  const prev = history && history.reports ? history.reports.filter((h) => h.id !== rep.id && h.createdAt < rep.createdAt).pop() : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <button className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-bold underline underline-offset-4 transition-colors hover:text-zinc-600" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />返回首页
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="tag font-mono text-[12px] tracking-[0.15em]">{sum.reportNo || ''}</div>
          <h2 className="mt-2 text-[26px] font-black">{brand} 体检报告</h2>
          <div className="mt-1.5 text-[12px] font-medium text-zinc-600">
            {new Date(rep.createdAt).toLocaleString('zh-CN')} 耗时 {Math.max(1, Math.round((rep.durationSec || 0) / 60))} 分钟{depLabel ? ' ' + depLabel : ''} 引擎：{rep.engines.map((e) => e.name).join('、')}{rep.reusedBank ? ' 题库与既往检测一致（保证复测可比）' : ''}
          </div>
        </div>
        <button className="btn-ghost inline-flex items-center gap-1.5 px-4 py-2 text-[13px]" onClick={copy}>
          <Share2 size={13} strokeWidth={2.5} />{copied ? '已复制' : '复制报告链接'}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-4">
        <motion.div
          initial={{ scale: 0.3, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="flex min-w-[190px] flex-col items-center justify-center border-[3px] border-black px-8 py-6 shadow-[6px_6px_0_#000]"
          style={{ background: gcolor }}
        >
          <div className="text-[72px] font-black leading-none tabular-nums" style={{ color: gtx }}>{g.g}</div>
          <div className="mt-2 text-[12px] font-bold" style={{ color: gtx }}>{g.t}</div>
        </motion.div>
        <motion.div initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...SPRING, delay: 0.1 }} className="flex min-w-[260px] flex-1 flex-col justify-center gap-3">
          <ScoreBar label="综合评分" val={sc.overall || 0} delay={0.15} />
          <ScoreBar label="品牌认知率" val={sc.awareRate || 0} delay={0.25} />
          <ScoreBar label="品类提及率" val={sc.mentionRate || 0} delay={0.35} />
        </motion.div>
        <motion.div initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...SPRING, delay: 0.18 }} className="flex min-w-[280px] flex-1 flex-col justify-center gap-1.5 border-2 border-black bg-white px-5 py-4 text-[12.5px] font-medium text-zinc-700 shadow-[4px_4px_0_#000]">
          {[['品牌', rep.brand], ['行业', rep.industry], ['城市', rep.city || '未填'], ['目标客户', rep.audience || '未填'], ['竞品', rep.competitors?.length ? rep.competitors.join('、') : '未填']].map(([k, v]) => (
            <div key={k}>{k}：<b className="font-black text-black">{v}</b></div>
          ))}
        </motion.div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {Object.values(per).map((s, i) => (
          <Reveal key={s.name} delay={i * 0.08} className="flex gap-4 border-2 border-black bg-white p-5 shadow-[4px_4px_0_#000]">
            <div className="flex-1 text-center">
              <div className={`text-4xl font-black tabular-nums ${s.aware ? 'text-[#00C853]' : 'text-[#FF4D4D]'}`}>{s.aware}/{s.awareTotal}</div>
              <div className="mt-1 text-[11.5px] font-bold text-zinc-600">{s.name} 品牌认知（有实料题数）</div>
            </div>
            <div className="w-[2px] bg-black" />
            <div className="flex-1 text-center">
              <div className={`text-4xl font-black tabular-nums ${s.mention ? 'text-[#00C853]' : 'text-[#FF4D4D]'}`}>{s.mention}</div>
              <div className="mt-1 text-[11.5px] font-bold text-zinc-600">{s.name} 品类题中被提及次数</div>
            </div>
          </Reveal>
        ))}
      </div>

      {sum.quotes?.length > 0 && (
        <Block title="人工智能不了解贵品牌时的原话">
          {sum.quotes.map((q, i) => (
            <Reveal key={i} delay={i * 0.05} className="mb-2.5 border-2 border-black border-l-4 border-l-[#FF4D4D] bg-white px-4 py-3 text-[13px] leading-relaxed text-zinc-800">
              {q.snippet}
              <div className="mt-1.5 text-[11px] font-bold text-zinc-500">—— {q.engine}，「{q.q}」</div>
            </Reveal>
          ))}
        </Block>
      )}

      <Block title="品类问题中的名称出现次数">
        {Object.values(per).map((s) => (
          <div key={s.name} className="mb-4">
            <div className="mb-2 text-[13.5px] font-black">{s.name}<span className="ml-2 font-medium text-[11.5px] text-zinc-600">品类/场景题共 {s.mentionTotal} 题</span></div>
            {[[brand, s.mention], ...Object.entries(s.competitors)].map(([n, c]) => (
              <div key={n} className="mb-1.5 flex items-center gap-3 text-[12.5px] font-bold">
                <span className="w-28 shrink-0 truncate text-right text-zinc-700">{n}</span>
                <div className="h-5 flex-1 border-2 border-black bg-white">
                  <motion.div className={`h-full ${c ? 'bg-[#FFDE59]' : 'bg-[#E4E4E7]'}`} initial={{ width: 0 }} whileInView={{ width: `${Math.min(100, c * 10)}%` }} viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
                </div>
                <span className="w-14 text-right tabular-nums">{c} 次</span>
              </div>
            ))}
          </div>
        ))}
      </Block>

      {sum.mentionDetail?.length > 0 && (
        <Block title="提及性质分析">
          <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {Object.entries(sum.mentionTypes || {}).map(([t, n]) => (
              <Reveal key={t} className={`border-2 border-black px-4 py-3 text-center shadow-[3px_3px_0_#000] ${TYPE_STYLE[t] || 'bg-white'}`}>
                <div className="text-2xl font-black tabular-nums">{n}</div>
                <div className="mt-0.5 text-[11.5px] font-bold">{t}</div>
              </Reveal>
            ))}
          </div>
          {sum.mentionDetail.map((d, i) => (
            <Reveal key={i} delay={Math.min(i * 0.04, 0.3)} className="mb-2 border-2 border-black bg-white px-4 py-3 text-[13px] shadow-[3px_3px_0_#000]">
              <span className={`mr-2 inline-block border border-black px-1.5 py-0.5 text-[11px] font-black ${TYPE_STYLE[d.type] || 'bg-white'}`}>{d.type}</span>
              <span className="font-bold">{d.engine}</span>
              <span className="text-zinc-500"> 第 {d.qid} 题</span>
              {d.quote && <div className="mt-1.5 text-zinc-700">「{d.quote}」</div>}
            </Reveal>
          ))}
        </Block>
      )}

      {history && history.count > 1 && (
        <Block title="历史检测记录">
          {prev && (
            <div className="mb-4 border-[3px] border-black bg-[#FFDE59] px-5 py-4 shadow-[5px_5px_0_#000]">
              <div className="mb-2 text-[14px] font-black">较上次检测</div>
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13.5px] font-bold">
                <span>品牌认知 {prev.aware}/{prev.awareTotal} → {curAware}/{curAwareTotal} {curAware > prev.aware ? <TrendingUp size={15} className="inline text-[#00A344]" /> : curAware < prev.aware ? <TrendingDown size={15} className="inline text-[#E30000]" /> : <Minus size={15} className="inline" />}</span>
                <span>品类提及 {prev.mention} → {curMention} {curMention > prev.mention ? <TrendingUp size={15} className="inline text-[#00A344]" /> : curMention < prev.mention ? <TrendingDown size={15} className="inline text-[#E30000]" /> : <Minus size={15} className="inline" />}</span>
                <span>评级 {prev.grade} → {g.g}</span>
              </div>
            </div>
          )}
          <div className="overflow-x-auto border-2 border-black bg-white shadow-[4px_4px_0_#000]">
            <table className="w-full text-[13px]">
              <thead><tr className="bg-[#FFDE59]">{['编号', '时间', '深度', '评级', '品牌认知', '品类提及'].map((t) => <th key={t} className="border-r border-black px-3 py-2 text-left font-black last:border-r-0">{t}</th>)}</tr></thead>
              <tbody>
                {[...history.reports].reverse().map((h) => (
                  <tr key={h.id} className={`border-t border-black font-medium ${h.id === rep.id ? 'bg-[#FFF3C4] font-black' : ''}`}>
                    <td className="px-3 py-2 font-mono text-[11.5px]">{h.reportNo}</td>
                    <td className="px-3 py-2">{new Date(h.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-3 py-2">{{ quick: '快速', standard: '标准', deep: '深度' }[h.depth] || h.depth}</td>
                    <td className="px-3 py-2 font-black">{h.grade}</td>
                    <td className="px-3 py-2 tabular-nums">{h.aware}/{h.awareTotal}</td>
                    <td className="px-3 py-2 tabular-nums">{h.mention}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-zinc-600"><History size={13} strokeWidth={2.5} />同一品牌历次检测自动归档。效果曲线由此生成</div>
        </Block>
      )}

      {sum.advice?.length > 0 && (
        <Block title="分析结论与改进建议">
          {sum.advice.map((a, i) => (
            <Reveal key={i} delay={i * 0.06} className="card-hover mb-3 border-2 border-black bg-white px-5 py-4 shadow-[4px_4px_0_#000]">
              <b className="block text-[14px] font-black"><span className="mr-2 inline-block bg-black px-1.5 font-mono text-[#FFDE59]">{String(i + 1).padStart(2, '0')}</span>{a.title}</b>
              <Lines text={a.detail} className="mt-1.5 text-[13px] font-medium leading-relaxed text-zinc-700" />
            </Reveal>
          ))}
        </Block>
      )}

      <Block title="逐题明细（点击展开原文）">
        <div className="overflow-x-auto border-2 border-black bg-white shadow-[4px_4px_0_#000]">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#FFDE59] text-black">
                <th className="border-r border-black px-3 py-2.5 text-left font-black">#</th>
                <th className="border-r border-black px-3 py-2.5 text-left font-black">问题</th>
                <th className="border-r border-black px-3 py-2.5 text-left font-black">类别</th>
                {rep.engines.map((e) => <th key={e.id} className="border-r border-black px-3 py-2.5 text-left font-black last:border-r-0">{e.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {rep.questions.map((q) => (
                <Fragment key={q.id} open={open === q.id} q={q} rep={rep} pats={pats} setOpen={setOpen} />
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      <Block title="内容执行包（草稿）">
        <div className="mb-4">
          <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} transition={SPRING} onClick={genDraft} disabled={draftBusy}
            className="btn-primary inline-flex items-center gap-2 px-7 py-2.5 text-[14px]">
            {draftBusy ? '内容草稿生成中' : draft ? <><RefreshCw size={14} strokeWidth={2.5} />重新生成</> : <><FileText size={14} strokeWidth={2.5} />生成内容草稿</>}
          </motion.button>
          <Lines text="依据本报告与买家问题自动生成内容草稿。草稿中的【待填】为事实占位。发布前须替换为可核实信息。禁止直接发布虚构内容" className="mt-2 text-[12px] font-medium text-zinc-600" />
          {draftErr && <div className="mt-2 text-[13px] font-black text-[#FF4D4D]">{draftErr}</div>}
        </div>
        {draft && draft.map((d, i) => (
          <Reveal key={i} delay={Math.min(i * 0.05, 0.25)} className="mb-4 border-2 border-black bg-white shadow-[4px_4px_0_#000]">
            <div className="flex items-center justify-between gap-3 border-b-2 border-black bg-[#FFDE59] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="bg-black px-1.5 text-[11px] font-black text-[#FFDE59]">{d.platform}</span>
                <b className="text-[13.5px] font-black">{d.title || ''}</b>
              </div>
              <button onClick={() => { navigator.clipboard.writeText((d.title ? d.title + '\n\n' : '') + d.content).then(() => { setCopiedIdx(i); setTimeout(() => setCopiedIdx(-1), 1500); }); }}
                className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1 text-[12px]">
                <Copy size={12} strokeWidth={2.5} />{copiedIdx === i ? '已复制' : '复制'}
              </button>
            </div>
            <div className="whitespace-pre-wrap px-5 py-4 text-[13.5px] leading-relaxed text-zinc-800">{d.content}</div>
          </Reveal>
        ))}
      </Block>

      <Lines text={'口径说明：本工具直接调用模型接口（离线记忆）。与联网搜索检测互为补充。品牌题判定是否给出实质信息。歧义输出不计入实料。品类与场景题统计名称出现次数。单次采样存在波动。系统性缺失可信。正式结论建议复测确认。报告编号 ' + (sum.reportNo || '-') + '。链接长期有效'} className="mt-6 text-[12px] font-medium leading-relaxed text-zinc-600" />
    </div>
  );
}

function Fragment({ open, q, rep, pats, setOpen }) {
  return (
    <>
      <tr className="cursor-pointer border-t border-black font-medium transition-colors hover:bg-[#FFF3C4]" onClick={() => setOpen(open ? null : q.id)}>
        <td className="px-3 py-2 text-zinc-500">{q.id}</td>
        <td className="px-3 py-2 font-bold">{q.q}</td>
        <td className="px-3 py-2 whitespace-nowrap text-zinc-500">{q.cat}</td>
        {rep.engines.map((e) => {
          const m = markFor(q.cat, q.answers?.[e.id]?.text, pats);
          const label = q.labels && q.labels[e.id] ? q.labels[e.id] : m.label;
          const cls = label === '有实料' || label === '提及' ? 'font-bold text-[#00C853]'
            : label === '无实料' ? 'bg-[#FF4D4D] px-1.5 font-bold text-white'
            : label === '未答' ? 'text-zinc-500' : m.cls;
          return <td key={e.id} className={`px-3 py-2 ${cls}`}>{label}</td>;
        })}
      </tr>
      <AnimatePresence>
        {open && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="border-t border-black bg-[#FFFBEB]"
          >
            <td colSpan={3 + rep.engines.length} className="px-5 py-4">
              <motion.div initial={{ y: -8 }} animate={{ y: 0 }} transition={SPRING}>
                {rep.engines.map((e) => (
                  <div key={e.id} className="mb-3">
                    <div className="mb-1 text-[12px] font-bold text-zinc-600">{e.name}：</div>
                    <div className="max-h-80 overflow-auto whitespace-pre-wrap border-2 border-black bg-white px-3.5 py-3 text-[13px] leading-relaxed text-zinc-800">
                      {q.answers?.[e.id]?.text || q.answers?.[e.id]?.error || '（无回答）'}
                    </div>
                  </div>
                ))}
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

function Block({ title, children }) {
  return (
    <div className="mt-7">
      <h3 className="mb-3 text-[15px] font-black">{title}</h3>
      {children}
    </div>
  );
}
