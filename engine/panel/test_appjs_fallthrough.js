#!/usr/bin/env node
/* Automated guard for the payload resolution that site/spec-reader/app.js
 * implements:  ?publication=<uuid> pin -> the current publication.  app.js runs
 * DOM code at module scope, so it cannot be imported directly; instead the
 * resolution functions (payloadName, payloadUrl, loadBehaviours) are extracted
 * verbatim from the real file and loadBehaviours is driven against a stubbed
 * loadJSON, exactly as the browser's fetch would resolve it.
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
  l.startsWith("const PAYLOAD_URL") ||
  l.startsWith("const PUBLICATION_ID")).join("\n");

let runner, readSource;
eval(consts + "\n" +
  "let fetchMap = {};\n" +
  "const state = {};\n" +
  "let location;\n" +   // browser global, injected per-scenario below
  "async function loadJSON(url) {\n" +
  "  if (url in fetchMap) return fetchMap[url];\n" +
  "  throw new Error(\"HTTP 404 for \" + url);\n" +
  "}\n" +
  extractFn("function payloadName(id)") + "\n" +
  extractFn("function payloadUrl(id)") + "\n" +
  extractFn("async function loadBehaviours()") + "\n" +
  "runner = async (search, map) => { fetchMap = map; location = { search }; state.payloadSource = undefined; return loadBehaviours(); };\n" +
  "readSource = () => state.payloadSource;");

const PINNED_ID = "7c2e0f11-4b6a-4d2e-9a5f-1e8c3b0d7a42";
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

  console.log(failures === 0
    ? "app.js payload resolution: PASS (pin -> current publication; a dead pin "
      + "falls through, a malformed one never asks)"
    : `app.js payload resolution: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();
