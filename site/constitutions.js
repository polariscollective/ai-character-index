/* The board the index leads with: what each company's constitution says, and
 * how well the document is built.
 *
 * It reads one written file, site/constitutions.json, the way the governance
 * board reads site/governance.json. Nothing here calls a route and nothing here
 * carries a publication: every figure and every sentence a reader can open comes
 * out of that file, and a board that says more than its file says would be a
 * board nobody could correct by editing the file.
 *
 * What is written here rather than in the file is the shape of the board: that
 * every figure is shown out of 10, that a criterion given out of 4 is shown as
 * its share of that scale, that a row above others is their weighted average
 * and says under its name how much it counts for, that the final score is the
 * average of the two halves the file weighs, that companies are ranked by it and
 * that level companies share a place. Those are properties of the table, not
 * claims about a document.
 *
 * The table, the folds, the popover and the colours are site/board.js, which the
 * governance board and the coverage board draw from too. The two scales are
 * explained once under the table and never again inside a popover: a reader
 * learns what a figure means in one place, and a popover is then short enough to
 * read where it opens.
 *
 * The file's sentences carry a light markup, which this file turns into real
 * elements: paragraphs, bold inside a sentence, bullets and a small heading. It
 * is there so that a popover can be scanned rather than read from the top.
 *
 * Nothing is built with innerHTML: every sentence the file carries lands as a
 * text node, and the markup is read by the parser below rather than handed to
 * the browser.
 */

import { pinned, INCOMPATIBLE, loadBoard } from "./publication-data.js";
import { FORMAT, renderPage, renderNotes } from "./page-content.js";
import { createBoard, element, mono, paragraph, ORDINALS, level, rankBy, place } from "./board.js";
/* The mark of each company, above its name. One module for both boards, and it
 * says where the drawings come from and which two companies have none. */
import { companyMark } from "./company-marks.js";

const byId = id => document.getElementById(id);

const state = { data: null, companies: [], categories: [] };

let board = null;

const nodes = {};

/* ---- The figures, and what each row is out of ------------------------------- */

/* Every figure the table shows is out of 10. A behaviour's depth already is; a
 * criterion is given out of 4 and shown as its share of that, with the score it
 * was given said in its popover. */
const TEN = 10;
const CRITERION_SCALE = 4;
const onTen = (value, max) => value / max * TEN;
/* A behaviour's depth is out of the top level of the file's own scale, which is
 * 10: read off the file so a scale that changes moves the board with it. */
const depthMax = () => state.data.scale.depth[state.data.scale.depth.length - 1].level;
const shownMax = () => TEN;
const wholeMax = () => TEN;
const finalMax = () => TEN;

/* What a row counts for, said under its name. A behaviour says what it counts
 * for in the behaviours rather than in its category, because every behaviour
 * counts the same there. */
/* The numbers of the notes under the board, which site/overview.html writes. */
const NOTE = { final: "1", whole: "2", behaviours: "3", categories: "4" };

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

const shown = value => value.toFixed(1);

/* A figure inside a sentence, on whatever scale it was given. The file carries
 * the judges' own means, which are thirds as often as not, and 3.3333333333 in
 * running prose is a number nobody asked to see. One decimal, and none at all
 * where the figure is whole. */
const onScale = value => String(Number(value.toFixed(1)));

/* A version whose day is 00 has no day recorded, so it is shown without one. */
const shownVersion = version => String(version || "").replace(/-00$/, "");

/* "Anthropic: which rule wins", keeping a leading acronym as it is. */
const lowerFirst = text =>
  (/^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));

