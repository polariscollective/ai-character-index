#!/usr/bin/env python3
"""What the other document does with one passage, in a paragraph a reader can take in at once.

    python3 engine/panel/link_paragraph.py artefacts/<run folder>/links.json
    python3 engine/panel/link_paragraph.py <links.json> --go --model=sol

Priced and printed by default, spent only with --go, as every other call in this
repository is.

A passage with several bubbles tells a reader nothing about which of them to
open. Several usually restate one requirement in different words while one
carries the only real difference, and the row of pills cannot show that. This is
the sentence that does, written from the panel's own links rather than from a
fresh reading of either document: every claim in it has a bubble behind it.

Only passages carrying more than one counterpart get one. The median passage has
a single bubble and needs no help reading it.

Nothing here touches the database, and that is deliberate rather than pending.
aci_link_summaries is keyed by behaviour and pair of documents and carries no
locator, so a passage-level paragraph has no row to sit in. Migrating for a shape
nobody has read yet would fix the wrong thing first; these are written beside the
run while the shape settles.
"""

import argparse
import hashlib
import json
import sys
from collections import OrderedDict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                    # noqa: E402
import link_arbitrate               # noqa: E402
import link_call                    # noqa: E402
import link_summary                 # noqa: E402
import whole_doc                    # noqa: E402

h = link_call.h

PROMPT = HERE / "prompts" / "link-paragraph-v1.txt"
CHARS_PER_TOKEN = 4
OUTPUT_TOKENS = 260          # 150 words, with room for the model to breathe
FLOOR = 2                    # counterparts below which a reader needs no summary


def system_prompt():
    return PROMPT.read_text()


def prompt_sha256():
    return hashlib.sha256(PROMPT.read_bytes()).hexdigest()


def quotes_in(data):
    """{locator: quote} over both sides of every direction.

    A passage is a source in one direction and a target in the other, and only
    one of those carries its own retained text, so the map is built from both."""
    out = {}
    for direction in data["directions"]:
        for source in direction["sources"]:
            out.setdefault(source["locator"], source.get("quote") or "")
            for target in source["targets"]:
                out.setdefault(target["locator"], target.get("quote") or "")
    return out


def cells(data, verdicts, floor=FLOOR):
    """{(behaviour, locator): [counterpart, ...]} for passages worth summarising.

    A link is a fact about a pair, so both of its passages carry it and both get
    a cell: the reader standing on either one sees the same bubble. A pair found
    again under another behaviour is a separate cell, because the bubbles are
    filtered by behaviour and a paragraph that summarised all of them at once
    would describe a row the reader is not looking at.

    The relation is named by document rather than by direction, for the reason it
    is named that way everywhere else: `stricter_source` read from the other side
    is `stricter_target`, and a sentence built on the direction would say the
    opposite thing depending on which passage the reader is standing on."""
    seen, out = set(), OrderedDict()
    for direction in data["directions"]:
        for source in direction["sources"]:
            for target in source["targets"]:
                pair = (direction["behaviour"],) + tuple(
                    sorted((source["locator"], target["locator"])))
                if pair in seen:
                    continue
                seen.add(pair)
                relations = target.get("judge_relations") or {}
                seat, relation = next(iter(sorted(relations.items())), (None, None))
                if not relation:
                    continue
                key = tuple(sorted((source["locator"], target["locator"])))
                verdict = verdicts.get(key)
                named = (verdict["relation"] if verdict
                         else link_arbitrate._named(relation, source["locator"],
                                                    target["locator"]))
                why = ((verdict.get("why") if verdict else None)
                       or (target.get("rationales") or {}).get(seat, ""))
                for me, other in ((source["locator"], target["locator"]),
                                  (target["locator"], source["locator"])):
                    out.setdefault((direction["behaviour"], me), []).append(
                        {"locator": other, "relation": named, "why": why,
                         "settled": bool(verdict)})
    return OrderedDict((key, items) for key, items in out.items()
                       if len(items) >= floor)


