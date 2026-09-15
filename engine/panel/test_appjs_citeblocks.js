#!/usr/bin/env node
/* Parity guard for the reader's copy of the engine's paragraph grammar:
 * citeNormalize, citeSections, citeBlocks and documentLocators, extracted
 * verbatim from site/spec-reader/app.js, held to the engine itself,
 * engine/panel/harness.py::passages over engine/spec-cite/cite.py.
 *
 * The reader gives every paragraph the locator the engine would give it, so a
 * link or a copy names the same block a citation does. A second grammar that
 * merely looked right would drift, so this runs the engine and compares every
 * locator, in order, for each document in both locator styles.
 *
 * The documents are the fixture's markdown. Set CITE_PARITY_DOCUMENTS to a
 * documents payload (a documents.json) to hold a publication's documents to it
 * too; that is how the served index was checked, and nothing of it is committed.
 *
 * Exits 0 when every check holds, 1 otherwise, and prints a final count line the
 * Python driver asserts on. Needs python3 on the path, as the panel suite does.
 * Run:  node engine/panel/test_appjs_citeblocks.js
 * (driven from test_panel.py::TestAppJSCiteBlocks)
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const APP_JS = path.join(ROOT, "site", "spec-reader", "app.js");
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

let missing = null;
try {
  for (const name of ["CITE_HEADING", "CITE_FENCE", "CITE_LIST_ITEM", "CITE_FOOTNOTE", "CITE_XREF", "CITE_LINK"]) {
    eval(extractConst(name));
  }
  eval(extractFn("function citeNormalize(text) {"));
  eval(extractFn("function citeSections(lines) {"));
  eval(extractFn("function citeBlocks(lines, start, end) {"));
  eval(extractFn("function documentLocators(markdown, head, byAnchor) {"));
} catch (error) {
  missing = error;
  console.log(`note: ${error.message}`);
}

const documents = [
  { head: "acme--corpus@2026-01-01", markdown: fs.readFileSync(path.join(ROOT, "tests/fixtures/parser-corpus.md"), "utf8") },
  { head: "acme--second@2026-02-01", markdown: fs.readFileSync(path.join(ROOT, "tests/fixtures/second-document.md"), "utf8") },
  ...JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/reader/documents.json"), "utf8")).documents
    .filter(doc => !/^acme--(corpus|second)@/.test(doc.id))
    .map(doc => ({ head: doc.id, markdown: doc.markdown })),
];
if (process.env.CITE_PARITY_DOCUMENTS) {
  const served = JSON.parse(fs.readFileSync(process.env.CITE_PARITY_DOCUMENTS, "utf8")).documents;
  documents.push(...served.map(doc => ({ head: doc.id, markdown: doc.markdown })));
}

/* The engine's locators for each document in each style, from harness.passages(). */
const ENGINE = `
import json, sys, importlib.util
from pathlib import Path
root = Path(sys.argv[1])
sys.path.insert(0, str(root / "engine" / "spec-cite"))
import cite
spec = importlib.util.spec_from_file_location("h", root / "engine" / "panel" / "harness.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
out = {}
for doc in json.load(sys.stdin):
    name, version = doc["head"].rsplit("@", 1)
    for style in ("anchor", "path"):
        cite.use_registry({(name, version): "k"}, {name: version},
                          {(name, version): {"title": "t", "locatorStyle": style}},
                          {"k": doc["markdown"]}.__getitem__)
        out[doc["head"] + "|" + style] = [loc for loc, _section, _text in h.passages(name, version)]
        cite.reset_registry()
print(json.dumps(out))
`;
const engine = JSON.parse(execFileSync("python3", ["-c", ENGINE, ROOT], {
  input: JSON.stringify(documents), maxBuffer: 64 * 1024 * 1024,
}).toString());

let checks = 0, failures = 0;
function check(ok, label, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
}

for (const doc of documents) {
  for (const style of ["anchor", "path"]) {
    const expected = engine[`${doc.head}|${style}`];
    let got;
    try {
      if (missing) throw missing;
      got = documentLocators(doc.markdown, doc.head, style === "anchor").map(entry => entry.locator);
    } catch (error) {
      check(false, `${doc.head}, ${style} style: the reader's locators are the engine's`, `threw ${error.message}`);
      continue;
    }
    const firstDifference = expected.findIndex((locator, i) => got[i] !== locator);
    const ok = got.length === expected.length && firstDifference < 0;
    check(ok, `${doc.head}, ${style} style: the reader's locators are the engine's`,
      ok ? `${got.length} locators`
        : `${got.length} against ${expected.length}; first difference at ${firstDifference}: `
          + `${JSON.stringify(got[firstDifference])} against ${JSON.stringify(expected[firstDifference])}`);
  }
}

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
