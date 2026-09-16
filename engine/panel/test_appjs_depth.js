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
/* A const whose value runs over several lines: read on until its brackets close. */
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

/* The browser the functions below reach for, and nothing more. */
class FakeElement {
  constructor(tag) { this.tag = tag; this.childNodes = []; this.textContent = ""; this.className = ""; }
  append(...nodes) { this.childNodes.push(...nodes); }
}
var document = { createElement: tag => new FakeElement(tag) };
var cells = [];
var noteShown = false;
/* The depth note is never opened here -- what it prints is checked through the
 * functions that assemble it, below -- but updateBehaviourDepths closes it, so
 * the element and the trigger it releases have to exist. */
var depthNoteTrigger = null;
var releasedTo = null;
var figureLabel = null;
var elements = {
  // The classes the note opened with. A real popover has a classList and
  // openBehaviourNote sets its width through one, so a stub without it makes
  // every check in this file throw on a line that has nothing to do with depth.
  keyNote: {
    classes: new Set(),
    classList: {
      toggle(name, on) {
        if (on) elements.keyNote.classes.add(name);
        else elements.keyNote.classes.delete(name);
      },
      remove(name) { elements.keyNote.classes.delete(name); },
    },
    showPopover() { noteShown = true; }, hidePopover() {}, matches() { return false; },
  },
  keyNoteTitle: {},
  keyNoteBody: { children: [], replaceChildren(...nodes) { this.children = nodes; } },
  depthNote: { matches() { return false; }, hidePopover() {} },
  behaviourList: { querySelectorAll: () => cells },
};
var placeKeyNote = () => {};
var comparePair = () => state.comparePair;
var behaviourNotes = {};
// The links the reader fetched, which carry the behaviour comparison the note
// prints under the depths. Null here: this file checks the depths.
var linkRows = null;
var state = {};

/* Without the guard every check that calls it fails by name, so the count this
 * harness prints is the same before and after the fix. */
try {
  eval(extractFn("function panelDepth(behaviour, documentId) {"));
} catch (missing) {
  var panelDepth = () => { throw missing; };
}
eval(extractConstBlock("DEPTH_LEVELS"));
eval(extractConst("NUMBER_WORDS"));
eval(extractConst("DEPTH_WORDS"));
eval(extractFn("function endedSentence(reason) {"));
eval(extractFn("function depthJudgeCount(behaviours) {"));
eval(extractFn("function depthScaleLede(behaviours) {"));
eval(extractFn("function depthScaleNote(behaviours) {"));
eval(extractFn("function depthCellNote(behaviour, doc) {"));
eval(extractFn("function depthFigureNote(behaviour, documents) {"));
eval(extractFn("function releaseDepthTrigger() {"));
eval(extractFn("function closeDepthNote() {"));
eval(extractFn("function depthSummaryLine(doc, depth) {"));
eval(extractFn("function depthSpoken(depths) {"));
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

/* The figure is bare: the sidebar states the scale once, at the top of the column.
 * What a screen reader hears beside the name is the spoken form, which carries the
 * scale on every value, because the column's header is not read with it. */
function figure(slug) {
  const description = { textContent: "" };
  const spoken = { textContent: "" };
  const cell = { dataset: { behaviourDepth: slug }, textContent: "", title: "",
                 // The figure is a button now, so it is named rather than hidden.
                 setAttribute(name, value) { if (name === "aria-label") figureLabel = value; },
                 closest: () => ({ querySelector: selector =>
                   (selector === ".depth-spoken" ? spoken : description) }) };
  cells = [cell];
  figureLabel = null;
  updateBehaviourDepths();
  return { text: cell.textContent, title: cell.title, description: description.textContent,
           spoken: spoken.textContent };
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
        description: "Claude’s Constitution 2026-01-20: no depth given.",
        spoken: "no depth given" });
