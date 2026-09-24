/* The overview's second view: how each company governs the rules its models follow.
 *
 * A board rather than a document: one table that takes the whole width, the
 * companies across in rank order, and down the side a final score out of
 * twenty, then the two figures it adds, each out of ten, each with the rows it
 * is made of under it.
 *
 * "What is published" is what a reader can check without being let in: the ten
 * checks of the four asks, which open under their questions, and the licence on
 * the published text. "What it engages" is whether the document binds the
 * models: eight practices, scored on what each company publishes about its
 * own. The final score is their sum, and it is what the companies are ranked
 * by. Its practices fold into the groups governance.json gives
 * the column, each showing their mean, which changes nothing about the figure.
 * A ninth practice is counted in neither, because nobody outside could check
 * it, and the row says so.
 *
 * The two measure different things, and until 24 September 2026 they were
 * shown side by side and never added. They are added now, because one figure
 * to rank by was wanted, and both stay on the board under the sum so a reader
 * can see which half a company earned it on. governance.json says so in its
 * own words.
 *
 * Each figure is the mean of its rows' shares of their own maximum, times ten,
 * which is the one rule that lets a row out of 4 and a row out of 2 sit in one
 * column without either being rescored.
 *
 * Anything more, what a row asks, how it is scored, or why a company scored what
 * it did, opens in a popover beside what was pressed, so the table never gives
 * up its width to it.
 *
 * The table, the popover, the folds and the colours are board.js, which the
 * coverage view draws from as well: this file brings the data, the rows and the
 * words of its own popovers, and nothing else.
 *
 * Everything comes from governance.json: the scores, what each score means, and
 * the text of the research note, company by company and row by row. The figures
 * are computed here rather than stored, so the ranking cannot disagree with the
 * rows it is made of, and a profile's opening line, "Published constitution, 2.7
 * out of 4", is written from the same averages rather than typed beside them.
 *
 * Nothing is built with innerHTML, as in overview.js. The text here is ours
 * rather than a model's, but one rule for the whole page is easier to keep.
 */

import { createBoard, element, level, rankBy, place, ORDINALS } from "./board.js";
/* The mark of each company, above its name. One module for both boards, and it
 * says where the drawings come from and which two companies have none. */
import { companyMark } from "./company-marks.js";

const SCALE = 4;      // a question, and each of its checks
const PRACTICE = 2;   // a best practice, wherever it is counted
/* A question or a column's figure, to one decimal. A check and a practice stay
 * whole numbers. */
const shown = value => value.toFixed(1);

const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

/* Every figure the table shows is out of 10. A check out of 4 and a practice out
 * of 2 are shown as their share of their own scale, and the scale they were
 * given on is said in the popover that opens on them. */
const TEN = 10;
const onTen = (value, max) => value / max * TEN;
/* What a row counts for, said under its name. A row inside a figure says what
 * it counts for in that figure rather than in the row just above it: every
 * check and every practice counts the same there, and "9.1% of what is
 * published" says so where "33.3% of published constitution" would not. */
/* A weight as the count it is: "3/11" says three of eleven rows, which a
 * percentage rounds away. A weight the file gives as a share is written as
 * the smallest fraction it is. */
const frac = (count, of) => `${count}/${of}`;
const share = value => {
  for (let of = 1; of <= 20; of += 1) {
    if (Math.abs(value * of - Math.round(value * of)) < 1e-9) return frac(Math.round(value * of), of);
  }
  return value.toFixed(2);
};
const weightLine = (fraction, parent) => `${fraction} of ${parent}`;
const onItsScale = (value, max) => `Scored ${value} on its own scale of 0 to ${max}.`;

const board = { data: null, labs: [], nodes: {} };

const questionOf = id => board.data.questions.find(question => question.id === id);
/* A practice by its id, from either list: the five anyone can check and the
 * five only the company can show are one vocabulary to everything below. */
const practiceOf = (data, id) =>
  data.supporting.find(practice => practice.id === id)
  || data.internal.find(practice => practice.id === id);
/* Whether a practice is one of those the company alone can show, which decides
 * where its score is read from and whether its 0 carries the note. */
const onlyTheCompany = (data, id) => data.internal.some(practice => practice.id === id);
const practiceScoreOf = (data, labId, id) => (onlyTheCompany(data, id)
  ? data.internal_scores[labId][id] : data.supporting_scores[labId][id]);
const columnOf = (data, id) => data.columns.find(column => column.practices.includes(id));
/* Which working paper a row comes from, in two words, for the line under its
 * name. Said on the row itself because the two papers sit in one column. */
const creditOf = (data, row) => data.papers[row.paper].credit;

/* A column's figure: the mean of its rows' shares of their own maximum, times
 * ten, every row counting the same. A check out of 4 and a practice out of 2
 * sit in one column that way without either being rescored. The final score is
 * the weighted average of the columns. `byQuestion` stays on the scale of 4,
 * which is what the research note's prose quotes; the table shows it out of
 * 10. */
export function totalsFor(data, labId) {
  // Its own data and nothing from the page: the MCP tool imports this file in
  // node, where `board` is empty, so every lookup here goes through `data`.
  const question = id => data.questions.find(one => one.id === id);
  const scores = data.scores[labId];
  const byQuestion = {};
  data.questions.forEach(one => {
    byQuestion[one.id] = average(one.checks.map(check => scores[check.id]));
  });
  const byColumn = {};
  data.columns.forEach(column => {
    const shares = [
      ...column.questions.flatMap(id =>
        question(id).checks.map(check => scores[check.id] / SCALE)),
      ...column.practices.map(id => practiceScoreOf(data, labId, id) / PRACTICE),
    ];
    byColumn[column.id] = average(shares) * column.out_of;
  });
  // The final score is the average of the two, weighted as governance.json says.
  const total = data.columns
    .reduce((sum, column) => sum + byColumn[column.id] * data.total.weights[column.id], 0);
  return { byQuestion, byColumn, total };
}

