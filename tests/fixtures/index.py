"""A small synthetic index, installed in front of cite.py and the panel harness.

The real index lives in Supabase and needs credentials. CI knows none, and that
is a property this repository has defended rather than tolerated. So the tests
that still have a subject get this instead.

A fixture is not a second source of truth. It is small, synthetic, and chosen to
exercise cases: two behaviours, one defined with a boundary and one without, so
both states a behaviour can be in are covered, and one document, the parser
corpus, which carries every construction cite.py recognises.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))
import cite  # noqa: E402

CORPUS = ROOT / "tests" / "fixtures" / "parser-corpus.md"
SPEC_NAME = "corpus"
SPEC_VERSION = "2026-01-01"

# A second document, because the reader compares two panes and a fixture with one
# document cannot exercise that at all.
SECOND = ROOT / "tests" / "fixtures" / "second-document.md"
SECOND_NAME = "second"
SECOND_VERSION = "2026-02-01"

# One behaviour the panel could judge properly, and one it could only judge
# against a blank scope. The difference is the whole point of the judging
# registry, so a fixture that carried only the first would hide it.
JUDGING = {
    "defined-behaviour": {
        "label": "Defined behaviour",
        "title": "Defined behaviour",
        "query": "The document should say what it means.",
        "boundary": "The construct is whether the text states its own meaning. "
                    "NOT this behaviour: whether the meaning is a good one.",
        "source": "tests/fixtures/index.py (synthetic)",
    },
    "undefined-behaviour": None,
}

DISPLAY = {
    "defined-behaviour": {
        "name": "Defined behaviour", "set": "reader-test", "numeric_id": 1,
        "group": "Behaviours under test",
        "definition": "The document should say what it means.", "facets": [],
    },
    "undefined-behaviour": {
        "name": "Undefined behaviour", "set": "reader-test", "numeric_id": 2,
        "group": "Behaviours under test",
        "definition": "Tracked, and defined nowhere.", "facets": [],
    },
}


def install_spec():
    """Put the two fixture documents in front of cite.py."""
    text = {"corpus": CORPUS.read_text(encoding="utf-8"),
            "second": SECOND.read_text(encoding="utf-8")}
    cite.use_registry(
        {(SPEC_NAME, SPEC_VERSION): "corpus", (SECOND_NAME, SECOND_VERSION): "second"},
        {SPEC_NAME: SPEC_VERSION, SECOND_NAME: SECOND_VERSION},
        {(SPEC_NAME, SPEC_VERSION): {"title": "Parser corpus",
                                     "sourceUrl": "https://example.invalid/corpus"},
         (SECOND_NAME, SECOND_VERSION): {"title": "Second document",
                                         "sourceUrl": "https://example.invalid/second"}},
        text.__getitem__)


def judging_registry():
    """{slug: entry} in the shape harness.load_registry() returns: the judging
    entry where there is one, the display entry where there is not."""
    return {slug: JUDGING[slug] or DISPLAY[slug] for slug in DISPLAY}


def uninstall():
    cite.reset_registry()
