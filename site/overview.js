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
         ranked as governanceRanked, sourcesInto, showSource } from "./governance.js";
import { cellShape } from "./overview-rows.js";
import { companyMark } from "./company-marks.js";
import { renderMenu } from "./page-menu.js";
import { gradeOf, paintAt, overallOf, overallOrder } from "./grades.js";

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
  const companies = governance.labs.map(lab => {
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
  });
  // Ordered by the overall grade, the higher letter first and then the higher
  // figure, and by the governance ranking where two are level.
  const { groups, grades } = overview.grid;
  const overall = company => overallOf(groups.map(group =>
    company.figures[group.final.board][group.final.figure] ?? 0), grades);
  return companies.sort((a, b) => overallOrder(overall(a), overall(b), grades)
    || order.indexOf(a.id) - order.indexOf(b.id));
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

/* A figure's letter: 0.0 is a G, and only a figure nobody gave has none. */
const letterOf = value => gradeOf(value, state.overview.grid.grades);

/* The file's grades, highest threshold first. */
const orderedGrades = () => [...state.overview.grid.grades].sort((a, b) => b.from - a.from);

/* Where a letter sits on the boards' colour ramp: at its own threshold, so it
 * wears the colour that figure wears in the Index, unless its text would fall
 * below WCAG AA there (paintAt in grades.js). A figure of 0.0 is a G and wears
 * G's colour, like any other. */
function gradeValue(letter) {
  const grade = state.overview.grid.grades.find(candidate => candidate.letter === letter);
  return grade ? paintAt(grade.from) : 0;
}

/* A final score's letter as a chip, painted where the grid paints it. */
function gradeChip(value) {
  const letter = letterOf(value);
  return view.chip(gradeValue(letter), TEN, letter);
}

/* A company's overall grade: the average of its final scores, no higher than F
 * where either fails (overallOf in grades.js). */
const overallFor = company => overallOf(
  state.overview.grid.groups.map(group => company.figures[group.final.board][group.final.figure] ?? 0),
  state.overview.grid.grades);

/* The letter large, and the figure behind it, at the head of a popover. */
const gradeFigure = value =>
  view.figure(letterOf(value), `, ${shown(value)} out of ${TEN}`);

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
  content.append(view.h3("What it is made of"), everyScore(content),
                 scoreTree(company, foldOf(group)));
  if (final.board === "constitutions") caveatOf(content, company);
}

/* A company's scores under one fold of the grid, as a tree a popover opens in
 * place: read from the grid's own rows and cells, so the popover shows the very
 * letters and figures the grid does, and every level the grid opens to. */
function scoreTree(company, fold) {
  const list = element("ul", "ovw-tree");
  [...view.nodes.table.tBodies[0].rows]
    .filter(row => row.dataset.parent === fold)
    .forEach(row => list.append(treeItem(company, row)));
  return list;
}

/* One row of the grid as a branch of a company's tree: its chip, its name, its
 * scale, and the rows under it folded, if it has any. */
function treeItem(company, row) {
  const cell = [...row.querySelectorAll(".cell-button")].find(one => one.dataset.lab === company.id);
  const head = element("span", "ovw-tree-head");
  head.append(treeChip(cell),
    element("span", "ovw-tree-name", row.querySelector(".head-name")?.textContent || ""));
  const scale = row.querySelector(".row-scale")?.textContent;
  if (scale) head.append(element("span", "row-scale", scale));
  const item = element("li");
  const own = row.querySelector(".row-toggle")?.dataset.question;
  if (!own) {
    item.append(head);
    return item;
  }
  const branch = element("details", "ovw-tree-fold");
  const summary = element("summary");
  summary.append(head);
  branch.append(summary, scoreTree(company, own));
  item.append(branch);
  return item;
}

/* A cell's letter or figure as a chip in its own colour: copied from the cell,
 * so the tree and the grid cannot differ. */
function treeChip(cell) {
  const text = cell?.querySelector(".cell-figure")?.textContent ?? cell?.textContent?.trim() ?? "";
  const chip = element("span", "chip ovw-tree-chip", text);
  if (cell?.classList.contains("cell-na")) chip.classList.add("chip-na");
  else if (cell) {
    chip.style.background = cell.style.background;
    chip.style.color = cell.style.color;
  }
  return chip;
}

