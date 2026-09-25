#!/usr/bin/env python3
"""Choosing which run answers for each cell.

This is where the claim the index sells is kept or lost: that a verdict on one
lab's document and a verdict on another's were reached the same way. The database
enforces it too, by trigger; these tests pin the refusal that happens BEFORE a row
is written, because a publication is insert-only and a half-built one cannot be
taken back.

Run: python3 engine/test_publish.py
"""
import hashlib
import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "spec-cite"))

import publish                     # noqa: E402

TEN = publish.depth_call.prompt_sha256(10)
FOUR = publish.depth_call.prompt_sha256(4)
# An assessment run id as the database writes one, for the command line, which
# refuses anything else.
RUN_UUID = "8a4e2c6f-1b3d-4f5a-9c7e-0d2b4f6a8c1e"


class FakeStore:
    """Tables in memory. The two PostgREST filters the engine sends, `eq.` and
    `in.(...)`, are honoured, so a filter written wrongly narrows to nothing here
    as it would against the database."""

    def __init__(self, **tables):
        self.tables = tables

    def select(self, table, params=None):
        rows = self.tables.get(table, [])
        for column, condition in (params or {}).items():
            operator, _, value = condition.partition(".")
            if operator == "eq":
                rows = [row for row in rows if str(row.get(column)) == value]
            elif operator == "in":
                wanted = {v.strip('"') for v in value[1:-1].split(",")}
                rows = [row for row in rows if str(row.get(column)) in wanted]
        return rows


PANEL = ["deepseek", "fable", "sol"]
V1 = {"id": "v1", "spec_id": "constitution", "version": "2026-01-20"}
V2 = {"id": "v2", "spec_id": "model-spec", "version": "2025-12-18"}


def calls(run_id, slug, version_id, models, status="done"):
    return [{"id": f"{run_id}-{model}", "run_id": run_id, "behaviour_slug": slug,
             "spec_version_id": version_id, "model": model, "status": status}
            for model in models]


def store(runs, judge_calls, versions=(V1, V2), substitutions=()):
    return FakeStore(aci_runs=runs, aci_judge_calls=judge_calls,
                     aci_spec_versions=list(versions),
                     aci_seat_substitutions=list(substitutions))


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


HARM = "harm-avoidance-to-third-parties"
SEATED = ["deepseek", "opus", "sol"]
FILTERED = "fable's output was content-filtered on every attempt."


def substitution(run_id, slug=HARM, version_id="v2", seat="fable", substitute="opus"):
    return {"run_id": run_id, "behaviour_slug": slug, "spec_version_id": version_id,
            "seat": seat, "substitute": substitute, "reason": FILTERED,
            "added_by": "test", "added_at": "2026-09-15"}


class SubstitutionTest(unittest.TestCase):
    """A judge that cannot answer a cell at all is replaced there, and the
    replacement is recorded. The recorded row is what makes the substitute a seat:
    the same three models without it are refused, exactly as the trigger refuses
    them."""

    RUN = {"id": "r1", "rubric": "v5", "created_at": "2026-09-15"}

    def test_a_cell_judged_with_a_recorded_substitute_is_taken(self):
        s = store([self.RUN], calls("r1", HARM, "v2", SEATED),
                  substitutions=[substitution("r1")])
        cells = publish.choose_cells(s, [HARM], [V2], PANEL, "v5")
        self.assertEqual(cells, [{"behaviour_slug": HARM, "spec_version_id": "v2",
                                  "run_id": "r1"}])

    def test_a_substitute_nobody_recorded_is_not_the_panel(self):
        s = store([self.RUN], calls("r1", HARM, "v2", SEATED))
        with self.assertRaises(SystemExit) as refused:
            publish.choose_cells(s, [HARM], [V2], PANEL, "v5")
        self.assertIn(f"{HARM} x model-spec@2025-12-18", str(refused.exception))

    def test_a_substitution_answers_for_its_own_cell_only(self):
        s = store([self.RUN],
                  calls("r1", HARM, "v1", SEATED) + calls("r1", HARM, "v2", SEATED),
                  substitutions=[substitution("r1", version_id="v2")])
        with self.assertRaises(SystemExit) as refused:
            publish.choose_cells(s, [HARM], [V1, V2], PANEL, "v5")
        self.assertIn(f"{HARM} x constitution@2026-01-20", str(refused.exception))
        self.assertNotIn(f"{HARM} x model-spec", str(refused.exception))

    def test_a_substitution_answers_for_its_own_run_only(self):
        """The same cell judged again is a new asking, held to the panel."""
        s = store([self.RUN, {"id": "r2", "rubric": "v5", "created_at": "2026-09-16"}],
                  calls("r2", HARM, "v2", SEATED),
                  substitutions=[substitution("r1")])
        with self.assertRaises(SystemExit):
            publish.choose_cells(s, [HARM], [V2], PANEL, "v5")

    def test_once_substituted_the_seat_itself_is_not_the_panel(self):
        """The trigger holds the cell to the panel as seated, so a run where the
        seat answered after all does not match the recorded substitution."""
        s = store([self.RUN], calls("r1", HARM, "v2", PANEL),
                  substitutions=[substitution("r1")])
        with self.assertRaises(SystemExit):
            publish.choose_cells(s, [HARM], [V2], PANEL, "v5")

    def test_the_seat_and_its_substitute_together_are_four_judges(self):
        s = store([self.RUN], calls("r1", HARM, "v2", PANEL + ["opus"]),
                  substitutions=[substitution("r1")])
        with self.assertRaises(SystemExit):
            publish.choose_cells(s, [HARM], [V2], PANEL, "v5")

    def test_a_substitution_for_a_seat_this_panel_does_not_have_changes_nothing(self):
        s = store([self.RUN], calls("r1", HARM, "v2", PANEL),
                  substitutions=[substitution("r1", seat="kimi", substitute="kimi-k2")])
        [cell] = publish.choose_cells(s, [HARM], [V2], PANEL, "v5")
        self.assertEqual(cell["run_id"], "r1")

    def test_the_refusal_says_a_substitution_can_be_recorded(self):
        s = store([self.RUN], calls("r1", HARM, "v2", SEATED))
        with self.assertRaises(SystemExit) as refused:
            publish.choose_cells(s, [HARM], [V2], PANEL, "v5")
        self.assertIn("aci_seat_substitutions", str(refused.exception))


