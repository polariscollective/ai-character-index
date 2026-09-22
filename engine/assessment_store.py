"""An assessment run, as it is written to the `aci_assessment_` tables.

`engine/assess.py` prices an assessment and, with --go, hands it here. This
module runs each document's calls in order through `assessment_run`'s rules and
writes what they give: the run row, each call as it moves from pending to
running to done or error, the scores each reply gives, the pooled claims and
every verdict on them, the finders' included.

A run taken up where it stopped (`assess.py --resume`) goes through the same
code as a fresh one, which is a run whose documents have no rows yet. Each
document is given the rows its run already holds, and nothing already there is
asked or written again: a done call is not asked again, and any rows its reply
gives that are missing are rebuilt from the reply it stored in `raw_output`; a
call in any other status is asked again in its own row, its earlier attempts and
bill kept; a claim already written keeps its id.

Ids are made here rather than returned by the database, as compose_run makes
its own, so a verdict can name its claim and its call without reading either
back.
"""

import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "panel"))
sys.path.insert(0, str(HERE / "spec-cite"))

import assessment_call           # noqa: E402
import assessment_run            # noqa: E402
import seat_call                 # noqa: E402

# The panel whose declared substitutes stand in for a seat of the assessment.
PANEL = "frontier_fast"
PROMPTS = ("criteria", "contradictions", "confirm")


def now():
    return datetime.now(timezone.utc).isoformat()


def name_of(version):
    return f"{version['spec_id']}@{version['version']}"


def attempt_rows(tag, answer, substituted):
    """Every candidate a call went through, in order, as the call row keeps
    them: {"model", "finish_reason", "cost_usd", "reason"}, the reason being
    why a candidate failed or was skipped, and None for the one that answered."""
    rows = [{"model": item["model"], "finish_reason": item.get("finish_reason"),
             "cost_usd": item.get("cost_usd"), "reason": item["reason"]}
            for item in substituted]
    if answer is not None:
        rows.append({"model": tag, "finish_reason": answer["finish_reason"],
                     "cost_usd": answer["cost_usd"], "reason": None})
    return rows


def summed(costs):
    """The sum of the costs known, or None when none is: null means unknown and
    zero means free, and they are not the same claim."""
    known = [cost for cost in costs if cost is not None]
    return round(sum(known), 6) if known else None


def summed_tokens(field, substituted, answer):
    """A call's `field` ("prompt_tokens" or "completion_tokens"), summed over
    every billed attempt: a refused candidate's, the same way its cost already
    is, and the answering reply's, when there is one. One rule for both meters,
    as `depth_ladder.give` already sums an attempt's tokens and seconds."""
    values = [item.get(field) for item in substituted]
    if answer is not None:
        values.append((answer["usage"] or {}).get(field))
    return summed(values)


def parse_criteria(passages):
    def parse(reply):
        parsed = assessment_call.parse_criteria(reply, len(passages))
        return parsed, parsed["complete"]
    return parse


def parse_contradictions(passages):
    def parse(reply):
        parsed = assessment_call.parse_contradictions(reply, len(passages))
        return parsed, parsed["complete"] and not parsed["unreadable"]
    return parse


def parse_confirm(claims):
    def parse(reply):
        verdicts = assessment_call.parse_confirm(reply, len(claims))
        return verdicts, len(verdicts) == len(claims)
    return parse


def criteria_scores(call_id, parsed, passages):
    """One row per criterion whose score parsed. The rationale is None when the
    reply gave none; conflict_rules carries the locators of the passages cited
    as the document's general rules for conflicts, the others none."""
    cited = [passages[number - 1][0] for number in parsed["conflict_rule_passages"]]
    return [{"call_id": call_id, "criterion": criterion, "score": parsed["scores"][criterion],
             "rationale": parsed["rationales"][criterion],
             "locators": cited if criterion == "conflict_rules" else []}
            for criterion in assessment_call.CRITERIA if parsed["scores"][criterion] is not None]


def contradictions_scores(call_id, parsed):
    """The judge's own contradictions score, when it parsed. The score from
    confirmed claims is read from the claims and verdicts, not stored."""
    if parsed["score"] is None:
        return []
    return [{"call_id": call_id, "criterion": "contradictions", "score": parsed["score"],
             "rationale": parsed["rationale"], "locators": []}]


