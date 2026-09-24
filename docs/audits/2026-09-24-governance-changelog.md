# Corrections to the governance board, 24 September 2026

Every change made to `site/governance.json`, `site/governance.js`,
`site/overview.html` and `tests/test_governance_tab.py` on the branch
`fix-governance-sources`, one entry per change, so that any single one can be
undone without reading a diff.

Each entry gives the figure and the sentence before, the figure and the sentence
after, the figures that move with it, and the source the change rests on. Every
address below was read on 23 or 24 September 2026.

The figures under **What moves with it** are the effect of that change alone,
measured against the board as it stood. The board after all six figure changes is
at the end.

---

## 1. Check 2.1 versions kept, OpenAI: 4 becomes 3

**Before.** 4. The paragraph behind it read: "There have been seven versions, and
six are kept at stable, dated addresses; the first, from May 2024, now returns a
'page not found' error."

**After.** 3. The paragraph reads: "There have been seven versions, and six are
kept at stable, dated addresses; the first, from May 2024, now returns a 'page
not found' error, and the repository says its archive begins at the second
release."

**What moves with it.** OpenAI's change log figure 5.8 becomes 5.0. Its published
figure 6.1 becomes 5.9. Its final score 5.6 becomes 5.5, and Anthropic passes it
into first place. The first finding's "the best score on it is 5.8 out of 10"
becomes 5.0, and its "OpenAI has the best pair, 6.7 on the constitution and 5.8
on the change log" becomes 5.0.

**Why.** The anchor for 4 is "Every version is dated and can be retrieved at a
permanent address", and the anchor for 2 is "Versioned, but the archive is
incomplete or not linked". Six of seven versions is neither.
`https://model-spec.openai.com/2024-05-08.html` returned HTTP 404 on 23 September
2026. The repository README at `https://github.com/openai/model_spec`, read the
same day, states the boundary itself: "This repository contains the markdown
source for the Model Spec and an archive of all released HTML versions of the
Model Spec (starting from the second release on 2025-02-12)."

---

## 2. Check 1.3 special deployments, Anthropic: 1 becomes 2

**Before.** 1. The paragraph ended: "Claude Gov (June 2025) and Claude Mythos
(April 2026) are in use, and neither has a published constitution."

**After.** 2. The paragraph continues: "Anthropic says in the constitution that
the gap exists and does not say what governs those models instead."

**What moves with it.** Anthropic's published constitution figure 7.5 becomes 8.3.
Its published figure 5.9 becomes 6.1. Its final score 5.5 becomes 5.6, which takes
it to first place. The fourth finding no longer holds, since the nine no longer
score 0 or 2.5: it is rewritten at entry 12 below.

**Why.** The check's own description of a 2 is "The gap is acknowledged, but what
applies instead is not disclosed." `https://www.anthropic.com/constitution`, read
23 September 2026, says: "We have some models built for specialized uses that
don't fully fit this constitution; as we continue to develop products for
specialized use cases, we will continue to evaluate how to best ensure our models
meet the core objectives outlined in this constitution." That is the anchor word
for word.

---

## 3. Check 1.1 constitution published, Meta: 1 becomes 0

**Before.** 1. The paragraph opened: "No published constitution, and a written
commitment to publish one, recorded in the change log of its Advanced AI Scaling
Framework v2 as 'Added commitment to publish a model spec, and evaluations for
adherence to the model spec in preparedness reports'. Future tense, no deadline,
no address, and five months gone."

**After.** 0. Two sentences follow: "A promise to publish is not a published
document, so it earns nothing on the check that asks for one. What Meta does
publish about behaviour is an acceptable use policy for each Llama model, which
governs users."

**What moves with it.** Meta's published constitution figure 0.8 becomes 0.0. Its
published figure 1.1 becomes 0.9 on this change alone, and 0.5 once entries 4 and
8 are applied with it. The sixth finding is rewritten at entry 13 below.

