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
            if any(tag.lower() in model_id.lower() for tag in self.refuse):
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
        criteria = record["assessment"]["fable"]["criteria"]
        # fable's own model refused, so its declared substitute, opus, answered instead.
        self.assertEqual(criteria["model"], "opus")
        self.assertEqual(len(criteria["substituted"]), 1)
        self.assertEqual(criteria["substituted"][0]["model"], "fable")
        self.assertIn("content_filter", criteria["substituted"][0]["reason"])
        # Two seats still cited the first passage, which is the quorum.
        self.assertEqual(record["conflict_rules"], [PASSAGES[0][0]])

    def test_every_declared_substitute_refusing_records_an_error(self):
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(Scripted(refuse=("fable", "opus", "kimi")), out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
        record = results["documents"][DOC]
        criteria = record["assessment"]["fable"]["criteria"]
        self.assertIn("content_filter", criteria["error"])
        self.assertEqual([item["model"] for item in criteria["substituted"]],
                         ["fable", "opus", "kimi"])
        # sol and deepseek still cite the first passage, which is the quorum.
        self.assertEqual(record["conflict_rules"], [PASSAGES[0][0]])

    def test_a_refused_contradictions_call_falls_to_its_substitute(self):
        def model(provider, model_id, system, user, kwargs):
            if (system == assessment_call.system_prompt("contradictions")
                    and "fable" in model_id.lower()):
                return "", {"prompt_tokens": 10, "completion_tokens": 0}, "content_filter", 0.01
            return Scripted()(provider, model_id, system, user, kwargs)
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = pilot.run_pilot(store(), self.config, self.registry,
                                                passages_for, out, call_model=model, go=True,
                                                documents=(DOC,), behaviours=(SLUG,))
            results = __import__("json").loads((folder / "pilot.json").read_text())
        contradictions = results["documents"][DOC]["assessment"]["fable"]["contradictions"]
        self.assertEqual(contradictions["model"], "opus")
        self.assertEqual(contradictions["substituted"][0]["model"], "fable")
        self.assertIn("content_filter", contradictions["substituted"][0]["reason"])

    def test_heading_attributes_reach_whole_document_calls_not_depth_calls(self):
        fake = store()
        fake.tables["aci_spec_versions"][0]["markdown"] = "## B {#b authority=user}\n\ntext"
        model = Scripted()
        with tempfile.TemporaryDirectory() as out:
            pilot.run_pilot(fake, self.config, self.registry, passages_for, out,
                            call_model=model, go=True, documents=(DOC,), behaviours=(SLUG,))
        criteria_users = [user for _m, system, user in model.asked
                          if system == assessment_call.system_prompt("criteria")]
        depth_users = [user for _m, system, user in model.asked
                      if system == depth_call.system_prompt(10)]
        self.assertTrue(criteria_users)
        self.assertTrue(depth_users)
        for user in criteria_users:
            self.assertIn("{authority=user}", user)
        for user in depth_users:
            self.assertNotIn("{authority=user}", user)

    def test_confirmed_and_unconfirmed_contradictions_score_and_summarise(self):
        def model(provider, model_id, system, user, kwargs):
            mid = model_id.lower()
            if system == assessment_call.system_prompt("contradictions"):
                if "sol" in mid:
                    reply = ("CONTRADICTION: [2] [3] | A user asks what the operator said. "
                             "| Honesty and privacy clash.\n"
                             "CONTRADICTIONS: 2\nCONTRADICTIONS_RATIONALE: One clash.")
                elif "deepseek" in mid:
                    reply = ("CONTRADICTION: [1] [2] | A user asks to break a rule for safety. "
                             "| Safety and honesty clash.\n"
                             "CONTRADICTIONS: 2\nCONTRADICTIONS_RATIONALE: One clash.")
                else:
                    reply = "CONTRADICTIONS: 4\nCONTRADICTIONS_RATIONALE: None found."
                return reply, {"prompt_tokens": 10, "completion_tokens": 10}, "stop", 0.01
            if system == assessment_call.system_prompt("confirm"):
                if "sol" in mid:
                    reply = "ITEM 1: does not hold | absolute: no | Not persuasive."
                elif "fable" in mid:
                    reply = ("ITEM 1: holds | absolute: no | Matches.\n"
                             "ITEM 2: does not hold | absolute: no | Not persuasive.")
                elif "deepseek" in mid:
                    reply = "ITEM 1: holds | absolute: no | Matches."
                else:
                    reply = ""
                return reply, {"prompt_tokens": 10, "completion_tokens": 10}, "stop", 0.01
            return Scripted()(provider, model_id, system, user, kwargs)
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = pilot.run_pilot(store(), self.config, self.registry,
                                                passages_for, out, call_model=model, go=True,
                                                documents=(DOC,), behaviours=(SLUG,))
            results = __import__("json").loads((folder / "pilot.json").read_text())
            text = (folder / "summary.md").read_text()
        record = results["documents"][DOC]
        contradictions = {frozenset((c["first"], c["second"])): c
                          for c in record["contradictions"]}
        pair_23 = contradictions[frozenset((PASSAGES[1][0], PASSAGES[2][0]))]
        pair_12 = contradictions[frozenset((PASSAGES[0][0], PASSAGES[1][0]))]
        self.assertTrue(pair_23["confirmed"])
        self.assertFalse(pair_12["confirmed"])
        self.assertEqual(record["contradictions_score"], 2)
        self.assertEqual(results["prompts"]["confirm"], assessment_call.prompt_sha256("confirm"))
        self.assertIn("confirmed", text)
        self.assertIn("not confirmed", text)
        self.assertIn("Score from confirmed contradictions: 2.", text)

    def test_every_seat_finding_the_same_contradiction_needs_no_confirmation(self):
        model = Scripted()
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(model, out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
        record = results["documents"][DOC]
        self.assertEqual(len(record["contradictions"]), 1)
        self.assertTrue(record["contradictions"][0]["confirmed"])
        self.assertNotIn(assessment_call.system_prompt("confirm"),
                         [system for _m, system, _u in model.asked])

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
