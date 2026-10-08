/* The overview: what the index finds, on one page.
 *
 * Its words are site/overview.json, which a publication freezes beside the two
 * boards, so a pinned publication comes back with the overview it was published
 * with. The file says which figures to show and what to call them; the figures
 * themselves are read from the two boards of the same publication, through the
 * functions the boards compute them with, so the overview and the Index cannot
 * give a company two different scores.
 *
 * The grid is drawn by board.js, the code that draws the boards of the Index, so
 * its cells, its popover and its layout on a phone are theirs. It shows each
 * final score as a letter, read from the figure out of 10 the Index gives
 * against the thresholds the file names (site/grades.js). A cell opens the
 * figure behind its letter, what the figure means, and the board that explains
 * it.
 *
 * Each final score folds open into the rows its board of the Index shows under
 * it, built by that board's own code (rowsFor), so a row and its popover are
 * the Index's; only the drawing of a cell is the overview's (overview-rows.js).
 * How constitutions are governed leads, and orders the companies.
 *
 * Above the two final scores, where the file names it, the overall grade: their
 * average on the same scale, capped at F where either fails (overallOf in
 * site/grades.js, which the MCP server answers with too).
 */

import { INCOMPATIBLE, loadBoard } from "./publication-data.js";
import { FORMAT, renderPage } from "./page-content.js";
import { renderMarkup, renderInline } from "./markup.js";
import { createBoard, element } from "./board.js";
import { figuresOf, partsOf as constitutionParts, rowsFor as constitutionRows } from "./constitutions.js";
import { totalsFor, partsOf as governanceParts, rowsFor as governanceRows,
         ranked as governanceRanked } from "./governance.js";
import { cellShape } from "./overview-rows.js";
import { companyMark } from "./company-marks.js";
import { renderMenu } from "./page-menu.js";
import { gradeOf, paintAt, overallOf } from "./grades.js";

const TEN = 10;

const byId = id => document.getElementById(id);
const needed = () => document.querySelectorAll("#view-overview [data-needs-board]");
const shown = value => value.toFixed(1);
/* "Open weights" read inside a sentence, keeping a leading acronym as it is. */
const lowerFirst = text =>
  (/^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));

/* One company's four figures, and whether it publishes a constitution. The
 * constitutions board names each company's newest document under the company's
 * id; an earlier version carries an id of its own and is left out here, as the
 * board leaves it out of its columns. Companies are in the order of how their
 * constitution is governed, the governance board's own ranking with its
 * tiebreak, so the overview and that board order them alike. */