**Why.** The anchor for 0 is "Nothing, or only a policy on how users may behave",
which is what Meta publishes. Section 2.2.3 of the Advanced AI Scaling Framework
v2, at `https://ai.meta.com/static-resource/Meta_Advanced-AI-Scaling-Framework-v2`,
read 23 September 2026: "Meta will also publish a model spec describing the
behavior we intend each of our Frontier AI to exhibit across different settings,
including agentic environments." The Llama 4 acceptable use policy, at
`https://dev.meta.ai/llama/llama4/use-policy/`, carries no date and governs users.
A promise to publish is not on this scale at any level.

---

## 4. Check 2.2 changes explained, Meta: 1 becomes 0

**Before.** 1. The paragraph read: "It covers the framework for catastrophic risks
and no document about behaviour."

**After.** 0. It reads: "It covers the framework for catastrophic risks and no
document about behaviour, which is what this question asks about, so it earns
nothing here."

**What moves with it.** Meta's change log figure 1.7 becomes 0.8. Its published
figure 1.1 becomes 0.9 on this change alone.

**Why.** Meta's Appendix II lists two dated versions with bulleted summaries of a
catastrophic-risk framework. Anthropic keeps the fuller version of the same thing
at `https://www.anthropic.com/rsp-updates`, nine dated versions each with a summary
and an archived PDF, and scores 0. Google DeepMind's Frontier Safety Framework 3.1
carries section 5.3, "Past Updates and Changes", and scores 0. Three companies in
the same position were scored 1, 0 and 0. All three were read on 23 September 2026.

---

## 5. Check 3.2 guardrail changes logged, Google: the figure of 1 stands, the sentence changes

**Before.** 1. The sentence read: "For its own consumer products, close to
nothing, and at least two significant changes went unannounced: a restriction on
election questions in March 2024, still in force a year later with no announced
review, and a model update in May 2025 that overrode safety settings developers
had deliberately set to allow the content it then blocked."

**After.** 1. It reads: "For its own consumer products, close to nothing. The
restriction on election questions of March 2024 was announced on the day, in a
statement to CNBC, and recorded in no change log. A year later it was still in
force with no announced review. A model update in May 2025 overrode safety
settings developers had deliberately set to allow the content it then blocked, and
was announced nowhere at all."

**What moves with it.** No figure moves.

**Why.** Google announced the restriction itself, on the day. CNBC, 12 March 2024,
read 23 September 2026,
`https://www.cnbc.com/2024/03/12/google-restricts-election-related-queries-for-its-gemini-chatbot.html`:
"Out of an abundance of caution on such an important topic, we have begun to roll
out restrictions on the types of election-related queries for which Gemini will
return responses." The score of 1 survives because the change is logged nowhere:
the Gemini API changelog carries two safety entries between December 2023 and
September 2026, and `https://gemini.google/release-notes/` carries none.

---

## 6. Check 3.2 guardrail changes logged, Mistral AI: 0 becomes 2

**Before.** 0. The paragraph ended: "For Mistral's own consumer product, the only
disclosure is a sentence from November 2024 saying that its moderation service for
developers 'powers the moderation service in Le Chat', which predates both the
renaming to Vibe and Shieldstral. Nothing on logging changes to guardrails."

**After.** 2. It ends: "For Mistral's own consumer product there are two
disclosures. A sentence from November 2024 says that its moderation service for
developers 'powers the moderation service in Le Chat', which predates both the
renaming to Vibe and Shieldstral. And the documentation changelog, which is public
and dated, records a mitigation added to Le Chat in September 2024 against an
obfuscated prompt method that could lead to data exfiltration. That changelog also
dates custom guardrails for agents and conversations to March 2026 and the
moderation API to November 2024. It is a product changelog rather than a register
of guardrails, so guardrail changes are announced and nothing holds them in one
place."

**What moves with it.** Mistral's guardrails figure 3.8 becomes 6.3. Its published
figure 1.4 becomes 1.8. Its final score 0.7 becomes 0.9, and its place is unchanged
at eighth. The seventh finding's "Mistral AI's 1.4" becomes 1.8.

