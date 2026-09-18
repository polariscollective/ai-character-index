#!/usr/bin/env python3
"""Proof that the index the routes serve is the index that was verified.

    python3 engine/verify_supabase_provenance.py                        # what the reader serves
    python3 engine/verify_supabase_provenance.py --publication=<uuid>   # any one, a draft included

Everything here reads the database. It verifies one publication: the newest
public one, which is what the routes stream, unless --publication names another,
so that a draft can be checked before it is made public.

The claims.

    1. The publication row holds the bytes its digests describe.
    2. The publication rebuilds, from its own cells and with the builds
       publish.py makes, to the digests it stores.
    3. Every behaviour that carries a boundary reaches the panel carrying it.
       This one exists because a boundary once failed to migrate and nothing
       noticed: the prompt read "none provided" and the panel judged against a
       weaker instruction. Comparing records would not have caught it; composing
       the text a model would be sent does.
    4. Every locator the publication cites still resolves against the stored text
       of the version it names, and returns the stored quote byte for byte.

A panel passage carries citation_quote() applied to the normalised text
passages() yields, so the fourth claim is checked through the code that produced
it rather than through a second reading of the markdown.

Two things this used to check are gone with what they checked. The grandfathered
publication was held to engine/published-artefacts.sha256.json instead of being
rebuilt, and the frozen coverage ledger's citations were re-resolved here. The
cleanup migration of 16 September 2026 (polaris-supabase,
20260916090000_aci_cleanup_after_the_one_panel_redesign.sql) archives both out of
the tables this reads, and both remain in git history.
"""

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "spec-cite"))
import index_store     # noqa: E402
import publish         # noqa: E402
from store import Store, StoreError   # noqa: E402

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


failures = []


