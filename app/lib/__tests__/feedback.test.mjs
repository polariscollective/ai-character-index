/**
 * The feedback route's library. The second door of this application open to the
 * internet that writes, so what it refuses is what these tests are about.
 * Run: node --test app/lib/__tests__/feedback.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIMITS, MAX_BEHAVIOURS, MAX_REQUEST_BYTES, PER_HOUR, VISIBILITIES,
  announce, documentOf, feedbackProblems, handle, normalise, record, resolvePublication,
} from "../feedback.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

const GOOD = {
  locator: "openai--model-spec@2026-08-18 > #levels_of_authority > ¶2",
  comment: "This paragraph is about escalation, not authority.",
  email: "reader@example.org",
};

test("a submission that says nothing is not a submission", () => {
  assert.deepEqual(feedbackProblems(normalise({ ...GOOD, comment: "" })),
                   ["write a comment or leave a thumb"]);
  assert.deepEqual(feedbackProblems(normalise({ ...GOOD, comment: "", vote: "up" })), []);
  assert.deepEqual(feedbackProblems(normalise(GOOD)), []);
});

test("the address is required, because a reply needs somewhere to go", () => {
  const found = feedbackProblems(normalise({ ...GOOD, email: "" }));
  assert.deepEqual(found, ["your address is required, so we can write back"]);
});

test("an address that is not an address is refused before it is stored", () => {
  for (const wrong of ["reader", "reader@", "@example.org", "a b@example.org"]) {
    const found = feedbackProblems(normalise({ ...GOOD, email: wrong }));
    assert.deepEqual(found, ["your address does not look like an address"], wrong);
  }
});

test("a paragraph must be named: the dialog opens from one", () => {
  assert.deepEqual(feedbackProblems(normalise({ ...GOOD, locator: "" })),
                   ["a paragraph must be named"]);
});

test("a thumb is up or down and nothing else", () => {
  assert.deepEqual(feedbackProblems(normalise({ ...GOOD, vote: "sideways" })),
                   ["a thumb is either up or down"]);
});

test("being named needs a name, and the choice is not quietly overruled", () => {
  const found = feedbackProblems(normalise({ ...GOOD, visibility: "attributed" }));
  assert.deepEqual(found, ["the name to show is required, or choose to be shown without a name"]);
  assert.deepEqual(
    feedbackProblems(normalise({ ...GOOD, visibility: "attributed", display_name: "A reader" })),
    []);
});

test("a name typed and then not asked for is not stored", () => {
  const fields = normalise({ ...GOOD, visibility: "anonymous", display_name: "A reader" });
  assert.equal(fields.display_name, "", "anonymous means anonymous");
  assert.deepEqual(feedbackProblems(fields), []);
});

test("private is what an unstated visibility means", () => {
  assert.equal(normalise(GOOD).visibility, "private");
  assert.deepEqual(VISIBILITIES, ["private", "anonymous", "attributed"]);
  assert.deepEqual(feedbackProblems(normalise({ ...GOOD, visibility: "public" })),
                   ["how we may use this must be one of private, anonymous, attributed"]);
});

test("an unbounded field is not a field", () => {
  const long = (key, size) => feedbackProblems(normalise({ ...GOOD, [key]: "x".repeat(size) }));
  assert.match(long("comment", LIMITS.comment + 1).join(" "), /comment is longer than 5000/);
  assert.match(long("locator", LIMITS.locator + 1).join(" "), /locator is longer than 500/);
  assert.match(long("email", LIMITS.email + 1).join(" "), /address is longer than 200/);
  const named = feedbackProblems(normalise({
    ...GOOD, visibility: "attributed", display_name: "n".repeat(LIMITS.name + 1) }));
  assert.match(named.join(" "), /name to show is longer than 100/);
});

test("normalise(null) does not throw: a malformed body is not a crash", () => {
  assert.doesNotThrow(() => normalise(null));
  assert.deepEqual(normalise(null), normalise({}));
  assert.deepEqual(normalise(undefined), normalise({}));
  assert.deepEqual(normalise("not an object"), normalise({}));
});

test("normalise's visibility is either the string sent, or private: never a guess", () => {
  for (const value of [undefined, "", null]) {
    assert.equal(normalise({ ...GOOD, visibility: value }).visibility, "private", String(value));
  }
  assert.equal(normalise({ ...GOOD, visibility: "public" }).visibility, "public");
  assert.equal(normalise({ ...GOOD, visibility: 42 }).visibility, "private");
});

test("the behaviours a paragraph carries are bounded too", () => {
  const many = normalise({ ...GOOD, behaviours: Array(MAX_BEHAVIOURS + 1).fill("Helpfulness") });
  assert.match(feedbackProblems(many).join(" "), /more behaviours than a paragraph can carry/);
  const long = normalise({ ...GOOD, behaviours: ["b".repeat(LIMITS.behaviour + 1)] });
  assert.match(feedbackProblems(long).join(" "), /behaviour's name is longer than 200/);
});

test("behaviours arrive as an array of names, whatever was sent", () => {
  assert.deepEqual(normalise({ ...GOOD, behaviours: ["  Helpfulness ", "", null, 7] }).behaviours,
                   ["Helpfulness", "7"]);
  assert.deepEqual(normalise({ ...GOOD, behaviours: "Helpfulness" }).behaviours, []);
  assert.deepEqual(normalise(GOOD).behaviours, []);
});

test("everything wrong is said at once, not one refusal per attempt", () => {
  const found = feedbackProblems(normalise({ locator: "", comment: "", email: "" }));
  assert.equal(found.length, 3);
});

test("the document is the locator's head, which is how a document groups", () => {
  assert.equal(documentOf(GOOD.locator), "openai--model-spec@2026-08-18");
  assert.equal(documentOf(""), "");
});

test("a request may not weigh more than the fields it can honestly carry", () => {
  // The caps above add up to a few kilobytes. 64 KB is slack, not a second cap.
  assert.equal(MAX_REQUEST_BYTES, 64 * 1024);
  assert.ok(MAX_REQUEST_BYTES > LIMITS.comment * 2);
  assert.equal(PER_HOUR, 30);
});

/* A fetch that answers every PostgREST call with `rows`, remembering what was asked. */
const spy = (rows = [{ id: "f1" }]) => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url, method: init.method || "GET", body: init.body });
    return { ok: true, status: 200, text: async () => "",
             json: async () => (typeof rows === "function" ? rows(url) : rows) };
  };
  return { seen, fetchImpl };
};

