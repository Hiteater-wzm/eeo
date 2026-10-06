// EEO Brand Visibility Audit：GitHub Action 入口
// 只依赖 ../core.cjs 和 Node 内置模块，不引入任何 npm 包。
// 结果写入 $GITHUB_OUTPUT（含多行 heredoc），Markdown 评级表写入 $GITHUB_STEP_SUMMARY，
// 完整报告另存工作区 eeo-report.json 供 upload-artifact 使用。
// 失败软着陆：任何异常都输出 grade=ERROR 的 outputs/summary，进程永远以 0 退出。

const fs = require('fs');
const path = require('path');
const { runAudit, DEPTHS } = require('../core.cjs');

// 引擎目录：与仓库根 config.example.json 保持一致，密钥只从环境变量读
const ENGINE_PRESETS = {
  deepseek: {
    id: 'deepseek', name: 'DeepSeek', model: 'deepseek-chat',
    baseURL: 'https://api.deepseek.com/v1', keyEnv: 'DEEPSEEK_API_KEY',
    maxTokens: 2048, timeoutMs: 60000,
  },
  glm: {
    id: 'glm', name: 'Zhipu GLM', model: 'glm-5.3-flash',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4', keyEnv: 'ZHIPU_API_KEY',
    maxTokens: 8192, timeoutMs: 300000,
  },
};

const MAX_RUNTIME_MS = 35 * 60 * 1000; // 检测总时长上限，留在 GitHub job 限额之内

// 本地模拟用 EEO_INPUT_*，真实 Actions 注入 INPUT_*
function getInput(name, fallback) {
  const names = ['EEO_INPUT_' + name.toUpperCase(), 'INPUT_' + name.toUpperCase()];
  for (const k of names) {
    const v = process.env[k];
    if (v !== undefined && v !== '') return v.trim();
  }
  return fallback;
}

function appendOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const text = String(value);
  let block;
  if (text.includes('\n')) {
    // 多行值用 heredoc，开始符与结束符必须配对
    const d = 'EEO_' + Math.random().toString(36).slice(2);
    block = `${name}<<${d}\n${text}\n${d}\n`;
  } else {
    block = `${name}=${text}\n`;
  }
  fs.appendFileSync(file, block);
}

function appendSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) fs.appendFileSync(file, markdown + '\n');
}