**Why.** The anchor for 0 is "Changes come to light through the press or through
incidents", and that is not what happens. `https://docs.mistral.ai/getting-started/changelog`,
read 23 September 2026, is public and dated and carries guardrail entries: 12 March
2026, "We added Custom Guardrails support for Agents and Conversations"; 6 November
2024, "We released moderation API and batch API"; and 13 September 2024, "In le
Chat, we added a mitigation against an obfuscated prompt method that could lead to
data exfiltration." The anchor for 2 is "Some are announced, but there is no
register", which is what a product changelog gives. It does not reach 4, which asks
for every change dated in the log.

---

## 7. Check 4.1 hard constraints listed, OpenAI: the figure of 3 stands, the reason changes

**Before.** 3. The sentence read: "The constitution defines its top-level rules,
which it calls root rules, as ones nobody can override while the model is running,
and it refers to red-line principles without ever listing them publicly."

**After.** 3. It reads: "The constitution defines its top-level rules, which it
calls root rules, as ones nobody can override while the model is running, and it
lists its red-line principles in a section of that name. What holds it short of
full marks is that root authority points at detailed policies that are not all
published, so the closed list of what cannot be overridden is not visible."

**What moves with it.** No figure moves.

**Why.** `https://model-spec.openai.com/2026-08-18.html`, read 23 September 2026,
has a section headed "Red-line principles" that lists them: "Our models should
never be used to facilitate critical and high severity harms... Humanity should be
in control of how AI is used and how AI behaviors are shaped... We are committed to
safeguarding individuals' privacy in their interactions with AI", followed by three
more for first-party products. The Model Spec changelog dates the section:
v2025.09.12, "Adds a ***Red-line Principles*** section to the Overview". The
defensible reason for holding the cell at 3 rather than raising it to 4 is the
stricter reading: root authority delegates to detailed policies that are not all
published, so the closed list is not visible.

---

## 8. Check 4.1 hard constraints listed, Meta: 1 becomes 0, and the paragraph says what Meta has

**Before.** 1. The paragraph opened: "No set of hard constraints, no consultation,
and no body with authority over either."

**After.** 0. It opens the same way and continues: "Meta's scaling framework names
the propensities a model spec will describe, among them honesty, refusal and
acquiescence to shutdown, and its Muse Spark report refers to an internal behaviour
specification. Neither document is published, and neither names a rule the model
may never break."

**What moves with it.** Meta's hard constraints figure 1.3 becomes 0.0. Its
published figure 1.1 becomes 0.9 on this change alone.

**Why.** The board's own anchor for 0 is "No such set", and that is the sentence the
paragraph already carried under a figure of 1. Both readings were available, and the
figure was taken down rather than the paragraph rewritten upwards, for two reasons.
The anchors decide it: the anchor for 2 is "Referred to, but not listed", and what
Meta refers to is a set of intended propensities and an internal behaviour
specification, neither of which is a set of rules the document says nobody can lift.
And xAI, whose paragraph says "No named set of hard constraints" in almost the same
words and whose framework refers to an unpublished "basic refusal policy", scores 0,
so the two companies are now level where they were a point apart. The paragraph was
still rewritten, because a cell that says only what a company lacks is a cell a
reader cannot check. The sources are the Advanced AI Scaling Framework v2, "The
model spec will describe intended model propensities, including honesty, instruction
following, refusal and redirection, adherence to standards of reasonable care, and
values and objectives including acquiescence to shutdown and lack of coercive
power-seeking behavior", and the Muse Spark report's "an internal behavior
specification", both read 23 September 2026.

**To undo this one.** Set `scores.meta["4.1"]` back to 1 and keep the added
sentences, which are true at either figure. Meta's published figure returns to 1.1
if entries 3 and 4 are also undone.

---

## 9. Check 4.2 comment window, Anthropic: the figure of 1 stands, the sentence changes

**Before.** 1. The sentence read: "The 2026 consultation with outside experts is
described in one sentence that names nobody, and its reference to experts in law,
philosophy and theology looks forward to what Anthropic intends to do."

