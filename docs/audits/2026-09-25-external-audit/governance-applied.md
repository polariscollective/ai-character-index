# Governance board: audit corrections applied to site/governance.json

Worktree `/Users/sverbo/Desktop/Codes/Polaris/aci-unanalysed`, branch `feat/manual-corrections`. Only `site/governance.json` was edited, and nothing is committed. The edit scripts are `gov-apply.py`, `gov-apply-cross.py` and `gov-apply-2.py` in the scratch folder, and `gov-original.json` there is the file as it was before. The file keeps its serialisation (indent 1, ensure_ascii off, trailing newline) and contains no long dashes.

## 1. Score changes applied (26)

Before changing each score I checked it against the check's own 0/2/4 anchors or the practice scale. Every one of them fits, so none of the listed changes was held on that ground.

**OpenAI**
- 1.3 1→2: the Model Spec separates all deployments, first-party consumer products, and API or organisation subscriptions, and names "rail free" test models as an exception. The Department of War post and the GPT-Rosalind-5.5 card disclose part of what applies. That is anchor 2: the gap is acknowledged and what applies instead is not disclosed.
- 2.1 3→4: the first version is online at the address the change log gives (cdn.openai.com), so all seven versions are dated and retrievable (anchor 4).
- 3.2 1→2: the dated age-prediction post, the safe-completions entry in the change log and the Model Release Notes show changes announced some of the time with no register (anchor 2 as written).
- 4.2 1→2: public comment rounds in May 2024, February 2025 and August 2025, none tied to a weakening and no commitment to repeat (anchor 2).
- S3 0→1: the GPT-6 Astra card names UK AISI, Apollo Research and Gray Swan as testers of other risks, which the reading scores "1 at most". SecureBio is left out because the second reader could not find it in the card.

**xAI**
- 1.1 0→2: grok_4_safety_prompt.txt ranks itself above every other instruction and lists twelve disallowed activities, and the Grok 4.1 prompt carries an order of authority. That goes beyond a user policy, so anchor 0 cannot hold.
- 2.1 1→2: prompts are kept in commit history, and three earlier framework versions are online but not linked ("versioned, archive incomplete or not linked").
- 3.1 2→3: the model cards list filters by harm class, and by product for Grok 4. It falls short of an inventory across every product.
- 3.2 0→1: the change was announced by the company's own account (X Safety), with no register. It sits between the press/incident anchor and the "some announced" anchor.
- 4.1 0→2: a set of disallowed activities was published for models since retired, and for current models it is referred to but not listed.
- S1 0→1: the published prompts are under AGPL-3.0 and Apache-2.0, a weaker form of an open licence on a text that is not a constitution. This follows 1.1, as the second reader required.
- S2 0→1: the model cards report compliance with the refusal policy by category, for every release up to Grok 4.7, against a policy that is not published for current models.

**Google DeepMind**
- 1.1 2→3: the pages describe good behaviour and give a rough order (instructions followed "within certain specific limits"), and the Gemini 2.5 report gives a conflict rule. There are no levels of authority.
- 1.2 1→2: coverage is implied through the Gemini app page and the model cards that tie the safety policies to Gemini 3 Pro and 3.1 Pro, and the AI Mode document names its model (anchor 2).
- 3.2 1→2: the election restriction was announced on Google's own blog (19 December 2023 and 12 March 2024), plus a release note of 1 August 2024. Some changes are announced and there is no register.
- 4.1 1→2: "core harms ... always blocked and cannot be adjusted" is a set that is referred to but not listed (anchor 2, word for word).
- S2 0→1: the model cards publish automated evaluations against the safety policies they list, as deltas with a one-line method. This matches Meta's 1.
- S4 0→1: the cards say each model "satisfied required launch thresholds" for child safety, with the level unpublished. This is a weaker form of the practice.

**Alibaba**
- 4.1 4→3: Root principles are also set by accompanying policy documents that are not published. That is the reason OpenAI sits at 3.
- S1 0→1: the text is declared "released as open source" with no licence named, a weaker form of the practice.
- S2 0→1: the Oyster-II release (July 2026) publishes "Model Specification" scores for Qwen3-Max and Qwen3.5-397B. The results stop before Qwen3.8, which the reading scores 1.

**Meta**
- 1.1 0→1: fragments are published (the Llama 4 template prompt, a values paragraph, rules for teens), with no document. This matches Moonshot AI and DeepSeek at 1.

