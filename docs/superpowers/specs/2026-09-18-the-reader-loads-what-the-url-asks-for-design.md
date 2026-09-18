# The reader loads what the URL asks for

Date: 2026-09-18
Status: designed, not built

The reader downloads 7425 KB before it renders anything, and throws most of it
away. This document is the decision to send only what the address asks for,
without changing a single byte of what a publication stores.

## What is wrong today

Three routes are fetched in full on every page load, measured against
publication `9b7ce377`:

| column | size | what it holds |
|---|---|---|
| `payload` | 914 KB | 13 behaviours, 24 to 145 KB each |
| `documents` | 1161 KB | 4 documents, 186 to 428 KB each |
| `links` | 5350 KB | bubbles, comparisons, notes |
| total | **7425 KB** | on every page load |

Inside `links`, the weight is `byLocator` at 3380 KB over 976 locators and 5239
rows, `notes.passage` at 1012 KB over 1169 entries, and `comparisons` at 870 KB
over 52 entries. The depth and standing paragraphs together are 87 KB, and the
run list is negligible.

The reader already narrows all of this at render time. `linkBubbles` filters to
the pair on screen and to the ticked behaviours, and the document panel shows
one document, or two when comparing. So the greater part of those 7425 KB is
fetched, parsed, held in memory and never looked at.

What a realistic address actually needs, computed from the same publication:

| address | needs | share of today |
|---|---|---|
| one behaviour, one document | 483 KB | 7% |
| one behaviour, comparing two | 872 KB | 12% |
| three behaviours, comparing | 1134 KB | 15% |

## What is decided

**The routes take the reader's own vocabulary.** `spec`, `behavior` and
`compare-with` already exist in the URL, are already written by `syncURL` on
every interaction, and are already read on arrival. The routes learn to read the
same three and return only the slice they name. Nothing new is invented to
describe what the reader wants, because the reader has always said it.

**A publication is pulled once and sliced many times.** Slicing costs 0.4 ms;
pulling the column costs a round trip. So the column is read once per
publication into a module level map keyed by publication id, and every request
for that publication is served from it. This is not a cache with an invalidation
problem: a publication is immutable, so the entry is a constant that happens to
be fetched late. The unpinned route resolves which publication is current first,
then reads the same map by that id, so the short `s-maxage=60` window on the
current publication continues to govern freshness.

**The client fetches at four moments**, and merges rather than replaces:
choosing a document, ticking a behaviour, pressing compare, and following a
`?passage=` link into a paragraph no loaded behaviour cites. The fourth is the
one that is easy to miss: `app.js` already adds the first citing behaviour to
the selection when a passage link lands outside it, and under lazy loading that
behaviour may not be in memory yet.

**An empty selection becomes writable.** `syncURL` deletes `behavior` when
nothing is ticked, which produces exactly the URL a fresh arrival produces. The
arrival rule already distinguishes the two cases correctly, taking the first
behaviour when the parameter is absent and honouring a list when it is present,
so unticking everything and reloading silently reselects. The parameter is
written with an explicit empty value instead of being deleted, so that "none"
survives a reload.

**A requested slug is validated against what exists, not against what is
loaded.** The arrival rule filters `?behavior=` against `state.payload.behaviours`.
That is sound while all thirteen are loaded and wrong the moment they are not: a
legitimate slug would be dropped without a word. The validation set is the
behaviour registry, which is 14 rows and 1.8 KB as slug, name and group. Whether
it rides on the existing `/api/reader/behaviours` response or on a smaller
dedicated one is an implementation choice; what is decided is that the set comes
from the registry.

**Nothing that is stored changes.** Same columns, same digests, same
`build_params`, same provenance verifier, same publication row. The digest
describes the bytes a publication holds; what crosses the wire is a projection
of those bytes, and a projection cannot falsify the thing it projects.

## Why the filtering happens in the route

PostgREST reaches inside a `json` column by key: `links->notes->depth` returns
24 KB where the whole column is 5350 KB. That works for the depth and standing
paragraphs, for the run list, and for a single comparison, whose key is
`behaviour \n docA \n docB` and is therefore fully known from the URL.

It does not work for the three heaviest slices, because each needs a predicate
rather than a key. Documents must be filtered by id, behaviours by slug, and
`byLocator` twice over: by the document its key names, and by whether each row's
`behaviours` array intersects the set the URL asks for. That array is the reason
a behaviour slice is a union and not a partition: one row can belong to several
behaviours, and 5239 rows carry one.

