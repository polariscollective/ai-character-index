/**
 * The MCP answers, against the reader fixtures. Nothing here touches a network:
 * a snapshot is a plain object, which is the point of the tools being pure.
 *
 * Run: node --test app/lib/__tests__/mcp-tools.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { about, listModelSpecs, listBehaviours, retrievePassages, compareDocuments,
         INSTRUCTIONS, ToolError }
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
  assert.deepEqual(answer.model_specs.map(spec => spec.id),
                   ["acme--corpus@2026-01-01", "acme--second@2026-02-01",
                    "acme--translated@2026-03-01", "zenith--guidelines@2026-05-01",
                    "zenith--model-spec@2026-04-01"]);

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

/* A development deployment can serve a draft, and the instructions tell a client
 * that is_public false means the answer is not the index's published data. That
 * holds only if every answer carries the flag through, so all three are held to it. */
test("every tool's answer carries the publication's is_public", () => {
  const draft = snapshot();
  draft.publication = { ...draft.publication, is_public: false };
  const answers = {
    list_model_specs: listModelSpecs(draft),
    list_behaviours: listBehaviours(draft),
    retrieve_passages: retrievePassages(draft, { behaviours: ["defined-behaviour"] }),
  };
  for (const [tool, answer] of Object.entries(answers)) {
    assert.equal(answer.publication?.is_public, false,
                 `${tool} must say the publication it read is not public`);
  }
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
  assert.equal(cell.passages.length, 2,
               "related is the default strength, so the cell's related passage comes too");

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

/* The spec reader opens on every band, related drawn softer, so the tools do too.
 * Every passage still carries its strength, which is what a client filters on. */
const strengthsOf = answer => answer.results.flatMap(
  cell => cell.passages.map(passage => passage.strength));

test("the default strength is related, the reader's own default", () => {
  const withDefault = retrievePassages(snapshot(), { behaviours: BOTH });
  const explicit = retrievePassages(snapshot(), { behaviours: BOTH, strength: "related" });
  assert.deepEqual(withDefault.results, explicit.results);
});

test("with no strength given, related passages are returned", () => {
  const strengths = strengthsOf(retrievePassages(snapshot(), { behaviours: BOTH }));
  assert.ok(strengths.includes("related"), `strengths returned: ${strengths.join(", ")}`);
  assert.equal(strengths.length, 7, "every banded passage of the fixture");
});

test("with strength core, related passages are not returned", () => {
  const strengths = strengthsOf(
    retrievePassages(snapshot(), { behaviours: BOTH, strength: "core" }));
  assert.ok(!strengths.includes("related"), `strengths returned: ${strengths.join(", ")}`);
  assert.equal(strengths.length, 5);
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
                   ["acme--corpus@2026-01-01", "acme--second@2026-02-01",
                    "acme--translated@2026-03-01", "zenith--guidelines@2026-05-01",
                    "zenith--model-spec@2026-04-01"]);
  assert.deepEqual(answer.model_specs_read.map(spec => spec.id),
                   ["acme--corpus@2026-01-01", "acme--second@2026-02-01",
                    "acme--translated@2026-03-01", "zenith--guidelines@2026-05-01",
                    "zenith--model-spec@2026-04-01"]);
});

test("an empty cell says so rather than disappearing", () => {
  // This cell holds one related passage and nothing stronger, so it is empty at
  // core, which is named because the default now returns every band.
  const answer = retrievePassages(snapshot(), {
    behaviours: ["undefined-behaviour"], model_spec_ids: ["acme--second@2026-02-01"],
    strength: "core",
  });
  const [cell] = answer.results;
  assert.deepEqual(cell.passages, []);
  assert.match(cell.note, /Absence of coverage is an index finding/);
});

/* The same emptiness, two different claims. A document a panel has read and
 * found nothing in is a finding of the index; a document nobody has judged is
 * not, and the answer must not let a caller mistake the second for the first. */
test("a document no panel has judged says that, not that its silence is a finding", () => {
  const answer = retrievePassages(snapshot(), {
    behaviours: ["defined-behaviour"], model_spec_ids: ["acme--translated@2026-03-01"],
  });
  const [cell] = answer.results;
  assert.deepEqual(cell.passages, []);
  assert.match(cell.note, /No panel has judged this document/);
  assert.doesNotMatch(cell.note, /index finding/);
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
  assert.equal(answer.results.length, 10, "two behaviours over five documents");
  assert.deepEqual(answer.results.map(cell => cell.depth),
                   [null, null, null, null, null, null, null, null, null, null]);
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
  assert.equal(answer.results.length, 10, "two behaviours over five documents");
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
  // Two behaviours over five documents is ten cells, one of them on this page.
  assert.deepEqual(answer.remaining, { cells: 9, passages: 5 });
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
  // acme--corpus@2026-01-01 holds three; the others hold none. An empty cell
  // costs nothing and its note stays with the page that reached it.
  assert.deepEqual(answer.results.map(cell => cell.model_spec_id),
                   ["acme--corpus@2026-01-01", "acme--second@2026-02-01",
                    "acme--translated@2026-03-01", "zenith--guidelines@2026-05-01",
                    "zenith--model-spec@2026-04-01"]);
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

/* `about`, the entry point.
 *
 * Most clients never show a server's instructions to the model, so the tool list
 * is all an agent sees. These hold the answer to two things: that it says what
 * the instructions say, by returning them rather than retelling them, and that
 * every fact beside them is read from the publication. The fixture is not the
 * index -- five documents nobody has heard of, two behaviours, judges called a,
 * b and c -- so a sentence written from production fails here. */

const ROUTE = await readFile(
  new URL("../../api/mcp/route.js", import.meta.url), "utf8");

test("the route lists about first, with the description an agent reads in the list", () => {
  assert.match(ROUTE, /registerTool\("about"/);
  assert.match(ROUTE,
               /"Start here to understand this index and its other tools\."/,
               "the one line an agent sees must be exactly this");
  const registered = ["about", "list_model_specs", "list_behaviours", "retrieve_passages"]
    .map(name => ROUTE.indexOf(`registerTool("${name}"`));
  assert.ok(registered.every(at => at > -1), "a tool is not registered at all");
  assert.deepEqual(registered, [...registered].sort((first, second) => first - second),
                   "about is registered first, so an arriving agent meets it first");
});

test("the instructions are one text, returned rather than retold", () => {
  assert.ok(!/const INSTRUCTIONS = `/.test(ROUTE),
            "the instructions live in mcp-tools.mjs now, where about can return them");
  assert.match(ROUTE, /instructions: INSTRUCTIONS/);
  assert.ok(about(snapshot()).includes(INSTRUCTIONS),
            "about returns the instructions themselves, so the two cannot drift");
});

test("about answers with no arguments at all, in prose", () => {
  const answer = about(snapshot());
  assert.equal(typeof answer, "string", "an agent reads this, so it is not a data structure");
  assert.ok(answer.length > INSTRUCTIONS.length,
            "the answer adds what the instructions cannot carry");
});

test("about tells an agent that reading the instructions has missed nothing", () => {
  assert.match(about(snapshot()), /initialize/);
});

test("about names the documents this payload carries, not the ones it was written beside", () => {
  const answer = about(snapshot());
  for (const document of documents.documents) {
    assert.ok(answer.includes(document.id), `the answer does not name ${document.id}`);
  }
  assert.ok(!/anthropic--constitution|openai--model-spec|alibaba/.test(answer),
            "a document of the production index was written into the prose");
});

/* The sentence is matched, not the word: a document may be called
 * acme--translated@2026-03-01, and its id is listed whether or not anything was
 * translated. */
test("about says which documents were read in translation, and says nothing when none were", () => {
  assert.match(about(snapshot()), /machine translation/i);
  const plain = snapshot();
  plain.documents = {
    documents: documents.documents.map(({ translation, original, ...rest }) => rest),
  };
  assert.ok(!/machine translation/i.test(about(plain)),
            "a caveat about translation stands where no document was translated");
});

test("about names the behaviours and their sections, counted from the payload", () => {
  const twoSections = snapshot();
  twoSections.notes = {
    ...NOTES,
    "undefined-behaviour": { ...NOTES["undefined-behaviour"], group: "A second section" },
  };
  const answer = about(twoSections);
  assert.match(answer, /2 behaviours/, "the count is the payload's own");
  assert.ok(answer.includes("defined-behaviour"));
  assert.ok(answer.includes("undefined-behaviour"));
  assert.ok(answer.includes("Behaviours under test"));
  assert.ok(answer.includes("A second section"));
  assert.ok(!/thirteen|13 behaviours/.test(answer),
            "a count written this afternoon is false by evening");
});

test("about names the panel that judged, from the payload's own provenance", () => {
  const answer = about(snapshot());
  assert.ok(answer.includes("a, b, c"), "the judges are the fixture's, read from provenance");
  assert.ok(!/deepseek|frontier_fast/.test(answer),
            "the production panel was written into the prose");
});

test("about gives the depth scale in the rubric's own words", () => {
  const answer = about(snapshot());
  for (const anchor of ["absent", "named", "discussed", "prescribed", "demonstrated"]) {
    assert.ok(answer.includes(anchor), `the depth scale does not say ${anchor}`);
  }
});

test("about quotes a locator that exists in the payload", () => {
  const answer = about(snapshot());
  const locators = (payload.behaviours || []).flatMap(
    behaviour => Object.values(behaviour.coverage || {}).flatMap(
      cell => (cell.passages || []).map(passage => passage.locator)));
  assert.ok(locators.length, "the fixture carries no passage to make an example of");
  assert.ok(locators.some(locator => answer.includes(locator)),
            "the example locator was written by hand rather than read from the data");
});

test("about names the other tools, so the list is not the only thing explaining them", () => {
  const answer = about(snapshot());
  for (const tool of ["list_model_specs", "list_behaviours", "retrieve_passages"]) {
    assert.ok(answer.includes(tool), `the answer does not name ${tool}`);
  }
});

test("about names the publication the figures belong to", () => {
  const answer = about(snapshot());
  assert.ok(answer.includes("3114dd65-c6f2-5cb3-bf98-af5b314381c3"));
  assert.ok(answer.includes("2026-09-10"));
});

test("about says a draft is a draft rather than citing it as the index", () => {
  const draft = snapshot();
  draft.publication = { ...draft.publication, is_public: false };
  assert.match(about(draft), /draft|nobody has published/i);
});

/* The address is the deployment's, injected by the route from the platform. A
 * domain written down here would outlive the domain. */
test("the site address is given when the deployment has one, and never invented", () => {
  const plain = about(snapshot());
  assert.ok(!plain.includes("://"), "an address nobody gave it reached the answer");
  const sited = about(snapshot(), { site: "https://example.test" });
  assert.ok(sited.includes(
    "https://example.test/spec-reader/?publication=3114dd65-c6f2-5cb3-bf98-af5b314381c3"),
    "the citation names the publication on the site that served it");
});

/* ---- compare_documents ---- */

const PAIR = ["acme--corpus@2026-01-01", "acme--second@2026-02-01"];
const HERE = "acme--corpus@2026-01-01 > Body > ¶1";
const THERE = "acme--second@2026-02-01 > Body > ¶1";
const ALONE = "acme--corpus@2026-01-01 > Body > ¶2";

/* One judge read the pair from the corpus side, another from the second
 * document's side. Both said the corpus demands more, in the two words a call's
 * own direction makes of that one claim. */
const evidence = (over = {}) => ({
  run: { id: "run-1", panel: ["a", "b", "c"], prompt_sha256: "abc",
         run_date: "2026-09-16T15:00:00Z" },
  calls: [
    { judge: "a", status: "done", source_document: PAIR[0], target_document: PAIR[1],
      passages_given: 2, passages_unanswered: 0, finish_reason: "stop" },
    { judge: "b", status: "done", source_document: PAIR[1], target_document: PAIR[0],
      passages_given: 1, passages_unanswered: 0, finish_reason: "stop" },
    { judge: "c", status: "error", source_document: PAIR[0], target_document: PAIR[1],
      passages_given: 2, passages_unanswered: 2, finish_reason: "length" },
  ],
  links: [
    { judge: "a", call_id: "call-a", source_locator: HERE, target_locator: THERE,
      relation: "stricter_source", source_force: "nobody", target_force: "user",
      rationale: "The corpus forbids what the second only discourages." },
    { judge: "b", call_id: "call-b", source_locator: THERE, target_locator: HERE,
      relation: "stricter_target", source_force: "user", target_force: "nobody",
      rationale: "Read from the other side, the same claim." },
    { judge: "a", call_id: "call-a", source_locator: ALONE, target_locator: null,
      relation: "absent", source_force: null, target_force: null,
      rationale: "The second document says nothing about this." },
  ],
  arbitrations: [],
  summary: null,
  ...over,
});

const compare = (over, args = {}) => compareDocuments(
  snapshot(), evidence(over),
  { behaviour: "defined-behaviour", model_spec_ids: PAIR, ...args });

test("both directions of one pair are one pair, not two links", () => {
  const answer = compare();
  assert.equal(answer.comparison.pairs.length, 1);
  const [pair] = answer.comparison.pairs;
  assert.deepEqual(pair.passages.map(passage => passage.locator), [HERE, THERE]);
  assert.equal(pair.judges.length, 2, "both readings are kept");
});

/* The whole reason a relation is named. stricter_source and stricter_target are
 * facts about a call's direction; read from the other end the same claim flips
 * its label, and two judges who agree would look like two who do not. */
test("stricter is named by the document that demands more, from either side", () => {
  const [pair] = compare().comparison.pairs;
  for (const judge of pair.judges) {
    assert.equal(judge.relation, "stricter");
    assert.equal(judge.stricter_document, "acme--corpus@2026-01-01");
  }
  assert.deepEqual(pair.settled,
                   { relation: "stricter", stricter_document: "acme--corpus@2026-01-01",
                     by: "the judges agreed", why: null });
});

test("who may lift each rule is reported against the documents, not the direction", () => {
  const [pair] = compare().comparison.pairs;
  assert.deepEqual(pair.judges[0].force,
                   { "acme--corpus@2026-01-01": "nobody", "acme--second@2026-02-01": "user" });
  assert.deepEqual(pair.judges[1].force,
                   { "acme--second@2026-02-01": "user", "acme--corpus@2026-01-01": "nobody" });
});

test("a passage the other document has nothing facing is its own kind, not an empty pair", () => {
  const answer = compare();
  assert.equal(answer.comparison.silences.length, 1);
  assert.equal(answer.comparison.silences[0].locator, ALONE);
  assert.equal(answer.comparison.silences[0].judge, "a");
  assert.ok(answer.comparison.pairs.every(pair => pair.passages.every(p => p.locator)));
});

test("a judge whose call failed is named rather than dropped", () => {
  const judges = compare().comparison.judges;
  assert.deepEqual(judges.map(judge => [judge.judge, judge.status]),
                   [["a", "done"], ["b", "done"], ["c", "error"]]);
});

test("an arbiter's verdict is what is settled, and says it was a party", () => {
  const answer = compare({
    arbitrations: [{
      first_locator: HERE, second_locator: THERE,
      first_quote: "the corpus text", second_quote: "the second text",
      why_disputed: "the judges gave different relations",
      readings: { a: [{ relation: "stricter acme--corpus@2026-01-01", comment: "..." }] },
      arbiter: "a", arbiter_was_a_party: true,
      relation: "nuance", stricter_document: null,
      agrees: "neither", why: "Neither implies the other.",
    }],
  });
  const [pair] = answer.comparison.pairs;
  assert.equal(pair.arbitration.arbiter, "a");
  assert.equal(pair.arbitration.arbiter_was_a_party, true);
  assert.equal(pair.settled.relation, "nuance", "the verdict overrides the judges");
  assert.equal(pair.settled.by, "a");
  assert.equal(pair.judges.length, 2, "what the judges said is still there");
});

test("judges who disagree with nobody to settle them are unsettled, not counted", () => {
  const split = evidence();
  split.links[1] = { ...split.links[1], relation: "nuance" };
  const answer = compareDocuments(snapshot(), split,
                                  { behaviour: "defined-behaviour", model_spec_ids: PAIR });
  assert.equal(answer.comparison.pairs[0].settled, null);
});

test("an arbitrated pair takes its quotes from the arbitration when the payload has none", () => {
  const answer = compare({
    arbitrations: [{
      first_locator: HERE, second_locator: THERE,
      first_quote: "the corpus text", second_quote: "the second text",
      why_disputed: "one judge only", readings: {},
      arbiter: "c", arbiter_was_a_party: false,
      relation: "same", stricter_document: null, agrees: "both", why: "Alike.",
    }],
  });
  const quotes = answer.comparison.pairs[0].passages.map(passage => passage.quote);
  assert.ok(quotes.every(quote => quote !== null));
});

test("the summary rides with the comparison, named by who wrote it", () => {
  const answer = compare({
    summary: { model: "a", prompt_sha256: "def", body: "How they stand.",
               finish_reason: "stop", created_at: "2026-09-16T17:00:00Z" },
  });
  assert.deepEqual(answer.comparison.summary,
                   { written_by: "a", prompt_sha256: "def", text: "How they stand." });
});

test("detail counts answers with the shape and the exact size of the full answer", () => {
  const counted = compare({}, { detail: "counts" });
  const full = compare();
  assert.equal(counted.comparison, undefined, "counts carries no pairs");
  assert.equal(counted.counts.pairs, 1);
  assert.equal(counted.counts.silences, 1);
  assert.deepEqual(counted.counts.relations, { stricter: 1 });
  assert.equal(counted.full_answer_characters, JSON.stringify(full).length,
               "the figure is the size, not an estimate of it");
  assert.ok(JSON.stringify(counted).length < JSON.stringify(full).length);
});

test("two documents no run has compared say so, and not that they agree", () => {
  const answer = compareDocuments(snapshot(), null,
                                  { behaviour: "defined-behaviour", model_spec_ids: PAIR });
  assert.equal(answer.comparison, null);
  assert.match(answer.note, /No run has compared/);
  // The same distinction retrieve_passages draws: nobody looked is not a
  // finding, and an answer that let the two be confused would invite a caller
  // to publish the second as the first.
  assert.match(answer.note, /not a finding about either document/);
});

test("a comparison is between exactly two documents", () => {
  for (const ids of [[PAIR[0]], PAIR.concat("acme--translated@2026-03-01"), []]) {
    assert.throws(
      () => compareDocuments(snapshot(), evidence(),
                             { behaviour: "defined-behaviour", model_spec_ids: ids }),
      error => error instanceof ToolError && /exactly two/.test(error.message));
  }
});

test("an unknown behaviour or specification is an error naming what there is", () => {
  assert.throws(
    () => compareDocuments(snapshot(), evidence(),
                           { behaviour: "helpfulnes", model_spec_ids: PAIR }),
    error => error instanceof ToolError && /defined-behaviour/.test(error.message));
  assert.throws(
    () => compareDocuments(snapshot(), evidence(),
                           { behaviour: "defined-behaviour",
                             model_spec_ids: ["acme--corpus@2026-01-01", "anthropic"] }),
    error => error instanceof ToolError && /no such model spec: anthropic/.test(error.message));
});

test("compare_documents carries the publication's is_public like the others", () => {
  const draft = snapshot();
  draft.publication = { ...draft.publication, is_public: false };
  const answer = compareDocuments(draft, evidence(),
                                  { behaviour: "defined-behaviour", model_spec_ids: PAIR });
  assert.equal(answer.publication.is_public, false);
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
