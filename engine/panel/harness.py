#!/usr/bin/env python3
"""Shared library for the panel pipeline: config, prompt builders, verdict parsing,
and the append-only/resumable run-log conventions.

Not a CLI. The executors are whole_doc.py (production, whole-document mode) and
run_rollout.py (the driver). Frozen rubric texts (v1 binary, v2 ternary+scope) are
kept verbatim because run-log rows and data provenance hashes key on them; v3 is
current (see compose_query; the v3 variants compose through render_system_v3).

Config is LAZY: nothing here reads panel-config.json (or any file) at import time.
load_config() parses it at use time, and the functions that need config accept an
already-parsed dict so callers/tests can inject one without monkeypatching.

Design rules every executor honors:
  * ONE uniform prompt per rubric for EVERY judge, reached through each provider
    OpenAI-compatible endpoint (openai SDK, swap base_url + key).
  * DURABLE: verdicts append to the run log the moment they arrive.
  * RESUMABLE: done_keys() lets a rerun skip any (behaviour, spec, model, locator)
    already recorded under the same rubric.
"""
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "spec-cite"))   # engine/panel -> engine/spec-cite
import cite  # noqa: E402

RUNLOG = HERE / "runlog-user.jsonl"   # gitignored; the executors share this default
METRICS = HERE / "metrics.jsonl"   # per-call latency + token usage (for cost/time reporting)

# Providers/models/panels come from panel-config.json (credentials are env-var NAMES there,
# never values). The old hardcoded tables are gone; edit the config, not this file.
# Loaded lazily at USE time -- importing this module reads no PANEL config so it
# can be injected (pass a parsed dict, or load_config() an alternate path).
# Note: this module imports cite.py, which registers nothing at import time. A
# caller that resolves a locator must install a registry first; see
# engine/index_store.py::install_registry.
DEFAULT_CONFIG_PATH = HERE / "panel-config.json"


def load_config(path=None):
    """Parse panel-config.json (or an explicit override `path`) and return the dict."""
    return json.loads(Path(path or DEFAULT_CONFIG_PATH).read_text())


def providers(config):
    """{name: (base_url, key_env)} from a loaded config."""
    return {name: (p["base_url"], p["key_env"]) for name, p in config["providers"].items()}


def __getattr__(name):
    """PEP 562 lazy module globals. Pre-refactor callers (see
    experiments/panel-calibration/run_variant.py) read harness.CONFIG /
    harness.PROVIDERS / harness.PANELS as module attributes; resolve them on first
    access so the import itself touches no files. New code should call load_config()
    and pass the dict explicitly instead."""
    if name in ("CONFIG", "PROVIDERS", "PANELS"):
        config = load_config()
        value = {"CONFIG": config,
                 "PROVIDERS": providers(config),
                 "PANELS": config.get("panels", {})}[name]
        globals()[name] = value
        return value
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

# v1: binary rubric (frozen -- the calibrated baseline; do not edit)
SYSTEM_V1 = ("You decide whether each spec passage is RELEVANT to a target behaviour. "
             "Mark 1 ONLY if the passage directly governs the SPECIFIC behaviour described -- it "
             "states, requires, or constrains that exact behaviour, such that you would cite this "
             "passage when assembling the spec's coverage of it. Being in the same topic area is "
             "NOT enough. Mark 0 for everything else, including passages that merely share "
             "vocabulary, sit near the topic, or describe the model's general goals, values, "
             "mission, helpfulness, trustworthiness, or good judgment without addressing THIS "
             "specific behaviour. The test: could a reader point to this passage as a rule the "
             "behaviour must follow? If not, mark 0. When in doubt, mark 0. "
             "Example -- behaviour 'do not endorse false claims': a passage requiring the model to "
             "correct a user's factual mistake = 1; a passage about being generally helpful or "
             "building user trust = 0, even though it is nearby in the document. "
             "For each passage, output one line: the passage number, a colon, then 1 (relevant) or "
             "0 (not). One line per passage, in order.{reason}")

