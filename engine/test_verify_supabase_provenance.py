#!/usr/bin/env python3
"""The provenance verifier's decisions, against a fake store.

The verifier itself runs daily against the live database, with credentials, and
nowhere else. These pin what it decides before it asks the database anything:
which publication it verifies, what it holds it to, and which version of a
document a passage is resolved against. Nothing here touches a network or runs a
builder.

Run: python3 engine/test_verify_supabase_provenance.py
"""
import hashlib
import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "spec-cite"))

import verify_supabase_provenance as verify   # noqa: E402


class FakeStore:
    """PostgREST's `eq.` filter, which is all the verifier asks of a select."""

    def __init__(self, update_error=None, **tables):
        self.tables = tables
        self.update_error = update_error
        self.updates = []
        self.asked = []

    def select(self, table, params=None):
        self.asked.append(table)
        rows = self.tables.get(table, [])
        for column, condition in (params or {}).items():
            if isinstance(condition, str) and condition.startswith("eq."):
                rows = [row for row in rows if str(row.get(column)) == condition[3:]]
        return rows

    def update(self, table, match, patch):
        self.updates.append((table, match, patch))
        if self.update_error is not None:
            raise self.update_error


OLDER_PUBLIC_ID = "3a7c1e52-9d4b-4f60-8b21-6e0d5c4b3a29"
DRAFT_ID = "6b1f9f0e-6a55-4c1e-9d0b-7f1f0c2f5a11"
PUBLIC_ID = "0e9d7c3a-2b1f-4d8e-8a6c-5f4e3d2c1b0a"

PAYLOAD = {"provenance": {"runDate": "2026-09-20"}, "behaviours": []}
DOCUMENTS = {"documents": []}


def serialised(payload, documents):
    return (hashlib.sha256(json.dumps(payload, **verify.publish.FORMATS["payload"]).encode()).hexdigest(),
            hashlib.sha256(json.dumps(documents, **verify.publish.FORMATS["documents"]).encode()).hexdigest())


def publication(id, *, published_at, is_public, build_params=None):
    payload_sha256, documents_sha256 = serialised(PAYLOAD, DOCUMENTS)
    return {"id": id, "published_at": published_at, "is_public": is_public,
            "build_params": build_params or {"behaviours": ["helpfulness"],
                                             "documents": ["v1"], "panel": "frontier_fast",
                                             "rubric": "v5", "run_date": None},
            "payload": PAYLOAD, "payload_sha256": payload_sha256,
            "documents": DOCUMENTS, "documents_sha256": documents_sha256}


def run(check, *args):
    """What a check printed, and whether it failed."""
    verify.failures.clear()
    out = io.StringIO()
    with redirect_stdout(out):
        check(*args)
    return out.getvalue(), list(verify.failures)


class ChoosingThePublicationTest(unittest.TestCase):
    def setUp(self):
        self.store = FakeStore(aci_publications=[
            publication(OLDER_PUBLIC_ID, published_at="2026-09-10", is_public=True),
            publication(PUBLIC_ID, published_at="2026-09-12", is_public=True),
            publication(DRAFT_ID, published_at="2026-09-14", is_public=False),
        ])

    def test_without_a_pin_the_newest_public_publication_is_verified(self):
        self.assertEqual(verify.the_publication(self.store)["id"], PUBLIC_ID)

    def test_a_pin_reaches_a_draft_so_it_can_be_checked_before_it_is_public(self):
        self.assertEqual(verify.the_publication(self.store, DRAFT_ID)["id"], DRAFT_ID)

    def test_a_pin_that_names_nothing_answers_nothing(self):
        self.assertIsNone(verify.the_publication(self.store, "00000000-0000-0000-0000-000000000000"))

    def test_a_pin_must_be_a_uuid(self):
        with redirect_stdout(io.StringIO()), mock.patch("sys.stderr", io.StringIO()):
            with self.assertRaises(SystemExit):
                verify.arguments(["--publication=behaviours-v5-reader"])
        self.assertEqual(verify.arguments([f"--publication={DRAFT_ID}"]).publication, DRAFT_ID)
        self.assertIsNone(verify.arguments([]).publication)


