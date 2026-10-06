import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, ArrowRight, ArrowLeft, Coins } from 'lucide-react';
import { Label, Hint, SPRING, Lines } from './ui.jsx';

const INDUSTRIES = ['少儿编程培训', 'K12 教育培训', '职业教育', '留学咨询', '家政服务', '装修建材', '餐饮门店', '法律咨询', '口腔医疗', '汽车服务', '摄影婚庆', '健身私教', '软件与互联网服务', '电商品牌', '其他'];
const AUDIENCES = ['家长群体', '学生', '企业客户', '本地消费者', '女性消费者', '全人群'];
const DEPTHS = [
  { id: 'quick', name: '快速体检', qn: '12 题 约 5-9 分钟', desc: '品牌 4 题、品类 6 题、场景 2 题。适用于初步摸底', time: '约 5-9 分钟' },
  { id: 'standard', name: '标准体检', qn: '30 题 约 12-20 分钟', desc: '品牌 8 题、品类 16 题、场景 6 题。适用于正式报告与对外展示', time: '约 12-20 分钟' },
  { id: 'deep', name: '深度体检', qn: '48 题 约 20-35 分钟', desc: '品牌 12 题、品类 28 题、场景 8 题。适用于季度复测与竞品对标', time: '约 20-35 分钟' },
];

export default function StartPage({ onStart, busy }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ brand: '', website: '', city: '', desc: '', industry: INDUSTRIES[0], audience: AUDIENCES[0], competitors: '', depth: 'quick' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const brandOk = form.brand.trim().length >= 2;
  const depthObj = DEPTHS.find((d) => d.id === form.depth);

  return (
    <div className="mx-auto max-w-3xl px-5 pt-12 pb-20">
      <h1 className="text-4xl font-black">开始体检</h1>
      <p className="mt-2 text-[14px] font-medium text-zinc-600">三步完成填写。提交后自动执行。无需人工值守</p>

      <div className="mt-8 border-[3px] border-black bg-white p-6 shadow-[8px_8px_0_#000] md:p-9">
        <div className="mb-8 grid grid-cols-3 border-2 border-black">
          {['品牌档案', '市场定位', '体检深度'].map((t, i) => (
            <div key={t} className={`border-r-2 border-black py-2.5 text-center text-[13px] font-bold last:border-r-0 ${step === i + 1 ? 'bg-[#FFDE59] text-black' : 'bg-white text-zinc-500'}`}>
              <div className="text-[10px] font-black tracking-[0.2em] text-zinc-500">第{['一', '二', '三'][i]}步</div>{t}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="s1" initial={{ x: 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              <div className="grid gap-x-4 gap-y-1 md:grid-cols-2">
                <div>
                  <Label>品牌名称 *</Label>
                  <input className="field" maxLength={30} value={form.brand} onChange={set('brand')} placeholder="与营业执照或门店招牌一致" />
                  <Hint>请填写买家惯用的品牌全称（含字号后缀更为准确）</Hint>
                </div>
                <div>
                  <Label>官网或线上店铺（选填）</Label>
                  <input className="field" maxLength={60} value={form.website} onChange={set('website')} placeholder="例如 example.com" />
                  <Hint>有助于人工智能关联贵方官方信息</Hint>
                </div>
                <div>
                  <Label>所在城市（选填）</Label>
                  <input className="field" maxLength={20} value={form.city} onChange={set('city')} placeholder="例如 信阳" />
                  <Hint>填写后场景类问题将包含本地问法</Hint>
                </div>
                <div>
                  <Label>业务简介（选填）</Label>
                  <input className="field" maxLength={60} value={form.desc} onChange={set('desc')} placeholder="例如 教零基础的人用 AI 做游戏" />
                </div>
              </div>
              <div className="mt-8 flex justify-end">
                <button className="btn-primary px-8 py-2.5 text-[15px]" disabled={!brandOk} onClick={() => setStep(2)}>下一步</button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ x: 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              <div className="grid gap-x-4 gap-y-1 md:grid-cols-2">
                <div>
                  <Label>所在行业</Label>
                  <select className="field" value={form.industry} onChange={set('industry')}>
                    {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <Label>目标客户</Label>
                  <select className="field" value={form.audience} onChange={set('audience')}>
                    {AUDIENCES.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </div>
              </div>
              <Label className="mt-2">竞品名（选填，最多 5 个，逗号分隔）</Label>
              <input className="field" maxLength={120} value={form.competitors} onChange={set('competitors')} placeholder="例如 编程猫，核桃编程" />
              <Hint>填写竞品名称后自动生成对照数据。差距一目了然</Hint>
              <div className="mt-8 flex justify-between">
                <button className="btn-ghost px-6 py-2.5 text-[14px]" onClick={() => setStep(1)}><span className="inline-flex items-center gap-1.5"><ArrowLeft size={14} strokeWidth={2.5} />上一步</span></button>
                <button className="btn-primary px-8 py-2.5 text-[15px]" onClick={() => setStep(3)}>下一步</button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="s3" initial={{ x: 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              <Label>体检深度</Label>
              <div className="grid gap-4 md:grid-cols-3">
                {DEPTHS.map((d) => (
                  <motion.div key={d.id} whileTap={{ scale: 0.97 }} transition={SPRING} className={`eng-card p-5 ${form.depth === d.id ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, depth: d.id }))}>
                    <div className="flex items-center justify-between">
                      <b className="text-[15px] font-black">{d.name}</b>
                      {form.depth === d.id && <ShieldCheck size={16} strokeWidth={2.5} />}
                    </div>
                    <div className="mt-1.5 text-[13px] font-bold">{d.qn}</div>
                    <Lines text={d.desc} className="mt-2 text-[12px] font-medium leading-relaxed text-zinc-600" />
                  </motion.div>
                ))}
              </div>
              <div className="mt-6 flex items-start gap-2.5 border-2 border-black bg-[#FFFBEB] p-4 text-[13px] font-medium text-zinc-700">
                <Coins size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-black" />
                <div><b className="text-black">说明</b><Lines text="提交后系统自动执行。页面保持打开可查看进度。切离页面不影响结果。每访客每日可发起 10 次检测" /></div>
              </div>
              <div className="mt-8 flex justify-between">
                <button className="btn-ghost px-6 py-2.5 text-[14px]" onClick={() => setStep(2)}><span className="inline-flex items-center gap-1.5"><ArrowLeft size={14} strokeWidth={2.5} />上一步</span></button>
                <button className="btn-primary inline-flex items-center gap-2 px-8 py-2.5 text-[15px]" disabled={busy} onClick={() => onStart(form)}>
                  {busy ? '提交中……' : <>开始检测（{depthObj.time}）<ArrowRight size={15} strokeWidth={2.5} /></>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
