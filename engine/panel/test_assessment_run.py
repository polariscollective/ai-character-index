"""The assessment of a document as a whole, as pure functions: calling a seat
with its substitutes, pooling and confirming the contradictions, and the
general conflict rules. Nothing touches a network, a store or a file."""
import contextlib
import io
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

import httpx
import openai

HERE = Path(__file__).resolve().parent
# Keys stay out of it: resolve() reads a .env beside the harness unless told not to.
os.environ["PANEL_DOTENV"] = str(HERE.parent.parent / "no-such.env")
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import assessment_call           # noqa: E402
import assessment_run            # noqa: E402
import batch_job                 # noqa: E402
import seat_call                 # noqa: E402

DOC = "lab--spec@2026-01-01"
PASSAGES = [(f"{DOC} > #a > ¶1", "A", "In a conflict, safety comes first."),
            (f"{DOC} > #b > ¶1", "B", "Never lie."),
            (f"{DOC} > #b > ¶2", "B", "Keep the operator's instructions private.")]
USAGE = {"prompt_tokens": 1000, "completion_tokens": 100}


def tag_of(model_id):
    return next((t for t in ("deepseek", "fable", "glm", "opus", "kimi", "sol")
                 if t in model_id.lower()), model_id)


class Scripted:
    """{tag: (reply, finish_reason)} or {tag: exception}, a KeyboardInterrupt or
    a SystemExit included; a tag not scripted answers "an answer" with
    finish_reason stop."""

    def __init__(self, **script):
        self.script = script
        self.asked = []

    def __call__(self, provider, model_id, system, user, kwargs):
        tag = tag_of(model_id)
        self.asked.append(tag)
        scripted = self.script.get(tag, ("an answer", "stop"))
        if isinstance(scripted, BaseException):
            raise scripted
        reply, finish_reason = scripted
        return reply, dict(USAGE), finish_reason, 0.5


class AskWithSubstitutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = seat_call.h.load_config()

    def ask(self, seat, model, seated=()):
        return assessment_run.ask_with_substitutes(seat, "system", "user", self.config, model,
                                                   "frontier_fast", seated=seated)

    def test_the_seat_s_own_model_answers(self):
        tag, answer, substituted, refused = self.ask("fable", Scripted())
        self.assertEqual(tag, "fable")
        self.assertEqual(answer["reply"], "an answer")
        self.assertEqual((substituted, refused), ([], []))

    def test_a_content_filtered_reply_falls_to_the_next_declared_substitute(self):
        model = Scripted(fable=("partial", "content_filter"))
        tag, answer, substituted, refused = self.ask("fable", model)
        self.assertEqual(tag, "opus")
        self.assertEqual(answer["reply"], "an answer")
        self.assertEqual(len(substituted), 1)
        self.assertEqual(substituted[0]["model"], "fable")
        self.assertEqual(substituted[0]["reason"], "finish_reason=content_filter")
        self.assertEqual(substituted[0]["finish_reason"], "content_filter")
        self.assertGreater(substituted[0]["cost_usd"], 0)
        self.assertIsNotNone(substituted[0]["model_id"])
        self.assertEqual(refused, [("fable", "partial")])
        # A refused attempt is billed, so its tokens are known too, the same
        # way its cost is.
        self.assertEqual(substituted[0]["prompt_tokens"], USAGE["prompt_tokens"])
        self.assertEqual(substituted[0]["completion_tokens"], USAGE["completion_tokens"])

    def test_an_empty_reply_and_a_raised_call_are_refusals_too(self):
        model = Scripted(fable=("  ", "stop"), opus=RuntimeError("401 Unauthorized"))
        tag, _answer, substituted, refused = self.ask("fable", model)
        self.assertEqual(tag, "kimi")
        self.assertEqual(substituted[0]["reason"], "empty reply, finish_reason=stop")
        self.assertEqual(substituted[1], {"model": "opus", "reason": "401 Unauthorized",
                                          "cost_usd": None, "finish_reason": None,
                                          "model_id": None, "prompt_tokens": None,
                                          "completion_tokens": None})
        # A whitespace reply is still text, and kept; a raised call has none.
        self.assertEqual(refused, [("fable", "  ")])

    def test_every_candidate_refusing_answers_nothing(self):
        model = Scripted(fable=("", "content_filter"), opus=("", "content_filter"),
                         kimi=("", "content_filter"), glm=("", "content_filter"))
        tag, answer, substituted, refused = self.ask("fable", model)
        self.assertIsNone(tag)
        self.assertIsNone(answer)
        self.assertEqual([item["model"] for item in substituted],
                         ["fable", "opus", "kimi", "glm"])
        self.assertEqual(refused, [])
        self.assertEqual(assessment_run.last_failure(substituted),
                         "finish_reason=content_filter")

    def test_a_substitute_already_seated_for_the_question_is_skipped(self):
        model = Scripted(fable=("", "content_filter"), opus=("", "content_filter"),
                         glm=("", "content_filter"))
        tag, answer, substituted, _refused = self.ask("fable", model,
                                                      seated=("sol", "fable", "kimi"))
        self.assertIsNone(answer)
        self.assertIsNone(tag)
        self.assertEqual([item["model"] for item in substituted],
                         ["fable", "opus", "kimi", "glm"])
        self.assertEqual(substituted[2], {"model": "kimi", "reason": "already seated"})
        self.assertEqual(model.asked, ["fable", "opus", "glm"])
        # The failure a seat's call reports is the last candidate actually asked.
        self.assertEqual(assessment_run.last_failure(substituted),
                         "finish_reason=content_filter")

    def test_a_skipped_substitute_hands_over_to_the_next(self):
        model = Scripted(fable=("", "content_filter"))
        tag, _answer, substituted, _refused = self.ask("fable", model,
                                                       seated=("sol", "fable", "opus"))
        self.assertEqual(tag, "kimi")
        self.assertEqual([item["model"] for item in substituted], ["fable", "opus"])
        self.assertEqual(substituted[1], {"model": "opus", "reason": "already seated"})
        self.assertEqual(model.asked, ["fable", "kimi"])

    def test_a_seat_is_always_asked_itself(self):
        tag, _answer, substituted, _refused = self.ask("fable", Scripted(),
                                                       seated=("sol", "fable", "kimi"))
        self.assertEqual(tag, "fable")
        self.assertEqual(substituted, [])

    def test_an_interrupt_keeps_what_the_caller_s_list_already_billed(self):
        model = Scripted(fable=("", "content_filter"), opus=KeyboardInterrupt())
        substituted = []
        with self.assertRaises(KeyboardInterrupt):
            assessment_run.ask_with_substitutes("fable", "system", "user", self.config, model,
                                                "frontier_fast", substituted=substituted)
        # opus was never billed, so it never made it into the list: the
        # interrupt propagated before this function could append anything for
        # it, and the list the caller passed in is what carries fable's.
        self.assertEqual([item["model"] for item in substituted], ["fable"])
        self.assertEqual(substituted[0]["reason"], "finish_reason=content_filter")
        self.assertGreater(substituted[0]["cost_usd"], 0)


REQUEST = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")


def cut():
    """What the openai client raises when the connection is gone."""
    return openai.APIConnectionError(request=REQUEST)


class InSequence(Scripted):
    """As Scripted, except that a tag scripted with a list takes its items in
    order, one per call, and answers "an answer" once they run out."""

    def __call__(self, provider, model_id, system, user, kwargs):
        tag = tag_of(model_id)
        if isinstance(self.script.get(tag), list):
            items = self.script[tag]
            self.asked.append(tag)
            scripted = items.pop(0) if items else ("an answer", "stop")
            if isinstance(scripted, BaseException):
                raise scripted
            reply, finish_reason = scripted
            return reply, dict(USAGE), finish_reason, 0.5
        return super().__call__(provider, model_id, system, user, kwargs)


