# A public MCP server for the index — design

Date: 2026-09-12
Status: approved, not started

## Why

The index answers one question well: where does a model specification address a
behaviour, and how strongly. Today that answer is reachable two ways. A person
opens the reader and ticks a behaviour. A program fetches
`/api/reader/payload`, 286 KB of JSON, and reimplements the reader's band
arithmetic to make sense of it.

Neither serves the reader's actual audience. People building adherence evals
want the passages for one behaviour, quoted and located, without learning the
payload's shape. An agent asked "what does the OpenAI model spec say about
user autonomy" should be able to ask the index rather than read 271 KB of
specification.

An MCP server is the shape of that. Three read-only tools over the published
index, on the same Vercel application that already serves the reader.

## Public, and what that means

The server takes no credentials and issues none.

Nothing here is disclosed that is not disclosed already. `/api/reader/payload`
and `/api/reader/documents` serve exactly this data, unauthenticated, to anyone
who loads the reader. The MCP server is a second shape over the same rows, not
a second door into the database. It reads the newest public publication, the
same one the reader resolves, through the same `publicationColumn`.

What being public does cost:

- **No per-caller limit.** Anyone may call it as often as they like. The
  mitigation is that the work per call is small and cacheable, and that the
  expensive argument shape is refused rather than served. See *Size and cost*.
- **No audit of who asked.** Acceptable: every answer is derived from a
  published artifact, and the publication id travels in the response, so any
  answer can be checked against the site.

The service role key stays where it is, in the route, never in a response.

## Scope

One route, three tools, one page. No writing, no judging, no authentication, no
resources and no prompts in the MCP sense — tools only.

Out of scope, and deliberately:

- Serving specification markdown. The two documents are 185 KB and 271 KB.
  Anyone who wants the whole text has `source_url`.
- Anything the admin surface will own: registering a spec, composing a run,
  publishing. Those need identity, and this server has none.
- Pinning to an arbitrary publication. The server answers from the newest
  public one and says which it read. A pinned-publication argument is a small
  later addition if anyone asks for it.

## The data, as it stands

Checked against the newest public publication
(`3114dd65-c6f2-5cb3-bf98-af5b314381c3`, published 2026-09-10) in the session
that wrote this document.

| | |
|---|---|
| model specifications | 2 |
| behaviours | 10 |
| passages | 363 |
| passages at the reader's default bands | 103 |
| payload column | 286 KB |
| documents column | 508 KB, of which 457 KB is markdown |

The two specifications are `anthropic` (Anthropic, Claude's Constitution,
version 2026-01-20) and `openai` (OpenAI, Model Spec, version 2025-12-18).

Every cell of the published payload carries verdicts from exactly three judges:
`sol`, `fable`, `deepseek`. The unequal-panel defect recorded in `CLAUDE.md`
does not show up as extra verdicts, because the payload keeps the
`frontier_fast` trio only. It shows up as passage counts: a cell swept by six
judges surfaced more candidate passages than a cell swept by three.
`avoiding-over-and-under-caution` holds 31 passages against the constitution and
5 against the model spec, and part of that gap is the sweep, not the documents.

## The three tools

Names are British throughout — `behaviours`, not `behaviors`. The payload keys,
the `aci_` columns and the site's copy are all British. The `?behavior=`
exception in the reader exists because links to it were already shared, which
does not apply to a surface nobody has linked to yet.

### `list_model_specs`

No arguments.

```json
{
  "publication": { "id": "3114dd65-…", "published_at": "2026-09-10T14:05:25Z" },
  "model_specs": [
    { "id": "anthropic", "lab": "Anthropic", "title": "Claude's Constitution",
      "version": "2026-01-20",
      "source_url": "https://www.anthropic.com/news/claude-new-constitution",
      "behaviours_judged": 10, "passages": 194 }
  ]
}
```

`passages` is the count over all bands, not the default ones: it describes what
the index holds, and a count that moved with a display default would be a worse
number to publish.

### `list_behaviours`

No arguments.

```json
{
  "publication": { "id": "3114dd65-…", "published_at": "2026-09-10T14:05:25Z" },
  "behaviours": [
    { "slug": "helpfulness", "name": "Helpfulness",
      "group": "Behaviours under test",
      "definition": "The model should be genuinely and substantively helpful…",
      "boundary": "The construct is the value placed on helpfulness itself plus what genuine…",
      "source": "behaviours-for-adria (Definition as supplied)",
      "coverage": {
        "anthropic": { "passages": 29, "strongest": "defining" },
        "openai": { "passages": 7, "strongest": "defining" }
      } }
  ]
}
```

