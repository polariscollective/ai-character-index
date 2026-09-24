# Depth out of ten on the site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The overview becomes the board the owner approved on 22 September 2026: the governance view's table, with a final score out of 20 at the top, the document as a whole out of 10 as a foldable group over its five criteria, and every behaviour category a foldable group over its behaviours out of 10. The reader and the MCP server show every depth on the scale its publication was given on, 0 to 10 or 0 to 4.

**Architecture:** Four modules under `site/`, each pure of the page that draws it where it can be.

- `site/depth-scale.js` holds both depth scales: their levels, the rubric's own bar for each level and the one-line `brief` the board shows, the three conditions for 10, the line on odd figures, the words said beside a figure and the colour ramp. The overview and the reader import it and read `payload.depthScale`, where absent means 4.
- `site/board.js` is the governance board's machinery, lifted out of `site/governance.js` without a change of behaviour: the popover and where it is placed, the round fold toggles, the row and cell builders, the chips, the legend swatches, the tie sentences and the rank rule. Both views draw from it, so the two tables cannot drift and the governance view keeps every colour and every check it has.
- `site/document-assessment.js` turns a payload's `assessment` into what the board says: the five criteria in the prompts' words with their anchors, the halving that puts each out of 2, the figures (a criterion out of 2, the document as a whole out of 10, the behaviours' mean out of 10, a category's mean out of 10, the final score out of 20), the order of the contradictions and the words for a judge's reading.
- `site/overview.js` draws the coverage view as a board from the three above.

The MCP server reads the same two payload fields in `app/lib/mcp-tools.mjs`. Every visible change is conditional on `depthScale`, so a publication of four renders as it does today.

**Tech Stack:** Plain HTML and vanilla ES modules in `site/`, copied into `public/` and served by Next.js 15; Node 22 `node:test`; Python 3 stdlib `unittest`; the Playwright walkers (`playwright-core` driving Chrome).

**Sources:**

- The prototype the owner saw and chose, which is the design of record for the overview: `docs/prototypes/2026-09-22-depth-out-of-ten/index.html`, its `README.md` and its `data.json` (real figures of 22 September 2026). `index-two-rows.html`, which put the final score's two parts on the board as rows, was rejected and is kept only as a record. Serve it with `python3 -m http.server 4621 --directory docs/prototypes/2026-09-22-depth-out-of-ten`.
- The board it takes its design from: `site/governance.js` and the governance markup and styles in `site/overview.html`.
- The design `docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md`. Its sections "The depth scale, 0 to 10", "The document as a whole, five criteria" and "Publication" still hold. **Its "Display" section does not:** it describes a row at the foot of the old grid and a scale beside it, which the prototype replaced. Task 7 brings that section current.
- The payload's ground truth: `engine/panel/build_site_data.py` (`document_assessment`, `main`) and `engine/index_store.py` (`cell_depths`).
- The rubrics, both already written and merged: `methodology/spec-coverage-depth-rubric.md` (the scale of ten and the scale of four) and `methodology/document-assessment-rubric.md` (the five criteria, and how a contradiction is found, pooled, read and settled under the second method).
- Publication `de378ff3-008f-4977-92ce-d006e90699b9`, a draft on the scale of ten, verified on every line, in the database. `pnpm dev` serves it, because a development deployment serves the newest publication: it is what the board is looked at against.

## Global Constraints

- Work only in `/Users/sverbo/Desktop/Codes/Polaris/ai-character-index-depth-to-ten-site`, branch `feat/depth-to-ten-site`. Never touch `/Users/sverbo/Desktop/Codes/Polaris/ai-character-index`.
- The Polaris design framework binds every visible change: sentence case everywhere, British spelling, no long dashes in copy, no all caps, mono for figures and model ids only, no cards, shadows or gradients, one bordered callout at most per view, links with the chartreuse underline, focus 2px chartreuse, status colours always with a text label, `prefers-reduced-motion` respected.
- A pinned publication of four renders exactly as today, and so does the governance view: every change is conditional on `depthScale`, and today's tests keep passing unchanged except where a string they assert is the thing being made conditional.
- English, British spelling, no `—` or `–` and no `--` as a dash in prose, in code, comments and copy. Where a page needs the en dash glyph it already uses for "no figure", new code writes it as `"\u2013"`.
- Nothing on the overview is built with `innerHTML`: a judge's rationale, a quote and a situation are a model's words and land as text nodes.
- Commits end with exactly:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7`
- Nothing needs credentials: every test runs against fixtures. The one look at real figures is `pnpm dev` against publication `de378ff3-008f-4977-92ce-d006e90699b9`, which reads the database the developer's environment already points at, and is a look, not a test.
- Node 22.13 or later (`package.json` engines). `engine/panel/test_appjs_depth.js` loads `site/depth-scale.js` with `require()`, which loads an ES module from Node 22.12. Node prints a `MODULE_TYPELESS_PACKAGE_JSON` warning when a test imports a `site/*.js` module, because the root `package.json` names no `"type"`; the warning is expected.

### The payload, as `build_site_data.py` writes it

Top level `generatedFrom`, `provenance`, then `depthScale: 10` and `assessment` only on a publication out of ten, then `behaviours`.

- `provenance` carries `panel` (the judging panel's seats, sorted) and `judges_seen_in_data`. It records nothing about the assessment run's seats.
- A behaviour carries `slug`, `name`, `definition`, `category` and `coverage`.
- A cell's depth is `{mean, judges: {key: {depth, rationale, [model, substitution_reason]}}}`, plus `scale: 10` on the scale of ten. **A judge's key is the model that held the seat in that run** (`index_store.cell_depths` keys by `call["model"]`), not a fixed seat name: the real payload carries `sol`, `fable`, `deepseek`, and also `kimi` and `opus` where a run was configured differently. `model` appears only where a declared substitute answered for that key.
- `assessment[documentId]` is `{criteria: {conflict_rules|rule_force|reasons|situations: {mean, judges: {seat: {score, rationale, [model]}}}}, contradictions: {claims: [...], score}, total}`. `criteria` holds four criteria; the contradictions are beside them, not in them. `total` is out of 20.
- A claim is `{passages: [{locator, quote, exampleBlock}] x2, situation, why, readings: [{seat, found, holds, absolute, reason, [model]}], confirmed, absolute, reviewed}`. `absolute` is null where no reading said either way.
- The prototype's `data.json` carries an extra `incomplete` key per document that no builder writes and nothing reads. Ignore it.

### The contradictions are settled by the second method

Every copy this plan writes about contradictions says the second method, which is the one `methodology/document-assessment-rubric.md` states and the one publication `de378ff3` was built under: each contradictions seat lists what it finds; the candidates are pooled by their pair of passages; **every seat then reads every claim, its own included**; a claim is confirmed when at least two readings say it holds, and absolute when at least two readings say both that it holds and that it is absolute. The first method's rule, "found by one judge and put to the others, confirmed when two or more found it or hold it", is wrong now and must not appear in any file this plan touches. The prototype's own closing paragraph of "How the scores are made", which says its contradictions come from a first run settled by an earlier rule, is stale and is dropped.

### Decisions the owner has not taken

Neither is settled here. Build the prototype's choice, raise both at the review checkpoint after Task 4, and do not spend a step on the alternative before an answer.

1. **The colour of a figure.** The prototype takes the governance board's rule: a figure is always light (`#F1EFE3`) over the ramp, because across one table figures that change colour from cell to cell read as a second code. The overview's own rule picks dark or light by the luminance underneath (`inkOver`). Light ink on the amber middle of the ramp does not reach AA contrast; dark ink on it does. The board keeps `inkOver` in `site/depth-scale.js` either way, so the switch is one line in `site/board.js`.
2. **The page's title.** It still says "How deeply each specification covers each behaviour", which named the old grid. The board now carries a final score, the document as a whole and the behaviours, so the title under-describes it. Leave it exactly as it is until the owner says otherwise.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `site/depth-scale.js` (new) | Both scales' levels, the rubric's bar and the board's `brief` for each, the conditions for 10, the line on odd figures, the scale a payload is on, the words for a figure, the colour ramp and the ink over it. Pure. | 1 |
| `app/lib/__tests__/depth-scale.test.mjs` (new) | Node tests of that module, and guards that neither page carries its own copy of the levels. | 1, 5 |
| `engine/panel/test_site_rubrics.py` (new) | Holds the site's copies of the rubrics to the prompts the judges read. | 1, 3 |
| `site/board.js` (new) | The board both views draw: popover, folds, rows, cells, chips, swatches, ties, ranks. | 2 |
| `app/lib/__tests__/board.test.mjs` (new) | Node tests of the board's pure parts, and guards that governance kept no copy. | 2 |
| `site/governance.js` | Draws from `site/board.js`; nothing it shows changes. | 2 |
| `site/document-assessment.js` (new) | The five criteria, the halving, every figure the board shows, the claims' order and the readings' words. Pure. | 3 |
| `app/lib/__tests__/document-assessment.test.mjs` (new) | Node tests of that module. | 3 |
| `site/overview.js`, `site/overview.html` | The coverage view as a board: the table, the legend, the depth scale under it, the ties line, the method fold, the popovers and the contradictions sheet. | 1, 2, 4 |
| `site/spec-reader/app.js`, `site/spec-reader/styles.css` | The reader's scale from the payload, its heading, notes and spoken figures. | 5 |
| `engine/panel/test_appjs_depth.js`, `engine/panel/test_panel.py` | The reader's depth harness, reading the shared module. | 5 |
| `app/lib/__tests__/slice.test.mjs` | Pins that a sliced payload keeps its scale and assessment. | 5 |
| `app/lib/mcp-tools.mjs`, `app/api/mcp/route.js`, `app/lib/__tests__/mcp-tools.test.mjs` | The MCP answers and descriptions. | 6 |
| `site/about.html`, `site/mcp.html`, `README.md`, `AGENTS.md`, `SYSTEM.md`, `CITATION.cff`, `methodology/OVERVIEW.md`, `site/OVERVIEW.md`, the design's Display section | Copy. | 7 |
| `tests/fixtures/reader/ten/behaviours.json` (new), `engine/reader-routes.mjs`, `engine/verify-reader-features.mjs`, `engine/panel/test_build_site_data.py`, `tests/README.md` | The fixture of ten, its route, the walker checks and the shape test. | 8 |

### What is already done and is not in this plan

The branch was merged into develop and the work below landed there. Each was checked against the file before this plan was rewritten; none of it is to be written again.

- `methodology/spec-coverage-depth-rubric.md` carries the scale of ten (`## The scale of ten`, the three conditions, what an odd number means, the boundary tests, what the judge is shown) above the scale of four. The old plan's Task 5 step "Rewrite the depth rubric" is done. Note that its headings are `## The scale of ten` and `## The scale of four`, not the `## The depth scale, 0 to 10` the old plan's test split on.
- `methodology/document-assessment-rubric.md` exists, states the five criteria with their anchors, and states the second method for contradictions. The old plan's Task 5 step "Create the assessment rubric" is done.
- `methodology/OVERVIEW.md` names both rubrics, both depth prompts and `engine/assess.py`. Only one line of it is stale, and Task 7 fixes it.
- `CLAUDE.md` records the work under "Depth runs to ten, and a document is scored as a whole".
- The engine side is done and is not touched here: `engine/assess.py`, `engine/panel/depth_pass.py`, `engine/panel/assessment_run.py`, the prompts `depth-v2.txt`, `assessment-criteria-v1.txt`, `assessment-contradictions-v2.txt`, `assessment-confirm-v2.txt`, and `build_site_data.py`'s `--depth-prompt` and `--assessment-run`.

---

## What the board shows on a publication of four

The constraint above holds for the reader, the MCP server and the governance
view, which do not change on a publication of four by so much as a string. The
overview is the one exception, and it has to be: the board replaces the grid for
every publication, because keeping two renderers of the same figures is how two
pages drift. This matters at merge time rather than later, since the current
public publication (`1919ee6b-8a81-4ab5-902a-e949857db028`) is on the scale of
four and is what the site serves until a publication out of ten is made public.

On a publication of four the board is the same table with less in it:

- no "Final score, out of 20" row and no "The document as a whole" group, because the payload carries no assessment;
- the behaviour categories, each the plain mean of its behaviours out of 4, opening into behaviours out of 4, painted over 4;
- labs ordered by the plain mean of all of their behaviour cells out of 4, by the same rank and tie rules, since there is no final score to order by;
- the scale under the table is the scale of four's five levels, with no conditions and no line on odd figures;
- "How the scores are made" says the behaviours and the panel, and nothing about a document as a whole.

Task 8 walks both: the fixture of four through the ordinary route, the fixture
of ten through a pin.

---

### Task 1: The depth scale in one shared module

**Files:**
- Create: `site/depth-scale.js`
- Create: `app/lib/__tests__/depth-scale.test.mjs`
- Create: `engine/panel/test_site_rubrics.py`
- Modify: `site/overview.js` (the import at line 18, the `DEPTH_WORDS` constant at 20, the ramp and `inkOver` at about 34-58, the `DEPTH_LEVELS` copy at about 77-97, `paint` at about 203, `openCell` at about 298, `render`'s cells and legend)
- Modify: `site/governance.js` (`paintShare` at 91-100, `renderLegend` at 811-827, the comment over `initializeGovernance` at 909-911)
- Modify: `README.md` ("Checks"), `site/OVERVIEW.md` (Contents table)

**Existing tests that must keep passing, untouched:** `node --test app/lib/__tests__/*.test.mjs`, `python3 -m unittest discover -s engine/panel -p "test_*.py"`, `python3 -m unittest discover -s tests`, `node engine/verify-reader-test.mjs`, `node engine/verify-reader-features.mjs`.

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (from `site/depth-scale.js`, used by Tasks 2, 3, 4, 5 and 8):
  - `DEPTH_LEVELS: { 4: Level[], 10: Level[] }`, with `Level = { level, anchor, bar, brief }`
  - `CONDITIONS_FOR_TEN: string[]` and `CONDITIONS_BRIEF: string[]` (three each)
  - `ODD_VALUES: string`, `ODD_BRIEF: string`
  - `depthScaleOf(payload) -> 4 | 10`
  - `levelsOf(scale) -> Level[]`
  - `depthWords(mean, scale) -> string`, e.g. `"prescribed and partly demonstrated"`
  - `depthPhrase(mean, scale) -> string`, e.g. `"7.3 out of 10, prescribed and partly demonstrated"`
  - `rampAt(value, max) -> [r, g, b]`
  - `inkOver([r, g, b]) -> "#23281B" | "#F1EFE3"`
- Produces in `site/overview.js`: `paint(node, value, max)`, `state.scale`.
- Produces in `engine/panel/test_site_rubrics.py`: `sentence_case(text)`, `first_sentence(text)`, `prompt_scale() -> {levels, conditions, odd}`, `site_module(path, expression) -> object`.

**Why two forms of every sentence.** The reader's scale note has a column to
itself and shows the rubric's own bar, which is how it reads today and what
`engine/verify-reader-features.mjs` asserts ("the scale popover gives the
rubric's five levels in the rubric's own words"). The board's scale sits under a
table, three columns wide, and the prototype cut each bar to one line. Both are
kept on the one `Level`, `bar` and `brief`, so neither page carries its own copy
and the Python guard can hold `bar` to the prompt byte for byte.

- [ ] **Step 1: Write the failing node test**

Create `app/lib/__tests__/depth-scale.test.mjs`:

```js
/**
 * The depth scales the overview and the reader share, and the colour a figure
 * wears. site/depth-scale.js touches no page, so node imports the file the
 * browser loads.
 *
 * Run: node --test app/lib/__tests__/depth-scale.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { DEPTH_LEVELS, CONDITIONS_FOR_TEN, CONDITIONS_BRIEF, ODD_VALUES, ODD_BRIEF,
         depthScaleOf, levelsOf, depthWords, depthPhrase, rampAt, inkOver }
  from "../../../site/depth-scale.js";

const site = name => readFile(new URL(`../../../site/${name}`, import.meta.url), "utf8");

test("a payload is out of 10 only where it says so, and out of 4 otherwise", () => {
  assert.equal(depthScaleOf({ depthScale: 10, behaviours: [] }), 10);
  assert.equal(depthScaleOf({ behaviours: [] }), 4, "every publication before the scale of ten");
  assert.equal(depthScaleOf({ depthScale: 7 }), 4, "a scale this site does not know is not guessed at");
  assert.equal(depthScaleOf(null), 4);
});

test("the scale of four is the five levels the reader has always shown", () => {
  assert.deepEqual(levelsOf(4).map(level => `${level.level} ${level.anchor}`),
    ["0 absent", "1 named", "2 discussed", "3 prescribed", "4 demonstrated"]);
  assert.equal(levelsOf(4)[3].bar,
    "The spec states concrete do/don't rules or procedures for the behaviour, "
    + "specific enough that a grader can quote the spec's own sentences as pass criteria.");
});

test("the scale of ten is six anchors on the even numbers, with its conditions and its odd line", () => {
  assert.deepEqual(levelsOf(10).map(level => `${level.level} ${level.anchor}`),
    ["0 absent", "2 named", "4 discussed", "6 prescribed", "8 demonstrated", "10 bounded"]);
  assert.deepEqual(CONDITIONS_FOR_TEN,
    ["The edge is shown.", "A conflict is settled.", "A default for the undecidable case."]);
  assert.match(ODD_VALUES, /^An odd number means the level below is fully met/);
});

test("every level carries a brief the board can print under a table", () => {
  for (const scale of [4, 10]) {
    for (const level of levelsOf(scale)) {
      assert.ok(level.brief.length > 0 && level.brief.length <= 110,
                `${scale}: ${level.anchor} is ${level.brief.length} characters`);
      assert.match(level.brief, /\.$/);
    }
  }
  assert.equal(levelsOf(10)[5].brief,
    "Demonstrated, and the three conditions below hold for every part of the behaviour.");
});

test("each brief condition opens on the prompt's own condition", () => {
  assert.equal(CONDITIONS_BRIEF.length, 3);
  CONDITIONS_BRIEF.forEach((brief, i) => {
    assert.ok(brief.startsWith(`${CONDITIONS_FOR_TEN[i].replace(/\.$/, "")}:`), brief);
  });
  assert.equal(ODD_BRIEF,
    "An odd figure means the level below is fully met and part of the next.");
});

test("a scale that is not ten reads as four", () => {
  assert.equal(levelsOf(7), DEPTH_LEVELS[4]);
});

test("on the scale of four a mean takes the anchor of the level it rounds to, as it always has", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(level => depthWords(level, 4)),
    ["absent", "named", "discussed", "prescribed", "demonstrated"]);
  assert.equal(depthWords(2.7, 4), "prescribed");
  assert.equal(depthWords(3.5, 4), "demonstrated");
});

test("on the scale of ten an even figure takes its anchor", () => {
  assert.equal(depthWords(8.0, 10), "demonstrated");
  assert.equal(depthWords(0.4, 10), "absent");
  assert.equal(depthWords(9.6, 10), "bounded");
});

test("on the scale of ten an odd figure names the level fully met and the next", () => {
  assert.equal(depthWords(7.3, 10), "prescribed and partly demonstrated");
  assert.equal(depthWords(9.4, 10), "demonstrated and partly bounded");
  assert.equal(depthWords(0.5, 10), "absent and partly named");
});

test("a figure in a sentence says its scale", () => {
  assert.equal(depthPhrase(2.7, 4), "2.7 out of 4, prescribed");
  assert.equal(depthPhrase(7.3, 10), "7.3 out of 10, prescribed and partly demonstrated");
  assert.equal(depthPhrase(8, 10), "8.0 out of 10, demonstrated");
});

/* The ramp as overview.js had it before the scale of ten, kept here as the
 * oracle: on the scale of four, and in the governance view, which paints over
 * 4, not one colour may move. */
