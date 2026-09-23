/* The overview's second view: how each lab governs the rules its models follow.
 *
 * A board rather than a document: one table that takes the whole width, the
 * companies across in rank order, and down the side the total, the four
 * questions and, outside the total, the best practices (called supporting
 * practices in the data). Each question opens into its checks. The best
 * practices open into the five anyone can check, the four only the company can
 * show, scored on what it publishes, and the one only an internal audit could
 * show, NA for every company. Anything more, what a row asks, how it is scored,
 * or why a company scored what it did, opens in a popover beside what was
 * pressed, so the table never gives up its width to it.
 *
 * The table, the popover, the folds and the colours are board.js, which the
 * coverage view draws from as well: this file brings the data, the rows and the
 * words of its own popovers, and nothing else.
 *
 * Everything comes from governance.json: the scores, what each score means, and
 * the text of the research note, lab by lab and question by question. A
 * question is the average of its checks, on their own scale of 0 to 4, and the
 * overall score is the sum of the four questions, out of 16, so every question
 * weighs the same whatever its number of checks and the overall score reads as
 * a different kind of figure. They are computed here rather than stored, so the
 * ranking cannot disagree with the checks it is made of, and a profile's opening
 * line, "Published constitution, 2.7 out of 4", is written from the same
 * averages rather than typed beside them.
 *
 * Nothing is built with innerHTML, as in overview.js. The text here is ours
 * rather than a model's, but one rule for the whole page is easier to keep.
 */

import { createBoard, element, level, rankBy, ORDINALS } from "./board.js";

/* Per question, the average of its checks; then the overall score, the sum of
 * the four questions; and the best practices, reported beside the overall
 * score and never in it. */
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

/* The practices that only a company can show: four the paper asks it to
 * publish, scored on what it publishes, and one it does not, left NA. */
const disclosedOf = data => data.internal.filter(practice => practice.asked_to_publish);
const auditOnlyOf = data => data.internal.filter(practice => !practice.asked_to_publish);

export function totalsFor(data, labId) {
  const scores = data.scores[labId];
  const byQuestion = {};
  data.questions.forEach(question => {
    byQuestion[question.id] = average(question.checks.map(check => scores[check.id]));
  });
  const total = Object.values(byQuestion).reduce((sum, value) => sum + value, 0);
  const supporting = [
    ...data.supporting.map(practice => data.supporting_scores[labId][practice.id]),
    ...disclosedOf(data).map(practice => data.internal_scores[labId][practice.id]),
  ].reduce((sum, value) => sum + value, 0);
  return { byQuestion, total, supporting };
}

/* By overall score, and a tie broken on the best practices. That is the research
 * note's own rule. On averages it breaks two ties: OpenAI and Anthropic, and
 * Meta and xAI. */
const ahead = (a, b) => (level(a.total, b.total) ? a.supporting > b.supporting : a.total > b.total);

/* Labs level on both the overall score and the best practices share a place:
 * a rank is one more than the number of labs ahead. */
export function ranked(data) {
  const labs = data.labs
    .map(lab => ({ ...lab, ...totalsFor(data, lab.id) }))
    .sort((a, b) => (level(a.total, b.total) ? b.supporting - a.supporting : b.total - a.total));
  return rankBy(labs, ahead);
}

const SCALE = 4;
const OVERALL = 16;
const PRACTICE = 2;
/* A question or an overall score, to one decimal. A check stays a whole number. */
const shown = value => value.toFixed(1);

const board = { data: null, labs: [], nodes: {}, bestMax: 0 };
/* The board this view draws on, built in initializeGovernance. */
let view = null;

const questionOf = id => board.data.questions.find(q => q.id === id);

/* What opens in the table: each question into its checks, and the supporting
 * practices into theirs, the internal ones included. */
