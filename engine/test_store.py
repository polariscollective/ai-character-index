"""Store tests. The transport is injected, so nothing here touches a network."""
import io
import json
import sys
import unittest
import urllib.error
from contextlib import redirect_stderr
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import store as store_module
from store import Store, StoreError


class FakeTransport:
    """Records requests and replays canned responses.

    A response may be a raised exception instead of a (status, payload) pair,
    which is how a test plays back a transient failure: `urlopen` itself
    raises rather than returning a status.
    """

    def __init__(self, responses=None):
        self.calls = []
        self.responses = list(responses or [])

    def __call__(self, method, url, headers, body):
        self.calls.append({"method": method, "url": url,
                           "headers": headers, "body": body})
        if self.responses:
            response = self.responses.pop(0)
            if isinstance(response, BaseException):
                raise response
            return response
        return 200, b"[]"


class StoreTest(unittest.TestCase):
    def store(self, transport, sleep=None):
        return Store("https://example.supabase.co", "KEY",
                    transport=transport, sleep=sleep)

    def test_select_builds_a_postgrest_query(self):
        t = FakeTransport([(200, b'[{"id": "anthropic"}]')])
        rows = self.store(t).select("aci_labs", {"select": "id", "limit": "1"})
        self.assertEqual(rows, [{"id": "anthropic"}])
        self.assertEqual(t.calls[0]["method"], "GET")
        self.assertIn("/rest/v1/aci_labs?", t.calls[0]["url"])
        self.assertIn("select=id", t.calls[0]["url"])

    def test_the_key_travels_in_both_headers(self):
        t = FakeTransport()
        self.store(t).select("aci_labs")
        headers = t.calls[0]["headers"]
        self.assertEqual(headers["apikey"], "KEY")
        self.assertEqual(headers["Authorization"], "Bearer KEY")

    def test_insert_chunks_so_one_request_never_carries_a_whole_runlog(self):
        t = FakeTransport()
        self.store(t).insert("aci_judgements",
                             [{"locator": str(i)} for i in range(2500)],
                             chunk=1000)
        self.assertEqual(len(t.calls), 3)
        self.assertEqual(len(json.loads(t.calls[0]["body"])), 1000)
        self.assertEqual(len(json.loads(t.calls[2]["body"])), 500)

    def test_insert_of_nothing_makes_no_request(self):
        t = FakeTransport()
        self.store(t).insert("aci_judgements", [])
        self.assertEqual(t.calls, [])

    def test_update_matches_with_postgrest_equality(self):
        t = FakeTransport()
        self.store(t).update("aci_judge_calls", {"id": "abc"},
                             {"status": "done"})
        self.assertEqual(t.calls[0]["method"], "PATCH")
        self.assertIn("id=eq.abc", t.calls[0]["url"])
        self.assertEqual(json.loads(t.calls[0]["body"]), {"status": "done"})

    def test_select_pages_past_the_thousand_row_ceiling(self):
        """PostgREST answers at most a thousand rows and says so in nothing the
        caller can see. Taking that for the whole table is silent data loss."""
        page = lambda n: (200, json.dumps([{"i": i} for i in range(n)]).encode())
        t = FakeTransport([page(1000), page(1000), page(500)])
        rows = self.store(t).select("aci_judgements")
        self.assertEqual(len(rows), 2500)
        self.assertEqual(len(t.calls), 3)
        self.assertIn("offset=0", t.calls[0]["url"])
        self.assertIn("offset=1000", t.calls[1]["url"])
        self.assertIn("offset=2000", t.calls[2]["url"])

    def test_a_short_page_ends_the_paging(self):
        t = FakeTransport([(200, b'[{"i": 1}]')])
        rows = self.store(t).select("aci_judgements")
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(t.calls), 1)

    def test_an_explicit_limit_is_the_caller_asking_for_one_page(self):
        t = FakeTransport([(200, json.dumps([{"i": i} for i in range(5)]).encode())])
        rows = self.store(t).select("aci_labs", {"limit": "5"})
        self.assertEqual(len(rows), 5)
        self.assertEqual(len(t.calls), 1)
        self.assertNotIn("offset=", t.calls[0]["url"])

    def test_a_refused_write_is_loud_and_quotes_the_body(self):
        t = FakeTransport([(403, b'{"message":"permission denied"}')])
        with self.assertRaises(StoreError) as caught:
            self.store(t).insert("aci_spec_versions", [{"markdown": "x"}])
        self.assertIn("403", str(caught.exception))
        self.assertIn("permission denied", str(caught.exception))

    # -- Retry: a request that failed before it could reach the database --
    #
    # A `URLError` that is not an `HTTPError` -- a TLS handshake timeout, a
    # refused or reset connection, a DNS failure -- means `urlopen` never
    # completed sending the request, so it is retried whatever the method.
    # A failure while reading the response (a raw `TimeoutError`, or a
    # `502`/`503`/`504` HTTP status) may already have reached the database,
    # so it is retried only for an idempotent method: GET, PATCH, DELETE.
    # A POST is never retried past the point of sending, since retrying an
    # insert could duplicate a row.

    def test_a_get_retries_a_handshake_timeout_and_then_returns_the_rows(self):
        t = FakeTransport([
            urllib.error.URLError("_ssl.c:993: The handshake operation timed out"),
            urllib.error.URLError("_ssl.c:993: The handshake operation timed out"),
            (200, b'[{"id": "anthropic"}]'),
        ])
        sleeps = []
        rows = self.store(t, sleep=sleeps.append).select("aci_labs", {"limit": "1"})
        self.assertEqual(rows, [{"id": "anthropic"}])
        self.assertEqual(len(t.calls), 3)
        self.assertEqual(sleeps, [2, 4])

    def test_a_post_retries_a_url_error_before_the_connection_completed(self):
        t = FakeTransport([
            urllib.error.URLError("Connection refused"),
            (200, b""),
        ])
        self.store(t, sleep=lambda seconds: None).insert(
            "aci_judgements", [{"locator": "1"}])
        self.assertEqual(len(t.calls), 2)
        self.assertEqual(t.calls[0]["method"], "POST")

    def test_a_post_is_not_retried_after_a_timeout_reading_the_response(self):
        t = FakeTransport([TimeoutError("timed out")])
        with self.assertRaises(TimeoutError):
            self.store(t, sleep=lambda seconds: None).insert(
                "aci_judgements", [{"locator": "1"}])
        self.assertEqual(len(t.calls), 1)

    def test_a_patch_retries_a_503_and_then_succeeds(self):
        t = FakeTransport([(503, b'{"message":"upstream unavailable"}'),
                           (200, b"")])
        self.store(t, sleep=lambda seconds: None).update(
            "aci_judge_calls", {"id": "abc"}, {"status": "done"})
        self.assertEqual(len(t.calls), 2)

    def test_a_400_is_not_retried(self):
        t = FakeTransport([(400, b'{"message":"bad request"}')])
        with self.assertRaises(StoreError):
            self.store(t, sleep=lambda seconds: None).update(
                "aci_judge_calls", {"id": "abc"}, {"status": "done"})
        self.assertEqual(len(t.calls), 1)

    def test_the_last_error_is_raised_once_retries_are_exhausted(self):
        t = FakeTransport([urllib.error.URLError("Connection refused")] * 5)
        sleeps = []
        with self.assertRaises(urllib.error.URLError):
            self.store(t, sleep=sleeps.append).select("aci_labs", {"limit": "1"})
        self.assertEqual(len(t.calls), 5)
        self.assertEqual(sleeps, [2, 4, 8, 16])

    def test_a_patient_store_waits_through_a_cut_of_several_minutes(self):
        t = FakeTransport([urllib.error.URLError("Network is unreachable")] * 7
                          + [(200, b"")])
        sleeps = []
        Store("https://example.supabase.co", "k", transport=t, sleep=sleeps.append,
              backoff=store_module.PATIENT_BACKOFF_SECONDS).update(
            "aci_assessment_calls", {"id": "abc"}, {"status": "done"})
        self.assertEqual(len(t.calls), 8)
        self.assertEqual(sleeps, [2, 4, 8, 16, 30, 60, 120])

    def test_the_commands_that_pay_between_writes_open_a_patient_store(self):
        for path in (HERE / "assess.py", HERE / "panel" / "depth_pass.py"):
            with self.subTest(path=path.name):
                self.assertIn("Store.from_env(backoff=PATIENT_BACKOFF_SECONDS)",
                              path.read_text())

    def test_a_retry_log_line_carries_no_key_or_header_value(self):
        t = FakeTransport([urllib.error.URLError("Connection refused"),
                           (200, b"[]")])
        stderr = io.StringIO()
        with redirect_stderr(stderr):
            self.store(t, sleep=lambda seconds: None).select(
                "aci_labs", {"limit": "1"})
        logged = stderr.getvalue()
        self.assertIn("GET", logged)
        self.assertIn("aci_labs", logged)
        self.assertNotIn("KEY", logged)
        self.assertNotIn("Bearer", logged)
        self.assertNotIn("apikey", logged)


if __name__ == "__main__":
    unittest.main()