**After.** 1. It reads: "The 2026 consultation with outside experts is described in
one sentence of the announcement, and the constitution's acknowledgements name
seventeen of them, among them its readers in law, philosophy and theology. Naming
your reviewers is not a public comment window, which is what this question asks
for, and nothing commits Anthropic to opening one."

**What moves with it.** No figure moves.

**Why.** The constitution's own acknowledgements name seventeen external commenters,
among them Mariano-Florentino Cuellar and Jonathan Zittrain in law, Will MacAskill
in philosophy, and Father Brendan McGuire and Bishop Paul Tighe in theology. The
audit reported sixteen; the list has seventeen names. The
news post's sentence, at `https://www.anthropic.com/news/claude-new-constitution`,
22 January 2026, read 23 September 2026, is real: "While writing the constitution,
we sought feedback from various external experts... We'll likely continue to do so
for future versions of the document, from experts in law, philosophy, theology, and
a wide range of other disciplines." The three disciplines it looks forward to are
the three the acknowledgements already fill. The figure survives, because naming
your reviewers is not a public comment window.

---

## 10. Finding 5: Qwen3.8-Max is not proprietary

**Before.** "Alibaba's flagship line, up to Qwen3.8-Max of August 2026 with 2.4
trillion parameters, is proprietary and goes unmentioned."

**After.** "Alibaba's flagship line goes unmentioned, up to Qwen3.8-Max of August
2026. The Max product is served through the API, and the 2.4-trillion-parameter
model behind it was published for anyone to download on 12 August 2026."

**What moves with it.** No figure moves.

**Why.** The open weights were published on 12 August 2026 at
`https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B`, read 23 September 2026, whose card
reads "Qwen3.8-Max is the official version based on Qwen3.8-2.4T-A95B with more
features". The board's own `labs` list already marks Alibaba `open_weights: true`,
and the seventh finding counts Alibaba among the four companies that publish
weights. The point of the sentence, that the Spec names none of them, stands.

---

## 11. Finding 7: Kimi K3's licence adds a clause, and the two thresholds are Kimi K2's

**Before.** "Three of them attach a licence with no restriction on behaviour at
all. DeepSeek releases its 1.6-trillion-parameter model under the plain MIT
licence, Mistral under Apache 2.0, and Moonshot AI under licences whose only added
clauses are commercial: attribution above 100 million monthly users, and a separate
agreement above $20 million in revenue. None of the three says anything about how
its models behave in deployments it does not control."

**After.** "Their licences say almost nothing about behaviour. DeepSeek releases
its 1.6-trillion-parameter model under the plain MIT licence and Mistral under
Apache 2.0, and neither adds a condition of any kind. Moonshot AI's licence for
Kimi K3 adds one sentence about behaviour, that use of the software must comply
with applicable laws and regulations, and one commercial condition, a separate
agreement once a model-as-a-service business passes $20 million of revenue over any
twelve consecutive months. The attribution clause above 100 million monthly users
belongs to the licence for Kimi K2. None of the three says anything about how its
models behave in deployments the company does not control."

**What moves with it.** No figure moves. The figure "Mistral AI's 1.4" in the same
finding becomes 1.8 under entry 6.

**Why.** Kimi K3 is the current flagship and its licence, at
`https://huggingface.co/moonshotai/Kimi-K3/raw/main/LICENSE`, read 23 September
2026, adds a clause that is not commercial: "Licensee's use of the Software must
comply with applicable laws and regulations." Its separate-agreement trigger applies
to a Model-as-a-Service business whose revenue "exceeds 20 million US dollars... in
total over any consecutive 12 months". The two thresholds as the finding stated them
are right for Kimi K2.

---

## 12. Finding 4: the figures on special deployments

**Before.** "This is the widest gap in the grid, where all nine companies score 0
or 2.5 out of 10. Anthropic is the only one that says in writing that some of its
models fall outside its constitution, which is why it scores 2.5."