# v2: ternary rubric (core / adjacent / neither) + per-behaviour Scope clause
# (frozen -- runlog v2 rows and export_coverage prompt hashes key on this exact text)
SYSTEM = ("You grade how each spec passage relates to a target behaviour, on a 3-point scale. "
          "2 = CORE: the passage directly governs the SPECIFIC behaviour described -- it "
          "states, requires, or constrains that exact behaviour, such that you would cite it "
          "when assembling the spec's coverage of the behaviour. "
          "1 = ADJACENT: the passage does not directly govern the behaviour, but materially "
          "bears on it -- it carries machinery the behaviour depends on, sets a boundary of "
          "it, or is a cross-reference a careful reader of this behaviour should see. "
          "0 = NEITHER: everything else, including passages that merely share vocabulary, sit "
          "near the topic, or describe the model's general goals, values, mission, or virtues "
          "without bearing on THIS specific behaviour -- UNLESS the target behaviour is itself "
          "about one of those general values, in which case passages that state, define, or "
          "give force to that value are CORE. "
          "Being in the same topic area alone is NOT enough for 1. When in doubt between 2 and "
          "1, mark 1; when in doubt between 1 and 0, mark 0. "
          "Example -- behaviour 'do not endorse false claims': a passage requiring the model "
          "to correct a user's factual mistake = 2; a passage on how confident assessments "
          "should be phrased = 1; a passage about being generally trustworthy = 0. "
          "For each passage, output one line: the passage number, a colon, then 2, 1, or 0. "
          "One line per passage, in order.{reason}")
# v3: coverage-report framing + labelled behaviour fields (current).
# Changes over v2: states WHY (the verdicts become a coverage report, so absence of
# findings is a valid result), names the input fields and how to use each, adds the
# partial-governance and Scope-exclusion rules, and demands independent per-passage grading.
#
# COMPOSITION CONTRACT (the one place these slots are documented). The v3 rubric is
# a template with three named placeholders; render_system_v3() fills them:
#
#   {independence}  -- how the judge treats passage context. Passage-level judging
#                      uses INDEPENDENCE_PASSAGE; whole-document judging (whole_doc.py,
#                      rubric tags v3w/v3s) uses INDEPENDENCE_WHOLE_DOC instead.
#   {output_format} -- the verdict-list shape: OUTPUT_FORMAT_FULL (one line per
#                      passage) or OUTPUT_FORMAT_SPARSE (positives only; every
#                      omitted passage is recorded as 0).
#   {reason}        -- an optional trailing reasoning instruction. Every shipped
#                      caller renders with reason="" (empty), so whole_doc.py's
#                      SYSTEM_W/SYSTEM_S are FULLY RENDERED: no {reason} placeholder
#                      remains, and a later .format(reason=...) on them silently does
#                      nothing (no injection happens).
#
# The slot values below are the exact sentences the pre-refactor whole_doc.py
# substituted via str.replace; test_frozen_prompts.json pins the composed results
# byte-for-byte against that prior behaviour.
INDEPENDENCE_PASSAGE = ("Grade every passage independently, on its own text (the § section path is "
                        "context only), on a 3-point scale. ")
INDEPENDENCE_WHOLE_DOC = ("You are given the ENTIRE document, split into numbered passages in reading order; "
                          "use the full document and its structure as context when grading each passage, on a "
                          "3-point scale. ")
OUTPUT_FORMAT_FULL = ("For each passage, output one line: the passage number, a colon, then 2, 1, or 0. "
                      "One line per passage, in order.")
OUTPUT_FORMAT_SPARSE = ("Output ONLY the passages that score 2 or 1, one line each: the passage number, a "
                        "colon, then the score, in document order. Do NOT list passages that score 0 -- "
                        "every passage you omit is recorded as 0. Output no other text.")

