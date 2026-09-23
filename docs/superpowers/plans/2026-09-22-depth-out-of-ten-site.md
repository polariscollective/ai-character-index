# Depth out of ten on the site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The overview, the reader and the MCP server show every depth on the scale its publication was given on, 0 to 10 or 0 to 4, and a publication out of ten shows each document's assessment as a whole.

**Architecture:** One shared ES module, `site/depth-scale.js`, holds both scales' levels, the words said beside a figure and the colour ramp. The overview and the reader import it and read `payload.depthScale`, where absent means 4. A second module, `site/document-assessment.js`, turns a payload's `assessment` into the contents of the sheet the overview's new row opens. The MCP server reads the same two payload fields in `app/lib/mcp-tools.mjs`. Every visible change is conditional on `depthScale`, so a publication of four renders as it does today.

**Tech Stack:** Plain HTML and vanilla ES modules in `site/`, copied into `public/` and served by Next.js 15; Node 22 `node:test`; Python 3 stdlib `unittest`; the Playwright walkers (`playwright-core` driving Chrome).

**Sources:** the brief `.superpowers/sdd/site-plan-brief.md`; the design `docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md`, sections "The depth scale, 0 to 10", "The document as a whole, five criteria", "Publication" and "Display"; the payload's ground truth `engine/panel/build_site_data.py` (`document_assessment`, `main`) and `engine/index_store.py` (`cell_depths`).

## Global Constraints

- Work only in `/Users/sverbo/Desktop/Codes/Polaris/ai-character-index-depth-to-ten-site`, branch `feat/depth-to-ten-site`. Never touch `/Users/sverbo/Desktop/Codes/Polaris/ai-character-index`.
- The Polaris design framework binds every visible change: sentence case everywhere, British spelling, no long dashes in copy, no all caps, mono for figures and model ids only, no cards, shadows or gradients, one bordered callout at most per view, links with the chartreuse underline, focus 2px chartreuse, status colours always with a text label, `prefers-reduced-motion` respected.
- A pinned publication of four renders exactly as today: every change is conditional on `depthScale`, and today's tests keep passing unchanged except where a string they assert is the thing being made conditional.
- English, British spelling, no `—` or `–` and no `--` as a dash in prose, in code, comments and copy. Where the page needs the en dash glyph it already uses for "no figure", new code writes it as `"\u2013"`.
- Nothing on the overview is built with `innerHTML`: a judge's rationale, a quote and a situation are a model's words and land as text nodes.
- Commits end with exactly:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7`
- Nothing needs credentials: every test runs against fixtures.
- Node 22.13 or later (`package.json` engines). `engine/panel/test_appjs_depth.js` loads `site/depth-scale.js` with `require()`, which loads an ES module from Node 22.12. Node prints a `MODULE_TYPELESS_PACKAGE_JSON` warning when a test imports a `site/*.js` module, because the root `package.json` names no `"type"`; the warning is expected.
- The payload shape (from `build_site_data.py`): top level `generatedFrom`, `provenance`, then `depthScale: 10` and `assessment` only on a publication out of ten, then `behaviours`. A cell's depth is `{mean, judges: {seat: {depth, rationale, [model, substitution_reason]}}}`, plus `scale: 10` on the scale of ten. `assessment[documentId]` is `{criteria: {conflict_rules|rule_force|reasons|situations: {mean, judges: {seat: {score, rationale, [model]}}}}, contradictions: {claims: [{passages: [{locator, quote, exampleBlock}] x2, situation, why, readings: [{seat, found, holds, absolute, reason, [model]}], confirmed, absolute, reviewed}], score}, total}`. `total` is out of 20. A claim's `absolute` is `null` only where every seat found it.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `site/depth-scale.js` (new) | Both scales' levels and bars, the conditions for 10, the line on odd figures, the scale a payload is on, the words for a figure, the colour ramp and the ink over it. Pure; imported by the overview and the reader. | 1 |
| `app/lib/__tests__/depth-scale.test.mjs` (new) | Node tests of the module, and guards that neither page carries its own copy of the levels. | 1, 3 |
| `engine/panel/test_site_rubrics.py` (new) | Holds the site's and the methodology's copies of the rubrics to the prompts the judges read. | 1, 2, 5 |
| `site/overview.js`, `site/overview.html` | The grid on its publication's scale, its legend, and the row for the document as a whole. | 1, 2 |
| `site/governance.js` | Passes its own maximum of 4 to `paint`. | 1 |
| `site/document-assessment.js` (new) | What the overview says about a document's assessment, as data. Pure. | 2 |
| `app/lib/__tests__/document-assessment.test.mjs` (new) | Node tests of that module. | 2 |
| `site/spec-reader/app.js`, `site/spec-reader/styles.css` | The reader's scale from the payload, its heading, notes and spoken figures. | 3 |
| `engine/panel/test_appjs_depth.js`, `engine/panel/test_panel.py` | The reader's depth harness, reading the shared module. | 3 |
| `app/lib/__tests__/slice.test.mjs` | Pins that a sliced payload keeps its scale and assessment. | 3 |
| `app/lib/mcp-tools.mjs`, `app/api/mcp/route.js`, `app/lib/__tests__/mcp-tools.test.mjs` | The MCP answers and descriptions. | 4 |
| `methodology/spec-coverage-depth-rubric.md`, `methodology/document-assessment-rubric.md` (new), `site/about.html`, `site/mcp.html`, `README.md`, `AGENTS.md`, `SYSTEM.md`, `CITATION.cff`, `methodology/OVERVIEW.md` | Copy. | 5 |
| `tests/fixtures/reader/ten/behaviours.json` (new), `engine/reader-routes.mjs`, `engine/verify-reader-features.mjs`, `engine/panel/test_build_site_data.py`, `tests/README.md` | The fixture of ten, its route, the walker checks and the shape test. | 6 |

---

### Task 1: The depth scale in one shared module, and the overview grid out of ten

**Files:**
- Create: `site/depth-scale.js`
- Create: `app/lib/__tests__/depth-scale.test.mjs`
- Create: `engine/panel/test_site_rubrics.py`
- Modify: `site/overview.js` (imports, lines 18-58 and 77-97 removed, `elements`, `state`, `paint`, `openCell`, `render`, `initialize`)
- Modify: `site/overview.html` (legend markup at about 922-925, styles after `.scale-rail .level`)
- Modify: `site/governance.js` (`paintShare` at about 56-64, `renderLegend`, the comment over `initializeGovernance`)
- Modify: `README.md` ("Checks"), `site/OVERVIEW.md` (Contents table)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (from `site/depth-scale.js`, used by Tasks 2, 3 and 6):
  - `DEPTH_LEVELS: { 4: Level[], 10: Level[] }`, with `Level = { level: number, anchor: string, bar: string }`
  - `CONDITIONS_FOR_TEN: string[]` (three)
  - `ODD_VALUES: string`
  - `depthScaleOf(payload) -> 4 | 10`
  - `levelsOf(scale) -> Level[]`
  - `depthWords(mean: number, scale: 4 | 10) -> string`, e.g. `"prescribed and partly demonstrated"`
  - `depthPhrase(mean: number, scale: 4 | 10) -> string`, e.g. `"7.3 out of 10, prescribed and partly demonstrated"`
  - `rampAt(value: number, max: number) -> [r, g, b]`
  - `inkOver([r, g, b]) -> "#23281B" | "#F1EFE3"`
- Produces in `site/overview.js`: `paint(node, value, max)`, `state.scale` (4 or 10), `elements.legendOdd`.
- Produces in `engine/panel/test_site_rubrics.py`: `sentence_case(text)`, `first_sentence(text)`, `prompt_scale() -> {levels, conditions, odd}`, `site_module(path, expression) -> object`.

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
import { DEPTH_LEVELS, CONDITIONS_FOR_TEN, ODD_VALUES, depthScaleOf, levelsOf,
         depthWords, depthPhrase, rampAt, inkOver } from "../../../site/depth-scale.js";

const site = name => readFile(new URL(`../../../site/${name}`, import.meta.url), "utf8");

test("a payload is out of 10 only where it says so, and out of 4 otherwise", () => {
  assert.equal(depthScaleOf({ depthScale: 10, behaviours: [] }), 10);
  assert.equal(depthScaleOf({ behaviours: [] }), 4, "every publication before the scale of ten");
  assert.equal(depthScaleOf({ depthScale: 7 }), 4, "a scale this site does not know is not guessed at");
  assert.equal(depthScaleOf(null), 4);
});

test("the scale of four is the five levels the site has always shown", () => {
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

test("a total out of 20 runs over the same ramp", () => {
  assert.deepEqual(rampAt(12, 20), [189, 158, 44]);
  assert.deepEqual(rampAt(17.3, 20), [114, 146, 57]);
  assert.deepEqual(rampAt(20, 20), [76, 140, 63]);
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
the three conditions for 10 that the overview's legend and the reader's scale
note show on a publication out of ten. The judges scored against
engine/panel/prompts/depth-v2.txt, so a copy that drifted from it would explain
a figure by a rubric nobody was given. This reads the prompt and the site's
module and compares them, the way test_bands.py holds the Python to the
reader's DEFAULT_BANDS.

The site's copy is the prompt's own words with two changes a page needs: the
anchor in lower case, as the page writes every anchor, and the first letter of
the bar a capital.

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
        self.site = site_module(DEPTH_SCALE_JS, "{levels: m.DEPTH_LEVELS[10], "
                                "conditions: m.CONDITIONS_FOR_TEN, odd: m.ODD_VALUES}")
        self.prompt = prompt_scale()

    def test_each_level_is_the_prompt_s_anchor_and_bar(self):
        self.assertEqual(self.site["levels"], self.prompt["levels"])

    def test_the_conditions_for_ten_are_the_prompt_s(self):
        self.assertEqual(self.site["conditions"], self.prompt["conditions"])

    def test_the_line_on_odd_figures_is_the_prompt_s(self):
        self.assertEqual(self.site["odd"], self.prompt["odd"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run both to verify they fail**

Run: `node --test app/lib/__tests__/depth-scale.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` naming `site/depth-scale.js`, and `# fail 1`.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `PromptScaleTest` passes; the three `DepthScaleOfTenTest` cases error with `subprocess.CalledProcessError`; last line `FAILED (errors=3)`.

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
 * The scale of four is the rubric of methodology/spec-coverage-depth-rubric.md
 * as this site has always shown it. The scale of ten is the prompt the judges
 * read, engine/panel/prompts/depth-v2.txt, in its own words: the anchor in
 * lower case, the bar with a capital, and nothing else changed.
 * engine/panel/test_site_rubrics.py holds it to that file.
 *
 * Nothing here touches the page, so node imports it for its tests.
 */

export const DEPTH_LEVELS = {
  4: [
    { level: 0, anchor: "absent",
      bar: "No passage bears on the behaviour." },
    { level: 1, anchor: "named",
      bar: "The behaviour appears, a word or clause, typically inside a list or a "
        + "passage about something else, but the spec says nothing further about it." },
    { level: 2, anchor: "discussed",
      bar: "The spec addresses the behaviour in its own right, what the norm is and "
        + "why it matters, but only in terms too general to grade a response against." },
    { level: 3, anchor: "prescribed",
      bar: "The spec states concrete do/don't rules or procedures for the behaviour, "
        + "specific enough that a grader can quote the spec's own sentences as pass criteria." },
    { level: 4, anchor: "demonstrated",
      bar: "Prescribed, plus worked examples: concrete scenarios where the spec shows the "
        + "sanctioned response, usable as an answer key for borderline cases." },
  ],
  10: [
    { level: 0, anchor: "absent",
      bar: "No passage bears on the behaviour." },
    { level: 2, anchor: "named",
      bar: "The behaviour appears, a word or clause, typically inside a list or a passage "
        + "about something else, but the document says nothing further about it." },
    { level: 4, anchor: "discussed",
      bar: "The document addresses the behaviour in its own right, what the norm is and why "
        + "it matters, but only in terms too general to grade a response against." },
    { level: 6, anchor: "prescribed",
      bar: "The document states concrete do and don't rules or procedures for the behaviour, "
        + "specific enough that a grader could quote the document's own sentences as pass "
        + "criteria." },
    { level: 8, anchor: "demonstrated",
      bar: "Prescribed, plus worked examples: concrete scenarios where the document shows the "
        + "sanctioned response, usable as an answer key for borderline cases." },
    { level: 10, anchor: "bounded",
      bar: "Demonstrated, and for this behaviour the document meets all three conditions "
        + "below, for every facet of the behaviour that the Definition and Clarifications "
        + "name." },
  ],
};

/* What 10 asks for beyond 8. Its bar names them "below", so the pages list them
 * under it. */
export const CONDITIONS_FOR_TEN = [
  "The edge is shown.",
  "A conflict is settled.",
  "A default for the undecidable case.",
];

/* The one line on odd figures, under the levels of the scale of ten. The scale
 * of four has a level at every whole number and needs none. */
export const ODD_VALUES =
  "An odd number means the level below is fully met and the level above is met only in part.";

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
  const rounded = Math.round(mean);
  const anchor = level => levelsOf(scale).find(each => each.level === level)?.anchor ?? "";
  if (scale !== 10 || rounded % 2 === 0) return anchor(rounded);
  return `${anchor(rounded - 1)} and partly ${anchor(rounded + 1)}`;
}

/** "2.7 out of 4, prescribed"; "7.3 out of 10, prescribed and partly demonstrated". */
export function depthPhrase(mean, scale) {
  return `${mean.toFixed(1)} out of ${scale}, ${depthWords(mean, scale)}`;
}

/* Red to green, against the framework's own palette, because the grid is read
 * as a comparison and a single hue at varying strength does not say which end
 * is which. Three stops, at nought, half the scale and its top, interpolated in
 * between, so the deepest green is the top alone. On the scale of four the
 * stops sit at 0, 2 and 4, as they always did, so no colour there moved. */
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
 * the amber middle needs dark text where both ends need light. */
export function inkOver([r, g, b]) {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#23281B" : "#F1EFE3";
}
```

- [ ] **Step 5: Run the tests; only the overview guard should still fail**

Run: `node --test app/lib/__tests__/depth-scale.test.mjs`
Expected: every test passes except "the overview carries no copy of the levels, the ramp or the scale of four", which fails with "a bar was copied back in"; `# fail 1`.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `OK` (4 tests).

- [ ] **Step 6: Read the scale in the overview**

In `site/overview.js`, make these edits.

(a) Replace

```js
import { initializeGovernance } from "./governance.js";

const DEPTH_WORDS = ["absent", "named", "discussed", "prescribed", "demonstrated"];
```

with

```js
import { initializeGovernance } from "./governance.js";
/* The depth scales, their words and the colour a figure wears: one module for
 * this page and the reader, which used to carry a copy each. */
import { depthScaleOf, levelsOf, depthWords, depthPhrase, rampAt, inkOver, ODD_VALUES,
         CONDITIONS_FOR_TEN } from "./depth-scale.js";
```

(b) Delete the whole block from `/* Red to green, against the framework's own palette, because the grid is read` down to the closing brace of `function inkOver([r, g, b]) { ... }`. The `RAMP` constant, `rampAt` and `inkOver` all live in `depth-scale.js` now.

(c) In `const elements = { ... }`, after `legendList: document.querySelector("#legend-list"),` add:

```js
  legendOdd: document.querySelector("#legend-odd"),
```

(d) Replace

```js
const state = { behaviours: [], columns: [], passages: {}, depths: {}, registry: {} };
```

with

```js
/* `scale` is the publication's, read from its payload: 10 on a publication out
 * of ten and 4 on every one before it, so a pinned earlier publication says
 * "out of 4" as it did. */
const state = { behaviours: [], columns: [], passages: {}, depths: {}, registry: {}, scale: 4 };
```

(e) Delete the whole `/* The rubric each judge scored against, copied from the reader's own DEPTH_LEVELS. ...` comment and the `const DEPTH_LEVELS = [ ... ];` block under it.

(f) Replace

```js
function paint(button, value) {
  const rgb = rampAt(value);
```

with

```js
/* A figure on the ramp over its own maximum: a depth over its publication's
 * scale, a total over 20, a governance score over the 4 that view passes. */
function paint(button, value, max) {
  const rgb = rampAt(value, max);
```

(g) In `openCell`, replace

```js
    figure.append(number,
      document.createTextNode(` out of 4, ${DEPTH_WORDS[Math.round(depth.mean)]}.`));
```

with

```js
    figure.append(number, document.createTextNode(
      ` out of ${state.scale}, ${depthWords(depth.mean, state.scale)}.`));
```

(h) In `render`, replace

```js
          paint(button, mean);
          // The accessible name says what the cell shows. A screen reader that
          // heard something the sighted reader cannot see would be reading a
          // different grid.
          button.setAttribute("aria-label",
            `${behaviour.name} in ${column.lab}: ${mean.toFixed(1)} out of 4, `
            + DEPTH_WORDS[Math.round(mean)]);
          // The figure alone. The rubric's word under it ("prescribed") no longer
          // fits once nine specifications share the width, and the scale beside
          // the grid gives every level its word and its sentence; the accessible
          // name above still says the word. Not "out of 4" either: every figure
          // on this grid is out of 4, and the scale says so once.
```

