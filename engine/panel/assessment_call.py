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
           "contradictions": HERE / "prompts" / "assessment-contradictions-v1.txt",
           "confirm": HERE / "prompts" / "assessment-confirm-v1.txt"}
# The two questions a document is scored on. "confirm" is a follow-up call that
# puts one judge's contradictions to another, not a third question about the
# document, so it lives in PROMPTS but not here.
QUESTIONS = ("criteria", "contradictions")
CRITERIA = ("conflict_rules", "rule_force", "reasons", "situations")
MAX_CONTRADICTIONS = 8

ASK = {"criteria": "Answer with the nine lines the instructions give.",
       "contradictions": "Answer in the form the instructions give."}

# A labelled line, once its markdown is gone. The labels are the prompts' own.
LABEL_RE = re.compile(r"^([A-Za-z_]+)\s*:(.*)$")
# An ITEM line of a confirm reply: "confirm"'s own label, but numbered, so it
# does not fit LABEL_RE.
ITEM_RE = re.compile(r"^ITEM\s*(\d+)\s*:(.*)$", re.IGNORECASE)
ABSOLUTE_RE = re.compile(r"^absolute\s*:\s*(yes|no)\s*$", re.IGNORECASE)
LIST_MARKER_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
# Emphasis and code spans. An underscore inside a word is not emphasis, which is
# what keeps CONFLICT_RULES whole.
MARKUP_RE = re.compile(r"[*`]+|(?<!\w)_+|_+(?!\w)")
# A score: one figure from 0 to 4, then nothing but a denominator of four, bare
# punctuation or a parenthetical. 2.5 and 5 are refused.
SCORE_RE = re.compile(
    r"^([0-4])(?:\s*/\s*4|\s+of\s+4)?\s*[.,;:!?]*\s*(?:\([^()]*\))?\s*[.,;:!?]*$",
    re.IGNORECASE)
# The same score as a Roman numeral from I to IV, which deepseek gives, as the
# depth parser already reads it (depth_call.ROMAN). Zero has no numeral. The
# numeral must stand alone, so prose opening with the word "I" is still prose.
ROMAN_SCORE_RE = re.compile(
    r"^(IV|III|II|I)(?:\s*/\s*4|\s+of\s+4)?\s*[.,;:!?]*\s*(?:\([^()]*\))?\s*[.,;:!?]*$",
    re.IGNORECASE)
ROMAN_SCORES = {"I": 1, "II": 2, "III": 3, "IV": 4}
# A heading line carrying attributes in curly braces after its anchor, such as
# "## Do not lie {#do_not_lie authority=user}". The attributes are everything
# after the anchor's name, stripped.
HEADING_ATTRS_RE = re.compile(
    r"^#{1,6}\s+.*?\{#([A-Za-z0-9_-]+)\s+([^}]+)\}\s*$", re.MULTILINE)


def system_prompt(question):
    return PROMPTS[question].read_text()


def prompt_sha256(question):
    return hashlib.sha256(PROMPTS[question].read_bytes()).hexdigest()


def _numbered_document(passages):
    """The whole document, numbered in order, as both compose and compose_confirm
    open their user message: 'The complete document, as N numbered passages in
    order:' then one '[i] (§ section) text' line per passage."""
    body = "\n".join(f"[{i + 1}] (§ {section}) {text}"
                     for i, (_locator, section, text) in enumerate(passages))
    return f"The complete document, as {len(passages)} numbered passages in order:\n{body}"


def compose(question, passages):
    """(system, user): the question's prompt, then the whole document numbered
    in order."""
    system = system_prompt(question)
    user = f"{_numbered_document(passages)}\n\n{ASK[question]}"
    return system, user


def compose_confirm(passages, claims):
    """(system, user) for putting another judge's claimed contradictions to a
    second reader. Each claim is {"first": int, "second": int, "situation":
    str, "why": str} with 1-based passage numbers into passages. The document
    comes first, numbered exactly as compose numbers it, then the claims, one
    per line, numbered in the order given."""
    lines = "\n".join(
        f"[{i + 1}] passages [{claim['first']}] and [{claim['second']}] | "
        f"{claim['situation']} | {claim['why']}"
        for i, claim in enumerate(claims))
    user = (f"{_numbered_document(passages)}\n\n"
            f"Claimed contradictions ({len(claims)}):\n{lines}\n\n"
            "Answer with one ITEM line per claim, in the order given.")
    return system_prompt("confirm"), user


