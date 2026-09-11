#!/usr/bin/env python3
"""Unit tests for the panel pipeline's pure logic. No network, no keys, sub-second.

Each test class names the shipped bug it guards against (all found in review or
the ~2-cent integration run of 2026-07-30). Run:  python3 engine/panel/test_panel.py
"""
import contextlib
import importlib.util
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def hermetic_env():
    """Subprocess environment for EVERY probe and CLI smoke run in this file; by
    construction no subprocess started with it can reach a provider:

    - credential-shaped vars are scrubbed (every key_env name in panel-config.json
      ends in API_KEY; TOKEN/SECRET swept for good measure), so a developer's real
      keys never enter the subprocess;
    - PANEL_DOTENV is pinned at a path that cannot exist, so harness.env() never
      falls back to a developer's engine/panel/.env either;
    - SPEC_CITE_USER_SPECS is pinned at a nonexistent manifest, so a developer's
      local user-spec manifest never changes the registry under test.

    The subprocesses therefore hit the dry-run / arg-parse / missing-key paths --
    never an API call."""
    env = {k: v for k, v in os.environ.items()
           if not re.search(r"API_?KEY|API_TOKEN|SECRET|PASSWORD", k, re.I)}
    env["PANEL_DOTENV"] = str(HERE / "no-such-dotenv")
    env["SPEC_CITE_USER_SPECS"] = str(HERE / "no-such-user-manifest.json")
    return env


h = load("harness")
rr = load("run_rollout")
wd = load("whole_doc")
bs = load("build_site_data")


class TestParseVerdicts(unittest.TestCase):
    """Guards the K3/whole-doc parsing failures: truncation, renumbering, noise."""

    def test_ternary_keyed_lines(self):
        out = "\n".join(f"{i}: {v}" for i, v in enumerate([2, 1, 0, 2], 1))
        self.assertEqual(h.parse_verdicts(out, 4), {1: 2, 2: 1, 3: 0, 4: 2})

    def test_out_of_range_indices_dropped(self):
        out = "1: 2\n2: 1\n999: 2\n3: 0\n4: 1"
        v = h.parse_verdicts(out, 4)
        self.assertNotIn(999, v)
        self.assertEqual(len(v), 4)

    def test_truncated_output_reports_missing_not_zeros(self):
        # 374-passage response cut off at 300 lines: the missing 74 must be ABSENT
        # from the dict (unparsed), never silently graded 0.
        out = "\n".join(f"{i}: 1" for i in range(1, 301))
        v = h.parse_verdicts(out, 374)
        self.assertEqual(len(v), 300)
        self.assertNotIn(374, v)

    def test_tail_fallback_requires_exact_count(self):
        # bare digits without "n:" keys, one short of n -- must refuse to guess
        out = "\n".join("2" for _ in range(9))
        self.assertEqual(h.parse_verdicts(out, 10), {})

    def test_reasoning_prose_does_not_shift_alignment(self):
        # in-content reasoning with digits above the verdict block (the K3 style)
        out = "Passage 3 discusses 2 things about 1 topic.\n" + \
              "\n".join(f"{i}: 0" for i in range(1, 41))
        v = h.parse_verdicts(out, 40)
        self.assertEqual(v, {i: 0 for i in range(1, 41)})


class TestBuildPlan(unittest.TestCase):
    """Guards the resume blocker: banked cells must be skipped, rubric-scoped."""

    FIRST = {"constitution": "c@1 > A > ¶1", "model-spec": "m@1 > #a > ¶1"}

    def setUp(self):
        self._runlog = h.RUNLOG
        self.addCleanup(lambda: setattr(h, "RUNLOG", self._runlog))

    def synth_runlog(self, rows):
        f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
        for r in rows:
            f.write(json.dumps(r) + "\n")
        f.close()
        self.addCleanup(lambda p=Path(f.name): p.unlink(missing_ok=True))
        return Path(f.name)

    def test_banked_cell_is_resumed(self):
        log = self.synth_runlog([{"behaviour": "b1", "spec": "constitution", "model": "sol",
                                  "locator": self.FIRST["constitution"], "rubric": "v3w"}])
        h.RUNLOG = log
        done = h.done_keys("v3w")
        plan, skipped = rr.build_plan(["b1"], ["constitution"], ["sol", "fable"], done, self.FIRST)
        self.assertEqual(skipped, [("b1", "constitution", "sol")])
        self.assertEqual(plan, [("b1", "constitution", "fable")])

    def test_other_rubric_rows_do_not_satisfy_resume(self):
        # the original bug's cousin: v1/v2 rows must never mark a v3w cell done
        log = self.synth_runlog([{"behaviour": "b1", "spec": "constitution", "model": "sol",
                                  "locator": self.FIRST["constitution"], "rubric": "v2"}])
        h.RUNLOG = log
        plan, skipped = rr.build_plan(["b1"], ["constitution"], ["sol"],
                                      h.done_keys("v3w"), self.FIRST)
        self.assertEqual(skipped, [])
        self.assertEqual(len(plan), 1)

    def test_empty_log_plans_full_grid(self):
        h.RUNLOG = Path("/nonexistent/runlog.jsonl")
        plan, skipped = rr.build_plan(["b1", "b2"], ["constitution", "model-spec"],
                                      ["sol", "fable", "kimi"], h.done_keys("v3w"), self.FIRST)
        self.assertEqual(len(plan), 12)
        self.assertEqual(skipped, [])


