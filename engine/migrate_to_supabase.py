"""One-shot import of the committed artifacts into the index tables.

    python3 engine/migrate_to_supabase.py --dry-run   # counts, writes nothing
    python3 engine/migrate_to_supabase.py             # writes

Idempotent by construction rather than by luck: every generated id is a uuid5 of
the content it stands for, so a second run computes the same ids, finds them
already present, and inserts nothing.

What is imported, and what is not. The v5 runlog is the index: it produces the
run, its judge calls, its judgements and the publication the reader serves. The
v3 runlog is not imported. It is an archive of three overlapping experiments
under three rubrics -- `v3`, `v3w` and `v3s` -- over the same six cells, and 135
of its rows predate the `via` convention, so the prompt that produced them is
not recoverable. Forcing it into a schema built for runs would invent facts.
It stays committed, with `engine/panel/runlog-v3.md` as its record.
"""

import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "spec-cite"))
import cite  # noqa: E402
from store import Store  # noqa: E402

# A fixed namespace, so the ids are the same on every machine and every run.
NS = uuid.UUID("5f3a9e64-1c1c-4a3b-9c0e-2a7c1c9f0b21")

RUNLOG = HERE / "panel" / "runlog-v5.jsonl"
# The judging registry: what the panel is told about a behaviour, as opposed
# to what the reader displays. Keyed by the same slugs.
JUDGING = HERE / "panel" / "behaviours.json"
PROMPT = HERE / "panel" / "prompts" / "v5.txt"
PANEL_CONFIG = HERE / "panel" / "panel-config.json"
PAYLOAD = ROOT / "site" / "spec-reader" / "data" / "behaviours-v5-reader.json"
ACTOR = "migrate_to_supabase.py"


def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def ident(*parts):
    return str(uuid.uuid5(NS, "\x1f".join(str(p) for p in parts)))


