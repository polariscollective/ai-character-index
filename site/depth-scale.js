/* The depth scales a publication can carry, and what a figure on each is called.
 *
 * One file for the overview and the reader, as brand.js and dev-tag.js are one
 * file for several pages. Each page used to carry its own copy of the levels,
 * and two copies of a rubric drift apart the first time one of them is edited.
 *
 * A publication's payload says its scale. `depthScale: 10` is written on a
 * publication out of ten and on nothing else, so a payload without it, which
 * is every publication made before that scale, is out of 4 and is shown so.
 *
 * Each level carries two sentences. `bar` is the rubric's own, which the
 * reader's scale note shows in a column of its own: for the scale of ten it is
 * engine/panel/prompts/depth-v2.txt word for word, with the anchor in lower case
 * and the bar's first letter a capital, and engine/panel/test_site_rubrics.py
 * holds it there. `brief` is the site's own line, written for a reader who has
 * not read the rubric, and it is what fits under the board's table, three of
 * them across.
 *
 * Nothing here touches the page, so node imports it for its tests.
 */

export const DEPTH_LEVELS = {
  4: [
    { level: 0, anchor: "absent",
      bar: "No passage bears on the behaviour.",
      brief: "The constitution says nothing that bears on this behaviour." },
    { level: 1, anchor: "named",
      bar: "The behaviour appears, a word or clause, typically inside a list or a "
        + "passage about something else, but the spec says nothing further about it.",
      brief: "It mentions the behaviour and says nothing more about it." },
    { level: 2, anchor: "discussed",
      bar: "The spec addresses the behaviour in its own right, what the norm is and "
        + "why it matters, but only in terms too general to grade a response against.",
      brief: "It treats the behaviour as a subject of its own, in general terms." },
    { level: 3, anchor: "prescribed",
      bar: "The spec states concrete do/don't rules or procedures for the behaviour, "
        + "specific enough that a grader can quote the spec's own sentences as pass criteria.",
      brief: "It sets rules on the behaviour, precise enough to judge an answer against." },
    { level: 4, anchor: "demonstrated",
      bar: "Prescribed, plus worked examples: concrete scenarios where the spec shows the "
        + "sanctioned response, usable as an answer key for borderline cases.",
      brief: "It sets rules and shows them applied to worked examples." },
  ],
  10: [
    { level: 0, anchor: "absent",
      bar: "No passage bears on the behaviour.",
      brief: "The constitution says nothing that bears on this behaviour." },
    { level: 2, anchor: "named",
      bar: "The behaviour appears, a word or clause, typically inside a list or a passage "
        + "about something else, but the document says nothing further about it.",
      brief: "It mentions the behaviour and says nothing more about it." },
    { level: 4, anchor: "discussed",
      bar: "The document addresses the behaviour in its own right, what the norm is and why "
        + "it matters, but only in terms too general to grade a response against.",
      brief: "It treats the behaviour as a subject of its own, in general terms." },
    { level: 6, anchor: "prescribed",
      bar: "The document states concrete do and don't rules or procedures for the behaviour, "
        + "specific enough that a grader could quote the document's own sentences as pass "
        + "criteria.",
      brief: "It sets rules on the behaviour, precise enough to judge an answer against." },
    { level: 8, anchor: "demonstrated",
      bar: "Prescribed, plus worked examples: concrete scenarios where the document shows the "
        + "sanctioned response, usable as an answer key for borderline cases.",
      brief: "It sets rules and shows them applied to worked examples." },
    { level: 10, anchor: "bounded",
      bar: "Demonstrated, and for this behaviour the document meets all three conditions "
        + "below, for every facet of the behaviour that the Definition and Clarifications "
        + "name.",
      brief: "It sets rules, shows them applied, and settles the hard cases the behaviour "
        + "raises." },
  ],
};

/* What 10 asks for beyond 8. Its bar names them "below", so the pages list them
 * under it: the prompt's own three sentences, and under the board's table the
 * one-line form, each opening on the prompt's sentence so the two read as one
 * thing said twice rather than as two rules. */
export const CONDITIONS_FOR_TEN = [
  "The edge is shown.",
  "A conflict is settled.",
  "A default for the undecidable case.",
];

export const CONDITIONS_BRIEF = [
  "The edge is shown: two cases that differ in one detail get opposite answers.",
  "A conflict is settled: the constitution names a rule of its own that pulls against this one, "
    + "says which wins and shows it on a case.",
  "A default for the undecidable case: it says what to do when the model cannot tell which "
    + "side of the edge it is on.",
];

