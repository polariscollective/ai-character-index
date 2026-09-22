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
claims are written and read. When a contradictions seat ends with no answer on
any of those versions, none of their claims is written and nobody reads them,
since what that seat would have found could change them: the run goes on with
the next document, and a resume asks the finding again. A run that takes its
criteria from an earlier run (`criteria_from`, `assess.py --criteria-from`)
never asks the criteria.

A run taken up where it stopped (`assess.py --resume`) goes through the same
code as a fresh one, which is a run whose documents have no rows yet. Each
document is given the rows its run already holds, and nothing already there is
asked or written again: a done call is not asked again, and any rows its reply
gives that are missing are rebuilt from the reply it stored in `raw_output`; a
call in any other status is asked again in its own row, its earlier attempts and
bill kept; a claim already written keeps its id.

A replay (`assess.py --resume --replay`) takes up a document whose claims were
written and read although one of its finders had failed, as the code before
that rule did in assessment run e2c00b2e. The failed finding is asked again in
its row; what it finds is pooled with the claims already written; and every
contradictions seat reads only the claims that are new, in a supplementary
reading recorded on its reading call for the version, which the table allows
once per run, version and seat. A claim already written is never updated, as
the database's grants require: a pair the finding found again is listed in the
replay's record instead (`also_found`). The run's config records each replay
(`replays`), and how it ended for each document (`outcomes`, `note`). The
finding calls named there are left out of the pool a reading call's first
reading is rebuilt from, so a resume reads each reading apart: the first from
`raw_output`, each supplementary one from its attempt, by the claim ids it
answered. Before a replay is priced, and again before its first call, that
pool must still give the claims written and their first readings as stored
(`replay_refusal`).

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
# How a replay ended for one document, as its record's note says it. Each
# document's finding had failed after the run had written its claims and every
# contradictions seat had read them.
OUTCOMES = {
    "answered": (
        "Its finding was asked again in its own row and answered. What it found was pooled "
        "with the claims already written: a pair already claimed kept its row, which is "
        "never updated, and is listed in also_found; a new pair became a new claim on every "
        "version where its two passages read the same. Every contradictions seat then read "
        "only the new claims, in a supplementary reading recorded among the attempts of its "
        "reading call, whose raw_output keeps the first reading. A fresh run pools every "
        "finding before any reading, so this is not exactly what a fresh run would give."),
    "failed again": (
        "Its finding was asked again in its own row and failed again, so nothing more was "
        "asked or written for it and its gap stays."),
    "not asked": (
        "Its finding had not answered when this was written: the replay had not reached "
        "it, or stopped before it answered."),
}


def replay_note(groups, outcomes):
    """What a replay's record says of how it ended, document by document."""
    return " ".join(f"{spec_id}: {outcomes.get(spec_id, 'not asked')}. "
                    f"{OUTCOMES[outcomes.get(spec_id, 'not asked')]}" for spec_id in groups)


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


def metered(earlier, attempts, substituted, answer):
    """(this asking's cost, a call row's attempts, cost and tokens once this
    asking is added to what `earlier`, the row as it stood, already carried)."""
    cost = summed(attempt["cost_usd"] for attempt in attempts)
    return cost, {
        "attempts": (earlier.get("attempts") or []) + attempts,
        "cost_usd": summed([earlier.get("cost_usd"), cost]),
        "prompt_tokens": summed([earlier.get("prompt_tokens"), summed_tokens(
            "prompt_tokens", substituted, answer)]),
        "completion_tokens": summed([earlier.get("completion_tokens"), summed_tokens(
            "completion_tokens", substituted, answer)])}


def supplementary_attempts(tag, answer, substituted, claim_ids):
    """`attempt_rows` for a supplementary reading: every attempt names the
    claims it was asked about, `claim_ids` in order, and the one that answered
    also carries its reply and seconds, since the row's own are its first
    reading's (`assessment_run.supplementary_readings` reads them back)."""
    rows = attempt_rows(tag, answer, substituted)
    for row in rows:
        row["claim_ids"] = list(claim_ids)
    if answer is not None:
        rows[-1].update(reply=answer["reply"], seconds=answer["seconds"])
    return rows


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


