/**
 * The bubble that photographs the page it is on.
 *
 * WHAT IT IS FOR
 *
 * Two forms already take words from outside. /about takes a proposal, which is
 * somebody asking us to run something. The reader's paragraph dialog takes a
 * note about one paragraph, which is somebody disagreeing with a panel's
 * reading. Neither takes the third and commonest thing anybody has to offer:
 * this page is broken, this table runs off my phone, this heading says the
 * wrong date. That report is mostly a picture, and a sentence describing a
 * layout fault is a sentence somebody has to reconstruct into a screen.
 *
 * WHY IT IS ONE FILE
 *
 * Four pages carry it and each keeps its own stylesheet. Copied four times, the
 * wording and the route would drift the first time one of them was edited.
 * Everything here is built as nodes: a page gains one script tag. That is
 * dev-tag.js's reasoning and dev-tag.js's shape.
 *
 * NO BACKTICK MAY APPEAR INSIDE STYLE, COMMENTS INCLUDED. One backtick closes
 * the literal, what follows is still valid JavaScript, node --check sees
 * nothing, and the page throws on load. dev-tag.js learned that the hard way.
 */

const ROUTE = "/api/page-feedback";

/* The same key the reader's paragraph dialog writes. One person, one site, one
 * address: typing it into one dialog should save typing it into the other. */
const REMEMBER = "aci-feedback-email";

const LIBRARY = "/vendor/html2canvas.min.js";

/* What the image may weigh before it is halved and re-encoded. The route
 * refuses more, and a page of flat colour and sharp text rarely reaches it. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/* What the capture is filed as. Stored on the row so that a later method is
 * distinguishable in the record rather than silently replacing this one. */
const METHOD = "html2canvas";