const GROUPS = { supporting: "Best practices" };
const groupName = id => GROUPS[id] || questionOf(id).name;
const partsOf = id => (GROUPS[id] ? "practices" : "checks");
/* "the practices" for a group with a name of its own, "its checks" for a
 * question, which is how the button to open one reads in a sentence. */
const partsPhrase = id => `${GROUPS[id] ? "the" : "its"} ${partsOf(id)}`;
const rowId = id => `gov-check-${id.replace(".", "-")}`;

/* ---- What each popover is made of ------------------------------------------ */

/* What 0, 2 and 4 mean for one check. Where a score sits on them is marked: on
 * its own description when it is even, on the two either side when it is odd. */
function anchorsList(check, score) {
  const list = element("ol", "anchors");
  [0, 2, 4].forEach(level => {
    const item = element("li");
    if (score !== null && Math.abs(score - level) <= 1) item.classList.add("is-here");
    item.append(element("span", "anchor-level", String(level)),
      element("span", "", check.anchors[String(level)]));
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
    item.append(view.chip(board.data.scores[lab.id][check.id], 4),
      element("span", "check-id", check.id), element("span", "", check.label));
    list.append(item);
  });
  return list;
}

function practicesOf(lab) {
  const list = element("ul", "check-list");
  board.data.supporting.forEach(practice => {
    const item = element("li");
    item.append(view.chip(board.data.supporting_scores[lab.id][practice.id], PRACTICE),
      element("span", "check-id", practice.id), element("span", "", practice.label));
    list.append(item);
  });
  return list;
}

/* The four practices scored on what a company publishes, each with the sentence
 * that says what it publishes. */
function disclosedList(lab) {
  const list = element("ul", "check-list");
  disclosedOf(board.data).forEach(practice => {
    const item = element("li");
    item.append(view.chip(board.data.internal_scores[lab.id][practice.id], PRACTICE),
      element("span", "check-id", practice.id),
      element("span", "", board.data.internal_evidence[lab.id][practice.id].sentence));
    list.append(item);
  });
  return list;
}

function internalList(marked) {
  const list = element("ul", "check-list");
  auditOnlyOf(board.data).forEach(practice => {
    const item = element("li");
    if (marked) item.append(view.naChip());
    item.append(element("span", "check-id", practice.id), element("span", "", practice.label));
    list.append(item);
  });
  return list;
}

/* What 0, 1 and 2 mean for a supporting practice, with the score's place
 * marked. The research note never wrote these down, and the list says so. */