class RebuildTest(unittest.TestCase):
    CELLS = [{"publication_id": PUBLIC_ID, "behaviour_slug": "helpfulness",
              "spec_version_id": "v1", "run_id": "r1"},
             {"publication_id": "someone-else", "behaviour_slug": "helpfulness",
              "spec_version_id": "v2", "run_id": "r0"}]

    def store(self, row):
        return FakeStore(aci_publications=[row], aci_publication_cells=self.CELLS)

    def test_a_publication_is_rebuilt_from_its_own_cells_with_the_publish_builders(self):
        row = publication(PUBLIC_ID, published_at="2026-09-12", is_public=True)
        seen = []

        def build(name, cells, behaviours, run_date=None, panel_name=None):
            seen.append((name, cells, behaviours, run_date, panel_name))
            return ({"payload": PAYLOAD, "documents": DOCUMENTS}[name],
                    row[f"{name}_sha256"])

        with mock.patch.object(verify.publish, "build", side_effect=build):
            printed, failed = run(verify.check_the_publication_rebuilds_to_its_digests,
                                  self.store(row), row)
        self.assertEqual(failed, [], printed)
        cells = [{"behaviour_slug": "helpfulness", "spec_version_id": "v1", "run_id": "r1"}]
        # The run date is the one the stored payload carries: a build that left it
        # unpinned took the day it ran, and a rebuild on any other day must not.
        self.assertEqual(seen, [
            ("payload", cells, ["helpfulness"], "2026-09-20", "frontier_fast"),
            ("documents", cells, ["helpfulness"], "2026-09-20", "frontier_fast"),
        ])

    def test_a_rebuild_that_differs_from_the_stored_digest_fails(self):
        row = publication(PUBLIC_ID, published_at="2026-09-12", is_public=True)
        with mock.patch.object(verify.publish, "build",
                               side_effect=lambda name, *a, **k: ({}, "0" * 64)):
            printed, failed = run(verify.check_the_publication_rebuilds_to_its_digests,
                                  self.store(row), row)
        self.assertEqual(len(failed), 2, printed)

    def test_a_builder_that_refuses_is_a_failure_and_not_a_crash(self):
        row = publication(PUBLIC_ID, published_at="2026-09-12", is_public=True)
        with mock.patch.object(verify.publish, "build",
                               side_effect=SystemExit("build_site_data.py failed:\nno cells")):
            printed, failed = run(verify.check_the_publication_rebuilds_to_its_digests,
                                  self.store(row), row)
        self.assertEqual(len(failed), 2, printed)
        self.assertIn("no cells", printed)


class StoredDigestTest(unittest.TestCase):
    def test_a_publication_that_is_its_digests_passes_on_its_own_bytes_alone(self):
        row = publication(PUBLIC_ID, published_at="2026-09-12", is_public=True)
        printed, failed = run(verify.check_the_published_artefacts_still_carry_their_digests, row)
        self.assertEqual(failed, [], printed)
        self.assertNotIn("record", printed)

    def test_every_publication_is_the_bytes_its_digest_describes(self):
        row = dict(publication(PUBLIC_ID, published_at="2026-09-12", is_public=True),
                   payload={"provenance": {}, "behaviours": ["altered"]})
        printed, failed = run(verify.check_the_published_artefacts_still_carry_their_digests, row)
        self.assertEqual(failed, ["the stored payload is the bytes its digest describes"], printed)


class Row(dict):
    """A publication row that fails the test if anything reads the column the
    cleanup migration dropped."""

    def __getitem__(self, key):
        if key == "grandfathered":
            raise AssertionError("the verifier read aci_publications.grandfathered")
        return super().__getitem__(key)

    def get(self, key, default=None):
        if key == "grandfathered":
            raise AssertionError("the verifier read aci_publications.grandfathered")
        return super().get(key, default)


class RetiredDataTest(unittest.TestCase):
    """polaris-supabase 20260916090000_aci_cleanup_after_the_one_panel_redesign.sql
    drops aci_cell_curation, aci_coverage and aci_publications.grandfathered. A
    verifier that still asked for any of them would fail on every run once that
    migration is applied, whatever the publication."""

    def test_a_whole_run_asks_for_no_retired_table_and_reads_no_retired_column(self):
        row = Row(publication(PUBLIC_ID, published_at="2026-09-12", is_public=True))
        store = FakeStore(aci_publications=[row])
        with mock.patch.object(verify.Store, "from_env", return_value=store), \
             mock.patch.object(verify.publish, "build",
                               side_effect=lambda name, *a, **k: ({}, row[f"{name}_sha256"])), \
             mock.patch.object(verify.index_store, "install_registry"), \
             mock.patch.object(verify, "load_module",
                               lambda name, path: FakeHarness if name == "h" else FakeBuilder), \
             redirect_stdout(io.StringIO()):
            verify.failures.clear()
            verify.main([f"--publication={PUBLIC_ID}"])
        verify.failures.clear()
        self.assertIn("aci_publications", store.asked)
        self.assertEqual(sorted({"aci_cell_curation", "aci_coverage"} & set(store.asked)), [])


OLD = "anthropic--constitution@2026-01-20"
NEW = "anthropic--constitution@2026-08-01"


class FakeHarness:
    """Two versions of one document. Without a version, the newest is read."""
    TEXT = {("anthropic--constitution", "2026-01-20"): [(f"{OLD} > A > ¶1", "A", "Old words.")],
            ("anthropic--constitution", "2026-08-01"): [(f"{NEW} > A > ¶1", "A", "New words.")]}
    FIELD_NONE = "none provided"

    @staticmethod
    def passages(spec, version=None):
        return FakeHarness.TEXT[(spec, version or "2026-08-01")]


class FakeBuilder:
    @staticmethod
    def citation_quote(raw):
        return raw, False