def compose(behaviour, locator, quote, counterparts, quotes):
    """(system, user) for the one call that writes a passage's paragraph."""
    parts = [f"Behaviour: {behaviour}",
             "",
             f"The passage, from {locator.split(' > ', 1)[0]}:",
             f"    {quote}",
             "",
             f"The {len(counterparts)} passages of the other document the panel "
             f"linked it to:"]
    for item in counterparts:
        parts.append("")
        parts.append(f"  {item['locator']}")
        parts.append(f"    {quotes.get(item['locator'], '')}")
        parts.append(f"    the panel settled this as {item['relation']}"
                     if item["settled"] else
                     f"    the panel read this as {item['relation']}")
        if item["why"]:
            parts.append(f"    because: {item['why']}")
    return system_prompt(), "\n".join(parts)


def price(pairs, model, config):
    priced = config["models"].get(model, {})
    prices = (priced.get("openrouter") or priced).get("price_per_mtok")
    if not prices:
        return 0.0
    tokens_in = sum(len(system) + len(user) for system, user in pairs) // CHARS_PER_TOKEN
    return round(tokens_in * prices[0] / 1e6
                 + OUTPUT_TOKENS * len(pairs) * prices[1] / 1e6, 2)


def main(argv=None, call_model=None):
    """`call_model` is injected the way link_summary.main takes one, so the same
    paragraphs can be written by a model reached through a provider or by one
    that answers from a file."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("links_json")
    parser.add_argument("--behaviour", default=None,
                        help="one behaviour; every behaviour of the report by default")
    parser.add_argument("--model", default="sol")
    parser.add_argument("--arbitration", default=None,
                        help="a run's arbitration.json; its sibling by default")
    parser.add_argument("--floor", type=int, default=FLOOR,
                        help="counterparts a passage needs before it gets a paragraph")
    parser.add_argument("--go", action="store_true", help="spend the money")
    args = parser.parse_args(argv)

    source = Path(args.links_json)
    data = json.loads(source.read_text(encoding="utf-8"))
    if args.behaviour:
        data = link_summary.for_behaviour(data, args.behaviour)
    beside = Path(args.arbitration) if args.arbitration else \
        source.with_name("arbitration.json")
    arbitration = json.loads(beside.read_text(encoding="utf-8")) if beside.exists() else None

    quotes = quotes_in(data)
    wanted = cells(data, link_summary.verdicts_by_pair(arbitration), args.floor)
    composed = [(key, compose(key[0], key[1], quotes.get(key[1], ""), items, quotes))
                for key, items in wanted.items()]

    config = h.load_config()
    print(f"  documents   {', '.join(link_summary.document_ids(data))}")
    print(f"  behaviours  {len(link_summary.behaviours_in(data))}")
    print(f"  passages    {len(wanted)} with {args.floor} counterparts or more")
    print(f"  written by  {args.model}")
    print(f"  context     "
          f"{sum(len(s) + len(u) for _, (s, u) in composed) // CHARS_PER_TOKEN} tokens")
    print(f"  estimated   ${price([p for _, p in composed], args.model, config)}")
    if not args.go:
        print("nothing called (pass --go to spend)")
        return 0

    provider, model_id = h.resolve(args.model, config)
    caller = call_model or batch_job.call_openrouter
    out = source.with_name("paragraphs.json")
    record = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {
        "run": data["run"]["id"], "documents": link_summary.document_ids(data),
        "model": args.model, "prompt_sha256": prompt_sha256(), "cells": {},
    }
    # Keyed by behaviour and locator, so a second pass over a run that gained
    # answers since the first one fills the gaps rather than starting again.
    written = 0
    for (behaviour, locator), (system, user) in composed:
        reply, usage, finish_reason, seconds = caller(
            provider=provider, model_id=model_id, system=system, user=user,
            kwargs=whole_doc.judge_kwargs(args.model, model_id, config))
        if not (reply or "").strip():
            continue
        record["cells"][f"{behaviour}\n{locator}"] = {
            "behaviour": behaviour, "locator": locator,
            "text": reply.strip(), "finish_reason": finish_reason,
            "seconds": seconds, "cost_usd": batch_job.cost_of(args.model, usage, config),
        }
        written += 1
    out.write_text(json.dumps(record, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"written to {out}")
    print(f"  {written} paragraphs this pass, {len(record['cells'])} in the file")
    return 0


if __name__ == "__main__":
    sys.exit(main())