class TestEstimate(unittest.TestCase):
    """Estimate must be config-derived so it stays meaningful for ANY configured
    model (a hardcoded table crashed on new tags and guessed 10 cents)."""

    MODELS = {"pricey": {"price_per_mtok": [10.0, 50.0], "max_output": 32768},
              "cheap": {"price_per_mtok": [0.1, 0.3], "max_output": 8192}}
    TOK = {"constitution": 45000}
    NP = {"constitution": 374}

    def test_any_configured_model_gets_a_real_estimate(self):
        low, high = rr.estimate([("b", "constitution", "pricey")], self.TOK, self.NP, self.MODELS)
        self.assertAlmostEqual(low, 45000/1e6*10 + 374*rr.OUT_TOKENS_PER_PASSAGE/1e6*50, places=4)
        self.assertAlmostEqual(high, 45000/1e6*10 + 32768/1e6*50, places=4)
        self.assertLess(low, high)

    def test_price_ordering_follows_config(self):
        lo_c, hi_c = rr.estimate([("b", "constitution", "cheap")], self.TOK, self.NP, self.MODELS)
        lo_p, hi_p = rr.estimate([("b", "constitution", "pricey")], self.TOK, self.NP, self.MODELS)
        self.assertLess(hi_c, lo_p)


class TestJudgeKwargs(unittest.TestCase):
    """Guards the hardcoded-65k-cap crash and the provider param quirks."""

    CONFIG = {"models": {
        "kimi": {"max_output": 65536}, "qwen-big": {"max_output": 16384},
        "sol": {}, "fable": {}, "opus": {}, "mystery": {}}}

    def test_cap_comes_from_config(self):
        self.assertEqual(wd.judge_kwargs("kimi", "moonshotai/Kimi-K3", self.CONFIG)["max_tokens"], 65536)
        self.assertEqual(wd.judge_kwargs("qwen-big", "Qwen/Qwen3-235B", self.CONFIG)["max_tokens"], 16384)

    def test_unconfigured_model_gets_sane_default_not_65k(self):
        self.assertEqual(wd.judge_kwargs("mystery", "some/other-model", self.CONFIG)["max_tokens"], 32768)

    def test_anthropic_models_never_send_temperature(self):
        for model in ("claude-fable-5", "claude-opus-4-8", "claude-haiku-4-5-20251001"):
            self.assertNotIn("temperature", wd.judge_kwargs("x", model, {"models": {"x": {}}}))

    def test_gpt5_uses_completion_tokens_and_effort(self):
        k = wd.judge_kwargs("sol", "gpt-5.6-sol", self.CONFIG)
        self.assertIn("max_completion_tokens", k)
        self.assertEqual(k["reasoning_effort"], "low")
        self.assertNotIn("temperature", k)

    def test_gpt5_quirks_survive_openrouter_prefix(self):
        # fallback-routed ids carry a vendor prefix (openai/gpt-5); quirks must still apply
        k = wd.judge_kwargs("sol", "openai/gpt-5.6-sol", self.CONFIG)
        self.assertIn("max_completion_tokens", k)
        self.assertNotIn("temperature", k)


class TestResolve(unittest.TestCase):
    """Guards the OpenRouter fallback (ported from experiment/panel-judges): native
    keys stay preferred, and no key at all must never silently reroute."""

    def fake_env(self, present):
        real = h.env
        h.env = lambda name: "sk-test" if name in present else None
        self.addCleanup(lambda: setattr(h, "env", real))

    def test_native_key_wins_even_with_openrouter_key(self):
        self.fake_env({"TOGETHER_API_KEY", "OPENROUTER_API_KEY"})
        self.assertEqual(h.resolve("kimi"), ("together", "moonshotai/Kimi-K3"))

    def test_missing_native_key_falls_back_to_mirror(self):
        self.fake_env({"OPENROUTER_API_KEY"})
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(h.resolve("kimi"), ("openrouter", "moonshotai/kimi-k3"))

    def test_no_openrouter_key_keeps_native_route(self):
        # client_for() then exits naming the missing native key -- the right error
        self.fake_env(set())
        self.assertEqual(h.resolve("kimi"), ("together", "moonshotai/Kimi-K3"))

    def test_native_openrouter_model_unchanged(self):
        self.fake_env({"OPENROUTER_API_KEY"})
        self.assertEqual(h.resolve("qwen-max"), ("openrouter", "qwen/qwen3.7-max"))


