"""Store tests. The transport is injected, so nothing here touches a network."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from store import Store, StoreError


class FakeTransport:
    """Records requests and replays canned responses."""

    def __init__(self, responses=None):
        self.calls = []
        self.responses = list(responses or [])

    def __call__(self, method, url, headers, body):
        self.calls.append({"method": method, "url": url,
                           "headers": headers, "body": body})
        if self.responses:
            return self.responses.pop(0)
        return 200, b"[]"


class StoreTest(unittest.TestCase):
    def store(self, transport):
        return Store("https://example.supabase.co", "KEY", transport=transport)

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

    def test_a_refused_write_is_loud_and_quotes_the_body(self):
        t = FakeTransport([(403, b'{"message":"permission denied"}')])
        with self.assertRaises(StoreError) as caught:
            self.store(t).insert("aci_spec_versions", [{"markdown": "x"}])
        self.assertIn("403", str(caught.exception))
        self.assertIn("permission denied", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
