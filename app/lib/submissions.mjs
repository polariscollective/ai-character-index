/**
 * What someone outside the collective proposes.
 *
 * Not the registry and not a run. A proposal is recorded, a person reads it, and
 * if it is worth running the operator registers it in the portal — which is
 * where the money is spent and where that decision belongs. Nothing here judges,
 * registers, or reaches the reader.
 *
 * This is the one route of the application that is open to the internet and
 * writes, so what it refuses matters as much as what it accepts.
 */
import { createHash, randomUUID } from "node:crypto";
import { insert, select, upload } from "./supabase.mjs";
import { locatorSafe, problems } from "./locator-safe.mjs";

export const BUCKET = "aci-submissions";

/* The largest specification the index carries is a tenth of this. */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

/* One source, one hour. Enough for someone proposing a handful of behaviours in
 * a sitting, and not enough to fill a table. */
export const PER_HOUR = 10;

/* What a whole request may weigh, read from its Content-Length before a byte of
 * it is buffered. The document cap is 2 MB and the rest of the form is a few
 * kilobytes; the slack is for multipart framing. The platform caps a request
 * body too, but a limit we enforce ourselves is one we can reason about. */
export const MAX_REQUEST_BYTES = 3 * 1024 * 1024;

/* Fields long enough for the longest honest answer, and bounded, because an
 * unbounded text field on an open route is a way to fill a database. */
const LIMITS = { name: 200, version: 100, url: 500, prose: 5000, email: 200 };

/**
 * Who this came from, as something that cannot be read back.
 *
 * The salt is the service key, which this process already holds and never
 * discloses: without one, a hash of an address is an address, since the space of
 * addresses is small enough to enumerate.
 */
export function sourceHash(address) {
  return createHash("sha256")
    .update(`${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}:${address || "unknown"}`)
    .digest("hex");
}

/**
 * The caller's address, from the most trustworthy header that carries it.
 *
 * Order matters and this is the whole of the rate limit's integrity. A client
 * can send its own `x-forwarded-for`, and the usual "leftmost entry is the
 * client" reading then takes whatever the client put there, which lets one
 * source look like a thousand. The platform's own headers cannot be forged
 * that way, so they are asked first; `x-forwarded-for` is read from the RIGHT,
 * where a proxy appends, rather than the left, where a client can prepend.
 */
export function callerAddress(headers) {
  for (const name of ["x-vercel-forwarded-for", "x-real-ip"]) {
    const value = (headers.get(name) || "").trim();
    if (value) return value;
  }
  const chain = (headers.get("x-forwarded-for") || "")
    .split(",").map(entry => entry.trim()).filter(Boolean);
  return chain.length ? chain[chain.length - 1] : "unknown";
}

function tooLong(value, limit, what) {
  return value.length > limit ? `${what} is longer than ${limit} characters` : null;
}

/** Everything wrong with a behaviour proposal, at once. */
export function behaviourProblems(fields) {
  const found = [];
  for (const [key, limit, what, required] of [
    ["name", LIMITS.name, "the behaviour's name", true],
    ["query", LIMITS.prose, "what the judges should be asked", true],
    ["boundary", LIMITS.prose, "where the construct stops", true],
    ["why", LIMITS.prose, "why it is worth testing", false],
    ["email", LIMITS.email, "your address", false],
  ]) {
    const value = fields[key] || "";
    if (required && !value) found.push(`${what} is required`);
    const long = tooLong(value, limit, what);
    if (long) found.push(long);
  }
  return found;
}

/** Everything wrong with a specification proposal, at once. */
export function specificationProblems(fields, document) {
  const found = problems([
    [locatorSafe, fields.name || "", "the document's name"],
    [locatorSafe, fields.version || "", "the version label"],
  ]);
  if (!fields.organisation) found.push("the organisation that published it is required");
  if (!fields.source_url) {
    found.push("a link to the published source is required: a stored version says where it came from");
  }
  for (const [key, limit, what] of [
    ["organisation", LIMITS.name, "the organisation"],
    ["source_url", LIMITS.url, "the source link"],
    ["why", LIMITS.prose, "why it belongs in the index"],
    ["email", LIMITS.email, "your address"],
  ]) {
    const long = tooLong(fields[key] || "", limit, what);
    if (long) found.push(long);
  }
  if (!document || !document.size) {
    found.push("the document itself is required, as a markdown file");
  } else if (document.size > MAX_DOCUMENT_BYTES) {
    found.push(`the document is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`);
  }
  return found;
}

