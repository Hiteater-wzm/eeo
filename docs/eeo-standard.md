# EEO 标准倡议（EEO Standard Initiative）

版本：v0.1（草案）
发起：信阳市浉河区清白软件工作室 · 2026 年 10 月
状态：公开征求意见

---

## 零、为什么需要这个标准

生成式 AI 正在成为消费决策的新入口。当买家向 AI 询问“哪家靠谱”时，AI 的回答直接影响客户流向。围绕这一入口出现了被称为 SEO / AEO / GEO / LLMO 的多种优化实践，但行业整体处于无规范状态：

- 大量服务以黑箱方式交付，客户无法验证效果
- 部分从业者以“保证 AI 推荐”为卖点进行虚假承诺
- 存在批量生成虚假内容操纵模型判断的行为（俗称“投毒”）
- 品牌的基础信息（名称、定位、优势）缺乏统一的机器可读描述源，各服务商各自杜撰，加剧模型认知混乱

本倡议提出两份规范：**品牌信息规范**（让品牌有一份标准化的、经官方认领的机器可读信息卡）与**服务商公约**（让 EEO 服务的交付有可核查的行为底线）。二者合称 EEO 标准。

EEO（Everything Engine Optimization，全引擎优化）为本倡议提出的统称。

---

## 一、EEO 品牌信息规范（Brand Profile Specification）

### 1.1 目的

定义一份结构化、机器可读、经品牌方官方认领的品牌信息卡。任何 EEO 服务商、任何 AI 引擎均可自由读取。品牌信息的唯一权威来源是品牌方本人，而非服务商的转述。

### 1.2 数据结构（JSON Schema 概要）

```json
{
  "schema": "eeo.brand.v1",
  "name": "品牌名（必填，与营业执照或门店招牌一致）",
  "aliases": ["别名、曾用名、常见简称"],
  "legalName": "法定主体全称（选填）",
  "website": "官网地址（必填，用于认领验证）",
  "industry": "所在行业",
  "city": "所在城市",
  "description": "客观业务描述，一到两句，不含评价性用语",
  "advantages": ["可验证的事实性优势，每条须可溯源"],
  "founded": "成立年份（选填）",
  "claim": {
    "status": "unclaimed | claimed",
    "method": "domain-file | manual-review",
    "claimedAt": "认领时间",
    "history": ["历次信息修改记录，公开可查"]
  },
  "sources": ["信息来源 URL 列表，未认领条目必填"],
  "confidence": "未认领条目的信息置信度 high | medium | low",
  "traits": ["认领后勾选的行业特质标签，引用 standards/taxonomy/ 对应行业文件中的 trait id，见 1.2.1"],
  "faq_answers": ["认领后逐题作答的行业 FAQ，引用同文件中的 faq id，见 1.2.1"]
}
```

### 1.2.1 扩展字段：特质标签（traits）与常见问答（faq_answers）

这两个字段让品牌间的对比从自由文本变成结构化事实。行业标签库与题库由社区共建，存放在 `standards/taxonomy/`，每个行业一个文件（schema `eeo.taxonomy.v1`）。

**traits**：数组，每项 `{"id": "trait id", "note": "一句事实说明（选填）"}`。

```json
"traits": [
  { "id": "offline_campus", "note": "成都 3 个直营校区" },
  { "id": "small_class", "note": "常规班 4-6 人" }
]
```

- `id` 只能引用本行业分类法文件中已存在的 trait id，平台侧校验，不收自由填空
- 标注 `select: "one"` 的特质组（如班型、价格带）内最多勾一项
- 特质标签本身须是可证实或证伪的事实性选项（"1 对 1""全程冷链"），不收录"领先""匠心"类评价性用语——这条同时约束分类法的收录标准与品牌方的 note 文案

**faq_answers**：数组，每项 `{"id": "faq id", "answer": "事实性回答", "updated": "YYYY-MM-DD"}`。

```json
"faq_answers": [
  {
    "id": "trial_class",
    "answer": "有。每周六上午 10 点，60 分钟，授课老师上，官网或电话均可预约。",
    "updated": "2026-10-05"
  }
]
```

- 题目来自分类法中的买家视角 FAQ 题库（分购买决策、服务细节、风险保障三组），品牌方只作答，不出题
- 答案须为可核查的事实表述（数字、时限、渠道），不使用"以实际情况为准"类无效回答；填答完成的问答随品牌卡发布，并可拼装为 JSON-LD FAQPage 供引擎抓取
- 两字段的修改与 `advantages` 一样计入 `claim.history` 公开修订记录

**未认领条目这两个字段必须为空。**聚合初稿可以写 description，但不得代品牌方勾特质、代品牌方答题——这是"品牌信息的唯一权威来源是品牌方本人"原则的延伸。

### 1.3 收录与认领规则（先收录后认领）

**收录（平台侧）**
- 平台可从公开渠道聚合生成品牌条目初稿，加快覆盖
- 未认领条目必须：标注信息来源（`sources` 必填）、标注置信度、**不得收录任何评价性字段**（评分、口碑、排名类内容）
- 未认领条目必须提供纠错与删除申请入口；收到有效申请后应在合理时限内处理

**认领（品牌方侧）**
- 认领采用**官网验证文件机制**：平台生成专属验证文件（如 `eeo-claim-{token}.txt`），品牌方将其置于官网根目录，平台抓取核验通过即完成认领
- 无官网主体可采用营业执照人工审核通道
- 认领后品牌方获得该条目的编辑权；仅可编辑本品牌的客观信息
- 认领后的每次修改保留公开历史记录，防止信息被反复篡改

