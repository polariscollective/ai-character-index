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

import httpx
import openai

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
# Keys stay out of it: resolve() reads a .env beside the harness unless told not to.
os.environ["PANEL_DOTENV"] = str(ROOT / "no-such.env")
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                 # noqa: E402
import depth_call                # noqa: E402
import depth_ladder              # noqa: E402
import depth_pass                # noqa: E402
import index_store               # noqa: E402
import seat_call                 # noqa: E402
import store as store_module     # noqa: E402

CONFIG = json.loads((HERE / "panel-config.json").read_text())

RUN = "run-1"
# An id as the database writes one: --assessment-run refuses anything else.
ASSESSMENT_RUN = "5d1c7a52-0b8e-4c1f-9a3d-6e2f4b7c8d90"
MISSING_RUN = "00000000-0000-4000-8000-000000000000"
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
# A run that assessed the document whole, as a publication requires: finished,
# every seat of both questions answered, every criterion scored, and no claim
# left without a reading from each seat of the contradictions (there is none).
ASSESSMENT_RUN_ROW = {"id": ASSESSMENT_RUN, "status": "done",
                      "panels": {"criteria": ["sol", "fable", "deepseek"],
                                 "contradictions": ["sol", "fable", "kimi"]}}
PREFIX = {"criteria": "ac", "contradictions": "ax"}
ASSESSMENT_CALLS = [
    {"id": f"{PREFIX[question]}-{seat}", "run_id": ASSESSMENT_RUN, "spec_version_id": VERSION_ID,
     "question": question, "seat": seat, "model": seat, "status": "done"}
    for question, seats in ASSESSMENT_RUN_ROW["panels"].items() for seat in seats]
# sol and fable both cite the first passage: it reaches the quorum of two.
# Only sol cites the second: it stays out of the rules block.
ASSESSMENT_SCORES = [
    {"call_id": "ac-sol", "criterion": "conflict_rules", "score": 2,
     "rationale": "An order of priority.", "locators": [PASSAGES[0][0], PASSAGES[1][0]]},
    {"call_id": "ac-fable", "criterion": "conflict_rules", "score": 2,
     "rationale": "An order of priority.", "locators": [PASSAGES[0][0]]},
    {"call_id": "ac-deepseek", "criterion": "conflict_rules", "score": 0,
     "rationale": "Nothing found.", "locators": []},
] + [{"call_id": f"ac-{seat}", "criterion": criterion, "score": 2, "rationale": "Some.",
      "locators": []}
     for seat in ("sol", "fable", "deepseek")
     for criterion in ("rule_force", "reasons", "situations")]


# A second assessment run of the same document, taking its criteria from the
# first: `assess.py --criteria-from` writes that into its config, and it holds
# contradictions of its own and no criteria call at all.
TAKING_RUN = "7c2b1e94-3a5d-4f18-8b60-1d9e2c4a6f31"
TAKING_RUN_ROW = {"id": TAKING_RUN, "status": "done",
                  "panels": {"criteria": ["sol", "fable", "deepseek"],
                             "contradictions": ["sol", "fable", "kimi"]},
                  "config": {"substitutes": {}, "criteria_from": ASSESSMENT_RUN}}
TAKING_CALLS = [
    {"id": f"tx-{seat}", "run_id": TAKING_RUN, "spec_version_id": VERSION_ID,
     "question": "contradictions", "seat": seat, "model": seat, "status": "done"}
    for seat in TAKING_RUN_ROW["panels"]["contradictions"]]


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
        "aci_runs": [{"id": RUN}],
        "aci_spec_versions": [dict(VERSION)],
        "aci_judge_calls": [dict(c) for c in CALLS],
        "aci_judgements": [dict(j) for j in JUDGEMENTS],
        "aci_assessment_runs": [dict(ASSESSMENT_RUN_ROW)],
        "aci_assessment_calls": [dict(c) for c in ASSESSMENT_CALLS],
        "aci_assessment_scores": [dict(s) for s in ASSESSMENT_SCORES],
        "aci_assessment_claims": [],
        "aci_assessment_verdicts": [],
        "aci_depths_out_of_ten": [],
        "aci_depths": [],
    }
    tables.update(extra)
    return FakeStore(**tables)


def taking_store(taking_calls=TAKING_CALLS):
    """The same tables, with the second run beside the first: its criteria are
    the first run's, and `taking_calls` is what it wrote itself."""
    return store(aci_assessment_runs=[dict(ASSESSMENT_RUN_ROW), dict(TAKING_RUN_ROW)],
                 aci_assessment_calls=[dict(c) for c in ASSESSMENT_CALLS]
                 + [dict(c) for c in taking_calls])


ANSWER = "DEPTH: 6\nRATIONALE: A default, weighed against another rule."


