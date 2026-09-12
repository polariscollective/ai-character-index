/**
 * Behaviour notes. fetch is injected, so nothing here touches a network.
 * Run: node --test app/lib/__tests__/behaviours.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { behaviourNotes } from "../behaviours.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

/* Two tables, answered by which one the URL names. */
function stub(registry, calls) {
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(url);
    const rows = url.includes("aci_judge_calls") ? calls : registry;
    return { ok: true, status: 200, json: async () => rows, text: async () => "", init };
  };
  return { urls, fetchImpl };
}

const judged = { slug: "judged-one", name: "Judged one", set_name: "index",
                 numeric_id: 1, group_name: "Behaviours under test",
                 definition: "The brief.",
                 judging: { query: "The brief.", boundary: "Not that.",
                            source: "somewhere" } };
const described = { slug: "described-only", name: "Described only",
                    set_name: "index", numeric_id: 2, group_name: "Behaviours under test",
                    definition: "How the index describes it.", judging: null };

test("a judged behaviour reports its brief, its boundary and both states", async () => {
  const { fetchImpl } = stub([judged], [{ behaviour_slug: "judged-one" }]);
  const notes = await behaviourNotes(fetchImpl);
  assert.deepEqual(notes["judged-one"], {
    name: "Judged one", group: "Behaviours under test", set: "index",
    query: "The brief.", described: null, boundary: "Not that.",
    source: "somewhere", defined: true, judged: true,
  });
});

test("a display definition is never reported as the judges' brief", async () => {
  const { fetchImpl } = stub([described], []);
  const note = (await behaviourNotes(fetchImpl))["described-only"];
  assert.equal(note.query, null);
  assert.equal(note.described, "How the index describes it.");
  assert.equal(note.defined, false, "no brief means not defined");
});

test("defined and judged are independent", async () => {
  const { fetchImpl } = stub([judged, described], []);
  const notes = await behaviourNotes(fetchImpl);
  assert.deepEqual(
    Object.values(notes).map(note => [note.defined, note.judged]),
    [[true, false], [false, false]],
  );
});

test("a done call for another behaviour does not mark this one judged", async () => {
  const { fetchImpl } = stub([judged], [{ behaviour_slug: "somebody-else" }]);
  assert.equal((await behaviourNotes(fetchImpl))["judged-one"].judged, false);
});

test("no set is named: every set comes back, keyed by slug", async () => {
  const reader = { ...described, slug: "in-the-reader-set", set_name: "reader-test" };
  const { urls, fetchImpl } = stub([judged, reader], []);
  const notes = await behaviourNotes(fetchImpl);
  assert.deepEqual(Object.keys(notes).sort(), ["in-the-reader-set", "judged-one"]);
  assert.equal(notes["in-the-reader-set"].set, "reader-test");
  assert.doesNotMatch(urls[0], /set_name=/, "selected, never filtered on");
});

test("the key travels in both headers", async () => {
  let seen;
  await behaviourNotes(async (url, init) => {
    seen = init;
    return { ok: true, status: 200, json: async () => [], text: async () => "" };
  });
  assert.equal(seen.headers.apikey, "KEY");
  assert.equal(seen.headers.Authorization, "Bearer KEY");
});

test("a table that will not answer is an error, not an empty note set", async () => {
  await assert.rejects(
    () => behaviourNotes(async () => ({
      ok: false, status: 503, json: async () => [], text: async () => "unavailable",
    })),
    /GET aci_\w+\?.* -> 503/,
  );
});