const RAMP_OF_FOUR = [
  { at: 0, rgb: [180, 71, 47] }, { at: 2, rgb: [217, 162, 39] }, { at: 4, rgb: [76, 140, 63] }];
function rampOfFour(value) {
  const held = Math.max(0, Math.min(4, value));
  const upper = RAMP_OF_FOUR.find(stop => stop.at >= held) || RAMP_OF_FOUR[RAMP_OF_FOUR.length - 1];
  const lower = [...RAMP_OF_FOUR].reverse().find(stop => stop.at <= held) || RAMP_OF_FOUR[0];
  if (upper === lower) return upper.rgb;
  const across = (held - lower.at) / (upper.at - lower.at);
  return lower.rgb.map((channel, i) => Math.round(channel + across * (upper.rgb[i] - channel)));
}

test("on the scale of four every depth wears the colour it wore", () => {
  for (let hundredths = -100; hundredths <= 500; hundredths += 1) {
    const value = hundredths / 100;
    assert.deepEqual(rampAt(value, 4), rampOfFour(value), `at ${value}`);
  }
});

test("the governance view's shares of 4 wear the colours they wore", () => {
  for (const max of [2, 4, 6, 8, 10, 12, 40]) {
    for (let score = 0; score <= max; score += 1) {
      assert.deepEqual(rampAt((score / max) * 4, 4), rampOfFour((score / max) * 4),
                       `${score} of ${max}`);
    }
  }
});

test("on the scale of ten the ramp runs over the fraction, and its deepest green is 10 alone", () => {
  assert.deepEqual(rampAt(0, 10), [180, 71, 47]);
  assert.deepEqual(rampAt(5, 10), [217, 162, 39]);
  assert.deepEqual(rampAt(10, 10), [76, 140, 63]);
  assert.deepEqual(rampAt(7.3, 10), [152, 152, 50]);
  assert.deepEqual(rampAt(4, 10), [210, 144, 41]);
  assert.notDeepEqual(rampAt(9.9, 10), [76, 140, 63]);
  assert.notDeepEqual(rampAt(4, 10), rampAt(4, 4), "a 4 out of 10 is not a 4 out of 4");
});

test("a total out of 20 and a criterion out of 2 run over the same ramp", () => {
  assert.deepEqual(rampAt(12, 20), [189, 158, 44]);
  assert.deepEqual(rampAt(17.3, 20), [114, 146, 57]);
  assert.deepEqual(rampAt(20, 20), [76, 140, 63]);
  assert.deepEqual(rampAt(1, 2), [217, 162, 39]);
  assert.deepEqual(rampAt(2, 2), [76, 140, 63]);
});

test("the ink over a colour is chosen by the luminance under it", () => {
  assert.equal(inkOver([217, 162, 39]), "#23281B");
  assert.equal(inkOver([180, 71, 47]), "#F1EFE3");
  assert.equal(inkOver([76, 140, 63]), "#F1EFE3");
});

/* One copy of the levels. The overview carried a hand copy of the reader's; it
 * reads this module now and may not grow one back. */
test("the overview carries no copy of the levels, the ramp or the scale of four", async () => {
  const overview = await site("overview.js");
  assert.ok(!overview.includes("No passage bears on the behaviour."), "a bar was copied back in");
  assert.ok(!/const (DEPTH_LEVELS|DEPTH_WORDS|RAMP)\b/.test(overview), "a copy was declared");
  assert.ok(!/out of 4\b/.test(overview), "a figure's scale was written as 4");
  assert.match(overview, /from "\.\/depth-scale\.js"/);
});
```

- [ ] **Step 2: Write the failing Python test**

Create `engine/panel/test_site_rubrics.py`:

```python
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


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run both to verify they fail**

Run: `node --test app/lib/__tests__/depth-scale.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` naming `site/depth-scale.js`, and `# fail 1`.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `PromptScaleTest` passes; the five `DepthScaleOfTenTest` cases error with `subprocess.CalledProcessError`; last line `FAILED (errors=5)`.

- [ ] **Step 4: Create the shared module**

Create `site/depth-scale.js`:

```js
/* The depth scales a publication can carry, and what a figure on each is called.
 *
 * One file for the overview and the reader, as brand.js and dev-tag.js are one
 * file for several pages. Each page used to carry its own copy of the levels,
 * and two copies of a rubric drift apart the first time one of them is edited.
 *
 * A publication's payload says its scale. `depthScale: 10` is written on a
 * publication out of ten and on nothing else, so a payload without it, which
 * is every publication made before that scale, is out of 4 and is shown so.
 *
 * Each level carries two sentences. `bar` is the rubric's own, which the
 * reader's scale note shows in a column of its own: for the scale of ten it is
 * engine/panel/prompts/depth-v2.txt word for word, with the anchor in lower case
 * and the bar's first letter a capital, and engine/panel/test_site_rubrics.py
 * holds it there. `brief` is one line, which is what fits under the board's
 * table, three of them across.
 *
 * Nothing here touches the page, so node imports it for its tests.
 */

export const DEPTH_LEVELS = {
  4: [
    { level: 0, anchor: "absent",
      bar: "No passage bears on the behaviour.",
      brief: "No passage bears on the behaviour." },
    { level: 1, anchor: "named",
      bar: "The behaviour appears, a word or clause, typically inside a list or a "
        + "passage about something else, but the spec says nothing further about it.",
      brief: "The behaviour appears in passing, a word or a clause, and nothing more is said." },
    { level: 2, anchor: "discussed",
      bar: "The spec addresses the behaviour in its own right, what the norm is and "
        + "why it matters, but only in terms too general to grade a response against.",
      brief: "Addressed in its own right, but too generally to grade a response against." },
    { level: 3, anchor: "prescribed",
      bar: "The spec states concrete do/don't rules or procedures for the behaviour, "
        + "specific enough that a grader can quote the spec's own sentences as pass criteria.",
      brief: "Concrete do and don't rules that a grader could quote as pass criteria." },
    { level: 4, anchor: "demonstrated",
      bar: "Prescribed, plus worked examples: concrete scenarios where the spec shows the "
        + "sanctioned response, usable as an answer key for borderline cases.",
      brief: "Rules plus worked examples that show the sanctioned response." },
  ],
  10: [
    { level: 0, anchor: "absent",
      bar: "No passage bears on the behaviour.",
      brief: "No passage bears on the behaviour." },
    { level: 2, anchor: "named",
      bar: "The behaviour appears, a word or clause, typically inside a list or a passage "
        + "about something else, but the document says nothing further about it.",
      brief: "The behaviour appears in passing, a word or a clause, and nothing more is said." },
    { level: 4, anchor: "discussed",
      bar: "The document addresses the behaviour in its own right, what the norm is and why "
        + "it matters, but only in terms too general to grade a response against.",
      brief: "Addressed in its own right, but too generally to grade a response against." },
    { level: 6, anchor: "prescribed",
      bar: "The document states concrete do and don't rules or procedures for the behaviour, "
        + "specific enough that a grader could quote the document's own sentences as pass "
        + "criteria.",
      brief: "Concrete do and don't rules that a grader could quote as pass criteria." },
    { level: 8, anchor: "demonstrated",
      bar: "Prescribed, plus worked examples: concrete scenarios where the document shows the "
        + "sanctioned response, usable as an answer key for borderline cases.",
      brief: "Rules plus worked examples that show the sanctioned response." },
    { level: 10, anchor: "bounded",
      bar: "Demonstrated, and for this behaviour the document meets all three conditions "
        + "below, for every facet of the behaviour that the Definition and Clarifications "
        + "name.",
      brief: "Demonstrated, and the three conditions below hold for every part of the behaviour." },
  ],
};

/* What 10 asks for beyond 8. Its bar names them "below", so the pages list them
 * under it: the prompt's own three sentences, and under the board's table the
 * one-line form, each opening on the prompt's sentence so the two read as one
 * thing said twice rather than as two rules. */
export const CONDITIONS_FOR_TEN = [
  "The edge is shown.",
  "A conflict is settled.",
  "A default for the undecidable case.",
];

export const CONDITIONS_BRIEF = [
  "The edge is shown: two cases that differ in one feature get opposite answers.",
  "A conflict is settled: the document names a rule of its own that pulls against this one, "
    + "says which prevails and shows it on a case.",
  "A default for the undecidable case: it says what to do when the model cannot tell which "
    + "side of the edge it is on.",
];

/* The one line on odd figures, under the levels of the scale of ten. The scale
 * of four has a level at every whole number and needs none. */
export const ODD_VALUES =
  "An odd number means the level below is fully met and the level above is met only in part.";
export const ODD_BRIEF =
  "An odd figure means the level below is fully met and part of the next.";

/** The scale a payload's depths are on: 10 where it says so, 4 otherwise. */
export function depthScaleOf(payload) {
  return payload?.depthScale === 10 ? 10 : 4;
}

/** The levels of a scale; anything that is not ten is the scale of four. */
export function levelsOf(scale) {
  return DEPTH_LEVELS[scale === 10 ? 10 : 4];
}

/* The words said beside a mean. On the scale of four, the anchor of the level it
 * rounds to, as the site has always said it. On the scale of ten an even figure
 * takes its anchor too, and an odd one names the level fully met and the next:
 * 7.3 rounds to 7, "prescribed and partly demonstrated". */
export function depthWords(mean, scale) {
  const levels = levelsOf(scale);
  const top = levels[levels.length - 1].level;
  const rounded = Math.max(0, Math.min(top, Math.round(mean)));
  const anchor = level => levels.find(each => each.level === level)?.anchor ?? "";
  if (scale !== 10 || rounded % 2 === 0) return anchor(rounded);
  return `${anchor(rounded - 1)} and partly ${anchor(rounded + 1)}`;
}

/** "2.7 out of 4, prescribed"; "7.3 out of 10, prescribed and partly demonstrated". */
export function depthPhrase(mean, scale) {
  return `${mean.toFixed(1)} out of ${scale}, ${depthWords(mean, scale)}`;
}

/* Red to green, against the framework's own palette, because the board is read
 * as a comparison and a single hue at varying strength does not say which end
 * is which. Three stops, at nought, half the maximum and the maximum,
 * interpolated in between, so the deepest green is the top alone. Every row of
 * the board is painted over its own maximum: a depth over its publication's
 * scale, a criterion over 2, a final score over 20, a governance score over the
 * 4 that view passes. On the scale of four the stops sit at 0, 2 and 4, as they
 * always did, so no colour there moved. */
const STOPS = [[180, 71, 47], [217, 162, 39], [76, 140, 63]];

export function rampAt(value, max) {
  const stops = [0, max / 2, max].map((at, i) => ({ at, rgb: STOPS[i] }));
  const held = Math.max(0, Math.min(max, value));
  const upper = stops.find(stop => stop.at >= held) || stops[stops.length - 1];
  const lower = [...stops].reverse().find(stop => stop.at <= held) || stops[0];
  if (upper === lower) return upper.rgb;
  const across = (held - lower.at) / (upper.at - lower.at);
  return lower.rgb.map((channel, i) =>
    Math.round(channel + across * (upper.rgb[i] - channel)));
}

/* Dark or light over the ramp, by the luminance underneath rather than by eye:
 * the amber middle needs dark text where both ends need light. Whether the board
 * uses this or the governance view's always-light figure is the open decision in
 * the plan's Global Constraints; the function stays either way, because the
 * reader and the legend use it. */
export function inkOver([r, g, b]) {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#23281B" : "#F1EFE3";
}
```

- [ ] **Step 5: Run the tests; only the overview guard should still fail**

Run: `node --test app/lib/__tests__/depth-scale.test.mjs`
Expected: every test passes except "the overview carries no copy of the levels, the ramp or the scale of four", which fails with "a bar was copied back in"; `# fail 1`.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `OK` (6 tests).

- [ ] **Step 6: Read the scale in the overview, and give the governance view its own maximum**

This step keeps the old grid rendering exactly as it does today; Task 4 replaces
it. What changes is only where its ramp, its levels and its words come from.

In `site/overview.js`:

(a) After `import { initializeGovernance } from "./governance.js";` add, and delete `const DEPTH_WORDS = [...]`:

```js
/* The depth scales, their words and the colour a figure wears: one module for
 * this page and the reader, which used to carry a copy each. */
import { depthScaleOf, levelsOf, depthWords, depthPhrase, rampAt, inkOver }
  from "./depth-scale.js";
```

(b) Delete the ramp block (the comment from `/* Red to green, against the framework's own palette` through the closing brace of `inkOver`) and the `DEPTH_LEVELS` copy with the comment over it (`/* The rubric each judge scored against, copied from the reader's own ...`).

(c) Give `state` its scale:

```js
/* `scale` is the publication's, read from its payload: 10 on a publication out
 * of ten and 4 on every one before it. */
const state = { behaviours: [], columns: [], passages: {}, depths: {}, registry: {}, scale: 4 };
```

(d) `paint` takes the maximum it paints over:

```js
function paint(button, value, max) {
  const rgb = rampAt(value, max);
```

(e) In `openCell`, replace the sentence that says the figure's scale with
`` ` out of ${state.scale}, ${depthWords(depth.mean, state.scale)}.` ``.

(f) In `render`, pass `state.scale` to `paint`, build the cell's accessible name
with `depthPhrase(mean, state.scale)`, and build the legend from
`levelsOf(state.scale)` with `level.bar`.

(g) In `initialize`, after `state.behaviours = payload.behaviours;`, add
`state.scale = depthScaleOf(payload);`.

In `site/governance.js`, `paintShare` names the maximum it paints over:

```js
/* A score painted the way the board paints a depth, as a share of its maximum,
 * so 8 of 12 wears the colour 2.7 of 4 would. The ramp paints over whatever
 * maximum it is given, and this view gives it 4, its own, so no colour here
 * moved when the depths went to ten. The figure is always light, where the
 * overview picks dark or light by the colour underneath: across one table of
 * scores, figures that change colour from cell to cell read as a second code. */
const FIGURE = "#F1EFE3";
const PAINTED_OVER = 4;
function paintShare(node, value, max) {
  board.paint(node, (value / max) * PAINTED_OVER, PAINTED_OVER);
  node.style.color = FIGURE;
}
```

