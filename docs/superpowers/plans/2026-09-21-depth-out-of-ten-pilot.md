# Depth out of ten: the pilot, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two new kinds of call the design needs (a depth out of ten, and the assessment of a whole document), and run them once, locally, on two documents and eight cells, so a person can judge whether the scale and the criteria work before anything touches the database.

**Architecture:** `depth_call.py` gains a `scale` argument that defaults to 4, so every existing caller is unchanged, and a second prompt file for the scale of ten. A new module, `assessment_call.py`, composes and parses the two assessment calls. A new script, `engine/pilot_scale_ten.py`, reads the public publication from Supabase without writing to it, runs both kinds of call, and writes every reply and a `summary.md` into `artefacts/`. The second plan (migration, engine, runs, site) is written after the pilot has been read.

**Tech Stack:** Python 3 standard library, `unittest` run through `pytest`, the OpenAI client already used by `batch_job.call_openrouter`, Supabase through `engine/store.py`.

**Design:** `docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md`

## Global Constraints

- Work in the worktree `/Users/sverbo/Desktop/Codes/Polaris/ai-character-index-depth-to-ten`, branch `feat/depth-to-ten-and-document-assessment`. The main checkout carries another session's uncommitted work; do not touch it.
- Everything written to the repository is in English, with British spelling.
- No long dashes anywhere, `—` or `–`, in code, prompts, comments, docs or commit messages. Do not use `--` as a dash in new prose either.
- The pilot never writes to the database. It reads through `store.select` only.
- Nothing is spent without `--go`. Without it the pilot prints a price and exits.
- The scale of four stays byte-identical for every existing caller: `depth_call.compose`, `parse`, `system_prompt` and `prompt_sha256` called without `scale` behave exactly as today.
- Tests run with `python3 -m pytest` from the worktree root.
- Every commit message ends with these two lines:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7
```

## File structure

- `engine/panel/prompts/depth-v2.txt` (create): the depth prompt on the scale of ten.
- `engine/panel/depth_call.py` (modify): `scale` argument on `system_prompt`, `prompt_sha256`, `compose` and `parse`; the rules block on the scale of ten.
- `engine/panel/test_depth_call.py` (modify): tests for the scale of ten, and that the scale of four is unchanged.
- `engine/panel/prompts/assessment-criteria-v1.txt` (create): four criteria of the whole-document assessment.
- `engine/panel/prompts/assessment-contradictions-v1.txt` (create): the search for unresolved contradictions.
- `engine/panel/assessment_call.py` (create): composing both calls and parsing both replies.
- `engine/panel/test_assessment_call.py` (create).
- `engine/pilot_scale_ten.py` (create): the pilot runner.
- `engine/test_pilot_scale_ten.py` (create).
- `engine/README.md` (modify): one line naming the pilot.
- `docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md` (modify, last task): what the pilot showed.

---

### Task 1: A depth on the scale of ten

**Files:**
- Create: `engine/panel/prompts/depth-v2.txt`
- Modify: `engine/panel/depth_call.py` (whole file)
- Test: `engine/panel/test_depth_call.py`

**Interfaces:**
- Consumes: `h.compose_query(behaviour, "v3", registry)` from `engine/panel/harness.py`, unchanged.
- Produces:
  - `depth_call.PROMPTS: dict[int, Path]`, keys `4` and `10`.
  - `depth_call.system_prompt(scale: int = 4) -> str`
  - `depth_call.prompt_sha256(scale: int = 4) -> str`
  - `depth_call.compose(behaviour: str, registry: dict, retained: list[tuple[str, str, str]], scale: int = 4, conflict_rules: list[tuple[str, str, str]] | None = None) -> tuple[str, str]`. Passages are `(locator, section, text)`.
  - `depth_call.parse(reply: str, scale: int = 4) -> tuple[int | None, str | None]`
  - `depth_call.NOTHING_RETAINED: str`, unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `engine/panel/test_depth_call.py`, before the `if __name__ == "__main__":` line:

```python
RULES = [("rule-1", "X > Y", "A higher rule prevails.")]


class ScaleOfTenComposeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def test_the_scale_of_ten_has_its_own_prompt_and_digest(self):
        path = HERE / "prompts" / "depth-v2.txt"
        system, _user = depth_call.compose("defined-behaviour", self.registry, RETAINED,
                                           scale=10)
        self.assertEqual(system, path.read_text())
        self.assertEqual(depth_call.prompt_sha256(10),
                         hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertNotEqual(depth_call.prompt_sha256(10), depth_call.prompt_sha256())

    def test_the_prompt_of_ten_names_the_new_level_and_keeps_the_authority_note(self):
        system = depth_call.system_prompt(10)
        self.assertIn("10 = BOUNDED", system)
        self.assertIn("An odd number means", system)
        self.assertIn("Depth is independent of authority level", system)
        self.assertNotIn("—", system)
        self.assertNotIn("–", system)

    def test_the_scale_of_four_composes_as_it_always_has(self):
        self.assertEqual(
            depth_call.compose("defined-behaviour", self.registry, RETAINED),
            depth_call.compose("defined-behaviour", self.registry, RETAINED, scale=4))
        _system, user = depth_call.compose("defined-behaviour", self.registry, RETAINED,
                                           conflict_rules=RULES)
        self.assertNotIn("general rules for conflicts", user)
        self.assertTrue(user.endswith("\n\nAnswer with the two lines DEPTH and RATIONALE."))

    def test_the_rules_block_follows_the_passages_on_the_scale_of_ten(self):
        _system, user = depth_call.compose("defined-behaviour", self.registry, RETAINED,
                                           scale=10, conflict_rules=RULES)
        self.assertIn("general rules for conflicts between its own rules (1):\n"
                      "[R1] (§ X > Y) A higher rule prevails.", user)
        self.assertLess(user.index("[2] (§ A > C)"), user.index("[R1]"))
        self.assertTrue(user.endswith("\n\nAnswer with the two lines DEPTH and RATIONALE."))

    def test_an_empty_rules_block_says_so(self):
        _system, user = depth_call.compose("defined-behaviour", self.registry, RETAINED,
                                           scale=10)
        self.assertIn("(0):\n(none were identified)", user)


class ParseOutOfTenTest(unittest.TestCase):
    def test_every_whole_number_to_ten_is_a_depth(self):
        for n in range(11):
            with self.subTest(n=n):
                self.assertEqual(depth_call.parse(f"DEPTH: {n}\nRATIONALE: x", scale=10),
                                 (n, "x"))

    def test_eleven_and_a_half_step_are_not_depths(self):
        self.assertIsNone(depth_call.parse("DEPTH: 11", scale=10)[0])
        self.assertIsNone(depth_call.parse("DEPTH: 7.5", scale=10)[0])

    def test_the_denominator_of_ten_and_the_words_of_the_scale_still_answer(self):
        for line, n in (("DEPTH: 10/10", 10), ("DEPTH: 8 of 10", 8),
                        ("DEPTH: 10, bounded.", 10), ("DEPTH: 9 (two conditions met)", 9)):
            with self.subTest(line=line):
                self.assertEqual(depth_call.parse(line, scale=10)[0], n)

    def test_a_judge_still_counting_out_of_four_is_not_read_as_answering(self):
        self.assertIsNone(depth_call.parse("DEPTH: 3/4", scale=10)[0])
        self.assertIsNone(depth_call.parse("DEPTH: 3 of 4", scale=10)[0])

    def test_roman_numerals_to_ten(self):
        for numeral, n in (("X", 10), ("IX", 9), ("VIII", 8), ("VII", 7), ("VI", 6),
                           ("V", 5), ("IV", 4), ("I", 1)):
            with self.subTest(numeral=numeral):
                self.assertEqual(depth_call.parse(f"DEPTH: {numeral}", scale=10)[0], n)
        self.assertIsNone(depth_call.parse("DEPTH: XI", scale=10)[0])

    def test_the_scale_of_four_is_unchanged_by_default(self):
        self.assertIsNone(depth_call.parse("DEPTH: 9")[0])
        self.assertIsNone(depth_call.parse("DEPTH: V")[0])
        self.assertEqual(depth_call.parse("DEPTH: 3/4")[0], 3)
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `python3 -m pytest engine/panel/test_depth_call.py -q`
Expected: the new tests fail with `TypeError: compose() got an unexpected keyword argument 'scale'` (or `parse()`), and the 29 existing tests still pass.

- [ ] **Step 3: Write the prompt of the scale of ten**

Create `engine/panel/prompts/depth-v2.txt` with exactly this content (it ends with a newline):

```text
You are measuring how deeply an AI alignment document (a model constitution or a model spec) covers one target behaviour, so that a reader can see at a glance whether the document addresses it and how much it gives an evaluator to work with.

You are given the behaviour, described by four fields: Behaviour, Definition, Clarifications and Scope. An optional field reading 'none provided' only means it was left blank. You are also given two blocks of passages from the document, each passage with its section path.

The first block holds every passage a panel of judges cited for this behaviour, whether they all agreed it governs the behaviour or only some of them did. They are not a shortlist of the strongest ones, and they are not the whole document. These passages are your evidence for the behaviour: do not assume the document says anything they do not show.

The second block holds the passages in which the document states its general rules for what to do when two of its own rules conflict, such as an order of priority. They are numbered R1, R2 and so on. Use them only for condition (b) of level 10, and only where they decide a conflict this behaviour meets. The second block may be empty.

Score the document's depth for this behaviour on a scale from 0 to 10. The even numbers are the levels:

0 = ABSENT: no passage bears on the behaviour.
2 = NAMED: the behaviour appears, a word or clause, typically inside a list or a passage about something else, but the document says nothing further about it.
4 = DISCUSSED: the document addresses the behaviour in its own right, what the norm is and why it matters, but only in terms too general to grade a response against.
6 = PRESCRIBED: the document states concrete do and don't rules or procedures for the behaviour, specific enough that a grader could quote the document's own sentences as pass criteria.
8 = DEMONSTRATED: prescribed, plus worked examples: concrete scenarios where the document shows the sanctioned response, usable as an answer key for borderline cases.
10 = BOUNDED: demonstrated, and for this behaviour the document meets all three conditions below.

The three conditions for 10:
(a) The edge is shown. Two cases that differ in one feature the document names receive opposite sanctioned responses, so a reader can see what makes the response change.
(b) A conflict is settled. The document names another of its own rules that pulls against this behaviour, says which prevails and under what condition, and shows it on a case. A general rule from the second block counts only where it decides this behaviour's conflict. An instruction to weigh the considerations together does not decide it.
(c) A default for the undecidable case. The document says what to do when the model cannot tell which side of the edge it is on, because intent is unclear, a claim cannot be checked or context is missing, or it orders the acceptable second-best responses from best to worst.

An odd number means the level below is fully met and the level above is met only in part. 9 is demonstrated with one or two of the three conditions. 7 is prescribed with examples that do not yet serve as an answer key, because they are too few or they test a neighbouring behaviour. 5 is discussed with some rules precise enough to quote, too few to grade most responses. 3 is named with a sentence or two about the behaviour itself. 1 is a passage that bears on the behaviour only indirectly.

Boundary tests:
- 4 or 6: could an evaluation score a transcript by quoting the document, or would the grader have to invent the standard? If invent, it is 4.
- 6 or 8: a worked example is a concrete scenario for which the document states the sanctioned response, specific enough to adapt into an evaluation item. Format does not matter: a request and response block and a case described in prose both count. An example of a neighbouring behaviour, or a lone illustration of a broader norm, does not.
- 8 or 10: could a grader decide a borderline case the document does not show by quoting the document? If only by analogy with the cases it does show, it is 8 or 9.
- A dedicated section is evidence, not a requirement. Any level can be reached by passages spread across sections, and a dedicated section written only in general terms does not reach 6.

Depth is independent of authority level: a default or a guideline can cover a behaviour as deeply as a hard rule. Note authority in the rationale where it matters.

When in doubt between two values, give the lower.

Answer with exactly two lines and nothing else:
DEPTH: <a whole number from 0 to 10>
RATIONALE: <one sentence naming what is present and what is missing, in the scale's terms; at 8 or above, say which of the three conditions are met>
```

- [ ] **Step 4: Rewrite `engine/panel/depth_call.py`**

Replace the whole file with:

```python
"""One depth call: composing its prompt and parsing its reply.

A depth is one judge's reading of how deeply a document covers a behaviour.
There are two scales, each with its own prompt file. The 0 to 4 scale of
methodology/spec-coverage-depth-rubric.md is the one every publication so far
carries. The 0 to 10 scale of
docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md
puts those levels on the even numbers, reads an odd number as between two of
them, and adds a top level, bounded. A run records the digest of the prompt it
used.

The judge is shown the passages the reader shows by default, every band the
reader opens on, defining, core and related alike, and never the document
itself, so a depth is a reading of the panel's own citations. On the scale of
ten it is also shown, in a block of their own, the passages that state the
document's general rules for conflicts."""

import hashlib
import importlib.util
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROMPTS = {4: HERE / "prompts" / "depth-v1.txt",
           10: HERE / "prompts" / "depth-v2.txt"}
# The prompt of the scale of four, under the name it has always had.
PROMPT = PROMPTS[4]

_spec = importlib.util.spec_from_file_location("h", HERE / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

# An answer line, once its markdown is gone. Models wrap it in bold, a code span
# or a list item often enough that reading only the bare line pays for each of
# those replies twice: the refused one, then its retry.
DEPTH_RE = re.compile(r"^DEPTH\s*:(.*)$", re.IGNORECASE)
RATIONALE_RE = re.compile(r"^RATIONALE\s*:(.*)$", re.IGNORECASE)
LIST_MARKER_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
# Emphasis and code spans. An underscore inside a word is not emphasis, so a
# rationale naming a section such as no_sycophancy keeps it.
MARKUP_RE = re.compile(r"[*`]+|(?<!\w)_+|_+(?!\w)")
# The figure a DEPTH line opens with, whole: 2.5 and 42 are figures too, just not
# ones that name a level of the scale.
NUMBER_RE = re.compile(r"^(\d+(?:\.\d+)?)")
# The Roman numerals that name a level of each scale, longest alternative first,
# so III is not shadowed by an early match on I or II and VIII not by V. The
# trailing \b refuses a numeral folded into a longer word (IIII, IVth, XI): none
# leaves a word boundary where the alternative would otherwise end. On the scale
# of four, V is not read as an answer at all.
ROMAN = {4: re.compile(r"^(IV|III|II|I)\b", re.IGNORECASE),
         10: re.compile(r"^(VIII|VII|VI|IX|IV|V|X|III|II|I)\b", re.IGNORECASE)}
ROMAN_RE = ROMAN[4]
ROMAN_DEPTHS = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7,
                "VIII": 8, "IX": 9, "X": 10}
SCALE_WORDS = {4: "absent|named|discussed|prescribed|demonstrated",
               10: "absent|named|discussed|prescribed|demonstrated|bounded"}


def _answer_suffix(scale):
    """What may follow the figure for the line to count as an answer rather than
    a sentence that happens to start with "Depth:": nothing, bare punctuation,
    this scale's own denominator, a parenthetical, or one word of the scale.
    Anything else is a judge arguing in prose, read through and skipped, not
    refused. The other scale's denominator is prose, so a judge still counting
    out of four is not read as answering out of ten."""
    return re.compile(
        r"^(?:"
        r"[\s.,;:!?()\]-]*"
        rf"|\s*/\s*{scale}\s*[.,;:!?]*"
        rf"|\s+of\s+{scale}\s*[.,;:!?]*"
        r"|\s*\([^()]*\)\s*[.,;:!?]*"
        rf"|\s*[-:,]?\s*(?:{SCALE_WORDS[scale]})\b[.,;:!?]*\s*"
        r")$", re.IGNORECASE)


ANSWER_SUFFIX = {scale: _answer_suffix(scale) for scale in PROMPTS}
ANSWER_SUFFIX_RE = ANSWER_SUFFIX[4]

# What a cell with no retained passage records, without a call: nothing was
# found to grade, which is depth 0 by the scale's own definition.
NOTHING_RETAINED = "No passage was retained for this behaviour in this document."


def system_prompt(scale=4):
    return PROMPTS[scale].read_text()


def prompt_sha256(scale=4):
    return hashlib.sha256(PROMPTS[scale].read_bytes()).hexdigest()


def _numbered(passages, mark=""):
    return "\n".join(f"[{mark}{i + 1}] (§ {section}) {text}"
                     for i, (_locator, section, text) in enumerate(passages))


def compose(behaviour, registry, retained, scale=4, conflict_rules=None):
    """(system, user) for one depth call: the behaviour block, then the retained
    passages numbered in document order. On the scale of ten a second block
    follows, the document's general rules for conflicts, numbered R1, R2 and so
    on, so a rationale cannot confuse them with the behaviour's own passages."""
    block = h.compose_query(behaviour, "v3", registry)
    user = (f"{block}\n\nPassages the panel cited for this behaviour "
            f"({len(retained)}):\n{_numbered(retained)}")
    if scale == 10:
        rules = list(conflict_rules or [])
        user += ("\n\nThe document's general rules for conflicts between its own rules "
                 f"({len(rules)}):\n{_numbered(rules, 'R') or '(none were identified)'}")
    user += "\n\nAnswer with the two lines DEPTH and RATIONALE."
    return system_prompt(scale), user


def _plain(line):
    """A reply line without its list marker, emphasis or code spans."""
    return MARKUP_RE.sub("", LIST_MARKER_RE.sub("", line, count=1)).strip()


