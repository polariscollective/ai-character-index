"""The governance view says the same numbers in its sentences as in its tables.

site/governance.json holds every score and the text of the research note, and
the overview's governance board is built from it. The board writes each
profile's opening line from the averages, but some sentences of the note quote
numbers in words: the first finding quotes two averages, and each profile's
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
from decimal import Decimal, ROUND_HALF_UP
from statistics import mean
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "site" / "governance.json").read_text(encoding="utf-8"))
PAGE = (ROOT / "site" / "overview.html").read_text(encoding="utf-8")

# The research note's own order. OpenAI and Anthropic now tie on both the
# overall score and the best practices, and share first place; the best
# practices still place Meta ahead of xAI.
NOTE_ORDER = ["openai", "anthropic", "alibaba", "google", "mistral", "meta", "xai",
              "moonshot", "deepseek"]
OPEN_WEIGHTS = {"mistral", "moonshot", "deepseek"}
QUESTIONS = [question["id"] for question in DATA["questions"]]


def totals(lab):
    # A question is the average of its checks, 0 to 4; the overall score is the
    # sum of the four questions, out of 16.
    scores = DATA["scores"][lab]
    by_question = {question["id"]: mean(scores[check["id"]] for check in question["checks"])
                   for question in DATA["questions"]}
    return by_question, sum(by_question.values())


def shown(value):
    # What the board prints: one decimal, a half rounded up, as toFixed does
    # for every figure the board has.
    return str(Decimal(repr(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


ASKED = [practice for practice in DATA["internal"] if practice.get("asked_to_publish")]
AUDIT_ONLY = [practice for practice in DATA["internal"] if not practice.get("asked_to_publish")]


def rank(lab):
    # One more than the number of labs ahead on the overall score, or level on
    # it and ahead on the best practices. Labs level on both share a place.
    key = (round(totals(lab)[1], 9), supporting(lab))
    return 1 + sum(1 for other in NOTE_ORDER
                   if (round(totals(other)[1], 9), supporting(other)) > key)


def supporting(lab):
    # The best practices: the five anyone can check, and the four only the
    # company can show, scored on what it publishes.
    return (sum(DATA["supporting_scores"][lab][practice["id"]] for practice in DATA["supporting"])
            + sum(DATA["internal_scores"][lab][practice["id"]] for practice in ASKED))


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

    def test_every_lab_is_scored_on_every_supporting_practice_from_0_to_2(self):
        practices = [practice["id"] for practice in DATA["supporting"]]
        self.assertEqual(len(practices), 5)
        for lab in (lab["id"] for lab in DATA["labs"]):
            self.assertEqual(sorted(DATA["supporting_scores"][lab]), sorted(practices), lab)
            for practice, score in DATA["supporting_scores"][lab].items():
                self.assertIn(score, range(3), f"{lab} {practice}")

    def test_a_note_on_a_practice_names_a_practice_that_scored(self):
        # The one note says where the research note's unnamed point for Google
        # was filed; a note on a practice scored 0 would be explaining nothing.
        for lab, notes in DATA["supporting_notes"].items():
            for practice, note in notes.items():
                self.assertGreater(DATA["supporting_scores"][lab][practice], 0, f"{lab} {practice}")
                self.assertTrue(note.strip())

    def test_what_only_an_audit_could_show_carries_no_score(self):
        # The paper asks companies to publish four of the five practices only a
        # company can show, and those are scored on what it publishes. The fifth
        # it does not, no audit has been done, and nothing may score it.
        self.assertEqual([p["id"] for p in ASKED], ["I1", "I2", "I3", "I4"])
        self.assertEqual([p["id"] for p in AUDIT_ONLY], ["I5"])
        for lab in NOTE_ORDER:
            self.assertEqual(sorted(DATA["internal_scores"][lab]), ["I1", "I2", "I3", "I4"], lab)
        for practice in DATA["internal"]:
            for field in ("id", "short", "label", "source", "audit"):
                self.assertTrue(practice.get(field, "").strip(), f"{practice['id']} {field}")
        ids = [practice["id"] for practice in DATA["supporting"] + DATA["internal"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_every_question_weighs_the_same(self):
        # Averages, so a question of three checks and one of two both run from 0
        # to 4, and each is a quarter of the overall score.
        self.assertEqual([len(q["checks"]) for q in DATA["questions"]], [3, 3, 2, 2])
        for lab in NOTE_ORDER:
            by_question, overall = totals(lab)
            self.assertTrue(all(0 <= value <= 4 for value in by_question.values()), lab)
            self.assertAlmostEqual(overall, sum(by_question.values()))
            self.assertLessEqual(overall, 16)

    def test_the_ranking_is_the_notes(self):
        order = sorted((lab["id"] for lab in DATA["labs"]),
                       key=lambda lab: (-totals(lab)[1], -supporting(lab)))
        self.assertEqual(order, NOTE_ORDER)
        # OpenAI and Anthropic tie exactly, as do Meta and xAI. The best
        # practices put Meta ahead of xAI, the way the note broke its own tie,
        # but OpenAI and Anthropic are level on those too, so they share first
        # place and the rank after them is third.
        self.assertEqual([shown(totals(lab)[1]) for lab in order],
                         ["9.0", "9.0", "4.3", "3.8", "2.7", "2.0", "2.0", "1.5", "0.8"])
        self.assertEqual([rank(lab) for lab in order], [1, 1, 3, 4, 5, 6, 7, 8, 9])

    def test_the_labs_marked_open_weights_are_the_notes(self):
        marked = {lab["id"] for lab in DATA["labs"] if lab.get("open_weights")}
        self.assertEqual(marked, OPEN_WEIGHTS)


class WhatOnlyTheCompanyCanShow(unittest.TestCase):
    """Four practices are scored on what each company publishes, 0 when it
    publishes nothing. Every score says why in a sentence, and every score above
    0 rests on at least one passage the company published, with its address."""

    def test_every_score_is_0_1_or_2_and_says_why(self):
        for lab in NOTE_ORDER:
            for practice in ASKED:
                score = DATA["internal_scores"][lab][practice["id"]]
                found = DATA["internal_evidence"][lab][practice["id"]]
                self.assertIn(score, range(3), f"{lab} {practice['id']}")
                self.assertTrue(found["sentence"].strip(), f"{lab} {practice['id']}")
                self.assertIsNone(re.search(r"\(\d\)", found["sentence"]), f"{lab} {practice['id']}")

    def test_a_score_above_0_rests_on_something_published(self):
        for lab in NOTE_ORDER:
            for practice in ASKED:
                score = DATA["internal_scores"][lab][practice["id"]]
                sources = DATA["internal_evidence"][lab][practice["id"]]["sources"]
                if score:
                    self.assertTrue(sources, f"{lab} {practice['id']}")
                for source in sources:
                    self.assertTrue(source["url"].startswith("https://"), source["url"])
                    self.assertTrue(source["quote"].strip() and source["title"].strip() and source["date"].strip())

    def test_each_practice_says_what_its_scores_mean(self):
        for practice in ASKED:
            self.assertEqual(sorted(practice["anchors"]), ["0", "1", "2"], practice["id"])
        self.assertTrue(DATA["disclosure_note"].strip() and DATA["disclosed_intro"].strip())


class ThePapersBehindEachRow(unittest.TestCase):
    """Every question, check and practice carries what it asks, in our words, and
    the passages of the working papers it rests on. The passages were cut out of
    the papers by script rather than typed, and the papers are not in this
    repository, so what can be held here is their shape: each names a paper the
    data describes, says where in it, and quotes something."""

    ROWS = ([question for question in DATA["questions"]]
            + [check for question in DATA["questions"] for check in question["checks"]]
            + DATA["supporting"] + DATA["internal"])

    def test_the_papers_are_described(self):
        self.assertEqual(sorted(DATA["papers"]), ["kembery", "memo"])
        for paper in DATA["papers"].values():
            for field in ("title", "by", "status"):
                self.assertTrue(paper.get(field, "").strip(), field)

    def test_every_row_has_a_reading_and_the_passages_behind_it(self):
        self.assertEqual(len(self.ROWS), 24)
        for row in self.ROWS:
            self.assertTrue(row.get("reading", "").strip(), row["id"])
            self.assertTrue(row.get("quotes"), row["id"])
            for quote in row["quotes"]:
                self.assertIn(quote["paper"], DATA["papers"], row["id"])
                self.assertTrue(quote["where"].strip() and quote["text"].strip(), row["id"])

    def test_the_questions_and_checks_quote_the_memo_and_the_practices_kembery(self):
        # The four questions are the memo's four asks, so each quotes the memo;
        # the practices come from Kembery and colleagues, so each quotes them.
        for question in DATA["questions"]:
            self.assertIn("memo", {quote["paper"] for quote in question["quotes"]}, question["id"])
        for practice in DATA["supporting"] + DATA["internal"]:
            self.assertEqual({quote["paper"] for quote in practice["quotes"]}, {"kembery"}, practice["id"])


class TheProseAgreesWithTheData(unittest.TestCase):
    def test_every_lab_has_a_paragraph_for_every_question(self):
        for lab in NOTE_ORDER:
            profile = DATA["profiles"][lab]
            for question in QUESTIONS + ["supporting"]:
                self.assertTrue(profile.get(question, "").strip(), f"{lab} on {question}")

    def test_each_supporting_paragraph_scores_its_practices_in_their_order(self):
        # "... under CC0 (2). ... after GPT-5.4 Thinking ... (1). ..." Every
        # practice a paragraph scores carries its points in parentheses, and the
        # paragraphs take the practices in order, S1 to S5. Some name a practice
        # they score 0 and some leave it out, so the zeros are set aside: what
        # is left must be the lab's practice scores that are not 0, in order.
        for lab in NOTE_ORDER:
            stated = [int(n) for n in re.findall(r"\((\d)\)", DATA["profiles"][lab]["supporting"])]
            scored = [DATA["supporting_scores"][lab][practice["id"]] for practice in DATA["supporting"]]
            self.assertEqual([n for n in stated if n], [n for n in scored if n], lab)
            self.assertEqual(sum(stated), sum(scored), lab)

    def test_the_first_finding_quotes_the_combined_minimum(self):
        # "OpenAI has the best pair, 2.7 on the specification and 2.3 on the
        # change log. Anthropic ... scores 3.0 and 1.0."
        combined = {lab: totals(lab)[0]["1"] + totals(lab)[0]["2"] for lab in NOTE_ORDER}
        self.assertEqual(max(combined.values()), combined["openai"])
        first = DATA["findings"][0]["text"]
        openai, anthropic = totals("openai")[0], totals("anthropic")[0]
        self.assertIn(f"OpenAI has the best pair, {shown(openai['1'])} on the specification "
                      f"and {shown(openai['2'])} on the change log", first)
        self.assertIn(f"scores {shown(anthropic['1'])} and {shown(anthropic['2'])}.", first)
        # The minimum is the first two questions, and the finding says what
        # meeting it means on the board's own scale.
        self.assertEqual([q["id"] for q in DATA["questions"] if q.get("minimum")], ["1", "2"])
        self.assertIn("4 out of 4 on both questions", first)
        # "across all nine, the best score on it is 2.3 out of 4"
        best_log = max(totals(lab)[0]["2"] for lab in NOTE_ORDER)
        self.assertIn(f"the best score on it is {shown(best_log)} out of 4", first)

    def test_the_open_weights_finding_quotes_the_totals(self):
        # "Mistral's 2.7, Moonshot AI's 1.5, DeepSeek's 0.8, and ... Meta's 2.0"
        text = next(f["text"] for f in DATA["findings"] if "Moonshot AI's" in f["text"])
        for lab, label in (("mistral", "Mistral's"), ("moonshot", "Moonshot AI's"),
                           ("deepseek", "DeepSeek's"), ("meta", "Meta's")):
            self.assertIn(f"{label} {shown(totals(lab)[1])}", text, lab)

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