def _plain_lines(reply):
    """Every line of a reply, with its list marker, emphasis and code spans
    removed."""
    return [MARKUP_RE.sub("", LIST_MARKER_RE.sub("", raw, count=1)).strip()
            for raw in (reply or "").splitlines()]


def _labelled(reply):
    """(LABEL, value) for every labelled line of a reply, in order."""
    out = []
    for plain in _plain_lines(reply):
        match = LABEL_RE.match(plain)
        if match:
            out.append((match.group(1).upper(), match.group(2).strip()))
    return out


def _gives_a_score(value):
    """Whether a labelled value is meant as a score: it starts with a figure,
    or it is a Roman numeral standing alone. Anything else is prose."""
    return bool(re.match(r"\d", value) or ROMAN_SCORE_RE.match(value))


def _score(value):
    match = SCORE_RE.match(value)
    if match:
        return int(match.group(1))
    roman = ROMAN_SCORE_RE.match(value)
    return ROMAN_SCORES[roman.group(1).upper()] if roman else None


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
    figure, and is not a Roman numeral standing alone, is prose and is read
    through, so it cannot blank an earlier score; a figure off the scale is
    refused and gives no score."""
    scores = {criterion: None for criterion in CRITERIA}
    rationales = {criterion: None for criterion in CRITERIA}
    cited = []
    for label, value in _labelled(reply):
        key = label.lower()
        if key in scores:
            if _gives_a_score(value):
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
            if value.lower().startswith("none"):
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
            if _gives_a_score(value):
                score = _score(value)
        elif label == "CONTRADICTIONS_RATIONALE" and value:
            rationale = value
    return {"score": score, "rationale": rationale,
            "items": items[:MAX_CONTRADICTIONS], "unreadable": unreadable,
            "complete": score is not None}


def parse_confirm(reply, claim_count):
    """{position: {"holds": bool, "absolute": bool | None, "reason": str}} for
    every claim a confirm reply answers, keyed by its 1-based position.

    A line matching ITEM <number>: is a verdict when its number is in range
    and its value's first bar-separated part starts with "holds" or "does not
    hold"; anything else is skipped. A later line for the same number replaces
    an earlier one, and a number never answered is absent."""
    verdicts = {}
    for plain in _plain_lines(reply):
        match = ITEM_RE.match(plain)
        if not match:
            continue
        number = int(match.group(1))
        if not 1 <= number <= claim_count:
            continue
        parts = [part.strip() for part in match.group(2).split("|")]
        first = parts[0].lower() if parts else ""
        if first.startswith("does not hold"):
            holds = False
        elif first.startswith("holds"):
            holds = True
        else:
            continue
        absolute_match = ABSOLUTE_RE.match(parts[1]) if len(parts) > 1 else None
        absolute = (absolute_match.group(1).lower() == "yes") if absolute_match else None
        reason = parts[2].strip() if len(parts) > 2 else ""
        verdicts[number] = {"holds": holds, "absolute": absolute, "reason": reason}
    return verdicts


def with_heading_attributes(passages, markdown):
    """passages, with each one's section carrying its heading's attributes
    when the markdown states them and the section does not already carry
    authority.

    A heading line such as "## Do not lie {#do_not_lie authority=user}" maps
    the anchor do_not_lie to the attributes "authority=user". A passage whose
    locator's second ' > ' part is that anchor, written "#do_not_lie", has
    those attributes appended to its section as "{authority=user}". A passage
    whose locator names a heading path instead of an anchor, or whose section
    already contains "authority=", or whose anchor has no attributes, is
    returned unchanged. Locators and texts never change."""
    attributes_by_anchor = {anchor: attributes.strip()
                            for anchor, attributes in HEADING_ATTRS_RE.findall(markdown)}
    out = []
    for locator, section, text in passages:
        parts = locator.split(" > ")
        anchor = parts[1] if len(parts) > 1 else ""
        if anchor.startswith("#") and "authority=" not in section:
            attributes = attributes_by_anchor.get(anchor[1:])
            if attributes:
                section = f"{section} {{{attributes}}}"
        out.append((locator, section, text))
    return out
