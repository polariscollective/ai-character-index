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
