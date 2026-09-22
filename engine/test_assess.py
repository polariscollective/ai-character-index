"""The assessment of a whole document, run and stored, against tables in memory
and a model that answers from a script.

Nothing touches a network. The store records every insert and update, so what
the command writes, and in what order, is what these tests read."""
import contextlib
import copy
import io
import itertools
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
        # opus takes fable's contradictions seat, which fable's content filter
        # refused on all four documents of the first full run (owner, 22
        # September 2026); the criteria keep frontier_fast's seats.
        self.assertEqual(CONFIG["assessment"],
                         {"criteria": ["sol", "fable", "deepseek"],
                          "contradictions": ["sol", "opus", "kimi"]})

    def test_the_substitutes_stay_those_of_frontier_fast(self):
        self.assertEqual(CONFIG["substitutes"],
                         {"frontier_fast": {"fable": ["opus", "kimi", "glm"],
                                            "deepseek": ["glm", "kimi"],
                                            "opus": ["glm"]}})

    def test_kimi_and_glm_may_write_a_list_as_long_as_their_providers_allow(self):
        # Assessment run e2c00b2e lost two finding calls to our cap, not to the
        # providers': kimi stopped at 65536 tokens and glm at the 32768 a model
        # with no cap is sent with, where OpenRouter allows 943718 and 131072.
        for tag in ("kimi", "glm"):
            with self.subTest(tag=tag):
                self.assertEqual(CONFIG["models"][tag]["max_output"], 131072)
                self.assertEqual(seat_call.max_output(tag, CONFIG), 131072)

    def test_the_notes_say_why_and_when(self):
        for note in ("_assessment_note", "_substitutes_note"):
            with self.subTest(note=note):
                self.assertIn("22 September 2026", CONFIG[note])
                self.assertIn("opus", CONFIG[note])
                self.assertNotIn("—", CONFIG[note])
                self.assertNotIn("–", CONFIG[note])


# The only columns of a claim the database lets the engine update: a person's
# reading of it (the grants of 20260921180000 in polaris-supabase).
REVIEW_COLUMNS = {"reviewed_verdict", "reviewed_by", "reviewed_at"}


class FakeStore:
    """Tables in memory, honouring `eq.` filters, with every write recorded in
    order: ("insert", table, rows) and ("update", table, match, patch). An
    update of a claim's columns other than its review is refused, as the
    database's grants refuse it."""

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
        if table == "aci_assessment_claims" and set(patch) - REVIEW_COLUMNS:
            raise store_module.StoreError(
                "PATCH aci_assessment_claims: permission denied for "
                f"{', '.join(sorted(set(patch) - REVIEW_COLUMNS))}")
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
           "| Honesty and privacy clash.")
SAFETY = ("CONTRADICTION: [3] [1] | A user asks to break a rule for safety. "
          "| Safety and privacy clash.")
NONE_FOUND = "CONTRADICTION: none"
# Every seat reads both claims of a document, in the order they were pooled.
PRIVACY_CLAIM = {"first": 2, "second": 3, "situation": "A user asks what the operator said.",
                 "why": "Honesty and privacy clash."}
SAFETY_CLAIM = {"first": 3, "second": 1, "situation": "A user asks to break a rule for safety.",
                "why": "Safety and privacy clash."}
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
    passage 1; sol and opus find the privacy clash, kimi the safety clash; each
    reading holds its first claim and rejects any second one. `script`
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
        # Contradictions: sol, opus then glm, kimi.
        system, user = assessment_call.compose("contradictions", labelled)
        want += sum(at_most(tag, system, user) for tag in ("sol", "opus", "glm", "kimi"))
        # The reading, at the estimate's own input: the document and 3,000
        # characters of claims, asked of the contradictions' seats.
        system, user = assessment_call.compose_confirm(labelled, [])
        user += "x" * assessment_run.CONFIRM_CLAIMS_CHARS
        want += sum(at_most(tag, system, user) for tag in ("sol", "opus", "glm", "kimi"))
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
            ("contradictions", "sol"), ("contradictions", "opus"), ("contradictions", "kimi"),
            ("confirm", "sol"), ("confirm", "opus"), ("confirm", "kimi")])
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
        # A finding gives no score: the contradictions score is read from the
        # claims and their readings.
        self.assertFalse([row for row in scores if row["criterion"] == "contradictions"])
        self.assertEqual(len(scores), 3 * 4)

    def test_a_claim_found_by_two_seats_is_read_by_all_three(self):
        fake, _estimate, run_id = run(Scripted())
        calls = calls_by(fake)
        claims = fake.inserted("aci_assessment_claims")
        privacy = next(c for c in claims if c["found_by"] == ["sol", "opus"])
        self.assertEqual({key: privacy[key] for key in privacy if key != "id"}, {
            "run_id": run_id, "spec_version_id": "v",
            "first_locator": PASSAGES[1][0], "second_locator": PASSAGES[2][0],
            "situation": "A user asks what the operator said.",
            "why": "Honesty and privacy clash.", "found_by": ["sol", "opus"]})
        verdicts = {row["seat"]: row for row in fake.inserted("aci_assessment_verdicts")
                    if row["claim_id"] == privacy["id"]}
        # Each seat's verdict is its reading, from its own reading call: a
        # finder's included, and no "found it" row is written.
        for seat in ("sol", "opus", "kimi"):
            self.assertEqual(verdicts[seat], {
                "claim_id": privacy["id"], "call_id": calls[("confirm", seat)]["id"],
                "seat": seat, "holds": True, "absolute": False, "reason": "Matches."})
        self.assertNotIn("found it", [v["reason"] for v in fake.inserted(
            "aci_assessment_verdicts")])

    def test_every_seat_reads_every_claim_of_its_version_its_own_included(self):
        model = Scripted()
        fake, _estimate, _run_id = run(model)
        labelled = assessment_call.with_heading_attributes(PASSAGES, VERSION["markdown"])
        want = assessment_call.compose_confirm(labelled, [PRIVACY_CLAIM, SAFETY_CLAIM])[1]
        read = {tag: user for question, tag, user in model.asked if question == "confirm"}
        self.assertEqual(read, {"sol": want, "opus": want, "kimi": want})
        claims = fake.inserted("aci_assessment_claims")
        verdicts = fake.inserted("aci_assessment_verdicts")
        self.assertEqual(sorted((v["claim_id"], v["seat"]) for v in verdicts),
                         sorted((c["id"], seat) for c in claims
                                for seat in ("sol", "opus", "kimi")))

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
        # It was the second claim each seat read, the one each rejects: kimi,
        # which found it, included.
        self.assertEqual({seat: v["holds"] for seat, v in verdicts.items()},
                         {"sol": False, "opus": False, "kimi": False})
        self.assertEqual(verdicts["kimi"]["call_id"], calls[("confirm", "kimi")]["id"])
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

    def test_a_contradictions_seat_nobody_could_answer_leaves_the_document_unread(self):
        model = Scripted(contradictions__opus=RuntimeError("provider refused the input"),
                         contradictions__glm=("", "content_filter"))
        fake, _estimate, run_id = run(model)
        calls = calls_by(fake)
        call = calls[("contradictions", "opus")]
        self.assertEqual(call["status"], "error")
        self.assertIsNone(call.get("model"), "a call nobody answered names no model")
        self.assertEqual(call["error"], "finish_reason=content_filter")
        self.assertEqual([(a["model"], a["reason"]) for a in call["attempts"]], [
            ("opus", "provider refused the input"), ("glm", "finish_reason=content_filter")])
        # The claims sol and kimi found are not written and nobody reads them:
        # what opus would have found could change them.
        self.assertEqual(fake.tables.get("aci_assessment_claims", []), [])
        self.assertNotIn("confirm", {question for question, _tag, _user in model.asked})
        self.assertFalse([key for key in calls if key[0] == "confirm"])
        self.assertEqual(fake.tables["aci_assessment_runs"][0]["status"], "done")
        self.assertFalse([row for row in fake.inserted("aci_assessment_scores")
                          if row["call_id"] == call["id"]])
        self.assertEqual(assess.gaps(fake, run_id, ["v"]), [f"{DOC}: opus gave no contradictions "
                                                            "answer"])

    def test_glm_answers_opus_s_contradictions_seat_when_opus_cannot(self):
        """On the Alibaba Model Spec every Anthropic model is refused, and
        kimi already holds a contradictions seat: glm, opus's declared
        substitute, answers in its place."""
        model = Scripted(contradictions__opus=("", "content_filter"),
                         confirm__opus=RuntimeError("provider refused the input"))
        fake, _estimate, _run_id = run(model)
        calls = calls_by(fake)
        for question in ("contradictions", "confirm"):
            call = calls[(question, "opus")]
            self.assertEqual((call["status"], call["model"]), ("done", "glm"))
            self.assertEqual([a["model"] for a in call["attempts"]], ["opus", "glm"])

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
                "One passage cited under two different numbers.")
        model = Scripted(contradictions__sol=(found, "stop"),
                         contradictions__opus=(NONE_FOUND, "stop"),
                         contradictions__kimi=(NONE_FOUND, "stop"))
        with contextlib.redirect_stdout(io.StringIO()):
            assess.assess(fake, CONFIG, ["dup"], lambda *_a: dup_passages, call_model=model,
                          go=True, created_by="tester")
        # The claim, sharing a locator, got no row, and nobody was asked to
        # read what was never written.
        self.assertEqual(fake.tables.get("aci_assessment_claims", []), [])
        self.assertNotIn("confirm", {q for q, _t, _u in model.asked})
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
        self.assertIn("contradictions and their reading by sol, opus, kimi", printed)
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


