# EEO Protocol

An open protocol for AI agent communication, MCP-compatible. Specification in progress.

## Design

EEO Protocol extends MCP with three layers:

1. **Compatibility layer** — MCP-compatible layer. Existing MCP clients and servers interoperate without changes.
2. **Enhancement layer** — additions that MCP does not cover:
   - Agent identity registration (machine-readable identity cards, verifiable via the EEO registry)
   - Enterprise permission model (who may invoke which agent for what purpose)
   - Audit trail (every agent interaction logged with a cryptographic hash chain)
3. **Ecosystem layer** — cross-agent task delegation and settlement, compatible with Google's A2A.

## Status

Specification in progress. Reference implementation planned in Node.js (zero dependencies, same philosophy as the rest of EEO).

## License

Apache 2.0
