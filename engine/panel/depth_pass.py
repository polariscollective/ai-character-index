#!/usr/bin/env python3
"""Give a depth out of ten to the done calls of runs already judged.

    python3 engine/panel/depth_pass.py --runs=<run id>,<run id> --assessment-run=<id>
    python3 engine/panel/depth_pass.py --runs=<run id>,<run id> --assessment-run=<id> --go

Priced and printed by default, given and written only with --go, because a pass
spends real money and the amount should be read before it is spent.

A depth out of ten reads the same evidence a depth on the scale of four does,
the passages `batch_job.pending_depths` would retain for a cell, and one more
block besides: the document's general rules for conflicts, taken from an
assessment of that document already run and stored (`engine/assess.py`). A
document the named assessment run never read cannot be given a depth out of
ten, so this refuses before writing anything rather than half-writing a pass
that would have no rules block for some of its cells.

Writing is in two steps, kept separate so the command can be asked twice for
the same runs at no extra cost. First, every done call of the named runs gets
a pending row of `aci_depths_out_of_ten`, keyed by the call, the current
prompt of ten and the named assessment run, unless one already exists: a row
already there, whatever its status, is left alone. Second, every cell whose
calls are all done is given its depths through `depth_ladder.give`, one call
per judge, writing each row `done` or `error` by its own id, never by its
call id, since a call can carry more than one row across assessment runs and
prompts.
"""

import argparse
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))          # depth_call, depth_ladder, seat_call, batch_job
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import assessment_run            # noqa: E402
import batch_job                 # noqa: E402
import depth_call                # noqa: E402
import depth_ladder              # noqa: E402
import index_store               # noqa: E402
import seat_call                 # noqa: E402
from store import Store          # noqa: E402

h = batch_job.h

# Generous for a rationale sentence after the two-line answer: the pilot's
# replies on this scale ran to a few dozen words at most.
PRICE_OUTPUT_TOKENS = 700


def now():
    return datetime.now(timezone.utc).isoformat()


def _sum(values):
    known = [value for value in values if value is not None]
    return round(sum(known), 6) if known else None


def missing_criteria_seats(store, assessment_run_id, version_id):
    """The seats of `assessment_run_id`'s criteria panel whose criteria call for
    `version_id` is missing or not done: what it means for the run to have
    assessed the document, since a criteria call is the one that reads the
    document's general rules for conflicts. Every criteria call is missing,
    named as such rather than by seat, when the run itself does not exist,
    since there is then no panel to name them from."""
    runs = [r for r in store.select("aci_assessment_runs") if r["id"] == assessment_run_id]
    if not runs:
        return ["(the assessment run does not exist)"]
    seats = runs[0].get("panels", {}).get("criteria", [])
    done = {c["seat"] for c in store.select("aci_assessment_calls")
            if c["run_id"] == assessment_run_id and c["spec_version_id"] == version_id
            and c["question"] == "criteria" and c["status"] == "done"}
    return [seat for seat in seats if seat not in done]


def refuse_if_unassessed(store, assessment_run_id, version_ids, versions):
    """Raises SystemExit, naming every one, when a document among `version_ids`
    is not assessed: some seat of the run's criteria panel has no done criteria
    call for it."""
    missing = {v: missing_criteria_seats(store, assessment_run_id, v) for v in version_ids}
    missing = {v: seats for v, seats in missing.items() if seats}
    if not missing:
        return
    parts = [f"{versions[v]['spec_id']}@{versions[v]['version']} (seats: {', '.join(seats)})"
            for v, seats in sorted(missing.items())]
    raise SystemExit(
        f"the assessment run {assessment_run_id} has not fully read: " + "; ".join(parts))


def conflict_rules_for(store, assessment_run_id, version, passages_for):
    """The document's general rules for conflicts, as the passages its
    criteria calls in `assessment_run_id` cited under `conflict_rules`,
    resolved through `passages_for` and kept when at least two seats cited
    them.

    Locators are turned back into `assessment_run.conflict_rules`'s own
    1-based passage numbers, so the quorum rule this index already tests
    stays the one place that decides how many seats a rule needs."""
    passages = passages_for(version["spec_id"], version["version"])
    index_of = {locator: i + 1 for i, (locator, _section, _text) in enumerate(passages)}
    calls = [c for c in store.select("aci_assessment_calls")
            if c["run_id"] == assessment_run_id and c["spec_version_id"] == version["id"]
            and c["question"] == "criteria"]
    seat_of = {c["id"]: c["seat"] for c in calls}
    by_seat = {}
    for score in store.select("aci_assessment_scores"):
        seat = seat_of.get(score["call_id"])
        if seat is None or score["criterion"] != "conflict_rules":
            continue
        numbers = [index_of[locator] for locator in score["locators"] if locator in index_of]
        by_seat[seat] = {"conflict_rule_passages": numbers}
    return assessment_run.conflict_rules(by_seat, passages)


