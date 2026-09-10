"""index_store shapes database rows back into what the builders already read."""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "spec-cite"))
import cite
import index_store


class FakeStore:
    def __init__(self, tables):
        self.tables = tables
        self.selects = []

    def select(self, table, params=None):
        self.selects.append((table, params or {}))
        return self.tables.get(table, [])


LABS = [{"id": "acme-labs", "name": "Acme Labs"}]
SPECS = [{"id": "acme", "lab_id": "acme-labs", "title": "Acme Spec",
          "short_title": "Acme", "source_url": "https://example.com/spec",
          "locator_style": "path"}]
VERSIONS = [{"id": "row-1", "spec_id": "acme", "version": "2026-01-01",
             "markdown": "# Acme Spec\n\n## A section\n\nA paragraph.",
             "content_sha256": "abc", "source_url": "https://example.com/spec"}]


def fake(**extra):
    tables = {"aci_labs": LABS, "aci_specs": SPECS, "aci_spec_versions": VERSIONS}
    tables.update(extra)
    return FakeStore(tables)


class SpecRegistryTest(unittest.TestCase):
    def tearDown(self):
        cite.reset_registry()

    def test_entries_are_keyed_by_name_and_version_and_hold_the_row_id(self):
        entries, defaults, meta, _ = index_store.spec_registry(fake())
        self.assertEqual(entries, {("acme", "2026-01-01"): "row-1"})
        self.assertEqual(defaults, {"acme": "2026-01-01"})
        self.assertEqual(meta[("acme", "2026-01-01")]["title"], "Acme Spec")

    def test_the_source_reads_the_markdown_and_then_caches_it(self):
        store = fake()
        _, _, _, source = index_store.spec_registry(store)
        before = len(store.selects)
        self.assertIn("# Acme Spec", source("row-1"))
        self.assertIn("# Acme Spec", source("row-1"))
        self.assertEqual(len(store.selects), before,
                         "the markdown came with the version rows; "
                         "reading it twice must not query twice")

    def test_installing_it_lets_cite_resolve_against_a_row(self):
        index_store.install_registry(fake())
        version, sections, lines = cite.load_spec("acme", None)
        self.assertEqual(version, "2026-01-01")
        self.assertEqual(lines[0], "# Acme Spec")

    def test_the_newest_version_is_the_default_when_several_exist(self):
        versions = VERSIONS + [dict(VERSIONS[0], id="row-2", version="2026-06-01")]
        _, defaults, _, _ = index_store.spec_registry(fake(aci_spec_versions=versions))
        self.assertEqual(defaults, {"acme": "2026-06-01"})


class DocumentTest(unittest.TestCase):
    def test_a_document_is_keyed_by_its_lab_not_its_spec(self):
        [doc] = index_store.documents(fake())
        self.assertEqual(doc["id"], "acme-labs")
        self.assertEqual(doc["lab"], "Acme Labs")
        self.assertEqual(doc["title"], "Acme Spec")
        self.assertEqual(doc["shortTitle"], "Acme")
        self.assertEqual(doc["version"], "2026-01-01")
        self.assertEqual(doc["sourceUrl"], "https://example.com/spec")
        self.assertIn("A paragraph.", doc["markdown"])

    def test_documents_come_back_in_lab_order(self):
        labs = LABS + [{"id": "aardvark", "name": "Aardvark"}]
        specs = SPECS + [dict(SPECS[0], id="aard-spec", lab_id="aardvark")]
        versions = VERSIONS + [dict(VERSIONS[0], id="row-2", spec_id="aard-spec")]
        got = index_store.documents(FakeStore({
            "aci_labs": labs, "aci_specs": specs, "aci_spec_versions": versions}))
        self.assertEqual([d["id"] for d in got], ["aardvark", "acme-labs"])


class BehaviourTest(unittest.TestCase):
    def test_behaviours_come_back_in_the_registry_file_shape(self):
        rows = [{"slug": "helpfulness", "name": "Helpfulness",
                 "set_name": "reader-test", "numeric_id": 1,
                 "group_name": "Behaviours under test",
                 "definition": "A definition.", "facets": []}]
        got = index_store.behaviours(FakeStore({"aci_behaviours": rows}))
        self.assertEqual(got["helpfulness"], {
            "name": "Helpfulness", "set": "reader-test", "numeric_id": 1,
            "group": "Behaviours under test",
            "definition": "A definition.", "facets": [],
        })


class RunlogTest(unittest.TestCase):
    def test_judgements_come_back_in_the_jsonl_row_shape(self):
        calls = [{"id": "call-1", "run_id": "run-1",
                  "behaviour_slug": "helpfulness", "spec_version_id": "row-1",
                  "model": "sol", "status": "done"}]
        judgements = [{"call_id": "call-1", "locator": "acme@2026-01-01 > A > 1",
                       "verdict": 2, "relevant": 1, "parsed": True}]
        rows = index_store.runlog_rows(
            fake(aci_runs=[{"id": "run-1", "rubric": "v5",
                            "config": {"via": "wholedoc-v5"}}],
                 aci_judge_calls=calls, aci_judgements=judgements),
            "run-1")
        self.assertEqual(rows, [{
            "behaviour": "helpfulness", "spec": "acme", "model": "sol",
            "locator": "acme@2026-01-01 > A > 1", "verdict": 2,
            "relevant": 1, "parsed": True, "rubric": "v5",
            "via": "wholedoc-v5",
        }])

    def test_a_call_that_is_not_done_contributes_nothing(self):
        calls = [{"id": "call-1", "run_id": "run-1",
                  "behaviour_slug": "helpfulness", "spec_version_id": "row-1",
                  "model": "sol", "status": "error"}]
        rows = index_store.runlog_rows(
            fake(aci_runs=[{"id": "run-1", "rubric": "v5", "config": {}}],
                 aci_judge_calls=calls,
                 aci_judgements=[{"call_id": "call-1", "locator": "x",
                                  "verdict": 1, "relevant": 0, "parsed": True}]),
            "run-1")
        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
