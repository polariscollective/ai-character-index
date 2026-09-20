/**
 * The page-feedback route's library. The third door of this application open to
 * the internet that writes, so what it refuses is what these tests are about.
 * No network: every call takes an injected fetch.
 * Run: node --test app/lib/__tests__/page-feedback.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIMITS, MAX_IMAGE_BYTES, MAX_REQUEST_BYTES, PER_HOUR,
  normalise, pageProblems, announce, record, BUCKET, handle,
} from "../page-feedback.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

/** A form in the shape the browser sends, with only the given fields changed. */
function form(changed = {}) {
  const data = new FormData();
  const fields = {
    comment: "The table runs off the right of my phone.",
    email: "reader@example.org",
    page_url: "https://example.org/overview?view=governance",
    viewport: "390x844 @3",
    user_agent: "Mozilla/5.0 (iPhone)",
    capture_method: "html2canvas",
    ...changed,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null) data.set(key, value);
  }
  return data;
}

/** A PNG part of a given size, which is all these rules look at. */
function png(bytes) {
  return new File([new Uint8Array(bytes)], "page.png", { type: "image/png" });
}

test("a report with words, an address and a picture is accepted", () => {
  const data = form();
  data.set("screenshot", png(1024));
  assert.deepEqual(pageProblems(normalise(data)), []);
});

test("a report with no picture is still a report", () => {
  assert.deepEqual(pageProblems(normalise(form())), []);
  assert.equal(normalise(form()).image, null);
});

test("words are required: a picture on its own is a puzzle", () => {
  const data = form({ comment: "   " });
  data.set("screenshot", png(1024));
  assert.deepEqual(pageProblems(normalise(data)), ["tell us what you see"]);
});

test("the address is required, because a reply needs somewhere to go", () => {
  assert.deepEqual(pageProblems(normalise(form({ email: "" }))),
                   ["your address is required, so we can write back"]);
});

test("an address that is not an address is refused before it is stored", () => {
  for (const wrong of ["reader", "reader@", "@example.org", "a b@example.org"]) {
    assert.deepEqual(pageProblems(normalise(form({ email: wrong }))),
                     ["your address does not look like an address"], wrong);
  }
});

test("every field is bounded, and every problem is reported at once", () => {
  const found = pageProblems(normalise(form({
    comment: "x".repeat(LIMITS.comment + 1),
    email: `${"x".repeat(LIMITS.email)}@example.org`,
    page_url: `https://example.org/${"x".repeat(LIMITS.page_url)}`,
    user_agent: "x".repeat(LIMITS.user_agent + 1),
    viewport: "x".repeat(LIMITS.viewport + 1),
    capture_method: "x".repeat(LIMITS.capture_method + 1),
  })));
  assert.equal(found.length, 6, JSON.stringify(found));
});

test("an image larger than the cap is refused, and named as the reason", () => {
  const data = form();
  data.set("screenshot", png(MAX_IMAGE_BYTES + 1));
  assert.deepEqual(pageProblems(normalise(data)),
                   ["that screenshot is larger than 3 MB"]);
});

test("a screenshot part that is not a PNG is refused", () => {
  const data = form();
  data.set("screenshot", new File(["x"], "page.gif", { type: "image/gif" }));
  assert.deepEqual(pageProblems(normalise(data)), ["a screenshot must be a PNG"]);
});

test("an empty file part is no file at all rather than a bad one", () => {
  const data = form();
  data.set("screenshot", new File([], "page.png", { type: "image/png" }));
  assert.equal(normalise(data).image, null);
  assert.deepEqual(pageProblems(normalise(data)), []);
});

test("the honeypot is read and never confused with a real field", () => {
  assert.equal(normalise(form()).website, "");
  assert.equal(normalise(form({ website: "http://spam" })).website, "http://spam");
});

test("the caps are the numbers the design fixed", () => {
  assert.equal(PER_HOUR, 10);
  assert.equal(MAX_REQUEST_BYTES, 4 * 1024 * 1024);
  assert.equal(MAX_IMAGE_BYTES, 3 * 1024 * 1024);
});