Two alternatives were considered and rejected. A Postgres function called over
RPC would keep the transfer small, but `app/lib/supabase.mjs` exposes `select`,
`insert`, `update`, `upload` and `signedLink` and no RPC path, and the filtering
rules would become a second copy of the selection logic, written in SQL, far
from the one copy in `app/lib/links.mjs`. This repository has already published
wrong depth figures off exactly that kind of duplication, when
`bands.shown_by_default` drifted from the reader's own `DEFAULT_BANDS`. Storing
the links pre-sliced at publication time would make every slice a key lookup,
but it changes what a publication stores, which is the one thing this design
refuses to touch.

## Why not React

The reader is 4898 lines of framework-free JavaScript served as a static file,
and it is already a client side state machine: `setSelection` mutates state,
toggles classes, writes the URL through `history.replaceState` and reapplies
highlights, without reloading. The dynamism being asked for at the interaction
level already exists. What is missing is fetching at those moments, which is
work in the routes and in when the existing client calls them.

Rewriting the renderer would replace something that works, would not shorten
this design by a line, and would put the reader's behaviour at risk for no gain
that anyone has asked for. The two questions are orthogonal, and the answer to
this one is no.

## What changes, file by file

`app/lib/feedback.mjs` is the seam's other consumer, and was missed when this was
written: `resolvePublication` calls `publicationColumn("id", ...)` to decide which
publication a note is about. It asks for a column the slicing does not know and goes
through `publicationColumn` rather than `readerResponse`, so it is never sliced. It is
named here because a change to this seam reaches it, which is how its tests came to
need adjusting.

There is one seam, not four. Each of the three reader routes is the same three
lines: it hands its whole `searchParams` to `readerResponse` and returns what
comes back. `spec`, `behavior` and `compare-with` are therefore already arriving
at `readerResponse` today and are simply ignored there. The slicing belongs in
that one function, and the route files need no change at all.

| where | change |
|---|---|
| `app/lib/publications.mjs` | the whole of the work on the server: the column is read once per publication id and held, and `readerResponse` slices what it already receives, by column |
| `app/api/reader/{payload,documents,links}/route.js` | nothing. They pass `searchParams` through already |
| `site/spec-reader/app.js` | fetches at the four moments and merges; `syncURL` writes an empty `behavior` rather than deleting it; the arrival rule validates against the registry |
| `engine/reader-routes.mjs` | answers `/api/reader/links`, so the walkers exercise the pin instead of the failure path |

## What it buys and what it costs

A first paint of roughly 480 KB instead of 7425 KB, and 872 KB when comparing.
The reader stops parsing and holding five megabytes it never shows.

The cost is that the client now has partial data and must know it. Every place
that reads `state.payload.behaviours` as though it were the whole set becomes a
place that can be wrong, and the merge on each increment is the fiddly part of
the work rather than an afterthought. A behaviour ticked twice must not be
fetched twice, and a fetch in flight must not be raced by its own repeat.

## What this does not do

It does not change what a publication is, what it stores, or how it is verified.
It does not touch the migration, `publish.py`, the builders or
`verify_supabase_provenance.py`.

It does not add server side caching anywhere else. No route in this application
holds anything between invocations today, and this design introduces exactly one
such hold, justified by immutability and keyed by publication id.

It does not leave the coverage gap recorded in `CLAUDE.md` where it found it.
The pin forwarding in `loadReaderLinks` is exercised today by neither a unit test
nor a browser walker, because `engine/reader-routes.mjs` does not answer
`/api/reader/links`, and this work would widen that gap by adding three more
fetch moments to the same untested path. So the fixture server learns that
route, as the table above says, and the walkers exercise a pinned reader rather
than the swallowing path.

What does stay out is a unit test for the URL construction itself. It is as
absent for its three siblings as it is here, the only `app.js` harness extracts
pure synchronous functions as text, and inventing a harness for the fourth
instance of an untested pattern is not this work's job.

## Where the pieces are

The measurements above are from publication `9b7ce377-d2eb-452e-a8fc-4552a7801487`,
52 cells, 13 behaviours over 4 documents, taken on 2026-09-18. Per document:
`alibaba--model-spec@2026-04-00` 428 KB, `openai--model-spec@2026-08-18` 276 KB,
`openai--model-spec@2025-12-18` 272 KB, `anthropic--constitution@2026-01-20`
186 KB. Comparisons run 181 to 234 KB per document pair, 13 entries each. A cell
of passage notes, one behaviour against one pair, has a median of 14 KB and a
maximum of 45 KB across 50 cells.

The URL is written by `syncURL` in `site/spec-reader/app.js` and read on arrival
in the same file, where `?behavior=` takes a comma separated list and an absent
parameter opens on the first behaviour. The assembly the routes slice is
`app/lib/links.mjs`, entered at `readerLinks`.
