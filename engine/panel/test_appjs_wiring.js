#!/usr/bin/env node
/* Automated guard for the panel scoring PIPELINE in
 * site/spec-reader/app.js -- applyPanelThreshold and initialBands, plus the
 * helpers they call, all extracted verbatim from the real file.
 *
 * The existing tiers harness pins the pure cut functions well. It does not pin
 * the code that CALLS them, and a mutation audit of the merged tree showed what
 * that costs: collapsing applyPanelThreshold's per-cell scale to the classic
 * `2` -- the exact nine-point-scale bug PR #66 exists to fix -- left the tiers
 * harness, the fallthrough harness AND the Playwright feature walker green.
 * Replacing initialBands' legacyThresholdBands(...) call with a bare
 * DEFAULT_BANDS, i.e. deleting that fix outright, also stayed green.
 *
 * So the pins here are deliberately end-to-end: feed a payload in, assert the
 * bands that come out. A pure-function test cannot catch a disconnected caller.
 *
 * Exits 0 when every pinned behaviour holds, 1 otherwise, and prints a final
 * count line the Python driver asserts on.
 * Run:  node engine/panel/test_appjs_wiring.js
 * (driven from test_panel.py::TestAppJSWiring; needs Node, no browser/keys)
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

/* The two browser globals the pipeline reads. `location` is replaced per-case by
 * setParams() below; `state` is the app's own store. Everything else is real. */
var location = { search: "" };
var state = { bands: null, rawBehaviours: null };
var initialParams = new URLSearchParams("");

eval(extractConst("TIERS"));
eval(extractConst("DEFAULT_BANDS"));
eval(extractFn("function achievableScores(judges, maxCell, related) {"));
eval(extractFn("function bandReachable(judges, maxCell, related) {"));
eval(extractFn("function tierBand(score, judges, maxCell, related) {"));
eval(extractFn("function legacyThresholdBands(t, judges, scale) {"));
eval(extractFn("function judgesPerCell() {"));
eval(extractFn("function maxCellScore() {"));
eval(extractFn("function applyPanelThreshold(payload) {"));
eval(extractFn("function initialBands() {"));

function setParams(qs) {
  location = { search: qs };
  initialParams = new URLSearchParams(qs);
}

