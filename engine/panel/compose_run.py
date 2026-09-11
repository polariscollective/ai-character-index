#!/usr/bin/env python3
"""Compose a run: the rows the job will consume.

    python3 engine/panel/compose_run.py --behaviours=a,b --specs=x,y     # priced, not written
    python3 engine/panel/compose_run.py --behaviours=a,b --specs=x,y --go

Priced and printed by default, written only with --go, because a run spends real
money and the amount should be read before it is spent rather than after.

This is the CLI half of composing a run. The admin surface will do the same
thing from a button; what it writes is these rows, and the job does not care
which put them there.

A cell already covered by a `done` call is not composed again. That makes this
safe to re-run: asking twice for the same work costs nothing the second time.
"""

import argparse
import hashlib
import json
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import index_store               # noqa: E402
import judge_call                # noqa: E402
from store import Store          # noqa: E402

h = judge_call.h

# Four characters per token is the estimate the panel's own cost notes use. It is
# a rough number and says so: what it is for is telling the difference between a
# two-dollar run and a two-hundred-dollar one.
CHARS_PER_TOKEN = 4
OUTPUT_TOKENS_PER_PASSAGE = 8


def plan(store, behaviours, specs, panel_name, rubric="v5", config=None):
    """Every call a run would carry, and what it would cost.

    Pure: it reads, it computes, it writes nothing. --go is the only thing that
    writes, and it writes exactly what this returned.
    """
    config = config or h.load_config()
    seats = sorted(h.resolve_panel_seats(config, panel_name)
                   if hasattr(h, "resolve_panel_seats")
                   else config["panels"][panel_name])

    registry = index_store.behaviours(store)
    unknown = sorted(set(behaviours) - set(registry))
    if unknown:
        sys.exit(f"not behaviours this index carries: {unknown}")

    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    by_spec = {}
    for version in versions.values():
        current = by_spec.get(version["spec_id"])
        if current is None or version["version"] > current["version"]:
            by_spec[version["spec_id"]] = version
    unknown_specs = sorted(set(specs) - set(by_spec))
    if unknown_specs:
        sys.exit(f"not specs this index carries: {unknown_specs}")

    # Cells a done call already covers, so asking twice costs nothing twice.
    done = {(c["behaviour_slug"], c["spec_version_id"], c["model"])
            for c in store.select("aci_judge_calls") if c["status"] == "done"}

    prompt = judge_call.system_prompt(rubric)
    run_id = str(uuid.uuid4())
    calls, estimate = [], 0.0
    for slug in sorted(behaviours):
        for spec in sorted(specs):
            version = by_spec[spec]
            tokens_in = len(version["markdown"]) // CHARS_PER_TOKEN
            passages = len(h.passages(spec))
            for seat in seats:
                if (slug, version["id"], seat) in done:
                    continue
                calls.append({"id": str(uuid.uuid4()), "run_id": run_id,
                              "behaviour_slug": slug, "spec_version_id": version["id"],
                              "model": seat, "status": "pending"})
                estimate += seat_cost(seat, tokens_in,
                                      passages * OUTPUT_TOKENS_PER_PASSAGE, config)

    run = {"id": run_id, "created_by": "compose_run.py", "status": "pending",
           "rubric": rubric, "prompt": prompt,
           "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
           "panel": seats, "config": config | {"via": judge_call.VIA[rubric]},
           "behaviours": {slug: registry[slug] for slug in sorted(behaviours)},
           "estimated_usd": round(estimate, 2)}
    return run, calls


def seat_cost(seat, tokens_in, tokens_out, config):
    model = config["models"].get(seat, {})
    prices = (model.get("openrouter") or model).get("price_per_mtok")
    if not prices:
        return 0.0
    return tokens_in * prices[0] / 1e6 + tokens_out * prices[1] / 1e6


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--behaviours", required=True,
                        help="comma-separated slugs")
    parser.add_argument("--specs", required=True,
                        help="comma-separated spec ids; the newest version of each")
    parser.add_argument("--panel", default="frontier_fast")
    parser.add_argument("--rubric", default="v5")
    parser.add_argument("--go", action="store_true",
                        help="write the run and its calls; without it, nothing is written")
    args = parser.parse_args(argv)

    store = Store.from_env()
    index_store.install_registry(store)
    run, calls = plan(store,
                      [s for s in args.behaviours.split(",") if s],
                      [s for s in args.specs.split(",") if s],
                      args.panel, args.rubric)

    print(f"  panel        {', '.join(run['panel'])}")
    print(f"  calls        {len(calls)}")
    print(f"  estimated    ${run['estimated_usd']}")
    if not calls:
        print("nothing to do: every cell already has a done call")
        return 0
    if not args.go:
        print("nothing written (pass --go to write the run)")
        return 0
    store.insert("aci_runs", [run])
    store.insert("aci_judge_calls", calls)
    print(f"written: run {run['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
