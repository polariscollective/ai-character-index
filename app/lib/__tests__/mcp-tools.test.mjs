/**
 * The MCP answers, against the reader fixtures. Nothing here touches a network:
 * a snapshot is a plain object, which is the point of the tools being pure.
 *
 * Run: node --test app/lib/__tests__/mcp-tools.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { listModelSpecs, listBehaviours, retrievePassages, ToolError }
  from "../mcp-tools.mjs";

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

const BOTH = ["defined-behaviour", "undefined-behaviour"];

test("a cell comes back with its passages quoted and located", () => {
  const answer = retrievePassages(snapshot(), {
    behaviours: ["defined-behaviour"], model_spec_ids: ["corpus-labs"],
  });
  assert.equal(answer.results.length, 1);
  const [cell] = answer.results;
  assert.equal(cell.behaviour, "defined-behaviour");
  assert.equal(cell.model_spec_id, "corpus-labs");
  assert.equal(cell.passages.length, 1, "core is the default strength");

  const [passage] = cell.passages;
  assert.deepEqual(Object.keys(passage).sort(),
                   ["judges", "locator", "quote", "strength"]);
  assert.equal(passage.strength, "defining");
  assert.deepEqual(passage.judges, { a: "core" });
  assert.match(passage.locator, /^corpus@2026-01-01/);
  assert.ok(passage.quote.length > 0);
});

test("strength means that band and stronger", () => {
  const call = strength => retrievePassages(
    snapshot(), { behaviours: BOTH, strength });
  const counted = answer => answer.results.reduce(
    (total, cell) => total + cell.passages.length, 0);

  assert.equal(counted(call("defining")), 5);
  assert.equal(counted(call("core")), 5, "the fixture has no core-only passage");
  assert.equal(counted(call("related")), 7);
});

test("the default strength is core", () => {
  const withDefault = retrievePassages(snapshot(), { behaviours: BOTH });
  const explicit = retrievePassages(snapshot(), { behaviours: BOTH, strength: "core" });
  assert.deepEqual(withDefault.results, explicit.results);
});

test("cells follow the order of the arguments, passages strongest first", () => {
  const answer = retrievePassages(snapshot(), {
    behaviours: ["undefined-behaviour", "defined-behaviour"],
    model_spec_ids: ["second-labs", "corpus-labs"],
    strength: "related",
  });
  assert.deepEqual(
    answer.results.map(cell => `${cell.behaviour}/${cell.model_spec_id}`),
    ["undefined-behaviour/second-labs", "undefined-behaviour/corpus-labs",
     "defined-behaviour/second-labs", "defined-behaviour/corpus-labs"]);

  const corpus = answer.results.at(-1);
  assert.deepEqual(corpus.passages.map(passage => passage.strength),
                   ["defining", "related"]);
});

test("omitting model_spec_ids reads every specification", () => {
  const answer = retrievePassages(snapshot(), { behaviours: ["defined-behaviour"] });
  assert.deepEqual(answer.results.map(cell => cell.model_spec_id),
                   ["corpus-labs", "second-labs"]);
  assert.deepEqual(answer.model_specs_read.map(spec => spec.id),
                   ["corpus-labs", "second-labs"]);
});

test("an empty cell says so rather than disappearing", () => {
  const answer = retrievePassages(snapshot(), {
    behaviours: ["undefined-behaviour"], model_spec_ids: ["second-labs"],
  });
  const [cell] = answer.results;
  assert.deepEqual(cell.passages, []);
  assert.match(cell.note, /Absence of coverage is an index finding/);
});

test("a request spanning two specifications carries the comparability note", () => {
  const answer = retrievePassages(snapshot(), { behaviours: ["defined-behaviour"] });
  assert.match(answer.comparability, /not comparable/);
});

test("a request naming one specification does not", () => {
  const answer = retrievePassages(snapshot(), {
    behaviours: ["defined-behaviour"], model_spec_ids: ["corpus-labs"],
  });
  assert.equal(answer.comparability, undefined);
});

test("the panel is reported once, from the payload's own provenance", () => {
  const answer = retrievePassages(snapshot(), { behaviours: ["defined-behaviour"] });
  assert.deepEqual(answer.panel, {
    method: "fixture", rubric: "v5", config: "fixture",
    judges: ["a", "b", "c"], run_date: "2026-01-01",
  });
});

test("an unknown behaviour is an error naming what there is", () => {
  assert.throws(
    () => retrievePassages(snapshot(), { behaviours: ["helpfulnes"] }),
    error => error instanceof ToolError
      && /no such behaviour: helpfulnes/.test(error.message)
      && /defined-behaviour/.test(error.message));
});

test("an unknown specification is an error too", () => {
  assert.throws(
    () => retrievePassages(snapshot(), {
      behaviours: ["defined-behaviour"], model_spec_ids: ["anthropic"] }),
    error => error instanceof ToolError && /no such model spec: anthropic/.test(error.message));
});

test("no behaviours at all is refused, because nothing else bounds the answer", () => {
  assert.throws(() => retrievePassages(snapshot(), { behaviours: [] }),
                error => error instanceof ToolError);
  assert.throws(() => retrievePassages(snapshot(), {}),
                error => error instanceof ToolError);
});

test("an unknown strength is refused", () => {
  assert.throws(
    () => retrievePassages(snapshot(), { behaviours: BOTH, strength: "strong" }),
    error => error instanceof ToolError && /defining, core, related/.test(error.message));
});