def _next_nonempty(lines, start):
    """(index, plain text) of the first non-blank line at or after start, or
    None. A label whose value is split onto its own line reads this."""
    for i in range(start, len(lines)):
        text = _plain(lines[i])
        if text:
            return i, text
    return None


def _read_answer(value, scale=4):
    """(counts, figure): whether value reads as an answer at all, and the depth
    it names when it does. A leading figure or Roman numeral, followed by
    nothing, punctuation, the scale's denominator, a parenthetical or one word
    of the scale, counts. A figure counts whether or not it names a level of the
    scale (2.5 and 42 count but refuse); a Roman numeral counts only when it
    names a level of the scale, so on the scale of four V and IIII are not read
    as answers at all. Anything else, a figure trailing into prose or no figure
    and no Roman numeral, does not count, and is read through as prose."""
    if not value:
        return False, None
    suffix = ANSWER_SUFFIX[scale]
    number = NUMBER_RE.match(value)
    if number:
        token, rest = number.group(1), value[number.end():]
        if not suffix.match(rest):
            return False, None
        return True, int(token) if token in {str(n) for n in range(scale + 1)} else None
    roman = ROMAN[scale].match(value)
    if roman:
        token, rest = roman.group(1), value[roman.end():]
        if not suffix.match(rest):
            return False, None
        return True, ROMAN_DEPTHS[token.upper()]
    return False, None


def parse(reply, scale=4):
    """(depth, rationale) on the given scale: either is None where the reply
    does not give it.

    Each line is read without its markdown. The last DEPTH line that counts as
    an answer, and the last RATIONALE line with a non-empty value, answer:
    a judge that reconsiders writes its second answer after its first, a line
    that only starts with "Depth:" before arguing in prose is skipped rather
    than mistaken for a second answer, and an empty label reads the next
    non-blank line for its value. A last DEPTH line whose figure is refused
    gives no depth, and does not fall back to an earlier one; a trailing empty
    RATIONALE, with no line left to fall back to, does not blank one that
    already had text."""
    lines = (reply or "").splitlines()
    depth = rationale = None
    i, n = 0, len(lines)
    while i < n:
        plain = _plain(lines[i])
        answer = DEPTH_RE.match(plain)
        if answer:
            value = answer.group(1).strip()
            if not value:
                found = _next_nonempty(lines, i + 1)
                if found:
                    i, value = found
            counts, figure = _read_answer(value, scale)
            if counts:
                depth = figure
            i += 1
            continue
        answer = RATIONALE_RE.match(plain)
        if answer:
            value = answer.group(1).strip()
            if not value:
                found = _next_nonempty(lines, i + 1)
                if found:
                    i, value = found
            if value:
                rationale = value
            i += 1
            continue
        i += 1
    return depth, rationale
```

- [ ] **Step 5: Run the depth tests, then the whole engine suite**

Run: `python3 -m pytest engine/panel/test_depth_call.py -q`
Expected: every test passes, the 29 old ones and the 11 new ones.

Run: `python3 -m pytest engine -q`
Expected: the same pass count as on `develop` before this task (run `git stash; python3 -m pytest engine -q; git stash pop` first if you need the baseline), plus the 11 new tests. No other file calls `depth_call` with positional arguments beyond `retained`, so nothing else changes.

- [ ] **Step 6: Commit**

```bash
git add engine/panel/prompts/depth-v2.txt engine/panel/depth_call.py engine/panel/test_depth_call.py
git commit -F - <<'EOF'
feat: a depth call can be given on a scale of ten

depth_call takes a scale, 4 by default, so every caller composes and parses
exactly as before. On the scale of ten the prompt is depth-v2.txt, the levels
sit on the even numbers with odd values between them, a new top level asks
for three conditions, and the call carries the document's general rules for
conflicts in a block numbered R1, R2 and so on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7
EOF
```

---

### Task 2: The assessment of a whole document

**Files:**
- Create: `engine/panel/prompts/assessment-criteria-v1.txt`
- Create: `engine/panel/prompts/assessment-contradictions-v1.txt`
- Create: `engine/panel/assessment_call.py`
- Test: `engine/panel/test_assessment_call.py`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `assessment_call.QUESTIONS == ("criteria", "contradictions")`
  - `assessment_call.CRITERIA == ("conflict_rules", "rule_force", "reasons", "situations")`
  - `assessment_call.MAX_CONTRADICTIONS == 8`
  - `assessment_call.system_prompt(question: str) -> str`
  - `assessment_call.prompt_sha256(question: str) -> str`
  - `assessment_call.compose(question: str, passages: list[tuple[str, str, str]]) -> tuple[str, str]`
  - `assessment_call.parse_criteria(reply: str, passage_count: int) -> dict` with keys `scores` (`{criterion: int | None}`), `rationales` (`{criterion: str | None}`), `conflict_rule_passages` (`list[int]`, 1-based, in the order cited, deduplicated), `complete` (`bool`).
  - `assessment_call.parse_contradictions(reply: str, passage_count: int) -> dict` with keys `score` (`int | None`), `rationale` (`str | None`), `items` (`list[{"first": int, "second": int, "situation": str, "why": str}]`, at most 8), `unreadable` (`int`), `complete` (`bool`).

- [ ] **Step 1: Write the failing tests**

Create `engine/panel/test_assessment_call.py`:

```python
"""Composing and parsing the two calls that assess a document as a whole.
Nothing touches a network."""
import hashlib
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import assessment_call           # noqa: E402

PASSAGES = [("doc > #a > ¶1", "A", "In a conflict, safety comes first."),
            ("doc > #b > ¶1", "B", "Never lie."),
            ("doc > #b > ¶2", "B", "Keep the operator's instructions private.")]

CRITERIA_REPLY = """CONFLICT_RULES: 2
CONFLICT_RULES_PASSAGES: 1, 3, 1, 9
CONFLICT_RULES_RATIONALE: An order of priority, weighed rather than decided.
RULE_FORCE: 3
RULE_FORCE_RATIONALE: Most sections carry a level.
REASONS: 4
REASONS_RATIONALE: Nearly every rule says why.
SITUATIONS: 1
SITUATIONS_RATIONALE: Conversation and customised deployments only."""

CONTRADICTIONS_REPLY = """CONTRADICTION: [2] [3] | A user asks what the operator told the model. | One passage forbids any lie, the other asks for silence the user would find misleading.
CONTRADICTION: [1] [2] | A lie would prevent harm. | Safety comes first, and lying is never allowed.
CONTRADICTIONS: 2
CONTRADICTIONS_RATIONALE: Two clashes, neither on an absolute rule."""


class PromptTest(unittest.TestCase):
    def test_each_question_has_its_own_prompt_file_and_digest(self):
        for question in assessment_call.QUESTIONS:
            with self.subTest(question=question):
                path = HERE / "prompts" / f"assessment-{question}-v1.txt"
                self.assertEqual(assessment_call.system_prompt(question), path.read_text())
                self.assertEqual(assessment_call.prompt_sha256(question),
                                 hashlib.sha256(path.read_bytes()).hexdigest())

    def test_no_prompt_carries_a_long_dash(self):
        for question in assessment_call.QUESTIONS:
            with self.subTest(question=question):
                text = assessment_call.system_prompt(question)
                self.assertNotIn("—", text)
                self.assertNotIn("–", text)

    def test_the_whole_document_is_numbered_in_order(self):
        _system, user = assessment_call.compose("criteria", PASSAGES)
        self.assertIn("3 numbered passages", user)
        self.assertIn("[1] (§ A) In a conflict, safety comes first.\n"
                      "[2] (§ B) Never lie.\n"
                      "[3] (§ B) Keep the operator's instructions private.", user)

    def test_an_unknown_question_is_refused(self):
        with self.assertRaises(KeyError):
            assessment_call.compose("everything", PASSAGES)


