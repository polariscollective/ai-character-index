"""index_store shapes database rows back into what the builders already read."""
import sys
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "spec-cite"))
import cite
import index_store

TEN = index_store.depth_call.prompt_sha256(10)


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


class CellDepthOutOfTenTest(unittest.TestCase):
    """Depths out of ten live in their own table, keyed by call, prompt and
    assessment run. `aci_depths` never carries them, so a store holding both
    still reads the scale of four exactly as it always has when no assessment
    run is named."""
    CELL = {"run_id": "run-1", "behaviour_slug": "helpfulness", "spec_version_id": "row-1"}
    RUN = "assessment-1"

    def store(self, out_of_ten=()):
        calls = [{"id": f"call-{m}", "run_id": "run-1", "behaviour_slug": "helpfulness",
                  "spec_version_id": "row-1", "model": m, "status": "done"}
                 for m in ("sol", "fable", "deepseek")]
        depths = [{"call_id": f"call-{m}", "status": "done", "depth": v,
                   "rationale": f"{m} says {v}."}
                  for m, v in (("sol", 3), ("fable", 3), ("deepseek", 2))]
        return FakeStore({"aci_judge_calls": calls, "aci_depths": depths,
                          "aci_depths_out_of_ten": list(out_of_ten)})

    def ten(self, model, value, assessment_run_id=None, prompt_sha256=None,
           substitute=None, substitution_reason=None, rationale=None):
        row = {"call_id": f"call-{model}", "status": "done", "depth": value,
              "rationale": rationale or f"{model} says {value} out of ten.",
              "assessment_run_id": assessment_run_id or self.RUN,
              "prompt_sha256": prompt_sha256 or TEN}
        if substitute is not None:
            row["model"] = substitute
            row["substitution_reason"] = substitution_reason
        return row

    def full_ten(self):
        return [self.ten("sol", 6), self.ten("fable", 6), self.ten("deepseek", 4)]

    def test_with_no_assessment_run_the_scale_of_four_reads_as_today(self):
        got = index_store.cell_depths(self.store(out_of_ten=self.full_ten()), [self.CELL])
        self.assertEqual(got[("helpfulness", "row-1")], {
            "mean": 2.7,
            "judges": {
                "deepseek": {"depth": 2, "rationale": "deepseek says 2."},
                "fable": {"depth": 3, "rationale": "fable says 3."},
                "sol": {"depth": 3, "rationale": "sol says 3."},
            }})

    def test_an_assessment_run_reads_its_own_rows_of_ten(self):
        got = index_store.cell_depths(self.store(out_of_ten=self.full_ten()),
                                      [self.CELL], self.RUN, depth_prompt=TEN)
        self.assertEqual(got[("helpfulness", "row-1")], {
            "mean": 5.3,
            "scale": 10,
            "judges": {
                "deepseek": {"depth": 4, "rationale": "deepseek says 4 out of ten."},
                "fable": {"depth": 6, "rationale": "fable says 6 out of ten."},
                "sol": {"depth": 6, "rationale": "sol says 6 out of ten."},
            }})

    def test_a_row_of_another_assessment_run_is_ignored(self):
        rows = [self.ten("sol", 6, assessment_run_id="other-run"),
               self.ten("fable", 6), self.ten("deepseek", 4)]
        got = index_store.cell_depths(self.store(out_of_ten=rows), [self.CELL], self.RUN,
                                      depth_prompt=TEN)
        self.assertEqual(got, {})

    def test_a_row_of_another_prompt_digest_is_ignored(self):
        rows = [self.ten("sol", 6, prompt_sha256="stale-digest"),
               self.ten("fable", 6), self.ten("deepseek", 4)]
        got = index_store.cell_depths(self.store(out_of_ten=rows), [self.CELL], self.RUN,
                                      depth_prompt=TEN)
        self.assertEqual(got, {})

    def test_rows_are_read_by_the_digest_given_not_by_the_prompt_on_disk(self):
        """A publication records the digest its depths were given under. When
        the prompt of ten is later edited, the file's digest moves and the
        publication must still read its own rows."""
        original = index_store.depth_call.prompt_sha256
        edited = "e" * 64
        with mock.patch.object(index_store.depth_call, "prompt_sha256",
                               lambda scale=4: edited if scale == 10 else original(scale)):
            got = index_store.cell_depths(self.store(out_of_ten=self.full_ten()),
                                          [self.CELL], self.RUN, depth_prompt=TEN)
            self.assertEqual(got[("helpfulness", "row-1")]["mean"], 5.3)
            under_the_edit = [self.ten(m, 1, prompt_sha256=edited)
                              for m in ("sol", "fable", "deepseek")]
            got = index_store.cell_depths(self.store(out_of_ten=under_the_edit),
                                          [self.CELL], self.RUN, depth_prompt=TEN)
            self.assertEqual(got, {}, "rows under the file's new digest are not the ones given")

    def test_reading_out_of_ten_needs_the_digest_it_was_given_under(self):
        with self.assertRaises(ValueError):
            index_store.cell_depths(self.store(out_of_ten=self.full_ten()), [self.CELL],
                                    self.RUN)

    def test_a_row_naming_its_substitute_carries_it(self):
        rows = [self.ten("sol", 6, substitute="kimi",
                         rationale="kimi says 6 out of ten.",
                         substitution_reason="sol was refused on input."),
               self.ten("fable", 6), self.ten("deepseek", 4)]
        got = index_store.cell_depths(self.store(out_of_ten=rows), [self.CELL], self.RUN,
                                      depth_prompt=TEN)
        entry = got[("helpfulness", "row-1")]["judges"]["sol"]
        self.assertEqual(entry, {"depth": 6, "rationale": "kimi says 6 out of ten.",
                                 "model": "kimi",
                                 "substitution_reason": "sol was refused on input."})


