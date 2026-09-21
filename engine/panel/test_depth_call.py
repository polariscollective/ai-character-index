"""Composing and parsing one depth call. The fixture index supplies the
behaviours; nothing touches a network."""
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
import depth_call                # noqa: E402

RETAINED = [("loc-1", "A > B", "First passage."), ("loc-2", "A > C", "Second passage.")]


class ComposeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def test_the_system_prompt_is_the_file_on_disk(self):
        system, _user = depth_call.compose("defined-behaviour", self.registry, RETAINED)
        self.assertEqual(system, (HERE / "prompts" / "depth-v1.txt").read_text())

    def test_the_prompt_carries_the_brief_and_every_retained_passage(self):
        _system, user = depth_call.compose("defined-behaviour", self.registry, RETAINED)
        self.assertIn("NOT this behaviour", user)
        self.assertIn("[1] (§ A > B) First passage.", user)
        self.assertIn("[2] (§ A > C) Second passage.", user)

    def test_the_prompt_says_depth_is_independent_of_authority(self):
        # The rubric's own note. Without it a judge can mark a guideline down for
        # being a guideline, which is a claim about authority and not about depth.
        system = depth_call.system_prompt()
        self.assertIn("Depth is independent of authority level", system)
        self.assertIn("Note authority in the rationale where it matters", system)

    def test_the_digest_is_of_the_prompt_on_disk(self):
        expected = hashlib.sha256((HERE / "prompts" / "depth-v1.txt").read_bytes()).hexdigest()
        self.assertEqual(depth_call.prompt_sha256(), expected)


