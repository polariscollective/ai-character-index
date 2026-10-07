# The overview's letter grades: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The overview grid shows each company's two final scores as letters A, B, C, D, F (or None at 0), and loses its Absolute/Relative switch.

**Architecture:** One pure function, `gradeOf(value, grades)` in a new `site/grades.js`, reads a figure out of 10 against thresholds that live in `site/overview.json` (frozen by each publication). The page (`site/overview.js`) and the MCP tool `overview_board` (`app/lib/board-tools.mjs`) both call it, so they cannot disagree. The relative mode's code, markup, styles and file keys are removed.

**Tech Stack:** Plain ES modules in `site/` (served as static files, imported by Node in tests), Next.js routes in `app/`, `node --test` for unit tests, pytest for the text rules.

The spec is `docs/superpowers/specs/2026-10-07-overview-letter-grades-design.md`.

## Global constraints

- Thresholds, exactly: A from 9, B from 8, C from 7, D from 6, F above 0. A figure that prints as `0.0` earns no letter and shows the row's `zero` word, "None".
- The letter is read from the figure rounded to one decimal, the way the page prints it (`value.toFixed(1)`).
- No plus or minus grades.
- Only the overview changes. The boards of the Index (`site/constitutions.js`, `site/governance.js`, `site/boards.html`) and `/coverage` keep their figures out of 10.
- A popover keeps the figure beside the letter. The parts of a final score keep their figure out of 10.
- Everything written in the repository is in English: code, comments, commit messages, file text.
- No long dashes (U+2014, U+2013) anywhere written: code, comments, commits, site text.
- Site copy: British spelling, sentence case, no italics for emphasis.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work happens on `feat/overview-letter-grades`. Nothing is pushed or merged without the owner asking.

## File structure

| file | change | responsibility |
|---|---|---|
| `site/grades.js` | create | `asShown(value)` and `gradeOf(value, grades)`: the letter a figure earns |
| `app/lib/__tests__/grades.test.mjs` | create | unit tests of `site/grades.js` |
| `site/overview.json` | modify | gains `grid.grades`; `grid.scale`, `grid.caption` and the fifth takeaway rewritten; loses `grid.tiers` and `grid.relative_note` |
| `app/lib/board-tools.mjs` | modify | `overviewBoard` answers `grade` per figure and `measures.grades`, drops tiers |
| `app/lib/__tests__/board-tools.test.mjs` | modify | the overview test checks letters, and refuses an overview without grades |
| `app/lib/mcp-tools.mjs`, `app/api/mcp/route.js`, `site/mcp.html` | modify | `overview_board` described with letters |
| `site/overview.js` | modify | cells, legend, popovers in letters; the mode switch removed |
| `site/overview.html` | modify | the Absolute/Relative buttons removed |
| `site/board.css` | modify | the relative mode's styles removed |
| `CLAUDE.md` | modify | the relative mode leaves the list of places a comparison is allowed |

---

### Task 1: The letter a figure earns

