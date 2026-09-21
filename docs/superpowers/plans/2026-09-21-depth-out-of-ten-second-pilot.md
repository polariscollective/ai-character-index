# Depth out of ten: the second pilot, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the four corrections the first pilot called for, then run the pilot again on the OpenAI model spec of August 2026 alone.

**Architecture:** The prompts are tightened in place (none has been used for anything published). `assessment_call.py` gains a third call, which puts the contradictions one judge found to the other judges, and a helper that gives each section its heading attributes. `pilot_scale_ten.py` seats a declared substitute when a whole-document call is refused, runs the confirmation, and scores contradictions from confirmed ones only.

**Tech Stack:** as the first pilot: Python 3 standard library, `unittest` through `pytest`.

**Design:** `docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md`, section "What the pilot showed".

## Global Constraints

- Work in the worktree `/Users/sverbo/Desktop/Codes/Polaris/ai-character-index-depth-to-ten`, branch `feat/depth-to-ten-and-document-assessment`. Do not touch `/Users/sverbo/Desktop/Codes/Polaris/ai-character-index`.
- Everything written to the repository is in English, with British spelling.
- No long dashes anywhere, `—` or `–`, and no `--` used as a dash in new prose.
- The scale of four in `engine/panel/depth_call.py` stays byte-identical for every caller that does not pass `scale`.
- The pilot never writes to the database and spends nothing without `--go`. Do not run `engine/pilot_scale_ten.py` yourself.
- Tests run with `python3 -m pytest` from the worktree root. `engine/test_job.py::JobDispatchTest::test_publish_takes_documents_and_no_panel` fails already on `develop` and is out of scope.
- Every commit message ends with exactly these two lines, whatever model writes it:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7
```

---

### Task 1: Tighter prompts, a confirmation call, and heading attributes

**Files:**
- Modify: `engine/panel/prompts/depth-v2.txt`
- Modify: `engine/panel/depth_call.py` (the scale-of-ten branch of `compose` only)
- Modify: `engine/panel/prompts/assessment-criteria-v1.txt`
- Create: `engine/panel/prompts/assessment-confirm-v1.txt`
- Modify: `engine/panel/assessment_call.py`
- Test: `engine/panel/test_depth_call.py`, `engine/panel/test_assessment_call.py`

**Interfaces produced:**
- `assessment_call.QUESTIONS` stays exactly `("criteria", "contradictions")`. `assessment_call.PROMPTS` gains the key `"confirm"`, so `system_prompt("confirm")` and `prompt_sha256("confirm")` work.
- `assessment_call.compose_confirm(passages: list[tuple[str, str, str]], claims: list[dict]) -> tuple[str, str]`. Each claim is `{"first": int, "second": int, "situation": str, "why": str}` with 1-based passage numbers.
- `assessment_call.parse_confirm(reply: str, claim_count: int) -> dict[int, dict]`, mapping a claim's 1-based position to `{"holds": bool, "absolute": bool | None, "reason": str}`.
- `assessment_call.with_heading_attributes(passages: list[tuple[str, str, str]], markdown: str) -> list[tuple[str, str, str]]`.

**Step 1: `depth-v2.txt`.** Make these replacements, each of a whole paragraph or line as it stands today:

- The paragraph beginning `The second block holds` becomes:

```
The second block holds the passages in which the document states its general rules for what to do when two of its own rules conflict, such as an order of priority. They are numbered R1, R2 and so on. They show what the general rules say, and they never meet condition (b) on their own. The second block may be empty.
```

- The line beginning `10 = BOUNDED` becomes:

```
10 = BOUNDED: demonstrated, and for this behaviour the document meets all three conditions below, for every facet of the behaviour that the Definition and Clarifications name.
```

- The line beginning `(b) A conflict is settled.` becomes:

```
(b) A conflict is settled. The document names another of its own rules that pulls against this behaviour, says which prevails and under what condition, and shows it on a case, in the passages of the first block. A general rule from the second block does not meet (b) on its own, and neither does an instruction to weigh the considerations together or to follow the document's spirit.
```

- Directly after the line beginning `(c) A default for the undecidable case.`, add this line:

```
Each condition must hold for every facet the Definition and Clarifications name. One pair of cases, one settled conflict or one default that covers a single facet meets that condition for that facet only.
```

- In the paragraph beginning `An odd number means`, replace `9 is demonstrated with one or two of the three conditions.` with `9 is demonstrated with the conditions met only in part: for some facets, or only one or two of them.`
- The line `DEPTH: <a whole number from 0 to 10>` becomes `DEPTH: <one of 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 or 10, never negative>`.
- In the `RATIONALE:` line, replace `at 8 or above, which of the three conditions are met, and for (b) whether it rests on a passage numbered R>` with `at 8 or above, which of the three conditions are met and for which facets>`.

**Step 2: `depth_call.compose` on the scale of ten** ends the user message with `\n\nAnswer with the two lines DEPTH and RATIONALE. DEPTH is one whole number from 0 to 10.` instead of `\n\nAnswer with the two lines DEPTH and RATIONALE.`. The scale of four keeps its ending exactly. Update the one existing scale-of-ten test that asserts the old ending, and add a test that the scale of four still ends with `\n\nAnswer with the two lines DEPTH and RATIONALE.` while the scale of ten ends with the new sentence. Add a test that the prompt of ten contains `never negative` and `for every facet`.

**Step 3: `assessment-criteria-v1.txt`.** The two lines under `CONFLICT_RULES:` that begin `2 =` and `4 =` become:

```
2 = an order of priority between its rules that the document asks to be weighed as a whole, or an instruction to settle conflicts by judgement or by the document's spirit. Either is at most 2, however detailed.
4 = a strict order that decides who wins whenever two ranks conflict, a rule for two rules of the same rank that names a winner or an outcome, and examples of the order applied.
```

Add a test that the criteria prompt contains `Either is at most 2, however detailed.`

**Step 4: create `assessment-confirm-v1.txt`** with exactly this content, ending with a newline:

```text
You are checking contradictions that another reader found in an AI alignment document (a model constitution or a model spec). You are given the complete document as numbered passages, in order, each with its section path, and then a numbered list of claimed contradictions. Each claim names two passages, a concrete situation, and why the two cannot both be followed. Read the whole document before you answer.

