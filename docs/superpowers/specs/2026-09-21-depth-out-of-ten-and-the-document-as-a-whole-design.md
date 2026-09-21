# Depth out of ten, and the document as a whole

Date: 2026-09-21
Status: proposed, awaiting review
Branch: `feat/depth-to-ten-and-document-assessment`

## Why

As of September 2026 the public publication, `1919ee6b`, shows 52 cells. None
is below 2.3, 24 are at 3.7 or more, and 3.7 means two judges of three gave the
top of the scale. The step from 3 to 4 asks for one worked example, and the
OpenAI and Alibaba documents put examples under nearly every rule, while the
constitution reaches it with its prose cases. The grid therefore reads as green
wherever a lab has published a specification, and it has no way to show that a
document could do better on a behaviour it already covers with rules and
examples.

Reading the constitution and the model spec in full for this design found
three things a good specification should do that most of these cells do not.
They are the three named in the conversation that led to this design, before
the reading: settling contradictions, giving precise examples, and saying what
to do as a fallback.

- **Contradictions.** The constitution says it may be "unclear, underspecified,
  or even contradictory in certain cases" and asks Claude to follow "the spirit
  of the document". The model spec settles conflicts by authority level, and
  for two root-level rules in conflict it has one sentence, "default to
  inaction", with no example. Some conflicts are left open: the model spec
  approves an evasive answer to "Is the tooth fairy real?" under its letter and
  spirit section, while its honesty section forbids misleading by omission, and
  neither says which prevails.
- **Examples.** Most examples show the right answer on a case the document
  chose, and few show where the answer changes. Where the decisive part of an
  answer matters most it is often elided, as in "[...list of methods, but
  without detailed instructions...]" for a shopkeeper asking about shoplifting.
  The constitution describes verdicts in prose and never writes a response.
- **Fallbacks.** Some sections order the acceptable second-best responses (the
  model spec on honesty: a good answer, then refusing, then a lie of omission,
  then a lie of commission), and most do not.

The same three appear in published research. "Stress-Testing Model Specs
Reveals Character Differences among Language Models" (Anthropic and Thinking
Machines, October 2025) generated over 300,000 value-tradeoff scenarios and
found internal contradictions, interpretive ambiguity and insufficient
granularity in current specifications. "How Well Do Models Follow Their
Constitutions?" (Jakkli, Rajamanoharan and Nanda, May 2026) finds that the
failures which persist concentrate where a specification leaves competing
directives unresolved. Both infer defects in the text from how models behave.
Neither grades the text itself, behaviour by behaviour, which is what this
index does.

## What was decided, in conversation on 2026-09-21

1. Depth runs from 0 to 10. The six described levels sit on the even numbers,
   and an odd number means between two of them.
2. The new top level, 10, requires three conditions, all of them.
3. A second assessment covers the document as a whole: five criteria, each
   scored 0 to 4 with 0, 2 and 4 described, as the governance view scores its
   checks. The total is out of 20.
4. Both are given by the three judges of the panel that already gives depths.
   Nothing is scored by hand.

Rejected on the way, each for a stated reason:

- A second score beside depth, given only to cells that reach 4. Two numbers
  read less simply than one ladder, and a threshold on a mean of three judges
  excluded all but one cell.
- A 1 to 10 scale with no described levels. Judges without anchors bunch
  around 6 to 8, and the present scale works because of its anchors and its
  boundary tests.
- Giving each depth call the whole document. A depth would stop being a
  reading of the panel's citations, and the calls would cost about fifteen
  times as much.
- Re-giving depths in place, as was done on 16 September. It would put two
  scales in one column, where a 4 means demonstrated on one and discussed on
  the other, and every earlier publication would stop rebuilding to its digest,
  as `07958c5e` did.

## The depth scale, 0 to 10

This replaces the table in `methodology/spec-coverage-depth-rubric.md`. The
bars of the first five levels keep their wording and move to the even numbers.

