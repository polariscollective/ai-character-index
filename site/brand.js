/* The wordmark, and the publication beside it.
 *
 * Pressing "AI Constitutions Index" in the header says why the index has that
 * name, in About's own words: on About they are already in the document; on the
 * other pages that page is fetched and the entry lifted from its list of the
 * words the index uses, so it is written in one place and cannot drift.
 *
 * Beside the wordmark a small badge gives the date of the publication the page
 * is serving, highlighted. On a development deployment it says "(dev)" in the
 * ordinary ink, and on a publication older than the current one "(older
 * version)", in the framework's one warm colour. Pressing it says which publication it is, what
 * standing it has (published; on development, never published and so never
 * reviewed; or older), and leads to the change log, to the most recent version
 * when this is not it, and on development to the published index.
 *
 * It also keeps a pinned publication for the whole site. While ?publication= is
 * in the address, every link to another page of the site carries it, so the
 * reader moves between pages without leaving the publication they chose.
 *
 * One file for four pages, as dev-tag.js is, and for the same reason: each page
 * keeps its own stylesheet, so this builds its own nodes and its own style.
 */

import { styleLoaders, loaderNode } from "./loader.js";

const ABOUT = "/about";
/* Where the published index lives, for a reader on the development version. */
const PUBLISHED = "https://ai-constitutions-index.polariscollective.org";

