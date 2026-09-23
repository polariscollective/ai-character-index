/**
 * The two boards of the overview, as answers.
 *
 * A client asking the index what it holds should be able to get what a reader
 * sees: the figures, the scale each one is on, and the words that say what a
 * figure at that value means. Both functions are built from the files the pages
 * are built from, so a client and a reader are never told different things.
 *
 *   site/document-assessment.js  the criteria of the first board and its figures
 *   site/depth-scale.js          the depth levels and what each one asks for
 *   site/governance.js           the ranking of the second board
 *   site/governance.json         its scores, its scales and its words
 *
 * Nothing here writes a figure down and nothing here writes a rubric down. The
 * few sentences that are this module's own say what a whole row measures, which
 * is the one thing neither of those files states in a sentence.
 *
 * Pure, as app/lib/mcp-tools.mjs is: the first takes a snapshot, the second
 * takes nothing, and a fixture exercises both with no network. The JSON is
 * imported the way app/lib/admin-data.mjs imports the panel's configuration.
 */
import governance from "../../site/governance.json" with { type: "json" };
import { ranked as rankedCompanies } from "../../site/governance.js";
import { CRITERIA, SHOWN_MAX, WHOLE_MAX, FINAL_MAX, CONTRADICTIONS_RULE, HALVING,
         HOW_SETTLED, NOT_REVIEWED, orderedClaims, wholeFigures, behavioursFigure,
         categoryFigure, finalFigure } from "../../site/document-assessment.js";
import { depthScaleOf, levelsOf } from "../../site/depth-scale.js";
import { ToolError } from "./mcp-tools.mjs";

/* The second board's own maxima: four questions of 4, and 2 for each practice
 * that carries a score. */
const OVERALL = 16;
const PRACTICE = 2;

/** A company named in an argument, matched loosely: "openai" finds OpenAI. */
const matches = (name, wanted) =>
  !wanted || String(name).toLowerCase().includes(String(wanted).toLowerCase().trim());

/** The behaviours of one publication, grouped as the board groups them. */
function groupsOf(behaviours) {
  const byName = new Map();
  behaviours.forEach(behaviour => {
    const name = behaviour.category || "Behaviours under test";
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(behaviour);
  });
  return [...byName].map(([name, members]) => ({ name, members }));
}

/**
 * What a depth of this size reads as: the highest level at or below it.
 *
 * A mean of three readings lands between levels most of the time, and a figure
 * reported without the level under it is a number with nothing behind it. The
 * level's own line comes from site/depth-scale.js, which is held to the judges'
 * prompt, so nothing here paraphrases a rubric.
 */
function levelAt(mean, scale) {
  const levels = levelsOf(scale);
  const reached = [...levels].reverse().find(level => mean >= level.level) || levels[0];
  return {
    level: reached.level,
    anchor: reached.anchor,
    means: reached.brief,
    and_part_of_the_next: mean > reached.level,
  };
}

/* What a whole row of the first board measures. The criteria and the depth
 * levels say what each figure inside a row means; these four say what the row
 * is. */
const MEASURED = {
  score: `The two halves of the board added together: the document as a whole out of `
    + `${WHOLE_MAX}, and how far it goes on the behaviours out of ${WHOLE_MAX}.`,
  whole: "How the constitution is built, read over the whole document on five criteria.",
  behaviours: "The mean of the constitution's depths over every behaviour the index asks "
    + "about.",
  depth: "How far the constitution goes on one behaviour, from saying nothing about it to "
    + "setting rules and showing them applied.",
  group: "The mean of the constitution's depths over the behaviours in one group.",
};

/** A criterion as the board describes it, before any company is scored on it. */
function criterionMeasure(criterion) {
  return {
    key: criterion.key,
    name: criterion.name,
    max: SHOWN_MAX,
    asked: criterion.asks,
    anchors: criterion.anchors,
    scored: criterion.key === "contradictions" ? CONTRADICTIONS_RULE : HALVING,
    ...(criterion.key === "contradictions"
      ? { how_settled: HOW_SETTLED, reviewed: NOT_REVIEWED }
      : {}),
  };
}

/**
 * The board of constitutions: every figure of one publication, with its scale.
 *
 * A document the publication carries but nobody assessed answers null for the
 * score and for the document as a whole, which is what the board shows of it.
 */