class Scripted:
    """Replies per tag, taken in order; a tag with nothing left answers ANSWER.
    A reply that is an exception, a KeyboardInterrupt included, is raised
    instead of returned."""

    def __init__(self, **script):
        self.script = {tag: list(replies) for tag, replies in script.items()}
        self.asked = []

    def __call__(self, provider, model_id, system, user, kwargs):
        tag = next((t for t in ("deepseek", "fable", "glm", "opus", "kimi", "sol")
                    if t in model_id.lower()), model_id)
        self.asked.append((tag, user))
        replies = self.script.get(tag) or []
        reply = replies.pop(0) if replies else ANSWER
        if isinstance(reply, BaseException):
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
        # The worst case is computed per seat actually present, from the ladder
        # and config["substitutes"]: 3 for a seat with no declared substitute
        # (sol), 3 + 2*3 for fable (opus, kimi, glm), 3 + 2*2 for deepseek
        # (glm, kimi).
        self.assertIn("sol up to 3", out)
        self.assertIn("fable up to 9", out)
        self.assertIn("deepseek up to 7", out)

    def test_the_price_names_only_the_seats_actually_present(self):
        fake = store(aci_judge_calls=[dict(CALLS[0])])
        with contextlib.redirect_stdout(io.StringIO()) as printed:
            depth_pass.give_pass(fake, CONFIG, [RUN], ASSESSMENT_RUN, passages_for,
                                 call_model=Scripted(), go=False, registry=REGISTRY)
        out = printed.getvalue()
        self.assertIn("sol up to 3", out)
        self.assertNotIn("fable", out)
        self.assertNotIn("deepseek", out)

    def test_an_unassessed_document_is_refused_before_anything_is_written_priced(self):
        fake = store()
        with self.assertRaises(SystemExit) as refused:
            give(fake, assessment_run=MISSING_RUN, go=False)
        self.assertIn(DOC, str(refused.exception))
        self.assertEqual(fake.writes, [])

    def test_a_document_missing_one_of_three_criteria_seats_is_refused(self):
        fake = store(aci_assessment_calls=[dict(c) for c in ASSESSMENT_CALLS
                                           if c["question"] != "criteria" or c["seat"] == "sol"])
        with self.assertRaises(SystemExit) as refused:
            give(fake, go=False)
        message = str(refused.exception)
        self.assertIn(DOC, message)
        self.assertIn("fable", message)
        self.assertIn("deepseek", message)
        self.assertEqual(fake.writes, [])


class RefusedAsThePublicationWouldTest(unittest.TestCase):
    """An assessment the publication would refuse stops the pass before it is
    priced and before anything is written, naming every gap."""

    def refused(self, fake):
        model = Scripted()
        with contextlib.redirect_stdout(io.StringIO()) as printed, \
                self.assertRaises(SystemExit) as refused:
            depth_pass.give_pass(fake, CONFIG, [RUN], ASSESSMENT_RUN, passages_for,
                                 call_model=model, go=True, registry=REGISTRY)
        self.assertEqual(fake.writes, [], "a refused pass wrote something")
        self.assertEqual(model.asked, [], "a refused pass asked a model")
        self.assertNotIn("Priced", printed.getvalue(), "a refused pass was priced")
        message = str(refused.exception)
        self.assertIn(DOC, message)
        return message

    def test_the_complete_fixture_is_not_refused(self):
        _estimate, report, _model = give(store())
        self.assertEqual(report, {"done": 3, "failed": 0})

    def test_an_assessment_run_left_in_error_stops_the_pass(self):
        message = self.refused(store(aci_assessment_runs=[dict(ASSESSMENT_RUN_ROW,
                                                               status="error")]))
        self.assertIn("status is error", message)

    def test_a_claim_some_seat_never_read_stops_the_pass(self):
        claim = {"id": "claim-1", "run_id": ASSESSMENT_RUN, "spec_version_id": VERSION_ID,
                 "first_locator": PASSAGES[2][0], "second_locator": PASSAGES[3][0],
                 "situation": "s", "why": "w", "found_by": ["sol"]}
        verdicts = [{"claim_id": "claim-1", "call_id": "ax-sol", "seat": "sol", "holds": True,
                     "absolute": None, "reason": "found it"},
                    {"claim_id": "claim-1", "call_id": "ax-fable", "seat": "fable",
                     "holds": False, "absolute": False, "reason": "Different users."}]
        message = self.refused(store(aci_assessment_claims=[claim],
                                     aci_assessment_verdicts=verdicts))
        self.assertIn(f"{DOC}: kimi gave no reading of 1 of its 1 claimed contradictions",
                      message)
        self.assertNotIn("fable gave no reading", message)

    def test_a_criteria_score_missing_stops_the_pass(self):
        scores = [dict(s) for s in ASSESSMENT_SCORES
                  if (s["call_id"], s["criterion"]) != ("ac-fable", "situations")]
        message = self.refused(store(aci_assessment_scores=scores))
        self.assertIn(f"{DOC}: fable's criteria answer scored no situations", message)

    def test_a_contradictions_seat_that_gave_no_answer_stops_the_pass(self):
        calls = [dict(c, status="error") if c["id"] == "ax-kimi" else dict(c)
                 for c in ASSESSMENT_CALLS]
        message = self.refused(store(aci_assessment_calls=calls))
        self.assertIn(f"{DOC}: kimi gave no contradictions answer", message)

    def test_every_gap_is_named_at_once(self):
        scores = [dict(s) for s in ASSESSMENT_SCORES
                  if (s["call_id"], s["criterion"]) != ("ac-fable", "situations")]
        message = self.refused(store(aci_assessment_runs=[dict(ASSESSMENT_RUN_ROW,
                                                               status="running")],
                                     aci_assessment_scores=scores))
        self.assertIn("status is running", message)
        self.assertIn("scored no situations", message)
        self.assertIn("new assessment run", message)
        self.assertIn(f"--resume={ASSESSMENT_RUN}", message)
        self.assertNotIn("not taken up again", message)