test("a pin that exists is the publication the feedback is about", async () => {
  const { seen, fetchImpl } = spy([{ id: "8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37" }]);
  const id = await resolvePublication("8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37", fetchImpl);
  assert.equal(id, "8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37");
  assert.match(seen[0].url, /aci_publications\?id=eq\.8d3f7a2e/);
});

test("no pin means the current publication, resolved as the reader resolves it", async () => {
  const { seen, fetchImpl } = spy([{ id: "3114dd65-c6f2-5cb3-bf98-af5b314381c3" }]);
  const id = await resolvePublication("", fetchImpl);
  assert.equal(id, "3114dd65-c6f2-5cb3-bf98-af5b314381c3");
  assert.match(seen[0].url, /is_public=is\.true/);
  assert.match(seen[0].url, /order=published_at\.desc/);
});

test("a pin that is not a publication falls through rather than being stored", async () => {
  const { seen, fetchImpl } = spy(url => (url.includes("id=eq.") ? [] : [{ id: "current" }]));
  assert.equal(await resolvePublication("00000000-0000-0000-0000-000000000000", fetchImpl),
               "current");
  assert.equal(seen.length, 2, "it asked for the pin, then for the current one");
  assert.equal(await resolvePublication("not-a-uuid", fetchImpl), "current");
});

