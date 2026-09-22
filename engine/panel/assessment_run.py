"""The assessment of a document as a whole, as rules over plain data.

Composing each call and parsing its reply is `assessment_call`'s. This module
holds what happens between the calls, as proven in the two pilots of 21
September 2026 (engine/pilot_scale_ten.py) and changed by the owner on 22
September 2026, after the first full run, into the second method:

- a seat is asked through its own model, then its declared substitutes in
  order, skipping a substitute already seated for the same question;
- finding proposes and reading decides: the contradictions every seat listed on
  every version of one document in the run are pooled by the pair of passages
  without their version head, and carried to every version where both passages
  read exactly the same (`pool_versions`); every seat then reads every claim of
  a version, the ones it found included;
- a claim is confirmed once two readings say it holds, and absolute once two
  readings say both that it holds and that it is absolute (`settle`);
- the contradictions score comes from the confirmed claims;
- the document's general rules for conflicts are the passages at least two
  seats cited as such.

`pool_claims`, `claims_to_confirm` and `by_claim` are the first method's, which
pooled one document and put each claim only to the seats that had not found it.
The pilot still runs by them.

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
# A reading call is priced per seat, whether or not it turns out to be needed:
# how many claims a seat will have to read is only known once they are found.
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
    content-filtered, or when its reply is empty once stripped. A rate limit
    or a server error that outlasts `seat_call.RETRY_WAITS` is the call
    raising: its provider was reached, so the candidate fails and the next is
    asked.

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
    """The first method's pool, of one document: one claim per distinct
    unordered pair of passage numbers, in the order first found: {"first", "second", "situation", "why",
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
    """The first method's confirmation: [(index into `pooled`, claim)] for
    every pooled claim `seat` did not find, in pooled order, each claim as
    `assessment_call.compose_confirm` takes it. A seat with nothing here is not
    called."""
    return [(i, {"first": claim["first"], "second": claim["second"],
                 "situation": claim["situation"], "why": claim["why"]})
            for i, claim in enumerate(pooled) if seat not in claim["found_by"]]


def by_claim(to_confirm, verdicts):
    """A confirmation's verdicts, keyed by their 1-based position in the call,
    re-keyed by the index of the pooled claim each answers."""
    return {to_confirm[position - 1][0]: verdict for position, verdict in verdicts.items()}


def settle(pooled, readings_by_seat, seats, passages):
    """Every pooled claim, settled on its readings. This is the only rule that
    settles a claim, for a run of either method and for the payload alike.

    `readings_by_seat` maps each seat to its readings keyed by pooled index
    (see `by_claim`), each {"holds", "absolute", "reason"}: one per verdict row
    written about the claim. Finding a claim is not a reading of it. A run of
    the first method wrote a verdict row for each finder, holding, silent on
    absoluteness and giving "found it" as its reason, and that row is a reading
    here like any other. Returns, per claim, {"first", "second", "situation",
    "why", "found_by", "holds", "does_not_hold", "absolute", "confirmed",
    "reasons"}, with `first` and `second` the passages' locators.

    A claim is confirmed when at least QUORUM readings say it holds. It is
    absolute when at least QUORUM readings say both that it holds and that it
    is absolute: a reading that does not hold says nothing about the rules it
    would break. When no reading answered whether it is absolute, as for a
    claim of the first method every seat had found and nobody was asked about,
    its absoluteness is unasked (None) rather than false."""
    contradictions = []
    for i, claim in enumerate(pooled):
        holds, does_not_hold, reasons, answered, absolute = [], [], {}, False, 0
        for seat in seats:
            reading = readings_by_seat.get(seat, {}).get(i)
            if reading is None:
                continue
            reasons[seat] = reading["reason"]
            (holds if reading["holds"] else does_not_hold).append(seat)
            answered = answered or reading["absolute"] is not None
            absolute += bool(reading["holds"] and reading["absolute"])
        contradictions.append({
            "first": passages[claim["first"] - 1][0], "second": passages[claim["second"] - 1][0],
            "situation": claim["situation"], "why": claim["why"],
            "found_by": claim["found_by"], "holds": holds, "does_not_hold": does_not_hold,
            "absolute": absolute >= QUORUM if answered else None,
            "confirmed": len(holds) >= QUORUM, "reasons": reasons})
    return contradictions


def path_of(locator):
    """A locator without its version head, `<spec id>@<version> > `: what one
    passage is called on every version of its document."""
    return locator.split(" > ", 1)[-1]


def pool_versions(found, passages, seats):
    """The claims of each version of one document, pooled across its versions:
    {version: [claim]}, each claim {"first", "second", "situation", "why",
    "found_by"}, `first` and `second` 1-based numbers into that version's
    passages.

    `passages` maps each version of the document the run assesses to its
    passages, (locator, section, text), and `found` maps each to {seat: items},
    each seat's items as `assessment_call.parse_contradictions` gives them; a
    seat whose call failed has none. `seats` are the contradictions' seats in
    panel order.

    Every item is a candidate: a pair of passages, each named by its path
    (`path_of`) and its text. A candidate is carried to every version, its own
    included, where both its passages exist with exactly the same text, and a
    version has one claim per pair of paths, whichever way round. Candidates
    are taken in the order of `passages`, then of `seats`, then of each reply:
    the first that a version carries gives its claim's situation, reason and
    passage order, and `found_by` is every seat, in panel order, that proposed
    the pair on a version whose two passages read as this one's. So two
    versions that read the same carry the same claim, whatever each reader
    happened to find on each. An item naming one locator twice is no claim."""
    candidates = []
    for version, rows in passages.items():
        for seat in seats:
            for item in found.get(version, {}).get(seat, []):
                first, second = rows[item["first"] - 1], rows[item["second"] - 1]
                if first[0] == second[0]:
                    continue
                ends = ((path_of(first[0]), first[2]), (path_of(second[0]), second[2]))
                candidates.append({"pair": frozenset(path for path, _text in ends),
                                   "ends": ends, "situation": item["situation"],
                                   "why": item["why"], "seat": seat})
    pooled = {}
    for version, rows in passages.items():
        number = {}
        for n, (locator, _section, text) in enumerate(rows, 1):
            number.setdefault((path_of(locator), text), n)
        claims = {}
        for candidate in candidates:
            if not all(end in number for end in candidate["ends"]):
                continue
            first, second = (number[end] for end in candidate["ends"])
            claim = claims.setdefault(candidate["pair"], {
                "first": first, "second": second, "situation": candidate["situation"],
                "why": candidate["why"], "found_by": set()})
            claim["found_by"].add(candidate["seat"])
        pooled[version] = [dict(claim, found_by=[seat for seat in seats
                                                 if seat in claim["found_by"]])
                           for claim in claims.values()]
    return pooled


def supplementary_readings(attempts):
    """Every supplementary reading a reading call's `attempts` record, in the
    order they were given, as (model, reply, claim ids).

    A reading call gives its first reading as any call does, its reply in the
    row's `raw_output`. A document whose finding was replayed after its
    readings (`assess.py --replay`) has every seat read only the claims added
    since, and that reading is recorded on the same row, whose key allows one
    reading call per run, version and seat: every attempt of it carries the
    ordered `claim_ids` it was asked about, and the one that answered also
    carries its `reply`, its reason None. A candidate that failed or was
    skipped gave no reading."""
    return [(attempt["model"], attempt["reply"], list(attempt["claim_ids"]))
            for attempt in attempts or []
            if attempt.get("claim_ids") is not None and attempt.get("reason") is None
            and attempt.get("reply") is not None]


def finders(claim, run):
    """Every seat that proposed `claim`, a claim row of assessment run `run`,
    in the run's panel order: its `found_by`, and every seat a replay of the
    run recorded as finding it again after it was written
    (`config["replays"][]["also_found"]`), since a claim's row is never
    updated. Who found a claim decides nothing: `settle` does not read it."""
    again = [entry["seat"] for record in ((run or {}).get("config") or {}).get("replays") or []
             for entry in record.get("also_found") or [] if entry["claim_id"] == claim["id"]]
    together = list(dict.fromkeys(list(claim["found_by"]) + again))
    seats = ((run or {}).get("panels") or {}).get("contradictions") or []
    return ([seat for seat in seats if seat in together]
            + [seat for seat in together if seat not in seats])


def reading_model(call, claim_id):
    """The model that gave reading call `call`'s reading of claim `claim_id`:
    the model of the supplementary reading that answered about it, if one
    did, and otherwise the model the call itself answered through."""
    for model, _reply, claim_ids in supplementary_readings(call.get("attempts")):
        if claim_id in claim_ids:
            return model
    return call.get("model")


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


def questions(criteria=True):
    """The questions a run asks about each document: both, or only the
    contradictions for a run that takes its criteria from another run."""
    return assessment_call.QUESTIONS if criteria else ("contradictions",)


def fresh_calls(panels, criteria=True):
    """Every call assessing one document can make when nothing of it is known
    yet, as (question, seat, claims): each seat of each question asked, then a
    reading per contradictions seat, whose claims are not known (None). A run
    that takes its criteria from another run (`criteria` false) asks none."""
    return ([(question, seat, None) for question in questions(criteria)
             for seat in panels[question]]
            + [("confirm", seat, None) for seat in panels["contradictions"]])


def call_messages(question, labelled, claims=None):
    """The system and user messages one call is priced on. A reading whose
    claims are known is priced on them; one whose claims are not known yet
    carries the whole document and an allowance of CONFIRM_CLAIMS_CHARS in
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


def price_document(labelled, panels, config, criteria=True):
    """What assessing one document would cost: every seat of each question
    asked reading the whole labelled document, with the question's output
    allowance, and a reading per contradictions seat, which carries the whole
    document too, plus an allowance for the claims, since they are not known
    before the finding. A seat is priced at its own model; a substitute that
    has to answer for it costs more. With `criteria` false, the criteria are
    taken from another run and not priced."""
    return price_calls(labelled, fresh_calls(panels, criteria), config)
