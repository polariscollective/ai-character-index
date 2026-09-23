/* The overview: how each lab's specification scores, behaviour by behaviour and
 * as a document.
 *
 * Four sources, and only the last two are ours to lose. The payload and the
 * documents are the reader's own endpoints, so the figures here and the figures
 * there are the same publication's. The link notes are written beside the site
 * by engine/panel/link_overview.py and link_depth.py and are not deployed: the
 * page renders without them and simply has less to say when a figure is
 * pressed.
 *
 * The board is site/board.js, which the governance view draws too. What is on
 * it depends on the publication: out of ten it carries a final score out of 20,
 * the document as a whole out of 10 opening into five criteria out of 2, and
 * each behaviour category out of 10 opening into its behaviours; out of four,
 * which is every publication before September 2026, it carries the categories
 * alone, on the scale of four, because such a payload has no assessment and so
 * no final score.
 *
 * Nothing is built with innerHTML. The passages are a model's words and the
 * rationales are a model's words, so every one of them lands as a text node.
 *
 * This file owns the tabs between the two views.
 */

import { initializeGovernance } from "./governance.js";
import { createBoard, element, mono, paragraph, ORDINALS, level, rankBy } from "./board.js";
/* The depth scales, their words and their levels: one module for this page and
 * the reader, which used to carry a copy each. */
import { depthScaleOf, levelsOf, depthWords, depthPhrase, CONDITIONS_BRIEF, ODD_BRIEF }
  from "./depth-scale.js";
/* What the board says about a document assessed as a whole, as data: the five
 * criteria and their anchors, every figure, and who judged. No seat, model or
 * laboratory is named there or here; both read the payload. */
import { CRITERIA, CRITERION_MAX, SHOWN_MAX, WHOLE_MAX, FINAL_MAX, HALVING, CONTRADICTIONS_RULE,
         HOW_SETTLED, NOT_REVIEWED, criterionMean, wholeFigures, behavioursFigure, categoryFigure,
         finalFigure, judgesOf, orderedClaims, yesNo, methodFacts }
  from "./document-assessment.js";

/* Labs the index carries no specification for. They are shown at nought across
 * every behaviour, which is what was asked for, and pressing one says why: a
 * nought here is the absence of a document to read, not a document that was
 * read and found to say nothing. Those are different claims and the board must
 * not let one pass for the other.
 *
 * Mistral AI, Moonshot AI and DeepSeek joined in September 2026, when the
 * governance view took them on: none publishes a model spec either, and a lab
 * the other view ranks should not be missing from this one. */
const WITHOUT_A_SPECIFICATION = ["Google DeepMind", "xAI", "Meta", "Mistral AI", "Moonshot AI",
  "DeepSeek"];

const byId = id => document.getElementById(id);

const nodes = {
  status: byId("status"),
  legend: byId("legend"),
  depthKey: byId("depth-key"),
  depthKeyTitle: byId("depth-key-title"),
  depthKeyOdd: byId("depth-key-odd"),
  ties: byId("ties"),
  method: byId("method-body"),
  sheet: byId("sheet"),
  sheetTitle: byId("sheet-title"),
  sheetLink: byId("sheet-link"),
  sheetBody: byId("sheet-body"),
  sheetClose: byId("sheet-close"),
};

/* The table, the popover and the folds. The governance view builds its own from
 * the same file, and the two never meet: each holds the popover its own markup
 * names. */
const board = createBoard({
  nodes: { table: byId("board"), pop: byId("grid-pop"), expandAll: byId("expand-all") },
  everyRow: { show: "Show every row", hide: "Hide every row" },
});

/* `scale` is the publication's, read from its payload: 10 on a publication out
 * of ten and 4 on every one before it. `assessment` is null on a publication
 * that carries none, which is what takes the final score and the whole document
 * off the board. */
const state = { scale: 4, behaviours: [], categories: [], columns: [], assessment: null,
                provenance: {}, passages: {}, depths: {}, registry: {} };

/* A ?publication= pin reaches the board as it reaches the doc reader: every
 * route the board reads from is asked for that publication, and so is every
 * link out of it, so a link from the change log shows the figures as that
 * publication published them. The governance view is not part of any
 * publication and does not change with it. */
const PIN = new URLSearchParams(location.search).get("publication");
const PINNED = PIN ? `?publication=${encodeURIComponent(PIN)}` : "";