/* The rank is the final score and nothing else, so companies level on it share
 * a place. */
const ahead = (a, b) => !level(a.ranking, b.ranking) && a.ranking > b.ranking;

export function ranked(data) {
  const labs = data.labs
    .map(lab => {
      const totals = totalsFor(data, lab.id);
      return { ...lab, ...totals, ranking: totals.total };
    })
    .sort((a, b) => b.ranking - a.ranking);
  return rankBy(labs, ahead);
}

/* The board this view draws on, built in initializeGovernance. */
let view = null;

const rowId = id => `gov-check-${id.replace(".", "-")}`;

/* ---- What each popover is made of ------------------------------------------ */

/* What 0, 2 and 4 mean for one check. Where a score sits on them is marked: on
 * its own description when it is even, on the two either side when it is odd. */
function anchorsList(check, score) {
  const list = element("ol", "anchors");
  [0, 2, 4].forEach(mark => {
    const item = element("li");
    if (score !== null && Math.abs(score - mark) <= 1) item.classList.add("is-here");
    item.append(element("span", "anchor-level", String(mark)),
      element("span", "", check.anchors[String(mark)]));
    list.append(item);
  });
  return list;
}

/* What a score means, said as one sentence: the description at that score, or a
 * line for a score that sits between two of them. */
function meansAt(anchors, score) {
  return anchors[String(score)]
    || "This score sits between the two descriptions either side of it below.";
}

function checksOf(lab, question) {
  const list = element("ul", "check-list");
  question.checks.forEach(check => {
    const item = element("li");
    const value = board.data.scores[lab.id][check.id];
    item.append(view.chip(onTen(value, SCALE), TEN, shown(onTen(value, SCALE))),
      element("span", "check-id", check.id),
      element("span", "", `${check.label} (${value} of ${SCALE})`));
    list.append(item);
  });
  return list;
}

/* The practices of a column, scored, with the sentence that says what the
 * company publishes where one exists. */
function practicesOf(lab, ids) {
  const list = element("ul", "check-list");
  ids.forEach(id => {
    const practice = practiceOf(board.data, id);
    const item = element("li");
    const said = onlyTheCompany(board.data, id)
      ? board.data.internal_evidence[lab.id][id].sentence : practice.label;
    const value = practiceScoreOf(board.data, lab.id, id);
    item.append(view.chip(onTen(value, PRACTICE), TEN, shown(onTen(value, PRACTICE))),
      element("span", "check-id", id), element("span", "", `${said} (${value} of ${PRACTICE})`));
    list.append(item);
  });
  return list;
}

/* The same practices with no company in front of them: their labels alone. */
function practiceLabels(ids) {
  const list = element("ul", "check-list");
  ids.forEach(id => {
    const practice = practiceOf(board.data, id);
    const item = element("li");
    item.append(element("span", "check-id", id), element("span", "", practice.label));
    list.append(item);
  });
  return list;
}

/* The practice no total counts, said where it sits. */
function unscoredList(column, marked) {
  const list = element("ul", "check-list");
  (column.unscored || []).forEach(id => {
    const practice = practiceOf(board.data, id);
    const item = element("li");
    if (marked) item.append(view.naChip());
    item.append(element("span", "check-id", id), element("span", "", practice.label));
    list.append(item);
  });
  return list;
}

/* What 0, 1 and 2 mean for a practice, with the score's place marked. The
 * research note never wrote these down for the five anyone can check, and the
 * list says so. */
function scaleList(score, anchors = board.data.supporting_scale) {
  const list = element("ol", "anchors");
  [0, 1, 2].forEach(mark => {
    const item = element("li");
    if (score === mark) item.classList.add("is-here");
    item.append(element("span", "anchor-level", String(mark)),
      element("span", "", anchors[String(mark)]));
    list.append(item);
  });
  const fragment = document.createDocumentFragment();
  fragment.append(list);
  if (anchors.note) fragment.append(element("p", "subtitle", anchors.note));
  return fragment;
}

/* One passage a company published, with a link to where it says it. */
function sourceQuote(source) {
  const block = element("blockquote", "paper-quote");
  block.append(element("p", "", source.quote));
  if (source.translation) block.append(element("p", "paper-where", `Our translation: ${source.translation}`));
  const where = element("p", "paper-where");
  const link = element("a", "", source.title);
  link.href = source.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  where.append(link, document.createTextNode(`, ${source.date}`));
  block.append(where);
  return block;
}

/* What the working paper says about a question, a check or a practice: our
 * reading of it, then the passages it rests on, quoted exactly and grouped by
 * paper. It sits, folded, in the popover a row's name opens, so it is there for
 * whoever wants the source and in nobody's way. It is also the text a judge
 * will be given, which is why the quotes are the papers' own words. */
function paperFold(item) {
  const byPaper = new Map();
  item.quotes.forEach(quote => {
    if (!byPaper.has(quote.paper)) byPaper.set(quote.paper, []);
    byPaper.get(quote.paper).push(quote);
  });
  const fold = element("details", "paper-fold");
  fold.append(element("summary", "",
    byPaper.size > 1 ? "What the working papers say" : "What the working paper says"),
  element("p", "", item.reading));
  byPaper.forEach((quotes, id) => {
    const paper = board.data.papers[id];
    fold.append(element("p", "paper-name", `${paper.by}, "${paper.title}", ${paper.status}.`));
    quotes.forEach(quote => {
      const block = element("blockquote", "paper-quote");
      block.append(element("p", "", quote.text), element("p", "paper-where", quote.where));
      fold.append(block);
    });
  });
  return fold;
}

