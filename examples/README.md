# Examples · 示例

这个目录存放 EEO Audit 的示例产物，不运行工具也能看懂每类输出长什么样。

**所有示例数据为演示构造**。示例中出现的品牌（星桥编程、青梧家政、松塔编程、云梯科创、洁邻家政、暖居保洁、果冻编程）、域名、token 均为虚构；两份报告里的「AI 回答」是按真实引擎输出的样式手写的模拟文本，不是任何模型的真实返回。示例没有针对任何真实品牌做过检测。

## 文件清单

| 文件 | 内容 |
|---|---|
| report-grade-s.json | S 级检测报告（评级最好的一档） |
| report-grade-d.json | D 级检测报告（评级最低的一档） |
| brand-profile-card.json | 已认领品牌的 eeo.brand.v1 信息卡 |
| eeo-claim-example.txt | 官网认领验证文件的内容格式 |
| README.md | 本导读 |

## report-grade-s.json

一次「快速 12 题、双引擎（DeepSeek、智谱 GLM）」检测的完整报告，受测品牌为虚构的「星桥编程」（成都 · 少儿编程培训，竞品松塔编程、云梯科创）。结果：评级 S，综合 94 分，品牌认知率 88，品类提及率 100；12 题中 4 题问品牌、6 题问品类、2 题问场景，每题保留两个引擎的回答原文。报告中的分数、判定词、引用摘录均由 eeo-local.html 的 analyze() 原逻辑对手写回答计算得出，与真实导出逐项一致。

文件结构与 eeo-local.html 里点「导出 JSON」得到的文件相同（两者走同一个序列化路径），字段如下：

| 字段 | 内容 |
|---|---|
| job | 检测参数（品牌、城市、行业、竞品、深度、时间）与题目 |
| results | 各引擎计数：品牌认知 x/y、品类提及次数、竞品提及 comp |
| questions | 12 道题与各引擎回答原文（answers） |
| quotes | 「无实料」回答的原话摘录，最多 6 条 |
| labels | 每题 × 每引擎的判定词 |
| score | 综合评分、认知率、提及率、等级 |

复现方法：下载 ../eeo-local.html 用浏览器打开，引擎目录勾选 DeepSeek 与智谱 GLM 并填入密钥，填写任意品牌信息，深度选「快速」，跑完点「导出 JSON」。题目由引擎实时生成，回答与分数每次会有波动，文件结构不变。

## report-grade-d.json

同一套参数下「AI 完全不认识」的对照示例，受测品牌为虚构的「青梧家政」（郑州 · 家政服务，竞品洁邻家政、暖居保洁）。4 道品牌题在两个引擎上全部返回「没有相关信息」类回答，判定为无实料，前 6 条摘录进了 quotes；8 道品类与场景题里该品牌出现 0 次，竞品洁邻家政被提及多次。报告页「名称出现次数」一栏因此呈现品牌 0 次、竞品不为 0 的对比。分数与判定同样由 analyze() 原逻辑算出。复现方法同上；拿一个公开信息很少的品牌去测（刚注册的小微主体即可），更容易得到接近的结果。

## brand-profile-card.json

按 ../docs/eeo-standard.md 第 1.2 节数据结构手写的信息卡，演示「已认领」状态：claim.status 为 claimed，claim.method 为 domain-file（官网验证文件），claim.history 保留 5 条公开修改记录。规范要求 description 不含评价性用语、advantages 每条可溯源，示例按此书写。卡片还演示了 1.2.1 节的两个扩展字段：`traits` 从 `../standards/taxonomy/education-coding.json` 的标签库里勾选 12 项（含单选组「主力班型」的正确用法），`faq_answers` 逐题回答 5 题买家 FAQ。对应主项目 Roadmap 中的 EEO Brand Registry：注册中心上线后由平台生成并维护这类卡片，现阶段可作为自建品牌信息源的模板。

## eeo-claim-example.txt

认领验证文件的内容示例。机制：平台签发一次性 token，品牌方把 eeo-claim-{token}.txt 放到官网根目录，平台抓取比对通过即完成认领；无官网主体走营业执照人工审核。文件内含 6 行本体的格式、放置路径与核验流程说明。真实文件同样待 Registry 上线后由平台签发。

## 报告判读速查

- 判定词：品牌题为「有实料 / 无实料 / 未答」，品类与场景题为「提及 / 未提及 / 未答」
- 综合 = 品牌认知率 × 0.5 + 品类提及率 × 0.5；提及次数达到品类与场景题总量的 30% 即计满
- 等级线：S ≥ 80，A ≥ 60，B ≥ 40，C ≥ 15，D < 15
- 在页面上回看：eeo-local.html 目前没有报告导入功能；如需图形化查看这两份 JSON，可在打开 eeo-local.html 的浏览器控制台执行 renderReport(报告对象)。

# English

The files in this directory show the kinds of output EEO Audit produces, so you can read them without running a detection.

All sample data is constructed for this demo. The brands (星桥编程, 青梧家政, and all competitor names), domains, and tokens are fictional. The "AI answers" inside the two reports are hand-written imitations of engine output, not real model responses, and no real brand was audited.

- report-grade-s.json: a full report from a quick 12-question run on two engines (DeepSeek, Zhipu GLM) for the fictional brand 星桥编程 (Chengdu, kids coding training). Grade S, overall 94. The structure matches what the export JSON button in eeo-local.html produces. Fields: job (run parameters and questions), results (per-engine counts), questions (the 12 questions with each engine's answers), quotes (excerpts from no-substance answers), labels (per question and engine verdicts), score.
- report-grade-d.json: the opposite end. All four brand questions return "no information found" on both engines, the brand gets zero mentions in category and scenario questions, and a competitor is mentioned several times. Grade D.
- brand-profile-card.json: a claimed brand card following the eeo.brand.v1 schema in docs/eeo-standard.md, with claim method domain-file and a public edit history. It also demonstrates the two extension fields from section 1.2.1: `traits` (12 tags picked from the education-coding taxonomy) and `faq_answers` (5 answered buyer questions).
- eeo-claim-example.txt: what the website-root verification file for brand claiming looks like.

To reproduce a report: open eeo-local.html, enable DeepSeek and Zhipu GLM with your keys, fill in any brand, pick the quick depth, run, then export JSON. Questions are generated live and answers vary between runs, so scores fluctuate while the file structure stays the same.