async function loadJSON(url, fallback) {
  try {
    const response = await fetch(url);
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

/* One column per specification at its newest version. A document id is the
 * specification and its version, and versions are dated strings, so the highest
 * string is the newest. Keyed by specification rather than by lab: they are the
 * same thing while each lab carries one document, and a lab that publishes a
 * second one deserves a column rather than being folded into the other. */
function newestPerSpecification(documents) {
  const newest = new Map();
  documents.forEach(document_ => {
    const spec = String(document_.id).split("@", 1)[0];
    const held = newest.get(spec);
    if (!held || String(document_.version) > String(held.version)) {
      newest.set(spec, document_);
    }
  });
  // Alphabetical over all of them, mixing the labs with a document into the
  // labs without one. Grouping the examined ones first would read as a ranking
  // of its own, and a reader looking for a lab should find it where its name
  // falls rather than where its coverage does.
  return [...newest.values()]
    .concat(WITHOUT_A_SPECIFICATION.map(lab => ({ lab, absent: true })))
    .sort((a, b) => a.lab.localeCompare(b.lab, "en", { sensitivity: "base" }));
}

/* A version whose day is 00 has no day recorded, so it is shown without one.
 * "2026-04-00" is a date nobody can read, and that nought is the absence of a
 * day rather than a day. Written as a rule rather than a case, so the next
 * specification dated to the month is handled without an edit here. */
const shownVersion = version => String(version || "").replace(/-00$/, "");

/* ---- The figures, and what each row is out of ------------------------------- */

const assessmentOf = column =>
  (column && !column.absent ? state.assessment?.[column.id] ?? null : null);

/* A category's figure is a mean of depths, so it is read against the depth
 * scale: WHOLE_MAX on a publication of ten, where the two are the same number,
 * and 4 on a publication of four, where the behaviours under it are on that
 * scale too. */
const categoryMax = () => state.scale;

/* A document the payload says nothing about at all. Its cells are left empty
 * rather than marked NA or nought: NA would say it was examined and not
 * assessed, and a nought would say it was read and found silent. */
const hasFigures = column =>
  Boolean(column.absent) || behavioursFigure(state.behaviours, column) !== null;

const shown = value => value.toFixed(1);

/* Labs by what the board leads on: the final score out of 20 where the
 * publication carries one, and the behaviours' own mean where it does not,
 * which is every publication before the scale of ten. A rank is one more than
 * the number of labs ahead, so labs level on the figure as shown share a place
 * and the next rank skips. The governance view breaks a tie on its best
 * practices; there is no second figure here, so a tie stands. The sort is
 * stable, so level labs keep the alphabetical order they came in, and the labs
 * with no figure follow, unranked, in that order too. */
function leadFigure(column) {
  const final = finalFigure(state.behaviours, assessmentOf(column), column);
  if (final) return final.value;
  if (state.assessment) return null;
  return behavioursFigure(state.behaviours, column)?.value ?? null;
}

function ranked(columns) {
  const scored = columns.map(column => ({ column, lead: leadFigure(column) }))
    .filter(entry => entry.lead !== null)
    .sort((a, b) => b.lead - a.lead);
  rankBy(scored, (a, b) => a.lead > b.lead && !level(a.lead, b.lead))
    .forEach(entry => { entry.column.rank = entry.rank; });
  return [...scored.map(entry => entry.column), ...columns.filter(column => !column.rank)];
}

const rankedColumns = () => state.columns.filter(column => column.rank);

function rankLine(column) {
  const all = rankedColumns();
  const alongside = all.filter(other => other !== column && other.rank === column.rank);
  return `Ranked ${column.rank} of ${all.length}`
    + `${alongside.length ? `, level with ${alongside.map(other => other.lab).join(" and ")}` : ""}.`;
}

/* ---- Small builders --------------------------------------------------------- */

/* Every address out of this page carries the pin, or the reader would open on
 * the publication the site happens to serve rather than the one on screen. */
const readerLink = params =>
  `/spec-reader/?${new URLSearchParams({ ...params, ...(PIN ? { publication: PIN } : {}) })}`;

/* "OpenAI: harm and safety", keeping a leading acronym as it is. */
const lowerFirst = text =>
  (/^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));
const documentLine = column => `${column.title}, ${shownVersion(column.version)}.`;

function link(href, text) {
  const node = element("a", null, text);
  node.href = href;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  return node;
}

/* The depth scale, with the figure's place marked: its own anchor when it
 * rounds to an even number, the two either side when it rounds to an odd one.
 * The conditions and the line on odd figures belong to the scale of ten, which
 * is the only one that has a level between two anchors. */
function depthScale(mean) {
  const fragment = document.createDocumentFragment();
  const levels = levelsOf(state.scale);
  const top = levels[levels.length - 1].level;
  const list = element("ol", "anchors");
  const whole = mean === null ? null : Math.max(0, Math.min(top, Math.round(mean)));
  const near = state.scale === 10 ? 1 : 0.5;
  levels.forEach(({ level: at, anchor, brief }) => {
    const item = element("li");
    if (whole !== null && Math.abs(whole - at) <= near) item.classList.add("is-here");
    const text = element("span");
    text.append(element("span", "anchor-name", anchor), document.createTextNode(`: ${brief}`));
    item.append(element("span", "anchor-level", String(at)), text);
    list.append(item);
  });
  fragment.append(list);
  if (state.scale === 10) {
    const conditions = element("ul", "check-list");
    CONDITIONS_BRIEF.forEach(condition => conditions.append(element("li", "", condition)));
    fragment.append(element("p", "subtitle", `The three conditions for ${top}:`), conditions,
      element("p", "subtitle", ODD_BRIEF));
  }
  return fragment;
}

/* A criterion's anchors on the judges' scale, with the mean's place marked as
 * the governance view marks a check's: every description within 1 of it. */
function criterionScale(criterion, mean04) {
  const list = element("ol", "anchors");
  [0, 2, CRITERION_MAX].forEach(at => {
    const item = element("li");
    if (mean04 !== null && Math.abs(mean04 - at) <= 1 + 1e-9) item.classList.add("is-here");
    item.append(element("span", "anchor-level", String(at)),
      element("span", "", criterion.anchors[at]));
    list.append(item);
  });
  const fragment = document.createDocumentFragment();
  fragment.append(list, element("p", "subtitle",
    "A score of 1 or 3 falls between the descriptions either side of it."));
  return fragment;
}

/* The heading over a criterion's anchors. It says "before halving" because the
 * figure in the cell above it is halved and these anchors are not, and the
 * contradictions are not said to be the judges' because no judge scores them:
 * that figure is computed from the claims the panel confirmed. */
const scaleHeading = criterion => (criterion.key === "contradictions"
  ? `What the score means, before halving, 0 to ${CRITERION_MAX}`
  : `What the judges' scores mean, 0 to ${CRITERION_MAX}`);

/* "a", or "d in the b seat" where a declared substitute answered. The keys are
 * the payload's own: nothing here guesses which seat an unfamiliar one sat in. */
function judgeName(seat, model) {
  const name = element("span");
  if (model) {
    name.append(mono(model), document.createTextNode(" in the "), mono(seat),
      document.createTextNode(" seat"));
  } else {
    name.append(mono(seat));
  }
  return name;
}

function readingsList(judges, valueKey, outOf) {
  const list = element("ul", "judges");
  judgesOf(judges).forEach(({ seat, model, given }) => {
    const item = element("li");
    const who = element("span", "who");
    who.append(judgeName(seat, model), document.createTextNode(" gave "),
      mono(String(given[valueKey])), document.createTextNode(` out of ${outOf}`));
    item.append(who);
    if (given.rationale) item.append(element("p", "", given.rationale));
    list.append(item);
  });
  return list;
}

/* A note written beside the site rather than published with the payload, so it
 * may not be there. Where it is missing the heading stays and says so, because
 * a heading over nothing reads as a note that was lost. */
function noteUnder(heading, text) {
  const fragment = document.createDocumentFragment();
  fragment.append(board.h3(heading));
  if (!text) {
    fragment.append(paragraph("Not written yet for this specification and behaviour.", "missing"));
    return fragment;
  }
  text.split(/\n{2,}/).forEach(block => {
    block.split("\n").filter(Boolean).forEach(line => fragment.append(
      /^[A-Z][A-Z ]+:$/.test(line.trim())
        ? board.h3(line.trim().replace(/:$/, "").toLowerCase().replace(/^./, c => c.toUpperCase()))
        : paragraph(line)));
  });
  return fragment;
}

/* ---- What each popover says ------------------------------------------------- */

function aboutFinal(content) {
  board.titled(content, `Final score, out of ${FINAL_MAX}`,
    `The sum of two figures, each out of ${WHOLE_MAX}, so the two count equally.`);
  const parts = element("ul", "check-list");
  parts.append(
    element("li", "", `Behaviours: the plain mean of a document's behaviour cells, out of ${WHOLE_MAX}.`),
    element("li", "", `The document as a whole: the total of its five criteria, out of ${WHOLE_MAX}.`));
  content.append(parts);
  const table = element("table", "readings figures");
  const headRow_ = element("tr");
  ["Rank", "Lab", "Behaviours", "Whole document", "Final score"].forEach(name => {
    const cell = element("th", null, name);
    cell.scope = "col";
    headRow_.append(cell);
  });
  const head = element("thead");
  head.append(headRow_);
  const rows = element("tbody");
  rankedColumns().forEach(column => {
    const final = finalFigure(state.behaviours, assessmentOf(column), column);
    if (!final) return;
    const row = element("tr");
    const rank = element("td", "rank-cell");
    rank.dataset.label = "Rank";
    rank.append(mono(String(column.rank)));
    const name = element("td", "judge", column.lab);
    name.dataset.label = "Lab";
    row.append(rank, name);
    [["Behaviours", final.behaviours.value], ["Whole document", final.whole],
      ["Final score", final.value]].forEach(([label, value]) => {
      const cell = element("td", "numeric");
      cell.dataset.label = label;
      cell.append(mono(shown(value)));
      row.append(cell);
    });
    rows.append(row);
  });
  table.append(head, rows);
  content.append(table, element("p", "", "Labs are ranked by this score. Labs level on it share a "
    + "place and the next rank skips. A lab with no specification has no whole-document total to "
    + "add, so it has no final score and comes after, unranked."));
}

function finalScore(content, column, final) {
  board.titled(content, `${column.lab}: final score`, `${documentLine(column)} ${rankLine(column)}`);
  content.append(board.figure(shown(final.value), ` out of ${FINAL_MAX}`));
  const parts = element("ul", "check-list");
  const part = (value, text) => {
    const item = element("li");
    item.append(board.chip(value, WHOLE_MAX, shown(value)), element("span", "", text));
    return item;
  };
  parts.append(
    part(final.behaviours.value,
      `Behaviours, the plain mean of its ${final.behaviours.count} behaviour cells`),
    part(final.whole, "The document as a whole, the total of its five criteria"));
  content.append(parts);
  const arithmetic = element("p");
  arithmetic.append(mono(`${shown(final.behaviours.value)} + ${shown(final.whole)} `
    + `= ${shown(final.value)}`), document.createTextNode(` out of ${FINAL_MAX}.`));
  content.append(arithmetic);
  content.append(board.popButton(`The whole profile of ${column.lab}`,
    () => board.refill(rest => profile(rest, column))));
}

/* A lab's whole profile, from its column's head, as the governance view gives a
 * company's: every group folded, with the rows it is made of. */
function profile(content, column) {
  if (column.absent) {
    board.titled(content, column.lab, "No published specification.");
    content.append(element("p", "", `We know of no model behaviour specification from `
      + `${column.lab}, and none appears to have been published, so there is no public document `
      + "to set beside the others. Its behaviours stand at nought for that absence"
      + `${state.assessment ? ", and the rows that assess a document are NA" : ""}.`));
    content.append(proposeLine());
    return;
  }
  const final = finalFigure(state.behaviours, assessmentOf(column), column);
  board.titled(content, column.lab,
    `${documentLine(column)}${column.rank ? ` ${rankLine(column)}` : ""}`);
  /* A document this publication was not built from. Its whole column is blank,
   * and a blank column with nothing said about it reads as a fault in the
   * page. The cells stay blank rather than going to nought, because a nought
   * would say the document was read and found silent. */
  if (!hasFigures(column)) {
    content.append(element("p", "", "This publication carries no figures for this document: no "
      + "panel judged it for this publication, so its cells are left empty rather than set at "
      + "nought."));
    const open = element("p");
    open.append(link(readerLink({ spec: column.id }), "Read the document in the doc reader"));
    content.append(open);
    return;
  }
  if (final) content.append(board.figure(shown(final.value), ` out of ${FINAL_MAX}`));
  const assessment = assessmentOf(column);
  if (assessment) {
    const { parts, total } = wholeFigures(assessment);
    const whole = element("details");
    const summary = element("summary");
    summary.append(total === null ? board.naChip() : board.chip(total, WHOLE_MAX, shown(total)),
      element("span", "", total === null
        ? "The document as a whole, no total: a criterion carries no score"
        : `The document as a whole, ${shown(total)} out of ${WHOLE_MAX}`));
    const criteria = element("ul", "check-list");
    CRITERIA.forEach((criterion, index) => {
      const item = element("li");
      item.append(parts[index] === null
        ? board.naChip() : board.chip(parts[index], SHOWN_MAX, shown(parts[index])),
        element("span", "", parts[index] === null
          ? `${criterion.name}, not scored`
          : `${criterion.name}, out of ${SHOWN_MAX}`));
      criteria.append(item);
    });
    whole.append(summary, criteria);
    content.append(whole);
  }
  state.categories.forEach(({ name, members }) => {
    const value = categoryFigure(members, column);
    if (value === null) return;
    const fold = element("details");
    const summary = element("summary");
    summary.append(board.chip(value, categoryMax(), shown(value)),
      element("span", "", `${name}, ${shown(value)} out of ${categoryMax()}`));
    const list = element("ul", "check-list");
    members.forEach(behaviour => {
      const depth = behaviour.coverage?.[column.id]?.depth;
      if (!Number.isFinite(depth?.mean)) return;
      const item = element("li");
      item.append(board.chip(depth.mean, state.scale, shown(depth.mean)),
        element("span", "", behaviour.name));
      list.append(item);
    });
    fold.append(summary, list);
    content.append(fold);
  });
  const read = element("p");
  read.append(link(readerLink({ spec: column.id }), "Read the document in the doc reader"));
  content.append(read);
}

/* A row that assesses a document, where there is no assessment to show. Two
 * absences reach this, and they are different claims. A lab the index holds no
 * specification for has nothing to assess at all, and asking for one is the
 * thing to do. A document the index does carry, whose assessment this
 * publication leaves out, is on the shelf: telling its reader that no
 * specification from that lab has been published would be false, and the
 * propose link would ask for a document the reader can already open. */
function notAssessed(content, column, row, more) {
  const tail = more ? ` ${more}` : "";
  board.titled(content, `${column.lab}: ${lowerFirst(row)}`,
    column.absent ? "Not assessed." : documentLine(column));
  content.append(board.figure("NA", ", not assessed"));
  if (column.absent) {
    content.append(element("p", "",
      `There is no published specification from ${column.lab} to assess.${tail}`), proposeLine());
    return;
  }
  content.append(element("p", "",
    `The index carries this document, and this publication does not assess it as a whole.${tail}`));
}

/* What we know, rather than what the lab has done. "Meta has published no
 * specification" is a claim about Meta; "we know of none" is a claim about us,
 * and it is the only one of the two this index can stand behind. */
function proposeLine() {
  const ask = element("p");
  const where = element("a", null, "propose it");
  where.href = "/about?propose&kind=specification#propose";
  where.target = "_blank";
  where.rel = "noopener noreferrer";
  ask.append(document.createTextNode("If that seems wrong to you, "), where,
    document.createTextNode("."));
  return ask;
}

/* A nought that means the index holds no document, rather than a document that
 * was read and found to say nothing. The board cannot show that difference in a
 * figure, so pressing one says it in words. */
function absentScore(content, column, subject, these) {
  board.titled(content, `${column.lab}: ${lowerFirst(subject)}`, "No published specification.");
  content.append(board.figure(shown(0), ` out of ${categoryMax()}`),
    element("p", "", `We know of no model behaviour specification from ${column.lab}, and none `
      + "appears to have been published, so there is no public document to set beside the others."),
    element("p", "subtitle", "The nought therefore stands for that absence. Nobody has examined a "
      + `${column.lab} specification and found it silent on ${these}.`),
    proposeLine());
}

/* "conflict rules", or "conflict rules and reasons given": which of the five
 * carry no score. Named rather than counted, because a reader looking at an NA
 * where a total belongs wants to know what is missing before anything else. */
function unscored(assessment) {
  const { parts } = wholeFigures(assessment);
  const names = CRITERIA.filter((criterion, index) => parts[index] === null)
    .map(criterion => lowerFirst(criterion.name));
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
    : names[0];
}

/* A figure the board cannot give. The five criteria are summed as shown, so a
 * sum of four is the document two points short with nothing on the page saying
 * why; the row reads NA and says which criterion nobody scored. */
function noFigure(content, column, row, assessment, more) {
  board.titled(content, `${column.lab}: ${lowerFirst(row)}`, documentLine(column));
  content.append(board.figure("NA", ", no figure"),
    element("p", "", `No judge scored ${unscored(assessment)}, so the document as a whole cannot `
      + `be totalled.${more ? ` ${more}` : ""}`));
}

/* One criterion of an assessment that left it out. */
function criterionNotScored(content, column, criterion) {
  board.titled(content, `${column.lab}: ${lowerFirst(criterion.name)}`, criterion.asks);
  content.append(board.figure("NA", ", not scored"),
    element("p", "", "No judge of this document scored this criterion, so the document as a whole "
      + "has no total and this lab has no final score."),
    board.h3(scaleHeading(criterion)),
    criterionScale(criterion, null));
}

function aboutWhole(content) {
  board.titled(content, "The document as a whole",
    `Five criteria, each out of ${SHOWN_MAX}, adding up to a total out of ${WHOLE_MAX}.`);
  content.append(element("p", "", "Beside the depth of each behaviour, each document is assessed "
    + `whole, by the same judges, on five criteria. ${HALVING}`));
  content.append(board.h3("How it is scored"));
  CRITERIA.forEach(criterion => {
    const fold = element("details");
    const summary = element("summary");
    summary.append(element("span", "", criterion.name));
    fold.append(summary, element("p", "", criterion.asks), criterionScale(criterion, null));
    if (criterion.key === "contradictions") {
      fold.append(element("p", "subtitle", CONTRADICTIONS_RULE));
    }
    content.append(fold);
  });
  content.append(board.showInTable("whole", "the criteria"));
}

/* The total of one document: its five criteria folded, each with its judges.
 * The contradictions are too long for a popover and open in the sheet. */
function wholeScore(content, column, assessment) {
  const { parts, total } = wholeFigures(assessment);
  board.titled(content, `${column.lab}: the document as a whole`, documentLine(column));
  content.append(total === null
    ? board.figure("NA", ", no total")
    : board.figure(shown(total), ` out of ${WHOLE_MAX}`));
  content.append(element("p", "subtitle", total === null
    ? `The total is the sum of the five criteria, each out of ${SHOWN_MAX}. No judge scored `
      + `${unscored(assessment)}, so there is no total to give.`
    : `The sum of its five criteria, each out of ${SHOWN_MAX}. ${HALVING}`));
  CRITERIA.forEach((criterion, index) => {
    const fold = element("details");
    const summary = element("summary");
    summary.append(parts[index] === null
      ? board.naChip() : board.chip(parts[index], SHOWN_MAX, shown(parts[index])),
      element("span", "", parts[index] === null
        ? `${criterion.name}, not scored`
        : `${criterion.name}, ${shown(parts[index])} out of ${SHOWN_MAX}`));
    fold.append(summary);
    if (parts[index] === null) {
      fold.append(element("p", "", "No judge of this document scored it."));
      content.append(fold);
      return;
    }
    if (criterion.key === "contradictions") {
      fold.append(element("p", "", CONTRADICTIONS_RULE), contradictionsLine(assessment),
        board.popButton("Read the contradictions",
          () => openContradictions(column, assessment, parts[index])));
    } else {
      fold.append(readingsList(assessment.criteria?.[criterion.key]?.judges, "score", CRITERION_MAX));
    }
    content.append(fold);
  });
  content.append(board.popButton(`The whole profile of ${column.lab}`,
    () => board.refill(rest => profile(rest, column))));
}

function aboutCriterion(content, criterion) {
  board.titled(content, criterion.name, criterion.asks);
  content.append(element("p", "subtitle", "One of the five criteria on the document as a whole. "
    + `${criterion.key === "contradictions" ? CONTRADICTIONS_RULE : HALVING}`));
  content.append(board.h3(scaleHeading(criterion)),
    criterionScale(criterion, null));
}

function criterionScore(content, column, criterion, assessment, part) {
  board.titled(content, `${column.lab}: ${lowerFirst(criterion.name)}`, criterion.asks);
  content.append(board.figure(shown(part), ` out of ${SHOWN_MAX}`),
    element("p", "subtitle", HALVING));
  const judges = assessment.criteria?.[criterion.key]?.judges || {};
  content.append(board.h3(`The ${Object.keys(judges).length} readings, each out of ${CRITERION_MAX}`),
    readingsList(judges, "score", CRITERION_MAX));
  content.append(board.h3(scaleHeading(criterion)),
    criterionScale(criterion, criterionMean(assessment, criterion.key)));
}

/* How many of the claims the judges confirmed, and that nobody has read them
 * since. Both belong to the figure rather than to the list, so they are said
 * wherever the figure is. */
function contradictionsLine(assessment) {
  const claims = orderedClaims(assessment);
  const confirmed = claims.filter(claim => claim.confirmed).length;
  return paragraph(claims.length
    ? `Found by the judges and read by all of them: ${confirmed} confirmed of `
      + `${claims.length} listed. ${NOT_REVIEWED}`
    : `The judges listed none. ${NOT_REVIEWED}`);
}

function contradictionsScore(content, column, assessment, part) {
  const criterion = CRITERIA.find(item => item.key === "contradictions");
  board.titled(content, `${column.lab}: ${lowerFirst(criterion.name)}`, criterion.asks);
  content.append(board.figure(shown(part), ` out of ${SHOWN_MAX}`),
    element("p", "subtitle", CONTRADICTIONS_RULE), contradictionsLine(assessment));
  const confirmed = orderedClaims(assessment).filter(claim => claim.confirmed);
  if (confirmed.length) {
    content.append(board.h3("Confirmed"));
    const list = element("ul", "check-list");
    confirmed.forEach(claim =>
      list.append(element("li", "", claim.situation + (claim.absolute ? " Absolute." : ""))));
    content.append(list);
  }
  content.append(board.popButton("Read the contradictions",
    () => openContradictions(column, assessment, part)));
  content.append(board.h3(scaleHeading(criterion)),
    criterionScale(criterion, assessment.contradictions?.score ?? null));
}

function aboutCategory(content, category, members) {
  board.titled(content, category.name, `${members.length} `
    + `${members.length === 1 ? "behaviour" : "behaviours"}, each a depth out of ${state.scale}. `
    + "The group's figure is their plain mean.");
  const list = element("ul", "check-list");
  members.forEach(behaviour => list.append(element("li", "", behaviour.name)));
  content.append(list, board.h3("What a depth means"), depthScale(null),
    board.showInTable(category.id, "its behaviours"));
}

function categoryScore(content, column, category, members, value) {
  board.titled(content, `${column.lab}: ${lowerFirst(category.name)}`, documentLine(column));
  content.append(board.figure(shown(value), ` out of ${categoryMax()}`),
    element("p", "subtitle", `The plain mean of its ${members.length} `
      + `${members.length === 1 ? "behaviour" : "behaviours"}.`));
  const list = element("ul", "check-list");
  members.forEach(behaviour => {
    const depth = behaviour.coverage?.[column.id]?.depth;
    if (!Number.isFinite(depth?.mean)) return;
    const item = element("li");
    const open = element("button", "inline-button", behaviour.name);
    open.type = "button";
    // The chip is a figure beside a name; what a screen reader hears is the
    // figure said in full, which is what the scale under the table spells out.
    open.setAttribute("aria-label",
      `${behaviour.name}: ${depthPhrase(depth.mean, state.scale)}`);
    open.addEventListener("click",
      () => board.refill(rest => behaviourScore(rest, column, behaviour, depth)));
    item.append(board.chip(depth.mean, state.scale, shown(depth.mean)), open);
    list.append(item);
  });
  content.append(list);
}

/* A behaviour's own note: what the index means by it. The brief is the one the
 * panel was given, so it is what every figure in this row was judged against
 * and the right thing to read before them. It comes from the registry rather
 * than being rebuilt here: it is served already, and two sources for one
 * sentence drift apart the first time one of them is edited. */
function aboutBehaviour(content, behaviour) {
  const entry = state.registry[behaviour.slug] || {};
  board.titled(content, behaviour.name,
    `A depth out of ${state.scale}: how far a document goes on this behaviour.`);
  const asked = entry.query || entry.definition || behaviour.definition;
  content.append(board.h3("What the judges are asked"),
    asked ? paragraph(asked) : paragraph("No brief is recorded for this behaviour.", "missing"));
  if (entry.boundary) {
    content.append(board.h3("Where the construct stops"), paragraph(entry.boundary));
  }
  content.append(board.h3("What a depth means"), depthScale(null));
}

/* A figure's note: how it was reached, then where this specification stands
 * beside the others. The readings come from the publication and are always
 * there; the two paragraphs are written from the comparisons already made
 * between each pair and may not be, in which case the note says so rather than
 * showing an empty heading. */
function behaviourScore(content, column, behaviour, depth) {
  board.titled(content, `${column.lab}: ${lowerFirst(behaviour.name)}`, behaviour.definition);
  content.append(board.figure(shown(depth.mean),
    ` out of ${state.scale}, ${depthWords(depth.mean, state.scale)}`));
  const judges = Object.keys(depth.judges || {}).length;
  if (judges) {
    content.append(board.h3(`The ${judges} ${judges === 1 ? "reading" : "readings"}`),
      readingsList(depth.judges, "depth", state.scale));
  }
  const key = `${behaviour.slug}\n${column.id}`;
  content.append(noteUnder("Why this figure", state.depths[key]?.text));
  content.append(noteUnder("Where this specification stands", state.passages[key]?.text));
  content.append(board.h3("Where this figure sits"), depthScale(depth.mean));
  const read = element("p");
  read.append(link(readerLink({ behavior: behaviour.slug, spec: column.id }),
    "Read the passages in the doc reader"));
  content.append(read);
}

/* ---- The sheet, for the contradictions -------------------------------------- */

function sheet(title, build, sheetLink) {
  nodes.sheetTitle.textContent = title;
  if (sheetLink) {
    nodes.sheetLink.href = sheetLink.href;
    nodes.sheetLink.textContent = sheetLink.text;
    nodes.sheetLink.hidden = false;
  } else {
    nodes.sheetLink.removeAttribute("href");
    nodes.sheetLink.hidden = true;
  }
  const body = document.createDocumentFragment();
  build(body);
  nodes.sheetBody.replaceChildren(body);
  nodes.sheetBody.scrollTop = 0;
  if (!nodes.sheet.open) nodes.sheet.showModal();
}

function readingsTable(readings) {
  const table = element("table", "readings");
  const headRow_ = element("tr");
  ["Judge", "Found it", "Holds", "Absolute", "Reason"].forEach(name => {
    const cell = element("th", null, name);
    cell.scope = "col";
    headRow_.append(cell);
  });
  const head = element("thead");
  head.append(headRow_);
  const body = element("tbody");
  readings.forEach(reading => {
    const row = element("tr");
    const judge = element("td", "judge");
    judge.dataset.label = "Judge";
    judge.append(mono(reading.seat));
    if (reading.model) {
      const model = element("span", "judge-model", "answered by ");
      model.append(mono(reading.model));
      // A space between the seat and the line under it. The line is a block, so
      // nothing moves; what changes is what a reader copying the cell gets.
      judge.append(document.createTextNode(" "), model);
    }
    row.append(judge);
    [["Found it", reading.found], ["Holds", reading.holds], ["Absolute", reading.absolute]]
      .forEach(([name, value]) => {
        const cell = element("td", "yes-no", yesNo(value));
        cell.dataset.label = name;
        row.append(cell);
      });
    const reason = String(reading.reason || "");
    const why = element("td", "reason", reason.charAt(0).toUpperCase() + reason.slice(1));
    why.dataset.label = "Reason";
    row.append(why);
    body.append(row);
  });
  table.append(head, body);
  return table;
}

function claimNode(claim, documentId) {
  const item = element("section", "claim");
  const status = element("p", "claim-status");
  status.append(element("span", `status-glyph${claim.confirmed ? " is-confirmed" : ""}`),
    document.createTextNode(claim.confirmed ? "Confirmed" : "Not confirmed"));
  item.append(status);
  if (claim.absolute) {
    item.append(paragraph("Absolute: the clash involves a rule the document says can never be "
      + "overridden", "claim-absolute"));
  }
  item.append(element("h4", null, "Situation"), paragraph(claim.situation));
  item.append(element("h4", null, "The two passages"));
  (claim.passages || []).forEach(passage => {
    const quote = element("blockquote", "passage");
    quote.append(paragraph(passage.quote));
    const cite = paragraph("", "passage-cite");
    cite.append(link(readerLink({ spec: documentId, passage: passage.locator }), passage.locator));
    if (passage.exampleBlock) cite.append(document.createTextNode(", an example in the document"));
    item.append(quote, cite);
  });
  item.append(element("h4", null, "Why both cannot be followed"), paragraph(claim.why));
  item.append(element("h4", null, "How each judge read it"), readingsTable(claim.readings || []));
  return item;
}

function openContradictions(column, assessment, part) {
  if (board.nodes.pop.matches(":popover-open")) board.nodes.pop.hidePopover();
  const criterion = CRITERIA.find(item => item.key === "contradictions");
  sheet(`${column.lab}: ${criterion.name}`, body => {
    body.append(paragraph(documentLine(column), "sheet-sub"));
    const figureLine = paragraph("");
    figureLine.append(element("span", "sheet-figure", shown(part)),
      document.createTextNode(` out of ${SHOWN_MAX}.`));
    body.append(figureLine, paragraph(CONTRADICTIONS_RULE));
    const claims = orderedClaims(assessment);
    const confirmed = claims.filter(claim => claim.confirmed);
    body.append(element("h3", null, "How one is found and confirmed"), paragraph(HOW_SETTLED),
      paragraph(NOT_REVIEWED, "missing"));
    if (!claims.length) {
      body.append(paragraph("The judges listed none.", "missing"));
      return;
    }
    body.append(element("h3", null, "The claims"),
      paragraph(`${confirmed.length} confirmed of ${claims.length} listed.`, "claims-count"));
    claims.forEach(claim => body.append(claimNode(claim, column.id)));
  }, { href: readerLink({ spec: column.id }), text: "Read the document in the doc reader" });
}

/* ---- The table -------------------------------------------------------------- */

const rowId = (groupId, index) => `board-row-${groupId}-${index}`;

/* One cell of a column: the board wants the lab's name for the accessible label
 * and a key for the address, as the governance view writes its lab and its
 * row. */
const cellFor = (column, rowLabel, row, rest) => board.scoreCell({
  name: column.lab, rowLabel, dataset: { lab: column.id || column.lab, row }, ...rest,
});

const naFor = (column, rowLabel, row, build) => board.naCell({
  name: column.lab, rowLabel, dataset: { lab: column.id || column.lab, row }, build,
});

function headRow() {
  const row = element("tr");
  const corner = element("th", "row-col");
  corner.scope = "col";
  corner.append(element("span", "head-name", "Score"), element("span", "head-sub", "labs by rank"));
  row.append(corner);
  state.columns.forEach(column => {
    const cell = element("th");
    cell.scope = "col";
    const button = element("button", "company-button");
    button.type = "button";
    button.dataset.lab = column.id || column.lab;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", column.rank
      ? `${column.lab}, ranked ${column.rank}: its profile`
      : `${column.lab}, ${column.absent ? "no published specification" : "unranked"}: its profile`);
    // A blank where a rank would be, so every lab's name starts on one line.
    button.append(element("span", "rank", column.rank ? String(column.rank) : " "));
    button.append(element("span", "company-name", column.lab));
    button.append(column.absent
      ? element("span", "company-flag", "No specification")
      : element("span", "company-flag mono", shownVersion(column.version)));
    button.addEventListener("click", () =>
      board.openPopover(button, content => profile(content, column)));
    cell.append(button);
    row.append(cell);
  });
  return row;
}

