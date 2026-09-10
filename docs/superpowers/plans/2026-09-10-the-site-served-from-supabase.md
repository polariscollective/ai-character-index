# The site served from Supabase — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The spec reader gets its two payloads from routes backed by the index
tables, and the site runs as a Next.js application instead of static files on
Cloudflare Pages.

**Architecture:** A publication carries both payloads it needs, materialised by
the Python builders at publication time. Two Next.js routes stream those columns;
neither rebuilds anything per request. The reader itself does not change: it
stays vanilla JavaScript served from `public/`, and three constants at the top of
`app.js` point at routes instead of files.

**Tech Stack:** Next.js App Router on Vercel, plain `fetch` against PostgREST on
the server side, no Supabase client library.

**Design:** `docs/superpowers/specs/2026-09-10-index-artifacts-to-supabase-design.md`

**Depends on:** `2026-09-10-index-artifacts-into-supabase.md`, executed.

## Global Constraints

- **The service key never reaches the browser.** Routes read the database; the
  page reads routes. No `NEXT_PUBLIC_` variable carries a key.
- **No Supabase client library**, on either side. The Python half uses
  `engine/store.py`; the TypeScript half uses `fetch`. One HTTP API, two thin
  callers, nothing to keep in step across a dependency upgrade.
- **The reader is not rewritten.** It is vanilla JavaScript and it stays that
  way. `site/` remains its source; a prebuild step copies it into `public/`,
  which is gitignored.
- **Both browser walkers must keep passing**, against files as they do today
  and against routes once they are wired.
- **English in the repository**, and no secrets in it.

---

### Task 1: A publication carries both of its payloads

**Files:**
- Create: `polaris-supabase/evals/supabase/migrations/<ts>_aci_publications_carry_both_payloads.sql`
- Modify: `engine/migrate_to_supabase.py`
- Modify: `engine/verify_supabase_provenance.py`

**Interfaces:**
- Produces: `aci_publications.documents` and `.documents_sha256`, both not null.

- [ ] **Step 1: Write the migration**

The two publication tables are dropped and recreated rather than altered,
because they are insert-only by grant and a backfill would need an update
privilege that must not exist. A publication is regenerable from its cells by
construction, so recreating it loses nothing. The trigger and the partial unique
index are recreated with them, unchanged.

- [ ] **Step 2: Apply it**

Run: `supabase db push --dry-run`, then `supabase db push`.
Expected: one migration listed, applied.

- [ ] **Step 3: Teach the importer to build the documents payload**

`plan()` gains `documents` and `documents_sha256` on the publication, built by
running `build-spec-reader-data.py --from-supabase` into a scratch file and
reading it back. That is deliberate: the payload the route serves is produced by
the same builder the verifier compares, so there is one implementation and one
thing to prove.

- [ ] **Step 4: Re-run the importer**

Run: `python3 engine/migrate_to_supabase.py`
Expected: `aci_publications 1 rows, 1 to insert` and `aci_publication_cells 18
rows, 18 to insert`, everything else `0 to insert`.

- [ ] **Step 5: Extend the verifier**

A seventh check: the publication's `documents` column, serialised the way the
builder serialises it, equals the committed `documents.json` apart from
`generatedFrom`.

Run: `python3 engine/verify_supabase_provenance.py`
Expected: seven OK lines.

- [ ] **Step 6: Commit, in both repositories**

---

### Task 2: The application and its two routes

**Files:**
- Create: `app/api/reader/documents/route.ts`, `app/api/reader/payload/route.ts`
- Create: `app/lib/publications.ts`
- Create: `next.config.mjs`, `tsconfig.json`
- Modify: `package.json`, `.gitignore`
- Create: `app/api/reader/__tests__/publications.test.mjs`

**Interfaces:**
- Produces:
  - `GET /api/reader/documents` and `GET /api/reader/documents?publication=<id>`
  - `GET /api/reader/payload` and `GET /api/reader/payload?publication=<id>`
  - `currentPublication(): Promise<Row>` and `publicationById(id): Promise<Row | null>`
  - A 404 with a JSON body when a pin names nothing, so the page can fall
    through rather than render an error as data.

- [ ] **Step 1: Write the failing test for the lookup**

Against an injected fetch, so it touches no network: a pin is passed through as
an `id=eq.` filter, an absent pin returns null, the current publication is the
newest by `published_at`, and the service key never appears in a response.

- [ ] **Step 2: Run it, watch it fail**

- [ ] **Step 3: Write `app/lib/publications.ts` and the two routes**

Each route selects one column of one row. A pinned publication is immutable, so
it is served `public, max-age=31536000, immutable`; the current one changes when
someone publishes, so it is served `s-maxage=60, stale-while-revalidate=300`.

- [ ] **Step 4: Run the test, watch it pass**

- [ ] **Step 5: Serve the reader from the application**

`site/` stays the source. A prebuild script copies it into `public/`, which is
gitignored. Nothing under `site/` moves, so both browser walkers keep working
against it unchanged.

- [ ] **Step 6: Check the routes against the real database**

Run `pnpm dev`, then compare each route's body against the committed payload
byte for byte, `generatedFrom` excepted.

- [ ] **Step 7: Commit**

---

### Task 3: The reader reads the routes

**Files:**
- Modify: `site/spec-reader/app.js`
- Modify: `engine/verify-reader-test.mjs`, `engine/verify-reader-features.mjs`

**Interfaces:**
- Produces: a reader whose payload resolution is `?publication=` pin, then the
  current publication.

- [ ] **Step 1: Point the constants at the routes**

`DOCUMENTS_URL` and the payload URL become `/api/reader/documents` and
`/api/reader/payload`. `FALLBACK_DATA_URL` and `MANIFEST_URL` go: the manifest
was a local run ledger and the fallback existed for a fresh clone, and neither
has anything left to protect.

- [ ] **Step 2: Rename the pin**

`?data=<name>` becomes `?publication=<id>`. The name validation, which existed to
stop a pin naming the manifest or escaping the data directory, becomes a check
that the value is a uuid.

- [ ] **Step 3: Teach the walkers to serve the routes**

Both walkers run their own static server. Each gains two handlers that answer
the routes from the database, so the reader under test is the reader as
deployed.

- [ ] **Step 4: Run both walkers**

Expected: `All views verified.` and `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 5: Commit**

---

### Task 4: Cloudflare Pages goes

**Files:**
- Delete: `.github/workflows/deploy.yml`
- Modify: `package.json` (the `deploy:site` script and the `wrangler` dependency)
- Modify: `README.md`, `ROOT.md`, `SYSTEM.md`, `.github/workflows/README.md`
- Create: `.github/workflows/ci.yml` (the offline battery keeps running)

- [ ] **Step 1: Remove the deploy path**

- [ ] **Step 2: Bring the current-state documents current**

`ROOT.md` and `SYSTEM.md` describe a static site deployed to Cloudflare Pages by
wrangler. They are current-state documents and must say what is true.

- [ ] **Step 3: Run every gate**

- [ ] **Step 4: Commit**

---

## What needs the account holder

Creating the Vercel project and setting `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` on it needs credentials this session does not have.
Everything above runs locally without them; the deployment itself is the last
step and is yours.