class ParseCriteriaTest(unittest.TestCase):
    def test_a_well_formed_reply(self):
        parsed = assessment_call.parse_criteria(CRITERIA_REPLY, len(PASSAGES))
        self.assertEqual(parsed["scores"], {"conflict_rules": 2, "rule_force": 3,
                                            "reasons": 4, "situations": 1})
        self.assertEqual(parsed["rationales"]["reasons"], "Nearly every rule says why.")
        # Out of range (9) is dropped, a repeat (1) is kept once, order is kept.
        self.assertEqual(parsed["conflict_rule_passages"], [1, 3])
        self.assertTrue(parsed["complete"])

    def test_markdown_around_the_labels_is_read_through(self):
        reply = "**CONFLICT_RULES:** 2\n- RULE_FORCE: **3**\n`REASONS: 4`\n1. SITUATIONS: 0"
        self.assertEqual(assessment_call.parse_criteria(reply, 3)["scores"],
                         {"conflict_rules": 2, "rule_force": 3, "reasons": 4, "situations": 0})

    def test_a_score_off_the_scale_is_not_a_score(self):
        parsed = assessment_call.parse_criteria(CRITERIA_REPLY.replace("REASONS: 4", "REASONS: 5"), 3)
        self.assertIsNone(parsed["scores"]["reasons"])
        self.assertFalse(parsed["complete"])

    def test_a_denominator_or_a_parenthetical_still_answers(self):
        reply = "CONFLICT_RULES: 3/4\nRULE_FORCE: 2 of 4\nREASONS: 1 (some reasons)\nSITUATIONS: 4."
        self.assertEqual(assessment_call.parse_criteria(reply, 3)["scores"],
                         {"conflict_rules": 3, "rule_force": 2, "reasons": 1, "situations": 4})

    def test_prose_after_a_label_does_not_blank_a_score(self):
        reply = CRITERIA_REPLY + "\nREASONS: the reasons are mostly given in commentary."
        self.assertEqual(assessment_call.parse_criteria(reply, 3)["scores"]["reasons"], 4)

    def test_no_passages_cited(self):
        reply = CRITERIA_REPLY.replace("CONFLICT_RULES_PASSAGES: 1, 3, 1, 9",
                                       "CONFLICT_RULES_PASSAGES: none")
        self.assertEqual(assessment_call.parse_criteria(reply, 3)["conflict_rule_passages"], [])

    def test_an_empty_reply_gives_nothing(self):
        parsed = assessment_call.parse_criteria("", 3)
        self.assertEqual(set(parsed["scores"].values()), {None})
        self.assertFalse(parsed["complete"])


