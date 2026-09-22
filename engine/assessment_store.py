"""An assessment run, as it is written to the `aci_assessment_` tables.

`engine/assess.py` prices an assessment and, with --go, hands it here. This
module runs each document's calls in order through `assessment_run`'s rules and
writes what they give: the run row, each call as it moves from pending to
running to done or error, the scores each criteria reply gives, the claims
pooled across the versions of each document, and every seat's reading of every
claim of a version, its own findings included.

The versions of one document (one spec id) the run is asked to assess are
assessed together, because their findings are pooled: every version is read
for its criteria and searched for contradictions first, then each version's
claims are written and read. A run that takes its criteria from an earlier run
(`criteria_from`, `assess.py --criteria-from`) never asks the criteria.

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


def larger(*costs):
    """The largest of the costs known, or None when none is."""
    known = [cost for cost in costs if cost is not None]
    return max(known) if known else None


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


def locator_pair(claim, passages):
    """A pooled claim's two passages as their locators, in code point order,
    which is the byte order the table's `collate "C"` compares them in."""
    return tuple(sorted((passages[claim["first"] - 1][0], passages[claim["second"] - 1][0])))


def groups(documents):
    """`documents` in groups, one per document of the index (a spec id), each
    in the order its versions are named, the groups in the order each first
    appears. The findings of one group are pooled."""
    by_spec = {}
    for document in documents:
        by_spec.setdefault(document["version"]["spec_id"], []).append(document)
    return list(by_spec.values())


def pooled_claims(documents, found, seats):
    """{version id: claims}, the claims of each of `documents`, the versions of
    one document, pooled across all of them from `found`, {version id: {seat:
    items}}, by `assessment_run.pool_versions`.

    The versions are pooled in the order of their version, whatever order they
    were named in, so a run and a resume that names them otherwise pool the same
    claims. Pricing a reading (`to_ask`) and asking it (`Assessment.group`) both
    read the claims from here, so the claims priced are the claims asked about."""
    ordered = sorted(documents, key=lambda d: (d["version"]["version"], d["version"]["id"]))
    return assessment_run.pool_versions(
        {d["version"]["id"]: found.get(d["version"]["id"], {}) for d in ordered},
        {d["version"]["id"]: d["passages"] for d in ordered}, seats)


def claim_rows(run_id, version_id, pooled, claim_ids, passages):
    """One row per pooled claim whose two passages resolve to different
    locators, its two locators in code point order (`locator_pair`).

    `assessment_run.pool_versions` makes no claim of one locator twice, so the
    table's `first_locator < second_locator` check can never refuse a row after
    the calls that found the claim were already paid for; the check here keeps
    it so."""
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


def only_a_new_run(group, panels):
    """Why taking the run up again cannot finish assessing the versions of one
    document in `group`, [(version row, rows the run holds about it)], every
    version of it the run is asked to assess, or None when it can. It answers
    for the group as a whole, since their claims are pooled together.

    Once a version's claims are written, every contradictions seat reads them.
    A contradictions seat with no done call on one of these versions by then
    (possible only when its every candidate failed, since a stop raises before
    claims are written) cannot be asked again: what it found could change
    claims already read, on that version or on another that reads the same. A
    version the run has not begun, beside one whose claims are written, is
    such a version for every seat. And a done call whose reply was not stored
    cannot have its rows rebuilt."""
    several = len(group) > 1

    def on(version):
        return f" on {name_of(version)}" if several else ""
    if any(rows["claims"] for _version, rows in group):
        silent = [f"{seat}{on(version)}" for version, rows in group
                  for seat in panels["contradictions"]
                  if ("contradictions", seat) not in done_calls(rows)]
        if silent:
            return (f"its claimed contradictions are written and already read, and "
                    f"{' and '.join(silent)} gave no contradictions answer, so asking again "
                    "now would change claims other seats have already read")
    unkept = [f"{call['seat']} {call['question']}{on(version)}" for version, rows in group
              for call in rows["calls"]
              if call["status"] == "done" and call.get("raw_output") is None]
    if unkept:
        return (f"no reply was stored for {', '.join(unkept)}, so the rows it gave cannot "
                "be rebuilt")
    return None