let checks = 0, failures = 0;
function check(got, want, label) {
  checks += 1;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)} (expected ${JSON.stringify(want)})`);
}

const cell = verdicts => ({ passages: verdicts.map((v, i) => ({ id: `p${i}`, quote: "q", verdicts: v })) });
const payload = cells => ({ behaviours: cells.map((c, i) => ({ slug: `b${i}`, coverage: { spec: c } })) });
function bandsOf(p) { return (p.behaviours[0].coverage.spec.passages || []).map(x => x.band); }

/* ---- applyPanelThreshold: the per-cell scale is DERIVED, not assumed ---- */

/* A 4-point cell tops out at 9. Unanimous 3s must be defining, and unanimous 2s
 * must NOT be -- if the scale collapses to the classic 6, defCut lands on the
 * core cut and 2/2/2 is misreported as defining. This is the mutation that
 * survived every existing harness. */
setParams("");
state.bands = new Set(TIERS);
let p = payload([cell([{ a: 3, b: 3, c: 3 }, { a: 2, b: 2, c: 2 }, { a: 2, b: 2, c: 1 }])]);
applyPanelThreshold(p);
check(bandsOf(p), ["defining", "core", "related"],
      "4-point cell: 9 is defining, 6 is core, 5 is related");

/* The same three vote-patterns on a cell no judge ever awarded a 3 to. Here the
 * scale really is 6, defCut clamps to it, and unanimous core IS defining. The
 * two cases together mean neither a frozen 2 nor a frozen 3 can pass. */
p = payload([cell([{ a: 2, b: 2, c: 2 }, { a: 2, b: 2, c: 1 }, { a: 1, b: 1, c: 1 }])]);
applyPanelThreshold(p);
check(bandsOf(p), ["defining", "related"],
      "3-point cell: unanimous core IS defining, and the core band sits empty");
/* ...and the third passage is gone, not merely unbanded: score 3 is below the
 * related cut of j+1=4, and sub-tier passages are dropped from the cell. */
check(p.behaviours[0].coverage.spec.passages.length, 2,
      "a sub-tier passage is dropped from the cell, not rendered unbanded");

/* Scale is per CELL, not per payload: a 4-point cell next to a 3-point one must
 * not drag the other's cuts. */
p = payload([cell([{ a: 3, b: 3, c: 3 }]), cell([{ a: 2, b: 2, c: 2 }])]);
applyPanelThreshold(p);
check([bandsOf(p)[0], p.behaviours[1].coverage.spec.passages[0].band],
      ["defining", "defining"],
      "each cell is scaled on its own verdicts, not the payload's maximum");

/* The related weight is the ?related= knob, and it feeds the score. */
const twoTwoOne = () => payload([cell([{ a: 2, b: 2, c: 1 }])]);
setParams("");
p = twoTwoOne(); applyPanelThreshold(p);
check(p.behaviours[0].coverage.spec.passages[0].score, 5,
      "a related verdict is worth 1 by default");
setParams("?related=0");
p = twoTwoOne(); applyPanelThreshold(p);
check(p.behaviours[0].coverage.spec.passages[0].score, 4,
      "?related=0 zeroes the weight of a related verdict");
setParams("");

/* ---- ragged cells: the cut follows the passage, not the cell ---- */

/* A cell where one passage got two judges and another got three. The 2-judge
 * passage tops out at 4, so measuring it against the cell's 3-judge cut of 6
 * made it structurally incapable of reaching the band it earned -- three
 * passages in behaviours-v4a-ds.json scored a unanimous 4/4 and rendered as
 * "Related". Each passage is banded on its own scale now. */
setParams("");
state.bands = new Set(TIERS);
p = payload([cell([{ a: 2, b: 2 }, { a: 2, b: 2, c: 2 }])]);
applyPanelThreshold(p);
check(bandsOf(p), ["defining", "defining"],
      "a unanimous 2-judge passage is defining on its own scale, not related");
check(p.behaviours[0].coverage.spec.passages[0].maxScore, 4,
      "and it is scored out of its own maximum, not the cell's");

/* The counterweight: promotion must come from the passage's own scale, not from
 * a blanket lowering of the cut. A 2-judge passage that did NOT sweep stays put. */
p = payload([cell([{ a: 2, b: 1 }, { a: 2, b: 2, c: 2 }])]);
applyPanelThreshold(p);
check(bandsOf(p), ["related", "defining"],
      "a split 2-judge passage stays related -- the cut moved, not the floor");

/* The header tallies read the same per-passage bands, so a promoted passage is
 * counted where it is actually rendered. */
p = payload([cell([{ a: 2, b: 2 }, { a: 2, b: 2, c: 2 }])]);
applyPanelThreshold(p);
check(p.behaviours[0].coverage.spec.bandCounts, { defining: 2, core: 0, related: 0 },
      "bandCounts follows the per-passage bands");

/* ---- initialBands: the legacy mapping is actually WIRED IN ---- */

/* Every check below would still pass if initialBands ignored its helpers and
 * returned DEFAULT_BANDS -- except that DEFAULT_BANDS is all three tiers, so a
 * case expecting defining alone and a case expecting defining and core together
 * pin the call. */
state.rawBehaviours = payload([cell([{ a: 2, b: 2, c: 2 }])]).behaviours;
setParams("?threshold=6");
check([...initialBands()], ["defining"],
      "?threshold=6 on a 6-scale payload resolves through the derived cuts");

state.rawBehaviours = payload([cell([{ a: 3, b: 3, c: 3 }])]).behaviours;
setParams("?threshold=6");
check([...initialBands()], ["defining", "core"],
      "?threshold=6 on a 9-scale payload keeps core");
setParams("?threshold=4");
check([...initialBands()], TIERS,
      "?threshold=4 on a 9-scale payload falls through to every tier");

/* ---- initialBands: the defaults, and what still overrides them ---- */

/* With nothing in the URL every band shows. Related passages, the concrete
 * examples and applications of a norm, used to wait behind a toggle a reader had
 * to know to press; they are drawn softer than core instead, and the toggles
 * still narrow the view. A link that names its bands keeps them. */
setParams("");
check([...initialBands()], ["defining", "core", "related"],
      "no ?tiers= in the URL shows all three bands");
setParams("?tiers=defining,core");
check([...initialBands()], ["defining", "core"],
      "an explicit ?tiers= still wins over the defaults");
setParams("?tiers=none");
check([...initialBands()], [],
      "?tiers=none still hides every band");
setParams("?tier=core");
check([...initialBands()], ["defining", "core"],
      "a legacy ?tier= link still maps to the bands it showed");
setParams("");

/* ---- judgesPerCell takes the LARGEST, and it matters on real data ---- */

/* behaviours-v5.json has cells mixing 2-judge and 3-judge passages, so min-vs-max
 * changes the legacy mapping on shipped data. */
state.rawBehaviours = payload([cell([{ a: 2, b: 2 }, { a: 2, b: 2, c: 2 }])]).behaviours;
check(judgesPerCell(), 3, "a ragged cell reports its largest judge count, not its smallest");
check(maxCellScore(), 6, "a ragged cell is scaled by that largest judge count");

/* ---- the no-data fallbacks the pipeline needs before a payload loads ---- */
state.rawBehaviours = null;
check(judgesPerCell(), 0, "no payload yet: judge count is 0");
check(maxCellScore(), 0, "no payload yet: cell scale is 0");
check(legacyThresholdBands(7, 0, 0), ["defining"],
      "with no payload the legacy cuts fall back to the 3-judge literals (7)");
check(legacyThresholdBands(6, 0, 0), ["defining", "core"],
      "with no payload the legacy cuts fall back to the 3-judge literals (6)");
check(legacyThresholdBands(5, 0, 0), TIERS,
      "with no payload a sub-core threshold still opens every tier");

/* A loaded payload with no verdicts anywhere yields scale 0; the cut must fall
 * back rather than clamp to zero and call everything defining. */
check(tierBand(4, 3, 0, 1), "related", "a zero-scale cell falls back to the unclamped cut");
check(tierBand(7, 3, 0, 1), "defining", "a zero-scale cell still has a defining cut");

/* The scale fallback, pinned on the pure function. `scale || 2j+1` and
 * `Math.min(2j+1, scale)` differ only when scale is 0, which clamps the defining
 * cut to zero and calls every score defining. */
check(legacyThresholdBands(6, 3, 0), ["defining", "core"],
      "a zero scale falls back to the unclamped defining cut, not to zero");

/* ---- achievableScores: the scale is rounded, not truncated ---- */
check([...achievableScores(3, 9, 1)].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      "a 3-judge 4-point cell can reach every score up to 9");
check([...achievableScores(2, 4, 1)].sort((a, b) => a - b), [0, 1, 2, 3, 4],
      "a 2-judge classic cell can reach every score up to 4");

/* maxCell/judges is not always a whole number -- a ragged cell or a fractional
 * ?related= weight makes it fractional, and truncating loses the top verdict. */
check([...achievableScores(2, 5, 1)].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6],
      "a fractional scale rounds up to the reachable verdict, not down");

/* judges=0 short-circuits: the accumulation loop never runs, so the only
 * achievable score is 0. Note the maxVerdict fallback inside that branch is
 * computed and discarded -- it is dead code, and no test can kill a mutation of
 * it. Pinned here so the contract is stated rather than assumed. */
check([...achievableScores(0, 9, 1)], [0],
      "with no judges the only achievable score is 0");

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