**Moonshot AI**
- 2.3 1→0: none of the three elements is present. A sample prompt is not a log.
- 3.1 1→2: the API filter is described (input and output, named categories, error code, false-trigger route), and the app has output filtering in minors' mode (anchor 2).
- S2 1→0: the K2 red-team used Promptfoo's generic categories and is tied to no behaviour document. This matches how the board scores Moonshot's peers.

**DeepSeek**
- 3.1 1→2: the R1 paper's supplementary has a subsection, "Risk Control System for DeepSeek-R1", which covers one product and one model generation. Only the heading was confirmed. The body (keyword filter, then review by DeepSeek-V3) came from the auditor's memory, so the text cites the subsection and not its contents.

For every applied score, `evidence[company][row]` now carries the audit's sources with read date 25 September 2026, and `looked` no longer claims that something is absent when it was found. The profile paragraph, the column reading and the parenthesised practice scores were updated to match.

## 2. Text corrections applied

Each item gives the audit row (gov = rows-governance.json, ov = rows-overview.json) and what changed.

**Findings and cross-company texts**
- Finding 1 (ov 162, 215): the OpenAI pair is now 7.5 and 5.8, and the best change-log score is 5.8.
- Finding 2 (ov 163, 216, 117, 178, 147, 87): the December 2025 OpenAI example (a tightening) is dropped. It now leads with the 18 August 2026 change from "shutdown timer" to "ending condition", which is not in the change log. It adds xAI's June 2026 framework (two numerical deployment criteria and the whistleblower passages dropped) and Meta's April 2026 thresholds, both labelled as commitments on what a company builds or releases, and places Google's AI Principles on the same footing. The xAI image example now names X's Safety account and the Grok account on X. "The Chinese companies" is replaced by DeepSeek's terms plus Moonshot AI's seven days. The comment-window line now reads OpenAI 5.0, Anthropic 2.5.
- Finding 3 (ov 118, 164, 179, 150, 88, 73, 103, 217): retitled. "The most consistent pattern across all nine" and "close to nothing" are gone. Meta is added to the list of companies with developer guardrails. OpenAI, Anthropic, Meta (Muse) and Google are named as describing parts of their own apps' guardrails, xAI and DeepSeek as running the other way, and Moonshot AI as fitting neither half. "The layer ... with no record at all" became "no register".
- Finding 4 (ov 165, 180, 104): now reads "Anthropic and OpenAI score 5.0 out of 10 each". It adds the OpenAI facts (kinds of deployment, the DoW safety stack), Google's April 2026 Pentagon agreement and xAI's "all lawful use" deal, as reported.
- Finding 5 (gov 1, ov 219): "no kind of deployment" became "no government, defence or other specialised deployment". Oyster-II is now "built on" the Spec, and the same release scores Qwen3-Max and Qwen3.5-397B.
- Finding 6 (ov 116, 220, 90, 181): now 0.7 on what is published (still level with DeepSeek), 2.5 on what it engages, "fourth of the nine and level with xAI", sixth with 1.6, under a new title. The leaked "Content Risk Standards" sentence is replaced with the second reader's wording, which keeps the report's two internal texts apart.
- Finding 7 (ov 135, 149, 91, 221): figures updated (DeepSeek 0.7; Alibaba "fifth on what is published with 2.5"). Mistral's licences are corrected (Large 3 under Apache 2.0 with a third-party-rights sentence, Medium 3.5 under a modified MIT licence with a $20m ceiling). MIT "adds no condition on how the model is used or behaves". Moonshot's clause is described as "about use".
- Finding 8 (ov 166, 182, 136, 222): "Three companies", with xAI's Safety and Security chapter holding Measure 7.1. Mistral's AI Act pages label no model as carrying systemic risk, so on its own classification it owes no report today. "The sharper case" is dropped, and the hub is "41 entries across 11 families".
- Open question on S5, Anthropic against Meta (ov 227, gov 123): the false premise "Meta publishes no equivalent" is replaced by AASF v2 section 5.1. The decision itself stays open.
- Open question on the two figures added without anchors (ov 228): recounted as twelve of the thirty non-zero engages cells. "Alibaba at 1 would pass Google" is replaced by "Google is third ahead of xAI by less than any one of its three 1s".
- Open question on first place: rewritten for OpenAI leading by about 0.65 (one practice point plus three check points). It states that the Anthropic corrections are held for a person, without anticipating their effect.
- Open question on I5 deleted, and `internal_note` rewritten (gov 181, ov 229). "Only an internal audit could show it" is gone and "counted in neither figure" is kept. The question was settled by the rewrite.
- Page, "How to read the scores": OpenAI "keeps every version at a dated address". Meta is "fourth on what it engages, level with xAI". Mistral AI is "sixth on what is published ... which leaves it seventh". Limitations mention the audit of 25 September.
- Page, "Sources reviewed": the sources now cited were added for OpenAI, Alibaba, Google, Mistral (Medium 3.5 licence), Meta, Moonshot AI and DeepSeek. The xAI list was completed and relabelled (gov 239).