const STYLE = `
.pf-pill {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 90;
  padding: 9px 18px;
  border: 0;
  border-radius: 999px;
  background: #333D22;
  color: #F1EFE3;
  font-family: "Instrument Sans", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
  transition: background 150ms, color 150ms;
}
.pf-pill:hover { background: #B7C94B; color: #23281B; }
.pf-pill:focus-visible { outline: 2px solid #B7C94B; outline-offset: 2px; }

.pf-note {
  /* What centres a modal is its auto margin, and two of the four pages carry a
     universal reset that zeroes every margin: without this the dialog opens in
     the top left corner there and centred everywhere else. dev-tag.js puts it
     back the same way, with the same note beside it. */
  margin: auto;
  width: min(820px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  padding: 18px 20px 20px;
  border: 1px solid #5C6B3C;
  border-radius: 4px;
  background: #F1EFE3;
  color: #23281B;
  font-family: "Instrument Sans", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.55;
}
.pf-note::backdrop { background: rgb(35 40 27 / .5); }
.pf-note h2 { margin: 0; font-size: 16px; font-weight: 600; }
.pf-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 12px;
}
.pf-close {
  flex: none;
  padding: 2px 6px;
  border: 0;
  background: none;
  color: #5C6B3C;
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background 150ms, color 150ms;
}
.pf-close:hover { background: #B7C94B; color: #23281B; }
.pf-close:focus-visible { outline: 2px solid #B7C94B; outline-offset: 2px; }
.pf-note label { display: block; margin: 0 0 4px; font-weight: 600; }
.pf-note textarea,
.pf-note input[type="email"] {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #5C6B3C;
  border-radius: 4px;
  background: #F1EFE3;
  color: #23281B;
  font: inherit;
}
.pf-note textarea { min-height: 84px; resize: vertical; }
.pf-note textarea:focus-visible,
.pf-note input:focus-visible { outline: 2px solid #B7C94B; outline-offset: 1px; }
.pf-field { margin: 0 0 12px; }
.pf-why { margin: 4px 0 0; font-size: 12px; color: #5C6B3C; }
.pf-trap { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.pf-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0 0; }
.pf-send,
.pf-cancel {
  padding: 8px 18px;
  border-radius: 999px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms, color 150ms;
}
.pf-send { border: 0; background: #333D22; color: #F1EFE3; }
.pf-send:hover:not(:disabled) { background: #B7C94B; color: #23281B; }
.pf-send:disabled { opacity: .5; cursor: default; }
.pf-cancel { border: 1px solid #5C6B3C; background: transparent; color: #23281B; }
.pf-cancel:hover { background: #B7C94B; }
.pf-send:focus-visible,
.pf-cancel:focus-visible { outline: 2px solid #B7C94B; outline-offset: 2px; }
.pf-said { margin: 10px 0 0; min-height: 1.55em; }
.pf-said.bad { color: #A0522D; }

.pf-shot {
  position: relative;
  margin: 0 0 8px;
  border: 1px solid #5C6B3C;
  background: #F1EFE3;
}
.pf-shot img { display: block; width: 100%; height: auto; }
.pf-waiting { margin: 0; padding: 24px 16px; color: #5C6B3C; }
.pf-drop {
  padding: 4px 12px;
  border: 1px solid #5C6B3C;
  border-radius: 999px;
  background: transparent;
  color: #23281B;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.pf-drop:hover { background: #B7C94B; }
.pf-drop:focus-visible { outline: 2px solid #B7C94B; outline-offset: 2px; }

.pf-shot canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
}
.pf-tool, .pf-swatch {
  padding: 4px 12px;
  border: 1px solid #5C6B3C;
  border-radius: 999px;
  background: transparent;
  color: #23281B;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.pf-tool[aria-pressed="true"] { background: #333D22; color: #F1EFE3; border-color: #333D22; }
.pf-tool:hover, .pf-swatch:hover { background: #B7C94B; color: #23281B; }
.pf-tool:focus-visible, .pf-swatch:focus-visible {
  outline: 2px solid #B7C94B;
  outline-offset: 2px;
}
.pf-swatch { width: 28px; padding: 4px 0; }
.pf-swatch[aria-pressed="true"] { border-width: 3px; }
.pf-tool { display: inline-flex; align-items: center; gap: 6px; }
.pf-tool svg { flex: none; }
.pf-note .pf-why a {
  color: #23281B;
  text-decoration: underline 2px #B7C94B;
  text-underline-offset: 3px;
}
.pf-note .pf-why a:hover { background: #B7C94B; }
.pf-typing {
  position: absolute;
  z-index: 1;
  min-width: 140px;
  padding: 0 2px;
  border: 1px dashed #5C6B3C;
  border-radius: 2px;
  background: rgb(241 239 227 / .85);
  font-family: "Instrument Sans", system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.2;
}
.pf-typing:focus-visible { outline: 2px solid #B7C94B; outline-offset: 0; }

@media (prefers-reduced-motion: reduce) {
  .pf-pill, .pf-send, .pf-cancel { transition: none; }
}

/* ---------- on a phone ----------
 *
 * A photograph of a phone is twice as tall as it is wide, so at 390px the
 * picture alone was 677 pixels of a dialog 794 tall: the comment field, the
 * address field and Send were all below it, and nothing on the screen said so.
 * The dialog scrolled, which is to say they were reachable by somebody who
 * already knew they were there.
 *
 * The picture keeps its width, because shrinking it to fit the form beside it
 * would leave a strip 180 pixels wide to draw a box on with a thumb, and
 * pointing at the fault is what the picture is for. What changes is that Send
 * and Cancel stay at the foot of the dialog while it scrolls, so the form is
 * announced by its own buttons and the primary action is never hunted for.
 * They are laid over the dialog's side padding by a negative margin, otherwise
 * the text scrolling past would show through the gutters beside them.
 *
 * The fields are set at 16px here and not at the dialog's 14px: iOS zooms the
 * page in on a field smaller than that as it takes focus, and leaves it zoomed
 * in on the picture afterwards.
 *
 * The tool row, the two colours, Undo, Clear and the close cross grow to what a
 * thumb can hit. The pill itself is 39px tall, which is enough, so it only
 * moves in a little.
 *
 * The dialog is measured in dvh as well as vh: a phone browser counts its own
 * toolbars in vh, so a dialog 48px short of 100vh still runs under the address
 * bar. The vh line stays first for whatever does not know dvh. */
@media (max-width: 560px) {
  .pf-pill { right: 12px; bottom: 12px; }
  /* The pill is fixed, so on a phone it sits on the last thing the page has to
     say, and on the prose pages that is the footer: the licence line and the
     link to the standalone original were underneath it. The gutter is asked for
     here rather than on each page because the pill is what needs it. The
     reader's own footer is a bar of a fixed height that its shell subtracts
     from the window, so it is left alone and the pill overlaps the credit
     there. */
  footer:not(.site-footer) { padding-bottom: 64px; }
  .pf-note {
    width: calc(100vw - 16px);
    /* A modal dialog is capped by the browser's own max-width, the window less
       six pixels and two of its own ems. Left alone, that is what decides the
       width here and the line above decides nothing. */
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
    padding: 16px 16px 0;
  }
  .pf-note textarea,
  .pf-note input[type="email"] { font-size: 16px; }
  .pf-close { min-width: 44px; min-height: 44px; font-size: 22px; }
  .pf-tool, .pf-swatch, .pf-drop { min-height: 40px; padding: 8px 10px; }
  .pf-swatch { width: 40px; padding: 8px 0; }
  .pf-send, .pf-cancel { min-height: 44px; padding: 10px 20px; }
  .pf-actions {
    position: sticky;
    bottom: 0;
    z-index: 2;
    margin: 16px -16px 0;
    padding: 8px 16px 16px;
    border-top: 1px solid #5C6B3C;
    background: #F1EFE3;
  }
}
`;

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids.filter(kid => kid !== null && kid !== undefined));
  return node;
}

function remembered() {
  try {
    return localStorage.getItem(REMEMBER) || "";
  } catch {
    return "";        // a private window, or site data blocked
  }
}

