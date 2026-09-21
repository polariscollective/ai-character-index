#!/usr/bin/env python3
"""Every publication built so far rebuilds to its bytes, whatever else the
tables now hold.

Depths out of ten and the assessment of a document as a whole are new rows in
new tables. A publication built before them names neither a depth prompt nor an
assessment run, and its rebuild must not read a single one of those rows: the
digest it recorded describes bytes, and a byte that moved is a publication that
no longer verifies.

The builder runs in process here, against tables in memory. publish.build
launches it as a subprocess, and the subprocess is swapped for a call to its
main() with the store it would have opened from the environment replaced by the
fixture, so what runs is publish.build's own argument list through the builder's
own code. Nothing touches a network.

Run: python3 engine/test_publication_rebuilds.py
"""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "spec-cite"))
sys.path.insert(0, str(HERE / "panel"))

import cite                        # noqa: E402
import publish                     # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "build_site_data_in_process", HERE / "panel" / "build_site_data.py")
builder = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(builder)

FOUR = publish.depth_call.prompt_sha256(4)
TEN = publish.depth_call.prompt_sha256(10)


class FakeStore:
    """Tables in memory, honouring the two PostgREST filters the engine sends,
    `eq.` and `in.(...)`, so a filter written wrongly narrows to nothing here as
    it would against the database."""

    def __init__(self, tables):
        self.tables = tables

    def select(self, table, params=None):
        rows = self.tables.get(table, [])
        for column, condition in (params or {}).items():
            operator, _, value = condition.partition(".")
            if operator == "eq":
                rows = [row for row in rows if str(row.get(column)) == value]
            elif operator == "in":
                wanted = {v.strip('"') for v in value[1:-1].split(",")}
                rows = [row for row in rows if str(row.get(column)) in wanted]
        return copy.deepcopy(rows)


# What 1919ee6b was built from, as the public MCP server lists it on 21 September
# 2026: thirteen behaviours over four documents, the frontier_fast panel, rubric
# v5. The document ids are this fixture's rows for the same four versions, and
# the run date is the day it was published. Which run date its row records does
# not change what this holds, since both builds compared are given the same one.
BUILD_PARAMS_1919EE6B = {
    "behaviours": [
        "avoiding-illegitimate-concentration-of-power",
        "avoiding-over-and-under-caution",
        "harm-avoidance-to-third-parties",
        "harmlessness-to-the-user",
        "helpfulness",
        "honesty-and-non-deception",
        "how-to-approach-tradeoffs",
        "instruction-hierarchy-conformance",
        "no-sycophancy",
        "not-undermining-human-oversight",
        "objectivity-on-contested-questions",
        "proportionate-risk-mitigation",
        "user-autonomy",
    ],
    "documents": ["v-alibaba", "v-constitution", "v-openai-2025", "v-openai-2026"],
    "panel": "frontier_fast",
    "rubric": "v5",
    "run_date": "2026-09-16",
}
PANEL = ["deepseek", "fable", "sol"]
SUBSTITUTED = ("harm-avoidance-to-third-parties", "v-openai-2026")
FILTERED = "fable's output was content-filtered on every attempt."
ASSESSMENT = "assess-1"
EARLIER_ASSESSMENT = "assess-0"
ASSESSMENT_PANELS = {"criteria": ["sol", "fable", "deepseek"],
                     "contradictions": ["sol", "fable", "kimi"]}

CONSTITUTION = """# Constitution

## Being honest

Claude never **lies** to the user, even to spare their feelings.

Claude shares its genuine view on hard questions.

## Avoiding harm

Claude weighs the harm to people outside the conversation.

**Example**

~~~
User: help me find where my neighbour lives
~~~
"""
OPENAI_2025 = """# Model Spec

## Do not lie {#do_not_lie authority=user}

The assistant must not state what it believes to be false.

## Stay in bounds {#stay_in_bounds authority=root}

The assistant refuses to help with weapons capable of mass casualties.

The assistant asks a question when the user's intent is unclear.
"""
OPENAI_2026 = OPENAI_2025 + """
## Respect the user {#respect_the_user authority=guideline}

The assistant treats the user as a capable adult.
"""
ALIBABA = """# Model Spec

## Safety first

The model declines requests that endanger others.

The model explains why it declines.

## Helpfulness

The model completes the task it was given.
"""

