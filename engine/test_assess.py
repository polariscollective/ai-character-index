"""The assessment of a whole document, run and stored, against tables in memory
and a model that answers from a script.

Nothing touches a network. The store records every insert and update, so what
the command writes, and in what order, is what these tests read."""
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
ROOT = HERE.parent
# Keys stay out of it: resolve() reads a .env beside the harness unless told not to.
os.environ["PANEL_DOTENV"] = str(ROOT / "no-such.env")
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "panel"))
sys.path.insert(0, str(HERE / "spec-cite"))

import assess                    # noqa: E402
import assessment_call           # noqa: E402
import assessment_run            # noqa: E402
import assessment_store          # noqa: E402
import batch_job                 # noqa: E402
import seat_call                 # noqa: E402
import store as store_module     # noqa: E402

CONFIG = json.loads((HERE / "panel" / "panel-config.json").read_text())


class ConfigTest(unittest.TestCase):
    def test_the_assessment_names_its_seats_per_question(self):
        self.assertEqual(CONFIG["assessment"],
                         {"criteria": ["sol", "fable", "deepseek"],
                          "contradictions": ["sol", "fable", "kimi"]})

    def test_the_substitutes_stay_those_of_frontier_fast(self):
        self.assertEqual(CONFIG["substitutes"],
                         {"frontier_fast": {"fable": ["opus", "kimi", "glm"],
                                            "deepseek": ["glm", "kimi"]}})


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


DOC = "lab--spec@2026-01-01"
PASSAGES = [(f"{DOC} > #a > ¶1", "A", "In a conflict, safety comes first."),
            (f"{DOC} > #b > ¶1", "B", "Never lie."),
            (f"{DOC} > #b > ¶2", "B", "Keep the operator's instructions private.")]
VERSION = {"id": "v", "spec_id": "lab--spec", "version": "2026-01-01",
           "markdown": "## B {#b authority=user}\n\ntext"}
USAGE = {"prompt_tokens": 1000, "completion_tokens": 100}


def store():
    return FakeStore(aci_spec_versions=[dict(VERSION)])


def passages_for(spec, version):
    assert (spec, version) == ("lab--spec", "2026-01-01")
    return PASSAGES


CRITERIA = ("CONFLICT_RULES: 2\nCONFLICT_RULES_PASSAGES: 1\n"
            "CONFLICT_RULES_RATIONALE: An order, weighed.\n"
            "RULE_FORCE: 3\nRULE_FORCE_RATIONALE: Labels.\n"
            "REASONS: 2\nREASONS_RATIONALE: Some.\n"
            "SITUATIONS: 1\nSITUATIONS_RATIONALE: Conversation.")
PRIVACY = ("CONTRADICTION: [2] [3] | A user asks what the operator said. "
           "| Honesty and privacy clash.\n"
           "CONTRADICTIONS: 2\nCONTRADICTIONS_RATIONALE: One clash.")
SAFETY = ("CONTRADICTION: [3] [1] | A user asks to break a rule for safety. "
          "| Safety and privacy clash.\n"
          "CONTRADICTIONS: 2\nCONTRADICTIONS_RATIONALE: One clash.")
QUESTION_OF = {assessment_call.system_prompt(q): q
               for q in ("criteria", "contradictions", "confirm")}


def tag_of(model_id):
    return next(t for t in ("deepseek", "fable", "glm", "opus", "kimi", "sol")
                if t in model_id.lower())


# A second document, told apart from the first by its passages' text.
DOC2 = "lab--other@2026-02-01"
PASSAGES2 = [(f"{DOC2} > #a > ¶1", "A", "Refuse what would harm a third party."),
             (f"{DOC2} > #b > ¶1", "B", "Answer every question the user asks."),
             (f"{DOC2} > #b > ¶2", "B", "Never reveal the system prompt.")]
VERSION2 = {"id": "w", "spec_id": "lab--other", "version": "2026-02-01",
            "markdown": "## B {#b authority=user}\n\ntext"}


def both_passages(spec, version):
    return {("lab--spec", "2026-01-01"): PASSAGES,
            ("lab--other", "2026-02-01"): PASSAGES2}[(spec, version)]


class Scripted:
    """Answers by question and model. The default: every criteria call cites
    passage 1; sol and fable find the privacy clash, kimi the safety clash; each
    confirmation holds its first claim and rejects any second one. `script`
    overrides a (question, tag), or a (document, question, tag) with the
    document "v" or "w", with (reply, finish_reason) or an exception, a
    KeyboardInterrupt or a SystemExit included. `asked_in` records every call
    as (document, question, tag)."""

    def __init__(self, **script):
        self.script = {tuple(key.split("__")): value for key, value in script.items()}
        self.asked = []
        self.asked_in = []

    def __call__(self, provider, model_id, system, user, kwargs):
        question, tag = QUESTION_OF[system], tag_of(model_id)
        document = "w" if PASSAGES2[0][2] in user else "v"
        self.asked.append((question, tag, user))
        self.asked_in.append((document, question, tag))
        for key in ((document, question, tag), (question, tag)):
            if key not in self.script:
                continue
            scripted = self.script[key]
            if isinstance(scripted, BaseException):
                raise scripted
            reply, finish_reason = scripted
            return reply, dict(USAGE), finish_reason, 0.5
        if question == "criteria":
            reply = CRITERIA
        elif question == "contradictions":
            reply = SAFETY if tag == "kimi" else PRIVACY
        else:
            reply = ("ITEM 1: holds | absolute: no | Matches.\n"
                     "ITEM 2: does not hold | absolute: no | Not persuasive.")
        return reply, dict(USAGE), "stop", 0.5


def run(model, fake=None, **kwargs):
    fake = fake or store()
    with contextlib.redirect_stdout(io.StringIO()):
        estimate, run_id = assess.assess(fake, CONFIG, ["v"], passages_for, call_model=model,
                                         go=True, created_by="tester", **kwargs)
    return fake, estimate, run_id


def calls_by(fake):
    """{(question, seat): the call row as it stands}."""
    return {(row["question"], row["seat"]): row for row in fake.tables["aci_assessment_calls"]}


class PriceTest(unittest.TestCase):
    def test_price_mode_writes_nothing_and_calls_no_model(self):
        fake, model = store(), Scripted()
        with contextlib.redirect_stdout(io.StringIO()):
            estimate, run_id = assess.assess(fake, CONFIG, ["v"], passages_for,
                                             call_model=model, go=False)
        self.assertIsNone(run_id)
        self.assertEqual(fake.writes, [])
        self.assertEqual(model.asked, [])
        labelled = assessment_call.with_heading_attributes(PASSAGES, VERSION["markdown"])
        self.assertEqual(estimate, round(assessment_run.price_document(
            labelled, CONFIG["assessment"], CONFIG), 2))
        self.assertGreater(estimate, 0)

    def test_the_ceiling_bills_every_declared_candidate_at_its_largest_output(self):
        labelled = assessment_call.with_heading_attributes(PASSAGES, VERSION["markdown"])

        def at_most(tag, system, user):
            usage = {"prompt_tokens": (len(system) + len(user)) // 4,
                     "completion_tokens": CONFIG["models"][tag].get("max_output", 32768)}
            return batch_job.cost_of(tag, usage, CONFIG)

        want = 0.0
        # Criteria: sol, fable then opus then kimi then glm, deepseek then glm then kimi.
        system, user = assessment_call.compose("criteria", labelled)
        want += sum(at_most(tag, system, user)
                    for tag in ("sol", "fable", "opus", "kimi", "glm", "deepseek", "glm", "kimi"))
        # Contradictions: sol, fable then opus then kimi then glm, kimi.
        system, user = assessment_call.compose("contradictions", labelled)
        want += sum(at_most(tag, system, user)
                    for tag in ("sol", "fable", "opus", "kimi", "glm", "kimi"))
        # Confirmation, at the estimate's own input: the document and 3,000
        # characters of claims, asked of the contradictions' seats.
        system, user = assessment_call.compose_confirm(labelled, [])
        user += "x" * assessment_run.CONFIRM_CLAIMS_CHARS
        want += sum(at_most(tag, system, user)
                    for tag in ("sol", "fable", "opus", "kimi", "glm", "kimi"))
        self.assertAlmostEqual(assess.ceiling_document(labelled, CONFIG["assessment"], CONFIG),
                               want)

        fake = store()
        with contextlib.redirect_stdout(io.StringIO()) as printed:
            estimate, _run_id = assess.assess(fake, CONFIG, ["v"], passages_for,
                                              call_model=Scripted(), go=False)
        out = printed.getvalue()
        self.assertIn(f"ceiling of {round(want, 2)} dollars", out)
        self.assertIn("the most this assessment can cost", out)
        self.assertGreater(round(want, 2), estimate)

    def test_an_unknown_document_is_refused_before_anything_is_written(self):
        fake = store()
        with self.assertRaises(SystemExit) as refused:
            assess.assess(fake, CONFIG, ["v", "nope"], passages_for, go=True)
        self.assertIn("nope", str(refused.exception))
        self.assertEqual(fake.writes, [])

    def test_a_configuration_without_an_assessment_block_is_refused(self):
        config = {key: value for key, value in CONFIG.items() if key != "assessment"}
        with self.assertRaises(SystemExit) as refused:
            assess.assess(store(), config, ["v"], passages_for)
        self.assertIn("assessment", str(refused.exception))