def to_ask(documents, rows, panels, criteria=True):
    """{version id: [(question, seat, claims)]} for every call assessing
    `documents`, the versions of one document the run is asked to assess, can
    make, given `rows`, {version id: the rows the run already holds about it},
    in the order each version's calls are made: every seat of each question
    asked with no done call, then every reading not done of a version that has
    claims to read. With `criteria` false no criteria call is listed, since
    the run takes them from another.

    `claims` is what a reading will be asked about, every claim of its version,
    and None for a question that is not a reading. It is None for a reading too
    while a contradictions seat has still to answer on any of these versions,
    since the claims pooled across them are not known yet: every
    contradictions seat's reading of every version is then listed, as
    `assessment_run.price_document` prices it."""
    seats = panels["contradictions"]
    done = {d["version"]["id"]: done_calls(rows.get(d["version"]["id"]) or empty_rows())
            for d in documents}
    asked = {version_id: [(question, seat, None)
                          for question in assessment_run.questions(criteria)
                          for seat in panels[question] if (question, seat) not in held]
             for version_id, held in done.items()}
    if not all(("contradictions", seat) in held for held in done.values() for seat in seats):
        for version_id, held in done.items():
            asked[version_id] += [("confirm", seat, None) for seat in seats
                                  if ("confirm", seat) not in held]
        return asked
    found = {d["version"]["id"]: {
        seat: parse_contradictions(d["passages"])(
            done[d["version"]["id"]][("contradictions", seat)]["raw_output"])[0]["items"]
        for seat in seats} for d in documents}
    for version_id, claims in pooled_claims(documents, found, seats).items():
        if claims:
            asked[version_id] += [("confirm", seat, claims) for seat in seats
                                  if ("confirm", seat) not in done[version_id]]
    return asked


