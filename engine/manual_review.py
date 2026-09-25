"""A manual review: the owner's reading of a cell, written as one more judge.

A correction is stored the way the judges' readings are, as the rows of a call
whose model is `manual`, in the run that holds the cell: a verdict in
aci_judgements for each paragraph corrected (3 defining, 2 core, 1 related, 0
not shown), with its reason in `note`, and a depth in aci_depths_out_of_ten with
its reason in `rationale`. The design is
docs/superpowers/specs/2026-09-25-manual-review-design.md.

The manual call is not a seat. Everything that counts a cell's judges -- the
panel check, the depths a cell must have, the depth pass -- leaves it out, and
only a build asked for `--manual-review` reads its rows, so a publication built
without it rebuilds byte for byte whatever corrections exist.

Standard library only, like the rest of the engine.
"""

MANUAL = "manual"

BANDS = {3: "defining", 2: "core", 1: "related", 0: None}


def is_manual(call):
    """Whether a judge call is the owner's rather than a judge's."""
    return call.get("model") == MANUAL


def band_of(verdict):
    """The band a manual verdict sets: None for 0, which takes a passage off."""
    if verdict not in BANDS:
        raise ValueError(f"a manual verdict is 0, 1, 2 or 3, not {verdict!r}")
    return BANDS[verdict]


# ---------------------------------------------------------------------------
# Writing a correction.
#
#   python3 engine/manual_review.py --run=<run id> --behaviour=<slug> \
#       --document=<lab--document@version> \
#       --locator="<locator>" --band=defining|core|related|none --note="Why."
#   python3 engine/manual_review.py --run=... --behaviour=... --document=... \
#       --depth=3 --reason="Why." --assessment-run=<assessment run id>
#
# It writes rows and never changes one: aci_judgements and the depths are
# evidence, inserted and read. A correction already written for the same
# paragraph or depth is refused, naming it, rather than laid over.

VERDICTS = {"defining": 3, "core": 2, "related": 1, "none": 0}


def _in(values):
    return "in.(" + ",".join(f'"{v}"' for v in values) + ")"


def resolve_cell(store, run_id, behaviour, document):
    """(spec version row, judges' calls) for the cell, or SystemExit naming why."""
    spec_id, _, version = document.partition("@")
    versions = [v for v in store.select("aci_spec_versions",
                                        {"spec_id": f"eq.{spec_id}", "version": f"eq.{version}"})
                if v["spec_id"] == spec_id and v["version"] == version]
    if len(versions) != 1:
        raise SystemExit(f"no document {document!r}: name it lab--document@version")
    calls = [c for c in store.select("aci_judge_calls", {
                 "run_id": f"eq.{run_id}", "behaviour_slug": f"eq.{behaviour}",
                 "spec_version_id": f"eq.{versions[0]['id']}"})
             if c["run_id"] == run_id and c["behaviour_slug"] == behaviour
             and c["spec_version_id"] == versions[0]["id"]]
    judges = [c for c in calls if not is_manual(c) and c["status"] == "done"]
    if not judges:
        raise SystemExit(f"run {run_id} holds no judged cell {behaviour} x {document}")
    manual = next((c for c in calls if is_manual(c)), None)
    return versions[0], judges, manual


def manual_call(store, run_id, behaviour, version_id, existing):
    """The cell's manual call, written the first time a correction needs it."""
    if existing is not None:
        return existing
    [row] = store.insert("aci_judge_calls", [{
        "run_id": run_id, "behaviour_slug": behaviour, "spec_version_id": version_id,
        "model": MANUAL, "status": "done"}], returning=True)
    return row


