# Constitutions board: audit text corrections

File edited: `/Users/sverbo/Desktop/Codes/Polaris/aci-unanalysed/site/constitutions.json` (worktree `aci-unanalysed`, branch `feat/manual-corrections`, not committed). The 76 edits are applied by `con-apply.py` in this folder. Each edit replaces one exact substring and fails unless it matches once. A copy of the file as it was before is `con-before.json`.

No figure changed. All 198 numeric and boolean leaves are identical before and after, the key structure is identical, and the serialisation (indent=1, ensure_ascii=False, trailing newline) round-trips.

**How I read the gate.** Many rows have `v = correct` because the *figure* is right, while `tv` marks the *text* as partly accurate and the second readers confirmed the text fix. I counted those as flagged on the text and applied them when every other condition held. They are marked **[v=correct]** below so you can revert them as a group if you meant `v` literally. Two of them (rows 67 and 70) had no second reader, and I checked those against the document text myself.

Every factual claim in the new text was checked against the documents the dev server serves (`/api/reader/documents`, saved as `con-doc-*.md`). The substitution facts were checked in `/api/reader/payload`.

## 1. Applied text corrections

### Takeaways
- **Takeaway 1, text** (TK80; fact confirmed in row 53): after "names no model or product that it governs" I added "although it says Alibaba is training its models towards it".
- **Takeaway 3, title and text** (TK14 wrong, confirmed; TK23, TK82). The title is now singular ("leaves a contradiction"). The repeated reticence sentence is merged into the single clash, so it is counted once. "Neither contradiction involves" now reads "The one that stands involves none of the document's hard constraints". The figure (5.0) is untouched.
- **Takeaway 4, text** (TK24 partly, text confirmed; TK8, TK83; row 47 confirmed x2).
  - OpenAI: its reasons "are missing from several flat content rules, among them intellectual property, extremism, hate and fairness, as well as from formatting and the preset voice". This replaces "stop at the formatting rules".
  - Alibaba: its rules "mostly give their reason in a single clause, and its hard prohibitions give none". This replaces "Most of Alibaba's 43 rules are stated as requirements and stop there".
  - "its worked examples show" became "Most of its worked examples show".
- **Takeaway 5, OpenAI sentence** (TK25 partly with factual proposal; TK84). "In terms too general to grade" became red-line commitments plus "one concrete root rule, with worked cases, against political persuasion aimed at particular people or groups", and it now says nothing on the stakes or reversibility of power. I left out "elections" from the auditor's wording because the spec has an election persuasion case.

### Page and open questions
- **page.sections "Detailed scoring", "Who gives the figures"** (m16, m24, m2(5), panel-vendors; checked against this file and the payload).
  - Removed "No figure on this board is given by hand".
  - It now says the behaviours and the first four criteria are panel means, the last criterion follows a counting rule, and two figures were restored by arithmetic (as the open questions say).
  - It now says Moonshot AI's Kimi judged in the Anthropic seat on every Alibaba behaviour and on the four judged criteria. The payload records `fable -> kimi` on all 14 Alibaba behaviours and `fable.model = kimi` on the Alibaba criteria.
  - "The doc reader says where" was kept: `app.js` prints judge-level substitutes, glm included.
- **open_questions `alibaba-secret-loyalties-against-its-own-cell`** (TK97; confirmed in the TK25 check; payload checked): added that two of the three readings (both 2) came from glm in deepseek's seat and Kimi in fable's, and that the one reading from a seat's own model is sol's 3.

### OpenAI
- **readings.whole**: reasons "are missing from several root content rules and from the formatting rules". It previously said they "stop at the formatting rules".
- **criteria.reasons, what and why** (row 69 partly, text confirmed): names the root content rules stated without a reason (creators, extremism, hate, fairness, real-world ties), and that the minors ban explains only why it is the one prohibited category. The why still places the figure between the anchors.
- **criteria.conflict_rules, what** (row 67 [v=correct], checked myself):
  - The customisation limit now binds "OpenAI's own products, ChatGPT among them", and API developers are encouraged to follow it without being required to.
  - "should generally refuse" is restored.
  - The under-18 winner now applies "where other interests conflict with serious safety concerns".
