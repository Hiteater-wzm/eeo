# EEO（中文版）

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-18%2B-339933)

本文件是 [README.md](README.md)（英文正本）的中文译本；面向 AI 代理的仓库全图见 [README-AI.md](README-AI.md)。

EEO 是一个开放基础设施项目：一个协议，两层基础设施。

## 协议

**EEO 协议**（[protocol/](protocol/)）定义 AI 智能体如何注册身份、声明能力并记录可审计的交互。MCP 兼容。

| 组件 | 回答的问题 | 状态 |
|---|---|---|
| 智能体身份卡 | 这个智能体是谁？ | 规范草案 |
| 能力清单 | 它能做什么？ | 编写中 |
| 审计链 | 它做了什么？ | 编写中 |

## 基础设施

协议运行在两层已投产的基础设施上：

### 注册表 — 身份锚

收录 1,542,995 张 `eeo.brand.v1` 架构的组织卡，覆盖 172 个国家与地区，42,373 张带 LEI 法人码背书。卡片格式、域名验证认领、多轮 AI 审查管线——智能体身份卡直接继承这三套机制。

注册表分片通过 [GitHub Releases](https://github.com/Hiteater-wzm/eeo/releases) 分发，克隆后执行 `node tools/fetch-registry.cjs` 下载。

### 测量 — 行为评估

固定题板、冻结快照、冻结数据上的字节级可复现打分。双引擎采样、双裁判立场裁决（kappa 0.909）、Wilson 置信区间、改写稳健可见率、Bradley-Terry 排名。首份快照：[snapshots/panel-milktea-v1-20261008](snapshots/panel-milktea-v1-20261008/)。

目录数据渐进加载（约 190 MB），索引优化在计划中。

## 仓库结构

```
eeo/
├── protocol/          EEO 协议规范
│   └── spec/          智能体身份卡规范（草案）
├── datasets/          注册表分片（Releases 分发）、精选种子、手工卡片
├── tools/             数据管线
├── lib/               统计内核与裁判层
├── standards/         行业分类法、测量题板、EEO 标准
├── snapshots/         已发布测量快照
├── web/               目录站 Web UI
├── platform/          认领验证与盖章
├── mcp/               MCP 服务器
├── extension/         Chrome 扩展
├── action/            GitHub Action
├── core.cjs           共享审计引擎
├── cli.cjs            命令行
├── server.cjs         自托管版
├── eeo-local.html     单文件审计工具
├── examples/          示例报告
├── watch/             定时监测运行时目录
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

## 参与方式

- AI 代理与工具：读 [协议规范](protocol/spec/00-overview.md) 和 [README-AI.md](README-AI.md)
- 品牌方：[platform/README.md](platform/README.md)
- 开发者：[CONTRIBUTING.md](CONTRIBUTING.md)

## 制作说明

本仓库的代码、文档与数据管线在 AI 协助下生成，经维护者复核后发布。

## 许可

代码 Apache 2.0；标准文本与分类法 CC BY 4.0；数据卡 Wikidata 来源 CC0、人工采集 Apache-2.0。

Copyright 2026 信阳市浉河区清白软件工作室
