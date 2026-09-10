#!/usr/bin/env python3
"""Record the digest of every artifact the index publishes.

    python3 engine/record_published_artefacts.py

Run once, while the committed files are still present and the provenance
verifier still passes against them. After that the files go and this record is
what stands in for them: the check becomes "the database still produces the
artifact that carried this digest" rather than "the rebuilt bytes equal this
file", which needs twenty megabytes of file to ask.

The repository already keeps digests for this reason: tests/golden/corpus-sha256.json
pins the citation corpus. This is the same idea one level up.
"""

import hashlib
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RECORD = HERE / "published-artefacts.sha256.json"

# The files the migration read. These are recorded for the historical record --
# so anyone reading this later can tell which inputs the published digests
# describe -- and not as something the verifier compares against.
#
# What it compares against is `published` below: the digests of the two payloads
# the routes actually serve, read from the publication row. The committed
# documents file and the database-built one differ on purpose, in one field:
# generatedFrom names its own source, and it must. Comparing the file's digest
# to a rebuild would fail on a difference that is correct.
SOURCES = {
    "runlog-v5": "engine/panel/runlog-v5.jsonl",
    "display-registry": "data/behaviours.json",
    "judging-registry": "engine/panel/behaviours.json",
    "coverage-ledger": "data/coverage.json",
    "cell-curation": "data/panel-cell-curation.json",
    "labs": "data/labs.json",
    "constitution": "specs/claude-constitution/20260120-constitution.md",
    "model-spec": "specs/openai-model-spec/model_spec.md",
    "payload-file": "site/spec-reader/data/behaviours-v5-reader.json",
    "documents-file": "site/spec-reader/data/documents.json",
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def commit():
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT,
                              capture_output=True, text=True,
                              check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def published_digests():
    """The digests the publication row carries for what the routes serve."""
    sys.path.insert(0, str(HERE))
    from store import Store          # noqa: E402
    import index_store               # noqa: E402
    publication = index_store.current_publication(Store.from_env())
    if publication is None:
        sys.exit("nothing is published, so there is no artifact to record")
    return {
        "payload": {"sha256": publication["payload_sha256"],
                    "served_by": "/api/reader/payload"},
        "documents": {"sha256": publication["documents_sha256"],
                      "served_by": "/api/reader/documents"},
    }


def main():
    missing = [name for name, rel in SOURCES.items() if not (ROOT / rel).is_file()]
    if missing:
        sys.exit("cannot record digests for artifacts that are already gone: "
                 + ", ".join(missing) + " -- this must run before the deletion, "
                 "from a tree where the verifier still passes")

    record = {
        "_comment": "What the index published when the migration was verified. "
                    "`published` is what the verifier holds the database to; "
                    "`sources` records the files it was built from, which are "
                    "gone from the branch and recoverable from git history at "
                    "`recorded_at_commit`.",
        "recorded_on": str(date.today()),
        "recorded_at_commit": commit(),
        "published": published_digests(),
        "sources": {name: {"path": rel, "sha256": sha256(ROOT / rel),
                           "bytes": (ROOT / rel).stat().st_size}
                    for name, rel in SOURCES.items()},
    }
    RECORD.write_text(json.dumps(record, indent=2) + "\n")
    print(f"recorded 2 published digests and {len(SOURCES)} sources to "
          f"{RECORD.relative_to(ROOT)} at commit {record['recorded_at_commit'][:8]}")


if __name__ == "__main__":
    main()
