import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Search } from 'lucide-react';
import BrandDetailDialog from '@/components/BrandDetailDialog';

const PAGE_SIZE = 50;

const CLAIM_LABEL = { unclaimed: '未认领', claimed: '已认领', verified: '已验证' };
/* 认领状态只以文字颜色区分，不加形状装饰（设计规矩：禁圆点、禁徽章底色） */
const CLAIM_COLOR = { unclaimed: 'text-neutral-400', claimed: 'text-emerald-600', verified: 'text-emerald-700' };

/* 分页页码序列（带省略） */
function pageItems(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const items = [0];
  if (current > 2) items.push('left-ellipsis');
  for (let i = Math.max(1, current - 1); i <= Math.min(total - 2, current + 1); i++) items.push(i);
  if (current < total - 3) items.push('right-ellipsis');
  items.push(total - 1);
  return items;
}

function FilterDropdown({ label, options, value, onChange }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="inline-flex h-8 max-w-56 items-center gap-1 px-0 text-sm transition-colors hover:underline hover:underline-offset-4" />
        }
      >
        <span className="truncate text-muted-foreground">
          {label}：<span className={value ? 'font-medium text-foreground' : ''}>{value || '全部'}</span>
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v)}>
          <DropdownMenuRadioItem value="">{label}：全部</DropdownMenuRadioItem>
          {options.map(([name, count]) => (
            <DropdownMenuRadioItem key={name} value={name}>
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate">{name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* 紧凑行 -> 详情弹窗用的对象（点击时才构造，不预展开） */
function rowToBrand(o, countries, industries) {
  return {
    name: o.n || '',
    aliases: o.a || [],
    website: o.w || '',
    industry: o.i != null ? industries[o.i] || '' : '',
    city: o.ct || '',
    country: o.co != null ? countries[o.co] || '' : '',
    description: o.d || '',
    wikidata: o.q || '',
    claimStatus: o.cs || 'unclaimed',
    confidence: o.cf || 'medium',
    advantages: o.adv || [],
    sources: o.src || [],
    founded: o.f || '',
    tier: o.tr || 0,
    reg: o.rg || null,
  };
}

/**
 * 百万级目录：数据是字典编码的紧凑行（见 tools/build-index.cjs）。
 * 检索走预拼小写串数组，筛选/排序产出下标数组，渲染只碰当前页。
 * 默认序 = 注册表质量序（数据即序，不另排）。
 */
export default function Directory({ brands, initialFilters = {}, onBackHome }) {
  const [selected, setSelected] = useState(null);
  const [searchInput, setSearchInput] = useState(initialFilters.q || '');
  const [query, setQuery] = useState(initialFilters.q || '');
  const [industryFilter, setIndustryFilter] = useState(initialFilters.industry || '');
  const [countryFilter, setCountryFilter] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState(null); // {key:'name'|'country'|'industry', dir:1|-1}

  useEffect(() => {
    const t = setTimeout(() => { setQuery(searchInput.trim().toLowerCase()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { rows, countries, industries } = brands || { rows: null, countries: [], industries: [] };

  /* 预拼检索串：名称/别名/描述/城市 + 字典解码后的行业与国家 */
  const searchArr = useMemo(() => {
    if (!rows) return null;
    const out = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const o = rows[i];
      let s = o.n || '';
      if (o.a) s += '\n' + o.a.join('\n');
      if (o.d) s += '\n' + o.d;
      if (o.ct) s += '\n' + o.ct;
      if (o.co != null && countries[o.co]) s += '\n' + countries[o.co];
      if (o.i != null && industries[o.i]) s += '\n' + industries[o.i];
      out[i] = s.toLowerCase();
    }
    return out;
  }, [rows, countries, industries]);

  /* 筛选：产出下标数组 */
  const filtered = useMemo(() => {
    if (!rows || !searchArr) return [];
    const coIdx = countryFilter ? countries.indexOf(countryFilter) : -2;
    const indIdx = industryFilter ? industries.indexOf(industryFilter) : -2;
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const o = rows[i];
      if (coIdx !== -2 && (o.co == null || o.co !== coIdx)) continue;
      if (indIdx !== -2 && (o.i == null || o.i !== indIdx)) continue;
      if (query && !searchArr[i].includes(query)) continue;
      out.push(i);
    }
    return out;
  }, [rows, searchArr, query, industryFilter, countryFilter, countries, industries]);

  const keyOf = (o, key) => {
    if (key === 'name') return o.n || '';
    if (key === 'country') return o.co != null ? countries[o.co] || '' : '';
    return o.i != null ? industries[o.i] || '' : '';
  };

  const sorted = useMemo(() => {
    if (!sort || !rows) return filtered;
    const dir = sort.dir;
    const key = sort.key;
    return [...filtered].sort((ia, ib) => {
      const a = keyOf(rows[ia], key);
      const b = keyOf(rows[ib], key);
      return a < b ? -dir : a > b ? dir : 0;
    });
  }, [filtered, sort, rows, countries, industries]);

  const view = sorted;
  const pageCount = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const rangeStart = view.length === 0 ? 0 : pageSafe * PAGE_SIZE + 1;
  const rangeEnd = Math.min((pageSafe + 1) * PAGE_SIZE, view.length);

  const toggleSort = (key) => {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: 1 };
      if (cur.dir === 1) return { key, dir: -1 };
      return null; // 第三击恢复数据原序
    });
  };

  const SortIcon = ({ k }) => {
    const on = sort && sort.key === k;
    const Icon = on ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
    return <Icon className="size-3.5 text-muted-foreground" />;
  };

  const industriesCounted = brands?.stats?.industriesCounted || [];
  const countriesCounted = brands?.stats?.countriesCounted || [];

  const changeFilter = (setter) => (v) => { setter(v || ''); setPage(0); };

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      {/* 页头 */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">品牌目录</h1>
          <p className="mt-1 text-sm text-[#64748B] tabular-nums">
            {rows
              ? <>共 {view.length.toLocaleString()} / {rows.length.toLocaleString()} 个品牌（置信度随详情展示）</>
              : '加载中…'}
          </p>
        </div>
        {(query || industryFilter || countryFilter) && (
          <button
            onClick={() => { setSearchInput(''); setQuery(''); setIndustryFilter(''); setCountryFilter(''); setPage(0); }}
            className="text-sm text-[#64748B] underline underline-offset-4 hover:text-[#0F172A]"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* 工具栏：搜索 + 行业 + 国家 */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#64748B]" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索品牌名 / 别名 / 描述…"
            className="pl-9"
            aria-label="搜索品牌"
          />
        </div>
        <FilterDropdown label="行业" options={industriesCounted} value={industryFilter}
          onChange={changeFilter(setIndustryFilter)} />
        <FilterDropdown label="国家" options={countriesCounted} value={countryFilter}
          onChange={changeFilter(setCountryFilter)} />
      </div>

      {/* 表格：直接渲染紧凑行 */}
      <div className="overflow-hidden bg-card ring-1 ring-border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="cursor-pointer select-none hover:bg-muted/60" onClick={() => toggleSort('name')} aria-sort={sort?.key === 'name' ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                  <span className="inline-flex items-center gap-1">品牌<SortIcon k="name" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-muted/60" onClick={() => toggleSort('industry')}>
                  <span className="inline-flex items-center gap-1">行业<SortIcon k="industry" /></span>
                </TableHead>
                <TableHead>城市</TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-muted/60" onClick={() => toggleSort('country')}>
                  <span className="inline-flex items-center gap-1">国家/地区<SortIcon k="country" /></span>
                </TableHead>
                <TableHead>认领状态</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!rows ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><div className="h-4 animate-pulse bg-muted" /></TableCell>)}
                  </TableRow>
                ))
              ) : view.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    没有匹配的品牌，试试调整搜索词或筛选条件。
                  </TableCell>
                </TableRow>
              ) : (
                view.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE).map((idx) => {
                  const o = rows[idx];
                  const status = o.cs || 'unclaimed';
                  return (
                    <TableRow key={o.q || idx} onClick={() => setSelected(rowToBrand(o, countries, industries))} className="cursor-pointer">
                      <TableCell>
                        {o.w ? (
                          <a href={o.w} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                             className="font-medium text-[#0F172A] underline underline-offset-2 hover:text-[#64748B]">
                            {o.n}
                          </a>
                        ) : <span className="font-medium">{o.n}</span>}
                      </TableCell>
                      <TableCell>{o.i != null ? industries[o.i] || '—' : '—'}</TableCell>
                      <TableCell>{o.ct || '—'}</TableCell>
                      <TableCell>{o.co != null ? countries[o.co] || '—' : '—'}</TableCell>
                      <TableCell><span className={CLAIM_COLOR[status] || 'text-neutral-400'}>{CLAIM_LABEL[status] || status}</span></TableCell>
                      <TableCell>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelected(rowToBrand(o, countries, industries)); }}
                          className="text-sm text-[#0F172A] underline underline-offset-4 hover:text-[#64748B]"
                        >
                          详情
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 分页：纯文字（按钮禁方块规矩） */}
      {view.length > 0 && (
        <div className="mt-4 flex flex-col items-center gap-3">
          <nav className="flex items-center gap-3 text-sm" aria-label="分页">
            <button
              disabled={pageSafe === 0}
              onClick={() => setPage(pageSafe - 1)}
              className="text-[#64748B] hover:text-[#0F172A] hover:underline hover:underline-offset-4 disabled:pointer-events-none disabled:opacity-40"
            >
              上一页
            </button>
            <span className="flex items-center gap-2 tabular-nums">
              {pageItems(pageSafe, pageCount).map((p, idx) =>
                typeof p === 'number' ? (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    aria-current={p === pageSafe ? 'page' : undefined}
                    className={
                      p === pageSafe
                        ? 'font-semibold text-[#0F172A] underline underline-offset-4'
                        : 'text-[#64748B] hover:text-[#0F172A] hover:underline hover:underline-offset-4'
                    }
                  >
                    {p + 1}
                  </button>
                ) : (
                  <span key={`${p}-${idx}`} className="text-[#64748B]">…</span>
                )
              )}
            </span>
            <button
              disabled={pageSafe >= pageCount - 1}
              onClick={() => setPage(pageSafe + 1)}
              className="text-[#64748B] hover:text-[#0F172A] hover:underline hover:underline-offset-4 disabled:pointer-events-none disabled:opacity-40"
            >
              下一页
            </button>
          </nav>
          <p className="text-xs text-[#64748B] tabular-nums">
            第 {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} 条　每页 {PAGE_SIZE} 条　第 {pageSafe + 1}/{pageCount.toLocaleString()} 页
          </p>
        </div>
      )}

      <BrandDetailDialog brand={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
