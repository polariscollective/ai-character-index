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

test("the payload keeps only the behaviours named, and its other keys", () => {
  const payload = { provenance: { runDate: "2026-09-18" },
                    behaviours: [{ slug: "helpfulness" }, { slug: "no-sycophancy" }] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(out.behaviours, [{ slug: "helpfulness" }]);
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
 * that unticks every behaviour writes the empty form, and must not come back
 * with one ticked. */
test("a set that is present and empty keeps nothing, which is not what a null set means", () => {
  const none = { documents: null, behaviours: new Set() };
  const payload = { behaviours: [{ slug: "helpfulness" }, { slug: "no-sycophancy" }] };
  assert.deepEqual(sliceColumn("payload", payload, none).behaviours, []);
  assert.deepEqual(sliceColumn("payload", payload, all), payload);

  const links = { byLocator: { [`${A} > s > ¶1`]: [{ behaviours: ["helpfulness"] }] },
                  comparisons: { [`helpfulness\n${A}\n${B}`]: { text: "yes" } },
                  notes: { passage: {}, depth: {}, standing: {} } };
  const out = sliceColumn("links", links, none);
  assert.deepEqual(out.byLocator, {});
  assert.deepEqual(out.comparisons, {});
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