def call_ids(rows):
    return [row["id"] for row in rows]


def depth_rows(call_ids, status="done"):
    return [{"call_id": call_id, "status": status, "depth": 2, "rationale": ""}
            for call_id in call_ids]


def ten_depth_rows(call_ids, assessment_run_id, status="done", prompt_sha256=TEN):
    return [{"call_id": call_id, "status": status, "depth": 6, "rationale": "",
             "assessment_run_id": assessment_run_id, "prompt_sha256": prompt_sha256}
            for call_id in call_ids]


def store_with_depths(runs, judge_calls, depths, versions=(V1, V2), substitutions=()):
    return FakeStore(aci_runs=runs, aci_judge_calls=judge_calls, aci_depths=depths,
                     aci_spec_versions=list(versions),
                     aci_seat_substitutions=list(substitutions))


class ChooseCellsPrefersPublishableRunsTest(unittest.TestCase):
    """`choose_cells` no longer takes merely the newest run that judged a cell:
    a run whose depths are still pending can never be published, so choosing
    it over a complete older run could only block the build."""

    def test_a_newer_run_with_depths_pending_loses_to_an_older_complete_one(self):
        old_calls = calls("old", "helpfulness", "v1", PANEL)
        new_calls = calls("new", "helpfulness", "v1", PANEL)
        s = store_with_depths(
            [{"id": "old", "rubric": "v5", "created_at": "2026-08-01"},
             {"id": "new", "rubric": "v5", "created_at": "2026-09-01"}],
            old_calls + new_calls,
            depth_rows(call_ids(old_calls))
            + depth_rows(call_ids(new_calls), status="pending"))
        [cell] = publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")
        self.assertEqual(cell["run_id"], "old")

    def test_when_both_runs_are_fully_done_the_newer_still_wins(self):
        old_calls = calls("old", "helpfulness", "v1", PANEL)
        new_calls = calls("new", "helpfulness", "v1", PANEL)
        s = store_with_depths(
            [{"id": "old", "rubric": "v5", "created_at": "2026-08-01"},
             {"id": "new", "rubric": "v5", "created_at": "2026-09-01"}],
            old_calls + new_calls,
            depth_rows(call_ids(old_calls)) + depth_rows(call_ids(new_calls)))
        [cell] = publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")
        self.assertEqual(cell["run_id"], "new")

    def test_a_lone_run_with_depths_pending_still_refuses_downstream(self):
        """`choose_cells` has nothing better to offer, so it still returns the
        cell; `require_depths` is the guard left to refuse it, and it must
        name the cell."""
        run_calls = calls("r1", "helpfulness", "v1", PANEL)
        s = store_with_depths(
            [{"id": "r1", "rubric": "v5", "created_at": "2026-09-01"}],
            run_calls, depth_rows(call_ids(run_calls), status="pending"))
        cells = publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")
        with self.assertRaises(SystemExit) as refused:
            publish.require_depths(s, cells, PANEL)
        self.assertIn("helpfulness x constitution@2026-01-20", str(refused.exception))

    def test_a_substituted_cell_with_every_depth_done_is_still_chosen(self):
        run_calls = calls("r1", HARM, "v2", SEATED)
        s = store_with_depths(
            [{"id": "r1", "rubric": "v5", "created_at": "2026-09-15"}],
            run_calls, depth_rows(call_ids(run_calls)),
            substitutions=[substitution("r1")])
        cells = publish.choose_cells(s, [HARM], [V2], PANEL, "v5")
        self.assertEqual(cells, [{"behaviour_slug": HARM, "spec_version_id": "v2",
                                  "run_id": "r1"}])


