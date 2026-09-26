"""The governance view says the same numbers in its sentences as in its tables.

site/governance.json holds every score and the text of the research note, and
the index page's governance board is built from it. The board writes each
profile's opening line from the averages, but some sentences of the note quote
numbers in words: the first finding quotes two averages, the finding on Meta
quotes both group scores, and each profile's paragraphs on the best practices
score every practice in parentheses. Nothing computes those sentences, so this
holds them to the scores.

It also holds the file to the research note it was transcribed from (Notion,
"Spec governance ranking", second pass of 18 September 2026, nine labs), and to
the change made since: one overall score out of 16 became two figures out of 10
side by side, what is published and what it engages, which are never added
together.

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
PAGE = (ROOT / "site" / "boards.html").read_text(encoding="utf-8")

# The board's order: companies are ranked on the final score, the sum of what is
# published and what it engages. Until 24 September 2026 they were ranked on the
# first figure alone, which was the research note's own order. Six check scores
# were corrected the same day, which swapped the first two places and moved Meta
# and Mistral AI. A second audit then took Meta's practice on change approval to
# 0, because the clause the board quoted puts the approval it names on model
# deployment rather than on a change to the framework, and that dropped Meta from
# fourth place to sixth. The audit of 25 September 2026 corrected twenty-six
# scores across seven companies: OpenAI moved into first place, xAI from fifth
# to fourth, Alibaba from fourth to fifth, and Moonshot AI from seventh to
# eighth, below Mistral AI. On 26 September 2026 nine rules were written down
# for cases the descriptions left open, and four corrections to Anthropic's rows
# were approved: xAI moved from fourth to third, above Google DeepMind, and
# DeepSeek from ninth to eighth, above Moonshot AI.
ORDER = ["openai", "anthropic", "xai", "google", "alibaba", "meta", "mistral",
         "deepseek", "moonshot"]
OPEN_WEIGHTS = {"alibaba", "mistral", "moonshot", "deepseek"}
QUESTIONS = [question["id"] for question in DATA["questions"]]

SCALE = 4       # a question, and each of its checks
PRACTICE = 2    # a best practice, wherever it is counted
CHECKS = [check for question in DATA["questions"] for check in question["checks"]]

ASKED = [practice for practice in DATA["internal"] if practice.get("asked_to_publish")]
AUDIT_ONLY = [practice for practice in DATA["internal"] if not practice.get("asked_to_publish")]
COLUMNS = {column["id"]: column for column in DATA["columns"]}


def practice_score(lab, practice_id):
    # A practice is scored in one of the two tables, never both.
    if practice_id in DATA["supporting_scores"][lab]:
        return DATA["supporting_scores"][lab][practice_id]
    return DATA["internal_scores"][lab][practice_id]


def checks_of(question_id):
    return next(q for q in DATA["questions"] if q["id"] == question_id)["checks"]


def totals(lab):
    # A question is the average of its checks, 0 to 4. A column's figure is the
    # mean of its rows' shares of their own maximum, times ten: a check out of 4
    # and a practice out of 2 sit in one column that way without either being
    # rescored, which is why the two columns are never added to each other.
    scores = DATA["scores"][lab]
    by_question = {question["id"]: mean(scores[check["id"]] for check in question["checks"])
                   for question in DATA["questions"]}
    by_column = {}
    for column in DATA["columns"]:
        shares = ([scores[check["id"]] / SCALE
                   for qid in column["questions"] for check in checks_of(qid)]
                  + [practice_score(lab, pid) / PRACTICE for pid in column["practices"]])
        by_column[column["id"]] = mean(shares) * column["out_of"]
    return by_question, by_column


def ranking(lab):
    # The final score: the two figures, averaged with the weights the file gives.
    columns = totals(lab)[1]
    return sum(columns[cid] * weight for cid, weight in DATA["total"]["weights"].items())


def on_ten(value, scale=SCALE):
    # What the board shows for a score given on a scale of its own.
    return value / scale * 10


def published(lab):
    return totals(lab)[1]["published"]


def shown(value):
    # What the board prints: one decimal, a half rounded up, as toFixed does
    # for every figure the board has.
    return str(Decimal(repr(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def rank(lab):
    # One more than the number of labs ahead on the final score. Labs level on
    # it share a place.
    key = round(ranking(lab), 9)
    return 1 + sum(1 for other in ORDER if round(ranking(other), 9) > key)


class GovernancePanel(HTMLParser):
    """Collects the text of the governance panel in site/boards.html."""

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


def plain(markup):
    """A field of the file's light markup as a reader sees it: the marks gone."""
    text = re.sub(r"\[([^\]]+)\]\([^)\s]+\)", r"\1", markup)
    text = text.replace("**", "")
    return re.sub(r"(?m)^(### |- )", "", text)


