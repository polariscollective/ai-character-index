/* The board the index leads with: what each company's constitution says, and
 * how well the document is built.
 *
 * It reads one written file, site/constitutions.json, the way the governance
 * board reads site/governance.json. Nothing here calls a route and nothing here
 * carries a publication: every figure and every sentence a reader can open comes
 * out of that file, and a board that says more than its file says would be a
 * board nobody could correct by editing the file.
 *
 * What is written here rather than in the file is the shape of the board: that a
 * final score is out of 20, that a criterion is shown halved so the five add up
 * to 10, that companies are ranked by the final score and that level companies
 * share a place. Those are properties of the table, not claims about a document.
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

import { createBoard, element, mono, paragraph, ORDINALS, level, rankBy } from "./board.js";
/* The mark of each company, above its name. One module for both boards, and it
 * says where the drawings come from and which two companies have none. */
import { companyMark } from "./company-marks.js";

const FILE = "/constitutions.json";

const byId = id => document.getElementById(id);

const state = { data: null, companies: [], categories: [] };

let board = null;

const nodes = {};

/* ---- The figures, and what each row is out of ------------------------------- */

/* Every maximum is read off the file's own scales rather than written down, so a
 * file that scores a behaviour out of something else moves the board with it.
 * The one arithmetic rule the board keeps is the halving: a criterion is scored
 * on its own scale and shown at half of it, which is what makes five criteria
 * add up to the same 10 the behaviours are out of. */
const depthMax = () => state.data.scale.depth[state.data.scale.depth.length - 1].level;
const criterionMax = () =>
  state.data.scale.criterion[state.data.scale.criterion.length - 1].score;
const shownMax = () => criterionMax() / 2;
const wholeMax = () => state.data.criteria.length * shownMax();
const finalMax = () => wholeMax() + depthMax();

const shown = value => value.toFixed(1);

/* A version whose day is 00 has no day recorded, so it is shown without one. */
const shownVersion = version => String(version || "").replace(/-00$/, "");

/* "Anthropic: which rule wins", keeping a leading acronym as it is. */
const lowerFirst = text =>
  (/^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));

const mean = values =>
  (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

const number = value => (Number.isFinite(value) ? value : null);

/* A criterion as the board shows it: the file's figure halved. */
const criterionPart = (company, criterion) =>
  (number(company.whole?.criteria?.[criterion.id]?.score) === null
    ? null : company.whole.criteria[criterion.id].score / 2);

const wholeTotal = company => number(company.whole?.total);

const behaviourEntry = (company, behaviour) => company.behaviours?.[behaviour.slug] || null;

const depthOf = (company, behaviour) =>
  number(behaviourEntry(company, behaviour)?.score);

const categoryFigure = (company, members) =>
  mean(members.map(member => depthOf(company, member)).filter(value => value !== null));

const behavioursFigure = company => categoryFigure(company, state.data.behaviours);

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
function rankLine(company) {
  if (!company.rank) return "";
  const all = state.companies;
  const alongside = all.filter(other => other !== company && other.rank === company.rank);
  return `Ranked ${company.rank} of ${all.length}`
    + `${alongside.length ? `, level with ${listed(alongside.map(other => other.name))}` : ""}.`;
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

/* The file's sentences are written for a reader who is scanning, so they carry
 * four marks and no more: a blank line between paragraphs, `**bold**` inside a
 * sentence, a line opening `- ` as a bullet, and a line opening `### ` as a
 * small heading. Anything else is prose.
 *
 * The parser is kept apart from the drawing, and returns what to draw rather
 * than drawing it, for two reasons. The page builds every block with
 * `document.createElement` and text nodes, so the strings the file carries can
 * never be read as markup by the browser however they were written; and the
 * browser walker holds the board to the file through this same reading, rather
 * than through a second copy of it written beside the walker, which is how a
 * figure on this site came to be published wrong once already.
 */

const BOLD = /\*\*(.+?)\*\*/g;

/* A sentence cut at its bold spans: each run is a string and whether it is
 * bold. Unpaired asterisks are left where they are and read as text. */
function runsOf(text) {
  const runs = [];
  let at = 0;
  for (const match of text.matchAll(BOLD)) {
    if (match.index > at) runs.push({ text: text.slice(at, match.index), bold: false });
    runs.push({ text: match[1], bold: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at), bold: false });
  return runs;
}

/* The blocks of one field, in the order the page draws them: a paragraph, a
 * heading, or a list with its items. Lines that are neither a heading nor a
 * bullet and sit together make one paragraph, so a field wrapped over several
 * lines reads as the sentence it is. */
export function markupBlocks(text) {
  const blocks = [];
  let lines = [];
  const closeParagraph = () => {
    if (lines.length) blocks.push({ kind: "paragraph", runs: runsOf(lines.join(" ")) });
    lines = [];
  };
  String(text == null ? "" : text).split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) {
      closeParagraph();
      return;
    }
    if (line.startsWith("### ")) {
      closeParagraph();
      blocks.push({ kind: "heading", runs: runsOf(line.slice(4).trim()) });
      return;
    }
    if (line.startsWith("- ")) {
      closeParagraph();
      const item = runsOf(line.slice(2).trim());
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
      return;
    }
    lines.push(line);
  });
  closeParagraph();
  return blocks;
}

