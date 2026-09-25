#!/usr/bin/env python3
"""Judge a pair of documents from inside this session. No provider is called.

    python3 engine/panel/link_self.py compose --behaviours=a,b --documents=<id>,<id>
    python3 engine/panel/link_self.py store artefacts/<folder>

Nothing here talks to a model, and no key is read. `compose` writes out the
question the engine would have sent to a judge, one file per call. `store` reads
the answers back and feeds them through the engine's own pipeline -- the same
parser, the same completeness floor, the same rows, the same duplicate recovery
-- with the reply coming from a file instead of a socket.

Between the two commands, the judging happens: the model running this session
reads each question and writes the answer beside it. That is the whole of the
difference from a hosted run, and it is why the loop is broken in half. A Python
loop cannot call the model that is reading this file.

What a run like this is, and is not. It is one seat, so it cannot assert a
silence -- the panel needs all three for that -- and an absent line from it is
one model's opinion rather than the index's finding. It cannot disagree with
itself across seats either, so the pass that follows compares its two directions
against each other rather than its judges. And the seat is an Anthropic model
reading Anthropic's own constitution against another laboratory's specification,
which is the conflict this index exists to avoid. It is recorded on the run, not
in a footnote: `panel` says opus-5, and the cost stays null because a session's
tokens are not billed through this ledger.
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

import compose_links               # noqa: E402
import index_store                 # noqa: E402
import link_call                   # noqa: E402
import link_job                    # noqa: E402
from store import Store            # noqa: E402

h = link_call.h

PANEL = "opus_5_self"
SEAT = "opus-5"


def key_of(user):
    """The name a call's question and its answer share.

    link_job hands call_model the composed messages and not the call it is
    answering, so the question itself is the only thing that identifies it. It is
    unique per call: one behaviour, one source document, one target document."""
    return hashlib.sha256(user.encode("utf-8")).hexdigest()[:16]


def remembered_retained():
    """compose_links.retained_passages, remembered per cell for this process.

    Every call of it re-reads aci_judge_calls and aci_judgements whole, which is
    15.8 seconds against this database, and composing asks for the same cell
    twice: once while plan() prices the run and again while the question is
    written. Remembering halves that. The engine's own function still does the
    work, and the module attribute is replaced rather than the callers changed,
    because link_job.run resolves its default from the module at call time.
    """
    plain = compose_links.retained_passages
    seen = {}

    def retained(store, slug, version, passages_for=None):
        key = (slug, version["id"])
        if key not in seen:
            seen[key] = plain(store, slug, version, passages_for)
        return seen[key]
    return retained


def questions(store, calls, registry, versions):
    """[(key, call, system, user)] for calls that have no answer yet."""
    out = []
    for call in calls:
        source = versions[call["source_version_id"]]
        target = versions[call["target_version_id"]]
        sources = compose_links.retained_passages(store, call["behaviour_slug"], source)
        targets = h.passages(target["spec_id"], target["version"])
        system, user = link_call.compose(
            call["behaviour_slug"], registry, sources, targets,
            compose_links.document_id(source), compose_links.document_id(target))
        out.append((key_of(user), call, system, user, len(sources), len(targets)))
    return out


def compose(args):
    store = Store.from_env()
    index_store.install_registry(store)
    run, calls = compose_links.plan(
        store,
        [s for s in args.behaviours.split(",") if s],
        [s for s in args.documents.split(",") if s],
        PANEL, again=args.again)
    if not calls:
        print("nothing to do: every direction already has a done call")
        return 0
    # Whose run this is, rather than the composer's name. A reader of the table
    # should not have to infer from the panel that nothing was bought.
    run["created_by"] = "link_self.py (opus-5, judged in session)"

    # judging_registry, not behaviours: link_job.run composes with the first, and
    # the two differ wherever a behaviour carries a brief -- judging_registry
    # returns the judging entry in place of the display one. The question text is
    # the key that matches an answer to its call, so composing from the other
    # registry would file every answer under a name nothing looks for.
    registry = index_store.judging_registry(store)
    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    asked = questions(store, calls, registry, versions)

    folder = ROOT / "artefacts" / f"self-{run['id'][:8]}"
    (folder / "calls").mkdir(parents=True, exist_ok=True)

    index = {}
    for key, call, system, user, sources, targets in asked:
        (folder / "calls" / f"{key}.question").write_text(
            f"{system}\n\n---- the call ----\n\n{user}", encoding="utf-8")
        index[key] = {
            "call_id": call["id"], "behaviour": call["behaviour_slug"],
            "source": compose_links.document_id(versions[call["source_version_id"]]),
            "target": compose_links.document_id(versions[call["target_version_id"]]),
            "sources": sources, "targets": targets,
        }
    (folder / "index.json").write_text(
        json.dumps({"run": run["id"], "calls": index}, indent=1, ensure_ascii=False),
        encoding="utf-8")

    if not args.go:
        print(f"  panel        {', '.join(run['panel'])}")
        print(f"  calls        {len(calls)}")
        print(f"  questions    {folder}/calls")
        print("nothing written to the database (pass --go to write the run)")
        return 0

    store.insert("aci_link_runs", [run])
    store.insert("aci_link_calls", calls)
    print(f"  run          {run['id']}")
    print(f"  panel        {', '.join(run['panel'])}, judged in session, nothing bought")
    print(f"  calls        {len(calls)}")
    print(f"  questions    {folder}/calls")
    for key, entry in index.items():
        print(f"    {key}  {entry['behaviour']}  {entry['source'].split('--')[0]}"
              f" -> {entry['target'].split('--')[0]}  "
              f"{entry['sources']} passages against {entry['targets']}")
    print(f"\nwrite each answer to {folder}/calls/<key>.answer, then:")
    print(f"  python3 engine/panel/link_self.py store {folder}")
    return 0


def replies_from(folder):
    """A call_model that answers from disk.

    Returns what a provider call returns, so link_job's pipeline is unchanged.
    `usage` is empty on purpose: batch_job.cost_of then records null, and null
    here means unknown rather than free. `seconds` is null for the same reason --
    no wall clock measures a judgement written by hand."""
    def call_model(provider, model_id, system, user, kwargs):
        answer = folder / "calls" / f"{key_of(user)}.answer"
        if not answer.exists():
            raise FileNotFoundError(
                f"no answer for this call: {answer.name} (the question is beside "
                f"it as {answer.stem}.question)")
        return answer.read_text(encoding="utf-8"), {}, "in-session", None
    return call_model


def through_files(folder, label):
    """A call_model that writes its question out, then reads its answer back.

    Both phases in one function, because the modules it serves compose their
    question inside the call they were about to make: there is no earlier moment
    to intercept. On the first pass no answer exists, so the question is written
    and an EMPTY reply is returned; on the second the answer is there and the
    same composition finds it under the same name.

    Empty rather than raised, which is where this differs from replies_from.
    link_arbitrate runs its batches through a thread pool, so an exception would
    end the run on the first batch and leave the rest of the questions never
    composed. An empty reply parses to nothing, every dispute settles to a null
    relation, link_record skips them, and the pass finishes having written every
    question and stored not one judgement.
    """
    def call_model(provider, model_id, system, user, kwargs):
        key = key_of(user)
        answer = folder / f"{key}.answer"
        if answer.exists():
            return answer.read_text(encoding="utf-8"), {}, "in-session", None
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{key}.question").write_text(
            f"{system}\n\n---- the call ----\n\n{user}", encoding="utf-8")
        print(f"  {label}: question written as {key}.question")
        return "", {}, "question-written", None
    return call_model


def build_report(args):
    """The run as links.json, which is what stages two and three read.

    The database holds the links; link_arbitrate and link_summary read a run's
    report. This is the one command that turns the first into the second."""
    import link_report                                   # noqa: PLC0415
    store = Store.from_env()
    index_store.install_registry(store)
    compose_links.retained_passages = remembered_retained()
    folder = link_report.write(store, args.run, str(ROOT / "artefacts"))
    print(f"  report       {folder}")
    print(f"\nthen:  python3 engine/panel/link_self.py arbitrate {folder}")
    return 0


def arbitrate(args):
    """Stage two, twice: questions out, then verdicts in.

    With one seat there are no disagreements between judges, so what this
    settles is the seat disagreeing with itself: a pair it read one way from one
    document's side and another way from the other's. link_arbitrate calls that
    kind self-inconsistent and already detects it, which is why nothing here
    reimplements the detection."""
    import link_arbitrate                                # noqa: PLC0415
    report = Path(args.report)
    folder = report / "arbitration"
    argv = [str(report / "links.json"), "--go", f"--arbiter={SEAT}",
            f"--batch={args.batch}", "--concurrency=1"]
    return link_arbitrate.main(argv, call_model=through_files(folder, "arbitrate"))


def summarise(args):
    """Stage three, once per behaviour: questions out, then the paragraphs in.

    A summary is about one behaviour over one pair of documents, which is what
    aci_link_summaries is keyed by, so a run covering thirteen behaviours needs
    thirteen of them. Each composes its own question and finds its own answer,
    because the name of both is a digest of the question itself."""
    import link_summary                                  # noqa: PLC0415
    report = Path(args.report)
    folder = report / "summary"
    data = json.loads((report / "links.json").read_text(encoding="utf-8"))
    wanted = [args.behaviour] if args.behaviour else link_summary.behaviours_in(data)
    for slug in wanted:
        print(f"  {slug}")
        link_summary.main(
            [str(report / "links.json"), "--go", f"--model={SEAT}",
             f"--behaviour={slug}"],
            call_model=through_files(folder, "summarise"))
    return 0


def paragraphs(args):
    """Stage four, once per passage worth summarising: questions out, then in.

    Unlike stages two and three this one composes many small calls rather than a
    few large ones: a passage's paragraph is written from that passage and its
    counterparts, three thousand characters or so, where an arbitration carries
    both documents whole. So the questions are written in one sweep and answered
    in batches, and a second pass picks up whatever has been answered since."""
    import link_paragraph                                  # noqa: PLC0415
    report = Path(args.report)
    folder = report / "paragraphs"
    argv = [str(report / "links.json"), "--go", f"--model={SEAT}",
            f"--floor={args.floor}"]
    if args.behaviour:
        argv.append(f"--behaviour={args.behaviour}")
    return link_paragraph.main(argv, call_model=through_files(folder, "paragraph"))


def overview(args):
    """Stage five, once per cell of the grid: questions out, then passages in.

    Unlike the stages above this one belongs to no run. Its material is every
    comparison already stored, whichever run wrote it, so it takes a folder of
    its own rather than a report's."""
    import link_overview                                  # noqa: PLC0415
    folder = ROOT / "artefacts" / "overview"
    argv = ["--go", f"--model={SEAT}", f"--out={args.out}"]
    return link_overview.main(argv, call_model=through_files(folder, "overview"))