**Per-company texts not driven by a score change (confirmed, factual)**
- OpenAI profile 1 (gov 190): GenAI.mil is no longer described as announced "with reference to usage policies", and the national security principles are dated by the post of 8 July 2026.
- OpenAI column reading, engages (ov 161): "says nothing about outside testers" and "the published text is the one used inside" are both removed.
- OpenAI profiles 2 and 3: I removed "The best of the six" and "the most substantial disclosure ... any company has made" while rewriting those paragraphs (the no-ranking rule, and gov 194).
- xAI evidence 1.3 `looked` (gov 213, score held at 0): the false "the framework says nothing about deployments for governments" is replaced by the government-optimized models, the framework's "trusted parties ... government agencies" sentence and Axios's "all lawful use" report.
- xAI 2.2 `looked` (gov 215, score held): now records the commit diffs and the reasons given on X in July 2025.
- xAI S5 `looked` (gov 225, score held): now records the May 2025 statement on code review.
- xAI profiles 1, 2 and 4 (gov 234, 235, 237): "Nothing" replaced. The acceptable use policy is quoted to the end of its sentence. The "change log never published" claim is replaced by xAI's own words. The framework quote is completed.
- Google 1.3 `looked` (gov 88, score held at 0): records the April 2026 agreement, Google's statement, the reported filter clause (attributed to The Information) and the silent deployment guide, and keeps "Google has not acknowledged that the rules differ".
- Google 3.1 `looked` and profile 3 (gov 92): "no comparable list for the Gemini app, Workspace or AI Mode" is replaced, the four and five categories are reconciled, and the note that filters default to Off is added. Gov 92 is a figure-correct row. I applied it because profile 3 and finding 3 had to change on the same confirmed facts.
- Google profile 4: "the clearest documented weakening in all our evidence" is removed (a comparison, no longer true after the audit).
- Alibaba profile 1 and 1.2/1.3 `looked` (gov 1, 2, 20): "no kind of deployment" is replaced, and "once downloaded there is no provider" becomes "whoever serves it".
- Alibaba profile 4 (gov 23): "earns full marks" is replaced.
- Alibaba practices_engaged (gov 24): "no test of adherence" is replaced. "Has no Western equivalent" is dropped, and the CAC filings are now called a legal requirement. That sentence still has no source (see section 3).
- Meta profile 1 (gov 132): "the same kind of document seen from the outside" is replaced, "reportedly" restored, and the fragments listed.
- Meta practices_engaged (gov 133, plus the file's own S3 quotes): CAIS and Charlemagne Labs are no longer called evaluators, and the section 5.1 approvers are named.
- Meta S5 `looked` (gov 123, figure-correct): corrected for consistency with gov 133 and the open question.
- Meta 2.3 `looked` (gov 114, score held): the Llama 4 licence is dated.
- Meta column reading, published (ov 113): "Almost nothing" became "Little".
- Moonshot AI profile 1 (gov 185, 162): the K3 report does have a cyber-risk section, Concordia is dated before K3, and the licence clause is "about use".
- Moonshot AI 1.1 and 2.1 `looked` and profile 2 (gov 162, 165): Appendix F rubrics, and the v1 terms still served.
- Moonshot AI profile 3 (gov 186): the API filter, categories, request_id route and minors' mode are described. The translation now follows the file's own. "Thirty repositories" became "roughly forty".
- Moonshot AI practices_engaged and S3 `looked` (gov 187, 174): Promptfoo is named, and the K3 report's citation of AISI/CAISI and its third-party section are described accurately.
- DeepSeek profiles 1, 2, 3 and practices_engaged (gov 76, 77, 78, 81): the R1 paper is named as a second document. The 2025 web and app system prompts are described. "Named exactly once / never described / sharpest case" is removed. R1 is "stopped serving on 21 August 2025". CAISI worked "on weights it downloaded, without the developer's involvement".
- DeepSeek 1.1 and 1.2 `looked` (gov 76, 57, scores held): the R1 paper is mentioned, and the Chinese terms tie the disclosure to DeepSeek Chat.
- Mistral profile 2 (gov 155, first verification): "renamed Vibe in August 2026" became "relaunched as Vibe on 28 May 2026". Nothing else was changed for Mistral.
- Top-level `looked` and "How we looked": "Nothing here was judged by a model" was no longer true, so both now say that some scores were corrected on 25 September 2026 by an audit carried out with language models, and that corrections needing a rule or raising Anthropic are held. "No model judged any row in that reading" keeps the phrase the test looks for. **The owner should read and reword these two passages.**

## 3. Held items

**Needs the owner: self-preference (the auditors are Claude)**
- Anthropic 1.2 4→3, 1.3 2→3, 2.1 1→2, 2.2 0→1, 2.3 2→3, S3 0→1, and every text that goes with them: gov 52 (Q2 found), gov 55 (engages found), and the column reading "names no outside testers", which is now inconsistent with the S3 rule applied to OpenAI.
- The limitation "Whether Anthropic has signed the EU Code of Practice is unconfirmed" (ov 166). The Commission list the board cites names Anthropic, so this is a one-line fix to confirm.
- gov 246: the constitution is dated 21 January in the paragraph and sources list and 22 January in eleven evidence sources. Choosing one needs the owner.

**Needs the owner: rule decisions and debatable readings**
- OpenAI 1.2 3→4 (must move together with Anthropic 1.2). OpenAI 2.2 2→3 (refused by the second reader).
- xAI 1.3 0→2. The `looked` text now describes an acknowledged deployment, so 0 sits uneasily beside it. The same reading would have to be applied to Google and OpenAI.
- xAI 2.2 0→2 (do system-prompt records count?) and xAI S5 0→1 (does S5 cover any governing text?). Both `looked` texts are now factual.
- Alibaba 1.2 0→1 or 2. The second reader's objection was that Google sat at 1, and Google is now at 2, so 2 for Alibaba is no longer out of line. Alibaba 2.1 (the rule for "dated, no archive"). Alibaba 3.1 2→3 (Model Studio, on Mistral's precedent).
- Meta 2.3, 3.1, 3.2 and S4. Note that Meta 2.3 rested on parity with Moonshot AI, which is now at 0.
- All Mistral AI: 1.1, 2.2, 4.1, S1 (whether published system prompts count), gov 154 and 157, and the Vibe CLI sentence of gov 155.
- DeepSeek 1.2 (at most 1), 2.1, S2 and I4 (board-wide rules). Google 1.3 (do press statements count?).
- Finding 5, "more explicit than OpenAI's or Anthropic's": it depends on the constitutions board, which another agent is editing, and on a held Anthropic re-judge.
- Finding 7, Alibaba's Qwen3.8-Max licence (ov 60, needs a browser check). Finding 4, Mistral's military clause (ov 134). Finding 2, the optional Mistral Vibe CLI and DeepSeek 2023 licence examples.
- The Alibaba CAC filing sentence still has no source. It needs a URL, or it should be cut.
- Open question "a nought left the table": a presentation fix in governance.js.

