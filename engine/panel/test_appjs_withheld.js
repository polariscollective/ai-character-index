#!/usr/bin/env node
/* Guard for paragraphsOf in site/spec-reader/app.js: the three answers a cell
 * can give about its paragraphs, and which of them the reader may count.
 *
 * app.js runs DOM code at module scope and cannot be imported, so the function
 * is extracted verbatim from the real file, as the sibling harnesses do.
 *
 * Exits 0 when every check holds, 1 otherwise.
 * Run:  node engine/panel/test_appjs_withheld.js
 * (driven from test_panel.py::TestAppJSWithheld; needs Node, no browser/keys)
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

eval(extractConst("NO_COVERAGE"));
eval(extractConst("WITHHELD"));
eval(extractFn("function paragraphsOf(behaviour, documentId) {"));

const DOC = "anthropic--constitution@2026-01-20";

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

/* ---- the three answers ---- */
check("a behaviour that does not cover the document has no passages and is not withheld",
      () => { const r = paragraphsOf({ coverage: {} }, DOC);
              return [r.passages.length, !!r.withheld]; }, [0, false]);
check("a behaviour the panel cited nothing for is empty and is not withheld",
      () => { const r = paragraphsOf({ coverage: { [DOC]: { passages: [] } } }, DOC);
              return [r.passages.length, !!r.withheld]; }, [0, false]);
check("a cell whose paragraphs were withheld says so",
      () => { const r = paragraphsOf(
                { coverage: { [DOC]: { depth: { mean: 2 }, passagesWithheld: true } } }, DOC);
              return [r.passages.length, !!r.withheld]; }, [0, true]);
check("a cell that carries paragraphs hands them back",
      () => paragraphsOf(
              { coverage: { [DOC]: { passages: [{ locator: "x" }, { locator: "y" }] } } },
              DOC).passages.length, 2);

/* ---- what must never throw ---- */
check("a withheld cell can be walked like any other, and walks over nothing",
      () => { let n = 0;
              paragraphsOf({ coverage: { [DOC]: { passagesWithheld: true } } }, DOC)
                .passages.forEach(() => n++);
              return n; }, 0);
check("a behaviour with no coverage object at all does not throw",
      () => paragraphsOf({}, DOC).passages.length, 0);

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