FOUR = index_store.depth_call.prompt_sha256(4)


class DepthScaleTest(unittest.TestCase):
    """The scale a build reads its depths on follows from the depth prompt and
    the assessment run it names, and a pair that does not go together is
    refused naming what was named and what was expected."""

    def refusal(self, *args):
        with self.assertRaises(SystemExit) as refused:
            index_store.depth_scale(*args)
        return str(refused.exception)

    def test_naming_nothing_or_the_prompt_of_four_reads_the_scale_of_four(self):
        self.assertEqual(index_store.depth_scale(), 4)
        self.assertEqual(index_store.depth_scale(FOUR, None), 4)

    def test_the_prompt_of_ten_with_an_assessment_run_reads_the_scale_of_ten(self):
        self.assertEqual(index_store.depth_scale(TEN, "assessment-1"), 10)

    def test_an_earlier_prompt_of_ten_still_reads_the_scale_of_ten(self):
        """What a publication recorded is what it is rebuilt with: whether a
        new publication uses the current prompt is publish.py's question."""
        self.assertEqual(index_store.depth_scale("e" * 64, "assessment-1"), 10)

    def test_a_depth_prompt_that_is_not_a_digest_is_refused_with_an_assessment_run(self):
        message = self.refusal("abc123", "assessment-1")
        self.assertIn("abc123", message)
        self.assertIn("sha256", message)

    def test_an_assessment_run_under_any_other_prompt_is_refused_naming_both(self):
        for named in (None, FOUR):
            message = self.refusal(named, "assessment-1")
            self.assertIn(FOUR, message)
            self.assertIn(TEN, message)

    def test_the_prompt_of_ten_without_an_assessment_run_is_refused(self):
        self.assertIn("--assessment-run", self.refusal(TEN, None))

    def test_a_digest_that_is_neither_is_refused_and_named(self):
        message = self.refusal("abc123", None)
        self.assertIn("abc123", message)
        self.assertIn(FOUR, message)


class AssessmentRunIdTest(unittest.TestCase):
    """An assessment run id is a uuid as the database writes it, and anything
    else given for one is refused by name before a store is read."""
    ID = "8a4e2c6f-1b3d-4f5a-9c7e-0d2b4f6a8c1e"

    def test_a_uuid_is_taken_as_the_database_writes_it(self):
        self.assertEqual(index_store.assessment_run_id(self.ID), self.ID)
        self.assertEqual(index_store.assessment_run_id(self.ID.upper()), self.ID)

    def test_anything_else_is_refused_naming_it(self):
        for given in ("assessment-1", self.ID[:-1], self.ID + "0", self.ID.replace("-", ""),
                      "{" + self.ID + "}", f" {self.ID}", ""):
            with self.assertRaises(SystemExit) as refused:
                index_store.assessment_run_id(given)
            self.assertIn(f"--assessment-run={given} is not an assessment run id",
                          str(refused.exception))