with

```js
          paint(button, mean, state.scale);
          // The accessible name says what the cell shows. A screen reader that
          // heard something the sighted reader cannot see would be reading a
          // different grid.
          button.setAttribute("aria-label",
            `${behaviour.name} in ${column.lab}: ${depthPhrase(mean, state.scale)}`);
          // The figure alone. The rubric's word under it ("prescribed") no longer
          // fits once nine specifications share the width, and the scale beside
          // the grid gives every level its word and its sentence; the accessible
          // name above still says the word. Not what it is out of either: every
          // figure on this grid is on its publication's scale, and the scale
          // beside the grid says so once.
```

(i) In `render`, replace everything from `const scale = document.createDocumentFragment();` through `elements.legend.hidden = false;` with:

```js
  const scale = document.createDocumentFragment();
  levelsOf(state.scale).forEach(({ level, anchor, bar }) => {
    const item = document.createElement("li");
    const head = document.createElement("span");
    head.className = "scale-head";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = `rgb(${rampAt(level, state.scale).join(" ")})`;
    const number = document.createElement("span");
    number.className = "level";
    number.textContent = String(level);
    head.append(swatch, number, document.createTextNode(anchor));
    const sentence = document.createElement("span");
    sentence.className = "scale-bar";
    sentence.textContent = bar;
    item.append(head, sentence);
    // The bar of 10 names three conditions "below", so they are listed under it.
    if (state.scale === 10 && level === 10) {
      const conditions = document.createElement("ul");
      conditions.className = "scale-conditions";
      CONDITIONS_FOR_TEN.forEach(condition => {
        const line = document.createElement("li");
        line.textContent = condition;
        conditions.append(line);
      });
      item.append(conditions);
    }
    scale.append(item);
  });
  elements.legendList.replaceChildren(scale);
  elements.legendOdd.textContent = state.scale === 10 ? ODD_VALUES : "";
  elements.legendOdd.hidden = state.scale !== 10;
  elements.legend.hidden = false;
```

(j) In `initialize`, after `state.behaviours = payload.behaviours;` add:

```js
  state.scale = depthScaleOf(payload);
```

In `site/overview.html`, replace

```html
    <aside class="scale-rail" id="legend" hidden aria-label="The scale">
      <h2>The scale</h2>
      <ol id="legend-list"></ol>
    </aside>
```

with

```html
    <aside class="scale-rail" id="legend" hidden aria-label="The scale">
      <h2>The scale</h2>
      <ol id="legend-list"></ol>
      <!-- What an odd figure means, on the scale of ten only: overview.js fills
           and shows it. The scale of four has a level at every whole number. -->
      <p class="scale-odd" id="legend-odd" hidden></p>
    </aside>
```

In the same file's `<style>`, after the rule `.scale-rail .level { ... }`, add:

```css
/* The scale of ten's two additions, in the bars' own size and tone: the three
   conditions 10 asks for, under its bar, and one line on odd figures under the
   levels. Neither is drawn on the scale of four. */
.scale-conditions { margin: 3px 0 0; padding: 0; list-style: none; }
.scale-rail .scale-conditions li { font-size: 11px; line-height: 1.45; color: var(--faint); }
.scale-odd { margin: 14px 0 0; font-size: 11px; line-height: 1.45; color: var(--faint); }
```

In `site/governance.js`, replace

```js
/* A score painted the way the grid paints a depth, as a share of its maximum,
 * so 8 of 12 wears the colour 2.7 of 4 would. The figure is always light, where
 * the grid picks dark or light by the colour underneath: across one table of
 * scores, figures that change colour from cell to cell read as a second code. */
const FIGURE = "#F1EFE3";
function paintShare(node, value, max) {
  board.paint(node, (value / max) * 4);
  node.style.color = FIGURE;
}
```

with

```js
/* A score painted the way the grid paints a depth, as a share of its maximum,
 * so 8 of 12 wears the colour 2.7 of 4 would. The grid paints over whatever
 * maximum it is given, and this view gives it 4, its own, so no colour here
 * moved when the grid's depths went to ten. The figure is always light, where
 * the grid picks dark or light by the colour underneath: across one table of
 * scores, figures that change colour from cell to cell read as a second code. */
const FIGURE = "#F1EFE3";
const PAINTED_OVER = 4;
function paintShare(node, value, max) {
  board.paint(node, (value / max) * PAINTED_OVER, PAINTED_OVER);
  node.style.color = FIGURE;
}
```

In `renderLegend`, replace `board.paint(swatch, level);` with `board.paint(swatch, level, PAINTED_OVER);`.

Replace the comment over `initializeGovernance`:

```js
/* `paint` is the grid's own, so a score of 3 out of 4 here wears the colour a
 * depth of 3 wears in the other view. */
```

with

```js
/* `paint` is the grid's own, given this view's maximum of 4, so a score of 3 out
 * of 4 here wears the colour a depth of 3 out of 4 wears in the other view. */
```

- [ ] **Step 7: Run the tests and the existing suites**

Run: `node --test app/lib/__tests__/depth-scale.test.mjs`
Expected: `# fail 0`.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `OK`.

Run: `node --test app/lib/__tests__/*.test.mjs`
Expected: `# fail 0`.

Run: `node engine/verify-reader-features.mjs`
Expected: last line `ALL FEATURE CHECKS PASSED.` The governance section proves the view still renders with `paint(node, value, 4)`; its colours are pinned in Task 6.

- [ ] **Step 8: Document the file**

In `README.md`, under "Checks", after the line `python3 engine/panel/test_bands.py`, add:

```sh
python3 engine/panel/test_site_rubrics.py          # the site's rubric, held to the judges' prompts
```

In `site/OVERVIEW.md`, in the Contents table, after the `overview.html, overview.js, governance.js, governance.json` row, add:

```markdown
| `depth-scale.js` | The depth scales a publication can carry, 0 to 4 and 0 to 10: their levels and bars, the words said beside a figure, and the colour ramp. One module, imported by `overview.js` and `spec-reader/app.js`; a payload's `depthScale` says which scale it is on, and none means 4. `engine/panel/test_site_rubrics.py` holds the scale of ten to the prompt the judges read. |
```

- [ ] **Step 9: Commit**

```bash
git add site/depth-scale.js site/overview.js site/overview.html site/governance.js \
  app/lib/__tests__/depth-scale.test.mjs engine/panel/test_site_rubrics.py README.md site/OVERVIEW.md
git commit -m "feat: the grid reads its depth scale from the publication, and shows the scale of ten" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 2: The document as a whole: a row at the foot of the grid, and its sheet

**Files:**
- Create: `site/document-assessment.js`
- Create: `app/lib/__tests__/document-assessment.test.mjs`
- Modify: `engine/panel/test_site_rubrics.py` (append)
- Modify: `site/overview.js` (imports, `state`, `updateRemaining`, new helpers, `render`, `initialize`)
- Modify: `site/overview.html` (styles)
- Modify: `site/OVERVIEW.md` (Contents table)

**Interfaces:**
- Consumes: `paint(node, value, max)` and `state` from Task 1.
- Produces (from `site/document-assessment.js`):
  - `WHOLE_MAX = 20`, `CRITERION_MAX = 4`
  - `CRITERIA: {key, name, asks}[]`, in the order `conflict_rules`, `rule_force`, `reasons`, `situations`
  - `CONTRADICTIONS: {name, asks}`
  - `SCORE_RULE: string`, `NOT_REVIEWED: string`, `HOW_CONFIRMED: string`
  - `assessmentOf(assessments, documentId) -> object | null`
  - `whoSat(seat, model?) -> string`
  - `readingWords(reading) -> string`
  - `claimStatus(claim) -> string`
  - `readerLink(locator, pin?) -> string`
  - `wholeSheet(assessment, { pin }) -> { total, criteria: [{name, asks, mean, judges: [{who, score, rationale}]}], contradictions: {name, asks, score, claims: [{confirmed, status, situation, why, passages: [{quote, href}], readings: [{who, words, reason}]}]} }`
- Produces in `site/overview.js`: `state.assessments`; the row `tr.whole-row`, whose `th` holds a `.subject-button` and whose cells are `.cell-button`s with `.cell-figure` and `.cell-max`; the sheet classes `.claim-status`, `.claim-passage`, `.claims .judges`, `.notice`, `.criterion-figure`. Task 6 walks these.
- Produces in `engine/panel/test_site_rubrics.py`: `prompt_criteria() -> (asks_by_key, situations)`, `prompt_contradiction() -> str`.

- [ ] **Step 1: Write the failing node test**

Create `app/lib/__tests__/document-assessment.test.mjs`:

```js
/**
 * What the overview says about a document's assessment as a whole. The module
 * is pure, so its sheet is tested as data; the grid that draws it is walked in
 * a browser by engine/verify-reader-features.mjs.
 *
 * Run: node --test app/lib/__tests__/document-assessment.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { CRITERIA, CONTRADICTIONS, NOT_REVIEWED, WHOLE_MAX, CRITERION_MAX, assessmentOf,
         whoSat, readingWords, claimStatus, readerLink, wholeSheet }
  from "../../../site/document-assessment.js";

const S1 = "acme--corpus@2026-01-01 > #sentences > ¶1";
const S2 = "acme--corpus@2026-01-01 > #sentences > ¶2";
const B2 = "acme--corpus@2026-01-01 > #blocks > ¶2";
const PIN = "c3a5e0d2-9f47-4b8e-a1d6-5e2f7b9c0a14";

/* One document's assessment in the shape build_site_data.py's
 * document_assessment writes: claims in document order, the unconfirmed one
 * first, so the sheet's own order shows. */
const ASSESSED = {
  criteria: {
    conflict_rules: { mean: 3.0, judges: {
      a: { score: 4, rationale: "A strict order." },
      b: { score: 3, rationale: "An order, and examples.", model: "d" },
      c: { score: 2, rationale: "Weighed as a whole." } } },
    rule_force: { mean: 3.3, judges: {
      a: { score: 3, rationale: "Labels." }, b: { score: 3, rationale: "Labels.", model: "d" },
      c: { score: 4, rationale: "Every rule." } } },
    reasons: { mean: 2.0, judges: {
      a: { score: 2, rationale: null }, b: { score: 2, rationale: "Some.", model: "d" },
      c: { score: 2, rationale: "Some." } } },
    situations: { mean: 1.7, judges: {
      a: { score: 1, rationale: "Two." }, b: { score: 2, rationale: "Three.", model: "d" },
      c: { score: 2, rationale: "Three." } } },
  },
  contradictions: {
    claims: [
      { passages: [{ locator: S1, quote: "A locator may name a span.", exampleBlock: false },
                   { locator: S2, quote: "Dr. Smith walks in.", exampleBlock: false }],
        situation: "When a paragraph is counted.", why: "The counts differ.",
        readings: [
          { seat: "a", found: true, holds: true, absolute: null, reason: "found it" },
          { seat: "b", found: false, holds: false, absolute: false,
            reason: "Different paragraphs.", model: "d" },
          { seat: "c", found: false, holds: false, absolute: false, reason: "Each is its own." }],
        confirmed: false, absolute: false, reviewed: null },
      { passages: [{ locator: S2, quote: "Dr. Smith walks in.", exampleBlock: false },
                   { locator: B2, quote: "This is a second block.", exampleBlock: false }],
        situation: "When a paragraph runs across two lines.", why: "One counts across the break.",
        readings: [
          { seat: "a", found: false, holds: true, absolute: false,
            reason: "Nothing says which prevails." },
          { seat: "b", found: false, holds: false, absolute: false,
            reason: "The next section settles it.", model: "d" },
          { seat: "c", found: true, holds: true, absolute: null, reason: "found it" }],
        confirmed: true, absolute: false, reviewed: null },
    ],
    score: 2,
  },
  total: 12.0,
};

test("the criteria are the builder's four in its order, and the contradictions come last", () => {
  assert.deepEqual(CRITERIA.map(criterion => criterion.key),
                   ["conflict_rules", "rule_force", "reasons", "situations"]);
  assert.deepEqual([...CRITERIA, CONTRADICTIONS].map(criterion => criterion.name),
    ["Conflict rules", "Force of each rule", "Reasons given", "Situations covered",
     "Unresolved contradictions"]);
  assert.equal(WHOLE_MAX, 20);
  assert.equal(CRITERION_MAX, 4);
});

test("a document's assessment is read out of the payload's, or is null", () => {
  assert.equal(assessmentOf({ x: ASSESSED }, "x"), ASSESSED);
  assert.equal(assessmentOf({ x: ASSESSED }, "y"), null);
  assert.equal(assessmentOf(undefined, "x"), null);
  assert.equal(assessmentOf({ x: { total: "12" } }, "x"), null, "a total that is not a number");
});

test("a seat is named by the model that sat in it when a substitute answered", () => {
  assert.equal(whoSat("sol"), "sol");
  assert.equal(whoSat("sol", "sol"), "sol");
  assert.equal(whoSat("fable", "opus"), "opus in fable's seat");
});

test("a judge's reading says whether it found the claim, holds it, and whether it is absolute", () => {
  assert.equal(readingWords({ found: true, holds: true, absolute: null }), "found it.");
  assert.equal(readingWords({ found: false, holds: true, absolute: true }),
               "holds; involves a rule the document calls absolute.");
  assert.equal(readingWords({ found: false, holds: false, absolute: false }),
               "does not hold; involves no rule the document calls absolute.");
  assert.equal(readingWords({ found: false, holds: true, absolute: null }), "holds.");
});

test("a claim's status says confirmed or not, and what it said of absolute rules", () => {
  assert.equal(claimStatus({ confirmed: true, absolute: false }),
               "Confirmed. It involves no rule the document calls absolute.");
  assert.equal(claimStatus({ confirmed: false, absolute: true }),
               "Not confirmed. It involves a rule the document calls absolute.");
  assert.equal(claimStatus({ confirmed: true, absolute: null }),
    "Confirmed. Every judge found it, so none was asked whether it involves an absolute rule.");
});

test("a passage opens the reader on itself, in the publication on screen", () => {
  const pinned = new URL(readerLink(S1, PIN), "http://x");
  assert.equal(pinned.pathname, "/spec-reader/");
  assert.equal(pinned.searchParams.get("publication"), PIN);
  assert.equal(pinned.searchParams.get("passage"), S1);
  assert.equal(new URL(readerLink(S1), "http://x").searchParams.has("publication"), false);
});

test("the sheet gives each criterion its mean and every judge, by seat", () => {
  const { total, criteria } = wholeSheet(ASSESSED);
  assert.equal(total, 12);
  assert.deepEqual(criteria.map(criterion => [criterion.name, criterion.mean]),
    [["Conflict rules", 3], ["Force of each rule", 3.3], ["Reasons given", 2],
     ["Situations covered", 1.7]]);
  assert.deepEqual(criteria[0].judges, [
    { who: "a", score: 4, rationale: "A strict order." },
    { who: "d in b's seat", score: 3, rationale: "An order, and examples." },
    { who: "c", score: 2, rationale: "Weighed as a whole." }]);
  assert.equal(criteria[2].judges[0].rationale, "", "a rationale that never arrived is blank");
});

test("the sheet lists confirmed contradictions first and the unconfirmed after them", () => {
  const { contradictions } = wholeSheet(ASSESSED, { pin: PIN });
  assert.equal(contradictions.score, 2);
  assert.deepEqual(contradictions.claims.map(claim => claim.status), [
    "Confirmed. It involves no rule the document calls absolute.",
    "Not confirmed. It involves no rule the document calls absolute."]);
  const [first] = contradictions.claims;
  assert.deepEqual(first.passages.map(passage => [passage.quote,
    new URL(passage.href, "http://x").searchParams.get("passage")]),
    [["Dr. Smith walks in.", S2], ["This is a second block.", B2]]);
  assert.deepEqual(first.readings, [
    { who: "a", words: "holds; involves no rule the document calls absolute.",
      reason: "Nothing says which prevails." },
    { who: "d in b's seat", words: "does not hold; involves no rule the document calls absolute.",
      reason: "The next section settles it." },
    { who: "c", words: "found it.", reason: "" }]);
});

test("a document with no contradictions still has its score and an empty list", () => {
  const none = { ...ASSESSED, contradictions: { claims: [], score: 4 } };
  assert.deepEqual(wholeSheet(none).contradictions.claims, []);
  assert.equal(wholeSheet(none).contradictions.score, 4);
});

test("the list says in these words that nobody but the judges has read it", () => {
  assert.equal(NOT_REVIEWED, "This is the judges' list, not reviewed by a person.");
});

test("the overview draws the row from this module", async () => {
  const overview = await readFile(new URL("../../../site/overview.js", import.meta.url), "utf8");
  assert.match(overview, /from "\.\/document-assessment\.js"/);
});
```

- [ ] **Step 2: Append the failing Python checks**

In `engine/panel/test_site_rubrics.py`, add `import sys` to the imports. Then, after the line `CONDITION = re.compile(...)`, add:

```python
sys.path.insert(0, str(HERE))
import assessment_call            # noqa: E402

