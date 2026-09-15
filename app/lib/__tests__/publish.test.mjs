/**
 * The params a "publish" job is started with. This is the one place a
 * reviewer needs to check that the operator's address cannot land in
 * published_by.
 * Run: node --test app/lib/__tests__/publish.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { publishJobParams } from "../publish.mjs";

const BASE = { behaviours: ["helpfulness"], documents: ["openai--model-spec@2026-08-18"],
               rubric: "v5", notes: "first cut" };

test("a build with no credit is credited to Polaris Collective, not an e-mail", () => {
  const params = publishJobParams({ ...BASE, credit: "" });
  assert.equal(params.created_by, "Polaris Collective");
});

test("an explicit credit reaches created_by, which becomes published_by", () => {
  const params = publishJobParams({ ...BASE, credit: "Ada Lovelace" });
  assert.equal(params.created_by, "Ada Lovelace");
});

test("the e-mail never reaches these params: the function does not take one", () => {
  // publishJobParams has no e-mail argument at all, so there is no path from a
  // signed-in address into created_by/published_by -- whatever the caller
  // passes for `credit` is the whole of what this function can write.
  const params = publishJobParams({ ...BASE, credit: "operator@example.com" });
  assert.equal(params.created_by, "operator@example.com",
              "resolveCredit only fills in the default; creditProblem is what refuses an address");
  assert.equal(Object.keys(params).includes("email"), false);
});

test("the other fields travel unchanged", () => {
  const params = publishJobParams({ ...BASE, credit: "Ada Lovelace" });
  assert.deepEqual(params, {
    behaviours: ["helpfulness"], documents: ["openai--model-spec@2026-08-18"],
    rubric: "v5", notes: "first cut", created_by: "Ada Lovelace",
  });
});
