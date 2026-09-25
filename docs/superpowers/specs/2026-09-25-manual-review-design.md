# Manual review of a passage's band and of a depth

Date: 25 September 2026. Branch: `feat/manual-corrections`.

## What it is for

The owner reads the index and sometimes disagrees with the panel on a few
cells: a paragraph the judges left out that should be shown, a paragraph they
called core that is defining, a depth that is too high. Until now the only way
to change what the reader shows was to judge the cell again, which costs money
and gives another panel's reading rather than the owner's. A manual review lets
the owner's reading win on those few points, and shows that it did.

The owner asks for each correction in conversation, and the assistant writes it.
There is no form in the portal.

## The idea: one more judge, called `manual`

Verdicts and depths are already stored one row per judge. A correction is stored
the same way, as the rows of a judge whose model is `manual`:

- a row of `aci_judge_calls` with `model = 'manual'`, `status = 'done'`, in the
  same run as the cell it corrects, for that behaviour and that document;
- for a passage, a row of `aci_judgements` under that call, for that locator,
  with `verdict` 3 (defining), 2 (core), 1 (related) or 0 (not shown), and a
  sentence in a new `note` column saying why;
- for a depth, a row of `aci_depths_out_of_ten` under that call, `status =
  'done'`, with `depth` 0 to 10 and the reason in `rationale`, against the same
  depth prompt and assessment run as the judges' depths of that cell.

A manual call only carries the rows it corrects. A cell with a manual depth and
no manual passage has a call with no judgements, and the reverse is allowed.

## What wins

Where a manual row exists it is the whole answer for what it covers, and the
judges' rows beside it count for nothing in the figure:

- **A passage.** Its band is the band of the manual verdict, whatever the
  judges' scores add up to. A manual 0 removes a passage the judges retained. A
  manual verdict on a paragraph the judges never scored, or scored too low to be
  carried, puts it in the payload with that band.
- **A depth.** The cell's depth is the manual figure, not the mean of the
  judges.

The judges' verdicts and depths stay in the payload and on the page, marked as
superseded, so a reader can see what the panel said and what the owner changed.

## Where it shows

- **Reader, passage.** In the list of votes a passage opens, a first line
  "Manual review: defining" with its note, above the three judges' lines. The
  highlight follows the manual band.
- **Reader, depth.** The figure is the manual one. The behaviour note says
  "Corrected by hand from 5.3" with the reason, followed by the judges' figures
  and rationales as today.
- **MCP.** `retrieve_passages` and `list_behaviours` carry the same: the band
  and depth as corrected, a `manual_review` field with the value and the note,
  and the judges' figures beside it.
- **Constitutions board.** It is written by hand in `site/constitutions.json`
  and is not read from the payload. When a depth is corrected, the assistant
  sets the same figure there, so the two agree.

## Old publications do not move

A publication copies everything into its own row when it is built, so rows
written afterwards never reach it on the site.

What would move is the rebuild check: `test_publication_rebuilds.py` and
`verify_supabase_provenance.py` rebuild every publication from the database and
hold it to its digest. `build_site_data.py` already keeps only the verdicts of
the publication's panel, so a `manual` row is dropped from any build that does
not ask for it. `publish.py` gains `--manual-review`, recorded in
`build_params.manual_review`; only a build carrying it reads manual rows. Every
publication built so far rebuilds as it did.

## A correction belongs to a run

A publication takes each cell from one run, and the manual call sits in that
run. Every publication that takes the cell from that run carries the correction.
A publication that takes the cell from a newer run, because it was judged
again, does not: the correction has to be written again in that run, or left
out on purpose. That is intended, since a new panel's reading deserves to be
read before the owner's earlier disagreement is laid over it.

## Changes

**Database (`polaris-supabase`, one migration):**
- `aci_judgements.note text` (nullable).
- `aci_publication_cell_is_publishable()` leaves `model = 'manual'` out of the
  models it holds to the panel, so a cell with a manual call is still
  publishable.

**Engine:**
- `build_site_data.py`: with manual review on, read `manual` verdicts and depths
  of each selected cell; a manual verdict sets the passage's band and forces its
  presence; a manual depth replaces the mean; both are written into the payload
  (`manualReview` on the passage and on the cell's depth) beside the judges'.
- `publish.py`: `--manual-review` passed to the builder and recorded in
  `build_params`; the depth count per seat skips `manual`.
- `bands.py`: a passage carrying a manual band takes it.
- A small script to write a correction (`engine/manual_review.py`): behaviour,
  document, run, and either a locator with a band and a note or a depth with a
  reason. It refuses a run that does not hold the cell, a locator the document
  does not have, and a band or depth off scale.

**Site and MCP:**
- `site/spec-reader/app.js` and `app/lib/bands.mjs`: a passage with a manual
  band takes it; the votes list and the depth note show the correction.
- `app/lib/mcp-tools.mjs`: `manual_review` on passages and depths.

## Tests

- Bands: a manual band wins over any judges' score, including 0 over a defining
  score and related over nothing.
- Builder: without `--manual-review`, a run holding manual rows builds the same
  bytes as before; with it, the passage and depth take the manual values and
  carry the judges' beside them.
- The trigger: a cell with a manual call publishes; a cell with an undeclared
  model is still refused.
- Rebuild check: every existing publication still rebuilds to its digest.

## Not in scope

A portal form, corrections that follow a cell across runs, corrections to the
links between documents, and manual depths on the scale of four, which no new
publication uses.