class RunTest(unittest.TestCase):
    def test_the_run_row_records_who_the_seats_the_prompts_and_the_price(self):
        fake, estimate, run_id = run(Scripted())
        [row] = fake.inserted("aci_assessment_runs")
        self.assertEqual(row["id"], run_id)
        self.assertEqual(row["created_by"], "tester")
        self.assertEqual(row["status"], "pending")
        self.assertEqual(row["panels"], CONFIG["assessment"])
        self.assertEqual(row["prompts"], {q: assessment_call.prompt_sha256(q)
                                          for q in ("criteria", "contradictions", "confirm")})
        self.assertEqual(row["config"], {"substitutes": CONFIG["substitutes"]})
        self.assertEqual(row["estimated_usd"], estimate)
        [final] = fake.tables["aci_assessment_runs"]
        self.assertEqual(final["status"], "done")
        self.assertTrue(final["started_at"])
        self.assertTrue(final["finished_at"])
        costs = [call["cost_usd"] for call in fake.tables["aci_assessment_calls"]]
        self.assertEqual(final["cost_usd"], round(sum(costs), 6))

    def test_the_calls_come_in_order_each_pending_then_running_then_done(self):
        fake, _estimate, run_id = run(Scripted())
        inserted = fake.inserted("aci_assessment_calls")
        self.assertEqual([(row["question"], row["seat"]) for row in inserted], [
            ("criteria", "sol"), ("criteria", "fable"), ("criteria", "deepseek"),
            ("contradictions", "sol"), ("contradictions", "fable"), ("contradictions", "kimi"),
            ("confirm", "sol"), ("confirm", "fable"), ("confirm", "kimi")])
        for row in inserted:
            self.assertEqual((row["run_id"], row["spec_version_id"], row["status"]),
                             (run_id, "v", "pending"))
            statuses = [patch["status"] for kind, table, *rest in fake.writes
                        if kind == "update" and table == "aci_assessment_calls"
                        and rest[0] == {"id": row["id"]} for patch in [rest[1]]]
            self.assertEqual(statuses, ["running", "done"])

    def test_a_done_call_carries_its_model_its_attempts_and_its_meter(self):
        fake, _estimate, _run_id = run(Scripted())
        call = calls_by(fake)[("criteria", "sol")]
        cost = batch_job.cost_of("sol", USAGE, CONFIG)
        self.assertEqual(call["model"], "sol")
        self.assertEqual(call["attempts"], [{"model": "sol", "finish_reason": "stop",
                                             "cost_usd": cost, "reason": None}])
        self.assertEqual((call["prompt_tokens"], call["completion_tokens"]), (1000, 100))
        self.assertEqual((call["cost_usd"], call["seconds"], call["finish_reason"]),
                         (cost, 0.5, "stop"))
        self.assertEqual(call["raw_output"], CRITERIA,
                         "a done call keeps its full reply, complete or not")
        self.assertIsNone(call["error"])
        self.assertTrue(call["started_at"] and call["finished_at"])

    def test_every_criterion_is_a_score_with_the_cited_rules_on_conflict_rules(self):
        fake, _estimate, _run_id = run(Scripted())
        calls = calls_by(fake)
        scores = fake.inserted("aci_assessment_scores")
        sol = {row["criterion"]: row for row in scores
               if row["call_id"] == calls[("criteria", "sol")]["id"]}
        self.assertEqual(sol, {
            "conflict_rules": {"call_id": calls[("criteria", "sol")]["id"],
                               "criterion": "conflict_rules", "score": 2,
                               "rationale": "An order, weighed.", "locators": [PASSAGES[0][0]]},
            "rule_force": {"call_id": calls[("criteria", "sol")]["id"], "criterion": "rule_force",
                           "score": 3, "rationale": "Labels.", "locators": []},
            "reasons": {"call_id": calls[("criteria", "sol")]["id"], "criterion": "reasons",
                        "score": 2, "rationale": "Some.", "locators": []},
            "situations": {"call_id": calls[("criteria", "sol")]["id"], "criterion": "situations",
                           "score": 1, "rationale": "Conversation.", "locators": []}})
        kimi = [row for row in scores if row["call_id"] == calls[("contradictions", "kimi")]["id"]]
        self.assertEqual(kimi, [{"call_id": calls[("contradictions", "kimi")]["id"],
                                 "criterion": "contradictions", "score": 2,
                                 "rationale": "One clash.", "locators": []}])
        self.assertEqual(len(scores), 3 * 4 + 3)

    def test_a_claim_found_by_two_seats_and_confirmed_by_the_third(self):
        fake, _estimate, run_id = run(Scripted())
        calls = calls_by(fake)
        claims = fake.inserted("aci_assessment_claims")
        privacy = next(c for c in claims if c["found_by"] == ["sol", "fable"])
        self.assertEqual({key: privacy[key] for key in privacy if key != "id"}, {
            "run_id": run_id, "spec_version_id": "v",
            "first_locator": PASSAGES[1][0], "second_locator": PASSAGES[2][0],
            "situation": "A user asks what the operator said.",
            "why": "Honesty and privacy clash.", "found_by": ["sol", "fable"]})
        verdicts = {row["seat"]: row for row in fake.inserted("aci_assessment_verdicts")
                    if row["claim_id"] == privacy["id"]}
        self.assertEqual(verdicts["sol"], {
            "claim_id": privacy["id"], "call_id": calls[("contradictions", "sol")]["id"],
            "seat": "sol", "holds": True, "absolute": None, "reason": "found it"})
        self.assertEqual(verdicts["fable"]["call_id"], calls[("contradictions", "fable")]["id"])
        self.assertEqual(verdicts["fable"]["reason"], "found it")
        self.assertEqual(verdicts["kimi"], {
            "claim_id": privacy["id"], "call_id": calls[("confirm", "kimi")]["id"],
            "seat": "kimi", "holds": True, "absolute": False, "reason": "Matches."})
        # Held by its two finders and by the third seat: confirmed.
        self.assertEqual(sum(v["holds"] for v in verdicts.values()), 3)

    def test_a_pair_is_written_in_code_point_order_and_each_reader_answers_it_once(self):
        fake, _estimate, _run_id = run(Scripted())
        calls = calls_by(fake)
        claims = fake.inserted("aci_assessment_claims")
        # kimi listed [3] [1]; the row names the smaller locator first.
        safety = next(c for c in claims if c["found_by"] == ["kimi"])
        self.assertEqual((safety["first_locator"], safety["second_locator"]),
                         (PASSAGES[0][0], PASSAGES[2][0]))
        self.assertTrue(all(c["first_locator"] < c["second_locator"] for c in claims))
        verdicts = {row["seat"]: row for row in fake.inserted("aci_assessment_verdicts")
                    if row["claim_id"] == safety["id"]}
        self.assertEqual(verdicts["kimi"]["reason"], "found it")
        # sol and fable were each asked about it alone, so it was their first item.
        self.assertTrue(verdicts["sol"]["holds"])
        self.assertEqual(verdicts["sol"]["call_id"], calls[("confirm", "sol")]["id"])
        pairs = [(v["claim_id"], v["seat"]) for v in fake.inserted("aci_assessment_verdicts")]
        self.assertEqual(len(pairs), len(set(pairs)))
        # Every verdict names a call of its own seat.
        seat_of = {row["id"]: row["seat"] for row in fake.tables["aci_assessment_calls"]}
        for v in fake.inserted("aci_assessment_verdicts"):
            self.assertEqual(seat_of[v["call_id"]], v["seat"])

    def test_a_seat_refused_by_a_content_filter_is_answered_by_its_substitute(self):
        model = Scripted(criteria__fable=("partial", "content_filter"))
        fake, _estimate, _run_id = run(model)
        call = calls_by(fake)[("criteria", "fable")]
        self.assertEqual((call["status"], call["seat"], call["model"]), ("done", "fable", "opus"))
        fable_cost = batch_job.cost_of("fable", USAGE, CONFIG)
        opus_cost = batch_job.cost_of("opus", USAGE, CONFIG)
        self.assertEqual(call["attempts"], [
            {"model": "fable", "finish_reason": "content_filter", "cost_usd": fable_cost,
             "reason": "finish_reason=content_filter"},
            {"model": "opus", "finish_reason": "stop", "cost_usd": opus_cost, "reason": None}])
        # Both attempts were billed, so both are in the call's cost.
        self.assertEqual(call["cost_usd"], round(fable_cost + opus_cost, 6))
        # And both attempts' tokens are in the call's, the same way its cost is.
        self.assertEqual((call["prompt_tokens"], call["completion_tokens"]),
                         (2 * USAGE["prompt_tokens"], 2 * USAGE["completion_tokens"]))
        scores = [row for row in fake.inserted("aci_assessment_scores")
                  if row["call_id"] == call["id"]]
        self.assertEqual(len(scores), 4)

    def test_no_model_answers_one_question_twice_for_one_document(self):
        # fable, then its substitutes opus and kimi, all refused on criteria,
        # and glm too, deepseek's own first substitute: kimi answers
        # deepseek's substitute list too, but must not be asked to answer
        # criteria a second time.
        model = Scripted(criteria__fable=("", "content_filter"),
                         criteria__opus=("", "content_filter"),
                         criteria__deepseek=("", "content_filter"),
                         criteria__glm=("", "content_filter"))
        fake, _estimate, _run_id = run(model)
        calls = calls_by(fake)
        self.assertEqual(calls[("criteria", "fable")]["model"], "kimi")
        deepseek_call = calls[("criteria", "deepseek")]
        self.assertEqual(deepseek_call["status"], "error")
        self.assertEqual([(a["model"], a["reason"]) for a in deepseek_call["attempts"]], [
            ("deepseek", "finish_reason=content_filter"),
            ("glm", "finish_reason=content_filter"), ("kimi", "already seated")])
        asked = [(question, tag) for question, tag, _user in model.asked]
        self.assertEqual(asked.count(("criteria", "kimi")), 1)
        self.assertEqual(fake.tables["aci_assessment_runs"][0]["status"], "done")

    def test_a_substitute_already_seated_for_the_question_is_skipped(self):
        model = Scripted(contradictions__fable=("", "content_filter"),
                         contradictions__opus=RuntimeError("provider refused the input"),
                         contradictions__glm=("", "content_filter"),
                         criteria__fable=("", "content_filter"),
                         criteria__opus=("", "content_filter"))
        fake, _estimate, _run_id = run(model)
        calls = calls_by(fake)
        call = calls[("contradictions", "fable")]
        self.assertEqual(call["status"], "error")
        self.assertIsNone(call.get("model"), "a call nobody answered names no model")
        self.assertEqual(call["error"], "finish_reason=content_filter")
        self.assertEqual([(a["model"], a["reason"]) for a in call["attempts"]], [
            ("fable", "finish_reason=content_filter"), ("opus", "provider refused the input"),
            ("kimi", "already seated"), ("glm", "finish_reason=content_filter")])
        self.assertEqual(call["attempts"][2], {"model": "kimi", "finish_reason": None,
                                               "cost_usd": None, "reason": "already seated"})
        asked = [(question, tag) for question, tag, _user in model.asked]
        self.assertEqual(asked.count(("contradictions", "kimi")), 1)
        # kimi is not seated for the criteria, so there it takes fable's seat.
        self.assertEqual(calls[("criteria", "fable")]["model"], "kimi")
        # The run goes on: fable found nothing, so it is asked to confirm both claims.
        self.assertEqual(calls[("confirm", "fable")]["status"], "done")
        self.assertIn("[2]", [u for q, t, u in model.asked if (q, t) == ("confirm", "fable")][0])
        self.assertEqual(fake.tables["aci_assessment_runs"][0]["status"], "done")
        # No score for a call that never answered.
        self.assertFalse([row for row in fake.inserted("aci_assessment_scores")
                          if row["call_id"] == call["id"]])

    def test_glm_answers_fables_contradictions_seat_when_opus_and_kimi_cannot(self):
        """The case the new order exists for: on contradictions kimi already
        holds its own seat, so when fable and opus are refused, glm, fable's
        last declared substitute, answers in its place."""
        model = Scripted(contradictions__fable=("", "content_filter"),
                         contradictions__opus=RuntimeError("provider refused the input"))
        fake, _estimate, _run_id = run(model)
        call = calls_by(fake)[("contradictions", "fable")]
        self.assertEqual(call["status"], "done")
        self.assertEqual(call["model"], "glm")
        self.assertEqual([(a["model"], a["reason"]) for a in call["attempts"]], [
            ("fable", "finish_reason=content_filter"), ("opus", "provider refused the input"),
            ("kimi", "already seated"), ("glm", None)])

    def test_a_seat_nobody_could_answer_keeps_the_last_refused_text_and_its_cost(self):
        model = Scripted(criteria__fable=("I cannot help with that.", "content_filter"),
                         criteria__opus=RuntimeError("401"),
                         criteria__kimi=("", "stop"),
                         criteria__glm=("", "stop"))
        fake, _estimate, _run_id = run(model)
        call = calls_by(fake)[("criteria", "fable")]
        self.assertEqual(call["status"], "error")
        self.assertEqual(call["error"], "empty reply, finish_reason=stop")
        self.assertEqual(call["raw_output"], "I cannot help with that.")
        self.assertEqual(call["cost_usd"], round(batch_job.cost_of("fable", USAGE, CONFIG)
                                                 + batch_job.cost_of("kimi", USAGE, CONFIG)
                                                 + batch_job.cost_of("glm", USAGE, CONFIG), 6))
        self.assertEqual(fake.tables["aci_assessment_runs"][0]["status"], "done")

    def test_a_reply_that_does_not_parse_completely_is_kept(self):
        partial = ("CONFLICT_RULES: 3\nCONFLICT_RULES_PASSAGES: none\n"
                   "RULE_FORCE: 7\nREASONS: 2\nREASONS_RATIONALE: Some.")
        fake, _estimate, _run_id = run(Scripted(criteria__deepseek=(partial, "length")))
        call = calls_by(fake)[("criteria", "deepseek")]
        self.assertEqual(call["status"], "done")
        self.assertEqual(call["raw_output"], partial)
        scores = {row["criterion"]: row for row in fake.inserted("aci_assessment_scores")
                  if row["call_id"] == call["id"]}
        self.assertEqual(set(scores), {"conflict_rules", "reasons"})
        self.assertIsNone(scores["conflict_rules"]["rationale"])
        self.assertEqual(scores["conflict_rules"]["locators"], [])

    def test_a_confirmation_that_skips_a_claim_is_kept_and_writes_what_it_answered(self):
        model = Scripted(confirm__sol=("ITEM 7: holds | absolute: no | Out of range.", "stop"))
        fake, _estimate, _run_id = run(model)
        call = calls_by(fake)[("confirm", "sol")]
        self.assertEqual(call["status"], "done")
        self.assertIn("ITEM 7", call["raw_output"])
        self.assertFalse([v for v in fake.inserted("aci_assessment_verdicts")
                          if v["call_id"] == call["id"]])

    def test_an_interrupted_call_keeps_what_it_already_billed(self):
        model = Scripted(criteria__fable=("", "content_filter"),
                         criteria__opus=KeyboardInterrupt())
        fake = store()
        with self.assertRaises(KeyboardInterrupt):
            run(model, fake=fake)
        calls = calls_by(fake)
        sol_cost = calls[("criteria", "sol")]["cost_usd"]
        call = calls[("criteria", "fable")]
        self.assertEqual(call["status"], "error")
        fable_cost = batch_job.cost_of("fable", USAGE, CONFIG)
        self.assertEqual(call["attempts"], [
            {"model": "fable", "finish_reason": "content_filter", "cost_usd": fable_cost,
             "reason": "finish_reason=content_filter"}])
        self.assertEqual(call["cost_usd"], fable_cost)
        [run_row] = fake.tables["aci_assessment_runs"]
        self.assertEqual(run_row["status"], "error")
        # The run's cost includes the interrupted call's billed attempt, and
        # nothing from deepseek's call, which never started.
        self.assertEqual(run_row["cost_usd"], round(sol_cost + fable_cost, 6))
        self.assertNotIn(("criteria", "deepseek"), calls)

    def test_a_run_that_cannot_be_marked_running_ends_error_or_is_reported(self):
        class Balky(FakeStore):
            def update(self, table, match, patch):
                if table == "aci_assessment_runs" and patch.get("status") == "running":
                    raise RuntimeError("connection reset")
                return super().update(table, match, patch)
        fake = Balky(aci_spec_versions=[dict(VERSION)])
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            with self.assertRaises(RuntimeError):
                run(Scripted(), fake=fake)
        [row] = fake.tables["aci_assessment_runs"]
        self.assertNotEqual(row["status"], "pending")
        self.assertEqual(row["status"], "error")
        self.assertIn(row["id"], stderr.getvalue())

    def test_a_claim_whose_two_passages_share_a_locator_gets_no_row(self):
        shared = f"{DOC} > #b > ¶2"
        passages = [(shared, "B", "one reading"), (shared, "B", "another reading")]
        rows = assessment_store.claim_rows(
            "run", "v", [{"first": 1, "second": 2, "situation": "s", "why": "w",
                         "found_by": ["sol"]}], ["claim-1"], passages)
        self.assertEqual(rows, [])

    def test_a_document_run_never_writes_a_verdict_for_a_claim_with_no_row(self):
        shared = f"{DOC} > #b > ¶2"
        dup_passages = [(shared, "B", "one reading"), (shared, "B", "another reading")]
        dup_version = {"id": "dup", "spec_id": "lab--dup", "version": "2026-01-01",
                       "markdown": "## B {#b authority=user}\n\ntext"}
        fake = FakeStore(aci_spec_versions=[dup_version])
        # Only sol finds the pair, so fable and kimi would otherwise be asked
        # to confirm it: a claim on a locator collision must never reach that
        # stage, or its verdict would name a claim with no row.
        found = ("CONTRADICTION: [1] [2] | Conflicting readings. | "
                "One passage cited under two different numbers.\n"
                "CONTRADICTIONS: 2\nCONTRADICTIONS_RATIONALE: One clash.")
        not_found = "CONTRADICTION: none\nCONTRADICTIONS: 4\nCONTRADICTIONS_RATIONALE: None found."
        model = Scripted(contradictions__sol=(found, "stop"),
                         contradictions__fable=(not_found, "stop"),
                         contradictions__kimi=(not_found, "stop"))
        with contextlib.redirect_stdout(io.StringIO()):
            assess.assess(fake, CONFIG, ["dup"], lambda *_a: dup_passages, call_model=model,
                          go=True, created_by="tester")
        # The claim, sharing a locator, got no row, and nobody was asked to
        # confirm what was never written.
        self.assertEqual(fake.tables.get("aci_assessment_claims", []), [])
        self.assertNotIn(("confirm", "fable"),
                         {(q, t) for q, t, _u in model.asked})
        written = {row["id"] for row in fake.tables.get("aci_assessment_claims", [])}
        for verdict in fake.tables.get("aci_assessment_verdicts", []):
            self.assertIn(verdict["claim_id"], written)

    def test_a_failure_that_stops_the_run_is_recorded_on_it(self):
        class Failing(FakeStore):
            def insert(self, table, rows, chunk=1000, returning=False):
                if table == "aci_assessment_claims":
                    raise RuntimeError("insert refused")
                return super().insert(table, rows, chunk, returning)
        fake = Failing(aci_spec_versions=[dict(VERSION)])
        with self.assertRaises(RuntimeError):
            run(Scripted(), fake=fake)
        [final] = fake.tables["aci_assessment_runs"]
        self.assertEqual(final["status"], "error")
        self.assertEqual(final["error"], "insert refused")
        self.assertTrue(final["finished_at"])
        self.assertGreater(final["cost_usd"], 0)