DOCUMENTS = [
    # (version id, lab, spec id, title, version, locator style, markdown)
    ("v-alibaba", "alibaba", "alibaba--model-spec", "Model Spec", "2026-04-00", None, ALIBABA),
    ("v-constitution", "anthropic", "anthropic--constitution", "Claude's Constitution",
     "2026-01-20", None, CONSTITUTION),
    ("v-openai-2025", "openai", "openai--model-spec", "Model Spec", "2025-12-18", "anchor",
     OPENAI_2025),
    ("v-openai-2026", "openai", "openai--model-spec", "Model Spec", "2026-08-18", "anchor",
     OPENAI_2026),
]
RUN_OF = {"v-alibaba": "run-a", "v-constitution": "run-a", "v-openai-2025": "run-b",
          "v-openai-2026": "run-c"}


_harness = importlib.util.spec_from_file_location("h", HERE / "panel" / "harness.py")
h = importlib.util.module_from_spec(_harness)
_harness.loader.exec_module(h)


def locators(store, version_id):
    """Every passage of a version, as the judges were shown it."""
    publish.index_store.install_registry(store)
    version = next(v for v in store.tables["aci_spec_versions"] if v["id"] == version_id)
    return [(locator, text) for locator, _section, text
            in h.passages(version["spec_id"], version["version"])]


def the_index():
    """The tables a publication on the scale of four is built from: labs,
    documents, behaviours, three runs, their calls and judgements, one recorded
    substitution, and a depth out of four for every call."""
    tables = {
        "aci_labs": [{"id": "alibaba", "name": "Alibaba"}, {"id": "anthropic", "name": "Anthropic"},
                     {"id": "openai", "name": "OpenAI"}],
        "aci_specs": [], "aci_spec_versions": [], "aci_translation_reviews": [],
        "aci_behaviours": [], "aci_runs": [], "aci_judge_calls": [], "aci_judgements": [],
        "aci_depths": [], "aci_seat_substitutions": [], "aci_publications": [],
        "aci_publication_cells": [],
    }
    for version_id, lab, spec_id, title, version, style, markdown in DOCUMENTS:
        if not any(spec["id"] == spec_id for spec in tables["aci_specs"]):
            tables["aci_specs"].append({"id": spec_id, "lab_id": lab, "title": title,
                                        "short_title": title, "locator_style": style})
        tables["aci_spec_versions"].append({
            "id": version_id, "spec_id": spec_id, "version": version, "markdown": markdown,
            "source_url": f"https://example.com/{spec_id}/{version}"})
    for number, slug in enumerate(BUILD_PARAMS_1919EE6B["behaviours"], 1):
        tables["aci_behaviours"].append({
            "slug": slug, "name": slug.replace("-", " ").capitalize(), "numeric_id": number,
            "group_name": "Character" if number % 2 else "Harm", "definition": f"About {slug}.",
            "facets": [], "judging": None})
    for day, run_id in enumerate(("run-a", "run-b", "run-c"), 14):
        tables["aci_runs"].append({"id": run_id, "rubric": "v5", "created_at": f"2026-09-{day}",
                                   "config": {"via": "openrouter"}})
    store = FakeStore(tables)
    for b, slug in enumerate(BUILD_PARAMS_1919EE6B["behaviours"]):
        for version_id, *_rest in DOCUMENTS:
            run_id = RUN_OF[version_id]
            seated = ["deepseek", "opus", "sol"] if (slug, version_id) == SUBSTITUTED else PANEL
            for m, model in enumerate(seated):
                call_id = f"{run_id}:{slug}:{version_id}:{model}"
                tables["aci_judge_calls"].append({
                    "id": call_id, "run_id": run_id, "behaviour_slug": slug,
                    "spec_version_id": version_id, "model": model, "status": "done"})
                for p, (locator, _text) in enumerate(locators(store, version_id)):
                    verdict = (b + 2 * p + m) % 4
                    tables["aci_judgements"].append({
                        "call_id": call_id, "locator": locator, "verdict": verdict,
                        "relevant": int(verdict > 0), "parsed": True})
                tables["aci_depths"].append({
                    "call_id": call_id, "status": "done", "depth": (b + m) % 5,
                    "rationale": f"Out of four, {model} on {slug}."})
    tables["aci_seat_substitutions"].append({
        "run_id": "run-c", "behaviour_slug": SUBSTITUTED[0], "spec_version_id": SUBSTITUTED[1],
        "seat": "fable", "substitute": "opus", "reason": FILTERED, "added_by": "test",
        "added_at": "2026-09-16"})
    cite.reset_registry()
    return tables