**Files:**
- Create: `site/grades.js`
- Test: `app/lib/__tests__/grades.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `asShown(value: number | null | undefined): number`, the figure as the page prints it, as a number; `gradeOf(value: number | null | undefined, grades: Array<{ letter: string, from: number }>): string | null`, the letter of the highest threshold the printed figure reaches, or `null` when it prints as 0.0. `grades` may come in any order.

- [ ] **Step 1: Write the failing test**

Create `app/lib/__tests__/grades.test.mjs`:

```js
/**
 * The letter a final score earns on the overview. site/grades.js touches no
 * page, so node imports the file the browser loads.
 *
 * Run: node --test app/lib/__tests__/grades.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { gradeOf, asShown } from "../../../site/grades.js";

const GRADES = [
  { letter: "A", from: 9 }, { letter: "B", from: 8 }, { letter: "C", from: 7 },
  { letter: "D", from: 6 }, { letter: "F", from: 0 },
];

test("a figure takes the letter of the highest threshold it reaches", () => {
  assert.equal(gradeOf(10, GRADES), "A");
  assert.equal(gradeOf(9, GRADES), "A");
  assert.equal(gradeOf(8.6, GRADES), "B");
  assert.equal(gradeOf(7.6, GRADES), "C");
  assert.equal(gradeOf(6.29, GRADES), "D");
  assert.equal(gradeOf(4.15, GRADES), "F");
  assert.equal(gradeOf(0.77, GRADES), "F");
});

test("the letter is read from the figure as the page prints it", () => {
  // 8.96 prints as 9.0, so it is an A; 8.94 prints as 8.9, a B.
  assert.equal(asShown(8.96), 9);
  assert.equal(gradeOf(8.96, GRADES), "A");
  assert.equal(gradeOf(8.94, GRADES), "B");
  assert.equal(gradeOf(5.96, GRADES), "D");
});

test("a figure that prints as nought earns no letter", () => {
  assert.equal(gradeOf(0, GRADES), null);
  assert.equal(gradeOf(0.04, GRADES), null);
  assert.equal(gradeOf(null, GRADES), null);
  assert.equal(gradeOf(undefined, GRADES), null);
});

test("the order the file lists its grades in does not matter", () => {
  assert.equal(gradeOf(8.2, [...GRADES].reverse()), "B");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test app/lib/__tests__/grades.test.mjs`
Expected: FAIL, `Cannot find module` for `site/grades.js`.

- [ ] **Step 3: Write the module**

Create `site/grades.js`:

```js
/* The letter a final score earns on the overview.
 *
 * The overview shows each final score as a letter rather than a figure out of
 * 10. The thresholds are not here: they are in site/overview.json, which a
 * publication freezes, so a pinned publication keeps the letters it was built
 * with. This module only reads a figure against them, for the page and for the
 * MCP server alike, so the two cannot give one figure two letters.
 *
 * The letter is read from the figure as the page prints it, to one decimal, so
 * a figure printed "9.0" never carries the letter below. A figure that prints
 * as 0.0 earns no letter: the grid says the row's own word for nothing. */

/* The figure as the page prints it, as a number. */
export const asShown = value => Number((value ?? 0).toFixed(1));

