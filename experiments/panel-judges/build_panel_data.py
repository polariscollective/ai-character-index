#!/usr/bin/env python3
"""Export panel votes -> site/spec-reader-test/data/panel.json for the reader UI.

Shape: {behaviourSlug: {docId: [{locator, quote, votes:{model:0/1}, nVoters,
nRelevant, pct}]}} -- only passages with >=1 relevant vote (the rest are unhighlighted
spec text). pct = nRelevant/nVoters, because voter count varies: the two calibration
behaviours carry K3 + frontier votes on contested passages; the nine publishable rows
have the 3-model cheap panel (frontier votes join when/if those runs land -- rerun this).

  python3 build_panel_data.py
"""
import collections
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "engine" / "spec-cite"))
import cite  # noqa: E402

SITE = HERE.parent.parent / "site" / "spec-reader-test" / "data" / "panel.json"

# our behaviour keys -> site slugs (general-welfare feeds both general-guidelines rows)
SLUG = {
    "helpfulness": ["helpfulness"],
    "harmlessness-to-user": ["harmlessness-to-the-user"],
    "third-party-harm": ["harm-avoidance-to-third-parties"],
    "proportionate-risk": ["proportionate-risk-mitigation"],
    "tradeoffs": ["how-to-approach-tradeoffs"],
    "over-under-caution": ["avoiding-over-and-under-caution"],
    "objectivity": ["objectivity-on-contested-questions"],
    "user-autonomy": ["user-autonomy"],
    "general-welfare": ["animal-welfare-impacts", "general-welfare-impacts-strict"],
    "no-sycophancy": ["no-sycophancy"],                # calibration rows: site may not list them
    "undermine-oversight": ["undermine-oversight"],
}
DOC = {"constitution": "anthropic", "model-spec": "openai"}
MODEL_LABEL = {"gpt-mini": "GPT-5 mini", "haiku": "Haiku 4.5", "qwen-small": "Qwen3-32B",
               "sol": "GPT-5.6 Sol", "fable": "Fable 5", "k3": "Kimi-K3"}


def passage_text():
    text = {}
    for spec in ("constitution", "model-spec"):
        version, sections, lines = cite.load_spec(spec, None)
        titles = {cite.normalize(s.path_str.split(" > ")[-1]) for s in sections}
        for sec in sections:
            ref = f"#{sec.anchor}" if (spec == "model-spec" and sec.anchor) else sec.path_str
            for i, raw in enumerate(cite.segment_blocks(lines, sec.start, sec.end), 1):
                t = cite.normalize(raw)
                if t and cite.normalize(t) not in titles:
                    text[f"{spec}@{version} > {ref} > ¶{i}"] = t
    return text


def main():
    all_flag = "--all" in sys.argv   # include behaviours whose cheap-panel run is incomplete
    votes = collections.defaultdict(dict)   # (behaviour, locator) -> {model: 0/1}
    spec_of = {}
    counts = collections.Counter()
    logs = ["runlog.jsonl", "runlog-v2.jsonl"] if "--v2" in sys.argv else ["runlog.jsonl"]
    for line in (l for f in logs if (HERE / f).exists()
                 for l in (HERE / f).read_text().splitlines()):
        d = json.loads(line)
        if d.get("rubric", "v1") != ("v2" if "--v2" in sys.argv else "v1"):
            continue
        counts[(d["behaviour"], d["model"])] += 1   # attempted -- completeness counts these
        if not d.get("parsed", True):
            continue                      # unparsed is missing data, not a 0-vote
        votes[(d["behaviour"], d["locator"])][d["model"]] = d["relevant"]
        spec_of[(d["behaviour"], d["locator"])] = d["spec"]
    # complete = every cheap-panel model judged the full 963-passage corpus
    cheap = ("gpt-mini", "haiku", "qwen-small")
    complete = {b for b, _ in counts if all(counts.get((b, m), 0) >= 963 for m in cheap)}
    if not all_flag:
        skipped = sorted({b for b, _ in counts} - complete)
        votes = {k: v for k, v in votes.items() if k[0] in complete}
        if skipped:
            print(f"skipping incomplete behaviours (use --all to include): {skipped}")
    # K3 reference votes for the calibration behaviours
    for beh in ("no-sycophancy", "undermine-oversight"):
        f = HERE / f"k3ref-{beh}.json"
        if f.exists():
            for r in json.loads(f.read_text())["results"]:
                key = (beh, r["locator"])
                if key in votes:
                    votes[key]["k3"] = int(r["score"] >= 0.5)
    text = passage_text()
    out = collections.defaultdict(lambda: collections.defaultdict(list))
    dropped = 0
    for (beh, loc), v in votes.items():
        nrel = sum(v.values())
        if nrel == 0:
            continue
        t = text.get(loc)
        if not t:
            dropped += 1
            continue
        row = {"locator": loc, "quote": t,
               "votes": {MODEL_LABEL.get(m, m): int(x) for m, x in sorted(v.items())},
               "nVoters": len(v), "nRelevant": nrel, "pct": round(nrel / len(v), 3)}
        for slug in SLUG.get(beh, [beh]):
            out[slug][DOC[spec_of[(beh, loc)]]].append(row)
    for slug in out:
        for doc in out[slug]:
            out[slug][doc].sort(key=lambda r: -r["pct"])
    SITE.parent.mkdir(parents=True, exist_ok=True)
    SITE.write_text(json.dumps(out, indent=1, ensure_ascii=False))

    # DEMO rows have no curated passages, so the app's native highlighter (tints, scroll-rail
    # marks, prev/next nav) paints nothing there. Inject the panel's majority-vote passages as
    # their coverage.passages: unanimous -> core styling, split-majority -> adjacent styling.
    bpath = SITE.parent / "behaviours.json"
    site = json.loads(bpath.read_text())
    for beh in site["behaviours"]:
        if beh.get("category") != "Panel judging — demo only":
            continue
        for doc in ("anthropic", "openai"):
            rows = [r for r in out.get(beh["slug"], {}).get(doc, []) if r["pct"] >= 0.5]
            beh["coverage"][doc]["passages"] = [
                {"id": f"{doc}-{beh['slug']}-panel-{i+1}", "locator": r["locator"],
                 "quote": r["quote"], "adjacent": r["pct"] < 1.0}
                for i, r in enumerate(rows)]
    bpath.write_text(json.dumps(site, indent=1, ensure_ascii=False))
    print("demo rows: majority-vote passages injected into site coverage (native highlighting)")
    n = sum(len(rows) for docs in out.values() for rows in docs.values())
    print(f"panel.json: {len(out)} behaviour slugs, {n} flagged passages"
          + (f" ({dropped} locators had no current spec text -- skipped)" if dropped else ""))
    for slug in sorted(out):
        counts = {doc: len(rows) for doc, rows in out[slug].items()}
        voters = max((r['nVoters'] for docs in [out[slug]] for rows in docs.values() for r in rows), default=0)
        print(f"  {slug:38} {counts}  (max voters {voters})")


if __name__ == "__main__":
    main()
