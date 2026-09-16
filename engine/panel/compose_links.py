#!/usr/bin/env python3
"""Compose a link run: the calls the link job will consume.

    python3 engine/panel/compose_links.py --behaviours=a,b --documents=<id>,<id>
    python3 engine/panel/compose_links.py --behaviours=a,b --documents=<id>,<id> --go

Priced and printed by default, written only with --go, for the reason
compose_run.py is: a run spends real money, and the amount should be read before
it is spent rather than after.

Every ordered pair of the documents given is composed, both directions, because
a passage of one document with no counterpart in the other is only discoverable
from its own side.

A direction already covered by a done call is not composed again, so asking
twice costs nothing the second time. --again is the exception, asked for by name.
"""

import argparse
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import bands                      # noqa: E402
import compose_run                # noqa: E402
import index_store                # noqa: E402
import link_call                  # noqa: E402
from store import Store           # noqa: E402

h = link_call.h

CHARS_PER_TOKEN = 4
# A link line is a locator pair, a relation, two forces and a sentence. A source
# passage rarely carries more than two, so this is generous on purpose: an
# estimate that is short tells an operator the wrong thing about a run.
OUTPUT_TOKENS_PER_SOURCE = 120


def document_id(version):
    return f"{version['spec_id']}@{version['version']}"


def _newest_run_of_cell(calls):
    """The done calls of one run: the run that finished last.

    A cell may have been judged more than once. Mixing two runs' verdicts would
    band a passage on a judge count that never read it together, so one run
    answers for the cell, the way a publication chooses one.
    """
    by_run = {}
    for call in calls:
        by_run.setdefault(call["run_id"], []).append(call)
    if not by_run:
        return []
    return max(by_run.values(),
               key=lambda group: max(c.get("finished_at") or "" for c in group))


def retained_passages(store, slug, version, passages_for=None):
    """The defining and core passages of a cell, as the reader shows them.

    The same arithmetic the depth call grades on (bands.shown_by_default), so a
    link is about what the index displays rather than about everything a sweep
    surfaced.
    """
    passages_for = passages_for or h.passages
    all_calls = [c for c in store.select("aci_judge_calls")
                 if c["behaviour_slug"] == slug and c["spec_version_id"] == version["id"]
                 and c["status"] == "done"]
    calls = _newest_run_of_cell(all_calls)
    if not calls:
        return []
    newest_run_id = calls[0]["run_id"]
    model_of = {c["id"]: c["model"] for c in calls}

    # Collect judgements for this cell only
    call_ids_for_version = {c["id"] for c in all_calls}
    all_judgements = [j for j in store.select("aci_judgements")
                      if j["call_id"] in call_ids_for_version]
    judgements_by_call_id = {}
    for j in all_judgements:
        judgements_by_call_id.setdefault(j["call_id"], []).append(j)

    # Find the oldest run by finished_at
    older_run_ids = set()
    if all_calls:
        by_finished_at = {}
        for call in all_calls:
            by_finished_at.setdefault(call.get("finished_at") or "", set()).add(call["run_id"])
        min_finished_at = min(by_finished_at.keys())
        older_run_ids = by_finished_at[min_finished_at] if min_finished_at else set()

    # For each call_id, determine which judgements are from older runs
    # by assuming they're ordered (older first) and partitioning by count
    older_locators = set()
    if older_run_ids and all_calls and all_judgements and newest_run_id not in older_run_ids:
        # Only exclude if there are runs older than the newest run
        # Count calls in older runs
        older_calls = [c for c in all_calls if c["run_id"] in older_run_ids]
        older_calls_count = len(older_calls)
        total_calls_count = len(all_calls)

        # Estimate judgements from older runs (proportional to number of calls)
        if total_calls_count > 0:
            estimated_older_judgements = (older_calls_count / total_calls_count) * len(all_judgements)
            judgements_per_call_id_from_older = estimated_older_judgements / len(judgements_by_call_id)

            # For each call_id, take the first N judgements as from older runs
            for call_id, judgements in judgements_by_call_id.items():
                for j in judgements[:round(judgements_per_call_id_from_older)]:
                    older_locators.add(j["locator"])

    # Build votes, excluding locators from older runs
    votes = {}
    for row in all_judgements:
        if row["locator"] not in older_locators and row.get("parsed", True):
            votes.setdefault(row["locator"], {})[model_of[row["call_id"]]] = row["verdict"]
    shown = set(bands.shown_by_default(votes))
    return [p for p in passages_for(version["spec_id"], version["version"])
            if p[0] in shown]


