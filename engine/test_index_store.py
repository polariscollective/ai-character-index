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
        # The refusal names the section where the two part, and what each holds
        # there, so whoever registers the next version knows where to look.
        message = str(refused.exception)
        self.assertIn("'Acme Spec > A section' (heading level 2, ¶1)", message)
        self.assertIn("'规约 > 一节' (heading level 2, ¶1, ¶2)", message)

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


def pairing_refused(markdown, original):
    """The message a build refuses a translation with, or None if it pairs."""
    versions = [dict(TRANSLATED[0], markdown=markdown, original_markdown=original)]
    try:
        index_store.documents(fake(aci_spec_versions=versions), ["row-1"])
    except SystemExit as refused:
        return str(refused)
    return None


class PairingTest(unittest.TestCase):
    """Equal totals do not prove a pairing.

    The pairing is the order of the two texts. A section that cuts into one block
    more and another that cuts into one fewer leave the totals equal, and shift
    every pair between them onto the wrong original, which the reader then shows
    without complaint. So the two texts are held to each other section by
    section: the same headings at the same levels, and in each section the same
    passages at the same ¶ indices.
    """

    def test_equal_totals_with_one_section_cut_differently_are_refused(self):
        # Three passages each. The translation's first section holds two and its
        # second one; the original's the other way round. Zipped, the second
        # passage would open the third's original.
        message = pairing_refused(
            "# Acme Spec\n\n## A section\n\nFirst.\n\nSecond.\n\n## B section\n\nThird.",
            "# 规约\n\n## 一节\n\n第一。第二。\n\n## 二节\n\n第三。\n\n第四。")
        self.assertIsNotNone(message, "equal totals were taken for a sound pairing")
        self.assertIn("'Acme Spec > A section' (heading level 2, ¶1, ¶2)", message)
        self.assertIn("'规约 > 一节' (heading level 2, ¶1)", message)
        self.assertNotIn("B section", message,
                         "the first section where the two part is named, not a later one")

    def test_a_caption_rule_only_english_triggers_is_refused(self):
        # cite.py joins a fence to a preceding **Example** caption and to no other
        # caption. A Chinese **示例** caption stays a block apart from its fence,
        # and a paragraph merged further on makes the totals agree again.
        message = pairing_refused(
            "# Acme Spec\n\n## Examples\n\n**Example**: a caption\n\n```\nUser: hello\n```\n\n"
            "## Next\n\nOne paragraph.\n\nAnother paragraph.",
            "# 规约\n\n## 示例\n\n**示例**：一个标题\n\n```\n用户：你好\n```\n\n"
            "## 下一节\n\n合并成一段的两段文字。")
        self.assertIsNotNone(message, "the caption rule split the two texts unseen")
        self.assertIn("'Acme Spec > Examples' (heading level 2, ¶1)", message)
        self.assertIn("'规约 > 示例' (heading level 2, ¶1, ¶2)", message)

    def test_a_section_one_text_lacks_is_refused(self):
        message = pairing_refused(
            "# Acme Spec\n\n## A section\n\nOne.\n\n## B section\n\nTwo.",
            "# 规约\n\n## 一节\n\n一。\n\n## 二节\n\n二。\n\n## 三节\n")
        self.assertIsNotNone(message)
        self.assertIn("the translation has no section", message)
        self.assertIn("'规约 > 三节' (heading level 2, no passages)", message)

    def test_heading_levels_must_agree(self):
        message = pairing_refused(
            "# Acme Spec\n\n## A section\n\nOne.\n\n### B section\n\nTwo.",
            "# 规约\n\n## 一节\n\n一。\n\n## 二节\n\n二。")
        self.assertIsNotNone(message)
        self.assertIn("'Acme Spec > A section > B section' (heading level 3, ¶1)", message)
        self.assertIn("'规约 > 二节' (heading level 2, ¶1)", message)

    def test_the_same_count_at_different_indices_is_refused(self):
        # A block repeating its section's heading is not a passage, so the
        # translation's one passage here is ¶2 and the original's is ¶1: one
        # each, and not the same locator.
        message = pairing_refused(
            "# Acme Spec\n\n## A section\n\nA section\n\nOne.",
            "# 规约\n\n## 一节\n\n一。")
        self.assertIsNotNone(message)
        self.assertIn("'Acme Spec > A section' (heading level 2, ¶2)", message)
        self.assertIn("'规约 > 一节' (heading level 2, ¶1)", message)

    def test_a_translation_that_keeps_its_structure_pairs_passage_by_passage(self):
        versions = [dict(TRANSLATED[0],
                         markdown="# Acme Spec\n\n## A section\n\nOne.\n\n- An item.\n\n"
                                  "## B section\n\nTwo.",
                         original_markdown="# 规约\n\n## 一节\n\n一。\n\n- 一项。\n\n"
                                           "## 二节\n\n二。")]
        [doc] = index_store.documents(fake(aci_spec_versions=versions), ["row-1"])
        self.assertEqual(
            [(pair["locator"], pair["text"], pair["original"]) for pair in doc["original"]],
            [("acme@2026-01-01 > Acme Spec > A section > ¶1", "One.", "一。"),
             ("acme@2026-01-01 > Acme Spec > A section > ¶2", "An item.", "一项。"),
             ("acme@2026-01-01 > Acme Spec > B section > ¶1", "Two.", "二。")])


class BehaviourTest(unittest.TestCase):
    def test_behaviours_come_back_in_the_registry_file_shape_with_no_set(self):
        """Sets decide nothing since the one-panel redesign. The column is still
        in the table, and is not carried."""
        rows = [{"slug": "helpfulness", "name": "Helpfulness",
                 "set_name": "reader-test", "numeric_id": 1,
                 "group_name": "Behaviours under test",
                 "definition": "A definition.", "facets": []}]
        got = index_store.behaviours(FakeStore({"aci_behaviours": rows}))
        self.assertEqual(got["helpfulness"], {
            "name": "Helpfulness", "numeric_id": 1,
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