/** A fetch that records what it was asked and answers what it is told to. */
function fakeFetch(answers = {}) {
  const seen = [];
  const impl = async (url, options = {}) => {
    seen.push({ url: String(url), options });
    for (const [fragment, answer] of Object.entries(answers)) {
      if (String(url).includes(fragment)) return answer();
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  impl.seen = seen;
  return impl;
}

const ROW = () => new Response(JSON.stringify([{ id: "row-1" }]), {
  status: 201, headers: { "content-type": "application/json" },
});

test("the image lands in the bucket before the row that describes it", async () => {
  const order = [];
  const impl = fakeFetch({
    "/storage/v1/object/aci-page-feedback/": () => {
      order.push("upload");
      return new Response("{}", { status: 200 });
    },
    "/rest/v1/aci_page_feedback": () => {
      order.push("insert");
      return ROW();
    },
  });
  const data = form();
  data.set("screenshot", png(64));
  const row = await record({ fields: normalise(data), hash: "H" }, { fetchImpl: impl });
  assert.deepEqual(order, ["upload", "insert"]);
  assert.equal(row.id, "row-1");
  const wrote = JSON.parse(impl.seen.find(c => c.url.includes("/rest/v1/")).options.body)[0];
  assert.match(wrote.screenshot, /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.png$/);
  assert.equal(wrote.capture_method, "html2canvas");
  assert.equal(wrote.source_hash, "H");
  assert.equal(wrote.submitter, "reader@example.org");
});

test("a report with no image writes a null path and uploads nothing", async () => {
  const impl = fakeFetch({ "/rest/v1/aci_page_feedback": ROW });
  await record({ fields: normalise(form()), hash: "H" }, { fetchImpl: impl });
  assert.equal(impl.seen.filter(c => c.url.includes("/storage/")).length, 0);
  const wrote = JSON.parse(impl.seen[0].options.body)[0];
  assert.equal(wrote.screenshot, null);
  assert.equal(wrote.capture_method, null);
});

test("Slack carries the picture, and a refused message is sent again without it", async () => {
  let posts = 0;
  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/x";
  const impl = fakeFetch({
    "/storage/v1/object/sign/": () => new Response(
      JSON.stringify({ signedURL: "/object/sign/aci-page-feedback/a.png?token=t" }),
      { status: 200, headers: { "content-type": "application/json" } }),
    "hooks.slack.test": () => {
      posts += 1;
      return new Response("invalid_blocks", { status: posts === 1 ? 400 : 200 });
    },
  });
  const silent = await announce(
    { id: "row-1", page_url: "https://example.org/overview", comment: "Broken.",
      submitter: "reader@example.org", screenshot: "2026-09-20/a.png",
      viewport: "390x844 @3" },
    impl, "https://example.org");
  assert.equal(silent, null);
  assert.equal(posts, 2);
  const [first, second] = impl.seen.filter(c => c.url.includes("hooks.slack.test"))
    .map(c => JSON.parse(c.options.body));
  assert.ok(first.blocks.some(b => b.type === "image"), "the first try carries the image");
  assert.ok(!second.blocks.some(b => b.type === "image"), "the second does not");
  assert.ok(second.blocks.some(b => JSON.stringify(b).includes("/admin/page-feedback")));
});

test("a stranger's words cannot ping the channel", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/x";
  const impl = fakeFetch({ "hooks.slack.test": () => new Response("ok", { status: 200 }) });
  await announce({ id: "r", page_url: "https://example.org/", comment: "<!channel> look",
                   submitter: "spam@example.org" }, impl, "https://example.org");
  const body = impl.seen.find(c => c.url.includes("hooks.slack.test")).options.body;
  assert.ok(!body.includes("<!channel>"), body);
  assert.ok(body.includes("&lt;!channel&gt;"), body);
});

test("no webhook is a message nobody got, not an error thrown at the caller", async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  const silent = await announce({ id: "r", page_url: "https://example.org/", comment: "x" },
                                fakeFetch(), "https://example.org");
  assert.equal(silent, "SLACK_WEBHOOK_URL is not set");
});