class ParseTest(unittest.TestCase):
    def test_a_well_formed_reply(self):
        self.assertEqual(depth_call.parse("DEPTH: 3\nRATIONALE: Rules, no examples."),
                         (3, "Rules, no examples."))

    def test_reasoning_before_the_answer_is_ignored(self):
        reply = "There are 4 passages to weigh.\nDEPTH: 2\nRATIONALE: General terms only."
        self.assertEqual(depth_call.parse(reply), (2, "General terms only."))

    def test_a_depth_off_the_scale_is_not_a_depth(self):
        self.assertIsNone(depth_call.parse("DEPTH: 5\nRATIONALE: Too high.")[0])
        self.assertIsNone(depth_call.parse("DEPTH: 42\nRATIONALE: Too high.")[0])

    def test_a_reply_without_a_depth_gives_nothing(self):
        self.assertEqual(depth_call.parse("I cannot tell."), (None, None))
        self.assertEqual(depth_call.parse(""), (None, None))

    # Each of these is an ordinary reply, and each one refused is a call paid for
    # and retried.
    def test_markdown_around_the_depth_line_is_read_through(self):
        for line in ("**DEPTH:** 3", "**DEPTH**: 3", "DEPTH: **3**", "`DEPTH: 3`",
                     "- DEPTH: 3", "* DEPTH: 3", "1. DEPTH: 3", "_DEPTH_: 3"):
            with self.subTest(line=line):
                self.assertEqual(depth_call.parse(f"{line}\nRATIONALE: Rules, no examples."),
                                 (3, "Rules, no examples."))

    def test_markdown_around_the_rationale_line_is_read_through(self):
        for line in ("**RATIONALE:** Rules, no examples.", "**RATIONALE**: Rules, no examples.",
                     "`RATIONALE: Rules, no examples.`", "- RATIONALE: Rules, no examples."):
            with self.subTest(line=line):
                self.assertEqual(depth_call.parse(f"DEPTH: 3\n{line}"),
                                 (3, "Rules, no examples."))

    def test_the_last_depth_line_is_the_answer(self):
        reply = ("DEPTH: 3\nRATIONALE: Rules.\nOn reflection the rules are too general.\n"
                 "DEPTH: 1\nRATIONALE: Named only.")
        self.assertEqual(depth_call.parse(reply), (1, "Named only."))

    def test_a_refused_last_depth_does_not_fall_back_to_an_earlier_one(self):
        self.assertIsNone(depth_call.parse("DEPTH: 3\nDEPTH: 5\nRATIONALE: Too high.")[0])

    def test_a_decimal_depth_is_not_a_depth(self):
        self.assertIsNone(depth_call.parse("DEPTH: 2.5\nRATIONALE: Between two levels.")[0])
        self.assertIsNone(depth_call.parse("DEPTH: **2.5**\nRATIONALE: Between two levels.")[0])

    def test_an_underscore_inside_a_word_of_the_rationale_is_kept(self):
        self.assertEqual(
            depth_call.parse("DEPTH: 2\nRATIONALE: The no_sycophancy section is general.")[1],
            "The no_sycophancy section is general.")

    # R1: a trailing line that starts with "Depth:" but goes on to argue in prose
    # is not an answer, and must not steal the depth an earlier, real answer gave.
    def test_prose_naming_a_higher_depth_does_not_override_the_real_answer(self):
        reply = ("DEPTH: 3\nRATIONALE: Rules, but no worked examples, so\n"
                 "Depth: 4 is not reached.")
        self.assertEqual(depth_call.parse(reply), (3, "Rules, but no worked examples, so"))

    def test_a_bulleted_prose_line_naming_a_depth_does_not_override_the_real_answer(self):
        reply = ("DEPTH: 3\nRATIONALE: Rules without examples.\n"
                 "- Depth: 4 would need examples.")
        self.assertEqual(depth_call.parse(reply), (3, "Rules without examples."))

    def test_a_figure_followed_by_a_denominator_of_four_still_answers(self):
        self.assertEqual(depth_call.parse("DEPTH: 3/4\nRATIONALE: Rules.")[0], 3)
        self.assertEqual(depth_call.parse("DEPTH: 3 of 4\nRATIONALE: Rules.")[0], 3)

    def test_a_figure_followed_by_a_parenthetical_still_answers(self):
        self.assertEqual(
            depth_call.parse("DEPTH: 3 (rules stated, no worked examples)\n"
                             "RATIONALE: Rules.")[0], 3)

    def test_a_figure_followed_by_one_word_of_the_scale_still_answers(self):
        self.assertEqual(depth_call.parse("DEPTH: 3 - prescribed\nRATIONALE: Rules.")[0], 3)
        self.assertEqual(depth_call.parse("DEPTH: 3, prescribed.\nRATIONALE: Rules.")[0], 3)

    def test_a_figure_followed_by_bare_punctuation_still_answers(self):
        self.assertEqual(depth_call.parse("DEPTH: 3.\nRATIONALE: Rules.")[0], 3)
        self.assertEqual(depth_call.parse("DEPTH: 3)\nRATIONALE: Rules.")[0], 3)

    # R2: an empty RATIONALE must not blank out a rationale that already had text,
    # and a label whose value is split onto the next line still answers.
    def test_a_trailing_empty_rationale_does_not_blank_an_earlier_one(self):
        reply = "RATIONALE: Rules, no examples.\nDEPTH: 3\nRATIONALE:"
        self.assertEqual(depth_call.parse(reply), (3, "Rules, no examples."))

    def test_a_rationale_split_onto_the_next_line_is_read(self):
        self.assertEqual(
            depth_call.parse("RATIONALE:\nRules are stated without examples."),
            (None, "Rules are stated without examples."))

    def test_a_depth_split_onto_the_next_line_is_read(self):
        self.assertEqual(depth_call.parse("DEPTH:\n3"), (3, None))

    # deepseek answered DEPTH: III thirteen times on one cell, its rationale
    # naming level 3 throughout. A Roman numeral that unambiguously names a
    # level reads like the digit it names, under the same suffix rules.
    def test_a_roman_numeral_reads_as_the_level_it_names(self):
        self.assertEqual(depth_call.parse("DEPTH: III\nRATIONALE: x"), (3, "x"))
        self.assertEqual(depth_call.parse("DEPTH: iv")[0], 4)
        self.assertEqual(depth_call.parse("**DEPTH:** II")[0], 2)

    def test_a_roman_numeral_followed_by_a_parenthetical_still_answers(self):
        self.assertEqual(depth_call.parse("DEPTH: I (named)")[0], 1)

    def test_a_roman_numeral_off_the_scale_is_not_a_depth(self):
        self.assertIsNone(depth_call.parse("DEPTH: V")[0])
        self.assertIsNone(depth_call.parse("DEPTH: IIII")[0])

    def test_a_negative_number_is_still_refused(self):
        self.assertIsNone(depth_call.parse("DEPTH: -1")[0])

    def test_a_roman_numeral_followed_by_prose_is_not_an_answer(self):
        self.assertIsNone(depth_call.parse("DEPTH: III is not reached")[0])

    def test_the_last_answer_line_wins_when_it_is_a_roman_numeral(self):
        reply = "DEPTH: 3\nRATIONALE: …\nDEPTH: III"
        self.assertEqual(depth_call.parse(reply)[0], 3)


RULES = [("rule-1", "X > Y", "A higher rule prevails.")]


class ScaleOfTenComposeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def test_the_scale_of_ten_has_its_own_prompt_and_digest(self):
        path = HERE / "prompts" / "depth-v2.txt"
        system, _user = depth_call.compose("defined-behaviour", self.registry, RETAINED,
                                           scale=10)
        self.assertEqual(system, path.read_text())
        self.assertEqual(depth_call.prompt_sha256(10),
                         hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertNotEqual(depth_call.prompt_sha256(10), depth_call.prompt_sha256())

    def test_the_prompt_of_ten_names_the_new_level_and_keeps_the_authority_note(self):
        system = depth_call.system_prompt(10)
        self.assertIn("10 = BOUNDED", system)
        self.assertIn("An odd number means", system)
        self.assertIn("Depth is independent of authority level", system)
        self.assertNotIn("—", system)
        self.assertNotIn("–", system)

    def test_the_prompt_of_ten_asks_an_odd_value_to_name_what_it_partly_meets(self):
        system = depth_call.system_prompt(10)
        self.assertIn("An odd value needs its rationale to name which part of the level "
                      "above is met", system)

    def test_the_prompt_of_ten_says_never_negative_and_every_facet(self):
        system = depth_call.system_prompt(10)
        self.assertIn("never negative", system)
        self.assertIn("for every facet", system)

    def test_the_scale_of_ten_ends_with_its_own_answer_line(self):
        _system, four = depth_call.compose("defined-behaviour", self.registry, RETAINED)
        self.assertTrue(four.endswith("\n\nAnswer with the two lines DEPTH and RATIONALE."))
        _system, ten = depth_call.compose("defined-behaviour", self.registry, RETAINED,
                                          scale=10)
        self.assertTrue(ten.endswith(
            "\n\nAnswer with the two lines DEPTH and RATIONALE. "
            "DEPTH is one whole number from 0 to 10."))

    def test_the_scale_of_four_composes_as_it_always_has(self):
        self.assertEqual(
            depth_call.compose("defined-behaviour", self.registry, RETAINED),
            depth_call.compose("defined-behaviour", self.registry, RETAINED, scale=4))
        _system, user = depth_call.compose("defined-behaviour", self.registry, RETAINED,
                                           conflict_rules=RULES)
        self.assertNotIn("general rules for conflicts", user)
        self.assertTrue(user.endswith("\n\nAnswer with the two lines DEPTH and RATIONALE."))

    def test_the_rules_block_follows_the_passages_on_the_scale_of_ten(self):
        _system, user = depth_call.compose("defined-behaviour", self.registry, RETAINED,
                                           scale=10, conflict_rules=RULES)
        self.assertIn("general rules for conflicts between its own rules (1):\n"
                      "[R1] (§ X > Y) A higher rule prevails.", user)
        self.assertLess(user.index("[2] (§ A > C)"), user.index("[R1]"))
        self.assertTrue(user.endswith(
            "\n\nAnswer with the two lines DEPTH and RATIONALE. "
            "DEPTH is one whole number from 0 to 10."))

    def test_an_empty_rules_block_says_so(self):
        _system, user = depth_call.compose("defined-behaviour", self.registry, RETAINED,
                                           scale=10)
        self.assertIn("(0):\n(none were identified)", user)


class ParseOutOfTenTest(unittest.TestCase):
    def test_every_whole_number_to_ten_is_a_depth(self):
        for n in range(11):
            with self.subTest(n=n):
                self.assertEqual(depth_call.parse(f"DEPTH: {n}\nRATIONALE: x", scale=10),
                                 (n, "x"))

    def test_eleven_and_a_half_step_are_not_depths(self):
        self.assertIsNone(depth_call.parse("DEPTH: 11", scale=10)[0])
        self.assertIsNone(depth_call.parse("DEPTH: 7.5", scale=10)[0])

    def test_the_denominator_of_ten_and_the_words_of_the_scale_still_answer(self):
        for line, n in (("DEPTH: 10/10", 10), ("DEPTH: 8 of 10", 8),
                        ("DEPTH: 10, bounded.", 10), ("DEPTH: 9 (two conditions met)", 9)):
            with self.subTest(line=line):
                self.assertEqual(depth_call.parse(line, scale=10)[0], n)

    def test_a_judge_still_counting_out_of_four_is_not_read_as_answering(self):
        self.assertIsNone(depth_call.parse("DEPTH: 3/4", scale=10)[0])
        self.assertIsNone(depth_call.parse("DEPTH: 3 of 4", scale=10)[0])

    def test_roman_numerals_to_ten(self):
        for numeral, n in (("X", 10), ("IX", 9), ("VIII", 8), ("VII", 7), ("VI", 6),
                           ("V", 5), ("IV", 4), ("I", 1)):
            with self.subTest(numeral=numeral):
                self.assertEqual(depth_call.parse(f"DEPTH: {numeral}", scale=10)[0], n)
        self.assertIsNone(depth_call.parse("DEPTH: XI", scale=10)[0])

    def test_the_scale_of_four_is_unchanged_by_default(self):
        self.assertIsNone(depth_call.parse("DEPTH: 9")[0])
        self.assertIsNone(depth_call.parse("DEPTH: V")[0])
        self.assertEqual(depth_call.parse("DEPTH: 3/4")[0], 3)


if __name__ == "__main__":
    unittest.main()