class PassagesTest(unittest.TestCase):
    def check(self, coverage):
        row = dict(publication(PUBLIC_ID, published_at="2026-09-12", is_public=True),
                   payload={"behaviours": [{"slug": "b", "coverage": coverage}]})
        store = FakeStore(
            aci_specs=[{"id": "anthropic--constitution"}], aci_publications=[row],
            aci_spec_versions=[
                {"id": "v1", "spec_id": "anthropic--constitution", "version": "2026-01-20"},
                {"id": "v2", "spec_id": "anthropic--constitution", "version": "2026-08-01"}])
        with mock.patch.object(verify, "load_module",
                               lambda name, path: FakeHarness if name == "h" else FakeBuilder), \
             mock.patch.object(verify.index_store, "install_registry"):
            return run(verify.check_panel_passages_still_resolve, store, row)

    def test_two_versions_of_one_document_each_resolve_against_their_own_text(self):
        printed, failed = self.check({
            OLD: {"passages": [{"locator": f"{OLD} > A > ¶1", "quote": "Old words."}]},
            NEW: {"passages": [{"locator": f"{NEW} > A > ¶1", "quote": "New words."}]}})
        self.assertEqual(failed, [], printed)
        self.assertIn("2 passages, 0 unresolved, 0 mismatched", printed)

    def test_a_quote_read_against_the_wrong_version_is_a_mismatch(self):
        printed, failed = self.check({
            OLD: {"passages": [{"locator": f"{OLD} > A > ¶1", "quote": "New words."}]}})
        self.assertIn("1 passages, 0 unresolved, 1 mismatched", printed)
        self.assertEqual(len(failed), 1)

    def test_a_version_the_index_does_not_carry_is_unresolved(self):
        gone = "anthropic--constitution@2025-01-01"
        printed, failed = self.check({
            gone: {"passages": [{"locator": f"{gone} > A > ¶1", "quote": "Old words."}]}})
        self.assertIn("1 passages, 1 unresolved, 0 mismatched", printed)
        self.assertEqual(len(failed), 1)


class RunSnapshotTest(unittest.TestCase):
    REGISTRY = [{"slug": "animal-welfare-impacts", "judging": {"query_v2": "q"}},
                {"slug": "undefined-behaviour", "judging": None}]

    def check(self, runs, cells):
        row = publication(PUBLIC_ID, published_at="2026-09-12", is_public=True)
        store = FakeStore(aci_behaviours=self.REGISTRY, aci_runs=runs,
                          aci_publication_cells=[dict(c, publication_id=PUBLIC_ID) for c in cells])
        return run(verify.check_the_run_snapshot_says_what_it_judged_against, store, row)

    def test_the_runs_read_are_the_runs_the_publication_names(self):
        """A select has no order. With two runs in the table, the first row was
        whichever the database returned, and a run of one other behaviour made a
        correct publication fail."""
        runs = [{"id": "other", "behaviours": {"undefined-behaviour": {"judging": None}}},
                {"id": "published", "behaviours": {"animal-welfare-impacts": {"judging": {"query_v2": "q"}}}}]
        printed, failed = self.check(
            runs, [{"run_id": "published", "behaviour_slug": "animal-welfare-impacts",
                    "spec_version_id": "v1"}])
        self.assertEqual(failed, [], printed)

    def test_a_snapshot_that_disagrees_with_the_registry_fails(self):
        runs = [{"id": "published", "behaviours": {"animal-welfare-impacts": {"judging": {"query": "q"}}}}]
        printed, failed = self.check(
            runs, [{"run_id": "published", "behaviour_slug": "animal-welfare-impacts",
                    "spec_version_id": "v1"}])
        self.assertEqual(len(failed), 1, printed)


class SpecVersionsInsertOnlyTest(unittest.TestCase):
    """The probe targets an id that cannot exist, so a revoked grant is still
    refused (Postgres checks the UPDATE privilege before it matches rows) and a
    loosened grant matches nothing rather than tampering with a real row."""

    def test_a_refused_update_against_an_id_that_cannot_exist_passes(self):
        store = FakeStore(update_error=verify.StoreError(
            "PATCH aci_spec_versions -> 403: permission denied for table "
            "aci_spec_versions (42501)"))
        printed, failed = run(verify.check_spec_versions_are_insert_only, store)
        self.assertEqual(failed, [], printed)
        self.assertEqual(store.updates,
                         [("aci_spec_versions", {"id": verify.NIL_UUID}, {"markdown": "tampered"})])

    def test_an_update_that_is_not_refused_is_a_failure(self):
        store = FakeStore()
        printed, failed = run(verify.check_spec_versions_are_insert_only, store)
        self.assertEqual(len(failed), 1, printed)
        self.assertIn("not refused", printed)

    def test_a_refusal_for_some_other_reason_is_still_a_failure(self):
        store = FakeStore(update_error=verify.StoreError(
            "PATCH aci_spec_versions -> 500: internal error"))
        printed, failed = run(verify.check_spec_versions_are_insert_only, store)
        self.assertEqual(len(failed), 1, printed)


if __name__ == "__main__":
    unittest.main()
