"""The document-source seam: cite.py can read a spec's text from somewhere
other than a file, without changing anything for the file-backed default."""
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "engine" / "spec-cite"))
import cite


DOC = "\n".join([
    "# Acme Spec",
    "",
    "## First section",
    "",
    "A paragraph that exists only in memory.",
])


class DocumentSourceTest(unittest.TestCase):
    def tearDown(self):
        cite.reset_registry()

    def test_the_default_registry_is_the_bundled_files(self):
        self.assertIn(("constitution", "2026-01-20"), cite.SPECS)
        version, sections, lines = cite.load_spec("constitution", None)
        self.assertEqual(version, "2026-01-20")
        self.assertGreater(len(lines), 100)

    def test_an_installed_source_supplies_the_text(self):
        seen = []

        def source(key):
            seen.append(key)
            return DOC

        cite.use_registry({("acme", "2026-01-01"): "row-1"},
                          {"acme": "2026-01-01"},
                          {("acme", "2026-01-01"): {"title": "Acme Spec"}},
                          source)
        version, sections, lines = cite.load_spec("acme", None)
        self.assertEqual(version, "2026-01-01")
        self.assertEqual(seen, ["row-1"])
        self.assertEqual(lines[0], "# Acme Spec")
        self.assertTrue(any(s.title == "First section" for s in sections))

    def test_an_installed_registry_replaces_the_bundled_one(self):
        cite.use_registry({("acme", "2026-01-01"): "row-1"},
                          {"acme": "2026-01-01"}, {}, lambda key: DOC)
        self.assertNotIn(("constitution", "2026-01-20"), cite.SPECS)

    def test_reset_puts_the_bundled_registry_back(self):
        cite.use_registry({("acme", "2026-01-01"): "row-1"},
                          {"acme": "2026-01-01"}, {}, lambda key: DOC)
        cite.reset_registry()
        self.assertIn(("constitution", "2026-01-20"), cite.SPECS)
        self.assertIn("Anthropic", "\n".join(cite.load_spec("constitution", None)[2]))

    def test_spec_meta_uses_the_source_for_a_derived_title(self):
        cite.use_registry({("acme", "2026-01-01"): "row-1"},
                          {"acme": "2026-01-01"}, {}, lambda key: DOC)
        self.assertEqual(cite.spec_meta("acme")["title"], "Acme Spec")


if __name__ == "__main__":
    unittest.main()
