# .github: PR-time verification, the judging image's deploy, and the daily provenance check

> Current-state doc, as of September 2026: describes what exists now, not what should exist.

## Purpose
`.github/` holds three workflows: PR-time verification (`ci.yml`), the judging image's deploy (`deploy-runner.yml`) and a daily check of the published data (`provenance.yml`). The site has no workflow: it is a Next.js application that Vercel builds on a push. The public inbound channel is the contact link on the repo's Issues page (`ISSUE_TEMPLATE/config.yml` enables blank issues and the mailto link).

## Contents
| Path | What it is |
|---|---|
| `workflows/ci.yml` | PR-time verification: the offline suites (panel, judging job, store and index, `tests/`, application libraries, app.js harnesses) + the two Playwright reader walkers against an installed Chrome. No secrets, `contents: read` only |
| `workflows/deploy-runner.yml` | On a push to `main` touching `engine/**`, the Dockerfile or itself, and on demand: builds the judging image, pushes it to Artifact Registry and points the `ai-character-index-runner` Cloud Run job at it, authenticating through workload identity federation |
| `workflows/provenance.yml` | Daily at 06:17 UTC and on demand: runs `engine/verify_supabase_provenance.py` against the public publication, with the Supabase credentials as secrets |
| `workflows/README.md` | Operator notes for the three workflows and the Vercel deployment |
| `ISSUE_TEMPLATE/config.yml` | Blank issues enabled; mailto contact link (andrescotton@gmail.com) |

## Relationships
- `ci.yml` triggers on every `pull_request` and on `push` to `main`, deliberately without a paths filter (a filtered required check would skip PRs outside its paths and block merging). Two jobs: `offline` (stdlib python + node, nothing installed) and `browser` (pnpm deps + `browser-actions/setup-chrome`, then the two walkers).
- CI verifies the code against fixtures and knows no secret; `provenance.yml` verifies the published data and is the one workflow that reads Supabase.
- `deploy-runner.yml` reads repository variables (`WIF_PROVIDER`, `DEPLOY_SA`, `GCP_PROJECT`, `GCP_REGION`); the workload identity provider and its attribute condition are defined in `polaris-tf`.
- Vercel deploys `main` to production and other branches as previews, outside these workflows.
- Proposals go through `/how-it-works`; the contact link is for anything else, and GitHub surfaces it through the Issues form picker via `config.yml`.

## Dependency map
```mermaid
graph LR
  PRR["any pull request, or a push to main"] --> CI["ci.yml: offline suites + reader walkers"]
  PUSH["push to main touching engine/** or Dockerfile"] --> DR["deploy-runner.yml"]
  WD["workflow_dispatch"] --> DR
  DR -->|image| JOB["Cloud Run job ai-character-index-runner"]
  CRON["daily schedule"] --> PROV["provenance.yml"]
  WD --> PROV
  PROV -->|"verify_supabase_provenance.py"| SB["Supabase aci_ tables"]
  CFG["config.yml"] -->|contact link| GH["GitHub Issues"]
```

## As-is observations
- `deploy-runner.yml` has not once succeeded (14 runs as of 15 September 2026). It fails at `google-github-actions/auth`: the workload identity provider rejects the token by its attribute condition. Jobs are run from a local portal with `ACI_PYTHON` set instead.
- `provenance.yml` fails on its scheduled runs as of 15 September 2026: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` reach the job empty, so the verifier exits before checking anything.
- `ci.yml` leaves some suites out: `engine/test_seat_substitutions.py`, `engine/test_coverage_payload.py`, and the `test_appjs_locator.js`, `test_appjs_opening.js`, `test_appjs_translation.js` and `test_reader_v5_labels.js` harnesses in `engine/panel/`.
- `engine/verify-portal.mjs` needs credentials, and no workflow runs it.
- `engine/notion-sync/` contains only `.gitkeep`, and `engine/spec-watch/pull-latest.sh` no longer runs; no workflow invokes either.
