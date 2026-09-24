#!/usr/bin/env python3
"""Aggregate runlog.jsonl -> per-model relevance columns + the PANEL score
(0..N = number of models voting "relevant"), and print inter-model agreement
(the R2 problem-detection signal). Writes scores files the demo can render.

  python3 aggregate.py [behaviour]      # all behaviours if omitted
"""
import collections
import itertools
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNLOG = HERE / "runlog.jsonl"


def main():
    want = sys.argv[1] if len(sys.argv) > 1 else None
    rubric = "v1"
    runlog = RUNLOG
    for a in sys.argv[1:]:
        if a.startswith("--rubric="):
            rubric = a.split("=", 1)[1]
        elif a.startswith("--runlog="):
            runlog = Path(a.split("=", 1)[1])
        elif a == want:
            pass
    if not runlog.exists():
        sys.exit(f"no {runlog.name} yet -- run harness.py first")
    per = collections.defaultdict(dict)   # (behaviour, model) -> {locator: 0/1}
    unparsed = collections.Counter()
    for line in runlog.read_text().splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        if want and d["behaviour"] != want:
            continue
        if d.get("rubric", "v1") != rubric:
            continue
        if not d.get("parsed", True):          # unparsed is missing data, not a 0-vote
            unparsed[(d["behaviour"], d["model"])] += 1
            continue
        per[(d["behaviour"], d["model"])][d["locator"]] = d["relevant"]
    for (beh, m), n in sorted(unparsed.items()):
        print(f"note: {beh}/{m}: {n} unparsed verdicts excluded")

    for beh in sorted({b for b, _ in per}):
        models = sorted(m for b, m in per if b == beh)
        locs = sorted({l for m in models for l in per[(beh, m)]})
        for m in models:
            vd = per[(beh, m)]
            results = [{"locator": l, "score": vd[l], "relevant": bool(vd[l])} for l in locs if l in vd]
            (HERE / f"scores-{beh}-{m}.json").write_text(json.dumps(
                {"behaviour": beh, "model": m, "chunk": "paragraph",
                 "n_blocks": len(results), "results": results}, indent=2))
        n = len(models)
        panel = [{"locator": l, "score": sum(per[(beh, m)].get(l, 0) for m in models if l in per[(beh, m)]),
                  "n_models": n} for l in locs]
        (HERE / f"scores-{beh}-panel.json").write_text(json.dumps(
            {"behaviour": beh, "model": f"panel(0-{n})", "chunk": "paragraph",
             "n_models": n, "n_blocks": len(panel), "results": panel}, indent=2))

        print(f"\n{beh}: {n} models, {len(locs)} passages")
        for a, b in itertools.combinations(models, 2):
            common = [l for l in locs if l in per[(beh, a)] and l in per[(beh, b)]]
            agree = sum(1 for l in common if per[(beh, a)][l] == per[(beh, b)][l])
            both = sum(1 for l in common if per[(beh, a)][l] and per[(beh, b)][l])
            either = sum(1 for l in common if per[(beh, a)][l] or per[(beh, b)][l])
            print(f"  {a:12} vs {b:12}  agree {100*agree/max(len(common),1):3.0f}%   "
                  f"relevant-set F1 {2*both/max(either+both,1):.2f}")

        # calibration vs the Kimi-K3 reference (score>=0.5 = relevant), if present
        k3f = HERE / f"k3ref-{beh}.json"
        if k3f.exists():
            k3 = {r["locator"]: int(r["score"] >= 0.5) for r in json.loads(k3f.read_text())["results"]}
            print(f"  -- vs K3 reference (K3 relevant = {sum(k3.values())}) --")
            for m in models:
                common = [l for l in per[(beh, m)] if l in k3]
                agree = sum(1 for l in common if per[(beh, m)][l] == k3[l])
                both = sum(1 for l in common if per[(beh, m)][l] and k3[l])
                mp = sum(per[(beh, m)][l] for l in common)
                kp = sum(k3[l] for l in common)
                prec, rec = both / max(mp, 1), both / max(kp, 1)
                f1 = 2 * prec * rec / max(prec + rec, 1e-9)
                print(f"  {m:12} vs K3           agree {100*agree/max(len(common),1):3.0f}%   "
                      f"P {prec:.2f} R {rec:.2f} F1 {f1:.2f}   ({m} rel={mp}, common={len(common)})")


if __name__ == "__main__":
    main()
