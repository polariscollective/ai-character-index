/** Run: node --test app/lib/__tests__/locator-safe.test.mjs */
import assert from "node:assert/strict";
import { test } from "node:test";
import { locatorSafe, problems, slugProblem } from "../locator-safe.mjs";

test("the names the index already carries are accepted", () => {
  for (const name of ["constitution", "model-spec", "2026-01-20", "2025-12-18",
                      "v3", "2026.1", "draft 4"]) {
    assert.equal(locatorSafe(name, "version"), null, `${name} was refused`);
  }
});

test("the two characters the grammar splits on are refused", () => {
  for (const bad of ["spec@2026", "a > b", "a>b", "a›b"]) {
    assert.match(locatorSafe(bad, "id") || "", /must not contain/, `${bad} got through`);
  }
});

test("a date format is not required, because it was never the constraint", () => {
  assert.equal(locatorSafe("winter-2026", "version"), null);
});

test("edge whitespace is refused, because locators are split rather than trimmed", () => {
  assert.match(locatorSafe(" constitution", "id"), /whitespace/);
  assert.match(locatorSafe("constitution ", "id"), /whitespace/);
});

test("nothing is not a name", () => {
  for (const value of ["", null, undefined, 7]) {
    assert.match(locatorSafe(value, "version") || "", /required/);
  }
});

test("a slug is lowercase words joined by single hyphens", () => {
  assert.equal(slugProblem("user-autonomy"), null);
  assert.equal(slugProblem("helpfulness"), null);
  for (const bad of ["User-Autonomy", "user_autonomy", "user--autonomy",
                     "-user", "user-", "", "user autonomy"]) {
    assert.match(slugProblem(bad) || "", /slug/, `${bad} got through`);
  }
});

test("problems reports every field at once, not the first", () => {
  const found = problems([
    [slugProblem, "Bad Slug", "slug"],
    [locatorSafe, "spec@x", "id"],
    [locatorSafe, "fine", "version"],
  ]);
  assert.equal(found.length, 2);
});