function remember(address) {
  try {
    localStorage.setItem(REMEMBER, address);
  } catch {
    // Not worth a word to the sender: their report is already sent.
  }
}

function say(node, words, bad) {
  node.textContent = words;
  node.className = bad ? "pf-said bad" : "pf-said";
}

/* What the dialog is holding: the photograph, the marks drawn on it, and
 * whether the sender said they did not want the photograph after all. Reset
 * every time the pill is pressed. */
const state = { base: null, shapes: [], dropped: false, where: "" };

let library = null;

/** Load html2canvas once, on the first press, and never on page load. */
function loadLibrary() {
  if (library) return library;
  library = new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = LIBRARY;
    tag.addEventListener("load", () => resolve(window.html2canvas));
    tag.addEventListener("error", () => reject(new Error("the library did not load")));
    document.head.append(tag);
  });
  return library;
}

/* Where a sticky element really is, written onto it so the clone can be told.
 *
 * html2canvas draws a sticky element at its STATIC position, so a reader who
 * has scrolled would otherwise send a capture with the header they were
 * looking at missing from the top and floating somewhere up the page. All four
 * pages use sticky: the header on each, the contents rail on two, and a table
 * header and a tab bar on the overview.
 *
 * What is written is the SHIFT, and the clone is told to be relative rather
 * than absolute. That is the whole of the lesson from the first attempt:
 * absolute takes an element out of flow, and an element out of flow takes its
 * space with it. A table header pinned that way collapsed onto its own rows,
 * and a contents rail pinned that way let the flex sibling beside it swallow
 * the column it had been sitting in. Sticky never leaves the flow. It occupies
 * its static place and is painted elsewhere, which is what relative does.
 *
 * The shift is measured rather than derived. Every sticky element is turned
 * static at once, measured, and turned back, inside one synchronous block, so
 * the browser never paints the state in between. Deriving it from offsetTop
 * instead would depend on whether a browser folds the sticky offset into that
 * property, which is not a thing to bet a capture on. */
function tagSticky() {
  const sticky = [];
  for (const node of document.querySelectorAll("body *")) {
    if (getComputedStyle(node).position === "sticky") sticky.push(node);
  }
  if (!sticky.length) return sticky;

  const painted = sticky.map(node => node.getBoundingClientRect());
  const was = sticky.map(node => node.style.position);
  let settled;
  try {
    for (const node of sticky) node.style.position = "static";
    settled = sticky.map(node => node.getBoundingClientRect());
  } finally {
    // A page whose headers stopped sticking because a measurement threw would
    // be a page this broke, permanently, in order to take a picture of it.
    sticky.forEach((node, i) => { node.style.position = was[i]; });
  }

  sticky.forEach((node, i) => {
    node.dataset.pfSticky = JSON.stringify({
      top: painted[i].top - settled[i].top,
      left: painted[i].left - settled[i].left,
    });
  });
  return sticky;
}

/* Shift them in the clone, in place, leaving their space where it was. Matched
 * by attribute rather than by walking the two trees in parallel, because
 * nothing guarantees the clone is node for node identical to the document it
 * came from. */
function pinSticky(clone) {
  for (const node of clone.querySelectorAll("[data-pf-sticky]")) {
    let by;
    try {
      by = JSON.parse(node.dataset.pfSticky);
    } catch {
      continue;
    }
    node.style.position = "relative";
    node.style.top = `${by.top}px`;
    node.style.left = `${by.left}px`;
  }
}

/* How far a scrollable element inside the page has been scrolled.
 *
 * The prose pages scroll the window and the reader does not: it scrolls its
 * own document column, so window.scrollY stays at zero however far down
 * somebody has read. html2canvas crops the capture at the window's scroll and
 * draws each element from its own top, so without this the reader sends a
 * picture of a passage they were not looking at. */
function tagScrolled() {
  const scrolled = [];
  for (const node of document.querySelectorAll("body *")) {
    if (!node.scrollTop && !node.scrollLeft) continue;
    node.dataset.pfScrolled = JSON.stringify({
      top: node.scrollTop, left: node.scrollLeft,
    });
    scrolled.push(node);
  }
  return scrolled;
}

/* Put the clone's copies where their originals were scrolled to. The clone is
 * a live document in an iframe, so its elements really do scroll. */
function rescroll(clone) {
  for (const node of clone.querySelectorAll("[data-pf-scrolled]")) {
    let to;
    try {
      to = JSON.parse(node.dataset.pfScrolled);
    } catch {
      continue;
    }
    /* Instantly, and this is the whole of the fix rather than a nicety. The
     * reader asks for `scroll-behavior: smooth` on its document column, which
     * the clone inherits, and a smooth programmatic scroll does not take
     * effect on the spot: the clone is painted before the animation has run,
     * so the assignment silently landed on zero and the capture came back
     * showing the top of the document. Every test that ever passed here had
     * set scroll-behavior to auto on the live element in order to position
     * it, and the clone inherited that too, so the tests had built the one
     * condition under which the bug could not appear. */
    node.style.scrollBehavior = "auto";
    node.scrollTop = to.top;
    node.scrollLeft = to.left;
  }
}

