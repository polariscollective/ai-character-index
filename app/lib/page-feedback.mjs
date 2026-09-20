/**
 * What a reader says about a whole page, with the page attached.
 *
 * Not a proposal and not a note on a paragraph. A proposal asks us to run
 * something; a note disagrees with a panel's reading of one paragraph. This is
 * the third thing, and the commonest: this page is broken, and here is what I
 * was looking at when it broke.
 *
 * Third route of the application open to the internet that writes, so it wears
 * the same three defences the other two wear, imported rather than copied: a
 * honeypot, a cap per source per hour counted against this table, and a size
 * cap read from the headers before a byte of the body is buffered.
 *
 * Private throughout. aci_feedback records what a reader permits because a note
 * about a paragraph might one day be shown beside it; a screenshot of somebody
 * else's browser never will be, so there is nothing to ask and nothing to
 * record.
 */
import { ADDRESS } from "./feedback.mjs";

export const TABLE = "aci_page_feedback";
export const BUCKET = "aci-page-feedback";

/* One source, one hour. The proposal form's number rather than the note
 * dialog's thirty, because every one of these carries a file. */
export const PER_HOUR = 10;

/* What a whole request may weigh, read from Content-Length before the body is
 * buffered. Under Vercel's own ceiling for a serverless request, with room over
 * the image cap for multipart framing and the text fields. */
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

/* What the image may weigh. The sender already halves and re-encodes anything
 * over this, so a request that carries more is not a browser of ours. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/* How long the link in the Slack message lives. After that the picture goes
 * from the channel's history and the portal link, which does not expire, is
 * what is left. A permanent link would mean a public bucket, and a capture of
 * somebody's browser can hold anything they had on screen. */
export const SIGNED_FOR = 7 * 24 * 3600;

/* Long enough for the longest honest answer, and bounded, because an unbounded
 * text field on an open route is a way to fill a database. page_url is the
 * large one on purpose: the reader's address carries a document, a publication
 * and a list of behaviours at once, and truncating it would hand an operator a
 * link that goes somewhere else. */
export const LIMITS = {
  comment: 5000, email: 200, page_url: 2000,
  user_agent: 500, viewport: 50, capture_method: 40,
};

const text = value => (typeof value === "string" ? value.trim() : "");

/**
 * What arrived, in the shape the rules are written against.
 *
 * One normalisation is a decision rather than tidying: a file part with no
 * bytes becomes no file at all. A browser that sends an empty part for a
 * screenshot the sender dropped is saying the same thing as a browser that
 * sends no part, and reading it as a broken image would refuse an honest
 * report.
 */
export function normalise(form) {
  const field = name => text(form?.get?.(name));
  const sent = form?.get?.("screenshot");
  const image = sent && typeof sent === "object"
             && typeof sent.arrayBuffer === "function" && sent.size > 0
    ? sent : null;
  return {
    comment: field("comment"),
    email: field("email"),
    page_url: field("page_url"),
    viewport: field("viewport"),
    user_agent: field("user_agent"),
    capture_method: field("capture_method"),
    website: field("website"),
    image,
  };
}

function tooLong(value, limit, what) {
  return value.length > limit ? `the ${what} is longer than ${limit} characters` : null;
}

/** Everything wrong with a report, at once. */
export function pageProblems(fields) {
  const found = [];
  if (!fields.comment) found.push("tell us what you see");
  if (!fields.email) found.push("your address is required, so we can write back");
  else if (!ADDRESS.test(fields.email)) {
    found.push("your address does not look like an address");
  }
  for (const [value, limit, what] of [
    [fields.comment, LIMITS.comment, "comment"],
    [fields.email, LIMITS.email, "address"],
    [fields.page_url, LIMITS.page_url, "page address"],
    [fields.user_agent, LIMITS.user_agent, "browser string"],
    [fields.viewport, LIMITS.viewport, "window size"],
    [fields.capture_method, LIMITS.capture_method, "capture method"],
  ]) {
    const long = tooLong(value, limit, what);
    if (long) found.push(long);
  }
  if (fields.image) {
    if (fields.image.size > MAX_IMAGE_BYTES) {
      found.push(`that screenshot is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
    }
    if (fields.image.type !== "image/png") found.push("a screenshot must be a PNG");
  }
  return found;
}