A claimed contradiction holds when the two passages, applied to that situation, require responses that cannot both be given, and nothing anywhere in the document says which prevails. It does not hold when:
- the document settles it, where the two rules appear or elsewhere, including through a strict order of priority that places the two rules at different ranks (an order the document asks to be weighed as a whole does not settle it);
- one passage states an exception to the other;
- one is a default and the document allows the other to change it;
- the two passages do not in fact require different responses in that situation.

For each claim, also say whether it involves a rule the document calls absolute: a hard constraint, a root-level rule, a red line, or anything it says can never be overridden.

Answer with one line per claim, in the order given, and nothing else:
ITEM <number>: <holds or does not hold> | absolute: <yes or no> | <one sentence: why it holds, or where the document settles it>
```

**Step 5: `assessment_call.py`.**

- `PROMPTS` gains `"confirm": HERE / "prompts" / "assessment-confirm-v1.txt"`. `QUESTIONS` becomes the literal `("criteria", "contradictions")`.
- `compose_confirm(passages, claims)` returns `(system_prompt("confirm"), user)` where `user` is the same numbered document `compose` builds (`The complete document, as N numbered passages in order:` then the `[i] (§ section) text` lines), then a blank line, then `Claimed contradictions (K):`, then one line per claim, `[k] passages [a] and [b] | <situation> | <why>`, then a blank line and `Answer with one ITEM line per claim, in the order given.` Factor the numbered-document text into one private helper that `compose` and `compose_confirm` both use, so `compose`'s output is unchanged.
- `parse_confirm(reply, claim_count)`: read each line after removing list markers and markdown the way `_labelled` does; a line matching `^ITEM\s*(\d+)\s*:(.*)$` (case-insensitive) with a number from 1 to `claim_count` is a verdict. Split its value on `|` into three parts; the verdict is `holds` when the first part, stripped and lower-cased, starts with `holds`, and not when it starts with `does not hold` (anything else is skipped); `absolute` is True for `absolute: yes`, False for `absolute: no`, None otherwise; `reason` is the third part stripped, or an empty string. A later line for the same number replaces an earlier one. Numbers never answered are absent from the result.
- `with_heading_attributes(passages, markdown)`: collect, from every markdown heading line matching `^#{1,6}\s+.*?\{#([A-Za-z0-9_-]+)\s+([^}]+)\}\s*$`, a map from anchor to its attributes (the second group, stripped, for example `authority=root`). For each passage whose locator's second ` > ` part starts with `#`, look up that anchor; when attributes are found and the section does not already contain `authority=`, the section becomes `f"{section} {{{attributes}}}"`. Every other passage is returned unchanged. Locators and texts never change.