def page_text(page):
    """Every word of a board's page as governance.json carries it: the title, the
    introduction and each section, tables included."""
    parts = [page["title"], plain(page["intro"])]
    for section in page["sections"]:
        parts.append(section["title"])
        for block in section["blocks"]:
            if isinstance(block, str):
                parts.append(plain(block))
            elif "table" in block:
                parts.extend(plain(cell) for row in [block["table"]["head"], *block["table"]["rows"]]
                             for cell in row)
    return " ".join(parts)


# The panel's prose on one line, the page's markup and the page's words in the
# file together: since 24 September 2026 the file carries every sentence the
# page shows, so a phrase this file quotes is looked for in both.
FLAT = re.sub(r"\s+", " ", "".join(PANEL.text) + " " + page_text(DATA["page"]))


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
        for lab in ORDER:
            self.assertEqual(sorted(DATA["internal_scores"][lab]), ["I1", "I2", "I3", "I4"], lab)
        for practice in DATA["internal"]:
            for field in ("id", "short", "label", "source", "audit"):
                self.assertTrue(practice.get(field, "").strip(), f"{practice['id']} {field}")
        ids = [practice["id"] for practice in DATA["supporting"] + DATA["internal"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_a_question_runs_from_0_to_4_and_a_figure_from_0_to_10(self):
        self.assertEqual([len(q["checks"]) for q in DATA["questions"]], [3, 3, 2, 2])
        for lab in ORDER:
            by_question, by_column = totals(lab)
            self.assertTrue(all(0 <= value <= SCALE for value in by_question.values()), lab)
            for column in DATA["columns"]:
                self.assertTrue(0 <= by_column[column["id"]] <= column["out_of"], lab)


class TheTwoFigures(unittest.TestCase):
    """Every row the board scores is counted in one figure and no other, the two
    are never added, and the practice the paper raises as an open problem is
    counted in neither."""

    def test_the_figures_are_the_two_the_page_names(self):
        self.assertEqual([column["id"] for column in DATA["columns"]], ["published", "engages"])
        self.assertEqual([column["name"] for column in DATA["columns"]],
                         ["What is published", "What it engages"])
        for column in DATA["columns"]:
            for field in ("name", "plain", "about", "prose"):
                self.assertTrue(column.get(field, "").strip(), f"{column['id']} {field}")
            self.assertEqual(column["out_of"], 10)
        # Neither ranks the companies on its own: the final score does.
        self.assertTrue(all("ranks" not in column for column in DATA["columns"]))

    def test_every_scored_row_is_counted_once(self):
        questions = [qid for column in DATA["columns"] for qid in column["questions"]]
        practices = [pid for column in DATA["columns"] for pid in column["practices"]]
        self.assertEqual(sorted(questions), sorted(QUESTIONS))
        self.assertEqual(sorted(practices),
                         sorted([p["id"] for p in DATA["supporting"]] + [p["id"] for p in ASKED]))
        self.assertEqual(len(practices), len(set(practices)))
        # Eleven rows carry what is published, eight what it engages.
        published, engages = DATA["columns"]
        self.assertEqual(len(CHECKS) + len(published["practices"]), 11)
        self.assertEqual(len(engages["practices"]), 8)

    def test_a_column_groups_its_rows_without_changing_them(self):
        # Groups are how the board folds a column's practices, and nothing more:
        # each practice and each unscored row sits in exactly one group, in the
        # column's own order, so the figure is still the mean of every practice.
        for column in DATA["columns"]:
            groups = column.get("groups")
            if not groups:
                continue
            for group in groups:
                for field in ("id", "name", "plain"):
                    self.assertTrue(group.get(field, "").strip(), f"{column['id']} {field}")
                self.assertTrue(group["practices"], group["id"])
            self.assertEqual([pid for group in groups for pid in group["practices"]],
                             column["practices"])
            self.assertEqual([pid for group in groups for pid in group.get("unscored", [])],
                             column.get("unscored", []))
            self.assertEqual(len({group["id"] for group in groups}), len(groups))

    def test_the_unscored_practice_is_in_neither_figure(self):
        unscored = [pid for column in DATA["columns"] for pid in column.get("unscored", [])]
        self.assertEqual(unscored, [practice["id"] for practice in AUDIT_ONLY])
        for column in DATA["columns"]:
            for pid in column.get("unscored", []):
                self.assertNotIn(pid, column["practices"], pid)
        # The note the popovers carry says it, and the row itself says it where
        # it sits, which governance.js writes as the row's second line.
        self.assertIn("counted in neither", DATA["internal_note"])
        self.assertIn("in neither figure", Path(ROOT / "site" / "governance.js")
                      .read_text(encoding="utf-8"))

    def test_the_final_score_averages_the_two(self):
        # Out of 10 like every figure on the board, and the average of the two
        # with weights that add to one, each weight said on the row it weighs.
        total = DATA["total"]
        self.assertEqual(total["out_of"], 10)
        self.assertEqual(sorted(total["weights"]), sorted(COLUMNS))
        self.assertAlmostEqual(sum(total["weights"].values()), 1)
        self.assertIn("ranks the companies", total["plain"])
        self.assertIn("Every figure on the board is out of 10", total["about"])
        self.assertIn("The final score averages the two figures", FLAT)
        self.assertNotIn("never added", FLAT)
        # The page no longer says every practice shares one scale: four carry
        # anchors of their own.
        self.assertNotIn("one scale that covers all of them", FLAT)

    def test_the_ranking_is_the_final_score(self):
        order = sorted((lab["id"] for lab in DATA["labs"]), key=lambda lab: -ranking(lab))
        self.assertEqual(order, ORDER)
        self.assertEqual([shown(ranking(lab)) for lab in order],
                         ["6.3", "6.2", "3.4", "3.0", "2.5", "2.0", "1.7", "1.0", "0.8"])
        self.assertEqual([shown(totals(lab)[1]["published"]) for lab in order],
                         ["7.0", "6.8", "4.3", "3.0", "3.2", "1.6", "3.4", "0.7", "0.9"])
        # OpenAI, Anthropic and Moonshot AI land on exactly 5.625 and 0.625,
        # which the board prints as 5.6 and 0.6, the digit after the half being
        # a 2. DeepSeek lands on exactly 1.25, a true half, printed 1.3.
        self.assertEqual([shown(totals(lab)[1]["engages"]) for lab in order],
                         ["5.6", "5.6", "2.5", "3.1", "1.9", "2.5", "0.0", "1.3", "0.6"])
        # No two companies are level on the final score, so every place is
        # taken once.
        self.assertEqual([rank(lab) for lab in order], [1, 2, 3, 4, 5, 6, 7, 8, 9])

    def test_the_labs_marked_open_weights_are_the_notes(self):
        marked = {lab["id"] for lab in DATA["labs"] if lab.get("open_weights")}
        self.assertEqual(marked, OPEN_WEIGHTS)


class WhatOnlyTheCompanyCanShow(unittest.TestCase):
    """Four practices are scored on what each company publishes, 0 when it
    publishes nothing. Every score says why in a sentence, and every score above
    0 rests on at least one passage the company published, with its address."""

    def test_every_score_is_0_1_or_2_and_says_why(self):
        for lab in ORDER:
            for practice in ASKED:
                score = DATA["internal_scores"][lab][practice["id"]]
                found = DATA["internal_evidence"][lab][practice["id"]]
                self.assertIn(score, range(3), f"{lab} {practice['id']}")
                self.assertTrue(found["sentence"].strip(), f"{lab} {practice['id']}")
                self.assertIsNone(re.search(r"\(\d\)", found["sentence"]), f"{lab} {practice['id']}")

    def test_a_score_above_0_rests_on_something_published(self):
        for lab in ORDER:
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

    def test_a_score_of_nothing_says_that_nothing_was_published(self):
        # A 0 is not a finding that the company does not do it. The note behind
        # every 0, and the description of a 0 on the five anyone can check, both
        # say that we looked and found nothing published.
        self.assertIn("found nothing published", DATA["disclosure_note"])
        self.assertIn("Nothing published", DATA["supporting_scale"]["0"])
        for practice in ASKED:
            self.assertIn("Nothing published", practice["anchors"]["0"], practice["id"])
        self.assertIn("Where nothing is published, the board says nothing is published", FLAT)


class EveryRowCarriesItsSource(unittest.TestCase):
    """Until 24 September 2026 only the four practices a company alone can show
    carried a quoted passage with its address. The ten checks and the five
    practices anyone can check carried prose and nothing else, which is where
    the errors were. Each of them now carries the same structure: the passages
    the score rests on, or a sentence saying where we looked and found
    nothing."""

    ROWS = [check["id"] for check in CHECKS] + [practice["id"] for practice in DATA["supporting"]]

    def test_every_company_carries_every_row(self):
        self.assertEqual(len(self.ROWS), 15)
        self.assertEqual(sorted(DATA["evidence"]), sorted(ORDER))
        for lab in ORDER:
            self.assertEqual(sorted(DATA["evidence"][lab]), sorted(self.ROWS), lab)

    def test_a_row_carries_a_passage_or_says_where_we_looked(self):
        # Every source is one a reader can open: an address, the title of the
        # page, the page's own date and the day we read it. A row with no
        # passage behind it says where we looked instead, because a 0 for want
        # of anything published is still a claim somebody should be able to
        # check.
        for lab in ORDER:
            for row in self.ROWS:
                found = DATA["evidence"][lab][row]
                where = f"{lab} {row}"
                self.assertTrue(found.get("sources") or found.get("looked", "").strip(), where)
                for source in found.get("sources", []):
                    self.assertTrue(source["url"].startswith("https://"), source["url"])
                    for field in ("quote", "title", "date", "read"):
                        self.assertTrue(source.get(field, "").strip(), f"{where} {field}")

    # The one row that scores above 0 and quotes nothing. xAI signed a testing
    # agreement with the United States Center for AI Standards and Innovation in
    # May 2026 and publishes no address for it, so the cell says where we looked.
    UNQUOTED = {("xai", "S3")}

    def test_a_score_above_0_rests_on_a_passage_or_names_the_gap(self):
        unquoted = {(lab, row) for lab in ORDER for row in self.ROWS
                    if not DATA["evidence"][lab][row].get("sources")
                    and (DATA["scores"][lab].get(row)
                         or DATA["supporting_scores"][lab].get(row))}
        self.assertEqual(unquoted, self.UNQUOTED)
        for lab, row in self.UNQUOTED:
            self.assertIn("found no public", DATA["evidence"][lab][row]["looked"], f"{lab} {row}")

    def test_the_page_promises_it_of_every_row(self):
        # The promise used to stop at the four practices only a company can
        # show, and nothing said so.
        self.assertIn("Every row on the board rests on", FLAT)
        self.assertNotIn("Every score above 0 on the four", FLAT)

    def test_the_popover_shows_what_a_score_rests_on(self):
        source = Path(ROOT / "site" / "governance.js").read_text(encoding="utf-8")
        self.assertIn("What this rests on", source)
        self.assertIn("Where we looked", source)
        # Both the check popover and the practice popover call it.
        self.assertIn("evidenceBlock(content, lab, check.id)", source)
        self.assertIn("evidenceBlock(content, lab, practice.id)", source)


class HowTheWorkWasDone(unittest.TestCase):
    """The board says who looked, when, where and what was not found."""

    def test_the_page_says_how_the_reading_was_done(self):
        self.assertIn("How we looked", FLAT)
        self.assertIn("No model judged any row", FLAT)
        self.assertIn("between 18 and 21 September 2026", FLAT)
        self.assertIn("we searched its own pages first", FLAT)
        # Two searches that failed are named where they failed, and again in
        # what could not be established.
        self.assertIn("Two searches failed outright", FLAT)
        self.assertEqual(FLAT.count("Chinese regulatory filings"), 2)

    def test_the_two_papers_are_named_where_the_rows_come_from(self):
        self.assertIn("Where the rows come from", FLAT)
        # Each paper by its title, the memo by the half of it a reader can hold.
        for paper in DATA["papers"].values():
            self.assertIn(paper["title"].split(":")[0], FLAT, paper["title"])
        # Said once above the board as well, and once in the markup: a reader
        # meets the two papers where the rows come from, not in every popover.
        self.assertIn("Kembery", DATA["origin"])
        self.assertEqual(FLAT.count("Kembery"), 1)


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
    def test_every_lab_has_a_paragraph_for_every_row_it_is_scored_on(self):
        for lab in ORDER:
            profile = DATA["profiles"][lab]
            for part in QUESTIONS + [column["prose"] for column in DATA["columns"]]:
                self.assertTrue(profile.get(part, "").strip(), f"{lab} on {part}")

    def test_each_paragraph_scores_the_practices_of_its_own_figure(self):
        # "... under CC0 (2). ... after GPT-5.4 Thinking ... (1). ..." Every
        # practice a paragraph scores carries its points in parentheses, and the
        # paragraphs take the practices in order. Some name a practice they score
        # 0 and some leave it out, so the zeros are set aside: what is left must
        # be the group's practice scores that are not 0, in order. Only the
        # practices anyone can check are written about this way; the four only a
        # company can show carry a sentence each in internal_evidence.
        for lab in ORDER:
            for column in DATA["columns"]:
                ids = [pid for pid in column["practices"]
                       if pid in DATA["supporting_scores"][lab]]
                text = DATA["profiles"][lab][column["prose"]]
                stated = [int(n) for n in re.findall(r"\((\d)\)", text)]
                scored = [DATA["supporting_scores"][lab][pid] for pid in ids]
                where = f"{lab} {column['id']}"
                self.assertEqual([n for n in stated if n], [n for n in scored if n], where)
                self.assertEqual(sum(stated), sum(scored), where)

    def test_the_first_finding_quotes_the_combined_minimum(self):
        # "OpenAI has the best pair, 2.7 on the constitution and 2.3 on the
        # change log. Anthropic ... scores 3.0 and 1.0."
        combined = {lab: totals(lab)[0]["1"] + totals(lab)[0]["2"] for lab in ORDER}
        self.assertEqual(max(combined.values()), combined["openai"])
        first = DATA["findings"][0]["text"]
        openai, anthropic = totals("openai")[0], totals("anthropic")[0]
        self.assertIn(f"OpenAI has the best pair, {shown(on_ten(openai['1']))} on the "
                      f"constitution and {shown(on_ten(openai['2']))} on the change log", first)
        self.assertIn(f"scores {shown(on_ten(anthropic['1']))} and "
                      f"{shown(on_ten(anthropic['2']))}.", first)
        # The minimum is the first two questions, and the finding says what
        # meeting it means on the board's own scale.
        self.assertEqual([q["id"] for q in DATA["questions"] if q.get("minimum")], ["1", "2"])
        self.assertIn("10 out of 10 on both questions", first)
        # "across all nine, the best score on it is 5.8 out of 10"
        best_log = max(totals(lab)[0]["2"] for lab in ORDER)
        self.assertIn(f"the best score on it is {shown(on_ten(best_log))} out of 10", first)

    def test_the_finding_on_meta_quotes_both_of_its_figures(self):
        # "It scores 0.5 out of 10 on what is published ... and 2.5 out of 10 on
        # what it engages, behind only OpenAI and Anthropic."
        text = next(f["text"] for f in DATA["findings"] if "Muse Spark" in f["text"])
        _, columns = totals("meta")
        self.assertIn(f"{shown(columns['published'])} out of 10 on what is published", text)
        self.assertIn(f"{shown(columns['engages'])} out of 10 on what it engages", text)
        # Meta is fourth on the figure it names, level with xAI, and seventh on
        # the other, with no company level with it there.
        engages = sorted((totals(lab)[1]["engages"] for lab in ORDER), reverse=True)
        self.assertEqual(engages.index(columns["engages"]), 3)
        self.assertEqual(columns["engages"], totals("xai")[1]["engages"])
        self.assertIn("fourth of the nine and level with xAI", text)
        self.assertEqual(sorted(ORDER, key=published, reverse=True).index("meta"), 6)
        self.assertEqual([lab for lab in ORDER if published(lab) == columns["published"]], ["meta"])
        self.assertIn("on what is published, seventh of the nine", text)
        # "which puts it sixth on the final score with 2.0 out of 10"
        self.assertIn(f"sixth on the final score with {shown(ranking('meta'))} out of 10", text)
        self.assertEqual(rank("meta"), 6)

    def test_the_open_weights_finding_quotes_what_is_published(self):
        # "Moonshot AI's 0.9 and DeepSeek's 0.7 are the two lowest scores, and
        # Mistral AI's 3.4 is fourth", with Alibaba named as the one open-weight
        # company that is not near the bottom.
        text = next(f["text"] for f in DATA["findings"] if "Moonshot AI's" in f["text"])
        for lab, label in (("mistral", "Mistral AI's"), ("moonshot", "Moonshot AI's"),
                           ("deepseek", "DeepSeek's")):
            self.assertIn(f"{label} {shown(published(lab))}", text, lab)
        self.assertIn(f"fifth on what is published with {shown(published('alibaba'))}", text)
        self.assertEqual(sorted(ORDER, key=published, reverse=True).index("alibaba"), 4)
        # Two of the three it names hold the two lowest scores on that figure,
        # and the third is fourth on it.
        self.assertEqual(set(sorted(ORDER, key=published)[:2]), {"moonshot", "deepseek"})
        self.assertIn("are the two lowest scores", text)
        self.assertEqual(sorted(ORDER, key=published, reverse=True).index("mistral"), 3)
        self.assertIn(f"Mistral AI's {shown(published('mistral'))} is fourth", text)
        # The three are the last three on the final score, with the figures the
        # finding quotes.
        self.assertIn("Three of them take the last three places on the final score", text)
        self.assertEqual(set(ORDER[-3:]), {"mistral", "moonshot", "deepseek"})
        self.assertIn(f"Mistral AI with {shown(ranking('mistral'))}, DeepSeek with "
                      f"{shown(ranking('deepseek'))} and Moonshot AI with "
                      f"{shown(ranking('moonshot'))}", text)

    def test_the_findings_on_whole_columns_hold(self):
        # "On the check that asks for a comment window, only OpenAI and Anthropic
        # score anything at all: OpenAI 5.0 out of 10 ... and Anthropic 2.5."
        window = {lab: DATA["scores"][lab]["4.2"] for lab in ORDER}
        self.assertEqual({lab for lab, score in window.items() if score},
                         {"openai", "anthropic"})
        self.assertEqual(window["openai"], 2)
        self.assertEqual(window["anthropic"], 1)
        notice = next(f["text"] for f in DATA["findings"] if "comment window" in f["text"])
        self.assertIn(f"OpenAI {shown(on_ten(2))} out of 10", notice)
        self.assertIn(f"and Anthropic {shown(on_ten(1))}.", notice)
        # On special deployments, "Anthropic, OpenAI and xAI score 5.0 out of 10
        # each, and the other six nothing at all."
        special = {lab: DATA["scores"][lab]["1.3"] for lab in ORDER}
        self.assertEqual(special["anthropic"], 2)
        self.assertEqual(special["openai"], 2)
        self.assertEqual(special["xai"], 2)
        self.assertEqual({lab for lab, score in special.items() if score},
                         {"openai", "anthropic", "xai"})
        gap = next(f["text"] for f in DATA["findings"] if "armed forces" in f["title"])
        self.assertIn(f"Anthropic, OpenAI and xAI score {shown(on_ten(2))} out of 10 each, "
                      f"and the other six nothing at all", gap)

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

    def test_the_page_never_says_the_practices_are_outside_the_score(self):
        # They were outside one overall score until 23 September 2026. There is
        # no overall score now: every practice is counted in one of the two
        # figures, bar the one nobody can check, and no sentence may say
        # otherwise.
        text = (json.dumps(DATA, ensure_ascii=False) + FLAT).lower()
        for phrase in ("outside the total", "left out of the total", "out of 16",
                       "out of 34", "the overall score"):
            self.assertNotIn(phrase, text, phrase)

    def test_no_long_dash_in_the_view_or_its_data(self):
        long_dash = re.compile("[\\u2013\\u2014]")
        self.assertIsNone(long_dash.search("".join(PANEL.text)))
        self.assertIsNone(long_dash.search(json.dumps(DATA, ensure_ascii=False)))


if __name__ == "__main__":
    unittest.main()