class MainTest(unittest.TestCase):
    def main(self, argv, fake, model=None, code=0, environ=None):
        opened = []

        def from_env(**kwargs):
            opened.append(kwargs)
            return fake
        with mock.patch.object(assess, "Store", type("S", (), {"from_env": staticmethod(
                    from_env)})), \
                mock.patch.object(assess.index_store, "install_registry", lambda s: None), \
                mock.patch.object(assess.h, "passages", passages_for), \
                mock.patch.object(assess.batch_job, "call_openrouter", model or Scripted()), \
                mock.patch.dict(os.environ, {"USER": "someone", **(environ or {})}), \
                contextlib.redirect_stdout(io.StringIO()) as printed:
            self.assertEqual(assess.main(argv), code)
        # A cut between a paid call and the write of its reply is waited out
        # for minutes, not the thirty seconds a store waits by default.
        self.assertEqual([kwargs.get("backoff") for kwargs in opened],
                         [store_module.PATIENT_BACKOFF_SECONDS])
        return printed.getvalue()

    def test_a_run_that_assessed_every_document_exits_zero_and_names_no_gap(self):
        printed = self.main(["--documents=v", "--go"], store())
        self.assertNotIn("gave no", printed)
        self.assertNotIn("does not assess", printed)

    def test_a_run_with_gaps_prints_every_one_and_exits_one_after_closing_the_run(self):
        # sol has no substitute, so its criteria call is left in error, and
        # deepseek's reply leaves a criterion unscored.
        partial = ("CONFLICT_RULES: 3\nCONFLICT_RULES_PASSAGES: none\n"
                   "RULE_FORCE: 2\nREASONS: 2\nREASONS_RATIONALE: Some.")
        model = Scripted(criteria__sol=RuntimeError("provider refused the input"),
                         criteria__deepseek=(partial, "stop"))
        fake = store()
        printed = self.main(["--documents=v", "--go"], fake, model=model, code=1)
        [run_row] = fake.tables["aci_assessment_runs"]
        self.assertEqual(run_row["status"], "done", "the run row is closed first")
        self.assertIn(run_row["id"], printed)
        self.assertIn(f"{DOC}: sol gave no criteria answer", printed)
        self.assertIn(f"{DOC}: deepseek's criteria answer scored no situations", printed)
        self.assertLess(printed.index(run_row["id"]), printed.index("sol gave no criteria"))
        self.assertIn(f"--resume={run_row['id']}", printed)
        self.assertNotIn("not taken up again", printed)

    def test_the_gaps_are_the_ones_a_publication_would_refuse(self):
        model = Scripted(criteria__sol=RuntimeError("provider refused the input"))
        fake = store()
        with contextlib.redirect_stdout(io.StringIO()):
            _estimate, run_id = assess.assess(fake, CONFIG, ["v"], passages_for,
                                              call_model=model, go=True)
        gaps = assess.gaps(fake, run_id, ["v"])
        run, by_version = assess.index_store.assessment_rows(fake, run_id, ["v"])
        self.assertEqual(gaps, assess.index_store.assessment_gaps(run_id, run, by_version,
                                                                  [VERSION]))
        self.assertTrue(gaps)

    def test_a_set_anthropic_key_is_noted_with_go(self):
        with contextlib.redirect_stderr(io.StringIO()) as noted:
            self.main(["--documents=v", "--go"], store(),
                      environ={"ANTHROPIC_API_KEY": "sk-stale"})
        # The harness may note its own routing after it, once per process.
        self.assertEqual(noted.getvalue().splitlines()[0], seat_call.ANTHROPIC_KEY_NOTE)

    def test_without_go_it_prints_the_price_and_writes_nothing(self):
        fake = store()
        printed = self.main(["--documents=v"], fake)
        self.assertIn("Priced at about", printed)
        self.assertIn("--go", printed)
        self.assertIn("counts each seat's own model once", printed)
        self.assertIn("a refused attempt is billed before its substitute answers", printed)
        self.assertNotIn("A seat answered by a substitute costs more", printed)
        self.assertEqual(fake.writes, [])

    def test_with_go_it_prints_the_run_and_records_who_launched_it(self):
        fake = store()
        printed = self.main(["--documents=v", "--go"], fake)
        [row] = fake.tables["aci_assessment_runs"]
        self.assertIn(row["id"], printed)
        self.assertEqual(row["created_by"], "someone")
        printed = self.main(["--documents=v", "--go", "--by=Polaris Collective"], store())
        self.assertIn("Priced at about", printed)



