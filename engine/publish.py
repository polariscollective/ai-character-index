#!/usr/bin/env python3
"""Building a publication: the decision about what the reader shows.

    ACI_JOB_ID=<uuid> python3 engine/job.py          # as the portal runs it
    python3 engine/publish.py --behaviours=a,b --documents=<version id>,<version id>

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

The panel is the configuration's display panel, the one the index publishes, and
every cell must also carry a depth from each of its run's judges.

"Exactly the panel" means the panel as the cell was seated. A judge that cannot
answer a cell at all is replaced there, and `aci_seat_substitutions` records it;
a cell is then held to the panel with that seat given to its substitute, which is
the rule the trigger applies. A substitute nobody recorded is refused like any
other stranger in a seat.
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
import seat_substitutions        # noqa: E402
from store import Store          # noqa: E402

# How each builder serialises, which is what its digest describes. They differ,
# and the difference is load-bearing: the digest recorded for the published
# artefacts is of these exact bytes.
FORMATS = {
    "payload": dict(indent=1, ensure_ascii=False),
    "documents": dict(ensure_ascii=False, separators=(",", ":")),
    # What engine/build-links-data.mjs writes, byte for byte. Its serialise() is
    # JSON.stringify(value, null, 2) with no trailing newline, which is exactly
    # this call's output. test_publish.LinksFormatTest holds the two together.
    "links": dict(indent=2, ensure_ascii=False),
}
BUILDERS = {
    "payload": (HERE / "panel" / "build_site_data.py",
                ["--threshold=4", "--solid-threshold=6"]),
    "documents": (ROOT / "engine" / "build-spec-reader-data.py", []),
    "links": (ROOT / "engine" / "build-links-data.mjs", []),
}


def document_versions(store, document_ids):
    """The versions a publication carries, as themselves. A document is a version:
    naming an older one publishes the older one."""
    rows = {v["id"]: v for v in store.select("aci_spec_versions")}
    missing = sorted(set(document_ids) - set(rows))
    if missing:
        raise SystemExit(f"not document versions this index carries: {missing}")
    return [rows[i] for i in sorted(set(document_ids))]


def panel_seats(config, name):
    seats = config.get("panels", {}).get(name)
    if not isinstance(seats, list) or not seats:
        raise SystemExit(f"no panel named {name!r} in the judging configuration")
    return sorted(seats)


def require_depths(store, cells, panel):
    """Refuse a publication any of whose cells lacks a depth from every judge of
    its run, naming them all at once.

    Every judge means the panel as the cell was seated. A depth from the seat is
    not a depth from its substitute: the cell's verdicts are the substitute's, so
    its depth must be too."""
    given = index_store.cell_depths(store, cells)
    recorded = seat_substitutions.recorded(store, run_id=[c["run_id"] for c in cells])
    versions = {v["id"]: v for v in store.select("aci_spec_versions")}

    def complete(cell):
        depth = given.get((cell["behaviour_slug"], cell["spec_version_id"]))
        seated = seat_substitutions.seats(panel, recorded.get(
            (cell["run_id"], cell["behaviour_slug"], cell["spec_version_id"]), ()))
        return depth is not None and sorted(depth["judges"]) == seated

    missing = sorted(
        f"{c['behaviour_slug']} x {versions[c['spec_version_id']]['spec_id']}"
        f"@{versions[c['spec_version_id']]['version']}"
        for c in cells if not complete(c))
    if missing:
        raise SystemExit(
            "these cells have no depth from every judge of their run:\n  "
            + "\n  ".join(missing)
            + "\nRetry the run's failed calls, then build again.")


def require_declared_substitutes(store, cells, config, panel_name, panel):
    """Refuse a publication any of whose cells carries a recorded substitution
    the panel's own configuration does not declare for that seat.

    `choose_cells` already gives a recorded substitution's seat to its
    substitute when matching a run to the panel -- that only asks whether the
    cell was recorded, not whether the panel allows the pair. This is the
    second gate: the seat's substitute must be on `panel-config.json`'s
    `substitutes` list for that panel and that seat. A substitution for a seat
    outside the panel is not this function's business; choose_cells already
    leaves those alone.
    """
    recorded = seat_substitutions.recorded(
        store, run_id=[c["run_id"] for c in cells],
        behaviour_slug=[c["behaviour_slug"] for c in cells],
        spec_version_id=[c["spec_version_id"] for c in cells])
    versions = {v["id"]: v for v in store.select("aci_spec_versions")}

    problems = []
    for cell in cells:
        key = (cell["run_id"], cell["behaviour_slug"], cell["spec_version_id"])
        for row in recorded.get(key, ()):
            seat = row["seat"]
            if seat not in panel:
                continue
            if seat_substitutions.declared(config, panel_name, seat, row["substitute"]):
                continue
            order = config.get("substitutes", {}).get(panel_name, {}).get(seat, [])
            allowed = (f"{seat} may be substituted by " + ", then ".join(order)
                       if order else f"{seat} may not be substituted")
            version = versions[cell["spec_version_id"]]
            problems.append(
                f"{cell['behaviour_slug']} x {version['spec_id']}@{version['version']} "
                f"records {seat} substituted by {row['substitute']}, which "
                f"{panel_name} does not declare: {allowed}.")
    if problems:
        raise SystemExit(
            "these cells carry a substitution the panel does not declare:\n  "
            + "\n  ".join(problems))


def _depth_complete_keys(store, matched):
    """The keys of `matched` whose every done call also carries a done depth.

    Read with the store's filtered selects, scoped to exactly the calls the
    candidate runs hold -- a publication's candidate set is a handful of
    cells, not the whole history of judge calls, so nothing here reads a
    table whole.
    """
    ids = sorted({call["id"] for calls in matched.values() for call in calls})
    if not ids:
        return set()
    params = {"call_id": "in.(" + ",".join(f'"{i}"' for i in ids) + ")",
              "status": "eq.done"}
    done_depths = {row["call_id"] for row in store.select("aci_depths", params)}
    return {key for key, calls in matched.items()
            if all(call["id"] in done_depths for call in calls)}


def choose_cells(store, behaviours, spec_versions, panel, rubric):
    """One run per cell, or a refusal naming every cell that has no answer.

    The newest run that can actually be published for the cell: it judged the
    cell with exactly this panel, every call done, and every one of those
    calls carries a done depth. A run whose depths are still pending can never
    be published, so preferring it over a complete older run could only trade
    a publishable answer for one that blocks the build.

    "Exactly" is the whole point: a cell judged by six models and a cell judged
    by three are not the same claim, and a publication that mixed them would
    compare labs on unequal evidence -- which is what the bench inherited from
    upstream did. That bench was this rule's one exemption, and the cleanup
    migration of 16 September 2026 archived both.

    The panel is compared as each cell of each run was seated: a recorded
    substitution gives its seat to the substitute for that cell of that run and
    nowhere else.

    A cell nothing judged with this panel at all is refused here, naming every
    such cell at once. A cell some run did judge, but none of those runs has
    every depth done, is still returned -- choosing the newest of them -- and
    left for `require_depths` to refuse by name, because that is the guard
    whose message explains what to do about it.
    """
    runs = {run["id"]: run for run in store.select("aci_runs")}
    want = sorted(panel)
    recorded = seat_substitutions.recorded(
        store, behaviour_slug=behaviours,
        spec_version_id=[version["id"] for version in spec_versions])

    calls_by_key = {}
    for call in store.select("aci_judge_calls"):
        if call["status"] != "done":
            continue
        key = (call["run_id"], call["behaviour_slug"], call["spec_version_id"])
        calls_by_key.setdefault(key, []).append(call)

    matched = {
        key: calls for key, calls in calls_by_key.items()
        if runs[key[0]]["rubric"] == rubric
        and sorted({call["model"] for call in calls}) == seat_substitutions.seats(
            want, recorded.get(key, ()))
    }
    publishable = _depth_complete_keys(store, matched)

    by_cell = {}
    for key in matched:
        run_id, slug, version_id = key
        by_cell.setdefault((slug, version_id), []).append(key)

    cells, unanswered = [], []
    for slug in sorted(behaviours):
        for version in spec_versions:
            keys = by_cell.get((slug, version["id"]), [])
            if not keys:
                unanswered.append(f"{slug} x {version['spec_id']}@{version['version']}")
                continue
            best = max(keys, key=lambda k: (k in publishable, runs[k[0]]["created_at"]))
            cells.append({"behaviour_slug": slug, "spec_version_id": version["id"],
                          "run_id": best[0]})
    if unanswered:
        raise SystemExit(
            "no run judged these cells with exactly this panel "
            f"({', '.join(want)}), rubric {rubric}:\n  "
            + "\n  ".join(unanswered)
            + "\nCompose and run the missing calls, or publish a smaller grid. A cell "
            "a seat cannot answer is judged by a substitute only once "
            "aci_seat_substitutions records it for that cell of that run.")
    return cells


def build(name, cells, behaviours, run_date=None, panel_name=None, link_runs=(),
          note_prompts=None):
    """One payload, as its builder writes it, with its digest.

    The behaviour list is passed explicitly, and that is not a detail. Without it
    the payload builder takes its menu from `display.behaviours` in the panel
    configuration, so a publication of five behaviours renders ten, five of them
    with no passages -- which a reader reads as "this specification says nothing
    about this", the one claim the index must never make by accident.
    """
    script, args = BUILDERS[name]
    # The interpreter follows the builder's extension rather than a second
    # table. The links builder is JavaScript because the assembly it needs lives
    # in app/lib/links.mjs, and a Python port would be a second copy of it.
    runner = ["node"] if script.suffix == ".mjs" else [sys.executable]
    with tempfile.TemporaryDirectory() as scratch:
        cells_file = Path(scratch) / "cells.json"
        cells_file.write_text(json.dumps(cells))
        out = Path(scratch) / f"{name}.json"
        extra = [f"--run-date={run_date}"] if run_date and name == "payload" else []
        if name == "payload":
            extra.append("--behaviours=" + ",".join(sorted(behaviours)))
            if panel_name:
                extra.append(f"--panel={panel_name}")
        if name == "links":
            extra.append("--link-runs=" + ",".join(sorted(link_runs)))
            if note_prompts is not None:
                extra.append("--note-prompts=" + ",".join(sorted(note_prompts)))
        result = subprocess.run(
            [*runner, str(script), *args, *extra,
             f"--cells={cells_file}", f"--out={out}"],
            capture_output=True, text=True)
        if result.returncode != 0:
            raise SystemExit(f"{script.name} failed:\n"
                             + (result.stderr or result.stdout).strip())
        raw = out.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def publish(store, behaviours, document_ids, rubric, published_by, notes="",
            run_date=None, config=None, link_runs=()):
    """The publication row and its cells, written in that order.

    The row first because the cells reference it. Nothing is public: a reader
    following `?publication=` can see it, and nobody else can.
    """
    if not link_runs:
        raise SystemExit("publish: --link-runs is required, because a publication "
                         "names the link runs it carries")
    config = config or json.loads((HERE / "panel" / "panel-config.json").read_text())
    panel_name = config["display"]["panel"]
    panel = panel_seats(config, panel_name)
    versions = document_versions(store, document_ids)
    cells = choose_cells(store, behaviours, versions, panel, rubric)
    require_declared_substitutes(store, cells, config, panel_name, panel)
    require_depths(store, cells, panel)

    # The prompt digests present when this was built. A document note carries no run,
    # so this is what pins it: the table's unique key ends in this digest, so a note
    # written later for a cell this publication carries must have a different one and
    # is excluded rather than silently swapped in.
    note_prompts = sorted({row["prompt_sha256"] for row in
                           store.select("aci_document_notes", {"select": "prompt_sha256"})})

    payload, payload_sha256 = build("payload", cells, behaviours, run_date, panel_name)
    documents, documents_sha256 = build("documents", cells, behaviours)
    links, links_sha256 = build("links", cells, behaviours,
                                link_runs=link_runs, note_prompts=note_prompts)

    publication = {
        "published_by": published_by,
        "notes": notes,
        "panel": panel,
        "rubric": rubric,
        "is_public": False,
        "build_params": {"behaviours": sorted(behaviours),
                         "documents": sorted(document_ids),
                         "panel": panel_name, "rubric": rubric,
                         "run_date": run_date,
                         "link_runs": sorted(link_runs),
                         "note_prompts": note_prompts},
        "payload": payload,
        "payload_sha256": payload_sha256,
        "documents": documents,
        "documents_sha256": documents_sha256,
        "links": links,
        "links_sha256": links_sha256,
    }
    [row] = store.insert("aci_publications", [publication], returning=True)
    store.insert("aci_publication_cells",
                 [cell | {"publication_id": row["id"]} for cell in cells])
    return row, cells


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--behaviours", required=True, help="comma-separated slugs")
    parser.add_argument("--documents", required=True,
                        help="comma-separated aci_spec_versions ids")
    parser.add_argument("--rubric", default="v5")
    parser.add_argument("--notes", default="")
    parser.add_argument("--by", default=os.environ.get("USER", "publish.py"))
    parser.add_argument("--run-date", default=None,
                        help="pin provenance.runDate, for a reproducible rebuild")
    parser.add_argument("--link-runs", required=True,
                        help="comma-separated aci_link_runs ids this publication carries")
    args = parser.parse_args(argv)

    store = Store.from_env()
    index_store.install_registry(store)
    row, cells = publish(
        store,
        [s for s in args.behaviours.split(",") if s],
        [s for s in args.documents.split(",") if s],
        args.rubric, args.by, args.notes, args.run_date,
        link_runs=[s for s in args.link_runs.split(",") if s])
    print(f"published {row['id']} (not public): {len(cells)} cells")
    print(f"  payload   {row['payload_sha256'][:16]}")
    print(f"  documents {row['documents_sha256'][:16]}")
    print(f"  links     {row['links_sha256'][:16]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
