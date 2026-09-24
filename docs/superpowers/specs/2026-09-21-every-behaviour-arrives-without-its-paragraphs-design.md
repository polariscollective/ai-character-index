# Every behaviour arrives, its paragraphs do not

> Design doc, 2026-09-21. The reader opens with all thirteen behaviours, each
> carrying its title, its definition, its depth and its comparison, and with the
> paragraphs of only the behaviours the address names.

## The problem

The reader was taught to send only what the address names, and the measurement
holds: a page load fell from 7425 KB to a few hundred. What it broke is the
menu. `behaviourGroups` builds the sidebar from `state.payload.behaviours`,
which is now the sliced payload, so a link naming one behaviour lists one
behaviour and the other twelve are not there to tick. The count above the list
already reads "1 of 13", because `updateBehaviourCount` totals on the registry
while the list beneath it totals on what arrived.

That is a regression from `2026-09-18-the-reader-loads-what-the-url-asks-for`,
it is on the development deployment, and it is the reason this document exists.

The same shape costs the overview, which reads 52 figures and a paragraph per
cell and pulls 2062 KB to do it.

## What a page reads, and what it is sent

Measured against publication `9b7ce377`, 13 behaviours over 4 documents.

| column | whole | what the first screen reads |
|---|---|---|
| `payload` | 888.9 KB | the depths, definitions and titles, about 7 per cent |
| `documents` | 1069.8 KB | 0.96 KB of metadata, plus the text of the one on screen |
| `links` | 5324.2 KB | 88 KB, the depth and standing notes |
| `behaviours` | 15.8 KB | all of it |

Every figure in that table is wire bytes at 1024 bytes per KB. An earlier
version recorded 913.7, 1161.2 and 5349.9, taken by re-serialising each response
in Python, which escapes non-ASCII and therefore inflates: by 2.8 per cent for
the payload, 8.5 for the documents whose text is the most heavily non-ASCII, and
0.5 for the links. The proportions below are given as proportions for that
reason, since they hold whichever instrument is used.

The payload is passages and almost nothing else: about 93 per cent of it. A
coverage entry carries exactly three keys, `passages`, `depth` and
`substitutions`, so the thing worth sending without the paragraphs is already a
clean subset. A document is almost entirely `original` and `markdown`, with
`id`, `lab`, `title`, `shortTitle`, `version`, `sourceUrl` and `translation`
weighing 0.96 KB for all four together. `translation` is on one document of the
four, the Alibaba spec, which the index reads in translation and says so.

## What is decided

**The first load carries every behaviour and one behaviour's paragraphs.** Title,
definition, depth and recorded substitutions for all thirteen; the paragraphs of
those the address names. The sidebar is complete on arrival, with its figures,
and the text of a behaviour arrives when it is ticked.

**Documents travel the same way.** Every document's metadata always, the text of
the ones on screen. `loadDocuments` passes no slice today, so the reader fetches
four documents to show one.

**No new word in the URL.** `spec`, `behavior` and `compare-with` are what the
reader already writes and reads. What changes is what they govern: `behavior`
stops meaning "which behaviours" and means "whose paragraphs", `spec` stops
meaning "which documents" and means "whose text". Absent still means everything
and present-and-empty still means nothing, unchanged in both cases, because that
distinction is what lets a reader untick everything and reload.

**Withheld is a third state, not an empty one.** A coverage entry whose
paragraphs were not asked for carries `depth`, `substitutions` and no
`passages`, plus a marker saying they were withheld. It must not carry
`passages: []`. This repository has already recorded why: a reader reads an
empty behaviour as "this specification says nothing about this", which is the
one claim the index must never make by accident. Absent, empty and not-requested
are three different claims and the bytes have to tell them apart.

`NO_COVERAGE`, which is `{ passages: [] }` at `app.js:367`, keeps its meaning and
its two call sites. It stands for a document key that is genuinely missing, which
is still a real answer.

**Nothing stored changes.** Same columns, same digests, same `build_params`, same
publication row, same verifier. What crosses the wire is a projection of the
frozen bytes, and a projection cannot falsify what it projects.

## What it buys

