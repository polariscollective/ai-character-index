"""The behaviour payload: which behaviours, filed under which document, carrying
what. The database is not touched: the pure functions main() composes are."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("build_site_data", HERE / "build_site_data.py")
bs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bs)
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import depth_call                 # noqa: E402
import store as store_module      # noqa: E402

REGISTRY = {
    "b": {"name": "Bravo", "group": "G1", "definition": "d"},
    "a": {"name": "Alpha", "group": "G2", "definition": "d"},
    "c": {"name": "Charlie", "group": "G1", "definition": "d"},
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
    def test_every_selected_behaviour_is_displayed_ordered_by_group_then_name(self):
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


RUN = {"id": "assess-1",
       "panels": {"criteria": ["sol", "fable", "deepseek"],
                  "contradictions": ["sol", "fable", "kimi"]}}
L1, L2, L3 = (f"{NEW} > #a > ¶1", f"{NEW} > #b > ¶1", f"{NEW} > #b > ¶2")
PASSAGE_TEXT = {L1: "Never lie.", L2: "Keep the prompt private.", L3: "**Example** ~~~ x ~~~"}


def assessment_call(id, question, seat, model=None, status="done"):
    return {"id": id, "run_id": "assess-1", "spec_version_id": "v-new", "question": question,
            "seat": seat, "model": model or seat, "status": status}


CALLS = [assessment_call("c-sol", "criteria", "sol"),
         assessment_call("c-fable", "criteria", "fable", model="opus"),
         assessment_call("c-deepseek", "criteria", "deepseek"),
         assessment_call("x-sol", "contradictions", "sol"),
         assessment_call("x-fable", "contradictions", "fable"),
         assessment_call("x-kimi", "contradictions", "kimi"),
         assessment_call("k-sol", "confirm", "sol"),
         assessment_call("k-fable", "confirm", "fable"),
         assessment_call("k-kimi", "confirm", "kimi")]
GIVEN = {"conflict_rules": (4, 3, 2), "rule_force": (3, 3, 4), "reasons": (2, 2, 2),
         "situations": (1, 2, 2)}
SCORES = ([{"call_id": call_id, "criterion": criterion, "score": scores[n],
            "rationale": None if (criterion, call_id) == ("reasons", "c-sol")
            else f"{call_id} {criterion}", "locators": []}
           for criterion, scores in GIVEN.items()
           for n, call_id in enumerate(("c-sol", "c-fable", "c-deepseek"))]
          # A judge's own contradictions score is not one of the four criteria.
          + [{"call_id": "x-sol", "criterion": "contradictions", "score": 4,
              "rationale": "none", "locators": []}])


def claim(id, first, second, found_by):
    return {"id": id, "run_id": "assess-1", "spec_version_id": "v-new", "first_locator": first,
            "second_locator": second, "situation": f"When {id}.", "why": f"Because {id}.",
            "found_by": found_by, "reviewed_verdict": None, "reviewed_by": None,
            "reviewed_at": None}


def verdict(claim_id, seat, holds, absolute=None, reason=None, call_id=None):
    return {"claim_id": claim_id, "call_id": call_id or f"k-{seat}", "seat": seat,
            "holds": holds, "absolute": absolute, "reason": reason or f"{seat} on {claim_id}"}


# Listed out of locator order, so the order they come back in is the builder's.
CLAIMS = [claim("c", L2, L3, ["fable"]), claim("a", L1, L2, ["sol", "fable"]),
          claim("b", L1, L3, ["kimi"])]
VERDICTS = [
    # Finders are written as holding, with the reason "found it".
    verdict("a", "sol", True, reason="found it", call_id="x-sol"),
    verdict("a", "fable", True, reason="found it", call_id="x-fable"),
    verdict("a", "kimi", False, False),
    verdict("b", "kimi", True, reason="found it", call_id="x-kimi"),
    verdict("b", "sol", True, True),
    verdict("b", "fable", False, False),
    verdict("c", "fable", True, reason="found it", call_id="x-fable"),
    verdict("c", "sol", False, False),
    verdict("c", "kimi", False, False),
]


class DocumentAssessmentTest(unittest.TestCase):
    """One document's assessment as the payload carries it, from the rows of one
    assessment run. The rules are assessment_run's: this only reads rows into
    them."""

    def assess(self, claims=CLAIMS, verdicts=VERDICTS):
        return bs.document_assessment(RUN, CALLS, SCORES, claims, verdicts, PASSAGE_TEXT)

    def test_each_criterion_carries_every_judge_and_their_mean(self):
        criteria = self.assess()["criteria"]
        self.assertEqual(list(criteria), ["conflict_rules", "rule_force", "reasons", "situations"])
        self.assertEqual([criteria[c]["mean"] for c in criteria], [3.0, 3.3, 2.0, 1.7])
        self.assertEqual(criteria["conflict_rules"]["judges"], {
            "deepseek": {"score": 2, "rationale": "c-deepseek conflict_rules"},
            "fable": {"score": 3, "rationale": "c-fable conflict_rules", "model": "opus"},
            "sol": {"score": 4, "rationale": "c-sol conflict_rules"}})

    def test_a_rationale_that_never_arrived_stays_absent_rather_than_blank(self):
        self.assertIsNone(self.assess()["criteria"]["reasons"]["judges"]["sol"]["rationale"])

    def test_the_claims_come_settled_by_the_run_s_own_rule(self):
        claims = self.assess()["contradictions"]["claims"]
        self.assertEqual([(c["first"], c["second"]) for c in claims], [(L1, L2), (L1, L3), (L2, L3)])
        self.assertEqual(claims[0], {
            "first": L1, "second": L2, "situation": "When a.", "why": "Because a.",
            "foundBy": ["sol", "fable"], "holds": [], "doesNotHold": ["kimi"],
            "absolute": False, "confirmed": True, "reviewed": None,
            "firstText": "Never lie.", "secondText": "Keep the prompt private."})
        self.assertEqual((claims[1]["foundBy"], claims[1]["holds"], claims[1]["doesNotHold"],
                          claims[1]["absolute"], claims[1]["confirmed"]),
                         (["kimi"], ["sol"], ["fable"], True, True))
        self.assertEqual((claims[2]["holds"], claims[2]["doesNotHold"], claims[2]["confirmed"]),
                         ([], ["sol", "kimi"], False))
        self.assertEqual(claims[2]["secondText"], "**Example** ~~~ x ~~~")

    def test_the_score_counts_confirmed_claims_only(self):
        # Two confirmed, one of them absolute.
        self.assertEqual(self.assess()["contradictions"]["score"], 0)
        # One confirmed, not absolute.
        only_a = [c for c in CLAIMS if c["id"] == "a"]
        self.assertEqual(self.assess(only_a)["contradictions"]["score"], 2)
        # One found, rejected by both other readers.
        only_c = [c for c in CLAIMS if c["id"] == "c"]
        self.assertEqual(self.assess(only_c)["contradictions"]["score"], 4)
        self.assertEqual(self.assess([], [])["contradictions"], {"claims": [], "score": 4})

    def test_a_claim_every_seat_found_was_never_asked_whether_it_is_absolute(self):
        everyone = [claim("d", L1, L2, ["sol", "fable", "kimi"])]
        found = [verdict("d", seat, True, reason="found it", call_id=f"x-{seat}")
                 for seat in ("sol", "fable", "kimi")]
        [settled] = self.assess(everyone, found)["contradictions"]["claims"]
        self.assertIsNone(settled["absolute"])
        self.assertTrue(settled["confirmed"])

    def test_the_total_is_the_four_means_and_the_contradictions_score(self):
        self.assertEqual(self.assess()["total"], 10.0)
        only_c = [c for c in CLAIMS if c["id"] == "c"]
        self.assertEqual(self.assess(only_c)["total"], 14.0)

    def test_a_claim_on_a_passage_the_document_does_not_hold_is_refused(self):
        stray = [claim("e", L1, f"{NEW} > #gone > ¶1", ["sol"])]
        with self.assertRaises(SystemExit) as refused:
            self.assess(stray, [verdict("e", "sol", True, reason="found it")])
        self.assertIn(f"{NEW} > #gone > ¶1", str(refused.exception))


FOUR = depth_call.prompt_sha256(4)
TEN = depth_call.prompt_sha256(10)


class DepthPromptTest(unittest.TestCase):
    """The flags are checked before the store is opened: a build that would
    read the wrong scale is refused before it reads anything."""

    def refused(self, *flags):
        with mock.patch.object(store_module.Store, "from_env",
                               side_effect=AssertionError("the store was opened")), \
             self.assertRaises(SystemExit) as refused:
            bs.main(["--out=unused.json", *flags])
        return str(refused.exception)

    def test_an_assessment_run_reads_the_prompt_of_ten_and_nothing_else(self):
        message = self.refused("--assessment-run=assess-1")
        self.assertIn(FOUR, message)
        self.assertIn(TEN, message)
        message = self.refused("--assessment-run=assess-1", f"--depth-prompt={FOUR}")
        self.assertIn(FOUR, message)
        self.assertIn(TEN, message)

    def test_the_prompt_of_ten_is_read_with_the_assessment_run_it_was_given_with(self):
        message = self.refused(f"--depth-prompt={TEN}")
        self.assertIn("--assessment-run", message)

    def test_a_digest_that_is_neither_prompt_is_refused_and_named(self):
        message = self.refused("--depth-prompt=abc123")
        self.assertIn("abc123", message)
        self.assertIn(FOUR, message)


if __name__ == "__main__":
    unittest.main()
