#!/usr/bin/env node
/* Automated guard for the payload resolution that site/spec-reader/app.js
 * implements:  ?publication=<uuid> pin -> the current publication.  app.js runs
 * DOM code at module scope, so it cannot be imported directly; instead the
 * resolution functions (payloadName, sliceParams, urlSlugs, loadBehaviours) are
 * extracted verbatim from the real file and loadBehaviours is driven against a
 * stubbed loadJSON, exactly as the browser's fetch would resolve it.
 *
 * payloadUrl was one of them until the reader learned to ask for only what its
 * URL names: the address is built from sliceParams and urlSlugs now. Naming a
 * function the file no longer has does not fail a check, it kills the suite on
 * load, so this list is worth keeping true.
 *
 * The chain used to have three tiers and now has two. The manifest was a ledger
 * of local runs and the shipped fallback existed for a fresh clone; a payload
 * that comes from a route has neither.
 *
 * Exits 0 when the fall-through behaves as documented, 1 otherwise.
 * Run:  node engine/panel/test_appjs_fallthrough.js
 * (driven from test_panel.py::TestAppJSResolution; needs Node, no browser/keys)
 */
const fs = require("fs");
const path = require("path");

const APP_JS = path.join(__dirname, "..", "..", "site", "spec-reader", "app.js");
const src = fs.readFileSync(APP_JS, "utf8");
const lines = src.split("\n");

/* Extract a top-level function by brace depth (template-literal ${} braces balance,
 * so depth counting lands on the function's own closing brace). */
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

const consts = lines.filter(l =>
  l.startsWith("const DOCUMENTS_URL") ||
  l.startsWith("const PAYLOAD_URL") ||
  l.startsWith("const PUBLICATION_ID")).join("\n");

/* The documents loader is new beside the payload's. Missing, it is replaced by one
 * that throws, so its checks below fail by name rather than crashing the harness
 * before the payload checks have run. */
function extractOrThrowing(header) {
  try { return extractFn(header); }
  catch { return `${header} { throw new Error("not found in app.js: ${header}"); }`; }
}

let runner, readSource, documentsRunner, readAsked;
eval(consts + "\n" +
  "let fetchMap = {};\n" +
  "let asked = [];\n" +
  "const state = {};\n" +
  "let location;\n" +   // browser global, injected per-scenario below
  /* initialParams is a module-level const in app.js, read once from
     location.search. Here location is replaced per scenario, so the runner
     re-derives it below; left as a single binding, every scenario after the
     first would resolve against the first one's URL. */
  "let initialParams;\n" +
  "async function loadJSON(url) {\n" +
  "  asked.push(url);\n" +
  "  if (url in fetchMap) return fetchMap[url];\n" +
  "  throw new Error(\"HTTP 404 for \" + url);\n" +
  "}\n" +
  extractFn("function payloadName(id)") + "\n" +
  /* payloadUrl no longer exists: loadBehaviours builds its address from
     sliceParams and urlSlugs, so those are what the fall-through must run
     against. Extracting a function the file has lost makes this suite die on
     load, which is how it fell silent rather than failing by name. */
  extractFn("function sliceParams(pinned, { behaviours, specs } = {})") + "\n" +
  extractFn("function urlSlugs()") + "\n" +
  /* loadDocuments asks for the documents named by ?spec= and ?compare-with=
     now, via urlSpecs(), so the sandbox needs it extracted the same way
     urlSlugs() already is for loadBehaviours(). */
  extractFn("function urlSpecs()") + "\n" +
  extractFn("async function loadBehaviours()") + "\n" +
  extractOrThrowing("async function loadDocuments()") + "\n" +
  "runner = async (search, map) => { fetchMap = map; asked = []; location = { search }; initialParams = new URLSearchParams(search); state.payloadSource = undefined; return loadBehaviours(); };\n" +
  "documentsRunner = async (search, map) => { await runner(search, map); return loadDocuments(); };\n" +
  "readAsked = () => asked;\n" +
  "readSource = () => state.payloadSource;");

const PINNED_ID = "7c2e0f11-4b6a-4d2e-9a5f-1e8c3b0d7a42";
const SPEC_A = "anthropic--constitution@2026-01-20";
const CURRENT_URL = "/api/reader/payload";
const PINNED_URL = `${CURRENT_URL}?publication=${PINNED_ID}`;
const PIN = { behaviours: ["PIN"] };
const CURRENT = { behaviours: ["CURRENT"] };

