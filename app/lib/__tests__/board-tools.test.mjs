/**
 * The two boards, as answers. Against the reader fixtures, so nothing here
 * touches a network and no figure of the real index is written down.
 *
 * Run: node --test app/lib/__tests__/board-tools.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { constitutionsBoard, governanceBoard, overviewBoard, INCOMPATIBLE } from "../board-tools.mjs";
import { ToolError } from "../mcp-tools.mjs";
import { gradeOf, asShown, overallOrder, overallOf } from "../../../site/grades.js";

/* A publication as the MCP server reads it, carrying both boards as they are
 * frozen: the site's own files. */
const board = async name => JSON.parse(await readFile(
  new URL(`../../../site/${name}.json`, import.meta.url), "utf8"));
const constitutions = await board("constitutions");
const governance = await board("governance");
const snapshot = () => ({
  publication: { id: "c3a5e0d2-9f47-4b8e-a1d6-5e2f7b9c0a14",
                 published_at: "2026-09-21T10:00:00+00:00", is_public: true },
  payload: { behaviours: [] }, documents: { documents: [] }, notes: {},
  constitutions, governance,
});

test("the board of constitutions answers what the front page shows, out of 10", () => {
  const answer = constitutionsBoard(snapshot());
  assert.equal(answer.publication.id, "c3a5e0d2-9f47-4b8e-a1d6-5e2f7b9c0a14");
  assert.equal(answer.measures.final_score.max, 10);
  assert.deepEqual(answer.measures.final_score.weights, constitutions.weights);
  assert.equal(answer.measures.whole_document.criteria.length, constitutions.criteria.length);
  assert.equal(answer.companies.length, constitutions.companies.length);
  // Ranked by the final score, the average of the two halves with the board's weights.
  const finals = answer.companies.map(company => company.final_score);
  assert.deepEqual(finals, [...finals].sort((a, b) => b - a));
  assert.equal(answer.companies[0].rank, 1);
  for (const company of answer.companies) {
    const expected = company.whole_document.figure * constitutions.weights.whole
      + company.behaviours.figure * constitutions.weights.behaviours;
    assert.ok(Math.abs(company.final_score - expected) < 1e-9, company.name);
    assert.equal(company.behaviours.cells.length, constitutions.behaviours.length);
  }
  // A criterion is answered on both scales: as given out of 4, and as shown.
  const one = answer.companies.find(company => company.publishes_a_constitution);
  const criterion = one.whole_document.criteria[0];
  assert.equal(criterion.figure, criterion.given / 4 * 10);
  assert.ok(one.behaviours.cells.every(cell => cell.level && cell.says !== undefined));
  // The comparison the page folds away is not in a company's answer.
  assert.ok(one.behaviours.cells.every(cell => !("same" in cell) && !("differs" in cell)));
  assert.deepEqual(answer.takeaways, constitutions.takeaways ?? []);
});

test("a company argument narrows it, and an unknown one says what there is", () => {
  const named = constitutionsBoard(snapshot(), { company: "openai" });
  assert.equal(named.companies.length, 1);
  assert.equal(named.companies[0].name, "OpenAI");
  assert.throws(() => constitutionsBoard(snapshot(), { company: "nobody at all" }),
                error => error instanceof ToolError
                  && /This board carries/.test(error.message));
});

test("a publication that froze no boards is not compatible, on either tool", () => {
  const bare = { ...snapshot(), constitutions: null, governance: null };
  assert.throws(() => constitutionsBoard(bare),
                error => error instanceof ToolError && error.message === INCOMPATIBLE);
  assert.throws(() => governanceBoard(bare),
                error => error instanceof ToolError && error.message === INCOMPATIBLE);
});

test("the board of governance answers the ten companies in the board's own order", () => {
  const answer = governanceBoard(snapshot());
  assert.equal(answer.companies.length, 10);
  assert.deepEqual(answer.companies.map(company => company.rank).slice(0, 3), [1, 2, 3]);
  // Two figures out of 10, and a final score out of 10 that averages them with
  // the weights it names, and ranks the companies.
  assert.deepEqual(answer.measures.figures.map(figure => figure.max), [10, 10]);
  assert.equal(answer.measures.final_score.max, 10);
  const weights = answer.measures.final_score.weights;
  assert.deepEqual(Object.keys(weights), ["published", "engages"]);
  assert.deepEqual(answer.companies[0].figures.map(figure => figure.max), [10, 10]);
  for (const company of answer.companies) {
    const mean = company.figures.reduce((total, figure) => total + figure.figure * weights[figure.id], 0);
    assert.ok(Math.abs(company.final_score - mean) < 1e-9, company.name);
  }
  const finals = answer.companies.map(company => company.final_score);
  assert.deepEqual(finals, [...finals].sort((a, b) => b - a));
  assert.equal(answer.measures.questions.length, 5);
  for (const question of answer.measures.questions) {
    assert.ok(question.means, question.id);
    assert.equal(question.from, "Polaris Collective", question.id);
    assert.ok(question.checks.length >= 1, question.id);
    assert.ok(question.checks.every(check => check.anchors["4"]), question.id);
  }
  // Every practice says which paper it comes from, and the one no figure counts
  // says so where it sits.
  assert.ok(answer.measures.best_practices.practices.every(one => one.from === "Kembery et al."));
  assert.deepEqual(answer.companies[0].counted_in_no_figure.map(one => one.id), ["I5"]);
  assert.equal(answer.as_of, "September 2026");
});

