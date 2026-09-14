"""Composing and parsing one depth call. The fixture index supplies the
behaviours; nothing touches a network."""
import hashlib
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "tests" / "fixtures"))
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))
import cite                      # noqa: E402
import index as fixture          # noqa: E402
import depth_call                # noqa: E402

RETAINED = [("loc-1", "A > B", "First passage."), ("loc-2", "A > C", "Second passage.")]


class ComposeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def test_the_system_prompt_is_the_file_on_disk(self):
        system, _user = depth_call.compose("defined-behaviour", self.registry, RETAINED)
        self.assertEqual(system, (HERE / "prompts" / "depth-v1.txt").read_text())

    def test_the_prompt_carries_the_brief_and_every_retained_passage(self):
        _system, user = depth_call.compose("defined-behaviour", self.registry, RETAINED)
        self.assertIn("NOT this behaviour", user)
        self.assertIn("[1] (§ A > B) First passage.", user)
        self.assertIn("[2] (§ A > C) Second passage.", user)

    def test_the_prompt_says_depth_is_independent_of_authority(self):
        # The rubric's own note. Without it a judge can mark a guideline down for
        # being a guideline, which is a claim about authority and not about depth.
        system = depth_call.system_prompt()
        self.assertIn("Depth is independent of authority level", system)
        self.assertIn("Note authority in the rationale where it matters", system)

    def test_the_digest_is_of_the_prompt_on_disk(self):
        expected = hashlib.sha256((HERE / "prompts" / "depth-v1.txt").read_bytes()).hexdigest()
        self.assertEqual(depth_call.prompt_sha256(), expected)


class ParseTest(unittest.TestCase):
    def test_a_well_formed_reply(self):
        self.assertEqual(depth_call.parse("DEPTH: 3\nRATIONALE: Rules, no examples."),
                         (3, "Rules, no examples."))

    def test_reasoning_before_the_answer_is_ignored(self):
        reply = "There are 4 passages to weigh.\nDEPTH: 2\nRATIONALE: General terms only."
        self.assertEqual(depth_call.parse(reply), (2, "General terms only."))

    def test_a_depth_off_the_scale_is_not_a_depth(self):
        self.assertIsNone(depth_call.parse("DEPTH: 5\nRATIONALE: Too high.")[0])
        self.assertIsNone(depth_call.parse("DEPTH: 42\nRATIONALE: Too high.")[0])

    def test_a_reply_without_a_depth_gives_nothing(self):
        self.assertEqual(depth_call.parse("I cannot tell."), (None, None))
        self.assertEqual(depth_call.parse(""), (None, None))

    # Each of these is an ordinary reply, and each one refused is a call paid for
    # and retried.
    def test_markdown_around_the_depth_line_is_read_through(self):
        for line in ("**DEPTH:** 3", "**DEPTH**: 3", "DEPTH: **3**", "`DEPTH: 3`",
                     "- DEPTH: 3", "* DEPTH: 3", "1. DEPTH: 3", "_DEPTH_: 3"):
            with self.subTest(line=line):
                self.assertEqual(depth_call.parse(f"{line}\nRATIONALE: Rules, no examples."),
                                 (3, "Rules, no examples."))

    def test_markdown_around_the_rationale_line_is_read_through(self):
        for line in ("**RATIONALE:** Rules, no examples.", "**RATIONALE**: Rules, no examples.",
                     "`RATIONALE: Rules, no examples.`", "- RATIONALE: Rules, no examples."):
            with self.subTest(line=line):
                self.assertEqual(depth_call.parse(f"DEPTH: 3\n{line}"),
                                 (3, "Rules, no examples."))

    def test_the_last_depth_line_is_the_answer(self):
        reply = ("DEPTH: 3\nRATIONALE: Rules.\nOn reflection the rules are too general.\n"
                 "DEPTH: 1\nRATIONALE: Named only.")
        self.assertEqual(depth_call.parse(reply), (1, "Named only."))

    def test_a_refused_last_depth_does_not_fall_back_to_an_earlier_one(self):
        self.assertIsNone(depth_call.parse("DEPTH: 3\nDEPTH: 5\nRATIONALE: Too high.")[0])

    def test_a_decimal_depth_is_not_a_depth(self):
        self.assertIsNone(depth_call.parse("DEPTH: 2.5\nRATIONALE: Between two levels.")[0])
        self.assertIsNone(depth_call.parse("DEPTH: **2.5**\nRATIONALE: Between two levels.")[0])

    def test_an_underscore_inside_a_word_of_the_rationale_is_kept(self):
        self.assertEqual(
            depth_call.parse("DEPTH: 2\nRATIONALE: The no_sycophancy section is general.")[1],
            "The no_sycophancy section is general.")


if __name__ == "__main__":
    unittest.main()