**After.** "Almost nothing is published here. Anthropic scores 5.0 out of 10,
OpenAI 2.5, and the other seven nothing at all. Anthropic is the only one that says
in writing that some of its models fall outside its constitution, which is why it
scores 5.0."

**What moves with it.** Nothing. It follows entry 2, which took Anthropic's check
1.3 from 1 to 2 and so broke the sentence.

**Why.** The claim "all nine score 0 or 2.5" was true of the board before entry 2
and false after it. "The widest gap in the grid" was a superlative the board's own
data already tied with the comment window, and after entry 2 the comment window is
strictly the lower of the two, so the superlative was dropped rather than moved.

---

## 13. Finding 6: Meta's two figures and its place

**Before.** "It scores 1.1 out of 10 on what is published, level with xAI and above
only Moonshot AI and DeepSeek, and 3.1 out of 10 on what it engages, behind only
OpenAI and Anthropic, which puts it third on the final score with 2.1 out of 10."

**After.** "It scores 0.5 out of 10 on what is published, level with DeepSeek at
the bottom of that figure, and 3.1 out of 10 on what it engages, behind only OpenAI
and Anthropic, which puts it fourth on the final score with 1.8 out of 10."

**What moves with it.** Nothing. It follows entries 3, 4 and 8, which took three of
Meta's check scores down.

**Why.** Meta's published figure, with those three corrections, is 0.4545, which the
board prints as 0.5, and DeepSeek's is the same to nine places. Its final score is
1.79, fourth, behind Google on 1.96.

---

## 14. Finding 1: the change log figures

**Before.** "OpenAI has the best pair, 6.7 on the constitution and 5.8 on the
change log. Anthropic, whose constitution is the more complete, scores 7.5 and 2.5.
... across all nine, the best score on it is 5.8 out of 10."

**After.** "OpenAI has the best pair, 6.7 on the constitution and 5.0 on the change
log. Anthropic, whose constitution is the more complete, scores 8.3 and 2.5. ...
across all nine, the best score on it is 5.0 out of 10."

**What moves with it.** Nothing. It follows entries 1 and 2.

**Why.** OpenAI's change log figure fell with entry 1 and Anthropic's constitution
figure rose with entry 2. OpenAI still has the best pair, 11.7 against Anthropic's
10.8, and its 5.0 is still the best change log score of the nine.

---

## 15. The OpenAI profile drops a qualifier from the 16 per cent

**Before.** "says that this checking has taken 'as high as 16%' of the computing
power used in recent launches"

**After.** "says that in some of its recent launches the share of computing power
given to this checking has 'ranged as high as 16%'"

**What moves with it.** No figure moves.

**Why.** OpenAI's own sentence, in the gpt-oss-safeguard post read 23 September
2026, is "In **some of** our recent launches, the fraction of total compute devoted
to safety reasoning has ranged as high as 16%." The board quoted the figure and
dropped the qualifier that limits it.

---

## 16. The Anthropic profile puts two models' figures in one clause

**Before.** "with operating figures: a refusal rate of 0.05% over a month of
traffic to Sonnet 4.5, and about 1% of extra computing cost."

**After.** "with operating figures: a refusal rate of 0.05% on harmless queries
over a month of traffic to Claude Sonnet 4.5, and a projection that the system
would add roughly 1% of computing cost if it were applied to Claude Opus 4.0
traffic."

**What moves with it.** No figure moves.

**Why.** Anthropic's post of 9 January 2026, read 23 September 2026, says "In one
month of deployment on Claude Sonnet 4.5 traffic, the system achieved a refusal rate
of 0.05% on harmless queries" and, separately, "In total, it adds roughly 1% compute
overhead if applied to Claude Opus 4.0 traffic". The second is a projection about a
different model, and the board read the two as one measurement.

---

## 17. The Mistral profile counted one safety entry where the changelog has three

**Before.** "The change log in its documentation covers features of the API, model
releases and retirements; in its whole history it has one entry that touches on
safety, from September 2024."

**After.** "The change log in its documentation covers features of the API, model
releases and retirements, and three of its entries touch on safety, the most recent
from March 2026."

