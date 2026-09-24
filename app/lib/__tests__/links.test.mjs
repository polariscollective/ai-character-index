/* The rules that turn rows into bubbles.
 *
 * These were ported from engine/panel/link_reader_data.py, and the port was
 * checked the way a port should be: the Python was run against all four panel
 * runs and its output compared with this module's, pair by pair. 4070 pairs, no
 * pair missing, none added, and no difference in relation, settled, judge or
 * behaviours. The only differences were which of several true sentences a pair
 * shows, on pairs carrying between two and nine rationales; no pair with a single
 * rationale differed.
 *
 * That comparison cannot live here -- it needs the database and a Python run --
 * so what is pinned below is each rule on its own, with the cases that would have
 * made the comparison fail if they were wrong.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  documentName, inPlainWords, sayWhich, asSeenFrom, namedRelation,
  verdictsByPair, byLocator, pairsByRun, summaryRow, comparisonKey, passageNoteKey,
  readerLinks,
} from "../links.mjs";

/* readerLinks reaches select(), which refuses to build a request with no
 * credentials, so this file needs them where the rules above never did. Dummy
 * values, worded as publications.test.mjs words them: fetch is injected in every
 * test here, so nothing is ever sent anywhere. */
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

const ANTHROPIC = "anthropic--constitution@2026-01-20 > Being honest > ¶5";
const OPENAI = "openai--model-spec@2026-08-18 > #do_not_lie > ¶1";
const IDS = new Set(["anthropic--constitution@2026-01-20", "openai--model-spec@2026-08-18"]);

test("a lab is named the way it writes its own name", () => {
  assert.equal(documentName(OPENAI), "the OpenAI model spec");
  assert.equal(documentName(ANTHROPIC), "the Anthropic constitution");
  // capitalize() would have written "Openai", which is the reason LABS exists.
  assert.ok(!documentName(OPENAI).includes("Openai"));
});

test("a document id in a judge's sentence is replaced by its name", () => {
  assert.equal(
    inPlainWords("openai--model-spec@2026-08-18 permits it", IDS),
    "the OpenAI model spec permits it");
});

test("a bare specification id is replaced too, and not before the whole id", () => {
  // Longest first: replacing "openai--model-spec" first would leave "@2026-08-18"
  // dangling after the name.
  assert.equal(inPlainWords("openai--model-spec@2026-08-18 and openai--model-spec", IDS),
               "the OpenAI model spec and the OpenAI model spec");
});

test("the source and the target become the documents they meant", () => {
  assert.equal(
    sayWhich("The source requires it, the target does not", ANTHROPIC, OPENAI),
    "The Anthropic constitution requires it, the OpenAI model spec does not");
});

test("a relation is read from the side the bubble sits on", () => {
  const named = "stricter anthropic--constitution@2026-01-20";
  assert.equal(asSeenFrom(named, ANTHROPIC), "stricter_source");
  assert.equal(asSeenFrom(named, OPENAI), "stricter_target");
  // The one rule whose inversion would have been invisible: a bubble would read
  // "stricter here" where the judge said the other document demands more.
});

test("a relation with no direction passes through untouched", () => {
  assert.equal(asSeenFrom("same", ANTHROPIC), "same");
  assert.equal(asSeenFrom("nuance", OPENAI), "nuance");
});

test("a call's direction is turned into the document that demands more", () => {
  assert.equal(namedRelation("stricter_source", ANTHROPIC, OPENAI),
               "stricter anthropic--constitution@2026-01-20");
  assert.equal(namedRelation("stricter_target", ANTHROPIC, OPENAI),
               "stricter openai--model-spec@2026-08-18");
});

test("a flat arbitration row is read back into the named form", () => {
  const verdicts = verdictsByPair([{
    first_locator: ANTHROPIC, second_locator: OPENAI,
    relation: "stricter", stricter_document: "anthropic--constitution@2026-01-20",
    why: "Anthropic forbids it outright.", agrees: "neither", arbiter: "opus-5",
    readings: {},
  }]);
  assert.equal([...verdicts.values()][0].named,
               "stricter anthropic--constitution@2026-01-20");
});

test("a pair is carried by both of its passages", () => {
  const rows = byLocator([{
    source_locator: ANTHROPIC, target_locator: OPENAI, relation: "same",
    rationale: "Both say so.", behaviour_slug: "honesty", model: "opus-5",
  }], new Map(), IDS);
  assert.deepEqual(Object.keys(rows).sort(), [ANTHROPIC, OPENAI].sort());
  assert.equal(rows[ANTHROPIC][0].to, OPENAI);
  assert.equal(rows[OPENAI][0].to, ANTHROPIC);
});