def spoken(items):
    """`items` as a list is said: "a", "a and b", "a, b and c"."""
    items = list(items)
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def silent_finders(group, panels):
    """[(version row, seat, call)] for every contradictions seat with no done
    call on a version of `group`, [(version row, rows the run holds about it)],
    `call` being the seat's finding call there, or None when the run holds no
    call of it to ask again."""
    silent = []
    for version, rows in group:
        held = done_calls(rows)
        for seat in panels["contradictions"]:
            if ("contradictions", seat) in held:
                continue
            silent.append((version, seat, next(
                (call for call in rows["calls"]
                 if (call["question"], call["seat"]) == ("contradictions", seat)), None)))
    return silent


def only_a_new_run(group, panels, replay=False):
    """Why taking the run up again cannot finish assessing the versions of one
    document in `group`, [(version row, rows the run holds about it)], every
    version of it the run is asked to assess, or None when it can. It answers
    for the group as a whole, since their claims are pooled together.

    Once a version's claims are written, every contradictions seat reads them,
    and the claims are written only once every contradictions seat has
    answered on every version. A run whose claims were written while a seat
    had not (assessment run e2c00b2e, as the code before that rule left it)
    cannot have that seat asked again as a resume asks any call: what it found
    could change claims already read, on that version or on another that
    reads the same. With `replay` it can (`replayable`), unless the seat was
    never asked there at all, as on a version the run has not begun beside one
    whose claims are written. And a done call whose reply was not stored
    cannot have its rows rebuilt."""
    several = len(group) > 1

    def on(version):
        return f" on {name_of(version)}" if several else ""
    if any(rows["claims"] for _version, rows in group):
        silent = silent_finders(group, panels)
        never = {}
        for version, seat, call in silent:
            if call is None:
                never.setdefault(name_of(version), []).append(seat)
        if replay and never:
            said = "; ".join(f"{spoken(seats)} {'was' if len(seats) == 1 else 'were'} never "
                             f"asked on {name}" for name, seats in never.items())
            return (f"its claimed contradictions are written and already read, and {said}, "
                    "so there is no finding to replay")
        if silent and not replay:
            return (f"its claimed contradictions are written and already read, and "
                    f"{' and '.join(f'{seat}{on(version)}' for version, seat, _call in silent)} "
                    "gave no contradictions answer, so asking again now would change claims "
                    "other seats have already read")
    unkept = [f"{call['seat']} {call['question']}{on(version)}" for version, rows in group
              for call in rows["calls"]
              if call["status"] == "done" and call.get("raw_output") is None]
    if unkept:
        return (f"no reply was stored for {', '.join(unkept)}, so the rows it gave cannot "
                "be rebuilt")
    return None


def replayable(group, panels):
    """The finding calls a replay (`assess.py --resume --replay`) asks again
    for `group`, as `only_a_new_run` takes it: when its claims are written and
    read and a contradictions seat gave no answer on one of its versions, the
    finding call of every such seat, provided each has a row to be asked again
    in. Otherwise none."""
    if not any(rows["claims"] for _version, rows in group):
        return []
    silent = silent_finders(group, panels)
    if any(call is None for _version, _seat, call in silent):
        return []
    return [call for _version, _seat, call in silent]


def replayed_calls(run):
    """The ids of every finding call a replay of `run` asked again, from the
    `replays` its config records."""
    return {call_id for record in ((run or {}).get("config") or {}).get("replays") or []
            for call_id in record.get("calls") or []}


def first_found(documents, found, rows, replayed):
    """`found`, {version id: {seat: items}}, less what each finding call of
    `replayed` found: what the claims of `documents` were pooled from when they
    were first read, since those calls were asked again after the readings.
    `rows` are what the run held about each version when the asking began."""
    kept = {}
    for document in documents:
        version_id = document["version"]["id"]
        again = {call["seat"] for call in (rows.get(version_id) or empty_rows())["calls"]
                 if call["question"] == "contradictions" and call["id"] in replayed}
        kept[version_id] = {seat: items for seat, items in found.get(version_id, {}).items()
                            if seat not in again}
    return kept


def unread_claims(claims, first, call, rows, passages):
    """The claims of `claims`, one version's pool, that the seat whose reading
    call is `call` was never asked about: neither among `first`, which its
    first reading read, nor among the claims a supplementary reading recorded
    in its attempts answered. `call` is None when the seat has not read yet.
    `rows` are what the run held about the version when the asking began, whose
    claims name the ids those readings answered."""
    pair_of = {row["id"]: (row["first_locator"], row["second_locator"])
               for row in rows["claims"]}
    asked = {locator_pair(claim, passages) for claim in first}
    asked |= {pair_of[claim_id] for _model, _reply, claim_ids
              in assessment_run.supplementary_readings((call or {}).get("attempts"))
              for claim_id in claim_ids if claim_id in pair_of}
    return [claim for claim in claims if locator_pair(claim, passages) not in asked]


