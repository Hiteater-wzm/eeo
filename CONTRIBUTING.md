# Contributing

## Claim your brand / 认领你的品牌

English:

- If your brand already has a card in `datasets/`, you can claim it: fork the repo, set the card's `claim` to `{"status": "claiming", "domain": "...", "token": "..."}`, upload a verification file to your website root, and open a pull request. CI verifies the file and the merge finalizes the claim.
- The full walkthrough (field rules, file format, failure reasons, the no-website manual path) is in [platform/README.md](platform/README.md). The mechanism is section 1.3 of [docs/eeo-standard.md](docs/eeo-standard.md).

中文：

- 你的品牌若已收录在 `datasets/`，可以认领：fork 本仓库，把品牌卡的 `claim` 改为 `{"status": "claiming", "domain": "...", "token": "..."}`，往官网根目录上传验证文件后提 PR。CI 自动核验，合并即生效。
- 完整流程（字段规则、文件格式、失败原因、无官网的人工通道）见 [platform/README.md](platform/README.md)，机制对应 [docs/eeo-standard.md](docs/eeo-standard.md) 第 1.3 节。

## Brand data / 品牌数据

English:

- Submit new or corrected brand cards by pull request against `datasets/` (single cards) or the brand-registry data pipeline (large batches).
- Follow the `eeo.brand.v1` schema in [docs/eeo-standard.md](docs/eeo-standard.md). `name`, `website` and `description` are required.
- Unclaimed entries must carry a non-empty `sources` list (URLs you actually consulted) and a `confidence` level, and must not contain evaluative fields such as ratings, rankings or reputation claims.
- Verify the website resolves to the brand's official site before submitting.
- Descriptions state the business objectively in one or two sentences, without promotional wording.
- To report an error, open an issue with the brand name and the source that supports the correction.

中文：

- 新增或更正品牌信息卡，请向 `datasets/` 提交 pull request；大批量数据请走品牌库的数据管线。
- 格式遵循 [docs/eeo-standard.md](docs/eeo-standard.md) 的 `eeo.brand.v1`。`name`、`website`、`description` 必填。
- 未认领条目必须填写非空 `sources`（实际参考过的 URL）和 `confidence`，不得包含评分、排名、口碑等评价性字段。
- 提交前确认 website 可访问且归属该品牌。
- description 用一到两句客观描述业务，不写宣传用语。
- 纠错可提 issue，附品牌名与支撑修改的来源。

## Code / 代码

Pull requests are welcome for both the local edition (`eeo-local.html`) and the self-hosted edition (`server.cjs`, `web/`). Keep the backend zero-dependency and run `node --check server.cjs` before submitting.

## Engine presets / 引擎预设

English:

- The single-file edition ships a built-in engine catalog (the `CATALOG` array inside `eeo-local.html`). To propose a new preset, open an issue or PR with the endpoint URL, the default model id, and a link to the provider's API docs.
- Confirm the endpoint accepts browser-direct calls (CORS) before proposing it as a default-on engine; engines that only work through a proxy should say so in their `note`.
- The CLI, self-hosted server, and MCP server read engines from `config.json`, so any OpenAI-compatible endpoint (or `apiType: "anthropic"`) works there without code changes. See `config.example.json` for the field list.

中文：

- 单文件版内置引擎目录（`eeo-local.html` 里的 `CATALOG` 数组）。想新增预设，提 issue 或 PR，附端点 URL、默认模型名和官方 API 文档链接。
- 提为默认勾选的引擎，先确认端点允许浏览器直连（CORS）；只能走代理的引擎，在 `note` 里注明。
- CLI、自托管服务与 MCP 服务端的引擎读自 `config.json`，任何 OpenAI 兼容端点（或 `apiType: "anthropic"`）不改代码即可接入，字段见 `config.example.json`。

## Taxonomy / 品类特质分类法

English:

- Trait and FAQ contributions go to `standards/taxonomy/`, one JSON file per industry. Acceptance rules (factual, falsifiable, mutually exclusive within a group, buyer-side questions) are in [standards/taxonomy/README.md](standards/taxonomy/README.md).
- The easiest contribution to merge: add a newly seen industry spelling to a file's `industry_aliases`.

中文：

- 特质标签与 FAQ 题库向 `standards/taxonomy/` 提 PR，每个行业一个 JSON 文件。收录标准（事实性、可证伪、组内互斥、买家视角提问）见 [standards/taxonomy/README.md](standards/taxonomy/README.md)。
- 最容易合入的贡献：把新见到的行业写法补进对应文件的 `industry_aliases`。