const mean = values =>
  (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

const number = value => (Number.isFinite(value) ? value : null);

/* A criterion as the file gives it, out of 4, and as the board shows it. */
const criterionScore10 = (company, criterion) =>
  number(company.whole?.criteria?.[criterion.id]?.score);
const criterionPart = (company, criterion) =>
  (criterionScore10(company, criterion) === null
    ? null : onTen(criterionScore10(company, criterion), CRITERION_SCALE));

const wholeTotal = company => number(company.whole?.total);

/* The behaviours by category, in the order the file first names each one. */
function categoriesOf(data) {
  const byCategory = new Map();
  data.behaviours.forEach(behaviour => {
    const name = behaviour.category || "Behaviours";
    if (!byCategory.has(name)) byCategory.set(name, []);
    byCategory.get(name).push(behaviour);
  });
  return [...byCategory].map(([name, members], index) =>
    ({ id: `category-${index}`, name, members }));
}

/* What one of the two halves is made of, each part out of 10: the five
 * criteria of the document as a whole, or the categories of the behaviours.
 * The overview lists the same parts under the same cell. */
export function partsOf(data, company, figure) {
  if (figure === "whole") {
    return data.criteria
      .map(criterion => ({ name: criterion.name, row: criterion.id,
                           value: criterionPart(company, criterion) }))
      .filter(part => part.value !== null);
  }
  return categoriesOf(data)
    .map(category => ({ name: category.name, row: category.id,
                        value: categoryFigure(company, category.members) }))
    .filter(part => part.value !== null);
}

const behaviourEntry = (company, behaviour) => company.behaviours?.[behaviour.slug] || null;

const depthOf = (company, behaviour) =>
  number(behaviourEntry(company, behaviour)?.score);

const categoryFigure = (company, members) =>
  mean(members.map(member => depthOf(company, member)).filter(value => value !== null));

const behavioursFigure = company => categoryFigure(company, state.data.behaviours);

/* The final score: the document as a whole and the behaviours, averaged with the
 * weights the file gives them. Worked out here rather than read from the file,
 * so it cannot disagree with the two figures it is made of. The overview reads
 * the two halves from here too, so the front page and the board cannot differ. */
export function figuresOf(data, company) {
  const whole = number(company.whole?.total) ?? 0;
  const behaviours = mean(data.behaviours
    .map(behaviour => number(company.behaviours?.[behaviour.slug]?.score))
    .filter(value => value !== null)) ?? 0;
  return { whole, behaviours,
           final: whole * data.weights.whole + behaviours * data.weights.behaviours };
}
const finalOf = (data, company) => figuresOf(data, company).final;

/* Companies by the score the board leads with. A rank is one more than the
 * number of companies ahead, so companies level on the final score share a place
 * and the place after a shared one is skipped. The sort is stable, so level
 * companies keep the order the file gives them. */
function ranked(companies) {
  const order = [...companies].sort((a, b) => b.final - a.final);
  return rankBy(order.map(company => ({ company })),
    (a, b) => a.company.final > b.company.final && !level(a.company.final, b.company.final))
    .map(entry => Object.assign(entry.company, { rank: entry.rank }));
}

/* One column per company, which is its newest document. The file carries an
 * earlier version of a document as an entry of its own, scored on the same rows,
 * and two columns under one name would read as two companies. The newest is the
 * column; the earlier ones hang off it as `earlier` and are reached from its
 * profile, each carrying `current` so a reader can come back.
 *
 * Newest by the version string, which is a date, and a company with no document
 * is its own group. */
function currentPerCompany(companies) {
  const groups = new Map();
  companies.forEach(company => {
    const key = company.document ? company.name : company.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(company);
  });
  return [...groups.values()].map(group => {
    const [current, ...earlier] = [...group].sort((a, b) =>
      String(b.document?.version || "").localeCompare(String(a.document?.version || "")));
    earlier.forEach(entry => { entry.current = current; });
    return Object.assign(current, { earlier });
  });
}

/* "a", "a and b", "a, b and c". */
const listed = names => (names.length < 3
  ? names.join(" and ")
  : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/* Only a company the board shows has a rank, so an earlier version of a
 * document, which has a column nowhere, is given no place in a ranking it is
 * not part of. */
/* The place alone. A company's popover names no other company, so a shared
 * place is not spelt out here; the board shows it. */
function rankLine(company) {
  if (!company.rank) return "";
  return `Ranked ${company.rank} of ${state.companies.length}.`;
}

/* ---- Small builders --------------------------------------------------------- */

/* What the popover's subtitle says a figure is about: the document it was read
 * from, or that there is none to read. "Publishes no constitution" rather than
 * "has none": what the file records is what a company has published, and a
 * company may hold a constitution it has not published. */
const documentLine = company => (company.document
  ? `${company.document.title}, ${shownVersion(company.document.version)}.`
  : "No published constitution.");

function link(href, text) {
  const node = element("a", null, text);
  node.href = href;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  return node;
}

/* ---- The light markup the file's prose carries ------------------------------- */

/* The light markup the file's sentences carry, drawn as real elements: see
 * markup.js, which both boards share. Re-exported here because the walker and
 * the markup's own tests read it from this file. */
export { markupBlocks, markupPlain, renderMarkup } from "./markup.js";
import { renderMarkup } from "./markup.js";

/* A sentence the file may not carry: an empty string is left out rather than
 * printed as a blank paragraph. */
function sentences(content, ...blocks) {
  const written = blocks.filter(block => typeof block === "string" && block.trim());
  written.forEach(block => renderMarkup(content, block.trim()));
  return written.length;
}

/* A company that publishes no constitution carries a figure and no prose for it,
 * cell by cell: there is no document to say anything about. What the file does
 * carry is the company's own line, which says that it publishes none and that
 * one may exist inside the company unpublished, so that is what such a cell
 * says. Anything written here instead would be the board making the claim. */
function cellSentences(content, company, ...blocks) {
  if (!sentences(content, ...blocks)) sentences(content, company.profile);
}

/* A figure beside a name, pressable. With the cell it names (`cell`, the
 * cell's data attributes) it opens that cell, unfolding the rows above it and
 * moving the selection there; without one it refills the popover in place. */
function figureItem(value, max, name, label, open, cell) {
  const item = element("li");
  const button = element("button", "inline-button", name);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => (cell ? board.follow(cell, open) : board.refill(open)));
  item.append(board.chip(value, max, shown(value)), button);
  return item;
}

/* ---- What each popover says ------------------------------------------------- */

function aboutFinal(content) {
  const weights = state.data.weights;
  board.titled(content, `Final score, out of ${finalMax()}`,
    `The average of two halves, each out of ${TEN}: the document as a whole, counting for `
    + `${share(weights.whole)}, and the behaviours, counting for ${share(weights.behaviours)}.`);
  const table = element("table", "readings figures");
  const headRow = element("tr");
  ["Rank", "Company", "Final score"].forEach(name => {
    const cell = element("th", null, name);
    cell.scope = "col";
    headRow.append(cell);
  });
  const head = element("thead");
  head.append(headRow);
  const rows = element("tbody");
  state.companies.forEach(company => {
    const row = element("tr");
    const rank = element("td", "rank-cell");
    rank.dataset.label = "Rank";
    rank.append(mono(String(company.rank)));
    const name = element("td", "judge", company.name);
    name.dataset.label = "Company";
    const figure = element("td", "numeric");
    figure.dataset.label = "Final score";
    figure.append(mono(shown(company.final)));
    row.append(rank, name, figure);
    rows.append(row);
  });
  table.append(head, rows);
  content.append(table, paragraph("Companies are ranked by this score."));
}

function finalScore(content, company) {
  board.titled(content, `${company.name}: final score`, documentLine(company));
  content.append(board.figure(shown(company.final), ` out of ${finalMax()}`));
  content.append(paragraph(rankLine(company)));
  // A company with no document has one thing to say about both halves, its own
  // line, so it is said once here rather than under each.
  if (!company.document) sentences(content, company.profile);
  // The two halves, each with why it stands where it does: one press gives the
  // whole picture, and each half opens on its own parts.
  const halves = [
    { name: "The document as a whole", value: wholeTotal(company), max: wholeMax(),
      reading: company.readings?.whole, open: rest => wholeScore(rest, company), row: "whole" },
    { name: "The behaviours", value: behavioursFigure(company), max: depthMax(),
      reading: company.readings?.behaviours, open: rest => behavioursScore(rest, company),
      row: "behaviours" },
  ];
  halves.forEach(half => {
    if (half.value === null) return;
    const list = element("ul", "check-list");
    list.append(figureItem(half.value, half.max, half.name,
      `${half.name}, ${shown(half.value)} out of ${half.max}`, half.open,
      { lab: company.id, row: half.row }));
    content.append(list);
    if (company.document) cellSentences(content, company, half.reading);
  });
  content.append(board.popButton(`The whole profile of ${company.name}`,
    () => board.refill(rest => profile(rest, company))));
}

/* A company's own column, from its head: what the file says about it, then every
 * group folded with the rows it is made of. */
function profile(content, company) {
  board.titled(content, company.name,
    [documentLine(company), rankLine(company)].filter(Boolean).join(" "));
  content.append(board.figure(shown(company.final), ` out of ${finalMax()}`));
  sentences(content, company.profile);
  const whole = wholeTotal(company);
  if (whole !== null) {
    const fold = element("details");
    const summary = element("summary");
    summary.append(board.chip(whole, wholeMax(), shown(whole)),
      element("span", "", `The document as a whole, ${shown(whole)} out of ${wholeMax()}`));
    const list = element("ul", "check-list");
    state.data.criteria.forEach(criterion => {
      const part = criterionPart(company, criterion);
      if (part === null) return;
      list.append(figureItem(part, shownMax(), criterion.name,
        `${criterion.name}, ${shown(part)} out of ${shownMax()}`,
        rest => criterionScore(rest, company, criterion),
        company.current ? null : { lab: company.id, row: criterion.id }));
    });
    fold.append(summary, list);
    content.append(fold);
  }
  state.categories.forEach(({ name, members }) => {
    const value = categoryFigure(company, members);
    if (value === null) return;
    const fold = element("details");
    const summary = element("summary");
    summary.append(board.chip(value, depthMax(), shown(value)),
      element("span", "", `${name}, ${shown(value)} out of ${depthMax()}`));
    const list = element("ul", "check-list");
    members.forEach(behaviour => {
      const score = depthOf(company, behaviour);
      if (score === null) return;
      list.append(figureItem(score, depthMax(), behaviour.name,
        `${behaviour.name}, ${shown(score)} out of ${depthMax()}`,
        rest => behaviourCell(rest, company, behaviour),
        company.current ? null : { lab: company.id, row: behaviour.slug }));
    });
    fold.append(summary, list);
    content.append(fold);
  });
  if (company.document) {
    // The document in the Doc reader, where every passage behind these figures
    // can be read, and at its publisher.
    const reader = element("p");
    const toReader = element("a", null, `Read ${company.document.title} in the Doc reader`);
    toReader.href = `/doc-reader/?spec=${encodeURIComponent(company.document.id)}`;
    reader.append(toReader);
    content.append(reader);
  }
  if (company.document?.url) {
    const read = element("p");
    read.append(link(company.document.url, `Read ${company.document.title} at its publisher`));
    content.append(read);
  }
  /* A company keeps one column, its newest document, so an earlier version of
   * that document is reached from here and nowhere else. It is scored on the
   * same rows as the column above it, and it is deliberately not ranked: it is
   * not a tenth company. */
  (company.earlier || []).forEach(earlier => {
    content.append(board.popButton(
      `The version of ${shownVersion(earlier.document.version)}`,
      () => board.refill(rest => profile(rest, earlier))));
  });
  if (company.current) {
    content.append(board.popButton(
      `Back to ${company.current.name}, ${shownVersion(company.current.document.version)}`,
      () => board.refill(rest => profile(rest, company.current))));
  }
}

function aboutWhole(content) {
  board.titled(content, "The document as a whole",
    `${state.data.criteria.length} criteria, each given out of ${CRITERION_SCALE} and shown out of `
    + `${TEN}. The figure is their average, each counting for `
    + `${frac(1, state.data.criteria.length)}.`);
  state.data.criteria.forEach(criterion => {
    const fold = element("details");
    const summary = element("summary");
    summary.append(element("span", "", criterion.name));
    fold.append(summary);
    renderMarkup(fold, criterion.what_it_is);
    renderMarkup(fold, criterion.why_it_matters);
    content.append(fold);
  });
  content.append(board.showInTable("whole", "the criteria"));
}

function wholeScore(content, company) {
  const total = wholeTotal(company);
  board.titled(content, `${company.name}: the document as a whole`, documentLine(company));
  content.append(board.figure(shown(total), ` out of ${wholeMax()}`));
  // Why the document stands where it does, in the file's words; the overview
  // shows the same reading for this cell.
  cellSentences(content, company, company.readings?.whole);
  content.append(board.h3("What it is made of"));
  const list = element("ul", "check-list");
  state.data.criteria.forEach(criterion => {
    const part = criterionPart(company, criterion);
    if (part === null) return;
    list.append(figureItem(part, shownMax(), criterion.name,
      `${criterion.name}, ${shown(part)} out of ${shownMax()}`,
      rest => criterionScore(rest, company, criterion), { lab: company.id, row: criterion.id }));
  });
  content.append(list);
  content.append(board.popButton(`The whole profile of ${company.name}`,
    () => board.refill(rest => profile(rest, company))));
}

function aboutCriterion(content, criterion) {
  board.titled(content, criterion.name,
    `One of the ${state.data.criteria.length} criteria on the document as a whole, given out of `
    + `${CRITERION_SCALE} and shown out of ${TEN}.`);
  sentences(content, criterion.what_it_is, criterion.why_it_matters);
}

/* What the criterion asks, in the tone the subtitles carry, then what this
 * document does and why the figure is what it is. The criterion's own sentence
 * is muted because it is a claim about the criterion; the two under the figure
 * are claims about the document. */
function criterionScore(content, company, criterion) {
  const part = criterionPart(company, criterion);
  const entry = company.whole?.criteria?.[criterion.id] || {};
  board.titled(content, `${company.name}: ${lowerFirst(criterion.name)}`, documentLine(company));
  content.append(board.figure(shown(part), ` out of ${shownMax()}`),
    element("p", "subtitle", `Scored ${onScale(criterionScore10(company, criterion))} on its own `
      + `scale of 0 to ${CRITERION_SCALE}.`));
  renderMarkup(content, criterion.what_it_is, "subtitle");
  cellSentences(content, company, entry.what_the_document_does, entry.why);
}

function aboutBehaviours(content) {
  const every = state.data.behaviours.length;
  board.titled(content, "The behaviours",
    `The mean of all ${every} behaviours, each out of ${depthMax()} and each counting for `
    + `${frac(1, every)}. It counts for ${share(state.data.weights.behaviours)} of the `
    + "final score.");
  const list = element("ul", "check-list");
  state.categories.forEach(({ name, members }) => list.append(element("li", "",
    `${name}: ${members.length} ${members.length === 1 ? "behaviour" : "behaviours"}, `
    + `${frac(members.length, every)} of the behaviours`)));
  content.append(list);
}

function behavioursScore(content, company) {
  const value = behavioursFigure(company);
  const every = state.data.behaviours.length;
  board.titled(content, `${company.name}: the behaviours`, documentLine(company));
  content.append(board.figure(shown(value), ` out of ${depthMax()}`));
  cellSentences(content, company, company.readings?.behaviours);
  content.append(board.h3("What it is made of"));
  const list = element("ul", "check-list");
  state.categories.forEach(category => {
    const figure = categoryFigure(company, category.members);
    if (figure === null) return;
    list.append(figureItem(figure, depthMax(),
      `${category.name}, ${frac(category.members.length, every)}`,
      `${category.name}, ${shown(figure)} out of ${depthMax()}`,
      rest => categoryScore(rest, company, category), { lab: company.id, row: category.id }));
  });
  content.append(list);
}

function aboutCategory(content, category) {
  const { name, members } = category;
  board.titled(content, name, `${members.length} `
    + `${members.length === 1 ? "behaviour" : "behaviours"}, each out of ${depthMax()}. `
    + "The group's figure is their mean.");
  const list = element("ul", "check-list");
  members.forEach(behaviour => list.append(element("li", "", behaviour.name)));
  content.append(list, board.showInTable(category.id, "its behaviours"));
}

function categoryScore(content, company, category) {
  const { name, members } = category;
  const value = categoryFigure(company, members);
  board.titled(content, `${company.name}: ${lowerFirst(name)}`, documentLine(company));
  content.append(board.figure(shown(value), ` out of ${depthMax()}`));
  const list = element("ul", "check-list");
  members.forEach(behaviour => {
    const score = depthOf(company, behaviour);
    if (score === null) return;
    list.append(figureItem(score, depthMax(), behaviour.name,
      `${behaviour.name}, ${shown(score)} out of ${depthMax()}`,
      rest => behaviourCell(rest, company, behaviour), { lab: company.id, row: behaviour.slug }));
  });
  content.append(list);
}

function aboutBehaviour(content, behaviour) {
  board.titled(content, behaviour.name, behaviour.category);
  content.append(board.h3("What it covers"));
  renderMarkup(content, behaviour.is);
  content.append(board.h3("What it does not"));
  renderMarkup(content, behaviour.is_not);
}

/* The headings a behaviour's cell carries, which are the page's words and not
 * the file's: the file writes the four texts and the page says which question
 * each of them answers. */
const ASKS_HEADING = "What the constitution asks";
const BESIDE_HEADING = "How it stands beside the other constitutions";
const SAME_HEADING = "What they ask alike";
const DIFFERS_HEADING = "Where they differ";

/* One cell, in two halves a reader can tell apart. First what this constitution
 * asks on this behaviour, under a heading of its own, and why the figure is what
 * it is. Then, folded and shut under it, how that stands beside the other three,
 * with what they ask alike and where they part under small headings of their
 * own. The two questions ran together as one passage before, and a reader
 * looking for one of them had to read both.
 *
 * The fold opens shut because the document in front of the reader is what the
 * cell is about; the comparison is what they open next if they want it. */
function behaviourCell(content, company, behaviour) {
  const entry = behaviourEntry(company, behaviour) || {};
  board.titled(content, `${company.name}: ${lowerFirst(behaviour.name)}`, documentLine(company));
  content.append(board.figure(shown(entry.score), ` out of ${depthMax()}`));
  /* A company that publishes no constitution carries a figure and no prose, and
   * has nothing to compare: its cell keeps the company's own line and no fold. */
  if (!(typeof entry.says === "string" && entry.says.trim())) {
    cellSentences(content, company);
    return;
  }
  content.append(board.h3(ASKS_HEADING));
  sentences(content, entry.says, entry.why);
  // The passages this reading rests on: the document in the Doc reader with this
  // behaviour ticked, which opens where the document defines it.
  if (company.document?.id) {
    const line = element("p");
    const toReader = element("a", null, `Read the passages on ${lowerFirst(behaviour.name)} `
      + "in the Doc reader");
    toReader.href = `/doc-reader/?${new URLSearchParams({
      spec: company.document.id, behavior: behaviour.slug })}`;
    line.append(toReader);
    content.append(line);
  }
  if (!(entry.same || entry.differs)) return;
  const fold = element("details");
  const summary = element("summary");
  summary.append(element("span", "", BESIDE_HEADING));
  fold.append(summary);
  if (entry.same) {
    fold.append(board.h3(SAME_HEADING));
    sentences(fold, entry.same);
  }
  if (entry.differs) {
    fold.append(board.h3(DIFFERS_HEADING));
    sentences(fold, entry.differs);
  }
  content.append(fold);
}

/* ---- The table -------------------------------------------------------------- */

const rowId = (groupId, index) => `board-row-${groupId}-${index}`;

const cellFor = (company, rowLabel, row, rest) => board.scoreCell({
  name: company.name, rowLabel, dataset: { lab: company.id, row }, showMax: false, ...rest,
});

function headRow() {
  const row = element("tr");
  const corner = element("th", "row-col");
  corner.scope = "col";
  // The same corner as the governance board's, so the two read alike.
  corner.append(element("span", "head-name", "Score (out of 10)"),
    element("span", "head-sub", "companies by rank"));
  row.append(corner);
  state.companies.forEach(company => {
    const cell = element("th");
    cell.scope = "col";
    const button = element("button", "company-button");
    button.type = "button";
    button.dataset.lab = company.id;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", `${company.name}, ranked ${company.rank}`
      + `${company.note ? `, ${lowerFirst(company.note)}` : ""}: its profile`);
    button.append(element("span", "rank", place(company.rank)));
    // Drawn, quiet and decorative: the name under it is what is read out, and a
    // company the set has no mark for keeps the space so every name starts on
    // one line.
    button.append(companyMark(company.mark));
    button.append(element("span", "company-name", company.name));
    button.append(company.document
      ? element("span", "company-flag mono", shownVersion(company.document.version))
      : element("span", "company-flag", "No published constitution"));
    // A second line under the version, for a document that does not stand in its
    // company where a reader of this board would assume it does. It is a few
    // words, and the head it sits in opens the company's profile, which carries
    // the same fact at its head in full.
    if (company.note) button.append(element("span", "company-flag", company.note));
    button.addEventListener("click", () =>
      board.openPopover(button, content => profile(content, company)));
    cell.append(button);
    row.append(cell);
  });
  return row;
}