In `renderLegend`, `board.paint(swatch, level)` becomes `board.paint(swatch, level, PAINTED_OVER)`.
Over `initializeGovernance`, the comment becomes: `/* `paint` is the overview's own, given this view's maximum of 4, so a score of 3 out of 4 here wears the colour a depth of 3 out of 4 wears in the other view. */`

- [ ] **Step 7: Run the tests and the existing suites**

Run: `node --test app/lib/__tests__/depth-scale.test.mjs`
Expected: `# fail 0`.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `OK`.

Run: `node --test app/lib/__tests__/*.test.mjs`
Expected: `# fail 0`.

Run: `node engine/verify-reader-features.mjs`
Expected: last line `ALL FEATURE CHECKS PASSED.` The governance section proves the view still renders, with `paint(node, value, 4)`; its colours are pinned in Task 2.

Run: `python3 -m unittest discover -s tests`
Expected: `OK`.

- [ ] **Step 8: Document the file**

In `README.md`, under "Checks", after `python3 engine/panel/test_bands.py`, add:

```sh
python3 engine/panel/test_site_rubrics.py          # the site's rubric, held to the judges' prompts
```

In `site/OVERVIEW.md`, in the Contents table, after the `overview.html, overview.js, governance.js, governance.json` row, add:

```markdown
| `depth-scale.js` | The depth scales a publication can carry, 0 to 4 and 0 to 10: their levels, the rubric's own sentence for each and the one line the board prints, the words said beside a figure, and the colour ramp. One module, imported by `overview.js`, `board.js` and `spec-reader/app.js`; a payload's `depthScale` says which scale it is on, and none means 4. `engine/panel/test_site_rubrics.py` holds the scale of ten to the prompt the judges read. |
```

- [ ] **Step 9: Commit**

```bash
git add site/depth-scale.js site/overview.js site/governance.js \
  app/lib/__tests__/depth-scale.test.mjs engine/panel/test_site_rubrics.py README.md site/OVERVIEW.md
git commit -m "feat: both depth scales in one module, and every figure painted over its own maximum" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 2: The board both views draw, in one module

The overview takes the governance board's design, so it takes the governance
board's code rather than a second copy of it. Everything generic in
`site/governance.js` moves to `site/board.js` unchanged in behaviour: the
popover and where it is placed, the round fold toggles, the row and cell
builders, the chips, the swatches, the rank rule. The governance view must come
out of this task showing exactly what it shows now, to the pixel and to the
colour.

**Files:**
- Create: `site/board.js`
- Create: `app/lib/__tests__/board.test.mjs`
- Modify: `site/governance.js` (delete what moves; import the rest)
- Modify: `site/overview.js` (it no longer hands `paint` to the governance view)
- Modify: `site/overview.html` (the shared table rules move from `.gov-heatmap` to `.board`; the governance table gains that class)
- Modify: `site/OVERVIEW.md`

**Existing tests that must keep passing, untouched:** `node engine/verify-reader-features.mjs` (its `== Overview: the governance view ==` section in full), `python3 -m unittest discover -s tests` (`tests/test_governance_tab.py`, `tests/test_page_feedback_bubble.py`), `node --test app/lib/__tests__/*.test.mjs`, `node engine/verify-reader-test.mjs`.

**Interfaces:**
- Consumes: `rampAt`, `inkOver` from `site/depth-scale.js` (Task 1).
- Produces (from `site/board.js`):
  - `element(tag, className?, text?)`, `mono(text)`, `paragraph(text, className?)`
  - `ORDINALS: string[]`, `level(a, b) -> boolean` (equal within 1e-9), `rankBy(items, ahead) -> items with rank`
  - `createBoard({ nodes: { table, pop, expandAll }, everyRow: { show, hide } }) -> Board`
  - `Board`: `paint(node, value, max)`, `chip(value, max, text?)`, `naChip()`, `openPopover(trigger, build)`, `refill(build)`, `wirePopover(scrollers)`, `titled(content, title, subtitle)`, `figure(value, rest)`, `h3(text)`, `popButton(text, onPress)`, `rowName(name, sub, build, label)`, `cellButton(dataset, label, build, className)`, `scoreCell({ name, rowLabel, value, max, text, build, dataset, className })`, `naCell({ name, rowLabel, build, dataset })`, `rowToggle(groupId, rowIds, { parts, name })`, `subRow(domId, parent, name)`, `rowHead(first, name)`, `setExpanded(groupId, open)`, `showInTable(groupId, parts)`, `expandEvery()`, `swatches(values, max)`, `groups: Map`
- Produces in the DOM: nothing new. Every class and every `data-` attribute the governance view carries is carried unchanged, including `data-lab` and `data-row`, which the walker selects on.

- [ ] **Step 1: Write the failing node test**

Create `app/lib/__tests__/board.test.mjs`:

```js
/**
 * The board both views of the overview draw. Its pure parts are tested here;
 * what it builds in a page is walked in a browser by
 * engine/verify-reader-features.mjs, in the governance section that already
 * exists and in the coverage section Task 8 adds.
 *
 * Run: node --test app/lib/__tests__/board.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { ORDINALS, level, rankBy } from "../../../site/board.js";
import { rampAt } from "../../../site/depth-scale.js";

const site = name => readFile(new URL(`../../../site/${name}`, import.meta.url), "utf8");

test("a rank is one more than the number of items ahead, so level items share a place", () => {
  const ahead = (a, b) => a.total > b.total && !level(a.total, b.total);
  const ranked = rankBy([{ name: "a", total: 9 }, { name: "b", total: 7 },
                         { name: "c", total: 7 }, { name: "d", total: 4 }], ahead);
  assert.deepEqual(ranked.map(one => `${one.name}${one.rank}`), ["a1", "b2", "c2", "d4"]);
});

test("the rank rule takes whatever tiebreak its view has, and takes none as a tie", () => {
  const items = [{ name: "a", total: 7, second: 1 }, { name: "b", total: 7, second: 3 }];
  const onTotal = (a, b) => a.total > b.total && !level(a.total, b.total);
  const onSecond = (a, b) => (level(a.total, b.total) ? a.second > b.second
    : a.total > b.total);
  assert.deepEqual(rankBy(items, onTotal).map(one => one.rank), [1, 1]);
  assert.deepEqual(rankBy(items, onSecond).map(one => one.rank), [2, 1]);
});

test("nine ordinals, so a board of nine labs can say which place is shared", () => {
  assert.equal(ORDINALS.length, 9);
  assert.equal(ORDINALS[0], "first");
});

/* The governance view painted a score as a share of 4; the board paints every
 * row over its own maximum. The two must be the same colour, or that view
 * changed in a task that was not allowed to change it. */
test("painting over a row's own maximum is the colour the share of 4 wore", () => {
  for (const max of [2, 4, 6, 8, 10, 12, 16, 20, 40]) {
    for (let twice = 0; twice <= max * 2; twice += 1) {
      const value = twice / 2;
      assert.deepEqual(rampAt(value, max), rampAt((value / max) * 4, 4), `${value} of ${max}`);
    }
  }
});