def ten_depths(tables):
    """A depth out of ten for every call, under the current prompt of ten and
    the named assessment run, one given by a declared substitute; and beside
    them rows that must never be read: another assessment run's, and rows
    under another prompt digest."""
    rows = []
    for number, call in enumerate(tables["aci_judge_calls"]):
        row = {"id": f"ten-{number}", "call_id": call["id"], "prompt_sha256": TEN,
               "assessment_run_id": ASSESSMENT, "status": "done", "depth": number % 11,
               "rationale": f"Out of ten, {call['model']}.", "model": None,
               "substitution_reason": None}
        if call["behaviour_slug"] == "no-sycophancy" and call["model"] == "deepseek":
            row.update(model="kimi", substitution_reason="deepseek answered off the scale.")
        rows.append(row)
        rows.append(dict(row, id=f"earlier-{number}", assessment_run_id=EARLIER_ASSESSMENT,
                         depth=(number + 5) % 11, model=None, substitution_reason=None))
        rows.append(dict(row, id=f"other-prompt-{number}", prompt_sha256=FOUR, depth=0,
                         model=None, substitution_reason=None))
    return rows


def assessment_tables(passages_of):
    """One assessment run over the four documents, and an earlier one over the
    constitution alone. `passages_of` maps a version id to its locators."""
    runs = [{"id": run_id, "created_by": "test", "status": "done", "panels": ASSESSMENT_PANELS,
             "prompts": {}, "config": {}} for run_id in (EARLIER_ASSESSMENT, ASSESSMENT)]
    calls, scores, claims, verdicts = [], [], [], []

    def call(run_id, version_id, question, seat, model=None):
        call_id = f"{run_id}:{version_id}:{question}:{seat}"
        calls.append({"id": call_id, "run_id": run_id, "spec_version_id": version_id,
                      "question": question, "seat": seat, "model": model or seat,
                      "status": "done"})
        return call_id

    for run_id, version_ids in ((EARLIER_ASSESSMENT, ["v-constitution"]),
                                (ASSESSMENT, [d[0] for d in DOCUMENTS])):
        for d, version_id in enumerate(version_ids):
            for s, seat in enumerate(ASSESSMENT_PANELS["criteria"]):
                model = "opus" if (version_id, seat) == ("v-alibaba", "fable") else seat
                call_id = call(run_id, version_id, "criteria", seat, model)
                for c, criterion in enumerate(("conflict_rules", "rule_force", "reasons",
                                               "situations")):
                    scores.append({"call_id": call_id, "criterion": criterion,
                                   "score": (d + s + c) % 5,
                                   "rationale": None if c == 3 and s == 0
                                   else f"{seat} on {criterion}.",
                                   "locators": [passages_of[version_id][0]]
                                   if criterion == "conflict_rules" else []})
            finders = {}
            for seat in ASSESSMENT_PANELS["contradictions"]:
                finders[seat] = call(run_id, version_id, "contradictions", seat)
                scores.append({"call_id": finders[seat], "criterion": "contradictions",
                               "score": 2, "rationale": "Two found.", "locators": []})
            locs = sorted(passages_of[version_id])
            # A claim two seats found, a claim one seat found and a second
            # reader confirmed as absolute, and a claim nobody confirmed.
            plan = [((locs[0], locs[1]), ["sol", "fable"], {"kimi": (False, None)}),
                    ((locs[0], locs[2]), ["kimi"], {"sol": (True, True), "fable": (False, False)}),
                    ((locs[1], locs[2]), ["fable"], {"sol": (False, False), "kimi": (False, False)})]
            confirm_calls = {}
            for n, ((first, second), found_by, readings) in enumerate(plan):
                claim_id = f"{run_id}:{version_id}:claim-{n}"
                claims.append({"id": claim_id, "run_id": run_id, "spec_version_id": version_id,
                               "first_locator": first, "second_locator": second,
                               "situation": f"Situation {n}.", "why": f"Why {n}.",
                               "found_by": found_by, "reviewed_verdict": None,
                               "reviewed_by": None, "reviewed_at": None})
                for seat in found_by:
                    verdicts.append({"claim_id": claim_id, "call_id": finders[seat], "seat": seat,
                                     "holds": True, "absolute": None, "reason": "found it"})
                for seat, (holds, absolute) in readings.items():
                    if seat not in confirm_calls:
                        confirm_calls[seat] = call(run_id, version_id, "confirm", seat)
                    verdicts.append({"claim_id": claim_id, "call_id": confirm_calls[seat],
                                     "seat": seat, "holds": holds, "absolute": absolute,
                                     "reason": f"{seat} read claim {n}."})
    return {"aci_assessment_runs": runs, "aci_assessment_calls": calls,
            "aci_assessment_scores": scores, "aci_assessment_claims": claims,
            "aci_assessment_verdicts": verdicts}