test("a company argument narrows the governance board too", () => {
  const answer = governanceBoard(snapshot(), { company: "anthropic" });
  assert.equal(answer.companies.length, 1);
  assert.equal(answer.companies[0].name, "Anthropic");
  const [published, engages] = answer.companies[0].figures;
  assert.ok(published.questions[0].found.length > 0, "the paragraph we wrote is there");
  assert.ok(engages.found.length > 0, "and one for applicability");
  // Every row a company is scored on belongs to one figure and no other.
  const rows = answer.companies[0].figures
    .flatMap(figure => [...figure.questions.map(one => one.id),
                        ...figure.practices.map(one => one.id)]);
  assert.equal(new Set(rows).size, rows.length);
  assert.throws(() => governanceBoard(snapshot(), { company: "nobody at all" }),
                error => error instanceof ToolError && /This board carries/.test(error.message));
});

test("the governance board answers its sources, and every code it cites resolves", () => {
  const answer = governanceBoard(snapshot());
  const text = JSON.stringify(answer);
  // The page's marker is rewritten for a client, which reads [OA3] as a code.
  assert.ok(!text.includes("[^"), "no marker is left as the page writes it");
  const codes = new Set(answer.sources.map(entry => entry.id));
  assert.equal(codes.size, governance.sources.length);
  const cited = [...text.matchAll(/\[([A-Z]{2}\d+)\]/g)].map(match => match[1]);
  assert.ok(cited.length > 0, "the texts cite their sources");
  for (const code of cited) assert.ok(codes.has(code), code);
  // Every quoted passage names the entry of its document.
  for (const company of answer.companies) {
    for (const figure of company.figures) {
      const rows = [...figure.questions.flatMap(question => question.checks), ...figure.practices];
      for (const row of rows) {
        for (const source of row.evidence?.sources || []) assert.ok(codes.has(source.ref), source.url);
      }
    }
  }
  // One company answers its own documents and those on several companies.
  const one = governanceBoard(snapshot(), { company: "anthropic" });
  assert.deepEqual([...new Set(one.sources.map(entry => entry.company))].sort(),
    ["anthropic", "several"]);
  const own = new Set(one.sources.map(entry => entry.id));
  for (const match of JSON.stringify(one.companies).matchAll(/\[([A-Z]{2}\d+)\]/g)) {
    assert.ok(own.has(match[1]), match[1]);
  }
});

test("the route registers both", async () => {
  const route = await readFile(new URL("../../api/mcp/route.js", import.meta.url), "utf8");
  assert.match(route, /registerTool\("constitutions_board"/);
  assert.match(route, /registerTool\("governance_board"/);
});

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
    const final = company.figures.find(one => one.row === "Content, final score");
    const fromBoard = constitutionsAnswer.companies.find(one => one.id === company.id);
    if (final && fromBoard) assert.equal(final.figure, fromBoard.final_score, company.name);
    for (const figure of company.figures) {
      assert.equal(figure.max, 10);
      const measured = answer.measures.rows.find(row => row.name === figure.row);
      assert.ok(measured, figure.row);
      // Every row is a total and the page shows each as a letter, by the same
      // function: a figure of 0.0 is a G, and no word stands in for it.
      assert.equal(figure.grade, gradeOf(figure.figure, overview.grid.grades),
                   `${company.name} ${figure.row}`);
      if (asShown(figure.figure) === 0) assert.equal(figure.grade, "G", `${company.name} ${figure.row}`);
      else assert.ok(figure.grade, `${company.name} ${figure.row}`);
    }
  }
  // Two final scores and four parts: six rows, and the two final scores are the
  // ones flagged as such.
  assert.deepEqual(answer.measures.rows.filter(row => row.final_score).map(row => row.name),
    ["Process, final score", "Content, final score"]);
  assert.equal(answer.measures.rows.filter(row => !row.final_score).length, 4);
  // The companies come in the order of their overall grade, as the page lists
  // them: the higher letter first, then the higher figure.
  const overalls = answer.companies.map(company => company.overall);
  assert.deepEqual(overalls, [...overalls].sort((a, b) =>
    overallOrder({ value: a.figure, letter: a.grade }, { value: b.figure, letter: b.grade },
                 overview.grid.grades)));
  // OpenAI's document as a whole is the highest part there is, and it earns an A.
  const openai = answer.companies.find(company => company.id === "openai");
  const whole = openai.figures.find(one => one.row === "Clarity of the document");
  assert.ok(whole.figure >= 9, "the figure the review found");
  assert.equal(whole.grade, "A");
  assert.deepEqual(answer.takeaways, overview.takeaways);
  assert.throws(() => overviewBoard({ ...snapshot(), overview: null }),
                error => error instanceof ToolError && error.message === INCOMPATIBLE);
  // A publication frozen before the letters carries no thresholds, and is not
  // drawn, as the page does not draw it.
  const { grades, ...withoutGrades } = overview.grid;
  assert.throws(() => overviewBoard({ ...snapshot(), overview: { ...overview, grid: withoutGrades } }),
                error => error instanceof ToolError && error.message === INCOMPATIBLE);
  // An empty list would leave every cell without a letter.
  assert.throws(() => overviewBoard({ ...snapshot(),
                                      overview: { ...overview, grid: { ...overview.grid, grades: [] } } }),
                error => error instanceof ToolError && error.message === INCOMPATIBLE);
});

