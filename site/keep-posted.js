/* A reader asks to hear about updates and the official release.
 *
 * An address and, if they want, a message. It is filed as a note through the
 * page feedback route (/api/page-feedback), with the page's address and no
 * picture, so it reaches the portal and Slack like any other note and nothing
 * new has to be stored anywhere. The route asks for a comment, so the comment
 * says what the reader asked for, and their message follows it.
 *
 * One file for every place that offers it: the note behind the "Confidential -
 * WIP" badge, and the holding page a production deployment may show instead of
 * the site. Everything is built as nodes and styled here, so a page gains it
 * with one import.
 */

const ROUTE = "/api/page-feedback";
const ASKED = "Keep me posted about updates and the official release of the index.";

/* No backticks inside this block: it is a template literal. */
const STYLE = `
.keep-posted { display: grid; gap: 8px; margin: 0; text-align: left; }
.keep-posted label { font-size: 13px; font-weight: 600; color: #23281B; }
.keep-posted input, .keep-posted textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #5C6B3C;
  border-radius: 4px;
  background: #F1EFE3;
  color: #23281B;
  font: inherit;
  font-size: 14px;
}
.keep-posted textarea { min-height: 64px; resize: vertical; }
.keep-posted input:focus-visible, .keep-posted textarea:focus-visible {
  outline: 2px solid #B7C94B;
  outline-offset: 1px;
}
.keep-posted .keep-trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
.keep-posted button {
  justify-self: start;
  margin-top: 4px;
  padding: 7px 16px;
  border: 1px solid #333D22;
  border-radius: 999px;
  background: #333D22;
  color: #F1EFE3;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}
.keep-posted button:hover { background: #B7C94B; border-color: #B7C94B; color: #23281B; }
.keep-posted button:focus-visible { outline: 2px solid #B7C94B; outline-offset: 2px; }
.keep-posted button[disabled] { opacity: .6; cursor: default; }
.keep-posted .keep-said { margin: 0; font-size: 13px; color: #23281B; }
.keep-posted .keep-said.is-wrong { color: #A0522D; }
@media (prefers-reduced-motion: reduce) { .keep-posted button { transition: none; } }
`;

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const node = document.createElement("style");
  node.textContent = STYLE;
  document.head.append(node);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let made = 0;

/* The form, ready to be placed. `lead` is the line above it, in the words of the
 * place that offers it. */
export function keepPosted(lead = "Hear about updates and the official release.") {
  style();
  made += 1;
  const id = suffix => `keep-posted-${made}-${suffix}`;
  const form = element("form", "keep-posted");
  form.noValidate = true;

  const intro = element("p", "keep-said", lead);
  const emailLabel = element("label", null, "Your email address");
  emailLabel.htmlFor = id("email");
  const email = element("input");
  email.type = "email";
  email.id = id("email");
  email.name = "email";
  email.autocomplete = "email";
  email.required = true;
  const messageLabel = element("label", null, "A message, if you want to add one");
  messageLabel.htmlFor = id("message");
  const message = element("textarea");
  message.id = id("message");
  message.name = "message";
  message.maxLength = 4000;
  // A field people do not see and robots fill: the route refuses a note that
  // carries it.
  const trap = element("input", "keep-trap");
  trap.type = "text";
  trap.name = "website";
  trap.tabIndex = -1;
  trap.autocomplete = "off";
  trap.setAttribute("aria-hidden", "true");
  const send = element("button", null, "Keep me posted");
  send.type = "submit";
  const said = element("p", "keep-said");
  said.setAttribute("role", "status");

  form.append(intro, emailLabel, email, messageLabel, message, trap, send, said);

  const tell = (text, wrong) => {
    said.textContent = text;
    said.classList.toggle("is-wrong", Boolean(wrong));
  };

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const address = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      tell("Write an email address, so we can reach you.", true);
      email.focus();
      return;
    }
    send.disabled = true;
    tell("Sending.");
    const body = new FormData();
    const words = message.value.trim();
    body.set("comment", words ? `${ASKED}\n\n${words}` : ASKED);
    body.set("email", address);
    body.set("page_url", location.href);
    body.set("viewport",
      `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}`);
    body.set("user_agent", navigator.userAgent);
    body.set("website", trap.value);
    try {
      const response = await fetch(ROUTE, {
        method: "POST", body, signal: AbortSignal.timeout(30000),
      });
      const outcome = await response.json().catch(() => ({}));
      if (!response.ok) {
        tell(outcome.problem || "That did not go through. It is worth trying again.", true);
        send.disabled = false;
        return;
      }
      email.value = "";
      message.value = "";
      tell("Thank you. We will write when there is news.");
    } catch {
      tell("That did not go through. Check your connection and try again.", true);
      send.disabled = false;
    }
  });
  return form;
}