### 1.4 使用规则

- 品牌信息卡以 JSON-LD 等开放格式发布，任何 AI 引擎、服务商、研究者在遵守来源署名的前提下可自由抓取与引用
- 引用未认领条目时须同时呈现其置信度
- 任何使用方不得将品牌信息卡内容篡改为评价性表述后归源于本规范

---

## 二、EEO 服务商公约（Provider Pact）

### 2.1 五条底线

签署本公约的服务商承诺：

1. **过程透明**：向客户出示工作清单——在哪些平台、发布了什么内容、每月明细，均可核查
2. **效果可验证（两层复现）**：效果结论须可被开放工具（如 EEO Audit）复现复测，不使用无法复现的私有“后台数据”作为唯一证据。复现分两层定义：**测量层**——对已发布的引擎快照（冻结语料），任何人都可用开放工具重算并得到一致分数，此为强制要求；**采样层**——模型输出具有随机性，单次采样只能作为观察，跨时间快照的对比必须给出区间与趋势，不得以单次单点分数作为结论
3. **不承诺保证引用**：模型记忆与排序机制不受任何第三方控制，凡以“保证被某 AI 推荐”“保证排名”为卖点的承诺均属违规
4. **不投毒**：不批量生成虚假评价、虚构事实或以其他欺骗性内容操纵模型判断；内容中的事实性信息须经客户确认可溯源
5. **不做负向攻击**：不提供任何针对竞争对手的贬损、抹黑或试图使模型“遗忘”竞品的服务

### 2.2 徽章与名录机制

- 认同公约的服务商可申请列入公开名录，获得编号与“遵循 EEO 公约”徽章
- 名录为**自声明制**：列入即视为承诺受公约约束
- 违反公约的行为一经核实，名录公示并除名
- 本公约不收取任何费用，不构成对服务质量的担保，仅约束签署者的行为承诺

### 2.3 对客户的建议

选择 EEO 服务商时建议核查三点：是否愿意公开工作过程；是否承诺“保证推荐”（凡承诺者应直接排除）；是否支持用开放工具独立复测效果。

---

## 三、治理与演进

- 本规范当前由发起方维护，版本号随修订递增
- 任何人均可提交修订建议（issue 或邮件），重大修订公示后生效
- 未来条件成熟时过渡至社区共治

## 四、许可

本规范文本以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.zh) 发布，允许任意转载与引用，须署名“EEO 标准倡议”并附本页链接。规范中定义的 JSON Schema 结构可自由用于任何软件，无授权限制。

---

*EEO 标准倡议 · v0.1 草案 · 2026-10*
*发起：信阳市浉河区清白软件工作室*


---

# EEO Standard Initiative (English Summary)

Version: v0.1 (draft) · Initiated by Xinyang Shihe Qingbai Software Studio · October 2026

## Why a standard

Generative AI is becoming the new front door of consumer decisions. The practices around it (SEO, AEO, GEO, LLMO) currently operate without norms: black-box deliverables, unverifiable claims, "guaranteed AI recommendation" promises, and bulk content poisoning. Brand information itself has no unified machine-readable source, so each vendor improvises, which worsens model confusion.

The EEO Standard Initiative proposes two specifications.

## 1. Brand Profile Specification

A structured, machine-readable brand card whose authority comes from the brand itself, not from vendors' paraphrasing.

Core fields (abridged): `name`, `aliases`, `website` (used for claiming), `industry`, `city`, `description` (objective statements only), `advantages` (each must be verifiable), `claim.status` (`unclaimed | claimed`), `claim.method` (`domain-file | manual-review`), `sources[]` and `confidence` (mandatory for unclaimed entries).

Two extension fields defined in section 1.2.1: `traits` (factual capability tags picked from the community-maintained per-industry taxonomy in `standards/taxonomy/`; mutually exclusive single-select groups such as class size or price band make brands directly comparable) and `faq_answers` (per-question factual answers to the buyer-side FAQ template; groups follow the buyer journey — decision, service, risk). Both must remain empty on unclaimed entries: aggregation pipelines do not speak for brands.

Index-then-claim model. The platform may aggregate public information to create unclaimed draft entries, which must carry sources, a confidence level, no evaluative fields, and a correction/removal channel. A brand claims its entry by placing a verification file (e.g. `eeo-claim-{token}.txt`) at its official website root; the platform fetches and verifies it. Entities without a website may use a manual business-license review channel. Post-claim edits keep a public revision history.

The cards are published in open formats (JSON-LD). Any AI engine, vendor, or researcher may crawl and cite them with attribution. Citing an unclaimed entry requires presenting its confidence level together.

## 2. Provider Pact

Five conduct rules for EEO service providers:

1. Transparent process: platforms, content, and monthly work logs are disclosable to clients
2. Verifiable outcomes: conclusions must be reproducible with open tools; private "backend data" is not sole evidence
3. No guaranteed-placement promises: no one controls model memory or ranking; any "guaranteed recommendation" claim violates the pact
4. No poisoning: no bulk fabricated reviews, invented facts, or deceptive content aimed at manipulating models
5. No negative attacks: no services targeting competitors with defamation or "model erasure" attempts

Compliance is self-declared: providers may join a public registry, receive a numbered badge, and face public delisting upon verified violations. No fees, no quality warranty; conduct commitments only.

## Governance

Currently maintained by the initiator. Revision proposals are open to anyone; material revisions take effect after public notice. Community governance as conditions mature.

## License

This specification text is published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The JSON Schema it defines is free for any use without restriction.
