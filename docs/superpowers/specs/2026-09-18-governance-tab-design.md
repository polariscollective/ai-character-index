# The overview gains a second view: how each lab governs its rules

Status: approved in conversation, 18 September 2026. Branch `feat/governance-tab`.

## What and why

The overview shows one thing: how deeply each specification covers each
behaviour. That is a reading of what the documents say. A research note written
on 18 September 2026 ("Spec governance ranking: six frontier labs", in the
team's Notion) adds a second axis: how the documents are governed. Whether a
published model spec exists, whether it covers what the lab deploys, whether a
change to it is visible, and whether anyone outside can see or contest a
weakening. Nine labs since the note's second pass the same day: OpenAI, Anthropic,
Alibaba, Google DeepMind, Mistral AI, Meta, xAI, Moonshot AI and DeepSeek.

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
- **The note's own terms, each defined once.** A sub-criterion is "a check",
  since "point" would be read as a point of score. Otherwise the terms are the
  ones readers will meet in the memo and elsewhere: model spec, system prompt,
  guardrails, hard constraints, each explained in plain words where it first
  appears. The first version invented plainer words for them (rulebook, standing
  instructions, filters, firm limits); review rejected that, and rightly, since
  the note uses "rulebook" for one particular form a model spec can take.
  `tests/test_governance_tab.py` fails if those words come back.
- **The four asks become four questions**, with short names for table headers:
  Model spec, Change log, Guardrails, Hard constraints.
- **Totals are computed, and one of the note's is wrong.** The second pass
  prints Moonshot AI's total as 3; its own question scores for it, 1, 2, 1 and 0,
  add to 4, as its matrix does. The board shows 4, and the finding that quotes
  the totals says 4.
- **Labs whose flagship anyone can download are marked "Open weights"** under
  their name (Mistral AI, Moonshot AI, DeepSeek), as the note's second pass
  recommends: the questions cannot reach a model once it is downloaded, and a
  mark is more honest than a low score alone.
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

A dashboard, not a document. It took two rounds of review in the browser to get
there, and both are worth keeping. The first version laid the note out as a long
page of prose with a ranking and a matrix inside it, and read as a document. The
second put a heat map beside a panel that answered whatever was pressed, with
pills to break a question down; the panel took a third of the width, and the
ask was for the table to have it.

1. Heading and a short lede that says what the view asks.
2. **Three headline figures**, computed from the scores: the best score on the
   minimum (the first two questions, 15 out of 24, OpenAI's), the number of
   companies with a standing comment window before a hard constraint is weakened
   (0 of 9, check 4.2 at 4), and the number that publish the rules for government
   and defence deployments (0 of 9, check 1.3 at 4).
3. **One table across the whole width.** The nine companies are the columns, in
   rank order; narrower than about 1180 pixels it scrolls sideways in its own
   frame, with the row names held at its left edge. The rows are Overall (of 40),
   then Model spec, Change log, Guardrails and Hard constraints, then supporting
   practices (of 10, set apart, not
   counted). Each question opens into its checks as rows beneath it, scored 0
   to 4, which add up to the question's score; each check's cell starts a fifth
   of the way into its column, like the second line of a bullet. A button above
   the table opens or shuts them all. Every cell says what it is out of, small
   and grey at its right, on a paper tag, because grey laid straight on the red
   or the amber falls below the contrast the framework asks of text. Colour is the
   share of the points available, on the grid's own ramp, with a legend; every
   cell carries its figure, so colour is never alone.
4. **A popover beside whatever was pressed**, never over it: below, above, or
   to one side, whichever has room.
   - A score of a question: the score, its checks as chips, the note's paragraph
     on that question, and a way on to the company's whole profile.
   - A score of a check: the score, what 0, 2 and 4 mean with the score's place
     marked, and the note's paragraph.
   - An overall score or a company's name: the profile, one fold per question and
     one for supporting practices, and the note's aside where it has one.
   - A row's name: what it asks and how its points are shared out. For a question,
     its checks with what earns each score, and a button to show them in the
     table.
   Pressing the same thing again closes it, as do Escape and a press elsewhere.
5. **The eight findings** under the table, as headlines that open.
6. **Reference text, folded**: how to read this ranking, how we scored (the four
   questions with what 0, 2 and 4 mean for each check, and the five supporting
   practices), what we could not check, and the sources.

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

- `site/governance.json`: everything the board shows. Labs; the four questions,
  each with its plain-language explainer; the checks, each with a short name for
  a column head, its full label and what 0, 2 and 4 mean; the supporting
  practices; every score and each lab's supporting total; the six findings; and
  each lab's profile, one paragraph per question and one for supporting
  practices, plus the note's aside for Anthropic and Google. Totals and rank are
  computed, never stored: rank orders by total and breaks a tie on supporting
  practices, which is the note's own rule and puts Meta fifth. A profile's
  opening line, "Model spec, 8 out of 12", is written from those sums.
- `site/overview.html`: the frame of the board, the popover, and the folded
  reference text.
- `site/governance.js`: renders the board from the JSON. Imported by
  `overview.js`, which owns the tabs and hands over its `paint`, so a score wears
  the colour a depth wears in the other view.

The data is committed rather than put in Supabase. The rule that the database is
the only source is about the index's judged artefacts; this is editorial
content, like the prose on `/how-it-works`, and nothing edits it from the
portal. If that changes, a table and a route replace the file.

## Tests

- `tests/test_governance_tab.py`, run by CI's fixture suite: every lab scored on
  every check with an integer from 0 to 4, supporting totals within 0 to 10; the
  computed ranking matches the note's order; every lab has a paragraph for every
  question; each supporting paragraph's parenthesised scores add up to the lab's
  supporting total; the first finding's two quoted sums hold; the two findings
  about whole columns hold; no long dash in the panel or the JSON.
- `engine/verify-reader-features.mjs` gains a section: `/?view=governance` opens
  on the board with the grid hidden; the companies run across in the note's
  order and the scores down from the total, with the six findings under the
  table; the change record opens into its three checks; a check's score opens a
  popover beside the cell, not over it, with a score of 1 marked between 0 and 2;
  pressing it again closes it; a question's name opens how its points are shared
  out; the first tab returns to the grid and rewrites the address; and the arrow
  keys move between the tabs.

## Not in scope

Publishing to production. The note lists points to re-check before anything is
published externally, the main one being that Alibaba's model spec was not read
at its own address. The branch deploys to a Vercel preview; merging to `main` is
a separate decision.
