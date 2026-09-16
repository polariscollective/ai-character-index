#!/usr/bin/env node
/* Guard for the feedback dialog's pure parts, extracted verbatim from
 * site/spec-reader/app.js: what the dialog is about (feedbackSubject) and what
 * it sends (feedbackBody).
 *
 * What matters here is that the behaviours travelling with a comment are the
 * ones highlighting that paragraph and not the whole menu, that an ordinary
 * paragraph sends its own locator, and that the address never travels twice.
 *
 * Exits 0 when every check holds, 1 otherwise, and prints a final count line the
 * Python driver asserts on.
 * Run:  node engine/panel/test_appjs_feedback.js
 * (driven from test_panel.py::TestAppJSFeedback; needs Node, no browser/keys)
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

eval(extractFn("function feedbackSubject("));
eval(extractFn("function feedbackBody("));

/* The three shapes the reader's DOM presents: a paragraph no passage cites,
 * whose icons sit in a .block-copy toolbar inside it; a cited passage, whose
 * icons sit in its .passage-head; and the icon beside a document's title, whose
 * subject is the document itself. Only what these functions read is modelled;
 * every button mock carries a classList, since feedbackSubject reads it first
 * to tell the document-wide icon apart from the other two. */
function uncited(locator) {
  const block = { dataset: { locator }, classList: { contains: () => false } };
  const toolbar = { parentElement: block };
  return {
    classList: { contains: () => false },
    closest: selector => (selector === ".block-copy" ? toolbar : null),
  };
}
function cited(locators, behaviours) {
  const block = { dataset: { locators, behaviours } };
  return {
    classList: { contains: () => false },
    closest: selector => (selector === ".block-copy" ? null : block),
  };
}
function documentWide(id) {
  const panel = { dataset: { documentId: id } };
  return {
    classList: { contains: cls => cls === "document-feedback" },
    closest: selector => (selector === ".document-panel" ? panel : null),
  };
}

let checks = 0, failures = 0;
function check(label, got, want) {
  checks += 1;
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (!same) {
    failures += 1;
    console.log(`FAIL ${label}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

const LOC = "openai--model-spec@2026-08-18 > #levels_of_authority > ¶2";

check("an ordinary paragraph is about its own locator, with no behaviours",
  feedbackSubject(uncited(LOC)), { locator: LOC, behaviours: [] });

check("a cited passage is about the first locator it is cited by",
  feedbackSubject(cited(`${LOC}\nopenai--model-spec@2026-08-18 > #other > ¶9`,
                        "Helpfulness · Proportionate risk mitigation")),
  { locator: LOC, behaviours: ["Helpfulness", "Proportionate risk mitigation"] });

check("the separator is a delimiter, and a behaviour is not split on its own punctuation",
  feedbackSubject(cited(LOC, "Avoiding over- and under-caution")),
  { locator: LOC, behaviours: ["Avoiding over- and under-caution"] });

check("a block with no locator is nothing to send feedback about",
  feedbackSubject(uncited("")), null);

const DOC_ID = "openai--model-spec@2026-08-18";

check("the icon beside a document's title is about the document, with no behaviours",
  feedbackSubject(documentWide(DOC_ID)), { locator: DOC_ID, behaviours: [] });

check("a document panel with no id is nothing to send feedback about either",
  feedbackSubject(documentWide(undefined)), null);

// The private toggle and the name field, not a visibility asked for directly:
// feedbackBody derives it, per the table in its own comment.
const FORM = { vote: "down", comment: "It reads wrong.", email: "reader@example.org",
               private: false, name: "A reader", website: "" };

check("the body carries the paragraph, the reading and the choice: a name typed with the toggle off is attributed",
  feedbackBody({ locator: LOC, behaviours: ["Helpfulness"] }, FORM, null),
  { locator: LOC, behaviours: ["Helpfulness"], publication: null, vote: "down",
    comment: "It reads wrong.", email: "reader@example.org", visibility: "attributed",
    display_name: "A reader", website: "" });

check("no name and the toggle off travels anonymous, with nobody named",
  feedbackBody({ locator: LOC, behaviours: [] }, { ...FORM, name: "" }, null),
  { locator: LOC, behaviours: [], publication: null, vote: "down", comment: "It reads wrong.",
    email: "reader@example.org", visibility: "anonymous", display_name: "", website: "" });

check("the private toggle overrules a typed name: nothing travels named",
  feedbackBody({ locator: LOC, behaviours: [] }, { ...FORM, private: true }, null),
  { locator: LOC, behaviours: [], publication: null, vote: "down", comment: "It reads wrong.",
    email: "reader@example.org", visibility: "private", display_name: "", website: "" });

check("a pinned reader says which publication it was reading",
  feedbackBody({ locator: LOC, behaviours: [] }, FORM,
               "8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37").publication,
  "8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37");

// Checks for the literal address rather than a bare "@": a locator is
// "<lab>--<document>@<version> > ..." (see CLAUDE.md), so every real locator
// carries an "@" of its own, and a substring check on that character would
// flag "locator" as a second carrier of an address it never held.
check("the address travels in one field only",
  Object.entries(feedbackBody({ locator: LOC, behaviours: [] }, FORM, null))
    .filter(([, value]) => value === FORM.email).map(([key]) => key),
  ["email"]);

console.log(`${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