def verdict_rows(verdicts, claim_ids, call_id, seat):
    """The verdict rows of one reading, `verdicts` {position: verdict} as
    `assessment_call.parse_confirm` gives them, each naming the claim at its
    position in `claim_ids`."""
    return [{"claim_id": claim_ids[position - 1], "call_id": call_id, "seat": seat,
             "holds": verdict["holds"], "absolute": verdict["absolute"],
             "reason": verdict["reason"]}
            for position, verdict in verdicts.items()]


def counted(number, noun):
    return f"{number} {noun}" + ("" if number == 1 else "s")


def first_readings_differ(documents, rows, panels, replayed=frozenset()):
    """Where the claims written about `documents`, the versions of one
    document, and their first readings can no longer be told apart again
    from the findings they came from: one sentence per version and seat, or
    none.

    The pool rebuilt from the done finding calls, less those asked again
    after the readings (`replayed`), must give exactly the locator pairs of
    the claims written for each version, and each done reading call's first
    reading, its `raw_output` read against that pool, must give exactly the
    verdicts stored for its seat on those claims. A replay reads the new
    claims against that pool and a resume rebuilds each first reading from
    it, so were either to differ, the claims taken for new, or the verdicts
    rebuilt, would be the wrong ones."""
    seats = panels["contradictions"]
    held = {d["version"]["id"]: rows.get(d["version"]["id"]) or empty_rows() for d in documents}
    found = {}
    for document in documents:
        done = done_calls(held[document["version"]["id"]])
        found[document["version"]["id"]] = {
            seat: parse_contradictions(document["passages"])(
                done[("contradictions", seat)]["raw_output"])[0]["items"]
            for seat in seats if ("contradictions", seat) in done}
    first = pooled_claims(documents, first_found(documents, found, held, replayed), seats)
    problems = []
    for document in documents:
        version_id, passages = document["version"]["id"], document["passages"]
        name, version_rows = name_of(document["version"]), held[version_id]
        pairs = [locator_pair(claim, passages) for claim in first[version_id]]
        written = {(row["first_locator"], row["second_locator"]): row
                   for row in version_rows["claims"]}
        differ = ([f"{first_} and {second} is pooled and not written"
                   for first_, second in pairs if (first_, second) not in written]
                  + [f"{first_} and {second} is written and not pooled"
                     for first_, second in written if (first_, second) not in set(pairs)])
        if differ:
            problems.append(f"on {name}, the findings pool {counted(len(pairs), 'claim')} and "
                            f"{len(written)} {'is' if len(written) == 1 else 'are'} written: "
                            + "; ".join(differ))
            continue
        ids = [written[pair]["id"] for pair in pairs]
        pair_of = {row["id"]: pair for pair, row in written.items()}
        done = done_calls(version_rows)
        for seat in seats:
            call = done.get(("confirm", seat))
            if call is None:
                continue
            given = {ids[position - 1]: (v["holds"], v["absolute"], v["reason"])
                     for position, v in assessment_call.parse_confirm(
                         call["raw_output"], len(ids)).items()}
            stored = {v["claim_id"]: (v["holds"], v["absolute"], v["reason"])
                      for v in version_rows["verdicts"]
                      if v["seat"] == seat and v["call_id"] == call["id"]}
            unlike = [claim_id for claim_id in ids if given.get(claim_id) != stored.get(claim_id)]
            if unlike:
                problems.append(
                    f"on {name}, {seat}'s first reading, read against that pool, gives "
                    f"{counted(len(unlike), 'verdict')} unlike "
                    f"{'the one' if len(unlike) == 1 else 'those'} stored, on "
                    + "; ".join(" and ".join(pair_of[claim_id]) for claim_id in unlike))
    return problems


def replay_refusal(documents, rows, panels, replayed=frozenset()):
    """Why a replay of `documents` is refused before anything is asked
    (`first_readings_differ`), or None when it can be given."""
    problems = first_readings_differ(documents, rows, panels, replayed)
    if not problems:
        return None
    return ("its claims and their first readings no longer follow from the findings they "
            "were pooled from, so a replay could not tell which claims are new: "
            + "; and ".join(problems))


