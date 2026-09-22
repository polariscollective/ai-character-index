"""The depth ladder, against a model that answers from a script.

Nothing touches a network and nothing is written anywhere: `give` returns every
reply for its caller to keep."""
import os
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Keys stay out of it: resolve() reads a .env beside the harness unless told not to.
os.environ["PANEL_DOTENV"] = str(HERE.parent.parent / "no-such.env")
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                 # noqa: E402
import depth_call                # noqa: E402
import depth_ladder              # noqa: E402

SYSTEM = depth_call.system_prompt(10)
USER = "The behaviour, its passages, and the rules."
USAGE = {"prompt_tokens": 1000, "completion_tokens": 100}
ANSWER = "DEPTH: 7\nRATIONALE: Rules, one worked example."


class Scripted:
    """Replies per tag, taken in order; a tag with nothing left answers ANSWER.
    A reply that is an exception, a KeyboardInterrupt included, is raised
    instead of returned."""

    def __init__(self, **script):
        self.script = {tag: list(replies) for tag, replies in script.items()}
        self.asked = []

    def __call__(self, provider, model_id, system, user, kwargs):
        tag = next((t for t in ("deepseek", "fable", "glm", "opus", "kimi", "sol")
                    if t in model_id.lower()), model_id)
        self.asked.append((tag, user))
        replies = self.script.get(tag) or []
        reply = replies.pop(0) if replies else ANSWER
        if isinstance(reply, BaseException):
            raise reply
        return reply, dict(USAGE), "stop", 0.5


class GiveTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = depth_ladder.h.load_config()

    def give(self, tag, model, panel="frontier_fast", seated=None):
        return depth_ladder.give(tag, SYSTEM, USER, self.config, model, panel=panel,
                                 seated=seated)

    def test_the_first_reply_that_parses_answers(self):
        model = Scripted()
        given = self.give("sol", model)
        self.assertEqual(given["depth"], 7)
        self.assertEqual(given["rationale"], "Rules, one worked example.")
        self.assertEqual(given["model"], "sol")
        self.assertIsNone(given["substitution_reason"])
        self.assertEqual(given["attempts"], [
            {"model": "sol", "reminder": 0, "finish_reason": "stop",
             "cost_usd": batch_job.cost_of("sol", USAGE, self.config), "parsed": True}])
        self.assertEqual(given["replies"], [ANSWER])
        self.assertEqual(model.asked, [("sol", USER)])

    def test_an_off_scale_reply_is_asked_again_with_each_reminder_in_turn(self):
        model = Scripted(deepseek=["DEPTH: -1", "DEPTH: 11", ANSWER])
        given = self.give("deepseek", model)
        self.assertEqual(given["depth"], 7)
        self.assertEqual(given["model"], "deepseek")
        self.assertIsNone(given["substitution_reason"])
        self.assertEqual([a["reminder"] for a in given["attempts"]], [0, 1, 2])
        self.assertEqual([a["parsed"] for a in given["attempts"]], [False, False, True])
        self.assertEqual(given["replies"], ["DEPTH: -1", "DEPTH: 11", ANSWER])
        users = [user for _tag, user in model.asked]
        self.assertEqual(users, [USER, depth_call.retry_user(USER, 1),
                                 depth_call.retry_user(USER, 2)])

    def test_three_failures_fall_to_the_declared_substitute_plain_then_reminded(self):
        model = Scripted(deepseek=["DEPTH: -1"] * 3, glm=["no depth here", ANSWER])
        given = self.give("deepseek", model)
        self.assertEqual(given["depth"], 7)
        self.assertEqual(given["model"], "glm")
        self.assertEqual(given["substitution_reason"], "off-scale reply after two reminders")
        self.assertEqual([(a["model"], a["reminder"]) for a in given["attempts"]],
                         [("deepseek", 0), ("deepseek", 1), ("deepseek", 2),
                          ("glm", 0), ("glm", 1)])
        self.assertEqual(model.asked[3], ("glm", USER))
        self.assertEqual(model.asked[4], ("glm", depth_call.retry_user(USER, 1)))

    def test_every_substitute_is_tried_in_order_and_nothing_answering_leaves_no_depth(self):
        model = Scripted(fable=["DEPTH: -1"] * 3, opus=["DEPTH: -1"] * 2,
                         kimi=["DEPTH: -1"] * 2, glm=["DEPTH: -1"] * 2)
        given = self.give("fable", model)
        self.assertIsNone(given["depth"])
        self.assertIsNone(given["rationale"])
        self.assertEqual(given["model"], "fable")
        self.assertIsNone(given["substitution_reason"])
        self.assertEqual([(a["model"], a["reminder"]) for a in given["attempts"]],
                         [("fable", 0), ("fable", 1), ("fable", 2), ("opus", 0), ("opus", 1),
                          ("kimi", 0), ("kimi", 1), ("glm", 0), ("glm", 1)])
        self.assertEqual(len(given["replies"]), 9)

    def test_a_seat_with_no_declared_substitute_stops_after_its_reminders(self):
        given = self.give("sol", Scripted(sol=["DEPTH: -1"] * 3))
        self.assertIsNone(given["depth"])
        self.assertEqual(len(given["attempts"]), 3)

    def test_substitutes_are_those_of_the_panel_named(self):
        given = self.give("deepseek", Scripted(deepseek=["DEPTH: -1"] * 3), panel="cheap")
        self.assertIsNone(given["depth"])
        self.assertEqual({a["model"] for a in given["attempts"]}, {"deepseek"})

    def test_a_substitute_already_seated_is_skipped_and_recorded(self):
        model = Scripted(deepseek=["DEPTH: -1"] * 3, glm=["DEPTH: -1"] * 2)
        given = self.give("deepseek", model, seated={"kimi"})
        self.assertIsNone(given["depth"])
        self.assertEqual(given["model"], "deepseek")
        self.assertEqual([(a["model"], a.get("reminder"), a.get("reason"), a["parsed"])
                          for a in given["attempts"]],
                         [("deepseek", 0, None, False), ("deepseek", 1, None, False),
                          ("deepseek", 2, None, False),
                          ("glm", 0, None, False), ("glm", 1, None, False),
                          ("kimi", None, depth_ladder.ALREADY_SEATED, False)])
        self.assertNotIn("cost_usd", given["attempts"][5])
        self.assertEqual(given["replies"], ["DEPTH: -1", "DEPTH: -1", "DEPTH: -1",
                                            "DEPTH: -1", "DEPTH: -1", None])
        self.assertEqual(model.asked, [("deepseek", USER),
                                       ("deepseek", depth_call.retry_user(USER, 1)),
                                       ("deepseek", depth_call.retry_user(USER, 2)),
                                       ("glm", USER),
                                       ("glm", depth_call.retry_user(USER, 1))],
                         "kimi is never asked at all once it is already seated")

    def test_with_no_seated_argument_a_substitute_is_tried_as_before(self):
        model = Scripted(deepseek=["DEPTH: -1"] * 3, glm=["DEPTH: -1"] * 2,
                         kimi=["DEPTH: -1"] * 2)
        given = self.give("deepseek", model)
        self.assertIsNone(given["depth"])
        self.assertEqual({a["model"] for a in given["attempts"]}, {"deepseek", "glm", "kimi"})
        self.assertIn(("kimi", USER), model.asked, "kimi is tried when nothing seats it")

    def test_a_raised_call_is_an_attempt_with_no_reply_and_no_cost(self):
        model = Scripted(deepseek=[RuntimeError("429"), ANSWER])
        given = self.give("deepseek", model)
        self.assertEqual(given["depth"], 7)
        self.assertEqual(given["attempts"][0], {"model": "deepseek", "reminder": 0,
                                                "finish_reason": None, "cost_usd": None,
                                                "parsed": False,
                                                "error": "RuntimeError: 429"})
        self.assertEqual(given["attempts"][1]["reminder"], 1)
        self.assertNotIn("error", given["attempts"][1], "only an attempt that raised has one")
        self.assertEqual(given["replies"], [None, ANSWER])

    def test_what_a_raised_call_said_is_cut_to_300_characters(self):
        given = self.give("sol", Scripted(sol=[RuntimeError("x" * 1000), ANSWER]))
        error = given["attempts"][0]["error"]
        self.assertEqual(len(error), 300)
        self.assertTrue(error.startswith("RuntimeError: xxx"))

    def test_a_seat_that_only_replied_off_the_scale_is_substituted_as_off_scale(self):
        model = Scripted(deepseek=["DEPTH: -1", "no depth", "DEPTH: 11"])
        given = self.give("deepseek", model)
        self.assertEqual(given["model"], "glm")
        self.assertEqual(given["substitution_reason"], "off-scale reply after two reminders")
        self.assertEqual(given["substitution_reason"], depth_ladder.SUBSTITUTION_REASON)

    def test_a_seat_that_raised_every_time_is_not_reported_as_off_the_scale(self):
        model = Scripted(deepseek=[RuntimeError("provider refused the input"),
                                   RuntimeError("second"), RuntimeError("third")])
        given = self.give("deepseek", model)
        self.assertEqual(given["model"], "glm")
        self.assertEqual(given["substitution_reason"],
                         "the seat's model raised on every attempt: "
                         "RuntimeError: provider refused the input")

    def test_a_seat_that_raised_on_every_attempt_names_its_first_error_cut(self):
        model = Scripted(deepseek=[RuntimeError("y" * 1000)] * 3)
        given = self.give("deepseek", model)
        reason = given["substitution_reason"]
        self.assertEqual(reason, "the seat's model raised on every attempt: "
                         + ("RuntimeError: " + "y" * 1000)[:300])

    def test_a_seat_that_raised_and_replied_off_the_scale_says_both(self):
        model = Scripted(deepseek=[RuntimeError("429"), "DEPTH: -1", RuntimeError("500")])
        given = self.give("deepseek", model)
        self.assertEqual(given["model"], "glm")
        self.assertEqual(given["substitution_reason"],
                         "the seat's model raised or replied off the scale")

    def test_attempts_can_be_filled_in_a_list_the_caller_holds(self):
        """So a caller interrupted mid-ladder still holds what was billed."""
        held = []
        model = Scripted(sol=["DEPTH: -1", KeyboardInterrupt()])
        with self.assertRaises(KeyboardInterrupt):
            depth_ladder.give("sol", SYSTEM, USER, self.config, model, attempts=held)
        self.assertEqual(len(held), 1)
        self.assertEqual(held[0]["model"], "sol")
        self.assertEqual(held[0]["cost_usd"], batch_job.cost_of("sol", USAGE, self.config))
        given = depth_ladder.give("sol", SYSTEM, USER, self.config, Scripted(), attempts=[])
        self.assertEqual(given["depth"], 7)

    def test_every_attempt_the_ladder_can_make_is_listed_in_order(self):
        self.assertEqual(depth_ladder.attempts_at_most("fable", self.config), [
            ("fable", 0), ("fable", 1), ("fable", 2), ("opus", 0), ("opus", 1),
            ("kimi", 0), ("kimi", 1), ("glm", 0), ("glm", 1)])
        self.assertEqual(depth_ladder.attempts_at_most("sol", self.config),
                         [("sol", 0), ("sol", 1), ("sol", 2)])
        model = Scripted(fable=["DEPTH: -1"] * 3, opus=["DEPTH: -1"] * 2,
                         kimi=["DEPTH: -1"] * 2, glm=["DEPTH: -1"] * 2)
        given = self.give("fable", model)
        self.assertEqual([(a["model"], a["reminder"]) for a in given["attempts"]],
                         depth_ladder.attempts_at_most("fable", self.config))

    def test_tokens_and_seconds_are_summed_over_the_attempts_that_came_back(self):
        given = self.give("deepseek", Scripted(deepseek=[RuntimeError("429"), "DEPTH: -1",
                                                         ANSWER]))
        self.assertEqual(given["prompt_tokens"], 2000)
        self.assertEqual(given["completion_tokens"], 200)
        self.assertEqual(given["seconds"], 1.0)

    def test_nothing_coming_back_leaves_the_meter_unknown(self):
        given = self.give("sol", Scripted(sol=[RuntimeError("down")] * 3))
        self.assertIsNone(given["prompt_tokens"])
        self.assertIsNone(given["completion_tokens"])
        self.assertIsNone(given["seconds"])


if __name__ == "__main__":
    unittest.main()
