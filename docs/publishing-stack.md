# EEO Publishing Stack: Open Source Component Decisions

Date: 2026-10-05
Scope: components around `tools/gen-site.cjs` (the brand card to static site generator). gen-site itself stays a zero dependency Node script; everything below plugs into its output.

All star counts and last push dates below were pulled from the GitHub REST API (`api.github.com/repos/<owner>/<repo>`, fields `stargazers_count` and `pushed_at`) on 2026-10-05. Activity rule: at least one push within the last 6 months (cutoff 2026-04-05).

---

## 1. Static Search

### Candidates

| Project | Stars | Last push | One liner |
|---|---|---|---|
| FlexSearch (nextapps-de/flexsearch) | 13,805 | 2026-06-28 | Fastest in-memory JS full text search, embeds via npm/CDN, no server |
| Orama (oramasearch/orama) | 10,570 | 2026-10-03 | Search engine + RAG pipeline in ~2KB, full text / vector / hybrid |
| Lunr.js (olivernn/lunr.js) | 9,203 | 2024-07-31 | The classic client side search index, battle tested but dormant |
| MiniSearch (lucaong/minisearch) | 6,158 | 2025-09-16 | Small in-memory full text engine for browser and Node |
| Pagefind (Pagefind/pagefind) | 5,495 | 2026-10-01 | Post build static site indexer with bundled UI, chunked index, zero server |

Note: Pagefind moved from `CloudCannon/pagefind` to the `Pagefind/pagefind` org (API returns 301).

Rejected on activity: Lunr.js (no push since 2024-07) and MiniSearch (no push since 2025-09) both fail the 6 month rule despite healthy star counts.

### Pick: Pagefind

Why, given it is not the highest star option:

1. It indexes rendered HTML after the build. gen-site keeps emitting plain HTML and stays zero dependency. FlexSearch and Orama would require gen-site to also emit a JSON search corpus and to load a JS library that builds the index in the visitor's browser on every page view. Pagefind does the indexing work once, at build time, into static chunked files.
2. It ships a ready made UI (`pagefind-ui.js` + CSS) that mounts into hand written static HTML. The other candidates ship an index, not a UI.
3. Chinese support works out of the box. gen-site pages already emit `<html lang="zh-CN">`; Pagefind detects `zh` and segments with jieba-rs through the charabia tokenizer (the same stack Meilisearch uses). FlexSearch has a known issue where CJK input returns no results without a custom tokenizer (nextapps-de/flexsearch issue #167), and Orama splits on whitespace by default, so both would need us to write and maintain our own Chinese tokenizer.
4. Stars (5,495) are above the 1,000 line and the repo is active (push 2026-10-01).

Known caveat, documented honestly: some CJK users report rough edges, including one open issue about CJK indexes not splitting into chunks and one blog post (June 2026) where an author replaced Pagefind with Orama over segmentation quality. Mitigation for EEO: brand card pages are small (one page per brand), which is the easy case for chunking. Smoke test on a real dataset before rollout. Fallback if quality is unacceptable: Orama with a bigram tokenizer over a JSON corpus gen-site would emit.

### Integration

Index after each gen-site run:

```bash
node tools/gen-site.cjs datasets/brands-1k.json --out site/
npx pagefind --site site/
```

The second command writes `site/pagefind/` (index chunks + UI assets). It never touches the rest of the output. If language autodetection misbehaves, force it with `--language zh`.

Mount the UI in the root directory page (and optionally brand pages). Because assets live under `/pagefind/`, use root absolute paths so they resolve from `slug/index.html` subdirectories:

```html
<link href="/pagefind/pagefind-ui.css" rel="stylesheet">
<script src="/pagefind/pagefind-ui.js" defer></script>
<div id="search"></div>
<script>
  window.addEventListener('DOMContentLoaded', function () {
    new PagefindUI({ element: '#search', showImages: false, pageSize: 8 });
  });
</script>
```

Two notes for the gen-site author:

- `pagefind-ui.js` does not exist until the first indexing run. Either run the indexer in the same build script right after generation, or guard the mount so a fresh checkout without an index does not show a broken box.
- If indexing should cover only brand content (not the directory table), add `data-pagefind-body` to the `<article>` element in brand pages. One attribute, Pagefind ignores everything else.

---

## 2. llms.txt Tooling

### Candidates

| Project | Stars | Last push | One liner |
|---|---|---|---|
| AnswerDotAI/llms-txt | 2,648 | 2026-09-24 | The llms.txt proposal itself: spec, examples, FAQ |
| firecrawl/llmstxt-generator | 536 | 2025-06-17 | Scrapes a live site and generates llms.txt / llms-full.txt |
| dotenvx/llmstxt | 147 | 2026-03-05 | Converts sitemap.xml into llms.txt |
| aircodelabs/llms-txt-generator | 21 | 2025-06-18 | Node CLI that crawls a site into llms.txt |
| llms-txt-action (top hit) | 16 | 2025-08-07 | GitHub Action that generates llms.txt on deploy |

### Pick: none as a dependency; adopt AnswerDotAI/llms-txt as the format contract

There is no generator with both a healthy star count and recent activity. The only repo above 1,000 stars is the spec proposal, not a tool. The generators that exist either crawl live sites (wrong model for us: EEO owns the source data and can emit the file deterministically) or are stale and tiny.

So the decision is: gen-site already is the llms.txt generator. Its `buildLlms()` output already follows the spec shape (H1 name, blockquote summary, `- key: value` lists, `##` sections). Treat AnswerDotAI/llms-txt as the reference to check against when the format evolves, and do not import any runtime dependency for this.

### Integration

Keep `buildLlms()` as is. One recommended addition for batch mode: emit a root `llms.txt` that indexes the per brand files, matching the spec's "index of files" pattern:

```markdown
# EEO 品牌信息

> 机器可读的品牌信息目录，每个品牌一个子目录，均依据 eeo.brand.v1 规范生成

- [比亚迪](byd/llms.txt): 新能源汽车制造商
- [老干妈](laoganma/llms.txt): 调味食品企业
```

The index line per brand can reuse the same one line logic the HTML title uses (industry, else first sentence of description, else city). This is a pure gen-site change, no external code.

---

## 3. JSON-LD / Structured Data

### Candidates

| Project | Stars | Last push | One liner |
|---|---|---|---|
| google/schema-dts | 1,245 | 2026-10-02 | TypeScript definitions for the entire schema.org vocabulary, maintained under the Google org |
| api-platform/schema-generator | 474 | 2026-06-29 | Scaffolds PHP models from schema.org (wrong language for us) |

Nothing else in this space is above 500 stars or alive. `google/schema-dts-gen` (the codegen sibling) now 404s on the API. There is no high star runtime "JSON-LD builder" library; the ecosystem treats JSON-LD as data typed against schema.org, not as objects constructed by a library.

### Pick: google/schema-dts as the schema contract

gen-site's hand rolled `buildJsonLd()` stays the runtime: it emits a plain `Organization` object with a small fixed field map, which is exactly the right amount of code for this job. schema-dts earns its place as the compile time contract: it is the only complete, Google maintained, machine readable description of the schema.org vocabulary, and it lets a CI step prove that the emitted `brand.jsonld` stays inside the vocabulary as fields get added.

### Integration

Validation stays in CI, not in gen-site:

- Online check: paste a sample `brand.jsonld` into validator.schema.org or Google's Rich Results Test after any builder change. Cheap and authoritative.
- Compile time check once a TypeScript toolchain exists anywhere in the repo:

```bash
npm i -D schema-dts typescript
```

```ts
import type { Organization } from 'schema-dts';
const org: Organization = JSON.parse(fs.readFileSync('brand.jsonld', 'utf8'));
// type error here means the builder emitted a property outside schema.org
```

Rule of thumb for the gen-site author: when adding a field to `buildJsonLd()`, check its name against schema-dts's `Organization` type rather than inventing keys.

---

## 4. Documentation Frameworks (reference only, no selection)

Star ranking, GitHub API, 2026-10-05:

| Project | Stars | Last push |
|---|---|---|
| Docusaurus (facebook/docusaurus) | 66,398 | 2026-10-02 |
| Fumadocs (fuma-nama/fumadocs) | 13,290 | 2026-10-05 |
| Starlight (withastro/starlight) | 9,363 | 2026-10-03 |
| RsPress (web-infra-dev/rspress) | 2,339 | 2026-10-05 |

gen-site writes its own skeleton, so none gets adopted. UI references worth borrowing when the brand page layout matures: Fumadocs for search box placement and sticky TOC patterns, Starlight for plain readable long form page rhythm. Docusaurus and RsPress solve multi version doc suites, a problem EEO brand cards do not have.

---

## 5. OpenAPI Rendering (future API docs page)

### Candidates

| Project | Stars | Last push | One liner |
|---|---|---|---|
| Redoc (Redocly/redoc) | 25,942 | 2026-10-02 | The standard React based OpenAPI renderer, three panel layout |
| Scalar (scalar/scalar) | 16,223 | 2026-10-05 | Modern API reference with documented single tag standalone embed, ships weekly |

### Pick: Scalar

Both are active and above 10K stars; this is a close call decided on embed weight. Scalar's standalone mode is one script tag with the spec URL in a data attribute, and the project treats standalone embedding as a first class use case. Redoc's standalone works too but pulls a multi MB bundle per page load and Redocly's development energy has shifted toward their commercial platform. For a brand site that shows an API reference on one page only, and where everything else is hand written static HTML, the lighter embed wins. If the site later grows a full developer portal, revisit Redoc.

### Integration

Drop into any generated page that needs API docs (gen-site can emit this verbatim when a brand card carries an OpenAPI URL):

```html
<script id="api-reference" data-url="/api/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
```

For full offline control, self host: copy the built asset from the `@scalar/api-reference` npm package into the site and point the second script tag at it. No build step either way.

---

## 6. AI Chat Embed

### Candidates

| Project | Stars | Last push | One liner |
|---|---|---|---|
| LibreChat (LibreChat-AI/LibreChat) | 45,291 | 2026-10-05 | Full self hosted ChatGPT style platform, Node + MongoDB, multi user |
| DocsGPT (arc53/DocsGPT) | 18,314 | 2026-10-04 | Docs QA with an embeddable widget, needs a Python backend and vector store |
| deep-chat (OvidijusParsiunas/deep-chat) | 3,726 | 2026-10-04 | Customizable AI chat web component, one script tag, talks to any OpenAI compatible or custom HTTP endpoint |

### Pick: deep-chat

The requirement is a static page with a chat box, not a chat platform. LibreChat and DocsGPT both need a always on backend service (databases, auth, workers), which contradicts the static hosting model of the brand sites and adds real ops cost per brand. deep-chat is the only candidate that lives entirely in the page: it is a web component loaded from a CDN, configured in a few lines, and it calls whatever HTTP endpoint you point it at. 3,726 stars, active (push 2026-10-04), current version 2.5.1.

Hard rule that comes with this pick: a real API key must never ship inside static HTML. The endpoint the widget talks to should be a thin proxy (a Cloudflare Worker, a single serverless function) that holds the key, enforces rate limits, and forwards to the model API. The proxy is deploy config, not a dependency of gen-site.

### Integration

Load the component and wire it to the proxy:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/deep-chat@2/dist/deepChat.min.js"></script>
<deep-chat id="eeo-chat" style="border-radius: 0"></deep-chat>
<script type="module">
  const el = document.getElementById('eeo-chat');
  el.request = {
    url: 'https://chat-proxy.example.com/v1/chat',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ "text": "{message}" }'
  };
  el.response = (r) => ({ text: r.reply });
