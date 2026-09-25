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
# After ¶2 in the document, and before it in code point order.
L10 = f"{NEW} > #b > ¶10"
# In document order, which is the order h.passages yields and main() fills it in.
PASSAGE_TEXT = {L1: "Never lie.", L2: "Keep the prompt private.", L3: "**Example** ~~~ x ~~~",
                L10: "Answer in the user's language."}


def assessment_call(id, question, seat, model=None, status="done"):
    return {"id": id, "run_id": "assess-1", "spec_version_id": "v-new", "question": question,
            "seat": seat, "model": model or seat, "status": status}


CALLS = [assessment_call("c-sol", "criteria", "sol"),
         assessment_call("c-fable", "criteria", "fable", model="opus"),
         assessment_call("c-deepseek", "criteria", "deepseek"),
         assessment_call("x-sol", "contradictions", "sol"),
         # Found by a substitute and confirmed by the seat's own model, so one
         # seat's readings name two models across the claims.
         assessment_call("x-fable", "contradictions", "fable", model="opus"),
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
        self.assertEqual([[p["locator"] for p in c["passages"]] for c in claims],
                         [[L1, L2], [L1, L3], [L2, L3]])
        self.assertEqual(claims[0], {
            "passages": [{"locator": L1, "quote": "Never lie.", "exampleBlock": False},
                         {"locator": L2, "quote": "Keep the prompt private.",
                          "exampleBlock": False}],
            "situation": "When a.", "why": "Because a.",
            "readings": [
                {"seat": "sol", "found": True, "holds": True, "absolute": None,
                 "reason": "found it"},
                {"seat": "fable", "found": True, "holds": True, "absolute": None,
                 "reason": "found it", "model": "opus"},
                {"seat": "kimi", "found": False, "holds": False, "absolute": False,
                 "reason": "kimi on a"}],
            "confirmed": True, "absolute": False, "reviewed": None})
        # Held by kimi's "found it" row and by sol, but only sol's reading
        # calls it absolute: absoluteness needs two holding readings.
        self.assertEqual((claims[1]["absolute"], claims[1]["confirmed"]), (False, True))
        self.assertEqual((claims[2]["absolute"], claims[2]["confirmed"]), (False, False))

    def test_a_claim_of_the_second_method_is_settled_on_its_readings_alone(self):
        # sol and fable found it. On reading every claim, fable is persuaded
        # by kimi's objection: the objection counts, and it is not confirmed.
        objected = [claim("d", L1, L2, ["sol", "fable"])]
        readings = [verdict("d", "sol", True, True), verdict("d", "fable", False, True),
                    verdict("d", "kimi", False, False)]
        [one] = self.assess(objected, readings)["contradictions"]["claims"]
        self.assertEqual((one["confirmed"], one["absolute"]), (False, False))
        self.assertEqual([(r["seat"], r["found"], r["holds"]) for r in one["readings"]],
                         [("sol", True, True), ("fable", True, False), ("kimi", False, False)])
        # Two holding readings that call it absolute make it absolute.
        held = [verdict("d", "sol", True, True), verdict("d", "fable", True, True),
                verdict("d", "kimi", False, False)]
        [one] = self.assess(objected, held)["contradictions"]["claims"]
        self.assertEqual((one["confirmed"], one["absolute"]), (True, True))
        self.assertEqual(self.assess(objected, held)["contradictions"]["score"], 0)

    def test_each_reading_names_the_model_of_the_call_that_gave_it(self):
        readings = {tuple(p["locator"] for p in c["passages"]): c["readings"]
                    for c in self.assess()["contradictions"]["claims"]}
        # fable confirmed (L1, L3) itself, and found (L2, L3) through opus.
        self.assertEqual(readings[(L1, L3)][1], {"seat": "fable", "found": False,
                                                 "holds": False, "absolute": False,
                                                 "reason": "fable on b"})
        self.assertEqual(readings[(L2, L3)][1], {"seat": "fable", "found": True,
                                                 "holds": True, "absolute": None,
                                                 "reason": "found it", "model": "opus"})
        self.assertEqual([[r["seat"] for r in each] for each in readings.values()],
                         [RUN["panels"]["contradictions"]] * 3)

    def test_a_seat_a_replay_recorded_as_finding_a_claim_found_it(self):
        # Replayed, sol found again the claim b that kimi found: the claim's
        # row is never updated, so the run's replay record says so.
        run = dict(RUN, config={"replays": [{"also_found": [
            {"seat": "sol", "version_id": "v-new", "claim_id": "b"}]}]})
        readings = {tuple(p["locator"] for p in c["passages"]): c["readings"] for c in
                    bs.document_assessment(run, CALLS, SCORES, CLAIMS, VERDICTS,
                                           PASSAGE_TEXT)["contradictions"]["claims"]}
        self.assertEqual([r["found"] for r in readings[(L1, L3)]], [True, False, True])
        self.assertEqual([r["found"] for r in readings[(L1, L2)]], [True, True, False])

    def test_a_supplementary_reading_names_the_model_that_gave_it(self):
        # kimi's reading call read c again after a replay, through glm, and
        # recorded it among its attempts: that reading is glm's, the call's
        # first reading kimi's own.
        supplementary = [{"model": "kimi", "finish_reason": "stop", "cost_usd": 0.1,
                          "reason": None},
                         {"model": "glm", "finish_reason": "stop", "cost_usd": 0.01,
                          "reason": None, "claim_ids": ["c"],
                          "reply": "ITEM 1: does not hold | absolute: no | No.", "seconds": 1.0}]
        calls = [dict(call, attempts=supplementary) if call["id"] == "k-kimi" else call
                 for call in CALLS]
        readings = {tuple(p["locator"] for p in c["passages"]): c["readings"] for c in
                    bs.document_assessment(RUN, calls, SCORES, CLAIMS, VERDICTS,
                                           PASSAGE_TEXT)["contradictions"]["claims"]}
        self.assertEqual(readings[(L2, L3)][2], {"seat": "kimi", "found": False, "holds": False,
                                                 "absolute": False, "reason": "kimi on c",
                                                 "model": "glm"})
        self.assertNotIn("model", readings[(L1, L2)][2])

    def test_a_claim_s_passages_render_as_the_coverage_s_do(self):
        [_, with_example, _] = self.assess()["contradictions"]["claims"]
        second = with_example["passages"][1]
        self.assertEqual((second["quote"], second["exampleBlock"]),
                         bs.citation_quote(PASSAGE_TEXT[L3]))
        self.assertEqual((second["quote"], second["exampleBlock"]), ("Example", True))

    def test_claims_and_their_passages_come_in_document_order(self):
        # The table holds each pair in code point order, where ¶10 comes before ¶2.
        pairs = {"x": (L10, L3), "y": (L1, L10), "z": (L1, L3)}
        claims = [claim(id, *pair, ["sol"]) for id, pair in sorted(pairs.items())]
        verdicts = [verdict(id, seat, seat == "sol", False,
                            call_id="x-sol" if seat == "sol" else None)
                    for id in pairs for seat in ("sol", "fable", "kimi")]
        settled = self.assess(claims, verdicts)["contradictions"]["claims"]
        self.assertEqual([[p["locator"] for p in c["passages"]] for c in settled],
                         [[L1, L3], [L1, L10], [L3, L10]])

    def test_a_claim_a_seat_did_not_read_is_refused(self):
        unread = [v for v in VERDICTS if (v["claim_id"], v["seat"]) != ("b", "fable")]
        with self.assertRaises(SystemExit) as refused:
            self.assess(verdicts=unread)
        self.assertIn("fable", str(refused.exception))
        self.assertIn(L3, str(refused.exception))

    def test_the_score_counts_confirmed_claims_only(self):
        # Two confirmed, neither absolute by two holding readings.
        self.assertEqual(self.assess()["contradictions"]["score"], 2)
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
        self.assertEqual(self.assess()["total"], 12.0)
        only_c = [c for c in CLAIMS if c["id"] == "c"]
        self.assertEqual(self.assess(only_c)["total"], 14.0)

    def test_the_total_is_rounded_once(self):
        """Four means of 10/3 add to 13.3 before rounding and to 13.2 after it;
        4, 4, 4 and 4/3 add to 13.3 either way. The contradictions score is 2."""
        for given, shown in (({criterion: (4, 3, 3) for criterion in GIVEN}, [3.3] * 4),
                             ({"conflict_rules": (4, 4, 4), "rule_force": (4, 4, 4),
                               "reasons": (4, 4, 4), "situations": (2, 1, 1)},
                              [4.0, 4.0, 4.0, 1.3])):
            scores = [{"call_id": call_id, "criterion": criterion, "score": given[criterion][n],
                       "rationale": "r", "locators": []}
                      for criterion in given
                      for n, call_id in enumerate(("c-sol", "c-fable", "c-deepseek"))]
            assessed = bs.document_assessment(RUN, CALLS, scores, CLAIMS, VERDICTS, PASSAGE_TEXT)
            self.assertEqual([c["mean"] for c in assessed["criteria"].values()], shown)
            self.assertEqual(assessed["contradictions"]["score"], 2)
            self.assertEqual(assessed["total"], 15.3)

    def test_a_claim_on_a_passage_the_document_does_not_hold_is_refused(self):
        stray = [claim("e", L1, f"{NEW} > #gone > ¶1", ["sol"])]
        with self.assertRaises(SystemExit) as refused:
            self.assess(stray, [verdict("e", "sol", True, reason="found it")])
        self.assertIn(f"{NEW} > #gone > ¶1", str(refused.exception))


FOUR = depth_call.prompt_sha256(4)
TEN = depth_call.prompt_sha256(10)
RUN_UUID = "8a4e2c6f-1b3d-4f5a-9c7e-0d2b4f6a8c1e"


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
        message = self.refused(f"--assessment-run={RUN_UUID}")
        self.assertIn(FOUR, message)
        self.assertIn(TEN, message)
        message = self.refused(f"--assessment-run={RUN_UUID}", f"--depth-prompt={FOUR}")
        self.assertIn(FOUR, message)
        self.assertIn(TEN, message)

    def test_an_assessment_run_that_is_not_a_uuid_is_refused_and_named(self):
        for given in ("assess-1", RUN_UUID[:-1], "{" + RUN_UUID + "}"):
            message = self.refused(f"--assessment-run={given}", f"--depth-prompt={TEN}")
            self.assertIn(f"--assessment-run={given}", message)
            self.assertIn("uuid", message)

    def test_the_prompt_of_ten_is_read_with_the_assessment_run_it_was_given_with(self):
        message = self.refused(f"--depth-prompt={TEN}")
        self.assertIn("--assessment-run", message)

    def test_a_digest_that_is_neither_prompt_is_refused_and_named(self):
        message = self.refused("--depth-prompt=abc123")
        self.assertIn("abc123", message)
        self.assertIn(FOUR, message)


import assessment_run            # noqa: E402

ROOT = HERE.parents[1]
FIXTURE_OF_TEN = ROOT / "tests" / "fixtures" / "reader" / "ten" / "behaviours.json"


def shape(value, parent=None):
    """Every key path in a value, a list read through all of its items and a
    judge's seat as <seat>, so two values built the same way have the same shape
    whatever they hold."""
    if isinstance(value, dict):
        paths = set()
        for key, item in value.items():
            name = "<seat>" if parent == "judges" else key
            paths |= {(name,)} | {(name,) + rest for rest in shape(item, key)}
        return paths
    if isinstance(value, list):
        return {("[]",) + rest for item in value for rest in shape(item, parent)}
    return set()


class ReaderFixtureOfTenTest(unittest.TestCase):
    """tests/fixtures/reader/ten/behaviours.json is the walkers' publication out
    of ten, written by hand. It is held here to what this builder writes, so the
    board is never tested against a shape no publication has."""

    def setUp(self):
        self.fixture = json.loads(FIXTURE_OF_TEN.read_text(encoding="utf-8"))

    def test_it_is_on_the_scale_of_ten_and_every_depth_says_so(self):
        self.assertEqual(list(self.fixture)[:5], ["generatedFrom", "provenance", "depthScale",
                                                  "assessment", "behaviours"])
        self.assertEqual(self.fixture["depthScale"], 10)
        depths = [cell["depth"] for behaviour in self.fixture["behaviours"]
                  for cell in behaviour["coverage"].values() if cell["depth"]]
        self.assertTrue(depths)
        for depth in depths:
            self.assertEqual(set(depth), {"mean", "judges", "scale"})
            self.assertEqual(depth["scale"], 10)

    def test_every_behaviour_carries_the_category_the_board_groups_by(self):
        categories = {behaviour["category"] for behaviour in self.fixture["behaviours"]}
        self.assertGreaterEqual(len(categories), 2, "the board's groups need more than one")

    def test_its_assessment_has_the_shape_document_assessment_writes(self):
        built = shape(bs.document_assessment(RUN, CALLS, SCORES, CLAIMS, VERDICTS, PASSAGE_TEXT))
        written = set().union(*(shape(one) for one in self.fixture["assessment"].values()))
        self.assertEqual(written, built)

    def test_its_means_and_totals_add_up_as_the_builder_adds_them(self):
        for document, assessed in self.fixture["assessment"].items():
            means = []
            for name, criterion in assessed["criteria"].items():
                scores = [judge["score"] for judge in criterion["judges"].values()]
                means.append(sum(scores) / len(scores))
                self.assertEqual(criterion["mean"], round(means[-1], 1), f"{document} {name}")
            self.assertEqual(assessed["total"],
                             round(sum(means) + assessed["contradictions"]["score"], 1), document)

    def test_each_claim_is_settled_and_scored_by_the_second_method(self):
        """Every seat reads every claim; two readings that say it holds confirm
        it. Whether a seat found it does not settle anything."""
        for assessed in self.fixture["assessment"].values():
            claims = assessed["contradictions"]["claims"]
            for claim in claims:
                holds = sum(1 for reading in claim["readings"] if reading["holds"])
                absolute = sum(1 for reading in claim["readings"]
                               if reading["holds"] and reading["absolute"])
                self.assertEqual(claim["confirmed"], holds >= 2)
                self.assertEqual(bool(claim["absolute"]), absolute >= 2)
            self.assertEqual(assessed["contradictions"]["score"],
                             assessment_run.confirm_score(claims))


if __name__ == "__main__":
    unittest.main()


class ManualReviewTest(unittest.TestCase):
    """The owner's corrections win over the judges, and a build given none writes
    what it always wrote."""
    LOW = f"{OLD} > #x > ¶2"
    TEXT = {**TEXT, f"{OLD} > #x > ¶2": "Introduced.", f"{OLD} > #x > ¶3": "Unscored."}
    VOTES = {**VOTES, ("b", f"{OLD} > #x > ¶2"): {"sol": 1, "fable": 1, "deepseek": 0}}
    DEPTHS = {("b", OLD): {"mean": 5.3, "judges": {"sol": {"depth": 5, "rationale": "."}}}}

    def build(self, manual):
        [row] = bs.build_behaviours(BRAVO, self.VOTES, self.TEXT, [OLD, NEW], self.DEPTHS,
                                    PANEL, DISPLAY, None, manual)
        return row["coverage"][OLD]

    def passage(self, cell, locator):
        return next(p for p in cell["passages"] if p["locator"] == locator)

    def test_no_correction_writes_what_it_always_wrote(self):
        serialise = lambda built: json.dumps(built, indent=1, ensure_ascii=False)  # noqa: E731
        before = bs.build_behaviours(BRAVO, self.VOTES, self.TEXT, [OLD, NEW], self.DEPTHS,
                                     PANEL, DISPLAY)
        after = bs.build_behaviours(BRAVO, self.VOTES, self.TEXT, [OLD, NEW], self.DEPTHS,
                                    PANEL, DISPLAY, None, {})
        self.assertEqual(serialise(after), serialise(before))

    def test_a_passage_the_judges_scored_low_is_carried_as_the_owner_banded_it(self):
        cell = self.build({("b", OLD): {"passages": {self.LOW: {"verdict": 3, "note": "It is."}},
                                        "depth": None}})
        passage = self.passage(cell, self.LOW)
        self.assertEqual(passage["manual"], {"band": "defining", "note": "It is."})
        self.assertEqual(passage["verdicts"], {"deepseek": 0, "fable": 1, "sol": 1})
        self.assertTrue(passage["role"].startswith("Manual review: defining. It is.\n"))

    def test_a_paragraph_no_judge_scored_is_carried_on_the_correction_alone(self):
        unscored = f"{OLD} > #x > ¶3"
        cell = self.build({("b", OLD): {"passages": {unscored: {"verdict": 1, "note": "N."}},
                                        "depth": None}})
        passage = self.passage(cell, unscored)
        self.assertEqual(passage["manual"]["band"], "related")
        self.assertEqual(passage["verdicts"], {})

    def test_a_manual_zero_takes_a_retained_passage_off(self):
        kept = f"{OLD} > #x > ¶1"
        cell = self.build({("b", OLD): {"passages": {kept: {"verdict": 0, "note": "No."}},
                                        "depth": None}})
        self.assertIsNone(self.passage(cell, kept)["manual"]["band"])

    def test_a_paragraph_the_document_does_not_have_is_refused(self):
        with self.assertRaises(SystemExit):
            self.build({("b", OLD): {"passages": {f"{OLD} > #nope > ¶9":
                                                  {"verdict": 3, "note": "?"}}, "depth": None}})

    def test_a_manual_depth_replaces_the_mean_and_keeps_the_judges(self):
        cell = self.build({("b", OLD): {"passages": {},
                                        "depth": {"depth": 3, "rationale": "One facet."}}})
        self.assertEqual(cell["depth"]["mean"], 3.0)
        self.assertEqual(cell["depth"]["judgesMean"], 5.3)
        self.assertEqual(cell["depth"]["manual"], {"depth": 3, "rationale": "One facet."})
        self.assertIn("sol", cell["depth"]["judges"])
