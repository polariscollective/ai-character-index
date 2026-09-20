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
    el("h2", { textContent: "Tell us what you see" }),
    el("div", { className: "pf-field" },
      el("label", { htmlFor: "pf-comment", textContent: "What you want to tell us" }),
      comment),
    el("div", { className: "pf-field" },
      el("label", { htmlFor: "pf-email", textContent: "Your address" }),
      email,
      el("p", { className: "pf-why", textContent:
        "Your note and your address stay private. We use your address only to "
        + "write back." })),
    trap,
    el("p", { className: "pf-why", textContent:
      "Sent with this: the address of this page, the size of your window, and "
      + "your browser's identification string." }),
    said,
    el("div", { className: "pf-row" }, cancel, sendButton));

  const ready = () => {
    sendButton.disabled = !(comment.value.trim() && email.value.trim());
  };
  comment.addEventListener("input", ready);
  email.addEventListener("input", ready);
  ready();

  cancel.addEventListener("click", () => note.close());
  sendButton.addEventListener("click",
    () => send({ comment, email, trap, said, sendButton, note }));

  const pill = el("button", {
    type: "button", className: "pf-pill", id: "pf-pill", textContent: "Feedback",
  });
  pill.setAttribute("aria-haspopup", "dialog");
  pill.addEventListener("click", () => {
    say(said, "", false);
    ready();
    note.showModal();
    comment.focus();
  });

  document.body.append(note, pill);
}

build();
