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

/* A criterion with no judge is a criterion the sum of five cannot include. Read
 * as nought it cost the document two points and the board said so with a
 * figure, which is a document assessed and found wanting rather than one
 * nobody finished assessing. */
test("a criterion nobody scored has no figure, and the total and the final score have none", () => {
  const { situations, ...scored } = ASSESSED.criteria;
  const short = { ...ASSESSED, criteria: scored };
  const { parts, total } = wholeFigures(short);
  assert.equal(criterionMean(short, "situations"), null);
  assert.deepEqual(parts, [1.5, 1.7, 1, null, 1]);
  assert.notEqual(parts[3], 0, "nought is a score, and nobody gave one");
  assert.equal(total, null, "four of five is not a total");
  assert.equal(finalFigure(BEHAVIOURS, short, CORPUS_COLUMN), null,
    "a final score short of two points is worse than none");
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

test("the coverage board draws its rows from this module", async () => {
  const board = await readFile(new URL("../../../site/coverage.js", import.meta.url), "utf8");
  assert.match(board, /from "\.\/document-assessment\.js"/);
});