class DeclaredSubstitutesTest(unittest.TestCase):
    """publish.py's second gate on a recorded substitution: recorded is not
    enough, it must be declared for that seat by this panel's own
    configuration (panel-config.json's `substitutes` block)."""

    CELL = {"run_id": "r1", "behaviour_slug": HARM, "spec_version_id": "v2"}
    CONFIG = {"substitutes": {"frontier_fast": {"fable": ["opus", "kimi"]}}}

    def store(self, seat, substitute):
        return FakeStore(
            aci_seat_substitutions=[substitution("r1", seat=seat, substitute=substitute)],
            aci_spec_versions=[V1, V2])

    def test_the_first_declared_substitute_is_accepted(self):
        publish.require_declared_substitutes(
            self.store("fable", "opus"), [self.CELL], self.CONFIG, "frontier_fast", PANEL)

    def test_the_second_declared_substitute_is_accepted_too(self):
        publish.require_declared_substitutes(
            self.store("fable", "kimi"), [self.CELL], self.CONFIG, "frontier_fast", PANEL)

    def test_an_undeclared_substitute_is_refused_and_names_the_declared_order(self):
        with self.assertRaises(SystemExit) as refused:
            publish.require_declared_substitutes(
                self.store("fable", "gpt"), [self.CELL], self.CONFIG, "frontier_fast", PANEL)
        message = str(refused.exception)
        self.assertIn(f"{HARM} x model-spec@2025-12-18", message)
        self.assertIn("fable may be substituted by opus, then kimi", message)

    def test_a_seat_with_no_declared_substitutes_is_refused(self):
        with self.assertRaises(SystemExit) as refused:
            publish.require_declared_substitutes(
                self.store("deepseek", "glm"), [self.CELL], self.CONFIG, "frontier_fast", PANEL)
        self.assertIn("deepseek may not be substituted", str(refused.exception))

    def test_a_substitution_for_a_seat_outside_the_panel_is_not_this_function_s_business(self):
        """`choose_cells` already ignores it; this gate must not re-refuse it."""
        publish.require_declared_substitutes(
            self.store("kimi", "kimi-k2"), [self.CELL], self.CONFIG, "frontier_fast", PANEL)

    def test_no_recorded_substitution_at_all_passes(self):
        publish.require_declared_substitutes(
            FakeStore(aci_seat_substitutions=[], aci_spec_versions=[V1, V2]),
            [self.CELL], self.CONFIG, "frontier_fast", PANEL)


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

    def store(self, depth_statuses, models=PANEL, substitutions=()):
        return FakeStore(
            aci_judge_calls=[{**calls("r1", "helpfulness", "v1", [m])[0], "id": f"c-{m}"}
                             for m in models],
            aci_depths=[{"call_id": f"c-{m}", "status": s, "depth": 2, "rationale": ""}
                        for m, s in zip(models, depth_statuses)],
            aci_spec_versions=[V1, V2],
            aci_seat_substitutions=list(substitutions))

    def test_a_cell_with_every_depth_passes(self):
        publish.require_depths(self.store(["done", "done", "done"]), [self.CELL], PANEL)

    def test_a_cell_missing_a_depth_is_refused_and_named(self):
        with self.assertRaises(SystemExit) as refused:
            publish.require_depths(self.store(["done", "error", "done"]), [self.CELL], PANEL)
        self.assertIn("helpfulness x constitution@2026-01-20", str(refused.exception))

    def test_a_substituted_cell_needs_a_depth_from_its_substitute(self):
        recorded = [substitution("r1", slug="helpfulness", version_id="v1")]
        publish.require_depths(
            self.store(["done", "done", "done"], SEATED, recorded), [self.CELL], PANEL)
        with self.assertRaises(SystemExit) as refused:
            publish.require_depths(
                self.store(["done", "error", "done"], SEATED, recorded), [self.CELL], PANEL)
        self.assertIn("helpfulness x constitution@2026-01-20", str(refused.exception))

    def test_a_depth_from_the_seat_does_not_stand_in_for_its_substitute(self):
        """Depth completeness is counted over the seats as substituted. Three
        depths from the panel as configured are not three depths from the panel
        this cell was judged by."""
        recorded = [substitution("r1", slug="helpfulness", version_id="v1")]
        with self.assertRaises(SystemExit) as refused:
            publish.require_depths(
                self.store(["done", "done", "done"], PANEL, recorded), [self.CELL], PANEL)
        self.assertIn("helpfulness x constitution@2026-01-20", str(refused.exception))

    def test_require_depths_reads_the_assessment_run_it_is_given(self):
        """A cell whose only rows are in aci_depths_out_of_ten has no depth on
        the scale of four, and require_depths reads that table instead when
        given an assessment run."""
        run_calls = calls("r1", "helpfulness", "v1", PANEL)
        s = FakeStore(
            aci_judge_calls=[{**c, "id": f"c-{c['model']}"} for c in run_calls],
            aci_depths=[],
            aci_depths_out_of_ten=ten_depth_rows(
                [f"c-{m}" for m in PANEL], "assessment-1"),
            aci_spec_versions=[V1, V2], aci_seat_substitutions=[])
        with self.assertRaises(SystemExit):
            publish.require_depths(s, [self.CELL], PANEL)
        publish.require_depths(s, [self.CELL], PANEL, "assessment-1")


