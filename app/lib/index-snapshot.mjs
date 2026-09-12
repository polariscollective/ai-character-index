/**
 * The publication the MCP server answers from, read once.
 *
 * The reader's routes read one column per request and let the edge cache do
 * the saving. The MCP server cannot: a tool call is a POST, so nothing caches
 * it, and every call needs the payload, the documents and the registry notes
 * together. So the row is held in module scope for a minute, the same window
 * as the reader route's `s-maxage`.
 *
 * Vercel promises nothing about instance reuse, which is why this is a saving
 * and not an assumption: a cold instance reads Supabase and answers correctly.
 * `now` is injected so the expiry is testable without waiting.
 */
import { select } from "./supabase.mjs";
import { behaviourNotes } from "./behaviours.mjs";

const TTL_MS = 60_000;

const QUERY =
  "select=id,published_at,payload,documents&is_public=is.true"
  + "&order=published_at.desc&limit=1";

let memo = null;

/** Drop the memo. Tests only; nothing in the request path calls this. */
export function forgetSnapshot() {
  memo = null;
}

/**
 * `{ publication: { id, published_at }, payload, documents, notes }`.
 *
 * Current means the newest PUBLIC publication, exactly as the reader resolves
 * it: a build exists before anyone has looked at it, and `is_public` is how an
 * operator says they have.
 */
export async function indexSnapshot(fetchImpl = fetch, now = () => Date.now()) {
  if (memo && now() - memo.at < TTL_MS) return memo.snapshot;

  const [row] = await select("aci_publications", QUERY, fetchImpl);
  if (!row) throw new Error("nothing published yet");

  const snapshot = {
    publication: { id: row.id, published_at: row.published_at },
    payload: row.payload,
    documents: row.documents,
    notes: await behaviourNotes(fetchImpl, row.id),
  };
  // Memoised only once the whole snapshot is in hand: a half-read one would
  // serve a minute of answers with no behaviour notes in them.
  memo = { at: now(), snapshot };
  return snapshot;
}