function renderTable() {
  const body = document.createDocumentFragment();
  const columns = state.columns;
  const empty = () => element("td", "cell");

  /* What the table says it holds, built from the publication like every other
   * conditional string on this page. A publication of four carries no
   * assessment, so it has neither of the two rows the other caption names. */
  board.nodes.table.caption.textContent = state.assessment
    ? "Each lab's final score, its document as a whole and its behaviours by category, with each "
      + "group's rows available to open"
    : "Each lab's behaviours by category, with each group's rows available to open";

  /* The final score, a single row above every group, as the governance view's
   * total. Only a publication that carries an assessment has one: without it
   * there is no whole-document figure to add to the behaviours'. */
  if (state.assessment) {
    const total = element("tr", "total-row");
    total.append(board.rowHead(null, board.rowName("Final score", `out of ${FINAL_MAX}`, aboutFinal,
      `Final score, out of ${FINAL_MAX}: how it is worked out`)));
    columns.forEach(column => {
      if (!hasFigures(column)) { total.append(empty()); return; }
      const assessment = assessmentOf(column);
      const final = finalFigure(state.behaviours, assessment, column);
      if (final) {
        total.append(cellFor(column, "final score", "final", {
          value: final.value, max: FINAL_MAX, text: shown(final.value),
          build: content => finalScore(content, column, final),
        }));
        return;
      }
      total.append(assessment
        ? naFor(column, "final score", "final", content => noFigure(content, column, "Final score",
          assessment, "The final score is that total plus the behaviours' figure, so it cannot be "
          + "given either."))
        : naFor(column, "final score", "final", content => notAssessed(content, column,
          "Final score", "It has no whole-document total to add, so it has no final score.")));
    });
    body.append(total);

    /* The document as a whole, a group of its own: its total on the group row,
     * the five criteria out of 2 folded under it. */
    const wholeRow = element("tr", "question-row");
    wholeRow.append(board.rowHead(
      board.rowToggle("whole", CRITERIA.map((criterion, index) => rowId("whole", index)),
        { parts: "criteria", name: "The document as a whole" }),
      board.rowName("The document as a whole", `out of ${WHOLE_MAX}, five criteria`, aboutWhole,
        "The document as a whole: what it measures")));
    columns.forEach(column => {
      if (!hasFigures(column)) { wholeRow.append(empty()); return; }
      const assessment = assessmentOf(column);
      if (!assessment) {
        wholeRow.append(naFor(column, "the document as a whole", "whole",
          content => notAssessed(content, column, "The document as a whole")));
        return;
      }
      const whole = wholeFigures(assessment).total;
      wholeRow.append(whole === null
        ? naFor(column, "the document as a whole", "whole",
          content => wholeScore(content, column, assessment))
        : cellFor(column, "the document as a whole", "whole", {
          value: whole, max: WHOLE_MAX, text: shown(whole),
          build: content => wholeScore(content, column, assessment),
        }));
    });
    body.append(wholeRow);

    CRITERIA.forEach((criterion, index) => {
      const sub = board.subRow(rowId("whole", index), "whole",
        board.rowName(criterion.name, `out of ${SHOWN_MAX}`,
          content => aboutCriterion(content, criterion), `${criterion.name}: what it asks`));
      columns.forEach(column => {
        if (!hasFigures(column)) { sub.append(empty()); return; }
        const assessment = assessmentOf(column);
        if (!assessment) {
          sub.append(naFor(column, lowerFirst(criterion.name), criterion.key,
            content => notAssessed(content, column, criterion.name)));
          return;
        }
        const part = wholeFigures(assessment).parts[index];
        if (part === null) {
          sub.append(naFor(column, lowerFirst(criterion.name), criterion.key,
            content => criterionNotScored(content, column, criterion)));
          return;
        }
        sub.append(cellFor(column, lowerFirst(criterion.name), criterion.key, {
          value: part, max: SHOWN_MAX, text: shown(part),
          build: criterion.key === "contradictions"
            ? content => contradictionsScore(content, column, assessment, part)
            : content => criterionScore(content, column, criterion, assessment, part),
        }));
      });
      body.append(sub);
    });
  }

  /* Each category: the mean of its behaviours on the group row, the behaviours
   * folded under it, each a depth on the publication's own scale. */
  state.categories.forEach(category => {
    const { id, name, members } = category;
    const row = element("tr", "question-row");
    row.dataset.question = id;
    row.append(board.rowHead(
      board.rowToggle(id, members.map((member, index) => rowId(id, index)),
        { parts: "behaviours", name }),
      board.rowName(name, `out of ${categoryMax()}, ${members.length} `
        + `${members.length === 1 ? "behaviour" : "behaviours"}`,
        content => aboutCategory(content, category, members), `${name}: what it measures`)));
    columns.forEach(column => {
      const value = categoryFigure(members, column);
      if (value === null) { row.append(empty()); return; }
      row.append(cellFor(column, lowerFirst(name), id, {
        value, max: categoryMax(), text: shown(value),
        build: column.absent
          ? content => absentScore(content, column, name, "these behaviours")
          : content => categoryScore(content, column, category, members, value),
      }));
    });
    body.append(row);

    members.forEach((behaviour, index) => {
      const sub = board.subRow(rowId(id, index), id,
        board.rowName(behaviour.name, `out of ${state.scale}`,
          content => aboutBehaviour(content, behaviour),
          `${behaviour.name}: what the judges are asked`));
      columns.forEach(column => {
        const depth = column.absent ? null : behaviour.coverage?.[column.id]?.depth;
        if (!column.absent && !Number.isFinite(depth?.mean)) {
          const cell = empty();
          // A document that carries figures elsewhere and none here says so
          // with a dash; one the payload knows nothing about says nothing. The
          // dash is written as an escape, because this repository keeps long
          // dashes out of its source.
          if (hasFigures(column)) cell.append(element("span", "cell-empty", "–"));
          sub.append(cell);
          return;
        }
        const mean = depth ? depth.mean : 0;
        sub.append(cellFor(column, lowerFirst(behaviour.name), behaviour.slug, {
          value: mean, max: state.scale, text: shown(mean),
          // The rubric's word for the figure, which the scale under the table
          // spells out and the cell has no room for. Not on a lab with no
          // specification: its nought stands for a document nobody holds, and
          // "absent" is the rubric's word for a document that says nothing.
          note: column.absent ? null : depthWords(mean, state.scale),
          build: column.absent
            ? content => absentScore(content, column, behaviour.name, "this behaviour")
            : content => behaviourScore(content, column, behaviour, depth),
        }));
      });
      body.append(sub);
    });
  });

  board.nodes.table.tHead.replaceChildren(headRow());
  board.nodes.table.tBodies[0].replaceChildren(body);
}

