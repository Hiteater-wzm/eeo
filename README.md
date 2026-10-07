# EEO

An open community where brands state their own facts for AI engines to read.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-18%2B-339933)

EEO stands for *Everything Engine Optimization* — this community's umbrella term for SEO, AEO, GEO and LLMO. The Chinese edition of this readme is [README.zh.md](README.zh.md); the machine-oriented repository map for AI agents is [README-AI.md](README-AI.md).

## What is here

When a buyer asks an AI for a recommendation the answer is assembled from what the model has read, and the brand's own statement rarely reaches the model in structured form. This community works at the source: brands state their facts in an open format, prove domain ownership through a public pull request, and any engine, tool or buyer can read the result for free. The standard behind all of it, including a five-rule conduct pact for optimization providers, is [docs/eeo-standard.md](docs/eeo-standard.md).

1. **Brand directory** — 1,542,575 organization and brand cards following the `eeo.brand.v1` schema, browsable and searchable at https://hiteater-wzm.github.io/eeo/ ; cards are quality-graded (287,506 full cards with website and real description; 1,221,296 standard; 33,773 stubs) and 42,373 carry LEI registry codes as third-party verification
2. **Audit tooling** — asks AI engines the questions buyers ask, keeps every original answer and grades visibility; ships as a single file (`eeo-local.html`), a CLI (`cli.cjs`), a self-hosted server (`server.cjs`), an MCP server, a GitHub Action and a browser extension, with 26 engine presets of which 11 are China-native
3. **Claim system** — domain verification runs in CI on a public pull request; nothing leaves git

Accuracy is enforced by review rather than assertion: five passes of per-entry AI judgment covered 1,497,628 candidates and rejected 46,883 non-organizations (single events, persons, places, list pages, fiction, web pages and junk). Every verdict file is archived in this repository, and the deterministic cleaning rules are code anyone can read.

A fourth piece is under construction: reproducible measurement built on fixed question panels, frozen engine snapshots and byte-reproducible scoring, designed to answer the two objections against single-shot audits — unstable scores and mention being mistaken for recommendation.

## Numbers

| What | Count | Source |
|---|---|---|
| Registry entries | 1,542,575 | `datasets/registry/` (13 JSONL shards), counted by `tools/gen-stats.cjs` |
| Entries with a website | 393,446 | same |
| Entries with a description | 1,493,297 | same |
| Countries/regions labeled | 170 | same; labels normalized to current countries |
| Industry labels | 6,137 | same |
| Curated seed set | 1,000 | `datasets/brands-1k.json` (372 hand-collected + 628 selected) |
| Engine presets | 26 (11 China-native) | `core.cjs` catalog |

House rule on numbers: a number is only quoted together with its source. `datasets/STATS-FULL.md` is regenerated from the live data after every merge and is the authoritative statement of registry statistics; `datasets/STATS.md` documents how the 1,000-card seed was constructed.

## Quick start

```bash
cp config.example.json config.json   # engine keys; browsing the data needs none
node cli.cjs check 蜜雪冰城 --industry 餐饮
```

- No install, no keys: open `eeo-local.html` in a browser; keys stay in the browser's localStorage.
- Community instance: `docker build -t eeo-community .` then `docker run -p 8080:80 eeo-community` serves a static brand site built from the 1,000-card seed.
- Reproducible measurement commands: [README-AI.md](README-AI.md#measurement-stack).

## Taking part

- Brands: find your card in the directory, then follow [platform/README.md](platform/README.md) to claim it through domain verification.
- Developers: everything runs on dependency-free Node 18+; entry points are `core.cjs`, `cli.cjs`, `server.cjs`, `tools/`, `mcp/`, `action/` and `extension/`.
- Taxonomy writers: trait libraries and buyer-question banks live in `standards/taxonomy/`, with acceptance rules in its README.
- Contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md).

## How this was made

The code, documentation and data pipeline in this repository were built with AI assistance and reviewed by the maintainer before release. Registry entries passed multiple rounds of per-entry AI review before merging; the verdict files are in `datasets/harvest/verdicts/` and the cleaning rules in `tools/clean-registry.cjs`.

## License

Code is released under the Apache License 2.0. The standard text in `docs/eeo-standard.md` and the taxonomy files in `standards/taxonomy/` are CC BY 4.0. Dataset cards: Wikidata-sourced cards are CC0, hand-collected cards are Apache-2.0, and the split is documented in [datasets/README.md](datasets/README.md).

Copyright 2026 信阳市浉河区清白软件工作室 (Xinyang Shihe Qingbai Software Studio)
