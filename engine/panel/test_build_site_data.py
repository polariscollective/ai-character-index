"""The behaviour payload: which behaviours, filed under which document, carrying
what. The database is not touched: the pure functions main() composes are."""
import importlib.util
import json
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


FILTERED = "fable's output was content-filtered on every attempt."
SWAP = [{"seat": "fable", "substitute": "opus", "reason": FILTERED}]


def row(model, document, **extra):
    return {"behaviour": "b", "locator": f"{document} > #x > ¶1", "model": model,
            "verdict": 2, "relevant": 1, "parsed": True, "rubric": "v5"} | extra


class SubstitutionTest(unittest.TestCase):
    """A cell judged with a recorded substitute is built from the substitute's
    verdicts in the seat's place, and says so. A cell without one is exactly what
    it was, down to the bytes."""

    SUBSTITUTIONS = {("b", OLD): SWAP}

    def test_the_substitute_votes_in_the_seat_s_place_on_its_cell(self):
        self.assertTrue(bs.admits(row("opus", OLD), "v5", PANEL, self.SUBSTITUTIONS))
        self.assertFalse(bs.admits(row("fable", OLD), "v5", PANEL, self.SUBSTITUTIONS))
        self.assertTrue(bs.admits(row("sol", OLD), "v5", PANEL, self.SUBSTITUTIONS))

    def test_a_substitution_reaches_no_other_cell(self):
        self.assertFalse(bs.admits(row("opus", NEW), "v5", PANEL, self.SUBSTITUTIONS))
        self.assertTrue(bs.admits(row("fable", NEW), "v5", PANEL, self.SUBSTITUTIONS))
        self.assertFalse(bs.admits(row("opus", OLD, behaviour="c"), "v5", PANEL,
                                   self.SUBSTITUTIONS))

    def test_the_rubric_and_the_parse_still_decide_first(self):
        self.assertFalse(bs.admits(row("opus", OLD, rubric="v3"), "v5", PANEL,
                                   self.SUBSTITUTIONS))
        self.assertFalse(bs.admits(row("opus", OLD, parsed=False), "v5", PANEL,
                                   self.SUBSTITUTIONS))
        self.assertTrue(bs.admits(row("sol", NEW), "v5", PANEL))

    def test_a_substitution_is_filed_under_its_own_cell_of_its_own_run(self):
        """A run can carry a substitution on a cell a publication took from another
        run. That cell was judged by the panel, and must not be read as seated."""
        versions = {"v-old": {"spec_id": "openai--model-spec", "version": "2025-12-18"},
                    "v-new": {"spec_id": "openai--model-spec", "version": "2026-08-18"}}
        cells = [{"run_id": "r1", "behaviour_slug": "b", "spec_version_id": "v-old"},
                 {"run_id": "r2", "behaviour_slug": "b", "spec_version_id": "v-new"}]
        recorded = {("r1", "b", "v-old"): SWAP, ("r1", "b", "v-new"): SWAP}
        self.assertEqual(bs.cell_substitutions(recorded, cells, versions, PANEL),
                         {("b", OLD): SWAP})

    def test_a_substitution_for_a_seat_this_panel_does_not_have_changes_nothing(self):
        """A row naming a seat outside the panel is not a substitution this
        payload's verdicts reflect -- seats() and the publication trigger both
        ignore it -- so it is dropped rather than printed as though a substitute
        had judged in a seat nobody asked."""
        versions = {"v-old": {"spec_id": "openai--model-spec", "version": "2025-12-18"}}
        cells = [{"run_id": "r1", "behaviour_slug": "b", "spec_version_id": "v-old"}]
        off_panel = [{"seat": "kimi", "substitute": "kimi-k2", "reason": "irrelevant"}]
        recorded = {("r1", "b", "v-old"): off_panel}
        substitutions = bs.cell_substitutions(recorded, cells, versions, PANEL)
        self.assertEqual(substitutions, {})

        [built] = bs.build_behaviours(BRAVO, VOTES, TEXT, [OLD, NEW], {}, PANEL, DISPLAY,
                                      substitutions)
        self.assertNotIn("substitutions", built["coverage"][OLD])
        self.assertEqual(built["coverage"][OLD]["passages"][0]["verdicts"],
                         {"deepseek": 2, "fable": 2, "sol": 2})

    def test_a_substituted_cell_carries_the_substitution_and_the_substitute_s_verdicts(self):
        votes = {("b", f"{OLD} > #x > ¶1"): {"sol": 2, "opus": 3, "deepseek": 2},
                 ("b", f"{NEW} > #x > ¶1"): {"sol": 3, "fable": 2, "deepseek": 2}}
        [built] = bs.build_behaviours(BRAVO, votes, TEXT, [OLD, NEW], {}, PANEL, DISPLAY,
                                      self.SUBSTITUTIONS)
        old = built["coverage"][OLD]
        self.assertEqual(old["substitutions"], SWAP)
        self.assertEqual(old["passages"][0]["verdicts"], {"deepseek": 2, "opus": 3, "sol": 2})
        self.assertIn("Claude Opus 4.8", old["passages"][0]["role"])
        self.assertNotIn("substitutions", built["coverage"][NEW])

    def test_a_cell_without_a_substitution_is_byte_identical(self):
        before = bs.build_behaviours(BRAVO, VOTES, TEXT, [OLD, NEW], {}, PANEL, DISPLAY)
        after = bs.build_behaviours(BRAVO, VOTES, TEXT, [OLD, NEW], {}, PANEL, DISPLAY,
                                    {("elsewhere", OLD): SWAP})
        serialise = lambda built: json.dumps(built, indent=1, ensure_ascii=False)  # noqa: E731
        self.assertEqual(serialise(after), serialise(before))
        self.assertEqual(list(after[0]["coverage"][OLD]), ["depth", "passages"])


if __name__ == "__main__":
    unittest.main()
