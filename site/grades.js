/* The letter a total earns on the overview.
 *
 * The overview shows each total as a letter rather than a figure out of 10.
 * The thresholds are not here: they are in site/overview.json, which a
 * publication freezes, so a pinned publication keeps the letters it was built
 * with. This module only reads a figure against them, for the page and for the
 * MCP server alike, so the two cannot give one figure two letters.
 *
 * The letter is read from the figure as the page prints it, to one decimal, so
 * a figure printed "9.0" never carries the letter below. Every figure earns a
 * letter, 0.0 included, which takes the lowest one, G. Only a missing figure
 * has none. */

import { rampAt, inkOver, contrastRatio } from "./depth-scale.js";

/* The figure as the page prints it, as a number. */
export const asShown = value => Number((value ?? 0).toFixed(1));

/* `grades` is the file's list, each { letter, from }, in any order. A figure
 * below every threshold takes the lowest letter; null, undefined or NaN, a
 * figure nobody gave, takes none. */
export function gradeOf(value, grades) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const shown = asShown(value);
  const ordered = [...grades].sort((a, b) => b.from - a.from);
  return (ordered.find(grade => shown >= grade.from) ?? ordered[ordered.length - 1])?.letter
    ?? null;
}

/* The overall grade: the average of `values`, each a figure out of 10, read on
 * the same scale as every other letter, and no higher than `cap` when any one
 * of them earns `cap` or a letter below it, 0 included. A company that fails
 * one of the two final scores cannot make up for it with the other. The lower
 * of the average's letter and `cap` is kept, so an average that already reads
 * below `cap` keeps its own letter. A missing figure counts as 0. A scale with
 * no `cap` letter caps nothing. */
export function overallOf(values, grades, cap = "F") {
  const figures = values.map(value => value ?? 0);
  const value = figures.length
    ? figures.reduce((sum, figure) => sum + figure, 0) / figures.length : 0;
  const letter = gradeOf(value, grades);
  const ceiling = grades.find(grade => grade.letter === cap);
  if (!letter || !ceiling) return { value, letter };
  const fromOf = earned => grades.find(grade => grade.letter === earned).from;
  const fails = figures.some(figure => {
    const earned = gradeOf(figure, grades);
    return earned === null || fromOf(earned) <= ceiling.from;
  });
  return { value, letter: fails && fromOf(letter) > ceiling.from ? cap : letter };
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

/* Two overall grades, as `overallOf` gives them, in the order the overview
 * lists companies: the higher letter first, and within one letter the higher
 * figure. A capped grade sorts with its letter, under every company that earned
 * a better one. */
export function overallOrder(a, b, grades) {
  const fromOf = letter => grades.find(grade => grade.letter === letter)?.from ?? -1;
  return (fromOf(b.letter) - fromOf(a.letter)) || (b.value - a.value);
}
