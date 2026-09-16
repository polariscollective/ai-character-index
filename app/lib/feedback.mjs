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
import { insert } from "./supabase.mjs";
import { callerAddress, recentFrom, sourceHash } from "./submissions.mjs";
import { forSlack, postToSlack } from "./slack.mjs";
import { isPublicationId, publicationColumn } from "./publications.mjs";

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
 * is private, because the default must be the one that shows nothing -- and
 * that is the whole of the rule: a non-empty string is kept as given, for
 * `feedbackProblems` to judge, and anything else, sent by mistake or by
 * malice, becomes "private" rather than being silently accepted as whatever it
 * was. And a name typed before the reader chose "without my name" is dropped,
 * because the choice they ended on is the choice: the database says the same
 * thing with a check constraint, and this is what keeps the two from
 * disagreeing.
 *
 * A body that is not an object -- a bare `null`, a number, a string -- is
 * read as an empty submission rather than read at all: a default parameter
 * only stands in for `undefined`, and a literal JSON `null` would otherwise
 * reach `sent.visibility` and throw on a public route.
 */
export function normalise(sent) {
  const fields = sent && typeof sent === "object" ? sent : {};
  const visibility = text(fields.visibility) || "private";
  const vote = text(fields.vote);
  return {
    locator: text(fields.locator),
    behaviours: (Array.isArray(fields.behaviours) ? fields.behaviours : [])
      .map(name => (name === null || name === undefined ? "" : String(name).trim()))
      .filter(Boolean),
    vote: vote || null,
    comment: text(fields.comment),
    email: text(fields.email),
    visibility,
    display_name: visibility === "attributed" ? text(fields.display_name) : "",
    publication: text(fields.publication),
    website: text(fields.website),
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

/**
 * Which publication this is about.
 *
 * Resolved here rather than taken from the page. A locator names the text and
 * carries its version, so the text needs no help; what it does not name is the
 * reading laid over it, which is a publication's. A pin is honoured when it
 * names a publication that exists, and anything else falls through to the
 * current one, resolved exactly as the reader's payload route resolves it.
 */
export async function resolvePublication(pin, fetchImpl = fetch) {
  if (isPublicationId(pin)) {
    const id = await publicationColumn("id", pin, fetchImpl);
    if (id) return id;
  }
  return publicationColumn("id", null, fetchImpl);
}

/** Write the row. The durable act; Slack is a courtesy the caller pays after. */
export async function record({ fields, publication_id, hash }, { fetchImpl = fetch } = {}) {
  const [row] = await insert(TABLE, [{
    publication_id,
    locator: fields.locator,
    document_id: documentOf(fields.locator),
    behaviours: fields.behaviours,
    vote: fields.vote,
    comment: fields.comment,
    submitter: fields.email,
    display_name: fields.display_name,
    visibility: fields.visibility,
    source_hash: hash,
  }], fetchImpl);
  return row;
}

/* Long enough to judge a comment from the message, short enough to read. */
const IN_SLACK = 700;

const THUMB = { up: "thumb up", down: "thumb down" };

/**
 * Tell Slack. Returns what went wrong, or null; never throws.
 *
 * The row is already written by the time this runs, so a failure here is a
 * message nobody got rather than words nobody has. That is why the caller
 * records first and announces second, and why this swallows everything.
 *
 * The address is in the message because the message goes to us. It is the one
 * place it appears outside the database, and it appears nowhere public.
 */
export async function announce(row, fetchImpl = fetch, site = "") {
  const comment = String(row.comment || "");
  const shown = comment.length > IN_SLACK ? `${comment.slice(0, IN_SLACK)}...` : comment;
  const lines = [
    `*Paragraph:* \`${forSlack(row.locator)}\``,
    ...(row.behaviours?.length ? [`*Highlighted for:* ${forSlack(row.behaviours.join(", "))}`] : []),
    ...(row.vote ? [`*Verdict:* ${THUMB[row.vote] || forSlack(row.vote)}`] : []),
    ...(shown ? [`*Said:* ${forSlack(shown)}`] : []),
  ];

  const title = row.vote
    ? `Feedback on a paragraph (${THUMB[row.vote] || row.vote})`
    : "Feedback on a paragraph";

  const blocks = [
    { type: "header", text: { type: "plain_text", text: forSlack(title).slice(0, 150) } },
    { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
    { type: "context", elements: [{ type: "mrkdwn",
      text: `From ${forSlack(row.submitter || "no address given")}`
          + ` | may be shown: ${forSlack(row.visibility || "private")}`
          + (row.display_name ? ` as ${forSlack(row.display_name)}` : "")
          + ` | <${site}/admin/feedback|read it in the portal>` }] },
  ];

  return postToSlack(title, blocks, fetchImpl);
}

const said = (status, outcome) => Response.json(outcome, { status });

/* What a reader is told when it worked. One sentence, and it does not promise a
 * reply: reading every one is a promise we keep, answering every one is not. */
const THANKS = "Thank you. We read every one.";

/**
 * The whole of the route, in one function so it can be tested without a server.
 *
 * JSON in, JSON out, where /api/submit takes a form and answers with a 303. The
 * difference is the surface: the proposal page is a page, and a redirect there
 * means the outcome survives a reload with no JavaScript at all. The reader is
 * an application that has already fetched three payloads, and a navigation
 * would throw away the document position, the behaviour selection and the
 * compare view the reader had arranged.
 */
export async function handle(request, { fetchImpl = fetch } = {}) {
  // Everything that can be judged from the headers is judged before a byte of
  // the body is read. Parsing buffers the whole of it, so a check that runs
  // afterwards has already paid for the request it means to refuse.
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_REQUEST_BYTES) {
    return said(413, { problem: "That is larger than this form takes." });
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
    // The rate-limit read failing must not refuse honest feedback.
    console.error(`feedback: counting recent submissions failed: ${error.message}`);
  }

  let sent;
  try {
    sent = await request.json();
  } catch {
    return said(400, { problem: "That was not feedback." });
  }

  const fields = normalise(sent);

  // Hidden from people, filled in by machinery that posts to every form it
  // finds. Answered exactly as a real submission is, and recorded nowhere:
  // saying "refused" would teach the next attempt what to leave blank.
  if (fields.website) return said(200, { done: THANKS });

  const found = feedbackProblems(fields);
  if (found.length) return said(400, { problem: found.join("\n") });

  let publication_id = null;
  try {
    publication_id = await resolvePublication(fields.publication, fetchImpl);
  } catch (error) {
    // Which publication it was about is worth having and not worth losing the
    // words over.
    console.error(`feedback: resolving the publication failed: ${error.message}`);
  }

  let row;
  try {
    row = await record({ fields, publication_id, hash }, { fetchImpl });
  } catch (error) {
    console.error(`feedback: ${error.stack || error}`);
    return said(500, {
      problem: "Something on our side would not take that. Nothing was recorded, "
             + "so it is worth trying again.",
    });
  }

  const silent = await announce(row, fetchImpl, new URL(request.url).origin);
  if (silent) console.error(`feedback: ${row.id} recorded, not announced: ${silent}`);

  return said(200, { done: THANKS });
}
