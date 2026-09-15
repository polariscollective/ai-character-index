#!/usr/bin/env node
/* Guard for the sentence site/spec-reader/app.js writes in a translated
 * document's band: translatorNames, shortenTranslator and translationNote, all
 * extracted verbatim from the real file.
 *
 * Two claims live in that one sentence, and both have been false. "The index
 * judged this translation" was said of a document no panel had read, above a
 * note saying it had not been judged. And a translator field cut at "except"
 * kept its qualification only when the clause it cut happened to say "revised
 * by", so any other exception credited the whole translation to a model that
 * did part of it.
 *
 * Exits 0 when every check holds, 1 otherwise, and prints a final count line
 * the Python driver asserts on.
 * Run:  node engine/panel/test_appjs_translation.js
 * (driven from test_panel.py::TestAppJSTranslation; needs Node, no browser/keys)
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

eval(extractConst("LANGUAGE_NAMES"));
// Several lines, so read to its closing brace; `var` so the eval leaves it in scope.
eval(extractFn("const TRANSLATOR_NAMES = {").replace(/^const /, "var "));
eval(extractConst("languageName"));
eval(extractFn("function translatorNames("));
eval(extractFn("function shortenTranslator("));
eval(extractFn("function translationNote("));

let checks = 0, failures = 0;
function check(got, want, label) {
  checks += 1;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)} (expected ${JSON.stringify(want)})`);
}

const note = (by, judged, reviewed = false) =>
  translationNote({ from: "zh", by, reviewed }, judged);
const JUDGED = " The index judged this translation.";

/* ---- judged: said only where it is not contradicted ---- */

/* A published payload carries no `judged` field today: publish builds its
 * documents payload without judged_version_ids, and every document in it came
 * from a published cell, so a panel read it. Absent is therefore the ordinary
 * case, and it keeps the sentence. */
check(note("claude-opus-5", undefined),
      `Machine translation from Chinese by Claude Opus 5.${JUDGED}`,
      "a document with no judged field says the index judged it");
check(note("claude-opus-5", true),
      `Machine translation from Chinese by Claude Opus 5.${JUDGED}`,
      "a document marked judged says the index judged it");

/* Marked unjudged, the reader already says "Not judged yet" under the band. A
 * band that went on saying the index judged it would contradict the note below
 * it, on the same screen. */
check(note("claude-opus-5", false),
      "Machine translation from Chinese by Claude Opus 5.",
      "a document marked unjudged does not say the index judged it");
check(note("claude-opus-5", false, true),
      "Machine translation from Chinese by Claude Opus 5, reviewed by a person.",
      "an unjudged document still says a person reviewed it");

/* ---- except: whatever is cut, the claim before it is qualified ---- */

check(note("claude-opus-5, revised by claude-fable-5", undefined),
      `Machine translation from Chinese by Claude Opus 5, revised by Claude Fable 5.${JUDGED}`,
      "nothing cut, nothing qualified");
check(note("claude-opus-5, with exceptional care", undefined),
      `Machine translation from Chinese by Claude Opus 5, with exceptional care.${JUDGED}`,
      "a word that only starts with except is not an exception");

/* The shape the real column has, which the reader already handled. */
check(note("claude-opus-5, revised by claude-fable-5 except parts of refuse-violence and minor-safety", undefined),
      `Machine translation from Chinese by Claude Opus 5, revised in part by Claude Fable 5.${JUDGED}`,
      "a reviser that skipped parts revised the document in part");

/* The cases it did not: an exception to a clause that is not "revised by". */
check(note("claude-opus-5, reviewed by deepseek-v3.2 except section 3", undefined),
      `Machine translation from Chinese by Claude Opus 5, reviewed in part by deepseek-v3.2.${JUDGED}`,
      "the exception qualifies the clause it follows, whatever its verb");
check(note("claude-opus-5 except the appendix", undefined),
      `Machine translation from Chinese in part by Claude Opus 5.${JUDGED}`,
      "an exception to the translator alone makes the translation in part theirs");
check(note("claude-opus-5 except the appendix", false),
      "Machine translation from Chinese in part by Claude Opus 5.",
      "the qualification and the judged sentence are independent");

/* ---- nothing left to name: no attribution at all ---- */

/* A field that starts at "except" keeps nothing before the cut, and the band read
 * "in part by ." with nobody in it. With nobody to name, it names nobody. */
check(note("except the appendix", undefined),
      `Machine translation from Chinese.${JUDGED}`,
      "a field that starts at except drops the attribution");
check(note(", except the appendix", false),
      "Machine translation from Chinese.",
      "punctuation before except is not somebody to credit");
check(note(null, undefined),
      `Machine translation from Chinese.${JUDGED}`,
      "an empty field drops the attribution rather than saying by nobody");

/* ---- dismissing the notice ---- */

/* A viewer may dismiss a document's translation notice, and it stays dismissed
 * for that viewer on that document version, and on no other. The storage is the
 * reader's own try/catch helpers: where storage is refused the notice shows, which
 * is the safe direction for a disclosure. localStorage here is a stand-in, so a
 * reload is a second read of the same store. */
var localStorage = (() => {
  const store = new Map();
  return { getItem: key => (store.has(key) ? store.get(key) : null),
           setItem: (key, value) => { store.set(key, String(value)); } };
})();
const attempt = run => { try { return run(); } catch (error) { return `threw ${error.message}`; } };
try { eval(extractFn("function translationDismissedKey(documentId) {")); }
catch (error) { var translationDismissedKey = () => { throw error; }; }
eval(extractFn("function savedFlag(key) {"));
eval(extractFn("function saveFlag(key, value) {"));

const THIS_VERSION = "acme--translated@2026-03-01";
const NEXT_VERSION = "acme--translated@2026-09-01";
check(attempt(() => translationDismissedKey(THIS_VERSION)),
      "aci-translation-dismissed:acme--translated@2026-03-01",
      "the dismissal is kept per document version id");
check(attempt(() => translationDismissedKey(NEXT_VERSION) !== translationDismissedKey(THIS_VERSION)),
      true, "a new version of the document has a key of its own");
check(attempt(() => savedFlag(translationDismissedKey(THIS_VERSION))), false,
      "before it is dismissed, the notice shows");
check(attempt(() => { saveFlag(translationDismissedKey(THIS_VERSION), true);
                      return savedFlag(translationDismissedKey(THIS_VERSION)); }), true,
      "once dismissed, a reload reads it dismissed");
check(attempt(() => savedFlag(translationDismissedKey(NEXT_VERSION))), false,
      "dismissing one version leaves the next version's notice showing");
localStorage = { getItem() { throw new Error("storage refused"); },
                 setItem() { throw new Error("storage refused"); } };
check(attempt(() => { saveFlag(translationDismissedKey(THIS_VERSION), true);
                      return savedFlag(translationDismissedKey(THIS_VERSION)); }), false,
      "where storage is refused, nothing throws and the notice shows");

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
