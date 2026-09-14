#!/usr/bin/env python3
"""Build the reader's behaviour payload from the panel's verdicts.

    python3 build_site_data.py --out=PATH [--rubric=v5] [--panel=frontier_fast]
    python3 build_site_data.py --out=PATH --cells=PATH     # for a selection

Reads the judgements of the publication the reader currently serves, or -- with
--cells -- of the selection a publication is about to carry. A publication holds
its payloads as columns and is insert-only, so they are built before the row.

Implements the MVP display rules from panel-config.json `display`:
  - only the listed behaviours appear in the sidebar;
  - each passage gets score = sum of each panel model's verdict
    (defining=3, core=2, related=1, unrelated=0);
  - a passage is emitted as a citation when score >= display.threshold AND it
    carries at least min(2, panel-size) votes (keeps_citation drops a lone
    stray vote on a multi-judge panel); the page re-filters at render time
    via tier bands. The cut honours display.threshold (the committed config
    carries 1 = keep everything scored, which matches every shipped payload,
    so a defaults build reproduces them); --threshold= overrides it for
    derived payloads (e.g. a pre-filtered reader shape cut at the panel's
    band boundary);
  - the citation `adjacent` flag is score < display.solid_threshold
    (--solid-threshold= overrides it for derived payloads);
  - the citation `role` (shown when the reader clicks "?") lists each model's decision.

Behaviour identity -- name, definition, group -- comes from aci_behaviours, the
only registry there is. Every behaviour a publication selects is shown, whatever
its set; no human verdict is read. A passage is filed under the document its
locator names: the head of a locator, `<spec id>@<version>`, is the document's
id. Each cell carries the depth its run's judges gave it.

--out is required and is where the payload goes. There is no timestamped file and
no manifest: a local build was how a run got pinned by ?data=, and a publication
is what pins one now.
  --registry=PATH      read the behaviour registry from PATH (default data/behaviours.json)
  --run-date=YYYY-MM-DD  pin provenance.runDate (default: today) so a rebuild can
                         reproduce a committed payload byte-for-byte.
  --threshold=N        override display.threshold for this build (score cut for
                       keeps_citation; committed config untouched)
  --solid-threshold=N  override display.solid_threshold for this build (the
                       adjacent flag cut; committed config untouched)
"""
import collections
import importlib.util
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

