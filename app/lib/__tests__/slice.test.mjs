/**
 * Cutting a frozen column down to what an address names. Pure: no fetch here.
 * Run: npm run test:routes
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sliceColumn } from "../slice.mjs";

const A = "anthropic--constitution@2026-01-20";
const B = "openai--model-spec@2026-08-18";
const all = { documents: null, behaviours: null };

test("a null set means everything, which is what no parameter asks for", () => {
  const payload = { behaviours: [{ slug: "helpfulness" }, { slug: "no-sycophancy" }] };
  assert.deepEqual(sliceColumn("payload", payload, all), payload);
});

test("a null set means everything for links too, and links carrying no notes stays that way", () => {
  const links = { byLocator: { [`${A} > s > ¶1`]: [{ behaviours: ["helpfulness"] }] },
                  comparisons: { [`helpfulness\n${A}\n${B}`]: { text: "yes" } } };
  assert.deepEqual(sliceColumn("links", links, all), links);
});

test("the payload keeps every behaviour and withholds those not named", () => {
  const payload = { provenance: { runDate: "2026-09-18" },
                    behaviours: [{ slug: "helpfulness", coverage: { [A]: { depth: { mean: 1 }, passages: [] } } },
                                 { slug: "no-sycophancy", coverage: { [A]: { depth: { mean: 2 }, passages: [] } } }] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(out.behaviours.map(b => b.slug), ["helpfulness", "no-sycophancy"]);
  assert.deepEqual(out.provenance, { runDate: "2026-09-18" });
});

test("the documents column keeps only the documents named", () => {
  const documents = { documents: [{ id: A, markdown: "a" }, { id: B, markdown: "b" }] };
  const out = sliceColumn("documents", documents, { documents: new Set([A]), behaviours: null });
  assert.deepEqual(out.documents, [{ id: A, markdown: "a" }]);
});

test("byLocator keeps the locators of the documents shown", () => {
  const links = { byLocator: { [`${A} > s > ¶1`]: [{ behaviours: ["helpfulness"] }],
                               [`${B} > s > ¶1`]: [{ behaviours: ["helpfulness"] }] },
                  comparisons: {}, notes: { passage: {}, depth: {}, standing: {} } };
  const out = sliceColumn("links", links, { documents: new Set([A]), behaviours: null });
  assert.deepEqual(Object.keys(out.byLocator), [`${A} > s > ¶1`]);
});

test("a row belonging to several behaviours survives if any one is asked for", () => {
  const links = { byLocator: { [`${A} > s > ¶1`]: [
                    { id: 1, behaviours: ["helpfulness", "no-sycophancy"] },
                    { id: 2, behaviours: ["user-autonomy"] }] },
                  comparisons: {}, notes: { passage: {}, depth: {}, standing: {} } };
  const out = sliceColumn("links", links, { documents: null, behaviours: new Set(["no-sycophancy"]) });
  assert.deepEqual(out.byLocator[`${A} > s > ¶1`], [{ id: 1, behaviours: ["helpfulness", "no-sycophancy"] }]);
});

test("a locator left with no row at all is dropped rather than left empty", () => {
  const links = { byLocator: { [`${A} > s > ¶1`]: [{ behaviours: ["user-autonomy"] }] },
                  comparisons: {}, notes: { passage: {}, depth: {}, standing: {} } };
  const out = sliceColumn("links", links, { documents: null, behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(out.byLocator, {});
});

test("a comparison is kept when its behaviour is asked for and both its documents are shown", () => {
  const key = `helpfulness\n${A}\n${B}`;
  const other = `helpfulness\n${A}\nalibaba--model-spec@2026-04-00`;
  const links = { byLocator: {}, comparisons: { [key]: { text: "yes" }, [other]: { text: "no" } },
                  notes: { passage: {}, depth: {}, standing: {} } };
  const out = sliceColumn("links", links,
                          { documents: new Set([A, B]), behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(Object.keys(out.comparisons), [key]);
});

test("the depth and standing paragraphs travel whole, being 87 KB in all", () => {
  const links = { byLocator: {}, comparisons: {},
                  notes: { passage: {}, depth: { a: 1 }, standing: { b: 2 } } };
  const out = sliceColumn("links", links, { documents: new Set([A]), behaviours: new Set(["x"]) });
  assert.deepEqual(out.notes.depth, { a: 1 });
  assert.deepEqual(out.notes.standing, { b: 2 });
});

/* Absent and empty are different answers, and the whole reader rests on the
 * difference: an address that names no behaviour has asked for none, where an
 * address that carries no such parameter has asked for all of them. A reader
 * that unticks every behaviour withholds all paragraphs but keeps every behaviour
 * marked as withheld. */
