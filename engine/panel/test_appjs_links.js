#!/usr/bin/env node
/* Guard for linkBubbles in site/spec-reader/app.js: which counterpart bubbles a
 * paragraph shows while two documents are being compared.
 *
 * Nothing exercised linkBubbles before this file, and that is how a paragraph
 * came to carry every bubble it had ever received whatever the reader had
 * ticked. One paragraph of the OpenAI Model Spec carried seventeen, of which
 * seven had been drawn while judging behaviours the reader was not reading. The
 * filter that was missing had no test to be missing from.
 *
 * Only two things here are fakes: the reader's state, and which two documents
 * are on screen. escapeHTML, HUE_SLOTS, payloadBehaviours, selectedBehaviours,
 * behaviourHue, LINK_WORDS and linkBubbles are all extracted verbatim from the
 * real file, so a change there is a change here.
 *
 * Exits 0 when every check holds, 1 otherwise, and prints a final count line
 * the Python driver asserts on.
 * Run:  node engine/panel/test_appjs_links.js
 * (driven from test_panel.py::TestAppJSLinks; needs Node, no browser/keys)
 */
const fs = require("fs");
const path = require("path");

const APP_JS = path.join(__dirname, "..", "..", "site", "spec-reader", "app.js");
const src = fs.readFileSync(APP_JS, "utf8");
const lines = src.split("\n");

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
function extractConst(name) {
  const line = lines.find(l => l.startsWith(`const ${name} =`));
  if (line === undefined) throw new Error(`not found in app.js: const ${name}`);
  return line.replace(/^const /, "var ");
}
function extractConstBlock(name) {
  const start = lines.findIndex(l => l.startsWith(`const ${name} =`));
  if (start < 0) throw new Error(`not found in app.js: const ${name}`);
  let open = 0, began = false;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "[" || ch === "{") { open++; began = true; }
      else if (ch === "]" || ch === "}") { open--; }
    }
    if (began && open === 0) {
      return lines.slice(start, i + 1).join("\n").replace(/^const /, "var ");
    }
  }
  throw new Error(`unbalanced brackets in app.js for: const ${name}`);
}

/* The two fakes. comparePair is stubbed rather than extracted because it reaches
 * on into defaultComparison and the document menu, none of which decides which
 * bubbles a paragraph shows. */
var state = { comparing: true, payload: { behaviours: [] }, selectedSlugs: [] };
var linkRows = null;
const LEFT = "anthropic--constitution@2026-01-20";
const RIGHT = "openai--model-spec@2026-08-18";
function comparePair() { return [LEFT, RIGHT]; }

eval(extractConst("HUE_SLOTS"));
eval(extractFn("function escapeHTML(value) {"));
eval(extractFn("function payloadBehaviours() {"));
eval(extractFn("function selectedBehaviours() {"));
eval(extractFn("function behaviourHue(behaviour) {"));
eval(extractConstBlock("LINK_WORDS"));
eval(extractFn("function linkBubbles(block) {"));

const POWER = { slug: "avoiding-illegitimate-concentration-of-power", name: "Concentrations of power" };
const HARM = { slug: "harm-avoidance-to-third-parties", name: "Third-party harm" };
const HONESTY = { slug: "honesty-and-non-deception", name: "Honesty" };
const MENU = [POWER, HARM, HONESTY];

const HERE = `${LEFT} > Avoiding harm > ¶11`;
const THERE = `${RIGHT} > #red_line_principles > ¶3`;
const ELSEWHERE = "alibaba--model-spec@2026-04-00 > Root > ¶1";

/* A row of byLocator as link_reader_data writes it. `behaviours` is omitted
 * rather than empty when the caller wants the shape a payload had before rows
 * carried them, because omitted and empty are different claims. */
function row(to, relation, behaviours) {
  const out = { to, relation, judge: "opus-5", settled: false, comment: "because." };
  if (behaviours) out.behaviours = behaviours;
  return out;
}

function render(rows, ticked, { comparing = true } = {}) {
  state.payload = { behaviours: MENU };
  state.selectedSlugs = ticked;
  state.comparing = comparing;
  linkRows = { byLocator: { [HERE]: rows } };
  const html = linkBubbles({ dataset: { locators: HERE, passageId: "p1" } });
  linkRows = null;
  return html;
}

