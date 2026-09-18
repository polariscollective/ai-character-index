# The overview gains a second view: how each lab governs its rules

Status: approved in conversation, 18 September 2026. Branch `feat/governance-tab`.

## What and why

The overview shows one thing: how deeply each specification covers each
behaviour. That is a reading of what the documents say. A research note written
on 18 September 2026 ("Spec governance ranking: six frontier labs", in the
team's Notion) adds a second axis: how the documents are governed. Whether a
published rulebook exists, whether it covers what the lab deploys, whether a
change to it is visible, and whether anyone outside can see or contest a
weakening. Six labs: OpenAI, Anthropic, Alibaba, Google DeepMind, Meta, xAI.

The overview becomes two views behind tabs. The existing grid is the first and
is unchanged. The second carries the whole of the research note.

## Audience, and what that does to the text

The note was written for colleagues. The view is written for regulators,
legislators and their staff, who are not technical. So it is a rewrite, not a
transcription:

- **Every fact stays.** Every score, date, count, quotation and source in the
  note appears in the view. Nothing is added that the note does not support,
  except plain definitions of terms (what a system prompt is, what CC0 means)
  and the expansion of an acronym.
- **Quotations stay verbatim**, including American spellings inside them.
- **Plain words, defined once.** The document a lab publishes is "the
  rulebook", introduced as what the labs call a model specification. The
  system prompt is "the standing instructions" a company gives its model before
  every conversation. Guardrails are "filters". Hard constraints are "firm
  limits". Each term is defined in the sentence where it first appears and then
  used the same way throughout. No glossary.
- **The four asks become four questions**, with short names for table headers:
  Rulebook, Change record, Filters, Notice.
- **Order for a decision maker**: the conclusion first, the method last.
- **Internal address removed.** Sentences written to "the memo" or about "the
  dashboard" are rewritten for a public reader. "What this means for the
  dashboard" becomes "How to read this ranking". "Points to re-check before
  anything is published externally" becomes "What we could not check", and
  keeps every point. The transparency memo is described as a proposal Polaris
  Collective is drafting.
- **One inconsistency in the note is resolved, not reproduced.** Finding 1 says
  the change record is failed "including the two that publish a spec", while
  three labs publish one; the view names the two leaders instead. The OpenAI
  profile's heading "Ask 3 (4/12 scale: 4/8)" is a typo for 4 of 8.
- **Supporting indicators are shown as totals only.** The note gives a per-lab
  breakdown in prose but no per-indicator matrix, and for Google it does not
  say which indicator scored the point. The view does not invent one.
- House rules: British spelling outside quotations, sentence case, no long
  dashes, dated claims carry "as of September 2026".

## Structure of the view

1. Heading and a lede that says what the view asks and how it differs from the
   other one, then the short version in three sentences: nobody meets the
   minimum, nobody gives notice before loosening a firm limit, nobody says what
   governs government and defence deployments.
2. **The ranking**: rank, lab, the four questions, total of 40, and supporting
   practices of 10 set apart as not counted. The Meta and xAI tie is explained
   under it.
3. **What the ranking shows**: the six findings.
4. **Question by question**: the ten points by six labs, scores 0 to 4 coloured
   with the other view's ramp. Pressing a score opens the overview's note
   dialog: the score, what 0, 2 and 4 mean for that point, and the profile
   paragraph that justifies it. Pressing a point's name opens what its scores
   mean. A lab's name leads to its profile.
5. **Lab by lab**: six profiles, one paragraph per question and one for
   supporting practices. The two asides the note addressed to the memo become
   left-ruled asides, since the framework allows one bordered box per view.
6. **How to read this ranking**: the note's three design points and its caveat.
7. **How we scored**: the four questions, each point with what 0, 2 and 4
   mean, and the five supporting practices.
8. **What we could not check**.
9. **Sources**, grouped as in the note.

A sticky contents rail on the left lists the sections, as the framework allows
for a content page.

## Tabs

Two tabs above each view's heading: "What the specifications say" and "How they
are governed". Tabs rather than a toggle, because each is a whole view rather
than a setting on one. The ARIA tabs pattern: a tablist, roving tabindex, arrow
keys, Home and End. The view has an address, `/?view=governance`, written with
`history.replaceState` so switching does not fill the back button, and keeping
any other parameter such as `?publication=`. An unknown value opens the first
view. Returning to the grid re-measures it, since `fitGrid` measures nothing
while its view is hidden.

## Where things live

- `site/governance.json`: the structure and the numbers. Labs, the four
  questions and their points, what 0, 2 and 4 mean for each point, the
  supporting practices, every score, and each lab's supporting total. Totals
  and rank are computed from it, never stored: rank orders by total and breaks
  a tie on supporting practices, which is the note's own rule and puts Meta
  fifth.
- `site/overview.html`: the prose, in the governance panel. Each profile
  paragraph carries `data-lab` and `data-question`, and the dialog clones it,
  so a sentence has one home.
- `site/governance.js`: renders the ranking, the matrix and the scoring tables
  from the JSON, and wires the dialog. Imported by `overview.js`, which owns the
  tabs and hands over its `sheet` and `paint` helpers.

The data is committed rather than put in Supabase. The rule that the database is
the only source is about the index's judged artefacts; this is editorial
content, like the prose on `/how-it-works`, and nothing edits it from the
portal. If that changes, a table and a route replace the file.

## Tests

- `tests/test_governance_tab.py`, run by CI's fixture suite: every lab scored on
  every point with an integer from 0 to 4, supporting totals within 0 to 10; the
  scores written in the prose (each profile heading and each paragraph's lead)
  equal the sums computed from the JSON; the computed ranking matches the
  note's order; the two combined figures quoted in the first finding (15 and 12
  of 24) hold; no long dash anywhere in the governance panel or the JSON.
- `engine/verify-reader-features.mjs` gains a section: `/?view=governance`
  opens on the governance view with the grid hidden, the ranking has six rows
  with OpenAI first, pressing a score opens the dialog with the profile
  paragraph for that lab and question, and pressing the first tab returns to
  the grid and rewrites the address.

## Not in scope

Publishing to production. The note lists points to re-check before anything is
published externally, the main one being that Alibaba's rulebook was not read
at its own address. The branch deploys to a Vercel preview; merging to `main` is
a separate decision.