/* A button that opens or shuts every branch of the trees in one popover. */
function everyScore(content) {
  const button = view.popButton("Show every score", () => {
    const open = button.textContent === "Show every score";
    content.querySelectorAll("details.ovw-tree-fold").forEach(branch => { branch.open = open; });
    button.textContent = open ? "Hide every score" : "Show every score";
  });
  button.classList.add("ovw-tree-all");
  return button;
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
}

/* A company: the whole picture in a few sentences, its two final scores, and
 * the way to its profile on each board of the Index. */
function aboutCompany(content, company) {
  view.titled(content, company.name);
  content.append(overallLine(company));
  const profile = company.summary.profile;
  if (profile) renderMarkup(content, profile);
  // Its two final scores, each opening into every score under it, as the grid
  // does.
  const scores = element("ul", "ovw-tree");
  state.overview.grid.groups.forEach(group => {
    const row = [...view.nodes.table.tBodies[0].rows]
      .find(one => one.dataset.level === "0" && one.dataset.row === group.final.figure);
    if (row) scores.append(treeItem(company, row));
  });
  content.append(view.h3("Its scores"), everyScore(content), scores);
  caveatOf(content, company);
  if (company.document) {
    leadTo(content, `/doc-reader/?spec=${encodeURIComponent(company.document.id)}`,
      `Read ${company.document.title} in the Doc reader`);
  }
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

/* Whether a company's overall grade is held at F by an F or a G on one of its
 * two scores, below the letter its average alone would earn. */
function heldAtF(company) {
  const { value, letter } = overallFor(company);
  return letter !== letterOf(value);
}

/* One line on a company's overall grade, at the head of its popover: the letter,
 * the figure, and the two scores it averages; and, where an F or a G on either
 * holds it at F, which score does and what the average alone would have been. */
function overallLine(company) {
  const { value, letter } = overallFor(company);
  const halves = state.overview.grid.groups.map(group => {
    const figure = company.figures[group.final.board][group.final.figure] ?? 0;
    return { name: group.name.toLowerCase(), figure, letter: letterOf(figure) };
  });
  const averaged = halves.map(half => `${half.name} (${half.letter}, ${shown(half.figure)})`)
    .join(" and ");
  const line = element("p", "ovw-overall-line");
  line.append(element("strong", "", `Overall grade ${letter}`));
  const unheld = letterOf(value);
  if (unheld === letter) {
    line.append(document.createTextNode(`, ${shown(value)} out of ${TEN}: the average of ${averaged}.`));
    return line;
  }
  // "an E", "an F", "a G": the article a letter takes when read aloud.
  const article = grade => (/^[AEF]/.test(grade) ? `an ${grade}` : `a ${grade}`);
  const failing = halves.filter(half => half.letter === "F" || half.letter === "G");
  line.append(document.createTextNode(`. The average of ${averaged} is ${shown(value)}, `
    + `${article(unheld)}, but its ${failing.map(half => half.name).join(" and ")} score is `
    + `${failing.map(half => article(half.letter)).join(" and ")}, and a company with an F or a G `
    + `on either score gets no more than F.`));
  return line;
}

/* How the overall grade is worked out, in the file's words. */
function aboutOverall(content) {
  const { overall } = state.overview.grid;
  view.titled(content, overall.name);
  renderMarkup(content, overall.plain);
}

/* The overall grade, the first row of the grid: a quiet band rather than a row
 * of painted cells, since it is read from the two letters under it and adds no
 * figure of its own. Each cell is the letter with its figure beside it, small,
 * and opens the company's popover. Nothing folds under it. */
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
    // Seen as "C+ (7.5)", heard as "C+, 7.5 out of 10". A press opens the
    // company's popover, as its name does, which starts with this grade.
    const button = element("button", "ovw-overall-button");
    button.type = "button";
    button.dataset.lab = company.id;
    button.dataset.row = "overall";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", `${company.name}, overall grade: ${letter}, `
      + `${shown(value)} out of ${TEN}`);
    button.append(element("span", "ovw-overall-letter", letter),
                  element("span", "ovw-overall-figure", `(${shown(value)})`));
    // An F the average alone would not give carries the mark of the note
    // saying why, seen after the figure and said in the button's name.
    const held = heldAtF(company) && state.nameNoteNumbers?.capped;
    if (held) {
      const mark = element("span", "row-mark ovw-overall-mark", held);
      mark.setAttribute("aria-hidden", "true");
      button.append(mark);
      button.setAttribute("aria-label", `${button.getAttribute("aria-label")}, held at F `
        + "because one of its two scores is an F or a G");
    }
    button.addEventListener("click", () =>
      view.openPopover(button, content => aboutCompany(content, company)));
    cell.append(button);
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
    element("span", "head-sub", "companies by overall grade"));
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