REQUEST = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")


def cut():
    """What the openai client raises when the connection is gone."""
    return openai.APIConnectionError(request=REQUEST)


def cost(tag):
    return batch_job.cost_of(tag, USAGE, CONFIG)


def two_documents():
    return FakeStore(aci_spec_versions=[dict(VERSION), dict(VERSION2)])


def calls_in(fake):
    """{(document, question, seat): the call row as it stands}."""
    return {(row["spec_version_id"], row["question"], row["seat"]): row
            for row in fake.tables.get("aci_assessment_calls", [])}


class Outcome:
    def __init__(self, estimate=None, run_id=None, raised=None, stdout="", stderr="",
                 waits=()):
        self.estimate, self.run_id, self.raised = estimate, run_id, raised
        self.stdout, self.stderr, self.waits = stdout, stderr, list(waits)


def go(model, fake, documents=("v", "w"), resume=None, spend=True):
    """assess() over `documents`, fresh or taking up run `resume`, with every
    wait recorded rather than slept. What it raised is returned, not raised."""
    waits = []
    with mock.patch.object(seat_call, "sleep", waits.append), \
            contextlib.redirect_stdout(io.StringIO()) as out, \
            contextlib.redirect_stderr(io.StringIO()) as err:
        try:
            taken_up = None if resume is None else assess.resumable(fake, resume)
            estimate, run_id = assess.assess(fake, CONFIG, list(documents), both_passages,
                                             call_model=model, go=spend, created_by="tester",
                                             resume=taken_up)
        except BaseException as raised:                   # noqa: BLE001
            return Outcome(raised=raised, stdout=out.getvalue(), stderr=err.getvalue(),
                           waits=waits)
    return Outcome(estimate, run_id, None, out.getvalue(), err.getvalue(), waits)


