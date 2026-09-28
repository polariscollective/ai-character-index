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
const CONTEXT_KEY = "aci-overview-context";

const byId = id => document.getElementById(id);
const needed = () => document.querySelectorAll("#view-overview [data-needs-board]");
const shown = value => value.toFixed(1);
/* "Open weights" read inside a sentence, keeping a leading acronym as it is. */
const lowerFirst = text =>
  (/^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));

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
      // What a reader should know under the name, as the two boards say it:
      // the constitutions board's note on the document, and whether anyone can
      // download the flagship model.
      note: written?.note || null,
      openWeights: Boolean(lab.open_weights),
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
  content.append(element("p", "", entry.text));
  if (entry.quote) {
    const said = element("blockquote", "ovw-quote", `“${entry.quote}”`);
    content.append(said);
    if (entry.source) content.append(element("p", "subtitle", entry.source));
  }
  if (entry.downloads) content.append(element("p", "subtitle", entry.downloads));
  content.append(element("p", "subtitle", row.plain));
  if (entry.url) leadTo(content, entry.url, "Where the company said it");
  else if (row.url) leadTo(content, row.url, row.source || row.url);
}

/* The rows under the grid that no score counts: a quiet heading across the
 * table, then one row per fact, named in plain text rather than as a button, so
 * nothing here reads as one more figure of the index. No colour and no tier,
 * since nothing here is ranked; each cell opens where its fact comes from, and
 * the note under the grid says what the rows are. */
function contextRows(noteNumber) {
  const context = state.overview.context;
  if (!context?.rows?.length) return [];
  const head = element("tr", "context-head");
  const title = element("th");
  title.scope = "rowgroup";
  title.colSpan = state.companies.length + 1;
  // One line under the scores. At the left, "Hide" in small underlined type
  // and the context's name, or when hidden a single "Show context" button; at
  // the board's right edge, the grid's colour scale.
  const line = element("div", "context-line");
  const left = element("div", "context-left");
  if (state.showContext) {
    const hide = element("button", "context-hide", "Hide");
    hide.type = "button";
    hide.setAttribute("aria-label", "Hide the context");
    hide.addEventListener("click", () => setContext(false));
    left.append(hide, element("span", "context-title", context.name));
    if (noteNumber) {
      const mark = element("span", "row-mark", String(noteNumber));
      mark.setAttribute("aria-hidden", "true");
      left.append(mark);
    }
  } else {
    const show = element("button", "gov-button ovw-context-toggle", "Show context");
    show.type = "button";
    show.addEventListener("click", () => setContext(true));
    left.append(show);
  }
  line.append(left);
  const legend = byId("ovw-legend");
  if (legend) line.append(legend);
  title.append(line);
  head.append(title);
  if (!state.showContext) return [head];
  return [head, ...context.rows.map(row => {
    const tr = element("tr", "context-row");
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
    if (row.sub) label.append(element("span", "context-sub", row.sub));
    tr.append(view.rowHead(null, label));
    state.companies.forEach(company => {
      const entry = context.companies?.[company.id]?.[row.id];
      if (!entry) {
        tr.append(element("td", "cell"));
        return;
      }
      const words = [entry.level ? `${entry.level === "-" ? 0 : entry.level.length} of 3`
                     : entry.shown === "-" ? "none" : entry.shown, entry.behind,
                     entry.open_weights ? "open weights" : null,
                     entry.band ? `${entry.band} a month` : null].filter(Boolean);
      const { cell, button } = view.cellButton({ lab: company.id, row: `context-${row.id}` },
        `${company.name}, ${row.name.toLowerCase()}: ${words.join(", ")}`,
        content => aboutContextCell(content, context, row, company, entry),
        "cell-button cell-context");
      if (entry.short) {
        // The model at the top and how far it trails the frontier at the
        // bottom, so both lines sit level across the row; a model at the
        // frontier is said in bold.
        // A third line says whether that model's weights can be downloaded;
        // it keeps its place when empty, so every line sits level across the row.
        const open = element("span", "cell-context-sub", entry.open_weights ? "Open weights" : "\u00a0");
        if (!entry.open_weights) open.setAttribute("aria-hidden", "true");
        button.append(element("span", "cell-context-words", entry.shown),
          element("span", entry.months_behind === 0 ? "cell-context-sub cell-context-lead"
            : "cell-context-sub", entry.short), open);
      } else if (Number.isFinite(entry.share)) {
        button.append(element("span", "cell-context-band", entry.shown));
      } else if (entry.level) {
        // Our rough estimate as three squares, filled one per step, all three
        // empty where there is nothing to go on.
        button.append(usageMeter(entry.level));
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
  })];
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
  // The numbered notes the marks on the page point to, in the order the marks
  // come: the file's own notes, which the introduction points to, the
  // context's sources, then the relative mode's, whose mark is on its button
  // below them.
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
  const notes = [...(grid.notes || []),
                 ...(shownContext?.note ? [{ title: context.name, text: context.note }] : []),
                 { title: "Relative", text: grid.relative_note }];
  const contextNote = shownContext?.note ? (grid.notes || []).length + 1 : null;
  view.nodes.table.tHead.replaceChildren(headRow());
  view.nodes.table.tBodies[0].replaceChildren(...grid.groups.flatMap(group =>
    [figureRow(group, group.final, true), ...group.rows.map(row => figureRow(group, row, false))]),
    ...contextRows(contextNote));
  byId("ovw-mode-note").textContent = grid.hint;
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

function setContext(show) {
  if (view.nodes.pop.matches(":popover-open")) view.nodes.pop.hidePopover();
  state.showContext = show;
  try { localStorage.setItem(CONTEXT_KEY, show ? "shown" : "hidden"); } catch { /* the default stands */ }
  draw();
}

/* Shown unless this browser chose to hide it. */
function savedContext() {
  try {
    return localStorage.getItem(CONTEXT_KEY) !== "hidden";
  } catch {
    return true;
  }
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
    state = { overview, companies: companiesOf(constitutions, governance, overview), mode: savedMode(),
              showContext: savedContext() };
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