function companiesOf(constitutions, governance, overview) {
  const order = governanceRanked(governance).map(lab => lab.id);
  return governance.labs.map(lab => {
    const written = constitutions.companies.find(company => company.id === lab.id);
    // A company the constitutions board does not carry is a publication this
    // page cannot draw, as the board's own rowsFor finds it: the reader is told
    // so by the not-compatible sentence, for this one reason.
    if (!written) throw new Error(`The constitutions board has no company ${lab.id}.`);
    const said = figuresOf(constitutions, written);
    const governed = totalsFor(governance, lab.id);
    return {
      id: lab.id,
      name: lab.name,
      mark: lab.mark ?? written.mark,
      // What each figure is made of, by the functions the boards list it with.
      parts: {
        whole: constitutionParts(constitutions, written, "whole"),
        behaviours: constitutionParts(constitutions, written, "behaviours"),
        published: governanceParts(governance, lab.id, "published"),
        engages: governanceParts(governance, lab.id, "engages"),
      },
      // The overview's own words about this company: a summary of everything
      // under each figure, written for this page and not copied from the Index.
      summary: overview.summaries?.[lab.id] || {},
      publishes: Boolean(written.document),
      document: written.document || null,
      // What a reader should know under the name, as the two boards say it:
      // the constitutions board's note on the document, and whether anyone can
      // download the flagship model.
      note: written.note || null,
      openWeights: Boolean(lab.open_weights),
      figures: {
        constitutions: { final: said.final ?? 0, whole: said.whole, behaviours: said.behaviours },
        governance: { total: governed.total, ...governed.byColumn },
      },
    };
  }).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/* The overview's summary of one figure for one company. A company with no
 * constitution has nothing under the constitutions' figures, and the file says
 * so once for all of them. */
function summaryOf(company, key, board) {
  return company.summary[key]
    || (board === "constitutions" && !company.publishes ? state.overview.grid.no_constitution : "");
}

/* What a reader should know about a company's document before reading its
 * figures, where the overview says it: small, under the rest, and never the
 * first thing. */
function caveatOf(content, company) {
  const caveat = company.summary.caveat;
  if (!caveat) return;
  const note = element("p", "subtitle ovw-caveat");
  note.append(element("strong", "", "About this document. "), document.createTextNode(caveat));
  content.append(note);
}

/* A list of figures, each a chip and a name. A figure this table carries opens
 * its cell here (`cell` and `open`); a figure only the Index carries leads to its
 * cell there (`href`). A final score (`graded`) wears its letter on the chip and
 * says its figure after the name; a part wears its figure out of 10. */
function figureList(items) {
  const list = element("ul", "check-list");
  items.forEach(({ value, name, cell, open, href, graded }) => {
    const item = element("li");
    item.append(graded ? gradeChip(value) : view.chip(value, TEN, shown(value)));
    if (cell) {
      const button = element("button", "inline-button", name);
      button.type = "button";
      button.addEventListener("click", () => view.follow(cell, open));
      item.append(button);
    } else if (href) {
      const link = element("a", "inline-link", name);
      link.href = href;
      link.title = "Opens this figure in the Index";
      item.append(link);
    } else {
      item.append(element("span", "", name));
    }
    if (graded) item.append(document.createTextNode(`, ${shown(value)} out of ${TEN}`));
    list.append(item);
  });
  return list;
}

/* What a press on one final score's cell opens. */
function cellOpener(company, group) {
  const { board, figure } = group.final;
  const value = company.figures[board][figure] ?? 0;
  return content => aboutFinal(content, company, group, value);
}

/* Where in the Index a part of one of this table's figures lives. */
const indexCell = (company, row, part) => (row.board === "governance"
  ? `/index?view=governance&company=${company.id}&cell=${encodeURIComponent(part.row)}`
  : `/index?company=${company.id}&cell=${encodeURIComponent(part.row)}`);

/* The row's own word for a figure that earns no letter, as the file gives it. */
const noneWord = () => state.overview.grid.groups[0]?.final?.zero || "None";

/* A figure's letter, or null where it prints as nought. */
const letterOf = value => gradeOf(value, state.overview.grid.grades);

/* The file's grades, highest threshold first. */
const orderedGrades = () => [...state.overview.grid.grades].sort((a, b) => b.from - a.from);

/* Where a letter sits on the boards' colour ramp: at its own threshold, so it
 * wears the colour that figure wears in the Index, unless its text would fall
 * below WCAG AA there (paintAt in grades.js). None has no place on the ramp: it
 * is left unpainted. */
function gradeValue(letter) {
  const grade = state.overview.grid.grades.find(candidate => candidate.letter === letter);
  return grade ? paintAt(grade.from) : 0;
}

/* A final score's letter as a chip, painted where the grid paints it; a figure
 * with no letter is the unpainted chip of a figure not assessed. */
function gradeChip(value) {
  const letter = letterOf(value);
  return letter
    ? view.chip(gradeValue(letter), TEN, letter)
    : element("span", "chip chip-na", noneWord());
}

/* A company's overall grade: the average of its final scores, no higher than F
 * where either fails (overallOf in grades.js). */
const overallFor = company => overallOf(
  state.overview.grid.groups.map(group => company.figures[group.final.board][group.final.figure] ?? 0),
  state.overview.grid.grades);

/* The letter large, and the figure behind it, at the head of a popover. */
const gradeFigure = value =>
  view.figure(letterOf(value) ?? noneWord(), `, ${shown(value)} out of ${TEN}`);

let view = null;
let state = null;

/* ---- The popovers -------------------------------------------------------- */

function leadTo(content, href, text) {
  const line = element("p", "ovw-pop-link");
  const link = element("a", "", text);
  link.href = href;
  // A source elsewhere opens in its own tab, so the page stays where it was.
  if (/^https?:/.test(href)) {
    link.target = "_blank";
    link.rel = "noopener";
  }
  line.append(link);
  content.append(line);
}

/* A final score: the figure, what everything under it adds up to, and its two
 * halves. One press, the whole picture. */
function aboutFinal(content, company, group, value) {
  const final = group.final;
  view.titled(content, `${company.name}: ${group.name.toLowerCase()}`, final.plain);
  content.append(gradeFigure(value));
  const reason = summaryOf(company, final.board, final.board);
  if (reason) renderMarkup(content, reason);
  content.append(view.h3("What it is made of"), partsOpening(company, group));
  if (final.board === "constitutions") caveatOf(content, company);
  leadTo(content, group.href, "See every part of this score in the Index");
}

/* A final score's parts, each opening in place: its figure and name, then the
 * overview's words about it and the parts it is made of in turn, each leading
 * to its cell in the Index. Nothing opens a second popover. */
function partsOpening(company, group) {
  const list = element("div", "ovw-parts");
  group.rows.forEach(row => {
    const value = company.figures[row.board][row.figure] ?? 0;
    const fold = element("details", "ovw-part");
    const head = element("summary");
    head.append(view.chip(value, TEN, shown(value)), element("span", "", row.name));
    fold.append(head);
    const reason = summaryOf(company, row.figure, row.board);
    const body = element("div", "ovw-part-body");
    if (reason) renderMarkup(body, reason);
    const parts = company.parts[row.figure] || [];
    if (parts.length && value > 0) {
      body.append(figureList(parts.map(part =>
        ({ ...part, href: part.row ? indexCell(company, row, part) : null }))));
    }
    const note = company.summary.notes?.[row.figure];
    if (note) body.append(element("p", "subtitle", note));
    fold.append(body);
    list.append(fold);
  });
  return list;
}

/* What the letters mean and where they come from, in the file's words, where a
 * row says what it measures: a reader asking what a letter is also needs to know
 * the figure out of 10 it is read from, and the thresholds. */
function scaleOf(content) {
  const { scale } = state.overview.grid;
  if (!scale) return;
  content.append(view.h3("The scale"));
  renderMarkup(content, scale);
}

/* The whole scale, opened from the legend: every letter with the figures out
 * of 10 it covers, then None. A letter is read from the figure as it is shown,
 * to one decimal, so a band runs from its threshold to a tenth below the next
 * one up, and F starts at the first figure that does not show as 0.0. */
function aboutScale(content) {
  const words = state.overview.grid.grade_scale || {};
  view.titled(content, words.title || "The grading scale");
  if (words.text) renderMarkup(content, words.text);
  const list = element("ul", "check-list ovw-scale-list");
  let next = null;
  orderedGrades().forEach(({ letter, from }) => {
    const low = from > 0 ? from : 0.1;
    const high = next === null ? TEN : next - 0.1;
    const item = element("li");
    item.append(view.chip(gradeValue(letter), TEN, letter),
                element("span", "ovw-scale-range", `${low.toFixed(1)} to ${high.toFixed(1)}`));
    list.append(item);
    next = from;
  });
  const none = element("li");
  none.append(element("span", "chip chip-na", noneWord()),
              element("span", "ovw-scale-range", (0).toFixed(1)));
  list.append(none);
  content.append(list);
}

function aboutGroup(content, group) {
  view.titled(content, group.name);
  content.append(element("p", "", group.final.plain));
  scaleOf(content);
  // The two parts the score is made of, each with what it measures: the grid
  // shows them as rows under the fold.
  content.append(view.h3("What it is made of"));
  group.rows.forEach(row => {
    const part = element("p", "");
    part.append(element("strong", "", `${row.name}. `), document.createTextNode(row.plain));
    content.append(part);
  });
  leadTo(content, group.href, "See every company's score in the Index");
}

/* A company: the whole picture in a few sentences, its two final scores, and
 * the way to its profile on each board of the Index. */
function aboutCompany(content, company) {
  view.titled(content, company.name);
  const profile = company.summary.profile;
  if (profile) renderMarkup(content, profile);
  content.append(view.h3("Its final scores"), figureList(state.overview.grid.groups.map(group =>
    ({ value: company.figures[group.final.board][group.final.figure] ?? 0, name: group.name,
       cell: { lab: company.id, row: group.final.figure },
       open: cellOpener(company, group), graded: true }))));
  caveatOf(content, company);
  if (company.document) {
    leadTo(content, `/doc-reader/?spec=${encodeURIComponent(company.document.id)}`,
      `Read ${company.document.title} in the Doc reader`);
  }
  leadTo(content, `/index?view=governance&company=${company.id}`,
    "See its figures on process");
  leadTo(content, `/index?company=${company.id}`,
    "See its figures on content");
}

/* A row's name on the overview, the same for a score and for a view in
 * preparation: plain text that opens what the row is, and no more than that. */
function rowTitle(name, build, label) {
  const button = element("button", "ovw-row-name", name);
  button.type = "button";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => view.openPopover(button, build));
  return button;
}

