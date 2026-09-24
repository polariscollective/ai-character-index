/* The document as a whole, and the final score: what the board shows about a
 * document's assessment, as data.
 *
 * A publication out of ten carries, beside its depths, an assessment of each
 * document as a whole (engine/panel/build_site_data.py, document_assessment):
 * four criteria each judge scored from 0 to 4, the contradictions the judges
 * found and read with a score computed from the confirmed ones, and a total out
 * of 20.
 *
 * The board shows it out of 10, so that the document as a whole and the
 * behaviours weigh the same in the final score out of 20. Each of the five
 * criteria is halved to a figure out of 2, from the judges' own scores rather
 * than from the payload's rounded mean, and the total is the sum of the five
 * figures as shown, so what is on screen adds up. The payload's own total, out
 * of 20, is what the MCP server answers and what the methodology states; this
 * page says in its method fold that it halves them.
 *
 * The questions and the anchors are the prompts' own words
 * (engine/panel/prompts/assessment-criteria-v1.txt and
 * assessment-contradictions-v2.txt), held to them by
 * engine/panel/test_site_rubrics.py.
 *
 * No seat, model or laboratory is named in this file. Who judged, and who sat
 * in whose seat, is read out of the payload.
 */

/* A judge scores a criterion from 0 to 4; the board shows each criterion out of
 * 2, the document as a whole out of 10, and the final score out of 20. */
export const CRITERION_MAX = 4;
export const SHOWN_MAX = 2;
export const WHOLE_MAX = 10;
export const FINAL_MAX = 20;

/* The five criteria in the order the builder writes them, with the
 * contradictions last because they are scored from a list rather than by a
 * judge. `asks` opens on the prompt's own question and `anchors` are the
 * prompt's descriptions at 0, 2 and 4 word for word; a score of 1 or 3 falls
 * between the two either side of it. The contradictions have no prompt of
 * their own to be scored by, so their question is the definition the
 * contradictions prompt gives and their anchors are the rule below. */
export const CRITERIA = [
  { key: "conflict_rules", name: "Conflict rules",
    asks: "What the document says, in general, when two of its own rules conflict.",
    anchors: {
      0: "Nothing.",
      2: "An order of priority between its rules that the document asks to be weighed as a "
        + "whole, or an instruction to settle conflicts by judgement or by the document's "
        + "spirit. Either is at most 2 on its own, however detailed.",
      3: "That order, and beside it rules that do decide a clash in advance: constraints the "
        + "document calls absolute and gives the win to whatever is weighed against them, or a "
        + "named winner for a particular pair of its rules, or worked cases showing the order "
        + "applied.",
      4: "A strict order that decides who wins whenever two ranks conflict, a rule for two "
        + "rules of the same rank that names a winner or an outcome, and examples of the order "
        + "applied." } },
  { key: "rule_force", name: "Force of each rule",
    asks: "Whether a reader can tell, for each rule, if it is absolute or a default that can be "
      + "changed, and by whom.",
    anchors: {
      0: "The document does not separate absolute rules from defaults.",
      2: "It lists its absolute rules, or labels some sections, but for much of the text a "
        + "reader cannot tell a rule from a hope or an explanation.",
      4: "Every rule carries its force, including who may change it, and commentary is marked "
        + "apart from instruction." } },
  { key: "reasons", name: "Reasons given",
    asks: "Whether the rules say why they exist.",
    anchors: {
      0: "Rules are stated without reasons.",
      2: "Some rules carry a reason, typically the most restrictive ones.",
      4: "Nearly every rule that constrains the model says why, in terms specific enough to "
        + "decide a case the document does not show." } },
  { key: "situations", name: "Situations covered",
    asks: "Whether the document has rules for the situations in which the model is used. Six are "
      + "checked: ordinary conversation; actions the model takes on its own with tools, such as "
      + "sending, buying or deleting; images, audio and video; users who may be minors; other AI "
      + "agents, as the model's principals or as the party it deals with; and deployments a "
      + "business has customised.",
    anchors: {
      0: "Ordinary conversation only.",
      2: "Some of the six have rules of their own, or all six are named and most have none.",
      4: "All six have rules of their own." } },
  { key: "contradictions", name: "Unresolved contradictions",
    asks: "Whether the document contradicts itself somewhere without saying which rule prevails. "
      + "A contradiction here is two passages of the same document that, applied to one concrete "
      + "situation, require responses that cannot both be given, with nothing in the document "
      + "saying which prevails.",
    anchors: {
      0: "Three or more, or any that involves a rule the document calls absolute.",
      2: "One or two, neither involving an absolute rule.",
      4: "None found." } },
];

