'use strict';
/* EEO Audit 快检 弹窗逻辑
 * 真环境: 弹窗只管 UI API 调用全部走 background
 * 演示环境(本地 http 打开无 chrome API): 用假数据走真渲染函数
 */
(function () {
  var HAS_EXT = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  var E = self.EEO;

  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  /* ============ 存取(插件环境 chrome.storage.local 演示环境 localStorage) ============ */
  function storeGet(key) {
    if (HAS_EXT) return chrome.storage.local.get(key);
    return Promise.resolve(JSON.parse(localStorage.getItem(key) || 'null'));
  }
  function storeSetObj(obj) {
    if (HAS_EXT) return chrome.storage.local.set(obj);
    Object.keys(obj).forEach(function (k) { localStorage.setItem(k, JSON.stringify(obj[k])); });
    return Promise.resolve();
  }
  function sendMsg(msg) {
    if (HAS_EXT) return chrome.runtime.sendMessage(msg);
    return Promise.resolve(null);
  }

  /* ============ 进度 ============ */
  var STAGE_TXT = { gen: '问题生成中', ask: '逐题提问中', analyze: '分析中', done: '完成' };
  function setStage(t) { $('stageTxt').textContent = t; }
  function renderBars(engines) {
    var html = '';
    engines.forEach(function (e) {
      html += '<div class="engbar"><span class="nm">' + esc(e.name) + '</span>'
        + '<div class="track"><div class="fill" id="fill_' + esc(e.id) + '" style="width:0"></div></div>'
        + '<span class="ct" id="txt_' + esc(e.id) + '">0/0</span></div>';
    });
    $('engBars').innerHTML = html;
  }
  function setProgress(eid, done, total) {
    var f = $('fill_' + eid), t = $('txt_' + eid);
    if (f) f.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    if (t) t.textContent = done + '/' + (total || 0);
  }
  function showProgress() { $('statusBox').classList.remove('hidden'); }
  function hideProgress() { $('statusBox').classList.add('hidden'); }
  function busy(on) { $('btnGo').disabled = on; }
  function showWarn(t) { $('warnBox').innerHTML = '<div class="warn">' + esc(t) + '</div>'; }
  function clearWarn() { $('warnBox').innerHTML = ''; }

  /* ============ 报告渲染(真渲染函数 演示与实测共用) ============ */
  function renderReport(rep) {
    var box = $('reportBox');
    var g = rep.score.grade;
    var gs = E.GRADE_STYLE[g.g] || { bg: '#fff', fg: '#000' };
    var dep = E.DEPTHS[rep.job.depth] || { label: '快速 12 题' };
    var ids = Object.keys(rep.results);
    var html = '<div class="card">'
      + '<div class="hint" style="margin:0">' + esc(rep.job.brand) + ' ' + esc(rep.job.at) + ' ' + esc(dep.label) + ' ' + ids.length + ' 家引擎</div>'
      + '<div class="gradebox" style="margin-top:8px">'
      + '<div class="gbadge" style="background:' + gs.bg + ';color:' + gs.fg + '"><div class="g">' + esc(g.g) + '</div><div class="t">' + esc(g.t) + '</div></div>'
      + '<div class="scores">';
    [['综合评分', rep.score.overall], ['品牌认知率', rep.score.awareRate], ['品类提及率', rep.score.mentionRate]].forEach(function (p) {
      html += '<div class="scorebar"><span class="nm">' + p[0] + '</span><div class="tr"><div class="fl" style="width:' + Math.min(100, p[1]) + '%"></div></div><span class="vl">' + p[1] + ' 分</span></div>';
    });
    html += '</div></div>';
    html += '<table><tr><th>引擎</th><th>品牌认知</th><th>品类提及</th></tr>';
    ids.forEach(function (eid) {
      var s = rep.results[eid];
      html += '<tr><td><b>' + esc(s.name) + '</b></td><td>' + s.aware + '/' + s.awareTotal + '</td><td>' + s.mention + ' 次</td></tr>';
    });
    html += '</table>';
    (rep.quotes || []).slice(0, 2).forEach(function (q) {
      html += '<div class="quote">' + esc(q.snippet) + '<span class="src">—— ' + esc(q.engine) + ' ' + esc(q.q) + '</span></div>';
    });
    html += '</div>';
    box.innerHTML = html;
  }

  /* ============ 历史 ============ */
  function renderHistory(list) {
    var el = $('histList');
    if (!list || !list.length) { el.innerHTML = '<div class="hint">暂无记录</div>'; return; }
    var html = '';
    list.forEach(function (h, i) {
      var g = (h.score && h.score.grade) || { g: '-' };
      var gs = E.GRADE_STYLE[g.g] || { bg: '#fff', fg: '#000' };
      html += '<div class="hist-item" data-i="' + i + '">'
        + '<span class="hist-chip" style="background:' + gs.bg + ';color:' + gs.fg + '">' + esc(g.g) + '</span>'
        + '<span class="hist-brand">' + esc(h.brand) + '</span>'
        + '<span class="hist-meta"><b>' + (h.score ? h.score.overall : 0) + ' 分</b>' + esc((h.at || '').replace(/^\d{4}\/|^\d{4}-/, '')) + '</span>'
        + '</div>';
    });
    el.innerHTML = html;
    Array.prototype.forEach.call(el.querySelectorAll('.hist-item'), function (it) {
      it.addEventListener('click', function () {
        var h = list[Number(it.getAttribute('data-i'))];
        if (h && h.report) renderReport(h.report);
      });
    });
  }
  function loadHistory() {
    return storeGet('eeo_history').then(function (st) {
      var h = (st && st.eeo_history) || [];
      renderHistory(h);
      return h;
    });
  }

  /* ============ 设置 ============ */
  function loadKeys() {
    return storeGet('eeo_keys').then(function (st) {
      var k = (st && st.eeo_keys) || { deepseek: '', zhipu: '' };
      $('keyDs').value = k.deepseek || '';
      $('keyGlm').value = k.zhipu || '';
      return k;
    });
  }
  function saveKeys(silent) {
    return storeSetObj({ eeo_keys: { deepseek: $('keyDs').value.trim(), zhipu: $('keyGlm').value.trim() } })
      .then(function () { if (!silent) showWarn('设置已保存 密钥只存本机'); });
  }

  /* ============ 发起检测(插件环境) ============ */
  function goRun(siteDomain) {
    var brand = $('inBrand').value.trim();
    if (brand.length < 2) { showWarn('品牌名至少两个字'); return; }
    clearWarn();
    return saveKeys(true).then(function () {
      return sendMsg({ type: 'eeoRun', brand: brand, industry: $('inIndustry').value, city: '', competitors: [], domain: siteDomain || '' });
    }).then(function (r) {
      if (!r) return;
      if (!r.ok) { showWarn(r.error || '发起失败'); return; }
      $('reportBox').innerHTML = '';
      renderBars(r.engines || []);
      setStage(STAGE_TXT.gen);
      showProgress();
      busy(true);
    });
  }

  /* ============ 消息(插件环境) ============ */
  var barsEngines = [];
  function ensureBars(engines) {
    if (!engines || !engines.length) return;
    if (!barsEngines.length || barsEngines.length !== engines.length) {
      barsEngines = engines;
      renderBars(engines);
    }
  }
  function onExtMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'eeoProgress') {
      showProgress();
      busy(true);
      ensureBars(msg.engines);
      setStage(STAGE_TXT[msg.stage] || msg.stage || '');
      if (msg.engineId) setProgress(msg.engineId, msg.done, msg.total);
    } else if (msg.type === 'eeoDone') {
      hideProgress();
      busy(false);
      renderReport(msg.report);
      loadHistory();
    } else if (msg.type === 'eeoError') {
      hideProgress();
      busy(false);
      showWarn('检测中断 ' + (msg.error || ''));
    }
  }

  /* ============ 假数据(演示与验证共用 走真 analyze 与真渲染) ============ */
  var FILLER = '课程体系覆盖图形化启蒙 Python 与 C++ 竞赛方向 小班授课 线上线下结合 学员按水平分层入学 累计学员数量在同城里排在前列 家长口碑中常被提到的优势是课后督导细致 竞赛出成绩稳定 收费属于中上水平 分校区覆盖多个城区 支持先试听再报名';
  function fakeAnswerHit(brand) { return brand + ' 是少儿编程培训行业里比较知名的连锁机构 ' + FILLER + ' 建议先预约试听课再决定'; }
  function fakeAnswerMiss() { return '抱歉 关于这个品牌 我没有查到可靠的信息 也缺乏相关的公开资料 建议直接咨询当地门店核实'; }
  function fakeAnswerCat(withBrand, brand, comps) {
    var names = comps.join(' ') + (withBrand ? ' 以及地方性的 ' + brand : '');
    return '这类选择可以从几个维度看 课程体系 师资 配套服务与价格 目前常见的有 ' + names + ' 建议先试听对比再决定 不同城市的门店水平也有差异';
  }
  function fakeReport(awareDs, awareGlm, menDs, menGlm) {
    var job = { brand: '星火少儿编程', city: '成都', industry: '少儿编程培训', competitors: ['编程猫', '核桃编程'], depth: 'quick', at: new Date().toLocaleString('zh-CN') };
    var qs = E.fallbackQuestions(job);
    var brands = 0, cats = 0;
    qs.forEach(function (q) {
      q.answers = {};
      if (q.cat === '品牌') {
        brands++;
        q.answers.ds = brands <= awareDs ? fakeAnswerHit(job.brand) : fakeAnswerMiss();
        q.answers.glm = brands <= awareGlm ? fakeAnswerHit(job.brand) : fakeAnswerMiss();
      } else {
        cats++;
        q.answers.ds = fakeAnswerCat(cats <= menDs, job.brand, job.competitors);
        q.answers.glm = fakeAnswerCat(cats <= menGlm, job.brand, job.competitors);
      }
    });
    var results = {
      ds: { name: 'DeepSeek', aware: 0, awareTotal: 0, mention: 0, mentionTotal: 0, comp: {} },
      glm: { name: '智谱 GLM', aware: 0, awareTotal: 0, mention: 0, mentionTotal: 0, comp: {} },
    };
    return E.analyze(job, results, qs);
  }
  function demoRun() {
    $('reportBox').innerHTML = '';
    clearWarn();
    var engines = E.ENGINES;
    renderBars(engines);
    setStage(STAGE_TXT.gen);
    showProgress();
    busy(true);
    setTimeout(function () {
      setStage(STAGE_TXT.ask);
      var n = 0, total = E.DEPTHS.quick.total;
      var timer = setInterval(function () {
        n++;
        setProgress('ds', Math.min(n, total), total);
        setProgress('glm', Math.min(Math.max(1, n - 1), total), total);
        if (n >= total + 1) {
          clearInterval(timer);
          setStage(STAGE_TXT.analyze);
          setTimeout(function () {
            hideProgress();
            busy(false);
            renderReport(fakeReport(3, 2, 3, 1));
          }, 300);
        }
      }, 70);
    }, 400);
  }

  /* ============ 初始化 ============ */
  var curDomain = '';
  function fillSite(info) {
    curDomain = info.domain || '';
    $('siteDomain').textContent = info.domain || '未识别';
    $('siteSrc').textContent = info.source || '页面标题';
    if (info.brand) $('inBrand').value = info.brand;
  }
  function init() {
    /* 行业下拉 */
    var sel = $('inIndustry');
    E.INDUSTRIES.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s; o.textContent = s;
      sel.appendChild(o);
    });

    $('btnSet').addEventListener('click', function () { $('setCard').classList.toggle('hidden'); });
    $('btnSave').addEventListener('click', function () { saveKeys(false); });
    $('lnkFull').addEventListener('click', function () {
      if (HAS_EXT) chrome.tabs.create({ url: chrome.runtime.getURL('full/eeo-local.html') });
      else location.href = '../full/eeo-local.html';
    });

    if (HAS_EXT) {
      chrome.runtime.onMessage.addListener(onExtMessage);
      sendMsg({ type: 'eeoSiteInfo' }).then(function (r) {
        if (r && r.ok) fillSite(r);
        else { $('siteDomain').textContent = '此页不可读 可手填品牌名'; }
        return loadHistory();
      }).then(function (h) {
        if (h.length && curDomain && h[0].domain === curDomain && h[0].report) renderReport(h[0].report);
      });
      loadKeys();
      /* 重开弹窗时接管后台正在跑的检测 */
      sendMsg({ type: 'eeoState' }).then(function (st) {
        if (!st) return;
        if (st.running) {
          barsEngines = st.engines || [];
          renderBars(barsEngines);
          setStage(STAGE_TXT[st.stage] || st.stage || '');
          Object.keys(st.bars || {}).forEach(function (eid) { setProgress(eid, st.bars[eid], st.total); });
          showProgress();
          busy(true);
        } else if (st.report) {
          renderReport(st.report);
        }
      });
      $('btnGo').addEventListener('click', function () { goRun(curDomain); });
    } else {
      /* 演示环境 本地 http 打开 走假数据真渲染 */
      fillSite({ domain: 'xingspark.cn', brand: '星火少儿编程', source: 'og:site_name' });
      loadKeys();
      loadHistory().then(function (h) {
        if (!h.length) {
          var d1 = fakeReport(3, 2, 3, 1);
          var d2 = fakeReport(0, 0, 1, 0);
          d2.job.brand = '小城画室'; d2.job.at = '2026/10/5 10:12:00'; d2.job.domain = 'xcstudio.cn';
          var list = [
            { brand: '星火少儿编程', domain: 'xingspark.cn', at: '2026/10/5 12:40:00', depth: 'quick', score: d1.score, report: d1 },
            { brand: '小城画室', domain: 'xcstudio.cn', at: '2026/10/5 10:12:00', depth: 'quick', score: d2.score, report: d2 },
          ];
          renderHistory(list);
        }
      });
      $('btnGo').addEventListener('click', demoRun);
    }
  }
  document.addEventListener('DOMContentLoaded', init);

  /* 验证钩子 供自动化测试调用 不参与运行 */
  self.__popupAPI = {
    renderReport: renderReport, renderBars: renderBars, setProgress: setProgress,
    setStage: setStage, fakeReport: fakeReport, showProgress: showProgress,
  };
})();
