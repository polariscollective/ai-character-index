"""Composing a run: the cell arithmetic, which is the part that can be wrong."""
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
import compose_run               # noqa: E402

CONFIG = {
    "panels": {"two": ["a", "b"]},
    "models": {"a": {"provider": "p", "id": "a-1", "price_per_mtok": [1.0, 2.0]},
               "b": {"provider": "q", "id": "b-1", "price_per_mtok": [1.0, 2.0]}},
}


class FakeStore:
    def __init__(self, done=()):
        self.tables = {
            "aci_behaviours": [
                {"slug": "defined-behaviour", "name": "Defined", "set_name": "reader-test",
                 "numeric_id": 1, "group_name": "g", "definition": "d", "facets": [],
                 "judging": None},
                {"slug": "undefined-behaviour", "name": "Undefined", "set_name": "reader-test",
                 "numeric_id": 2, "group_name": "g", "definition": "d", "facets": [],
                 "judging": None}],
            "aci_spec_versions": [
                {"id": "v-old", "spec_id": "corpus", "version": "2025-06-01",
                 "markdown": "x" * 4000, "source_url": ""},
                {"id": "v-new", "spec_id": "corpus", "version": "2026-01-01",
                 "markdown": "x" * 4000, "source_url": ""}],
            "aci_judge_calls": list(done),
        }
        self.inserted = []

    def select(self, table, params=None):
        return [dict(r) for r in self.tables.get(table, [])]

    def insert(self, table, rows, chunk=1000):
        self.inserted.append((table, len(rows)))


class PlanTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        # An older version of the corpus beside the fixture's own, so a test can
        # name a version that is not the newest.
        cite.SPECS[(fixture.SPEC_NAME, "2025-06-01")] = "corpus"

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def plan(self, store, behaviours=("defined-behaviour", "undefined-behaviour")):
        return compose_run.plan(store, list(behaviours), ["v-new"], "two",
                                config=CONFIG)

    def test_the_calls_are_behaviours_times_versions_times_seats(self):
        run, calls = self.plan(FakeStore())
        self.assertEqual(len(calls), 2 * 1 * 2)

    def test_the_version_named_is_the_version_judged(self):
        _run, calls = compose_run.plan(FakeStore(), ["defined-behaviour"], ["v-old"],
                                       "two", config=CONFIG)
        self.assertEqual({c["spec_version_id"] for c in calls}, {"v-old"},
                         "a document is a version: an older one is judged as itself")

    def test_a_document_the_index_does_not_carry_is_refused(self):
        with self.assertRaises(SystemExit):
            compose_run.plan(FakeStore(), ["defined-behaviour"], ["v-nope"], "two",
                             config=CONFIG)

    def test_every_call_has_a_pending_depth(self):
        _run, calls = self.plan(FakeStore())
        rows = compose_run.depth_rows(calls)
        self.assertEqual([row["call_id"] for row in rows], [call["id"] for call in calls])
        self.assertTrue(all(row["status"] == "pending" for row in rows))

    def test_a_depth_row_names_its_prompt_on_the_scale_of_four(self):
        """A run composes on the scale of four: every depth row it writes names
        that prompt, so batch_job's scale-of-four filter finds it."""
        _run, calls = self.plan(FakeStore())
        rows = compose_run.depth_rows(calls)
        self.assertTrue(all(row["scale"] == 4 for row in rows))
        self.assertTrue(all(row["prompt_sha256"] == compose_run.depth_call.prompt_sha256(4)
                            for row in rows))

    def test_the_depth_calls_are_priced(self):
        dear = dict(CONFIG, models={k: dict(v, price_per_mtok=[1000.0, 2000.0])
                                    for k, v in CONFIG["models"].items()})
        run, _calls = compose_run.plan(FakeStore(), ["defined-behaviour"], ["v-new"],
                                       "two", config=dear)
        passages = len(compose_run.h.passages("corpus", "2026-01-01"))
        passages_only = 2 * compose_run.seat_cost(
            "a", 4000 // 4, passages * compose_run.OUTPUT_TOKENS_PER_PASSAGE, dear)
        self.assertGreater(run["estimated_usd"], round(passages_only, 2))

    def test_the_run_records_the_depth_prompt_it_will_use(self):
        run, _calls = self.plan(FakeStore())
        self.assertEqual(run["config"]["depth_prompt_sha256"],
                         compose_run.depth_call.prompt_sha256())

    def test_without_a_panel_the_display_panel_is_used(self):
        config = dict(CONFIG, display={"panel": "two"})
        run, _calls = compose_run.plan(FakeStore(), ["defined-behaviour"], ["v-new"],
                                       config=config)
        self.assertEqual(run["panel"], ["a", "b"])

    def test_a_cell_a_done_call_covers_is_not_composed_again(self):
        done = [{"id": "c", "run_id": "old", "behaviour_slug": "defined-behaviour",
                 "spec_version_id": "v-new", "model": "a", "status": "done"}]
        _run, calls = self.plan(FakeStore(done))
        self.assertEqual(len(calls), 3)
        self.assertNotIn(("defined-behaviour", "a"),
                         {(c["behaviour_slug"], c["model"]) for c in calls})

    def test_judging_again_composes_every_seat_a_done_call_already_covers(self):
        """A publication needs all of a cell's judges in one run, so judging a cell
        again must write the whole panel, not the seats nobody has filled."""
        done = [{"id": "c", "run_id": "old", "behaviour_slug": "defined-behaviour",
                 "spec_version_id": "v-new", "model": "a", "status": "done"}]
        _run, calls = compose_run.plan(FakeStore(done), ["defined-behaviour"], ["v-new"],
                                       "two", config=CONFIG, again=True)
        self.assertEqual(sorted(c["model"] for c in calls), ["a", "b"])

    def test_a_call_that_failed_is_composed_again(self):
        failed = [{"id": "c", "run_id": "old", "behaviour_slug": "defined-behaviour",
                   "spec_version_id": "v-new", "model": "a", "status": "error"}]
        _run, calls = self.plan(FakeStore(failed))
        self.assertEqual(len(calls), 4)

    def test_the_estimate_follows_the_documents_and_the_prices(self):
        run, _calls = self.plan(FakeStore())
        self.assertGreater(run["estimated_usd"], 0)
        dearer = dict(CONFIG, models={k: dict(v, price_per_mtok=[10.0, 20.0])
                                      for k, v in CONFIG["models"].items()})
        pricier, _ = compose_run.plan(FakeStore(), ["defined-behaviour"], ["v-new"],
                                      "two", config=dearer)
        cheaper, _ = compose_run.plan(FakeStore(), ["defined-behaviour"], ["v-new"],
                                      "two", config=CONFIG)
        self.assertGreater(pricier["estimated_usd"], cheaper["estimated_usd"])

    def test_the_run_freezes_what_it_will_judge_against(self):
        run, _calls = self.plan(FakeStore())
        self.assertEqual(sorted(run["behaviours"]),
                         ["defined-behaviour", "undefined-behaviour"])
        self.assertEqual(len(run["prompt_sha256"]), 64)
        self.assertEqual(run["panel"], ["a", "b"])

    def test_an_unknown_behaviour_is_refused_rather_than_composed(self):
        with self.assertRaises(SystemExit):
            self.plan(FakeStore(), behaviours=("no-such-behaviour",))


if __name__ == "__main__":
    unittest.main()
