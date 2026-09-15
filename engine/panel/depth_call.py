"""One depth call: composing its prompt and parsing its reply.

A depth is one judge's reading of how deeply a document covers a behaviour, on
the 0 to 4 scale of methodology/spec-coverage-depth-rubric.md. The judge is shown
only the passages the reader shows by default, which is the evidence the index
publishes. The prompt is a file, and its digest is recorded on the run that uses
it."""

import hashlib
import importlib.util
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROMPT = HERE / "prompts" / "depth-v1.txt"

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
# The Roman numerals that unambiguously name a level of the scale, longest
# alternative first so III is not shadowed by an early match on I or II. The
# trailing \b refuses a numeral folded into a longer word (IIII, IVth): neither
# leaves a word boundary where the alternative would otherwise end.
ROMAN_RE = re.compile(r"^(IV|III|II|I)\b", re.IGNORECASE)
ROMAN_DEPTHS = {"I": 1, "II": 2, "III": 3, "IV": 4}
SCALE_WORDS = "absent|named|discussed|prescribed|demonstrated"
# What may follow the figure for the line to count as an answer rather than a
# sentence that happens to start with "Depth:": nothing, bare punctuation, a
# denominator, a parenthetical, or one word of the scale. Anything else is a
# judge arguing in prose, read through and skipped, not refused.
ANSWER_SUFFIX_RE = re.compile(
    r"^(?:"
    r"[\s.,;:!?()\]-]*"
    r"|\s*/\s*4\s*[.,;:!?]*"
    r"|\s+of\s+4\s*[.,;:!?]*"
    r"|\s*\([^()]*\)\s*[.,;:!?]*"
    rf"|\s*[-:,]?\s*(?:{SCALE_WORDS})\b[.,;:!?]*\s*"
    r")$", re.IGNORECASE)

# What a cell with no retained passage records, without a call: nothing was
# found to grade, which is depth 0 by the scale's own definition.
NOTHING_RETAINED = "No passage was retained for this behaviour in this document."


def system_prompt():
    return PROMPT.read_text()


def prompt_sha256():
    return hashlib.sha256(PROMPT.read_bytes()).hexdigest()


def compose(behaviour, registry, retained):
    """(system, user) for one depth call: the behaviour block, then the retained
    passages numbered in document order."""
    block = h.compose_query(behaviour, "v3", registry)
    body = "\n".join(f"[{i + 1}] (§ {section}) {text}"
                     for i, (_locator, section, text) in enumerate(retained))
    user = (f"{block}\n\nPassages the panel found to establish this behaviour "
            f"({len(retained)}):\n{body}\n\nAnswer with the two lines DEPTH and RATIONALE.")
    return system_prompt(), user


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


def _read_answer(value):
    """(counts, figure): whether value reads as an answer at all, and the depth
    it names when it does. A leading figure or Roman numeral, followed by
    nothing, punctuation, a denominator, a parenthetical or one word of the
    scale, counts. A figure counts whether or not it names a level of the scale
    (2.5 and 42 count but refuse); a Roman numeral counts only when it is
    exactly I, II, III or IV, so V and IIII are not read as answers at all.
    Anything else -- a figure trailing into prose, or no figure and no Roman
    numeral -- does not count, and is read through as prose."""
    if not value:
        return False, None
    number = NUMBER_RE.match(value)
    if number:
        token, rest = number.group(1), value[number.end():]
        if not ANSWER_SUFFIX_RE.match(rest):
            return False, None
        return True, int(token) if token in ("0", "1", "2", "3", "4") else None
    roman = ROMAN_RE.match(value)
    if roman:
        token, rest = roman.group(1), value[roman.end():]
        if not ANSWER_SUFFIX_RE.match(rest):
            return False, None
        return True, ROMAN_DEPTHS[token.upper()]
    return False, None


def parse(reply):
    """(depth, rationale): either is None where the reply does not give it.

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
            counts, figure = _read_answer(value)
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