MODEL_LABEL = {"sol": "GPT-5.6 Sol", "fable": "Claude Fable 5", "qwen-max": "Qwen3.7-Max", "kimi": "Kimi-K3", "kimi-k2": "Kimi-K2.6", "qwen-big": "Qwen3-235B", "opus": "Claude Opus 4.8",
               "gpt-mini": "GPT-5 mini", "haiku": "Claude Haiku 4.5", "qwen-small": "Qwen3-32B"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

SUBSTITUTION_NOTES = {
    "frontier": "opus (claude-opus-4-8) replaces fable on harm-to-third-parties x "
                "model-spec (fable output content-filtered, 3 attempts); kimi-k2 "
                "(Kimi-K2.6) replaces kimi on over-under-caution x model-spec (K3 "
                "exhausted a 65k output budget on reasoning without emitting verdicts, "
                "finish_reason length)",
}


def resolve_panel(config, name):
    """Panel seats for a --panel= value: a configured panel name, or a bare model
    tag treated as a one-seat panel (whole_doc.py has always accepted a bare tag).

    Validated, not permissive. `.get(name) or [name]` would turn a typo into a
    one-seat panel named after the typo -- exit 0, an empty payload, and that
    payload promoted to manifest.json's `latest`. Unknown input fails here for
    the same reason an unknown flag does. Guards mirror run_rollout.py's:
    panels.json also holds prose `_note` strings, and a panel could be empty."""
    panels = config["panels"]
    if name in panels and isinstance(panels[name], list) and panels[name]:
        return set(panels[name])
    if name in config.get("models", {}):
        return {name}
    sys.exit(f"unknown panel/model {name!r} -- panels: "
             f"{[k for k in panels if not k.startswith('_')]}; "
             f"models: {sorted(config.get('models', {}))}")


def zero_citation_reason(rubric, runlog_rubrics, runlog_models, panel):
    """Why a build produced nothing. The rubric filter runs before the panel
    filter, so a rubric mismatch used to be reported as a panel mismatch --
    with perfectly overlapping judges and advice to change the one flag that
    was already correct."""
    if rubric not in runlog_rubrics:
        return (f"\n  0 citations. No rows carry rubric={rubric!r}; the runlog holds "
                f"{sorted(runlog_rubrics)}. Pass --rubric=<one of those>.")
    overlap = runlog_models & panel
    return (f"\n  0 citations. Runlog judges: {sorted(runlog_models) or 'none'}; "
            f"panel seats: {sorted(panel)}. A citation needs {min(2, len(panel))} "
            f"vote(s) from seats in the panel"
            + ("" if overlap else " -- these do not overlap; "
               "pass --panel=<one of the runlog's tags>.") )


def unknown_slug_message(unknown_keys, registry_path):
    """Names the registry the caller actually passed, not a fixed path."""
    return (f"runlog behaviour key(s) {unknown_keys} are not registry slugs "
            f"({registry_path}) -- every runlog key must be a slug")


def keeps_citation(score, n_votes, panel_size, threshold=1):
    """Pure: stray-vote guard -- scales to panel size so a 1-judge panel is legal.
    The score cut honours display.threshold (default 1: keep everything scored)."""
    return score >= threshold and n_votes >= min(2, panel_size)


def clean_quote(text):
    """Pure: strip bold markers -- mid-word bold in spec source breaks anchor matching."""
    return text.replace("**", "")


def citation_quote(text):
    """Pure: (quote, is_example_block). Fenced example blocks render as code the
    matcher cannot see, so -- like the curated data -- the quote is the caption
    line before the fence and the exampleBlock flag extends the highlight."""
    if "~~~" in text:
        caption = clean_quote(text.split("~~~")[0].strip())
        if caption:                       # a fence-leading passage has no caption --
            return caption, True          # an empty quote would anchor to the wrong block
    return clean_quote(text), False


def behaviour_slug(runlog_key, registry):
    """The site slug a runlog behaviour key points at: the key itself --
    runlog keys are registry slugs. Unknown keys never reach here: main()
    exits loud on any runlog key the registry does not carry."""
    return runlog_key if runlog_key in registry else None


def display_behaviours(keep, registry):
    """The behaviours a publication shows, ordered as the reader lists them: by
    group, then name. A slug the registry does not carry is refused, so a typo
    cannot build a menu with a hole in it."""
    unknown = [slug for slug in keep if slug not in registry]
    if unknown:
        sys.exit(f"display behaviours not in the behaviour registry: {unknown}")
    rows = [{"slug": slug, "name": registry[slug]["name"],
             "definition": registry[slug]["definition"],
             "category": registry[slug]["group"]}
            for slug in dict.fromkeys(keep)]
    return sorted(rows, key=lambda row: (row["category"], row["name"]))


def build_behaviours(behaviours, votes, text, document_ids, depths, panel, display):
    """The payload's behaviours.

    `votes` is {(slug, locator): {model: verdict}}, `text` {locator: passage text},
    `depths` {(slug, document id): depth}. A passage belongs to the document whose
    id heads its locator."""
    sym = {3: "✓✓", 2: "✓", 1: "~", 0: "✗"}
    word = {3: "defining", 2: "core", 1: "related", 0: "not relevant"}
    out = []
    for b in behaviours:
        cov = {}
        for document_id in document_ids:
            cell = []
            for (slug, locator), mv in votes.items():
                if slug != b["slug"] or locator.split(" > ", 1)[0] != document_id:
                    continue
                if "fable" in mv and "opus" in mv:
                    mv = {m: v for m, v in mv.items() if m != "opus"}   # opus is fable's SUBSTITUTE, never an extra seat
                if "kimi" in mv and "kimi-k2" in mv:
                    mv = {m: v for m, v in mv.items() if m != "kimi-k2"}   # k2.6 is kimi's stand-in; k3 wins when present
                cell.append((locator, mv))
            max_verdict = max([2] + [v for _, mv in cell for v in mv.values()])
            cits = []
            for locator, mv in cell:
                score = sum(mv.values())
                if not keeps_citation(score, len(mv), len(panel), display["threshold"]):
                    continue
                decisions = "\n".join(f"{sym[v]} {MODEL_LABEL.get(m, m)} — {word[v]}"
                                      for m, v in sorted(mv.items(), key=lambda x: -x[1]))
                quote, is_example = citation_quote(text.get(locator, ""))
                cits.append({
                    "id": f"{document_id}-{b['slug']}-panel-{len(cits) + 1}",
                    "locator": locator, "quote": quote, "exampleBlock": is_example,
                    "role": f"Model determined relevance (score {score}/{max_verdict * len(mv)}):\n{decisions}",
                    "adjacent": score < display["solid_threshold"],
                    "verdicts": dict(sorted(mv.items())), "score": score,
                })
            cits.sort(key=lambda c: (-c["score"], c["locator"]))
            cov[document_id] = {"depth": depths.get((b["slug"], document_id)), "passages": cits}
        out.append({"id": len(out) + 1, "slug": b["slug"], "name": b["name"],
                    "definition": b["definition"], "category": b["category"],
                    "coverage": cov})
    return out


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    sp = importlib.util.spec_from_file_location("h", HERE / "harness.py")
    h = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(h)
    config = h.load_config()
    DISPLAY = config["display"]
    # display.rubric is the rubric the SHIPPED payload builds from (v5, 9-point);
    # top-level config["rubric"] matches it since the v5 prompt port (whole_doc.py
    # stamps v5 by default; the v3 prompts remain behind --rubric=).
    rubric = DISPLAY.get("rubric", config["rubric"])
    out_name = None   # required: this writes where it is told and nowhere else
    # The cells a publication is ABOUT to carry, for a publication that does not
    # exist yet: its payloads are columns and it is insert-only, so they are built
    # before the row. Without it, the publication the reader serves.
    cells = None
    run_date = str(date.today())
    for a in argv:
        if a.startswith("--rubric="):
            rubric = a.split("=", 1)[1]
        elif a.startswith("--panel="):
            DISPLAY["panel"] = a.split("=", 1)[1]
        elif a.startswith("--behaviours="):     # site slugs, comma-separated; overrides display list
            DISPLAY["behaviours"] = a.split("=", 1)[1].split(",")
        elif a.startswith("--run-date="):       # pin provenance.runDate for reproducible rebuilds
            run_date = a.split("=", 1)[1]
            if not DATE_RE.match(run_date):
                sys.exit(f"--run-date must be YYYY-MM-DD, got '{run_date}'")
        elif a.startswith("--out="):            # where to write the payload
            out_name = a.split("=", 1)[1]
        elif a.startswith("--cells="):          # build for a selection, not the current publication
            cells = json.loads(Path(a.split("=", 1)[1]).read_text())
        elif a.startswith("--threshold="):      # score cut override (derived payloads; config untouched)
            raw = a.split("=", 1)[1]
            try:
                DISPLAY["threshold"] = max(0, int(raw)) if int(raw) >= 0 else None
            except ValueError:
                DISPLAY["threshold"] = None
            if DISPLAY["threshold"] is None:
                sys.exit(f"--threshold must be a non-negative integer, got {raw!r}")
        elif a.startswith("--solid-threshold="):   # adjacent-flag cut override (config untouched)
            raw = a.split("=", 1)[1]
            try:
                value = int(raw)
            except ValueError:
                value = None
            if value is None or value < 0:
                sys.exit(f"--solid-threshold must be a non-negative integer, got {raw!r}")
            DISPLAY["solid_threshold"] = value
        else:
            # Unknown args were ignored, so `--help` ran a full build and wrote a
            # payload + manifest. Asking for help must not mutate the repo.
            sys.exit(f"unknown argument {a!r} -- valid: --rubric= --panel= "
                     "--behaviours= --run-date= --out= --cells= "
                     "--threshold= --solid-threshold=")
    if out_name is None:
        sys.exit("--out=PATH is required: this writes the payload where it is told")
    panel = resolve_panel(config, DISPLAY["panel"])
    # The index, out of its tables. There is nowhere else it lives.
    sys.path.insert(0, str(ROOT / "engine"))
    import index_store            # noqa: E402
    from store import Store       # noqa: E402
    store = Store.from_env()
    index_store.install_registry(store)
    registry = index_store.behaviours(store)
    registry_path = "supabase aci_behaviours"   # for the message an unknown slug raises
    if cells is None:
        publication = index_store.current_publication(store)
        cells = [c for c in store.select("aci_publication_cells")
                 if publication and c["publication_id"] == publication["id"]]
    log_rows = index_store.published_runlog_rows(store, cells=cells)
    votes = collections.defaultdict(dict)
    runlog_models = set()
    runlog_rubrics = set()
    runlog_keys = set()
    max_verdict = 0   # scale of the admitted rows; names the scoring rule in provenance
    for d in log_rows:
        runlog_keys.add(d["behaviour"])
        runlog_models.add(d["model"])   # pre-filter, so a zero can name them
        runlog_rubrics.add(d.get("rubric", "v1"))
        if d.get("rubric", "v1") != rubric or not d.get("parsed", True) or d["model"] not in panel:
            continue
        votes[(d["behaviour"], d["locator"])][d["model"]] = d.get("verdict", 0)
        max_verdict = max(max_verdict, d.get("verdict", 0))
    unknown_keys = sorted(runlog_keys - set(registry))
    if unknown_keys:
        sys.exit(unknown_slug_message(unknown_keys, registry_path))

    # One document per published version; its id heads every locator into it.
    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    published = [versions[i] for i in index_store.published_spec_version_ids(store, cells=cells)]
    document_ids = [f"{v['spec_id']}@{v['version']}" for v in published]
    text = {}
    for version in published:
        for loc, _sec, t in h.passages(version["spec_id"], version["version"]):
            text[loc] = t
    depths = {(slug, f"{versions[version_id]['spec_id']}@{versions[version_id]['version']}"): depth
              for (slug, version_id), depth in index_store.cell_depths(store, cells).items()}

    behaviours = display_behaviours(DISPLAY["behaviours"], registry)
    out_behaviours = build_behaviours(behaviours, votes, text, document_ids, depths,
                                      panel, DISPLAY)
    seats = sorted({m for b_ in out_behaviours for cov in b_["coverage"].values()
                    for p in cov["passages"] for m in p.get("verdicts", {})})
    # The substitution note records WHY a provider failed on a given cell -- something
    # no runlog carries, so it cannot be derived and must not be asserted. It was a
    # constant, which stamped the shipped run's opus/kimi-k2 substitutions onto every
    # payload the builder emitted, including runs those judges never touched. Keyed to
    # the panel it actually describes; omitted entirely for any other panel.
    substitution = SUBSTITUTION_NOTES.get(DISPLAY["panel"])

    out = {"generatedFrom": [f"engine/panel/build_site_data.py ({rubric})"],
           "provenance": {
               "method": "llm-panel whole-document judging", "rubric": rubric,
               "panel_config": DISPLAY["panel"],
               "panel": sorted(panel),
               **({"substitution": substitution} if substitution else {}),
               "judges_seen_in_data": seats,
               "runDate": run_date,
               # The scoring rule names the scale the admitted rows actually carry:
               # a 4-point rubric (defining=3 exists) must not describe itself as 2/1/0.
               "scoring": ("per passage: sum over judges of defining=3/core=2/related=1/neither=0; "
                           "display thresholds are client-side URL params") if max_verdict >= 3 else
                          ("per passage: sum over judges of core=2/related=1/neither=0; "
                           "display thresholds are client-side URL params")},
           "behaviours": out_behaviours}
    n = sum(len(c["passages"]) for b in out_behaviours for c in b["coverage"].values())
    summary = f"{len(out_behaviours)} behaviours, {n} citations " \
              f"(threshold {DISPLAY['threshold']}, solid {DISPLAY['solid_threshold']})"
    if n == 0:
        # Kept nothing. Do not write, do not touch the manifest, do not report
        # success: a promoted empty run renders as a blank reader with the reason
        # only in terminal scrollback.
        sys.exit("error: " + summary.strip()
                 + zero_citation_reason(rubric, runlog_rubrics, runlog_models, panel))
    payload = json.dumps(out, indent=1, ensure_ascii=False)
    # One destination, named by the caller. There used to be two, plus a ledger:
    # a build emitted a timestamped run file and promoted it to manifest.json's
    # `latest`, which is how a local run got pinned by ?data=. The reader
    # resolves a publication now, and a build feeds one.
    Path(out_name).write_text(payload)
    print(f"{out_name}: {summary}")


if __name__ == "__main__":
    main()