/* How the colour reads, and nothing else: each row is painted over its own
 * maximum, so the figure and the corner mark say which scale it is on. */
function renderLegend() {
  const legend = document.createDocumentFragment();
  legend.append(element("span", "", "Colour is the share of the row's maximum:"),
    element("span", "", "none"));
  legend.append(board.swatches([0, 0.25, 0.5, 0.75, 1], 1), element("span", "", "all"));
  if (state.assessment) {
    const na = element("span", "legend-na");
    na.append(board.naChip(),
      document.createTextNode(" no published specification to assess"));
    legend.append(na);
  }
  nodes.legend.replaceChildren(legend);
}

/* The depth scale under the table, from the same levels the behaviour popovers
 * mark, so the two cannot drift apart. */
function renderDepthKey() {
  const list = document.createDocumentFragment();
  const levels = levelsOf(state.scale);
  const top = levels[levels.length - 1].level;
  levels.forEach(({ level: at, anchor, brief }) => {
    const item = element("li");
    const text = element("span");
    text.append(element("span", "anchor-name", anchor), document.createTextNode(`: ${brief}`));
    if (at === top && state.scale === 10) {
      const conditions = element("ul", "depth-key-conditions");
      CONDITIONS_BRIEF.forEach(condition => conditions.append(element("li", "", condition)));
      text.append(conditions);
    }
    item.append(element("span", "anchor-level", String(at)), text);
    list.append(item);
  });
  nodes.depthKeyTitle.textContent = `Depth of a behaviour, out of ${state.scale}`;
  nodes.depthKey.replaceChildren(list);
  // The scale of four has a level at every whole number, so nothing falls
  // between two of them and there is no line to write.
  nodes.depthKeyOdd.textContent = state.scale === 10 ? ODD_BRIEF : "";
}

