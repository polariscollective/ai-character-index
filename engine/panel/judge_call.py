"""One judge call: composing its prompt, parsing its reply, shaping its rows.

Lifted out of whole_doc.py's loop and given its inputs rather than reading them,
so the job can drive it against the database and the tests can drive it against a
fixture. The prompt text itself is unchanged: the rubric is the file on disk that
produced the canonical bench, and the parser is the one those rows went through.
"""

import importlib.util
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

_spec = importlib.util.spec_from_file_location("h", HERE / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

# A reply must carry a verdict for at least this share of the passages. Below it
# the call is a failure and writes nothing: a half-parsed reply recorded as
# verdicts is a page of silent zeroes, which reads as "the panel saw nothing
# here" rather than "the panel was not heard".
PARSE_FLOOR = 0.98

VIA = {"v5": "wholedoc-v5", "v3w": "wholedoc", "v3s": "wholedoc-sparse"}


def system_prompt(rubric):
    if rubric != "v5":
        raise ValueError(f"only v5 is composed here, not {rubric!r}")
    return (HERE / "prompts" / "v5.txt").read_text()


def compose(behaviour, rubric, registry, passages):
    """(system, user) for one call: the rubric, then the behaviour block and the
    whole document as numbered passages."""
    block = h.compose_query(behaviour, "v3", registry)
    body = "\n".join(f"[{i + 1}] (§ {section}) {text}"
                     for i, (_locator, section, text) in enumerate(passages))
    user = (f"{block}\n\nPassages (the complete document, in order):\n{body}\n\n"
            f"Output {len(passages)} verdict lines.")
    return system_prompt(rubric), user


def parse(reply, passage_count):
    """({passage number: verdict}, unparsed count) on the v5 scale.

    Two readings, in the order whole_doc.py used them: numbered lines first, and
    where those are sparse, a bare sequence of the right length from the tail --
    a model that answered without the numbering is still answering.
    """
    keyed = {}
    for line in reply.splitlines():
        m = re.match(r"\s*\[?(\d+)\]?\s*[:.\)\-]\s*([0123])\b", line)
        if m:
            keyed[int(m.group(1))] = int(m.group(2))
    keyed = {k: v for k, v in keyed.items() if 1 <= k <= passage_count}
    if len(keyed) < passage_count * 0.9:
        tail = reply.splitlines()[-(passage_count + 5):]
        seq = re.findall(r"(?<![.\d\[])([0123])(?![.\d\]])", "\n".join(tail))
        if len(seq) == passage_count:
            keyed = {i + 1: int(v) for i, v in enumerate(seq)}
    return keyed, passage_count - len(keyed)


def parsed_enough(unparsed, passage_count):
    if not passage_count:
        return False
    return (passage_count - unparsed) / passage_count >= PARSE_FLOOR


def judgements(call_id, passages, verdicts):
    """One row per passage, in document order. A passage the reply did not cover
    is a zero marked unparsed, not an absence: the row says the judge was asked
    and did not answer, which is a different fact from never having asked."""
    return [{"call_id": call_id, "locator": locator,
             "verdict": verdicts.get(i + 1, 0),
             "relevant": int(verdicts.get(i + 1, 0) >= 2),
             "parsed": (i + 1) in verdicts}
            for i, (locator, _section, _text) in enumerate(passages)]
