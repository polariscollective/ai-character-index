# One panel, documents as versions, and a depth the judges give

> Design doc, 2026-09-14. How the index is reshaped before it is judged again
> from scratch: what goes, what a document is, and the one new thing the judges
> produce. Built on `develop`; the database only gains until `develop` is merged,
> and loses what is obsolete afterwards.

## The problem

The index carries four mechanisms that each made sense where they came from and
together make it hard to operate.

- **Sets.** Every behaviour is labelled `index`, `reader-test` or `user`, and the
  code infers from the label what a behaviour contains: an `index` behaviour is
  never displayed, a `reader-test` behaviour cannot be published without a
  hand-written verdict per lab. The label decides publishability, which is a
  property of what was judged, not of where a behaviour came from.
- **Human verdicts.** `aci_cell_curation` holds a verdict and a 0 to 4 depth per
  behaviour per *lab*, with no document version. A verdict written against the
  2025-12-18 Model Spec would be carried onto any later version as if someone had
  read it. And no surface reads it: the reader, the other pages and the MCP
  server never display the depth.
- **A document is "the newest version of a spec".** The composer and the
  publication builder always take the newest version, so an older version cannot
  be judged or published once a newer one is registered. Worse, `batch_job` reads
  a call's passages through `harness.passages(spec)`, which also loads the newest
  version: a call on an older version would judge the newer text.
- **Several panels, one displayed.** The portal composes with any panel, but
  `publish.py` never passes a panel to `build_site_data.py`, which filters
  verdicts to `display.panel`. A publication judged by `frontier_primary` would
  silently show two judges of three.

Meanwhile the operator wants one thing the index does not offer: a glance, per
behaviour, at whether a document addresses it and how deeply.

## Decisions

1. No sets. Nothing reads them.
2. No human verdicts and no human review. Pressing "make public" is the review.
3. A document is a version. It is chosen, judged, published and shown as itself.
4. One panel, `frontier_fast`, for everything the portal does.
5. A depth from 0 to 4 per behaviour per document, given by each judge of the
   panel in a small call after the passages, averaged in the publication.
6. `general-welfare-impacts-strict` goes. It was never judged by a panel, and the
   reader's row for it is fed by `animal-welfare-impacts` (`SLUGS_EXTRA`), so the
   two rows show the same passages.

## Two phases

**On `develop`, the database only gains.** Tables and rows are added; nothing is
dropped, renamed or deleted, so `main` keeps loading everything while `develop`
is built and tried against the same Supabase project. `develop`'s code simply
stops reading what phase two removes.

**After `develop` is merged into `main`** and the new publication is public, one
cleanup migration removes what nothing reads any more (see Cleanup).

## Documents

### Identity

A document's id is `<lab>--<document>@<version>`:

- `anthropic--constitution@2026-01-20`
- `openai--model-spec@2025-12-18`
- `openai--model-spec@2026-08-18`

`aci_specs.id` becomes `<lab>--<document>`. The double hyphen separates the lab
from a document name that may itself carry single hyphens, and a lab that
publishes a second document gets a second name (`openai--usage-policies`). No lab
id contains a hyphen, so the split is never ambiguous. The version label stays a
date, `YYYY-MM-DD`.

This id is used everywhere a document is named: the portal's lists, the reader's
`?spec=` parameter and panel ids, the MCP tools, and the head of every locator
(`openai--model-spec@2026-08-18 > #overview > ¶2`). There is no compatibility with
the old `?spec=anthropic` / `?spec=openai` links.

The locator grammar does not change. `cite.py` accepts document names matching
`[a-z-]+` (`SPEC_NAME_RE`, and the head parser at `cite.py:374`), and
`openai--model-spec` already matches. The registration route refuses a document
name containing `--`, so the separator appears exactly once.

Reader ids now carry `@`, which the old `anthropic` / `openai` ids did not. The
reader must not build CSS selectors from a document id without escaping it.

### A version is judged as itself

- `harness.passages(spec)` becomes `passages(spec, version)`, and `batch_job`
  passes the call's own version. The "newest" default disappears from judging.
- The anchor rule (`spec == "model-spec"` at `harness.py:251`) reads the
  document's `locator_style` from `aci_specs` instead, carried through
  `index_store.spec_registry`'s metadata.
- `compose_run.plan` and `publish.publish` take document version ids instead of
  spec ids. `newest_version_per_spec` is removed.
- `index_store.documents` returns one entry per version, with `id`
  `<lab>--<document>@<version>`, and `lab`, `title`, `shortTitle`, `version`,
  `sourceUrl`, `markdown`.

### In the database (phase one)

New `aci_specs` rows `anthropic--constitution` and `openai--model-spec`, copying
lab, title, short title, source url and locator style from `constitution` and
`model-spec`. New `aci_spec_versions` rows under them, copying label, markdown,
digest, source url and author from the existing versions. `unique (spec_id,
content_sha256)` is per document, so the copies are allowed. The old rows stay
for `main`.

