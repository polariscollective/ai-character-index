# CI/CD workflows

Three workflows, as of September 2026:

- `ci.yml` verifies every pull request and every push to `main` against fixtures, with no secrets.
- `deploy-runner.yml` builds the judging job's image and points the Cloud Run job at it, on a push to `main` that touches the engine.
- `provenance.yml` checks the public publication against the database once a day, with the Supabase credentials.

The site has no workflow: Vercel builds the Next.js application on a push. PLAN.md §5
also promises `notion-sync.yml` and `spec-watch.yml`; neither exists.

## `ci.yml`: verify on every PR

Runs on every pull request and on pushes to `main`, with no paths filter (a
filtered required check would silently skip PRs outside its paths and block
merging). Two jobs:

- **offline**: the no-network battery. The panel and judging job suites, the
  store and index suites, the `tests/` suite (the citation resolver and its parser
  corpus), the application library suites (`node --test app/lib/__tests__`), and
  the node app.js harnesses. Stdlib python + node only; nothing to install.
- **browser**: the two Playwright walkers (`verify-reader-test.mjs`,
  `verify-reader-features.mjs`) against an installed Chrome, answering the
  reader's routes from `tests/fixtures/reader/`.

No secrets are needed; `contents: read` is the only permission.

## `deploy-runner.yml`: the judging image

Runs on a push to `main` that touches `engine/**`, `Dockerfile`, `.dockerignore`
or the workflow itself, and on demand. It authenticates to Google Cloud through
workload identity federation (`vars.WIF_PROVIDER`, `vars.DEPLOY_SA`), builds and
pushes `ai-character-index-runner:<sha>` to the `polaris-docker` repository, and
updates the `ai-character-index-runner` Cloud Run job to that image.

As of 15 September 2026 it has not once succeeded: the workload identity
provider rejects the token by its attribute condition, which `polaris-tf`
defines. Until that is fixed, run jobs from a local portal with `ACI_PYTHON` set.

## `provenance.yml`: the published data

Runs daily at 06:17 UTC and on demand: `python3 engine/verify_supabase_provenance.py`
with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from secrets. A failure means
the database moved, not that a branch is wrong.

As of 15 September 2026 both secrets reach the job empty, so every scheduled run
exits before checking anything.

## Deployment

There is no deploy workflow for the site. `prebuild` copies `site/` into
`public/`, `next build` runs, and Vercel deploys the result: `main` to
production, other branches as previews.

The Vercel project needs the server-side variables `.env.example` describes:
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the routes and the portal, the
`AUTH_` and `ALLOWED_` variables for sign-in, `BATCH_TRIGGER_URL` and
`BATCH_TRIGGER_SECRET` to start jobs, and `SLACK_WEBHOOK_URL` for proposals. None
is prefixed `NEXT_PUBLIC_`, and none may be: the browser reads routes, and routes
read the database.

Publishing the index is not a deploy at all. The reader's two payloads come from
the current publication row, so what the public sees changes with a database
write.
