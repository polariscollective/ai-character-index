"""Depths out of ten for calls of runs already done, against tables in memory
and a model that answers from a script.

Nothing touches a network. The store records every write, so what the command
writes, and in what order, is what these tests read."""
import contextlib
import copy
import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
# Keys stay out of it: resolve() reads a .env beside the harness unless told not to.
os.environ["PANEL_DOTENV"] = str(ROOT / "no-such.env")
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import depth_call                # noqa: E402
import depth_ladder              # noqa: E402
import depth_pass                # noqa: E402

CONFIG = json.loads((HERE / "panel-config.json").read_text())

RUN = "run-1"
ASSESSMENT_RUN = "assess-1"
VERSION_ID = "v1"
SPEC_ID = "lab--spec"
VERSION_STR = "2026-01-01"
DOC = f"{SPEC_ID}@{VERSION_STR}"

# Four passages: two candidate conflict rules (one cited by two seats, one by
# only one), and two behaviour passages (one retained by the panel's votes, one
# not).
PASSAGES = [
    (f"{DOC} > #a > ¶1", "A", "Safety comes first when two rules conflict."),
    (f"{DOC} > #a > ¶2", "A", "Only one seat reads this as a conflict rule."),
    (f"{DOC} > #b > ¶1", "B", "Never lie to the user."),
    (f"{DOC} > #b > ¶2", "B", "Keep the operator's instructions private."),
]
VERSION = {"id": VERSION_ID, "spec_id": SPEC_ID, "version": VERSION_STR, "markdown": "## B\n\ntext"}
REGISTRY = {"honesty": {"title": "Honesty", "query": "The document should tell the truth."}}

CALLS = [
    {"id": "call-sol", "run_id": RUN, "behaviour_slug": "honesty",
     "spec_version_id": VERSION_ID, "model": "sol", "status": "done"},
    {"id": "call-fable", "run_id": RUN, "behaviour_slug": "honesty",
     "spec_version_id": VERSION_ID, "model": "fable", "status": "done"},
    {"id": "call-deepseek", "run_id": RUN, "behaviour_slug": "honesty",
     "spec_version_id": VERSION_ID, "model": "deepseek", "status": "done"},
]
# Every judge banded the third passage at the top: it is what the reader shows
# by default, and the only behaviour passage a depth call should be handed.
JUDGEMENTS = [
    {"call_id": "call-sol", "locator": PASSAGES[2][0], "verdict": 2, "parsed": True},
    {"call_id": "call-fable", "locator": PASSAGES[2][0], "verdict": 2, "parsed": True},
    {"call_id": "call-deepseek", "locator": PASSAGES[2][0], "verdict": 2, "parsed": True},
]
ASSESSMENT_CALLS = [
    {"id": "acall-sol", "run_id": ASSESSMENT_RUN, "spec_version_id": VERSION_ID,
     "question": "criteria", "seat": "sol"},
    {"id": "acall-fable", "run_id": ASSESSMENT_RUN, "spec_version_id": VERSION_ID,
     "question": "criteria", "seat": "fable"},
    {"id": "acall-deepseek", "run_id": ASSESSMENT_RUN, "spec_version_id": VERSION_ID,
     "question": "criteria", "seat": "deepseek"},
]
# sol and fable both cite the first passage: it reaches the quorum of two.
# Only sol cites the second: it stays out of the rules block.
ASSESSMENT_SCORES = [
    {"call_id": "acall-sol", "criterion": "conflict_rules", "score": 2,
     "rationale": "An order of priority.", "locators": [PASSAGES[0][0], PASSAGES[1][0]]},
    {"call_id": "acall-fable", "criterion": "conflict_rules", "score": 2,
     "rationale": "An order of priority.", "locators": [PASSAGES[0][0]]},
    {"call_id": "acall-deepseek", "criterion": "conflict_rules", "score": 0,
     "rationale": "Nothing found.", "locators": []},
]


def passages_for(spec, version):
    assert (spec, version) == (SPEC_ID, VERSION_STR)
    return PASSAGES


