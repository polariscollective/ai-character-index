# Spec-coverage depth rubric

Anchors the depth score. Depth measures how much the spec gives an eval designer
to work with for this behaviour, not how much the lab appears to care. Every
score carries a one-line rationale naming what is present and what is missing, in
the rubric's terms.

There are two scales, and this file is the canonical source of both. The scale of
ten is the rubric as of September 2026, given in a pass of its own
(`engine/panel/depth_pass.py`, prompt `engine/panel/prompts/depth-v2.txt`). The
scale of four is below it, and is what every publication so far was given on; it
is still given inside the judging job (`engine/panel/depth_call.py`, prompt
`engine/panel/prompts/depth-v1.txt`). A publication carries the mean of its
panel's depths, on whichever scale it was built with, and says which scale that
is. A prompt restates this file rather than reading it, so a change of substance
here has to land in the prompt too, and the changed prompt carries a new digest
on the runs that use it.

## The scale of ten

Each judge of the panel gives one depth from 0 to 10 per behaviour per document.
The six described levels sit on the even numbers, and an odd number means between
two of them.

| Depth | Anchor | Bar |
|---|---|---|
| 0 | absent | No passage bears on the behaviour. |
| 2 | named | The behaviour appears, a word or clause, typically inside a list or a passage about something else, but the document says nothing further about it. |
| 4 | discussed | The document addresses the behaviour in its own right, what the norm is and why it matters, but only in terms too general to grade a response against. |
| 6 | prescribed | The document states concrete do and don't rules or procedures for the behaviour, specific enough that a grader could quote the document's own sentences as pass criteria. |
| 8 | demonstrated | Prescribed, plus worked examples: concrete scenarios where the document shows the sanctioned response, usable as an answer key for borderline cases. |
| 10 | bounded | Demonstrated, and for this behaviour the document meets all three conditions below, for every facet of the behaviour that its Definition and Clarifications name. |

### The three conditions for 10

**(a) The edge is shown.** Two cases that differ in one feature the document
names receive opposite sanctioned responses, so a reader can see what makes the
response change.

**(b) A conflict is settled.** The document names another of its own rules that
pulls against this behaviour, says which prevails and under what condition, and
shows it on a case, in the passages of the first block. A general rule from the
second block does not meet (b) on its own, and neither does an instruction to
weigh the considerations together or to follow the document's spirit.

**(c) A default for the undecidable case.** The document says what to do when the
model cannot tell which side of the edge it is on, because intent is unclear, a
claim cannot be checked or context is missing, or it orders the acceptable
second-best responses from best to worst.

Each condition must hold for every facet the Definition and Clarifications name.
One pair of cases, one settled conflict or one default that covers a single facet
meets that condition for that facet only. This is what makes 10 rare: of the 168
depths given on 22 September 2026, one was a 10 and sixty-four were 9s.

### What an odd number means

An odd number means the level below is fully met and the level above is met only
in part.

- **9** is demonstrated with the conditions met only in part: for some facets, or
  only one or two of the three.
- **7** is prescribed with examples that do not yet serve as an answer key,
  because they are too few or they test a neighbouring behaviour.
- **5** is discussed with some rules precise enough to quote, too few to grade
  most responses.
- **3** is named with a sentence or two about the behaviour itself.
- **1** is a passage that bears on the behaviour only indirectly.

An odd value needs its rationale to name which part of the level above is met. A
judge that cannot name one gives the even value below.

### Boundary tests

- **4 or 6, the grading test.** Could an evaluation score a transcript by quoting
  the document, or would the grader have to invent the standard? If invent, it is
  4.
- **6 or 8, what counts as a worked example.** A concrete scenario for which the
  document states the sanctioned response, specific enough to adapt into an
  evaluation item. Format does not matter: a request and response block and a
  case described in prose both count. An example of a neighbouring behaviour, or
  a lone illustration of a broader norm, does not.
- **8 or 10, the borderline test.** Could a grader decide a borderline case the
  document does not show by quoting the document? If only by analogy with the
  cases it does show, it is 8 or 9.
- **A dedicated section is evidence, not a requirement.** Any level can be
  reached by passages spread across sections, and a dedicated section written
  only in general terms does not reach 6.
- **Depth is independent of authority level.** A default or a guideline can cover
  a behaviour as deeply as a hard rule. Note authority in the rationale where it
  matters.

When in doubt between two values, the judge gives the lower.

### What the judge is shown

The behaviour, described by four fields: Behaviour, Definition, Clarifications
and Scope. An optional field reading "none provided" only means it was left
blank. Then two blocks of passages from the document, each passage with its
section path.

The **first block** holds every passage the panel cited for this behaviour,
whether every judge agreed it governs the behaviour or only some did. They are
not a shortlist of the strongest ones, and they are not the whole document. They
are the judge's evidence for the behaviour, which it is told not to read past:
the document is not assumed to say anything the passages do not show. They are
the passages the reader shows by default, which is every banded passage, defining,
core and related, so the judge and the reader are looking at the same evidence.