function renderTable() {
  const body = document.createDocumentFragment();
  const companies = state.companies;

  const weights = state.data.weights;
  const everyBehaviour = state.data.behaviours.length;

  /* The final score, one row above every group, as the governance board's total. */
  const total = element("tr", "total-row outside-row");
  total.dataset.level = "0";
  total.append(board.rowHead(null, board.rowName("Final score", null, aboutFinal,
    `Final score, out of ${finalMax()}: how it is worked out`, [NOTE.final])));
  companies.forEach(company => {
    total.append(cellFor(company, "final score", "final", {
      value: company.final, max: TEN, text: shown(company.final),
      build: content => finalScore(content, company),
    }));
  });
  body.append(total);

  /* The document as a whole: the average of its criteria on the group row, the
   * criteria folded under it. */
  // The two halves of the final score wear the same style: two figures of one
  // rank, each opening into what it averages.
  const wholeRow = element("tr", "total-row outside-row half-row");
  wholeRow.dataset.level = "1";
  wholeRow.append(board.rowHead(
    board.rowToggle("whole", state.data.criteria.map((criterion, index) => rowId("whole", index)),
      { parts: "criteria", name: "The document as a whole" }),
    board.rowName("The document as a whole", weightLine(share(weights.whole), "the final score"),
      aboutWhole, "The document as a whole: what it measures", [NOTE.whole])));
  companies.forEach(company => {
    const whole = wholeTotal(company);
    wholeRow.append(cellFor(company, "the document as a whole", "whole", {
      value: whole, max: TEN, text: shown(whole),
      build: content => wholeScore(content, company),
    }));
  });
  body.append(wholeRow);

  state.data.criteria.forEach((criterion, index) => {
    const sub = board.subRow(rowId("whole", index), "whole",
      board.rowName(criterion.name,
        weightLine(frac(1, state.data.criteria.length), "the document"),
        content => aboutCriterion(content, criterion), `${criterion.name}: what it asks`));
    sub.dataset.level = "2";
    companies.forEach(company => {
      const part = criterionPart(company, criterion);
      sub.append(cellFor(company, lowerFirst(criterion.name), criterion.id, {
        value: part, max: TEN, text: shown(part),
        build: content => criterionScore(content, company, criterion),
      }));
    });
    body.append(sub);
  });

  /* The behaviours: every behaviour's depth averaged, which is the other half of
   * the final score, then each category with its behaviours folded under it. A
   * category counts for its share of every behaviour on the board, which is what
   * the mean of every behaviour amounts to. */
  const behavioursRow = element("tr", "total-row outside-row half-row");
  behavioursRow.dataset.level = "1";
  behavioursRow.append(board.rowHead(
    board.rowToggle("behaviours", state.categories.map(category => `board-row-${category.id}`),
      { parts: "categories", name: "The behaviours" }),
    board.rowName("The behaviours",
    weightLine(share(weights.behaviours), "the final score"), aboutBehaviours,
    "The behaviours: how they are averaged", [NOTE.behaviours])));
  companies.forEach(company => {
    const value = behavioursFigure(company);
    behavioursRow.append(cellFor(company, "the behaviours", "behaviours", {
      value, max: TEN, text: shown(value),
      build: content => behavioursScore(content, company),
    }));
  });
  body.append(behavioursRow);

  state.categories.forEach(category => {
    const { id, name, members } = category;
    const row = element("tr", "question-row");
    row.id = `board-row-${id}`;
    row.dataset.question = id;
    row.dataset.parent = "behaviours";
    row.dataset.level = "2";
    row.append(board.rowHead(
      board.rowToggle(id, members.map((member, index) => rowId(id, index)),
        { parts: "behaviours", name }),
      board.rowName(name, weightLine(frac(members.length, everyBehaviour), "the behaviours"),
        content => aboutCategory(content, category), `${name}: what it measures`,
        [NOTE.categories])));
    companies.forEach(company => {
      const value = categoryFigure(company, members);
      row.append(cellFor(company, lowerFirst(name), id, {
        value, max: TEN, text: shown(value),
        build: content => categoryScore(content, company, category),
      }));
    });
    body.append(row);

    members.forEach((behaviour, index) => {
      const sub = board.subRow(rowId(id, index), id,
        board.rowName(behaviour.name, weightLine(frac(1, everyBehaviour), "the behaviours"),
          content => aboutBehaviour(content, behaviour),
          `${behaviour.name}: what it covers`));
      sub.dataset.level = "3";
      companies.forEach(company => {
        const score = depthOf(company, behaviour);
        sub.append(cellFor(company, lowerFirst(behaviour.name), behaviour.slug, {
          value: score, max: TEN, text: shown(score),
          build: content => behaviourCell(content, company, behaviour),
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
  legend.append(element("span", "", "Colour goes from nothing scored to the most a row can score:"),
    element("span", "", "none (0)"), board.swatches([0, 2.5, 5, 7.5, 10], TEN),
    element("span", "", "all (10)"));
  nodes.legend.replaceChildren(legend);
}

/* The scale a behaviour is read on, under the table and nowhere else. A
 * document's parts are read out of 2, which each row says beside its name. */
function renderScales() {
  const behaviours = document.createDocumentFragment();
  state.data.scale.depth.forEach(({ level: at, name, plain }) => {
    const item = element("li");
    const text = element("span");
    text.append(element("span", "anchor-name", name), document.createTextNode(`: ${plain}`));
    // The colour a cell at this depth takes on the board, so the scale doubles
    // as the key to it.
    const swatch = element("span", "scale-swatch");
    swatch.setAttribute("aria-hidden", "true");
    board.paint(swatch, at, depthMax());
    const level = element("span", "anchor-level");
    level.append(swatch, document.createTextNode(String(at)));
    item.append(level, text);
    behaviours.append(item);
  });
  nodes.behaviourScaleTitle.textContent =
    `How far a constitution goes on one behaviour, out of ${depthMax()}`;
  nodes.behaviourScale.replaceChildren(behaviours);
}

/* The ties the ranking cannot break, said under the table. There is one figure
 * here and no second to separate two companies level on it. */
function renderTies() {
  const places = new Map();
  state.companies.forEach(company => {
    if (!places.has(company.rank)) places.set(company.rank, []);
    places.get(company.rank).push(company);
  });
  nodes.ties.textContent = [...places.values()].filter(group => group.length > 1)
    .map(group => `${listed(group.map(company => company.name))} tie on `
      + `${shown(group[0].final)}, so they share ${ORDINALS[group[0].rank - 1]} place.`)
    .join(" ");
}

/* The coverage board, built from the index's own publication, stays reachable at
 * /coverage and is linked from nowhere: it carries the readings behind each
 * figure, which are working material rather than what the index publishes. */

/* The takeaways under the board, read straight down, each a title and a
 * paragraph from the file. The section stays hidden while the file has none. */
function renderTakeaways(takeaways) {
  const node = byId("cov-findings");
  if (!node) return;
  node.closest("section").hidden = takeaways.length === 0;
  node.replaceChildren(...takeaways.map(({ title, text }) => {
    const block = element("div", "finding");
    block.append(element("h3", "", title), element("p", "", text));
    return block;
  }));
}

/* When the publication the file names was put online, to the minute, in place of
 * the file's month. The month stays if the route does not answer, so the line
 * is never empty and never a guess. */
const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "UTC", timeZoneName: "short",
});

async function showPublishedAt(publication) {
  try {
    const response = await fetch(publication
      ? `/api/reader/publication?publication=${encodeURIComponent(publication)}`
      : "/api/reader/publication");
    if (!response.ok) return;
    const { id, published_at: at } = await response.json();
    if ((publication && id !== publication) || !at) return;
    nodes.asOf.textContent = `As of ${WHEN.format(new Date(at)).replace(",", " at")}`;
  } catch {
    // The file's month is already on the page.
  }
}

/* ---- Loading ---------------------------------------------------------------- */

/* Open one cell of this board as a press on it would, unfolding the rows above
 * it. The Index opens a cell the address names this way. */
export const openCell = (lab, row) => Boolean(board?.pressCell({ lab, row }));

export async function initializeConstitutions() {
  Object.assign(nodes, {
    status: byId("status"),
    legend: byId("legend"),
    behaviourScale: byId("behaviour-scale"),
    behaviourScaleTitle: byId("behaviour-scale-title"),
    ties: byId("ties"),
    asOf: byId("as-of"),
  });
  board = createBoard({
    nodes: { table: byId("board"), pop: byId("grid-pop"), expandAll: byId("expand-all") },
    everyRow: { show: "Show every row", hide: "Hide every row" },
  });

  const data = await loadBoard("constitutions");
  if (data?.format !== FORMAT || !data.companies?.length || !data.behaviours?.length
      || !data.criteria?.length) {
    nodes.status.textContent = INCOMPATIBLE;
    return;
  }
  // A board missing a key this page reads is a publication this version of the
  // site cannot draw, and the reader is told so rather than shown half a board.
  try {
    // The page's words first: the title, the introduction, the notes and the
    // sections under the board are the file's, like its figures.
    // What the markup keeps hidden until there is a board to go with it: the
    // title, the board, and the takeaways and notes beside each other.
    document.querySelectorAll("#view-coverage [data-needs-board]")
      .forEach(node => { node.hidden = false; });
    renderPage("cov", data.page);
    renderNotes(byId("board-notes"), data.page.notes);
    byId("cov-notes").hidden = !(data.page.notes || []).length;
    state.data = data;
    data.companies.forEach(company => { company.final = finalOf(data, company); });
    state.companies = ranked(currentPerCompany(data.companies));

    /* Grouped by first appearance rather than alphabetically, so the file's own
     * order decides which category leads. An id of its own for each group: a
     * category's name is a sentence, and the board addresses a group inside a CSS
     * selector. */
    state.categories = categoriesOf(data);

    renderTable();
    // The behaviours open by default, each category shut: the categories are what
    // a reader compares first, and a behaviour is one press away.
    board.setExpanded("behaviours", true);
    renderLegend();
    renderScales();
    renderTies();
    nodes.asOf.textContent = data.as_of ? `As of ${data.as_of}` : "";
    renderTakeaways(data.takeaways || []);
    // When the publication the board came from was put online: the pinned one, or
    // the current one.
    showPublishedAt(pinned());
  } catch {
    board.nodes.table.tBodies[0].replaceChildren();
    board.nodes.table.tHead.replaceChildren();
    document.querySelectorAll("#view-coverage [data-needs-board]")
      .forEach(node => { node.hidden = true; });
    byId("cov-sections").replaceChildren();
    nodes.status.textContent = INCOMPATIBLE;
    return;
  }
  board.wirePopover([document.querySelector("#view-coverage .matrix-wrap")]);
  board.nodes.expandAll.addEventListener("click", () => board.expandEvery());
  nodes.status.textContent = "";
}
