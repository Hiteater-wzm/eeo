# 品类特质分类法（Industry Trait Taxonomy）

每个行业两份清单：**特质标签库** 和 **FAQ 题库**。品牌认领品牌卡后，从本行业的标签库里勾选适用于自己的特质、逐题回答 FAQ。做完这一步，"这家品牌和那家有什么不一样"就不再是一段形容词，而是一排可以并排比对的结构化事实，任何 AI 引擎和比价工具都能直接读。

- 规范版本：`eeo.taxonomy.v1`
- 上游规范：[docs/eeo-standard.md](../../docs/eeo-standard.md) 1.2.1 节（品牌卡的 `traits` 与 `faq_answers` 字段）
- 许可：与主规范一致，CC BY 4.0

## 首批行业

| 文件 | 行业 | 特质数 | FAQ 数 | 数据集覆盖 |
|---|---|---:|---:|---|
| [education-coding.json](education-coding.json) | 少儿编程培训 | 23 | 22 | 教育 |
| [food-beverage.json](food-beverage.json) | 餐饮与食品饮料 | 30 | 23 | 食品产业、餐饮连锁、茶饮、酒类等 |
| [internet-tech.json](internet-tech.json) | 互联网与软件科技 | 24 | 21 | 软件产业、人工智能、信息技术等 |
| [consumer-electronics.json](consumer-electronics.json) | 消费电子与家电 | 26 | 20 | 消费电子、家电、计算机硬件等 |
| [automotive.json](automotive.json) | 汽车与出行 | 22 | 20 | 汽车制造、新能源汽车、两轮车 |
| [apparel-sports.json](apparel-sports.json) | 服装与运动户外 | 26 | 20 | 运动鞋服、服装、纺织 |
| [financial-services.json](financial-services.json) | 金融服务 | 24 | 21 | 银行、保险、支付、资管 |
| [healthcare.json](healthcare.json) | 医疗健康 | 28 | 21 | 制药、器械、医疗服务 |

行业选择依据 `datasets/brands-1k.json` 的 industry 字段分布。数据集里的行业名写法很杂（简体、繁体、英文都有，共 500 多种写法），每个文件用 `industry_aliases` 收录已知的同行业写法，工具可以拿它把品牌卡的 `industry` 字符串映射到分类法 id。这个列表不追求穷尽，缺了就补，见下文贡献规则。

## 文件结构

```json
{
  "schema": "eeo.taxonomy.v1",
  "id": "education-coding",
  "industry": "少儿编程培训",
  "industry_aliases": ["教育", "繼續教育"],
  "trait_groups": [
    { "id": "class_size", "label": "主力班型", "select": "one", "note": "按报名量最大的班型勾一项" }
  ],
  "traits": [
    { "id": "one_on_one", "group": "class_size", "label": "1 对 1", "description": "一名老师对一名学员" }
  ],
  "faq_groups": [
    { "id": "decision", "label": "购买决策" },
    { "id": "detail", "label": "服务细节" },
    { "id": "risk", "label": "风险保障" }
  ],
  "faqs": [
    { "id": "age_start", "group": "decision", "question": "几岁开始学编程合适？", "hint": "回答应给出建议起始年龄和理由" }
  ]
}
```

几个设计约定：

- **`select: "one" | "many"`**。`one` 的组内标签互斥（班型、价格带、定位档位），品牌只能勾一项；`many` 的组可勾多项，但组内标签之间也不允许语义重叠。这是"可对比"的来源：两个品牌能不能直接对比，取决于它们在同一组里各勾了什么。
- **特质只收事实性选项**。"1 对 1""全程冷链""价格公开"这类可以核实的写法收；"匠心""领先""一站式赋能"这类无法证伪的词不收。判定标准：这个特质能不能被一张照片、一份文件或一次到店体验直接证实或证伪。
- **FAQ 只收买家真会问的问题**。题库里没有"你们的核心优势是什么"这种题——那是品牌想说的，不是买家想问的。三个分组对应买家的三个心理阶段：掏钱前（购买决策）、掏钱后（服务细节）、出问题时（风险保障）。
- 每个 trait / faq 的 `id` 是英文小写 slug，全局唯一且一旦发布不再改名，品牌卡里引用的就是它。`label` 和 `description` 的措辞可以修正。

## 品牌方怎么用

1. 按 [docs/eeo-standard.md](../../docs/eeo-standard.md) 1.3 节认领品牌卡。
2. 编辑品牌卡，追加 `traits` 字段：从本行业文件里勾选 applicable 的标签，只填 id，可附一句事实说明：

