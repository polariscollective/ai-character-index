"""Composing and parsing one link call. The fixture index supplies the
behaviours and the two documents; nothing touches a network."""
import hashlib
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "tests" / "fixtures"))
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))
import cite                      # noqa: E402
import index as fixture          # noqa: E402
import link_call                 # noqa: E402

SOURCES = [("src-1", "A > B", "The document should say what it means."),
           ("src-2", "A > C", "It should also say what it does not mean.")]
TARGETS = [("tgt-1", "X > Y", "This document says what it means."),
           ("tgt-2", "X > Z", "This document is warm and friendly."),
           ("tgt-3", "X > W", "This document never says what it means.")]


class ComposeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def compose(self):
        return link_call.compose("defined-behaviour", self.registry, SOURCES, TARGETS,
                                 "corpus@2026-01-01", "second@2026-02-01")

    def test_the_system_prompt_is_the_file_on_disk(self):
        system, _user = self.compose()
        self.assertEqual(system, (HERE / "prompts" / "link-v1.txt").read_text())

    def test_the_digest_is_of_the_prompt_on_disk(self):
        expected = hashlib.sha256((HERE / "prompts" / "link-v1.txt").read_bytes()).hexdigest()
        self.assertEqual(link_call.prompt_sha256(), expected)

    def test_the_prompt_carries_the_brief_both_documents_and_their_numbering(self):
        _system, user = self.compose()
        self.assertIn("NOT this behaviour", user)
        self.assertIn("[1] (§ A > B) The document should say what it means.", user)
        self.assertIn("[3] (§ X > W) This document never says what it means.", user)
        self.assertIn("corpus@2026-01-01", user)
        self.assertIn("second@2026-02-01", user)

    def test_the_prompt_asks_for_every_source_passage(self):
        _system, user = self.compose()
        self.assertIn("all 2", user)

    def test_the_prompt_separates_tone_from_norm_and_forbids_an_accidental_contradiction(self):
        system = link_call.system_prompt()
        self.assertIn("tone, manner or personality is not a counterpart", system)
        self.assertIn("it must not be said by accident", system)
        self.assertIn("priority:", system)


class ParseTest(unittest.TestCase):
    def parse(self, reply):
        return link_call.parse(reply, len(SOURCES), len(TARGETS))

    def test_a_well_formed_link(self):
        links, uncovered = self.parse(
            "[1] -> [1] same (nobody/user): both state the meaning.\n"
            "[2] -> none: nothing in the document bears on this.")
        self.assertEqual(uncovered, [])
        self.assertEqual(links[0], {"source": 1, "target": 1, "relation": "same",
                                    "source_force": "nobody", "target_force": "user",
                                    "rationale": "both state the meaning."})
        self.assertEqual(links[1], {"source": 2, "target": None, "relation": "absent",
                                    "source_force": None, "target_force": None,
                                    "rationale": "nothing in the document bears on this."})

    def test_a_source_with_several_counterparts_keeps_them_all(self):
        links, uncovered = self.parse(
            "[1] -> [1] same (nobody/user): a.\n"
            "[1] -> [3] contradiction (nobody/user): b.\n"
            "[2] -> none: c.")
        self.assertEqual(uncovered, [])
        self.assertEqual([(l["source"], l["target"]) for l in links],
                         [(1, 1), (1, 3), (2, None)])

    def test_a_source_nobody_answered_for_is_uncovered(self):
        links, uncovered = self.parse("[1] -> [1] same (nobody/user): a.")
        self.assertEqual(uncovered, [2])
        self.assertFalse(link_call.covered_enough(uncovered))
        self.assertTrue(link_call.covered_enough([]))

    def test_markdown_around_a_line_is_read_through(self):
        for line in ("**[1] -> [1] same (nobody/user): a.**",
                     "- [1] -> [1] same (nobody/user): a.",
                     "`[1] -> [1] same (nobody/user): a.`"):
            with self.subTest(line=line):
                links, _uncovered = self.parse(line)
                self.assertEqual(len(links), 1)
                self.assertEqual(links[0]["relation"], "same")

    def test_an_underscore_inside_a_relation_survives_the_markdown_stripping(self):
        links, _uncovered = self.parse("[1] -> [1] stricter_source (nobody/user): a.")
        self.assertEqual(links[0]["relation"], "stricter_source")

    def test_a_relation_outside_the_vocabulary_is_dropped(self):
        links, uncovered = self.parse("[1] -> [1] strongly_agree (nobody/user): a.")
        self.assertEqual(links, [])
        self.assertEqual(uncovered, [1, 2])

    def test_a_force_outside_the_vocabulary_is_dropped(self):
        links, uncovered = self.parse("[1] -> [1] same (everyone/user): a.")
        self.assertEqual(links, [])
        self.assertEqual(uncovered, [1, 2])

    def test_a_passage_number_the_call_did_not_give_is_dropped(self):
        links, _uncovered = self.parse("[9] -> [1] same (nobody/user): a.\n"
                                       "[1] -> [9] same (nobody/user): b.")
        self.assertEqual(links, [])

    def test_a_rationale_may_contain_a_colon(self):
        links, _uncovered = self.parse(
            "[1] -> [1] same (nobody/user): one rule: stated twice.")
        self.assertEqual(links[0]["rationale"], "one rule: stated twice.")

    def test_prose_around_the_lines_is_ignored(self):
        links, uncovered = self.parse(
            "Here is what I found.\n"
            "[1] -> [1] same (nobody/user): a.\n"
            "[2] -> none: b.\n"
            "That is all.")
        self.assertEqual(len(links), 2)
        self.assertEqual(uncovered, [])


class RowsTest(unittest.TestCase):
    def rows(self, reply):
        links, _uncovered = link_call.parse(reply, len(SOURCES), len(TARGETS))
        return link_call.link_rows("call-1", SOURCES, TARGETS, links)

    def test_locators_replace_the_numbers(self):
        rows = self.rows("[1] -> [1] same (nobody/user): a.\n[2] -> none: b.")
        self.assertEqual(rows[0]["source_locator"], "src-1")
        self.assertEqual(rows[0]["target_locator"], "tgt-1")
        self.assertEqual(rows[0]["call_id"], "call-1")
        self.assertIsNone(rows[1]["target_locator"])
        self.assertEqual(rows[1]["relation"], "absent")

    def test_one_pair_named_twice_keeps_its_gravest_relation(self):
        rows = self.rows("[1] -> [1] same (nobody/user): a.\n"
                         "[1] -> [1] contradiction (nobody/user): b.\n"
                         "[2] -> none: c.")
        pair = [r for r in rows if r["target_locator"] == "tgt-1"]
        self.assertEqual(len(pair), 1)
        self.assertEqual(pair[0]["relation"], "contradiction")

    def test_an_absence_beside_a_link_for_one_passage_is_dropped(self):
        """A judge that found a counterpart has not found the document silent."""
        rows = self.rows("[1] -> none: nothing here.\n"
                         "[1] -> [1] same (nobody/user): except this.\n"
                         "[2] -> none: c.")
        for_one = [r for r in rows if r["source_locator"] == "src-1"]
        self.assertEqual(len(for_one), 1)
        self.assertEqual(for_one[0]["relation"], "same")

    def test_an_absent_row_carries_no_force(self):
        rows = self.rows("[1] -> none: a.\n[2] -> none: b.")
        self.assertTrue(all(r["source_force"] is None and r["target_force"] is None
                            for r in rows))


if __name__ == "__main__":
    unittest.main()
