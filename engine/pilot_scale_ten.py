#!/usr/bin/env python3
"""A pilot of depth out of ten, and of the assessment of a document as a whole.

    python3 engine/pilot_scale_ten.py                 # prices it, spends nothing
    python3 engine/pilot_scale_ten.py --go            # spends
    python3 engine/pilot_scale_ten.py --replay FOLDER # prices giving a saved run's failed
                                                       # depths again through the ladder;
                                                       # --go spends

It reads the database and writes nothing to it. Everything lands in artefacts/,
in a folder of its own: every reply as it came back, what was made of it in
pilot.json, and a summary.md a person can read in one sitting. The design it
tests is
docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md,
and it answers the design's two questions: whether judges use odd values as a
way of not choosing, and whether the contradictions they list hold up.

Each document is assessed in full first, because a depth on the new scale is
given with its document's general rules for conflicts, and those are the
passages at least two judges cited as such. Then each behaviour gets a depth out
of ten from the judges of its cell's published run, over the passages that run
retained, so the new figure reads beside the old one.

A contradiction a seat lists is not taken on its word: every other seat that did
not already list it is asked to confirm it on a second reading, and a claim
counts as confirmed only once two seats stand behind it. Where a seat's own
model is refused, or answers with nothing, its declared substitutes are tried
in turn for that call, on criteria, contradictions and confirmation alike; the
summary and pilot.json both say when a substitute answered in a seat's place.

A depth call whose reply gives no whole number from 0 to 10 is asked again,
first with a format reminder, then with a one-shot example; if it is still off
the scale, the judge's declared substitutes give it in turn, each tried plain
and then with the format reminder. Every attempt is kept and costed.
`--replay` gives a saved run's failed depths again through that same ladder,
with no whole-document call made.
"""

import argparse
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "panel"))
sys.path.insert(0, str(HERE / "spec-cite"))

import assessment_call           # noqa: E402
import bands                     # noqa: E402
import batch_job                 # noqa: E402
import depth_call                # noqa: E402
import index_store               # noqa: E402
import whole_doc                 # noqa: E402

