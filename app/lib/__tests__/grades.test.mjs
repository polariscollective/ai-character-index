/**
 * The letter a final score earns on the overview. site/grades.js touches no
 * page, so node imports the file the browser loads.
 *
 * Run: node --test app/lib/__tests__/grades.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gradeOf, asShown, paintAt } from "../../../site/grades.js";

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
  assert.equal(gradeOf(7.96, GRADES), "B");
  assert.equal(gradeOf(6.96, GRADES), "C");
  // 0.05 prints as 0.1, so it earns a letter.
  assert.equal(asShown(0.05), 0.1);
  assert.equal(gradeOf(0.05, GRADES), "F");
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

test("on the overview's own scale, a plus or a minus falls at the edges of a band, and E, F and G split what is below D", async () => {
  const { grid } = JSON.parse(await readFile(
    new URL("../../../site/overview.json", import.meta.url), "utf8"));
  const cases = [
    [10, "A"], [9.3, "A"], [9.2, "A-"], [9, "A-"], [8.9, "B+"], [8.7, "B+"],
    [8.6, "B"], [8.3, "B"], [8.2, "B-"], [8, "B-"], [7.6, "C"], [7.04, "C-"],
    [6.3, "D"], [6.2, "D-"], [6, "D-"], [5.96, "D-"], [5.9, "E"], [4, "E"], [3.96, "E"],
    [3.9, "F"], [2, "F"], [1.9, "G"], [0.05, "G"], [0, null],
  ];
  for (const [figure, letter] of cases) assert.equal(gradeOf(figure, grid.grades), letter, String(figure));
});

test("a letter is painted at its threshold, or just above where its text would fail AA", () => {
  assert.equal(paintAt(9.3), 9.3);
  assert.equal(paintAt(6), 6);
  assert.equal(paintAt(4), 4);
  // The ramp's text contrast is below 4.5:1 from 0.5 to 2.7, so F, from 2.0,
  // is painted at the first tenth above that passes.
  assert.equal(paintAt(2), 2.8);
  assert.equal(paintAt(0), 0);
});