test("a pair drawn under two behaviours is one bubble naming both", () => {
  const link = {
    source_locator: ANTHROPIC, target_locator: OPENAI, relation: "same",
    rationale: "Both say so.", model: "opus-5",
  };
  const rows = byLocator([
    { ...link, behaviour_slug: "honesty" },
    { ...link, behaviour_slug: "no-sycophancy" },
  ], new Map(), IDS);
  assert.equal(rows[ANTHROPIC].length, 1);
  assert.deepEqual(rows[ANTHROPIC][0].behaviours, ["honesty", "no-sycophancy"]);
});

test("an absence draws no bubble", () => {
  const rows = byLocator([{
    source_locator: ANTHROPIC, target_locator: null, relation: "absent",
    rationale: "", behaviour_slug: "honesty", model: "opus-5",
  }], new Map(), IDS);
  assert.deepEqual(rows, {});
});

test("an arbiter's verdict replaces the judge's, and its sentence is shown", () => {
  const verdicts = verdictsByPair([{
    first_locator: ANTHROPIC, second_locator: OPENAI,
    relation: "nuance", stricter_document: null,
    why: "They address different cases.", agrees: "neither", arbiter: "opus-5",
    readings: { "opus-5": [{ relation: "same", comment: "Both say so." }] },
  }]);
  const rows = byLocator([{
    source_locator: ANTHROPIC, target_locator: OPENAI, relation: "same",
    rationale: "Both say so.", behaviour_slug: "honesty", model: "opus-5",
  }], verdicts, IDS);
  assert.equal(rows[ANTHROPIC][0].relation, "nuance");
  assert.equal(rows[ANTHROPIC][0].settled, true);
  assert.equal(rows[ANTHROPIC][0].comment, "They address different cases.");
  assert.match(rows[ANTHROPIC][0].trace, /had said same/);
});

test("a pair an arbiter called none carries no bubble at all", () => {
  const verdicts = verdictsByPair([{
    first_locator: ANTHROPIC, second_locator: OPENAI,
    relation: "none", stricter_document: null, why: "Neither bears on the other.",
    agrees: "neither", arbiter: "opus-5", readings: {},
  }]);
  const rows = byLocator([{
    source_locator: ANTHROPIC, target_locator: OPENAI, relation: "same",
    rationale: "Both say so.", behaviour_slug: "honesty", model: "opus-5",
  }], verdicts, IDS);
  assert.deepEqual(rows, {});
});

test("an arbiter never adds a pair no judge drew", () => {
  const verdicts = verdictsByPair([{
    first_locator: ANTHROPIC, second_locator: OPENAI,
    relation: "same", stricter_document: null, why: "Settled elsewhere.",
    agrees: "neither", arbiter: "opus-5", readings: {},
  }]);
  assert.deepEqual(byLocator([], verdicts, IDS), {});
});

test("which sentence a pair shows does not depend on the order rows arrive in", () => {
  const a = {
    source_locator: ANTHROPIC, target_locator: OPENAI, relation: "same",
    rationale: "Read from Anthropic.", behaviour_slug: "honesty", model: "opus-5",
  };
  const b = {
    source_locator: OPENAI, target_locator: ANTHROPIC, relation: "same",
    rationale: "Read from OpenAI.", behaviour_slug: "honesty", model: "opus-5",
  };
  const one = byLocator([a, b], new Map(), IDS);
  const other = byLocator([b, a], new Map(), IDS);
  assert.equal(one[ANTHROPIC][0].comment, other[ANTHROPIC][0].comment);
});

/* A run is a pair of documents, and a summary belongs to its run's pair.
 *
 * This was implicit while the Python built one file per run: a file WAS a pair,
 * so a note could not land on the wrong comparison. Merging four runs into one
 * answer lost it, and the reader showed the note written about the Anthropic
 * constitution under a paragraph being compared with another OpenAI version. */
const ANTHROPIC_DOC = "anthropic--constitution@2026-01-20";
const OPENAI_DOC = "openai--model-spec@2026-08-18";
const OPENAI_OLD = "openai--model-spec@2025-12-18";

const DOCUMENT_OF = new Map([
  ["v-anthropic", "anthropic--constitution@2026-01-20"],
  ["v-openai-new", "openai--model-spec@2026-08-18"],
  ["v-openai-old", "openai--model-spec@2025-12-18"],
]);

test("both directions of a run collapse into one pair, sorted", () => {
  const pairs = pairsByRun([
    { run_id: "r1", source_version_id: "v-anthropic", target_version_id: "v-openai-new" },
    { run_id: "r1", source_version_id: "v-openai-new", target_version_id: "v-anthropic" },
  ], DOCUMENT_OF);
  assert.deepEqual(pairs.get("r1"),
    ["anthropic--constitution@2026-01-20", "openai--model-spec@2026-08-18"]);
  // Sorted, because the reader compares it against its own sorted pair on screen.
});

