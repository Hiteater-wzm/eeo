# EEO 品牌信息站

这是 EEO 品牌信息库的静态发布，共 1000 个品牌，由 tools/gen-site.cjs 从品牌卡数据集生成。每个子目录是一个品牌的官方信息站。

## 目录约定

- `<slug>/index.html`：品牌信息页，人类访问的网页版
- `<slug>/<slug>.md`：同一页面的 Markdown 版，与 index.html 出自同一份品牌卡数据
- `<slug>/llms.txt` 与 `<slug>/brand.jsonld`：单品牌机器可读版本
- `llms.txt`：全量索引，每个品牌同时给 HTML 与 .md 两个链接
- `robots.txt`：AI 爬虫放行名单，附 Content Signals 用途指令（Search / AI-Input / AI-Train）

## 维护规则

- 本目录全部是生成产物，不要手改。要修正信息，改品牌卡 JSON 后重跑 node tools/gen-site.cjs <数据集> --out <目录>
- slug 由品牌名生成（中文保留，空格与特殊字符去除），同批次重名自动追加 -2、-3 后缀
- 数据结构遵循 EEO 品牌信息规范 eeo.brand.v1
- 自托管版 server.cjs 已内置内容协商：请求头 Accept 含 text/markdown 时，同一 URL 返回对应 .md
