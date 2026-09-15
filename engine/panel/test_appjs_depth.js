#!/usr/bin/env node
/* Guard for the depth site/spec-reader/app.js reads out of a publication:
 * panelDepth, depthSummaryLine, updateBehaviourDepths and openBehaviourNote,
 * all extracted verbatim from the real file.
 *
 * Two shapes reach the reader in the same field. A publication built by the
 * current builder carries coverage[<document id>].depth = { mean, judges }. The
 * grandfathered publication, which the public reader keeps serving after the
 * merge until a new one is made public, was written by the old builder and
 * carries a human curation's integer there (3 or 4). The reader once took any
 * truthy depth for the first shape, so depth.mean.toFixed threw inside
 * updateBehaviourDepths, initialize() caught it, and every visitor read "could
 * not be loaded". An integer is not the panel's depth: it shows a dash, and the
 * note says "no depth given."
 *
 * Exits 0 when every check holds, 1 otherwise, and prints a final count line
 * the Python driver asserts on.
 * Run:  node engine/panel/test_appjs_depth.js
 * (driven from test_panel.py::TestAppJSDepth; needs Node, no browser/keys)
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

/* The browser the functions below reach for, and nothing more. */
class FakeElement {
  constructor(tag) { this.tag = tag; this.childNodes = []; this.textContent = ""; this.className = ""; }
  append(...nodes) { this.childNodes.push(...nodes); }
}
var document = { createElement: tag => new FakeElement(tag) };
var cells = [];
var noteShown = false;
var elements = {
  keyNote: { showPopover() { noteShown = true; }, hidePopover() {}, matches() { return false; } },
  keyNoteTitle: {},
  keyNoteBody: { children: [], replaceChildren(...nodes) { this.children = nodes; } },
  behaviourList: { querySelectorAll: () => cells },
};
var placeKeyNote = () => {};
var comparePair = () => state.comparePair;
var behaviourNotes = {};
var state = {};

/* Without the guard every check that calls it fails by name, so the count this
 * harness prints is the same before and after the fix. */
try {
  eval(extractFn("function panelDepth(behaviour, documentId) {"));
} catch (missing) {
  var panelDepth = () => { throw missing; };
}
eval(extractConst("DEPTH_WORDS"));
eval(extractFn("function depthSummaryLine(doc, depth) {"));
eval(extractFn("function payloadBehaviours() {"));
eval(extractFn("function visibleDocuments() {"));
eval(extractFn("function updateBehaviourDepths() {"));
eval(extractFn("function openBehaviourNote(button) {"));