def depths(args):
    """Stage six, once per figure of the grid: questions out, then paragraphs in.

    Small calls, like the paragraph stage: a figure's explanation is written
    from three rationales rather than from any document, so the questions are a
    few thousand characters each."""
    import link_depth                                     # noqa: PLC0415
    folder = ROOT / "artefacts" / "depths"
    argv = ["--go", f"--model={SEAT}", f"--out={args.out}"]
    return link_depth.main(argv, call_model=through_files(folder, "depth"))


def store_answers(args):
    folder = Path(args.folder)
    index = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    written = [key for key in index["calls"]
               if (folder / "calls" / f"{key}.answer").exists()]
    print(f"  run          {index['run']}")
    print(f"  answered     {len(written)} of {len(index['calls'])}")
    if len(written) < len(index["calls"]):
        missing = [k for k in index["calls"] if k not in written]
        print("  still to judge:")
        for key in missing:
            entry = index["calls"][key]
            print(f"    {key}  {entry['behaviour']}  "
                  f"{entry['source'].split('--')[0]} -> {entry['target'].split('--')[0]}")
        if not args.partial:
            print("nothing stored (pass --partial to store what is answered)")
            return 1

    store = Store.from_env()
    index_store.install_registry(store)
    # One at a time: a thread pool buys nothing when the model is a file, and it
    # makes the order the calls are reported in depend on scheduling.
    report = link_job.run(store, index["run"], call_model=replies_from(folder),
                          concurrency=1)
    print(f"  stored       {report}")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)

    write = sub.add_parser("compose", help="write the run and its questions")
    write.add_argument("--behaviours", required=True, help="comma-separated slugs")
    write.add_argument("--documents", required=True,
                       help="comma-separated aci_spec_versions ids, at least two")
    write.add_argument("--again", action="store_true",
                       help="compose directions a done call already covers")
    write.add_argument("--go", action="store_true",
                       help="write the run and its calls to the database")
    write.set_defaults(handler=compose)

    read = sub.add_parser("store", help="feed the answers through the engine")
    read.add_argument("folder", help="the artefacts folder compose wrote")
    read.add_argument("--partial", action="store_true",
                      help="store the calls that are answered. An unanswered one "
                           "is marked error, because link_job catches whatever "
                           "call_model raises; a later store picks it up again, "
                           "since it retries every call that is not done")
    read.set_defaults(handler=store_answers)

    made = sub.add_parser("report", help="write the run as links.json for stages two and three")
    made.add_argument("--run", required=True, help="an aci_link_runs id")
    made.set_defaults(handler=build_report)

    # Both of these are run twice: once to write the questions, once to read the
    # answers. Nothing is stored on the first pass.
    third = sub.add_parser("arbitrate", help="settle the pairs the seat read two ways")
    third.add_argument("report", help="the report folder that `report` wrote")
    third.add_argument("--batch", type=int, default=10,
                       help="disputes per question; both documents travel in each")
    third.set_defaults(handler=arbitrate)

    last = sub.add_parser("summarise", help="write how the two documents stand")
    last.add_argument("report", help="the report folder that `report` wrote")
    last.add_argument("--behaviour", default=None,
                      help="one behaviour; every behaviour of the report by default")
    last.set_defaults(handler=summarise)

    each = sub.add_parser("paragraphs",
                          help="write what the other document does with each passage")
    each.add_argument("report", help="the report folder that `report` wrote")
    each.add_argument("--behaviour", default=None,
                      help="one behaviour; every behaviour of the report by default")
    each.add_argument("--floor", type=int, default=2,
                      help="counterparts a passage needs before it gets a paragraph")
    each.set_defaults(handler=paragraphs)

    grid = sub.add_parser("overview",
                          help="write where each specification stands on each behaviour")
    grid.add_argument("--out", default=str(ROOT / "artefacts" / "standing.json"),
                      help="where the grid's passages are written")
    grid.set_defaults(handler=overview)

    deep = sub.add_parser("depths",
                          help="write why each figure of the grid is what it is")
    deep.add_argument("--out", default=str(ROOT / "site" / "depths.json"),
                      help="where the figures' paragraphs are written")
    deep.set_defaults(handler=depths)

    args = parser.parse_args(argv)
    # Both commands ask for the same cell more than once, and each ask is a full
    # read of two tables. See remembered_retained.
    compose_links.retained_passages = remembered_retained()
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
