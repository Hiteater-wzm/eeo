# 品牌认领（GitHub PR 版）

这是 EEO 品牌库的认领通道，运行在 GitHub Actions 上：没有服务器，没有数据库，每一次认领都是一条公开可查的 PR 记录。你在一个 PR 里声明认领自己的条目，CI 会去你的官网根目录抓一个验证文件，核验通过后合并，认领即生效。机制对应 [docs/eeo-standard.md](../docs/eeo-standard.md) 第 1.3 节的"先收录后认领"。

## 认领流程（品牌方视角）

```
fork 仓库 ──► 改自己条目的 claim 字段 ──► 官网根目录放验证文件 ──► 提 PR
                                                                     │
              合并后 finalize Action 盖章 ◄── 维护者合并 ◄── Claim verify 自动核验 ◄─┘
              (status → claimed)
```

**第 0 步：确认前提**

- 你的品牌条目已收录在本仓库 `datasets/` 下（还没收录？先按 [CONTRIBUTING](../CONTRIBUTING.md) 提交条目）
- 你有一个能往根目录上传文件的官网
- 你有一个 GitHub 账号

**第 1 步：Fork 本仓库**

页面右上角 Fork，得到你自己的副本。

**第 2 步：修改你的品牌卡**

在 fork 里找到你的条目：先在目录站（https://hiteater-wzm.github.io/eeo/ ）搜到品牌，按其 Wikidata QID 在 `datasets/registry/part-*.jsonl` 里定位那一行（精选种子品牌也可能在 `datasets/brands-1k.json`），把 `claim` 改成：

```json
"claim": {
  "status": "claiming",
  "domain": "example.com",
  "token": "8f3k2q9v"
}
```

- `domain`：填一个你能控制根目录的域名，必须与卡内 `website` 同域（`www.example.com` 和 `example.com` 都行）
- `token`：自己定一串字符，6–64 位，只能用字母、数字、中划线、下划线
- 这次 PR 只改 `claim` 字段。同时改动其他字段会拖慢维护者的人工复核，信息更新等认领成功后另提 PR，历史更清楚

**第 3 步：在官网根目录放验证文件**

文件名 `eeo-claim-{token}.txt`，内容写上品牌名即可，比如：

```
星桥编程
```

上传后确认这个地址能公开访问、且内容和你卡里的 `name` 一字不差：

```
https://example.com/eeo-claim-8f3k2q9v.txt
```

**第 4 步：提 PR**

向你 fork 之外的本仓库 `main` 分支提 PR，标题建议 `claim: 星桥编程`。

**第 5 步：等 CI 核验**

PR 打开后，Claim verify 会自动运行，几分钟内把结果评论在你的 PR 上：

- 全是 ✅：等维护者点合并
- 有 ❌：按评论里的原因修。常见三种——验证文件没放在根目录、文件内容与卡内 `name` 不一致、`claim.domain` 与 `website` 不同源。修完往 PR 再 push 一个 commit，核验自动重跑

**第 6 步：合并生效**

维护者合并后，Claim finalize 自动把你的条目改成 `status: "claimed"`，写入认领时间和方法。这次合并就是认领的公开凭证，任何人都查得到。

**第 7 步：收尾**

验证文件在官网保留 90 天，期间平台会不定期复查，之后可以删除。

## 给维护者

- 在 Settings → Branches 把 **Claim verify / verify** 设为 required status check，否则未通过核验的认领也能被合并。
- Claim finalize 用 `GITHUB_TOKEN` 直接 push 主分支。主分支若开了 branch protection，确认规则没有拦住 Actions 的推送，否则认领条目会停在 `claiming` 状态（此时手工把 `status` 改为 `claimed` 补录即可）。
- 认领核验只验证域名控制权。PR 里对**其他品牌**条目或非 claim 字段的改动不在自动核验范围内，合并前照常看 diff。
- 本地自测两个脚本（不联网）：

```bash
node platform/claim-verify.cjs --self-test
node platform/claim-verify.cjs path/to/card.json        # 手动核验某张卡
node platform/claim-finalize.cjs path/to/card.json      # 手动盖章（提交前看清楚 diff）
```

## 常见问题

**没有官网怎么办？**
提 issue，标题 `manual claim: 品牌名`，附营业执照照片和联系邮箱，走人工审核通道，通过后 `claim.method` 记为 `manual-review`。本页面这套自动流程只服务有官网的主体。

**token 被别人看到了有事吗？**
没事。验证的是域名控制权：这串 token 只对"能放进你官网根目录的人"有意义，别人拿去放在他自己官网不产生任何效果。

**能不能跳过验证，直接把 status 写成 claimed？**
不能，CI 会直接拒绝。`claimed` 只能由合并后的 finalize Action 盖章，这正是认领可信的原因。

**一个 PR 能认领几个品牌？**
可以，每张 `claiming` 状态的卡都会被逐一核验，全部通过才算通过。

**合并后我在哪里看到结果？**
本仓库 `datasets/` 里你的条目 `claim` 字段已变为 `claimed`；PR 本身及其 CI 日志就是完整记录。

**为什么要保留验证文件 90 天？**
防止认领后域名易主时出现归属混乱。复查不通过时，条目会被退回未认领状态并公示。

## Claiming your brand entry (English)

1. Fork this repository.
2. In your fork, find your brand card — look up its Wikidata QID in the directory site (https://hiteater-wzm.github.io/eeo/), locate that line under `datasets/registry/part-*.jsonl` (curated seed brands may sit in `datasets/brands-1k.json`), and set `claim` to `{"status": "claiming", "domain": "example.com", "token": "8f3k2q9v"}`. The domain must belong to the same site as the card's `website`; the token is a string of 6–64 characters (`A-Z a-z 0-9 - _`) chosen by you. Change nothing else in this PR.
3. Upload `eeo-claim-{token}.txt` to the root of your official website. The file must be publicly reachable and contain your brand name exactly as it appears in the card's `name`.
4. Open a pull request against `main` (title like `claim: BrandName`).
5. The "Claim verify" workflow fetches `https://{domain}/eeo-claim-{token}.txt` and posts the result as a PR comment. Fix any ❌ items and push a new commit to re-run.
6. On merge, "Claim finalize" sets `claim.status` to `claimed`, records `claimedAt` and `method: "domain-file"`, and commits that back to `main`. The merged PR is the public proof of the claim.
7. Keep the verification file online for 90 days for spot re-checks.

No website? Open an issue titled `manual claim: BrandName` with your business license for manual review (`claim.method: "manual-review"`).

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `platform/claim-verify.cjs` | PR 核验脚本：字段检查、SSRF 防护、抓取验证文件（零依赖） |
| `platform/claim-finalize.cjs` | 合并后盖章脚本：`claiming` → `claimed`（零依赖） |
| `.github/workflows/claim-verify.yml` | PR 打开/更新时触发核验并评论结果 |
| `.github/workflows/claim-finalize.yml` | PR 合并后触发盖章并回写主分支 |
