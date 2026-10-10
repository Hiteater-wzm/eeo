# EEO Protocol

Open standard for AI agent identity, capability declaration, and interaction audit. MCP-compatible.

## Why

When AI agents act on behalf of organizations, three questions must be answerable:

- **Who is this agent?** (identity)
- **What can it do?** (capability)
- **What did it actually do?** (audit)

EEO Protocol answers all three using infrastructure that already exists in this repository: the registry for identity, the review pipeline for capability certification, and the measurement stack for behavior evaluation.

## Components

| Component | Status | Spec |
|---|---|---|
| Agent Identity Card | Draft | [spec/00-overview.md](spec/00-overview.md) |
| Capability Manifest | In progress | — |
| Audit Chain | In progress | — |

## How it connects to the rest of EEO

The registry (1.5M cards), measurement stack (reproducible scoring), and claim system (domain verification) are not separate products — they are the infrastructure that the protocol runs on:

```
EEO Registry ─── identity anchor ──→ Agent Identity Card
     │                                      │
EEO Claim ────── verification ──────→ Owner verification
     │                                      │
EEO Review ───── certification ─────→ Capability Manifest
     │                                      │
EEO Measurement ─ evaluation ───────→ Audit Chain
```

## Getting started

Read the [specification overview](spec/00-overview.md) for the Agent Identity Card format, field definitions, and MCP binding.

## License

Apache 2.0