def ready_cells(store, run_ids):
    """{(run_id, behaviour_slug, spec_version_id): [calls]} for every cell of
    `run_ids` whose calls are all done. A cell is scoped to one run, as it
    already is for the scale of four: a publication reads one run's judges
    for a cell, never a mix."""
    calls = [c for c in store.select("aci_judge_calls") if c["run_id"] in run_ids]
    cells = {}
    for call in calls:
        cells.setdefault((call["run_id"], call["behaviour_slug"], call["spec_version_id"]),
                         []).append(call)
    return {key: cell for key, cell in cells.items()
            if cell and all(c["status"] == "done" for c in cell)}


def jobs_for(store, run_ids, assessment_run_id, passages_for, versions):
    """[(call, retained passages, conflict rules, seated models)] ready to be
    given a depth out of ten: every call of a whole cell of `run_ids` that has
    no done row of `aci_depths_out_of_ten` for the current prompt of ten and
    this assessment run. `seated` is the models of the cell's own done calls,
    for `depth_ladder.give` to refuse a second depth from one of them.

    Raises SystemExit, naming every one, before reading or writing anything
    else, when a document of any done call of `run_ids` is not assessed: this
    covers every call a pending row would be written for, not only the calls
    of a cell whole enough to be given a depth."""
    prompt = depth_call.prompt_sha256(10)
    done = {(d["call_id"], d["prompt_sha256"], d["assessment_run_id"])
           for d in store.select("aci_depths_out_of_ten") if d["status"] == "done"}
    ready = ready_cells(store, run_ids)

    touched_versions = sorted({c["spec_version_id"] for c in store.select("aci_judge_calls")
                              if c["run_id"] in run_ids and c["status"] == "done"})
    refuse_if_unassessed(store, assessment_run_id, touched_versions, versions)

    judgements = store.select("aci_judgements") if ready else []
    rules_of = {}
    jobs = []
    for key, cell in sorted(ready.items()):
        _run_id, _slug, version_id = key
        version = versions[version_id]
        retained = batch_job.retained_passages(cell, judgements, passages_for, version)
        if version_id not in rules_of:
            rules_of[version_id] = conflict_rules_for(store, assessment_run_id, version,
                                                       passages_for)
        rules = rules_of[version_id]
        seated = {c["model"] for c in cell}
        for call in cell:
            if (call["id"], prompt, assessment_run_id) in done:
                continue
            jobs.append((call, retained, rules, seated))
    return jobs


def worst_case_calls(tag, config, panel="frontier_fast"):
    """The most calls `depth_ladder.give` can make for `tag` before it answers
    or gives up: three of `tag`'s own model, plain then each reminder, plus two
    of every substitute `panel` declares for `tag`, plain then the first
    reminder. A substitute skipped as already seated is not a call, so this is
    the worst case before any seating is known."""
    substitutes = config.get("substitutes", {}).get(panel, {}).get(tag, [])
    return 3 + 2 * len(substitutes)


def price(jobs, registry, config):
    """What giving these depths would cost: one call per depth, at the seat's
    own model. A cell with nothing retained costs nothing, since it is given
    without a call. Returns (estimate, priced count, {seat: worst case calls})
    for the seats actually present among the depths that will make a call."""
    estimate, priced_count = 0.0, 0
    worst_case = {}
    for call, retained, rules, _seated in jobs:
        if not retained:
            continue
        worst_case.setdefault(call["model"], worst_case_calls(call["model"], config))
        system, user = depth_call.compose(call["behaviour_slug"], registry, retained,
                                          scale=10, conflict_rules=rules)
        estimate += seat_call.priced(call["model"], system, user, PRICE_OUTPUT_TOKENS, config)
        priced_count += 1
    return round(estimate, 2), priced_count, worst_case