/* ---- The overall grade --------------------------------------------------- */

/* How the overall grade is worked out, in the file's words. */
function aboutOverall(content) {
  const { overall } = state.overview.grid;
  view.titled(content, overall.name);
  renderMarkup(content, overall.plain);
}

/* The overall grade, the first row of the grid: a quiet band rather than a row
 * of painted cells, since it is read from the two letters under it and adds no
 * figure of its own. Each cell is the letter with its figure beside it, small;
 * a figure that prints as 0.0 earns no letter and shows as it is. Nothing folds
 * under it, and only its name opens a popover. */
function overallRow() {
  const { overall } = state.overview.grid;
  const tr = element("tr", "ovw-overall-row");
  tr.dataset.row = "overall";
  tr.append(view.rowHead(null, view.rowName(overall.name, null, aboutOverall,
    `${overall.name}: how it is worked out`)));
  state.companies.forEach(company => {
    const { value, letter } = overallFor(company);
    const cell = element("td", "cell ovw-overall-cell");
    cell.dataset.lab = company.id;
    // Seen as "C+ (7.5)", heard as "C+, 7.5 out of 10".
    const seen = element("span", "ovw-overall-seen");
    seen.setAttribute("aria-hidden", "true");
    seen.append(element("span", "ovw-overall-letter", letter ?? shown(value)));
    if (letter) seen.append(element("span", "ovw-overall-figure", `(${shown(value)})`));
    cell.append(seen, element("span", "visually-hidden",
      `${letter ? `${letter}, ` : ""}${shown(value)} out of ${TEN}`));
    tr.append(cell);
  });
  return tr;
}