function scaleList(score, anchors = board.data.supporting_scale) {
  const list = element("ol", "anchors");
  [0, 1, 2].forEach(level => {
    const item = element("li");
    if (score === level) item.classList.add("is-here");
    item.append(element("span", "anchor-level", String(level)),
      element("span", "", anchors[String(level)]));
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
  content.append(view.figure(shown(lab.total), ` out of ${OVERALL}`));
  board.data.questions.forEach(question => {
    const fold = element("details");
    fold.open = open === question.id;
    const summary = element("summary");
    summary.append(view.chip(lab.byQuestion[question.id], SCALE, shown(lab.byQuestion[question.id])),
      element("span", "", `${question.name}, ${shown(lab.byQuestion[question.id])} out of ${SCALE}`));
    fold.append(summary, checksOf(lab, question), paragraphs(text[question.id]));
    content.append(fold);
  });
  const supporting = element("details");
  supporting.open = open === "supporting";
  const summary = element("summary");
  summary.append(view.chip(lab.supporting, board.bestMax),
    element("span", "", `Best practices, ${lab.supporting} out of ${board.bestMax}, not counted`));
  supporting.append(summary, practicesOf(lab), paragraphs(text.supporting),
    view.h3("What only the company can show"), disclosedList(lab),
    element("p", "subtitle", `*${board.data.disclosure_note}`),
    view.h3("Only an internal audit could score this"), internalList(true),
    element("p", "", board.data.internal_note));
  content.append(supporting);
  if (text.aside) {
    const aside = element("div", "aside");
    const line = element("p");
    line.append(element("strong", "", `${text.aside.title}. `), document.createTextNode(text.aside.text));
    aside.append(line);
    content.append(aside);
  }
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

function supportingScore(content, lab) {
  view.titled(content, `${lab.name}: best practices`, "Shown beside the score and left out of it.");
  content.append(view.figure(lab.supporting, ` out of ${board.bestMax}`), practicesOf(lab),
    view.h3("What we found"), paragraphs(board.data.profiles[lab.id].supporting),
    view.h3("What only the company can show"), disclosedList(lab),
    element("p", "subtitle", `*${board.data.disclosure_note}`),
    view.h3("Only an internal audit could score this"), internalList(true),
    toProfile(lab, "supporting"));
}

function practiceScore(content, lab, practice) {
  const value = board.data.supporting_scores[lab.id][practice.id];
  view.titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, `${practice.id} ${practice.label}`);
  content.append(view.figure(value, ` out of ${PRACTICE}`),
    element("p", "", meansAt(board.data.supporting_scale, value)));
  const note = board.data.supporting_notes[lab.id]?.[practice.id];
  if (note) content.append(element("p", "", note));
  content.append(view.h3("What each score means"), scaleList(value));
  content.append(view.h3(`What we found on ${lab.name}'s best practices`),
    paragraphs(board.data.profiles[lab.id].supporting), toProfile(lab, "supporting"));
}

function disclosedScore(content, lab, practice) {
  const value = board.data.internal_scores[lab.id][practice.id];
  const found = board.data.internal_evidence[lab.id][practice.id];
  view.titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, `${practice.id} ${practice.label}`);
  content.append(view.figure(value, ` out of ${PRACTICE}`),
    element("p", "", meansAt(practice.anchors, value)), element("p", "", found.sentence));
  if (value === 0) content.append(element("p", "subtitle", `*${board.data.disclosure_note}`));
  if (found.sources.length) {
    content.append(view.h3(`What ${lab.name} publishes`));
    found.sources.forEach(source => content.append(sourceQuote(source)));
  }
  content.append(view.h3("What each score means"),
    scaleList(value, practice.anchors), toProfile(lab, "supporting"), paperFold(practice));
}

function aboutDisclosedPractice(content, practice) {
  view.titled(content, practice.short, `${practice.id} ${practice.label}`);
  content.append(
    element("p", "subtitle", "One of the best practices only the company can show, scored on what it publishes."),
    view.h3("What each score means"), scaleList(null, practice.anchors),
    element("p", "subtitle", `*${board.data.disclosure_note}`), paperFold(practice));
}

function internalScore(content, lab, practice) {
  view.titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, `${practice.id} ${practice.label}`);
  content.append(view.figure("NA", ", not assessed"),
    element("p", "", `Whether ${lab.name} does this cannot be confirmed from what it `
      + "publishes. It would take an internal audit."),
    view.h3("What an audit would look at"), element("p", "", practice.audit),
    toProfile(lab, "supporting"));
}

function aboutTotal(content) {
  view.titled(content, `Overall, out of ${OVERALL}`, "The sum of the four questions.");
  content.append(element("p", "", "Each question is scored from 0 to 4, as the average of "
    + "its checks, and the overall score is the sum of the four. Every question weighs "
    + "the same, whatever its number of checks."));
  const list = element("ul", "check-list");
  board.data.questions.forEach(question => {
    const item = element("li");
    item.append(element("span", "check-id", question.id),
      element("span", "", `${question.name}: ${question.plain}`));
    list.append(item);
  });
  content.append(list, element("p", "", "Companies are ranked by this score. A tie is "
    + "broken on the best practices, and companies level on both share a place."));
}

