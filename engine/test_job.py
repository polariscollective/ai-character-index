#!/usr/bin/env python3
"""The job's dispatch, against a store that is a dictionary.

What this pins is the contract between the portal and the container: the row says
what the work is, the environment says only which row, and the row is always
written at the end -- including when the work refused.

Run: python3 engine/test_job.py
"""
import os
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "panel"))
sys.path.insert(0, str(HERE / "spec-cite"))

import job as job_module          # noqa: E402


class FakeStore:
    """Tables as lists of dicts. select returns them, update patches in place."""

    def __init__(self, **tables):
        self.tables = {name: rows for name, rows in tables.items()}
        self.inserted = []

    def select(self, table, params=None):
        return self.tables.get(table, [])

    def insert(self, table, rows, chunk=1000, returning=False):
        self.inserted.append((table, rows))
        self.tables.setdefault(table, []).extend(rows)
        return [dict(row, id=row.get("id", "written")) for row in rows] if returning else None

    def update(self, table, match, patch):
        for row in self.tables.get(table, []):
            if all(row.get(k) == v for k, v in match.items()):
                row.update(patch)


def store_with_job(**fields):
    job = {"id": "job-1", "mode": "judge", "params": {}, "status": "pending"} | fields
    return FakeStore(aci_jobs=[job]), job


class JobDispatchTest(unittest.TestCase):
    def setUp(self):
        self.env = dict(os.environ)
        self.addCleanup(lambda: (os.environ.clear(), os.environ.update(self.env)))
        self.modes = dict(job_module.MODES)
        self.addCleanup(lambda: job_module.MODES.update(self.modes))

    def run_job(self, store, mode="judge", job_id="job-1"):
        os.environ["ACI_JOB_ID"] = job_id
        os.environ["ACI_JOB_MODE"] = mode
        job_module.Store = type("S", (), {"from_env": staticmethod(lambda: store)})
        return job_module.main()

    def test_the_row_says_what_to_do_and_the_environment_only_which_row(self):
        store, job = store_with_job(params={"run_id": "r-7"})
        seen = {}
        job_module.MODES["judge"] = lambda s, params: seen.update(params) or {"run_id": "r-7"}
        self.assertEqual(self.run_job(store), 0)
        self.assertEqual(seen, {"run_id": "r-7"})
        self.assertEqual(job["status"], "done")
        self.assertEqual(job["run_id"], "r-7")
        self.assertTrue(job["finished_at"])

    def test_a_mode_that_disagrees_with_the_row_is_refused(self):
        store, job = store_with_job(mode="publish")
        with self.assertRaises(SystemExit) as refused:
            self.run_job(store, mode="judge")
        self.assertIn("is a publish job", str(refused.exception))
        self.assertEqual(job["status"], "pending", "a refused job must not look started")

    def test_an_unknown_job_is_refused(self):
        store, _ = store_with_job()
        with self.assertRaises(SystemExit) as refused:
            self.run_job(store, job_id="nobody")
        self.assertIn("no job nobody", str(refused.exception))

    def test_running_is_written_before_the_work_and_never_left_behind(self):
        store, job = store_with_job()
        states = []
        def work(s, params):
            states.append(job["status"])
            raise SystemExit("the panel refused")
        job_module.MODES["judge"] = work
        self.assertEqual(self.run_job(store), 1)
        self.assertEqual(states, ["running"])
        self.assertEqual(job["status"], "error")
        self.assertEqual(job["error"], "the panel refused")
        self.assertTrue(job["finished_at"])

    def test_a_refusal_with_no_message_still_names_something(self):
        store, job = store_with_job()
        job_module.MODES["judge"] = lambda s, p: (_ for _ in ()).throw(KeyboardInterrupt())
        self.assertEqual(self.run_job(store), 1)
        self.assertEqual(job["error"], "KeyboardInterrupt")

    def test_publish_records_what_it_produced(self):
        store, job = store_with_job(mode="publish")
        job_module.MODES["publish"] = lambda s, p: {"publication_id": "pub-3",
                                                   "detail": "2 cells"}
        self.assertEqual(self.run_job(store, mode="publish"), 0)
        self.assertEqual(job["publication_id"], "pub-3")


class ComposeTest(unittest.TestCase):
    def test_nothing_to_do_writes_nothing_and_says_so(self):
        """Asking twice for work already done must cost nothing the second time,
        and must not leave an empty run behind to look at."""
        store = FakeStore()
        plan = lambda *a, **k: ({"id": "r", "estimated_usd": 0}, [])
        sys.modules["compose_run"] = type("M", (), {"plan": staticmethod(plan)})
        result = job_module.run_compose(store, {"behaviours": ["a"], "specs": ["x"]})
        self.assertIsNone(result["run_id"])
        self.assertEqual(store.inserted, [])
        self.assertIn("already", result["detail"])

    def test_a_priced_run_is_written_with_its_calls_and_its_author(self):
        store = FakeStore()
        run = {"id": "r-9", "estimated_usd": 3.12}
        calls = [{"id": "c1"}, {"id": "c2"}]
        sys.modules["compose_run"] = type(
            "M", (), {"plan": staticmethod(lambda *a, **k: (run, calls))})
        result = job_module.run_compose(
            store, {"behaviours": ["a"], "specs": ["x"], "created_by": "me@example.com"})
        self.assertEqual(result["run_id"], "r-9")
        self.assertEqual(run["created_by"], "me@example.com")
        self.assertEqual([table for table, _ in store.inserted],
                         ["aci_runs", "aci_judge_calls"])
        self.assertIn("$3.12", result["detail"])


if __name__ == "__main__":
    unittest.main()