V1 = {"id": "row-1", "spec_id": "acme", "version": "2026-01-01"}
V2 = {"id": "row-2", "spec_id": "acme", "version": "2026-06-01"}
ASSESSMENT_RUN = {"id": "assessment-1", "status": "done",
                  "panels": {"criteria": ["sol", "fable"], "contradictions": ["sol", "kimi"]}}


def assessed(version_id, criteria_status="done", scored=("conflict_rules", "rule_force",
                                                         "reasons", "situations"),
             confirm_status="done", kimi_read=None, claims_written=True):
    """The rows of one fully assessed document, with one thing to vary at a time.

    `confirm_status` None means the confirmation was never asked. `kimi_read`
    says whether kimi's reading of the claim sol found was written, which by
    default it was exactly when kimi's confirmation finished. With
    `claims_written` false, no claim was written, so nothing was confirmed."""
    if kimi_read is None:
        kimi_read = confirm_status == "done"
    calls = [{"id": f"{version_id}-c-{seat}", "run_id": "assessment-1",
              "spec_version_id": version_id, "question": "criteria", "seat": seat,
              "model": seat, "status": criteria_status if seat == "fable" else "done"}
             for seat in ("sol", "fable")]
    calls += [{"id": f"{version_id}-x-{seat}", "run_id": "assessment-1",
               "spec_version_id": version_id, "question": "contradictions", "seat": seat,
               "model": seat, "status": "done"} for seat in ("sol", "kimi")]
    if claims_written and confirm_status is not None:
        calls += [{"id": f"{version_id}-k-kimi", "run_id": "assessment-1",
                   "spec_version_id": version_id, "question": "confirm", "seat": "kimi",
                   "model": "kimi", "status": confirm_status}]
    scores = [{"call_id": f"{version_id}-c-sol", "criterion": criterion, "score": 3,
               "rationale": "r", "locators": []}
              for criterion in ("conflict_rules", "rule_force", "reasons", "situations")]
    scores += [{"call_id": f"{version_id}-c-fable", "criterion": criterion, "score": 2,
                "rationale": "r", "locators": []} for criterion in scored]
    claims = [{"id": f"{version_id}-claim", "run_id": "assessment-1",
               "spec_version_id": version_id, "first_locator": "a", "second_locator": "b",
               "situation": "s", "why": "w", "found_by": ["sol"]}]
    verdicts = [{"claim_id": f"{version_id}-claim", "call_id": f"{version_id}-x-sol",
                 "seat": "sol", "holds": True, "absolute": None, "reason": "found it"}]
    if kimi_read:
        verdicts.append({"claim_id": f"{version_id}-claim", "call_id": f"{version_id}-k-kimi",
                         "seat": "kimi", "holds": False, "absolute": False,
                         "reason": "They apply to different users."})
    if not claims_written:
        claims, verdicts = [], []
    return calls, scores, claims, verdicts


def assessment_store(*documents, runs=(ASSESSMENT_RUN,)):
    tables = {"aci_assessment_runs": list(runs), "aci_assessment_calls": [],
              "aci_assessment_scores": [], "aci_assessment_claims": [],
              "aci_assessment_verdicts": []}
    for calls, scores, claims, verdicts in documents:
        tables["aci_assessment_calls"] += calls
        tables["aci_assessment_scores"] += scores
        tables["aci_assessment_claims"] += claims
        tables["aci_assessment_verdicts"] += verdicts
    return FakeStore(tables)