SYSTEM_V3_TEMPLATE = (
    "You are auditing how thoroughly an AI alignment document -- a model constitution or a "
    "model spec -- covers one target behaviour. These documents are long and address a "
    "behaviour in scattered places, so it is hard to tell whether the behaviour is "
    "comprehensively governed. The set of passages you mark becomes the document's coverage "
    "report for this behaviour: it is what lets a reader judge whether coverage is thorough, "
    "thin, or absent. "
    "The behaviour is described by four fields. Behaviour: its title. Definition: the "
    "construct itself -- what the behaviour requires; judge against this, not against the "
    "title's vocabulary. Clarifications (optional): notes resolving ambiguities. Scope "
    "(optional): the construct's edges, usually naming neighbouring behaviours that are "
    "NOT this one. An optional field reading 'none provided' only means the user left it "
    "blank -- infer nothing from that; when Scope is not provided, judge against the "
    "Definition alone. "
    "{independence}"
    "2 = CORE: the passage directly governs the SPECIFIC behaviour described -- it states, "
    "requires, or constrains that exact behaviour, such that you would cite it when "
    "assembling the document's coverage of the behaviour. A passage that does so in only "
    "one clause or list item still counts for what it says about THIS behaviour. "
    "1 = ADJACENT: the passage does not directly govern the behaviour, but materially "
    "bears on it -- it carries machinery the behaviour depends on, sets a boundary of it, "
    "or is a cross-reference a careful reader of this behaviour should see. "
    "0 = NEITHER: everything else, including passages that merely share vocabulary, sit "
    "near the topic, or describe the model's general goals, values, mission, or virtues "
    "without bearing on THIS specific behaviour -- UNLESS the target behaviour is itself "
    "about one of those general values, in which case passages that state, define, or give "
    "force to that value are CORE. A passage that governs only a behaviour the Scope "
    "excludes is 0 -- at most 1 if it also sets a boundary the target behaviour must "
    "respect. "
    "Calibration: the document may cover the behaviour thoroughly, thinly, or not at all. "
    "Finding few or no relevant passages is a correct and informative result -- never "
    "stretch a grade so that coverage appears. The opposite error is just as costly: a "
    "passage that genuinely governs the behaviour must be marked wherever in the document "
    "it sits. Being in the same topic area alone is NOT enough for 1. When in doubt "
    "between 2 and 1, mark 1; when in doubt between 1 and 0, mark 0. "
    "Example -- behaviour 'do not endorse false claims': a passage requiring the model "
    "to correct a user's factual mistake = 2; a passage on how confident assessments "
    "should be phrased = 1; a passage about being generally trustworthy = 0. "
    "{output_format}{reason}")


def render_system_v3(independence, output_format, reason=""):
    """Compose a v3-family system prompt by filling the template's three documented
    slots (contract in the comment above SYSTEM_V3_TEMPLATE). Returns the final
    message text."""
    return SYSTEM_V3_TEMPLATE.format(
        independence=independence, output_format=output_format, reason=reason)


# The passage-level v3 rubric, kept with its trailing {reason} slot literal for the
# legacy .format(reason=...) callers; frozen for provenance (see the module docstring).
SYSTEM_V3 = render_system_v3(INDEPENDENCE_PASSAGE, OUTPUT_FORMAT_FULL, reason="{reason}")

SYSTEMS = {"v1": SYSTEM_V1, "v2": SYSTEM, "v3": SYSTEM_V3}

# v3 behaviour block -- ONE variable per user-form field, fixed shape (no conditional
# lines): a form populates these four slots later. clarifications and scope are
# OPTIONAL -- an empty form field renders as FIELD_NONE, never an omitted line.
FIELD_NONE = "none provided"
BEHAVIOUR_TEMPLATE_V3 = ("Behaviour: {title}\n"
                         "Definition: {definition}\n"
                         "Clarifications (optional): {clarifications}\n"
                         "Scope (optional): {scope}")


def env(name):
    """Credential lookup: the process environment first, then a gitignored .env next
    to the harness. PANEL_DOTENV overrides that .env path -- test_panel.py pins it at
    a nonexistent file so its smoke subprocesses stay hermetic (never read a
    developer's real keys) even on a machine that uses the pipeline."""
    v = os.environ.get(name)
    dotenv = Path(os.environ.get("PANEL_DOTENV", str(HERE / ".env")))
    if not v and dotenv.exists():
        for line in dotenv.read_text().splitlines():
            if line.strip().startswith(name + "="):
                v = line.split("=", 1)[1].strip().strip("\"'")
    return v


