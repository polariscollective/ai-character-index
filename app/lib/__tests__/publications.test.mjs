/**
 * Publication lookup. fetch is injected, so nothing here touches a network.
 * Run: node --test app/lib/__tests__/
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { currentPublication, isPublicationId, publicationColumn, publicationRow,
         readerResponse, resetHeldColumns, resolvePublicationId,
         SERVES_DEVELOPMENT } from "../publications.mjs";

const ID = "3114dd65-c6f2-5cb3-bf98-af5b314381c3";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

// Every test in this file shares the module's HELD map (it is process state,
// not per-test state), so a value one test caches can otherwise leak into the
// next. Starting each test with nothing held is what makes each test's own
// stub the only thing that can answer it.
beforeEach(() => resetHeldColumns());

function stub(rows, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 300, status, json: async () => rows,
             text: async () => (status < 300 ? "" : "permission denied") };
  };
  return { calls, fetchImpl };
}

const params = (query) => new URLSearchParams(query);

test("an unpinned read resolves which publication it is serving, then reads it by id", async () => {
  const { calls, fetchImpl } = stub([{ id: ID }]);
  const got = await resolvePublicationId(null, fetchImpl);
  assert.equal(got, ID);
  assert.match(calls[0].url, /select=id/);
  assert.match(calls[0].url, /order=published_at\.desc/);
});

test("a pin is checked against the table before it is trusted", async () => {
  const { calls, fetchImpl } = stub([{ id: ID }]);
  assert.equal(await resolvePublicationId(ID, fetchImpl), ID);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, new RegExp(`id=eq\\.${ID}`));
});

test("a pin naming a publication the table no longer has resolves to null", async () => {
  const { fetchImpl } = stub([]);
  assert.equal(await resolvePublicationId(ID, fetchImpl), null);
});

test("nothing published yet resolves to null", async () => {
  const { fetchImpl } = stub([]);
  assert.equal(await resolvePublicationId(null, fetchImpl), null);
});

test("a column is fetched once per publication and held, though existence is asked again", async () => {
  const { calls, fetchImpl } = stub([{ id: ID, payload: { ok: 1 } }]);
  const first = await publicationColumn("payload", ID, fetchImpl);
  const second = await publicationColumn("payload", ID, fetchImpl);
  assert.deepEqual(first, { ok: 1 });
  assert.deepEqual(second, { ok: 1 });
  // Two existence checks (one per call) plus one column read: the second
  // call's column comes from memory, but existence is never taken on faith.
  assert.equal(calls.length, 3, "the second column read came from memory");
});

/* This is the regression the Critical review found: before the fix, a pin
 * was trusted once and its column held forever, so a publication withdrawn
 * after being read once would go on being served from memory. Reverting only
 * publications.mjs to its parent commit and running this test alone must
 * fail with `second` equal to the held bytes rather than null. */
test("a pinned publication the database no longer has answers null, not the bytes once held", async () => {
  const existed = stub([{ id: ID, payload: { ok: 1 } }]);
  const first = await publicationColumn("payload", ID, existed.fetchImpl);
  assert.deepEqual(first, { ok: 1 }, "the publication existed on the first read");

  const withdrawn = stub([]);
  const second = await publicationColumn("payload", ID, withdrawn.fetchImpl);
  assert.equal(second, null,
              "the same id must not keep answering from a column held before the row was gone");
});

test("a uuid is a publication id and a payload name is not", () => {
  assert.equal(isPublicationId(ID), true);
  assert.equal(isPublicationId("behaviours-v5-reader"), false);
  assert.equal(isPublicationId("../../etc/passwd"), false);
  assert.equal(isPublicationId(null), false);
});

test("no pin asks for the newest publication", async () => {
  const { calls, fetchImpl } = stub([{ payload: { ok: 1 } }]);
  const got = await publicationColumn("payload", null, fetchImpl);
  assert.deepEqual(got, { ok: 1 });
  assert.match(calls[0].url, /order=published_at\.desc/);
  assert.match(calls[0].url, /limit=1/);
  assert.match(calls[0].url, /is_public=is\.true/, "a draft is not what the reader serves");
});

test("a development deployment serves the newest build, published or not", async () => {
  const { calls, fetchImpl } = stub([{ payload: { ok: 1 } }]);
  process.env[SERVES_DEVELOPMENT] = "true";
  try {
    await publicationColumn("payload", null, fetchImpl);
  } finally {
    delete process.env[SERVES_DEVELOPMENT];
  }
  assert.doesNotMatch(calls[0].url, /is_public/,
                      "a development deployment is for looking at what is not published");
  assert.match(calls[0].url, /order=published_at\.desc/);
  assert.match(calls[0].url, /limit=1/);
});

/* The variable is a switch, not a hint: a deployment that carries it as "0" or
 * "false" meant to turn it off, and one that carries nothing never meant to
 * turn it on. Either way the public sees only what was published. */
test("only the word true opens a deployment to development builds", () => {
  assert.match(currentPublication({}), /is_public=is\.true/);
  assert.match(currentPublication({ [SERVES_DEVELOPMENT]: "1" }), /is_public=is\.true/);
  assert.match(currentPublication({ [SERVES_DEVELOPMENT]: "false" }), /is_public=is\.true/);
  assert.match(currentPublication({ [SERVES_DEVELOPMENT]: "" }), /is_public=is\.true/);
  assert.doesNotMatch(currentPublication({ [SERVES_DEVELOPMENT]: "true" }), /is_public/);
});

/* The production deployment is not a place where this can be turned on. A
 * variable set there by mistake would show every unread build to the public,
 * so the platform's own answer about where it is running wins. */