class DepthCompleteKeysTest(unittest.TestCase):
    """`_depth_complete_keys` reads `aci_depths` by default, exactly as today,
    and `aci_depths_out_of_ten` when given an assessment run."""

    def matched(self):
        run_calls = calls("r1", "helpfulness", "v1", PANEL)
        return {("r1", "helpfulness", "v1"): run_calls}, run_calls

    def test_the_default_reads_the_scale_of_four_row(self):
        matched, run_calls = self.matched()
        s = FakeStore(aci_depths=depth_rows(call_ids(run_calls)))
        self.assertEqual(publish._depth_complete_keys(s, matched),
                         {("r1", "helpfulness", "v1")})

    def test_an_assessment_run_does_not_complete_the_default(self):
        matched, run_calls = self.matched()
        s = FakeStore(aci_depths=[],
                      aci_depths_out_of_ten=ten_depth_rows(
                          call_ids(run_calls), "assessment-1"))
        self.assertEqual(publish._depth_complete_keys(s, matched), set())

    def test_the_named_assessment_run_reads_its_own_rows(self):
        matched, run_calls = self.matched()
        s = FakeStore(aci_depths=[],
                      aci_depths_out_of_ten=ten_depth_rows(
                          call_ids(run_calls), "assessment-1"))
        self.assertEqual(publish._depth_complete_keys(s, matched, "assessment-1"),
                         {("r1", "helpfulness", "v1")})

    def test_a_row_of_another_assessment_run_is_ignored(self):
        matched, run_calls = self.matched()
        s = FakeStore(aci_depths=[],
                      aci_depths_out_of_ten=ten_depth_rows(
                          call_ids(run_calls), "other-run"))
        self.assertEqual(publish._depth_complete_keys(s, matched, "assessment-1"), set())


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

    def test_a_javascript_builder_is_launched_with_node(self):
        seen = {}

        def fake_run(argv, capture_output, text):
            seen["argv"] = argv
            out = next(a.split("=", 1)[1] for a in argv if a.startswith("--out="))
            Path(out).write_text("{}")
            return type("Done", (), {"returncode": 0, "stderr": "", "stdout": ""})()

        with mock.patch.object(publish.subprocess, "run", fake_run):
            publish.build("links", [], ["helpfulness"], link_runs=["r1", "r0"],
                          note_prompts=["p1", "p0"])
        self.assertEqual(seen["argv"][0], "node")
        self.assertTrue(seen["argv"][1].endswith("build-links-data.mjs"))
        # Sorted, because the runs reach the builder's output through the object
        # it assembles, and the digest describes bytes.
        self.assertIn("--link-runs=r0,r1", seen["argv"])
        self.assertIn("--note-prompts=p0,p1", seen["argv"])

    def test_note_prompts_none_omits_the_flag_but_an_empty_list_still_passes_it(self):
        seen = {}

        def fake_run(argv, capture_output, text):
            seen["argv"] = argv
            out = next(a.split("=", 1)[1] for a in argv if a.startswith("--out="))
            Path(out).write_text("{}")
            return type("Done", (), {"returncode": 0, "stderr": "", "stdout": ""})()

        # None means the flag is absent altogether: a rebuild of a publication
        # written before this field existed must be able to ask the builder to
        # take every note, not pin it to an empty pin it never recorded.
        with mock.patch.object(publish.subprocess, "run", fake_run):
            publish.build("links", [], ["helpfulness"], link_runs=["r0"],
                          note_prompts=None)
        self.assertFalse(any(a.startswith("--note-prompts=") for a in seen["argv"]))

        # An empty list is a recorded pin of nothing, and must still reach the
        # builder as the flag, not be silently dropped like None is.
        with mock.patch.object(publish.subprocess, "run", fake_run):
            publish.build("links", [], ["helpfulness"], link_runs=["r0"],
                          note_prompts=[])
        self.assertIn("--note-prompts=", seen["argv"])


def fake_builder(seen):
    def fake_run(argv, capture_output, text):
        seen.append(argv)
        out = next(a.split("=", 1)[1] for a in argv if a.startswith("--out="))
        Path(out).write_text("{}")
        return type("Done", (), {"returncode": 0, "stderr": "", "stdout": ""})()
    return fake_run


class BuildOutOfTenTest(unittest.TestCase):
    """The new arguments reach a builder only when they are given, so a build
    that names neither is launched exactly as it was before they existed."""

    def argv(self, name, **extra):
        seen = []
        with mock.patch.object(publish.subprocess, "run", fake_builder(seen)):
            publish.build(name, [], ["helpfulness"], "2026-09-16", "frontier_fast",
                          link_runs=["r0"], note_prompts=["p0"], **extra)
        return [a for a in seen[0] if not a.startswith(("--cells=", "--out="))]

    def test_naming_neither_launches_the_payload_builder_as_before(self):
        self.assertEqual(self.argv("payload")[2:], [
            "--threshold=4", "--solid-threshold=6", "--run-date=2026-09-16",
            "--behaviours=helpfulness", "--panel=frontier_fast"])

    def test_the_depth_prompt_and_the_assessment_run_reach_the_payload_builder(self):
        argv = self.argv("payload", depth_prompt=TEN, assessment_run="assessment-1")
        self.assertIn(f"--depth-prompt={TEN}", argv)
        self.assertIn("--assessment-run=assessment-1", argv)
        # And no other builder: they describe the depths, which only the payload holds.
        for name in ("documents", "links"):
            argv = self.argv(name, depth_prompt=TEN, assessment_run="assessment-1")
            self.assertFalse(any(a.startswith(("--depth-prompt=", "--assessment-run="))
                                 for a in argv), argv)

    def test_comparisons_are_left_out_of_the_links_only_when_asked(self):
        self.assertNotIn("--without-comparisons", self.argv("links"))
        self.assertIn("--without-comparisons", self.argv("links", comparisons=False))
        self.assertNotIn("--without-comparisons", self.argv("payload", comparisons=False))