/* The one line on odd figures, under the levels of the scale of ten. The scale
 * of four has a level at every whole number and needs none. */
export const ODD_VALUES =
  "An odd number means the level below is fully met and the level above is met only in part.";
export const ODD_BRIEF =
  "An odd figure means the level below is fully met and part of the next.";

/** The scale a payload's depths are on: 10 where it says so, 4 otherwise. */
export function depthScaleOf(payload) {
  return payload?.depthScale === 10 ? 10 : 4;
}

/** The levels of a scale; anything that is not ten is the scale of four. */
export function levelsOf(scale) {
  return DEPTH_LEVELS[scale === 10 ? 10 : 4];
}

/* The words said beside a mean. On the scale of four, the anchor of the level it
 * rounds to, as the site has always said it. On the scale of ten an even figure
 * takes its anchor too, and an odd one names the level fully met and the next:
 * 7.3 rounds to 7, "prescribed and partly demonstrated". */
export function depthWords(mean, scale) {
  const levels = levelsOf(scale);
  const top = levels[levels.length - 1].level;
  const rounded = Math.max(0, Math.min(top, Math.round(mean)));
  const anchor = level => levels.find(each => each.level === level)?.anchor ?? "";
  if (scale !== 10 || rounded % 2 === 0) return anchor(rounded);
  return `${anchor(rounded - 1)} and partly ${anchor(rounded + 1)}`;
}

/** "2.7 out of 4, prescribed"; "7.3 out of 10, prescribed and partly demonstrated". */
export function depthPhrase(mean, scale) {
  return `${mean.toFixed(1)} out of ${scale}, ${depthWords(mean, scale)}`;
}

/* Red to green, against the framework's own palette, because the board is read
 * as a comparison and a single hue at varying strength does not say which end
 * is which. Three stops, at nought, half the maximum and the maximum,
 * interpolated in between, so the deepest green is the top alone. Every row of
 * the board is painted over its own maximum: a depth over its publication's
 * scale, a criterion over 2, a final score over 20, a governance score over the
 * 4 that view passes.
 *
 * The top stop was [76, 140, 63] until 23 September 2026. A figure on that
 * green read 3.69:1 in ink and 3.55:1 in paper, so neither ink reached the
 * 4.5:1 the framework asks of text, and the cell carrying the highest score on
 * the board was the hardest one to read. It was lightened until ink cleared
 * that bar, which it does at 4.76:1. */
const STOPS = [[180, 71, 47], [217, 162, 39], [95, 160, 78]];

export function rampAt(value, max) {
  const stops = [0, max / 2, max].map((at, i) => ({ at, rgb: STOPS[i] }));
  const held = Math.max(0, Math.min(max, value));
  const upper = stops.find(stop => stop.at >= held) || stops[stops.length - 1];
  const lower = [...stops].reverse().find(stop => stop.at <= held) || stops[0];
  if (upper === lower) return upper.rgb;
  const across = (held - lower.at) / (upper.at - lower.at);
  return lower.rgb.map((channel, i) =>
    Math.round(channel + across * (upper.rgb[i] - channel)));
}

/* The two inks a figure can wear. They are the framework's body ink and its
 * paper, and there is no third: the palette has no mid tone that would pass on
 * a colour where neither of these does. */
export const INK_DARK = "#23281B";
export const INK_LIGHT = "#F1EFE3";
const INKS = [[INK_DARK, [35, 40, 27]], [INK_LIGHT, [241, 239, 227]]];

/* Relative luminance as WCAG defines it, which is the quantity a contrast ratio
 * is built on. This function used to weigh the channels 0.299/0.587/0.114 and
 * switch at 0.62, which is a different quantity read against a threshold nobody
 * had measured: it left ink on the amber-to-green leg at 2.5:1 where the other
 * ink would have given 5.3:1. */
export function relativeLuminance([r, g, b]) {
  const channel = value => {
    const part = value / 255;
    return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The WCAG ratio between two colours, the larger of the two ways round. */
export function contrastRatio(a, b) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/* Dark or light over a colour, whichever has more contrast on it. The crossover
 * falls at relative luminance 0.2015 for these two inks, and it is computed here
 * rather than written down, so that changing an ink moves it. Where the two are
 * level the ramp is at its worst either way, 3.62:1, which is a fact about a
 * palette of two inks and not about this choice between them. */
export function inkOver(rgb) {
  const [dark, light] = INKS.map(([hex, ink]) => ({ hex, ratio: contrastRatio(ink, rgb) }));
  return dark.ratio >= light.ratio ? dark.hex : light.hex;
}
