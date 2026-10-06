# EEO 品牌数据集

## 全量注册表 registry/

`registry/part-NNNN.jsonl` 是注册表正本：1,542,575 张 `eeo.brand.v1` 品牌卡，每行一张，12 万行一片。来源为 Wikidata CC0 批量采集（200 个国家/地区，business 及其子类）加人工精选，采集与并入流程为 `tools/harvest-wikidata.cjs` → `tools/merge-harvest.cjs` → 逐条审查 → `tools/apply-verdicts.cjs` → `tools/clean-registry.cjs`（规则可复核）。准确性由 AI 多轮逐条审核把关：五轮累计判定 1,497,628 条候选，剔除 46,883 条非组织主体（单场活动、人物、地名、列表页、虚构条目、网站页面、无意义条目），每条判定文件全量留档可复核；另有确定性规则清洗（clean-registry 六条规则，代码可查）。统计由 `tools/gen-stats.cjs` 从当前数据直接计算，见 [STATS-FULL.md](STATS-FULL.md)。

引用接口与消费方式见下方字段说明，同样适用于分片数据（按行读取即可）。

## 精选种子集 brands-1k

`brands-1k.json` 收录 1,000 条品牌信息卡，字段遵循 EEO 品牌信息规范 `eeo.brand.v1`（定义见 [docs/eeo-standard.md](../docs/eeo-standard.md)）。其中 372 条来自逐条人工采集、官网已核实的三个专题文件，628 条选自 Wikidata 批次库的合格条目。全部条目的认领状态均为 `unclaimed`。

文件为 UTF-8 编码的 JSON 数组，每个对象一张品牌信息卡。

## 数据来源

| 来源 | 条数 | 说明 |
|---|---:|---|
| 人工采集 | 372 | 三个专题文件共 380 条：中国品牌 147 条、全球消费行业品牌 118 条、全球金融/医疗/电信/能源/工业品牌 115 条；8 个品牌在两个文件中重复，保留信息更全的版本。采集时逐一核实了品牌官网 |
| Wikidata 批次库 | 628 | 24 国 25 个批次文件共 67,604 条（瑞士分两批）。筛选、去重与国别配额的选取过程见 [STATS.md](STATS.md) |

Wikidata 的数据以 CC0 发布。每条数据的来源链接原样保留在该条的 `sources` 字段内。

## 字段定义

与 [docs/eeo-standard.md](../docs/eeo-standard.md) 1.2 节的 schema 对齐，另有一个扩展字段 `wikidata`。

| 字段 | 必填 | 说明 |
|---|---|---|
| schema | 是 | 固定为 `eeo.brand.v1` |
| name | 是 | 品牌名 |
| wikidata | 否 | Wikidata 实体 ID（扩展字段），仅 Wikidata 来源的条目携带 |
| aliases | 否 | 别名、曾用名、常见简称 |
| legalName | 否 | 法定主体全称，本版暂无条目使用 |
| website | 是 | 官网地址，认领验证依据此字段 |
| industry | 否 | 行业 |
| city | 否 | 所在城市，仅人工采集条目填写 |
| country | 否 | 国家/地区，仅人工采集条目填写；Wikidata 来源条目的国别归属见 STATS.md 的批次表 |
| founded | 否 | 成立年份，本版暂无条目填写 |
| description | 否 | 客观业务描述，一到两句 |
| advantages | 否 | 可验证的事实性优势，仅人工采集条目填写 |
| claim | 是 | 认领状态对象，本数据集全部为 `{"status": "unclaimed"}` |
| sources | 是 | 信息来源 URL 列表 |
| confidence | 是 | 置信度：`high` / `medium` / `low`。本数据集中 high 353 条、medium 647 条 |

## 使用许可

- Wikidata 来源的 628 条：随 Wikidata 以 [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.zh) 发布，可自由复制、修改、分发与商用。
- 人工采集的 372 条：随本仓库以 [Apache-2.0](../LICENSE) 发布。
- 两类条目的 `sources` 字段均原样保留，引用时建议一并保留来源链接。
- 按规范 1.4 节的使用规则：引用未认领条目时须同时呈现其置信度；不得将本数据集内容改写为评价性表述后归源于 EEO 标准。

## 怎么用

人工采集条目示例（原文取自数据集）：

```json
{
  "schema": "eeo.brand.v1",
  "name": "腾讯",
  "aliases": ["Tencent"],
  "website": "https://www.tencent.com",
  "industry": "互联网-综合互联网服务",
  "city": "深圳",
  "country": "中国",
  "description": "1998年成立于深圳，业务涵盖社交（微信、QQ）、网络游戏、数字内容、金融科技与企业服务，于香港交易所上市（0700.HK）。",
  "advantages": [
    "微信及WeChat合并月活跃账户数超过13亿",
    "2025年凯度BrandZ最具价值中国品牌榜首"
  ],
  "claim": { "status": "unclaimed" },
  "sources": [
    "https://www.tencent.com",
    "https://www.worldbrandlab.com/"
  ],
  "confidence": "high"
}
```

Wikidata 来源条目示例（`wikidata` 字段为扩展字段，`city`/`country`/`founded` 为空串）：

