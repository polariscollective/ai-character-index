# Links belong to a publication

Date: 2026-09-18
Status: designed, not built

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

## What changes, file by file

The schema change is a pull request in `polaris-supabase`, which is the only
repository that migrates these databases. It must land first, because
`aci_publications` is insert only and a row cannot be filled in afterwards.

| where | change |
|---|---|
| `polaris-supabase` | `aci_publications` gains `links` (`json`) and `links_sha256` (`text`) |
| `engine/build-links-data.mjs` | new: takes `--link-runs` and `--out`, imports the assembly, writes the JSON |
| `engine/publish.py` | entries in `FORMATS` and `BUILDERS`; `build()` picks the interpreter; `--link-runs` required |
| `app/lib/links.mjs` | the assembly becomes what the builder calls; `panelRuns()` and its filter go |
| `app/api/reader/links/route.js` | serves the resolved publication's column, as the payload route does |
| `engine/verify_supabase_provenance.py` | its two loops move from two columns to three |

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