/* ---- The views in preparation ------------------------------------------- */

function aboutComing(content, item) {
  view.titled(content, item.name, "In preparation");
  content.append(element("p", "", item.plain));
}

/* A view the index does not carry yet: its name, which opens what it will be,
 * and a quiet "In preparation" in every company's cell. */
function comingRow(item) {
  const tr = element("tr", "total-row outside-row coming-row");
  tr.dataset.row = `coming-${item.id}`;
  // The same head as a score's row, without a fold's button or its spacer
  // before the name, so the name starts where that button would.
  const head = element("th");
  head.scope = "row";
  const line = element("div", "row-head");
  line.append(rowTitle(item.name, content => aboutComing(content, item),
    `${item.name}: in preparation`));
  head.append(line);
  tr.append(head);
  const cell = element("td", "cell");
  cell.colSpan = state.companies.length;
  cell.append(element("span", "cell-coming", "In preparation"));
  tr.append(cell);
  return tr;
}

/* ---- The context --------------------------------------------------------- */

/* What a context row is, where it comes from, and what it cannot say. */
function aboutContextRow(content, context, row) {
  view.titled(content, row.name, context.name);
  [["What it is", row.what], ["Where it comes from", row.from], ["Its limits", row.limits]]
    .forEach(([heading, text]) => {
      if (!text) return;
      content.append(view.h3(heading), element("p", "", text));
      // A row drawn in squares shows them, each with what it stands for.
      if (heading === "What it is" && row.scale?.length) {
        const list = element("ul", "usage-scale");
        row.scale.forEach(step => {
          const item = element("li");
          item.append(usageMeter(step.level), element("span", "", step.text));
          list.append(item);
        });
        content.append(list);
      }
    });
  (row.links || []).forEach(link => leadTo(content, link.url, link.text));
}

/* The usage estimate as three squares, filled one per step, all three empty
 * where there is nothing to go on. Decorative: the words beside it say it. */
function usageMeter(level) {
  const filled = level === "-" ? 0 : level.length;
  const meter = element("span", "usage-meter");
  meter.setAttribute("aria-hidden", "true");
  for (let step = 0; step < 3; step += 1) {
    meter.append(element("span", step < filled ? "usage-step usage-step-on" : "usage-step"));
  }
  return meter;
}

