#!/usr/bin/env python3
"""Give a depth out of ten to the done calls of runs already judged.

    python3 engine/panel/depth_pass.py --runs=<run id>,<run id> --assessment-run=<id>
    python3 engine/panel/depth_pass.py --runs=<run id>,<run id> --assessment-run=<id> --go

Priced and printed by default, given and written only with --go, because a pass
spends real money and the amount should be read before it is spent. The price
is an estimate and, beside it, a ceiling: every call the ladder can make for
every depth, each billed at its model's largest output.

A depth out of ten reads the same evidence a depth on the scale of four does,
the passages `batch_job.pending_depths` would retain for a cell, and one more
block besides: the document's general rules for conflicts, taken from an
assessment of that document already run and stored (`engine/assess.py`). The
assessment run is held to what a publication holds it to
(`index_store.assessment_gaps`): finished, every seat of both questions
answered, every criterion scored, every claim read by every seat. Depths given
against an assessment the publication would refuse could never be published,
so a gap stops the pass before it is priced or writes anything, naming every
gap at once.

Writing is in two steps, kept separate so the command can be asked twice for
the same runs at no extra cost. First, every done call of the named runs gets
a pending row of `aci_depths_out_of_ten`, keyed by the call, the current
prompt of ten and the named assessment run, unless one already exists: a row
already there, whatever its status, is left alone. Second, every cell whose
calls are all done is given its depths through `depth_ladder.give`, one call
per judge, writing each row `done` or `error` by its own id, never by its
call id, since a call can carry more than one row across assessment runs and
prompts. A pass interrupted mid-depth writes that row `error` with every
attempt already billed before the interruption goes on.

A model that cannot be reached is waited for (`seat_call.RETRY_WAITS`), and if
it still cannot be, the pass stops the same way: the row it was giving is
written `error`, `unreachable: ...`, with every attempt already billed, and the
command exits 1. Running the same command again takes it up where it stopped:
a row already done is left alone, and one in error is given again in place,
its earlier attempts and cost kept.
"""

import argparse
import os
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
# The panel whose declared substitutes stand in for a seat, as the ladder reads it.
PANEL = "frontier_fast"


def now():
    return datetime.now(timezone.utc).isoformat()


def _sum(values):
    known = [value for value in values if value is not None]
    return round(sum(known), 6) if known else None


def _name(version):
    return f"{version['spec_id']}@{version['version']}"


def require_assessed(store, assessment_run_id, version_ids, versions):
    """{version id: {"calls", "scores", "claims", "verdicts"}}, the rows
    `assessment_run_id` wrote about each document of `version_ids`, when it
    stands for every one of them as a publication requires.

    Otherwise raises SystemExit naming every gap at once, from
    `index_store.assessment_gaps`, the rule the publication itself applies, so
    no depth is given against an assessment the publication would refuse."""
    documents = [versions[version_id] for version_id in version_ids]
    run, by_version = index_store.assessment_rows(store, assessment_run_id, version_ids)
    gaps = index_store.assessment_gaps(assessment_run_id, run, by_version, documents)
    if gaps:
        names = ", ".join(_name(document) for document in documents) or "no document"
        raise SystemExit(
            f"assessment run {assessment_run_id} does not assess every document these runs "
            f"judged ({names}) as a publication requires, so no depth given against it "
            "could be published:\n  " + "\n  ".join(gaps)
            + "\nNothing was priced or written. "
            + ("Assess these documents in a new assessment run (engine/assess.py "
               "--documents=... --go)" if run is None else
               f"Take the assessment run up where it stopped (engine/assess.py "
               f"--resume={assessment_run_id} --documents=... --go), which asks only the calls "
               "not done and says when a document can only be assessed in a new assessment "
               "run instead")
            + ", then give the depths against the run that stands.")
    return by_version


