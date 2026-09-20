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
.pf-note h2 { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
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

@media (prefers-reduced-motion: reduce) {
  .pf-pill, .pf-send, .pf-cancel { transition: none; }
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
const state = { base: null, shapes: [], dropped: false };

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
  for (const node of sticky) node.style.position = "static";
  const settled = sticky.map(node => node.getBoundingClientRect());
  sticky.forEach((node, i) => { node.style.position = was[i]; });

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
async function capture(mine) {
  const html2canvas = await loadLibrary();
  const tagged = tagSticky();
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
      onclone: clone => pinSticky(clone),
    });
  } finally {
    for (const node of tagged) delete node.dataset.pfSticky;
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

/* Filled in by the editor. Until it exists, a capture carries no marks. */
function draw() {}

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
  form.set("page_url", location.href);
  form.set("viewport",
           `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}`);
  form.set("user_agent", navigator.userAgent);
  form.set("website", trap.value);

  if (state.base) {
    const picture = await compose(state.base, state.shapes);
    if (picture) {
      form.set("capture_method", METHOD);
      form.set("screenshot", picture, "page.png");
    }
  }

  try {
    const response = await fetch(ROUTE, { method: "POST", body: form });
    const outcome = await response.json().catch(() => ({}));
    if (!response.ok) {
      say(said, outcome.problem || "That did not go through. It is worth trying again.", true);
      sendButton.disabled = false;
      return;
    }
    remember(address);
    comment.value = "";
    say(said, outcome.done || "Thank you. We read every one.", false);
    setTimeout(() => note.close(), 1200);
  } catch {
    say(said, "That did not go through. It is worth trying again.", true);
    sendButton.disabled = false;
  }
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

  const note = el("dialog", { className: "pf-note", id: "pf-note" },
    el("h2", { id: "pf-title", textContent: "Tell us what you see" }),
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
    said,
    el("div", { className: "pf-row" }, cancel, sendButton));

  // Named for a screen reader, the way every other dialog in this repository
  // is. Without it the dialog is announced with no name at all.
  note.setAttribute("aria-labelledby", "pf-title");

  const ready = () => {
    sendButton.disabled = !(comment.value.trim() && email.value.trim());
  };
  comment.addEventListener("input", ready);
  email.addEventListener("input", ready);
  ready();

  cancel.addEventListener("click", () => note.close());
  sendButton.addEventListener("click",
    () => send({ comment, email, trap, said, sendButton, note }));

  drop.addEventListener("click", () => {
    state.base = null;
    state.shapes = [];
    state.dropped = true;
    shot.replaceChildren(el("p", { className: "pf-waiting",
                                   textContent: "No screenshot will be sent." }));
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

  pill.addEventListener("click", async () => {
    const mine = ++opening;
    say(said, "", false);
    state.base = null;
    state.shapes = [];
    state.dropped = false;
    drop.hidden = true;
    shot.replaceChildren(el("p", { className: "pf-waiting",
                                   textContent: "Photographing the page." }));
    ready();
    note.showModal();
    comment.focus();
    try {
      const canvas = await capture([pill, note]);
      // Dropped, closed, or opened again while the camera was working.
      if (mine !== opening || !note.open || state.dropped) return;
      state.base = canvas;
      const picture = el("img", { alt: "This page, as it was when you pressed the button" });
      picture.src = canvas.toDataURL("image/png");
      shot.replaceChildren(picture);
      drop.hidden = false;
    } catch {
      if (mine !== opening) return;
      shot.replaceChildren(el("p", { className: "pf-waiting", textContent:
        "The screenshot could not be taken. You can still send your words." }));
    }
  });

  document.body.append(note, pill);
}

build();