Tests to add in `engine/panel/test_assessment_call.py`:
- `compose_confirm` puts the numbered document first and the line `[1] passages [2] and [3] | S | W` for a claim `{"first": 2, "second": 3, "situation": "S", "why": "W"}`, and `compose("criteria", PASSAGES)` is unchanged (compare with the output before your change, or assert its exact ending and its first line).
- `parse_confirm` reads `ITEM 1: holds | absolute: yes | R1` and `**ITEM 2:** does not hold | absolute: no | Settled in 4.` as `{1: {"holds": True, "absolute": True, "reason": "R1"}, 2: {"holds": False, "absolute": False, "reason": "Settled in 4."}}`; it skips `ITEM 3: maybe | absolute: no | x` and `ITEM 9: holds | absolute: no | x` when `claim_count` is 2; a later line for the same item wins.
- `with_heading_attributes` turns `("doc@v > #do_not_lie > ¶1", "Truth > Do not lie", "Never lie.")` with markdown `"# Truth\n\n## Do not lie {#do_not_lie authority=user}\n\nNever lie.\n"` into section `Truth > Do not lie {authority=user}`; leaves a passage whose section already contains `authority=` unchanged; leaves a passage whose locator is a heading path (`"doc@v > Truth > Do not lie > ¶1"`) unchanged.
- The confirm prompt has no long dash, and `system_prompt("confirm")` equals the file on disk.

**Step 6: run** `python3 -m pytest engine/panel -q`, then `python3 -m pytest engine -q` once. Commit with the message:

```
feat: a vague rule no longer settles anything, and a claim is put to a second reader

depth-v2 asks the three conditions of 10 to hold for every facet the brief
names, and no longer lets the general rules or an instruction to weigh meet
condition (b) alone. It lists every allowed value, never negative. The
conflict-rules criterion puts an order to be weighed at 2 at most. A third
call puts one judge's contradictions to the others, and each section of a
document can carry its heading attributes to the judges.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7
```

---

### Task 2: The pilot seats substitutes, confirms contradictions, and shows labels

**Files:**
- Modify: `engine/pilot_scale_ten.py`
- Test: `engine/test_pilot_scale_ten.py`

**Interfaces consumed:** Task 1's `assessment_call.compose_confirm`, `parse_confirm`, `with_heading_attributes`, `system_prompt("confirm")`, `prompt_sha256("confirm")`.

**Requirements:**

1. **Labels.** For each document, the passages shown in the criteria, contradictions and confirmation calls are `assessment_call.with_heading_attributes(passages[document], markdown)`, where `markdown` is the `markdown` field of that document's `aci_spec_versions` row (an empty string when absent). Depth calls keep the plain passages. Locators, and so passage numbers, are the same either way.

2. **Substitutes for whole-document calls.** A seat's candidates are the seat itself, then `config.get("substitutes", {}).get(panel, {}).get(seat, [])` in order (for `frontier_fast`, `fable` then `opus` then `kimi`). A candidate fails when `ask` raises, when its `finish_reason` is `content_filter`, or when its reply is empty after stripping. On failure the next candidate is asked. The recorded answer carries `model` (the candidate that answered) and `substituted`, a list of `{"model": tag, "reason": text}` for every candidate that failed before it (the exception text cut to 300 characters, or `finish_reason=content_filter`, or `empty reply`). When every candidate fails, the answer is `{"error": <the last reason>, "substituted": [...]}`. This applies to criteria, contradictions and confirmation calls. The price still counts each seat's own model only.