/* One company's fact on one context row: what it is, the company's own words
 * where there are some, and where they were said. */
function aboutContextCell(content, context, row, company, entry) {
  view.titled(content, `${company.name}: ${row.name.toLowerCase()}`, context.name);
  if (entry.behind) content.append(view.figure(entry.behind, ""));
  if (entry.band) content.append(view.figure(entry.band, " a month"));
  if (entry.level) {
    // The same three squares the cell shows, and what they are.
    const line = element("p", "figure usage-figure");
    line.append(usageMeter(entry.level), document.createTextNode("Our estimate"));
    content.append(line);
  }
  if (Number.isFinite(entry.share)) content.append(view.figure(entry.shown, " of tokens on OpenRouter"));
  if (Number.isFinite(entry.eci)) {
    const line = element("p", "subtitle");
    line.append(element("span", "mono", entry.eci.toFixed(1)),
                document.createTextNode(" on the Epoch Capabilities Index"));
    content.append(line);
  }
  if (entry.text) content.append(element("p", "", entry.text));
  // Every signal the estimate rests on, each with where it comes from.
  if (entry.signals?.length) {
    const list = element("ul", "usage-signals");
    entry.signals.forEach(signal => {
      const item = element("li", "", `${signal.text} `);
      if (signal.url) {
        const link = element("a", "", "Source");
        link.href = signal.url;
        link.target = "_blank";
        link.rel = "noopener";
        item.append(link);
      }
      list.append(item);
    });
    content.append(list);
  }
  if (entry.quote) {
    const said = element("blockquote", "ovw-quote", `“${entry.quote}”`);
    content.append(said);
    if (entry.source) content.append(element("p", "subtitle", entry.source));
  }
  if (entry.downloads) content.append(element("p", "subtitle", entry.downloads));
  content.append(element("p", "subtitle", row.plain));
  if (entry.url) leadTo(content, entry.url, "Source");
  else if (row.url) leadTo(content, row.url, row.source || row.url);
}

/* The rows under the grid that no score counts: a quiet heading across the
 * table, then one row per fact, named in plain text rather than as a button, so
 * nothing here reads as one more figure of the index. No colour and no letter,
 * since nothing here is ranked; each cell opens where its fact comes from, and
 * the note under the grid says what the rows are. */
function contextRows(noteNumber) {
  const context = state.overview.context;
  if (!context?.rows?.length) return [];
  // No heading: a rule like the one at the top of the grid, then the rows.
  return context.rows.map((row, index) => {
    const tr = element("tr", index === 0 ? "context-row context-first" : "context-row");
    tr.dataset.row = `context-${row.id}`;
    // A name that opens what the row is, in plain text until pointed at: it
    // explains the row and is no figure of the index.
    const name = element("button", "context-name", row.name);
    name.type = "button";
    name.setAttribute("aria-haspopup", "dialog");
    name.setAttribute("aria-expanded", "false");
    name.setAttribute("aria-label", `${row.name}: what it is, where it comes from, its limits`);
    name.addEventListener("click", () =>
      view.openPopover(name, content => aboutContextRow(content, context, row)));
    const label = element("span", "context-label");
    label.append(name);
    if (index === 0 && noteNumber) {
      const mark = element("span", "row-mark", String(noteNumber));
      mark.setAttribute("aria-hidden", "true");
      name.append(mark);
    }
    if (row.sub) label.append(element("span", "context-sub", row.sub));
    // Without a fold's button or its spacer before the name, so it starts
    // where a score's fold button would.
    const head = element("th");
    head.scope = "row";
    const line = element("div", "row-head");
    line.append(label);
    head.append(line);
    tr.append(head);
    state.companies.forEach(company => {
      const entry = context.companies?.[company.id]?.[row.id];
      if (!entry) {
        tr.append(element("td", "cell"));
        return;
      }
      const words = [entry.level ? `${entry.level === "-" ? 0 : entry.level.length} of 3`
                     : entry.shown === "-" ? "none" : entry.shown, entry.behind,
                     entry.level && company.openWeights ? "open weights" : null,
                     entry.band ? `${entry.band} a month` : null].filter(Boolean);
      const { cell, button } = view.cellButton({ lab: company.id, row: `context-${row.id}` },
        `${company.name}, ${row.name.toLowerCase()}: ${words.join(", ")}`,
        content => aboutContextCell(content, context, row, company, entry),
        "cell-button cell-context");
      if (entry.short) {
        // The model at the top and how far it trails the frontier at the
        // bottom, so both lines sit level across the row; a model at the
        // frontier is said in bold.
        button.append(element("span", "cell-context-words", entry.shown),
          element("span", entry.months_behind === 0 ? "cell-context-sub cell-context-lead"
            : "cell-context-sub", entry.short));
      } else if (Number.isFinite(entry.share)) {
        button.append(element("span", "cell-context-band", entry.shown));
      } else if (entry.level) {
        // Our rough estimate as three squares, filled one per step, all three
        // empty where there is nothing to go on.
        // Under the squares, whether anyone can download the company's
        // flagship model, as the governance board records it; the line keeps
        // its place when empty, so the squares sit level across the row.
        const open = element("span", "cell-context-open", company.openWeights ? "Open weights" : "\u00a0");
        if (!company.openWeights) open.setAttribute("aria-hidden", "true");
        button.append(usageMeter(entry.level), open);
      } else if (entry.band) {
        // A step of ten, in the data face, on one line.
        button.append(element("span", "cell-context-band", entry.band));
      } else if (entry.shown === "-") {
        // Nothing to show: a dash, and the popover says why.
        button.append(element("span", "cell-context-none", "-"));
      } else {
        button.append(element("span", "cell-context-words", entry.shown));
      }
      tr.append(cell);
    });
    return tr;
  });
}