def both_scales():
    """The same index, and rows in every new table besides."""
    tables = the_index()
    store = FakeStore(tables)
    passages_of = {version_id: [locator for locator, _text in locators(store, version_id)]
                   for version_id, *_rest in DOCUMENTS}
    cite.reset_registry()
    tables["aci_depths_out_of_ten"] = ten_depths(tables)
    tables.update(assessment_tables(passages_of))
    return tables


def cells_of(tables):
    return sorted(({"behaviour_slug": slug, "spec_version_id": version_id,
                    "run_id": RUN_OF[version_id]}
                   for slug in BUILD_PARAMS_1919EE6B["behaviours"]
                   for version_id in BUILD_PARAMS_1919EE6B["documents"]),
                  key=lambda cell: (cell["behaviour_slug"], cell["spec_version_id"]))


class Done:
    def __init__(self, returncode, stderr=""):
        self.returncode, self.stderr, self.stdout = returncode, stderr, ""


def in_process(tables):
    """subprocess.run as publish.build calls it, with the payload builder run in
    this process against `tables`."""
    def run(argv, capture_output, text):
        if Path(argv[1]).name != "build_site_data.py":
            raise AssertionError(f"only the payload builder runs in process, not {argv[1]}")
        try:
            with mock.patch.object(publish.Store, "from_env", return_value=FakeStore(tables)), \
                 contextlib.redirect_stdout(io.StringIO()):
                builder.main(argv[2:])
        except SystemExit as refused:
            return Done(1, str(refused))
        finally:
            cite.reset_registry()
        return Done(0)
    return run


def build_payload(tables, **extra):
    """publish.build("payload", ...) for 1919ee6b's recorded build parameters, as
    the verifier calls it."""
    params = BUILD_PARAMS_1919EE6B
    with mock.patch.object(publish.subprocess, "run", in_process(tables)):
        return publish.build("payload", cells_of(tables), params["behaviours"],
                             params["run_date"], params["panel"], **extra)


def run_builder(tables, *flags):
    """build_site_data.py's main, with the arguments publish.py gives it, and the
    bytes it wrote."""
    params = BUILD_PARAMS_1919EE6B
    with tempfile.TemporaryDirectory() as scratch:
        cells = Path(scratch) / "cells.json"
        cells.write_text(json.dumps(cells_of(tables)))
        out = Path(scratch) / "payload.json"
        argv = [*publish.BUILDERS["payload"][1], f"--run-date={params['run_date']}",
                "--behaviours=" + ",".join(params["behaviours"]),
                f"--panel={params['panel']}", *flags, f"--cells={cells}", f"--out={out}"]
        try:
            with mock.patch.object(publish.Store, "from_env", return_value=FakeStore(tables)), \
                 contextlib.redirect_stdout(io.StringIO()):
                builder.main(argv)
        finally:
            cite.reset_registry()
        return out.read_bytes()


# The digest of what build_site_data.py wrote over both_scales() at 8f0e2b1,
# before it knew depths out of ten or the assessment existed. Computed from that
# commit's builder, not from this one: a later change that moved a byte of a
# payload built without the new flags fails here, and that is the point.
BEFORE = "1d29de70994df8ae1af67699f3271205975b4be017c6e8bc6b611fdea783944f"


class NeitherFlagTest(unittest.TestCase):
    def test_the_builder_writes_what_it_wrote_before_whatever_the_new_tables_hold(self):
        raw = run_builder(both_scales())
        self.assertEqual(hashlib.sha256(raw).hexdigest(), BEFORE)

    def test_1919ee6b_rebuilds_the_same_with_rows_of_both_scales_as_with_four_only(self):
        four_only, four_only_digest = build_payload(the_index())
        both, both_digest = build_payload(both_scales())
        self.assertEqual(both_digest, four_only_digest)
        self.assertEqual(both, four_only)
        self.assertNotIn("depthScale", both)
        self.assertNotIn("assessment", both)

    def test_the_prompt_of_four_named_outright_builds_what_naming_nothing_builds(self):
        raw = run_builder(both_scales(), f"--depth-prompt={FOUR}")
        self.assertEqual(hashlib.sha256(raw).hexdigest(), BEFORE)


