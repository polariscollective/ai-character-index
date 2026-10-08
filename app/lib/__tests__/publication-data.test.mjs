/**
 * Where the boards are read from: the publication, or the files a working
 * branch carries. site/publication-data.js touches the page only in its loaders,
 * so its rule is tested here as a pure function.
 *
 * Run: node --test app/lib/__tests__/publication-data.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { branchPreview } from "../../../site/publication-data.js";

test("a preview of a working branch reads the branch's files", () => {
  assert.equal(branchPreview({ env: "preview", branch: "feat/overview-letter-grades" }), true);
});

test("develop, main and production never do", () => {
  assert.equal(branchPreview({ env: "preview", branch: "develop" }), false);
  assert.equal(branchPreview({ env: "preview", branch: "main" }), false);
  assert.equal(branchPreview({ env: "production", branch: "feat/anything" }), false);
  assert.equal(branchPreview({ env: "production", branch: "main" }), false);
});

test("a copy that does not know where it was built does not either", () => {
  assert.equal(branchPreview({ env: null, branch: null }), false);
  assert.equal(branchPreview({ env: "preview", branch: null }), false);
  assert.equal(branchPreview(undefined), false);
});
