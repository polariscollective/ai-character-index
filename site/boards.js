/* The index: two views of one index, one on screen at a time.
 *
 * The first reads what the constitutions say, from site/constitutions.json; the
 * second asks how the companies govern them, from site/governance.json. Each
 * brings its own board, its own data and the words of its own popovers, and this
 * file owns only what they share: which of the two is on screen, read from the
 * address. It was the front page, behind tabs, until 24 September 2026; the
 * front page is the overview now, and a view is chosen from the Index menu in
 * the header (brand.js), which links to /index?view=.
 *
 * The board the first view carried until 23 September 2026 is still here, at
 * /coverage. It is built from the index's publication rather than from a file,
 * so the figures it holds and the passages behind them stay reachable; the line
 * under this board leads to it.
 */

import { initializeConstitutions, openCell as openConstitutionsCell } from "./constitutions.js";
import { initializeGovernance, openCell as openGovernanceCell } from "./governance.js";
import { renderMenu as renderSections } from "./page-menu.js";

/* The view has an address, ?view=governance, so a link can open on it; the first
 * view is the one with no parameter, which keeps every link already shared
 * pointing where it did. */
const VIEWS = ["coverage", "governance"];
const TITLES = {
  coverage: "What the constitutions say",
  governance: "How constitutions are governed",
};

function viewFromAddress() {
  const asked = new URLSearchParams(location.search).get("view");
  return VIEWS.includes(asked) ? asked : VIEWS[0];
}

/* The menu down the left margin lists the sections of the view on screen
 * (page-menu.js). */
const renderMenu = view => renderSections(document.getElementById(`view-${view}`));

function showView(view) {
  VIEWS.forEach(each => {
    document.getElementById(`view-${each}`).hidden = each !== view;
  });
  document.title = `${TITLES[view]}, AI Constitutions Index`;
  renderMenu(view);
}

showView(viewFromAddress());
// The sections under each board come from its file, so the menu is written
// again once both have drawn them.
Promise.allSettled([initializeConstitutions(), initializeGovernance()])
  .then(results => {
    // Settled rather than all, so one board failing leaves the other drawn; a
    // failure is still reported, never swallowed.
    results.filter(result => result.status === "rejected")
      .forEach(result => console.error(result.reason));
    renderMenu(viewFromAddress());
    openCompanyFromAddress();
  });

/* ?company=<id> opens that company's profile in the view on screen, as a press
 * on its name would, and ?company=<id>&cell=<row> opens that one cell of it,
 * unfolding the rows above. The overview links here to show a figure it does
 * not carry itself. */
function openCompanyFromAddress() {
  const params = new URLSearchParams(location.search);
  const id = params.get("company");
  if (!id || !/^[a-z0-9-]+$/.test(id)) return;
  const cell = params.get("cell");
  if (cell) {
    const open = viewFromAddress() === "governance" ? openGovernanceCell : openConstitutionsCell;
    if (open(id, cell)) return;
  }
  const button = document.querySelector(
    `#view-${viewFromAddress()} .company-button[data-lab="${id}"]`);
  if (!button) return;
  button.scrollIntoView({ block: "center", inline: "center" });
  button.click();
}
