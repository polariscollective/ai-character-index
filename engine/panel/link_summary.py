#!/usr/bin/env python3
"""What the two documents say about one behaviour, written from what was judged.

    python3 engine/panel/link_summary.py artefacts/<run folder>/links.json
    python3 engine/panel/link_summary.py <links.json> --go --model=sol

Priced and printed by default, spent only with --go, as every other call in this
repository is.

The bubbles say how two paragraphs stand to each other. Nobody reads 144 of them
to learn how two documents stand. This is the paragraph that answers that, and it
is written from the panel's own output rather than from a fresh reading: every
claim in it has passages behind it that the reader can click.

Four things go into the one call, and the documents are not among them: the
behaviour, the passages of each document that bear on it, the judged depth with
every judge's reason, and every pair the panel linked with what each judge said
and how it was settled. The arbiter needed both documents in full because a
disputed relation usually turns on a rule stated elsewhere; that reading has
already happened, and its result is what this is written from. Nothing here
touches the database.

What it does not do is rank. The index reports what the documents say; which lab
is right is not a question it answers, and a summary is where that rule is
easiest to break, because prose persuades where a pill only points.

Worth reading beside it: the panel is not independent of the documents it judges.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                    # noqa: E402
import link_arbitrate               # noqa: E402
import link_call                    # noqa: E402
import link_record                  # noqa: E402
import whole_doc                    # noqa: E402
from store import Store             # noqa: E402

h = link_call.h

PROMPT = HERE / "prompts" / "link-summary-v1.txt"
DEFAULT_PAYLOAD = ROOT / "artefacts" / "reader-static" / "api" / "reader" / "payload"
CHARS_PER_TOKEN = 4
OUTPUT_TOKENS = 2000


def system_prompt():
    return PROMPT.read_text()


def prompt_sha256():
    return hashlib.sha256(PROMPT.read_bytes()).hexdigest()


def behaviour_of(data):
    return data["directions"][0]["behaviour"]


def document_ids(data):
    return sorted({d[side] for d in data["directions"] for side in ("source", "target")})


def passages_block(data):
    """Each document's retained passages, quoted, in the order they appear.

    A direction's sources are one document's passages in document order, and the
    run holds both directions, so the two lists come out of the run's own file
    with nothing asked of the database."""
    out = []
    for direction in data["directions"]:
        lines = [f"{direction['source']}, the {len(direction['sources'])} passages "
                 f"the panel retained for this behaviour, in the order they appear:"]
        for index, source in enumerate(direction["sources"], 1):
            lines.append(f"[{index}] {source['locator']}\n    {source['quote']}")
        out.append("\n".join(lines))
    return out


def depth_block(payload, slug, documents):
    """Each document's judged depth, with every judge's figure and reason.

    The figure alone says little when two documents tie, which they do on the
    pilot behaviour. The reasons say what each document actually does to earn it,
    and that is comparative material even at equal scores."""
    entry = next((b for b in (payload or {}).get("behaviours", [])
                  if b["slug"] == slug), None)
    if not entry:
        return None, []
    lines = []
    for document_id in documents:
        depth = (entry.get("coverage", {}).get(document_id) or {}).get("depth") or {}
        if not depth:
            continue
        lines.append(f"{document_id}: {depth.get('mean')} out of 4")
        for seat, judged in sorted((depth.get("judges") or {}).items()):
            lines.append(f"  {seat} gave {judged.get('depth')}: {judged.get('rationale')}")
    return entry.get("definition"), lines


def links_block(data, verdicts):
    """Every pair, both passages quoted, every judge's reading, and the verdict.

    Keyed by pair rather than by direction: the same two paragraphs read from
    either end are one fact about them, and printing it twice would tell the
    writer there are twice as many links as there are."""
    seen, out = set(), []
    for direction in data["directions"]:
        for source in direction["sources"]:
            for target in source["targets"]:
                key = tuple(sorted((source["locator"], target["locator"])))
                if key in seen:
                    continue
                seen.add(key)
                said = []
                for judge, relation in sorted((target.get("judge_relations") or {}).items()):
                    named = link_arbitrate._named(relation, source["locator"],
                                                  target["locator"])
                    why = (target.get("rationales") or {}).get(judge, "")
                    said.append(f"    {judge} read it as {named}"
                                + (f": {why}" if why else ""))
                verdict = verdicts.get(key)
                settled = ""
                if verdict:
                    settled = (f"    settled as {verdict['relation']}"
                               f": {verdict.get('why') or ''}")
                out.append(
                    f"{source['locator']}\n"
                    f"    {source['quote']}\n"
                    f"  and {target['locator']}\n"
                    f"    {target['quote']}\n"
                    + "\n".join(said)
                    + (f"\n{settled}" if settled else ""))
    return out


def verdicts_by_pair(arbitration):
    out = {}
    for dispute in (arbitration or {}).get("disputes", []):
        settled = dispute.get("settled") or {}
        if settled.get("relation"):
            key = tuple(sorted((dispute["first"]["locator"], dispute["second"]["locator"])))
            out[key] = settled
    return out


def compose(data, arbitration, payload):
    """(system, user) for the one call that writes the summary."""
    slug = behaviour_of(data)
    documents = document_ids(data)
    definition, depth = depth_block(payload, slug, documents)

    parts = [f"Behaviour: {slug}"]
    if definition:
        parts.append(f"What it means here: {definition}")
    parts.append("")
    for block in passages_block(data):
        parts.append(block)
        parts.append("")
    if depth:
        parts.append("How deeply each document was judged to cover the behaviour:")
        parts.extend(depth)
        parts.append("")
    pairs = links_block(data, verdicts_by_pair(arbitration))
    parts.append(f"The {len(pairs)} links the panel drew, each with both passages, "
                 "what every judge said, and how it was settled:")
    parts.extend(pairs)
    return system_prompt(), "\n".join(parts)


def price(system, user, model, config):
    priced = config["models"].get(model, {})
    prices = (priced.get("openrouter") or priced).get("price_per_mtok")
    if not prices:
        return 0.0
    tokens_in = (len(system) + len(user)) // CHARS_PER_TOKEN
    return round(tokens_in * prices[0] / 1e6 + OUTPUT_TOKENS * prices[1] / 1e6, 2)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("links_json")
    parser.add_argument("--model", default="sol")
    parser.add_argument("--arbitration", default=None,
                        help="a run's arbitration.json; its sibling by default")
    parser.add_argument("--payload", default=str(DEFAULT_PAYLOAD),
                        help="where the judged depths are read from")
    parser.add_argument("--go", action="store_true", help="spend the money")
    args = parser.parse_args(argv)

    source = Path(args.links_json)
    data = json.loads(source.read_text(encoding="utf-8"))
    beside = Path(args.arbitration) if args.arbitration else \
        source.with_name("arbitration.json")
    arbitration = json.loads(beside.read_text(encoding="utf-8")) if beside.exists() else None
    payload_file = Path(args.payload)
    payload = json.loads(payload_file.read_text(encoding="utf-8")) \
        if payload_file.exists() else None

    config = h.load_config()
    system, user = compose(data, arbitration, payload)

    print(f"  behaviour   {behaviour_of(data)}")
    print(f"  documents   {', '.join(document_ids(data))}")
    print(f"  passages    "
          f"{', '.join(str(len(d['sources'])) for d in data['directions'])}")
    print(f"  written by  {args.model}")
    print(f"  context     {(len(system) + len(user)) // CHARS_PER_TOKEN} tokens")
    print(f"  estimated   ${price(system, user, args.model, config)}")
    if not args.go:
        print("nothing called (pass --go to spend)")
        return 0

    provider, model_id = h.resolve(args.model, config)
    reply, usage, finish_reason, seconds = batch_job.call_openrouter(
        provider=provider, model_id=model_id, system=system, user=user,
        kwargs=whole_doc.judge_kwargs(args.model, model_id, config))
    cost = batch_job.cost_of(args.model, usage, config)

    record = {
        "run": data["run"]["id"],
        "behaviour": behaviour_of(data),
        "documents": document_ids(data),
        "model": args.model,
        "prompt_sha256": prompt_sha256(),
        "finish_reason": finish_reason,
        "seconds": seconds,
        "cost_usd": cost,
        "text": reply or "",
    }
    out = source.with_name("summary.json")
    out.write_text(json.dumps(record, indent=1, ensure_ascii=False), encoding="utf-8")
    # The file is what a person reads beside the run; the table is what a reader
    # and the MCP server can reach. The prompt digest is part of that table's
    # key, so improving the wording writes a new row and re-running the same
    # wording is refused rather than duplicated.
    _, said = link_record.write(Store.from_env(), "aci_link_summaries",
                                link_record.summary_rows(record))
    print(f"written to {out}")
    print(f"  aci_link_summaries      {said}")
    print(f"  {len(reply or '')} characters, finish_reason={finish_reason}, "
          f"about ${cost:.2f} spent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