test("the overview answers each company's overall grade, by the function the page uses", async () => {
  const overview = JSON.parse(await readFile(
    new URL("../../../site/overview.json", import.meta.url), "utf8"));
  const answer = overviewBoard({ ...snapshot(), overview });
  const { grades } = overview.grid;
  assert.equal(answer.measures.overall.name, overview.grid.overall.name);
  assert.equal(answer.measures.overall.max, 10);
  assert.deepEqual(answer.measures.overall.averages, ["Process, final score", "Content, final score"]);
  let capped = 0;
  for (const company of answer.companies) {
    const finals = ["Process, final score", "Content, final score"]
      .map(row => company.figures.find(one => one.row === row).figure);
    const mean = (finals[0] + finals[1]) / 2;
    assert.ok(Math.abs(company.overall.figure - mean) < 1e-9, company.name);
    assert.equal(company.overall.max, 10);
    assert.equal(company.overall.grade, overallOf(finals, grades).letter, company.name);
    // Either final score an F or a G, 0.0 included, and the overall grade is no
    // higher than F; otherwise it is the average's own letter.
    const fails = finals.some(figure => ["F", "G"].includes(gradeOf(figure, grades)));
    const own = gradeOf(mean, grades);
    const from = letter => grades.find(grade => grade.letter === letter)?.from ?? -1;
    if (fails) {
      assert.ok(from(company.overall.grade) <= from("F"), company.name);
      if (from(own) > from("F")) capped += 1;
    } else {
      assert.equal(company.overall.grade, own, company.name);
    }
  }
  // The file's own figures carry at least one company the cap moves down.
  assert.ok(capped >= 1, "a company whose average alone would read above F");
  // A file that names no overall grade answers none, as the page draws none.
  const { overall, ...withoutOverall } = overview.grid;
  const bare = overviewBoard({ ...snapshot(), overview: { ...overview, grid: withoutOverall } });
  assert.equal(bare.measures.overall, undefined);
  assert.ok(bare.companies.every(company => !("overall" in company)));
});

test("the overview's own file carries its thresholds, with plus and minus down to D, and E, F and G below it", async () => {
  const overview = JSON.parse(await readFile(
    new URL("../../../site/overview.json", import.meta.url), "utf8"));
  assert.deepEqual(overview.grid.grades, [
    { letter: "A", from: 9.3 }, { letter: "A-", from: 9 },
    { letter: "B+", from: 8.7 }, { letter: "B", from: 8.3 }, { letter: "B-", from: 8 },
    { letter: "C+", from: 7.7 }, { letter: "C", from: 7.3 }, { letter: "C-", from: 7 },
    { letter: "D+", from: 6.7 }, { letter: "D", from: 6.3 }, { letter: "D-", from: 6 },
    { letter: "E", from: 4 }, { letter: "F", from: 2 }, { letter: "G", from: 0 },
  ]);
});

test("a figure one model gave in session says so, and a panel's figure carries no key", () => {
  const answer = constitutionsBoard(snapshot());
  const microsoft = answer.companies.find(company => company.id === "microsoft");
  const openai = answer.companies.find(company => company.id === "openai");
  assert.ok(microsoft.behaviours.cells.every(cell => cell.provisional?.seat === "opus-5.5"));
  assert.ok(microsoft.whole_document.criteria.every(criterion => criterion.provisional));
  assert.ok(openai.behaviours.cells.every(cell => !("provisional" in cell)));
});
