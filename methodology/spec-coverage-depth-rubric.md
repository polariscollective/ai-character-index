# Spec-coverage depth rubric

Anchors the 0-4 depth score. As of September 2026 each judge of the panel gives
one per behaviour per document, in a depth call of its own
(`engine/panel/depth_call.py`, prompt `engine/panel/prompts/depth-v1.txt`), and a
publication carries the mean. The depths of the frozen coverage ledger, which
left `data/coverage.json` for the database, were assigned on it too; there depth
qualified a covered/partial verdict. Depth measures how much the spec gives an
eval designer to work with for this behaviour, not how much the lab appears to
care. Every score carries a one-line rationale naming what is present and what is
missing, in the rubric's terms.

| Depth | Anchor | Bar |
|---|---|---|
| 0 | absent | No passage bears on the behaviour. |
| 1 | named | The behaviour appears -- a word or clause, typically inside a list or a passage about something else -- but the spec says nothing further about it. |
| 2 | discussed | The spec addresses the behaviour in its own right -- what the norm is, why it matters -- but only in terms too general to grade a response against. |
| 3 | prescribed | The spec states concrete do/don't rules or procedures for the behaviour, specific enough that a grader can quote the spec's own sentences as pass criteria. |
| 4 | demonstrated | Prescribed, plus worked examples: concrete scenarios where the spec shows the sanctioned response, usable as an answer key for borderline cases. |

## Boundary tests

- **2 vs 3 -- the grading test:** could an eval score a transcript by quoting
  the spec, or would the grader have to invent the standard? If invent, it is
  a 2.
- **3 vs 4 -- what counts as a worked example:** a concrete scenario for which
  the spec states the sanctioned response or act, specific enough for an eval
  item to adapt. Format is irrelevant -- the model spec's request/response
  blocks and the constitution's inline prose cases (the nurse/medication case
  and its five deployment-context variants, the Aria persona rulings, the
  graded operator-instruction triple) qualify equally, so the constitution's
  principled style is not itself a cap on depth. What does not count: an
  example instantiating a neighbouring construct rather than this behaviour's
  own (behaviour 3: none of the model spec's examples test a report of the
  assistant's own actions), or a lone illustration attached to a parent norm
  (behaviour 1: the gift white-lie case examples the general white-lie rule,
  while the claim-shifting construct itself is unexampled).
- **A dedicated section is evidence, not a requirement.** Any level can be
  reached by passages scattered across sections; likewise a dedicated section
  with only general language does not clear 3.
- **Depth is scored on core excerpts.** Adjacent-flagged passages define the
  construct's edges for eval designers and do not raise depth.
- **Depth is independent of authority level.** Note authority in the rationale
  where it matters (behaviour 2 precedent: the model spec's dedicated
  calibration section carries only guideline authority).

## Precedent

All scores assigned before this rubric existed were re-checked against it on
2026-07-20 (Gate 4 of behaviour 3); all six stand unchanged.

| Behaviour | Spec | Depth | Under the rubric |
|---|---|---|---|
| 1 no-sycophancy | constitution | 3 | prescribed (avoid-sycophancy and no-white-lies rules; the gift case examples the parent white-lie norm, the claim-shifting construct itself is unexampled) |
| 1 no-sycophancy | model spec | 4 | demonstrated (invariance rule plus three worked examples) |
| 2 calibration | constitution | 3 | prescribed (the two-directional Calibrated rule is a quotable pass criterion; no examples) |
| 2 calibration | model spec | 4 | demonstrated (outcome ranking plus eight worked examples) |
| 3 action-honesty | constitution | 3 | prescribed (enumerated oversight prohibitions and the no-sandbagging rule; no examples of action reports) |
| 3 action-honesty | model spec | 3 | prescribed (stop-and-escalate, audit-trail, and error-acknowledgment rules; no examples test an action report) |
