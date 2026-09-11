/**
 * The reader's two routes, answered from committed files.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id the current publication answers to, so a pin can be exercised. */
export const CURRENT_PUBLICATION = "3114dd65-c6f2-5cb3-bf98-af5b314381c3";


/**
 * Answers /api/reader/documents and /api/reader/payload, or returns false so
 * the caller falls through to its static handler.
 *
 * `dataDir` is the reader's data directory in whatever tree is being served,
 * so a staged user-extended site answers from its own payloads.
 */
export async function serveReaderRoute(request, response, dataDir, payloadName) {
  const url = new URL(request.url, "http://x");
  if (!url.pathname.startsWith("/api/reader/")) return false;

  const pinned = url.searchParams.get("publication");
  const which = url.pathname.slice("/api/reader/".length);
  const name = payloadName;
  const file = which === "documents" ? "documents.json"
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
  if (pin !== null && pin !== CURRENT_PUBLICATION) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "no such publication" }));
    return true;
  }

  try {
    const body = await readFile(join(dataDir, file));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "nothing published yet" }));
  }
  return true;
}