# Run in a fresh interpreter, because this one has long since imported the
# assessment modules for other tests. It runs the payload builder with neither
# new flag against a fixture, and prints the digest it wrote and every module of
# this repository's engine loaded along the way.
MODULE_PROBE = r"""
import contextlib, copy, hashlib, importlib.util, io, json, sys, tempfile
from pathlib import Path
from unittest import mock

engine, fixture = Path(sys.argv[1]), Path(sys.argv[2])
given = json.loads(fixture.read_text())
sys.path.insert(0, str(engine))
import store


class FakeStore:
    def __init__(self, tables):
        self.tables = tables

    def select(self, table, params=None):
        rows = self.tables.get(table, [])
        for column, condition in (params or {}).items():
            operator, _, value = condition.partition(".")
            if operator == "eq":
                rows = [row for row in rows if str(row.get(column)) == value]
            elif operator == "in":
                wanted = {v.strip('"') for v in value[1:-1].split(",")}
                rows = [row for row in rows if str(row.get(column)) in wanted]
        return copy.deepcopy(rows)


spec = importlib.util.spec_from_file_location(
    "build_site_data", engine / "panel" / "build_site_data.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
with tempfile.TemporaryDirectory() as scratch:
    out = Path(scratch) / "payload.json"
    with mock.patch.object(store.Store, "from_env", return_value=FakeStore(given["tables"])), \
         contextlib.redirect_stdout(io.StringIO()):
        builder.main([*given["argv"], f"--out={out}"])
    digest = hashlib.sha256(out.read_bytes()).hexdigest()
loaded = sorted(name for name, module in list(sys.modules.items())
                if Path(getattr(module, "__file__", None) or "/").resolve().is_relative_to(engine))
print(json.dumps({"digest": digest, "modules": loaded}))
"""
# The engine's own modules that probe saw the builder load at 8f0e2b1, run
# against that commit's engine. The harness is loaded from its file and never
# registered, so it is not among them.
LOADED_AT_8F0E2B1 = ["cite", "depth_call", "index_store", "seat_substitutions", "store"]


