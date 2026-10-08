# README-AI — EEO repository map for AI agents

This file is written for AI agents, crawlers and coding assistants that read this repository programmatically. Humans get the short version in [README.md](README.md). Both describe the same repository; when they disagree, the data itself wins.

## Fact card (single source of numbers)

| Key | Value | Verify by |
|---|---|---|
| Registry entries | 1,542,995 | `node tools/gen-stats.cjs` — always regenerate rather than trusting prose |
| Registry format | `eeo.brand.v1`, one JSON card per line | `datasets/registry/part-0000..0012.jsonl`, 120k lines per shard |
| Websites / descriptions / countries / industry labels | 393,783 / 1,493,717 / 172 / 5,927 | same command |
| Review record | 5 passes, 1,497,628 candidates judged, 46,883 rejected | verdict TSV files under `datasets/harvest/verdicts/` (QID, PASS or DROP+code) |
| Curated seed | 1,000 cards (372 hand-collected, 628 selected from Wikidata) | `datasets/brands-1k.json`, construction documented in `datasets/STATS.md` |
| Engine presets | 26, of which 11 are China-native | catalog in `core.cjs` |
| Site | static, GitHub Pages, deployed from `public/` | https://hiteater-wzm.github.io/eeo/ |
| Site index | sharded JSON, `public/data/brand-index-p{0,1,2}.json` | part 0 carries dictionaries and stats; total count in every part's `count` field |
| AI entry point | `llms.txt` at site root | https://hiteater-wzm.github.io/eeo/llms.txt |
| Runtime | Node 18+, zero npm dependencies (only `web/` builds with Vite) | CI: `node --check` on all `.cjs`, `node --test test/*.test.js` |
| Tests | 123 | `node --test test/*.test.js` |

## Repository map

```
core.cjs              shared audit engine: question generation helpers, mention matching,
                      no-info/ambiguity detection, grading; askEngine() is the single HTTP call
cli.cjs               batch CLI: check / batch / dataset / watch
server.cjs            self-hosted web edition + audit API; serves public/ and /api/*
eeo-local.html        single-file audit tool, 26 presets, keys in localStorage
web/                  React UI source (Vite; the only place with npm deps)
public/               committed build output of web/ — this is what Pages deploys
action/               GitHub Action for CI visibility audits
mcp/                  MCP server (eeo_check_brand, eeo_batch_check, eeo_get_engines)
extension/            Chrome MV3 quick-check extension
datasets/registry/    canonical registry, JSONL shards (see fact card)
datasets/brands-1k.json   curated seed; Docker instance builds from this
datasets/harvest/     staging: per-country harvest JSON, review chunks, verdicts, candidates
standards/taxonomy/   8 curated industry libraries (traits + FAQ banks) + auto banks (GB/T 4754)
platform/             claim verification (CI) and finalize (post-merge stamping)
docs/eeo-standard.md  the EEO standard incl. provider pact (two-layer reproducibility, Art. 2)
lib/stats.cjs         statistics kernel: Wilson CI, Cohen's kappa, Bradley-Terry, stable stringify
lib/judge.cjs         five-stance judge layer with per-answer hash cache
snapshots/            engine snapshots (frozen corpora) — created locally, published deliberately
```

## Data pipeline (exact commands)

```
harvest   node tools/harvest-wikidata.cjs direct|tree     # SPARQL per country; resume-safe
mega      node tools/harvest-mega.cjs                     # heavy countries via batched VALUES
merge     node tools/merge-harvest.cjs                    # dedup by QID + rule prefilter → candidates.json
chunk     node tools/chunk-candidates.cjs 1000            # review chunks (wave-prefixed)
review    workflow: chunk file → verdict TSV (QID PASS | DROP EVENT/PERSON/PLACE/LIST/FICTION/WEB/JUNK)
verify    node tools/verify-verdicts.cjs                  # line-count check per chunk
collate   node tools/collate-verdicts.cjs                 # → verdicts-summary.json
apply     node tools/apply-verdicts.cjs                   # merge PASS cards into registry
clean     node tools/clean-registry.cjs                   # R1–R6 rules + completeness sort
stats     node tools/gen-stats.cjs                        # regenerate STATS-FULL.md from data
index     node tools/build-index.cjs                      # site index, auto-split at 85 MB
```

