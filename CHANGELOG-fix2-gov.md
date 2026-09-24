# Governance board, second audit: what was changed

Eight cells of the governance board were marked wrong by a second audit
(`aci-audit2/.audit/sections/04-governance-checks.md` and
`05-governance-practices.md`). Each entry below gives the figure and the sentence
before, the figure and the sentence after, what moves with it, and the source
with the day it was read.

Every sentence here is verbatim from `site/governance.json`, apart from the one
link, which is from `site/overview.html`.

---

## 1. Mistral AI, the paragraph shown behind four cells

The paragraph is `profiles.mistral.practices_engaged`, which the board shows
behind all four of Mistral's cells under "what it engages" (`S2`, `S3`, `S4`,
`S5`).

**Figure before:** `S2` 0, `S3` 0, `S4` 0, `S5` 0.

**Sentence before:**

> Stanford's Foundation Model Transparency Index credited Mistral with 7 of its
> 88 indicators in December 2025, including 0 of 2 on model behaviour policy:
> "No disclosed model behavior policy detailing permitted, restricted, or
> prohibited behaviors."

**Figure after:** `S2` 0, `S3` 0, `S4` 0, `S5` 0. No figure moves. Mistral scores
0 on all four rows under any reading.

**Sentence after:**

> Stanford's Foundation Model Transparency Index scored Mistral 18 of its 100
> indicators in December 2025, and nothing on either of the two indicators that
> ask about a model behaviour policy, where the report records that no
> information was provided. That edition also says that the first reports for
> Mistral and Anthropic were prepared by the index team rather than by the
> companies, and that 30% of the companies it contacted agreed to submit a
> transparency report in 2025, down from 74% in 2024.

**What moves downstream.** Nothing. Mistral's two figures stay at 1.8 on what is
published and 0.0 on what it engages, its final score stays at 0.9, and it stays
eighth.

**Why.** Three faults in one sentence. The index has 100 indicators, not 88.
Mistral scores 18, not 7. And the sentence in quotation marks is not in the
report: indicator 84, "Permitted, restricted, and prohibited model behaviors",
records "Disclosure: No information provided" and "Score justification: No
information provided". A sentence in quotation marks attributed to a named
institution that the institution did not write is the worst thing this board can
carry, so the quotation is gone rather than repaired. The two facts that replace
it are on the index's own page for that edition and are checkable.

**Source.** Stanford Foundation Model Transparency Index, December 2025 edition,
https://crfm.stanford.edu/fmti/December-2025/index.html and the company report
at
https://crfm.stanford.edu/fmti/December-2025/company-reports/Mistral_FinalReport_FMTI2025.html,
read 24 September 2026. Both were already in "Sources reviewed" under Mistral AI.

---

## 2. Meta, practice `S5`, change approval

**Figure before:** 1 of 2.

**Sentences before.** The quoted passage:

> updates to this Advanced AI Scaling Framework, internal use reports, and
> related deployments and disclosures, with model deployment following
> appropriate consultation with relevant teams and with the approval of the
> Chief AI Officer

And the cell's own sentence:

> The approval named here is for changes to the Advanced AI Scaling Framework.
> Meta publishes no constitution for it to reach.

And the clause in the profile:

> The framework has a named internal sign-off, though no constitution does (1).

**Figure after:** 0 of 2.

**Sentences after.** The quoted passage, whole:

> The Chief AI Officer supervises and is supported by the Director of Alignment
> and Risk, who bears responsibility for executing the lifecycle of risk
> assessment and mitigation, preparedness reports, updates to this Advanced AI
> Scaling Framework, internal use reports, and related deployments and
> disclosures, with model deployment following appropriate consultation with
> relevant teams and with the approval of the Chief AI Officer.

And the cell's own sentence:

> The approval this clause names is for model deployment. Updates to the
> framework sit among the things the Director of Alignment and Risk executes,
> and no approver is named for them. The change log names the same two officers
> as responsible decision-makers for risk decisions, and says nothing about
> amending any document. Meta publishes no constitution for a clause of this
> kind to reach.

And the clause in the profile:

> No public evidence was found of who inside Meta approves a change to a
> document about how its models behave, and the approval its scaling framework
> names is for model deployment (0).

**Why.** The board quoted the sentence from its middle, which dropped the
governing words "who bears responsibility for executing" and put the framework
next to the approval clause. The approval the clause names is for model
deployment. Updates to the framework sit in the list of things the Director of
Alignment and Risk executes, with no approver named. The quotation was verbatim;
the cut manufactured the reading.

**What moves downstream.**

