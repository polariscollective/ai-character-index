"""Composing a link run: which cells, which directions, and what it would cost."""
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
import compose_links             # noqa: E402

CONFIG = {
    "panels": {"two": ["a", "b"]},
    "display": {"panel": "two"},
    "models": {"a": {"provider": "p", "id": "a-1", "price_per_mtok": [1.0, 2.0]},
               "b": {"provider": "q", "id": "b-1", "price_per_mtok": [1.0, 2.0]}},
}

CORPUS = {"id": "v-corpus", "spec_id": "corpus", "version": "2026-01-01",
          "markdown": "x" * 4000, "source_url": ""}
SECOND = {"id": "v-second", "spec_id": "second", "version": "2026-02-01",
          "markdown": "y" * 4000, "source_url": ""}


def judged(slug, version_id, locators, models=("a", "b"), status="done",
           run_id="old", finished_at="2026-09-01T00:00:00Z"):
    """One done call per model for a cell, and a core verdict from each on every
    locator given, which is what makes those passages retained."""
    calls, judgements = [], []
    for model in models:
        call_id = f"{slug}-{version_id}-{model}"
        calls.append({"id": call_id, "run_id": run_id, "behaviour_slug": slug,
                      "spec_version_id": version_id, "model": model, "status": status,
                      "finished_at": finished_at})
        for locator in locators:
            judgements.append({"call_id": call_id, "locator": locator,
                               "verdict": 2, "relevant": 1, "parsed": True})
    return calls, judgements


class FakeStore:
    def __init__(self, calls=(), judgements=(), link_calls=()):
        self.tables = {
            "aci_behaviours": [
                {"slug": "defined-behaviour", "name": "Defined", "numeric_id": 1,
                 "group_name": "g", "definition": "d", "facets": [], "judging": None}],
            "aci_spec_versions": [dict(CORPUS), dict(SECOND)],
            "aci_judge_calls": [dict(c) for c in calls],
            "aci_judgements": [dict(j) for j in judgements],
            "aci_link_calls": [dict(c) for c in link_calls],
        }
        self.inserted = []

    def select(self, table, params=None):
        return [dict(r) for r in self.tables.get(table, [])]

    def insert(self, table, rows, chunk=1000):
        self.inserted.append((table, len(rows)))
        self.tables.setdefault(table, []).extend(rows)


class ComposeLinksTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.corpus = compose_links.h.passages("corpus", "2026-01-01")
        cls.second = compose_links.h.passages("second", "2026-02-01")

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def store(self, **kwargs):
        corpus_calls, corpus_judgements = judged(
            "defined-behaviour", "v-corpus", [p[0] for p in self.corpus[:2]])
        second_calls, second_judgements = judged(
            "defined-behaviour", "v-second", [p[0] for p in self.second[:1]])
        return FakeStore(calls=corpus_calls + second_calls,
                         judgements=corpus_judgements + second_judgements, **kwargs)

    def plan(self, store=None, **kwargs):
        return compose_links.plan(store or self.store(), ["defined-behaviour"],
                                  ["v-corpus", "v-second"], config=CONFIG, **kwargs)

    def test_both_directions_are_composed_for_every_seat(self):
        _run, calls = self.plan()
        self.assertEqual(len(calls), 2 * 2)
        self.assertEqual(
            {(c["source_version_id"], c["target_version_id"]) for c in calls},
            {("v-corpus", "v-second"), ("v-second", "v-corpus")})

    def test_no_call_compares_a_document_with_itself(self):
        _run, calls = self.plan()
        self.assertTrue(all(c["source_version_id"] != c["target_version_id"]
                            for c in calls))

    def test_the_sources_are_the_cells_defining_and_core_passages(self):
        store = self.store()
        retained = compose_links.retained_passages(store, "defined-behaviour", CORPUS)
        self.assertEqual([p[0] for p in retained], [p[0] for p in self.corpus[:2]])

    def test_a_cell_with_nothing_retained_is_refused_rather_than_composed(self):
        store = FakeStore()
        with self.assertRaises(SystemExit) as refused:
            compose_links.plan(store, ["defined-behaviour"], ["v-corpus", "v-second"],
                               config=CONFIG)
        self.assertIn("nothing to compare", str(refused.exception))

    def test_one_document_is_refused_because_a_link_has_two_sides(self):
        with self.assertRaises(SystemExit):
            compose_links.plan(self.store(), ["defined-behaviour"], ["v-corpus"],
                               config=CONFIG)

    def test_an_unknown_behaviour_or_document_is_refused(self):
        with self.assertRaises(SystemExit):
            compose_links.plan(self.store(), ["no-such-behaviour"],
                               ["v-corpus", "v-second"], config=CONFIG)
        with self.assertRaises(SystemExit):
            compose_links.plan(self.store(), ["defined-behaviour"],
                               ["v-corpus", "v-nope"], config=CONFIG)

    def test_a_direction_a_done_call_covers_is_not_composed_again(self):
        done = [{"id": "l1", "run_id": "old", "behaviour_slug": "defined-behaviour",
                 "source_version_id": "v-corpus", "target_version_id": "v-second",
                 "model": "a", "status": "done"}]
        _run, calls = self.plan(self.store(link_calls=done))
        self.assertEqual(len(calls), 3)

    def test_again_composes_every_seat_a_done_call_already_covers(self):
        done = [{"id": "l1", "run_id": "old", "behaviour_slug": "defined-behaviour",
                 "source_version_id": "v-corpus", "target_version_id": "v-second",
                 "model": "a", "status": "done"}]
        _run, calls = self.plan(self.store(link_calls=done), again=True)
        self.assertEqual(len(calls), 4)

    def test_the_estimate_counts_the_whole_target_document(self):
        run, _calls = self.plan()
        self.assertGreater(run["estimated_usd"], 0)
        dearer = dict(CONFIG, models={k: dict(v, price_per_mtok=[100.0, 200.0])
                                      for k, v in CONFIG["models"].items()})
        pricier, _ = compose_links.plan(self.store(), ["defined-behaviour"],
                                        ["v-corpus", "v-second"], config=dearer)
        self.assertGreater(pricier["estimated_usd"], run["estimated_usd"])

    def test_the_run_freezes_its_prompt_its_panel_and_its_briefs(self):
        run, _calls = self.plan()
        self.assertEqual(run["prompt_sha256"], compose_links.link_call.prompt_sha256())
        self.assertEqual(run["panel"], ["a", "b"])
        self.assertEqual(sorted(run["behaviours"]), ["defined-behaviour"])
        self.assertEqual(run["status"], "pending")

    def test_the_newest_run_of_a_cell_is_the_one_read(self):
        """Two runs judged this cell. The passages compared are the newer run's,
        because mixing two panels would band a passage on a judge count that
        never read it together."""
        old_calls, old_judgements = judged(
            "defined-behaviour", "v-corpus", [p[0] for p in self.corpus[:2]],
            run_id="old", finished_at="2026-08-01T00:00:00Z")
        new_calls, new_judgements = judged(
            "defined-behaviour", "v-corpus", [p[0] for p in self.corpus[2:3]],
            run_id="new", finished_at="2026-09-10T00:00:00Z")
        store = FakeStore(calls=old_calls + new_calls,
                          judgements=old_judgements + new_judgements)
        retained = compose_links.retained_passages(store, "defined-behaviour", CORPUS)
        self.assertEqual([p[0] for p in retained], [p[0] for p in self.corpus[2:3]])


if __name__ == "__main__":
    unittest.main()