class NetworkTest(unittest.TestCase):
    """A network error is not the seat's model failing: it is waited out, and
    after the last wait it stops the seat, and no substitute is asked."""

    @classmethod
    def setUpClass(cls):
        cls.config = seat_call.h.load_config()

    def ask(self, model, substituted=None):
        waits = []
        with mock.patch.object(seat_call, "sleep", waits.append), \
                contextlib.redirect_stderr(io.StringIO()):
            try:
                return assessment_run.ask_with_substitutes(
                    "fable", "system", "user", self.config, model, "frontier_fast",
                    substituted=substituted), waits
            except seat_call.Unreachable as raised:
                return raised, waits

    def test_a_transport_error_twice_then_an_answer_is_the_seat_answering_once(self):
        model = InSequence(fable=[cut(), cut()])
        (tag, answer, substituted, refused), waits = self.ask(model)
        self.assertEqual(tag, "fable")
        self.assertEqual((substituted, refused), ([], []))
        self.assertEqual(answer["cost_usd"], batch_job.cost_of("fable", USAGE, self.config),
                         "one call billed")
        self.assertEqual(waits, [30, 60])
        self.assertEqual(model.asked, ["fable", "fable", "fable"], "nothing else is asked")

    def test_a_transport_error_on_every_wait_stops_the_seat_with_no_substitute_asked(self):
        model = InSequence(fable=[("", "content_filter")], opus=[cut()] * 6)
        substituted = []
        raised, waits = self.ask(model, substituted=substituted)
        self.assertIsInstance(raised, seat_call.Unreachable)
        self.assertEqual(waits, [30, 60, 120, 240, 480])
        self.assertEqual(model.asked, ["fable"] + ["opus"] * 6,
                         "kimi and glm, fable's later substitutes, are never asked")
        # fable's billed refusal is still in the caller's list, and nothing was
        # appended for opus, which was never billed as far as anyone can know.
        self.assertEqual([entry["model"] for entry in substituted], ["fable"])
        self.assertGreater(substituted[0]["cost_usd"], 0)

    def test_a_rate_limit_twice_then_an_answer_is_the_seat_answering_once(self):
        limited = openai.RateLimitError("Error code: 429 - rate limited", body=None,
                                        response=httpx.Response(429, request=REQUEST))
        model = InSequence(fable=[limited, limited])
        (tag, answer, substituted, refused), waits = self.ask(model)
        self.assertEqual(tag, "fable")
        self.assertEqual((substituted, refused), ([], []))
        self.assertEqual(answer["cost_usd"], batch_job.cost_of("fable", USAGE, self.config),
                         "one call billed")
        self.assertEqual(waits, [30, 60])
        self.assertEqual(model.asked, ["fable", "fable", "fable"], "nothing else is asked")

    def test_a_server_error_through_every_wait_passes_the_seat_to_its_substitute(self):
        # A provider that answers 502 was reached: its seat is not stopped for
        # good, it goes to the next declared substitute, as any failure does.
        bad_gateway = [openai.InternalServerError(
            "Error code: 502 - Bad gateway", body=None,
            response=httpx.Response(502, request=REQUEST)) for _ in range(6)]
        model = InSequence(fable=bad_gateway)
        substituted = []
        outcome, waits = self.ask(model, substituted=substituted)
        self.assertNotIsInstance(outcome, seat_call.Unreachable)
        tag, answer, _substituted, _refused = outcome
        self.assertEqual((tag, answer["reply"]), ("opus", "an answer"))
        self.assertEqual(waits, [30, 60, 120, 240, 480])
        self.assertEqual(model.asked, ["fable"] * 6 + ["opus"])
        self.assertEqual(substituted, [
            {"model": "fable", "reason": "Error code: 502 - Bad gateway", "cost_usd": None,
             "finish_reason": None, "model_id": None, "prompt_tokens": None,
             "completion_tokens": None}])

    def test_a_status_error_that_is_not_transport_still_passes_the_seat_on(self):
        bad = openai.BadRequestError("input refused", body=None,
                                     response=httpx.Response(400, request=REQUEST))
        model = InSequence(fable=[bad])
        (tag, answer, substituted, _refused), waits = self.ask(model)
        self.assertEqual(tag, "opus")
        self.assertEqual(answer["reply"], "an answer")
        self.assertEqual(waits, [])
        self.assertEqual(substituted[0]["model"], "fable")
        self.assertEqual(substituted[0]["reason"], "input refused")


def item(first, second, situation="s", why="w"):
    return {"first": first, "second": second, "situation": situation, "why": why}


