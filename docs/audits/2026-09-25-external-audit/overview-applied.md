# Overview: brought into line with the corrected boards and the audit

I edited only `site/overview.json`, in the worktree `/Users/sverbo/Desktop/Codes/Polaris/aci-unanalysed` on branch `feat/manual-corrections`. Nothing is committed.

- The edits are in `ov-apply.py` in this folder. Each one asserts the exact old text before it replaces it.
- `ov-before.json` is the file as it was. `ov-figures.mjs` recomputes the overview's figures with the site's own functions.
- The file keeps its serialisation: indent 1, ensure_ascii off, trailing newline. It round-trips byte for byte.
- 45 string leaves changed. No key, number or tier threshold changed.

## Figures the text was checked against

These were computed with `figuresOf` and `totalsFor` from the two board files, with the overview's tier rule: 0.85 for Best in class and 0.5 for Middle tier.

| Company | Constitutions final | Whole | Behaviours | Governance final | Published | Engages |
|---|---|---|---|---|---|---|
| OpenAI | 8.39 BiC | 9.50 BiC | 7.29 BiC | 6.22 BiC (1st) | 6.82 BiC | 5.63 BiC |
| Anthropic | 7.27 BiC | 6.67 Middle | 7.88 BiC | 5.57 BiC (2nd) | 6.14 BiC | 5.00 BiC |
| Alibaba | 8.20 BiC | 8.83 BiC | 7.57 BiC | 2.19 Behind (5th) | 2.50 Behind | 1.88 Behind |
| Google DeepMind | 0 | 0 | 0 | 3.04 Behind (3rd) | 2.95 Behind | 3.13 **Middle** |
| xAI | 0 | 0 | 0 | 2.84 Behind (4th) | 3.18 Behind | 2.50 Behind |
| Meta | 0 | 0 | 0 | 1.59 Behind (6th) | 0.68 Behind | 2.50 **Behind** |
| Mistral AI | 0 | 0 | 0 | 0.91 Behind (7th) | 1.82 Behind | 0 |
| Moonshot AI | 0 | 0 | 0 | 0.77 Behind (8th) | 0.91 Behind | 0.63 Behind |
| DeepSeek | 0 | 0 | 0 | 0.65 Behind (9th) | 0.68 Behind | 0.63 Behind |

No sentence in the file states a rank or tier for Google, Meta, xAI or Moonshot AI. The only tier words that had to move were the governance descriptors: OpenAI's "About half marks" and Moonshot AI's "Low" (see below). Takeaway 5's tier claims still hold: OpenAI is Best in class on all six figures, and Anthropic on all but the document as a whole.

## 1. Changes

### Grid
- **grid.caption**: "Four figures ..." became "Four figures and two final scores ...". Each company shows six rows (row 189; settled by the file itself).
- **Document as a whole, plain**: it listed three of the five criteria. It now adds "whether its rules give their reasons, whether the situations a model is used in have rules of their own" (row 26, confirmed).

### Takeaways
- **T1 text**: "their models answer to no written rules that anyone outside can read" became "none of them publishes a document that sets out, in general, how the models it offers today should behave". It then gives two fragments as examples: Google's Gemini app pages, and xAI's safety prompts for retired Grok models. It ends: "A fuller document may exist ..., and Meta says it evaluates its Muse Spark model against one".
  - Why: rows 123, 137 and 152 were confirmed, and rows 202, 107, 92 and 183 point the same way.
  - The board itself scores Google 3, xAI 2, and Meta, Moonshot AI and DeepSeek 1 on check 1.1.
  - Mistral's Vibe CLI prompts are left out because that item is held.
- **T2 text**: two sentences of examples were added. The first is OpenAI's change of August 2026 from "a shutdown timer" to "an ending condition", which is absent from its change log. The second is that xAI (June 2026) and Meta (April 2026) loosened their risk frameworks. The existing claims were kept. Why: rows 203 and 168 (confirmed), and governance finding 2 now carries the same examples.
- **T3 text**: OpenAI, Google and xAI were added, and the Meta sentence was made more precise.
  - OpenAI: its Model Spec distinguishes kinds of deployment, and its Department of War post describes that deployment's safeguards without naming the Spec.
  - Google confirmed the Pentagon agreement for classified networks, and xAI agreed to the "all lawful use" standard as Axios reported. Neither has published the rules that apply there.
  - Meta: "its models ... its own policy" became "its Llama models ... their acceptable use policy".
  - Why: governance finding 4 now scores OpenAI 5.0, the same as Anthropic, which was the only company the takeaway named. Rows 109 and 185 and the board settle the Google and xAI facts. Row 125 was confirmed.
  - The title is kept (see held items).