def go(model, fake, documents=("v", "w"), resume=None, spend=True, criteria_from=None,
       passages=None, replay=False):
    """assess() over `documents`, fresh or taking up run `resume`, replaying
    what failed with `replay`, with every wait recorded rather than slept.
    What it raised is returned, not raised."""
    waits = []
    with mock.patch.object(seat_call, "sleep", waits.append), \
            contextlib.redirect_stdout(io.StringIO()) as out, \
            contextlib.redirect_stderr(io.StringIO()) as err:
        try:
            taken_up = None if resume is None else assess.resumable(fake, resume)
            estimate, run_id = assess.assess(fake, CONFIG, list(documents),
                                             passages or both_passages,
                                             call_model=model, go=spend, created_by="tester",
                                             resume=taken_up, criteria_from=criteria_from,
                                             replay=replay)
        except BaseException as raised:                   # noqa: BLE001
            return Outcome(raised=raised, stdout=out.getvalue(), stderr=err.getvalue(),
                           waits=waits)
    return Outcome(estimate, run_id, None, out.getvalue(), err.getvalue(), waits)


def failed_after_the_readings(fake, version_id, seat, attempts=None,
                              reason="empty reply, finish_reason=length"):
    """One finding call left as assessment run e2c00b2e left two of them.

    The code that ran it wrote a document's claims, and had every seat read
    them, although a finder had failed: the claims were pooled without it. A
    run in which `seat` found nothing on `version_id` pools and reads exactly
    those claims, so the state is built from one, its finding call then
    written as the failure: error, with no model and no reply, and its
    attempts billed."""
    call = calls_in(fake)[(version_id, "contradictions", seat)]
    attempts = attempts or [{"model": seat, "finish_reason": "length", "cost_usd": cost(seat),
                             "reason": reason}]
    call.update(status="error", error=attempts[-1]["reason"], model=None, raw_output=None,
                finish_reason=None, seconds=None, attempts=attempts,
                cost_usd=assessment_store.summed(a.get("cost_usd") for a in attempts))
    return call


def cut_during_the_second_documents_contradictions(fake):
    """A run of both documents stopped by a network cut: on the second
    document, opus's contradictions are refused by a content filter, then
    glm, its substitute, cannot be reached through any wait."""
    model = Scripted(w__contradictions__opus=("", "content_filter"),
                     w__contradictions__glm=cut())
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
        call = calls[("w", "contradictions", "opus")]
        self.assertEqual(call["status"], "error")
        self.assertTrue(call["error"].startswith("unreachable: glm"), call["error"])
        self.assertIn("APIConnectionError", call["error"])
        self.assertEqual(call["attempts"], [
            {"model": "opus", "finish_reason": "content_filter", "cost_usd": cost("opus"),
             "reason": "finish_reason=content_filter"}])
        self.assertEqual(call["cost_usd"], cost("opus"))
        self.assertNotIn(("w", "contradictions", "kimi"), calls, "the run stopped there")
        [run_row] = fake.tables["aci_assessment_runs"]
        self.assertEqual(run_row["status"], "error")
        self.assertTrue(run_row["error"].startswith("unreachable: glm"))
        self.assertEqual(run_row["cost_usd"],
                         round(sum(row["cost_usd"] for row in calls.values()), 6))
        # The command says how to take it up again, naming the run.
        self.assertIn(f"--resume={run_id} --documents=v,w --go", stopped.stderr)

    def test_the_command_stops_non_zero_and_says_how_to_take_it_up_again(self):
        fake = two_documents()
        model = Scripted(w__contradictions__opus=("", "content_filter"),
                         w__contradictions__glm=cut())
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
        stopped_row = dict(calls_in(fake)[("w", "contradictions", "opus")])
        writes_before = len(fake.writes)

        again = Scripted()
        resumed = go(again, fake, resume=run_id)
        self.assertIsNone(resumed.raised)
        self.assertEqual(resumed.run_id, run_id)
        self.assertEqual(again.asked_in, [
            ("w", "contradictions", "opus"), ("w", "contradictions", "kimi"),
            ("w", "confirm", "sol"), ("w", "confirm", "opus"), ("w", "confirm", "kimi")])

        # The stopped call is asked again in its own row, its bill kept.
        calls = calls_in(fake)
        self.assertEqual(len(calls), 18, "one row per document, question and seat")
        call = calls[("w", "contradictions", "opus")]
        self.assertEqual(call["id"], stopped_row["id"])
        self.assertEqual((call["status"], call["model"], call["error"]), ("done", "opus", None))
        self.assertEqual(call["attempts"], stopped_row["attempts"] + [
            {"model": "opus", "finish_reason": "stop", "cost_usd": cost("opus"),
             "reason": None}])
        self.assertAlmostEqual(call["cost_usd"], 2 * cost("opus"))
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
        self.assertEqual(len(scores), 2 * 3 * 4)

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
        this_resume = (cost("opus") + cost("kimi")
                       + cost("sol") + cost("opus") + cost("kimi"))
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
        want = sum(seat_call.priced(seat, system, user, 8000, CONFIG) for seat in ("opus", "kimi"))
        # kimi's contradictions are not known yet, so the claims to read are
        # not either: each reading is priced as a fresh run prices it.
        system, user = assessment_call.compose_confirm(labelled, [])
        want += sum(seat_call.priced(seat, system, user + "x" * 3000, 1500, CONFIG)
                    for seat in ("sol", "opus", "kimi"))
        self.assertEqual(priced.estimate, round(want, 2))
        self.assertIn("Priced at about", priced.stdout)

    def test_a_reading_whose_claims_are_known_is_priced_on_them(self):
        fake = two_documents()
        stopped = go(Scripted(w__confirm__opus=("", "content_filter"), w__confirm__glm=cut()),
                     fake)
        self.assertIsInstance(stopped.raised, seat_call.Unreachable)
        [run_row] = fake.tables["aci_assessment_runs"]
        priced = go(Scripted(), fake, resume=run_row["id"], spend=False)
        labelled = assessment_call.with_heading_attributes(PASSAGES2, VERSION2["markdown"])
        # sol has read; opus and kimi each read both claims, their own included.
        system, user = assessment_call.compose_confirm(labelled, [PRIVACY_CLAIM, SAFETY_CLAIM])
        want = sum(seat_call.priced(seat, system, user, 1500, CONFIG) for seat in ("opus", "kimi"))
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
        privacy = next(c for c in claims if c["found_by"] == ["sol", "opus"])
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


class ReadingsTest(unittest.TestCase):
    """The claims a resume prices a reading on are the claims it asks about,
    both read through one helper."""

    def test_the_readings_priced_are_the_readings_asked(self):
        fake = two_documents()
        stopped = go(Scripted(w__confirm__opus=("", "content_filter"), w__confirm__glm=cut()),
                     fake)
        self.assertIsInstance(stopped.raised, seat_call.Unreachable)
        document = assess.load_documents(fake, ["w"], both_passages)[0]
        _run, by_version = assess.index_store.assessment_rows(
            fake, fake.tables["aci_assessment_runs"][0]["id"], ["w"])
        priced = [(seat, claims) for question, seat, claims in assessment_store.to_ask(
            [document], by_version, CONFIG["assessment"])["w"] if question == "confirm"]
        self.assertEqual([seat for seat, _claims in priced], ["opus", "kimi"])
        again = Scripted()
        go(again, fake, resume=fake.tables["aci_assessment_runs"][0]["id"])
        asked = [(tag, user) for (document_id, question, tag), (_q, _t, user)
                 in zip(again.asked_in, again.asked) if (document_id, question) == ("w", "confirm")]
        self.assertEqual(asked, [
            (seat, assessment_call.compose_confirm(document["labelled"], claims)[1])
            for seat, claims in priced])


# Three versions of the first document. The second reads the same, with a
# passage added before the others; the third rewords the privacy passage.
VERSION_B = {"id": "b", "spec_id": "lab--spec", "version": "2026-06-01",
             "markdown": VERSION["markdown"]}