class PoolTest(unittest.TestCase):
    def test_a_pair_is_one_claim_whichever_way_round_and_whoever_found_it(self):
        pooled = assessment_run.pool_claims(
            {"sol": [item(2, 3, "first seen", "because")],
             "fable": [item(1, 2), item(3, 2, "later", "other")],
             "kimi": [item(3, 2)]},
            ["sol", "fable", "kimi"])
        self.assertEqual(pooled, [
            {"first": 2, "second": 3, "situation": "first seen", "why": "because",
             "found_by": ["sol", "fable", "kimi"]},
            {"first": 1, "second": 2, "situation": "s", "why": "w", "found_by": ["fable"]}])

    def test_a_seat_that_listed_nothing_or_failed_finds_nothing(self):
        pooled = assessment_run.pool_claims({"sol": [item(1, 2)]}, ["sol", "fable", "kimi"])
        self.assertEqual([claim["found_by"] for claim in pooled], [["sol"]])

    def test_a_seat_is_asked_only_about_claims_it_did_not_find(self):
        pooled = [dict(item(2, 3), found_by=["sol", "fable"]),
                  dict(item(1, 2, "x", "y"), found_by=["fable"])]
        self.assertEqual(assessment_run.claims_to_confirm(pooled, "sol"),
                         [(1, item(1, 2, "x", "y"))])
        self.assertEqual(assessment_run.claims_to_confirm(pooled, "kimi"),
                         [(0, item(2, 3)), (1, item(1, 2, "x", "y"))])
        self.assertEqual(assessment_run.claims_to_confirm(pooled, "fable"), [])

    def test_a_confirmation_s_positions_map_back_to_the_pooled_claims(self):
        to_confirm = [(0, item(2, 3)), (4, item(1, 2))]
        verdicts = {2: {"holds": True, "absolute": None, "reason": "r"}}
        self.assertEqual(assessment_run.by_claim(to_confirm, verdicts),
                         {4: {"holds": True, "absolute": None, "reason": "r"}})


def verdict(holds, absolute=False, reason=""):
    return {"holds": holds, "absolute": absolute, "reason": reason}


class SettleTest(unittest.TestCase):
    """A claim is settled on its readings, one per seat that read it. Finding
    a claim is not a reading of it."""
    SEATS = ["sol", "opus", "kimi"]

    def settle(self, pooled, verdicts_by_seat):
        return assessment_run.settle(pooled, verdicts_by_seat, self.SEATS, PASSAGES)

    def test_two_holding_readings_confirm_a_claim(self):
        pooled = [dict(item(2, 3, "sit", "why"), found_by=["sol"])]
        [claim] = self.settle(pooled, {"sol": {0: verdict(True, reason="Clashes.")},
                                       "opus": {0: verdict(True, reason="Matches.")},
                                       "kimi": {0: verdict(False, reason="No.")}})
        self.assertEqual(claim, {
            "first": PASSAGES[1][0], "second": PASSAGES[2][0], "situation": "sit",
            "why": "why", "found_by": ["sol"], "holds": ["sol", "opus"],
            "does_not_hold": ["kimi"], "absolute": False, "confirmed": True,
            "reasons": {"sol": "Clashes.", "opus": "Matches.", "kimi": "No."}})

    def test_two_finders_and_one_objection_the_objection_counts(self):
        # sol and kimi found it; on reading every claim, kimi is persuaded by
        # opus's objection and only sol still says it holds.
        pooled = [dict(item(1, 2), found_by=["sol", "kimi"])]
        [claim] = self.settle(pooled, {"sol": {0: verdict(True)},
                                       "opus": {0: verdict(False, reason="Settled in 3.")},
                                       "kimi": {0: verdict(False, reason="Settled in 3.")}})
        self.assertFalse(claim["confirmed"])
        self.assertEqual(claim["does_not_hold"], ["opus", "kimi"])

    def test_finding_a_claim_is_not_a_reading_of_it(self):
        pooled = [dict(item(1, 2), found_by=["sol", "opus", "kimi"])]
        [claim] = self.settle(pooled, {"sol": {0: verdict(True)}})
        self.assertFalse(claim["confirmed"], "three finders and one reading that holds")
        [claim] = self.settle(pooled, {})
        self.assertFalse(claim["confirmed"])
        self.assertEqual((claim["holds"], claim["does_not_hold"]), ([], []))

    def test_a_first_method_finder_s_row_is_a_reading_that_holds(self):
        # A run of the first method wrote a "found it" row for each finder,
        # holding and silent on absoluteness: two of them confirm the claim.
        found = {"holds": True, "absolute": None, "reason": "found it"}
        pooled = [dict(item(1, 2), found_by=["sol", "kimi"])]
        [claim] = self.settle(pooled, {"sol": {0: found}, "kimi": {0: found},
                                       "opus": {0: verdict(False)}})
        self.assertTrue(claim["confirmed"])
        self.assertFalse(claim["absolute"], "opus answered the question, saying no")

    def test_absolute_from_a_reading_that_does_not_hold_does_not_count(self):
        pooled = [dict(item(1, 2), found_by=["kimi"])]
        [claim] = self.settle(pooled, {"sol": {0: verdict(True, absolute=True)},
                                       "opus": {0: verdict(True, absolute=False)},
                                       "kimi": {0: verdict(False, absolute=True)}})
        self.assertTrue(claim["confirmed"])
        self.assertFalse(claim["absolute"])

    def test_absolute_needs_two_holding_readings_that_say_so(self):
        pooled = [dict(item(1, 2), found_by=["kimi"])]
        [one] = self.settle(pooled, {"sol": {0: verdict(True, absolute=True)},
                                     "opus": {0: verdict(True, absolute=None)},
                                     "kimi": {0: verdict(True, absolute=False)}})
        self.assertFalse(one["absolute"])
        [two] = self.settle(pooled, {"sol": {0: verdict(True, absolute=True)},
                                     "opus": {0: verdict(False, absolute=False)},
                                     "kimi": {0: verdict(True, absolute=True)}})
        self.assertTrue(two["absolute"])

    def test_a_claim_no_reading_was_asked_about_has_no_absoluteness(self):
        # A claim of the first method every seat found was put to nobody, so
        # whether it is absolute was never asked.
        found = {"holds": True, "absolute": None, "reason": "found it"}
        pooled = [dict(item(1, 2), found_by=["sol", "opus", "kimi"])]
        [claim] = self.settle(pooled, {seat: {0: found} for seat in self.SEATS})
        self.assertIsNone(claim["absolute"])
        self.assertTrue(claim["confirmed"])


