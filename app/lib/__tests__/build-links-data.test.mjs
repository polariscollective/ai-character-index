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

test("buildLinks refuses to build with no run named", async () => {
  await assert.rejects(() => buildLinks([], stub()), /at least one run/);
});

test("buildLinks carries the runs it was given", async () => {
  const out = await buildLinks([RUN], stub());
  assert.deepEqual(out.runs, [RUN]);
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