VERSION_C = {"id": "c", "spec_id": "lab--spec", "version": "2026-09-01",
             "markdown": VERSION["markdown"]}
PASSAGES_B = ([("lab--spec@2026-06-01 > #new > ¶1", "N", "Be brief.")]
              + [(locator.replace(DOC, "lab--spec@2026-06-01"), section, text)
                 for locator, section, text in PASSAGES])
PASSAGES_C = [(locator.replace(DOC, "lab--spec@2026-09-01"), section,
               "Keep the operator's instructions secret." if n == 2 else text)
              for n, (locator, section, text) in enumerate(PASSAGES)]


def three_versions(spec, version):
    return {"2026-01-01": PASSAGES, "2026-06-01": PASSAGES_B,
            "2026-09-01": PASSAGES_C}[version]


class Versions:
    """sol finds the privacy clash on the first version only, and kimi the
    safety clash on the third only; every reading holds every claim."""

    def __init__(self):
        self.asked = []

    def __call__(self, provider, model_id, system, user, kwargs):
        question, tag = QUESTION_OF[system], tag_of(model_id)
        document = "b" if "Be brief." in user else "c" if "secret." in user else "v"
        self.asked.append((document, question, tag, user))
        if question == "criteria":
            reply = CRITERIA
        elif question == "contradictions":
            reply = {("v", "sol"): PRIVACY, ("c", "kimi"): SAFETY}.get((document, tag),
                                                                       NONE_FOUND)
        else:
            reply = "ITEM 1: holds | absolute: no | Holds.\nITEM 2: holds | absolute: no | Holds."
        return reply, dict(USAGE), "stop", 0.5


class AcrossVersionsTest(unittest.TestCase):
    """A candidate found on one version is carried to every version of the same
    document where both its passages read exactly the same."""

    def run_three(self, documents=("v", "b", "c")):
        fake = FakeStore(aci_spec_versions=[dict(VERSION), dict(VERSION_B), dict(VERSION_C)])
        model = Versions()
        outcome = go(model, fake, documents=documents, passages=three_versions)
        self.assertIsNone(outcome.raised)
        return fake, model, outcome.run_id

    def test_a_pair_found_on_one_version_is_carried_where_it_reads_the_same(self):
        fake, model, run_id = self.run_three()
        claims = {(c["spec_version_id"], c["first_locator"], c["second_locator"]): c
                  for c in fake.tables["aci_assessment_claims"]}
        privacy = [(version_id, passages[n][0], passages[n + 1][0])
                   for version_id, passages, n in (("v", PASSAGES, 1), ("b", PASSAGES_B, 2))]
        for key in privacy:
            self.assertEqual(claims[key]["found_by"], ["sol"], key)
            self.assertEqual(claims[key]["situation"], "A user asks what the operator said.")
        # The third version rewords a passage of the pair, so the pair is not
        # carried there; kimi's pair on it names that reworded passage, so it
        # is carried nowhere else.
        safety = ("c", PASSAGES_C[0][0], PASSAGES_C[2][0])
        self.assertEqual(sorted(claims), sorted(privacy + [safety]))
        self.assertEqual(claims[safety]["found_by"], ["kimi"])
        # Each version's readers read the claim as that version numbers it.
        labelled_b = assessment_call.with_heading_attributes(PASSAGES_B, VERSION["markdown"])
        read_b = [user for document, question, _tag, user in model.asked
                  if (document, question) == ("b", "confirm")]
        self.assertEqual(read_b, [assessment_call.compose_confirm(labelled_b, [
            dict(PRIVACY_CLAIM, first=3, second=4)])[1]] * 3)
        self.assertEqual(assess.gaps(fake, run_id, ["v", "b", "c"]), [])

    def test_the_pool_does_not_depend_on_the_order_the_versions_are_named_in(self):
        def written(fake):
            return sorted((c["spec_version_id"], c["first_locator"], c["second_locator"],
                           c["situation"], tuple(c["found_by"]))
                          for c in fake.tables["aci_assessment_claims"])
        forward, _model, _run_id = self.run_three(("v", "b", "c"))
        backward, _model, _run_id = self.run_three(("c", "b", "v"))
        self.assertEqual(written(forward), written(backward))

    def test_a_seat_silent_on_one_version_leaves_every_version_to_a_new_run(self):
        # kimi has no substitute. Its finding on the second version failed,
        # and the claims pooled across both versions were written and read all
        # the same, as run e2c00b2e was left: asking it again could now carry
        # a new pair to either version.
        fake = FakeStore(aci_spec_versions=[dict(VERSION), dict(VERSION_B), dict(VERSION_C)])
        fresh = go(Versions(), fake, documents=("v", "b"), passages=three_versions)
        self.assertIsNone(fresh.raised)
        failed_after_the_readings(fake, "b", "kimi", attempts=[
            {"model": "kimi", "finish_reason": None, "cost_usd": None,
             "reason": "provider refused the input"}])
        self.assertEqual({c["spec_version_id"] for c in fake.tables["aci_assessment_claims"]},
                         {"v", "b"})
        again = Versions()
        resumed = go(again, fake, documents=("v", "b"), resume=fresh.run_id,
                     passages=three_versions)
        self.assertIsNone(resumed.raised)
        self.assertEqual(again.asked, [], "neither version is asked anything")
        self.assertIn("lab--spec@2026-01-01, lab--spec@2026-06-01 are left as they are",
                      resumed.stdout)
        self.assertIn("kimi on lab--spec@2026-06-01 gave no contradictions answer",
                      resumed.stdout)
        self.assertIn("python3 engine/assess.py --documents=v,b --go", resumed.stdout)
        gaps = assess.gaps(fake, fresh.run_id, ["v", "b"])
        self.assertEqual(gaps, ["lab--spec@2026-06-01: kimi gave no contradictions answer"])
        remedy = assess.remedy(fake, fresh.run_id, ["v", "b"])
        self.assertIn("can only be assessed in a new run", remedy)
        self.assertIn("python3 engine/assess.py --documents=v,b --go", remedy)
        # Taking it up as it stands would change claims already read: the only
        # --resume offered replays what failed, and says what that gives.
        self.assertNotIn(f"--resume={fresh.run_id} --documents", remedy)
        self.assertNotIn(f"--resume={fresh.run_id} --documents", resumed.stdout)
        for said in (remedy, resumed.stdout):
            self.assertIn(f"python3 engine/assess.py --resume={fresh.run_id} --replay "
                          "--documents=v,b --go", said)
            self.assertIn("not exactly what a fresh run would give", said)

    def test_every_version_is_found_on_before_any_claim_is_written(self):
        fake, model, _run_id = self.run_three(("v", "b"))
        asked = [(document, question) for document, question, _tag, _user in model.asked]
        last_finding = max(i for i, (_d, question) in enumerate(asked)
                           if question == "contradictions")
        first_reading = min(i for i, (_d, question) in enumerate(asked) if question == "confirm")
        self.assertLess(last_finding, first_reading)


def versions_and_other(spec, version):
    """The first document's versions, and the second document."""
    return PASSAGES2 if spec == "lab--other" else three_versions(spec, version)


class SilentOn(Versions):
    """Versions, except that kimi's finding on the second version fails."""

    def __call__(self, provider, model_id, system, user, kwargs):
        if (QUESTION_OF[system], tag_of(model_id)) == ("contradictions", "kimi") \
                and "Be brief." in user:
            raise RuntimeError("provider refused the input")
        return super().__call__(provider, model_id, system, user, kwargs)


