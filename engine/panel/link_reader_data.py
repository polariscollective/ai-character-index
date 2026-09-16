#!/usr/bin/env python3
"""A run's links, in the flat file the reader reads.

    python3 engine/panel/link_reader_data.py artefacts/<run folder>/links.json
    python3 engine/panel/link_reader_data.py <links.json> --judge=sol

Writes `site/spec-reader/links.json`, which the reader fetches beside its
payload. Absent, the reader has no bubbles and is unchanged; present, every
judged paragraph carries one bubble per counterpart in the other document.

Deliberately a file and not a route. A link is attached to a locator and to
nothing else: it needs no publication, no run id in the browser, and no database
call from the page. When links are eventually published this is the shape that
payload should carry, and the reader will not have to move.

Both directions are merged, keyed by locator, so a paragraph carries its bubbles
whichever document it sits in.
"""

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEFAULT_OUT = ROOT / "site" / "spec-reader" / "links.json"


def by_locator(data, judge=None):
    """{source locator: [{to, relation, comment, judge}]} over both directions.

    One entry per judge per counterpart: with a panel the reader sees each
    reading, and with one seat it sees that seat's. The comment is the judge's
    own sentence, which is the thing that makes a relation worth trusting or
    doubting.
    """
    out = {}
    for direction in data["directions"]:
        for source in direction["sources"]:
            for target in source["targets"]:
                relations = target.get("judge_relations") or {}
                if not relations:
                    relations = {j: target["relation"] for j in target.get("judges", [])}
                for seat, relation in relations.items():
                    if judge is not None and seat != judge:
                        continue
                    if not relation:
                        continue
                    out.setdefault(source["locator"], []).append({
                        "to": target["locator"],
                        "relation": relation,
                        "judge": seat,
                        "comment": (target["rationales"] or {}).get(seat, ""),
                    })
    return out


def build(data, judge=None):
    return {
        "run": data["run"]["id"],
        "judge": judge,
        "documents": sorted({d[side] for d in data["directions"]
                             for side in ("source", "target")}),
        "byLocator": by_locator(data, judge),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("links_json", help="the links.json of a run's report folder")
    parser.add_argument("--judge", default=None, help="one seat's readings only")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args(argv)

    data = json.loads(Path(args.links_json).read_text(encoding="utf-8"))
    payload = build(data, args.judge)
    out = Path(args.out)
    out.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    bubbles = sum(len(v) for v in payload["byLocator"].values())
    print(f"written to {out}")
    print(f"  {len(payload['byLocator'])} paragraphs carry links, {bubbles} bubbles in all")
    return 0


if __name__ == "__main__":
    sys.exit(main())