function buildEngines(spec) {
  const ids = spec.split(/[,，\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const engines = [];
  const skipped = [];
  for (const id of new Set(ids)) {
    const p = ENGINE_PRESETS[id];
    if (!p) { skipped.push(`${id}（未知引擎，支持：${Object.keys(ENGINE_PRESETS).join('/')}）`); continue; }
    const apiKey = process.env[p.keyEnv];
    if (!apiKey) { skipped.push(`${p.name}（缺少 ${p.keyEnv} 密钥）`); continue; }
    engines.push({ id: p.id, name: p.name, model: p.model, baseURL: p.baseURL, apiKey, maxTokens: p.maxTokens, timeoutMs: p.timeoutMs });
  }
  return { engines, skipped };
}

function cell(s) { return String(s).replace(/[\r\n|]/g, ' '); }

function renderSummary(report) {
  const { input, score, results, quotes } = report;
  const dep = DEPTHS[input.depth] || DEPTHS.quick;
  const ids = Object.keys(results);
  const L = [];
  L.push('## EEO Brand Visibility Audit');
  L.push('');
  L.push(`品牌：**${cell(input.brand)}**${input.industry ? `（${cell(input.industry)}）` : ''}｜深度：${dep.label}（${dep.total} 题）｜引擎：${ids.map(id => results[id].name).join('、')}`);
  L.push('');
  L.push('| 评级 | 综合分 | 知名度 | 提及率 |');
  L.push('|---|---|---|---|');
  L.push(`| **${score.grade.g}** ${score.grade.t} | ${score.overall} / 100 | ${score.awareRate}% | ${score.mentionRate}% |`);
  L.push('');
  L.push('### 各引擎明细');
  L.push('');
  L.push('| 引擎 | 有实料回答 | 品牌题数 | 提及次数 | 品类题数 |');
  L.push('|---|---|---|---|---|');
  ids.forEach(id => {
    const r = results[id];
    L.push(`| ${cell(r.name)} | ${r.aware} | ${r.awareTotal} | ${r.mention} | ${r.mentionTotal} |`);
  });
  L.push('');
  if (quotes && quotes.length) {
    L.push('### AI 一问三不知的样本');
    L.push('');
    quotes.slice(0, 4).forEach(q => {
      L.push(`> **${cell(q.engine)}** 被问「${cell(q.q)}」：${cell(q.snippet)}`);
      L.push('>');
    });
    L.pop();
    L.push('');
  }
  L.push('完整逐题原文见本 job 的 `eeo-report.json`（建议作为 artifact 上传）。');
  return L.join('\n');
}

function renderErrorSummary(brand, message) {
  return [
    '## EEO Brand Visibility Audit',
    '',
    `品牌：**${cell(brand || '（未填写）')}**`,
    '',
    '评级：**ERROR**（本次检测未完成，workflow 本身不判失败）',
    '',
    '```text',
    String(message).slice(0, 2000),
    '```',
  ].join('\n');
}

async function main() {
  const brand = getInput('brand', '');
  const industry = getInput('industry', '');
  const depthRaw = getInput('depth', 'quick');
  const depth = DEPTHS[depthRaw] ? depthRaw : 'quick';

  if (!brand) throw new Error('缺少必填输入 brand');

  const { engines, skipped } = buildEngines(getInput('engines', 'deepseek,glm'));
  skipped.forEach(s => console.log('[eeo] 跳过 ' + s));
  if (!engines.length) {
    throw new Error('没有可用引擎：请在仓库 Secrets 配置 DEEPSEEK_API_KEY / ZHIPU_API_KEY，并在 engines 输入里保留对应引擎');
  }

  const dep = DEPTHS[depth];
  const input = { brand, industry, city: '', audience: '', competitors: [], depth };
  console.log(`[eeo] 开始检测「${brand}」：${engines.map(e => e.name).join('、')}，${dep.label}（${dep.total} 题），上限 ${MAX_RUNTIME_MS / 60000} 分钟`);

  let timer = null;
  const watchdog = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`检测超过 ${MAX_RUNTIME_MS / 60000} 分钟，已主动停止`)), MAX_RUNTIME_MS);
  });

  let report;
  try {
    report = await Promise.race([
      runAudit(input, engines, (e, done, total) => {
        if (done === total || done % 6 === 0) console.log(`[eeo] ${e.name}: ${done}/${total} 已回答`);
      }),
      watchdog,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  const reportJson = JSON.stringify(report);
  appendOutput('grade', report.score.grade.g);
  appendOutput('overall', report.score.overall);
  appendOutput('aware_rate', report.score.awareRate);
  appendOutput('mention_rate', report.score.mentionRate);
  appendOutput('report_json', reportJson);

  // 工作区可能只读，报告文件属尽力而为，失败不影响 job
  try {
    fs.writeFileSync(path.join(process.cwd(), 'eeo-report.json'), reportJson);
    console.log('[eeo] 完整报告已写入 eeo-report.json');
  } catch (e) {
    console.log('[eeo] 无法写入 eeo-report.json（工作区只读？）：' + e.message);
  }

  appendSummary(renderSummary(report));
  console.log(`[eeo] 完成：评级 ${report.score.grade.g}，综合分 ${report.score.overall}，知名度 ${report.score.awareRate}%，提及率 ${report.score.mentionRate}%`);
}

function failSoft(err) {
  try {
    const message = err && err.message ? err.message : String(err);
    console.error('[eeo] 检测失败：' + message);
    appendOutput('grade', 'ERROR');
    appendOutput('overall', '');
    appendOutput('aware_rate', '');
    appendOutput('mention_rate', '');
    appendOutput('report_json', JSON.stringify({ error: message }));
    appendSummary(renderErrorSummary(getInput('brand', ''), message));
  } catch (e) {
    console.error('[eeo] 写入失败信息时出错：' + e.message);
  }
}

main().then(
  () => process.exit(0),
  (err) => { failSoft(err); process.exit(0); }
);