/* A dialog or a popover that is open right now.
 *
 * Both live in the top layer, which the cloned document has no notion of: in
 * the clone a dialog is an ordinary element again and a popover is back to
 * display: none. Measured here and forced back into place there, because a
 * reader who wants to report something about a note has to be able to
 * photograph the note.
 *
 * Fixed rather than relative, unlike a sticky element: a pop-up genuinely is
 * out of flow on the real page, so putting it out of flow in the clone is
 * what matches rather than what breaks. */
function tagFloating(mine) {
  const floating = [];
  for (const node of document.querySelectorAll("dialog[open], [popover]")) {
    if (mine.includes(node) || mine.some(ours => ours.contains(node))) continue;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) continue;   // a popover nobody has opened
    node.dataset.pfFloating = JSON.stringify({
      top: box.top, left: box.left, width: box.width, height: box.height,
    });
    floating.push(node);
  }
  return floating;
}

function placeFloating(clone) {
  for (const node of clone.querySelectorAll("[data-pf-floating]")) {
    let box;
    try {
      box = JSON.parse(node.dataset.pfFloating);
    } catch {
      continue;
    }
    node.style.display = "block";
    node.style.position = "fixed";
    node.style.margin = "0";
    node.style.top = `${box.top}px`;
    node.style.left = `${box.left}px`;
    node.style.width = `${box.width}px`;
    node.style.maxHeight = `${box.height}px`;
    // Above the page, below nothing: it was the top layer a moment ago.
    node.style.zIndex = "2147483646";
  }
}

/**
 * Photograph the visible viewport.
 *
 * The viewport and not the whole document: that is what a screenshot of the
 * page means to the person pressing the button, and the reader scrolled out to
 * its full height is twenty thousand pixels nobody asked for.
 *
 * `ignoreElements` keeps our own pill and dialog out of the picture, which is
 * what lets the dialog be open while this runs. Without it the capture would
 * have to happen before anything appeared on screen, and a second of nothing
 * after a click reads as a broken button.
 */
async function capture(mine, floating = null) {
  const html2canvas = await loadLibrary();
  const sticky = tagSticky();
  const scrolled = tagScrolled();
  /* Tagged by the caller when it had to be done before a dialog opened, and
   * tagged here when the caller had no such trouble. */
  const pinned = floating || tagFloating(mine);
  try {
    return await html2canvas(document.body, {
      x: window.scrollX,
      y: window.scrollY,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      scale: Math.min(2, window.devicePixelRatio || 1),
      logging: false,
      useCORS: true,
      ignoreElements: node => mine.includes(node),
      onclone: clone => {
        pinSticky(clone);
        rescroll(clone);
        placeFloating(clone);
      },
    });
  } finally {
    for (const node of sticky) delete node.dataset.pfSticky;
    for (const node of scrolled) delete node.dataset.pfScrolled;
    for (const node of pinned) delete node.dataset.pfFloating;
  }
}