/* A row that adds up others, as a letter, painted where its threshold sits on
 * the ramp: a figure of 0.0 is a G like any other. Its figure out of 10 is in
 * its accessible name and in the popover it opens. */
function letterCell(company, { rowLabel, row, value, build }) {
  const letter = letterOf(value);
  const { cell, button } = view.cellButton({ lab: company.id, row },
    `${company.name}, ${rowLabel}: ${letter}, ${shown(value)} out of ${TEN}`, build,
    "cell-button cell-grade");
  view.paint(button, gradeValue(letter), TEN);
  button.append(element("span", "cell-figure", letter));
  return cell;
}

/* One cell of a row borrowed from the Index, drawn by the overview's rule
 * (overview-rows.js): a total as a letter, a scored row on its own scale, and a
 * row with no figure as NA. */
function borrowedCell(company, row) {
  const shape = cellShape(row, state.overview.grid.grades);
  const dataset = { lab: company.id, row: row.row };
  if (shape.kind === "na") {
    return view.naCell({ name: company.name, rowLabel: row.rowLabel, dataset, build: row.build });
  }
  if (shape.kind === "scored") {
    // The scale is said once, after the row's name (scaleAfterName), not in
    // every cell; the cell's accessible name still says it.
    return view.scoreCell({ name: company.name, rowLabel: row.rowLabel, value: shape.value,
      max: shape.max, text: shape.text, build: row.build, dataset, showMax: false });
  }
  return letterCell(company, { rowLabel: row.rowLabel, row: row.row, value: row.value,
    build: row.build });
}

/* A scored row's scale, "/4", "/2" or "/10", small and quiet on the line of its
 * name, after it: read from the cells the row carries, which hold it whether
 * or not they show it. A row of letters carries none. It is seen only; each
 * cell's accessible name already says what the figure is out of. */
function scaleAfterName(tr) {
  const max = tr.querySelector(".cell-button[data-max]")?.dataset.max;
  const line = tr.querySelector(".head-line");
  if (!max || !line) return;
  const mark = element("span", "row-scale", `/${max}`);
  mark.setAttribute("aria-hidden", "true");
  line.append(mark);
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
      build: content => aboutFinal(content, company, group, value) }));
  });
  return tr;
}

/* The key under the grid: one bar per plain letter, A to G, painted where the
 * grid paints that letter, with the letter on it and the file's few words on
 * what it means under it (grid.grade_words). The pluses and minuses, and the
 * figures each letter covers, are in the scale it opens. The bars are seen; the
 * same words are its description, so a screen reader hears them after the
 * button's name. */
function drawLegend() {
  const words = state.overview.grid.grade_words || {};
  const letters = orderedGrades().filter(({ letter }) => letter.length === 1);
  const list = element("span", "ovw-key-list");
  list.setAttribute("aria-hidden", "true");
  letters.forEach(({ letter }) => {
    const item = element("span", "ovw-key-item");
    const bar = element("span", "ovw-key-bar", letter);
    view.paint(bar, gradeValue(letter), TEN);
    item.append(bar);
    list.append(item);
  });
  const spoken = element("span", "visually-hidden", letters
    .map(({ letter }) => (words[letter] ? `${letter}, ${lowerFirst(words[letter])}` : letter))
    .join("; "));
  spoken.id = "ovw-legend-words";
  byId("ovw-legend").replaceChildren(list, spoken);
}

