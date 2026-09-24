/**
 * The two boards of the overview, as answers.
 *
 * A client asking the index what it holds should be able to get what a reader
 * sees. Both boards are read from the publication the answer is about, which
 * froze them when it was built (the constitutions and governance columns of
 * aci_publications), exactly as the front page reads them, so a client and a
 * reader are never told different things. A publication built before boards
 * were frozen answers that it is not compatible, as the page says.
 *
 * Pure, as app/lib/mcp-tools.mjs is: each takes a snapshot and its arguments,
 * and a fixture exercises both with no network.
 */
import { ranked as rankedCompanies } from "../../site/governance.js";
import { ToolError } from "./mcp-tools.mjs";

/* The second board's own maxima: 4 for a question and each of its checks, 2 for
 * each practice that carries a score. The two figures a company gets are out of
 * 10 each, and its final score is their weighted average, out of 10. The
 * checks and practices are answered on the scale they were given on. */
const SCALE = 4;
const PRACTICE = 2;

/** A company named in an argument, matched loosely: "openai" finds OpenAI. */
const matches = (name, wanted) =>
  !wanted || String(name).toLowerCase().includes(String(wanted).toLowerCase().trim());

/* The first board as the front page draws it, from the board the publication
 * froze (site/constitutions.json as it stood when the publication was built).
 * Every figure is out of 10, as on the page: a criterion given out of 4 is
 * answered with both, and the final score is the average of the document as a
 * whole and the behaviours, with the weights the board carries. */