CONFIG = {"display": {"panel": "frontier_fast"}, "panels": {"frontier_fast": PANEL},
          "substitutes": {}}
ASSESSMENT_PANELS = {"criteria": ["sol", "fable", "deepseek"],
                     "contradictions": ["sol", "fable", "kimi"]}


def assessment_of(version_id, run_id="assessment-1", unconfirmed_claim=False):
    """The rows of one document fully assessed: every seat of both questions
    answered, every criterion scored, no claim. With `unconfirmed_claim`, one
    claim sol found, written with sol's reading and no other, as a run that
    stopped before its confirmations leaves it."""
    calls = [{"id": f"{run_id}-{version_id}-{question}-{seat}", "run_id": run_id,
              "spec_version_id": version_id, "question": question, "seat": seat,
              "model": seat, "status": "done"}
             for question, seats in ASSESSMENT_PANELS.items() for seat in seats]
    scores = [{"call_id": call["id"], "criterion": criterion, "score": 3, "rationale": "r",
               "locators": []}
              for call in calls if call["question"] == "criteria"
              for criterion in ("conflict_rules", "rule_force", "reasons", "situations")]
    claims, verdicts = [], []
    if unconfirmed_claim:
        claim_id = f"{run_id}-{version_id}-claim"
        claims.append({"id": claim_id, "run_id": run_id, "spec_version_id": version_id,
                       "first_locator": "a", "second_locator": "b", "situation": "s",
                       "why": "w", "found_by": ["sol"]})
        verdicts.append({"claim_id": claim_id,
                         "call_id": f"{run_id}-{version_id}-contradictions-sol", "seat": "sol",
                         "holds": True, "absolute": None, "reason": "found it"})
    return calls, scores, claims, verdicts


class RecordingStore(FakeStore):
    def __init__(self, **tables):
        super().__init__(**tables)
        self.inserted = []

    def insert(self, table, rows, returning=False):
        self.inserted.append((table, rows))
        return [dict(row, id="publication-1") for row in rows] if returning else None


def taking_of(version_id):
    """The contradictions half of one document in assessment-2, which takes its
    criteria from assessment-1: every seat found nothing, so nothing was read."""
    return [{"id": f"assessment-2-{version_id}-contradictions-{seat}", "run_id": "assessment-2",
             "spec_version_id": version_id, "question": "contradictions", "seat": seat,
             "model": seat, "status": "done"} for seat in ("sol", "opus", "kimi")]


def publishing_store(assessed=("v1", "v2"), four=True, ten=True, notes=None,
                     run_status="done", unconfirmed_claims=False, ten_run="assessment-1"):
    run_calls = [dict(call, id=f"{call['id']}-{version_id}")
                 for version_id in ("v1", "v2")
                 for call in calls("r1", "helpfulness", version_id, PANEL)]
    assessment_calls, assessment_scores, assessment_claims, assessment_verdicts = [], [], [], []
    for version_id in assessed:
        more_calls, more_scores, more_claims, more_verdicts = assessment_of(
            version_id, unconfirmed_claim=unconfirmed_claims)
        assessment_calls += more_calls
        assessment_scores += more_scores
        assessment_claims += more_claims
        assessment_verdicts += more_verdicts
    return RecordingStore(
        aci_runs=[{"id": "r1", "rubric": "v5", "created_at": "2026-09-15"}],
        aci_judge_calls=run_calls,
        aci_depths=depth_rows(call_ids(run_calls)) if four else [],
        aci_depths_out_of_ten=ten_depth_rows(call_ids(run_calls), ten_run) if ten else [],
        aci_spec_versions=[V1, V2], aci_seat_substitutions=[],
        aci_assessment_runs=[{"id": "assessment-1", "status": run_status,
                              "panels": ASSESSMENT_PANELS},
                             {"id": "assessment-2", "status": "done",
                              "panels": {"criteria": ASSESSMENT_PANELS["criteria"],
                                         "contradictions": ["sol", "opus", "kimi"]},
                              "config": {"substitutes": {}, "criteria_from": "assessment-1"}}],
        aci_assessment_calls=assessment_calls + taking_of("v1") + taking_of("v2"),
        aci_assessment_scores=assessment_scores,
        aci_assessment_claims=assessment_claims, aci_assessment_verdicts=assessment_verdicts,
        aci_document_notes=notes if notes is not None else [
            {"kind": "depth", "prompt_sha256": "sha-depth"},
            {"kind": "standing", "prompt_sha256": "sha-standing"},
            {"kind": "standing", "prompt_sha256": "sha-standing-older"}])


