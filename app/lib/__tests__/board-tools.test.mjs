/**
 * The two boards, as answers. Against the reader fixtures, so nothing here
 * touches a network and no figure of the real index is written down.
 *
 * Run: node --test app/lib/__tests__/board-tools.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { constitutionsBoard, governanceBoard, INCOMPATIBLE } from "../board-tools.mjs";
import { ToolError } from "../mcp-tools.mjs";

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

test("the board of governance answers the nine companies in the board's own order", () => {
  const answer = governanceBoard(snapshot());
  assert.equal(answer.companies.length, 9);
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
  assert.equal(answer.measures.questions.length, 4);
  for (const question of answer.measures.questions) {
    assert.ok(question.means, question.id);
    assert.equal(question.from, "Polaris Collective", question.id);
    assert.ok(question.checks.length >= 2, question.id);
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
  assert.ok(engages.found.length > 0, "and one for what it engages");
  // Every row a company is scored on belongs to one figure and no other.
  const rows = answer.companies[0].figures
    .flatMap(figure => [...figure.questions.map(one => one.id),
                        ...figure.practices.map(one => one.id)]);
  assert.equal(new Set(rows).size, rows.length);
  assert.throws(() => governanceBoard(snapshot(), { company: "nobody at all" }),
                error => error instanceof ToolError && /This board carries/.test(error.message));
});

test("the route registers both", async () => {
  const route = await readFile(new URL("../../api/mcp/route.js", import.meta.url), "utf8");
  assert.match(route, /registerTool\("constitutions_board"/);
  assert.match(route, /registerTool\("governance_board"/);
});