def correct_passage(store, run_id, behaviour, document, locator, band, note):
    if band not in VERDICTS:
        raise SystemExit(f"--band is one of {', '.join(VERDICTS)}, not {band!r}")
    if not note.strip():
        raise SystemExit("--note is required: a correction says why")
    version, judges, existing = resolve_cell(store, run_id, behaviour, document)
    # Every judge reads the whole document and gives every paragraph a verdict, so
    # a locator no judge of the cell was given is not a paragraph of the document.
    judged = {row["locator"] for row in store.select(
        "aci_judgements", {"call_id": _in(c["id"] for c in judges), "locator": f"eq.{locator}"})}
    if locator not in judged:
        raise SystemExit(f"{locator!r} is not a paragraph the judges of this cell were given")
    if existing is not None and store.select(
            "aci_judgements", {"call_id": f"eq.{existing['id']}", "locator": f"eq.{locator}"}):
        raise SystemExit(f"{locator!r} already carries a manual review in this run")
    call = manual_call(store, run_id, behaviour, version["id"], existing)
    verdict = VERDICTS[band]
    store.insert("aci_judgements", [{
        "call_id": call["id"], "locator": locator, "verdict": verdict,
        "relevant": 1 if verdict else 0, "parsed": True, "note": note.strip()}])
    return call


def correct_depth(store, run_id, behaviour, document, depth, reason, assessment_run_id,
                  prompt_sha256):
    if not 0 <= depth <= 10:
        raise SystemExit(f"--depth is 0 to 10, not {depth}")
    if not reason.strip():
        raise SystemExit("--reason is required: a correction says why")
    import index_store  # noqa: E402  (loaded here: the helpers above import nothing)
    given_with = index_store.criteria_run_id(store, assessment_run_id)
    version, judges, existing = resolve_cell(store, run_id, behaviour, document)
    judged = [row for row in store.select(
        "aci_depths_out_of_ten", {"call_id": _in(c["id"] for c in judges)})
        if row.get("assessment_run_id") == given_with
        and row.get("prompt_sha256") == prompt_sha256 and row.get("status") == "done"]
    if len(judged) != len(judges):
        raise SystemExit("the judges of this cell have not all given a depth out of ten "
                         f"against {assessment_run_id} under the current prompt")
    if existing is not None and [row for row in store.select(
            "aci_depths_out_of_ten", {"call_id": f"eq.{existing['id']}"})
            if row.get("assessment_run_id") == given_with
            and row.get("prompt_sha256") == prompt_sha256]:
        raise SystemExit("this cell already carries a manual depth in this run")
    call = manual_call(store, run_id, behaviour, version["id"], existing)
    store.insert("aci_depths_out_of_ten", [{
        "call_id": call["id"], "prompt_sha256": prompt_sha256,
        "assessment_run_id": given_with, "status": "done",
        "depth": depth, "rationale": reason.strip()}])
    return call


def main(argv=None):
    import argparse
    import sys
    from pathlib import Path
    here = Path(__file__).resolve().parent
    sys.path.insert(0, str(here))
    sys.path.insert(0, str(here / "panel"))
    import depth_call  # noqa: E402
    from store import Store  # noqa: E402

    parser = argparse.ArgumentParser(description="Write the owner's correction to one cell.")
    parser.add_argument("--run", required=True)
    parser.add_argument("--behaviour", required=True)
    parser.add_argument("--document", required=True, help="lab--document@version")
    parser.add_argument("--locator")
    parser.add_argument("--band", choices=sorted(VERDICTS))
    parser.add_argument("--note", default="")
    parser.add_argument("--depth", type=int)
    parser.add_argument("--reason", default="")
    parser.add_argument("--assessment-run")
    args = parser.parse_args(argv)
    store = Store.from_env()
    if args.locator is not None:
        call = correct_passage(store, args.run, args.behaviour, args.document,
                               args.locator, args.band, args.note)
        print(f"{args.locator}: {args.band}, in manual call {call['id']}")
    elif args.depth is not None:
        if not args.assessment_run:
            raise SystemExit("--depth needs --assessment-run, the run the judges' depths "
                             "out of ten were given against")
        call = correct_depth(store, args.run, args.behaviour, args.document, args.depth,
                             args.reason, args.assessment_run, depth_call.prompt_sha256(10))
        print(f"depth {args.depth}, in manual call {call['id']}")
    else:
        raise SystemExit("name a --locator with --band and --note, or a --depth with --reason")
    print("It reaches the site with the next publication built with --manual-review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
