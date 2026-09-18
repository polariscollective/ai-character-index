# Links belong to a publication

Date: 2026-09-18
Status: built and reviewed

The reader serves two frozen columns and one live query. `payload` and
`documents` are bytes copied into the publication row and held to a digest; the
bubbles, the comparisons, the arbitrations and the paragraph notes are fetched
from the live tables every time someone opens the page. This document is the
decision to make the third one behave like the first two.

## What is wrong today

Two things, and the second is the one that will bite.

Pinning an old publication does not give you that publication. `?publication=<uuid>`
serves the documents and the payload that were frozen into that row, and then
lays over them whatever the link tables hold right now. A reader comparing
yesterday's publication is reading yesterday's text under today's bubbles, with
nothing on the page saying so.

Writing to the tables changes what the public sees. Over 2026-09-17 and
2026-09-18 a generation of 739 paragraph notes went into `aci_passage_notes`,
and every one of them was
live on the site the moment the write committed, with no publication, no review
and no deploy. That is not a hypothetical: it is what happened, and the only
reason it was safe is that the text was good.

Underneath both sits a rule nobody would defend if it were proposed today.
`panelRuns()` in `app/lib/links.mjs` decides which runs the public sees like
this:

```js
runs.filter(run => run.status === "done"
  && String(run.created_by || "").startsWith("link_self.py"));
```

The prefix of the script name that launched a run is what keeps an early pilot
off the site. It works, and it is a filter on a string, not a decision anyone
recorded.

## What is decided

Three choices, taken in that order.

**A frozen copy, not a selection by foreign key.** The schema already has both
patterns: frozen bytes with a digest for `payload` and `documents`, and a
selection table for `aci_publication_cells`. Locators are free text. There is no
paragraph table, so `aci_links.source_locator` points at nothing a foreign key
could hold, and a selection would leave the addresses themselves unpinned. Only
a copy freezes the addresses along with the text.

**The column carries what the reader is served**, which is the object
`readerLinks()` returns today:

```
{ documents, runs, byLocator, comparisons, notes: { passage, depth, standing } }
```

Bubbles, arbitrations, comparisons, the "in short" notes and the depth and
standing paragraphs are all in there, because the route already assembles all of
them. The making of them is not: runs, calls, costs, raw output and finish
reasons stay in the live tables, where they are already readable per run.

**The publication names its runs.** `publish.py` gains `--link-runs`, required,
the way `--cells` already names the cells the payload is built from. The filter
on the script name goes.

**Document notes are pinned by their prompt, because they have no run.**
Everything else in the column is reached through a run id, and document notes
cannot be: `aci_document_notes` carries no run and cannot honestly gain one,
because its rows were imported from two JSON files in a single batch and its
unique key ends in `prompt_sha256`. The prompt is the identity of a document
note, so the prompt is what a publication pins, `--note-prompts`, recorded in
`build_params` beside the runs. This is not a convenience standing in for a run
id; it is the only honest key the table has.

Absent and empty are different answers, and the distinction is load-bearing. No
list at all means take every note, which is what a reader outside a publication
wants. A list that is present pins exactly what it names, including nothing: a
publication that pinned no notes must not silently acquire the ones written
afterwards.

## The builder is JavaScript, and that is the point

`build()` in `engine/publish.py` runs a builder as a subprocess, reads the bytes
it wrote, digests them and decodes them. Both existing builders are Python.
Writing a Python builder for the links would mean a second copy of the assembly
logic that lives in `app/lib/links.mjs`, and this repository has already paid for
that mistake once: `bands.shown_by_default` drifted from the reader's own
`DEFAULT_BANDS`, and the depth figures published off the difference were wrong
until somebody asked why one cell read 1.0.

So the builder is `engine/build-links-data.mjs`, and it imports the assembly it
already has. `build()` learns to launch `node` as well as `python3`, chosen per
builder. The logic moves out of the route and into the builder; it is not
duplicated.

## The judging image gains an interpreter

Publishing is one of the three modes of the judging image, so the image is where
the builder has to run. It carried Python only. It gains a Node runtime, and
copies exactly two library files: `app/lib/links.mjs` and the
`app/lib/supabase.mjs` it imports in turn, which are the whole of the builder's
import graph. Not the site, not the reader, not Next, and not the rest of
`app/lib` either.

That is the price of the previous decision, and it is worth naming rather than
discovering at deploy time: choosing not to duplicate the assembly means the
container that publishes must be able to execute the language the assembly is
written in.

## The portal carries the choice

Publishing is a portal operation, so a flag `publish.py` requires is a control
an operator has to be given. Without that, `--link-runs` would be a required
argument nothing could supply, and the portal's build button would refuse every
publication.

The chain is a `Link runs` group on the build form, through `publishJobParams`
in `app/lib/publish.mjs`, the admin route, the `aci_jobs` row, and
`engine/job.py`'s `run_publish`, which passes `link_runs` to `publish()`. The
route refuses a build naming no link run, in the same breath as it refuses one
naming no behaviour and no document.

The note prompts are not on the form, and that is deliberate. They are derived
at build time from the digests present in `aci_document_notes`, because an
operator choosing prompt digests from a list would be choosing between things
the form cannot meaningfully describe.

## What changes, file by file