/* ---- The table ----------------------------------------------------------- */

/* The notes a company's name points to, with their numbers: whether it
 * publishes a constitution, whether its flagship can be downloaded, and a note
 * of its own where the file has one. */
function nameNotesOf(company) {
  const { grid } = state.overview;
  const ids = [!company.publishes ? "no_constitution" : null,
               company.openWeights ? "open_weights" : null, company.id];
  return ids.filter(id => id && state.nameNoteNumbers?.[id]).map(id => {
    const note = grid.name_notes.find(item => item.id === id);
    return { number: state.nameNoteNumbers[id],
             spoken: id === company.id ? note.text : note.title };
  });
}

function headRow() {
  const row = element("tr");
  const corner = element("th", "row-col");
  corner.scope = "col";
  corner.append(
    element("span", "head-name", "Grade"),
    element("span", "head-sub", "companies by how their constitution is governed"));
  row.append(corner);
  state.companies.forEach(company => {
    const cell = element("th");
    cell.scope = "col";
    const button = element("button", "company-button");
    button.type = "button";
    button.dataset.lab = company.id;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    // What a reader of the grid would otherwise assume the other way is said in
    // the notes under it, and the name carries their numbers. The accessible
    // name says the notes' words, since the numbers are hidden from it.
    const notes = nameNotesOf(company);
    button.setAttribute("aria-label", `${company.name}`
      + `${notes.length ? `, ${notes.map(note => lowerFirst(note.spoken)).join(", ")}` : ""}`
      + ": what it publishes");
    button.append(companyMark(company.mark));
    const name = element("span", "company-name", company.name);
    if (notes.length) {
      const mark = element("span", "row-mark", notes.map(note => note.number).join(","));
      mark.setAttribute("aria-hidden", "true");
      name.append(mark);
    }
    button.append(name);
    button.addEventListener("click", () =>
      view.openPopover(button, content => aboutCompany(content, company)));
    cell.append(button);
    row.append(cell);
  });
  return row;
}

/* The fold a final score's rows sit in. */
const foldOf = group => `ovw-${group.final.board}`;

/* A row that adds up others, as a letter: painted where its threshold sits on
 * the ramp, or the unpainted word for nothing. Its figure out of 10 is in its
 * accessible name and in the popover it opens. */
function letterCell(company, { rowLabel, row, value, build, zero }) {
  const letter = letterOf(value);
  const { cell, button } = view.cellButton({ lab: company.id, row },
    `${company.name}, ${rowLabel}: ${letter ?? zero}, ${shown(value ?? 0)} out of ${TEN}`, build,
    letter ? "cell-button cell-grade" : "cell-button cell-grade cell-na");
  if (letter) view.paint(button, gradeValue(letter), TEN);
  button.append(element("span", "cell-figure", letter ?? zero));
  return cell;
}