class CriteriaFromAnEarlierRunTest(unittest.TestCase):
    """A run that takes its criteria from an earlier run is held to what it
    wrote itself, and its depths are written against the run whose criteria it
    takes, which is the run a publication reads them from."""

    def printed(self, fake, assessment_run, go):
        with contextlib.redirect_stdout(io.StringIO()) as printed:
            depth_pass.give_pass(fake, CONFIG, [RUN], assessment_run, passages_for,
                                 call_model=Scripted(), go=go, registry=REGISTRY)
        return printed.getvalue()

    def test_the_rows_are_written_against_the_run_whose_criteria_it_takes(self):
        fake = taking_store()
        _estimate, report, _model = give(fake, assessment_run=TAKING_RUN)
        self.assertEqual(report, {"done": 3, "failed": 0})
        rows = fake.tables["aci_depths_out_of_ten"]
        self.assertEqual({r["call_id"] for r in rows},
                         {"call-sol", "call-fable", "call-deepseek"})
        self.assertTrue(all(r["assessment_run_id"] == ASSESSMENT_RUN for r in rows))
        self.assertFalse(any(r["assessment_run_id"] == TAKING_RUN for r in rows))

    def test_it_says_which_run_the_depths_are_given_against_before_it_prices(self):
        out = self.printed(taking_store(), TAKING_RUN, go=False)
        self.assertEqual(out.splitlines()[0],
                         f"The depths are given against assessment run {ASSESSMENT_RUN}, "
                         f"whose criteria assessment run {TAKING_RUN} takes.")
        self.assertIn("Priced at about", out)
        self.assertLess(out.index("given against"), out.index("Priced at about"))

    def test_a_run_taking_nothing_says_nothing_and_writes_against_the_run_named(self):
        fake = store()
        out = self.printed(fake, ASSESSMENT_RUN, go=True)
        self.assertTrue(out.startswith("Priced at about"), out.splitlines()[:1])
        self.assertNotIn("given against", out)
        self.assertTrue(all(r["assessment_run_id"] == ASSESSMENT_RUN
                            for r in fake.tables["aci_depths_out_of_ten"]))

    def test_a_gap_in_its_own_contradictions_still_stops_the_pass(self):
        calls = [dict(c, status="error") if c["seat"] == "kimi" else dict(c)
                 for c in TAKING_CALLS]
        fake = taking_store(taking_calls=calls)
        model = Scripted()
        with contextlib.redirect_stdout(io.StringIO()) as printed, \
                self.assertRaises(SystemExit) as refused:
            depth_pass.give_pass(fake, CONFIG, [RUN], TAKING_RUN, passages_for,
                                 call_model=model, go=True, registry=REGISTRY)
        self.assertIn(f"{DOC}: kimi gave no contradictions answer in assessment run "
                      f"{TAKING_RUN}", str(refused.exception))
        self.assertEqual(fake.writes, [])
        self.assertEqual(model.asked, [])
        self.assertEqual(printed.getvalue(), "", "a refused pass said which run it would use")

    def test_a_depth_already_given_against_the_earlier_run_is_not_given_again(self):
        fake = taking_store()
        give(fake, assessment_run=ASSESSMENT_RUN)
        inserted = len(fake.inserted("aci_depths_out_of_ten"))
        _estimate, _report, model = give(fake, assessment_run=TAKING_RUN)
        self.assertEqual(model.asked, [])
        self.assertEqual(len(fake.inserted("aci_depths_out_of_ten")), inserted)
        self.assertEqual(len(fake.tables["aci_depths_out_of_ten"]), 3)

    def test_a_publication_naming_the_run_reads_the_depths_the_pass_wrote(self):
        """The whole point of writing them there: `index_store.cell_depths`,
        which is what a publication reads its depths with, finds them under the
        run named."""
        fake = taking_store()
        give(fake, assessment_run=TAKING_RUN)
        cells = [{"run_id": RUN, "behaviour_slug": "honesty", "spec_version_id": VERSION_ID}]
        given = index_store.cell_depths(fake, cells, TAKING_RUN,
                                        depth_prompt=depth_call.prompt_sha256(10))
        cell = given[("honesty", VERSION_ID)]
        self.assertEqual((cell["mean"], cell["scale"]), (6, 10))
        self.assertEqual(sorted(cell["judges"]), ["deepseek", "fable", "sol"])