V1 = "lab--spec@2026-01-01"
V2 = "lab--spec@2026-06-01"
V3 = "lab--spec@2026-09-01"
V4 = "lab--spec@2026-12-01"


def version(head, texts):
    """The passages of one version, `texts` {path: text} in document order."""
    return [(f"{head} > {path}", path.split(" > ")[0], text) for path, text in texts.items()]


SAME = {"#a > ¶1": "In a conflict, safety comes first.", "#b > ¶1": "Never lie.",
        "#b > ¶2": "Keep the operator's instructions private."}


class PoolVersionsTest(unittest.TestCase):
    """The candidates found on every version of one document, pooled by the
    pair of passages without the version head, and carried to every version
    where both passages read the same."""
    SEATS = ["sol", "opus", "kimi"]

    def test_a_pair_is_carried_where_both_passages_read_the_same_and_nowhere_else(self):
        passages = {
            V1: version(V1, SAME),
            # The same text, one passage earlier.
            V2: version(V2, {"#new > ¶1": "Be brief.", **SAME}),
            # ¶2 of #b reworded.
            V3: version(V3, {**SAME, "#b > ¶2": "Keep the operator's instructions secret."}),
            # ¶2 of #b gone.
            V4: version(V4, {"#a > ¶1": SAME["#a > ¶1"], "#b > ¶1": SAME["#b > ¶1"]}),
        }
        found = {V1: {"sol": [item(2, 3, "A user asks.", "They clash.")]},
                 V2: {}, V3: {}, V4: {}}
        pooled = assessment_run.pool_versions(found, passages, self.SEATS)
        self.assertEqual(pooled[V1], [{"first": 2, "second": 3, "situation": "A user asks.",
                                       "why": "They clash.", "found_by": ["sol"]}])
        # Carried, and numbered as that version numbers the two passages.
        self.assertEqual(pooled[V2], [{"first": 3, "second": 4, "situation": "A user asks.",
                                       "why": "They clash.", "found_by": ["sol"]}])
        self.assertEqual(pooled[V3], [])
        self.assertEqual(pooled[V4], [])

    def test_found_by_is_every_seat_that_proposed_the_pair_where_it_applies(self):
        passages = {V1: version(V1, SAME), V2: version(V2, SAME),
                    V3: version(V3, {**SAME, "#b > ¶2": "Keep it secret."})}
        found = {V1: {"kimi": [item(3, 2, "kimi's situation", "kimi's reason")]},
                 V2: {"sol": [item(2, 3, "sol's situation", "sol's reason")],
                      "kimi": [item(2, 3)]},
                 # On a reworded ¶2: a proposal about other words.
                 V3: {"opus": [item(2, 3, "opus's situation", "opus's reason")]}}
        pooled = assessment_run.pool_versions(found, passages, self.SEATS)
        # The first proposal in version order, then seat order, gives the words
        # and the order of the two passages, on every version it applies to.
        for head in (V1, V2):
            self.assertEqual(pooled[head], [{"first": 3, "second": 2,
                                             "situation": "kimi's situation",
                                             "why": "kimi's reason",
                                             "found_by": ["sol", "kimi"]}])
        self.assertEqual(pooled[V3], [{"first": 2, "second": 3,
                                       "situation": "opus's situation", "why": "opus's reason",
                                       "found_by": ["opus"]}])

    def test_one_claim_per_pair_whichever_way_round_in_the_order_first_proposed(self):
        passages = {V1: version(V1, SAME)}
        found = {V1: {"sol": [item(2, 3, "first seen", "because")],
                      "opus": [item(1, 2), item(3, 2, "later", "other")],
                      "kimi": [item(3, 2)]}}
        pooled = assessment_run.pool_versions(found, passages, self.SEATS)
        self.assertEqual(pooled[V1], [
            {"first": 2, "second": 3, "situation": "first seen", "why": "because",
             "found_by": ["sol", "opus", "kimi"]},
            {"first": 1, "second": 2, "situation": "s", "why": "w", "found_by": ["opus"]}])

    def test_a_pair_whose_two_passages_share_a_locator_is_no_claim(self):
        shared = f"{V1} > #b > ¶2"
        passages = {V1: [(shared, "B", "one reading"), (shared, "B", "another reading")]}
        pooled = assessment_run.pool_versions({V1: {"sol": [item(1, 2)]}}, passages,
                                              self.SEATS)
        self.assertEqual(pooled, {V1: []})