`definition` is the brief the panel was given (`judging.query` in
`aci_behaviours`), which is what the numbers were produced against, not the
index's display copy. `boundary` is what the construct is not. `source` is
where the definition came from.

One behaviour of the published set, `general-welfare-impacts-strict`, was
judged with no brief on file. It gets `"definition": null` and an explicit
`"note": "Judged without a recorded brief. What the panel was asked survives
only in the judge calls."` Saying so is the point; a silent null would read as
a behaviour nobody has defined, which is a different and false claim.

`strongest` is the highest band any passage in that cell reaches, or `null`
where the cell is empty.

### `retrieve_passages`

Plural, because it returns many.

| argument | required | default |
|---|---|---|
| `behaviours` | yes, at least one slug | — |
| `model_spec_ids` | no | every specification |
| `strength` | no | `core` |
| `limit` | no | 40 passages per page, maximum 200 |
| `cursor` | no | the first cell |

`behaviours` is required and non-empty. Everything else has a default that
answers something useful.

`strength` means *this band and stronger*: `defining`, then `core`, then
`related`. The default, `core`, returns defining and core passages, which is
what the reader shows before anyone touches a toggle.

`limit` and `cursor` are the paging pair, and *Order and paging* below says
what they do.

```json
{
  "publication": { "id": "3114dd65-…", "published_at": "2026-09-10T14:05:25Z" },
  "model_specs_read": [
    { "id": "anthropic", "lab": "Anthropic", "title": "Claude's Constitution",
      "version": "2026-01-20", "source_url": "https://…" },
    { "id": "openai", "lab": "OpenAI", "title": "Model Spec",
      "version": "2025-12-18", "source_url": "https://…" }
  ],
  "comparability": "Passage counts are not comparable between these two documents…",
  "panel": { "method": "llm-panel whole-document judging", "rubric": "v5",
             "config": "frontier_fast", "judges": ["deepseek", "fable", "sol"],
             "run_date": "2026-08-17" },
  "results": [
    { "behaviour": "helpfulness", "model_spec_id": "anthropic",
      "passages": [
        { "locator": "constitution@2026-01-20 > Being helpful > … > ¶1",
          "quote": "Being truly helpful to humans is one of the most important…",
          "strength": "defining",
          "judges": { "sol": "defining", "fable": "defining", "deepseek": "defining" } }
      ] },
    { "behaviour": "user-autonomy", "model_spec_id": "openai",
      "passages": [],
      "note": "No passages at this strength. Absence of coverage is an index finding, not missing data." }
  ],
  "next_cursor": { "publication": "3114dd65-…",
                   "behaviour": "animal-welfare-impacts", "model_spec_id": "anthropic" },
  "remaining": { "cells": 7, "passages": 31 }
}
```

`next_cursor` is `null` on the last page, and `remaining` is then zero on both
counts.

An unknown slug or specification id is an error naming what is available, not
an empty result: an agent that asked for `helpfulnes` should be told, not
handed silence that reads like a finding.

## Order and paging

A **cell** is one behaviour against one specification. It is the unit of this
tool: cells are never split across pages, and a passage is never separated from
the cell that gives it meaning.

**The order of cells** is the caller's own: behaviours in the order they were
listed, and within each behaviour the specifications in the order they were
listed, or the index's order when `model_spec_ids` was omitted. Predictable
without being arbitrary, and stable across pages because it depends only on the
arguments.

**The order of passages inside a cell is strongest first**, which is the order
the payload already holds: all twenty cells of the published payload are sorted
by score descending, verified in the session that wrote this document.

Not document reading order, and that is a decision rather than an oversight.
Recovering reading order server-side would mean resolving every locator against
the specification's own structure: the quotes are normalised, so half of them
cannot be found in the markdown by literal search, and the locator's section
path would have to be walked against the document outline. That is the citation
resolver's job, it is real work, and strongest-first is the better order for a
caller who is going to stop reading partway down.

**Paging.** `limit` is a budget in passages, not a hard cut. Cells are added to
a page whole until the budget is reached. A cell larger than the budget comes
back alone on its own page, because half a cell is worse than a big one: the
biggest cell in the published index holds 47 passages, roughly 25 KB, and that
is the real ceiling on one response.

