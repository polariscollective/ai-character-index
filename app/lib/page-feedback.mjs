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
import { randomUUID } from "node:crypto";
import { ADDRESS } from "./feedback.mjs";
import { insert, signedLink, upload } from "./supabase.mjs";
import { forSlack, postToSlack } from "./slack.mjs";
import { callerAddress, recentFrom, sourceHash } from "./submissions.mjs";

export const TABLE = "aci_page_feedback";
export const BUCKET = "aci-page-feedback";

/* One source, one hour. The proposal form's number rather than the note
 * dialog's thirty, because every one of these carries a file. */
export const PER_HOUR = 10;

/* What a whole request may weigh, read from Content-Length before the body is
 * buffered. Under Vercel's own ceiling for a serverless request, with room over
 * the image cap for multipart framing and the text fields. */
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

/* What the image may weigh. The sender halves and re-encodes once, and sends
 * the words alone if it is still too large after that. */
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

  /* A scheme, not just a length. This value is rendered as a live href in
   * the portal, on an authenticated page, and the whole point of the column
   * is that an operator clicks it to go and look at the page being reported.
   * A javascript: URL there would run with their session. */
  if (!fields.page_url) found.push("the page address is missing");
  else {
    let parsed = null;
    try {
      parsed = new URL(fields.page_url);
    } catch {
      // Not a URL at all.
    }
    if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
      found.push("the page address must be an http or https address");
    }
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

/* A PNG's own first eight bytes. The part's declared type is the sender's
 * word for it, and the bucket's allowed_mime_types checks that same word, so
 * without this both gates read one claim. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/** Whether what arrived is not a PNG, whatever it says it is. */
export async function notAPng(image) {
  const head = new Uint8Array(await image.slice(0, 8).arrayBuffer());
  return PNG_SIGNATURE.some((byte, index) => head[index] !== byte);
}

/**
 * Record a report: the image first, then the row that describes it.
 *
 * That order is the other two routes' order and it is the point: a row never
 * points at an object that is not there. The Slack message is a courtesy the
 * caller pays afterwards, so a webhook that is missing or refuses leaves the
 * report intact.
 */
export async function record({ fields, hash }, { fetchImpl = fetch } = {}) {
  let path = null;
  if (fields.image) {
    // The date in the path so a year of reports is browsable, the uuid so two
    // captures of the same page never meet.
    path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.png`;
    await upload(BUCKET, path, await fields.image.arrayBuffer(), "image/png", fetchImpl);
  }
  const [row] = await insert(TABLE, [{
    page_url: fields.page_url,
    comment: fields.comment,
    submitter: fields.email,
    screenshot: path,
    capture_method: path ? fields.capture_method || null : null,
    viewport: fields.viewport,
    user_agent: fields.user_agent,
    source_hash: hash,
  }], fetchImpl);
  return row;
}

/* Long enough to judge a report from the message, short enough to read. */
const IN_SLACK = 700;

const TITLE = "Feedback on a page";

/**
 * Tell Slack. Returns what went wrong, or null; never throws.
 *
 * Two attempts rather than one, and the reason is Slack's own behaviour: it
 * fetches image_url itself and refuses the WHOLE message when a block displeases
 * it. A signed link it will not accept would otherwise cost us the notification
 * entirely, and a report that arrives without its picture is worth more than a
 * report that does not arrive.
 *
 * The address is in the message because the message goes to us. It is the one
 * place it appears outside the database, and it appears nowhere public.
 */
export async function announce(row = {}, fetchImpl = fetch, site = "") {
  const comment = String(row?.comment || "");
  const shown = comment.length > IN_SLACK ? `${comment.slice(0, IN_SLACK)}...` : comment;
  const said = [
    `*Said:* ${forSlack(shown)}`,
    `*On:* ${forSlack(row.page_url || "no page given")}`,
  ].join("\n");

  const base = [
    { type: "header", text: { type: "plain_text", text: TITLE } },
    { type: "section", text: { type: "mrkdwn", text: said } },
    { type: "context", elements: [{ type: "mrkdwn",
      text: `From ${forSlack(row.submitter || "no address given")}`
          + (row.viewport ? ` | ${forSlack(row.viewport)}` : "")
          + (row.screenshot ? "" : " | no screenshot")
          + ` | <${site}/admin/page-feedback|read it in the portal>` }] },
  ];

  let link = null;
  if (row.screenshot) {
    try {
      link = await signedLink(BUCKET, row.screenshot, SIGNED_FOR, fetchImpl);
    } catch {
      // A link that could not be minted is a message without a picture, which
      // is what the retry below sends anyway.
    }
  }

  if (link) {
    const withImage = [base[0], base[1],
      { type: "image", image_url: link, alt_text: "the page as the sender saw it" },
      base[2]];
    const refused = await postToSlack(TITLE, withImage, fetchImpl);
    if (!refused) return null;
    console.error(`page-feedback: slack refused the image block: ${refused}`);
  }
  return postToSlack(TITLE, base, fetchImpl);
}

const said = (status, outcome) => Response.json(outcome, { status });

/* What a reader is told when it worked. The same sentence the paragraph note
 * answers with, because it is the same promise: reading every one is a promise
 * we keep, and answering every one is not. */
const THANKS = "Thank you. We read every one.";

/**
 * The whole of the route, in one function so it can be tested without a server.
 *
 * Multipart in, JSON out. Multipart because the body carries a PNG, and
 * base64 in a JSON field would add a third to every request for nothing. JSON
 * out because the caller is a script on a page whose state cost something to
 * arrange, and the redirect /api/submit answers with would throw that away.
 */
export async function handle(request, { fetchImpl = fetch } = {}) {
  // Everything that can be judged from the headers is judged before a byte of
  // the body is read. Parsing a form buffers the whole of it, so a check that
  // runs afterwards has already paid for the request it means to refuse.
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_REQUEST_BYTES) {
    return said(413, {
      problem: `That is larger than this form takes. A screenshot may be up to `
             + `${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    });
  }

  const hash = sourceHash(callerAddress(request.headers));
  try {
    if (await recentFrom(hash, fetchImpl, TABLE) >= PER_HOUR) {
      return said(429, {
        problem: `That is ${PER_HOUR} within the hour from here, which is as many as this `
               + "form takes. The ones already sent are safe; try again later.",
      });
    }
  } catch (error) {
    // The rate-limit read failing must not refuse an honest report.
    console.error(`page-feedback: counting recent reports failed: ${error.message}`);
  }

  let sent;
  try {
    sent = await request.formData();
  } catch {
    return said(400, { problem: "That was not a report." });
  }

  const fields = normalise(sent);

  // Hidden from people, filled in by machinery that posts to every form it
  // finds. Answered exactly as a real report is, and recorded nowhere: saying
  // "refused" would teach the next attempt what to leave blank.
  if (fields.website) return said(200, { done: THANKS });

  const found = pageProblems(fields);
  if (found.length) return said(400, { problem: found.join("\n") });

  if (fields.image && await notAPng(fields.image)) {
    return said(400, { problem: "That screenshot is not a PNG." });
  }

  let row;
  try {
    row = await record({ fields, hash }, { fetchImpl });
  } catch (error) {
    console.error(`page-feedback: ${error.stack || error}`);
    return said(500, {
      problem: "Something on our side would not take that. Nothing was recorded, "
             + "so it is worth trying again.",
    });
  }

  const silent = await announce(row, fetchImpl, new URL(request.url).origin);
  if (silent) console.error(`page-feedback: ${row.id} recorded, not announced: ${silent}`);

  return said(200, { done: THANKS });
}
