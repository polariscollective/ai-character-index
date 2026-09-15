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
    name: "Defined behaviour", group: "Behaviours under test",
    query: "The document should say what it means.",
    described: null,
    boundary: "The construct is whether the text states its own meaning.",
    source: "tests/fixtures (synthetic)", defined: true, judged: true,
  },
  "undefined-behaviour": {
    name: "Undefined behaviour", group: "Behaviours under test",
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
  assert.deepEqual(answer.model_specs.map(spec => spec.id), ["acme--corpus@2026-01-01", "acme--second@2026-02-01"]);

  const [corpus] = answer.model_specs;
  assert.equal(corpus.lab, "Acme");
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

test("list_behaviours summarises coverage per specification, depth included", () => {
  const answer = listBehaviours(snapshot());
  const [defined] = answer.behaviours;
  assert.deepEqual(defined.coverage["acme--corpus@2026-01-01"].passages, 2);
  assert.deepEqual(defined.coverage["acme--corpus@2026-01-01"].strongest, "defining");
  assert.equal(defined.coverage["acme--corpus@2026-01-01"].depth.mean, 2.7);
  assert.equal(defined.coverage["acme--second@2026-02-01"].depth.mean, 1.0);
});

test("a cell no depth was given for says null rather than zero", () => {
  const answer = listBehaviours(snapshot());
  const undefinedBehaviour = answer.behaviours.find(b => b.slug === "undefined-behaviour");
  assert.equal(undefinedBehaviour.coverage["acme--second@2026-02-01"].depth, null);
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
    behaviours: ["defined-behaviour"], model_spec_ids: ["acme--corpus@2026-01-01"],
  });
  assert.equal(answer.results.length, 1);
  const [cell] = answer.results;
  assert.equal(cell.behaviour, "defined-behaviour");
  assert.equal(cell.model_spec_id, "acme--corpus@2026-01-01");
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
    model_spec_ids: ["acme--second@2026-02-01", "acme--corpus@2026-01-01"],
    strength: "related",
  });
  assert.deepEqual(
    answer.results.map(cell => `${cell.behaviour}/${cell.model_spec_id}`),
    ["undefined-behaviour/acme--second@2026-02-01", "undefined-behaviour/acme--corpus@2026-01-01",
     "defined-behaviour/acme--second@2026-02-01", "defined-behaviour/acme--corpus@2026-01-01"]);

  const corpus = answer.results.at(-1);
  assert.deepEqual(corpus.passages.map(passage => passage.strength),
                   ["defining", "related"]);
});

test("omitting model_spec_ids reads every specification", () => {
  const answer = retrievePassages(snapshot(), { behaviours: ["defined-behaviour"] });
  assert.deepEqual(answer.results.map(cell => cell.model_spec_id),
                   ["acme--corpus@2026-01-01", "acme--second@2026-02-01"]);
  assert.deepEqual(answer.model_specs_read.map(spec => spec.id),
                   ["acme--corpus@2026-01-01", "acme--second@2026-02-01"]);
});

test("an empty cell says so rather than disappearing", () => {
  const answer = retrievePassages(snapshot(), {
    behaviours: ["undefined-behaviour"], model_spec_ids: ["acme--second@2026-02-01"],
  });
  const [cell] = answer.results;
  assert.deepEqual(cell.passages, []);
  assert.match(cell.note, /Absence of coverage is an index finding/);
});

test("a retrieved cell carries its depth", () => {
  const answer = retrievePassages(snapshot(), {
    behaviours: ["defined-behaviour"], model_spec_ids: ["acme--corpus@2026-01-01"],
  });
  assert.equal(answer.results[0].depth.mean, 2.7);
  assert.equal(answer.results[0].depth.judges.c.depth, 2);
});

/* One cell of the fixture was judged with a substitute in a seat: `d` in place of
 * `c`, on the second document, which the database accepts only when a
 * substitution is recorded. Every other cell was judged by the panel as configured. */
const SUBSTITUTED = "acme--second@2026-02-01";
const SWAP = [{ seat: "c", substitute: "d",
                reason: "c returned no output for this document on every attempt." }];

test("a listed cell judged with a substitute says which seat, by whom, and why", () => {
  const [defined] = listBehaviours(snapshot()).behaviours;
  assert.deepEqual(defined.coverage[SUBSTITUTED].substitutions, SWAP);
  assert.deepEqual(Object.keys(defined.coverage[SUBSTITUTED].depth.judges), ["a", "b", "d"]);
  assert.ok(!("substitutions" in defined.coverage["acme--corpus@2026-01-01"]),
            "a cell judged by the panel as configured carries no key at all");
});

