#!/usr/bin/env python3
"""A provisional reading: the panel's questions, answered from inside this session.

    python3 engine/panel/session_seat.py judge compose --behaviours=a,b --documents=<version id> --go
    python3 engine/panel/session_seat.py judge store artefacts/session-<run>
    python3 engine/panel/session_seat.py assess --documents=<version id> [--resume=<run id>]

No provider is called, and no key is read. The engine's own pipelines run as they
run for the panel, with one difference: the model they call is a file. A question
is written beside the run, a model working in this session reads it and writes the
answer beside it, and the pipeline reads that answer as it would read a provider's
reply, through the same parser and into the same rows.

What a reading like this is. It is one seat, so it is one model's opinion and not
the index's finding, and every run it writes says so: `provisional` is true on the
row, and a publication takes one of its cells only where no run of the display
panel judged that cell, marking it provisional wherever it is shown. The seat is
the model running the session, recorded by name (`opus-5.5`), and its cost is null
because a session's tokens are not billed through this ledger. It was built for
Microsoft AI's Code of Conduct, which no panel had read, and it is an Anthropic
model reading another company's document, which the reader says beside it.

The files follow link_self.py, whose two readers this reuses: a question and its
answer share a name, a digest of the question itself.
"""

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                   # noqa: E402
import compose_run                 # noqa: E402
import index_store                 # noqa: E402
import judge_call                  # noqa: E402
import link_self                   # noqa: E402
from store import Store            # noqa: E402

h = judge_call.h

PANEL = "session_opus_5_5"
SEAT = "opus-5.5"
CREATED_BY = "session_seat.py (opus-5.5, read in session)"


class Pending(BaseException):
    """A question written and not yet answered.

    A BaseException, so no handler written for a provider's failure catches it:
    the pipelines catch `Exception` to record a refusal and ask a substitute, and
    this is neither. The pipeline stops where it stands, records nothing as
    refused, and is taken up again once the answer exists."""


def stopping_wire(folder):
    """A call_model that answers from `folder`, or writes the question there and
    stops. The signature is batch_job.call_openrouter's."""
    def call_model(provider, model_id, system, user, kwargs):
        key = link_self.key_of(user)
        answer = folder / f"{key}.answer"
        if answer.exists():
            return answer.read_text(encoding="utf-8"), {}, "in-session", None
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{key}.question").write_text(
            f"{system}\n\n---- the call ----\n\n{user}", encoding="utf-8")
        raise Pending(f"question written as {folder / key}.question")
    return call_model


def judge_questions(calls, registry, versions, rubric):
    """[(key, call, system, user)]: each call's question, composed exactly as
    batch_job.one_call composes it before sending it to a provider."""
    out = []
    for call in calls:
        version = versions[call["spec_version_id"]]
        passages = h.passages(version["spec_id"], version["version"])
        system, user = judge_call.compose(call["behaviour_slug"], rubric, registry, passages)
        out.append((link_self.key_of(user), call, system, user))
    return out


def judge_compose(args):
    store = Store.from_env()
    index_store.install_registry(store)
    config = h.load_config()
    run, calls = compose_run.plan(
        store, [s for s in args.behaviours.split(",") if s],
        [s for s in args.documents.split(",") if s], PANEL, args.rubric, config,
        provisional=True)
    run["created_by"] = CREATED_BY
    print(f"  panel        {', '.join(run['panel'])} (provisional)")
    print(f"  calls        {len(calls)}")
    if not calls:
        print("nothing to do: every cell already has a done call from this seat")
        return 0
    if not args.go:
        print("nothing written (pass --go to write the run and its questions)")
        return 0

    # judging_registry, as batch_job.run composes with it: the question text is
    # the key an answer is filed under, so composing from another registry would
    # file every answer under a name nothing looks for.
    registry = index_store.judging_registry(store)
    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    asked = judge_questions(calls, registry, versions, run["rubric"])

    # No depth of the scale of four: a provisional cell is published on the
    # scale of ten, from depth_pass.py, against a provisional assessment.
    store.insert("aci_runs", [run])
    store.insert("aci_judge_calls", calls)

    folder = ROOT / "artefacts" / f"session-{run['id'][:8]}"
    (folder / "calls").mkdir(parents=True, exist_ok=True)
    index = {}
    for key, call, system, user in asked:
        (folder / "calls" / f"{key}.question").write_text(
            f"{system}\n\n---- the call ----\n\n{user}", encoding="utf-8")
        version = versions[call["spec_version_id"]]
        index[key] = {"call_id": call["id"], "behaviour": call["behaviour_slug"],
                      "document": f"{version['spec_id']}@{version['version']}",
                      "passages": len(h.passages(version["spec_id"], version["version"]))}
    (folder / "index.json").write_text(
        json.dumps({"run": run["id"], "calls": index}, indent=1, ensure_ascii=False),
        encoding="utf-8")
    print(f"written: run {run['id']}")
    print(f"  questions    {folder / 'calls'}")
    print(f"then, once every question has its answer:\n"
          f"  python3 engine/panel/session_seat.py judge store {folder}")
    return 0


