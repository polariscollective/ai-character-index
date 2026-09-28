"""The session seat: questions written to files, answers read back from them.

Run: python3 -m pytest -q engine/panel/test_session_seat.py
"""
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "engine"))
sys.path.insert(0, str(ROOT / "tests" / "fixtures"))
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))
import cite                      # noqa: E402
import index as fixture          # noqa: E402
import judge_call                # noqa: E402
import link_self                 # noqa: E402
import session_seat              # noqa: E402


class StoppingWireTest(unittest.TestCase):
    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())

    def ask(self, user="U"):
        return session_seat.stopping_wire(self.folder)(
            provider="anthropic", model_id="claude-opus-5-5", system="S", user=user, kwargs={})

    def test_a_question_with_no_answer_is_written_and_stops_the_pipeline(self):
        with self.assertRaises(session_seat.Pending):
            self.ask()
        question = self.folder / f"{link_self.key_of('U')}.question"
        self.assertEqual(question.read_text(), "S\n\n---- the call ----\n\nU")

    def test_no_handler_written_for_a_provider_failure_catches_it(self):
        """Pending is not an Exception, so the pipelines' `except Exception`,
        which record a refusal and ask a substitute, let it through."""
        caught = False
        try:
            try:
                self.ask()
            except Exception:                          # noqa: BLE001
                caught = True
        except session_seat.Pending:
            pass
        self.assertFalse(caught)

    def test_an_answer_written_is_the_reply(self):
        (self.folder / f"{link_self.key_of('U')}.answer").write_text("DEPTH: 3")
        self.assertEqual(self.ask(), ("DEPTH: 3", {}, "in-session", None))


class JudgeQuestionsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def test_the_question_is_the_one_batch_job_would_send(self):
        registry = {"helpfulness": {"slug": "helpfulness", "title": "Helpfulness",
                                    "label": "Helpfulness", "definition": "Be helpful."}}
        version = {"id": "v", "spec_id": "corpus", "version": "2026-01-01"}
        call = {"id": "c", "behaviour_slug": "helpfulness", "spec_version_id": "v"}
        [(key, asked, system, user)] = session_seat.judge_questions(
            [call], registry, {"v": version}, "v5")
        passages = judge_call.h.passages("corpus", "2026-01-01")
        self.assertEqual((system, user), judge_call.compose("helpfulness", "v5", registry, passages))
        self.assertEqual(key, link_self.key_of(user))
        self.assertIs(asked, call)


if __name__ == "__main__":
    unittest.main()
