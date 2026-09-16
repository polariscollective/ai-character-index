/**
 * The feedback route's library. The second door of this application open to the
 * internet that writes, so what it refuses is what these tests are about.
 * Run: node --test app/lib/__tests__/feedback.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIMITS, MAX_BEHAVIOURS, MAX_REQUEST_BYTES, PER_HOUR, VISIBILITIES,
  documentOf, feedbackProblems, normalise,
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
  const named = feedbackProblems(normalise({
    ...GOOD, visibility: "attributed", display_name: "n".repeat(LIMITS.name + 1) }));
  assert.match(named.join(" "), /name to show is longer than 100/);
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
