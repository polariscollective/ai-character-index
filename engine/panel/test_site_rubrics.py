"""The site's words for what the judges were asked, held to the prompts they read.

site/depth-scale.js carries the levels, the bars, the line on odd figures and
the three conditions for 10 that the overview and the reader show on a
publication out of ten. The judges scored against
engine/panel/prompts/depth-v2.txt, so a copy that drifted from it would explain
a figure by a rubric nobody was given. This reads the prompt and the site's
module and compares them, the way test_bands.py holds the Python to the
reader's DEFAULT_BANDS.

The site's `bar` is the prompt's own words with two changes a page needs: the
anchor in lower case, as the page writes every anchor, and the first letter of
the bar a capital. The site's `brief`, which the board prints under its table,
is one line and is not the prompt's sentence; what is held here is that it sits
at the prompt's own level and anchor, and that each brief condition opens on the
prompt's condition.

Run: python3 engine/panel/test_site_rubrics.py
"""
import json
import re
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEPTH_PROMPT = HERE / "prompts" / "depth-v2.txt"
DEPTH_SCALE_JS = ROOT / "site" / "depth-scale.js"

# "8 = DEMONSTRATED: prescribed, plus worked examples: ..."
LEVEL = re.compile(r"^(\d+) = ([A-Z]+): (.+)$")
# "(a) The edge is shown. Two cases that differ ..."
CONDITION = re.compile(r"^\([abc]\) (.+?\.)(?: |$)")

sys.path.insert(0, str(HERE))
import assessment_call            # noqa: E402

DOCUMENT_ASSESSMENT_JS = ROOT / "site" / "document-assessment.js"
# "CONFLICT_RULES: what the document says, ...", and not "CONFLICT_RULES: <0 to 4>"
QUESTION = re.compile(r"^([A-Z_]+): ([a-z].*)$")
# "2 = an order of priority between its rules ..."
ANCHOR = re.compile(r"^([024]) = (.+)$")
# "2. actions the model takes on its own with tools, such as sending, buying or deleting;"
SITUATION = re.compile(r"^\d\. (.+?)[;.]$")


def sentence_case(text):
    return text[:1].upper() + text[1:]


def first_sentence(text):
    return text.split(". ", 1)[0].rstrip(".") + "."


def prompt_scale():
    lines = DEPTH_PROMPT.read_text(encoding="utf-8").splitlines()
    levels = [{"level": int(m.group(1)), "anchor": m.group(2).lower(),
               "bar": sentence_case(m.group(3))}
              for m in map(LEVEL.match, lines) if m]
    conditions = [m.group(1) for m in map(CONDITION.match, lines) if m]
    odd = first_sentence(next(line for line in lines
                              if line.startswith("An odd number means")))
    return {"levels": levels, "conditions": conditions, "odd": odd}