class OneModelOneDepthTest(unittest.TestCase):
    """A substitute that has given one depth of a cell is seated in that cell,
    so it gives no second depth there, in this pass or on resuming."""

    def test_kimi_answering_for_fable_is_then_skipped_for_deepseek(self):
        model = Scripted(fable=["DEPTH: -1"] * 3, opus=["DEPTH: -1"] * 2,
                         deepseek=["DEPTH: -1"] * 3, glm=["DEPTH: -1"] * 2)
        fake = store()
        give(fake, model=model)
        rows = {r["call_id"]: r for r in fake.tables["aci_depths_out_of_ten"]}
        self.assertEqual((rows["call-fable"]["status"], rows["call-fable"]["model"]),
                         ("done", "kimi"))
        deepseek = rows["call-deepseek"]
        self.assertEqual(deepseek["status"], "error")
        self.assertIn({"model": "kimi", "reason": depth_ladder.ALREADY_SEATED, "parsed": False},
                      deepseek["attempts"])
        self.assertEqual([tag for tag, _user in model.asked].count("kimi"), 1,
                         "kimi gives fable's depth and is not asked for deepseek's")

    def test_glm_gives_deepseeks_depth_when_kimi_already_gave_fables(self):
        """The case the new order exists for: kimi already sits in fable's
        seat, and deepseek's own three attempts are off the scale, so glm,
        deepseek's other declared substitute, gives the depth instead."""
        model = Scripted(fable=["DEPTH: -1"] * 3, opus=["DEPTH: -1"] * 2,
                         deepseek=["DEPTH: -1"] * 3,
                         glm=["DEPTH: 5\nRATIONALE: A default only."])
        fake = store()
        give(fake, model=model)
        rows = {r["call_id"]: r for r in fake.tables["aci_depths_out_of_ten"]}
        self.assertEqual((rows["call-fable"]["status"], rows["call-fable"]["model"]),
                         ("done", "kimi"))
        deepseek = rows["call-deepseek"]
        self.assertEqual(deepseek["status"], "done")
        self.assertEqual(deepseek["depth"], 5)
        self.assertEqual(deepseek["model"], "glm")
        self.assertEqual(deepseek["substitution_reason"], "off-scale reply after two reminders")
        self.assertEqual([tag for tag, _user in model.asked].count("kimi"), 1,
                         "kimi gives fable's depth only; glm gives deepseek's without needing it")

    def test_a_substitute_of_an_earlier_done_row_is_seated_on_resuming(self):
        fake = store(aci_depths_out_of_ten=[
            {"id": "row-fable", "call_id": "call-fable", "status": "done", "depth": 5,
             "prompt_sha256": depth_call.prompt_sha256(10), "assessment_run_id": ASSESSMENT_RUN,
             "model": "kimi", "substitution_reason": depth_ladder.SUBSTITUTION_REASON}])
        model = Scripted(deepseek=["DEPTH: -1"] * 3, glm=["DEPTH: -1"] * 2)
        give(fake, model=model)
        deepseek = next(r for r in fake.tables["aci_depths_out_of_ten"]
                        if r["call_id"] == "call-deepseek")
        self.assertEqual(deepseek["status"], "error")
        self.assertNotIn("kimi", [tag for tag, _user in model.asked])

    def test_a_substitute_of_another_assessment_run_does_not_seat_it_here(self):
        fake = store(aci_depths_out_of_ten=[
            {"id": "row-fable-old", "call_id": "call-fable", "status": "done", "depth": 5,
             "prompt_sha256": depth_call.prompt_sha256(10), "assessment_run_id": MISSING_RUN,
             "model": "kimi", "substitution_reason": depth_ladder.SUBSTITUTION_REASON}])
        model = Scripted(deepseek=["DEPTH: -1"] * 3, glm=["DEPTH: -1"] * 2)
        give(fake, model=model)
        deepseek = next(r for r in fake.tables["aci_depths_out_of_ten"]
                        if r["call_id"] == "call-deepseek"
                        and r["assessment_run_id"] == ASSESSMENT_RUN)
        self.assertEqual((deepseek["status"], deepseek["model"]), ("done", "kimi"))


def at_most(tag, system, user):
    """One attempt at its input estimate and at its model's largest output,
    worked out here from the prices rather than through the code under test."""
    usage = {"prompt_tokens": (len(system) + len(user)) // 4,
             "completion_tokens": CONFIG["models"][tag].get("max_output", 32768)}
    return batch_job.cost_of(tag, usage, CONFIG)


