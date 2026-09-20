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
  normalise, pageProblems,
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
