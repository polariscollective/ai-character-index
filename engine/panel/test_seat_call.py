"""One call to one seat's model, against a model that answers from a script.

A network error is not a refusal: it is waited out and tried again, and after
the last wait it stops whatever asked, as `seat_call.Unreachable`. Nothing here
touches a network and nothing sleeps: the waits are recorded, not slept."""
import contextlib
import http.client
import io
import os
import socket
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

import httpx
import openai

HERE = Path(__file__).resolve().parent
# Keys stay out of it: resolve() reads a .env beside the harness unless told not to.
os.environ["PANEL_DOTENV"] = str(HERE.parent.parent / "no-such.env")
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                 # noqa: E402
import seat_call                 # noqa: E402

USAGE = {"prompt_tokens": 1000, "completion_tokens": 100}
REQUEST = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")


def cut():
    """What the openai client raises when the connection is gone."""
    return openai.APIConnectionError(request=REQUEST)


def status_error(cls, code, message="refused"):
    return cls(message, response=httpx.Response(code, request=REQUEST), body=None)


class Sequenced:
    """Each call takes the next item: an exception is raised, a string is the
    reply. Every call is recorded by model id."""

    def __init__(self, *items):
        self.items = list(items)
        self.asked = []

    def __call__(self, provider, model_id, system, user, kwargs):
        self.asked.append(model_id)
        item = self.items.pop(0) if self.items else "an answer"
        if isinstance(item, BaseException):
            raise item
        return item, dict(USAGE), "stop", 0.5


class Waits:
    """Stands in for seat_call.sleep: records each wait asked for."""

    def __init__(self):
        self.asked = []

    def __call__(self, seconds):
        self.asked.append(seconds)


class AskTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = seat_call.h.load_config()

    def ask(self, model, tag="fable"):
        """(what ask returned or raised, the waits asked for, the lines it
        printed). The harness notes its own routing on stderr too, once per
        process, so only the lines about reaching the model are kept."""
        waits = Waits()
        with mock.patch.object(seat_call, "sleep", waits), \
                contextlib.redirect_stderr(io.StringIO()) as printed:
            try:
                answer = seat_call.ask(tag, "system", "user", self.config, model)
            except BaseException as raised:            # noqa: BLE001
                answer = raised
        lines = [line for line in printed.getvalue().splitlines()
                 if "could not be reached" in line]
        return answer, waits.asked, lines

    def test_the_waits_are_those_of_the_brief(self):
        self.assertEqual(seat_call.RETRY_WAITS, (30, 60, 120, 240, 480))

    def test_a_transport_error_twice_then_an_answer_is_one_call_billed(self):
        model = Sequenced(cut(), cut(), "the reply")
        answer, waits, printed = self.ask(model)
        self.assertEqual(answer["reply"], "the reply")
        self.assertEqual(answer["cost_usd"], batch_job.cost_of("fable", USAGE, self.config))
        self.assertEqual(waits, [30, 60])
        self.assertEqual(len(model.asked), 3)
        self.assertEqual(len(set(model.asked)), 1, "the same model is asked every time")
        self.assertEqual(printed, [
            "fable could not be reached (APIConnectionError: Connection error.); "
            "trying again in 30 s",
            "fable could not be reached (APIConnectionError: Connection error.); "
            "trying again in 60 s"])

    def test_a_transport_error_on_every_wait_is_unreachable(self):
        errors = [cut() for _ in range(6)]
        model = Sequenced(*errors, "never reached")
        raised, waits, printed = self.ask(model)
        self.assertIsInstance(raised, seat_call.Unreachable)
        self.assertEqual(waits, [30, 60, 120, 240, 480])
        self.assertEqual(len(model.asked), 6, "the first try and one after each wait")
        self.assertIs(raised.__cause__, errors[-1])
        message = str(raised)
        self.assertIn("fable", message)
        self.assertIn(model.asked[0], message, "the model id is named")
        self.assertIn("APIConnectionError: Connection error.", message)
        self.assertEqual(len(printed), 5, "one line per wait")

    def test_what_each_wait_prints_of_the_error_is_cut_to_200_characters(self):
        _answer, _waits, printed = self.ask(Sequenced(ConnectionError("x" * 1000), "ok"))
        [line] = printed
        self.assertEqual(line, "fable could not be reached (ConnectionError: " + "x" * 200
                         + "); trying again in 30 s")

    def test_every_transport_error_is_waited_out(self):
        for error in (openai.APITimeoutError(request=REQUEST),
                      status_error(openai.RateLimitError, 429),
                      status_error(openai.InternalServerError, 503),
                      ConnectionResetError("reset"), TimeoutError("timed out"),
                      socket.gaierror(8, "nodename nor servname provided"),
                      http.client.RemoteDisconnected("closed"),
                      http.client.IncompleteRead(b""),
                      urllib.error.URLError("Connection refused")):
            with self.subTest(error=type(error).__name__):
                answer, waits, _printed = self.ask(Sequenced(error, "the reply"))
                self.assertEqual(answer["reply"], "the reply")
                self.assertEqual(waits, [30])

    def test_any_other_error_is_raised_at_once(self):
        for error in (status_error(openai.BadRequestError, 400),
                      status_error(openai.AuthenticationError, 401),
                      status_error(openai.PermissionDeniedError, 403),
                      status_error(openai.NotFoundError, 404),
                      status_error(openai.UnprocessableEntityError, 422),
                      urllib.error.HTTPError("https://x", 400, "Bad Request", {}, None),
                      RuntimeError("provider refused the input")):
            with self.subTest(error=type(error).__name__):
                model = Sequenced(error, "never reached")
                raised, waits, printed = self.ask(model)
                self.assertIs(raised, error)
                self.assertEqual((waits, printed), ([], []))
                self.assertEqual(len(model.asked), 1)

    def test_an_interrupt_during_a_wait_is_not_swallowed(self):
        def interrupted(_seconds):
            raise KeyboardInterrupt
        with mock.patch.object(seat_call, "sleep", interrupted), \
                contextlib.redirect_stderr(io.StringIO()), \
                self.assertRaises(KeyboardInterrupt):
            seat_call.ask("sol", "system", "user", self.config, Sequenced(cut()))

    def test_a_stop_is_named_for_the_row_it_leaves(self):
        unreachable = seat_call.Unreachable("sol (x) could not be reached")
        self.assertEqual(seat_call.stop_error(unreachable),
                         "unreachable: sol (x) could not be reached")
        self.assertEqual(seat_call.stop_error(KeyboardInterrupt()), "KeyboardInterrupt")
        self.assertEqual(seat_call.stop_error(RuntimeError("insert refused")), "insert refused")
        self.assertEqual(len(seat_call.stop_error(RuntimeError("y" * 5000))), 1000)


if __name__ == "__main__":
    unittest.main()
