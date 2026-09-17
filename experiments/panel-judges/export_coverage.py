#!/usr/bin/env python3
"""Export panel verdicts -> the production coverage schema (reader-test-coverage.json shape).

Stays as close to the existing design as possible:
  coverage[] entries: {behaviour_id, behaviour_name, lab_id, verdict, depth_0_4,
                       depth_note, verified_date, citations[]}
  citation: {locator, quote, role, adjacent}
Additions (additive only):
  citation.verdicts       {model-tag: 0|1|2}  -- the panel's per-model votes
  entry.provenance        {method, rubric, models, promptSha, runDate}
Panel-only gaps left null/absent by design: role (human why-sentence), and the row-level
verdict/depth_0_4/depth_note stay whatever the curated source says (editorial judgments
the panel does not produce) -- this exporter emits ONLY the citations + provenance side.

Citation tiers: core = majority of panel votes == 2 -> adjacent: false;
adjacent tier = majority votes >= 1 (but not core) -> adjacent: true.

  python3 export_coverage.py [--out data/panel-coverage.json]
"""
import collections
import hashlib
import importlib.util
import json
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
spec_ = importlib.util.spec_from_file_location("harness", HERE / "harness.py")
h = importlib.util.module_from_spec(spec_)
spec_.loader.exec_module(h)

CONFIG = json.loads((HERE / "panel-config.json").read_text())
LAB = {"constitution": "anthropic", "model-spec": "openai"}
# our behaviour keys -> site slug/id (matches site/spec-reader-test/data/behaviours.json)
SLUGS = {
    "helpfulness": "helpfulness", "harmlessness-to-user": "harmlessness-to-the-user",
    "third-party-harm": "harm-avoidance-to-third-parties",
    "proportionate-risk": "proportionate-risk-mitigation", "tradeoffs": "how-to-approach-tradeoffs",
    "over-under-caution": "avoiding-over-and-under-caution",
    "objectivity": "objectivity-on-contested-questions", "user-autonomy": "user-autonomy",
    "general-welfare": "animal-welfare-impacts",
}


def main():
    out_path = ROOT / "data" / "panel-coverage.json"
    for a in sys.argv[1:]:
        if a.startswith("--out"):
            out_path = ROOT / a.split("=", 1)[1] if "=" in a else out_path
    rubric = CONFIG["rubric"]
    logs = [HERE / "runlog-v2.jsonl"] if rubric == "v2" else [HERE / "runlog.jsonl"]
    votes = collections.defaultdict(dict)   # (beh, locator) -> {model: verdict}
    spec_of = {}
    for log in logs:
        for line in log.read_text().splitlines():
            d = json.loads(line)
            if d.get("rubric", "v1") != rubric or not d.get("parsed", True):
                continue
            votes[(d["behaviour"], d["locator"])][d["model"]] = d.get("verdict", d["relevant"] * 2)
            spec_of[(d["behaviour"], d["locator"])] = d["spec"]
    text = {}
    for s in CONFIG["specs"]:
        for loc, sec, t in h.passages(s):
            text[loc] = t
    prompt_sha = hashlib.sha256((h.SYSTEM + json.dumps(
        {k: v.get("boundary", "") for k, v in json.loads((HERE / "behaviours.json").read_text()).items()
         if isinstance(v, dict)}, sort_keys=True)).encode()).hexdigest()[:12]

    entries = collections.defaultdict(list)   # (beh, lab) -> citations
    for (beh, loc), mv in votes.items():
        if beh not in SLUGS or len(mv) < 2:
            continue
        n = len(mv)
        core = sum(1 for v in mv.values() if v == 2)
        adj = sum(1 for v in mv.values() if v >= 1)
        if core * 2 > n:
            tier = False       # core citation
        elif adj * 2 > n:
            tier = True        # adjacent citation
        else:
            continue
        entries[(beh, LAB[spec_of[(beh, loc)]])].append(
            {"locator": loc, "quote": text.get(loc, ""), "role": None, "adjacent": tier,
             "verdicts": dict(sorted(mv.items()))})
    coverage = []
    for (beh, lab), cits in sorted(entries.items()):
        cits.sort(key=lambda c: (c["adjacent"], c["locator"]))
        coverage.append({
            "behaviour_slug": SLUGS[beh], "lab_id": lab,
            "citations": cits,
            "provenance": {"method": "panel", "rubric": rubric,
                           "models": sorted({m for c in cits for m in c["verdicts"]}),
                           "promptSha": prompt_sha, "runDate": str(date.today())},
        })
    out = {"note": "Panel-of-judges citation layer; row-level verdict/depth stay with curated source.",
           "generatedFrom": [str(p.relative_to(ROOT)) for p in logs] + ["experiments/panel-judges/panel-config.json"],
           "coverage": coverage}
    out_path.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    n_core = sum(1 for e in coverage for c in e["citations"] if not c["adjacent"])
    n_adj = sum(1 for e in coverage for c in e["citations"] if c["adjacent"])
    print(f"{out_path.relative_to(ROOT)}: {len(coverage)} (behaviour,lab) entries, "
          f"{n_core} core + {n_adj} adjacent citations, promptSha {prompt_sha}")


if __name__ == "__main__":
    main()
