import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExternalLink } from 'lucide-react';

const GITHUB_REPO = 'https://github.com/Hiteater-wzm/eeo';
const CLAIM_DOC = GITHUB_REPO + '/blob/main/platform/README.md';

const CLAIM_LABEL = {
  unclaimed: '未认领',
  claimed: '已认领',
  verified: '已验证',
};
/* 认领状态只以文字颜色区分（与表格列同色板），不加形状装饰 */
const CLAIM_COLOR = {
  unclaimed: 'text-neutral-400',
  claimed: 'text-emerald-600',
  verified: 'text-emerald-700',
};
const CONFIDENCE_LABEL = {
  high: '高置信',
  medium: '中置信',
  low: '低置信',
};

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

export default function BrandDetailDialog({ brand, onClose }) {
  const open = !!brand;
  const b = brand || {};
  const claimStatus = b.claimStatus || 'unclaimed';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">{b.name}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm leading-relaxed">
              {(b.aliases || []).length > 0 ? b.aliases.join('　') : '暂无别名'}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Field label="行业">{b.industry || '—'}</Field>
          <Field label="城市">{b.city || '—'}</Field>
          <Field label="国家/地区">{b.country || '—'}</Field>
          <Field label="成立年份">{b.founded || '—'}</Field>
          <Field label="认领状态">
            <span className={CLAIM_COLOR[claimStatus] || 'text-neutral-400'}>
              {CLAIM_LABEL[claimStatus] || claimStatus}
            </span>
          </Field>
          <Field label="置信度">
            <span className="text-muted-foreground">
              {CONFIDENCE_LABEL[b.confidence] || b.confidence || '—'}
            </span>
          </Field>
        </div>

        {b.description && (
          <div className="bg-muted/60 p-3 text-sm leading-relaxed text-foreground">
            {b.description}
          </div>
        )}

        {(b.advantages || []).length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">可验证优势</div>
            <ul className="space-y-1 border-l border-border pl-3 text-sm leading-relaxed">
              {b.advantages.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">官网</span>
          {b.website ? (
            <a href={b.website} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1.5 font-medium text-[#0F172A] break-all underline underline-offset-2 hover:text-[#64748B]">
              {b.website} <ExternalLink className="size-3.5 shrink-0" />
            </a>
          ) : '—'}
        </div>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">来源</span>
          <ul className="space-y-0.5">
            {b.wikidata && (
              <li>
                <a href={`https://www.wikidata.org/wiki/${b.wikidata}`} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 text-[#0F172A] underline underline-offset-2 hover:text-[#64748B]">
                  Wikidata: {b.wikidata} <ExternalLink className="size-3" />
                </a>
              </li>
            )}
            {(b.sources || []).map((s) => (
              <li key={s}>
                <a href={s} target="_blank" rel="noreferrer"
                   className="text-[#0F172A] break-all underline underline-offset-2 hover:text-[#64748B]">{s}</a>
              </li>
            ))}
            {!b.wikidata && !(b.sources || []).length && <li className="text-muted-foreground">—</li>}
          </ul>
        </div>

        <DialogFooter>
          <a href={GITHUB_REPO} target="_blank" rel="noreferrer"
             className="text-sm text-[#64748B] underline underline-offset-4 hover:text-[#0F172A]">
            GitHub 仓库
          </a>
          <a href={CLAIM_DOC} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 text-sm font-semibold text-[#0F172A] underline underline-offset-4 hover:text-[#64748B]">
            认领此品牌
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
