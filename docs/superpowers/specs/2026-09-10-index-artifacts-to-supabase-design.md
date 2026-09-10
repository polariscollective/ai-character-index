# Index artifacts move to Supabase — design

Date: 2026-09-10
Status: approved, not started
Amended: 2026-09-10, for the cell model that came out of the Cloud Run job design

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
   triggered through `polaris-batch-trigger`. Written:
   `2026-09-10-cloud-run-judging-job-design.md`. The cell model below came out
   of it, and this document was amended to match.
3. **The admin surface.** Authenticated pages that register a spec, register a
   behaviour, launch a run and publish its result. Its own document.

Out of scope here and named so nobody looks for them: the two comparison views
described under "What we give up", the public submission button, and any change
to how a judge is prompted.

## What a run is, and what a publication is

These two words carry the design, so they are fixed here.

A **cell** is one behaviour against one spec version. It is the durable thing
this index is made of, and the unit a reader compares across time.

A **judge call** is one model reading one whole spec version for one behaviour
and returning a verdict for every passage in it. It is the unit of work, of
cost, of failure and of resume. The shipped bench is 67 of them over 18 cells,
and they produced 31,293 judgements between them.

A **run** is a batch of judge calls someone asked for. It is not the whole
index. Adding a lab's spec is one run of thirty calls; adding a behaviour is one
run of six. A run is never edited after it finishes.

A **publication** is the decision about which run answers for each cell. It is
not a document, and it is not a run. Today that decision is a merged pull
request; after this work it is a row per cell. Nothing is published by the mere
fact of existing.

A publication must be homogeneous: every cell it selects was judged by the same
set of models under the same rubric. An index whose argument is comparison
between labs cannot publish an Anthropic cell judged by one panel beside an
OpenAI cell judged by another. The constraint is enforced on insert rather than
written down as method.

**The bench already in production does not satisfy it**, and this was found by
counting rather than assumed. Four behaviours were judged by more models on the
Anthropic constitution than on the OpenAI model spec: six against three twice,
six against five once, five against three once. The other five behaviours are
three against three. The reader compensates by scoring every cell against its
own maximum, which is why this was invisible, but a depth reached before six
judges and a depth reached before three are not the same claim.

Migrating is not the moment to fix it. The acceptance test of this whole
document is that the payload rebuilt from the database is byte-identical to the
one in production, and a payload built from a homogeneous subset would be a
different payload with nothing to compare against. So exactly one publication is
exempt: the one the migration writes, carrying `grandfathered`, and a partial
unique index makes sure a second can never exist. Filling the nine missing calls
is then a dated, visible piece of work rather than a side effect of a
migration.

## The data model

Eleven tables in the existing `evals` Supabase project, under the `aci_` prefix.
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
  id            text primary key,      -- 'constitution', 'model-spec'
  lab_id        text not null references aci_labs(id),
  title         text not null,
  short_title   text not null,
  source_url    text not null,
  -- How a locator names a section in this document: by heading anchor, as the
  -- OpenAI model spec does, or by the path of section titles, as the Anthropic
  -- constitution does. This is the only thing the judging engine hard-codes by
  -- spec name today, and a spec someone uploads needs it said rather than
  -- guessed.
  locator_style text not null default 'path'
                check (locator_style in ('path', 'anchor')),
  created_at    timestamptz not null default now()
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
  estimated_usd    numeric(12,6),       -- priced before launch, from the panel prices
  cost_usd         numeric(12,6)        -- summed from the calls when it finishes
);

-- One row per judge call: the unit of work, of cost, of failure and of resume.
-- Every row is created `pending` when the run is launched, so "how much is
-- left" is a count before the job has started rather than an estimate. It
-- carries what metrics.jsonl records today.
create table aci_judge_calls (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references aci_runs(id) on delete cascade,
  behaviour_slug    text not null references aci_behaviours(slug),
  spec_version_id   uuid not null references aci_spec_versions(id),
  model             text not null,
  status            text not null default 'pending'
                    check (status in ('pending','running','done','error','cancelled')),
  error             text,
  raw_output        text,          -- kept when a call fails to parse
  passages          integer,
  unparsed          integer,
  finish_reason     text,
  prompt_tokens     integer,
  completion_tokens integer,
  cost_usd          numeric(12,6),
  seconds           numeric(10,2),
  started_at        timestamptz,
  finished_at       timestamptz,
  unique (run_id, behaviour_slug, spec_version_id, model)
);