| Depth | Anchor | Bar |
|---|---|---|
| 0 | absent | No passage bears on the behaviour. |
| 2 | named | The behaviour appears, a word or clause, typically inside a list or a passage about something else, and the spec says nothing further about it. |
| 4 | discussed | The spec addresses the behaviour in its own right, what the norm is and why it matters, in terms too general to grade a response against. |
| 6 | prescribed | The spec states concrete do and don't rules or procedures for the behaviour, specific enough that a grader can quote the spec's own sentences as pass criteria. |
| 8 | demonstrated | Prescribed, plus worked examples: concrete scenarios where the spec shows the sanctioned response, usable as an answer key for borderline cases. |
| 10 | bounded | Demonstrated, and for this behaviour the spec meets the three conditions below. |

**Odd values.** An odd value means the level below is fully met and the level
above is met in part. A 9 is demonstrated with one or two of the three
conditions for 10. A 5 is discussed with some rules precise enough to quote,
too few to grade most responses. An odd value's rationale names which part of
the level above is met; a judge that cannot name one gives the even value
below. When in doubt between two values, the judge gives the lower, as it does
today.

**The three conditions for 10.**

1. **The edge is shown.** Two cases that differ in one feature the spec names
   receive opposite sanctioned responses. The model spec does this for the
   volume of a one-metre sphere: computed when a user asks for the volume of a
   bomb, refused when the user says they want to build one and asks how much
   explosive to buy.
2. **A conflict is settled.** The spec names another of its own rules that
   pulls against this behaviour, says which prevails and under what condition,
   and shows it on a case. The model spec does this for honesty against
   confidentiality: when an answer would reveal what must stay confidential,
   the model says truthfully that it cannot answer, and the "delve" example
   shows it. A general rule of the document counts only where it decides this
   behaviour's conflict, which an instruction to weigh everything together does
   not.
3. **A default for the undecidable case.** The spec says what to do when the
   model cannot tell which side of the edge it is on, because intent is
   unclear, a claim cannot be checked or context is missing, or it orders the
   acceptable second-best responses. The model spec's order of outcomes for
   honesty does this, and so does the constitution's preference for raising
   concerns, asking and declining over any drastic unilateral action.

**Boundary tests.** The two that exist move up with their levels: 4 or 6 is the
grading test (could an evaluation score a transcript by quoting the spec, or
would the grader have to invent the standard), and 6 or 8 asks what counts as
a worked example. One is added. For 8 or 10: could a grader decide a borderline
case the spec does not show by quoting it? If only by analogy with the cases it
does show, the cell is 8 or 9.

**What the judge is shown.** The passages the panel cited for the cell, as
today, and in a separate block the passages that state the document's general
rules for conflicts. Without that block a behaviour whose conflict is settled
only by a general rule could never reach 10. The block comes from the
assessment of the whole document (below), which asks each judge to cite the
passages that state those rules; the passages cited by at least two of the
three judges are the block. A depth on this scale is therefore given after its
document has been assessed, and each depth row records which assessment run
supplied its block.

The prompt becomes `engine/panel/prompts/depth-v2.txt`, with a new digest. The
parser reads integers from 0 to 10, and Roman numerals from I to X, since
deepseek has answered in Roman numerals before. It refuses anything else, as
it refuses 5 on the present scale.

## The document as a whole, five criteria

A new file, `methodology/document-assessment-rubric.md`, carries these. Each
criterion is scored 0 to 4. The descriptions at 0, 2 and 4 are the anchors,
and 1 and 3 mean between two of them.

**1. Conflict rules.** What the document says, in general, when two of its own
rules conflict.

- 0: Nothing.
- 2: An order of priority between its rules, or an instruction to settle
  conflicts by judgement or by the document's spirit, without saying who wins
  in a given case.
- 4: An order that decides who wins, a rule for two rules of the same rank,
  and examples of the order applied.

The judge also cites the passages that state these rules. They feed the depth
calls, as described above.

**2. Unresolved contradictions.** Whether the document contradicts itself
somewhere without settling it. A contradiction here is two passages of the
same document that, applied to one concrete situation, require responses that
cannot both be given, with nothing in the document saying which prevails. An
example counts as a passage. A conflict the document names and settles is not
a contradiction for this criterion; it earns its credit under the first.

- 0: Three or more, or any that involves a rule the document calls absolute.
- 2: One or two, neither involving an absolute rule.
- 4: None found.

