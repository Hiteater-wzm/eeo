# EEO Ecosystem Catalog

Open-source components and emerging standards surveyed for EEO's upcoming modules: the browser extension (one-click brand AI-visibility check on any site), `gen-schema` (typed structured-data output), the Brand Registry data pipeline, and the site technical-hygiene checks.

Star counts were pulled from the GitHub API on 2026-10-05. "Pushed" dates are the last push at survey time and are the honest signal of whether a project is alive.

---

## 1. Browser extension framework

The extension feature: browse any website, click once, get that brand's AI visibility report. This needs a popup, a content script that grabs the current domain/brand, and a background worker that calls the LLM engines (the same calls `eeo-local.html` already makes).

| Project | Stars | Status | One-liner |
|---|---:|---|---|
| [wxt-dev/wxt](https://github.com/wxt-dev/wxt) | 10,570 | Active (pushed 2026-10-04), MIT | Next-gen extension framework on Vite: HMR, auto-generated cross-browser manifests, unopinionated about UI |
| [PlasmoHQ/plasmo](https://github.com/PlasmoHQ/plasmo) | 13,161 | Active (pushed 2026-10-04), MIT | The older flagship; full framework with its own storage/messaging APIs, React-first |
| [crxjs/chrome-extension-tools](https://github.com/crxjs/chrome-extension-tools) | 4,177 | Active (pushed 2026-09-24) | Vite plugin that builds extensions with native HMR; a plugin, not a framework |
| [Jonghakseo/chrome-extension-boilerplate-react-vite](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite) | 4,905 | **Archived 2026-02-14** | The boilerplate everyone copy-pasted for years; now read-only |
| [lxieyang/chrome-extension-boilerplate-react](https://github.com/lxieyang/chrome-extension-boilerplate-react) | 3,929 | **Archived 2026-02** | The Webpack-era twin; also read-only |

**Recommendation: build on WXT.** The two classic React boilerplates were both archived in February 2026, which settles the "boilerplate vs framework" question by itself. WXT has the strongest dev velocity right now, and it does not care whether you write vanilla TS or React — which matters because EEO's existing UI is dependency-free hand-rolled HTML/JS, so the extension can reuse that code style instead of adopting a component stack just to satisfy a framework. Plasmo works too but imposes its own abstractions (`plasmo storage`, messaging, parcel-based build) that buy nothing for a three-surface extension (popup + content script + service worker). CRXJS is the fallback if we want to stay closer to plain Vite, but WXT is the safer bet for MV3 service-worker quirks and cross-browser packaging.

**Direct-integration value: high.** `npx wxt@latest init`, ship Chrome first, and the Firefox/Edge builds are essentially free.

---

## 2. Structured data validation (for gen-schema)

`tools/gen-site.cjs` already emits `brand.jsonld`. The gap: nothing today guarantees that JSON-LD is valid against the schema.org vocabulary before it ships. These are the pieces that close it.

| Project | Stars | Status | One-liner |
|---|---:|---|---|
| [google/schema-dts](https://github.com/google/schema-dts) | 1,245 | Active (pushed 2026-10-02), Apache-2.0 | TypeScript types for the entire schema.org vocabulary, generated from the official releases |
| [schemaorg/schemaorg](https://github.com/schemaorg/schemaorg) | 6,266 | Active (pushed 2026-10-01), Apache-2.0 | The vocabulary itself plus supporting software; what validator.schema.org runs on |
| [digitalbazaar/jsonld.js](https://github.com/digitalbazaar/jsonld.js) | 1,814 | Maintained (pushed 2026-03-04) | W3C JSON-LD processor in JS: parse, expand, compact, normalize |

Also checked: Google's Rich Results Test is a hosted product, not open source; several "JSON-LD checker" web tools floating in search results are closed SaaS.

**Recommendation: use schema-dts directly, borrow the rest.**

- **schema-dts — direct dependency.** Import `Organization` / `LocalBusiness` types in gen-schema and let the TypeScript compiler catch bad fields at build time. This is exactly what it was built for, it is Apache-2.0, and Google maintains it. Zero runtime cost in the generated site.
- **schemaorg repo — borrow.** Its release data files define which properties are expected on which types; gen-schema's lint warnings can be derived from them rather than hand-maintained.
- **jsonld.js — optional runtime check.** Only worth it if we want strict spec-level validation (expansion/compaction) inside the audit pipeline. Heavy for a tool that mostly emits a fixed card shape.

**Direct-integration value: high.** One `devDependency`, and every brand card's JSON-LD becomes compiler-checked before it lands in `datasets/` or a generated site.

---

## 3. AI-readable web formats beyond llms.txt

EEO already generates `llms.txt`. What else is hardening into a standard as of late 2026, and what should the generators emit next?

| Standard / project | Stars / status | One-liner |
|---|---|---|
| [AnswerDotAI/llms-txt](https://github.com/AnswerDotAI/llms-txt) | 2,648, active | The canonical llms.txt / llms-full.txt spec repo (Jeremy Howard, Answer.AI) |
| [openai/agents.md](https://github.com/openai/agents.md) | 24,769, active (pushed 2026-09-10) | Plain-markdown convention for telling coding agents how to work in a repo; adopted by Codex, Claude Code et al. |
| Cloudflare Markdown for Agents ("Docs for agents") | GA Feb 2026, not a repo | Edge converts HTML to Markdown when the request carries `Accept: text/markdown`; Mantine demonstrates the hand-rolled version (`curl -H "accept: text/markdown"` returns clean `.md`) |
| IETF AIPREF draft (Content Signals) | In standardization | Adds usage-intent directives to robots.txt — `search`, `ai-input`, `ai-train` — backed by Cloudflare and tied to EU AI Act Art. 53(1)(c) TDM opt-out |
| llms.txt ecosystem trackers (llms-txt-hub etc.) | 911 for the hub directory | Directories and validators growing around the spec |

Reality check worth keeping in the docs: Google has publicly said to skip llms.txt, and Chrome now surfaces it in audits. It costs nothing to emit, but EEO should not market it as the whole game — which matches our own stance that structured cards (JSON-LD) are the primary artifact.

**Recommendation:**

- **llms.txt + llms-full.txt — keep, track the spec repo.** Pin gen-llms output rules to AnswerDotAI/llms-txt; it is the reference everyone validates against (e.g. the `llms-txt-audit` PyPI CLI/GitHub Action validates title/summary/sections/link curation — worth listing as a CI check, small project, stars not verified).
- **Per-page Markdown — direct value.** Cloudflare's content negotiation cannot be done on pure static hosting (GitHub Pages), but the static equivalent is trivial: gen-site emitting `page.md` next to every `index.html`, plus an `Accept: text/markdown` branch in `server.cjs` for the self-hosted edition. This is the direction the ecosystem is moving; doing it now is cheap.
- **AGENTS.md — direct value, one afternoon.** EEO's own repo and every generated brand site's repo should carry an AGENTS.md; 24.7k stars and OpenAI/Anthropic backing make it the winning format for agent-facing repo docs.
- **AIPREF / Content Signals — adopt early in robots.txt generation.** gen-site's robots.txt already lists AI bots; adding the `search`/`ai-input`/`ai-train` usage-intent lines (opt-in by the brand, since EEO's default posture is "all AI bots allowed") positions the generated sites as standards-current.

**Direct-integration value: high.** Three concrete emitters to add: `page.md`, `AGENTS.md`, AIPREF-style robots.txt directives.

---

## 4. Open brand/company databases (registry pipelines)

The Brand Registry needs to grow beyond the current 1,000-card `brands-1k.json` (372 hand-collected + 628 from Wikidata batches). What other bulk pipelines exist with genuinely open terms?

| Source | Terms | One-liner |
|---|---|---|
| [GLEIF LEI Golden Copy](https://www.gleif.org/en/lei-data/access-and-use-lei-data) | CC0, daily bulk XML/CSV | ~3.4M legal entities worldwide with legal names, HQ country, status; the cleanest company-key dataset in existence |
| [UK Companies House](https://www.gov.uk/government/collections/companies-register-activities) | Open Government Licence, free bulk | Full UK register: basic company data, officers, persons with significant control |
| [SEC EDGAR](https://www.sec.gov/edgar/sec-api-documentation) | Public domain (US) | `company_tickers.json` + companyfacts/submissions APIs; every US-listed company with filings |
| OpenCorporates | ODbL-ish, bulk data is **paid**; "open registrations" program covers only some jurisdictions | The biggest aggregator, but the open part is the search UI, not the data you can bulk-load |
| OpenOwnership register | Open data | Beneficial-ownership (who ultimately owns what) for anti-anonymity use cases |
| "OpenBrand" (MCP tool) | Closed service | Not an open database at all — a logo/color extraction API riding the name. Not a pipeline. |

**Recommendation: GLEIF first, EDGAR second, keep Wikidata as the brand anchor.**

- **GLEIF — direct pipeline.** CC0 means zero licensing friction, and daily golden-copy files with deltas make refresh boring and reliable. Caveat to plan around: LEI records carry legal names and addresses, **not websites or brand names**, so GLEIF is the pipeline for `legalName` disambiguation and manual-review claiming support (exact legal-entity matching), not for bootstrapping brand cards with websites. Wikidata stays the best website-bearing source.
- **EDGAR — niche but free.** Fills `legalName`, ticker aliases, and industry (SIC) for US-listed companies; small script, permanent value.
- **Companies House — only if UK coverage matters.** Officers/PSC data is nice for the claim workflow (matching a claimed entity to a real registered company) but UK-scoped.
- **OpenCorporates — skip for bulk.** Their bulk access is a commercial product; scraping it (some search results literally advertise scrapers) violates their terms and is not a pipeline EEO should attach its name to.
- China note: the national enterprise credit-information system (国家企业信用信息公示系统) publishes no open bulk data; Chinese brands will keep coming from hand collection and Wikidata, which matches the current dataset's design (human-verified China files first).

**Direct-integration value: medium-high.** One `tools/gen-brands-gleif.cjs` that streams the golden copy and emits candidate cards with `confidence: low`, `sources` pointing at gleif.org, and no evaluative fields — exactly what the EEO standard's index-then-claim model prescribes.

---

## 5. Static-site AI-readiness scanners (technical hygiene checks)

EEO's site audit checks (robots.txt, llms.txt, schema, crawler access) should not be invented from scratch if a maintained open checklist already exists.

| Project | Stars | Status | One-liner |
|---|---:|---|---|
| [Auriti-Labs/geo-optimizer-skill](https://github.com/Auriti-Labs/geo-optimizer-skill) | 996 | Active (pushed 2026-09-30), MIT | Open-source AEO/GEO toolkit: 47 research-backed visibility checks, schema/llms.txt/robots.txt audits, citation checking via CLI, Python, and MCP |
| [firecrawl/llmstxt-generator](https://github.com/firecrawl/llmstxt-generator) | 536 | Idle (pushed 2025-06-17), **no license file** | Generates llms.txt/llms-full.txt by crawling a site; already credited in our README as inspiration |
| [OranAi-Ltd/orangeo-ai-visibility-skill](https://github.com/OranAi-Ltd/orangeo-ai-visibility-skill) | 137 | Maintained (pushed 2026-06-09), MIT | Agent-skill packaging of a first-mile audit: robots, llms.txt, schema, citation signals |
| llms-txt-audit (PyPI) | small, stars unverified | Active | CLI + GitHub Action validating llms.txt against the official spec |

Smaller items checked and dropped: `ai-search-readiness-kit` (1 star), various closed SaaS "readiness checkers".

**Recommendation: borrow the checklist from geo-optimizer-skill, don't import the code.**

- Its 47-check taxonomy (drawn from GEO research papers) is a ready-made rubric: cross-reference EEO's hygiene checks against it, adopt what fits static brand cards, cite it in the audit report page. That instantly makes EEO's checklist defensible instead of arbitrary.
- **firecrawl/llmstxt-generator has no license** — all rights reserved by default. Keep it as credited inspiration (as the README does) but copy no code from it.
- orangeo is interesting mainly as evidence that "audit as an agent skill" is a real distribution pattern — relevant later if EEO ships an MCP interface for the registry (the repo already has an `mcp/` folder).

**Direct-integration value: medium.** Checklist convergence plus one citation; possibly a shared test corpus of llms.txt samples.

---

## Top 5 Discoveries

1. **Both dominant React extension boilerplates were archived in Feb 2026** (Jonghakseo 4.9k, lxieyang 3.9k stars) — the extension module should start from **WXT** (10.6k stars, pushed yesterday), which also tolerates our no-framework UI code.
2. **Cloudflare Markdown for Agents (`Accept: text/markdown`)** — gen-site should emit a `.md` twin of every page now, and `server.cjs` can answer the header in ~20 lines; this is where AI content delivery is heading in 2026.
3. **GLEIF LEI Golden Copy: 3.4M legal entities, CC0, daily dumps** — the cleanest bulk pipeline into the Brand Registry for legal-name disambiguation and claiming, at zero licensing cost.
4. **Auriti-Labs/geo-optimizer-skill (996 stars) ships a 47-check research-backed audit rubric** — borrow the taxonomy for EEO's technical-hygiene scoring instead of hand-crafting one.
5. **IETF AIPREF / Content Signals (`search` / `ai-input` / `ai-train` robots.txt directives) is the emerging control layer** — adding these to gen-site's robots.txt output makes every generated brand site standards-current before the draft finalizes.

---

*Surveyed 2026-10-05. Stars verified against the GitHub API on the same day; archived status and last-push dates included where they change the verdict.*
