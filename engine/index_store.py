"""The index, read back out of its tables in the shapes the builders expect.

Every function here returns what a committed file used to hold, so the builders
downstream keep working on the shape they already know. The seam is deliberate:
the builders' logic is the part that has been proved byte-identical for a year,
and moving the data should not disturb it.

One inherited constraint is worth stating. A reader document is keyed by its
lab, not by its spec: `documents.json` calls them `anthropic` and `openai` while
locators call them `constitution` and `model-spec`. Two labs are two documents,
but a lab that published two specs would collide. That is upstream's shape, kept
here because the payload and the ?spec= parameter both depend on it.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "spec-cite"))
import cite  # noqa: E402


def _rows(store, table, params=None):
    return store.select(table, params)


def spec_registry(store):
    """(entries, defaults, meta, source), the four arguments cite.use_registry
    takes. The markdown arrives with the version rows, so `source` is a lookup
    and never a second query."""
    specs = {row["id"]: row for row in _rows(store, "aci_specs")}
    versions = _rows(store, "aci_spec_versions")

    entries, meta, text = {}, {}, {}
    newest = {}
    for version in versions:
        spec = specs[version["spec_id"]]
        key = (spec["id"], version["version"])
        entries[key] = version["id"]
        text[version["id"]] = version["markdown"]
        meta[key] = {"title": spec["title"], "sourceUrl": version["source_url"]}
        if version["version"] > newest.get(spec["id"], ""):
            newest[spec["id"]] = version["version"]

    return entries, newest, meta, text.__getitem__


def install_registry(store):
    """Point cite.py at the database for the rest of this process."""
    cite.use_registry(*spec_registry(store))


def documents(store, spec_version_ids=None):
    """The `documents` entries of the reader payload, markdown included.

    Ordered by lab id, which is the document id the reader and the ?spec=
    parameter both use, so the order is stable against anything but a new lab.
    """
    labs = {row["id"]: row for row in _rows(store, "aci_labs")}
    specs = {row["id"]: row for row in _rows(store, "aci_specs")}
    versions = _rows(store, "aci_spec_versions")
    if spec_version_ids is not None:
        wanted = set(spec_version_ids)
        versions = [v for v in versions if v["id"] in wanted]
    else:
        newest = {}
        for version in versions:
            if version["version"] > newest.get(version["spec_id"], {}).get("version", ""):
                newest[version["spec_id"]] = version
        versions = list(newest.values())

    out = []
    for version in versions:
        spec = specs[version["spec_id"]]
        lab = labs[spec["lab_id"]]
        document = {
            "id": lab["id"],
            "lab": lab["name"],
            "title": spec["title"],
            "shortTitle": spec["short_title"],
            "version": version["version"],
        }
        if version["source_url"]:
            document["sourceUrl"] = version["source_url"]
        document["markdown"] = version["markdown"]
        out.append(document)
    return sorted(out, key=lambda d: d["id"])


def behaviours(store):
    """The behaviour registry in the shape data/behaviours.json holds, keyed by
    slug. Three columns are renamed back: `set` and `group` are reserved words
    in SQL and could not carry their own names in the table."""
    out = {}
    for row in _rows(store, "aci_behaviours"):
        out[row["slug"]] = {
            "name": row["name"],
            "set": row["set_name"],
            "numeric_id": row["numeric_id"],
            "group": row["group_name"],
            "definition": row["definition"],
            "facets": row["facets"],
        }
        # Carried through rather than dropped: judging_registry() below reads it,
        # and the payload builders ignore what they do not use.
        if row.get("judging") is not None:
            out[row["slug"]]["judging"] = row["judging"]
    return out


def cell_curation(store):
    """The rows data/panel-cell-curation.json carries under `cells`."""
    return [{"slug": row["behaviour_slug"], "lab_id": row["lab_id"],
             "verdict": row["verdict"], "depth_0_4": row["depth_0_4"],
             "verified_date": row["verified_date"]}
            for row in _rows(store, "aci_cell_curation")]


def runlog_rows(store, run_id):
    """A run's judgements in the JSONL row shape the builders already consume.

    Only calls that finished contribute. A call in `error` kept its raw output
    and wrote no judgement, and one still `pending` has nothing to say; neither
    belongs in a log that stands for what the panel decided.
    """
    run = next(r for r in _rows(store, "aci_runs") if r["id"] == run_id)
    spec_of_version = {v["id"]: v["spec_id"]
                       for v in _rows(store, "aci_spec_versions")}
    calls = {c["id"]: c for c in _rows(store, "aci_judge_calls")
             if c["run_id"] == run_id and c["status"] == "done"}

    via = (run.get("config") or {}).get("via")
    rows = []
    for judgement in _rows(store, "aci_judgements"):
        call = calls.get(judgement["call_id"])
        if call is None:
            continue
        rows.append({
            "behaviour": call["behaviour_slug"],
            "spec": spec_of_version[call["spec_version_id"]],
            "model": call["model"],
            "locator": judgement["locator"],
            "verdict": judgement["verdict"],
            "relevant": judgement["relevant"],
            "parsed": judgement["parsed"],
            "rubric": run["rubric"],
            "via": via,
        })
    return rows


def current_publication(store):
    """The publication the reader serves: the newest PUBLIC one.

    A publication is insert-only, so it never changes after it is built -- but it
    is built before anyone has read it, and `is_public` is how an operator says
    they have. Newest alone would put a payload in front of the public in the
    same motion that produced it.
    """
    publications = [row for row in _rows(store, "aci_publications")
                    if row.get("is_public")]
    if not publications:
        return None
    return max(publications, key=lambda row: row["published_at"])


def published_runlog_rows(store, publication=None, cells=None):
    """The judgement rows behind a publication, in the JSONL shape.

    A publication selects a run per cell, so this is the union over the runs it
    names, restricted to the cells it actually published. A run may hold cells
    an older publication used and this one did not.

    `cells` answers for a publication that does not exist yet. A publication
    carries its payloads as columns and is insert-only, so the payloads have to
    be built BEFORE the row: there is no insert-then-fill. A publish job
    therefore chooses its cells, builds from them, and inserts the result in one
    go. Passing them here is how the builders see a selection no publication
    names yet.
    """
    if cells is None:
        publication = publication or current_publication(store)
        if publication is None:
            return []
        cells = [c for c in _rows(store, "aci_publication_cells")
                 if c["publication_id"] == publication["id"]]
    wanted = {(c["behaviour_slug"], c["spec_version_id"]) for c in cells}
    spec_of_version = {v["id"]: v["spec_id"]
                       for v in _rows(store, "aci_spec_versions")}

    rows = []
    for run_id in sorted({c["run_id"] for c in cells}):
        for row in runlog_rows(store, run_id):
            rows.append(row)
    # runlog_rows keys by spec name; the cell filter is by version id, so map back.
    spec_names = {spec_of_version[version_id]: version_id
                  for _, version_id in wanted}
    return [row for row in rows
            if (row["behaviour"], spec_names.get(row["spec"])) in wanted]


def published_spec_version_ids(store, publication=None, cells=None):
    if cells is not None:
        return sorted({c["spec_version_id"] for c in cells})
    publication = publication or current_publication(store)
    if publication is None:
        # Nothing published yet: the newest version of each spec, which is what
        # documents() does with None. The migration builds the very first
        # documents payload in exactly this state.
        return None
    return sorted({c["spec_version_id"] for c in _rows(store, "aci_publication_cells")
                   if c["publication_id"] == publication["id"]})


def coverage(store):
    """The frozen ledger in the shape data/coverage.json holds under `coverage`.

    The file keys a record by the index set's file-local numeric id; the table
    keys it by slug, which is the global key. This maps back, because
    coverage_payload() and the reader both still speak in numeric ids.
    """
    numeric_of_slug = {slug: entry["numeric_id"]
                       for slug, entry in behaviours(store).items()
                       if entry["set"] == "index"}
    names = {slug: entry["name"] for slug, entry in behaviours(store).items()}
    records = []
    for row in _rows(store, "aci_coverage"):
        records.append({
            "behaviour_id": numeric_of_slug[row["behaviour_slug"]],
            "behaviour_name": names[row["behaviour_slug"]],
            "lab_id": row["lab_id"],
            "verdict": row["verdict"],
            "depth_0_4": row["depth_0_4"],
            "depth_note": row["depth_note"],
            "verified_against_version": row["verified_against_version"],
            "verified_date": row["verified_date"],
            "citation_format": row["citation_format"],
            "citations": row["citations"],
        })
    return records


def index_behaviours(store):
    """The index-set behaviours that carry a coverage record, in numeric order,
    in the shape build-spec-reader-data.py's BEHAVIOURS constant holds. That
    constant is generated from the registry today; here it is read."""
    registry = behaviours(store)
    covered = {row["behaviour_slug"] for row in _rows(store, "aci_coverage")}
    rows = [(entry["numeric_id"], slug, entry) for slug, entry in registry.items()
            if entry["set"] == "index" and slug in covered]
    return [{"id": numeric_id, "slug": slug, "name": entry["name"],
             "definition": entry["definition"], "category": entry["group"]}
            for numeric_id, slug, entry in sorted(rows)]


def judging_registry(store):
    """{slug: entry} in the shape harness.load_registry() returns.

    The judging entry where a behaviour has one, the display entry where it does
    not. harness._panel_shape adapts the second, which is what lets a behaviour
    someone has just registered be judged before anyone has written its
    boundary -- against a blank scope, which is a weaker instruction and says so.
    """
    out = {}
    for slug, entry in behaviours(store).items():
        judging = entry.pop("judging", None)
        out[slug] = judging or entry
    return out