class CeilingTest(unittest.TestCase):
    """Beside the estimate, the most the pass can cost: every call the ladder
    can make, each billed at its model's largest output."""

    def printed(self, fake):
        with contextlib.redirect_stdout(io.StringIO()) as printed:
            estimate, _report = depth_pass.give_pass(fake, CONFIG, [RUN], ASSESSMENT_RUN,
                                                     passages_for, call_model=Scripted(),
                                                     go=False, registry=REGISTRY)
        return estimate, printed.getvalue()

    def composed(self):
        rules = [PASSAGES[0]]
        return depth_call.compose("honesty", REGISTRY, [PASSAGES[2]], scale=10,
                                  conflict_rules=rules)

    def test_a_seat_with_no_substitute_is_billed_three_times_at_its_largest_output(self):
        system, user = self.composed()
        want = sum(at_most("sol", system, depth_ladder.user_for(user, reminder))
                   for reminder in (0, 1, 2))
        _estimate, out = self.printed(store(aci_judge_calls=[dict(CALLS[0])]))
        self.assertIn(f"ceiling of {round(want, 2)} dollars", out)

    def test_fable_is_billed_then_opus_then_kimi_then_glm_each_at_its_own_largest_output(self):
        system, user = self.composed()
        want = (sum(at_most("fable", system, depth_ladder.user_for(user, r)) for r in (0, 1, 2))
                + sum(at_most("opus", system, depth_ladder.user_for(user, r)) for r in (0, 1))
                + sum(at_most("kimi", system, depth_ladder.user_for(user, r)) for r in (0, 1))
                + sum(at_most("glm", system, depth_ladder.user_for(user, r)) for r in (0, 1)))
        self.assertEqual(CONFIG["models"]["kimi"]["max_output"], 131072)
        self.assertEqual(CONFIG["models"]["glm"]["max_output"], 131072)
        _estimate, out = self.printed(store(aci_judge_calls=[dict(CALLS[1])]))
        self.assertIn(f"ceiling of {round(want, 2)} dollars", out)

    def test_the_ceiling_is_labelled_and_is_above_the_estimate(self):
        estimate, out = self.printed(store())
        self.assertIn("Priced at about", out)
        line = next(part for part in out.split(". ") if "ceiling of" in part)
        ceiling = float(line.split("ceiling of ")[1].split(" dollars")[0])
        self.assertGreater(ceiling, estimate)
        self.assertIn("the most this pass can cost", out)

    def test_the_largest_output_is_the_cap_each_call_is_sent_with(self):
        for tag in ("sol", "fable", "opus", "kimi", "deepseek", "glm"):
            _provider, model_id = seat_call.h.resolve(tag, CONFIG)
            kwargs = seat_call.whole_doc.judge_kwargs(tag, model_id, CONFIG)
            cap = kwargs.get("max_tokens", kwargs.get("max_completion_tokens"))
            self.assertEqual(seat_call.max_output(tag, CONFIG), cap, tag)


class InterruptedTest(unittest.TestCase):
    """A pass stopped mid-depth leaves the row in error with every attempt
    already billed, and the interruption still stops the pass."""

    def test_a_keyboard_interrupt_mid_ladder_keeps_the_attempts_already_billed(self):
        earlier = {"model": "sol", "reminder": 0, "finish_reason": "stop", "cost_usd": 0.05,
                   "parsed": False}
        fake = store(aci_depths_out_of_ten=[
            {"id": "row-sol", "call_id": "call-sol", "status": "error",
             "prompt_sha256": depth_call.prompt_sha256(10), "assessment_run_id": ASSESSMENT_RUN,
             "attempts": [dict(earlier)], "cost_usd": 0.05}])
        model = Scripted(sol=["DEPTH: -1", KeyboardInterrupt()])
        with self.assertRaises(KeyboardInterrupt):
            give(fake, model=model)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"] if r["id"] == "row-sol")
        self.assertEqual(row["status"], "error")
        self.assertEqual(row["attempts"][0], earlier)
        self.assertEqual(len(row["attempts"]), 2, "the earlier attempt and the one billed now")
        billed = batch_job.cost_of("sol", {"prompt_tokens": 1000, "completion_tokens": 100},
                                   CONFIG)
        self.assertEqual(row["attempts"][1]["cost_usd"], billed)
        self.assertAlmostEqual(row["cost_usd"], 0.05 + billed)
        self.assertEqual(row["error"], "KeyboardInterrupt")
        self.assertTrue(row["finished_at"])

    def test_a_failed_final_update_leaves_the_row_in_error_with_its_bill(self):
        class Balky(FakeStore):
            def update(self, table, match, patch):
                if table == "aci_depths_out_of_ten" and patch.get("status") == "done" \
                        and "attempts" in patch:
                    raise RuntimeError("connection reset")
                return super().update(table, match, patch)
        tables = store().tables
        fake = Balky(**tables)
        with self.assertRaises(RuntimeError):
            give(fake)
        [row] = [r for r in fake.tables["aci_depths_out_of_ten"] if r["status"] != "pending"]
        self.assertEqual(row["status"], "error")
        self.assertEqual(row["error"], "connection reset")
        self.assertEqual(len(row["attempts"]), 1)
        self.assertEqual(row["cost_usd"], row["attempts"][0]["cost_usd"])
        self.assertIsNotNone(row["cost_usd"])