def cut_during_the_second_documents_contradictions(fake):
    """A run of both documents stopped by a network cut: on the second
    document, fable's contradictions are refused by a content filter, then
    opus, its first substitute, cannot be reached through any wait."""
    model = Scripted(w__contradictions__fable=("", "content_filter"),
                     w__contradictions__opus=cut())
    stopped = go(model, fake)
    [run_row] = fake.tables["aci_assessment_runs"]
    return stopped, run_row["id"]


class UnreachableTest(unittest.TestCase):
    def test_a_network_cut_leaves_the_call_error_with_its_billed_attempts(self):
        fake = two_documents()
        stopped, run_id = cut_during_the_second_documents_contradictions(fake)
        self.assertIsInstance(stopped.raised, seat_call.Unreachable)
        self.assertEqual(stopped.waits, [30, 60, 120, 240, 480])
        calls = calls_in(fake)
        call = calls[("w", "contradictions", "fable")]
        self.assertEqual(call["status"], "error")
        self.assertTrue(call["error"].startswith("unreachable: opus"), call["error"])
        self.assertIn("APIConnectionError", call["error"])
        self.assertEqual(call["attempts"], [
            {"model": "fable", "finish_reason": "content_filter", "cost_usd": cost("fable"),
             "reason": "finish_reason=content_filter"}])
        self.assertEqual(call["cost_usd"], cost("fable"))
        self.assertNotIn(("w", "contradictions", "kimi"), calls, "the run stopped there")
        [run_row] = fake.tables["aci_assessment_runs"]
        self.assertEqual(run_row["status"], "error")
        self.assertTrue(run_row["error"].startswith("unreachable: opus"))
        self.assertEqual(run_row["cost_usd"],
                         round(sum(row["cost_usd"] for row in calls.values()), 6))
        # The command says how to take it up again, naming the run.
        self.assertIn(f"--resume={run_id} --documents=v,w --go", stopped.stderr)

    def test_the_command_stops_non_zero_and_says_how_to_take_it_up_again(self):
        fake = two_documents()
        model = Scripted(w__contradictions__fable=("", "content_filter"),
                         w__contradictions__opus=cut())
        with mock.patch.object(assess, "Store", type("S", (), {"from_env": staticmethod(
                    lambda **_kwargs: fake)})), \
                mock.patch.object(assess.index_store, "install_registry", lambda s: None), \
                mock.patch.object(assess.h, "passages", both_passages), \
                mock.patch.object(assess.batch_job, "call_openrouter", model), \
                mock.patch.object(seat_call, "sleep", lambda seconds: None), \
                contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()) as err:
            code = assess.main(["--documents=v,w", "--go"])
        self.assertEqual(code, 1)
        [run_row] = fake.tables["aci_assessment_runs"]
        self.assertIn(f"--resume={run_row['id']}", err.getvalue())