test("two runs over the same document keep their own pairs apart", () => {
  const pairs = pairsByRun([
    { run_id: "r1", source_version_id: "v-anthropic", target_version_id: "v-openai-new" },
    { run_id: "r2", source_version_id: "v-openai-old", target_version_id: "v-openai-new" },
  ], DOCUMENT_OF);
  assert.deepEqual(pairs.get("r2"),
    ["openai--model-spec@2025-12-18", "openai--model-spec@2026-08-18"]);
  assert.notDeepEqual(pairs.get("r1"), pairs.get("r2"));
});

test("a summary carries the pair it was written about", () => {
  const row = summaryRow(
    { body: "The Anthropic constitution covers this twice.", behaviour_slug: "honesty",
      model: "opus-5" },
    ["anthropic--constitution@2026-01-20", "openai--model-spec@2026-08-18"]);
  assert.equal(row.relation, "summary");
  assert.equal(row.to, undefined);          // it has nowhere to travel, and must not pretend to
  assert.deepEqual(row.about,
    ["anthropic--constitution@2026-01-20", "openai--model-spec@2026-08-18"]);
});

/* A comparison text is written about two documents and names them throughout.
 *
 * Keyed by behaviour alone, the four pairs collapsed and the newest won: every
 * behaviour served the Alibaba against OpenAI paragraph, so comparing the
 * OpenAI model spec with its own earlier version opened a text about Alibaba. */
test("a comparison is addressed by its behaviour and its two documents", () => {
  assert.equal(comparisonKey("honesty", [OPENAI_DOC, ANTHROPIC_DOC]),
               `honesty\n${ANTHROPIC_DOC}\n${OPENAI_DOC}`);
});

test("the two documents sort, so either order addresses the same text", () => {
  // The reader builds this key from the pair on screen and cannot know which
  // side each document was read from, so the order must not matter.
  assert.equal(comparisonKey("honesty", [OPENAI_DOC, ANTHROPIC_DOC]),
               comparisonKey("honesty", [ANTHROPIC_DOC, OPENAI_DOC]));
});

test("two pairs of one behaviour do not collapse onto each other", () => {
  const withAnthropic = comparisonKey("honesty", [OPENAI_DOC, ANTHROPIC_DOC]);
  const withItsOwnPast = comparisonKey("honesty", [OPENAI_DOC, OPENAI_OLD]);
  assert.notEqual(withAnthropic, withItsOwnPast);
});

test("a comparison with no documents still yields a key, not a crash", () => {
  assert.equal(comparisonKey("honesty", undefined), "honesty");
});

/* The same collapse, a third time, and the one that would have wasted the work.
 *
 * A passage in three comparisons gets three readings, one per pair. Keyed by
 * behaviour and locator alone they overwrite each other, so generating the 739
 * missing ones would have produced rows the reader then threw away, and two
 * comparisons out of three would still have shown nothing. */
test("one passage read against two documents keeps both readings", () => {
  const here = `${OPENAI_DOC} > #red_line_principles > ¶2`;
  const againstAnthropic = passageNoteKey("honesty", here, [OPENAI_DOC, ANTHROPIC_DOC]);
  const againstItsOwnPast = passageNoteKey("honesty", here, [OPENAI_DOC, OPENAI_OLD]);
  assert.notEqual(againstAnthropic, againstItsOwnPast);
});

test("a passage reading sorts its pair, like a comparison does", () => {
  const here = `${OPENAI_DOC} > #red_line_principles > ¶2`;
  assert.equal(passageNoteKey("honesty", here, [OPENAI_DOC, ANTHROPIC_DOC]),
               passageNoteKey("honesty", here, [ANTHROPIC_DOC, OPENAI_DOC]));
});

test("the behaviour still separates two readings of one passage", () => {
  const here = `${OPENAI_DOC} > #red_line_principles > ¶2`;
  assert.notEqual(passageNoteKey("honesty", here, [OPENAI_DOC, ANTHROPIC_DOC]),
                  passageNoteKey("no-sycophancy", here, [OPENAI_DOC, ANTHROPIC_DOC]));
});

test("a summary whose run has no pair carries an empty one, not undefined", () => {
  // The reader drops a summary it cannot place. An absent field and an empty
  // array must therefore behave alike, or the drop depends on which it got.
  const row = summaryRow({ body: "x", behaviour_slug: "honesty", model: null }, undefined);
  assert.deepEqual(row.about, []);
});

test("readerLinks reads the runs it is given and never asks which are current", async () => {
  const asked = [];
  const fetchImpl = async url => {
    asked.push(String(url));
    return { ok: true, status: 200, json: async () => [], text: async () => "" };
  };
  const out = await readerLinks(fetchImpl, ["11111111-1111-4111-8111-111111111111"]);
  assert.equal(asked.some(url => url.includes("aci_link_runs")), false);
  assert.deepEqual(out.runs, ["11111111-1111-4111-8111-111111111111"]);
});