const plainOf = runs => runs.map(run => run.text).join("");

/* One string per block the page draws, with a list given as its items, and the
 * marks gone. This is what a reader sees, and what the walker compares the
 * popover against. */
export function markupPlain(text) {
  return markupBlocks(text).flatMap(block =>
    (block.kind === "list" ? block.items.map(plainOf) : [plainOf(block.runs)]));
}

function filled(node, runs) {
  runs.forEach(run => node.append(run.bold
    ? element("strong", null, run.text)
    : document.createTextNode(run.text)));
  return node;
}

/* The blocks of one field, drawn into `parent`. `className` is carried by every
 * block of it, which is how a field the popover shows as an aside stays muted
 * once it is more than one paragraph. */
export function renderMarkup(parent, text, className) {
  markupBlocks(text).forEach(block => {
    if (block.kind === "heading") {
      parent.append(filled(element("h3", className), block.runs));
      return;
    }
    if (block.kind === "list") {
      /* The framework's own bullet, a chartreuse circle, which the reference
       * text under the board already draws with this class. */
      const list = element("ul", ["gov-bullets", className].filter(Boolean).join(" "));
      block.items.forEach(item => list.append(filled(element("li"), item)));
      parent.append(list);
      return;
    }
    parent.append(filled(element("p", className), block.runs));
  });
}

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

/* A figure beside a name, pressable, which refills the popover in place rather
 * than sending the reader back to the table to find the cell. */
function figureItem(value, max, name, label, open) {
  const item = element("li");
  const button = element("button", "inline-button", name);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => board.refill(open));
  item.append(board.chip(value, max, shown(value)), button);
  return item;
}

/* ---- What each popover says ------------------------------------------------- */

function aboutFinal(content) {
  board.titled(content, `Final score, out of ${finalMax()}`,
    `The two halves added together, each out of ${wholeMax()}: the document as a whole, and the `
    + "behaviours.");
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
  content.append(table, paragraph("Companies are ranked by this score. Companies level on it "
    + "share a place, and the next rank skips."));
}