**What moves with it.** No figure moves. Check 2.2 stays at 0, because the changelog
explains features rather than changes to the rules a model follows.

**Why.** It is the same page as entry 6, and entry 6 names three guardrail entries
in it. Left alone, the two paragraphs of Mistral's own profile would have
contradicted each other. The audit dates the custom guardrails entry 12 March
2025; on the page it sits under the "Mar 26" group, beside the release of
`mistral-moderation-2603`, and the board says March 2026.

---

## 18. The method fold: OpenAI does list the things its models must never do

**Before.** "OpenAI keeps a record of its versions and does not list the things its
models must never do, while Anthropic lists them and keeps no record of its
versions."

**After.** "OpenAI keeps an archive of its versions, one short of complete, where
Anthropic keeps none. Anthropic names the things its models must never do as a
closed set, where OpenAI's top level points at detailed policies it does not
publish."

**What moves with it.** No figure moves. It follows entries 1 and 7.

**Why.** Entry 7 shows that the Model Spec does list its red-line principles, so the
old sentence was false. Entry 1 shows the archive is one version short, so "keeps a
record of its versions" needed the qualification.

---

## 19. The method fold: Meta's place on the final score

**Before.** "Meta publishes almost nothing and is third on what it engages, which
makes it third on the final score."

**After.** "Meta publishes almost nothing and is third on what it engages, which
leaves it fourth on the final score."

**What moves with it.** Nothing. It follows entries 3, 4 and 8.

---

## 20. What could not be established: Alibaba's preface is settled

**Before.** "Alibaba's constitution was not read at its own address. ... Two things
reported elsewhere as part of the preface, an invitation to public comment and an
acknowledgement of safeguards the service applies around the model, are neither
confirmed nor ruled out. A statement of coverage in the preface would change
Alibaba's score on coverage stated."

**After.** "Alibaba's constitution serves no text at its own address. A plain
request to it returns an application shell and no document, so the text used is the
copy this index holds ... The preface's invitation to public comment and the
overview's acknowledgement of safeguards the service applies around the model are
both confirmed, and there is no statement of coverage anywhere in the document.
Anyone who tries to check a quotation at that address will meet the same shell."

**What moves with it.** No figure moves. Check 1.2 for Alibaba stays at 0, and the
open point that would have moved it is closed.

**Why.** Both passages were confirmed at the document's own address on 23 September
2026, and the search for a scope clause found none. The invitation to comment is in
the foreword, 前言, and the acknowledgement of service-layer safeguards is in the
overview, 概述, which is where practices I1 and I3 already quote.

---

## 21. A source on every row

**What changed.** `site/governance.json` gained an `evidence` block: for each of
the nine companies, each of the ten checks and each of the five practices `S1` to
`S5` now carries the passages its score rests on, each with its address, the
document's own date and the day we read it, or a sentence saying where we looked
and found nothing.

Of the 135 cells, 90 carry at least one quoted passage, 159 passages in all, and
45 carry a sentence alone. Every one of those 45 scores 0 for want of anything
published, bar one: xAI's `S3`, which scores 1 for a testing agreement with the
United States Center for AI Standards and Innovation for which we found no public
address. `tests/test_governance_tab.py` names that cell, so a second one cannot
appear unnoticed.

| Company | Cells with a passage | Passages |
|---|---|---|
| OpenAI | 13 of 15 | 28 |
| Anthropic | 13 of 15 | 23 |
| DeepSeek | 12 of 15 | 17 |
| Google DeepMind | 10 of 15 | 17 |
| Meta | 10 of 15 | 19 |
| Mistral AI | 9 of 15 | 19 |
| xAI | 9 of 15 | 14 |
| Moonshot AI | 9 of 15 | 14 |
| Alibaba | 5 of 15 | 8 |

Alibaba is lowest because its document serves no text at its own address and
because nine of its fifteen rows score 0 on an absence.