class PublishOutOfTenTest(unittest.TestCase):
    """A publication out of ten: what it requires before anything is written,
    what it asks each builder for, and what its build parameters record."""

    def publish(self, store, **extra):
        self.builds = []

        def build(name, cells, behaviours, run_date=None, panel_name=None, link_runs=(),
                  note_prompts=None, **given):
            self.builds.append({"name": name, "note_prompts": note_prompts, **given})
            return {name: True}, f"sha-{name}"

        with mock.patch.object(publish, "build", side_effect=build):
            return publish.publish(store, ["helpfulness"], ["v1", "v2"], "v5", "tester",
                                   config=CONFIG, link_runs=["link-1"], **extra)

    def build_params(self, store):
        [(table, [row])] = [entry for entry in store.inserted
                            if entry[0] == "aci_publications"]
        return row["build_params"]

    def test_naming_neither_publishes_exactly_as_before(self):
        store = publishing_store()
        self.publish(store)
        self.assertEqual(self.build_params(store), {
            "behaviours": ["helpfulness"], "documents": ["v1", "v2"], "panel": "frontier_fast",
            "rubric": "v5", "run_date": None, "link_runs": ["link-1"],
            "note_prompts": ["sha-depth", "sha-standing", "sha-standing-older"],
            # New publications carry their written notes in the payload's cells.
            "cell_notes": True})
        # The defaults, which BuildOutOfTenTest holds to launching every builder
        # exactly as before.
        self.assertEqual(self.builds, [
            {"name": "payload", "note_prompts": None, "depth_prompt": None,
             "assessment_run": None},
            {"name": "documents", "note_prompts": None},
            {"name": "links", "note_prompts": ["sha-depth", "sha-standing",
                                               "sha-standing-older"], "comparisons": True}])

    def test_a_publication_out_of_ten_records_what_it_read_and_leaves_out(self):
        store = publishing_store()
        self.publish(store, depth_prompt=TEN, assessment_run="assessment-1")
        params = self.build_params(store)
        self.assertEqual(params["depth_prompt_sha256"], TEN)
        self.assertEqual(params["assessment_run_id"], "assessment-1")
        self.assertIs(params["comparisons"], False)
        # Only standing notes: a depth note explains a figure out of 4.
        self.assertEqual(params["note_prompts"], ["sha-standing", "sha-standing-older"])
        by_name = {build["name"]: build for build in self.builds}
        self.assertEqual((by_name["payload"]["depth_prompt"],
                          by_name["payload"]["assessment_run"]), (TEN, "assessment-1"))
        self.assertIs(by_name["links"]["comparisons"], False)
        self.assertEqual(by_name["links"]["note_prompts"], ["sha-standing", "sha-standing-older"])

    def test_the_prompt_of_four_named_outright_is_recorded_and_changes_nothing_else(self):
        store = publishing_store()
        self.publish(store, depth_prompt=FOUR)
        params = self.build_params(store)
        self.assertEqual(params["depth_prompt_sha256"], FOUR)
        self.assertNotIn("assessment_run_id", params)
        self.assertNotIn("comparisons", params)
        self.assertEqual(params["note_prompts"], ["sha-depth", "sha-standing",
                                                  "sha-standing-older"])

    def refused(self, store, **extra):
        with self.assertRaises(SystemExit) as refused:
            self.publish(store, **extra)
        self.assertEqual(store.inserted, [], "a refused publication wrote something")
        self.assertEqual(self.builds, [], "a refused publication built something")
        return str(refused.exception)

    def test_a_document_the_assessment_run_did_not_assess_is_refused_before_anything(self):
        message = self.refused(publishing_store(assessed=("v1",)),
                               depth_prompt=TEN, assessment_run="assessment-1")
        self.assertIn("model-spec@2025-12-18", message)
        self.assertNotIn("constitution@2026-01-20", message)

    def test_a_run_left_error_with_its_confirmations_missing_is_refused_before_anything(self):
        message = self.refused(publishing_store(run_status="error", unconfirmed_claims=True),
                               depth_prompt=TEN, assessment_run="assessment-1")
        self.assertIn("error", message)
        for name in ("constitution@2026-01-20", "model-spec@2025-12-18"):
            for seat in ("fable", "kimi"):
                self.assertIn(f"{name}: {seat} gave no reading of 1 of its 1 claimed "
                              "contradictions", message)
        self.assertIn("new assessment run", message)

    def test_a_run_left_running_with_no_claims_written_is_refused_before_anything(self):
        message = self.refused(publishing_store(run_status="running"),
                               depth_prompt=TEN, assessment_run="assessment-1")
        self.assertIn("running", message)
        self.assertIn("constitution@2026-01-20", message)
        self.assertIn("model-spec@2025-12-18", message)
        self.assertIn("new assessment run", message)

    def test_an_assessment_run_under_the_prompt_of_four_is_refused_naming_both(self):
        for named in ({}, {"depth_prompt": FOUR}):
            message = self.refused(publishing_store(), assessment_run="assessment-1", **named)
            self.assertIn(FOUR, message)
            self.assertIn(TEN, message)

    def test_a_new_publication_uses_the_current_prompt_of_ten(self):
        """A digest of ten the prompt file no longer has builds nothing new:
        rebuilding an old publication reads its recorded digest, publishing a
        new one does not."""
        original = publish.depth_call.prompt_sha256
        edited = "e" * 64
        with mock.patch.object(publish.depth_call, "prompt_sha256",
                               lambda scale=4: edited if scale == 10 else original(scale)):
            message = self.refused(publishing_store(), depth_prompt=TEN,
                                   assessment_run="assessment-1")
        self.assertIn(TEN, message)
        self.assertIn(edited, message)

    def test_the_prompt_of_ten_needs_its_assessment_run(self):
        self.assertIn("--assessment-run", self.refused(publishing_store(), depth_prompt=TEN))

    def test_depths_out_of_ten_are_what_a_publication_out_of_ten_requires(self):
        message = self.refused(publishing_store(ten=False), depth_prompt=TEN,
                               assessment_run="assessment-1")
        self.assertIn("helpfulness x constitution@2026-01-20", message)
        # And depths of four are not needed by it.
        self.publish(publishing_store(four=False), depth_prompt=TEN,
                     assessment_run="assessment-1")

    def test_a_standing_note_written_under_a_depth_note_s_prompt_is_refused(self):
        notes = [{"kind": "depth", "prompt_sha256": "sha-shared"},
                 {"kind": "standing", "prompt_sha256": "sha-shared"}]
        message = self.refused(publishing_store(notes=notes), depth_prompt=TEN,
                               assessment_run="assessment-1")
        self.assertIn("sha-shared", message)