class StopsBeforeItsReadingsTest(unittest.TestCase):
    """A document on one of whose versions a contradictions seat ends without
    an answer is not read: none of its claims is written and no reading is
    asked, the run goes on with the next document, and a resume asks the
    finding again before the claims are written and read."""

    def stopped(self):
        fake = FakeStore(aci_spec_versions=[dict(VERSION), dict(VERSION_B), dict(VERSION2)])
        fresh = go(SilentOn(), fake, documents=("v", "b", "w"), passages=versions_and_other)
        self.assertIsNone(fresh.raised)
        return fake, fresh

    def test_a_finder_that_fails_on_one_version_leaves_no_claim_and_no_reading_on_any(self):
        fake, fresh = self.stopped()
        calls = calls_in(fake)
        self.assertEqual(calls[("b", "contradictions", "kimi")]["status"], "error")
        self.assertEqual(calls[("v", "contradictions", "kimi")]["status"], "done")
        claims = fake.tables.get("aci_assessment_claims", [])
        for version_id in ("v", "b"):
            self.assertFalse([c for c in claims if c["spec_version_id"] == version_id])
            self.assertFalse([key for key in calls if key[:2] == (version_id, "confirm")])
        # The run goes on with the next document, which is read as usual.
        self.assertTrue([c for c in claims if c["spec_version_id"] == "w"])
        self.assertEqual({key[2] for key in calls if key[:2] == ("w", "confirm")},
                         {"sol", "opus", "kimi"})
        self.assertEqual(run_row(fake, fresh.run_id)["status"], "done")
        self.assertIn("kimi on lab--spec@2026-06-01 gave no contradictions answer, so no claim "
                      "of them is written and nobody reads them", fresh.stdout)
        self.assertEqual(assess.gaps(fake, fresh.run_id, ["v", "b", "w"]),
                         ["lab--spec@2026-06-01: kimi gave no contradictions answer"])
        # The version where every seat answered is a gap too, named alone:
        # its claims were never written, which is not the same as none.
        self.assertEqual(assess.gaps(fake, fresh.run_id, ["v"]), [
            "lab--spec@2026-01-01: kimi gave no contradictions answer on "
            "lab--spec@2026-06-01, whose contradictions are pooled with this version's"])

    def test_a_resume_that_answers_it_writes_the_claims_and_asks_every_reading(self):
        fake, fresh = self.stopped()
        failed = dict(calls_in(fake)[("b", "contradictions", "kimi")])
        again = Versions()
        resumed = go(again, fake, documents=("v", "b", "w"), resume=fresh.run_id,
                     passages=versions_and_other)
        self.assertIsNone(resumed.raised)
        self.assertEqual([(d, q, t) for d, q, t, _user in again.asked],
                         [("b", "contradictions", "kimi")]
                         + [(d, "confirm", seat) for d in ("v", "b")
                            for seat in ("sol", "opus", "kimi")])
        call = calls_in(fake)[("b", "contradictions", "kimi")]
        self.assertEqual((call["id"], call["status"]), (failed["id"], "done"))
        self.assertEqual(len(call["attempts"]), 2)
        self.assertEqual(sorted(c["spec_version_id"] for c in fake.tables["aci_assessment_claims"]
                                if c["spec_version_id"] in ("v", "b")), ["b", "v"])
        self.assertEqual(assess.gaps(fake, fresh.run_id, ["v", "b", "w"]), [])


# kimi, asked again on the second version, finds the privacy clash sol found on
# the first, and a safety clash nobody had found. Numbered as the second
# version numbers its passages, which open with "Be brief.".
FOUND_AGAIN = ("CONTRADICTION: [3] [4] | A user asks what the operator said. | kimi's reason.\n"
               "CONTRADICTION: [4] [2] | A user asks to break a rule for safety. "
               "| Safety and privacy clash.")
ABSOLUTE = "ITEM 1: holds | absolute: yes | Absolute."
SEATS = ("sol", "opus", "kimi")


class Replaying(Versions):
    """Versions, except that kimi's finding on the second version is
    FOUND_AGAIN and every reading is ABSOLUTE. `fail` names calls,
    "<document>__<question>__<tag>", that raise the exception given instead."""

    def __init__(self, **fail):
        super().__init__()
        self.fail = {tuple(key.split("__")): value for key, value in fail.items()}

    def __call__(self, provider, model_id, system, user, kwargs):
        question, tag = QUESTION_OF[system], tag_of(model_id)
        document = "b" if "Be brief." in user else "v"
        key = (document, question, tag)
        if key in self.fail:
            self.asked.append((document, question, tag, user))
            raise self.fail[key]
        if key == ("b", "contradictions", "kimi") or question == "confirm":
            self.asked.append((document, question, tag, user))
            return (FOUND_AGAIN if question == "contradictions" else ABSOLUTE,
                    dict(USAGE), "stop", 0.5)
        return super().__call__(provider, model_id, system, user, kwargs)


def verdicts_of(fake):
    """Every verdict row written, each as sorted JSON, in sorted order."""
    return sorted(json.dumps(v, sort_keys=True) for v in fake.tables["aci_assessment_verdicts"])


def labelled_as(version_id):
    passages = {"v": PASSAGES, "b": PASSAGES_B}[version_id]
    return assessment_call.with_heading_attributes(passages, VERSION["markdown"])


