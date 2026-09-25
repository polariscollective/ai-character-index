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
 * figure relative to the best on its row by default, which is the reading a
 * newcomer needs, or as the score out of 10 the Index gives. A cell opens what
 * the figure means and leads to the board that explains it.
 */

import { INCOMPATIBLE, loadBoard } from "./publication-data.js";
import { FORMAT, renderPage } from "./page-content.js";
import { renderMarkup, renderInline } from "./markup.js";
import { createBoard, element } from "./board.js";
import { figuresOf, partsOf as constitutionParts } from "./constitutions.js";
import { totalsFor, partsOf as governanceParts } from "./governance.js";
import { companyMark } from "./company-marks.js";
import { renderMenu } from "./page-menu.js";

const TEN = 10;
const MODE_KEY = "aci-overview-mode";

const byId = id => document.getElementById(id);
const needed = () => document.querySelectorAll("#view-overview [data-needs-board]");
const shown = value => value.toFixed(1);

/* One company's four figures, and whether it publishes a constitution. The
 * constitutions board names each company's newest document under the company's
 * id; an earlier version carries an id of its own and is left out here, as the
 * board leaves it out of its columns. Companies are in alphabetical order: the
 * overview ranks nobody, the boards of the Index do. */
function companiesOf(constitutions, governance, overview) {
  return governance.labs.map(lab => {
    const written = constitutions.companies.find(company => company.id === lab.id);
    const said = written ? figuresOf(constitutions, written) : { final: 0, whole: 0, behaviours: 0 };
    const governed = totalsFor(governance, lab.id);
    return {
      id: lab.id,
      name: lab.name,
      mark: lab.mark ?? written?.mark,
      // What each figure is made of, by the functions the boards list it with.
      parts: {
        whole: written ? constitutionParts(constitutions, written, "whole") : [],
        behaviours: written ? constitutionParts(constitutions, written, "behaviours") : [],
        published: governanceParts(governance, lab.id, "published"),
        engages: governanceParts(governance, lab.id, "engages"),
      },
      // The overview's own words about this company: a summary of everything
      // under each figure, written for this page and not copied from the Index.
      summary: overview.summaries?.[lab.id] || {},
      publishes: Boolean(written?.document),
      document: written?.document || null,
      figures: {
        constitutions: { final: said.final ?? 0, whole: said.whole, behaviours: said.behaviours },
        governance: { total: governed.total, ...governed.byColumn },
      },
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "en"));
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

/* A list of figures, each a chip and a name. */
/* A list of figures, each a chip and a name. A figure this table carries opens
 * its cell here (`cell` and `open`); a figure only the Index carries leads to its
 * cell there (`href`). */
function figureList(items) {
  const list = element("ul", "check-list");
  items.forEach(({ value, name, cell, open, href }) => {
    const item = element("li");
    item.append(view.chip(value, TEN, shown(value)));
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
    list.append(item);
  });
  return list;
}

/* Every figure on one row of this table, and the best of them. */
function rowFigures(row) {
  const values = state.companies.map(company => company.figures[row.board][row.figure] ?? 0);
  return { values, best: Math.max(...values) };
}

/* What a press on one cell of this table opens. */
function cellOpener(company, group, row, final) {
  const value = company.figures[row.board][row.figure] ?? 0;
  const { best } = rowFigures(row);
  return final
    ? content => aboutFinal(content, company, group, value, best)
    : content => aboutCell(content, company, group, row, value, best);
}

/* Where in the Index a part of one of this table's figures lives. */
const indexCell = (company, row, part) => (row.board === "governance"
  ? `/index?view=governance&company=${company.id}&cell=${encodeURIComponent(part.row)}`
  : `/index?company=${company.id}&cell=${encodeURIComponent(part.row)}`);

/* A figure's tier: its share of the best figure on its row, against the
 * thresholds the file gives, highest first. A zero has no tier; it has the
 * row's own word for nothing. */
function tierOf(value, best, tiers) {
  if (value <= 0 || best <= 0) return null;
  return tiers.findIndex(tier => value / best >= tier.from - 1e-9);
}

/* Where a tier sits on the boards' colour ramp: the best at its top, the others
 * spread evenly below, so the two modes speak one colour language. */
const tierValue = (index, count) => TEN * (1 - index / count);

let view = null;
let state = null;

/* ---- The popovers -------------------------------------------------------- */

function leadTo(content, href, text) {
  const line = element("p", "ovw-pop-link");
  const link = element("a", "", text);
  link.href = href;
  line.append(link);
  content.append(line);
}

/* The same popover the cell of the Index opens, in short: the figure, why the
 * company stands there, and what the figure is made of. */
function aboutCell(content, company, group, row, value, best) {
  const { grid } = state.overview;
  const tier = tierOf(value, best, grid.tiers);
  view.titled(content, `${company.name}: ${row.name.toLowerCase()}`, row.plain);
  content.append(view.figure(shown(value), ` out of ${TEN}`));
  content.append(element("p", "subtitle", tier === null
    ? "Nothing to score on this row."
    : `${grid.tiers[tier].name}: the best score on this row is ${shown(best)} out of ${TEN}.`));
  // What everything under this figure adds up to, in the overview's own words.
  const reason = summaryOf(company, row.figure, row.board);
  if (reason) renderMarkup(content, reason);
  const parts = company.parts[row.figure] || [];
  if (parts.length && value > 0) {
    content.append(view.h3("What it is made of"), figureList(parts.map(part =>
      ({ ...part, href: part.row ? indexCell(company, row, part) : null }))));
  }
  // A note on this one figure, where a reader will ask why it is what it is.
  const note = company.summary.notes?.[row.figure];
  if (note) {
    const said = element("p", "subtitle ovw-caveat");
    said.append(element("strong", "", "A note on this figure. "), document.createTextNode(note));
    content.append(said);
  }
  leadTo(content, group.href, "See every part of this score in the Index");
}

/* A final score: the figure, what everything under it adds up to, and its two
 * halves. One press, the whole picture. */
function aboutFinal(content, company, group, value, best) {
  const { grid } = state.overview;
  const final = group.final;
  const tier = tierOf(value, best, grid.tiers);
  view.titled(content, `${company.name}: ${group.name.toLowerCase()}`, final.plain);
  content.append(view.figure(shown(value), ` out of ${TEN}`));
  content.append(element("p", "subtitle", tier === null
    ? "Nothing to score on this row."
    : `${grid.tiers[tier].name}: the best score on this row is ${shown(best)} out of ${TEN}.`));
  const reason = summaryOf(company, final.board, final.board);
  if (reason) renderMarkup(content, reason);
  content.append(view.h3("What it is made of"), figureList(group.rows.map(row =>
    ({ value: company.figures[row.board][row.figure] ?? 0, name: row.name,
       cell: { lab: company.id, row: row.figure }, open: cellOpener(company, group, row, false) }))));
  if (final.board === "constitutions") caveatOf(content, company);
  leadTo(content, group.href, "See every part of this score in the Index");
}

function aboutGroup(content, group) {
  view.titled(content, group.name);
  content.append(element("p", "", group.final.plain));
  leadTo(content, group.href, "See every company's score in the Index");
}

function aboutRow(content, group, row) {
  view.titled(content, row.name, group.name);
  content.append(element("p", "", row.plain));
  content.append(element("p", "subtitle", state.overview.grid.relative_note));
  leadTo(content, group.href, `See every company's score in the Index`);
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
       open: cellOpener(company, group, group.final, true) }))));
  caveatOf(content, company);
  if (company.document) {
    leadTo(content, `/doc-reader/?spec=${encodeURIComponent(company.document.id)}`,
      `Read ${company.document.title} in the Doc reader`);
  }
  leadTo(content, `/index?company=${company.id}`,
    "See its figures on what the constitutions say");
  leadTo(content, `/index?view=governance&company=${company.id}`,
    "See its figures on how constitutions are governed");
}