function blobOf(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

/**
 * The photograph and the marks, as one PNG.
 *
 * PNG rather than JPEG because these pages are flat areas of four colours and
 * sharp text, which is what PNG compresses well and JPEG smears. One retry at
 * half the linear size if the first encoding is over the cap, and no more: a
 * loop here would be a page that never sends.
 */
async function compose(base, shapes) {
  const out = document.createElement("canvas");
  out.width = base.width;
  out.height = base.height;
  const ink = out.getContext("2d");
  ink.drawImage(base, 0, 0);
  for (const shape of shapes) draw(ink, shape);

  let blob = await blobOf(out);
  if (blob && blob.size > MAX_IMAGE_BYTES) {
    const small = document.createElement("canvas");
    small.width = Math.round(out.width / 2);
    small.height = Math.round(out.height / 2);
    small.getContext("2d").drawImage(out, 0, 0, small.width, small.height);
    blob = await blobOf(small);
  }
  return blob;
}

/* Three CSS pixels, scaled by the ratio between the image's natural width and
 * the width it is shown at, so a mark looks the same whatever the capture scale
 * and whatever the screen. */
const STROKE = 3;

/* Rust by default, the framework's only warm colour and the one it reserves for
 * failure, which is what an annotation on a bug report is. Chartreuse second,
 * for marks that land on an olive-deep band where rust cannot be read. */
const COLOURS = [["fail", "#A0522D"], ["energy", "#B7C94B"]];

/* Sixteen CSS pixels, scaled into the image the same way a stroke is, so what
 * the reader typed is the size they saw themselves type. */
const TEXT_SIZE = 16;

/* The tool glyphs, drawn here rather than fetched. The framework carries no
 * icon library and no emoji, and the reader's copy icons are already inline
 * SVG on a 16 unit grid at 1.4 stroke in currentColor; these are the same
 * hand. The word stays beside the glyph, because a glyph alone is a guess. */
const GLYPH = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"'
  + ' fill="none" stroke="currentColor" stroke-width="1.4"'
  + ' stroke-linecap="round" stroke-linejoin="round">';

const GLYPHS = {
  box: '<rect x="2.7" y="4.2" width="10.6" height="7.6" rx="1"/>',
  circle: '<circle cx="8" cy="8" r="5"/>',
  arrow: '<path d="M3.2 12.8 12.8 3.2M12.8 3.2H8.3M12.8 3.2v4.5"/>',
  pen: '<path d="M3 13l1-3.4 6.1-6.1 2.4 2.4-6.1 6.1z"/>',
  text: '<path d="M3.6 4.2h8.8M8 4.2v7.6"/>',
};

function draw(ink, shape) {
  ink.strokeStyle = shape.colour;
  ink.lineWidth = shape.width;
  ink.lineCap = "round";
  ink.lineJoin = "round";

  if (shape.tool === "text") {
    ink.fillStyle = shape.colour;
    ink.textBaseline = "top";
    ink.font = `${shape.size}px "Instrument Sans", system-ui, sans-serif`;
    ink.fillText(shape.text, shape.at.x, shape.at.y);
    return;
  }

  // The ellipse inscribed in the drag, so a circle is drawn the way a box is
  // and needs nothing of its own in the pointer handling.
  if (shape.tool === "circle") {
    ink.beginPath();
    ink.ellipse((shape.from.x + shape.to.x) / 2, (shape.from.y + shape.to.y) / 2,
                Math.abs(shape.to.x - shape.from.x) / 2,
                Math.abs(shape.to.y - shape.from.y) / 2, 0, 0, Math.PI * 2);
    ink.stroke();
    return;
  }

  if (shape.tool === "box") {
    ink.strokeRect(shape.from.x, shape.from.y,
                   shape.to.x - shape.from.x, shape.to.y - shape.from.y);
    return;
  }

  if (shape.tool === "pen") {
    ink.beginPath();
    shape.points.forEach((point, i) => (i ? ink.lineTo(point.x, point.y)
                                          : ink.moveTo(point.x, point.y)));
    ink.stroke();
    return;
  }

  // An arrow rather than a bare line, because what somebody wants to do with a
  // line is point at something.
  const { from, to } = shape;
  ink.beginPath();
  ink.moveTo(from.x, from.y);
  ink.lineTo(to.x, to.y);
  ink.stroke();
  const along = Math.atan2(to.y - from.y, to.x - from.x);
  const head = Math.min(6 * shape.width,
                        Math.hypot(to.x - from.x, to.y - from.y) / 3);
  for (const turn of [Math.PI / 6, -Math.PI / 6]) {
    ink.beginPath();
    ink.moveTo(to.x, to.y);
    ink.lineTo(to.x - head * Math.cos(along - turn),
               to.y - head * Math.sin(along - turn));
    ink.stroke();
  }
}

/**
 * Send what the dialog holds.
 *
 * The three context fields are named on the form above the button rather than
 * collected quietly. Nothing else leaves the page.
 */
async function send(parts) {
  const { comment, email, trap, said, sendButton, note } = parts;
  const words = comment.value.trim();
  const address = email.value.trim();
  if (!words || !address) return;

  sendButton.disabled = true;
  say(said, "Sending.", false);

  const form = new FormData();
  form.set("comment", words);
  form.set("email", address);
  form.set("page_url", state.where || location.href);
  form.set("viewport",
           `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}`);
  form.set("user_agent", navigator.userAgent);
  form.set("website", trap.value);

  /* Outside the try below, this was a dialog stuck on "Sending." for good.
   * compose draws the capture onto a canvas and reads it back, and reading a
   * canvas back can throw. Losing the picture is recoverable and losing the
   * words is not, so the words go without it, and the reader is told. */
  let lost = false;
  if (state.base) {
    try {
      const picture = await compose(state.base, state.shapes);
      if (picture && picture.size <= MAX_IMAGE_BYTES) {
        form.set("capture_method", METHOD);
        form.set("screenshot", picture, "page.png");
      } else {
        lost = true;
      }
    } catch {
      lost = true;
    }
  }

  try {
    const response = await fetch(ROUTE, {
      method: "POST", body: form, signal: AbortSignal.timeout(30000),
    });
    const outcome = await response.json().catch(() => ({}));
    if (!response.ok) {
      say(said, outcome.problem || "That did not go through. It is worth trying again.", true);
      sendButton.disabled = false;
      return;
    }
    remember(address);
    comment.value = "";
    const thanks = outcome.done || "Thank you. We read every one.";
    say(said, lost
      ? `${thanks} The screenshot could not be attached, so your words went on their own.`
      : thanks, false);
    setTimeout(() => note.close(), 1200);
  } catch {
    say(said, "That did not go through. It is worth trying again.", true);
    sendButton.disabled = false;
  }
}

/* Where a pointer is, in the image's own coordinates. The overlay is stretched
 * by CSS to the width the picture is shown at, so every event has to be scaled
 * back or a mark would land somewhere else on the PNG than it did on screen. */
function at(event, canvas) {
  const box = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - box.left) * (canvas.width / box.width),
    y: (event.clientY - box.top) * (canvas.height / box.height),
  };
}

