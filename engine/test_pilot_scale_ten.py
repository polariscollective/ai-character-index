"""The pilot, against tables in memory and a model that answers from a script.

Nothing touches a network, and nothing may write to the store: FakeStore has no
insert and no update, so a write would fail the test with AttributeError."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
# Keys stay out of it: resolve() reads a .env beside the harness unless told not to.
os.environ["PANEL_DOTENV"] = str(ROOT / "no-such.env")
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "panel"))
sys.path.insert(0, str(HERE / "spec-cite"))
sys.path.insert(0, str(ROOT / "tests" / "fixtures"))

import assessment_call           # noqa: E402
import depth_call                # noqa: E402
import index as fixture          # noqa: E402
import pilot_scale_ten as pilot  # noqa: E402


class FakeStore:
    """Tables in memory, honouring the `eq.` and `in.(...)` filters."""

    def __init__(self, **tables):
        self.tables = tables

    def select(self, table, params=None):
        rows = self.tables.get(table, [])
        for column, condition in (params or {}).items():
            operator, _, value = condition.partition(".")
            if operator == "eq":
                rows = [row for row in rows if str(row.get(column)) == value]
            elif operator == "in":
                wanted = {v.strip('"') for v in value[1:-1].split(",")}
                rows = [row for row in rows if str(row.get(column)) in wanted]
        return rows


DOC = "lab--spec@2026-01-01"
PASSAGES = [(f"{DOC} > #a > ¶1", "A", "In a conflict, safety comes first."),
            (f"{DOC} > #b > ¶1", "B", "Never lie."),
            (f"{DOC} > #b > ¶2", "B", "Keep the operator's instructions private.")]
SLUG = "defined-behaviour"
JUDGES = ("deepseek", "fable", "sol")


def store():
    return FakeStore(
        aci_publications=[{"id": "pub", "is_public": True, "published_at": "2026-09-16"}],
        aci_publication_cells=[{"publication_id": "pub", "behaviour_slug": SLUG,
                                "spec_version_id": "v", "run_id": "run"}],
        aci_spec_versions=[{"id": "v", "spec_id": "lab--spec", "version": "2026-01-01"}],
        aci_judge_calls=[{"id": f"c-{m}", "run_id": "run", "behaviour_slug": SLUG,
                          "spec_version_id": "v", "model": m, "status": "done"}
                         for m in JUDGES],
        # Every judge scores the second passage 3 and the others 0, so the second
        # passage is the only one the reader shows, and the only one retained.
        aci_judgements=[{"call_id": f"c-{m}", "locator": locator,
                         "verdict": 3 if locator == PASSAGES[1][0] else 0, "parsed": True}
                        for m in JUDGES for locator, _s, _t in PASSAGES],
        aci_depths=[{"call_id": "c-deepseek", "status": "done", "depth": 3},
                    {"call_id": "c-fable", "status": "done", "depth": 4},
                    {"call_id": "c-sol", "status": "done", "depth": 4}])


class Scripted:
    """A model that answers from a script and remembers what it was asked."""

    def __init__(self, refuse=()):
        self.asked = []
        self.refuse = set(refuse)

    def __call__(self, provider, model_id, system, user, kwargs):
        self.asked.append((model_id, system, user))
        if system == assessment_call.system_prompt("criteria"):
            if any(tag in model_id for tag in self.refuse):
                raise RuntimeError("content_filter")
            reply = ("CONFLICT_RULES: 2\nCONFLICT_RULES_PASSAGES: 1\n"
                     "CONFLICT_RULES_RATIONALE: An order, weighed.\n"
                     "RULE_FORCE: 3\nRULE_FORCE_RATIONALE: Labels.\n"
                     "REASONS: 2\nREASONS_RATIONALE: Some.\n"
                     "SITUATIONS: 1\nSITUATIONS_RATIONALE: Conversation.")
        elif system == assessment_call.system_prompt("contradictions"):
            reply = ("CONTRADICTION: [2] [3] | A user asks what the operator said. "
                     "| Honesty and privacy clash.\n"
                     "CONTRADICTIONS: 2\nCONTRADICTIONS_RATIONALE: One clash.")
        else:
            assert system == depth_call.system_prompt(10), "an unexpected prompt"
            reply = "DEPTH: 9\nRATIONALE: Demonstrated, a conflict settled, no default."
        return reply, {"prompt_tokens": 1000, "completion_tokens": 100}, "stop", 0.1


def passages_for(spec, version):
    assert (spec, version) == ("lab--spec", "2026-01-01")
    return PASSAGES


class PilotTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = pilot.h.load_config()
        cls.registry = fixture.judging_registry()

    def go(self, model, out):
        return pilot.run_pilot(store(), self.config, self.registry, passages_for, out,
                               call_model=model, go=True, documents=(DOC,),
                               behaviours=(SLUG,))

    def test_pricing_spends_nothing_and_writes_nothing(self):
        model = Scripted()
        with tempfile.TemporaryDirectory() as out:
            estimate, folder = pilot.run_pilot(store(), self.config, self.registry,
                                               passages_for, out, call_model=model,
                                               documents=(DOC,), behaviours=(SLUG,))
            self.assertIsNone(folder)
            self.assertGreater(estimate, 0)
            self.assertEqual(model.asked, [])
            self.assertEqual(list(Path(out).iterdir()), [])

    def test_every_seat_answers_both_questions_and_every_judge_gives_a_depth(self):
        model = Scripted()
        with tempfile.TemporaryDirectory() as out:
            self.go(model, out)
        systems = [system for _m, system, _u in model.asked]
        self.assertEqual(systems.count(assessment_call.system_prompt("criteria")), 3)
        self.assertEqual(systems.count(assessment_call.system_prompt("contradictions")), 3)
        self.assertEqual(systems.count(depth_call.system_prompt(10)), 3)

    def test_the_rules_are_the_passages_two_judges_cited_and_the_depth_call_carries_them(self):
        model = Scripted()
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(model, out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
        self.assertEqual(results["documents"][DOC]["conflict_rules"], [PASSAGES[0][0]])
        depth_users = [user for _m, system, user in model.asked
                       if system == depth_call.system_prompt(10)]
        for user in depth_users:
            self.assertIn("[R1] (§ A) In a conflict, safety comes first.", user)
            self.assertIn("[1] (§ B) Never lie.", user)
            self.assertNotIn("Keep the operator's instructions private.", user)

    def test_the_old_depths_are_read_beside_the_new_and_contradictions_named_by_locator(self):
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(Scripted(), out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
            self.assertTrue((folder / "summary.md").exists())
            self.assertTrue((folder / "lab--spec_2026-01-01" / "sol.criteria.reply.txt").exists())
        cell = results["documents"][DOC]["cells"][SLUG]
        self.assertEqual(cell["old"], {"deepseek": 3, "fable": 4, "sol": 4})
        self.assertEqual({tag: given["depth"] for tag, given in cell["new"].items()},
                         {"deepseek": 9, "fable": 9, "sol": 9})
        item = results["documents"][DOC]["assessment"]["sol"]["contradictions"]["items"][0]
        self.assertEqual((item["first"], item["second"]), (PASSAGES[1][0], PASSAGES[2][0]))
        self.assertEqual(results["prompts"]["depth"], depth_call.prompt_sha256(10))

    def test_a_refused_call_is_recorded_and_the_others_go_on(self):
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(Scripted(refuse=("fable",)), out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
        record = results["documents"][DOC]
        self.assertIn("content_filter", record["assessment"]["fable"]["criteria"]["error"])
        # Two seats still cited the first passage, which is the quorum.
        self.assertEqual(record["conflict_rules"], [PASSAGES[0][0]])

    def test_the_summary_has_no_long_dash(self):
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(Scripted(), out)
            text = (folder / "summary.md").read_text()
        self.assertIn("| Conflict rules | 2 | 2 | 2 |", text)
        self.assertIn("Odd values: 3 of 3 depths out of ten.", text)
        self.assertNotIn("—", text)
        self.assertNotIn("–", text)

    def test_pilot_json_records_a_model_id_for_each_assessment_call(self):
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(Scripted(), out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
        for questions in results["documents"][DOC]["assessment"].values():
            for answer in questions.values():
                self.assertIn("model_id", answer)
                self.assertIsNotNone(answer["model_id"])

    def test_an_unreadable_contradiction_is_shown_in_the_summary(self):
        def model(provider, model_id, system, user, kwargs):
            if system == assessment_call.system_prompt("contradictions"):
                reply = ("CONTRADICTION: [2] | only one passage named | why\n"
                         "CONTRADICTIONS: 3\nCONTRADICTIONS_RATIONALE: One clash missed.")
                return reply, {"prompt_tokens": 10, "completion_tokens": 10}, "stop", 0.01
            return Scripted()(provider, model_id, system, user, kwargs)
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = pilot.run_pilot(store(), self.config, self.registry,
                                                passages_for, out, call_model=model, go=True,
                                                documents=(DOC,), behaviours=(SLUG,))
            text = (folder / "summary.md").read_text()
        self.assertIn("1 unreadable", text)

    def test_a_depth_with_no_line_shows_its_finish_reason_and_counts_as_no_depth(self):
        def model(provider, model_id, system, user, kwargs):
            if system == depth_call.system_prompt(10) and "deepseek" in model_id.lower():
                return ("I cannot decide.", {"prompt_tokens": 10, "completion_tokens": 10},
                        "content_filter", 0.01)
            return Scripted()(provider, model_id, system, user, kwargs)
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = pilot.run_pilot(store(), self.config, self.registry,
                                                passages_for, out, call_model=model, go=True,
                                                documents=(DOC,), behaviours=(SLUG,))
            text = (folder / "summary.md").read_text()
        self.assertIn("content_filter", text)
        self.assertIn("1 gave no depth", text)


class ConflictRulesTest(unittest.TestCase):
    def test_a_passage_needs_the_quorum(self):
        by_seat = {"a": {"conflict_rule_passages": [1, 2]},
                   "b": {"conflict_rule_passages": [2, 3]},
                   "c": {"conflict_rule_passages": [3]}}
        self.assertEqual(pilot.conflict_rules(by_seat, PASSAGES), [PASSAGES[1], PASSAGES[2]])
        self.assertEqual(pilot.conflict_rules(by_seat, PASSAGES, quorum=3), [])


def store_with_depth_passages(value):
    """The base store, with every aci_depths row also carrying `passages: value`,
    the count its own depth was given on."""
    fake = store()
    fake.tables["aci_depths"] = [dict(row, passages=value)
                                 for row in fake.tables["aci_depths"]]
    return fake


class CellEvidenceGuardTest(unittest.TestCase):
    """The published depth was given on one retained passage (see `store()`
    above). The pilot must read the same evidence."""

    @classmethod
    def setUpClass(cls):
        cls.config = pilot.h.load_config()
        cls.registry = fixture.judging_registry()

    def test_a_mismatched_passage_count_stops_the_pilot(self):
        with tempfile.TemporaryDirectory() as out:
            with self.assertRaises(SystemExit):
                pilot.run_pilot(store_with_depth_passages(5), self.config, self.registry,
                                passages_for, out, documents=(DOC,), behaviours=(SLUG,))

    def test_a_matching_passage_count_runs_as_before(self):
        with tempfile.TemporaryDirectory() as out:
            estimate, folder = pilot.run_pilot(store_with_depth_passages(1), self.config,
                                               self.registry, passages_for, out,
                                               documents=(DOC,), behaviours=(SLUG,))
        self.assertIsNone(folder)
        self.assertGreater(estimate, 0)


if __name__ == "__main__":
    unittest.main()
