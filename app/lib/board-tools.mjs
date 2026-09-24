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

/* The second board's own maxima: 4 for a question and each of its checks, 2 for
 * each practice that carries a score. The two figures a company gets are out of
 * 10 each, and its final score is their sum, out of 20. */
const SCALE = 4;
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

/* A practice by its id, from either list, and whether any figure counts it. The
 * one the paper raises as an open problem is counted in neither. */
const practiceOf = id => governance.supporting.find(practice => practice.id === id)
  || governance.internal.find(practice => practice.id === id);
const practiceScore = (labId, id) => governance.supporting_scores[labId]?.[id]
  ?? governance.internal_scores[labId]?.[id] ?? null;
const unscoredIds = () => governance.columns.flatMap(column => column.unscored || []);

/* One column's rows, in the order the board shows them: its questions with
 * their checks, then its practices. */
const questionOf = id => governance.questions.find(question => question.id === id);

/**
 * The board of governance: nine companies on a final score and the two figures
 * it adds.
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
  return {
    as_of: governance.as_of,
    researched: governance.researched,
    scored_by: "Polaris Collective, by hand from public documents. No panel judged these "
      + "figures, and a different reading could move a company by a few points.",
    papers: governance.papers,
    measures: {
      /* The final score ranks the companies and is the sum of the two figures.
       * The answer carries what that sum means in the board's own words. */
      final_score: {
        name: governance.total.name,
        max: governance.total.out_of,
        means: governance.total.plain,
        reading: governance.total.about,
        adds: governance.columns.map(column => column.id),
      },
      figures: governance.columns.map(column => ({
        id: column.id,
        name: column.name,
        max: column.out_of,
        means: column.plain,
        reading: column.about,
        made_of: {
          questions: column.questions,
          practices: column.practices,
          counted_in_no_figure: column.unscored || [],
        },
      })),
      minimum: governance.minimum_note,
      questions: governance.questions.map(question => ({
        id: question.id,
        name: question.name,
        max: SCALE,
        from: governance.papers[question.paper].credit,
        means: question.explainer,
        asked: question.question,
        reading: question.reading,
        part_of_the_minimum: question.minimum === true,
        checks: question.checks.map(check => ({
          id: check.id,
          name: check.short,
          max: SCALE,
          means: check.label,
          reading: check.reading,
          anchors: check.anchors,
        })),
      })),
      best_practices: {
        max: PRACTICE,
        means: "Practices scored 0, 1 or 2, each counted in one of the two figures.",
        note: governance.disclosure_note,
        practices: [...governance.supporting, ...governance.internal].map(practice => ({
          id: practice.id,
          name: practice.short,
          max: practice.asked_to_publish === false ? null : PRACTICE,
          from: governance.papers[practice.paper].credit,
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
      final_score: company.total,
      figures: governance.columns.map(column => ({
        id: column.id,
        figure: company.byColumn[column.id],
        max: column.out_of,
        questions: column.questions.map(id => ({
          id,
          figure: company.byQuestion[id],
          max: SCALE,
          checks: questionOf(id).checks.map(check => ({
            id: check.id,
            figure: governance.scores[company.id][check.id],
            max: SCALE,
          })),
          found: governance.profiles[company.id][id],
        })),
        practices: column.practices.map(id => ({
          id,
          figure: practiceScore(company.id, id),
          max: PRACTICE,
          evidence: governance.internal_evidence[company.id]?.[id] ?? null,
          note: governance.supporting_notes[company.id]?.[id] ?? null,
        })),
        found: governance.profiles[company.id][column.prose],
      })),
      counted_in_no_figure: unscoredIds().map(id => ({
        id,
        name: practiceOf(id).short,
        figure: null,
        not_assessed: governance.internal_note,
      })),
    })),
  };
}