let failures = 0;
function check(ok, label, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${detail}`);
  if (!ok) failures += 1;
}

(async () => {
  {
    const payload = await runner(`?publication=${PINNED_ID}`,
      { [PINNED_URL]: PIN, [CURRENT_URL]: CURRENT });
    check(payload.behaviours[0] === "PIN", "a pin resolves",
          JSON.stringify(payload.behaviours));
    check(readSource().origin === "pin" && readSource().name === PINNED_ID,
          "the source is recorded", JSON.stringify(readSource()));
  }
  {
    const payload = await runner("", { [CURRENT_URL]: CURRENT });
    check(payload.behaviours[0] === "CURRENT", "no pin resolves the current publication",
          JSON.stringify(payload.behaviours));
    check(readSource().origin === "current" && readSource().requested === null,
          "nothing was requested and unserved", JSON.stringify(readSource()));
  }
  {
    // A well-formed pin naming a publication that is gone: the request is made,
    // it fails, and the page falls through rather than breaking.
    const payload = await runner(`?publication=${PINNED_ID}`, { [CURRENT_URL]: CURRENT });
    check(payload.behaviours[0] === "CURRENT", "a dead pin falls through",
          JSON.stringify(payload.behaviours));
    check(readSource().requested.name === PINNED_ID
          && readSource().requested.refused === false,
          "the fall-through names what was asked for and does not call it refused",
          JSON.stringify(readSource()));
  }
  {
    // A pin that is not a uuid is refused before any request: a malformed link
    // must cost nothing, and the marker says refused rather than unavailable.
    const asked = [];
    const payload = await runner("?publication=behaviours-v5-reader", {
      get [CURRENT_URL]() { asked.push(CURRENT_URL); return CURRENT; },
    });
    check(payload.behaviours[0] === "CURRENT", "a malformed pin falls through",
          JSON.stringify(payload.behaviours));
    check(readSource().requested.refused === true,
          "it is recorded as refused, not merely unavailable",
          JSON.stringify(readSource().requested));
  }

  /* ---- the documents come from the publication the payload resolved to ----
   * Documents are per publication, so a draft's payload beside the current
   * publication's documents matches nothing. The loader follows the payload's
   * outcome rather than the URL: a pin that fell back reads the current documents
   * even where a pinned documents request would have answered. */
  const DOCS_CURRENT_URL = "/api/reader/documents";
  const DOCS_PINNED_URL = `${DOCS_CURRENT_URL}?publication=${PINNED_ID}`;
  const DOCS_PIN = { documents: ["PIN"] };
  const DOCS_CURRENT = { documents: ["CURRENT"] };
  const readDocuments = async (search, map) => {
    try { return await documentsRunner(search, map); }
    catch (error) { return { documents: [], error: error.message }; }
  };
  {
    const docs = await readDocuments(`?publication=${PINNED_ID}`, {
      [PINNED_URL]: PIN, [CURRENT_URL]: CURRENT,
      [DOCS_PINNED_URL]: DOCS_PIN, [DOCS_CURRENT_URL]: DOCS_CURRENT });
    check(docs.documents[0] === "PIN" && !readAsked().includes(DOCS_CURRENT_URL),
          "a pinned payload reads the pinned publication's documents",
          docs.error || JSON.stringify(readAsked()));
  }
  {
    const docs = await readDocuments("", { [CURRENT_URL]: CURRENT, [DOCS_CURRENT_URL]: DOCS_CURRENT });
    check(docs.documents[0] === "CURRENT", "no pin reads the current publication's documents",
          docs.error || JSON.stringify(readAsked()));
  }
  {
    const docs = await readDocuments(`?publication=${PINNED_ID}`, {
      [CURRENT_URL]: CURRENT, [DOCS_PINNED_URL]: DOCS_PIN, [DOCS_CURRENT_URL]: DOCS_CURRENT });
    check(docs.documents[0] === "CURRENT" && !readAsked().includes(DOCS_PINNED_URL),
          "a dead pin's documents fall back with its payload",
          docs.error || JSON.stringify(readAsked()));
  }
  {
    const docs = await readDocuments("?publication=behaviours-v5-reader", {
      [CURRENT_URL]: CURRENT, [DOCS_CURRENT_URL]: DOCS_CURRENT });
    check(docs.documents[0] === "CURRENT"
          && readAsked().every(url => !url.includes("behaviours-v5-reader")),
          "a malformed pin reads the current documents and never asks for its own",
          docs.error || JSON.stringify(readAsked()));
  }
  {
    const DOCS_SPEC_URL = `${DOCS_CURRENT_URL}?spec=${encodeURIComponent(SPEC_A)}`;
    const docs = await readDocuments(`?spec=${SPEC_A}`, {
      [CURRENT_URL]: CURRENT, [DOCS_SPEC_URL]: DOCS_CURRENT });
    check(docs.documents[0] === "CURRENT",
          "the documents request names the document the address asks for",
          docs.error || JSON.stringify(readAsked()));
  }

  console.log(failures === 0
    ? "app.js payload resolution: PASS (pin -> current publication; a dead pin "
      + "falls through, a malformed one never asks; the documents follow the payload)"
    : `app.js payload resolution: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();