/* No backticks inside this block: it is a template literal. */
const STYLE = `
.brand-pop {
  inset: auto;
  margin: 0;
  width: min(520px, calc(100vw - 16px));
  max-height: min(78vh, 680px);
  overflow-y: auto;
  padding: 18px 22px 20px;
  border: 1px solid #5C6B3C;
  border-radius: 4px;
  background: #F1EFE3;
  color: #23281B;
  font-family: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.55;
  text-align: left;
}
.brand-pop:focus { outline: none; }
.brand-pop h2 {
  margin: 0 0 8px;
  padding: 0;
  background: none;
  font-family: "Bricolage Grotesque", system-ui, sans-serif;
  font-size: 19px;
  font-weight: 600;
  line-height: 1.3;
}
.brand-pop h3 {
  margin: 18px 0 8px;
  padding: 0;
  background: none;
  font-family: "Instrument Sans", system-ui, sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: #5C6B3C;
}
.brand-pop p { margin: 0 0 10px; max-width: none; font-size: 14px; line-height: 1.55; color: #23281B; }
.brand-pop code {
  font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  font-size: 13px;
}
.brand-pop a { color: #23281B; text-decoration: underline 2px #B7C94B; text-underline-offset: 3px; box-shadow: none; }
.brand-pop a:hover, .brand-pop a:focus-visible { background: #B7C94B; }
.brand-pop .brand-close {
  float: right;
  margin: -6px -10px 0 12px;
  padding: 2px 6px;
  border: 0;
  background: none;
  color: #676C58;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.brand-pop .brand-close:hover { background: #B7C94B; color: #23281B; }
.site-header .wordmark[aria-expanded="true"] { box-shadow: inset 0 -2px 0 #B7C94B; }
/* The index's name over the collective's, as one link centred on the mark, in
   the height the header already has: a press anywhere on it opens the note,
   which is where the collective's own address is. The index's name is in the
   framework's olive green (chartreuse never writes), the collective's in a dark
   grey. */
.site-header .site-brand .brand-stack {
  display: flex; flex-direction: column; justify-content: center; gap: 1px;
  line-height: 1.15; text-decoration: none;
}
.site-header .site-brand .brand-stack .brand-name { color: #5C6B3C; }
.site-header .site-brand .brand-stack .collective {
  display: block; margin: 0; padding: 0;
  font-family: "Instrument Sans", system-ui, sans-serif; font-size: 11px; font-weight: 400;
  line-height: 1.2; color: #4F5344; letter-spacing: 0; text-transform: none;
}
.site-header .site-brand .brand-stack:hover .brand-name { background: #B7C94B; color: #23281B; }
/* A phone keeps its header to the index's name, as it always has. */
@media (max-width: 900px) {
  .site-header .site-brand .brand-stack .collective { display: none; }
}
/* The mark a little larger, now that it stands beside two lines of name. */
.site-header .site-brand .polaris-mark { width: 26px; height: 26px; }
/* The date of the publication, written beside the wordmark rather than set in a
   pill: small, faint, with a thin underline that says it can be pressed. An
   older version alone takes a colour, the framework's one warm colour; a
   development build says so in brackets in the same ink as production. */
.pub-tag {
  align-self: center;
  margin-left: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: #676C58;
  font-family: "Instrument Sans", system-ui, sans-serif;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  text-decoration: underline 1px #C6C4B0;
  text-underline-offset: 3px;
  cursor: pointer;
}
.pub-tag.is-aside { color: #A0522D; text-decoration-color: #A0522D; }
.pub-tag:hover, .pub-tag:focus-visible, .pub-tag[aria-expanded="true"] {
  background: #B7C94B; color: #23281B;
}
.pub-tag:focus-visible { outline: 2px solid #B7C94B; outline-offset: 2px; }
.brand-pop ul.brand-links { margin: 12px 0 0; padding: 0; list-style: none; }
.brand-pop ul.brand-links li { margin: 0 0 6px; }

/* ---------- the Index menu ----------
 *
 * The views of the index are chosen here rather than from tabs on the page:
 * pointing at Index opens the list, pressing Index opens the first view, and
 * the small button beside it opens the list for a keyboard or a finger. The
 * list hangs from the link with no gap between them, so the pointer can travel
 * down into it without the list closing on the way. */
.index-menu { position: relative; display: inline-flex; align-items: center; gap: 2px; }
.index-menu .index-toggle {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: none;
  color: inherit;
  cursor: pointer;
}
.index-menu .index-toggle svg { width: 10px; height: 10px; transition: transform 150ms; }
.index-menu.is-open .index-toggle svg { transform: rotate(180deg); }
.index-menu .index-toggle:hover { background: #B7C94B; color: #23281B; }
.index-menu .index-toggle:focus-visible { outline: 2px solid #B7C94B; outline-offset: 2px; }
.index-list {
  position: absolute;
  top: 100%;
  left: -12px;
  z-index: 60;
  display: none;
  min-width: 300px;
  margin: 0;
  padding: 10px 0 0;
  list-style: none;
}
.index-list-inner {
  margin: 0;
  padding: 6px 0;
  list-style: none;
  border: 1px solid #5C6B3C;
  border-radius: 4px;
  background: #F1EFE3;
}
.index-menu.is-open .index-list { display: block; }
@media (hover: hover) {
  .index-menu:hover .index-list { display: block; }
}
.index-list li { margin: 0; }
.index-list a, .index-list .index-coming {
  display: block;
  padding: 7px 14px;
  color: #23281B;
  font-family: "Instrument Sans", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  text-decoration: none;
  white-space: nowrap;
  box-shadow: none;
}
.index-list a:hover, .index-list a:focus-visible { background: #B7C94B; color: #23281B; }
.index-list a[aria-current="page"] { box-shadow: inset 3px 0 0 #B7C94B; font-weight: 600; }
.index-list .index-coming { color: #676C58; cursor: default; }
.index-list .index-coming small { display: block; font-size: 11px; }
@media (prefers-reduced-motion: reduce) {
  .index-menu .index-toggle svg { transition: none; }
}

/* ---------- the header on a narrow screen ----------
 *
 * The header is a brand at one end and a menu at the other, held on one line of
 * a fixed 54px. Everything it holds comes to about 880px, so below that the
 * line has to give somewhere, and it was giving in the worst way it could: at
 * 390px the board pages drew the wordmark over three lines, clipped all three
 * against the 54px, and carried the whole menu off the right edge where no
 * finger and no tab key could reach it.
 *
 * It wraps instead. The height follows what it holds, the collective's name
 * goes (it is still a link in the footer), and the menu drops to a second row
 * the moment the two do not fit side by side. Rows rather than a control that
 * hides the menu: four links of one or two words fit on one line at 360px, so a
 * button to reveal them would add a press, a focus trap and a state to get
 * wrong, and would buy back about thirty pixels. The framework asks for a fixed
 * left nav in tools and a plain header on content pages; a phone has room for
 * neither, so both kinds of page take the same rows here.
 *
 * The reader hides every link but the one you are on below 900px, which leaves
 * a header with no way out of the page. They come back. Matching that rule's
 * specificity is what the :not() is for, and 900px is this block's width
 * because that is where the reader takes them away.
 *
 * It is written here and not in a stylesheet because the five pages that carry
 * this header keep four stylesheets between them, one of which is shared with
 * the boards. This file is already on every one of them. about.html and
 * mcp.html state a narrower version of this in their own sheets, so their
 * headers still wrap if this module never runs; the board pages and the reader
 * have no such floor and depend on this block.
 */
@media (max-width: 900px) {
  .site-header {
    height: auto;
    min-height: 54px;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 16px;
  }
  .site-header .site-brand { flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  /* Two names and a menu do not fit. The mark carries the collective alone. */
  .site-header .collective, .site-header .brand-divider { display: none; }
  .site-header nav { flex-wrap: wrap; gap: 6px 18px; }
  .site-header nav a:not(.active) { display: inline; }
}

@media (max-width: 700px) {
  .site-header {
    padding: 8px 16px;
    /* The header holds over the page while it scrolls, so every row it takes is
       a row the reading loses for the whole page. At 360px it takes three: the
       wordmark, the tag beside it, and the menu. Prose leading on all three
       costs about ten pixels of the screen and buys nothing, because no line
       here sits above another line of its own. */
    line-height: 1.3;
  }
  .brand-pop { padding: 16px; }
}
`;