/* `grades` is the file's list, each { letter, from }, in any order. */
export function gradeOf(value, grades) {
  const shown = asShown(value);
  if (!(shown > 0)) return null;
  const ordered = [...grades].sort((a, b) => b.from - a.from);
  return ordered.find(grade => shown >= grade.from)?.letter ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test app/lib/__tests__/grades.test.mjs`
Expected: PASS, 4 tests. A warning about the module type of `site/grades.js` may print; the other site modules print it too, and it is not a failure.

- [ ] **Step 5: Commit**

```bash
git add site/grades.js app/lib/__tests__/grades.test.mjs
git commit -m "feat: the overview reads a figure's letter in one function the page and the MCP share

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The file carries the thresholds, and the MCP answers letters

**Files:**
- Modify: `site/overview.json` (the `grid` block near the top, and the fifth takeaway near line 109)
- Modify: `app/lib/board-tools.mjs:14-16` (imports) and `:352-418` (`overviewBoard`)
- Modify: `app/lib/__tests__/board-tools.test.mjs:10` (imports) and `:152-171` (the overview test)
- Modify: `app/lib/mcp-tools.mjs:912-914`, `app/api/mcp/route.js:241-242`, `site/mcp.html:489-491`

**Interfaces:**
- Consumes: `gradeOf`, `asShown` from `site/grades.js` (Task 1).
- Produces: `overview.grid.grades`, exactly `[{ "letter": "A", "from": 9 }, { "letter": "B", "from": 8 }, { "letter": "C", "from": 7 }, { "letter": "D", "from": 6 }, { "letter": "F", "from": 0 }]`, highest first. `overviewBoard(snapshot, args)` answers `measures.grades` (that list), `measures.scale` (the file's scale text), and each company's `figures[]` as `{ row, figure, max: 10, grade }`; it throws `ToolError(INCOMPATIBLE)` when `overview.grid.grades` is not an array.

`grid.tiers` and `grid.relative_note` stay in the file until Task 3, so the page keeps working between the two commits.

- [ ] **Step 1: Write the failing test**

In `app/lib/__tests__/board-tools.test.mjs`, add the import after line 11 (`import { ToolError } from "../mcp-tools.mjs";`):

```js
import { gradeOf, asShown } from "../../../site/grades.js";
```

Replace the whole test that starts `test("the overview answers each company's figures from the two boards, with its tier"` (through its closing `});`) with:

```js
test("the overview answers each company's figures from the two boards, with its letter", async () => {
  const overview = JSON.parse(await readFile(
    new URL("../../../site/overview.json", import.meta.url), "utf8"));
  const answer = overviewBoard({ ...snapshot(), overview });
  const constitutionsAnswer = constitutionsBoard(snapshot());
  assert.ok(answer.measures.rows.length >= 4);
  assert.deepEqual(answer.measures.grades, overview.grid.grades);
  assert.equal(answer.measures.scale, overview.grid.scale);
  assert.equal(answer.measures.tiers, undefined);
  assert.equal(answer.companies.length, governance.labs.length);
  for (const company of answer.companies) {
    const final = company.figures.find(one => one.row === "What the constitutions say, final score");
    const fromBoard = constitutionsAnswer.companies.find(one => one.id === company.id);
    if (final && fromBoard) assert.equal(final.figure, fromBoard.final_score, company.name);
    for (const figure of company.figures) {
      assert.equal(figure.max, 10);
      // The letter the page shows, by the same function; none where the figure
      // prints as nought.
      assert.equal(figure.grade, gradeOf(figure.figure, overview.grid.grades),
                   `${company.name} ${figure.row}`);
      if (asShown(figure.figure) > 0) assert.ok(figure.grade, `${company.name} ${figure.row}`);
      else assert.equal(figure.grade, null, `${company.name} ${figure.row}`);
    }
  }
  assert.deepEqual(answer.takeaways, overview.takeaways);
  assert.throws(() => overviewBoard({ ...snapshot(), overview: null }),
                error => error instanceof ToolError && error.message === INCOMPATIBLE);
  // A publication frozen before the letters carries no thresholds, and is not
  // drawn, as the page does not draw it.
  const { grades, ...withoutGrades } = overview.grid;
  assert.throws(() => overviewBoard({ ...snapshot(), overview: { ...overview, grid: withoutGrades } }),
                error => error instanceof ToolError && error.message === INCOMPATIBLE);
});

test("the overview's own file carries the American school thresholds", async () => {
  const overview = JSON.parse(await readFile(
    new URL("../../../site/overview.json", import.meta.url), "utf8"));
  assert.deepEqual(overview.grid.grades, [
    { letter: "A", from: 9 }, { letter: "B", from: 8 }, { letter: "C", from: 7 },
    { letter: "D", from: 6 }, { letter: "F", from: 0 },
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test app/lib/__tests__/board-tools.test.mjs`
Expected: FAIL on both new tests: `answer.measures.grades` is undefined, and `overview.grid.grades` is undefined.

- [ ] **Step 3: Add the thresholds and the new words to `site/overview.json`**

Edit the file as text, not by loading and dumping it: its indentation is irregular and a dump would rewrite every line.

1. After the `"tiers"` block's closing `  ],` and before `  "scale":`, insert:

```json
  "grades": [
   { "letter": "A", "from": 9 },
   { "letter": "B", "from": 8 },
   { "letter": "C", "from": 7 },
   { "letter": "D", "from": 6 },
   { "letter": "F", "from": 0 }
  ],
```

2. Replace the value of `"scale"` with:

```
"Every score is **a letter**, read from the figure out of 10 the Index gives: **A from 9, B from 8, C from 7, D from 6, and F below 6**. These are the thresholds of American school grades. None means nothing the company publishes meets what the row measures. A cell, once opened, shows the figure out of 10 behind its letter. The parts behind a figure are each given on a scale of their own, 0 to 4 for a criterion or a check, 0 to 10 for a behaviour and 0 to 2 for a practice, and each is shown out of 10 as its share of that scale."
```

3. Replace the value of `"caption"` with:

```
"The two final scores of the index for ten companies, each shown as a letter from A to F, or None where there is nothing to score"
```

4. Replace the `"text"` of the takeaway titled "OpenAI and Anthropic stand out, and still fall short on governance" (the one starting "OpenAI and Anthropic are best in class on every figure") with:

```
"OpenAI's constitution gets a B and Anthropic's a C, and both get a D on governance, the highest grade any company gets there. Neither keeps a complete public record of what changes in its constitution and when, neither publishes a full account of how its models are tested against it, and neither sets a bar a model must clear on it before release. Alibaba's constitution gets a B, but it names none of the models it governs, and Alibaba gets an F on governance. Microsoft AI gets a D on its constitution, a Code of Conduct that is still a draft, and an F on governance."
```

Check that the file still parses: `python3 -c "import json; json.load(open('site/overview.json'))"` prints nothing.

These letters are the ones the repository's boards give on 7 October 2026 (constitutions: OpenAI 8.6, Alibaba 8.0, Anthropic 7.6, Microsoft AI 6.3; governance: OpenAI 6.3, Anthropic 6.2, Microsoft AI 4.2, Alibaba 2.5). Confirm them before committing:

```bash
node -e '
const root = process.cwd() + "/site/";
Promise.all([import(root + "constitutions.js"), import(root + "governance.js"), import(root + "grades.js")]).then(([c, g, gr]) => {
  const fs = require("fs");
  const C = JSON.parse(fs.readFileSync(root + "constitutions.json")), G = JSON.parse(fs.readFileSync(root + "governance.json"));
  const O = JSON.parse(fs.readFileSync(root + "overview.json"));
  for (const lab of G.labs) {
    const w = C.companies.find(x => x.id === lab.id);
    const f = w ? c.figuresOf(C, w).final ?? 0 : 0, t = g.totalsFor(G, lab.id).total;
    console.log(lab.id, gr.gradeOf(f, O.grid.grades) ?? "None", gr.gradeOf(t, O.grid.grades) ?? "None");
  }
});' 2>/dev/null
```

Expected: `openai B D`, `anthropic C D`, `alibaba B F`, `microsoft D F`, and every other company `None F`. If a letter differs, the board files changed since this plan: rewrite the takeaway from what the command prints.

- [ ] **Step 4: Make `overviewBoard` answer letters**

In `app/lib/board-tools.mjs`, add after line 15 (`import { CITATION } from "../../site/markup.js";`):

```js
import { gradeOf } from "../../site/grades.js";
```

Replace the doc comment above `overviewBoard` and the whole function with:

```js
/**
 * The overview: the grid the site opens on, from the publication's frozen
 * overview (site/overview.json as it stood when the publication was built).
 *
 * Each row of the grid names a figure of one of the two boards, and each figure
 * here is read from the same answer constitutions_board and governance_board
 * give, so the three tools cannot disagree. Beside each figure is its letter,
 * read against the thresholds the file gives by the function the page uses
 * (site/grades.js), so the page and this answer cannot disagree either. A
 * publication frozen before the letters carries no thresholds and is not
 * drawn, as the page does not draw it.
 */
export function overviewBoard(snapshot, args = {}) {
  const overview = snapshot?.overview;
  if (!overview?.grid?.groups?.length || !Array.isArray(overview.grid.grades)) {
    throw new ToolError(INCOMPATIBLE);
  }
  const boards = {
    constitutions: constitutionsBoard(snapshot).companies,
    governance: governanceBoard(snapshot).companies,
  };
  // One figure of one company on one board, by the name the grid gives it.
  const figureOf = (board, figure, id) => {
    const company = boards[board]?.find(one => one.id === id);
    if (!company) return null;
    if (board === "constitutions") {
      return { final: company.final_score, whole: company.whole_document?.figure,
               behaviours: company.behaviours?.figure }[figure] ?? null;
    }
    if (figure === "total") return company.final_score ?? null;
    return company.figures?.find(one => one.id === figure)?.figure ?? null;
  };
  const { grades } = overview.grid;
  const rows = overview.grid.groups.flatMap(group => [
    ...group.rows.map(row => ({ group: group.name, ...row })),
    ...(group.final ? [{ group: group.name, name: `${group.name}, final score`,
                         ...group.final }] : []),
  ]);
  const ids = (snapshot.governance?.labs || []).map(lab => ({ id: lab.id, name: lab.name }));
  const chosen = ids.filter(company => matches(company.name, args.company));
  if (!chosen.length) {
    throw new ToolError(`no company called ${args.company}. This overview carries: `
      + `${ids.map(company => company.name).join(", ")}`);
  }
  return {
    publication: snapshot.publication,
    introduction: overview.page?.intro ?? null,
    measures: {
      rows: rows.map(({ group, name, plain, board, figure }) =>
        ({ group, name, means: plain, from_board: board, figure, max: 10 })),
      grades: grades.map(({ letter, from }) => ({ letter, from })),
      scale: overview.grid.scale ?? null,
    },
    takeaways: overview.takeaways ?? [],
    companies: chosen.map(({ id, name }) => ({
      id,
      name,
      summary: overview.summaries?.[id] ?? null,
      figures: rows.map(row => {
        const value = figureOf(row.board, row.figure, id);
        return { row: row.name, figure: value, max: 10, grade: gradeOf(value, grades) };
      }),
    })),
    notes: overview.grid.notes ?? [],
  };
}
```

- [ ] **Step 5: Describe `overview_board` with letters**

In `app/lib/mcp-tools.mjs`, replace:

```js
    "  overview_board: the grid the site opens on, the summary figures of both "
    + "boards for each company with its tier against the best on each row, the "
    + "overview's takeaways and a written summary of each company.",
```

with:

```js
    "  overview_board: the grid the site opens on, the summary figures of both "
    + "boards for each company, each with the letter from A to F the site grades "
    + "it with, the overview's takeaways and a written summary of each company.",
```

In `app/api/mcp/route.js`, replace:

```js
        + "engages, and their final score), each out of 10 and placed in a tier "
        + "against the best score on the same row. With them come the "
```

with:

```js
        + "engages, and their final score), each out of 10 and graded with a "
        + "letter from A to F against fixed thresholds the answer names. With "
        + "them come the "
```

In `site/mcp.html`, replace:

```html
    up the two boards, each out of 10 and placed in a tier against the best score on the same row,
```

with:

```html
    up the two boards, each out of 10 and graded with a letter from A to F against fixed thresholds,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test app/lib/__tests__/board-tools.test.mjs app/lib/__tests__/mcp-tools.test.mjs app/lib/__tests__/grades.test.mjs`
Expected: PASS, no failures.

- [ ] **Step 7: Commit**

```bash
git add site/overview.json app/lib/board-tools.mjs app/lib/__tests__/board-tools.test.mjs app/lib/mcp-tools.mjs app/api/mcp/route.js site/mcp.html
git commit -m "feat: the overview file names its letter thresholds, and overview_board answers letters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The page shows letters and loses its switch

**Files:**
- Modify: `site/overview.js` (header comment, imports, `figureList`, the tier helpers, `aboutFinal`, `aboutRow`, `aboutCompany`, `headRow`, `figureRow`, `drawLegend`, `draw`, `setMode`/`savedMode`, `initializeOverview`)
- Modify: `site/overview.html:55-63` (the toolbar)
- Modify: `site/board.css:1225-1250` and `:1278-1280`
- Modify: `site/overview.json` (remove `grid.tiers` and `grid.relative_note`)

**Interfaces:**
- Consumes: `gradeOf` from `site/grades.js` (Task 1); `overview.grid.grades` (Task 2). From `site/board.js` (unchanged): `view.cellButton(dataset, label, build, className) -> { cell, button }`, `view.paint(node, value, max)`, `view.swatches(values, max)`, `view.figure(value, rest)`, `view.chip(value, max, text)`.
- Produces: nothing other tasks use.

This task changes a page and has no unit harness: `site/overview.js` draws the DOM on import. It is checked in the browser in Task 4.

- [ ] **Step 1: Header comment and imports of `site/overview.js`**

Replace:

```js
 * The grid is drawn by board.js, the code that draws the boards of the Index, so
 * its cells, its popover and its layout on a phone are theirs. It shows each
 * figure as the score out of 10 the Index gives by default, or relative to the
 * best on its row. A cell opens what the figure means and leads to the board
 * that explains it.
```

with:

```js
 * The grid is drawn by board.js, the code that draws the boards of the Index, so
 * its cells, its popover and its layout on a phone are theirs. It shows each
 * final score as a letter, read from the figure out of 10 the Index gives
 * against the thresholds the file names (site/grades.js). A cell opens the
 * figure behind its letter, what the figure means, and the board that explains
 * it.
```

After `import { renderMenu } from "./page-menu.js";` add:

```js
import { gradeOf } from "./grades.js";
```

Delete the line `const MODE_KEY = "aci-overview-mode";`.

- [ ] **Step 2: `figureList` can show a letter**

Replace the whole `figureList` function, and the two comment lines above it (the first of which is a duplicate), with:

```js
/* A list of figures, each a chip and a name. A figure this table carries opens
 * its cell here (`cell` and `open`); a figure only the Index carries leads to its
 * cell there (`href`). A final score (`graded`) wears its letter on the chip and
 * says its figure after the name; a part wears its figure out of 10. */
function figureList(items) {
  const list = element("ul", "check-list");
  items.forEach(({ value, name, cell, open, href, graded }) => {
    const item = element("li");
    item.append(graded ? gradeChip(value) : view.chip(value, TEN, shown(value)));
    if (cell) {
      const button = element("button", "inline-button", name);
      button.type = "button";
      button.addEventListener("click", () => view.follow(cell, open));
      item.append(button);
    } else if (href) {
      const link = element("a", "inline-link", name);
      link.href = href;
      link.title = "Opens this figure in the Index";
      item.append(link);
    } else {
      item.append(element("span", "", name));
    }
    if (graded) item.append(document.createTextNode(`, ${shown(value)} out of ${TEN}`));
    list.append(item);
  });
  return list;
}
```

- [ ] **Step 3: Replace the tier helpers with letter helpers**

Delete `rowFigures` (with its comment "Every figure on one row of this table, and the best of them."), `tierOf` (with its comment) and `tierValue` (with its comment). In their place, after the `indexCell` constant, add:

```js
/* The row's own word for a figure that earns no letter, as the file gives it. */
const noneWord = () => state.overview.grid.groups[0]?.final?.zero || "None";

/* A figure's letter, or null where it prints as nought. */
const letterOf = value => gradeOf(value, state.overview.grid.grades);

/* Where a letter sits on the boards' colour ramp: the best letter at its top,
 * the others spread evenly below, and no letter at its foot. */
function gradeValue(letter) {
  const ordered = [...state.overview.grid.grades].sort((a, b) => b.from - a.from);
  const index = ordered.findIndex(grade => grade.letter === letter);
  return index < 0 ? 0 : TEN * (1 - index / ordered.length);
}

/* A final score's letter as a chip, painted where the grid paints it. */
function gradeChip(value) {
  const letter = letterOf(value);
  const chip = element("span", "chip", letter ?? noneWord());
  view.paint(chip, gradeValue(letter), TEN);
  return chip;
}

/* The letter large, and the figure behind it, at the head of a popover. */
const gradeFigure = value =>
  view.figure(letterOf(value) ?? noneWord(), `, ${shown(value)} out of ${TEN}`);
```

`gradeValue` and the others read `state` and `view` when called, not when defined, so their place in the file above `let view` and `let state` is fine, as it is for the helpers they replace.

- [ ] **Step 4: The popovers**

In `aboutFinal`, replace:

```js
  content.append(view.figure(shown(value), ` out of ${TEN}`));
  const reason = summaryOf(company, final.board, final.board);
```

with:

```js
  content.append(gradeFigure(value));
  const reason = summaryOf(company, final.board, final.board);
```

Leave `aboutCell` as it is: it opens a part, which keeps its figure out of 10.

In `aboutRow`, delete the line:

```js
  content.append(element("p", "subtitle", state.overview.grid.relative_note));
```

In `aboutCompany`, replace:

```js
    ({ value: company.figures[group.final.board][group.final.figure] ?? 0, name: group.name,
       cell: { lab: company.id, row: group.final.figure },
       open: cellOpener(company, group, group.final, true) }))));