class TestBuilderGuards(unittest.TestCase):
    """Guards the 0-citations bug: the stray-vote guard must scale with panel size."""

    def test_single_judge_panel_keeps_its_votes(self):
        self.assertTrue(bs.keeps_citation(score=2, n_votes=1, panel_size=1))

    def test_lone_stray_vote_in_full_panel_dropped(self):
        self.assertFalse(bs.keeps_citation(score=2, n_votes=1, panel_size=3))

    def test_zero_score_dropped_regardless(self):
        self.assertFalse(bs.keeps_citation(score=0, n_votes=3, panel_size=3))

    def test_two_of_three_votes_kept(self):
        self.assertTrue(bs.keeps_citation(score=1, n_votes=2, panel_size=3))


class TestCleanQuote(unittest.TestCase):
    """Guards the constitution mid-word-bold anchor break (conten**t)."""

    def test_midword_bold_stripped(self):
        self.assertEqual(bs.clean_quote("**Information and educational conten**t: x"),
                         "Information and educational content: x")


class TestCitationQuote(unittest.TestCase):
    """Guards the 20-anchor demo failure: fenced examples render as code the
    matcher cannot see; quote must be the caption line + exampleBlock flag."""

    def test_example_block_quotes_caption_only(self):
        t = "**Example**: shoplifting deterrence tips ~~~xml <user> x </user> ~~~"
        q, ex = bs.citation_quote(t)
        self.assertEqual(q, "Example: shoplifting deterrence tips")
        self.assertTrue(ex)

    def test_fence_leading_passage_falls_back_to_full_text(self):
        q, ex = bs.citation_quote("~~~xml <user> no caption here </user> ~~~")
        self.assertTrue(q)          # never an empty quote (it would anchor wrongly)
        self.assertFalse(ex)

    def test_plain_passage_unchanged(self):
        q, ex = bs.citation_quote("An ordinary paragraph.")
        self.assertEqual(q, "An ordinary paragraph.")
        self.assertFalse(ex)


class ResolveFixture(unittest.TestCase):
    """Shared temp-dir fixture: shipped fallback + two timestamped runs + a manifest."""

    OLD = "behaviours-2026-08-18T10-00-00.json"
    NEW = "behaviours-2026-08-18T12-00-00.json"

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="panel-data-"))
        self.addCleanup(lambda: shutil.rmtree(self.dir, ignore_errors=True))
        self.write("behaviours.json", {"behaviours": []})
        self.write(self.OLD, {"behaviours": ["a"]})
        self.write(self.NEW, {"behaviours": ["a", "b"]})
        self.manifest = {"latest": self.NEW, "runs": [
            {"filename": self.NEW, "timestamp": "2026-08-18T12-00-00"},
            {"filename": self.OLD, "timestamp": "2026-08-18T10-00-00"}]}
        self.write("manifest.json", self.manifest)

    def write(self, name, obj):
        (self.dir / name).write_text(json.dumps(obj))


class TestPR32ReviewFixes(unittest.TestCase):
    """Pins for the PR-level review findings."""

