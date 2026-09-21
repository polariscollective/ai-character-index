#!/usr/bin/env python3
"""Assess documents as wholes, and store what the judges said.

    python3 engine/assess.py --documents=<version id>,<version id>        # priced, nothing written
    python3 engine/assess.py --documents=<version id>,<version id> --go   # spends, and writes

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
"""

import argparse
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
from store import Store          # noqa: E402

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


def ceiling_document(labelled, panels, config, panel=PANEL):
    """The most assessing one document can cost: for every seat of each
    question, and for each contradictions seat's confirmation, every declared
    candidate (the seat's own model, then each substitute in order), each billed
    at the input `assessment_run.price_document` estimates for that call and at
    the model's largest output. A substitute skipped as already seated is not a
    call, so this is the worst case before any seating is known."""
    def at_most(seat, system, user):
        return sum(seat_call.priced(candidate, system, user,
                                    seat_call.max_output(candidate, config), config)
                   for candidate in assessment_run.candidates(seat, config, panel))

    ceiling = 0.0
    for question in assessment_call.QUESTIONS:
        system, user = assessment_call.compose(question, labelled)
        ceiling += sum(at_most(seat, system, user) for seat in panels[question])
    system, user = assessment_call.compose_confirm(labelled, [])
    user += "x" * assessment_run.CONFIRM_CLAIMS_CHARS
    ceiling += sum(at_most(seat, system, user) for seat in panels["contradictions"])
    return ceiling


def gaps(store, run_id, version_ids):
    """What keeps run `run_id` from standing for the documents it assessed,
    by the rule a publication applies, one sentence per gap."""
    versions = {row["id"]: row for row in store.select("aci_spec_versions")}
    wanted = list(dict.fromkeys(version_ids))
    run, by_version = index_store.assessment_rows(store, run_id, wanted)
    return index_store.assessment_gaps(run_id, run, by_version,
                                       [versions[version_id] for version_id in wanted])


def assess(store, config, version_ids, passages_for, call_model=None, go=False,
           created_by="assess.py", panel=PANEL):
    """Price the assessment of each document and, with `go`, run it and write it.
    Returns (the price in dollars, the run's id, or None when nothing was run).

    A seat whose every candidate failed leaves its call in error and the run
    goes on. Anything else that stops the run is written on the run, as its
    error, and raised."""
    panels = assessment_panels(config)
    documents = load_documents(store, version_ids, passages_for)
    estimate = round(sum(assessment_run.price_document(document["labelled"], panels, config)
                         for document in documents), 2)
    ceiling = round(sum(ceiling_document(document["labelled"], panels, config, panel)
                        for document in documents), 2)
    for document in documents:
        print(f"  {name_of(document['version'])}: {len(document['passages'])} passages")
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
                                      call_model or batch_job.call_openrouter, panel)
    try:
        run.start(created_by, estimate)
        for document in documents:
            run.document(document)
    except BaseException as stopped:
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
    args = parser.parse_args(argv)

    store = Store.from_env()
    index_store.install_registry(store)
    config = h.load_config()
    if args.go and os.environ.get("ANTHROPIC_API_KEY"):
        print(seat_call.ANTHROPIC_KEY_NOTE, file=sys.stderr)
    version_ids = [s for s in args.documents.split(",") if s]
    _estimate, run_id = assess(store, config, version_ids, h.passages, go=args.go,
                               created_by=args.by)
    if run_id is None:
        print("Nothing was written; run again with --go.")
        return 0
    print(f"assessment run {run_id}")
    # The run row is closed by now: what is read here is what it will stay.
    found = gaps(store, run_id, version_ids)
    if found:
        print(f"assessment run {run_id} does not assess every document it was given as a "
              "publication requires, so a depth pass or a publication would refuse it:\n  "
              + "\n  ".join(found)
              + "\nAn assessment run is not taken up again once it has stopped: assess "
              "these documents in a new run.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
