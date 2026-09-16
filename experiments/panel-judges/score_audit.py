#!/usr/bin/env python3
"""Score the shared-20 human audit against the model camps.

Reads audit-key.json (blinded votes + item kinds) and audit-labels-<rater>.json,
prints: per-item table, inter-rater agreement (ternary + both binarizations),
control pass-rate, and the camp verdict on true camp-disagreement items under
strict (0.4->0, per the first rater's own guidance) and lenient (0.4->1) mappings.

  python3 score_audit.py
"""
import glob
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHEAP = ("gpt-mini", "haiku", "qwen-small")
FRONT = ("sol", "fable", "k3")


def camp(votes, models):
    vs = [votes[m] for m in models if votes.get(m) is not None]
    if len(vs) < 2:
        return None
    return int(sum(vs) * 2 > len(vs))


def main():
    key = [r for r in json.loads((HERE / "audit-key.json").read_text()) if r.get("shared")]
    raters = {}
    for f in sorted(glob.glob(str(HERE / "audit-labels-*.json"))):
        d = json.loads(Path(f).read_text())
        raters[d["rater"]] = {int(k): v for k, v in d["labels"].items()}
    names = sorted(raters)
    print(f"raters: {names}   items: {len(key)}")
    rows = []
    for i, r in enumerate(key, 1):
        rows.append((i, r, camp(r["votes"], CHEAP), camp(r["votes"], FRONT),
                     [raters[n].get(i) for n in names]))
        labs = "  ".join(f"{raters[n].get(i)!s:4}" for n in names)
        print(f"{i:2} {r['behaviour'][:16]:17}{r['kind']:9} cheap={rows[-1][2]} front={rows[-1][3]}  {labs}")

    if len(names) >= 2:
        a, b = names[0], names[1]
        pairs = [(raters[a][i], raters[b][i]) for i, *_ in rows]
        print(f"\ninter-rater ({a} vs {b}): exact {sum(x == y for x, y in pairs)}/{len(pairs)}"
              f"   binary(0.4->0) {sum((x >= 1) == (y >= 1) for x, y in pairs)}/{len(pairs)}"
              f"   binary(0.4->1) {sum((x > 0) == (y > 0) for x, y in pairs)}/{len(pairs)}")

    ctrl = [row for row in rows if row[1]["kind"] == "control"]
    for i, r, c, f, labs in ctrl:
        exp = r["votes"]["k3"]
        checks = " ".join(f"{n}:{(raters[n][i] >= 1) == (exp == 1)}" for n in names)
        print(f"control item {i}: expected {exp}  {checks}")

    dis = [row for row in rows if row[1]["kind"] == "disagree" and row[2] is not None
           and row[3] is not None and row[2] != row[3]]
    print(f"\ncamp verdict on {len(dis)} true camp-disagreements:")
    for tag, fn in (("strict 0.4->0", lambda v: v >= 1), ("lenient 0.4->1", lambda v: v > 0)):
        for n in names:
            w = sum(1 for i, r, c, f, _ in dis if fn(raters[n][i]) == (f == 1))
            print(f"  [{tag}] {n}: sides with frontier {w}/{len(dis)}")
        cons = [row for row in dis if len({fn(raters[n][row[0]]) for n in names}) == 1]
        w = sum(1 for i, r, c, f, _ in cons if fn(raters[names[0]][i]) == (f == 1))
        print(f"  [{tag}] consensus items: {len(cons)}; frontier vindicated {w}/{len(cons)}")


if __name__ == "__main__":
    main()