The judge lists what it finds, at most eight, each with the two locators, the
situation and one sentence on why they conflict. The list is kept, and the page
shows how many judges found each pair, so a person can check every item.

**3. Force of each rule.** Whether a reader can tell, for each rule, if it is
absolute or a default that can be changed, and by whom.

- 0: The document does not separate absolute rules from defaults.
- 2: It lists its absolute rules, or labels some sections, and for much of the
  text a reader cannot tell a rule from a hope or an explanation.
- 4: Every rule carries its force, including who may change it, and commentary
  is marked apart from instruction.

The governance view's check 4.1 asks only whether absolute rules are listed as
a named set. This criterion asks it of every rule.

**4. Reasons given.** Whether the rules say why they exist.

- 0: Rules are stated without reasons.
- 2: Some rules carry a reason, typically the most restrictive ones.
- 4: Nearly every rule that constrains the model says why, in terms specific
  enough to decide a case the document does not show.

**5. Situations covered.** Whether the document has rules for the situations in
which the model is actually used. Six are checked: ordinary conversation;
actions the model takes on its own with tools, such as sending, buying or
deleting; images, audio and video; users who may be minors; other AI agents,
as the model's principals or as the party it deals with; and deployments a
business has customised.

- 0: Ordinary conversation only.
- 2: Some of the six have rules of their own, or all six are named and most
  have none.
- 4: All six have rules of their own.

**How the judges read.** Each judge reads the whole document, presented as the
passage calls present it, with every passage numbered, so a reply can cite
passages by number and the numbers resolve to locators. Two calls per judge per
document: one for the second criterion, which is a careful search with a list
for an answer, and one for the other four. For four documents that is 24 calls.

The Anthropic models are refused on the input of the Alibaba document, as they
were on 15 September. The declared substitutes of `panel-config.json` apply:
`fable`'s seat is taken by `opus`, then `kimi`, and each substitution is
recorded with its reason on the call row.

## Data, in polaris-supabase

One migration in `evals/`, applied by hand with `supabase db push`, since the
`Migrations` workflow has failed on every run since #30.

**`aci_depths` gains its scale and its prompt.**

- `scale smallint not null default 4 check (scale in (4, 10))`, and the depth
  check becomes `depth between 0 and scale`. A row says which scale it was
  given on, so no reader has to infer it.
- `prompt_sha256 text not null`, backfilled, and the primary key becomes
  `(call_id, prompt_sha256)`. A new prompt writes new rows beside the old ones,
  which is how `aci_passage_notes` and `aci_document_notes` already work, and
  every earlier publication keeps rebuilding.
- `assessment_run_id uuid null`, referencing the assessment run whose conflict
  rules the depth was given with. Null on every row of the 0 to 4 scale.

The backfill cannot trust `aci_runs.config.depth_prompt_sha256`. The three runs
of the public publication were composed under `20df8c4d` and their depths were
given again under `bd096eba` on 16 September. The migration decides each row's
digest from its `finished_at` against that re-judging, and the plan's first task
counts the rows each way before anything is written.

**Four new tables** for the assessment:

- `aci_assessment_runs`: who launched it, its status, the panel, the two
  prompts' digests, the config, the estimate and the cost.
- `aci_assessment_calls`: one judge reading one document for one of the two
  questions. The seat, the model that answered, and a substitution reason that
  is set when they differ. The raw reply, tokens, cost, timing and status, as
  `aci_judge_calls` carries them.
- `aci_assessment_scores`: per call and criterion, the score from 0 to 4, the
  rationale, and for the first criterion the locators of the conflict rules.
- `aci_assessment_contradictions`: per call, each contradiction found, with its
  two locators, the situation and the sentence.

Scores and contradictions are evidence and take insert and select only. Calls
take update, since their status moves while a job runs. Nothing is granted to
`anon`: the public reads what a publication froze.

## Publication

- `build_params` records `depth_prompt_sha256`, the depths it read, and
  `assessment_run_id`, the assessment it carries. `publish.py` takes them as
  `--depth-prompt`, defaulting to the digest of the current prompt file, and
  `--assessment-run`, required for any publication on the 0 to 10 scale.
- `require_depths` checks depths under that digest only. A new check refuses a
  publication whose documents lack a finished score from every seat of the
  assessment run, or whose substitutes are not declared for their seat.
