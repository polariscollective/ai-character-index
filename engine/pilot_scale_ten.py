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

It composes the first method's prompts, `PROMPTS` below, named here rather than
taken from `assessment_call.PROMPTS`, which now names the second method's v2
contradictions and confirm. The flow above is the first method's: a claim is put
only to the seats that did not find it, and a finder's own row counts as a
reading that holds. The v2 prompts were written for a flow that asks every seat
about every claim and scores no document on the count of its contradictions, so
composing them here would send a prompt that does not describe what this script
then does with the answer.
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
import assessment_run            # noqa: E402
import bands                     # noqa: E402
import batch_job                 # noqa: E402
import depth_call                # noqa: E402
import depth_ladder              # noqa: E402
import index_store               # noqa: E402
from assessment_run import (     # noqa: E402
    CONFIRM_CLAIMS_CHARS, CONFIRM_OUTPUT_TOKENS, conflict_rules)
from seat_call import priced     # noqa: E402

_spec = importlib.util.spec_from_file_location("h", HERE / "panel" / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

# The first method's prompts, by name. See the module docstring.
PROMPTS = {"criteria": HERE / "panel" / "prompts" / "assessment-criteria-v1.txt",
           "contradictions": HERE / "panel" / "prompts" / "assessment-contradictions-v1.txt",
           "confirm": HERE / "panel" / "prompts" / "assessment-confirm-v1.txt"}

DOCUMENTS = ("anthropic--constitution@2026-01-20", "openai--model-spec@2026-08-18")
BEHAVIOURS = ("honesty-and-non-deception", "no-sycophancy",
              "instruction-hierarchy-conformance", "harm-avoidance-to-third-parties")
PANEL = "frontier_fast"
# The assessment's output allowances, and one for a depth call.
OUTPUT_TOKENS = dict(assessment_run.OUTPUT_TOKENS, depth=1000)
# The rules block a depth call will carry, priced before anyone has cited it.
RULES_ALLOWANCE_CHARS = 4000
LABELS = {"conflict_rules": "Conflict rules", "contradictions": "Unresolved contradictions",
          "rule_force": "Force of each rule", "reasons": "Reasons given",
          "situations": "Situations covered"}


def now():
    return datetime.now(timezone.utc).isoformat()


def split_document(document_id):
    spec_id, _, version = document_id.partition("@")
    return spec_id, version


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


def _ask_seat(seat, question, system, user, config, call_model, panel, here, seated):
    """`assessment_run.ask_with_substitutes`, with every refused candidate's
    reply that has any text saved to `<seat>.<question>.<candidate>.refused.txt`
    beside the other replies. Returns (tag, answer, substituted)."""
    tag, answer, substituted, refused = assessment_run.ask_with_substitutes(
        seat, system, user, config, call_model, panel, seated=seated)
    for candidate, reply in refused:
        (here / f"{seat}.{question}.{candidate}.refused.txt").write_text(reply, encoding="utf-8")
    return tag, answer, substituted


def depth_with_ladder(slug, judge, system, user, config, call_model, panel, here):
    """One judge's depth out of ten, given through `depth_ladder.give`, with
    every reply it came back with saved to `<slug>.<model>.depth.<n>.reply.txt`,
    `n` counting from 1 for that model; an attempt that raised has no reply and
    no file.

    Returns the cell's entry for `judge` as pilot.json has always carried it:
    `depth`, `rationale`, `model` (the model that answered, `judge` itself
    unless a substitute did), `attempts` (every call made, in order), and
    `substituted` (present only once a substitute answered)."""
    given = depth_ladder.give(judge, system, user, config, call_model, panel=panel)
    counters = {}
    for attempt, reply in zip(given["attempts"], given["replies"]):
        if reply is None:
            continue
        n = counters[attempt["model"]] = counters.get(attempt["model"], 0) + 1
        (here / f"{slug}.{attempt['model']}.depth.{n}.reply.txt").write_text(reply,
                                                                             encoding="utf-8")
    entry = {"depth": given["depth"], "rationale": given["rationale"], "model": given["model"],
             "attempts": given["attempts"]}
    if given["substitution_reason"] is not None:
        entry["substituted"] = {"model": given["model"],
                                "reason": given["substitution_reason"]}
    return entry


def confirm_stage(record, contradictions_by_seat, seats, text, prompt_passages, config,
                   call_model, panel, here):
    """Put every contradiction one seat found to the seats that did not find
    it, settle which are confirmed, and return (contradictions, score) for
    `record`. A seat with nothing left to confirm is not called."""
    pooled = assessment_run.pool_claims(contradictions_by_seat, seats)
    verdicts_by_seat = {}
    for seat in seats:
        to_confirm = assessment_run.claims_to_confirm(pooled, seat)
        if not to_confirm:
            continue
        print(f"  {seat} confirming {len(to_confirm)} contradictions ...", flush=True)
        claims = [claim for _i, claim in to_confirm]
        system, user = assessment_call.compose_confirm(prompt_passages, claims, PROMPTS)
        tag, answer, substituted = _ask_seat(seat, "confirm", system, user, config, call_model,
                                             panel, here, seats)
        if answer is None:
            record["assessment"][seat]["confirm"] = {
                "error": assessment_run.last_failure(substituted), "substituted": substituted}
            continue
        (here / f"{seat}.confirm.reply.txt").write_text(answer["reply"], encoding="utf-8")
        verdicts = assessment_call.parse_confirm(answer["reply"], len(claims))
        record["assessment"][seat]["confirm"] = dict(
            verdicts=verdicts, model=tag, substituted=substituted,
            cost_usd=answer["cost_usd"], finish_reason=answer["finish_reason"],
            provider=answer["provider"], model_id=answer["model_id"], kwargs=answer["kwargs"],
            claims_asked=len(claims))
        verdicts_by_seat[seat] = assessment_run.by_claim(to_confirm, verdicts)
    # settle counts readings alone: a finder's is that it holds, as the "found
    # it" row a stored run of this method writes for it.
    for i, claim in enumerate(pooled):
        for seat in claim["found_by"]:
            verdicts_by_seat.setdefault(seat, {})[i] = {"holds": True, "absolute": None,
                                                        "reason": "found it"}
    contradictions = assessment_run.settle(pooled, verdicts_by_seat, seats, text)
    return contradictions, assessment_run.confirm_score(contradictions)


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
    confirm_system = assessment_call.system_prompt("confirm", PROMPTS)
    for document in documents:
        for question in assessment_call.QUESTIONS:
            system, user = assessment_call.compose(question, prompt_passages[document],
                                                   PROMPTS)
            estimate += sum(priced(seat, system, user, OUTPUT_TOKENS[question], config)
                            for seat in seats)
        # A confirmation call carries the whole document, as compose_confirm
        # opens with it, plus an allowance for the claims; its shape is only
        # known once contradictions come back, so it is priced here as one
        # call per seat regardless.
        _system, confirm_user = assessment_call.compose_confirm(
            prompt_passages[document], [], PROMPTS)
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
                           "confirm": assessment_call.prompt_sha256("confirm", PROMPTS),
                           **{question: assessment_call.prompt_sha256(question, PROMPTS)
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
                system, user = assessment_call.compose(question, labelled, PROMPTS)
                tag, answer, substituted = _ask_seat(
                    seat, question, system, user, config, call_model, panel, here, seats)
                if answer is None:
                    record["assessment"][seat][question] = {
                        "error": assessment_run.last_failure(substituted),
                        "substituted": substituted}
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
                         for seat in claim["holds"] if seat not in claim["found_by"])
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