/* The ties the ranking cannot break, said under the table. There is one figure
 * here and no second to separate two labs level on it. */
function renderTies() {
  const all = rankedColumns();
  nodes.ties.textContent = all.flatMap((column, index) => {
    const next = all[index + 1];
    if (!next || next.rank !== column.rank) return [];
    return [`${column.lab} and ${next.lab} tie on ${shown(leadFigure(column))}, `
      + `so they share ${ORDINALS[column.rank - 1]} place.`];
  }).join(" ");
}

/* ---- How the scores are made ------------------------------------------------ */

/* A paragraph from parts: plain strings, {mono} for figures and model names,
 * {lead} for the bold opening each paragraph carries. */
function rich(...parts) {
  const node = element("p");
  parts.forEach(part => {
    if (typeof part === "string") node.append(document.createTextNode(part));
    else if (part.mono !== undefined) node.append(mono(String(part.mono)));
    else if (part.lead) node.append(element("strong", "", part.lead), document.createTextNode(" "));
  });
  return node;
}

/* "a, b and c", from parts rather than strings, since each name is its own
 * node. */
const listed = items => items.flatMap((item, index) => [
  ...(index === 0 ? [] : [index === items.length - 1 ? " and " : ", "]), ...item]);

const seatsNamed = seats => listed(seats.map(seat => [{ mono: seat }]));

