"""One run to a report: the numbers a reader of the pilot needs."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "engine"))
import link_report               # noqa: E402

RUN = "link-run-1"
SOURCES = [("src-1", "A > B", "The document should say what it means."),
           ("src-2", "A > C", "It should say what it does not mean.")]
TARGETS = [("tgt-1", "X > Y", "This document says what it means.")]


def call_row(n, model):
    return {"id": f"link-call-{n}", "run_id": RUN, "behaviour_slug": "defined-behaviour",
            "source_version_id": "v-corpus", "target_version_id": "v-second",
            "model": model, "status": "done", "cost_usd": 0.5}


def link(call_id, source, target, relation="same"):
    return {"call_id": call_id, "source_locator": source, "target_locator": target,
            "relation": relation, "source_force": "nobody", "target_force": "user",
            "rationale": "because."}


def absent(call_id, source):
    return {"call_id": call_id, "source_locator": source, "target_locator": None,
            "relation": "absent", "source_force": None, "target_force": None,
            "rationale": "nothing found."}


class FakeStore:
    def __init__(self):
        self.tables = {
            "aci_link_runs": [{"id": RUN, "status": "done", "panel": ["a", "b", "c"],
                               "cost_usd": 1.5, "estimated_usd": 2.0,
                               "prompt_sha256": "abc", "behaviours": {}}],
            "aci_link_calls": [call_row(1, "a"), call_row(2, "b"), call_row(3, "c")],
            "aci_links": [
                link("link-call-1", "src-1", "tgt-1"),
                link("link-call-2", "src-1", "tgt-1"),
                absent("link-call-3", "src-1"),
                absent("link-call-1", "src-2"),
                absent("link-call-2", "src-2"),
                absent("link-call-3", "src-2")],
            "aci_spec_versions": [
                {"id": "v-corpus", "spec_id": "corpus", "version": "2026-01-01",
                 "markdown": "", "source_url": ""},
                {"id": "v-second", "spec_id": "second", "version": "2026-02-01",
                 "markdown": "", "source_url": ""}],
        }

    def select(self, table, params=None):
        return [dict(r) for r in self.tables.get(table, [])]


class ReportTest(unittest.TestCase):
    def report(self):
        return link_report.report(
            FakeStore(), RUN,
            passages_for=lambda spec, version: SOURCES if spec == "corpus" else TARGETS,
            retained_for=lambda store, slug, version: SOURCES)

    def test_a_judge_that_never_answered_is_not_counted_as_agreement(self):
        """A source nobody linked is silent when all three answered absent, and
        contested when one of them never answered, which is what a failed call
        leaves. The two must not be counted alike: the second is the case the
        agreement figure exists to expose."""
        store = FakeStore()
        store.tables["aci_links"] = [row for row in store.tables["aci_links"]
                                     if not (row["call_id"] == "link-call-3"
                                             and row["source_locator"] == "src-2")]
        out = link_report.report(
            store, RUN,
            passages_for=lambda spec, version: SOURCES if spec == "corpus" else TARGETS,
            retained_for=lambda store, slug, version: SOURCES)
        direction = out["directions"][0]
        by_locator = {s["locator"]: s for s in direction["sources"]}
        self.assertEqual(by_locator["src-2"]["state"], "contested")
        self.assertEqual(by_locator["src-2"]["judges_linking"], 0)
        self.assertEqual(direction["agreement"]["unanimous"], 0)

    def test_one_direction_with_its_counts(self):
        out = self.report()
        self.assertEqual(len(out["directions"]), 1)
        direction = out["directions"][0]
        self.assertEqual(direction["behaviour"], "defined-behaviour")
        self.assertEqual(direction["source"], "corpus@2026-01-01")
        self.assertEqual(direction["target"], "second@2026-02-01")
        self.assertEqual(direction["counts"],
                         {"sources": 2, "linked": 1, "silent": 1, "contested": 0,
                          "contradictions": 0})

    def test_each_source_carries_its_quote_and_its_targets_quotes(self):
        direction = self.report()["directions"][0]
        first = direction["sources"][0]
        self.assertEqual(first["locator"], "src-1")
        self.assertIn("say what it means", first["quote"])
        self.assertIn("says what it means", first["targets"][0]["quote"])

    def test_the_agreement_rate_is_reported(self):
        direction = self.report()["directions"][0]
        self.assertEqual(direction["agreement"]["unanimous"], 1)
        self.assertEqual(direction["agreement"]["sources"], 2)

    def test_the_run_carries_its_cost_and_its_panel(self):
        out = self.report()
        self.assertEqual(out["run"]["cost_usd"], 1.5)
        self.assertEqual(out["run"]["panel"], ["a", "b", "c"])

    def test_the_markdown_names_every_state_and_quotes_the_passages(self):
        text = link_report.render(self.report())
        self.assertIn("corpus@2026-01-01 -> second@2026-02-01", text)
        self.assertIn("linked", text)
        self.assertIn("silent", text)
        self.assertIn("say what it means", text)

    def test_writing_leaves_a_markdown_and_a_json_file(self):
        with tempfile.TemporaryDirectory() as out_dir:
            folder = link_report.write(
                FakeStore(), RUN, out_dir,
                passages_for=lambda spec, version: SOURCES if spec == "corpus" else TARGETS,
                retained_for=lambda store, slug, version: SOURCES)
            self.assertTrue((folder / "links.md").exists())
            data = json.loads((folder / "links.json").read_text())
            self.assertEqual(data["run"]["id"], RUN)


if __name__ == "__main__":
    unittest.main()
