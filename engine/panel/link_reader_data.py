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


LABS = {"openai": "OpenAI", "anthropic": "Anthropic", "alibaba": "Alibaba"}


def document_name(locator):
    """"the Anthropic constitution", from a locator or a document id.

    The id is <lab>--<document>@<version>, and a reader wants the lab and the
    document, not the version they are already looking at. Labs are named the way
    they write their own names: capitalize() would make OpenAI "Openai"."""
    head = locator.split(" > ", 1)[0].split("@", 1)[0]
    lab, _, name = head.partition("--")
    return f"the {LABS.get(lab, lab.capitalize())} {name.replace('-', ' ')}"


def in_plain_words(sentence, document_ids):
    """A sentence with our document ids replaced by their names.

    A judge writes "openai--model-spec@2026-08-18 permits...", which is exact and
    unreadable. The reader is a person looking at two specifications, not at our
    identifier scheme."""
    for document_id in sorted(document_ids, key=len, reverse=True):
        sentence = sentence.replace(document_id, document_name(document_id))
        sentence = sentence.replace(document_id.split("@", 1)[0], document_name(document_id))
    return sentence


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


def explain(verdict, source_locator, target_locator, document_ids):
    """(what the page shows, what the file keeps).

    The page gets the sentence that decided the relation and nothing else: a
    reader wants to know how these two paragraphs stand to each other, and a name
    like "fable" answers a question they did not ask. The rest -- who had said
    what, and whom the arbiter agreed with -- is kept beside it in the file, where
    it is what a bug report needs and what a methodology note is written from.
    """
    settled = verdict["settled"]
    shown = in_plain_words(settled.get("why") or "", document_ids)
    trace = []
    for judge in sorted(verdict["readings"]):
        for reading in verdict["readings"][judge]:
            was = as_seen_from(reading["relation"], source_locator)
            said = say_which(reading.get("comment") or "", source_locator, target_locator)
            trace.append(f"{judge} had said {was}" + (f": {said}" if said else ""))
    if settled.get("agrees"):
        trace.append(f"{settled['arbiter']} agrees with {settled['agrees']}")
    return shown, "; ".join(trace)


def named_relation(relation, source_locator, target_locator):
    """A judge's direction-relative relation, with the document named instead.

    "stricter_source" is a fact about the call, not about the pair: read from the
    other side the same claim is "stricter_target". Named once, it survives being
    read from either end."""
    if relation == "stricter_source":
        return f"stricter {source_locator.split(' > ', 1)[0]}"
    if relation == "stricter_target":
        return f"stricter {target_locator.split(' > ', 1)[0]}"
    return relation


def by_locator(data, judge=None, arbitration=None):
    """{locator: [{to, relation, comment, judge, settled, trace, behaviours}]}.

    `behaviours` is every behaviour whose call drew the pair, so the reader can
    show a bubble under the subject it was found for rather than under all of
    them at once. A pair drawn under several keeps one entry and lists them all:
    a relation is a fact about two paragraphs, and the behaviour is the context
    the question was asked in, not part of the answer.

    A relation is a fact about a PAIR of paragraphs, so both of them carry it.
    Emitting it only under the passage a call happened to start from left one
    paragraph pointing at another that pointed back at nothing, which reads as an
    inconsistency and is only an artefact of which direction found it first.

    Where an arbiter settled a pair, its relation is the one shown and its
    sentence is the explanation; a pair it called `none` carries no bubble at
    all. The arbiter corrects the judge on screen and never adds to it: a pair
    this judge did not draw does not appear, however well settled it is.
    """
    verdicts = verdicts_by_pair(arbitration)
    document_ids = {d[side] for d in data["directions"] for side in ("source", "target")}
    pairs = {}

    for direction in data["directions"]:
        for source in direction["sources"]:
            for target in source["targets"]:
                key = tuple(sorted((source["locator"], target["locator"])))
                if key in pairs:
                    # Found again under another behaviour: the same two
                    # paragraphs, so one entry that remembers every behaviour
                    # that drew it. Which of the readings is kept decides
                    # nothing, because where two behaviours disagreed the pair
                    # carries an arbiter's verdict and the verdict is what is
                    # printed below.
                    pairs[key]["behaviours"].add(direction["behaviour"])
                    continue
                relations = target.get("judge_relations") or {}
                if not relations:
                    relations = {j: target["relation"] for j in target.get("judges", [])}
                if judge is not None:
                    relations = {seat: r for seat, r in relations.items() if seat == judge}
                relations = {seat: r for seat, r in relations.items() if r}
                # The judge's own pairs, and nobody else's. An arbiter corrects
                # what this judge said; it does not add links this judge never
                # drew, however well settled they are elsewhere.
                if not relations:
                    continue

                verdict = verdicts.get(key)
                if verdict:
                    shown, trace = explain(verdict, source["locator"],
                                           target["locator"], document_ids)
                    pairs[key] = {"named": verdict["settled"]["relation"],
                                  "comment": shown, "trace": trace,
                                  "settled": True,
                                  "behaviours": {direction["behaviour"]},
                                  "judge": verdict["settled"]["arbiter"]}
                    continue

                seat, relation = next(iter(relations.items()))
                pairs[key] = {
                    "named": named_relation(relation, source["locator"],
                                            target["locator"]),
                    "comment": in_plain_words(
                        say_which((target["rationales"] or {}).get(seat, ""),
                                  source["locator"], target["locator"]), document_ids),
                    "trace": "", "settled": False, "judge": seat,
                    "behaviours": {direction["behaviour"]},
                }

    out = {}
    for (left, right), entry in pairs.items():
        for source_locator, target_locator in ((left, right), (right, left)):
            relation = as_seen_from(entry["named"], source_locator)
            if not relation or relation == "none":
                continue
            row = {"to": target_locator, "relation": relation,
                   "judge": entry["judge"], "settled": entry["settled"],
                   "comment": entry["comment"],
                   "behaviours": sorted(entry["behaviours"])}
            if entry["trace"]:
                row["trace"] = entry["trace"]
            out.setdefault(source_locator, []).append(row)
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