```

with:

```js
    ({ value: company.figures[group.final.board][group.final.figure] ?? 0, name: group.name,
       cell: { lab: company.id, row: group.final.figure },
       open: cellOpener(company, group, group.final, true), graded: true }))));
```

- [ ] **Step 5: The grid**

In `headRow`, replace:

```js
    element("span", "head-name", state.mode === "absolute" ? "Score (out of 10)" : "Standing"),
```

with:

```js
    element("span", "head-name", "Grade"),
```

In `figureRow`, delete the first line of the body, `const { grid } = state.overview;`, and replace everything from `const { values, best } = rowFigures(row);` to the end of the `state.companies.forEach(...)` call with:

```js
  state.companies.forEach(company => {
    const value = company.figures[row.board][row.figure] ?? 0;
    const build = final
      ? content => aboutFinal(content, company, group, value)
      : content => aboutCell(content, company, group, row, value);
    const letter = letterOf(value);
    const label = final ? group.name : row.name;
    // The letter alone in the cell; its figure is in the accessible name and in
    // the popover the cell opens.
    const { cell, button } = view.cellButton({ lab: company.id, row: row.figure },
      `${company.name}, ${label.toLowerCase()}: ${letter ?? row.zero}, `
      + `${shown(value)} out of ${TEN}`, build, "cell-button cell-grade");
    view.paint(button, gradeValue(letter), TEN);
    button.append(element("span", "cell-figure", letter ?? row.zero));
    tr.append(cell);
  });