test("a set that is present and empty withholds all paragraphs, which is not what a null set means", () => {
  const none = { documents: null, behaviours: new Set() };
  const payload = { behaviours: [{ slug: "helpfulness", coverage: { [A]: { depth: { mean: 1 }, passages: [] } } },
                                 { slug: "no-sycophancy", coverage: { [A]: { depth: { mean: 2 }, passages: [] } } }] };
  const out = sliceColumn("payload", payload, none);
  assert.equal(out.behaviours.length, 2, "both behaviours are listed");
  assert.equal(out.behaviours[0].coverage[A].passagesWithheld, true, "with paragraphs withheld");
  assert.deepEqual(sliceColumn("payload", payload, all), payload);

  const links = { byLocator: { [`${A} > s > ¶1`]: [{ behaviours: ["helpfulness"] }] },
                  comparisons: { [`helpfulness\n${A}\n${B}`]: { text: "yes" } },
                  notes: { passage: {}, depth: {}, standing: {} } };
  const out_links = sliceColumn("links", links, none);
  assert.deepEqual(out_links.byLocator, {});
  assert.deepEqual(out_links.comparisons, {});
});

test("the payload carries an index of which behaviours cite which locator", () => {
  const payload = { behaviours: [
    { id: 1, slug: "helpfulness", name: "Helpfulness",
      coverage: { [A]: { passages: [{ locator: `${A} > s > ¶1` }] } } },
    { id: 2, slug: "no-sycophancy", name: "No sycophancy",
      coverage: { [A]: { passages: [{ locator: `${A} > s > ¶1` }, { locator: `${A} > s > ¶2` }] } } },
  ] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(out.behaviours.map(b => b.slug), ["helpfulness", "no-sycophancy"]);
  assert.deepEqual(out.citedBy, { [`${A} > s > ¶1`]: [1, 2], [`${A} > s > ¶2`]: [2] });
});

test("an unsliced payload carries no index, having no need of one", () => {
  const payload = { behaviours: [{ id: 1, slug: "helpfulness", name: "Helpfulness", coverage: {} }] };
  assert.equal(sliceColumn("payload", payload, all).citedBy, undefined);
});

/* The payload's behaviours carry `id`, not the `numeric_id` the registry has.
 * A fixture with the former and none of the latter fails this the moment
 * citationIndex reads the wrong field: the array would hold undefined, not
 * a number, and this checks that directly rather than through a deepEqual
 * that a coincidental match could pass. */
test("citationIndex reads the id the payload carries, not a field only the registry has", () => {
  const payload = { behaviours: [
    { id: 7, slug: "helpfulness", name: "Helpfulness",
      coverage: { [A]: { passages: [{ locator: `${A} > s > ¶1` }] } } },
  ] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set(["helpfulness"]) });
  const ids = out.citedBy[`${A} > s > ¶1`];
  assert.equal(ids.length, 1);
  assert.equal(typeof ids[0], "number");
  assert.notEqual(ids[0], undefined);
  assert.notEqual(ids[0], null);
  assert.equal(ids[0], 7);
});

/* The column this is handed is held in a module level map and served to every
 * later request, so a slice that wrote into its input would corrupt what the
 * next caller reads. Nothing in the signature says so, which is exactly why it
 * is pinned here. */