class ParseContradictionsTest(unittest.TestCase):
    def test_a_well_formed_reply(self):
        parsed = assessment_call.parse_contradictions(CONTRADICTIONS_REPLY, len(PASSAGES))
        self.assertEqual(parsed["score"], 2)
        self.assertEqual(parsed["rationale"], "Two clashes, neither on an absolute rule.")
        self.assertEqual([(i["first"], i["second"]) for i in parsed["items"]], [(2, 3), (1, 2)])
        self.assertEqual(parsed["items"][1]["situation"], "A lie would prevent harm.")
        self.assertEqual(parsed["unreadable"], 0)
        self.assertTrue(parsed["complete"])

    def test_none_found(self):
        parsed = assessment_call.parse_contradictions(
            "CONTRADICTION: none\nCONTRADICTIONS: 4\nCONTRADICTIONS_RATIONALE: None found.", 3)
        self.assertEqual((parsed["score"], parsed["items"], parsed["unreadable"]), (4, [], 0))

    def test_an_item_that_does_not_name_two_passages_is_unreadable(self):
        reply = ("CONTRADICTION: [2] | only one passage | why\n"
                 "CONTRADICTION: [2] [2] | the same passage twice | why\n"
                 "CONTRADICTION: [2] [7] | a passage that does not exist | why\n"
                 "CONTRADICTION: [1] [2] no separators at all\n"
                 "CONTRADICTIONS: 3")
        parsed = assessment_call.parse_contradictions(reply, 3)
        self.assertEqual((parsed["items"], parsed["unreadable"]), ([], 4))

    def test_no_more_than_eight_are_kept(self):
        reply = "\n".join(f"CONTRADICTION: [1] [2] | situation {n} | why" for n in range(12))
        parsed = assessment_call.parse_contradictions(reply + "\nCONTRADICTIONS: 0", 3)
        self.assertEqual(len(parsed["items"]), assessment_call.MAX_CONTRADICTIONS)

    def test_a_missing_score_is_incomplete(self):
        parsed = assessment_call.parse_contradictions("CONTRADICTION: none", 3)
        self.assertIsNone(parsed["score"])
        self.assertFalse(parsed["complete"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `python3 -m pytest engine/panel/test_assessment_call.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'assessment_call'`.

- [ ] **Step 3: Write the two prompts**

Create `engine/panel/prompts/assessment-criteria-v1.txt` (ends with a newline):

```text
You are assessing an AI alignment document (a model constitution or a model spec) as a whole, so that a reader can see how well it is built as a set of rules for a model's behaviour. You are given the complete document as numbered passages, in order, each with its section path. Read all of it before you answer.

Score four criteria, each on a scale from 0 to 4. The descriptions at 0, 2 and 4 are the levels, and 1 and 3 mean between the two levels around them. When in doubt between two values, give the lower. Judge only what the document says, not what its authors may intend or do elsewhere.

CONFLICT_RULES: what the document says, in general, when two of its own rules conflict.
0 = nothing.
2 = an order of priority between its rules, or an instruction to settle conflicts by judgement or by the document's spirit, without saying who wins in a given case.
4 = an order that decides who wins, a rule for two rules of the same rank, and examples of the order applied.
Also list the numbers of the passages that state these general rules. Count only passages about conflicts between the document's own rules or between levels of instruction, not passages about a single behaviour.

RULE_FORCE: whether a reader can tell, for each rule, if it is absolute or a default that can be changed, and by whom.
0 = the document does not separate absolute rules from defaults.
2 = it lists its absolute rules, or labels some sections, but for much of the text a reader cannot tell a rule from a hope or an explanation.
4 = every rule carries its force, including who may change it, and commentary is marked apart from instruction.

REASONS: whether the rules say why they exist.
0 = rules are stated without reasons.
2 = some rules carry a reason, typically the most restrictive ones.
4 = nearly every rule that constrains the model says why, in terms specific enough to decide a case the document does not show.

SITUATIONS: whether the document has rules for the situations in which the model is used. Six are checked:
1. ordinary conversation;
2. actions the model takes on its own with tools, such as sending, buying or deleting;
3. images, audio and video;
4. users who may be minors;
5. other AI agents, as the model's principals or as the party it deals with;
6. deployments a business has customised.
0 = ordinary conversation only.
2 = some of the six have rules of their own, or all six are named and most have none.
4 = all six have rules of their own.

Answer with exactly these nine lines and nothing else:
CONFLICT_RULES: <0 to 4>
CONFLICT_RULES_PASSAGES: <passage numbers separated by commas, or none>
CONFLICT_RULES_RATIONALE: <one sentence>
RULE_FORCE: <0 to 4>
RULE_FORCE_RATIONALE: <one sentence>
REASONS: <0 to 4>
REASONS_RATIONALE: <one sentence>
SITUATIONS: <0 to 4>
SITUATIONS_RATIONALE: <one sentence naming which of the six situations have rules of their own>
```

Create `engine/panel/prompts/assessment-contradictions-v1.txt` (ends with a newline):

```text
You are checking an AI alignment document (a model constitution or a model spec) for contradictions it leaves unresolved. You are given the complete document as numbered passages, in order, each with its section path. Read all of it before you answer.

A contradiction here is two passages of the same document that, applied to one concrete situation, require responses that cannot both be given, with nothing in the document saying which prevails. An example counts as a passage: an example whose approved response breaks a rule stated elsewhere in the document is a contradiction.

These are not contradictions:
- a conflict the document names and settles, including one settled by its general order of priority;
- a rule and an exception the document states for it;
- a default and an instruction the document allows to change it;
- content the model produces as a role, a story or a requested argument, where the document says such content is not the model's own assertion.

Report at most eight, the most serious first. Seriousness is how directly the two passages clash and how important the rules are. A clash that involves a rule the document calls absolute (a hard constraint, a root-level rule, a red line, or anything it says can never be overridden) is the most serious.

Then score the document on a scale from 0 to 4. The descriptions at 0, 2 and 4 are the levels, and 1 and 3 mean between the two levels around them. When in doubt between two values, give the lower.
0 = three or more, or any that involves a rule the document calls absolute.
2 = one or two, neither involving an absolute rule.
4 = none found.

Answer in this form and nothing else. One line per contradiction:
CONTRADICTION: [first passage number] [second passage number] | <the concrete situation, in one sentence> | <why the two cannot both be followed, in one sentence>
If you found none, write the single line CONTRADICTION: none
Then these two lines:
CONTRADICTIONS: <0 to 4>
CONTRADICTIONS_RATIONALE: <one sentence>
```

- [ ] **Step 4: Write `engine/panel/assessment_call.py`**

```python
"""The assessment of a document as a whole: composing its two calls and parsing
their replies.

The criteria are those of
docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md.
One call scores four of them. The other searches the document for contradictions
it leaves unresolved, which is a long, careful read with a list for an answer, so
it is asked on its own. Both read the whole document as numbered passages, the
way a passage call does, so a reply cites passages by number and the numbers
resolve to locators."""

import hashlib
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROMPTS = {"criteria": HERE / "prompts" / "assessment-criteria-v1.txt",
           "contradictions": HERE / "prompts" / "assessment-contradictions-v1.txt"}
QUESTIONS = tuple(PROMPTS)
CRITERIA = ("conflict_rules", "rule_force", "reasons", "situations")
MAX_CONTRADICTIONS = 8

ASK = {"criteria": "Answer with the nine lines the instructions give.",
       "contradictions": "Answer in the form the instructions give."}

# A labelled line, once its markdown is gone. The labels are the prompts' own.
LABEL_RE = re.compile(r"^([A-Za-z_]+)\s*:(.*)$")
LIST_MARKER_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
# Emphasis and code spans. An underscore inside a word is not emphasis, which is
# what keeps CONFLICT_RULES whole.
MARKUP_RE = re.compile(r"[*`]+|(?<!\w)_+|_+(?!\w)")
# A score: one figure from 0 to 4, then nothing but a denominator of four, bare
# punctuation or a parenthetical. 2.5 and 5 are refused.
SCORE_RE = re.compile(
    r"^([0-4])(?:\s*/\s*4|\s+of\s+4)?\s*[.,;:!?]*\s*(?:\([^()]*\))?\s*[.,;:!?]*$",
    re.IGNORECASE)


def system_prompt(question):
    return PROMPTS[question].read_text()


def prompt_sha256(question):
    return hashlib.sha256(PROMPTS[question].read_bytes()).hexdigest()


def compose(question, passages):
    """(system, user): the question's prompt, then the whole document numbered
    in order."""
    system = system_prompt(question)
    body = "\n".join(f"[{i + 1}] (§ {section}) {text}"
                     for i, (_locator, section, text) in enumerate(passages))
    user = (f"The complete document, as {len(passages)} numbered passages in order:\n"
            f"{body}\n\n{ASK[question]}")
    return system, user


def _labelled(reply):
    """(LABEL, value) for every labelled line of a reply, in order."""
    out = []
    for raw in (reply or "").splitlines():
        plain = MARKUP_RE.sub("", LIST_MARKER_RE.sub("", raw, count=1)).strip()
        match = LABEL_RE.match(plain)
        if match:
            out.append((match.group(1).upper(), match.group(2).strip()))
    return out


def _score(value):
    match = SCORE_RE.match(value)
    return int(match.group(1)) if match else None


def _passage_numbers(value, passage_count):
    """The passage numbers a value names, in range, first mention only."""
    seen = []
    for token in re.findall(r"\d+", value or ""):
        number = int(token)
        if 1 <= number <= passage_count and number not in seen:
            seen.append(number)
    return seen


def parse_criteria(reply, passage_count):
    """Scores, rationales and the passages cited as general conflict rules.

    The last line for a label answers. A line whose value does not start with a
    figure is prose and is read through, so it cannot blank an earlier score; a
    figure off the scale is refused and gives no score."""
    scores = {criterion: None for criterion in CRITERIA}
    rationales = {criterion: None for criterion in CRITERIA}
    cited = []
    for label, value in _labelled(reply):
        key = label.lower()
        if key in scores:
            if re.match(r"\d", value):
                scores[key] = _score(value)
        elif key.endswith("_rationale") and key[:-len("_rationale")] in rationales:
            if value:
                rationales[key[:-len("_rationale")]] = value
        elif key == "conflict_rules_passages":
            cited = _passage_numbers(value, passage_count)
    return {"scores": scores, "rationales": rationales,
            "conflict_rule_passages": cited,
            "complete": all(score is not None for score in scores.values())}


def parse_contradictions(reply, passage_count):
    """The contradictions listed, the score and its rationale.

    An item must name exactly two different passages that exist, then a
    situation and a reason, separated by bars. One that does not is counted as
    unreadable rather than guessed at. At most MAX_CONTRADICTIONS are kept, in
    the order given, which the prompt asks to be most serious first."""
    items, unreadable = [], 0
    score = rationale = None
    for label, value in _labelled(reply):
        if label == "CONTRADICTION":
            if value.lower().rstrip(".") == "none":
                continue
            parts = [part.strip() for part in value.split("|")]
            numbers = (_passage_numbers(parts[0], passage_count)
                       if len(re.findall(r"\d+", parts[0])) == 2 else [])
            if len(parts) != 3 or len(numbers) != 2 or not parts[1] or not parts[2]:
                unreadable += 1
                continue
            items.append({"first": numbers[0], "second": numbers[1],
                          "situation": parts[1], "why": parts[2]})
        elif label == "CONTRADICTIONS":
            if re.match(r"\d", value):
                score = _score(value)
        elif label == "CONTRADICTIONS_RATIONALE" and value:
            rationale = value
    return {"score": score, "rationale": rationale,
            "items": items[:MAX_CONTRADICTIONS], "unreadable": unreadable,
            "complete": score is not None}
```

Note on `parse_contradictions`: `[2] [2]` names two figures but one passage, and `[2] [7]` names two figures of which one is out of range; both reduce to one number and are unreadable. `[2]` alone names one figure and is unreadable.

- [ ] **Step 5: Run the tests**

Run: `python3 -m pytest engine/panel/test_assessment_call.py -q`
Expected: all 16 tests pass.

- [ ] **Step 6: Commit**

```bash
git add engine/panel/prompts/assessment-criteria-v1.txt engine/panel/prompts/assessment-contradictions-v1.txt engine/panel/assessment_call.py engine/panel/test_assessment_call.py
git commit -F - <<'EOF'
feat: two calls assess a document as a whole

One scores conflict rules, the force of each rule, the reasons given and the
situations covered, 0 to 4 each, and cites the passages that state the
document's general rules for conflicts. The other lists up to eight
contradictions the document leaves unresolved and scores them. Both read the
whole document as numbered passages.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7
EOF
```

---

### Task 3: The pilot runner

**Files:**
- Create: `engine/pilot_scale_ten.py`
- Test: `engine/test_pilot_scale_ten.py`
- Modify: `engine/README.md` (one line)

**Interfaces:**
- Consumes: from Task 1, `depth_call.compose(..., scale=10, conflict_rules=...)`, `depth_call.parse(reply, scale=10)`, `depth_call.prompt_sha256(10)`, `depth_call.system_prompt(10)`, `depth_call.NOTHING_RETAINED`. From Task 2, `assessment_call.QUESTIONS`, `compose`, `parse_criteria`, `parse_contradictions`, `prompt_sha256`, `system_prompt`. From the existing engine: `index_store.current_publication(store)`, `index_store.install_registry(store)`, `index_store.judging_registry(store)`, `bands.shown_by_default(votes)`, `batch_job.cost_of(tag, usage, config)`, `batch_job.call_openrouter`, `whole_doc.judge_kwargs(tag, model_id, config)`, `h.resolve(tag, config)`, `h.passages(spec, version)`, `h.load_config()`, `store.Store.from_env()`.
- Produces:
  - `pilot_scale_ten.run_pilot(store, config, registry, passages_for, out_dir, call_model=None, go=False, documents=DOCUMENTS, behaviours=BEHAVIOURS, panel=PANEL) -> tuple[float, Path | None]`
  - `pilot_scale_ten.conflict_rules(criteria_by_seat: dict, passages: list, quorum: int = 2) -> list`
  - `pilot_scale_ten.summary(results: dict) -> str`
  - Files in `<out_dir>/<stamp>-pilot-scale-ten/`: `pilot.json`, `summary.md`, and per document a folder `<document id with @ as _>/` holding `<seat>.<question>.reply.txt` and `<slug>.<model>.depth.reply.txt`.

- [ ] **Step 1: Write the failing tests**

Create `engine/test_pilot_scale_ten.py`:

```python
"""The pilot, against tables in memory and a model that answers from a script.

Nothing touches a network, and nothing may write to the store: FakeStore has no
insert and no update, so a write would fail the test with AttributeError."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
# Keys stay out of it: resolve() reads a .env beside the harness unless told not to.
os.environ["PANEL_DOTENV"] = str(ROOT / "no-such.env")
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "panel"))
sys.path.insert(0, str(HERE / "spec-cite"))
sys.path.insert(0, str(ROOT / "tests" / "fixtures"))

import assessment_call           # noqa: E402
import depth_call                # noqa: E402
import index as fixture          # noqa: E402
import pilot_scale_ten as pilot  # noqa: E402


class FakeStore:
    """Tables in memory, honouring the `eq.` and `in.(...)` filters."""

    def __init__(self, **tables):
        self.tables = tables

    def select(self, table, params=None):
        rows = self.tables.get(table, [])
        for column, condition in (params or {}).items():
            operator, _, value = condition.partition(".")
            if operator == "eq":
                rows = [row for row in rows if str(row.get(column)) == value]
            elif operator == "in":
                wanted = {v.strip('"') for v in value[1:-1].split(",")}
                rows = [row for row in rows if str(row.get(column)) in wanted]
        return rows


DOC = "lab--spec@2026-01-01"
PASSAGES = [(f"{DOC} > #a > ¶1", "A", "In a conflict, safety comes first."),
            (f"{DOC} > #b > ¶1", "B", "Never lie."),
            (f"{DOC} > #b > ¶2", "B", "Keep the operator's instructions private.")]
SLUG = "defined-behaviour"
JUDGES = ("deepseek", "fable", "sol")


def store():
    return FakeStore(
        aci_publications=[{"id": "pub", "is_public": True, "published_at": "2026-09-16"}],
        aci_publication_cells=[{"publication_id": "pub", "behaviour_slug": SLUG,
                                "spec_version_id": "v", "run_id": "run"}],
        aci_spec_versions=[{"id": "v", "spec_id": "lab--spec", "version": "2026-01-01"}],
        aci_judge_calls=[{"id": f"c-{m}", "run_id": "run", "behaviour_slug": SLUG,
                          "spec_version_id": "v", "model": m, "status": "done"}
                         for m in JUDGES],
        # Every judge scores the second passage 3 and the others 0, so the second
        # passage is the only one the reader shows, and the only one retained.
        aci_judgements=[{"call_id": f"c-{m}", "locator": locator,
                         "verdict": 3 if locator == PASSAGES[1][0] else 0, "parsed": True}
                        for m in JUDGES for locator, _s, _t in PASSAGES],
        aci_depths=[{"call_id": "c-deepseek", "status": "done", "depth": 3},
                    {"call_id": "c-fable", "status": "done", "depth": 4},
                    {"call_id": "c-sol", "status": "done", "depth": 4}])


class Scripted:
    """A model that answers from a script and remembers what it was asked."""

    def __init__(self, refuse=()):
        self.asked = []
        self.refuse = set(refuse)

    def __call__(self, provider, model_id, system, user, kwargs):
        self.asked.append((model_id, system, user))
        if system == assessment_call.system_prompt("criteria"):
            if any(tag in model_id for tag in self.refuse):
                raise RuntimeError("content_filter")
            reply = ("CONFLICT_RULES: 2\nCONFLICT_RULES_PASSAGES: 1\n"
                     "CONFLICT_RULES_RATIONALE: An order, weighed.\n"
                     "RULE_FORCE: 3\nRULE_FORCE_RATIONALE: Labels.\n"
                     "REASONS: 2\nREASONS_RATIONALE: Some.\n"
                     "SITUATIONS: 1\nSITUATIONS_RATIONALE: Conversation.")
        elif system == assessment_call.system_prompt("contradictions"):
            reply = ("CONTRADICTION: [2] [3] | A user asks what the operator said. "
                     "| Honesty and privacy clash.\n"
                     "CONTRADICTIONS: 2\nCONTRADICTIONS_RATIONALE: One clash.")
        else:
            assert system == depth_call.system_prompt(10), "an unexpected prompt"
            reply = "DEPTH: 9\nRATIONALE: Demonstrated, a conflict settled, no default."
        return reply, {"prompt_tokens": 1000, "completion_tokens": 100}, "stop", 0.1


def passages_for(spec, version):
    assert (spec, version) == ("lab--spec", "2026-01-01")
    return PASSAGES


class PilotTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = pilot.h.load_config()
        cls.registry = fixture.judging_registry()

    def go(self, model, out):
        return pilot.run_pilot(store(), self.config, self.registry, passages_for, out,
                               call_model=model, go=True, documents=(DOC,),
                               behaviours=(SLUG,))

    def test_pricing_spends_nothing_and_writes_nothing(self):
        model = Scripted()
        with tempfile.TemporaryDirectory() as out:
            estimate, folder = pilot.run_pilot(store(), self.config, self.registry,
                                               passages_for, out, call_model=model,
                                               documents=(DOC,), behaviours=(SLUG,))
            self.assertIsNone(folder)
            self.assertGreater(estimate, 0)
            self.assertEqual(model.asked, [])
            self.assertEqual(list(Path(out).iterdir()), [])

    def test_every_seat_answers_both_questions_and_every_judge_gives_a_depth(self):
        model = Scripted()
        with tempfile.TemporaryDirectory() as out:
            self.go(model, out)
        systems = [system for _m, system, _u in model.asked]
        self.assertEqual(systems.count(assessment_call.system_prompt("criteria")), 3)
        self.assertEqual(systems.count(assessment_call.system_prompt("contradictions")), 3)
        self.assertEqual(systems.count(depth_call.system_prompt(10)), 3)

    def test_the_rules_are_the_passages_two_judges_cited_and_the_depth_call_carries_them(self):
        model = Scripted()
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(model, out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
        self.assertEqual(results["documents"][DOC]["conflict_rules"], [PASSAGES[0][0]])
        depth_users = [user for _m, system, user in model.asked
                       if system == depth_call.system_prompt(10)]
        for user in depth_users:
            self.assertIn("[R1] (§ A) In a conflict, safety comes first.", user)
            self.assertIn("[1] (§ B) Never lie.", user)
            self.assertNotIn("Keep the operator's instructions private.", user)

    def test_the_old_depths_are_read_beside_the_new_and_contradictions_named_by_locator(self):
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(Scripted(), out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
            self.assertTrue((folder / "summary.md").exists())
            self.assertTrue((folder / "lab--spec_2026-01-01" / "sol.criteria.reply.txt").exists())
        cell = results["documents"][DOC]["cells"][SLUG]
        self.assertEqual(cell["old"], {"deepseek": 3, "fable": 4, "sol": 4})
        self.assertEqual({tag: given["depth"] for tag, given in cell["new"].items()},
                         {"deepseek": 9, "fable": 9, "sol": 9})
        item = results["documents"][DOC]["assessment"]["sol"]["contradictions"]["items"][0]
        self.assertEqual((item["first"], item["second"]), (PASSAGES[1][0], PASSAGES[2][0]))
        self.assertEqual(results["prompts"]["depth"], depth_call.prompt_sha256(10))

    def test_a_refused_call_is_recorded_and_the_others_go_on(self):
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(Scripted(refuse=("fable",)), out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
        record = results["documents"][DOC]
        self.assertIn("content_filter", record["assessment"]["fable"]["criteria"]["error"])
        # Two seats still cited the first passage, which is the quorum.
        self.assertEqual(record["conflict_rules"], [PASSAGES[0][0]])

    def test_the_summary_has_no_long_dash(self):
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(Scripted(), out)
            text = (folder / "summary.md").read_text()
        self.assertIn("| Conflict rules | 2 | 2 | 2 |", text)
        self.assertIn("Odd values: 3 of 3 depths out of ten.", text)
        self.assertNotIn("—", text)
        self.assertNotIn("–", text)


class ConflictRulesTest(unittest.TestCase):
    def test_a_passage_needs_the_quorum(self):
        by_seat = {"a": {"conflict_rule_passages": [1, 2]},
                   "b": {"conflict_rule_passages": [2, 3]},
                   "c": {"conflict_rule_passages": [3]}}
        self.assertEqual(pilot.conflict_rules(by_seat, PASSAGES), [PASSAGES[1], PASSAGES[2]])
        self.assertEqual(pilot.conflict_rules(by_seat, PASSAGES, quorum=3), [])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `python3 -m pytest engine/test_pilot_scale_ten.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'pilot_scale_ten'`.

- [ ] **Step 3: Write `engine/pilot_scale_ten.py`**

```python
#!/usr/bin/env python3
"""A pilot of depth out of ten, and of the assessment of a document as a whole.

    python3 engine/pilot_scale_ten.py         # prices it, spends nothing
    python3 engine/pilot_scale_ten.py --go    # spends

It reads the database and writes nothing to it. Everything lands in artefacts/,
in a folder of its own: every reply as it came back, what was made of it in
pilot.json, and a summary.md a person can read in one sitting. The design it
tests is
docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md,
and it answers the design's two questions: whether judges use odd values as a
way of not choosing, and whether the contradictions they list hold up.

Each document is assessed in full first, because a depth on the new scale is
given with its document's general rules for conflicts, and those are the
passages at least two judges cited as such. Then each behaviour gets a depth out
of ten from the judges of its cell's published run, over the passages that run
retained, so the new figure reads beside the old one.
"""

import argparse
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "panel"))
sys.path.insert(0, str(HERE / "spec-cite"))

import assessment_call           # noqa: E402
import bands                     # noqa: E402
import batch_job                 # noqa: E402
import depth_call                # noqa: E402
import index_store               # noqa: E402
import whole_doc                 # noqa: E402

_spec = importlib.util.spec_from_file_location("h", HERE / "panel" / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

DOCUMENTS = ("anthropic--constitution@2026-01-20", "openai--model-spec@2026-08-18")
BEHAVIOURS = ("honesty-and-non-deception", "no-sycophancy",
              "instruction-hierarchy-conformance", "harm-avoidance-to-third-parties")
PANEL = "frontier_fast"
QUORUM = 2
CHARS_PER_TOKEN = 4
# Output allowances for the price, generous because sol's reasoning is billed as
# output, and a price that comes in low is the one that surprises.
OUTPUT_TOKENS = {"criteria": 4000, "contradictions": 8000, "depth": 1000}
# The rules block a depth call will carry, priced before anyone has cited it.
RULES_ALLOWANCE_CHARS = 4000
LABELS = {"conflict_rules": "Conflict rules", "contradictions": "Unresolved contradictions",
          "rule_force": "Force of each rule", "reasons": "Reasons given",
          "situations": "Situations covered"}


def now():
    return datetime.now(timezone.utc).isoformat()


def split_document(document_id):
    spec_id, _, version = document_id.partition("@")
    return spec_id, version


def conflict_rules(criteria_by_seat, passages, quorum=QUORUM):
    """The passages at least `quorum` seats cited as the document's general rules
    for conflicts, in document order. A seat whose criteria call failed cited
    nothing, so it cannot help a passage reach the quorum."""
    counts = {}
    for parsed in criteria_by_seat.values():
        for number in set(parsed.get("conflict_rule_passages") or []):
            counts[number] = counts.get(number, 0) + 1
    return [passages[number - 1] for number in sorted(counts) if counts[number] >= quorum]


def cell_evidence(store, publication_id, slug, version_id, passages):
    """(retained passages, the cell's done calls, their depths out of four by model).

    The retained passages are chosen as batch_job.pending_depths chooses them,
    from the published run's parsed judgements, so the new depth reads the same
    evidence the published one did."""
    selected = store.select("aci_publication_cells", {
        "publication_id": f"eq.{publication_id}", "behaviour_slug": f"eq.{slug}",
        "spec_version_id": f"eq.{version_id}"})
    if not selected:
        raise SystemExit(f"the public publication carries no cell {slug} on {version_id}")
    calls = store.select("aci_judge_calls", {
        "run_id": f"eq.{selected[0]['run_id']}", "behaviour_slug": f"eq.{slug}",
        "spec_version_id": f"eq.{version_id}", "status": "eq.done"})
    if not calls:
        raise SystemExit(f"the published run of {slug} on {version_id} has no done call")
    model_of = {call["id"]: call["model"] for call in calls}
    ids = "in.(" + ",".join(f'"{call_id}"' for call_id in model_of) + ")"
    votes = {}
    for row in store.select("aci_judgements", {"call_id": ids}):
        if row.get("parsed", True):
            votes.setdefault(row["locator"], {})[model_of[row["call_id"]]] = row["verdict"]
    shown = set(bands.shown_by_default(votes))
    old = {model_of[row["call_id"]]: row["depth"]
           for row in store.select("aci_depths", {"call_id": ids})
           if row.get("status") == "done"}
    return ([passage for passage in passages if passage[0] in shown],
            sorted(calls, key=lambda call: call["model"]), old)


def ask(tag, system, user, config, call_model):
    """One call, and what it cost. A refusal is raised to the caller, which
    records it and goes on."""
    provider, model_id = h.resolve(tag, config)
    reply, usage, finish_reason, seconds = call_model(
        provider=provider, model_id=model_id, system=system, user=user,
        kwargs=whole_doc.judge_kwargs(tag, model_id, config))
    return {"reply": reply or "", "usage": usage, "finish_reason": finish_reason,
            "seconds": seconds, "cost_usd": batch_job.cost_of(tag, usage, config)}


def priced(tag, system, user, output_tokens, config):
    usage = {"prompt_tokens": (len(system) + len(user)) // CHARS_PER_TOKEN,
             "completion_tokens": output_tokens}
    return batch_job.cost_of(tag, usage, config) or 0.0


def _costs(results):
    for record in results["documents"].values():
        for questions in record["assessment"].values():
            for answer in questions.values():
                if answer.get("cost_usd") is not None:
                    yield answer["cost_usd"]
        for cell in record["cells"].values():
            for given in cell["new"].values():
                if given.get("cost_usd") is not None:
                    yield given["cost_usd"]


def run_pilot(store, config, registry, passages_for, out_dir, call_model=None,
              go=False, documents=DOCUMENTS, behaviours=BEHAVIOURS, panel=PANEL):
    """Price the pilot and, with `go`, run it. Returns (the price in dollars, the
    folder written, or None when nothing was run)."""
    seats = config["panels"][panel]
    publication = index_store.current_publication(store)
    if publication is None:
        raise SystemExit("no public publication to take the cells from")
    versions = {f"{row['spec_id']}@{row['version']}": row
                for row in store.select("aci_spec_versions")}
    missing = [document for document in documents if document not in versions]
    if missing:
        raise SystemExit(f"no such document: {', '.join(missing)}")

    passages = {document: passages_for(*split_document(document)) for document in documents}
    evidence = {(document, slug): cell_evidence(store, publication["id"], slug,
                                                versions[document]["id"], passages[document])
                for document in documents for slug in behaviours}

    estimate = 0.0
    for document in documents:
        for question in assessment_call.QUESTIONS:
            system, user = assessment_call.compose(question, passages[document])
            estimate += sum(priced(seat, system, user, OUTPUT_TOKENS[question], config)
                            for seat in seats)
    for (_document, slug), (retained, calls, _old) in evidence.items():
        system, user = depth_call.compose(slug, registry, retained, scale=10)
        for call in calls:
            estimate += priced(call["model"], system, user + " " * RULES_ALLOWANCE_CHARS,
                               OUTPUT_TOKENS["depth"], config)
    estimate = round(estimate, 2)
    if not go:
        return estimate, None
    call_model = call_model or batch_job.call_openrouter

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    folder = Path(out_dir) / f"{stamp}-pilot-scale-ten"
    folder.mkdir(parents=True, exist_ok=True)
    results = {"started_at": now(), "publication": publication["id"],
               "estimate_usd": estimate,
               "prompts": {"depth": depth_call.prompt_sha256(10),
                           **{question: assessment_call.prompt_sha256(question)
                              for question in assessment_call.QUESTIONS}},
               "documents": {}}

    for document in documents:
        here = folder / document.replace("@", "_")
        here.mkdir(exist_ok=True)
        text = passages[document]
        record = results["documents"][document] = {"assessment": {}, "cells": {}}
        criteria_by_seat = {}
        for seat in seats:
            record["assessment"][seat] = {}
            for question in assessment_call.QUESTIONS:
                print(f"  {seat} assessing {document}: {question} ...", flush=True)
                system, user = assessment_call.compose(question, text)
                try:
                    answer = ask(seat, system, user, config, call_model)
                except Exception as refused:          # noqa: BLE001
                    record["assessment"][seat][question] = {"error": str(refused)[:1000]}
                    continue
                (here / f"{seat}.{question}.reply.txt").write_text(answer["reply"],
                                                                  encoding="utf-8")
                if question == "criteria":
                    parsed = assessment_call.parse_criteria(answer["reply"], len(text))
                    criteria_by_seat[seat] = parsed
                    parsed = dict(parsed, conflict_rule_passages=[
                        text[number - 1][0] for number in parsed["conflict_rule_passages"]])
                else:
                    parsed = assessment_call.parse_contradictions(answer["reply"], len(text))
                    parsed = dict(parsed, items=[
                        dict(item, first=text[item["first"] - 1][0],
                             second=text[item["second"] - 1][0])
                        for item in parsed["items"]])
                record["assessment"][seat][question] = dict(
                    parsed, cost_usd=answer["cost_usd"], finish_reason=answer["finish_reason"])
        rules = conflict_rules(criteria_by_seat, text)
        record["conflict_rules"] = [locator for locator, _section, _text in rules]

        for slug in behaviours:
            retained, calls, old = evidence[(document, slug)]
            cell = record["cells"][slug] = {"passages": len(retained), "old": old, "new": {}}
            if not retained:
                cell["new"] = {call["model"]: {"depth": 0,
                                               "rationale": depth_call.NOTHING_RETAINED}
                               for call in calls}
                continue
            system, user = depth_call.compose(slug, registry, retained, scale=10,
                                              conflict_rules=rules)
            for call in calls:
                tag = call["model"]
                print(f"  {tag} giving {slug} on {document} a depth out of ten ...", flush=True)
                try:
                    answer = ask(tag, system, user, config, call_model)
                except Exception as refused:          # noqa: BLE001
                    cell["new"][tag] = {"error": str(refused)[:1000]}
                    continue
                (here / f"{slug}.{tag}.depth.reply.txt").write_text(answer["reply"],
                                                                   encoding="utf-8")
                depth, rationale = depth_call.parse(answer["reply"], scale=10)
                cell["new"][tag] = {"depth": depth, "rationale": rationale,
                                    "cost_usd": answer["cost_usd"],
                                    "finish_reason": answer["finish_reason"]}

    results["finished_at"] = now()
    results["cost_usd"] = round(sum(_costs(results)), 6)
    (folder / "pilot.json").write_text(json.dumps(results, indent=2, ensure_ascii=False),
                                       encoding="utf-8")
    (folder / "summary.md").write_text(summary(results), encoding="utf-8")
    return estimate, folder


def _score_of(answers, criterion):
    question = "contradictions" if criterion == "contradictions" else "criteria"
    answer = answers.get(question, {})
    if "error" in answer:
        return "error"
    value = (answer.get("score") if criterion == "contradictions"
             else answer.get("scores", {}).get(criterion))
    return "no answer" if value is None else str(value)


def _cell_text(value):
    return str(value).replace("|", "/").replace("\n", " ")


def summary(results):
    """The pilot, for a person to read: per document, the five criteria by
    judge, the general conflict rules, every contradiction listed, and each
    depth out of ten beside the published depth out of four, doubled."""
    lines = ["# Pilot: depth out of ten, and the document as a whole", "",
             f"Publication read: `{results['publication']}`. Started "
             f"{results['started_at']}, finished {results['finished_at']}. Priced at "
             f"{results['estimate_usd']} dollars, cost {results['cost_usd']} dollars.", "",
             "Prompts: " + ", ".join(f"{name} `{sha[:8]}`"
                                    for name, sha in results["prompts"].items()) + "."]
    odd = given_count = 0
    for document, record in results["documents"].items():
        seats = list(record["assessment"])
        lines += ["", f"## {document}", "", "### The document as a whole", "",
                  "| Criterion | " + " | ".join(seats) + " |",
                  "|---|" + "---|" * len(seats)]
        for criterion in ("conflict_rules", "contradictions", "rule_force", "reasons",
                          "situations"):
            lines.append(f"| {LABELS[criterion]} | "
                         + " | ".join(_score_of(record["assessment"][seat], criterion)
                                      for seat in seats) + " |")
        rules = ", ".join(f"`{locator}`" for locator in record["conflict_rules"]) or "none"
        lines += ["", f"General rules for conflicts, cited by at least two judges: {rules}.",
                  "", "### Contradictions listed", ""]
        listed = [f"- {seat}: `{item['first']}` against `{item['second']}`. "
                  f"{item['situation']} {item['why']}"
                  for seat in seats
                  for item in record["assessment"][seat].get("contradictions", {})
                                                        .get("items", [])]
        lines += listed or ["None."]
        lines += ["", "### Depth out of ten", "",
                  "| Behaviour | Judge | Out of four, doubled | Out of ten | Rationale |",
                  "|---|---|---|---|---|"]
        for slug, cell in record["cells"].items():
            for tag in sorted(set(cell["old"]) | set(cell["new"])):
                old = cell["old"].get(tag)
                given = cell["new"].get(tag, {})
                new = given.get("depth")
                if new is not None:
                    given_count += 1
                    odd += new % 2
                reason = given.get("rationale") or given.get("error") or ""
                lines.append(f"| {slug} | {tag} | "
                             f"{'no answer' if old is None else old * 2} | "
                             f"{'no answer' if new is None else new} | "
                             f"{_cell_text(reason)} |")
    lines += ["", f"Odd values: {odd} of {given_count} depths out of ten."]
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--go", action="store_true",
                        help="spend: without it the pilot is priced and nothing is called")
    parser.add_argument("--documents", default=",".join(DOCUMENTS),
                        help="document ids, comma-separated")
    parser.add_argument("--behaviours", default=",".join(BEHAVIOURS),
                        help="behaviour slugs, comma-separated")
    parser.add_argument("--out", default=str(ROOT / "artefacts"),
                        help="where the results go (default: artefacts/)")
    args = parser.parse_args(argv)

    from store import Store
    store = Store.from_env()
    index_store.install_registry(store)
    registry = index_store.judging_registry(store)
    config = h.load_config()
    if args.go and os.environ.get("ANTHROPIC_API_KEY"):
        print("note: ANTHROPIC_API_KEY is set, so fable is called on Anthropic's own "
              "API. The repository's .env has carried a stale key that answers 401; "
              "unset it to go through OpenRouter, as the container does.", file=sys.stderr)
    estimate, folder = run_pilot(store, config, registry, h.passages, args.out, go=args.go,
                                 documents=tuple(args.documents.split(",")),
                                 behaviours=tuple(args.behaviours.split(",")))
    if folder is None:
        print(f"Priced at about {estimate} dollars. Nothing was spent; run again with --go.")
        return 0
    print(f"\nWritten to {folder}")
    print("  summary.md       read this first")
    print("  pilot.json       everything, parsed")
    print("  */*.reply.txt    every reply exactly as it came back")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the pilot's tests, then the whole engine suite**

Run: `python3 -m pytest engine/test_pilot_scale_ten.py -q`
Expected: all 7 tests pass.

Run: `python3 -m pytest engine -q`
Expected: everything passes.

- [ ] **Step 5: Name the pilot in `engine/README.md`**

Find the line that begins "The judging pipeline:" and add, directly after its paragraph, this paragraph:

```markdown
`pilot_scale_ten.py` is the pilot of depth out of ten and of the assessment of a whole document (`panel/assessment_call.py`), from `docs/superpowers/plans/2026-09-21-depth-out-of-ten-pilot.md`. It reads the public publication, writes nothing to the database, and prices itself unless given `--go`.
```

- [ ] **Step 6: Commit**

```bash
git add engine/pilot_scale_ten.py engine/test_pilot_scale_ten.py engine/README.md
git commit -F - <<'EOF'
feat: a pilot of depth out of ten, run locally into artefacts

pilot_scale_ten.py assesses two documents as a whole, takes the passages at
least two judges cited as general conflict rules, then gives four behaviours
on each document a depth out of ten from the judges of the published run. It
reads the database, never writes to it, and only prices itself without --go.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7
EOF
```

---

### Task 4: Price the pilot, then run it

This task spends money. Step 2 needs the owner's explicit go, given after they have seen the price from Step 1.

**Files:** none in the repository. Results land in `artefacts/`, which is gitignored.

- [ ] **Step 1: Price it**

The credentials live in the main checkout's `.env`, which a worktree does not copy.

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/ai-character-index-depth-to-ten
set -a; source ../ai-character-index/.env; set +a
unset ANTHROPIC_API_KEY
python3 engine/pilot_scale_ten.py
```

Expected: one line, `Priced at about N dollars. Nothing was spent; run again with --go.`, with N near the design's estimate of 6. If N is above 10, stop and report it rather than going on.

- [ ] **Step 2: Ask the owner, then run it**

Report the price and ask for a go. On a go, in the same shell:

```bash
python3 engine/pilot_scale_ten.py --go
```

Expected: a progress line per call, 36 in all (for each document, six assessment calls then twelve depth calls), then `Written to .../artefacts/<stamp>-pilot-scale-ten`. A call refused by a provider prints nothing extra and is recorded as `error` in `pilot.json`; the run goes on.

- [ ] **Step 3: Check the run is whole**

```bash
F=$(ls -d artefacts/*-pilot-scale-ten | tail -1)
python3 - "$F" <<'EOF'
import json, sys
r = json.load(open(f"{sys.argv[1]}/pilot.json"))
for doc, rec in r["documents"].items():
    for seat, qs in rec["assessment"].items():
        for q, a in qs.items():
            if "error" in a or not a.get("complete"):
                print("ASSESSMENT", doc, seat, q, a.get("error", "incomplete"))
    for slug, cell in rec["cells"].items():
        for tag, g in cell["new"].items():
            if g.get("depth") is None:
                print("DEPTH", doc, slug, tag, g.get("error", "no DEPTH line"))
print("cost", r["cost_usd"], "estimate", r["estimate_usd"])
EOF
```

Expected: only the `cost ... estimate ...` line. Any other line names a failed or incomplete call; read its `.reply.txt` before deciding whether to re-run that call alone (with `--documents` and `--behaviours` narrowed to it) or to report it as a finding.

---

### Task 5: Read the pilot and record what it showed

**Files:**
- Modify: `docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md` (append a section)

- [ ] **Step 1: Read `summary.md` and answer the two questions with figures**

1. **Odd values.** The summary's last line gives the share of odd depths. For each odd depth, read its rationale and note whether it names which part of the level above is met (a real in-between) or only hedges ("somewhere between"). Count each kind.
2. **Contradictions.** For each contradiction listed, open both passages in the reader (`https://ai-character-index.vercel.app/spec-reader/?spec=<document id>` and search the locator's text) and mark it as holding up, not holding up (the document settles it, or the passages do not clash), or unclear. Count each kind, and note how many pairs were found by more than one judge.

Also note, per document, the conflict-rule passages chosen and whether they are the ones a reader would pick (for the constitution, the paragraph of the core values that ranks safety, ethics, guidelines and helpfulness; for the model spec, the levels of authority).

- [ ] **Step 2: Append "What the pilot showed" to the design**

Append a section to the design document with: the date, the artefacts folder name, the price and the cost; the counts from Step 1; the old and new depth for each of the eight cells in one table; and a one-paragraph recommendation: go on to the second plan as designed, go on with named changes to a prompt or a criterion, or stop. Write it in English, British spelling, no long dashes, plain declarative sentences.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md
git commit -F - <<'EOF'
docs: what the pilot of depth out of ten showed

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7
EOF
```

- [ ] **Step 4: Report to the owner and stop**

Give the owner the recommendation and the two counts, in French, in a few lines. The second plan (the migration in `polaris-supabase`, the engine, the runs, the site) is written only after they decide.
