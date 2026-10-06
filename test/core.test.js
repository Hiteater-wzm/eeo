// core.cjs 单元测试：品牌名剥离 / 提及计数 / 判定正则 / 评级 / 来源提取
// 只用 node:test（Node 18+ 内置），零外部依赖
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const {
  coreWord, countHits, NOINFO_RE, AMBIG_RE, DEPTHS, gradeOf, extractSources,
} = require(path.join(__dirname, '..', 'core.cjs'));

// ---------- coreWord ----------
test('coreWord：后缀剥离与回归锁（提及次数翻倍 bug）', async t => {
  // 回归锁：西瓜创客无已知后缀，必须单元素。旧版曾返回 [b, b] 双份同一条目，
  // 导致 countHits 把 19 次提及计成 38 次
  await t.test('无已知后缀且 >=4 字 → 单元素（历史 bug 品牌）', () => {
    assert.deepStrictEqual(coreWord('西瓜创客'), ['西瓜创客']);
  });
  await t.test('剥掉一层已知后缀 → [全名, 主词] 双元素', () => {
    assert.deepStrictEqual(coreWord('西瓜创客科技'), ['西瓜创客科技', '西瓜创客']);
    assert.deepStrictEqual(coreWord('某某教育'), ['某某教育', '某某']);
    assert.deepStrictEqual(coreWord('编程工坊'), ['编程工坊', '编程']);
  });
  await t.test('多个后缀循环剥离到不能再剥', () => {
    assert.deepStrictEqual(coreWord('某某科技有限公司'), ['某某科技有限公司', '某某']);
  });
  await t.test('AI 后缀大小写各算一种', () => {
    assert.deepStrictEqual(coreWord('某某AI'), ['某某AI', '某某']);
    assert.deepStrictEqual(coreWord('某某ai'), ['某某ai', '某某']);
  });
  await t.test('<4 字 → 原样单元素', () => {
    assert.deepStrictEqual(coreWord('编程猫'), ['编程猫']);
    assert.deepStrictEqual(coreWord('美团'), ['美团']);
  });
  await t.test('整词就是后缀（剥完剩 <2 字）→ 不剥', () => {
    assert.deepStrictEqual(coreWord('信息技术'), ['信息技术']);
    assert.deepStrictEqual(coreWord('有限公司'), ['有限公司']);
  });
  await t.test('剥后只剩 1 字 → 拒绝剥离', () => {
    assert.deepStrictEqual(coreWord('X信息技术'), ['X信息技术']);
  });
  await t.test('首尾空白先 trim', () => {
    assert.deepStrictEqual(coreWord('  西瓜创客 '), ['西瓜创客']);
  });
  await t.test('不变量：任何输入都不返回重复模式（翻倍 bug 的根）', () => {
    for (const b of ['西瓜创客', '西瓜创客科技', '某某有限公司', '编程猫', '信息技术', '核桃编程', '某某AI']) {
      const pats = coreWord(b);
      assert.strictEqual(new Set(pats).size, pats.length, `${b} 不应有重复模式`);
    }
  });
});

// ---------- countHits ----------
test('countHits：单次/多次/多模式/不命中/重叠', async t => {
  await t.test('单次命中', () => {
    assert.strictEqual(countHits('今天推荐西瓜创客', ['西瓜创客']), 1);
  });
  await t.test('回归锁：19 次提及计 19 不计 38', () => {
    const text = Array(19).fill('西瓜创客').join('，');
    assert.strictEqual(countHits(text, coreWord('西瓜创客')), 19);
  });
  await t.test('多模式分别计数后求和', () => {
    assert.strictEqual(countHits('西瓜创客科技很好，西瓜创客科技评分高', ['西瓜创客科技', '西瓜创客']), 4);
  });
  await t.test('不命中返回 0', () => {
    assert.strictEqual(countHits('推荐编程猫和核桃编程', ['西瓜创客']), 0);
  });
  await t.test('重叠出现按起点逐位计数（indexOf i+1 推进，不跳 pattern 长度）', () => {
    assert.strictEqual(countHits('aaa', ['aa']), 2);   // 位置 0、1 各一处
    assert.strictEqual(countHits('aaaa', ['aa']), 3);  // 位置 0、1、2
  });
  await t.test('空文本/空模式返回 0', () => {
    assert.strictEqual(countHits('', ['x']), 0);
    assert.strictEqual(countHits('abc', []), 0);
  });
});

