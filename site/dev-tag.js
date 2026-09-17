/* The mark beside the wordmark on a deployment showing unpublished work.
 *
 * WHAT DECIDES IT
 *
 * Not the domain, and not a build-time variable. These pages are static files
 * copied into public/, identical in every environment, so nothing the platform
 * knows reaches them at build time. What reaches them is a route, and the route
 * already answers the question that matters: /api/reader/publication carries
 * is_public, which is an operator saying they have looked at this build. A
 * development deployment serves the newest build whether or not anyone has.
 *
 * So the tag appears when the publication on screen has not been published. That
 * is a claim about what you are reading rather than about where it is hosted,
 * which is the honest version of the warning: a development deployment serving a
 * published build has nothing to warn anyone about, and a published surface that
 * somehow served a draft would want to say so.
 *
 * A request that fails changes nothing. A warning raised because the network
 * stuttered would teach a reader to ignore it.
 *
 * WHY IT IS ONE FILE
 *
 * Four pages carry this header and each keeps its own stylesheet. Copied four
 * times, the tag and its wording would drift the first time one of them was
 * edited, and the page nobody remembered would be the one making the weaker
 * claim. Everything here is built as nodes: a page gains one script tag.
 */

/* Where the published index lives. Written down rather than derived: a
 * deployment showing unpublished work cannot know the address of the one that
 * does, and a reader who has just been told this build is provisional is owed
 * somewhere to go. */
const PUBLISHED = "https://ai-character-index.polariscollective.org";

const STYLE = `
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
`;

/* Said about the index rather than about this branch: whoever reads it is being
 * told what a figure on this page is worth, not what a team is working on. */
const LINES = [
  "This deployment shows builds of the index before anyone has published them. "
  + "What is on screen has not been reviewed, and it is here so that it can be.",
  "Treat the readings as provisional. A judgement may rest on a method still "
  + "being settled, and a figure or a comparison shown here may never have been "
  + "read a second time, nor checked against models from a different provider. "
  + "Nothing here has been through the review a published build goes through.",
];

function paragraph(text) {
  const node = document.createElement("p");
  node.textContent = text;
  return node;
}

function build(brand) {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  const note = document.createElement("dialog");
  note.className = "dev-note";
  const title = document.createElement("h2");
  title.textContent = "This is a development build";
  note.append(title, ...LINES.map(paragraph));

  const out = document.createElement("p");
  const link = document.createElement("a");
  link.href = PUBLISHED;
  // Its own tab: whoever is reading a development build is usually in the middle
  // of looking at something, and sending them away from it to check a figure
  // against the published one costs them their place. noopener because a page
  // opened this way otherwise keeps a handle on the one that opened it.
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "the published index";
  out.append(document.createTextNode("For readings that have been published, see "),
             link, document.createTextNode("."));
  note.append(out);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "dev-close";
  close.textContent = "Close";
  close.addEventListener("click", () => note.close());
  note.append(close);

  const tag = document.createElement("button");
  tag.type = "button";
  tag.className = "dev-tag";
  tag.textContent = "Development";
  tag.title = "This deployment shows unpublished builds";
  tag.addEventListener("click", () => note.showModal());

  brand.append(tag);
  document.body.append(note);
}

async function start() {
  const brand = document.querySelector(".site-brand");
  if (!brand) return;
  try {
    const response = await fetch("/api/reader/publication");
    if (!response.ok) return;
    const publication = await response.json();
    // Exactly false, not merely falsy: a route that answered without the field
    // would otherwise raise a warning it has no grounds for.
    if (publication.is_public === false) build(brand);
  } catch {
    // No answer is no claim.
  }
}

start();