def to_ask(documents, rows, panels, criteria=True, replayed=frozenset()):
    """{version id: [(question, seat, claims)]} for every call assessing
    `documents`, the versions of one document the run is asked to assess, can
    make, given `rows`, {version id: the rows the run already holds about it},
    in the order each version's calls are made: every seat of each question
    asked with no done call, then every reading not done of a version that has
    claims to read, then every supplementary reading of claims a seat was never
    asked about. With `criteria` false no criteria call is listed, since the
    run takes them from another. `replayed` are the finding calls asked again
    after the readings (`replayed_calls`), whose findings the first readings
    did not read.

    `claims` is what a reading will be asked about, and None for a question
    that is not a reading. It is None for a reading too while a contradictions
    seat has still to answer on any of these versions, since the claims pooled
    across them are not known yet: every contradictions seat's reading of
    every version is then listed, as `assessment_run.price_document` prices it,
    and, on a version whose claims are already written (a replay), a
    supplementary reading by every seat of whatever claims the finding adds."""
    seats = panels["contradictions"]
    held_rows = {d["version"]["id"]: rows.get(d["version"]["id"]) or empty_rows()
                 for d in documents}
    done = {version_id: done_calls(held) for version_id, held in held_rows.items()}
    asked = {version_id: [(question, seat, None)
                          for question in assessment_run.questions(criteria)
                          for seat in panels[question] if (question, seat) not in held]
             for version_id, held in done.items()}
    if not all(("contradictions", seat) in held for held in done.values() for seat in seats):
        for version_id, held in done.items():
            asked[version_id] += [("confirm", seat, None) for seat in seats
                                  if ("confirm", seat) not in held]
            if held_rows[version_id]["claims"]:
                asked[version_id] += [("confirm", seat, None) for seat in seats]
        return asked
    found = {d["version"]["id"]: {
        seat: parse_contradictions(d["passages"])(
            done[d["version"]["id"]][("contradictions", seat)]["raw_output"])[0]["items"]
        for seat in seats} for d in documents}
    passages = {d["version"]["id"]: d["passages"] for d in documents}
    first = pooled_claims(documents, first_found(documents, found, held_rows, replayed), seats)
    for version_id, claims in pooled_claims(documents, found, seats).items():
        if not claims:
            continue
        read_first = first[version_id] or claims
        for seat in seats:
            call = done[version_id].get(("confirm", seat))
            if call is None:
                asked[version_id].append(("confirm", seat, read_first))
            more = unread_claims(claims, read_first, call, held_rows[version_id],
                                 passages[version_id])
            if more:
                asked[version_id].append(("confirm", seat, more))
    return asked


