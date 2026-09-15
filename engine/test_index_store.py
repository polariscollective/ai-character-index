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

    def test_the_locator_style_travels_with_the_version(self):
        _, _, meta, _ = index_store.spec_registry(fake())
        self.assertEqual(meta[("acme", "2026-01-01")]["locatorStyle"], "path")


class DocumentTest(unittest.TestCase):
    def test_a_document_is_a_version_named_by_its_spec_and_version(self):
        [doc] = index_store.documents(fake(), ["row-1"])
        self.assertEqual(doc["id"], "acme@2026-01-01")
        self.assertEqual(doc["lab"], "Acme Labs")
        self.assertEqual(doc["title"], "Acme Spec")
        self.assertEqual(doc["shortTitle"], "Acme")
        self.assertEqual(doc["version"], "2026-01-01")
        self.assertEqual(doc["sourceUrl"], "https://example.com/spec")
        self.assertIn("A paragraph.", doc["markdown"])

    def test_two_versions_of_one_spec_are_two_documents(self):
        versions = VERSIONS + [dict(VERSIONS[0], id="row-2", version="2026-06-01")]
        got = index_store.documents(fake(aci_spec_versions=versions), ["row-1", "row-2"])
        self.assertEqual([d["id"] for d in got], ["acme@2026-01-01", "acme@2026-06-01"])

    def test_documents_come_back_in_id_order(self):
        labs = LABS + [{"id": "aardvark", "name": "Aardvark"}]
        specs = SPECS + [dict(SPECS[0], id="aard-spec", lab_id="aardvark")]
        versions = VERSIONS + [dict(VERSIONS[0], id="row-2", spec_id="aard-spec")]
        got = index_store.documents(FakeStore({
            "aci_labs": labs, "aci_specs": specs, "aci_spec_versions": versions}),
            ["row-1", "row-2"])
        self.assertEqual([d["id"] for d in got], ["aard-spec@2026-01-01", "acme@2026-01-01"])

    def test_without_a_selection_the_newest_version_of_each_spec_is_the_document(self):
        versions = VERSIONS + [dict(VERSIONS[0], id="row-2", version="2026-06-01")]
        [doc] = index_store.documents(fake(aci_spec_versions=versions))
        self.assertEqual(doc["id"], "acme@2026-06-01")


TRANSLATED = [dict(VERSIONS[0],
                   original_language="zh", translated_by="claude-opus-5",
                   original_sha256="0" * 64,
                   original_markdown="# 规约\n\n## 一节\n\n一个段落。")]


class TranslatedDocumentTest(unittest.TestCase):
    def test_a_translated_document_carries_its_provenance_and_its_original(self):
        [doc] = index_store.documents(fake(aci_spec_versions=TRANSLATED), ["row-1"])
        self.assertEqual(doc["translation"],
                         {"from": "zh", "by": "claude-opus-5", "reviewed": False})
        self.assertEqual(doc["original"], [{
            "locator": "acme@2026-01-01 > Acme Spec > A section > ¶1",
            "text": "A paragraph.",
            "original": "一个段落。",
        }])

    def test_a_document_that_is_its_own_original_says_nothing_about_translation(self):
        [doc] = index_store.documents(fake(), ["row-1"])
        self.assertNotIn("translation", doc)
        self.assertNotIn("original", doc)

    def test_a_translation_that_cuts_differently_is_refused_rather_than_guessed(self):
        # One block against two: pairing them would put the first paragraph of
        # the original beside the only paragraph of the translation and call it
        # a citation.
        versions = [dict(TRANSLATED[0],
                         original_markdown="# 规约\n\n## 一节\n\n第一段。\n\n第二段。")]
        with self.assertRaises(SystemExit) as refused:
            index_store.documents(fake(aci_spec_versions=versions), ["row-1"])
        self.assertIn("1 passages", str(refused.exception))
        self.assertIn("2", str(refused.exception))

    def test_a_person_reading_it_is_a_review_and_a_model_reading_it_is_not(self):
        model = [{"spec_version_id": "row-1", "reviewer_kind": "model",
                  "reviewed_by": "deepseek-v3.2"}]
        [doc] = index_store.documents(
            fake(aci_spec_versions=TRANSLATED, aci_translation_reviews=model), ["row-1"])
        self.assertIs(doc["translation"]["reviewed"], False,
                      "a model reading a translation is not a person reviewing it")

        person = model + [{"spec_version_id": "row-1", "reviewer_kind": "person",
                           "reviewed_by": "someone@example.com"}]
        [doc] = index_store.documents(
            fake(aci_spec_versions=TRANSLATED, aci_translation_reviews=person), ["row-1"])
        self.assertIs(doc["translation"]["reviewed"], True)

    def test_a_version_no_run_judged_says_so_and_silence_is_not_a_finding(self):
        [doc] = index_store.documents(fake(), ["row-1"], judged_version_ids=set())
        self.assertIs(doc["judged"], False)
        [doc] = index_store.documents(fake(), ["row-1"], judged_version_ids={"row-1"})
        self.assertIs(doc["judged"], True)
        # Not asked, nothing claimed: the payload the provenance verifier rebuilds
        # must not gain a field because this argument was left out.
        [doc] = index_store.documents(fake(), ["row-1"])
        self.assertNotIn("judged", doc)


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


class CellDepthTest(unittest.TestCase):
    CELL = {"run_id": "run-1", "behaviour_slug": "helpfulness", "spec_version_id": "row-1"}

    def store(self, depths):
        calls = [{"id": f"call-{m}", "run_id": "run-1", "behaviour_slug": "helpfulness",
                  "spec_version_id": "row-1", "model": m, "status": "done"}
                 for m in ("sol", "fable", "deepseek")]
        return FakeStore({"aci_judge_calls": calls, "aci_depths": depths})

    def depth(self, model, value, status="done"):
        return {"call_id": f"call-{model}", "status": status, "depth": value,
                "rationale": f"{model} says {value}."}

    def test_a_cell_carries_the_mean_and_every_judge(self):
        got = index_store.cell_depths(self.store(
            [self.depth("sol", 3), self.depth("fable", 3), self.depth("deepseek", 2)]),
            [self.CELL])
        entry = got[("helpfulness", "row-1")]
        self.assertEqual(entry["mean"], 2.7)
        self.assertEqual(list(entry["judges"]), ["deepseek", "fable", "sol"])
        self.assertEqual(entry["judges"]["deepseek"], {"depth": 2, "rationale": "deepseek says 2."})

    def test_a_cell_missing_a_depth_is_left_out(self):
        got = index_store.cell_depths(self.store(
            [self.depth("sol", 3), self.depth("fable", 3)]), [self.CELL])
        self.assertEqual(got, {})

    def test_a_depth_that_is_not_done_does_not_count(self):
        got = index_store.cell_depths(self.store(
            [self.depth("sol", 3), self.depth("fable", 3),
             self.depth("deepseek", None, status="error")]), [self.CELL])
        self.assertEqual(got, {})


if __name__ == "__main__":
    unittest.main()
