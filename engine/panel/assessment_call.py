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