class Assessment:
    """One assessment run as it is written: the run row, then each document's
    calls in order, each with the rows its reply gives.

    `run` is the row of a run taken up where it stopped, and `existing` the
    rows it already holds, {version id: rows} in `index_store.assessment_rows`'s
    shape. Both are omitted for a fresh run. `criteria_from` is the row of the
    run whose criteria this run takes, fresh or taken up: it then asks no
    criteria call."""

    def __init__(self, store, config, panels, call_model, panel=PANEL, run=None,
                 existing=None, criteria_from=None):
        self.store, self.config, self.panels = store, config, panels
        self.call_model, self.panel = call_model, panel
        self.run = run
        self.criteria_from = criteria_from
        self.run_id = run["id"] if run is not None else None
        # Whether the run row exists, so a stop can name it.
        self.written = run is not None
        self.existing = existing or {}
        # What the run had already billed: the larger of the run row's cost and
        # its calls' costs summed. A process killed outright never writes the
        # run row's cost, while its calls carry theirs; a call whose own writes
        # failed carries nothing, while the run row closed after it counts it.
        # This asking's costs are `costs`.
        self.earlier_cost = larger(
            (run or {}).get("cost_usd"),
            summed(call.get("cost_usd") for rows in self.existing.values()
                   for call in rows["calls"]))
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
        panels = dict(self.panels)
        prompts = {question: assessment_call.prompt_sha256(question) for question in PROMPTS}
        config = {"substitutes": self.config.get("substitutes", {})}
        if self.criteria_from is not None:
            # What the criteria were asked under is the earlier run's record.
            panels["criteria"] = list(self.criteria_from["panels"]["criteria"])
            prompts["criteria"] = self.criteria_from["prompts"]["criteria"]
            config["criteria_from"] = self.criteria_from["id"]
        self.store.insert("aci_assessment_runs", [{
            "id": self.run_id, "created_by": created_by, "status": "pending",
            "panels": panels, "prompts": prompts, "config": config,
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
        """Close the run, its cost what it had billed before (`earlier_cost`)
        and what this asking billed, together."""
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
        refused candidate gave, if one gave any. A call stopped after its reply
        came back, while that reply was parsed or written done, keeps the
        reply too, although it is left error and asked again on resuming.

        `seated` is passed straight to `ask_with_substitutes`: every model that
        must not answer this question for this document a second time. The
        caller builds it as the seats of one question answer, so a substitute
        already seated by an earlier seat's call is skipped rather than asked
        again.

        The call's cost and tokens are every billed attempt's, a refused one
        included; its seconds and finish reason are the answering reply's. A
        `KeyboardInterrupt`, a `SystemExit` or a `seat_call.Unreachable`
        raised mid-call, or a store failure while the call is written done,
        still leaves the call `error` with whatever attempts were already
        billed, and their cost in the run's total, because `substituted` is
        the same list `ask_with_substitutes` was filling in place when it was
        stopped. A model that could not be reached is recorded as
        `unreachable: ` and why."""
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
            # Inside the block: a stop during this write comes after the reply
            # was paid for, so it is handled as any other stop after billing.
            self.store.update("aci_assessment_calls", match, {
                "status": "done", "model": tag, **meter, "raw_output": answer["reply"],
                "finish_reason": answer["finish_reason"], "seconds": answer["seconds"],
                "error": None, "finished_at": now()})
        except BaseException as stopped:
            if not billed:
                cost, meter = metered(attempt_rows(None, None, substituted), substituted, None)
                self.costs.append(cost)
            patch = {"status": "error", "error": seat_call.stop_error(stopped), **meter,
                     "finished_at": now()}
            if answer is not None:
                # A reply paid for and not yet marked done: kept, although the
                # row is error and a resume asks the seat again.
                patch["raw_output"] = answer["reply"]
            self.store.update("aci_assessment_calls", match, patch)
            raise
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

    def group(self, documents):
        """The versions of one document the run is asked to assess, together:
        each version's criteria, per criteria seat, unless the run takes them
        from another run, and its contradictions, per contradictions seat, in
        the order the versions are named; then, once every version has been
        searched, each version's claims, pooled across them all
        (`pooled_claims`), and every contradictions seat's reading of every
        claim of that version.

        Within each question and version, `seated` starts at the question's
        configured seats, and the model of every call of it the run already
        holds done, and gains every model that answers it, so a later seat's
        substitute never repeats a model that version has already had answer
        the same question.

        What the run already holds about the versions is kept (the module's
        docstring says how), so a fresh run and one taken up again are one
        loop. A group `only_a_new_run` names is refused."""
        held = {d["version"]["id"]: self.existing.get(d["version"]["id"]) or empty_rows()
                for d in documents}
        refusal = only_a_new_run([(d["version"], held[d["version"]["id"]]) for d in documents],
                                 self.panels)
        if refusal is not None:
            names = ", ".join(name_of(d["version"]) for d in documents)
            raise SystemExit(f"{names} cannot be taken up again: {refusal}. "
                             "Assess them in a new run.")
        found = {d["version"]["id"]: self.search(d, held[d["version"]["id"]]) for d in documents}
        pooled = pooled_claims(documents, found, self.panels["contradictions"])
        for d in documents:
            self.read(d, held[d["version"]["id"]], pooled[d["version"]["id"]])

    def ask(self, version, rows, question, seat, system, user, parse, seated):
        """`call`, for the call of `question` and `seat` about `version`,
        whose rows are `rows`, adding the model that answered to `seated`."""
        existing = next((call for call in rows["calls"]
                         if (call["question"], call["seat"]) == (question, seat)), None)
        call_id, parsed, tag = self.call(version, question, seat, system, user, parse,
                                         seated, existing)
        if tag is not None:
            seated.add(tag)
        return call_id, parsed

    def search(self, document, rows):
        """One version's criteria, unless the run takes them from another run,
        with the scores each reply gives, then its contradictions. Returns
        {seat: items} for every contradictions seat that answered."""
        version, passages, labelled = (document["version"], document["passages"],
                                       document["labelled"])
        scored = {(row["call_id"], row["criterion"]) for row in rows["scores"]}
        if self.criteria_from is None:
            seated = seated_at_start("criteria", self.panels["criteria"], rows)
            system, user = assessment_call.compose("criteria", labelled)
            for seat in self.panels["criteria"]:
                call_id, parsed = self.ask(version, rows, "criteria", seat, system, user,
                                           parse_criteria(passages), seated)
                if parsed is not None:
                    self.insert_new("aci_assessment_scores",
                                    criteria_scores(call_id, parsed, passages), scored,
                                    ("call_id", "criterion"))
        seats = self.panels["contradictions"]
        seated = seated_at_start("contradictions", seats, rows)
        system, user = assessment_call.compose("contradictions", labelled)
        found = {}
        for seat in seats:
            _call_id, parsed = self.ask(version, rows, "contradictions", seat, system, user,
                                        parse_contradictions(passages), seated)
            if parsed is not None:
                found[seat] = parsed["items"]
        return found

    def read(self, document, rows, claims):
        """One version's claims, written, then read by every contradictions
        seat, each reading every claim, the ones it found included. A version
        with no claim is read by nobody. A claim the run already wrote keeps
        its id, and a reading already written is not written twice."""
        version, passages, labelled = (document["version"], document["passages"],
                                       document["labelled"])
        written = {(row["first_locator"], row["second_locator"]): row["id"]
                   for row in rows["claims"]}
        read = {(row["claim_id"], row["seat"]) for row in rows["verdicts"]}
        claim_ids = [written.get(locator_pair(claim, passages)) or str(uuid.uuid4())
                     for claim in claims]
        self.insert_new("aci_assessment_claims",
                        claim_rows(self.run_id, version["id"], claims, claim_ids, passages),
                        set(written), ("first_locator", "second_locator"))
        if not claims:
            return
        seats = self.panels["contradictions"]
        seated = seated_at_start("confirm", seats, rows)
        system, user = assessment_call.compose_confirm(labelled, claims)
        for seat in seats:
            call_id, verdicts = self.ask(version, rows, "confirm", seat, system, user,
                                         parse_confirm(claims), seated)
            if verdicts is None:
                continue
            self.insert_new("aci_assessment_verdicts", [
                {"claim_id": claim_ids[position - 1], "call_id": call_id, "seat": seat,
                 "holds": verdict["holds"], "absolute": verdict["absolute"],
                 "reason": verdict["reason"]}
                for position, verdict in verdicts.items()],
                read, ("claim_id", "seat"))
