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
    """One row per pooled claim, its two locators in code point order, which is
    the byte order the table's `collate "C"` compares them in."""
    rows = []
    for claim_id, claim in zip(claim_ids, pooled):
        first, second = sorted((passages[claim["first"] - 1][0],
                                passages[claim["second"] - 1][0]))
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
        self.run_id = str(uuid.uuid4())
        self.store.insert("aci_assessment_runs", [{
            "id": self.run_id, "created_by": created_by, "status": "pending",
            "panels": self.panels,
            "prompts": {question: assessment_call.prompt_sha256(question)
                        for question in PROMPTS},
            "config": {"substitutes": self.config.get("substitutes", {})},
            "estimated_usd": estimate}])
        self.store.update("aci_assessment_runs", {"id": self.run_id},
                          {"status": "running", "started_at": now()})

    def finish(self, stopped=None):
        patch = {"status": "done", "cost_usd": summed(self.costs), "finished_at": now()}
        if stopped is not None:
            patch.update(status="error", error=str(stopped)[:1000] or type(stopped).__name__)
        self.store.update("aci_assessment_runs", {"id": self.run_id}, patch)

    def call(self, version, question, seat, system, user, parse):
        """One seat answering one question about one document, written pending,
        running, then done or error. Returns (call id, what `parse` made of the
        reply), the second None when no candidate answered.

        The call's cost is every billed attempt's, a refused one included; its
        tokens, seconds and finish reason are the answering reply's."""
        call_id = str(uuid.uuid4())
        match = {"id": call_id}
        self.store.insert("aci_assessment_calls", [{
            "id": call_id, "run_id": self.run_id, "spec_version_id": version["id"],
            "question": question, "seat": seat, "status": "pending"}])
        self.store.update("aci_assessment_calls", match,
                          {"status": "running", "started_at": now()})
        print(f"  {seat} {question} on {name_of(version)} ...", flush=True)
        try:
            tag, answer, substituted, refused = assessment_run.ask_with_substitutes(
                seat, system, user, self.config, self.call_model, self.panel,
                seated=self.panels["contradictions" if question == "confirm" else question])
            attempts = attempt_rows(tag, answer, substituted)
            cost = summed(attempt["cost_usd"] for attempt in attempts)
            self.costs.append(cost)
            if answer is None:
                self.store.update("aci_assessment_calls", match, {
                    "status": "error", "error": assessment_run.last_failure(substituted),
                    "attempts": attempts, "cost_usd": cost,
                    "raw_output": refused[-1][1] if refused else None,
                    "finished_at": now()})
                return call_id, None
            parsed, complete = parse(answer["reply"])
        except BaseException as stopped:
            self.store.update("aci_assessment_calls", match, {
                "status": "error", "error": str(stopped)[:1000] or type(stopped).__name__,
                "finished_at": now()})
            raise
        usage = answer["usage"] or {}
        self.store.update("aci_assessment_calls", match, {
            "status": "done", "model": tag, "attempts": attempts,
            "raw_output": None if complete else answer["reply"],
            "finish_reason": answer["finish_reason"],
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "cost_usd": cost, "seconds": answer["seconds"], "error": None,
            "finished_at": now()})
        return call_id, parsed

    def insert(self, table, rows):
        if rows:
            self.store.insert(table, rows)

    def document(self, document):
        """Criteria per criteria seat, contradictions per contradictions seat,
        the pooled claims with their finders' verdicts, then a confirmation per
        contradictions seat that has claims it did not find."""
        version, passages, labelled = (document["version"], document["passages"],
                                       document["labelled"])
        for seat in self.panels["criteria"]:
            system, user = assessment_call.compose("criteria", labelled)
            call_id, parsed = self.call(version, "criteria", seat, system, user,
                                        parse_criteria(passages))
            if parsed is not None:
                self.insert("aci_assessment_scores", criteria_scores(call_id, parsed, passages))

        seats = self.panels["contradictions"]
        found, finder_calls = {}, {}
        for seat in seats:
            system, user = assessment_call.compose("contradictions", labelled)
            call_id, parsed = self.call(version, "contradictions", seat, system, user,
                                        parse_contradictions(passages))
            finder_calls[seat] = call_id
            if parsed is not None:
                found[seat] = parsed["items"]
                self.insert("aci_assessment_scores", contradictions_scores(call_id, parsed))

        pooled = assessment_run.pool_claims(found, seats)
        claim_ids = [str(uuid.uuid4()) for _claim in pooled]
        self.insert("aci_assessment_claims",
                    claim_rows(self.run_id, version["id"], pooled, claim_ids, passages))
        self.insert("aci_assessment_verdicts", [
            {"claim_id": claim_id, "call_id": finder_calls[seat], "seat": seat,
             "holds": True, "absolute": None, "reason": "found it"}
            for claim_id, claim in zip(claim_ids, pooled) for seat in claim["found_by"]])

        for seat in seats:
            to_confirm = assessment_run.claims_to_confirm(pooled, seat)
            if not to_confirm:
                continue
            claims = [claim for _i, claim in to_confirm]
            system, user = assessment_call.compose_confirm(labelled, claims)
            call_id, verdicts = self.call(version, "confirm", seat, system, user,
                                          parse_confirm(claims))
            if verdicts is None:
                continue
            self.insert("aci_assessment_verdicts", [
                {"claim_id": claim_ids[i], "call_id": call_id, "seat": seat,
                 "holds": verdict["holds"], "absolute": verdict["absolute"],
                 "reason": verdict["reason"]}
                for i, verdict in assessment_run.by_claim(to_confirm, verdicts).items()])
