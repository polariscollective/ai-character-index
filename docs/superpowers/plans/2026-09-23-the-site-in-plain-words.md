# The site in plain words Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Someone who opens the AI Constitutions Index for the first time, who is not technical and has not read a working paper, can tell what the site measures, what any figure on it means, and what the index did not find. The word for these documents is constitution, everywhere, and it is assumed.

**Architecture:** Copy is the deliverable, so the copy goes where it can be tested and read once.

- `site/plain-words.js` is new. It holds, for every scored row of the board of constitutions, the sentence that says what is being scored and the sentence that says what a figure means at the value on screen. It is a pure module, so `node --test` reads it and the MCP server answers with it.
- `site/depth-scale.js` and `site/document-assessment.js` keep the judges' own rubrics word for word, because `engine/panel/test_site_rubrics.py` holds them to `engine/panel/prompts/depth-v2.txt`, `assessment-criteria-v1.txt` and `assessment-contradictions-v2.txt`. Nothing in this plan rewrites a rubric. The one-line `brief` of each depth level is the site's own line and is rewritten.
- `site/governance.json` gains one plain sentence per question, check and practice, beside the anchors it already carries. The board of governance reads them; so does the MCP server.
- `site/overview.js` and `site/governance.js` change what a popover leads with: two plain sentences first, the evidence next, and the judges' own wording in a fold under the heading "The detail behind this figure".
- `app/lib/board-tools.mjs` is new: two pure functions that answer the two boards over MCP, built from the same three files the pages are built from, so a client and a reader are never told different things.

**Tech Stack:** Plain HTML and vanilla ES modules in `site/`, copied into `public/` and served by Next.js 15; Node 22 `node:test`; Python 3 stdlib `unittest`; Playwright walkers driving Chrome (`playwright-core`); `mcp-handler` and `zod` for the MCP route.

**Sources:**

- The requirements: `.superpowers/sdd/copy-pass-brief.md`, the owner's words of 23 September 2026.
- The Polaris design framework, `/Users/sverbo/Desktop/Codes/Polaris/CLAUDE.md`, which binds every visible change.
- The state of the copy on `develop`: `site/overview.html`, `site/overview.js`, `site/governance.js`, `site/governance.json`, `site/about.html`, `site/mcp.html`, `site/dev-tag.js`, `site/document-assessment.js`, `site/depth-scale.js`, `app/lib/mcp-tools.mjs`, `app/api/mcp/route.js`.
- What the figures are: `methodology/spec-coverage-depth-rubric.md` and `methodology/document-assessment-rubric.md`.
- Two servers are already running and are not this plan's to stop. `http://127.0.0.1:4617/` serves the board with real figures, publication `de378ff3-008f-4977-92ce-d006e90699b9`, a draft on the scale of ten with an assessment, which is what every screen in this plan should be looked at against.

## Global Constraints

- Work only in `/Users/sverbo/Desktop/Codes/Polaris/ai-character-index`, branch `develop`. Never touch the worktrees `ai-character-index-depth-to-ten` and `ai-character-index-depth-to-ten-site`, where other work is running.
- **The reader.** Nothing may be written for the people who built the site. Every mention of the tooling goes: no agents, no scripts, no "a page could not be opened". Where a document could not be read, the page says we did not find it, as far as we know.
- **The word.** Constitution, everywhere, and assumed. These documents are constitutions: the site says so plainly and does not hedge. "Model behaviour specification", "behaviour specification", "specification" and "spec" leave the site's own copy. A company's own name for its document stays as the company writes it: Claude's Constitution, the OpenAI Model Spec, the Alibaba Model Spec. A quotation from a working paper or from a company stays verbatim, even where it says "model spec". "Doc reader" keeps its name. The site is the AI Constitutions Index.
- **The owner's rules for English prose, verbatim:**
  - Prefer clarity over elegance.
  - No antithesis: "not X but Y", "not just X", "not only X", "rather than X", "the point is not A, it is B". At most one per document, and only when the contrast is the actual idea.
  - No triads: three parallel items of similar length where two would do.
  - No closing punchline, and no dramatic short sentence after a long one.
  - Plain declarative sentences, colons occasional, cut any sentence that only reformulates the previous one.
- British spelling, sentence case everywhere including buttons and table headers, no long dashes (`—`, `–`) and no `--` used as a dash.
- The design framework binds every visible change: mono for figures and model ids only, no cards, shadows or gradients, links with the chartreuse underline, focus 2px chartreuse, a status colour never alone without its word, `prefers-reduced-motion` respected, dated claims carrying "as of September 2026".
- **Three bodies of words are not the site's and may not be rewritten.** The depth scale's anchors, bars, three conditions and odd-figure line in `site/depth-scale.js`, held to `engine/panel/prompts/depth-v2.txt`; the five criteria's questions and anchors in `site/document-assessment.js`, held to `assessment-criteria-v1.txt` and `assessment-contradictions-v2.txt`; and the working papers' quotations in `site/governance.json`. `engine/panel/test_site_rubrics.py` holds the first two. Plain words are added beside them and nothing replaces them.
- Nothing on the site is built with `innerHTML`. A quote, a rationale and a situation are a model's words and land as text nodes.
- Machine names do not change in this pass: the MCP tools `list_model_specs`, the arguments `model_spec_ids` and the cursor's `model_spec_id`, the server name `ai-character-index`, the route `/api/reader/...`, the query parameter `?spec=`, the document id grammar `<lab>--<document>@<version>`, the proposal form's `kind=specification` and the stored rows behind it. Renaming any of them breaks a connected client or a stored submission, and none of them is the site's copy. See the open questions at the foot of this plan.
- Commits end with exactly:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7`
- Nothing here needs credentials. Every test runs against fixtures. The one look at real figures is `http://127.0.0.1:4617/`, which is already serving.
- The battery, run in full at the end of every task:

```sh
python3 -m unittest discover -s tests
python3 engine/panel/test_site_rubrics.py
node --test app/lib/__tests__/*.test.mjs
node engine/verify-reader-features.mjs
```

Expected, in order: `OK`; `OK`; `# fail 0`; `ALL FEATURE CHECKS PASSED.`

## The words, old to new

| Today | After |
| --- | --- |
| model behaviour specification, behaviour specification, specification, spec | constitution |
| What the specifications say (tab) | What the constitutions say |
| Model behaviour specification (governance question 1) | Published constitution |
| Specification published (check 1.1) | Constitution published |
| Propose a new model behaviour specification | Propose a new constitution |
| A model behaviour specification (proposal dialog choice) | A constitution |
| No specification (column flag on the board) | No constitution |
| Where this specification stands (popover heading) | Where this constitution stands |
| Depth of a behaviour, out of 10 (scale under the table) | How far a constitution goes on one behaviour, out of 10 |
| Claude's Constitution, OpenAI Model Spec, Alibaba Model Spec, Model Spec | unchanged, they are the companies' own names |
| Emerging International Best Practices for AI Model Specs | unchanged, it is a paper's title |
| defining, core, related; absent, named, discussed, prescribed, demonstrated, bounded | unchanged, they are the judges' rubric |

---

### Task 1: The word

Nothing in this task changes what a sentence claims. It changes what the documents are called, everywhere the site speaks in its own voice, and it puts a standing guard in place so the word cannot come back.