let checks = 0, failures = 0;
function check(label, run, want) {
  checks += 1;
  let got;
  try {
    got = run();
  } catch (error) {
    got = `threw ${error.name}: ${error.message}`;
  }
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)} (expected ${JSON.stringify(want)})`);
}

/* The grandfathered publication, as recorded at 085fd2e in
 * site/spec-reader/data/behaviours-v5-reader.json and documents.json: coverage keyed
 * by lab, a curation's integer depth. Passages and markdown are left out; nothing
 * here reads them. */
const LEGACY_DOCUMENTS = [
  { id: "anthropic", lab: "Anthropic", title: "Claude’s Constitution",
    shortTitle: "Claude Constitution", version: "2026-01-20" },
  { id: "openai", lab: "OpenAI", title: "Model Spec",
    shortTitle: "OpenAI Model Spec", version: "2025-12-18" },
];
const LEGACY_HELPFULNESS = {
  id: 1, slug: "helpfulness", name: "Helpfulness",
  coverage: {
    anthropic: { verdict: "covered", depth: 4, note: "", verifiedDate: "2026-07-24", passages: [] },
    openai: { verdict: "covered", depth: 4, note: "", verifiedDate: "2026-07-24", passages: [] },
  },
};

/* A publication the current builder writes: document ids that carry -- and @, and
 * the panel's mean with each judge's depth. */
const JUDGED_DOCUMENTS = [
  { id: "anthropic--constitution@2026-01-20", lab: "Anthropic", title: "Claude’s Constitution",
    version: "2026-01-20" },
  { id: "openai--model-spec@2025-12-18", lab: "OpenAI", title: "Model Spec",
    version: "2025-12-18" },
];
const PANEL_DEPTH = {
  mean: 2.7,
  judges: {
    deepseek: { depth: 3, rationale: "Rules, no examples." },
    fable: { depth: 3, rationale: "Rules, no examples." },
    sol: { depth: 2, rationale: "Discussed in general terms." },
  },
};
const JUDGED_HELPFULNESS = {
  id: 1, slug: "helpfulness", name: "Helpfulness",
  coverage: {
    "anthropic--constitution@2026-01-20": { depth: PANEL_DEPTH, passages: [] },
    "openai--model-spec@2025-12-18": { depth: { mean: 0, judges: {} }, passages: [] },
  },
};

const NOTE = { name: "Helpfulness", defined: true, judged: true, query: "The brief.",
               described: null, boundary: "Where it stops.", source: "Polaris Collective" };

function show(documents, behaviour, { comparing = false } = {}) {
  state = {
    payload: { documents, behaviours: [behaviour] },
    selectedSpec: documents[0].id,
    comparing,
    comparePair: documents.map(doc => doc.id),
  };
  behaviourNotes = { [behaviour.slug]: NOTE };
}

function figure(slug) {
  const description = { textContent: "" };
  const cell = { dataset: { behaviourDepth: slug }, textContent: "", title: "",
                 closest: () => ({ querySelector: () => description }) };
  cells = [cell];
  updateBehaviourDepths();
  return { text: cell.textContent, title: cell.title, description: description.textContent };
}

function note(slug) {
  noteShown = false;
  openBehaviourNote({ dataset: { behaviourNote: slug } });
  const nodes = elements.keyNoteBody.children;
  const after = nodes.findIndex(node => node.textContent === "How deeply the documents on screen cover it");
  return {
    shown: noteShown,
    depth: nodes.slice(after + 1).map(node => node.tag === "ul"
      ? node.childNodes.map(item => item.textContent)
      : node.textContent),
  };
}

/* ---- the guard ---- */
check("an integer from human curation is not the panel's depth",
      () => panelDepth(LEGACY_HELPFULNESS, "anthropic"), null);
check("the panel's depth is returned as it is",
      () => panelDepth(JUDGED_HELPFULNESS, "anthropic--constitution@2026-01-20"), PANEL_DEPTH);
check("a mean of zero is a depth: zero is a finding, a dash is the absence of one",
      () => panelDepth(JUDGED_HELPFULNESS, "openai--model-spec@2025-12-18"), { mean: 0, judges: {} });
for (const [label, depth] of [["null", null], ["a string", "3"], ["zero", 0],
                              ["an object with no mean", { judges: {} }],
                              ["a mean that is not a number", { mean: "2.7", judges: {} }],
                              ["a mean that is not finite", { mean: NaN, judges: {} }]]) {
  check(`${label} is no depth`,
        () => panelDepth({ coverage: { doc: { depth, passages: [] } } }, "doc"), null);
}
check("a document the behaviour has no coverage for has no depth",
      () => panelDepth(LEGACY_HELPFULNESS, "elsewhere"), null);
check("no behaviour at all has no depth", () => panelDepth(undefined, "anthropic"), null);

/* ---- the grandfathered publication renders ---- */
show(LEGACY_DOCUMENTS, LEGACY_HELPFULNESS);
check("the figure beside a behaviour is a dash for a curation's integer",
      () => figure("helpfulness"),
      { text: "–",
        title: "Claude’s Constitution 2026-01-20: no depth given.",
        description: "Claude’s Constitution 2026-01-20: no depth given." });
check("the note says no depth was given, and lists no judge",
      () => note("helpfulness"),
      { shown: true, depth: ["Claude’s Constitution 2026-01-20: no depth given."] });

show(LEGACY_DOCUMENTS, LEGACY_HELPFULNESS, { comparing: true });
check("comparing, both documents of the grandfathered publication show a dash",
      () => figure("helpfulness").text, "– / –");
check("comparing, the note names both documents with no depth given",
      () => note("helpfulness").depth,
      ["Claude’s Constitution 2026-01-20: no depth given.",
       "Model Spec 2025-12-18: no depth given."]);

/* ---- a publication the current builder writes still renders its depths ---- */
show(JUDGED_DOCUMENTS, JUDGED_HELPFULNESS);
check("the figure is the panel's mean",
      () => figure("helpfulness"),
      { text: "2.7",
        title: "Claude’s Constitution 2026-01-20: 2.7 of 4, prescribed.",
        description: "Claude’s Constitution 2026-01-20: 2.7 of 4, prescribed." });
check("the note gives the mean and every judge's depth and rationale",
      () => note("helpfulness").depth,
      ["Claude’s Constitution 2026-01-20: 2.7 of 4, prescribed.",
       ["deepseek: 3. Rules, no examples.", "fable: 3. Rules, no examples.",
        "sol: 2. Discussed in general terms."]]);

show(JUDGED_DOCUMENTS, JUDGED_HELPFULNESS, { comparing: true });
check("comparing, a mean of zero shows as 0.0 and not as a dash",
      () => figure("helpfulness").text, "2.7 / 0.0");

/* ---- a seat another model judged is said beside its document ---- */
const SEATED_DEPTH = {
  mean: 2,
  judges: { deepseek: { depth: 2, rationale: "" }, opus: { depth: 2, rationale: "" },
            sol: { depth: 2, rationale: "" } },
};
const SUBSTITUTED_HELPFULNESS = {
  id: 1, slug: "helpfulness", name: "Helpfulness",
  coverage: {
    "anthropic--constitution@2026-01-20": { depth: PANEL_DEPTH, passages: [] },
    "openai--model-spec@2025-12-18": {
      depth: SEATED_DEPTH, passages: [],
      substitutions: [{ seat: "fable", substitute: "opus",
                        reason: "fable's output was content-filtered on every attempt." }],
    },
  },
};
show(JUDGED_DOCUMENTS, SUBSTITUTED_HELPFULNESS, { comparing: true });
check("comparing, the note names the substitute on its own document and nowhere else",
      () => note("helpfulness").depth,
      ["Claude’s Constitution 2026-01-20: 2.7 of 4, prescribed.",
       ["deepseek: 3. Rules, no examples.", "fable: 3. Rules, no examples.",
        "sol: 2. Discussed in general terms."],
       "Model Spec 2025-12-18: 2.0 of 4, discussed.",
       "On Model Spec 2025-12-18, opus judged in place of fable: "
         + "fable's output was content-filtered on every attempt.",
       ["deepseek: 2.", "opus: 2.", "sol: 2."]]);

SUBSTITUTED_HELPFULNESS.coverage["openai--model-spec@2025-12-18"].substitutions = "fable";
check("a substitutions field that is not a list says nothing and throws nothing",
      () => note("helpfulness").depth.filter(line => String(line).includes("in place of")),
      []);

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
