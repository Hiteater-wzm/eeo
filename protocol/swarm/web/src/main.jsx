import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')).render(<App />);

const LEVEL_NAME = { 1: '员工', 2: '管理员', 3: '负责人' };

function App() {
  const [view, setView] = useState('dashboard');
  const [health, setHealth] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [work, setWork] = useState(null);
  const [subs, setSubs] = useState(null);
  const [audit, setAudit] = useState(null);
  const [newTask, setNewTask] = useState({ category: '查询', summary: '' });

  const load = useCallback(() => {
    fetch('/health').then(r => r.json()).then(setHealth).catch(() => setHealth(null));
    fetch('/api/swarm/identity').then(r => r.json()).then(setIdentity).catch(() => {});
    fetch('/api/swarm/work').then(r => r.json()).then(setWork).catch(() => {});
    fetch('/api/swarm/subordinates').then(r => r.json()).then(setSubs).catch(() => {});
    fetch('/api/swarm/audit?limit=15').then(r => r.json()).then(setAudit).catch(() => {});
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  const addTask = async () => {
    if (!newTask.summary.trim()) return;
    await fetch('/api/swarm/work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask),
    });
    setNewTask({ category: '查询', summary: '' });
    load();
  };

  const tab = (v, label) => (
    <button onClick={() => setView(v)} className={view === v ? 'font-semibold text-white underline underline-offset-8' : 'text-zinc-400 hover:text-white'}>{label}</button>
  );

  const card = (label, value, sub) => (
    <div className="border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-600">{sub}</div>}
    </div>
  );

  return (
    <>
      <style>{`*{border-radius:0!important;margin:0;padding:0;box-sizing:border-box}`}</style>
      <div style={{ fontFamily: 'system-ui,sans-serif' }} className="min-h-screen bg-[#0a0a0a] text-zinc-200">
        <header className="sticky top-0 z-40 border-b border-zinc-800 bg-[#0d0d0d]">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <div>
              <div className="text-[15px] font-semibold text-white">EEO Swarm</div>
              <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
                {identity?.agent_id || '...'} · {LEVEL_NAME[identity?.level || 1]}
              </div>
            </div>
            <nav className="flex items-center gap-5 text-sm">
              {tab('dashboard', '总览')}
              {tab('work', '工作记录')}
              {(identity?.level || 1) >= 2 && tab('team', '团队')}
              {tab('audit', '审计')}
              <span className={`text-xs ${health?.status === 'ok' ? 'text-emerald-500' : 'text-zinc-600'}`}>
                {health?.status === 'ok' ? '在线' : '离线'}
              </span>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-5 py-6">
          {view === 'dashboard' && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {card('任务总数', work?.total_tasks ?? '—')}
                {card('平均评分', work?.avg_score ?? '—', '满分 100')}
                {card('本机 Agent', identity?.local_agents?.filter(a => a.available).length ?? 0, (identity?.local_agents || []).map(a => a.name).join(' / '))}
                {card('在线时长', health ? `${Math.floor(health.uptime / 60)} 分钟` : '—')}
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {Object.entries(work?.by_category || {}).map(([cat, n]) => (
                  <span key={cat} className="border border-zinc-800 px-3 py-1 text-xs text-zinc-400">{cat} × {n}</span>
                ))}
              </div>
            </>
          )}

          {view === 'work' && (
            <>
              <div className="mb-4 flex gap-2">
                <select value={newTask.category} onChange={e => setNewTask({ ...newTask, category: e.target.value })}
                  className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none">
                  {['查询', '文档', '分析', '优化', '会议', '其他'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={newTask.summary} onChange={e => setNewTask({ ...newTask, summary: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && addTask()}
                  placeholder="记录工作内容..." className="flex-1 border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500" />
                <button onClick={addTask} disabled={!newTask.summary.trim()} className="text-sm font-semibold text-white underline underline-offset-4 disabled:opacity-30">提交</button>
              </div>
              <div className="border border-zinc-800">
                {(work?.tasks || []).slice().reverse().map((t, i) => (
                  <div key={i} className="flex items-start justify-between border-b border-zinc-800/50 px-4 py-2 text-sm last:border-b-0">
                    <div className="flex-1">
                      <span className="mr-2 text-xs text-zinc-500">{new Date(t.ts).toLocaleTimeString()}</span>
                      <span className="mr-2 text-xs text-emerald-500/70">{t.category}</span>
                      <span className="text-zinc-300">{t.summary}</span>
                    </div>
                    <span className={`ml-3 text-sm font-semibold ${t.score >= 70 ? 'text-emerald-500' : t.score >= 40 ? 'text-yellow-500' : 'text-zinc-500'}`}>{t.score}</span>
                  </div>
                ))}
                {(!work?.tasks || work.tasks.length === 0) && <div className="px-4 py-8 text-center text-sm text-zinc-600">暂无工作记录</div>}
              </div>
            </>
          )}

          {view === 'team' && (
            <>
              <h2 className="mb-4 text-lg font-semibold text-white">下级报告</h2>
              {subs?.count > 0 ? (
                <div className="space-y-3">
                  {subs.recent.map((r, i) => (
                    <div key={i} className="border border-zinc-800 bg-zinc-900/50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-white">{r.report.agent_name} ({r.report.agent_id})</span>
                        <span className="text-xs text-zinc-500">{new Date(r.received_at).toLocaleString()}</span>
                      </div>
                      <div className="flex gap-6 text-sm text-zinc-400">
                        <span>任务 {r.report.total_tasks}</span>
                        <span>评分 <span className={r.report.avg_score >= 70 ? 'text-emerald-500' : 'text-yellow-500'}>{r.report.avg_score}</span></span>
                        <span>{LEVEL_NAME[r.report.level]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">暂无下级报告。下级 Daemon 配置 SWARM_SUPERIOR 指向本机后自动上报。</p>
              )}
            </>
          )}

          {view === 'audit' && (
            <>
              <h2 className="mb-4 text-lg font-semibold text-white">审计链</h2>
              <div className="border border-zinc-800">
                {(audit?.recent || []).slice().reverse().map((e, i) => (
                  <div key={i} className="border-b border-zinc-800/50 px-4 py-2 text-xs last:border-b-0">
                    <span className="mr-2 text-zinc-600">{new Date(e.ts).toLocaleTimeString()}</span>
                    <span className={e.event.includes('error') ? 'text-red-400' : e.event.includes('tool') || e.event.includes('work') ? 'text-emerald-500' : 'text-zinc-300'}>{e.event}</span>
                    <span className="ml-2 text-zinc-600">{JSON.stringify(e.detail).slice(0, 80)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
