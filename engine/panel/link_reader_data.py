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


def document_name(locator):
    """"the Anthropic constitution", from a locator's head.

    The id is <lab>--<document>@<version>, and a reader wants the lab and the
    document, not the version they are already looking at."""
    head = locator.split(" > ", 1)[0].split("@", 1)[0]
    lab, _, name = head.partition("--")
    return f"the {lab.capitalize()} {name.replace('-', ' ')}"


def say_which(comment, source_locator, target_locator):
    """A judge's sentence with its deictics replaced by the documents they meant.

    The judges wrote "the source requires... while the target imposes...", which
    is true of the call they were answering and false of the reader's page: the
    same link is shown under both documents, and there "the source" points at
    whichever one you happen to be standing in. The referent is known exactly --
    the call had a direction -- so it is substituted rather than left to the eye.

    The judges' own words are kept in the run's report; this is the reader's copy.
    """
    if not comment:
        return comment
    for word, locator in (("source", source_locator), ("target", target_locator)):
        name = document_name(locator)
        for phrase in (f"the {word} document", f"The {word} document",
                       f"the {word}", f"The {word}"):
            replacement = name if phrase[0].islower() else name.capitalize()
            comment = comment.replace(phrase, replacement)
    return comment


def as_seen_from(relation, source_locator):
    """An arbiter's relation, expressed from the passage the bubble sits on.

    The arbiter names the document that demands more, which is the same claim
    from either side. A bubble is read from one side, so the page needs the
    relative word back -- and only here, at the last moment, where the side is
    known."""
    if not relation or not relation.startswith("stricter "):
        return relation
    stricter = relation.split(" ", 1)[1].strip()
    return "stricter_source" if source_locator.startswith(stricter) else "stricter_target"


def verdicts_by_pair(arbitration):
    """{(locator, locator): settled} for every dispute an arbiter answered."""
    out = {}
    for dispute in (arbitration or {}).get("disputes", []):
        settled = dispute.get("settled") or {}
        if not settled.get("relation"):
            continue
        key = tuple(sorted((dispute["first"]["locator"], dispute["second"]["locator"])))
        out[key] = {"settled": settled, "readings": dispute.get("readings") or {},
                    "quotes": {dispute["first"]["locator"]: dispute["first"]["quote"],
                               dispute["second"]["locator"]: dispute["second"]["quote"]}}
    return out


def explain(verdict, source_locator, target_locator):
    """The verdict first, then who had said what.

    The bubble asserts one thing, so the sentence that decided it comes first.
    What the judges said follows, because a settled relation whose history is
    lost cannot be argued with, and this page exists to be argued with.
    """
    settled = verdict["settled"]
    lead = f"{settled['arbiter']} settles it: {settled.get('why') or 'no reason given'}"
    trace = []
    for judge in sorted(verdict["readings"]):
        for reading in verdict["readings"][judge]:
            was = as_seen_from(reading["relation"], source_locator)
            said = say_which(reading.get("comment") or "", source_locator, target_locator)
            trace.append(f"{judge} had said {was}" + (f": {said}" if said else ""))
    if settled.get("agrees"):
        trace.append(f"agrees with {settled['agrees']}")
    return lead + (" — " + "; ".join(trace) if trace else "")


def by_locator(data, judge=None, arbitration=None):
    """{source locator: [{to, relation, comment, judge, settled}]}.

    Where an arbiter settled a pair, its relation is the one shown and its
    sentence leads the explanation: the page must not say one thing in a pill and
    another underneath. A pair it called `none` carries no bubble at all, because
    it decided the link should not have been drawn.

    A settled pair is shown whichever judge found it, including one this run's
    `judge` filter would otherwise hide: it is no longer that judge's opinion.
    """
    verdicts = verdicts_by_pair(arbitration)
    out, seen = {}, set()

    for direction in data["directions"]:
        for source in direction["sources"]:
            for target in source["targets"]:
                relations = target.get("judge_relations") or {}
                if not relations:
                    relations = {j: target["relation"] for j in target.get("judges", [])}
                key = tuple(sorted((source["locator"], target["locator"])))
                verdict = verdicts.get(key)

                if verdict:
                    if key in seen:
                        continue
                    seen.add(key)
                    relation = as_seen_from(verdict["settled"]["relation"], source["locator"])
                    if relation == "none":
                        continue
                    out.setdefault(source["locator"], []).append({
                        "to": target["locator"], "relation": relation,
                        "judge": verdict["settled"]["arbiter"], "settled": True,
                        "comment": explain(verdict, source["locator"], target["locator"]),
                    })
                    continue

                for seat, relation in relations.items():
                    if judge is not None and seat != judge:
                        continue
                    if not relation:
                        continue
                    out.setdefault(source["locator"], []).append({
                        "to": target["locator"], "relation": relation,
                        "judge": seat, "settled": False,
                        "comment": say_which((target["rationales"] or {}).get(seat, ""),
                                             source["locator"], target["locator"]),
                    })

    # Pairs only the filtered-out judge found, which an arbiter has since settled.
    for key, verdict in verdicts.items():
        if key in seen:
            continue
        relation = verdict["settled"]["relation"]
        for source_locator, target_locator in (key, key[::-1]):
            shown = as_seen_from(relation, source_locator)
            if shown == "none":
                continue
            out.setdefault(source_locator, []).append({
                "to": target_locator, "relation": shown,
                "judge": verdict["settled"]["arbiter"], "settled": True,
                "comment": explain(verdict, source_locator, target_locator),
            })
        seen.add(key)
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


def build(data, judge=None, order=None, arbitration=None):
    documents = sorted({d[side] for d in data["directions"]
                        for side in ("source", "target")})
    rows = by_locator(data, judge, arbitration)
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
        "arbiter": ((arbitration or {}).get("arbiter")),
        "documents": documents,
        "byLocator": rows,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("links_json", help="the links.json of a run's report folder")
    parser.add_argument("--judge", default=None, help="one seat's readings only")
    parser.add_argument("--arbitration", default=None,
                        help="a run's arbitration.json; its sibling by default")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args(argv)

    data = json.loads(Path(args.links_json).read_text(encoding="utf-8"))
    # The database, for the reading order alone: the links themselves come from
    # the run's own report, and nothing here asks it for a judgement.
    index_store.install_registry(Store.from_env())
    documents = sorted({d[side] for d in data["directions"]
                        for side in ("source", "target")})
    beside = Path(args.arbitration) if args.arbitration else \
        Path(args.links_json).with_name("arbitration.json")
    arbitration = json.loads(beside.read_text(encoding="utf-8")) if beside.exists() else None
    payload = build(data, args.judge, reading_order(documents), arbitration)
    out = Path(args.out)
    out.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    bubbles = sum(len(v) for v in payload["byLocator"].values())
    print(f"written to {out}")
    settled = sum(1 for links in payload["byLocator"].values()
                  for link in links if link.get("settled"))
    print(f"  {len(payload['byLocator'])} paragraphs carry links, {bubbles} bubbles in all")
    print(f"  {settled} of them are an arbiter's verdict, {bubbles - settled} one judge's reading")
    return 0


if __name__ == "__main__":
    sys.exit(main())
