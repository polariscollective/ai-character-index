#!/usr/bin/env python3
"""Where two judges disagree about a pair of passages, ask a third to settle it.

    python3 engine/panel/link_arbitrate.py artefacts/<run folder>/links.json
    python3 engine/panel/link_arbitrate.py <links.json> --go --arbiter=kimi-k2

Priced and printed by default, spent only with --go, as every other call in this
repository is.

A dispute is one pair of passages and two readings of it. Three kinds:

  different          the judges read the same pair, in the same direction, and
                     gave different relations.
  one judge only     one judge linked the pair and the other, shown the same
                     source passage, did not link it at all.
  self-inconsistent  one judge linked the pair in both directions and its two
                     relations are not mirrors of each other.

The arbiter is shown BOTH DOCUMENTS IN FULL, because the first run showed that
what a dispute usually turns on is not the two paragraphs but their force: who
may lift a rule, what outranks it, which exception applies. A pair-only
arbitration would decide those cases on the half of the evidence that does not
contain the answer.

Disputes are batched so the documents travel once per call rather than once per
dispute. At ten to a call that is nine calls for the first run's 82 disputes,
against 82 copies of the same 115,000 tokens if each were asked on its own: the
same context for a fortieth of the money. A failed call costs one batch.

Relations name documents, never positions. A judge said "stricter_source" about
its own call, and which document that was depends on the direction it read; two
readings of one pair then carry labels that look contradictory and are not.
Named, a reading is the same claim from either side, and neither the arbiter nor
anything downstream has to flip anything.

The arbiter is the panel's third seat: where sol and fable disagree, deepseek
settles it. That keeps the arbitration inside the panel that produced the
readings rather than importing a model nobody chose.

It is not free of conflict. The judges here are sol (OpenAI) and fable
(Anthropic), and the documents are OpenAI's and Anthropic's, so either is twice a
party: to the dispute and to the text. Naming an arbiter that gave one of the
readings is allowed and warned about, and the output records it, because the
third seat cannot always do the work: deepseek stopped a third of the way
through both of its own link calls on the first run.
"""

import argparse
import concurrent.futures
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                  # noqa: E402
import index_store                # noqa: E402
import link_call                  # noqa: E402
import link_record                # noqa: E402
import whole_doc                  # noqa: E402
from store import Store           # noqa: E402

h = link_call.h

PROMPT = HERE / "prompts" / "arbitrate-v1.txt"
CHARS_PER_TOKEN = 4
OUTPUT_TOKENS_PER_DISPUTE = 120

ANSWER_RE = re.compile(
    r"^\[?(\d+)\]?\s*(RELATION|AGREES|WHY)\s*:\s*(.+)$", re.IGNORECASE)
MARKUP_RE = re.compile(r"[*`]+|(?<!\w)_+|_+(?!\w)")


def system_prompt():
    return PROMPT.read_text()


def prompt_sha256():
    return hashlib.sha256(PROMPT.read_bytes()).hexdigest()


def _named(relation, source_locator, target_locator):
    """A judge's relation, with the document named instead of a position.

    A judge said "stricter_source" about its own call, and which document that
    was depends on the direction it read. Named, the reading is the same claim
    from either side, and nothing downstream has to flip anything."""
    if relation == "stricter_source":
        return f"stricter {_document_of(source_locator)}"
    if relation == "stricter_target":
        return f"stricter {_document_of(target_locator)}"
    return relation


def _document_of(locator):
    return locator.split(" > ", 1)[0]


