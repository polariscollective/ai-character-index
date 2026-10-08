/* The letter a final score earns on the overview.
 *
 * The overview shows each final score as a letter rather than a figure out of
 * 10. The thresholds are not here: they are in site/overview.json, which a
 * publication freezes, so a pinned publication keeps the letters it was built
 * with. This module only reads a figure against them, for the page and for the
 * MCP server alike, so the two cannot give one figure two letters.
 *
 * The letter is read from the figure as the page prints it, to one decimal, so
 * a figure printed "9.0" never carries the letter below. A figure that prints
 * as 0.0 earns no letter: the grid says the row's own word for nothing. */

import { rampAt, inkOver, contrastRatio } from "./depth-scale.js";

/* The figure as the page prints it, as a number. */
export const asShown = value => Number((value ?? 0).toFixed(1));

/* `grades` is the file's list, each { letter, from }, in any order. */
export function gradeOf(value, grades) {
  const shown = asShown(value);
  if (!(shown > 0)) return null;
  const ordered = [...grades].sort((a, b) => b.from - a.from);
  return ordered.find(grade => shown >= grade.from)?.letter ?? null;
}

/* WCAG AA for text the size of a letter in a cell. */
const AA = 4.5;
const rgbOf = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
const readable = value => {
  const colour = rampAt(value, 10);
  return contrastRatio(colour, rgbOf(inkOver(colour))) >= AA;
};

/* Where a letter is painted on the boards' colour ramp, from its threshold:
 * at the threshold itself, so it wears the colour that figure wears in the
 * Index, or, where its text would fall below AA there, at the first tenth above
 * that passes. The ramp fails from 0.5 to 2.7, so F, from 2.0, is painted at
 * 2.8, and every other letter at its threshold. */
export function paintAt(from) {
  let value = from;
  while (value < 10 && !readable(value)) value = Math.round(value * 10 + 1) / 10;
  return value;
}