/** Repaint every committed mark, and the one being drawn. */
function repaint(canvas, drawing) {
  const ink = canvas.getContext("2d");
  ink.clearRect(0, 0, canvas.width, canvas.height);
  for (const shape of state.shapes) draw(ink, shape);
  if (drawing) draw(ink, drawing);
}

/**
 * A field where the pointer landed, for a mark made of words.
 *
 * A real input rather than keystrokes collected by hand, so the caret, the
 * selection, backspace, paste and a phone's own keyboard all work without
 * being reimplemented. It commits on Enter or on losing focus, and an empty
 * one commits nothing, which is the rule a tap that never moved already obeys.
 *
 * The field is placed in display pixels and the shape is stored in image
 * pixels, because those are two different spaces and the picture is usually
 * shown smaller than it is. The field's font size is the one it will be drawn
 * at, so what the reader types is the size they get.
 */
function typeHere(canvas, tools, where, event) {
  const shot = canvas.parentElement;
  const box = canvas.getBoundingClientRect();
  const shown = box.width / canvas.width;

  const field = el("input", { type: "text", className: "pf-typing" });
  field.setAttribute("aria-label", "Text to place on the screenshot");
  field.style.left = `${event.clientX - box.left}px`;
  field.style.top = `${event.clientY - box.top}px`;
  field.style.color = tools.colour;

  // Enter removes the field, and removing a focused element fires blur, so
  // without this the words would be stored twice.
  let done = false;
  const finish = keep => {
    if (done) return;
    done = true;
    const words = field.value.trim();
    field.remove();
    if (!keep || !words) return;
    state.shapes.push({
      tool: "text",
      colour: tools.colour,
      size: TEXT_SIZE / shown,
      at: where,
      text: words,
    });
    repaint(canvas, null);
  };

  field.addEventListener("keydown", key => {
    if (key.key === "Enter") {
      key.preventDefault();
      finish(true);
    }
    if (key.key === "Escape") {
      key.preventDefault();
      finish(false);
    }
  });
  field.addEventListener("blur", () => finish(true));

  shot.append(field);
  field.focus();
}

/**
 * The overlay, sized to the photograph and stretched over it.
 *
 * Marks are held as shapes rather than as pixels, which is what makes undo one
 * line: drop the last entry and repaint. Pointer Events throughout, so mouse,
 * stylus and finger take one path.
 */
function overlay(base, tools) {
  const canvas = el("canvas", { id: "pf-marks" });
  canvas.width = base.width;
  canvas.height = base.height;

  let drawing = null;

  canvas.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (tools.tool === "text") {
      typeHere(canvas, tools, at(event, canvas), event);
      return;
    }
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Throws for a pointer id that is not an active pointer, which is every
      // synthetic event. Capture is a convenience, not the mechanism.
    }
    const start = at(event, canvas);
    const box = canvas.getBoundingClientRect();
    const width = STROKE * (canvas.width / box.width);
    drawing = tools.tool === "pen"
      ? { tool: "pen", colour: tools.colour, width, points: [start] }
      : { tool: tools.tool, colour: tools.colour, width, from: start, to: start };
    repaint(canvas, drawing);
  });

  canvas.addEventListener("pointermove", event => {
    if (!drawing) return;
    const now = at(event, canvas);
    if (drawing.tool === "pen") drawing.points.push(now);
    else drawing.to = now;
    repaint(canvas, drawing);
  });

  const finish = () => {
    if (!drawing) return;
    // A tap that never moved is not a mark: it would store a zero-length arrow
    // or an empty box that nobody can see and nobody can undo on purpose.
    const moved = drawing.tool === "pen"
      ? drawing.points.length > 1
      : Math.hypot(drawing.to.x - drawing.from.x, drawing.to.y - drawing.from.y) > 2;
    if (moved) state.shapes.push(drawing);
    drawing = null;
    repaint(canvas, null);
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);

  return canvas;
}

/**
 * Keep the pill somewhere it can be pressed.
 *
 * A modal dialog makes everything outside its own subtree inert, and the top
 * layer is no exception: raised into it with showPopover the pill is drawn
 * above the backdrop and still refuses a click and a focus, which was
 * measured against this application before this was written. The one place
 * the platform leaves operable is inside the dialog, so that is where the
 * pill goes while one is open, and back to the body when it closes.
 * `position: fixed` puts it in the same corner either way, because a fixed
 * box is placed against the viewport and not against its parent.
 *
 * This is what lets somebody report a panel: the overview opens its evidence
 * with showModal, and a reader who wants to say that the panel is wrong has
 * to be able to reach the pill while looking at it.
 *
 * Our own dialog is skipped. The pill opened it, and the pill has no business
 * inside the picture it just took.
 */
