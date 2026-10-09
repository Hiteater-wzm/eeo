# EEO（中文版）

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-18%2B-339933)

本文件是 [README.md](README.md)（英文正本）的中文译本；面向 AI 代理的仓库全图见 [README-AI.md](README-AI.md)。

EEO（Everything Engine Optimization，全引擎优化）是一个开放基础设施项目，包含三大支柱：注册表、测量和协议。

## 三大支柱

### 1. 注册表 — 开放品牌与组织数据

收录 1,542,995 张 `eeo.brand.v1` 架构的组织与品牌卡，覆盖 172 个国家与地区。42,373 张带 LEI 全球法人识别码权威背书。目录站：https://hiteater-wzm.github.io/eeo/

数据管线：采集 → 多轮 AI 逐条审查（判定文件逐条留档）→ 确定性规则清洗 → 分片 JSONL 注册表。方法论与各阶段计数见 [datasets/STATS-FULL.md](datasets/STATS-FULL.md)。注册表分片通过 [GitHub Releases](https://github.com/Hiteater-wzm/eeo/releases) 分发，克隆后执行 `node tools/fetch-registry.cjs` 下载。

### 2. 测量 — 可复现的 AI 可见性评估

固定题板、冻结快照、字节级可复现打分。双引擎采样、双裁判立场裁决（已发布一致性 kappa 0.909）、Wilson 置信区间、改写稳健可见率、Bradley-Terry 排名。首份快照：[snapshots/panel-milktea-v1-20261008](snapshots/panel-milktea-v1-20261008/)。

### 3. 协议 — AI 智能体通信（新）

MCP 兼容的开放智能体通信协议。见 [protocol/README.md](protocol/README.md)。

## 仓库结构

```
eeo/
├── protocol/          EEO 协议规范与参考实现
├── datasets/          注册表分片（Releases 分发）、精选种子、手工卡片
├── tools/             数据管线：采集、清洗、审查、索引、品牌页
├── lib/               统计内核与裁判层
├── standards/         行业分类法、测量题板、EEO 标准
├── snapshots/         冻结测量快照与打分结果
├── web/               目录站 Web UI（Vite, React）
├── platform/          认领验证（CI）与盖章
├── mcp/               MCP 服务器
├── extension/         Chrome MV3 快检扩展
├── action/            GitHub Action
├── core.cjs           共享审计引擎
├── cli.cjs            批量命令行
├── server.cjs         自托管版
├── eeo-local.html     单文件审计工具
├── docs/              标准与文档
└── test/              123 项单元测试
```

## 快速开始

```bash
git clone https://github.com/Hiteater-wzm/eeo.git
cd eeo
node tools/fetch-registry.cjs
node cli.cjs check 蜜雪冰城 --industry 餐饮
```

零依赖 Node 18+（web/ 构建用 Vite 除外）。

## 测量

```bash
node tools/panel-build.cjs --industry 餐饮 --category 奶茶 --brands A B C --out standards/panels/tea-v1.json
node tools/snapshot-run.cjs standards/panels/tea-v1.json --samples 5
node tools/judge.cjs snapshots/<目录> --judges id1,id2
node tools/score-snapshot.cjs snapshots/<目录>
```

## 参与方式

- 品牌方：按 [platform/README.md](platform/README.md) 走域名验证认领
- 开发者：[CONTRIBUTING.md](CONTRIBUTING.md)
- AI 代理：读 [README-AI.md](README-AI.md)

## 制作说明

本仓库的代码、文档与数据管线在 AI 协助下生成，经维护者复核后发布。

## 许可

代码 Apache 2.0；标准文本与分类法 CC BY 4.0；数据卡 Wikidata 来源 CC0、人工采集 Apache-2.0。

Copyright 2026 信阳市浉河区清白软件工作室
