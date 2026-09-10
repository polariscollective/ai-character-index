#!/usr/bin/env python3
"""Proof that the index in Supabase is the index that was in git.

    python3 engine/verify_supabase_provenance.py

Three claims, and the first is the one that matters. If the migration lost or
altered anything, the payload the reader serves comes out different, and the
bytes say so without anyone having to decide what "the same" means.

    1. The behaviour payload rebuilt from the database is byte-identical to the
       committed site/spec-reader/data/behaviours-v5-reader.json.
    2. The documents payload rebuilt from the database is byte-identical to the
       committed site/spec-reader/data/documents.json apart from generatedFrom,
       which names the database and therefore must differ.
    3. Every locator the published payload cites, and every citation in the
       frozen ledger, still resolves against the spec text stored beside it and
       returns the stored quote byte for byte.

Two conventions meet here, and conflating them makes a check that fails on
correct data. A panel passage carries citation_quote() applied to the normalised
text passages() yields; a ledger citation carries the raw span, and a locator
with no span means the whole section rather than nothing. Each is checked
through the code that produced it, which is the only way the check means
anything.

And one guard, because the third claim rests on it: the spec-version rows are
insert-only, so nothing can move text a stored locator points at.
"""

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

PAYLOAD = ROOT / "site" / "spec-reader" / "data" / "behaviours-v5-reader.json"
DOCUMENTS = ROOT / "site" / "spec-reader" / "data" / "documents.json"

failures = []


def report(ok, label, detail=""):
    print(f"{'OK  ' if ok else 'FAIL'}  {label}" + (f" -- {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def build(script, args, out):
    result = subprocess.run([sys.executable, str(script), *args, f"--out={out}"],
                            capture_output=True, text=True)
    if result.returncode != 0:
        report(False, f"{Path(script).name} --from-supabase",
               (result.stderr or result.stdout).strip().splitlines()[-1:] or ["no output"])
        return False
    return True


def check_behaviour_payload(scratch):
    # --out= writes into the site data directory by name, not to an arbitrary
    # path: that guard is deliberate and this verifier does not go around it.
    name = "verify-supabase.json"
    written = ROOT / "site" / "spec-reader" / "data" / name
    ok = build(HERE / "panel" / "build_site_data.py",
               ["--from-supabase", "--threshold=4", "--solid-threshold=6",
                "--run-date=2026-08-17"], name)
    if not ok:
        return
    try:
        same = written.read_bytes() == PAYLOAD.read_bytes()
        report(same, "behaviours-v5-reader.json rebuilt from Supabase",
               "byte-identical" if same else
               f"{written.stat().st_size} bytes against {PAYLOAD.stat().st_size}")
    finally:
        written.unlink(missing_ok=True)
        (ROOT / "site" / "spec-reader" / "data" / "manifest.json").unlink(missing_ok=True)


def check_documents_payload(scratch):
    out = scratch / "documents.json"
    if not build(ROOT / "engine" / "build-spec-reader-data.py", ["--from-supabase"], out):
        return
    rebuilt = json.loads(out.read_text())
    committed = json.loads(DOCUMENTS.read_text())

    generated = rebuilt.pop("generatedFrom")
    committed.pop("generatedFrom")
    dump = lambda payload: json.dumps(payload, ensure_ascii=False,
                                      separators=(",", ":")).encode("utf-8")
    same = dump(rebuilt) == dump(committed)
    report(same, "documents.json rebuilt from Supabase",
           "byte-identical apart from generatedFrom" if same else "differs")
    report(all(source.startswith("supabase:") for source in generated),
           "the rebuilt payload names the database as its source", ", ".join(generated))


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_panel_passages_still_resolve(store):
    """A panel passage is the normalised text passages() yields for its locator.
    Re-deriving them from the stored markdown must reproduce every quote."""
    index_store.install_registry(store)
    h = load_module("h", HERE / "panel" / "harness.py")
    builder = load_module("build_site_data", HERE / "panel" / "build_site_data.py")
    payload = json.loads(PAYLOAD.read_text())
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


def check_publication_carries_both_payloads(store):
    """The routes stream these two columns and rebuild nothing, so what is
    stored must be what the builders produce. Checked against the committed
    files, which is the same oracle the two rebuild checks above use."""
    publication = index_store.current_publication(store)
    if publication is None:
        report(False, "the publication carries both payloads", "no publication")
        return

    same_payload = publication["payload"] == json.loads(PAYLOAD.read_text())
    report(same_payload, "the stored behaviour payload is the committed one",
           "equal" if same_payload else "differs")

    stored = dict(publication["documents"])
    committed = json.loads(DOCUMENTS.read_text())
    generated = stored.pop("generatedFrom")
    committed.pop("generatedFrom")
    dump = lambda payload: json.dumps(payload, ensure_ascii=False,
                                      separators=(",", ":")).encode("utf-8")
    same_documents = dump(stored) == dump(committed)
    report(same_documents, "the stored documents payload is the committed one",
           "equal apart from generatedFrom, which names "
           + ", ".join(generated) if same_documents else "differs")


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
        check_behaviour_payload(scratch)
        check_documents_payload(scratch)
    check_publication_carries_both_payloads(store)
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