REQUEST = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")


def cut():
    """What the openai client raises when the connection is gone."""
    return openai.APIConnectionError(request=REQUEST)


class UnreachableTest(unittest.TestCase):
    """A network cut that outlasts every wait stops the pass with the row it
    was giving written error, and the same command run again gives it."""

    def main(self, fake, model):
        argv = [f"--runs={RUN}", f"--assessment-run={ASSESSMENT_RUN}", "--go"]
        with mock.patch.object(depth_pass, "Store", type("S", (), {"from_env": staticmethod(
                    lambda **_kwargs: fake)})), \
                mock.patch.object(depth_pass.index_store, "install_registry", lambda s: None), \
                mock.patch.object(depth_pass.index_store, "judging_registry",
                                  lambda s: REGISTRY), \
                mock.patch.object(depth_pass.h, "passages", passages_for), \
                mock.patch.object(depth_pass.batch_job, "call_openrouter", model), \
                mock.patch.object(seat_call, "sleep", lambda seconds: None), \
                contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()) as stderr:
            code = depth_pass.main(argv)
        return code, stderr.getvalue()

    def test_the_row_is_left_error_with_its_bill_and_the_same_command_gives_it(self):
        fake = store()
        # fable's plain attempt comes back off the scale and is billed; its
        # first reminder never reaches the model.
        code, stderr = self.main(fake, Scripted(fable=["DEPTH: -1"] + [cut()] * 6))
        self.assertNotEqual(code, 0)
        rows = {r["call_id"]: r for r in fake.tables["aci_depths_out_of_ten"]}
        fable = rows["call-fable"]
        self.assertEqual(fable["status"], "error")
        self.assertTrue(fable["error"].startswith("unreachable: fable"), fable["error"])
        self.assertIn("APIConnectionError", fable["error"])
        billed = batch_job.cost_of("fable", {"prompt_tokens": 1000, "completion_tokens": 100},
                                   CONFIG)
        self.assertEqual([(a["model"], a["reminder"], a["cost_usd"]) for a in fable["attempts"]],
                         [("fable", 0, billed)])
        self.assertEqual(fable["cost_usd"], billed)
        self.assertEqual(rows["call-sol"]["status"], "done")
        self.assertEqual(rows["call-deepseek"]["status"], "pending", "never reached")
        self.assertIn("the same command", stderr)

        again = Scripted()
        code, _stderr = self.main(fake, again)
        self.assertEqual(code, 0)
        self.assertEqual([tag for tag, _user in again.asked], ["fable", "deepseek"],
                         "only the depths not done are given")
        rows = {r["call_id"]: r for r in fake.tables["aci_depths_out_of_ten"]}
        self.assertTrue(all(row["status"] == "done" for row in rows.values()))
        fable = rows["call-fable"]
        self.assertEqual(len(fable["attempts"]), 2, "the earlier billed attempt is kept")
        self.assertAlmostEqual(fable["cost_usd"], 2 * billed)
        self.assertIsNone(fable["error"])
        self.assertEqual(len(fake.tables["aci_depths_out_of_ten"]), 3, "no second row")


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
                         glm=["DEPTH: 5\nRATIONALE: A default only."])
        fake = store()
        give(fake, model=model)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"]
                  if r["call_id"] == "call-deepseek")
        self.assertEqual(row["status"], "done")
        self.assertEqual(row["depth"], 5)
        self.assertEqual(row["model"], "glm")
        self.assertEqual(row["substitution_reason"], depth_ladder.SUBSTITUTION_REASON)

    def test_a_substitutes_depth_sums_cost_and_tokens_over_every_attempt_of_the_ladder(self):
        model = Scripted(deepseek=["DEPTH: -1"] * 3,
                         glm=["DEPTH: -1", "DEPTH: 5\nRATIONALE: A default only."])
        fake = store()
        give(fake, model=model)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"]
                  if r["call_id"] == "call-deepseek")
        self.assertEqual(row["status"], "done")
        self.assertEqual(len(row["attempts"]), 5, "3 of deepseek, 2 of glm")
        self.assertEqual(row["cost_usd"], depth_pass._sum(a["cost_usd"] for a in row["attempts"]))
        self.assertIsNotNone(row["cost_usd"])
        self.assertEqual(row["prompt_tokens"], 5 * 1000)
        self.assertEqual(row["completion_tokens"], 5 * 100)

    def test_a_declared_substitute_already_seated_in_the_cell_is_skipped(self):
        # An Alibaba-like cell: kimi already gave one of the cell's depths, in
        # fable's seat, and deepseek is off scale three times, and so is glm.
        # Its last declared substitute is kimi, already seated, so it cannot
        # give a second depth in the same cell.
        calls = [dict(CALLS[0]), dict(CALLS[1], id="call-kimi", model="kimi"), dict(CALLS[2])]
        fake = store(aci_judge_calls=calls)
        model = Scripted(deepseek=["DEPTH: -1"] * 3, glm=["DEPTH: -1"] * 2)
        give(fake, model=model)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"]
                  if r["call_id"] == "call-deepseek")
        self.assertEqual(row["status"], "error")
        self.assertTrue(any(a.get("model") == "kimi" and a.get("reason") ==
                            depth_ladder.ALREADY_SEATED for a in row["attempts"]))
        kimi_asks = [user for tag, user in model.asked if tag == "kimi"]
        self.assertEqual(len(kimi_asks), 1,
                         "kimi answers once, for its own row, and is not asked again for deepseek")

    def test_nothing_parsing_leaves_the_row_in_error_with_the_last_reply(self):
        model = Scripted(sol=["not a depth"] * 3)
        fake = store()
        give(fake, model=model)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"] if r["call_id"] == "call-sol")
        self.assertEqual(row["status"], "error")
        self.assertIsNone(row.get("depth"))
        self.assertEqual(row["raw_output"], "not a depth")
        self.assertIsNotNone(row["error"])

    def test_a_failed_depth_keeps_the_last_non_null_reply_when_the_last_attempt_raised(self):
        model = Scripted(sol=["first off-scale reply", "second off-scale reply",
                              RuntimeError("boom")])
        fake = store()
        give(fake, model=model)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"] if r["call_id"] == "call-sol")
        self.assertEqual(row["status"], "error")
        self.assertEqual(row["raw_output"], "second off-scale reply",
                         "the last reply that came back, not the literal last attempt, which raised")

    def test_a_failed_depths_raw_output_is_capped_at_20000_characters(self):
        long_reply = "y" * 20005
        model = Scripted(sol=[long_reply] * 3)
        fake = store()
        give(fake, model=model)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"] if r["call_id"] == "call-sol")
        self.assertEqual(row["status"], "error")
        self.assertEqual(row["raw_output"], "y" * 20000)

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

    def test_a_row_retried_after_an_error_keeps_its_earlier_bill(self):
        earlier_attempt = {"model": "sol", "reminder": 0, "finish_reason": "stop",
                          "cost_usd": 0.05, "parsed": False}
        fake = store(aci_depths_out_of_ten=[
            {"id": "row-sol", "call_id": "call-sol",
             "prompt_sha256": depth_call.prompt_sha256(10),
             "assessment_run_id": ASSESSMENT_RUN, "status": "error",
             "attempts": [dict(earlier_attempt)], "cost_usd": 0.05,
             "prompt_tokens": 500, "completion_tokens": 50,
             "raw_output": "a stale unparsed reply", "error": "no depth parsed"}])
        give(fake)
        row = next(r for r in fake.tables["aci_depths_out_of_ten"] if r["call_id"] == "call-sol")
        self.assertEqual(row["status"], "done")
        self.assertEqual(row["attempts"][0], earlier_attempt,
                         "the earlier attempt is kept, not replaced")
        self.assertEqual(len(row["attempts"]), 2, "the new attempt is appended to the earlier one")
        new_cost = depth_pass._sum(a["cost_usd"] for a in row["attempts"][1:])
        self.assertAlmostEqual(row["cost_usd"], 0.05 + new_cost)
        self.assertEqual(row["prompt_tokens"], 500 + 1000)
        self.assertEqual(row["completion_tokens"], 50 + 100)

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

    def test_a_cell_with_nothing_retained_records_its_assessment_run_id(self):
        empty_calls = [{"id": "call-sol-2", "run_id": RUN, "behaviour_slug": "silence",
                       "spec_version_id": VERSION_ID, "model": "sol", "status": "done"}]
        fake = store(aci_judge_calls=empty_calls, aci_judgements=[])
        give(fake)
        [row] = fake.tables["aci_depths_out_of_ten"]
        self.assertEqual(row["assessment_run_id"], ASSESSMENT_RUN)

    def test_an_unassessed_document_is_refused_before_anything_is_written(self):
        fake = store()
        model = Scripted()
        with self.assertRaises(SystemExit) as refused:
            give(fake, assessment_run=MISSING_RUN, model=model)
        self.assertIn(DOC, str(refused.exception))
        self.assertEqual(fake.writes, [])
        self.assertEqual(model.asked, [])

    def test_a_done_call_in_an_incomplete_cell_on_an_unassessed_document_stops_everything(self):
        calls = [dict(CALLS[0]), dict(CALLS[1], status="pending"), dict(CALLS[2])]
        fake = store(aci_judge_calls=calls, aci_assessment_calls=[])
        model = Scripted()
        with self.assertRaises(SystemExit) as refused:
            give(fake, model=model)
        self.assertIn(DOC, str(refused.exception))
        self.assertEqual(fake.writes, [], "not even call-sol's placeholder is written")
        self.assertEqual(model.asked, [])