/* ---- The table ----------------------------------------------------------- */

function headRow() {
  const row = element("tr");
  const corner = element("th", "row-col");
  corner.scope = "col";
  corner.append(
    element("span", "head-name", state.mode === "absolute" ? "Score (out of 10)" : "Standing"),
    element("span", "head-sub", "companies in alphabetical order"));
  row.append(corner);
  state.companies.forEach(company => {
    const cell = element("th");
    cell.scope = "col";
    const button = element("button", "company-button");
    button.type = "button";
    button.dataset.lab = company.id;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", `${company.name}: what it publishes`);
    button.append(companyMark(company.mark));
    button.append(element("span", "company-name", company.name));
    button.addEventListener("click", () =>
      view.openPopover(button, content => aboutCompany(content, company)));
    cell.append(button);
    row.append(cell);
  });
  return row;
}

/* One row of figures, a level below where the Index puts it, so the page reads
 * as a summary rather than a second board: the final score of a group is drawn
 * as the Index draws the document as a whole (level 1), and its halves as the
 * Index draws a category (level 2), set in by the space the Index keeps for a
 * fold. There is nothing to fold here, so the space alone shows which figures a
 * final score is made of. */
function figureRow(group, row, final) {
  const { grid } = state.overview;
  const tr = element("tr", final ? "total-row outside-row half-row" : "question-row");
  tr.dataset.level = final ? "1" : "2";
  tr.dataset.row = row.figure;
  if (final) {
    const head = element("th");
    head.scope = "row";
    const line = element("div", "row-head");
    line.append(view.rowName(group.name, null,
      content => aboutGroup(content, group), `${group.name}: what it measures`));
    head.append(line);
    tr.append(head);
  } else {
    tr.append(view.rowHead(null, view.rowName(row.name, null,
      content => aboutRow(content, group, row), `${row.name}: what it measures`)));
  }
  const { values, best } = rowFigures(row);
  state.companies.forEach((company, index) => {
    const value = values[index];
    const build = final
      ? content => aboutFinal(content, company, group, value, best)
      : content => aboutCell(content, company, group, row, value, best);
    const dataset = { lab: company.id, row: row.figure };
    const tier = tierOf(value, best, grid.tiers);
    const label = final ? group.name : row.name;
    if (state.mode === "absolute") {
      tr.append(view.scoreCell({ name: company.name, rowLabel: label.toLowerCase(), value,
        max: TEN, text: shown(value), build, dataset, showMax: false }));
      return;
    }
    const words = tier === null ? row.zero : grid.tiers[tier].name;
    const { cell, button } = view.cellButton(dataset,
      `${company.name}, ${label.toLowerCase()}: ${words.toLowerCase()}, `
      + `${shown(value)} out of ${TEN}`, build, "cell-button cell-tier");
    view.paint(button, tier === null ? 0 : tierValue(tier, grid.tiers.length), TEN);
    button.append(element("span", "cell-words", words));
    tr.append(cell);
  });
  return tr;
}