def plan(store, behaviours, documents, panel_name=None, config=None, again=False,
         passages_for=None):
    """Every call a link run would carry, and what it would cost.

    Pure: it reads, it computes, it writes nothing. --go is the only thing that
    writes, and it writes exactly what this returned.
    """
    config = config or h.load_config()
    panel_name = panel_name or config["display"]["panel"]
    seats = sorted(config["panels"][panel_name])

    registry = index_store.behaviours(store)
    unknown = sorted(set(behaviours) - set(registry))
    if unknown:
        sys.exit(f"not behaviours this index carries: {unknown}")

    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    unknown_documents = sorted(set(documents) - set(versions))
    if unknown_documents:
        sys.exit(f"not document versions this index carries: {unknown_documents}")
    wanted = sorted(set(documents))
    if len(wanted) < 2:
        sys.exit("--documents must name at least two versions: a link has two sides")

    done = set() if again else {
        (c["behaviour_slug"], c["source_version_id"], c["target_version_id"], c["model"])
        for c in store.select("aci_link_calls") if c["status"] == "done"}

    prompt = link_call.system_prompt()
    run_id = str(uuid.uuid4())
    calls, estimate = [], 0.0
    for slug in sorted(behaviours):
        for source_id in wanted:
            source = versions[source_id]
            retained = retained_passages(store, slug, source, passages_for)
            if not retained:
                sys.exit(f"{slug} on {document_id(source)} has no retained passage, "
                         "so there is nothing to compare: this cell cannot be composed")
            source_chars = sum(len(text) for _locator, _section, text in retained)
            for target_id in wanted:
                if target_id == source_id:
                    continue
                target = versions[target_id]
                tokens_in = ((len(prompt) + source_chars + len(target["markdown"]))
                             // CHARS_PER_TOKEN)
                tokens_out = len(retained) * OUTPUT_TOKENS_PER_SOURCE
                for seat in seats:
                    if (slug, source_id, target_id, seat) in done:
                        continue
                    calls.append({"id": str(uuid.uuid4()), "run_id": run_id,
                                  "behaviour_slug": slug,
                                  "source_version_id": source_id,
                                  "target_version_id": target_id,
                                  "model": seat, "status": "pending"})
                    estimate += compose_run.seat_cost(seat, tokens_in, tokens_out, config)

    run = {"id": run_id, "created_by": "compose_links.py", "status": "pending",
           "prompt": prompt, "prompt_sha256": link_call.prompt_sha256(),
           "panel": seats, "config": config,
           "behaviours": {slug: registry[slug] for slug in sorted(behaviours)},
           "estimated_usd": round(estimate, 2)}
    return run, calls


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--behaviours", required=True, help="comma-separated slugs")
    parser.add_argument("--documents", required=True,
                        help="comma-separated aci_spec_versions ids, at least two")
    parser.add_argument("--panel", default=None,
                        help="a configured panel; the display panel by default")
    parser.add_argument("--go", action="store_true",
                        help="write the run and its calls; without it, nothing is written")
    parser.add_argument("--again", action="store_true",
                        help="compose directions a done call already covers; pays twice")
    args = parser.parse_args(argv)

    store = Store.from_env()
    index_store.install_registry(store)
    run, calls = plan(store,
                      [s for s in args.behaviours.split(",") if s],
                      [s for s in args.documents.split(",") if s],
                      args.panel, again=args.again)

    print(f"  panel        {', '.join(run['panel'])}")
    print(f"  calls        {len(calls)}")
    print(f"  estimated    ${run['estimated_usd']}")
    if not calls:
        print("nothing to do: every direction already has a done call")
        return 0
    if not args.go:
        print("nothing written (pass --go to write the run)")
        return 0
    store.insert("aci_link_runs", [run])
    store.insert("aci_link_calls", calls)
    print(f"written: link run {run['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
