#!/usr/bin/env python3
"""Building a publication: the decision about what the reader shows.

    ACI_JOB_ID=<uuid> python3 engine/job.py          # as the portal runs it
    python3 engine/publish.py --behaviours=a,b --specs=x,y --panel=frontier_fast

A publication selects, cell by cell, which run answers, and carries the two
payloads the reader's routes serve. Both are columns of the row, and the row is
insert-only: there is no insert-then-fill, so the payloads are built before the
row exists and the builders are pointed at the selection with --cells.

It is written NOT public. A build that has not been looked at is a draft, and
making it public is a separate decision -- one column, one click, reversible.

Homogeneity is checked here and enforced by the database. A cell must have been
judged by exactly the panel the publication names, all of them done, in one run.
The check here exists to refuse before a row is written, because a publication is
insert-only and a half-built one cannot be taken back; the trigger exists because
a rule that lives in the code that happens to write the row is not a rule.
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "spec-cite"))

import index_store               # noqa: E402
from store import Store          # noqa: E402

# How each builder serialises, which is what its digest describes. They differ,
# and the difference is load-bearing: the digest recorded for the published
# artefacts is of these exact bytes.
FORMATS = {
    "payload": dict(indent=1, ensure_ascii=False),
    "documents": dict(ensure_ascii=False, separators=(",", ":")),
}
BUILDERS = {
    "payload": (HERE / "panel" / "build_site_data.py",
                ["--threshold=4", "--solid-threshold=6"]),
    "documents": (ROOT / "engine" / "build-spec-reader-data.py", []),
}


def newest_version_per_spec(store, spec_ids):
    """The version of each named document a publication would carry.

    The newest by label, which is how the composer picks too: a lab's version
    string sorts the way the lab means it to.
    """
    by_spec = {}
    for version in store.select("aci_spec_versions"):
        if version["spec_id"] not in spec_ids:
            continue
        current = by_spec.get(version["spec_id"])
        if current is None or version["version"] > current["version"]:
            by_spec[version["spec_id"]] = version
    missing = sorted(set(spec_ids) - set(by_spec))
    if missing:
        raise SystemExit(f"not specifications this index carries: {missing}")
    return by_spec


def choose_cells(store, behaviours, spec_versions, panel, rubric):
    """One run per cell, or a refusal naming every cell that has no answer.

    The newest run that judged the cell with exactly this panel, every call done.
    "Exactly" is the whole point: a cell judged by six models and a cell judged by
    three are not the same claim, and a publication that mixed them would compare
    labs on unequal evidence -- which is what the bench inherited from before this
    rule does, and why it is the one grandfathered exemption.
    """
    runs = {run["id"]: run for run in store.select("aci_runs")}
    want = sorted(panel)

    done = {}
    for call in store.select("aci_judge_calls"):
        if call["status"] != "done":
            continue
        key = (call["run_id"], call["behaviour_slug"], call["spec_version_id"])
        done.setdefault(key, set()).add(call["model"])

    cells, unanswered = [], []
    for slug in sorted(behaviours):
        for version in spec_versions:
            answers = [
                runs[run_id] for (run_id, b, v), models in done.items()
                if b == slug and v == version["id"]
                and sorted(models) == want
                and runs[run_id]["rubric"] == rubric
            ]
            if not answers:
                unanswered.append(f"{slug} x {version['spec_id']}@{version['version']}")
                continue
            newest = max(answers, key=lambda run: run["created_at"])
            cells.append({"behaviour_slug": slug, "spec_version_id": version["id"],
                          "run_id": newest["id"]})
    if unanswered:
        raise SystemExit(
            "no run judged these cells with exactly this panel "
            f"({', '.join(want)}), rubric {rubric}:\n  "
            + "\n  ".join(unanswered)
            + "\nCompose and run the missing calls, or publish a smaller grid.")
    return cells


def build(name, cells, behaviours, run_date=None):
    """One payload, as its builder writes it, with its digest.

    The behaviour list is passed explicitly, and that is not a detail. Without it
    the payload builder takes its menu from `display.behaviours` in the panel
    configuration, so a publication of five behaviours renders ten, five of them
    with no passages -- which a reader reads as "this specification says nothing
    about this", the one claim the index must never make by accident.
    """
    script, args = BUILDERS[name]
    with tempfile.TemporaryDirectory() as scratch:
        cells_file = Path(scratch) / "cells.json"
        cells_file.write_text(json.dumps(cells))
        out = Path(scratch) / f"{name}.json"
        extra = [f"--run-date={run_date}"] if run_date and name == "payload" else []
        if name == "payload":
            extra.append("--behaviours=" + ",".join(sorted(behaviours)))
        result = subprocess.run(
            [sys.executable, str(script), *args, *extra,
             f"--cells={cells_file}", f"--out={out}"],
            capture_output=True, text=True)
        if result.returncode != 0:
            raise SystemExit(f"{script.name} failed:\n"
                             + (result.stderr or result.stdout).strip())
        raw = out.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def publish(store, behaviours, specs, panel, rubric, published_by, notes="",
            run_date=None):
    """The publication row and its cells, written in that order.

    The row first because the cells reference it. Nothing is public: a reader
    following `?publication=` can see it, and nobody else can.
    """
    versions = list(newest_version_per_spec(store, specs).values())
    cells = choose_cells(store, behaviours, versions, panel, rubric)

    payload, payload_sha256 = build("payload", cells, behaviours, run_date)
    documents, documents_sha256 = build("documents", cells, behaviours)

    publication = {
        "published_by": published_by,
        "notes": notes,
        "panel": sorted(panel),
        "rubric": rubric,
        "is_public": False,
        "build_params": {"behaviours": sorted(behaviours), "specs": sorted(specs),
                         "panel": sorted(panel), "rubric": rubric,
                         "run_date": run_date},
        "payload": payload,
        "payload_sha256": payload_sha256,
        "documents": documents,
        "documents_sha256": documents_sha256,
    }
    [row] = store.insert("aci_publications", [publication], returning=True)
    store.insert("aci_publication_cells",
                 [cell | {"publication_id": row["id"]} for cell in cells])
    return row, cells


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--behaviours", required=True, help="comma-separated slugs")
    parser.add_argument("--specs", required=True, help="comma-separated document ids")
    parser.add_argument("--panel", required=True,
                        help="comma-separated model tags, exactly the panel of every cell")
    parser.add_argument("--rubric", default="v5")
    parser.add_argument("--notes", default="")
    parser.add_argument("--by", default=os.environ.get("USER", "publish.py"))
    parser.add_argument("--run-date", default=None,
                        help="pin provenance.runDate, for a reproducible rebuild")
    args = parser.parse_args(argv)

    store = Store.from_env()
    index_store.install_registry(store)
    row, cells = publish(
        store,
        [s for s in args.behaviours.split(",") if s],
        [s for s in args.specs.split(",") if s],
        [s for s in args.panel.split(",") if s],
        args.rubric, args.by, args.notes, args.run_date)
    print(f"published {row['id']} (not public): {len(cells)} cells")
    print(f"  payload   {row['payload_sha256'][:16]}")
    print(f"  documents {row['documents_sha256'][:16]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
