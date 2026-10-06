# EEO Audit MCP Server

把 EEO 品牌可见性检测接进 Claude Desktop、Cursor、Windsurf。AI 助手可以直接发起检测、读报告、对比多个品牌。
Add EEO brand-visibility audits to Claude Desktop, Cursor, or Windsurf. The assistant runs checks and reads the reports directly.

纯 Node 实现，零依赖，stdio 传输，需要 Node 18+。检测逻辑复用上层 `core.cjs`，引擎与密钥读 `eeo-open/config.json`。
Pure Node, zero dependencies, stdio transport, Node 18+. Audit logic comes from `core.cjs` one level up; engines and keys are read from `eeo-open/config.json`.

## 工具 / Tools

| 工具 | 作用 |
|---|---|
| `eeo_check_brand` | 单品牌完整检测。参数 `brand`（必填）、`industry`、`city`、`competitors`（逗号分隔）、`depth`（quick/standard/deep，默认 quick）。返回 S/A/B/C/D 评级、认知率、提及率、每引擎明细、AI 原话摘录、逐题标签 |
| `eeo_batch_check` | 批量检测，`brands` 数组最多 10 个，其余参数同上。返回每个品牌一行的汇总对比表 |
| `eeo_get_engines` | 列出 config.json 里的引擎（id/名称/模型/是否就绪），不返回密钥 |

`eeo_check_brand` 会真实调用每个引擎，quick 档约 3-6 分钟，standard/deep 更久，交给 AI 当异步任务跑；`eeo_batch_check` 的耗时按品牌数线性增加。
A full check makes real LLM calls per engine and takes minutes (quick: 3-6 min). Treat it as a background task; batch time scales with brand count.

## 密钥配置 / API keys

```bash
cd eeo-open
cp config.example.json config.json   # 填入你的引擎 API Key
```

- 密钥只留在本机 `config.json`（已在 .gitignore），MCP 的输出和日志不含密钥
- 支持 OpenAI 兼容接口与 Anthropic（`apiType: "anthropic"`），字段说明见 `config.example.json`
- 至少给一个引擎填入 key 才能跑检测，`eeo_get_engines` 可随时查就绪状态

Keys stay in your local `config.json` (already gitignored). MCP responses and logs never include them.

## Claude Desktop

配置文件位置：Windows `%APPDATA%\Claude\claude_desktop_config.json`，macOS `~/Library/Application Support/Claude/claude_desktop_config.json`。

```json
{
  "mcpServers": {
    "eeo-audit": {
      "command": "node",
      "args": ["/path/to/eeo-open/mcp/server.cjs"]
    }
  }
}
```

## Cursor / Windsurf

Cursor 写到项目级 `.cursor/mcp.json` 或全局 `~/.cursor/mcp.json`；Windsurf 写到 `~/.codeium/windsurf/mcp.json`。格式相同：

```json
{
  "mcpServers": {
    "eeo-audit": {
      "command": "node",
      "args": ["/path/to/eeo-open/mcp/server.cjs"]
    }
  }
}
```

Windows 下 `args` 里写正斜杠绝对路径（如 `"D:/eeo-open/mcp/server.cjs"`）或双反斜杠转义。
On Windows use forward slashes or escaped backslashes in `args`.

## 验证 / Smoke test

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' | node mcp/server.cjs
```

返回 `protocolVersion` 和 `serverInfo` 即为正常。装好后在 Claude Desktop 里说"用 eeo_check_brand 检测一下某某品牌"，它会先列引擎再开跑。
A reply containing `protocolVersion` and `serverInfo` means the server is alive.
