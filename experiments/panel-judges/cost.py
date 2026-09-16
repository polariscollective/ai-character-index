#!/usr/bin/env python3
"""Cost + wall-clock report from metrics.jsonl.

Token counts are EXACT (logged from each API response). Prices are editable
ESTIMATES in $ per 1M tokens (input, output) -- adjust PRICES to reprice; the
logged token counts make any repricing exact.

  python3 cost.py
"""
import collections
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

def _prices():
    """$ per 1M tokens by model_id -- native and OpenRouter-mirror ids, since metrics.jsonl
    records whichever route actually ran."""
    out = {}
    for m in json.loads((HERE / "panel-config.json").read_text())["models"].values():
        out[m["id"]] = tuple(m["price_per_mtok"])
        if "openrouter" in m:
            out[m["openrouter"]["id"]] = tuple(m["openrouter"]["price_per_mtok"])
    return out


PRICES = _prices()


def main():
    m = HERE / "metrics.jsonl"
    if not m.exists():
        raise SystemExit("no metrics.jsonl yet -- run harness.py first")
    agg = collections.defaultdict(lambda: {"calls": 0, "pt": 0, "ct": 0, "sec": 0.0})
    for line in m.read_text().splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        a = agg[(d["behaviour"], d["model"], d["model_id"])]
        a["calls"] += 1
        a["pt"] += d.get("prompt_tokens") or 0
        a["ct"] += d.get("completion_tokens") or 0
        a["sec"] += d.get("seconds") or 0
    print(f"{'behaviour':20} {'model':11} {'calls':>5} {'in_tok':>9} {'out_tok':>8} {'API_s':>7} {'$ (est)':>9}")
    grand = grand_sec = 0.0
    for (beh, model, mid), a in sorted(agg.items()):
        pin, pout = PRICES.get(mid, (0, 0))
        cost = a["pt"] / 1e6 * pin + a["ct"] / 1e6 * pout
        grand += cost
        grand_sec += a["sec"]
        print(f"{beh:20} {model:11} {a['calls']:5} {a['pt']:9} {a['ct']:8} {a['sec']:7.1f} {cost:9.4f}")
    print(f"{'TOTAL':20} {'':11} {'':5} {'':9} {'':8} {grand_sec:7.1f} {grand:9.4f}")
    print("\nNote: API_s is summed per-call latency (runs are sequential per model, "
          "concurrent across the 3 models when launched together).")


if __name__ == "__main__":
    main()
