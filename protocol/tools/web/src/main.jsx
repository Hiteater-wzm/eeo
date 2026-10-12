import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')).render(<App />);

const S = {
  reset: `*{margin:0;padding:0;box-sizing:border-box;border-radius:0!important}`,
  body: `font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;min-height:100vh`,
  header: `border-bottom:1px solid #262626;background:#0d0d0d;position:sticky;top:0;z-index:40`,
  headerInner: `max-w-1200px mx-auto flex items-center justify-between px-5 py-3`,
  brand: `text-[15px] font-semibold text-white`,
  brandSub: `text-[10px] font-medium tracking-[0.2em] text-zinc-500 uppercase`,
  nav: `flex items-center gap-5 text-sm`,
  navBtn: active => active ? 'font-semibold text-white underline underline-offset-8 decoration-2' : 'text-zinc-400 hover:text-white hover:underline hover:underline-offset-8 transition-colors',
  statusDot: online => online ? 'text-emerald-500' : 'text-zinc-600',
  main: `max-w-1200px mx-auto flex gap-0 min-h-[calc(100vh-57px)]`,
  chatCol: `flex-1 flex flex-col`,
  sidebar: `w-[280px] border-l border-[#262626] bg-[#0d0d0d] p-4 overflow-y-auto hidden lg:block`,
  sideTitle: `text-xs font-semibold text-zinc-400 mb-3 tracking-wider uppercase`,
  msgArea: `flex-1 overflow-y-auto px-5 py-6 space-y-4`,
  userMsg: `flex justify-end`,
  userBubble: `bg-white text-black px-4 py-3 text-sm leading-relaxed max-w-[80%]`,
  botMsg: `flex justify-start`,
  botBubble: `border border-[#333] bg-[#141414] px-4 py-3 text-sm leading-relaxed max-w-[80%]`,
  toolCall: `border-l-2 border-emerald-600 pl-3 py-2 text-xs text-zinc-400 bg-[#111] mb-2`,
  toolResult: `border border-[#2a2a2a] bg-[#0f0f0f] p-3 text-xs text-zinc-300 mt-2 overflow-x-auto`,
  inputBar: `border-t border-[#262626] bg-[#0d0d0d] px-5 py-4`,
  inputRow: `flex items-center gap-3`,
  input: `flex-1 bg-[#1a1a1a] border border-[#333] text-white px-4 py-3 text-sm outline-none focus:border-zinc-500 transition-colors placeholder:text-zinc-600`,
  sendBtn: `text-sm font-semibold text-white underline underline-offset-4 hover:text-zinc-400 disabled:opacity-30`,
  sideItem: `border-b border-[#222] py-2 text-xs last:border-b-0`,
  sideTime: `text-zinc-600 mr-2`,
  sideEvent: e => e.includes('error') ? 'text-red-400' : e.includes('tool') ? 'text-emerald-500' : 'text-zinc-300',
  sideDetail: `text-zinc-600 mt-0.5 break-all`,
  card: `border border-[#2a2a2a] bg-[#111] p-3 mb-3 text-xs`,
  cardRow: `flex justify-between py-0.5`,
  cardLabel: `text-zinc-500`,
  cardVal: `text-zinc-200`,
  loading: `text-zinc-500 text-sm flex items-center gap-2`,
  brandRow: `border border-[#2a2a2a] p-3 mb-2 text-xs`,
  brandName: `text-white font-medium text-sm`,
  brandTag: ok => ok ? 'text-emerald-500' : 'text-zinc-500',
};