class AssessmentTest(unittest.TestCase):
    """A publication out of ten carries the assessment of every document it
    carries, each answered by every seat of the run, or it is refused naming
    every document that is not."""

    def refusal(self, store, versions=(V1, V2)):
        with self.assertRaises(SystemExit) as refused:
            index_store.assessment(store, "assessment-1", list(versions))
        return str(refused.exception)

    def test_a_run_that_assessed_every_document_gives_each_its_rows(self):
        run, rows = index_store.assessment(
            assessment_store(assessed("row-1"), assessed("row-2")), "assessment-1", [V1, V2])
        self.assertEqual(run["id"], "assessment-1")
        self.assertEqual(sorted(rows), ["row-1", "row-2"])
        self.assertEqual(len(rows["row-1"]["calls"]), 5)
        self.assertEqual(len(rows["row-1"]["scores"]), 8)
        self.assertEqual([claim["id"] for claim in rows["row-2"]["claims"]], ["row-2-claim"])
        self.assertEqual(len(rows["row-2"]["verdicts"]), 2)

    def test_rows_of_another_run_or_another_document_are_not_read(self):
        stray = assessed("row-1")
        for table in stray:
            for row in table:
                if "run_id" in row:
                    row["run_id"] = "another-run"
        run, rows = index_store.assessment(
            assessment_store(assessed("row-2"), stray), "assessment-1", [V2])
        self.assertEqual(sorted(rows), ["row-2"])
        self.assertTrue(all(call["spec_version_id"] == "row-2" for call in rows["row-2"]["calls"]))

    def test_a_document_the_run_did_not_assess_is_named(self):
        message = self.refusal(assessment_store(assessed("row-2")))
        self.assertIn("acme@2026-01-01", message)
        self.assertNotIn("acme@2026-06-01", message)

    def test_a_seat_that_did_not_answer_is_named(self):
        message = self.refusal(assessment_store(assessed("row-1", criteria_status="error"),
                                                assessed("row-2")))
        self.assertIn("acme@2026-01-01", message)
        self.assertIn("fable", message)

    def test_a_criterion_a_seat_left_unscored_is_named(self):
        message = self.refusal(assessment_store(
            assessed("row-1", scored=("conflict_rules", "rule_force", "reasons")),
            assessed("row-2")))
        self.assertIn("situations", message)

    def test_a_confirmation_that_did_not_finish_is_named(self):
        message = self.refusal(assessment_store(assessed("row-1", confirm_status="error"),
                                                assessed("row-2")))
        self.assertIn("kimi", message)
        self.assertIn("acme@2026-01-01", message)

    def test_a_run_that_does_not_exist_is_named(self):
        message = self.refusal(assessment_store(assessed("row-1"), runs=()))
        self.assertIn("assessment-1", message)
        self.assertNotIn("--resume=", message, "there is no run to take up")
        self.assertIn("new assessment run", message)

    def assert_remedy(self, message):
        """The remedy is to take the run up where it stopped, or a new run
        where only a new run will do, with depths out of ten given against the
        run that stands, since they belong to the run they were given with."""
        self.assertIn("--resume=assessment-1", message)
        self.assertIn("new assessment run", message)
        self.assertIn("depths out of ten", message)
        self.assertIn("--assessment-run=", message)
        self.assertNotIn("not taken up again", message)

    def test_a_run_left_error_with_its_confirmations_missing_is_refused(self):
        # It stopped after the claims were written and before kimi confirmed
        # the one it did not find: every call it made is done.
        stopped = dict(ASSESSMENT_RUN, status="error", error="interrupted")
        message = self.refusal(assessment_store(assessed("row-1", confirm_status=None),
                                                assessed("row-2", confirm_status=None),
                                                runs=(stopped,)))
        self.assertIn("error", message)
        for name in ("acme@2026-01-01", "acme@2026-06-01"):
            self.assertIn(f"{name}: kimi gave no reading of 1 of its 1 claimed "
                          "contradictions", message)
        self.assert_remedy(message)

    def test_a_run_left_running_with_no_claims_written_is_refused(self):
        # Every seat answered, and the run stopped before the claims were pooled.
        running = dict(ASSESSMENT_RUN, status="running")
        message = self.refusal(assessment_store(assessed("row-1", claims_written=False),
                                                assessed("row-2", claims_written=False),
                                                runs=(running,)))
        self.assertIn("running", message)
        self.assertIn("acme@2026-01-01", message)
        self.assertIn("acme@2026-06-01", message)
        self.assert_remedy(message)

    def test_a_claim_a_seat_left_unread_in_a_finished_run_is_named(self):
        # kimi's confirmation finished, and its reply did not read the claim.
        message = self.refusal(assessment_store(assessed("row-1", kimi_read=False),
                                                assessed("row-2")))
        self.assertIn("acme@2026-01-01: kimi gave no reading of 1 of its 1 claimed "
                      "contradictions", message)
        self.assertNotIn("acme@2026-06-01", message)
        self.assert_remedy(message)