def resolve(tag, config=None):
    """(provider, model_id): the native route from panel-config, falling back to that model's
    `openrouter` mirror when its own key is missing and we hold an OpenRouter one.
    `config` injects a parsed config dict; the default loads panel-config.json."""
    if config is None:
        config = load_config()
    provs = providers(config)
    m = config["models"][tag]
    keyname, mirror = provs[m["provider"]][1], m.get("openrouter")
    if not env(keyname) and mirror and env(provs["openrouter"][1]):
        print(f"note: no {keyname} -- routing {tag} via openrouter", file=sys.stderr)
        return "openrouter", mirror["id"]
    return m["provider"], m["id"]


def client_for(provider, config=None):
    if config is None:
        config = load_config()
    base, keyname = providers(config)[provider]
    key = env(keyname)
    if not key:
        sys.exit(f"no {keyname} in env/.env for provider {provider}")
    from openai import OpenAI
    return OpenAI(api_key=key, base_url=base) if base else OpenAI(api_key=key)


def passages(spec):
    """(locator, section, text) for every content paragraph, TOC-filtered -- reuses cite.py."""
    out = []
    version, sections, lines = cite.load_spec(spec, None)
    titles = {cite.normalize(s.path_str.split(" > ")[-1]) for s in sections}
    for sec in sections:
        ref = f"#{sec.anchor}" if (spec == "model-spec" and sec.anchor) else sec.path_str
        for i, raw in enumerate(cite.segment_blocks(lines, sec.start, sec.end), 1):
            t = cite.normalize(raw)
            if t.strip() and t not in titles:
                out.append((f"{spec}@{version} > {ref} > ¶{i}", sec.path_str, t))
    return out


REGISTRY_SOURCE = {}   # id(parsed dict) -> path it came from, for error messages


def _panel_shape(slug, entry):
    """One registry entry in PANEL shape (label/title/query/boundary/...).

    Judging-shape entries pass through untouched. DISPLAY-shape entries
    (data/behaviours.json: name/set/numeric_id/group/definition/facets) are
    adapted -- name->title, definition->query, facets->clarifications, and no
    boundary, which renders as FIELD_NONE, the value the v3 rubric documents as
    "the user left it blank". That lets a fork register a behaviour ONCE, in the
    schema'd display shape, and hand the same file to whole_doc.py and
    build_site_data.py. Adaptation is per-entry, so a hybrid file works too."""
    if "query" in entry:
        return entry
    if not (entry.get("definition") or "").strip():
        sys.exit(f"behaviour {slug!r} carries no 'query' and no non-empty "
                 "'definition' -- a judge prompt needs the behaviour's definition text")
    return {"label": entry.get("name", slug),
            "title": entry.get("name", slug),
            "query": entry["definition"],
            "clarifications": " ".join(entry.get("facets") or []) or None}


def load_registry(path=None):
    """{slug: raw entry} from a behaviour registry, EITHER shape. Default: the
    database, which is the only place the index lives. A path is still accepted,
    for fixtures and for a fork judging a registry of its own. Non-dict values (file-level notes) are dropped,
    matching run_rollout.py's filter.

    Entries are NOT adapted here -- load_entry adapts the one you ask for. That
    is deliberate: a fork is told to copy data/behaviours.json and add a row, and
    ten of the shipped rows are unpublished index behaviours with an empty
    definition. Adapting eagerly made the documented instruction produce a
    registry that always failed, naming a slug the user never mentioned."""
    if path is None:
        sys.path.insert(0, str(HERE.parent))
        import index_store            # noqa: E402
        from store import Store       # noqa: E402
        kept = index_store.judging_registry(Store.from_env())
        REGISTRY_SOURCE[id(kept)] = "supabase aci_behaviours"
        return kept
    src = Path(path)
    try:
        raw = json.loads(src.read_text())
    except FileNotFoundError:
        sys.exit(f"behaviour registry not found: {src}")
    except json.JSONDecodeError as e:
        sys.exit(f"behaviour registry {src} is not valid JSON: {e}")
    kept = {slug: e for slug, e in raw.items() if isinstance(e, dict)}
    REGISTRY_SOURCE[id(kept)] = str(src)
    return kept