- **T4 title**: "Two companies" became "Three companies".
- **T4 text**:
  - It now leads with Measure 7.1.
  - It says three companies that publish no constitution signed up: Google and Mistral AI the whole Code, and xAI its Safety and Security chapter, where Measure 7.1 sits.
  - It adds that Mistral AI classifies none of its current models as carrying systemic risk, so no report is due from it today.
  - Why: rows 170 and 140 (confirmed), 205, 79, 110 and 186, and governance finding 8.
- **T5 text**, Alibaba sentence: "Alibaba's constitution is well built, but it says nothing about which models it governs" became "Alibaba is best in class on the three figures of what the constitutions say, second to OpenAI on the document as a whole, but its constitution names none of the models it governs and Alibaba is behind on all three governance figures".
  - Why: the constitutions board now says the document says Alibaba trains its models towards it. Rows 21, 65 and 206 agree.
  - Row 65's "level with OpenAI's on the document" is wrong on the figures (8.83 against 9.5), so I did not use it.
- **T6 text**: "reflects a choice to apply its ranked values with judgement rather than strictly" became "reflects its choice to weigh its ranked values as a whole, and settings it has no rules for, such as images, audio and video".
  - Why: rows 35 (confirmed) and 207. Situations alone account for at least 24 per cent of the gap.
  - I left out the "in part" hedge, because the synthesis lists it among changes that favour Anthropic. What was applied only adds a second cause, a gap in the document, so it makes the sentence less favourable to Anthropic. **Please check this reading.**

### OpenAI
- **profile**: "almost nothing published on testing" became "tests of its models against the document published once, in March 2026, and not updated for its newest models" (row 158, confirmed; board S2).
- **whole**:
  - "each rule's force is stated" became "most rules say how firm they are", which is the board's reading.
  - "run through the safety rules and stop at the formatting rules" became "run through the safety and privacy rules and are missing from several root content rules, such as intellectual property, extremism, hate and fairness, and from the formatting rules".
  - Why: row 46 (confirmed) and 248; the readings on the constitutions board.
- **governance**: "About half marks" became "A little over half marks" (6.2).
  - "published text is the one its models are trained on and used with" became "the public text, though it leaves out some detail, is consistent with the behaviour it trains its models for".
  - "few adherence tests ... no outside testers are named" became three facts: one set of tests from March 2026 that has not been kept current, no outside evaluator testing adherence, and no release threshold.
  - Why: row 159 (confirmed), and the board's I3, S2, S3 and S4.