**Files:**
- Create: `tests/test_site_words.py`
- Modify: `site/governance.json` (question 1, its three checks, check 2.3, the practices S1 to S5 and I1 to I5 with their anchors, `minimum_note`, the eight findings, the nine profiles)
- Modify: `site/overview.html` (both views' headings and ledes, the tab labels, the three reference folds, the source headings)
- Modify: `site/overview.js:39-49` (the constant and its comment), `:366-369`, `:420-423`, `:433`, `:444-452`, `:764-770`, `:915`, `:1114-1117`
- Modify: `site/governance.js:24` (a comment quoting the old row name)
- Modify: `site/about.html` (every visible string; the sections themselves are rewritten in Task 6)
- Modify: `site/mcp.html` (every visible string; the tools section is rewritten in Task 9)
- Modify: `engine/verify-reader-features.mjs:2016-2019` and `:2382`
- Modify: `tests/test_governance_tab.py:261-263`

**Interfaces:**
- Consumes: nothing.
- Produces: `tests/test_site_words.py`, a standing guard every later task must keep green. Every later task writes its copy with the word already settled.

- [ ] **Step 1: Write the failing guard**

Create `tests/test_site_words.py`:

```python
"""No page of the index calls a constitution a specification.

The site says constitution, and assumes it. Three kinds of text are exempt, each
for its own reason: a company's own name for its document (the OpenAI Model
Spec), a quotation of a working paper or of a company, which stays verbatim, and
a machine name, which is not copy.

site/depth-scale.js and site/document-assessment.js are not read here. Their
strings are the judges' own rubrics, held to the prompts by
engine/panel/test_site_rubrics.py, and the scale of four still says "the spec"
because the prompt does.

Run: python3 -m unittest discover -s tests
"""
import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PAGES = ["site/overview.html", "site/about.html", "site/mcp.html"]
SCRIPTS = ["site/overview.js", "site/governance.js", "site/dev-tag.js",
           "site/brand.js", "site/plain-words.js"]
DATA = "site/governance.json"

BANNED = re.compile(r"\bspecifications?\b|\bspecs?\b|\bmodel spec\b", re.IGNORECASE)
# A company's own name for its document, taken out before the search.
NAMES = ["Model Specs", "Model Spec"]
# A quotation stays verbatim, in either pair of marks.
QUOTED = re.compile("[“\"][^”\"]{0,800}[”\"]", re.DOTALL)
# The attributes a reader hears or sees.
SPOKEN = {"title", "aria-label", "placeholder", "alt"}
# A JavaScript string that is prose: it has a space in it and is not an address.
LITERAL = re.compile(r'"((?:[^"\\\n]|\\.){2,400})"')


def clean(text):
    for name in NAMES:
        text = text.replace(name, "")
    return QUOTED.sub(" ", text)


class Visible(HTMLParser):
    """Element text, and the attributes a reader meets. Script, style, code and
    pre are left out: the first is not copy and the rest are machine names on
    purpose."""

    SKIP = {"script", "style", "code", "pre"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skipping = 0
        self.text = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in SPOKEN and value:
                self.text.append(value)
        if tag in self.SKIP:
            self.skipping += 1

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skipping:
            self.skipping -= 1

    def handle_data(self, data):
        if not self.skipping:
            self.text.append(data)


def strings_of(node, key=None):
    """Every string of the governance data except the papers, their quotations
    and the addresses."""
    if key in {"papers", "quotes", "url", "source_url", "sources"}:
        return
    if isinstance(node, dict):
        for name, value in node.items():
            yield from strings_of(value, name)
    elif isinstance(node, list):
        for value in node:
            yield from strings_of(value, key)
    elif isinstance(node, str):
        yield node


def offending(fragments):
    return [fragment.strip() for fragment in fragments
            if BANNED.search(clean(fragment))]


class TheSiteSaysConstitution(unittest.TestCase):
    def test_no_page_says_specification(self):
        for page in PAGES:
            parser = Visible()
            parser.feed((ROOT / page).read_text(encoding="utf-8"))
            self.assertEqual(offending(parser.text), [], page)

    def test_no_script_says_specification_in_its_copy(self):
        for script in SCRIPTS:
            path = ROOT / script
            if not path.exists():
                continue
            prose = [found.group(1) for found in LITERAL.finditer(
                path.read_text(encoding="utf-8"))
                if " " in found.group(1) and "://" not in found.group(1)
                and "spec-reader" not in found.group(1)
                and "model_spec" not in found.group(1)]
            self.assertEqual(offending(prose), [], script)

    def test_the_governance_data_says_specification_only_in_a_quotation(self):
        data = json.loads((ROOT / DATA).read_text(encoding="utf-8"))
        self.assertEqual(offending(strings_of(data)), [])

    def test_the_guard_can_still_see_the_word(self):
        # A guard that passes because it reads nothing is worse than no guard.
        self.assertEqual(offending(["a model behaviour specification"]),
                         ["a model behaviour specification"])
        self.assertEqual(offending(["the OpenAI Model Spec"]), [])
        self.assertEqual(
            offending(["it commits to publish “a model spec” one day"]), [])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it and watch every surface fail**

Run: `python3 -m unittest tests.test_site_words -v`
Expected: FAIL on `test_no_page_says_specification`, `test_no_script_says_specification_in_its_copy` and `test_the_governance_data_says_specification_only_in_a_quotation`, each listing the fragments to fix. `test_the_guard_can_still_see_the_word` passes.

- [ ] **Step 3: The governance data**

In `site/governance.json`, question 1 and its checks:

- `questions[0].name`: `Published constitution`
- `questions[0].question`: `Does every model the company puts in use have a published constitution?`
- `questions[0].explainer`: `A constitution is the document in which a company sets out how its models are meant to behave.`
- `questions[0].reading`: replace the two occurrences of "specification" with "constitution": `The question asks whether a company has written down, in public, how its models are meant to behave, and whether that document reaches every model it puts in use. The paper counts a model as in use when people outside the company use it, or when the company itself uses it at scale. The checks follow the paper's own parts: what makes a document a constitution, which models it covers, and the government, military and internal deployments the paper names.`
- check `1.1.short`: `Constitution published`
- check `1.1.label`: `A public constitution says how the model should behave in ordinary use`
- check `1.1.anchors["4"]`: `A full constitution: how the model should behave, how conflicts between instructions are settled, and who may instruct it at what level.`
- check `1.1.reading`: keep, changing "document" nowhere and "specification" nowhere; it already says document.
- check `1.3.reading`: `public document` stays as it is.
- check `2.3.label`: `The log also covers system prompts and guardrails, says which version of the constitution governs which model, and commits to a timeline`
- check `2.3.anchors["4"]`: `All three: the log spans system prompts and guardrails, says which version of the constitution governs which model, and commits to a period within which changes are logged.`
- check `2.3.reading`: `Three things from the ask are counted together: the log covers system prompts and guardrails as well as the constitution, it says which version governs which model, and it commits to logging every change within a fixed number of days. One of the three is a 2, all three a 4.`
- `questions[1].question`: `Is there one public change log covering the constitution, the system prompts and the guardrails?`
- `questions[1].reading`: replace "the specification" with "the constitution" in its one occurrence.

The practices, keeping their ids and their order:

- `S1.label`: `Anyone may freely reuse the constitution, under an open licence.`
- `S2.label`: `The company publishes a current test of how well its models follow the constitution.`
- `S2.reading`: `A 2 is a published test, current for the models in use, of how well they follow the constitution, with its method. Results that stop before the latest models, or a claim with no method, are a 1.`
- `S3.label`: `Outside evaluators have access to test adherence to the constitution specifically.`
- `S3.reading`: `A 2 is outside evaluators given access to test adherence to the constitution itself. Outside testing of other risks, or an agreement with no published result, is a 1 at most.`
- `S5.label`: `The company publishes who inside it approves changes to the constitution.`
- `S5.reading`: `A 2 is a published account of who inside the company may change the constitution, and what approval each kind of change needs.`
- `I1.label`: `The company trains the models it deploys to follow the constitution.`
- `I1.audit`: `Whether the constitution enters the training data and the training process of each deployed model, and how.`
- `I1.anchors["0"]`: `Nothing published. A company with no published constitution scores 0, unless it describes training its models against an internal behaviour document.`
- `I1.anchors["1"]`: `A general statement that models are trained towards the constitution, without saying how, or only for older models, or only against a document nobody outside can read.`
- `I1.anchors["2"]`: `How its current models are trained on the constitution is published: whether it generates training data, and at which stages of training it enters.`
- `I2.anchors["0"]`: `Nothing published about the models it uses internally and the constitution.`
- `I3.label`: `The published constitution is the text used for training and inside the company, or the differences are stated.`
- `I3.audit`: `The internal versions of the constitution, compared with the published one.`
- `I3.anchors["0"]`: `Nothing published. A company with no published constitution scores 0.`
- `I4.label`: `The company checks whether deployed models follow the constitution, and reports serious violations.`
- `I4.audit`: `The company's monitoring of deployed models, and its records of violations.`
- `I4.anchors["1"]`: `One of the two: it describes how it monitors models in use, or it reports serious violations publicly. Or both, without tying them to the constitution or intended behaviour.`
- `I4.anchors["2"]`: `Both: it monitors models in use against the constitution or intended behaviour, and reports serious violations publicly.`
- `I5.label`: `A change to the constitution is drafted by one team and can be vetoed by another on safety, legal or ethical grounds.`
- `I5.audit`: `The records of how past changes were proposed, reviewed and approved.`

`minimum_note`: `Our proposal asks four things of every company and names the first two as its minimum: a published constitution for every model the company uses, and one public change log that says up front which layers and models it covers and how soon a change is recorded. The constitution is the object of the rules, and the log is the commitment that any change to them can be seen. The other two asks, on guardrails and hard constraints, are where the proposal says companies should go next. Meeting the minimum means 4 out of 4 on both questions.`

- [ ] **Step 4: The findings**

In `site/governance.json`, the five findings that carry the word. Every figure and every quotation stays exactly as it is.

- `findings[0].title`: unchanged. `findings[0].text`: `Our proposal names its first two asks as the minimum it expects of every company: a published constitution for every model in use, and one public change log that says up front what it covers and how soon a change is recorded. Meeting it means 4 out of 4 on both questions, and no company does. OpenAI has the best pair, 2.7 on the constitution and 2.3 on the change log. Anthropic, whose constitution is the more complete, scores 3.0 and 1.0. The change log is where every company falls short, the two leaders included: across all nine, the best score on it is 2.3 out of 4.`
- `findings[3].text`: three changes, `Anthropic is the only one that says in writing that some of its models fall outside its constitution, which is why it scores 1. Those models, Claude Gov and Claude Mythos, are in use and have no published constitution. OpenAI never names its Model Spec in any announcement about government or defence.` The rest of the paragraph, Meta and Mistral and both quotations, is unchanged.
- `findings[4].title`: `Alibaba's constitution is well built and names nothing it governs`. In its text, the last sentence becomes `It is the clearest reason in our evidence to score whether a constitution exists and whether it covers anything as two separate checks.`
- `findings[5].text`: the quotation of Meta's framework stays word for word, including "model spec". The sentences around it become `Meanwhile the safety report for its Muse Spark model publishes scores for how well the model follows an internal constitution that nobody outside Meta can read. A company publishing scores against a document nobody outside it can read shows why the first question exists more clearly than any company that publishes nothing. We do not know what form that document takes. The one that leaked in 2025 was titled "GenAI: Content Risk Standards" and was described as standards of permitted content with examples, which is neither of the two forms a constitution usually takes: a set of rules, or an explanatory text.`
- `findings[7].text`: `Its Measure 7.1 requires the report a signatory gives on each model to contain a specification of how the model is meant to operate` is a paraphrase of the Code of Practice and its own words are quoted elsewhere in the row; write it as `Its Measure 7.1 requires the report a signatory gives on each model to set out how the model is meant to operate: the principles it follows, how it ranks conflicting instructions, the topics it refuses, and its system prompt.` The last sentence keeps "our asks".

- [ ] **Step 5: The nine profiles**

Every occurrence of the word in `profiles` becomes "constitution", with the article and the possessive adjusted so the sentence reads. The parenthetical scores, the order of the sentences and every quotation stay exactly as they are, because `tests/test_governance_tab.py` reads the parentheses and the first finding's figures. Four sentences need more than the word swapped:

- `profiles.openai["1"]` opens `OpenAI's constitution, which it calls the Model Spec, sits at a permanent, dated web address.`
- `profiles.openai["2"]` ends `The log covers the Model Spec's text only.` and earlier reads `Nothing says which version of the constitution governs which model`.
- `profiles.google["1"]` reads `is the closest thing to a constitution that Google publishes`.
- `profiles.meta["1"]` reads `an internal constitution that nobody outside Meta can read`, keeping Meta's quoted sentence as it stands.

Run `python3 -c "import json; json.load(open('site/governance.json'))"` after editing. Expected: no output.

- [ ] **Step 6: The overview**

In `site/overview.html`:

- The tab: `What the specifications say` becomes `What the constitutions say`.
- Every heading, lede and fold in the two views. Tasks 2, 4 and 5 rewrite these blocks completely, so here they take the word alone.
- The source headings under the governance board: `The model behaviour specifications` becomes `The constitutions`; `How the specifications are run` becomes `How the constitutions are run`; `Tests of whether models follow their specification, and outside assessments` becomes `Tests of whether models follow their constitution, and outside assessments`. Every link's own text, including `OpenAI Model Spec, 18 August 2026` and `Alibaba AI Model Spec`, is a publisher's name and stays.

In `site/overview.js`:

- `WITHOUT_A_SPECIFICATION` becomes `WITHOUT_A_CONSTITUTION`, and its comment says `none publishes a constitution either`.
- `profile()`: `We know of no constitution from ${column.lab}, and none appears to have been published, so there is no public document to set beside the others.`
- `notAssessed()`: `There is no published constitution from ${column.lab} to assess.`
- `absentScore()`: `We know of no constitution from ${column.lab}, and none appears to have been published, so there is no public document to set beside the others.` and `Nobody has examined a ${column.lab} constitution and found it silent on ${these}.`
- `headRow()`: the column flag `No specification` becomes `No constitution`, and the accessible label `no published specification` becomes `no published constitution`.
- `renderLegend()`: `no published specification to assess` becomes `no published constitution to assess`.
- `behaviourScore()`: the heading `Where this specification stands` becomes `Where this constitution stands`.
- The link in `proposeLine()` keeps `?propose&kind=specification#propose`, which is the wire name of the form.
- The file comment at the top and the comment at `site/governance.js:24` say constitution.

- [ ] **Step 7: About and MCP, the word only**

In `site/about.html` and `site/mcp.html`, every visible string. The sections are rewritten in Tasks 6 and 9; this step only settles the word, so that those tasks are read as changes of sense. The hidden form values `kind=specification` and the ids `pick-specification`, `form-specification`, `open-propose-specification` stay: they are the names `app/api/submit/route.js` reads. The visible labels become `Propose a new constitution` and `A constitution`.

- [ ] **Step 8: Move the two tests that pin the old words**

In `engine/verify-reader-features.mjs:2016`:

```js
  check(seen.rows.join(", ") === "Overall, Published constitution, Change log, Guardrails, "
        + "Hard constraints, Best practices"
      && seen.findings === 8,
    "the scores run down from the total, the checks folded, the eight findings under the table",
    JSON.stringify(seen.rows));
```

and at `:2382`:

```js
      && popover.headings.includes("Where this constitution stands"),
```

In `tests/test_governance_tab.py:261`:

```python
        self.assertIn(f"OpenAI has the best pair, {shown(openai['1'])} on the constitution "
                      f"and {shown(openai['2'])} on the change log", first)
```

Nothing else in either file moves. `tests/test_governance_tab.py`'s banned-word list stays as it is: "rulebook", "firm limit", "change record" and "standing instructions" are the words the first version of the governance view invented, and the new copy must go on avoiding them. The check names, the ranking, the totals and the parenthetical scores are unchanged by this task and must stay green without being touched.

- [ ] **Step 9: Run the guard, then the battery**

Run: `python3 -m unittest tests.test_site_words -v`
Expected: `OK`, four tests.

Run the battery. Expected: `OK`; `OK`; `# fail 0`; `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 10: Commit**

```bash
git add site tests engine/verify-reader-features.mjs
git commit -m "The site calls these documents constitutions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 2: The board of constitutions, before any figure

The first view says in two parts what the index measures, and says it above the board. The scale under the table and the fold at the foot are written for the same reader.

**Files:**
- Modify: `site/overview.html:876-896` (the heading, the lede, the hint), `:216-217` and `:604-622` (the styles the lede needs)
- Modify: `site/depth-scale.js:21-95` (the `brief` of each level, and `CONDITIONS_BRIEF`)
- Modify: `site/overview.js:907-944` (the legend and the scale under the table), `:962-1036` (the fold at the foot), `:982-984`
- Modify: `app/lib/__tests__/depth-scale.test.mjs:40-58`
- Modify: `engine/verify-reader-features.mjs:2313-2316`, `:2361-2369`, `:2434-2440`

**Interfaces:**
- Consumes: the word, settled in Task 1.
- Produces: `DEPTH_LEVELS[scale][n].brief`, a plain one-line reading of each level, which Task 3 shows in every popover and Task 8 answers over MCP. `bar`, `anchor`, `level`, `CONDITIONS_FOR_TEN` and `ODD_VALUES` are untouched, because `engine/panel/test_site_rubrics.py` holds them to `engine/panel/prompts/depth-v2.txt`.

- [ ] **Step 1: Move the two tests that pin a brief**

In `app/lib/__tests__/depth-scale.test.mjs:48`:

```js
  assert.equal(levelsOf(10)[5].brief,
    "It sets rules, shows them applied, and settles the hard cases the behaviour raises.");
```

and in the same file at `:56`, `CONDITIONS_BRIEF` keeps its rule, so nothing moves there.

In `engine/verify-reader-features.mjs:2313`:

```js
  check(four.keyTitle === "How far a constitution goes on one behaviour, out of 4"
```

and at `:2361`:

```js
  check(ten.keyTitle === "How far a constitution goes on one behaviour, out of 10"
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test app/lib/__tests__/depth-scale.test.mjs`
Expected: FAIL, `every level carries a brief the board can print under a table`, the message showing today's "Demonstrated, and the three conditions below hold for every part of the behaviour."

Run: `node engine/verify-reader-features.mjs 2>&1 | grep -c "^FAIL"`
Expected: `2`

- [ ] **Step 3: Write the briefs**

In `site/depth-scale.js`, the `brief` of every level of both scales. Nothing else in the file changes.

Scale of four, levels 0 to 4 in order:

```js
      brief: "The constitution says nothing that bears on this behaviour." },
      brief: "It mentions the behaviour and says nothing more about it." },
      brief: "It treats the behaviour as a subject of its own, in general terms." },
      brief: "It sets rules on the behaviour, precise enough to judge an answer against." },
      brief: "It sets rules and shows them applied to worked examples." },
```

Scale of ten, levels 0, 2, 4, 6, 8 and 10 in order: the same five, and for 10:

```js
      brief: "It sets rules, shows them applied, and settles the hard cases the behaviour raises." },
```

`CONDITIONS_BRIEF`, each still opening on the prompt's own condition, which `engine/panel/test_site_rubrics.py` requires:

```js
export const CONDITIONS_BRIEF = [
  "The edge is shown: two cases that differ in one detail get opposite answers.",
  "A conflict is settled: the constitution names a rule of its own that pulls against this one, "
    + "says which wins and shows it on a case.",
  "A default for the undecidable case: it says what to do when the model cannot tell which side "
    + "of the edge it is on.",
];
```

`ODD_BRIEF` keeps its sentence: `An odd figure means the level below is fully met and part of the next.`

- [ ] **Step 4: Run the two tests again**

Run: `node --test app/lib/__tests__/depth-scale.test.mjs`
Expected: `# fail 0`

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `OK`. The bars, the anchors, the three conditions and the odd line are still the prompt's.

- [ ] **Step 5: The heading and the lede**

In `site/overview.html`, the first view's opening, replacing lines 877 to 886:

```html
  <h1>What each constitution settles, and how far it goes</h1>
  <p class="lede">
    AI companies publish constitutions: documents setting out how their models should<a class="asterisk" href="/about#why" aria-label="What should means here">*</a>
    behave. The index reads them and scores each one twice, out of 10 each, and the board leads
    with the two added together.
  </p>
  <div class="board-parts">
    <p><strong>The document as a whole.</strong> Whether the constitution settles a clash between
    two of its own rules, whether a reader can tell which rules are absolute and which can be
    lifted and by whom, whether the rules come with reasons, whether they reach the situations
    the models are used in, and whether the document contradicts itself somewhere without saying
    which rule wins.</p>
    <p><strong>The behaviours.</strong> How far the constitution goes on each behaviour the index
    asks about, from saying nothing about it to setting rules and showing them applied to worked
    examples.</p>
  </div>
  <p class="lede">
    Missing a constitution, or a behaviour the index should be asking about?
    <a href="/about?propose#propose" target="_blank" rel="noopener noreferrer">Propose one</a>.
  </p>
```

The styles, added beside `.lede` at `site/overview.html:217`:

```css
/* The two parts of the score, said before any figure. Two paragraphs with their
   subject in the lead, the way the folds under the board already open. */
.board-parts { margin: 0 0 22px; max-width: 86ch; }
.board-parts p { margin: 0 0 10px; color: var(--muted); }
.board-parts strong { color: var(--ink); }
```

The hint in the toolbar, replacing lines 892 to 894:

```html
      Press a figure to see what it means, or a company or a row&rsquo;s name to read about it.
      Open a row to see the parts it is made of.
```

- [ ] **Step 6: The legend and the scale under the table**

In `site/overview.js`, `renderLegend()`:

```js
  legend.append(element("span", "", "Colour goes from nothing scored to the most a row can score:"),
    element("span", "", "none"));
```

and the line for a column with no constitution:

```js
    na.append(board.naChip(),
      document.createTextNode(" no published constitution to assess"));
```

In `renderDepthKey()`:

```js
  nodes.depthKeyTitle.textContent =
    `How far a constitution goes on one behaviour, out of ${state.scale}`;
```

- [ ] **Step 7: The fold at the foot**

In `site/overview.js`, `renderMethod()`, every block rewritten. The helpers `rich`, `listed`, `seatsNamed` and `substituted` stay; `substituted` says `place` where it said `seat`:

```js
const substituted = (entries, unit) => listed(entries.map(({ model, seat, count }, index) => [
  { mono: model }, `${index === 0 ? " answered" : ""} in ${seat}'s place for `, { mono: count },
  index === 0 && unit ? ` ${count === 1 ? unit.one : unit.many}` : ""]));
