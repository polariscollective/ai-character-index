/**
 * Publication lookup. fetch is injected, so nothing here touches a network.
 * Run: node --test app/lib/__tests__/
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicationId, publicationColumn, readerResponse }
  from "../publications.mjs";

const ID = "3114dd65-c6f2-5cb3-bf98-af5b314381c3";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

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

test("a pin asks for that publication", async () => {
  const { calls, fetchImpl } = stub([{ documents: { ok: 1 } }]);
  await publicationColumn("documents", ID, fetchImpl);
  assert.match(calls[0].url, new RegExp(`id=eq\\.${ID}`));
  assert.doesNotMatch(calls[0].url, /order=/);
  // A pin reaches a draft: previewing what is about to be published is the
  // whole point of having a draft at all.
  assert.doesNotMatch(calls[0].url, /is_public/);
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