check("the note says no depth was given, and lists no judge",
      () => note("helpfulness"),
      { shown: true, depth: ["Claude’s Constitution 2026-01-20: no depth given."] });

show(LEGACY_DOCUMENTS, LEGACY_HELPFULNESS, { comparing: true });
check("comparing, both documents of the grandfathered publication show a dash",
      () => figure("helpfulness").text, "– / –");
check("comparing, a behaviour with no depth on either document is spoken as none given",
      () => figure("helpfulness").spoken, "no depth given");
check("comparing, the note names both documents with no depth given",
      () => note("helpfulness").depth,
      ["Claude’s Constitution 2026-01-20: no depth given.",
       "Model Spec 2025-12-18: no depth given."]);

/* ---- a publication the current builder writes still renders its depths ---- */
show(JUDGED_DOCUMENTS, JUDGED_HELPFULNESS);
check("the figure is the panel's bare mean; its title and spoken form say out of 4",
      () => figure("helpfulness"),
      { text: "2.7",
        title: "Claude’s Constitution 2026-01-20: 2.7 out of 4, prescribed.",
        description: "Claude’s Constitution 2026-01-20: 2.7 out of 4, prescribed.",
        spoken: "depth 2.7 out of 4" });
check("the note's sentence gives the mean out of 4, and every judge's depth and rationale",
      () => note("helpfulness").depth,
      ["Claude’s Constitution 2026-01-20: 2.7 out of 4, prescribed.",
       ["deepseek: 3. Rules, no examples.", "fable: 3. Rules, no examples.",
        "sol: 2. Discussed in general terms."]]);

show(JUDGED_DOCUMENTS, JUDGED_HELPFULNESS, { comparing: true });
check("comparing, a mean of zero shows as 0.0 and not as a dash",
      () => figure("helpfulness").text, "2.7 / 0.0");
check("comparing, each document's depth is spoken with its scale",
      () => figure("helpfulness").spoken, "depth 2.7 out of 4 and 0.0 out of 4");
/* The figure opens the cell behind it, so it is a button, so it cannot be hidden
 * from a screen reader the way the bare span was. It is named instead. */
check("the figure's own control is named with its behaviour and the figures it shows",
      () => { figure("helpfulness"); return figureLabel; },
      "Helpfulness: depth 2.7 out of 4 and 0.0 out of 4");
/* A note assembled for the documents that were on screen is not left open over
 * the ones that replaced them: stale reads as the answer to the question just
 * asked, which is worse than closed. */
check("a change to the documents on screen releases an open note's trigger",
      () => {
        releasedTo = null;
        depthNoteTrigger = { setAttribute: (name, value) => { releasedTo = `${name}=${value}`; } };
        figure("helpfulness");
        return [releasedTo, depthNoteTrigger];
      },
      ["aria-expanded=false", null]);

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
      ["Claude’s Constitution 2026-01-20: 2.7 out of 4, prescribed.",
       ["deepseek: 3. Rules, no examples.", "fable: 3. Rules, no examples.",
        "sol: 2. Discussed in general terms."],
       "Model Spec 2025-12-18: 2.0 out of 4, discussed.",
       "On Model Spec 2025-12-18, opus judged in place of fable: "
         + "fable's output was content-filtered on every attempt.",
       ["deepseek: 2.", "opus: 2.", "sol: 2."]]);

SUBSTITUTED_HELPFULNESS.coverage["openai--model-spec@2025-12-18"].substitutions =
  [{ seat: "fable", substitute: "opus",
     reason: "fable's output was content-filtered on every attempt" }];
check("a reason with no closing punctuation ends as a sentence",
      () => note("helpfulness").depth.find(line => typeof line === "string" && line.includes("in place of")),
      "On Model Spec 2025-12-18, opus judged in place of fable: "
        + "fable's output was content-filtered on every attempt.");

SUBSTITUTED_HELPFULNESS.coverage["openai--model-spec@2025-12-18"].substitutions =
  [{ seat: "fable", substitute: "opus", reason: "content-filtered every time!" }];
