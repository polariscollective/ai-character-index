/* The words of a board's page, drawn from the board's own file.
 *
 * A publication freezes constitutions.json and governance.json, and everything a
 * reader sees on the front page is in them: the title and the introduction, the
 * notes, and every section under the board. The page's markup keeps only where
 * each goes. So a publication pinned with ?publication= comes back with the
 * words it was published with, and a correction to them is a publication like
 * any other.
 *
 * A section's `blocks` are drawn in order. A string is light markup (markup.js);
 * `{table}` is a table whose first column names its rows; `{slot}` is an empty
 * element the board's own script fills, such as the governance view's scoring
 * tables, which it builds from the same file.
 *
 * Nothing is built with innerHTML.
 */
import { renderMarkup, renderInline } from "./markup.js";

/* The file format this version of the page reads. A file of another format is a
 * publication this page cannot draw, and says so rather than drawing half of
 * it. */
export const FORMAT = 2;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function table({ head = [], rows = [] }) {
  const wrap = element("div", "table-scroll");
  const grid = element("table", "gov-table gov-scoring-table");
  const top = element("tr");
  head.forEach((text, index) => {
    const cell = element("th", index ? "" : "check-col");
    cell.scope = "col";
    renderInline(cell, text);
    top.append(cell);
  });
  const thead = element("thead");
  thead.append(top);
  const body = element("tbody");
  rows.forEach(cells => {
    const row = element("tr");
    cells.forEach((text, index) => {
      const cell = element(index ? "td" : "th");
      if (!index) cell.scope = "row";
      renderInline(cell, text);
      row.append(cell);
    });
    body.append(row);
  });
  grid.append(thead, body);
  wrap.append(grid);
  return wrap;
}

function blocksInto(parent, blocks) {
  (blocks || []).forEach(block => {
    if (typeof block === "string") {
      renderMarkup(parent, block);
      return;
    }
    if (block.table) {
      parent.append(table(block.table));
      return;
    }
    if (block.slot) {
      const slot = element(block.tag || "div", block.class || "");
      slot.id = block.slot;
      parent.append(slot);
    }
  });
}

/* A section under the board: its heading with the chartreuse rule, folded shut,
 * and the section's blocks, in the menu under its title. */
function section({ id, title, blocks }) {
  const node = element("section", "gov-findings page-prose");
  node.id = id;
  node.dataset.menu = title;
  node.setAttribute("aria-labelledby", `${id}-title`);
  const fold = element("details", "section-fold");
  const summary = element("summary");
  const heading = element("h2", "", title);
  heading.id = `${id}-title`;
  summary.append(heading);
  const body = element("div", "gov-more-body");
  blocksInto(body, blocks);
  fold.append(summary, body);
  node.append(fold);
  return node;
}

/* The title, the introduction and the sections of one board's page. `prefix` is
 * the page's own ("cov" or "gov"): its title is #prefix-intro, its introduction
 * #prefix-lede and its sections #prefix-sections. Throws on a page it cannot
 * read, which the caller turns into the sentence every unreadable publication
 * gets. */
export function renderPage(prefix, page) {
  if (!page?.title || typeof page.intro !== "string" || !Array.isArray(page.sections)) {
    throw new Error("page: not a page this version reads");
  }
  document.getElementById(`${prefix}-intro`).textContent = page.title;
  const lede = document.getElementById(`${prefix}-lede`);
  lede.replaceChildren();
  renderMarkup(lede, page.intro, "lede");
  document.getElementById(`${prefix}-sections`)
    .replaceChildren(...page.sections.map(section));
}

/* The numbered notes a board's rows point to, into the list that holds them. */
export function renderNotes(list, notes) {
  list.replaceChildren(...(notes || []).map(({ number, title, text }) => {
    const item = element("li");
    item.value = Number(number);
    item.append(element("strong", "", `${title}. `));
    renderInline(item, text);
    return item;
  }));
}