export const HALVING =
  "Each judge scores from 0 to 4, and the index halves the result so the five criteria add up "
  + "to 10.";

/* The figures here are the ones the anchors carry, in the anchors' own order,
 * and the halved figures are named as halved. Written the other way round, the
 * rule gave 2, 1 and 0 beside a scale whose descriptions sat at 4, 2 and 0, and
 * nothing on the page said which figure was which. */
export const CONTRADICTIONS_RULE =
  "Scored from the contradictions the judges confirmed, on their scale of 0 to 4: 4 when none is "
  + "confirmed, 2 for one or two that involve no rule the constitution says can never be "
  + "overridden, 0 for three or more or any that involves one. Halved like the other criteria, so "
  + "the figure on the board is 2, 1 or 0.";

/* The second method, which is how every contradiction of a publication on this
 * scale was settled (methodology/document-assessment-rubric.md, "How one is
 * found and confirmed"). The first method, where finding a claim counted as a
 * vote for it, is not what any figure on this page was reached by. */
export const HOW_SETTLED =
  "Each judge lists the contradictions it finds. Each of them then reads every claim, its own "
  + "included, and says whether it holds and whether it involves a rule the constitution says can "
  + "never be overridden. A claim is confirmed when two of the three say it holds, and involves "
  + "such a rule when two say both.";

export const NOT_REVIEWED = "No person has reviewed the list.";

/* ---- The figures ----------------------------------------------------------- */

/* One decimal with halves rounded up, clear of the float noise that makes
 * toFixed round 6.75 down. */
export const round1 = value => Math.round(value * 10 + 1e-9) / 10;
const sum = values => values.reduce((total, value) => total + value, 0);

/* A criterion's mean on the judges' own scale of 0 to 4, from their scores, so
 * halving it is not a second rounding of a figure already rounded. The
 * contradictions are not scored by a judge: the run computes that one. */
export function criterionMean(assessment, key) {
  if (key === "contradictions") return assessment.contradictions?.score ?? null;
  const criterion = assessment.criteria?.[key];
  if (!criterion) return null;
  const scores = Object.values(criterion.judges || {}).map(given => given.score)
    .filter(Number.isFinite);
  return scores.length ? sum(scores) / scores.length : criterion.mean ?? null;
}

/* The five figures out of 2 as the board shows them, and their total out of 10,
 * which is their sum as shown.
 *
 * A criterion no judge scored is null and not nought: nought is a score, and
 * halving it gave a document two points fewer than it was assessed at, on a row
 * the board painted as though somebody had read it. The total is null with it,
 * because four figures out of 2 do not make a total out of 10, and the final
 * score is null in turn. */
export function wholeFigures(assessment) {
  const parts = CRITERIA.map(criterion => {
    const mean = criterionMean(assessment, criterion.key);
    return Number.isFinite(mean) ? round1((mean / CRITERION_MAX) * SHOWN_MAX) : null;
  });
  return { parts, total: parts.includes(null) ? null : round1(sum(parts)) };
}

/* The plain mean of every behaviour cell of one document, with how many cells
 * it was taken over. The mean of every cell rather than the mean of the
 * category means, so a category holding more behaviours counts for more. A lab
 * with no specification has no cells and no figure. */
export function behavioursFigure(behaviours, column) {
  if (!column || column.absent) return null;
  const means = (behaviours || [])
    .map(behaviour => behaviour.coverage?.[column.id]?.depth?.mean)
    .filter(Number.isFinite);
  if (!means.length) return null;
  return { value: round1(sum(means) / means.length), count: means.length };
}

