/**
 * What a reader says about one paragraph.
 *
 * Not a proposal. A proposal is somebody asking us to run something, and an
 * operator retypes it into the portal; this is somebody telling us that a
 * paragraph reads wrong, or agreeing with one click. Nothing here registers,
 * judges, spends or publishes.
 *
 * This is the second route of the application open to the internet that writes,
 * so what it refuses matters as much as what it accepts. The defences are the
 * proposal form's, because they were built for exactly this: a honeypot, a cap
 * per source per hour, a cap on every field, and a size cap read from the
 * headers before a byte of the body is buffered.
 */
import { insert, select } from "./supabase.mjs";
import { callerAddress, recentFrom, sourceHash } from "./submissions.mjs";
import { forSlack, postToSlack } from "./slack.mjs";
import { currentPublication, isPublicationId } from "./publications.mjs";

export const TABLE = "aci_feedback";

/* One source, one hour. Three times the proposal form's, because a reader
 * working through a document may honestly have something to say about a dozen
 * paragraphs in a sitting, and nothing here costs money to act on. */
export const PER_HOUR = 30;

/* What a whole request may weigh, read from Content-Length before the body is
 * buffered. There is no file here and the caps below add up to a few kilobytes;
 * this is slack, not a second cap. */
export const MAX_REQUEST_BYTES = 64 * 1024;

export const VISIBILITIES = ["private", "anonymous", "attributed"];

/* Long enough for the longest honest answer, and bounded, because an unbounded
 * text field on an open route is a way to fill a database. */
export const LIMITS = { comment: 5000, email: 200, name: 100, locator: 500, behaviour: 200 };

/* More behaviours than the reader's menu holds. A paragraph cited by twenty is
 * already a paragraph nobody selected carefully. */
export const MAX_BEHAVIOURS = 20;

/* Enough to refuse what is plainly not an address. Nothing here verifies that
 * an address exists: the proposal form made the same call, and a submission is
 * judged on what it says. */
const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const text = value => (typeof value === "string" ? value.trim() : "");

/** The document a locator points into: its head, which is the document id. */
export function documentOf(locator) {
  return String(locator || "").split(" > ")[0].trim();
}

/**
 * What arrived, in the shape the rules are written against.
 *
 * Two normalisations are decisions rather than tidying. An unstated visibility
 * is private, because the default must be the one that shows nothing. And a
 * name typed before the reader chose "without my name" is dropped, because the
 * choice they ended on is the choice: the database says the same thing with a
 * check constraint, and this is what keeps the two from disagreeing.
 */
export function normalise(sent = {}) {
  const visibility = VISIBILITIES.includes(sent.visibility) || sent.visibility
    ? text(sent.visibility) || "private"
    : "private";
  const vote = text(sent.vote);
  return {
    locator: text(sent.locator),
    behaviours: (Array.isArray(sent.behaviours) ? sent.behaviours : [])
      .map(name => (name === null || name === undefined ? "" : String(name).trim()))
      .filter(Boolean),
    vote: vote || null,
    comment: text(sent.comment),
    email: text(sent.email),
    visibility,
    display_name: visibility === "attributed" ? text(sent.display_name) : "",
    publication: text(sent.publication),
    website: text(sent.website),
  };
}

function tooLong(value, limit, what) {
  return value.length > limit ? `the ${what} is longer than ${limit} characters` : null;
}

/** Everything wrong with a submission, at once. */
export function feedbackProblems(fields) {
  const found = [];
  if (!fields.locator) found.push("a paragraph must be named");
  if (!fields.comment && !fields.vote) found.push("write a comment or leave a thumb");
  if (fields.vote && fields.vote !== "up" && fields.vote !== "down") {
    found.push("a thumb is either up or down");
  }
  if (!fields.email) found.push("your address is required, so we can write back");
  else if (!ADDRESS.test(fields.email)) found.push("your address does not look like an address");
  if (!VISIBILITIES.includes(fields.visibility)) {
    found.push(`how we may use this must be one of ${VISIBILITIES.join(", ")}`);
  }
  if (fields.visibility === "attributed" && !fields.display_name) {
    found.push("the name to show is required, or choose to be shown without a name");
  }
  for (const [value, limit, what] of [
    [fields.comment, LIMITS.comment, "comment"],
    [fields.email, LIMITS.email, "address"],
    [fields.display_name, LIMITS.name, "name to show"],
    [fields.locator, LIMITS.locator, "locator"],
  ]) {
    const long = tooLong(value, limit, what);
    if (long) found.push(long);
  }
  if (fields.behaviours.length > MAX_BEHAVIOURS) {
    found.push("that is more behaviours than a paragraph can carry");
  }
  if (fields.behaviours.some(name => name.length > LIMITS.behaviour)) {
    found.push(`a behaviour's name is longer than ${LIMITS.behaviour} characters`);
  }
  return found;
}