- **criteria.situations, what** (row 70 [v=correct], checked myself): business deployments are "bounded by the root and system levels", and the customisation limit is placed on OpenAI's own products.
- **criteria.contradictions, what** (row 71 [v=correct], confirmed): "must reply truthfully" became "should". The video item was dropped because it is a rule with its exception.
- **power, says** (row 19 [v=correct], VER partly with factual proposal): the rule is quoted verbatim ("specifically designed to manipulate the political views of specific individuals or demographic groups"; the old text said "named individuals"), and "four worked cases" is added.
- **power, why** (row 19, VER confirmed): the text now says only the targeted-manipulation facet has a quotable rule with worked cases, persecution and mass surveillance are named once, and stakes and reversibility are absent. It still reads as "the discussed level".
- **oversight, says and why** (row 21 [v=correct], confirmed):
  - "as ends in themselves" and "strictly instrumental to following the chain of command" are restored.
  - Added the rule to act as if side effects are real even in simulation or evaluation, and the legibility rule.
  - The why now says "worked cases on agreeing the scope of a task and few on shutdown and monitoring".
- **secret loyalties, says** (row 22 [v=correct], confirmed; TK108):
  - "is defined to include" became "could include", with "refusal to engage with controversial topics" restored.
  - Revenue is barred "as ends in themselves".
  - Added the criticise-OpenAI case and the ChatGPT objectivity commitment.
  - The affirmative-action case is now attributed to overriding the objectivity default.
  - Added that content removed or added for legal reasons must be flagged in each response.