The **second block** holds the passages in which the document states its general
rules for what to do when two of its own rules conflict, such as an order of
priority, numbered R1, R2 and so on. It may be empty. It shows what the general
rules say, and it never meets condition (b) on its own. Without it, a behaviour
whose conflict is settled only by a general rule could never reach 10, and with
it a general order of authority still does not settle a behaviour's own conflict.

That block comes from the assessment of the document as a whole
(`methodology/document-assessment-rubric.md`), whose first criterion asks each
judge to cite the passages stating those rules; the block is the passages at
least two of the three judges cited. A depth on this scale is therefore given
after its document has been assessed, and each depth row records which assessment
run supplied its block, so a document assessed again gives new depths beside the
old ones.

A depth is still a reading of the panel's citations and of that block, not of the
whole document. A behaviour the panel cited thinly is scored on what was cited,
and a figure can move because a passage changed band without the document
changing a word.

## The scale of four

What the index published until September 2026, and what every publication so far
was given on, `1919ee6b` included. It is still the scale of the depth call inside
the judging job. The bars of its five levels are the wording the first five
levels of the scale of ten keep; they moved to the even numbers and the top level
was added above them. The depths of the frozen coverage ledger, which left
`data/coverage.json` for the database, were assigned on this scale too; there
depth qualified a covered or partial verdict.

The two scales are never mixed in one column. A 4 means demonstrated on this
scale and discussed on the other, so depths on the new scale were given in new
rows rather than in place, and a publication built on either scale rebuilds to
its own bytes.

| Depth | Anchor | Bar |
|---|---|---|
| 0 | absent | No passage bears on the behaviour. |
| 1 | named | The behaviour appears, a word or clause, typically inside a list or a passage about something else, but the spec says nothing further about it. |
| 2 | discussed | The spec addresses the behaviour in its own right, what the norm is and why it matters, but only in terms too general to grade a response against. |
| 3 | prescribed | The spec states concrete do and don't rules or procedures for the behaviour, specific enough that a grader can quote the spec's own sentences as pass criteria. |
| 4 | demonstrated | Prescribed, plus worked examples: concrete scenarios where the spec shows the sanctioned response, usable as an answer key for borderline cases. |

### Boundary tests

- **2 vs 3, the grading test:** could an eval score a transcript by quoting the
  spec, or would the grader have to invent the standard? If invent, it is a 2.
- **3 vs 4, what counts as a worked example:** a concrete scenario for which the
  spec states the sanctioned response or act, specific enough for an eval item to
  adapt. Format is irrelevant: the model spec's request and response blocks and
  the constitution's inline prose cases (the nurse and medication case and its
  five deployment-context variants, the Aria persona rulings, the graded
  operator-instruction triple) qualify equally, so the constitution's principled
  style is not itself a cap on depth. What does not count: an example
  instantiating a neighbouring construct rather than this behaviour's own
  (behaviour 3: none of the model spec's examples test a report of the
  assistant's own actions), or a lone illustration attached to a parent norm
  (behaviour 1: the gift white-lie case examples the general white-lie rule,
  while the claim-shifting construct itself is unexampled).
- **A dedicated section is evidence, not a requirement.** Any level can be
  reached by passages scattered across sections; likewise a dedicated section
  with only general language does not clear 3.
- **Depth is scored on every passage the panel cited**, at whatever band, since
  that is what a reader of the index sees. Until 16 September 2026 the judge was
  shown the defining and core bands only, and a passage one point under the core
  cut was invisible to it while the reader had it on the page.
- **Depth is independent of authority level.** Note authority in the rationale
  where it matters (behaviour 2 precedent: the model spec's dedicated calibration
  section carries only guideline authority).

### Precedent

All scores assigned before this rubric existed were re-checked against it on
2026-07-20 (Gate 4 of behaviour 3); all six stand unchanged. The depths are on
the scale of four.

| Behaviour | Spec | Depth | Under the rubric |
|---|---|---|---|
| 1 no-sycophancy | constitution | 3 | prescribed (avoid-sycophancy and no-white-lies rules; the gift case examples the parent white-lie norm, the claim-shifting construct itself is unexampled) |
| 1 no-sycophancy | model spec | 4 | demonstrated (invariance rule plus three worked examples) |
| 2 calibration | constitution | 3 | prescribed (the two-directional Calibrated rule is a quotable pass criterion; no examples) |
| 2 calibration | model spec | 4 | demonstrated (outcome ranking plus eight worked examples) |
| 3 action-honesty | constitution | 3 | prescribed (enumerated oversight prohibitions and the no-sandbagging rule; no examples of action reports) |
| 3 action-honesty | model spec | 3 | prescribed (stop-and-escalate, audit-trail, and error-acknowledgment rules; no examples test an action report) |