function drawLegend() {
  const { grid } = state.overview;
  const legend = document.createDocumentFragment();
  if (state.mode === "absolute") {
    legend.append(element("span", "", "none (0)"), view.swatches([0, 2.5, 5, 7.5, 10], TEN),
      element("span", "", "all (10)"));
  } else {
    grid.tiers.forEach((tier, index) => {
      legend.append(view.swatches([tierValue(index, grid.tiers.length)], TEN),
        element("span", "", tier.name));
    });
    legend.append(view.swatches([0], TEN), element("span", "", "nothing"));
  }
  byId("ovw-legend").replaceChildren(legend);
}

function draw() {
  const { grid } = state.overview;
  byId("ovw-caption").textContent = grid.caption;
  view.nodes.table.tHead.replaceChildren(headRow());
  view.nodes.table.tBodies[0].replaceChildren(...grid.groups.flatMap(group =>
    [figureRow(group, group.final, true), ...group.rows.map(row => figureRow(group, row, false))]));
  byId("ovw-mode-note").textContent = grid.hint;
  // The numbered notes the marks on the page point to, in the order the marks
  // come: the file's own notes, which the introduction points to, then the
  // relative mode's, whose mark is on its button below them.
  const notes = [...(grid.notes || []), { title: "Relative", text: grid.relative_note }];
  const relativeMark = document.querySelector('.ovw-mode [data-mode="relative"] .row-mark');
  if (relativeMark) relativeMark.textContent = String(notes.length);
  byId("ovw-notes").replaceChildren(...notes.map(({ title, text }, index) => {
    const item = element("li");
    item.id = `ovw-note-${index + 1}`;
    item.append(element("strong", "", `${title}. `));
    renderInline(item, text);
    return item;
  }));
  document.querySelectorAll(".ovw-mode button").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
  });
  drawLegend();
}

function setMode(mode) {
  if (view.nodes.pop.matches(":popover-open")) view.nodes.pop.hidePopover();
  state.mode = mode;
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* the default stands */ }
  draw();
}

function savedMode() {
  try {
    return localStorage.getItem(MODE_KEY) === "absolute" ? "absolute" : "relative";
  } catch {
    return "relative";
  }
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
  if (overview?.format !== FORMAT || !overview.page || !overview.grid
      || !constitutions?.companies || !governance?.labs) {
    status.textContent = INCOMPATIBLE;
    return;
  }
  view = createBoard({
    nodes: { table: byId("ovw-grid"), pop: byId("ovw-pop"), expandAll: null },
    everyRow: null,
  });
  try {
    needed().forEach(node => { node.hidden = false; });
    renderPage("ovw", overview.page);
    state = { overview, companies: companiesOf(constitutions, governance, overview), mode: savedMode() };
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
  document.querySelectorAll(".ovw-mode button").forEach(button => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  status.textContent = "";
}

initializeOverview();