check("a reason already ending in punctuation is not given a second one",
      () => note("helpfulness").depth.find(line => typeof line === "string" && line.includes("in place of")),
      "On Model Spec 2025-12-18, opus judged in place of fable: content-filtered every time!");

SUBSTITUTED_HELPFULNESS.coverage["openai--model-spec@2025-12-18"].substitutions = "fable";
check("a substitutions field that is not a list says nothing and throws nothing",
      () => note("helpfulness").depth.filter(line => String(line).includes("in place of")),
      []);

/* ---- what the two depth popovers print ----
 *
 * The figure in the menu and the scale at the top of its column each open a
 * popover, and both assemble their content here rather than in the DOM, so what
 * they say can be held to the rubric without a browser. The rubric is
 * methodology/spec-coverage-depth-rubric.md: its five anchors and its bars are
 * checked by their own words, because a popover that paraphrases the rubric
 * loosely is a second rubric nobody maintains. */

const THREE_JUDGES = {
  id: 2, slug: "three-judges", name: "Three judges",
  coverage: {
    "anthropic--constitution@2026-01-20": { depth: PANEL_DEPTH, passages: [] },
    "openai--model-spec@2025-12-18": {
      depth: SEATED_DEPTH, passages: [],
      substitutions: [{ seat: "fable", substitute: "opus",
                        reason: "fable's output was withheld by a content filter" }],
    },
  },
};
const ONE_JUDGE = {
  id: 3, slug: "one-judge", name: "One judge",
  coverage: {
    "anthropic--constitution@2026-01-20": {
      depth: { mean: 1, judges: { sol: { depth: 1, rationale: "Named only." } } },
      passages: [],
    },
  },
};
const UNJUDGED = {
  id: 4, slug: "unjudged", name: "Unjudged",
  // An entry with passages and no depth: the document was read, this cell was not judged.
  coverage: { "anthropic--constitution@2026-01-20": { passages: [] } },
};
const ILL_FORMED = {
  id: 5, slug: "ill-formed", name: "Ill formed",
  coverage: {
    "openai--model-spec@2025-12-18": {
      depth: SEATED_DEPTH, passages: [], substitutions: "fable",
    },
  },
};
const PUNCTUATED = {
  id: 6, slug: "punctuated", name: "Punctuated",
  coverage: {
    "openai--model-spec@2025-12-18": {
      depth: SEATED_DEPTH, passages: [],
      substitutions: [{ seat: "fable", substitute: "opus",
                        reason: "content-filtered every time!" }],
    },
  },
};

check("the scale is the rubric's five levels, 0 to 4, under its own anchors",
      () => depthScaleNote([]).levels.map(level => `${level.level} ${level.anchor}`),
      ["0 absent", "1 named", "2 discussed", "3 prescribed", "4 demonstrated"]);
check("the word said beside a mean is the anchor of the level it rounds to",
      () => DEPTH_WORDS, ["absent", "named", "discussed", "prescribed", "demonstrated"]);
check("level 0's bar is the rubric's sentence",
      () => depthScaleNote([]).levels[0].bar, "No passage bears on the behaviour.");
check("level 3's bar keeps the rubric's grading test",
      () => depthScaleNote([]).levels[3].bar,
      "The spec states concrete do/don't rules or procedures for the behaviour, "
        + "specific enough that a grader can quote the spec's own sentences as pass criteria.");
check("level 4's bar keeps the rubric's worked examples",
      () => depthScaleNote([]).levels[4].bar,
      "Prescribed, plus worked examples: concrete scenarios where the spec shows the "
        + "sanctioned response, usable as an answer key for borderline cases.");
check("the scale says what depth is not, and how many judges the figure averages",
      () => depthScaleNote([THREE_JUDGES]).lede,
      "Depth measures how far a document develops a behaviour, not whether it agrees "
        + "with it, and each figure is the mean of the panel's three judges.");
