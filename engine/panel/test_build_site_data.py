"""The behaviour payload: which behaviours, filed under which document, carrying
what. The database is not touched: the pure functions main() composes are."""
import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("build_site_data", HERE / "build_site_data.py")
bs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bs)

REGISTRY = {
    "b": {"name": "Bravo", "group": "G1", "definition": "d", "set": "user"},
    "a": {"name": "Alpha", "group": "G2", "definition": "d", "set": "index"},
    "c": {"name": "Charlie", "group": "G1", "definition": "d", "set": "reader-test"},
}
PANEL = {"sol", "fable", "deepseek"}
DISPLAY = {"threshold": 1, "solid_threshold": 6}
OLD = "openai--model-spec@2025-12-18"
NEW = "openai--model-spec@2026-08-18"
BRAVO = [{"slug": "b", "name": "Bravo", "definition": "d", "category": "G1"}]
VOTES = {("b", f"{OLD} > #x > ¶1"): {"sol": 2, "fable": 2, "deepseek": 2},
         ("b", f"{NEW} > #x > ¶1"): {"sol": 3, "fable": 2, "deepseek": 2}}
TEXT = {locator: "Quoted." for _slug, locator in VOTES}


class DisplayTest(unittest.TestCase):
    def test_every_set_is_displayed_ordered_by_group_then_name(self):
        rows = bs.display_behaviours(["a", "b", "c"], REGISTRY)
        self.assertEqual([row["slug"] for row in rows], ["b", "c", "a"])

    def test_a_slug_the_registry_does_not_carry_is_refused(self):
        with self.assertRaises(SystemExit):
            bs.display_behaviours(["b", "nope"], REGISTRY)


class BuildTest(unittest.TestCase):
    def build(self, depths=None):
        [row] = bs.build_behaviours(BRAVO, VOTES, TEXT, [OLD, NEW], depths or {}, PANEL, DISPLAY)
        return row

    def test_a_passage_is_filed_under_the_document_its_locator_names(self):
        row = self.build()
        self.assertEqual([len(row["coverage"][d]["passages"]) for d in (OLD, NEW)], [1, 1])
        self.assertTrue(row["coverage"][NEW]["passages"][0]["locator"].startswith(NEW))

    def test_a_cell_carries_its_depth_and_nothing_a_human_wrote(self):
        depth = {"mean": 2.7, "judges": {"sol": {"depth": 3, "rationale": "r"}}}
        row = self.build({("b", OLD): depth})
        self.assertEqual(row["coverage"][OLD], {"depth": depth,
                                               "passages": row["coverage"][OLD]["passages"]})
        self.assertIsNone(row["coverage"][NEW]["depth"])

    def test_the_strict_variant_is_not_fed_by_another_behaviour(self):
        """The strict variant was once a re-reading of animal welfare's votes. Votes
        recorded for one behaviour now reach that behaviour's coverage and no other,
        whatever the mapping that used to do the feeding was called."""
        behaviours = [
            {"slug": "animal-welfare-impacts", "name": "Animal welfare impacts",
             "definition": "d", "category": "G1"},
            {"slug": "general-welfare-impacts-strict", "name": "General welfare impacts (strict)",
             "definition": "d", "category": "G1"}]
        votes = {("animal-welfare-impacts", locator): verdicts
                 for (_slug, locator), verdicts in VOTES.items()}
        animal, strict = bs.build_behaviours(behaviours, votes, TEXT, [OLD, NEW], {},
                                             PANEL, DISPLAY)
        self.assertEqual([len(animal["coverage"][d]["passages"]) for d in (OLD, NEW)], [1, 1])
        self.assertEqual([strict["coverage"][d]["passages"] for d in (OLD, NEW)], [[], []])


if __name__ == "__main__":
    unittest.main()