/* The note's text, one paragraph per blank line. */
function paragraphs(text) {
  const fragment = document.createDocumentFragment();
  String(text || "").split(/\n{2,}/).forEach(block => fragment.append(element("p", "", block)));
  return fragment;
}

function toProfile(lab, open) {
  return view.popButton(`The whole profile of ${lab.name}`,
    () => view.refill(content => profile(content, lab, open)));
}

/* ---- What each popover says ------------------------------------------------ */

function profile(content, lab, open) {
  const alongside = board.labs.filter(other => other !== lab && other.rank === lab.rank);
  const text = board.data.profiles[lab.id];
  view.titled(content, lab.name, [
    `Ranked ${lab.rank} of ${board.labs.length}`
      + `${alongside.length ? `, level with ${alongside.map(other => other.name).join(" and ")}` : ""}.`,
    lab.open_weights ? "Its flagship model, or nearly, can be downloaded by anyone (open weights)." : "",
    lab.legal || "",
  ].filter(Boolean).join(" "));

  const total = board.data.total;
  content.append(view.h3(total.name),
    view.figure(shown(lab.total), ` out of ${total.out_of}, the figure it is ranked by`));
  const half = column => weightLine(share(total.weights[column.id]), "the final score");
  board.data.columns.forEach(column => {
    const figure = lab.byColumn[column.id];
    content.append(view.h3(column.name),
      view.figure(shown(figure), ` out of ${column.out_of}, ${half(column)}`));
    column.questions.forEach(id => {
      const question = questionOf(id);
      const fold = element("details");
      fold.open = open === id;
      const summary = element("summary");
      const onTheBoard = onTen(lab.byQuestion[id], SCALE);
      summary.append(view.chip(onTheBoard, TEN, shown(onTheBoard)),
        element("span", "", `${question.name}, ${shown(onTheBoard)} out of ${TEN}`));
      fold.append(summary, checksOf(lab, question), paragraphs(text[id]));
      content.append(fold);
    });
    const anyone = column.practices.filter(id => !onlyTheCompany(board.data, id));
    const company = column.practices.filter(id => onlyTheCompany(board.data, id));
    if (anyone.length) content.append(paragraphs(text[column.prose]), practicesOf(lab, anyone));
    if (company.length) {
      content.append(view.h3("What only the company can show"), practicesOf(lab, company),
        element("p", "subtitle", board.data.disclosure_note));
    }
    if (column.unscored) {
      content.append(unscoredList(column, true), element("p", "subtitle", board.data.internal_note));
    }
  });
  content.append(element("p", "subtitle", total.about));

  if (text.aside) {
    const aside = element("div", "aside");
    const line = element("p");
    line.append(element("strong", "", `${text.aside.title}. `), document.createTextNode(text.aside.text));
    aside.append(line);
    content.append(aside);
  }
}

function columnScore(content, lab, column) {
  view.titled(content, `${lab.name}: ${column.name.toLowerCase()}`, column.plain);
  content.append(view.figure(shown(lab.byColumn[column.id]), ` out of ${column.out_of}`),
    element("p", "subtitle", "The weighted average of the rows below, each counting for the "
      + `share it says. It counts for ${weightLine(share(board.data.total.weights[column.id]),
        "the final score")}.`));
  const list = element("ul", "check-list");
  const rows = rowsOf(column);
  column.questions.forEach(id => {
    const item = element("li");
    const value = onTen(lab.byQuestion[id], SCALE);
    item.append(view.chip(value, TEN, shown(value)), element("span", "check-id", id),
      element("span", "", `${questionOf(id).name}, `
        + `${frac(questionOf(id).checks.length, rows)}`));
    list.append(item);
  });
  const shownAlone = column.practices.filter(id => !groupOf(column, id));
  shownAlone.forEach(id => {
    const item = element("li");
    const value = onTen(practiceScoreOf(board.data, lab.id, id), PRACTICE);
    item.append(view.chip(value, TEN, shown(value)), element("span", "check-id", id),
      element("span", "", `${practiceOf(board.data, id).short}, ${frac(1, rows)}`));
    list.append(item);
  });
  (column.groups || []).forEach(group => {
    const item = element("li");
    const value = groupAverage(lab.id, group);
    item.append(view.chip(value, TEN, shown(value)),
      element("span", "", `${group.name}, ${frac(group.practices.length, rows)}`));
    list.append(item);
  });
  content.append(list, toProfile(lab, null));
}

function questionScore(content, lab, question) {
  view.titled(content, `${lab.name}: ${question.name.toLowerCase()}`, question.plain);
  content.append(view.figure(shown(onTen(lab.byQuestion[question.id], SCALE)), ` out of ${TEN}`),
    element("p", "subtitle", `The average of its ${question.checks.length} checks, each scored `
      + `from 0 to ${SCALE} and counting the same.`),
    checksOf(lab, question));
  content.append(view.h3("What we found"),
    paragraphs(board.data.profiles[lab.id][question.id]), toProfile(lab, question.id));
}