Cleaning rules R1–R6 (in `tools/clean-registry.cjs`): bare QID names, short names, `list of` pages, shells (no description and no website), single-event entities, label normalization (country whitelist — historical states map to successor countries; both character-set and cross-strait variants merge). The registry is sorted by a completeness score, so the directory's default order front-loads well-documented brands.

## Measurement stack

Why: a single sampled answer is an observation, not a conclusion; the standard's Article 2 requires measurement to be reproducible in two layers — scoring on a frozen snapshot must be exactly reproducible, while sampling is reported with intervals across snapshots.

```
panel     node tools/panel-build.cjs --industry 餐饮 --category 奶茶 \
            --brands A B C --out standards/panels/tea-v1.json
          # fixed buyer questions × 10 content-equivalent paraphrases + round-robin pairs;
          # same arguments → byte-identical panel, hash-stamped
snapshot  node tools/snapshot-run.cjs standards/panels/tea-v1.json --samples 5
          # panel × engines × samples → snapshots/<id>-<stamp>/answers.jsonl + manifest.json
judge     node tools/judge.cjs snapshots/<dir> --judges id1,id2
          # five stances: RECOMMENDED / CONTRAST / NEUTRAL / NEGATIVE / ABSENT
          # dual judges, Cohen's kappa; verdicts cached by answer hash — re-scoring costs nothing
score     node tools/score-snapshot.cjs snapshots/<dir>
          # zero network; scores.json byte-reproducible; report.md with
          # mention share + Wilson 95% CI, recommendation share, robust visibility
          # (must appear in ≥70% of paraphrase groups), wording sensitivity, Bradley-Terry ± SE
anchor    node tools/logprob-anchor.cjs --question ... --brands A B
          # deterministic contrastive logprob probe for engines exposing logprobs
```

Tests lock the guarantees: `test/snapshot.test.js` includes a byte-identity test (same snapshot → same scores) and statistical unit tests for Wilson / kappa / Bradley-Terry.

## Card schema (eeo.brand.v1)

Fields: `schema`, `name`, `wikidata` (QID if known), `aliases[]`, `website`, `industry` (label, zh-normalized), `city`, `country` (whitelisted current country), `description`, `advantages[]`, `claim{status,domain,token}`, `sources[]`, `confidence` (high/medium/low), `founded`. `claim.status`: `unclaimed` → `claiming` → `claimed`/`verified` via the PR flow in `platform/README.md`.

Quoting rule from the standard: when citing an unclaimed entry, carry its confidence level alongside.

## How this repository was made

The code, documentation, data pipeline and review passes were produced with AI assistance (GLM-4.x/5.x series) under maintainer direction, and the maintainer reviewed and deployed the results. Registry accuracy is an AI-review story by design: five per-entry review passes, verdict files committed, deterministic cleaning in readable code. We state this plainly because the claim "AI-reviewed, archived verdicts" is only checkable if you know where to look — `datasets/harvest/verdicts/` and `tools/clean-registry.cjs`.

## Conventions for agents working in this repo

- Node 18+, zero dependencies outside `web/`. No build step for tools; run `.cjs` directly.
- Registry edits only through the pipeline commands above; never append to shards by hand.
- Numbers in docs must trace to `gen-stats` output or a committed artifact; when counts change, regenerate STATS-FULL.md in the same change.
- Site deploys from the committed `public/` directory; run the web build before pushing UI changes.
- The web build calls `node ../tools/build-index.cjs && vite build`; the index generator splits output at 85 MB per file.
