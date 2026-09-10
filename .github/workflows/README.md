# CI/CD workflows

`ci.yml` is the only workflow here. Deployment is Vercel's: it builds the
Next.js application on a push, so there is nothing for a workflow to publish.
PLAN.md §5 also promises `notion-sync.yml` and `spec-watch.yml`; neither
exists.

## `ci.yml` -- verify on every PR

Runs on every pull request and on pushes to `main`, with no paths filter (a
filtered required check would silently skip PRs outside its paths and block
merging). Two jobs:

- **offline** — the full no-network battery: panel + provenance suites, the
  `tests/` suite (cite goldens, decoupling pins), the data gate, builder
  byte-identity rebuilds, the registry drift gate, and the node app.js
  resolution harnesses. Stdlib python + node only; nothing to install.
- **browser** — the two Playwright walkers (reader, reader feature harness ×
  bundled + user-extended data) against an installed Chrome.

No secrets are needed; `contents: read` is the only permission.

## Deployment

There is no deploy workflow. The site is a Next.js application: `prebuild`
copies `site/` into `public/`, `next build` runs, and Vercel deploys the result
on a push to `main`.

Two environment variables must be set on the Vercel project, and nowhere else:
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. They are read by the two reader
routes, server-side. Neither is prefixed `NEXT_PUBLIC_`, and neither may be: the
browser reads routes, and routes read the database.

Publishing the index is not a deploy at all. The reader's two payloads come from
the current publication row, so what the public sees changes with a database
write.