function checkScore(content, lab, question, check) {
  const value = board.data.scores[lab.id][check.id];
  view.titled(content, `${lab.name}: ${check.short.toLowerCase()}`, `${check.label}.`);
  content.append(view.figure(shown(onTen(value, SCALE)), ` out of ${TEN}`),
    element("p", "subtitle", `${onItsScale(value, SCALE)} ${fromLine(question, `check ${check.id}`)}`),
    element("p", "", meansAt(check.anchors, value)));
  content.append(view.h3("What each score means"), anchorsList(check, value));
  content.append(view.h3(`What we found on ${lab.name}'s ${question.name.toLowerCase()}`),
    paragraphs(board.data.profiles[lab.id][question.id]), toProfile(lab, question.id));
}

/* One of the five anyone can check, for one company. */
function practiceScore(content, lab, practice) {
  const value = board.data.supporting_scores[lab.id][practice.id];
  const column = columnOf(board.data, practice.id);
  view.titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, practice.label);
  content.append(view.figure(shown(onTen(value, PRACTICE)), ` out of ${TEN}`),
    element("p", "subtitle", `${onItsScale(value, PRACTICE)} ${fromLine(practice, practice.id)}`),
    element("p", "", meansAt(board.data.supporting_scale, value)));
  const note = board.data.supporting_notes[lab.id]?.[practice.id];
  if (note) content.append(element("p", "", note));
  if (value === 0) content.append(element("p", "subtitle", board.data.disclosure_note));
  content.append(view.h3("What each score means"), scaleList(value));
  content.append(view.h3(`What we found on ${lab.name}`),
    paragraphs(board.data.profiles[lab.id][column.prose]), toProfile(lab, null));
}

/* One of the four the company alone can show, for one company: the sentence
 * that says what it publishes, and the passages behind it. */
function disclosedScore(content, lab, practice) {
  const value = board.data.internal_scores[lab.id][practice.id];
  const found = board.data.internal_evidence[lab.id][practice.id];
  view.titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, practice.label);
  content.append(view.figure(shown(onTen(value, PRACTICE)), ` out of ${TEN}`),
    element("p", "subtitle", `${onItsScale(value, PRACTICE)} ${fromLine(practice, practice.id)}`),
    element("p", "", meansAt(practice.anchors, value)), element("p", "", found.sentence));
  if (value === 0) content.append(element("p", "subtitle", board.data.disclosure_note));
  if (found.sources.length) {
    content.append(view.h3(`What ${lab.name} publishes`));
    found.sources.forEach(source => content.append(sourceQuote(source)));
  }
  content.append(view.h3("What each score means"),
    scaleList(value, practice.anchors), toProfile(lab, null), paperFold(practice));
}

function unscoredScore(content, lab, practice) {
  view.titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, practice.label);
  content.append(view.figure("NA", ", not assessed"),
    element("p", "", `Whether ${lab.name} does this cannot be confirmed from what it `
      + "publishes. It would take an internal audit."),
    element("p", "", board.data.internal_note),
    view.h3("What an audit would look at"), element("p", "", practice.audit),
    toProfile(lab, null));
}

/* ---- What each row is, with no company in front of it ---------------------- */

function aboutColumn(content, column) {
  view.titled(content, `${column.name}, out of ${column.out_of}`, column.plain);
  content.append(element("p", "", column.about));
  content.append(view.h3("The rows it is made of"));
  const list = element("ul", "check-list");
  const rows = rowsOf(column);
  column.questions.forEach(id => {
    const question = questionOf(id);
    const item = element("li");
    item.append(element("span", "check-id", `${id} `),
      element("span", "", `${question.name}, ${question.checks.length} checks, `
        + `${frac(question.checks.length, rows)} of the figure. `
        + `${question.plain} From ${creditOf(board.data, question)}.`));
    list.append(item);
  });
  column.practices.forEach(id => {
    const practice = practiceOf(board.data, id);
    const item = element("li");
    item.append(element("span", "check-id", id),
      element("span", "", `${practice.label} ${frac(1, rows)} of the figure. `
        + `From ${creditOf(board.data, practice)}.`));
    list.append(item);
  });
  content.append(list);
  if (column.unscored) {
    content.append(view.h3("What this column does not count"),
      unscoredList(column, false), element("p", "", board.data.internal_note));
  }
  content.append(view.h3("How it enters the final score"),
    element("p", "", board.data.total.about));
}

/* The final score for one company: the two figures it adds, and its place. */
function totalScore(content, lab) {
  const total = board.data.total;
  view.titled(content, `${lab.name}: ${total.name.toLowerCase()}`, total.plain);
  content.append(view.figure(shown(lab.total), ` out of ${total.out_of}`),
    element("p", "subtitle", `${lab.name} is ranked ${lab.rank} of ${board.labs.length} on it.`));
  const list = element("ul", "check-list");
  board.data.columns.forEach(column => {
    const item = element("li");
    item.append(view.chip(lab.byColumn[column.id], column.out_of, shown(lab.byColumn[column.id])),
      element("span", "", `${column.name}, `
        + `${weightLine(share(total.weights[column.id]), "the final score")}`));
    list.append(item);
  });
  content.append(list, element("p", "subtitle", total.about), toProfile(lab, null));
}

/* The final score with no company in front of it. */
function aboutTotal(content) {
  const total = board.data.total;
  view.titled(content, `${total.name}, out of ${total.out_of}`, total.plain);
  content.append(element("p", "", total.about));
}