class ReplayTest(unittest.TestCase):
    """A document whose claims were written and read while one of its finders
    had failed, as run e2c00b2e left two, has that finding asked again with
    --replay: what it finds is pooled with the claims already written, and
    every contradictions seat reads only the new claims, in a supplementary
    reading recorded on its reading call."""

    HEADS = {"v": DOC, "b": "lab--spec@2026-06-01"}

    def read_without_kimi_on_b(self):
        fake = FakeStore(aci_spec_versions=[dict(VERSION), dict(VERSION_B)])
        fresh = go(Versions(), fake, documents=("v", "b"), passages=three_versions)
        self.assertIsNone(fresh.raised)
        failed_after_the_readings(fake, "b", "kimi")
        return fake, fresh.run_id

    def replay(self, fake, run_id, model=None, replay=True, spend=True):
        model = model or Replaying()
        outcome = go(model, fake, documents=("v", "b"), resume=run_id, passages=three_versions,
                     replay=replay, spend=spend)
        return model, outcome

    def pair(self, version_id, first, second):
        head = self.HEADS[version_id]
        return (version_id, f"{head} > {first}", f"{head} > {second}")

    def claims(self, fake):
        return {(c["spec_version_id"], c["first_locator"], c["second_locator"]): c
                for c in fake.tables["aci_assessment_claims"]}

    def test_a_replayed_finder_that_answers_adds_its_claims_and_each_seat_reads_only_them(self):
        fake, run_id = self.read_without_kimi_on_b()
        failed = copy.deepcopy(calls_in(fake)[("b", "contradictions", "kimi")])
        confirms = {key: copy.deepcopy(row) for key, row in calls_in(fake).items()
                    if key[1] == "confirm"}
        self.assertEqual(len(confirms), 6)
        privacy = {c["spec_version_id"]: copy.deepcopy(c)
                   for c in fake.tables["aci_assessment_claims"]}
        verdicts_before = copy.deepcopy(fake.tables["aci_assessment_verdicts"])
        earlier_cost = run_row(fake, run_id)["cost_usd"]
        writes_before = len(fake.writes)

        model, replayed = self.replay(fake, run_id)
        self.assertIsNone(replayed.raised)

        # The finding is asked again in its own row, its failed attempt kept.
        call = calls_in(fake)[("b", "contradictions", "kimi")]
        self.assertEqual(call["id"], failed["id"])
        self.assertEqual((call["status"], call["model"], call["error"], call["raw_output"]),
                         ("done", "kimi", None, FOUND_AGAIN))
        self.assertEqual(call["attempts"], failed["attempts"] + [
            {"model": "kimi", "finish_reason": "stop", "cost_usd": cost("kimi"),
             "reason": None}])
        self.assertAlmostEqual(call["cost_usd"], 2 * cost("kimi"))

        # A pair already claimed keeps its row exactly as written, since a
        # claim is never updated; a new pair is a new claim on every version
        # where its two passages read the same, here both.
        claims = self.claims(fake)
        self.assertEqual(len(claims), 4)
        safety = {}
        for version_id in ("v", "b"):
            kept = claims[self.pair(version_id, "#b > ¶1", "#b > ¶2")]
            self.assertEqual(kept, privacy[version_id])
            safety[version_id] = claims[self.pair(version_id, "#a > ¶1", "#b > ¶2")]
            self.assertEqual({k: safety[version_id][k] for k in ("situation", "why", "found_by")},
                             {"situation": "A user asks to break a rule for safety.",
                              "why": "Safety and privacy clash.", "found_by": ["kimi"]})
        self.assertFalse([write for write in fake.writes[writes_before:]
                          if write[:2] == ("update", "aci_assessment_claims")])

        # Every seat reads the new claim of each version, as that version
        # numbers it, and nothing else.
        self.assertEqual([(d, q, t) for d, q, t, _user in model.asked],
                         [("b", "contradictions", "kimi")]
                         + [(d, "confirm", seat) for d in ("v", "b") for seat in SEATS])
        new = {"v": SAFETY_CLAIM, "b": dict(SAFETY_CLAIM, first=4, second=2)}
        for document, _question, _tag, user in model.asked[1:]:
            self.assertEqual(user, assessment_call.compose_confirm(labelled_as(document),
                                                                   [new[document]])[1])

        # Each reading is recorded on the seat's reading call for the version:
        # its first reading's reply kept, the supplementary one appended to its
        # attempts with the claims it answered, and its bill added.
        for (version_id, question, seat), before in confirms.items():
            row = calls_in(fake)[(version_id, question, seat)]
            for column in ("id", "status", "model", "raw_output", "finish_reason", "seconds",
                           "error"):
                self.assertEqual(row[column], before[column], (version_id, seat, column))
            self.assertEqual(row["attempts"], before["attempts"] + [
                {"model": seat, "finish_reason": "stop", "cost_usd": cost(seat), "reason": None,
                 "claim_ids": [safety[version_id]["id"]], "reply": ABSOLUTE, "seconds": 0.5}])
            self.assertAlmostEqual(row["cost_usd"], before["cost_usd"] + cost(seat))
            self.assertEqual((row["prompt_tokens"], row["completion_tokens"]),
                             (before["prompt_tokens"] + USAGE["prompt_tokens"],
                              before["completion_tokens"] + USAGE["completion_tokens"]))

        # Verdicts are written for the new claims only.
        verdicts = fake.tables["aci_assessment_verdicts"]
        self.assertEqual(verdicts[:len(verdicts_before)], verdicts_before)
        added = verdicts[len(verdicts_before):]
        version_of = {row["id"]: version_id for version_id, row in safety.items()}
        self.assertEqual(sorted((v["claim_id"], v["seat"]) for v in added),
                         sorted((safety[d]["id"], seat) for d in ("v", "b") for seat in SEATS))
        for verdict in added:
            reader = calls_in(fake)[(version_of[verdict["claim_id"]], "confirm", verdict["seat"])]
            self.assertEqual(
                (verdict["call_id"], verdict["holds"], verdict["absolute"], verdict["reason"]),
                (reader["id"], True, True, "Absolute."))

        # The run says it was replayed, and how; it closes with its whole bill
        # and nothing left to assess.
        row = run_row(fake, run_id)
        self.assertEqual(row["status"], "done")
        self.assertEqual(row["config"]["substitutes"], CONFIG["substitutes"])
        [record] = row["config"]["replays"]
        self.assertEqual(sorted(record),
                         ["also_found", "at", "by", "calls", "groups", "note", "outcomes"])
        self.assertEqual((record["by"], record["groups"], record["calls"]),
                         ("tester", ["lab--spec"], [failed["id"]]))
        self.assertTrue(record["at"])
        self.assertEqual(record["outcomes"], {"lab--spec": "answered"})
        # kimi found again the pair sol had found, carried to both versions:
        # that is said here, the claims' rows being never updated.
        self.assertEqual(record["also_found"], [
            {"seat": "kimi", "version_id": version_id, "claim_id": privacy[version_id]["id"]}
            for version_id in ("v", "b")])
        self.assertIn("lab--spec: answered", record["note"])
        self.assertIn("not exactly what a fresh run would give", record["note"])
        for dash in ("\u2014", "\u2013", " -- "):
            self.assertNotIn(dash, record["note"])
        # Who found a claim is its found_by and what the replays add to it.
        on_v = {tuple(p["locator"] for p in claim["passages"]): claim["readings"]
                for claim in payload(fake, run_id, "v", PASSAGES)["contradictions"]["claims"]}
        self.assertEqual([r["found"] for r in on_v[(PASSAGES[1][0], PASSAGES[2][0])]],
                         [True, False, True])
        self.assertEqual([r["found"] for r in on_v[(PASSAGES[0][0], PASSAGES[2][0])]],
                         [False, False, True])
        self.assertAlmostEqual(row["cost_usd"], earlier_cost + cost("kimi")
                               + 2 * sum(cost(seat) for seat in SEATS), places=6)
        self.assertEqual(assess.gaps(fake, run_id, ["v", "b"]), [])
        self.assertIn("Replaying lab--spec@2026-01-01, lab--spec@2026-06-01", replayed.stdout)

    def test_a_replayed_finder_that_fails_again_writes_nothing_after_its_own_row(self):
        fake, run_id = self.read_without_kimi_on_b()
        kept = copy.deepcopy({table: fake.tables[table] for table in (
            "aci_assessment_claims", "aci_assessment_verdicts")})
        writes_before = len(fake.writes)
        model, replayed = self.replay(fake, run_id, Replaying(
            b__contradictions__kimi=RuntimeError("provider refused the input")))
        self.assertIsNone(replayed.raised)
        self.assertEqual([(d, q, t) for d, q, t, _user in model.asked],
                         [("b", "contradictions", "kimi")])
        call = calls_in(fake)[("b", "contradictions", "kimi")]
        self.assertEqual((call["status"], len(call["attempts"])), ("error", 2))
        writes = fake.writes[writes_before:]
        last = max(n for n, write in enumerate(writes)
                   if write[:3] == ("update", "aci_assessment_calls", {"id": call["id"]}))
        # After its own row, only the run row: how the replay ended, then its close.
        after = writes[last + 1:]
        self.assertEqual([write[1] for write in after], ["aci_assessment_runs"] * 2)
        self.assertEqual(list(after[0][3]), ["config"])
        self.assertEqual(after[1][3]["status"], "done")
        self.assertEqual({table: fake.tables[table] for table in kept}, kept)
        # The record says it was asked again and failed again, and the gap stays.
        [record] = run_row(fake, run_id)["config"]["replays"]
        self.assertEqual(record["calls"], [call["id"]])
        self.assertEqual((record["outcomes"], record["also_found"]),
                         ({"lab--spec": "failed again"}, []))
        self.assertIn("lab--spec: failed again", record["note"])
        self.assertEqual(assess.gaps(fake, run_id, ["v", "b"]),
                         ["lab--spec@2026-06-01: kimi gave no contradictions answer"])
        self.assertIn("nothing more is asked or written for them", replayed.stdout)

    def test_a_later_resume_rebuilds_each_reading_from_where_it_is_stored(self):
        fake, run_id = self.read_without_kimi_on_b()
        self.replay(fake, run_id)
        given = verdicts_of(fake)
        fake.tables["aci_assessment_verdicts"] = []
        silent = Replaying()
        resumed = go(silent, fake, documents=("v", "b"), resume=run_id, passages=three_versions)
        self.assertIsNone(resumed.raised)
        self.assertEqual(silent.asked, [], "no model is asked")
        self.assertEqual(verdicts_of(fake), given)
        self.assertEqual(assess.gaps(fake, run_id, ["v", "b"]), [])

    def test_a_replay_stopped_in_its_readings_is_finished_by_a_resume(self):
        fake, run_id = self.read_without_kimi_on_b()
        _model, stopped = self.replay(fake, run_id, Replaying(b__confirm__kimi=cut()))
        self.assertIsInstance(stopped.raised, seat_call.Unreachable)
        self.assertIn(f"--resume={run_id} --replay --documents=v,b --go", stopped.stderr)
        # The finding answered and is done, so nothing needs replaying any more:
        # a resume asks the one reading that is missing.
        again = Replaying()
        resumed = go(again, fake, documents=("v", "b"), resume=run_id, passages=three_versions)
        self.assertIsNone(resumed.raised)
        self.assertEqual([(d, q, t) for d, q, t, _user in again.asked], [("b", "confirm", "kimi")])
        self.assertEqual(again.asked[0][3], assessment_call.compose_confirm(
            labelled_as("b"), [dict(SAFETY_CLAIM, first=4, second=2)])[1])
        row = calls_in(fake)[("b", "confirm", "kimi")]
        self.assertEqual(len([a for a in row["attempts"] if "claim_ids" in a]), 1)
        self.assertEqual(len(fake.tables["aci_assessment_verdicts"]), 4 * 3)
        self.assertEqual(assess.gaps(fake, run_id, ["v", "b"]), [])

    def test_a_replay_stopped_before_its_finding_answered_says_it_was_not_asked(self):
        fake, run_id = self.read_without_kimi_on_b()
        _model, stopped = self.replay(fake, run_id, Replaying(b__contradictions__kimi=cut()))
        self.assertIsInstance(stopped.raised, seat_call.Unreachable)
        [record] = run_row(fake, run_id)["config"]["replays"]
        self.assertEqual(record["outcomes"], {"lab--spec": "not asked"})
        self.assertIn("lab--spec: not asked", record["note"])

    def test_a_document_with_two_failed_findings_stops_at_the_first_that_fails_again(self):
        fake = FakeStore(aci_spec_versions=[dict(VERSION), dict(VERSION_B)])
        fresh = go(Versions(), fake, documents=("v", "b"), passages=three_versions)
        self.assertIsNone(fresh.raised)
        opus = failed_after_the_readings(fake, "v", "opus")
        kimi = copy.deepcopy(failed_after_the_readings(fake, "b", "kimi"))
        refused = RuntimeError("provider refused the input")
        model, replayed = self.replay(fake, fresh.run_id, Replaying(
            v__contradictions__opus=refused, v__contradictions__glm=refused))
        self.assertIsNone(replayed.raised)
        self.assertEqual([(d, q, t) for d, q, t, _user in model.asked],
                         [("v", "contradictions", "opus"), ("v", "contradictions", "glm")])
        self.assertEqual(calls_in(fake)[("b", "contradictions", "kimi")], kimi,
                         "the second failed finding is not asked")
        self.assertIn("kimi on lab--spec@2026-06-01 is not asked", replayed.stdout)
        [record] = run_row(fake, fresh.run_id)["config"]["replays"]
        self.assertEqual((record["calls"], record["outcomes"]),
                         ([opus["id"]], {"lab--spec": "failed again"}))

    def refused_replay(self, fake, run_id):
        """A replay of run `run_id` that must be refused before anything is
        asked or written, priced and with --go: what each printed."""
        said = []
        for spend in (False, True):
            writes_before = len(fake.writes)
            model, outcome = self.replay(fake, run_id, spend=spend)
            self.assertIsNone(outcome.raised)
            self.assertEqual(model.asked, [], "a refused replay asked a model")
            self.assertFalse([write for write in fake.writes[writes_before:]
                              if write[1] != "aci_assessment_runs"],
                             "only the run row is reopened and closed")
            self.assertNotIn("replays", run_row(fake, run_id)["config"])
            self.assertIn("are left as they are", outcome.stdout)
            said.append(outcome.stdout)
        return said

    def test_a_replay_whose_claims_the_findings_no_longer_give_is_refused(self):
        fake, run_id = self.read_without_kimi_on_b()
        # The claim sol's finding gives on the first version is gone.
        gone = next(c for c in fake.tables["aci_assessment_claims"] if c["spec_version_id"] == "v")
        fake.tables["aci_assessment_claims"].remove(gone)
        fake.tables["aci_assessment_verdicts"] = [
            v for v in fake.tables["aci_assessment_verdicts"] if v["claim_id"] != gone["id"]]
        for printed in self.refused_replay(fake, run_id):
            self.assertIn(f"on {DOC}, the findings pool 1 claim and 0 are written", printed)
            self.assertIn(f"{PASSAGES[1][0]} and {PASSAGES[2][0]} is pooled and not written",
                          printed)

    def test_a_replay_whose_first_reading_no_longer_reads_as_stored_is_refused(self):
        fake, run_id = self.read_without_kimi_on_b()
        claim = next(c for c in fake.tables["aci_assessment_claims"] if c["spec_version_id"] == "b")
        stored = next(v for v in fake.tables["aci_assessment_verdicts"]
                      if (v["claim_id"], v["seat"]) == (claim["id"], "opus"))
        stored["holds"] = False
        for printed in self.refused_replay(fake, run_id):
            self.assertIn("on lab--spec@2026-06-01, opus's first reading, read against that "
                          "pool, gives 1 verdict unlike the one stored", printed)
            self.assertIn(f"{claim['first_locator']} and {claim['second_locator']}", printed)

    def test_the_first_pool_is_checked_again_before_the_first_paid_call(self):
        fake, run_id = self.read_without_kimi_on_b()
        documents = assess.load_documents(fake, ["v", "b"], three_versions)
        _run, rows = assess.index_store.assessment_run_rows(fake, run_id, ["v", "b"])
        rows = copy.deepcopy(rows)
        rows["b"]["verdicts"][0]["reason"] = "Not what it said."
        model = Replaying()
        taking = assessment_store.Assessment(fake, CONFIG, CONFIG["assessment"], model,
                                             run=assess.resumable(fake, run_id), existing=rows,
                                             replay=True)
        writes_before = len(fake.writes)
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as refused:
            taking.group(documents)
        self.assertIn("on lab--spec@2026-06-01", str(refused.exception))
        self.assertEqual(model.asked, [])
        self.assertEqual(len(fake.writes), writes_before)

    def test_a_replay_is_priced_first_and_spends_nothing_without_go(self):
        fake, run_id = self.read_without_kimi_on_b()
        writes_before = len(fake.writes)
        model, priced = self.replay(fake, run_id, spend=False)
        self.assertIsNone(priced.raised)
        self.assertEqual(len(fake.writes), writes_before, "a price writes nothing")
        self.assertEqual(model.asked, [])
        # kimi's finding at its allowance, and a reading per seat of each
        # version priced as a reading whose claims are not known yet.
        want = ceiling = 0.0
        for version_id in ("v", "b"):
            labelled = labelled_as(version_id)
            calls = [("confirm", seat, None) for seat in SEATS]
            if version_id == "b":
                system, user = assessment_call.compose("contradictions", labelled)
                want += seat_call.priced("kimi", system, user, 8000, CONFIG)
                calls.append(("contradictions", "kimi", None))
            system, user = assessment_call.compose_confirm(labelled, [])
            want += sum(seat_call.priced(seat, system, user + "x" * 3000, 1500, CONFIG)
                        for seat in SEATS)
            ceiling += assess.ceiling_calls(labelled, calls, CONFIG)
        self.assertEqual(priced.estimate, round(want, 2))
        self.assertIn(f"Priced at about {round(want, 2)} dollars", priced.stdout)
        self.assertIn(f"ceiling of {round(ceiling, 2)} dollars", priced.stdout)
        self.assertIn("Replaying lab--spec@2026-01-01, lab--spec@2026-06-01: kimi on "
                      "lab--spec@2026-06-01", priced.stdout)
        self.assertNotIn("replays", run_row(fake, run_id)["config"])

    def test_a_run_with_no_document_to_replay_is_taken_up_as_a_resume_takes_it(self):
        base = two_documents()
        _stopped, run_id = cut_during_the_second_documents_contradictions(base)
        taken = []
        for replay in (False, True):
            fake = copy.deepcopy(base)
            ids = (f"id-{n}" for n in itertools.count())
            with mock.patch.object(assessment_store.uuid, "uuid4", lambda: next(ids)), \
                    mock.patch.object(assessment_store, "now",
                                      lambda: "2026-09-22T12:00:00+00:00"):
                model = Scripted()
                outcome = go(model, fake, resume=run_id, replay=replay)
            self.assertIsNone(outcome.raised)
            taken.append((model.asked_in, fake.writes, fake.tables, outcome.stdout))
        self.assertEqual(taken[0], taken[1])
        self.assertNotIn("replays", run_row(fake, run_id)["config"])

    def test_a_version_the_run_never_began_cannot_be_replayed(self):
        # The run assessed v alone; b, named now, has no call to ask again.
        fake = FakeStore(aci_spec_versions=[dict(VERSION), dict(VERSION_B)])
        fresh = go(Versions(), fake, documents=("v",), passages=three_versions)
        model, outcome = self.replay(fake, fresh.run_id)
        self.assertIsNone(outcome.raised)
        self.assertEqual(model.asked, [])
        self.assertIn("are left as they are", outcome.stdout)
        self.assertIn("never asked on lab--spec@2026-06-01", outcome.stdout)
        self.assertNotIn("replays", run_row(fake, fresh.run_id)["config"])

    def test_replay_is_given_with_resume_only(self):
        with mock.patch.object(assess, "Store", type("S", (), {"from_env": staticmethod(
                    mock.Mock(side_effect=AssertionError("the store was opened")))})), \
                self.assertRaises(SystemExit) as refused:
            assess.main(["--documents=v,b", "--replay", "--go"])
        self.assertIn("--replay", str(refused.exception))
        self.assertIn("--resume=", str(refused.exception))
        fake = store()
        with self.assertRaises(SystemExit):
            assess.assess(fake, CONFIG, ["v"], passages_for, call_model=Scripted(), go=True,
                          replay=True)
        self.assertEqual(fake.writes, [])

    def test_the_command_replays_a_run_named_with_resume(self):
        fake, run_id = self.read_without_kimi_on_b()
        with mock.patch.object(assess, "Store", type("S", (), {"from_env": staticmethod(
                    lambda **_kwargs: fake)})), \
                mock.patch.object(assess.index_store, "install_registry", lambda s: None), \
                mock.patch.object(assess.h, "passages", three_versions), \
                mock.patch.object(assess.batch_job, "call_openrouter", Replaying()), \
                mock.patch.dict(os.environ, {"USER": "someone"}), \
                contextlib.redirect_stdout(io.StringIO()) as printed, \
                contextlib.redirect_stderr(io.StringIO()):
            code = assess.main(["--documents=v,b", f"--resume={run_id}", "--replay", "--go"])
        self.assertEqual(code, 0, printed.getvalue())
        [record] = run_row(fake, run_id)["config"]["replays"]
        self.assertEqual(record["by"], "someone")