```

The blocks:

```js
  if (state.assessment) {
    blocks.push(rich({ lead: `The score at the top, out of ${FINAL_MAX}.` },
      "The two halves of the board added together: the document as a whole, out of ",
      { mono: WHOLE_MAX }, ", and the behaviours, out of ", { mono: WHOLE_MAX },
      ". Companies are ranked by it, and companies level on it share a place."));
  }
  blocks.push(rich({ lead: "The behaviours." },
    "The plain mean of the constitution's figures over every behaviour the index asks about. A "
    + "group's figure is the plain mean of the behaviours in it."));
  blocks.push(rich({ lead: `How far a constitution goes on one behaviour, out of ${state.scale}.` },
    "Three judges read the passages the index holds for that behaviour in that constitution, and "
    + "each gives a figure from ", { mono: 0 }, " to ", { mono: state.scale },
    " on the scale above. The figure on the board is the mean of the three. Where a judge cannot "
    + "answer, a model named in advance answers in its place and the figure says so. The judges "
    + "on this board are ", ...seatsNamed(facts.depthSeats),
    ...(facts.depthSubstitutions.length
      ? ["; ", ...substituted(facts.depthSubstitutions, { one: "figure", many: "figures" }), "."]
      : ["."])));
  if (state.assessment) {
    blocks.push(rich({ lead: `The document as a whole, out of ${WHOLE_MAX}.` },
      "Five criteria. Four of them are read on the whole document and scored from ", { mono: 0 },
      " to ", { mono: CRITERION_MAX }, "; the fifth is the contradictions, scored from the list "
      + "the next paragraph describes. Each is halved so the five add up to ", { mono: WHOLE_MAX },
      "."));
    blocks.push(rich({ lead: "Contradictions." },
      "Each judge lists the contradictions it finds. Each of them then reads every claim on the "
      + "list, its own included, and says whether it holds and whether it involves a rule the "
      + "constitution says can never be overridden. A claim is confirmed when two of the three "
      + "judges say it holds. Score: ", { mono: CRITERION_MAX }, " when none is confirmed, ",
      { mono: 2 }, " when one or two are and none involves such a rule, ", { mono: 0 },
      " when three or more are or one involves such a rule. The judges on this board are ",
      ...seatsNamed(facts.contradictionSeats),
      ...(facts.readingSubstitutions.length
        ? ["; ", ...substituted(facts.readingSubstitutions, null), " of the ",
          { mono: facts.readings }, " readings in all"]
        : []),
      `. ${NOT_REVIEWED}`));
  }
```

The fold's summary stays `How the scores are made`.

- [ ] **Step 8: Move the walker's two readings of that fold**

In `engine/verify-reader-features.mjs:2434`:

```js
  check(ten.method.includes(`The score at the top, out of 20`)
      && ten.method.includes("The plain mean of the constitution's figures")
      && ten.method.includes("reads every claim on the list, its own included")
      && !ten.method.includes("put to the others")
      && !/sol|fable|deepseek|kimi/.test(ten.method)
      && ten.methodOpen === false,
    "how the scores are made is folded, says the second method, and names the payload's own seats",
    ten.method.slice(0, 300));
```

- [ ] **Step 9: Run the battery**

Run each of the four commands. Expected: `OK`; `OK`; `# fail 0`; `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 10: Look at it**

Open `http://127.0.0.1:4617/`. Check by eye: the two parts are legible above the board, the scale under the table reads as five plain lines and a sixth with three conditions, and the fold at the foot names no seat before the third paragraph.

- [ ] **Step 11: Commit**

```bash
git add site/overview.html site/overview.js site/depth-scale.js app/lib/__tests__/depth-scale.test.mjs engine/verify-reader-features.mjs
git commit -m "The board of constitutions says what it measures before any figure

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 3: Opening a score on the board of constitutions explains the score

Pressing any figure gives, in one or two plain sentences, what is being scored and what the figure means at that value. The judges' own wording goes into one fold, headed "The detail behind this figure".

**Files:**
- Create: `site/plain-words.js`
- Create: `app/lib/__tests__/plain-words.test.mjs`
- Modify: `site/document-assessment.js:89-107` (`HALVING`, `CONTRADICTIONS_RULE`, `HOW_SETTLED`)
- Modify: `site/overview.js:275-292` (the note builder), `:294-624` (every popover), `:710-731` (the sheet)
- Modify: `site/overview.html:703-708` (one rule for the fold)
- Modify: `engine/verify-reader-features.mjs:2374-2383`, `:2394-2399`, `:2417-2424`

**Interfaces:**
- Consumes: `levelsOf(scale)` and each level's `brief` from Task 2.
- Produces, from `site/plain-words.js`:
  - `FINAL`, `WHOLE`, `CATEGORY`, `BEHAVIOURS`, `DEPTH`: objects with `what` (a string) and, where a figure has bands, `bands` (an array of `[from, to, sentence]`).
  - `CRITERIA_PLAIN`: an object keyed by the five criterion keys of `site/document-assessment.js`, each `{ what, bands }` with the bands read against the figure out of 2.
  - `reading(block, value)`: the sentence for a value in a block's bands.
  - `depthReading(mean, scale)`: the sentence for a depth, using the level's own `brief`, with `DEPTH.partly` added where the figure falls between two levels.
  Task 8 answers over MCP with all six exports.

- [ ] **Step 1: Write the failing test**

Create `app/lib/__tests__/plain-words.test.mjs`:

```js
/**
 * The plain sentences the board opens a figure with.
 *
 * They are held to the two modules they explain: a criterion with no sentence,
 * or a sentence for a criterion the board does not have, is the failure this
 * catches. The sentences themselves are read by a person, not by a test.
 *
 * Run: node --test app/lib/__tests__/plain-words.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { FINAL, WHOLE, CATEGORY, BEHAVIOURS, DEPTH, CRITERIA_PLAIN, reading, depthReading }
  from "../../../site/plain-words.js";
import { CRITERIA } from "../../../site/document-assessment.js";
import { levelsOf } from "../../../site/depth-scale.js";

const site = name => readFile(new URL(`../../../site/${name}`, import.meta.url), "utf8");

test("every criterion the board shows has its own two sentences", () => {
  assert.deepEqual(Object.keys(CRITERIA_PLAIN).sort(),
                   CRITERIA.map(criterion => criterion.key).sort());
  for (const [key, plain] of Object.entries(CRITERIA_PLAIN)) {
    assert.ok(plain.what.endsWith("."), key);
    assert.equal(plain.bands.length, 3, key);
    for (const figure of [0, 0.5, 1, 1.5, 2]) {
      assert.ok(reading(plain, figure).endsWith("."), `${key} at ${figure}`);
    }
  }
});

test("the three figures that are not a criterion carry a sentence too", () => {
  for (const block of [FINAL, WHOLE, CATEGORY, BEHAVIOURS, DEPTH]) {
    assert.ok(block.what.endsWith("."), block.what);
  }
  assert.ok(reading(FINAL, 0).endsWith("."));
  assert.ok(reading(FINAL, 20).endsWith("."));
  assert.ok(reading(WHOLE, 10).endsWith("."));
});

test("a depth reads as the level's own line, and an odd figure says so", () => {
  for (const scale of [4, 10]) {
    for (const level of levelsOf(scale)) {
      assert.equal(depthReading(level.level, scale), level.brief, `${scale} ${level.anchor}`);
    }
  }
  assert.equal(depthReading(7.3, 10),
    `${levelsOf(10)[3].brief} ${DEPTH.partly}`, "7.3 rounds to 7, between two levels");
  assert.equal(depthReading(2.7, 4), levelsOf(4)[3].brief, "every whole number is a level here");
});

test("no sentence names a laboratory, a model or a seat", () => {
  const text = JSON.stringify([FINAL, WHOLE, CATEGORY, BEHAVIOURS, DEPTH, CRITERIA_PLAIN]);
  for (const name of ["OpenAI", "Anthropic", "Alibaba", "Google", "sol", "fable", "deepseek"]) {
    assert.ok(!text.includes(name), `${name} is written into a sentence`);
  }
});

test("the board reads the sentences from here rather than carrying its own", async () => {
  const overview = await site("overview.js");
  assert.match(overview, /from "\.\/plain-words\.js"/);
  assert.ok(!/const (FINAL|WHOLE|CRITERIA_PLAIN)\b/.test(overview), "a copy was declared");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test app/lib/__tests__/plain-words.test.mjs`
Expected: FAIL, `Cannot find module .../site/plain-words.js`.

- [ ] **Step 3: Write the sentences**

Create `site/plain-words.js`:

```js
/* What each figure on the board of constitutions means, in plain words.
 *
 * The figures are made by judges reading rubrics written for judges.
 * site/depth-scale.js and site/document-assessment.js carry those rubrics word
 * for word, and engine/panel/test_site_rubrics.py holds them to the prompts the
 * judges were given. Nothing here replaces one. What is here is what a reader
 * who has never seen the index gets first: what is being scored, and what the
 * figure on screen means at that value.
 *
 * Nothing here quotes the constitution being scored. The passages a reader can
 * open and the list of contradictions carry the evidence.
 *
 * A depth reads as the level's own brief, from depth-scale.js, so the sentence
 * under the board and the sentence in a popover cannot drift apart.
 *
 * Nothing here touches the page, so node imports it for its tests and the MCP
 * server answers with it.
 */
import { levelsOf } from "./depth-scale.js";

/* A band is [from, to, sentence]: the sentence for a figure at or above `from`
 * and below `to`. The last band takes the top of the scale as well. */
export function reading(block, value) {
  const bands = block.bands || [];
  const found = bands.find(([from, to]) => value >= from && value < to);
  return (found || bands[bands.length - 1])[2];
}

export const FINAL = {
  what: "Everything the board measures about one constitution, added together: the document as a "
    + "whole out of 10, and the behaviours it governs out of 10.",
  bands: [
    [0, 7, "At this figure the constitution leaves most of what the index looks for unsaid."],
    [7, 14, "At this figure the constitution does some of what the index looks for and leaves a "
      + "good deal of it open."],
    [14, 20, "At this figure the constitution does most of what the index looks for."],
  ],
};

export const WHOLE = {
  what: "How the constitution is built: whether it settles a clash between its own rules, says "
    + "which rules can be lifted and by whom, gives reasons, reaches the situations its models "
    + "are used in, and keeps itself free of contradictions.",
  bands: [
    [0, 3.5, "At this figure the document leaves most of the five questions open."],
    [3.5, 7, "At this figure the document answers some of the five and leaves the rest open."],
    [7, 10, "At this figure the document answers most of the five."],
  ],
};

export const BEHAVIOURS = {
  what: "How far the constitution goes on the behaviours the index asks about, as a plain mean "
    + "over all of them.",
};

export const CATEGORY = {
  what: "How far the constitution goes on the behaviours in this group, as a plain mean over "
    + "them.",
};

export const DEPTH = {
  what: "How far this constitution goes on this behaviour, from saying nothing about it to "
    + "setting rules and showing them applied.",
  partly: "Part of what the next level asks for is there as well.",
};

/* Keyed as site/document-assessment.js keys its five criteria. The bands are
 * read against the figure the board shows, which is out of 2. */
export const CRITERIA_PLAIN = {
  conflict_rules: {
    what: "What the constitution says to do when two of its own rules pull in opposite "
      + "directions.",
    bands: [
      [0, 0.7, "At this figure the constitution does not say which of its rules wins."],
      [0.7, 1.7, "At this figure the constitution gives an order of priority, or asks for "
        + "judgement, and leaves the harder clashes open."],
      [1.7, 2, "At this figure the constitution ranks its rules, says what happens when two of "
        + "the same rank clash, and shows the ranking applied to a case."],
    ],
  },
  rule_force: {
    what: "Whether a reader can tell, rule by rule, which rules are absolute and which are "
      + "defaults someone may set aside, and who may set them aside.",
    bands: [
      [0, 0.7, "At this figure the constitution does not separate its absolute rules from the "
        + "ones that can be set aside."],
      [0.7, 1.7, "At this figure the constitution marks some of its rules, and over much of the "
        + "text a reader cannot tell a rule from an explanation."],
      [1.7, 2, "At this figure every rule carries its force and says who may change it, and "
        + "commentary is marked apart from instruction."],
    ],
  },
  reasons: {
    what: "Whether the rules say why they exist.",
    bands: [
      [0, 0.7, "At this figure the rules are stated without reasons."],
      [0.7, 1.7, "At this figure some rules carry a reason, usually the strictest ones."],
      [1.7, 2, "At this figure nearly every rule that restrains the model says why, closely "
        + "enough to decide a case the document does not show."],
    ],
  },
  situations: {
    what: "Whether the constitution has rules for the situations its models are used in: "
      + "ordinary conversation, actions the model takes with tools, images and audio and video, "
      + "users who may be children, other AI agents, and deployments a business has customised.",
    bands: [
      [0, 0.7, "At this figure the constitution has rules for ordinary conversation and says "
        + "little about the rest."],
      [0.7, 1.7, "At this figure some of the six situations have rules of their own."],
      [1.7, 2, "At this figure all six situations have rules of their own."],
    ],
  },
  contradictions: {
    what: "Whether the constitution asks for two things that cannot both be done, without saying "
      + "which of its rules wins.",
    bands: [
      [0, 0.7, "At this figure three or more contradictions were confirmed, or one of them "
        + "involves a rule the constitution says can never be overridden."],
      [0.7, 1.7, "At this figure one or two contradictions were confirmed, and none involves a "
        + "rule the constitution says can never be overridden."],
      [1.7, 2, "At this figure no contradiction was confirmed."],
    ],
  },
};

/* A depth, said as the level's own line. On the scale of ten a figure can round
 * to a number that is not a level, and then it is the level below with a line
 * that says the next one is partly met. */
