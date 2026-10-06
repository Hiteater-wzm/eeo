import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bot, Eye, CalendarDays, Route } from 'lucide-react';
import { API, Reveal, Lines } from './ui.jsx';

export default function CrawlerPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(API + 'crawler').then((r) => r.json()).then((d) => {
      if (d && d.total !== undefined) setData(d); else setErr('当前环境无访问日志');
    }).catch(() => setErr('网络异常请稍后重试'));
  }, []);

  if (err) return (
    <div className="mx-auto max-w-4xl px-5 pt-16 pb-20">
      <h1 className="text-4xl font-black">AI 爬虫访问监测</h1>
      <div className="mt-8 border-[3px] border-black bg-white p-8 shadow-[6px_6px_0_#000]">
        <div className="text-[15px] font-black">{err}</div>
        <Lines text="本页数据来自服务器访问日志。部署于本站时展示真实到访记录" className="mt-2 text-[13px] font-medium text-zinc-600" />
      </div>
    </div>
  );
  if (!data) return (
    <div className="mx-auto max-w-4xl px-5 pt-16 pb-20">
      <h1 className="text-4xl font-black">AI 爬虫访问监测</h1>
      <div className="mt-8 border-2 border-black bg-white px-5 py-4 text-[14px] font-bold shadow-[4px_4px_0_#000]">日志解析中</div>
    </div>
  );

  const days = Object.entries(data.daily || {}).sort();
  const maxDay = Math.max(1, ...days.map(([, n]) => n));

  return (
    <div className="mx-auto max-w-5xl px-5 pt-12 pb-20">
      <Reveal>
        <h1 className="text-4xl font-black">AI 爬虫访问监测</h1>
        <Lines text="各引擎爬虫对本站的到访记录。数据来自服务器访问日志。逐条可溯" className="mt-2 text-[14px] font-medium text-zinc-600" />
      </Reveal>

      <div className="mt-8 flex flex-wrap gap-4">
        <Reveal className="border-[3px] border-black bg-[#FFDE59] px-8 py-5 shadow-[5px_5px_0_#000]">
          <div className="text-5xl font-black tabular-nums">{data.total}</div>
          <div className="mt-1 text-[12.5px] font-bold">AI 爬虫累计到访次数</div>
        </Reveal>
        <Reveal delay={0.06} className="border-[3px] border-black bg-white px-8 py-5 shadow-[5px_5px_0_#000]">
          <div className="text-5xl font-black tabular-nums">{(data.bots || []).length}</div>
          <div className="mt-1 text-[12.5px] font-bold">已识别爬虫种类</div>
        </Reveal>
        <Reveal delay={0.12} className="flex min-w-[240px] flex-1 flex-col justify-center border-[3px] border-black bg-black px-6 py-4 shadow-[5px_5px_0_#000]">
          <div className="text-[12.5px] font-bold leading-relaxed text-[#FFDE59]">
            每一次到访意味着引擎正在读取站内内容<br />
            到访频率与内容被 AI 引用的概率正相关
          </div>
        </Reveal>
      </div>

      <h2 className="mt-12 mb-1 text-[20px] font-black">爬虫到访记录</h2>
      <div className="mb-6 text-[12.5px] font-medium text-zinc-600">按到访次数排序</div>
      <div className="grid gap-4 md:grid-cols-2">
        {(data.bots || []).map((b, i) => (
          <Reveal key={b.key} delay={Math.min(i * 0.05, 0.4)}>
            <motion.div whileHover={{ y: -3 }} className="h-full border-2 border-black bg-white p-5 shadow-[4px_4px_0_#000]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center border-2 border-black bg-[#FFDE59]"><Bot size={14} strokeWidth={2.5} /></span>
                    <b className="font-mono text-[15px] font-black">{b.name}</b>
                  </div>
                  <div className="mt-1 text-[12.5px] font-bold text-zinc-600">{b.belong}</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black tabular-nums">{b.hits}</div>
                  <div className="text-[11px] font-bold text-zinc-500">次到访</div>
                </div>
              </div>
              {b.topPaths?.length > 0 && (
                <div className="mt-3 border-t-2 border-black pt-2.5">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-zinc-600"><Route size={12} strokeWidth={2.5} />常访问路径</div>
                  <div className="mt-1 font-mono text-[12px] font-bold">{b.topPaths.join('  ')}</div>
                </div>
              )}
              {b.lastSeen && (
                <div className="mt-2 flex items-center gap-1.5 text-[11.5px] font-bold text-zinc-500"><CalendarDays size={12} strokeWidth={2.5} />最近到访 {b.lastSeen}</div>
              )}
            </motion.div>
          </Reveal>
        ))}
      </div>

      {days.length > 0 && (
        <>
          <h2 className="mt-12 mb-1 text-[20px] font-black">按日到访分布</h2>
          <div className="mb-6 text-[12.5px] font-medium text-zinc-600">全部 AI 爬虫合计</div>
          <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0_#000]">
            {days.map(([d, n]) => (
              <div key={d} className="mb-2 flex items-center gap-3 text-[12.5px] font-bold">
                <span className="w-24 shrink-0 text-right font-mono text-zinc-600">{d}</span>
                <div className="h-5 flex-1 border-2 border-black bg-[#FFFBEB]">
                  <motion.div className="h-full bg-[#FFDE59]" initial={{ width: 0 }} whileInView={{ width: `${Math.round((n / maxDay) * 100)}%` }} viewport={{ once: true }} transition={{ duration: 0.5 }} />
                </div>
                <span className="w-16 text-right tabular-nums">{n} 次</span>
              </div>
            ))}
          </div>
        </>
      )}

      <Reveal className="mt-10">
        <div className="border-[3px] border-black bg-black p-6 shadow-[6px_6px_0_#000]">
          <div className="flex items-start gap-3">
            <Eye size={18} strokeWidth={2.5} className="mt-1 shrink-0 text-[#FFDE59]" />
            <div className="text-[13px] font-bold leading-relaxed text-[#FFDE59]">
              企业站点在服务器层面放行 AI 爬虫后产生到访记录<br />
              多数企业站从未完成此项配置。日志一片空白。人工智能从未读取过站内内容。被推荐无从谈起
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