/* "d answered in b's seat for 3 depths", and a list of them where a run had
 * more than one. `unit` is what is being counted, and is left out where the
 * sentence around it says. */
const substituted = (entries, unit) => listed(entries.map(({ model, seat, count }, index) => [
  { mono: model }, `${index === 0 ? " answered" : ""} in ${seat}'s seat for `, { mono: count },
  index === 0 && unit ? ` ${count === 1 ? unit.one : unit.many}` : ""]));

/* Nothing here names a model, a seat or a panel: every name and every count is
 * read off the payload the board is drawn from, so this text cannot say the
 * board was judged by anyone it was not. */
function renderMethod() {
  const facts = methodFacts({ behaviours: state.behaviours, assessment: state.assessment || {},
                              columns: state.columns, provenance: state.provenance });
  const blocks = [];
  if (state.assessment) {
    blocks.push(rich({ lead: `Final score, out of ${FINAL_MAX}.` },
      "The behaviours' figure, out of ", { mono: WHOLE_MAX }, ", plus the document as a whole, out "
      + "of ", { mono: WHOLE_MAX }, ". Labs are ranked by it; equal scores share a rank and the "
      + "next rank is skipped."));
  }
  blocks.push(rich({ lead: "The behaviours' figure." },
    "It is the plain mean of the document's behaviour depths, over the behaviours this publication "
    + "gives it a depth for, which may be fewer than the behaviours it carries. A category's "
    + "figure is the plain mean of its own behaviours."));
  /* The seats are named rather than counted per cell: what the payload gives is
   * every seat seen over the whole board, and a panel of three judging every
   * cell can still show four or five seats there, one run having been composed
   * differently from another. */
  blocks.push(rich({ lead: `A behaviour's depth, out of ${state.scale}.` },
    "Each judge of the panel reads the passages the panel cited for that behaviour in that "
    + "document and gives a depth from ", { mono: 0 }, " to ", { mono: state.scale },
    " on the scale above; a cell's figure is the mean of its readings. When a judge's model cannot "
    + "answer, a declared substitute answers in its seat and the cell says so. The seats on this "
    + "board are ", ...seatsNamed(facts.depthSeats),
    ...(facts.depthSubstitutions.length
      ? ["; ", ...substituted(facts.depthSubstitutions, { one: "depth", many: "depths" }), "."]
      : ["."])));
  if (state.assessment) {
    blocks.push(rich({ lead: `The document as a whole, out of ${WHOLE_MAX}.` },
      "Five criteria. Four are each read by the judges on the whole document and scored ",
      { mono: 0 }, " to ", { mono: CRITERION_MAX }, "; the fifth, the contradictions, is scored "
      + "from the list the next paragraph describes. The index halves each so the five add up to ",
      { mono: WHOLE_MAX }, ". The total is the sum of the five figures as shown."));
    /* The row is named as the board names it, and a rule the document calls
     * absolute is called absolute here too. The page says both words
     * everywhere else, and a paragraph that walked around them read as a
     * description of some other index's method. */
    blocks.push(rich({ lead: "Unresolved contradictions." },
      "Each seat lists every contradiction it finds; then each of them reads every claim, its own "
      + "included, and says whether it holds and whether it involves a rule the document calls "
      + "absolute. A claim is confirmed when two seats say it holds, and absolute when two say "
      + "both. Score: ", { mono: CRITERION_MAX },
      " when none is confirmed, ", { mono: 2 }, " when one or two are and none is absolute, ",
      { mono: 0 }, " when three or more are or one is absolute; halved "
      + "like the others. The seats on this board are ", ...seatsNamed(facts.contradictionSeats),
      ...(facts.readingSubstitutions.length
        ? ["; ", ...substituted(facts.readingSubstitutions, null), " of the ",
          { mono: facts.readings }, " readings in all"]
        : []),
      `. ${NOT_REVIEWED}`));
  }
  nodes.method.replaceChildren(...blocks);
}