test("the governance view keeps no copy of what moved to the board", async () => {
  const governance = await site("governance.js");
  for (const name of ["placePopover", "openPopover", "refill", "wirePopover", "rowToggle",
                      "subRow", "rowHead", "setExpanded", "scoreCell", "naCell", "chip"]) {
    assert.ok(!new RegExp(`function ${name}\\b`).test(governance), `${name} was left behind`);
  }
  assert.match(governance, /from "\.\/board\.js"/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test app/lib/__tests__/board.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` naming `site/board.js`.

- [ ] **Step 3: Move the machinery into `site/board.js`**

Create `site/board.js` with a header saying what it is:

```js
/* The board the overview draws, in both of its views.
 *
 * One table with the labs across the top and the figures down the side, each
 * row painted over its own maximum, each group opening into the rows it is made
 * of, and one popover that fills with whatever was pressed and sits beside it.
 * The governance view was drawn this way first (September 2026) and the
 * coverage view took its design in September 2026, so the two take one
 * implementation: a second copy of a popover is a second set of bugs.
 *
 * A view brings its own data, its own rows and the text of its own popovers.
 * Nothing here knows about a lab, a check, a behaviour or a criterion.
 *
 * Nothing is built with innerHTML: every string a model wrote lands as a text
 * node, wherever it came from.
 */
```

Move these out of `site/governance.js`, unchanged except where noted. Line
numbers are of the file as it stands at the start of this task.

| From `governance.js` | To `board.js` | Change |
|---|---|---|
| `element` (72-78) | as is | exported |
| `level` (54), `ranked`'s rank rule (59-64) | `level`, `rankBy(items, ahead)` | `ranked(data)` stays in `governance.js` and calls `rankBy(labs, ahead)` with its own `ahead`, which breaks a tie on the best practices |
| `paintShare` and `FIGURE` (91-100) | `paint(node, value, max)` | paints over `max` itself through `rampAt(value, max)`; the `(value / max) * 4` step goes, because the test above pins the two to the same colour |
| `chip`, `naChip` (101-108) | as is | |
| the popover: `pop`, `placePopover`, `openPopover`, `refill`, `wirePopover` (110-203) | as is | reads `this` board's `nodes.pop`; `wirePopover(scrollers)` takes the extra scrolling elements to reposition on, so the coverage view can pass its own frame |
| `titled`, `figure` (204-217) | as is, plus `h3(text)` and `popButton(text, onPress)`, which governance builds inline | |
| `showInTable` (338-350) | `showInTable(groupId, parts)` | |
| `rowName` (579-589), `cellButton` (591-604), `scoreCell` (605-617), `naCell` (618-624), `rowToggle` (626-637), `subRow` (638-649), `rowHead` (680-688), `setExpanded` (797-810) | as is | `cellButton` takes a `dataset` object in place of `(lab, row)` and sets every key on it, so governance still writes `data-lab` and `data-row`; `rowToggle` takes the DOM ids of its rows rather than deriving them; `setExpanded` reads `everyRow.show` and `everyRow.hide` for the button's text, which governance passes as "Show every check" and "Hide every check" |
| the swatches of `renderLegend` (811-827) | `swatches(values, max)` | governance keeps `renderLegend`, which calls it with `[0, 1, 2, 3, 4]` and 4 and appends its own words and its own NA line |
| `ORDINALS` (828) | as is | `renderTies` stays in `governance.js`, with its second clause about the best practices |

`createBoard` holds what was on the module-level `board` object: `nodes`,
`expanded`, `groups` (a `Map` of `id -> {name, parts}`) and the popover's state.
`governance.js` keeps its own `board` object for its data, its labs and its
`bestMax`.

- [ ] **Step 4: Share the table's styles**

In `site/overview.html`:

(a) On the governance table, `<table class="gov-heatmap" id="gov-heatmap">` becomes `<table class="gov-heatmap board" id="gov-heatmap">`.

(b) In the `<style>`, the rules that describe the board itself move from the
`.gov-heatmap` scope to `.board`: `thead th`, `thead th.row-col`, `tbody th`,
`.cell`, `tbody tr`, `.cell-button` and its states, `.cell-figure`, `.total-row`,
`.cell-na`, `.check-row` and its indent, tint and cell width. Leave under
`.gov-heatmap` the rules for rows only that view has: `.outside-row`,
`.practice-divider`, `.divider-note`. `.row-head`, `.row-name`, `.company-button`,
`.row-toggle`, `.chip`, `.gov-pop`, `.gov-legend` and `.cell-max` are already
unscoped and stay as they are.

(c) Add one line over the moved block: `/* The board: one table with the labs across and the figures down, drawn by site/board.js for both views. Rules that only the governance view's own rows need stay under .gov-heatmap below. */`

- [ ] **Step 5: Wire the views**

In `site/governance.js`, `initializeGovernance` takes no argument: it builds its
own board.

```js
const view = createBoard({
  nodes: { table: byId("gov-heatmap"), pop: byId("gov-pop"), expandAll: byId("gov-expand-all") },
  everyRow: { show: "Show every check", hide: "Hide every check" },
});
```

In `site/overview.js`, the call at the foot becomes `initializeGovernance();`,
and `paint` is no longer exported to it.

- [ ] **Step 6: Run the tests and the walkers**

Run: `node --test app/lib/__tests__/board.test.mjs`
Expected: `# fail 0`.

Run: `node --test app/lib/__tests__/*.test.mjs`
Expected: `# fail 0`.

Run: `node engine/verify-reader-features.mjs`
Expected: last line `ALL FEATURE CHECKS PASSED.`, with every check of `== Overview: the governance view ==` printing `PASS`. This is the whole point of the task: the view is rebuilt on shared code and says the same things.

Run: `python3 -m unittest discover -s tests`
Expected: `OK`.

- [ ] **Step 7: Pin the governance view's colours**

In `engine/verify-reader-features.mjs`, in `== Overview: the governance view ==`,
directly after the check `"the scores run down from the total, the checks folded, the eight findings under the table"`, add:

```js
  // The board paints every row over its own maximum now. This view's maximum is
  // its own, so not one of its colours moved. 23 of 40 is OpenAI's total, the
  // first on the board.
  const colours = await page.evaluate(() => ({
    total: getComputedStyle(document.querySelector('#gov-heatmap .cell-button[data-row="total"]'))
      .backgroundColor,
    legend: [...document.querySelectorAll("#gov-legend .swatch")]
      .map(swatch => getComputedStyle(swatch).backgroundColor),
  }));
  check(colours.total === "rgb(196, 159, 43)"
      && colours.legend.join(" | ") === "rgb(180, 71, 47) | rgb(199, 117, 43) | rgb(217, 162, 39)"
        + " | rgb(147, 151, 51) | rgb(76, 140, 63)",
    "the governance view wears the colours it wore: 23 of 40, and its five swatches",
    JSON.stringify(colours));
```

Run: `node engine/verify-reader-features.mjs`
Expected: the new check prints `PASS`; last line `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 8: Document the file**

In `site/OVERVIEW.md`, after the `depth-scale.js` row, add:

```markdown
| `board.js` | The board both views of the overview draw: one table with the labs across and the figures down, each row painted over its own maximum, each group opening into its rows, and one popover placed beside whatever was pressed. It knows nothing of labs, checks, behaviours or criteria; a view brings its own data and the text of its own popovers. Imported by `overview.js` and `governance.js`. |
```

- [ ] **Step 9: Commit**

```bash
git add site/board.js site/governance.js site/overview.js site/overview.html site/OVERVIEW.md \
  app/lib/__tests__/board.test.mjs engine/verify-reader-features.mjs
git commit -m "refactor: the governance board becomes the board both views draw" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 3: The document as a whole and the final score, as data

**Files:**
- Create: `site/document-assessment.js`
- Create: `app/lib/__tests__/document-assessment.test.mjs`
- Modify: `engine/panel/test_site_rubrics.py` (append)
- Modify: `site/OVERVIEW.md`

**Existing tests that must keep passing, untouched:** every suite; this task adds a module nothing imports yet.

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (from `site/document-assessment.js`):
  - `CRITERION_MAX = 4`, `SHOWN_MAX = 2`, `WHOLE_MAX = 10`, `FINAL_MAX = 20`
  - `CRITERIA: {key, name, asks, anchors: {0, 2, 4}}[]`, in the order `conflict_rules`, `rule_force`, `reasons`, `situations`, `contradictions`
  - `HALVING`, `CONTRADICTIONS_RULE`, `HOW_SETTLED`, `NOT_REVIEWED`: the sentences the board says about the scores
  - `round1(value)`, `criterionMean(assessment, key)`, `wholeFigures(assessment) -> {parts, total}`
  - `behavioursFigure(behaviours, column) -> {value, count} | null`
  - `categoryFigure(members, column) -> number | null`
  - `finalFigure(behaviours, assessment, column) -> {behaviours, whole, value} | null`
  - `orderedClaims(assessment) -> claims`, `yesNo(value)`
  - `judgesOf(judges) -> {seat, model, given}[]`
  - `methodFacts({behaviours, assessment, columns, provenance}) -> {depthSeats, depthSubstitutions, contradictionSeats, readingSubstitutions, readings}`
- Produces in `engine/panel/test_site_rubrics.py`: `prompt_criteria() -> (asks, anchors, situations)`, `prompt_contradiction() -> str`.

**The decisions this module carries.**

1. **Out of ten, not out of twenty, on the page.** The payload's `total` is out
   of 20: four criteria means plus the contradictions score, each out of 4. The
   board shows the document as a whole out of 10, so that it weighs exactly as
   much as the behaviours' figure in the final score out of 20. Each criterion
   is halved to a figure out of 2, from the judges' own scores rather than from
   the payload's rounded `mean`, so halving is not a second rounding; the total
   is the sum of the five figures as shown, so the figures on screen add up
   exactly. The payload's `total` is not shown anywhere on the page. The MCP
   server still answers it out of 20 (Task 6), and `methodology/document-assessment-rubric.md`
   still states it out of 20; the method fold says the page halves it.
2. **The behaviours' figure is the plain mean of every behaviour cell of that
   document**, not the mean of the category means, so a category with more
   behaviours in it counts for more. A category's own figure is the plain mean
   of its behaviours.
3. **A lab with no specification** has nothing to assess: NA on the final score
   and on the whole-document row and its five criteria rows, and no rank. It
   keeps 0.0 on the category rows and the behaviour rows, which is what the grid
   has always shown, and the popover there says the nought stands for the
   absence of a document rather than for a document that was read.
4. **A judge is named from the payload's own key.** A depth's judges are keyed
   by the model that held the seat in that run, so the real payload carries
   `sol`, `fable` and `deepseek`, and also `kimi` and `opus` where a run was
   configured differently; `model` appears only where a declared substitute
   answered in that key's seat. The prototype guessed a seat for any key outside
   a hardcoded panel of three. Nothing here guesses: the key is the name, and a
   substitute is written "`glm` in the `deepseek` seat".
5. **Everything the method fold says about who judged is derived**, from the
   payload's own judges and readings. The prototype named `sol`, `fable`,
   `deepseek` and `kimi` in its prose and counted substitutions by looking for
   the seat `fable`.

- [ ] **Step 1: Write the failing node test**

Create `app/lib/__tests__/document-assessment.test.mjs`:

```js
/**
 * The document as a whole, the final score and the figures the board shows, as
 * data. The module is pure, so the arithmetic is tested here; the table that
 * draws it is walked in a browser by engine/verify-reader-features.mjs.
 *
 * Run: node --test app/lib/__tests__/document-assessment.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { CRITERIA, CRITERION_MAX, SHOWN_MAX, WHOLE_MAX, FINAL_MAX, NOT_REVIEWED, HOW_SETTLED,
         round1, criterionMean, wholeFigures, behavioursFigure, categoryFigure, finalFigure,
         orderedClaims, yesNo, judgesOf, methodFacts }
  from "../../../site/document-assessment.js";

const CORPUS = "acme--corpus@2026-01-01";
const SECOND = "acme--second@2026-02-01";
const scores = (a, b, c) => ({ judges: {
  a: { score: a, rationale: "r" }, b: { score: b, rationale: "r", model: "d" },
  c: { score: c, rationale: "r" } }, mean: round1((a + b + c) / 3) });

const ASSESSED = {
  criteria: { conflict_rules: scores(4, 3, 2), rule_force: scores(3, 3, 4),
              reasons: scores(2, 2, 2), situations: scores(1, 2, 2) },
  contradictions: {
    claims: [
      { passages: [{ locator: "x", quote: "q", exampleBlock: false },
                   { locator: "y", quote: "q", exampleBlock: false }],
        situation: "s", why: "w", confirmed: false, absolute: false, reviewed: null,
        readings: [{ seat: "a", found: true, holds: false, absolute: false, reason: "no" },
                   { seat: "b", found: false, holds: false, absolute: null, reason: "no",
                     model: "d" },
                   { seat: "c", found: false, holds: true, absolute: false, reason: "yes" }] },
      { passages: [{ locator: "y", quote: "q", exampleBlock: false },
                   { locator: "z", quote: "q", exampleBlock: false }],
        situation: "s", why: "w", confirmed: true, absolute: false, reviewed: null,
        readings: [{ seat: "a", found: false, holds: true, absolute: false, reason: "yes" },
                   { seat: "b", found: true, holds: true, absolute: false, reason: "yes" },
                   { seat: "c", found: false, holds: false, absolute: false, reason: "no" }] },
    ],
    score: 2,
  },
  total: 12.0,
};

const BEHAVIOURS = [
  { slug: "one", name: "One", category: "First",
    coverage: { [CORPUS]: { depth: { mean: 7.3, scale: 10, judges: {
      sol: { depth: 8, rationale: "r" }, deepseek: { depth: 7, rationale: "r", model: "glm" },
      kimi: { depth: 7, rationale: "r" } } } },
                [SECOND]: { depth: { mean: 4, scale: 10, judges: {} } } } },
  { slug: "two", name: "Two", category: "First",
    coverage: { [CORPUS]: { depth: { mean: 6, scale: 10, judges: {} } } } },
  { slug: "three", name: "Three", category: "Second",
    coverage: { [CORPUS]: { depth: { mean: 10, scale: 10, judges: {} } },
                [SECOND]: { depth: { mean: 3, scale: 10, judges: {} } } } },
];
const CORPUS_COLUMN = { id: CORPUS, lab: "Acme" };
const ABSENT = { lab: "Nowhere", absent: true };

test("the five criteria are the builder's four in its order, with the contradictions last", () => {
  assert.deepEqual(CRITERIA.map(one => one.key),
    ["conflict_rules", "rule_force", "reasons", "situations", "contradictions"]);
  assert.deepEqual(CRITERIA.map(one => one.name),
    ["Conflict rules", "Force of each rule", "Reasons given", "Situations covered",
     "Unresolved contradictions"]);
  assert.deepEqual([CRITERION_MAX, SHOWN_MAX, WHOLE_MAX, FINAL_MAX], [4, 2, 10, 20]);
});

test("a criterion's mean comes from the judges' own scores, and the contradictions' from the run", () => {
  assert.equal(criterionMean(ASSESSED, "conflict_rules"), 3);
  assert.equal(criterionMean(ASSESSED, "situations"), 5 / 3);
  assert.equal(criterionMean(ASSESSED, "contradictions"), 2);
});

test("each criterion is halved to a figure out of 2, and the five add up to the total shown", () => {
  const { parts, total } = wholeFigures(ASSESSED);
  assert.deepEqual(parts, [1.5, 1.7, 1, 0.8, 1]);
  assert.equal(total, 6);
  assert.equal(total, round1(parts.reduce((sum, part) => sum + part, 0)),
    "the figures on screen add up to the figure on screen");
});

test("the behaviours' figure is the plain mean of every cell, not the mean of the categories", () => {
  assert.deepEqual(behavioursFigure(BEHAVIOURS, CORPUS_COLUMN), { value: 7.8, count: 3 });
  const categories = [7.3 + 6, 10].map((sum, i) => sum / [2, 1][i]);
  assert.notEqual(7.8, round1((categories[0] + categories[1]) / 2));
  assert.equal(behavioursFigure(BEHAVIOURS, ABSENT), null);
});

test("a category's figure is the plain mean of its behaviours, and a lab with no document is nought", () => {
  const first = BEHAVIOURS.filter(one => one.category === "First");
  assert.equal(categoryFigure(first, CORPUS_COLUMN), 6.7);
  assert.equal(categoryFigure(first, { id: SECOND, lab: "Acme" }), 4);
  assert.equal(categoryFigure(first, ABSENT), 0);
});

test("the final score is the behaviours out of 10 plus the document as a whole out of 10", () => {
  const final = finalFigure(BEHAVIOURS, ASSESSED, CORPUS_COLUMN);
  assert.deepEqual([final.behaviours.value, final.whole, final.value], [7.8, 6, 13.8]);
});

test("a lab with no specification, and a document with no assessment, have no final score", () => {
  assert.equal(finalFigure(BEHAVIOURS, null, ABSENT), null);
  assert.equal(finalFigure(BEHAVIOURS, null, { id: SECOND, lab: "Acme" }), null);
});

test("the contradictions are listed confirmed first", () => {
  assert.deepEqual(orderedClaims(ASSESSED).map(claim => claim.confirmed), [true, false]);
  assert.deepEqual(orderedClaims({ contradictions: { claims: [], score: 4 } }), []);
});

test("a reading says yes, no, or that it was not given", () => {
  assert.deepEqual([yesNo(true), yesNo(false), yesNo(null)], ["Yes", "No", "Not given"]);
});

test("a judge is named by the payload's own key, and a substitute is named in that seat", () => {
  const judges = judgesOf(BEHAVIOURS[0].coverage[CORPUS].depth.judges);
  assert.deepEqual(judges.map(one => [one.seat, one.model]),
    [["deepseek", "glm"], ["kimi", null], ["sol", null]]);
});

test("the method's facts are read out of the payload, never named in the code", async () => {
  const facts = methodFacts({
    behaviours: BEHAVIOURS, assessment: { [CORPUS]: ASSESSED },
    columns: [CORPUS_COLUMN, ABSENT], provenance: { panel: ["deepseek", "kimi", "sol"] },
  });
  assert.deepEqual(facts.depthSeats, ["deepseek", "kimi", "sol"]);
  assert.deepEqual(facts.depthSubstitutions, [{ model: "glm", seat: "deepseek", count: 1 }]);
  assert.deepEqual(facts.contradictionSeats, ["a", "b", "c"]);
  assert.equal(facts.readings, 6);
  assert.deepEqual(facts.readingSubstitutions, [{ model: "d", seat: "b", count: 1 }]);
  const source = await readFile(new URL("../../../site/document-assessment.js", import.meta.url),
                               "utf8");
  for (const name of ["sol", "fable", "deepseek", "kimi", "opus", "glm"]) {
    assert.ok(!new RegExp(`["'\`]${name}["'\`]`).test(source), `${name} is named in the code`);
  }
});

test("the contradictions are described by the second method, and as nobody's but the judges'", () => {
  assert.match(HOW_SETTLED, /reads every claim, its own included/);
  assert.match(HOW_SETTLED, /confirmed when two of the three say it holds/);
  assert.ok(!/put to the others/.test(HOW_SETTLED), "the first method's rule");
  assert.equal(NOT_REVIEWED, "No person has reviewed the list.");
});

test("the overview draws its rows from this module", async () => {
  const overview = await readFile(new URL("../../../site/overview.js", import.meta.url), "utf8");
  assert.match(overview, /from "\.\/document-assessment\.js"/);
});
```

- [ ] **Step 2: Append the failing Python checks**

In `engine/panel/test_site_rubrics.py`, add `import sys` to the imports and,
after the `CONDITION` regular expression:

```python
sys.path.insert(0, str(HERE))
import assessment_call            # noqa: E402

DOCUMENT_ASSESSMENT_JS = ROOT / "site" / "document-assessment.js"
# "CONFLICT_RULES: what the document says, ...", and not "CONFLICT_RULES: <0 to 4>"
QUESTION = re.compile(r"^([A-Z_]+): ([a-z].*)$")
# "2 = an order of priority between its rules ..."
ANCHOR = re.compile(r"^([024]) = (.+)$")
# "2. actions the model takes on its own with tools, such as sending, buying or deleting;"
SITUATION = re.compile(r"^\d\. (.+?)[;.]$")
```

After `site_module`:

```python
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
```

Before `if __name__ == "__main__":`:

```python
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
```

- [ ] **Step 3: Run both to verify they fail**

Run: `node --test app/lib/__tests__/document-assessment.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` naming `site/document-assessment.js`.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `PromptCriteriaTest` passes; the five `AssessmentCriteriaTest` cases error with `CalledProcessError`; `FAILED (errors=5)`.

- [ ] **Step 4: Create the module**

Create `site/document-assessment.js`. Its head says what it is and where every
figure comes from:

```js
/* The document as a whole, and the final score: what the board shows about a
 * document's assessment, as data.
 *
 * A publication out of ten carries, beside its depths, an assessment of each
 * document as a whole (engine/panel/build_site_data.py, document_assessment):
 * four criteria each judge scored from 0 to 4, the contradictions the judges
 * found and read with a score computed from the confirmed ones, and a total out
 * of 20.
 *
 * The board shows it out of 10, so that the document as a whole and the
 * behaviours weigh the same in the final score out of 20. Each of the five
 * criteria is halved to a figure out of 2, from the judges' own scores rather
 * than from the payload's rounded mean, and the total is the sum of the five
 * figures as shown, so what is on screen adds up. The payload's own total, out
 * of 20, is what the MCP server answers and what the methodology states; this
 * page says in its method fold that it halves them.
 *
 * The questions and the anchors are the prompts' own words
 * (engine/panel/prompts/assessment-criteria-v1.txt and
 * assessment-contradictions-v2.txt), held to them by
 * engine/panel/test_site_rubrics.py.
 *
 * No seat, model or laboratory is named in this file. Who judged, and who sat
 * in whose seat, is read out of the payload.
 */
```

Then, in order: the four maxima; `CRITERIA`, the five with their `asks` and
their `anchors` at 0, 2 and 4 in the prompts' words; `HALVING`,
`CONTRADICTIONS_RULE`, `HOW_SETTLED` and `NOT_REVIEWED`; and the functions.

The sentences, which are copy and are quoted here exactly:

```js
export const HALVING =
  "The judges score from 0 to 4; the index halves it so the five criteria add up to 10.";

export const CONTRADICTIONS_RULE =
  "Scored from the confirmed contradictions, from 0 to 4, and halved like the other criteria: "
  + "2 when none is confirmed, 1 for one or two with no absolute rule, 0 for three or more or "
  + "any absolute one.";

/* The second method, which is how every contradiction of a publication on this
 * scale was settled (methodology/document-assessment-rubric.md, "How one is
 * found and confirmed"). The first method, where finding a claim counted as a
 * vote for it, is not what any figure on this page was reached by. */
export const HOW_SETTLED =
  "Each seat lists every contradiction it finds; then each of them reads every claim, its own "
  + "included, and says whether it holds and whether it involves a rule the document calls "
  + "absolute. A claim is confirmed when two of the three say it holds, and absolute when two "
  + "say it holds and is absolute.";

export const NOT_REVIEWED = "No person has reviewed the list.";
```

The arithmetic, which is the prototype's, with its rounding kept:

```js
/* One decimal with halves rounded up, clear of the float noise that makes
 * toFixed round 6.75 down. */
export const round1 = value => Math.round(value * 10 + 1e-9) / 10;
const sum = values => values.reduce((total, value) => total + value, 0);

/* A criterion's mean on the judges' own scale of 0 to 4, from their scores, so
 * halving it is not a second rounding of a figure already rounded. The
 * contradictions are not scored by a judge: the run computes that one. */
export function criterionMean(assessment, key) {
  if (key === "contradictions") return assessment.contradictions?.score ?? null;
  const criterion = assessment.criteria?.[key];
  if (!criterion) return null;
  const scores = Object.values(criterion.judges || {}).map(given => given.score)
    .filter(Number.isFinite);
  return scores.length ? sum(scores) / scores.length : criterion.mean ?? null;
}

/* The five figures out of 2 as the board shows them, and their total out of 10,
 * which is their sum as shown. */
export function wholeFigures(assessment) {
  const parts = CRITERIA.map(criterion =>
    round1((criterionMean(assessment, criterion.key) / CRITERION_MAX) * SHOWN_MAX));
  return { parts, total: round1(sum(parts)) };
}
```

`behavioursFigure(behaviours, column)` is the plain mean of every cell of that
document with a finite mean, with its count, and `null` for a lab with no
specification. `categoryFigure(members, column)` is the plain mean of that
category's cells, `0` for a lab with no specification, and `null` where the
document has no figure in that category at all. `finalFigure(behaviours,
assessment, column)` is `null` unless both parts exist, and otherwise
`{behaviours, whole, value: round1(behaviours.value + whole)}`.

`judgesOf(judges)` returns `[{seat, model, given}]` sorted by seat, where `seat`
is the payload's own key and `model` is the substitute or null.
`orderedClaims(assessment)` puts the confirmed first and keeps the payload's
document order within each. `methodFacts` walks the columns on the board and
counts: the depth seats seen, the substitutions by model and seat, the
contradictions seats seen in the readings, how many readings there were and how
many a substitute gave.

- [ ] **Step 5: Run the tests**

Run: `node --test app/lib/__tests__/document-assessment.test.mjs`
Expected: all pass except "the overview draws its rows from this module", which fails until Task 4; `# fail 1`.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `OK`.

- [ ] **Step 6: Document the file and commit**

In `site/OVERVIEW.md`, after the `board.js` row, add:

```markdown
| `document-assessment.js` | What the board says about a document's assessment as a whole on a publication out of ten: the five criteria in the prompts' own words with their anchors, the halving that puts each out of 2 and the document out of 10, the behaviours' mean, a category's mean, the final score out of 20, the order of the contradictions, and who judged, read out of the payload. Pure; imported by `overview.js`. |
```

```bash
git add site/document-assessment.js site/OVERVIEW.md \
  app/lib/__tests__/document-assessment.test.mjs engine/panel/test_site_rubrics.py
git commit -m "feat: the document as a whole and the final score, as data" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 4: A payload fixture on the scale of ten, and the route that answers it

The board is walked in a browser against two publications: the fixture of four
the walkers already serve, and a fixture of ten answered to a pin. The fixture
comes before the board so that Task 5 can be written test first.

**Files:**
- Create: `tests/fixtures/reader/ten/behaviours.json`
- Modify: `engine/reader-routes.mjs`
- Modify: `engine/panel/test_build_site_data.py` (append a class)
- Modify: `tests/README.md` (header note)

**Existing tests that must keep passing, untouched:** `node engine/verify-reader-test.mjs`, `node engine/verify-reader-features.mjs`, `python3 engine/panel/test_build_site_data.py`, `node --test app/lib/__tests__/*.test.mjs`.

**Interfaces:**
- Produces: `export const TEN_PUBLICATION = "c3a5e0d2-9f47-4b8e-a1d6-5e2f7b9c0a14"` in `engine/reader-routes.mjs`, answered only to a pin. Its payload is `tests/fixtures/reader/ten/behaviours.json`; its documents and links are the current publication's.
- Consumed by: Task 5's walker checks, and Task 6's reader checks.

- [ ] **Step 1: Write the failing shape test**

Append to `engine/panel/test_build_site_data.py`, before `if __name__ == "__main__":`:

```python
import assessment_run            # noqa: E402

ROOT = HERE.parents[1]
FIXTURE_OF_TEN = ROOT / "tests" / "fixtures" / "reader" / "ten" / "behaviours.json"


def shape(value, parent=None):
    """Every key path in a value, a list read through all of its items and a
    judge's seat as <seat>, so two values built the same way have the same shape
    whatever they hold."""
    if isinstance(value, dict):
        paths = set()
        for key, item in value.items():
            name = "<seat>" if parent == "judges" else key
            paths |= {(name,)} | {(name,) + rest for rest in shape(item, key)}
        return paths
    if isinstance(value, list):
        return {("[]",) + rest for item in value for rest in shape(item, parent)}
    return set()


class ReaderFixtureOfTenTest(unittest.TestCase):
    """tests/fixtures/reader/ten/behaviours.json is the walkers' publication out
    of ten, written by hand. It is held here to what this builder writes, so the
    board is never tested against a shape no publication has."""

    def setUp(self):
        self.fixture = json.loads(FIXTURE_OF_TEN.read_text(encoding="utf-8"))

    def test_it_is_on_the_scale_of_ten_and_every_depth_says_so(self):
        self.assertEqual(list(self.fixture)[:5], ["generatedFrom", "provenance", "depthScale",
                                                  "assessment", "behaviours"])
        self.assertEqual(self.fixture["depthScale"], 10)
        depths = [cell["depth"] for behaviour in self.fixture["behaviours"]
                  for cell in behaviour["coverage"].values() if cell["depth"]]
        self.assertTrue(depths)
        for depth in depths:
            self.assertEqual(set(depth), {"mean", "judges", "scale"})
            self.assertEqual(depth["scale"], 10)

    def test_every_behaviour_carries_the_category_the_board_groups_by(self):
        categories = {behaviour["category"] for behaviour in self.fixture["behaviours"]}
        self.assertGreaterEqual(len(categories), 2, "the board's groups need more than one")

    def test_its_assessment_has_the_shape_document_assessment_writes(self):
        built = shape(bs.document_assessment(RUN, CALLS, SCORES, CLAIMS, VERDICTS, PASSAGE_TEXT))
        written = set().union(*(shape(one) for one in self.fixture["assessment"].values()))
        self.assertEqual(written, built)

    def test_its_means_and_totals_add_up_as_the_builder_adds_them(self):
        for document, assessed in self.fixture["assessment"].items():
            means = []
            for name, criterion in assessed["criteria"].items():
                scores = [judge["score"] for judge in criterion["judges"].values()]
                means.append(sum(scores) / len(scores))
                self.assertEqual(criterion["mean"], round(means[-1], 1), f"{document} {name}")
            self.assertEqual(assessed["total"],
                             round(sum(means) + assessed["contradictions"]["score"], 1), document)

    def test_each_claim_is_settled_and_scored_by_the_second_method(self):
        """Every seat reads every claim; two readings that say it holds confirm
        it. Whether a seat found it does not settle anything."""
        for assessed in self.fixture["assessment"].values():
            claims = assessed["contradictions"]["claims"]
            for claim in claims:
                holds = sum(1 for reading in claim["readings"] if reading["holds"])
                absolute = sum(1 for reading in claim["readings"]
                               if reading["holds"] and reading["absolute"])
                self.assertEqual(claim["confirmed"], holds >= 2)
                self.assertEqual(bool(claim["absolute"]), absolute >= 2)
            self.assertEqual(assessed["contradictions"]["score"],
                             assessment_run.confirm_score(claims))
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 engine/panel/test_build_site_data.py ReaderFixtureOfTenTest`
Expected: five errors, `FileNotFoundError` for `tests/fixtures/reader/ten/behaviours.json`.

- [ ] **Step 3: Answer the publication of ten**

In `engine/reader-routes.mjs`, after `DRAFT_PUBLICATION`, add:

```js
/**
 * A publication on the depth scale of ten, answered only to a pin: the current
 * publication's documents and links under a payload out of ten, which carries
 * an assessment of one of its two documents. Only its payload differs, so it
 * reads the other two files from the current publication's directory.
 */
export const TEN_PUBLICATION = "c3a5e0d2-9f47-4b8e-a1d6-5e2f7b9c0a14";
```

Replace the directory map:

```js
/** Where each publication's files sit, relative to the reader's data directory. */
const PUBLICATION_DIRS = { [CURRENT_PUBLICATION]: ".", [DRAFT_PUBLICATION]: "draft",
                           [TEN_PUBLICATION]: "ten" };

/** The files a publication shares with the current one rather than carrying its own. */
const SHARED_WITH_THE_CURRENT = { [TEN_PUBLICATION]: new Set(["documents.json", "links.json"]) };
```

and in `serveReaderRoute`:

```js
    const shared = SHARED_WITH_THE_CURRENT[pin]?.has(file);
    const dir = join(dataDir, shared ? "." : PUBLICATION_DIRS[pin ?? CURRENT_PUBLICATION]);
```

- [ ] **Step 4: Write the fixture**

Create `tests/fixtures/reader/ten/behaviours.json`. Its top level is, in this
order, `generatedFrom`, `provenance`, `depthScale: 10`, `assessment`,
`behaviours`. `generatedFrom` is `["tests/fixtures/reader/ten (synthetic)"]` and
`provenance` is the current fixture's, with `panel: ["a", "b", "c"]`.

Its behaviours are the current fixture's two, with two more so that the board has
two groups to fold. Every passage, `role` string, `verdicts` and `score` is
copied byte for byte from `tests/fixtures/reader/behaviours.json`, because those
are the builder's own strings and this fixture reproduces them rather than
inventing prose. What differs is the category and the depth:

| Slug | Name | Category | `acme--corpus@2026-01-01` | `acme--second@2026-02-01` |
|---|---|---|---|---|
| `defined-behaviour` | Defined behaviour | Behaviours under test | 7.3, judges `a` 8, `b` 7, `c` 7 | 4.0, judges `a` 4, `b` 4, `d` 4 with the current fixture's `substitutions` block |
| `undefined-behaviour` | Undefined behaviour | Behaviours under test | 10.0, judges `a` `b` `c` 10 | `"depth": null` |
| `folded-behaviour` | Folded behaviour | A second group | 5.0, judges `a` 5, `b` 5, `c` 5 | 6.0, judges `a` 6, `b` 6, `c` 6 |
| `quiet-behaviour` | Quiet behaviour | A second group | 1.0, judges `a` 1, `b` 1, `c` 1 | 2.0, judges `a` 2, `b` 2, `c` 2 |

Every depth carries `"scale": 10`. A judge's entry is `{"depth": n, "rationale": "..."}`,
one sentence in the rubric's terms. The two new behaviours carry one passage
each, copied from the current fixture's, so a link out of the board reaches a
passage that exists.

`assessment` carries `acme--corpus@2026-01-01` and nothing else, so the board
shows a document with an assessment, a document without one and a lab without a
specification in the one walk. Its criteria are:

```json
   "criteria": {
    "conflict_rules": {
     "mean": 3.0,
     "judges": {
      "a": {"score": 4, "rationale": "A strict order, a rule for equal ranks, and examples."},
      "b": {"score": 3, "rationale": "A strict order and examples; equal ranks are left to judgement.", "model": "d"},
      "c": {"score": 2, "rationale": "An order to be weighed as a whole."}
     }
    },
    "rule_force": {
     "mean": 3.3,
     "judges": {
      "a": {"score": 3, "rationale": "Most sections carry an authority label."},
      "b": {"score": 3, "rationale": "Most sections carry an authority label.", "model": "d"},
      "c": {"score": 4, "rationale": "Every rule carries its force."}
     }
    },
    "reasons": {
     "mean": 2.0,
     "judges": {
      "a": {"score": 2, "rationale": "Only the strictest rules give a reason."},
      "b": {"score": 2, "rationale": "Only the strictest rules give a reason.", "model": "d"},
      "c": {"score": 2, "rationale": "Only the strictest rules give a reason."}
     }
    },
    "situations": {
     "mean": 1.7,
     "judges": {
      "a": {"score": 1, "rationale": "Ordinary conversation and tools only."},
      "b": {"score": 2, "rationale": "Three of the six have rules of their own.", "model": "d"},
      "c": {"score": 2, "rationale": "Three of the six have rules of their own."}
     }
    }
   },
```

and its contradictions are two claims, settled by the second method: every seat
reads both, so every claim carries three readings and none of them is a "found
it" standing in for a reading.

```json
   "contradictions": {
    "claims": [
     {
      "passages": [
       {"locator": "corpus@2026-01-01 > #sentences > ¶1", "quote": "A locator may name a span of sentences, so the splitter has to agree with a reader about where a sentence ends. This paragraph has three. The second one ends here. And the third mentions e.g. an abbreviation, i.e. a token that ends in a full stop without ending a sentence, such as etc. or vs. or approx. and the U.S. and the U.K.", "exampleBlock": false},
       {"locator": "corpus@2026-01-01 > #sentences > ¶2", "quote": "Dr. Smith, Mr. Jones and Ms. Patel walk into a paragraph. No. 4 on the list is vol. 2, cf. the note above. The span arithmetic must count four sentences here and not eleven.", "exampleBlock": false}
      ],
      "situation": "When a reader counts the sentences of a paragraph.",
      "why": "One passage says its paragraph has three sentences and the other that the count must be four.",
      "readings": [
       {"seat": "a", "found": true, "holds": true, "absolute": false, "reason": "Neither count yields to the other."},
       {"seat": "b", "found": false, "holds": false, "absolute": false, "reason": "Each count is about its own paragraph.", "model": "d"},
       {"seat": "c", "found": false, "holds": false, "absolute": false, "reason": "The two passages count different paragraphs."}
      ],
      "confirmed": false,
      "absolute": false,
      "reviewed": null
     },
     {
      "passages": [
       {"locator": "corpus@2026-01-01 > #sentences > ¶2", "quote": "Dr. Smith, Mr. Jones and Ms. Patel walk into a paragraph. No. 4 on the list is vol. 2, cf. the note above. The span arithmetic must count four sentences here and not eleven.", "exampleBlock": false},
       {"locator": "corpus@2026-01-01 > #blocks > ¶2", "quote": "This is a second block, and it runs across two source lines, which the parser joins into one block because the second line continues the first.", "exampleBlock": false}
      ],
      "situation": "When a paragraph runs across two source lines.",
      "why": "One passage counts sentences across the break and the other joins the lines into one block first.",
      "readings": [
       {"seat": "a", "found": false, "holds": true, "absolute": false, "reason": "Nothing in the document says which prevails."},
       {"seat": "b", "found": false, "holds": false, "absolute": false, "reason": "The next section settles it.", "model": "d"},
       {"seat": "c", "found": true, "holds": true, "absolute": false, "reason": "The two cannot both be followed on one paragraph."}
      ],
      "confirmed": true,
      "absolute": false,
      "reviewed": null
     }
    ],
    "score": 2
   },
   "total": 12.0
```

The figures this fixture puts on the board, which Task 5's checks read:

- the document as a whole: parts `1.5, 1.7, 1.0, 0.8, 1.0`, total `6.0` out of 10;
- the behaviours' mean for the corpus: `(7.3 + 10 + 5 + 1) / 4 = 5.8` out of 10;
- its final score: `5.8 + 6.0 = 11.8` out of 20;
- the second document: behaviours `(4 + 6 + 2) / 3 = 4.0`, no assessment, so NA on the final score and unranked.

- [ ] **Step 5: Run the shape test and the walkers**

Run: `python3 engine/panel/test_build_site_data.py`
Expected: `OK`.

Run: `node engine/verify-reader-test.mjs`
Expected: `All views verified.`

Run: `node engine/verify-reader-features.mjs`
Expected: `ALL FEATURE CHECKS PASSED.` Nothing reads the new publication yet.

- [ ] **Step 6: Document it and commit**

In `tests/README.md`, in the header note, replace `and \`reader/\`, the payload and the documents, two of the three payloads the reader's routes serve.` with `and \`reader/\`, the payload and the documents, two of the three payloads the reader's routes serve, with \`reader/ten/\`, a payload on the depth scale of ten that \`engine/reader-routes.mjs\` answers to a pin, beside the current publication's documents and links.`

```bash
git add tests/fixtures/reader/ten/behaviours.json engine/reader-routes.mjs \
  engine/panel/test_build_site_data.py tests/README.md
git commit -m "test: a payload on the scale of ten, answered to a pin" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 5: The overview becomes the board

The coverage view stops being a scrolling grid with a scale beside it and
becomes the board of `docs/prototypes/2026-09-22-depth-out-of-ten/index.html`:
one table, the final score at the top, the document as a whole and each
behaviour category as a group that opens, the evidence in popovers, the depth
scale and the method under the table, and the contradictions in the sheet.

**Files:**
- Modify: `site/overview.html` (the coverage section's markup at about 909-952, and its styles)
- Modify: `site/overview.js` (rewritten; what it keeps is named below)
- Modify: `engine/verify-reader-features.mjs` (a new section)
- Modify: `site/OVERVIEW.md`

**Existing tests that must keep passing, untouched:** `python3 -m unittest discover -s tests` (`tests/test_page_feedback_bubble.py` reads the feedback bubble out of `site/overview.html`, `tests/test_governance_tab.py` reads the governance panel), `node engine/verify-reader-test.mjs`, the `== Overview: the governance view ==` and `== Navigation: exactly one entry marks the page you are on ==` sections of `engine/verify-reader-features.mjs`, `node --test app/lib/__tests__/*.test.mjs`.

**Interfaces:**
- Consumes: `site/board.js` (Task 2), `site/depth-scale.js` (Task 1), `site/document-assessment.js` (Task 3), the fixture and the pin of Task 4.
- Produces in the DOM, which Task 5's own checks and nothing else read: `#board` (the table), `#board .total-row`, `tr.question-row`, `tr.check-row`, `.row-toggle`, `.cell-button`, `.cell-figure`, `.cell-max`, `.cell-na`, `#grid-pop` (the coverage view's popover), `#expand-all`, `#legend`, `#depth-key`, `#depth-key-odd`, `#ties`, `#method-body`, and the sheet already in the page.

**What the page keeps from the grid it replaces.** These are live features the
prototype does not have, because the prototype had no data for them, and losing
them would be a regression:

- the `?publication=` pin, threaded through the four route loads and through every link into the reader;
- the notes written beside the site by `engine/panel/link_overview.py` and `link_depth.py` and served by `/api/reader/links`: "Why this figure" and "Where this specification stands" in a behaviour cell's popover, each saying "Not written yet for this specification and behaviour." where it is missing;
- the behaviour's own brief from `/api/reader/behaviours`: "What the judges are asked" and "Where the construct stops";
- what a nought means for a lab with no specification, in the words `openAbsent` uses today, ending in the "propose it" link;
- the feedback bubble, the dev tag, the brand header and the two view tabs, which are markup this task does not touch.

**What it drops:** the scrolling frame and the count of behaviours below the fold
(`fitGrid`, `updateRemaining`, `BELOW_THE_GRID`, `LEAST_GRID`, `GRID_SHARE`,
`#grid-scroll`, `#grid-remaining`), the scale rail beside the grid (`#legend-list`,
`.scale-rail`), the divider rows between categories, and `#grid-caption`, whose
job the board's `#status` does.

- [ ] **Step 1: Write the failing walker checks**

In `engine/verify-reader-features.mjs`, add `TEN_PUBLICATION` to the import from
`./reader-routes.mjs`, and add this section directly before
`console.log("== Every page: the feedback bubble ==");`:

```js
// =============================================================================
console.log("== Overview: the board, on the scale of four and on the scale of ten ==");
/* The board reads its scale and its assessment from the publication. The
 * current fixture is out of four and carries no assessment, so the board is its
 * categories and nothing else; the publication of ten, answered to a pin,
 * carries the final score, the document as a whole and its contradictions. */
{
  const root = new URL("/", base).href;
  const S1 = "corpus@2026-01-01 > #sentences > ¶1";
  const S2 = "corpus@2026-01-01 > #sentences > ¶2";
  const B2 = "corpus@2026-01-01 > #blocks > ¶2";
  const openBoard = async query => {
    pageErrors = [];
    await page.goto(`${root}${query}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#board tbody tr").length > 0,
      undefined, { timeout: 10000 }).catch(() => {});
  };
  const readBoard = () => page.evaluate(() => {
    const rows = [...document.querySelectorAll("#board tbody tr")];
    const rowOf = name => rows.find(tr => tr.querySelector(".head-name")?.textContent === name);
    const read = button => (button ? {
      text: button.querySelector(".cell-figure")?.textContent ?? "",
      max: button.querySelector(".cell-max")?.textContent ?? "",
      label: button.getAttribute("aria-label"),
      background: getComputedStyle(button).backgroundColor,
    } : null);
    const cell = (name, column) =>
      read(rowOf(name)?.querySelectorAll("td")[column]?.querySelector(".cell-button"));
    return {
      heads: [...document.querySelectorAll("#board thead .company-button")].map(button => ({
        rank: button.querySelector(".rank")?.textContent.trim(),
        lab: button.querySelector(".company-name")?.textContent,
      })),
      names: rows.map(tr => tr.querySelector(".head-name")?.textContent),
      subs: rows.map(tr => tr.querySelector(".head-sub")?.textContent ?? ""),
      folded: rows.filter(tr => tr.classList.contains("check-row")).every(tr => tr.hidden),
      cell,
      levels: [...document.querySelectorAll("#depth-key > li .anchor-level")].map(n => n.textContent),
      anchors: [...document.querySelectorAll("#depth-key > li .anchor-name")].map(n => n.textContent),
      conditions: [...document.querySelectorAll("#depth-key .depth-key-conditions li")]
        .map(n => n.textContent),
      keyTitle: document.querySelector("#depth-key-title")?.textContent,
      odd: document.querySelector("#depth-key-odd")?.textContent ?? "",
      ties: document.querySelector("#ties")?.textContent ?? "",
      method: document.querySelector("#method-body")?.textContent ?? "",
      methodOpen: document.querySelector("#method")?.open,
    };
  });
  const cellOf = async (name, column) => page.evaluate(([name, column]) => {
    const row = [...document.querySelectorAll("#board tbody tr")]
      .find(tr => tr.querySelector(".head-name")?.textContent === name);
    const button = row.querySelectorAll("td")[column].querySelector(".cell-button");
    return { text: button.querySelector(".cell-figure")?.textContent ?? "",
             max: button.querySelector(".cell-max")?.textContent ?? "",
             label: button.getAttribute("aria-label"),
             background: getComputedStyle(button).backgroundColor };
  }, [name, column]);
  const press = (name, column) => page.evaluate(([name, column]) => {
    const row = [...document.querySelectorAll("#board tbody tr")]
      .find(tr => tr.querySelector(".head-name")?.textContent === name);
    (column === null ? row.querySelector(".row-name")
      : row.querySelectorAll("td")[column].querySelector(".cell-button")).click();
  }, [name, column]);
  const fold = name => page.evaluate(name => {
    [...document.querySelectorAll("#board tbody tr")]
      .find(tr => tr.querySelector(".head-name")?.textContent === name)
      .querySelector(".row-toggle").click();
  }, name);
  const readPop = () => page.evaluate(() => ({
    open: document.querySelector("#grid-pop").matches(":popover-open"),
    title: document.querySelector("#grid-pop h2")?.textContent,
    subtitle: document.querySelector("#grid-pop .subtitle")?.textContent,
    body: document.querySelector("#grid-pop").textContent.replace(/\s+/g, " ").trim(),
    headings: [...document.querySelectorAll("#grid-pop h3")].map(h => h.textContent),
    here: [...document.querySelectorAll("#grid-pop .anchors li.is-here .anchor-name")]
      .map(n => n.textContent),
    judges: [...document.querySelectorAll("#grid-pop .judges .who")]
      .map(n => n.textContent.replace(/\s+/g, " ").trim()),
    buttons: [...document.querySelectorAll("#grid-pop .gov-button")].map(b => b.textContent),
  }));
  const readSheet = () => page.evaluate(() => ({
    open: document.querySelector("#sheet").open,
    title: document.querySelector("#sheet-title").textContent,
    body: document.querySelector("#sheet-body").textContent.replace(/\s+/g, " ").trim(),
    statuses: [...document.querySelectorAll("#sheet-body .claim-status")]
      .map(n => n.textContent.trim()),
    links: [...document.querySelectorAll("#sheet-body .passage-cite a")]
      .map(a => a.getAttribute("href")),
    readings: [...document.querySelectorAll("#sheet-body .readings tbody tr")]
      .map(tr => [...tr.querySelectorAll("td")].map(td => td.textContent.trim()).join("|")),
  }));
  const closeSheet = () => page.evaluate(() => document.querySelector("#sheet").close());
  const closePop = () => page.evaluate(() => document.querySelector("#grid-pop").hidePopover());

  // ---- the publication of four
  await openBoard("");
  const four = await readBoard();
  check(!four.names.includes("Final score") && !four.names.includes("The document as a whole"),
    "a publication of four has no final score and no document as a whole",
    JSON.stringify(four.names));
  check(four.names[0] === "Behaviours under test" && four.subs[0] === "out of 4, 2 behaviours"
      && four.folded,
    "its categories are the board's groups, folded", JSON.stringify([four.names, four.subs]));
  check(four.keyTitle === "Depth of a behaviour, out of 4"
      && four.levels.join() === "0,1,2,3,4" && four.conditions.length === 0 && four.odd === "",
    "the scale under the table is the scale of four, with no conditions and no line on odd figures",
    JSON.stringify([four.keyTitle, four.levels, four.odd]));
  check((await cellOf("Behaviours under test", 0)).label
      === "Acme, behaviours under test: 3.4 out of 4"
      && (await cellOf("Behaviours under test", 0)).background === "rgb(118, 147, 56)",
    "a category's figure is the plain mean of its behaviours, painted over 4",
    JSON.stringify(await cellOf("Behaviours under test", 0)));
  await fold("Behaviours under test");
  check((await cellOf("Defined behaviour", 0)).background === "rgb(168, 154, 47)"
      && (await cellOf("Defined behaviour", 0)).label
        === "Acme, defined behaviour: 2.7 out of 4",
    "a behaviour out of four wears the colour it always wore",
    JSON.stringify(await cellOf("Defined behaviour", 0)));
  check(pageErrors.length === 0, "the board out of four: no console errors", pageErrors.join("; "));

  // ---- the publication of ten
  await openBoard(`?publication=${TEN_PUBLICATION}`);
  const ten = await readBoard();
  check(ten.names.slice(0, 2).join(" | ") === "Final score | The document as a whole"
      && ten.subs.slice(0, 2).join(" | ") === "out of 20 | out of 10, five criteria"
      && ten.folded,
    "the final score leads, the document as a whole follows, and every group starts folded",
    JSON.stringify([ten.names, ten.subs, ten.folded]));
  check(ten.heads[0].rank === "1" && ten.heads[0].lab === "Acme",
    "the rank sits above the lab's name", JSON.stringify(ten.heads.slice(0, 3)));
  const final = await cellOf("Final score", 0);
  check(final.text === "11.8" && final.max === "/20"
      && final.label === "Acme, final score: 11.8 out of 20"
      && final.background === "rgb(192, 158, 43)",
    "the final score is the behaviours plus the document as a whole, marked out of 20",
    JSON.stringify(final));
  const whole = await cellOf("The document as a whole", 0);
  check(whole.text === "6.0" && whole.max === "/10" && whole.background === "rgb(189, 158, 44)",
    "the document as a whole is its five criteria, out of 10", JSON.stringify(whole));
  const na = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#board tbody tr")];
    const cells = name => [...rows.find(tr => tr.querySelector(".head-name")?.textContent === name)
      .querySelectorAll("td .cell-button")].map(b => ({ text: b.textContent,
        na: b.classList.contains("cell-na"), label: b.getAttribute("aria-label") }));
    return { final: cells("Final score"), whole: cells("The document as a whole") };
  });
  check(na.final.filter(one => one.na).length === 7 && na.whole.filter(one => one.na).length === 7
      && na.final.every(one => one.na === (one.text === "NA"))
      && na.final.some(one => one.label === "Nowhere, final score: not assessed") === false,
    "a document with no assessment and a lab with no specification read NA on both rows",
    JSON.stringify(na.final.map(one => one.text)));
  check(ten.keyTitle === "Depth of a behaviour, out of 10"
      && ten.levels.join() === "0,2,4,6,8,10"
      && ten.anchors.join() === "absent,named,discussed,prescribed,demonstrated,bounded"
      && ten.conditions.length === 3
      && ten.conditions[0].startsWith("The edge is shown:")
      && ten.odd === "An odd figure means the level below is fully met and part of the next.",
    "the scale of ten sits under the table, with the three conditions under 10 and the odd line",
    JSON.stringify([ten.levels, ten.conditions, ten.odd]));

  await fold("Behaviours under test");
  const behaviour = await cellOf("Defined behaviour", 0);
  check(behaviour.text === "7.3" && behaviour.max === "/10"
      && behaviour.label === "Acme, defined behaviour: 7.3 out of 10"
      && behaviour.background === "rgb(152, 152, 50)",
    "a behaviour out of ten is painted over ten", JSON.stringify(behaviour));
  await press("Defined behaviour", 0);
  let popover = await readPop();
  check(popover.open && popover.body.includes("7.3 out of 10, prescribed and partly demonstrated")
      && popover.here.join() === "prescribed,demonstrated"
      && popover.judges.length === 3
      && popover.headings.includes("Why this figure")
      && popover.headings.includes("Where this specification stands"),
    "a figure opens on its words, its readings, its place on the scale and both notes",
    JSON.stringify([popover.headings, popover.here]));
  await closePop();

  await fold("The document as a whole");
  const criterion = await cellOf("Unresolved contradictions", 0);
  check(criterion.text === "1.0" && criterion.max === "/2",
    "each criterion is shown out of 2", JSON.stringify(criterion));
  await press("Unresolved contradictions", 0);
  popover = await readPop();
  check(popover.body.includes("1 confirmed of 2 listed")
      && popover.body.includes("No person has reviewed the list.")
      && popover.buttons.includes("Read the contradictions"),
    "the contradictions say how many were confirmed, that nobody reviewed them, and open the list",
    JSON.stringify([popover.body.slice(0, 200), popover.buttons]));
  await page.evaluate(() => [...document.querySelectorAll("#grid-pop .gov-button")]
    .find(button => button.textContent === "Read the contradictions").click());
  const sheet = await readSheet();
  check(sheet.open && sheet.title === "Acme: Unresolved contradictions"
      && sheet.statuses.join(" | ") === "Confirmed | Not confirmed",
    "the list opens in the sheet, confirmed first", JSON.stringify([sheet.title, sheet.statuses]));
  check(sheet.body.includes("Each seat lists every contradiction it finds")
      && sheet.body.includes("reads every claim, its own included")
      && !sheet.body.includes("put to the others"),
    "the sheet says how a contradiction was settled, by the second method",
    sheet.body.slice(0, 300));
  const links = sheet.links.map(href => new URL(href, root));
  check(links.length === 4
      && links.every(url => url.pathname === "/spec-reader/"
        && url.searchParams.get("publication") === TEN_PUBLICATION)
      && links.map(url => url.searchParams.get("passage")).join(" | ")
        === [S2, B2, S1, S2].join(" | "),
    "each claim quotes both its passages, each a link into the reader on that passage",
    JSON.stringify(sheet.links));
  check(sheet.readings.length === 6
      && sheet.readings.some(row => row.startsWith("b answered by d|"))
      && sheet.readings.filter(row => row.includes("|Yes|")).length >= 2,
    "every seat's reading is there, and a substitute is named in its seat",
    JSON.stringify(sheet.readings));
  await closeSheet();

  check(ten.method.includes("Final score, out of 20")
      && ten.method.includes("the plain mean of the document's behaviour depths")
      && ten.method.includes("reads every claim, its own included")
      && !ten.method.includes("put to the others")
      && !/sol|fable|deepseek|kimi/.test(ten.method)
      && ten.methodOpen === false,
    "how the scores are made is folded, says the second method, and names the payload's own seats",
    ten.method.slice(0, 300));
  check(ten.ties === "" || /share (first|second|third)/.test(ten.ties),
    "the ties line says which place is shared, or says nothing", ten.ties);
  check(pageErrors.length === 0, "the board out of ten: no console errors", pageErrors.join("; "));

  pageErrors = [];
  await page.goto(links[0].href, { waitUntil: "networkidle" });
  await page.waitForFunction(ready, undefined, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(700);
  const opened = await page.evaluate(() => {
    const status = document.querySelector("#reader-status");
    return {
      document: document.querySelector(".document-panel")?.dataset.documentId ?? null,
      current: document.querySelector(".document-panel [data-passage-id].current")
        ?.dataset.locators?.split("\n") ?? [],
      status: status.classList.contains("visible") ? status.textContent : "",
    };
  });
  check(opened.document === DOC_ID && opened.current.includes(S2) && opened.status === ""
      && pageErrors.length === 0,
    "a contradiction's passage opens the reader on that passage, in the same publication",
    `${JSON.stringify(opened)} ${pageErrors.join("; ")}`);
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node engine/verify-reader-features.mjs`
Expected: the section prints `FAIL` from its first check, because `#board` does not exist and `readBoard` returns empty lists; the run ends with a count of failures and exits 1. The governance section above it still prints `PASS` throughout.

- [ ] **Step 3: The markup**

In `site/overview.html`, `<section id="view-coverage">` keeps its `<h1>`, its
lede and the feedback bubble, and its body becomes the board's. The title is
left exactly as it is; see the open decisions.

```html
  <p class="grid-note" id="status" aria-live="polite">Loading.</p>

  <div class="gov-toolbar">
    <p class="gov-hint">
      Press a figure to see the evidence behind it, or a lab or a row&rsquo;s name to read
      about it. Open a group to see its rows.
    </p>
    <button type="button" class="gov-button" id="expand-all" aria-pressed="false">Show every row</button>
  </div>
  <div class="matrix-wrap">
    <table class="board" id="board">
      <caption class="visually-hidden">Each lab&rsquo;s final score, its document as a whole and its behaviours by category, with each group&rsquo;s rows available to open</caption>
      <thead></thead>
      <tbody></tbody>
    </table>
  </div>
  <div class="gov-legend" id="legend" aria-hidden="true"></div>
  <section class="depth-key" aria-labelledby="depth-key-title">
    <h2 id="depth-key-title"></h2>
    <ol class="depth-key-list" id="depth-key"></ol>
    <p class="gov-foot" id="depth-key-odd"></p>
  </section>
  <p class="gov-foot" id="ties"></p>

  <div class="gov-more">
    <details id="method">
      <summary>How the scores are made</summary>
      <div class="gov-more-body" id="method-body"></div>
    </details>
  </div>
```

and, beside the governance view's own popover, the coverage view's:

```html
  <div class="gov-pop" id="grid-pop" popover role="dialog" aria-labelledby="grid-pop-title" tabindex="-1"></div>
```

Delete the scale rail (`<aside class="scale-rail" id="legend">` and its list),
the `grid-scroll` frame with `#grid`, `#grid-head`, `#grid-body`,
`#grid-remaining` and `#grid-caption`. The `<dialog id="sheet">` stays where it
is: both views use it, and the contradictions are what the coverage view now
opens in it.

- [ ] **Step 4: The styles**

In the `<style>` of `site/overview.html`, delete the rules for the grid that is
gone: `#grid`, `.grid-scroll`, `.grid-remaining`, `.scale-rail` and its
children, `.cell-empty`'s grid padding, the divider rows. Keep `.cell-empty`
itself: a cell with no figure in a document that has one still shows the en dash.

Add, from the prototype's stylesheet (lines 290-318 and 473-487 of
`docs/prototypes/2026-09-22-depth-out-of-ten/index.html`), copied as they are:

- `.depth-key`, `.depth-key h2`, `.depth-key-list`, `.depth-key-list > li`, `.anchor-level`, `.anchor-name`, `.depth-key-conditions` and its bullet, `.depth-key .gov-foot`;
- `.readings` and its cells, `.judge-model`, and the phone rules at 560px that turn the readings table into labelled lines;
- `.claim`, `.claim-status`, `.status-glyph`, `.claim-absolute`, `.passage`, `.passage-cite`, `.claims-count`, `.sheet-figure`, for the sheet;
- `.inline-button`, for a behaviour named inside a category's popover;
- the `.depth-key-list` column counts at 880px and 640px.

`.gov-pop`, `.chip`, `.anchors`, `.judges`, `.check-list`, `.gov-legend`,
`.gov-foot`, `.gov-more`, `.gov-toolbar`, `.gov-button`, `.row-head`,
`.row-toggle`, `.company-button` and the board rules moved to `.board` in Task 2
are already in this file and are reused, not copied.

- [ ] **Step 5: Rewrite `site/overview.js`**

Its head says what the page is and what it reads, keeping today's paragraph
about the four sources and adding the board:

```js
/* The overview: how each lab's specification scores, behaviour by behaviour and
 * as a document.
 *
 * Four sources, and only the last two are ours to lose. The payload and the
 * documents are the reader's own endpoints, so the figures here and the figures
 * there are the same publication's. The link notes are written beside the site
 * by engine/panel/link_overview.py and link_depth.py and are not deployed: the
 * page renders without them and simply has less to say when a figure is
 * pressed.
 *
 * The board is site/board.js, which the governance view draws too. What is on
 * it depends on the publication: out of ten it carries a final score out of 20,
 * the document as a whole out of 10 opening into five criteria out of 2, and
 * each behaviour category out of 10 opening into its behaviours; out of four,
 * which is every publication before September 2026, it carries the categories
 * alone, out of 4, because such a payload has no assessment and so no final
 * score.
 *
 * Nothing is built with innerHTML. The passages are a model's words and the
 * rationales are a model's words, so every one of them lands as a text node.
 *
 * This file owns the tabs between the two views.
 */
```

Then:

(a) The imports: `initializeGovernance` from `./governance.js`; `createBoard`,
`element`, `mono`, `paragraph`, `ORDINALS`, `level`, `rankBy` from `./board.js`;
`depthScaleOf`, `levelsOf`, `depthWords`, `depthPhrase`, `CONDITIONS_BRIEF`,
`ODD_BRIEF` from `./depth-scale.js`; and from `./document-assessment.js`
everything Task 3 exports.

(b) `WITHOUT_A_SPECIFICATION`, `newestPerSpecification`, `shownVersion`, `PIN`,
`PINNED` and `loadJSON` are kept from today's file, unchanged.

(c) `state` becomes
`{ scale: 4, behaviours: [], categories: [], columns: [], assessment: null, provenance: {}, passages: {}, depths: {}, registry: {} }`.

(d) The order of the columns:

```js
/* Labs by what the board leads on: the final score out of 20 where the
 * publication carries one, and the behaviours' own mean where it does not,
 * which is every publication before the scale of ten. A rank is one more than
 * the number of labs ahead, so labs level on the figure as shown share a place
 * and the next rank skips. The governance view breaks a tie on its best
 * practices; there is no second figure here, so a tie stands. The sort is
 * stable, so level labs keep the alphabetical order they came in, and the labs
 * with no figure follow, unranked, in that order too. */
function leadFigure(column) {
  const final = finalFigure(state.behaviours, assessmentOf(column), column);
  if (final) return final.value;
  if (state.assessment) return null;
  return behavioursFigure(state.behaviours, column)?.value ?? null;
}
```

with `rankBy` from the board given `(a, b) => a.lead > b.lead && !level(a.lead, b.lead)`.

(e) `renderTable`, `renderLegend`, `renderDepthKey`, `renderMethod`,
`renderTies` and every popover builder are the prototype's
(`docs/prototypes/2026-09-22-depth-out-of-ten/index.html`, lines 1100-1466 and
1585-1736), with these changes, which are the whole of what separates the
prototype from the page:

1. Every builder takes its board's helpers from `createBoard({ nodes: { table: byId("board"), pop: byId("grid-pop"), expandAll: byId("expand-all") }, everyRow: { show: "Show every row", hide: "Hide every row" } })` rather than declaring its own.
2. The final score row and the whole-document group are drawn only where `state.assessment` is set. On a publication of four the table starts at the first category, and `renderMethod` writes the paragraphs about the behaviours and the panel and none of the others.
3. Every row's maximum is `state.scale` where it is a depth, `SHOWN_MAX` where it is a criterion, `WHOLE_MAX` where it is the document as a whole or a category, `FINAL_MAX` on the final score. The depth key's heading is `` `Depth of a behaviour, out of ${state.scale}` ``, and its levels are `levelsOf(state.scale)` with `brief`; the conditions and the odd line are drawn on the scale of ten only.
4. Every link into the reader carries the pin: `readerLink({ ...params, ...(PIN ? { publication: PIN } : {}) })`.
5. A behaviour cell's popover adds, under its figure and its readings, the two notes today's `openCell` shows, under the same headings and with the same "Not written yet for this specification and behaviour." where a note is missing; and a behaviour's own popover is today's `openBehaviour`, the registry's brief and boundary, with the depth scale under it.
6. A cell of a lab with no specification keeps today's `openAbsent` words, ending in the "propose it" link.
7. A cell with no figure in a document that has one is left as today's dash, `"\u2013"` in a `span.cell-empty`, not as an empty cell: the prototype never met one, because every cell of its data has a depth.
8. Nothing that names a model, a seat or a panel is written in this file. `renderMethod` builds its sentences from `methodFacts` (Task 3).
9. The prototype's closing method paragraph, "The contradictions in this prototype come from a first run settled by an earlier rule", is dropped: it is stale even of the prototype's own data, and the publication this page serves was settled by the second method.
10. The prototype's `is-invented` ring, its `depth.fake` branches and its "partly invented for the prototype" line are dropped with it: no publication carries an invented figure.
11. The prototype's `PANEL_SEATS` and `placedJudges` are dropped for `judgesOf` (Task 3), which reads the payload's own keys.

(f) `initialize` loads the same four routes as today, then:

```js
  state.scale = depthScaleOf(payload);
  state.behaviours = payload.behaviours;
  state.provenance = payload.provenance || {};
  state.assessment = payload.assessment && typeof payload.assessment === "object"
    ? payload.assessment : null;
```

groups the behaviours into `state.categories` by `category` in first-appearance
order, as today's `render` groups them and as the reader's menu does, registers
the groups with the board, ranks the columns and renders.

- [ ] **Step 6: Run the walkers and everything else**

Run: `node engine/verify-reader-features.mjs`
Expected: every check of the new section prints `PASS`, the governance section is unchanged, last line `ALL FEATURE CHECKS PASSED.`

Run: `node engine/verify-reader-test.mjs`
Expected: `All views verified.`

Run: `node --test app/lib/__tests__/*.test.mjs`
Expected: `# fail 0`, including the two guards that the overview imports `depth-scale.js` and `document-assessment.js`.

Run: `python3 -m unittest discover -s tests`
Expected: `OK`.

- [ ] **Step 7: Look at it against the real publication, then stop for review**

Run: `pnpm dev`, and open `http://localhost:3000/?publication=de378ff3-008f-4977-92ce-d006e90699b9`.
Expected: the board of the prototype, on the real figures: four documents with a
final score, the labs without a specification NA on the assessed rows and 0.0
on the behaviours, every group folded, the depth scale under the table and the
method under that.

Run: `python3 -m http.server 4621 --directory docs/prototypes/2026-09-22-depth-out-of-ten`, and open `http://localhost:4621/`.
Expected: the same board. Compare the two side by side and write down every
difference; a difference that is not one of the changes listed in step 5 is a
mistake in the implementation.

**Stop here and ask the owner the two open decisions**: whether a figure keeps
the governance view's always-light ink or takes the overview's dark-or-light
rule, which is an AA contrast question on the amber cells; and what the page's
title should say now that it carries a final score. Neither is settled in this
plan, and neither should be settled by the implementer.

- [ ] **Step 8: Document and commit**

In `site/OVERVIEW.md`, rewrite the `overview.html, overview.js, ...` row: the
front page is two views of one board, the first the coverage board (final score,
the document as a whole, the behaviours by category, on the scale the
publication carries), the second the governance board.

```bash
git add site/overview.html site/overview.js site/OVERVIEW.md engine/verify-reader-features.mjs
git commit -m "feat: the overview is a board, with the final score and the document as a whole" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 6: The reader reads its depth scale from the payload

**Files:**
- Modify: `site/spec-reader/app.js` (an import at the top; `state` at about 404; the heading at 1326; the comment and `DEPTH_LEVELS` at about 1440-1472; `depthScaleNote` at 1514; `depthCellNote` at 1522-1531; `depthSummaryLine` at 1580-1588; `depthSpoken` at 1593-1597; `openDepthNote`; `initialize`)
- Modify: `site/spec-reader/styles.css` (after `.depth-note-bar, .depth-note-rationale`)
- Modify: `engine/panel/test_appjs_depth.js`, `engine/panel/test_panel.py` (`TestAppJSDepth`)
- Modify: `app/lib/__tests__/depth-scale.test.mjs` (append), `app/lib/__tests__/slice.test.mjs` (append)
- Modify: `engine/verify-reader-features.mjs` (a new reader section)

**Existing tests that must keep passing, untouched:** `node engine/verify-reader-test.mjs` (it asserts "out of 4" and "Depth, out of 4" against the fixture of four), the `== Reader: the depth column explains itself ==` section of `engine/verify-reader-features.mjs` (it asserts the rubric's five levels in the rubric's own words, which is why `bar` keeps the rubric's sentence), every other `engine/panel/test_appjs_*.js` harness, `python3 -m unittest discover -s engine/panel -p "test_*.py"`.

**Interfaces:**
- Consumes from `site/depth-scale.js`: `depthScaleOf`, `levelsOf`, `depthPhrase`, `ODD_VALUES`, `CONDITIONS_FOR_TEN`. The reader shows `bar`, the rubric's own sentence, not the board's `brief`.
- Produces in `app.js`: `state.depthScale` (4 or 10), and `depthScaleNote(behaviours) -> {title, lede, levels, [odd, conditions]}`, where `odd` and `conditions` appear on the scale of ten only.
- Produces in the DOM: the list class `depth-note-scale-ten`, the nested `ul.depth-note-conditions` under level 10, and `p.depth-note-odd`.
- Produces: `TestAppJSDepth` asserts `55 checks, 0 failures`.

- [ ] **Step 1: Write the failing harness checks**

In `engine/panel/test_appjs_depth.js`:

(a) The header's first paragraph becomes:

```js
/* Guard for the depth site/spec-reader/app.js reads out of a publication:
 * panelDepth, depthSummaryLine, updateBehaviourDepths and openBehaviourNote,
 * all extracted verbatim from the real file. The scales and their words are
 * site/depth-scale.js's, which app.js imports and this file requires, so both
 * read the one module.
```

(b) Delete `extractConstBlock` and its comment.

(c) Replace the three `eval` lines with:

```js
/* app.js imports these from site/depth-scale.js; the functions below read them
 * under the same names. */
var { depthScaleOf, levelsOf, depthWords, depthPhrase, ODD_VALUES, CONDITIONS_FOR_TEN } =
  require(path.join(__dirname, "..", "..", "site", "depth-scale.js"));
eval(extractConst("NUMBER_WORDS"));
```

(d) `show` takes the payload's scale:

```js
function show(documents, behaviour, { comparing = false, depthScale = 4 } = {}) {
  state = {
    payload: { documents, behaviours: [behaviour] },
    selectedSpec: documents[0].id,
    comparing,
    comparePair: documents.map(doc => doc.id),
    depthScale,
  };
  behaviourNotes = { [behaviour.slug]: NOTE };
}
```

(e) The check on `DEPTH_WORDS` becomes a check on `depthWords`:

```js
check("the word said beside a mean is the anchor of the level it rounds to",
      () => [0, 1, 2, 3, 4].map(level => depthWords(level, 4)),
      ["absent", "named", "discussed", "prescribed", "demonstrated"]);
```

(f) Directly before `/* ---- the width it opens at ---- */`, add the seven checks
of a publication out of ten: a cell of 7.3 and a cell of 8 on a document judged
on that scale, then

```js
show(JUDGED_DOCUMENTS, TEN_HELPFULNESS, { depthScale: 10 });
check("on the scale of ten the column's heading says so",
      () => depthScaleNote([]).title, "Depth, out of 10");
check("the scale of ten is its six anchors, on the even numbers",
      () => depthScaleNote([]).levels.map(level => `${level.level} ${level.anchor}`),
      ["0 absent", "2 named", "4 discussed", "6 prescribed", "8 demonstrated", "10 bounded"]);
check("the scale of ten says what an odd figure means and what 10 asks",
      () => { const note = depthScaleNote([]); return [note.odd, note.conditions]; },
      ["An odd number means the level below is fully met and the level above is met only in part.",
       ["The edge is shown.", "A conflict is settled.", "A default for the undecidable case."]]);
check("an odd figure out of ten names the level fully met and the next",
      () => depthCellNote(TEN_HELPFULNESS, JUDGED_DOCUMENTS[0]).summary,
      "7.3 out of 10, prescribed and partly demonstrated.");
check("an even figure out of ten takes its anchor",
      () => depthCellNote(TEN_HELPFULNESS, JUDGED_DOCUMENTS[1]).summary,
      "8.0 out of 10, demonstrated.");
check("out of ten, the figure stays bare and its title and spoken form say out of 10",
      () => figure("helpfulness"),
      { text: "7.3",
        title: "Claude’s Constitution 2026-01-20: 7.3 out of 10, prescribed and partly demonstrated.",
        description: "Claude’s Constitution 2026-01-20: 7.3 out of 10, prescribed and partly demonstrated.",
        spoken: "depth 7.3 out of 10" });
show(JUDGED_DOCUMENTS, JUDGED_HELPFULNESS);
check("on the scale of four the scale note carries no odd line and no conditions",
      () => { const note = depthScaleNote([]); return ["odd" in note, "conditions" in note, note.title]; },
      [false, false, "Depth, out of 4"]);
```

In `engine/panel/test_panel.py`, `TestAppJSDepth.test_depth_in_appjs`, change
`"48 checks, 0 failures"` to `"55 checks, 0 failures"`.

Append to `app/lib/__tests__/depth-scale.test.mjs`:

```js
test("the reader carries no copy of the levels or of the scale of four", async () => {
  const reader = await site("spec-reader/app.js");
  assert.ok(!reader.includes("No passage bears on the behaviour."), "a bar was copied back in");
  assert.ok(!/const (DEPTH_LEVELS|DEPTH_WORDS)\b/.test(reader), "a copy was declared");
  assert.ok(!/out of 4\b/.test(reader), "a figure's scale was written as 4");
  assert.match(reader, /from "\/depth-scale\.js"/);
});
```

Append to `app/lib/__tests__/slice.test.mjs`, which pins what the reader and the
board rely on and passes at once:

```js
test("a sliced payload keeps its depth scale and its assessment", () => {
  const payload = {
    depthScale: 10,
    assessment: { [A]: { total: 12 } },
    behaviours: [
      { slug: "helpfulness",
        coverage: { [A]: { depth: { mean: 7.3, judges: {}, scale: 10 }, passages: [] } } },
      { slug: "no-sycophancy",
        coverage: { [A]: { depth: { mean: 6, judges: {}, scale: 10 }, passages: [] } } }],
  };
  const out = sliceColumn("payload", payload,
                          { documents: null, behaviours: new Set(["helpfulness"]) });
  assert.equal(out.depthScale, 10);
  assert.deepEqual(out.assessment, payload.assessment);
  assert.equal(out.behaviours[1].coverage[A].depth.scale, 10,
               "a behaviour whose paragraphs are withheld keeps its depth's scale");
});
```

In `engine/verify-reader-features.mjs`, after the board section, add
`== Reader: the depth scale of ten ==`: at `?publication=${TEN_PUBLICATION}&behavior=${DEFINED}&spec=${DOC_ID}`,
every `.depth-head` says "Depth, out of 10"; the figure is bare, its title says
"7.3 out of 10, prescribed and partly demonstrated." and its spoken form "depth
7.3 out of 10"; the scale note gives the six anchors, three conditions and the
odd line; the cell note gives each judge's own 0 to 10; and comparing speaks
both figures out of 10.

- [ ] **Step 2: Run them to verify they fail**

Run: `node engine/panel/test_appjs_depth.js | tail -3`
Expected: FAIL lines for the seven new checks; for instance "on the scale of ten the column's heading says so" gets `"Depth, out of 4"`. The last line reports failures and the process exits 1.

Run: `node --test app/lib/__tests__/depth-scale.test.mjs`
Expected: "the reader carries no copy of the levels or of the scale of four" fails with "a bar was copied back in".

Run: `node --test app/lib/__tests__/slice.test.mjs`
Expected: `# fail 0`. This one is a pin, not a red test.

Run: `node engine/verify-reader-features.mjs`
Expected: the new reader section fails on "Depth, out of 4".

- [ ] **Step 3: Read the scale in the reader**

In `site/spec-reader/app.js`:

(a) After the header comment, before `const DOCUMENTS_URL`:

```js
/* The depth scales and their words, one module for this page and the overview. */
import { depthScaleOf, levelsOf, depthPhrase, ODD_VALUES, CONDITIONS_FOR_TEN }
  from "/depth-scale.js";
```

(b) In `const state = {`, after `bands: null, ...`:

```js
  /* The scale the payload's depths are on, 4 unless the payload says 10
   * (depthScaleOf). Read once, when the reader loads: a pinned earlier
   * publication reads 4 and says so. */
  depthScale: 4,
```

(c) In `initialize`, after `state.provenance = behaviours.provenance || {};`, add `state.depthScale = depthScaleOf(behaviours);`.

(d) In `renderBehaviourList`, `>Depth, out of 4</button>` becomes `` >Depth, out of ${state.depthScale}</button> ``.

(e) Delete the `DEPTH_LEVELS` block and `DEPTH_WORDS`, and rewrite the comment over them to say that the levels, the words and the line on odd figures are `site/depth-scale.js`'s, which the overview imports too, so the two pages quote one rubric, and that `engine/panel/test_site_rubrics.py` holds its scale of ten to the prompt the judges read.

(f) `depthScaleNote` becomes:

```js
/* What the column's heading opens: the rubric, once, for the whole column. The
 * scale of ten also says what an odd figure means and what 10 asks for; the
 * scale of four has neither, and its note is what it always was. */
function depthScaleNote(behaviours) {
  const scale = state.depthScale;
  return {
    title: `Depth, out of ${scale}`,
    lede: depthScaleLede(behaviours),
    levels: levelsOf(scale),
    ...(scale === 10 ? { odd: ODD_VALUES, conditions: CONDITIONS_FOR_TEN } : {}),
  };
}
```

(g) `depthCellNote`, `depthSummaryLine` and `depthSpoken` say `depthPhrase(depth.mean, state.depthScale)` and `` `${depth.mean.toFixed(1)} out of ${state.depthScale}` `` in place of their written 4s.

(h) In `openDepthNote`, the list takes the class `depth-note-scale-ten` on the
scale of ten, level 10 carries a nested `ul.depth-note-conditions` of the three
conditions, and `p.depth-note-odd` follows the list where `note.odd` is set.

In `site/spec-reader/styles.css`, after `.depth-note-bar, .depth-note-rationale`,
add the rules for `.depth-note-scale.depth-note-scale-ten li` (a wider level
column, since its figures run to two digits), `.depth-note-conditions` and its
items, and `.depth-note-odd`.

- [ ] **Step 4: Run the tests and the walkers**

Run: `node engine/panel/test_appjs_depth.js | tail -1`
Expected: `55 checks, 0 failures`.

Run: `python3 engine/panel/test_panel.py TestAppJSDepth`
Expected: `OK`.

Run: `node --test app/lib/__tests__/*.test.mjs`
Expected: `# fail 0`.

Run: `python3 -m unittest discover -s engine/panel -p "test_*.py"`
Expected: `OK`.

Run: `node engine/verify-reader-test.mjs`
Expected: `All views verified.`

Run: `node engine/verify-reader-features.mjs`
Expected: `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 5: Commit**

```bash
git add site/spec-reader/app.js site/spec-reader/styles.css engine/panel/test_appjs_depth.js \
  engine/panel/test_panel.py engine/verify-reader-features.mjs \
  app/lib/__tests__/depth-scale.test.mjs app/lib/__tests__/slice.test.mjs
git commit -m "feat: the reader reads its depth scale from the publication" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 7: The MCP server says what a depth is out of, and carries the assessment

**Files:**
- Modify: `app/lib/mcp-tools.mjs` (`panelDepth` at about 24-37, `listModelSpecs`, `listBehaviours`, `retrievePassages`, `compareDocuments`, `INSTRUCTIONS` at about 576-619, `about` at about 651-770)
- Modify: `app/api/mcp/route.js` (descriptions at about 90-133)
- Modify: `app/lib/__tests__/mcp-tools.test.mjs` (append)

**Existing tests that must keep passing, untouched:** every test already in `app/lib/__tests__/mcp-tools.test.mjs`, and the rest of `node --test app/lib/__tests__/*.test.mjs`.

**Interfaces:**
- Consumes: the payload fields only; the MCP library does not import `site/`, as `app/lib/bands.mjs` does not.
- Produces:
  - On a publication out of ten, every `depth` answer carries `scale: 10` beside `mean`. On a publication out of four the answer is unchanged, with no `scale`.
  - On a publication out of ten, `list_model_specs` gives each `model_specs[i].assessment` as `{ total, out_of: 20, criteria: { <key>: { mean, out_of: 4, judges } }, contradictions: { score, out_of: 4, note, claims: [...] } }`, or `null` for a document the publication did not assess. On a publication out of four there is no `assessment` key.

**The one thing to be careful of.** The server answers the assessment as the
payload holds it, out of 20, because that is the figure the methodology states
and the figure the database holds. The board shows the same assessment out of
10, halved, so that it weighs the same as the behaviours in a final score out of
20. Both are right and they are not the same number, so the note the server
carries says which it is giving: `"The total is out of 20: the four criteria's
means and the contradictions' score, each out of 4. The index's own overview
halves them and shows the document as a whole out of 10, beside the behaviours'
mean out of 10."`

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/__tests__/mcp-tools.test.mjs` the fixture of an assessed
document and these tests, whose names say what they hold:

- "on a publication out of ten every depth says what it is out of": `listBehaviours`, `retrievePassages` and `compareDocuments` each answer `depth.scale === 10`.
- "the publication's scale is given even where a cell did not record it": delete a cell's own `scale` and the answer still says 10.
- "on a publication out of four a depth answers as it always has, with no scale".
- "list_model_specs carries each document's assessment on a publication out of ten": the total, `out_of: 20`, the four criteria in the builder's order with `out_of: 4`, a judge's `model`, the contradictions' score and `out_of: 4`, the note, a claim's two passages as `{locator, quote}`, its `confirmed`, its readings with their `model`, and `null` for the document the publication did not assess.
- "list_model_specs on a publication out of four carries no assessment at all".
- "about on a publication out of ten gives the scale of ten and the assessment": every anchor from `absent` to `bounded`, "depth for the behaviour, 0 to 10", no "0 to 4", "The total is out of 20", "each document's assessment as a whole".
- "about on a publication out of four keeps the scale of four".
- "the instructions say what a depth is out of, on either scale": `scale: 10`, "A depth without a scale is out of 4", "a total out of 20", "No person has reviewed the list."
- "what the server says about contradictions is the second method":

```js
test("what the server says about contradictions is the second method", () => {
  const said = [INSTRUCTIONS, about(outOfTen()),
                listModelSpecs(outOfTen()).model_specs[0].assessment.contradictions.note,
                ROUTE].join(" ").replace(/\s+/g, " ");
  assert.match(said, /reads every claim, its own included/);
  assert.match(said, /confirmed when two of the three say it holds/);
  assert.ok(!/put to the others/.test(said), "the first method's rule");
  assert.ok(!/found it or hold it/.test(said), "the first method's rule");
});
```

- "the tool descriptions say what a depth is out of": `depth.scale`, "out of 20", and not the old "0 to 4; a pair with no depth answers null".

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test app/lib/__tests__/mcp-tools.test.mjs`
Expected, at least: "the publication's scale is given even where a cell did not record it" fails (`undefined !== 10`); "list_model_specs carries each document's assessment ..." fails (`corpus.assessment` is undefined); the `about`, instructions, contradictions and descriptions tests fail.

- [ ] **Step 3: Implement**

In `app/lib/mcp-tools.mjs`:

(a) Add `depthScaleOf(payload)`, the same rule as the site's, with a comment
saying `site/depth-scale.js` reads it the same way for the pages, and give
`panelDepth(behaviour, modelSpecId, scale = 4)` a third argument that writes
`scale` beside the mean on a publication out of ten, whatever the cell recorded.

(b) After `specSummary`, add `CONTRADICTIONS_NOTE` and `assessmentAnswer(assessed)`:

```js
const CONTRADICTIONS_NOTE =
  "The judges' list. No person has reviewed it. Each contradictions seat lists every "
  + "contradiction it finds; then each of them reads every claim, its own included, and says "
  + "whether it holds and whether it involves a rule the document calls absolute. A claim is "
  + "confirmed when two of the three say it holds, and absolute when two say it holds and is "
  + "absolute. The score counts confirmed claims only: 4 when none is confirmed, 2 when one or "
  + "two are and none involves a rule the document calls absolute, 0 when three or more are or "
  + "any one does.";
```

`assessmentAnswer` returns null unless the total is a finite number, and
otherwise `{total, out_of: 20, criteria, contradictions}` as the interface above
says, each passage of a claim reduced to `{locator, quote}`, the two fields
every other answer gives a passage.

(c) `listModelSpecs` adds `assessment` per document only where the payload
carries an `assessment` object.

(d) (e) (f) `listBehaviours`, `retrievePassages` and `compareDocuments` each read
`const scale = depthScaleOf(payload);` and pass it to every `panelDepth` call.

(g) In `INSTRUCTIONS`, the depth paragraph gains the scale of ten, says that a
depth without a scale is out of 4, and is followed by a paragraph on the
document as a whole: five criteria the same panel scored, a total out of 20
which the index's own overview halves to 10 beside the behaviours, and the
contradictions as the judges' list that no person has reviewed, settled by the
rule in `CONTRADICTIONS_NOTE`.

(h) `about` gains `DEPTH_OUT_OF_TEN` beside `DEPTH_OUT_OF_FOUR` and
`THE_DOCUMENT_AS_A_WHOLE`, chosen on `depthScaleOf(payload)`, and its
`list_model_specs` line says ", and each document's assessment as a whole" on
the scale of ten.

In `app/api/mcp/route.js`, the `list_model_specs` description says what the
assessment carries and that the total is out of 20; `list_behaviours` and
`retrieve_passages` say that a depth carries `depth.scale` at 10 on a
publication out of ten and no scale, meaning out of 4, on one before it.

- [ ] **Step 4: Run the tests**

Run: `node --test app/lib/__tests__/mcp-tools.test.mjs`
Expected: `# fail 0`, including every test that existed before this task.

Run: `node --test app/lib/__tests__/*.test.mjs`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add app/lib/mcp-tools.mjs app/api/mcp/route.js app/lib/__tests__/mcp-tools.test.mjs
git commit -m "feat: the MCP server says what a depth is out of, and carries the assessment" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 8: The copy, on the pages and in the repository's own descriptions

The rubrics are written and merged; what is left is everything that still
describes the index as a scale of four with no assessment, and the two records
the prototype overtook.

**Files:**
- Modify: `site/about.html` (438, 508-512, 570-571, 631, 740), `site/mcp.html` (about 379-382, 386-392, 407-410)
- Modify: `README.md` (45-46, 137, 227), `AGENTS.md` (35), `SYSTEM.md` (79), `CITATION.cff` (33)
- Modify: `methodology/OVERVIEW.md` (the As-is observation that says no publication carries a depth out of ten)
- Modify: `docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md` (the Display section)
- Modify: `docs/prototypes/2026-09-22-depth-out-of-ten/README.md` (the closing paragraph)

**Existing tests that must keep passing, untouched:** `python3 -m unittest discover -s tests`, `node engine/verify-reader-test.mjs`, `node engine/verify-reader-features.mjs`, `python3 engine/panel/test_site_rubrics.py`.

**Interfaces:** consumes nothing; produces nothing any test reads except the two
greps in step 4.

- [ ] **Step 1: The pages**

In `site/about.html`:

- line 438, `specification covers each behaviour, on a scale from 0 to 4. The second,` becomes `specification covers each behaviour, on a scale from 0 to 10 (from 0 to 4 on a publication made before that scale), and, on a publication out of ten, how each document holds together as a whole. The second,`
- the `<dt>Depth</dt>` entry says 0, absent, to 10, bounded, adds that publications made before the scale of ten gave it from 0 to 4 and still show it that way, and is followed by a new entry:

```html
      <dt>The document as a whole</dt>
      <dd>
        <p>How well a specification is built as a set of rules, on five criteria the same judges
        score. The overview shows it out of 10, beside the behaviours&rsquo; own mean out of 10,
        and adds the two into a final score out of 20. Only publications on the scale of ten
        carry it.</p>
      </dd>
```

- lines 570-571 become the paragraph describing the six levels of the scale of ten, what an odd number means, and that publications made before this scale still show their figures on it; then a second paragraph on the five criteria, the halving, the final score out of 20, and the contradictions as the judges' list that no person has reviewed, settled by the second method: each seat lists what it finds, then each of them reads every claim, its own included, and a claim is confirmed when two of the three say it holds.
- line 631 adds, after "A depth measures how much a document gives an evaluation to work with.": "The assessment of a document as a whole says how well its rules are built, not whether they are the right rules."
- line 740, `for the 0 to 4 depth or build a site.` becomes `for a depth, assess the document as a whole or build a site.`
- the change log entry about `07958c5e` is a dated record of a run that was on 0 to 4 and is left exactly as it is.

In `site/mcp.html`, the `depth` definition says out of 10 with `depth.scale` at
10 and out of 4 where a depth carries no scale; the `list_model_specs`
paragraph adds what a publication of ten carries per document, the total out of
20, and that the contradictions are the judges' list no person has reviewed; the
`retrieve_passages` bullet says the same two scales.

- [ ] **Step 2: The repository's own descriptions**

- `README.md` line 45: the judge "gives the document a depth on the depth rubric, and the publication carries the mean: from 0 to 10 on a publication on the scale of ten, and from 0 to 4 on one made before it. A payload says which it is on. A publication on the scale of ten also carries an assessment of each document as a whole, five criteria the same panel scores from 0 to 4 for a total out of 20, on the document assessment rubric; its contradictions are the judges' list, which no person has reviewed."
- `README.md` line 137: `does not ask for the 0 to 4 depth, and it does not give you the published index:` becomes `does not ask for a depth or assess the document as a whole, and it does not give you the published index:`
- `README.md`, after the "Judging" paragraph that ends `each judge gives the cell a 0 to 4 depth in a small call of its own.`, a paragraph on the two further passes, `engine/assess.py` and `engine/panel/depth_pass.py --runs=... --assessment-run=...`, and that `engine/publish.py` builds from them when `--depth-prompt` names the prompt of ten and `--assessment-run` names the assessment, while the portal names neither.
- `AGENTS.md` line 35: a depth per cell "from 0 to 10 on a publication on the scale of ten, which also carries each document's assessment as a whole, and from 0 to 4 on every one before it."
- `SYSTEM.md` line 79: the 0 to 4 depth in the judging job, then "A later pass (`engine/panel/depth_pass.py`) can give it a 0 to 10 depth against an assessment of the document as a whole (`engine/assess.py`), and a publication carries the mean on the scale it was built on."
- `CITATION.cff` line 33: `gives the document a depth, 0 to 10 or, on publications before that scale, 0 to 4,`.
- `methodology/OVERVIEW.md`, the As-is observation "No publication carries a depth out of ten or an assessment as of 22 September 2026" becomes: as of 23 September 2026 publication `de378ff3-008f-4977-92ce-d006e90699b9` is a draft on the scale of ten, carrying both, and the site shows a publication on the scale it was built on; the current public publication is still on the scale of four.

- [ ] **Step 3: The two records the prototype overtook**

In `docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md`,
replace the Display section's bullets about the legend and the row at the foot of
the grid with what was built: the board, the final score out of 20 at the top,
the document as a whole out of 10 over five criteria out of 2, the categories
over their behaviours, NA for a lab with no specification, the scale under the
table, the method folded under that, and the contradictions in the sheet. Keep
the bullets on the payload's scale, the ramp, the MCP server and the copy, which
held. Note that the design was overtaken by the prototype of 22 September 2026
and that the prototype is the design of record for the overview.

In `docs/prototypes/2026-09-22-depth-out-of-ten/README.md`, the closing paragraph
says the plan predates the prototype; it does not any more. Say instead that the
plan was rewritten to the prototype on 23 September 2026, and that the prototype
stands as the design of record.

- [ ] **Step 4: Run everything offline**

Run: `grep -rn "0 to 4 depth" README.md AGENTS.md SYSTEM.md CITATION.cff site/`
Expected: only `README.md`'s Judging sentence about what the judging job itself asks.

Run: `grep -rn "put to the others\|found it or hold it" site/ app/ README.md AGENTS.md SYSTEM.md methodology/ docs/superpowers/specs/`
Expected: nothing. The first method's rule is gone from everything that describes what the index holds.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `OK`.

Run: `python3 -m unittest discover -s tests`
Expected: `OK`.

Run: `node --test app/lib/__tests__/*.test.mjs`
Expected: `# fail 0`.

Run: `node engine/verify-reader-test.mjs` and `node engine/verify-reader-features.mjs`
Expected: `All views verified.` and `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 5: Commit**

```bash
git add site/about.html site/mcp.html README.md AGENTS.md SYSTEM.md CITATION.cff \
  methodology/OVERVIEW.md docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md \
  docs/prototypes/2026-09-22-depth-out-of-ten/README.md
git commit -m "docs: the scale of ten, the document as a whole and the board, on the pages" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

## The whole battery, once, before the branch is finished

```sh
python3 -m unittest discover -s engine -p "test_*.py"
python3 -m unittest discover -s engine/panel -p "test_*.py"
python3 -m unittest discover -s tests
node --test app/lib/__tests__/*.test.mjs
node engine/panel/test_appjs_depth.js | tail -1
node engine/verify-reader-test.mjs
node engine/verify-reader-features.mjs
```

Expected: `OK`, `OK`, `OK`, `# fail 0`, `55 checks, 0 failures`, `All views verified.`, `ALL FEATURE CHECKS PASSED.`

Then, and only then, put the two open decisions to the owner with the board in
front of them: the figure's ink, and the page's title.