test("production ignores the variable however it is set", () => {
  const on = { [SERVES_DEVELOPMENT]: "true" };
  assert.match(currentPublication({ ...on, VERCEL_ENV: "production" }), /is_public=is\.true/);
  assert.match(currentPublication({ ...on, NODE_ENV: "production" }), /is_public=is\.true/);
  // A preview deployment is not production, and neither is a laptop.
  assert.doesNotMatch(currentPublication({ ...on, VERCEL_ENV: "preview" }), /is_public/);
  assert.doesNotMatch(currentPublication({ ...on, VERCEL_ENV: "development" }), /is_public/);
  assert.doesNotMatch(currentPublication(on), /is_public/);
  // Vercel's answer wins over the build's: a preview build runs with
  // NODE_ENV=production, and a preview is exactly where this is wanted.
  assert.doesNotMatch(
    currentPublication({ ...on, VERCEL_ENV: "preview", NODE_ENV: "production" }),
    /is_public/,
  );
});

test("a pin asks for that publication", async () => {
  const { calls, fetchImpl } = stub([{ documents: { ok: 1 } }]);
  await publicationColumn("documents", ID, fetchImpl);
  assert.match(calls[0].url, new RegExp(`id=eq\\.${ID}`));
  assert.doesNotMatch(calls[0].url, /order=/);
  // A pin reaches a draft: previewing what is about to be published is the
  // whole point of having a draft at all.
  assert.doesNotMatch(calls[0].url, /is_public/);
});

/* A surface that cites a build has to know whether anyone published it: served
 * a draft, by a pin or by a development deployment, a citation calling it the
 * index's data would be a false claim made by the page. */
test("the publication's identity says whether it was published", async () => {
  const { calls, fetchImpl } = stub([{ id: ID, published_at: "2026-09-10", is_public: false }]);
  const row = await publicationRow(ID, fetchImpl);
  assert.match(calls[0].url, /select=[^&]*is_public/);
  assert.equal(row.is_public, false);
});

test("the key travels in both headers and never in the body", async () => {
  const { calls, fetchImpl } = stub([{ payload: {} }]);
  await publicationColumn("payload", null, fetchImpl);
  assert.equal(calls[0].init.headers.apikey, "KEY");
  assert.equal(calls[0].init.headers.Authorization, "Bearer KEY");
});

test("an empty table is 404, not an empty payload", async () => {
  const { fetchImpl } = stub([]);
  const response = await readerResponse("payload", params(""), fetchImpl);
  assert.equal(response.status, 404);
  assert.equal(response.body.error, "nothing published yet");
});

test("a pin that is not a uuid is refused before any request", async () => {
  const { calls, fetchImpl } = stub([]);
  const response = await readerResponse(
    "payload", params("publication=manifest.json"), fetchImpl);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("a pinned publication is immutable and cached for a year", async () => {
  const { fetchImpl } = stub([{ payload: { ok: 1 } }]);
  const response = await readerResponse(
    "payload", params(`publication=${ID}`), fetchImpl);
  assert.equal(response.status, 200);
  assert.match(response.cacheControl, /immutable/);
});

test("the current publication is revalidated instead", async () => {
  const { fetchImpl } = stub([{ payload: { ok: 1 } }]);
  const response = await readerResponse("payload", params(""), fetchImpl);
  assert.match(response.cacheControl, /stale-while-revalidate/);
  assert.doesNotMatch(response.cacheControl, /immutable/);
});

test("a refused query is loud rather than empty", async () => {
  const { fetchImpl } = stub([], 403);
  await assert.rejects(() => publicationColumn("payload", null, fetchImpl),
                       /GET aci_publications\?.* -> 403: permission denied/);
});

test("readerResponse serves the links column, and a pin is immutable for a year", async () => {
  // sliceColumn always rebuilds notes.passage even when nothing is filtered
  // (see slice.mjs), so the fixture carries the real shape rather than the
  // bare byLocator/comparisons pair a links column never actually ships without.
  const { fetchImpl } = stub([{ links: { byLocator: {}, comparisons: {}, notes: { passage: {} } } }]);
  const out = await readerResponse("links", new URLSearchParams(`publication=${ID}`), fetchImpl);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { byLocator: {}, comparisons: {}, notes: { passage: {} } });
  assert.match(out.cacheControl, /immutable/);
});

test("readerResponse answers 404 for a publication carrying no links", async () => {
  const { fetchImpl } = stub([{ links: null }]);
  const out = await readerResponse("links", new URLSearchParams(), fetchImpl);
  assert.equal(out.status, 404);
});

test("readerResponse returns only the behaviours the address names", async () => {
  const { fetchImpl } = stub([{ id: ID, payload: {
    behaviours: [{ slug: "helpfulness" }, { slug: "no-sycophancy" }] } }]);
  const out = await readerResponse("payload",
    new URLSearchParams(`publication=${ID}&behavior=helpfulness`), fetchImpl);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.behaviours, [{ slug: "helpfulness" }]);
});

test("with no behavior parameter the whole column is served, as before", async () => {
  const whole = { behaviours: [{ slug: "helpfulness" }, { slug: "no-sycophancy" }] };
  const { fetchImpl } = stub([{ payload: whole }]);
  const out = await readerResponse("payload", new URLSearchParams(`publication=${ID}`), fetchImpl);
  assert.deepEqual(out.body, whole);
});

test("an empty behavior parameter names no behaviour, which is not the same as none given", async () => {
  const { fetchImpl } = stub([{ payload: {
    behaviours: [{ slug: "helpfulness" }] } }]);
  const out = await readerResponse("payload",
    new URLSearchParams(`publication=${ID}&behavior=`), fetchImpl);
  assert.deepEqual(out.body.behaviours, []);
});