test("nothing published yet is a null, not a refusal", async () => {
  const { fetchImpl } = spy([]);
  assert.equal(await resolvePublication("", fetchImpl), null);
});

test("the row carries the paragraph, the reading, and who may see it", async () => {
  const { seen, fetchImpl } = spy();
  const fields = normalise({
    ...GOOD, vote: "down", behaviours: ["Helpfulness", "Proportionate risk mitigation"],
    visibility: "attributed", display_name: "A reader",
  });
  await record({ fields, publication_id: "pub-1", hash: "abc" }, { fetchImpl });
  assert.match(seen[0].url, /aci_feedback/);
  const row = JSON.parse(seen[0].body)[0];
  assert.deepEqual(row, {
    publication_id: "pub-1",
    locator: GOOD.locator,
    document_id: "openai--model-spec@2026-08-18",
    behaviours: ["Helpfulness", "Proportionate risk mitigation"],
    vote: "down",
    comment: GOOD.comment,
    submitter: "reader@example.org",
    display_name: "A reader",
    visibility: "attributed",
    source_hash: "abc",
  });
});

test("the comment is stored as it was written, not as we would like it", async () => {
  const { seen, fetchImpl } = spy();
  const comment = "  it says  authority,  not escalation  ";
  await record({ fields: normalise({ ...GOOD, comment }), publication_id: null, hash: "h" },
               { fetchImpl });
  // Trimmed at the edges by normalise, untouched within: somebody's words.
  assert.equal(JSON.parse(seen[0].body)[0].comment, "it says  authority,  not escalation");
});

test("no webhook is a message nobody got, never feedback nobody has", async () => {
  const hook = process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_WEBHOOK_URL;
  assert.match(await announce({ locator: "x", comment: "y" }, async () => {}, ""),
               /SLACK_WEBHOOK_URL/);
  if (hook) process.env.SLACK_WEBHOOK_URL = hook;
});

test("an unreachable webhook is reported, not thrown", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.example/none";
  const said = await announce({ locator: "x", comment: "y" },
                              async () => { throw new Error("no route to host"); }, "");
  assert.match(said, /slack unreachable: no route to host/);
  delete process.env.SLACK_WEBHOOK_URL;
});

test("feedback cannot make the message ping the channel", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.example/one";
  let sent;
  await announce({
    locator: "spec@1 > #a > <!channel>",
    comment: "<!channel> read this",
    vote: "<!channel>",
    visibility: "private",
    submitter: "<!channel>@example.org",
    display_name: "<!channel>",
    behaviours: [],
  }, async (url, init) => { sent = JSON.parse(init.body); return { ok: true }; },
     "https://example.org");
  const whole = JSON.stringify(sent);
  assert.ok(!whole.includes("<!channel>"), whole);
  assert.match(whole, /&lt;!channel&gt;/);
  delete process.env.SLACK_WEBHOOK_URL;
});

test("the message names the paragraph, the thumb, and where to read it", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.example/two";
  let sent;
  await announce({ locator: "openai--model-spec@2026-08-18 > #a > ¶1",
                   comment: "It reads wrong.", vote: "down", visibility: "anonymous",
                   submitter: "r@e.org", behaviours: ["Helpfulness"] },
                 async (url, init) => { sent = JSON.parse(init.body); return { ok: true }; },
                 "https://example.org");
  const whole = JSON.stringify(sent);
  assert.match(whole, /Feedback on a paragraph/);
  assert.match(whole, /thumb down/);
  assert.match(whole, /Helpfulness/);
  assert.match(whole, /anonymous/);
  assert.match(whole, /https:\/\/example\.org\/admin\/feedback/);
  assert.equal(typeof sent.text, "string", "a notification, or the push is silent");
  delete process.env.SLACK_WEBHOOK_URL;
});