check("a payload whose cells were judged by different numbers counts none of them",
      () => depthScaleLede([JUDGED_HELPFULNESS]),
      "Depth measures how far a document develops a behaviour, not whether it agrees "
        + "with it, and each figure is the mean of the panel's judges.");
check("a panel of one is not called three",
      () => depthScaleLede([ONE_JUDGE]),
      "Depth measures how far a document develops a behaviour, not whether it agrees "
        + "with it, and each figure is the mean of the panel's single judge.");
check("the scale's own title says the scale",
      () => depthScaleNote([]).title, "Depth, out of 4");

check("a judged cell gives the mean out of 4, the rubric word, and every judge with its rationale",
      () => depthCellNote(THREE_JUDGES, JUDGED_DOCUMENTS[0]),
      { document: "Claude’s Constitution 2026-01-20",
        figure: "2.7",
        summary: "2.7 out of 4, prescribed.",
        substitutions: [],
        judges: [{ judge: "deepseek", depth: 3, rationale: "Rules, no examples." },
                 { judge: "fable", depth: 3, rationale: "Rules, no examples." },
                 { judge: "sol", depth: 2, rationale: "Discussed in general terms." }] });
check("a seat another model judged is named in that cell, as a sentence",
      () => depthCellNote(THREE_JUDGES, JUDGED_DOCUMENTS[1]).substitutions,
      ["opus judged in place of fable: fable's output was withheld by a content filter."]);
check("a reason that already ends a sentence is not given a second full stop",
      () => depthCellNote(PUNCTUATED, JUDGED_DOCUMENTS[1]).substitutions,
      ["opus judged in place of fable: content-filtered every time!"]);
check("a substitutions field that is not a list says nothing and throws nothing",
      () => depthCellNote(ILL_FORMED, JUDGED_DOCUMENTS[1]).substitutions, []);
check("a document a behaviour was not judged on says so plainly, and lists no judge",
      () => depthCellNote(UNJUDGED, JUDGED_DOCUMENTS[0]),
      { document: "Claude’s Constitution 2026-01-20", figure: null,
        summary: "No depth given: this behaviour was not judged on this document.",
        substitutions: [], judges: [] });
check("a document the behaviour carries no entry for reads the same way",
      () => depthCellNote(UNJUDGED, JUDGED_DOCUMENTS[1]).summary,
      "No depth given: this behaviour was not judged on this document.");
check("a curation's integer is no depth here either",
      () => depthCellNote(LEGACY_HELPFULNESS, LEGACY_DOCUMENTS[0]).judges, []);

check("the figure's popover is titled with the behaviour it belongs to",
      () => depthFigureNote(THREE_JUDGES, JUDGED_DOCUMENTS).title, "Three judges");
check("comparing, the figure's popover covers both documents on screen, in pane order",
      () => depthFigureNote(THREE_JUDGES, JUDGED_DOCUMENTS)
              .documents.map(cell => `${cell.document}: ${cell.summary}`),
      ["Claude’s Constitution 2026-01-20: 2.7 out of 4, prescribed.",
       "Model Spec 2025-12-18: 2.0 out of 4, discussed."]);
check("a pane with no document on it is not a section of the popover",
      () => depthFigureNote(THREE_JUDGES, [JUDGED_DOCUMENTS[0], null]).documents.length, 1);

/* ---- the width it opens at ---- */
check("comparing, the behaviour note opens wide",
      () => {
        show(JUDGED_DOCUMENTS, JUDGED_HELPFULNESS, { comparing: true });
        note("helpfulness");
        return elements.keyNote.classes.has("key-note-wide");
      }, true);
check("on one document it opens at the width of the column it hangs off",
      () => {
        show(JUDGED_DOCUMENTS, JUDGED_HELPFULNESS);
        note("helpfulness");
        return elements.keyNote.classes.has("key-note-wide");
      }, false);

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
