# EEO Audit 快检 浏览器插件

浏览任意网站 点插件图标 一键查这个品牌在 AI 回答里的可见性评级

- 识别当前标签页域名与品牌名（og:site_name 优先 其次页面标题 再次域名 可手改）
- 快速档 12 题 并行直问 DeepSeek 与 智谱 GLM
- 实时进度 每家引擎跑到第几题
- 报告含 S-D 大字母评级 综合分 品牌认知率 品类提及率 每引擎一行 AI 原话
- 最近 10 次检测历史 点开即回看完整报告
- 内置完整版 eeo-local 26 家引擎 逐题原文 底部一键打开

## 技术选型

纯 Chrome MV3 原生结构 零构建工具 直接加载

当初生态调研（docs/ecosystem-catalog.md）推荐 WXT 但 WXT 是构建期框架 wxt.config.ts 与 entrypoints/ 必须经过 npm 构建才能产出可加载目录 与本插件不引入 npm 包的约束冲突 所以退回原生 MV3 逻辑零差别 只是文件结构不走 WXT 约定

核心检测逻辑（coreWord / countHits / NOINFO_RE / AMBIG_RE / gradeOf / ask / pool / genQuestions / fallbackQuestions / analyze / extractSources）从 eeo-local.html 提取到 lib/eeo-core.js 与主项目保持算法同源 评级配色对齐 tools/gen-site.cjs 的 GRADE_STYLE

## 文件结构

```
extension/
  manifest.json          MV3 清单
  lib/eeo-core.js        共享核心逻辑 无 DOM 依赖 页面与 worker 共用
  background/
    background.js        服务 worker 引擎 API 调用 历史存储 站点信息汇总
  content/
    content.js           轻量内容脚本 上报 og:site_name 与标题 无界面
  popup/
    popup.html           弹窗结构 宽 360px
    popup.css            品牌样式 奶油白 黑黄 硬阴影 全直角
    popup.js             弹窗逻辑 本地 http 打开时走假数据演示
  full/
    eeo-local.html       内置完整版（CSP 适配副本 内联脚本已外置）
    eeo-local.js         完整版逻辑 末尾附 MV3 事件绑定适配段
  icons/                 16 48 128 图标
```

## 在 Chrome 里加载

1. 打开 chrome://extensions
2. 右上角打开开发者模式
3. 点加载已解压的扩展程序
4. 选本 extension 目录
5. 工具栏出现 EEO 图标 访问任意网站点图标即用

Edge 同理 edge://extensions → 开发人员模式 → 加载解压缩的扩展

## 使用

1. 首次点图标后先点右上角设置 填 DeepSeek 或智谱的 API Key（可只填一家 另一家自动跳过）
2. 逛到要查的网站 点图标 弹窗自动识别品牌名 可改
3. 点检测此品牌 等进度跑完 看评级
4. 弹窗中途关掉没关系 检测在后台继续 跑完自动进历史

## 密钥与隐私

- 密钥只存 chrome.storage.local 不外传 无任何遥测
- API 请求由后台服务 worker 直连引擎官方端点
- host_permissions 只申请 api.deepseek.com 与 open.bigmodel.cn 两个域

## 与上游同步

full/ 目录是 eeo-local.html 的副本 同步上游时重做两件事：

- 内联 script 外置为 eeo-local.js
- 去掉全部内联事件属性 由 eeo-local.js 末尾适配段统一绑定

其余文件与上游逐字一致