</script>
```

The `request` body uses deep-chat's `{message}` placeholder; `response` maps the proxy reply to what the widget renders. Check the request/response shapes against the deep-chat docs for the pinned version before shipping. For a quick local look at the widget without any backend, the `demo="true"` attribute renders with canned responses. System prompt should inject the brand's `llms.txt` content on the proxy side so answers stay grounded in the card data.

---

## Integration Plan

Full pipeline, in order, with what touches what:

```
brand card JSON
  |  node tools/gen-site.cjs datasets/brands-1k.json --out site/
  v
per brand: index.html / llms.txt / brand.jsonld / robots.txt
root: index.html (directory) / robots.txt
  |  npx pagefind --site site/
  v
site/pagefind/* (search index + UI assets)
  |  deploy site/ to any static host
  v
live site  (chat widget calls a thin proxy that holds the model API key)
```

Step by step:

1. **Brand card to HTML** (gen-site, unchanged): zero dependency, keep it that way. None of the picks below ask gen-site to gain a runtime dependency.
2. **HTML hooks** (small template additions by the gen-site author):
   - directory page: the Pagefind UI mount block from section 1
   - brand pages: optionally `data-pagefind-body` on `<article>` to scope the index
   - pages that need chat: the deep-chat block from section 6
   - future API docs page: the Scalar block from section 5
3. **llms.txt** (gen-site, native): already conformant with the AnswerDotAI spec. Add the batch mode root index file from section 2.
4. **Search index** (build step, not gen-site): `npx pagefind --site site/` right after generation, `--language zh` if autodetection misbehaves. Wrap both commands in one build script so a fresh checkout never serves a page whose `/pagefind/pagefind-ui.js` 404s:

   ```bash
   node tools/gen-site.cjs datasets/brands-1k.json --out site/ --theme light
   npx pagefind --site site/
   ```

5. **JSON-LD** (already emitted inline + as `brand.jsonld`): no library added. Validate samples in CI against validator.schema.org; once TypeScript exists in the repo, add the schema-dts type assertion from section 3.
6. **AI chat embed** (page + external proxy): deep-chat web component from section 6, pointing at a key holding proxy. Never embed the model API key in generated HTML.
7. **robots.txt** (gen-site, already done): allowlists all major AI crawlers. Optional one line addition when a real domain exists: append `Sitemap: https://<domain>/sitemap.xml`, and have gen-site emit that sitemap in batch mode (pure string template, same pattern as the directory page).

Only two commands enter the build: `npx pagefind --site site/` after generation, and deployment of the folder. Everything else is either already inside gen-site (llms.txt, JSON-LD, robots) or a CDN script tag in the page templates (Pagefind UI is self hosted from the generated index, deep-chat and Scalar from CDN or vendored copies).
