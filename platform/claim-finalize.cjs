#!/usr/bin/env node
// EEO 品牌认领收尾（merge 侧）。零依赖，Node >= 18。
//
// PR 合并后由 .github/workflows/claim-finalize.yml 调用：
//   1. 读 PR 合并进来的 JSON 文件（命令行参数，或环境变量 PR_FILES，换行分隔）
//   2. 把其中 claim.status=claiming 的品牌卡盖章：
//        claim.status  → "claimed"
//        claim.method  → "domain-file"
//        claim.claimedAt → 当前时间（ISO 8601）
//        claim.history → 追加一条认领记录（有 PR 号则带上）
//   3. 写回原文件（2 空格缩进，保留原有末尾换行）
//
// 只动 claim 字段，不碰卡内其他内容。commit/push 由 workflow 完成（GITHUB_TOKEN）。
// 本地试跑：node platform/claim-finalize.cjs path/to/card.json

'use strict';

const fs = require('fs');

function str(v) { return typeof v === 'string' ? v.trim() : ''; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }

function collectFiles(argv) {
  const files = [];
  for (const a of argv) {
    if (a.startsWith('--')) continue;
    files.push(a);
  }
  if (files.length) return files;
  for (const line of String(process.env.PR_FILES || '').split(/\r?\n/)) {
    const t = line.trim();
    if (t && !files.includes(t)) files.push(t);
  }
  return files;
}

// 就地盖章，返回盖章的品牌名列表（空数组 = 本文件无事可做）
function finalizeFile(file, prNumber) {
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw); // 解析失败直接抛，workflow 标红——合并进来的数据不该是坏的

  const cards = Array.isArray(data) ? data : [data];
  const names = [];
  for (const card of cards) {
    if (!obj(card)) continue;
    if (str(card.schema) !== 'eeo.brand.v1') continue;
    const claim = obj(card.claim) || (card.claim = {});
    if (str(claim.status) !== 'claiming') continue;

    claim.status = 'claimed';
    claim.method = 'domain-file';
    claim.claimedAt = new Date().toISOString();
    if (!Array.isArray(claim.history)) claim.history = [];
    const date = claim.claimedAt.slice(0, 10);
    claim.history.push(
      date + ' 官网验证文件核验通过' + (prNumber ? '（PR #' + prNumber + '）' : '') + '，条目转为已认领'
    );
    names.push(str(card.name) || '(未命名)');
  }

  if (!names.length) return names;
  const out = JSON.stringify(data, null, 2) + (/\n$/.test(raw) ? '\n' : '');
  fs.writeFileSync(file, out);
  return names;
}

function main() {
  const files = collectFiles(process.argv.slice(2));
  if (!files.length) {
    console.error('未指定文件：请传 JSON 文件路径参数，或设置 PR_FILES 环境变量（换行分隔）');
    process.exit(1);
  }
  const prNumber = str(process.env.PR_NUMBER);

  let total = 0;
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    if (!fs.existsSync(f)) {
      console.error('⚠️ 跳过不存在的文件：' + f);
      continue;
    }
    const names = finalizeFile(f, prNumber);
    if (names.length) {
      total += names.length;
      console.log(`✅ ${f}：${names.join('、')} → claimed`);
    }
  }
  console.log(total
    ? `\n共 ${total} 张品牌卡完成认领收尾，待 commit 回主分支`
    : '\n没有需要收尾的认领（未发现 status=claiming 的品牌卡）');
}

main();