class FakeStore:
    """Tables in memory, honouring `eq.` filters, with every write recorded in
    order: ("insert", table, rows) and ("update", table, match, patch)."""

    def __init__(self, **tables):
        self.tables = tables
        self.writes = []

    def select(self, table, params=None):
        rows = self.tables.get(table, [])
        for column, condition in (params or {}).items():
            operator, _, value = condition.partition(".")
            if operator == "eq":
                rows = [row for row in rows if str(row.get(column)) == value]
        return rows

    def insert(self, table, rows, chunk=1000, returning=False):
        self.writes.append(("insert", table, copy.deepcopy(rows)))
        self.tables.setdefault(table, []).extend(copy.deepcopy(rows))
        return copy.deepcopy(rows) if returning else None

    def update(self, table, match, patch):
        self.writes.append(("update", table, dict(match), copy.deepcopy(patch)))
        for row in self.tables.get(table, []):
            if all(row.get(k) == v for k, v in match.items()):
                row.update(copy.deepcopy(patch))

    def inserted(self, table):
        return [row for kind, name, *rest in self.writes if kind == "insert" and name == table
                for row in rest[0]]


def store(**extra):
    tables = {
        "aci_spec_versions": [dict(VERSION)],
        "aci_judge_calls": [dict(c) for c in CALLS],
        "aci_judgements": [dict(j) for j in JUDGEMENTS],
        "aci_assessment_calls": [dict(c) for c in ASSESSMENT_CALLS],
        "aci_assessment_scores": [dict(s) for s in ASSESSMENT_SCORES],
        "aci_depths_out_of_ten": [],
        "aci_depths": [],
    }
    tables.update(extra)
    return FakeStore(**tables)


ANSWER = "DEPTH: 6\nRATIONALE: A default, weighed against another rule."


class Scripted:
    """Replies per tag, taken in order; a tag with nothing left answers ANSWER.
    A reply that is an exception is raised instead of returned."""

    def __init__(self, **script):
        self.script = {tag: list(replies) for tag, replies in script.items()}
        self.asked = []

    def __call__(self, provider, model_id, system, user, kwargs):
        tag = next((t for t in ("deepseek", "fable", "opus", "kimi", "sol")
                    if t in model_id.lower()), model_id)
        self.asked.append((tag, user))
        replies = self.script.get(tag) or []
        reply = replies.pop(0) if replies else ANSWER
        if isinstance(reply, Exception):
            raise reply
        return reply, {"prompt_tokens": 1000, "completion_tokens": 100}, "stop", 0.5


def give(fake, run_ids=(RUN,), assessment_run=ASSESSMENT_RUN, model=None, go=True,
         registry=REGISTRY):
    model = model or Scripted()
    with contextlib.redirect_stdout(io.StringIO()):
        estimate, report = depth_pass.give_pass(
            fake, CONFIG, list(run_ids), assessment_run, passages_for,
            call_model=model, go=go, registry=registry)
    return estimate, report, model


class PriceTest(unittest.TestCase):
    def test_price_mode_writes_nothing_and_calls_no_model(self):
        fake = store()
        estimate, report, model = give(fake, go=False)
        self.assertIsNone(report)
        self.assertEqual(fake.writes, [])
        self.assertEqual(model.asked, [])
        self.assertGreater(estimate, 0)

    def test_the_price_names_one_call_each_and_warns_of_the_ladder(self):
        fake = store()
        with contextlib.redirect_stdout(io.StringIO()) as printed:
            depth_pass.give_pass(fake, CONFIG, [RUN], ASSESSMENT_RUN, passages_for,
                                 call_model=Scripted(), go=False, registry=REGISTRY)
        out = printed.getvalue()
        self.assertIn("Priced at about", out)
        self.assertIn("one call", out)
        self.assertIn("five", out)

    def test_an_unassessed_document_is_refused_before_anything_is_written_priced(self):
        fake = store()
        with self.assertRaises(SystemExit) as refused:
            give(fake, assessment_run="assess-missing", go=False)
        self.assertIn(DOC, str(refused.exception))
        self.assertEqual(fake.writes, [])