- The payload gains `depthScale: 10` at its top level and an `assessment` object
  keyed by document id: each criterion's mean, every judge's score and
  rationale, the contradictions with the number of judges who found each, and
  the total out of 20. Both sit inside the payload, so the existing digest
  covers them and no new column is needed.
- A payload without `depthScale` is on the 0 to 4 scale, and one without
  `assessment` has none. A pinned earlier publication therefore renders as it
  was published.

**Paragraphs that quote a depth must be written again.** The depth notes
(`aci_document_notes`, kind `depth`) explain a figure on the 0 to 4 scale, and
`link-summary-v1.txt` gives the comparison paragraphs "each document's figure
out of 4". A publication on the new scale carries neither kind unless it was
written from the new figures, under a new prompt digest.

## Display

- **The scale comes from the payload.** The overview, the reader and the MCP
  server read `depthScale`, so a pinned earlier publication still says "out of
  4". The words move with it: "Depth, out of 10".
- **The colour ramp** runs over the fraction of the scale, with its stops at 0,
  half and the top, so the deepest green is reserved for 10. The governance
  view reuses `paint` from the overview and passes its own maximum of 4, so its
  colours do not change.
- **The legend** lists the six anchors with their bars and one line on odd
  values.
- **A new row at the foot of the grid, "The document as a whole"**, gives each
  document's total out of 20. Pressing it opens the five criteria with their
  mean scores and each judge's rationale, and the contradictions, each with
  both passages quoted and linked into the reader. A lab with no specification
  shows nothing in that row.
- **The MCP server** says the scale in its descriptions, answers with
  `depth.scale` beside `depth.mean`, and `list_model_specs` gains each
  document's assessment.
- **Copy**: the method on `/about` and `methodology/site-copy-how-we-assess-coverage.md`
  describe the new scale and the assessment.

## Cost

At the prices in `panel-config.json`, and through OpenRouter as the container
runs:

- Depths on the new scale for the 156 calls of the three runs the public
  publication selects from: about 5 dollars. The same calls cost 3.42 dollars
  on 16 September; the prompt is longer and carries the conflict rules.
- The assessment: 24 calls over whole documents of 30,000 to 70,000 tokens,
  about 8 dollars. Fable's input price, 10 dollars per million tokens,
  dominates it.
- A pilot first, run locally into `artefacts/` before the migration: about 6
  dollars.

## Order of work

1. The pilot: the constitution and the model spec of August 2026 assessed in
   full, then depths on the new scale for four behaviours on both (honesty,
   sycophancy, instruction hierarchy and harm to third parties), eight cells in
   all, read by a person. It answers two questions: whether judges use odd
   values as a way of not choosing, and whether the contradictions they list
   hold up.
2. The migration in `polaris-supabase`, on its own branch and pull request.
3. The engine: prompts, parsers, the assessment job, depths keyed by digest,
   `publish.py` and the payload builder.
4. The runs: the four documents assessed, then new depths for the three runs.
5. The depth notes and comparison paragraphs written again, or left out of the
   first publication on the new scale.
6. The site: the scale read from the payload, the ramp, the legend, the new row,
   the MCP server and the copy.
7. A draft publication, read, then made public.

## What is not settled

- Whether the judges' contradictions are reliable enough to publish. The pilot
  decides whether the list is shown or only the score.
- The judges are the same as today, so the independence problem stands: `sol`
  is OpenAI's model and reads OpenAI's document, `fable` is Anthropic's and
  reads Anthropic's.
- The six situations of the fifth criterion are a list chosen here. A
  document written for a product the list does not foresee is scored against it
  anyway.

Sources:
[arXiv 2510.07686](https://arxiv.org/abs/2510.07686),
[arXiv 2605.24229](https://arxiv.org/html/2605.24229v1),
[ISO/IEC/IEEE 29148 quality characteristics](https://www.researchgate.net/publication/385802396_Well-Formed_Quality_of_System_Requirements_for_Verifying_to_ISO_29148-2018_A_Natural_Language_Processing_NLP_Based_Framework_and_Quantitative_Metric),
[Alexy, balancing and conditional precedence](https://academic.oup.com/icon/article/5/3/453/647392).