export function depthReading(mean, scale) {
  const levels = levelsOf(scale);
  const top = levels[levels.length - 1].level;
  const rounded = Math.max(0, Math.min(top, Math.round(mean)));
  const here = levels.find(level => level.level === rounded);
  if (here) return here.brief;
  const below = levels.filter(level => level.level < rounded).pop();
  return `${below.brief} ${DEPTH.partly}`;
}
```

- [ ] **Step 4: Run the test**

Run: `node --test app/lib/__tests__/plain-words.test.mjs`
Expected: FAIL on the last test alone, `the board reads the sentences from here rather than carrying its own`, because `site/overview.js` does not import the module yet. The other four pass.

- [ ] **Step 5: Three sentences in document-assessment.js**

These three are the site's own words, not the judges' prompt, and `engine/panel/test_site_rubrics.py` does not read them. In `site/document-assessment.js`:

```js
export const HALVING =
  "Each judge scores from 0 to 4, and the index halves the result so the five criteria add up "
  + "to 10.";

export const CONTRADICTIONS_RULE =
  "Scored from the contradictions the judges confirmed: 2 when none is confirmed, 1 for one or "
  + "two that involve no rule the constitution says can never be overridden, 0 for three or more "
  + "or any that involves one.";

export const HOW_SETTLED =
  "Each judge lists the contradictions it finds. Each of them then reads every claim on the list, "
  + "its own included, and says whether it holds and whether it involves a rule the constitution "
  + "says can never be overridden. A claim is confirmed when two of the three judges say it holds.";
```

`NOT_REVIEWED` keeps its sentence, `No person has reviewed the list.`, which `app/lib/__tests__/document-assessment.test.mjs:144` pins and which belongs beside the figure rather than in a fold.

- [ ] **Step 6: The two builders every popover uses**

In `site/overview.js`, beside the other small builders, and the imports at the top:

```js
import { FINAL, WHOLE, CATEGORY, DEPTH, CRITERIA_PLAIN, reading, depthReading }
  from "./plain-words.js";
```

```js
/* The plain sentences a figure opens with: what is being scored, and what this
 * figure means at the value on screen. Neither quotes the document. */
function plainly(content, what, means) {
  content.append(paragraph(what));
  if (means) content.append(paragraph(means));
}

/* The judges' own wording, folded. It is there for whoever wants it and is not
 * the first thing anyone reads. */
function detail(content, build) {
  const fold = element("details", "detail-fold");
  const summary = element("summary");
  summary.append(element("span", "", "The detail behind this figure"));
  fold.append(summary);
  build(fold);
  content.append(fold);
}

/* The scale in the words the judges read, for the fold. */
function depthBars() {
  const list = element("ol", "anchors");
  levelsOf(state.scale).forEach(({ level: at, anchor, bar }) => {
    const item = element("li");
    const text = element("span");
    text.append(element("span", "anchor-name", anchor), document.createTextNode(`: ${bar}`));
    item.append(element("span", "anchor-level", String(at)), text);
    list.append(item);
  });
  return list;
}
```

`noteUnder` shows nothing where there is no note. Its heading over a missing note said "Not written yet for this specification and behaviour", which is a sentence about our work:

```js
/* A note written beside the index. Where there is none, nothing is shown: a
 * heading over an apology is worse than a shorter popover. */
function noteUnder(heading, text) {
  if (!text) return null;
  const fragment = document.createDocumentFragment();
  fragment.append(board.h3(heading));
  text.split(/\n{2,}/).forEach(block => {
    block.split("\n").filter(Boolean).forEach(line => fragment.append(
      /^[A-Z][A-Z ]+:$/.test(line.trim())
        ? board.h3(line.trim().replace(/:$/, "").toLowerCase().replace(/^./, c => c.toUpperCase()))
        : paragraph(line)));
  });
  return fragment;
}
```

One rule of style, beside `.gov-pop details` in `site/overview.html`:

```css
/* The fold that holds the judges' own wording. Discreet: it opens under the
   sentences a reader came for, and never above them. */
.gov-pop .detail-fold { margin-top: 16px; }
```

- [ ] **Step 7: Rewrite the eleven popovers**

In `site/overview.js`. Every one leads with the figure, then the plain sentences, then what a reader can open, and ends with the fold.

`aboutFinal(content)`: after `board.titled(content, "Final score, out of 20", ...)`, replace the subtitle and the first list with `plainly(content, FINAL.what, null)`, keep the ranking table and keep the closing paragraph. The two-item list of what the halves are is now said by `FINAL.what`, so it goes.

`finalScore(content, column, final)`:

```js
  board.titled(content, `${column.lab}: final score`, `${documentLine(column)} ${rankLine(column)}`);
  content.append(board.figure(shown(final.value), ` out of ${FINAL_MAX}`));
  plainly(content, FINAL.what, reading(FINAL, final.value));
```

then the two chips and the arithmetic as they are, then the button to the whole profile.

`aboutWhole(content)`: `plainly(content, WHOLE.what, null)` in place of the paragraph that opens with "Beside the depth of each behaviour"; the five criterion folds stay, each with `criterion.asks` and its anchors, because this popover is the one a reader opens to read the criteria; `HALVING` moves into a `detail` fold at the foot.

`wholeScore(content, column, assessment)`:

```js
  board.titled(content, `${column.lab}: the document as a whole`, documentLine(column));
  content.append(board.figure(shown(total), ` out of ${WHOLE_MAX}`));
  plainly(content, WHOLE.what, reading(WHOLE, total));
```

then the five folds as they are, then `detail(content, fold => fold.append(paragraph(HALVING)))`.

`aboutCriterion(content, criterion)`:

```js
  board.titled(content, criterion.name, CRITERIA_PLAIN[criterion.key].what);
  content.append(board.h3("What each figure means"));
  content.append(plainBands(criterion.key));
  detail(content, fold => {
    fold.append(board.h3("What the judges were asked"), paragraph(criterion.asks),
      criterionScale(criterion, null),
      paragraph(criterion.key === "contradictions" ? CONTRADICTIONS_RULE : HALVING, "subtitle"));
  });
```

with one more small builder beside the others:

```js
/* The three plain readings of a criterion, lowest first, with the figure's own
 * marked where there is one. */
function plainBands(key, figure = null) {
  const list = element("ol", "anchors");
  CRITERIA_PLAIN[key].bands.forEach(([from, to, sentence]) => {
    const item = element("li");
    if (figure !== null && figure >= from && (figure < to || to === SHOWN_MAX)) {
      item.classList.add("is-here");
    }
    item.append(element("span", "anchor-level", from === 0 ? "0" : String(from)),
      element("span", "", sentence));
    list.append(item);
  });
  return list;
}
```

`criterionScore(content, column, criterion, assessment, part)`:

```js
  board.titled(content, `${column.lab}: ${lowerFirst(criterion.name)}`,
    CRITERIA_PLAIN[criterion.key].what);
  content.append(board.figure(shown(part), ` out of ${SHOWN_MAX}`));
  plainly(content, null, reading(CRITERIA_PLAIN[criterion.key], part));
  content.append(board.h3("What each figure means"), plainBands(criterion.key, part));
  detail(content, fold => {
    fold.append(paragraph(HALVING), board.h3("What the judges were asked"),
      paragraph(criterion.asks), criterionScale(criterion, criterionMean(assessment, criterion.key)),
      board.h3(`The ${Object.keys(judges).length} readings, each out of ${CRITERION_MAX}`),
      readingsList(judges, "score", CRITERION_MAX));
  });
```

`plainly` takes a null `what` and appends only what it is given.

`contradictionsScore(content, column, assessment, part)`:

```js
  board.titled(content, `${column.lab}: ${lowerFirst(criterion.name)}`,
    CRITERIA_PLAIN.contradictions.what);
  content.append(board.figure(shown(part), ` out of ${SHOWN_MAX}`));
  plainly(content, null, reading(CRITERIA_PLAIN.contradictions, part));
  content.append(contradictionsLine(assessment));
```

then the confirmed list and the button to the sheet as they are, then:

```js
  detail(content, fold => {
    fold.append(paragraph(CONTRADICTIONS_RULE), board.h3("What the judges were asked"),
      paragraph(criterion.asks),
      criterionScale(criterion, assessment.contradictions?.score ?? null));
  });
```

`contradictionsLine` keeps the figures the walker reads, in plainer words:

```js
  return paragraph(claims.length
    ? `Each judge read every claim on the list: ${confirmed} confirmed of ${claims.length} `
      + `listed. ${NOT_REVIEWED}`
    : `The judges listed none. ${NOT_REVIEWED}`);
```

`aboutCategory(content, category, members)`: `plainly(content, CATEGORY.what, null)`, then the list of behaviours, then `board.h3("What each figure means")` and `depthScale(null)`, then `board.showInTable(...)`. The subtitle keeps the count of behaviours.

`categoryScore(content, column, category, members, value)`:

```js
  board.titled(content, `${column.lab}: ${lowerFirst(category.name)}`, documentLine(column));
  content.append(board.figure(shown(value), ` out of ${categoryMax()}`));
  plainly(content, CATEGORY.what, depthReading(value, state.scale));
```

then the per-behaviour list as it is.

`aboutBehaviour(content, behaviour)`:

```js
  const entry = state.registry[behaviour.slug] || {};
  board.titled(content, behaviour.name, behaviour.definition || entry.query || "");
  plainly(content, DEPTH.what, null);
  content.append(board.h3("What each figure means"), depthScale(null));
  detail(content, fold => {
    if (entry.query) fold.append(board.h3("What the judges were asked"), paragraph(entry.query));
    if (entry.boundary) fold.append(board.h3("Where the behaviour stops"), paragraph(entry.boundary));
    fold.append(board.h3("The scale in the judges' own words"), depthBars());
  });
```

`behaviourScore(content, column, behaviour, depth)`:

```js
  board.titled(content, `${column.lab}: ${lowerFirst(behaviour.name)}`, behaviour.definition);
  content.append(board.figure(shown(depth.mean),
    ` out of ${state.scale}, ${depthWords(depth.mean, state.scale)}`));
  plainly(content, DEPTH.what, depthReading(depth.mean, state.scale));
  content.append(board.h3("Where this figure sits"), depthScale(depth.mean));
  const read = element("p");
  read.append(link(readerLink({ behavior: behaviour.slug, spec: column.id }),
    "Read the passages in the doc reader"));
  content.append(read);
  const key = `${behaviour.slug}\n${column.id}`;
  detail(content, fold => {
    const judges = Object.keys(depth.judges || {}).length;
    if (judges) {
      fold.append(board.h3(`The ${judges} ${judges === 1 ? "reading" : "readings"}`),
        readingsList(depth.judges, "depth", state.scale));
    }
    const entry = state.registry[behaviour.slug] || {};
    if (entry.query) fold.append(board.h3("What the judges were asked"), paragraph(entry.query));
    fold.append(board.h3("The scale in the judges' own words"), depthBars());
    const why = noteUnder("Why this figure", state.depths[key]?.text);
    if (why) fold.append(why);
    const stands = noteUnder("Where this constitution stands", state.passages[key]?.text);
    if (stands) fold.append(stands);
  });
```

The two notes are written beside the index and quote two or three documents at length. They go in the fold, because the sentences a reader meets first may not quote the constitution being scored. See the open question at the foot of this plan.

`profile`, `notAssessed` and `absentScore` keep the words Task 1 gave them.

- [ ] **Step 8: The contradictions sheet**

In `openContradictions`, the sheet opens on the plain sentence and keeps every claim as it is:

```js
    body.append(paragraph(documentLine(column), "sheet-sub"));
    const figureLine = paragraph("");
    figureLine.append(element("span", "sheet-figure", shown(part)),
      document.createTextNode(` out of ${SHOWN_MAX}.`));
    body.append(figureLine, paragraph(CRITERIA_PLAIN.contradictions.what),
      paragraph(reading(CRITERIA_PLAIN.contradictions, part)));
    const claims = orderedClaims(assessment);
    const confirmed = claims.filter(claim => claim.confirmed);
    body.append(element("h3", null, "How one is found and confirmed"), paragraph(HOW_SETTLED),
      paragraph(NOT_REVIEWED, "missing"));
```

- [ ] **Step 9: Move the walker's three readings of a popover**

In `engine/verify-reader-features.mjs:2374`:

```js
  check(popover.open && popover.body.includes("7.3 out of 10, prescribed and partly demonstrated")
      && popover.body.includes("Part of what the next level asks for is there as well.")
      && popover.here.join() === "prescribed,demonstrated"
      && popover.judges.length === 3
      && popover.headings.includes("The scale in the judges' own words"),
    "a figure opens on its words, its plain reading, its place on the scale and the fold",
    JSON.stringify([popover.headings, popover.here]));
```

at `:2394`:

```js
  check(popover.body.includes("1 confirmed of 2 listed")
      && popover.body.includes("No person has reviewed the list.")
      && popover.buttons.includes("Read the contradictions"),
    "the contradictions say how many were confirmed, that nobody reviewed them, and open the list",
    JSON.stringify([popover.body.slice(0, 200), popover.buttons]));
```

unchanged, and at `:2417`:

```js
  check(sheet.body.includes("Each judge lists the contradictions it finds")
      && sheet.body.includes("reads every claim on the list, its own included")
      && !sheet.body.includes("put to the others"),
    "the sheet says how a contradiction was settled, by the second method",
    sheet.body.slice(0, 300));
```

- [ ] **Step 10: Run the battery**

Run each of the four commands. Expected: `OK`; `OK`; `# fail 0`; `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 11: Look at it**

Open `http://127.0.0.1:4617/` and press, in order: the score at the top of a column, the document as a whole, one criterion, the contradictions, a group and one behaviour. Each opens with a figure and one or two sentences a stranger could follow, and the fold is shut.

- [ ] **Step 12: Commit**