// ---------- gradeOf ----------
test('gradeOf：五档边界（恰好等于与略低）', async t => {
  const cases = [
    [1, 'S'], [0.8, 'S'], [0.7999, 'A'],
    [0.6, 'A'], [0.5999, 'B'],
    [0.4, 'B'], [0.3999, 'C'],
    [0.15, 'C'], [0.1499, 'D'],
    [0, 'D'],
  ];
  for (const [x, g] of cases) {
    assert.strictEqual(gradeOf(x).g, g, `gradeOf(${x}) 应为 ${g}`);
  }
  await t.test('返回 { g, t } 结构且档位短语正确', () => {
    assert.deepStrictEqual(Object.keys(gradeOf(0.9)), ['g', 't']);
    assert.strictEqual(gradeOf(0.9).t, 'AI 眼中的默认选项');
    assert.strictEqual(gradeOf(0).t, 'AI 视野之外');
  });
});

// 评分公式锁：overall = avgAware*0.5 + mentionRate*0.5，mentionRate = min(1, total/(cap*0.3))
// 公式本身的端到端验证在 test/integration.test.js 的 analyze 用例里做精确断言
test('DEPTHS：三档题量配置', () => {
  assert.strictEqual(DEPTHS.quick.total, 12);
  assert.strictEqual(DEPTHS.standard.total, 30);
  assert.strictEqual(DEPTHS.deep.total, 48);
});

// ---------- NOINFO_RE ----------
// 构造器：filler 内不能出现 。！？（会被当作句界截断）
const gap = n => '没有' + '好'.repeat(n) + '信息';
const BRAND30 = '张王李赵陈刘杨黄周吴徐孙马朱胡郭何高林郑谢罗梁宋唐许韩冯邓曹彭曾肖';
const NOINFO_POS = [
  '没有查到相关信息',
  '我在训练数据中没有找到与该名称相关的可核实信息',
  '查不到任何资料',
  '缺乏公开数据',
  '暂未收录该机构',
  '未能找到相关记录',
  '不在我的训练数据里有任何记录',
  '并不是一个广为人知的品牌',
  '无法确认其真实性',
  '没有听说过该公司',
  '目前没有公开的收费信息',
];
const NOINFO_NEG = [
  '这是一家值得信赖的公司',
  '西瓜创客是一家专注少儿编程的教育机构',
];

test('NOINFO_RE：认知假阴性/假阳性判定', async t => {
  for (const s of NOINFO_POS) await t.test(`应命中：${s.slice(0, 18)}`, () => {
    assert.strictEqual(NOINFO_RE.test(s), true, s);
  });
  for (const s of NOINFO_NEG) await t.test(`不应命中：${s.slice(0, 18)}`, () => {
    assert.strictEqual(NOINFO_RE.test(s), false, s);
  });
  await t.test('否定词与关键词距离在 100 字以内 → 命中', () => {
    assert.strictEqual(NOINFO_RE.test(gap(50)), true);
    assert.strictEqual(NOINFO_RE.test(gap(100)), true); // 窗口上界恰好含 100
  });
  await t.test('距离超过 100 字 → 不命中（扩窗上界）', () => {
    assert.strictEqual(NOINFO_RE.test(gap(101)), false);
  });
  // 回归锁：30 字虚构品牌名把「没有」和「信息」撑开到 47 字（> 旧窗口 24，<= 新窗口 100）。
  // 旧版在此漏判成"没有认知缺口"，导致该回答被误判为有实料
  await t.test('长品牌名把否定词与关键词撑开 47 字 → 仍命中（24→100 扩窗回归锁）', () => {
    const s = `关于「${BRAND30}」这个名称，没有经过多方检索仍未发现任何与${BRAND30}相关联的信息`;
    assert.strictEqual(NOINFO_RE.test(s), true);
  });
  await t.test('句号截断：跨句的否定词与关键词不算一组', () => {
    assert.strictEqual(NOINFO_RE.test('没有。信息'), false);
  });
  await t.test('顺序敏感：关键词在否定词之前不算', () => {
    assert.strictEqual(NOINFO_RE.test('信息很齐全，没有明显短板'), false);
  });
});

