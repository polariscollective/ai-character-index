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
    for document in documents:
        print(f"  {name_of(document['version'])}: {len(document['passages'])} passages")
    print(f"Priced at about {estimate} dollars: criteria by {', '.join(panels['criteria'])}; "
          f"contradictions and their confirmation by {', '.join(panels['contradictions'])}. "
          "The price counts each seat's own model once; a refused attempt is billed "
          "before its substitute answers, so a run that meets a refusal costs more "
          "than this estimate.")
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
        print("note: ANTHROPIC_API_KEY is set, so fable is called on Anthropic's own "
              "API. The repository's .env has carried a stale key that answers 401; "
              "unset it to go through OpenRouter, as the container does.", file=sys.stderr)
    _estimate, run_id = assess(store, config, [s for s in args.documents.split(",") if s],
                               h.passages, go=args.go, created_by=args.by)
    if run_id is None:
        print("Nothing was written; run again with --go.")
        return 0
    print(f"assessment run {run_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