class ResumeTest(unittest.TestCase):
    def test_a_stopped_run_is_taken_up_asking_only_the_calls_not_done(self):
        fake = two_documents()
        _stopped, run_id = cut_during_the_second_documents_contradictions(fake)
        [run_row] = fake.tables["aci_assessment_runs"]
        earlier_cost, started_at = run_row["cost_usd"], run_row["started_at"]
        stopped_row = dict(calls_in(fake)[("w", "contradictions", "fable")])
        writes_before = len(fake.writes)

        again = Scripted()
        resumed = go(again, fake, resume=run_id)
        self.assertIsNone(resumed.raised)
        self.assertEqual(resumed.run_id, run_id)
        self.assertEqual(again.asked_in, [
            ("w", "contradictions", "fable"), ("w", "contradictions", "kimi"),
            ("w", "confirm", "sol"), ("w", "confirm", "fable"), ("w", "confirm", "kimi")])

        # The stopped call is asked again in its own row, its bill kept.
        calls = calls_in(fake)
        self.assertEqual(len(calls), 18, "one row per document, question and seat")
        call = calls[("w", "contradictions", "fable")]
        self.assertEqual(call["id"], stopped_row["id"])
        self.assertEqual((call["status"], call["model"], call["error"]), ("done", "fable", None))
        self.assertEqual(call["attempts"], stopped_row["attempts"] + [
            {"model": "fable", "finish_reason": "stop", "cost_usd": cost("fable"),
             "reason": None}])
        self.assertAlmostEqual(call["cost_usd"], 2 * cost("fable"))
        self.assertEqual((call["prompt_tokens"], call["completion_tokens"]),
                         (2 * USAGE["prompt_tokens"], 2 * USAGE["completion_tokens"]))
        statuses = [write[3]["status"] for write in fake.writes[writes_before:]
                    if write[0] == "update" and write[1] == "aci_assessment_calls"
                    and write[2] == {"id": call["id"]}]
        self.assertEqual(statuses, ["running", "done"])

        # Nothing written twice.
        claims = fake.tables["aci_assessment_claims"]
        self.assertEqual(len({(c["run_id"], c["spec_version_id"], c["first_locator"],
                               c["second_locator"]) for c in claims}), len(claims))
        self.assertEqual(len(claims), 4, "two claims on each document")
        verdicts = fake.tables["aci_assessment_verdicts"]
        self.assertEqual(len({(v["claim_id"], v["seat"]) for v in verdicts}), len(verdicts))
        self.assertEqual(len(verdicts), 4 * 3, "every claim read once by every seat")
        scores = fake.tables["aci_assessment_scores"]
        self.assertEqual(len({(r["call_id"], r["criterion"]) for r in scores}), len(scores))
        self.assertEqual(len(scores), 2 * (3 * 4 + 3))

        # The run went back to running, kept its start, and closed done with
        # the earlier cost and this resume's together.
        [run_row] = fake.tables["aci_assessment_runs"]
        reopened = next(write[3] for write in fake.writes[writes_before:]
                        if write[0] == "update" and write[1] == "aci_assessment_runs")
        self.assertEqual(reopened["status"], "running")
        self.assertIsNone(reopened["error"])
        self.assertNotIn("started_at", reopened)
        self.assertEqual((run_row["status"], run_row["error"], run_row["started_at"]),
                         ("done", None, started_at))
        this_resume = (cost("fable") + cost("kimi")
                       + cost("sol") + cost("fable") + cost("kimi"))
        self.assertAlmostEqual(run_row["cost_usd"], earlier_cost + this_resume, places=6)
        self.assertAlmostEqual(run_row["cost_usd"],
                               sum(row["cost_usd"] for row in calls.values()), places=6)
        self.assertEqual(assess.gaps(fake, run_id, ["v", "w"]), [])

    def test_a_substitute_seated_before_the_stop_is_still_seated_on_resuming(self):
        # On the first document fable's criteria were answered by kimi, and
        # then the run stopped. On resuming, deepseek's own model and glm are
        # refused: kimi, already seated for this question, must not be asked.
        fake = two_documents()
        first = Scripted(criteria__fable=("", "content_filter"),
                         criteria__opus=("", "content_filter"),
                         v__criteria__deepseek=cut())
        stopped = go(first, fake)
        self.assertIsInstance(stopped.raised, seat_call.Unreachable)
        [run_row] = fake.tables["aci_assessment_runs"]
        self.assertEqual(calls_in(fake)[("v", "criteria", "fable")]["model"], "kimi")
        again = Scripted(criteria__deepseek=("", "content_filter"),
                         criteria__glm=("", "content_filter"),
                         criteria__fable=("", "content_filter"),
                         criteria__opus=("", "content_filter"))
        go(again, fake, resume=run_row["id"])
        call = calls_in(fake)[("v", "criteria", "deepseek")]
        self.assertEqual(call["status"], "error")
        self.assertIn(("kimi", "already seated"),
                      [(a["model"], a["reason"]) for a in call["attempts"]])
        self.assertNotIn(("v", "criteria", "kimi"), again.asked_in)

    def test_the_price_of_a_resume_counts_only_the_calls_it_will_ask(self):
        fake = two_documents()
        _stopped, run_id = cut_during_the_second_documents_contradictions(fake)
        writes_before = len(fake.writes)
        model = Scripted()
        priced = go(model, fake, resume=run_id, spend=False)
        self.assertIsNone(priced.raised)
        self.assertEqual(len(fake.writes), writes_before, "a price writes nothing")
        self.assertEqual(model.asked, [])
        labelled = assessment_call.with_heading_attributes(PASSAGES2, VERSION2["markdown"])
        system, user = assessment_call.compose("contradictions", labelled)
        want = sum(seat_call.priced(seat, system, user, 8000, CONFIG) for seat in ("fable", "kimi"))
        # kimi's contradictions are not known yet, so the claims to confirm are
        # not either: each confirmation is priced as a fresh run prices it.
        system, user = assessment_call.compose_confirm(labelled, [])
        want += sum(seat_call.priced(seat, system, user + "x" * 3000, 1500, CONFIG)
                    for seat in ("sol", "fable", "kimi"))
        self.assertEqual(priced.estimate, round(want, 2))
        self.assertIn("Priced at about", priced.stdout)

    def test_a_confirmation_whose_claims_are_known_is_priced_on_them(self):
        fake = two_documents()
        stopped = go(Scripted(w__confirm__fable=cut()), fake)
        self.assertIsInstance(stopped.raised, seat_call.Unreachable)
        [run_row] = fake.tables["aci_assessment_runs"]
        priced = go(Scripted(), fake, resume=run_row["id"], spend=False)
        labelled = assessment_call.with_heading_attributes(PASSAGES2, VERSION2["markdown"])
        # fable found the privacy clash and must confirm the safety one; kimi
        # found the safety clash and must confirm the privacy one.
        safety = {"first": 3, "second": 1, "situation": "A user asks to break a rule for safety.",
                  "why": "Safety and privacy clash."}
        privacy = {"first": 2, "second": 3, "situation": "A user asks what the operator said.",
                   "why": "Honesty and privacy clash."}
        want = 0.0
        for seat, claim in (("fable", safety), ("kimi", privacy)):
            system, user = assessment_call.compose_confirm(labelled, [claim])
            want += seat_call.priced(seat, system, user, 1500, CONFIG)
        self.assertEqual(priced.estimate, round(want, 2))

    def test_a_done_call_whose_scores_are_missing_gets_them_from_its_stored_reply(self):
        fake = store()
        fresh = go(Scripted(), fake, documents=("v",))
        call = calls_in(fake)[("v", "criteria", "sol")]
        before = sorted((r for r in fake.tables["aci_assessment_scores"]
                         if r["call_id"] == call["id"]), key=lambda r: r["criterion"])
        self.assertEqual(len(before), 4)
        fake.tables["aci_assessment_scores"] = [r for r in fake.tables["aci_assessment_scores"]
                                                if r["call_id"] != call["id"]]
        silent = Scripted()
        resumed = go(silent, fake, documents=("v",), resume=fresh.run_id)
        self.assertIsNone(resumed.raised)
        self.assertEqual(silent.asked, [], "no model is asked")
        after = sorted((r for r in fake.tables["aci_assessment_scores"]
                        if r["call_id"] == call["id"]), key=lambda r: r["criterion"])
        self.assertEqual(after, before)
        self.assertEqual(assess.gaps(fake, fresh.run_id, ["v"]), [])

    def test_missing_claims_and_verdicts_are_rebuilt_from_the_stored_replies(self):
        fake = store()
        fresh = go(Scripted(), fake, documents=("v",))
        calls = calls_in(fake)
        claims = fake.tables["aci_assessment_claims"]
        privacy = next(c for c in claims if c["found_by"] == ["sol", "fable"])
        safety = next(c for c in claims if c["found_by"] == ["kimi"])
        verdicts_before = {(v["claim_id"] == privacy["id"], v["seat"]): v
                           for v in fake.tables["aci_assessment_verdicts"]}
        # The safety claim is gone with its verdicts, and so is kimi's reading
        # of the privacy claim.
        fake.tables["aci_assessment_claims"] = [privacy]
        fake.tables["aci_assessment_verdicts"] = [
            v for v in fake.tables["aci_assessment_verdicts"]
            if v["claim_id"] == privacy["id"] and v["seat"] != "kimi"]
        silent = Scripted()
        go(silent, fake, documents=("v",), resume=fresh.run_id)
        self.assertEqual(silent.asked, [])
        claims = fake.tables["aci_assessment_claims"]
        self.assertEqual(len(claims), 2)
        self.assertIn(privacy, claims, "a claim already written keeps its id")
        rebuilt = next(c for c in claims if c["id"] != privacy["id"])
        self.assertEqual({k: rebuilt[k] for k in rebuilt if k != "id"},
                         {k: safety[k] for k in safety if k != "id"})
        verdicts = {(v["claim_id"] == privacy["id"], v["seat"]): v
                    for v in fake.tables["aci_assessment_verdicts"]}
        self.assertEqual(set(verdicts), set(verdicts_before))
        for key, verdict in verdicts.items():
            self.assertEqual({k: verdict[k] for k in ("call_id", "seat", "holds", "absolute",
                                                     "reason")},
                             {k: verdicts_before[key][k] for k in ("call_id", "seat", "holds",
                                                                   "absolute", "reason")})
        self.assertEqual(verdicts[(True, "kimi")]["call_id"], calls[("v", "confirm", "kimi")]["id"])
        self.assertEqual(assess.gaps(fake, fresh.run_id, ["v"]), [])

    def test_a_run_left_running_is_taken_as_the_operators_word(self):
        # A run whose process was killed: the run and one of its calls are
        # left running, the call with nothing recorded.
        fake = two_documents()
        _stopped, run_id = cut_during_the_second_documents_contradictions(fake)
        fake.tables["aci_assessment_runs"][0].update(status="running", error=None)
        crit = calls_in(fake)[("w", "criteria", "deepseek")]
        crit.update(status="running", model=None, attempts=[], cost_usd=None,
                    prompt_tokens=None, completion_tokens=None, raw_output=None)
        fake.tables["aci_assessment_scores"] = [r for r in fake.tables["aci_assessment_scores"]
                                                if r["call_id"] != crit["id"]]
        again = Scripted()
        resumed = go(again, fake, resume=run_id)
        self.assertIsNone(resumed.raised)
        self.assertIn("nothing else is running it", resumed.stdout)
        self.assertEqual(again.asked_in[0], ("w", "criteria", "deepseek"))
        self.assertEqual(calls_in(fake)[("w", "criteria", "deepseek")]["id"], crit["id"])
        self.assertEqual(assess.gaps(fake, run_id, ["v", "w"]), [])


