# EEO Brand Visibility Audit (GitHub Action)

Check how visible your brand is inside AI answers, straight from your CI. The action asks AI engines real buyer questions about your market, then grades the answers: do the engines know your brand, and do they mention you when buyers ask for recommendations?

It runs on GitHub-hosted runners with the Node 20 runtime, no Docker. API keys are read from environment variables at run time and never written to disk or the report.

## Quick start

```yaml
- uses: YOUR_USERNAME/eeo-open/action@main
  with:
    brand: My Brand
  env:
    DEEPSEEK_API_KEY: ${{ secrets.DEPSEEK_API_KEY }}
    ZHIPU_API_KEY: ${{ secrets.ZHIPU_API_KEY }}
```

Every run produces a job summary with the grade table, step outputs with the scores, and `eeo-report.json` in the workspace with every question and full answer.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `brand` | yes | | Brand name to audit. Any language works; questions are generated in Chinese |
| `industry` | no | empty | Industry or product category, used when generating buyer questions |
| `depth` | no | `quick` | `quick` (12 questions), `standard` (30), or `deep` (48) |
| `engines` | no | `deepseek,glm` | Comma-separated engine ids from the catalog below |

## Outputs

| Output | Description |
|---|---|
| `grade` | `S`, `A`, `B`, `C`, `D`, or `ERROR` when the audit did not complete |
| `overall` | Overall visibility score, 0-100 |
| `aware_rate` | Share of direct brand questions answered with substance, 0-100 |
| `mention_rate` | How often the brand appears in category questions, 0-100 |
| `report_json` | Full report as JSON: inputs, scores, labels, quotes, every answer |

The full report is also written to `eeo-report.json` in the workspace, ready for `actions/upload-artifact`.

## Secrets

Add these under Settings, then Secrets and variables, then Actions:

| Secret | Engine |
|---|---|
| `DEEPSEEK_API_KEY` | `deepseek` (DeepSeek open platform) |
| `ZHIPU_API_KEY` | `glm` (Zhipu BigModel) |

An engine without a key is skipped and the audit continues with the rest. If no engine has a key, the step logs the reason and outputs `grade=ERROR`. A failed or timed-out audit never fails the workflow, so this action cannot turn your CI red.

The audit stops itself after 35 minutes if an engine is stalling. Set `timeout-minutes: 40` on the job to leave a margin.

## Example workflows

### On every push

```yaml
name: EEO audit
on:
  push:
    branches: [main]
jobs:
  eeo:
    runs-on: ubuntu-latest
    timeout-minutes: 40
    steps:
      - uses: YOUR_USERNAME/eeo-open/action@main
        id: eeo
        with:
          brand: My Brand
          industry: kids coding training
          depth: standard
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEPSEEK_API_KEY }}
          ZHIPU_API_KEY: ${{ secrets.ZHIPU_API_KEY }}
      - uses: actions/upload-artifact@v4
        with:
          name: eeo-report
          path: eeo-report.json
```

### Manual, with a depth picker

```yaml
name: EEO audit
on:
  workflow_dispatch:
    inputs:
      depth:
        description: Audit depth
        type: choice
        options: [quick, standard, deep]
        default: quick
jobs:
  eeo:
    runs-on: ubuntu-latest
    timeout-minutes: 40
    steps:
      - uses: YOUR_USERNAME/eeo-open/action@main
        with:
          brand: My Brand
          depth: ${{ inputs.depth }}
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEPSEEK_API_KEY }}
          ZHIPU_API_KEY: ${{ secrets.ZHIPU_API_KEY }}
```

### Monthly retest

```yaml
on:
  schedule:
    - cron: '0 3 1 * *'  # 03:00 UTC on day 1
```

GitHub runs scheduled workflows on the default branch only, and disables them after 60 days without repository activity.

## Badges

### Workflow status badge

Shows at a glance whether the last audit ran through:

```markdown
[![EEO audit](https://github.com/OWNER/REPO/actions/workflows/eeo-audit.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/eeo-audit.yml)
```

Replace `OWNER/REPO` and the workflow file name with yours. This badge reflects the run status, not the grade; the action keeps the workflow green even when the audit itself errors.

### Grade badge via a shields.io endpoint

Step outputs only exist inside a run, so a public badge needs the grade stored at a stable URL. The route used here: write a shields.io endpoint JSON from the outputs, commit it to a dedicated `badges` branch, then point `img.shields.io/endpoint` at the raw file.

Add this step after the audit step (the audit step needs `id: eeo`), with write access to contents:

```yaml
      - name: Publish grade badge
        permissions:
          contents: write
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          grade="${{ steps.eeo.outputs.grade }}"
          case "$grade" in
            S) color=brightgreen ;;
            A) color=green ;;
            B) color=yellow ;;
            C) color=orange ;;
            D) color=red ;;
            *) grade=error; color=lightgrey ;;
          esac
          printf '{"schemaVersion":1,"label":"eeo","message":"%s","color":"%s"}\n' \
            "$grade" "$color" > eeo-grade.json
          repo="repos/${GITHUB_REPOSITORY}"
          sha=$(gh api "$repo/contents/eeo-grade.json?ref=badges" --jq .sha 2>/dev/null || true)
          if [ -z "$sha" ]; then
            gh api "$repo/git/refs" -f ref=refs/heads/badges -f sha="$GITHUB_SHA" >/dev/null
          fi
          b64=$(base64 -w0 eeo-grade.json)
          if [ -n "$sha" ]; then
            gh api "$repo/contents/eeo-grade.json" -X PUT \
              -f message="eeo badge" -f content="$b64" -f branch=badges -f sha="$sha" >/dev/null
          else
            gh api "$repo/contents/eeo-grade.json" -X PUT \
              -f message="eeo badge" -f content="$b64" -f branch=badges >/dev/null
          fi
```

Then reference it from your README:

```markdown
![EEO grade](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/OWNER/REPO/badges/eeo-grade.json)
```

If the raw URL ever contains `&`, percent-encode the whole `url` parameter. The same pattern works for `overall` or `aware_rate` instead of the grade; just change the `message` field.

## Local dry run

The action reads inputs from `EEO_INPUT_*` when the real `INPUT_*` variables are absent, so you can run it outside Actions:

```bash
GITHUB_OUTPUT=/tmp/out GITHUB_STEP_SUMMARY=/tmp/sum \
EEO_INPUT_BRAND="My Brand" EEO_INPUT_DEPTH=quick \
DEEPSEEK_API_KEY=... ZHIPU_API_KEY=... \
node action/index.js
```

It exits 0 in every case and prints what it wrote.

## Engine catalog

| Id | Engine | Model | Key |
|---|---|---|---|
| `deepseek` | DeepSeek | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| `glm` | Zhipu GLM | `glm-5.3-flash` | `ZHIPU_API_KEY` |

Both are OpenAI-compatible chat completion endpoints. To add an engine, extend `ENGINE_PRESETS` in `index.js` or plug custom engines into `core.cjs` (see the repository root `config.example.json`).
