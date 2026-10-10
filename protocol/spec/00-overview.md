# EEO Protocol Specification

## Overview

EEO Protocol is an open standard for AI agent identity, capability declaration, and interaction audit. It is MCP-compatible: agents built on EEO Protocol interoperate with any MCP client or server without changes.

The protocol has three components:

1. **Agent Identity Card** — machine-readable identity for AI agents, extending the `eeo.brand.v1` card format already in production for 1.5M+ organizations
2. **Capability Manifest** — structured declaration of what an agent can do, what data it needs, and what constraints it operates under
3. **Audit Chain** — append-only interaction log with cryptographic hashing, enabling third-party verification of agent behavior

## Design principles

- **Zero dependencies** — reference implementation in plain Node.js, no npm packages required
- **MCP-compatible** — all EEO Protocol operations are expressible as MCP tools and resources
- **Registry-backed** — agent identities are anchored to the EEO registry, inheriting its verification and audit infrastructure
- **Byte-reproducible** — all protocol operations produce deterministic output for the same input

## Relationship to existing EEO infrastructure

The EEO registry and measurement stack are not separate products — they are the infrastructure layer for the protocol:

| Infrastructure component | Protocol role |
|---|---|
| Registry (1.5M organization cards) | Identity anchor: agent cards extend the card format |
| Domain verification (claim system) | Identity verification: agents prove ownership via the same mechanism |
| Review pipeline (multi-pass AI review) | Capability certification: agent manifests are reviewed before registration |
| Measurement stack (panels, snapshots, scoring) | Behavior evaluation: agent performance is scored on frozen benchmarks |
| LEI integration (42K verified entities) | Enterprise identity: corporate agents link to legal entity records |

## Current status

- Agent Identity Card: specification draft below
- Capability Manifest: specification in progress
- Audit Chain: specification in progress
- Reference implementation: planned

---

## Agent Identity Card (spec draft)

### Format

```json
{
  "schema": "eeo.agent.v1",
  "agent_id": "agt_8f3k2q9v",
  "name": "Customer Support Agent",
  "owner": {
    "type": "organization",
    "registry_card": "Q4650741",
    "verified": true
  },
  "capabilities": ["answer_questions", "lookup_orders", "escalate_to_human"],
  "constraints": {
    "data_access": ["orders_db_read"],
    "rate_limit": 100,
    "operating_hours": "24/7"
  },
  "public_key": "ed25519:...",
  "created": "2026-10-10",
  "claim": {
    "status": "unclaimed"
  }
}
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| schema | string | yes | Always `eeo.agent.v1` |
| agent_id | string | yes | Unique identifier, prefixed `agt_` |
| name | string | yes | Human-readable name |
| owner.type | string | yes | `organization` or `individual` |
| owner.registry_card | string | no | EEO registry QID if owner is an organization |
| owner.verified | boolean | yes | Whether owner identity is verified |
| capabilities | string[] | yes | What the agent can do |
| constraints | object | yes | Operational limits |
| public_key | string | yes | Ed25519 public key for signing |
| claim | object | yes | Same claim mechanism as brand cards |

### Verification

Agent identity is verified through the same domain-verification mechanism used for brand cards: the owner places a token file on their domain, and verification runs in CI. See `platform/README.md` for the existing implementation.

### MCP binding

An agent's identity card is exposed as an MCP resource:

```
Resource URI: eeo://agents/{agent_id}
MIME type: application/json
```

Capability invocation uses standard MCP tool calls. Constraints are enforced by the agent's MCP server implementation.