// ---------- AMBIG_RE ----------
const AMBIG_POS = [
  '西瓜在不同语境下有不同含义',
  '如果你说的是西瓜创客，那么可以介绍',
  '如果你说要报班，需要明确目标',
  '如果指的是少儿编程领域，选项很多',
  '这个词可能指多个对象',
  '请问你指的是哪个品牌',
  '你问的是哪个方面',
  '具体指什么需求',
  '能具体说说你的预算吗',
  '请补充所在城市',
  '请你补充一些细节',
  '告诉我更多信息',
  '告诉我具体想学什么',
  '需要更多信息才能判断',
  '请提供更多上下文',
  '存在几种可能的解释',
  '缩写有点模糊',
  '它有时候并不是一个品牌名',
  '这并不一定是品牌',
  '可能是以下几种情况',
  '无法确定它是否真实存在',
  '需要你提供更多细节',
];
const AMBIG_NEG = [
  '西瓜创客是一家少儿编程机构，课程体系完整',
  '推荐三家机构：甲、乙、丙',
  '这家公司成立于2015年，总部在成都',
];

test('AMBIG_RE：歧义反问句式判定', async t => {
  for (const s of AMBIG_POS) await t.test(`应命中：${s.slice(0, 16)}`, () => {
    assert.strictEqual(AMBIG_RE.test(s), true, s);
  });
  for (const s of AMBIG_NEG) await t.test(`不应命中：${s.slice(0, 16)}`, () => {
    assert.strictEqual(AMBIG_RE.test(s), false, s);
  });
});

// ---------- extractSources ----------
test('extractSources：URL 提取与中文标点截断', async t => {
  const qs = [{ id: 1, answers: { e1: '参考 https://www.zhihu.com/question/123456 ，内容详实。' } }];
  const r = extractSources(qs);
  await t.test('全角逗号截断 URL', () => {
    assert.strictEqual(r.totalUrls, 1);
    assert.strictEqual(r.topUrls[0].url, 'https://www.zhihu.com/question/123456');
    assert.strictEqual(r.topUrls[0].count, 1);
  });
  await t.test('根域名归类', () => {
    assert.strictEqual(r.topDomains[0].domain, 'zhihu.com');
  });
  await t.test('域名映射到平台并入 perQuestion', () => {
    assert.strictEqual(r.byPlatform['知乎'], 1);
    assert.ok(r.byQuestion[1].includes('知乎'));
    assert.ok(r.byQuestion[1].includes('https://www.zhihu.com/question/123456'));
  });
});

test('extractSources：markdown 链接的右括号配平', () => {
  const r = extractSources([{ id: 1, answers: { e1: '详情见 [报道](https://www.sohu.com/a/123.shtml) 可自行核实。' } }]);
  assert.strictEqual(r.topUrls[0].url, 'https://www.sohu.com/a/123.shtml');
  assert.strictEqual(r.byPlatform['搜狐'], 1);
});

test('extractSources：中文路径在路径段截断，主机仍可归类', () => {
  const r = extractSources([{ id: 1, answers: { e1: '详见 https://zh.wikipedia.org/wiki/西瓜创客 词条。' } }]);
  assert.strictEqual(r.topUrls[0].url, 'https://zh.wikipedia.org/wiki/');
  assert.strictEqual(r.byPlatform['维基百科'], 1);
});