```bash
git add site/plain-words.js site/overview.js site/overview.html site/document-assessment.js app/lib/__tests__/plain-words.test.mjs engine/verify-reader-features.mjs
git commit -m "Opening a score on the board of constitutions explains the score

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 4: The board of governance, in plain words, with its origin named once

The second view gets the same treatment: what it measures said in two parts above the board, the four questions' origin named once where it belongs, and every figure opening on what it means.

**Files:**
- Modify: `site/governance.json` (four `plain` sentences and one `origin`)
- Modify: `site/overview.html:941-976` (the heading, the lede, the hint, the foot)
- Modify: `site/governance.js:229-437` (the popovers), `:601-610` (the legend), `:692-719` (the origin)
- Modify: `site/board.js:200-240` (the `detail` builder, moved here so both views share it)
- Modify: `site/overview.js` (call `board.detail` in place of the local builder Task 3 wrote)
- Modify: `tests/test_governance_tab.py` (one new test)
- Modify: `engine/verify-reader-features.mjs:2124-2135`

**Interfaces:**
- Consumes: `detail(content, build)` from Task 3, which moves into `site/board.js` here as `board.detail(content, build)` and keeps the same summary, "The detail behind this figure".
- Produces: `questions[].plain` and `origin` in `site/governance.json`, which Task 8 answers over MCP.

- [ ] **Step 1: Write the failing test**

In `tests/test_governance_tab.py`, inside `class ThePapersBehindEachRow`:

```python
    def test_every_question_says_in_plain_words_what_it_asks(self):
        # The board opens a figure on this sentence. A question without one
        # would open on the paper's own wording, which is written for a reader
        # who has read the paper.
        for question in DATA["questions"]:
            self.assertTrue(question.get("plain", "").strip(), question["id"])
            self.assertTrue(question["plain"].endswith("."), question["id"])
        self.assertTrue(DATA["origin"].strip())
        self.assertIn("Kembery", DATA["origin"])
        self.assertIn("Polaris Collective", DATA["origin"])
```

- [ ] **Step 2: Run it and watch it fail**

Run: `python3 -m unittest tests.test_governance_tab -v 2>&1 | grep -A 2 "plain_words"`
Expected: FAIL, `KeyError: 'origin'` or an empty `plain`.

- [ ] **Step 3: The four sentences and the origin**

In `site/governance.json`, one `plain` on each question, beside `question` and `explainer`:

- question 1: `Whether the company publishes a constitution at all, and whether that document says which of its models it governs.`
- question 2: `Whether a reader can see what changed in the rules a model follows, when it changed and why.`
- question 3: `Whether the company says which automatic filters it runs around its models, and whether changes to them are recorded.`
- question 4: `Whether the public can see and comment on a weakening of the things the model must never do, before it takes effect.`

and, beside `as_of` and `researched`, one new field:

```json
  "origin": "The four questions come from Polaris Collective's own working paper. The practices beside them come from Kembery et al., Emerging International Best Practices for AI Model Specs. The scores are ours and open to challenge.",
```

- [ ] **Step 4: Run the test**

Run: `python3 -m unittest tests.test_governance_tab -v`
Expected: `OK`.

- [ ] **Step 5: The heading and the lede**

In `site/overview.html`, replacing lines 941 to 958:

```html
  <h1>How each company governs the rules its models follow</h1>
  <p class="lede gov-lede">
    Some AI companies publish a constitution, a document setting out how their models
    should<a class="asterisk" href="/about#why" aria-label="What should means here">*</a> behave.
    This view asks four questions of nine companies, as of September 2026, and scores the answers
    out of 4 each.
  </p>
  <div class="board-parts">
    <p><strong>The four questions, out of 16 together.</strong> Whether the company publishes a
    constitution and says which models it governs, whether every change to the rules a model
    follows can be seen, which filters it runs around its models, and whether the public gets a
    say before one of the things its model must never do is weakened.</p>
    <p><strong>Best practices, outside the total.</strong> Nine further practices, shown beside
    the score and never counted in it.</p>
  </div>
  <p class="gov-foot" id="gov-origin"></p>

  <p class="grid-note" id="gov-status" aria-live="polite">Loading.</p>

  <div class="gov-toolbar">
    <p class="gov-hint">
      Press a figure to see what it means, or a company or a row&rsquo;s name to read about it.
      Open a row to see the checks it is made of.
    </p>
    <button type="button" class="gov-button" id="gov-expand-all" aria-pressed="false">Show every check</button>
  </div>
```

- [ ] **Step 6: The origin, written once from the data**

In `site/governance.js`, `initializeGovernance` gains `origin: byId("gov-origin")` among `board.nodes`, and after `board.labs = ranked(data)`:

```js
  board.nodes.origin.textContent = data.origin;
```

Every other telling of where the practices come from goes, because the lede now carries it:

- `aboutSupporting`: the first paragraph becomes `Nine practices a company can be judged on beside the four questions. Five can be checked by anyone from public sources. Four more only the company can show, and are scored on what it publishes. One only an internal audit could show, and is not scored. Each scored practice is worth 0, 1 or 2, and they are kept out of the total.`
- `supportingScore`: the subtitle becomes `Shown beside the score and left out of it.`
- `aboutSupporting`'s title keeps `Best practices, out of 18`.
- The line across the table keeps `Best practices from a second working paper, by Kembery et al.`, because a reader meets it without opening anything.

- [ ] **Step 7: Move `detail` into the board**

In `site/board.js`, beside `showInTable`:

```js
    /* A fold for the words a reader did not come for: what the judges were
     * asked, what a working paper says, who read what. It opens under the
     * sentences that answer the question, never above them. */
    detail(content, build) {
      const fold = element("details", "detail-fold");
      const summary = element("summary");
      summary.append(element("span", "", "The detail behind this figure"));
      fold.append(summary);
      build(fold);
      content.append(fold);
      return fold;
    },
```

In `site/overview.js`, delete the local `detail` from Task 3 and call `board.detail`.

- [ ] **Step 8: The governance popovers**

In `site/governance.js`. Every figure opens on what is being scored and what the figure means, and the working paper's own words go into the fold.

One small builder, beside `anchorsList`:

```js
/* What a score means, said as one sentence: the description at that score, or a
 * line for a score that sits between two of them. */
function meansAt(anchors, score) {
  return anchors[String(score)]
    || "This score sits between the two descriptions either side of it below.";
}
```

`aboutQuestion(content, question)`:

```js
  view.titled(content, question.name, question.plain);
  content.append(element("p", "", question.explainer));
  if (question.minimum) {
    content.append(view.h3("Part of the minimum"), element("p", "", board.data.minimum_note));
  }
  content.append(view.h3("How it is scored"));
  content.append(element("p", "", `${question.checks.length} checks, each scored from 0 to 4. `
    + "The question's score is their average. Open a check to see what earns each score."));
  question.checks.forEach(check => { /* unchanged */ });
  content.append(view.showInTable(question.id, partsPhrase(question.id)));
  view.detail(content, fold => {
    fold.append(view.h3("What the working paper asks"), element("p", "", question.question),
      paperFold(question));
  });
```

`questionScore(content, lab, question)`:

```js
  view.titled(content, `${lab.name}: ${question.name.toLowerCase()}`, question.plain);
  content.append(view.figure(shown(lab.byQuestion[question.id]), ` out of ${SCALE}`),
    element("p", "", "The average of its checks, each scored from 0 to 4."), checksOf(lab, question));
  content.append(view.h3("What we found"),
    paragraphs(board.data.profiles[lab.id][question.id]), toProfile(lab, question.id));
  view.detail(content, fold => {
    fold.append(view.h3("What the working paper asks"), element("p", "", question.question),
      paperFold(question));
  });
```

`checkScore(content, lab, question, check)`:

```js
  const value = board.data.scores[lab.id][check.id];
  view.titled(content, `${lab.name}: ${check.short.toLowerCase()}`, `${check.label}.`);
  content.append(view.figure(value, " out of 4"),
    element("p", "", meansAt(check.anchors, value)));
  content.append(view.h3("What each score means"), anchorsList(check, value));
  content.append(view.h3(`What we found on ${lab.name}'s ${question.name.toLowerCase()}`),
    paragraphs(board.data.profiles[lab.id][question.id]), toProfile(lab, question.id));
  view.detail(content, fold => {
    fold.append(element("p", "subtitle", `Check ${check.id} of the ${question.name.toLowerCase()} `
      + "question."), paperFold(check));
  });
```

`aboutCheck(content, question, check)`:

```js
  view.titled(content, check.short, `${check.label}.`);
  content.append(element("p", "subtitle",
    `One of the checks on the ${question.name.toLowerCase()} question, scored from 0 to 4.`));
  content.append(view.h3("What each score means"), anchorsList(check, null),
    element("p", "subtitle", "A score of 1 or 3 falls between the descriptions either side of it."));
  view.detail(content, fold => fold.append(paperFold(check)));
```

`practiceScore`, `disclosedScore`, `aboutPractice`, `aboutDisclosedPractice` and `aboutInternalPractice` all move their `paperFold(practice)` into `view.detail(content, fold => fold.append(paperFold(practice)))` and keep every other line. `practiceScore` and `disclosedScore` gain one sentence under the figure:

```js
  content.append(element("p", "", meansAt(practice.anchors || board.data.supporting_scale, value)));
```

`internalScore` keeps its two sentences and puts `What an audit would look at` in the fold.

- [ ] **Step 9: The legend**

In `site/governance.js`, `renderLegend`:

```js
  legend.append(element("span", "", "Colour goes from nothing scored to the most a row can score:"),
    element("span", "", "none"));
```

- [ ] **Step 10: Move the walker's count of folds**

The question popover now carries a `detail-fold` as well as its check folds. In `engine/verify-reader-features.mjs:2129`:

```js
      checks: pop.querySelectorAll("details:not(.paper-fold):not(.detail-fold)").length,
```

- [ ] **Step 11: Run the battery**

Run each of the four commands. Expected: `OK`; `OK`; `# fail 0`; `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 12: Look at it**

Open `http://127.0.0.1:4617/?view=governance`. The two parts and the origin read above the board, the origin is said once, and a check's figure opens on the description of that score.

- [ ] **Step 13: Commit**

```bash
git add site/governance.json site/governance.js site/overview.html site/overview.js site/board.js tests/test_governance_tab.py engine/verify-reader-features.mjs
git commit -m "The board of governance says what it asks, and where the questions come from

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 5: What we scored, and what we did not find

The four folds under the board of governance are written for a reader who has not read a working paper, and no sentence in them describes how the work was carried out.

**Files:**
- Modify: `site/overview.html:989-1239` (the four folds: how to read this ranking, how we scored, what we could not check, sources)

**Interfaces:**
- Consumes: the word, settled in Task 1; the origin, named once in Task 4.
- Produces: nothing other tasks read.

- [ ] **Step 1: How to read this ranking**

Replace the body of `#gov-reading` with these five paragraphs, keeping the `<strong>` lead on each:

```html
        <p>
          <strong>Publishing a constitution and covering models with it are scored
          separately.</strong> Alibaba's constitution names no model, and on a single
          "has a constitution" column it would score the same as one that binds a
          company's products.
        </p>
        <p>
          <strong>The checks say more than the overall score.</strong> OpenAI and
          Anthropic have the same overall score and fall short in opposite ways.
          OpenAI keeps a record of its versions and does not list the things its
          models must never do, while Anthropic lists them and keeps no record of
          its versions.
        </p>
        <p>
          <strong>Companies whose models anyone can download are marked.</strong>
          Mistral AI, Moonshot AI and DeepSeek take three of the four lowest places.
          These questions have no way to reach a model once it has been downloaded,
          so the table marks these companies "Open weights".
        </p>
        <p>
          <strong>The bottom of the ranking comes down to the first question.</strong>
          Six of the nine companies publish no constitution, so most of the grid
          cannot apply to them and they sit at the bottom for that reason. Among the
          companies that do publish, the change log is what separates them.
        </p>
        <p>
          <strong>A caveat.</strong> The four questions were written to argue for
          change, and scoring them gives them more precision than they were designed
          for. The descriptions of each score are ours, and a different reading could
          move a company by a few points. The wider picture would stay: all nine fall
          short on the change log, none offers a comment period before one of the
          things a model must never do is weakened, and none covers government,
          defence and other special deployments.
        </p>
```

- [ ] **Step 2: How we scored**

Replace the prose of `#gov-method`, keeping `<div id="gov-scoring"></div>` and the three lists that `governance.js` fills:

```html
        <p>
          The four questions are the four asks of Polaris Collective's working paper,
          in its draft of 10 September 2026. Each is split into checks scored from 0
          to 4: three for each of the first two questions and two for the others. The
          first two are what the paper calls its minimum, the asks it expects of every
          company before the other two: a published constitution for every model in
          use, and one public change log. A question's score is the average of its
          checks, and the overall score is the sum of the four questions, out of 16,
          so every question weighs the same.
        </p>
        <p>
          The tables below say what earns 0, 2 and 4 on each check. A score of 1 or 3
          falls between the descriptions either side of it.
        </p>
```

and the three headings under it, in plain words:

```html
        <h3>Best practices, outside the total</h3>
        <p>
          Five further practices, from Kembery et al., Emerging International Best
          Practices for AI Model Specs, keeping only those anyone can check from
          public sources. Each is scored 0, 1 or 2, for a total out of 10. They are
          shown beside the ranking and left out of its total, because they measure
          related good practice. The paper gives no description of each score. In our
          scoring, 2 is the practice in full, 1 part of it or a weaker form of it, and
          0 means we found nothing.
        </p>
        <ul class="gov-bullets" id="gov-supporting"></ul>
        <h3>Best practices only the company can show</h3>
        <p>
          Four more practices from the same paper. Nobody outside a company can see
          whether it follows them, and the paper asks companies to say so publicly.
          Each is scored 0, 1 or 2 on what the company publishes, and 0 when it
          publishes nothing. A company may well follow a practice without saying so:
          where we score 0, we found nothing published and no audit anyone can verify.
          Tell us if we are wrong.
        </p>
        <ul class="gov-bullets" id="gov-disclosed"></ul>
        <h3>A best practice only an internal audit could score</h3>
        <p>
          One more practice from the same paper, which it raises as an open problem
          and does not ask companies to publish. Only an internal audit could show it.
          No such audit has been done, every company is marked NA, not assessed, and it
          counts towards nothing.
        </p>
        <ul class="gov-bullets" id="gov-internal"></ul>
        <h3>Who the companies are</h3>
```

The paragraph naming the three companies behind their trading names is already plain and stays word for word.

- [ ] **Step 3: What we could not check**

Replace the body of `#gov-limits`. Every sentence is a statement about a document, and none says how the reading was done:

```html
        <p>
          Every score rests on a document we found and dated, as of 18 September 2026.
          These points are open.
        </p>
        <ul class="gov-bullets">
          <li>
            <strong>We did not read Alibaba's constitution at its own address.</strong>
            The text we used is the copy this index holds, 210 passages of it, word for
            word, at
            <a href="/spec-reader/?spec=alibaba--model-spec@2026-04-00">its April
            2026 version</a>. The index keeps only passages that bear on a behaviour,
            so prefaces and boilerplate are not in it. Two things reported elsewhere as
            part of the preface, an invitation to public comment and an acknowledgement
            of safeguards the service applies around the model, are neither confirmed
            nor ruled out. A statement of coverage in the preface would change
            Alibaba's score on check 1.2.
          </li>
          <li>
            <strong>We did not find older copies of the undated pages.</strong> Where a
            page carries no date and no earlier copy, a quiet edit to it would not show.
            This matters most for Google, where three of the relevant documents carry no
            date at all, and for DeepSeek, whose disclosure page has no earlier copy we
            could find.
          </li>
          <li>
            <strong>We did not find the Chinese regulatory filings.</strong> The
            Cyberspace Administration of China publishes its lists as attachments we did
            not find. So when we say Moonshot AI publishes no filing number, we mean we
            found none on its own sites.
          </li>
          <li>
            <strong>Whether Anthropic has signed the EU Code of Practice is
            unconfirmed.</strong> Its July 2025 post says it "intends to sign"; its own
            page of voluntary commitments does not list it. No score depends on this.
          </li>
          <li>
            <strong>Which chapters of the EU Code of Practice Mistral has signed is
            unconfirmed.</strong> The European Commission's list names Mistral with no
            exception, and sets out chapters only for xAI. No score depends on this.
          </li>
          <li>
            <strong>Some details of Claude Mythos</strong> rest partly on second-hand
            accounts. That no constitution has been published for it is confirmed from
            Anthropic's own pages.
          </li>
          <li>
            <strong>We did not find what Meta's log of updates to its Community
            Standards contains</strong>, so our view that it does not cover AI is an
            inference we have not checked.
          </li>
          <li>
            <strong>The release date of Kimi K3 is disputed</strong> between Moonshot
            AI's own blog (27 July 2026, for the downloadable model) and the UK AI
            Security Institute and Wikipedia (16 July 2026). No score depends on this.
          </li>
          <li>
            <strong>All scores are ours.</strong> None comes from an established,
            published scoring method.
          </li>
        </ul>
```

- [ ] **Step 4: Sources**

`#gov-sources` keeps every link and every publisher's name. Only the three headings change, and Task 1 changed them.

- [ ] **Step 5: Run the battery**

Run each of the four commands. Expected: `OK`; `OK`; `# fail 0`; `ALL FEATURE CHECKS PASSED.`

`tests/test_governance_tab.py`'s `HouseRules` reads the whole governance panel, so a long dash or one of the four banned words in the copy above fails there. Both tests must be green without being touched.

- [ ] **Step 6: Commit**

```bash
git add site/overview.html
git commit -m "What we scored, and what we did not find, in plain statements about documents

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 6: The about page

Simplified for the same reader, keeping one short technical section about the repository and running it yourself. Everything else in plain words.

**Files:**
- Modify: `site/about.html:420-742` (the sections; the forms, the dialogs, the scripts and the footer are untouched except where Task 1 changed a label)

**Interfaces:**
- Consumes: the word, settled in Task 1.
- Produces: the glossary entry `AI Constitutions Index`, which `site/brand.js` lifts into the note behind the wordmark on every page. Its shape must stay: a `<dt>` whose text is exactly `AI Constitutions Index`, followed by a `<dd>` of `<p>` elements.

- [ ] **Step 1: What this is**

Replace `#tldr`. The one antithesis this page is allowed is in its third sentence, because the contrast is the whole caveat:

```html
  <section class="m" id="tldr">
    <h2>What this is</h2>
    <p class="lead">AI companies publish constitutions: long documents saying how their models
    should<a class="asterisk" href="#why" aria-label="What should means here">*</a> behave. This
    index reads them one behaviour at a time and shows every passage that bears on each behaviour,
    quoted, with its exact place in the document. As of September 2026 it reports what those
    documents say, not how the models behave.</p>
    <p>Say you want everything Claude&rsquo;s Constitution says about avoiding a concentration of
    power. The <a href="/spec-reader/?behavior=avoiding-illegitimate-concentration-of-power&amp;spec=anthropic--constitution@2026-01-20">doc
    reader</a> shows those passages together and can set them beside what another company&rsquo;s
    document says.</p>
    <p>The <a href="/">overview</a> holds two boards. The first,
    <a href="/">what the constitutions say</a>, scores each constitution as a document and
    behaviour by behaviour. The second, <a href="/?view=governance">how they are governed</a>, asks
    four questions of nine companies about the rules their models follow.</p>
  </section>
```

- [ ] **Step 2: Why it matters**

`#why` keeps its two paragraphs on what a model is and how it is trained. Its list becomes:

```html
    <ol class="steps">
      <li><b>Agree on precise rules.</b> Before a model can be trained to behave well, someone
      has to write down what it must do and what it must never do. That is what a constitution is
      for, and it is what this index reads.</li>
      <li><b>Check that the model follows them.</b> A constitution matters only if the model was
      trained on it and behaves as it says. This index does not measure that yet, and it is part
      of <a href="#ambition">our ambition</a>.</li>
    </ol>
```

- [ ] **Step 3: The words we use**

Replace the first two entries of the glossary and rewrite the last. The `<dt>` text `AI Constitutions Index` stays exactly as it is, because `site/brand.js` finds the entry by it:

```html
      <dt>AI Constitutions Index</dt>
      <dd>
        <p>These documents set down the values a model should hold and the rules it has to follow.
        We call them constitutions, and the index is named after them.</p>
        <p>A constitution could also say how a model is trained and tested against those values,
        and how the company that made it answers for them. The index reads what is published today
        and argues for the rest.</p>
      </dd>
      <dt>Constitution</dt>
      <dd>
        <p>The document in which an AI company sets out how its models should behave. Each company
        names its own: Anthropic publishes Claude&rsquo;s Constitution, OpenAI the Model Spec,
        Alibaba the Alibaba Model Spec. The index calls them all constitutions.</p>
      </dd>
```

`Behaviour` and `Passage` keep their entries, with "constitution" where Task 1 put it. `Depth` is rewritten, because the figure runs to 10 on the newest publications and the entry still says 4:

```html
      <dt>Depth</dt>
      <dd>
        <p>How far a constitution goes on one behaviour. The newest publications score it from 0,
        saying nothing about the behaviour, to 10, setting rules, showing them applied and settling
        the hard cases. Earlier publications score it from 0 to 4. Each judge gives a figure and
        the index shows the mean of the three.</p>
      </dd>
```

- [ ] **Step 4: What the index reads, and who reads it**

Replace the section headed `Documents, behaviours and how they are read`:

```html
  <section class="m">
    <h2>What the index reads, and who reads it</h2>
    <p>As of September 2026 the index reads four constitutions: Claude&rsquo;s Constitution
    (2026-01-20), the OpenAI Model Spec in two versions (2025-12-18 and 2026-08-18) and the
    Alibaba Model Spec (2026-04-00). Each runs to tens of thousands of words, and what it says
    about any one subject is spread across it.</p>
    <p>Each version is read as a document of its own, named
    <code>&lt;company&gt;--&lt;document&gt;@&lt;version&gt;</code>, so the two OpenAI versions are
    judged and cited separately. The Alibaba Model Spec is published in Chinese. The index reads an
    English translation made by Claude Opus 5 and partly revised by Claude Fable 5, and the doc
    reader shows the original beside every passage.</p>
    <p>As of September 2026 the index asks about thirteen behaviours, in four groups: autonomy,
    oversight and authority; harm and safety; helpfulness and judgement; honesty and
    epistemics.</p>
    <p>Three models from three different companies read each document against the description of
    each behaviour: GPT-5.6 Sol, Claude Fable 5 and DeepSeek V3.2. Each of them marks every passage
    that bears on the behaviour, and gives the document a figure for how far it goes. The index
    publishes the mean of the three, and the doc reader shows how each of them read each passage.
    Three readings that agree are closer to a finding than one reading on its own.</p>
    <p>Sometimes one of the three cannot answer at all, because a filter withholds its reply. A
    model named in advance then reads in its place, and the index records which one and why. As of
    September 2026 that happened on harm avoidance to third parties in both OpenAI versions, and on
    every behaviour of the Alibaba Model Spec, where every Anthropic model was refused.</p>
    <p>In the <a href="/spec-reader/">doc reader</a>, tick a behaviour and every passage that bears
    on it is highlighted in the document you are reading, or in two documents side by side. All
    three bands are shown by default, with related passages drawn softer, and each band can be
    switched off. Clicking a passage shows how each of the three read it. The <b>i</b> beside each
    behaviour shows the description it was judged against. The export saves the passages you ticked
    as a file.</p>
  </section>
```

- [ ] **Step 5: The two proposals, and what the index does not tell you**

The two propose sections keep their structure, their forms and their ids. Their opening lines become `If there is a constitution the index should be reading, send it here.` and, unchanged, `If the index should be asking about a behaviour it does not yet cover, send it here.`

`What it does not tell you` becomes:

```html
    <p>The index reports what a document says. A constitution that covers a behaviour thoroughly
    is no evidence that the model follows it, and measuring that is separate work the citations
    here can feed.</p>
    <p>When two companies&rsquo; documents treat a behaviour differently, it is usually because
    they made different choices. A figure measures how much a document gives an evaluation to work
    with.</p>
    <p>For the Alibaba Model Spec the index reports what the English translation says, and the doc
    reader shows the original for comparison.</p>
```

- [ ] **Step 6: Citing what you find**

The section keeps its locators, its citation block and its credit paragraphs. One sentence goes, because it describes our work rather than the reader's: `A scheduled job resolves every published citation against the stored document and fails if a single quote has moved.` The sentence before it, `Anyone can resolve a locator back to its text.`, stays.

- [ ] **Step 7: One technical section**

Replace both `Andr&eacute;s&rsquo;s original tool` and `Run it yourself` with one section, last on the page:

```html
  <section class="m" id="run-it-yourself">
    <h2>The repository, and running it yourself</h2>
    <p><b>This index began as the AI Character Index, created by
    <a href="https://github.com/AndresCotton" target="_blank" rel="noopener">Andr&eacute;s
    Cotton</a> with the help of <a href="https://github.com/MattStults" target="_blank"
    rel="noopener">Matt Stults</a>, and most of what is described here is their work.</b> It was
    supported by Generator Residency (Kairos &amp; Constellation) and BlueDot Impact, and it is
    published at <a href="https://ai-character-index.pages.dev" target="_blank"
    rel="noopener">ai-character-index.pages.dev</a>.</p>
    <p>Both repositories are public, and either one judges a document on your own machine, with
    your own documents and behaviours, without an account or a database. The original is built
    around git: the behaviours, the documents and the verdicts are files, so a change to the index
    is a commit and a contribution is a pull request. It needs Python, a browser and an API
    key.</p>
    <pre><code>git clone https://github.com/AndresCotton/ai-character-index.git
cd ai-character-index
python3 -m http.server 8080 --directory site</code></pre>
    <p>Ours, <a href="https://github.com/polariscollective/ai-character-index" target="_blank"
    rel="noopener">polariscollective/ai-character-index</a>, serves this site. It adds a hosted
    database and a portal that runs the judging and publishes the results, which makes it the
    heavier of the two to clone. It also runs on one machine with one API key:</p>
    <pre><code>python3 engine/local_run.py \
    --document=my-constitution@2026-09-12:path/to/document.md \
    --behaviour=path/to/behaviour.json \
    --panel=frontier_fast</code></pre>
    <p>A document is any markdown file, and a behaviour is a small JSON file with its name, what it
    requires and where it stops. Neither needs registering, and they are judged with the same
    panel, prompt and parser as this site. Nothing is sent to us, and the document goes only to the
    model providers you call. The results are written to <code>artefacts/</code>, and the README
    describes each file.</p>
  </section>
```

- [ ] **Step 8: Run the battery**

Run each of the four commands. Expected: `OK`; `OK`; `# fail 0`; `ALL FEATURE CHECKS PASSED.`

`tests/test_page_feedback_bubble.py` requires the three script tags at the foot of `site/about.html` to stay exactly as they are.

- [ ] **Step 9: Look at it**

Open `http://127.0.0.1:4617/about`. Read it from the top as someone who has never seen the site. Press the wordmark on any page and check that the note behind it still shows the name's own paragraphs, which `site/brand.js` lifts from the glossary.

- [ ] **Step 10: Commit**

```bash
git add site/about.html
git commit -m "The about page explains the index to someone who has not seen it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 7: The badge

The "Development" tag becomes a "Work in progress" tag with a small question mark, so a reader sees it can be pressed. Behind it, two sentences and nothing more.

**Files:**
- Create: `tests/test_work_in_progress_tag.py`
- Modify: `site/dev-tag.js:40-160`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks read. What decides whether the tag appears is unchanged: `publication.is_public === false || publication.development === true`. See the open questions at the foot of this plan.

- [ ] **Step 1: Write the failing test**

Create `tests/test_work_in_progress_tag.py`:

```python
"""The tag beside the wordmark, and the two sentences behind it.

site/dev-tag.js is one file for four pages. Nothing else on the site says what
a figure is worth, so what it says is held here: a tag a reader can see is
pressable, two sentences, and nothing more.

What raises the tag is held too. It is a claim about the build on screen, and a
change to it is a change to who is warned.

No network, no keys. Run: python3 -m unittest discover -s tests
"""
import re
import unittest
from pathlib import Path

SOURCE = (Path(__file__).resolve().parents[1] / "site" / "dev-tag.js").read_text(encoding="utf-8")


class TheTag(unittest.TestCase):
    def test_it_says_work_in_progress_and_shows_it_can_be_pressed(self):
        self.assertIn('tag.append(document.createTextNode("Work in progress "), ask)', SOURCE)
        self.assertIn('const ask = document.createElement("span")', SOURCE)
        self.assertIn('ask.textContent = "?"', SOURCE)
        self.assertNotIn("Development", SOURCE)

    def test_two_sentences_and_nothing_more(self):
        lines = re.search(r"const LINES = \[(.*?)\];", SOURCE, re.DOTALL).group(1)
        self.assertEqual(lines.count('"What is published here may still change."'), 1)
        self.assertIn("a panel of three judges from different model families", lines)
        self.assertEqual(len(re.findall(r'^\s+"', lines, re.MULTILINE)), 2)
        for gone in ("the published index", "has not been reviewed", "provisional"):
            self.assertNotIn(gone, SOURCE, gone)

    def test_what_raises_it_is_unchanged(self):
        self.assertIn("publication.is_public === false || publication.development === true", SOURCE)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it and watch it fail**

Run: `python3 -m unittest tests.test_work_in_progress_tag -v`
Expected: FAIL on all three, the first on `Development`.

- [ ] **Step 3: Write the tag**

In `site/dev-tag.js`, the two sentences:

```js
/* Said about the index rather than about this build: whoever reads it is being
 * told what a figure on this page is worth. */
const LINES = [
  "What is published here may still change.",
  "The method comes from working papers and reviews, and the figures come from a panel of "
  + "three judges from different model families, whose readings are combined.",
];
```

`build(brand)` loses the paragraph with the link to the published index, and the tag gains its question mark:

```js
  const note = document.createElement("dialog");
  note.className = "dev-note";
  const title = document.createElement("h2");
  title.textContent = "Work in progress";
  note.append(title, ...LINES.map(paragraph));

  const close = document.createElement("button");
  close.type = "button";
  close.className = "dev-close";
  close.textContent = "Close";
  close.addEventListener("click", () => note.close());
  note.append(close);

  const tag = document.createElement("button");
  tag.type = "button";
  tag.className = "dev-tag";
  // The question mark is the whole of the invitation: a pill that says nothing
  // else looks like a label, and nobody presses a label.
  const ask = document.createElement("span");
  ask.className = "dev-ask";
  ask.setAttribute("aria-hidden", "true");
  ask.textContent = "?";
  tag.append(document.createTextNode("Work in progress "), ask);
  tag.title = "What this means";
  tag.addEventListener("click", () => note.showModal());

  brand.append(tag);
  document.body.append(note);
```

and one rule in `STYLE`:

```css
.dev-ask {
  display: inline-grid;
  place-items: center;
  width: 13px;
  height: 13px;
  margin-left: 1px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  vertical-align: 1px;
}
```

The constant `PUBLISHED` and its comment go with the paragraph that used it.

- [ ] **Step 4: Run the test**

Run: `python3 -m unittest tests.test_work_in_progress_tag -v`
Expected: `OK`, three tests.

- [ ] **Step 5: Run the battery, then look at it**

Run each of the four commands. Expected: `OK`; `OK`; `# fail 0`; `ALL FEATURE CHECKS PASSED.`

Open `http://127.0.0.1:4617/`, whose publication is a draft, so the tag is raised. Check the pill reads "Work in progress" with a small ringed question mark, and that pressing it opens two sentences and a close button.

- [ ] **Step 6: Commit**

```bash
git add site/dev-tag.js tests/test_work_in_progress_tag.py
git commit -m "The badge says work in progress, and says what that means

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 8: The two boards over MCP

Two new tools give a client the content of the two boards: the figures, the scales, and the explanations, with an optional filter by company.

**Files:**
- Create: `app/lib/board-tools.mjs`
- Create: `app/lib/__tests__/board-tools.test.mjs`
- Modify: `site/governance.js` (export `meansAt`, written in Task 4)
- Modify: `app/lib/mcp-tools.mjs:576-619` (`INSTRUCTIONS`) and `:744-756` (the tools `about` names)
- Modify: `app/api/mcp/route.js:18-20`, `:68-171`
- Modify: `app/lib/__tests__/mcp-tools.test.mjs:598-603`

**Interfaces:**
- Consumes: `FINAL`, `WHOLE`, `BEHAVIOURS`, `CATEGORY`, `DEPTH`, `CRITERIA_PLAIN`, `reading`, `depthReading` from `site/plain-words.js` (Task 3); `questions[].plain` and `origin` from `site/governance.json` (Task 4); `ranked` and `meansAt` from `site/governance.js`.
- Produces:
  - `constitutionsBoard(snapshot, { company } = {})`, answering `{ publication, measures, constitutions }`.
  - `governanceBoard({ company } = {})`, answering `{ as_of, origin, measures, companies }`.
  Both throw `ToolError` where a company name matches nothing.

- [ ] **Step 1: Write the failing test**

Create `app/lib/__tests__/board-tools.test.mjs`:

```js
/**
 * The two boards, as answers. Against the reader fixtures, so nothing here
 * touches a network and no figure of the real index is written down.
 *
 * Run: node --test app/lib/__tests__/board-tools.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { constitutionsBoard, governanceBoard } from "../board-tools.mjs";
import { ToolError } from "../mcp-tools.mjs";

const read = async name => JSON.parse(await readFile(
  new URL(`../../../tests/fixtures/reader/${name}`, import.meta.url), "utf8"));

const payload = await read("ten/behaviours.json");
const documents = await read("documents.json");
const snapshot = () => ({
  publication: { id: "c3a5e0d2-9f47-4b8e-a1d6-5e2f7b9c0a14",
                 published_at: "2026-09-21T10:00:00+00:00" },
  payload, documents, notes: {},
});

test("the board of constitutions answers every figure with its scale and its meaning", () => {
  const answer = constitutionsBoard(snapshot());
  assert.equal(answer.publication.id, "c3a5e0d2-9f47-4b8e-a1d6-5e2f7b9c0a14");
  assert.equal(answer.measures.depth.max, 10);
  assert.equal(answer.measures.depth.levels.length, 6);
  for (const level of answer.measures.depth.levels) {
    assert.ok(level.means.endsWith("."), level.anchor);
    assert.ok(level.asked.length > level.means.length - 40, level.anchor);
  }
  assert.equal(answer.measures.whole_document.criteria.length, 5);
  const one = answer.constitutions.find(item => item.score);
  assert.ok(one, "no constitution carries a score");
  assert.equal(one.score.max, 20);
  assert.ok(one.score.means.endsWith("."));
  assert.equal(one.whole_document.criteria.length, 5);
  assert.ok(one.behaviours.cells.every(cell => cell.means && cell.max === 10));
});

test("a company argument narrows it, and an unknown one says what there is", () => {
  const all = constitutionsBoard(snapshot());
  const named = constitutionsBoard(snapshot(), { company: all.constitutions[0].lab.toLowerCase() });
  assert.ok(named.constitutions.length >= 1);
  assert.ok(named.constitutions.length <= all.constitutions.length);
  assert.throws(() => constitutionsBoard(snapshot(), { company: "nobody at all" }),
                error => error instanceof ToolError && /This publication carries/.test(error.message));
});

test("the board of governance answers the nine companies in the board's own order", () => {
  const answer = governanceBoard();
  assert.equal(answer.companies.length, 9);
  assert.deepEqual(answer.companies.map(company => company.rank).slice(0, 3), [1, 1, 3]);
  assert.equal(answer.companies[0].overall.max, 16);
  assert.equal(answer.measures.questions.length, 4);
  for (const question of answer.measures.questions) {
    assert.ok(question.means.endsWith("."), question.id);
    assert.ok(question.checks.length >= 2, question.id);
  }
  assert.match(answer.origin, /Kembery/);
  assert.equal(answer.as_of, "September 2026");
});

test("a company argument narrows the governance board too", () => {
  const answer = governanceBoard({ company: "anthropic" });
  assert.equal(answer.companies.length, 1);
  assert.equal(answer.companies[0].name, "Anthropic");
  assert.ok(answer.companies[0].questions[0].found.length > 0, "the paragraph we wrote is there");
  assert.throws(() => governanceBoard({ company: "nobody at all" }),
                error => error instanceof ToolError && /This board carries/.test(error.message));
});

test("the route registers both, and about names them", async () => {
  const route = await readFile(new URL("../../api/mcp/route.js", import.meta.url), "utf8");
  assert.match(route, /registerTool\("constitutions_board"/);
  assert.match(route, /registerTool\("governance_board"/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test app/lib/__tests__/board-tools.test.mjs`
Expected: FAIL, `Cannot find module .../app/lib/board-tools.mjs`.

- [ ] **Step 3: Write the module**

Create `app/lib/board-tools.mjs`:

```js
/**
 * The two boards of the overview, as answers.
 *
 * A client asking the index what it holds should be able to get what a reader
 * sees: the figures, the scale each one is on, and the sentence that says what
 * a figure means. Both functions are built from the files the pages are built
 * from, so a client and a reader are never told different things.
 *
 *   site/document-assessment.js  the figures of the first board
 *   site/plain-words.js          what each of them means, in plain words
 *   site/governance.js           the ranking of the second board
 *   site/governance.json         its scores and its words
 *
 * Pure, as app/lib/mcp-tools.mjs is: the first takes a snapshot, the second
 * takes nothing, and a fixture exercises both with no network. The JSON is
 * imported the way app/lib/admin-data.mjs imports the panel's configuration.
 */
import governance from "../../site/governance.json" with { type: "json" };
import { ranked as rankedCompanies, meansAt } from "../../site/governance.js";
import { CRITERIA, SHOWN_MAX, WHOLE_MAX, FINAL_MAX, wholeFigures, behavioursFigure,
         categoryFigure, finalFigure } from "../../site/document-assessment.js";
import { depthScaleOf, levelsOf } from "../../site/depth-scale.js";
import { FINAL, WHOLE, BEHAVIOURS, DEPTH, CRITERIA_PLAIN, reading, depthReading }
  from "../../site/plain-words.js";
import { ToolError } from "./mcp-tools.mjs";

const OVERALL = 16;
const PRACTICE = 2;

/** A company named in an argument, matched loosely: "openai" finds OpenAI. */
const matches = (name, wanted) =>
  !wanted || String(name).toLowerCase().includes(String(wanted).toLowerCase().trim());

/** The behaviours of one publication, grouped as the board groups them. */
function groupsOf(behaviours) {
  const byName = new Map();
  behaviours.forEach(behaviour => {
    const name = behaviour.category || "Behaviours under test";
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(behaviour);
  });
  return [...byName].map(([name, members]) => ({ name, members }));
}

export function constitutionsBoard({ publication, payload, documents }, args = {}) {
  const scale = depthScaleOf(payload);
  const behaviours = payload.behaviours || [];
  const assessment = payload.assessment && typeof payload.assessment === "object"
    ? payload.assessment : null;
  const groups = groupsOf(behaviours);
  const all = documents.documents || [];
  const columns = all.filter(document => matches(document.lab, args.company));
  if (!columns.length) {
    throw new ToolError(`no constitution from ${args.company}. This publication carries: `
      + `${all.map(document => document.lab).join(", ")}`);
  }
  return {
    publication,
    measures: {
      score: { max: FINAL_MAX, means: FINAL.what },
      whole_document: {
        max: WHOLE_MAX,
        means: WHOLE.what,
        criteria: CRITERIA.map(criterion => ({
          key: criterion.key,
          name: criterion.name,
          max: SHOWN_MAX,
          means: CRITERIA_PLAIN[criterion.key].what,
          asked: criterion.asks,
          anchors: criterion.anchors,
        })),
      },
      behaviours: { max: scale, means: BEHAVIOURS.what },
      depth: {
        max: scale,
        means: DEPTH.what,
        levels: levelsOf(scale).map(({ level, anchor, brief, bar }) =>
          ({ level, anchor, means: brief, asked: bar })),
      },
    },
    constitutions: columns.map(column => {
      const held = assessment?.[column.id] ?? null;
      const final = finalFigure(behaviours, held, column);
      const figure = behavioursFigure(behaviours, column);
      const whole = held ? wholeFigures(held) : null;
      return {
        id: column.id,
        lab: column.lab,
        title: column.title,
        version: column.version,
        source_url: column.sourceUrl ?? null,
        score: final
          ? { figure: final.value, max: FINAL_MAX, means: reading(FINAL, final.value) }
          : null,
        whole_document: whole
          ? {
            figure: whole.total,
            max: WHOLE_MAX,
            means: reading(WHOLE, whole.total),
            criteria: CRITERIA.map((criterion, index) => ({
              key: criterion.key,
              figure: whole.parts[index],
              max: SHOWN_MAX,
              means: reading(CRITERIA_PLAIN[criterion.key], whole.parts[index]),
            })),
          }
          : null,
        behaviours: figure
          ? {
            figure: figure.value,
            max: scale,
            over: figure.count,
            means: depthReading(figure.value, scale),
            groups: groups.map(group => {
              const value = categoryFigure(group.members, column);
              return value === null
                ? null
                : { name: group.name, figure: value, max: scale,
                    means: depthReading(value, scale) };
            }).filter(Boolean),
            cells: behaviours.map(behaviour => {
              const depth = behaviour.coverage?.[column.id]?.depth;
              return Number.isFinite(depth?.mean)
                ? { behaviour: behaviour.slug, name: behaviour.name,
                    group: behaviour.category ?? null, figure: depth.mean, max: scale,
                    means: depthReading(depth.mean, scale) }
                : null;
            }).filter(Boolean),
          }
          : null,
      };
    }),
  };
}

/* The second board is not part of any publication: it is nine companies scored
 * on four questions, as of the date the data carries. */
export function governanceBoard(args = {}) {
  const companies = rankedCompanies(governance)
    .filter(company => matches(company.name, args.company));
  if (!companies.length) {
    throw new ToolError(`no company called ${args.company}. This board carries: `
      + `${governance.labs.map(lab => lab.name).join(", ")}`);
  }
  const asked = governance.internal.filter(practice => practice.asked_to_publish);
  const practices = [...governance.supporting, ...governance.internal];
  return {
    as_of: governance.as_of,
    origin: governance.origin,
    measures: {
      overall: { max: OVERALL, means: "The four questions added together, each out of 4." },
      questions: governance.questions.map(question => ({
        id: question.id,
        name: question.name,
        max: 4,
        means: question.plain,
        asked: question.question,
        part_of_the_minimum: Boolean(question.minimum),
        checks: question.checks.map(check => ({
          id: check.id, name: check.short, max: 4,
          means: `${check.label}.`, anchors: check.anchors,
        })),
      })),
      best_practices: {
        max: PRACTICE * (governance.supporting.length + asked.length),
        means: "Practices shown beside the score and never counted in it.",
        practices: practices.map(practice => ({
          id: practice.id,
          name: practice.short,
          means: practice.label,
          scored: practice.asked_to_publish !== false,
          anchors: practice.anchors || governance.supporting_scale,
        })),
      },
    },
    companies: companies.map(company => ({
      id: company.id,
      name: company.name,
      rank: company.rank,
      open_weights: Boolean(company.open_weights),
      overall: { figure: company.total, max: OVERALL },
      questions: governance.questions.map(question => ({
        id: question.id,
        figure: company.byQuestion[question.id],
        max: 4,
        checks: question.checks.map(check => ({
          id: check.id,
          figure: governance.scores[company.id][check.id],
          max: 4,
          means: meansAt(check.anchors, governance.scores[company.id][check.id]),
        })),
        found: governance.profiles[company.id][question.id],
      })),
      best_practices: {
        figure: company.supporting,
        max: PRACTICE * (governance.supporting.length + asked.length),
        practices: practices.map(practice => ({
          id: practice.id,
          figure: governance.supporting_scores[company.id]?.[practice.id]
            ?? governance.internal_scores[company.id]?.[practice.id] ?? null,
          max: PRACTICE,
        })),
        found: governance.profiles[company.id].supporting,
      },
    })),
  };
}
```

In `site/governance.js`, `meansAt` is declared `export function meansAt(anchors, score)` so this module and the page share one rule.

- [ ] **Step 4: Register the two tools**

In `app/api/mcp/route.js`, after `retrieve_passages` and before `compare_documents`:

```js
    server.registerTool("constitutions_board", {
      title: "The board of constitutions",
      description:
        "Every figure on the index's first board, each with the scale it is on "
        + "and a plain sentence saying what it means: the score out of 20, the "
        + "document as a whole out of 10 with its five criteria, and how far each "
        + "constitution goes on every behaviour. Pass company to narrow it to one "
        + "company, such as OpenAI. This is what a reader sees on the overview.",
      inputSchema: z.object({
        company: z.string().optional().describe(
          "One company's name, or part of it, such as OpenAI. Every constitution "
          + "by default."),
      }),
    }, args => answer(snapshot => constitutionsBoard(snapshot, args)));

    server.registerTool("governance_board", {
      title: "The board of governance",
      description:
        "The index's second board: nine companies scored out of 16 on four "
        + "questions about how they govern the rules their models follow, each "
        + "question split into checks scored 0 to 4, with what each score means, "
        + "the paragraph we wrote on what we found, and the best practices shown "
        + "beside the score and never counted in it. Pass company to narrow it to "
        + "one company. It belongs to no publication and carries its own as-of "
        + "date.",
      inputSchema: z.object({
        company: z.string().optional().describe(
          "One company's name, or part of it, such as Anthropic. All nine by "
          + "default."),
      }),
    }, args => answer(() => governanceBoard(args)));