class TestAppJSResolution(unittest.TestCase):
    """site/spec-reader/app.js resolves which publication the reader shows.
    These guard it without a browser: the fall-through drives the REAL app.js
    loadBehaviours in Node against a stubbed loadJSON, and the parity check
    compares the REAL app.js pin validator against the route's own. Both skip
    (not fail) when the `node` binary is absent -- the panel Python suite itself
    has no JS dependency.

    The parity that matters changed with the payload's source. It used to be
    between app.js and build_site_data._payload_name(), because both had to agree
    on which FILENAME was a payload. A payload now comes from a route and a pin
    is a publication id, so the two halves that must agree are the page and the
    route it calls: app.js::payloadName() and app/lib/publications.mjs. A pin the
    page accepts and the route rejects would 404 every time; one the page rejects
    and the route accepts would be unreachable."""

    APP_JS = HERE.parent.parent / "site" / "spec-reader" / "app.js"
    LIB = HERE.parent.parent / "app" / "lib" / "publications.mjs"
    HARNESS = HERE / "test_appjs_fallthrough.js"

    def setUp(self):
        if shutil.which("node") is None:
            self.skipTest("node is not available")

    def test_payload_resolution_in_appjs(self):
        # pin -> current publication, including a dead pin that falls through and
        # a malformed one that never asks; the assertions live in the Node
        # harness so they run standalone too.
        out = subprocess.run(["node", str(self.HARNESS)],
                             capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("app.js payload resolution: PASS", out.stdout)

    def test_the_page_and_the_route_agree_on_what_a_pin_is(self):
        page = self.APP_JS.read_text(encoding="utf-8")
        route = self.LIB.read_text(encoding="utf-8")
        page_re = next(l.split("=", 1)[1].strip().rstrip(";")
                       for l in page.splitlines()
                       if l.startswith("const PUBLICATION_ID"))
        route_re = next(l.split("=", 1)[1].strip().rstrip(";")
                        for l in route.splitlines() if l.startswith("const UUID"))
        self.assertEqual(page_re, route_re,
                         "the page and the route disagree on what a pin is; a pin "
                         "the page accepts and the route rejects 404s every time, "
                         "and one the page rejects is unreachable")

    def test_the_pin_validator_is_doing_something(self):
        pins = ["3114dd65-c6f2-5cb3-bf98-af5b314381c3",
                "3114DD65-C6F2-5CB3-BF98-AF5B314381C3",
                "behaviours-v5-reader", "manifest.json", "../../etc/passwd",
                "3114dd65c6f25cb3bf98af5b314381c3", "", None, 123,
                "3114dd65-c6f2-5cb3-bf98-af5b3143813"]
        expected = [True, True, False, False, False, False, False, False, False, False]
        script = (
            'const fs=require("fs");'
            'const pins=JSON.parse(process.argv[2]);'
            'const page=fs.readFileSync(process.argv[1],"utf8").split("\\n");'
            'const start=page.findIndex(l=>l.startsWith("function payloadName(id)"));'
            'let end=-1;for(let i=start+1;i<page.length;i++){if(page[i].trim()==="}"){end=i;break;}}'
            'const re=page.find(l=>l.startsWith("const PUBLICATION_ID"));'
            'if(start<0||end<0||!re){console.error("payloadName/PUBLICATION_ID not found");process.exit(2);}'
            'eval(re+"\\n"+page.slice(start,end+1).join("\\n"));'
            'console.log(JSON.stringify(pins.map(p=>payloadName(p))));'
        )
        out = subprocess.run(["node", "-e", script, str(self.APP_JS), json.dumps(pins)],
                             capture_output=True, text=True, timeout=60)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(json.loads(out.stdout), expected)


class TestAppJSTiers(unittest.TestCase):
    """The tier-band cuts in app.js (tierBand) pin the display contract the
    decoupling's cheap-run pathway depends on: multi-judge cells keep the
    consensus floor, and a single-judge cell renders the sole judge's verdict
    instead of hiding it under that floor. Skips (not fails) without `node`."""

    HARNESS = HERE / "test_appjs_tiers.js"

    def setUp(self):
        if shutil.which("node") is None:
            self.skipTest("node is not available")

    def test_tier_bands_in_appjs(self):
        out = subprocess.run(["node", str(self.HARNESS)],
                             capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        # Exit status alone cannot tell "every cut holds" from "the harness
        # stopped asserting"; a mutation audit found the latter is a real way
        # for this suite to go quietly green.
        self.assertIn("72 checks, 0 failures", out.stdout, out.stdout)


class TestAppJSQuotes(unittest.TestCase):
    """The quote-anchoring guard in app.js (containsInOrder): a quote that
    normalizes to zero fragments must be treated as unresolved, because an
    in-order scan over an empty fragment list succeeds vacuously against every
    block. This shipped with no coverage once and the inverted line reached
    main, so the harness's own check count is asserted here -- a harness that
    stopped asserting would otherwise still exit 0. Skips without `node`."""

    HARNESS = HERE / "test_appjs_quotes.js"

    def setUp(self):
        if shutil.which("node") is None:
            self.skipTest("node is not available")

    def test_quote_anchoring_in_appjs(self):
        out = subprocess.run(["node", str(self.HARNESS)],
                             capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("17 checks, 0 failures", out.stdout, out.stdout)


class TestAppJSWiring(unittest.TestCase):
    """The panel scoring pipeline in app.js -- applyPanelThreshold and
    initialBands -- end to end: a payload in, bands out. The tiers harness pins
    the pure cut functions; these pin the code that calls them. A mutation audit
    showed the difference matters: collapsing the per-cell scale to the classic
    2, and disconnecting the legacy-threshold fix entirely, both left every
    other harness green. Skips (not fails) without `node`."""

    HARNESS = HERE / "test_appjs_wiring.js"

    def setUp(self):
        if shutil.which("node") is None:
            self.skipTest("node is not available")

    def test_scoring_pipeline_in_appjs(self):
        out = subprocess.run(["node", str(self.HARNESS)],
                             capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("27 checks, 0 failures", out.stdout, out.stdout)


class TestRunlogPathResolution(unittest.TestCase):
    """--runlog= must reach the spawned whole_doc.py cells as an absolute
    path: cells run with cwd=engine/panel, so a caller-relative path would
    resolve there and lose the file even though the parent's resume read (in
    the caller's cwd) found it."""

    def test_absolute_path_passes_through(self):
        self.assertEqual(rr.resolve_runlog("/tmp/some/runlog.jsonl"),
                         Path("/tmp/some/runlog.jsonl"))

    def test_relative_path_anchors_to_caller_cwd(self):
        got = rr.resolve_runlog("my-runlog.jsonl")
        self.assertTrue(got.is_absolute(), got)
        self.assertEqual(got, Path.cwd() / "my-runlog.jsonl")

class TestImportSideEffects(unittest.TestCase):
    """Config must be lazy: importing any panel module in a FRESH interpreter reads
    no PANEL config/data file (guards the monkeypatch-to-inject debt the decoupling
    removed). The probe intercepts builtins.open, io.open, and Path.open. Scope note:
    cite.py (imported by harness) reads specs/user/specs.json at import time WHEN
    that manifest exists; it is absent in the repo's committed state."""

    PROBE = r'''
import builtins, importlib.util, io, json, sys
from pathlib import Path
HERE = Path(sys.argv[1])
opened = []
_real_open = builtins.open
def rec_open(file, *a, **k):
    opened.append(str(file))
    return _real_open(file, *a, **k)
builtins.open = rec_open
io.open = rec_open
_real_path_open = Path.open
def rec_path_open(self, *a, **k):
    opened.append(str(self))
    return _real_path_open(self, *a, **k)
Path.open = rec_path_open
for name in ("harness", "whole_doc", "run_rollout", "build_site_data", "select_strata"):
    sp = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
bad = [p for p in opened if p.endswith((".json", ".jsonl", ".txt", ".env", ".md"))]
print(json.dumps({"bad": bad, "opened": opened}))
'''

    def test_import_reads_no_config_or_data_file(self):
        # Hermetic: hermetic_env() pins SPEC_CITE_USER_SPECS at a path that cannot
        # exist, so a developer who uses the user-spec feature locally still passes
        # the probe (it must see the repo's committed bundled-only state, not their
        # manifest). Keys are scrubbed too, though imports never call providers.
        r = subprocess.run([sys.executable, "-B", "-c", self.PROBE, str(HERE)],
                           capture_output=True, text=True, env=hermetic_env())
        self.assertEqual(r.returncode, 0, r.stderr)
        data = json.loads(r.stdout.strip().splitlines()[-1])
        self.assertEqual(data["bad"], [],
                         f"import-time file reads: {sorted(set(data['bad']))}")

    def test_module_level_load_here_read_nothing(self):
        # The h/rr/wd/bs objects at the top of THIS file were exec'd at test import;
        # none of them should have cached a config (it is resolved at use time now).
        for mod in (h, rr, wd, bs):
            self.assertNotIn("CONFIG", vars(mod),
                             f"{Path(mod.__file__).name} cached CONFIG at import")


class TestPromptIdentity(unittest.TestCase):
    """The explicit render_system_v3 composition must be BYTE-IDENTICAL to the old
    str.replace+assert outputs. Expected strings were captured from pre-refactor
    behaviour into test_frozen_prompts.json before the refactor landed."""

    @classmethod
    def setUpClass(cls):
        cls.fx = json.loads((HERE / "test_frozen_prompts.json").read_text())

    def test_frozen_rubrics_unchanged(self):
        self.assertEqual(h.SYSTEM_V1, self.fx["v1_raw"])
        self.assertEqual(h.SYSTEM, self.fx["v2_raw"])
        self.assertEqual(h.SYSTEM_V3, self.fx["v3_raw"])

    def test_whole_doc_prompts_byte_identical(self):
        # old code sent SYSTEM_W.format(reason="") / SYSTEM_S.format(reason="");
        # the new constants are already rendered, so they must equal those strings
        self.assertEqual(wd.SYSTEM_W, self.fx["w_sent"])
        self.assertEqual(wd.SYSTEM_S, self.fx["s_sent"])

    def test_render_reproduces_frozen_v3_from_slots(self):
        rebuilt = h.render_system_v3(h.INDEPENDENCE_PASSAGE, h.OUTPUT_FORMAT_FULL,
                                     reason="{reason}")
        self.assertEqual(rebuilt, self.fx["v3_raw"])

    def test_systems_table_and_behaviour_template(self):
        self.assertEqual(sorted(h.SYSTEMS), self.fx["systems_keys"])
        self.assertEqual(h.BEHAVIOUR_TEMPLATE_V3, self.fx["behaviour_template_v3"])


class TestLazyConfig(unittest.TestCase):
    """load_config is the single injection point; default path resolves relative to
    the module and an override path / parsed dict is honored without monkeypatching."""

    def test_default_loads_shipped_config(self):
        cfg = h.load_config()
        self.assertIn("models", cfg)
        self.assertIn("frontier_primary", cfg["panels"])

    def test_override_path_is_honored(self):
        custom = {"providers": {}, "models": {}, "panels": {"p": ["m"]}}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(custom, f)
        self.addCleanup(lambda: Path(f.name).unlink(missing_ok=True))
        self.assertEqual(h.load_config(f.name)["panels"], {"p": ["m"]})

    def test_resolve_uses_injected_config_not_default(self):
        injected = {"providers": {"acme": {"base_url": None, "key_env": "ACME_KEY"}},
                    "models": {"solo": {"provider": "acme", "id": "acme/solo-v9"}}}
        real_env = h.env
        h.env = lambda name: None          # no keys anywhere -> native route, no fallback
        self.addCleanup(lambda: setattr(h, "env", real_env))
        self.assertEqual(h.resolve("solo", injected), ("acme", "acme/solo-v9"))


class TestLazyConfigShim(unittest.TestCase):
    """PEP 562 compatibility, probed in a FRESH interpreter: pre-refactor callers (see
    experiments/panel-calibration/run_variant.py) read harness.CONFIG / harness.PANELS /
    harness.PROVIDERS as module attributes. The lazy-config refactor must keep those
    resolving through the module __getattr__ shim and stay consistent with load_config().
    Run in a subprocess so the cached attributes never pollute the in-process module
    (TestImportSideEffects asserts nothing is cached at import here)."""

    PROBE = r'''
import importlib.util, json, sys
from pathlib import Path
HERE = Path(sys.argv[1])
sp = importlib.util.spec_from_file_location("harness", HERE / "harness.py")
h = importlib.util.module_from_spec(sp)
sp.loader.exec_module(h)
cfg = h.load_config()
out = {
    "config_cached": h.CONFIG is h.CONFIG,
    "config_equals_load_config": h.CONFIG == cfg,
    "panels_equal": h.PANELS == cfg.get("panels", {}),
    "providers_equal": h.PROVIDERS == h.providers(cfg),
    "cached_in_module_dict": all(k in vars(h) for k in ("CONFIG", "PANELS", "PROVIDERS")),
}
try:
    h.NO_SUCH_ATTRIBUTE
    out["unknown_raises_attributeerror"] = False
except AttributeError:
    out["unknown_raises_attributeerror"] = True
print(json.dumps(out))
'''

    def test_config_panels_providers_resolve_through_shim(self):
        # hermetic_env() pins SPEC_CITE_USER_SPECS (and scrubs keys) exactly as the
        # import probe does, so the shim is exercised in the same hermetic state.
        r = subprocess.run([sys.executable, "-B", "-c", self.PROBE, str(HERE)],
                           capture_output=True, text=True, env=hermetic_env())
        self.assertEqual(r.returncode, 0, r.stderr)
        d = json.loads(r.stdout.strip().splitlines()[-1])
        for key in ("config_cached", "config_equals_load_config", "panels_equal",
                    "providers_equal", "cached_in_module_dict",
                    "unknown_raises_attributeerror"):
            self.assertTrue(d[key], f"shim probe failed on {key}: {d}")


class TestSubstitutionNote(unittest.TestCase):
    """provenance.substitution is a curated fact about one panel, not a constant.

    It records WHY a provider failed on a cell -- no runlog carries that -- so it
    cannot be derived. It used to be a string literal, which stamped the shipped
    frontier run's opus/kimi-k2 substitutions onto every payload the builder emitted,
    including runs those judges never touched."""

    def _notes(self):
        src = (HERE / "build_site_data.py").read_text()
        ns = {}
        start = src.index("SUBSTITUTION_NOTES = {")
        end = src.index("}", start) + 1
        exec(src[start:end], ns)
        return ns["SUBSTITUTION_NOTES"]

    def test_only_the_panel_it_describes_carries_a_note(self):
        notes = self._notes()
        self.assertIn("frontier", notes)
        self.assertIn("opus", notes["frontier"])
        for panel in ("frontier_primary", "frontier_fast", "itest", "cheap"):
            self.assertIsNone(notes.get(panel),
                              f"{panel} must not inherit another panel's substitution note")

    def test_committed_payloads_claim_no_substitution_they_did_not_have(self):
        """A payload may only carry the note when its panel is the one it describes."""
        notes = self._notes()
        data = HERE.parent.parent / "site" / "spec-reader" / "data"
        for path in sorted(data.glob("behaviours*.json")):
            payload = json.loads(path.read_text())
            prov = payload.get("provenance") or {}
            if "substitution" not in prov:
                continue
            panel = prov.get("panel_config")
            self.assertEqual(prov["substitution"], notes.get(panel),
                             f"{path.name} carries a substitution note for panel {panel!r}")
            seen = set(prov.get("judges_seen_in_data") or [])
            named = {tag for tag in ("opus", "kimi-k2") if tag in prov["substitution"]}
            self.assertTrue(named <= seen or not named,
                            f"{path.name} names substitutes {sorted(named - seen)} "
                            f"that never judged it")


class TestMainSmoke(unittest.TestCase):
    """CLI entry-point arg handling, run as real subprocesses. No network, and no
    way to spend money even on a developer machine with live keys: every
    subprocess runs under hermetic_env() (credential env vars scrubbed, the
    harness's .env fallback pinned at a nonexistent path, user-spec manifest
    pinned absent), the rollout driver is dry-run by default and gets a runlog
    path that cannot exist (so it can never resume against a developer's real
    runlog-v3.jsonl), and the builder is pointed at a runlog that cannot exist."""

    def missing_runlog(self):
        """A runlog path in a fresh empty tempdir: cannot exist, so the subprocess
        can never read (or resume from) a developer's real runlog-v3.jsonl."""
        d = tempfile.mkdtemp(prefix="panel-smoke-")
        self.addCleanup(shutil.rmtree, d, ignore_errors=True)
        return str(Path(d) / "runlog.jsonl")

    def test_run_rollout_unknown_panel_override_rejected(self):
        r = subprocess.run([sys.executable, str(HERE / "run_rollout.py"),
                            "--behaviours=helpfulness", "--panel=no-such-panel",
                            f"--runlog={self.missing_runlog()}"],
                           capture_output=True, text=True, env=hermetic_env())
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("unknown panel", r.stderr + r.stdout)

    def test_threshold_flags_parse_loud(self):
        # --threshold= / --solid-threshold= must reject bad values with a named
        # message, like every other builder error path.
        for bad in ("--threshold=abc", "--threshold=-1", "--solid-threshold=x"):
            r = subprocess.run([sys.executable, str(HERE / "build_site_data.py"), bad],
                               capture_output=True, text=True, cwd=str(HERE.parents[1]))
            self.assertNotEqual(r.returncode, 0, bad)
            self.assertIn("must be a non-negative integer", r.stdout + r.stderr)

    def test_keeps_citation_honours_threshold(self):
        # The behaviour change: the score cut honours the threshold argument
        # (the committed config's stale 3 drops a single-judge core citation
        # that the historical effective cut 1 kept).
        self.assertTrue(bs.keeps_citation(2, 1, 1, threshold=1))
        self.assertFalse(bs.keeps_citation(2, 1, 1, threshold=3))
        self.assertTrue(bs.keeps_citation(3, 1, 1, threshold=3))
        # the stray-vote guard still applies on top
        self.assertFalse(bs.keeps_citation(3, 1, 3, threshold=1))

    def test_unknown_panel_name_exits_instead_of_building_empty(self):
        # B1: `.get(name) or [name]` turned a typo'd panel into a one-seat panel
        # named after the typo -- exit 0, empty payload, promoted to manifest latest.
        # Same class of bad input as an unknown flag, which this file already rejects.
        cfg = {"panels": {"cheap": ["gpt-mini"], "_note": "prose", "empty": []},
               "models": {"gpt-mini": {}, "haiku": {}}}
        self.assertEqual(bs.resolve_panel(cfg, "cheap"), {"gpt-mini"})
        self.assertEqual(bs.resolve_panel(cfg, "haiku"), {"haiku"})   # bare tag still works
        for bad in ("frontierr", "_note", "empty"):
            with self.subTest(bad=bad), self.assertRaises(SystemExit) as cm:
                bs.resolve_panel(cfg, bad)
            self.assertIn(bad, str(cm.exception))

    def test_zero_citations_names_a_rubric_mismatch_as_such(self):
        # N2: runlog_models is collected before the rubric filter, so a v5 runlog
        # built with --rubric=v3w reported perfectly overlapping judges and advised
        # changing --panel, the one thing that was already right.
        msg = bs.zero_citation_reason(rubric="v3w", runlog_rubrics={"v5"},
                                      runlog_models={"sol"}, panel={"sol"})
        self.assertIn("rubric", msg)
        self.assertIn("v5", msg)
        self.assertNotIn("--panel=", msg)
        msg2 = bs.zero_citation_reason(rubric="v3w", runlog_rubrics={"v3w"},
                                       runlog_models={"haiku"}, panel={"gpt-mini"})
        self.assertIn("--panel=", msg2)

    def test_bare_tag_is_accepted_as_a_one_seat_panel(self):
        # Step 5 of the fork pathway needed a single-judge panel, and --panel=haiku
        # was a KeyError -- so the docs told users to add "solo": ["haiku"] to
        # engine/panel/panel-config.json, a TRACKED file. whole_doc.py already
        # accepts a bare tag (panels.get(t) or [t]); the builder now matches, which
        # removes the last tracked-file edit from the fork path.
        cfg = {"panels": {"cheap": ["gpt-mini", "haiku"]},
               "models": {"gpt-mini": {}, "haiku": {}}}
        self.assertEqual(bs.resolve_panel(cfg, "cheap"), {"gpt-mini", "haiku"})
        self.assertEqual(bs.resolve_panel(cfg, "haiku"), {"haiku"})

    def test_unknown_runlog_slug_names_the_registry_you_passed(self):
        # The error said "data/behaviours.json" even when --registry= pointed
        # elsewhere, sending the reader to a file they never used.
        self.assertIn("my-registry.json",
                      bs.unknown_slug_message(["ghost"], "local/my-registry.json"))

    def test_missing_registry_file_exits_cleanly(self):
        # A typo'd --registry= on the money step must not be a raw traceback.
        with self.assertRaises(SystemExit) as cm:
            h.load_registry(str(Path(tempfile.mkdtemp()) / "does-not-exist.json"))
        self.assertIn("does-not-exist.json", str(cm.exception))

    def test_whitespace_only_definition_is_rejected(self):
        reg = Path(tempfile.mkdtemp()) / "ws.json"
        reg.write_text(json.dumps({"ws": {"name": "WS", "set": "user", "numeric_id": 1,
                                          "group": None, "definition": "   ",
                                          "facets": []}}), encoding="utf-8")
        self.addCleanup(lambda: shutil.rmtree(reg.parent, ignore_errors=True))
        with self.assertRaises(SystemExit) as cm:
            h.compose_query("ws", "v3", h.load_registry(str(reg)))
        self.assertIn("ws", str(cm.exception))

class V5PromptPortDefaults(unittest.TestCase):
    """The v5 flip (2026-08-24): a fresh whole_doc.py run must match the shipped
    bench -- v5 prompt, v5 rubric stamps -- and must default to a gitignored
    runlog, so a plain run can neither mix rubrics with the v3 era nor append to
    a committed canonical log."""

    def test_engine_prompt_is_the_calibration_prompt_byte_for_byte(self):
        # The canonical runlog-v5.jsonl was produced with the calibration-loop
        # prompt; the ported copy must never drift from that source.
        engine = (HERE / "prompts" / "v5.txt").read_bytes()
        source = (HERE.parent.parent / "experiments" / "panel-calibration"
                  / "prompts" / "v5.txt").read_bytes()
        self.assertEqual(engine, source)
        self.assertEqual(wd.system_v5(), engine.decode())

    def test_default_rubric_is_v5_and_legacy_flags_still_resolve(self):
        self.assertEqual(wd.pick_rubric([]), "v5")
        self.assertEqual(wd.pick_rubric(["--rubric=v3w"]), "v3w")
        self.assertEqual(wd.pick_rubric(["--sparse"]), "v3s")
        self.assertEqual(wd.pick_rubric(["--rubric=v3s", "--sparse"]), "v3s")
        with self.assertRaises(SystemExit):
            wd.pick_rubric(["--rubric=v5", "--sparse"])   # contradiction, not a guess
        with self.assertRaises(SystemExit):
            wd.pick_rubric(["--rubric=v4a"])              # calibration variants are not shipped

    def test_default_runlog_is_gitignored_not_a_committed_log(self):
        self.assertEqual(wd.RUNLOG.name, "runlog-user.jsonl")
        ignored = subprocess.run(["git", "check-ignore", str(wd.RUNLOG)],
                                 capture_output=True, cwd=HERE)
        self.assertEqual(ignored.returncode, 0, "runlog-user.jsonl must be gitignored")

    def test_config_rubric_matches_the_display_rubric(self):
        # run_rollout resumes with config["rubric"]; the builder prefers
        # display.rubric. The two diverging is exactly the pre-port bug.
        cfg = h.load_config()
        self.assertEqual(cfg["rubric"], "v5")
        self.assertEqual(cfg["display"]["rubric"], "v5")

    def test_parse_verdicts4_reads_the_v5_scale(self):
        txt = "1: 3\n2: 0\n[3] - 2\n4. 1\n"
        self.assertEqual(wd.parse_verdicts4(txt, 4), {1: 3, 2: 0, 3: 2, 4: 1})

    def test_parse_verdicts4_tail_sequence_fallback(self):
        txt = "reasoning first\n3\n0\n2\n1\n"
        self.assertEqual(wd.parse_verdicts4(txt, 4), {1: 3, 2: 0, 3: 2, 4: 1})

    def test_parse_verdicts4_drops_out_of_range_passages(self):
        self.assertEqual(wd.parse_verdicts4("1: 3\n99: 2\n", 2), {1: 3})


if __name__ == "__main__":
    unittest.main(verbosity=2)
