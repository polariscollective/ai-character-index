#!/usr/bin/env node
/* Guard for where focus lands after a publisher is chosen in the spec reader:
 * choosePublisher, extracted verbatim from site/spec-reader/app.js.
 *
 * Choosing a publisher rebuilds the reader, and the rebuild replaces every
 * panel, the pressed button among them. So focus has to be put back after the
 * rebuild and not before. Put back before, it goes on a button that is about to
 * leave the document, and the browser drops the reader on the body, which is
 * where a keyboard user was being dropped: choosing a document is asynchronous,
 * because the bubbles of a document just put on screen are fetched before the
 * panels are drawn again, and the focus was not waiting for it.
 *
 * The tier toggles beside it never had that problem, their own toggleBand being
 * synchronous, which is why the browser walker caught this on the publishers
 * alone.
 *
 * The fakes below are the smallest DOM the question needs: panels that can be
 * replaced, buttons that know which panel they sit in, and a chooseSpec that
 * replaces them a turn later, as the real one does once its fetches return. A
 * focus put back too early lands on a panel this harness has already marked
 * dead.
 *
 * Exits 0 when every check holds, 1 otherwise, and prints a final count line the
 * Python driver asserts on.
 * Run:  node engine/panel/test_appjs_publisher_focus.js
 * (driven from test_panel.py::TestAppJSPublisherFocus; needs Node, no browser/keys)
 */
const fs = require("fs");
const path = require("path");

const APP_JS = path.join(__dirname, "..", "..", "site", "spec-reader", "app.js");
const lines = fs.readFileSync(APP_JS, "utf8").split("\n");

function extractFn(header) {
  const start = lines.findIndex(l => l.startsWith(header));
  if (start < 0) throw new Error(`not found in app.js: ${header}`);
  let depth = 0, began = false;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") { depth++; began = true; }
      else if (ch === "}") { depth--; }
    }
    if (began && depth === 0) return lines.slice(start, i + 1).join("\n");
  }
  throw new Error(`unbalanced braces in app.js for: ${header}`);
}

// --- The fake reader ---------------------------------------------------------

const NEWEST = {
  anthropic: "anthropic--constitution@2026-01-20",
  openai: "openai--model-spec@2026-08-18",
};
const LABS = Object.keys(NEWEST);

/* The panels on screen. A rebuild replaces them, so the ones it replaced are
 * marked dead rather than thrown away: a focus that went to a dead panel is the
 * failure this harness exists to catch, and a discarded panel could not report
 * it. */
let live = [];
let focused = [];
let chosen = [];

function makePanel(documentId) {
  const panel = { dataset: { documentId }, live: true, buttons: {} };
  for (const lab of LABS) {
    const button = {
      dataset: { lab },
      closest: selector => (selector === ".document-panel" ? panel : null),
      focus: () => focused.push({ lab, panel, button }),
    };
    panel.buttons[lab] = button;
  }
  panel.querySelector = selector => {
    const match = /^\.provider-tab\[data-lab="(.*)"\]$/.exec(selector);
    return match ? panel.buttons[match[1]] ?? null : null;
  };
  return panel;
}

function draw(documentIds) {
  live.forEach(panel => { panel.live = false; });
  live = documentIds.map(makePanel);
}

function open(...documentIds) {
  live = [];
  focused = [];
  chosen = [];
  draw(documentIds);
}

// The globals the extracted function reads.
var CSS = { escape: value => value };
function panels() { return live; }
function latestOfLab(lab) {
  return NEWEST[lab] ? { id: NEWEST[lab], lab } : null;
}
/* The real one fetches the document and its behaviours before rebuildReader
 * draws the panels again, so the rebuild is a turn away however fast the fetches
 * answer. */
async function chooseSpec(panel, id) {
  const side = live.indexOf(panel);
  chosen.push({ side, id });
  await new Promise(resolve => setTimeout(resolve, 0));
  const documentIds = live.map(each => each.dataset.documentId);
  documentIds[side] = id;
  draw(documentIds);
}

/* Enough turns for a focus that did not wait to be caught by the rebuild that
 * follows it. Without this a handler that focused too early would be read before
 * the panel it focused had been replaced, and would look correct. */
async function settle() {
  for (let turn = 0; turn < 3; turn++) await new Promise(resolve => setTimeout(resolve, 0));
}

function landed() {
  const last = focused.at(-1);
  return {
    focuses: focused.length,
    lab: last?.lab ?? null,
    // Where the focused button's panel sits now: -1 once a rebuild has replaced it.
    side: last ? live.indexOf(last.panel) : -1,
    live: Boolean(last?.panel.live),
    // And the button really is the rebuilt panel's own, not a stale twin of it.
    current: Boolean(last && live[live.indexOf(last.panel)]?.buttons[last.lab] === last.button),
  };
}

eval(extractFn("async function choosePublisher(button) {"));

let checks = 0, failures = 0;
function check(label, got, want) {
  checks += 1;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)} (expected ${JSON.stringify(want)})`);
}

async function main() {
  // --- Reading one document -------------------------------------------------
  open(NEWEST.anthropic);
  await choosePublisher(live[0].buttons.openai);
  await settle();
  check("choosing a publisher opens its newest document",
        chosen, [{ side: 0, id: NEWEST.openai }]);
  check("and focus lands on that publisher in the panel the rebuild drew",
        landed(), { focuses: 1, lab: "openai", side: 0, live: true, current: true });

  // --- Comparing ------------------------------------------------------------
  /* The panel is found by position, so the side that chose keeps the focus even
   * when both sides carry the same document. */
  open(NEWEST.anthropic, NEWEST.anthropic);
  await choosePublisher(live[1].buttons.openai);
  await settle();
  check("comparing, the publisher chosen on the right changes the right side only",
        live.map(panel => panel.dataset.documentId),
        [NEWEST.anthropic, NEWEST.openai]);
  check("comparing, focus lands on the right side's publisher",
        landed(), { focuses: 1, lab: "openai", side: 1, live: true, current: true });

  open(NEWEST.anthropic, NEWEST.anthropic);
  await choosePublisher(live[0].buttons.openai);
  await settle();
  check("comparing, focus lands on the left side's publisher when the left chose",
        landed(), { focuses: 1, lab: "openai", side: 0, live: true, current: true });

  // --- Nothing to choose ----------------------------------------------------
  /* The publisher already being read: no document is chosen, so no rebuild, and
   * the focus the button already had is simply given back to it. */
  open(NEWEST.anthropic);
  const pressed = live[0].buttons.anthropic;
  await choosePublisher(pressed);
  await settle();
  check("the publisher already being read chooses nothing", chosen, []);
  check("and focus stays on it",
        landed(), { focuses: 1, lab: "anthropic", side: 0, live: true, current: true });

  console.log(`\n${checks} checks, ${failures} failures`);
  process.exit(failures ? 1 : 0);
}

main();
