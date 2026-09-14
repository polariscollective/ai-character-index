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
# One level of the scale, standing alone. 2.5 is not a 2 and 42 is not a 4: a
# figure that does not name one level is no depth, never a rounded one.
FIGURE_RE = re.compile(r"^([0-4])(?!\w|[.,]\d)")

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


def parse(reply):
    """(depth, rationale): either is None where the reply does not give it.

    Each line is read without its markdown. The last DEPTH line and the last
    RATIONALE line answer, because a judge that reconsiders writes its second
    answer after its first; a last DEPTH line whose figure is refused gives no
    depth, and does not fall back to an earlier one."""
    depth = rationale = None
    for line in (reply or "").splitlines():
        plain = _plain(line)
        answer = DEPTH_RE.match(plain)
        if answer:
            figure = FIGURE_RE.match(answer.group(1).strip())
            depth = int(figure.group(1)) if figure else None
            continue
        answer = RATIONALE_RE.match(plain)
        if answer:
            rationale = answer.group(1).strip() or None
    return depth, rationale
