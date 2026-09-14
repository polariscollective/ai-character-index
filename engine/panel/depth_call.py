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

DEPTH_RE = re.compile(r"^\s*DEPTH\s*:\s*([0-4])\b(?!\d)", re.IGNORECASE | re.MULTILINE)
RATIONALE_RE = re.compile(r"^\s*RATIONALE\s*:\s*(\S.*?)\s*$", re.IGNORECASE | re.MULTILINE)

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


def parse(reply):
    """(depth, rationale): either is None where the reply does not give it."""
    depth = DEPTH_RE.search(reply or "")
    rationale = RATIONALE_RE.search(reply or "")
    return (int(depth.group(1)) if depth else None,
            rationale.group(1) if rationale else None)
