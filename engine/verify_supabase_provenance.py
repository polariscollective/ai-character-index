#!/usr/bin/env python3
"""Proof that the index the routes serve is the index that was verified.

    python3 engine/verify_supabase_provenance.py

Everything here reads the database. The committed payloads this used to compare
against are gone: they were the oracle, and their digests took over that job,
recorded in engine/published-artefacts.sha256.json at the commit named there.

Four claims.

    1. Both payloads, rebuilt from the database, still carry those digests. If
       anything was lost or altered, the bytes say so without anyone having to
       decide what "the same" means.
    2. The publication row still holds them, which is what the routes stream.
    3. Every behaviour that carries a boundary reaches the panel carrying it.
       This one exists because a boundary once failed to migrate and nothing
       noticed: the prompt read "none provided" and the panel judged against a
       weaker instruction. Comparing records would not have caught it; composing
       the text a model would be sent does.
    4. Every locator the index cites still resolves against the spec text stored
       beside it, and returns the stored quote byte for byte.

Two conventions meet in the fourth, and conflating them makes a check that fails
on correct data. A panel passage carries citation_quote() applied to the
normalised text passages() yields; a ledger citation carries the raw span, and a
locator with no span means the whole section rather than nothing. Each is checked
through the code that produced it.
"""

import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "spec-cite"))
import cite            # noqa: E402
import index_store     # noqa: E402
from store import Store, StoreError   # noqa: E402

RECORD = HERE / "published-artefacts.sha256.json"


def recorded():
    """The digests of what the index published when the migration was verified.

    These stand in for the committed payloads once those are deleted: the
    question stops being "do the rebuilt bytes equal this file" and becomes "does
    the database still produce the artifact that carried this digest", which
    needs a few lines rather than twenty megabytes to ask.
    """
    return json.loads(RECORD.read_text())["published"]


def digest(payload):
    """The digest of a payload as its builder serialises it."""
    if isinstance(payload, (bytes, bytearray)):
        return hashlib.sha256(payload).hexdigest()
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False,
                                     separators=(",", ":")).encode()).hexdigest()

failures = []


