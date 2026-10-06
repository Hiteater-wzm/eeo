// 端到端集成测试：analyze 全链路 / runAudit（mock fetch）/ server.cjs 题库兜底
// 只用 node:test 与 Node 内置模块，零外部依赖，不打真实 API
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { analyze, runAudit } = require(path.join(__dirname, '..', 'core.cjs'));

// ---------- analyze：评分公式与输出结构 ----------
// 评分公式锁：overall = avgAware*0.5 + mentionRate*0.5；mentionRate = min(1, totalMention/(mentionCap*0.3))
test('analyze 端到端：双引擎 5 题手动构造，分数/标签/引语/来源全量精确断言', async t => {
  const LONG_OK = '西瓜创客成立于2017年，总部位于成都，主要面向6到16岁青少年提供图形化与Python课程，师资来自一线互联网企业与师范院校，课程分启蒙、进阶与竞赛三个阶段，社区活跃。'.repeat(3);
  const qs = [
    { id: 1, cat: '品牌', q: '西瓜创客是什么？', answers: { ds: LONG_OK, glm: '如果你说的是西瓜创客，还需要更多信息才能回答。' } },
    { id: 2, cat: '品牌', q: '西瓜创客靠谱吗？', answers: { ds: '抱歉，我没有查到关于西瓜创客的任何信息。', glm: '西瓜创客是做编程的。' } },
    { id: 3, cat: '品类', q: '少儿编程哪家好？', answers: { ds: '推荐编程猫和核桃编程。', glm: '西瓜创客也是选项之一，详见 https://www.zhihu.com/question/1 的讨论。' } },
    { id: 4, cat: '品类', q: '少儿编程怎么选？', answers: { ds: '', glm: '可以考虑编程猫。' } },
    { id: 5, cat: '场景', q: '成都有什么少儿编程机构？', answers: { glm: '本地有西瓜创客门店，口碑不错。' } },
  ];
  const results = {
    ds: { name: 'DeepSeek', aware: 0, awareTotal: 0, mention: 0, mentionTotal: 0, comp: {} },
    glm: { name: 'GLM', aware: 0, awareTotal: 0, mention: 0, mentionTotal: 0, comp: {} },
  };
  const rep = analyze(
    { brand: '西瓜创客', industry: '少儿编程', city: '成都', competitors: ['编程猫', '核桃编程'], depth: 'quick' },
    qs, results,
  );

  await t.test('分引擎计数（认知按题、提及按次数）', () => {
    assert.strictEqual(results.ds.aware, 1);
    assert.strictEqual(results.ds.awareTotal, 2);
    assert.strictEqual(results.ds.mention, 0);
    assert.strictEqual(results.ds.mentionTotal, 1); // q4.ds 为空串不计题
    assert.deepStrictEqual(results.ds.comp, { 编程猫: 1, 核桃编程: 2 }); // 核桃编程双模式各中一次
    assert.strictEqual(results.glm.aware, 0);
    assert.strictEqual(results.glm.awareTotal, 2);
    assert.strictEqual(results.glm.mention, 2);
    assert.strictEqual(results.glm.mentionTotal, 3);
    assert.deepStrictEqual(results.glm.comp, { 编程猫: 1 });
  });
  await t.test('评分公式：avgAware=0.25、mentionRate=min(1,2/1.5)=1 → overall=63/A', () => {
    assert.strictEqual(rep.score.awareRate, 25);
    assert.strictEqual(rep.score.mentionRate, 100);
    assert.strictEqual(rep.score.overall, Math.round(0.625 * 100));
    assert.strictEqual(rep.score.grade.g, 'A');
  });
  await t.test('逐题标签（有实料/无实料/提及/未提及/未答）', () => {
    // 注意口径：标签不校验回答长度（150 字门槛只作用于 aware 计数），q2.glm 虽短仍标"有实料"
    assert.deepStrictEqual(rep.labels, {
      1: { ds: '有实料', glm: '无实料' },  // glm 命中歧义句
      2: { ds: '无实料', glm: '有实料' },  // ds 命中无信息；glm 短但命中且无否定/歧义
      3: { ds: '未提及', glm: '提及' },
      4: { ds: '未答', glm: '未提及' },
      5: { ds: '未答', glm: '提及' },
    });
  });
  await t.test('引语：只收无信息类回答且带省略号', () => {
    assert.strictEqual(rep.quotes.length, 1);
    assert.strictEqual(rep.quotes[0].engine, 'DeepSeek');
    assert.strictEqual(rep.quotes[0].q, '西瓜创客靠谱吗？');
    assert.ok(rep.quotes[0].snippet.includes('没有查到'));
    assert.ok(rep.quotes[0].snippet.endsWith('……'));
  });
  await t.test('来源：平台归类与竞品上下文', () => {
    assert.strictEqual(rep.sources.byPlatform['知乎'], 1);
    assert.ok(rep.sources.byQuestion[3].includes('知乎'));
    assert.strictEqual(rep.sources.competitorContext[0].mentioned, 2); // 编程猫：q3、q4
    assert.strictEqual(rep.sources.competitorContext[1].mentioned, 1); // 核桃编程：q3
  });
});

// ---------- runAudit：mock 全局 fetch，不打真实网络 ----------
const REAL_FETCH = globalThis.fetch;

