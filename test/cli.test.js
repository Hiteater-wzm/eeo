// cli.cjs 单元测试：slugify / 参数解析 / CSV 落盘格式
// die() 会 process.exit，涉及它的用例放子进程里跑，避免杀死测试进程
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');
const { slugify, parseArgs, csvCell, buildCsv } = require(path.join(__dirname, '..', 'cli.cjs'));

const ROOT = path.join(__dirname, '..');

// ---------- slugify（watch 历史文件名） ----------
test('slugify：中文/特殊字符/空格', async t => {
  const cases = [
    ['蜜雪冰城', '蜜雪冰城'],            // 纯中文原样保留
    ['  Coca  Cola ', 'cocacola'],      // 小写化 + 去所有空白
    ['A&B 公司！！', 'ab公司'],          // 符号剔除、中文保留
    ['混合 Brand-123', '混合brand-123'], // 连字符与字母数字保留
    ['ABC', 'abc'],
    ['!!!', 'brand'],                    // 剥空后的兜底名
    ['', 'brand'],
    [null, 'brand'],
  ];
  for (const [input, want] of cases) {
    await t.test(`slugify(${JSON.stringify(input)}) → ${want}`, () => {
      assert.strictEqual(slugify(input), want);
    });
  }
  await t.test('超长名截断到 40 字', () => {
    assert.strictEqual(slugify('雪'.repeat(50)).length, 40);
  });
});

// ---------- parseArgs ----------
test('parseArgs：常规解析（进程内）', async t => {
  await t.test('空参数', () => {
    assert.deepStrictEqual(parseArgs([]), { pos: [], o: {} });
  });
  await t.test('位置参数与 --depth 分离传值', () => {
    const { pos, o } = parseArgs(['--depth', 'standard', '西瓜创客']);
    assert.deepStrictEqual(pos, ['西瓜创客']);
    assert.strictEqual(o.depth, 'standard');
  });
  await t.test('--depth=deep 等号形式', () => {
    assert.strictEqual(parseArgs(['--depth=deep']).o.depth, 'deep');
  });
  await t.test('--engine/--json/--csv 一次到位', () => {
    const { pos, o } = parseArgs(['--engine', 'ds,glm', '--json', 'r.json', '--csv', 'r.csv', 'b']);
    assert.deepStrictEqual(pos, ['b']);
    assert.strictEqual(o.engine, 'ds,glm');
    assert.strictEqual(o.json, 'r.json');
    assert.strictEqual(o.csv, 'r.csv');
  });
  await t.test('-h 与 --help 布尔标志', () => {
    assert.strictEqual(parseArgs(['-h']).o.help, true);
    assert.strictEqual(parseArgs(['--help']).o.help, true);
  });
  await t.test('--quiet 是布尔标志，不吞后随位置参数', () => {
    const { pos, o } = parseArgs(['--quiet', 'x']);
    assert.strictEqual(o.quiet, true);
    assert.deepStrictEqual(pos, ['x']);
  });
  await t.test('--concurrency 取值', () => {
    assert.strictEqual(parseArgs(['--concurrency', '2']).o.concurrency, '2');
  });
});

// die() 内部 process.exit(1)，必须隔离在子进程里验证退出码与报错文案
test('parseArgs：非法输入退出码 1（子进程）', async t => {
  function runCliInChild(argvLiteral) {
    const script = `const { parseArgs } = require(${JSON.stringify(path.join(ROOT, 'cli.cjs'))}); parseArgs(${argvLiteral});`;
    return spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  }
  await t.test('未知选项', () => {
    const r = runCliInChild(`['--bogus']`);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /未知选项/);
  });
  await t.test('缺参数值', () => {
    const r = runCliInChild(`['--depth']`);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--depth 需要一个参数/);
  });
  await t.test('值是下一个 -- 开头的 flag 时视为缺值', () => {
    const r = runCliInChild(`['--json', '--csv', 'x']`);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--json 需要一个参数/);
  });
});

// ---------- --csv 落盘格式 ----------
test('csvCell/buildCsv：CSV 转义与汇总行', async t => {
  await t.test('csvCell 只在必要时加引号', () => {
    assert.strictEqual(csvCell('plain'), 'plain');
    assert.strictEqual(csvCell('a,b'), '"a,b"');
    assert.strictEqual(csvCell('说"你好"'), '"说""你好"""');
  });
  await t.test('buildCsv：BOM 头 + 表头 + 数据行', () => {
    const csv = buildCsv([{
      brand: '西瓜创客',
      score: { grade: { g: 'A' }, overall: 63, awareRate: 25, mentionRate: 100 },
      results: { e1: { name: 'E1', aware: 1, awareTotal: 2, mention: 2 } },
    }]);
    assert.ok(csv.startsWith('\ufeff'), 'Excel 打开中文 CSV 需要 BOM');
    assert.ok(csv.includes('brand,grade,overall,awareRate,mentionRate,engines'));
    assert.ok(/西瓜创客,A,63,25,100/.test(csv));
  });
  await t.test('buildCsv：失败报告单独成行', () => {
    const csv = buildCsv([{ brand: 'X', error: 'boom' }]);
    assert.ok(/X,-,,,,失败：boom/.test(csv));
  });
});