def report(ok, label, detail=""):
    print(f"{'OK  ' if ok else 'FAIL'}  {label}" + (f" -- {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def build(script, args, out):
    result = subprocess.run([sys.executable, str(script), *args, f"--out={out}"],
                            capture_output=True, text=True)
    if result.returncode != 0:
        report(False, f"{Path(script).name} rebuild",
               (result.stderr or result.stdout).strip().splitlines()[-1:] or ["no output"])
        return False
    return True


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_the_rebuilt_payloads_carry_their_digests(scratch):
    """Rebuild both payloads from the database and hold them to the record.

    This is the check the committed files used to answer. They are gone; the
    digest asks the same question of a few lines: does the database still
    produce the artifact that was verified?
    """
    want = recorded()

    payload = scratch / "payload.json"
    if build(HERE / "panel" / "build_site_data.py",
             ["--threshold=4", "--solid-threshold=6", "--run-date=2026-08-17"], payload):
        got = digest(payload.read_bytes())
        report(got == want["payload"]["sha256"],
               "the behaviour payload rebuilds to its recorded digest",
               "unchanged" if got == want["payload"]["sha256"]
               else f"{got[:16]} against {want['payload']['sha256'][:16]}")
        # The builder's adjacent flag and the reader's computed band must agree.
        # That invariant used to be checked against a committed payload; it is
        # checked here against the one the database produces.
        labels = subprocess.run(
            ["node", str(HERE / "panel" / "test_reader_v5_labels.js"), str(payload)],
            capture_output=True, text=True)
        report(labels.returncode == 0,
               "every passage's adjacent flag agrees with the band the reader computes",
               (labels.stdout or labels.stderr).strip().splitlines()[-1:][0]
               if (labels.stdout or labels.stderr).strip() else "")

    documents = scratch / "documents.json"
    if build(ROOT / "engine" / "build-spec-reader-data.py", [], documents):
        got = digest(documents.read_bytes())
        report(got == want["documents"]["sha256"],
               "the documents payload rebuilds to its recorded digest",
               "unchanged" if got == want["documents"]["sha256"]
               else f"{got[:16]} against {want['documents']['sha256'][:16]}")


def check_panel_passages_still_resolve(store):
    """A panel passage is the normalised text passages() yields for its locator.
    Re-deriving them from the stored markdown must reproduce every quote."""
    index_store.install_registry(store)
    h = load_module("h", HERE / "panel" / "harness.py")
    builder = load_module("build_site_data", HERE / "panel" / "build_site_data.py")
    # What the routes serve, from the publication row. The committed copy this
    # used to read is gone.
    publication = index_store.current_publication(store)
    if publication is None:
        report(False, "every published passage re-derives from the stored spec text",
               "nothing is published")
        return
    payload = publication["payload"]
    text, checked, missing, mismatched = {}, 0, 0, 0
    for spec_name in sorted({row["id"] for row in store.select("aci_specs")}):
        for locator, _section, passage in h.passages(spec_name):
            text[locator] = passage
    for behaviour in payload["behaviours"]:
        for coverage in behaviour["coverage"].values():
            for passage in coverage["passages"]:
                checked += 1
                raw = text.get(passage["locator"])
                if raw is None:
                    missing += 1
                    continue
                quote, _is_example = builder.citation_quote(raw)
                if quote != passage["quote"]:
                    mismatched += 1
    report(missing == 0 and mismatched == 0,
           "every published passage re-derives from the stored spec text",
           f"{checked} passages, {missing} unresolved, {mismatched} mismatched")


def check_ledger_citations_still_resolve(store):
    """A ledger citation is a raw span. get_span_text must return it exactly."""
    index_store.install_registry(store)
    specs = {}
    checked = mismatched = 0
    for record in index_store.coverage(store):
        for citation in record["citations"]:
            spec, version, ref, span = cite.parse_locator(citation["locator"])
            key = (spec, version)
            if key not in specs:
                specs[key] = cite.load_spec(spec, version)
            _, sections, lines = specs[key]
            section = cite.find_section(sections, ref)
            if span is None:
                # A locator with no span names the whole section, not nothing.
                blocks = cite.section_blocks(section, lines)
                span = (1, None, len(blocks), None)
            resolved = cite.get_span_text(section, lines, span)
            expected = (resolved.splitlines()[0]
                        if citation.get("example_block") else resolved)
            checked += 1
            if resolved != citation["quote"] and expected != citation["quote"]:
                mismatched += 1
    report(mismatched == 0, "every ledger citation re-resolves against the stored text",
           f"{checked} citations, {mismatched} mismatched")


def check_the_published_artefacts_still_carry_their_digests(store):
    """The oracle, once the committed payloads are gone. It asks the database
    what it publishes and holds it to what was verified."""
    publication = index_store.current_publication(store)
    if publication is None:
        report(False, "the published artefacts carry their recorded digests",
               "nothing is published")
        return
    want = recorded()
    for name, column in (("payload", "payload_sha256"),
                         ("documents", "documents_sha256")):
        got = publication[column]
        report(got == want[name]["sha256"],
               f"the published {name} carries its recorded digest",
               "unchanged" if got == want[name]["sha256"]
               else f"{got[:16]} against {want[name]['sha256'][:16]}")


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


def check_the_run_snapshot_says_what_it_judged_against(store):
    """A run froze what it was told, and must still agree with the registry it
    was told it from."""
    rows = {r["slug"]: r for r in store.select("aci_behaviours")}
    runs = store.select("aci_runs")
    if not runs:
        report(False, "the run snapshot names the judging definitions", "no runs")
        return
    snapshot = runs[0]["behaviours"]
    wrong = [slug for slug, entry in snapshot.items()
             if entry.get("judging") != rows.get(slug, {}).get("judging")]
    # The one behaviour the current rubric judges on a different definition than
    # the one it displays; if the snapshot lost that, it lost the point.
    v2 = (snapshot.get("animal-welfare-impacts") or {}).get("judging") or {}
    report(not wrong and "query_v2" in v2,
           "the run snapshot names the definitions the run was given",
           f"{len(snapshot)} behaviours" if not wrong else f"differs: {wrong}")


def check_spec_versions_are_insert_only(store):
    versions = store.select("aci_spec_versions", {"select": "id", "limit": "1"})
    if not versions:
        report(False, "spec versions are insert-only", "no rows to test against")
        return
    try:
        store.update("aci_spec_versions", {"id": versions[0]["id"]},
                     {"markdown": "tampered"})
    except StoreError as refused:
        report("42501" in str(refused) or "permission denied" in str(refused),
               "spec versions are insert-only", "the update was refused by grants")
        return
    report(False, "spec versions are insert-only",
           "an update succeeded -- the citation guarantee is not enforced")


def main():
    store = Store.from_env()
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        check_the_rebuilt_payloads_carry_their_digests(scratch)
    check_the_published_artefacts_still_carry_their_digests(store)
    check_behaviours_carry_the_judging_entry(store)
    check_every_defined_behaviour_reaches_the_panel_with_its_scope(store)
    check_the_run_snapshot_says_what_it_judged_against(store)
    check_panel_passages_still_resolve(store)
    check_ledger_citations_still_resolve(store)
    check_spec_versions_are_insert_only(store)
    if failures:
        print(f"\n{len(failures)} failure(s): {', '.join(failures)}")
        return 1
    print("\nThe index in Supabase is the index that was in git.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
