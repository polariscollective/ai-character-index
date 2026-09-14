"""The job's loop, against a fake store and a stub model: no network, no keys."""
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
import batch_job                 # noqa: E402

RUN = "run-1"
SPEC_VERSION = "corpus"


def call_row(n, model, status="pending", **extra):
    return dict({"id": f"call-{n}", "run_id": RUN, "behaviour_slug": "defined-behaviour",
                 "spec_version_id": SPEC_VERSION, "model": model, "status": status,
                 "passages": None, "unparsed": None, "raw_output": None,
                 "error": None, "cost_usd": None}, **extra)


class FakeStore:
    """Answers selects from what it holds and records every write."""

    def __init__(self, calls, run_status="pending"):
        self.tables = {
            "aci_runs": [{"id": RUN, "status": run_status, "rubric": "v5",
                          "panel": ["sol"], "config": {"via": "wholedoc-v5"},
                          "behaviours": {}, "prompt": "", "cost_usd": None}],
            "aci_judge_calls": calls,
            "aci_judgements": [],
            "aci_spec_versions": [{"id": SPEC_VERSION, "spec_id": "corpus",
                                   "version": "2026-01-01", "markdown": "",
                                   "source_url": ""}],
            "aci_specs": [{"id": "corpus", "lab_id": "corpus-labs", "title": "Corpus",
                           "short_title": "Corpus", "source_url": "",
                           "locator_style": "anchor"}],
            "aci_labs": [{"id": "corpus-labs", "name": "Corpus Labs"}],
            "aci_behaviours": [],
        }
        self.updates = []

    def select(self, table, params=None):
        return [dict(r) for r in self.tables.get(table, [])]

    def insert(self, table, rows, chunk=1000):
        self.tables.setdefault(table, []).extend(rows)

    def update(self, table, match, patch):
        self.updates.append((table, dict(match), dict(patch)))
        for row in self.tables.get(table, []):
            if all(row.get(k) == v for k, v in match.items()):
                row.update(patch)


def good_reply(passage_count):
    return lambda **kwargs: ("\n".join(f"[{i}]: 2" for i in range(1, passage_count + 1)),
                             {"prompt_tokens": 10, "completion_tokens": 5}, "stop", 0.1)


def unparseable(**kwargs):
    return ("I would rather not.", {"prompt_tokens": 10, "completion_tokens": 2},
            "stop", 0.1)


def depth_row(n, status="pending"):
    return {"call_id": f"call-{n}", "status": status, "cost_usd": None}


def zero_reply(passage_count):
    return lambda **kwargs: ("\n".join(f"[{i}]: 0" for i in range(1, passage_count + 1)),
                             {"prompt_tokens": 10, "completion_tokens": 5}, "stop", 0.1)


class BatchJobTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()
        cls.passages = batch_job.h.passages("corpus")

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def go(self, store, model=None, **kwargs):
        return batch_job.run(store, RUN, call_model=model or good_reply(len(self.passages)),
                             registry=self.registry,
                             passages_for=lambda spec, version: self.passages,
                             **kwargs)

    def test_only_pending_calls_are_taken(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable", status="done")])
        report = self.go(store)
        self.assertEqual(report["attempted"], 1)
        self.assertEqual(report["done"], 1)

    def test_a_call_walks_from_pending_to_done(self):
        store = FakeStore([call_row(1, "sol")])
        self.go(store)
        statuses = [p["status"] for t, m, p in store.updates
                    if t == "aci_judge_calls" and "status" in p]
        self.assertEqual(statuses, ["running", "done"])

    def test_judgements_are_written_once_per_passage(self):
        store = FakeStore([call_row(1, "sol")])
        self.go(store)
        rows = store.tables["aci_judgements"]
        self.assertEqual(len(rows), len(self.passages))
        self.assertEqual(len({r["locator"] for r in rows}), len(self.passages))

    def test_a_parse_failure_keeps_its_raw_output_and_writes_no_judgement(self):
        store = FakeStore([call_row(1, "sol")])
        report = self.go(store, model=unparseable)
        self.assertEqual(store.tables["aci_judgements"], [])
        self.assertEqual(report["failed"], 1)
        patch = [p for t, m, p in store.updates if p.get("status") == "error"][0]
        self.assertIn("rather not", patch["raw_output"])
        self.assertIsNotNone(patch["error"])

    def test_a_failed_call_does_not_stop_the_run(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable")])
        replies = iter([unparseable, good_reply(len(self.passages))])
        report = self.go(store, model=lambda **k: next(replies)(**k), concurrency=1)
        self.assertEqual(report["attempted"], 2)
        self.assertEqual((report["done"], report["failed"]), (1, 1))

    def test_a_cancelled_run_stops_between_calls(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable")], run_status="cancelled")
        report = self.go(store, concurrency=1)
        self.assertEqual(report["attempted"], 0)
        self.assertEqual(report["cancelled"], True)

    def test_relaunching_resumes_and_repeats_nothing(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable")])
        self.go(store, concurrency=1)
        before = len(store.tables["aci_judgements"])
        report = self.go(store, concurrency=1)
        self.assertEqual(report["attempted"], 0)
        self.assertEqual(len(store.tables["aci_judgements"]), before)

    def test_the_run_is_finished_with_its_cost_summed_from_its_calls(self):
        store = FakeStore([call_row(1, "sol")])
        self.go(store)
        finished = [p for t, m, p in store.updates
                    if t == "aci_runs" and p.get("status") == "done"]
        self.assertEqual(len(finished), 1)
        self.assertIn("finished_at", finished[0])
        self.assertIsNotNone(finished[0]["cost_usd"])


class DepthTest(unittest.TestCase):
    """A cell's depths wait for all its passage calls, then each judge gives one."""

    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()
        cls.passages = batch_job.h.passages("corpus")

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def store(self, calls, depths, run_status="pending"):
        store = FakeStore(calls, run_status=run_status)
        store.tables["aci_depths"] = depths
        return store

    def replying(self, passages=None, depth="DEPTH: 3\nRATIONALE: Rules, no examples."):
        asked = []
        passages = passages or good_reply(len(self.passages))
        def model(**kwargs):
            if "DEPTH" in kwargs["system"]:
                asked.append(kwargs["user"])
                return depth, {"prompt_tokens": 20, "completion_tokens": 8}, "stop", 0.1
            return passages(**kwargs)
        return model, asked

    def go(self, store, model):
        return batch_job.run(store, RUN, call_model=model, registry=self.registry,
                             passages_for=lambda spec, version: self.passages,
                             concurrency=1)

    def test_each_judge_gives_a_depth_once_the_cell_is_judged(self):
        store = self.store([call_row(1, "sol"), call_row(2, "fable")],
                           [depth_row(1), depth_row(2)])
        model, asked = self.replying()
        report = self.go(store, model)
        self.assertEqual(len(asked), 2)
        self.assertEqual([d["status"] for d in store.tables["aci_depths"]], ["done", "done"])
        self.assertEqual([d["depth"] for d in store.tables["aci_depths"]], [3, 3])
        self.assertEqual(store.tables["aci_depths"][0]["passages"], len(self.passages))
        self.assertEqual(report["depths"], {"done": 2, "failed": 0})

    def test_a_cell_with_a_failed_passage_call_gives_no_depth_yet(self):
        store = self.store([call_row(1, "sol"), call_row(2, "fable")],
                           [depth_row(1), depth_row(2)])
        replies = iter([unparseable, good_reply(len(self.passages))])
        model, asked = self.replying(passages=lambda **k: next(replies)(**k))
        self.go(store, model)
        self.assertEqual(asked, [])
        self.assertEqual([d["status"] for d in store.tables["aci_depths"]],
                         ["pending", "pending"])

    def test_a_cell_with_no_retained_passage_gets_depth_zero_without_a_call(self):
        store = self.store([call_row(1, "sol"), call_row(2, "fable")],
                           [depth_row(1), depth_row(2)])
        model, asked = self.replying(passages=zero_reply(len(self.passages)))
        self.go(store, model)
        self.assertEqual(asked, [])
        for row in store.tables["aci_depths"]:
            self.assertEqual((row["status"], row["depth"], row["passages"]), ("done", 0, 0))
            self.assertEqual(row["rationale"], batch_job.depth_call.NOTHING_RETAINED)

    def test_an_unparsable_depth_keeps_its_reply_and_fails(self):
        store = self.store([call_row(1, "sol"), call_row(2, "fable")],
                           [depth_row(1), depth_row(2)])
        model, _asked = self.replying(depth="I would rather not grade this.")
        report = self.go(store, model)
        self.assertEqual(report["depths"], {"done": 0, "failed": 2})
        row = store.tables["aci_depths"][0]
        self.assertEqual(row["status"], "error")
        self.assertIn("rather not", row["raw_output"])

    def test_a_relaunch_gives_the_depths_that_failed_and_repeats_no_passage(self):
        store = self.store([call_row(1, "sol"), call_row(2, "fable")],
                           [depth_row(1), depth_row(2)])
        self.go(store, self.replying(depth="no answer")[0])
        report = self.go(store, self.replying()[0])
        self.assertEqual(report["attempted"], 0)
        self.assertEqual([d["status"] for d in store.tables["aci_depths"]], ["done", "done"])

    def test_a_run_composed_without_depths_gives_none(self):
        store = self.store([call_row(1, "sol")], [])
        model, asked = self.replying()
        self.go(store, model)
        self.assertEqual(asked, [])

    def test_a_cancelled_run_gives_no_depth(self):
        store = self.store([call_row(1, "sol", status="done")], [depth_row(1)],
                           run_status="cancelled")
        model, asked = self.replying()
        self.go(store, model)
        self.assertEqual(asked, [])

    def test_the_run_cost_includes_the_depths(self):
        store = self.store([call_row(1, "sol")], [depth_row(1)])
        self.go(store, self.replying()[0])
        rows = store.tables["aci_judge_calls"] + store.tables["aci_depths"]
        expected = round(sum(row["cost_usd"] for row in rows), 6)
        finished = [p for t, m, p in store.updates
                    if t == "aci_runs" and p.get("status") == "done"]
        self.assertEqual(finished[-1]["cost_usd"], expected)


class RoutingTest(unittest.TestCase):
    """With only OPENROUTER_API_KEY set, every seat must resolve to its mirror.

    harness.resolve prefers a native route whenever that provider's key is
    present, so a container carrying ANTHROPIC_API_KEY beside the OpenRouter one
    would send the Anthropic seat direct. Nothing would say so; the bill would.
    """

    def test_every_seat_of_the_shipped_panel_routes_through_openrouter(self):
        import os
        config = batch_job.h.load_config()
        keys = {p["key_env"] for p in config["providers"].values()}
        saved = {k: os.environ.pop(k, None) for k in keys}
        os.environ["OPENROUTER_API_KEY"] = "test"
        try:
            for tag in config["panels"]["frontier_fast"] + ["opus"]:
                provider, model_id = batch_job.h.resolve(tag, config)
                self.assertEqual(provider, "openrouter", f"{tag} went direct")
                self.assertEqual(model_id, config["models"][tag]["openrouter"]["id"])
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v
                elif k in os.environ and k != "OPENROUTER_API_KEY":
                    del os.environ[k]


if __name__ == "__main__":
    unittest.main()
