# Provisional readings: one model in session, until the panel reads a document

Date: 28 September 2026. Status: approved in conversation, to be planned.

## Why

A document the panel has not judged has nothing in the doc reader: its text can
be read, no passage is marked and no depth is given. Microsoft AI's Code of
Conduct, published on 14 September 2026, is the first such document. The owner
wants something to show quickly, passages and depths included, without paying for a panel run, and without pretending
it is the panel's reading.

A provisional reading is that: the same questions the panel is asked, answered by
one model from inside a working session, recorded in the same tables, published
when no panel reading exists, and labelled as one model's reading everywhere it
appears. When the panel judges the document, its reading replaces the provisional
one on the next publication and nothing is deleted.

## What a provisional reading is

A **provisional run** is a row of `aci_runs` with `provisional = true` and a panel
of exactly one seat, the model answering in the session (for this session
`opus-5.5`, Claude Opus 5.5). Its judge calls are asked with the judging prompt of
the run's rubric, parsed by `judge_call.parse`, and stored in `aci_judge_calls`
and `aci_judgements` like any other. Its cost is null, because a session's tokens
are not billed through this ledger, and null already means unknown here.

A **provisional assessment run** is a row of `aci_assessment_runs` with
`provisional = true` and one seat on each question. It asks the criteria, the
contradictions and their confirmation with the assessment prompts, through
`assess.py`'s own code. The document-wide reading written for the board earlier on
28 September was not produced by those prompts, so it is not transcribed into
these rows; the session asks the real questions instead, which is three calls for
one document.

**Provisional depths** are rows of `aci_depths_out_of_ten` given by
`depth_pass.py` to the calls of a provisional run, against a provisional
assessment run, with the depth prompt `depth-v2`.

With one seat, every quorum is one. `band_cell` already bands a lone judge by its
own verdict (3 defining, 2 core, 1 related). `assessment_run.conflict_rules` and
the confirmation of a contradiction take their quorum from the run: two for a
panel run, one for a provisional run.

## Answering in session

`engine/panel/session_seat.py` is the wire, built on the two functions
`link_self.py` already has: `through_files` writes a question beside the run and
`replies_from` reads its answer back, both keyed by a digest of the question. The
seat is a new entry of `panel-config.json`, `opus-5.5` (Claude Opus 5.5), with no
price, beside `opus-5`, and a panel `session_opus_5_5` of that one seat.

Three subcommands drive the three pipelines, each in two halves, compose and
store:

- `judge`: composes a provisional run with `compose_run.plan` on the session
  panel, writes the run and its calls, and writes each call's question with
  `judge_call.compose`, the same composition `batch_job.one_call` makes. No depth
  of the scale of four is composed. `store` runs `batch_job.run` with
  `replies_from`, once every question has its answer.
- `assess`: starts a provisional assessment run with `assess.assess` on the
  session panel for every question. Its call_model writes the question and stops
  the run with an exception no provider handler catches, so the run is left
  resumable with nothing recorded as a refusal. Each answer is followed by
  `--resume`, which asks the next question: criteria, then contradictions, then
  the confirmation, which is composed from the contradictions found.
- `depth`: writes the question of every depth `depth_pass.jobs_for` returns for
  the provisional run against the provisional assessment run, composed as
  `depth_pass.give_one` composes it; `store` runs `depth_pass.give_pass` with
  `replies_from`.

The answers are written by agents of the session, one file each, from the
question file alone. For Microsoft that is 14 judge calls (236 passages each),
3 assessment calls and 14 depth calls.

## Which reading a publication takes

`choose_cells` keeps its rule for panel runs and adds a fallback. For each cell:
the newest publishable panel run, as today; failing that, the newest provisional
run whose cell is done and carries its depths; failing both, the refusal it gives
today. A document may therefore mix panel cells and provisional cells, and
`aci_publication_cells.run_id` says which is which.

The assessment follows the same rule per document: the publication's
`--assessment-run` where it assessed the document, and otherwise the newest done
provisional assessment run that did. Depths out of ten are read per document with
the same run, since a depth is keyed by the assessment run whose conflict rules it
was shown. The provisional assessment runs used are recorded in
`build_params.provisional_assessment_runs`, so a rebuild is deterministic.

## Database

One migration in `polaris-supabase`, merged on `main` and pushed from `main`:

- `aci_runs.provisional boolean not null default false`, with a check that a
  provisional run has exactly one seat.
- `aci_assessment_runs.provisional boolean not null default false`, with the same
  check on each question's seats.
- `aci_publication_cell_is_publishable()`: for a provisional run, the cell is held
  to the run's own panel instead of the publication's. Everything else is
  unchanged, including the refusal of a manual call as a seat.

Grants on the two new columns follow the table's existing grants.

## What the reader and the MCP say

The payload marks a provisional cell's coverage entry with
`provisional: {seat, run}` and its depth with `provisional: true`; a document
assessed provisionally carries the same mark on its assessment.

- The behaviour note of a provisional cell says: "Provisional: these passages were
  marked by one model, Claude Opus 5.5, reading in one session. The panel of three
  judges has not read this document yet."
- A passage's popover shows the one verdict as "marked by one model" in place of
  the judges' verdicts.
- The depth note's fold is titled "The reading of one model" in place of "The N
  judges' readings", and repeats the provisional sentence.
- `/coverage` marks the column of a provisionally read document.
- MCP answers carry `provisional` on the pair and on the depth, and `about`
  explains it.

## The boards

The front board's column for Microsoft AI takes its figures from the provisional
depths and assessment, and its `says` and `why` are checked against them. Each
figure's `manual` marker becomes a `provisional` marker naming the seat. The note
"Who gives the figures" and the open question `microsoft-read-by-one-model` say
the figures are a provisional reading, now visible passage by passage in the
reader.

## What this does not do

- It does not compare documents yet. Comparing Microsoft's Code with the newest
  document of each other lab is the next step, and needs no new machinery:
  `link_self.py` already judges links, arbitrates, summarises and writes the
  per-passage notes in session, and `compose_links.retained_passages` reads a
  cell's newest run, which for Microsoft is the provisional one. Until then a
  provisional document carries no bubbles and no comparison paragraph.

- It does not run the panel, and it spends nothing.
- It does not let a provisional run stand beside a panel run for the same cell;
  the panel wins.

## Independence

The seat is an Anthropic model reading another company's document. That is
recorded on the run and said in the reader's provisional sentence, as it was for
`link_self.py`.

## Tests

- `choose_cells`: panel preferred, provisional fallback, refusal when neither.
- The migration's trigger: a provisional cell with its one seat is accepted; the
  same cell with a second seat is refused.
- `session_seat.py`: a compose and store round trip on a fixture reaches the same
  rows a provider reply would.
- Quorums of one for a provisional assessment run.
- The builder: provisional marks on coverage, depth and assessment; a panel
  publication is byte for byte unchanged (`test_publication_rebuilds.py`).
- The reader's depth note and behaviour note for a provisional cell
  (`test_appjs_depth.js`), and the MCP shapes.
