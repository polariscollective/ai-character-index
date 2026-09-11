"""Composing and parsing one judge call. No network, no credentials: the
fixture index supplies the behaviours and the document."""
import importlib.util
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
import judge_call                # noqa: E402

spec = importlib.util.spec_from_file_location("h", HERE / "harness.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)


class ComposeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()
        cls.passages = h.passages("corpus")

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def compose(self, slug):
        return judge_call.compose(slug, "v5", self.registry, self.passages)

    def test_the_prompt_carries_the_boundary_when_there_is_one(self):
        _system, user = self.compose("defined-behaviour")
        self.assertIn("NOT this behaviour", user,
                      "a behaviour with a boundary must reach the panel carrying it")

    def test_a_behaviour_without_one_says_so_rather_than_pretending(self):
        _system, user = self.compose("undefined-behaviour")
        scope = next(line for line in user.splitlines()
                     if line.lower().startswith("scope"))
        self.assertIn(h.FIELD_NONE, scope)

    def test_every_passage_is_numbered_in_document_order(self):
        _system, user = self.compose("defined-behaviour")
        self.assertIn("[1] ", user)
        self.assertIn(f"[{len(self.passages)}] ", user)
        self.assertIn(f"Output {len(self.passages)} verdict lines.", user)

    def test_the_system_prompt_is_the_rubric_on_disk(self):
        system, _user = self.compose("defined-behaviour")
        self.assertEqual(system, (HERE / "prompts" / "v5.txt").read_text())


class ParseTest(unittest.TestCase):
    def test_a_complete_reply_parses(self):
        reply = "\n".join(f"[{i}]: {i % 4}" for i in range(1, 11))
        verdicts, unparsed = judge_call.parse(reply, 10)
        self.assertEqual(unparsed, 0)
        self.assertEqual(verdicts[4], 0)

    def test_a_reply_missing_a_line_still_parses_within_the_gate(self):
        reply = "\n".join(f"[{i}]: 1" for i in range(1, 100))
        verdicts, unparsed = judge_call.parse(reply, 100)
        self.assertEqual(unparsed, 1)
        self.assertTrue(judge_call.parsed_enough(unparsed, 100))

    def test_a_reply_missing_most_of_its_lines_is_a_failure(self):
        reply = "\n".join(f"[{i}]: 1" for i in range(1, 50))
        verdicts, unparsed = judge_call.parse(reply, 100)
        self.assertEqual(unparsed, 51)
        self.assertFalse(judge_call.parsed_enough(unparsed, 100),
                         "half a reply must not be recorded as verdicts")

    def test_an_empty_reply_is_a_failure_rather_than_a_page_of_zeroes(self):
        verdicts, unparsed = judge_call.parse("", 10)
        self.assertEqual(verdicts, {})
        self.assertFalse(judge_call.parsed_enough(unparsed, 10))


class JudgementTest(unittest.TestCase):
    def test_one_row_per_passage_in_document_order(self):
        passages = [("loc-1", "s", "t"), ("loc-2", "s", "t"), ("loc-3", "s", "t")]
        rows = judge_call.judgements("call-1", passages, {1: 3, 3: 1})
        self.assertEqual([r["locator"] for r in rows], ["loc-1", "loc-2", "loc-3"])
        self.assertEqual([r["verdict"] for r in rows], [3, 0, 1])
        self.assertEqual([r["parsed"] for r in rows], [True, False, True])
        # `relevant` is the 2-or-more cut the payload builder reads.
        self.assertEqual([r["relevant"] for r in rows], [1, 0, 0])
        self.assertTrue(all(r["call_id"] == "call-1" for r in rows))


if __name__ == "__main__":
    unittest.main()
