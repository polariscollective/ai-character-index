/**
 * The PostgREST client. fetch is injected, so nothing here touches a network.
 * Run: node --test app/lib/__tests__/supabase.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { insert, select, update } from "../supabase.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co/";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

/* Answers each request from a queue of row arrays, recording what was asked. */
function stub(...pages) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, ...init });
    const rows = pages.shift() ?? [];
    return { ok: true, status: 200, json: async () => rows, text: async () => "" };
  };
  return { seen, fetchImpl };
}

const page = (n) => Array.from({ length: n }, (_, i) => ({ i }));

test("a trailing slash on the url does not double up", async () => {
  const { seen, fetchImpl } = stub([]);
  await select("aci_jobs", "", fetchImpl);
  assert.match(seen[0].url, /^https:\/\/example\.supabase\.co\/rest\/v1\/aci_jobs\?/);
});

test("a full page is followed by another request", async () => {
  const { seen, fetchImpl } = stub(page(1000), page(3));
  const rows = await select("aci_judge_calls", "status=eq.done", fetchImpl);
  assert.equal(rows.length, 1003);
  assert.match(seen[0].url, /status=eq\.done&limit=1000&offset=0/);
  assert.match(seen[1].url, /offset=1000/);
});

test("a short page ends the paging", async () => {
  const { seen, fetchImpl } = stub(page(7));
  assert.equal((await select("aci_runs", "", fetchImpl)).length, 7);
  assert.equal(seen.length, 1);
});

test("a caller's own limit is left alone", async () => {
  const { seen, fetchImpl } = stub(page(1));
  await select("aci_publications", "order=published_at.desc&limit=1", fetchImpl);
  assert.equal(seen.length, 1);
  assert.doesNotMatch(seen[0].url, /offset=/);
});

test("an insert asks for what was written back", async () => {
  const { seen, fetchImpl } = stub([{ id: "new" }]);
  const written = await insert("aci_jobs", [{ mode: "judge" }], fetchImpl);
  assert.deepEqual(written, [{ id: "new" }]);
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].headers.Prefer, "return=representation");
  assert.equal(seen[0].body, JSON.stringify([{ mode: "judge" }]));
});

test("an update without a filter is refused rather than applied to everything", async () => {
  await assert.rejects(() => update("aci_publications", "", { is_public: true }),
                       /needs a filter/);
});

test("an update patches what the filter matches", async () => {
  const { seen, fetchImpl } = stub([{ id: "p", is_public: true }]);
  await update("aci_publications", "id=eq.p", { is_public: true }, fetchImpl);
  assert.equal(seen[0].method, "PATCH");
  assert.match(seen[0].url, /aci_publications\?id=eq\.p$/);
});

test("a refusal carries the status and the body, because PostgREST explains itself there", async () => {
  const fetchImpl = async () => ({
    ok: false, status: 403, json: async () => ({}),
    text: async () => `permission denied for table aci_publications`,
  });
  await assert.rejects(() => insert("aci_publications", [{}], fetchImpl),
                       /403: permission denied for table aci_publications/);
});

test("a missing key is an error before any request is made", async () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let called = false;
  await assert.rejects(() => select("aci_jobs", "", async () => { called = true; }),
                       /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
  assert.equal(called, false);
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
});