def locator_pair(claim, passages):
    """A pooled claim's two passages as their locators, in code point order,
    which is the byte order the table's `collate "C"` compares them in."""
    return tuple(sorted((passages[claim["first"] - 1][0], passages[claim["second"] - 1][0])))


def distinct_claims(pooled, passages):
    """The pooled claims whose two passages resolve to different locators: the
    only ones `claim_rows` writes, so the only ones read, confirmed or priced."""
    return [claim for claim in pooled if len(set(locator_pair(claim, passages))) == 2]


def claim_rows(run_id, version_id, pooled, claim_ids, passages):
    """One row per pooled claim whose two passages resolve to different
    locators, its two locators in code point order (`locator_pair`).

    A claim whose two passages resolve to the same locator is counted as
    unreadable on the finder's call and gets no row, so the table's
    `first_locator < second_locator` check can never refuse a row after the
    calls that found the claim were already paid for."""
    rows = []
    for claim_id, claim in zip(claim_ids, pooled):
        first, second = locator_pair(claim, passages)
        if first == second:
            continue
        rows.append({"id": claim_id, "run_id": run_id, "spec_version_id": version_id,
                     "first_locator": first, "second_locator": second,
                     "situation": claim["situation"], "why": claim["why"],
                     "found_by": claim["found_by"]})
    return rows


def empty_rows():
    """The rows of a document its run holds nothing about yet, in
    `index_store.assessment_rows`'s shape."""
    return {"calls": [], "scores": [], "claims": [], "verdicts": []}


def done_calls(rows):
    """{(question, seat): call} for every done call of one document's rows."""
    return {(call["question"], call["seat"]): call for call in rows["calls"]
            if call["status"] == "done"}


def seated_at_start(question, seats, rows):
    """Every model that must not answer `question` about one document a second
    time, before any of its seats is asked: the question's configured seats,
    and the model of every call of that question the run already holds done."""
    return set(seats) | {call["model"] for call in rows["calls"]
                         if call["question"] == question and call["status"] == "done"
                         and call.get("model")}


def only_a_new_run(rows, panels):
    """Why taking the run up again cannot finish assessing the document these
    rows are about, or None when it can.

    Once a document's claims are written, every contradictions seat reads them.
    A contradictions seat with no done call by then (possible only when its
    every candidate failed, since a stop raises before claims are written)
    cannot be asked again: what it found would change claims other seats have
    already confirmed or rejected. And a done call whose reply was not stored
    cannot have its rows rebuilt."""
    done = done_calls(rows)
    if rows["claims"]:
        silent = [seat for seat in panels["contradictions"]
                  if ("contradictions", seat) not in done]
        if silent:
            return (f"its claimed contradictions are written and already read, and "
                    f"{' and '.join(silent)} gave no contradictions answer, so asking again "
                    "now would change claims other seats have already read")
    unkept = [f"{call['seat']} {call['question']}" for call in rows["calls"]
              if call["status"] == "done" and call.get("raw_output") is None]
    if unkept:
        return (f"no reply was stored for {', '.join(unkept)}, so the rows it gave cannot "
                "be rebuilt")
    return None


def to_ask(document, rows, panels):
    """[(question, seat, claims)] for every call assessing `document` can make,
    given `rows`, the rows its run already holds about it, in the order they
    are made: every seat of each question with no done call, then every
    confirmation not done that has claims to confirm.

    `claims` is what a confirmation will be asked about, and None for a
    question that is not a confirmation. It is None for a confirmation too
    while a contradictions seat has still to answer, since the claims are not
    known yet: every contradictions seat's confirmation is then listed, as
    `assessment_run.price_document` prices it."""
    passages = document["passages"]
    done = done_calls(rows)
    asked = [(question, seat, None) for question in assessment_call.QUESTIONS
             for seat in panels[question] if (question, seat) not in done]
    seats = panels["contradictions"]
    if not all(("contradictions", seat) in done for seat in seats):
        return asked + [("confirm", seat, None) for seat in seats
                        if ("confirm", seat) not in done]
    parse = parse_contradictions(passages)
    found = {seat: parse(done[("contradictions", seat)]["raw_output"])[0]["items"]
             for seat in seats}
    pooled = distinct_claims(assessment_run.pool_claims(found, seats), passages)
    for seat in seats:
        claims = [claim for _i, claim in assessment_run.claims_to_confirm(pooled, seat)]
        if claims and ("confirm", seat) not in done:
            asked.append(("confirm", seat, claims))
    return asked