/* A request the way the platform hands one over. */
const post = (body, headers = {}) => new Request("https://index.example/api/feedback", {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

const answered = async (response) => ({ status: response.status, body: await response.json() });

test("a good submission is recorded and thanked", async () => {
  const { seen, fetchImpl } = spy(url => (url.includes("aci_publications")
    ? [{ id: "3114dd65-c6f2-5cb3-bf98-af5b314381c3" }] : [{ id: "f1" }]));
  const { status, body } = await answered(await handle(post(GOOD), { fetchImpl }));
  assert.equal(status, 200);
  assert.match(body.done, /Thank you/);
  const write = seen.find(call => call.method === "POST" && call.url.includes("aci_feedback"));
  assert.ok(write, JSON.stringify(seen.map(call => call.url)));
  assert.equal(JSON.parse(write.body)[0].publication_id,
               "3114dd65-c6f2-5cb3-bf98-af5b314381c3");
});

test("a refusal says everything that is wrong, and writes nothing", async () => {
  const { seen, fetchImpl } = spy();
  const { status, body } = await answered(
    await handle(post({ ...GOOD, email: "" }), { fetchImpl }));
  assert.equal(status, 400);
  assert.match(body.problem, /your address is required/);
  assert.ok(!seen.some(call => call.url.includes("aci_feedback") && call.method === "POST"));
});

test("the honeypot is answered exactly as an honest submission is, and stored nowhere", async () => {
  const { seen, fetchImpl } = spy();
  const { status, body } = await answered(
    await handle(post({ ...GOOD, website: "https://buy.example" }), { fetchImpl }));
  assert.equal(status, 200);
  assert.match(body.done, /Thank you/);
  assert.ok(!seen.some(call => call.method === "POST" && call.url.includes("aci_feedback")));
});

test("a body larger than the cap is refused before it is read", async () => {
  let touched = false;
  const fetchImpl = async () => { touched = true; return { ok: true, json: async () => [] }; };
  const { status, body } = await answered(await handle(
    post(GOOD, { "content-length": String(MAX_REQUEST_BYTES + 1) }), { fetchImpl }));
  assert.equal(status, 413);
  assert.match(body.problem, /larger than this form takes/);
  assert.equal(touched, false, "nothing was asked of the database");
});

test("the thirty-first submission in an hour from one place is refused", async () => {
  const many = Array.from({ length: PER_HOUR }, (_, i) => ({ id: `f${i}` }));
  const { fetchImpl } = spy(url => (url.includes("aci_feedback") ? many : [{ id: "p" }]));
  const { status, body } = await answered(await handle(post(GOOD), { fetchImpl }));
  assert.equal(status, 429);
  assert.match(body.problem, /as many as this form takes/);
  assert.match(body.problem, /already sent are safe/);
});

test("a rate-limit read that fails must not refuse an honest submission", async () => {
  let asked = 0;
  const fetchImpl = async (url, init = {}) => {
    asked += 1;
    if (init.method === undefined && url.includes("aci_feedback")) throw new Error("no route");
    return { ok: true, status: 200, text: async () => "", json: async () => [{ id: "f1" }] };
  };
  const { status } = await answered(await handle(post(GOOD), { fetchImpl }));
  assert.equal(status, 200);
  assert.ok(asked > 1);
});

test("a body that is not feedback is refused in a sentence", async () => {
  const { fetchImpl } = spy();
  const { status, body } = await answered(await handle(post("not json{"), { fetchImpl }));
  assert.equal(status, 400);
  assert.match(body.problem, /was not feedback/);
});

test("a database that will not take it says so, and does not claim success", async () => {
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "POST" && url.includes("aci_feedback")) {
      return { ok: false, status: 400, text: async () => "violates check constraint" };
    }
    return { ok: true, status: 200, text: async () => "", json: async () => [{ id: "p" }] };
  };
  const { status, body } = await answered(await handle(post(GOOD), { fetchImpl }));
  assert.equal(status, 500);
  assert.match(body.problem, /worth trying again/);
  assert.equal(body.done, undefined);
});