def report(ok, label, detail=""):
    print(f"{'OK  ' if ok else 'FAIL'}  {label}" + (f" -- {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def the_publication(store, publication_id=None):
    """The publication to verify: the one named, a draft included, or else the one
    the reader serves."""
    if publication_id is None:
        return index_store.current_publication(store)
    rows = store.select("aci_publications", {"id": f"eq.{publication_id}"})
    return rows[0] if rows else None


def cells_of(store, publication):
    """A publication's cells, in the shape and the order publish.py builds from."""
    rows = store.select("aci_publication_cells",
                        {"publication_id": f"eq.{publication['id']}"})
    return sorted(({"behaviour_slug": row["behaviour_slug"],
                    "spec_version_id": row["spec_version_id"],
                    "run_id": row["run_id"]} for row in rows),
                  key=lambda cell: (cell["behaviour_slug"], cell["spec_version_id"]))


def check_the_published_artefacts_still_carry_their_digests(publication):
    """The stored columns, held to their own digests.

    The digest describes THESE bytes, which is the claim that makes it worth
    anything. Each builder serialises its payload its own way, so each column is
    re-serialised the way the builder that wrote it does; a digest that matched
    while the column said something else would be a digest of a file nobody
    serves.

    This is also what `json` rather than `jsonb` is for. jsonb reorders keys on
    the way in, which breaks this equality permanently and silently -- it did,
    once, and the tables were recreated.
    """
    for name, column in (("payload", "payload_sha256"),
                         ("documents", "documents_sha256"),
                         ("links", "links_sha256")):
        if publication.get(name) is None:
            continue
        got = hashlib.sha256(
            json.dumps(publication[name], **publish.FORMATS[name]).encode()).hexdigest()
        report(got == publication[column],
               f"the stored {name} is the bytes its digest describes",
               "re-serialises to its digest" if got == publication[column]
               else f"{got[:16]} against the stored {publication[column][:16]}")


def check_the_publication_rebuilds_to_its_digests(store, publication):
    """Rebuild a publication from its own cells and hold it to what it stores.

    The build is publish.py's own, so what is checked is what a publication job
    writes rather than a second copy of it. The run date is the one the stored
    payload carries: a build that did not pin one took the day it ran, and a
    rebuild on any other day must not.
    """
    params = publication.get("build_params") or {}
    cells = cells_of(store, publication)
    run_date = (params.get("run_date")
                or (publication["payload"].get("provenance") or {}).get("runDate"))
    panel_name = params.get("panel")
    for name in ("payload", "documents", "links"):
        if publication.get(name) is None:
            continue
        label = f"the {name} rebuilds from the publication's cells to its stored digest"
        try:
            _built, got = publish.build(name, cells, params.get("behaviours") or [],
                                        run_date, panel_name,
                                        link_runs=params.get("link_runs") or ())
        except SystemExit as refused:
            report(False, label, (str(refused).strip().splitlines() or ["no output"])[-1])
            continue
        want = publication[f"{name}_sha256"]
        report(got == want, label,
               "unchanged" if got == want else f"{got[:16]} against {want[:16]}")


def check_panel_passages_still_resolve(store, publication):
    """A panel passage is the normalised text passages() yields for its locator, in
    the version the locator names. Re-deriving them from the stored markdown must
    reproduce every quote.

    The version is the point. Without one, passages() reads a document's newest
    version, and a publication carrying two versions of one document would read
    every passage of the older as unresolved.
    """
    index_store.install_registry(store)
    h = load_module("h", HERE / "panel" / "harness.py")
    builder = load_module("build_site_data", HERE / "panel" / "build_site_data.py")
    stored = {(row["spec_id"], row["version"])
              for row in store.select("aci_spec_versions", {"select": "spec_id,version"})}
    text, checked, missing, mismatched = {}, 0, 0, 0
    for behaviour in publication["payload"]["behaviours"]:
        for coverage in behaviour["coverage"].values():
            for passage in coverage["passages"]:
                checked += 1
                document = passage["locator"].split(" > ", 1)[0]
                spec, _, version = document.rpartition("@")
                if (spec, version) not in stored:
                    missing += 1
                    continue
                if document not in text:
                    text[document] = {locator: raw for locator, _section, raw
                                      in h.passages(spec, version)}
                raw = text[document].get(passage["locator"])
                if raw is None:
                    missing += 1
                    continue
                quote, _is_example = builder.citation_quote(raw)
                if quote != passage["quote"]:
                    mismatched += 1
    report(missing == 0 and mismatched == 0,
           "every published passage re-derives from the stored spec text",
           f"{checked} passages, {missing} unresolved, {mismatched} mismatched")


def check_behaviours_carry_the_judging_entry(store):
    """The judging registry is the half that reached the database late."""
    rows = store.select("aci_behaviours")
    defined = [r for r in rows if (r["judging"] or {}).get("query")]
    with_boundary = [r for r in defined if r["judging"].get("boundary")]
    report(len(with_boundary) == len(defined) and defined,
           "every defined behaviour carries a boundary",
           f"{len(defined)} defined of {len(rows)}, all with a boundary"
           if len(with_boundary) == len(defined)
           else f"{len(defined) - len(with_boundary)} without")


def check_every_defined_behaviour_reaches_the_panel_with_its_scope(store):
    """A behaviour that carries a boundary must compose a prompt that shows it.

    This check exists because the boundary once failed to migrate, and nothing
    noticed: the prompt simply read "Scope (optional): none provided" and the
    panel judged against a weaker instruction. Comparing records would not have
    caught it. Composing the text a model would be sent does.
    """
    h = load_module("h", HERE / "panel" / "harness.py")
    registry = index_store.judging_registry(store)
    blank, checked = [], 0
    for slug, entry in sorted(registry.items()):
        if not entry.get("boundary"):
            continue
        checked += 1
        composed = h.compose_query(slug, "v3", registry)
        # The Scope line specifically. Looking for the blank marker anywhere in
        # the prompt catches the clarifications field, which is legitimately
        # blank for every shipped behaviour, and calls a correct prompt broken.
        scope = next((line for line in composed.splitlines()
                      if line.lower().startswith("scope")), "")
        if h.FIELD_NONE in scope:
            blank.append(slug)
    report(checked > 0 and not blank,
           "every behaviour with a boundary reaches the panel carrying it",
           f"{checked} behaviours" if not blank else f"blank scope for {blank}")


def check_the_run_snapshot_says_what_it_judged_against(store, publication):
    """Each run a publication names froze what it was told, and must still agree
    with the registry it was told it from.

    The runs read are the publication's own. A select has no order, and this
    used to read whichever run the table returned first: the day a second run, of
    one other behaviour, was composed, a correct publication failed.
    """
    label = "the run snapshot names the definitions the run was given"
    rows = {r["slug"]: r for r in store.select("aci_behaviours")}
    cells = cells_of(store, publication)
    runs = {run["id"]: run for run in store.select("aci_runs")
            if run["id"] in {cell["run_id"] for cell in cells}}
    absent = sorted({cell["run_id"] for cell in cells} - set(runs))
    if not runs or absent:
        report(False, label, f"runs the publication names are not held: {absent}"
               if absent else "the publication names no run")
        return
    wrong = sorted(f"{slug} in run {run_id[:8]}"
                   for run_id, run in runs.items()
                   for slug, entry in (run["behaviours"] or {}).items()
                   if entry.get("judging") != rows.get(slug, {}).get("judging"))
    # The one behaviour the current rubric judges on a different definition than
    # the one it displays; a run that shows it and lost that, lost the point.
    lost = sorted({cell["run_id"][:8] for cell in cells
                   if cell["behaviour_slug"] == "animal-welfare-impacts"
                   and "query_v2" not in (((runs[cell["run_id"]]["behaviours"] or {})
                                           .get("animal-welfare-impacts") or {})
                                          .get("judging") or {})})
    snapshotted = {slug for run in runs.values() for slug in (run["behaviours"] or {})}
    report(not wrong and not lost, label,
           f"{len(runs)} run(s), {len(snapshotted)} behaviours" if not wrong and not lost
           else f"differs: {wrong}" if wrong else f"animal-welfare-impacts lost query_v2 in {lost}")


NIL_UUID = "00000000-0000-0000-0000-000000000000"


def check_spec_versions_are_insert_only(store):
    """The probe targets an id that cannot exist, not a real row: Postgres checks
    the UPDATE privilege before it matches any row, so a revoked grant still
    returns the permission error and the probe passes without tampering with
    anything. A loosened grant matches nothing and writes nothing either -- there
    is no row to match -- so that outcome is read from the absence of a refusal,
    not from a changed row."""
    try:
        store.update("aci_spec_versions", {"id": NIL_UUID}, {"markdown": "tampered"})
    except StoreError as refused:
        report("42501" in str(refused) or "permission denied" in str(refused),
               "spec versions are insert-only", "the update was refused by grants")
        return
    report(False, "spec versions are insert-only", "the update was not refused")


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--publication", default=None,
                        help="the id of the publication to verify, a draft included; "
                             "the one the reader serves by default")
    args = parser.parse_args(argv)
    if args.publication is not None and not UUID.match(args.publication):
        parser.error(f"--publication must be a uuid, got {args.publication!r}")
    return args


def main(argv=None):
    args = arguments(argv)
    store = Store.from_env()
    publication = the_publication(store, args.publication)
    if publication is None:
        report(False, "there is a publication to verify",
               f"no publication {args.publication}" if args.publication
               else "nothing is published")
        return 1
    print(f"Publication {publication['id']}, published {publication['published_at']}, "
          f"{'public' if publication.get('is_public') else 'a draft'}.\n")

    check_the_published_artefacts_still_carry_their_digests(publication)
    check_the_publication_rebuilds_to_its_digests(store, publication)
    check_behaviours_carry_the_judging_entry(store)
    check_every_defined_behaviour_reaches_the_panel_with_its_scope(store)
    check_the_run_snapshot_says_what_it_judged_against(store, publication)
    check_panel_passages_still_resolve(store, publication)
    check_spec_versions_are_insert_only(store)
    if failures:
        print(f"\n{len(failures)} failure(s): {', '.join(failures)}")
        return 1
    print("\nThe publication in Supabase is the publication that was verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
