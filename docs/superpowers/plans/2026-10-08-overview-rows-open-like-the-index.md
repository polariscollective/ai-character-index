# The overview's scores open into the Index's rows: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each final score on the overview folds open into the rows the Index shows under it, built by the Index's own code; totals read as letters and scored rows on their own scale; governance leads and orders the columns; the Index menu lists governance first.

**Architecture:** `site/constitutions.js` and `site/governance.js` each move the building of their rows below the final score into one function with options (which board to draw with, the order of columns, how a cell is drawn, which fold the top rows sit in, whether rows carry note marks), used by their own table and exported as `rowsFor` for the overview. The overview draws a borrowed cell through a small pure rule in a new `site/overview-rows.js`. Module state stays at module level, set by `rowsFor`, because the overview never runs either board's initialiser.

**Tech Stack:** Plain ES modules in `site/` served statically by a Next.js app; `node --test` for pure functions; `playwright-core` with the local Chrome for the browser snapshot; pytest for the text rules.

The spec is `docs/superpowers/specs/2026-10-08-overview-rows-open-like-the-index-design.md`.

## Global constraints

- No written sentence of `site/constitutions.json`, `site/governance.json` or `site/overview.json` changes, except `grid.scale`'s last sentence as the spec words it, and the new `grid.every_row` labels.
- A row that adds up others is a letter, read by `gradeOf(value, grid.grades)` from its figure out of 10 and painted at `paintAt(from)` (both in `site/grades.js`); at 0 it is the unpainted "None". A row scored directly shows its figure on its own scale with the corner the board draws (`/4`, `/2`, `/10`): a criterion and a check out of 4, a practice out of 2, a behaviour's depth out of 10; a whole score written whole, a mean to one decimal. An unscored practice is NA.
- The Index's two tables must render exactly as before: same rows, ids, cells, labels.
- Every row id and fold id in the overview's table is unique.
- Everything written in the repository is in English. No long dashes (U+2014, U+2013) anywhere. British spelling, sentence case in site copy.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work stays on branch `feat/overview-letter-grades`. Nothing is pushed, nothing is merged.

## The browser snapshot (prepared by the controller)

`.superpowers/sdd/overview-rows/snapshot.mjs` captures the `<thead>` and `<tbody>` HTML of the Index's two tables (`#board` on `/index`, `#gov-heatmap` on `/index?view=governance`) from the dev server on port 3217, which must be running and serving a fresh copy of `site/`. The baseline, taken before any change, is `.superpowers/sdd/overview-rows/before.json` (`#board` 26 rows, `#gov-heatmap` 32 rows). To check a change:

```bash
rm -rf public && mkdir -p public && cp -R site/. public/
node .superpowers/sdd/overview-rows/snapshot.mjs after
node -e 'const a=require("./.superpowers/sdd/overview-rows/before.json"),b=require("./.superpowers/sdd/overview-rows/after.json");for(const k of Object.keys(a))for(const p of ["head","body"])console.log(k,p,a[k][p]===b[k][p]?"same":"DIFFERENT")'
```

Expected: four lines, each ending `same`.

## File structure

| file | change | responsibility |
|---|---|---|
| `site/constitutions.js` | modify | `prepare(data)`, `rowsBelowFinal(options)`, `indexCell`, exported `rowsFor(view, data, options)` |
| `site/governance.js` | modify | `prepare(data)`, `rowsBelowTotal(options)`, `indexCell`, exported `rowsFor(view, data, options)`; `practiceRow` and `unscoredRow` take the drawing options |
| `site/overview-rows.js` | create | `cellShape(row, grades)`: what a borrowed cell shows |
| `app/lib/__tests__/overview-rows.test.mjs` | create | tests of `cellShape` |
| `site/overview.js` | modify | borrowed rows under each final score, fold toggles, "Show every row", columns ordered by governance, final rows at the Index's level 0, source links |
| `site/overview.html` | modify | the "Show every row" button |
| `site/board.css` | modify | the overview's row heights and rules |
| `site/overview.json` | modify | governance group first, `grid.every_row`, `grid.scale`'s last sentence |
| `app/lib/__tests__/board-tools.test.mjs` | modify | the MCP's final rows now list governance first |
| `site/brand.js` | modify | the Index menu lists governance first |
| `engine/verify-reader-features.mjs` | modify | the walker's expectation of the menu's order |

---

### Task 1: The constitutions board builds its rows in one exported function

**Files:**
- Modify: `site/constitutions.js` (`renderTable` around line 653, `initializeConstitutions` around line 869)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export function rowsFor(view, data, { cell, columns = null, parent = null, marks = true })` returning `{ rows: HTMLTableRowElement[], top: string[] }`. `cell(company, row)` is called once per company per row with `row = { kind: "total" | "scored", rowLabel: string, row: string, value: number | null, scored?: { value: number | null, max: number }, build: (content) => void }` and must return a `<td>`. `columns` is an array of company ids giving the order of cells (the board's ranking when null; throws `Error` naming an id the board lacks). `parent`, when given, is the fold id the two top rows sit in: they then carry ids `cov-row-whole` and `cov-row-behaviours`, `data-parent` set to it and `hidden`, and their ids are returned in `top`. `marks` false gives every row name an empty list of note marks.

There is no unit harness for this file's DOM. The check is the browser snapshot: the Index's table must come out identical.

- [ ] **Step 1: Add `prepare` and use it in the initialiser**

Above the `/* ---- The table ---` comment (around line 605), add:

```js
/* The board's own reading of its file: each company's final score, the
 * companies ranked by it with only their newest document, and the behaviours
 * by category. The board's initialiser runs it, and so does rowsFor for a page
 * that draws these rows without this board. */