**Not applied: refuted, unverifiable or outside the rule**
- DeepSeek 1.1 1→2 (refuted). Alibaba 3.2 (unverifiable). Alibaba Q2 found, "only language about revision" (gov 21, no second reading and not checkable from the file).
- Figure-correct rows whose text the audit flagged, not applied under the adjust/wrong rule: Alibaba Q3 guardrail list (gov 22: Shark, Jellyfish and Oyster are not guardrails, Qwen3Guard is by the Qwen team, XGuard is missing). This is the most material one. Also Alibaba I1 (15), DeepSeek 1.3 (58), Google 2.2, 4.2, S1, S3, I2, I4 (90, 95, 96, 98, 102, 104), Meta 1.3, 2.1, 2.2, I1, I4 (111, 112, 113, 124, 127), Mistral 1.3, 3.1 (136, 140), Moonshot AI I1, I4 (177, 180), OpenAI 2.3, S2, I1, I4 (193, 199, 203, 206), xAI 2.3 (216), and xAI S4 (224). The xAI S4 `looked` still speaks of thresholds in the June 2026 framework, while finding 2 now says that version dropped the numerical ones.

## 4. Figures after the changes

Out of 10, as the board prints them (toFixed, half up). Arrows mark changes. Ranks come from the unrounded final score, and there are no ties.