def comparisons(store, run_id):
    """{behaviour slug: {writtenBy, text}} for one run, from the database.

    Read from aci_link_summaries rather than from the summary.json beside a run,
    because that file holds a single behaviour: link_summary writes it once per
    behaviour and each pass overwrites the last. A run covering thirteen
    behaviours would put one behaviour's paragraph under all thirteen, which is a
    wrong answer shaped like a right one. The table is keyed by behaviour for
    exactly this reason.

    The newest row per behaviour wins, the way the engine already takes the
    newest run of a cell: the prompt digest is part of that table's key, so
    improving the wording writes a new row beside the old one rather than
    replacing it.

    What travels is the text and who wrote it. The cost, the duration and the
    prompt digest belong to the record, not to the page.
    """
    rows = store.select("aci_link_summaries", {"select": "*", "run_id": f"eq.{run_id}"})
    newest = {}
    for row in sorted(rows, key=lambda r: r.get("created_at") or ""):
        if row.get("body"):
            newest[row["behaviour_slug"]] = {"writtenBy": row.get("model"),
                                             "text": row["body"]}
    return newest


def build(data, judge=None, order=None, arbitration=None, summaries=None):
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
        # One per behaviour, keyed by slug: a run carries as many comparisons as
        # it has behaviours, and the page picks the one whose note is open.
        "comparisons": summaries or {},
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
    # The database, for the reading order and the behaviour comparisons: the
    # links themselves come from the run's own report, and nothing here asks it
    # for a judgement.
    store = Store.from_env()
    index_store.install_registry(store)
    documents = sorted({d[side] for d in data["directions"]
                        for side in ("source", "target")})
    beside = Path(args.arbitration) if args.arbitration else \
        Path(args.links_json).with_name("arbitration.json")
    arbitration = json.loads(beside.read_text(encoding="utf-8")) if beside.exists() else None
    payload = build(data, args.judge, reading_order(documents), arbitration,
                    comparisons(store, data["run"]["id"]))
    out = Path(args.out)
    out.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    bubbles = sum(len(v) for v in payload["byLocator"].values())
    print(f"written to {out}")
    settled = sum(1 for links in payload["byLocator"].values()
                  for link in links if link.get("settled"))
    print(f"  {len(payload['byLocator'])} paragraphs carry links, {bubbles} bubbles in all")
    print(f"  {settled} of them are an arbiter's verdict, {bubbles - settled} one judge's reading")
    if payload["comparisons"]:
        written = payload["comparisons"]
        chars = sum(len(c["text"]) for c in written.values())
        print(f"  and {len(written)} behaviour comparisons, {chars:,} characters in all, "
              f"written by {', '.join(sorted({c['writtenBy'] for c in written.values()}))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