/* ---- Loading ---------------------------------------------------------------- */

async function initialize() {
  const [payload, documents, registry, links] = await Promise.all([
    /* Both sets present and empty: every behaviour and every document is still
     * listed with its heading and its figures, and none of them carries the
     * paragraphs or the document text this page never reads. Measured on
     * 9b7ce377: the payload falls from 888 KB to 131 and the documents from
     * 1069 KB to 1. Of that 131, about half is a citedBy index this page never
     * reads, which sliceColumn attaches whenever a behaviour set is present. */
    loadJSON(`/api/reader/payload${PINNED ? `${PINNED}&` : "?"}behavior=`, null),
    loadJSON(`/api/reader/documents${PINNED ? `${PINNED}&` : "?"}spec=`, null),
    loadJSON(`/api/reader/behaviours${PINNED}`, null),
    /* One route for both, where two gitignored files used to sit. They were
     * never on any deployment, so this page has shown its figures with nothing
     * under them everywhere but on the machine that wrote the files.
     *
     * Asked for with both sets present and empty, which is not the same as
     * leaving them out: absent means every behaviour and every document,
     * present and empty means none of either. This page reads notes.standing
     * and notes.depth and nothing else, and those two travel whole whatever is
     * asked for, so the empty sets drop byLocator and comparisons and keep
     * everything used. Measured on 9b7ce377: 88 KB in place of 5324.
     *
     * The separator is built rather than appended because PINNED is the empty
     * string on an unpinned page, where a bare & would make a query no route
     * can read. */
    loadJSON(`/api/reader/links${PINNED ? `${PINNED}&` : "?"}behavior=&spec=`, null),
  ]);
  if (!payload?.behaviours?.length || !documents?.documents?.length) {
    nodes.status.textContent = "The board could not be loaded.";
    return;
  }
  state.scale = depthScaleOf(payload);
  state.behaviours = payload.behaviours;
  state.provenance = payload.provenance || {};
  state.assessment = payload.assessment && typeof payload.assessment === "object"
    ? payload.assessment : null;
  state.passages = links?.notes?.standing || {};
  state.depths = links?.notes?.depth || {};
  state.registry = registry || {};

  /* Grouped the way the reader's menu groups them, from the same field and by
   * first appearance rather than alphabetically, so the two pages carve the set
   * the same way. Collected into a map rather than compared with the row
   * before, because a payload is free to interleave its categories and a
   * "changed since last" test would then head the same group twice. */
  const byCategory = new Map();
  state.behaviours.forEach(behaviour => {
    const name = behaviour.category || "Behaviours under test";
    if (!byCategory.has(name)) byCategory.set(name, []);
    byCategory.get(name).push(behaviour);
  });
  // An id of its own for each group: a category's name is a sentence, and the
  // board addresses a group inside a CSS selector.
  state.categories = [...byCategory].map(([name, members], index) =>
    ({ id: `category-${index}`, name, members }));
  state.columns = ranked(newestPerSpecification(documents.documents));

  renderTable();
  renderLegend();
  renderDepthKey();
  renderMethod();
  renderTies();
  board.wirePopover([document.querySelector("#view-coverage .matrix-wrap")]);
  board.nodes.expandAll.addEventListener("click", () => board.expandEvery());
  nodes.status.textContent = "";
}