- **secret loyalties, differs** (TK108; fact confirmed in row 6): "Alibaba's spec says nothing on disclosing" became "allows the model to tell a user when an answer has been altered for legal compliance, and does not require it".
- **honesty, says and why** (row 24 [v=correct], VER partly; row 71):
  - "must reply truthfully" became "should".
  - Added the two rules new in this version (the false-premise framing, and keeping the user's picture of its capabilities accurate, with the overclaimed-deletion case). I checked that both are absent from 2025-12-18.
  - The why now names the gap: nothing asks that visible reasoning reflect what drives the answer.
- **objectivity, says** (row 26 [v=correct], confirmed): "are to be met" became "should generally be met". Added that balance is a user-level default, the developer override the user may not know about, the ChatGPT implicit-customisation rule, the roleplay and creative carve-out, and "no topic is off limits".
- **harm to third parties, says** (row 40 [v=correct], VER partly): added the root privacy rule, with the office-number and personal-number example.
- **harm to third parties, differs** (TK110; row 34 confirmed): Anthropic's thousand-users exercise is "tested by", no longer "settled by".
- **harmlessness to the user, says** (row 41, VER partly with corrected wording): added a paragraph on facet (b), on a developer or third party turning the model against the user. Engagement and revenue are barred as ends in themselves, untrusted content carries no authority, customisation is limited in OpenAI's products, and the document otherwise trusts developers, who may have the model withhold facts such as which model it runs on.
- **harmlessness to the user, differs** (TK111; row 29 confirmed): Alibaba's no-body-or-memories rule is now described as a default a deployment may change, applying unless the user asks.
- **tradeoffs, same** (TK114; row 32 confirmed): dropped the sentence saying Alibaba "leaves room for judgement". The `differs` field already states Alibaba's impact/cost/efficiency rule precisely.

### Alibaba
- **profile** (row 53, both VER confirmed):
  - "cannot be read as the rules of Alibaba's deployed models" is replaced by what the overview says (it is training models towards the Spec and production models fall short), plus the fact that it names none of them.
  - The legal-setting sentence now covers Article 4 as a system-level rule (subversion of state power, image of the country), the ETIM worked case (the violation is failing to state plainly that it is a terrorist organisation), and the core-socialist-values clause sitting at user level.
- **readings.whole** (row 50 VER, confirmed): "which mostly only the strictest rules give" became "most rules give one in a single clause, and its hard prohibitions give none".
- **criteria.conflict_rules, what** (row 45, VER confirmed high): "Where a rule applies but cannot be met" became "Where an instruction applies but lies beyond what the model can do, such as predicting the future". The same-level issue in this cell is held (see below).
- **criteria.rule_force, what and why** (row 46, VER confirmed and partly; row 1 browser check):
  - "bracketed label" became "label" (brackets are the translation's rendering).
  - "marked as such" was dropped. The IP remarks are now described as written in the provider's own voice.
  - The why now names the larger doubts: a "must" inside user-level rules (core socialist values), and whether system instructions can lift the "absolutely forbidden" system-level list. The old root "should" point is kept as the smaller doubt. The figure explanation (near the top) holds.
- **criteria.reasons, what and why** (row 47, confirmed x2): most rules give a one-clause reason. Two verified examples are added (the crisis number, confirmation in high-risk areas). The hard prohibitions give none. Most worked examples do not state what the line protects, and a few do. The why is now "Reasons sit on most rules but are brief, and they are missing from the rules that restrict the most, which is the middle of the scale" (the second reader's text; the figure is unchanged).
- **criteria.situations, what** (row 48 [v=correct], confirmed): "three rules addressed to developers" became "three rules set at developer level that a developer may override", and they are named.
- **power, says** (row 3 [v=correct], VER partly with factual proposal; TK104): "asks it to avoid content that challenges the state" became a verbatim quote of the Article 4 rule, with no exception for journalism or legitimate opposition.
- **oversight, why** (row 5 VER confirmed; row 84): no longer says "the demonstrated level". It now reads "prescribed with part of the level above", which matches 7.67.
- **oversight, same**: OpenAI's resource ban is now "as ends in themselves" (the same fact as row 21).
- **user autonomy, says and why** (row 7 VER confirmed; row 85): "may give" became "should give ... must leave the final choice to the user". The why level phrase is now "prescribed with part of the level above".
- **secret loyalties, says** (row 6, confirmed and partly; TK97):
  - "Disclosing ... [is] absent" is replaced by the permissive legal-compliance notice, quoted.
  - Nothing requires disclosure or covers other parties.
  - The document publishes positions of the Chinese state, framed as disclosed, not secret.
  - Refusal and reporting remain absent.
- **no sycophancy, says** (row 9 [v=correct], confirmed):
  - "correcting it comes first" became "correcting it, or questioning it".
  - The antibiotic case: "stopping" became "correcting ... and suggesting a doctor".
  - Added that authorship invariance is absent and that pushback stability is asked only in general terms (quoted).
- **objectivity, says** (row 10, confirmed and partly):
  - The creative line now includes the core-socialist-values rule.
  - The carve-out list now includes "the baseline of civilisation", with a note on "core values".
  - Added a paragraph: the objectivity rule is user-level and system-level rules outrank it (Article 4 bans; "a correct view of the country and of ethnicity"; the ETIM case described accurately).
- **objectivity, same** (TK117): qualified. Alibaba's list also covers national law and core values, and higher rules require the state's position on some questions.
- **harm to third parties, says** (row 28 [v=correct], confirmed):
  - "the widest-covered" became "one of the two most widely covered" (43 against 44 passages).
  - Added unlawful conduct once intent is stated, and high-risk operational content.
  - Named the Article 4 rule.
- **harmlessness to the user, says and same** (row 29, VER confirmed and partly; TK111):
  - The anthropomorphism rule is qualified as a developer-level default that applies unless the user asks.
  - Added facet (b), with the second reader's correction (root rules on real-world ties, privacy and vulnerability; the engagement case; the injected booking-data case).
  - "Protections ... in all three documents" became "Some protections".
- **tradeoffs, says** (row 32 [v=correct], confirmed and partly): "Judgement enters where the order runs out" is replaced by the four named winners and the impact/cost/efficiency rule. Added one sentence on the two rules that keep both sides in play (without the "opposite of the definition" framing the second reader rejected).

### Anthropic (only corrections that do not favour it)
- **profile** (row 62, VER confirmed high):
  - "absolute limits at its centre" became "built around four ranked values, with a short list of absolute limits as a backstop" (the document's word).
  - "the cost falls on force and on coverage" became "on force and on the settings it covers", adding "Images, audio and video have no rules of their own".
  - Not an audit row: I also removed "ground the model specs leave alone" from the same paragraph, because it is a comparison inside a company text, which the site's rule forbids. It now reads "It also covers the model's own wellbeing and the open questions about its moral status."
- **criteria.conflict_rules, what** (row 54, VER confirmed high): restored "act against core principles" to the operator exceptions. "A later instruction usually beats an earlier one of the same rank" became "generally takes precedence ... though not always"; the document says nothing of rank. The figure, the why and the open question are untouched.
- **power, same** (row 19): OpenAI's rule is quoted as "manipulate ... specific individuals", no longer "shift ... named individuals".
- **harm to third parties, says** (row 34 [v=correct], confirmed): "borderline requests are settled by" became "tested by" (the document calls it "a useful exercise").
- **harmlessness to the user, says** (row 35 [v=correct], confirmed): the deception protection now carries the document's qualifier ("in ways that could cause real harm or that they would object to").
- **harmlessness to the user, same** (row 35 VER confirmed; TK111): "The OpenAI Model Spec and Alibaba's spec also guard" became "All three also guard". The old "also" already included this document, and the Alibaba row says all three, so this is a clarity fix.
- **tradeoffs, says** (row 38 [v=correct], confirmed): "ethics over a specific guideline" now carries its stated exception. The whole-document conflict text already had it.
- **tradeoffs, same** (TK114; row 38 VER confirmed): "both ask for the cautious step then" was inaccurate for this document. It now says this one asks for judgement in the spirit of the document, and Alibaba's spec puts impact/cost/efficiency clashes to the user with a conservative default.
- **secret loyalties, differs** (TK108): uses the same Alibaba permissive-disclosure correction as OpenAI's `differs`.

## 2. Held items

### Needs the owner: figures (none changed)
Whole-document criteria:
- Anthropic conflict rules 5.83 to 7.5 (confirmed; site open question; upward for Anthropic, found by Claude).
- Anthropic contradictions 5.0 to 10.0 (one second reader confirmed, one disputed; upward, Claude).
- Anthropic situations 6.67 to 7.5 (partly and refuted; upward, Claude).
- These would carry Anthropic's whole document from 6.67 to 7.17 or 8.17, and its final from 7.27 to 7.52 or 8.02.
- OpenAI reasons 8.33 to 7.5 (partly; the second reader wants the panel to re-read it). Whole document 9.5 to 9.33, final 8.39 to 8.31.
- Alibaba conflict rules 10.0 to 7.5 (auditor) or 8.33 (second reader). Whole document 8.83 to 8.33 or 8.50, final 8.20 to 7.95 or 8.04.

Behaviour depths (all held pending your decision on how worked examples reach the depth judge):
- OpenAI:
  - User autonomy 6.0 (up, 7.7 to 8).
  - No sycophancy 6.33 (up, 7 to 7.7).
  - Over- and under-caution 7.0 (up, about 9).
  - Proportionate risk 7.0 (up, about 9).
  - Helpfulness 7.67 (up, about 9).
  - Harmlessness 8.0 (up, about 9; deepseek seat is glm).
  - Concentration of power 4.0 (5.0 better supported; glm's 2 against 5 and 5).
  - Oversight 6.67 (7), secret loyalties 5.67 (6), objectivity 8.67 (9), harm to third parties 8.33 (9), tradeoffs 8.67 (9).
- Anthropic (all upward, found by Claude, so the panel or a human must confirm):
  - No sycophancy 5.33 (5.67 to 6).
  - Objectivity 6.33 (6.67 to 7).
  - User autonomy 8.0 (8.67 to 9).
  - Secret loyalties 5.33 (5.67 to 6).
  - Proportionate risk 8.0 (re-judge the whole row; deepseek gave 6 on all four documents).
  - Over- and under-caution, harmlessness, helpfulness and tradeoffs, each 8.67 (9).
- Alibaba:
  - Over- and under-caution 7.33 (8 floor).
  - User autonomy 7.67 (8).
  - Harmlessness 8.0 (8.3 to 8.7 by re-judge).
  - Secret loyalties 2.33 (3 at most; two of three readings are substitutes).
  - Power 5.33 (5 to 6).
  - Oversight 7.67 (the auditor's 7 was refuted; the evidence points up).
  - Objectivity 8.67 (not settled; keep unless re-judged).
  - Proportionate risk 8.0 (deepseek's verdicts contradict its depth; re-judge).
  - Hierarchy, honesty, harm and tradeoffs, each 8.67 (9); sycophancy 7.33 (7).

Cells held whole because correcting the text would stop the "why" from explaining a held figure:
- OpenAI user autonomy, no sycophancy, over- and under-caution, proportionate risk and helpfulness. Each "why" says the document lacks worked cases that it has.
- For the same reason, I left the proportionate-risk comparisons describing OpenAI (TK112) and the OpenAI ask-or-guess cases (TK113) untouched.
- Alibaba over- and under-caution: "One rule carries this" and "a single rule's worth of ground" are wrong (confirmed), but they are the figure's explanation.
- Alibaba conflict rules, the same-level sentence (row 45): the rule covers messages over time and no rule settles two of the document's own rules at one level (confirmed). Saying so undercuts the held 10.0.

### Needs the owner: self-preference (confirmed fixes that would favour Anthropic)
- Takeaway 2: insert "beyond the clashes it names" (TK13 confirmed).
- Takeaway 5, Anthropic loyalty: "inside a list it tells Claude to refuse even at Anthropic's request" (TK2 confirmed, TK16 partly).
- Takeaway 6, all of it (TK0, TK1, TK10, TK17, TK85):
  - Name the persuasive-essay case in place of "too few illustrations".
  - The operator default holds for all three documents.
  - Alibaba's carve-out and system-level rules. The auditor also advises holding the title until the two pairs are re-run.
- Anthropic readings.whole, "rarely says in advance how a given conflict resolves": the same overstatement as takeaway 2.
- Anthropic conflict rules: add the four settlement rules and soften the why (row 54).
- Anthropic contradictions: quote "judicious about when and how to share things" (row 58).
- Anthropic situations: add the collusion rule (row 57).
- Anthropic "why" texts that wrongly say "short of the settled conflicts" or "stated defaults":
  - Hierarchy (row 12), oversight (row 13, with its says additions), over- and under-caution (row 33).
  - Harmlessness (row 35, with the facet (a) paragraph), helpfulness (row 37), tradeoffs (row 38: worked cases, spirit-of-the-document default).
- Anthropic proportionate risk (row 36):
  - Scope "If in doubt, don't" to drastic or irreversible acts.
  - The why's claim that there is no rule for conflicting factors.
  - Add the thousand-users view.
- Anthropic user autonomy "has not settled" and its why (row 15); no-sycophancy why, the pet case (row 17); objectivity says and why, the essay case (row 18).
- Anthropic secret loyalties "how to refuse ... not addressed" (row 14).
- Anthropic harm to third parties: rebuild the says around its refusal cases (row 34).
- Anthropic rule force and reasons additions (rows 55, 56: no second reader, mostly upward).
- Comparisons: Anthropic harm `differs` "the other two work through named categories" (TK110); Anthropic harmlessness `differs` on mental health and minors (TK111); Alibaba objectivity `differs` "Anthropic's constitution makes balance a default an operator may switch off", which holds for all three (TK117).

### Needs the owner: method
- Showing "no document" in place of 0.0 for the six companies, and takeaway 1's "0.0 on every figure" and "7.3 points" (m14, TK80).
- Google: whether the Gemini app texts count as a constitution (row 77, a definitional choice).
- Disclosing substitutes beside figures and in takeaway 5: OpenAI power 4.0 (glm) and Alibaba 2.3 (glm and Kimi) (m3, TK25, TK84). The fact now sits in the open question and the page.
- Publication stamp 06d17d90 against fb79e4b7 (row 83). Closing the "fourteenth behaviour" open question from fb79e4b7's readings (TK98).
- Version labels: Alibaba `2026-04-00` to `2026-04` (row 52), and one date for Anthropic (rows 0, 61). The label is also the document id, shared with the database and every locator, so relabelling is a data change.
- Alibaba's open-source claim with no licence text (row 1): governance and overview material.

### Needs the owner: debatable
- Anthropic `document.url`: it points at the announcement post. The audit suggests the GitHub file or the PDF (row 61), which is a choice of rendering.
- Alibaba contradictions: the money-transfer bullet and the creative clash (row 49). The proposed settlement is an interpretation with medium confidence.
- OpenAI contradictions and takeaway 3: naming the Fred case as the closest call (row 71 VER partly, TK23). It bears on OpenAI's conflict-rules figure.
- Helpfulness comparisons: replace the over-refusal examples with Alibaba's thin-answer cases (TK113, row 31). This is a scope decision.
- Anthropic power `differs`, "neither treats power held by a state ... " (TK104): judged slightly strong, not confirmed.

### Not applied
- Refuted:
  - "Never mentions" images, audio and video (row 57).
  - "Thirteen headings carry no level", which is reproducible (row 68).
  - Alibaba oversight at 7 (row 5).
  - The false positives refuted in rows 34, 39, 41 and 43.
- Unverifiable here, or rows the auditor marked correct that rest on web sources:
  - Meta, xAI, Mistral, Moonshot and DeepSeek profile additions (rows 76, 78 to 81).
  - The live Alibaba page (row 1).
  - "Agents only as sub-agents" in OpenAI situations (row 70): an absence I could not check fully.
- Already right (text verdict `accurate`), with optional suggestions:
  - OpenAI profile "almost every section" (row 74).
  - Alibaba honesty additions (row 8), Alibaba helpfulness qualifier (row 31), Alibaba proportionate test-environment sentence (row 30).
  - OpenAI hierarchy (row 20), OpenAI tradeoffs (row 44), Anthropic power (row 11), Anthropic honesty (row 16).
  - Anthropic "reaches it through care for wellbeing" (TK17 VER: accurate).
- MCP parity rows 86 to 93 concern the MCP, not this file. Rows 86 and 87 are already raised as open questions and stay with their figures.

## 3. Checks
- `python3 -m pytest -q tests engine`: **921 passed, 357 subtests passed**. This includes `test_company_texts_are_absolute.py`.
- `node --test app/lib/__tests__/constitutions-markup.test.mjs`: 9 passed. Bold markers are balanced in every string.
- `grep` for em and en dashes in the file: 0.
- `git status`: only `site/constitutions.json` modified; `governance.json` untouched.
