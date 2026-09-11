#!/usr/bin/env python3
"""Regenerate the golden snapshots in tests/golden/.

    python3 tests/dump_goldens.py --write            # all goldens
    python3 tests/dump_goldens.py --write corpus     # just the cite.py corpus
    python3 tests/dump_goldens.py --write find       # just the find queries

Two golden families:

corpus -- cite.py outline + show + resolve for every section of both pinned
specs. Sections are enumerated by importing cite.py (so the dump always
covers every section the parser sees), but every captured line is genuine
CLI output from a subprocess call, so the snapshot pins what a user of the
tool actually gets.

find -- cite.py find for a fixed query set. `find` is the one command the
corpus snapshot cannot pin: its output depends on match_normalize folding
(curly quotes, dashes, ellipses) and on the sentence-span arithmetic in
cmd_find, neither of which outline/show/resolve exercise.

When to regenerate (and when not to): see tests/README.md.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CITE = ROOT / "engine" / "spec-cite" / "cite.py"
GOLDEN = Path(__file__).resolve().parent / "golden"

sys.path.insert(0, str(CITE.parent))
import cite  # noqa: E402

# The corpus is dumped from a document written for it, not from the lab specs:
# those left the repository when the index moved to Supabase. See
# tests/fixtures/parser-corpus.md, whose coverage tests/test_parser_corpus.py
# asserts construction by construction.
CORPUS_DOC = ROOT / "tests" / "fixtures" / "parser-corpus.md"
CORPUS_PIN = "corpus@2026-01-01"
SPECS = ("corpus",)

# (spec, query) pairs for the find golden. Queries use straight ASCII
# quotes/dashes on purpose: a hit proves the folding maps them onto the
# specs' typographic characters.
FIND_QUERIES = [
    # a plain hit
    ("corpus", "Each top-level list item is its own block"),
    # a needle crossing a sentence boundary: must report an s<lo>-<hi> range and
    # join both sentences in the excerpt (the cmd_find span arithmetic)
    ("corpus", "This paragraph has three. The second one ends here."),
    # a multi-hit query
    ("corpus", "block"),
    # a known miss: pins the not-found exit path and message
    ("corpus", "this-is-not-in-the-corpus-at-all"),
]


def cli(*args: str, check: bool = True) -> str:
    # The corpus document travels to the subprocess by environment variable, so
    # the dump needs no credentials and no network. See cite.install_cli_registry.
    env = dict(os.environ, SPEC_CITE_DOCUMENT=f"{CORPUS_PIN}:{CORPUS_DOC}")
    result = subprocess.run(
        [sys.executable, str(CITE), *args],
        capture_output=True, text=True, encoding="utf-8", env=env,
    )
    if result.returncode != 0:
        if check:
            sys.exit(f"cite.py {' '.join(args)} failed:\n{result.stderr}")
        body = result.stdout.rstrip("\n")
        body = (body + "\n" if body else "") + result.stderr.rstrip("\n")
        return body + f"\n[exit {result.returncode}]"
    return result.stdout.rstrip("\n")


def section_ref(spec: str, section: "cite.Section") -> str:
    """Anchor where there is one, path otherwise -- both styles in one document,
    which is what the two lab specs used to give between them."""
    if section.anchor:
        return f"#{section.anchor}"
    return section.path_str


def install() -> None:
    """The same registry the subprocesses get, for the in-process calls."""
    text = CORPUS_DOC.read_text(encoding="utf-8")
    name, version = CORPUS_PIN.split("@", 1)
    cite.use_registry({(name, version): str(CORPUS_DOC)}, {name: version},
                      {(name, version): {"title": name}}, lambda key: text)


def dump_spec(spec: str) -> str:
    version, sections, lines = cite.load_spec(spec, None)
    pinned = f"{spec}@{version}"
    out = [f"$ cite.py outline {pinned}", cli("outline", pinned)]
    for section in sections:
        ref = section_ref(spec, section)
        locator = f"{pinned} > {ref}"
        out.append(f'$ cite.py show "{locator}"')
        out.append(cli("show", locator))
        if cite.section_blocks(section, lines):  # empty sections have no span
            out.append(f'$ cite.py resolve "{locator}"')
            out.append(cli("resolve", locator))
    return "\n\n".join(out) + "\n"


def dump_find() -> str:
    out = []
    for spec, query in FIND_QUERIES:
        out.append(f'$ cite.py find {spec} "{query}"')
        out.append(cli("find", spec, query, check=False))
    return "\n\n".join(out) + "\n"


def main() -> None:
    args = sys.argv[1:]
    bless = "--bless" in args
    only = next((a for a in args if a not in ("--write", "--bless")), None)
    if "--write" not in args or only not in (None, "corpus", "find"):
        sys.exit("usage: dump_goldens.py --write [corpus|find] [--bless]"
                 "   (regenerates tests/golden/; --bless also accepts a changed"
                 " corpus digest as the new baseline)")
    install()
    GOLDEN.mkdir(parents=True, exist_ok=True)
    if only in (None, "corpus"):
        # The corpus text is NOT committed (it was ~800 KB whose only job was to
        # make a failure readable). It is written here for local diffing and is
        # gitignored; what the suite checks is the digest manifest beside it.
        digest_path = GOLDEN / "corpus-sha256.json"
        try:
            manifest = json.loads(digest_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            manifest = {"goldens": {}}          # bootstrap: this is the sole writer
        manifest.setdefault("goldens", {})
        before = dict(manifest["goldens"])
        for spec in SPECS:
            target = GOLDEN / f"cite-corpus-{spec}.txt"
            body = dump_spec(spec)
            target.write_text(body, encoding="utf-8")
            raw = body.encode("utf-8")
            manifest["goldens"][target.name] = {
                "sha256": hashlib.sha256(raw).hexdigest(),
                "bytes": len(raw),
                "lines": body.count("\n"),
            }
            print(f"wrote {target.relative_to(ROOT)} (gitignored; for diffing)")
        changed = [n for n, v in manifest["goldens"].items()
                   if before.get(n, {}).get("sha256") != v["sha256"]]
        if not changed:
            print(f"{digest_path.relative_to(ROOT)}: unchanged")
        elif bless:
            digest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            print(f"wrote {digest_path.relative_to(ROOT)} -- accepted new digest for "
                  + ", ".join(changed))
        else:
            # Do NOT accept. This command is step 1 of the recipe a failing test
            # prints, so blessing here would bury the change the developer came to
            # look at.
            print(f"{digest_path.relative_to(ROOT)}: NOT updated -- the digest changed for "
                  + ", ".join(changed)
                  + "\n  Diff the regenerated text above against the old code first"
                    " (see the failing test's message).\n"
                    "  If the change is intentional: python3 tests/dump_goldens.py"
                    " --write corpus --bless")
    if only in (None, "find"):
        target = GOLDEN / "cite-find.txt"
        target.write_text(dump_find(), encoding="utf-8")
        print(f"wrote {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
