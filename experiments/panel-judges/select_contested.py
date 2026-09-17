#!/usr/bin/env python3
"""Select the CONTESTED passages for a behaviour from the cheap-panel runlog + K3.

Contested = the passages where a frontier judge could actually change a conclusion:
  - the cheap panel is internally split (1 or 2 of 3 votes), OR
  - the panel is unanimous but disagrees with K3 (all-yes vs K3<0.5, or all-no vs K3>=0.5).

The ~75% of passages where everyone (panel + K3) already agrees carry ~no information
about model quality, so we skip them. Writes contested-<behaviour>.txt (one locator per
line) for harness.py --locators=.

  python3 select_contested.py <behaviour> [--panel tag,tag,tag]
"""
import collections
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNLOG = HERE / "runlog.jsonl"
CHEAP_PANEL = ("gpt-mini", "haiku", "qwen-small")


def main():
    beh = sys.argv[1]
    panel = CHEAP_PANEL
    for a in sys.argv:
        if a.startswith("--panel="):
            panel = tuple(a.split("=", 1)[1].split(","))
    k3 = {r["locator"]: (1 if r["score"] >= 0.5 else 0)
          for r in json.loads((HERE / f"k3ref-{beh}.json").read_text())["results"]}
    votes, have = collections.defaultdict(int), collections.defaultdict(int)
    for line in RUNLOG.read_text().splitlines():
        d = json.loads(line)
        if d["behaviour"] == beh and d["model"] in panel:
            votes[d["locator"]] += d["relevant"]
            have[d["locator"]] += 1
    locs = [l for l in votes if have[l] == len(panel) and l in k3]
    split = [l for l in locs if 0 < votes[l] < len(panel)]
    disagree = [l for l in locs if (votes[l] == 0 and k3[l] == 1) or (votes[l] == len(panel) and k3[l] == 0)]
    contested = sorted(set(split) | set(disagree))
    out = HERE / f"contested-{beh}.txt"
    out.write_text("\n".join(contested) + "\n")
    print(f"{beh}: {len(locs)} panel-scored passages -> {len(contested)} contested "
          f"({len(split)} split, {len(disagree)} unanimous-but-disagree-K3) "
          f"= {100*len(contested)/max(len(locs),1):.0f}% -> {out.name}")


if __name__ == "__main__":
    main()
