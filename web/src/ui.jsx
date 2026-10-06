import { useEffect, useState } from 'react';
import { motion, animate } from 'framer-motion';

// ---------- 常量与判定（业务红线：不许改动逻辑） ----------
// SPA 部署前缀：跟随 vite base（GitHub Pages 为 /eeo/；自建 /geo/ 部署用 --base=/geo/ 重建）
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/+$/, '');
export const API = BASE_PATH + '/api/';
export const GRADE_COLOR = { S: '#FFDE59', A: '#00C853', B: '#000000', C: '#FF8A00', D: '#FF4D4D' };
export const GRADE_TX = { S: '#000', A: '#000', B: '#fff', C: '#000', D: '#fff' };

const NOINFO_RE = /(没有|无法|暂未|未能|不在我|没听说过|缺乏|查不到)[^。！？]{0,24}(信息|资料|了解|掌握|记录|听说过|数据)|并不是一个广为人知|无法确认其|没有可靠信息/;
const AMBIG_RE = /不同语境|含义差别很大|如果(你说的?|指的是)|可能指(代|的是)?|指的是哪个|能具体说说|请(你)?补充|上下文|几种(可能|情况)|缩写(有点)?模糊|有时候并不是|并不(一定)?是品牌|可能是以下几种|先列几个最常见的/;

export function markFor(cat, text, pats) {
  if (!text) return { cls: 'text-zinc-500', label: '未答' };
  const noinfo = NOINFO_RE.test(text), ambig = AMBIG_RE.test(text);
  const has = pats.some((p) => text.indexOf(p) !== -1);
  if (cat === '品牌') return (has && !noinfo && !ambig)
    ? { cls: 'font-bold text-[#00C853]', label: '有实料' }
    : { cls: 'bg-[#FF4D4D] px-1.5 font-bold text-white', label: '无实料' };
  return has ? { cls: 'font-bold text-[#00C853]', label: '提及' } : { cls: 'text-zinc-500', label: '未提及' };
}

// ---------- 基础小件 ----------
export function Label({ children, className = '' }) {
  return <label className={`mb-1.5 block text-[13px] font-bold text-zinc-700 ${className}`}>{children}</label>;
}
export function Hint({ children }) {
  return <div className="mt-1 text-[12px] font-medium text-zinc-500">{children}</div>;
}

// 多句文案：按句分行展示。行尾不带标点
export function Lines({ text, className = '' }) {
  const parts = String(text).split('。').map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 1) return <div className={className}>{text}</div>;
  return (
    <div className={className}>
      {parts.map((p, i) => <div key={i}>{p}</div>)}
    </div>
  );
}

// ---------- 动效件 ----------
export const SPRING = { type: 'spring', stiffness: 320, damping: 26 };

// 页面容器：进出场干脆位移（无渐变飘感）
export function PageWrap({ k, children }) {
  return (
    <motion.div
      key={k}
      initial={{ y: 22, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -14, opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// 滚动进入视口时弹起
export function Reveal({ delay = 0, children, ...rest }) {
  return (
    <motion.div
      initial={{ y: 26, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: '-36px' }}
      transition={{ ...SPRING, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

// 弹性卡片（悬停抬起 + 按下压实）
export function BouncyCard({ children, className = '', onClick }) {
  return (
    <motion.div
      className={className}
      onClick={onClick}
      whileHover={{ y: -4 }}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}

// 数字滚动（纯数字才滚。其余直显）
export function CountUp({ text }) {
  const num = parseInt(text, 10);
  const isPure = /^\d+$/.test(text.trim());
  const [v, setV] = useState(isPure ? 0 : null);
  useEffect(() => {
    if (!isPure) return;
    const ctrl = animate(0, num, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (x) => setV(x) });
    return () => ctrl.stop();
  }, [num, isPure]);
  return <>{isPure ? Math.round(v) : text}</>;
}