test("a retrieved cell carries its substitutions beside its depth", () => {
  const answer = retrievePassages(snapshot(), { behaviours: ["defined-behaviour"] });
  const [corpus, second] = answer.results;
  assert.equal(second.model_spec_id, SUBSTITUTED);
  assert.deepEqual(second.substitutions, SWAP);
  assert.ok(!("substitutions" in corpus));
});

test("a substitution carries its seat, substitute and reason, and an empty list is none", () => {
  const odd = snapshot();
  odd.payload = structuredClone(payload);
  const [defined] = odd.payload.behaviours;
  defined.coverage[SUBSTITUTED].substitutions[0].added_by = "someone@example.invalid";
  defined.coverage["acme--corpus@2026-01-01"].substitutions = [];
  const listed = listBehaviours(odd).behaviours[0].coverage;
  assert.deepEqual(listed[SUBSTITUTED].substitutions, SWAP);
  assert.ok(!("substitutions" in listed["acme--corpus@2026-01-01"]));
  const retrieved = retrievePassages(odd, { behaviours: ["defined-behaviour"] }).results;
  assert.deepEqual(retrieved[1].substitutions, SWAP);
  assert.ok(!("substitutions" in retrieved[0]));
});

/* The grandfathered publication, which the routes keep serving after the merge
 * until a new one is made public, was written by the old builder. Its coverage
 * carries a human curation's integer where a new publication carries the panel's
 * { mean, judges }; the fields beside it are the recorded payload's, at 085fd2e. */
const grandfathered = () => {
  const old = structuredClone(payload);
  for (const behaviour of old.behaviours) {
    for (const id of Object.keys(behaviour.coverage)) {
      behaviour.coverage[id] = { verdict: "covered", depth: 4, note: "",
                                 verifiedDate: "2026-07-24",
                                 passages: behaviour.coverage[id].passages };
    }
  }
  return { ...snapshot(), payload: old };
};

test("a curation's integer is not reported as the depth the panel gave", () => {
  const answer = listBehaviours(grandfathered());
  const depths = answer.behaviours.flatMap(
    behaviour => Object.values(behaviour.coverage).map(cell => cell.depth));
  assert.equal(depths.length, 4);
  assert.deepEqual(depths, [null, null, null, null]);
});

test("a retrieved cell of the grandfathered publication carries no depth", () => {
  const answer = retrievePassages(grandfathered(), { behaviours: BOTH });
  assert.equal(answer.results.length, 4);
  assert.deepEqual(answer.results.map(cell => cell.depth), [null, null, null, null]);
});

test("a depth counts only as an object with a finite mean, and a mean of zero counts", () => {
  const odd = snapshot();
  odd.payload = structuredClone(payload);
  const [defined, undefinedBehaviour] = odd.payload.behaviours;
  defined.coverage["acme--corpus@2026-01-01"].depth = { mean: "2.7", judges: {} };
  defined.coverage["acme--second@2026-02-01"].depth = { mean: 0, judges: {} };
  undefinedBehaviour.coverage["acme--corpus@2026-01-01"].depth = { judges: {} };
  const answer = listBehaviours(odd);
  assert.equal(answer.behaviours[0].coverage["acme--corpus@2026-01-01"].depth, null);
  assert.deepEqual(answer.behaviours[0].coverage["acme--second@2026-02-01"].depth,
                   { mean: 0, judges: {} });
  assert.equal(answer.behaviours[1].coverage["acme--corpus@2026-01-01"].depth, null);
});