def unparsed_answers(folder, index):
    """{key: (unparsed, expected)} for every answer the judging parser does not
    read whole. Checked before anything is stored: batch_job keeps a reply it
    cannot read whole as an error, and a call's judgements are insert-only."""
    out = {}
    for key, entry in index["calls"].items():
        reply = (folder / "calls" / f"{key}.answer").read_text(encoding="utf-8")
        verdicts, unparsed = judge_call.parse(reply, entry["passages"])
        if unparsed or len(verdicts) != entry["passages"]:
            out[key] = (unparsed, entry["passages"], len(verdicts))
    return out


def judge_store(args):
    folder = Path(args.folder)
    index = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    missing = [key for key in index["calls"]
               if not (folder / "calls" / f"{key}.answer").exists()]
    print(f"  run          {index['run']}")
    print(f"  answered     {len(index['calls']) - len(missing)} of {len(index['calls'])}")
    if missing:
        for key in missing:
            print(f"    still to answer: {key}  {index['calls'][key]['behaviour']}")
        return 1
    unread = unparsed_answers(folder, index)
    if unread:
        for key, (unparsed, expected, read) in unread.items():
            print(f"    {key}  {index['calls'][key]['behaviour']}: {read} of {expected} "
                  f"verdicts read, {unparsed} lines unparsed")
        print("nothing stored: answer those again")
        return 1
    store = Store.from_env()
    index_store.install_registry(store)
    report = batch_job.run(store, index["run"], call_model=link_self.replies_from(folder),
                           concurrency=1)
    print(f"  stored       {report}")
    return 0


def assess_step(args):
    """One step of a provisional assessment: ask what the run can ask with the
    answers written so far, and stop at the first question nobody has answered.

    The assessment asks its questions in order, criteria, then contradictions,
    then the reading of each contradiction found, and the last is composed from
    the answers to the one before. So the run is taken up once per answer, with
    `--resume`, exactly as a hosted run is taken up after a stop."""
    import assess                                          # noqa: PLC0415
    store = Store.from_env()
    index_store.install_registry(store)
    config = h.load_config()
    version_ids = [s for s in args.documents.split(",") if s]
    resume = None
    if args.resume:
        resume = assess.resumable(store, index_store.assessment_run_id(args.resume,
                                                                       flag="--resume"))
    folder = ROOT / "artefacts" / f"session-assess-{version_ids[0][:8]}"
    panels = {"criteria": [SEAT], "contradictions": [SEAT]}
    try:
        _estimate, run_id = assess.assess(
            store, config, version_ids, h.passages, call_model=stopping_wire(folder),
            go=True, created_by=CREATED_BY, panel=PANEL, resume=resume, panels=panels,
            provisional=True)
    except Pending as waiting:
        runs = sorted((row for row in store.select("aci_assessment_runs")
                       if row.get("created_by") == CREATED_BY),
                      key=lambda row: row["created_at"])
        run_id = resume["id"] if resume else runs[-1]["id"]
        print(f"waiting: {waiting}")
        print(f"then:  python3 engine/panel/session_seat.py assess "
              f"--documents={','.join(version_ids)} --resume={run_id}")
        return 2
    print(f"assessment run {run_id} is done")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="pipeline", required=True)

    judge = sub.add_parser("judge", help="the passages of each cell")
    steps = judge.add_subparsers(dest="step", required=True)
    write = steps.add_parser("compose", help="write the run and its questions")
    write.add_argument("--behaviours", required=True, help="comma-separated slugs")
    write.add_argument("--documents", required=True,
                       help="comma-separated aci_spec_versions ids")
    write.add_argument("--rubric", default="v5")
    write.add_argument("--go", action="store_true",
                       help="write the run and its questions; without it, nothing is written")
    write.set_defaults(func=judge_compose)
    read = steps.add_parser("store", help="feed the answers through batch_job")
    read.add_argument("folder")
    read.set_defaults(func=judge_store)

    whole = sub.add_parser("assess", help="the document as a whole, one question at a time")
    whole.add_argument("--documents", required=True,
                       help="comma-separated aci_spec_versions ids")
    whole.add_argument("--resume", default=None, help="the assessment run to take up")
    whole.set_defaults(func=assess_step)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