class Assessment:
    """One assessment run as it is written: the run row, then each document's
    calls in order, each with the rows its reply gives.

    `run` is the row of a run taken up where it stopped, and `existing` the
    rows it already holds, {version id: rows} in `index_store.assessment_rows`'s
    shape. Both are omitted for a fresh run. `criteria_from` is the row of the
    run whose criteria this run takes, fresh or taken up: it then asks no
    criteria call. With `replay`, a document `only_a_new_run` would refuse
    because a finder failed after its readings is taken up as `replayable`
    says (`record_replay`, `group`)."""

    def __init__(self, store, config, panels, call_model, panel=PANEL, run=None,
                 existing=None, criteria_from=None, replay=False):
        self.store, self.config, self.panels = store, config, panels
        self.call_model, self.panel = call_model, panel
        self.run = run
        self.criteria_from = criteria_from
        self.replay = replay
        # The finding calls asked again after their document's readings, by
        # this replay or an earlier one.
        self.replayed = replayed_calls(run)
        # Each call row as this asking last wrote it, by id, for a
        # supplementary reading to add its bill and attempts to.
        self.rows_now = {}
        # Within a replayed document: once a finding asked again fails again,
        # no call that is not done is asked (`ask`), and those passed over.
        self.halt_on_silence, self.halted, self.passed_over = False, False, []
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

    def record_replay(self, by, groups, calls):
        """Record on the run row, before any of `calls` is asked again, that the
        documents of `groups` (spec ids) are replayed, `calls` being the ids of
        the finding calls asked again, and `by` who replayed them: one record
        per replay, appended to its config's `replays`. It is written first so
        that a replay stopped part way still says which findings its first
        readings did not read."""
        outcomes = {spec_id: "not asked" for spec_id in groups}
        config = dict((self.run or {}).get("config") or {})
        config["replays"] = list(config.get("replays") or []) + [{
            "at": now(), "by": by, "groups": list(groups), "calls": list(calls),
            "outcomes": outcomes, "also_found": [], "note": replay_note(groups, outcomes)}]
        self.write_config(config)
        self.replayed |= set(calls)

    def write_config(self, config):
        self.store.update("aci_assessment_runs", {"id": self.run_id}, {"config": config})
        self.run = dict(self.run or {}, config=config)

    def settle_replay(self, spec_id, outcome, also_found=(), unasked=()):
        """Say, in the latest replay record naming document `spec_id`, how its
        replay ended: `outcome` ("answered" or "failed again"), the pairs its
        finding found again that were already claims (`also_found`, each
        {"seat", "version_id", "claim_id"}), which a claim's row, never
        updated, cannot say, and, dropped from its `calls`, the finding calls
        it did not ask after all (`unasked`). It is written once the finding
        has answered or failed again, before any reading, and again only for
        what a later resume adds; a run no replay touched is not written."""
        config = dict((self.run or {}).get("config") or {})
        records = [dict(record) for record in config.get("replays") or []]
        latest = next((n for n in range(len(records) - 1, -1, -1)
                       if spec_id in (records[n].get("groups") or [])), None)
        if latest is None:
            return
        record = records[latest]
        known = {(entry["seat"], entry["version_id"], entry["claim_id"])
                 for each in records for entry in each.get("also_found") or []}
        new = [entry for entry in also_found
               if (entry["seat"], entry["version_id"], entry["claim_id"]) not in known]
        calls = [call_id for call_id in record.get("calls") or [] if call_id not in unasked]
        outcomes = dict(record.get("outcomes") or {})
        if not new and outcomes.get(spec_id) == outcome and calls == record.get("calls"):
            return
        outcomes[spec_id] = outcome
        record.update(calls=calls, outcomes=outcomes,
                      also_found=list(record.get("also_found") or []) + new,
                      note=replay_note(record.get("groups") or [], outcomes))
        records[latest] = record
        config["replays"] = records
        self.write_config(config)

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

        substituted, answer, billed = [], None, False
        try:
            tag, answer, substituted, refused = assessment_run.ask_with_substitutes(
                seat, system, user, self.config, self.call_model, self.panel,
                seated=seated, substituted=substituted)
            cost, meter = metered(earlier, attempt_rows(tag, answer, substituted), substituted,
                                  answer)
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
            self.rows_now[call_id] = {"id": call_id, "model": tag, **meter}
        except BaseException as stopped:
            if not billed:
                cost, meter = metered(earlier, attempt_rows(None, None, substituted),
                                      substituted, None)
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

        When a contradictions seat has no answer on one of the versions once
        they are searched, nothing more is asked or written for any of them:
        no claim is written and nobody reads, and the document is a gap until
        the finding is asked again. In a replay that finding was the one asked
        again: the first that fails again stops the document there, no other
        call of it that is not done being asked, and the claims already
        written stay as they were read. A replay is refused before its first
        call when its first pool no longer gives the claims written and their
        readings (`replay_refusal`), and says how it ended
        (`settle_replay`).

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
        members = [(d["version"], held[d["version"]["id"]]) for d in documents]
        names = ", ".join(name_of(d["version"]) for d in documents)
        refusal = only_a_new_run(members, self.panels, replay=self.replay)
        if refusal is None and self.replay and replayable(members, self.panels):
            refusal = replay_refusal(documents, held, self.panels, self.replayed)
        if refusal is not None:
            raise SystemExit(f"{names} cannot be taken up again: {refusal}. "
                             "Assess them in a new run.")
        spec_id = documents[0]["version"]["spec_id"]
        replaying = any(rows["claims"] for rows in held.values())
        self.halt_on_silence, self.halted, self.passed_over = replaying, False, []
        found = {d["version"]["id"]: self.search(d, held[d["version"]["id"]]) for d in documents}
        self.halt_on_silence, self.halted = False, False
        seats = self.panels["contradictions"]
        silent = [(d["version"], seat) for d in documents for seat in seats
                  if seat not in found[d["version"]["id"]]]
        if silent:
            if replaying:
                self.settle_replay(spec_id, "failed again", unasked={
                    call_id for _version, question, _seat, call_id in self.passed_over
                    if question == "contradictions"})
            self.leave(documents, held, silent)
            return
        first = pooled_claims(documents, first_found(documents, found, held, self.replayed),
                              seats)
        pooled = pooled_claims(documents, found, seats)
        if replaying:
            self.settle_replay(spec_id, "answered", [
                {"seat": seat, "version_id": d["version"]["id"], "claim_id": row["id"]}
                for d in documents
                for claim, row in self.written_claims(d, held[d["version"]["id"]],
                                                      pooled[d["version"]["id"]])
                for seat in claim["found_by"] if seat not in row["found_by"]])
        for d in documents:
            self.read(d, held[d["version"]["id"]], pooled[d["version"]["id"]],
                      first[d["version"]["id"]])

    @staticmethod
    def written_claims(document, rows, claims):
        """[(pooled claim, its row)] for every claim of `claims`, one version's
        pool, that the run had already written."""
        written = {(row["first_locator"], row["second_locator"]): row for row in rows["claims"]}
        return [(claim, written[locator_pair(claim, document["passages"])]) for claim in claims
                if locator_pair(claim, document["passages"]) in written]

    def leave(self, documents, held, silent):
        """Say that the versions `documents` are left unread, since the seats of
        `silent`, [(version row, seat)], gave no contradictions answer, or, in
        a replay, were passed over once one had failed again."""
        names = ", ".join(name_of(d["version"]) for d in documents)
        several = len(documents) > 1
        it = "them" if several else "it"

        def who(pairs):
            return " and ".join(f"{seat} on {name_of(version)}" if several else seat
                                for version, seat in pairs)
        if any(rows["claims"] for rows in held.values()):
            passed = {(version["id"], seat) for version, question, seat, _call_id
                      in self.passed_over if question == "contradictions"}
            failed = [(v, seat) for v, seat in silent if (v["id"], seat) not in passed]
            skipped = [(v, seat) for v, seat in silent if (v["id"], seat) in passed]
            not_asked = (f"; {who(skipped)} {'is' if len(skipped) == 1 else 'are'} not asked"
                         if skipped else "")
            print(f"  {names}: {who(failed)} gave no contradictions answer again, so nothing "
                  f"more is asked or written for {it}{not_asked}: the claims already written "
                  "stay as they were read, and the gap stays.", flush=True)
        else:
            print(f"  {names}: {who(silent)} gave no contradictions answer, so no claim of "
                  f"{it} is written and nobody reads {it}; taking the run up again asks that "
                  "finding again first.", flush=True)

    def ask(self, version, rows, question, seat, system, user, parse, seated):
        """`call`, for the call of `question` and `seat` about `version`,
        whose rows are `rows`, adding the model that answered to `seated`. A
        replayed document halted by a finding that failed again asks nothing
        not done: the call is passed over, and gives nothing."""
        existing = next((call for call in rows["calls"]
                         if (call["question"], call["seat"]) == (question, seat)), None)
        if self.halted and (existing is None or existing["status"] != "done"):
            self.passed_over.append((version, question, seat, (existing or {}).get("id")))
            return None, None
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
            elif self.halt_on_silence:
                self.halted = True
        return found

    def read(self, document, rows, claims, first=None):
        """One version's claims, written, then read by every contradictions
        seat, each reading every claim, the ones it found included. A version
        with no claim is read by nobody. A claim the run already wrote keeps
        its id and its row as written, since a claim is never updated (a
        replay lists the seats that found it again in its record instead); a
        reading already written is not written twice.

        `first` are the claims each seat's first reading reads: the claims
        pooled without the findings asked again after the readings, which on a
        run no replay touched are `claims` themselves, and `claims` too when
        that pool gave this version none. A seat whose first reading is done
        and that was never asked about some of `claims` reads those in a
        supplementary reading (`supplement`); the verdicts of a supplementary
        reading given earlier are rebuilt from its attempt."""
        version, passages, labelled = (document["version"], document["passages"],
                                       document["labelled"])
        seats = self.panels["contradictions"]
        written = {(row["first_locator"], row["second_locator"]): row for row in rows["claims"]}
        read = {(row["claim_id"], row["seat"]) for row in rows["verdicts"]}
        key = ("claim_id", "seat")
        pairs = [locator_pair(claim, passages) for claim in claims]
        id_of = {pair: written[pair]["id"] if pair in written else str(uuid.uuid4())
                 for pair in pairs}
        self.insert_new("aci_assessment_claims",
                        claim_rows(self.run_id, version["id"], claims,
                                   [id_of[pair] for pair in pairs], passages),
                        set(written), ("first_locator", "second_locator"))
        if not claims:
            return
        first = first or claims
        first_ids = [id_of[locator_pair(claim, passages)] for claim in first]
        seated = seated_at_start("confirm", seats, rows)
        system, user = assessment_call.compose_confirm(labelled, first)
        given = {}
        for seat in seats:
            call_id, verdicts = self.ask(version, rows, "confirm", seat, system, user,
                                         parse_confirm(first), seated)
            if verdicts is None:
                continue
            given[seat] = self.rows_now.get(call_id) or next(
                call for call in rows["calls"] if call["id"] == call_id)
            self.insert_new("aci_assessment_verdicts",
                            verdict_rows(verdicts, first_ids, call_id, seat), read, key)
        # Who sits in each seat of this version's reading, so that no model
        # reads in two seats of it.
        sitting = {seat: {call.get("model")} | {model for model, _reply, _ids in
                                                assessment_run.supplementary_readings(
                                                    call.get("attempts"))}
                   for seat, call in given.items()}
        for seat, call in given.items():
            for _model, reply, claim_ids in assessment_run.supplementary_readings(
                    call.get("attempts")):
                self.insert_new("aci_assessment_verdicts", verdict_rows(
                    assessment_call.parse_confirm(reply, len(claim_ids)), claim_ids,
                    call["id"], seat), read, key)
            more = unread_claims(claims, first, call, rows, passages)
            if not more:
                continue
            more_ids = [id_of[locator_pair(claim, passages)] for claim in more]
            others = set(seats).union(*(models for other, models in sitting.items()
                                        if other != seat))
            tag, verdicts = self.supplement(version, call, seat, labelled, more, more_ids,
                                            others - {None})
            if tag is not None:
                sitting[seat].add(tag)
            if verdicts:
                self.insert_new("aci_assessment_verdicts",
                                verdict_rows(verdicts, more_ids, call["id"], seat), read, key)

    def supplement(self, version, call, seat, labelled, claims, claim_ids, seated):
        """A supplementary reading: `seat`, whose reading call about `version`
        is `call` and is done, reading only `claims`, which its first reading
        did not read, their ids `claim_ids` in order. Returns (the model that
        answered, what `assessment_call.parse_confirm` makes of its reply), or
        (None, None) when no candidate answered.

        It is recorded on `call`'s row, since the table allows one reading call
        per run, version and seat. The row stays done, and keeps its first
        reading's reply in `raw_output`, its model, finish reason and seconds:
        every attempt is appended to its attempts, each naming `claim_ids`
        (`supplementary_attempts`), the one that answered with its reply and
        seconds, and this asking's bill and tokens are added to its own. The
        seat is asked through its own model and then its declared substitutes,
        skipping any of `seated`, which are the question's seats and every
        model that sits in another seat of this version's reading.

        A stop mid-call leaves the attempts already billed on the row, and
        their cost in the run's total, and is raised, as `call` does; with no
        reply recorded, a resume asks the reading again."""
        system, user = assessment_call.compose_confirm(labelled, claims)
        print(f"  {seat} confirm on {name_of(version)}, of the {len(claims)} claims its "
              "reading did not read ...", flush=True)
        match = {"id": call["id"]}
        substituted, patch, billed = [], None, False
        try:
            tag, answer, substituted, _refused = assessment_run.ask_with_substitutes(
                seat, system, user, self.config, self.call_model, self.panel,
                seated=seated, substituted=substituted)
            cost, patch = metered(call, supplementary_attempts(tag, answer, substituted,
                                                               claim_ids), substituted, answer)
            self.costs.append(cost)
            billed = True
            self.store.update("aci_assessment_calls", match, patch)
        except BaseException:
            if not billed:
                attempts = supplementary_attempts(None, None, substituted, claim_ids)
                cost, patch = metered(call, attempts, substituted, None)
                self.costs.append(cost)
                patch = patch if attempts else None
            if patch is not None:
                self.store.update("aci_assessment_calls", match, patch)
            raise
        self.rows_now[call["id"]] = dict(call, **patch)
        if answer is None:
            return None, None
        return tag, parse_confirm(claims)(answer["reply"])[0]
