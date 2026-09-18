/**
 * The links builder. fetch is injected, so nothing here touches a network.
 * Run: npm run test:routes
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLinks, serialise } from "../../../engine/build-links-data.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

const RUN = "11111111-1111-4111-8111-111111111111";

function stub() {
  return async () => ({
    ok: true, status: 200, json: async () => [], text: async () => "",
  });
}

/* A stub that answers aci_document_notes with the given rows and everything
 * else with none, so a test can shape only what it is checking. */
function stubWithNotes(notes) {
  return async url => ({
    ok: true, status: 200,
    json: async () => (String(url).includes("aci_document_notes") ? notes : []),
    text: async () => "",
  });
}

test("buildLinks refuses to build with no run named", async () => {
  await assert.rejects(() => buildLinks([], null, stub()), /at least one run/);
});

test("buildLinks carries the runs it was given", async () => {
  const out = await buildLinks([RUN], null, stub());
  assert.deepEqual(out.runs, [RUN]);
});

/* A document note carries no run: a publication pins it by the prompt that
 * wrote it, and a digest not in that list must not reach the built links. */
test("a note prompt not named in the list is dropped", async () => {
  const notes = [
    { behaviour_slug: "helpfulness", document_id: "doc-a", kind: "depth",
      body: "kept", created_at: "2026-01-01", prompt_sha256: "sha-kept" },
    { behaviour_slug: "helpfulness", document_id: "doc-b", kind: "depth",
      body: "dropped", created_at: "2026-01-01", prompt_sha256: "sha-dropped" },
  ];
  const out = await buildLinks([RUN], ["sha-kept"], stubWithNotes(notes));
  assert.deepEqual(out.notes.depth, { "helpfulness\ndoc-a": { text: "kept" } });
});

test("an empty note-prompts list takes every note, which is what a reader outside a publication wants", async () => {
  const notes = [
    { behaviour_slug: "helpfulness", document_id: "doc-a", kind: "depth",
      body: "kept", created_at: "2026-01-01", prompt_sha256: "sha-kept" },
    { behaviour_slug: "helpfulness", document_id: "doc-b", kind: "depth",
      body: "also kept", created_at: "2026-01-01", prompt_sha256: "sha-other" },
  ];
  const out = await buildLinks([RUN], [], stubWithNotes(notes));
  assert.deepEqual(out.notes.depth, {
    "helpfulness\ndoc-a": { text: "kept" },
    "helpfulness\ndoc-b": { text: "also kept" },
  });
});

/* The digest publish.py records describes these exact bytes, and
 * verify_supabase_provenance.py reproduces them in Python with
 * json.dumps(obj, indent=2, ensure_ascii=False). That call cannot emit a
 * trailing newline, so this must not either, or the digest check fails for the
 * life of every publication. engine/test_publish.py runs the two side by side. */
test("serialise writes what Python's json.dumps(indent=2) writes", () => {
  assert.equal(serialise({ b: 1, a: [2, 3] }),
               '{\n  "b": 1,\n  "a": [\n    2,\n    3\n  ]\n}');
  assert.equal(serialise({}), "{}");
  assert.equal(serialise({ e: "caractère" }), '{\n  "e": "caractère"\n}');
});