`next_cursor` names the next cell to start from, and is passed back as
`cursor`. It is legible rather than opaque, which means a caller can see where
they are, and it carries the publication id it was issued against. A cursor
from a publication that is no longer current is an error saying so, not a
silent walk across two different indexes.

## What a passage is at the boundary

Four fields, and each earns its place.

`locator` and `quote` come from the payload verbatim. The quote is the
specification's own text at the version named in `model_specs_read`; the
locator resolves against that version through the citation resolver.

`strength` is the reader's band for that passage. `judges` is what produced it:
one entry per judge, keyed by the judge's identifier, in the rubric's own
vocabulary — `defining` (3), `core` (2), `adjacent` (1), `neither` (0). The two
vocabularies differ by one word, `related` against `adjacent`, because the
reader's third band is a display tier and the rubric's 1 is a verdict. The tool
descriptions say so.

Identifiers, not display names. The payload's `provenance` carries the panel as
identifiers and nothing carries their prose names except the `role` field this
design drops, so the response reports what the data holds: `panel`, copied from
`provenance`, names the method, the rubric, the panel configuration, the judge
identifiers and the run date, once per response rather than once per passage.

The payload's `role` field is dropped. It is the same information rendered as
prose (`"Model determined relevance (score 9/9):\n✓✓ GPT-5.6 Sol — defining…"`)
and it is roughly a third of a passage's weight.

Scores are not returned. A raw score is meaningless without the cell's judge
count and rubric scale, and an agent handed `9` will compare it to a `6` from a
cell that could not have reached 9.

## Comparability

A **request** that names more than one specification carries `comparability` on
every page, in plain words:

> Passage counts are not comparable between these documents. Some behaviours
> were swept by more judges against one document than against another, so that
> document surfaced more candidate passages for them. The bands each passage
> carries are sound; the totals are not a like-for-like measure of coverage.

Generic about which documents, deliberately, and that was a correction. The
sentence first named Claude's Constitution and the OpenAI Model Spec, which is
true of the publication the index carries today and false the moment a third
specification is registered: the field fires whenever a request names more than
one, so a caller asking about two others would have been handed a confident,
specific, wrong claim. The route's `instructions` says the same thing in the
same generic terms.

A single-specification request does not carry it. Nothing in such an answer
invites the comparison, and a caveat repeated on every call is a caveat an
agent learns to skip. The request rather than the page is what decides, because
a two-specification walk whose first page happens to hold one cell is still a
comparison being assembled.

The same sentence appears in the `retrieve_passages` description and on the MCP
page. When the nine missing calls on the model spec are filled, this field and
those two copies go together, and the design document for that work owns their
removal.

## Size and cost

Measured over the published payload, in the passage shape above:

| `strength` | passages | bytes | biggest cell |
|---|---|---|---|
| `defining` | 43 | 24 KB | 12 passages, 5 KB |
| `core`, the default | 103 | 57 KB | 18 passages, 7 KB |
| `related` | 363 | 214 KB | 47 passages, 25 KB |

So the whole index at the default strength fits in one answer, and only a
sweep at `related` genuinely needs paging. The numbers also set the ceiling: a
single response can never exceed the biggest cell, 25 KB today, because that is
the only case where a page overshoots its budget.

`behaviours` being required keeps a typical call to one cell pair, a few
kilobytes. `limit` and the cell-whole paging rule keep the worst one bounded.

The payload and documents columns are read once and held in module scope for 60
seconds, the same window as the reader route's `s-maxage`. Vercel gives no
guarantee about instance reuse, so this is a best-effort saving, not a
correctness assumption: a cold instance reads Supabase and answers correctly.

## Where the code lives

```
MCP client ──POST /api/mcp──► app/api/mcp/route.js
                                    │  mcp-handler + @modelcontextprotocol/sdk
                                    ▼
                              app/lib/index-snapshot.mjs  one row, memoised
                                    │
                              app/lib/mcp-tools.mjs       the three answers
                                    │
                                    ├──► app/lib/bands.mjs        band arithmetic
                                    ├──► app/lib/supabase.mjs     the one PostgREST caller
                                    └──► app/lib/behaviours.mjs   registry notes
```