function finalScore(content, company) {
  board.titled(content, `${company.name}: final score`, documentLine(company));
  content.append(board.figure(shown(company.final), ` out of ${finalMax()}`));
  content.append(paragraph(rankLine(company)));
  const parts = element("ul", "check-list");
  const whole = wholeTotal(company);
  const behaviours = behavioursFigure(company);
  if (whole !== null) {
    parts.append(figureItem(whole, wholeMax(), "The document as a whole",
      `The document as a whole, ${shown(whole)} out of ${wholeMax()}`,
      rest => wholeScore(rest, company)));
  }
  if (behaviours !== null) {
    const item = element("li");
    item.append(board.chip(behaviours, depthMax(), shown(behaviours)),
      element("span", "", "The behaviours, the mean of every behaviour on the board"));
    parts.append(item);
  }
  content.append(parts);
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
      const item = element("li");
      item.append(board.chip(part, shownMax(), shown(part)),
        element("span", "", `${criterion.name}, out of ${shownMax()}`));
      list.append(item);
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
      const item = element("li");
      item.append(board.chip(score, depthMax(), shown(score)),
        element("span", "", behaviour.name));
      list.append(item);
    });
    fold.append(summary, list);
    content.append(fold);
  });
  if (company.document?.url) {
    const read = element("p");
    read.append(link(company.document.url, `Read ${company.document.title}`));
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
    `${state.data.criteria.length} criteria, each out of ${shownMax()}, adding up to a total out `
    + `of ${wholeMax()}.`);
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
  const list = element("ul", "check-list");
  state.data.criteria.forEach(criterion => {
    const part = criterionPart(company, criterion);
    if (part === null) return;
    list.append(figureItem(part, shownMax(), criterion.name,
      `${criterion.name}, ${shown(part)} out of ${shownMax()}`,
      rest => criterionScore(rest, company, criterion)));
  });
  content.append(list);
  content.append(board.popButton(`The whole profile of ${company.name}`,
    () => board.refill(rest => profile(rest, company))));
}