| | before | after |
|---|---|---|
| Meta, what it engages | 3.1 | 2.5 |
| Meta, final score | 1.8 | 1.5 |
| Meta, place | fourth | sixth |
| Meta, "Change control" group, which holds `S5` alone | 5.0 | 0.0 |

The finding "Meta publishes almost nothing and engages more than most" moves with
it. Before:

> It scores 0.5 out of 10 on what is published, level with DeepSeek at the bottom
> of that figure, and 3.1 out of 10 on what it engages, behind only OpenAI and
> Anthropic, which puts it fourth on the final score with 1.8 out of 10.

After:

> It scores 0.5 out of 10 on what is published, level with DeepSeek at the bottom
> of that figure, and 2.5 out of 10 on what it engages, behind only OpenAI and
> Anthropic, which puts it sixth on the final score with 1.5 out of 10.

Meta is still third on what it engages, so the finding's title and the rest of it
stand.

The method copy in `site/overview.html` moves with it. Before:

> Meta publishes almost nothing and is third on what it engages, which leaves it
> fourth on the final score.

After:

> Meta publishes almost nothing and is third on what it engages, which leaves it
> sixth on the final score.

`tests/test_governance_tab.py` moves with the sentences: `ORDER`, the three rows
of printed figures, and the two assertions on Meta's place.
`engine/verify-reader-features.mjs` pins the same three rows against the rendered
board, and moves with them.

**Source.** Meta, Advanced AI Scaling Framework v2, section 2.3,
https://ai.meta.com/static-resource/Meta_Advanced-AI-Scaling-Framework-v2, read
24 September 2026.

**Left alone, and worth the owner's eye.** Anthropic's `S5` stays at 0. Its
Responsible Scaling Policy v3.4, section 4, item 8, says "Policy changes: Changes
to the RSP will be proposed by the CEO and RSO, and approved by the Board in
consultation with the LTBT", which names a proposer and an approver for changes
to a governing document. The row asks about the constitution rather than about
any governing document, so 0 is right on the row as written, but the pair is
worth reading together.

---

## 3. Anthropic, check `3.1`, guardrails disclosed

**Figure before:** 4 of 4, the only 4 on the row.

**Sentence before:**

> The four layers are published as planned ASL-3 deployment safeguards, and their
> stated coverage is general access to Claude.ai and the API. We found no list of
> this kind for Claude Code or for Claude Gov.

The two passages from the Responsible Scaling Policy both carried the date
`14 August 2026`.

**Figure after:** 3 of 4.

**Sentence after:**

> The four layers are published as planned ASL-3 deployment safeguards, in an
> overview the page dates 15 October 2024, and their stated coverage is general
> access to Claude.ai and the API. We found no list of this kind for Claude Code
> or for Claude Gov, and no later inventory of the guardrails in use.

Both passages from the Responsible Scaling Policy now carry the date
`15 October 2024`.

**Why.** The anchor for 4 is "A list by kind, across every product in use", and
both halves of it fail on the board's own evidence. The four layers are
safeguards Anthropic said it would build, under a heading the page dates 15
October 2024 and titles "Planned ASL-3 Safeguards", introduced by "This overview
outlines the planned technical architecture". And the coverage the board itself
records is general access to Claude.ai and the API, with no list of this kind for
Claude Code or Claude Gov. The date the board carried, 14 August 2026, is the
page's "Last updated" stamp for a page that is a list of dated posts.

**What moves downstream.** Nothing visible, because check `3.2` rises by the same
point in the same question.

| | before | after |
|---|---|---|
| Anthropic, question 3 (Guardrails) | 2.5 of 4, shown 6.3 | 2.5 of 4, shown 6.3 |
| Anthropic, what is published | 6.1 | 6.1 |
| Anthropic, final score | 5.6 | 5.6 |
| Anthropic, place | first | first |

**Source.** Anthropic's Responsible Scaling Policy,
https://www.anthropic.com/responsible-scaling-policy, read 24 September 2026. The
two quoted passages both sit under headings the page dates October 15, 2024,
"Multi-layered defense-in-depth architecture" and "Access controls".

---

## 4. Anthropic, check `3.2`, guardrail changes logged

**Figure before:** 1 of 4.

**Sentence before, and after, unchanged:**

> Anthropic announces changes to its classifiers in its own research posts. We
> found no register of guardrails and no version history for them.

**Figure after:** 2 of 4.

**Why.** The anchor for 2 is "Some are announced, but there is no register",
which is the cell's own sentence word for word. Mistral was raised to 2 on 24
September for exactly this, with the reason "The anchor for 2 is 'Some are
announced, but there is no register', which is what a product changelog gives".
Nothing on the board argued for a deduction from Anthropic's, and it sat a point
below a company whose disclosure is a product changelog. The sentence needed no
rewriting, because it already described a 2.

