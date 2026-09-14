/**
 * What a document is called, and how a form lists them.
 * Run: node --test app/lib/__tests__/documents.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { documentChoices, labelTaken, nameProblem, specificationId, versionProblem }
  from "../documents.mjs";

test("a label a document already carries is refused, since the label is in its id", () => {
  const versions = [{ spec_id: "openai--model-spec", version: "2026-08-18" }];
  assert.match(labelTaken(versions, "openai--model-spec", "2026-08-18"), /already registered/);
  assert.equal(labelTaken(versions, "openai--model-spec", "2026-09-01"), null);
  assert.equal(labelTaken(versions, "alibaba--model-spec", "2026-08-18"), null);
});

test("a document dated only to the month is a label like any other", () => {
  assert.equal(versionProblem("2026-04-00"), null);
});

test("a specification is named by its lab, a double hyphen, and its name", () => {
  assert.equal(specificationId("openai", "model-spec"), "openai--model-spec");
});

test("a document name is lowercase words joined by single hyphens", () => {
  assert.equal(nameProblem("model-spec"), null);
  assert.match(nameProblem("model--spec"), /single hyphens/);
  assert.match(nameProblem("Model Spec"), /single hyphens/);
  assert.match(nameProblem("spec-v2"), /single hyphens/, "the citation grammar has no digits");
  assert.match(nameProblem(""), /required/);
});

test("a version is the release date", () => {
  assert.equal(versionProblem("2026-08-18"), null);
  assert.match(versionProblem("v3"), /2026-08-18/);
  assert.match(versionProblem(""), /required/);
});

test("every version is its own document in a form", () => {
  const specs = [{ title: "OpenAI Model Spec", versions: [
    { id: "v-new", version: "2026-08-18" }, { id: "v-old", version: "2025-12-18" }] }];
  assert.deepEqual(documentChoices(specs), [
    { value: "v-new", label: "OpenAI Model Spec 2026-08-18" },
    { value: "v-old", label: "OpenAI Model Spec 2025-12-18" },
  ]);
});
