/* The loader: the Polaris mark with its ring turning, and a line saying what is
 * loading, centred in whatever is loading.
 *
 * The doc reader's loader over a document is the model. This file carries the
 * same drawing for every other place a reader waits: a board, the overview, the
 * change log, the list of behaviours. Its style is injected once, by brand.js,
 * which every page loads, so a loader written into a page's markup before any
 * script has run is styled as soon as that module arrives.
 *
 * Markup: an element of class "site-loading" holding the mark and the text.
 * Whatever replaces the element's contents (a board drawn, a message) ends the
 * loader, because the layout applies only while the mark is inside.
 */

/* No backticks inside this block: it is a template literal. */
const STYLE = `
.site-loading:has(> .site-loader-mark) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 200px;
  margin: 0;
  color: #333D22;
  text-align: center;
}
.site-loader-mark { width: 44px; height: 44px; overflow: visible; }
.site-loader-ring {
  transform-box: view-box;
  transform-origin: 24px 24px;
  animation: site-loader-turn 2.4s linear infinite;
}
@keyframes site-loader-turn { to { transform: rotate(360deg); } }
.site-loader-text {
  color: #23281B;
  font-family: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) { .site-loader-ring { animation: none; } }
`;

let styled = false;
export function styleLoaders() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const node = document.createElement("style");
  node.textContent = STYLE;
  document.head.append(node);
}

/* The mark and the line, as markup, for a page that writes its contents as a
 * string. The ring stays open as it turns, as the mark requires. */
export function loaderMarkup(label) {
  return `<svg class="site-loader-mark" width="44" height="44" viewBox="0 0 48 48" aria-hidden="true"`
    + ` focusable="false"><path class="site-loader-ring" d="M32 10.14A16 16 0 1 1 16 10.14"`
    + ` fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`
    + `<path d="M24 4Q24 23 30.5 23Q24 23 24 32Q24 23 17.5 23Q24 23 24 4Z" fill="currentColor"/>`
    + `</svg><span class="site-loader-text">${label}</span>`;
}

/* The same, as an element of its own. */
export function loaderNode(label, tag = "div") {
  styleLoaders();
  const node = document.createElement(tag);
  node.className = "site-loading";
  node.setAttribute("role", "status");
  node.innerHTML = loaderMarkup(label.replace(/[<>&]/g, ""));
  return node;
}