class SupplementaryReadingTest(unittest.TestCase):
    """A reading call asked again about claims added after its first reading
    (`assess.py --replay`) records that reading among its attempts: every
    attempt of it names the claims it was asked about, in order, and the one
    that answered carries its reply."""
    FIRST = {"model": "opus", "finish_reason": "stop", "cost_usd": 0.1, "reason": None}
    REFUSED = {"model": "opus", "finish_reason": "content_filter", "cost_usd": 0.1,
               "reason": "finish_reason=content_filter", "claim_ids": ["c3", "c4"]}
    SKIPPED = {"model": "kimi", "finish_reason": None, "cost_usd": None,
               "reason": assessment_run.ALREADY_SEATED, "claim_ids": ["c3", "c4"]}
    ANSWERED = {"model": "glm", "finish_reason": "stop", "cost_usd": 0.01, "reason": None,
                "claim_ids": ["c3", "c4"], "reply": "ITEM 1: holds | absolute: no | Yes.",
                "seconds": 1.5}

    def test_only_an_attempt_that_answered_one_is_a_supplementary_reading(self):
        attempts = [self.FIRST, self.REFUSED, self.SKIPPED, self.ANSWERED,
                    dict(self.ANSWERED, model="sol", claim_ids=["c5"], reply="ITEM 1: holds")]
        self.assertEqual(assessment_run.supplementary_readings(attempts), [
            ("glm", self.ANSWERED["reply"], ["c3", "c4"]), ("sol", "ITEM 1: holds", ["c5"])])
        self.assertEqual(assessment_run.supplementary_readings([self.FIRST]), [])
        self.assertEqual(assessment_run.supplementary_readings(None), [])

    def test_a_reading_names_the_model_that_gave_it(self):
        call = {"id": "k-opus", "model": "opus",
                "attempts": [self.FIRST, self.REFUSED, self.ANSWERED]}
        self.assertEqual(assessment_run.reading_model(call, "c4"), "glm")
        self.assertEqual(assessment_run.reading_model(call, "c1"), "opus")
        self.assertEqual(assessment_run.reading_model({"id": "x", "model": "sol"}, "c1"), "sol")


