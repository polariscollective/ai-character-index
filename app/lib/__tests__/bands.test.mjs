/**
 * The server's band cuts, held to the reader's.
 *
 * `tierBand` and `achievableScores` are EXTRACTED from site/spec-reader/app.js
 * rather than reimplemented here: a test that copied the arithmetic would keep
 * passing after the real code regressed. The reader is browser code in a
 * non-module file, so extraction by text is how this repository already tests
 * it (engine/panel/test_appjs_tiers.js does the same).
 *
 * Run: node --test app/lib/__tests__/bands.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { TIERS, tierBand, bandCell, atLeastBand } from "../bands.mjs";

const APP_JS = await readFile(
  new URL("../../../site/spec-reader/app.js", import.meta.url), "utf8");

/** One function of app.js, by the text of its first line, braces balanced. */
function extractFn(header) {
  const lines = APP_JS.split("\n");
  const start = lines.findIndex(line => line.startsWith(header));
  if (start < 0) throw new Error(`not found in app.js: ${header}`);
  let depth = 0;
  let began = false;
  for (let i = start; i < lines.length; i += 1) {
    for (const character of lines[i]) {
      if (character === "{") { depth += 1; began = true; }
      else if (character === "}") { depth -= 1; }
    }
    if (began && depth === 0) return lines.slice(start, i + 1).join("\n");
  }
  throw new Error(`unbalanced braces in app.js for: ${header}`);
}

const asFunction = (header, name) =>
  new Function(`${extractFn(header)}; return ${name};`)();

const readerTierBand = asFunction(
  "function tierBand(score, judges, maxCell, related) {", "tierBand");
const readerAchievable = asFunction(
  "function achievableScores(judges, maxCell, related) {", "achievableScores");

test("TIERS is ordered strongest first", () => {
  assert.deepEqual(TIERS, ["defining", "core", "related"]);
});

test("the band cuts agree with the reader over every achievable score", () => {
  const shapes = [[1, 2], [2, 4], [3, 6], [4, 8], [1, 3], [2, 6], [3, 9], [5, 10], [5, 15], [6, 18]];
  let checked = 0;
  for (const [judges, maxCell] of shapes) {
    for (const related of [1, 0.5, 0.25, 0]) {
      for (const score of readerAchievable(judges, maxCell, related)) {
        assert.equal(
          tierBand(score, judges, maxCell, related),
          readerTierBand(score, judges, maxCell, related),
          `score ${score}, judges ${judges}, maxCell ${maxCell}, related ${related}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 100, `swept only ${checked} scores, the extraction is probably broken`);
});

test("a three judge unanimous core cell clamps to defining", () => {
  assert.equal(tierBand(6, 3, 6, 1), "defining");
});

test("a lone related vote is hidden with two judges and shown with one", () => {
  assert.equal(tierBand(1, 2, 4, 1), null);
  assert.equal(tierBand(1, 1, 2, 1), "related");
});

test("bandCell scores each passage on its own judge count", () => {
  const banded = bandCell([
    { id: "one", verdicts: { a: 2 } },
    { id: "two", verdicts: { a: 1 } },
  ]);
  assert.deepEqual(banded.map(passage => passage.band), ["defining", "related"]);
  assert.deepEqual(banded.map(passage => passage.score), [2, 1]);
  assert.deepEqual(banded.map(passage => passage.maxScore), [2, 2]);
  assert.equal(banded[0].id, "one", "the passage is copied, not replaced");
});

test("a cell scale is the largest verdict any judge awarded in it", () => {
  // One 3 anywhere makes the cell four point, so a unanimous pair of 2s no
  // longer clamps to defining.
  const banded = bandCell([
    { id: "high", verdicts: { a: 3, b: 3 } },
    { id: "pair", verdicts: { a: 2, b: 2 } },
  ]);
  assert.deepEqual(banded.map(passage => passage.band), ["defining", "core"]);
});

test("a passage with no verdicts has no band", () => {
  const [banded] = bandCell([{ id: "unscored" }]);
  assert.equal(banded.band, null);
  assert.equal(banded.score, undefined);
});

test("atLeastBand reads the floor as this band and stronger", () => {
  assert.equal(atLeastBand("defining", "core"), true);
  assert.equal(atLeastBand("core", "core"), true);
  assert.equal(atLeastBand("related", "core"), false);
  assert.equal(atLeastBand("related", "related"), true);
  assert.equal(atLeastBand(null, "related"), false);
});