def site_module(path, expression):
    """What a site module exports, as node imports it: the page's own file,
    not a copy of it."""
    script = ("import(process.argv[1]).then(m => console.log(JSON.stringify("
              + expression + ")))")
    result = subprocess.run(["node", "-e", script, path.as_uri()],
                            capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def prompt_criteria():
    """The four criteria the judges were asked, each with its question and its
    anchors at 0, 2 and 4, and the six situations the fourth names."""
    lines = assessment_call.PROMPTS["criteria"].read_text(encoding="utf-8").splitlines()
    asks, anchors, situations, key = {}, {}, [], None
    for line in lines:
        question = QUESTION.match(line)
        anchor = ANCHOR.match(line)
        situation = SITUATION.match(line)
        if question:
            key = question.group(1).lower()
            if key in assessment_call.CRITERIA:
                asks[key] = sentence_case(first_sentence(question.group(2)))
                anchors[key] = {}
            else:
                key = None
        elif anchor and key:
            anchors[key][int(anchor.group(1))] = sentence_case(anchor.group(2))
        elif situation and key == "situations":
            situations.append(situation.group(1))
    return asks, anchors, situations


def prompt_contradiction():
    lines = assessment_call.PROMPTS["contradictions"].read_text(encoding="utf-8").splitlines()
    return first_sentence(next(line for line in lines
                               if line.startswith("A contradiction here is")))


class PromptScaleTest(unittest.TestCase):
    """Guards the reading below: a prompt reworded out of this shape fails here,
    by name, rather than comparing two empty lists."""

    def test_the_prompt_is_read_as_six_levels_three_conditions_and_a_line(self):
        scale = prompt_scale()
        self.assertEqual([level["level"] for level in scale["levels"]], [0, 2, 4, 6, 8, 10])
        self.assertEqual(len(scale["conditions"]), 3)
        self.assertTrue(scale["odd"].startswith("An odd number means"))


@unittest.skipUnless(shutil.which("node"), "node reads the site's module")
class DepthScaleOfTenTest(unittest.TestCase):
    def setUp(self):
        self.site = site_module(DEPTH_SCALE_JS,
                                "{levels: m.DEPTH_LEVELS[10], conditions: m.CONDITIONS_FOR_TEN, "
                                "briefs: m.CONDITIONS_BRIEF, odd: m.ODD_VALUES}")
        self.prompt = prompt_scale()

    def test_each_level_is_the_prompt_s_anchor_and_bar(self):
        got = [{"level": one["level"], "anchor": one["anchor"], "bar": one["bar"]}
               for one in self.site["levels"]]
        self.assertEqual(got, self.prompt["levels"])

    def test_every_level_also_carries_a_brief_of_its_own(self):
        for one in self.site["levels"]:
            self.assertTrue(one["brief"], one["anchor"])
            self.assertLessEqual(len(one["brief"]), 110, one["anchor"])

    def test_the_conditions_for_ten_are_the_prompt_s(self):
        self.assertEqual(self.site["conditions"], self.prompt["conditions"])

    def test_each_brief_condition_opens_on_the_prompt_s(self):
        for brief, full in zip(self.site["briefs"], self.prompt["conditions"]):
            self.assertTrue(brief.startswith(full.rstrip(".") + ":"), brief)

    def test_the_line_on_odd_figures_is_the_prompt_s(self):
        self.assertEqual(self.site["odd"], self.prompt["odd"])


class PromptCriteriaTest(unittest.TestCase):
    def test_the_criteria_prompt_is_read_as_four_questions_with_anchors_and_six_situations(self):
        asks, anchors, situations = prompt_criteria()
        self.assertEqual(sorted(asks), sorted(assessment_call.CRITERIA))
        for key in assessment_call.CRITERIA:
            self.assertEqual(sorted(anchors[key]), [0, 2, 4], key)
        self.assertEqual(len(situations), 6)


@unittest.skipUnless(shutil.which("node"), "node reads the site's module")
class AssessmentCriteriaTest(unittest.TestCase):
    """site/document-assessment.js says what each criterion asks and what its
    scores mean. The judges were asked in assessment-criteria-v1.txt and
    assessment-contradictions-v2.txt, so the board asks it in their words."""

    def setUp(self):
        self.site = site_module(DOCUMENT_ASSESSMENT_JS, "m.CRITERIA")
        self.scored = [one for one in self.site if one["key"] != "contradictions"]

    def test_the_criteria_are_the_builder_s_four_in_its_order_and_contradictions_last(self):
        self.assertEqual([one["key"] for one in self.scored], list(assessment_call.CRITERIA))
        self.assertEqual(self.site[-1]["key"], "contradictions")

    def test_each_criterion_asks_the_prompt_s_question(self):
        asks, _anchors, _situations = prompt_criteria()
        for criterion in self.scored:
            self.assertTrue(criterion["asks"].startswith(asks[criterion["key"]]),
                            criterion["key"])

    def test_each_criterion_s_anchors_are_the_prompt_s(self):
        _asks, anchors, _situations = prompt_criteria()
        for criterion in self.scored:
            self.assertEqual(criterion["anchors"], {str(k): v for k, v
                                                    in anchors[criterion["key"]].items()},
                             criterion["key"])

    def test_situations_names_the_prompt_s_six(self):
        _asks, _anchors, situations = prompt_criteria()
        asked = next(one["asks"] for one in self.site if one["key"] == "situations")
        for situation in situations:
            self.assertIn(situation, asked)

    def test_a_contradiction_is_what_the_prompt_calls_one(self):
        self.assertIn(prompt_contradiction(),
                      next(one["asks"] for one in self.site if one["key"] == "contradictions"))


if __name__ == "__main__":
    unittest.main()