class FailsOnDone(FakeStore):
    """A store whose write marking one call done raises `stop`, once, the call
    named (document, question, seat). With `and_error`, the write marking that
    call error, which follows, fails too, once."""

    def __init__(self, target, stop, and_error=False, **tables):
        super().__init__(**tables)
        self.target, self.stop, self.and_error = target, stop, and_error
        self.failed = []

    def update(self, table, match, patch):
        if table == "aci_assessment_calls" and patch.get("status") in ("done", "error"):
            row = next(r for r in self.tables[table] if r["id"] == match.get("id"))
            if (row["spec_version_id"], row["question"], row["seat"]) == self.target:
                if patch["status"] == "done" and not self.failed:
                    self.failed.append("done")
                    raise self.stop
                if patch["status"] == "error" and self.and_error and self.failed == ["done"]:
                    self.failed.append("error")
                    raise store_module.StoreError("PATCH aci_assessment_calls: connection reset")
        return super().update(table, match, patch)


def billed(*models):
    """What every call the scripted `models` were asked cost, all of them
    billed at USAGE."""
    return sum(cost(tag) for model in models for _document, _question, tag in model.asked_in)


class StoppedWhileWritingTest(unittest.TestCase):
    """A stop during the write that marks a call done comes after its reply
    was paid for: the row keeps the reply and its bill, and a resume neither
    loses nor lowers what the run has spent."""

    def test_a_stop_while_a_reply_is_marked_done_keeps_the_reply_and_its_bill(self):
        for stop in (KeyboardInterrupt(),
                     store_module.StoreError("PATCH aci_assessment_calls: 503 unavailable")):
            with self.subTest(stop=type(stop).__name__):
                fake = FailsOnDone(("v", "criteria", "fable"), stop,
                                   aci_spec_versions=[dict(VERSION)])
                first = Scripted()
                stopped = go(first, fake, documents=("v",))
                self.assertIs(stopped.raised, stop)
                call = calls_in(fake)[("v", "criteria", "fable")]
                self.assertEqual(call["status"], "error")
                self.assertEqual(call["error"], seat_call.stop_error(stop))
                self.assertEqual(call["attempts"], [{"model": "fable", "finish_reason": "stop",
                                                     "cost_usd": cost("fable"), "reason": None}])
                self.assertEqual(call["cost_usd"], cost("fable"))
                self.assertEqual((call["prompt_tokens"], call["completion_tokens"]),
                                 (USAGE["prompt_tokens"], USAGE["completion_tokens"]))
                self.assertEqual(call["raw_output"], CRITERIA, "the paid reply is kept")
                [run_row] = fake.tables["aci_assessment_runs"]
                self.assertEqual(run_row["status"], "error")
                self.assertAlmostEqual(run_row["cost_usd"], billed(first), places=6)

                again = Scripted()
                resumed = go(again, fake, documents=("v",), resume=run_row["id"])
                self.assertIsNone(resumed.raised)
                self.assertEqual(again.asked_in[0], ("v", "criteria", "fable"),
                                 "the seat is asked again, in its own row")
                call = calls_in(fake)[("v", "criteria", "fable")]
                self.assertEqual(call["status"], "done")
                self.assertEqual([a["model"] for a in call["attempts"]], ["fable", "fable"])
                self.assertAlmostEqual(call["cost_usd"], 2 * cost("fable"))
                [run_row] = fake.tables["aci_assessment_runs"]
                # Everything billed, both of that seat's attempts included.
                self.assertAlmostEqual(run_row["cost_usd"], billed(first, again), places=6)
                self.assertEqual(assess.gaps(fake, run_row["id"], ["v"]), [])

    def test_a_resume_never_lowers_the_run_s_cost_below_what_its_row_recorded(self):
        # The done write fails, and so does the error write after it: the row
        # is left running with nothing on it, while the run row, closed after,
        # carries that call's cost. The calls' own sum is then too low.
        fake = FailsOnDone(("v", "criteria", "fable"), KeyboardInterrupt(), and_error=True,
                           aci_spec_versions=[dict(VERSION)])
        first = Scripted()
        stopped = go(first, fake, documents=("v",))
        self.assertIsInstance(stopped.raised, store_module.StoreError)
        call = calls_in(fake)[("v", "criteria", "fable")]
        self.assertEqual((call["status"], call.get("cost_usd")), ("running", None))
        [run_row] = fake.tables["aci_assessment_runs"]
        self.assertAlmostEqual(run_row["cost_usd"], billed(first), places=6)
        self.assertLess(sum(row.get("cost_usd") or 0 for row in calls_in(fake).values()),
                        run_row["cost_usd"])

        again = Scripted()
        resumed = go(again, fake, documents=("v",), resume=run_row["id"])
        self.assertIsNone(resumed.raised)
        [run_row] = fake.tables["aci_assessment_runs"]
        self.assertAlmostEqual(run_row["cost_usd"], billed(first, again), places=6)

    def test_a_resume_counts_its_calls_when_the_run_row_recorded_less(self):
        # A process killed outright never closes its run row, while its calls
        # carry their bill: the larger of the two is what was spent before.
        fake = store()
        first = Scripted(criteria__deepseek=cut())
        stopped = go(first, fake, documents=("v",))
        self.assertIsInstance(stopped.raised, seat_call.Unreachable)
        fake.tables["aci_assessment_runs"][0].update(status="running", cost_usd=None,
                                                     error=None, finished_at=None)
        self.assertEqual(first.asked_in, [("v", "criteria", "sol"), ("v", "criteria", "fable")]
                         + [("v", "criteria", "deepseek")] * 6)
        again = Scripted()
        go(again, fake, documents=("v",), resume=fake.tables["aci_assessment_runs"][0]["id"])
        [run_row] = fake.tables["aci_assessment_runs"]
        # sol and fable answered before the stop; deepseek's six tries never
        # reached a model, so none of them was billed.
        self.assertAlmostEqual(run_row["cost_usd"], cost("sol") + cost("fable") + billed(again),
                               places=6)