function follow(pill, note) {
  const settle = () => {
    const open = [...document.querySelectorAll("dialog[open]")].filter(one => one !== note);
    const host = open.length ? open[open.length - 1] : document.body;
    if (pill.parentElement !== host) host.append(pill);
  };
  settle();
  // The open attribute is what showModal and show both set, and it is the
  // only signal either of them gives.
  new MutationObserver(settle).observe(document.documentElement, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
}

function build() {
  document.head.append(el("style", { textContent: STYLE }));

  const comment = el("textarea", { id: "pf-comment", name: "comment", rows: 4 });
  const email = el("input", {
    id: "pf-email", name: "email", type: "email",
    autocomplete: "email", value: remembered(),
  });

  const waiting = el("p", { className: "pf-waiting",
                            textContent: "Photographing the page." });
  const shot = el("div", { className: "pf-shot", id: "pf-shot" }, waiting);
  const drop = el("button", {
    type: "button", className: "pf-drop", id: "pf-drop",
    textContent: "Drop the screenshot",
  });
  drop.hidden = true;
  const shotRow = el("div", { className: "pf-row" }, drop);

  // Hidden from people, filled in by machinery that posts to every form it
  // finds. The route answers it exactly as it answers a real report.
  const trap = el("input", {
    className: "pf-trap", id: "pf-website", name: "website",
    type: "text", tabIndex: -1, autocomplete: "off",
  });
  trap.setAttribute("aria-hidden", "true");

  const said = el("p", { className: "pf-said", id: "pf-said" });
  said.setAttribute("role", "status");

  const sendButton = el("button", {
    type: "button", className: "pf-send", id: "pf-send", textContent: "Send feedback",
  });
  const cancel = el("button", {
    type: "button", className: "pf-cancel", id: "pf-cancel", textContent: "Cancel",
  });

  const tools = { tool: "box", colour: COLOURS[0][1] };

  const toolButton = (name, label) => {
    const button = el("button", {
      type: "button", className: "pf-tool pf-pick", id: `pf-tool-${name}`, textContent: label,
    });
    button.insertAdjacentHTML("afterbegin", `${GLYPH}${GLYPHS[name]}</svg>`);
    button.setAttribute("aria-pressed", String(tools.tool === name));
    button.addEventListener("click", () => {
      tools.tool = name;
      // .pf-pick and not .pf-tool: Undo and Clear wear .pf-tool for its pill
      // styling and are not toggles, and a plain action button carrying
      // aria-pressed is announced as an unpressed switch.
      for (const other of toolbar.querySelectorAll(".pf-pick")) {
        other.setAttribute("aria-pressed", String(other === button));
      }
    });
    return button;
  };

  const swatch = ([name, value]) => {
    const button = el("button", {
      type: "button", className: "pf-swatch", id: `pf-colour-${name}`, textContent: " ",
    });
    button.style.background = value;
    button.setAttribute("aria-label", name === "fail" ? "Rust" : "Chartreuse");
    button.setAttribute("aria-pressed", String(tools.colour === value));
    button.addEventListener("click", () => {
      tools.colour = value;
      for (const other of toolbar.querySelectorAll(".pf-swatch")) {
        other.setAttribute("aria-pressed", String(other === button));
      }
    });
    return button;
  };

  const undo = el("button", {
    type: "button", className: "pf-tool", id: "pf-undo", textContent: "Undo",
  });
  const clear = el("button", {
    type: "button", className: "pf-tool", id: "pf-clear", textContent: "Clear",
  });
  const toolbar = el("div", { className: "pf-row", id: "pf-tools" },
    toolButton("box", "Box"), toolButton("circle", "Circle"),
    toolButton("arrow", "Arrow"), toolButton("pen", "Pen"),
    toolButton("text", "Text"),
    swatch(COLOURS[0]), swatch(COLOURS[1]), undo, clear);
  toolbar.hidden = true;

  undo.addEventListener("click", () => {
    state.shapes.pop();
    const canvas = shot.querySelector("canvas");
    if (canvas) repaint(canvas, null);
  });
  clear.addEventListener("click", () => {
    state.shapes = [];
    const canvas = shot.querySelector("canvas");
    if (canvas) repaint(canvas, null);
  });

  /* The same close the reader's own note dialog carries, in the same hand: a
   * multiplication sign, labelled for a screen reader because the character
   * is not a word. Escape closes the dialog too, and always did, but a cross
   * is what somebody looks for. */
  const close = el("button", {
    type: "button", className: "pf-close", id: "pf-close", textContent: "\u00D7",
  });
  close.setAttribute("aria-label", "Close");

  const note = el("dialog", { className: "pf-note", id: "pf-note" },
    el("div", { className: "pf-head" },
      el("h2", { id: "pf-title", textContent: "Tell us what you see" }),
      close),
    toolbar,
    shot,
    shotRow,
    el("div", { className: "pf-field" },
      el("label", { htmlFor: "pf-comment", textContent: "What you want to tell us" }),
      comment),
    el("div", { className: "pf-field" },
      el("label", { htmlFor: "pf-email", textContent: "Your address" }),
      email,
      el("p", { className: "pf-why", textContent:
        "Your note, your address and this screenshot stay private. We use your "
        + "address only to write back." })),
    trap,
    el("p", { className: "pf-why", textContent:
      "Sent with this: the address of this page, the size of your window, and "
      + "your browser's identification string." }),
    el("p", { className: "pf-why" },
      document.createTextNode("Or contact us at "),
      el("a", { href: "mailto:sam@polariscollective.org",
                textContent: "sam@polariscollective.org" }),
      document.createTextNode(".")),
    said,
    el("div", { className: "pf-row pf-actions" }, cancel, sendButton));

  // Named for a screen reader, the way every other dialog in this repository
  // is. Without it the dialog is announced with no name at all.
  note.setAttribute("aria-labelledby", "pf-title");

  /* The pages this runs on are not ours, and one of them is an application
   * with document-level keys: with a tool button focused, its j and k scroll
   * the document behind this dialog and rewrite the address, and its Escape
   * tells an embedding frame to close the whole reader. A key pressed inside
   * a modal belongs to the modal. Escape still closes this dialog, because
   * that is the browser's own default action and not a listener. */
  note.addEventListener("keydown", event => event.stopPropagation());

  const ready = () => {
    sendButton.disabled = !(comment.value.trim() && email.value.trim());
  };
  comment.addEventListener("input", ready);
  email.addEventListener("input", ready);
  ready();

  cancel.addEventListener("click", () => note.close());
  close.addEventListener("click", () => note.close());
  sendButton.addEventListener("click",
    () => send({ comment, email, trap, said, sendButton, note }));

  drop.addEventListener("click", () => {
    state.base = null;
    state.shapes = [];
    state.dropped = true;
    shot.replaceChildren(el("p", { className: "pf-waiting",
                                   textContent: "No screenshot will be sent." }));
    toolbar.hidden = true;
    drop.hidden = true;
  });

  const pill = el("button", {
    type: "button", className: "pf-pill", id: "pf-pill", textContent: "Feedback",
  });
  pill.setAttribute("aria-haspopup", "dialog");

  // Which opening this is. The camera takes a second or two, and in that time
  // the sender can drop the screenshot or close the dialog; comparing the token
  // after the await is how a late picture knows it is no longer wanted.
  let opening = 0;

  /* What the press measured, waiting for the click that follows it.
   *
   * Measured on pointerdown and not on click, and that is the whole of the
   * reason: a listener runs before the default action of its own event, and
   * the browser's light dismiss of an open popover is a default action of the
   * press. By the time a click handler runs, the reader's note has gone. */
  let held = null;

  pill.addEventListener("pointerdown", () => {
    /* A press that never became a click left its attributes on the page, and
     * nothing else would ever remove them. Clearing here rather than on
     * pointerup, which fires before the click that needs them, bounds the
     * litter to one abandoned press. */
    if (held) for (const node of held) delete node.dataset.pfFloating;
    held = tagFloating([pill, note]);
  }, true);

  pill.addEventListener("click", async event => {
    const mine = ++opening;
    /* detail is 0 for a click with no pointer behind it, which is what a
     * keyboard activation gives, and a keyboard activation fires no press, so
     * nothing was measured for it and it measures for itself. A pointer click
     * takes what its own press measured, once: held is emptied so a later
     * click can never read a moment that has passed. */
    let floating;
    if (event.detail > 0 && held) {
      floating = held;
      held = null;
    } else {
      floating = tagFloating([pill, note]);
    }
    say(said, "", false);
    state.base = null;
    state.shapes = [];
    state.dropped = false;
    state.where = location.href;
    toolbar.hidden = true;
    drop.hidden = true;
    shot.replaceChildren(el("p", { className: "pf-waiting",
                                   textContent: "Photographing the page." }));
    ready();
    note.showModal();
    comment.focus();
    try {
      const canvas = await capture([pill, note], floating);
      // Dropped, closed, or opened again while the camera was working.
      if (mine !== opening || !note.open || state.dropped) return;
      state.base = canvas;
      const picture = el("img", { alt: "This page, as it was when you pressed the button" });
      picture.src = canvas.toDataURL("image/png");
      shot.replaceChildren(picture, overlay(canvas, tools));
      toolbar.hidden = false;
      drop.hidden = false;
    } catch {
      if (mine !== opening) return;
      shot.replaceChildren(el("p", { className: "pf-waiting", textContent:
        "The screenshot could not be taken. You can still send your words." }));
    }
  });

  document.body.append(note, pill);
  follow(pill, note);
}

build();