function aboutQuestion(content, question) {
  view.titled(content, question.name, question.plain);
  content.append(element("p", "", question.explainer));
  if (question.minimum) {
    content.append(view.h3("Part of the minimum"), element("p", "", board.data.minimum_note));
  }
  content.append(view.h3("How it is scored"));
  content.append(element("p", "", `${question.checks.length} checks, each scored from 0 to 4. `
    + "The question's score is their average. Open a check to see what earns each score."));
  question.checks.forEach(check => {
    const fold = element("details");
    const summary = element("summary");
    summary.append(element("span", "check-id", check.id), element("span", "", check.label));
    fold.append(summary, anchorsList(check, null));
    content.append(fold);
  });
  content.append(view.showInTable(question.id, partsPhrase(question.id)));
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

function aboutSupporting(content) {
  view.titled(content, `Best practices, out of ${board.bestMax}`, "Shown beside the score and left out of it.");
  content.append(element("p", "", "Ten practices a company can be judged on beside the four "
    + "questions. Five can be checked by anyone from public sources. Four more only the company "
    + "can show, and are scored on what it publishes. One only an internal audit could show, and "
    + "is not scored. Each scored practice is worth 0, 1 or 2, and they are kept out of the "
    + "total."));
  const list = element("ul", "check-list");
  board.data.supporting.forEach(practice => {
    const item = element("li");
    item.append(element("span", "check-id", practice.id), element("span", "", practice.label));
    list.append(item);
  });
  content.append(list, view.h3("What the scores mean"), scaleList(null),
    view.h3("What only the company can show"),
    element("p", "", board.data.disclosed_intro), disclosedAbout(),
    view.h3("Only an internal audit could score this"),
    element("p", "", board.data.internal_note), internalList(false),
    view.showInTable("supporting", partsPhrase("supporting")));
}

function disclosedAbout() {
  const list = element("ul", "check-list");
  disclosedOf(board.data).forEach(practice => {
    const item = element("li");
    item.append(element("span", "check-id", practice.id), element("span", "", practice.label));
    list.append(item);
  });
  return list;
}

function aboutDisclosed(content) {
  view.titled(content, "What only the company can show", "Four of the best practices, scored on what the company publishes.");
  content.append(element("p", "", board.data.disclosed_intro), disclosedAbout(),
    element("p", "subtitle", `*${board.data.disclosure_note}`));
}

function aboutPractice(content, practice) {
  view.titled(content, practice.short, `${practice.id} ${practice.label}`);
  content.append(
    element("p", "subtitle", "One of the best practices, scored 0, 1 or 2 and left out of the total."),
    view.h3("What each score means"), scaleList(null), paperFold(practice));
}

function aboutInternal(content) {
  view.titled(content, "Only an internal audit could score this", "One of the best practices, not scored.");
  content.append(element("p", "", board.data.internal_note), internalList(false));
}

function aboutInternalPractice(content, practice) {
  view.titled(content, practice.short, `${practice.id} ${practice.label}`);
  content.append(
    element("p", "subtitle", "Not assessed for any company, because no internal audit has been done."),
    view.h3("What an audit would look at"), element("p", "", practice.audit),
    paperFold(practice));
}

/* ---- The table --------------------------------------------------------------- */

/* One cell of a lab's column: the board wants the lab's name for the accessible
 * label and its id for the address a walker selects on. */
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
    button.append(element("span", "rank", String(lab.rank)),
      element("span", "company-name", lab.name));
    if (lab.open_weights) button.append(element("span", "company-flag", "Open weights"));
    button.addEventListener("click", () =>
      view.openPopover(button, content => profile(content, lab, null)));
    cell.append(button);
    row.append(cell);
  });
  return row;
}