The schema change is a pull request in `polaris-supabase`, which is the only
repository that migrates these databases. It must land first, because
`aci_publications` is insert only and a row cannot be filled in afterwards.

| where | change |
|---|---|
| `polaris-supabase` | `aci_publications` gains `links` (`json`) and `links_sha256` (`text`), nullable, with a check that they are null together |
| `engine/build-links-data.mjs` | new: takes `--link-runs`, `--note-prompts` and `--out`, imports the assembly, writes the JSON |
| `engine/publish.py` | entries in `FORMATS` and `BUILDERS`; `build()` picks the interpreter; `--link-runs` required; the note prompts derived and recorded |
| `app/lib/links.mjs` | the assembly becomes what the builder calls; `panelRuns()` and its filter go; `readerLinks` takes the runs and the note prompts |
| `app/api/reader/links/route.js` | serves the resolved publication's column, as the payload route does |
| `site/spec-reader/app.js` | forwards its `?publication=` pin to the links route, as it already did to the other three |
| `app/lib/publish.mjs`, the admin route | a `Link runs` group on the build form, carried through to `engine/job.py` |
| `Dockerfile` | a Node runtime, and the two library files the builder's import graph reaches |
| `engine/verify_supabase_provenance.py` | its two loops move from two columns to three, skipping a publication carrying null |

The two columns are nullable, and they move together. Every row that exists
predates them and `aci_publications` is insert only, so there is nothing to
backfill; but a digest without its bytes describes nothing, and the verifier
skips a publication on `links is null` and would then read `links_sha256` on a
row that has one. The halfway state is the single shape that crashes the
verifier rather than failing it, so the migration forbids it.

`json` and not `jsonb`, for the reason the repository already recorded: jsonb
reorders keys on the way in, which breaks the digest permanently and silently.

## What it buys and what it costs

A pinned publication serves its own bubbles, its own comparisons and its own
arbitrations. Nothing on the site changes because a table was written to.
Rebuilding is cheap, because `publish.py` calls no model: it selects, assembles
and inserts. A draft is written not public, so it can be read before anyone sees
it, and the previous publication stays reachable by its own link.

The cost is stated plainly: a corrected note does not appear until the next
publication is built and made public. That is the thing being bought, not a
side effect.

## Deployment order, and the gap it opens

The order is forced, and it has a visible consequence that must be accepted
before any of it ships.

The migration lands first, because `aci_publications` is insert only and a row
cannot be filled in afterwards. The code follows. Only then can a publication be
built with `--link-runs`, read as a draft, and made public.

Between the code deploying and that publication being made public, the site
shows nothing about links at all. The publication that is public today predates
the column and carries null in both halves of it; `/api/reader/links` answers
404 for such a row, and the reader catches that and renders as it did before any
of this existed. No bubbles, no comparisons, no "in short" notes. That is not a
regression to be fixed but the direct consequence of deciding that links belong
to a publication: a publication that never carried them has none to show.

The gap closes when a publication carrying the column is made public, and not
before. The operator was told this plainly and accepted it.

## What this does not do

The changelog stays out. `aci_publications.notes` already exists, is written by
`--notes` at publication time and is already displayed by `site/overview.js` and
the reader, so it is the right carrier; what is missing is a public route
listing publications, since only `/api/reader/publication` (singular) and an
admin route exist. That is a second piece of work which benefits from this one
and does not depend on it.

The passages table with real paragraph ids stays out too, deferred by the
operator. Until it exists, locators remain free text recomputed by two
independent implementations, `engine/spec-cite/cite.py` and the port in
`site/spec-reader/app.js`, and freezing them in the publication is what keeps a
pinned page honest in the meantime.

The pin forwarding stays untested, and it is named here rather than left to be
discovered. `loadReaderLinks` builds a pinned URL the way three sibling call
sites do, and none of the four carries a unit test; the only `app.js` harness
extracts pure synchronous functions from the file as text, which this is not.
The part that was got wrong is the reason recorded for accepting that: the
browser walkers do not cover it either. They run against
`engine/reader-routes.mjs`, which answers `/api/reader/documents` and
`/api/reader/payload` and not this route, so a walker's reader takes the
swallowing path and renders with no bubbles, never building a pinned URL at all.
That was checkable when it was claimed. Closing it means either a harness for
async functions that touch module state, or teaching the fixture server this
route, and the second is much the cheaper of the two.

## Where the pieces are

What is being attached, as of 2026-09-18: 1169 passage notes, 78 document
notes, 53 comparisons, 252 arbitrations, and 3052 of the 3228 links. Those
links sit in five runs, and the filter on the script name is what makes it
3052 rather than 3228: it drops `cc8930bd` whole, 176 links written by
`compose_links.py`. Naming the runs in the publication is what replaces that.
The public publication is `1919ee6b`, published 2026-09-16, citing 785
locators. Every link source is one
of those 785; 196 of the 847 distinct targets are not cited by the payload,
which is expected, because a paragraph answering a cited one need not itself
have been cited.

The assembly is `app/lib/links.mjs`, entered at `readerLinks()`. The publication
builder is `engine/publish.py`, with `FORMATS` and `BUILDERS` near its head. The
verifier is `engine/verify_supabase_provenance.py`. The reader consumes the
result in `site/spec-reader/app.js`, through `linkRows`.
