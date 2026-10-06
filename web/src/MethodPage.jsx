import { Search, Bot, ChartColumn, GraduationCap, Store, Package, Rocket } from 'lucide-react';
import { Reveal, BouncyCard, Lines } from './ui.jsx';

function Section({ num, title, sub, children }) {
  return (
    <section>
      <div className="stripe-bar" />
      <div className="mx-auto max-w-6xl px-5 py-14">
        <Reveal className="mb-2 flex items-center gap-3">
          <span className="border-2 border-black bg-[#FFDE59] px-1.5 py-0.5 text-[13px] font-black shadow-[2px_2px_0_#000]">{num}</span>
          <h2 className="text-[22px] font-black">{title}</h2>
        </Reveal>
        <Reveal delay={0.04} className="mb-8 text-[13px] font-medium text-zinc-600">{sub}</Reveal>
        {children}
      </div>
    </section>
  );
}

export default function MethodPage({ nav }) {
  const cards = [
    [Search, '出题', '买家视角题库', '按品牌、行业、城市与目标客户自动生成买家问题。三类问法：直接问品牌（认知）。不带品牌名比较（推荐）。具体场景（本地）。'],
    [Bot, '采样', '双引擎独立作答', 'DeepSeek 与智谱GLM 逐题独立作答。互为交叉验证。每题原文完整留存。逐条可查。结论可复核。'],
    [ChartColumn, '分析', '提及与对照', '提及计数。无实料识别（含认错人式歧义）。竞品对照。汇总为 S/A/B/C/D 评级与逐条改进建议。'],
  ];
  const who = [
    [GraduationCap, '教培与知识服务', '家长报名前往往咨询人工智能。若回答中没有贵机构。招生入口即被同行占据。'],
    [Store, '本地门店与服务', '本地类问题是人工智能的弱项。亦属空白机会。完成本地信号建设的商家为数不多。'],
    [Package, '消费品牌', '「哪个牌子好」类回答正在替代搜索首屏。推荐名单值得逐季度跟踪。'],
    [Rocket, '创业者', '新品从零建立人工智能认知。第一步检测基线。第二步铺设内容。第三步复测观察曲线。'],
  ];
  const faq = [
    ['测的是联网搜索还是 AI 的记忆？', '本工具直接调用模型接口。检测对象为模型的离线记忆。即人工智能是否掌握贵品牌信息。与联网搜索检测互为补充。记忆决定第一印象。检索决定现查现引。两者构成 EEO 的一体两面。'],
    ['为什么一次体检要几分钟？', '每道题由两个引擎独立真实作答。智谱GLM 属思考型模型。单题需要数十秒。无法加快。答案逐题真实生成。并非模板输出。'],
    ['结果会波动吗？', '单次采样存在随机波动。个别题标注可能变化。系统性结论稳定可信（如 0/8 的推荐缺席）。正式展示建议选用标准或深度档。隔周复测予以确认。'],
    ['检测次数怎么算？', '每访客每日可发起 10 次检测。三档深度任选。报告链接长期有效。支持转发。'],
    ['谁在提供这个服务？', '开源项目 EEO Audit。检测问题经你配置的密钥发送至 DeepSeek 与智谱接口完成分析。业务数据不向其他任何方传输。'],
  ];
  return (
    <div className="mx-auto max-w-6xl px-5 pt-12">
      <Reveal>
        <h1 className="text-4xl font-black">方法与说明</h1>
        <p className="mt-2 text-[14px] font-medium text-zinc-600">检测方法、适用对象与常见问题</p>
      </Reveal>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {cards.map(([Icon, tag, t, d], i) => (
          <Reveal key={t} delay={i * 0.06}>
            <BouncyCard className="card-hover h-full border-2 border-black bg-white p-6 shadow-[4px_4px_0_#000]">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border-2 border-black bg-[#FFDE59] shadow-[2px_2px_0_#000]"><Icon size={19} strokeWidth={2.5} /></div>
              <div className="mb-1.5 inline-block bg-black px-1.5 text-[11px] font-bold tracking-widest text-[#FFDE59]">{tag}</div>
              <div className="mb-2.5 text-[15px] font-black">{t}</div>
              <Lines text={d} className="text-[13px] font-medium leading-relaxed text-zinc-700" />
            </BouncyCard>
          </Reveal>
        ))}
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-4">
        {who.map(([Icon, t, d], i) => (
          <Reveal key={t} delay={i * 0.06}>
            <BouncyCard className="card-hover h-full border-2 border-black bg-white p-5 shadow-[4px_4px_0_#000]">
              <Icon size={20} strokeWidth={2.5} className="mb-3" />
              <b className="block text-[14px] font-black">{t}</b>
              <Lines text={d} className="mt-2 text-[12.5px] font-medium leading-relaxed text-zinc-700" />
            </BouncyCard>
          </Reveal>
        ))}
      </div>

      <div className="mt-10 mb-4">
        <Reveal><h2 className="text-[22px] font-black">常见问题</h2></Reveal>
        <div className="mt-6 grid gap-2.5 md:grid-cols-2">
          {faq.map(([q, a], i) => (
            <Reveal key={q} delay={i * 0.04}>
              <details className="card-hover border-2 border-black bg-white shadow-[4px_4px_0_#000]">
                <summary className="cursor-pointer px-5 py-3.5 text-[13.5px] font-black">{q}</summary>
                <Lines text={a} className="px-5 pb-4 text-[13px] font-medium leading-relaxed text-zinc-700" />
              </details>
            </Reveal>
          ))}
        </div>
      </div>

      <Reveal className="mt-12 mb-16 text-center">
        <button className="btn-primary px-10 py-3.5 text-[16px]" onClick={() => nav('/start')}>开始检测</button>
      </Reveal>
    </div>
  );
}