# A run of the second method that takes its criteria from assessment-1.
TAKING = {"id": "assessment-2", "status": "done",
          "panels": {"criteria": ["sol", "fable"], "contradictions": ["sol", "kimi"]},
          "config": {"substitutes": {}, "criteria_from": "assessment-1"}}


def contradictions_of(version_id, read_by=("sol", "kimi"), confirm_status="done",
                      found=("sol", "kimi")):
    """The contradictions half of one document in assessment-2: each seat found
    and read, and the one claim pooled was read by the seats of `read_by`."""
    calls = [{"id": f"{version_id}-2-{question}-{seat}", "run_id": "assessment-2",
              "spec_version_id": version_id, "question": question, "seat": seat,
              "model": seat, "status": status}
             for question, status, seats in (("contradictions", "done", found),
                                             ("confirm", confirm_status, ("sol", "kimi")))
             for seat in seats]
    claims = [{"id": f"{version_id}-2-claim", "run_id": "assessment-2",
               "spec_version_id": version_id, "first_locator": "c", "second_locator": "d",
               "situation": "s2", "why": "w2", "found_by": ["kimi"]}]
    verdicts = [{"claim_id": f"{version_id}-2-claim", "call_id": f"{version_id}-2-confirm-{seat}",
                 "seat": seat, "holds": True, "absolute": False, "reason": f"{seat} reads it."}
                for seat in read_by]
    return calls, [], claims, verdicts


