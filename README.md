# EEO

Open infrastructure for AI agent identity, visibility measurement, and trust. One protocol, two infrastructure layers.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-18%2B-339933)

## The protocol

**EEO Protocol** ([protocol/](protocol/)) defines how AI agents register identity, declare capabilities, and record auditable interactions. MCP-compatible. The specification is open and the reference implementation uses the same zero-dependency Node.js philosophy as the rest of this repository.

Three components:

| Component | What it answers | Status |
|---|---|---|
| Agent Identity Card | Who is this agent? | Spec draft |
| Capability Manifest | What can it do? | In progress |
| Audit Chain | What did it do? | In progress |

## The infrastructure

The protocol runs on two infrastructure layers that are already in production:

### Registry — identity anchor

1,542,995 machine-readable organization cards (`eeo.brand.v1` schema) across 172 countries. 42,373 cards carry LEI legal-entity verification. The card format, domain-verification claim system, and multi-pass AI review pipeline are the same mechanisms that agent identity cards inherit.

Registry data is distributed via [GitHub Releases](https://github.com/Hiteater-wzm/eeo/releases); run `node tools/fetch-registry.cjs` after cloning.

### Measurement — behavior evaluation

Fixed question panels, frozen engine snapshots, byte-reproducible scoring on frozen data. Dual-engine sampling, dual-judge stance adjudication (published agreement kappa 0.909), Wilson confidence intervals, paraphrase-robust visibility, Bradley-Terry rankings. First published snapshot: [snapshots/panel-milktea-v1-20261008](snapshots/panel-milktea-v1-20261008/).

The directory loads data progressively (first shard renders immediately, remaining shards load in background). Current total index size is ~190 MB; index optimization is on the roadmap.

## Repository layout

```
eeo/
├── protocol/          EEO Protocol specification
│   └── spec/          Agent Identity Card spec (draft)
├── datasets/          registry shards (via Releases), curated seed, handcrafted cards
├── tools/             data pipeline: harvest, clean, review, index, brand pages
├── lib/               statistics kernel and judge layer
├── standards/         industry taxonomy, measurement panels, EEO standard
├── snapshots/         published measurement snapshots with scores
├── web/               directory web UI (Vite, React)
├── platform/          claim verification (CI) and finalize
├── mcp/               MCP server for AI tool integration
├── extension/         Chrome MV3 quick-check extension
├── action/            GitHub Action for CI visibility audits
├── core.cjs           shared audit engine
├── cli.cjs            batch CLI
├── server.cjs         self-hosted web edition
├── eeo-local.html     single-file audit tool, no install
├── examples/          sample reports and claim files
├── watch/             runtime dir for scheduled monitors
├── docs/              standards and notes
└── test/              123 unit tests (node:test, zero dependencies)
```

## Quick start

```bash
git clone https://github.com/Hiteater-wzm/eeo.git
cd eeo
node tools/fetch-registry.cjs     # download registry shards from Releases
node cli.cjs check 蜜雪冰城 --industry 餐饮
```

No install, no npm dependencies (except `web/` which builds with Vite). Node 18+.

## Measurement

```bash
node tools/panel-build.cjs --industry 餐饮 --category 奶茶 --brands A B C --out standards/panels/tea-v1.json
node tools/snapshot-run.cjs standards/panels/tea-v1.json --samples 5
node tools/judge.cjs snapshots/<dir> --judges id1,id2
node tools/score-snapshot.cjs snapshots/<dir>
```

## Taking part

- Agents and AI tools: read the [protocol spec](protocol/spec/00-overview.md) and [README-AI.md](README-AI.md)
- Brands: claim your card via domain verification — [platform/README.md](platform/README.md)
- Developers: PRs welcome — [CONTRIBUTING.md](CONTRIBUTING.md)

## How this was made

The code, documentation and data pipeline were built with AI assistance and reviewed by the maintainer before release. Registry entries passed multiple rounds of per-entry AI review before merging; verdict files are in `datasets/harvest/verdicts/`.

## License

Code: Apache 2.0. Standard text and taxonomy: CC BY 4.0. Dataset cards: Wikidata-sourced CC0, hand-collected Apache-2.0.

Copyright 2026 Xinyang Shihe Qingbai Software Studio
