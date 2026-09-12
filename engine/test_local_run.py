#!/usr/bin/env python3
"""Judging with no database, and no network.

What this pins is the promise the README makes to someone who clones this
repository: one key, one document, one behaviour, and results on disk. The model
call is injected, so none of it costs anything.

Run: python3 engine/test_local_run.py
"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import local_run                   # noqa: E402

CORPUS = ROOT / "tests" / "fixtures" / "parser-corpus.md"
BEHAVIOUR = {
    "slug": "bribery-resistance",
    "title": "Bribery resistance",
    "query": "The model should not change its behaviour in response to offers of payment.",
    "boundary": "The construct is resistance to inducements. NOT this: discussing bribery.",
}


def scoring(verdict=2, scored=None):
    """A model that answers every passage, or the first `scored` of them.

    The format the rubric asks for: the passage number, a colon, the verdict.
    Written that way deliberately -- a fake that answers in a shape the parser
    only reads through its fallback would pass this suite while telling us
    nothing about the shape a real reply takes.
    """
    def call(provider, model_id, system, user, kwargs):
        count = user.count("\n[") + 1
        lines = [f"{i}: {verdict}" for i in range(1, (scored or count - 1) + 1)]
        return "\n".join(lines), {"prompt_tokens": 10, "completion_tokens": 5}, "stop", 1.0
    return call


class LocalRunTest(unittest.TestCase):
    def setUp(self):
        self.scratch = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.scratch, ignore_errors=True)
        self.behaviour = self.scratch / "behaviour.json"
        self.behaviour.write_text(json.dumps(BEHAVIOUR))

    def run_it(self, call=None, behaviour=None, panel="sol,fable"):
        return local_run.run(f"corpus@2026-09-12:{CORPUS}",
                             str(behaviour or self.behaviour), panel,
                             str(self.scratch / "artefacts"),
                             call_model=call or scoring())

    def test_the_document_is_read_from_a_file_and_nothing_else(self):
        """The point of this path: no credentials, no database, no account."""
        folder = self.run_it()
        manifest = json.loads((folder / "run.json").read_text())
        self.assertEqual(manifest["document"]["name"], "corpus")
        self.assertEqual(manifest["document"]["version"], "2026-09-12")
        self.assertGreater(manifest["document"]["passages"], 10)
        self.assertEqual(manifest["document"]["sha256"],
                         __import__("hashlib").sha256(CORPUS.read_bytes()).hexdigest())

    def test_every_seat_writes_its_reply_exactly_as_it_came_back(self):
        """The reply is the evidence and the verdicts are an interpretation of
        it. Keeping only the second is keeping only our reading."""
        folder = self.run_it()
        for seat in ("sol", "fable"):
            reply = folder / f"{seat}.reply.txt"
            self.assertTrue(reply.exists(), f"{seat} left no reply")
            self.assertIn("1: 2", reply.read_text())

    def test_a_judgement_carries_its_locator_and_the_text_it_judged(self):
        folder = self.run_it()
        rows = [json.loads(line)
                for line in (folder / "judgements.jsonl").read_text().splitlines()]
        self.assertTrue(rows)
        for row in rows[:5]:
            self.assertIn("corpus@2026-09-12 > ", row["locator"])
            self.assertIn(row["model"], ("sol", "fable"))
            self.assertTrue(row["text"].strip())
            self.assertIn(row["verdict"], (0, 1, 2, 3))

    def test_the_document_is_written_down_before_any_call_is_made(self):
        """A run that dies halfway still says what it was reading."""
        def die(provider, model_id, system, user, kwargs):
            raise RuntimeError("the provider refused")
        folder = self.run_it(call=die)
        passages = (folder / "passages.jsonl").read_text().splitlines()
        self.assertGreater(len(passages), 10)
        manifest = json.loads((folder / "run.json").read_text())
        self.assertEqual([call.get("error") for call in manifest["calls"]],
                         ["the provider refused", "the provider refused"])

    def test_one_seat_failing_is_not_the_run_failing(self):
        seen = []
        def flaky(provider, model_id, system, user, kwargs):
            seen.append(model_id)
            if len(seen) == 1:
                raise RuntimeError("rate limited")
            return scoring()(provider, model_id, system, user, kwargs)
        folder = self.run_it(call=flaky)
        manifest = json.loads((folder / "run.json").read_text())
        self.assertEqual(len(manifest["calls"]), 2)
        self.assertIn("error", manifest["calls"][0])
        self.assertEqual(manifest["calls"][1]["scored"],
                         manifest["document"]["passages"])

    def test_a_reply_that_will_not_parse_is_kept_rather_than_thrown(self):
        """The usual cause is a truncation or a filter, and the reply is the only
        evidence of which. Losing it loses the diagnosis."""
        folder = self.run_it(call=scoring(scored=3))
        manifest = json.loads((folder / "run.json").read_text())
        call = manifest["calls"][0]
        self.assertEqual(call["scored"], 3)
        self.assertFalse(call["enough"])
        self.assertTrue((folder / "sol.reply.txt").read_text().strip())

    def test_a_panel_name_and_a_list_of_models_both_work(self):
        named = json.loads((self.run_it(panel="frontier_fast") / "run.json").read_text())
        self.assertEqual(named["panel"], ["sol", "fable", "deepseek"])
        listed = json.loads((self.run_it(panel="sol") / "run.json").read_text())
        self.assertEqual(listed["panel"], ["sol"])

    def test_the_behaviour_can_be_a_file_of_one_entry_either_way_round(self):
        keyed = self.scratch / "keyed.json"
        keyed.write_text(json.dumps({"bribery-resistance": BEHAVIOUR}))
        manifest = json.loads((self.run_it(behaviour=keyed) / "run.json").read_text())
        self.assertEqual(manifest["behaviour"]["slug"], "bribery-resistance")

    def test_a_file_of_several_behaviours_is_refused_by_name(self):
        many = self.scratch / "many.json"
        many.write_text(json.dumps({"a": BEHAVIOUR, "b": BEHAVIOUR}))
        with self.assertRaises(SystemExit) as refused:
            self.run_it(behaviour=many)
        self.assertIn("holds 2 behaviours", str(refused.exception))

    def test_the_display_shape_is_accepted_too(self):
        """A behaviour written the way the public form asks for it, judged
        without being rewritten."""
        display = self.scratch / "display.json"
        display.write_text(json.dumps({
            "name": "Bribery resistance",
            "definition": "The model should not change its behaviour for payment.",
        }))
        manifest = json.loads((self.run_it(behaviour=display) / "run.json").read_text())
        self.assertEqual(manifest["behaviour"]["slug"], "bribery-resistance")

    def test_a_malformed_document_argument_says_what_it_wanted(self):
        with self.assertRaises(SystemExit) as refused:
            local_run.run("just-a-path.md", str(self.behaviour), "sol",
                          str(self.scratch), call_model=scoring())
        self.assertIn("name@version:path", str(refused.exception))

    def test_the_prompt_is_recorded_by_digest_so_two_runs_can_be_compared(self):
        first = json.loads((self.run_it() / "run.json").read_text())
        second = json.loads((self.run_it() / "run.json").read_text())
        self.assertEqual(first["prompt_sha256"], second["prompt_sha256"])
        self.assertEqual(len(first["prompt_sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
