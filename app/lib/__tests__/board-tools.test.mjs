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

test("the board of constitutions answers every figure with its scale", () => {
  const answer = constitutionsBoard(snapshot());
  assert.equal(answer.publication.id, "c3a5e0d2-9f47-4b8e-a1d6-5e2f7b9c0a14");
  assert.equal(answer.measures.score.max, 20);
  assert.equal(answer.measures.depth.max, 10);
  assert.equal(answer.measures.depth.levels.length, 6);
  assert.equal(answer.measures.whole_document.criteria.length, 5);
  const one = answer.constitutions.find(item => item.score);
  assert.ok(one, "no constitution carries a score");
  assert.equal(one.score.max, 20);
  assert.equal(one.whole_document.criteria.length, 5);
  assert.ok(one.behaviours.cells.length > 0);
  assert.ok(one.behaviours.cells.every(cell => cell.max === 10 && cell.level.means));
});

test("a company argument narrows it, and an unknown one says what there is", () => {
  const all = constitutionsBoard(snapshot());
  const named = constitutionsBoard(snapshot(), { company: "zenith" });
  assert.ok(named.constitutions.length >= 1);
  assert.ok(named.constitutions.length < all.constitutions.length);
  assert.ok(named.constitutions.every(one => one.lab === "Zenith"));
  assert.throws(() => constitutionsBoard(snapshot(), { company: "nobody at all" }),
                error => error instanceof ToolError
                  && /This publication carries/.test(error.message));
});

test("the board of governance answers the nine companies in the board's own order", () => {
  const answer = governanceBoard();
  assert.equal(answer.companies.length, 9);
  assert.deepEqual(answer.companies.map(company => company.rank).slice(0, 3), [1, 1, 3]);
  assert.equal(answer.companies[0].overall.max, 16);
  assert.equal(answer.measures.questions.length, 4);
  for (const question of answer.measures.questions) {
    assert.ok(question.means, question.id);
    assert.ok(question.checks.length >= 2, question.id);
    assert.ok(question.checks.every(check => check.anchors["4"]), question.id);
  }
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

test("the route registers both", async () => {
  const route = await readFile(new URL("../../api/mcp/route.js", import.meta.url), "utf8");
  assert.match(route, /registerTool\("constitutions_board"/);
  assert.match(route, /registerTool\("governance_board"/);
});