/** A request in the shape the browser sends, without a server. */
function request(data, headers = {}) {
  return new Request("https://example.org/api/page-feedback", {
    method: "POST", body: data, headers,
  });
}

const THANKS = "Thank you. We read every one.";

test("a good report is recorded and answered with one sentence", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/x";
  const impl = fakeFetch({
    "/rest/v1/aci_page_feedback?select=id": () => new Response("[]", { status: 200 }),
    "/rest/v1/aci_page_feedback": ROW,
    "hooks.slack.test": () => new Response("ok", { status: 200 }),
  });
  const data = form();
  data.set("screenshot", png(64));
  const answer = await handle(request(data), { fetchImpl: impl });
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { done: THANKS });
});

test("a body declared larger than the cap is refused before it is read", async () => {
  // A string body rather than a FormData, because what is under test is the
  // header and not the parse: the route must refuse before it buffers. This is
  // the idiom feedback.test.mjs already uses for its own cap.
  const impl = fakeFetch();
  const answer = await handle(new Request("https://example.org/api/page-feedback", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x",
               "content-length": String(MAX_REQUEST_BYTES + 1) },
    body: "--x--\r\n",
  }), { fetchImpl: impl });
  assert.equal(answer.status, 413);
  assert.match((await answer.json()).problem, /larger than this form takes/);
  assert.equal(impl.seen.length, 0, "nothing was asked of the database");
});

test("the eleventh report in an hour from one place is refused", async () => {
  const impl = fakeFetch({
    "/rest/v1/aci_page_feedback?select=id": () => new Response(
      JSON.stringify(Array.from({ length: PER_HOUR }, (_, i) => ({ id: i }))),
      { status: 200, headers: { "content-type": "application/json" } }),
  });
  const answer = await handle(request(form()), { fetchImpl: impl });
  assert.equal(answer.status, 429);
  assert.match((await answer.json()).problem, /already sent are safe/);
});

test("the rate-limit read failing does not refuse an honest report", async () => {
  const impl = fakeFetch({
    "/rest/v1/aci_page_feedback?select=id": () => new Response("no", { status: 500 }),
    "/rest/v1/aci_page_feedback": ROW,
  });
  const answer = await handle(request(form()), { fetchImpl: impl });
  assert.equal(answer.status, 200);
});

test("the honeypot is answered as a success and recorded nowhere", async () => {
  const impl = fakeFetch({ "/rest/v1/aci_page_feedback": ROW });
  const answer = await handle(request(form({ website: "http://spam" })), { fetchImpl: impl });
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { done: THANKS });
  assert.equal(impl.seen.filter(c => c.options.method === "POST").length, 0);
});

test("a report with problems is refused with every problem at once", async () => {
  const answer = await handle(request(form({ comment: "", email: "nope" })),
                              { fetchImpl: fakeFetch() });
  assert.equal(answer.status, 400);
  const { problem } = await answer.json();
  assert.match(problem, /tell us what you see/);
  assert.match(problem, /does not look like an address/);
});

test("a body that is not a form is refused rather than thrown", async () => {
  const answer = await handle(
    new Request("https://example.org/api/page-feedback",
                { method: "POST", body: "{}", headers: { "content-type": "application/json" } }),
    { fetchImpl: fakeFetch() });
  assert.equal(answer.status, 400);
});

test("a database that will not take it says so, and says nothing was kept", async () => {
  const impl = fakeFetch({
    "/rest/v1/aci_page_feedback?select=id": () => new Response("[]", { status: 200 }),
    "/rest/v1/aci_page_feedback": () => new Response("no", { status: 500 }),
  });
  const answer = await handle(request(form()), { fetchImpl: impl });
  assert.equal(answer.status, 500);
  assert.match((await answer.json()).problem, /Nothing was recorded/);
});
