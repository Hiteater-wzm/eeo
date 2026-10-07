import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

/**
 * 目录首页：工程数据库风格。静态数字、无动画、无卡片阴影。
 * brands 为 null 时显示数据加载中的占位，不做骨架渲染以外的装饰。
 */
export default function Home({ brands, onSearch, onIndustry }) {
  const [q, setQ] = useState('');

  /* 统计由索引预计算（stats.countriesCounted/industriesCounted），首页不扫全量 */
  const stats = useMemo(() => {
    if (!brands) return null;
    const s = brands.stats || {};
    const tiers = s.tiers || {};
    return {
      total: brands.count || (brands.rows ? brands.rows.length : 0),
      full: tiers.full || 0,
      lei: (s.regBadges && s.regBadges.lei) || 0,
      countries: s.countriesCounted ? s.countriesCounted.length : 0,
      industries: s.industriesCounted ? s.industriesCounted.length : 0,
      top: (s.industriesCounted || []).slice(0, 12),
    };
  }, [brands]);

  const submit = (e) => {
    e.preventDefault();
    onSearch(q.trim());
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      {/* 标题 + 总数：直接陈述，不做数字动画 */}
      <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">EEO Brand Directory</h1>
      <p className="mt-1.5 text-sm text-[#64748B] tabular-nums">
        {stats
          ? <>完整品牌卡 {stats.full.toLocaleString()}　全库组织 {stats.total.toLocaleString()}　LEI 注册背书 {stats.lei.toLocaleString()}　覆盖 {stats.countries} 个国家/地区</>
          : '品牌数据加载中…'}
      </p>

      {/* 搜索框：输入框为字段保留细边框，提交为文字按钮 */}
      <form onSubmit={submit} className="mt-6 flex max-w-2xl items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#64748B]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="品牌名 / 别名 / 描述，如：腾讯 / Tencent"
            className="h-10 pl-9 text-[15px]"
            aria-label="搜索品牌"
          />
        </div>
        <button type="submit" className="text-sm font-semibold text-[#0F172A] underline underline-offset-4 hover:text-[#64748B]">
          搜索
        </button>
      </form>

      {/* 行业入口：纯文字索引列表，无框无底，悬停下划线 */}
      <div className="mt-10">
        <div className="mb-3 text-sm font-medium text-[#0F172A]">按行业浏览</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          {stats
            ? stats.top.map(([name, count]) => (
              <button
                key={name}
                onClick={() => onIndustry(name)}
                className="flex items-baseline justify-between gap-2 text-left text-sm text-[#0F172A] hover:underline hover:underline-offset-4"
              >
                <span className="truncate">{name}</span>
                <span className="shrink-0 text-xs text-[#64748B] tabular-nums">{count.toLocaleString()}</span>
              </button>
            ))
            : Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-4" />
            ))}
        </div>
      </div>

      {/* 数据说明：一行带过，不放 CTA 大区块 */}
      <p className="mt-10 text-xs leading-relaxed text-[#64748B]">
        数据以 Apache-2.0 / CC0 发布；未认领条目引用时请同时呈现置信度。完整数据与认领流程见 GitHub 仓库 Hiteater-wzm/eeo。
      </p>
    </div>
  );
}