/* A NUL byte is the shortest proof that what arrived is not a document. */
const NOT_TEXT = /\u0000/;

/** Text, or a refusal. Nothing is served from the bucket, but it is not a place for binaries. */
export function asMarkdown(text) {
  if (NOT_TEXT.test(text)) return "that file is not text";
  if (!text.trim()) return "that file is empty";
  return null;
}

/** How many proposals this source has made in the last hour. */
export async function recentFrom(hash, fetchImpl = fetch) {
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const rows = await select(
    "aci_submissions",
    `select=id&source_hash=eq.${hash}&created_at=gte.${since}`, fetchImpl);
  return rows.length;
}

/**
 * Record a proposal: the document first, then the row that describes it.
 *
 * The row is the durable act and the Slack message is a courtesy, which is why
 * announcing is a separate call the caller makes afterwards. A webhook that is
 * missing or refuses must leave the proposal intact.
 */
export async function record({ kind, proposal, document, submitter, hash },
                             { fetchImpl = fetch } = {}) {
  let path = null;
  if (document) {
    // The date in the path so a year of proposals is browsable, the uuid so two
    // documents of the same name never meet.
    path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.md`;
    await upload(BUCKET, path, document, "text/markdown", fetchImpl);
  }
  const [row] = await insert("aci_submissions", [{
    kind, proposal, document: path, submitter: submitter || "", source_hash: hash,
  }], fetchImpl);
  return row;
}

/* Slack reads a few sequences out of message text, and one of them is a way to
 * ping everyone in the channel. This form is open to the internet, so a proposal
 * could carry <!channel> and would otherwise send it. Escaping the three
 * characters Slack asks for is also what stops that being parsed at all. */
function forSlack(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Long enough to judge a proposal from the message, short enough to read. */
const IN_SLACK = 700;

const FIELDS = {
  behaviour: [["name", "Called"], ["query", "What it requires"],
              ["boundary", "Where it stops"], ["why", "Why it matters"]],
  specification: [["organisation", "Published by"], ["name", "Called"],
                  ["version", "Version"], ["source_url", "Source"],
                  ["why", "Why it belongs"]],
};

/**
 * Tell Slack. Returns what went wrong, or null; never throws.
 *
 * The proposal is already recorded by the time this runs, so a failure here is a
 * message nobody got rather than work nobody has. That is why the caller records
 * first and announces second, and why this swallows everything.
 *
 * `SLACK_WEBHOOK_URL` is an incoming webhook, the same shape the organisation's
 * other notifications use. Without it the proposal is still recorded and the log
 * says who was not told.
 */
export async function announce(row, fetchImpl = fetch, site = "") {
  const hook = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!hook) return "SLACK_WEBHOOK_URL is not set";

  const proposal = row.proposal || {};
  const title = row.kind === "behaviour"
    ? `New behaviour proposed: ${proposal.name || "untitled"}`
    : `New document proposed: ${proposal.organisation || "unknown"}, `
      + `${proposal.name || "untitled"}`;

  const lines = (FIELDS[row.kind] || [])
    .filter(([key]) => proposal[key])
    .map(([key, label]) => {
      const value = String(proposal[key]);
      const shown = value.length > IN_SLACK ? `${value.slice(0, IN_SLACK)}...` : value;
      return `*${label}:* ${forSlack(shown)}`;
    });

  const blocks = [
    { type: "header", text: { type: "plain_text", text: forSlack(title).slice(0, 150) } },
    { type: "section", text: { type: "mrkdwn", text: lines.join("\n") || "_no fields_" } },
    { type: "context", elements: [{ type: "mrkdwn",
      text: `From ${forSlack(row.submitter || "no address given")}`
          + (row.document ? " | a document is attached, readable in the portal" : "")
          + ` | <${site}/admin/submissions|read it in the portal>` }] },
  ];

  try {
    const response = await fetchImpl(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` is the notification and the fallback for clients that do not
      // render blocks. Sending blocks without it makes a silent push.
      body: JSON.stringify({ text: forSlack(title), blocks }),
    });
    return response.ok ? null : `slack returned ${response.status}`;
  } catch (error) {
    return `slack unreachable: ${error.message}`;
  }
}
