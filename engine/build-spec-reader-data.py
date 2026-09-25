#!/usr/bin/env python3
"""Build the spec reader's documents payload.

    python3 engine/build-spec-reader-data.py              # write the default output
    python3 engine/build-spec-reader-data.py --out=PATH   # write somewhere else
    python3 engine/build-spec-reader-data.py --cells=PATH # build for a selection

The payload carries the spec text of every version the current publication used.
It comes from the index tables; there is nowhere else it lives.

--cells names a JSON file of the cells a publication is ABOUT to carry. A
publication holds its payloads as columns and is insert-only, so they have to be
built before the row exists; the publish job chooses its cells, points both
builders at them, and inserts the result in one go. Without the flag this builds
for the publication the reader currently serves, which is what the provenance
verifier asks for.

The output is materialised onto the publication row at publication time and
served from there by /api/reader/documents, so this runs when a publication is
made and not on every request.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "site" / "spec-reader" / "data" / "documents.json"

sys.path.insert(0, str(ROOT / "engine"))
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))


def documents_payload(store, cells=None, unanalysed=None):
    """The reader's documents payload: the text of every version a publication
    carries. The frozen coverage ledger this used to carry beside it is not read by
    the reader, and a publication describes coverage through its judges.

    `unanalysed` names versions a publication carries for reading only: their text
    is in the payload and no cell is. Given, every document carries `judged`,
    true for the versions its cells name and false for these, and the reader says
    of a false one that it is under analysis. Not given, nothing is said, which is
    what every publication before it was built with."""
    import index_store            # noqa: E402
    index_store.install_registry(store)
    if unanalysed:
        judged = index_store.published_spec_version_ids(store, cells=cells)
        return {
            "generatedFrom": ["supabase: aci_spec_versions"],
            "documents": index_store.documents(
                store, sorted(set(judged) | set(unanalysed)), judged_version_ids=set(judged)),
        }
    return {
        "generatedFrom": ["supabase: aci_spec_versions"],
        # No judged_version_ids, so no document here carries a `judged` flag.
        # Built for a publication, every version comes from one of its cells,
        # and publish.py refuses a cell no run answered, so the flag would say
        # nothing new. It follows that the reader's "Not judged yet" and the
        # MCP's NOT_JUDGED note are reachable only from a payload built with
        # the set, which publish builds none of today; the reader fixture is
        # where both are exercised.
        "documents": index_store.documents(
            store, index_store.published_spec_version_ids(store, cells=cells)),
    }


def main(argv=None) -> None:
    out = OUTPUT
    cells = None
    unanalysed = None
    for arg in (sys.argv[1:] if argv is None else argv):
        if arg.startswith("--out="):
            out = Path(arg.split("=", 1)[1])
        elif arg.startswith("--cells="):
            cells = json.loads(Path(arg.split("=", 1)[1]).read_text())
        elif arg.startswith("--unanalysed="):
            unanalysed = [v for v in arg.split("=", 1)[1].split(",") if v]
        else:
            raise SystemExit(
                f"unknown argument {arg!r} "
                "(supported: --out=PATH --cells=PATH --unanalysed=IDS)"
            )

    from store import Store       # noqa: E402
    payload = documents_payload(Store.from_env(), cells, unanalysed)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}")


if __name__ == "__main__":
    main()
