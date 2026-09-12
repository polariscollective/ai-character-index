/**
 * The public proposal route's library. This is the one door open to the
 * internet that writes, so what it refuses is what these tests are about.
 * Run: node --test app/lib/__tests__/submissions.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_DOCUMENT_BYTES, announce, asMarkdown, behaviourProblems, callerAddress,
  record, recentFrom, sourceHash, specificationProblems,
} from "../submissions.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

const headers = (values) => new Headers(values);

const GOOD_BEHAVIOUR = {
  name: "Bribery resistance",
  query: "The model should not change its behaviour in response to offers of payment.",
  boundary: "The construct is resistance to inducements. NOT this: discussing bribery.",
};
const GOOD_SPEC = {
  organisation: "OpenAI", name: "model-spec", version: "2026-01-20",
  source_url: "https://example.com/spec",
};
const file = (bytes) => ({ size: bytes });

test("a behaviour needs a brief and a boundary, and says so together", () => {
  assert.deepEqual(behaviourProblems({}), [
    "the behaviour's name is required",
    "what the judges should be asked is required",
    "where the construct stops is required",
  ]);
  assert.deepEqual(behaviourProblems(GOOD_BEHAVIOUR), []);
});

test("an unbounded field is not a field", () => {
  const found = behaviourProblems({ ...GOOD_BEHAVIOUR, query: "x".repeat(5001) });
  assert.equal(found.length, 1);
  assert.match(found[0], /longer than 5000/);
});

test("a document's name and version must survive being read back out of a citation", () => {
  const found = specificationProblems({ ...GOOD_SPEC, name: "spec@2026" }, file(10));
  assert.match(found.join(" "), /must not contain @/);
  assert.deepEqual(specificationProblems(GOOD_SPEC, file(10)), []);
});

test("a specification without its text is not a specification", () => {
  assert.match(specificationProblems(GOOD_SPEC, null).join(" "), /the document itself is required/);
  assert.match(specificationProblems(GOOD_SPEC, file(0)).join(" "), /required/);
});

test("a document larger than the cap is refused before it is read", () => {
  const found = specificationProblems(GOOD_SPEC, file(MAX_DOCUMENT_BYTES + 1));
  assert.match(found.join(" "), /larger than 2 MB/);
});

test("a file that is not text is refused", () => {
  assert.equal(asMarkdown("# A document\n\nWith prose."), null);
  assert.match(asMarkdown("PK\u0000\u0003binary"), /not text/);
  assert.match(asMarkdown("   \n  "), /empty/);
});

test("the address is hashed with a salt, so the hash is not the address", () => {
  const hash = sourceHash("203.0.113.7");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, sourceHash("203.0.113.7"), "the same source must count as the same");
  assert.notEqual(hash, sourceHash("203.0.113.8"));

  // Without the salt an address is trivially recoverable: the space is small
  // enough to enumerate. Changing the salt must change the hash.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "ANOTHER";
  assert.notEqual(hash, sourceHash("203.0.113.7"));
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
});

test("the caller is the first address in the forwarded chain", () => {
  assert.equal(callerAddress(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
               "203.0.113.7");
  assert.equal(callerAddress(headers({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
  assert.equal(callerAddress(headers({})), "unknown");
});

test("the rate-limit query asks for this source within the hour", async () => {
  let asked;
  await recentFrom("abc", async (url) => {
    asked = url;
    return { ok: true, status: 200, json: async () => [], text: async () => "" };
  });
  assert.match(asked, /source_hash=eq\.abc/);
  assert.match(asked, /created_at=gte\./);
});

test("a document goes to the bucket before the row that describes it", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, method: init.method, body: init.body });
    return { ok: true, status: 200, text: async () => "",
             json: async () => [{ id: "s1", kind: "specification" }] };
  };
  await record({ kind: "specification", proposal: GOOD_SPEC, document: "# text",
                 submitter: "", hash: "abc" }, { fetchImpl });
  assert.match(seen[0].url, /\/storage\/v1\/object\/aci-submissions\/\d{4}-\d{2}-\d{2}\//);
  assert.equal(seen[0].body, "# text");
  assert.match(seen[1].url, /aci_submissions/);
  const row = JSON.parse(seen[1].body)[0];
  assert.match(row.document, /\.md$/);
  assert.equal(row.source_hash, "abc");
});

test("a behaviour has no document and stores none", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(url);
    return { ok: true, status: 200, text: async () => "",
             json: async () => [{ id: "s2", kind: "behaviour" }] };
  };
  await record({ kind: "behaviour", proposal: GOOD_BEHAVIOUR, document: null,
                 submitter: "a@b.c", hash: "abc" }, { fetchImpl });
  assert.equal(seen.length, 1, "a behaviour touched storage");
  assert.match(seen[0], /aci_submissions/);
});

test("the proposal is stored as it was given, not as we would like it", async () => {
  let written;
  const fetchImpl = async (url, init) => {
    if (url.includes("aci_submissions")) written = JSON.parse(init.body)[0];
    return { ok: true, status: 200, text: async () => "", json: async () => [{ id: "s" }] };
  };
  const proposal = { name: "  odd Spacing  ", query: "lowercase start", boundary: "b" };
  await record({ kind: "behaviour", proposal, document: null, submitter: "", hash: "h" },
               { fetchImpl });
  assert.deepEqual(written.proposal, proposal);
});

test("no webhook is a message nobody got, never a proposal nobody has", async () => {
  const hook = process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_WEBHOOK_URL;
  assert.match(await announce({ kind: "behaviour", proposal: GOOD_BEHAVIOUR }),
               /SLACK_WEBHOOK_URL is not set/);
  if (hook) process.env.SLACK_WEBHOOK_URL = hook;
});

test("an unreachable webhook is reported, not thrown", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.example/x";
  const said = await announce({ kind: "behaviour", proposal: GOOD_BEHAVIOUR },
                              async () => { throw new Error("ENOTFOUND"); });
  assert.match(said, /slack unreachable: ENOTFOUND/);
  delete process.env.SLACK_WEBHOOK_URL;
});

/* What was posted, for a message this shape. */
async function posted(row, site = "https://index.example") {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.example/x";
  let body;
  const said = await announce(row, async (url, init) => {
    body = JSON.parse(init.body);
    return { ok: true };
  }, site);
  delete process.env.SLACK_WEBHOOK_URL;
  assert.equal(said, null);
  return body;
}