test('runAudit 成功路径：题库生成 + 12 题作答 + 汇总', async t => {
  const genQs = [];
  for (let i = 1; i <= 4; i++) genQs.push({ cat: '品牌', q: `西瓜创客值得报名吗（品牌题${i}）` });
  for (let i = 1; i <= 8; i++) genQs.push({ cat: '品类', q: `少儿编程平台怎么选（品类题${i}）` });
  const POS = '西瓜创客提供图形化编程与Python进阶课程，面向青少年，社区活跃，课程体系完整，师资稳定。'.repeat(4);
  const calls = [];
  globalThis.fetch = async (_url, opts) => {
    const content = JSON.parse(opts.body).messages[0].content;
    calls.push(content);
    const out = (content.includes('生成') && content.includes('中文提问'))
      ? JSON.stringify(genQs)                      // 题库生成请求
      : (content.includes('西瓜创客') ? POS : '推荐甲、乙两家机构。'); // 逐题作答请求
    return { ok: true, json: async () => ({ choices: [{ message: { content: out } }] }) };
  };
  try {
    const rep = await runAudit(
      { brand: '西瓜创客', industry: '少儿编程', city: '', competitors: [], depth: 'quick' },
      [{ id: 'e1', name: 'Mock引擎', model: 'm', baseURL: 'http://mock.test', apiKey: 'k', maxTokens: 100, timeoutMs: 5000 }],
    );
    await t.test('题数与作答完整性', () => {
      assert.strictEqual(rep.questions.length, 12);
      assert.ok(rep.questions.every(q => q.answers && q.answers.e1 && q.answers.e1.length > 0));
      assert.strictEqual(calls.length, 13); // 1 次题库生成 + 12 次作答
      assert.strictEqual(rep.input.brand, '西瓜创客');
    });
    await t.test('汇总分数：认知 4/4、提及 0/8 → overall 50/B', () => {
      assert.strictEqual(rep.results.e1.aware, 4);
      assert.strictEqual(rep.results.e1.awareTotal, 4);
      assert.strictEqual(rep.results.e1.mention, 0);
      assert.strictEqual(rep.results.e1.mentionTotal, 8);
      assert.strictEqual(rep.score.awareRate, 100);
      assert.strictEqual(rep.score.mentionRate, 0);
      assert.strictEqual(rep.score.overall, 50);
      assert.strictEqual(rep.score.grade.g, 'B');
    });
  } finally {
    globalThis.fetch = REAL_FETCH;
  }
});

test('runAudit 题库生成失败：错误显式上抛（core.cjs 无静默兜底，MCP/CLI 依赖此报错）', async () => {
  globalThis.fetch = async () => { throw new Error('网络不通'); };
  try {
    await assert.rejects(
      runAudit(
        { brand: '西瓜创客', industry: '少儿编程', competitors: [], depth: 'quick' },
        [{ id: 'e1', name: 'Mock', model: 'm', baseURL: 'http://mock.test', apiKey: 'k', maxTokens: 10, timeoutMs: 2000 }],
      ),
      // assert.rejects 的正则匹配的是 String(err)（带 "Error: " 前缀），不能锚定行首
      /题库生成失败：网络不通/,
    );
  } finally {
    globalThis.fetch = REAL_FETCH;
  }
});

// ---------- server.cjs genQuestions 兜底 ----------
// server.cjs 不能直接 require 进测试进程：缺 config.json 时它 process.exit(1)，且启动时会
// server.listen 挂住事件循环。所以拷贝到临时目录、注入最小 config.json，在子进程里跑完即退
test('server.cjs genQuestions 兜底：引擎失联时回退固定题库模板', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eeo-test-'));
  fs.copyFileSync(path.join(__dirname, '..', 'server.cjs'), path.join(tmp, 'server.cjs'));
  fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({
    port: 20000 + Math.floor(Math.random() * 20000),
    ipDailyLimit: 5,
    engines: [{ id: 'deepseek', name: 'DS', model: 'm', baseURL: 'http://127.0.0.1:9', apiKey: 'k', timeoutMs: 2000, enabled: true, concurrency: 1, gapMs: 0 }],
  }));
  fs.writeFileSync(path.join(tmp, 'runner.cjs'), `'use strict';
const srv = require('./server.cjs');
globalThis.fetch = async () => { throw new Error('network down'); };
srv.genQuestions({ brand: '测试品牌', industry: '教育培训', competitors: ['竞品甲'], website: '', city: '北京', audience: '', depth: 'quick' })
  .then(qs => { console.log('###JSON###' + JSON.stringify(qs)); process.exit(0); })
  .catch(e => { console.error(e && e.stack || String(e)); process.exit(1); });
`);
  const out = execFileSync(process.execPath, [path.join(tmp, 'runner.cjs')], { encoding: 'utf8', timeout: 60000 });
  const line = out.split(/\r?\n/).find(l => l.startsWith('###JSON###'));
  assert.ok(line, '子进程应输出兜底题库 JSON，实际输出：' + out.slice(0, 300));
  const qs = JSON.parse(line.slice('###JSON###'.length));

  assert.strictEqual(qs.length, 12, 'quick 档兜底应为 12 题');
  const byCat = {};
  qs.forEach((q, i) => {
    assert.strictEqual(q.id, i + 1, 'id 应从 1 连续编号');
    byCat[q.cat] = (byCat[q.cat] || 0) + 1;
  });
  assert.deepStrictEqual(byCat, { 品牌: 4, 品类: 6, 场景: 2 });
  assert.ok(qs.slice(0, 4).every(q => q.q.includes('测试品牌')), '品牌题应含品牌名');
  assert.ok(qs[3].q.includes('竞品甲'), '第 4 题应为与竞品的对比题');
  assert.ok(qs[10].q.includes('北京'), '场景题应落城市');
});
