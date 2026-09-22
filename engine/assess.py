#!/usr/bin/env python3
"""Assess documents as wholes, and store what the judges said.

    python3 engine/assess.py --documents=<version id>,<version id>        # priced, nothing written
    python3 engine/assess.py --documents=<version id>,<version id> --go   # spends, and writes
    python3 engine/assess.py --resume=<run id> --documents=<version id>,<version id>
    python3 engine/assess.py --resume=<run id> --documents=<version id>,<version id> --go

`--documents` names aci_spec_versions ids. Priced and printed by default, run and
written only with --go, because an assessment spends real money on whole
documents and the amount should be read before it is spent.

Each document is read whole by every seat of each question: the criteria by the
seats `panel-config.json`'s `assessment` block names for them, the
contradictions by its seats for those, and then each contradictions seat
confirms, on a second reading, the claims it did not find itself. A seat that
cannot answer is taken by its declared substitutes, from frontier_fast's
`substitutes` block, skipping any substitute already seated for the same
question. The rules are `engine/panel/assessment_run.py`'s; this command runs
them and writes the run, its calls, their scores, the claims and every verdict
to the `aci_assessment_` tables, through `engine/assessment_store.py`. What the scores add up to, and which claims are
confirmed, is read from those rows later rather than stored.

The price is an estimate and, beside it, a ceiling: every declared candidate of
every seat billed in turn, each at its model's largest output. Once the run row
is closed, the run is held to what a publication holds it to
(`index_store.assessment_gaps`); every gap is printed and the command exits 1,
since a depth pass or a publication would refuse the run.

A model that cannot be reached is not a refusal. The call is made again after
each of `seat_call.RETRY_WAITS`, up to eight minutes, and if the model still
cannot be reached the run stops: the call is written `error`, `unreachable:
...`, with every attempt already billed, the run is closed `error`, and the
command exits 1, naming the `--resume` that takes it up again. Any other stop,
an interrupt included, names it too. A rate limit or a server error is waited
out the same way, but its provider was reached, so if it lasts through every
wait the seat goes to its next declared substitute and the run goes on.

`--resume=<run id>` takes a run up where it stopped. `--documents` names the
documents again, in the order to assess them, and must name every document the
run already has a call for. A done call is not asked again, and any rows its
stored reply gives that are missing are written from it; a call in any other
status is asked again in its own row, its earlier bill kept and added to; a
document the run has not begun is assessed as in a fresh run. A seat asked
again starts from its own model and goes through its substitutes in order, as
it did the first time, so a refusal billed before the stop is billed again, and
so is a reply that came back but was not written done. The run must have
been started under the seats, prompts and substitutes it is taken up with. A
document whose claimed contradictions are written while one of its
contradictions seats never answered is left as it is, since asking that seat
now would change claims the others have read: only a new run can assess it. A
resume is priced like a fresh run, counting only the calls it will ask, and
spends only with --go.
"""

import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "panel"))
sys.path.insert(0, str(HERE / "spec-cite"))

import assessment_call           # noqa: E402
import assessment_run            # noqa: E402
import assessment_store          # noqa: E402
import batch_job                 # noqa: E402
import index_store               # noqa: E402
import seat_call                 # noqa: E402
from assessment_store import PANEL, name_of  # noqa: E402
from store import PATIENT_BACKOFF_SECONDS, Store  # noqa: E402

h = batch_job.h


def assessment_panels(config):
    """The seats of each question, from the configuration's `assessment` block."""
    panels = config.get("assessment") or {}
    if not all(panels.get(question) for question in assessment_call.QUESTIONS):
        raise SystemExit("panel-config.json has no `assessment` block naming the seats of "
                         f"{' and '.join(assessment_call.QUESTIONS)}")
    return {question: list(panels[question]) for question in assessment_call.QUESTIONS}


