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
    A reply that is an exception is raised instead of returned."""

    def __init__(self, **script):
        self.script = {tag: list(replies) for tag, replies in script.items()}
        self.asked = []

    def __call__(self, provider, model_id, system, user, kwargs):
        tag = next((t for t in ("deepseek", "fable", "opus", "kimi", "sol")
                    if t in model_id.lower()), model_id)
        self.asked.append((tag, user))
        replies = self.script.get(tag) or []
        reply = replies.pop(0) if replies else ANSWER
        if isinstance(reply, Exception):
            raise reply
        return reply, dict(USAGE), "stop", 0.5


class GiveTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = depth_ladder.h.load_config()

    def give(self, tag, model, panel="frontier_fast"):
        return depth_ladder.give(tag, SYSTEM, USER, self.config, model, panel=panel)

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
        model = Scripted(deepseek=["DEPTH: -1"] * 3, kimi=["no depth here", ANSWER])
        given = self.give("deepseek", model)
        self.assertEqual(given["depth"], 7)
        self.assertEqual(given["model"], "kimi")
        self.assertEqual(given["substitution_reason"], "off-scale reply after two reminders")
        self.assertEqual([(a["model"], a["reminder"]) for a in given["attempts"]],
                         [("deepseek", 0), ("deepseek", 1), ("deepseek", 2),
                          ("kimi", 0), ("kimi", 1)])
        self.assertEqual(model.asked[3], ("kimi", USER))
        self.assertEqual(model.asked[4], ("kimi", depth_call.retry_user(USER, 1)))

    def test_every_substitute_is_tried_in_order_and_nothing_answering_leaves_no_depth(self):
        model = Scripted(fable=["DEPTH: -1"] * 3, opus=["DEPTH: -1"] * 2,
                         kimi=["DEPTH: -1"] * 2)
        given = self.give("fable", model)
        self.assertIsNone(given["depth"])
        self.assertIsNone(given["rationale"])
        self.assertEqual(given["model"], "fable")
        self.assertIsNone(given["substitution_reason"])
        self.assertEqual([(a["model"], a["reminder"]) for a in given["attempts"]],
                         [("fable", 0), ("fable", 1), ("fable", 2), ("opus", 0), ("opus", 1),
                          ("kimi", 0), ("kimi", 1)])
        self.assertEqual(len(given["replies"]), 7)

    def test_a_seat_with_no_declared_substitute_stops_after_its_reminders(self):
        given = self.give("sol", Scripted(sol=["DEPTH: -1"] * 3))
        self.assertIsNone(given["depth"])
        self.assertEqual(len(given["attempts"]), 3)

    def test_substitutes_are_those_of_the_panel_named(self):
        given = self.give("deepseek", Scripted(deepseek=["DEPTH: -1"] * 3), panel="cheap")
        self.assertIsNone(given["depth"])
        self.assertEqual({a["model"] for a in given["attempts"]}, {"deepseek"})

    def test_a_raised_call_is_an_attempt_with_no_reply_and_no_cost(self):
        model = Scripted(deepseek=[RuntimeError("429"), ANSWER])
        given = self.give("deepseek", model)
        self.assertEqual(given["depth"], 7)
        self.assertEqual(given["attempts"][0], {"model": "deepseek", "reminder": 0,
                                                "finish_reason": None, "cost_usd": None,
                                                "parsed": False})
        self.assertEqual(given["attempts"][1]["reminder"], 1)
        self.assertEqual(given["replies"], [None, ANSWER])

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
