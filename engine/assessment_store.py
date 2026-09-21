"""An assessment run, as it is written to the `aci_assessment_` tables.

`engine/assess.py` prices an assessment and, with --go, hands it here. This
module runs each document's calls in order through `assessment_run`'s rules and
writes what they give: the run row, each call as it moves from pending to
running to done or error, the scores each reply gives, the pooled claims and
every verdict on them, the finders' included.

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


def claim_rows(run_id, version_id, pooled, claim_ids, passages):
    """One row per pooled claim whose two passages resolve to different
    locators, its two locators in code point order, which is the byte order
    the table's `collate "C"` compares them in.

    A claim whose two passages resolve to the same locator is counted as
    unreadable on the finder's call and gets no row, so the table's
    `first_locator < second_locator` check can never refuse a row after the
    calls that found the claim were already paid for."""
    rows = []
    for claim_id, claim in zip(claim_ids, pooled):
        first, second = sorted((passages[claim["first"] - 1][0],
                                passages[claim["second"] - 1][0]))
        if first == second:
            continue
        rows.append({"id": claim_id, "run_id": run_id, "spec_version_id": version_id,
                     "first_locator": first, "second_locator": second,
                     "situation": claim["situation"], "why": claim["why"],
                     "found_by": claim["found_by"]})
    return rows


class Assessment:
    """One assessment run as it is written: the run row, then each document's
    calls in order, each with the rows its reply gives."""

    def __init__(self, store, config, panels, call_model, panel=PANEL):
        self.store, self.config, self.panels = store, config, panels
        self.call_model, self.panel = call_model, panel
        self.costs = []
        self.run_id = None

    def start(self, created_by, estimate):
        """Insert the run row pending, then mark it running. The second write
        is retried once; if it still fails, that is reported on stderr with
        the run id, so an operator can find and close the row by hand, and the
        failure is raised, which the caller's `finish(stopped)` marks `error`,
        so the run never stays silently `pending`."""
        self.run_id = str(uuid.uuid4())
        self.store.insert("aci_assessment_runs", [{
            "id": self.run_id, "created_by": created_by, "status": "pending",
            "panels": self.panels,
            "prompts": {question: assessment_call.prompt_sha256(question)
                        for question in PROMPTS},
            "config": {"substitutes": self.config.get("substitutes", {})},
            "estimated_usd": estimate}])
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
        patch = {"status": "done", "cost_usd": summed(self.costs), "finished_at": now()}
        if stopped is not None:
            patch.update(status="error", error=str(stopped)[:1000] or type(stopped).__name__)
        self.store.update("aci_assessment_runs", {"id": self.run_id}, patch)

    def call(self, version, question, seat, system, user, parse, seated):
        """One seat answering one question about one document, written pending,
        running, then done or error. Returns (call id, what `parse` made of the
        reply, the model that answered), the second and third None when no
        candidate answered.

        `seated` is passed straight to `ask_with_substitutes`: every model that
        must not answer this question for this document a second time. The
        caller builds it as the seats of one question answer, so a substitute
        already seated by an earlier seat's call is skipped rather than asked
        again.

        The call's cost and tokens are every billed attempt's, a refused one
        included; its seconds and finish reason are the answering reply's. A
        `KeyboardInterrupt` or a `SystemExit` raised mid-call still leaves the
        call `error` with whatever attempts were already billed, and their cost
        in the run's total, because `substituted` is the same list
        `ask_with_substitutes` was filling in place when it was interrupted."""
        call_id = str(uuid.uuid4())
        match = {"id": call_id}
        self.store.insert("aci_assessment_calls", [{
            "id": call_id, "run_id": self.run_id, "spec_version_id": version["id"],
            "question": question, "seat": seat, "status": "pending"}])
        self.store.update("aci_assessment_calls", match,
                          {"status": "running", "started_at": now()})
        print(f"  {seat} {question} on {name_of(version)} ...", flush=True)
        substituted, billed = [], False
        try:
            tag, answer, substituted, refused = assessment_run.ask_with_substitutes(
                seat, system, user, self.config, self.call_model, self.panel,
                seated=seated, substituted=substituted)
            attempts = attempt_rows(tag, answer, substituted)
            cost = summed(attempt["cost_usd"] for attempt in attempts)
            self.costs.append(cost)
            billed = True
            if answer is None:
                self.store.update("aci_assessment_calls", match, {
                    "status": "error", "error": assessment_run.last_failure(substituted),
                    "attempts": attempts, "cost_usd": cost,
                    "raw_output": refused[-1][1] if refused else None,
                    "finished_at": now()})
                return call_id, None, None
            parsed, complete = parse(answer["reply"])
        except BaseException as stopped:
            if not billed:
                attempts = attempt_rows(None, None, substituted)
                cost = summed(attempt["cost_usd"] for attempt in attempts)
                self.costs.append(cost)
            self.store.update("aci_assessment_calls", match, {
                "status": "error", "error": str(stopped)[:1000] or type(stopped).__name__,
                "attempts": attempts, "cost_usd": cost, "finished_at": now()})
            raise
        self.store.update("aci_assessment_calls", match, {
            "status": "done", "model": tag, "attempts": attempts,
            "raw_output": None if complete else answer["reply"],
            "finish_reason": answer["finish_reason"],
            "prompt_tokens": summed_tokens("prompt_tokens", substituted, answer),
            "completion_tokens": summed_tokens("completion_tokens", substituted, answer),
            "cost_usd": cost, "seconds": answer["seconds"], "error": None,
            "finished_at": now()})
        return call_id, parsed, tag

    def insert(self, table, rows):
        if rows:
            self.store.insert(table, rows)

    def document(self, document):
        """Criteria per criteria seat, contradictions per contradictions seat,
        the pooled claims with their finders' verdicts, then a confirmation per
        contradictions seat that has claims it did not find.

        Within each question, `seated` starts at the question's configured
        seats and gains every model that answers it, so a later seat's
        substitute never repeats a model this document has already had answer
        the same question."""
        version, passages, labelled = (document["version"], document["passages"],
                                       document["labelled"])
        seated = set(self.panels["criteria"])
        for seat in self.panels["criteria"]:
            system, user = assessment_call.compose("criteria", labelled)
            call_id, parsed, tag = self.call(version, "criteria", seat, system, user,
                                             parse_criteria(passages), seated)
            if tag is not None:
                seated.add(tag)
            if parsed is not None:
                self.insert("aci_assessment_scores", criteria_scores(call_id, parsed, passages))

        seats = self.panels["contradictions"]
        seated = set(seats)
        found, finder_calls = {}, {}
        for seat in seats:
            system, user = assessment_call.compose("contradictions", labelled)
            call_id, parsed, tag = self.call(version, "contradictions", seat, system, user,
                                             parse_contradictions(passages), seated)
            if tag is not None:
                seated.add(tag)
            finder_calls[seat] = call_id
            if parsed is not None:
                found[seat] = parsed["items"]
                self.insert("aci_assessment_scores", contradictions_scores(call_id, parsed))

        pooled = assessment_run.pool_claims(found, seats)
        claim_ids = [str(uuid.uuid4()) for _claim in pooled]
        rows = claim_rows(self.run_id, version["id"], pooled, claim_ids, passages)
        # A claim whose two passages share a locator got no row above (it is
        # counted as unreadable on the finder's call): drop it here too, so no
        # verdict or confirmation is asked about a claim nothing was written
        # for.
        written = {row["id"] for row in rows}
        pooled, claim_ids = (
            [claim for claim, claim_id in zip(pooled, claim_ids) if claim_id in written],
            [claim_id for claim_id in claim_ids if claim_id in written])
        self.insert("aci_assessment_claims", rows)
        self.insert("aci_assessment_verdicts", [
            {"claim_id": claim_id, "call_id": finder_calls[seat], "seat": seat,
             "holds": True, "absolute": None, "reason": "found it"}
            for claim_id, claim in zip(claim_ids, pooled) for seat in claim["found_by"]])

        seated = set(seats)
        for seat in seats:
            to_confirm = assessment_run.claims_to_confirm(pooled, seat)
            if not to_confirm:
                continue
            claims = [claim for _i, claim in to_confirm]
            system, user = assessment_call.compose_confirm(labelled, claims)
            call_id, verdicts, tag = self.call(version, "confirm", seat, system, user,
                                               parse_confirm(claims), seated)
            if tag is not None:
                seated.add(tag)
            if verdicts is None:
                continue
            self.insert("aci_assessment_verdicts", [
                {"claim_id": claim_ids[i], "call_id": call_id, "seat": seat,
                 "holds": verdict["holds"], "absolute": verdict["absolute"],
                 "reason": verdict["reason"]}
                for i, verdict in assessment_run.by_claim(to_confirm, verdicts).items()])