class CriteriaFromTest(unittest.TestCase):
    """A run that takes its criteria from an earlier run stands on that run's
    criteria, conflict rules and depths, and on its own contradictions. The
    gaps check applies each half to its own run and says which run a gap is
    in."""

    def store(self, *documents, runs=(ASSESSMENT_RUN, TAKING)):
        return assessment_store(*documents, runs=runs)

    def refusal(self, store, versions=(V1, V2)):
        with self.assertRaises(SystemExit) as refused:
            index_store.assessment(store, "assessment-2", list(versions))
        return str(refused.exception)

    def test_criteria_come_from_the_run_named_and_contradictions_from_the_run_itself(self):
        run, rows = index_store.assessment(
            self.store(assessed("row-1"), assessed("row-2"), contradictions_of("row-1"),
                       contradictions_of("row-2")), "assessment-2", [V1, V2])
        self.assertEqual(run["id"], "assessment-2")
        self.assertEqual(run["criteria_run"]["id"], "assessment-1")
        for version_id in ("row-1", "row-2"):
            calls = rows[version_id]["calls"]
            self.assertEqual(sorted(c["id"] for c in calls if c["question"] == "criteria"),
                             [f"{version_id}-c-fable", f"{version_id}-c-sol"])
            self.assertTrue(all(c["run_id"] == "assessment-2" for c in calls
                                if c["question"] != "criteria"))
            self.assertEqual(len([c for c in calls if c["question"] != "criteria"]), 4)
            self.assertEqual(len(rows[version_id]["scores"]), 8)
            self.assertEqual([c["id"] for c in rows[version_id]["claims"]],
                             [f"{version_id}-2-claim"])
            self.assertEqual({v["call_id"] for v in rows[version_id]["verdicts"]},
                             {f"{version_id}-2-confirm-sol", f"{version_id}-2-confirm-kimi"})

    def test_a_run_s_own_rows_are_what_it_wrote(self):
        run, rows = index_store.assessment_run_rows(
            self.store(assessed("row-1"), contradictions_of("row-1")), "assessment-2", ["row-1"])
        self.assertNotIn("criteria_run", run)
        self.assertEqual({c["run_id"] for c in rows["row-1"]["calls"]}, {"assessment-2"})
        self.assertEqual(rows["row-1"]["scores"], [])

    def test_a_run_that_takes_nothing_is_read_as_it_always_was(self):
        store = self.store(assessed("row-1"), assessed("row-2"))
        run, rows = index_store.assessment(store, "assessment-1", [V1, V2])
        self.assertEqual(run, ASSESSMENT_RUN)
        self.assertEqual(index_store.assessment_run_rows(store, "assessment-1", ["row-1", "row-2"]),
                         (run, rows))

    def test_a_criteria_gap_is_named_in_the_run_it_is_in(self):
        message = self.refusal(self.store(
            assessed("row-1", criteria_status="error"), assessed("row-2"),
            contradictions_of("row-1"), contradictions_of("row-2")))
        self.assertIn("acme@2026-01-01: fable gave no criteria answer in assessment run "
                      "assessment-1", message)
        self.assertNotIn("acme@2026-06-01", message)

    def test_a_contradictions_gap_is_named_in_the_run_it_is_in(self):
        message = self.refusal(self.store(
            assessed("row-1"), assessed("row-2"),
            contradictions_of("row-1", read_by=("sol",)), contradictions_of("row-2")))
        self.assertIn("acme@2026-01-01: kimi gave no reading of 1 of its 1 claimed "
                      "contradictions in assessment run assessment-2", message)
        # The earlier run's own contradictions are not this run's business:
        # assessed() wrote one claim sol found and kimi read, never read here.
        self.assertNotIn("row-1-claim", message)
        self.assertIn("--resume=assessment-2", message)
        self.assertIn("depths out of ten are read from assessment run assessment-1", message)

    def test_a_document_either_run_did_not_assess_is_named_with_that_run(self):
        message = self.refusal(self.store(assessed("row-1"), contradictions_of("row-1"),
                                          contradictions_of("row-2")))
        self.assertIn("acme@2026-06-01: assessment run assessment-1, whose criteria "
                      "assessment run assessment-2 takes, did not assess it", message)
        message = self.refusal(self.store(assessed("row-1"), assessed("row-2"),
                                          contradictions_of("row-1")))
        self.assertIn("acme@2026-06-01: the assessment run did not assess it (assessment "
                      "run assessment-2)", message)

    def test_the_run_named_must_have_finished_and_exist(self):
        stopped = dict(ASSESSMENT_RUN, status="error")
        documents = (assessed("row-1"), assessed("row-2"), contradictions_of("row-1"),
                     contradictions_of("row-2"))
        message = self.refusal(self.store(*documents, runs=(stopped, TAKING)))
        self.assertIn("assessment run assessment-1, whose criteria assessment run "
                      "assessment-2 takes, has status error, not done", message)
        message = self.refusal(self.store(*documents, runs=(TAKING,)))
        self.assertIn("there is no assessment run assessment-1, whose criteria assessment "
                      "run assessment-2 takes", message)

    def test_the_depths_out_of_ten_are_read_from_the_run_named(self):
        cell = {"run_id": "run-1", "behaviour_slug": "helpfulness", "spec_version_id": "row-1"}
        calls = [{"id": f"call-{m}", "run_id": "run-1", "behaviour_slug": "helpfulness",
                  "spec_version_id": "row-1", "model": m, "status": "done"}
                 for m in ("sol", "fable", "deepseek")]
        depths = [{"call_id": f"call-{m}", "status": "done", "depth": value,
                   "rationale": f"{m} on {run_id}.", "assessment_run_id": run_id,
                   "prompt_sha256": TEN}
                  for run_id, value in (("assessment-1", 6), ("assessment-2", 1))
                  for m in ("sol", "fable", "deepseek")]
        store = FakeStore({"aci_judge_calls": calls, "aci_depths_out_of_ten": depths,
                           "aci_assessment_runs": [ASSESSMENT_RUN, TAKING]})
        given = index_store.cell_depths(store, [cell], "assessment-2", depth_prompt=TEN)
        self.assertEqual(given, index_store.cell_depths(store, [cell], "assessment-1",
                                                        depth_prompt=TEN))
        self.assertEqual(given[("helpfulness", "row-1")]["mean"], 6)
        self.assertEqual(index_store.criteria_run_id(store, "assessment-2"), "assessment-1")
        self.assertEqual(index_store.criteria_run_id(store, "assessment-1"), "assessment-1")


if __name__ == "__main__":
    unittest.main()
