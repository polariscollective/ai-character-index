/**
 * The links builder. fetch is injected, so nothing here touches a network.
 * Run: npm run test:routes
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLinks, options, serialise } from "../../../engine/build-links-data.mjs";

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

/* An empty list is a publication saying it pinned no notes at all, which must
 * stay empty rather than silently acquiring every note in the table -- the
 * failure this pin exists to prevent. Distinct from the case above, where a
 * list selects some: here the list is present and names nothing. */
test("an empty note-prompts list takes no notes", async () => {
  const notes = [
    { behaviour_slug: "helpfulness", document_id: "doc-a", kind: "depth",
      body: "kept", created_at: "2026-01-01", prompt_sha256: "sha-kept" },
    { behaviour_slug: "helpfulness", document_id: "doc-b", kind: "depth",
      body: "also kept", created_at: "2026-01-01", prompt_sha256: "sha-other" },
  ];
  const out = await buildLinks([RUN], [], stubWithNotes(notes));
  assert.deepEqual(out.notes.depth, {});
});

/* A stub holding one run's calls between two documents and the comparison
 * paragraph written for that pair, so the comparison has something to carry. */
function stubWithComparison() {
  const rows = {
    aci_link_calls: [{ id: "call-1", run_id: RUN, behaviour_slug: "helpfulness",
                       model: "sol", status: "done",
                       source_version_id: "v-a", target_version_id: "v-b" }],
    aci_spec_versions: [{ id: "v-a", spec_id: "lab--a", version: "1" },
                        { id: "v-b", spec_id: "lab--b", version: "1" }],
    aci_link_summaries: [{ run_id: RUN, behaviour_slug: "helpfulness",
                           document_ids: ["lab--b@1", "lab--a@1"], model: "sol",
                           body: "Each document scores 3 out of 4.",
                           created_at: "2026-09-17" }],
    aci_document_notes: [{ behaviour_slug: "helpfulness", document_id: "lab--a@1",
                           kind: "standing", body: "Standing.", created_at: "2026-09-17",
                           prompt_sha256: "sha-standing" }],
  };
  return async url => {
    const table = Object.keys(rows).find(name => String(url).includes(`/${name}?`));
    return { ok: true, status: 200, json: async () => rows[table] || [],
             text: async () => "" };
  };
}

test("without the flag the comparisons are carried as they always were", async () => {
  const out = await buildLinks([RUN], null, stubWithComparison());
  assert.deepEqual(out.comparisons, {
    "helpfulness\nlab--a@1\nlab--b@1": { writtenBy: "sol", text: "Each document scores 3 out of 4." },
  });
});

/* A publication out of ten carries no comparison paragraph, because every one
 * written so far quotes a figure out of 4. Everything else is what it was, in
 * the same place, so the rest of the file's bytes do not move. */
test("leaving comparisons out empties them and changes nothing else", async () => {
  const withThem = await buildLinks([RUN], null, stubWithComparison());
  const without = await buildLinks([RUN], null, stubWithComparison(),
                                   { comparisons: false });
  assert.deepEqual(without.comparisons, {});
  assert.deepEqual(Object.keys(without), Object.keys(withThem));
  assert.equal(serialise({ ...without, comparisons: withThem.comparisons }),
               serialise(withThem));
});

test("the command line asks for comparisons unless told to leave them out", () => {
  const argv = ["node", "engine/build-links-data.mjs", "--link-runs=r1,r0",
                "--note-prompts=p1", "--out=links.json"];
  assert.deepEqual(options(argv), {
    out: "links.json", runIds: ["r1", "r0"], notePrompts: ["p1"], comparisons: true,
  });
  assert.equal(options([...argv, "--without-comparisons"]).comparisons, false);
  assert.equal(options(["node", "x", "--out=o"]).notePrompts, null);
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