function aboutCriterion(content, criterion) {
  board.titled(content, criterion.name,
    `One of the ${state.data.criteria.length} criteria on the document as a whole, out of `
    + `${shownMax()}.`);
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
  content.append(board.figure(shown(part), ` out of ${shownMax()}`));
  renderMarkup(content, criterion.what_it_is, "subtitle");
  cellSentences(content, company, entry.what_the_document_does, entry.why);
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
  content.append(element("p", "subtitle", `The mean of its ${members.length} `
    + `${members.length === 1 ? "behaviour" : "behaviours"}.`));
  const list = element("ul", "check-list");
  members.forEach(behaviour => {
    const score = depthOf(company, behaviour);
    if (score === null) return;
    list.append(figureItem(score, depthMax(), behaviour.name,
      `${behaviour.name}, ${shown(score)} out of ${depthMax()}`,
      rest => behaviourCell(rest, company, behaviour)));
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

/* One cell, and the shortest popover on the board: what the constitution says on
 * this behaviour, how that stands beside the others, and why the figure is what
 * it is. Three sentences of the file's, spaced, and nothing else. */
function behaviourCell(content, company, behaviour) {
  const entry = behaviourEntry(company, behaviour) || {};
  board.titled(content, `${company.name}: ${lowerFirst(behaviour.name)}`, documentLine(company));
  content.append(board.figure(shown(entry.score), ` out of ${depthMax()}`));
  cellSentences(content, company, entry.says, entry.compared, entry.why);
}

/* ---- The table -------------------------------------------------------------- */

const rowId = (groupId, index) => `board-row-${groupId}-${index}`;

const cellFor = (company, rowLabel, row, rest) => board.scoreCell({
  name: company.name, rowLabel, dataset: { lab: company.id, row }, ...rest,
});

function headRow() {
  const row = element("tr");
  const corner = element("th", "row-col");
  corner.scope = "col";
  corner.append(element("span", "head-name", "Company by rank"));
  row.append(corner);
  state.companies.forEach(company => {
    const cell = element("th");
    cell.scope = "col";
    const button = element("button", "company-button");
    button.type = "button";
    button.dataset.lab = company.id;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", `${company.name}, ranked ${company.rank}: its profile`);
    button.append(element("span", "rank", String(company.rank)));
    // Drawn, quiet and decorative: the name under it is what is read out, and a
    // company the set has no mark for keeps the space so every name starts on
    // one line.
    button.append(companyMark(company.id));
    button.append(element("span", "company-name", company.name));
    button.append(company.document
      ? element("span", "company-flag mono", shownVersion(company.document.version))
      : element("span", "company-flag", "No published constitution"));
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

  /* The final score, one row above every group, as the governance board's total. */
  const total = element("tr", "total-row");
  total.append(board.rowHead(null, board.rowName("Final score", `out of ${finalMax()}`, aboutFinal,
    `Final score, out of ${finalMax()}: how it is worked out`)));
  companies.forEach(company => {
    total.append(cellFor(company, "final score", "final", {
      value: company.final, max: finalMax(), text: shown(company.final),
      build: content => finalScore(content, company),
    }));
  });
  body.append(total);

  /* The document as a whole: its total on the group row, the criteria folded
   * under it, each shown at half its own score so the five add up to the total. */
  const wholeRow = element("tr", "question-row");
  wholeRow.append(board.rowHead(
    board.rowToggle("whole", state.data.criteria.map((criterion, index) => rowId("whole", index)),
      { parts: "criteria", name: "The document as a whole" }),
    board.rowName("The document as a whole",
      `out of ${wholeMax()}, ${state.data.criteria.length} criteria`, aboutWhole,
      "The document as a whole: what it measures")));
  companies.forEach(company => {
    const whole = wholeTotal(company);
    wholeRow.append(cellFor(company, "the document as a whole", "whole", {
      value: whole, max: wholeMax(), text: shown(whole),
      build: content => wholeScore(content, company),
    }));
  });
  body.append(wholeRow);

  state.data.criteria.forEach((criterion, index) => {
    const sub = board.subRow(rowId("whole", index), "whole",
      board.rowName(criterion.name, `out of ${shownMax()}`,
        content => aboutCriterion(content, criterion), `${criterion.name}: what it asks`));
    companies.forEach(company => {
      const part = criterionPart(company, criterion);
      sub.append(cellFor(company, lowerFirst(criterion.name), criterion.id, {
        value: part, max: shownMax(), text: shown(part),
        build: content => criterionScore(content, company, criterion),
      }));
    });
    body.append(sub);
  });

  /* Each category: the mean of its behaviours on the group row, the behaviours
   * folded under it. */
  state.categories.forEach(category => {
    const { id, name, members } = category;
    const row = element("tr", "question-row");
    row.dataset.question = id;
    row.append(board.rowHead(
      board.rowToggle(id, members.map((member, index) => rowId(id, index)),
        { parts: "behaviours", name }),
      board.rowName(name, `out of ${depthMax()}, ${members.length} `
        + `${members.length === 1 ? "behaviour" : "behaviours"}`,
        content => aboutCategory(content, category), `${name}: what it measures`)));
    companies.forEach(company => {
      const value = categoryFigure(company, members);
      row.append(cellFor(company, lowerFirst(name), id, {
        value, max: depthMax(), text: shown(value),
        build: content => categoryScore(content, company, category),
      }));
    });
    body.append(row);

    members.forEach((behaviour, index) => {
      const sub = board.subRow(rowId(id, index), id,
        board.rowName(behaviour.name, `out of ${depthMax()}`,
          content => aboutBehaviour(content, behaviour),
          `${behaviour.name}: what it covers`));
      companies.forEach(company => {
        const score = depthOf(company, behaviour);
        sub.append(cellFor(company, lowerFirst(behaviour.name), behaviour.slug, {
          value: score, max: depthMax(), text: shown(score),
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
    element("span", "", "none"), board.swatches([0, 0.25, 0.5, 0.75, 1], 1),
    element("span", "", "all"));
  nodes.legend.replaceChildren(legend);
}

/* The two scales, under the table and nowhere else. */
function renderScales() {
  const behaviours = document.createDocumentFragment();
  state.data.scale.depth.forEach(({ level: at, name, plain }) => {
    const item = element("li");
    const text = element("span");
    text.append(element("span", "anchor-name", name), document.createTextNode(`: ${plain}`));
    item.append(element("span", "anchor-level", String(at)), text);
    behaviours.append(item);
  });
  nodes.behaviourScaleTitle.textContent =
    `How far a constitution goes on one behaviour, out of ${depthMax()}`;
  nodes.behaviourScale.replaceChildren(behaviours);

  const criteria = document.createDocumentFragment();
  state.data.scale.criterion.forEach(({ score, plain }) => {
    const item = element("li");
    item.append(element("span", "anchor-level", String(score)), element("span", "", plain));
    criteria.append(item);
  });
  nodes.criterionScaleTitle.textContent = "How the document is built, out of 2 for each part";
  nodes.criterionScale.replaceChildren(criteria);
  nodes.criterionNote.textContent =
    `A figure between 0 and 2 means the constitution does part of what that part asks. The `
    + `${state.data.criteria.length} parts add up to ${wholeMax()}.`;
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

/* The board this one leads, in one line. Its figures come from the index's own
 * publication, which the file names, so the line carries that publication and
 * opens on the one the figures here were written beside. */
function renderCoverageLine() {
  const where = element("a", null, "Open the coverage board");
  where.href = state.data.publication
    ? `/coverage?publication=${encodeURIComponent(state.data.publication)}`
    : "/coverage";
  nodes.coverageLine.replaceChildren(
    document.createTextNode("The coverage board sets the same documents against the same "
      + "behaviours, and every figure on it opens on the passages behind it. "),
    where, document.createTextNode("."));
}

/* ---- Loading ---------------------------------------------------------------- */

export async function initializeConstitutions() {
  Object.assign(nodes, {
    status: byId("status"),
    legend: byId("legend"),
    behaviourScale: byId("behaviour-scale"),
    behaviourScaleTitle: byId("behaviour-scale-title"),
    criterionScale: byId("criterion-scale"),
    criterionScaleTitle: byId("criterion-scale-title"),
    criterionNote: byId("criterion-note"),
    ties: byId("ties"),
    asOf: byId("as-of"),
    coverageLine: byId("coverage-line"),
  });
  board = createBoard({
    nodes: { table: byId("board"), pop: byId("grid-pop"), expandAll: byId("expand-all") },
    everyRow: { show: "Show every row", hide: "Hide every row" },
  });

  let data = null;
  try {
    const response = await fetch(FILE);
    if (response.ok) data = await response.json();
  } catch {
    data = null;
  }
  if (!data?.companies?.length || !data?.behaviours?.length || !data?.criteria?.length) {
    nodes.status.textContent = "The board could not be loaded.";
    return;
  }
  state.data = data;
  state.companies = ranked(currentPerCompany(data.companies));

  /* Grouped by first appearance rather than alphabetically, so the file's own
   * order decides which category leads. An id of its own for each group: a
   * category's name is a sentence, and the board addresses a group inside a CSS
   * selector. */
  const byCategory = new Map();
  data.behaviours.forEach(behaviour => {
    const name = behaviour.category || "Behaviours";
    if (!byCategory.has(name)) byCategory.set(name, []);
    byCategory.get(name).push(behaviour);
  });
  state.categories = [...byCategory].map(([name, members], index) =>
    ({ id: `category-${index}`, name, members }));

  renderTable();
  renderLegend();
  renderScales();
  renderTies();
  renderCoverageLine();
  nodes.asOf.textContent = data.as_of ? `As of ${data.as_of}` : "";
  board.wirePopover([document.querySelector("#view-coverage .matrix-wrap")]);
  board.nodes.expandAll.addEventListener("click", () => board.expandEvery());
  nodes.status.textContent = "";
}