def load_documents_constant():
    """The titles the reader shows live in a hyphenated script's DOCUMENTS
    constant, which is one of the hardcoded artifacts this migration exists to
    retire. Read it rather than retype it."""
    spec = importlib.util.spec_from_file_location(
        "build_spec_reader_data", ROOT / "engine" / "build-spec-reader-data.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return {document["id"]: document for document in module.DOCUMENTS}


def plan():
    """Every row this migration would write, computed from the committed files
    alone. Pure: it touches no network, which is what makes --dry-run honest
    and the tests offline."""
    labs_file = json.loads((ROOT / "data" / "labs.json").read_text())["labs"]
    registry = json.loads((ROOT / "data" / "behaviours.json").read_text())
    judging = json.loads(JUDGING.read_text())
    unknown = sorted(set(judging) - set(registry))
    if unknown:
        sys.exit(f"judging registry names behaviours the display registry does "
                 f"not know: {unknown}")
    curation = json.loads((ROOT / "data" / "panel-cell-curation.json").read_text())
    coverage = json.loads((ROOT / "data" / "coverage.json").read_text())["coverage"]
    documents = load_documents_constant()

    # labs, specs, spec versions -----------------------------------------
    path_to_spec = {path: (name, version)
                    for (name, version), path in cite.BUNDLED_SPECS.items()}
    labs, specs, versions = [], [], []
    lab_of_spec, version_of_spec = {}, {}
    for lab in labs_file:
        labs.append({"id": lab["id"], "name": lab["name"]})
        if not lab.get("has_published_spec"):
            continue
        spec_id, version_label = path_to_spec[lab["local_copy"]]
        document = documents[lab["id"]]
        specs.append({
            "id": spec_id,
            "lab_id": lab["id"],
            "title": document["title"],
            "short_title": document["shortTitle"],
            "source_url": document["sourceUrl"],
            # The judging engine reads model-spec locators by heading anchor and
            # every other document by its path of section titles. That was a
            # comparison against a hardcoded name; here it is a property.
            "locator_style": "anchor" if spec_id == "model-spec" else "path",
        })
        markdown = (ROOT / lab["local_copy"]).read_text(encoding="utf-8")
        digest = sha256(markdown)
        version_id = ident("spec-version", spec_id, digest)
        versions.append({
            "id": version_id, "spec_id": spec_id, "version": version_label,
            "markdown": markdown, "content_sha256": digest,
            "source_url": document["sourceUrl"], "added_by": ACTOR,
        })
        lab_of_spec[spec_id] = lab["id"]
        version_of_spec[spec_id] = version_id

    # behaviours ----------------------------------------------------------
    # `judging` is null where a behaviour has no entry: defined and judged are
    # independent states, and a behaviour can legitimately be neither.
    behaviours = [{
        "slug": slug, "name": entry["name"], "set_name": entry["set"],
        "numeric_id": entry["numeric_id"], "group_name": entry["group"],
        "definition": entry["definition"], "facets": entry["facets"],
        "judging": judging.get(slug),
    } for slug, entry in registry.items()]

    # the run, its calls, its judgements -----------------------------------
    log = [json.loads(line) for line in RUNLOG.read_text().splitlines() if line.strip()]
    missing = sorted({row["behaviour"] for row in log} - set(registry))
    if missing:
        sys.exit(f"runlog behaviours absent from the registry: {missing}")

    prompt = PROMPT.read_text(encoding="utf-8")
    prompt_digest = sha256(prompt)
    panel = sorted({row["model"] for row in log})
    rubric = log[0]["rubric"]
    via = log[0]["via"]
    run_id = ident("run", "runlog-v5", prompt_digest)
    run = {
        "id": run_id, "created_by": ACTOR, "status": "done", "rubric": rubric,
        "prompt": prompt, "prompt_sha256": prompt_digest, "panel": panel,
        "config": json.loads(PANEL_CONFIG.read_text()) | {"via": via},
        # What the run judged against, which is the display entry AND the entry
        # the panel was actually given. Recording only the first said the run
        # used definitions it did not.
        "behaviours": {slug: registry[slug] | {"judging": judging.get(slug)}
                       for slug in sorted({row["behaviour"] for row in log})},
    }

    calls, judgements, cells = {}, [], set()
    for row in log:
        version_id = version_of_spec[row["spec"]]
        key = (row["behaviour"], version_id, row["model"])
        call_id = ident("call", run_id, *key)
        call = calls.setdefault(call_id, {
            "id": call_id, "run_id": run_id, "behaviour_slug": row["behaviour"],
            "spec_version_id": version_id, "model": row["model"],
            "status": "done", "passages": 0, "unparsed": 0,
        })
        call["passages"] += 1
        call["unparsed"] += 0 if row["parsed"] else 1
        judgements.append({
            "call_id": call_id, "locator": row["locator"],
            "verdict": row["verdict"], "relevant": row["relevant"],
            "parsed": row["parsed"],
        })
        cells.add((row["behaviour"], version_id))

    # cell curation and the frozen ledger ----------------------------------
    curation_rows = [{
        "behaviour_slug": cell["slug"], "lab_id": cell["lab_id"],
        "verdict": cell["verdict"], "depth_0_4": cell["depth_0_4"],
        "verified_date": cell["verified_date"],
    } for cell in curation["cells"]]

    slug_of_index_id = {entry["numeric_id"]: slug
                        for slug, entry in registry.items()
                        if entry["set"] == "index"}
    coverage_rows = []
    for record in coverage:
        slug = slug_of_index_id.get(record["behaviour_id"])
        if slug is None:
            sys.exit(f"coverage behaviour_id {record['behaviour_id']} is not in "
                     "the registry's index set")
        coverage_rows.append({
            "behaviour_slug": slug, "lab_id": record["lab_id"],
            "verdict": record["verdict"], "depth_0_4": record["depth_0_4"],
            "depth_note": record["depth_note"], "citations": record["citations"],
            "verified_date": record["verified_date"],
            "verified_against_version": record["verified_against_version"],
            "citation_format": record["citation_format"],
        })

    # the publication the reader serves ------------------------------------
    payload = json.loads(PAYLOAD.read_text())
    payload_digest = sha256(PAYLOAD.read_text())
    publication_id = ident("publication", payload_digest)
    # `documents` is filled in by migrate(), not here: it is built from the rows
    # this migration is about to write, so it cannot be computed before writing.
    publication = {
        "id": publication_id, "published_by": ACTOR,
        "notes": "The bench in production at the time of the migration. "
                 "Grandfathered: four behaviours were judged by more models on "
                 "the constitution than on the model spec, which the "
                 "homogeneity check would otherwise refuse.",
        "panel": panel, "rubric": rubric, "grandfathered": True,
        "build_params": {"threshold": 4, "solid_threshold": 6},
        "payload": payload, "payload_sha256": payload_digest,
    }
    publication_cells = [{
        "publication_id": publication_id, "behaviour_slug": behaviour,
        "spec_version_id": version_id, "run_id": run_id,
    } for behaviour, version_id in sorted(cells)]

    return {
        "aci_labs": labs,
        "aci_specs": specs,
        "aci_spec_versions": versions,
        "aci_behaviours": behaviours,
        "aci_runs": [run],
        "aci_judge_calls": list(calls.values()),
        "aci_judgements": judgements,
        "aci_cell_curation": curation_rows,
        "aci_coverage": coverage_rows,
        "aci_publications": [publication],
        "aci_publication_cells": publication_cells,
    }


# The column, or columns, that identify a row already present.
KEYS = {
    "aci_labs": ("id",),
    "aci_specs": ("id",),
    "aci_spec_versions": ("id",),
    "aci_behaviours": ("slug",),
    "aci_runs": ("id",),
    "aci_judge_calls": ("id",),
    "aci_judgements": ("call_id", "locator"),
    "aci_cell_curation": ("behaviour_slug", "lab_id"),
    "aci_coverage": ("behaviour_slug", "lab_id"),
    "aci_publications": ("id",),
    "aci_publication_cells": ("publication_id", "behaviour_slug", "spec_version_id"),
}
ORDER = list(KEYS)

# Tables whose existing rows are brought back into line with the plan, and the
# columns the plan owns on each. Insert-only was enough while every table was
# being filled for the first time; a column added afterwards leaves the rows
# there and wrong. Only these two take an update at all.
RECONCILE = {
    "aci_behaviours": ("name", "set_name", "numeric_id", "group_name",
                       "definition", "facets", "judging"),
    "aci_runs": ("behaviours",),
}


def build_documents_payload():
    """The documents payload, built from the database by the builder that owns
    that shape. Running the real builder rather than reimplementing it is the
    point: the payload a route will serve is the payload the provenance verifier
    compares, because there is one implementation of it."""
    with tempfile.TemporaryDirectory() as scratch:
        out = Path(scratch) / "documents.json"
        result = subprocess.run(
            [sys.executable, str(ROOT / "engine" / "build-spec-reader-data.py"),
             "--from-supabase", f"--out={out}"],
            capture_output=True, text=True)
        if result.returncode != 0:
            sys.exit("building the documents payload failed:\n"
                     + (result.stderr or result.stdout))
        text = out.read_text()
    return json.loads(text), sha256(text)


def migrate(store, dry_run=False, build_documents=None):
    """Insert what is missing, table by table, in foreign-key order.

    The publication comes last and is completed rather than planned: its
    documents payload is built from the rows written just above it. That builder
    is injectable for the same reason the store's transport is: the tests prove
    the mapping, and proving it should not need a database.
    """
    build_documents = build_documents or build_documents_payload
    rows_by_table = plan()
    report = {}
    for table in ORDER:
        rows = rows_by_table[table]
        key = KEYS[table]
        present = {tuple(row[column] for column in key)
                   for row in store.select(table, {"select": ",".join(key)})}
        new = [row for row in rows if tuple(row[c] for c in key) not in present]
        report[table] = {"total": len(rows), "new": len(new)}
        stale = []
        if table in RECONCILE:
            columns = RECONCILE[table]
            stored = {tuple(row[c] for c in key): row
                      for row in store.select(
                          table, {"select": ",".join(key + columns)})}
            for row in rows:
                was = stored.get(tuple(row[c] for c in key))
                if was is None:
                    continue
                patch = {c: row[c] for c in columns if was.get(c) != row[c]}
                if patch:
                    stale.append(({c: row[c] for c in key}, patch))
            report[table]["updated"] = len(stale)

        if dry_run or not (new or stale):
            continue
        for match, patch in stale:
            store.update(table, match, patch)
        if not new:
            continue
        if table == "aci_publications":
            documents, digest = build_documents()
            for row in new:
                row["documents"] = documents
                row["documents_sha256"] = digest
        store.insert(table, new)
    return report


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    dry_run = "--dry-run" in argv
    for arg in argv:
        if arg != "--dry-run":
            sys.exit(f"unknown argument {arg!r} (supported: --dry-run)")
    report = migrate(Store.from_env(), dry_run=dry_run)
    width = max(len(name) for name in report)
    for table, counts in report.items():
        line = (f"  {table:<{width}}  {counts['total']:>6} rows, "
                f"{counts['new']:>6} to insert")
        if "updated" in counts:
            line += f", {counts['updated']:>3} to update"
        print(line)
    print("nothing written (--dry-run)" if dry_run else "written")


if __name__ == "__main__":
    main()