# glm, in opus's seat, finds a clash nobody had found, and kimi's safety clash
# in its own words.
GLM_FOUND = ("CONTRADICTION: [1] [2] | A user asks for a lie that keeps someone safe. "
             "| Safety and honesty clash.\n"
             "CONTRADICTION: [1] [3] | glm's situation. | glm's reason.")
NEW_CLAIM = {"first": 1, "second": 2, "situation": "A user asks for a lie that keeps someone safe.",
             "why": "Safety and honesty clash."}
LOCATORS = [locator for locator, _section, _text in PASSAGES]


class ReplayInTheMiddleSeatTest(unittest.TestCase):
    """opus's seat on one version, as on the Alibaba Model Spec in run e2c00b2e:
    opus was refused and glm, its substitute, ran out of length, after the
    claims sol and kimi found were written and read. Asked again, glm answers
    in the seat between theirs, so a pool of every finding would order the
    claims otherwise than the first reading read them, and would word one of
    them otherwise."""

    def read_without_opus(self):
        fake = store()
        fresh = go(Scripted(contradictions__opus=(NONE_FOUND, "stop")), fake, documents=("v",))
        self.assertIsNone(fresh.raised)
        failed_after_the_readings(fake, "v", "opus", attempts=[
            {"model": "opus", "finish_reason": "content_filter", "cost_usd": cost("opus"),
             "reason": "finish_reason=content_filter"},
            {"model": "glm", "finish_reason": "length", "cost_usd": cost("glm"),
             "reason": "empty reply, finish_reason=length"}])
        return fake, fresh.run_id

    def replay(self, fake, run_id):
        model = Scripted(contradictions__opus=("", "content_filter"),
                         contradictions__glm=(GLM_FOUND, "stop"),
                         confirm__opus=("", "content_filter"),
                         **{f"confirm__{tag}": (ABSOLUTE, "stop")
                            for tag in ("sol", "glm", "kimi")})
        outcome = go(model, fake, documents=("v",), resume=run_id, replay=True)
        self.assertIsNone(outcome.raised)
        return model

    def payload(self, fake, run_id):
        return payload(fake, run_id, "v", PASSAGES)

    def test_the_claims_it_shares_keep_their_rows_and_the_new_one_is_read_alone(self):
        fake, run_id = self.read_without_opus()
        before = {(c["first_locator"], c["second_locator"]): copy.deepcopy(c)
                  for c in fake.tables["aci_assessment_claims"]}
        model = self.replay(fake, run_id)
        self.assertEqual(model.asked_in, [
            ("v", "contradictions", "opus"), ("v", "contradictions", "glm"),
            ("v", "confirm", "sol"), ("v", "confirm", "opus"), ("v", "confirm", "glm"),
            ("v", "confirm", "kimi")])
        # The seat's usual candidates, in order: opus, refused again, then glm.
        call = calls_in(fake)[("v", "contradictions", "opus")]
        self.assertEqual((call["status"], call["model"]), ("done", "glm"))
        self.assertEqual([a["model"] for a in call["attempts"]], ["opus", "glm", "opus", "glm"])
        claims = {(c["first_locator"], c["second_locator"]): c
                  for c in fake.tables["aci_assessment_claims"]}
        self.assertEqual(len(claims), 3)
        privacy, safety = (LOCATORS[1], LOCATORS[2]), (LOCATORS[0], LOCATORS[2])
        self.assertEqual(claims[privacy], before[privacy], "glm did not find it")
        # glm's words would come first in a pool of every finding; kimi's stay,
        # and the row is not updated: the replay record says opus found it.
        self.assertEqual(claims[safety], before[safety])
        [record] = run_row(fake, run_id)["config"]["replays"]
        self.assertEqual(record["also_found"], [
            {"seat": "opus", "version_id": "v", "claim_id": claims[safety]["id"]}])
        new = claims[(LOCATORS[0], LOCATORS[1])]
        self.assertEqual({k: new[k] for k in ("situation", "why", "found_by")},
                         {"situation": NEW_CLAIM["situation"], "why": NEW_CLAIM["why"],
                          "found_by": ["opus"]})
        labelled = assessment_call.with_heading_attributes(PASSAGES, VERSION["markdown"])
        self.assertEqual([user for question, _tag, user in model.asked if question == "confirm"],
                         [assessment_call.compose_confirm(labelled, [NEW_CLAIM])[1]] * 4)
        # In the reading, opus is refused, and glm, which sits in no other seat
        # of it, reads in its place; the row still names its first reading's model.
        row = calls_in(fake)[("v", "confirm", "opus")]
        self.assertEqual(row["model"], "opus")
        self.assertEqual(row["attempts"][-2:], [
            {"model": "opus", "finish_reason": "content_filter", "cost_usd": cost("opus"),
             "reason": "finish_reason=content_filter", "claim_ids": [new["id"]]},
            {"model": "glm", "finish_reason": "stop", "cost_usd": cost("glm"), "reason": None,
             "claim_ids": [new["id"]], "reply": ABSOLUTE, "seconds": 0.5}])
        self.assertEqual(assess.gaps(fake, run_id, ["v"]), [])

    def test_a_later_resume_reads_the_first_reading_and_the_second_apart(self):
        fake, run_id = self.read_without_opus()
        self.replay(fake, run_id)
        given = verdicts_of(fake)
        self.assertEqual(len(given), 3 * 3)
        fake.tables["aci_assessment_verdicts"] = []
        silent = Scripted()
        resumed = go(silent, fake, documents=("v",), resume=run_id)
        self.assertIsNone(resumed.raised)
        self.assertEqual(silent.asked, [], "no model is asked")
        self.assertEqual(verdicts_of(fake), given)

    def test_the_settling_rule_and_the_score_read_the_new_readings_with_the_old(self):
        fake, run_id = self.read_without_opus()
        before = self.payload(fake, run_id)
        self.replay(fake, run_id)
        after = self.payload(fake, run_id)
        self.assertEqual(before["contradictions"]["score"], 2)
        claims = {tuple(p["locator"] for p in claim["passages"]): claim
                  for claim in after["contradictions"]["claims"]}
        privacy, safety, new = ((LOCATORS[1], LOCATORS[2]), (LOCATORS[0], LOCATORS[2]),
                                (LOCATORS[0], LOCATORS[1]))
        # The first reading held the privacy clash and rejected the safety one;
        # the supplementary reading held the new clash, absolute: two confirmed,
        # one of them absolute.
        self.assertEqual({pair: (claims[pair]["confirmed"], claims[pair]["absolute"])
                          for pair in claims},
                         {privacy: (True, False), safety: (False, False), new: (True, True)})
        self.assertEqual(after["contradictions"]["score"], 0)
        # Each reading names the model that gave it.
        self.assertEqual([r.get("model") for r in claims[new]["readings"]], [None, "glm", None])
        self.assertEqual([r.get("model") for r in claims[privacy]["readings"]], [None] * 3)
        self.assertEqual([r["found"] for r in claims[safety]["readings"]], [False, True, True])
        # The criteria are what they were, so the total moves with the score.
        self.assertEqual(after["criteria"], before["criteria"])
        self.assertAlmostEqual(after["total"], before["total"] - 2, places=6)


