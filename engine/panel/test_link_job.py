"""The link job's loop, against a fake store and a stub model: no network, no keys."""
import sys
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
import link_job                  # noqa: E402

RUN = "link-run-1"
SOURCES = [("src-1", "A > B", "The document should say what it means."),
           ("src-2", "A > C", "It should say what it does not mean.")]
TARGETS = [("tgt-1", "X > Y", "This document says what it means."),
           ("tgt-2", "X > Z", "This document is warm.")]


def call_row(n, model, status="pending", **extra):
    return dict({"id": f"link-call-{n}", "run_id": RUN,
                 "behaviour_slug": "defined-behaviour",
                 "source_version_id": "v-corpus", "target_version_id": "v-second",
                 "model": model, "status": status, "sources": None, "uncovered": None,
                 "raw_output": None, "error": None, "cost_usd": None}, **extra)


class FakeStore:
    def __init__(self, calls, run_status="pending"):
        self.tables = {
            "aci_link_runs": [{"id": RUN, "status": run_status, "panel": ["sol"],
                               "prompt": "", "behaviours": {}, "cost_usd": None}],
            "aci_link_calls": calls,
            "aci_links": [],
            "aci_spec_versions": [
                {"id": "v-corpus", "spec_id": "corpus", "version": "2026-01-01",
                 "markdown": "", "source_url": ""},
                {"id": "v-second", "spec_id": "second", "version": "2026-02-01",
                 "markdown": "", "source_url": ""}],
            "aci_behaviours": [],
        }
        self.updates = []
        self.insert_calls = []

    def select(self, table, params=None):
        rows = [dict(r) for r in self.tables.get(table, [])]
        for column, value in (params or {}).items():
            if column == "select" or not isinstance(value, str) or not value.startswith("eq."):
                continue
            want = value[len("eq."):]
            rows = [r for r in rows if str(r.get(column)) == want]
        return rows

    def insert(self, table, rows, chunk=1000):
        self.insert_calls.append((table, chunk, len(rows)))
        self.tables.setdefault(table, []).extend(rows)

    def update(self, table, match, patch):
        self.updates.append((table, dict(match), dict(patch)))
        for row in self.tables.get(table, []):
            if all(row.get(k) == v for k, v in match.items()):
                row.update(patch)


def good_reply(**kwargs):
    return ("[1] -> [1] same (nobody/user): both state the meaning.\n"
            "[2] -> none: nothing bears on this.",
            {"prompt_tokens": 100, "completion_tokens": 20}, "stop", 0.2)


def half_reply(**kwargs):
    return ("[1] -> [1] same (nobody/user): only the first.",
            {"prompt_tokens": 100, "completion_tokens": 10}, "stop", 0.2)


class DuplicateOnceStore(FakeStore):
    """A store whose links insert lands on the server -- the rows are there
    afterwards -- but whose caller sees a 23505 duplicate-key failure instead of
    a response, the way a lost network reply would look."""

    def insert(self, table, rows, chunk=1000):
        super().insert(table, rows, chunk=chunk)
        if table == "aci_links":
            raise link_job.batch_job.StoreError(
                "POST aci_links -> 409: duplicate key value violates unique "
                'constraint "aci_links_call_id_source_locator_target_locator_key" '
                "(23505)")


class LinkJobTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def go(self, store, model=good_reply, **kwargs):
        return link_job.run(store, RUN, call_model=model, registry=self.registry,
                            passages_for=lambda spec, version: (
                                SOURCES if spec == "corpus" else TARGETS),
                            retained_for=lambda store, slug, version: SOURCES,
                            concurrency=1, **kwargs)

    def test_a_duplicate_key_insert_leaves_the_call_done_and_does_not_crash_the_run(self):
        """A death between the insert and the PATCH that marks the call done
        leaves the links stored and the call not done. The relaunch meets the
        unique key, and must finish the call rather than let a constraint stop
        the run and strand it in `running` for good."""
        store = DuplicateOnceStore([call_row(1, "sol")])
        report = self.go(store)
        self.assertEqual((report["done"], report["failed"]), (1, 0))
        call = store.tables["aci_link_calls"][0]
        self.assertEqual(call["status"], "done")
        self.assertIsNone(call["error"])
        self.assertEqual(len(store.tables["aci_links"]), 2)

    def test_a_call_walks_from_pending_to_done_and_writes_its_links(self):
        store = FakeStore([call_row(1, "sol")])
        report = self.go(store)
        self.assertEqual((report["attempted"], report["done"], report["failed"]), (1, 1, 0))
        rows = store.tables["aci_links"]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["source_locator"], "src-1")
        self.assertEqual(rows[0]["target_locator"], "tgt-1")
        self.assertEqual(rows[1]["relation"], "absent")
        statuses = [p["status"] for t, m, p in store.updates
                    if t == "aci_link_calls" and "status" in p]
        self.assertEqual(statuses, ["running", "done"])

    def test_only_calls_that_are_not_done_are_taken(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable", status="done")])
        report = self.go(store)
        self.assertEqual(report["attempted"], 1)

    def test_a_reply_missing_a_source_keeps_its_raw_output_and_writes_no_link(self):
        store = FakeStore([call_row(1, "sol")])
        report = self.go(store, model=half_reply)
        self.assertEqual(store.tables["aci_links"], [])
        self.assertEqual(report["failed"], 1)
        call = store.tables["aci_link_calls"][0]
        self.assertEqual(call["status"], "error")
        self.assertIn("only the first", call["raw_output"])
        self.assertIn("1 of 2", call["error"])
        self.assertEqual(call["uncovered"], 1)

    def test_a_failed_call_does_not_stop_the_run(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable")])
        replies = iter([half_reply, good_reply])
        report = self.go(store, model=lambda **k: next(replies)(**k))
        self.assertEqual((report["done"], report["failed"]), (1, 1))

    def test_a_provider_refusal_is_recorded_and_the_run_carries_on(self):
        def refuses(**kwargs):
            raise RuntimeError("content filter")
        store = FakeStore([call_row(1, "sol")])
        report = self.go(store, model=refuses)
        self.assertEqual(report["failed"], 1)
        self.assertIn("content filter", store.tables["aci_link_calls"][0]["error"])

    def test_a_cancelled_run_stops_between_calls(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable")],
                          run_status="cancelled")
        report = self.go(store)
        self.assertEqual(report["attempted"], 0)
        self.assertTrue(report["cancelled"])

    def test_relaunching_resumes_and_repeats_nothing(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable")])
        self.go(store)
        before = len(store.tables["aci_links"])
        report = self.go(store)
        self.assertEqual(report["attempted"], 0)
        self.assertEqual(len(store.tables["aci_links"]), before)

    def test_the_run_is_finished_with_its_cost_summed_from_its_calls(self):
        store = FakeStore([call_row(1, "sol")])
        self.go(store)
        finished = [p for t, m, p in store.updates
                    if t == "aci_link_runs" and p.get("status") == "done"]
        self.assertEqual(len(finished), 1)
        self.assertIsNotNone(finished[0]["cost_usd"])

    def test_the_call_is_metered_with_its_source_count(self):
        store = FakeStore([call_row(1, "sol")])
        self.go(store)
        call = store.tables["aci_link_calls"][0]
        self.assertEqual(call["sources"], 2)
        self.assertEqual(call["uncovered"], 0)
        self.assertIsNotNone(call["prompt_tokens"])


if __name__ == "__main__":
    unittest.main()
