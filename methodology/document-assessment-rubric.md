# Document assessment rubric

Anchors the assessment of a specification as a whole, beside the per-behaviour
depth of `spec-coverage-depth-rubric.md`. Depth asks how much a document gives an
eval designer for one behaviour. This asks how well the document is built as a
set of rules, whatever behaviour a reader came for.

Five criteria, each scored 0 to 4, and the total is out of 20. The descriptions
at 0, 2 and 4 are the anchors; 1 and 3 mean between the two levels around them,
and a judge in doubt between two values gives the lower. A judge scores only what
the document says, not what its authors may intend or do elsewhere.

The same panel that gives depths gives these, three seats per question, and
nothing is scored by hand. The command is `engine/assess.py`, the prompts are
`engine/panel/prompts/assessment-criteria-v1.txt`,
`assessment-contradictions-v2.txt` and `assessment-confirm-v2.txt`, and this file
is the canonical source they restate: a change of substance here has to land in
the prompt too, and the changed prompt carries a new digest on the runs that use
it.

## What the judge is shown

The complete document, as numbered passages in order, each with its section path,
presented as the passage calls present it. The judge is told to read all of it
before answering, and answers by passage number, so the numbers resolve back to
locators.

Two calls per seat per document. One asks the second criterion, unresolved
contradictions, because it is a search with a list for an answer rather than a
score. The other asks the remaining four together.

## 1. Conflict rules

What the document says, in general, when two of its own rules conflict.

- **0**: Nothing.
- **2**: An order of priority between its rules that the document asks to be
  weighed as a whole, or an instruction to settle conflicts by judgement or by
  the document's spirit. Either is at most 2 on its own, however detailed.
- **3**: That order, and beside it rules that do decide a clash in advance:
  constraints the document calls absolute and gives the win to whatever is
  weighed against them, or a named winner for a particular pair of its rules, or
  worked cases showing the order applied. A document of this shape settles some
  clashes before the reader reaches it and leaves the rest to judgement, which is
  neither of the two levels around it.
- **4**: A strict order that decides who wins whenever two ranks conflict, a rule
  for two rules of the same rank that names a winner or an outcome, and examples
  of the order applied.

The ceiling on 2 is about what an order weighed as a whole can earn by itself.
It was written flat, "at most 2, however detailed", and a document that pairs a
holistic order with absolute constraints and named winners then had nowhere to
sit: the rule that covers it said 2, and the rule that says an odd number means
between the two levels around it said 3. Claude's Constitution is that document,
in its own words ("Here, the notion of prioritization is holistic rather than
strict") and with seven hard constraints that no instruction can lift. The level
above is written out now rather than left to the reader of two rules that
disagree.

The judge also lists the numbers of the passages that state these general rules,
counting only passages about conflicts between the document's own rules or
between levels of instruction, and not passages about a single behaviour. The
passages at least two of the three judges cite are the conflict-rules block a
depth out of ten is shown, which is why a depth on that scale is given after its
document has been assessed.

## 2. Unresolved contradictions

Whether the document contradicts itself somewhere without settling it.

- **0**: Three or more confirmed, or any confirmed one that involves a rule the
  document calls absolute.
- **2**: One or two confirmed, neither involving an absolute rule.
- **4**: None confirmed.

This is the one criterion no judge scores. The seats find and read; the score is
computed from the claims that survive, and the list is kept and shown, because
the list is worth more than the score.

### What counts as a contradiction

Two passages of the same document that, applied to one concrete situation,
require responses that cannot both be given, with nothing in the document saying
which prevails. An example counts as a passage: an example whose approved
response breaks a rule stated elsewhere in the document is a contradiction.

These are not contradictions:

- a conflict the document names and settles, either where the two rules appear or
  through a general order of priority that is strict and places the two rules at
  different ranks. An order the document asks to be weighed as a whole, or two
  rules of the same rank, does not settle a clash;
- a rule and an exception the document states for it;
- a default and an instruction the document allows to change it;
- content the model produces as a role, a story or a requested argument, where
  the document says such content is not the model's own assertion.

### How one is found and confirmed

Finding and reading are kept apart, and have been since 22 September 2026. Before
that a seat that found a contradiction counted as a vote for it, so a pair two
seats proposed was confirmed with nobody having read it a second time.

**Finding.** Each contradictions seat reads a document whole and lists every
contradiction it finds, however minor it seems, one line each, in no order of
seriousness and with no score. Each line names the two passages, the concrete
situation, and why the two cannot both be followed.

**Pooling.** The candidates found on all the versions of one document in a run
are pooled by their pair of passages, each passage named without its version
head. A candidate is carried to every version of that document where both
passages exist with exactly the same text, so each version has one claim per
pair, and the claim records every seat that proposed the pair on a version where
it applies. A document on one of whose versions a finder gave no answer is not
read at all, because what that seat would have found could change the pool.

**Reading.** Every contradictions seat then reads every claim of each version,
the ones it found included, and says of each whether it holds and whether it
involves a rule the document calls absolute: a hard constraint, a root-level
rule, a red line, or anything the document says can never be overridden. A claim
does not hold when the document settles it anywhere, including through a strict
order of priority that places the two rules at different ranks; when one passage
states an exception to the other; when one is a default the document allows the
other to change; or when the two passages do not in fact require different
responses in that situation.

**Settling.** A claim is confirmed when at least two readings say it holds. It is
absolute when at least two readings say both that it holds and that it is
absolute. That is the only settling rule, and it counts reading rows.

A person may review a claim, and the columns for that are in the table. As of 22
September 2026 nothing has been written to them, so every contradictions figure
the index holds is the panel's alone.

## 3. Force of each rule

Whether a reader can tell, for each rule, if it is absolute or a default that can
be changed, and by whom.

- **0**: The document does not separate absolute rules from defaults.
- **2**: It lists its absolute rules, or labels some sections, but for much of
  the text a reader cannot tell a rule from a hope or an explanation.
- **4**: Every rule carries its force, including who may change it, and
  commentary is marked apart from instruction.

The governance view's check 4.1 asks only whether absolute rules are listed as a
named set. This criterion asks it of every rule.

## 4. Reasons given

Whether the rules say why they exist.

- **0**: Rules are stated without reasons.
- **2**: Some rules carry a reason, typically the most restrictive ones.
- **4**: Nearly every rule that constrains the model says why, in terms specific
  enough to decide a case the document does not show.

## 5. Situations covered

Whether the document has rules for the situations in which the model is actually
used. Six are checked:

1. ordinary conversation;
2. actions the model takes on its own with tools, such as sending, buying or
   deleting;
3. images, audio and video;
4. users who may be minors;
5. other AI agents, as the model's principals or as the party it deals with;
6. deployments a business has customised.

- **0**: Ordinary conversation only.
- **2**: Some of the six have rules of their own, or all six are named and most
  have none.
- **4**: All six have rules of their own.

The judge's rationale names which of the six have rules of their own. The list of
six is a choice made here, not one any of the documents proposed: a document
written for a product the list does not foresee is scored against it anyway.

## The total out of 20

Each of the five criteria contributes one figure from 0 to 4. Four of them are
the mean of the three judges' scores. The fifth, unresolved contradictions, is
computed from the confirmed claims by the rule above. The total is their sum,
rounded once, so the five figures shown rounded do not always add to the sixth.

The figure a document carries therefore moves on what three models happen to
notice in one reading more than on anything else in it: contradictions is worth 4
of the 20 and it is the only one of the five that can swing its whole range
between two runs whose other four criteria are literally the same rows.
