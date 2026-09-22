"""Composing and parsing the two calls that assess a document as a whole.
Nothing touches a network."""
import hashlib
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import assessment_call           # noqa: E402

PASSAGES = [("doc > #a > ¶1", "A", "In a conflict, safety comes first."),
            ("doc > #b > ¶1", "B", "Never lie."),
            ("doc > #b > ¶2", "B", "Keep the operator's instructions private.")]

CRITERIA_REPLY = """CONFLICT_RULES: 2
CONFLICT_RULES_PASSAGES: 1, 3, 1, 9
CONFLICT_RULES_RATIONALE: An order of priority, weighed rather than decided.
RULE_FORCE: 3
RULE_FORCE_RATIONALE: Most sections carry a level.
REASONS: 4
REASONS_RATIONALE: Nearly every rule says why.
SITUATIONS: 1
SITUATIONS_RATIONALE: Conversation and customised deployments only."""

CONTRADICTIONS_REPLY = """CONTRADICTION: [2] [3] | A user asks what the operator told the model. | One passage forbids any lie, the other asks for silence the user would find misleading.
CONTRADICTION: [1] [2] | A lie would prevent harm. | Safety comes first, and lying is never allowed.
CONTRADICTIONS: 2
CONTRADICTIONS_RATIONALE: Two clashes, neither on an absolute rule."""