3. **Confirmation.** After every seat's contradictions call for a document:
   - Pool the claims: key each parsed item (1-based numbers, before conversion to locators) by the unordered pair of its passage numbers; the first finder's situation and reason are kept; `found_by` lists every seat that listed the pair.
   - For each seat, the claims to confirm are those it did not find. When there are none, no confirmation call is made for that seat. Otherwise one confirmation call is made (with substitutes as in 2), composed with `compose_confirm` over the labelled passages, and parsed with `parse_confirm`.
   - A claim is **confirmed** when the number of seats in `found_by` plus the number of seats whose verdict is `holds` is at least 2. It is **absolute** when any seat's verdict on it says `absolute: yes`.
   - The document's contradictions score is computed from confirmed claims: 4 when none, 2 when one or two and none absolute, 0 when three or more or any absolute. Record it as `record["contradictions_score"]`.
   - Record the pooled claims as `record["contradictions"]`, a list in pooling order, each `{"first": locator, "second": locator, "situation", "why", "found_by": [...], "holds": [seats], "does_not_hold": [seats], "absolute": bool, "confirmed": bool, "reasons": {seat: reason}}`. Add both locators of every claim to `passage_text`. Record each seat's confirmation call as `record["assessment"][seat]["confirm"]` with the same fields as the other calls. Its cost counts in `cost_usd`, and its price is estimated in price mode with 3,000 characters of claims and 1,500 output tokens per seat.
   - `results["prompts"]` gains `"confirm": assessment_call.prompt_sha256("confirm")`.

4. **Summary.** The section `### Contradictions listed` becomes `### Contradictions, after a second reading`: one item per pooled claim, marked `confirmed` or `not confirmed`, then `found by`, `held by` and `rejected by` with each seat's reason, then both passages' text cut to 300 characters as today. After the list, the line `Score from confirmed contradictions: N.` The criteria table keeps each judge's own contradictions score. The `### Calls` list shows a substitution, for example `- fable contradictions: fable refused (finish_reason=content_filter), opus answered; 3 items listed, 0 unreadable, score 2, finish_reason=stop`, and one line per confirmation call.

**Tests** (in `engine/test_pilot_scale_ten.py`; extend `Scripted` as needed; every existing test keeps passing except the one named below, which is updated):
- The existing `test_a_refused_call_is_recorded_and_the_others_go_on` now expects a substitution: `fable`'s criteria answer has `model == "opus"`, its `substituted` names `fable` with a reason containing `content_filter`, and the conflict rules are still `[PASSAGES[0][0]]`. Add a separate test where `fable`, `opus` and `kimi` all refuse, which records an `error` for `fable`'s criteria and still passes the conflict rules from the other two seats.
- A reply with `finish_reason` `content_filter` and empty text from `fable` on the contradictions call makes `opus` answer it.
- With a versions row whose `markdown` contains `## B {#b authority=user}` and passages whose locators use `#b`, the criteria call's user text contains `{authority=user}` and no depth call's user text does.
- Confirmation: `sol` lists `[2] [3]`, `deepseek` lists `[1] [2]`, `fable` lists none; `fable` and `deepseek` answer `holds` on the claim about passages 2 and 3, and every confirmer answers `does not hold` on the claim about passages 1 and 2. The claim `[2] [3]` is confirmed, `[1] [2]` is not, the score is 2, and `summary.md` contains `confirmed`, `not confirmed` and `Score from confirmed contradictions: 2.`
- When every seat lists the same pair, no confirmation call is made, and the claim is confirmed.

Run `python3 -m pytest engine/test_pilot_scale_ten.py -q`, then `python3 -m pytest engine -q` once. Commit with the message:

```
feat: the pilot seats substitutes, confirms contradictions and shows labels

A whole-document call refused by a content filter, or answered with nothing,
goes to the seat's declared substitutes in order. Every contradiction one
judge finds is put to the others, and the score counts only the confirmed
ones. The judges of the whole-document calls see each section's heading
attributes, so the model spec's authority labels reach them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7
```

---

### Task 3: Price and run the second pilot, on the model spec alone

- [ ] Price it: `set -a; . ../ai-character-index/.env; set +a; unset ANTHROPIC_API_KEY; python3 engine/pilot_scale_ten.py --documents=openai--model-spec@2026-08-18`. The owner approved this run for less than 6 dollars. If the price is under 6, run it with `--go`; otherwise report the price and stop.
- [ ] Check every call came back, as in the first plan's Task 4 Step 3.
- [ ] Append "What the second pilot showed" to the design: the price and cost, how often 10 was given, deepseek's answers, the confirmed and rejected contradictions, the conflict-rules and force scores, and a recommendation. Commit it.