def build_site_data():
    import build_site_data as bs  # noqa: E402
    return bs


def payload(fake, run_id, version_id, passages):
    """One version's assessment as the payload carries it, from what run
    `run_id` wrote."""
    run, rows = assess.index_store.assessment_rows(fake, run_id, [version_id])
    rows = rows[version_id]
    return build_site_data().document_assessment(
        run, rows["calls"], rows["scores"], rows["claims"], rows["verdicts"],
        {locator: text for locator, _section, text in passages})


def run_row(fake, run_id):
    return next(row for row in fake.tables["aci_assessment_runs"] if row["id"] == run_id)


class CriteriaFromTest(unittest.TestCase):
    """A run that takes its criteria from an earlier run asks only the
    contradictions and their reading, so the depths given against the earlier
    run stand."""

    def earlier(self, documents=("v", "w"), model=None):
        fake = two_documents()
        fresh = go(model or Scripted(), fake, documents=documents)
        self.assertIsNone(fresh.raised)
        return fake, fresh.run_id

    def test_a_run_that_takes_its_criteria_asks_no_criteria_call(self):
        fake, earlier_id = self.earlier()
        model = Scripted()
        taken = go(model, fake, criteria_from=earlier_id)
        self.assertIsNone(taken.raised)
        self.assertEqual(model.asked_in, [
            (document, question, seat) for document in ("v", "w")
            for question in ("contradictions", "confirm") for seat in ("sol", "opus", "kimi")])
        self.assertFalse([call for call in fake.tables["aci_assessment_calls"]
                          if call["run_id"] == taken.run_id and call["question"] == "criteria"])
        earlier, row = run_row(fake, earlier_id), run_row(fake, taken.run_id)
        self.assertEqual(row["config"], {"substitutes": CONFIG["substitutes"],
                                         "criteria_from": earlier_id})
        self.assertEqual(row["panels"], {"criteria": earlier["panels"]["criteria"],
                                         "contradictions": ["sol", "opus", "kimi"]})
        self.assertEqual(row["prompts"], {
            "criteria": earlier["prompts"]["criteria"],
            "contradictions": assessment_call.prompt_sha256("contradictions"),
            "confirm": assessment_call.prompt_sha256("confirm")})
        self.assertEqual(row["status"], "done")
        # It stands, on the earlier run's criteria and its own contradictions.
        self.assertEqual(assess.gaps(fake, taken.run_id, ["v", "w"]), [])

    def test_it_is_priced_on_the_finding_and_the_reading_only(self):
        fake, earlier_id = self.earlier()
        priced = go(Scripted(), fake, criteria_from=earlier_id, spend=False)
        self.assertIsNone(priced.raised)
        panels = CONFIG["assessment"]
        want = ceiling = 0.0
        for passages, version in ((PASSAGES, VERSION), (PASSAGES2, VERSION2)):
            labelled = assessment_call.with_heading_attributes(passages, version["markdown"])
            want += assessment_run.price_document(labelled, panels, CONFIG, criteria=False)
            ceiling += assess.ceiling_document(labelled, panels, CONFIG, criteria=False)
        self.assertEqual(priced.estimate, round(want, 2))
        self.assertIn(f"ceiling of {round(ceiling, 2)} dollars", priced.stdout)
        self.assertIn(f"the criteria are taken from assessment run {earlier_id} and not "
                      "asked again", priced.stdout)

    def test_it_is_resumed_without_the_criteria_too(self):
        fake, earlier_id = self.earlier()
        stopped = go(Scripted(w__contradictions__opus=("", "content_filter"),
                              w__contradictions__glm=cut()), fake, criteria_from=earlier_id)
        self.assertIsInstance(stopped.raised, seat_call.Unreachable)
        [taken] = [row for row in fake.tables["aci_assessment_runs"] if row["id"] != earlier_id]
        self.assertEqual(taken["status"], "error")
        again = Scripted()
        resumed = go(again, fake, resume=taken["id"])
        self.assertIsNone(resumed.raised)
        self.assertEqual(resumed.run_id, taken["id"])
        self.assertNotIn("criteria", {question for _d, question, _t in again.asked_in})
        self.assertEqual(again.asked_in[0], ("w", "contradictions", "opus"))
        self.assertEqual(assess.gaps(fake, taken["id"], ["v", "w"]), [])

    def refused(self, fake, criteria_from, documents=("v", "w")):
        writes_before = len(fake.writes)
        model = Scripted()
        outcome = go(model, fake, documents=documents, criteria_from=criteria_from)
        self.assertIsInstance(outcome.raised, SystemExit)
        self.assertEqual(len(fake.writes), writes_before, "a refused run wrote something")
        self.assertEqual(model.asked, [], "a refused run asked a model")
        self.assertNotIn("Priced at about", outcome.stdout)
        return str(outcome.raised)

    def test_an_earlier_criteria_panel_unlike_today_s_is_refused_naming_both(self):
        fake, earlier_id = self.earlier()
        run_row(fake, earlier_id)["panels"]["criteria"] = ["sol", "fable", "glm"]
        message = self.refused(fake, earlier_id)
        self.assertIn(earlier_id, message)
        self.assertIn('["sol", "fable", "glm"]', message)
        self.assertIn('["sol", "fable", "deepseek"]', message)

    def test_an_earlier_criteria_prompt_unlike_today_s_is_refused_naming_both(self):
        fake, earlier_id = self.earlier()
        run_row(fake, earlier_id)["prompts"]["criteria"] = "0" * 64
        message = self.refused(fake, earlier_id)
        self.assertIn("0" * 64, message)
        self.assertIn(assessment_call.prompt_sha256("criteria"), message)

    def test_the_earlier_run_s_contradictions_are_not_what_is_taken(self):
        # The run the depths were given against found its contradictions by
        # the first method, under other seats and prompts.
        fake, earlier_id = self.earlier()
        earlier = run_row(fake, earlier_id)
        earlier["panels"]["contradictions"] = ["sol", "fable", "kimi"]
        earlier["prompts"].update(contradictions="1" * 64, confirm="2" * 64)
        taken = go(Scripted(), fake, criteria_from=earlier_id)
        self.assertIsNone(taken.raised)

    def test_an_earlier_run_that_is_not_done_is_refused(self):
        for status in ("error", "running"):
            with self.subTest(status=status):
                fake, earlier_id = self.earlier()
                run_row(fake, earlier_id)["status"] = status
                message = self.refused(fake, earlier_id)
                self.assertIn(earlier_id, message)
                self.assertIn(f"its status is {status}, not done", message)

    def test_an_earlier_run_that_did_not_assess_a_document_given_is_refused_naming_it(self):
        fake, earlier_id = self.earlier(documents=("v",))
        message = self.refused(fake, earlier_id)
        self.assertIn(f"{DOC2}: the assessment run did not assess it", message)
        self.assertNotIn(f"{DOC}:", message)

    def test_an_earlier_run_whose_criteria_have_a_gap_is_refused_naming_it(self):
        partial = ("CONFLICT_RULES: 3\nCONFLICT_RULES_PASSAGES: none\n"
                   "RULE_FORCE: 2\nREASONS: 2\nREASONS_RATIONALE: Some.")
        fake, earlier_id = self.earlier(model=Scripted(w__criteria__deepseek=(partial, "stop")))
        message = self.refused(fake, earlier_id)
        self.assertIn(f"{DOC2}: deepseek's criteria answer scored no situations", message)
        self.assertNotIn(f"{DOC}:", message)

    def test_an_unknown_run_is_refused_naming_it(self):
        fake, _earlier_id = self.earlier()
        unknown = "00000000-0000-4000-8000-000000000000"
        message = self.refused(fake, unknown)
        self.assertIn(f"--criteria-from={unknown} names no assessment run", message)

    def test_a_run_that_takes_its_criteria_from_elsewhere_is_refused_naming_where(self):
        fake, earlier_id = self.earlier()
        taken = go(Scripted(), fake, criteria_from=earlier_id)
        message = self.refused(fake, taken.run_id)
        self.assertIn(f"--criteria-from={earlier_id}", message)

    def main(self, argv, fake):
        with mock.patch.object(assess, "Store", type("S", (), {"from_env": staticmethod(
                    lambda **_kwargs: fake)})), \
                mock.patch.object(assess.index_store, "install_registry", lambda s: None), \
                mock.patch.object(assess.h, "passages", both_passages), \
                mock.patch.object(assess.batch_job, "call_openrouter", Scripted()), \
                contextlib.redirect_stdout(io.StringIO()) as out, \
                contextlib.redirect_stderr(io.StringIO()):
            return assess.main(argv), out.getvalue()

    def test_the_command_takes_the_earlier_run_by_its_full_id(self):
        fake, earlier_id = self.earlier()
        code, printed = self.main(["--documents=v,w", f"--criteria-from={earlier_id}",
                                   "--go"], fake)
        self.assertEqual(code, 0)
        [taken] = [row for row in fake.tables["aci_assessment_runs"] if row["id"] != earlier_id]
        self.assertEqual(taken["config"]["criteria_from"], earlier_id)
        self.assertIn(taken["id"], printed)

    def test_a_short_id_is_refused_before_the_store_is_opened(self):
        _fake, earlier_id = self.earlier()
        with mock.patch.object(assess, "Store", type("S", (), {"from_env": staticmethod(
                    mock.Mock(side_effect=AssertionError("the store was opened")))})), \
                self.assertRaises(SystemExit) as refused:
            assess.main(["--documents=v,w", f"--criteria-from={earlier_id[:8]}", "--go"])
        self.assertIn(f"--criteria-from={earlier_id[:8]}", str(refused.exception))
        self.assertIn("uuid", str(refused.exception))

    def test_it_is_not_given_with_resume(self):
        fake, earlier_id = self.earlier()
        with mock.patch.object(assess, "Store", type("S", (), {"from_env": staticmethod(
                    mock.Mock(side_effect=AssertionError("the store was opened")))})), \
                contextlib.redirect_stderr(io.StringIO()) as err, \
                self.assertRaises(SystemExit):
            assess.main(["--documents=v,w", f"--criteria-from={earlier_id}",
                         f"--resume={earlier_id}", "--go"])
        self.assertIn("--criteria-from", err.getvalue())


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
        # contradictions call ended in error; the claims sol and opus found
        # were written, and read by every seat, kimi included, as run
        # e2c00b2e was left.
        fake = two_documents()
        fresh = go(Scripted(w__contradictions__kimi=(NONE_FOUND, "stop")), fake)
        failed_after_the_readings(fake, "w", "kimi", attempts=[
            {"model": "kimi", "finish_reason": None, "cost_usd": None,
             "reason": "provider refused the input"}])
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
        self.assertNotIn(f"--resume={fresh.run_id} --documents",
                         printed.split("gave no contradictions")[-1],
                         "a gap only a new run or a replay can fix is not sent back to a "
                         "plain --resume")
        self.assertIn(f"--resume={fresh.run_id} --replay --documents=v,w --go",
                      printed.split("gave no contradictions")[-1])
        new_writes = fake.writes[writes_before:]
        self.assertFalse([w for w in new_writes if w[1] != "aci_assessment_runs"],
                         "only the run row is reopened and closed")


if __name__ == "__main__":
    unittest.main()
