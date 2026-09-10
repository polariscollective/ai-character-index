# Index artifacts move to Supabase — design

Date: 2026-09-10
Status: approved, not started

## Why

Every artifact this project publishes lives in the repository. The behaviour
registry, the coverage ledger, the mirrored lab specs, the judge runlogs and the
built reader payloads are all committed files, and a merged pull request is the
act that puts any of them in front of the public.

That worked while the repository was the product. It stops working the moment
someone outside the team wants to put a spec into the index. Forking, installing
Python, paying for a panel of judges and opening a pull request is a filter that
only lets through people who did not need us in the first place. The people this
index wants are the ones with the subject-matter judgement, not the ones with
the git fluency.

So the contribution path becomes a button in the tool, and the artifacts move to
where a button can write them.

## Scope

This is the first of three documents. It moves the data and the serving, and
nothing else.

1. **Artifacts in Supabase.** This document. The tables, the migration, the
   citation guarantee, and the move from Cloudflare Pages to Vercel.
2. **The Cloud Run job.** Judging runs on Cloud Run rather than a laptop,
   triggered through `polaris-batch-trigger`. Its own document.
3. **The admin surface.** Authenticated pages that register a spec, register a
   behaviour, launch a run and publish its result. Its own document.

Out of scope here and named so nobody looks for them: the two comparison views
described under "What we give up", the public submission button, and any change
to how a judge is prompted.

## What a run is, and what a publication is

These two words carry the design, so they are fixed here.

A **run** is one pass of the judge panel over one or more spec versions, for a
set of behaviours, under one rubric. A run is a fact about what the judges said.
It is never edited after it finishes.

A **publication** is the decision that one run is the one the public reader
shows. It is not a document. Today that decision is a merged pull request; after
this work it is a row. Nothing is published by the mere fact of existing.

## The data model

Nine tables in the existing `evals` Supabase project, under the `aci_` prefix.
The project already carries two unrelated tenants behind the `eval_` and bare
prefixes, and `polaris-supabase` owns the migrations. No foreign key crosses
into another tenant's tables.

The reader never talks to Supabase. Routes on the Next.js app do, with the
service key, exactly as the Polaris pattern requires. There is therefore no
public read at the database level and no row-level policy carrying the weight of
that boundary.

```sql
create table aci_labs (
  id          text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table aci_specs (
  id          text primary key,        -- 'constitution', 'model-spec'
  lab_id      text not null references aci_labs(id),
  title       text not null,
  short_title text not null,
  source_url  text not null,
  created_at  timestamptz not null default now()
);

create table aci_spec_versions (
  id             uuid primary key default gen_random_uuid(),
  spec_id        text not null references aci_specs(id),
  version        text not null,        -- the label the lab gave it, '2026-01-20'
  markdown       text not null,
  content_sha256 text not null,
  source_url     text not null,
  added_at       timestamptz not null default now(),
  added_by       text not null,
  unique (spec_id, content_sha256)
);

create table aci_behaviours (
  slug        text primary key,
  name        text not null,
  set_name    text not null check (set_name in ('index','reader-test','user')),
  numeric_id  integer not null,
  group_name  text not null,
  definition  text not null default '',
  facets      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (set_name, numeric_id)
);

create table aci_runs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  created_by       text not null,
  status           text not null default 'pending'
                   check (status in ('pending','running','done','error','cancelled')),
  error            text,
  rubric           text not null,
  prompt           text not null,
  prompt_sha256    text not null,
  panel            text[] not null,
  config           jsonb not null,
  behaviours       jsonb not null,      -- snapshot of the registry rows judged
  spec_version_ids uuid[] not null,
  total_judgements integer not null default 0,
  usage            jsonb not null default '{}'::jsonb,
  cost_usd         numeric(12,6)
);

create table aci_judgements (
  id              bigserial primary key,
  run_id          uuid not null references aci_runs(id) on delete cascade,
  behaviour_slug  text not null references aci_behaviours(slug),
  spec_version_id uuid not null references aci_spec_versions(id),
  model           text not null,
  locator         text not null,
  verdict         smallint not null,
  relevant        smallint not null,
  parsed          boolean not null,
  unique (run_id, behaviour_slug, spec_version_id, model, locator)
);

create table aci_publications (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references aci_runs(id),
  published_at   timestamptz not null default now(),
  published_by   text not null,
  notes          text not null default '',
  build_params   jsonb not null,
  payload        jsonb not null,
  payload_sha256 text not null
);

create table aci_cell_curation (
  behaviour_slug text not null references aci_behaviours(slug),
  lab_id         text not null references aci_labs(id),
  verdict        text not null,
  depth_0_4      smallint not null check (depth_0_4 between 0 and 4),
  verified_date  date not null,
  updated_at     timestamptz not null default now(),
  primary key (behaviour_slug, lab_id)
);

create table aci_coverage (
  id             bigserial primary key,
  behaviour_slug text not null references aci_behaviours(slug),
  lab_id         text not null references aci_labs(id),
  verdict        text not null,
  depth_0_4      smallint,
  depth_note     text not null default '',
  citations      jsonb not null default '[]'::jsonb,
  frozen_at      timestamptz not null default now()
);
```

Two shapes deserve a sentence.

**The runlog was already a table.** Each JSONL row is a tuple of behaviour,
spec, judge model, passage and verdict. `aci_judgements` is that row with two
string keys replaced by foreign keys. The shipped v5 log becomes one run of
31,293 judgements; the v3 log becomes a second run, kept for the record.

**A run freezes what it judged against.** Not only its verdicts, but the rubric,
the prompt and its digest, the panel, and a snapshot of the behaviour registry
rows in force at the time. A run therefore stays replayable after the registry
moves on. That is what replaces the guarantee a commit used to give.

