/* The menu down the left margin: the sections of a page, read off the elements
 * its markup marks with data-menu, the way Guidelight lists its own. A section
 * folded shut is opened when it is chosen, and the section being read is marked
 * as the page scrolls.
 *
 * One file for the overview and the index, as brand.js is one file for every
 * page: copied into each, the two menus would drift the first time one was
 * edited. It is drawn where the page's stylesheet gives it room, in the left
 * margin of a wide screen (board.css, .page-menu).
 */

const menu = document.getElementById("page-menu");
let menuTargets = [];

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

/* Draw the menu from the data-menu marks inside `scope`. Only what is on the
 * page: a section kept hidden, because the publication could not be drawn or
 * it has nothing in it, is left out. */
export function renderMenu(scope) {
  if (!menu || !scope) return;
  menuTargets = [...scope.querySelectorAll("[data-menu]")]
    .filter(target => !target.closest("[hidden]"));
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