function aboutQuestion(content, question) {
  view.titled(content, question.name, question.plain);
  content.append(element("p", "", question.explainer));
  if (question.minimum) {
    content.append(view.h3("Part of the minimum"), element("p", "", board.data.minimum_note));
  }
  content.append(view.h3("How it is scored"));
  content.append(element("p", "", `${question.checks.length} checks, each scored from 0 to 4 and `
    + "shown out of 10. The question's figure is their average, and each check counts on its own "
    + "towards what is published. Open a check to see what earns each score."),
  element("p", "subtitle", fromLine(question, `ask ${question.id}`)));
  question.checks.forEach(check => {
    const fold = element("details");
    const summary = element("summary");
    summary.append(element("span", "check-id", check.id), element("span", "", check.label));
    fold.append(summary, anchorsList(check, null));
    content.append(fold);
  });
  content.append(view.showInTable(question.id, "its checks"));
  // The paper's own wording, folded, under the sentences a reader came for.
  content.append(view.h3("What the working paper asks"),
    element("p", "", question.question), paperFold(question));
}

function aboutCheck(content, question, check) {
  view.titled(content, check.short, `${check.label}.`);
  content.append(element("p", "subtitle",
    `One of the checks on the ${question.name.toLowerCase()} question, scored from 0 to 4 and `
    + "shown out of 10."), element("p", "subtitle", fromLine(question, `check ${check.id}`)));
  content.append(view.h3("What each score means"), anchorsList(check, null),
    element("p", "subtitle", "A score of 1 or 3 falls between the descriptions either side of it."),
    paperFold(check));
}

function aboutPractice(content, practice, column) {
  view.titled(content, practice.short, practice.label);
  content.append(element("p", "subtitle",
    `A best practice, scored 0, 1 or 2 and shown out of 10, counted in `
    + `${column.name.toLowerCase()}.`), element("p", "subtitle", fromLine(practice, practice.id)),
  view.h3("What each score means"), scaleList(null),
  element("p", "subtitle", board.data.disclosure_note), paperFold(practice));
}

function aboutDisclosedPractice(content, practice) {
  view.titled(content, practice.short, practice.label);
  content.append(
    element("p", "subtitle", "A best practice only the company can show, scored 0, 1 or 2 on what "
      + "it publishes and shown out of 10."), element("p", "subtitle", fromLine(practice, practice.id)),
    view.h3("What each score means"), scaleList(null, practice.anchors),
    element("p", "subtitle", board.data.disclosure_note), paperFold(practice));
}

function aboutUnscoredPractice(content, practice) {
  view.titled(content, practice.short, practice.label);
  content.append(
    element("p", "subtitle", "Not assessed for any company, because no internal audit has been done."),
    element("p", "subtitle", fromLine(practice, practice.id)),
    element("p", "", board.data.internal_note),
    view.h3("What an audit would look at"), element("p", "", practice.audit),
    paperFold(practice));
}

/* A group of practices for one company: the mean, and each practice under it. */
function groupScore(content, lab, group) {
  const value = groupAverage(lab.id, group);
  view.titled(content, `${lab.name}: ${group.name.toLowerCase()}`, group.plain);
  content.append(view.figure(shown(value), ` out of ${TEN}`),
    element("p", "subtitle", "The average of its practices, each scored 0, 1 or 2 and counting "
      + "the same."));
  const list = element("ul", "check-list");
  group.practices.forEach(id => {
    const item = element("li");
    const score = practiceScoreOf(board.data, lab.id, id);
    item.append(view.chip(onTen(score, PRACTICE), TEN, shown(onTen(score, PRACTICE))),
      element("span", "check-id", id),
      element("span", "", `${practiceOf(board.data, id).label} (${score} of ${PRACTICE})`));
    list.append(item);
  });
  content.append(list);
  if (group.unscored) {
    content.append(view.h3("Not scored"), unscoredList(group, true));
  }
  if (group.practices.some(id => onlyTheCompany(board.data, id))) {
    content.append(element("p", "subtitle", board.data.disclosure_note));
  }
  content.append(view.showInTable(groupKey(group), "its practices"), toProfile(lab, null));
}

/* A group with no company in front of it: what it gathers and how it is read. */
function aboutGroup(content, group, column) {
  view.titled(content, group.name, group.plain);
  content.append(element("p", "", `${group.practices.length} `
    + `practice${group.practices.length === 1 ? "" : "s"}, each scored 0, 1 or 2. The group shows `
    + `their average, and each counts on its own towards ${column.name.toLowerCase()}.`));
  content.append(practiceLabels(group.practices));
  if (group.practices.some(id => onlyTheCompany(board.data, id))) {
    content.append(view.h3("Scored on what the company publishes"),
      element("p", "", board.data.disclosed_intro),
      element("p", "subtitle", board.data.disclosure_note));
  }
  if (group.unscored) {
    content.append(view.h3("Not scored"), unscoredList(group, false),
      element("p", "", board.data.internal_note));
  }
  content.append(view.showInTable(groupKey(group), "its practices"));
}

/* ---- The table --------------------------------------------------------------- */

/* One cell of a company's column: the board wants the company's name for the
 * accessible label and its id for the address a walker selects on. */
const cellFor = (lab, rowLabel, row, rest) => view.scoreCell({
  name: lab.name, rowLabel, dataset: { lab: lab.id, row }, showMax: false, ...rest,
});