## The citation guarantee

This is the one place where the move to Supabase could lose something real, and
it does not.

Every published citation is a byte-exact locator into the text of one spec
version. Today the guarantee holds because the mirrored spec files never change
under a given path, and CI re-resolves every locator on every pull request.

In the new model it holds structurally. `aci_spec_versions` is insert-only: the
service role is granted `select` and `insert` and nothing else, following the
pattern of the existing `grant_service_role_privileges` migration. Every
judgement and every coverage citation carries a foreign key to the exact version
row it read. A locator therefore cannot point at text that moved, because the
text identified by that row exists in one form only.

This is stronger than what git gave. A locator string names its version by
label, and today correctness depends on the right file sitting at the right
path. A lab that silently reissues a spec under the same date breaks that
silently. Here it produces a second row with a different digest, and the two
coexist, which is the truth.

The same insert-only grant covers `aci_judgements`, `aci_publications` and
`aci_coverage`.

`engine/spec-cite/cite.py` keeps its logic and changes its source: it reads
markdown from the database instead of the disk. Its verification battery leaves
CI and becomes a scheduled job that re-resolves every published locator against
its pinned version.

## Publication and the reader's payload

A publication materialises its payload. The builder runs once, against the
judgements of the run being published, with its thresholds recorded in
`build_params`, and the result is stored on the publication row.

The alternative was to rebuild on request. Thirty thousand judgements per
request is not a serving strategy. Materialising also makes the payload
immutable, which lets the route set a long cache lifetime keyed on the
publication id.

Two routes serve the reader.

| route | returns |
|---|---|
| `GET /api/reader/documents` | the `documents.json` shape, from the spec versions the current publication used |
| `GET /api/reader/payload` | the current publication's payload, or a pinned run's with `?run=` |

The reader itself does not change. It stays vanilla JavaScript served as static
assets. Two of the three payload constants at the top of `site/spec-reader/app.js`
point at these routes instead of files, and the `?data=` pin becomes `?run=`.
The third, `FALLBACK_DATA_URL`, goes: the existing three-step resolution
collapses to two, where a pin that fails to load falls through to the current
publication. The committed fallback existed for a fresh clone, and has nothing
left to protect.

## Hosting

The site moves from Cloudflare Pages to Vercel, as a Next.js application whose
only server-side code is the routes above. This is not a preference. Serving the
reader from routes requires a server that holds the service key, and Vercel is
where the rest of Polaris puts that server.

Removed with the move: `.github/workflows/deploy.yml`, the root `deploy:site`
script, the `wrangler` dependency, and the Cloudflare Pages project itself.

## The migration

A one-shot script, `engine/migrate_to_supabase.py`, reads the committed files
and writes the tables. It is idempotent on the content digests, so a partial run
can be repeated.

| source | destination |
|---|---|
| `data/labs.json` | `aci_labs`, `aci_specs` |
| `specs/*/[spec].md` | `aci_spec_versions` |
| `data/behaviours.json` | `aci_behaviours` |
| `engine/panel/runlog-v5.jsonl` | one `aci_runs` row, 31,293 `aci_judgements` |
| `engine/panel/runlog-v3.jsonl` | a second run, kept for the record |
| `engine/panel/panel-config.json` | the runs' `config` |
| `engine/panel/prompts/v5.txt` | the runs' `prompt` |
| `data/panel-cell-curation.json` | `aci_cell_curation` |
| `data/coverage.json` | `aci_coverage` |

Two mappings in that table are not one-to-one, and both were checked against the
committed files before this document was written. The runlogs key their rows by
registry slug, and every slug in both logs resolves: nine behaviours in the v5
log, three in the v3 log, none missing. The coverage ledger keys its rows by the
index set's file-local `behaviour_id`, which the migration resolves to a slug
through the registry's per-set numeric space. Those numeric ids are never
carried into the tables, because they are file-local by design and the slug is
the global key.

The payload builders move with the data. `engine/panel/build_site_data.py` and
`engine/build-spec-reader-data.py` read the database rather than files, which
retires `engine/generate_behaviour_constants.py` and its drift gate: the
behaviour metadata is read at build time, so there are no derived copies left to
drift.

The judging harness does not move here. `whole_doc.py` keeps writing a local
JSONL, and the migration script doubles as the importer that loads a runlog into
a run. That seam closes in the second document, when the job writes judgements
directly.

## Verification

The acceptance test is the one the repository already trusts. Rebuild the reader
payload from the database and byte-compare it against the committed
`site/spec-reader/data/behaviours-v5-reader.json`. If the migration lost
anything, the bytes differ. This is `verify_panel_provenance.py` pointed at a
new source.

Four checks alongside it:

- The documents route returns JSON identical to the committed
  `documents.json`.
- Every locator in the published payload and in `aci_coverage` re-resolves
  through `cite.py` against its pinned spec version.
- An `update` against `aci_spec_versions` fails on grants.
- Two spec versions sharing a label but not a digest both insert, and their
  judgements stay separable.

## What we give up

**The public diff.** A merged pull request left a record an outsider could read.
Database rows do not. For a project whose argument is legibility, this is the
real cost, and it is deferred rather than dismissed: two comparison views pay it
back, one between versions of a lab's spec and one between published runs. The
data model here makes both computable, and a later document renders them. A
committed snapshot was considered as a cheaper substitute and rejected, because
nobody reads a git diff of a payload.

**The bare clone.** Already surrendered, on the record, in the identity design
and in the README. `AndresCotton/ai-character-index` keeps that property.

**Free verification.** GitHub Actions re-resolved the citations at no cost. A
scheduled job does not. The amount is small and the check is worth more where it
now runs, which is against what the public actually sees.
