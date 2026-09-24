#!/usr/bin/env python3
"""Assess documents as wholes, and store what the judges said.

    python3 engine/assess.py --documents=<version id>,<version id>        # priced, nothing written
    python3 engine/assess.py --documents=<version id>,<version id> --go   # spends, and writes
    python3 engine/assess.py --resume=<run id> --documents=<version id>,<version id>
    python3 engine/assess.py --resume=<run id> --documents=<version id>,<version id> --go
    python3 engine/assess.py --resume=<run id> --replay --documents=<version id>,... --go
    python3 engine/assess.py --criteria-from=<run id> --documents=<version id>,<version id> --go

`--documents` names aci_spec_versions ids. Priced and printed by default, run and
written only with --go, because an assessment spends real money on whole
documents and the amount should be read before it is spent.

Each document is read whole by every seat of each question: the criteria by the
seats `panel-config.json`'s `assessment` block names for them, and the
contradictions by its seats for those, each listing every contradiction it
finds. The candidates found on every version of one document the run assesses
are pooled by their pair of passages, and carried to every version where both
passages read exactly the same; then every contradictions seat reads every
claim of a version, the ones it found included, and a claim is confirmed when
two readings say it holds. A document on one of whose versions a
contradictions seat gives no answer is not read at all: none of its claims is
written, the run goes on, and a resume asks the finding again before the
claims are written and read. A seat that cannot answer is taken by its declared
substitutes, from frontier_fast's `substitutes` block, skipping any substitute
already seated for the same question. The rules are
`engine/panel/assessment_run.py`'s; this command runs them and writes the run,
its calls, their scores, the claims and every reading to the `aci_assessment_`
tables, through `engine/assessment_store.py`. What the scores add up to, and
which claims are confirmed, is read from those rows later rather than stored.

`--criteria-from=<run id>` starts a run that asks only the contradictions and
their reading, and takes its criteria from the earlier run named, its full id:
the depths out of ten given against that run's conflict rules then stand for
the new run too. The run records the earlier run's id in its config, and its
criteria seats and prompt digest in its own. It is refused, naming what stands
in the way, unless the earlier run is done, took no criteria of its own from
another run, asked its criteria of the seats and under the prompt the
configuration and prompt file give now, and assessed the criteria of every
document named. Taken up with --resume, such a run still asks no criteria.

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
contradictions seats never answered, as the code before the rule above left
assessment run e2c00b2e, is left as it is, since asking that seat now would
change claims the others have read: only a new run can assess it as a fresh
run would. A resume is priced like a fresh run, counting only the calls it
will ask, and spends only with --go.

`--replay`, given with `--resume`, takes such a document up instead, which the
owner allowed on 22 September 2026 while the method is being settled, knowing
the result is not exactly what a fresh run would give. The finding call that
failed is asked again in its own row, through the seat's usual candidates; if
it fails again, nothing more is asked or written for that document, a second
failed finding of it included, and the gap stays. If it answers, what it finds
is pooled across the document's versions as usual: a pair already claimed
keeps its row as written, since a claim is never updated, and is listed in the
replay's record (`also_found`), which is where the payload reads that the seat
found it; a new pair becomes a new claim on every version where both passages
read the same. Every contradictions seat then reads only the new claims of
each version, in a supplementary reading recorded on its reading call for
that version: appended to its attempts with its reply and the claims it
answered, its bill added, and its first reply kept in `raw_output`. The run's
config records the replay under `replays`, with how it ended for each
document. A replay is refused, before it is priced and again before its first
call, when the findings its first readings read no longer give the claims
written, or those readings no longer give the verdicts stored. It is priced
first like any resume, the findings at their allowances and each
supplementary reading as a reading whose claims are not known yet, and spends
only with --go. On a run with no such document it is a resume and nothing
else.
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


def ceiling_document(labelled, panels, config, panel=PANEL, criteria=True):
    """The most assessing one document can cost, every call of it included:
    `ceiling_calls` over `assessment_run.fresh_calls`, the criteria left out
    when the run takes them from another."""
    return ceiling_calls(labelled, assessment_run.fresh_calls(panels, criteria), config, panel)


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
REPLAY_WITHOUT_RESUME = (
    "--replay replays what failed in a run already read, so it is given with "
    "--resume=<run id>, the run's full id. Nothing was priced or written.")


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
    # What the run itself wrote: a run taking its criteria from another holds
    # none of that run's rows, and bills none of their cost.
    _run, by_version = index_store.assessment_run_rows(store, run_id, named)
    return by_version


def criteria_source(store, run_id, panels, documents):
    """The row of assessment run `run_id`, whose criteria a run takes rather
    than asking them (`--criteria-from`), or a refusal naming everything that
    keeps it from giving them: no run carries the id; it takes its own criteria
    from another run; it is not done; its criteria seats or its criteria prompt
    digest are not the ones the configuration and prompt file give now; or it
    did not assess the criteria of a document of `documents`, by the rule the
    gaps check applies to them. Nothing is priced or written before."""
    runs = [row for row in store.select("aci_assessment_runs", {"id": f"eq.{run_id}"})
            if row["id"] == run_id]
    if not runs:
        raise SystemExit(f"--criteria-from={run_id} names no assessment run: no row of "
                         "aci_assessment_runs carries that id.")
    earlier = runs[0]
    problems = []
    further = (earlier.get("config") or {}).get("criteria_from")
    if further:
        problems.append(f"it takes its own criteria from assessment run {further}; name that "
                        f"run instead, --criteria-from={further}")
    if earlier.get("status") != "done":
        problems.append(f"its status is {earlier.get('status')}, not done")
    seats = (earlier.get("panels") or {}).get("criteria")
    if seats != panels["criteria"]:
        problems.append(f"its criteria were asked of {json.dumps(seats)}, and the configuration "
                        f"seats {json.dumps(panels['criteria'])} for them now")
    digest, current = ((earlier.get("prompts") or {}).get("criteria"),
                       assessment_call.prompt_sha256("criteria"))
    if digest != current:
        problems.append(f"its criteria were asked under the prompt {digest}, and the criteria "
                        f"prompt is {current} now")
    if not further:
        _run, rows = index_store.assessment_run_rows(
            store, run_id, [document["version"]["id"] for document in documents])
        for document in documents:
            problems += index_store.criteria_gaps(name_of(document["version"]),
                                                  rows[document["version"]["id"]], seats or [])
    if problems:
        raise SystemExit(
            f"assessment run {run_id} cannot give its criteria to a new run:\n  "
            + "\n  ".join(problems)
            + "\nNothing was priced or written. Name a run whose criteria stand for every "
            "document given, or assess the documents in full in a new run.")
    return earlier


def command(version_ids, run_id=None, criteria_from=None, replay=False):
    """The command that assesses `version_ids`, in a new run, taking its
    criteria from run `criteria_from` when one is named, or in run `run_id`
    taken up where it stopped, replaying what failed after the readings with
    `replay`."""
    resume = f" --resume={run_id}" if run_id is not None else ""
    again = " --replay" if replay else ""
    taken = f" --criteria-from={criteria_from}" if criteria_from is not None else ""
    return (f"python3 engine/assess.py{resume}{again}{taken} "
            f"--documents={','.join(version_ids)} --go")


def replay_offer(names, run_id, version_ids, checked=True):
    """The sentence that offers to replay, in run `run_id`, what failed in the
    documents `names` after their readings (`assessment_store.replayable`).

    `checked` says whether the caller has also run
    `assessment_store.replay_refusal`, which a replay is held to before its
    first call. That check needs the documents' passages, which `remedy` has
    not read and would need a second round of store reads to get, so its offer
    says the replay may not stand rather than promising one."""
    still = "" if checked else ", if it is still replayable,"
    return (f"or replay in this run{still} only what failed in {names}, the new claims read "
            "on their own after the readings already given, which is not exactly what a "
            f"fresh run would give: {command(version_ids, run_id, replay=True)}")


def remedy(store, run_id, version_ids):
    """What to do about the gaps of run `run_id`, which is closed: take it up
    again for the documents that can be, and assess in a new run each document
    only a new run can (`assessment_store.only_a_new_run`), saying so. The
    versions of one document are pooled together, so the new run named for one
    names them all."""
    wanted = list(dict.fromkeys(version_ids))
    versions = {row["id"]: row for row in store.select("aci_spec_versions")}
    run, by_version = index_store.assessment_rows(store, run_id, wanted)
    _run, own = index_store.assessment_run_rows(store, run_id, wanted)
    panels = (run or {}).get("panels") or {}
    criteria_from = ((run or {}).get("config") or {}).get("criteria_from")
    group_of = {}
    for version_id in wanted:
        group_of.setdefault(versions[version_id]["spec_id"], []).append(version_id)
    resumable_gap, lines = False, []
    for version_id in wanted:
        if not index_store.assessment_gaps(run_id, run, by_version, [versions[version_id]]):
            continue
        group = group_of[versions[version_id]["spec_id"]]
        members = [(versions[member], own[member]) for member in group]
        refusal = assessment_store.only_a_new_run(members, panels)
        if refusal is None:
            resumable_gap = True
        else:
            lines.append(f"{name_of(versions[version_id])} can only be assessed in a new run, "
                         f"since {refusal}: {command(group, criteria_from=criteria_from)}")
            if assessment_store.replayable(members, panels):
                # checked=False: replay_refusal needs the documents' passages,
                # which nothing here has read.
                lines.append("  " + replay_offer(name_of(versions[version_id]), run_id, wanted,
                                                 checked=False))
    if resumable_gap:
        lines.insert(0, "Take the run up where it stopped, asking only the calls that are "
                        f"not done: {command(wanted, run_id)}")
    return "\n".join(lines)


def assess(store, config, version_ids, passages_for, call_model=None, go=False,
           created_by="assess.py", panel=PANEL, resume=None, criteria_from=None,
           replay=False):
    """Price the assessment of each document and, with `go`, run it and write it.
    Returns (the price in dollars, the run's id, or None when nothing was run).

    `resume` is the row of a run to take up where it stopped (`resumable`),
    or None for a fresh run. Both go through the same code, a fresh run being
    a run that holds no rows yet: only the calls not done are priced and
    asked. The versions of one document only a new run can assess
    (`assessment_store.only_a_new_run`) are named, and left as they are.

    `criteria_from` is the full id of the run a fresh run takes its criteria
    from (`criteria_source`); a run taken up takes it from its own config. The
    criteria are then neither priced nor asked.

    With `replay`, which needs `resume`, the versions of one document whose
    finding failed after their claims were written and read
    (`assessment_store.replayable`) are taken up rather than left: the run row
    records the replay (`Assessment.record_replay`) before anything is asked.

    A seat whose every candidate failed leaves its call in error and the run
    goes on. Anything else that stops the run, a model that could not be
    reached included, is written on the run, as its error, and raised, once a
    line on stderr has named the `--resume` that takes the run up again."""
    if replay and resume is None:
        raise SystemExit(REPLAY_WITHOUT_RESUME)
    panels = assessment_panels(config)
    documents = load_documents(store, version_ids, passages_for)
    if resume is not None:
        if criteria_from is not None:
            raise SystemExit("--criteria-from starts a new run; a run taken up keeps the run it "
                             "takes its criteria from, if any, in its own config.")
        criteria_from = (resume.get("config") or {}).get("criteria_from")
    earlier = (None if criteria_from is None
               else criteria_source(store, criteria_from, panels, documents))
    existing = {} if resume is None else taken_up(store, resume, panels, config, documents)
    replayed = assessment_store.replayed_calls(resume)
    plans, replays = [], []
    for group in assessment_store.groups(documents):
        rows = {document["version"]["id"]: existing.get(document["version"]["id"])
                or assessment_store.empty_rows() for document in group}
        members = [(document["version"], rows[document["version"]["id"]]) for document in group]
        refusal = assessment_store.only_a_new_run(members, panels, replay=replay)
        again = assessment_store.replayable(members, panels) if replay and not refusal else []
        if again:
            refusal = assessment_store.replay_refusal(group, rows, panels, replayed)
        if again and refusal is None:
            replays.append((group, again))
        asked = ({} if refusal else
                 assessment_store.to_ask(group, rows, panels, criteria=earlier is None,
                                         replayed=replayed))
        plans.append((group, refusal, asked, members))
    each = [(document, asked.get(document["version"]["id"], []))
            for group, _refusal, asked, _members in plans for document in group]
    estimate = round(sum(assessment_run.price_calls(document["labelled"], calls, config)
                         for document, calls in each), 2)
    ceiling = round(sum(ceiling_calls(document["labelled"], calls, config, panel)
                        for document, calls in each), 2)
    for group, refusal, _asked, members in plans:
        for document in group:
            print(f"  {name_of(document['version'])}: {len(document['passages'])} passages")
        names = ", ".join(name_of(document["version"]) for document in group)
        if refusal is not None:
            left, it = (("is left as it is", "it") if len(group) == 1
                        else ("are left as they are", "them"))
            print(f"  {names} {left}, since {refusal}. Only a new run can assess {it}: "
                  + command([document["version"]["id"] for document in group],
                            criteria_from=criteria_from))
            rows = {version["id"]: version_rows for version, version_rows in members}
            if not replay and assessment_store.replayable(members, panels) \
                    and assessment_store.replay_refusal(group, rows, panels, replayed) is None:
                print("  " + replay_offer(names, resume["id"], version_ids))
    version_of = {document["version"]["id"]: document["version"] for document in documents}
    for group, again in replays:
        names = ", ".join(name_of(document["version"]) for document in group)
        failed = " and ".join(f"{call['seat']} on {name_of(version_of[call['spec_version_id']])}"
                              for call in again)
        print(f"  Replaying {names}: {failed} gave no contradictions answer after the claims "
              "were written and read. That finding is asked again in its own row; the pairs "
              "found are pooled with the claims already written, and every contradictions "
              "seat reads only the new claims, in a supplementary reading on its reading "
              "call. This is not exactly what a fresh run would give.")
    if resume is not None:
        done = sum(call["status"] == "done" for rows in existing.values() for call in rows["calls"])
        print(f"Taking up assessment run {resume['id']}: {done} calls done are not asked again, "
              f"and at most {sum(len(calls) for _document, calls in each)} are asked.")
        if resume.get("status") == "running":
            print(f"Assessment run {resume['id']} is marked running: --resume is taken as your "
                  "word that nothing else is running it.")
    criteria = (f"the criteria are taken from assessment run {criteria_from} and not asked "
                "again" if earlier is not None else f"criteria by {', '.join(panels['criteria'])}")
    print(f"Priced at about {estimate} dollars: {criteria}; "
          f"contradictions and their reading by {', '.join(panels['contradictions'])}. "
          "The price counts each seat's own model once; a refused attempt is billed "
          "before its substitute answers, so a run that meets a refusal costs more "
          f"than this estimate. That sets a ceiling of {ceiling} dollars, the most this "
          "assessment can cost: every declared candidate of every seat billed in turn, "
          "each at its model's largest output.")
    if not go:
        return estimate, None

    run = assessment_store.Assessment(store, config, panels,
                                      call_model or batch_job.call_openrouter, panel,
                                      run=resume, existing=existing, criteria_from=earlier,
                                      replay=replay)
    try:
        run.start(created_by, estimate)
        if replays:
            run.record_replay(created_by,
                              [group[0]["version"]["spec_id"] for group, _again in replays],
                              [call["id"] for _group, again in replays for call in again])
        for group, refusal, _asked, _members in plans:
            if refusal is None:
                run.group(group)
    except BaseException as stopped:
        if run.written:
            print(f"assessment run {run.run_id} stopped ({seat_call.stop_error(stopped)}). "
                  "What it wrote is kept. Take it up where it stopped, asking only the calls "
                  "that are not done: "
                  + command([document["version"]["id"] for document in documents], run.run_id,
                            replay=replay),
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
    started = parser.add_mutually_exclusive_group()
    started.add_argument("--resume", metavar="RUN_ID",
                         help="take up assessment run RUN_ID, its full id, where it stopped. "
                              "A seat asked again starts from its own model, so a refusal "
                              "billed before the stop is billed again")
    started.add_argument("--criteria-from", metavar="RUN_ID",
                         help="start a run that asks only the contradictions and their "
                              "reading, and takes its criteria from assessment run RUN_ID, "
                              "its full id")
    parser.add_argument("--replay", action="store_true",
                        help="with --resume: ask again a finding that failed after its "
                             "document's claims were written and read, pool what it finds "
                             "with them, and have every contradictions seat read only the "
                             "new claims. Not exactly what a fresh run would give")
    args = parser.parse_args(argv)
    if args.replay and args.resume is None:
        raise SystemExit(REPLAY_WITHOUT_RESUME)
    # Before the store is opened: an id that is not one is refused by name.
    resume_id = (None if args.resume is None
                 else index_store.assessment_run_id(args.resume, flag="--resume"))
    criteria_from = (None if args.criteria_from is None
                     else index_store.assessment_run_id(args.criteria_from,
                                                        flag="--criteria-from"))

    store = Store.from_env(backoff=PATIENT_BACKOFF_SECONDS)
    resume = None if resume_id is None else resumable(store, resume_id)
    index_store.install_registry(store)
    config = h.load_config()
    if args.go and os.environ.get("ANTHROPIC_API_KEY"):
        print(seat_call.ANTHROPIC_KEY_NOTE, file=sys.stderr)
    version_ids = [s for s in args.documents.split(",") if s]
    try:
        _estimate, run_id = assess(store, config, version_ids, h.passages, go=args.go,
                                   created_by=args.by, resume=resume,
                                   criteria_from=criteria_from, replay=args.replay)
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