class PublishTakingCriteriaTest(unittest.TestCase):
    """A publication naming a run that takes its criteria from an earlier run
    records the run it names, and carries the depths given against the earlier
    one."""

    def publish(self, store):
        builds = []

        def build(name, cells, behaviours, run_date=None, panel_name=None, link_runs=(),
                  note_prompts=None, **given):
            builds.append({"name": name, **given})
            return {name: True}, f"sha-{name}"

        with mock.patch.object(publish, "build", side_effect=build):
            publish.publish(store, ["helpfulness"], ["v1", "v2"], "v5", "tester",
                            config=CONFIG, link_runs=["link-1"], depth_prompt=TEN,
                            assessment_run="assessment-2")
        return builds

    def test_the_run_named_is_recorded_and_the_earlier_run_s_depths_stand(self):
        store = publishing_store()
        builds = self.publish(store)
        [(_table, [row])] = [entry for entry in store.inserted
                             if entry[0] == "aci_publications"]
        self.assertEqual(row["build_params"]["assessment_run_id"], "assessment-2")
        payload = next(build for build in builds if build["name"] == "payload")
        self.assertEqual(payload["assessment_run"], "assessment-2")

    def test_depths_given_against_the_run_named_are_not_the_ones_read(self):
        with self.assertRaises(SystemExit) as refused:
            self.publish(publishing_store(ten_run="assessment-2"))
        self.assertIn("helpfulness x constitution@2026-01-20", str(refused.exception))

    def test_the_depths_it_reads_are_the_earlier_run_s_when_cells_are_chosen(self):
        store = publishing_store()
        run_calls = store.tables["aci_judge_calls"]
        matched = {("r1", "helpfulness", "v1"): [c for c in run_calls
                                                 if c["spec_version_id"] == "v1"]}
        self.assertEqual(publish._depth_complete_keys(store, matched, "assessment-2"),
                         set(matched))


class ChooseCellsOutOfTenTest(unittest.TestCase):
    def test_with_an_assessment_run_the_run_complete_out_of_ten_is_preferred(self):
        old_calls = calls("old", "helpfulness", "v1", PANEL)
        new_calls = calls("new", "helpfulness", "v1", PANEL)
        s = FakeStore(
            aci_runs=[{"id": "old", "rubric": "v5", "created_at": "2026-08-01"},
                      {"id": "new", "rubric": "v5", "created_at": "2026-09-01"}],
            aci_judge_calls=old_calls + new_calls,
            aci_depths=depth_rows(call_ids(old_calls)) + depth_rows(call_ids(new_calls)),
            aci_depths_out_of_ten=ten_depth_rows(call_ids(old_calls), "assessment-1"),
            aci_spec_versions=[V1, V2], aci_seat_substitutions=[])
        [cell] = publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")
        self.assertEqual(cell["run_id"], "new")
        [cell] = publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5", "assessment-1")
        self.assertEqual(cell["run_id"], "old")


