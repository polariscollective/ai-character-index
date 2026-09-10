"""Migration tests. `plan()` reads the committed artifacts and touches no
network, so these are facts about the shipped files rather than about a fixture.
"""
import hashlib
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import migrate_to_supabase as migration


class MemoryStore:
    """Accepts inserts and answers selects from what it holds."""

    def __init__(self):
        self.tables = {}
        self.inserted = []

    def select(self, table, params=None):
        return list(self.tables.get(table, []))

    def insert(self, table, rows, chunk=1000):
        self.tables.setdefault(table, []).extend(rows)
        self.inserted.append((table, len(rows)))


class PlanTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan = migration.plan()
        cls.log = [json.loads(line) for line
                   in migration.RUNLOG.read_text().splitlines() if line.strip()]

    def test_every_runlog_slug_resolves_against_the_registry(self):
        registry = json.loads((ROOT / "data" / "behaviours.json").read_text())
        self.assertEqual(sorted({row["behaviour"] for row in self.log} - set(registry)), [])
        run = self.plan["aci_runs"][0]
        self.assertEqual(sorted(run["behaviours"]),
                         sorted({row["behaviour"] for row in self.log}))

    def test_the_v5_log_becomes_sixty_seven_calls(self):
        distinct = {(r["behaviour"], r["spec"], r["model"]) for r in self.log}
        self.assertEqual(len(distinct), 67)
        self.assertEqual(len(self.plan["aci_judge_calls"]), 67)
        behaviours = len({r["behaviour"] for r in self.log})
        self.assertNotEqual(67, behaviours * 2 * 3,
                            "67 is not a multiplication: the panels are ragged")

    def test_judgements_hang_off_their_call_and_the_counts_add_up(self):
        calls = {call["id"]: call for call in self.plan["aci_judge_calls"]}
        self.assertTrue(all(j["call_id"] in calls for j in self.plan["aci_judgements"]))
        self.assertEqual(sum(c["passages"] for c in calls.values()),
                         len(self.plan["aci_judgements"]))
        self.assertEqual(len(self.plan["aci_judgements"]), len(self.log))

    def test_a_spec_version_carries_the_digest_of_the_file_on_disk(self):
        for version in self.plan["aci_spec_versions"]:
            self.assertEqual(version["content_sha256"],
                             hashlib.sha256(version["markdown"].encode()).hexdigest())
        self.assertEqual({v["spec_id"] for v in self.plan["aci_spec_versions"]},
                         {"constitution", "model-spec"})

    def test_the_model_spec_is_the_one_read_by_anchor(self):
        style = {spec["id"]: spec["locator_style"] for spec in self.plan["aci_specs"]}
        self.assertEqual(style, {"model-spec": "anchor", "constitution": "path"})

    def test_coverage_numeric_ids_resolve_to_slugs_of_the_index_set(self):
        registry = json.loads((ROOT / "data" / "behaviours.json").read_text())
        index_slugs = {slug for slug, e in registry.items() if e["set"] == "index"}
        slugs = {row["behaviour_slug"] for row in self.plan["aci_coverage"]}
        self.assertTrue(slugs <= index_slugs)
        self.assertEqual(slugs, {"no-sycophancy", "calibration", "action-honesty"})

    def test_the_first_publication_is_grandfathered_and_takes_every_cell(self):
        [publication] = self.plan["aci_publications"]
        self.assertTrue(publication["grandfathered"])
        cells_in_run = {(c["behaviour_slug"], c["spec_version_id"])
                        for c in self.plan["aci_judge_calls"]}
        cells_published = {(c["behaviour_slug"], c["spec_version_id"])
                           for c in self.plan["aci_publication_cells"]}
        self.assertEqual(cells_published, cells_in_run)
        self.assertEqual(len(cells_published), 18)

    def test_the_published_payload_is_the_committed_one(self):
        [publication] = self.plan["aci_publications"]
        self.assertEqual(publication["payload"],
                         json.loads(migration.PAYLOAD.read_text()))


# The documents payload is built by the real builder against the real database.
# These tests prove the mapping, so they stub it out and stay offline.
STUB_DOCUMENTS = lambda: ({"documents": []}, "0" * 64)


class MigrateTest(unittest.TestCase):
    def test_a_second_run_inserts_nothing(self):
        store = MemoryStore()
        first = migration.migrate(store, build_documents=STUB_DOCUMENTS)
        self.assertTrue(all(counts["new"] == counts["total"]
                            for counts in first.values()))
        store.inserted.clear()
        second = migration.migrate(store, build_documents=STUB_DOCUMENTS)
        self.assertTrue(all(counts["new"] == 0 for counts in second.values()),
                        f"re-inserted: {[t for t, c in second.items() if c['new']]}")
        self.assertEqual(store.inserted, [])

    def test_the_publication_is_written_with_both_payloads(self):
        store = MemoryStore()
        migration.migrate(store, build_documents=STUB_DOCUMENTS)
        [publication] = store.tables["aci_publications"]
        self.assertEqual(publication["payload"],
                         json.loads(migration.PAYLOAD.read_text()))
        self.assertEqual(publication["documents"], {"documents": []})
        self.assertEqual(publication["documents_sha256"], "0" * 64)

    def test_a_dry_run_writes_nothing(self):
        store = MemoryStore()
        report = migration.migrate(store, dry_run=True,
                                   build_documents=STUB_DOCUMENTS)
        self.assertEqual(store.inserted, [])
        self.assertEqual(report["aci_judgements"]["new"], 31293)


if __name__ == "__main__":
    unittest.main()