test("the message names what arrived, who sent it, and where to read it", async () => {
  const body = await posted({ kind: "specification", proposal: GOOD_SPEC,
                              submitter: "a@b.c", document: "2026-09-12/x.md" });
  const text = JSON.stringify(body);
  assert.match(body.blocks[0].text.text, /New document proposed: OpenAI/);
  assert.match(text, /a@b\.c/);
  assert.match(text, /https:\/\/index\.example\/admin\/submissions/);
  assert.match(text, /a document is attached/);
  // The fallback carries the notification; blocks alone push silently.
  assert.match(body.text, /New document proposed/);
});

test("a behaviour's own fields are what the message shows", async () => {
  const body = await posted({ kind: "behaviour", proposal: GOOD_BEHAVIOUR, submitter: "" });
  const shown = body.blocks[1].text.text;
  assert.match(shown, /\*Called:\* Bribery resistance/);
  assert.match(shown, /\*What it requires:\*/);
  assert.match(shown, /\*Where it stops:\*/);
  assert.match(JSON.stringify(body), /no address given/);
  assert.doesNotMatch(JSON.stringify(body), /attached/);
});

test("a proposal cannot make the message ping the channel", async () => {
  // The form is open to the internet. Slack parses <!channel> out of message
  // text, so an unescaped proposal is a way for a stranger to notify everyone.
  const body = await posted({
    kind: "behaviour",
    proposal: { ...GOOD_BEHAVIOUR, name: "<!channel> & <!here>" },
    submitter: "<https://evil.example|click me>",
  });
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /<!channel>/);
  assert.doesNotMatch(text, /<!here>/);
  assert.match(text, /&lt;!channel&gt;/);
  assert.match(text, /&amp;/);
  // The one angle bracket left is the portal link this file wrote itself.
  assert.equal((text.match(/<[^<]*\|/g) || []).length, 1);
});

test("a very long field is cut rather than posted whole", async () => {
  const body = await posted({ kind: "behaviour",
                              proposal: { ...GOOD_BEHAVIOUR, why: "x".repeat(5000) } });
  const shown = body.blocks[1].text.text;
  assert.ok(shown.length < 3000, `the message was ${shown.length} characters`);
  assert.match(shown, /x\.\.\./);
});
