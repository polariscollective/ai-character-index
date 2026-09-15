/**
 * The name a public credit is written under, never the operator's address.
 * Run: node --test app/lib/__tests__/credit.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CREDIT, creditProblem, resolveCredit } from "../credit.mjs";

test("an empty credit becomes Polaris Collective", () => {
  assert.equal(resolveCredit(""), "Polaris Collective");
  assert.equal(DEFAULT_CREDIT, "Polaris Collective");
});

test("an explicit credit is kept", () => {
  assert.equal(resolveCredit("Ada Lovelace"), "Ada Lovelace");
  assert.equal(resolveCredit("Ada Lovelace; Charles Babbage"), "Ada Lovelace; Charles Babbage");
});

test("an empty credit is not a problem: it is left to resolveCredit", () => {
  assert.equal(creditProblem(""), null);
});

test("a name is not a problem", () => {
  assert.equal(creditProblem("Ada Lovelace"), null);
  assert.equal(creditProblem("Polaris Collective"), null);
});

test("a credit that looks like an e-mail address is refused, saying what and how to fix it", () => {
  const problem = creditProblem("operator@example.com");
  assert.match(problem, /e-mail address/);
  assert.match(problem, /Polaris Collective/, "the message says what to write instead");
});

test("resolveCredit never turns an address into a credit by itself", () => {
  // creditProblem is what refuses an address; resolveCredit only fills in the
  // default for an empty field, so an address reaching it is a bug upstream,
  // not something this function should paper over.
  assert.equal(resolveCredit("operator@example.com"), "operator@example.com");
});