class MainTest(unittest.TestCase):
    def main(self, argv, fake):
        opened = []

        def from_env(**kwargs):
            opened.append(kwargs)
            return fake
        with mock.patch.object(depth_pass, "Store", type("S", (), {"from_env": staticmethod(
                    from_env)})), \
                mock.patch.object(depth_pass.index_store, "install_registry", lambda s: None), \
                mock.patch.object(depth_pass.index_store, "judging_registry",
                                  lambda s: REGISTRY), \
                mock.patch.object(depth_pass.h, "passages", passages_for), \
                mock.patch.object(depth_pass.batch_job, "call_openrouter", Scripted()), \
                contextlib.redirect_stdout(io.StringIO()) as printed:
            code = depth_pass.main(argv)
        # A cut between a paid call and the write of its reply is waited out
        # for minutes, not the thirty seconds a store waits by default.
        self.assertEqual([kwargs.get("backoff") for kwargs in opened],
                         [store_module.PATIENT_BACKOFF_SECONDS])
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

    def test_an_unknown_run_id_stops_the_command_before_anything_is_written(self):
        fake = store()
        with self.assertRaises(SystemExit) as refused:
            self.main([f"--runs={RUN},bogus-run",
                      f"--assessment-run={ASSESSMENT_RUN}", "--go"], fake)
        self.assertIn("bogus-run", str(refused.exception))
        self.assertEqual(fake.writes, [])

    def test_a_short_run_id_is_not_a_run_that_exists(self):
        fake = store()
        with self.assertRaises(SystemExit) as refused:
            self.main([f"--runs={RUN[:-1]}", f"--assessment-run={ASSESSMENT_RUN}", "--go"], fake)
        self.assertIn(RUN[:-1], str(refused.exception))
        self.assertEqual(fake.writes, [])

    def test_a_run_id_is_stripped_of_surrounding_whitespace(self):
        fake = store()
        code, printed = self.main([f"--runs= {RUN} ", f"--assessment-run={ASSESSMENT_RUN}"], fake)
        self.assertEqual(code, 0)
        self.assertIn("Priced at about", printed)

    def test_an_assessment_run_that_is_not_a_uuid_is_refused_before_the_store(self):
        for given in ("assess-1", ASSESSMENT_RUN[:-1], ASSESSMENT_RUN.replace("-", ""),
                      "{" + ASSESSMENT_RUN + "}", ""):
            with mock.patch.object(depth_pass, "Store", type("S", (), {"from_env": staticmethod(
                        mock.Mock(side_effect=AssertionError("the store was opened")))})), \
                    self.assertRaises(SystemExit) as refused:
                depth_pass.main([f"--runs={RUN}", f"--assessment-run={given}", "--go"])
            message = str(refused.exception)
            self.assertIn(f"--assessment-run={given}", message)
            self.assertIn("uuid", message)

    def test_an_assessment_run_in_capitals_is_read_as_the_database_writes_it(self):
        fake = store()
        code, printed = self.main(
            [f"--runs={RUN}", f"--assessment-run={ASSESSMENT_RUN.upper()}", "--go"], fake)
        self.assertEqual(code, 0)
        self.assertTrue(all(r["assessment_run_id"] == ASSESSMENT_RUN
                            for r in fake.tables["aci_depths_out_of_ten"]))

    def note(self, argv, environ):
        fake = store()
        with mock.patch.dict(os.environ, environ), \
                contextlib.redirect_stderr(io.StringIO()) as noted:
            self.main(argv, fake)
        return noted.getvalue()

    def test_a_set_anthropic_key_is_noted_as_assess_notes_it(self):
        argv = [f"--runs={RUN}", f"--assessment-run={ASSESSMENT_RUN}", "--go"]
        # The harness notes its own routing on stderr too, once per process, so
        # the note is looked for rather than held to be all there is.
        noted = self.note(argv, {"ANTHROPIC_API_KEY": "sk-stale"})
        self.assertEqual(noted.splitlines()[0], seat_call.ANTHROPIC_KEY_NOTE)
        self.assertIn("ANTHROPIC_API_KEY is set", noted)
        without = {key: value for key, value in os.environ.items()
                   if key != "ANTHROPIC_API_KEY"}
        with mock.patch.dict(os.environ, without, clear=True):
            self.assertNotIn(seat_call.ANTHROPIC_KEY_NOTE, self.note(argv, {}))


if __name__ == "__main__":
    unittest.main()
