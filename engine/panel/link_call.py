"""One link call: composing its prompt, parsing its reply, shaping its rows.

A link call gives one judge the passages that establish a behaviour in one
document, and the whole of another document, and asks what relates to what. It
is the shape judge_call.py and depth_call.py already have: given its inputs
rather than reading them, so the job can drive it against the database and the
tests can drive it against a fixture.

The prompt is a file, and its digest is recorded on the run that uses it.
"""

import hashlib
import importlib.util
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROMPT = HERE / "prompts" / "link-v1.txt"

_spec = importlib.util.spec_from_file_location("h", HERE / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

RELATIONS = ("same", "stricter_source", "stricter_target", "nuance", "contradiction")
FORCES = ("nobody", "priority", "operator", "user", "unstated")

# Ordered by how far apart the two rules are: no response can satisfy both,
# then neither implies the other, then one implies the other, then they are the
# same rule, then the target document has nothing to say. A pair a judge names
# twice keeps the first of these it was given, and the sentence says the rest.
SEVERITY = ("contradiction", "nuance", "stricter_source", "stricter_target",
            "same", "absent")

# A line of the reply, once its markdown is gone. Models wrap answers in bold, a
# code span or a list item often enough that reading only the bare line pays for
# each of those replies twice: the refused one, then its retry.
LINK_RE = re.compile(
    r"^\[?(\d+)\]?\s*->\s*\[(\d+)\]\s+([a-z_]+)\s*"
    r"\(\s*([a-z_]+)\s*/\s*([a-z_]+)\s*\)\s*:\s*(.+)$", re.IGNORECASE)
ABSENT_RE = re.compile(r"^\[?(\d+)\]?\s*->\s*none\s*:\s*(.+)$", re.IGNORECASE)
LIST_MARKER_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
# Emphasis and code spans. An underscore inside a word is not emphasis, so
# stricter_source keeps its shape.
MARKUP_RE = re.compile(r"[*`]+|(?<!\w)_+|_+(?!\w)")

RATIONALE_LIMIT = 1000


def system_prompt():
    return PROMPT.read_text()


def prompt_sha256():
    return hashlib.sha256(PROMPT.read_bytes()).hexdigest()


def _numbered(passages):
    return "\n".join(f"[{i + 1}] (§ {section}) {text}"
                     for i, (_locator, section, text) in enumerate(passages))


def compose(behaviour, registry, sources, targets, source_id, target_id):
    """(system, user) for one call: the behaviour block, the source document's
    established passages, then the whole target document in reading order."""
    block = h.compose_query(behaviour, "v3", registry)
    user = (f"{block}\n\n"
            f"First document: {source_id}. The passages a panel found to establish "
            f"this behaviour in it ({len(sources)}):\n{_numbered(sources)}\n\n"
            f"Second document: {target_id}. The complete document, in order "
            f"({len(targets)}):\n{_numbered(targets)}\n\n"
            f"Answer with one line per link, covering all {len(sources)} numbered "
            f"passages of the first document.")
    return system_prompt(), user


def _plain(line):
    """A reply line without its list marker, emphasis or code spans."""
    return MARKUP_RE.sub("", LIST_MARKER_RE.sub("", line, count=1)).strip()


def parse(reply, source_count, target_count):
    """([link], uncovered): the links a reply names, and the source passages it
    did not answer for.

    A line naming a relation, a force or a passage number the call did not give
    is dropped. A vocabulary the judge invented is not a finding, and neither is
    a number pointing outside the documents it was shown.
    """
    links = []
    for raw in (reply or "").splitlines():
        line = _plain(raw)
        absent = ABSENT_RE.match(line)
        if absent:
            source = int(absent.group(1))
            if 1 <= source <= source_count:
                links.append({"source": source, "target": None, "relation": "absent",
                              "source_force": None, "target_force": None,
                              "rationale": absent.group(2).strip()})
            continue
        found = LINK_RE.match(line)
        if not found:
            continue
        source, target, relation, source_force, target_force, rationale = found.groups()
        relation, source_force, target_force = (relation.lower(), source_force.lower(),
                                                target_force.lower())
        if relation not in RELATIONS:
            continue
        if source_force not in FORCES or target_force not in FORCES:
            continue
        if not (1 <= int(source) <= source_count and 1 <= int(target) <= target_count):
            continue
        links.append({"source": int(source), "target": int(target), "relation": relation,
                      "source_force": source_force, "target_force": target_force,
                      "rationale": rationale.strip()})
    answered = {link["source"] for link in links}
    return links, sorted(set(range(1, source_count + 1)) - answered)


def covered_enough(uncovered):
    """Every source passage answered for, or the call is a failure.

    A half-answered reply stored would be a page of invented absences, which is
    the failure PARSE_FLOOR exists to prevent on a passage call. Here the floor
    is completeness rather than a share, because the count of links a reply
    should carry is not knowable in advance.
    """
    return not uncovered


def link_rows(call_id, sources, targets, links):
    """One row per pair, in aci_links shape.

    A pair a judge named twice keeps its gravest relation. An absence beside a
    link for the same passage is dropped: a judge that found a counterpart has
    not found the document silent.
    """
    linked = {link["source"] for link in links if link["relation"] != "absent"}
    best = {}
    for link in links:
        if link["relation"] == "absent" and link["source"] in linked:
            continue
        key = (link["source"], link["target"])
        kept = best.get(key)
        if kept and SEVERITY.index(kept["relation"]) <= SEVERITY.index(link["relation"]):
            continue
        best[key] = link
    return [{"call_id": call_id,
             "source_locator": sources[link["source"] - 1][0],
             "target_locator": (targets[link["target"] - 1][0]
                                if link["target"] is not None else None),
             "relation": link["relation"],
             "source_force": link["source_force"],
             "target_force": link["target_force"],
             "rationale": link["rationale"][:RATIONALE_LIMIT]}
            for link in best.values()]