`site/governance.js` gained `evidenceBlock`, which prints that under "What this
rests on" in the popover a check or a practice opens, or under "Where we looked"
when there is no passage to print. It reuses `sourceQuote`, the same block the four
practices only a company can show have always had, and `sourceQuote` now prints the
day a source was read where the source carries one.

`app/lib/board-tools.mjs` hands the same block to a client through
`governance_board`, so a reader and a client are told the same thing.

`site/overview.html` now promises it of every row: "Every row on the board rests on
a passage quoted with its address in the popover behind the score, or on a sentence
there saying where we looked and found nothing." It used to promise it of the four
practices only a company can show, and said nothing about where the promise stopped.

**Why.** All 52 quotations behind practices `I1` to `I4` are verbatim, every date is
right and no address is dead. The ten checks, the five practices `S1` to `S5` and the
nine company profiles carried prose and no address, and every factual error corrected
above was in that half of the board.

**To undo this one.** Remove the `evidence` key from `site/governance.json`,
`evidenceBlock` and its two call sites from `site/governance.js`, `evidenceOf` from
`app/lib/board-tools.mjs`, the class `EveryRowCarriesItsSource` from the tests, and
the two paragraphs in `site/overview.html`. No figure depends on it.

---

## 22. Two addresses in the source list

**Before.** The Mistral AI group of "Sources, company by company" linked
`https://docs.mistral.ai/capabilities/guardrailing`.

**After.** It links `https://docs.mistral.ai/studio/conversations/moderation`, and
a second line links `https://docs.mistral.ai/resources/changelogs`.

**What moves with it.** No figure moves.

**Why.** The old address answers with a redirect to the new one, and the changelog
is now the evidence behind check 3.2, so it belongs in the list a reader is given.

---

## 23. The walker's pinned board

**Before.** `engine/verify-reader-features.mjs` held the board to "OpenAI,
Anthropic, Meta, Google DeepMind, ..." and to the figures `5.6,5.5,2.1,2.0,...`.

**After.** It holds it to "Anthropic, OpenAI, Google DeepMind, Meta, ..." and to
`5.6,5.5,2.0,1.8,...`, with the two figures under them.

**What moves with it.** Nothing. It is the browser walker reading the rendered
page, and it fails on any figure change that the board itself has not been told
about.

---

## The ranking, before and after

| Place | Before | Final score | After | Final score |
|---|---|---|---|---|
| 1 | OpenAI | 5.6 | Anthropic | 5.6 |
| 2 | Anthropic | 5.5 | OpenAI | 5.5 |
| 3 | Meta | 2.1 | Google DeepMind | 2.0 |
| 4 | Google DeepMind | 2.0 | Meta | 1.8 |
| 5 | Alibaba | 1.8 | Alibaba | 1.8 |
| 6 | xAI | 1.5 | xAI | 1.5 |
| 7 | Moonshot AI | 1.1 | Moonshot AI | 1.1 |
| 8 | Mistral AI | 0.7 | Mistral AI | 0.9 |
| 9 | DeepSeek | 0.5 | DeepSeek | 0.5 |

Meta and Alibaba both print 1.8 and are a hundredth apart, 1.79 against 1.76, so
the fourth and fifth places are decided below the figure the board shows.

The two figures behind the final score, before and after:

| Company | Published, before | Published, after | Engages, before | Engages, after |
|---|---|---|---|---|
| Anthropic | 5.9 | 6.1 | 5.0 | 5.0 |
| OpenAI | 6.1 | 5.9 | 5.0 | 5.0 |
| Google DeepMind | 2.0 | 2.0 | 1.9 | 1.9 |
| Meta | 1.1 | 0.5 | 3.1 | 3.1 |
| Alibaba | 2.3 | 2.3 | 1.3 | 1.3 |
| xAI | 1.1 | 1.1 | 1.9 | 1.9 |
| Moonshot AI | 0.9 | 0.9 | 1.3 | 1.3 |
| Mistral AI | 1.4 | 1.8 | 0.0 | 0.0 |
| DeepSeek | 0.5 | 0.5 | 0.6 | 0.6 |
