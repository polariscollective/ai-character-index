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
 * WHICH BUILD IS ON SCREEN
 *
 * These pages are static files copied into public/, identical in every
 * environment, so nothing the platform knows reaches them at build time. What
 * reaches them is a route: /api/reader/publication answers with the build this
 * page is serving and says where it stands, published, not yet published, or
 * superseded by a later one. The note carries that sentence, and a superseded
 * build also raises a second tag beside the first, because a reader who follows
 * a shared link has no other way to know the figures have moved on.
 *
 * A request that fails changes nothing but the sentence it would have added.
 * The two sentences hold whatever the network does.
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
 * does, and a reader who has just been told this build is unpublished is owed
 * somewhere to go. */
const PUBLISHED = "https://ai-constitutions-index.polariscollective.org";

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
.dev-older {
  align-self: center;
  margin-left: 6px;
  padding: 2px 8px;
  border: 1px solid #5C6B3C;
  border-radius: 999px;
  color: #5C6B3C;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: .01em;
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
.dev-note .dev-more p:last-child { margin-bottom: 14px; }
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
  "What is published here may still change.",
  "The method comes from working papers, and every figure rests on published "
  + "documents that anyone can check.",
];

/* Where the build on screen stands, in the route's own words. */
const STANDING = {
  published: "This page shows the index as published.",
  unpublished: "This page shows a build that nobody has published yet.",
  superseded: "This page shows an earlier publication of the index.",
};

function paragraph(text) {
  const node = document.createElement("p");
  node.textContent = text;
  return node;
}

/* The tag, the note behind it, and an empty block inside the note for whatever
 * the route turns out to say. */
function build(brand) {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  const note = document.createElement("dialog");
  note.className = "dev-note";
  const title = document.createElement("h2");
  title.textContent = "Work in progress";
  const more = document.createElement("div");
  more.className = "dev-more";
  note.append(title, ...LINES.map(paragraph), more);

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
  tag.append(document.createTextNode("Work in progress "), ask);
  tag.title = "What this means";
  tag.addEventListener("click", () => note.showModal());

  brand.append(tag);
  document.body.append(note);
  return more;
}

/* The sentence about the build on screen, and the one about the deployment.
 * Both are added once the route answers, so the note is complete from the
 * moment it opens for anyone but the fastest reader. */
async function describe(more, brand) {
  const pin = new URLSearchParams(location.search).get("publication");
  try {
    const response = await fetch("/api/reader/publication"
      + (pin ? `?publication=${encodeURIComponent(pin)}` : ""));
    if (!response.ok) return;
    const publication = await response.json();
    if (STANDING[publication.standing]) {
      more.append(paragraph(STANDING[publication.standing]));
    }
    if (publication.standing === "superseded") {
      const older = document.createElement("span");
      older.className = "dev-older";
      older.textContent = "Older version";
      brand.append(older);
    }
    /* Exactly true, never merely truthy: a route that answered without the
     * field would otherwise make a claim about where you are that nobody has
     * grounds for. */
    if (publication.development === true) {
      more.append(paragraph(
        "This deployment shows builds of the index before anyone has published them."));
      const out = document.createElement("p");
      const link = document.createElement("a");
      link.href = PUBLISHED;
      // Its own tab: whoever is reading an unpublished build is usually in the
      // middle of looking at something, and sending them away from it to check a
      // figure against the published one costs them their place. noopener
      // because a page opened this way otherwise keeps a handle on the one that
      // opened it.
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "the published index";
      out.append(document.createTextNode("For readings that have been published, see "),
                 link, document.createTextNode("."));
      more.append(out);
    }
  } catch {
    // No answer is no claim.
  }
}

function start() {
  const brand = document.querySelector(".site-brand");
  if (!brand) return;
  describe(build(brand), brand);
}

start();
