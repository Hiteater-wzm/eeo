# EEO Agent Tools

REST API tools that plug into Dify, n8n, or any OpenAPI-compatible platform. Gives AI agents the ability to look up brands, check AI visibility, and query audit trails.

## Quick start

```bash
# 1. Start the tools API
node protocol/tools/api-server.cjs

# 2. Import into Dify
#    Dify → Tools → Custom → Create Tool
#    Paste the contents of protocol/tools/dify-schema.yaml
#    Set the server URL to http://localhost:3700
#    (optional) Set API key if you started with API_KEYS=xxx

# 3. Your Dify agent now has these tools:
#    - brandLookup: search 1.5M organization cards
#    - brandVisibility: AI visibility metrics with confidence intervals
#    - auditQuery: tamper-evident audit trail
#    - agentIdentity: this agent's identity card
```

## Enterprise deployment

```bash
# With authentication
API_KEYS=your-secret-key node protocol/tools/api-server.cjs

# With custom agent name
AGENT_NAME="Acme Corp Assistant" node protocol/tools/api-server.cjs

# Docker
docker run -p 3700:3700 -e API_KEYS=secret -e AGENT_NAME="Acme Agent" node:22-alpine \
  sh -c "git clone https://github.com/Hiteater-wzm/eeo.git /app && cd /app && node protocol/tools/api-server.cjs"
```

## API reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/api/v1/brand/lookup?name=xxx` | GET | Search brands in registry |
| `/api/v1/brand/visibility?brand=xxx` | GET | AI visibility metrics |
| `/api/v1/audit?limit=50` | GET | Audit trail |
| `/api/v1/agent/identity` | GET | Agent identity card |

## Authentication

Set `API_KEYS=key1,key2` environment variable. Clients pass `X-API-Key` header. Leave empty for no auth (development only).

## Audit

Every API call is appended to a SHA-256 hash chain (`data/tools-audit.jsonl`). The chain is tamper-evident: modifying any entry breaks the hash link to the next entry, which is detectable via the `/api/v1/audit` endpoint.