create table aci_judgements (
  id       bigserial primary key,
  call_id  uuid not null references aci_judge_calls(id) on delete cascade,
  locator  text not null,
  verdict  smallint not null,
  relevant smallint not null,
  parsed   boolean not null,
  unique (call_id, locator)
);

create table aci_publications (
  id             uuid primary key default gen_random_uuid(),
  published_at   timestamptz not null default now(),
  published_by   text not null,
  notes          text not null default '',
  -- The panel and rubric every selected cell agrees on. Denormalised on purpose:
  -- it is the homogeneity claim, and it should be readable without a join.
  panel          text[] not null,
  rubric         text not null,
  -- The one exemption from the homogeneity check below, for the bench already
  -- in production. A partial unique index allows exactly one, ever.
  grandfathered  boolean not null default false,
  build_params   jsonb not null,
  payload        jsonb not null,
  payload_sha256 text not null
);

-- Which run answers for each cell in this publication. A publication is a
-- selection, not a run: the cells it takes may come from runs months apart.
create table aci_publication_cells (
  publication_id  uuid not null references aci_publications(id) on delete cascade,
  behaviour_slug  text not null references aci_behaviours(slug),
  spec_version_id uuid not null references aci_spec_versions(id),
  run_id          uuid not null references aci_runs(id),
  primary key (publication_id, behaviour_slug, spec_version_id)
);

create unique index aci_publications_one_grandfathered
  on aci_publications (grandfathered) where grandfathered;

-- Homogeneity, enforced rather than documented: every cell of a publication
-- must have been judged by exactly the models the publication names, all of
-- them done. The grandfathered publication is the single exemption.
create or replace function aci_publication_cell_is_publishable()
returns trigger language plpgsql as $$
declare
  pub  aci_publications%rowtype;
  seen text[];
begin
  select * into pub from aci_publications where id = new.publication_id;
  if pub.grandfathered then
    return new;
  end if;
  if (select rubric from aci_runs where id = new.run_id) is distinct from pub.rubric then
    raise exception 'run % does not carry rubric % of publication %',
      new.run_id, pub.rubric, new.publication_id;
  end if;
  select array_agg(model order by model) into seen
    from aci_judge_calls
   where run_id = new.run_id
     and behaviour_slug = new.behaviour_slug
     and spec_version_id = new.spec_version_id
     and status = 'done';
  if seen is distinct from (select array_agg(m order by m) from unnest(pub.panel) m) then
    raise exception 'cell %/% was judged by %, publication panel is %',
      new.behaviour_slug, new.spec_version_id, seen, pub.panel;
  end if;
  return new;
end;
$$;

create trigger aci_publication_cells_publishable
  before insert on aci_publication_cells
  for each row execute function aci_publication_cell_is_publishable();

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

Three shapes deserve a sentence.

**The runlog was already a table.** Each JSONL row is a tuple of behaviour,
spec, judge model, passage and verdict. Those first three name a judge call and
the last two are the verdict it returned for one passage, which is why the log
splits cleanly in two: `aci_judge_calls` and `aci_judgements`. The shipped v5
log becomes one run of 67 calls and 31,293 judgements; the v3 log becomes a
second run, kept for the record.

**A run does not enumerate its work; its calls do.** The run carries what the
work was done under, and `aci_judge_calls` carries which work. That is what
makes progress a count and resume a filter, and it is why the run has no list of
spec versions of its own: the set of versions a run touched is the set its calls
name.

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

The same insert-only grant covers `aci_judgements`, `aci_publications`,
`aci_publication_cells` and `aci_coverage`. `aci_judge_calls` is the exception
among the work tables: its status has to move from `pending` to `running` to
`done`, so it takes `update` as well. Nothing it records is a citation.

`engine/spec-cite/cite.py` keeps its logic and changes its source: it reads
markdown from the database instead of the disk. Its verification battery leaves
CI and becomes a scheduled job that re-resolves every published locator against
its pinned version.

## Publication and the reader's payload

A publication is a selection of cells, and it materialises its payload. The
builder runs once, over the judgements of the calls its selected runs made for
those cells, with its thresholds recorded in `build_params`, and the result is
stored on the publication row.

