/**
 * What a document is called, and how a form lists them.
 * Run: node --test app/lib/__tests__/documents.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { documentChoices, labelTaken, nameProblem, newVersionRow, specificationId,
         versionProblem } from "../documents.mjs";

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

test("every version is its own document in a form, and only a row named by its lab is one", () => {
  const specs = [
    // The expand migration copied this row to anthropic--constitution and left it
    // in place until cleanup. Offered, it would list the same document twice, and
    // a run could be composed on an id outside the grammar.
    { id: "constitution", lab_id: "anthropic", title: "Claude's Constitution", versions: [
      { id: "v-legacy", version: "2026-01-21" }] },
    { id: "openai--model-spec", lab_id: "openai", title: "OpenAI Model Spec", versions: [
      { id: "v-new", version: "2026-08-18" }, { id: "v-old", version: "2025-12-18" }] },
  ];
  const choices = documentChoices(specs);
  assert.ok(!choices.some(choice => choice.value === "v-legacy"),
            "a row whose id is not <lab>--<name> is not offered");
  assert.deepEqual(choices, [
    { value: "v-new", label: "OpenAI Model Spec 2026-08-18" },
    { value: "v-old", label: "OpenAI Model Spec 2025-12-18" },
  ]);
});

/* This is the row the registration route writes. It used to carry the
 * operator's e-mail unconditionally: these are the tests for the fix. */
const BASE_VERSION = {
  specId: "openai--model-spec", version: "2026-08-18",
  markdown: "# Model Spec", digest: "abc123", sourceUrl: "https://example.com/spec",
};

test("a document registered with no credit is credited to Polaris Collective, not an e-mail", () => {
  const row = newVersionRow({ ...BASE_VERSION, credit: "" });
  assert.equal(row.added_by, "Polaris Collective");
});

test("a document registered with a credit keeps it", () => {
  const row = newVersionRow({ ...BASE_VERSION, credit: "Ada Lovelace" });
  assert.equal(row.added_by, "Ada Lovelace");
});

test("a version's row carries the other fields untouched", () => {
  const row = newVersionRow({ ...BASE_VERSION, credit: "Ada Lovelace" });
  assert.deepEqual(row, {
    spec_id: "openai--model-spec", version: "2026-08-18", markdown: "# Model Spec",
    content_sha256: "abc123", source_url: "https://example.com/spec",
    added_by: "Ada Lovelace",
  });
});
