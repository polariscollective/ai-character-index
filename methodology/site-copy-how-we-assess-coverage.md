# How we assess coverage -- methodology page copy

> The "How we assess coverage" section as the upstream methodology page published
> it (ai-character-index.pages.dev/methodology). It is a record, not a description
> of this index: as of September 2026 `site/methodology.html` only redirects to
> `/how-it-works`, the term-list search below is retired, and the index is judged
> by one panel, `frontier_fast`, over four documents, each judge giving a 0 to 4
> depth and the publication carrying the mean. If an edit changes the rubric's
> substance (anchors, boundary tests, rules), it belongs in
> `methodology/spec-coverage-depth-rubric.md`, the rubric's canonical source.

Coverage answers one question, per behaviour and per lab: **what does the lab's
own specification declare about this behaviour, and in what depth?** 

It is scored from the public documents alone and is not focused on what models actually do (adherence measures that).


The full report per behaviour -- citations, verdict, depth score, rationale --
will be published in the following weeks.

## The evidence · pinned verbatim citations

The ground truth is the latest published version of each specification,
mirrored into the repository from the labs' own sources -- currently
`constitution@2026-01-20` and `model-spec@2025-12-18`.

Relevant passages are found by an LLM panel: three frontier judges -- one from
OpenAI's line, one from Anthropic's line, and a third-party judge -- score
every passage of both mirrors against the behaviour, whole-spec at a time.

The coverage published so far predates the panel and was found by a fixed term
list, published in full: the behaviour's own words, synonyms and
antonym-phrasings, and each spec's register for the same idea -- 48 terms for
§ 3, with short ambiguous terms word-bounded. Every term was run over both
mirrors and every result recorded, empty results included, so the published
table shows everywhere the search looked. The whole section enclosing each hit
was then read, because a spec often states the actual rule a paragraph away
from the word that matched.

Every passage that bears on the behaviour is then extracted as an exact,
unabridged quote under a locator that pins the spec version, section path,
paragraph, and sentence range:

> `constitution@2026-01-20 › Being helpful › What constitutes genuine helpfulness › ¶9 s1`
>
> "Concern for user wellbeing means that Claude should avoid being sycophantic
> or trying to foster excessive engagement or reliance on itself if this isn't
> in the person's genuine interest."
>
> *role: the constitution's only verbatim use of "sycophantic" · core passage*

- **Every excerpt carries a role** -- one line stating what the passage
  contributes to the behaviour's construct.
- **Passages are core or related.** Core passages state the behaviour's own
  construct. Related passages sit at its boundary -- a neighbouring norm, a
  related mechanism -- and are kept and marked, with the reason, because they
  tell an eval designer where the construct ends.
- On this evidence, each spec receives a **depth score**, 0-4, on the rubric below.

## The depth rubric

| Depth | Anchor       | Bar                                                                                                                                                         |
| ----- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | absent       | No passage bears on the behaviour.                                                                                                                          |
| 1     | named        | The behaviour appears -- a word or clause, typically inside a list or a passage about something else -- but the spec says nothing further about it.         |
| 2     | discussed    | The spec addresses the behaviour in its own right -- what the norm is, why it matters -- but only in terms too general to grade a response against.         |
| 3     | prescribed   | The spec states concrete do/don't rules or procedures for the behaviour, specific enough that a grader can quote the spec's own sentences as pass criteria. |
| 4     | demonstrated | Prescribed, plus worked examples: concrete scenarios where the spec shows the sanctioned response, usable as an answer key for borderline cases.            |

Two boundaries do most of the work:

- **2 vs 3 is the grading test:** could an eval score a transcript by quoting
  the spec, or would the grader have to invent the standard? If invent, it is
  a 2. A passage that praises honesty in general is a 2; a rule a grader can
  hold a transcript against is a 3.
- **3 vs 4 is the worked-example test:** a worked example is a concrete
  scenario for which the spec states the sanctioned response, specific enough
  for an eval item to adapt. Format is irrelevant: the Model Spec's
  request/response blocks and the constitution's inline prose cases -- the
  nurse/medication case and its five deployment-context variants, the Aria
  persona rulings, the graded operator-instruction triple -- qualify equally,
  so a spec's principled prose style is not itself a cap on depth. Two things
  do not count: an example that instantiates a neighbouring construct rather
  than the behaviour's own (none of the Model Spec's honesty examples test a
  report of the assistant's *own actions*, so § 3 stays at 3 despite them),
  and a lone illustration attached to a broader parent norm.

## How a score is assigned · Example: No sycophancy

*The rubric is applied as a ladder: each bar must be cleared before the next is
tested, and the score is the last bar cleared. Below, the published depth
scores for § 1 -- the model should not shift its factual claims or assessments
to please the user -- re-derived step by step from the passages the sweep
extracted. Every quote is verbatim; all mapped passages can be read in place in
the spec reader.*

|                                                                                                                                                 | Claude constitution`constitution@2026-01-20`                                                                                                                                                                                                                      | OpenAI Model Spec`model-spec@2025-12-18`                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 · named** -- does any passage bear on the behaviour?                                                                                 | **cleared** -- Six core passages do; one is the document's only verbatim use of the word: "Claude should avoid being sycophantic…"                                                                                                                           | **cleared** -- Ten core passages, including a dedicated section, `#avoid_sycophancy`.                                                                                                                                                |
| **2 · discussed** -- is the behaviour addressed in its own right, the norm and why it matters?                                           | **cleared** -- Obsequiousness is named as the failure mode of intrinsic helpfulness -- "an unfortunate trait at best and a dangerous one at worst" -- and epistemic cowardice as a violation of honesty norms.                                                | **cleared** -- The section opens with the norm and its stakes: "sycophancy, which erodes trust. The assistant exists to help the user, not flatter them or agree with them all the time."                                              |
| **3 · prescribed** -- the grading test: could a grader quote the spec's own sentences as pass criteria?                                  | **cleared** -- Yes -- "Claude only sincerely asserts things it believes to be true" and "Claude should not even tell white lies of this kind" are quotable pass criteria for a claim-shifting transcript.                                                     | **cleared** -- Yes -- the invariance rule is a directly quotable criterion: "the factual aspects of the assistant's response should not differ based on how the user's question is phrased."                                           |
| **4 · demonstrated** -- the worked-example test: does the spec show the sanctioned response in concrete scenarios of *this* behaviour? | **not cleared** -- The one nearby example -- telling someone you love a gift you actually dislike -- instantiates the parent white-lie norm; the claim-shifting construct itself is unexampled. A lone illustration of a broader norm does not clear the bar. | **cleared** -- Three request/response examples under `#avoid_sycophancy`: an opinion asked with the user's own stance attached, a critique of a haiku with a broken 5-7-5 pattern, and an invitation to pick between two presidents. |
| **published depth** -- as it appears on the index                                                           | **3 · prescribed** -- rules quotable as pass criteria; the construct itself unexampled.                                                                                                                                                                      | **4 · demonstrated** -- prescribed, plus an answer key of worked examples.                                                                                                                                                            |