def conflict_rules_for(rows, version, passages_for):
    """The document's general rules for conflicts, as the passages its
    criteria calls cited under `conflict_rules` in `rows` (one document's rows
    of one assessment run), resolved through `passages_for` and kept when at
    least two seats cited them.

    Locators are turned back into `assessment_run.conflict_rules`'s own
    1-based passage numbers, so the quorum rule this index already tests
    stays the one place that decides how many seats a rule needs."""
    passages = passages_for(version["spec_id"], version["version"])
    index_of = {locator: i + 1 for i, (locator, _section, _text) in enumerate(passages)}
    seat_of = {c["id"]: c["seat"] for c in rows["calls"] if c["question"] == "criteria"}
    by_seat = {}
    for score in rows["scores"]:
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
    this assessment run.

    `seated` is one set per cell, shared by that cell's jobs: the models of
    the cell's own calls, and every model that has already given one of its
    depths, a substitute of an earlier done row included. `give_pass` adds to
    it the model that gives each depth in this pass, so `depth_ladder.give`
    refuses a second depth of one cell from any model.

    Raises SystemExit, naming every gap, before reading or writing anything
    else, when the assessment run does not stand for a document of any done
    call of `run_ids` (`require_assessed`): this covers every call a pending
    row would be written for, not only the calls of a cell whole enough to be
    given a depth."""
    touched_versions = sorted({c["spec_version_id"] for c in store.select("aci_judge_calls")
                              if c["run_id"] in run_ids and c["status"] == "done"})
    assessed = require_assessed(store, assessment_run_id, touched_versions, versions)

    prompt = depth_call.prompt_sha256(10)
    done = {d["call_id"]: d for d in store.select("aci_depths_out_of_ten")
            if d["status"] == "done" and d["prompt_sha256"] == prompt
            and d["assessment_run_id"] == assessment_run_id}
    ready = ready_cells(store, run_ids)

    judgements = store.select("aci_judgements") if ready else []
    rules_of = {}
    jobs = []
    for key, cell in sorted(ready.items()):
        _run_id, _slug, version_id = key
        version = versions[version_id]
        retained = batch_job.retained_passages(cell, judgements, passages_for, version)
        if version_id not in rules_of:
            rules_of[version_id] = conflict_rules_for(assessed[version_id], version,
                                                       passages_for)
        rules = rules_of[version_id]
        seated = ({c["model"] for c in cell}
                  | {done[c["id"]]["model"] for c in cell
                     if c["id"] in done and done[c["id"]].get("model")})
        for call in cell:
            if call["id"] in done:
                continue
            jobs.append((call, retained, rules, seated))
    return jobs


def worst_case_calls(tag, config, panel=PANEL):
    """The most calls `depth_ladder.give` can make for `tag` before it answers
    or gives up: three of `tag`'s own model, plain then each reminder, plus two
    of every substitute `panel` declares for `tag`, plain then the first
    reminder. A substitute skipped as already seated is not a call, so this is
    the worst case before any seating is known."""
    return len(depth_ladder.attempts_at_most(tag, config, panel))


def ceiling_of(tag, system, user, config, panel=PANEL):
    """The most one depth can cost: every call the ladder can make for `tag`,
    in order (the seat's own model, then each declared substitute), each billed
    at its input estimate and at its model's largest output."""
    return sum(seat_call.priced(model, system, depth_ladder.user_for(user, reminder),
                                seat_call.max_output(model, config), config)
               for model, reminder in depth_ladder.attempts_at_most(tag, config, panel))


def price(jobs, registry, config):
    """What giving these depths would cost: one call per depth, at the seat's
    own model. A cell with nothing retained costs nothing, since it is given
    without a call. Returns (estimate, priced count, {seat: worst case calls},
    ceiling), the worst case for the seats actually present among the depths
    that will make a call, and the ceiling every one of those depths reaching
    the end of its ladder at its models' largest output."""
    estimate, priced_count, ceiling = 0.0, 0, 0.0
    worst_case = {}
    for call, retained, rules, _seated in jobs:
        if not retained:
            continue
        worst_case.setdefault(call["model"], worst_case_calls(call["model"], config))
        system, user = depth_call.compose(call["behaviour_slug"], registry, retained,
                                          scale=10, conflict_rules=rules)
        estimate += seat_call.priced(call["model"], system, user, PRICE_OUTPUT_TOKENS, config)
        ceiling += ceiling_of(call["model"], system, user, config)
        priced_count += 1
    return round(estimate, 2), priced_count, worst_case, round(ceiling, 2)


def give_one(store, call, retained, rules, registry, config, call_model, row, report, seated=None):
    """One judge's depth out of ten for its call's cell, written running then
    done or error by the row's own id. Returns the model that gave the depth,
    the seat's own or a substitute, or None when nothing did or no call was
    made.

    When `row` already carries `attempts` from an earlier pass that left it in
    error, this pass's attempts are appended to them rather than replacing
    them, and its cost and tokens add to the row's earlier totals: a row given
    again keeps the bill of what it already spent, on top of what giving it
    again costs.

    Anything that stops this depth once the ladder has started, a
    `KeyboardInterrupt`, a model that could not be reached
    (`seat_call.Unreachable`, recorded as `unreachable: ...`) or a final write
    that fails, writes the row `error` with every attempt already billed and
    its cost, then goes on being raised: the attempts are the list
    `depth_ladder.give` was filling in place."""
    row_id = row["id"]
    match = {"id": row_id}
    store.update("aci_depths_out_of_ten", match, {"status": "running", "started_at": now()})
    if not retained:
        store.update("aci_depths_out_of_ten", match, {
            "status": "done", "depth": 0, "rationale": depth_call.NOTHING_RETAINED,
            "passages": 0, "cost_usd": 0, "finished_at": now()})
        report["done"] += 1
        return None

    system, user = depth_call.compose(call["behaviour_slug"], registry, retained,
                                      scale=10, conflict_rules=rules)
    billed = []
    # An already-seated skip carries no "cost_usd" key at all, not merely None.
    try:
        result = depth_ladder.give(call["model"], system, user, config, call_model,
                                   seated=seated, attempts=billed)
        new_cost = _sum(attempt.get("cost_usd") for attempt in billed)
        patch = {"attempts": (row.get("attempts") or []) + billed, "passages": len(retained),
                 "prompt_tokens": _sum([row.get("prompt_tokens"), result["prompt_tokens"]]),
                 "completion_tokens": _sum([row.get("completion_tokens"),
                                            result["completion_tokens"]]),
                 "seconds": result["seconds"],
                 "cost_usd": _sum([row.get("cost_usd"), new_cost]),
                 "finished_at": now()}
        if result["substitution_reason"] is not None:
            # Never the seat's own model: the table's check refuses a model with
            # no reason, and give() names the seat itself when the seat answered.
            patch["model"] = result["model"]
            patch["substitution_reason"] = result["substitution_reason"]
        if result["depth"] is None:
            # The last reply that came back at all, not merely the last element
            # of replies: an attempt that raised leaves a None there, which would
            # otherwise throw away an earlier attempt's actual text. Capped as
            # batch_job.one_depth caps the scale of four's own raw_output.
            last_reply = next((reply for reply in reversed(result["replies"])
                               if reply is not None), None)
            patch.update(status="error",
                         error=f"no depth parsed after {len(result['attempts'])} attempt(s)",
                         raw_output=last_reply[:20000] if last_reply is not None else None)
        else:
            # raw_output=None clears whatever a previous failed attempt on this
            # same row left behind: a row that errors and is then retried into
            # done must not go on carrying a stale unparsed reply.
            patch.update(status="done", depth=result["depth"],
                         rationale=result["rationale"] or "", error=None, raw_output=None)
        store.update("aci_depths_out_of_ten", match, patch)
    except BaseException as stopped:
        stopped_patch = {
            "status": "error", "error": seat_call.stop_error(stopped),
            "attempts": (row.get("attempts") or []) + billed,
            "cost_usd": _sum([row.get("cost_usd"),
                              _sum(attempt.get("cost_usd") for attempt in billed)]),
            "finished_at": now()}
        try:
            store.update("aci_depths_out_of_ten", match, stopped_patch)
        except Exception as failed:                      # noqa: BLE001
            print(f"depth row {row_id} could not be marked error after {stopped!r}: "
                  f"{failed}. It is left running with {len(billed)} attempt(s) billed; "
                  "find and close it by hand.", file=sys.stderr)
        raise
    if result["depth"] is None:
        report["failed"] += 1
        return None
    report["done"] += 1
    return result["model"]


def give_pass(store, config, run_ids, assessment_run_id, passages_for, call_model=None,
              go=False, registry=None):
    """Price giving a depth out of ten to every eligible call of `run_ids`,
    and, with `go`, give them and write the rows.

    Returns (the price in dollars, a {"done", "failed"} report, or None
    without `go`)."""
    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    jobs = jobs_for(store, run_ids, assessment_run_id, passages_for, versions)
    registry = registry if registry is not None else index_store.judging_registry(store)

    estimate, priced_count, worst_case, ceiling = price(jobs, registry, config)
    detail = "; ".join(f"{seat} up to {worst_case[seat]}" for seat in sorted(worst_case))
    warning = ("A depth that does not parse can cost the ladder more calls before it "
               "answers or gives up")
    print(f"Priced at about {estimate} dollars for {priced_count} depth(s), one call each. "
          f"{warning}{f': {detail}.' if detail else '.'} "
          f"That sets a ceiling of {ceiling} dollars, the most this pass can cost: every "
          "depth through every call of its ladder, each billed at its model's largest output.")
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
        given_by = give_one(store, call, retained, rules, registry, config, call_model, row,
                            report, seated=seated)
        if given_by is not None:
            # The cell's own set, shared by its later jobs.
            seated.add(given_by)
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
    # Before the store is opened: an id that is not one is refused by name.
    assessment_run_id = index_store.assessment_run_id(args.assessment_run)

    store = Store.from_env()
    index_store.install_registry(store)
    config = h.load_config()
    run_ids = parse_run_ids(args.runs, store)
    if args.go and os.environ.get("ANTHROPIC_API_KEY"):
        print(seat_call.ANTHROPIC_KEY_NOTE, file=sys.stderr)
    try:
        _estimate, report = give_pass(store, config, run_ids, assessment_run_id, h.passages,
                                      go=args.go)
    except seat_call.Unreachable as stopped:
        print(f"The depth pass stopped: {stopped}. The depth it was giving is written error "
              "with every attempt it had billed. Once the connection is back, run the same "
              "command again to take it up where it stopped: it gives every depth that is "
              "not done, and keeps what each has already billed.", file=sys.stderr)
        return 1
    if not args.go:
        print("Nothing was written; run again with --go.")
        return 0
    print(f"depths out of ten: {report['done']} done, {report['failed']} failed")
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