class ConfirmationsTest(unittest.TestCase):
    """The claims a resume prices a confirmation on are the claims it asks
    about, both read through one helper."""

    def test_the_pool_and_each_seat_s_claims_come_from_one_helper(self):
        found = {"sol": [{"first": 2, "second": 3, "situation": "s", "why": "w"}],
                 "fable": [{"first": 3, "second": 2, "situation": "t", "why": "x"}],
                 "kimi": [{"first": 1, "second": 3, "situation": "u", "why": "y"}]}
        seats = ["sol", "fable", "kimi"]
        pooled, to_confirm = assessment_store.confirmations(found, seats, PASSAGES)
        self.assertEqual(pooled, assessment_store.distinct_claims(
            assessment_run.pool_claims(found, seats), PASSAGES))
        self.assertEqual(to_confirm, {
            "sol": [(1, {"first": 1, "second": 3, "situation": "u", "why": "y"})],
            "fable": [(1, {"first": 1, "second": 3, "situation": "u", "why": "y"})],
            "kimi": [(0, {"first": 2, "second": 3, "situation": "s", "why": "w"})]})
        # A seat that found every claim has nothing to confirm, and is not listed.
        _pooled, to_confirm = assessment_store.confirmations(
            {"sol": found["sol"], "fable": found["fable"]}, ["sol", "fable"], PASSAGES)
        self.assertEqual(to_confirm, {})

    def test_the_confirmations_priced_are_the_confirmations_asked(self):
        fake = two_documents()
        stopped = go(Scripted(w__confirm__fable=cut()), fake)
        self.assertIsInstance(stopped.raised, seat_call.Unreachable)
        document = assess.load_documents(fake, ["w"], both_passages)[0]
        _run, by_version = assess.index_store.assessment_rows(
            fake, fake.tables["aci_assessment_runs"][0]["id"], ["w"])
        priced = [(seat, claims) for question, seat, claims in assessment_store.to_ask(
            document, by_version["w"], CONFIG["assessment"]) if question == "confirm"]
        self.assertEqual([seat for seat, _claims in priced], ["fable", "kimi"])
        again = Scripted()
        go(again, fake, resume=fake.tables["aci_assessment_runs"][0]["id"])
        asked = [(tag, user) for (document_id, question, tag), (_q, _t, user)
                 in zip(again.asked_in, again.asked) if (document_id, question) == ("w", "confirm")]
        self.assertEqual(asked, [
            (seat, assessment_call.compose_confirm(document["labelled"], claims)[1])
            for seat, claims in priced])


class ResumeRefusedTest(unittest.TestCase):
    """A resume that would mix two configurations, or leave out a document the
    run has begun, is refused before anything is asked or written."""

    def done_run(self, documents=("v", "w")):
        fake = two_documents()
        fresh = go(Scripted(), fake, documents=documents)
        return fake, fresh.run_id

    def refused(self, fake, run_id, documents=("v", "w")):
        writes_before = len(fake.writes)
        model = Scripted()
        outcome = go(model, fake, documents=documents, resume=run_id)
        self.assertIsInstance(outcome.raised, SystemExit)
        self.assertEqual(len(fake.writes), writes_before, "a refused resume wrote something")
        self.assertEqual(model.asked, [], "a refused resume asked a model")
        return str(outcome.raised)

    def test_a_changed_prompt_digest_is_refused_naming_it(self):
        fake, run_id = self.done_run()
        fake.tables["aci_assessment_runs"][0]["prompts"]["confirm"] = "0" * 64
        message = self.refused(fake, run_id)
        self.assertIn("prompts.confirm", message)
        self.assertIn("0" * 64, message)
        self.assertIn(assessment_call.prompt_sha256("confirm"), message)
        self.assertNotIn("prompts.criteria", message)

    def test_a_changed_panel_is_refused_naming_it(self):
        fake, run_id = self.done_run()
        fake.tables["aci_assessment_runs"][0]["panels"]["criteria"] = ["sol", "fable", "glm"]
        message = self.refused(fake, run_id)
        self.assertIn("panels.criteria", message)
        self.assertNotIn("panels.contradictions", message)

    def test_changed_substitutes_are_refused_naming_each_difference(self):
        fake, run_id = self.done_run()
        recorded = fake.tables["aci_assessment_runs"][0]["config"]["substitutes"]
        recorded["frontier_fast"]["fable"] = ["opus", "kimi"]
        recorded["frontier_fast"]["sol"] = ["kimi"]
        message = self.refused(fake, run_id)
        self.assertIn("substitutes.frontier_fast.fable", message)
        self.assertIn("substitutes.frontier_fast.sol", message)
        self.assertNotIn("substitutes.frontier_fast.deepseek", message)

    def test_a_document_the_run_has_begun_must_be_named(self):
        fake, run_id = self.done_run()
        message = self.refused(fake, run_id, documents=("v",))
        self.assertIn(DOC2, message)
        self.assertIn("w", message)
        self.assertNotIn(f"{DOC}", message)

    def resume_main(self, argv, fake, model=None):
        # install_registry reads a table here, so a store call made before the
        # run is looked up shows in what the store was asked.
        with mock.patch.object(assess, "Store", type("S", (), {"from_env": staticmethod(
                    lambda **_kwargs: fake)})), \
                mock.patch.object(assess.index_store, "install_registry",
                                  lambda s: s.select("aci_specs")), \
                mock.patch.object(assess.h, "passages", both_passages), \
                mock.patch.object(assess.batch_job, "call_openrouter", model or Scripted()), \
                contextlib.redirect_stdout(io.StringIO()) as out, \
                contextlib.redirect_stderr(io.StringIO()):
            return assess.main(argv), out.getvalue()

    def test_a_short_id_is_refused_before_the_store_is_opened(self):
        fake, run_id = self.done_run()
        with mock.patch.object(assess, "Store", type("S", (), {"from_env": staticmethod(
                    mock.Mock(side_effect=AssertionError("the store was opened")))})), \
                self.assertRaises(SystemExit) as refused:
            assess.main(["--documents=v,w", f"--resume={run_id[:8]}", "--go"])
        self.assertIn(f"--resume={run_id[:8]}", str(refused.exception))
        self.assertIn("uuid", str(refused.exception))

    def test_an_unknown_id_is_refused_before_any_other_store_call(self):
        class Recording(FakeStore):
            def select(self, table, params=None):
                self.selected = getattr(self, "selected", []) + [table]
                return super().select(table, params)
        fake = Recording(aci_spec_versions=[dict(VERSION), dict(VERSION2)])
        unknown = "00000000-0000-4000-8000-000000000000"
        with self.assertRaises(SystemExit) as refused:
            self.resume_main(["--documents=v,w", f"--resume={unknown}", "--go"], fake)
        self.assertIn(unknown, str(refused.exception))
        self.assertEqual(fake.selected, ["aci_assessment_runs"])
        self.assertEqual(fake.writes, [])

    def test_a_document_with_claims_and_a_silent_contradictions_seat_needs_a_new_run(self):
        # kimi has no declared substitute, so on the second document its
        # contradictions call ends in error; the claims sol and fable found
        # are written, and read by every seat, kimi included.
        fake = two_documents()
        fresh = go(Scripted(w__contradictions__kimi=RuntimeError("provider refused the input")),
                   fake)
        self.assertEqual(calls_in(fake)[("w", "contradictions", "kimi")]["status"], "error")
        self.assertTrue([c for c in fake.tables["aci_assessment_claims"]
                         if c["spec_version_id"] == "w"])
        writes_before = len(fake.writes)
        model = Scripted()
        code, printed = self.resume_main(
            ["--documents=v,w", f"--resume={fresh.run_id}", "--go"], fake, model)
        self.assertEqual(code, 1)
        self.assertEqual(model.asked, [], "nothing is asked of either document")
        self.assertIn(DOC2, printed)
        self.assertIn("new run", printed)
        self.assertIn(f"{DOC2}: kimi gave no contradictions answer", printed)
        self.assertNotIn(f"--resume={fresh.run_id}", printed.split("gave no contradictions")[-1],
                         "a gap only a new run can fix is not sent back to --resume")
        new_writes = fake.writes[writes_before:]
        self.assertFalse([w for w in new_writes if w[1] != "aci_assessment_runs"],
                         "only the run row is reopened and closed")


if __name__ == "__main__":
    unittest.main()