| file | what it holds |
|---|---|
| `app/api/mcp/route.js` | the handshake, the three tool registrations and their schemas |
| `app/lib/mcp-tools.mjs` | the three answers, pure functions of a snapshot and arguments |
| `app/lib/index-snapshot.mjs` | the publication row and the registry notes, read once and memoised |
| `app/lib/bands.mjs` | the band cuts, lifted out of the reader |
| `site/mcp.html` | the page |

Three dependencies: `mcp-handler` (Vercel's framework-agnostic adapter, 2.1.1,
entry point `createMcpHandler`), its peer `@modelcontextprotocol/server`
(2.0.0), and `zod` (4.x) for the tool schemas. This repository avoids client
libraries for what it controls — PostgREST is plain `fetch`, and stays plain
`fetch`. The MCP wire protocol is not that. It is a moving external
specification with many clients, and the value of a public server is that an
unfamiliar client connects on the first try. That is bought with the adapter.

Stateless mode: no session store, no Redis. The server advertises its name,
its version and an `instructions` paragraph saying what the index is, what
`strength` means, and that passage counts are not a cross-lab measure.

### `app/lib/bands.mjs` is the delicate part

The band arithmetic lives in `site/spec-reader/app.js` (`tierBand`, and the
scoring loop in `applyPanelThreshold`) and nowhere else. It is browser code in
a 101 KB non-module file, so the server cannot import it.

It is reimplemented in `app/lib/bands.mjs`, and the two copies are held
together by a test in the idiom this repository already uses:
`engine/panel/test_appjs_tiers.js` extracts `tierBand` from the real `app.js`
by text and exercises it. The new test does the same and asserts the module
agrees with the extracted function over every achievable score, judge count and
cell scale. Without it the server and the site could call the same passage two
different things, which is worse than either being wrong alone.

## The MCP page

A new page at `site/mcp.html`, and a nav entry `MCP` directly after `Use the
tool` in `site/methodology.html`, `site/propose.html` and
`site/spec-reader/index.html`. `site/index.html` is a redirect stub with no
navigation and is left alone.

It reuses `methodology.html`'s shell: the same header, footer, palette pair and
Polaris framework tokens.

Two sections, and the reason there are two is that the page is documentation
for someone connecting a server, not a second copy of this document.

1. **How to connect.** The endpoint, written relative in the markup and made
   absolute from `location.origin` at load so a preview deployment documents
   its own address. A `claude mcp add --transport http` line, a JSON block for
   clients that take one, and one sentence saying that it serves the published
   index and authenticates nobody.
2. **Tools.** A paragraph for each of the three, and the arguments of
   `retrieve_passages` as a list.

What would have been four further sections lives inside the arguments it
describes, which is where a reader meets the question rather than several
screens away: the bands under `strength`, the paging rule and the cursor's
publication under `limit` and `cursor`, and the comparability caveat under
`model_spec_ids`, which is the argument that invites the comparison in the
first place. Nothing in the list above was dropped; it was moved to where it
bites.

There is no contents rail. `how-it-works.html` has one because it has eight
headings to follow. Two headings do not need a column of their own.

Framework rules apply as everywhere: 56px chartreuse rule above each section
heading, 6px chartreuse bullets, mono for URLs, identifiers and JSON, sentence
case, British spelling, no em-dashes in the page copy.

## Tests

- `app/lib/__tests__/mcp-tools.test.mjs`, under `node --test`: the three
  answers against `tests/fixtures/reader/`. Covers behaviour filtering, an
  unknown slug erroring rather than emptying, specification filtering, each
  `strength` cut, `comparability` present on multi-specification answers and
  absent on single ones, the empty-cell note, and the briefless behaviour's
  note. Paging gets its own group: cell order follows the arguments, passages
  within a cell are strongest first, no cell is ever split, an oversized cell
  comes back alone, walking `next_cursor` to exhaustion yields every passage
  exactly once, and a cursor from another publication is refused.
- `app/lib/__tests__/bands.test.mjs`: agreement with `tierBand` extracted from
  `app.js`, over the achievable score space.
- One end-to-end check against the running route: `initialize`, `tools/list`
  returning three tools, and one `tools/call` that comes back with a passage.
- No new script: `test:routes` already globs `app/lib/__tests__/*.test.mjs`, so
  the new files join it by being written there.

## What this does not fix

The unequal panels. This server reports them rather than repairing them, and
the repair is separate dated work already named in `CLAUDE.md` and in
`docs/superpowers/specs/2026-09-10-index-artifacts-to-supabase-design.md`.
