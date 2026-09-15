#!/usr/bin/env node
/* Guard for the passage link in site/spec-reader/app.js: locatorHead,
 * documentForLocator, passageLink and passageFromSearch, extracted verbatim.
 *
 * A locator names its document by its head, and the link carries the whole
 * locator in ?passage=. What must hold is that a locator goes into a link and
 * comes back out unchanged, whatever characters it carries (">", "#", "¶",
 * spaces, and anything a heading may hold), that a pinned publication travels
 * with it, and that a head finds its document whether it is the full document id
 * or the shorter head older locators carry.
 *
 * Exits 0 when every check holds, 1 otherwise, and prints a final count line the
 * Python driver asserts on.
 * Run:  node engine/panel/test_appjs_locator.js
 * (driven from test_panel.py::TestAppJSLocator; needs Node, no browser/keys)
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
function extractConst(name) {
  const line = lines.find(l => l.startsWith(`const ${name} =`));
  if (line === undefined) throw new Error(`not found in app.js: const ${name}`);
  return line.replace(/^const /, "var ");
}

/* Anything missing fails the checks that need it by name, so the count this
 * harness prints is the same before and after the change it guards. */
const missing = error => () => { throw error; };
try { eval(extractConst("PASSAGE_PARAM")); } catch (error) { console.log(`note: ${error.message}`); }
try { eval(extractFn("function locatorHead(locator) {")); }
catch (error) { console.log(`note: ${error.message}`); var locatorHead = missing(error); }
try { eval(extractFn("function documentForLocator(documents, locator) {")); }
catch (error) { console.log(`note: ${error.message}`); var documentForLocator = missing(error); }
try { eval(extractFn("function passageLink(href, locator, publication) {")); }
catch (error) { console.log(`note: ${error.message}`); var passageLink = missing(error); }
try { eval(extractFn("function passageFromSearch(search) {")); }
catch (error) { console.log(`note: ${error.message}`); var passageFromSearch = missing(error); }

let checks = 0, failures = 0;
function check(label, run, want) {
  checks += 1;
  let got;
  try { got = run(); } catch (error) { got = `threw ${error.name}: ${error.message}`; }
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)} (expected ${JSON.stringify(want)})`);
}

const LOCATOR = "openai--model-spec@2026-08-18 > #levels_of_authority > ¶2";
const DOCUMENTS = [
  { id: "openai--model-spec@2026-08-18" },
  { id: "acme--second@2026-02-01" },
  { id: "anthropic--constitution@2026-01-20" },
];
const PIN = "8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37";
const READER = "https://index.example/spec-reader/?behavior=helpfulness&spec=x&tiers=core#some-heading";

/* ---- a locator's head ---- */
check("the head of a locator is what comes before its first section",
      () => locatorHead(LOCATOR), "openai--model-spec@2026-08-18");
check("a locator with nothing in it has no head", () => locatorHead(""), "");

/* ---- the document a head names ---- */
check("a head that is a document id names that document",
      () => documentForLocator(DOCUMENTS, LOCATOR)?.id, "openai--model-spec@2026-08-18");
check("an older head without its lab still finds the document it ends",
      () => documentForLocator(DOCUMENTS, "second@2026-02-01 > #section-a > ¶1")?.id,
      "acme--second@2026-02-01");
check("a head no document carries names nothing",
      () => documentForLocator(DOCUMENTS, "nobody--nothing@2026-01-01 > ¶1"), null);

/* ---- the link, and the locator back out of it ---- */
check("a link carries only the passage, not the view it was copied from",
      () => { const url = new URL(passageLink(READER, LOCATOR, null));
              return { keys: [...url.searchParams.keys()], hash: url.hash, path: url.pathname }; },
      { keys: ["passage"], hash: "", path: "/spec-reader/" });
check("the locator comes back out of the link unchanged",
      () => passageFromSearch(new URL(passageLink(READER, LOCATOR, null)).search), LOCATOR);
const AWKWARD = "acme--corpus@2026-01-01 > #q&a=yes?+plus > Headings & anchors > ¶3 s2-s4";
check("a locator with &, =, ?, + and spaces survives the round trip",
      () => passageFromSearch(new URL(passageLink(READER, AWKWARD, null)).search), AWKWARD);
check("a pinned reader's link carries its publication",
      () => { const url = new URL(passageLink(READER, LOCATOR, PIN));
              return [url.searchParams.get("publication"), url.searchParams.get("passage")]; },
      [PIN, LOCATOR]);
check("a URL without the parameter names no passage",
      () => passageFromSearch("?spec=acme--corpus@2026-01-01"), null);

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