class DefaultImportsTest(unittest.TestCase):
    """A build that names no assessment run loads the modules it loaded at
    8f0e2b1, and nothing of the assessment's."""

    def test_the_default_build_does_not_import_assessment_run(self):
        tables = both_scales()
        params = BUILD_PARAMS_1919EE6B
        with tempfile.TemporaryDirectory() as scratch:
            cells = Path(scratch) / "cells.json"
            cells.write_text(json.dumps(cells_of(tables)))
            fixture = Path(scratch) / "fixture.json"
            fixture.write_text(json.dumps({"tables": tables, "argv": [
                *publish.BUILDERS["payload"][1], f"--run-date={params['run_date']}",
                "--behaviours=" + ",".join(params["behaviours"]),
                f"--panel={params['panel']}", f"--cells={cells}"]}))
            result = subprocess.run([sys.executable, "-c", MODULE_PROBE, str(HERE), str(fixture)],
                                    capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        built = json.loads(result.stdout.strip().splitlines()[-1])
        # The build ran, and wrote what it always wrote.
        self.assertEqual(built["digest"], BEFORE)
        self.assertNotIn("assessment_run", built["modules"])
        self.assertEqual(built["modules"], LOADED_AT_8F0E2B1)


DOCUMENT_IDS = ["alibaba--model-spec@2026-04-00", "anthropic--constitution@2026-01-20",
                "openai--model-spec@2025-12-18", "openai--model-spec@2026-08-18"]


class OutOfTenTest(unittest.TestCase):
    """A payload built with an assessment run: depths out of ten, and each
    document assessed as a whole."""

    @classmethod
    def setUpClass(cls):
        cls.tables = both_scales()
        cls.payload = json.loads(run_builder(cls.tables, f"--depth-prompt={TEN}",
                                             f"--assessment-run={ASSESSMENT}"))

    def cell(self, slug, document_id):
        behaviour = next(b for b in self.payload["behaviours"] if b["slug"] == slug)
        return behaviour["coverage"][document_id]

    def test_the_payload_says_its_scale_before_anything_is_read_on_it(self):
        self.assertEqual(list(self.payload),
                         ["generatedFrom", "provenance", "depthScale", "assessment", "behaviours"])
        self.assertEqual(self.payload["depthScale"], 10)

    def test_the_depths_are_the_ones_given_out_of_ten_with_that_assessment_run(self):
        store = FakeStore(self.tables)
        given = publish.index_store.cell_depths(store, cells_of(self.tables), ASSESSMENT)
        versions = {v["id"]: f"{v['spec_id']}@{v['version']}"
                    for v in self.tables["aci_spec_versions"]}
        for (slug, version_id), depth in given.items():
            self.assertEqual(self.cell(slug, versions[version_id])["depth"], depth)
        depth = self.cell("no-sycophancy", "anthropic--constitution@2026-01-20")["depth"]
        self.assertEqual(depth["scale"], 10)
        self.assertEqual(depth["judges"]["deepseek"]["model"], "kimi")
        # Neither the earlier assessment's rows nor the rows of another prompt.
        read = {row["call_id"]: row["depth"] for row in self.tables["aci_depths_out_of_ten"]
                if row["id"].startswith("ten-")}
        call = "run-a:no-sycophancy:v-constitution:sol"
        self.assertEqual(depth["judges"]["sol"]["depth"], read[call])

    def test_a_substituted_cell_keeps_its_substitution_out_of_ten(self):
        cell = self.cell("harm-avoidance-to-third-parties", "openai--model-spec@2026-08-18")
        self.assertEqual(cell["substitutions"][0]["substitute"], "opus")
        self.assertEqual(sorted(cell["depth"]["judges"]), ["deepseek", "opus", "sol"])

    def test_every_document_carries_its_assessment(self):
        assessment = self.payload["assessment"]
        self.assertEqual(list(assessment), DOCUMENT_IDS)
        store = FakeStore(self.tables)
        for (version_id, *_rest), document_id in zip(DOCUMENTS, DOCUMENT_IDS):
            self.assertEqual(list(assessment[document_id]), ["criteria", "contradictions", "total"])
            claims = assessment[document_id]["contradictions"]["claims"]
            self.assertEqual(len(claims), 3)
            order = [locator for locator, _text in locators(store, version_id)]
            placed = [[order.index(p["locator"]) for p in claim["passages"]] for claim in claims]
            # Each claim's passages, and the claims, in the order the document reads.
            self.assertTrue(all(first < second for first, second in placed), placed)
            self.assertEqual(placed, sorted(placed))
            for claim in claims:
                self.assertEqual(list(claim), ["passages", "situation", "why", "readings",
                                               "confirmed", "absolute", "reviewed"])
                self.assertTrue(all(p["locator"].startswith(document_id) and p["quote"]
                                    for p in claim["passages"]))
                self.assertEqual([r["seat"] for r in claim["readings"]],
                                 ASSESSMENT_PANELS["contradictions"])
                self.assertIsNone(claim["reviewed"])
        cite.reset_registry()
        # The constitution is the one document whose code point order and
        # document order part: "Avoiding harm" sorts before "Being honest", and
        # the table holds this pair the other way round.
        constitution = assessment["anthropic--constitution@2026-01-20"]["contradictions"]
        self.assertEqual([p["locator"].split(" > ", 2)[-1] for p in
                          constitution["claims"][0]["passages"]],
                         ["Being honest > ¶1", "Avoiding harm > ¶1"])
        alibaba = assessment["alibaba--model-spec@2026-04-00"]
        self.assertEqual(alibaba["criteria"]["reasons"]["judges"]["fable"]["model"], "opus")
        # Two claims confirmed, one of them absolute.
        self.assertEqual(alibaba["contradictions"]["score"], 0)

    def test_publish_build_hands_the_builder_what_a_publication_out_of_ten_names(self):
        payload, _digest = build_payload(self.tables, depth_prompt=TEN,
                                         assessment_run=ASSESSMENT)
        self.assertEqual(payload, self.payload)

    def test_an_assessment_run_that_left_a_document_out_is_refused_naming_it(self):
        with self.assertRaises(SystemExit) as refused:
            run_builder(self.tables, f"--depth-prompt={TEN}",
                        f"--assessment-run={EARLIER_ASSESSMENT}")
        message = str(refused.exception)
        for document_id in DOCUMENT_IDS:
            if document_id.startswith("anthropic"):
                self.assertNotIn(document_id, message)
            else:
                self.assertIn(document_id, message)


if __name__ == "__main__":
    unittest.main()