The alternative was to rebuild on request. Thirty thousand judgements per
request is not a serving strategy. Materialising also makes the payload
immutable, which lets the route set a long cache lifetime keyed on the
publication id.

One rule is checked before a publication cell is written, and it refuses rather
than warns: the cell must have been judged by exactly the models the publication
names, every one of them `done`. That covers both failures at once. A cell
judged by a different panel breaks the comparison between labs, and a cell
missing one of its judges scores against a scale the panel never reached, which
the reader's band maths would read as a weaker verdict rather than as missing
work.

The check lives in the database because it is the claim the index sells, and it
must not depend on which code path wrote the row. The single grandfathered
publication is the exemption, and the index that guards it means the exemption
cannot be reused.

Two routes serve the reader.

| route | returns |
|---|---|
| `GET /api/reader/documents` | the `documents.json` shape, from the spec versions the current publication used |
| `GET /api/reader/payload` | the current publication's payload, or a pinned one with `?publication=` |

The reader itself does not change. It stays vanilla JavaScript served as static
assets. Two of the three payload constants at the top of `site/spec-reader/app.js`
point at these routes instead of files, and the `?data=` pin becomes
`?publication=`.
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
| `engine/panel/runlog-v5.jsonl` | one `aci_runs` row, 67 `aci_judge_calls`, 31,293 `aci_judgements` |
| `engine/panel/runlog-v3.jsonl` | a second run, kept for the record |
| `engine/panel/panel-config.json` | the runs' `config` |
| `engine/panel/prompts/v5.txt` | the runs' `prompt` |
| `data/panel-cell-curation.json` | `aci_cell_curation` |
| `data/coverage.json` | `aci_coverage` |
| the payload the site ships today | the first `aci_publications` row and its cells |

Three mappings in that table are not one-to-one, and the first two were checked
against the committed files before this document was written. The runlogs key their rows by
registry slug, and every slug in both logs resolves: nine behaviours in the v5
log, three in the v3 log, none missing. The coverage ledger keys its rows by the
index set's file-local `behaviour_id`, which the migration resolves to a slug
through the registry's per-set numeric space. Those numeric ids are never
carried into the tables, because they are file-local by design and the slug is
the global key.

The third is the runlog. It has no notion of a judge call, so the migration
reconstructs one per distinct behaviour, spec and model, and hangs that call's
rows off it. The per-call counts a live run would record are not in the log and
stay null: the tokens, the seconds and the finish reason were written to a
`metrics.jsonl` that is gitignored and no longer on disk. A migrated call is
`done` with its judgements and without its meter reading, and that is honest
rather than invented.

The payload builders move with the data. `engine/panel/build_site_data.py` and
`engine/build-spec-reader-data.py` read the database rather than files, which
retires `engine/generate_behaviour_constants.py` and its drift gate: the
behaviour metadata is read at build time, so there are no derived copies left to
drift.

The judging harness does not move here. `whole_doc.py` keeps writing a local
JSONL, and the migration script doubles as the importer that loads a runlog into
a run. That seam closes in the second document, when the job writes judgements
directly.

One more thing arrives with the data rather than with the job: the first
publication. The migration writes it, selecting every cell of the migrated v5
run, so the reader has something to serve on the first request. Its payload is
the committed one, which is what makes the acceptance test below a byte
comparison rather than a judgement call.

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
- A publication whose cell was judged by a set of models other than its panel
  is refused, and so is one whose run carries a different rubric.
- A second `grandfathered` publication is refused by the unique index.

## What we give up

**The public diff.** A merged pull request left a record an outsider could read.
Database rows do not. For a project whose argument is legibility, this is the
real cost, and it is deferred rather than dismissed: two comparison views pay it
back, one between versions of a lab's spec and one between published cells. The
data model here makes both computable, and a later document renders them. A
committed snapshot was considered as a cheaper substitute and rejected, because
nobody reads a git diff of a payload.

**The bare clone.** Already surrendered, on the record, in the identity design
and in the README. `AndresCotton/ai-character-index` keeps that property.

**Free verification.** GitHub Actions re-resolved the citations at no cost. A
scheduled job does not. The amount is small and the check is worth more where it
now runs, which is against what the public actually sees.
