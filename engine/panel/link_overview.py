#!/usr/bin/env python3
"""Where one specification stands on one behaviour, against the others.

    python3 engine/panel/link_overview.py
    python3 engine/panel/link_overview.py --go --model=sol

Priced and printed by default, spent only with --go, as every other call in this
repository is.

The reader compares two documents at a time. A grid of every specification
against every behaviour cannot: a cell names one document and one subject, and
what a reader wants from it is where that document stands among all of them.
This writes that, one passage per cell, from the comparisons already made
between each pair. Those comparisons were written from the panel's own links, so
nothing here is a fresh reading of anything.

The pairwise text between two versions of one lab's document is left out. It
says how that document changed, which is a different question from where it
stands beside another lab's.

Where a behaviour and a pair carry more than one comparison, the one written by
the seat that wrote the others is taken. A passage resting on two different
judges without saying so is a claim nothing supports.

Nothing here is stored in the database. aci_link_summaries is keyed by a pair of
documents and carries no room for a passage about one of them, so these are
written to a file while the shape settles.
"""

import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                    # noqa: E402
import link_call                    # noqa: E402
import whole_doc                    # noqa: E402
from store import Store             # noqa: E402

h = link_call.h

PROMPT = HERE / "prompts" / "overview-v1.txt"
DEFAULT_OUT = ROOT / "site" / "overview.json"
CHARS_PER_TOKEN = 4
OUTPUT_TOKENS = 420          # 250 words, with room to breathe
SEAT = "opus-5"              # the seat the pairwise comparisons were written by


def system_prompt():
    return PROMPT.read_text()


def prompt_sha256():
    return hashlib.sha256(PROMPT.read_bytes()).hexdigest()


def latest_documents(store):
    """{spec id: document id} for the newest version of each specification.

    A document id is the specification's id and its version, which is how every
    locator and every comparison names it. Keyed by specification rather than by
    lab: they are the same thing while each lab carries one document, and a lab
    that publishes a second one deserves a column of its own rather than being
    folded into whichever version sorted highest.

    Versions are dated strings, so the highest string is the newest."""
    rows = store.select("aci_spec_versions", {"select": "spec_id,version"})
    newest = {}
    for row in rows:
        spec, version = row.get("spec_id"), row.get("version")
        if not spec or not version:
            continue
        if spec not in newest or version > newest[spec]:
            newest[spec] = version
    return {spec: f"{spec}@{version}" for spec, version in newest.items()}


def comparisons(store):
    """{(behaviour, frozenset(pair)): body}, one per behaviour and pair."""
    rows = store.select("aci_link_summaries",
                        {"select": "document_ids,behaviour_slug,body,model"})
    best = {}
    for row in rows:
        key = (row["behaviour_slug"], frozenset(row["document_ids"]))
        if key not in best or row.get("model") == SEAT:
            best[key] = row["body"] or ""
    return best


def cells(texts, documents):
    """{(behaviour, document): [(other document, its comparison), ...]}.

    A cell is one document on one subject, and its material is every comparison
    between it and another lab's document. Two versions of one lab are not a
    pair here: how a document changed is a different question from where it
    stands beside somebody else's."""
    out = defaultdict(list)
    for (behaviour, pair), body in texts.items():
        pair = sorted(pair)
        if len(pair) != 2 or not set(pair) <= set(documents):
            continue
        if pair[0].split("--", 1)[0] == pair[1].split("--", 1)[0]:
            continue
        for me, other in ((pair[0], pair[1]), (pair[1], pair[0])):
            out[(behaviour, me)].append((other, body))
    return out


def spec_titles(store):
    """{specification id: what it is called}.

    Read rather than built out of the id. Capitalising "openai--model-spec"
    gives "Openai", and a constitution belonging to any other lab would have
    carried Anthropic's name, because that was written in. The database holds
    what each specification is called and it is what the reader displays."""
    rows = store.select("aci_specs", {"select": "id,short_title,title"})
    return {row["id"]: (row.get("short_title") or row.get("title") or row["id"])
            for row in rows}


def named(document, titles):
    """The document as the prompt asks it to be named."""
    spec = document.split("@", 1)[0]
    return f"the {titles.get(spec, spec)}"


def compose(behaviour, document, material, titles):
    """(system, user) for the one call that writes a cell's passage."""
    me = named(document, titles)
    parts = [f"Behaviour: {behaviour}",
             f"The specification this passage is about: {me}",
             "",
             f"The comparisons already written between {me} and each of the "
             f"others:"]
    for other, body in sorted(material):
        parts += ["", f"---- {me} against {named(other, titles)} ----", "", body]
    return system_prompt(), "\n".join(parts)


def price(pairs, model, config):
    priced = config["models"].get(model, {})
    prices = (priced.get("openrouter") or priced).get("price_per_mtok")
    if not prices:
        return 0.0
    tokens_in = sum(len(s) + len(u) for s, u in pairs) // CHARS_PER_TOKEN
    return round(tokens_in * prices[0] / 1e6
                 + OUTPUT_TOKENS * len(pairs) * prices[1] / 1e6, 2)


def main(argv=None, call_model=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", default="sol")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--go", action="store_true", help="spend the money")
    args = parser.parse_args(argv)

    store = Store.from_env()
    titles = spec_titles(store)
    documents = set(latest_documents(store).values())
    material = cells(comparisons(store), documents)
    composed = [(key, compose(key[0], key[1], mine, titles))
                for key, mine in sorted(material.items())]

    config = h.load_config()
    print(f"  documents   {', '.join(sorted(documents))}")
    print(f"  cells       {len(composed)}")
    print(f"  written by  {args.model}")
    print(f"  context     "
          f"{sum(len(s) + len(u) for _, (s, u) in composed) // CHARS_PER_TOKEN} tokens")
    print(f"  estimated   ${price([p for _, p in composed], args.model, config)}")
    if not args.go:
        print("nothing called (pass --go to spend)")
        return 0

    provider, model_id = h.resolve(args.model, config)
    caller = call_model or batch_job.call_openrouter
    out = Path(args.out)
    record = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {
        "documents": sorted(documents), "model": args.model,
        "prompt_sha256": prompt_sha256(), "cells": {},
    }
    written = 0
    for (behaviour, document), (system, user) in composed:
        reply, usage, finish_reason, seconds = caller(
            provider=provider, model_id=model_id, system=system, user=user,
            kwargs=whole_doc.judge_kwargs(args.model, model_id, config))
        if not (reply or "").strip():
            continue
        record["cells"][f"{behaviour}\n{document}"] = {
            "behaviour": behaviour, "document": document,
            "text": reply.strip(), "finish_reason": finish_reason,
            "seconds": seconds,
            "cost_usd": batch_job.cost_of(args.model, usage, config),
        }
        written += 1
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(record, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"written to {out}")
    print(f"  {written} passages this pass, {len(record['cells'])} in the file")
    return 0


if __name__ == "__main__":
    sys.exit(main())
