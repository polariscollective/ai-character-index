/* The front page: two views of one index, behind tabs.
 *
 * The first reads what the constitutions say, from site/constitutions.json; the
 * second asks how the companies govern them, from site/governance.json. Each
 * brings its own board, its own data and the words of its own popovers, and this
 * file owns only what they share: which of the two is on screen, and the address
 * that says so.
 *
 * The board the first view carried until 23 September 2026 is still here, at
 * /coverage. It is built from the index's publication rather than from a file,
 * so the figures it holds and the passages behind them stay reachable; the line
 * under this board leads to it.
 */

import { initializeConstitutions } from "./constitutions.js";
import { initializeGovernance } from "./governance.js";

/* The view has an address, ?view=governance, so a link can open on it; the first
 * view is the one with no parameter, which keeps every link already shared
 * pointing where it did.
 *
 * replaceState rather than pushState: a tab is a way of looking at the page, not
 * a page, and filling the back button with tab changes would take a reader back
 * through views rather than out to where they came from. Other parameters are
 * kept. */
const VIEWS = ["coverage", "governance"];
// The views that exist; the two the index is still building are tabs a reader
// can see but not choose.
const tabs = [...document.querySelectorAll('.view-tab:not([aria-disabled="true"])')];

function viewFromAddress() {
  const asked = new URLSearchParams(location.search).get("view");
  return VIEWS.includes(asked) ? asked : VIEWS[0];
}

/* The menu down the left margin: the sections of the view on screen, read off
 * the elements its markup marks with data-menu, the way Guidelight lists its
 * own. A section folded shut is opened when it is chosen, and the section being
 * read is marked as the page scrolls. */
const menu = document.getElementById("page-menu");
let menuTargets = [];

function renderMenu(view) {
  if (!menu) return;
  const panel = document.getElementById(`view-${view}`);
  menuTargets = [...panel.querySelectorAll("[data-menu]")];
  const list = document.createElement("ol");
  menuTargets.forEach(target => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#${target.id}`;
    link.textContent = target.dataset.menu;
    link.addEventListener("click", event => {
      event.preventDefault();
      // A folded section is opened whenever it is chosen here, however it was
      // left: the section itself, or the fold inside it.
      const fold = target.tagName === "DETAILS" ? target
        : target.querySelector(":scope > details.section-fold");
      if (fold) fold.open = true;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    item.append(link);
    list.append(item);
  });
  menu.replaceChildren(list);
  markCurrent();
}

/* The section being read is the last one whose top has passed the upper fifth
 * of the window. */
function markCurrent() {
  if (!menu) return;
  const line = window.innerHeight * 0.2;
  let current = 0;
  menuTargets.forEach((target, index) => {
    if (target.getBoundingClientRect().top <= line) current = index;
  });
  menu.querySelectorAll("a").forEach((link, index) => {
    if (index === current) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
}
window.addEventListener("scroll", markCurrent, { passive: true });

function showView(view, { write = false, focus = false } = {}) {
  tabs.forEach(tab => {
    const on = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
    if (on && focus) tab.focus();
  });
  renderMenu(view);
  if (write) {
    const url = new URL(location.href);
    if (view === VIEWS[0]) url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    url.hash = "";
    history.replaceState(null, "", url);
  }
}

tabs.forEach(tab => tab.addEventListener("click", () =>
  showView(tab.dataset.view, { write: true })));
document.querySelector(".views")?.addEventListener("keydown", event => {
  const at = tabs.indexOf(document.activeElement);
  if (at < 0) return;
  const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  showView(tabs[(next + tabs.length) % tabs.length].dataset.view, { write: true, focus: true });
});

showView(viewFromAddress());
initializeConstitutions();
initializeGovernance();