`openai--model-spec@2026-08-18` is registered through the portal from the
markdown at `openai/model_spec` (`model_spec.md` at the "Release 2026-08-18"
commit), with source url `https://model-spec.openai.com/2026-08-18.html`.

### In the portal

- **Register a version** asks for the lab (the list already reads `aci_labs`)
  and the document name, and composes `<lab>--<document>`.
- **Runs** and **Publications** list every version as its own document:
  "Claude's constitution 2026-01-20", "OpenAI Model Spec 2025-12-18",
  "OpenAI Model Spec 2026-08-18". The forms post version ids.

### In the reader

Each document's panel header shows the document's title and version, not the lab
alone, since two documents can share a lab. Compare mode already takes any two
documents, so the two Model Spec versions can be read side by side.

## One panel

`display.panel` in `engine/panel/panel-config.json`, `frontier_fast`, is the
panel the portal composes and publishes with.

- The Runs form no longer offers a panel; it names the three judges it will use.
- The Publications form no longer asks for judges.
- `publish.py` passes `--panel=` to `build_site_data.py`, so the payload shows
  the judges of the publication rather than whatever the configuration says.
- The homogeneity rule stays as it is, in `publish.py` and in the database: every
  published cell judged by exactly the publication's panel, all done, in one run.
  With one panel it never refuses work done through the portal, and it is what
  guarantees each published cell has all three judges.

The other panels stay in the configuration file for the command line; nothing in
the portal offers them.

## Sets, human verdicts and the strict variant

- `build_site_data.py` displays exactly the behaviours a publication selects,
  ordered by group then name. `display_behaviours`' set filter, the
  `missing_cells` curation check, `SLUGS_EXTRA` and the read of
  `aci_cell_curation` are removed.
- The coverage entry's `verdict`, `depth`, `note` and `verifiedDate` (the human
  verdict) are replaced by the judged depth below.
- `build-spec-reader-data.py` stops carrying the frozen coverage ledger
  (`behaviours` in the documents payload). The reader reads only
  `documents.documents`, so nothing on screen changes.
- `app/lib/behaviours.mjs` stops reporting `set` in behaviour notes.
- The Behaviours page drops the Set column and field. The route still writes
  `set_name = 'user'` and numbers within it, because the column is `not null`
  until cleanup.
- The MCP caveat that passage counts are not comparable between documents
  (`COMPARABILITY` in `app/lib/mcp-tools.mjs`, the tool description in
  `app/api/mcp/route.js`, and `site/mcp.html`) is removed, as its own comment
  asks of the design that equalises the panels.

## Depth

### What a depth is

The rubric in `methodology/spec-coverage-depth-rubric.md`, unchanged: 0 absent,
1 named, 2 discussed, 3 prescribed, 4 demonstrated, with its boundary tests. It
measures how much a document gives an evaluator to work with for one behaviour.

### What the judge reads

For one cell (a behaviour on a document version) in one run, after every passage
call of that cell is done:

- the behaviour's brief and boundary;
- the rubric and its boundary tests;
- the passages the reader shows by default for the cell: the defining and core
  bands, computed from the cell's judgements with the reader's arithmetic
  (`app/lib/bands.mjs`), each with its section path.

The rubric scores depth on core excerpts only, which is why related passages are
left out.

### Who gives it

Each judge of the panel, in its own call. The publication averages the three.
Priced on the inherited run's retained passages (median 4 per cell, at most 18),
a depth call costs about $0.0007 with `deepseek`, $0.014 with `sol` and $0.049
with `fable`: about $0.06 per cell.

A cell with no retained passage gets depth 0 from every judge without a call:
nothing was found to grade.

### Storage

```sql
create table aci_depths (
  call_id           uuid primary key references aci_judge_calls(id) on delete cascade,
  status            text not null default 'pending'
                    check (status in ('pending', 'running', 'done', 'error')),
  depth             smallint check (depth between 0 and 4),
  rationale         text,
  passages          integer,          -- how many retained passages it was shown
  raw_output        text,             -- kept when a reply will not parse
  error             text,
  prompt_tokens     integer,
  completion_tokens integer,
  cost_usd          numeric(12, 6),
  seconds           numeric(10, 2),
  started_at        timestamptz,
  finished_at       timestamptz
);
```

One row per passage call: the depth that judge gave for that call's cell, in that
run. It hangs off the call the way `aci_judgements` does, and `main` never reads
it. Granted to `service_role` like the other `aci_` tables.

### In a run

- **Compose** writes a pending `aci_depths` row for every call it writes, and
  prices it into `estimated_usd` with a fixed allowance of 3,000 characters of
  passages (the inherited median is about 2,100). The depth prompt's digest is
  recorded in the run's `config`.
