/**
 * The letter a final score earns on the overview. site/grades.js touches no
 * page, so node imports the file the browser loads.
 *
 * Run: node --test app/lib/__tests__/grades.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gradeOf, asShown, paintAt, overallOf } from "../../../site/grades.js";

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

test("a figure that prints as nought earns the lowest letter, and only a missing one earns none", () => {
  assert.equal(gradeOf(0, GRADES), "F");
  assert.equal(gradeOf(0.04, GRADES), "F");
  assert.equal(gradeOf(null, GRADES), null);
  assert.equal(gradeOf(undefined, GRADES), null);
  assert.equal(gradeOf(NaN, GRADES), null);
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
    [3.9, "F"], [2, "F"], [1.9, "G"], [0.05, "G"], [0.04, "G"], [0, "G"],
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

/* The overall grade, on the overview's own scale. */
const scale = async () => JSON.parse(await readFile(
  new URL("../../../site/overview.json", import.meta.url), "utf8")).grid.grades;

test("the overall grade is the average of the two scores, on the same scale", async () => {
  const grades = await scale();
  // 7.8 and 7.6 average 7.7, a C+, and neither score fails.
  const even = overallOf([7.8, 7.6], grades);
  assert.ok(Math.abs(even.value - 7.7) < 1e-9);
  assert.equal(even.letter, "C+");
  // An E on one side is no failure: 4.2 and 9.0 average 6.6, a D.
  const { value, letter } = overallOf([4.2, 9], grades);
  assert.ok(Math.abs(value - 6.6) < 1e-9);
  assert.equal(letter, "D");
});

test("an F on either score caps the overall grade at F", async () => {
  const grades = await scale();
  // 8.6 and 2.5 average 5.55, an E, but 2.5 is an F.
  const capped = overallOf([8.6, 2.5], grades);
  assert.ok(Math.abs(capped.value - 5.55) < 1e-9);
  assert.equal(gradeOf(capped.value, grades), "E");
  assert.equal(capped.letter, "F");
  assert.equal(overallOf([2.5, 8.6], grades).letter, "F");
});

test("a G on either score caps the overall grade at F", async () => {
  const grades = await scale();
  // 9.5 and 1.5 average 5.5, an E, but 1.5 is a G.
  assert.equal(overallOf([9.5, 1.5], grades).letter, "F");
  // The lower letter is kept: 3.4 and 0.6 average 2.0, an F, and stay an F;
  // 3 and 0.4 average 1.7, a G, and stay a G.
  assert.equal(overallOf([3.4, 0.6], grades).letter, "F");
  assert.equal(overallOf([3, 0.4], grades).letter, "G");
});

test("a score of 0 on either side, a G, caps the overall grade at F", async () => {
  const grades = await scale();
  // 9.5 and 0 average 4.75, an E, but 0 is a G.
  assert.deepEqual(overallOf([9.5, 0], grades), { value: 4.75, letter: "F" });
  // A figure that prints as 0.0 is a G too, and a missing one counts as 0.
  assert.equal(overallOf([9.9, 0.04], grades).letter, "F");
  assert.equal(overallOf([9.9, null], grades).letter, "F");
  // Nought on both sides is a G overall.
  assert.deepEqual(overallOf([0, 0], grades), { value: 0, letter: "G" });
});

test("a scale with no F caps nothing", () => {
  const plain = [{ letter: "A", from: 9 }, { letter: "B", from: 5 }, { letter: "C", from: 0 }];
  assert.equal(overallOf([9.5, 1], plain).letter, "B");
});