class PromptTest(unittest.TestCase):
    def test_each_question_has_its_own_prompt_file_and_digest(self):
        for question in assessment_call.QUESTIONS:
            with self.subTest(question=question):
                path = HERE / "prompts" / f"assessment-{question}-v1.txt"
                self.assertEqual(assessment_call.system_prompt(question), path.read_text())
                self.assertEqual(assessment_call.prompt_sha256(question),
                                 hashlib.sha256(path.read_bytes()).hexdigest())

    def test_questions_stays_criteria_and_contradictions(self):
        # PROMPTS gains "confirm", but QUESTIONS is the two questions a document
        # is scored on; "confirm" is a follow-up call, not a third question.
        self.assertEqual(assessment_call.QUESTIONS, ("criteria", "contradictions"))

    def test_the_confirm_prompt_matches_the_file_and_has_no_long_dash(self):
        path = HERE / "prompts" / "assessment-confirm-v1.txt"
        text = assessment_call.system_prompt("confirm")
        self.assertEqual(text, path.read_text())
        self.assertEqual(assessment_call.prompt_sha256("confirm"),
                         hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertNotIn("—", text)
        self.assertNotIn("–", text)

    def test_the_contradictions_prompt_requires_a_strict_order(self):
        text = assessment_call.system_prompt("contradictions")
        self.assertIn("strict and places the two rules at different ranks", text)

    def test_the_criteria_prompt_caps_a_vague_conflict_rule_at_two(self):
        text = assessment_call.system_prompt("criteria")
        self.assertIn("Either is at most 2, however detailed.", text)

    def test_no_prompt_carries_a_long_dash(self):
        for question in assessment_call.QUESTIONS:
            with self.subTest(question=question):
                text = assessment_call.system_prompt(question)
                self.assertNotIn("—", text)
                self.assertNotIn("–", text)

    def test_the_whole_document_is_numbered_in_order(self):
        _system, user = assessment_call.compose("criteria", PASSAGES)
        self.assertIn("3 numbered passages", user)
        self.assertIn("[1] (§ A) In a conflict, safety comes first.\n"
                      "[2] (§ B) Never lie.\n"
                      "[3] (§ B) Keep the operator's instructions private.", user)

    def test_an_unknown_question_is_refused(self):
        with self.assertRaises(KeyError):
            assessment_call.compose("everything", PASSAGES)


class ParseCriteriaTest(unittest.TestCase):
    def test_a_well_formed_reply(self):
        parsed = assessment_call.parse_criteria(CRITERIA_REPLY, len(PASSAGES))
        self.assertEqual(parsed["scores"], {"conflict_rules": 2, "rule_force": 3,
                                            "reasons": 4, "situations": 1})
        self.assertEqual(parsed["rationales"]["reasons"], "Nearly every rule says why.")
        # Out of range (9) is dropped, a repeat (1) is kept once, order is kept.
        self.assertEqual(parsed["conflict_rule_passages"], [1, 3])
        self.assertTrue(parsed["complete"])

    def test_markdown_around_the_labels_is_read_through(self):
        reply = "**CONFLICT_RULES:** 2\n- RULE_FORCE: **3**\n`REASONS: 4`\n1. SITUATIONS: 0"
        self.assertEqual(assessment_call.parse_criteria(reply, 3)["scores"],
                         {"conflict_rules": 2, "rule_force": 3, "reasons": 4, "situations": 0})

    def test_a_score_off_the_scale_is_not_a_score(self):
        parsed = assessment_call.parse_criteria(CRITERIA_REPLY.replace("REASONS: 4", "REASONS: 5"), 3)
        self.assertIsNone(parsed["scores"]["reasons"])
        self.assertFalse(parsed["complete"])

    def test_a_denominator_or_a_parenthetical_still_answers(self):
        reply = "CONFLICT_RULES: 3/4\nRULE_FORCE: 2 of 4\nREASONS: 1 (some reasons)\nSITUATIONS: 4."
        self.assertEqual(assessment_call.parse_criteria(reply, 3)["scores"],
                         {"conflict_rules": 3, "rule_force": 2, "reasons": 1, "situations": 4})

    def test_prose_after_a_label_does_not_blank_a_score(self):
        reply = CRITERIA_REPLY + "\nREASONS: the reasons are mostly given in commentary."
        self.assertEqual(assessment_call.parse_criteria(reply, 3)["scores"]["reasons"], 4)

    def test_a_roman_numeral_is_read_as_its_figure(self):
        # deepseek answered RULE_FORCE: III on the Alibaba Model Spec in run
        # b4acc896, as it has answered DEPTH: III before.
        reply = "CONFLICT_RULES: IV\nRULE_FORCE: III\nREASONS: II.\nSITUATIONS: I (few)"
        parsed = assessment_call.parse_criteria(reply, 3)
        self.assertEqual(parsed["scores"],
                         {"conflict_rules": 4, "rule_force": 3, "reasons": 2, "situations": 1})
        self.assertTrue(parsed["complete"])

    def test_a_roman_numeral_off_the_scale_is_not_a_score(self):
        parsed = assessment_call.parse_criteria(CRITERIA_REPLY.replace("REASONS: 4", "REASONS: V"), 3)
        self.assertIsNone(parsed["scores"]["reasons"])

    def test_prose_opening_with_the_word_i_does_not_blank_a_score(self):
        reply = CRITERIA_REPLY + "\nREASONS: I would say most rules give their reasons."
        self.assertEqual(assessment_call.parse_criteria(reply, 3)["scores"]["reasons"], 4)

    def test_no_passages_cited(self):
        reply = CRITERIA_REPLY.replace("CONFLICT_RULES_PASSAGES: 1, 3, 1, 9",
                                       "CONFLICT_RULES_PASSAGES: none")
        self.assertEqual(assessment_call.parse_criteria(reply, 3)["conflict_rule_passages"], [])

    def test_an_empty_reply_gives_nothing(self):
        parsed = assessment_call.parse_criteria("", 3)
        self.assertEqual(set(parsed["scores"].values()), {None})
        self.assertFalse(parsed["complete"])


class ParseContradictionsTest(unittest.TestCase):
    def test_a_roman_numeral_score_is_read_as_its_figure(self):
        reply = CONTRADICTIONS_REPLY.replace("CONTRADICTIONS: 2", "CONTRADICTIONS: II")
        self.assertNotEqual(reply, CONTRADICTIONS_REPLY)
        self.assertEqual(assessment_call.parse_contradictions(reply, len(PASSAGES))["score"], 2)

    def test_a_well_formed_reply(self):
        parsed = assessment_call.parse_contradictions(CONTRADICTIONS_REPLY, len(PASSAGES))
        self.assertEqual(parsed["score"], 2)
        self.assertEqual(parsed["rationale"], "Two clashes, neither on an absolute rule.")
        self.assertEqual([(i["first"], i["second"]) for i in parsed["items"]], [(2, 3), (1, 2)])
        self.assertEqual(parsed["items"][1]["situation"], "A lie would prevent harm.")
        self.assertEqual(parsed["unreadable"], 0)
        self.assertTrue(parsed["complete"])

    def test_none_found(self):
        parsed = assessment_call.parse_contradictions(
            "CONTRADICTION: none\nCONTRADICTIONS: 4\nCONTRADICTIONS_RATIONALE: None found.", 3)
        self.assertEqual((parsed["score"], parsed["items"], parsed["unreadable"]), (4, [], 0))

    def test_an_item_that_does_not_name_two_passages_is_unreadable(self):
        reply = ("CONTRADICTION: [2] | only one passage | why\n"
                 "CONTRADICTION: [2] [2] | the same passage twice | why\n"
                 "CONTRADICTION: [2] [7] | a passage that does not exist | why\n"
                 "CONTRADICTION: [1] [2] no separators at all\n"
                 "CONTRADICTIONS: 3")
        parsed = assessment_call.parse_contradictions(reply, 3)
        self.assertEqual((parsed["items"], parsed["unreadable"]), ([], 4))

    def test_no_more_than_eight_are_kept(self):
        reply = "\n".join(f"CONTRADICTION: [1] [2] | situation {n} | why" for n in range(12))
        parsed = assessment_call.parse_contradictions(reply + "\nCONTRADICTIONS: 0", 3)
        self.assertEqual(len(parsed["items"]), assessment_call.MAX_CONTRADICTIONS)

    def test_a_missing_score_is_incomplete(self):
        parsed = assessment_call.parse_contradictions("CONTRADICTION: none", 3)
        self.assertIsNone(parsed["score"])
        self.assertFalse(parsed["complete"])

    def test_none_found_with_trailing_words_is_still_none(self):
        parsed = assessment_call.parse_contradictions(
            "CONTRADICTION: none found.\nCONTRADICTIONS: 4", 3)
        self.assertEqual((parsed["items"], parsed["unreadable"], parsed["score"]), ([], 0, 4))


class ComposeConfirmTest(unittest.TestCase):
    def test_the_numbered_document_comes_first_and_claims_are_numbered(self):
        claims = [{"first": 2, "second": 3, "situation": "S", "why": "W"}]
        system, user = assessment_call.compose_confirm(PASSAGES, claims)
        self.assertEqual(system, assessment_call.system_prompt("confirm"))
        self.assertTrue(user.startswith(
            "The complete document, as 3 numbered passages in order:\n"
            "[1] (§ A) In a conflict, safety comes first.\n"
            "[2] (§ B) Never lie.\n"
            "[3] (§ B) Keep the operator's instructions private."))
        self.assertIn("\n\nClaimed contradictions (1):\n[1] passages [2] and [3] | S | W",
                      user)
        self.assertTrue(user.endswith(
            "Answer with one ITEM line per claim, in the order given."))

    def test_compose_criteria_is_unaffected_by_the_confirm_helper(self):
        system, user = assessment_call.compose("criteria", PASSAGES)
        self.assertEqual(system, assessment_call.system_prompt("criteria"))
        self.assertTrue(user.startswith("The complete document, as 3 numbered passages in order:\n"
                                        "[1] (§ A) In a conflict, safety comes first.\n"
                                        "[2] (§ B) Never lie.\n"
                                        "[3] (§ B) Keep the operator's instructions private."))
        self.assertTrue(user.endswith(assessment_call.ASK["criteria"]))


class ParseConfirmTest(unittest.TestCase):
    def test_a_well_formed_reply(self):
        reply = ("ITEM 1: holds | absolute: yes | R1\n"
                 "**ITEM 2:** does not hold | absolute: no | Settled in 4.")
        self.assertEqual(assessment_call.parse_confirm(reply, 2),
                         {1: {"holds": True, "absolute": True, "reason": "R1"},
                          2: {"holds": False, "absolute": False, "reason": "Settled in 4."}})

    def test_unreadable_or_out_of_range_items_are_skipped(self):
        reply = "ITEM 3: maybe | absolute: no | x\nITEM 9: holds | absolute: no | x"
        self.assertEqual(assessment_call.parse_confirm(reply, 2), {})

    def test_a_later_line_for_the_same_item_wins(self):
        reply = ("ITEM 1: holds | absolute: yes | first\n"
                 "ITEM 1: does not hold | absolute: no | second")
        self.assertEqual(assessment_call.parse_confirm(reply, 1),
                         {1: {"holds": False, "absolute": False, "reason": "second"}})


class HeadingAttributesTest(unittest.TestCase):
    MARKDOWN = "# Truth\n\n## Do not lie {#do_not_lie authority=user}\n\nNever lie.\n"

    def test_a_heading_anchor_gains_its_attributes(self):
        passages = [("doc@v > #do_not_lie > ¶1", "Truth > Do not lie", "Never lie.")]
        out = assessment_call.with_heading_attributes(passages, self.MARKDOWN)
        self.assertEqual(out, [("doc@v > #do_not_lie > ¶1",
                               "Truth > Do not lie {authority=user}", "Never lie.")])

    def test_a_section_already_carrying_authority_is_unchanged(self):
        passages = [("doc@v > #do_not_lie > ¶1", "Truth > Do not lie {authority=root}",
                     "Never lie.")]
        self.assertEqual(assessment_call.with_heading_attributes(passages, self.MARKDOWN),
                         passages)

    def test_a_heading_path_locator_is_unchanged(self):
        passages = [("doc@v > Truth > Do not lie > ¶1", "Truth > Do not lie", "Never lie.")]
        self.assertEqual(assessment_call.with_heading_attributes(passages, self.MARKDOWN),
                         passages)


if __name__ == "__main__":
    unittest.main()