/* One cell of a row borrowed from the Index, drawn by the overview's rule
 * (overview-rows.js): a total as a letter, a scored row on its own scale. */
function borrowedCell(company, row) {
  const shape = cellShape(row, state.overview.grid.grades);
  const dataset = { lab: company.id, row: row.row };
  if (shape.kind === "na") {
    return view.naCell({ name: company.name, rowLabel: row.rowLabel, dataset, build: row.build });
  }
  if (shape.kind === "scored") {
    return view.scoreCell({ name: company.name, rowLabel: row.rowLabel, value: shape.value,
      max: shape.max, text: shape.text, build: row.build, dataset });
  }
  return letterCell(company, { rowLabel: row.rowLabel, row: row.row, value: row.value,
    build: row.build, zero: noneWord() });
}

/* The rows each board of the Index shows under its final score, built by that
 * board's own code with this grid, its order of companies and its way of
 * drawing a cell. The note marks stay on the Index, where their notes are. */
function borrowedRows() {
  const columns = state.companies.map(company => company.id);
  const builders = { constitutions: constitutionRows, governance: governanceRows };
  return Object.fromEntries(state.overview.grid.groups.map(group => [
    group.final.board,
    builders[group.final.board](view, state.boards[group.final.board],
      { cell: borrowedCell, columns, parent: foldOf(group), marks: false }),
  ]));
}

/* A final score's row, drawn as the Index draws its own final score: its fold
 * opens onto the rows that board shows under it, and its cells are letters. */
function figureRow(group, borrowed) {
  const row = group.final;
  const tr = element("tr", "total-row outside-row");
  tr.dataset.level = "0";
  tr.dataset.row = row.figure;
  tr.append(view.rowHead(
    view.rowToggle(foldOf(group), borrowed.top, { parts: "rows", name: group.name }),
    view.rowName(group.name, null, content => aboutGroup(content, group),
      `${group.name}: what it measures`)));
  state.companies.forEach(company => {
    const value = company.figures[row.board][row.figure] ?? 0;
    tr.append(letterCell(company, { rowLabel: group.name.toLowerCase(), row: row.figure, value,
      build: content => aboutFinal(content, company, group, value),
      zero: row.zero || noneWord() }));
  });
  return tr;
}

/* The legend above the grid: one swatch per plain letter, A to G, so the strip
 * stays short; the pluses and minuses are in the scale it opens. */
function drawLegend() {
  const legend = document.createDocumentFragment();
  orderedGrades().filter(({ letter }) => letter.length === 1).forEach(({ letter }) => {
    legend.append(view.swatches([gradeValue(letter)], TEN), element("span", "", letter));
  });
  // The word an empty cell of the grid says, so the scale and the cells agree,
  // and its swatch is as unpainted as the cell.
  const none = element("span", "swatches");
  none.append(element("span", "swatch swatch-na"));
  legend.append(none, element("span", "", noneWord()));
  byId("ovw-legend").replaceChildren(legend);
}

