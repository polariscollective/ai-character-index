/* The mark beside the wordmark, on every deployment.
 *
 * WHAT IT SAYS
 *
 * The index is being built in the open. A figure on any page of it may move,
 * and a reader who is about to quote one is owed that before they do. So the
 * tag is raised everywhere, production included, and says in two sentences what
 * a figure here is worth: that what is published may still change, and where
 * the method and the figures come from.
 *
 * WHAT IT DOES NOT SAY
 *
 * Which publication is on screen, and whether it is a development build or an
 * older version, is the badge beside the wordmark's to say (brand.js), since 24
 * September 2026. This note says only what holds of every build.
 *
 * WHY IT IS ONE FILE
 *
 * Four pages carry this header and each keeps its own stylesheet. Copied four
 * times, the tag and its wording would drift the first time one of them was
 * edited, and the page nobody remembered would be the one making the weaker
 * claim. Everything here is built as nodes: a page gains one script tag.
 */

import { isLocal, readsFiles, setReadsFiles } from "./publication-data.js";
import { keepPosted } from "./keep-posted.js";

const STYLE = `
/* Before the menu, it takes the free width on its left, so it sits against the
   menu rather than in the middle of the header. */
.dev-tag.beside-menu {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); margin: 0;
}
/* Where the header is too narrow for the name, the tag and the menu side by
   side, the tag goes back into the flow, just before the menu. */
@media (max-width: 900px) {
  .dev-tag.beside-menu { position: static; transform: none; margin-left: auto; margin-right: 12px; }
}
.dev-tag {
  align-self: center;
  margin-left: 2px;
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: #A0522D;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: .01em;
  cursor: pointer;
}
.dev-tag:hover { background: #A0522D; color: #F1EFE3; }
.dev-tag:focus-visible { outline: 2px solid #B7C94B; outline-offset: 2px; }
.dev-ask {
  display: inline-grid;
  place-items: center;
  width: 13px;
  height: 13px;
  margin-left: 1px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  vertical-align: 1px;
}
.dev-note {
  /* What centres a modal is its auto margin, and two of the four pages carry a
     universal reset that zeroes every margin: without this the note opens in the
     top left corner there and centred everywhere else. Their own proposal dialog
     puts it back the same way, with the same note beside it.

     No backticks in here, ever. This block is a template literal, and one
     backtick in a comment closes it: what followed became an object literal
     applied to a parenthesis, the page threw on load, and the tag never built.
     node --check saw nothing, because the result is still valid JavaScript. */
  margin: auto;
  width: min(460px, calc(100vw - 32px));
  /* The note runs to five paragraphs on a development deployment showing an
     older publication, which is taller than a phone. It scrolls rather than
     being cut off at the bottom of the screen. */
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 18px 20px 20px;
  border: 1px solid #5C6B3C;
  border-radius: 4px;
  background: #F1EFE3;
  color: #23281B;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.55;
}
.dev-note::backdrop { background: rgb(35 40 27 / .5); }
.dev-note h2 {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
}
.dev-note p { margin: 0 0 10px; }
.dev-note p:last-of-type { margin-bottom: 14px; }
.dev-note a { color: #23281B; text-decoration: underline 2px #B7C94B; text-underline-offset: 3px; }
.dev-note a:hover { background: #B7C94B; }
.dev-note .dev-keep { margin: 4px 0 16px; padding-top: 12px; border-top: 1px solid rgb(92 107 60 / .25); }
.dev-note .dev-close {
  padding: 6px 14px;
  border: 1px solid #5C6B3C;
  border-radius: 999px;
  background: transparent;
  color: #23281B;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dev-note .dev-close:hover { background: #B7C94B; }

/* On a developer's machine only: which source the boards are read from. Two
   buttons in one pill, the pressed one filled. */
.dev-source {
  align-self: center;
  display: inline-flex;
  margin-left: 6px;
  border: 1px solid #5C6B3C;
  border-radius: 999px;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.5;
}
.dev-source button {
  padding: 2px 8px;
  border: 0;
  background: transparent;
  color: #23281B;
  font: inherit;
  cursor: pointer;
}
.dev-source button[aria-pressed="true"] { background: #333D22; color: #F1EFE3; }
.dev-source button:hover { background: #B7C94B; color: #23281B; }
.dev-source button:focus-visible { outline: 2px solid #B7C94B; outline-offset: -2px; }

/* On a phone.
 *
 * The tag is a button, and at 11px with two pixels of padding it stood 21px
 * tall, which is a target for a pointer and not for a thumb. It grows to 32
 * here rather than to the 44 the platforms ask for, because it sits on the
 * brand line of a 54px header and a 44px pill would set the height of the
 * whole header. The note it opens takes the full width of the screen, less a
 * gutter, and its Close is a proper target.
 *
 * Nothing below moves the wording. What a figure on this page is worth is the
 * same claim on a phone as on a desk. */
@media (max-width: 700px) {
  .dev-tag { min-height: 32px; padding: 5px 10px; }
  .dev-note {
    width: calc(100vw - 16px);
    /* A modal dialog is capped by the browser's own max-width, the window less
       six pixels and two of its own ems. Left alone, that is what decides the
       width here and the line above decides nothing. */
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
    padding: 16px;
  }
  .dev-note .dev-close { min-height: 44px; padding: 10px 18px; font-size: 14px; }
}
`;

