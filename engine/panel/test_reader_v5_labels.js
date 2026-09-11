#!/usr/bin/env node
/* Band-label guard for the keep-set payload. The keep-set carries a flat
 * adjacent flag baked at build time (score < solid_threshold = 6); the reader
 * bands each passage at render with tierBand. On 3-judge cells the two
 * agree everywhere except ragged passages scored by fewer judges, whose own-
 * scale cuts sit below the flat one. tierBand is extracted verbatim from the
 * real site/spec-reader/app.js (as in test_appjs_tiers.js), and every
 * committed passage must satisfy adjacent === (band === "related") -- with the
 * three accepted ragged exceptions enumerated in KNOWN_EXCEPTIONS (they score
 * 4/6 on two judges: core on their own scale, adjacent under the flat cut).
 * Any other exception fails. Exits 0 when every label holds, 1 otherwise.
 * Run:  node engine/panel/test_reader_v5_labels.js <payload.json>
 * (driven from tests/test_reader_v5_payload.py::BandLabelsHarnessTest) */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const APP_JS = path.join(ROOT, "site", "spec-reader", "app.js");
/* The payload is given, not found: it lives in the database now, and the
 * committed copy this used to read is gone. verify_supabase_provenance.py hands
 * over what the current publication actually serves. */
const PAYLOAD = process.argv[2];
if (!PAYLOAD) {
  console.error("usage: node engine/panel/test_reader_v5_labels.js <payload.json>");
  process.exit(2);
}

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

eval(extractFn("function tierBand(score, judges, maxCell, related) {"));

/* Locators compared with both separator spellings normalized (" \u203a " -> " > "). */
const KNOWN_EXCEPTIONS = new Set([
  "constitution@2026-01-20 > Being helpful > What constitutes genuine helpfulness > \u00b69",
  "constitution@2026-01-20 > Overview > Claude\u2019s core values > \u00b67",
  "model-spec@2025-12-18 > #overview > \u00b66",
]);
const normLoc = l => l.replace(/ \u203a /g, " > ");

const RELATED = 1; // the app's default for ?related=
const data = JSON.parse(fs.readFileSync(PAYLOAD, "utf8"));

let passages = 0, failures = 0, exceptionsSeen = new Set();
for (const behaviour of data.behaviours) {
  for (const [lab, cell] of Object.entries(behaviour.coverage)) {
    if (!cell.passages) continue;
    const maxVerdict = Math.max(
      2, ...cell.passages.flatMap(p => p.verdicts ? Object.values(p.verdicts) : []));
    for (const p of cell.passages) {
      passages++;
      const votes = Object.keys(p.verdicts || {}).length;
      const band = tierBand(p.score, Math.max(1, votes), maxVerdict * votes, RELATED);
      const agrees = p.adjacent === (band === "related");
      if (!agrees) {
        if (KNOWN_EXCEPTIONS.has(normLoc(p.locator)) && p.adjacent && band === "core") {
          exceptionsSeen.add(normLoc(p.locator));
        } else {
          failures++;
          if (failures <= 5) console.log(
            `FAIL  ${behaviour.slug}/${lab}: ${p.locator}` +
            `  score ${p.score}, ${votes} judges, band ${band}, adjacent ${p.adjacent}`);
        }
      }
      if (band === null) {
        failures++;
        if (failures <= 5) console.log(
          `FAIL  sub-tier passage present: ${behaviour.slug}/${lab}: ${p.locator} (score ${p.score})`);
      }
    }
  }
}
for (const expected of KNOWN_EXCEPTIONS) {
  if (!exceptionsSeen.has(expected)) {
    failures++;
    console.log(`FAIL  expected ragged exception no longer diverges -- remove it: ${expected}`);
  }
}
if (failures) {
  console.log(`${failures} failure(s) across ${passages} passages`);
  process.exit(1);
}
console.log(`OK: ${passages} passages agree with the panel band` +
  ` (${exceptionsSeen.size} accepted ragged exception(s) enumerated)`);