nodes.sheetClose.addEventListener("click", () => nodes.sheet.close());
nodes.sheet.addEventListener("click", event => {
  // <dialog> attributes a click on its backdrop to the dialog itself, and the
  // head and body fill its box, so this fires only outside them.
  if (event.target === nodes.sheet) nodes.sheet.close();
});

/* Two views of one index, behind tabs: what the specifications say, and how
 * they are governed. The view has an address, ?view=governance, so a link can
 * open on it; the first view is the one with no parameter, which keeps every
 * link already shared pointing where it did.
 *
 * replaceState rather than pushState: a tab is a way of looking at the page,
 * not a page, and filling the back button with tab changes would take a reader
 * back through views rather than out to where they came from. Other parameters,
 * a ?publication= pin among them, are kept. */
const VIEWS = ["coverage", "governance"];
const tabs = [...document.querySelectorAll(".view-tab")];

function viewFromAddress() {
  const asked = new URLSearchParams(location.search).get("view");
  return VIEWS.includes(asked) ? asked : VIEWS[0];
}

function showView(view, { write = false, focus = false } = {}) {
  tabs.forEach(tab => {
    const on = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
    if (on && focus) tab.focus();
  });
  if (write) {
    const url = new URL(location.href);
    if (view === VIEWS[0]) url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    url.hash = "";
    history.replaceState(null, "", url);
  }
}

tabs.forEach(tab => tab.addEventListener("click", () =>
  showView(tab.dataset.view, { write: true })));
document.querySelector(".views")?.addEventListener("keydown", event => {
  const at = tabs.indexOf(document.activeElement);
  if (at < 0) return;
  const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  showView(tabs[(next + tabs.length) % tabs.length].dataset.view, { write: true, focus: true });
});

showView(viewFromAddress());
initialize();
initializeGovernance();
