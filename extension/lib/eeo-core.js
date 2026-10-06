'use strict';
/* ============================================================
 * EEO Audit 核心检测逻辑（共享模块）
 * 从 eeo-local.html 提取 保持算法同源:
 *   coreWord / countHits / NOINFO_RE / AMBIG_RE / gradeOf /
 *   askEngine(ask) / pool / genQuestions / fallbackQuestions /
 *   analyze / extractSources
 * 评级配色对齐 tools/gen-site.cjs GRADE_STYLE
 * 本文件不依赖 DOM 不依赖 chrome API
 * 引入方式: 页面 <script src> 或 worker importScripts
 * ============================================================ */
(function () {
  /* ============ 插件内置引擎（eeo-local.html CATALOG 中 def:true 两条） ============ */
  var ENGINES = [
    { id: 'ds', platform: 'deepseek', name: 'DeepSeek', url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', maxTokens: 2048, timeout: 90000 },
    { id: 'glm', platform: 'zhipu', name: '智谱 GLM', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-5.3-flash', maxTokens: 8192, timeout: 300000, note: '较慢' },
  ];

  var DEPTHS = { quick: { brand: 4, cat: 6, scene: 2, total: 12, label: '快速 12 题' }, standard: { brand: 8, cat: 16, scene: 6, total: 30, label: '标准 30 题' }, deep: { brand: 12, cat: 28, scene: 8, total: 48, label: '深度 48 题' } };

  var INDUSTRIES = ['少儿编程培训', 'K12 教育培训', '职业教育', '留学咨询', '家政服务', '装修建材', '餐饮门店', '法律咨询', '口腔医疗', '汽车服务', '摄影婚庆', '健身私教', '软件与互联网服务', '电商品牌', '其他'];

  /* 评级配色与短语 对齐 gen-site.cjs GRADE_STYLE 与 core.cjs gradeOf */
  var GRADE_STYLE = {
    S: { bg: '#FFDE59', fg: '#000000' },
    A: { bg: '#00C853', fg: '#000000' },
    B: { bg: '#000000', fg: '#FFFFFF' },
    C: { bg: '#FF8A00', fg: '#000000' },
    D: { bg: '#FF4D4D', fg: '#FFFFFF' },
  };

  /* ============ 名称匹配与判定（与 eeo-local.html 同源） ============ */
  var SUFFIX_RE = /(工坊|工作室|科技|教育|信息技术|有限公司|网络|学院|平台|中心|机构|学堂|编程|ai|AI)$/g;
  function coreWord(brand) {
    var b = brand.trim();
    if (b.length < 4) return [b];
    var w = b, changed = true;
    while (changed && w.length >= 3) {
      changed = false;
      var m = w.match(SUFFIX_RE);
      if (m && w.length - m[0].length >= 2) { w = w.slice(0, w.length - m[0].length); changed = true; }
    }
    return (w !== b && w.length >= 2) ? [b, w] : [b];
  }
  function countHits(text, pats) {
    var n = 0;
    pats.forEach(function (p) { var i = text.indexOf(p); while (i !== -1) { n++; i = text.indexOf(p, i + 1); } });
    return n;
  }
  var NOINFO_RE = /(没有|无法|暂未|未能|不在我|没听说过|缺乏|查不到|查不到任何|没有查到)[^。！？]{0,100}(信息|资料|了解|掌握|记录|听说过|数据|机构|品牌|公司)|并不是一个广为人知|无法确认其|没有可靠信息|没有听说过该|并未听说过/;
  var AMBIG_RE = /不同语境|含义差别很大|如果(你说的?|指的是)|可能指(代|的是)?|指的是哪个|哪个方面|具体指什么|能具体说说|请(你)?补充|告诉我(更多|具体|是什么)|需要更多信息|上下文|几种(可能|情况)|缩写(有点)?模糊|有时候并不是|并不(一定)?是品牌|可能是以下几种|先列几个最常见的|无法确定(它|你|该)|需要你提供/;
  function gradeOf(x) {
    if (x >= 0.8) return { g: 'S', t: 'AI 眼中的默认选项' };
    if (x >= 0.6) return { g: 'A', t: '认知稳固 推荐在列' };
    if (x >= 0.4) return { g: 'B', t: '有认知 推荐缺席' };
    if (x >= 0.15) return { g: 'C', t: '边缘存在' };
    return { g: 'D', t: 'AI 视野之外' };
  }

  /* ============ 模型调用（ask 的无 DOM 版 cfg 携带密钥） ============ */
  function askEngine(cfg, question, maxTokens) {
    var isAnthropic = cfg.apiType === 'anthropic';
    var body, headers;
    if (isAnthropic) {
      body = JSON.stringify({ model: cfg.model, max_tokens: maxTokens || cfg.maxTokens, messages: [{ role: 'user', content: question }] });
      headers = { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    } else {
      body = JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: question }], max_tokens: maxTokens || cfg.maxTokens, temperature: 0.7, stream: false });
      headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey };
    }
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, cfg.timeout || 120000);
    return fetch(cfg.url, { method: 'POST', headers: headers, body: body, signal: ctrl.signal })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 80)); });
        return r.json();
      })
      .then(function (d) {
        clearTimeout(timer);
        var txt = isAnthropic
          ? (d.content && d.content[0] && d.content[0].text)
          : (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content);
        if (!txt) throw new Error('空回复');
        return txt;
      })
      .catch(function (err) { clearTimeout(timer); throw err; });
  }

  /* ============ 并发池（同源） ============ */
  function pool(items, limit, worker) {
    return new Promise(function (resolve) {
      var idx = 0, alive = 0, done = 0;
      var total = items.length;
      if (!total) return resolve();
      function next() {
        if (done >= total) return resolve();
        while (alive < limit && idx < total) {
          var my = idx++; alive++;
          worker(items[my], my).catch(function () { }).then(function () { alive--; done++; next(); });
        }
      }
      next();
    });
  }

  /* ============ 题库（提示词与 eeo-local.html 完全一致） ============ */
  function genQuestions(job, dsCfg) {
    var dep = DEPTHS[job.depth];
    var usr = '为品牌「' + job.brand + '」（行业：' + job.industry + (job.city ? '，所在城市 ' + job.city : '') + '）生成 ' + dep.total + ' 个中文提问，模拟真实买家向 AI 助手咨询时的问法。要求：\n'
      + '1. cat="品牌" 共 ' + dep.brand + ' 题：直接问 ' + job.brand + ' 的情况\n'
      + '2. cat="品类" 共 ' + dep.cat + ' 题：买家不带品牌名的比较与选择问题\n'
      + '3. cat="场景" 共 ' + dep.scene + ' 题：结合具体情境' + (job.city ? '（含 ' + job.city + ' 本地问法）' : '') + '的问法\n'
      + (job.competitors.length ? '个别品类题可自然提到：' + job.competitors.join('、') + '\n' : '')
      + '只输出 JSON 数组：[{"cat":"品牌","q":"..."}]';
    return askEngine(dsCfg, usr, 4000).then(function (txt) {
      var m = txt.match(/\[[\s\S]*\]/);
      var qs = JSON.parse(m[0]);
      if (Array.isArray(qs) && qs.length >= Math.min(10, dep.total)) {
        return qs.slice(0, dep.total).map(function (x, i) { return { id: i + 1, cat: ['品牌', '品类', '场景'].indexOf(x.cat) !== -1 ? x.cat : '品类', q: String(x.q).slice(0, 80) }; });
      }
      throw new Error('题库格式异常');
    });
  }
  function fallbackQuestions(job) {
    var dep = DEPTHS[job.depth];
    var comp = job.competitors[0] || '同类机构';
    var out = [
      { id: 1, cat: '品牌', q: job.brand + '是什么？' },
      { id: 2, cat: '品牌', q: job.brand + '靠谱吗？' },
      { id: 3, cat: '品牌', q: job.brand + '怎么收费？' },
      { id: 4, cat: '品牌', q: job.brand + '和' + comp + '比哪个好？' },
      { id: 5, cat: '品类', q: job.industry + '有哪些值得推荐的机构？' },
      { id: 6, cat: '品类', q: '想选' + job.industry + '的服务怎么挑比较好？' },
      { id: 7, cat: '品类', q: job.industry + '哪家性价比高？' },
      { id: 8, cat: '品类', q: job.industry + '的头部品牌都有哪些？' },
      { id: 9, cat: '品类', q: '第一次接触' + job.industry + '从哪里入手？' },
      { id: 10, cat: '品类', q: job.industry + '线上和线下怎么选？' },
      { id: 11, cat: '场景', q: job.city ? job.city + '有哪些' + job.industry + '？' : '本地找' + job.industry + '有什么靠谱选择？' },
      { id: 12, cat: '场景', q: job.city ? job.city + '选' + job.industry + '要注意什么？' : '新手尝试' + job.industry + '要注意什么？' },
    ];
    var catQs = [job.industry + '的价格一般是多少？', '怎么判断' + job.industry + '哪家专业？', job.industry + '有哪些坑要注意？', '选' + job.industry + '最看重什么？', job.industry + '怎么规划预算？', job.industry + '适合什么人？', job.industry + '一般怎么收费？', '选择' + job.industry + '时常犯什么错？', job.industry + '的口碑怎么看？', '怎么对比不同' + job.industry + '？'];
    for (var i = out.length; i < 4 + dep.cat; i++) out.push({ id: i + 1, cat: '品类', q: catQs[(i - 4) % catQs.length] });
    var scQs = ['第一次购买' + job.industry + '服务的人有什么建议？', '预算有限时怎么选' + job.industry + '？', '怎么判断' + job.industry + '的真实水平？'];
    for (var j = out.length; j < 4 + dep.cat + dep.scene; j++) out.push({ id: j + 1, cat: '场景', q: scQs[(j - 4 - dep.cat) % scQs.length] });
    return out.slice(0, dep.total);
  }

  /* ============ 引用来源分析（与 eeo-local.html / core.cjs 同源） ============ */
  var URL_RE = /https?:\/\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#\[\]]+/g;
  var PLATFORMS = [
    { name: '微信公众号', domains: ['mp.weixin.qq.com'], words: ['微信公众号', '公众号'] },
    { name: '腾讯新闻', domains: ['news.qq.com'], words: ['腾讯新闻'] },
    { name: '知乎', domains: ['zhihu.com'], words: ['知乎'] },
    { name: 'CSDN', domains: ['csdn.net'], words: ['CSDN'] },
    { name: '维基百科', domains: ['wikipedia.org'], words: ['维基百科'] },
    { name: 'GitHub', domains: ['github.com'], words: ['GitHub'] },
    { name: '百度百科', domains: ['baike.baidu.com'], words: ['百度百科'] },
    { name: '微博', domains: ['weibo.com'], words: ['微博'] },
    { name: 'B站', domains: ['bilibili.com', 'b23.tv'], words: ['B站', '哔哩哔哩', 'bilibili'] },
    { name: '36氪', domains: ['36kr.com'], words: ['36氪', '36kr'] },
    { name: '搜狐', domains: ['sohu.com'], words: ['搜狐'] },
    { name: '网易', domains: ['163.com'], words: ['网易'] },
    { name: '新浪', domains: ['sina.com', 'sina.com.cn'], words: ['新浪'] },
  ];
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function platformOfHost(host) {
    if (!host) return null;
    for (var i = 0; i < PLATFORMS.length; i++) {
      var p = PLATFORMS[i];
      for (var j = 0; j < p.domains.length; j++) {
        var d = p.domains[j];
        if (host === d || host.slice(-(d.length + 1)) === '.' + d) return p.name;
      }
    }
    return null;
  }
  function rootDomain(host) {
    var h = host.replace(/^www\./i, '');
    var m2 = h.match(/([^.]+\.(?:com|net|org|gov|edu|ac)\.(?:cn|hk|tw|jp|uk))$/i);
    if (m2) return m2[1];
    var m = h.match(/([^.]+\.[^.]+)$/);
    return m ? m[1] : h;
  }
  function trimUrl(raw) {
    var s = raw.replace(/[.,;:!?'"，。；：！？、）》」』】\]]+$/, '');
    var bal = 0;
    for (var i = 0; i < s.length; i++) { if (s[i] === '(') bal++; else if (s[i] === ')') bal--; }
    while (bal < 0 && s.charAt(s.length - 1) === ')') { s = s.slice(0, -1); bal++; }
    return s;
  }
  function hostOf(u) {
    var m = u.match(/^https?:\/\/([^/?#]+)/i);
    if (!m) return null;
    return m[1].split('@').pop().split(':')[0].toLowerCase();
  }
  function countPlatformWords(lowText, words) {
    var alts = words.map(function (w) { return escRe(w.toLowerCase()); }).sort(function (a, b) { return b.length - a.length; }).join('|');
    var m = lowText.match(new RegExp(alts, 'g'));
    return m ? m.length : 0;
  }
  function extractSources(qs, competitors) {
    var urlCounts = {}, domainCounts = {}, platformCounts = {}, byQuestion = {};
    qs.forEach(function (q) {
      var perQ = [];
      var addSrc = function (s) { if (perQ.indexOf(s) === -1) perQ.push(s); };
      var answers = q.answers ? Object.keys(q.answers).map(function (k) { return q.answers[k]; }) : [];
      answers.forEach(function (a) {
        if (!a) return;
        var text = String(a);
        var urls = (text.match(URL_RE) || []).map(trimUrl).filter(function (u) { return /^https?:\/\//i.test(u); });
        urls.forEach(function (u) {
          urlCounts[u] = (urlCounts[u] || 0) + 1;
          var host = hostOf(u);
          if (host) {
            var rd = rootDomain(host);
            if (rd) domainCounts[rd] = (domainCounts[rd] || 0) + 1;
            var pn = platformOfHost(host);
            if (pn) { platformCounts[pn] = (platformCounts[pn] || 0) + 1; addSrc(pn); }
          }
          addSrc(u);
        });
        var bare = text.replace(URL_RE, ' ').toLowerCase();
        PLATFORMS.forEach(function (p) {
          var n = countPlatformWords(bare, p.words);
          if (n) { platformCounts[p.name] = (platformCounts[p.name] || 0) + n; addSrc(p.name); }
        });
      });
      byQuestion[q.id] = perQ;
    });
    var topUrls = Object.keys(urlCounts).map(function (u) { return { url: u, count: urlCounts[u] }; })
      .sort(function (a, b) { return b.count - a.count || (a.url < b.url ? -1 : 1); });
    var topDomains = Object.keys(domainCounts).map(function (d) { return { domain: d, count: domainCounts[d] }; })
      .sort(function (a, b) { return b.count - a.count || (a.domain < b.domain ? -1 : 1); });
    var competitorContext = (competitors || []).map(function (c) {
      var pats = coreWord(c);
      var seen = [];
      var mentioned = 0;
      qs.forEach(function (q) {
        var answers = q.answers ? Object.keys(q.answers).map(function (k) { return q.answers[k]; }) : [];
        var hit = answers.some(function (a) { return a && pats.some(function (p) { return String(a).indexOf(p) !== -1; }); });
        if (hit) { mentioned++; (byQuestion[q.id] || []).forEach(function (s) { if (seen.indexOf(s) === -1) seen.push(s); }); }
      });
      return { competitor: c, mentioned: mentioned, sources: seen };
    });
    return {
      totalUrls: topUrls.reduce(function (a, x) { return a + x.count; }, 0),
      topUrls: topUrls, topDomains: topDomains,
      byPlatform: platformCounts, byQuestion: byQuestion, competitorContext: competitorContext,
    };
  }

  /* ============ 分析主函数（与 eeo-local.html analyze 同源） ============ */
  function analyze(job, results, qs) {
    var pats = coreWord(job.brand);
    var compPats = {};
    job.competitors.forEach(function (c) { compPats[c] = coreWord(c); });
    var quotes = [];
    Object.keys(results).forEach(function (eid) {
      var s = results[eid];
      qs.forEach(function (q) {
        var a = q.answers[eid] || '';
        if (!a) return;
        if (q.cat === '品牌') {
          s.awareTotal++;
          var noinfo = NOINFO_RE.test(a), ambig = AMBIG_RE.test(a);
          var hit = pats.some(function (p) { return a.indexOf(p) !== -1; });
          if (hit && !noinfo && !ambig && a.length > 150) s.aware++;
          else if (noinfo && quotes.length < 6) quotes.push({ engine: s.name, q: q.q, snippet: a.replace(/\s+/g, ' ').slice(0, 90) + '……' });
        } else {
          s.mentionTotal++;
          s.mention += countHits(a, pats);
          job.competitors.forEach(function (c) {
            var n = countHits(a, compPats[c]);
            if (n) s.comp[c] = (s.comp[c] || 0) + n;
          });
        }
      });
    });
    var ids = Object.keys(results);
    var avgAware = ids.length ? ids.reduce(function (a, k) { return a + (results[k].awareTotal ? results[k].aware / results[k].awareTotal : 0); }, 0) / ids.length : 0;
    var totalMention = ids.reduce(function (a, k) { return a + results[k].mention; }, 0);
    var mentionCap = ids.reduce(function (a, k) { return a + results[k].mentionTotal; }, 0) || 1;
    var mentionRate = Math.min(1, totalMention / (mentionCap * 0.3));
    var overall = avgAware * 0.5 + mentionRate * 0.5;
    var labels = {};
    qs.forEach(function (q) {
      labels[q.id] = {};
      ids.forEach(function (eid) {
        var a = q.answers[eid] || '';
        if (!a) { labels[q.id][eid] = '未答'; return; }
        var noinfo = NOINFO_RE.test(a), ambig = AMBIG_RE.test(a);
        var hit = pats.some(function (p) { return a.indexOf(p) !== -1; });
        if (q.cat === '品牌') labels[q.id][eid] = (hit && !noinfo && !ambig) ? '有实料' : '无实料';
        else labels[q.id][eid] = hit ? '提及' : '未提及';
      });
    });
    return { job: job, results: results, questions: qs, quotes: quotes, labels: labels, sources: extractSources(qs, job.competitors), score: { overall: Math.round(overall * 100), awareRate: Math.round(avgAware * 100), mentionRate: Math.round(mentionRate * 100), grade: gradeOf(overall) } };
  }

  /* ============ 检测编排（popup 只管 UI 全流程在这里） ============ */
  /* engineCfgs: [{id, name, url, model, apiKey, maxTokens, timeout, apiType?}]
     onEvent: {stage:'gen'|'ask'|'analyze'|'done'} 或 {engineId, done, total} */
  function runDetection(job, engineCfgs, onEvent) {
    onEvent = onEvent || function () { };
    var dsE = engineCfgs.filter(function (e) { return e.id === 'ds'; })[0] || engineCfgs[0];
    onEvent({ stage: 'gen' });
    return genQuestions(job, dsE)
      .catch(function () { return fallbackQuestions(job); })
      .then(function (qs) {
        job.questions = qs;
        onEvent({ stage: 'ask', total: qs.length });
        var tasks = [];
        var counters = {};
        engineCfgs.forEach(function (e) { counters[e.id] = 0; });
        engineCfgs.forEach(function (e) {
          qs.forEach(function (q) { tasks.push({ e: e, q: q }); });
        });
        return pool(tasks, 4, function (t) {
          return askEngine(t.e, t.q.q)
            .then(function (txt) { t.q.answers = t.q.answers || {}; t.q.answers[t.e.id] = txt; })
            .catch(function () { t.q.answers = t.q.answers || {}; t.q.answers[t.e.id] = ''; })
            .then(function () { counters[t.e.id]++; onEvent({ engineId: t.e.id, done: counters[t.e.id], total: qs.length }); });
        }).then(function () {
          var results = {};
          engineCfgs.forEach(function (e) { results[e.id] = { name: e.name, aware: 0, awareTotal: 0, mention: 0, mentionTotal: 0, comp: {} }; });
          qs.forEach(function (q) {
            q.answers = q.answers || {};
            Object.keys(results).forEach(function (eid) { if (!(eid in q.answers)) q.answers[eid] = ''; });
          });
          return { results: results, qs: qs };
        });
      })
      .then(function (o) {
        onEvent({ stage: 'analyze' });
        return new Promise(function (res) { setTimeout(function () { res(analyze(job, o.results, o.qs)); }, 50); });
      })
      .then(function (rep) {
        onEvent({ stage: 'done' });
        return rep;
      });
  }

  /* ============ 品牌名推断（插件新增 供 popup 展示当前站点） ============ */
  var GENERIC_TAIL_RE = /(官方网站|官网|官方|首页|门户|网站|主页|在线|平台|中国站|官方旗舰店)+$/;
  var GENERIC_ALL_RE = /^(官方网站|官网|官方|首页|门户|网站|主页|在线|平台|中国站|官方旗舰店)+$/;
  var TITLE_SEG_RE = /^([^|｜\-–—_/\\·:：;；,，.。!！?？~～*＊(（[【「『“"'’]+)/;
  var SEP_TRIM_RE = /^[|｜\-–—_/\\·:：;；,，.。!！?？~～*＊()（)\[\]【】「」『』"“”'’\s]+|[|｜\-–—_/\\·:：;；,，.。!！?？~～*＊()（)\[\]【】「」『』"“”'’\s]+$/g;
  function hasCJK(s) { return /[\u4e00-\u9fff]/.test(s); }
  function brandFromTitle(title) {
    if (!title) return '';
    var t = String(title).trim();
    if (!t) return '';
    var m = t.match(TITLE_SEG_RE);
    var b = (m && m[1] ? m[1] : t).replace(SEP_TRIM_RE, '').trim();
    while (b) {
      var tail = b.match(GENERIC_TAIL_RE);
      if (!tail) break;
      if (b.length - tail[0].length < 2) { b = ''; break; } /* 整串都是通用词 */
      b = b.slice(0, b.length - tail[0].length).trim();
    }
    if (!hasCJK(b) && /\s/.test(b)) b = b.split(/\s+/)[0];
    b = b.trim();
    if (b.length < 2 || b.length > 30 || GENERIC_ALL_RE.test(b)) return '';
    return b;
  }
  function brandFromDomain(host) {
    if (!host) return '';
    var rd = rootDomain(String(host).replace(/^www\./i, ''));
    var label = (rd.split('.')[0] || '').toLowerCase();
    if (!label || /^(com|net|org|gov|edu|cn|io|co|me|info|biz)$/.test(label)) return '';
    if (label.length < 2) return '';
    return label.slice(0, 30);
  }

  self.EEO = {
    ENGINES: ENGINES,
    DEPTHS: DEPTHS,
    INDUSTRIES: INDUSTRIES,
    GRADE_STYLE: GRADE_STYLE,
    SUFFIX_RE: SUFFIX_RE,
    NOINFO_RE: NOINFO_RE,
    AMBIG_RE: AMBIG_RE,
    coreWord: coreWord,
    countHits: countHits,
    gradeOf: gradeOf,
    askEngine: askEngine,
    pool: pool,
    genQuestions: genQuestions,
    fallbackQuestions: fallbackQuestions,
    extractSources: extractSources,
    analyze: analyze,
    runDetection: runDetection,
    rootDomain: rootDomain,
    brandFromTitle: brandFromTitle,
    brandFromDomain: brandFromDomain,
  };
})();
