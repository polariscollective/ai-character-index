#!/usr/bin/env python3
"""Why a specification was judged to cover a behaviour as deeply as it was.

    python3 engine/panel/link_depth.py
    python3 engine/panel/link_depth.py --go --model=sol

Priced and printed by default, spent only with --go, as every other call in this
repository is.

Pressing a figure in the grid gave the panel's judges by name, each with a score
and a paragraph. That is the record and it is right that it exists, but it is
not an explanation: a reader has no way to know what those names mean, and three
paragraphs about one figure is more reading than the figure is worth. This
writes the one paragraph instead, from those same reasons, naming nobody.

Where the judges disagreed the paragraph says so. A mean that hides a split is a
figure a reader would be wrong to trust, and the split is invisible once the
names are gone unless it is said.

The depths are read from the payload the reader is served rather than from the
database, so the figure on the page and the paragraph under it come from one
source and cannot drift apart. link_summary reads the same file for the same
reason.

Nothing here is stored in the database. These are written beside the site while
the shape settles, like the grid's own passages.
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
import link_call                    # noqa: E402
import link_overview                # noqa: E402
import whole_doc                    # noqa: E402
from store import Store             # noqa: E402

h = link_call.h

PROMPT = HERE / "prompts" / "depth-summary-v1.txt"
DEFAULT_PAYLOAD = ROOT / "artefacts" / "reader-static" / "api" / "reader" / "payload"
DEFAULT_OUT = ROOT / "site" / "depths.json"
CHARS_PER_TOKEN = 4
OUTPUT_TOKENS = 160          # 90 words, with room to breathe


def system_prompt():
    return PROMPT.read_text()


def prompt_sha256():
    return hashlib.sha256(PROMPT.read_bytes()).hexdigest()


def cells(payload, documents):
    """[(behaviour entry, document id, depth)] for every judged cell of the grid.

    A cell with no depth is skipped rather than given an empty paragraph: there
    is nothing to explain about a figure that was never arrived at."""
    out = []
    for entry in payload.get("behaviours", []):
        for document in sorted(documents):
            depth = ((entry.get("coverage") or {}).get(document) or {}).get("depth")
            if not depth or not isinstance(depth.get("mean"), (int, float)):
                continue
            if not (depth.get("judges") or {}):
                continue
            out.append((entry, document, depth))
    return out


def compose(entry, document, depth, titles):
    """(system, user) for the one call that writes a figure's paragraph.

    The judges are named here and not in the answer. They have to be told apart
    for their reasons to be attributed at all, and the prompt is what keeps the
    names out of what comes back."""
    named = link_overview.named(document, titles)
    parts = [f"Behaviour: {entry.get('slug')}",
             f"What it means here: {entry.get('definition') or ''}",
             f"The specification: {named}",
             f"The figure the panel arrived at: {depth['mean']:.1f} out of 4",
             "",
             "What each judge wrote when they gave their own score:"]
    for seat, given in sorted((depth.get("judges") or {}).items()):
        parts += ["", f"  scored {given.get('depth')}: {given.get('rationale') or ''}"]
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
    parser.add_argument("--payload", default=str(DEFAULT_PAYLOAD),
                        help="the reader payload the figures are read from")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--go", action="store_true", help="spend the money")
    args = parser.parse_args(argv)

    payload = json.loads(Path(args.payload).read_text(encoding="utf-8"))
    store = Store.from_env()
    titles = link_overview.spec_titles(store)
    documents = set(link_overview.latest_documents(store).values())
    wanted = cells(payload, documents)
    composed = [((entry["slug"], document), compose(entry, document, depth, titles))
                for entry, document, depth in wanted]

    config = h.load_config()
    print(f"  documents   {', '.join(sorted(documents))}")
    print(f"  figures     {len(composed)}")
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
    for (slug, document), (system, user) in composed:
        reply, usage, finish_reason, seconds = caller(
            provider=provider, model_id=model_id, system=system, user=user,
            kwargs=whole_doc.judge_kwargs(args.model, model_id, config))
        if not (reply or "").strip():
            continue
        record["cells"][f"{slug}\n{document}"] = {
            "behaviour": slug, "document": document,
            "text": reply.strip(), "finish_reason": finish_reason,
            "seconds": seconds,
            "cost_usd": batch_job.cost_of(args.model, usage, config),
        }
        written += 1
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(record, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"written to {out}")
    print(f"  {written} paragraphs this pass, {len(record['cells'])} in the file")
    return 0


if __name__ == "__main__":
    sys.exit(main())
