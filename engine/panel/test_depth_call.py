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


if __name__ == "__main__":
    unittest.main()