```json
"traits": [
  { "id": "offline_campus", "note": "成都 3 个直营校区" },
  { "id": "small_class", "note": "常规班 4-6 人" }
]
```

3. `select: "one"` 的组最多勾一个；不 applicable 的组可以整个不勾（比如纯线上机构不勾"线下校区面授"）。
4. 特质只能引用本行业分类法里存在的 id。平台侧校验不通过的勾选会被拒绝——这不是自由填空，是从清单里选。
5. 追加 `faq_answers` 字段逐题作答：

```json
"faq_answers": [
  {
    "id": "trial_class",
    "answer": "有。每周六上午 10 点，60 分钟，授课老师上，官网或电话均可预约。",
    "updated": "2026-10-05"
  }
]
```

6. 答案要求与 `description` 一致：写事实，写数字，写时限。不写"以门店实际情况为准"这种等于没写的话。每题答案带 `updated` 日期，过期答案会被平台标灰提示复核。
7. 填答完成的 FAQ 会随品牌卡发布到品牌信息站，并可由平台拼装成 JSON-LD FAQPage（配合 `tools/gen-schema.cjs` 的既有 `faq` 输出）供搜索引擎和 AI 引擎抓取。

未认领条目的 `traits` 与 `faq_answers` 必须为空。聚合初稿不代品牌方表态，这是主规范"品牌方是品牌信息唯一权威来源"原则的延伸。

## 社区怎么贡献

**加特质、改措辞**：向对应行业文件提 pull request。要求：

- 事实性、可证伪，组内与其他标签互斥。收不收的判定标准见上节。
- `id` 用英文小写加下划线（`cold_chain`），不用拼音缩写。
- `description` 一句话讲完，不写宣传语。
- 同一行业文件内 `id` 不重复；跨行业允许合理复用（两个行业都有"官方延保"是正常的，各自维护）。
- PR 描述里说明这个特质对应买家真实会比较的一个维度，说不出比较场景的不收。

**加 FAQ**：同样提 PR。问题必须是买家视角的口语问法，收进哪个组按掏钱前、掏钱后、出问题时三段划分。每个行业控制在 25 题以内，超过就先合并语义相近的题。

**加新行业**：先开 issue 讨论再动手。新文件需要至少 20 个特质、15 题 FAQ、3 个以上特质组，并且 `industry_aliases` 能对上数据集或公开市场上的真实行业写法。文件名用英文小写加连字符（`home-decor.json`）。

**加 industry_aliases**：见到数据集或品牌卡里出现本行业的又一种写法，直接提 PR 补进对应文件的 `industry_aliases`，这是最没有争议、最欢迎的贡献。

## English Summary

Each industry gets two lists: a **trait vocabulary** and an **FAQ template**. After claiming its brand card, a brand checks the traits that apply to it and answers the FAQ questions one by one. Brand comparison then becomes a structured, machine-readable exercise instead of paragraphs of adjectives.

Design rules:

- Trait groups carry `select: "one" | "many"`. Groups marked `one` are mutually exclusive (class size, price band, positioning); a brand picks exactly one option there. That exclusivity is what makes two brands directly comparable on the same axis.
- Only factual, falsifiable traits are accepted ("1-on-1 teaching", "full cold chain", "public pricing"). Vague self-praise ("innovative", "leading") is rejected. Test: can a photo, a document, or one store visit prove or disprove it?
- FAQ questions are what buyers actually ask, grouped by the buyer's journey: before paying (decision), after paying (service), when things go wrong (risk). "What is your core advantage" is a brand's question, not a buyer's, and is excluded.
- Trait and FAQ ids are stable English slugs; brand cards reference ids, not labels, so wording fixes never break references.

How brands use it: claim the card, then append `traits` (id plus an optional factual note; at most one pick per `select: "one"` group) and `faq_answers` (id, factual answer, updated date) as defined in section 1.2.1 of the spec. Unclaimed entries must leave both fields empty — aggregation pipelines do not speak for brands.

How to contribute: PRs against the per-industry files follow the rules above (factual, mutually exclusive within a group, slug ids, one-sentence descriptions, PR text explains the comparison scenario the trait serves). New industries start with an issue, need 20+ traits, 15+ FAQs, 3+ groups, and real-world industry aliases. Adding newly seen `industry_aliases` spellings is the easiest and most welcome contribution.

License: CC BY 4.0, same as the parent specification.
