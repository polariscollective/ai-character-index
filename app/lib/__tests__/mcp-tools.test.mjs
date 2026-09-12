/**
 * The MCP answers, against the reader fixtures. Nothing here touches a network:
 * a snapshot is a plain object, which is the point of the tools being pure.
 *
 * Run: node --test app/lib/__tests__/mcp-tools.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { listModelSpecs, listBehaviours, ToolError } from "../mcp-tools.mjs";

const read = async name => JSON.parse(await readFile(
  new URL(`../../../tests/fixtures/reader/${name}`, import.meta.url), "utf8"));

const payload = await read("behaviours.json");
const documents = await read("documents.json");

const NOTES = {
  "defined-behaviour": {
    name: "Defined behaviour", group: "Behaviours under test", set: "reader-test",
    query: "The document should say what it means.",
    described: null,
    boundary: "The construct is whether the text states its own meaning.",
    source: "tests/fixtures (synthetic)", defined: true, judged: true,
  },
  "undefined-behaviour": {
    name: "Undefined behaviour", group: "Behaviours under test", set: "reader-test",
    query: null, described: "Tracked, and defined nowhere.",
    boundary: null, source: null, defined: false, judged: true,
  },
};

const snapshot = () => ({
  publication: { id: "3114dd65-c6f2-5cb3-bf98-af5b314381c3",
                 published_at: "2026-09-10T14:05:25.472064+00:00" },
  payload, documents, notes: NOTES,
});

test("list_model_specs names every document with its counts", () => {
  const answer = listModelSpecs(snapshot());
  assert.equal(answer.publication.id, "3114dd65-c6f2-5cb3-bf98-af5b314381c3");
  assert.deepEqual(answer.model_specs.map(spec => spec.id), ["corpus-labs", "second-labs"]);

  const [corpus] = answer.model_specs;
  assert.equal(corpus.lab, "Corpus Labs");
  assert.equal(corpus.title, "Parser corpus");
  assert.equal(corpus.version, "2026-01-01");
  assert.equal(corpus.source_url, "https://example.invalid/corpus");
  assert.equal(corpus.behaviours_judged, 2);
  assert.equal(corpus.passages, 5, "every passage, not only the banded ones");
});

test("list_model_specs never carries the specification text", () => {
  const answer = listModelSpecs(snapshot());
  const serialised = JSON.stringify(answer);
  assert.ok(!serialised.includes("markdown"), "the documents run to hundreds of kilobytes");
  assert.ok(serialised.length < 2000, `the answer is ${serialised.length} bytes`);
});

test("list_behaviours reports the brief the panel was given", () => {
  const answer = listBehaviours(snapshot());
  const [defined] = answer.behaviours;
  assert.equal(defined.slug, "defined-behaviour");
  assert.equal(defined.name, "Defined behaviour");
  assert.equal(defined.group, "Behaviours under test");
  assert.equal(defined.definition, "The document should say what it means.");
  assert.equal(defined.boundary, "The construct is whether the text states its own meaning.");
  assert.equal(defined.source, "tests/fixtures (synthetic)");
  assert.equal(defined.note, undefined, "a behaviour with a brief has nothing to explain");
});

test("a behaviour judged without a brief says so instead of reading as undefined", () => {
  const answer = listBehaviours(snapshot());
  const undefinedBehaviour = answer.behaviours.find(
    behaviour => behaviour.slug === "undefined-behaviour");
  assert.equal(undefinedBehaviour.definition, null);
  assert.match(undefinedBehaviour.note, /Judged without a recorded brief/);
});

test("list_behaviours summarises coverage per specification", () => {
  const answer = listBehaviours(snapshot());
  const [defined] = answer.behaviours;
  assert.deepEqual(defined.coverage, {
    "corpus-labs": { passages: 2, strongest: "defining" },
    "second-labs": { passages: 1, strongest: "defining" },
  });
});

test("a behaviour the registry does not describe still lists", () => {
  const thin = snapshot();
  thin.notes = {};
  const answer = listBehaviours(thin);
  assert.equal(answer.behaviours.length, 2);
  assert.equal(answer.behaviours[0].definition, null);
});

test("ToolError is an Error, so the route can tell a caller's mistake from a fault", () => {
  assert.ok(new ToolError("bad slug") instanceof Error);
});