function prepare(data) {
  state.data = data;
  data.companies.forEach(company => { company.final = finalOf(data, company); });
  state.companies = ranked(currentPerCompany(data.companies));

  /* Grouped by first appearance rather than alphabetically, so the file's own
   * order decides which category leads. An id of its own for each group: a
   * category's name is a sentence, and the board addresses a group inside a CSS
   * selector. */
  state.categories = categoriesOf(data);
}
```

In `initializeConstitutions`, replace:

```js
    state.data = data;
    data.companies.forEach(company => { company.final = finalOf(data, company); });
    state.companies = ranked(currentPerCompany(data.companies));

    /* Grouped by first appearance rather than alphabetically, so the file's own
     * order decides which category leads. An id of its own for each group: a
     * category's name is a sentence, and the board addresses a group inside a CSS
     * selector. */
    state.categories = categoriesOf(data);
```

with:

```js
    prepare(data);
```

- [ ] **Step 2: Move the rows below the final score into `rowsBelowFinal`**

Replace the whole `renderTable` function with the three definitions below. The rows and cells are the ones `renderTable` built, in the same order and with the same arguments; only the cell call goes through `cell`, the companies through `companies`, the note marks through `marked`, and the top rows through `foldUnder`.

```js
/* How the Index draws a cell of these rows: every figure out of 10. */
const indexCell = (company, { rowLabel, row, value, build }) =>
  cellFor(company, rowLabel, row, { value, max: TEN, text: shown(value), build });

/* The rows under the final score: the document as a whole and its criteria,
 * the behaviours, their categories and the behaviours themselves. The Index
 * draws them under its own final score and the overview under its own, through
 * this one function, so the two pages cannot show these rows two ways.
 *
 * `cell(company, row)` draws one cell. `row.kind` is "total" for a row that
 * averages others and "scored" for a criterion or a behaviour; `row.value` is
 * its figure out of 10; `row.scored`, on a scored row, is its figure as given
 * and the scale it was given on; `row.rowLabel` and `row.row` name and address
 * the cell; `row.build` fills its popover. `columns` orders the companies'
 * cells by id, the board's own ranking when absent. `parent` is the fold the
 * two top rows sit in, none on the Index. `marks` false leaves out the signs
 * pointing to the Index's numbered notes, which only the Index carries. */
function rowsBelowFinal({ cell, columns = null, parent = null, marks = true }) {
  const companies = columns ? columns.map(id => {
    const company = state.companies.find(one => one.id === id);
    if (!company) throw new Error(`The constitutions board has no company ${id}.`);
    return company;
  }) : state.companies;
  const marked = list => (marks ? list : []);
  const rows = [];
  const top = [];
  // On another page the two top rows fold under that page's own final score,
  // shut until it is opened, with ids its fold can name.
  const foldUnder = (tr, id) => {
    if (!parent) return;
    tr.id = id;
    tr.dataset.parent = parent;
    tr.hidden = true;
    top.push(id);
  };
  const weights = state.data.weights;
  const everyBehaviour = state.data.behaviours.length;

  /* The document as a whole: the average of its criteria on the group row, the
   * criteria folded under it. */
  // The two halves of the final score wear the same style: two figures of one
  // rank, each opening into what it averages.
  const wholeRow = element("tr", "total-row outside-row half-row");
  wholeRow.dataset.level = "1";
  foldUnder(wholeRow, "cov-row-whole");
  wholeRow.append(board.rowHead(
    board.rowToggle("whole", state.data.criteria.map((criterion, index) => rowId("whole", index)),
      { parts: "criteria", name: "The document as a whole" }),
    board.rowName("The document as a whole", weightLine(share(weights.whole), "the final score"),
      aboutWhole, "The document as a whole: what it measures", marked([NOTE.whole]))));
  companies.forEach(company => {
    wholeRow.append(cell(company, { kind: "total", rowLabel: "the document as a whole",
      row: "whole", value: wholeTotal(company), build: content => wholeScore(content, company) }));
  });
  rows.push(wholeRow);

  state.data.criteria.forEach((criterion, index) => {
    const sub = board.subRow(rowId("whole", index), "whole",
      board.rowName(criterion.name,
        weightLine(frac(1, state.data.criteria.length), "the document"),
        content => aboutCriterion(content, criterion), `${criterion.name}: what it asks`));
    sub.dataset.level = "2";
    companies.forEach(company => {
      sub.append(cell(company, { kind: "scored", rowLabel: lowerFirst(criterion.name),
        row: criterion.id, value: criterionPart(company, criterion),
        scored: { value: criterionScore10(company, criterion), max: CRITERION_SCALE },
        build: content => criterionScore(content, company, criterion) }));
    });
    rows.push(sub);
  });

  /* The behaviours: every behaviour's depth averaged, which is the other half of
   * the final score, then each category with its behaviours folded under it. A
   * category counts for its share of every behaviour on the board, which is what
   * the mean of every behaviour amounts to. */
  const behavioursRow = element("tr", "total-row outside-row half-row");
  behavioursRow.dataset.level = "1";
  foldUnder(behavioursRow, "cov-row-behaviours");
  behavioursRow.append(board.rowHead(
    board.rowToggle("behaviours", state.categories.map(category => `board-row-${category.id}`),
      { parts: "categories", name: "The behaviours" }),
    board.rowName("The behaviours",
    weightLine(share(weights.behaviours), "the final score"), aboutBehaviours,
    "The behaviours: how they are averaged", marked([NOTE.behaviours]))));
  companies.forEach(company => {
    behavioursRow.append(cell(company, { kind: "total", rowLabel: "the behaviours",
      row: "behaviours", value: behavioursFigure(company),
      build: content => behavioursScore(content, company) }));
  });
  rows.push(behavioursRow);

  state.categories.forEach(category => {
    const { id, name, members } = category;
    const row = element("tr", "question-row");
    row.id = `board-row-${id}`;
    row.dataset.question = id;
    row.dataset.parent = "behaviours";
    row.dataset.level = "2";
    row.append(board.rowHead(
      board.rowToggle(id, members.map((member, index) => rowId(id, index)),
        { parts: "behaviours", name }),
      board.rowName(name, weightLine(frac(members.length, everyBehaviour), "the behaviours"),
        content => aboutCategory(content, category), `${name}: what it measures`,
        marked([NOTE.categories]))));
    companies.forEach(company => {
      row.append(cell(company, { kind: "total", rowLabel: lowerFirst(name), row: id,
        value: categoryFigure(company, members),
        build: content => categoryScore(content, company, category) }));
    });
    rows.push(row);

    members.forEach((behaviour, index) => {
      const sub = board.subRow(rowId(id, index), id,
        board.rowName(behaviour.name, weightLine(frac(1, everyBehaviour), "the behaviours"),
          content => aboutBehaviour(content, behaviour),
          `${behaviour.name}: what it covers`));
      sub.dataset.level = "3";
      companies.forEach(company => {
        const score = depthOf(company, behaviour);
        sub.append(cell(company, { kind: "scored", rowLabel: lowerFirst(behaviour.name),
          row: behaviour.slug, value: score, scored: { value: score, max: depthMax() },
          build: content => behaviourCell(content, company, behaviour) }));
      });
      rows.push(sub);
    });
  });

  return { rows, top };
}