function renderTable() {
  const body = document.createDocumentFragment();

  const total = element("tr", "total-row");
  total.append(view.rowHead(null, view.rowName("Overall", `out of ${OVERALL}`, aboutTotal,
    `Overall, out of ${OVERALL}: how it is worked out`)));
  board.labs.forEach(lab => total.append(cellFor(lab, "overall", "total", {
    value: lab.total, max: OVERALL, text: shown(lab.total),
    build: content => profile(content, lab, null),
  })));
  body.append(total);

  board.data.questions.forEach(question => {
    const row = element("tr", "question-row");
    row.dataset.question = question.id;
    row.append(view.rowHead(
      view.rowToggle(question.id, question.checks.map(check => rowId(check.id)),
        { parts: partsOf(question.id), name: groupName(question.id) }),
      view.rowName(question.name, `out of ${SCALE}${question.minimum ? ", part of the minimum" : ""}`,
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
        value: board.data.scores[lab.id][check.id], max: 4,
        build: content => checkScore(content, lab, question, check),
      })));
      body.append(sub);
    });
  });

  // A line across the table before the best practices, so nobody reads them as
  // a fifth question: they come from another paper and add to nothing above.
  const outside = element("tr", "outside-row");
  const outsideHead = element("th", "", "Outside the total");
  outsideHead.scope = "row";
  const outsideNote = element("td", "divider-note",
    "Best practices from a second working paper, by Kembery et al.");
  outsideNote.colSpan = board.labs.length;
  outside.append(outsideHead, outsideNote);
  body.append(outside);

  const supporting = element("tr", "supporting-row");
  supporting.append(view.rowHead(
    view.rowToggle("supporting",
      [...board.data.supporting, { id: "disclosed" }, ...disclosedOf(board.data),
        { id: "internal" }, ...auditOnlyOf(board.data)].map(part => rowId(part.id)),
      { parts: partsOf("supporting"), name: groupName("supporting") }),
    view.rowName("Best practices", `out of ${board.bestMax}`, aboutSupporting,
      `Best practices, out of ${board.bestMax}, not counted: what they are`)));
  board.labs.forEach(lab => supporting.append(cellFor(lab, "best practices", "supporting", {
    value: lab.supporting, max: board.bestMax,
    build: content => supportingScore(content, lab),
  })));
  body.append(supporting);
  board.data.supporting.forEach(practice => {
    const sub = view.subRow(rowId(practice.id), "supporting",
      view.rowName(practice.short, practice.id,
        content => aboutPractice(content, practice),
        `${practice.id} ${practice.short}: what its scores mean`));
    board.labs.forEach(lab => sub.append(cellFor(lab, practice.short.toLowerCase(), practice.id, {
      value: board.data.supporting_scores[lab.id][practice.id], max: PRACTICE,
      build: content => practiceScore(content, lab, practice),
    })));
    body.append(sub);
  });

  // The same group goes on, under a line of their own, with the practices only
  // the company can show. The paper asks companies to publish them, so they are
  // scored on what each publishes, and a 0 carries the note that says so.
  const disclosedLine = view.subRow(rowId("disclosed"), "supporting",
    view.rowName("What only the company can show*", "scored on what it publishes",
      aboutDisclosed, "Practices only the company can show: how they are scored"));
  disclosedLine.classList.add("practice-divider");
  const scoredOn = element("td", "divider-note", `*${board.data.disclosure_note}`);
  scoredOn.colSpan = board.labs.length;
  disclosedLine.append(scoredOn);
  body.append(disclosedLine);
  disclosedOf(board.data).forEach(practice => {
    const sub = view.subRow(rowId(practice.id), "supporting",
      view.rowName(practice.short, practice.id,
        content => aboutDisclosedPractice(content, practice),
        `${practice.id} ${practice.short}: what its scores mean`));
    board.labs.forEach(lab => sub.append(cellFor(lab, practice.short.toLowerCase(), practice.id, {
      value: board.data.internal_scores[lab.id][practice.id], max: PRACTICE,
      build: content => disclosedScore(content, lab, practice),
    })));
    body.append(sub);
  });

  // Last, what the paper does not ask anyone to publish. No audit has been
  // done, so every cell is NA, and it counts towards nothing.
  const divider = view.subRow(rowId("internal"), "supporting",
    view.rowName("Only an internal audit could score this", "not scored",
      aboutInternal, "Practices only an internal audit could score: what they are"));
  divider.classList.add("practice-divider");
  const why = element("td", "divider-note", "No internal audit has been done, so every company is NA.");
  why.colSpan = board.labs.length;
  divider.append(why);
  body.append(divider);
  auditOnlyOf(board.data).forEach(practice => {
    const sub = view.subRow(rowId(practice.id), "supporting",
      view.rowName(practice.short, practice.id,
        content => aboutInternalPractice(content, practice),
        `${practice.id} ${practice.short}: what it asks`));
    board.labs.forEach(lab => sub.append(view.naCell({
      name: lab.name, rowLabel: practice.short.toLowerCase(),
      dataset: { lab: lab.id, row: practice.id },
      build: content => internalScore(content, lab, practice),
    })));
    body.append(sub);
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

/* The ties the ranking has to break, or cannot, said under the table. */
function renderTies() {
  const lines = [];
  board.labs.forEach((lab, index) => {
    const next = board.labs[index + 1];
    if (!next || !level(next.total, lab.total)) return;
    lines.push(lab.supporting === next.supporting
      ? `${lab.name} and ${next.name} tie on ${shown(lab.total)} and on the best practices, `
        + `${lab.supporting} each, so they share ${ORDINALS[lab.rank - 1]} place.`
      : `${lab.name} and ${next.name} tie on ${shown(lab.total)}, and ${lab.name} is `
        + `placed ahead on the best practices, ${lab.supporting} against ${next.supporting}.`);
  });
  board.nodes.ties.textContent = lines.join(" ");
}

function renderFindings() {
  const list = document.createDocumentFragment();
  board.data.findings.forEach(finding => {
    const fold = element("details");
    fold.append(element("summary", "", finding.title), element("p", "", finding.text));
    list.append(fold);
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
      ["0", "2", "4"].forEach(level => row.append(element("td", "", check.anchors[level])));
      tbody.append(row);
    });
    table.append(thead, tbody);
    wrap.append(table);
    blocks.append(wrap);
  });
  board.nodes.scoring.replaceChildren(blocks);

  const practice = item => element("li", "",
    `${item.id} ${item.label} Kembery et al., ${item.source.toLowerCase()}.`);
  const practices = document.createDocumentFragment();
  board.data.supporting.forEach(item => practices.append(practice(item)));
  board.nodes.supporting.replaceChildren(practices);
  const disclosed = document.createDocumentFragment();
  disclosedOf(board.data).forEach(item => disclosed.append(practice(item)));
  board.nodes.disclosed.replaceChildren(disclosed);
  const internal = document.createDocumentFragment();
  auditOnlyOf(board.data).forEach(item => internal.append(practice(item)));
  board.nodes.internal.replaceChildren(internal);
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
    everyRow: { show: "Show every check", hide: "Hide every check" },
  });
  board.nodes = {
    status: byId("gov-status"), legend: byId("gov-legend"), findings: byId("gov-findings"),
    scoring: byId("gov-scoring"), supporting: byId("gov-supporting"),
    disclosed: byId("gov-disclosed"), internal: byId("gov-internal"), ties: byId("gov-ties"),
    origin: byId("gov-origin"),
  };
  const data = await loadGovernance();
  if (!data) {
    board.nodes.status.textContent = "The governance scores could not be loaded.";
    return;
  }
  board.data = data;
  board.bestMax = PRACTICE * (data.supporting.length + disclosedOf(data).length);
  board.labs = ranked(data);
  // Where the questions and the practices come from, said once, above the board.
  board.nodes.origin.textContent = data.origin;
  renderTable();
  renderLegend();
  renderTies();
  renderFindings();
  renderScoring();
  view.wirePopover();
  view.nodes.expandAll.addEventListener("click", () => view.expandEvery());
  board.nodes.status.textContent = "";
}