DOCUMENT_ASSESSMENT_JS = ROOT / "site" / "document-assessment.js"
# "CONFLICT_RULES: what the document says, ...", and not "CONFLICT_RULES: <0 to 4>"
QUESTION = re.compile(r"^([A-Z_]+): ([a-z].*)$")
# "2. actions the model takes on its own with tools, such as sending, buying or deleting;"
SITUATION = re.compile(r"^\d\. (.+?)[;.]$")
```

After the function `site_module`, add:

```python
def prompt_criteria():
    lines = assessment_call.PROMPTS["criteria"].read_text(encoding="utf-8").splitlines()
    asks = {m.group(1).lower(): sentence_case(first_sentence(m.group(2)))
            for m in map(QUESTION.match, lines) if m}
    situations = [m.group(1) for m in map(SITUATION.match, lines) if m]
    return asks, situations


def prompt_contradiction():
    lines = assessment_call.PROMPTS["contradictions"].read_text(encoding="utf-8").splitlines()
    return first_sentence(next(line for line in lines
                               if line.startswith("A contradiction here is")))
```

Before `if __name__ == "__main__":`, add:

```python
class PromptCriteriaTest(unittest.TestCase):
    def test_the_criteria_prompt_is_read_as_four_questions_and_six_situations(self):
        asks, situations = prompt_criteria()
        self.assertEqual(sorted(asks), sorted(assessment_call.CRITERIA))
        self.assertEqual(len(situations), 6)


@unittest.skipUnless(shutil.which("node"), "node reads the site's module")
class AssessmentCriteriaTest(unittest.TestCase):
    """site/document-assessment.js says what each criterion asks. The judges
    were asked in assessment-criteria-v1.txt and assessment-contradictions-v1.txt,
    so the page asks it in their words."""

    def setUp(self):
        self.site = site_module(DOCUMENT_ASSESSMENT_JS,
                                "{criteria: m.CRITERIA, contradictions: m.CONTRADICTIONS}")

    def test_the_criteria_are_the_builder_s_four_in_its_order(self):
        self.assertEqual([criterion["key"] for criterion in self.site["criteria"]],
                         list(assessment_call.CRITERIA))

    def test_each_criterion_asks_the_prompt_s_question(self):
        asks, _ = prompt_criteria()
        for criterion in self.site["criteria"]:
            self.assertTrue(criterion["asks"].startswith(asks[criterion["key"]]),
                            criterion["key"])

    def test_situations_names_the_prompt_s_six(self):
        _, situations = prompt_criteria()
        asks = next(c["asks"] for c in self.site["criteria"] if c["key"] == "situations")
        for situation in situations:
            self.assertIn(situation, asks)

    def test_a_contradiction_is_what_the_prompt_calls_one(self):
        self.assertIn(prompt_contradiction(), self.site["contradictions"]["asks"])
```

- [ ] **Step 3: Run both to verify they fail**

Run: `node --test app/lib/__tests__/document-assessment.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` naming `site/document-assessment.js`.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `PromptCriteriaTest` passes; the four `AssessmentCriteriaTest` cases error with `CalledProcessError`; `FAILED (errors=4)`.

- [ ] **Step 4: Create the module**

Create `site/document-assessment.js`:

```js
/* The document as a whole: what the overview says about a document's
 * assessment, as data.
 *
 * A publication out of ten carries, beside its depths, an assessment of each
 * document as a whole (engine/panel/build_site_data.py, document_assessment):
 * four criteria each judge scored from 0 to 4, the contradictions the judges
 * claimed with every judge's reading of each, and a total out of 20. The grid
 * shows the total in a row under the behaviours, and pressing it opens what is
 * built here.
 *
 * The questions are the prompts' own (engine/panel/prompts/assessment-*-v1.txt),
 * held to them by engine/panel/test_site_rubrics.py. Nothing here touches the
 * page, so node imports it for its tests, and nothing here becomes markup:
 * overview.js lands every string as text.
 */

export const WHOLE_MAX = 20;
export const CRITERION_MAX = 4;

/* In the order the sheet gives them, which is the builder's, with the
 * contradictions last because they come with a list. */
export const CRITERIA = [
  { key: "conflict_rules", name: "Conflict rules",
    asks: "What the document says, in general, when two of its own rules conflict." },
  { key: "rule_force", name: "Force of each rule",
    asks: "Whether a reader can tell, for each rule, if it is absolute or a default that can "
      + "be changed, and by whom." },
  { key: "reasons", name: "Reasons given",
    asks: "Whether the rules say why they exist." },
  { key: "situations", name: "Situations covered",
    asks: "Whether the document has rules for the situations in which the model is used. Six "
      + "are checked: ordinary conversation; actions the model takes on its own with tools, "
      + "such as sending, buying or deleting; images, audio and video; users who may be "
      + "minors; other AI agents, as the model's principals or as the party it deals with; "
      + "and deployments a business has customised." },
];

export const CONTRADICTIONS = {
  name: "Unresolved contradictions",
  asks: "Whether the document contradicts itself without settling it. A contradiction here is "
    + "two passages of the same document that, applied to one concrete situation, require "
    + "responses that cannot both be given, with nothing in the document saying which prevails.",
};

/* How the contradictions' score is reached: the run computes it from the
 * confirmed claims alone (engine/panel/assessment_run.py, confirm_score). */
export const SCORE_RULE = "4 when no contradiction is confirmed, 2 when one or two are and "
  + "none involves a rule the document calls absolute, and 0 when three or more are or any "
  + "one does.";

/* Said beside the list, in these words: nobody but the judges has read it. */
export const NOT_REVIEWED = "This is the judges' list, not reviewed by a person.";
export const HOW_CONFIRMED = "Each contradiction was found by one judge and put to the "
  + "others, and it is confirmed when two or more of them found it or hold it.";

/** A document's assessment out of a payload's `assessment`, or null. */
export function assessmentOf(assessments, documentId) {
  const assessed = assessments?.[documentId];
  return assessed && typeof assessed === "object" && Number.isFinite(assessed.total)
    ? assessed : null;
}

/** Who answered in a seat: the seat, or the substitute that sat in it. */
export function whoSat(seat, model) {
  return model && model !== seat ? `${model} in ${seat}'s seat` : seat;
}

/* One judge's reading of one claim, after its name. A finder is written as
 * holding the claim it found, with the reason "found it", so it is said once. */
export function readingWords(reading) {
  if (reading.found) return "found it.";
  const holds = reading.holds ? "holds" : "does not hold";
  if (reading.absolute === true) return `${holds}; involves a rule the document calls absolute.`;
  if (reading.absolute === false) {
    return `${holds}; involves no rule the document calls absolute.`;
  }
  return `${holds}.`;
}

/* What a claim came to. Its absoluteness is null only where every judge found
 * it, since then nobody was asked. */
export function claimStatus(claim) {
  const confirmed = claim.confirmed ? "Confirmed." : "Not confirmed.";
  if (claim.absolute === true) {
    return `${confirmed} It involves a rule the document calls absolute.`;
  }
  if (claim.absolute === false) {
    return `${confirmed} It involves no rule the document calls absolute.`;
  }
  return `${confirmed} Every judge found it, so none was asked whether it involves an `
    + "absolute rule.";
}

/** The reader, opened on one passage of the publication on screen. */
export function readerLink(locator, pin = null) {
  const params = new URLSearchParams();
  if (pin) params.set("publication", pin);
  params.set("passage", locator);
  return `/spec-reader/?${params}`;
}

/* Everything the sheet of one document says, in the order it says it: the
 * total; each criterion with its mean and every judge's score and reason; and
 * the contradictions, confirmed first, each with both passages and every
 * judge's reading. */
export function wholeSheet(assessment, { pin = null } = {}) {
  const claims = assessment.contradictions?.claims || [];
  const ordered = [...claims.filter(claim => claim.confirmed),
                   ...claims.filter(claim => !claim.confirmed)];
  return {
    total: assessment.total,
    criteria: CRITERIA.map(({ key, name, asks }) => {
      const criterion = assessment.criteria?.[key] || {};
      return {
        name,
        asks,
        mean: Number.isFinite(criterion.mean) ? criterion.mean : null,
        judges: Object.entries(criterion.judges || {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([seat, given]) => ({ who: whoSat(seat, given.model), score: given.score,
                                     rationale: given.rationale || "" })),
      };
    }),
    contradictions: {
      ...CONTRADICTIONS,
      score: assessment.contradictions?.score ?? null,
      claims: ordered.map(claim => ({
        confirmed: Boolean(claim.confirmed),
        status: claimStatus(claim),
        situation: claim.situation || "",
        why: claim.why || "",
        passages: (claim.passages || []).map(passage => ({
          quote: passage.quote || "", href: readerLink(passage.locator, pin) })),
        readings: (claim.readings || []).map(reading => ({
          who: whoSat(reading.seat, reading.model),
          words: readingWords(reading),
          reason: reading.found ? "" : (reading.reason || ""),
        })),
      })),
    },
  };
}
```

- [ ] **Step 5: Run the tests; only the overview guard should still fail**

Run: `node --test app/lib/__tests__/document-assessment.test.mjs`
Expected: all pass except "the overview draws the row from this module"; `# fail 1`.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `OK`.

- [ ] **Step 6: Draw the row and its sheet**

In `site/overview.js`:

(a) After the `depth-scale.js` import, add:

```js
/* The document as a whole: the row at the foot of the grid and the sheet it
 * opens, on a publication out of ten. */
import { WHOLE_MAX, CRITERION_MAX, CRITERIA, CONTRADICTIONS, SCORE_RULE, NOT_REVIEWED,
         HOW_CONFIRMED, assessmentOf, wholeSheet } from "./document-assessment.js";
```

(b) Replace the `state` declaration from Task 1 with:

```js
/* `scale` is the publication's, read from its payload: 10 on a publication out
 * of ten and 4 on every one before it, so a pinned earlier publication says
 * "out of 4" as it did. `assessments` is the payload's assessment of each
 * document as a whole, on a publication out of ten and null on one out of
 * four, which has no such row. */
const state = { behaviours: [], columns: [], passages: {}, depths: {}, registry: {}, scale: 4,
                assessments: null };
```

(c) In `updateRemaining`, replace

```js
  const below = [...elements.body.querySelectorAll("tr:not(.group-row)")]
```

with

```js
  const below = [...elements.body.querySelectorAll("tr:not(.group-row):not(.whole-row)")]
```

and change the comment above it to: `// Behaviours, not rows: the dividers between groups are rows too, and so is the document as a whole, and counting them would promise more below the fold than there is to read.`

(d) After the function `paragraph(text, className)`, add:

```js
/* A figure in the data face, inside a sentence in the reading one. */
function figureSpan(text, className) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}

/* The grid's mark for a cell with no figure: a dash (an en dash, written as its
 * code point), which is the absence of a finding where a nought would be one. */
function noFigure() {
  const empty = document.createElement("span");
  empty.className = "cell-empty";
  empty.textContent = "\u2013";
  return empty;
}

/* What the row is, pressed by its name: the five criteria and what each asks,
 * before any document's scores. */
function openWholeAbout() {
  sheet("The document as a whole", body => {
    body.append(paragraph(
      "Beside a depth for each behaviour, the panel's judges read each document whole and "
      + `score it on five criteria, each from 0 to ${CRITERION_MAX}, for a total out of `
      + `${WHOLE_MAX}. A company with no specification has nothing to assess, and its cell `
      + "is left empty."));
    [...CRITERIA, CONTRADICTIONS].forEach(({ name, asks }) => {
      body.append(heading(name), paragraph(asks, "asks"));
    });
    body.append(paragraph(
      `The contradictions are the judges' list, not reviewed by a person. ${HOW_CONFIRMED}`,
      "notice"));
  });
}

/* One document's assessment: the total, each criterion with its mean and every
 * judge's score and reason, and the contradictions the judges listed, each
 * passage a way into the reader. The judges' words land as text, like every
 * rationale on this page. */
