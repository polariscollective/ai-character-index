/**
 * The reader's three routes, answered from committed files.
 *
 * The browser walkers test the reader, not the database: what they must prove is
 * that the page resolves a publication, falls through a dead pin and renders
 * what it is given. Pointing them at Supabase would make them need credentials
 * to run and would fail on a network blip, testing something else. The
 * provenance verifier is what tests the database, and it does not need a
 * browser.
 *
 * The shapes here are the shapes app/lib/publications.mjs returns, so a reader
 * that works against these works against the routes.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Buffer } from "node:buffer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id the current publication answers to, so a pin can be exercised. */
export const CURRENT_PUBLICATION = "3114dd65-c6f2-5cb3-bf98-af5b314381c3";

/**
 * A second publication, answered only to a pin: a draft nobody has made public,
 * carrying documents the current publication does not. Documents are per
 * publication, so a reader pinned to it must read that publication's documents
 * as well as its payload; one publication alone could not tell the two apart.
 */
export const DRAFT_PUBLICATION = "8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37";

/**
 * A publication on the depth scale of ten, answered only to a pin: the current
 * publication's documents and links under a payload out of ten, which carries
 * an assessment of one of its two documents. Only its payload differs, so it
 * reads the other two files from the current publication's directory.
 */
export const TEN_PUBLICATION = "c3a5e0d2-9f47-4b8e-a1d6-5e2f7b9c0a14";

/** Where each publication's files sit, relative to the reader's data directory. */
const PUBLICATION_DIRS = { [CURRENT_PUBLICATION]: ".", [DRAFT_PUBLICATION]: "draft",
                           [TEN_PUBLICATION]: "ten" };

/** The files a publication shares with the current one rather than carrying its own. */
const SHARED_WITH_THE_CURRENT = { [TEN_PUBLICATION]: new Set(["documents.json", "links.json"]) };


/**
 * Answers /api/reader/documents, /api/reader/links, /api/reader/payload and the
 * two boards, /api/reader/constitutions and /api/reader/governance,
 * or returns false so the caller falls through to its static handler.
 *
 * `dataDir` is the reader's data directory in whatever tree is being served,
 * so a staged user-extended site answers from its own payloads.
 */
export async function serveReaderRoute(request, response, dataDir, payloadName) {
  const url = new URL(request.url, "http://x");
  if (!url.pathname.startsWith("/api/reader/")) return false;

  const pinned = url.searchParams.get("publication");
  const which = url.pathname.slice("/api/reader/".length);
  if (which === "behaviours") {
    // What a behaviour is, read from the registry rather than the payload. The
    // fixture's two carry the states that matter: one defined with a boundary,
    // one defined nowhere.
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      "defined-behaviour": {
        name: "Defined behaviour", group: "Behaviours under test",
        query: "The document should say what it means.", described: null,
        boundary: "The construct is whether the text states its own meaning. "
                  + "NOT this behaviour: whether the meaning is a good one.",
        source: "tests/fixtures (synthetic)", defined: true, judged: true,
      },
      "undefined-behaviour": {
        name: "Undefined behaviour", group: "Behaviours under test",
        query: null, described: "Tracked, and written for no panel.",
        boundary: null, source: null, defined: false, judged: false,
      },
    }));
    return true;
  }
  /* The two boards of the front page, as a publication freezes them: the site's
   * own files, for the current publication. A pinned publication of the fixture
   * carries none, which is the case a walker checks the page says so for. */
  if (which === "constitutions" || which === "governance") {
    if (pinned !== null) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "no such publication" }));
      return true;
    }
    const body = await readFile(new URL(`../site/${which}.json`, import.meta.url));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(body);
    return true;
  }
  const name = payloadName;
  const file = which === "documents" ? "documents.json"
    : which === "links" ? "links.json"
    : which === "payload" ? `${name}.json`
    : null;
  if (file === null) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "no such route" }));
    return true;
  }

  const pin = pinned;
  if (pin !== null && !UUID.test(pin)) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "publication must be a uuid" }));
    return true;
  }
  if (pin !== null && !Object.hasOwn(PUBLICATION_DIRS, pin)) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "no such publication" }));
    return true;
  }

  try {
    const shared = SHARED_WITH_THE_CURRENT[pin]?.has(file);
    const dir = join(dataDir, shared ? "." : PUBLICATION_DIRS[pin ?? CURRENT_PUBLICATION]);
    const body = await readFile(join(dir, file));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "nothing published yet" }));
  }
  return true;
}

/** The body of the most recent POST /api/feedback, or null before one arrives.
 * Module-level rather than returned from serveFeedbackRoute, because the
 * walker that drives the fixture server reads it back well after the request
 * that set it -- through a browser click, not a return value it could hold on
 * to. */
let lastFeedback = null;

/**
 * Answers POST /api/feedback the way app/api/feedback does when it accepts:
 * `{done}`, never `{problem}`. This is a fixture for the browser walkers, not
 * a rebuild of the route's own rules -- those are tested under node, against
 * app/lib/feedback.mjs, with no browser and no database. What this exists for
 * is letting a walker prove what the dialog actually sent, by reading
 * lastFeedback back after driving a click.
 *
 * Returns false so the caller falls through to its static handler, matching
 * serveReaderRoute's contract.
 */
export async function serveFeedbackRoute(request, response) {
  const url = new URL(request.url, "http://x");
  if (url.pathname !== "/api/feedback" || request.method !== "POST") return false;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    lastFeedback = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    lastFeedback = null;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ done: "Thank you. We read every one." }));
  return true;
}

/** What the last POST /api/feedback sent, for a walker to assert against. */
export function lastFeedbackReceived() {
  return lastFeedback;
}

/** The body of the most recent POST /api/page-feedback, or null before one
 * arrives. Module-level for the same reason lastFeedback is: the walker reads
 * it back well after the click that set it. */
let lastPageFeedback = null;

/**
 * Answers POST /api/page-feedback the way app/api/page-feedback does when it
 * accepts. A fixture for the browser walkers, not a rebuild of the route's own
 * rules: those are tested under node against app/lib/page-feedback.mjs with no
 * browser and no database. What this exists for is letting a walker prove what
 * the bubble actually sent, picture included.
 *
 * The multipart body is parsed by handing it to Response, which is the same
 * parser the route itself gets from the platform.
 */
export async function servePageFeedbackRoute(request, response) {
  const url = new URL(request.url, "http://x");
  if (url.pathname !== "/api/page-feedback" || request.method !== "POST") return false;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": request.headers["content-type"] || "" },
    }).formData();
    const shot = form.get("screenshot");
    lastPageFeedback = {
      comment: form.get("comment"),
      email: form.get("email"),
      page_url: form.get("page_url"),
      viewport: form.get("viewport"),
      user_agent: form.get("user_agent"),
      capture_method: form.get("capture_method"),
      website: form.get("website"),
      screenshot: shot && typeof shot === "object" && shot.size
        ? { bytes: shot.size, type: shot.type,
            png: Buffer.from(await shot.arrayBuffer()) }
        : null,
    };
  } catch {
    lastPageFeedback = null;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ done: "Thank you. We read every one." }));
  return true;
}

/** What the last POST /api/page-feedback sent, for a walker to assert against. */
export function lastPageFeedbackReceived() {
  return lastPageFeedback;
}
