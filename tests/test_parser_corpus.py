"""The parser corpus contains every construction cite.py recognises.

The corpus goldens used to be dumped from the two lab specs. Those left the
repository when the index moved to Supabase, and a synthetic document took their
place. A synthetic corpus is only worth what it covers, so this asserts the
coverage rather than assuming it: each test names a rule in cite.py and shows
the corpus exercises it.

When a rule is added to cite.py, add a section to the corpus and a test here.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))
import cite  # noqa: E402

CORPUS = ROOT / "tests" / "fixtures" / "parser-corpus.md"


class ParserCorpusTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lines = CORPUS.read_text(encoding="utf-8").splitlines()
        cls.sections = cite.parse_sections(cls.lines)
        cls.by_anchor = {s.anchor: s for s in cls.sections if s.anchor}

    def blocks(self, anchor):
        section = self.by_anchor[anchor]
        return cite.segment_blocks(self.lines, section.start, section.end)

    def test_headings_reach_all_six_levels(self):
        levels = {s.level for s in self.sections}
        self.assertEqual(levels, {1, 2, 3, 4, 5, 6})

    def test_a_heading_carries_an_anchor_and_an_authority_attribute(self):
        first = self.sections[0]
        self.assertEqual(first.anchor, "overview")
        self.assertEqual(first.title, "Parser corpus",
                         "the authority attribute must not leak into the title")

    def test_both_locator_styles_resolve(self):
        by_anchor = self.by_anchor["headings"]
        by_path = next(s for s in self.sections
                       if s.title == "A section reached by path")
        self.assertIsNone(by_path.anchor)
        self.assertIn(" > ", by_path.path_str)
        self.assertIsNotNone(by_anchor)

    def test_each_top_level_list_item_is_its_own_block(self):
        blocks = self.blocks("lists")
        bullets = [b for b in blocks if b.lstrip().startswith(("- ", "* ", "+ "))]
        numbered = [b for b in blocks if b[:2] in ("1.", "2.", "3.")]
        self.assertGreaterEqual(len(bullets), 5)
        self.assertGreaterEqual(len(numbered), 2)
        nested = next(b for b in bullets if "nested list" in b)
        self.assertIn("belongs to the item above", nested,
                      "nested content must stay inside its parent item's block")

    def test_a_fence_is_one_block_and_nothing_inside_it_is_parsed(self):
        blocks = self.blocks("fences")
        fenced = [b for b in blocks if b.startswith(("```", "~~~"))]
        self.assertEqual(len(fenced), 2, "one backtick fence, one tilde fence")
        self.assertIn("# This is not a heading.", fenced[0])
        titles = {s.title for s in self.sections}
        self.assertNotIn("This is not a heading.", titles)

    def test_an_example_caption_takes_its_fence_with_it(self):
        blocks = self.blocks("examples")
        with_fence = [b for b in blocks if b.startswith("**Example**") and "```" in b]
        without = [b for b in blocks if b.startswith("**Example**") and "```" not in b]
        self.assertEqual(len(with_fence), 1)
        self.assertEqual(len(without), 1)

    def test_normalisation_strips_syntax_and_keeps_content(self):
        blocks = self.blocks("inline")
        link = cite.normalize(next(b for b in blocks if "link to" in b))
        self.assertIn("link to somewhere", link)
        self.assertNotIn("example.invalid", link)

        xref = cite.normalize(next(b for b in blocks if "cross-reference" in b))
        self.assertIn("#headings", xref)
        self.assertNotIn("[?]", xref)

        note = cite.normalize(next(b for b in blocks if "footnote marker" in b))
        self.assertNotIn("[^1]", note)

        wrapped = cite.normalize(next(b for b in blocks if "collapses" in b))
        self.assertNotIn("  ", wrapped)
        self.assertNotIn("\n", wrapped)

    def test_abbreviations_do_not_end_a_sentence(self):
        section = self.by_anchor["sentences"]
        blocks = cite.segment_blocks(self.lines, section.start, section.end)
        abbreviated = next(b for b in blocks if "e.g." in b)
        # Three sentences, and neither e.g. nor i.e. nor etc. nor U.S. opens a
        # fourth. The exact splitter is cite.py's; what matters here is that the
        # corpus puts every abbreviation it knows in front of it.
        for token in ("e.g.", "i.e.", "etc.", "vs.", "approx.", "U.S.", "U.K."):
            self.assertIn(token, abbreviated)
        titles = next(b for b in blocks if "Dr." in b)
        for token in ("Dr.", "Mr.", "Ms.", "No.", "vol.", "cf."):
            self.assertIn(token, titles)

    def test_tables_and_quotes_are_blocks(self):
        blocks = self.blocks("tables")
        self.assertTrue(any(b.startswith("|") for b in blocks))
        self.assertTrue(any(b.startswith(">") for b in blocks))

    def test_a_span_of_sentences_resolves(self):
        section = self.by_anchor["sentences"]
        text = cite.get_span_text(section, self.lines, (1, 1, 1, 2))
        self.assertTrue(text)
        self.assertNotIn("\n", text)


if __name__ == "__main__":
    unittest.main()