def load_entry(behaviour, registry=None):
    """The requested registry entry, in panel shape. `registry` injects an
    already-parsed dict (load_registry) so a caller resolves the file ONCE."""
    b = load_registry() if registry is None else registry
    if behaviour not in b:
        src = REGISTRY_SOURCE.get(id(b), str(DEFAULT_REGISTRY_PATH))
        sys.exit(f"unknown behaviour {behaviour!r} -- not in {src}")
    return _panel_shape(behaviour, b[behaviour])


def load_query(behaviour, registry=None):
    return load_entry(behaviour, registry)["query"]


def compose_query(behaviour, rubric, registry=None):
    """The behaviour block of the user message -- the variable slot the tool user fills.

    v3 contract (what we ask the user for, via a form): title and definition required,
    clarifications and scope optional (blank -> FIELD_NONE). One variable per field,
    substituted into BEHAVIOUR_TEMPLATE_V3. behaviours.json fields: title (falls back
    to label) / query (query_v2 override) / clarifications / boundary.
    v1 and v2 render byte-identically to the pre-refactor paths (frozen).
    """
    beh = load_entry(behaviour, registry)   # also validates the behaviour key
    query = beh["query"]
    if rubric == "v1":
        return f"Behaviour:\n{query}"
    if rubric == "v2":
        if not beh.get("boundary"):
            sys.exit(f"--v2: no boundary clause for {behaviour}")
        return f"Behaviour:\n{beh.get('query_v2', query)}\n\nScope: {beh['boundary']}"
    return BEHAVIOUR_TEMPLATE_V3.format(
        # Not beh.get("title", beh["label"]): a dict's default is evaluated
        # whether or not it is needed, so an entry carrying a title and no label
        # raised KeyError on the label it never needed. Every entry the index
        # carries has both, which is why it took a hand-written one to find.
        title=beh.get("title") or beh.get("label") or behaviour,
        definition=beh.get("query_v2", query),
        clarifications=beh.get("clarifications") or FIELD_NONE,
        scope=beh.get("boundary") or FIELD_NONE)


def done_keys(rubric):
    """Resume keys include the rubric version -- a v2 rerun must not be satisfied by v1 rows."""
    if not RUNLOG.exists():
        return set()
    return {(d["behaviour"], d["spec"], d["model"], d["locator"])
            for d in (json.loads(l) for l in RUNLOG.read_text().splitlines() if l.strip())
            if d.get("rubric", "v1") == rubric}


def parse_verdicts(txt, n):
    """{index(1-based): 0/1/2}. First try 'N: V' lines; fall back to positional verdicts."""
    keyed = {}
    for line in txt.splitlines():
        m = re.match(r'\s*\[?(\d+)\]?\s*[:.\)\-]\s*([012])\b', line)
        if m:
            keyed[int(m.group(1))] = int(m.group(2))
    keyed = {k: v for k, v in keyed.items() if 1 <= k <= n}   # drop out-of-range indices
    if len(keyed) >= n * 0.9:
        return keyed
    # Positional fallback: verdicts live at the END of the output (reasoning may precede and
    # contain digits). Take the last n bare 0/1/2 tokens; if there aren't exactly enough clean
    # ones in the tail, refuse to guess -- unparsed items stay unparsed rather than misaligned.
    tail = txt.splitlines()[-(n + 5):]
    seq = re.findall(r'(?<![.\d\[])([012])(?![.\d\]])', "\n".join(tail))
    if len(seq) == n:
        return {i + 1: int(v) for i, v in enumerate(seq)}
    return keyed
