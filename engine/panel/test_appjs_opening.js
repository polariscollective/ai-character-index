#!/usr/bin/env node
/* Guard for the document the spec reader opens on: openingDocument, and the
 * compare defaults beside it (comparePair, defaultComparison), extracted verbatim
 * from site/spec-reader/app.js.
 *
 * The reader once defaulted to the string "anthropic" and rendered nothing
 * against a payload without it. It prefers a lab now, and keeps the fallback that
 * fixed that: a payload without the preferred lab opens on its first document.
 * The test fixture's documents are named otherwise, so the browser walkers only
 * ever see the fallback; the preferred path is held here.
 *
 * Exits 0 when every check holds, 1 otherwise, and prints a final count line the
 * Python driver asserts on.
 * Run:  node engine/panel/test_appjs_opening.js
 * (driven from test_panel.py::TestAppJSOpening; needs Node, no browser/keys)
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
/* A const that may run over several lines, read to its closing semicolon; `var`
 * so the eval leaves it in scope. */
function extractConst(name) {
  const start = lines.findIndex(l => l.startsWith(`const ${name} =`));
  if (start < 0) throw new Error(`not found in app.js: const ${name}`);
  let end = start;
  while (end < lines.length && !/;\s*(\/\/.*)?$/.test(lines[end])) end += 1;
  return lines.slice(start, end + 1).join("\n").replace(/^const /, "var ");
}

var state = {};

/* Anything missing fails the checks that need it by name, so the count this
 * harness prints is the same before and after the change it guards. */
try { eval(extractConst("PREFERRED_LAB")); } catch (missing) { console.log(`note: ${missing.message}`); }
try { eval(extractFn("function openingDocument(documents, requested) {")); }
catch (missing) { console.log(`note: ${missing.message}`); var openingDocument = () => { throw missing; }; }
eval(extractConst("COMPARISON_ORDER"));
eval(extractFn("function documentsOfLab("));
eval(extractFn("function latestOfLab("));
eval(extractFn("function defaultComparison("));
eval(extractFn("function comparePair() {"));

let checks = 0, failures = 0;
function check(label, run, want) {
  checks += 1;
  let got;
  try { got = run(); } catch (error) { got = `threw ${error.name}: ${error.message}`; }
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)} (expected ${JSON.stringify(want)})`);
}

const ALIBABA = { id: "alibaba--model-spec@2026-04-00", lab: "Alibaba", version: "2026-04-00" };
const ANTHROPIC_OLD = { id: "anthropic--constitution@2025-05-01", lab: "Anthropic", version: "2025-05-01" };
const ANTHROPIC = { id: "anthropic--constitution@2026-01-20", lab: "Anthropic", version: "2026-01-20" };
const OPENAI = { id: "openai--model-spec@2026-08-18", lab: "OpenAI", version: "2026-08-18" };
/* The order the published payload has: Alibaba first, which is what the reader
 * used to open on. The older Anthropic version comes first on purpose. */
const WITH = [ALIBABA, ANTHROPIC_OLD, ANTHROPIC, OPENAI];
const WITHOUT = [ALIBABA, OPENAI];

check("with no ?spec=, the preferred lab's newest document opens",
      () => openingDocument(WITH, null), ANTHROPIC.id);
check("a payload without the preferred lab opens on its first document, as before",
      () => openingDocument(WITHOUT, null), ALIBABA.id);
check("?spec= still wins over the preferred lab",
      () => openingDocument(WITH, OPENAI.id), OPENAI.id);
check("a ?spec= the payload does not carry falls back to the preferred lab",
      () => openingDocument(WITH, "nobody--nothing@2026-01-01"), ANTHROPIC.id);
check("a payload with no documents opens on nothing",
      () => openingDocument([], null), null);

/* Compare: the left panel is the document the reader opened on, and the second
 * keeps its own default, which never picks the document already on the left. */
state = { payload: { documents: WITH }, comparePair: null, selectedSpec: null };
state.selectedSpec = (() => { try { return openingDocument(WITH, null); } catch { return null; } })();
check("arriving in compare with no pair, the left panel opens on the preferred lab",
      () => comparePair()[0], ANTHROPIC.id);
check("the second panel's default is never the document on the left",
      () => { const [first, second] = comparePair(); return Boolean(second) && second !== first; }, true);

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
