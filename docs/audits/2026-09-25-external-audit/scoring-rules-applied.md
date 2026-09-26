# Governance board: the nine rules of 26 September 2026 applied

Worktree `/Users/sverbo/Desktop/Codes/Polaris/aci-unanalysed`, branch `feat/manual-corrections`. Edited: `site/governance.json`, `site/overview.json`, `tests/test_governance_tab.py`. Nothing committed. Both JSON files keep their serialisation (indent 1, ensure_ascii off, trailing newline) and contain no long dash. Edit scripts: `rules-apply-gov.py`, `rules-apply-gov2.py`, `rules-apply-ov.py`; counterfactuals: `rules-scenarios.py`.

Checks: `python3 -m pytest -q tests engine` 923 passed, 357 subtests; `node --test app/lib/__tests__/*.test.mjs` 390 passed.

**Heads-up.** While I worked, the parent session committed `f819f2b` ("eight behaviour figures set by hand"), which changed `site/constitutions.json`. That moved the overview's constitution-side tiers (Anthropic drops to the middle tier on the constitutions final score, 0.845 of the best). I fixed the three overview sentences it broke (section 3, marked "f819f2b"). Revert those if that session means to handle them.

## 1. Score changes (21), each with its source

Every new source quotes the audit verbatim, with the audit's title, url and date, and `read` "26 September 2026".