/* What the key opens: every letter with the figures out of 10 it covers, from
 * its threshold up to the tenth below the next one. */
function aboutScale(content) {
  const words = state.overview.grid.grade_scale || {};
  view.titled(content, words.title || "The grading scale");
  if (words.text) renderMarkup(content, words.text);
  const list = element("ul", "check-list ovw-scale-list");
  let next = null;
  orderedGrades().forEach(({ letter, from }) => {
    const low = Math.max(from, 0);
    const high = next === null ? TEN : next - 0.1;
    const item = element("li");
    item.append(view.chip(gradeValue(letter), TEN, letter),
                element("span", "ovw-scale-range", `${low.toFixed(1)} to ${high.toFixed(1)}`));
    // What a plain letter means, beside its range: the key under the grid
    // shows only the letters, and this is where their words are read.
    const meaning = (state.overview.grid.grade_words || {})[letter];
    if (meaning) item.append(element("span", "ovw-scale-words", meaning));
    list.append(item);
    next = from;
  });
  content.append(list);
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
  // "capped" is the note an overall grade held at F points to.
  const carried = every.filter(note => state.companies.some(company =>
    [!company.publishes ? "no_constitution" : null,
     company.openWeights ? "open_weights" : null, company.id,
     heldAtF(company) ? "capped" : null].includes(note.id)));
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
  Object.values(borrowed).forEach(({ rows }) => rows.forEach(scaleAfterName));
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

/* Every source the overview's cells cite, in the page's last section, laid out
 * as the governance board lays out its own: its sources, drawn by its own code
 * (sourcesInto), then those of the context rows, each opening in its own tab. */
function drawSources() {
  const node = byId("ovw-source-list");
  if (!node) return;
  sourcesInto(node);
  const context = state.overview.context;
  const list = element("ul", "source-list ovw-context-sources");
  const linked = (text, url) => {
    const link = element("a", "", text);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    return link;
  };
  (context?.rows || []).forEach(row => {
    if (row.url) {
      const item = element("li", "source-entry");
      item.append(element("strong", "", `${row.name}. `), linked(row.source || row.url, row.url));
      list.append(item);
    }
  });
  state.companies.forEach(company => {
    const entry = context?.companies?.[company.id] || {};
    Object.values(entry).forEach(part => (part?.signals || []).filter(signal => signal.url)
      .forEach(signal => {
        const item = element("li", "source-entry");
        item.append(element("strong", "", `${company.name}. `), linked(signal.text, signal.url));
        list.append(item);
      }));
  });
  if (list.children.length) node.append(element("h3", "", context?.name || "For context"), list);
  citedIn(node);
}

/* Every cell of the grid that cites a source, from the governance file the
 * grid's rows were built from: a check's or a practice's evidence, a practice
 * no outsider can see, or a figure's reading. Keyed by the source's code, each
 * cell as the grid addresses it, by company and row. */
function citationsOf(governance) {
  const cited = new Map();
  const codesIn = value => {
    const codes = new Set();
    const walk = part => {
      if (typeof part === "string") {
        for (const match of part.matchAll(/\[\^([A-Z]{2}\d+)\]/g)) codes.add(match[1]);
      } else if (Array.isArray(part)) part.forEach(walk);
      else if (part && typeof part === "object") {
        if (typeof part.ref === "string") codes.add(part.ref);
        Object.values(part).forEach(walk);
      }
    };
    walk(value);
    return codes;
  };
  const add = (code, lab, row) => {
    const list = cited.get(code) || [];
    if (!list.some(cell => cell.lab === lab && cell.row === row)) list.push({ lab, row });
    cited.set(code, list);
  };
  [governance.evidence, governance.internal_evidence, governance.column_readings]
    .forEach(byLab => Object.entries(byLab || {}).forEach(([lab, rows]) =>
      Object.entries(rows || {}).forEach(([row, entry]) =>
        codesIn(entry).forEach(code => add(code, lab, row)))));
  return cited;
}

/* Under each source, the cells that cite it, each a button that opens the rows
 * down to that cell and opens its popover, in the order of the grid's columns
 * and rows. */
function citedIn(node) {
  const governance = state.boards.governance;
  const cited = citationsOf(governance);
  const names = new Map([
    ...(governance.columns || []).map(column => [column.id, column.name]),
    ...(governance.questions || []).flatMap(question => question.checks.map(check => [check.id, check.short])),
    ...[...(governance.supporting || []), ...(governance.internal || [])].map(practice => [practice.id, practice.short]),
  ]);
  const order = state.companies.map(company => company.id);
  const rowOrder = [...names.keys()];
  node.querySelectorAll(".source-entry[id^='src-']").forEach(entry => {
    const cells = (cited.get(entry.id.slice("src-".length)) || [])
      .filter(cell => order.includes(cell.lab) && names.has(cell.row))
      .sort((a, b) => order.indexOf(a.lab) - order.indexOf(b.lab)
        || rowOrder.indexOf(a.row) - rowOrder.indexOf(b.row));
    if (!cells.length) return;
    // The company named once, then its cells: "OpenAI: transparency, ...".
    const line = element("p", "source-cited");
    line.append(document.createTextNode("Cited in "));
    const labs = [...new Set(cells.map(cell => cell.lab))];
    labs.forEach((lab, at) => {
      if (at) line.append(document.createTextNode("; "));
      const company = state.companies.find(one => one.id === lab);
      line.append(document.createTextNode(`${company.name}: `));
      cells.filter(cell => cell.lab === lab).forEach((cell, index) => {
        if (index) line.append(document.createTextNode(", "));
        const button = element("button", "inline-button", names.get(cell.row).toLowerCase());
        button.type = "button";
        button.setAttribute("aria-label", `${company.name}, ${names.get(cell.row).toLowerCase()}: open its cell`);
        button.addEventListener("click", () => view.pressCell({ lab: cell.lab, row: cell.row }));
        line.append(button);
      });
    });
    const meta = entry.querySelector(".source-meta") || entry.querySelector(".source-head");
    if (meta) meta.after(line);
    else entry.append(line);
  });
}

/* Under the source a code led to, the way back: to the cell the code was
 * pressed in, scrolled into view and its popover opened again. One at a time;
 * it goes once used. */
function offerWayBack(entry, from) {
  if (!entry || !from) return;
  document.querySelectorAll("#view-overview .source-back").forEach(button => button.remove());
  // Named after the cell, from the first part of its accessible name.
  const place = (from.getAttribute("aria-label") || "").split(":")[0].trim();
  const back = element("button", "gov-button source-back",
    place ? `Back to ${place}` : "Back to where you were");
  back.type = "button";
  back.addEventListener("click", () => {
    back.remove();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    from.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
    setTimeout(() => from.click(), still ? 0 : 400);
  });
  // At the top of the entry, under its title, where the eye lands.
  const head = entry.querySelector(".source-head");
  if (head) head.after(back);
  else entry.prepend(back);
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
    drawSources();
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
  // A link in the page to a folded section, such as "How we score" in the
  // introduction, opens the section as the side menu does, rather than
  // scrolling to it shut.
  byId("view-overview").addEventListener("click", event => {
    const link = event.target.closest?.('a[href^="#"]');
    const target = link && document.getElementById(link.getAttribute("href").slice(1));
    const fold = target && (target.tagName === "DETAILS" ? target
      : target.querySelector(":scope > details.section-fold"));
    if (!fold) return;
    event.preventDefault();
    fold.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // A source code in a popover leads to its entry under Sources, at the foot of
  // this page, which offers the way back to the cell it was pressed in. The
  // cell is read before the popover shuts, since shutting it forgets it.
  byId("ovw-pop").addEventListener("click", event => {
    const link = event.target.closest?.('a[href^="#src-"]');
    if (!link) return;
    const from = document.querySelector("#view-overview .is-open");
    const code = link.getAttribute("href").slice("#src-".length);
    if (!showSource(code)) return;
    event.preventDefault();
    offerWayBack(document.getElementById(`src-${code}`), from);
  });

  status.textContent = "";
}

initializeOverview();