```

and the import at the top:

```js
import { constitutionsBoard, governanceBoard } from "../../lib/board-tools.mjs";
```

- [ ] **Step 5: The server's own words**

In `app/lib/mcp-tools.mjs`, `INSTRUCTIONS` keeps its shape and says constitution. Its first paragraph:

```
The AI Constitutions Index reports where the constitutions AI companies publish
address a behaviour, and how strongly. It holds published constitutions, a set
of behaviours, and passages of those constitutions that a panel of language
model judges marked as bearing on each behaviour. It reports what those
documents say, not how the models behave.
```

and one new paragraph before the last line:

```
constitutions_board and governance_board answer with the two boards a reader
sees on the overview: every figure, the scale it is on, and a plain sentence
saying what it means. Both take an optional company. The first is the
publication's own figures; the second is nine companies scored on four
questions about how they govern the rules their models follow, and belongs to no
publication.
```

The last line stays `Start with list_behaviours to learn the slugs, then retrieve_passages.`

In `about()`, the list of the other tools gains two entries, and the sentence introducing the documents says constitution:

```js
    "  constitutions_board: every figure of the index's first board with the "
    + "scale it is on and what it means, for every constitution or for one "
    + "company. Reach for it to answer how far a constitution goes, or how two "
    + "of them compare.",
    "  governance_board: nine companies scored on four questions about how they "
    + "govern the rules their models follow. It belongs to no publication and "
    + "carries its own as-of date.",
```

- [ ] **Step 6: Move the test that lists the tools**

In `app/lib/__tests__/mcp-tools.test.mjs:598`:

```js
test("about names the other tools, so the list is not the only thing explaining them", () => {
  const answer = about(snapshot());
  for (const tool of ["list_model_specs", "list_behaviours", "retrieve_passages",
                      "constitutions_board", "governance_board"]) {
    assert.ok(answer.includes(tool), `the answer does not name ${tool}`);
  }
});
```

The test at `:505` is unchanged: `about` is still registered first, and `"Start here to understand this index and its other tools."` is still its description word for word.

- [ ] **Step 7: Run the tests**

Run: `node --test app/lib/__tests__/board-tools.test.mjs app/lib/__tests__/mcp-tools.test.mjs`
Expected: `# fail 0`.

- [ ] **Step 8: Ask the running server**

The server on 4617 serves this application, so the endpoint is live:

```sh
curl -s http://127.0.0.1:4617/api/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 400
```

Expected: a list naming seven tools, `about` first.

- [ ] **Step 9: Run the battery and commit**

Run each of the four commands. Expected: `OK`; `OK`; `# fail 0`; `ALL FEATURE CHECKS PASSED.`

```bash
git add app/lib/board-tools.mjs app/lib/__tests__/board-tools.test.mjs app/lib/mcp-tools.mjs app/lib/__tests__/mcp-tools.test.mjs app/api/mcp/route.js site/governance.js
git commit -m "The MCP server answers with the two boards

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 9: The MCP page

The page says what the server really carries. It says four tools today and the server registers five; after Task 8 it registers seven.

**Files:**
- Modify: `site/mcp.html:274-279` (the opening), `:372-431` (the tools)

**Interfaces:**
- Consumes: the two tools of Task 8 and their descriptions.
- Produces: nothing other tasks read.

- [ ] **Step 1: The opening**

```html
  <div class="m-head">
    <div class="m-title">MCP</div>
    <p class="m-sub">Plug the index into an AI assistant, and it answers your questions about
    these documents by quoting them. This page has the whole setup, from a settings menu or from a
    command line. Seven tools, read only, no account and no key.</p>
  </div>
```

- [ ] **Step 2: The tools**

Replace the opening of the tools section and add the three tools the page has never named:

```html
    <h2>Tools</h2>
    <p>Seven, and all of them read. Four words recur below. A <b>constitution</b> is a document an
    AI company publishes saying how its models should behave. A <b>behaviour</b> is one thing a
    constitution might commit a model to, such as deferring to a user&rsquo;s own decisions. A
    <b>locator</b> is the address of a quote inside a document, naming the document, its version,
    the section and the sentences, as in
    <code>openai--model-spec@2026-08-18 &gt; #scope_of_autonomy &gt; &para;14</code>. A
    <b>depth</b> is how far a constitution goes on a behaviour, from 0, saying nothing about it,
    to 10, setting rules, showing them applied and settling the hard cases.</p>
```

The paragraphs on `about`, `list_model_specs`, `list_behaviours` and `retrieve_passages` keep their text with the word settled in Task 1, and the sentence about `list_model_specs` says why its name is what it is:

```html
    <p><b>list_model_specs.</b> Every constitution the current publication carries: id, company,
    title, version, source URL, how many behaviours were judged against it and how many passages it
    holds. No arguments. It does not return the text of the document, which runs to hundreds of
    kilobytes; the source URL is in the answer. Each one is a single version, and its id reads
    <code>&lt;company&gt;--&lt;document&gt;@&lt;version&gt;</code>, such as
    <code>openai--model-spec@2026-08-18</code>, which is also the head of every locator into it.
    The tool keeps its name so that clients already connected go on working.</p>
```

and three new paragraphs after `retrieve_passages` and its arguments:

```html
    <p><b>constitutions_board.</b> Every figure on the overview&rsquo;s first board, each with the
    scale it is on and a plain sentence saying what it means: the score out of 20, the document as
    a whole out of 10 with its five criteria, and how far each constitution goes on every
    behaviour. One argument, <b>company</b>, optional, which narrows it to one company.</p>
    <p><b>governance_board.</b> The overview&rsquo;s second board: nine companies scored out of 16
    on four questions about how they govern the rules their models follow, each question split into
    checks scored 0 to 4, with what each score means and the paragraph we wrote on what we found.
    The best practices are there too, shown beside the score and never counted in it. One argument,
    <b>company</b>, optional. This board belongs to no publication and carries its own as-of
    date.</p>
    <p><b>compare_documents.</b> Everything one run found between two constitutions on one
    behaviour: the passages each of them carries, every pair of passages the judges linked with what
    each judge said, the verdict where two judges disagreed and a third settled it, the passages one
    document has nothing facing, and a paragraph written from all of it. It takes one
    <b>behaviour</b> and exactly two <b>model_spec_ids</b>. The answer is long, hundreds of
    thousands of characters where both documents cover the behaviour fully, so pass
    <b>detail</b> as <code>counts</code> first: that answers with the size of the full answer and
    the tally of what is in it.</p>
```

- [ ] **Step 3: Run the battery**

Run each of the four commands. Expected: `OK`; `OK`; `# fail 0`; `ALL FEATURE CHECKS PASSED.`

`tests/test_site_words.py` reads this page, so `model_spec_ids` and `list_model_specs` must stay inside `<code>` or `<b>` elements where they are today, which is where the guard does not read.

- [ ] **Step 4: Look at it, and commit**

Open `http://127.0.0.1:4617/mcp` and count the tools named against the tools the server lists.

```bash
git add site/mcp.html
git commit -m "The MCP page says what the server carries

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 10: Read the whole site as a stranger

The last task changes no copy of its own unless the reading finds something. It runs every check the repository has for these files and reads the four pages end to end against the brief.

**Files:**
- Modify: `site/OVERVIEW.md` (one paragraph on the word and the guard)
- Modify: whatever the reading finds

**Interfaces:**
- Consumes: every task above.
- Produces: nothing.

- [ ] **Step 1: Run every check that touches these files**

```sh
python3 -m unittest discover -s tests
python3 engine/panel/test_site_rubrics.py
node --test app/lib/__tests__/*.test.mjs
node engine/verify-reader-test.mjs
node engine/verify-reader-features.mjs
```

Expected: `OK`; `OK`; `# fail 0`; the reader walker's own pass line; `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 2: Read the four pages**

Open, in order, `http://127.0.0.1:4617/`, `?view=governance`, `/about`, `/mcp` and `/spec-reader/`. Against the brief, check each of these and fix what fails:

- Nothing on any page is written for the people who built the site. No agent, no script, no run, no job, no "could not be opened".
- Every figure a reader can press opens on what is being scored and what the figure means, in one or two sentences, before anything technical.
- No explanation of a figure quotes the constitution being scored.
- The word is constitution everywhere but in a company's own name, a paper's title and a quotation.
- Sentence case, British spelling, no long dash, no `--` used as a dash.
- No antithesis but the one on the about page, no triad where two items would do, no closing punchline.

- [ ] **Step 3: Say where the word is held**

In `site/OVERVIEW.md`, under the description of the site's files:

```markdown
The site calls these documents constitutions, everywhere it speaks in its own
voice. A company's own name for its document stays as that company writes it,
and a quotation stays verbatim. `tests/test_site_words.py` holds the pages, the
scripts and `site/governance.json` to that. The judges' own rubrics are the
exception, in `site/depth-scale.js` and `site/document-assessment.js`, which
`engine/panel/test_site_rubrics.py` holds to the prompts the judges read.
```

- [ ] **Step 4: Commit**

```bash
git add site/OVERVIEW.md
git commit -m "Say where the site's own word is held

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

## Notes on the plan itself

- Task 9, step 3: the guard in `tests/test_site_words.py` reads the text of `<b>` as well as ordinary text. `list_model_specs` and `model_spec_ids` pass it because an underscore is a word character, so the pattern finds no word boundary before `spec`. The elements the guard skips are `script`, `style`, `code` and `pre`.
- Task 3 writes `detail(content, build)` inside `site/overview.js` and Task 4 moves it into `site/board.js` as `board.detail`, where both views share it. An implementer taking Task 3 and Task 4 in one sitting can write it in `site/board.js` straight away.
- `site/plain-words.js` is imported by a browser page and by `app/lib/board-tools.mjs`. Node prints a `MODULE_TYPELESS_PACKAGE_JSON` warning when a test imports a `site/*.js` module, because the root `package.json` names no `"type"`. The warning is expected and already appears for `site/depth-scale.js`.
- The two new MCP tools read `site/governance.json` with an import attribute, the way `app/lib/admin-data.mjs` already reads `engine/panel/panel-config.json`. If the bundler refuses it, read it with `createRequire` rather than moving the data.

## Questions the plan cannot settle without the owner

1. The badge appears only where the publication on screen is not public or the deployment is a development one, and the two new sentences are a claim about the whole index: should it now appear on the published site as well?
2. The two sentences and nothing more mean the note no longer says that this build is unpublished and unreviewed, and no longer offers the published index: is that accepted on a development deployment, or should that warning stay there?
3. The notes written beside the index for each cell ("Why this figure", "Where this constitution stands") quote two or three documents at length: this plan puts them inside the fold, and they could as well be dropped from the score popover.
4. Is the doc reader's own interface copy in this pass? It says specification in about twenty visible strings, and the scale of four in `site/depth-scale.js` says "the spec" because the judges' rubric does.
5. Do the machine names keep the word, as this plan assumes: `list_model_specs`, `model_spec_ids`, `?spec=`, `kind=specification` and the form ids behind it?
6. The five criteria keep their names on the board, "Conflict rules" and "Force of each rule" among them, with the plain sentence in the popover: should the rows be renamed instead?
7. Question 1 of the governance board is renamed "Published constitution", which is the site's name for one of the working paper's four asks: is that the name the owner wants on the board?

## What the rewrite cannot keep, and cannot replace without a decision

- **The development warning.** `site/dev-tag.js` today says that this deployment shows builds nobody has published, that the readings are provisional, and where the published index is. The badge's two sentences carry none of that, and what raises the badge is unchanged. Nothing else on the site tells a reader that the figures in front of them were never reviewed.
- **The name as an aspiration.** The glossary says "No document does all of that today, and the name is the direction we think they should take", and beside it "Anthropic calls its own document Claude's Constitution. The name of this index refers to that document no more than to any other." The second goes by instruction. The first cannot stand beside a site that says these documents are constitutions and does not hedge, and `site/brand.js` shows this entry behind the wordmark on every page, so something has to stand there. Task 6 writes a replacement, and it is the sentence to read first.
- **The judges' own words, on the board itself.** A reader meets "prescribed", "demonstrated" and "bounded" under the table and beside every figure. They are the anchors of `engine/panel/prompts/depth-v2.txt`, and `engine/panel/test_site_rubrics.py` holds the site to them, so they cannot be replaced with plainer words while the figures were produced against them. The same holds for the five criteria's questions and anchors. This plan adds a plain line to each and leaves the anchor word standing.
- **The per-cell notes.** The 39 notes the current publication carries under "Where this constitution stands" quote two or three documents at length and are written for a reader who already knows the index. They are evidence and they are useful, and they are the one thing in a score popover that the rule against quoting reaches.
- **"Spec" on the MCP page.** `list_model_specs` and `model_spec_ids` are named on that page because a client has to type them. The page can say why the name is what it is, and the word stays visible there.
- **The scale of four.** `site/depth-scale.js` still says "the spec" in the bars of the scale of four, which `app/lib/__tests__/depth-scale.test.mjs` pins word for word and which surface only in the doc reader. They stay until the doc reader is in scope.