function headRow() {
  const row = element("tr");
  const corner = element("th", "row-col");
  corner.scope = "col";
  corner.append(element("span", "head-name", "Score (out of 10)"),
    element("span", "head-sub", "companies by rank"));
  row.append(corner);
  board.labs.forEach(lab => {
    const cell = element("th");
    cell.scope = "col";
    const button = element("button", "company-button");
    button.type = "button";
    button.dataset.lab = lab.id;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", `${lab.name}, ranked ${lab.rank}`
      + `${lab.open_weights ? ", open weights" : ""}: its profile`);
    button.append(element("span", "rank", place(lab.rank)));
    // Drawn, quiet and decorative: the name under it is what is read out, and a
    // company the set has no mark for keeps the space so every name starts on
    // one line.
    button.append(companyMark(lab.id));
    button.append(element("span", "company-name", lab.name));
    if (lab.open_weights) {
      const flag = element("span", "company-flag", "Open weights");
      const sign = element("span", "row-mark", NOTE.openWeights);
      sign.setAttribute("aria-hidden", "true");
      flag.append(sign);
      button.append(flag);
    }
    button.addEventListener("click", () =>
      view.openPopover(button, content => profile(content, lab, null)));
    cell.append(button);
    row.append(cell);
  });
  return row;
}

/* A group of practices is addressed by a key no question id can take, since
 * the fold and the cells select on the same attribute for both. */
const groupKey = group => `group-${group.id}`;
/* A figure's own fold, which holds its questions, its groups and any practice
 * that stands alone. It is open by default. */
const columnKey = column => `column-${column.id}`;
/* Everything a column's fold opens onto, as the DOM ids of those rows. */
const columnChildren = column => [
  ...column.questions.map(id => `gov-question-${id}`),
  ...(column.groups || []).map(group => `gov-group-${group.id}`),
  ...column.practices.filter(id => !groupOf(column, id)).map(practiceRowId),
  ...(column.unscored || []).filter(id => !groupOf(column, id)).map(practiceRowId),
];
const practiceRowId = id => `gov-practice-${id}`;
const groupAverage = (labId, group) => average(group.practices
  .map(id => onTen(practiceScoreOf(board.data, labId, id), PRACTICE)));
/* How many rows a column's figure averages, every check and practice counting
 * the same, and the group a practice is folded into, if any. */
const rowsOf = column => column.questions
  .reduce((sum, id) => sum + questionOf(id).checks.length, 0) + column.practices.length;
const groupOf = (column, id) => (column.groups || [])
  .find(group => group.practices.includes(id) || (group.unscored || []).includes(id));

/* Where a row comes from, said in the popover it opens rather than on the row:
 * the paper, and the row's number in it. */
const fromLine = (row, id) => `From ${board.data.papers[row.paper].by}, "${
  board.data.papers[row.paper].title}", ${id}.`;

/* The numbered notes under the table, in the order they are listed. A row
 * carries the number of every note that applies to it beside its name; the
 * number is hidden from a screen reader, which hears the same thing in the
 * row's label instead. */
const NOTE = {
  final: "1", published: "2", engages: "3", minimum: "4", memo: "5", kembery: "6",
  unscored: "7", openWeights: "8",
};
const paperNote = row => NOTE[row.paper];

/* One practice's row: under its column, or folded under its group. */
function practiceRow(column, id, parent) {
  const practice = practiceOf(board.data, id);
  const company = onlyTheCompany(board.data, id);
  const name = view.rowName(practice.short,
    weightLine(frac(1, rowsOf(column)), column.name.toLowerCase()),
    company ? content => aboutDisclosedPractice(content, practice)
      : content => aboutPractice(content, practice, column),
    `${practice.short}: what its scores mean`, [paperNote(practice)]);
  const row = parent ? view.subRow(practiceRowId(id), parent, name) : element("tr");
  if (!parent) {
    row.id = practiceRowId(id);
    row.dataset.parent = columnKey(column);
    row.append(view.rowHead(null, name));
  }
  row.classList.add("practice-row");
  row.dataset.practice = id;
  row.dataset.level = parent ? "3" : "2";
  board.labs.forEach(lab => {
    const value = onTen(practiceScoreOf(board.data, lab.id, id), PRACTICE);
    row.append(cellFor(lab, practice.short.toLowerCase(), id, {
      value, max: TEN, text: shown(value),
      build: company ? content => disclosedScore(content, lab, practice)
        : content => practiceScore(content, lab, practice),
    }));
  });
  return row;
}

/* The practice nobody could score: NA for every company, in neither figure. */
function unscoredRow(id, parent, column) {
  const practice = practiceOf(board.data, id);
  const name = view.rowName(practice.short, null,
    content => aboutUnscoredPractice(content, practice),
    `${practice.short}, not scored and counted in neither figure: what it asks`,
    [paperNote(practice), NOTE.unscored]);
  const row = parent ? view.subRow(practiceRowId(id), parent, name) : element("tr");
  if (!parent) {
    row.id = practiceRowId(id);
    row.dataset.parent = columnKey(column);
    row.append(view.rowHead(null, name));
  }
  row.classList.add("practice-row");
  row.dataset.practice = id;
  row.dataset.level = parent ? "3" : "2";
  board.labs.forEach(lab => row.append(view.naCell({
    name: lab.name, rowLabel: practice.short.toLowerCase(),
    dataset: { lab: lab.id, row: id },
    build: content => unscoredScore(content, lab, practice),
  })));
  return row;
}