def load_documents(store, version_ids, passages_for):
    """Each document named, once, in the order named: its version row, its
    passages, and the passages as the whole-document calls read them, with
    each section's heading attributes. An id the index does not carry stops
    the command before anything is written."""
    versions = {row["id"]: row for row in store.select("aci_spec_versions")}
    missing = sorted(set(version_ids) - set(versions))
    if missing:
        raise SystemExit(f"not document versions this index carries: {missing}")
    documents = []
    for version_id in dict.fromkeys(version_ids):
        version = versions[version_id]
        passages = passages_for(version["spec_id"], version["version"])
        documents.append({"version": version, "passages": passages,
                          "labelled": assessment_call.with_heading_attributes(
                              passages, version.get("markdown") or "")})
    return documents


def ceiling_calls(labelled, calls, config, panel=PANEL):
    """The most the calls `calls`, (question, seat, claims) as
    `assessment_run.fresh_calls` gives them, can cost on one document: for
    each, every declared candidate (the seat's own model, then each substitute
    in order), each billed at the input `assessment_run.price_calls` estimates
    for that call and at the model's largest output. A substitute skipped as
    already seated is not a call, so this is the worst case before any seating
    is known."""
    def at_most(seat, system, user):
        return sum(seat_call.priced(candidate, system, user,
                                    seat_call.max_output(candidate, config), config)
                   for candidate in assessment_run.candidates(seat, config, panel))

    ceiling = 0.0
    for question in assessment_run.PRICE_ORDER:
        ceiling += sum(at_most(seat, *assessment_run.call_messages(question, labelled, claims))
                       for asked, seat, claims in calls if asked == question)
    return ceiling


def ceiling_document(labelled, panels, config, panel=PANEL):
    """The most assessing one document can cost, every call of it included:
    `ceiling_calls` over `assessment_run.fresh_calls`."""
    return ceiling_calls(labelled, assessment_run.fresh_calls(panels), config, panel)


def gaps(store, run_id, version_ids):
    """What keeps run `run_id` from standing for the documents it assessed,
    by the rule a publication applies, one sentence per gap."""
    versions = {row["id"]: row for row in store.select("aci_spec_versions")}
    wanted = list(dict.fromkeys(version_ids))
    run, by_version = index_store.assessment_rows(store, run_id, wanted)
    return index_store.assessment_gaps(run_id, run, by_version,
                                       [versions[version_id] for version_id in wanted])


def resumable(store, run_id):
    """The row of assessment run `run_id`, or a refusal naming the id. It is
    the first thing a resume reads, so an id no run carries is refused before
    any other call to the store."""
    runs = [row for row in store.select("aci_assessment_runs", {"id": f"eq.{run_id}"})
            if row["id"] == run_id]
    if not runs:
        raise SystemExit(f"--resume={run_id} names no assessment run: no row of "
                         "aci_assessment_runs carries that id.")
    return runs[0]


ABSENT = object()


def differences(path, recorded, current):
    """One sentence per value where `recorded`, what a run was started under,
    and `current`, what the configuration and prompt files give now, differ,
    each named by its dotted path."""
    if isinstance(recorded, dict) and isinstance(current, dict):
        found = []
        for key in dict.fromkeys([*recorded, *current]):
            found += differences(f"{path}.{key}", recorded.get(key, ABSENT),
                                 current.get(key, ABSENT))
        return found
    if recorded == current:
        return []

    def shown(value):
        return "absent" if value is ABSENT else json.dumps(value)
    return [f"{path} was {shown(recorded)} when the run started, and is {shown(current)} now"]


