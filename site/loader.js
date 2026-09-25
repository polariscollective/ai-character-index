/* The loader: the Polaris mark with its ring turning, and a line saying what is
 * loading, centred in whatever is loading.
 *
 * The doc reader's loader over a document is the model, drawn smaller here with
 * the line beside the mark rather than under it. This file carries it for every
 * other place a reader waits: a board, the overview, the change log, the list of
 * behaviours. Its style is injected once, by brand.js,
 * which every page loads, so a loader written into a page's markup before any
 * script has run is styled as soon as that module arrives.
 *
 * Markup: an element of class "site-loading" holding the mark and the text.
 * Whatever replaces the element's contents (a board drawn, a message) ends the
 * loader, because the layout applies only while the mark is inside.
 */

/* The style is site/loader.css, linked in the head of every page so it applies
 * from the first paint. A page that lacks the link, or a loader built before it
 * arrives, gets it here, once. */

let styled = false;
export function styleLoaders() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  if (document.querySelector('link[href="/loader.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/loader.css";
  document.head.append(link);
}

/* The mark and the line, as markup, for a page that writes its contents as a
 * string. The ring stays open as it turns, as the mark requires. */
export function loaderMarkup(label) {
  return `<svg class="site-loader-mark" width="26" height="26" viewBox="0 0 48 48" aria-hidden="true"`
    + ` focusable="false"><path class="site-loader-ring" d="M32 10.14A16 16 0 1 1 16 10.14"`
    + ` fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`
    + `<path d="M24 4Q24 23 30.5 23Q24 23 24 32Q24 23 17.5 23Q24 23 24 4Z" fill="currentColor"/>`
    + `</svg><span class="site-loader-text">${label}…</span>`;
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