```json
{
  "schema": "eeo.brand.v1",
  "name": "7天酒店",
  "wikidata": "Q4643844",
  "aliases": ["7天连锁酒店集团"],
  "website": "http://www.7daysinn.cn/",
  "industry": "飯店",
  "city": "",
  "country": "",
  "founded": "",
  "description": "hotel chain headquartered in Guangzhou, China",
  "advantages": [],
  "claim": { "status": "unclaimed" },
  "sources": ["https://www.wikidata.org/wiki/Q4643844"],
  "confidence": "medium"
}
```

读取与筛选：

```python
import json

brands = json.load(open("datasets/brands-1k.json", encoding="utf-8"))
print(len(brands))                                  # 1000
cn = [b for b in brands if b["country"] == "中国"]   # 197 条（country 仅人工采集条目填写）
high = [b for b in brands if b["confidence"] == "high"]
```

数据集的原始库统计与构成明细见 [STATS.md](STATS.md)。

## 贡献新品牌数据

见 [CONTRIBUTING.md](../CONTRIBUTING.md)。要点：新条目按 `eeo.brand.v1` 格式提交 PR；`name`、`website`、`description` 必填；未认领条目必须携带 `sources` 与 `confidence`，不含评分、口碑、排名等评价性字段；提交前核实官网可访问且归属该品牌。

---

# EEO brand dataset

## Full registry: registry/

`registry/part-NNNN.jsonl` is the canonical registry: 1,542,575 `eeo.brand.v1` cards, one per line, 120k lines per shard. Sourced from Wikidata CC0 bulk harvests (200 countries, business and its subclasses) plus hand-collected entries; the pipeline is `tools/harvest-wikidata.cjs` → `tools/merge-harvest.cjs` → per-entry review → `tools/apply-verdicts.cjs` → `tools/clean-registry.cjs` (rules auditable). Accuracy is enforced by multiple rounds of per-entry AI review: five passes judged 1,497,628 candidates and rejected 46,883 non-organizations (single events, persons, places, list pages, fiction, web pages, junk), with every verdict file archived for auditing, on top of deterministic rule-based cleaning. Statistics are computed from the live data by `tools/gen-stats.cjs`; see [STATS-FULL.md](STATS-FULL.md).

The field reference below applies to the sharded registry as well (read it line by line).

## Curated seed: brands-1k

`brands-1k.json` holds 1,000 brand profile cards that follow the `eeo.brand.v1` schema defined in [docs/eeo-standard.md](../docs/eeo-standard.md). 372 cards come from three manually collected topic files whose official websites were verified one by one; 628 cards were selected from the qualified entries of a Wikidata batch library. Every card is unclaimed (`claim.status` is `unclaimed`).

The file is a UTF-8 JSON array; each element is one card.

## Sources

| Source | Cards | Notes |
|---|---:|---|
| Manual collection | 372 | Three topic files totaling 380 cards: China brands (147), global consumer-sector brands (118), and global finance, healthcare, telecom, energy and industrial brands (115). Eight brands appeared in two files; the fuller card was kept. Each official website was verified during collection |
| Wikidata batches | 628 | 67,604 raw rows in 25 batch files covering 24 countries (Switzerland was fetched in two batches). The filtering, deduplication and per-country quota steps are documented in [STATS.md](STATS.md) |

Wikidata data is published under CC0. Each card keeps its origin links verbatim in the `sources` field.

## Fields

Fields align with section 1.2 of [docs/eeo-standard.md](../docs/eeo-standard.md), plus one extension field `wikidata`.

| Field | Required | Notes |
|---|---|---|
| schema | yes | Always `eeo.brand.v1` |
| name | yes | Brand name |
| wikidata | no | Wikidata entity ID (extension field); present only on Wikidata-sourced cards |
| aliases | no | Alternative names and common short forms |
| legalName | no | Legal entity name; unused in this release |
| website | yes | Official site, used for claiming |
| industry | no | Industry |
| city | no | Filled on manually collected cards only |
| country | no | Filled on manually collected cards only; for Wikidata-sourced cards see the batch table in STATS.md |
| founded | no | Founding year; unused in this release |
| description | no | Objective business description in one or two sentences |
| advantages | no | Verifiable factual strengths; filled on manually collected cards only |
| claim | yes | Claim object; always `{"status": "unclaimed"}` in this release |
| sources | yes | Source URL list |
| confidence | yes | `high`, `medium` or `low`; 353 high and 647 medium in this release |

## License

- The 628 Wikidata-sourced cards follow Wikidata's [CC0](https://creativecommons.org/publicdomain/zero/1.0/): copy, modify and distribute freely, including commercially.
- The 372 manually collected cards are released under the repository's [Apache-2.0](../LICENSE) license.
- Keep the `sources` links when you redistribute cards.
- Per section 1.4 of the standard: present the confidence level whenever you cite an unclaimed card, and do not rewrite card content into evaluative statements attributed to the EEO standard.

## Usage

```python
import json

brands = json.load(open("datasets/brands-1k.json", encoding="utf-8"))
print(len(brands))                                   # 1000
high = [b for b in brands if b["confidence"] == "high"]
```

Raw library statistics and the composition of this release are in [STATS.md](STATS.md).

## Contributing brand data

See [CONTRIBUTING.md](../CONTRIBUTING.md). In short: follow the `eeo.brand.v1` schema, include `sources` and `confidence` for unclaimed entries, keep descriptions free of evaluative wording, and verify the official website before submitting.
