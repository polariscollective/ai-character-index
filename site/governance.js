/* The overview's second view: how each company governs the rules its models follow.
 *
 * A board rather than a document: one table that takes the whole width, the
 * companies across in rank order, and down the side two figures, each out of
 * ten, each with the rows it is made of under it.
 *
 * "What is published" is what a reader can check without being let in: the ten
 * checks of the four asks, which open under their questions, and the licence on
 * the published text. It is the figure the companies are ranked by. "What it
 * engages" is whether the document binds the models: eight practices, scored on
 * what each company publishes about its own, sitting beside the first figure and
 * entering no rank. A ninth practice is counted in neither, because nobody
 * outside could check it, and the row says so.
 *
 * The two are never added. The checks carry a written description of 0, 2 and 4
 * on every line; the practices are scored 0, 1 or 2 against one generic scale
 * with no line of its own, so a single total would read as more precise than
 * the scores behind it are. The board says that under the table, in
 * governance.json's own words.
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

import { createBoard, element, level, rankBy, ORDINALS } from "./board.js";
/* The mark of each company, above its name. One module for both boards, and it
 * says where the drawings come from and which two companies have none. */
import { companyMark } from "./company-marks.js";

const SCALE = 4;      // a question, and each of its checks
const PRACTICE = 2;   // a best practice, wherever it is counted
/* A question or a column's figure, to one decimal. A check and a practice stay
 * whole numbers. */
const shown = value => value.toFixed(1);

const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

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
 * ten. A check out of 4 and a practice out of 2 can sit in one column that way
 * without either being rescored, which is the whole reason the two figures are
 * not added to each other. */
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
  return { byQuestion, byColumn };
}

/* The rank is the first column's figure and nothing else: the second sits
 * beside it and never breaks a tie, so companies level on the first share a
 * place. */
const RANKED_BY = data => data.columns.find(column => column.ranks).id;
const ahead = (a, b) => !level(a.ranking, b.ranking) && a.ranking > b.ranking;

