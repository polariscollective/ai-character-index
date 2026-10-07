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