class Assessment:
    """One assessment run as it is written: the run row, then each document's
    calls in order, each with the rows its reply gives.

    `run` is the row of a run taken up where it stopped, and `existing` the
    rows it already holds, {version id: rows} in `index_store.assessment_rows`'s
    shape. Both are omitted for a fresh run."""

    def __init__(self, store, config, panels, call_model, panel=PANEL, run=None,
                 existing=None):
        self.store, self.config, self.panels = store, config, panels
        self.call_model, self.panel = call_model, panel
        self.run = run
        self.run_id = run["id"] if run is not None else None
        # Whether the run row exists, so a stop can name it.
        self.written = run is not None
        self.existing = existing or {}
        # What the run's calls had already billed, read from the calls rather
        # than from the run row, whose cost a process killed outright never
        # wrote. This asking's costs are `costs`.
        self.earlier_cost = summed(call.get("cost_usd") for rows in self.existing.values()
                                   for call in rows["calls"])
        self.costs = []

    def start(self, created_by, estimate):
        """Open the run. A run taken up goes back to running, its start kept
        and its error and finish cleared; it keeps the author and the estimate
        it was started with, so `created_by` and `estimate` are a fresh run's.

        A fresh run's row is inserted pending, then marked running. The second
        write is retried once; if it still fails, that is reported on stderr
        with the run id, so an operator can find and close the row by hand, and
        the failure is raised, which the caller's `finish(stopped)` marks
        `error`, so the run never stays silently `pending`."""
        if self.run is not None:
            patch = {"status": "running", "error": None, "finished_at": None}
            if not self.run.get("started_at"):
                patch["started_at"] = now()
            self.store.update("aci_assessment_runs", {"id": self.run_id}, patch)
            return
        self.run_id = str(uuid.uuid4())
        self.store.insert("aci_assessment_runs", [{
            "id": self.run_id, "created_by": created_by, "status": "pending",
            "panels": self.panels,
            "prompts": {question: assessment_call.prompt_sha256(question)
                        for question in PROMPTS},
            "config": {"substitutes": self.config.get("substitutes", {})},
            "estimated_usd": estimate}])
        self.written = True
        patch = {"status": "running", "started_at": now()}
        try:
            self.store.update("aci_assessment_runs", {"id": self.run_id}, patch)
        except Exception:
            try:
                self.store.update("aci_assessment_runs", {"id": self.run_id}, patch)
            except Exception as failed:
                print(f"assessment run {self.run_id} could not be marked running, "
                      f"even on retry: {failed}. It is inserted pending; find and "
                      "close it by hand.", file=sys.stderr)
                raise

    def finish(self, stopped=None):
        """Close the run, its cost what its calls had billed before and what
        this asking billed, together."""
        patch = {"status": "done", "cost_usd": summed([self.earlier_cost] + self.costs),
                 "finished_at": now()}
        if stopped is not None:
            patch.update(status="error", error=seat_call.stop_error(stopped))
        self.store.update("aci_assessment_runs", {"id": self.run_id}, patch)

    def call(self, version, question, seat, system, user, parse, seated, existing=None):
        """One seat answering one question about one document, written pending,
        running, then done or error. Returns (call id, what `parse` made of the
        reply, the model that answered), the second and third None when no
        candidate answered.

        `existing` is the call's row when the run already holds one. A done
        call is not asked again: its id and model are returned with what
        `parse` makes of the reply it stored. A call in any other status is
        asked again in that same row, set back to running: its earlier
        attempts are kept and this asking's appended, and its cost and tokens
        are the earlier totals and this asking's together.

        A done call stores its reply in `raw_output` in full, whether it
        parsed completely or not, which is what lets a run taken up again
        rebuild the rows it gave. A call nobody answered keeps the last text a
        refused candidate gave, if one gave any.

        `seated` is passed straight to `ask_with_substitutes`: every model that
        must not answer this question for this document a second time. The
        caller builds it as the seats of one question answer, so a substitute
        already seated by an earlier seat's call is skipped rather than asked
        again.

        The call's cost and tokens are every billed attempt's, a refused one
        included; its seconds and finish reason are the answering reply's. A
        `KeyboardInterrupt`, a `SystemExit` or a `seat_call.Unreachable`
        raised mid-call still leaves the call `error` with whatever attempts
        were already billed, and their cost in the run's total, because
        `substituted` is the same list `ask_with_substitutes` was filling in
        place when it was stopped. A model that could not be reached is
        recorded as `unreachable: ` and why."""
        if existing is not None and existing["status"] == "done":
            parsed, _complete = parse(existing["raw_output"])
            return existing["id"], parsed, existing["model"]
        earlier = existing or {}
        if existing is None:
            call_id = str(uuid.uuid4())
            match = {"id": call_id}
            self.store.insert("aci_assessment_calls", [{
                "id": call_id, "run_id": self.run_id, "spec_version_id": version["id"],
                "question": question, "seat": seat, "status": "pending"}])
            self.store.update("aci_assessment_calls", match,
                              {"status": "running", "started_at": now()})
        else:
            call_id = existing["id"]
            match = {"id": call_id}
            reopened = {"status": "running", "error": None, "finished_at": None}
            if not existing.get("started_at"):
                reopened["started_at"] = now()
            self.store.update("aci_assessment_calls", match, reopened)
        print(f"  {seat} {question} on {name_of(version)} ...", flush=True)

        def metered(attempts, substituted, answer):
            """(this asking's cost, the row's attempts, cost and tokens with
            the earlier ones it already carried)."""
            cost = summed(attempt["cost_usd"] for attempt in attempts)
            return cost, {
                "attempts": (earlier.get("attempts") or []) + attempts,
                "cost_usd": summed([earlier.get("cost_usd"), cost]),
                "prompt_tokens": summed([earlier.get("prompt_tokens"), summed_tokens(
                    "prompt_tokens", substituted, answer)]),
                "completion_tokens": summed([earlier.get("completion_tokens"), summed_tokens(
                    "completion_tokens", substituted, answer)])}

        substituted, answer, billed = [], None, False
        try:
            tag, answer, substituted, refused = assessment_run.ask_with_substitutes(
                seat, system, user, self.config, self.call_model, self.panel,
                seated=seated, substituted=substituted)
            cost, meter = metered(attempt_rows(tag, answer, substituted), substituted, answer)
            self.costs.append(cost)
            billed = True
            if answer is None:
                self.store.update("aci_assessment_calls", match, {
                    "status": "error", "error": assessment_run.last_failure(substituted),
                    **meter, "raw_output": refused[-1][1] if refused else earlier.get("raw_output"),
                    "finished_at": now()})
                return call_id, None, None
            parsed, _complete = parse(answer["reply"])
        except BaseException as stopped:
            if not billed:
                cost, meter = metered(attempt_rows(None, None, substituted), substituted, None)
                self.costs.append(cost)
            self.store.update("aci_assessment_calls", match, {
                "status": "error", "error": seat_call.stop_error(stopped), **meter,
                "finished_at": now()})
            raise
        self.store.update("aci_assessment_calls", match, {
            "status": "done", "model": tag, **meter, "raw_output": answer["reply"],
            "finish_reason": answer["finish_reason"], "seconds": answer["seconds"],
            "error": None, "finished_at": now()})
        return call_id, parsed, tag

    def insert(self, table, rows):
        if rows:
            self.store.insert(table, rows)

    def insert_new(self, table, rows, held, key):
        """Insert every row of `rows` whose `key` columns are not in `held`,
        and add those to it: a row the run already holds is never written
        twice."""
        new = [row for row in rows if tuple(row[column] for column in key) not in held]
        held.update(tuple(row[column] for column in key) for row in new)
        self.insert(table, new)

    def document(self, document):
        """Criteria per criteria seat, contradictions per contradictions seat,
        the pooled claims with their finders' verdicts, then a confirmation per
        contradictions seat that has claims it did not find.

        Within each question, `seated` starts at the question's configured
        seats, and the model of every call of it the run already holds done,
        and gains every model that answers it, so a later seat's substitute
        never repeats a model this document has already had answer the same
        question.

        What the run already holds about the document is kept (the module's
        docstring says how), so a fresh run and one taken up again are one
        loop. A document `only_a_new_run` names is refused."""
        version, passages, labelled = (document["version"], document["passages"],
                                       document["labelled"])
        rows = self.existing.get(version["id"]) or empty_rows()
        refusal = only_a_new_run(rows, self.panels)
        if refusal is not None:
            raise SystemExit(f"{name_of(version)} cannot be taken up again: {refusal}. "
                             "Assess it in a new run.")
        calls = {(call["question"], call["seat"]): call for call in rows["calls"]}
        scored = {(row["call_id"], row["criterion"]) for row in rows["scores"]}
        read = {(row["claim_id"], row["seat"]) for row in rows["verdicts"]}
        written = {(row["first_locator"], row["second_locator"]): row["id"]
                   for row in rows["claims"]}

        def ask(question, seat, system, user, parse, seated):
            call_id, parsed, tag = self.call(version, question, seat, system, user, parse,
                                             seated, calls.get((question, seat)))
            if tag is not None:
                seated.add(tag)
            return call_id, parsed

        seated = seated_at_start("criteria", self.panels["criteria"], rows)
        for seat in self.panels["criteria"]:
            system, user = assessment_call.compose("criteria", labelled)
            call_id, parsed = ask("criteria", seat, system, user, parse_criteria(passages),
                                  seated)
            if parsed is not None:
                self.insert_new("aci_assessment_scores",
                                criteria_scores(call_id, parsed, passages), scored,
                                ("call_id", "criterion"))

        seats = self.panels["contradictions"]
        seated = seated_at_start("contradictions", seats, rows)
        found, finder_calls = {}, {}
        for seat in seats:
            system, user = assessment_call.compose("contradictions", labelled)
            call_id, parsed = ask("contradictions", seat, system, user,
                                  parse_contradictions(passages), seated)
            finder_calls[seat] = call_id
            if parsed is not None:
                found[seat] = parsed["items"]
                self.insert_new("aci_assessment_scores", contradictions_scores(call_id, parsed),
                                scored, ("call_id", "criterion"))

        # A claim whose two passages share a locator gets no row (it is
        # counted as unreadable on the finder's call), so it is dropped before
        # anything else: no verdict or confirmation is asked about a claim
        # nothing was written for. A claim the run already wrote keeps its id.
        pooled = distinct_claims(assessment_run.pool_claims(found, seats), passages)
        claim_ids = [written.get(locator_pair(claim, passages)) or str(uuid.uuid4())
                     for claim in pooled]
        self.insert_new("aci_assessment_claims",
                        claim_rows(self.run_id, version["id"], pooled, claim_ids, passages),
                        set(written), ("first_locator", "second_locator"))
        self.insert_new("aci_assessment_verdicts", [
            {"claim_id": claim_id, "call_id": finder_calls[seat], "seat": seat,
             "holds": True, "absolute": None, "reason": "found it"}
            for claim_id, claim in zip(claim_ids, pooled) for seat in claim["found_by"]],
            read, ("claim_id", "seat"))

        seated = seated_at_start("confirm", seats, rows)
        for seat in seats:
            to_confirm = assessment_run.claims_to_confirm(pooled, seat)
            if not to_confirm:
                continue
            claims = [claim for _i, claim in to_confirm]
            system, user = assessment_call.compose_confirm(labelled, claims)
            call_id, verdicts = ask("confirm", seat, system, user, parse_confirm(claims), seated)
            if verdicts is None:
                continue
            self.insert_new("aci_assessment_verdicts", [
                {"claim_id": claim_ids[i], "call_id": call_id, "seat": seat,
                 "holds": verdict["holds"], "absolute": verdict["absolute"],
                 "reason": verdict["reason"]}
                for i, verdict in assessment_run.by_claim(to_confirm, verdicts).items()],
                read, ("claim_id", "seat"))