```

Replace the whole `drawLegend` function with:

```js
function drawLegend() {
  const legend = document.createDocumentFragment();
  [...state.overview.grid.grades].sort((a, b) => b.from - a.from).forEach(({ letter }) => {
    legend.append(view.swatches([gradeValue(letter)], TEN), element("span", "", letter));
  });
  // The word an empty cell of the grid says, so the scale and the cells agree.
  legend.append(view.swatches([0], TEN), element("span", "", noneWord()));
  byId("ovw-legend").replaceChildren(legend);
}
```

- [ ] **Step 6: `draw`, and the switch removed**

In `draw`, replace the comment that opens the function body:

```js
  // The numbered notes the marks on the page point to, in the order the marks
  // come: the file's own notes, which the introduction points to, the
  // context's sources, then the relative mode's, whose mark is on its button
  // below them.
```

with:

```js
  // The numbered notes the marks on the page point to, in the order the marks
  // come: the file's own notes, which the introduction points to, then the
  // context's sources.
```

Replace:

```js
  // In the order their marks come down the page: the file's own notes, the
  // relative mode's on its button above the grid, then the context's under it.
  const notes = [...(grid.notes || []),
                 { title: "Relative", text: grid.relative_note },
                 ...(shownContext?.note ? [{ title: context.name, text: context.note }] : [])];
  const relativeNote = (grid.notes || []).length + 1;
  const contextNote = shownContext?.note ? relativeNote + 1 : null;