**Rule 1**
- OpenAI 1.2, 3 → 4. The class "the models that power OpenAI's products" includes the flagships. Added: GPT-6 Astra system card, alignment (https://deploymentsafety.openai.com/gpt-6-astra/alignment). The `reading` of 1.2 now states the rule.

**Rule 2**
- Mistral AI 1.1, 0 → 2. The Vibe CLI prompts are a partial constitution. Sources: https://github.com/mistralai/mistral-vibe/blob/main/vibe/core/prompts/cli.md (instruction hierarchy, 12 June 2026), .../cli_2026-08_v3.md (refusal rule), Medium 3.5 SYSTEM_PROMPT.txt. The FMTI source is now dated December 2025.
- Mistral AI 4.1, 1 → 2. "Critical instructions" in cli.md cover one product. The CSAM clause is kept and described as binding users. Sources: cli.md (two quotes) and cli_2026-08_v3.md ("confirm first unless durably authorized...").
- Mistral AI S1, 0 → 1. Apache 2.0 on a partial text. Source: https://github.com/mistralai/mistral-vibe/blob/main/LICENSE
- Mistral AI 2.2, 0 → 2. The prompt history shows every change line by line, with no reasons. Source: commit cafb6d4 (https://github.com/mistralai/mistral-vibe/commit/cafb6d4147479c3ab50e0a0fc88de553a48df69b).
- xAI 2.2, 0 → 2. Same basis. Sources: commit c5de4a1 (https://github.com/xai-org/grok-prompts/commit/c5de4a14feb50b0e5b3e8554f9c8aae8c97b56b4) and https://simonwillison.net/2025/Jul/15/xai-mitigated/

**Rule 4**
- Alibaba 1.2, 0 → 2. The overview implies it governs the production models. Source: https://s.alibaba.com/aaig/specification (当前生产模型 sentence, with a translation).
- DeepSeek 1.2 stays 0. `looked` now gives the reason: the only behaviour text is one sentence.

**Rule 5**
- DeepSeek S2, 0 → 1. The R1 safety report, whose results stop at R1. Added: arXiv v2 section 5 (https://arxiv.org/abs/2501.12948v2).

**Rule 6**
- DeepSeek I4 stays 0. The sentence now says the R1 filter on its own service is counted under 3.1, and that nothing is published on monitoring behaviour in use.

**Rule 7**
- Alibaba 3.1, 2 → 3. The customer-product sources are replaced by Model Studio: https://help.aliyun.com/zh/model-studio/content-security and https://help.aliyun.com/zh/document_detail/2923687.html (two quotes).
- Meta 3.1, 1 → 3. Sources: Muse blog, Sentinel and Browser (https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse); Muse Spark report sections 1.3 and 2.2; Llama 4 model card. I used the second reader's corrected Sentinel quote, which starts "Sentinel is a separate host-side agent... It is the sole permission authority". I dropped the 2.1.3 phrase and "refusal mechanisms", which that reader flagged.

**Rule 8**
- Meta 3.2, 0 → 2. Sources: https://about.fb.com/news/2025/10/teen-ai-safety-approach/ (update of 23 January 2026) and https://about.fb.com/news/2026/07/keeping-parents-informed-teens-distress-conversations-meta-ai/ (16 July 2026). The TechCrunch source is kept as the August 2025 change that came out through the press. The 16 April post is not cited, because the audit gives no verbatim quote for it.
- xAI 3.2, 1 → 2. Added: TechSpot (https://www.techspot.com/news/110937-x-has-blocked-grok-editing-images-real-people.html). `looked`, the profile and finding 1 say that X has belonged to xAI since 2025.

**Rule 9**
- xAI 1.3, 0 → 2. Sources: FAIF section 2.3 (https://media.x.ai/v1/website/xai-frontier-artificial-intelligence-framework-30-june-2026-99c40684.pdf) and Axios (https://www.axios.com/2026/02/23/ai-defense-department-deal-musk-xai-grok).

**Anthropic corrections**
- 2.1, 1 → 2. Sources: https://www.anthropic.com/news/claudes-constitution (update note of 21 January 2026) and the PDF "Published January 21, 2026".
- 2.2, 0 → 1. Source: https://www.anthropic.com/news/claude-new-constitution. The RSP source is re-dated 2 April 2026.
- 2.3, 2 → 3. Source: https://www.anthropic.com/responsible-scaling-policy/roadmap (the 90-day sentence). `looked` says it is a period for updating the text, sets none for logging, and has no version-to-model mapping. The API and Claude Code gap is noted.
- S3, 0 → 1. Sources: UK AISI arXiv 2604.00788, https://openai.com/index/openai-anthropic-safety-evaluation/, and https://www.anthropic.com/research/alignment-assessment-cybersecurity-incidents (METR). `looked` does not name the other company, following the house rule.

## 2. New figures, ranks and overview tiers

The board prints one decimal (toFixed). Unrounded values in brackets.

| Rank | Company | Q1 | Q2 | Q3 | Q4 | Published | Engages | Final |
|---|---|---|---|---|---|---|---|---|
| 1 | OpenAI | 8.3 | 5.8 | 6.3 | 6.3 | 7.0 (7.045) | 5.6 (5.625) | 6.3 (6.335) |
| 2 | Anthropic | 8.3 | 5.0 | 6.3 | 6.3 | 6.8 (6.818) | 5.6 (5.625) | 6.2 (6.222) |
| 3 | xAI | 3.3 | 5.0 | 6.3 | 2.5 | 4.3 (4.318) | 2.5 | 3.4 (3.409) |
| 4 | Google DeepMind | 4.2 | 0.8 | 6.3 | 2.5 | 3.0 (2.955) | 3.1 (3.125) | 3.0 (3.040) |
| 5 | Alibaba | 5.0 | 0.0 | 3.8 | 3.8 | 3.2 (3.182) | 1.9 (1.875) | 2.5 (2.528) |
| 6 | Meta | 0.8 | 0.8 | 6.3 | 0.0 | 1.6 (1.591) | 2.5 | 2.0 (2.045) |
| 7 | Mistral AI | 1.7 | 3.3 | 6.3 | 2.5 | 3.4 (3.409) | 0.0 | 1.7 (1.705) |
| 8 | DeepSeek | 0.8 | 0.0 | 2.5 | 0.0 | 0.7 (0.682) | 1.3 (1.25) | 1.0 (0.966) |
| 9 | Moonshot AI | 0.8 | 0.8 | 2.5 | 0.0 | 0.9 (0.909) | 0.6 (0.625) | 0.8 (0.767) |

These match the expected figures (6.34, 6.22, 3.41, 3.04, 2.53, 2.05, 1.70, 0.97, 0.77). There are no ties on the final score. OpenAI and Anthropic are level on engages, as are xAI and Meta. OpenAI leads Anthropic by 0.114, exactly one check point.

Ranks on published: OpenAI, Anthropic, xAI, Mistral AI, Alibaba, Google DeepMind, Meta, Moonshot AI, DeepSeek. On engages: OpenAI = Anthropic, Google DeepMind, Meta = xAI, Alibaba, DeepSeek, Moonshot AI, Mistral AI.

Overview tiers (share of the row's best; Best in class ≥ 0.85, Middle ≥ 0.5):
- Governance final: OpenAI and Anthropic (0.982) best in class. **xAI middle (0.538, was behind).** All others behind.
- Published: OpenAI and Anthropic (0.968) best in class. **xAI middle (0.613, was behind).** Mistral AI behind (0.484). Others behind.
- Engages: OpenAI and Anthropic (1.000) best in class. Google DeepMind middle (0.556). Others behind. Mistral AI has none.
- Constitutions rows, after f819f2b: whole has OpenAI and Alibaba best in class, Anthropic middle. Behaviours has all three best in class. **The constitutions final has OpenAI and Alibaba best in class and Anthropic middle (0.845, was best in class).**

## 3. Texts changed

**governance.json, per company**
- `questions[0].checks[1].reading` (1.2): rewritten to state rule 1 and the anchor 2.
- OpenAI: 1.2 `looked`. `profiles.1` now says "since February 2025", not "since 2024", and adds that the class includes the flagships.
- Anthropic:
  - `looked` for 2.1, 2.2, 2.3 and S3.
  - `profiles.1`: coverage stated "as a class".
  - `profiles.2`: rewritten (2023 version, announcement, RSP redlines, 90-day roadmap, API and Claude Code gap).
  - `profiles.4`: "has the highest score" became "scores full marks" (a ranking word in a company text).
  - `practices_engaged`: S3 now (1), and the outside audit is dated March 2026.
  - `column_readings` published and engages ("Just over half marks").
- xAI: `looked` for 1.3, 2.2 and 3.2. `profiles.1` (government regime acknowledged), `profiles.2` (line by line), `profiles.3` (X belongs to xAI), `column_readings.published`.
- Mistral AI:
  - `looked` for 1.1, 2.2, 4.1 and S1.
  - `profiles.1` rewritten. It opens on the Vibe prompts, "withdrawn" became "deprecated", and it adds the usage policy's military clause. The chief executive's words are attributed to him, and "the extreme case among the nine" is dropped.
  - `profiles.2`: the production prompt sentence is split between the CLI and Vibe as an assistant.
  - `profiles.4` rewritten, including the 30-day private notice.
  - `practices_published` now (1). `column_readings.published`.
- Alibaba:
  - `looked` for 1.2 and 3.1.
  - `profiles.1`: partial credit on coverage.
  - `profiles.2`: the bare date, and "which version governs which model".
  - `profiles.3` rewritten. Model Studio is added. The wrong guardrail list (Shark, Jellyfish, Oyster, Qwen3Guard credited to AAIG) is replaced by the second reader's confirmed rewrite.
  - `column_readings.published`.
- DeepSeek: 1.2 `looked` (why it stays 0), S2 `looked`, the I4 sentence, `practices_engaged` now (1), `column_readings.engages`.
- Meta: 3.1 and 3.2 `looked`, `profiles.3` rewritten, `column_readings.published`.

**governance.json, cross-company**
- Findings:
  - 0: OpenAI 8.3 and 5.8, Anthropic 8.3 and 5.0. "Whose constitution is the more complete" is dropped.
  - 1: adds the Vibe prompt variant of 26 August 2026 as an unannounced weakening, and says X has belonged to xAI since 2025.
  - 2: title "across its own apps". Adds Alibaba's Model Studio, "seven companies score 7.5 out of 10 and none scores more", and Meta "kind by kind".
  - 3: "Anthropic, OpenAI and xAI score 5.0 ... the other six". Adds xAI's FAIF sentence, and says Google has not acknowledged that the rules differ.
  - 4: Alibaba's implied coverage, 5.0 out of 10.
  - 5: Meta 1.6 published and seventh, 2.0 final and sixth.
  - 6: the last three on the final score are 1.7, 1.0 and 0.8. Moonshot AI and DeepSeek are the two lowest on published, Mistral AI's 3.4 is fourth, and Alibaba is fifth with 3.2.
  - 7: Mistral AI "no document ... in general, only the system prompts of its coding agent".
- `page`, gov-method:
  - The new rules block after the gov-scoring slot.
  - "How we looked": a person decided the held corrections on 26 September 2026.
  - "How to read": Anthropic's earlier version survives at its old address. Mistral AI is fourth on published. The "Six of the nine" paragraph is rewritten (xAI and Mistral AI third and fourth, ahead of Alibaba).
- `page`, gov-limitations: the rules are ours. The dates now include 26 September 2026. A new bullet says the Model Studio category page was updated after the reading.
- `page`, gov-sources: 22 new source lines. The Meta teen post line now says "updated 23 January and 16 April 2026".
- Top-level `looked` and `ours_note`: one sentence each on the rules of 26 September 2026.
- `open_questions`: the unanchored-practices entry is recounted (14 of 32 cells; the first place and DeepSeek over Moonshot AI decided by them). The first-place entry is rewritten. Nine new entries follow (section 5).

**overview.json**
- Takeaway 0: adds the Mistral AI prompts. The governance view counts them as a partial constitution, and xAI reaches the middle tier with them.
- Takeaway 2: xAI's framework sentence is added, and the Google sentence is separated.
- Takeaway 4: Anthropic is "best in class on the behaviours ... and on all three governance figures, and in the middle tier on the document as a whole and on the final score of what the constitutions say". **f819f2b.**
- Summaries:
  - OpenAI `constitutions` and `behaviours`: harm and safety now ties helpfulness (8.8) and honesty is 8.0. **f819f2b.**
  - Anthropic `profile`, `governance` ("A little over half marks"), `published` and `engages`.
  - Alibaba `behaviours` (honesty 8.22 against harm 8.25, **f819f2b**), `governance` and `published`.
  - Mistral AI `profile`, `governance` ("Low") and `published`.
  - Meta `governance` and `published`.
  - xAI `governance` and `published`.
  - DeepSeek `governance` and `engages`.

**tests/test_governance_tab.py**
- ORDER is the new order, with a comment dated 26 September 2026.
- `test_the_ranking_is_the_final_score`: the three printed rows are updated.
- Meta finding: fourth on engages level with xAI, seventh on published.
- Whole-column findings: xAI is added to the 1.3 set, and "the other six".
- Open-weights finding: two lowest, Mistral AI fourth, the last three with their final figures.

## 4. The new block in "Detailed scoring" (`page.sections` gov-method, inserted after the scoring tables)

```
### Rules we added to the descriptions*

Some cases fit none of the descriptions above, or two of them. We decided each once, for all nine companies.

- A sentence naming a class of models that includes the most-used ones counts as a statement of coverage, and is worth 4 of 4 on coverage stated (1.2).
- System prompts a company publishes count as a partial constitution, worth 2 of 4 on constitution published (1.1), and a history that shows each change to them line by line, without reasons, is worth 2 of 4 on changes explained (2.2).
- On versions kept (2.1) a bare date is worth 0, and a version label, a versions menu, an earlier text still online or a published promise to keep past versions is worth 1.
- Coverage that a document implies without stating it is worth 2 of 4 on coverage stated (1.2), as the description of a 2 says.
- A published safety evaluation against the company's own policies, with its results, is worth 1 of 2 on adherence tests published (S2).
- One disclosure earns points on one row only, the row it fits best.
- Guardrails listed by category for one platform are worth 3 of 4 on guardrails disclosed (3.1).
- Guardrail changes a company announces on its own channels, with no register, are worth 2 of 4 on guardrail changes logged (3.2), as the description of a 2 says.
- A special regime a company acknowledges without describing it is worth 2 of 4 on special deployments (1.3), as the description of a 2 says.

*These rules are our own choices, made on 26 September 2026 so that every company is scored the same way where the descriptions left a case open. They come from neither working paper.
```

## 5. Open questions as written

Nine new entries, raised 26 September 2026, plus two existing entries rewritten.

### `the-two-figures-are-added-without-anchors` (existing, rewritten)

**The two figures are added, and the condition set for adding them was never met**

Adding what is published to what it engages was argued on the ground that the practices would be anchored as the checks are. No full description of 0, 1 and 2 was written for S1 to S5; the rules of 26 September 2026 say what earns a 1 in two cases, an open licence on a partial text and a safety evaluation against the company's own policies. Fourteen of the thirty-two non-zero cells of what it engages sit on S2 to S5, and they decide places: OpenAI leads Anthropic by less than what one point on any of them is worth, and DeepSeek is eighth, ahead of Moonshot AI, on the strength of its 1 on published adherence tests.

*What would settle it:* Writing an anchor for each of S1 to S5, then rescoring those cells against it.

### `first-place-is-one-point-on-one-check` (existing, rewritten)

**OpenAI leads Anthropic by one point on one check**

OpenAI leads Anthropic by about 0.11 out of 10, 6.34 against 6.22, which is exactly what one point on one check is worth. The two are level on what they engage, 5.6 each, and their rows on what is published differ by a single point, net. Both moved on 26 September 2026: the rule on coverage stated as a class raised OpenAI by one point, and the four corrections approved for Anthropic raised it by three points on checks and one on a practice. Without that rule the two would be level. The audit that proposed the Anthropic corrections was carried out with Anthropic's models, and a person approved them. Any single point read the other way on either company would tie them or reverse the order.

*What would settle it:* Saying on the board, where the order is shown, that the first two places are one check apart, and treating any further reading of either company's rows as a question for both at once.

### `rule-coverage-stated-as-a-class`

**Coverage stated as a class counts as stated**

We score a sentence that names a class of models, such as the models that power a company's products, as a full statement of coverage when the most-used models belong to it. OpenAI's coverage stated rose from 3 to 4, level with Anthropic, whose constitution names no model either. The other choice was 3 for both, keeping 4 for a document that lists its models: each of the two leaders would lose 0.11 on the final score and their order would stand. The rule makes naming models unnecessary. A reader cannot tell from the document alone whether a given model is covered, only from what the company says elsewhere, such as a system card saying a model was trained on it. It rewards the broad sentence both leaders already wrote, and gives no company a reason to publish a list of models.

*What would settle it:* Deciding whether the memo's ask, that no deployed model goes ungoverned, can be checked without a list of models, and if it cannot, scoring 3 on coverage stated for every company that names a class and no model.

### `rule-system-prompts-as-a-partial-constitution`

**Published system prompts count as a partial constitution**

We count the system prompts a company publishes as a partial constitution. xAI already scored 2 on constitution published on that basis. The rule moved Mistral AI from 0 to 2 there, from 1 to 2 on hard constraints listed and from 0 to 1 on the open licence, and moved Mistral AI and xAI each from 0 to 2 on changes explained, because the prompts' history on GitHub shows every change line by line. Mistral AI rose from 0.9 to 1.7 on the final score, and to fourth on what is published, ahead of Alibaba, which publishes a full constitution. Read the other way, as a layer of their own that is no constitution, Mistral AI would be eighth, below DeepSeek, and xAI, losing its earlier points on the same basis, fourth below Google DeepMind. The rule rewards publishing the prompts of one product as if they were a behaviour document. Mistral AI's govern one coding agent, a user can replace them, and what they mark as not overridable is a list of confirmations that a flag switches off. xAI's govern models retired in May 2026. Moonshot AI stays at 1 for a sample prompt in its quickstart, which governs no product, and the prompts DeepSeek published for two 2025 models set only the assistant's identity and the date, so they add nothing. The constitutions board, which scores the documents themselves, still counts neither xAI nor Mistral AI as publishing a constitution, so the two boards read the same texts differently. Mistral AI stays at 1 on versions kept, although the same history keeps every earlier prompt at a permanent address, which is part of what earns xAI 2 there.

*What would settle it:* Deciding whether the board scores the rules a company publishes for its models in whatever form, or only a document meant to govern its models in general, then reading system prompts the same way on both boards and on versions kept.

### `rule-a-bare-date-is-not-a-version`

**A bare date is not a version**

On versions kept we score a date alone at 0, and a version label, a versions menu, an earlier text still online or a published promise to keep past versions at 1. No score moved. Alibaba and DeepSeek stay at 0 for a dated text with nothing else, Moonshot AI stays at 1 because an earlier version of its terms is still served at ?version=v1, and Mistral AI stays at 1 for a versions menu on its usage policy that lists nothing. The other choice, 1 for any dated text, would have raised Alibaba and DeepSeek by 0.11 each on the final score and moved no place. The line is thin. An empty versions menu earns what a dated text does not, which rewards the fixture over the archive, and a promise to keep past versions earns as much as keeping one.

*What would settle it:* Writing into the check's description which of these earns a 1, and deciding whether a versions menu that lists nothing should.

### `rule-implied-coverage-is-a-2`

**Implied coverage earns 2, except where there is almost nothing to cover**

We score coverage a document implies without stating it at 2 on coverage stated, as the description of a 2 says. Alibaba rose from 0 to 2: its overview says Alibaba is training its models towards the Spec and speaks of the gap between its current production models and it. The sentence reports progress in training and states no scope. DeepSeek stays at 0, although its disclosure page describes every model it serves online, because the only behaviour it states is one sentence on safety training, too thin for coverage to mean anything. That exception is a judgement the descriptions do not contain: read literally, DeepSeek's page would earn 2 as well, adding 0.23 to its final score and moving no place. Alibaba's 2 is worth 0.23 on its final score and did not move its place either. The rule scores the same kind of implication differently in a thin text and in a full one.

*What would settle it:* Deciding whether coverage stated can score anything where constitution published is at 1 or below, and writing that into the check's description.

### `rule-own-policy-safety-evaluations-earn-1`

**A safety evaluation against a company's own policies earns 1 on adherence tests**

We score a published safety evaluation against the company's own policies, with its results, at 1 of 2 on adherence tests published, as Google DeepMind and xAI were scored on 25 September 2026. DeepSeek rose from 0 to 1 for the safety report on R1, whose results stop at a model it stopped serving in August 2025. That point is what puts DeepSeek eighth, ahead of Moonshot AI: without it DeepSeek would score 0.65 and be last. The other choice, reading the practice as a test against a constitution only, would take Google DeepMind, xAI and DeepSeek back to 0 and move one place, DeepSeek's. The rule gives a benchmark of harmful requests the same point as a test of whether a model follows a written rule, and a single report on a model since withdrawn earns what a report on current models earns.

*What would settle it:* Writing a description of 0, 1 and 2 for this practice that says whether a test must be against the constitution or may be against any written policy of the company's, and whether results for withdrawn models count.

### `rule-one-disclosure-counted-once`

**One disclosure is counted once**

We count a disclosure on the one row it fits best. DeepSeek's R1 paper describes a filter that screens conversations on its own service. It earns DeepSeek 2 on guardrails disclosed, and it is not counted again as monitoring in use, where DeepSeek stays at 0. The other choice would have given DeepSeek 1 on monitoring in use, worth 0.31 on the final score, which would not have moved its place. The rule keeps one document from lifting a company on several rows at once, and it leaves open which row is the right one: a filter that retracts answers as they are given is a guardrail by the board's definition, and it is also the only thing DeepSeek has said about watching its models in use. Meta's 1 on monitoring in use rests on a sentence about automated monitoring after launch, which the rule does not touch.

*What would settle it:* Writing into the description of monitoring in use whether a filter that acts on each answer counts as monitoring, and checking every company's 1 there against it.

### `rule-category-list-for-one-platform-is-a-3`

**Guardrails listed by category for one platform earn 3**

We score guardrails disclosed by category for one platform at 3 of 4, the precedent set for Mistral AI. Alibaba rose from 2 to 3 for Model Studio, its own model platform, which says its models carry compliance checks of their own and lists the categories of an optional guardrail. Meta rose from 1 to 3 for the guardrails of its Muse agent, listed by kind, the kinds of safeguard its Muse Spark report names for Meta AI, and the categories of Llama Guard. Seven of the nine companies now score 3 on this check and none scores 4, so the check separates almost nobody. The descriptions give 2 to a disclosure for one product, and 3 sits between that and an inventory across every product; the rule puts a single platform there whatever share of the company's products it is. The other choice, 2 for one platform, would have cost Meta and Alibaba 0.11 each on the final score, and any other company whose 3 rests on one platform the same, without moving a place. Alibaba's page of categories was last updated on 23 September 2026, after our reading, and Meta's Muse guardrails are security controls, against prompt injection, leaks of personal data and unapproved payments.

*What would settle it:* Writing a description of a 3 on this check, and deciding whether a platform for developers and a single consumer product count the same.

### `rule-announcements-without-a-register-are-a-2`

**Changes announced on a company's own channels, with no register, earn 2**

We score guardrail changes a company announces on its own channels, with no register, at 2 of 4 on guardrail changes logged, as the description of a 2 says. Meta rose from 0 to 2 for posts in its newsroom: the pause of teenagers' access to AI characters, added in January 2026 as an update to a post of October 2025, and a system of July 2026 that flags signs of distress in teenagers' conversations. xAI rose from 1 to 2 for the restriction on image editing that X's Safety account announced in January 2026; X has belonged to xAI since 2025. Six of the nine now score 2 on this check and none more. The rule rewards a blog post, or a post on a social network made under pressure from regulators, as much as anything short of a register, and it asks nothing about how many changes are announced: one announced change among many silent ones earns the same 2. The other choice, 1 wherever changes are announced case by case, would have lowered six companies by 0.11 each on the final score and moved no place.

*What would settle it:* Deciding whether a 2 needs most changes to be announced or any, and writing that into the check's description.

### `rule-an-acknowledged-regime-is-a-2`

**A special regime acknowledged but not described earns 2**

We score a special regime a company acknowledges without describing it at 2 of 4 on special deployments, as the description of a 2 says. xAI rose from 0 to 2: section 2.3 of its Frontier AI Framework says that "the full functionality of our models may be available to only a limited set of trusted parties, partners, and government agencies", and its post of December 2025 announces government-optimised models for classified work. Google DeepMind stays at 0. It confirmed an agreement letting the Pentagon use Gemini on classified networks and has not acknowledged that the rules there differ; that they differ was reported by the press, citing The Information. The rule gives a sentence about tiered access in a risk framework the same 2 as Anthropic's statement, in its constitution, that some of its models do not fully fit it, and it turns on what a company admits: a company that says nothing scores 0 whatever it deploys. xAI's third place rests on three of these rules together. Its 2 here, or its 2 on changes explained, would each have lifted it above Google DeepMind alone, and its 2 on guardrail changes logged would not.

*What would settle it:* Deciding whether acknowledging a deployment is enough, or whether the company must say that the rules there differ, and writing that into the check's description of a 2.

## 6. What I could not do, or did only in part, and why

**Tensions the rules create, which a person should see**
- **Mistral AI 2.1 stays at 1 by the owner's decision.** The same prompt history that now earns it 2 on 2.2 keeps every earlier prompt at a permanent address. That is part of what earns xAI 2 on 2.1. The rule 2 open question says so.
- **The constitutions board still says xAI and Mistral AI publish no constitution.** The governance board now counts their prompts as a partial one. I am not allowed to edit `constitutions.json`, so the two boards read the same texts differently. The rule 2 open question says so.

**Other check readings**
- Only the 1.2 reading was rewritten, as asked. The readings of 1.1, 1.3, 2.1, 2.2, 3.1, 3.2, S1 and S2 still say nothing about the rules. The rules live in the page block and in each row's `looked`. Adding one sentence to each of those readings would put the rule in the popover a reader opens.

**Sources resting on the auditor alone (no second-reader confirmation)**
- Mistral AI 4.1: the quote from cli_2026-08_v3.md ("confirm first unless durably authorized...") and the claim that this variant relaxes the approvals. They come from the auditor's Q4-found row (high confidence). Finding 1 now cites it.
- xAI 1.3: the Axios quote. The second reader did not re-read it.

**Sources that need checking**
- Alibaba 3.1: the Model Studio category page was last updated on 23 September 2026, after the research date. No earlier copy was checked. It is flagged in `looked`, in Limitations and in the rule 7 question.
- The translations of the three Alibaba quotes and of the 1.2 quote are mine. The 1.2 one follows the board's own I1 translation.

**Quotes not used**
- The Vibe README "--yolo" line: the auditor and the second reader give it in different words. The flag is described without a quote.
- Meta's 16 April 2026 post: the audit gives no verbatim quote.

**Statements without a source**
- "X has belonged to xAI since 2025" is stated as the owner asked. The audit only calls X "an xAI subsidiary", and no source URL is attached.

**Held items not touched**
- The 21 or 22 January date for Anthropic's constitution.
- Alibaba `profiles.2`, "The only language about revision": the board's own 4.2 foreword quote contradicts it.
- `governance.js` I5 label, and the `scored_by` text in `app/lib/board-tools.mjs` (outside my files).

**Pre-existing prose**
- "holistically rather than strictly" in the Anthropic overview profile is older wording, left as it was.
