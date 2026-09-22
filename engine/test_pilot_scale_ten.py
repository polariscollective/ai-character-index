"""The pilot, against tables in memory and a model that answers from a script.

Nothing touches a network, and nothing may write to the store: FakeStore has no
insert and no update, so a write would fail the test with AttributeError."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

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
    """A model that answers from a script and remembers what it was asked.

    `depth_script` maps a tag to a list of depth replies for calls whose
    model id names that tag, taken in order; once a tag's list runs out, or
    for a tag not scripted at all, its depth calls get the default answer."""

    def __init__(self, refuse=(), depth_script=None):
        self.asked = []
        self.refuse = set(refuse)
        self.depth_script = {tag: list(replies) for tag, replies in (depth_script or {}).items()}

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
            for tag, replies in self.depth_script.items():
                if tag.lower() in model_id.lower() and replies:
                    reply = replies.pop(0)
                    break
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

    def test_the_confirmation_price_includes_the_whole_document(self):
        """A confirmation call carries the whole document, as compose_confirm
        opens with it, so its price must too."""
        calls = []
        real_priced = pilot.priced

        def spy(tag, system, user, output_tokens, config):
            calls.append((tag, system, user, output_tokens))
            return real_priced(tag, system, user, output_tokens, config)

        with tempfile.TemporaryDirectory() as out, mock.patch.object(pilot, "priced", spy):
            estimate, folder = pilot.run_pilot(store(), self.config, self.registry,
                                               passages_for, out, documents=(DOC,),
                                               behaviours=(SLUG,))
        self.assertIsNone(folder)
        self.assertGreater(estimate, 0)
        confirm_system = assessment_call.system_prompt("confirm")
        _system, confirm_user = assessment_call.compose_confirm(PASSAGES, [])
        expected_user = confirm_user + "x" * pilot.CONFIRM_CLAIMS_CHARS
        confirm_calls = [call for call in calls if call[1] == confirm_system]
        seats = self.config["panels"][pilot.PANEL]
        self.assertEqual(len(confirm_calls), len(seats))
        for _tag, _system, user, output_tokens in confirm_calls:
            self.assertEqual(user, expected_user)
            self.assertEqual(output_tokens, pilot.CONFIRM_OUTPUT_TOKENS)

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
            _estimate, folder = self.go(Scripted(refuse=("fable", "opus", "kimi", "glm")), out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
        record = results["documents"][DOC]
        criteria = record["assessment"]["fable"]["criteria"]
        self.assertIn("content_filter", criteria["error"])
        self.assertEqual([item["model"] for item in criteria["substituted"]],
                         ["fable", "opus", "kimi", "glm"])
        # sol and deepseek still cite the first passage, which is the quorum.
        self.assertEqual(record["conflict_rules"], [PASSAGES[0][0]])

    def test_a_content_filtered_attempts_cost_and_reply_are_kept(self):
        def model(provider, model_id, system, user, kwargs):
            if (system == assessment_call.system_prompt("criteria")
                    and "fable" in model_id.lower()):
                return ("filtered partial reply",
                        {"prompt_tokens": 500, "completion_tokens": 50},
                        "content_filter", 0.01)
            return Scripted()(provider, model_id, system, user, kwargs)
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = pilot.run_pilot(store(), self.config, self.registry,
                                                passages_for, out, call_model=model, go=True,
                                                documents=(DOC,), behaviours=(SLUG,))
            results = __import__("json").loads((folder / "pilot.json").read_text())
            refused_reply = folder / "lab--spec_2026-01-01" / "fable.criteria.fable.refused.txt"
            self.assertEqual(refused_reply.read_text(), "filtered partial reply")
        criteria = results["documents"][DOC]["assessment"]["fable"]["criteria"]
        attempt = criteria["substituted"][0]
        self.assertEqual(attempt["model"], "fable")
        self.assertEqual(attempt["finish_reason"], "content_filter")
        self.assertIsNotNone(attempt["model_id"])
        self.assertIsNotNone(attempt["cost_usd"])
        self.assertGreater(attempt["cost_usd"], 0)
        self.assertIn(attempt["cost_usd"], list(pilot._costs(results)))
        self.assertGreaterEqual(results["cost_usd"], attempt["cost_usd"])

    def test_every_attempt_of_an_all_failed_seat_counts_its_cost(self):
        def model(provider, model_id, system, user, kwargs):
            mid = model_id.lower()
            if system == assessment_call.system_prompt("criteria") and (
                    "fable" in mid or "opus" in mid or "kimi" in mid or "glm" in mid):
                return ("no", {"prompt_tokens": 20, "completion_tokens": 5},
                        "content_filter", 0.01)
            return Scripted()(provider, model_id, system, user, kwargs)
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = pilot.run_pilot(store(), self.config, self.registry,
                                                passages_for, out, call_model=model, go=True,
                                                documents=(DOC,), behaviours=(SLUG,))
            results = __import__("json").loads((folder / "pilot.json").read_text())
        criteria = results["documents"][DOC]["assessment"]["fable"]["criteria"]
        self.assertIn("error", criteria)
        self.assertEqual(len(criteria["substituted"]), 4)
        attempt_costs = [item["cost_usd"] for item in criteria["substituted"]]
        self.assertTrue(all(cost is not None and cost > 0 for cost in attempt_costs))
        self.assertGreaterEqual(round(results["cost_usd"], 6), round(sum(attempt_costs), 6))

    def test_a_raised_refusal_records_no_cost_for_that_attempt(self):
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(Scripted(refuse=("fable",)), out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
        attempt = results["documents"][DOC]["assessment"]["fable"]["criteria"]["substituted"][0]
        self.assertIsNone(attempt["cost_usd"])
        self.assertIsNone(attempt["finish_reason"])
        self.assertIsNone(attempt["model_id"])

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
            text = (folder / "summary.md").read_text()
        contradictions = results["documents"][DOC]["assessment"]["fable"]["contradictions"]
        self.assertEqual(contradictions["model"], "opus")
        self.assertEqual(contradictions["substituted"][0]["model"], "fable")
        self.assertIn("content_filter", contradictions["substituted"][0]["reason"])
        # Every seat found the same pair, so the substituted seat is named
        # beside its substitute.
        self.assertIn("Found by sol, fable (opus), deepseek.", text)

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
        sol_confirm_users = []

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
                    sol_confirm_users.append(user)
                    reply = "ITEM 1: does not hold | absolute: no | Not persuasive."
                    return reply, {"prompt_tokens": 10, "completion_tokens": 10}, "stop", 0.01
                if "fable" in mid:
                    # fable's own model answers empty; its declared substitute,
                    # opus, answers in its place.
                    return "", {"prompt_tokens": 10, "completion_tokens": 0}, "stop", 0.01
                if "opus" in mid:
                    reply = ("ITEM 1: holds | absolute: no | Matches.\n"
                             "ITEM 2: does not hold | absolute: no | Not persuasive.")
                    return reply, {"prompt_tokens": 10, "completion_tokens": 10}, "stop", 0.01
                if "deepseek" in mid:
                    reply = "ITEM 1: holds | absolute: no | Matches."
                    return reply, {"prompt_tokens": 10, "completion_tokens": 10}, "stop", 0.01
                return "", {"prompt_tokens": 10, "completion_tokens": 10}, "stop", 0.01
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
        # fable and deepseek both confirmed the pair sol found, in the order
        # the panel asks them (sol itself is never asked, having found it):
        # the pilot's finders are readings that hold, as a stored run's "found
        # it" rows are, since settle counts readings alone.
        self.assertEqual(pair_23["holds"], ["sol", "fable", "deepseek"])
        self.assertEqual(pair_23["reasons"]["sol"], "found it")
        self.assertIn("Found by sol. Held by fable (opus) (Matches.), deepseek (Matches.).",
                      text)
        # Every confirmer of the pair deepseek found (sol and fable, in that
        # order) rejected it.
        self.assertEqual(pair_12["does_not_hold"], ["sol", "fable"])
        self.assertEqual(record["contradictions_score"], 2)
        self.assertEqual(results["prompts"]["confirm"], assessment_call.prompt_sha256("confirm"))
        # An exact marker, so the assertion cannot pass on "not confirmed" alone.
        self.assertIn(": confirmed.", text)
        self.assertIn("not confirmed", text)
        self.assertIn("Score from confirmed contradictions: 2.", text)
        # fable's confirmation was substituted, and the summary says so.
        self.assertIn("fable (opus)", text)
        fable_confirm = record["assessment"]["fable"]["confirm"]
        self.assertEqual(fable_confirm["model"], "opus")
        self.assertEqual(fable_confirm["substituted"][0]["model"], "fable")
        self.assertIn("empty reply", fable_confirm["substituted"][0]["reason"])
        self.assertIn("finish_reason=stop", fable_confirm["substituted"][0]["reason"])
        self.assertIn("2 claims asked, 2 answered, finish_reason=stop", text)
        # sol is never asked to confirm the pair it found itself.
        self.assertEqual(len(sol_confirm_users), 1)
        self.assertNotIn("[2] and [3]", sol_confirm_users[0])
        self.assertIn("[1] and [2]", sol_confirm_users[0])

    def test_every_seat_finding_the_same_contradiction_needs_no_confirmation(self):
        model = Scripted()
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(model, out)
            results = __import__("json").loads((folder / "pilot.json").read_text())
            text = (folder / "summary.md").read_text()
        record = results["documents"][DOC]
        self.assertEqual(len(record["contradictions"]), 1)
        self.assertTrue(record["contradictions"][0]["confirmed"])
        # Nobody was asked to confirm it, since every seat found it already,
        # so its absoluteness is unknown rather than false.
        self.assertIsNone(record["contradictions"][0]["absolute"])
        self.assertIn("absoluteness not asked", text)
        # The score treats an unasked absoluteness as not absolute: one
        # confirmed claim scores 2, not 0.
        self.assertEqual(record["contradictions_score"], 2)
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
        # deepseek's declared substitutes, glm and kimi, are asked too once
        # the ladder of three reminders is exhausted; all three must fail to
        # reach "no depth" here.
        def model(provider, model_id, system, user, kwargs):
            mid = model_id.lower()
            if system == depth_call.system_prompt(10) and (
                    "deepseek" in mid or "glm" in mid or "kimi" in mid):
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

    def test_an_off_scale_reply_is_asked_again_and_the_reminder_answers(self):
        model = Scripted(depth_script={
            "deepseek": ["DEPTH: -1", "DEPTH: 7\nRATIONALE: Rules, one worked example."]})
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(model, out)
            results = json.loads((folder / "pilot.json").read_text())
        given = results["documents"][DOC]["cells"][SLUG]["new"]["deepseek"]
        self.assertEqual(given["depth"], 7)
        self.assertEqual(given["model"], "deepseek")
        self.assertNotIn("substituted", given)
        self.assertEqual(len(given["attempts"]), 2)
        self.assertEqual(given["attempts"][0]["reminder"], 0)
        self.assertFalse(given["attempts"][0]["parsed"])
        self.assertEqual(given["attempts"][1]["reminder"], 1)
        self.assertTrue(given["attempts"][1]["parsed"])
        self.assertTrue(all(a["cost_usd"] for a in given["attempts"]))
        self.assertGreaterEqual(round(results["cost_usd"], 6),
                                round(sum(a["cost_usd"] for a in given["attempts"]), 6))
        deepseek_users = [user for mid, system, user in model.asked
                          if system == depth_call.system_prompt(10) and "deepseek" in mid.lower()]
        self.assertEqual(len(deepseek_users), 2)
        self.assertNotIn("did not give a whole number", deepseek_users[0])
        self.assertIn(depth_call.REMINDERS_OF_TEN[0], deepseek_users[1])

    def test_three_off_scale_replies_fall_to_the_declared_substitute(self):
        model = Scripted(depth_script={"deepseek": ["DEPTH: -1", "DEPTH: -1", "DEPTH: -1"]})
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(model, out)
            results = json.loads((folder / "pilot.json").read_text())
            text = (folder / "summary.md").read_text()
        given = results["documents"][DOC]["cells"][SLUG]["new"]["deepseek"]
        self.assertEqual(given["model"], "glm")
        self.assertEqual(len(given["attempts"]), 4)
        self.assertEqual([a["reminder"] for a in given["attempts"]], [0, 1, 2, 0])
        self.assertEqual(given["substituted"],
                         {"model": "glm", "reason": "off-scale reply after two reminders"})
        self.assertIn("deepseek (glm)", text)

    def test_every_attempt_failing_leaves_no_depth(self):
        model = Scripted(depth_script={
            "deepseek": ["DEPTH: -1", "DEPTH: -1", "DEPTH: -1"],
            "glm": ["DEPTH: -1", "DEPTH: -1"],
            "kimi": ["DEPTH: -1", "DEPTH: -1"]})
        with tempfile.TemporaryDirectory() as out:
            _estimate, folder = self.go(model, out)
            results = json.loads((folder / "pilot.json").read_text())
            text = (folder / "summary.md").read_text()
        given = results["documents"][DOC]["cells"][SLUG]["new"]["deepseek"]
        self.assertIsNone(given["depth"])
        self.assertEqual(len(given["attempts"]), 7)
        self.assertNotIn("substituted", given)
        self.assertIn("no depth", text)


class ReplayPilotTest(unittest.TestCase):
    """`replay_pilot` gives a run's failed depths again, through the same
    ladder, without touching a whole-document question."""

    @classmethod
    def setUpClass(cls):
        cls.config = pilot.h.load_config()
        cls.registry = fixture.judging_registry()

    def _run_with_one_failed_depth(self, out):
        """A saved pilot.json whose only depth failure is deepseek's, its
        declared substitutes glm and kimi failing too."""
        model = Scripted(depth_script={
            "deepseek": ["DEPTH: -1", "DEPTH: -1", "DEPTH: -1"],
            "glm": ["DEPTH: -1", "DEPTH: -1"],
            "kimi": ["DEPTH: -1", "DEPTH: -1"]})
        _estimate, folder = pilot.run_pilot(store(), self.config, self.registry, passages_for,
                                            out, call_model=model, go=True, documents=(DOC,),
                                            behaviours=(SLUG,))
        return folder

    def test_replay_gives_the_failed_depth_again_through_depth_calls_only(self):
        with tempfile.TemporaryDirectory() as out:
            folder = self._run_with_one_failed_depth(out)
            replay_model = Scripted(depth_script={
                "deepseek": ["DEPTH: -1", "DEPTH: -1", "DEPTH: -1"],
                "glm": ["DEPTH: -1", "DEPTH: -1"],
                "kimi": ["DEPTH: 6\nRATIONALE: Given again, prescribed."]})
            cost, replay_folder = pilot.replay_pilot(
                store(), self.config, self.registry, passages_for, folder, out,
                call_model=replay_model, go=True)
            results = json.loads((replay_folder / "pilot.json").read_text())
        systems_seen = {system for _mid, system, _user in replay_model.asked}
        self.assertEqual(systems_seen, {depth_call.system_prompt(10)})
        self.assertEqual(results["replayed_from"], str(folder))
        given = results["documents"][DOC]["cells"][SLUG]["new"]["deepseek"]
        self.assertEqual(given["depth"], 6)
        self.assertEqual(given["model"], "kimi")
        self.assertGreater(cost, 0)

    def test_replay_refuses_a_pilot_whose_depth_prompt_differs(self):
        with tempfile.TemporaryDirectory() as out:
            folder = Path(out) / "stale-pilot"
            folder.mkdir()
            (folder / "pilot.json").write_text(json.dumps({
                "publication": "pub", "prompts": {"depth": "stale-digest"},
                "documents": {}}), encoding="utf-8")
            with self.assertRaises(SystemExit) as refused:
                pilot.replay_pilot(store(), self.config, self.registry, passages_for, folder, out)
        message = str(refused.exception)
        self.assertIn("stale-digest", message)
        self.assertIn(depth_call.prompt_sha256(10), message)

    def test_replay_price_mode_calls_no_model(self):
        with tempfile.TemporaryDirectory() as out:
            folder = self._run_with_one_failed_depth(out)
            probe = Scripted()
            estimate, replay_folder = pilot.replay_pilot(
                store(), self.config, self.registry, passages_for, folder, out,
                call_model=probe)
        self.assertIsNone(replay_folder)
        self.assertGreater(estimate, 0)
        self.assertEqual(probe.asked, [])


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