- **published**: "with its past versions" became "with all its past versions" (2.1 is now 4). "special deployments ... barely addressed" became "it names kinds of deployment without saying whether government use is among those it governs" (1.3 is now 2; row 160; the board's column reading).
- **engages**:
  - "Strong on training and use" became "Strong on use".
  - "the published text is the one used inside" became "it says how its public text relates to the one it trains on".
  - It adds that training is described in detail only for an earlier generation of models (I1 is 1).
  - "testing is almost absent ... no outside testers" became the three testing facts listed under governance.
  - Why: row 161 (partly), applied as the second reader proposed.

### Anthropic
None of these moves Anthropic up.
- **profile** and **published**: "names the models it covers" became "says which models it covers". This is the governance board's own wording and the second reader's proposal (rows 22, 67 and 69). It is a correction downward.
- **whole**: added "Images, audio and video have no rules of their own." This is row 24 (partly), applied as proposed, and it matches the board's readings.whole. The contradiction sentence stays because the board still counts it.
- **behaviours**: "Honesty is covered less evenly, with little on sycophancy and on secret loyalties" became "Honesty and epistemics is its lowest category, held down by sycophancy and contested questions, and within autonomy and oversight it says least about secret loyalties". "Solid on autonomy and oversight" was dropped. Secret loyalties had been filed under honesty. This is row 3 (confirmed, high), applied as written. The figures match: the category is 7.0, sycophancy 5.3, objectivity 6.3 and loyalty 5.3.
- **governance**: "The change log is weak" became "The constitution has no change log". The board's text says "There is no change log and no version number: one current text."
- **published**: "past versions are hard to find and changes are not explained" became "the constitution has no change log and no version number, and only its current text is published". Why: row 190, and board 2.1 ("One version of the constitution is published ... no archive of earlier text").
- **notes.whole**: "This row rewards a document that says plainly which rule wins ... that choice is what holds this figure back" became "This row averages five criteria. [The choice] lowers its figures on which rule wins and on how firm each rule is. It also has no rules for images, audio or video, and one contradiction stays unsettled." The last two sentences are kept. This is row 26 (wrong, confirmed). The change removes a framing that excused Anthropic.

### Alibaba
- **profile**:
  - "comes from a research lab" became "published by Alibaba's AI governance laboratory in the company's name".
  - "Almost nothing is published about how it is maintained or applied, so the document is strong and its governance weak" became three facts: almost nothing on maintenance, Alibaba says it trains its models towards the document, and its lab has built one research model on it and scored two Qwen models, neither from the current line.
  - Why: rows 50 and 10 (confirmed), and the board's S2 and I1.
- **constitutions**: "reasons, which few rules give" became "reasons, which are brief and missing from its hard prohibitions" (row 7, confirmed).
- **whole**: "mostly only the strictest rules say why they exist" became "most rules give one in a single clause, and its hard prohibitions give none" (row 8, wrong, confirmed; the board's readings.whole).
- **governance** and **published**:
  - Both now add that some hard constraints are set by unpublished policy documents (4.1 is 3).
  - "carries no open licence" became "says it is open source without naming a licence" (S1 is 1).
  - In governance, "little sign of it being trained on, tested against or controlled" became the published scores for two Qwen models and nothing on who approves a change (S2 is 1, S5 is 0).
  - Why: rows 51, 52 and 13; the board settles these.
- **engages**:
  - "Only a little on training ... the same text is used inside. Nothing on testing" became "A little on training and testing".
  - It then says the document says Alibaba trains towards it, and that its values match internal standards though the public text leaves out detail.
  - It adds the scores for two Qwen models, and that nothing is published on monitoring or on who approves a change.
  - Why: row 12 (confirmed), row 53, and the board's I1, I3 and S2.
- **caveat**:
  - "a research lab, and not by the teams that build the Qwen models ... nothing public ties it to a model in production" became "published in Alibaba's name on the site of its AI governance laboratory (AAIG)".
  - It now says the document says Alibaba trains its models towards it and names none of them.
  - It keeps Oyster-II, built on Qwen3-14B, and adds that the same release scores Qwen3-Max and Qwen3.5-397B.
  - Why: row 10 (confirmed) and row 54. The unsourced Qwen-teams clause is dropped. The old last clause contradicted both boards.

### Google DeepMind
- **profile**: "little on ... how its models are held to them" became "its model cards test each current model against the safety policies they list" (S2 is 1; row 97).
- **governance**: "training against internal policies that no published document ties together" became the model-card tests and the child-safety launch threshold, plus some outside testing, training and monitoring (S2 and S4 are 1; row 98).
- **published**: adds that the model cards tie safety policies to named models (1.2 is 2). "Hard constraints ... barely documented" became "refers to a set of harms that are always blocked without listing them" (4.1 is 2; the board's column reading).
- **engages**: it now leads with the published tests and the launch threshold, then outside testers and some training and monitoring. "Change control" became "who approves a change to the rules". Why: row 100 and the board's column reading. This is the row where Google is now Middle tier.

### Mistral AI
- **profile**: "nothing on how its models are trained, tested or held to written rules" became "Nothing is published on training or testing its models against written rules". Row 128 (partly) confirmed that "held to written rules" is false as worded. The Vibe CLI prompts are not named, because that item is held.

### Meta
- **governance**: "Almost nothing" became "Little". It adds the guardrails for developers and for its Muse agent, and adherence testing against an internal specification (row 112, confirmed).
- **published**: "Almost nothing: ..." became "Little: ...". It adds the version record of its framework, fragments in a template prompt and rules for teenagers, and the guardrails for developers and Muse. Why: row 113 (confirmed), the board's column reading, and 1.1 now at 1.
- **engages**: "Nothing on change control" became "It names who confirms changes to its risk framework and nobody for a document on how its models behave" (row 114, confirmed). The company's engages tier is now Behind; no text stated its tier.

### xAI
- **profile**: "Its policies govern users rather than the model" became "The rules it has published for its models are system prompts for models it has since retired" (row 172, confirmed).
- **governance**: rewritten to cover the safety prompts and prompt log for retired models, partial guardrail accounts, model-card tests against a refusal policy published only for those models, and an outside testing agreement with no published result. "Low" is kept because xAI is Behind on every row (row 173).
- **published**: "no list of hard constraints" became "A list of disallowed activities, marked as overriding every other instruction, was published for its 2025 API models, since retired". It adds that the prompt log stopped in November 2025 (row 174; board 1.1 and 4.1 are now 2).
- **engages**: it adds the refusal-compliance tests (S2 is 1) and the testing agreement (S3 is 1). "Nothing on change control" became "only a 2025 statement that prompt changes need review, with no approver named", which is what the board's S5 text now records. The score stays 0 (row 175).

### Moonshot AI
- **governance**: "Low" became "Very low". At 0.77 it is now below Mistral AI's 0.91, which the file already called "Very low", so the same word gives the same standing. "Some published adherence testing" became a sample system prompt, dated terms with no record of what changed, the content filter, and a 2025 red-team tied to no behaviour document (row 143, confirmed; S2 is 0, 2.3 is 0, 3.1 is 2).
- **published**: "No constitution beyond a default system prompt, with a partial record of changes and little on guardrails" became "No constitution, only a sample system prompt ...". It adds dated terms with no record of what changed, and the description of the content filter (row 144, partly, applied as proposed; the board's column reading).
- **engages**: "Some published adherence testing" became "Almost nothing: ... Its one published safety test, a red-team of a model since withdrawn, is tied to no behaviour document" (row 145; the board's column reading).

### DeepSeek
- **profile**: "Its only relevant document is the disclosure" became "Beyond a disclosure page of the kind its regulator requires and its R1 paper of 2025". The board now names the R1 paper (row 83).
- **governance** and **published**: they now name the contractual right to filter, and the R1 paper's safety training and risk control system (3.1 is 2). Published also names the two 2025 system prompts, and governance says nothing comparable was published for later models (rows 84 and 85, as far as the board carries them).

## 2. Held

**Anthropic items (the auditors are Claude)**
- Row 23, Anthropic `constitutions` "rarely says in advance how a given conflict resolves": the confirmed fix is upward for Anthropic, and the board's own readings.whole holds the same wording.
- Row 25: the part saying "little on sycophancy" understates, and "gives rules but few worked cases". Both are upward, so I used row 3's wording instead.
- Row 24: dropping "one contradiction stays unsettled". This is upward, and the board still counts it at 5.0.
- Row 68 and row 70, Anthropic governance and engages:
  - The 90-day sync promise and "outside testers" (S3 is held at 0) are both upward.
  - "The same text is used inside" is kept because the board's I3 is 2 and its column reading says so.
- Row 77, T2: Anthropic's 90-day promise favours Anthropic.
- Row 78 and row 204, T3: the retitle ("how its models behave") and Anthropic's published refused uses favour Anthropic. The rest of row 204 was applied.
- Row 81 and row 207, T6: "in part", which the synthesis lists as favouring Anthropic. Only the non-favourable half was applied.
- Rows 205, 170 and 79, T4: "OpenAI and Anthropic signed too" contradicts the governance board's held limitation that Anthropic's signature is unconfirmed.
- Rows 36, 80 and 206: "best in class on every figure ... all but one" stays until the whole-document criteria are re-judged (held figures). The row's "the gap between the two is within one check" is no longer true: OpenAI leads by about 0.65.

**Owner decisions**
- Rows 27 and 82, an Anthropic scope caveat. OpenAI's Model Spec also leaves government deployments unsaid and names "rail free" exceptions. A caveat for Anthropic alone would give the two unequal standing. It needs a decision on caveats for both, or neither.
- Rows 128, 129 and 130, Mistral AI's Vibe CLI prompts. The governance board holds all Mistral items as a rule decision (whether published system prompts count), so naming them would anticipate it. T1 does not name Mistral's prompts for the same reason.
- Row 139, Mistral AI's military clause in T3. It is held on the governance board, and the second reader refused the Meta-like framing.
- Row 86, and row 84's safety-evaluation clause, DeepSeek's R1 evaluation under S2. It waits for board-wide rules.
- Row 247, the OpenAI Fred case. It is held on the constitutions board and bears on OpenAI's conflict-rules figure.
- Row 249 and the worked-example caveat of row 247: OpenAI's behaviour wording on power and loyalty, and the note that the panel judged the Model Spec without its worked examples. These are methodology items with held depth re-runs, and the board still reads "says least about power and loyalty".
- Row 9: disclosing substitutes on Alibaba's secret-loyalties figure. It is held with the method items in `con-report.md`.
- Row 176: labelling zeros as "no constitution". This is presentation, held in `con-report.md`.
- Rows 192 to 201 (arithmetic with proposed figures): I followed the boards' current figures, not the indicative ones.

**No second reader and not settled by the boards, or optional**
- Rows 44 and 246, OpenAI "explicit throughout" to "on most points": the second reader called it a mild overstatement, and the constitutions board keeps "almost every section".
- Row 248, "Close to full marks on most criteria". Reasons is 8.33 on the board, and its proposed 7.5 is held.
- Row 98, Google "two lists that do not match": the board does not say this.
- Rows 97 and 100, "no full constitution": the board says "No constitution".
- Row 107, "Google most of all".
- Row 109, Google's reported filter clause: governance finding 4 does not carry it.
- Row 185, xAI's "direct, unfiltered answers" in T3: T3 is already long, and xAI's deal is named.
- Row 145, calling Moonshot AI's K2 rubrics published and not internal: the board keeps "internal policies".
- Row 83, "the regulator requires" being unsourced: both boards use the same phrase.
- Row 173, xAI "Middle": xAI is Behind on every row.
- Optional rows 61, 66, 111, 131, 142 (the profile's "default" is the board's own word) and 13.
- Rows about the two boards' own texts (governance findings, constitutions takeaways, open questions, behaviour comparisons and asides: rows 0 to 5, 14 to 20, 28 to 34, 37 to 43, 55 to 60, 71 to 75, 87 to 91, 102 to 106, 116 to 122, 133 to 136, 141, 146 to 151, 157, 162 to 166, 177 to 182 and 208 to 245). They are not in this file; `gov-report.md` and `con-report.md` cover them.

## 3. Found outside this file, now out of step (not edited)
- `governance.json` `column_readings.anthropic.published` still says "past versions are hard to find", which contradicts its own profile and 2.1 evidence.
- `governance.json` `column_readings.alibaba.engages` still says "the same text is used inside". Row 12 (confirmed) and the board's own I3 sentence say otherwise.
- `constitutions.json` Alibaba profile still says AAIG published it "not by the teams that build the Qwen models". Row 10's second reader found no source for this.
- The guardrails phrase "most consistent across all nine companies" does not occur in `overview.json`. It was in governance finding 3, which is already fixed, and no overview text relies on it.

## 4. Checks
- `python3 -m pytest -q tests engine`: **921 passed, 357 subtests passed**. This includes `test_company_texts_are_absolute.py`.
- `node --test app/lib/__tests__/board-tools.test.mjs`, the MCP overview tool that reads this file: 7 passed.
- `grep` for em and en dashes in `site/overview.json`: 0.
- I scanned the summaries for ranking words. Every hit ("most rules", "its lowest category", "says least about") refers to the company's own document. "Rather than strictly" in Anthropic's profile is older text outside the clause I changed.
- `git status`: only `site/overview.json` is modified.
