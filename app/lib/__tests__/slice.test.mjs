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