| Company | Q1 | Q2 | Q3 | Q4 | What is published | What it engages | Final | Rank |
|---|---|---|---|---|---|---|---|---|
| OpenAI | 6.7→7.5 | 5.0→5.8 | 5.0→6.3 | 5.0→6.3 | 5.9→6.8 (6.818) | 5.0→5.6 (5.625) | 5.5→6.2 (6.222) | 2→1 |
| Anthropic | 8.3 | 2.5 | 6.3 | 6.3 | 6.1 (6.136) | 5.0 | 5.6 (5.568) | 1→2 |
| Google DeepMind | 2.5→4.2 | 0.8 | 5.0→6.3 | 1.3→2.5 | 2.0→3.0 (2.955) | 1.9→3.1 (3.125) | 2.0→3.0 (3.040) | 3 |
| xAI | 0.0→1.7 | 2.5→3.3 | 2.5→5.0 | 0.0→2.5 | 1.1→3.2 (3.182) | 1.9→2.5 | 1.5→2.8 (2.841) | 5→4 |
| Alibaba | 3.3 | 0.0 | 2.5 | 5.0→3.8 | 2.3→2.5 | 1.3→1.9 (1.875) | 1.8→2.2 (2.188) | 4→5 |
| Meta | 0.0→0.8 | 0.8 | 1.3 | 0.0 | 0.5→0.7 (0.682) | 2.5 | 1.5→1.6 (1.591) | 6 |
| Mistral AI | 0.0 | 1.7 | 6.3 | 1.3 | 1.8 | 0.0 | 0.9 (0.909) | 8→7 |
| Moonshot AI | 0.8 | 1.7→0.8 | 1.3→2.5 | 0.0 | 0.9 | 1.3→0.6 (0.625) | 1.1→0.8 (0.767) | 7→8 |
| DeepSeek | 0.8 | 0.0 | 1.3→2.5 | 0.0 | 0.5→0.7 (0.682) | 0.6 | 0.5→0.7 (0.653) | 9 |

With xAI 1.3 held at 0, xAI is fourth and not third as the synthesis projected, and Google DeepMind stays third. On the overview's relative tiers (0.85 and 0.5 of the row's best): on the final score, only OpenAI and Anthropic reach Middle tier or above (Google 0.489 of the best). On what is published, no company other than the leaders reaches 0.5 (xAI 0.467). On what it engages, Google moves to Middle tier (0.556) and Meta drops to Behind (0.444, level with xAI).

## 5. Tests

`python3 -m pytest -q tests engine`: **4 failed, 917 passed, 357 subtests passed**. All four failures are assertions in `tests/test_governance_tab.py` that hardcode the old scores, and I was not allowed to edit that file:
- `test_the_ranking_is_the_final_score`: ORDER and the printed figures.
- `test_the_finding_on_meta_quotes_both_of_its_figures`: Meta third on engages, now fourth and level with xAI.
- `test_the_findings_on_whole_columns_hold`: 4.2 values {0,1} and "2.5 out of 10 each"; OpenAI 1.3 == 1.
- `test_the_open_weights_finding_quotes_what_is_published`: "third on what is published", now fifth.

The patch in `gov-test-patch.diff` updates those assertions to the new scores. A patched copy (`gov-tests/`, which symlinks to the worktree's `site/`) passes 36 of 36. `tests/test_company_texts_are_absolute.py` passes. `grep` finds no long dash (U+2013 or U+2014) in the file.

## Not in this file but now out of step
- `site/overview.json`: the governance summaries and takeaways ("no outside testers are named", "Two companies have agreed", "almost nothing" for Meta, "best in class" wording, "some published adherence testing" for Moonshot AI, xAI's "no list of hard constraints", and others).
- `site/governance.js` line 942, which still labels I5 "needs an internal audit".
- `app/lib/board-tools.mjs`, whose `scored_by` still says "by hand from public documents".
