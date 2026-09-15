"""Passages are read from the version a call names, and located the way the
document says. No network, no credentials: a registry is installed in memory."""
import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))
import cite                      # noqa: E402

_spec = importlib.util.spec_from_file_location("h", HERE / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

OLD = "# Old corpus\n\n## Only section {#only}\n\nThe old text."
NEW = "# New corpus\n\n## Only section {#only}\n\nThe new text."


def install(style=None):
    meta = {("doc", "2026-01-01"): {"title": "Old"}, ("doc", "2026-06-01"): {"title": "New"}}
    if style:
        for entry in meta.values():
            entry["locatorStyle"] = style
    cite.use_registry({("doc", "2026-01-01"): "old", ("doc", "2026-06-01"): "new"},
                      {"doc": "2026-06-01"}, meta, {"old": OLD, "new": NEW}.__getitem__)


class PassagesTest(unittest.TestCase):
    def tearDown(self):
        cite.reset_registry()

    def test_a_named_version_is_read_rather_than_the_newest(self):
        install()
        [(locator, _section, text)] = h.passages("doc", "2026-01-01")
        self.assertEqual(text, "The old text.")
        self.assertTrue(locator.startswith("doc@2026-01-01 > "))

    def test_without_a_version_the_default_is_read_as_before(self):
        install()
        [(_locator, _section, text)] = h.passages("doc")
        self.assertEqual(text, "The new text.")

    def test_an_anchor_document_is_located_by_anchor(self):
        install("anchor")
        [(locator, _section, _text)] = h.passages("doc", "2026-06-01")
        self.assertEqual(locator, "doc@2026-06-01 > #only > ¶1")

    def test_a_path_document_is_located_by_heading_path(self):
        install("path")
        [(locator, _section, _text)] = h.passages("doc", "2026-06-01")
        self.assertEqual(locator, "doc@2026-06-01 > New corpus > Only section > ¶1")

    def test_a_lab_prefixed_name_parses_as_a_locator(self):
        """A pin, expected to pass already: the grammar's [a-z-]+ carries `--`."""
        spec, version, ref, _span = cite.parse_locator(
            "openai--model-spec@2026-08-18 > #overview > ¶2")
        self.assertEqual((spec, version, ref), ("openai--model-spec", "2026-08-18", "#overview"))


if __name__ == "__main__":
    unittest.main()
