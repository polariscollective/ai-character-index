/**
 * The publication the MCP server answers from. fetch is injected, so nothing
 * here touches a network.
 *
 * Run: node --test app/lib/__tests__/index-snapshot.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { indexSnapshot, forgetSnapshot } from "../index-snapshot.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

const ID = "3114dd65-c6f2-5cb3-bf98-af5b314381c3";

const ROW = {
  id: ID,
  published_at: "2026-09-10T14:05:25.472064+00:00",
  payload: { behaviours: [{ slug: "helpfulness" }] },
  documents: { documents: [{ id: "anthropic" }] },
};

/** Answers every table this module reads, and records what was asked. */
function stub(rows = { aci_publications: [ROW] }) {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    const table = new URL(url).pathname.split("/").pop();
    return { ok: true, status: 200, text: async () => "",
             json: async () => rows[table] ?? [] };
  };
  return { urls, fetchImpl };
}

test("the snapshot reads the newest public publication", async () => {
  forgetSnapshot();
  const { urls, fetchImpl } = stub();
  const snapshot = await indexSnapshot(fetchImpl);

  assert.deepEqual(snapshot.publication,
                   { id: ID, published_at: "2026-09-10T14:05:25.472064+00:00" });
  assert.deepEqual(snapshot.payload, ROW.payload);
  assert.deepEqual(snapshot.documents, ROW.documents);
  assert.deepEqual(snapshot.notes, {});

  const [first] = urls;
  assert.match(first, /select=id,published_at,payload,documents/);
  assert.match(first, /is_public=is\.true/);
  assert.match(first, /order=published_at\.desc/);
  assert.match(first, /limit=1/);
});

test("a second read inside the window asks the database nothing", async () => {
  forgetSnapshot();
  const { urls, fetchImpl } = stub();
  let clock = 1_000;
  await indexSnapshot(fetchImpl, () => clock);
  const asked = urls.length;

  clock += 59_000;
  await indexSnapshot(fetchImpl, () => clock);
  assert.equal(urls.length, asked, "the memo held");
});

test("the memo expires after a minute", async () => {
  forgetSnapshot();
  const { urls, fetchImpl } = stub();
  let clock = 1_000;
  await indexSnapshot(fetchImpl, () => clock);
  const asked = urls.length;

  clock += 61_000;
  await indexSnapshot(fetchImpl, () => clock);
  assert.ok(urls.length > asked, "the memo expired and the row was read again");
});

test("nothing published is an error, not an empty snapshot", async () => {
  forgetSnapshot();
  const { fetchImpl } = stub({ aci_publications: [] });
  await assert.rejects(() => indexSnapshot(fetchImpl), /nothing published yet/);
});

test("a failed read is not memoised", async () => {
  forgetSnapshot();
  const empty = stub({ aci_publications: [] });
  await assert.rejects(() => indexSnapshot(empty.fetchImpl));

  const good = stub();
  const snapshot = await indexSnapshot(good.fetchImpl);
  assert.equal(snapshot.publication.id, ID);
});