test("no answer carries a comparability caveat: every cell is judged by one panel", () => {
  const answer = retrievePassages(snapshot(), { behaviours: ["defined-behaviour"] });
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

test("everything fits in one page when the budget is large", () => {
  const answer = retrievePassages(snapshot(), { behaviours: BOTH, strength: "related" });
  assert.equal(answer.results.length, 4);
  assert.equal(answer.next_cursor, null);
  assert.deepEqual(answer.remaining, { cells: 0, passages: 0 });
});

test("a page stops on a whole cell and names the next one", () => {
  const answer = retrievePassages(snapshot(), {
    behaviours: BOTH, strength: "related", limit: 2,
  });
  // acme--corpus@2026-01-01 holds two passages and fills the budget exactly; acme--second@2026-02-01
  // would take it to three, so it starts the next page.
  assert.deepEqual(answer.results.map(cell => cell.model_spec_id), ["acme--corpus@2026-01-01"]);
  assert.deepEqual(answer.next_cursor, {
    publication: "3114dd65-c6f2-5cb3-bf98-af5b314381c3",
    behaviour: "defined-behaviour", model_spec_id: "acme--second@2026-02-01",
  });
  assert.deepEqual(answer.remaining, { cells: 3, passages: 5 });
});

test("no cell is ever split", () => {
  const answer = retrievePassages(snapshot(), {
    behaviours: ["undefined-behaviour"], model_spec_ids: ["acme--corpus@2026-01-01"],
    strength: "related", limit: 1,
  });
  assert.equal(answer.results.length, 1);
  assert.equal(answer.results[0].passages.length, 3,
               "a cell over the budget comes back whole, alone");
  assert.equal(answer.next_cursor, null);
});

test("walking the cursor yields every passage exactly once", () => {
  const seen = [];
  let cursor;
  let pages = 0;
  do {
    const answer = retrievePassages(snapshot(), {
      behaviours: BOTH, strength: "related", limit: 1, cursor,
    });
    for (const cell of answer.results) {
      for (const passage of cell.passages) seen.push(passage.locator);
    }
    cursor = answer.next_cursor ?? undefined;
    pages += 1;
    assert.ok(pages < 10, "the walk is not terminating");
  } while (cursor);

  const whole = retrievePassages(snapshot(), { behaviours: BOTH, strength: "related" });
  const expected = whole.results.flatMap(cell => cell.passages.map(p => p.locator));
  assert.deepEqual(seen, expected);
  assert.equal(new Set(seen).size, seen.length, "no passage is served twice");
});

test("a repeated behaviour slug answers as the unrepeated request does", () => {
  const repeated = retrievePassages(snapshot(), {
    behaviours: ["defined-behaviour", "defined-behaviour"], model_spec_ids: ["acme--corpus@2026-01-01"],
  });
  const once = retrievePassages(snapshot(), {
    behaviours: ["defined-behaviour"], model_spec_ids: ["acme--corpus@2026-01-01"],
  });
  assert.deepEqual(repeated.results, once.results);
});

test("a repeated specification id answers as the unrepeated request does", () => {
  const repeated = retrievePassages(snapshot(), {
    behaviours: ["defined-behaviour"], model_spec_ids: ["acme--corpus@2026-01-01", "acme--corpus@2026-01-01"],
  });
  const once = retrievePassages(snapshot(), {
    behaviours: ["defined-behaviour"], model_spec_ids: ["acme--corpus@2026-01-01"],
  });
  assert.deepEqual(repeated.results, once.results);
  assert.deepEqual(repeated.model_specs_read, once.model_specs_read);
});

test("a walk over a repeated specification id terminates", () => {
  let cursor;
  let pages = 0;
  do {
    const answer = retrievePassages(snapshot(), {
      behaviours: ["defined-behaviour"], model_spec_ids: ["acme--corpus@2026-01-01", "acme--corpus@2026-01-01"],
      strength: "related", limit: 1, cursor,
    });
    cursor = answer.next_cursor ?? undefined;
    pages += 1;
    assert.ok(pages < 10, "the walk is not terminating");
  } while (cursor);
});

test("an empty cell rides along instead of starting a page of its own", () => {
  const answer = retrievePassages(snapshot(), {
    behaviours: ["undefined-behaviour"], strength: "core", limit: 3,
  });
  // acme--corpus@2026-01-01 holds three, acme--second@2026-02-01 holds none: the empty one costs
  // nothing and its note stays with the page that reached it.
  assert.deepEqual(answer.results.map(cell => cell.model_spec_id),
                   ["acme--corpus@2026-01-01", "acme--second@2026-02-01"]);
  assert.equal(answer.next_cursor, null);
});

test("a cursor from another publication is refused rather than followed", () => {
  assert.throws(
    () => retrievePassages(snapshot(), {
      behaviours: BOTH,
      cursor: { publication: "00000000-0000-0000-0000-000000000000",
                behaviour: "defined-behaviour", model_spec_id: "acme--second@2026-02-01" },
    }),
    error => error instanceof ToolError && /issued against publication/.test(error.message));
});

test("a cursor naming a cell outside the request is refused", () => {
  assert.throws(
    () => retrievePassages(snapshot(), {
      behaviours: ["defined-behaviour"], model_spec_ids: ["acme--corpus@2026-01-01"],
      cursor: { publication: "3114dd65-c6f2-5cb3-bf98-af5b314381c3",
                behaviour: "undefined-behaviour", model_spec_id: "acme--second@2026-02-01" },
    }),
    error => error instanceof ToolError && /does not name a cell of this request/.test(error.message));
});
