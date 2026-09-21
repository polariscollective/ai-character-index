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

CONFIG = json.loads((HERE / "panel" / "panel-config.json").read_text())


class ConfigTest(unittest.TestCase):
    def test_the_assessment_names_its_seats_per_question(self):
        self.assertEqual(CONFIG["assessment"],
                         {"criteria": ["sol", "fable", "deepseek"],
                          "contradictions": ["sol", "fable", "kimi"]})

    def test_the_substitutes_stay_those_of_frontier_fast(self):
        self.assertEqual(CONFIG["substitutes"],
                         {"frontier_fast": {"fable": ["opus", "kimi"],
                                            "deepseek": ["kimi"]}})


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
    return next(t for t in ("deepseek", "fable", "opus", "kimi", "sol") if t in model_id.lower())


class Scripted:
    """Answers by question and model. The default: every criteria call cites
    passage 1; sol and fable find the privacy clash, kimi the safety clash; each
    confirmation holds its first claim and rejects any second one. `script`
    overrides a (question, tag) with (reply, finish_reason) or an exception, a
    KeyboardInterrupt or a SystemExit included."""

    def __init__(self, **script):
        self.script = {tuple(key.split("__")): value for key, value in script.items()}
        self.asked = []

    def __call__(self, provider, model_id, system, user, kwargs):
        question, tag = QUESTION_OF[system], tag_of(model_id)
        self.asked.append((question, tag, user))
        if (question, tag) in self.script:
            scripted = self.script[(question, tag)]
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
        self.assertIsNone(call["raw_output"], "a reply that parsed completely is not kept")
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
        # fable, then its substitutes opus and kimi, all refused on criteria:
        # kimi answers deepseek's substitute list too, but must not be asked
        # to answer criteria a second time.
        model = Scripted(criteria__fable=("", "content_filter"),
                         criteria__opus=("", "content_filter"),
                         criteria__deepseek=("", "content_filter"))
        fake, _estimate, _run_id = run(model)
        calls = calls_by(fake)
        self.assertEqual(calls[("criteria", "fable")]["model"], "kimi")
        deepseek_call = calls[("criteria", "deepseek")]
        self.assertEqual(deepseek_call["status"], "error")
        self.assertEqual([(a["model"], a["reason"]) for a in deepseek_call["attempts"]], [
            ("deepseek", "finish_reason=content_filter"), ("kimi", "already seated")])
        asked = [(question, tag) for question, tag, _user in model.asked]
        self.assertEqual(asked.count(("criteria", "kimi")), 1)
        self.assertEqual(fake.tables["aci_assessment_runs"][0]["status"], "done")

    def test_a_substitute_already_seated_for_the_question_is_skipped(self):
        model = Scripted(contradictions__fable=("", "content_filter"),
                         contradictions__opus=RuntimeError("provider refused the input"),
                         criteria__fable=("", "content_filter"),
                         criteria__opus=("", "content_filter"))
        fake, _estimate, _run_id = run(model)
        calls = calls_by(fake)
        call = calls[("contradictions", "fable")]
        self.assertEqual(call["status"], "error")
        self.assertIsNone(call.get("model"), "a call nobody answered names no model")
        self.assertEqual(call["error"], "provider refused the input")
        self.assertEqual([(a["model"], a["reason"]) for a in call["attempts"]], [
            ("fable", "finish_reason=content_filter"), ("opus", "provider refused the input"),
            ("kimi", "already seated")])
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

    def test_a_seat_nobody_could_answer_keeps_the_last_refused_text_and_its_cost(self):
        model = Scripted(criteria__fable=("I cannot help with that.", "content_filter"),
                         criteria__opus=RuntimeError("401"),
                         criteria__kimi=("", "stop"))
        fake, _estimate, _run_id = run(model)
        call = calls_by(fake)[("criteria", "fable")]
        self.assertEqual(call["status"], "error")
        self.assertEqual(call["error"], "empty reply, finish_reason=stop")
        self.assertEqual(call["raw_output"], "I cannot help with that.")
        self.assertEqual(call["cost_usd"], round(batch_job.cost_of("fable", USAGE, CONFIG)
                                                 + batch_job.cost_of("kimi", USAGE, CONFIG), 6))
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
    def main(self, argv, fake):
        with mock.patch.object(assess, "Store", type("S", (), {"from_env": staticmethod(
                    lambda: fake)})), \
                mock.patch.object(assess.index_store, "install_registry", lambda s: None), \
                mock.patch.object(assess.h, "passages", passages_for), \
                mock.patch.object(assess.batch_job, "call_openrouter", Scripted()), \
                mock.patch.dict(os.environ, {"USER": "someone"}), \
                contextlib.redirect_stdout(io.StringIO()) as printed:
            self.assertEqual(assess.main(argv), 0)
        return printed.getvalue()

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


if __name__ == "__main__":
    unittest.main()