const TEN = 10;
const CRITERION_SCALE = 4;
const mean = values => (values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const numeric = value => (Number.isFinite(value) ? value : null);

/** A depth read against the board's own scale: the level at or below it. */
function depthLevel(value, scale) {
  const levels = [...scale].sort((a, b) => a.level - b.level);
  const reached = [...levels].reverse().find(level => value >= level.level) || levels[0];
  return { level: reached.level, name: reached.name, means: reached.plain,
           and_part_of_the_next: value > reached.level };
}

/**
 * The board of constitutions: what the front page shows, every figure with what
 * it rests on, for the publication being answered from.
 *
 * `args.company` narrows it to the companies whose name matches. The comparison
 * each behaviour's popover folds away is left out, as the page folds it: a
 * company's answer is about its own constitution.
 */
export function constitutionsBoard(snapshot, args = {}) {
  const board = snapshot?.constitutions;
  if (!board?.companies?.length || !board.behaviours?.length || !board.criteria?.length
      || !board.weights || !board.scale?.depth) {
    throw new ToolError(INCOMPATIBLE);
  }
  const scale = board.scale.depth;
  const categories = [...new Set(board.behaviours.map(one => one.category))];
  const figures = company => {
    const depths = board.behaviours
      .map(one => numeric(company.behaviours?.[one.slug]?.score)).filter(v => v !== null);
    const behaviours = mean(depths) ?? 0;
    const whole = numeric(company.whole?.total) ?? 0;
    return { whole, behaviours,
             final: whole * board.weights.whole + behaviours * board.weights.behaviours };
  };
  // Ranked as the page ranks: by the final score, companies level on it sharing
  // a place and the next place skipped.
  const scored = board.companies.map(company => ({ company, ...figures(company) }))
    .sort((a, b) => b.final - a.final);
  const ranked = scored.map(entry => ({
    ...entry,
    rank: 1 + scored.filter(other => other.final - entry.final > 1e-9).length,
  }));
  const chosen = ranked.filter(entry => matches(entry.company.name, args.company));
  if (!chosen.length) {
    throw new ToolError(`no company called ${args.company}. This board carries: `
      + `${board.companies.map(company => company.name).join(", ")}`);
  }
  return {
    publication: snapshot.publication,
    as_of: board.as_of ?? null,
    measures: {
      final_score: {
        max: TEN,
        means: "The average of the document as a whole and the behaviours. It ranks the "
          + "companies.",
        weights: board.weights,
      },
      whole_document: {
        max: TEN,
        means: "How the constitution is built, read over the whole document: the average of "
          + `${board.criteria.length} criteria, each given from 0 to ${CRITERION_SCALE} and `
          + "shown out of 10.",
        criteria: board.criteria.map(criterion => ({
          id: criterion.id, name: criterion.name, given_out_of: CRITERION_SCALE,
          means: criterion.what_it_is, why_it_matters: criterion.why_it_matters ?? null,
        })),
      },
      behaviours: {
        max: TEN,
        means: "How far the constitution goes on each behaviour, the average over every "
          + "behaviour, each counting the same.",
        depth_scale: scale.map(({ level, name, plain }) => ({ level, name, means: plain })),
        behaviours: board.behaviours.map(one => ({
          slug: one.slug, name: one.name, category: one.category,
          is: one.is ?? null, is_not: one.is_not ?? null,
        })),
      },
    },
    takeaways: board.takeaways ?? [],
    companies: chosen.map(({ company, whole, behaviours, final, rank }) => ({
      id: company.id,
      name: company.name,
      rank,
      document: company.document ?? null,
      publishes_a_constitution: Boolean(company.document),
      final_score: final,
      profile: company.profile ?? null,
      whole_document: {
        figure: whole,
        criteria: board.criteria.map(criterion => {
          const entry = company.whole?.criteria?.[criterion.id] ?? {};
          const given = numeric(entry.score);
          return {
            id: criterion.id, name: criterion.name,
            figure: given === null ? null : given / CRITERION_SCALE * TEN, given,
            what_the_document_does: entry.what_the_document_does ?? null,
            why: entry.why ?? null,
          };
        }),
      },
      behaviours: {
        figure: behaviours,
        categories: categories.map(name => ({
          name,
          figure: mean(board.behaviours.filter(one => one.category === name)
            .map(one => numeric(company.behaviours?.[one.slug]?.score))
            .filter(v => v !== null)),
        })),
        cells: board.behaviours.map(one => {
          const entry = company.behaviours?.[one.slug] ?? {};
          const figure = numeric(entry.score);
          return {
            behaviour: one.slug, name: one.name, category: one.category, figure,
            level: figure === null ? null : depthLevel(figure, scale),
            says: entry.says ?? null, why: entry.why ?? null,
          };
        }),
      },
    })),
  };
}

/* The governance board of the publication being answered from. Set at the head
 * of governanceBoard, which is synchronous, so the helpers below read the one
 * board that call is about and no other. */
let governance = null;

/* What a board tool says of a publication that cannot answer it, in the words
 * the site uses. */
export const INCOMPATIBLE = "This publication is not compatible with this version of the "
  + "index: it carries no board of this kind, or not in a shape this server reads.";

/* A practice by its id, from either list, and whether any figure counts it. The
 * one the paper raises as an open problem is counted in neither. */
const practiceOf = id => governance.supporting.find(practice => practice.id === id)
  || governance.internal.find(practice => practice.id === id);
const practiceScore = (labId, id) => governance.supporting_scores[labId]?.[id]
  ?? governance.internal_scores[labId]?.[id] ?? null;
const unscoredIds = () => governance.columns.flatMap(column => column.unscored || []);

/* The passages one row rests on, or the sentence saying where we looked and
 * found nothing. The four practices only a company can show keep the block they
 * have always had; every check and every other practice reads from `evidence`,
 * which carries the same shape. */
const evidenceOf = (labId, id) => governance.internal_evidence[labId]?.[id]
  ?? governance.evidence?.[labId]?.[id] ?? null;

/* One column's rows, in the order the board shows them: its questions with
 * their checks, then its practices. */
const questionOf = id => governance.questions.find(question => question.id === id);

/**
 * The board of governance: nine companies on a final score and the two figures
 * it adds.
 *
 * Read from the board the publication froze. Nothing in it was judged by a
 * panel: the scores were given by hand from public documents, as of the date
 * the data carries, and the answer says so in `as_of` and `scored_by`.
 */
export function governanceBoard(snapshot, args = {}) {
  if (!snapshot?.governance?.columns || !snapshot.governance.labs) {
    throw new ToolError(INCOMPATIBLE);
  }
  governance = snapshot.governance;
  const companies = rankedCompanies(governance)
    .filter(company => matches(company.name, args.company));
  if (!companies.length) {
    throw new ToolError(`no company called ${args.company}. This board carries: `
      + `${governance.labs.map(lab => lab.name).join(", ")}`);
  }
  return {
    publication: snapshot.publication,
    as_of: governance.as_of,
    researched: governance.researched,
    scored_by: "Polaris Collective, by hand from public documents. No panel judged these "
      + "figures, and a different reading could move a company by a few points.",
    papers: governance.papers,
    measures: {
      /* The final score ranks the companies and is the weighted average of the
       * two figures. The answer carries the weights and what they mean in the
       * board's own words. */
      final_score: {
        name: governance.total.name,
        max: governance.total.out_of,
        means: governance.total.plain,
        reading: governance.total.about,
        weights: governance.total.weights,
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
            evidence: evidenceOf(company.id, check.id),
          })),
          found: governance.profiles[company.id][id],
        })),
        practices: column.practices.map(id => ({
          id,
          figure: practiceScore(company.id, id),
          max: PRACTICE,
          evidence: evidenceOf(company.id, id),
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
