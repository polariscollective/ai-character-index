/**
 * The tier bands, on the server.
 *
 * This arithmetic is the reader's, and the reader is where it belongs: the
 * cuts are a display decision, and site/spec-reader/app.js owns them. It is
 * copied here rather than imported because app.js is a hundred kilobyte
 * non-module file written for a browser, and importing it would mean making
 * the reader a module to serve a route.
 *
 * A copy is a liability, so app/lib/__tests__/bands.test.mjs extracts the
 * reader's own `tierBand` from the file and holds this one to it over every
 * score a cell can produce. If the two ever disagree the server and the site
 * would call the same passage two different things, which is worse than either
 * being wrong alone.
 */

/** Display tiers, strongest first. The order IS the precedence rule. */
export const TIERS = ["defining", "core", "related"];

/**
 * The tier a score lands in, or null when it is below every tier.
 *
 * Per cell with j judges: defining is score >= 2j+1, clamped to the cell's own
 * maximum so that unanimous core counts as defining on three point data; core
 * is >= 2j; related is >= j+1, at least two judges behind it. A single judge
 * cell has no consensus to demand, so its sole related vote renders at its own
 * weight instead of dying under the multi-judge floor.
 */
export function tierBand(score, judges, maxCell, related = 1) {
  const definingCut = Math.min(2 * judges + 1, maxCell || 2 * judges + 1);
  const relatedCut = judges > 1 ? judges + 1 : related > 0 ? related : 1;
  return score >= definingCut ? "defining"
    : score >= 2 * judges ? "core"
    : score >= relatedCut ? "related"
    : null;
}

/**
 * One cell's passages, each carrying the band it earned.
 *
 * The scale is per cell -- two on the classic rubric, three once any judge in
 * the cell awards a defining -- but the cut follows the passage: a passage
 * scored by fewer judges than its neighbours tops out lower, and measured
 * against the cell's cut it can be structurally incapable of reaching the band
 * it earned.
 */
export function bandCell(passages, related = 1) {
  const maxVerdict = Math.max(
    2, ...passages.flatMap(passage => Object.values(passage.verdicts || {})));

  return passages.map(passage => {
    const verdicts = Object.values(passage.verdicts || {});
    if (!verdicts.length) return { ...passage, band: null };

    const score = verdicts.reduce(
      (total, verdict) => total + (verdict >= 2 ? verdict : verdict === 1 ? related : 0), 0);
    const maxScore = maxVerdict * verdicts.length;
    return {
      ...passage,
      score,
      maxScore,
      band: tierBand(score, Math.max(1, verdicts.length), maxScore, related),
    };
  });
}

/** Whether a band is `floor` or stronger. An unbanded passage is never kept. */
export function atLeastBand(band, floor) {
  if (!band) return false;
  return TIERS.indexOf(band) <= TIERS.indexOf(floor);
}