| | today | decided |
|---|---|---|
| reader, one behaviour and one document | 1339 KB | about 516 KB |
| overview | 2062 KB | about 235 KB |

The reader's 516 KB is 155 for the payload, 184 for the document, 161 for the
links and 15 for the registry. It moves with which behaviour and which document
the address names.

**This document does two things, and only one of them is about bytes.**

The first is the menu, and it is cheap rather than free. Measured on the wire at
1024 bytes per KB, the decided payload is 155 KB against 93 KB today, so listing
every behaviour costs about 62 KB. Roughly half of the 155 is the `citedBy`
index, which the response carries whenever a behaviour set is present and which
the sidebar never follows.

An earlier version of this document said 92.2 against 93 and concluded the menu
was free. It was wrong in a way worth recording rather than quietly fixing: the
92.2 came from reconstructing the shape in Python instead of measuring a
response, so it omitted `citedBy` altogether, and it was compared against a 93
taken with curl, which included it. Two errors pointing the same way, and the
conclusion they produced flattered the change.

The second is `documents`, 1070 KB down to 184, and that is the whole of the
saving. It comes from `loadDocuments` learning to pass the slice the other three
loaders already pass, which is an omission from the previous chantier rather
than a new idea.

The links are unchanged here and stay at 161 KB. They were cut by that chantier
and cut again on the overview, where asking for both sets empty took them from
5324 KB to 88.

## Where the work is

| where | change |
|---|---|
| `app/lib/slice.mjs` | the behaviour filter becomes a paragraph filter and the document filter a text filter; both keep every entry and cut inside it |
| `app/lib/publications.mjs` | nothing. The seam already receives these parameters |
| `site/spec-reader/app.js` | the sidebar builds from the full set; four unguarded readers learn the third state; `loadDocuments` passes its slice |
| `site/overview.js` | asks for the new shape on both columns |
| `engine/panel/test_appjs_*.js` | the harnesses that read the menu and the figures |

### The four readers that would throw

A coverage entry without `passages` is `undefined` where these expect an array,
so they fail rather than degrade. Each is named because each needs a different
answer, not the same guard pasted four times.

- `selectedPassageTotal` (1602) counts paragraphs for the export's hint. A
  withheld cell is not zero paragraphs, it is an unknown number, and the hint
  should say so rather than undercount.
- the export (1673, 1681) prints "No mapped passages in this specification.
  Absence of coverage is an index finding, not missing data." That sentence is
  a finding of the index and must never print for a cell nobody asked for.
- `annotatePassages` (2918) falls back to `NO_COVERAGE` only when the document
  key is missing entirely, so a withheld entry walks straight past the fallback
  into the `forEach`.
- the published count (3634) feeds the "nothing resolved" warning, which would
  otherwise accuse the reader of an anchoring failure that never happened.

`applyPanelThreshold` already guards, `if (!cov.passages) return;` at 4447, and
it runs on every merge from five call sites. The hot path survives untouched, and
that is why this is a contained change rather than a rewrite.

### The colour fixes itself

`behaviourHue` is `payloadBehaviours().indexOf(behaviour)`, a colour drawn from
position in the loaded array. Under a sliced payload that shifts as behaviours
arrive. With every behaviour present from the first load the array is complete
and in publication order, so the defect closes by construction and no line is
written for it. It stays fragile, and a later change that makes the array
partial again would reopen it silently.

## What this does not do

It does not change what a publication is, what it stores or how it is verified.
It does not touch the migration, `publish.py`, the builders or
`verify_supabase_provenance.py`.

It does not add caching. The hold introduced by the previous design, one column
per publication id, is the only one and stays the only one.

It does not fix `citedBy` carrying positional ids rather than slugs, recorded as
a finding in the previous chantier and still true.

## What is worth knowing

The comparison a behaviour carries exists only between two documents. With one
document on screen there is nothing to compare, so a comparison arrives when the
reader opens a second one, which is also when the bubbles arrive. That is the
behaviour the previous chantier shipped and this design does not change it.

The public publication `1919ee6b` carries no links column, so on the public site
the notes and comparisons are absent whatever this design does. That is the
standing condition recorded in `CLAUDE.md` and it ends when a publication built
with `--link-runs` is made public.