def taken_up(store, run, panels, config, documents):
    """The rows run `run` already holds about `documents`, {version id: rows},
    or a refusal naming every reason it cannot be taken up with them: a
    document it has begun that `documents` leaves out, and every difference
    between the seats, prompts and substitutes it was started under and those
    the configuration and prompt files give now. A run is assessed under one
    configuration throughout, or its seats would not be one panel."""
    run_id = run["id"]
    named = [document["version"]["id"] for document in documents]
    begun = dict.fromkeys(call["spec_version_id"] for call in store.select(
        "aci_assessment_calls", {"run_id": f"eq.{run_id}"}) if call["run_id"] == run_id)
    versions = {row["id"]: row for row in store.select("aci_spec_versions")}
    problems = [f"the run has begun {name_of(versions[version_id])} ({version_id}), which "
                "--documents does not name" if version_id in versions else
                f"the run has begun document {version_id}, which --documents does not name"
                for version_id in begun if version_id not in named]
    problems += differences("panels", run.get("panels") or {}, panels)
    problems += differences("prompts", run.get("prompts") or {},
                            {question: assessment_call.prompt_sha256(question)
                             for question in assessment_store.PROMPTS})
    problems += differences("substitutes", (run.get("config") or {}).get("substitutes") or {},
                            config.get("substitutes", {}))
    if problems:
        raise SystemExit(
            f"assessment run {run_id} cannot be taken up as asked:\n  " + "\n  ".join(problems)
            + "\nNothing was priced or written. Name every document the run has begun; a run "
            "started under other seats, prompts or substitutes than today's is taken up only "
            "once they are put back, or its documents are assessed in a new run.")
    _run, by_version = index_store.assessment_rows(store, run_id, named)
    return by_version


def command(version_ids, run_id=None):
    """The command that assesses `version_ids`, in a new run, or in run
    `run_id` taken up where it stopped."""
    resume = f" --resume={run_id}" if run_id is not None else ""
    return f"python3 engine/assess.py{resume} --documents={','.join(version_ids)} --go"


def remedy(store, run_id, version_ids):
    """What to do about the gaps of run `run_id`, which is closed: take it up
    again for the documents that can be, and assess in a new run each document
    only a new run can (`assessment_store.only_a_new_run`), saying so."""
    wanted = list(dict.fromkeys(version_ids))
    versions = {row["id"]: row for row in store.select("aci_spec_versions")}
    run, by_version = index_store.assessment_rows(store, run_id, wanted)
    panels = (run or {}).get("panels") or {}
    resumable_gap, lines = False, []
    for version_id in wanted:
        if not index_store.assessment_gaps(run_id, run, by_version, [versions[version_id]]):
            continue
        refusal = assessment_store.only_a_new_run(by_version[version_id], panels)
        if refusal is None:
            resumable_gap = True
        else:
            lines.append(f"{name_of(versions[version_id])} can only be assessed in a new run, "
                         f"since {refusal}: {command([version_id])}")
    if resumable_gap:
        lines.insert(0, "Take the run up where it stopped, asking only the calls that are "
                        f"not done: {command(wanted, run_id)}")
    return "\n".join(lines)