export function ranked(data) {
  const by = RANKED_BY(data);
  const labs = data.labs
    .map(lab => {
      const totals = totalsFor(data, lab.id);
      return { ...lab, ...totals, ranking: totals.byColumn[by] };
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
    item.append(view.chip(board.data.scores[lab.id][check.id], SCALE),
      element("span", "check-id", check.id), element("span", "", check.label));
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
    item.append(view.chip(practiceScoreOf(board.data, lab.id, id), PRACTICE),
      element("span", "check-id", id), element("span", "", said));
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

  board.data.columns.forEach(column => {
    const figure = lab.byColumn[column.id];
    content.append(view.h3(column.name),
      view.figure(shown(figure), ` out of ${column.out_of}`
        + `${column.ranks ? ", the figure it is ranked by" : ", beside the rank and not in it"}`));
    column.questions.forEach(id => {
      const question = questionOf(id);
      const fold = element("details");
      fold.open = open === id;
      const summary = element("summary");
      summary.append(view.chip(lab.byQuestion[id], SCALE, shown(lab.byQuestion[id])),
        element("span", "", `${question.name}, ${shown(lab.byQuestion[id])} out of ${SCALE}`));
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
  content.append(element("p", "subtitle", board.data.not_added));

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
    element("p", "subtitle", `The mean of the rows below, each as a share of its own maximum. `
      + `${column.ranks ? `${lab.name} is ranked ${lab.rank} of ${board.labs.length} on it.`
        : "It does not enter the rank."}`));
  const list = element("ul", "check-list");
  column.questions.forEach(id => {
    const item = element("li");
    item.append(view.chip(lab.byQuestion[id], SCALE, shown(lab.byQuestion[id])),
      element("span", "check-id", id), element("span", "", questionOf(id).name));
    list.append(item);
  });
  column.practices.forEach(id => {
    const item = element("li");
    item.append(view.chip(practiceScoreOf(board.data, lab.id, id), PRACTICE),
      element("span", "check-id", id), element("span", "", practiceOf(board.data, id).label));
    list.append(item);
  });
  content.append(list, toProfile(lab, null));
}

function questionScore(content, lab, question) {
  view.titled(content, `${lab.name}: ${question.name.toLowerCase()}`, question.plain);
  content.append(view.figure(shown(lab.byQuestion[question.id]), ` out of ${SCALE}`),
    element("p", "subtitle", "The average of its checks, each scored from 0 to 4."),
    checksOf(lab, question));
  content.append(view.h3("What we found"),
    paragraphs(board.data.profiles[lab.id][question.id]), toProfile(lab, question.id));
}

function checkScore(content, lab, question, check) {
  const value = board.data.scores[lab.id][check.id];
  view.titled(content, `${lab.name}: ${check.short.toLowerCase()}`, `${check.label}.`);
  content.append(view.figure(value, " out of 4"),
    element("p", "", meansAt(check.anchors, value)));
  content.append(view.h3("What each score means"), anchorsList(check, value));
  content.append(view.h3(`What we found on ${lab.name}'s ${question.name.toLowerCase()}`),
    paragraphs(board.data.profiles[lab.id][question.id]), toProfile(lab, question.id));
}

/* One of the five anyone can check, for one company. */
function practiceScore(content, lab, practice) {
  const value = board.data.supporting_scores[lab.id][practice.id];
  const column = columnOf(board.data, practice.id);
  view.titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, `${practice.id} ${practice.label}`);
  content.append(view.figure(value, ` out of ${PRACTICE}`),
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
  view.titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, `${practice.id} ${practice.label}`);
  content.append(view.figure(value, ` out of ${PRACTICE}`),
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
  view.titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, `${practice.id} ${practice.label}`);
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
  column.questions.forEach(id => {
    const question = questionOf(id);
    const item = element("li");
    item.append(element("span", "check-id", `${id} `),
      element("span", "", `${question.name}, ${question.checks.length} checks out of 4 each. `
        + `${question.plain} ${creditOf(board.data, question)}.`));
    list.append(item);
  });
  column.practices.forEach(id => {
    const practice = practiceOf(board.data, id);
    const item = element("li");
    item.append(element("span", "check-id", id),
      element("span", "", `${practice.label} Out of ${PRACTICE}. `
        + `${creditOf(board.data, practice)}.`));
    list.append(item);
  });
  content.append(list);
  if (column.unscored) {
    content.append(view.h3("What this column does not count"),
      unscoredList(column, false), element("p", "", board.data.internal_note));
  }
  content.append(view.h3("Why the two figures are not added"),
    element("p", "", board.data.not_added));
}

function aboutQuestion(content, question) {
  view.titled(content, question.name, question.plain);
  content.append(element("p", "", question.explainer));
  if (question.minimum) {
    content.append(view.h3("Part of the minimum"), element("p", "", board.data.minimum_note));
  }
  content.append(view.h3("How it is scored"));
  content.append(element("p", "", `${question.checks.length} checks, each scored from 0 to 4. `
    + "The question's score is their average, and each of its checks counts on its own towards "
    + "what is published. Open a check to see what earns each score."));
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
    `Check ${check.id}, one of the checks on the ${question.name.toLowerCase()} question, `
    + "scored from 0 to 4."));
  content.append(view.h3("What each score means"), anchorsList(check, null),
    element("p", "subtitle", "A score of 1 or 3 falls between the descriptions either side of it."),
    paperFold(check));
}

function aboutPractice(content, practice, column) {
  view.titled(content, practice.short, `${practice.id} ${practice.label}`);
  content.append(element("p", "subtitle",
    `A best practice, scored 0, 1 or 2, counted in ${column.name.toLowerCase()}.`),
  view.h3("What each score means"), scaleList(null),
  element("p", "subtitle", board.data.disclosure_note), paperFold(practice));
}

function aboutDisclosedPractice(content, practice) {
  view.titled(content, practice.short, `${practice.id} ${practice.label}`);
  content.append(
    element("p", "subtitle", "A best practice only the company can show, scored on what it publishes."),
    view.h3("What each score means"), scaleList(null, practice.anchors),
    element("p", "subtitle", board.data.disclosure_note), paperFold(practice));
}

function aboutDisclosed(content) {
  view.titled(content, "What only the company can show",
    "Four best practices, scored on what the company publishes.");
  content.append(element("p", "", board.data.disclosed_intro),
    practiceLabels(board.data.internal.filter(practice => practice.asked_to_publish)
      .map(practice => practice.id)),
    element("p", "subtitle", board.data.disclosure_note));
}

function aboutUnscoredPractice(content, practice) {
  view.titled(content, practice.short, `${practice.id} ${practice.label}`);
  content.append(
    element("p", "subtitle", "Not assessed for any company, because no internal audit has been done."),
    element("p", "", board.data.internal_note),
    view.h3("What an audit would look at"), element("p", "", practice.audit),
    paperFold(practice));
}

/* ---- The table --------------------------------------------------------------- */

/* One cell of a company's column: the board wants the company's name for the
 * accessible label and its id for the address a walker selects on. */
const cellFor = (lab, rowLabel, row, rest) => view.scoreCell({
  name: lab.name, rowLabel, dataset: { lab: lab.id, row }, ...rest,
});

function headRow() {
  const row = element("tr");
  const corner = element("th", "row-col");
  corner.scope = "col";
  corner.append(element("span", "head-name", "Score"),
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
    button.append(element("span", "rank", String(lab.rank)));
    // Drawn, quiet and decorative: the name under it is what is read out, and a
    // company the set has no mark for keeps the space so every name starts on
    // one line.
    button.append(companyMark(lab.id));
    button.append(element("span", "company-name", lab.name));
    if (lab.open_weights) button.append(element("span", "company-flag", "Open weights"));
    button.addEventListener("click", () =>
      view.openPopover(button, content => profile(content, lab, null)));
    cell.append(button);
    row.append(cell);
  });
  return row;
}

/* A line across the table with a note in it and no figures: what marks the
 * four practices scored on what a company publishes rather than on what anyone
 * can read. */
function noteRow(name, sub, note, build, label) {
  const row = element("tr", "check-row practice-divider");
  const head = element("th");
  head.scope = "row";
  head.append(view.rowName(name, sub, build, label));
  const text = element("td", "divider-note", note);
  text.colSpan = board.labs.length;
  row.append(head, text);
  return row;
}

function renderTable() {
  const body = document.createDocumentFragment();

  board.data.columns.forEach(column => {
    // The head of a column: its own figure, in the size the board gives a
    // headline, with a rule above it so the two read as two figures rather than
    // one column of rows. Both wear the same two classes, which is why the
    // second does not come out heavier than the first.
    const head = element("tr", "total-row outside-row column-row");
    head.dataset.column = column.id;
    head.append(view.rowHead(null, view.rowName(column.name,
      `out of ${column.out_of}${column.ranks ? ", ranks the companies" : ", not ranked"}`,
      content => aboutColumn(content, column),
      `${column.name}, out of ${column.out_of}: what it covers`)));
    board.labs.forEach(lab => head.append(cellFor(lab, column.name.toLowerCase(), column.id, {
      value: lab.byColumn[column.id], max: column.out_of, text: shown(lab.byColumn[column.id]),
      build: content => columnScore(content, lab, column),
    })));
    body.append(head);

    column.questions.forEach(id => {
      const question = questionOf(id);
      const row = element("tr", "question-row");
      row.dataset.question = question.id;
      row.append(view.rowHead(
        view.rowToggle(question.id, question.checks.map(check => rowId(check.id)),
          { parts: "checks", name: question.name }),
        view.rowName(question.name,
          `out of ${SCALE}${question.minimum ? ", part of the minimum" : ""}, `
          + `${creditOf(board.data, question)}`,
          content => aboutQuestion(content, question), `${question.name}: what it asks`)));
      board.labs.forEach(lab => row.append(cellFor(lab, question.name.toLowerCase(), question.id, {
        value: lab.byQuestion[question.id], max: SCALE, text: shown(lab.byQuestion[question.id]),
        build: content => questionScore(content, lab, question),
      })));
      body.append(row);

      question.checks.forEach(check => {
        const sub = view.subRow(rowId(check.id), question.id,
          view.rowName(check.short, check.id,
            content => aboutCheck(content, question, check),
            `${check.id} ${check.short}: what its scores mean`));
        board.labs.forEach(lab => sub.append(cellFor(lab, check.short.toLowerCase(), check.id, {
          value: board.data.scores[lab.id][check.id], max: SCALE,
          build: content => checkScore(content, lab, question, check),
        })));
        body.append(sub);
      });
    });

    let marked = false;
    column.practices.forEach(id => {
      const practice = practiceOf(board.data, id);
      const company = onlyTheCompany(board.data, id);
      // Said once, where the first of them sits: these four are scored on what
      // the company publishes, and a 0 means we looked and found nothing.
      if (company && !marked) {
        marked = true;
        body.append(noteRow("What only the company can show", "scored on what it publishes",
          board.data.disclosure_note, aboutDisclosed,
          "Practices only the company can show: how they are scored"));
      }
      const row = element("tr", "practice-row");
      row.dataset.practice = id;
      row.append(view.rowHead(null, view.rowName(practice.short,
        `out of ${PRACTICE}, ${creditOf(board.data, practice)}`,
        company ? content => aboutDisclosedPractice(content, practice)
          : content => aboutPractice(content, practice, column),
        `${id} ${practice.short}: what its scores mean`)));
      board.labs.forEach(lab => row.append(cellFor(lab, practice.short.toLowerCase(), id, {
        value: practiceScoreOf(board.data, lab.id, id), max: PRACTICE,
        build: company ? content => disclosedScore(content, lab, practice)
          : content => practiceScore(content, lab, practice),
      })));
      body.append(row);
    });

    (column.unscored || []).forEach(id => {
      const practice = practiceOf(board.data, id);
      const row = element("tr", "practice-row");
      row.dataset.practice = id;
      row.append(view.rowHead(null, view.rowName(practice.short,
        `not scored, in neither figure, ${creditOf(board.data, practice)}`,
        content => aboutUnscoredPractice(content, practice), `${id} ${practice.short}: what it asks`)));
      board.labs.forEach(lab => row.append(view.naCell({
        name: lab.name, rowLabel: practice.short.toLowerCase(),
        dataset: { lab: lab.id, row: id },
        build: content => unscoredScore(content, lab, practice),
      })));
      body.append(row);
    });
  });

  const table = view.nodes.table;
  table.tHead.replaceChildren(headRow());
  table.tBodies[0].replaceChildren(body);
}

function renderLegend() {
  const legend = document.createDocumentFragment();
  legend.append(element("span", "", "Colour goes from nothing scored to the most a row can score:"),
    element("span", "", "none"));
  legend.append(view.swatches([0, 1, 2, 3, 4], SCALE), element("span", "", "all"));
  const na = element("span", "legend-na");
  na.append(view.naChip(), document.createTextNode(" not assessed, needs an internal audit"));
  legend.append(na);
  board.nodes.legend.replaceChildren(legend);
}

/* One sentence per column under the table, and the sentence that says why the
 * two are never added. */
function renderColumns() {
  const lines = document.createDocumentFragment();
  board.data.columns.forEach(column => {
    const line = element("p", "gov-foot");
    line.append(element("strong", "", `${column.name}, out of ${column.out_of}. `),
      document.createTextNode(column.plain));
    lines.append(line);
  });
  const why = element("p", "gov-foot");
  why.append(element("strong", "", "The two are not added. "),
    document.createTextNode(board.data.not_added));
  lines.append(why);
  board.nodes.columns.replaceChildren(lines);
}

/* The ties the ranking has to leave standing, said under the table. */
function renderTies() {
  const lines = [];
  board.labs.forEach((lab, index) => {
    const next = board.labs[index + 1];
    if (!next || !level(next.ranking, lab.ranking)) return;
    lines.push(`${lab.name} and ${next.name} tie on ${shown(lab.ranking)}, and the second figure `
      + `does not break a tie, so they share ${ORDINALS[lab.rank - 1]} place.`);
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
    blocks.append(element("h3", "",
      `${question.id}. ${question.name}: ${question.question}`));
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
      name.append(element("span", "check-id", `${check.id} `), element("span", "", check.label));
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
    return element("li", "", `${id} ${practice.label} ${practice.source}.`);
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
  board.nodes.origin.textContent = data.origin;
  renderTable();
  renderLegend();
  renderColumns();
  renderTies();
  renderFindings();
  renderScoring();
  view.wirePopover();
  view.nodes.expandAll.addEventListener("click", () => view.expandEvery());
  board.nodes.status.textContent = "";
}
