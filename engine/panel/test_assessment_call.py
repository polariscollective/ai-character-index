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

    def test_no_passages_cited(self):
        reply = CRITERIA_REPLY.replace("CONFLICT_RULES_PASSAGES: 1, 3, 1, 9",
                                       "CONFLICT_RULES_PASSAGES: none")
        self.assertEqual(assessment_call.parse_criteria(reply, 3)["conflict_rule_passages"], [])

    def test_an_empty_reply_gives_nothing(self):
        parsed = assessment_call.parse_criteria("", 3)
        self.assertEqual(set(parsed["scores"].values()), {None})
        self.assertFalse(parsed["complete"])


class ParseContradictionsTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
