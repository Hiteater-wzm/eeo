# EEO

Open infrastructure for the AI era: verified registry data, reproducible measurement, and agent communication protocol.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-18%2B-339933)

EEO stands for *Everything Engine Optimization*. The project has three pillars:

## Pillars

### 1. Registry — open brand and organization data

1,542,995 machine-readable cards following the `eeo.brand.v1` schema across 172 countries and regions. 42,373 cards carry LEI global legal-entity codes as authoritative third-party verification. Browsable at https://hiteater-wzm.github.io/eeo/

Data pipeline: harvest → multi-pass AI review (verdicts archived, 1,497,628 candidates judged, 46,883 rejected) → deterministic cleaning → sharded JSONL registry. Registry shards are distributed via [GitHub Releases](https://github.com/Hiteater-wzm/eeo/releases); run `node tools/fetch-registry.cjs` after cloning.

### 2. Measurement — reproducible AI visibility evaluation

Fixed question panels, frozen engine snapshots, byte-reproducible scoring. Dual-engine sampling, dual-judge stance adjudication (published agreement kappa 0.909), Wilson confidence intervals, paraphrase-robust visibility, Bradley-Terry rankings. First published snapshot: `snapshots/panel-milktea-v1`.

### 3. Protocol — agent communication (new)

Open protocol for AI agent communication, built as a superset of MCP. See [protocol/README.md](protocol/README.md).

## Repository layout

```
eeo/
├── protocol/          EEO Protocol specification and reference implementation
├── datasets/          registry shards (via Releases), curated seed, handcrafted cards
├── tools/             data pipeline: harvest, clean, review, index, brand pages
├── lib/               statistics kernel and judge layer
├── standards/         industry taxonomy, measurement panels, EEO standard
├── snapshots/         frozen measurement snapshots with scores
├── web/               directory web UI (Vite, React)
├── platform/          claim verification (CI) and finalize
├── mcp/               MCP server for AI tool integration
├── extension/         Chrome MV3 quick-check extension
├── action/            GitHub Action for CI visibility audits
├── core.cjs           shared audit engine
├── cli.cjs            batch CLI
├── server.cjs         self-hosted web edition
├── eeo-local.html     single-file audit tool, no install
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

- Brands: claim your card via domain verification — [platform/README.md](platform/README.md)
- Developers: PRs welcome across the repo — [CONTRIBUTING.md](CONTRIBUTING.md)
- Agents and AI tools: read [README-AI.md](README-AI.md) for the full repository map

## How this was made

The code, documentation and data pipeline were built with AI assistance and reviewed by the maintainer before release. Registry entries passed multiple rounds of per-entry AI review before merging; verdict files are in `datasets/harvest/verdicts/`.

## License

Code: Apache 2.0. Standard text and taxonomy: CC BY 4.0. Dataset cards: Wikidata-sourced CC0, hand-collected Apache-2.0.

Copyright 2026 Xinyang Shihe Qingbai Software Studio
