#!/usr/bin/env python3
"""Carry the paragraphs written beside the site into the tables that now hold them.

    python3 engine/panel/link_store_notes.py
    python3 engine/panel/link_store_notes.py --go

Printed by default, written only with --go, as every other script here is.

A one-off, and deliberately not a rewrite of the three generators. They wrote
their answers into files beside the site because no table existed to hold them;
20260917120000 created aci_passage_notes and aci_document_notes, and this moves
what they already produced. Teaching the generators to write straight to the
database is separate work, and doing it first would have left these behind.

WHAT GOES WHERE

    site/depths.json        -> aci_document_notes, kind 'depth'
    artefacts/standing.json -> aci_document_notes, kind 'standing'
    <run>/paragraphs.json   -> aci_passage_notes, under that run

Each file carries the model and the prompt's digest once, at its head, and one
entry per cell. Both are copied onto every row: the prompt is part of each
table's unique key, so a paragraph can always be traced to the exact wording
that produced it, and re-running an improved prompt writes new rows beside these
rather than over them.

RUNNING IT TWICE IS SAFE

Every row already stored is read first and skipped. The unique keys would refuse
a duplicate anyway, but refusing is an error and skipping is an answer: a file
that gained cells since the last pass should be able to add them without the
whole run failing on the ones that landed before.
"""

import argparse
import glob
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

from store import Store             # noqa: E402

DEPTHS = ROOT / "site" / "depths.json"
OVERVIEW = ROOT / "artefacts" / "standing.json"
PARAGRAPHS = str(ROOT / "artefacts" / "*" / "paragraphs.json")


def read(path):
    path = Path(path)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def document_rows(record, kind):
    """One aci_document_notes row per cell of depths.json or standing.json.

    The key of a cell is "<behaviour>\\n<document>", and each cell repeats both
    as fields; the fields are used, because a key is a convenience of the file
    and the fields are what the writer meant."""
    if not record:
        return []
    return [{
        "behaviour_slug": cell["behaviour"],
        "document_id": cell["document"],
        "kind": kind,
        "model": record["model"],
        "prompt_sha256": record["prompt_sha256"],
        "body": cell["text"],
        "finish_reason": cell.get("finish_reason"),
        "seconds": cell.get("seconds"),
        "cost_usd": cell.get("cost_usd"),
    } for cell in (record.get("cells") or {}).values()]


def passage_rows(record):
    """One aci_passage_notes row per cell of a run's paragraphs.json."""
    if not record:
        return []
    return [{
        "run_id": record["run"],
        "behaviour_slug": cell["behaviour"],
        "locator": cell["locator"],
        "model": record["model"],
        "prompt_sha256": record["prompt_sha256"],
        "body": cell["text"],
        "finish_reason": cell.get("finish_reason"),
        "seconds": cell.get("seconds"),
        "cost_usd": cell.get("cost_usd"),
    } for cell in (record.get("cells") or {}).values()]


def already(store, table, keys):
    """The unique keys of what is stored, so a second pass adds and never fails."""
    return {tuple(row[k] for k in keys)
            for row in store.select(table, {"select": ",".join(keys)})}


def unknown_behaviours(store, rows):
    """Slugs no aci_behaviours row carries. Both tables reference it, so an
    insert naming one would be refused halfway through, leaving the rest of a
    batch unwritten and the operator guessing which."""
    known = {row["slug"] for row in store.select("aci_behaviours", {"select": "slug"})}
    return sorted({row["behaviour_slug"] for row in rows} - known)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--go", action="store_true", help="write the rows")
    args = parser.parse_args(argv)

    depths, overview = read(DEPTHS), read(OVERVIEW)
    paragraph_files = sorted(glob.glob(PARAGRAPHS))

    documents = document_rows(depths, "depth") + document_rows(overview, "standing")
    passages = [row for path in paragraph_files for row in passage_rows(read(path))]

    print(f"  {DEPTHS.name:20} {len(document_rows(depths, 'depth')):>4} notes, kind depth")
    print(f"  {OVERVIEW.name:20} {len(document_rows(overview, 'standing')):>4} notes, kind standing")
    for path in paragraph_files:
        record = read(path)
        print(f"  {Path(path).parent.name[:20]:20} {len(record.get('cells') or {}):>4} notes, "
              f"run {record['run'][:8]}")

    store = Store.from_env()
    missing = unknown_behaviours(store, documents + passages)
    if missing:
        print(f"\n  refused: no behaviour row for {', '.join(missing)}")
        return 1

    held_documents = already(store, "aci_document_notes",
                             ("behaviour_slug", "document_id", "kind", "prompt_sha256"))
    held_passages = already(store, "aci_passage_notes",
                            ("run_id", "behaviour_slug", "locator", "prompt_sha256"))
    documents = [r for r in documents if (r["behaviour_slug"], r["document_id"],
                                          r["kind"], r["prompt_sha256"]) not in held_documents]
    passages = [r for r in passages if (r["run_id"], r["behaviour_slug"],
                                        r["locator"], r["prompt_sha256"]) not in held_passages]

    print(f"\n  to write: {len(documents)} document notes, {len(passages)} passage notes")
    print(f"  already stored: {len(held_documents)} and {len(held_passages)}")
    if not args.go:
        print("nothing written (pass --go)")
        return 0

    if documents:
        store.insert("aci_document_notes", documents, chunk=100)
    if passages:
        store.insert("aci_passage_notes", passages, chunk=100)
    print(f"written: {len(documents)} document notes, {len(passages)} passage notes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