def assess(store, config, version_ids, passages_for, call_model=None, go=False,
           created_by="assess.py", panel=PANEL, resume=None):
    """Price the assessment of each document and, with `go`, run it and write it.
    Returns (the price in dollars, the run's id, or None when nothing was run).

    `resume` is the row of a run to take up where it stopped (`resumable`),
    or None for a fresh run. Both go through the same code, a fresh run being
    a run that holds no rows yet: only the calls not done are priced and
    asked. A document only a new run can assess
    (`assessment_store.only_a_new_run`) is named, and left as it is.

    A seat whose every candidate failed leaves its call in error and the run
    goes on. Anything else that stops the run, a model that could not be
    reached included, is written on the run, as its error, and raised, once a
    line on stderr has named the `--resume` that takes the run up again."""
    panels = assessment_panels(config)
    documents = load_documents(store, version_ids, passages_for)
    existing = {} if resume is None else taken_up(store, resume, panels, config, documents)
    plans = []
    for document in documents:
        rows = existing.get(document["version"]["id"]) or assessment_store.empty_rows()
        refusal = assessment_store.only_a_new_run(rows, panels)
        asked = [] if refusal else assessment_store.to_ask(document, rows, panels)
        plans.append((document, refusal, asked))
    estimate = round(sum(assessment_run.price_calls(document["labelled"], asked, config)
                         for document, _refusal, asked in plans), 2)
    ceiling = round(sum(ceiling_calls(document["labelled"], asked, config, panel)
                        for document, _refusal, asked in plans), 2)
    for document, refusal, _asked in plans:
        name = name_of(document["version"])
        print(f"  {name}: {len(document['passages'])} passages")
        if refusal is not None:
            print(f"  {name} is left as it is, since {refusal}. Only a new run can assess it: "
                  f"{command([document['version']['id']])}")
    if resume is not None:
        done = sum(call["status"] == "done" for rows in existing.values() for call in rows["calls"])
        print(f"Taking up assessment run {resume['id']}: {done} calls done are not asked again, "
              f"and at most {sum(len(asked) for _d, _r, asked in plans)} are asked.")
        if resume.get("status") == "running":
            print(f"Assessment run {resume['id']} is marked running: --resume is taken as your "
                  "word that nothing else is running it.")
    print(f"Priced at about {estimate} dollars: criteria by {', '.join(panels['criteria'])}; "
          f"contradictions and their confirmation by {', '.join(panels['contradictions'])}. "
          "The price counts each seat's own model once; a refused attempt is billed "
          "before its substitute answers, so a run that meets a refusal costs more "
          f"than this estimate. That sets a ceiling of {ceiling} dollars, the most this "
          "assessment can cost: every declared candidate of every seat billed in turn, "
          "each at its model's largest output.")
    if not go:
        return estimate, None

    run = assessment_store.Assessment(store, config, panels,
                                      call_model or batch_job.call_openrouter, panel,
                                      run=resume, existing=existing)
    try:
        run.start(created_by, estimate)
        for document, refusal, _asked in plans:
            if refusal is None:
                run.document(document)
    except BaseException as stopped:
        if run.written:
            print(f"assessment run {run.run_id} stopped ({seat_call.stop_error(stopped)}). "
                  "What it wrote is kept. Take it up where it stopped, asking only the calls "
                  "that are not done: "
                  + command([document["version"]["id"] for document in documents], run.run_id),
                  file=sys.stderr, flush=True)
        run.finish(stopped)
        raise
    run.finish()
    return estimate, run.run_id


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--documents", required=True,
                        help="comma-separated aci_spec_versions ids")
    parser.add_argument("--go", action="store_true",
                        help="spend and write; without it the assessment is only priced")
    parser.add_argument("--by", default=os.environ.get("USER", "assess.py"),
                        help="who launched the run (default: the user name)")
    parser.add_argument("--resume", metavar="RUN_ID",
                        help="take up assessment run RUN_ID, its full id, where it stopped. "
                             "A seat asked again starts from its own model, so a refusal "
                             "billed before the stop is billed again")
    args = parser.parse_args(argv)
    # Before the store is opened: an id that is not one is refused by name.
    resume_id = (None if args.resume is None
                 else index_store.assessment_run_id(args.resume, flag="--resume"))

    store = Store.from_env(backoff=PATIENT_BACKOFF_SECONDS)
    resume = None if resume_id is None else resumable(store, resume_id)
    index_store.install_registry(store)
    config = h.load_config()
    if args.go and os.environ.get("ANTHROPIC_API_KEY"):
        print(seat_call.ANTHROPIC_KEY_NOTE, file=sys.stderr)
    version_ids = [s for s in args.documents.split(",") if s]
    try:
        _estimate, run_id = assess(store, config, version_ids, h.passages, go=args.go,
                                   created_by=args.by, resume=resume)
    except seat_call.Unreachable:
        # The run is closed error and the way to take it up again is printed.
        return 1
    if run_id is None:
        print("Nothing was written; run again with --go.")
        return 0
    print(f"assessment run {run_id}")
    # The run row is closed by now: what is read here is what it will stay.
    found = gaps(store, run_id, version_ids)
    if found:
        print(f"assessment run {run_id} does not assess every document it was given as a "
              "publication requires, so a depth pass or a publication would refuse it:\n  "
              + "\n  ".join(found) + "\n" + remedy(store, run_id, version_ids))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