function node(tag, className, text) {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

function pinned() {
  return new URLSearchParams(location.search).get("publication");
}

/* "September 24, 2026", the form the owner chose for this one line. */
const WHEN = new Intl.DateTimeFormat("en-US",
  { day: "numeric", month: "long", year: "numeric" });
const AT = new Intl.DateTimeFormat("en-GB",
  { hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

/* The publication the page is serving and the current one, and where the first
 * stands beside the second. Null when either cannot be read: no answer, no
 * claim. */
async function readStanding() {
  const pin = pinned();
  try {
    const [shownResponse, currentResponse] = await Promise.all([
      fetch("/api/reader/publication"
        + (pin ? `?publication=${encodeURIComponent(pin)}` : "")),
      pin ? fetch("/api/reader/publication") : null,
    ]);
    if (!shownResponse.ok) return null;
    const shown = await shownResponse.json();
    const current = currentResponse?.ok ? await currentResponse.json() : shown;
    const older = Boolean(pin) && current.id !== shown.id
      && new Date(shown.published_at) < new Date(current.published_at);
    return { shown, current, older, development: shown.development === true };
  } catch {
    return null;
  }
}

/* Why the index is called what it is: the paragraphs of that entry in About's
 * list of the words the index uses, copied. */
async function whyTheName() {
  let source = document;
  if (!document.querySelector("#words .glossary")) {
    try {
      const response = await fetch(ABOUT);
      if (!response.ok) return null;
      source = new DOMParser().parseFromString(await response.text(), "text/html");
    } catch {
      return null;
    }
  }
  const term = [...source.querySelectorAll("#words .glossary dt")]
    .find(dt => dt.textContent.trim() === "AI Constitutions Index");
  const entry = term?.nextElementSibling;
  if (!entry || entry.tagName !== "DD") return null;
  const copy = document.createDocumentFragment();
  entry.querySelectorAll("p").forEach(paragraph => copy.append(paragraph.cloneNode(true)));
  return copy.childNodes.length ? copy : null;
}

/* One popover for the header, opened by the wordmark or by the badge beside
 * it. `trigger` is whichever opened it, which is what it is placed under and
 * what gets the focus back. */
const state = { pop: null, trigger: null, closedAt: 0, closedBy: null };

function place() {
  const { pop, trigger } = state;
  if (!trigger || !pop.matches(":popover-open")) return;
  const header = trigger.closest(".site-header") || trigger;
  const top = header.getBoundingClientRect().bottom + 6;
  const left = Math.max(8, Math.min(trigger.getBoundingClientRect().left - 8,
    window.innerWidth - pop.offsetWidth - 8));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

function closeButton() {
  const close = node("button", "brand-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => state.pop.hidePopover());
  return close;
}

/* Who runs the index, said under why it has its name. */
const COLLECTIVE = "https://polariscollective.org";
function aboutTheCollective() {
  const part = document.createDocumentFragment();
  const line = node("p", "", "Polaris Collective runs and maintains the index. It gives the "
    + "scores on the boards, and wrote part of the method behind them. ");
  const link = node("a", "", "polariscollective.org");
  link.href = COLLECTIVE;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  line.append(link);
  part.append(node("h3", "", "Polaris Collective"), line);
  return part;
}

/* Why the index has its name, and who runs it: what the wordmark opens. */
async function whyTheNameNote(content) {
  const title = node("h2", "", "Why this name");
  title.id = "brand-pop-title";
  content.append(title, loaderNode("Publication loading", "p"));
  const why = await whyTheName();
  content.replaceChildren(closeButton(), title);
  content.append(why || node("p", "",
    "The explanation could not be loaded. It is on the About page."));
  content.append(aboutTheCollective());
}

/* Open the header's popover under `trigger`, filled by `build`, or close it if
 * that trigger's note is the one open. */
function openAbout(event, trigger, build) {
  event.preventDefault();
  const { pop } = state;
  // A press on the trigger while its note is open closes it by light dismiss on
  // the way down; the click that follows must not open it again.
  if (state.closedBy === trigger && performance.now() - state.closedAt < 300) return;
  if (pop.matches(":popover-open")) {
    const same = state.trigger === trigger;
    pop.hidePopover();
    if (same) return;
  }
  state.trigger = trigger;
  pop.replaceChildren(closeButton());
  const built = build(pop);
  pop.showPopover();
  trigger.setAttribute("aria-expanded", "true");
  place();
  pop.focus({ preventScroll: true });
  Promise.resolve(built).then(place);
}

/* The site's own pages, the ones a pin travels between. The API, the admin
 * portal and files are left alone. */
const SITE_PAGE = /^\/(overview\/?|index\/?|coverage\/?|spec-reader\/.*|doc-reader\/.*|about\/?|how-it-works\/?|mcp\/?)?$/;

/* Before a link is followed, it takes the pin with it: set on the link itself as
 * it is pressed, so a link a script built after the page loaded is covered too,
 * and a link opened in a new tab carries it as well. A link that names its own
 * publication, as the change log's do, keeps it; a link within the page is left
 * as it is. */
function carryPin(event) {
  const pin = pinned();
  if (!pin) return;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!link) return;
  if (link.hasAttribute("data-unpinned")) return;
  const raw = link.getAttribute("href") || "";
  if (!raw || raw.startsWith("#")) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || !SITE_PAGE.test(url.pathname)) return;
  if (url.searchParams.has("publication")) return;
  url.searchParams.set("publication", pin);
  link.href = url.toString();
}

/* The badge beside the wordmark and the note behind it. The note shares the
 * wordmark's popover, placed under the badge, so the header has one popover and
 * one way of closing it. */
function publicationBadge(brand, wordmark) {
  const badge = node("button", "pub-tag");
  badge.type = "button";
  badge.hidden = true;
  badge.setAttribute("aria-haspopup", "dialog");
  badge.setAttribute("aria-expanded", "false");
  badge.setAttribute("aria-controls", "brand-pop");
  (wordmark.closest(".brand-stack") || wordmark).after(badge);
  readStanding().then(standing => {
    if (!standing) return;
    const date = WHEN.format(new Date(standing.shown.published_at));
    const aside = standing.older ? "older version"
      : standing.development ? "dev" : null;
    badge.textContent = aside ? `${date} [${aside}]` : date;
    // The warm colour is kept for an older version, which a reader must not
    // mistake for the current index. "dev" is said in the ordinary ink: on a
    // development deployment it is the normal state, not a warning.
    badge.classList.toggle("is-aside", Boolean(standing.older));
    badge.setAttribute("aria-label", `Publication of ${date}${aside ? `, ${aside}` : ""}: `
      + "what it is");
    badge.hidden = false;
    badge.addEventListener("click", event => openAbout(event, badge,
      content => describePublication(content, standing, date)));
  });
}

/* What the badge's note says. */
function describePublication(content, { shown, older, development }, date) {
  const title = node("h2", "", `Publication of ${date}`);
  title.id = "brand-pop-title";
  const id = node("p");
  id.append(document.createTextNode(`Put online at ${AT.format(new Date(shown.published_at))}, `
    + "publication "), node("code", "", String(shown.id).slice(0, 8)), document.createTextNode("."));
  content.append(title, id);
  if (older) {
    content.append(node("p", "", "This is an older version of the index. A more recent "
      + "publication has been made since, and its figures may differ."));
  } else if (!development) {
    content.append(node("p", "", "This is the publication of the index currently published."));
  }
  if (development) {
    content.append(node("p", "", "This is the development version of the site, which shows "
      + "publications before anyone makes them public."));
    // Only a draft is unreviewed: a development deployment can also be showing
    // one that was published.
    if (shown.is_public !== true) {
      content.append(node("p", "", "This publication has not been published, so it has not "
        + "been reviewed."));
    }
  }
  const links = node("ul", "brand-links");
  const item = (text, href, external, newTab = external) => {
    const link = node("a", "", text);
    link.href = href;
    if (newTab) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    // The way back to the most recent version must not take the pin with it.
    if (!external && newTab) link.dataset.unpinned = "";
    const li = node("li");
    li.append(link);
    links.append(li);
  };
  item("Go to the change log", `${ABOUT}#changelog`);
  if (pinned()) {
    const url = new URL(location.href);
    url.searchParams.delete("publication");
    // In a new tab, unpinned: on development that is the newest publication, on
    // production the newest published one, which is what the site serves
    // without a pin.
    item("Back to the most recent version", url.pathname + url.search + url.hash, false, true);
  }
  if (development) item("Go to the published index", PUBLISHED, true);
  content.append(links);
}

/* The header's real height, for whatever has to clear it.
 *
 * Three stylesheets place something against --header-height: the board's table
 * head sticks under it, the reader's shell subtracts it, and the two prose
 * pages offset their rail and their jumped-to headings by it. All three take it
 * from a constant of 54px, which stops being true the moment the header wraps
 * onto two rows.
 *
 * Written only while the header is in its wrapped shape, and cleared above it.
 * Above 900px two of those sheets set the header's own height from this
 * variable, so measuring the header and writing it back is a loop. Below 900px
 * the height is whatever the rows come to, and nothing reads back into it.
 *
 * about.html and mcp.html measure their own headers the same way, and going the
 * other way this takes back only what it put there: a value one of them wrote is
 * left where it is, so this cannot quietly undo a measurement somebody else made
 * for a reason of their own. */
function followHeight(header) {
  const wrapped = window.matchMedia("(max-width: 900px)");
  const root = document.documentElement;
  let written = null;
  const write = () => {
    if (wrapped.matches) {
      written = `${header.offsetHeight}px`;
      root.style.setProperty("--header-height", written);
    } else if (written !== null && root.style.getPropertyValue("--header-height") === written) {
      root.style.removeProperty("--header-height");
      written = null;
    }
  };
  write();
  new ResizeObserver(write).observe(header);
  wrapped.addEventListener("change", write);
}

/* The views of the index, in the order the About page names them. The two the
 * index is still building are listed so a reader sees where it is going, and
 * cannot be chosen. */
const VIEWS = [
  { title: "What the constitutions say", view: null },
  { title: "How constitutions are governed", view: "governance" },
  { title: "How constitutions are regulated", coming: true },
  { title: "Adherence of models to constitutions", coming: true },
];

function indexMenu() {
  const link = document.querySelector(".site-header nav a[data-index-menu]");
  if (!link) return;
  const wrap = node("span", "index-menu");
  link.replaceWith(wrap);

  const toggle = node("button", "index-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "index-list");
  toggle.setAttribute("aria-label", "The views of the index");
  const SVG = "http://www.w3.org/2000/svg";
  const chevron = document.createElementNS(SVG, "svg");
  chevron.setAttribute("viewBox", "0 0 10 10");
  chevron.setAttribute("aria-hidden", "true");
  chevron.setAttribute("focusable", "false");
  const stroke = document.createElementNS(SVG, "path");
  for (const [name, value] of Object.entries({
    d: "M1.5 3.5 5 7l3.5-3.5", fill: "none", stroke: "currentColor",
    "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round",
  })) stroke.setAttribute(name, value);
  chevron.append(stroke);
  toggle.append(chevron);

  const onIndex = /^\/index\/?$/.test(location.pathname);
  const shown = new URLSearchParams(location.search).get("view");
  const outer = node("div", "index-list");
  outer.id = "index-list";
  const list = node("ul", "index-list-inner");
  for (const { title, view, coming } of VIEWS) {
    const item = node("li");
    if (coming) {
      const label = node("span", "index-coming", title);
      label.setAttribute("aria-disabled", "true");
      label.append(node("small", "", "In preparation"));
      item.append(label);
    } else {
      const choice = node("a", "", title);
      choice.href = view ? `/index?view=${view}` : "/index";
      if (onIndex && (shown === view || (!view && shown !== "governance"))) {
        choice.setAttribute("aria-current", "page");
      }
      item.append(choice);
    }
    list.append(item);
  }
  outer.append(list);
  wrap.append(link, toggle, outer);

  const set = open => {
    wrap.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => set(!wrap.classList.contains("is-open")));
  wrap.addEventListener("focusout", event => {
    if (!wrap.contains(event.relatedTarget)) set(false);
  });
  wrap.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !wrap.classList.contains("is-open")) return;
    set(false);
    toggle.focus();
  });
  document.addEventListener("click", event => {
    if (!wrap.contains(event.target)) set(false);
  });
}

function start() {
  // The loaders written into every page's markup take their style from here.
  styleLoaders();
  document.addEventListener("click", carryPin, true);
  document.addEventListener("auxclick", carryPin, true);
  indexMenu();
  const wordmark = document.querySelector(".site-header .wordmark");
  if (!wordmark) return;
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  const pop = node("div", "brand-pop");
  pop.id = "brand-pop";
  pop.setAttribute("popover", "");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-labelledby", "brand-pop-title");
  pop.tabIndex = -1;
  document.body.append(pop);

  wordmark.setAttribute("aria-haspopup", "dialog");
  wordmark.setAttribute("aria-expanded", "false");
  wordmark.setAttribute("aria-controls", "brand-pop");
  pop.addEventListener("beforetoggle", event => {
    if (event.newState !== "closed") return;
    state.closedAt = performance.now();
    state.closedBy = state.trigger;
    state.trigger?.setAttribute("aria-expanded", "false");
    if (pop.contains(document.activeElement)) state.trigger?.focus({ preventScroll: true });
  });
  wordmark.addEventListener("click", event => openAbout(event, wordmark, whyTheNameNote));
  window.addEventListener("resize", place, { passive: true });

  state.pop = pop;
  const header = wordmark.closest(".site-header");
  if (header) followHeight(header);
  publicationBadge(wordmark.closest(".site-brand"), wordmark);
}

start();
