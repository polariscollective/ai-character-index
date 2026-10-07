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

/* The figure as the page prints it, as a number. */
export const asShown = value => Number((value ?? 0).toFixed(1));

/* `grades` is the file's list, each { letter, from }, in any order. */
export function gradeOf(value, grades) {
  const shown = asShown(value);
  if (!(shown > 0)) return null;
  const ordered = [...grades].sort((a, b) => b.from - a.from);
  return ordered.find(grade => shown >= grade.from)?.letter ?? null;
}
