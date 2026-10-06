'use strict';
/* EEO Audit 快检 后台服务
 * 职责: 引擎 API 调用(绕过 popup 的 CORS 限制) 检测状态托管 最近 10 次历史
 * 密钥只存 chrome.storage.local 不外传
 */
importScripts(chrome.runtime.getURL('lib/eeo-core.js'));

var EEO = self.EEO;
var HISTORY_KEY = 'eeo_history';
var KEYS_KEY = 'eeo_keys';
var HISTORY_MAX = 10;

/* 运行状态 弹窗重开时凭 eeoState 接管现场 */
var state = {
  running: false,
  job: null,
  stage: '',          /* gen | ask | analyze */
  engines: [],        /* [{id,name}] */
  bars: {},           /* engineId -> done */
  total: 0,
  report: null,
  error: null,
};

/* content script 推来的 og:site_name 按 tab 缓存 */
var siteNameCache = {};

function broadcast(payload) {
  try {
    var p = chrome.runtime.sendMessage(payload);
    if (p && p.catch) p.catch(function () { });
  } catch (e) { /* 弹窗不在 无接收方 属正常 */ }
}

/* ============ 站点信息 ============ */
function tabAsk(tabId) {
  return new Promise(function (res) {
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; res(null); } }, 500);
    try {
      chrome.tabs.sendMessage(tabId, { type: 'eeoGetSiteInfo' }, function (r) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        res(chrome.runtime.lastError ? null : r);
      });
    } catch (e) {
      if (!done) { done = true; clearTimeout(timer); res(null); }
    }
  });
}

function getSiteInfo() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab) return { ok: false };
    var url = tab.url || '';
    var host = '';
    try { host = new URL(url).hostname; } catch (e) { }
    return tabAsk(tab.id).then(function (r) {
      var siteName = ((r && r.siteName) || siteNameCache[tab.id] || '').trim();
      var title = (r && r.title) || tab.title || '';
      var brand = '', source = '';
      if (siteName.length >= 2 && siteName.length <= 30) { brand = siteName; source = 'og:site_name'; }
      if (!brand) { brand = EEO.brandFromTitle(title); if (brand) source = '页面标题'; }
      if (!brand) { brand = EEO.brandFromDomain(host); if (brand) source = '域名'; }
      return { ok: true, url: url, domain: host, brand: brand, source: source || '页面标题', title: String(title).slice(0, 80) };
    });
  }).catch(function () { return { ok: false }; });
}

/* ============ 检测主流程 ============ */
function startRun(msg) {
  return new Promise(function (resolve) {
    if (state.running) return resolve({ ok: false, error: '已有检测在进行 稍后再试' });
    chrome.storage.local.get(KEYS_KEY).then(function (st) {
      var keys = (st && st[KEYS_KEY]) || {};
      var cfgs = EEO.ENGINES.filter(function (e) { return keys[e.platform]; }).map(function (e) {
        return Object.assign({}, e, { apiKey: keys[e.platform] });
      });
      if (!cfgs.length) return resolve({ ok: false, error: '请先在设置里填入 DeepSeek 或智谱密钥' });

      var job = {
        brand: msg.brand,
        city: msg.city || '',
        industry: msg.industry,
        competitors: msg.competitors || [],
        depth: 'quick',
        at: new Date().toLocaleString('zh-CN'),
        domain: msg.domain || '',
      };
      state.running = true;
      state.job = job;
      state.stage = 'gen';
      state.report = null;
      state.error = null;
      state.total = EEO.DEPTHS.quick.total;
      state.bars = {};
      state.engines = cfgs.map(function (c) { return { id: c.id, name: c.name }; });
      cfgs.forEach(function (c) { state.bars[c.id] = 0; });

      resolve({ ok: true, engines: state.engines, total: state.total });
      broadcast({ type: 'eeoProgress', stage: 'gen', engines: state.engines, total: state.total });

      EEO.runDetection(job, cfgs, function (ev) {
        if (ev.stage) {
          state.stage = ev.stage;
          broadcast({ type: 'eeoProgress', stage: ev.stage, engines: state.engines, total: ev.total || state.total });
        } else {
          state.bars[ev.engineId] = ev.done;
          broadcast({ type: 'eeoProgress', stage: 'ask', engineId: ev.engineId, done: ev.done, total: ev.total, engines: state.engines });
        }
      }).then(function (rep) {
        state.running = false;
        state.stage = 'done';
        state.report = rep;
        broadcast({ type: 'eeoDone', report: rep });
        return saveHistory(job, rep);
      }).catch(function (err) {
        state.running = false;
        state.error = (err && err.message) ? err.message : String(err);
        broadcast({ type: 'eeoError', error: state.error });
      });
    }).catch(function (err) { resolve({ ok: false, error: (err && err.message) || '读取密钥失败' }); });
  });
}

function saveHistory(job, rep) {
  return chrome.storage.local.get(HISTORY_KEY).then(function (st) {
    var h = (st && st[HISTORY_KEY]) || [];
    h.unshift({ brand: job.brand, domain: job.domain, at: job.at, depth: job.depth, score: rep.score, report: rep });
    h = h.slice(0, HISTORY_MAX);
    var obj = {};
    obj[HISTORY_KEY] = h;
    return chrome.storage.local.set(obj);
  });
}

/* ============ 消息入口 ============ */
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case 'eeoSiteName':
      /* content script 主动上报 og:site_name */
      if (sender.tab && sender.tab.id != null && msg.siteName) {
        siteNameCache[sender.tab.id] = String(msg.siteName).slice(0, 60);
      }
      return;
    case 'eeoSiteInfo':
      getSiteInfo().then(sendResponse);
      return true;
    case 'eeoRun':
      startRun(msg).then(sendResponse);
      return true;
    case 'eeoState':
      sendResponse({
        running: state.running,
        stage: state.stage,
        engines: state.engines,
        bars: state.bars,
        total: state.total,
        job: state.job,
        report: state.report,
        error: state.error,
      });
      return;
  }
});
