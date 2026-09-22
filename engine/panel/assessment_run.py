"""The assessment of a document as a whole, as rules over plain data.

Composing each call and parsing its reply is `assessment_call`'s. This module
holds what happens between the calls, as proven in the two pilots of 21
September 2026 (engine/pilot_scale_ten.py):

- a seat is asked through its own model, then its declared substitutes in
  order, skipping a substitute already seated for the same question;
- the contradictions every seat listed are pooled, one claim per unordered pair
  of passages, and each seat is asked to confirm the claims it did not find;
- a claim is confirmed once its finders and the seats that read it and said it
  holds number two or more between them, and it is absolute once any reader
  says so;
- the contradictions score comes from the confirmed claims;
- the document's general rules for conflicts are the passages at least two
  seats cited as such.

Nothing here reads or writes the store or a file. The model call is injected,
so each rule runs against a script in the tests.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import assessment_call           # noqa: E402
import seat_call                 # noqa: E402

QUORUM = 2
ALREADY_SEATED = "already seated"
# Output allowances for the price, generous because sol's reasoning is billed as
# output, and a price that comes in low is the one that surprises.
OUTPUT_TOKENS = {"criteria": 4000, "contradictions": 8000}
# A confirmation call is priced per seat, whether or not it turns out to be
# needed: how many claims a seat will have to confirm is only known at run time.
CONFIRM_CLAIMS_CHARS = 3000
CONFIRM_OUTPUT_TOKENS = 1500


def candidates(seat, config, panel):
    """`seat`, then its declared substitutes in `panel`, in order. A seat with
    no declared substitutes is asked alone."""
    return [seat] + config.get("substitutes", {}).get(panel, {}).get(seat, [])


def ask_with_substitutes(seat, system, user, config, call_model, panel, seated=(),
                         substituted=None):
    """Ask `seat`'s own model, then its declared substitutes in order, until
    one answers.

    `seated` is every model that must not answer this question for this
    document a second time: the caller passes the question's configured
    seats, plus every model that has already answered it earlier in the same
    document's loop over those seats. A substitute that is one of `seated` is
    skipped rather than asked, so no model answers one question twice for one
    document; the seat itself is always asked, whether or not it is in
    `seated`.

    A candidate fails when the call raises, when it comes back
    content-filtered, or when its reply is empty once stripped.

    `substituted` may be a list the caller passes in, filled in place as
    candidates fail or are skipped rather than only built and returned. A
    `KeyboardInterrupt`, a `SystemExit` or a `seat_call.Unreachable` raised
    while asking a candidate is not treated as that candidate failing: it
    propagates straight out of this call, no later candidate is asked, and
    nothing is appended for the candidate it stopped, which was not billed as
    far as anyone can know. The caller's list still holds every earlier
    candidate's attempt, billed or not, because it is the same list this
    function has been appending to rather than a copy. A model that could not
    be reached is the network failing, not the model: handing its seat to a
    substitute would record a substitution nothing called for.

    Returns (tag, answer, substituted, refused):

    - `tag` and `answer` are the candidate that answered and `seat_call.ask`'s
      dict for it, or (None, None) when every candidate failed;
    - `substituted` lists every candidate before the one returned, in the order
      tried: {"model", "reason", "cost_usd", "finish_reason", "model_id",
      "prompt_tokens", "completion_tokens"} for one that failed, the last five
      None when it raised before answering, since it was never billed; and
      {"model", "reason": "already seated"} for one that was skipped;
    - `refused` lists (candidate, reply) for every failed candidate whose reply
      had any text, for the caller to keep."""
    if substituted is None:
        substituted = []
    refused = []
    for position, tag in enumerate(candidates(seat, config, panel)):
        if position and tag in seated:
            substituted.append({"model": tag, "reason": ALREADY_SEATED})
            continue
        try:
            answer = seat_call.ask(tag, system, user, config, call_model)
        except seat_call.Unreachable:
            raise
        except Exception as failed:                      # noqa: BLE001
            substituted.append({"model": tag, "reason": str(failed)[:300],
                                "cost_usd": None, "finish_reason": None, "model_id": None,
                                "prompt_tokens": None, "completion_tokens": None})
            continue
        if answer["finish_reason"] == "content_filter":
            reason = "finish_reason=content_filter"
        elif not answer["reply"].strip():
            reason = f"empty reply, finish_reason={answer['finish_reason']}"
        else:
            return tag, answer, substituted, refused
        usage = answer["usage"] or {}
        substituted.append({"model": tag, "reason": reason, "cost_usd": answer["cost_usd"],
                            "finish_reason": answer["finish_reason"],
                            "model_id": answer["model_id"],
                            "prompt_tokens": usage.get("prompt_tokens"),
                            "completion_tokens": usage.get("completion_tokens")})
        if answer["reply"]:
            refused.append((tag, answer["reply"]))
    return None, None, substituted, refused


def last_failure(substituted):
    """Why the last candidate actually asked failed: the reason a seat whose
    every candidate failed reports. A skipped substitute was never asked, so it
    is passed over."""
    asked = [item for item in substituted if item["reason"] != ALREADY_SEATED]
    return asked[-1]["reason"] if asked else ALREADY_SEATED


def pool_claims(contradictions_by_seat, seats):
    """The pooled claims, one per distinct unordered pair of passage numbers,
    in the order first found: {"first", "second", "situation", "why",
    "found_by"}, `first` and `second` 1-based passage numbers.

    `contradictions_by_seat` holds each seat's parsed items, as
    `assessment_call.parse_contradictions` gives them. The first seat to list a
    pair keeps its situation and reason; every seat that lists it, including
    later ones, joins `found_by`, in the order of `seats`."""
    by_pair = {}
    order = []
    for seat in seats:
        for item in contradictions_by_seat.get(seat, []):
            pair = frozenset((item["first"], item["second"]))
            if pair not in by_pair:
                by_pair[pair] = {"first": item["first"], "second": item["second"],
                                 "situation": item["situation"], "why": item["why"],
                                 "found_by": []}
                order.append(pair)
            if seat not in by_pair[pair]["found_by"]:
                by_pair[pair]["found_by"].append(seat)
    return [by_pair[pair] for pair in order]


def claims_to_confirm(pooled, seat):
    """[(index into `pooled`, claim)] for every pooled claim `seat` did not
    find, in pooled order, each claim as `assessment_call.compose_confirm`
    takes it. A seat with nothing here is not called."""
    return [(i, {"first": claim["first"], "second": claim["second"],
                 "situation": claim["situation"], "why": claim["why"]})
            for i, claim in enumerate(pooled) if seat not in claim["found_by"]]


def by_claim(to_confirm, verdicts):
    """A confirmation's verdicts, keyed by their 1-based position in the call,
    re-keyed by the index of the pooled claim each answers."""
    return {to_confirm[position - 1][0]: verdict for position, verdict in verdicts.items()}


def settle(pooled, verdicts_by_seat, seats, passages):
    """Every pooled claim, settled.

    `verdicts_by_seat` maps each seat whose confirmation answered to its
    verdicts keyed by pooled index (see `by_claim`), each {"holds", "absolute",
    "reason"}. Returns, per claim, {"first", "second", "situation", "why",
    "found_by", "holds", "does_not_hold", "absolute", "confirmed", "reasons"},
    with `first` and `second` the passages' locators.

    A claim is confirmed when its finders and the seats that held it number two
    or more. It is absolute when any reader called it so; a claim every seat
    already found was never put to anyone, so its absoluteness is unasked
    (None) rather than false."""
    contradictions = []
    for i, claim in enumerate(pooled):
        holds, does_not_hold, reasons = [], [], {}
        absolute = None if len(claim["found_by"]) >= len(seats) else False
        for seat in seats:
            verdict = verdicts_by_seat.get(seat, {}).get(i)
            if verdict is None:
                continue
            reasons[seat] = verdict["reason"]
            (holds if verdict["holds"] else does_not_hold).append(seat)
            if verdict["absolute"]:
                absolute = True
        contradictions.append({
            "first": passages[claim["first"] - 1][0], "second": passages[claim["second"] - 1][0],
            "situation": claim["situation"], "why": claim["why"],
            "found_by": claim["found_by"], "holds": holds, "does_not_hold": does_not_hold,
            "absolute": absolute, "confirmed": len(claim["found_by"]) + len(holds) >= 2,
            "reasons": reasons})
    return contradictions


def confirm_score(claims):
    """4 when no claim is confirmed, 2 when one or two are and none is
    absolute, 0 when three or more are confirmed or any confirmed claim is
    absolute. An unasked absoluteness counts as not absolute."""
    confirmed = [claim for claim in claims if claim["confirmed"]]
    if not confirmed:
        return 4
    if any(claim["absolute"] for claim in confirmed) or len(confirmed) >= 3:
        return 0
    return 2


def conflict_rules(criteria_by_seat, passages, quorum=QUORUM):
    """The passages at least `quorum` seats cited as the document's general
    rules for conflicts, in document order. A seat whose criteria call failed
    cited nothing, so it cannot help a passage reach the quorum."""
    counts = {}
    for parsed in criteria_by_seat.values():
        for number in set(parsed.get("conflict_rule_passages") or []):
            counts[number] = counts.get(number, 0) + 1
    return [passages[number - 1] for number in sorted(counts) if counts[number] >= quorum]


# The order the calls of one document are priced in, question by question.
PRICE_ORDER = assessment_call.QUESTIONS + ("confirm",)


def fresh_calls(panels):
    """Every call assessing one document can make when nothing of it is known
    yet, as (question, seat, claims): each seat of each question, then a
    confirmation per contradictions seat, whose claims are not known (None)."""
    return ([(question, seat, None) for question in assessment_call.QUESTIONS
             for seat in panels[question]]
            + [("confirm", seat, None) for seat in panels["contradictions"]])


def call_messages(question, labelled, claims=None):
    """The system and user messages one call is priced on. A confirmation
    whose claims are known is priced on them; one whose claims are not known
    yet carries the whole document and an allowance of CONFIRM_CLAIMS_CHARS in
    their place."""
    if question != "confirm":
        return assessment_call.compose(question, labelled)
    system, user = assessment_call.compose_confirm(labelled, claims or [])
    return system, (user if claims is not None else user + "x" * CONFIRM_CLAIMS_CHARS)


def output_allowance(question):
    return CONFIRM_OUTPUT_TOKENS if question == "confirm" else OUTPUT_TOKENS[question]


def price_calls(labelled, calls, config):
    """What the calls `calls`, (question, seat, claims) as `fresh_calls` gives
    them, would cost on one labelled document: each at its seat's own model,
    with its question's output allowance."""
    estimate = 0.0
    for question in PRICE_ORDER:
        estimate += sum(seat_call.priced(seat, *call_messages(question, labelled, claims),
                                         output_allowance(question), config)
                        for asked, seat, claims in calls if asked == question)
    return estimate


def price_document(labelled, panels, config):
    """What assessing one document would cost: every seat of each question
    reading the whole labelled document, with the question's output allowance,
    and a confirmation per contradictions seat, which carries the whole
    document too, plus an allowance for the claims. A seat is priced at its own
    model; a substitute that has to answer for it costs more."""
    return price_calls(labelled, fresh_calls(panels), config)