function renderTable() {
  const body = document.createDocumentFragment();
  const companies = state.companies;

  /* The final score, one row above every group, as the governance board's total. */
  const total = element("tr", "total-row outside-row");
  total.dataset.level = "0";
  total.append(board.rowHead(null, board.rowName("Final score", null, aboutFinal,
    `Final score, out of ${finalMax()}: how it is worked out`, [NOTE.final])));
  companies.forEach(company => {
    total.append(cellFor(company, "final score", "final", {
      value: company.final, max: TEN, text: shown(company.final),
      build: content => finalScore(content, company),
    }));
  });
  body.append(total);
  body.append(...rowsBelowFinal({ cell: indexCell }).rows);

  board.nodes.table.tHead.replaceChildren(headRow());
  board.nodes.table.tBodies[0].replaceChildren(body);
}
```

Check against the old code before saving: every `cellFor(company, X, Y, { value: V, max: TEN, text: shown(V), build: B })` of the old `renderTable` below the final row must now be `cell(company, { rowLabel: X, row: Y, value: V, build: B, ... })`, so `indexCell` rebuilds the identical call.

- [ ] **Step 3: Export `rowsFor`**

Just above `export const openCell` (around line 867), add:

```js
/* The rows under the final score, drawn by another page's board: the overview
 * calls this with its own board, its own order of columns and its own way of
 * drawing a cell, and the popovers of these rows then open on that page. That
 * page never runs this board's initialiser, so the module's state is read from
 * the file given here. */
export function rowsFor(view, data, options) {
  board = view;
  prepare(data);
  return rowsBelowFinal(options);
}
```

- [ ] **Step 4: Check the Index is unchanged**

Run the three commands of "The browser snapshot" above. Expected: `#board head same`, `#board body same`, `#gov-heatmap head same`, `#gov-heatmap body same`.

Run: `npm run test:routes` and `python3 -m pytest tests/ -q`. Expected: all pass (406 route tests, 104 Python tests before this plan).

- [ ] **Step 5: Commit**

```bash
git add site/constitutions.js
git commit -m "refactor: the constitutions board builds its rows below the final score in one function another page can call

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The governance board builds its rows in one exported function

**Files:**
- Modify: `site/governance.js` (`practiceRow` around line 792, `unscoredRow` around line 821, `renderTable` around line 844, `initializeGovernance` around line 1221)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export function rowsFor(view, data, { cell, columns = null, parent = null, marks = true })` returning `{ rows, top }`, with the same `cell(company, row)` contract as Task 1. The two top rows are the columns' heads; with `parent` they carry ids `gov-column-published` and `gov-column-engages`.

- [ ] **Step 1: Add `prepare` and use it in the initialiser**

Above `/* ---- The table ---` (around line 707), add:

```js
/* The board's own reading of its file: the data and the companies ranked by
 * their final score. The initialiser runs it, and so does rowsFor. */
function prepare(data) {
  board.data = data;
  board.labs = ranked(data);
}
```

In `initializeGovernance`, replace:

```js
    board.data = data;
    board.labs = ranked(data);
```

with:

```js
    prepare(data);
```

- [ ] **Step 2: `practiceRow` and `unscoredRow` take the drawing options**

Replace `practiceRow` with:

```js
/* One practice's row: under its column, or folded under its group. */
function practiceRow(column, id, parent, { labs, cell, marked }) {
  const practice = practiceOf(board.data, id);
  const company = onlyTheCompany(board.data, id);
  const name = view.rowName(practice.short,
    rowWeight(column, frac(1, rowsOf(column)), column.name.toLowerCase()),
    company ? content => aboutDisclosedPractice(content, practice)
      : content => aboutPractice(content, practice, column),
    `${practice.short}: what its scores mean`, marked([paperNote(practice)]));
  const row = parent ? view.subRow(practiceRowId(id), parent, name) : element("tr");
  if (!parent) {
    row.id = practiceRowId(id);
    row.dataset.parent = columnKey(column);
    row.append(view.rowHead(null, name));
  }
  row.classList.add("practice-row");
  row.dataset.practice = id;
  row.dataset.level = parent ? "3" : "2";
  labs.forEach(lab => {
    const given = practiceScoreOf(board.data, lab.id, id);
    row.append(cell(lab, { kind: "scored", rowLabel: practice.short.toLowerCase(), row: id,
      value: onTen(given, PRACTICE), scored: { value: given, max: PRACTICE },
      build: company ? content => disclosedScore(content, lab, practice)
        : content => practiceScore(content, lab, practice) }));
  });
  return row;
}
```

Replace `unscoredRow` with:

```js
/* The practice nobody could score: NA for every company, in neither figure. */
function unscoredRow(id, parent, column, { labs, marked }) {
  const practice = practiceOf(board.data, id);
  const name = view.rowName(practice.short, null,
    content => aboutUnscoredPractice(content, practice),
    `${practice.short}, not scored and counted in neither figure: what it asks`,
    marked([paperNote(practice), NOTE.unscored]));
  const row = parent ? view.subRow(practiceRowId(id), parent, name) : element("tr");
  if (!parent) {
    row.id = practiceRowId(id);
    row.dataset.parent = columnKey(column);
    row.append(view.rowHead(null, name));
  }
  row.classList.add("practice-row");
  row.dataset.practice = id;
  row.dataset.level = parent ? "3" : "2";
  labs.forEach(lab => row.append(view.naCell({
    name: lab.name, rowLabel: practice.short.toLowerCase(),
    dataset: { lab: lab.id, row: id },
    build: content => unscoredScore(content, lab, practice),
  })));
  return row;
}
```

- [ ] **Step 3: Move the rows below the total into `rowsBelowTotal`**

Replace the whole `renderTable` function with:

```js
/* How the Index draws a cell of these rows: every figure out of 10. */
const indexCell = (lab, { rowLabel, row, value, build }) =>
  cellFor(lab, rowLabel, row, { value, max: TEN, text: shown(value), build });

/* The rows under the final score: each figure, its questions and their checks,
 * its practices and its groups of practices. The Index draws them under its own
 * final score and the overview under its own, through this one function.
 *
 * The options are rowsFor's: `cell(lab, row)` draws one cell from what the row
 * is ("total" or "scored", its figure out of 10, its figure and scale as
 * scored, how it is named and addressed, its popover), `columns` orders the
 * companies' cells by id, `parent` is the fold the two figures' heads sit in,
 * none on the Index, and `marks` false leaves out the signs pointing to the
 * Index's numbered notes. */
function rowsBelowTotal({ cell, columns = null, parent = null, marks = true }) {
  const labs = columns ? columns.map(id => {
    const lab = board.labs.find(one => one.id === id);
    if (!lab) throw new Error(`The governance board has no company ${id}.`);
    return lab;
  }) : board.labs;
  const marked = list => (marks ? list : []);
  const draw = { labs, cell, marked };
  const rows = [];
  const top = [];
  const total = board.data.total;

  board.data.columns.forEach(column => {
    const figure = column.name.toLowerCase();
    const count = rowsOf(column);
    // The head of a column: its own figure, in the size the board gives a
    // headline, with a rule above it so the two read as two figures rather than
    // one column of rows.
    const head = element("tr", "total-row outside-row column-row");
    head.dataset.column = column.id;
    head.dataset.level = "1";
    // On another page the head folds under that page's own final score, shut
    // until it is opened, with an id its fold can name.
    if (parent) {
      head.id = `gov-column-${column.id}`;
      head.dataset.parent = parent;
      head.hidden = true;
      top.push(head.id);
    }
    head.append(view.rowHead(
      view.rowToggle(columnKey(column), columnChildren(column),
        { parts: "rows", name: column.name }),
      view.rowName(column.name,
      weightLine(share(total.weights[column.id]), "the final score"),
      content => aboutColumn(content, column), `${column.name}: what it covers`,
      marked([NOTE[column.id]]))));
    labs.forEach(lab => head.append(cell(lab, { kind: "total", rowLabel: figure, row: column.id,
      value: lab.byColumn[column.id], build: content => columnScore(content, lab, column) })));
    rows.push(head);

    column.questions.forEach(id => {
      const question = questionOf(id);
      const row = element("tr", "question-row");
      row.id = `gov-question-${question.id}`;
      row.dataset.question = question.id;
      row.dataset.parent = columnKey(column);
      row.dataset.level = "2";
      row.append(view.rowHead(
        view.rowToggle(question.id, question.checks.map(check => rowId(check.id)),
          { parts: "checks", name: question.name }),
        view.rowName(question.name, rowWeight(column, frac(question.checks.length, count), figure),
          content => aboutQuestion(content, question),
          `${question.name}${question.minimum ? ", part of the minimum" : ""}: what it asks`,
          marked(question.minimum ? [NOTE.minimum, paperNote(question)] : [paperNote(question)]))));
      labs.forEach(lab => {
        row.append(cell(lab, { kind: "total", rowLabel: question.name.toLowerCase(),
          row: question.id, value: onTen(lab.byQuestion[question.id], SCALE),
          build: content => questionScore(content, lab, question) }));
      });
      rows.push(row);

      question.checks.forEach(check => {
        const sub = view.subRow(rowId(check.id), question.id,
          view.rowName(check.short, rowWeight(column, frac(1, count), figure),
            content => aboutCheck(content, question, check),
            `${check.short}: what its scores mean`));
        sub.dataset.level = "3";
        labs.forEach(lab => {
          const given = board.data.scores[lab.id][check.id];
          sub.append(cell(lab, { kind: "scored", rowLabel: check.short.toLowerCase(),
            row: check.id, value: onTen(given, SCALE), scored: { value: given, max: SCALE },
            build: content => checkScore(content, lab, question, check) }));
        });
        rows.push(sub);
      });
    });

    // A column's practices sit under it one by one, unless the column gathers
    // them into groups: then each group is one row, the mean of its practices,
    // which opens into them the way a question opens into its checks. Grouping
    // is only how the rows are shown. The column's figure is still the mean of
    // every practice, each counted once.
    const grouped = new Set((column.groups || [])
      .flatMap(group => [...group.practices, ...(group.unscored || [])]));
    column.practices.filter(id => !grouped.has(id))
      .forEach(id => rows.push(practiceRow(column, id, null, draw)));
    (column.unscored || []).filter(id => !grouped.has(id))
      .forEach(id => rows.push(unscoredRow(id, null, column, draw)));

    (column.groups || []).forEach(group => {
      const members = [...group.practices, ...(group.unscored || [])];
      const row = element("tr", "question-row group-row");
      row.id = `gov-group-${group.id}`;
      row.dataset.group = group.id;
      row.dataset.parent = columnKey(column);
      row.dataset.level = "2";
      row.append(view.rowHead(
        view.rowToggle(groupKey(group), members.map(practiceRowId),
          { parts: "practices", name: group.name }),
        view.rowName(group.name, rowWeight(column, frac(group.practices.length, count), figure),
          content => aboutGroup(content, group, column), `${group.name}: what it gathers`)));
      labs.forEach(lab => {
        row.append(cell(lab, { kind: "total", rowLabel: group.name.toLowerCase(),
          row: groupKey(group), value: groupAverage(lab.id, group),
          build: content => groupScore(content, lab, group) }));
      });
      rows.push(row);
      group.practices.forEach(id => rows.push(practiceRow(column, id, groupKey(group), draw)));
      (group.unscored || []).forEach(id => rows.push(unscoredRow(id, groupKey(group), column, draw)));
    });
  });

  return { rows, top };
}

function renderTable() {
  const body = document.createDocumentFragment();

  // The final score, above both figures: the one the companies are ranked by.
  const total = board.data.total;
  const totalRow = element("tr", "total-row outside-row column-row final-row");
  totalRow.dataset.column = "total";
  totalRow.dataset.level = "0";
  totalRow.append(view.rowHead(null, view.rowName(total.name, null, aboutTotal,
    `${total.name}, out of ${total.out_of}: how it is worked out`, [NOTE.final])));
  board.labs.forEach(lab => totalRow.append(cellFor(lab, total.name.toLowerCase(), "total", {
    value: lab.total, max: TEN, text: shown(lab.total),
    build: content => totalScore(content, lab),
  })));
  body.append(totalRow);
  body.append(...rowsBelowTotal({ cell: indexCell }).rows);

  const table = view.nodes.table;
  table.tHead.replaceChildren(headRow());
  table.tBodies[0].replaceChildren(body);
}
```

Note: the old code passed `column` as `undefined` to `unscoredRow` inside a group (`unscoredRow(id, groupKey(group))`); passing `column` there changes nothing, because `unscoredRow` reads `column` only when `parent` is absent.

- [ ] **Step 4: Export `rowsFor`**

Just above `export const openCell` (around line 1219), add:

```js
/* The rows under the final score, drawn by another page's board: the overview
 * calls this with its own board, its own order of columns and its own way of
 * drawing a cell, and the popovers of these rows then open on that page. That
 * page never runs this board's initialiser, so the module's state is read from
 * the file given here. */
export function rowsFor(givenView, data, options) {
  view = givenView;
  prepare(data);
  return rowsBelowTotal(options);
}
```

- [ ] **Step 5: Check the Index is unchanged**

Run the three commands of "The browser snapshot". Expected: four lines ending `same`. Run `npm run test:routes` and `python3 -m pytest tests/ -q`: all pass.

- [ ] **Step 6: Commit**