function draw() {
  const { grid } = state.overview;
  byId("ovw-caption").textContent = grid.caption;
  // The numbered notes the marks on the page point to, in the order the marks
  // come: the file's own notes, which the introduction points to, then the
  // context's sources.
  const context = state.overview.context;
  const shownContext = state.showContext ? context : null;
  // The notes the names point to, lettered rather than numbered so they are not
  // taken for the page's own notes, and only those some company carries.
  const every = grid.name_notes || [];
  const carried = every.filter(note => state.companies.some(company =>
    [!company.publishes ? "no_constitution" : null,
     company.openWeights ? "open_weights" : null, company.id].includes(note.id)));
  // A note may name its own sign, such as an asterisk; the others are lettered.
  state.nameNoteNumbers = Object.fromEntries(carried.map((note, index) =>
    [note.id, note.mark || String.fromCharCode(97 + index)]));
  const lettered = byId("ovw-name-notes");
  lettered.hidden = !carried.length;
  lettered.replaceChildren(...carried.map(({ id, title, text }) => {
    const item = element("li");
    item.append(element("span", "name-note-mark", state.nameNoteNumbers[id]),
                element("strong", "", `${title}. `));
    renderInline(item, text);
    return item;
  }));
  // In the order their marks come down the page: the file's own notes, then
  // the context's under the grid.
  const notes = [...(grid.notes || []),
                 ...(shownContext?.note ? [{ title: context.name, text: context.note }] : [])];
  const contextNote = shownContext?.note ? (grid.notes || []).length + 1 : null;
  view.nodes.table.tHead.replaceChildren(headRow());
  // The overall grade, then each final score and the rows its board of the
  // Index shows under it, then the views in preparation and the context.
  const borrowed = borrowedRows();
  view.nodes.table.tBodies[0].replaceChildren(
    ...(grid.overall ? [overallRow()] : []),
    ...grid.groups.flatMap(group => [figureRow(group, borrowed[group.final.board]),
                                     ...borrowed[group.final.board].rows]),
    ...(grid.coming || []).map(comingRow),
    ...contextRows(contextNote));
  // Every borrowed row starts shut, whatever its board left open: shutting a
  // fold sets every row under every fold from what is open, which is nothing.
  grid.groups.forEach(group => view.setExpanded(foldOf(group), false));
  byId("ovw-hint").textContent = grid.hint;
  byId("ovw-notes").replaceChildren(...notes.map(({ title, text }, index) => {
    const item = element("li");
    item.id = `ovw-note-${index + 1}`;
    item.append(element("strong", "", `${title}. `));
    renderInline(item, text);
    return item;
  }));
  drawLegend();
}

function drawTakeaways(takeaways) {
  byId("ovw-takeaways").replaceChildren(...takeaways.map(({ title, text }) => {
    const item = element("article", "ovw-takeaway");
    item.append(element("h3", "", title));
    renderMarkup(item, text);
    return item;
  }));
}

export async function initializeOverview() {
  const status = byId("ovw-status");
  const [overview, constitutions, governance] = await Promise.all(
    ["overview", "constitutions", "governance"].map(loadBoard));
  // A publication frozen before the letters carries no thresholds, and is not
  // drawn rather than drawn with letters it was never built with.
  if (overview?.format !== FORMAT || !overview.page || !Array.isArray(overview.grid?.grades)
      || !overview.grid.grades.length || !overview.grid.every_row
      || !constitutions?.companies || !governance?.labs) {
    status.textContent = INCOMPATIBLE;
    return;
  }
  view = createBoard({
    nodes: { table: byId("ovw-grid"), pop: byId("ovw-pop"), expandAll: byId("ovw-expand-all") },
    everyRow: overview.grid.every_row,
  });
  try {
    needed().forEach(node => { node.hidden = false; });
    renderPage("ovw", overview.page);
    state = { overview, companies: companiesOf(constitutions, governance, overview),
              boards: { constitutions, governance }, showContext: true };
    draw();
    drawTakeaways(overview.takeaways || []);
    renderMenu(document.getElementById("view-overview"));
  } catch (error) {
    console.error(error);
    needed().forEach(node => { node.hidden = true; });
    status.textContent = INCOMPATIBLE;
    return;
  }
  view.wirePopover([byId("ovw-chart")]);
  // The legend is drawn again with the grid, and keeps its one listener.
  const legend = byId("ovw-legend");
  legend.addEventListener("click", () => view.openPopover(legend, aboutScale));
  view.nodes.expandAll.addEventListener("click", () => view.expandEvery());
  // A source code in a popover borrowed from the governance board names an
  // entry under that board's "Sources reviewed", which the overview does not
  // carry. Each such link is rewritten once it appears, to open there in a new
  // tab (the Index scrolls to the entry and marks it), so a middle-click or a
  // copied link goes to the Index as well, and not to a "#src-" that is nowhere
  // on this page.
  const pop = byId("ovw-pop");
  new MutationObserver(() => {
    pop.querySelectorAll('a[href^="#src-"]').forEach(link => {
      const spoken = link.getAttribute("aria-label") || link.textContent;
      link.setAttribute("aria-label", `${spoken}, in the Index, in a new tab`);
      link.href = `/index?view=governance${link.getAttribute("href")}`;
      link.target = "_blank";
      link.rel = "noopener";
    });
  }).observe(pop, { childList: true, subtree: true });

  status.textContent = "";
}

initializeOverview();