```

with:

```js
  // In the order their marks come down the page: the file's own notes, then
  // the context's under the grid.
  const notes = [...(grid.notes || []),
                 ...(shownContext?.note ? [{ title: context.name, text: context.note }] : [])];
  const contextNote = shownContext?.note ? (grid.notes || []).length + 1 : null;
```

Delete these lines further down in `draw`:

```js
  const relativeMark = document.querySelector('.ovw-mode [data-mode="relative"] .row-mark');
  if (relativeMark) relativeMark.textContent = String(relativeNote);
```

and:

```js
  document.querySelectorAll(".ovw-mode button").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
  });
```

Delete the whole `setMode` and `savedMode` functions.

In `initializeOverview`, replace:

```js
  if (overview?.format !== FORMAT || !overview.page || !overview.grid
      || !constitutions?.companies || !governance?.labs) {
```

with:

```js
  // A publication frozen before the letters carries no thresholds, and is not
  // drawn rather than drawn with letters it was never built with.
  if (overview?.format !== FORMAT || !overview.page || !Array.isArray(overview.grid?.grades)
      || !constitutions?.companies || !governance?.labs) {
```

Replace:

```js
    state = { overview, companies: companiesOf(constitutions, governance, overview), mode: savedMode(),
              showContext: true };
```

with:

```js
    state = { overview, companies: companiesOf(constitutions, governance, overview),
              showContext: true };
```

Delete:

```js
  document.querySelectorAll(".ovw-mode button").forEach(button => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
```

Check nothing is left: `grep -nE "state\.mode|tierOf|tierValue|rowFigures|relative_note|MODE_KEY|setMode|savedMode|ovw-mode" site/overview.js` prints nothing.

- [ ] **Step 7: The markup**

In `site/overview.html`, replace:

```html
    <!-- The colour scale of the mode shown, beside the switch between modes. -->
    <div class="gov-legend ovw-top-legend" id="ovw-legend" aria-hidden="true"></div>
    <div class="ovw-mode" role="group" aria-label="Show the figures">
      <button type="button" class="gov-button" data-mode="absolute" aria-pressed="true">Absolute</button>
      <button type="button" class="gov-button" data-mode="relative" aria-pressed="false">Relative<span
        class="row-mark" aria-hidden="true">1</span></button>
    </div>
```

with:

```html
    <!-- The colour scale: each letter, and the word for nothing. -->
    <div class="gov-legend ovw-top-legend" id="ovw-legend" aria-hidden="true"></div>
```

- [ ] **Step 8: The styles**

In `site/board.css`, replace:

```css
 * so only what the overview adds is here: the pair of buttons that choose how
 * the figures are shown, the words a cell carries in the relative mode, and the
 * takeaways under it. */
.ovw-mode { display: inline-flex; gap: 6px; }
/* The note mark on a button takes the button's own ink, pressed or not. */
.ovw-mode .row-mark { color: inherit; }


/* A cell is the same size in both modes, whatever it carries: a figure on one
   line or a tier over two. The heights are fixed rather than minimums, and a
   tier's words are set small enough to fit two lines inside them. */
.ovw-board tr[data-level="1"] .cell-button { height: 54px; min-height: 54px; }
.ovw-board tr[data-level="2"] .cell-button { height: 44px; min-height: 44px; }
/* Two lines of a tier inside a cell of the lower row: its padding gives way. */
.ovw-board tr[data-level="2"] .cell-tier { padding-top: 4px; padding-bottom: 4px; }
.board .cell-tier .cell-words {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.ovw-board tr[data-level="2"] .cell-tier .cell-words { font-size: 11px; }
@media (max-width: 560px) {
  .board .cell-tier .cell-words { font-size: 11px; }
}
```

with:

```css
 * so only what the overview adds is here: its letters and the takeaways under
 * it. */

/* Every cell of a row is one height, whether it carries a letter or None. */
.ovw-board tr[data-level="1"] .cell-button { height: 54px; min-height: 54px; }
.ovw-board tr[data-level="2"] .cell-button { height: 44px; min-height: 44px; }
```

Replace:

```css
/* The scale beside the modes at the top. */
```

with:

```css
/* The scale at the top. */
```

- [ ] **Step 9: The relative mode leaves the file**

In `site/overview.json`, delete the whole `"tiers": [ ... ],` block (from `  "tiers": [` through its closing `  ],`), and the line that starts ` "relative_note":`. Edit as text, as in Task 2.

Check: `python3 -c "import json; d=json.load(open('site/overview.json')); assert 'tiers' not in d['grid'] and 'relative_note' not in d['grid'] and d['grid']['grades']"` prints nothing.

Check nothing else reads them: `grep -rn "relative_note\|grid.tiers\|\.tiers\b" site app engine --include=*.js --include=*.mjs --include=*.html` prints nothing from the overview (the doc reader's `?tiers=` URL parameter in `site/spec-reader/` and `engine/verify-reader-features.mjs` is a different thing and stays).

- [ ] **Step 10: Run the unit tests**

Run: `npm run test:routes`
Expected: PASS, no failures.

- [ ] **Step 11: Commit**

```bash
git add site/overview.js site/overview.html site/board.css site/overview.json
git commit -m "feat: the overview grades each final score with a letter, and drops the relative mode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The rules, and the page checked

**Files:**
- Modify: `CLAUDE.md:3-14`
- Modify (outside the repository): `/Users/sverbo/.claude/projects/-Users-sverbo-Desktop-Codes-Polaris-ai-character-index/memory/company-texts-are-absolute.md`

**Interfaces:**
- Consumes: the page as Task 3 left it.
- Produces: nothing.

- [ ] **Step 1: The rule on company texts**

In `CLAUDE.md`, replace:

```
whose title says it compares: the fold "How it stands beside the other
constitutions" in a behaviour's popover, the relative mode of the overview's
grid, and the takeaways, which are findings across companies.
```

with:

```
whose title says it compares: the fold "How it stands beside the other
constitutions" in a behaviour's popover, and the takeaways, which are findings
across companies.
```

In the memory file, replace `(behaviour popover fold "How it stands beside the other constitutions", the overview's relative mode, takeaways)` with `(behaviour popover fold "How it stands beside the other constitutions", takeaways; the overview's relative mode was removed on 7 October 2026)`.

- [ ] **Step 2: Run every suite once**

Run: `npm run test:routes`
Expected: PASS.

Run: `python3 -m pytest tests/ -q`
Expected: PASS, in particular `tests/test_company_texts_are_absolute.py`, which reads `site/overview.json`.

- [ ] **Step 3: Check the page in the browser**

The dev server copies `site/` into `public/` only when it starts, so start it fresh: `preview_start` with `{ name: "aci-dev" }` (port 3217). Open `http://localhost:3217/`, choose **Repository files** in the header switch (the newest publication carries no `grades` and shows the "not compatible" sentence, as the spec expects), and check with `read_page` and `read_console_messages`, without screenshots:

- no Absolute or Relative button;
- the legend reads A, B, C, D, F, None;
- the corner reads "Grade";
- the cells read OpenAI B and D, Anthropic C and D, Alibaba B and F, Microsoft AI D and F, every other company None and F;
- a cell's popover opens on the letter and "8.6 out of 10" (OpenAI, constitutions), with its parts in figures;
- a company's popover lists its two final scores with letter and figure;
- the notes under the grid carry no "Relative" entry;
- no console error.

Then switch back to **Publication** and check the overview shows the "not compatible" sentence rather than an error.

Leave the server running and give the owner its address.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: the overview's relative mode leaves the places a comparison is allowed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