```bash
git add site/governance.js
git commit -m "refactor: the governance board builds its rows below the final score in one function another page can call

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The overview opens its scores into the borrowed rows, leads with governance and orders by it

**Files:**
- Create: `site/overview-rows.js`, `app/lib/__tests__/overview-rows.test.mjs`
- Modify: `site/overview.js`, `site/overview.html`, `site/board.css`, `site/overview.json`, `app/lib/__tests__/board-tools.test.mjs`

**Interfaces:**
- Consumes: `rowsFor` from `site/constitutions.js` and `site/governance.js` (Tasks 1 and 2), with the `cell(company, row)` contract described there; `ranked` from `site/governance.js` (already exported, pure: `ranked(data)` returns the labs sorted by the board's ranking); `gradeOf`, `paintAt` from `site/grades.js`.
- Produces: `export function cellShape(row, grades)` in `site/overview-rows.js`, returning one of `{ kind: "letter", text }`, `{ kind: "none" }`, `{ kind: "scored", text, value, max }`, `{ kind: "na" }`.

- [ ] **Step 1: Write the failing test of the cell rule**

Create `app/lib/__tests__/overview-rows.test.mjs`:

```js
/**
 * What a cell of a row the overview borrows from the Index shows. The rule is
 * pure, so node tests it; the page draws it in site/overview.js.
 *
 * Run: node --test app/lib/__tests__/overview-rows.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { cellShape } from "../../../site/overview-rows.js";

const { grid } = JSON.parse(await readFile(
  new URL("../../../site/overview.json", import.meta.url), "utf8"));

test("a row that adds up others is its letter, and None at nought", () => {
  assert.deepEqual(cellShape({ kind: "total", value: 9.33 }, grid.grades), { kind: "letter", text: "A" });
  assert.deepEqual(cellShape({ kind: "total", value: 5.625 }, grid.grades), { kind: "letter", text: "E" });
  assert.deepEqual(cellShape({ kind: "total", value: 0 }, grid.grades), { kind: "none" });
  assert.deepEqual(cellShape({ kind: "total", value: null }, grid.grades), { kind: "none" });
});

test("a row scored directly keeps its own scale, whole scores whole and means to a decimal", () => {
  assert.deepEqual(cellShape({ kind: "scored", value: 10, scored: { value: 4, max: 4 } }, grid.grades),
    { kind: "scored", text: "4", value: 4, max: 4 });
  assert.deepEqual(cellShape({ kind: "scored", value: 9.2, scored: { value: 3.6666666667, max: 4 } }, grid.grades),
    { kind: "scored", text: "3.7", value: 3.6666666667, max: 4 });
  assert.deepEqual(cellShape({ kind: "scored", value: 5, scored: { value: 1, max: 2 } }, grid.grades),
    { kind: "scored", text: "1", value: 1, max: 2 });
  assert.deepEqual(cellShape({ kind: "scored", value: 8.33, scored: { value: 8.33, max: 10 } }, grid.grades),
    { kind: "scored", text: "8.3", value: 8.33, max: 10 });
  assert.deepEqual(cellShape({ kind: "scored", value: 0, scored: { value: 0, max: 4 } }, grid.grades),
    { kind: "scored", text: "0", value: 0, max: 4 });
});

test("a row scored directly with no score is NA", () => {
  assert.deepEqual(cellShape({ kind: "scored", value: null, scored: { value: null, max: 4 } }, grid.grades),
    { kind: "na" });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test app/lib/__tests__/overview-rows.test.mjs`
Expected: FAIL, cannot find `site/overview-rows.js`.

- [ ] **Step 3: Write the rule**

Create `site/overview-rows.js`:

```js
/* What a cell shows in the rows the overview borrows from the Index.
 *
 * The rows are built by the boards' own code (rowsFor in constitutions.js and
 * governance.js); only the drawing of a cell is the overview's. A row that adds
 * up others is a letter on the overview's scale, read from its figure out of
 * 10, or None at nought. A row scored directly keeps the scale it was scored
 * on, a criterion and a check out of 4, a practice out of 2, a behaviour out of
 * 10: a whole score written whole, a mean to one decimal. A row nobody scored
 * is NA. The rule is here, apart from the page, so node can test it. */

import { gradeOf } from "./grades.js";

