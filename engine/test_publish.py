#!/usr/bin/env python3
"""Choosing which run answers for each cell.

This is where the claim the index sells is kept or lost: that a verdict on one
lab's document and a verdict on another's were reached the same way. The database
enforces it too, by trigger; these tests pin the refusal that happens BEFORE a row
is written, because a publication is insert-only and a half-built one cannot be
taken back.

Run: python3 engine/test_publish.py
"""
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


if __name__ == "__main__":
    unittest.main()