def disputes(data):
    """Every pair two judges did not agree on, with both readings normalised."""
    documents = sorted({d[side] for d in data["directions"] for side in ("source", "target")})
    first = documents[0]

    sources_seen, pairs, quotes = {}, {}, {}
    behaviour = data["directions"][0]["behaviour"]

    for direction in data["directions"]:
        answered = {call["model"] for call in direction.get("calls", [])
                    if call["status"] == "done"}
        for source in direction["sources"]:
            quotes[source["locator"]] = source["quote"]
            sources_seen.setdefault(source["locator"], set()).update(answered)
            for target in source["targets"]:
                quotes[target["locator"]] = target["quote"]
                for judge, relation in (target.get("judge_relations") or {}).items():
                    key = tuple(sorted((source["locator"], target["locator"])))
                    pairs.setdefault(key, {}).setdefault(judge, []).append(
                        (relation, (target["rationales"] or {}).get(judge, ""),
                         source["locator"]))

    out = []
    for (left, right), by_judge in sorted(pairs.items()):
        a, b = (left, right) if left.startswith(first) else (right, left)
        readings = {}
        for judge, said in by_judge.items():
            readings[judge] = [{
                "relation": _named(relation, source,
                                   right if source == left else left),
                "comment": comment,
            } for relation, comment, source in said]

        kinds = []
        silent = {judge for locator in (left, right)
                  for judge in sources_seen.get(locator, set())} - set(readings)
        if silent:
            kinds.append(f"only {', '.join(sorted(readings))} linked it; "
                         f"{', '.join(sorted(silent))} did not")
        for judge, said in readings.items():
            if len({reading["relation"] for reading in said}) > 1:
                kinds.append(f"{judge} read it two ways")
        stated = {judge: said[0]["relation"] for judge, said in readings.items()}
        if len(set(stated.values())) > 1:
            kinds.append("the judges gave different relations")

        if kinds:
            out.append({
                "behaviour": behaviour,
                "first": {"locator": a, "quote": quotes.get(a, "")},
                "second": {"locator": b, "quote": quotes.get(b, "")},
                "readings": readings,
                "why_disputed": "; ".join(kinds),
            })
    return out


def numbered(passages):
    return "\n".join(f"[{i + 1}] (§ {section}) {text}"
                     for i, (_locator, section, text) in enumerate(passages))


def compose(batch, documents):
    """(system, user) for one call settling several disputes.

    `documents` is [(document id, passages)], in the presentation order: the
    first is the one every dispute's first passage belongs to.
    """
    parts = [f"Behaviour: {batch[0]['behaviour']}", ""]
    for document_id, passages in documents:
        parts.append(f"{document_id}, the complete document in order "
                     f"({len(passages)} paragraphs):")
        parts.append(numbered(passages))
        parts.append("")
    parts.append(f"The {len(batch)} disputes:")
    for index, dispute in enumerate(batch, 1):
        said = [f"    {judge} says {reading['relation']}: {reading['comment']}"
                for judge in sorted(dispute["readings"])
                for reading in dispute["readings"][judge]]
        parts.append(
            f"\n[{index}] {dispute['why_disputed']}\n"
            f"  {dispute['first']['locator']}:\n"
            f"    {dispute['first']['quote']}\n"
            f"  {dispute['second']['locator']}:\n"
            f"    {dispute['second']['quote']}\n"
            f"  What the judges said, each naming the document it found stricter:\n"
            + "\n".join(said))
    parts.append(f"\nAnswer with three lines for each of the {len(batch)} disputes, "
                 "numbered as they are above.")
    return system_prompt(), "\n".join(parts)


def parse(reply, count):
    """{dispute number: {relation, agrees, why}} for the numbers a reply gives."""
    out = {}
    for raw in (reply or "").splitlines():
        line = MARKUP_RE.sub("", raw).strip()
        found = ANSWER_RE.match(line)
        if not found:
            continue
        number, field, value = int(found.group(1)), found.group(2).lower(), found.group(3).strip()
        if not 1 <= number <= count:
            continue
        entry = out.setdefault(number, {})
        if field == "relation":
            words = value.split()
            head = words[0].lower().rstrip(":") if words else ""
            if head == "stricter" and len(words) > 1:
                entry["relation"] = f"stricter {words[1].strip('\"' + chr(39))}"
            elif head in ("same", "nuance", "contradiction", "none"):
                entry["relation"] = head
            else:
                entry["relation"] = None
        else:
            entry[field] = value
    return out


def documents_of(data):
    """[(document id, passages)] in presentation order: first document first."""
    ids = sorted({d[side] for d in data["directions"] for side in ("source", "target")})
    out = []
    for document_id in ids:
        spec_id, version = document_id.split("@", 1)
        out.append((document_id, h.passages(spec_id, version)))
    return out


def price(batches, documents, arbiter, config):
    system = system_prompt()
    model = config["models"].get(arbiter, {})
    prices = (model.get("openrouter") or model).get("price_per_mtok")
    if not prices:
        return 0.0
    total = 0.0
    for batch in batches:
        _, user = compose(batch, documents)
        tokens_in = (len(system) + len(user)) // CHARS_PER_TOKEN
        total += tokens_in * prices[0] / 1e6
        total += len(batch) * OUTPUT_TOKENS_PER_DISPUTE * prices[1] / 1e6
    return round(total, 2)