function renderTable() {
  const body = document.createDocumentFragment();

  // The final score, above both figures: the one the companies are ranked by.
  const total = board.data.total;
  const totalRow = element("tr", "total-row outside-row column-row final-row");
  totalRow.dataset.column = "total";
  totalRow.dataset.level = "0";
  totalRow.append(view.rowHead(null, view.rowName(total.name, null, aboutTotal,
    `${total.name}, out of ${total.out_of}: how it is worked out`, [NOTE.final])));
  board.labs.forEach(lab => totalRow.append(cellFor(lab, total.name.toLowerCase(), "total", {
    value: lab.total, max: TEN, text: shown(lab.total),
    build: content => totalScore(content, lab),
  })));
  body.append(totalRow);

  board.data.columns.forEach(column => {
    const figure = column.name.toLowerCase();
    const rows = rowsOf(column);
    // The head of a column: its own figure, in the size the board gives a
    // headline, with a rule above it so the two read as two figures rather than
    // one column of rows.
    const head = element("tr", "total-row outside-row column-row");
    head.dataset.column = column.id;
    head.dataset.level = "1";
    head.append(view.rowHead(
      view.rowToggle(columnKey(column), columnChildren(column),
        { parts: "rows", name: column.name }),
      view.rowName(column.name,
      weightLine(share(total.weights[column.id]), "the final score"),
      content => aboutColumn(content, column), `${column.name}: what it covers`,
      [NOTE[column.id]])));
    board.labs.forEach(lab => head.append(cellFor(lab, figure, column.id, {
      value: lab.byColumn[column.id], max: TEN, text: shown(lab.byColumn[column.id]),
      build: content => columnScore(content, lab, column),
    })));
    body.append(head);

    column.questions.forEach(id => {
      const question = questionOf(id);
      const row = element("tr", "question-row");
      row.id = `gov-question-${question.id}`;
      row.dataset.question = question.id;
      row.dataset.parent = columnKey(column);
      row.dataset.level = "2";
      row.append(view.rowHead(
        view.rowToggle(question.id, question.checks.map(check => rowId(check.id)),
          { parts: "checks", name: question.name }),
        view.rowName(question.name, weightLine(frac(question.checks.length, rows), figure),
          content => aboutQuestion(content, question),
          `${question.name}${question.minimum ? ", part of the minimum" : ""}: what it asks`,
          question.minimum ? [NOTE.minimum, paperNote(question)] : [paperNote(question)])));
      board.labs.forEach(lab => {
        const value = onTen(lab.byQuestion[question.id], SCALE);
        row.append(cellFor(lab, question.name.toLowerCase(), question.id, {
          value, max: TEN, text: shown(value),
          build: content => questionScore(content, lab, question),
        }));
      });
      body.append(row);

      question.checks.forEach(check => {
        const sub = view.subRow(rowId(check.id), question.id,
          view.rowName(check.short, weightLine(frac(1, rows), figure),
            content => aboutCheck(content, question, check),
            `${check.short}: what its scores mean`));
        sub.dataset.level = "3";
        board.labs.forEach(lab => {
          const value = onTen(board.data.scores[lab.id][check.id], SCALE);
          sub.append(cellFor(lab, check.short.toLowerCase(), check.id, {
            value, max: TEN, text: shown(value),
            build: content => checkScore(content, lab, question, check),
          }));
        });
        body.append(sub);
      });
    });

    // A column's practices sit under it one by one, unless the column gathers
    // them into groups: then each group is one row, the mean of its practices,
    // which opens into them the way a question opens into its checks. Grouping
    // is only how the rows are shown. The column's figure is still the mean of
    // every practice, each counted once.
    const grouped = new Set((column.groups || [])
      .flatMap(group => [...group.practices, ...(group.unscored || [])]));
    column.practices.filter(id => !grouped.has(id))
      .forEach(id => body.append(practiceRow(column, id)));
    (column.unscored || []).filter(id => !grouped.has(id))
      .forEach(id => body.append(unscoredRow(id, null, column)));

    (column.groups || []).forEach(group => {
      const members = [...group.practices, ...(group.unscored || [])];
      const row = element("tr", "question-row group-row");
      row.id = `gov-group-${group.id}`;
      row.dataset.group = group.id;
      row.dataset.parent = columnKey(column);
      row.dataset.level = "2";
      row.append(view.rowHead(
        view.rowToggle(groupKey(group), members.map(practiceRowId),
          { parts: "practices", name: group.name }),
        view.rowName(group.name, weightLine(frac(group.practices.length, rows), figure),
          content => aboutGroup(content, group, column), `${group.name}: what it gathers`)));
      board.labs.forEach(lab => {
        const value = groupAverage(lab.id, group);
        row.append(cellFor(lab, group.name.toLowerCase(), groupKey(group), {
          value, max: TEN, text: shown(value),
          build: content => groupScore(content, lab, group),
        }));
      });
      body.append(row);
      group.practices.forEach(id => body.append(practiceRow(column, id, groupKey(group))));
      (group.unscored || []).forEach(id => body.append(unscoredRow(id, groupKey(group))));
    });
  });

  const table = view.nodes.table;
  table.tHead.replaceChildren(headRow());
  table.tBodies[0].replaceChildren(body);
}

function renderLegend() {
  const legend = document.createDocumentFragment();
  legend.append(element("span", "", "Colour goes from nothing scored to the most a row can score:"),
    element("span", "", "none (0)"));
  legend.append(view.swatches([0, 2.5, 5, 7.5, 10], TEN), element("span", "", "all (10)"));
  const na = element("span", "legend-na");
  na.append(view.naChip(), document.createTextNode(" not assessed, needs an internal audit"));
  legend.append(na);
  board.nodes.legend.replaceChildren(legend);
}

/* The numbered notes under the table: what each figure means, where each row
 * comes from and what the signs beside a name say. Everything the page used to
 * say above the table is here, once, so the board comes straight after the
 * introduction. */