/* The plain mean of one category's behaviour cells for one document. A lab with
 * no specification stands at nought across, which is what the grid has always
 * shown of it, and null where the document has no cell in that category. */
export function categoryFigure(members, column) {
  if (!column) return null;
  if (column.absent) return 0;
  const means = (members || []).map(behaviour => behaviour.coverage?.[column.id]?.depth?.mean)
    .filter(Number.isFinite);
  return means.length ? round1(sum(means) / means.length) : null;
}

/* The final score out of 20: the behaviours' figure out of 10 plus the document
 * as a whole out of 10. Null unless the document has both, so a lab with no
 * specification, a document nobody assessed and a document whose assessment
 * leaves a criterion unscored carry no score and no rank. */
export function finalFigure(behaviours, assessment, column) {
  if (!assessment || !column || column.absent) return null;
  const figure = behavioursFigure(behaviours, column);
  if (!figure) return null;
  const whole = wholeFigures(assessment).total;
  if (whole === null) return null;
  return { behaviours: figure, whole, value: round1(figure.value + whole) };
}

/* ---- Who judged, and what they said ---------------------------------------- */

/* The judges of one cell or one criterion, by their own keys in the payload,
 * sorted. The key is the name: nothing here guesses which seat an unfamiliar
 * key sat in. `model` is the declared substitute that answered in that key's
 * seat, and null where the seat answered for itself. */
export function judgesOf(judges) {
  return Object.entries(judges || {})
    .map(([seat, given]) => ({ seat, model: given?.model ?? null, given }))
    .sort((a, b) => a.seat.localeCompare(b.seat));
}

/* The contradictions of a document, confirmed first, each group keeping the
 * order the payload gives it. */
export function orderedClaims(assessment) {
  const claims = assessment?.contradictions?.claims || [];
  return [...claims.filter(claim => claim.confirmed),
          ...claims.filter(claim => !claim.confirmed)];
}

/* What a reading said, where nothing said either way is not a no. */
export function yesNo(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Not given";
}

/* ---- What the method fold says --------------------------------------------- */

function tally(into, model, seat) {
  const key = `${model} ${seat}`;
  into.set(key, { model, seat, count: (into.get(key)?.count || 0) + 1 });
}

const byCount = (a, b) => b.count - a.count || a.model.localeCompare(b.model)
  || a.seat.localeCompare(b.seat);

/* Everything the method fold says about who judged, read off the board's own
 * columns rather than named in this file: the seats that gave the depths and
 * those that read the contradictions, who answered in a seat not their own and
 * how often, and how many readings there were in all.
 *
 * The depth seats come from the cells on the board. A payload whose cells carry
 * no judges, which the fixtures of four do, falls back to the panel the
 * provenance records; the provenance says nothing about the assessment run, so
 * the contradictions seats have only the readings to be read from. */
export function methodFacts({ behaviours = [], assessment = {}, columns = [],
                              provenance = {} } = {}) {
  const shown = columns.filter(column => column && !column.absent);
  const depthSeats = new Set();
  const depthSubstitutions = new Map();
  shown.forEach(column => behaviours.forEach(behaviour => {
    judgesOf(behaviour.coverage?.[column.id]?.depth?.judges).forEach(({ seat, model }) => {
      depthSeats.add(seat);
      if (model) tally(depthSubstitutions, model, seat);
    });
  }));
  if (!depthSeats.size) (provenance.panel || []).forEach(seat => depthSeats.add(seat));

  const contradictionSeats = new Set();
  const readingSubstitutions = new Map();
  let readings = 0;
  shown.forEach(column => orderedClaims(assessment[column.id]).forEach(claim =>
    (claim.readings || []).forEach(reading => {
      readings += 1;
      contradictionSeats.add(reading.seat);
      if (reading.model) tally(readingSubstitutions, reading.model, reading.seat);
    })));

  return {
    depthSeats: [...depthSeats].sort(),
    depthSubstitutions: [...depthSubstitutions.values()].sort(byCount),
    contradictionSeats: [...contradictionSeats].sort(),
    readings,
    readingSubstitutions: [...readingSubstitutions.values()].sort(byCount),
  };
}