**What moves downstream.** Nothing visible. Taken with entry 3, the two cancel
exactly: Anthropic's question 3 stays at 2.5 of 4, its figure on what is
published stays at 6.1, its final score stays at 5.6 and it keeps first place.

**Source.** Anthropic, Next-generation Constitutional Classifiers,
https://www.anthropic.com/research/next-generation-constitutional-classifiers,
9 January 2026, read 24 September 2026.

**Left alone, with the reason.** OpenAI and Google also sit at 1 on this row and
were not moved. OpenAI has an argument of its own on the board, in the finding
that its fastest-moving layer is announced nowhere, and Google's restriction was
announced to CNBC on the day. Both are arguments a reader can weigh; Anthropic's
row had none.

---

## 5. The finding on open weights, the Kimi K3 licence

**Figure before and after:** no figure. This is prose in the finding "Most
companies whose models anyone can download sit at the bottom, partly because of
the questions".

**Sentence before:**

> Moonshot AI's licence for Kimi K3 adds one sentence about behaviour, that use
> of the software must comply with applicable laws and regulations, and one
> commercial condition, a separate agreement once a model-as-a-service business
> passes $20 million of revenue over any twelve consecutive months. The
> attribution clause above 100 million monthly users belongs to the licence for
> Kimi K2.

**Sentence after:**

> Moonshot AI's licence for Kimi K3 adds one sentence about behaviour, that use
> of the software must comply with applicable laws and regulations, and two
> commercial conditions. Section 2 asks for a separate agreement once a
> model-as-a-service business passes $20 million of revenue over any twelve
> consecutive months, and section 3 asks that the name Kimi K3 be displayed
> prominently on any product or service with more than 100 million monthly
> active users or more than $20 million of monthly revenue.

**Why.** Section 3 of the Kimi K3 licence carries both thresholds: "If the
Software (or any derivative works thereof) is used for any of the Licensee's
commercial products or services that have more than 100 million monthly active
users, or more than 20 million US dollars (or equivalent in other currencies) in
monthly revenue, 'Kimi K3' must be prominently displayed on the user interface of
such product or service." That licence is the source the board itself cites on
checks `1.1` and `4.1`. The sentence was introduced by a correction made on 24
September, so a repair had put a new false sentence on the board. Section 2 is
the separate-agreement clause, which was right and is kept, now named by its
section so the two conditions cannot be read as one.

**What moves downstream.** Nothing. The point of the paragraph, that none of the
three licences says anything about how the model behaves, is unaffected, and so
are every figure and place on the board.

**Source.** https://huggingface.co/moonshotai/Kimi-K3/raw/main/LICENSE, sections
2 and 3, read 24 September 2026.

**The dead link in the same entry.** Under Moonshot AI, "Sources reviewed" in
`site/overview.html` linked

> https://www.aisi.gov.uk/blog/preliminary-assessment-of-kimi-k3-s-cyber-capabilities

which returns HTTP 404. It now links

> https://www.aisi.gov.uk/blog/preliminary-assessment-of-kimi-k3s-cyber-capabilities

which is the address the `S3` evidence block already carried. The difference is
the hyphen before the s. Checked 24 September 2026.

---

## The ranking of all nine

Every figure is out of 10.

| place before | company | score before | | place after | company | score after |
|---|---|---|---|---|---|---|
| 1 | Anthropic | 5.6 | | 1 | Anthropic | 5.6 |
| 2 | OpenAI | 5.5 | | 2 | OpenAI | 5.5 |
| 3 | Google DeepMind | 2.0 | | 3 | Google DeepMind | 2.0 |
| 4 | Meta | 1.8 | | 4 | Alibaba | 1.8 |
| 5 | Alibaba | 1.8 | | 5 | xAI | 1.5 |
| 6 | xAI | 1.5 | | 6 | Meta | 1.5 |
| 7 | Moonshot AI | 1.1 | | 7 | Moonshot AI | 1.1 |
| 8 | Mistral AI | 0.9 | | 8 | Mistral AI | 0.9 |
| 9 | DeepSeek | 0.5 | | 9 | DeepSeek | 0.5 |

One company moved. Meta fell from fourth to sixth, below Alibaba and xAI, and
Alibaba and xAI each rose a place with no change to their own figures.

The board prints one decimal and ranks on the figure, so two pairs read as level
and are not. Before, Meta and Alibaba both printed 1.8, at 1.7898 and 1.7613.
After, xAI and Meta both print 1.5, at 1.5057 and 1.4773.