function openWhole(column, assessed) {
  const whole = wholeSheet(assessed, { pin: PIN });
  sheet(`${column.lab}: the document as a whole`, body => {
    const total = paragraph("");
    total.append(figureSpan(whole.total.toFixed(1), "sheet-figure"),
                 document.createTextNode(` out of ${WHOLE_MAX}.`));
    body.append(total, paragraph(
      `The four criteria's means and the contradictions' score, each out of ${CRITERION_MAX}, `
      + "added together.", "missing"));

    whole.criteria.forEach(criterion => {
      body.append(heading(criterion.name), paragraph(criterion.asks, "asks"));
      if (criterion.mean !== null) {
        const count = criterion.judges.length;
        const mean = paragraph("");
        mean.append(figureSpan(criterion.mean.toFixed(1), "criterion-figure"),
                    document.createTextNode(` out of ${CRITERION_MAX}, the mean of ${count} `
                      + `${count === 1 ? "judge" : "judges"}.`));
        body.append(mean);
      }
      if (criterion.judges.length) {
        const fold = document.createElement("details");
        fold.className = "panel-readings";
        const label = document.createElement("summary");
        label.textContent = "Each judge's score and reason";
        const list = document.createElement("ul");
        list.className = "judges";
        criterion.judges.forEach(judge => {
          const item = document.createElement("li");
          item.append(figureSpan(judge.who, "who"),
                      document.createTextNode(` gave ${judge.score}`));
          if (judge.rationale) item.append(paragraph(judge.rationale));
          list.append(item);
        });
        fold.append(label, list);
        body.append(fold);
      }
    });

    const contradictions = whole.contradictions;
    body.append(heading(contradictions.name), paragraph(contradictions.asks, "asks"));
    if (contradictions.score !== null) {
      const score = paragraph("");
      score.append(figureSpan(String(contradictions.score), "criterion-figure"),
                   document.createTextNode(` out of ${CRITERION_MAX}.`));
      body.append(score, paragraph(`The score is ${SCORE_RULE}`, "asks"));
    }
    body.append(paragraph(`${NOT_REVIEWED} ${HOW_CONFIRMED}`, "notice"));
    if (!contradictions.claims.length) {
      body.append(paragraph("The judges listed none.", "missing"));
      return;
    }
    const list = document.createElement("ol");
    list.className = "claims";
    contradictions.claims.forEach(claim => {
      const item = document.createElement("li");
      item.append(paragraph(claim.status,
                            claim.confirmed ? "claim-status" : "claim-status unconfirmed"));
      if (claim.situation) item.append(paragraph(claim.situation));
      if (claim.why) item.append(paragraph(claim.why));
      claim.passages.forEach(passage => {
        const quote = document.createElement("blockquote");
        quote.className = "claim-passage";
        const link = document.createElement("a");
        link.href = passage.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = passage.quote;
        quote.append(link);
        item.append(quote);
      });
      const readings = document.createElement("ul");
      readings.className = "judges";
      claim.readings.forEach(reading => {
        const line = document.createElement("li");
        line.append(figureSpan(reading.who, "who"),
                    document.createTextNode(` ${reading.words}`));
        if (reading.reason) line.append(paragraph(reading.reason));
        readings.append(line);
      });
      item.append(readings);
      list.append(item);
    });
    body.append(list);
  });
}
```

(e) In `render`, replace

```js
        if (!depth && !column.absent) {
          const empty = document.createElement("span");
          empty.className = "cell-empty";
          empty.textContent = "–";
          cell.append(empty);
        } else {
```

with

```js
        if (!depth && !column.absent) {
          cell.append(noFigure());
        } else {
```

(f) In `render`, directly before `elements.body.replaceChildren(rows);`, add:

```js
  /* The document as a whole, at the foot and under every group: one figure per
   * document, its total out of 20, on a publication out of ten and on nothing
   * else. A company with no specification has nothing to assess, so its cell is
   * empty rather than a nought. */
  if (state.assessments) {
    const row = document.createElement("tr");
    row.className = "whole-row";
    const name = document.createElement("th");
    name.scope = "row";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "subject-button";
    const label = document.createElement("span");
    label.textContent = "The document as a whole";
    open.append(label);
    open.addEventListener("click", () => openWholeAbout());
    name.append(open);
    row.append(name);
    columns.forEach(column => {
      const cell = document.createElement("td");
      cell.className = "cell";
      if (!column.absent) {
        const assessed = assessmentOf(state.assessments, column.id);
        if (!assessed) {
          cell.append(noFigure());
        } else {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "cell-button";
          paint(button, assessed.total, WHOLE_MAX);
          button.setAttribute("aria-label", `${column.lab}, the document as a whole: `
            + `${assessed.total.toFixed(1)} out of ${WHOLE_MAX}`);
          const out = figureSpan(`/${WHOLE_MAX}`, "cell-max");
          out.setAttribute("aria-hidden", "true");
          button.append(figureSpan(assessed.total.toFixed(1), "cell-figure"), out);
          button.addEventListener("click", () => openWhole(column, assessed));
          cell.append(button);
        }
      }
      row.append(cell);
    });
    rows.append(row);
  }
```

(g) In `initialize`, after `state.scale = depthScaleOf(payload);`, add:

```js
  state.assessments = payload.assessment && typeof payload.assessment === "object"
    ? payload.assessment : null;
```

In `site/overview.html`'s `<style>`, after the rule `.missing { color: var(--faint); }`, add:

```css
/* The document as a whole: one row under every group, set apart by the rule the
   groups are divided by. Its figure is a total out of 20, so the cell says so in
   its corner, as the governance view's scores say theirs. */
#grid .whole-row { border-top: 1px solid var(--muted); }
#grid .whole-row th, #grid .whole-row td { padding-top: 14px; }
#grid .whole-row .cell-button { position: relative; }
#grid .whole-row .cell-max { color: inherit; opacity: .75; }
#grid .whole-row .cell-button:focus-visible { outline: 2px solid var(--energy); outline-offset: 2px; }
/* A document's assessment, in the sheet: what each criterion asks, quieter than
   its figure; the contradictions with their status in words, both passages
   quoted, and every judge's reading. */
.sheet-body .asks { color: var(--muted); }
.criterion-figure { font-family: var(--mono); font-size: 15px; font-weight: 600; }
.sheet-body .notice { padding-left: 12px; border-left: 3px solid var(--muted); }
.claims { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 22px; }
.claim-status { font-weight: 600; }
.claim-status.unconfirmed { color: var(--muted); }
.claim-passage { margin: 0 0 8px; padding-left: 14px; border-left: 2px solid var(--line); }
.claim-passage a:focus-visible { outline: 2px solid var(--energy); outline-offset: 2px; }
```

- [ ] **Step 7: Run the tests and the existing suites**

Run: `node --test app/lib/__tests__/document-assessment.test.mjs`
Expected: `# fail 0`.

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `OK`.

Run: `node --test app/lib/__tests__/*.test.mjs`
Expected: `# fail 0`.

Run: `node engine/verify-reader-features.mjs`
Expected: `ALL FEATURE CHECKS PASSED.` The fixture is out of four, so it draws no row; Task 6 walks the row.

- [ ] **Step 8: Document the file**

In `site/OVERVIEW.md`, after the `depth-scale.js` row, add:

```markdown
| `document-assessment.js` | What the overview says about a document's assessment as a whole on a publication out of ten: the five criteria in the prompts' words, the words for each judge's reading of a contradiction, and the contents of the sheet the grid's last row opens, as data. Imported by `overview.js`. |
```

- [ ] **Step 9: Commit**

```bash
git add site/document-assessment.js site/overview.js site/overview.html site/OVERVIEW.md \
  app/lib/__tests__/document-assessment.test.mjs engine/panel/test_site_rubrics.py
git commit -m "feat: the grid carries the document as a whole under its behaviours" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 3: The reader reads its depth scale from the payload

**Files:**
- Modify: `site/spec-reader/app.js` (an import at the top; `state` at about 404; `renderBehaviourList` heading at about 1280; `openDepthNote` at about 1098-1112; the block at about 1389-1426; `depthScaleNote`, `depthCellNote`, `depthSummaryLine`, `depthSpoken` at about 1466-1552; `initialize` at about 5128)
- Modify: `site/spec-reader/styles.css` (after `.depth-note-bar, .depth-note-rationale`)
- Modify: `engine/panel/test_appjs_depth.js`, `engine/panel/test_panel.py` (`TestAppJSDepth`)
- Modify: `app/lib/__tests__/depth-scale.test.mjs` (append), `app/lib/__tests__/slice.test.mjs` (append)

**Interfaces:**
- Consumes (from `site/depth-scale.js`, Task 1): `depthScaleOf`, `levelsOf`, `depthPhrase`, `ODD_VALUES`, `CONDITIONS_FOR_TEN`.
- Produces in `app.js`: `state.depthScale` (4 or 10), and `depthScaleNote(behaviours) -> {title, lede, levels, [odd, conditions]}`, where `odd` and `conditions` appear on the scale of ten only.
- Produces in the DOM: the list class `depth-note-scale-ten`, the nested `ul.depth-note-conditions` under level 10, and `p.depth-note-odd`. Task 6 walks these.
- Produces: `TestAppJSDepth` asserts `55 checks, 0 failures`.

- [ ] **Step 1: Write the failing harness checks**

In `engine/panel/test_appjs_depth.js`:

(a) Replace the header's first paragraph with:

```js
/* Guard for the depth site/spec-reader/app.js reads out of a publication:
 * panelDepth, depthSummaryLine, updateBehaviourDepths and openBehaviourNote,
 * all extracted verbatim from the real file. The scales and their words are
 * site/depth-scale.js's, which app.js imports and this file requires, so both
 * read the one module.
```

(b) Delete the function `extractConstBlock` and its comment (`/* A const whose value runs over several lines: read on until its brackets close. */`).

(c) Replace

```js
eval(extractConstBlock("DEPTH_LEVELS"));
eval(extractConst("NUMBER_WORDS"));
eval(extractConst("DEPTH_WORDS"));
```

with

```js
/* app.js imports these from site/depth-scale.js; the functions below read them
 * under the same names. */
var { depthScaleOf, levelsOf, depthWords, depthPhrase, ODD_VALUES, CONDITIONS_FOR_TEN } =
  require(path.join(__dirname, "..", "..", "site", "depth-scale.js"));
eval(extractConst("NUMBER_WORDS"));
```

(d) Replace `function show(...)` with:

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

(e) Replace

```js
check("the word said beside a mean is the anchor of the level it rounds to",
      () => DEPTH_WORDS, ["absent", "named", "discussed", "prescribed", "demonstrated"]);
```

with

```js
check("the word said beside a mean is the anchor of the level it rounds to",
      () => [0, 1, 2, 3, 4].map(level => depthWords(level, 4)),
      ["absent", "named", "discussed", "prescribed", "demonstrated"]);
```

(f) Directly before `/* ---- the width it opens at ---- */`, add these seven checks:

```js
/* ---- a publication on the depth scale of ten ----
 *
 * The scale is the payload's: initialize sets state.depthScale from
 * payload.depthScale, and everything that says a figure's scale reads it. */
const TEN_HELPFULNESS = {
  id: 1, slug: "helpfulness", name: "Helpfulness",
  coverage: {
    "anthropic--constitution@2026-01-20": {
      depth: { mean: 7.3, scale: 10, judges: {
        deepseek: { depth: 7, rationale: "Rules; the example tests a neighbouring behaviour." },
        fable: { depth: 7, rationale: "Rules; the example tests a neighbouring behaviour." },
        sol: { depth: 8, rationale: "Rules and a worked example." } } },
      passages: [] },
    "openai--model-spec@2025-12-18": {
      depth: { mean: 8, scale: 10, judges: { sol: { depth: 8, rationale: "Worked examples." } } },
      passages: [] },
  },
};

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

In `engine/panel/test_panel.py`, `TestAppJSDepth.test_depth_in_appjs`, change `"48 checks, 0 failures"` to `"55 checks, 0 failures"`.

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

Append to `app/lib/__tests__/slice.test.mjs`. It pins what the reader relies on and passes at once:

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

- [ ] **Step 2: Run them to verify they fail**

Run: `node engine/panel/test_appjs_depth.js | tail -3`
Expected: FAIL lines for the seven new checks and for "the word said beside a mean ...". For example, "on the scale of ten the column's heading says so" gets `"Depth, out of 4"`; after `require` the old checks still pass because the old constants remain in `app.js`. The last line reports failures and the process exits 1.

Run: `node --test app/lib/__tests__/depth-scale.test.mjs`
Expected: "the reader carries no copy of the levels or of the scale of four" fails with "a bar was copied back in".

Run: `node --test app/lib/__tests__/slice.test.mjs`
Expected: `# fail 0`. This one is a pin, not a red test.

- [ ] **Step 3: Read the scale in the reader**

In `site/spec-reader/app.js`:

(a) After the header comment that ends ` * /api/reader/documents, built by engine/build-spec-reader-data.py.\n */`, and before `const DOCUMENTS_URL`, add:

```js
/* The depth scales and their words, one module for this page and the overview. */
import { depthScaleOf, levelsOf, depthPhrase, ODD_VALUES, CONDITIONS_FOR_TEN }
  from "/depth-scale.js";
```

(b) In `const state = {`, after `bands: null, ...`, add:

```js
  /* The scale the payload's depths are on, 4 unless the payload says 10
   * (depthScaleOf). Read once, when the reader loads: a pinned earlier
   * publication reads 4 and says so. */
  depthScale: 4,
```

(c) In `initialize`, after `state.provenance = behaviours.provenance || {};`, add:

```js
    state.depthScale = depthScaleOf(behaviours);
```

(d) In `renderBehaviourList`, replace `>Depth, out of 4</button>` with `>Depth, out of ${state.depthScale}</button>`.

(e) Replace the two comment blocks and code from `/* How deeply each document on screen covers each behaviour, beside its name.` through `const DEPTH_WORDS = DEPTH_LEVELS.map(level => level.anchor);` with:

```js
/* How deeply each document on screen covers each behaviour, beside its name.
 *
 * The mean of the panel's depths, one figure per document on screen, so
 * comparing two documents puts two figures side by side. A cell with no depth
 * shows a dash: zero is a finding, a dash is the absence of one.
 *
 * The figures are bare. The scale is said once, at the top of the column, in
 * each group's heading ("Depth, out of 4", or out of 10 on a publication given
 * on that scale): "3.7 / 4" beside every name read poorly, and comparing already
 * puts " / " between two documents' figures. A sentence that gives one depth on
 * its own says the scale in that sentence.
 *
 * The scale is the payload's, state.depthScale, read when the reader loads. The
 * levels of each scale, the words said beside a mean and the line on odd
 * figures are site/depth-scale.js's, which the overview imports too, so the two
 * pages quote one rubric. engine/panel/test_site_rubrics.py holds its scale of
 * ten to the prompt the judges read. */
```

(f) Replace `depthScaleNote` with:

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

(g) In `depthCellNote`, replace

```js
      ? `${depth.mean.toFixed(1)} out of 4, ${DEPTH_WORDS[Math.round(depth.mean)]}.`
```

with

```js
      ? `${depthPhrase(depth.mean, state.depthScale)}.`
```

(h) Replace the comment and body of `depthSummaryLine` with:

```js
/* One line naming a document's depth for a behaviour: the mean out of its scale
 * and the rubric's words, or that none was given. Shared by the figure's hover
 * title, the hidden description a screen reader hears, and the note's own
 * paragraph: one text, not three copies of the same wording. */
function depthSummaryLine(doc, depth) {
  if (!depth) return `${doc.title} ${doc.version}: no depth given.`;
  return `${doc.title} ${doc.version}: ${depthPhrase(depth.mean, state.depthScale)}.`;
}
```

(i) In `depthSpoken`, replace

```js
    .map(depth => (depth ? `${depth.mean.toFixed(1)} out of 4` : "not given"))
```

with

```js
    .map(depth => (depth ? `${depth.mean.toFixed(1)} out of ${state.depthScale}` : "not given"))
```

(j) In `openDepthNote`, replace the `if (note.levels) { ... }` branch body (up to `body.append(list);`) with:

```js
  if (note.levels) {
    body.append(span("depth-note-lede", note.lede));
    const list = document.createElement("ul");
    list.className = note.conditions ? "depth-note-scale depth-note-scale-ten"
      : "depth-note-scale";
    note.levels.forEach(level => {
      const item = document.createElement("li");
      // The spaces are for whoever reads the row as one string, a screen
      // reader or the walker, and cost the grid nothing: whitespace between
      // grid items is not an item.
      item.append(span("depth-note-level", String(level.level)), " ",
                  span("depth-note-anchor", level.anchor), " ",
                  span("depth-note-bar", level.bar));
      // The bar of 10 names three conditions "below", so they are listed under it.
      if (note.conditions && level.level === 10) {
        const conditions = document.createElement("ul");
        conditions.className = "depth-note-conditions";
        note.conditions.forEach(condition => {
          const line = document.createElement("li");
          line.textContent = condition;
          conditions.append(line);
        });
        item.append(" ", conditions);
      }
      list.append(item);
    });
    body.append(list);
    if (note.odd) {
      const odd = document.createElement("p");
      odd.className = "depth-note-odd";
      odd.textContent = note.odd;
      body.append(odd);
    }
  } else {
```

In `site/spec-reader/styles.css`, after the rule `.depth-note-bar, .depth-note-rationale { ... }`, add:

```css
/* The scale of ten: its figures run to two digits, so their column is wider;
   10 lists the three conditions its bar names, under the bar; and one line
   under the levels says what an odd figure means. The scale of four draws none
   of this, and its rows are what they were. */
.depth-note-scale.depth-note-scale-ten li { grid-template-columns: 18px 1fr; }
.depth-note-scale .depth-note-conditions {
  grid-column: 2 / -1;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  color: var(--muted);
}
.depth-note-scale .depth-note-conditions li {
  display: block;
  margin: 0;
  padding: 0;
  border-top: 0;
}
.depth-note-odd { margin: 10px 0 0; color: var(--muted); }
```

- [ ] **Step 4: Run the tests and the walkers**

Run: `node engine/panel/test_appjs_depth.js | tail -1`
Expected: `55 checks, 0 failures`.

Run: `python3 engine/panel/test_panel.py TestAppJSDepth`
Expected: `OK`.

Run: `node --test app/lib/__tests__/*.test.mjs`
Expected: `# fail 0`.

Run: `python3 -m unittest discover -s engine/panel -p "test_*.py"`
Expected: `OK`. This covers every `app.js` harness, none of which reads the removed constants.

Run: `node engine/verify-reader-test.mjs`
Expected: last line `All views verified.` It still asserts "out of 4" and "Depth, out of 4" against the fixture of four.

Run: `node engine/verify-reader-features.mjs`
Expected: `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 5: Commit**

```bash
git add site/spec-reader/app.js site/spec-reader/styles.css engine/panel/test_appjs_depth.js \
  engine/panel/test_panel.py app/lib/__tests__/depth-scale.test.mjs app/lib/__tests__/slice.test.mjs
git commit -m "feat: the reader reads its depth scale from the publication" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 4: The MCP server says what a depth is out of, and carries the assessment

**Files:**
- Modify: `app/lib/mcp-tools.mjs` (`panelDepth` at about 24-37, `listModelSpecs`, `listBehaviours`, `retrievePassages`, `compareDocuments`, `INSTRUCTIONS` at about 576-619, `about` at about 651-770)
- Modify: `app/api/mcp/route.js` (descriptions at about 90-133)
- Test: `app/lib/__tests__/mcp-tools.test.mjs` (append)

**Interfaces:**
- Consumes: the payload fields only; the MCP library does not import `site/`, as `app/lib/bands.mjs` does not.
- Produces:
  - On a publication out of ten, every `depth` answer carries `scale: 10` beside `mean`. On a publication out of four the answer is unchanged, with no `scale`.
  - On a publication out of ten, `list_model_specs` gives each `model_specs[i].assessment` as `{ total, out_of: 20, criteria: { <key>: { mean, out_of: 4, judges } }, contradictions: { score, out_of: 4, note, claims: [{ passages: [{ locator, quote }], situation, why, confirmed, absolute, readings }] } }`, or `null` for a document the publication did not assess. On a publication out of four there is no `assessment` key.

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/__tests__/mcp-tools.test.mjs`:

```js
/* ---- a publication out of ten ---- */

const CORPUS = "acme--corpus@2026-01-01";
const ASSESSED = {
  criteria: {
    conflict_rules: { mean: 3.0, judges: {
      a: { score: 4, rationale: "A strict order." },
      b: { score: 3, rationale: "An order.", model: "d" },
      c: { score: 2, rationale: "Weighed as a whole." } } },
    rule_force: { mean: 4.0, judges: {
      a: { score: 4, rationale: "r" }, b: { score: 4, rationale: "r" }, c: { score: 4, rationale: "r" } } },
    reasons: { mean: 2.0, judges: {
      a: { score: 2, rationale: "r" }, b: { score: 2, rationale: "r" }, c: { score: 2, rationale: "r" } } },
    situations: { mean: 1.0, judges: {
      a: { score: 1, rationale: "r" }, b: { score: 1, rationale: "r" }, c: { score: 1, rationale: null } } },
  },
  contradictions: {
    claims: [{
      passages: [
        { locator: `${CORPUS} > #sentences > ¶1`, quote: "A locator may name a span.", exampleBlock: false },
        { locator: `${CORPUS} > #sentences > ¶2`, quote: "Dr. Smith walks in.", exampleBlock: false }],
      situation: "When a paragraph is counted.", why: "The counts differ.",
      readings: [
        { seat: "a", found: true, holds: true, absolute: null, reason: "found it" },
        { seat: "b", found: false, holds: true, absolute: false, reason: "Nothing settles it.", model: "d" },
        { seat: "c", found: false, holds: false, absolute: false, reason: "It is settled below." }],
      confirmed: true, absolute: false, reviewed: null }],
    score: 2,
  },
  total: 12.0,
};

/* The fixture of four, said to be out of ten: every depth carries the scale,
 * as build_site_data.py writes it, and the corpus alone is assessed. */
const outOfTen = () => {
  const ten = structuredClone(payload);
  ten.depthScale = 10;
  for (const behaviour of ten.behaviours) {
    for (const cell of Object.values(behaviour.coverage)) {
      if (cell.depth) cell.depth = { ...cell.depth, scale: 10 };
    }
  }
  ten.assessment = { [CORPUS]: ASSESSED };
  return { ...snapshot(), payload: ten };
};

test("on a publication out of ten every depth says what it is out of", () => {
  const ten = outOfTen();
  assert.equal(listBehaviours(ten).behaviours[0].coverage[CORPUS].depth.scale, 10);
  assert.equal(retrievePassages(ten, { behaviours: ["defined-behaviour"] }).results[0].depth.scale, 10);
  assert.equal(compareDocuments(ten, null, { behaviour: "defined-behaviour", model_spec_ids: PAIR })
    .depth[CORPUS].scale, 10);
});

test("the publication's scale is given even where a cell did not record it", () => {
  const ten = outOfTen();
  delete ten.payload.behaviours[0].coverage[CORPUS].depth.scale;
  assert.equal(listBehaviours(ten).behaviours[0].coverage[CORPUS].depth.scale, 10);
});

test("on a publication out of four a depth answers as it always has, with no scale", () => {
  const depth = listBehaviours(snapshot()).behaviours[0].coverage[CORPUS].depth;
  assert.equal("scale" in depth, false);
});

test("list_model_specs carries each document's assessment on a publication out of ten", () => {
  const [corpus, second] = listModelSpecs(outOfTen()).model_specs;
  assert.equal(corpus.assessment.total, 12);
  assert.equal(corpus.assessment.out_of, 20);
  assert.deepEqual(Object.keys(corpus.assessment.criteria),
                   ["conflict_rules", "rule_force", "reasons", "situations"]);
  assert.equal(corpus.assessment.criteria.conflict_rules.out_of, 4);
  assert.deepEqual(corpus.assessment.criteria.conflict_rules.judges.b,
                   { score: 3, rationale: "An order.", model: "d" });
  assert.equal(corpus.assessment.contradictions.score, 2);
  assert.equal(corpus.assessment.contradictions.out_of, 4);
  assert.match(corpus.assessment.contradictions.note, /not reviewed by a person/);
  const [claim] = corpus.assessment.contradictions.claims;
  assert.deepEqual(claim.passages, [
    { locator: `${CORPUS} > #sentences > ¶1`, quote: "A locator may name a span." },
    { locator: `${CORPUS} > #sentences > ¶2`, quote: "Dr. Smith walks in." }]);
  assert.equal(claim.confirmed, true);
  assert.equal(claim.readings[1].model, "d");
  assert.equal(second.assessment, null, "a document the publication did not assess says so");
});

test("list_model_specs on a publication out of four carries no assessment at all", () => {
  for (const spec of listModelSpecs(snapshot()).model_specs) {
    assert.equal("assessment" in spec, false);
  }
});

test("about on a publication out of ten gives the scale of ten and the assessment", () => {
  const answer = about(outOfTen());
  for (const anchor of ["absent", "named", "discussed", "prescribed", "demonstrated", "bounded"]) {
    assert.ok(answer.includes(anchor), `the depth scale does not say ${anchor}`);
  }
  assert.ok(answer.includes("depth for the behaviour, 0 to 10"));
  assert.ok(!answer.includes("depth for the behaviour, 0 to 4"));
  assert.ok(answer.includes("The total is out of 20"));
  assert.ok(answer.includes("each document's assessment as a whole"));
});

test("about on a publication out of four keeps the scale of four", () => {
  const answer = about(snapshot());
  assert.ok(answer.includes("depth for the behaviour, 0 to 4"));
  assert.ok(!answer.includes("each document's assessment as a whole"));
});

test("the instructions say what a depth is out of, on either scale", () => {
  const said = INSTRUCTIONS.replace(/\s+/g, " ");
  assert.ok(said.includes("scale: 10"));
  assert.ok(said.includes("A depth without a scale is out of 4"));
  assert.ok(said.includes("a total out of 20"));
  assert.ok(said.includes("not reviewed by a person"));
});

test("the tool descriptions say what a depth is out of", () => {
  const described = ROUTE.replace(/"\s*\+\s*"/g, "");
  assert.ok(described.includes("depth.scale"));
  assert.ok(described.includes("out of 20"));
  assert.ok(!described.includes("0 to 4; a pair with no depth answers null"));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test app/lib/__tests__/mcp-tools.test.mjs`
Expected, at least:
- "the publication's scale is given even where a cell did not record it" fails (`undefined !== 10`).
- "list_model_specs carries each document's assessment ..." fails (`corpus.assessment` is undefined).
- The `about`, instructions and descriptions tests fail.

The first ten test may pass, since the cells carry `scale` already.

- [ ] **Step 3: Implement**

In `app/lib/mcp-tools.mjs`:

(a) Replace the comment and body of `panelDepth` with:

```js
/**
 * The scale a publication's depths are on. A payload out of ten says so at its
 * top, `depthScale: 10`, and nothing else does, so every earlier publication is
 * out of 4. site/depth-scale.js reads it the same way for the pages.
 */
function depthScaleOf(payload) {
  return payload?.depthScale === 10 ? 10 : 4;
}

/**
 * The depth the index's panel gave a cell, or null. Every depth an answer
 * carries is read through here.
 *
 * A depth counts only as an object with a finite numeric mean. The grandfathered
 * publication was written by the old builder and carries a human curation's
 * integer in this field; answering with it would present the curation's figure
 * as the panel's mean.
 *
 * On a publication out of ten the depth carries its scale, `scale: 10`, beside
 * its mean, whatever the cell itself recorded: the publication says which scale
 * all of its depths are on. A depth of a publication out of four answers exactly
 * as it always has, with no scale, which INSTRUCTIONS says means 4.
 */
function panelDepth(behaviour, modelSpecId, scale = 4) {
  const depth = behaviour?.coverage?.[modelSpecId]?.depth;
  if (depth === null || typeof depth !== "object" || !Number.isFinite(depth.mean)) return null;
  return scale === 10 ? { ...depth, scale } : depth;
}
```

(b) After `specSummary`, add:

```js
const CONTRADICTIONS_NOTE =
  "The judges' list, not reviewed by a person. Each contradiction was found by one "
  + "judge and put to the others, and it is confirmed when two or more of them found it "
  + "or hold it. The score counts confirmed ones only: 4 when none is confirmed, 2 when "
  + "one or two are and none involves a rule the document calls absolute, 0 when three "
  + "or more are or any one does.";

/**
 * A document's assessment as a whole, as list_model_specs answers it, or null.
 *
 * The payload's own figures, with what each is out of beside it, and each
 * passage of a contradiction as its locator and its quote, the two fields every
 * other answer gives a passage.
 */
function assessmentAnswer(assessed) {
  if (!assessed || typeof assessed !== "object" || !Number.isFinite(assessed.total)) return null;
  const criteria = {};
  for (const [name, criterion] of Object.entries(assessed.criteria || {})) {
    criteria[name] = { mean: criterion.mean, out_of: 4, judges: criterion.judges || {} };
  }
  const contradictions = assessed.contradictions || {};
  return {
    total: assessed.total,
    out_of: 20,
    criteria,
    contradictions: {
      score: contradictions.score ?? null,
      out_of: 4,
      note: CONTRADICTIONS_NOTE,
      claims: (contradictions.claims || []).map(claim => ({
        passages: (claim.passages || []).map(({ locator, quote }) => ({ locator, quote })),
        situation: claim.situation ?? null,
        why: claim.why ?? null,
        confirmed: claim.confirmed === true,
        absolute: claim.absolute ?? null,
        readings: claim.readings || [],
      })),
    },
  };
}
```

(c) Replace `listModelSpecs` with:

```js
export function listModelSpecs({ publication, payload, documents }) {
  const behaviours = payload.behaviours || [];
  /* Only a publication out of ten carries an assessment. One out of four
   * answers as it always has, with no such key. */
  const assessed = payload.assessment && typeof payload.assessment === "object"
    ? payload.assessment : null;
  return {
    publication,
    model_specs: (documents.documents || []).map(document => ({
      ...specSummary(document),
      behaviours_judged: behaviours.filter(
        behaviour => behaviour.coverage?.[document.id]).length,
      passages: behaviours.reduce(
        (total, behaviour) =>
          total + (behaviour.coverage?.[document.id]?.passages?.length || 0), 0),
      ...(assessed ? { assessment: assessmentAnswer(assessed[document.id]) } : {}),
    })),
  };
}
```

Also add to its doc comment: `On a publication out of ten each document also carries its assessment as a whole.`

(d) In `listBehaviours`, at its top add `const scale = depthScaleOf(payload);` and change `depth: panelDepth(behaviour, modelSpecId),` to `depth: panelDepth(behaviour, modelSpecId, scale),`.

(e) In `retrievePassages`, add `const scale = depthScaleOf(payload);` after `const specifications = ...`, and change `depth: panelDepth(behaviour, cell.modelSpecId),` to `depth: panelDepth(behaviour, cell.modelSpecId, scale),`.

(f) In `compareDocuments`, add `const scale = depthScaleOf(payload);` after `const specifications = ...`, and change both `panelDepth(behaviour, id)` calls to `panelDepth(behaviour, id, scale)`.

(g) In `INSTRUCTIONS`, replace

```
Where a behaviour and specification pair carries a depth, it is the mean the
index's panel gave it, from 0 (absent) to 4 (rules with worked examples). A pair
with no depth answers null.
```

with

```
Where a behaviour and specification pair carries a depth, it is the mean the
index's panel gave it. On a publication out of ten the depth carries scale: 10
beside its mean, and runs from 0 (absent) to 10 (worked examples that show where
the answer changes, settle the behaviour's conflicts with other rules, and say
what to do when a case cannot be told apart). A depth without a scale is out of
4, as on every publication before that scale, from 0 (absent) to 4 (rules with
worked examples). A pair with no depth answers null.

A publication out of ten also assesses each document as a whole, and
list_model_specs carries it: five criteria the same panel scored from 0 to 4,
with each judge's score and reason, and a total out of 20. Its contradictions are
the judges' list, not reviewed by a person.
```

(h) Directly above `export function about(`, add:

```js
/* The depth paragraph of `about`, one per scale. The scale of four's is the
 * paragraph `about` has always given. */
const DEPTH_OUT_OF_FOUR =
  "Each judge also gives the document a depth for the behaviour, 0 to 4, and "
  + "the publication carries the mean of the panel: 0 absent, no passage bears "
  + "on the behaviour; 1 named, it appears in a word or a clause and the "
  + "document says nothing further; 2 discussed, addressed in its own right but "
  + "in terms too general to grade a response against; 3 prescribed, concrete "
  + "rules or procedures specific enough that a grader could quote the "
  + "document's own sentences as pass criteria; 4 demonstrated, prescribed plus "
  + "worked examples showing the sanctioned response. A judge scoring a depth "
  + "is shown the passages the panel cited for that behaviour and nothing else, "
  + "so a depth reads those citations rather than the whole document. It "
  + "measures how far a document develops a behaviour, not how much its "
  + "laboratory cares about it and not whether anyone agrees with what it says.";

const DEPTH_OUT_OF_TEN =
  "Each judge also gives the document a depth for the behaviour, 0 to 10, and "
  + "the publication carries the mean of the panel, with depth.scale at 10. The "
  + "even numbers are the levels: 0 absent, no passage bears on the behaviour; 2 "
  + "named, it appears in a word or a clause and the document says nothing "
  + "further; 4 discussed, addressed in its own right but in terms too general to "
  + "grade a response against; 6 prescribed, concrete rules or procedures specific "
  + "enough that a grader could quote the document's own sentences as pass "
  + "criteria; 8 demonstrated, prescribed plus worked examples showing the "
  + "sanctioned response; 10 bounded, demonstrated, and for every facet of the "
  + "behaviour the document shows two cases that differ in one feature and get "
  + "opposite responses, settles a conflict with another of its own rules on a "
  + "case, and says what to do when the model cannot tell which case it is in. An "
  + "odd number means the level below is fully met and the level above only in "
  + "part. A judge scoring a depth is shown the passages the panel cited for that "
  + "behaviour, and the passages in which the document states its general rules "
  + "for conflicts between its own rules, and nothing else, so a depth reads those "
  + "citations rather than the whole document. It measures how far a document "
  + "develops a behaviour, not how much its laboratory cares about it and not "
  + "whether anyone agrees with what it says.";

const THE_DOCUMENT_AS_A_WHOLE =
  "The document as a whole. The same panel also read each document whole and "
  + "scored it on five criteria, each 0 to 4: conflict_rules, what the document "
  + "says in general when two of its own rules conflict; rule_force, whether a "
  + "reader can tell for each rule if it is absolute or a default and who may "
  + "change it; reasons, whether the rules say why they exist; situations, whether "
  + "it has rules for six situations a model is used in; and its unresolved "
  + "contradictions, two passages that require responses that cannot both be "
  + "given with nothing saying which prevails. The total is out of 20. The "
  + "contradictions are the judges' list, not reviewed by a person: each was found "
  + "by one judge and put to the others, and it is confirmed when two or more of "
  + "them found it or hold it. list_model_specs carries each document's "
  + "assessment, with every judge's score and reason.";
```

(i) In `about`, add `const scale = depthScaleOf(payload);` after `const published = ...`. Replace the whole literal depth paragraph, from `"Each judge also gives the document a depth for the behaviour, 0 to 4, and "` through `+ "laboratory cares about it and not whether anyone agrees with what it says.",`, with:

```js
    scale === 10 ? DEPTH_OUT_OF_TEN : DEPTH_OUT_OF_FOUR,
    ...(scale === 10 ? ["", THE_DOCUMENT_AS_A_WHOLE] : []),
```

Replace the `list_model_specs` entry of the tool list:

```js
    "  list_model_specs: the documents above with their source URLs, how many "
    + "behaviours were judged against each and how many passages each holds. "
    + "Reach for it to see what there is to read, or to get a document's id "
    + "exactly right. No arguments.",
```

with

```js
    "  list_model_specs: the documents above with their source URLs, how many "
    + "behaviours were judged against each and how many passages each holds"
    + (scale === 10 ? ", and each document's assessment as a whole" : "")
    + ". Reach for it to see what there is to read, or to get a document's id "
    + "exactly right. No arguments.",
```

In `app/api/mcp/route.js`:

(a) Replace the `list_model_specs` description with:

```js
      description:
        "Every model specification the current publication carries: laboratory, "
        + "title, version, source URL, how many behaviours were judged against "
        + "it and how many passages it holds. On a publication out of ten each "
        + "also carries its assessment as a whole: five criteria the judge panel "
        + "scored 0 to 4, with every judge's score and reason, the contradictions "
        + "the judges listed, which no person has reviewed, and the total out of "
        + "20. Takes no arguments. Does not return the specification text, which "
        + "runs to hundreds of kilobytes; follow source_url for that.",
```

(b) In the `list_behaviours` description, replace

```js
        + "strongest band any of them reaches and the panel's depth. Where a judge "
```

with

```js
        + "strongest band any of them reaches and the panel's depth, which carries "
        + "depth.scale at 10 on a publication out of ten and no scale, meaning out "
        + "of 4, on one before it. Where a judge "
```

(c) In the `retrieve_passages` description, replace

```js
        + "across pages. Where a pair carries a depth, it is the mean the index's "
        + "panel gave it, 0 to 4; a pair with no depth answers null. Where a judge "
```

with

```js
        + "across pages. Where a pair carries a depth, it is the mean the index's "
        + "panel gave it: out of 10 where depth.scale says 10, and out of 4 where "
        + "the depth carries no scale. A pair with no depth answers null. Where a judge "
```

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

### Task 5: Copy, and the rubric of ten as the canonical source

**Files:**
- Modify: `methodology/spec-coverage-depth-rubric.md` (rewritten), `methodology/OVERVIEW.md`
- Create: `methodology/document-assessment-rubric.md`
- Modify: `engine/panel/test_site_rubrics.py` (append)
- Modify: `site/about.html` (about 436-441, 506-511, 570-571, 631, 738-741), `site/mcp.html` (about 380-382, 386-392, 407-410)
- Modify: `README.md` (about 43-50, 135-138, 223-227), `AGENTS.md` (34-36), `SYSTEM.md` (78-80), `CITATION.cff` (31-33)

**Interfaces:**
- Consumes: `prompt_scale()`, `prompt_criteria()`, `prompt_contradiction()` from `engine/panel/test_site_rubrics.py` (Tasks 1 and 2).
- Produces: the section heading `## The depth scale, 0 to 10` in the depth rubric, which `MethodologyTest` splits on.

- [ ] **Step 1: Write the failing test**

Append to `engine/panel/test_site_rubrics.py`, before `if __name__ == "__main__":`:

```python
DEPTH_RUBRIC = ROOT / "methodology" / "spec-coverage-depth-rubric.md"
ASSESSMENT_RUBRIC = ROOT / "methodology" / "document-assessment-rubric.md"
ROW = re.compile(r"^\| (\d+) \| ([a-z]+) \| (.+) \|$")
BOLD_CONDITION = re.compile(r"^\d\. \*\*(.+?)\*\*")


class MethodologyTest(unittest.TestCase):
    """methodology/ is where a reader finds the rubric, so it states it in the
    words the judges read, the same words the site shows."""

    def scale_of_ten(self):
        text = DEPTH_RUBRIC.read_text(encoding="utf-8")
        return text.split("## The depth scale, 0 to 10", 1)[1].split("\n## ", 1)[0]

    def test_the_rubric_of_ten_is_the_prompt_s_table(self):
        rows = [{"level": int(m.group(1)), "anchor": m.group(2), "bar": m.group(3)}
                for m in map(ROW.match, self.scale_of_ten().splitlines()) if m]
        self.assertEqual(rows, prompt_scale()["levels"])

    def test_its_conditions_and_its_line_on_odd_values_are_the_prompt_s(self):
        section = self.scale_of_ten()
        conditions = [m.group(1) for m in map(BOLD_CONDITION.match, section.splitlines()) if m]
        self.assertEqual(conditions, prompt_scale()["conditions"])
        self.assertIn(prompt_scale()["odd"], section)

    def test_the_assessment_rubric_asks_the_prompts_questions(self):
        text = ASSESSMENT_RUBRIC.read_text(encoding="utf-8")
        asks, situations = prompt_criteria()
        for question in asks.values():
            self.assertIn(question, text)
        for situation in situations:
            self.assertIn(situation, text)
        self.assertIn(prompt_contradiction(), text)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 engine/panel/test_site_rubrics.py MethodologyTest`
Expected: the two depth-rubric tests error with `IndexError` (no heading `## The depth scale, 0 to 10`), and the third with `FileNotFoundError`; `FAILED (errors=3)`.

- [ ] **Step 3: Rewrite the depth rubric**

Replace the whole of `methodology/spec-coverage-depth-rubric.md` with:

```markdown
# Spec-coverage depth rubric

Anchors the depth score. As of September 2026 a publication gives its depths on
one of two scales and says which: a payload carrying `depthScale: 10` is on the
scale of ten, set out first below, and a payload without it is on the scale of
four, which every publication made before the scale of ten used and which is
kept at the foot of this file. Each judge of the panel gives one depth per
behaviour per document, in a call of its own, and a publication carries the
mean. Depth measures how much the spec gives an eval designer to work with for
this behaviour, not how much the lab appears to care. Every score carries a
one-line rationale naming what is present and what is missing, in the rubric's
terms.

This file is the rubric's canonical statement. The judges read it in a prompt:
`engine/panel/prompts/depth-v2.txt` for the scale of ten, given by
`engine/panel/depth_pass.py`, and `engine/panel/prompts/depth-v1.txt` for the
scale of four, given by `engine/panel/depth_call.py`. The table, the three
conditions and the line on odd values below are the prompt of ten's own words,
with the anchor in lower case and the bar's first letter a capital, and so are
the overview's legend and the reader's scale note (`site/depth-scale.js`).
`engine/panel/test_site_rubrics.py` holds all three to the prompt, so a change
of substance lands in the prompt, under a new digest, and here in the same
commit.

## The depth scale, 0 to 10

| Depth | Anchor | Bar |
|---|---|---|
| 0 | absent | No passage bears on the behaviour. |
| 2 | named | The behaviour appears, a word or clause, typically inside a list or a passage about something else, but the document says nothing further about it. |
| 4 | discussed | The document addresses the behaviour in its own right, what the norm is and why it matters, but only in terms too general to grade a response against. |
| 6 | prescribed | The document states concrete do and don't rules or procedures for the behaviour, specific enough that a grader could quote the document's own sentences as pass criteria. |
| 8 | demonstrated | Prescribed, plus worked examples: concrete scenarios where the document shows the sanctioned response, usable as an answer key for borderline cases. |
| 10 | bounded | Demonstrated, and for this behaviour the document meets all three conditions below, for every facet of the behaviour that the Definition and Clarifications name. |

**Odd values.** An odd number means the level below is fully met and the level
above is met only in part. 9 is demonstrated with the conditions met only in
part: for some facets, or only one or two of them. 7 is prescribed with examples
that do not yet serve as an answer key, because they are too few or they test a
neighbouring behaviour. 5 is discussed with some rules precise enough to quote,
too few to grade most responses. 3 is named with a sentence or two about the
behaviour itself. 1 is a passage that bears on the behaviour only indirectly. An
odd value needs its rationale to name which part of the level above is met; a
judge that cannot name one gives the even value below. When in doubt between two
values, the judge gives the lower.

**The three conditions for 10.** The Definition and Clarifications are fields
of the behaviour's brief, which the judge is given.

1. **The edge is shown.** Two cases that differ in one feature the document names receive opposite sanctioned responses, so a reader can see what makes the response change.
2. **A conflict is settled.** The document names another of its own rules that pulls against this behaviour, says which prevails and under what condition, and shows it on a case, in the passages the panel cited for the behaviour. A general rule for conflicts does not meet this on its own, and neither does an instruction to weigh the considerations together or to follow the document's spirit.
3. **A default for the undecidable case.** The document says what to do when the model cannot tell which side of the edge it is on, because intent is unclear, a claim cannot be checked or context is missing, or it orders the acceptable second-best responses from best to worst.

Each condition must hold for every facet the Definition and Clarifications name.
One pair of cases, one settled conflict or one default that covers a single facet
meets that condition for that facet only.

### Boundary tests

- **4 or 6, the grading test:** could an evaluation score a transcript by quoting the document, or would the grader have to invent the standard? If invent, it is 4.
- **6 or 8, what counts as a worked example:** a concrete scenario for which the document states the sanctioned response, specific enough to adapt into an evaluation item. Format does not matter: a request and response block and a case described in prose both count. An example of a neighbouring behaviour, or a lone illustration of a broader norm, does not.
- **8 or 10:** could a grader decide a borderline case the document does not show by quoting the document? If only by analogy with the cases it does show, it is 8 or 9.
- **A dedicated section is evidence, not a requirement.** Any level can be reached by passages spread across sections, and a dedicated section written only in general terms does not reach 6.
- **Depth is independent of authority level.** A default or a guideline can cover a behaviour as deeply as a hard rule. Note authority in the rationale where it matters.

### What the judge is shown

Two blocks of passages, each passage with its section path. The first holds
every passage the panel cited for the behaviour in that document, at whatever
band, which is what the reader shows by default: it is the judge's evidence, and
the judge is told not to assume the document says anything it does not show. The
second holds the passages in which the document states its general rules for
conflicts between its own rules, taken from the assessment of the document as a
whole (`methodology/document-assessment-rubric.md`): the passages at least two of
its three judges cited under its first criterion. They show what the general
rules say, and never meet the second condition on their own. A depth on this
scale is therefore given after its document has been assessed, and each depth
records which assessment supplied its block.

## The scale of four, for publications before the scale of ten

Every publication made before the scale of ten gives its depths on this scale,
and each still shows them on it.

### What the judge was shown

The passages the panel cited for the behaviour in that document, each with its
section path, and nothing else: not the document, not a shortlist of the
strongest citations. The passages are the ones the reader shows by default,
which is every banded passage (defining, core and related, the three bands the
reader opens on), so the judge and the reader are looking at the same evidence.

A depth is therefore a reading of the panel's own citations, not of the whole
document. A behaviour the panel cited thinly is scored on what was cited, and a
figure can move because a passage changed band without the document changing a
word. The judge is told this and told not to assume the document says anything
the passages do not show.

| Depth | Anchor | Bar |
|---|---|---|
| 0 | absent | No passage bears on the behaviour. |
| 1 | named | The behaviour appears, a word or clause, typically inside a list or a passage about something else, but the spec says nothing further about it. |
| 2 | discussed | The spec addresses the behaviour in its own right, what the norm is and why it matters, but only in terms too general to grade a response against. |
| 3 | prescribed | The spec states concrete do/don't rules or procedures for the behaviour, specific enough that a grader can quote the spec's own sentences as pass criteria. |
| 4 | demonstrated | Prescribed, plus worked examples: concrete scenarios where the spec shows the sanctioned response, usable as an answer key for borderline cases. |

### Boundary tests

- **2 or 3, the grading test:** could an eval score a transcript by quoting the spec, or would the grader have to invent the standard? If invent, it is a 2.
- **3 or 4, what counts as a worked example:** a concrete scenario for which the spec states the sanctioned response or act, specific enough for an eval item to adapt. Format is irrelevant: the model spec's request and response blocks and the constitution's inline prose cases (the nurse and medication case and its five deployment-context variants, the Aria persona rulings, the graded operator-instruction triple) qualify equally, so the constitution's principled style is not itself a cap on depth. What does not count: an example instantiating a neighbouring construct rather than this behaviour's own (behaviour 3: none of the model spec's examples test a report of the assistant's own actions), or a lone illustration attached to a parent norm (behaviour 1: the gift white-lie case examples the general white-lie rule, while the claim-shifting construct itself is unexampled).
- **A dedicated section is evidence, not a requirement.** Any level can be reached by passages scattered across sections; likewise a dedicated section with only general language does not clear 3.
- **Depth is scored on every passage the panel cited**, at whatever band, since that is what a reader of the index sees. Until 16 September 2026 the judge was shown the defining and core bands only, and a passage one point under the core cut was invisible to it while the reader had it on the page.
- **Depth is independent of authority level.** Note authority in the rationale where it matters (behaviour 2 precedent: the model spec's dedicated calibration section carries only guideline authority).

### Precedent

All scores assigned before this rubric existed were re-checked against it on
2026-07-20 (Gate 4 of behaviour 3); all six stand unchanged.

| Behaviour | Spec | Depth | Under the rubric |
|---|---|---|---|
| 1 no-sycophancy | constitution | 3 | prescribed (avoid-sycophancy and no-white-lies rules; the gift case examples the parent white-lie norm, the claim-shifting construct itself is unexampled) |
| 1 no-sycophancy | model spec | 4 | demonstrated (invariance rule plus three worked examples) |
| 2 calibration | constitution | 3 | prescribed (the two-directional Calibrated rule is a quotable pass criterion; no examples) |
| 2 calibration | model spec | 4 | demonstrated (outcome ranking plus eight worked examples) |
| 3 action-honesty | constitution | 3 | prescribed (enumerated oversight prohibitions and the no-sandbagging rule; no examples of action reports) |
| 3 action-honesty | model spec | 3 | prescribed (stop-and-escalate, audit-trail, and error-acknowledgment rules; no examples test an action report) |
```

- [ ] **Step 4: Create the assessment rubric**

Create `methodology/document-assessment-rubric.md`:

```markdown
# Document assessment rubric

How a document is assessed as a whole, as of September 2026. A publication on
the depth scale of ten carries it for every document it holds; one on the scale
of four carries none. The three judges of the panel that gives depths each read
the whole document, as numbered passages with their section paths, and answer
two questions in calls of their own: four criteria in one, and the document's
unresolved contradictions in the other. Nothing is scored by hand.

The judges read `engine/panel/prompts/assessment-criteria-v1.txt`,
`assessment-contradictions-v1.txt` and `assessment-confirm-v1.txt`, and
`engine/assess.py` runs them. Each criterion is scored from 0 to 4: the
descriptions at 0, 2 and 4 are the levels, 1 and 3 mean between the two levels
around them, and a judge in doubt between two values gives the lower. The
questions below are the prompts' own words, and `engine/panel/test_site_rubrics.py`
holds this file and the overview's copy (`site/document-assessment.js`) to them.

The total is out of 20: the mean of the three judges on each of the four
criteria, plus the contradictions' score, rounded once.

## Conflict rules

What the document says, in general, when two of its own rules conflict.

- 0: Nothing.
- 2: An order of priority between its rules that the document asks to be weighed as a whole, or an instruction to settle conflicts by judgement or by the document's spirit. Either is at most 2, however detailed.
- 4: A strict order that decides who wins whenever two ranks conflict, a rule for two rules of the same rank that names a winner or an outcome, and examples of the order applied.

Each judge also lists the passages that state these general rules. Those at
least two of the three judges cited are the block of conflict rules a depth out
of ten is shown.

## Force of each rule

Whether a reader can tell, for each rule, if it is absolute or a default that can be changed, and by whom.

- 0: The document does not separate absolute rules from defaults.
- 2: It lists its absolute rules, or labels some sections, but for much of the text a reader cannot tell a rule from a hope or an explanation.
- 4: Every rule carries its force, including who may change it, and commentary is marked apart from instruction.

## Reasons given

Whether the rules say why they exist.

- 0: Rules are stated without reasons.
- 2: Some rules carry a reason, typically the most restrictive ones.
- 4: Nearly every rule that constrains the model says why, in terms specific enough to decide a case the document does not show.

## Situations covered

Whether the document has rules for the situations in which the model is used.
Six are checked: ordinary conversation; actions the model takes on its own with
tools, such as sending, buying or deleting; images, audio and video; users who
may be minors; other AI agents, as the model's principals or as the party it
deals with; and deployments a business has customised.

- 0: Ordinary conversation only.
- 2: Some of the six have rules of their own, or all six are named and most have none.
- 4: All six have rules of their own.

## Unresolved contradictions

A contradiction here is two passages of the same document that, applied to one concrete situation, require responses that cannot both be given, with nothing in the document saying which prevails.
An example counts as a passage: an example whose approved response breaks a rule
stated elsewhere in the document is a contradiction. A conflict the document
names and settles is not one; it earns its credit under conflict rules.

Each judge lists what it finds, at most eight, each with its two passages, the
situation and why they conflict. Every claim is then put to the judges that did
not find it, who say whether it holds and whether it involves a rule the
document calls absolute. A claim is confirmed when the judges that found it and
the judges that hold it number two or more. The score counts confirmed claims
only:

- 0: Three or more, or any that involves a rule the document calls absolute.
- 2: One or two, neither involving an absolute rule.
- 4: None found.

The list is the judges'. No person has reviewed it, and the overview says so
beside it.
```

- [ ] **Step 5: Run the methodology test**

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `OK`.

- [ ] **Step 6: Update the pages and the repository's own descriptions**

In `site/about.html`, replace

```html
    specification covers each behaviour, on a scale from 0 to 4. The second,
```

with

```html
    specification covers each behaviour, on a scale from 0 to 10 (from 0 to 4 on a publication
    made before that scale), and, on a publication out of ten, how each document holds together
    as a whole, out of 20. The second,
```

Replace

```html
      <dt>Depth</dt>
      <dd>
        <p>How far a specification goes on one behaviour, from 0, absent, to 4, rules with worked
        examples. Each judge gives one, and the index shows their mean.</p>
      </dd>
```

with

```html
      <dt>Depth</dt>
      <dd>
        <p>How far a specification goes on one behaviour, from 0, absent, to 10, bounded. Each
        judge gives one, and the index shows their mean. Publications made before the scale of
        ten gave it from 0, absent, to 4, rules with worked examples, and still show it that
        way.</p>
      </dd>
      <dt>The document as a whole</dt>
      <dd>
        <p>How well a specification is built as a set of rules, scored on five criteria from 0
        to 4 each, for a total out of 20. Only publications on the scale of ten carry it.</p>
      </dd>
```

Replace

```html
    <p>Each judge then gives the document one depth for the behaviour, on a scale from 0, absent,
    to 4, rules with worked examples. The index publishes the mean of the three.</p>
```

with

```html
    <p>Each judge then gives the document one depth for the behaviour, on a scale from 0 to 10.
    The even numbers are levels: 0, absent; 2, named; 4, discussed; 6, prescribed, with rules
    precise enough to grade against; 8, demonstrated, with worked examples; and 10, bounded,
    where for every facet of the behaviour the document shows two cases that get opposite
    answers, settles its conflict with another rule on a case, and says what to do when a case
    cannot be told apart. An odd number means the level below is fully met and the level above
    only in part. The index publishes the mean of the three. Publications made before this scale
    gave depth from 0, absent, to 4, rules with worked examples, and each still shows its
    figures on the scale it was given on.</p>
    <p>The same three judges also read each document whole and score it on five criteria, each
    from 0 to 4: whether it says who wins when two of its rules conflict, whether each rule says
    if it is absolute or a default and who may change it, whether its rules give their reasons,
    whether it has rules for six situations a model is used in, and whether it contradicts
    itself without saying which passage prevails. The total is out of 20. The contradictions
    are the judges&rsquo; list, not reviewed by a person: each was found by one judge and put to
    the other two, and it is confirmed when two of the three found it or hold it. The overview
    shows each document&rsquo;s total under its grid, with every judge&rsquo;s score and reason
    behind it.</p>
```

Replace

```html
    they made different choices. A depth measures how much a document gives an evaluation to work
    with.</p>
```

with

```html
    they made different choices. A depth measures how much a document gives an evaluation to work
    with. The assessment of a document as a whole says how well its rules are built, not whether
    they are the right rules.</p>
```

Replace

```html
    <p>A local run gives the passages and each judge&rsquo;s verdict on them, but it does not ask
    for the 0 to 4 depth or build a site. Publishing an index with fixed citations and a coverage
```

with

```html
    <p>A local run gives the passages and each judge&rsquo;s verdict on them, but it does not ask
    for a depth, assess the document as a whole or build a site. Publishing an index with fixed citations and a coverage
```

Leave the change log entry for `07958c5e` as it is: it is a dated record, and it was on 0 to 4.

In `site/mcp.html`, replace

```html
    marked the passages. A <b>depth</b> is the score those judges give a document for a behaviour,
    from 0, absent, to 4, rules with worked examples: it says how much the document gives an
    evaluation to work with, not how much the company behind it cares.</p>
```

with

```html
    marked the passages. A <b>depth</b> is the score those judges give a document for a behaviour:
    from 0, absent, to 10, bounded, where the answer gives <code>depth.scale</code> as 10, and
    from 0, absent, to 4, rules with worked examples, where it gives no scale, as on every
    publication before the scale of ten. It says how much the document gives an evaluation to
    work with, not how much the company behind it cares.</p>
```

In the `list_model_specs` paragraph, replace

```html
    <code>openai--model-spec@2026-08-18</code>, which is also the head of every locator into
    it.</p>
```

with

```html
    <code>openai--model-spec@2026-08-18</code>, which is also the head of every locator into
    it. On a publication on the scale of ten each specification also carries its assessment as a
    whole: five criteria the panel scored from 0 to 4, each judge&rsquo;s score and reason, the
    contradictions the judges listed, which no person has reviewed, and the total out of 20.</p>
```

Replace

```html
          specification pair carries a depth, it comes back as the mean the index&rsquo;s panel
          gave it, on a scale from 0, absent, to 4, rules with worked examples. A pair with no
          depth comes back with <code>null</code>.</li>
```

with

```html
          specification pair carries a depth, it comes back as the mean the index&rsquo;s panel
          gave it: out of 10 where <code>depth.scale</code> says 10, and out of 4, from 0, absent,
          to 4, rules with worked examples, where the depth carries no scale. A pair with no depth
          comes back with <code>null</code>.</li>
```

In `README.md`, replace

```markdown
`deepseek`), under rubric v5. Each judge marks the passages that bear on the
behaviour, then gives the document a 0 to 4 depth on the
[depth rubric](methodology/spec-coverage-depth-rubric.md), and the publication
carries the mean. When a judge cannot answer a cell at all, a model declared for
```

with

```markdown
`deepseek`), under rubric v5. Each judge marks the passages that bear on the
behaviour, then gives the document a depth on the
[depth rubric](methodology/spec-coverage-depth-rubric.md), and the publication
carries the mean: from 0 to 10 on a publication on the scale of ten, and from 0
to 4 on one made before it. A payload says which it is on. A publication on the
scale of ten also carries an assessment of each document as a whole, five
criteria the same panel scores from 0 to 4 for a total out of 20, on the
[document assessment rubric](methodology/document-assessment-rubric.md); its
contradictions are the judges' list, not reviewed by a person. When a judge cannot answer a cell at all, a model declared for
```

Replace `does not ask for the 0 to 4 depth, and it does not give you the published index:` with `does not ask for a depth or assess the document as a whole, and it does not give you the published index:`.

After the "Judging" paragraph that ends `each judge gives the cell a 0 to 4 depth in a small call of its own.`, add a paragraph:

```markdown
A publication on the scale of ten takes two passes more, both from the command
line and both priced before they spend. `engine/assess.py` assesses each
document as a whole. `engine/panel/depth_pass.py --runs=<run id>,... --assessment-run=<id>`
then gives every done call of those runs a depth from 0 to 10, shown the
document's general rules for conflicts as that assessment found them.
`engine/publish.py` builds from them when `--depth-prompt` names the prompt of
ten and `--assessment-run` names the assessment. The portal names neither, so
what it publishes stays on the scale of four.
```

In `AGENTS.md`, replace

```markdown
  rubric v5. Each judge also gives a 0 to 4 depth per cell, and a publication
  carries the mean. Declared substitutes for a seat are in
```

with

```markdown
  rubric v5. Each judge also gives a depth per cell, and a publication carries
  the mean: from 0 to 10 on a publication on the scale of ten, which also
  carries each document's assessment as a whole, and from 0 to 4 on every one
  before it. Declared substitutes for a seat are in
```

In `SYSTEM.md`, replace

```markdown
   cell's passages are in, each judge gives it a 0 to 4 depth in a call of its
   own; a publication carries the mean.
```

with

```markdown
   cell's passages are in, each judge gives it a 0 to 4 depth in a call of its
   own. A later pass (`engine/panel/depth_pass.py`) can give it a 0 to 10 depth
   against an assessment of the document as a whole (`engine/assess.py`), and a
   publication carries the mean on the scale it was built on.
```

In `CITATION.cff`, replace `behaviour and gives the document a 0 to 4 depth, and every citation is` with `behaviour and gives the document a depth, 0 to 10 or, on publications before that scale, 0 to 4, and every citation is`.

In `methodology/OVERVIEW.md`:
- In Purpose, replace `the rubric that anchors every 0–4 depth score` with `the rubrics that anchor every depth, on the scale of ten and on the scale of four before it, and the assessment of a document as a whole`.
- Replace the `spec-coverage-depth-rubric.md` Contents row with:

```markdown
| `spec-coverage-depth-rubric.md` | The canonical depth rubric: the scale of ten (six anchors on the even numbers, 0 absent to 10 bounded, odd values, the three conditions for 10, boundary tests, what the judge is shown), held to `engine/panel/prompts/depth-v2.txt` by `engine/panel/test_site_rubrics.py`; then the scale of four every earlier publication used, with its boundary tests and precedent table |
| `document-assessment-rubric.md` | The five criteria a document is assessed on as a whole, each 0 to 4 for a total out of 20, in the words of `engine/panel/prompts/assessment-*-v1.txt`, and how a contradiction is confirmed |
```

- In Relationships, replace `anchors the 0 to 4 depth each judge of the panel gives per behaviour per document in its own call (`engine/panel/depth_call.py`, whose prompt `engine/panel/prompts/depth-v1.txt` restates the scale and its boundary tests); a publication carries the mean.` with `anchors the depth each judge of the panel gives per behaviour per document in its own call: 0 to 10 through `engine/panel/depth_pass.py` and `depth-v2.txt`, 0 to 4 through `engine/panel/depth_call.py` and `depth-v1.txt`; a publication carries the mean.`
- In the mermaid map, replace `-->|anchors depth 0-4|` with `-->|anchors depth 0 to 10, and 0 to 4 before it|`.
- In As-is observations, replace the first bullet with: `- The rubric's canonical location is methodology/spec-coverage-depth-rubric.md. The depth prompts restate it rather than reading it; for the scale of ten engine/panel/test_site_rubrics.py fails when the table, the conditions or the line on odd values leaves the prompt's words, so a change of substance lands in both, and the changed prompt carries a new digest on the depths that use it.`

- [ ] **Step 7: Run everything offline**

Run: `python3 engine/panel/test_site_rubrics.py`
Expected: `OK`.

Run: `python3 -m unittest discover -s tests`
Expected: `OK`. `tests/test_governance_tab.py` reads `site/overview.html` and is unaffected.

Run: `node --test app/lib/__tests__/*.test.mjs`
Expected: `# fail 0`.

Run: `grep -n -e "0 to 4 depth" README.md AGENTS.md CITATION.cff`
Expected: only the kept `README.md` Judging sentence about the run's own depth.

- [ ] **Step 8: Commit**

```bash
git add methodology/spec-coverage-depth-rubric.md methodology/document-assessment-rubric.md \
  methodology/OVERVIEW.md engine/panel/test_site_rubrics.py site/about.html site/mcp.html \
  README.md AGENTS.md SYSTEM.md CITATION.cff
git commit -m "docs: the scale of ten and the assessment, on the site and in the rubric" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```

---

### Task 6: A payload fixture of ten, and walker checks for the grid, the row and the reader

**Files:**
- Create: `tests/fixtures/reader/ten/behaviours.json`
- Modify: `engine/reader-routes.mjs`
- Modify: `engine/verify-reader-features.mjs` (import; governance section at about 1985-2060; two new sections)
- Modify: `engine/panel/test_build_site_data.py` (append a class)
- Modify: `tests/README.md` (header note)

**Interfaces:**
- Consumes: every earlier task's DOM: `#legend-list`, `#legend-odd`, `.scale-conditions`, `#grid .whole-row`, `.cell-max`, the sheet classes from Task 2, `.depth-note-scale-ten`, `.depth-note-conditions` and `.depth-note-odd` from Task 3.
- Produces: `export const TEN_PUBLICATION = "c3a5e0d2-9f47-4b8e-a1d6-5e2f7b9c0a14"` in `engine/reader-routes.mjs`, answered only to a pin. Its payload is `tests/fixtures/reader/ten/behaviours.json`, and its documents and links are the current publication's.

- [ ] **Step 1: Write the failing fixture shape test**

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
    pages are never tested against a shape no publication has."""

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

    def test_each_claim_is_settled_and_scored_by_the_run_s_rule(self):
        for assessed in self.fixture["assessment"].values():
            claims = assessed["contradictions"]["claims"]
            for claim in claims:
                found = sum(reading["found"] for reading in claim["readings"])
                held = sum(reading["holds"] for reading in claim["readings"] if not reading["found"])
                self.assertEqual(claim["confirmed"], found + held >= 2)
            self.assertEqual(assessed["contradictions"]["score"],
                             assessment_run.confirm_score(claims))
```

- [ ] **Step 2: Write the failing walker checks**

In `engine/verify-reader-features.mjs`, change the import to:

```js
import { serveReaderRoute, serveFeedbackRoute, lastFeedbackReceived,
         servePageFeedbackRoute, lastPageFeedbackReceived,
         CURRENT_PUBLICATION, DRAFT_PUBLICATION, TEN_PUBLICATION } from "./reader-routes.mjs";
```

In the section `== Overview: the governance view ==`, directly after the check `"the scores run down from the total, the checks folded, the eight findings under the table"`, add:

```js
  // The grid's depths went to ten; this view paints over its own 4, so not one
  // of its colours moved. 23 of 40 is OpenAI's total, the first on the board.
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

Directly before `console.log("== Every page: the feedback bubble ==");`, add:

```js
// =============================================================================
console.log("== Overview: the grid on the scale of four and on the scale of ten ==");
/* The grid reads its scale from the publication. The current fixture is out of
 * four and must render as it always did; the publication of ten, answered to a
 * pin, is out of ten and carries the document as a whole. */
{
  const root = new URL("/", base).href;
  const S1 = "corpus@2026-01-01 > #sentences > ¶1";
  const S2 = "corpus@2026-01-01 > #sentences > ¶2";
  const B2 = "corpus@2026-01-01 > #blocks > ¶2";
  const DASH = "\u2013";
  const openGrid = async query => {
    pageErrors = [];
    await page.goto(`${root}${query}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#grid tbody tr").length > 0,
      undefined, { timeout: 10000 }).catch(() => {});
  };
  const readGrid = () => page.evaluate(() => {
    const rowOf = name => [...document.querySelectorAll("#grid tbody tr")]
      .find(tr => tr.querySelector("th")?.textContent === name);
    const cell = (name, column) => {
      const button = rowOf(name)?.querySelectorAll("td")[column]?.querySelector(".cell-button");
      return button ? { text: button.querySelector(".cell-figure")?.textContent ?? "",
                        label: button.getAttribute("aria-label"),
                        background: getComputedStyle(button).backgroundColor,
                        color: getComputedStyle(button).color } : null;
    };
    const odd = document.querySelector("#legend-odd");
    const whole = document.querySelector("#grid .whole-row");
    return {
      levels: [...document.querySelectorAll("#legend-list > li .level")].map(n => n.textContent),
      anchors: [...document.querySelectorAll("#legend-list > li .scale-head")]
        .map(head => head.lastChild.textContent),
      bars: [...document.querySelectorAll("#legend-list > li .scale-bar")].map(n => n.textContent),
      conditions: [...document.querySelectorAll("#legend-list .scale-conditions li")]
        .map(n => n.textContent),
      odd: odd && !odd.hidden ? odd.textContent : null,
      definedCorpus: cell("Defined behaviour", 0),
      definedSecond: cell("Defined behaviour", 1),
      undefinedCorpus: cell("Undefined behaviour", 0),
      deepest: [...document.querySelectorAll("#grid tbody tr:not(.whole-row) .cell-button")]
        .filter(button => getComputedStyle(button).backgroundColor === "rgb(76, 140, 63)")
        .map(button => button.querySelector(".cell-figure").textContent),
      whole: whole ? {
        name: whole.querySelector("th")?.textContent,
        figures: [...whole.querySelectorAll("td")]
          .map(td => td.querySelector(".cell-figure")?.textContent ?? td.textContent),
        labels: [...whole.querySelectorAll(".cell-button")].map(b => b.getAttribute("aria-label")),
        backgrounds: [...whole.querySelectorAll(".cell-button")]
          .map(b => getComputedStyle(b).backgroundColor),
      } : null,
    };
  });
  const readSheet = () => page.evaluate(() => ({
    open: document.querySelector("#sheet").open,
    title: document.querySelector("#sheet-title").textContent,
    body: document.querySelector("#sheet-body").textContent,
    headings: [...document.querySelectorAll("#sheet-body h3")].map(h => h.textContent),
    statuses: [...document.querySelectorAll("#sheet-body .claim-status")].map(n => n.textContent),
    links: [...document.querySelectorAll("#sheet-body .claim-passage a")]
      .map(a => a.getAttribute("href")),
    readings: [...document.querySelectorAll("#sheet-body .claims .judges li")]
      .map(li => li.textContent.replace(/\s+/g, " ").trim()),
    notice: document.querySelector("#sheet-body .notice")?.textContent ?? null,
  }));
  const press = (selector, index = 0) => page.evaluate(([selector, index]) =>
    document.querySelectorAll(selector)[index].click(), [selector, index]);
  const pressCell = (name, column) => page.evaluate(([name, column]) =>
    [...document.querySelectorAll("#grid tbody tr")]
      .find(tr => tr.querySelector("th")?.textContent === name)
      .querySelectorAll("td")[column].querySelector("button").click(), [name, column]);
  const closeSheet = () => page.evaluate(() => document.querySelector("#sheet").close());

  await openGrid("");
  const four = await readGrid();
  check(four.levels.join() === "0,1,2,3,4" && four.odd === null && four.conditions.length === 0,
    "on the scale of four the legend is its five levels, with no line on odd figures",
    JSON.stringify({ levels: four.levels, odd: four.odd }));
  check(four.definedCorpus?.label === "Defined behaviour in Acme: 2.7 out of 4, prescribed"
      && four.definedCorpus?.background === "rgb(168, 154, 47)"
      && four.definedCorpus?.color === "rgb(241, 239, 227)",
    "on the scale of four a cell says out of 4 and wears the colour it always wore",
    JSON.stringify(four.definedCorpus));
  check(four.whole === null, "a publication out of four has no row for the document as a whole",
    JSON.stringify(four.whole));
  check(pageErrors.length === 0, "the grid out of four: no console errors", pageErrors.join("; "));

  await openGrid(`?publication=${TEN_PUBLICATION}`);
  const ten = await readGrid();
  check(ten.levels.join() === "0,2,4,6,8,10"
      && ten.anchors.join() === "absent,named,discussed,prescribed,demonstrated,bounded",
    "on the scale of ten the legend is its six anchors, on the even numbers",
    JSON.stringify([ten.levels, ten.anchors]));
  check(ten.bars[0] === "No passage bears on the behaviour."
      && ten.bars[5].includes("all three conditions below")
      && ten.conditions.join(" | ")
        === "The edge is shown. | A conflict is settled. | A default for the undecidable case."
      && ten.odd === "An odd number means the level below is fully met and the level above is"
        + " met only in part.",
    "each level carries its bar, 10 its three conditions, and one line says what an odd figure means",
    JSON.stringify({ bars: ten.bars, conditions: ten.conditions, odd: ten.odd }));
  check(ten.definedCorpus?.text === "7.3"
      && ten.definedCorpus?.label
        === "Defined behaviour in Acme: 7.3 out of 10, prescribed and partly demonstrated"
      && ten.definedCorpus?.background === "rgb(152, 152, 50)",
    "a cell out of ten says so, names the level met and the next, and is coloured over ten",
    JSON.stringify(ten.definedCorpus));
  check(ten.definedSecond?.label === "Defined behaviour in Acme: 4.0 out of 10, discussed"
      && ten.definedSecond?.background === "rgb(210, 144, 41)",
    "an even figure out of ten takes its anchor", JSON.stringify(ten.definedSecond));
  check(ten.undefinedCorpus?.background === "rgb(76, 140, 63)" && ten.deepest.join() === "10.0",
    "the deepest green is the top of the scale and nothing below it", JSON.stringify(ten.deepest));

  await pressCell("Defined behaviour", 0);
  let sheet = await readSheet();
  check(sheet.open && sheet.body.includes("7.3 out of 10, prescribed and partly demonstrated."),
    "a cell out of ten opens on its figure out of 10 and its words", sheet.body.slice(0, 120));
  await closeSheet();

  check(ten.whole?.name === "The document as a whole"
      && ten.whole.figures.join("|")
        === ["12.0", "17.3", DASH, "", "", "", "", "", "", DASH, DASH].join("|")
      && ten.whole.labels.join(" | ") === "Acme, the document as a whole: 12.0 out of 20"
        + " | Acme, the document as a whole: 17.3 out of 20"
      && ten.whole.backgrounds.join(" | ") === "rgb(189, 158, 44) | rgb(114, 146, 57)",
    "the row at the foot gives each document its total out of 20, and a company with no"
      + " specification nothing", JSON.stringify(ten.whole));

  await press("#grid .whole-row td .cell-button", 0);
  sheet = await readSheet();
  check(sheet.title === "Acme: the document as a whole" && sheet.body.includes("12.0 out of 20.")
      && sheet.headings.join(" | ") === "Conflict rules | Force of each rule | Reasons given"
        + " | Situations covered | Unresolved contradictions"
      && sheet.body.includes("3.3 out of 4"),
    "a total opens the five criteria, each with its mean out of 4", JSON.stringify(sheet.headings));
  check(sheet.body.includes("d in b's seat gave 3")
      && sheet.body.includes("A strict order, a rule for equal ranks, and examples."),
    "every judge's score and reason is there, and a substitute is named in its seat",
    sheet.body.slice(0, 200));
  check(sheet.notice?.startsWith("This is the judges' list, not reviewed by a person."),
    "the list says it is the judges' and that no person has reviewed it", String(sheet.notice));
  check(sheet.statuses.join(" | ") === "Confirmed. It involves no rule the document calls absolute."
      + " | Not confirmed. It involves no rule the document calls absolute.",
    "confirmed contradictions come first, and the unconfirmed follow, marked as such",
    JSON.stringify(sheet.statuses));
  const links = sheet.links.map(href => new URL(href, root));
  check(links.length === 4
      && links.every(url => url.pathname === "/spec-reader/"
        && url.searchParams.get("publication") === TEN_PUBLICATION)
      && links.map(url => url.searchParams.get("passage")).join(" | ") === [S2, B2, S1, S2].join(" | "),
    "each claim quotes both its passages, each a link into the reader on that passage",
    JSON.stringify(sheet.links));
  check(sheet.readings.includes("c found it.")
      && sheet.readings.some(line => line.startsWith("d in b's seat does not hold;"))
      && sheet.readings.some(line => line.startsWith("a holds; involves no rule")),
    "each judge's reading says found or not, holds or not, absolute or not, and who sat in the seat",
    JSON.stringify(sheet.readings));
  await closeSheet();

  await press("#grid .whole-row td .cell-button", 1);
  sheet = await readSheet();
  check(sheet.body.includes("17.3 out of 20.") && sheet.body.includes("The judges listed none.")
      && sheet.statuses.length === 0,
    "a document with no contradictions says the judges listed none", sheet.body.slice(0, 160));
  await closeSheet();

  await press("#grid .whole-row th button");
  sheet = await readSheet();
  check(sheet.title === "The document as a whole"
      && ["Conflict rules", "Force of each rule", "Reasons given", "Situations covered",
          "Unresolved contradictions"].every(name => sheet.headings.includes(name)),
    "the row's name opens what the five criteria ask", JSON.stringify(sheet.headings));
  await closeSheet();
  check(pageErrors.length === 0, "the grid out of ten: no console errors", pageErrors.join("; "));

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

// =============================================================================
console.log("== Reader: the depth scale of ten ==");
{
  const figure = `[data-behaviour-depth="${DEFINED}"]`;
  const readFigure = () => page.evaluate(selector => {
    const cell = document.querySelector(selector);
    return {
      heads: [...document.querySelectorAll(".depth-head")].map(head => head.textContent),
      text: cell?.textContent,
      title: cell?.title,
      spoken: cell?.closest(".behaviour-option-row")?.querySelector(".depth-spoken")?.textContent,
    };
  }, figure);

  await at(`?publication=${TEN_PUBLICATION}&behavior=${DEFINED}&spec=${DOC_ID}`);
  const seen = await readFigure();
  check(seen.heads.length > 0 && seen.heads.every(head => head === "Depth, out of 10"),
    "on a publication out of ten the column's heading says so", JSON.stringify(seen.heads));
  check(seen.text === "7.3" && seen.spoken === "depth 7.3 out of 10"
      && seen.title === "Parser corpus 2026-01-01: 7.3 out of 10, prescribed and partly demonstrated.",
    "the figure stays bare, and its title and spoken form say out of 10", JSON.stringify(seen));

  await page.locator(".depth-head").first().click();
  await page.waitForTimeout(250);
  const scale = await page.evaluate(() => ({
    title: document.querySelector("#depth-note-title")?.textContent,
    levels: [...document.querySelectorAll("#depth-note-body .depth-note-scale > li")]
      .map(li => `${li.querySelector(".depth-note-level").textContent} `
        + li.querySelector(".depth-note-anchor").textContent),
    conditions: [...document.querySelectorAll("#depth-note-body .depth-note-conditions li")]
      .map(li => li.textContent),
    odd: document.querySelector("#depth-note-body .depth-note-odd")?.textContent ?? null,
  }));
  check(scale.title === "Depth, out of 10"
      && scale.levels.join(", ")
        === "0 absent, 2 named, 4 discussed, 6 prescribed, 8 demonstrated, 10 bounded"
      && scale.conditions.length === 3
      && scale.odd === "An odd number means the level below is fully met and the level above is"
        + " met only in part.",
    "the scale note gives the six anchors, what 10 asks and what an odd figure means",
    JSON.stringify(scale));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  await page.click(figure);
  await page.waitForTimeout(250);
  const cell = await page.evaluate(() => ({
    body: document.querySelector("#depth-note-body")?.textContent ?? "",
    judges: [...document.querySelectorAll("#depth-note .depth-note-judges li")]
      .map(li => li.textContent),
  }));
  check(cell.body.includes("7.3 out of 10, prescribed and partly demonstrated.")
      && cell.judges.length === 3 && cell.judges.every(line => /^[abc] (10|[0-9]) \S/.test(line)),
    "a figure opens its cell out of 10, with each judge's own 0 to 10",
    `${cell.body.replace(/\s+/g, " ").slice(0, 100)} | ${cell.judges.join(" | ")}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  await at(`?publication=${TEN_PUBLICATION}&behavior=${DEFINED}&compare=1`);
  const compared = await readFigure();
  check(compared.text === "7.3 / 4.0" && compared.spoken === "depth 7.3 out of 10 and 4.0 out of 10",
    "comparing, each document's figure is spoken out of 10", JSON.stringify(compared));
  check(pageErrors.length === 0, "the reader out of ten: no console errors", pageErrors.join("; "));
}
```

- [ ] **Step 3: Run both to verify they fail**

Run: `python3 engine/panel/test_build_site_data.py ReaderFixtureOfTenTest`
Expected: four errors, `FileNotFoundError` for `tests/fixtures/reader/ten/behaviours.json`.

Run: `node engine/verify-reader-features.mjs`
Expected: it stops at start with `SyntaxError: The requested module './reader-routes.mjs' does not provide an export named 'TEN_PUBLICATION'`.

- [ ] **Step 4: Answer the publication of ten**

In `engine/reader-routes.mjs`, after `DRAFT_PUBLICATION`, add:

```js
/**
 * A publication on the depth scale of ten, answered only to a pin: the current
 * publication's documents and links under a payload out of ten, which carries
 * an assessment of two of its documents. Only its payload differs, so it reads
 * the other two files from the current publication's directory.
 */
export const TEN_PUBLICATION = "c3a5e0d2-9f47-4b8e-a1d6-5e2f7b9c0a14";
```

Replace the directory map with:

```js
/** Where each publication's files sit, relative to the reader's data directory. */
const PUBLICATION_DIRS = { [CURRENT_PUBLICATION]: ".", [DRAFT_PUBLICATION]: "draft",
                           [TEN_PUBLICATION]: "ten" };

/** The files a publication shares with the current one rather than carrying its own. */
const SHARED_WITH_THE_CURRENT = { [TEN_PUBLICATION]: new Set(["documents.json", "links.json"]) };
```

In `serveReaderRoute`, replace

```js
    const dir = join(dataDir, PUBLICATION_DIRS[pin ?? CURRENT_PUBLICATION]);
```

with

```js
    const shared = SHARED_WITH_THE_CURRENT[pin]?.has(file);
    const dir = join(dataDir, shared ? "." : PUBLICATION_DIRS[pin ?? CURRENT_PUBLICATION]);
```

- [ ] **Step 5: Create the fixture**

Create `tests/fixtures/reader/ten/behaviours.json`:

```json
{
 "generatedFrom": [
  "tests/fixtures/reader/ten (synthetic)"
 ],
 "provenance": {
  "method": "fixture",
  "rubric": "v5",
  "panel_config": "fixture",
  "panel": ["a", "b", "c"],
  "judges_seen_in_data": ["a", "b", "c"],
  "runDate": "2026-01-01",
  "scoring": "per passage: sum over judges of defining=3/core=2/related=1/neither=0"
 },
 "depthScale": 10,
 "assessment": {
  "acme--corpus@2026-01-01": {
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
       {"seat": "a", "found": true, "holds": true, "absolute": null, "reason": "found it"},
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
       {"seat": "c", "found": true, "holds": true, "absolute": null, "reason": "found it"}
      ],
      "confirmed": true,
      "absolute": false,
      "reviewed": null
     }
    ],
    "score": 2
   },
   "total": 12.0
  },
  "acme--second@2026-02-01": {
   "criteria": {
    "conflict_rules": {
     "mean": 4.0,
     "judges": {
      "a": {"score": 4, "rationale": "A strict order that decides every case."},
      "b": {"score": 4, "rationale": "A strict order that decides every case."},
      "c": {"score": 4, "rationale": "A strict order that decides every case."}
     }
    },
    "rule_force": {
     "mean": 4.0,
     "judges": {
      "a": {"score": 4, "rationale": "Every rule says who may change it."},
      "b": {"score": 4, "rationale": "Every rule says who may change it."},
      "c": {"score": 4, "rationale": "Every rule says who may change it."}
     }
    },
    "reasons": {
     "mean": 3.0,
     "judges": {
      "a": {"score": 3, "rationale": "Most rules give a reason."},
      "b": {"score": 3, "rationale": "Most rules give a reason."},
      "c": {"score": 3, "rationale": "Most rules give a reason."}
     }
    },
    "situations": {
     "mean": 2.3,
     "judges": {
      "a": {"score": 2, "rationale": "Some of the six have rules of their own."},
      "b": {"score": 2, "rationale": "Some of the six have rules of their own."},
      "c": {"score": 3, "rationale": "Four of the six have rules of their own."}
     }
    }
   },
   "contradictions": {
    "claims": [],
    "score": 4
   },
   "total": 17.3
  }
 },
 "behaviours": [
  {
   "id": 1,
   "slug": "defined-behaviour",
   "name": "Defined behaviour",
   "definition": "The document should say what it means.",
   "category": "Behaviours under test",
   "coverage": {
    "acme--corpus@2026-01-01": {
     "depth": {
      "mean": 7.3,
      "judges": {
       "a": {"depth": 8, "rationale": "Rules and one worked example that serves as an answer key."},
       "b": {"depth": 7, "rationale": "Rules; the one example tests a neighbouring behaviour."},
       "c": {"depth": 7, "rationale": "Rules; the one example tests a neighbouring behaviour."}
      },
      "scale": 10
     },
     "passages": [
      {
       "id": "corpus-labs-defined-behaviour-1",
       "locator": "corpus@2026-01-01 > Parser corpus > Headings and anchors > A section reached by path > ¶1",
       "quote": "This one has no anchor, so it is named by the path of its ancestors' titles. Both locator styles must resolve, because the index has one document of each kind.",
       "role": "Model determined relevance (score 2/2):\n✓ a — core",
       "adjacent": false,
       "exampleBlock": false,
       "verdicts": {"a": 2},
       "score": 2
      },
      {
       "id": "corpus-labs-defined-behaviour-2",
       "locator": "corpus@2026-01-01 > #sentences > ¶1",
       "quote": "A locator may name a span of sentences, so the splitter has to agree with a reader about where a sentence ends. This paragraph has three. The second one ends here. And the third mentions e.g. an abbreviation, i.e. a token that ends in a full stop without ending a sentence, such as etc. or vs. or approx. and the U.S. and the U.K.",
       "role": "Model determined relevance (score 1/2):\n✓ a — core",
       "adjacent": true,
       "exampleBlock": false,
       "verdicts": {"a": 1},
       "score": 1
      }
     ]
    },
    "acme--second@2026-02-01": {
     "depth": {
      "mean": 4.0,
      "judges": {
       "a": {"depth": 4, "rationale": "Discussed in its own right, too generally to grade."},
       "b": {"depth": 4, "rationale": "Discussed in its own right, too generally to grade."},
       "d": {"depth": 4, "rationale": "Discussed in its own right, too generally to grade."}
      },
      "scale": 10
     },
     "passages": [
      {
       "id": "second-labs-defined-behaviour-1",
       "locator": "second@2026-02-01 > #overview > ¶1",
       "quote": "A second document, so the reader's compare view has two panes to put side by side. It is deliberately short: what it must do is exist, parse, and carry a handful of citable blocks.",
       "role": "Model determined relevance (score 4/4):\n✓ a — core",
       "adjacent": false,
       "exampleBlock": false,
       "verdicts": {"a": 2, "b": 2},
       "score": 4
      }
     ],
     "substitutions": [
      {"seat": "c", "substitute": "d", "reason": "c returned no output for this document on every attempt."}
     ]
    }
   }
  },
  {
   "id": 2,
   "slug": "undefined-behaviour",
   "name": "Undefined behaviour",
   "definition": "Tracked, and defined nowhere.",
   "category": "Behaviours under test",
   "coverage": {
    "acme--corpus@2026-01-01": {
     "depth": {
      "mean": 10.0,
      "judges": {
       "a": {"depth": 10, "rationale": "Demonstrated, with the edge shown, a conflict settled and a default, for every facet."},
       "b": {"depth": 10, "rationale": "Demonstrated, with the edge shown, a conflict settled and a default, for every facet."},
       "c": {"depth": 10, "rationale": "Demonstrated, with the edge shown, a conflict settled and a default, for every facet."}
      },
      "scale": 10
     },
     "passages": [
      {
       "id": "corpus-labs-undefined-behaviour-1",
       "locator": "corpus@2026-01-01 > #sentences > ¶2",
       "quote": "Dr. Smith, Mr. Jones and Ms. Patel walk into a paragraph. No. 4 on the list is vol. 2, cf. the note above. The span arithmetic must count four sentences here and not eleven.",
       "role": "Model determined relevance (score 6/6):\n✓ a — core",
       "adjacent": false,
       "exampleBlock": false,
       "verdicts": {"a": 2, "b": 2, "c": 2},
       "score": 6
      },
      {
       "id": "corpus-labs-undefined-behaviour-2",
       "locator": "corpus@2026-01-01 > #blocks > ¶2",
       "quote": "This is a second block, and it runs across two source lines, which the parser joins into one block because the second line continues the first.",
       "role": "Model determined relevance (score 6/6):\n✓ a — core",
       "adjacent": false,
       "exampleBlock": false,
       "verdicts": {"a": 2, "b": 2, "c": 2},
       "score": 6
      },
      {
       "id": "corpus-labs-undefined-behaviour-3",
       "locator": "corpus@2026-01-01 > #inline > ¶3",
       "quote": "Whitespace collapses, including across lines, so a quote reads as one line however the source was wrapped.",
       "role": "Model determined relevance (score 6/6):\n✓ a — core",
       "adjacent": false,
       "exampleBlock": false,
       "verdicts": {"a": 2, "b": 2, "c": 2},
       "score": 6
      }
     ]
    },
    "acme--second@2026-02-01": {
     "depth": null,
     "passages": [
      {
       "id": "second-labs-undefined-behaviour-1",
       "locator": "second@2026-02-01 > #section-a > ¶1",
       "quote": "A paragraph long enough to be worth citing, with two sentences so a span can name part of it. This is the second sentence.",
       "role": "Model determined relevance (score 3/4):\n✓ a — core",
       "adjacent": true,
       "exampleBlock": false,
       "verdicts": {"a": 2, "b": 1},
       "score": 3
      }
     ]
    }
   }
  }
 ]
}
```

The `role` strings are copied byte for byte from `tests/fixtures/reader/behaviours.json`. They carry the builder's own role text, which is data the fixture reproduces rather than prose written here. The claims' locators are the fixture's own, so a claim link opens a passage a behaviour cites.

In `tests/README.md`, in the header note, replace `and \`reader/\`, the payload and the documents, two of the three payloads the reader's routes serve.` with `and \`reader/\`, the payload and the documents, two of the three payloads the reader's routes serve, with \`reader/ten/\`, a payload on the depth scale of ten that \`engine/reader-routes.mjs\` answers to a pin, beside the current publication's documents and links.`

- [ ] **Step 6: Run everything**

Run: `python3 engine/panel/test_build_site_data.py`
Expected: `OK`.

Run: `node engine/verify-reader-features.mjs`
Expected: every new check prints `PASS`, and the last line is `ALL FEATURE CHECKS PASSED.`

Run: `node engine/verify-reader-test.mjs`
Expected: `All views verified.`

Run the full offline battery:

```sh
python3 -m unittest discover -s engine -p "test_*.py"
python3 -m unittest discover -s engine/panel -p "test_*.py"
python3 -m unittest discover -s tests
node --test app/lib/__tests__/*.test.mjs
```

Expected: `OK`, `OK`, `OK`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/reader/ten/behaviours.json engine/reader-routes.mjs \
  engine/verify-reader-features.mjs engine/panel/test_build_site_data.py tests/README.md
git commit -m "test: a publication out of ten, walked in a browser" \
  -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7"
```