function App() {
  const [view, setView] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState(null);
  const [audit, setAudit] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [sessionId] = useState(() => 'sess_' + Math.random().toString(36).slice(2, 10));
  const endRef = useRef(null);

  useEffect(() => {
    fetch('/health').then(r => r.json()).then(setHealth).catch(() => setHealth(null));
    fetch('/api/v1/agent/identity').then(r => r.json()).then(setIdentity).catch(() => {});
    loadAudit();
  }, []);

  const loadAudit = useCallback(() => {
    fetch('/api/v1/audit?limit=20').then(r => r.json()).then(setAudit).catch(() => {});
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || busy) return;
    const msg = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', content: msg }]);
    setBusy(true);
    try {
      const r = await fetch('/api/v1/brand/lookup?name=' + encodeURIComponent(msg));
      const brands = await r.json();
      if (brands.results && brands.results.length > 0) {
        setMessages(m => [...m, { role: 'tool', tool: 'brand_lookup', data: brands.results }]);
        const summary = brands.results.map(b =>
          `• ${b.name}（${b.country || '—'}）${b.industry ? ' | ' + b.industry : ''}${b.has_lei ? ' | LEI已验证' : ''}${b.website ? ' | ' + b.website : ''}`
        ).join('\n');
        setMessages(m => [...m, { role: 'assistant', content: `在 EEO 注册表中找到以下品牌：\n\n${summary}` }]);
      } else {
        const vr = await fetch('/api/v1/brand/visibility?brand=' + encodeURIComponent(msg));
        const vis = await vr.json();
        if (vis.found) {
          setMessages(m => [...m, { role: 'tool', tool: 'brand_visibility', data: vis.metrics }]);
          const mt = vis.metrics;
          setMessages(m => [...m, { role: 'assistant', content: `${mt.brand} 的 AI 可见性：\n\n提及份额 ${(mt.mention_share * 100).toFixed(1)}%（95%区间 ${(mt.mention_ci95[0] * 100).toFixed(1)}%–${(mt.mention_ci95[1] * 100).toFixed(1)}%）\n推荐份额 ${mt.recommendation_share ? (mt.recommendation_share * 100).toFixed(1) + '%' : '—'}\n稳健可见率 ${(mt.robust_visibility * 100).toFixed(0)}%\n措辞敏感度 ${(mt.sensitivity * 100).toFixed(0)}%` }]);
        } else {
          setMessages(m => [...m, { role: 'assistant', content: `未找到"${msg}"的品牌信息。试试搜索品牌名称，如"腾讯"、"蜜雪冰城"、"苹果"。` }]);
        }
      }
      loadAudit();
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `连接失败: ${e.message}` }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      <style>{S.reset}</style>
      <div className={S.body}>
        <header className={S.header}>
          <div className={S.headerInner}>
            <div>
              <div className={S.brand}>EEO Agent</div>
              <div className={S.brandSub}>Brand Intelligence · Identity · Audit</div>
            </div>
            <nav className={S.nav}>
              <button className={S.navBtn(view === 'chat')} onClick={() => setView('chat')}>对话</button>
              <button className={S.navBtn(view === 'audit')} onClick={() => setView('audit')}>审计链</button>
              <button className={S.navBtn(view === 'identity')} onClick={() => setView('identity')}>身份</button>
              <span className={`text-xs ${S.statusDot(health?.status === 'ok')}`}>
                {health?.status === 'ok' ? '在线' : '离线'}
              </span>
            </nav>
          </div>
        </header>

        <div className={S.main}>
          <div className={S.chatCol}>
            {view === 'chat' && (
              <>
                <div className={S.msgArea}>
                  {messages.length === 0 && (
                    <div className="text-center py-20 text-zinc-600 text-sm">
                      <p className="mb-2 text-zinc-400">EEO Agent</p>
                      <p>输入品牌名查询注册表信息或 AI 可见性报告</p>
                      <p className="mt-2 text-xs">支持：品牌搜索 / LEI 验证状态 / 可见性快照 / 审计查询</p>
                    </div>
                  )}
                  {messages.map((m, i) => {
                    if (m.role === 'user') return (
                      <div key={i} className={S.userMsg}>
                        <div className={S.userBubble}>{m.content}</div>
                      </div>
                    );
                    if (m.role === 'tool') return (
                      <div key={i} className={S.botMsg}>
                        <div className="w-full">
                          <div className={S.toolCall}>
                            <span className="text-emerald-500 font-medium">{m.tool}</span>
                            <span className="text-zinc-500"> — 工具调用结果：</span>
                          </div>
                          {m.tool === 'brand_lookup' && m.data.map((b, j) => (
                            <div key={j} className={S.brandRow}>
                              <div className="flex items-center justify-between">
                                <span className={S.brandName}>{b.name}</span>
                                <span className={S.brandTag(b.has_lei)}>{b.has_lei ? 'LEI 已验证' : '未验证'}</span>
                              </div>
                              <div className="text-zinc-500 mt-1">
                                {[b.country, b.industry, b.website].filter(Boolean).join(' | ')}
                              </div>
                              {b.description && <div className="text-zinc-400 mt-1">{b.description.slice(0, 100)}</div>}
                            </div>
                          ))}
                          {m.tool === 'brand_visibility' && (
                            <div className={S.toolResult}>
                              <pre className="whitespace-pre-wrap">{JSON.stringify(m.data, null, 2).slice(0, 500)}</pre>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                    return (
                      <div key={i} className={S.botMsg}>
                        <div className={S.botBubble}>
                          <pre className="whitespace-pre-wrap font-[inherit]">{m.content}</pre>
                        </div>
                      </div>
                    );
                  })}
                  {busy && <div className={S.loading}><span className="animate-pulse">查询中</span></div>}
                  <div ref={endRef} />
                </div>
                <div className={S.inputBar}>
                  <div className={S.inputRow}>
                    <input
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && send()}
                      placeholder="输入品牌名，如：腾讯 / 蜜雪冰城 / Apple"
                      className={S.input}
                      disabled={busy}
                    />
                    <button onClick={send} disabled={busy || !input.trim()} className={S.sendBtn}>发送</button>
                  </div>
                </div>
              </>
            )}

            {view === 'audit' && (
              <div className="px-5 py-6">
                <h2 className="text-lg font-semibold text-white mb-2">审计链</h2>
                <p className="text-sm text-zinc-500 mb-4">
                  完整性: {audit ? <span className={audit.total > 0 ? 'text-emerald-500' : 'text-zinc-500'}>有效</span> : '—'}
                  {"　"}总记录: {audit?.total || 0}
                </p>
                <div className="border border-[#2a2a2a]">
                  {(audit?.recent || []).slice().reverse().map((e, i) => (
                    <div key={i} className={S.sideItem}>
                      <span className={S.sideTime}>{new Date(e.ts).toLocaleTimeString()}</span>
                      <span className={S.sideEvent(e.event)}>{e.event}</span>
                      <div className={S.sideDetail}>{JSON.stringify(e.detail).slice(0, 120)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'identity' && (
              <div className="px-5 py-6">
                <h2 className="text-lg font-semibold text-white mb-4">Agent 身份卡</h2>
                <div className={S.card}>
                  {identity && Object.entries(identity).map(([k, v]) => (
                    <div key={k} className={S.cardRow}>
                      <span className={S.cardLabel}>{k}</span>
                      <span className={S.cardVal}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className={S.sidebar}>
            <div className={S.sideTitle}>最近审计</div>
            {(audit?.recent || []).slice(-5).reverse().map((e, i) => (
              <div key={i} className={S.sideItem}>
                <span className={S.sideTime}>{new Date(e.ts).toLocaleTimeString()}</span>
                <span className={S.sideEvent(e.event)}>{e.event}</span>
              </div>
            ))}
            <div className={S.sideTitle} style={{ marginTop: '16px' }}>会话</div>
            <div className="text-xs text-zinc-600">{sessionId}</div>
          </aside>
        </div>
      </div>
    </>
  );
}