class FindersTest(unittest.TestCase):
    """Who found a claim: its `found_by`, and every seat a replay recorded as
    finding it again after it was written, since a claim is never updated."""
    RUN = {"panels": {"contradictions": ["sol", "opus", "kimi"]},
           "config": {"replays": [
               {"also_found": [{"seat": "kimi", "version_id": "v", "claim_id": "c1"}]},
               {"also_found": [{"seat": "opus", "version_id": "v", "claim_id": "c1"},
                               {"seat": "opus", "version_id": "v", "claim_id": "c2"}]}]}}

    def test_found_by_and_the_seats_the_replays_add_in_panel_order(self):
        self.assertEqual(assessment_run.finders({"id": "c1", "found_by": ["kimi", "sol"]},
                                                self.RUN), ["sol", "opus", "kimi"])
        self.assertEqual(assessment_run.finders({"id": "c3", "found_by": ["sol"]}, self.RUN),
                         ["sol"])
        self.assertEqual(assessment_run.finders({"id": "c3", "found_by": ["sol"]},
                                                {"panels": {}}), ["sol"])


class ScoreTest(unittest.TestCase):
    def claims(self, *specs):
        return [{"confirmed": confirmed, "absolute": absolute} for confirmed, absolute in specs]

    def test_the_score_from_confirmed_claims(self):
        score = assessment_run.confirm_score
        self.assertEqual(score([]), 4)
        self.assertEqual(score(self.claims((False, True), (False, False))), 4)
        self.assertEqual(score(self.claims((True, False))), 2)
        self.assertEqual(score(self.claims((True, None), (True, False))), 2)
        self.assertEqual(score(self.claims((True, False), (True, False), (True, False))), 0)
        self.assertEqual(score(self.claims((True, True))), 0)


class ConflictRulesTest(unittest.TestCase):
    def test_a_passage_needs_two_seats_by_default(self):
        by_seat = {"a": {"conflict_rule_passages": [1, 2, 2]},
                   "b": {"conflict_rule_passages": [2, 3]},
                   "c": {"conflict_rule_passages": [3]}}
        self.assertEqual(assessment_run.conflict_rules(by_seat, PASSAGES),
                         [PASSAGES[1], PASSAGES[2]])
        self.assertEqual(assessment_run.conflict_rules(by_seat, PASSAGES, quorum=3), [])


class PriceTest(unittest.TestCase):
    def test_every_seat_of_each_question_reads_the_whole_document(self):
        config = seat_call.h.load_config()
        panels = {"criteria": ["sol", "fable", "deepseek"],
                  "contradictions": ["sol", "fable", "kimi"]}
        expected = 0.0
        for question in ("criteria", "contradictions"):
            system, user = assessment_call.compose(question, PASSAGES)
            expected += sum(seat_call.priced(seat, system, user,
                                             assessment_run.OUTPUT_TOKENS[question], config)
                            for seat in panels[question])
        system, user = assessment_call.compose_confirm(PASSAGES, [])
        expected += sum(seat_call.priced(seat, system,
                                         user + "x" * assessment_run.CONFIRM_CLAIMS_CHARS,
                                         assessment_run.CONFIRM_OUTPUT_TOKENS, config)
                        for seat in panels["contradictions"])
        self.assertEqual(assessment_run.CONFIRM_CLAIMS_CHARS, 3000)
        self.assertAlmostEqual(assessment_run.price_document(PASSAGES, panels, config), expected)
        self.assertGreater(expected, 0)

    def test_a_run_that_takes_its_criteria_is_priced_on_finding_and_reading_only(self):
        config = seat_call.h.load_config()
        panels = {"criteria": ["sol", "fable", "deepseek"],
                  "contradictions": ["sol", "opus", "kimi"]}
        self.assertEqual(assessment_run.fresh_calls(panels, criteria=False),
                         [("contradictions", seat, None) for seat in ("sol", "opus", "kimi")]
                         + [("confirm", seat, None) for seat in ("sol", "opus", "kimi")])
        system, user = assessment_call.compose("criteria", PASSAGES)
        criteria = sum(seat_call.priced(seat, system, user,
                                        assessment_run.OUTPUT_TOKENS["criteria"], config)
                       for seat in panels["criteria"])
        self.assertAlmostEqual(
            assessment_run.price_document(PASSAGES, panels, config, criteria=False),
            assessment_run.price_document(PASSAGES, panels, config) - criteria)


if __name__ == "__main__":
    unittest.main()