_spec = importlib.util.spec_from_file_location("h", HERE / "panel" / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

DOCUMENTS = ("anthropic--constitution@2026-01-20", "openai--model-spec@2026-08-18")
BEHAVIOURS = ("honesty-and-non-deception", "no-sycophancy",
              "instruction-hierarchy-conformance", "harm-avoidance-to-third-parties")
PANEL = "frontier_fast"
QUORUM = 2
CHARS_PER_TOKEN = 4
# Output allowances for the price, generous because sol's reasoning is billed as
# output, and a price that comes in low is the one that surprises.
OUTPUT_TOKENS = {"criteria": 4000, "contradictions": 8000, "depth": 1000}
# The rules block a depth call will carry, priced before anyone has cited it.
RULES_ALLOWANCE_CHARS = 4000
# A confirmation call is priced per seat, whether or not it turns out to be
# needed: how many claims a seat will have to confirm is only known at run time.
CONFIRM_CLAIMS_CHARS = 3000
CONFIRM_OUTPUT_TOKENS = 1500
LABELS = {"conflict_rules": "Conflict rules", "contradictions": "Unresolved contradictions",
          "rule_force": "Force of each rule", "reasons": "Reasons given",
          "situations": "Situations covered"}


def now():
    return datetime.now(timezone.utc).isoformat()


def split_document(document_id):
    spec_id, _, version = document_id.partition("@")
    return spec_id, version


def conflict_rules(criteria_by_seat, passages, quorum=QUORUM):
    """The passages at least `quorum` seats cited as the document's general
    rules for conflicts, in document order. A seat whose criteria call failed
    cited nothing, so it cannot help a passage reach the quorum."""
    counts = {}
    for parsed in criteria_by_seat.values():
        for number in set(parsed.get("conflict_rule_passages") or []):
            counts[number] = counts.get(number, 0) + 1
    return [passages[number - 1] for number in sorted(counts) if counts[number] >= quorum]


def cell_evidence(store, publication_id, slug, version_id, passages):
    """(retained passages, the cell's done calls, their depths out of four by model).

    The retained passages are chosen as batch_job.pending_depths chooses them,
    from the published run's parsed judgements, so the new depth reads the same
    evidence the published one did. Every done aci_depths row records `passages`,
    the count its own depth was given on; where that count is known and differs
    from what is retained here, the pilot would be reading different evidence
    than the published depth did, and stops rather than publish a comparison of
    unlike things."""
    selected = store.select("aci_publication_cells", {
        "publication_id": f"eq.{publication_id}", "behaviour_slug": f"eq.{slug}",
        "spec_version_id": f"eq.{version_id}"})
    if not selected:
        raise SystemExit(f"the public publication carries no cell {slug} on {version_id}")
    calls = store.select("aci_judge_calls", {
        "run_id": f"eq.{selected[0]['run_id']}", "behaviour_slug": f"eq.{slug}",
        "spec_version_id": f"eq.{version_id}", "status": "eq.done"})
    if not calls:
        raise SystemExit(f"the published run of {slug} on {version_id} has no done call")
    model_of = {call["id"]: call["model"] for call in calls}
    ids = "in.(" + ",".join(f'"{call_id}"' for call_id in model_of) + ")"
    votes = {}
    for row in store.select("aci_judgements", {"call_id": ids}):
        if row.get("parsed", True):
            votes.setdefault(row["locator"], {})[model_of[row["call_id"]]] = row["verdict"]
    shown = set(bands.shown_by_default(votes))
    retained = [passage for passage in passages if passage[0] in shown]
    depth_rows = store.select("aci_depths", {"call_id": ids})
    done_depths = [row for row in depth_rows if row.get("status") == "done"]
    old = {model_of[row["call_id"]]: row["depth"] for row in done_depths}
    published_counts = {row["passages"] for row in done_depths
                        if row.get("passages") is not None}
    if published_counts and published_counts != {len(retained)}:
        raise SystemExit(
            f"{slug} on {version_id}: {len(retained)} passages retained here, but the "
            f"published depth was given {sorted(published_counts)}; the pilot would not "
            "read the same evidence")
    return (retained, sorted(calls, key=lambda call: call["model"]), old)


def ask(tag, system, user, config, call_model):
    """One call, and what it cost. A refusal is raised to the caller, which
    records it and goes on."""
    provider, model_id = h.resolve(tag, config)
    kwargs = whole_doc.judge_kwargs(tag, model_id, config)
    reply, usage, finish_reason, seconds = call_model(
        provider=provider, model_id=model_id, system=system, user=user, kwargs=kwargs)
    return {"reply": reply or "", "usage": usage, "finish_reason": finish_reason,
            "seconds": seconds, "cost_usd": batch_job.cost_of(tag, usage, config),
            "provider": provider, "model_id": model_id, "kwargs": kwargs}


def priced(tag, system, user, output_tokens, config):
    usage = {"prompt_tokens": (len(system) + len(user)) // CHARS_PER_TOKEN,
             "completion_tokens": output_tokens}
    return batch_job.cost_of(tag, usage, config) or 0.0


def _candidates(seat, panel, config):
    """`seat`, then its declared substitutes in order, for one whole-document
    call. A seat with no declared substitutes is asked alone, as before."""
    return [seat] + config.get("substitutes", {}).get(panel, {}).get(seat, [])


def ask_with_substitutes(seat, question, system, user, config, call_model, panel, here):
    """Ask `seat`'s own model, then its declared substitutes in order, until
    one answers.

    A candidate fails when the call raises, when it comes back
    content-filtered, or when its reply is empty once stripped. Returns
    (tag, answer, substituted): `tag` and `answer` are the candidate that
    answered and `ask`'s dict for it, or (None, None) when every candidate
    failed. `substituted` lists {"model", "reason", "cost_usd",
    "finish_reason", "model_id"} for every candidate that failed before the
    one returned, in the order tried; the last three are None when the
    candidate raised before answering, since it was never billed. A refused
    candidate's reply, when it has any text, is saved to
    `<seat>.<question>.<candidate>.refused.txt` beside the other replies."""
    substituted = []
    for tag in _candidates(seat, panel, config):
        try:
            answer = ask(tag, system, user, config, call_model)
        except Exception as refused:                      # noqa: BLE001
            substituted.append({"model": tag, "reason": str(refused)[:300],
                                "cost_usd": None, "finish_reason": None, "model_id": None})
            continue
        if answer["finish_reason"] == "content_filter":
            reason = "finish_reason=content_filter"
        elif not answer["reply"].strip():
            reason = f"empty reply, finish_reason={answer['finish_reason']}"
        else:
            return tag, answer, substituted
        substituted.append({"model": tag, "reason": reason, "cost_usd": answer["cost_usd"],
                            "finish_reason": answer["finish_reason"],
                            "model_id": answer["model_id"]})
        if answer["reply"]:
            (here / f"{seat}.{question}.{tag}.refused.txt").write_text(answer["reply"],
                                                                       encoding="utf-8")
    return None, None, substituted


def depth_with_ladder(slug, judge, system, user, config, call_model, panel, here):
    """One judge's depth out of ten, given by `judge`'s own model first, then
    asked again with each of `depth_call.REMINDERS_OF_TEN` in turn when a reply
    gives no depth, and finally by `judge`'s declared substitutes in order, each
    tried with the plain user message and, if that fails too, one reminder. The
    first attempt that parses to a depth answers.

    Returns the cell's entry for `judge`: `depth`, `rationale`, `model` (the
    model that answered, `judge` itself unless a substitute did), `attempts`
    (every call made, in order, each `{"model", "reminder", "finish_reason",
    "cost_usd", "parsed"}`), and `substituted` (present only once a substitute
    answered). When nothing answers, `depth` and `rationale` are None and
    `attempts` still holds every call made. An exception from a call is
    recorded as an attempt that did not parse, with no cost and no
    finish_reason, and the ladder moves on to its next step.

    Every attempt with a reply, parsed or not, is saved to
    `<slug>.<model>.depth.<n>.reply.txt`, `n` counting from 1 for that model."""
    attempts = []
    counters = {}

    def try_once(tag, reminder):
        this_user = user if reminder == 0 else depth_call.retry_user(user, reminder)
        try:
            answer = ask(tag, system, this_user, config, call_model)
        except Exception:                              # noqa: BLE001
            attempts.append({"model": tag, "reminder": reminder, "finish_reason": None,
                             "cost_usd": None, "parsed": False})
            return None
        n = counters.get(tag, 0) + 1
        counters[tag] = n
        (here / f"{slug}.{tag}.depth.{n}.reply.txt").write_text(answer["reply"],
                                                                 encoding="utf-8")
        depth, rationale = depth_call.parse(answer["reply"], scale=10)
        attempts.append({"model": tag, "reminder": reminder,
                         "finish_reason": answer["finish_reason"],
                         "cost_usd": answer["cost_usd"], "parsed": depth is not None})
        return None if depth is None else (depth, rationale)

    for reminder in (0, 1, 2):
        result = try_once(judge, reminder)
        if result is not None:
            depth, rationale = result
            return {"depth": depth, "rationale": rationale, "model": judge,
                    "attempts": attempts}

    for substitute in config.get("substitutes", {}).get(panel, {}).get(judge, []):
        for reminder in (0, 1):
            result = try_once(substitute, reminder)
            if result is not None:
                depth, rationale = result
                return {"depth": depth, "rationale": rationale, "model": substitute,
                        "attempts": attempts,
                        "substituted": {"model": substitute,
                                       "reason": "off-scale reply after two reminders"}}

    return {"depth": None, "rationale": None, "model": judge, "attempts": attempts}


def _pool_claims(contradictions_by_seat, seats):
    """The pooled claims, one per distinct unordered pair of passage numbers,
    in the order first found: {"first", "second", "situation", "why",
    "found_by"}, `first` and `second` still 1-based passage numbers.

    `contradictions_by_seat` holds each seat's parsed items before their
    numbers are turned into locators. The first seat to list a pair keeps its
    situation and reason; every seat that lists it, including later ones,
    joins `found_by`."""
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


def _confirm_score(claims):
    """4 when no claim is confirmed, 2 when one or two are and none is
    absolute, 0 when three or more are confirmed or any confirmed claim is
    absolute."""
    confirmed = [claim for claim in claims if claim["confirmed"]]
    if not confirmed:
        return 4
    if any(claim["absolute"] for claim in confirmed) or len(confirmed) >= 3:
        return 0
    return 2


def confirm_stage(record, contradictions_by_seat, seats, text, prompt_passages, config,
                   call_model, panel, here):
    """Put every contradiction one seat found to the seats that did not find
    it, settle which are confirmed, and return (contradictions, score) for
    `record`. A seat with nothing left to confirm is not called."""
    pooled = _pool_claims(contradictions_by_seat, seats)
    holds = [[] for _ in pooled]
    does_not_hold = [[] for _ in pooled]
    # A claim every seat already found is never put to anyone, so its
    # absoluteness is unasked rather than false.
    absolute = [None if len(claim["found_by"]) >= len(seats) else False for claim in pooled]
    reasons = [{} for _ in pooled]

    for seat in seats:
        to_confirm = [(i, claim) for i, claim in enumerate(pooled)
                      if seat not in claim["found_by"]]
        if not to_confirm:
            continue
        print(f"  {seat} confirming {len(to_confirm)} contradictions ...", flush=True)
        claims = [{"first": claim["first"], "second": claim["second"],
                  "situation": claim["situation"], "why": claim["why"]}
                 for _i, claim in to_confirm]
        system, user = assessment_call.compose_confirm(prompt_passages, claims)
        tag, answer, substituted = ask_with_substitutes(seat, "confirm", system, user, config,
                                                         call_model, panel, here)
        if answer is None:
            record["assessment"][seat]["confirm"] = {
                "error": substituted[-1]["reason"], "substituted": substituted}
            continue
        (here / f"{seat}.confirm.reply.txt").write_text(answer["reply"], encoding="utf-8")
        verdicts = assessment_call.parse_confirm(answer["reply"], len(claims))
        record["assessment"][seat]["confirm"] = dict(
            verdicts=verdicts, model=tag, substituted=substituted,
            cost_usd=answer["cost_usd"], finish_reason=answer["finish_reason"],
            provider=answer["provider"], model_id=answer["model_id"], kwargs=answer["kwargs"],
            claims_asked=len(claims))
        for position, verdict in verdicts.items():
            i, _claim = to_confirm[position - 1]
            reasons[i][seat] = verdict["reason"]
            (holds if verdict["holds"] else does_not_hold)[i].append(seat)
            if verdict["absolute"]:
                absolute[i] = True

    contradictions = []
    for i, claim in enumerate(pooled):
        confirmed = len(claim["found_by"]) + len(holds[i]) >= 2
        contradictions.append({
            "first": text[claim["first"] - 1][0], "second": text[claim["second"] - 1][0],
            "situation": claim["situation"], "why": claim["why"],
            "found_by": claim["found_by"], "holds": holds[i], "does_not_hold": does_not_hold[i],
            "absolute": absolute[i], "confirmed": confirmed, "reasons": reasons[i]})
    return contradictions, _confirm_score(contradictions)


def _costs(results):
    """Every cost billed: the answering call's own, and every attempt in its
    `substituted` list, refused or not, for criteria, contradictions and
    confirmation calls alike, error records included; and every depth
    attempt's own cost. A replay's records carry no `assessment` at all,
    only `cells`, so that half is read with a default rather than assumed."""
    for record in results["documents"].values():
        for questions in record.get("assessment", {}).values():
            for answer in questions.values():
                if answer.get("cost_usd") is not None:
                    yield answer["cost_usd"]
                for attempt in answer.get("substituted", []):
                    if attempt.get("cost_usd") is not None:
                        yield attempt["cost_usd"]
        for cell in record["cells"].values():
            for given in cell["new"].values():
                for attempt in given.get("attempts", []):
                    if attempt.get("cost_usd") is not None:
                        yield attempt["cost_usd"]


def run_pilot(store, config, registry, passages_for, out_dir, call_model=None,
              go=False, documents=DOCUMENTS, behaviours=BEHAVIOURS, panel=PANEL):
    """Price the pilot and, with `go`, run it. Returns (the price in dollars, the
    folder written, or None when nothing was run)."""
    seats = config["panels"][panel]
    publication = index_store.current_publication(store)
    if publication is None:
        raise SystemExit("no public publication to take the cells from")
    versions = {f"{row['spec_id']}@{row['version']}": row
                for row in store.select("aci_spec_versions")}
    missing = [document for document in documents if document not in versions]
    if missing:
        raise SystemExit(f"no such document: {', '.join(missing)}")

    passages = {document: passages_for(*split_document(document)) for document in documents}
    # Only the whole-document calls (criteria, contradictions, confirm) see a
    # section's heading attributes; a depth call keeps the plain passages.
    prompt_passages = {document: assessment_call.with_heading_attributes(
                           passages[document], versions[document].get("markdown") or "")
                       for document in documents}
    evidence = {(document, slug): cell_evidence(store, publication["id"], slug,
                                                versions[document]["id"], passages[document])
                for document in documents for slug in behaviours}

    estimate = 0.0
    confirm_system = assessment_call.system_prompt("confirm")
    for document in documents:
        for question in assessment_call.QUESTIONS:
            system, user = assessment_call.compose(question, prompt_passages[document])
            estimate += sum(priced(seat, system, user, OUTPUT_TOKENS[question], config)
                            for seat in seats)
        # A confirmation call carries the whole document, as compose_confirm
        # opens with it, plus an allowance for the claims; its shape is only
        # known once contradictions come back, so it is priced here as one
        # call per seat regardless.
        _system, confirm_user = assessment_call.compose_confirm(prompt_passages[document], [])
        estimate += sum(priced(seat, confirm_system, confirm_user + "x" * CONFIRM_CLAIMS_CHARS,
                               CONFIRM_OUTPUT_TOKENS, config) for seat in seats)
    for (_document, slug), (retained, calls, _old) in evidence.items():
        system, user = depth_call.compose(slug, registry, retained, scale=10)
        for call in calls:
            estimate += priced(call["model"], system, user + " " * RULES_ALLOWANCE_CHARS,
                               OUTPUT_TOKENS["depth"], config)
    estimate = round(estimate, 2)
    if not go:
        for (document, slug), (retained, calls, _old) in evidence.items():
            judges = ", ".join(sorted(call["model"] for call in calls))
            print(f"  {document} {slug}: {len(retained)} passages retained, "
                  f"judged by {judges}")
        return estimate, None
    call_model = call_model or batch_job.call_openrouter

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    folder = Path(out_dir) / f"{stamp}-pilot-scale-ten"
    folder.mkdir(parents=True, exist_ok=True)
    results = {"started_at": now(), "publication": publication["id"],
               "estimate_usd": estimate,
               "prompts": {"depth": depth_call.prompt_sha256(10),
                           "confirm": assessment_call.prompt_sha256("confirm"),
                           **{question: assessment_call.prompt_sha256(question)
                              for question in assessment_call.QUESTIONS}},
               "documents": {}}

    for document in documents:
        here = folder / document.replace("@", "_")
        here.mkdir(exist_ok=True)
        text = passages[document]
        labelled = prompt_passages[document]
        by_locator = {locator: passage_text for locator, _section, passage_text in text}
        record = results["documents"][document] = {"assessment": {}, "cells": {}}
        criteria_by_seat = {}
        contradictions_by_seat = {}
        for seat in seats:
            record["assessment"][seat] = {}
            for question in assessment_call.QUESTIONS:
                print(f"  {seat} assessing {document}: {question} ...", flush=True)
                system, user = assessment_call.compose(question, labelled)
                tag, answer, substituted = ask_with_substitutes(
                    seat, question, system, user, config, call_model, panel, here)
                if answer is None:
                    record["assessment"][seat][question] = {
                        "error": substituted[-1]["reason"], "substituted": substituted}
                    continue
                (here / f"{seat}.{question}.reply.txt").write_text(answer["reply"],
                                                                  encoding="utf-8")
                if question == "criteria":
                    parsed = assessment_call.parse_criteria(answer["reply"], len(text))
                    criteria_by_seat[seat] = parsed
                    parsed = dict(parsed, conflict_rule_passages=[
                        text[number - 1][0] for number in parsed["conflict_rule_passages"]])
                else:
                    parsed = assessment_call.parse_contradictions(answer["reply"], len(text))
                    contradictions_by_seat[seat] = parsed["items"]
                    parsed = dict(parsed, items=[
                        dict(item, first=text[item["first"] - 1][0],
                             second=text[item["second"] - 1][0])
                        for item in parsed["items"]])
                record["assessment"][seat][question] = dict(
                    parsed, model=tag, substituted=substituted, cost_usd=answer["cost_usd"],
                    finish_reason=answer["finish_reason"], provider=answer["provider"],
                    model_id=answer["model_id"], kwargs=answer["kwargs"])
        rules = conflict_rules(criteria_by_seat, text)
        record["conflict_rules"] = [locator for locator, _section, _text in rules]
        passage_text = {locator: by_locator.get(locator) for locator in record["conflict_rules"]}
        for seat_answers in record["assessment"].values():
            for item in seat_answers.get("contradictions", {}).get("items", []):
                passage_text[item["first"]] = by_locator.get(item["first"])
                passage_text[item["second"]] = by_locator.get(item["second"])

        contradictions, contradictions_score = confirm_stage(
            record, contradictions_by_seat, seats, text, labelled, config, call_model, panel,
            here)
        record["contradictions"] = contradictions
        record["contradictions_score"] = contradictions_score
        for claim in contradictions:
            passage_text.setdefault(claim["first"], by_locator.get(claim["first"]))
            passage_text.setdefault(claim["second"], by_locator.get(claim["second"]))
        record["passage_text"] = passage_text

        for slug in behaviours:
            retained, calls, old = evidence[(document, slug)]
            cell = record["cells"][slug] = {"passages": len(retained), "old": old, "new": {}}
            if not retained:
                cell["new"] = {call["model"]: {"depth": 0,
                                               "rationale": depth_call.NOTHING_RETAINED}
                               for call in calls}
                continue
            system, user = depth_call.compose(slug, registry, retained, scale=10,
                                              conflict_rules=rules)
            for call in calls:
                judge = call["model"]
                print(f"  {judge} giving {slug} on {document} a depth out of ten ...", flush=True)
                cell["new"][judge] = depth_with_ladder(slug, judge, system, user, config,
                                                       call_model, panel, here)

        (folder / "pilot.json").write_text(json.dumps(results, indent=2, ensure_ascii=False),
                                           encoding="utf-8")
        (folder / "summary.md").write_text(summary(results), encoding="utf-8")

    results["finished_at"] = now()
    results["cost_usd"] = round(sum(_costs(results)), 6)
    (folder / "pilot.json").write_text(json.dumps(results, indent=2, ensure_ascii=False),
                                       encoding="utf-8")
    (folder / "summary.md").write_text(summary(results), encoding="utf-8")
    return estimate, folder


def _resolve_conflict_rules(locators, spec_passages, document):
    """The document's general rules for conflicts, as a replay's saved
    `conflict_rules` locators resolve against a freshly fetched passage list.
    A saved locator that no longer resolves stops the replay, naming it and
    the document."""
    by_locator = {locator: (locator, section, text) for locator, section, text in spec_passages}
    rules = []
    for locator in locators:
        if locator not in by_locator:
            raise SystemExit(
                f"{document}: the conflict rule {locator!r} no longer resolves against "
                "its passages; replay refused")
        rules.append(by_locator[locator])
    return rules


def replay_pilot(store, config, registry, passages_for, source_folder, out_dir, call_model=None,
                 go=False, panel=PANEL):
    """Replay a pilot's failed depths: for every cell of `source_folder`'s
    pilot.json carrying a judge whose depth is None, give that judge's depth
    again through `depth_with_ladder`, and nothing else: no whole-document
    call is made. Returns (the price in dollars, the folder written, or None
    when nothing was run), the same shape as `run_pilot`.

    The retained passages are recomputed by `cell_evidence`, so its evidence
    guard still applies, and the conflict rules are the source run's own
    `conflict_rules` locators looked up in a freshly fetched passage list."""
    source_folder = Path(source_folder)
    saved = json.loads((source_folder / "pilot.json").read_text())
    saved_digest = saved["prompts"]["depth"]
    current_digest = depth_call.prompt_sha256(10)
    if saved_digest != current_digest:
        raise SystemExit(
            f"{source_folder} was judged with depth prompt {saved_digest}, but the prompt "
            f"on disk is {current_digest}; replay refused")

    versions = {f"{row['spec_id']}@{row['version']}": row
                for row in store.select("aci_spec_versions")}
    publication_id = saved["publication"]

    to_replay = []                                  # (document, slug, judges, system, user)
    estimate = 0.0
    for document, record in saved["documents"].items():
        failed = {slug: [judge for judge, given in cell["new"].items()
                         if given.get("depth") is None]
                 for slug, cell in record["cells"].items()}
        failed = {slug: judges for slug, judges in failed.items() if judges}
        if not failed:
            continue
        spec_id, version = split_document(document)
        spec_passages = passages_for(spec_id, version)
        rules = _resolve_conflict_rules(record.get("conflict_rules", []), spec_passages, document)
        for slug, judges in failed.items():
            retained, _calls, _old = cell_evidence(store, publication_id, slug,
                                                   versions[document]["id"], spec_passages)
            system, user = depth_call.compose(slug, registry, retained, scale=10,
                                              conflict_rules=rules)
            estimate += sum(priced(judge, system, user, OUTPUT_TOKENS["depth"], config)
                           for judge in judges)
            to_replay.append((document, slug, judges, system, user))

    # A replay is typically a handful of depth calls, cheap enough that two
    # decimal places would round every one of them to zero: the sample pilot
    # this design was checked against prices a single deepseek depth call at
    # $0.001834, which rounds to nothing at run_pilot's own precision.
    estimate = round(estimate, 4)
    if not go:
        return estimate, None
    call_model = call_model or batch_job.call_openrouter

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    folder = Path(out_dir) / f"{stamp}-pilot-scale-ten-replay"
    folder.mkdir(parents=True, exist_ok=True)
    results = {"started_at": now(), "replayed_from": str(source_folder),
              "publication": publication_id, "estimate_usd": estimate,
              "prompts": {"depth": current_digest}, "documents": {}}

    for document, slug, judges, system, user in to_replay:
        here = folder / document.replace("@", "_")
        here.mkdir(exist_ok=True)
        cell = (results["documents"].setdefault(document, {"cells": {}})
               ["cells"].setdefault(slug, {"new": {}}))
        for judge in judges:
            print(f"  {judge} giving {slug} on {document} a depth out of ten again ...",
                 flush=True)
            cell["new"][judge] = depth_with_ladder(slug, judge, system, user, config, call_model,
                                                   panel, here)

    results["finished_at"] = now()
    results["cost_usd"] = round(sum(_costs(results)), 6)
    (folder / "pilot.json").write_text(json.dumps(results, indent=2, ensure_ascii=False),
                                       encoding="utf-8")
    (folder / "summary.md").write_text(replay_summary(results), encoding="utf-8")
    return estimate, folder


def _score_of(answers, criterion):
    question = "contradictions" if criterion == "contradictions" else "criteria"
    answer = answers.get(question, {})
    if "error" in answer:
        return "error"
    value = (answer.get("score") if criterion == "contradictions"
             else answer.get("scores", {}).get(criterion))
    return "no answer" if value is None else str(value)


def _cell_text(value):
    return str(value).replace("|", "/").replace("\n", " ")


def _cut(text, limit=300):
    return (text or "")[:limit]


def _substitution_clause(answer):
    """'fable refused (reason), opus answered; ', or '' when the seat's own
    model answered and nothing was substituted."""
    substituted = answer.get("substituted")
    if not substituted:
        return ""
    parts = [f"{item['model']} refused ({item['reason']})" for item in substituted]
    parts.append(f"{answer['model']} answered")
    return ", ".join(parts) + "; "


def _all_failed_clause(substituted):
    """'fable refused (reason), opus refused (reason), kimi refused (reason)',
    for a seat whose every candidate failed."""
    return ", ".join(f"{item['model']} refused ({item['reason']})" for item in substituted)


def _seat_label(record, seat, question):
    """'fable (opus)' when a substitute answered `seat`'s `question` call,
    otherwise just `seat`."""
    model = record["assessment"].get(seat, {}).get(question, {}).get("model")
    return f"{seat} ({model})" if model and model != seat else seat


def _depth_label(judge, given):
    """'deepseek (kimi)' when a substitute answered `judge`'s depth call,
    otherwise just `judge`."""
    model = given.get("model")
    return f"{judge} ({model})" if model and model != judge else judge


def _depth_calls_suffix(given):
    """' (3 calls)' when the ladder took more than one call to settle `given`,
    otherwise ''."""
    attempts = given.get("attempts") or []
    return f" ({len(attempts)} calls)" if len(attempts) > 1 else ""


def _confirmed_status(claim):
    """'confirmed', 'not confirmed', with ', absolute' appended when a seat
    called it absolute, or ', absoluteness not asked' when nobody was asked
    about the claim at all (every seat found it already)."""
    status = "confirmed" if claim["confirmed"] else "not confirmed"
    if claim["absolute"] is None:
        return f"{status}, absoluteness not asked"
    if claim["absolute"]:
        return f"{status}, absolute"
    return status


def _calls_lines(record):
    """One line per seat and question: for criteria, finish_reason and whether
    the reply was complete; for contradictions, items listed, items unreadable,
    score and finish_reason; for a confirmation call, how many claims it
    answered and how it settled them. An error shows its message. A
    substitution is named before the rest of the line."""
    lines = []
    for seat, answers in record["assessment"].items():
        for question, answer in answers.items():
            if "error" in answer:
                lines.append(f"- {seat} {question}: "
                             f"{_all_failed_clause(answer.get('substituted', []))}")
            elif question == "contradictions":
                lines.append(
                    f"- {seat} {question}: {_substitution_clause(answer)}"
                    f"{len(answer.get('items', []))} items listed, "
                    f"{answer.get('unreadable', 0)} unreadable, score {answer.get('score')}, "
                    f"finish_reason={answer.get('finish_reason')}")
            elif question == "confirm":
                answered = len(answer.get("verdicts", {}))
                lines.append(
                    f"- {seat} confirm: {_substitution_clause(answer)}"
                    f"{answer.get('claims_asked', answered)} claims asked, "
                    f"{answered} answered, finish_reason={answer.get('finish_reason')}")
            else:
                complete = "complete" if answer.get("complete") else "incomplete"
                lines.append(f"- {seat} {question}: {_substitution_clause(answer)}"
                             f"finish_reason={answer.get('finish_reason')}, {complete}")
    return lines


def _contradictions_lines(record):
    """One item per pooled claim: whether it is confirmed and, when its
    absoluteness was asked about, whether it is absolute; who found it, who
    held and rejected it on a second reading with their reasons, a seat named
    beside its substitute where one answered in its place; then both
    passages' text cut to 300 characters."""
    passage_text = record.get("passage_text", {})
    lines = []
    for claim in record.get("contradictions", []):
        found = ", ".join(_seat_label(record, seat, "contradictions")
                          for seat in claim["found_by"])
        held = ", ".join(f"{_seat_label(record, seat, 'confirm')} "
                         f"({_cell_text(claim['reasons'].get(seat, ''))})"
                         for seat in claim["holds"])
        rejected = ", ".join(f"{_seat_label(record, seat, 'confirm')} "
                             f"({_cell_text(claim['reasons'].get(seat, ''))})"
                             for seat in claim["does_not_hold"])
        lines.append(f"- `{claim['first']}` against `{claim['second']}`: "
                     f"{_confirmed_status(claim)}. {claim['situation']} {claim['why']}")
        lines.append(f"  - Found by {found}."
                     + (f" Held by {held}." if held else "")
                     + (f" Rejected by {rejected}." if rejected else ""))
        lines.append(f"  - `{claim['first']}`: {_cut(passage_text.get(claim['first']))}")
        lines.append(f"  - `{claim['second']}`: {_cut(passage_text.get(claim['second']))}")
    return lines


def _rationales_lines(record):
    """Per criterion, each seat's rationale, contradictions included."""
    lines = []
    for criterion in ("conflict_rules", "contradictions", "rule_force", "reasons",
                      "situations"):
        question = "contradictions" if criterion == "contradictions" else "criteria"
        for seat, answers in record["assessment"].items():
            answer = answers.get(question, {})
            rationale = (answer.get("rationale") if criterion == "contradictions"
                        else answer.get("rationales", {}).get(criterion))
            if rationale:
                lines.append(f"- {LABELS[criterion]}, {seat}: {rationale}")
    return lines


def summary(results):
    """The pilot, for a person to read: per document, the five criteria by
    judge, the calls behind them, the general conflict rules with their text,
    every contradiction after its second reading with who found it, who held
    and rejected it and whether it is confirmed and absolute, and each depth
    out of ten beside the published depth out of four, doubled. A seat named
    beside a substitute, such as "fable (opus)", means the substitute
    answered that call in the seat's place.

    finished_at and cost_usd are absent from a write made mid-run; the header
    then says the run is not finished and gives the cost run up so far."""
    finished_at = results.get("finished_at")
    cost = results.get("cost_usd")
    if cost is None:
        cost = round(sum(_costs(results)), 6)
    if finished_at:
        status = (f"finished {finished_at}. Priced at {results['estimate_usd']} dollars, "
                  f"cost {cost} dollars.")
    else:
        status = (f"not finished. Priced at {results['estimate_usd']} dollars, cost {cost} "
                  "dollars so far.")
    lines = ["# Pilot: depth out of ten, and the document as a whole", "",
             f"Publication read: `{results['publication']}`. Started "
             f"{results['started_at']}, {status}", "",
             "Prompts: " + ", ".join(f"{name} `{sha[:8]}`"
                                    for name, sha in results["prompts"].items()) + "."]
    odd = given_count = no_depth = 0
    for document, record in results["documents"].items():
        seats = list(record["assessment"])
        passage_text = record.get("passage_text", {})
        lines += ["", f"## {document}", "", "### The document as a whole", "",
                  "| Criterion | " + " | ".join(seats) + " |",
                  "|---|" + "---|" * len(seats)]
        for criterion in ("conflict_rules", "contradictions", "rule_force", "reasons",
                          "situations"):
            lines.append(f"| {LABELS[criterion]} | "
                         + " | ".join(_score_of(record["assessment"][seat], criterion)
                                      for seat in seats) + " |")
        lines += ["", "### Calls", ""] + _calls_lines(record)
        lines += ["", "### Rationales", ""] + (_rationales_lines(record) or ["None."])
        lines += ["", "General rules for conflicts, cited by at least two judges:", ""]
        if record["conflict_rules"]:
            lines += [f"- `{locator}`: {_cut(passage_text.get(locator))}"
                      for locator in record["conflict_rules"]]
        else:
            lines += ["None."]
        lines += ["", "### Contradictions, after a second reading", ""]
        lines += _contradictions_lines(record) or ["None."]
        lines += ["", f"Score from confirmed contradictions: {record['contradictions_score']}."]
        lines += ["", "### Depth out of ten", "",
                  "| Behaviour | Judge | Out of four, doubled | Out of ten | Rationale |",
                  "|---|---|---|---|---|"]
        for slug, cell in record["cells"].items():
            for tag in sorted(set(cell["old"]) | set(cell["new"])):
                old = cell["old"].get(tag)
                given = cell["new"].get(tag, {})
                new = given.get("depth")
                if new is not None:
                    given_count += 1
                    odd += new % 2
                    reason = given.get("rationale") or ""
                else:
                    if tag in cell["new"]:
                        no_depth += 1
                    if "error" in given:
                        reason = given["error"]
                    else:
                        attempts = given.get("attempts") or []
                        finish_reason = (attempts[-1]["finish_reason"] if attempts
                                        else given.get("finish_reason"))
                        reason = f"no depth (finish_reason={finish_reason})"
                reason = f"{reason}{_depth_calls_suffix(given)}"
                lines.append(f"| {slug} | {_depth_label(tag, given)} | "
                             f"{'no answer' if old is None else old * 2} | "
                             f"{'no answer' if new is None else new} | "
                             f"{_cell_text(reason)} |")
    lines += ["", f"Odd values: {odd} of {given_count} depths out of ten. {no_depth} gave no "
                  "depth."]
    return "\n".join(lines) + "\n"


def replay_summary(results):
    """A replay, for a person to read: which pilot it replayed, the depth
    table for the cells it gave again, and the cost. No whole-document
    question is part of a replay, so this carries none of `summary`'s other
    sections."""
    finished_at = results.get("finished_at")
    if finished_at:
        status = f"finished {finished_at}. Cost {results['cost_usd']} dollars."
    else:
        status = f"not finished. Priced at {results['estimate_usd']} dollars."
    lines = ["# Pilot replay: failed depths given again", "",
             f"Replayed from `{results['replayed_from']}`. Publication read: "
             f"`{results['publication']}`. Started {results['started_at']}, {status}", "",
             "| Document | Behaviour | Judge | Out of ten | Rationale |",
             "|---|---|---|---|---|"]
    for document, record in results["documents"].items():
        for slug, cell in record["cells"].items():
            for judge, given in cell["new"].items():
                new = given.get("depth")
                if new is not None:
                    reason = given.get("rationale") or ""
                elif "error" in given:
                    reason = given["error"]
                else:
                    attempts = given.get("attempts") or []
                    finish_reason = attempts[-1]["finish_reason"] if attempts else None
                    reason = f"no depth (finish_reason={finish_reason})"
                reason = f"{reason}{_depth_calls_suffix(given)}"
                lines.append(f"| {document} | {slug} | {_depth_label(judge, given)} | "
                             f"{'no answer' if new is None else new} | {_cell_text(reason)} |")
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--go", action="store_true",
                        help="spend: without it the pilot is priced and nothing is called")
    parser.add_argument("--documents", default=",".join(DOCUMENTS),
                        help="document ids, comma-separated")
    parser.add_argument("--behaviours", default=",".join(BEHAVIOURS),
                        help="behaviour slugs, comma-separated")
    parser.add_argument("--out", default=str(ROOT / "artefacts"),
                        help="where the results go (default: artefacts/)")
    parser.add_argument("--replay", default=None, metavar="FOLDER",
                        help="give a saved pilot's failed depths again, through the ladder "
                             "only; no whole-document call is made")
    args = parser.parse_args(argv)

    from store import Store
    store = Store.from_env()
    index_store.install_registry(store)
    registry = index_store.judging_registry(store)
    config = h.load_config()
    if args.go and os.environ.get("ANTHROPIC_API_KEY"):
        print("note: ANTHROPIC_API_KEY is set, so fable is called on Anthropic's own "
              "API. The repository's .env has carried a stale key that answers 401; "
              "unset it to go through OpenRouter, as the container does.", file=sys.stderr)
    if args.replay:
        estimate, folder = replay_pilot(store, config, registry, h.passages, args.replay,
                                        args.out, go=args.go)
    else:
        estimate, folder = run_pilot(store, config, registry, h.passages, args.out, go=args.go,
                                     documents=tuple(args.documents.split(",")),
                                     behaviours=tuple(args.behaviours.split(",")))
    if folder is None:
        print(f"Priced at about {estimate} dollars. Nothing was spent; run again with --go.")
        return 0
    print(f"\nWritten to {folder}")
    print("  summary.md       read this first")
    print("  pilot.json       everything, parsed")
    print("  */*.reply.txt    every reply exactly as it came back")
    return 0


if __name__ == "__main__":
    sys.exit(main())
