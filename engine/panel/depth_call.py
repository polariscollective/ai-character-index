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

# Appended in turn to a scale-of-ten depth call's user message when a reply
# gave no depth: a format reminder, then a one-shot example. The scale of four
# never retries, so these are read by nothing else.
REMINDERS_OF_TEN = (
    "\n\nYour previous answer did not give a whole number from 0 to 10. Answer "
    "again with exactly two lines: DEPTH: followed by one of 0, 1, 2, 3, 4, 5, "
    "6, 7, 8, 9 or 10, then RATIONALE: one sentence. A depth is never negative; "
    "if no passage bears on the behaviour, it is 0.",
    "\n\nA reply in the right form reads, for a different behaviour and "
    "document:\nDEPTH: 3\nRATIONALE: The document names the behaviour and says "
    "a sentence about it, with no rule a grader could quote.\nAnswer for this "
    "behaviour and this document in that form.",
)


def retry_user(user, attempt):
    """The user message asked again after `attempt` gave no depth: `attempt`
    1 carries the format reminder, `attempt` 2 the one-shot example."""
    return user + REMINDERS_OF_TEN[attempt - 1]


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
        user += ("\n\nAnswer with the two lines DEPTH and RATIONALE. "
                 "DEPTH is one whole number from 0 to 10.")
    else:
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