export function cellShape(row, grades) {
  if (row.kind === "scored") {
    const given = row.scored?.value;
    if (given === null || given === undefined || Number.isNaN(given)) return { kind: "na" };
    const text = Number.isInteger(given) ? String(given) : given.toFixed(1);
    return { kind: "scored", text, value: given, max: row.scored.max };
  }
  const letter = gradeOf(row.value, grades);
  return letter ? { kind: "letter", text: letter } : { kind: "none" };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test app/lib/__tests__/overview-rows.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: The file**

Edit `site/overview.json` as text, never by loading and re-dumping it (its indentation is irregular).

1. Swap the two objects of `grid.groups`, so the one whose `"name"` is `"How constitutions are governed"` comes first and `"What the constitutions say"` second. Each object starts with a line `   {` and ends with `   }`; keep the comma between them.
2. After the `"grade_scale": { ... },` block, add:

```json
  "every_row": { "show": "Show every row", "hide": "Hide every row" },
```

3. In `grid.scale`, replace the last sentence, "The parts behind a figure are each given on a scale of their own, 0 to 4 for a criterion or a check, 0 to 10 for a behaviour and 0 to 2 for a practice, and each is shown out of 10 as its share of that scale.", with: "Opened, a score shows the rows it is made of: a row that adds up others is a letter on the same scale, and a row scored directly keeps its own scale, 0 to 4 for a criterion or a check, 0 to 10 for a behaviour and 0 to 2 for a practice."

Check: `python3 -c "import json; d=json.load(open('site/overview.json')); print([g['name'] for g in d['grid']['groups']], d['grid']['every_row'])"` prints `['How constitutions are governed', 'What the constitutions say'] {'show': 'Show every row', 'hide': 'Hide every row'}`.

In `app/lib/__tests__/board-tools.test.mjs`, the MCP's rows follow the file, so replace:

```js
    ["What the constitutions say, final score", "How constitutions are governed, final score"]);
```

with:

```js
    ["How constitutions are governed, final score", "What the constitutions say, final score"]);
```

- [ ] **Step 6: The page's imports, columns and corner**

In `site/overview.js`, replace:

```js
import { figuresOf, partsOf as constitutionParts } from "./constitutions.js";
import { totalsFor, partsOf as governanceParts } from "./governance.js";
```

with:

```js
import { figuresOf, partsOf as constitutionParts, rowsFor as constitutionRows } from "./constitutions.js";
import { totalsFor, partsOf as governanceParts, rowsFor as governanceRows,
         ranked as governanceRanked } from "./governance.js";
import { cellShape } from "./overview-rows.js";
```

In the comment above `companiesOf`, replace "Companies are in alphabetical order: the overview ranks nobody, the boards of the Index do." with "Companies are in the order of how their constitution is governed, the governance board's own ranking with its tiebreak, so the overview and that board order them alike."

In `companiesOf`, replace the last line `}).sort((a, b) => a.name.localeCompare(b.name, "en"));` with:

```js
  }).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
```

and add as the first line of the function body:

```js
  const order = governanceRanked(governance).map(lab => lab.id);
```

In `headRow`, replace `element("span", "head-sub", "companies in alphabetical order"));` with:

```js
    element("span", "head-sub", "companies by how their constitution is governed"));
```

- [ ] **Step 7: Drawing a borrowed cell, and the final rows at the Index's level 0**

In `site/overview.js`, replace the whole `figureRow` function with:

```js
/* The fold a final score's rows sit in. */
const foldOf = group => `ovw-${group.final.board}`;

/* A row that adds up others, as a letter: painted where its threshold sits on
 * the ramp, or the unpainted word for nothing. Its figure out of 10 is in its
 * accessible name and in the popover it opens. */
function letterCell(company, { rowLabel, row, value, build, zero }) {
  const letter = letterOf(value);
  const { cell, button } = view.cellButton({ lab: company.id, row },
    `${company.name}, ${rowLabel}: ${letter ?? zero}, ${shown(value ?? 0)} out of ${TEN}`, build,
    letter ? "cell-button cell-grade" : "cell-button cell-grade cell-na");
  if (letter) view.paint(button, gradeValue(letter), TEN);
  button.append(element("span", "cell-figure", letter ?? zero));
  return cell;
}

/* One cell of a row borrowed from the Index, drawn by the overview's rule
 * (overview-rows.js): a total as a letter, a scored row on its own scale. */
function borrowedCell(company, row) {
  const shape = cellShape(row, state.overview.grid.grades);
  const dataset = { lab: company.id, row: row.row };
  if (shape.kind === "na") {
    return view.naCell({ name: company.name, rowLabel: row.rowLabel, dataset, build: row.build });
  }
  if (shape.kind === "scored") {
    return view.scoreCell({ name: company.name, rowLabel: row.rowLabel, value: shape.value,
      max: shape.max, text: shape.text, build: row.build, dataset });
  }
  return letterCell(company, { rowLabel: row.rowLabel, row: row.row, value: row.value,
    build: row.build, zero: noneWord() });
}

/* The rows each board of the Index shows under its final score, built by that
 * board's own code with this grid, its order of companies and its way of
 * drawing a cell. The note marks stay on the Index, where their notes are. */
function borrowedRows() {
  const columns = state.companies.map(company => company.id);
  const options = board => ({ cell: borrowedCell, columns, parent: `ovw-${board}`, marks: false });
  return {
    constitutions: constitutionRows(view, state.boards.constitutions, options("constitutions")),
    governance: governanceRows(view, state.boards.governance, options("governance")),
  };
}

/* A final score's row, drawn as the Index draws its own final score: its fold
 * opens onto the rows that board shows under it, and its cells are letters. */
function figureRow(group, borrowed) {
  const row = group.final;
  const tr = element("tr", "total-row outside-row");
  tr.dataset.level = "0";
  tr.dataset.row = row.figure;
  tr.append(view.rowHead(
    view.rowToggle(foldOf(group), borrowed.top, { parts: "rows", name: group.name }),
    view.rowName(group.name, null, content => aboutGroup(content, group),
      `${group.name}: what it measures`)));
  state.companies.forEach(company => {
    const value = company.figures[row.board][row.figure] ?? 0;
    tr.append(letterCell(company, { rowLabel: group.name.toLowerCase(), row: row.figure, value,
      build: content => aboutFinal(content, company, group, value),
      zero: row.zero || noneWord() }));
  });
  return tr;
}
```

- [ ] **Step 8: `draw` puts each final score above its rows, all shut**

In `draw`, replace:

```js
  view.nodes.table.tBodies[0].replaceChildren(
    ...grid.groups.map(group => figureRow(group, group.final, true)),
    ...(grid.coming || []).map(comingRow),
    ...contextRows(contextNote));
```

with:

```js
  // Each final score, then the rows its board of the Index shows under it, then
  // the views in preparation and the context.
  const borrowed = borrowedRows();
  view.nodes.table.tBodies[0].replaceChildren(
    ...grid.groups.flatMap(group => [figureRow(group, borrowed[group.final.board]),
                                     ...borrowed[group.final.board].rows]),
    ...(grid.coming || []).map(comingRow),
    ...contextRows(contextNote));
  // Every borrowed row starts shut, whatever its board left open: shutting a
  // fold sets every row under every fold from what is open, which is nothing.
  grid.groups.forEach(group => view.setExpanded(foldOf(group), false));
```

- [ ] **Step 9: The initialiser: the boards kept, "Show every row", source links**

In `initializeOverview`, replace:

```js
  view = createBoard({
    nodes: { table: byId("ovw-grid"), pop: byId("ovw-pop"), expandAll: null },
    everyRow: null,
  });
```

with:

```js
  view = createBoard({
    nodes: { table: byId("ovw-grid"), pop: byId("ovw-pop"), expandAll: byId("ovw-expand-all") },
    everyRow: overview.grid.every_row,
  });
```

Replace:

```js
    state = { overview, companies: companiesOf(constitutions, governance, overview),
              showContext: true };
```

with:

```js
    state = { overview, companies: companiesOf(constitutions, governance, overview),
              boards: { constitutions, governance }, showContext: true };
```

After the two lines that wire the legend (`const legend = byId("ovw-legend");` and its listener), add:

```js
  view.nodes.expandAll.addEventListener("click", () => view.expandEvery());
  // A source code in a popover borrowed from the governance board names an
  // entry under that board's "Sources reviewed", which the overview does not
  // carry: it opens there, in a new tab, which the Index scrolls to and marks.
  byId("ovw-pop").addEventListener("click", event => {
    const link = event.target.closest?.('a[href^="#src-"]');
    if (!link) return;
    event.preventDefault();
    window.open(`/index?view=governance${link.getAttribute("href")}`, "_blank", "noopener");
  });
```

In the guard at the top of `initializeOverview`, add `|| !overview.grid.every_row` after `|| !overview.grid.grades.length`, so a publication frozen without the labels is not drawn.

Finally, in the file's header comment, after the paragraph that ends "and the board that explains it.", add:

```js
 *
 * Each final score folds open into the rows its board of the Index shows under
 * it, built by that board's own code (rowsFor), so a row and its popover are
 * the Index's; only the drawing of a cell is the overview's (overview-rows.js).
 * How constitutions are governed leads, and orders the companies.
```

- [ ] **Step 10: The markup and the styles**

In `site/overview.html`, inside `<div class="ovw-controls">`, before the legend's comment `<!-- The colour scale: each letter, ...`, add:

```html
    <button type="button" class="gov-button" id="ovw-expand-all" aria-pressed="false"></button>
```

In `site/board.css`, replace:

```css
/* Every cell of a row is one height, whether it carries a letter or None. */
.ovw-board tr[data-level="1"] .cell-button { height: 54px; min-height: 54px; }
.ovw-board tr[data-level="2"] .cell-button { height: 44px; min-height: 44px; }
```

with:

```css
/* A final score's cells are one height, whether they carry a letter or None.
   The rows under it are the Index's, and keep the Index's sizes. */
.ovw-board tr[data-level="0"] .cell-button { height: 54px; min-height: 54px; }
```

and delete:

```css
/* The overview shows only the final scores, so its rows are divided by the
   light rule the tables use rather than the board's strong one. */
.ovw-board .total-row { border-bottom: 1px solid rgb(92 107 60 / .2); }
```

(the overview now carries the Index's rows, so its total rows take the board's own rule, as on the Index).

- [ ] **Step 11: Run every suite once**

Run: `node --test app/lib/__tests__/overview-rows.test.mjs app/lib/__tests__/board-tools.test.mjs`, then `npm run test:routes`, then `python3 -m pytest tests/ -q`.
Expected: all pass. `grep -nP '[\x{2014}\x{2013}]' site/overview.js site/overview-rows.js site/overview.json site/overview.html site/board.css app/lib/__tests__/overview-rows.test.mjs` prints nothing.

The page is checked in the browser by the controller after this task.

- [ ] **Step 12: Commit**

```bash
git add site/overview-rows.js app/lib/__tests__/overview-rows.test.mjs site/overview.js site/overview.html site/board.css site/overview.json app/lib/__tests__/board-tools.test.mjs
git commit -m "feat: the overview's scores open into the Index's rows, totals in letters and scores on their own scale, governance first and ordering the companies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Index menu lists governance first

**Files:**
- Modify: `site/brand.js` (the `VIEWS` list around line 552)
- Modify: `engine/verify-reader-features.mjs` (the menu check around line 2318)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: The menu's order**

In `site/brand.js`, replace:

```js
/* The views of the index, in the order the About page names them. The two the
 * index is still building are listed so a reader sees where it is going, and
 * cannot be chosen. */
const VIEWS = [
  { title: "What the constitutions say", view: null },
  { title: "How constitutions are governed", view: "governance" },
```

with:

```js
/* The views of the index, how constitutions are governed first, as the
 * overview leads with it. The addresses are unchanged: /index is still what the
 * constitutions say. The two the index is still building are listed so a
 * reader sees where it is going, and cannot be chosen. */
const VIEWS = [
  { title: "How constitutions are governed", view: "governance" },
  { title: "What the constitutions say", view: null },
```

- [ ] **Step 2: The walker's expectation**

In `engine/verify-reader-features.mjs`, replace:

```js
      && listed.choices.join(" | ") === "What the constitutions say | How constitutions are governed"
```

with:

```js
      && listed.choices.join(" | ") === "How constitutions are governed | What the constitutions say"
```

- [ ] **Step 3: Run the suites**

Run: `npm run test:routes` and `python3 -m pytest tests/ -q`. Expected: all pass. `grep -nP '[\x{2014}\x{2013}]' site/brand.js` prints nothing new.

- [ ] **Step 4: Commit**

```bash
git add site/brand.js engine/verify-reader-features.mjs
git commit -m "feat: the Index menu lists how constitutions are governed first

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