const pills = html => (html.match(/class="link-goto"/g) || []).length;
const bubbleRows = html => (html.match(/class="link-bubbles"/g) || []).length;
const hues = html => (html.match(/--bh: var\(--hue-/g) || []).length;

let checks = 0, failures = 0;
function check(name, run, expected) {
  checks++;
  let got;
  try { got = run(); } catch (err) { got = `threw: ${err.message}`; }
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${JSON.stringify(got)} `
    + `(expected ${JSON.stringify(expected)})`);
}

/* ---- the behaviour a bubble was drawn under decides whether it is shown ---- */
check("with nothing ticked a paragraph shows no bubble",
      () => render([row(THERE, "same", [POWER.slug])], []), "");
check("one behaviour ticked shows only the links that behaviour drew",
      () => pills(render([row(THERE, "same", [POWER.slug]),
                          row(THERE, "nuance", [HARM.slug])], [POWER.slug])), 1);
check("a link drawn under a behaviour nobody ticked is not shown",
      () => render([row(THERE, "same", [HONESTY.slug])], [POWER.slug]), "");
check("every ticked behaviour that drew a link keeps it",
      () => pills(render([row(THERE, "same", [POWER.slug]),
                          row(THERE, "nuance", [HARM.slug])],
                         [POWER.slug, HARM.slug])), 2);

/* ---- naming the behaviour, which only earns its place when several are ticked ---- */
check("with several ticked, each behaviour gets a row of its own",
      () => bubbleRows(render([row(THERE, "same", [POWER.slug]),
                               row(THERE, "nuance", [HARM.slug])],
                              [POWER.slug, HARM.slug])), 2);
check("and each row is drawn in that behaviour's own colour",
      () => hues(render([row(THERE, "same", [POWER.slug]),
                         row(THERE, "nuance", [HARM.slug])],
                        [POWER.slug, HARM.slug])), 2);
check("the behaviour is said by the colour and never written beside the pill",
      () => render([row(THERE, "same", [POWER.slug])], [POWER.slug, HARM.slug])
              .includes(POWER.name), false);
check("a link drawn under two ticked behaviours is claimed by the first, not drawn twice",
      () => pills(render([row(THERE, "same", [POWER.slug, HARM.slug])],
                         [POWER.slug, HARM.slug])), 1);
check("so the second behaviour is left no row of its own",
      () => bubbleRows(render([row(THERE, "same", [POWER.slug, HARM.slug])],
                              [POWER.slug, HARM.slug])), 1);

/* ---- the reading of the counterparts, which is not one of them ---- */
const summary = (behaviours, text) => ({
  relation: "summary", comment: text, behaviours, settled: false, judge: "opus-5",
});
check("a row with no counterpart to travel to is shown beside the ones that have one",
      () => pills(render([summary([POWER.slug], "In short, they agree."),
                          row(THERE, "same", [POWER.slug])], [POWER.slug])), 2);
check("and it offers nowhere to go, because it is about all of them",
      () => render([summary([POWER.slug], "In short, they agree.")], [POWER.slug])
              .includes("data-goto"), false);
check("a summary drawn under a behaviour nobody ticked is not shown either",
      () => render([summary([HONESTY.slug], "In short, they agree.")], [POWER.slug]), "");
/* Found by reading one run's payload against a different pair of documents. The
 * counterparts were dropped for naming a document not on screen and the summary,
 * having no locator to hold against that test, stayed behind on its own: a pill
 * about a comparison the reader was not looking at, which travelled nowhere when
 * pressed because a summary has nothing to travel to. */
check("a summary goes when its counterparts go, whatever pair is on screen",
      () => render([summary([POWER.slug], "In short, they agree."),
                    row(ELSEWHERE, "same", [POWER.slug])], [POWER.slug]), "");

/* ---- what the filter must not break ---- */
check("a row written before rows carried behaviours is still shown",
      () => pills(render([row(THERE, "same")], [POWER.slug])), 1);
check("with one document on screen there is nothing to compare against",
      () => render([row(THERE, "same", [POWER.slug])], [POWER.slug],
                   { comparing: false }), "");
check("a link into a document that is not on screen is not shown",
      () => render([row(ELSEWHERE, "same", [POWER.slug])], [POWER.slug]), "");

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
