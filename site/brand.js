/* The wordmark opens a note on what the reader is looking at.
 *
 * Pressing "AI Constitutions Index" in the header says which publication of the
 * index this page is serving and when it was published, leads to the change log
 * on About, and says why the index has that name. It honours a ?publication=
 * pin, the way the pages it sits on do, so a pinned draft is named as a draft.
 *
 * Why the name is About's own words. On About they are already in the document;
 * on the other pages that page is fetched and the entry lifted from its list of
 * the words the index uses, so it is written in one place and cannot drift.
 *
 * One file for four pages, as dev-tag.js is, and for the same reason: each page
 * keeps its own stylesheet, so this builds its own nodes and its own style.
 * Nothing is fetched until the wordmark is pressed.
 */

const ABOUT = "/how-it-works";

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

/* Which publication the page is serving, in a sentence. A read that fails says
 * so rather than naming nothing. */
async function publicationLine() {
  const line = node("p");
  try {
    const pin = pinned();
    const response = await fetch("/api/reader/publication"
      + (pin ? `?publication=${encodeURIComponent(pin)}` : ""));
    if (!response.ok) throw new Error(String(response.status));
    const publication = await response.json();
    const date = new Date(publication.published_at).toLocaleDateString("en-GB",
      { day: "numeric", month: "long", year: "numeric" });
    const id = node("code", "", String(publication.id).slice(0, 8));
    if (publication.is_public === false) {
      line.append(document.createTextNode("You are reading draft publication "), id,
        document.createTextNode(`, built on ${date}. It has not been made public.`));
    } else {
      line.append(document.createTextNode("You are reading publication "), id,
        document.createTextNode(`, published on ${date}.`));
    }
  } catch {
    line.textContent = "The publication on this page could not be read.";
  }
  return line;
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

const state = { pop: null, wordmark: null, filled: false, closedAt: 0 };

function place() {
  const { pop, wordmark } = state;
  if (!pop.matches(":popover-open")) return;
  const header = wordmark.closest(".site-header") || wordmark;
  const top = header.getBoundingClientRect().bottom + 6;
  const left = Math.max(8, Math.min(wordmark.getBoundingClientRect().left - 8,
    window.innerWidth - pop.offsetWidth - 8));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

async function fill() {
  const { pop } = state;
  const close = node("button", "brand-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => pop.hidePopover());
  const title = node("h2", "", "AI Constitutions Index");
  title.id = "brand-pop-title";
  const log = node("p");
  const link = node("a", "", "Read the change log");
  link.href = `${ABOUT}#changelog`;
  log.append(link);
  pop.replaceChildren(close, title, node("p", "", "Loading."));
  const [line, why] = await Promise.all([publicationLine(), whyTheName()]);
  pop.replaceChildren(close, title, line, log);
  if (why) pop.append(node("h3", "", "Why this name"), why);
  state.filled = true;
  place();
}

function toggle(event) {
  event.preventDefault();
  const { pop } = state;
  // A press on the wordmark while the note is open closes it by light dismiss
  // on the way down; the click that follows must not open it again.
  if (performance.now() - state.closedAt < 300) return;
  if (pop.matches(":popover-open")) {
    pop.hidePopover();
    return;
  }
  pop.showPopover();
  place();
  pop.focus({ preventScroll: true });
  if (!state.filled) fill();
}

function start() {
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
  pop.addEventListener("toggle", event => {
    wordmark.setAttribute("aria-expanded", String(event.newState === "open"));
  });
  pop.addEventListener("beforetoggle", event => {
    if (event.newState !== "closed") return;
    state.closedAt = performance.now();
    if (pop.contains(document.activeElement)) wordmark.focus({ preventScroll: true });
  });
  wordmark.addEventListener("click", toggle);
  window.addEventListener("resize", place, { passive: true });

  Object.assign(state, { pop, wordmark });
}

start();