test('extractSources：13 个平台全部可归类', () => {
  const a = [
    '来源一 https://mp.weixin.qq.com/s/abc123 ，',
    '来源二 https://news.qq.com/a/2026.html ，',
    '来源三 https://www.36kr.com/p/123.html ，',
    '来源四 https://www.163.com/dy/article/1.html ，',
    '来源五 https://www.sina.com.cn/x/1.shtml ，',
    '来源六 https://weibo.com/u/123 ，',
    '来源七 https://github.com/org/repo ，',
    '来源八 https://blog.csdn.net/u/article/details/1 ，',
    '来源九 https://baike.baidu.com/item/xx ，',
    '来源十 https://www.bilibili.com/video/1 与 https://b23.tv/abc ，',
    '文字提及：知乎、CSDN、维基百科、GitHub、微博、B站、36氪、搜狐、网易、新浪、腾讯新闻、微信公众号、哔哩哔哩。',
  ].join('');
  const r = extractSources([{ id: 1, answers: { e1: a } }]);
  // 顺序无关：13 个平台每个都应被归类到（key 数量一致且逐一在场）
  const got = Object.keys(r.byPlatform);
  const want = ['36氪', 'B站', 'CSDN', 'GitHub', '百度百科', '微博', '新浪', '搜狐', '知乎', '维基百科', '网易', '腾讯新闻', '微信公众号'];
  assert.strictEqual(got.length, want.length);
  for (const name of want) assert.ok(got.includes(name), `缺少平台 ${name}`);
  // URL 口径 + 文字口径合并计数
  assert.strictEqual(r.byPlatform['B站'], 4); // bilibili + b23.tv 两个 URL，加 B站、哔哩哔哩两处文字
  assert.strictEqual(r.byPlatform['微信公众号'], 2); // URL 1 + 文字 1（"公众号"不再重复计）
  assert.strictEqual(r.byPlatform['知乎'], 1); // 仅文字
});

test('extractSources：URL 先移除再数词，URL 里的域名不当文字提及二次计数', () => {
  const r = extractSources([{ id: 1, answers: { e1: 'https://blog.csdn.net/u/1 写得不错' } }]);
  assert.strictEqual(r.byPlatform['CSDN'], 1);
});

test('extractSources：纯文字提及的最长词优先（微信公众号不拆成公众号再计一次）', () => {
  const r = extractSources([{ id: 1, answers: { e1: '微信公众号上有相关讨论' } }]);
  assert.strictEqual(r.byPlatform['微信公众号'], 1);
});

test('extractSources：竞品引用上下文（mentioned 计数 + 该题来源并集）', async t => {
  const qs = [
    { id: 1, answers: { e1: '推荐西瓜创客，详见 https://www.zhihu.com/question/9' } },
    { id: 2, answers: { e1: '没有推荐。', e2: '核桃编程也不错，微博上有讨论' } },
    { id: 3, answers: { e1: '还可以考虑西瓜创客。' } },
  ];
  const r = extractSources(qs, ['西瓜创客']);
  await t.test('mentioned 只数提到竞品的题', () => {
    assert.strictEqual(r.competitorContext.length, 1);
    assert.strictEqual(r.competitorContext[0].competitor, '西瓜创客');
    assert.strictEqual(r.competitorContext[0].mentioned, 2); // q1、q3
  });
  await t.test('sources 是命中题的来源并集', () => {
    assert.deepStrictEqual(r.competitorContext[0].sources, ['知乎', 'https://www.zhihu.com/question/9']);
  });
  await t.test('未提及竞品的题即使有来源也不并入', () => {
    assert.deepStrictEqual(r.byQuestion[2], ['微博']);
  });
});

test('extractSources：空输入容错', () => {
  assert.strictEqual(extractSources(null, null).totalUrls, 0);
  assert.deepStrictEqual(extractSources([], ['甲']).competitorContext, [{ competitor: '甲', mentioned: 0, sources: [] }]);
});
