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
const tabs = [...document.querySelectorAll(".view-tab")];

function viewFromAddress() {
  const asked = new URLSearchParams(location.search).get("view");
  return VIEWS.includes(asked) ? asked : VIEWS[0];
}

function showView(view, { write = false, focus = false } = {}) {
  tabs.forEach(tab => {
    const on = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
    if (on && focus) tab.focus();
  });
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