export function constitutionsBoard({ publication, payload, documents }, args = {}) {
  const scale = depthScaleOf(payload);
  const behaviours = payload.behaviours || [];
  const assessment = payload.assessment && typeof payload.assessment === "object"
    ? payload.assessment : {};
  const groups = groupsOf(behaviours);
  const all = documents.documents || [];
  const columns = all.filter(document => matches(document.lab, args.company));
  if (!columns.length) {
    throw new ToolError(`no constitution from ${args.company}. This publication carries: `
      + `${[...new Set(all.map(document => document.lab))].join(", ")}`);
  }
  return {
    publication,
    measures: {
      score: { max: FINAL_MAX, means: MEASURED.score },
      whole_document: {
        max: WHOLE_MAX,
        means: MEASURED.whole,
        criteria: CRITERIA.map(criterionMeasure),
      },
      behaviours: { max: scale, means: MEASURED.behaviours },
      group: { max: scale, means: MEASURED.group },
      depth: {
        max: scale,
        means: MEASURED.depth,
        levels: levelsOf(scale).map(({ level, anchor, brief, bar }) =>
          ({ level, anchor, means: brief, asked: bar })),
      },
    },
    constitutions: columns.map(column => {
      const held = assessment[column.id] ?? null;
      const final = finalFigure(behaviours, held, column);
      const figure = behavioursFigure(behaviours, column);
      const whole = held ? wholeFigures(held) : null;
      const claims = orderedClaims(held);
      return {
        id: column.id,
        lab: column.lab,
        title: column.title,
        version: column.version,
        source_url: column.sourceUrl ?? null,
        score: final ? { figure: final.value, max: FINAL_MAX } : null,
        whole_document: whole
          ? {
            figure: whole.total,
            max: WHOLE_MAX,
            criteria: CRITERIA.map((criterion, index) => ({
              key: criterion.key,
              figure: whole.parts[index],
              max: SHOWN_MAX,
            })),
            contradictions: {
              listed: claims.length,
              confirmed: claims.filter(claim => claim.confirmed).length,
            },
          }
          : null,
        behaviours: figure
          ? {
            figure: figure.value,
            max: scale,
            over: figure.count,
            level: levelAt(figure.value, scale),
            groups: groups.map(group => {
              const value = categoryFigure(group.members, column);
              return value === null
                ? null
                : { name: group.name, figure: value, max: scale,
                    level: levelAt(value, scale) };
            }).filter(Boolean),
            cells: behaviours.map(behaviour => {
              const depth = behaviour.coverage?.[column.id]?.depth;
              return Number.isFinite(depth?.mean)
                ? { behaviour: behaviour.slug, name: behaviour.name,
                    group: behaviour.category ?? null, figure: depth.mean, max: scale,
                    level: levelAt(depth.mean, scale) }
                : null;
            }).filter(Boolean),
          }
          : null,
      };
    }),
  };
}

/* The practices shown beside the second board's score: the five anyone can
 * check, and the four a company is asked to publish. The fifth internal
 * practice is scored for nobody, and carries its own note saying why. */
const askedToPublish = () => governance.internal.filter(practice => practice.asked_to_publish);
const practicesOf = () => [...governance.supporting, ...governance.internal];
const practiceMax = () => PRACTICE * (governance.supporting.length + askedToPublish().length);

/**
 * The board of governance: nine companies on four questions.
 *
 * It belongs to no publication. Nothing in it was judged by a panel: the scores
 * were given by hand from public documents, as of the date the data carries,
 * and the answer says so in `as_of` and `scored_by`.
 */
export function governanceBoard(args = {}) {
  const companies = rankedCompanies(governance)
    .filter(company => matches(company.name, args.company));
  if (!companies.length) {
    throw new ToolError(`no company called ${args.company}. This board carries: `
      + `${governance.labs.map(lab => lab.name).join(", ")}`);
  }
  const practices = practicesOf();
  return {
    as_of: governance.as_of,
    researched: governance.researched,
    scored_by: "Polaris Collective, by hand from public documents. No panel judged these "
      + "figures, and a different reading could move a company by a few points.",
    papers: governance.papers,
    measures: {
      overall: {
        max: OVERALL,
        means: "The four questions added together, each of them the mean of its checks.",
      },
      minimum: governance.minimum_note,
      questions: governance.questions.map(question => ({
        id: question.id,
        name: question.name,
        max: 4,
        means: question.explainer,
        asked: question.question,
        reading: question.reading,
        part_of_the_minimum: question.minimum === true,
        checks: question.checks.map(check => ({
          id: check.id,
          name: check.short,
          max: 4,
          means: check.label,
          reading: check.reading,
          anchors: check.anchors,
        })),
      })),
      best_practices: {
        max: practiceMax(),
        means: "Practices shown beside the score and never counted in it.",
        note: governance.disclosure_note,
        practices: practices.map(practice => ({
          id: practice.id,
          name: practice.short,
          max: practice.asked_to_publish === false ? null : PRACTICE,
          means: practice.label,
          reading: practice.reading,
          anchors: practice.anchors || governance.supporting_scale,
          ...(practice.asked_to_publish === false
            ? { not_assessed: governance.internal_note }
            : {}),
        })),
      },
    },
    companies: companies.map(company => ({
      id: company.id,
      name: company.name,
      rank: company.rank,
      open_weights: company.open_weights === true,
      overall: { figure: company.total, max: OVERALL },
      questions: governance.questions.map(question => ({
        id: question.id,
        figure: company.byQuestion[question.id],
        max: 4,
        checks: question.checks.map(check => ({
          id: check.id,
          figure: governance.scores[company.id][check.id],
          max: 4,
        })),
        found: governance.profiles[company.id][question.id],
      })),
      best_practices: {
        figure: company.supporting,
        max: practiceMax(),
        practices: practices.map(practice => ({
          id: practice.id,
          figure: governance.supporting_scores[company.id]?.[practice.id]
            ?? governance.internal_scores[company.id]?.[practice.id] ?? null,
          max: practice.asked_to_publish === false ? null : PRACTICE,
          evidence: governance.internal_evidence[company.id]?.[practice.id] ?? null,
          note: governance.supporting_notes[company.id]?.[practice.id] ?? null,
        })),
        found: governance.profiles[company.id].supporting,
      },
    })),
  };
}
