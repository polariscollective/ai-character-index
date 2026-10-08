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

test("a row that adds up others is its letter, and a G at nought", () => {
  assert.deepEqual(cellShape({ kind: "total", value: 9.33 }, grid.grades), { kind: "letter", text: "A" });
  assert.deepEqual(cellShape({ kind: "total", value: 5.625 }, grid.grades), { kind: "letter", text: "E" });
  assert.deepEqual(cellShape({ kind: "total", value: 0 }, grid.grades), { kind: "letter", text: "G" });
  // A total nobody gave a figure is not a zero: it is not assessed.
  assert.deepEqual(cellShape({ kind: "total", value: null }, grid.grades), { kind: "na" });
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