def settle(batch, documents, arbiter, config, call_model):
    system, user = compose(batch, documents)
    provider, model_id = h.resolve(arbiter, config)
    reply, usage, finish_reason, seconds = call_model(
        provider=provider, model_id=model_id, system=system, user=user,
        kwargs=whole_doc.judge_kwargs(arbiter, model_id, config))
    answers = parse(reply, len(batch))
    cost = batch_job.cost_of(arbiter, usage, config)
    out = []
    for index, dispute in enumerate(batch, 1):
        answer = answers.get(index, {})
        out.append(dict(dispute, settled={
            "arbiter": arbiter,
            "relation": answer.get("relation"),
            "agrees": answer.get("agrees"),
            "why": answer.get("why"),
            "finish_reason": finish_reason,
            "seconds": seconds,
            # Shared by the batch: one call answered all of them.
            "batch_cost_usd": cost,
            "raw_output": None if answer.get("relation") else (reply or "")[:2000],
        }))
    return out


def main(argv=None, call_model=None):
    """`call_model` is injected the way link_job.run and link_summary.main take
    one, so an arbitration can be settled by a model reached through a provider
    or by one that answers from a file. It defaults to the provider call, which
    is what the command line uses.

    settle() has always taken its caller; what was missing was a way to hand one
    in from outside without duplicating the record this function assembles."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("links_json")
    parser.add_argument("--arbiter", default="deepseek",
                        help="the panel's third seat by default; warns if it is a party")
    parser.add_argument("--batch", type=int, default=10,
                        help="disputes per call; the documents travel once per call")
    parser.add_argument("--go", action="store_true", help="spend the money")
    parser.add_argument("--concurrency", type=int, default=3)
    args = parser.parse_args(argv)

    source = Path(args.links_json)
    data = json.loads(source.read_text(encoding="utf-8"))
    found = disputes(data)

    judges = {judge for dispute in found for judge in dispute["readings"]}
    # Said, not refused. A seat arbitrating its own reading is a real weakness and
    # the operator may still want it -- the panel's own third seat could not hold
    # this task -- so the choice is theirs and the record carries it.
    a_party = args.arbiter in judges
    if a_party:
        print(f"  WARNING     {args.arbiter} gave one of the readings it is settling "
              f"({', '.join(sorted(judges))} are in dispute)")

    index_store.install_registry(Store.from_env())
    documents = documents_of(data)
    config = h.load_config()
    batches = [found[i:i + args.batch] for i in range(0, len(found), args.batch)]

    print(f"  disputes    {len(found)}")
    print(f"  calls       {len(batches)} of up to {args.batch}")
    print(f"  documents   {', '.join(f'{d} ({len(p)} paragraphs)' for d, p in documents)}")
    print(f"  arbiter     {args.arbiter}")
    print(f"  estimated   ${price(batches, documents, args.arbiter, config)}")
    if not found:
        return 0
    if not args.go:
        print("nothing called (pass --go to spend)")
        return 0

    # Counted per call, because that is what was paid for: one call answers a
    # whole batch, and its cost is carried on each of that batch's disputes.
    # Summing the disputes bills the same call ten times over.
    settled, spent = [], 0.0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        caller = call_model or batch_job.call_openrouter
        for result in pool.map(
                lambda batch: settle(batch, documents, args.arbiter, config,
                                     caller), batches):
            settled.extend(result)
            spent += (result[0]["settled"]["batch_cost_usd"] or 0) if result else 0
            print(".", end="", flush=True)
    print()

    record = {
        "run": data["run"]["id"], "arbiter": args.arbiter,
        # Whether the arbiter is settling a dispute it was a party to. Read it
        # before reading the verdicts.
        "arbiter_was_a_party": a_party,
        "prompt_sha256": prompt_sha256(), "disputes": settled,
    }
    out = source.with_name("arbitration.json")
    out.write_text(json.dumps(record, indent=1, ensure_ascii=False), encoding="utf-8")
    # The file is what a person reads beside the run; the table is what a reader
    # and the MCP server can reach. Both are written here, from one object, so
    # they cannot come to say different things.
    _, said = link_record.write(Store.from_env(), "aci_link_arbitrations",
                                link_record.arbitration_rows(record))
    unparsed = sum(1 for d in settled if not d["settled"]["relation"])
    print(f"written to {out}")
    print(f"  aci_link_arbitrations   {said}")
    print(f"  {len(settled)} settled, {unparsed} unanswered, about ${spent:.2f} spent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