class GiveTest(unittest.TestCase):
    def test_a_pending_row_is_written_for_every_done_call(self):
        fake = store()
        give(fake)
        rows = fake.tables["aci_depths_out_of_ten"]
        self.assertEqual({r["call_id"] for r in rows}, {"call-sol", "call-fable", "call-deepseek"})
        self.assertTrue(all(r["prompt_sha256"] == depth_call.prompt_sha256(10) for r in rows))
        self.assertTrue(all(r["assessment_run_id"] == ASSESSMENT_RUN for r in rows))

    def test_a_cell_only_completed_once_all_its_calls_are_done_gets_a_placeholder_but_no_depth(self):
        calls = [dict(CALLS[0]), dict(CALLS[1], status="pending"), dict(CALLS[2])]
        fake = store(aci_judge_calls=calls)
        _estimate, _report, model = give(fake)
        rows = fake.tables["aci_depths_out_of_ten"]
        # Every done call still gets its placeholder row...
        self.assertEqual({r["call_id"] for r in rows}, {"call-sol", "call-deepseek"})
        # ... but none of them is given, because the cell is not whole.
        self.assertTrue(all(r["status"] == "pending" for r in rows))
        self.assertEqual(model.asked, [])

    def test_nothing_is_ever_written_to_the_scale_of_four_table(self):
        fake = store()
        give(fake)
        self.assertEqual(fake.tables["aci_depths"], [])
        self.assertFalse(any(name == "aci_depths" for kind, name, *_ in fake.writes))

    def test_existing_rows_are_left_alone_and_resumed_by_their_own_id(self):
        fake = store(aci_depths_out_of_ten=[
            {"id": "row-sol", "call_id": "call-sol",
             "prompt_sha256": depth_call.prompt_sha256(10),
             "assessment_run_id": ASSESSMENT_RUN, "status": "pending"}])
        give(fake)
        rows = [r for r in fake.tables["aci_depths_out_of_ten"] if r["call_id"] == "call-sol"]
        self.assertEqual(len(rows), 1, "no second row for a call that already had one")
        self.assertEqual(rows[0]["id"], "row-sol")
        self.assertEqual(rows[0]["status"], "done")
        # Every update of this table matched a row by its own id.
        for write in fake.writes:
            if write[0] == "update" and write[1] == "aci_depths_out_of_ten":
                _kind, _table, match, _patch = write
                self.assertIn("id", match)
                self.assertNotIn("call_id", match)

    def test_a_second_pass_inserts_nothing_more_and_asks_nothing_more(self):
        fake = store()
        give(fake)
        inserted_before = len(fake.inserted("aci_depths_out_of_ten"))
        _estimate, _report, model = give(fake)
        self.assertEqual(len(fake.inserted("aci_depths_out_of_ten")), inserted_before)
        self.assertEqual(model.asked, [])

    def test_the_rules_block_carries_locators_cited_by_two_seats_and_no_other(self):
        fake = store()
        _estimate, _report, model = give(fake)
        self.assertTrue(model.asked)
        for _tag, user in model.asked:
            self.assertIn(PASSAGES[0][2], user)
            self.assertNotIn(PASSAGES[1][2], user)
            self.assertIn(PASSAGES[2][2], user, "the retained behaviour passage is shown")
            self.assertNotIn(PASSAGES[3][2], user, "the un-retained passage is left out")

    def test_a_depth_is_given_by_the_seat_and_carries_no_model_or_reason(self):
        fake = store()
        give(fake)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"] if r["call_id"] == "call-sol")
        self.assertEqual(row["status"], "done")
        self.assertEqual(row["depth"], 6)
        self.assertEqual(row["rationale"], "A default, weighed against another rule.")
        self.assertIsNone(row.get("model"))
        self.assertIsNone(row.get("substitution_reason"))
        self.assertEqual(row["passages"], 1)
        self.assertIsNotNone(row["cost_usd"])
        self.assertTrue(row["started_at"] and row["finished_at"])

    def test_a_substitute_is_recorded_only_when_it_answers(self):
        model = Scripted(deepseek=["DEPTH: -1"] * 3,
                         kimi=["DEPTH: 5\nRATIONALE: A default only."])
        fake = store()
        give(fake, model=model)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"]
                  if r["call_id"] == "call-deepseek")
        self.assertEqual(row["status"], "done")
        self.assertEqual(row["depth"], 5)
        self.assertEqual(row["model"], "kimi")
        self.assertEqual(row["substitution_reason"], depth_ladder.SUBSTITUTION_REASON)

    def test_nothing_parsing_leaves_the_row_in_error_with_the_last_reply(self):
        model = Scripted(sol=["not a depth"] * 3)
        fake = store()
        give(fake, model=model)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"] if r["call_id"] == "call-sol")
        self.assertEqual(row["status"], "error")
        self.assertIsNone(row.get("depth"))
        self.assertEqual(row["raw_output"], "not a depth")
        self.assertIsNotNone(row["error"])

    def test_a_row_retried_after_an_error_clears_its_stale_raw_output(self):
        fake = store(aci_depths_out_of_ten=[
            {"id": "row-sol", "call_id": "call-sol",
             "prompt_sha256": depth_call.prompt_sha256(10),
             "assessment_run_id": ASSESSMENT_RUN, "status": "error",
             "raw_output": "a stale unparsed reply", "error": "no depth parsed"}])
        give(fake)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"] if r["call_id"] == "call-sol")
        self.assertEqual(row["status"], "done")
        self.assertIsNone(row["raw_output"])

    def test_a_cell_with_nothing_retained_is_depth_zero_without_a_call(self):
        empty_calls = [{"id": "call-sol-2", "run_id": RUN, "behaviour_slug": "silence",
                       "spec_version_id": VERSION_ID, "model": "sol", "status": "done"}]
        fake = store(aci_judge_calls=empty_calls, aci_judgements=[])
        model = Scripted()
        give(fake, model=model)
        [row] = fake.tables["aci_depths_out_of_ten"]
        self.assertEqual((row["status"], row["depth"], row["passages"]), ("done", 0, 0))
        self.assertEqual(row["rationale"], depth_call.NOTHING_RETAINED)
        self.assertEqual(model.asked, [])

    def test_an_unassessed_document_is_refused_before_anything_is_written(self):
        fake = store()
        model = Scripted()
        with self.assertRaises(SystemExit) as refused:
            give(fake, assessment_run="assess-missing", model=model)
        self.assertIn(DOC, str(refused.exception))
        self.assertEqual(fake.writes, [])
        self.assertEqual(model.asked, [])


