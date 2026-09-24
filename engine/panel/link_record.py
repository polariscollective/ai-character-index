#!/usr/bin/env python3
"""A run's arbitration and its summary, into the database they belong in.

    python3 engine/panel/link_record.py artefacts/<run folder>/links.json

Both were written to files beside a run, which is nowhere a hosted reader or the
MCP server can reach. `aci_link_arbitrations` and `aci_link_summaries` are where
they live; this is the one place that knows their shape, so the two producers and
this backfill cannot drift apart.

Writing again is refused rather than duplicated. Both tables have unique keys and
neither takes an update grant, because a row is what a model said and evidence is
not edited: a second run of the same arbitration is a conflict, and a summary
written from an improved prompt is a new row beside the old one, told apart by
its prompt digest.
"""

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from store import Store, StoreError    # noqa: E402


def split_relation(relation):
    """("stricter", "<document id>") or (relation, None).

    The arbiter names the document that demands more, because the same claim
    read from the other side would flip a positional word. The table keeps the
    name in its own column rather than inside the relation, so nothing
    downstream has to parse a sentence to know which document it was."""
    if not relation:
        return None, None
    head, _, rest = relation.partition(" ")
    if head == "stricter":
        return "stricter", rest.strip() or None
    return head, None


def arbitration_rows(arbitration):
    """One row per dispute an arbiter actually answered.

    A dispute whose reply could not be parsed carries no relation, and a row
    without one would be a verdict nobody gave."""
    rows = []
    for dispute in (arbitration or {}).get("disputes", []):
        settled = dispute.get("settled") or {}
        relation, stricter = split_relation(settled.get("relation"))
        if not relation:
            continue
        rows.append({
            "run_id": arbitration["run"],
            "behaviour_slug": dispute["behaviour"],
            "first_locator": dispute["first"]["locator"],
            "second_locator": dispute["second"]["locator"],
            "first_quote": dispute["first"]["quote"],
            "second_quote": dispute["second"]["quote"],
            "why_disputed": dispute["why_disputed"],
            "readings": dispute.get("readings") or {},
            "arbiter": settled.get("arbiter") or arbitration["arbiter"],
            "arbiter_was_a_party": bool(arbitration.get("arbiter_was_a_party")),
            "prompt_sha256": arbitration["prompt_sha256"],
            "relation": relation,
            "stricter_document": stricter,
            "agrees": settled.get("agrees"),
            "why": settled.get("why"),
            "finish_reason": settled.get("finish_reason"),
            "seconds": settled.get("seconds"),
            "batch_cost_usd": settled.get("batch_cost_usd"),
        })
    return rows


def summary_rows(summary):
    """The one row a summary is, or none when the call came back empty."""
    if not summary or not summary.get("text"):
        return []
    return [{
        "run_id": summary["run"],
        "behaviour_slug": summary["behaviour"],
        "document_ids": summary["documents"],
        "model": summary["model"],
        "prompt_sha256": summary["prompt_sha256"],
        "body": summary["text"],
        "finish_reason": summary.get("finish_reason"),
        "seconds": summary.get("seconds"),
        "cost_usd": summary.get("cost_usd"),
    }]


def write(store, table, rows):
    """(written, message). A duplicate is reported, not raised.

    Running this twice is the ordinary mistake, and the unique keys are what
    stop it. Saying so plainly is more use than a stack trace."""
    if not rows:
        return 0, "nothing to write"
    try:
        store.insert(table, rows)
        return len(rows), f"{len(rows)} written"
    except StoreError as refused:
        if "23505" in str(refused) or "duplicate key" in str(refused):
            return 0, "already recorded; nothing written"
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("links_json", help="a run's report folder, by its links.json")
    args = parser.parse_args(argv)

    source = Path(args.links_json)
    beside = lambda name: source.with_name(name)          # noqa: E731
    arbitration = json.loads(beside("arbitration.json").read_text(encoding="utf-8")) \
        if beside("arbitration.json").exists() else None
    summary = json.loads(beside("summary.json").read_text(encoding="utf-8")) \
        if beside("summary.json").exists() else None

    store = Store.from_env()
    arbitrations = arbitration_rows(arbitration)
    summaries = summary_rows(summary)

    _, said = write(store, "aci_link_arbitrations", arbitrations)
    print(f"  aci_link_arbitrations   {said}")
    _, said = write(store, "aci_link_summaries", summaries)
    print(f"  aci_link_summaries      {said}")

    if arbitration and arbitration.get("arbiter_was_a_party"):
        print(f"  note        {arbitration['arbiter']} settled disputes it was "
              f"a party to; the rows say so")
    return 0


if __name__ == "__main__":
    sys.exit(main())
