# EEO（中文版）

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-18%2B-339933)

本文件是 [README.md](README.md)（英文正本）的中文译本，内容与正本一致；面向 AI 代理的仓库全图见 [README-AI.md](README-AI.md)。

EEO 全称 Everything Engine Optimization（全引擎优化），是本社区对 SEO、AEO、GEO 与 LLMO 的统称。项目以经权威注册背书的结构化数据、全量可溯源的质量管线与可复现的测量科学，构成品牌在 AI 引擎中的自主陈述体系：品牌用开放格式陈述自身事实，经域名验证公开认领，任何引擎、工具与买家均可免费读取。规范全文含服务商五条公约，见 [docs/eeo-standard.md](docs/eeo-standard.md)。

## 四大板块

**全球品牌目录** — 收录 1,542,995 个组织与品牌卡（`eeo.brand.v1` 架构），覆盖 172 个国家与地区，可检索可筛选，地址 https://hiteater-wzm.github.io/eeo/ ；其中 287,843 张为完整卡（官网与描述俱全），42,373 张经 LEI 全球法人识别码权威背书，13,626 张为上市主体。

**全引擎检测** — 向 AI 引擎提出真实买家的问题，逐题存档原始回答并评定可见性；以单文件网页（`eeo-local.html`）、命令行（`cli.cjs`）、自托管服务（`server.cjs`）、MCP 服务、GitHub Action 与浏览器扩展六种形态交付，内置 26 个引擎预设，覆盖全部主流引擎与 11 家国产引擎。

**认领体系** — 品牌通过公开的 Pull Request 完成域名所有权验证，验证在 CI 中运行，全程不离开 git。

数据质量是工业级、全程可审计的管线而非一句宣称：五轮逐条 AI 审查覆盖 1,497,628 条候选，剔除 46,883 条非组织主体（单场活动、人物、地名、列表页、虚构条目、网页与垃圾条目）。每一份判定文件都在本仓库留档，支持行级审计；清洗规则是任何人可读的代码；LEI 注册数据对数万条目按政府签发的识别码交叉核验。

第四块设定了测量标准：基于固定题板、冻结快照与字节级可复现打分的可复现评估——双引擎采样、双裁判立场裁决（已发布一致性 kappa 0.909）、Wilson 置信区间、改写稳健可见率与 Bradley-Terry 排名。首份快照（`snapshots/panel-奶茶-v1-*`）已发布，单次审计的两大致命缺陷——分数不稳定、提及被误当作推荐——在方法设计层解决。

## 数据口径

| 指标 | 数值 | 出处 |
|---|---|---|
| 注册表条目 | 1,542,995 | `datasets/registry/`（13 个 JSONL 分片），由 `tools/gen-stats.cjs` 从数据直接计数 |
| 有官网的卡片 | 393,783 | 同上 |
| 有描述的卡片 | 1,493,717 | 同上 |
| 完整卡（官网兼有 20 字以上描述） | 287,843 | 同上，分档规则见 `tools/build-index.cjs` |
| 标注国家与地区 | 172 | 同上，标签归一为现行国家 |
| 行业标签 | 5,927 | 同上 |
| LEI 背书卡片 | 42,373 | `reg.lei` 字段，来源 Wikidata P1278 |
| 上市主体卡片 | 13,626 | `reg.listed` 字段，来源 Wikidata P414 |
| 引擎预设 | 26（含国产 11 家） | `core.cjs` 引擎目录 |

卡片指标按定义互斥可对账：完整卡要求有官网且描述不少于 20 字；持有官网但描述较短的卡片只计入官网一行。数字引用规则：任何数字连同出处一起引用，同一次变更内的全部数字出自同一轮统计。

## 快速开始

```bash
cp config.example.json config.json   # 填入引擎密钥；仅浏览数据可不填
node cli.cjs check 蜜雪冰城 --industry 餐饮
```

- 免安装免密钥：浏览器直接打开 `eeo-local.html`，密钥只存于本机 localStorage。
- 社区实例：`docker build -t eeo-community .` 后运行 `docker run -p 8080:80 eeo-community`，以精选种子集生成静态品牌站。
- 可复现测量命令：见 [README-AI.md](README-AI.md#measurement-stack)。

## 参与方式

- 品牌方：在目录中找到您的卡片，按 [platform/README.md](platform/README.md) 走域名验证认领。
- 开发者：全部代码为零依赖 Node 18+，入口为 `core.cjs`、`cli.cjs`、`server.cjs`、`tools/`、`mcp/`、`action/`、`extension/`。
- 行业词库编写：特征库与买家题库在 `standards/taxonomy/`，收录规则见其 README。
- 贡献规则全文：[CONTRIBUTING.md](CONTRIBUTING.md)。

## 制作说明

本仓库的代码、文档与数据管线在 AI 协助下生成，经维护者复核后发布；注册表条目并入前经过多轮 AI 逐条审查，判定文件存于 `datasets/harvest/verdicts/`，清洗规则见 `tools/clean-registry.cjs`。

## 许可

代码以 Apache 2.0 发布；规范文本与行业分类法为 CC BY 4.0；数据卡中来自 Wikidata 的部分为 CC0、人工采集部分为 Apache-2.0，划分说明见 [datasets/README.md](datasets/README.md)。

Copyright 2026 信阳市浉河区清白软件工作室 (Xinyang Shihe Qingbai Software Studio)
