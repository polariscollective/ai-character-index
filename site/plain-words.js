/* What each figure on the board of constitutions means, in plain words.
 *
 * The figures are made by judges reading rubrics written for judges.
 * site/depth-scale.js and site/document-assessment.js carry those rubrics word
 * for word, and engine/panel/test_site_rubrics.py holds them to the prompts the
 * judges were given. Nothing here replaces one. What is here is what a reader
 * who has never seen the index gets first: what is being scored, and what the
 * figure on screen means at that value.
 *
 * Nothing here quotes the constitution being scored. The passages a reader can
 * open and the list of contradictions carry the evidence.
 *
 * A depth reads as the level's own brief, from depth-scale.js, so the sentence
 * under the board and the sentence in a popover cannot drift apart.
 *
 * Nothing here touches the page, so node imports it for its tests and the MCP
 * server can answer with it.
 */
import { levelsOf } from "./depth-scale.js";

/* A band is [from, to, sentence]: the sentence for a figure at or above `from`
 * and below `to`. The last band takes the top of the scale as well. */
export function reading(block, value) {
  const bands = block.bands || [];
  const found = bands.find(([from, to]) => value >= from && value < to);
  return (found || bands[bands.length - 1])[2];
}

export const FINAL = {
  what: "Everything the board measures about one constitution, added together: the document as a "
    + "whole out of 10, and the behaviours it governs out of 10.",
  bands: [
    [0, 7, "At this figure the constitution leaves most of what the index looks for unsaid."],
    [7, 14, "At this figure the constitution does some of what the index looks for and leaves a "
      + "good deal of it open."],
    [14, 20, "At this figure the constitution does most of what the index looks for."],
  ],
};

export const WHOLE = {
  what: "How the constitution is built: whether it settles a clash between its own rules, says "
    + "which rules can be lifted and by whom, gives reasons, reaches the situations its models "
    + "are used in, and keeps itself free of contradictions.",
  bands: [
    [0, 3.5, "At this figure the document leaves most of the five questions open."],
    [3.5, 7, "At this figure the document answers some of the five and leaves the rest open."],
    [7, 10, "At this figure the document answers most of the five."],
  ],
};

export const BEHAVIOURS = {
  what: "How far the constitution goes on the behaviours the index asks about, as a plain mean "
    + "over all of them.",
};

export const CATEGORY = {
  what: "How far the constitution goes on the behaviours in this group, as a plain mean over "
    + "them.",
};

export const DEPTH = {
  what: "How far this constitution goes on this behaviour, from saying nothing about it to "
    + "setting rules and showing them applied.",
  partly: "Part of what the next level asks for is there as well.",
};

/* Keyed as site/document-assessment.js keys its five criteria. The bands are
 * read against the figure the board shows, which is out of 2. */
export const CRITERIA_PLAIN = {
  conflict_rules: {
    what: "What the constitution says to do when two of its own rules pull in opposite "
      + "directions.",
    bands: [
      [0, 0.7, "At this figure the constitution does not say which of its rules wins."],
      [0.7, 1.7, "At this figure the constitution gives an order of priority, or asks for "
        + "judgement, and leaves the harder clashes open."],
      [1.7, 2, "At this figure the constitution ranks its rules, says what happens when two of "
        + "the same rank clash, and shows the ranking applied to a case."],
    ],
  },
  rule_force: {
    what: "Whether a reader can tell, rule by rule, which rules are absolute and which are "
      + "defaults someone may set aside, and who may set them aside.",
    bands: [
      [0, 0.7, "At this figure the constitution does not separate its absolute rules from the "
        + "ones that can be set aside."],
      [0.7, 1.7, "At this figure the constitution marks some of its rules, and over much of the "
        + "text a reader cannot tell a rule from an explanation."],
      [1.7, 2, "At this figure every rule carries its force and says who may change it, and "
        + "commentary is marked apart from instruction."],
    ],
  },
  reasons: {
    what: "Whether the rules say why they exist.",
    bands: [
      [0, 0.7, "At this figure the rules are stated without reasons."],
      [0.7, 1.7, "At this figure some rules carry a reason, usually the strictest ones."],
      [1.7, 2, "At this figure nearly every rule that restrains the model says why, closely "
        + "enough to decide a case the document does not show."],
    ],
  },
  situations: {
    what: "Whether the constitution has rules for the situations its models are used in: "
      + "ordinary conversation, actions the model takes with tools, images and audio and video, "
      + "users who may be children, other AI agents, and deployments a business has customised.",
    bands: [
      [0, 0.7, "At this figure the constitution has rules for ordinary conversation and says "
        + "little about the rest."],
      [0.7, 1.7, "At this figure some of the six situations have rules of their own."],
      [1.7, 2, "At this figure all six situations have rules of their own."],
    ],
  },
  contradictions: {
    what: "Whether the constitution asks for two things that cannot both be done, without saying "
      + "which of its rules wins.",
    bands: [
      [0, 0.7, "At this figure three or more contradictions were confirmed, or one of them "
        + "involves a rule the constitution says can never be overridden."],
      [0.7, 1.7, "At this figure one or two contradictions were confirmed, and none involves a "
        + "rule the constitution says can never be overridden."],
      [1.7, 2, "At this figure no contradiction was confirmed."],
    ],
  },
};

/* A depth, said as the level's own line. On the scale of ten a figure can round
 * to a number that is not a level, and then it is the level below with a line
 * that says the next one is partly met. */
export function depthReading(mean, scale) {
  const levels = levelsOf(scale);
  const top = levels[levels.length - 1].level;
  const rounded = Math.max(0, Math.min(top, Math.round(mean)));
  const here = levels.find(level => level.level === rounded);
  if (here) return here.brief;
  const below = levels.filter(level => level.level < rounded).pop();
  return `${below.brief} ${DEPTH.partly}`;
}