function renderColumns() {
  const data = board.data;
  const [published, engages] = data.columns;
  const paper = id => `${data.papers[id].by}, "${data.papers[id].title}", `
    + `${data.papers[id].status}. ${data.papers[id].purpose}`;
  const notes = [
    [NOTE.final, data.total.name, `${data.total.plain} Every figure on the board is out of 10, and `
      + "each row says under its name how much it counts for in the figure it belongs to."],
    [NOTE.published, published.name, published.plain],
    [NOTE.engages, engages.name, engages.plain],
    [NOTE.minimum, "Part of the minimum", data.minimum_note],
    [NOTE.memo, "Polaris Collective working paper", paper("memo")],
    [NOTE.kembery, "Kembery et al. working paper", paper("kembery")],
    [NOTE.unscored, "Not scored", data.internal_note],
    [NOTE.openWeights, "Open weights", data.open_weights_note],
  ];
  const list = element("ol", "gov-notes");
  notes.forEach(([number, name, text]) => {
    const item = element("li");
    item.value = Number(number);
    item.append(element("strong", "", `${name}. `), document.createTextNode(text));
    list.append(item);
  });
  const lines = document.createDocumentFragment();
  lines.append(list, element("p", "gov-foot", data.ours_note));
  board.nodes.columns.replaceChildren(lines);
}

/* The ties the ranking has to leave standing, said under the table. */
function renderTies() {
  const lines = [];
  board.labs.forEach((lab, index) => {
    const next = board.labs[index + 1];
    if (!next || !level(next.ranking, lab.ranking)) return;
    lines.push(`${lab.name} and ${next.name} tie on ${shown(lab.ranking)} out of `
      + `${board.data.total.out_of}, so they share ${ORDINALS[lab.rank - 1]} place.`);
  });
  board.nodes.ties.textContent = lines.join(" ");
}

/* The findings, open. They were folds until 23 September 2026, which put them in
 * the same shape as the reference sections under them and made a reader press
 * eight times to learn what the table shows. The detail is folded below instead,
 * and this is read straight down. */
function renderFindings() {
  const list = document.createDocumentFragment();
  board.data.findings.forEach(finding => {
    const block = element("div", "finding");
    block.append(element("h3", "", finding.title), element("p", "", finding.text));
    list.append(block);
  });
  board.nodes.findings.replaceChildren(list);
}

/* ---- The reference text under the board ----------------------------------------- */

function renderScoring() {
  const blocks = document.createDocumentFragment();
  board.data.questions.forEach(question => {
    blocks.append(element("h3", "", `${question.name}: ${question.question}`));
    const wrap = element("div", "table-scroll");
    const table = element("table", "gov-table gov-scoring-table");
    const head = element("tr");
    ["Check", "0", "2", "4"].forEach((text, index) => {
      const cell = element("th", index ? "" : "check-col", text);
      cell.scope = "col";
      head.append(cell);
    });
    const thead = element("thead");
    thead.append(head);
    const tbody = element("tbody");
    question.checks.forEach(check => {
      const row = element("tr");
      const name = element("th");
      name.scope = "row";
      name.append(element("strong", "", `${check.short}. `), element("span", "", check.label));
      row.append(name);
      ["0", "2", "4"].forEach(mark => row.append(element("td", "", check.anchors[mark])));
      tbody.append(row);
    });
    table.append(thead, tbody);
    wrap.append(table);
    blocks.append(wrap);
  });
  board.nodes.scoring.replaceChildren(blocks);

  // The practices, listed under the column each is counted in, with the section
  // of the paper it comes from. The paper itself is named once, above.
  const bullet = id => {
    const practice = practiceOf(board.data, id);
    const item = element("li");
    item.append(element("strong", "", `${practice.short}. `),
      document.createTextNode(`${practice.label} ${practice.source}.`));
    return item;
  };
  const fill = (node, ids) => {
    const list = document.createDocumentFragment();
    ids.forEach(id => list.append(bullet(id)));
    node.replaceChildren(list);
  };
  const published = board.data.columns.find(column => column.id === "published");
  const engages = board.data.columns.find(column => column.id === "engages");
  fill(board.nodes.publishedPractices, published.practices);
  fill(board.nodes.engagedPractices,
    engages.practices.filter(id => !onlyTheCompany(board.data, id)));
  fill(board.nodes.disclosed, engages.practices.filter(id => onlyTheCompany(board.data, id)));
  fill(board.nodes.internal, engages.unscored || []);
}

async function loadGovernance() {
  try {
    const response = await fetch("/governance.json");
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function initializeGovernance() {
  const byId = id => document.getElementById(id);
  view = createBoard({
    nodes: { table: byId("gov-heatmap"), pop: byId("gov-pop"), expandAll: byId("gov-expand-all") },
    everyRow: { show: "Show every row", hide: "Hide every row" },
  });
  board.nodes = {
    status: byId("gov-status"), legend: byId("gov-legend"), findings: byId("gov-findings"),
    scoring: byId("gov-scoring"), publishedPractices: byId("gov-published-practices"),
    engagedPractices: byId("gov-engaged-practices"), disclosed: byId("gov-disclosed"),
    internal: byId("gov-internal"), ties: byId("gov-ties"), columns: byId("gov-columns"),
    origin: byId("gov-origin"),
  };
  const data = await loadGovernance();
  if (!data) {
    board.nodes.status.textContent = "The governance scores could not be loaded.";
    return;
  }
  board.data = data;
  board.labs = ranked(data);
  // Where the questions and the practices come from, said once, above the board.
  if (board.nodes.origin) board.nodes.origin.textContent = data.origin;
  renderTable();
  // Both figures open by default, each question and group shut.
  data.columns.forEach(column => view.setExpanded(columnKey(column), true));
  renderLegend();
  renderColumns();
  renderTies();
  renderFindings();
  renderScoring();
  view.wirePopover();
  view.nodes.expandAll.addEventListener("click", () => view.expandEvery());
  board.nodes.status.textContent = "";
}