/* Said about the index rather than about this build: whoever reads it is being
 * told what a figure on this page is worth. */
const LINES = [
  "This index is confidential while it is being built. Please do not share it, "
  + "or quote from it, publicly.",
  "What is published here may still change.",
  "The method comes from working papers, and every figure rests on published "
  + "documents that anyone can check.",
  "Any feedback is welcome. You can use the Feedback button at the bottom right "
  + "of your screen.",
];

function paragraph(text) {
  const node = document.createElement("p");
  node.textContent = text;
  return node;
}

/* The tag and the note behind it. */
function build(brand) {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  const note = document.createElement("dialog");
  note.className = "dev-note";
  const title = document.createElement("h2");
  title.textContent = "Confidential, work in progress";
  note.append(title, ...LINES.map(paragraph));
  // A reader who wants to know when the index is released leaves an address
  // here, filed as a note (keep-posted.js).
  const posted = keepPosted("Hear about updates and the official release.");
  posted.classList.add("dev-keep");
  note.append(posted);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "dev-close";
  close.textContent = "Close";
  close.addEventListener("click", () => note.close());
  note.append(close);

  const tag = document.createElement("button");
  tag.type = "button";
  tag.className = "dev-tag";
  // The question mark is the whole of the invitation: a pill that says nothing
  // else looks like a label, and nobody presses a label.
  const ask = document.createElement("span");
  ask.className = "dev-ask";
  ask.setAttribute("aria-hidden", "true");
  ask.textContent = "?";
  tag.append(document.createTextNode("Confidential - WIP "), ask);
  tag.title = "What this means";
  tag.addEventListener("click", () => note.showModal());

  // In the middle of the whole header rather than beside the name: the name and
  // the publication's date read as one block, and the tag is about the whole
  // site. Centred on the header's width, not on the space the name and the menu
  // leave. Beside the name still where a page has no menu.
  const header = brand.closest(".site-header");
  const nav = header?.querySelector("nav");
  if (nav) {
    if (getComputedStyle(header).position === "static") header.style.position = "relative";
    tag.classList.add("beside-menu");
    nav.before(tag);
  } else {
    brand.append(tag);
  }
  document.body.append(note);
}

/* Publication or the files in the repository, for the two boards. Changing it
 * reloads, because each board reads its data once, when the page opens. */
function sourceSwitch(brand) {
  const group = document.createElement("span");
  group.className = "dev-source";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Read the boards from");
  const files = readsFiles();
  for (const [label, on, title] of [
    ["Publication", false, "The boards as the publication being served froze them"],
    ["Repository files", true, "site/constitutions.json and site/governance.json as they stand now"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-pressed", String(on === files));
    button.addEventListener("click", () => {
      if (on === files) return;
      setReadsFiles(on);
      location.reload();
    });
    group.append(button);
  }
  brand.append(group);
}

function start() {
  const brand = document.querySelector(".site-brand");
  if (!brand) return;
  build(brand);
  if (isLocal()) sourceSwitch(brand);
}

start();
