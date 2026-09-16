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
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import index_store                # noqa: E402
import link_call                  # noqa: E402
from store import Store           # noqa: E402

h = link_call.h

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


def reading_order(document_ids):
    """{locator: position} over the documents a run compared.

    A locator says which section a paragraph is in, not where that section falls,
    so the order has to come from the document itself. This is the same cut the
    judges were shown, through the same function, so a position here is the
    position on the reader's page.
    """
    order = {}
    for document_id in document_ids:
        spec_id, version = document_id.split("@", 1)
        for index, (locator, _section, _text) in enumerate(h.passages(spec_id, version)):
            order[locator] = index
    return order


def build(data, judge=None, order=None):
    documents = sorted({d[side] for d in data["directions"]
                        for side in ("source", "target")})
    rows = by_locator(data, judge)
    if order:
        # The bubbles under a paragraph read in the order their targets appear in
        # the other document. Sorted by locator they came out alphabetically,
        # which puts a paragraph 19 before a paragraph 5 and asks the reader to
        # jump backwards for no reason.
        for links in rows.values():
            links.sort(key=lambda link: order.get(link["to"], 1 << 30))
    return {
        "run": data["run"]["id"],
        "judge": judge,
        "documents": documents,
        "byLocator": rows,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("links_json", help="the links.json of a run's report folder")
    parser.add_argument("--judge", default=None, help="one seat's readings only")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args(argv)

    data = json.loads(Path(args.links_json).read_text(encoding="utf-8"))
    # The database, for the reading order alone: the links themselves come from
    # the run's own report, and nothing here asks it for a judgement.
    index_store.install_registry(Store.from_env())
    documents = sorted({d[side] for d in data["directions"]
                        for side in ("source", "target")})
    payload = build(data, args.judge, reading_order(documents))
    out = Path(args.out)
    out.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    bubbles = sum(len(v) for v in payload["byLocator"].values())
    print(f"written to {out}")
    print(f"  {len(payload['byLocator'])} paragraphs carry links, {bubbles} bubbles in all")
    return 0


if __name__ == "__main__":
    sys.exit(main())