- **The job** executes passage calls as today, then, for each cell whose passage
  calls are all done, its depth rows. A depth reply that does not parse keeps its
  raw output and ends `error`, like a passage call.
- **Retry failed calls** also takes depth rows that are not done.
  `app/lib/runs.mjs` counts both kinds, and the Runs table shows passages and
  depths done separately.
- **Cancel** stops between depth calls as it does between passage calls.
- **Cost** sums passage and depth calls.

The prompt lives in `engine/panel/prompts/depth-v1.txt`. The reply is two lines,
`DEPTH: <0-4>` and `RATIONALE: <one sentence>`.

### In a publication

For each cell, the publication takes the run it already chooses (the newest run
that meets the homogeneity rule) and requires that run's three depths for the
cell to be done; otherwise it refuses and names the cells. The payload's coverage
entry for the cell carries:

```json
"depth": { "mean": 2.7, "judges": { "deepseek": { "depth": 3, "rationale": "..." },
                                     "fable":    { "depth": 3, "rationale": "..." },
                                     "sol":      { "depth": 2, "rationale": "..." } } }
```

The mean is rounded to one decimal.

### In the reader and the MCP server

- The behaviour menu shows, beside each behaviour, its mean depth for each
  document on screen, in mono, with the three judges' depths in its tooltip.
- The panel header for the selected behaviour shows "Depth 2.7 of 4" and the
  rubric's word for the nearest level.
- `list_model_specs` and `retrieve_passages` report the depth with each cell.

## The behaviours

- `concentration-of-power` is replaced by
  `avoiding-illegitimate-concentration-of-power`, "Avoiding illegitimate
  concentration of power", with the same brief. The first row was never judged
  and is deleted.
- New behaviour rows carry `added_by = 'Polaris Collective'`.
- The run judges the eleven behaviours with a brief: `helpfulness`,
  `harmlessness-to-the-user`, `harm-avoidance-to-third-parties`,
  `proportionate-risk-mitigation`, `how-to-approach-tradeoffs`,
  `avoiding-over-and-under-caution`, `objectivity-on-contested-questions`,
  `user-autonomy`, `animal-welfare-impacts`, `no-sycophancy` and
  `avoiding-illegitimate-concentration-of-power`.

## The run

1. A first run of one behaviour on one document, about $1, to see passages and
   depth land end to end.
2. One run: the eleven behaviours on the three documents, `frontier_fast`,
   credited to "Polaris Collective". 99 passage calls, about $34.65, and 99 depth
   calls, about $2.10: about $36.75 in estimates, which do not count the judges'
   reasoning.
3. One publication of all 33 cells, read as a draft, then made public.

## Cleanup (phase two)

One migration in `polaris-supabase`, after `develop` is merged and the new
publication is public:

- drop `aci_cell_curation` and `aci_coverage`;
- drop `aci_behaviours.set_name`, and the unique key that numbers within a set;
- drop `aci_publications.grandfathered`, its partial unique index and the
  trigger's exemption branch;
- delete the publications built on `constitution` and `model-spec` (the
  grandfathered one and the two verification drafts) and their cells;
- delete the runs, calls and judgements on those documents, then the documents
  and their versions;
- delete `general-welfare-impacts-strict`;
- decide then whether the twelve behaviours without a brief are deleted.

In the code: `engine/published-artefacts.sha256.json`, and the part of
`verify_supabase_provenance.py` that holds the grandfathered publication to it.

## Testing

Test first, as the repository does.

- **Engine.** A `<lab>--<document>` name resolves through `cite.py`.
  `passages(spec, version)` reads the named version and takes the anchor rule
  from `locator_style`. `plan` composes by version id, writes a depth row per call
  and prices it. `batch_job` runs depths only for finished cells, gives 0 without
  a call to a cell with no retained passage, keeps an unparsable depth reply,
  retries and cancels depths. The bands in Python match `app/lib/bands.mjs` over
  the same cases `bands.test.mjs` uses. `publish` takes version ids, passes the
  panel, refuses a cell without depths, and carries the mean. `build_site_data`
  keys coverage by document id and reads no set, curation or strict mapping.
- **Application.** `runs.mjs` counts depth rows. `mcp-tools` reports depth and no
  comparability caveat. The registration route refuses a document name
  containing `--`. The walker checks the forms post version ids and offer no
  panel, set or judge fields.
- **Reader.** `verify-reader-test.mjs` runs against a fixture whose document ids
  carry `--` and `@`, and checks the panel header names the version and the menu
  shows a depth.

## Out of scope

- Review by a human, per cell or per paragraph.
- Freezing a behaviour once judged and copying it to change it.
- Grouping documents by lab in the reader.
- Documents from labs other than Anthropic and OpenAI.
- Relaxing the homogeneity rule.