class MainTest(unittest.TestCase):
    def main(self, argv, fake):
        with mock.patch.object(depth_pass, "Store", type("S", (), {"from_env": staticmethod(
                    lambda: fake)})), \
                mock.patch.object(depth_pass.index_store, "install_registry", lambda s: None), \
                mock.patch.object(depth_pass.index_store, "judging_registry",
                                  lambda s: REGISTRY), \
                mock.patch.object(depth_pass.h, "passages", passages_for), \
                mock.patch.object(depth_pass.batch_job, "call_openrouter", Scripted()), \
                contextlib.redirect_stdout(io.StringIO()) as printed:
            code = depth_pass.main(argv)
        return code, printed.getvalue()

    def test_without_go_it_prints_the_price_and_writes_nothing(self):
        fake = store()
        code, printed = self.main([f"--runs={RUN}", f"--assessment-run={ASSESSMENT_RUN}"], fake)
        self.assertEqual(code, 0)
        self.assertIn("Priced at about", printed)
        self.assertEqual(fake.writes, [])

    def test_with_go_it_writes_and_reports_what_it_gave(self):
        fake = store()
        code, printed = self.main(
            [f"--runs={RUN}", f"--assessment-run={ASSESSMENT_RUN}", "--go"], fake)
        self.assertEqual(code, 0)
        self.assertIn("done", printed)
        self.assertTrue(fake.tables["aci_depths_out_of_ten"])
        self.assertTrue(all(r["status"] == "done"
                            for r in fake.tables["aci_depths_out_of_ten"]))


if __name__ == "__main__":
    unittest.main()
