# EEO（中文说明）

EEO 全称 Everything Engine Optimization（全引擎优化），是本社区对 SEO、AEO、GEO 与 LLMO 的统称，英文正本见 [README.md](README.md)，面向 AI 代理的仓库全图见 [README-AI.md](README-AI.md)。

买家向 AI 咨询购买建议时，答案由模型读过的第三方内容拼装而成，品牌自身的陈述很少以结构化形式到达模型，本社区从源头解决这一问题：品牌以开放格式陈述自身事实，经域名验证公开认领，任何引擎、工具与买家均可免费读取。规范全文含服务商五条公约，见 [docs/eeo-standard.md](docs/eeo-standard.md)。

## 四块成果

**品牌目录站**　收录 1,542,575 个品牌，正本为分片 JSONL，可检索可筛选，认领状态全量公开，由 GitHub Pages 托管，地址 https://hiteater-wzm.github.io/eeo/

**检测工具**　以单文件网页、命令行、自托管服务、MCP 服务、GitHub Action 与浏览器扩展六种形态提供，内置 26 个引擎预设（含国产引擎 11 家），逐题留存原始回答以备核对。

**品牌信息库**　数据准确性由 AI 多轮逐条审核把关，五轮累计判定 1,497,628 条候选，剔除 46,883 条非组织主体，单场活动、人物、地名、列表页、虚构条目、网页与无意义条目一律不入库；全部判定文件留档于 datasets/harvest/verdicts/，清洗规则为可读代码，见 tools/clean-registry.cjs。

**可复现测量**　建设中，以固定题板、冻结快照与字节级可复现打分构成，用于解决单次采样分数漂移以及提及不等于推荐这两个根本问题，完整命令见 README-AI.md。

## 数据口径

| 指标 | 数值 | 出处 |
|---|---|---|
| 注册表条目 | 1,542,575 | datasets/registry/（13 个 JSONL 分片），由 tools/gen-stats.cjs 从数据直接计数 |
| 有官网条目 | 393,446 | 同上 |
| 有描述条目 | 1,493,297 | 同上 |
| 标注国家/地区 | 170 | 同上，标签归一为现行国家 |
| 行业标签 | 6,137 | 同上 |
| 精选种子集 | 1,000 | datasets/brands-1k.json（人工采集 372 条加批量精选 628 条） |
| 引擎预设 | 26（含国产 11 家） | core.cjs 引擎目录 |

数字引用规则为任何数字必须连同出处一起引用，全库统计以 datasets/STATS-FULL.md 为准，该文件在每次并入后由脚本从数据重新生成，千条种子集的构成明细见 datasets/STATS.md。

## 上手

```bash
cp config.example.json config.json   # 填入引擎密钥，仅浏览数据可不填
node cli.cjs check 蜜雪冰城 --industry 餐饮
```

浏览器直接打开 eeo-local.html 即可免安装使用，密钥只存于本机 localStorage。社区实例经 `docker build -t eeo-community .` 与 `docker run -p 8080:80 eeo-community` 启动，以千条精选种子生成静态品牌站。

## 参与方式

品牌方在目录站找到条目后，按 [platform/README.md](platform/README.md) 走域名验证认领流程；开发者面向零依赖的 Node 18+ 代码库，入口为 core.cjs、cli.cjs、server.cjs、tools/、mcp/、action/ 与 extension/；行业词库编写入口在 standards/taxonomy/，收录规则见其 README。贡献规则全文见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 制作说明

本仓库的代码、文档与数据管线在 AI 协助下生成，经维护者复核后发布；注册表条目并入前经过多轮 AI 逐条审核，判定文件存于 datasets/harvest/verdicts/，清洗规则见 tools/clean-registry.cjs。

## 许可

代码以 Apache 2.0 发布，规范文本与行业分类法为 CC BY 4.0，数据卡中来自 Wikidata 的部分为 CC0、人工采集部分为 Apache-2.0，划分说明见 [datasets/README.md](datasets/README.md)。

Copyright 2026 信阳市浉河区清白软件工作室