test("the slicer never writes into the column it was given", () => {
  const links = { documents: [A, B], runs: ["r1"],
                  byLocator: { [`${A} > s > ¶1`]: [{ behaviours: ["helpfulness"] }],
                               [`${B} > s > ¶1`]: [{ behaviours: ["user-autonomy"] }] },
                  comparisons: { [`helpfulness\n${A}\n${B}`]: { text: "yes" } },
                  notes: { passage: { [`helpfulness\n${A} > s > ¶1\n${A}\n${B}`]: { text: "n" } },
                           depth: { a: 1 }, standing: { b: 2 } } };
  const before = JSON.stringify(links);
  /* The filter has to drop something for this to mean anything. A slice that
   * keeps everything leaves an in-place write indistinguishable from a copy,
   * and the test would pass while proving nothing: asking for one document and
   * one behaviour here removes B's locator, so writing into the caller's object
   * shows up at once. */
  const out = sliceColumn("links", links,
                          { documents: new Set([A]), behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(Object.keys(out.byLocator), [`${A} > s > ¶1`], "the slice really narrowed");
  assert.equal(JSON.stringify(links), before, "the held column was modified in place");
});

/* Three states, and the whole design rests on telling them apart. A behaviour
 * nobody asked for keeps its heading and its figures and loses its paragraphs,
 * which is not the same as a document it does not cover (no entry at all) and
 * not the same as a document it covers with nothing (an empty array). */
test("a behaviour nobody asked for keeps its coverage and loses its paragraphs", () => {
  const payload = { behaviours: [
    { id: 1, slug: "helpfulness", name: "Helpfulness", definition: "d1",
      coverage: { [A]: { depth: { mean: 2.7 }, substitutions: [{ seat: "fable" }],
                         passages: [{ locator: `${A} > s > ¶1` }] } } },
    { id: 2, slug: "no-sycophancy", name: "No sycophancy", definition: "d2",
      coverage: { [A]: { depth: { mean: 1.0 }, passages: [{ locator: `${A} > s > ¶2` }] } } },
  ] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set(["helpfulness"]) });

  assert.deepEqual(out.behaviours.map(b => b.slug), ["helpfulness", "no-sycophancy"],
                   "every behaviour is still listed");

  const asked = out.behaviours[0].coverage[A];
  assert.equal(asked.passages.length, 1, "the behaviour asked for keeps its paragraphs");
  assert.equal(asked.passagesWithheld, undefined, "and is not marked withheld");

  const withheld = out.behaviours[1].coverage[A];
  assert.equal(withheld.passagesWithheld, true, "the others are marked withheld");
  assert.equal("passages" in withheld, false, "and carry no passages key at all");
  assert.deepEqual(withheld.depth, { mean: 1.0 }, "the figure survives, which is the point");
});

test("a withheld cell keeps its recorded substitutions, which are a claim the index makes", () => {
  const payload = { behaviours: [
    { id: 1, slug: "helpfulness", name: "Helpfulness",
      coverage: { [A]: { depth: { mean: 2 }, substitutions: [{ seat: "fable", substitute: "opus" }],
                         passages: [{ locator: `${A} > s > ¶1` }] } } },
  ] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set() });
  assert.deepEqual(out.behaviours[0].coverage[A].substitutions, [{ seat: "fable", substitute: "opus" }]);
});

test("an empty behaviour set withholds every paragraph and still lists everyone", () => {
  const payload = { behaviours: [
    { id: 1, slug: "helpfulness", name: "Helpfulness",
      coverage: { [A]: { depth: { mean: 2 }, passages: [{ locator: `${A} > s > ¶1` }] } } },
  ] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set() });
  assert.equal(out.behaviours.length, 1);
  assert.equal(out.behaviours[0].coverage[A].passagesWithheld, true);
});

/* citationIndex is what lets a ?passage= link find a behaviour the address never
 * named. It has to read the paragraphs of every behaviour, so it must run before
 * any of them are removed. Built afterwards it would index only what was asked
 * for, which is exactly the case it exists to cover. */
test("the citation index still names behaviours whose paragraphs were withheld", () => {
  const payload = { behaviours: [
    { id: 1, slug: "helpfulness", name: "Helpfulness",
      coverage: { [A]: { passages: [{ locator: `${A} > s > ¶1` }] } } },
    { id: 2, slug: "no-sycophancy", name: "No sycophancy",
      coverage: { [A]: { passages: [{ locator: `${A} > s > ¶1` }, { locator: `${A} > s > ¶2` }] } } },
  ] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(out.citedBy, { [`${A} > s > ¶1`]: [1, 2], [`${A} > s > ¶2`]: [2] });
});
