#!/usr/bin/env python3
"""Choosing which run answers for each cell.

This is where the claim the index sells is kept or lost: that a verdict on one
lab's document and a verdict on another's were reached the same way. The database
enforces it too, by trigger; these tests pin the refusal that happens BEFORE a row
is written, because a publication is insert-only and a half-built one cannot be
taken back.

Run: python3 engine/test_publish.py
"""
import sys
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "spec-cite"))

import publish                     # noqa: E402


class FakeStore:
    def __init__(self, **tables):
        self.tables = tables

    def select(self, table, params=None):
        return self.tables.get(table, [])


PANEL = ["deepseek", "fable", "sol"]
V1 = {"id": "v1", "spec_id": "constitution", "version": "2026-01-20"}
V2 = {"id": "v2", "spec_id": "model-spec", "version": "2025-12-18"}


def calls(run_id, slug, version_id, models, status="done"):
    return [{"run_id": run_id, "behaviour_slug": slug, "spec_version_id": version_id,
             "model": model, "status": status} for model in models]


def store(runs, judge_calls, versions=(V1, V2)):
    return FakeStore(aci_runs=runs, aci_judge_calls=judge_calls,
                     aci_spec_versions=list(versions))


class ChooseCellsTest(unittest.TestCase):
    def test_a_cell_judged_by_exactly_the_panel_is_taken(self):
        s = store([{"id": "r1", "rubric": "v5", "created_at": "2026-09-01"}],
                  calls("r1", "helpfulness", "v1", PANEL))
        cells = publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")
        self.assertEqual(cells, [{"behaviour_slug": "helpfulness",
                                  "spec_version_id": "v1", "run_id": "r1"}])

    def test_a_bigger_panel_is_not_this_panel(self):
        """Six judges and three judges are not the same claim. A run that judged
        the cell with more models than the publication names is not an answer to
        it -- this is the defect the inherited bench carries, refused at source."""
        s = store([{"id": "r1", "rubric": "v5", "created_at": "2026-09-01"}],
                  calls("r1", "helpfulness", "v1", PANEL + ["glm", "qwen38-max"]))
        with self.assertRaises(SystemExit) as refused:
            publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")
        self.assertIn("helpfulness x constitution@2026-01-20", str(refused.exception))

    def test_a_missing_seat_is_not_an_answer(self):
        s = store([{"id": "r1", "rubric": "v5", "created_at": "2026-09-01"}],
                  calls("r1", "helpfulness", "v1", ["sol", "fable"]))
        with self.assertRaises(SystemExit):
            publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")

    def test_a_call_that_is_not_done_does_not_count(self):
        s = store([{"id": "r1", "rubric": "v5", "created_at": "2026-09-01"}],
                  calls("r1", "helpfulness", "v1", ["sol", "fable"])
                  + calls("r1", "helpfulness", "v1", ["deepseek"], status="error"))
        with self.assertRaises(SystemExit):
            publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")

    def test_the_panel_cannot_be_assembled_from_two_runs(self):
        """Two runs that together cover the panel are two askings, under whatever
        the registry and the prompt were at the time. A cell is one run."""
        s = store([{"id": "r1", "rubric": "v5", "created_at": "2026-09-01"},
                   {"id": "r2", "rubric": "v5", "created_at": "2026-09-02"}],
                  calls("r1", "helpfulness", "v1", ["sol", "fable"])
                  + calls("r2", "helpfulness", "v1", ["deepseek"]))
        with self.assertRaises(SystemExit):
            publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")

    def test_another_rubric_is_another_question(self):
        s = store([{"id": "r1", "rubric": "v3", "created_at": "2026-09-01"}],
                  calls("r1", "helpfulness", "v1", PANEL))
        with self.assertRaises(SystemExit):
            publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")

    def test_the_newest_qualifying_run_wins(self):
        s = store([{"id": "old", "rubric": "v5", "created_at": "2026-08-01"},
                   {"id": "new", "rubric": "v5", "created_at": "2026-09-01"}],
                  calls("old", "helpfulness", "v1", PANEL)
                  + calls("new", "helpfulness", "v1", PANEL))
        [cell] = publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")
        self.assertEqual(cell["run_id"], "new")

    def test_every_unanswered_cell_is_named_at_once(self):
        """A refusal that names one cell sends the operator round the loop per
        cell. The grid is the unit of the decision, so it is the unit of the
        complaint."""
        s = store([{"id": "r1", "rubric": "v5", "created_at": "2026-09-01"}],
                  calls("r1", "helpfulness", "v1", PANEL))
        with self.assertRaises(SystemExit) as refused:
            publish.choose_cells(s, ["helpfulness", "user-autonomy"], [V1, V2],
                                 PANEL, "v5")
        message = str(refused.exception)
        for missing in ("helpfulness x model-spec@2025-12-18",
                        "user-autonomy x constitution@2026-01-20",
                        "user-autonomy x model-spec@2025-12-18"):
            self.assertIn(missing, message)
        self.assertNotIn("helpfulness x constitution", message)

    def test_the_panel_is_compared_as_a_set_whatever_order_it_is_given_in(self):
        s = store([{"id": "r1", "rubric": "v5", "created_at": "2026-09-01"}],
                  calls("r1", "helpfulness", "v1", PANEL))
        cells = publish.choose_cells(s, ["helpfulness"], [V1],
                                     ["sol", "deepseek", "fable"], "v5")
        self.assertEqual(len(cells), 1)