def give_one(store, call, retained, rules, registry, config, call_model, row, report, seated=None):
    """One judge's depth out of ten for its call's cell, written running then
    done or error by the row's own id.

    When `row` already carries `attempts` from an earlier pass that left it in
    error, this pass's attempts are appended to them rather than replacing
    them, and its cost and tokens add to the row's earlier totals: a row given
    again keeps the bill of what it already spent, on top of what giving it
    again costs."""
    row_id = row["id"]
    match = {"id": row_id}
    store.update("aci_depths_out_of_ten", match, {"status": "running", "started_at": now()})
    if not retained:
        store.update("aci_depths_out_of_ten", match, {
            "status": "done", "depth": 0, "rationale": depth_call.NOTHING_RETAINED,
            "passages": 0, "cost_usd": 0, "finished_at": now()})
        report["done"] += 1
        return

    system, user = depth_call.compose(call["behaviour_slug"], registry, retained,
                                      scale=10, conflict_rules=rules)
    result = depth_ladder.give(call["model"], system, user, config, call_model, seated=seated)
    attempts = (row.get("attempts") or []) + result["attempts"]
    # An already-seated skip carries no "cost_usd" key at all, not merely None.
    new_cost = _sum(attempt.get("cost_usd") for attempt in result["attempts"])
    patch = {"attempts": attempts, "passages": len(retained),
             "prompt_tokens": _sum([row.get("prompt_tokens"), result["prompt_tokens"]]),
             "completion_tokens": _sum([row.get("completion_tokens"), result["completion_tokens"]]),
             "seconds": result["seconds"],
             "cost_usd": _sum([row.get("cost_usd"), new_cost]),
             "finished_at": now()}
    if result["substitution_reason"] is not None:
        # Never the seat's own model: the table's check refuses a model with
        # no reason, and give() names the seat itself when the seat answered.
        patch["model"] = result["model"]
        patch["substitution_reason"] = result["substitution_reason"]
    if result["depth"] is None:
        # The last reply that came back at all, not merely the last element of
        # replies: an attempt that raised leaves a None there, which would
        # otherwise throw away an earlier attempt's actual text. Capped as
        # batch_job.one_depth caps the scale of four's own raw_output.
        last_reply = next((reply for reply in reversed(result["replies"]) if reply is not None),
                          None)
        patch.update(status="error",
                     error=f"no depth parsed after {len(result['attempts'])} attempt(s)",
                     raw_output=last_reply[:20000] if last_reply is not None else None)
        report["failed"] += 1
    else:
        # raw_output=None clears whatever a previous failed attempt on this
        # same row left behind: a row that errors and is then retried into
        # done must not go on carrying a stale unparsed reply.
        patch.update(status="done", depth=result["depth"], rationale=result["rationale"] or "",
                     error=None, raw_output=None)
        report["done"] += 1
    store.update("aci_depths_out_of_ten", match, patch)


def give_pass(store, config, run_ids, assessment_run_id, passages_for, call_model=None,
              go=False, registry=None):
    """Price giving a depth out of ten to every eligible call of `run_ids`,
    and, with `go`, give them and write the rows.

    Returns (the price in dollars, a {"done", "failed"} report, or None
    without `go`)."""
    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    registry = registry if registry is not None else index_store.judging_registry(store)
    jobs = jobs_for(store, run_ids, assessment_run_id, passages_for, versions)

    estimate, priced_count, worst_case = price(jobs, registry, config)
    detail = "; ".join(f"{seat} up to {worst_case[seat]}" for seat in sorted(worst_case))
    warning = ("A depth that does not parse can cost the ladder more calls before it "
              "answers or gives up")
    print(f"Priced at about {estimate} dollars for {priced_count} depth(s), one call each. "
          f"{warning}{f': {detail}.' if detail else '.'}")
    if not go:
        return estimate, None

    call_model = call_model or batch_job.call_openrouter
    prompt = depth_call.prompt_sha256(10)

    done_calls = [c for c in store.select("aci_judge_calls")
                 if c["run_id"] in run_ids and c["status"] == "done"]
    existing = {(d["call_id"], d["prompt_sha256"], d["assessment_run_id"])
               for d in store.select("aci_depths_out_of_ten")}
    to_insert = [
        {"id": str(uuid.uuid4()), "call_id": c["id"], "prompt_sha256": prompt,
         "assessment_run_id": assessment_run_id, "status": "pending"}
        for c in done_calls if (c["id"], prompt, assessment_run_id) not in existing]
    if to_insert:
        store.insert("aci_depths_out_of_ten", to_insert)

    rows_by_call = {d["call_id"]: d for d in store.select("aci_depths_out_of_ten")
                   if d["prompt_sha256"] == prompt and d["assessment_run_id"] == assessment_run_id}

    report = {"done": 0, "failed": 0}
    for call, retained, rules, seated in jobs:
        row = rows_by_call[call["id"]]
        give_one(store, call, retained, rules, registry, config, call_model, row, report,
                seated=seated)
    return estimate, report


def parse_run_ids(raw, store):
    """The run ids of `raw`, comma-separated and stripped of surrounding
    whitespace, refusing before anything is written when one is not the full
    id of a run in aci_runs."""
    ids = [part.strip() for part in raw.split(",") if part.strip()]
    known = {r["id"] for r in store.select("aci_runs")}
    unknown = [run_id for run_id in ids if run_id not in known]
    if unknown:
        raise SystemExit(f"--runs names a run that does not exist: {', '.join(unknown)}")
    return ids


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--runs", required=True, help="comma-separated aci_runs ids")
    parser.add_argument("--assessment-run", required=True, dest="assessment_run",
                        help="aci_assessment_runs id supplying the document's conflict rules")
    parser.add_argument("--go", action="store_true",
                        help="spend and write; without it the pass is only priced")
    args = parser.parse_args(argv)

    store = Store.from_env()
    index_store.install_registry(store)
    config = h.load_config()
    run_ids = parse_run_ids(args.runs, store)
    _estimate, report = give_pass(store, config, run_ids, args.assessment_run, h.passages,
                                  go=args.go)
    if not args.go:
        print("Nothing was written; run again with --go.")
        return 0
    print(f"depths out of ten: {report['done']} done, {report['failed']} failed")
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
