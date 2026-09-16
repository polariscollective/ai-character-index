# site/spec-reader/

The spec reader with passages scored for behaviour relevance by a panel of frontier
LLMs -- highlights come from model verdicts instead of the frozen coverage ledger
(`data/coverage.json`).

## What it shows
Ten behaviours, each cited passage of both specifications graded by a three-seat
panel (deepseek, fable, sol) on the v5 rubric's 3-point scale per judge; a passage's
score is the sum over judges (max 9). The "?" popup on any highlight names each
judge and its decision. Where a seat was substituted on a cell, the payload carries
the substitution note and the popup says so.

## Display tuning
The band toggles in the header show or hide the three tiers the client scores each
passage into -- defining / core / related -- and persist the selection in `?tiers=`.
Default is all three, with related drawn softer than core; an explicit `?tiers=`
(or a legacy `?tier=`/`?threshold=` link) still wins. Nothing below the related cut
ever renders.
- `?related=W` -- weight of a "related" vote when scoring (core is always 2)
  [default 1; try 0.5 or 0]
- `?passage=<locator>` (URL-encoded) -- opens the reader at that passage: the
  document its locator names, a behaviour citing it and its band; dropped from the
  URL once you move on.
- legacy `?threshold=<score>` links map once at load to a tier-band selection
  (`legacyThresholdBands` in app.js); `?solid=` is no longer read.
Scores are recomputed client-side from each citation's raw per-model verdicts, on
load and on every toggle.

## Regenerating the data
`data/behaviours.json` is built by `engine/panel/build_site_data.py` from a verdict
runlog (see `engine/panel/README.md`). Behaviour names/definitions are
registry-driven (`data/behaviours.json`); the cell verdict/depth/verifiedDate
rows come from `data/panel-cell-curation.json`. The sibling
`behaviours-v5-reader.json` is the same builder's band-boundary build
(`--threshold=4 --solid-threshold=6`): exactly the set this page can render,
loadable as `?data=behaviours-v5-reader`; `engine/verify-reader-test.mjs` holds
every view to its passage counts as the oracle. The calibration variants
(v3w-fresh / v4a / v4a-ds / v5 / v5-1) sit beside them, each loadable as a
`?data=` pin for side-by-side comparison.

## Which payload the page loads
Resolution order, no selection UI:
1. `?data=<name>` -- a pin naming a `behaviours*.json` payload in `data/` (e.g. a
   timestamped run or a calibration variant like `?data=behaviours-v4a`); name only,
   no paths; `manifest.json` is never a valid pin, and non-`behaviours*` files are
   refused, so the ledger can't be rendered as a behaviour set;
2. `data/manifest.json` `latest` -- the newest timestamped run the builder emitted;
3. `data/behaviours.json` -- the shipped fallback, always tracked.

A source that fails to fetch or parse falls through to the next, so a stale pin or a
fresh clone (no manifest yet) still renders. Each `build_site_data.py` run writes
`data/behaviours-<YYYY-MM-DDTHH-MM-SS>.json` and updates the manifest; both are
gitignored and stay local. `engine/panel/select_run.py` resolves/verifies pins from
the CLI the same way the page does (`--pin <name>`, `--latest`).

## Saying something about a paragraph, or a document
Every paragraph carries three icons, revealed on hover, on focus or on a tap:
copy its locator, copy a link to it, and open a note. The same third icon sits
beside a document's title, for a note about the whole document rather than one
paragraph; it opens the same dialog with no behaviours field, sending the
document's id as the locator.

The dialog -- "Note on this paragraph" or "Note on this document" -- takes a
comment, a thumb, or both, with the locator and the behaviours highlighting the
paragraph shown but not editable, and an address, required and used to write
back, never shown on the site. Above a private toggle it says what happens if
the toggle is left alone: the note may be shown on the site, unnamed, and it
cannot be unsent -- because silence is the answer most readers give, and that
answer has to be said rather than assumed. Off with no name typed sends the
note anonymous (the default); off with a name typed sends it attributed under
that name; the toggle on keeps it private.

It posts to `/api/feedback`, the one route this page writes to. The address,
the name and the private toggle are remembered in `localStorage` after the
first accepted send. Nothing is displayed anywhere yet.