class DocumentVersionsTest(unittest.TestCase):
    def test_the_versions_named_are_the_versions_published(self):
        older = {"id": "v0", "spec_id": "constitution", "version": "2025-05-01"}
        chosen = publish.document_versions(store([], [], versions=(V1, older, V2)), ["v0"])
        self.assertEqual(chosen, [older])

    def test_a_version_the_index_does_not_carry_is_named(self):
        with self.assertRaises(SystemExit) as refused:
            publish.document_versions(store([], []), ["v1", "invented"])
        self.assertIn("invented", str(refused.exception))


class PanelTest(unittest.TestCase):
    def test_the_seats_of_a_configured_panel(self):
        self.assertEqual(publish.panel_seats({"panels": {"p": ["sol", "deepseek"]}}, "p"),
                         ["deepseek", "sol"])

    def test_an_unknown_panel_is_refused(self):
        with self.assertRaises(SystemExit):
            publish.panel_seats({"panels": {}}, "nope")


class DepthsTest(unittest.TestCase):
    CELL = {"run_id": "r1", "behaviour_slug": "helpfulness", "spec_version_id": "v1"}

    def store(self, depth_statuses):
        return FakeStore(
            aci_judge_calls=[{"id": f"c-{m}", **calls("r1", "helpfulness", "v1", [m])[0]}
                             for m in PANEL],
            aci_depths=[{"call_id": f"c-{m}", "status": s, "depth": 2, "rationale": ""}
                        for m, s in zip(PANEL, depth_statuses)],
            aci_spec_versions=[V1, V2])

    def test_a_cell_with_every_depth_passes(self):
        publish.require_depths(self.store(["done", "done", "done"]), [self.CELL])

    def test_a_cell_missing_a_depth_is_refused_and_named(self):
        with self.assertRaises(SystemExit) as refused:
            publish.require_depths(self.store(["done", "error", "done"]), [self.CELL])
        self.assertIn("helpfulness x constitution@2026-01-20", str(refused.exception))


class BuildTest(unittest.TestCase):
    def test_the_payload_is_built_for_the_publication_panel(self):
        seen = {}

        def fake_run(argv, capture_output, text):
            seen["argv"] = argv
            out = next(a.split("=", 1)[1] for a in argv if a.startswith("--out="))
            Path(out).write_text("{}")
            return type("Done", (), {"returncode": 0, "stderr": "", "stdout": ""})()

        with mock.patch.object(publish.subprocess, "run", fake_run):
            publish.build("payload", [], ["helpfulness"], panel_name="frontier_fast")
        self.assertIn("--panel=frontier_fast", seen["argv"])


if __name__ == "__main__":
    unittest.main()