class MainTest(unittest.TestCase):
    def forwarded(self, *flags):
        seen = {}

        def fake_publish(*args, **kwargs):
            seen.update(args=args, kwargs=kwargs)
            return {"id": "p", "payload_sha256": "0" * 64, "documents_sha256": "1" * 64,
                    "links_sha256": "2" * 64}, []

        with mock.patch.object(publish.Store, "from_env", return_value=FakeStore()), \
             mock.patch.object(publish.index_store, "install_registry"), \
             mock.patch.object(publish, "publish", side_effect=fake_publish), \
             mock.patch("sys.stdout"):
            publish.main(["--behaviours=helpfulness", "--documents=v1", "--link-runs=l1",
                          *flags])
        return seen["kwargs"]

    def test_the_new_flags_reach_publish_only_when_given(self):
        self.assertEqual(self.forwarded(), {"link_runs": ["l1"]})
        kwargs = self.forwarded(f"--depth-prompt={TEN}", f"--assessment-run={RUN_UUID}")
        self.assertEqual((kwargs["depth_prompt"], kwargs["assessment_run"]),
                         (TEN, RUN_UUID))

    def test_an_assessment_run_in_capitals_is_forwarded_as_the_database_writes_it(self):
        kwargs = self.forwarded(f"--depth-prompt={TEN}", f"--assessment-run={RUN_UUID.upper()}")
        self.assertEqual(kwargs["assessment_run"], RUN_UUID)

    def test_an_assessment_run_that_is_not_a_uuid_is_refused_before_the_store(self):
        for given in ("assessment-1", RUN_UUID[:-1], RUN_UUID.replace("-", "")):
            with mock.patch.object(publish.Store, "from_env",
                                   side_effect=AssertionError("the store was opened")), \
                 mock.patch.object(publish, "publish",
                                   side_effect=AssertionError("publish was called")), \
                 self.assertRaises(SystemExit) as refused:
                publish.main(["--behaviours=helpfulness", "--documents=v1", "--link-runs=l1",
                              f"--depth-prompt={TEN}", f"--assessment-run={given}"])
            message = str(refused.exception)
            self.assertIn(f"--assessment-run={given}", message)
            self.assertIn("uuid", message)


class LinksFormatTest(unittest.TestCase):
    """The builder's bytes must be reproducible in Python.

    verify_supabase_provenance.py re-serialises the stored links column with
    json.dumps(obj, **FORMATS["links"]) and holds it to the recorded digest. If
    the two disagree by a single byte, every publication fails that check for
    good, so this runs the real builder's serialiser and compares.
    """

    SAMPLE = {"documents": ["a", "b"], "runs": [], "byLocator": {},
              "comparisons": {}, "notes": {"passage": {"k": {"text": "caractère"}}}}

    def test_python_reproduces_what_the_javascript_builder_writes(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not on PATH")
        script = (
            "import { serialise } from "
            f"{json.dumps(str(HERE / 'build-links-data.mjs'))};"
            f"process.stdout.write(serialise({json.dumps(self.SAMPLE)}));"
        )
        written = subprocess.run([node, "--input-type=module", "-e", script],
                                 capture_output=True, text=True)
        self.assertEqual(written.returncode, 0, written.stderr)
        self.assertEqual(written.stdout,
                         json.dumps(self.SAMPLE, **publish.FORMATS["links"]))


class LinkRunsRequiredTest(unittest.TestCase):
    def test_a_publication_names_the_link_runs_it_carries(self):
        with self.assertRaises(SystemExit) as refused:
            publish.publish(None, ["helpfulness"], ["v1"], "v5", "tester")
        self.assertIn("link-runs", str(refused.exception))





class BoardsTest(unittest.TestCase):
    """A publication freezes both boards as they stand, and each digest is the one
    the verifier recomputes from what was stored."""

    def test_each_board_reserialises_to_its_digest(self):
        for name in publish.BOARD_FILES:
            board, digest = publish.read_board(name)
            again = hashlib.sha256(
                json.dumps(board, **publish.FORMATS[name]).encode()).hexdigest()
            self.assertEqual(digest, again, name)
            # The site's own file, unchanged: what is frozen is what is shipped.
            shipped = json.loads(publish.BOARD_FILES[name].read_text(encoding="utf-8"))
            self.assertEqual(board, shipped, name)


class CellNotesTest(unittest.TestCase):
    """A cell's written notes travel in the payload, copied from the links."""

    def test_the_notes_land_in_their_cell_and_nowhere_else(self):
        payload = {"behaviours": [{"slug": "honesty", "coverage": {
            "doc-a": {"depth": {"mean": 3}}, "doc-b": {"depth": {"mean": 2}}}}]}
        links = {"notes": {"depth": {"honesty\ndoc-a": {"text": "Why this depth."}},
                           "standing": {"honesty\ndoc-a": {"text": "Beside the others."}}}}
        built, digest = publish.with_cell_notes(payload, links)
        self.assertEqual(built["behaviours"][0]["coverage"]["doc-a"]["notes"],
                         {"depth": "Why this depth.", "standing": "Beside the others."})
        self.assertNotIn("notes", built["behaviours"][0]["coverage"]["doc-b"])
        # The digest is of the payload as FORMATS serialises it.
        self.assertEqual(digest, hashlib.sha256(
            json.dumps(built, **publish.FORMATS["payload"]).encode()).hexdigest())

    def test_links_without_notes_add_nothing(self):
        payload = {"behaviours": [{"slug": "honesty", "coverage": {"doc-a": {}}}]}
        built, _ = publish.with_cell_notes(payload, {"notes": {}})
        self.assertEqual(built["behaviours"][0]["coverage"]["doc-a"], {})


if __name__ == "__main__":
    unittest.main()
