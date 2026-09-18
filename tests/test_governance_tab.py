"""The governance view says the same numbers in its sentences as in its tables.

site/governance.json holds every score and the text of the research note, and
the overview's governance board is built from it. The board writes each
profile's opening line from the sums, but some sentences of the note quote
numbers in words: the first finding quotes two sums, and each profile's
paragraph on supporting practices scores every practice in parentheses. Nothing
computes those sentences, so this holds them to the scores.

It also holds the file to the research note it was transcribed from (Notion,
"Spec governance ranking", second pass of 18 September 2026, nine labs): the
ranking's order, and the claims the findings make about whole columns.

No network, no keys. Run: python3 -m unittest discover -s tests
"""
import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "site" / "governance.json").read_text(encoding="utf-8"))
PAGE = (ROOT / "site" / "overview.html").read_text(encoding="utf-8")

# The research note's own order. Meta and xAI tie on 5 and Meta is placed
# sixth on the supporting practices.
NOTE_ORDER = ["openai", "anthropic", "alibaba", "google", "mistral", "meta", "xai",
              "moonshot", "deepseek"]
OPEN_WEIGHTS = {"mistral", "moonshot", "deepseek"}
QUESTIONS = [question["id"] for question in DATA["questions"]]


def totals(lab):
    scores = DATA["scores"][lab]
    by_question = {question["id"]: sum(scores[check["id"]] for check in question["checks"])
                   for question in DATA["questions"]}
    return by_question, sum(by_question.values())


def maximum(question_id):
    question = next(q for q in DATA["questions"] if q["id"] == question_id)
    return 4 * len(question["checks"])


class GovernancePanel(HTMLParser):
    """Collects the text of the governance panel in site/overview.html."""

    # Tags with no end tag would otherwise count as opened and never closed.
    VOID = {"br", "hr", "img", "input", "meta", "link", "wbr", "source"}

    def __init__(self):
        super().__init__()
        self.depth = 0          # nesting inside #view-governance, 0 outside it
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID:
            return
        if self.depth:
            self.depth += 1
        elif dict(attrs).get("id") == "view-governance":
            self.depth = 1

    def handle_endtag(self, tag):
        if tag not in self.VOID and self.depth:
            self.depth -= 1

    def handle_data(self, data):
        if self.depth:
            self.text.append(data)


PANEL = GovernancePanel()
PANEL.feed(PAGE)


class TheData(unittest.TestCase):
    def test_every_lab_is_scored_on_every_check_from_0_to_4(self):
        checks = [check["id"] for question in DATA["questions"] for check in question["checks"]]
        self.assertEqual(len(checks), 10)
        for lab in (lab["id"] for lab in DATA["labs"]):
            self.assertEqual(sorted(DATA["scores"][lab]), sorted(checks), lab)
            for check, score in DATA["scores"][lab].items():
                self.assertIn(score, range(5), f"{lab} {check}")

    def test_supporting_totals_are_within_0_to_10(self):
        for lab in (lab["id"] for lab in DATA["labs"]):
            self.assertIn(DATA["supporting_totals"][lab], range(11), lab)

    def test_the_questions_are_worth_40(self):
        self.assertEqual([maximum(q) for q in QUESTIONS], [12, 12, 8, 8])

    def test_the_ranking_is_the_notes(self):
        order = sorted((lab["id"] for lab in DATA["labs"]),
                       key=lambda lab: (-totals(lab)[1], -DATA["supporting_totals"][lab]))
        self.assertEqual(order, NOTE_ORDER)
        # The note prints Moonshot AI's total as 3, but its own four question
        # scores for it are 1, 2, 1 and 0, and its matrix agrees: they add to 4.
        # The board computes totals, so it shows 4.
        self.assertEqual([totals(lab)[1] for lab in order], [23, 22, 10, 9, 6, 5, 5, 4, 2])

    def test_the_labs_marked_open_weights_are_the_notes(self):
        marked = {lab["id"] for lab in DATA["labs"] if lab.get("open_weights")}
        self.assertEqual(marked, OPEN_WEIGHTS)


class TheProseAgreesWithTheData(unittest.TestCase):
    def test_every_lab_has_a_paragraph_for_every_question(self):
        for lab in NOTE_ORDER:
            profile = DATA["profiles"][lab]
            for question in QUESTIONS + ["supporting"]:
                self.assertTrue(profile.get(question, "").strip(), f"{lab} on {question}")

    def test_each_supporting_paragraph_scores_its_practices_to_its_total(self):
        # "... under CC0 (2). ... after GPT-5.4 Thinking ... (1). ..." Every
        # practice a paragraph scores carries its points in parentheses.
        for lab in NOTE_ORDER:
            stated = sum(int(n) for n in re.findall(r"\((\d)\)", DATA["profiles"][lab]["supporting"]))
            self.assertEqual(stated, DATA["supporting_totals"][lab], lab)

    def test_the_first_finding_quotes_the_combined_minimum(self):
        # "The best combined score is OpenAI's, 15 out of 24. Anthropic ... scores 12."
        combined = {lab: totals(lab)[0]["1"] + totals(lab)[0]["2"] for lab in NOTE_ORDER}
        self.assertEqual(max(combined.values()), combined["openai"])
        first = DATA["findings"][0]["text"]
        self.assertIn(f"OpenAI's, {combined['openai']} out of 24", first)
        self.assertIn(f"scores {combined['anthropic']}.", first)
        # "across all nine, the best score on it is 7 out of 12"
        best_log = max(totals(lab)[0]["2"] for lab in NOTE_ORDER)
        self.assertIn(f"the best score on it is {best_log} out of 12", first)

    def test_the_open_weights_finding_quotes_the_totals(self):
        # "Mistral's 6, Moonshot AI's 4, DeepSeek's 2, and ... Meta's 5"
        text = next(f["text"] for f in DATA["findings"] if "Moonshot AI's" in f["text"])
        for lab, label in (("mistral", "Mistral's"), ("moonshot", "Moonshot AI's"),
                           ("deepseek", "DeepSeek's"), ("meta", "Meta's")):
            self.assertIn(f"{label} {totals(lab)[1]}", text, lab)

    def test_the_findings_on_whole_columns_hold(self):
        # "On the check that asks for a comment period, every company scores 0 or 1"
        # and, on special deployments, "every company scores 0 or 1 on it".
        for check in ("4.2", "1.3"):
            self.assertTrue(all(DATA["scores"][lab][check] in (0, 1) for lab in NOTE_ORDER), check)

    def test_there_are_eight_findings(self):
        self.assertEqual(len(DATA["findings"]), 8)
        for finding in DATA["findings"]:
            self.assertTrue(finding["title"] and finding["text"], finding)


class HouseRules(unittest.TestCase):
    def test_the_words_of_the_first_version_are_gone(self):
        # The first version invented plain words for the note's terms; the note's
        # own terms are the ones readers will meet elsewhere, so they are used.
        text = json.dumps(DATA, ensure_ascii=False) + "".join(PANEL.text)
        for word in ("rulebook", "firm limit", "change record", "standing instructions"):
            self.assertNotIn(word, text.lower(), word)

    def test_no_long_dash_in_the_view_or_its_data(self):
        long_dash = re.compile("[\\u2013\\u2014]")
        self.assertIsNone(long_dash.search("".join(PANEL.text)))
        self.assertIsNone(long_dash.search(json.dumps(DATA, ensure_ascii=False)))


if __name__ == "__main__":
    unittest.main()
