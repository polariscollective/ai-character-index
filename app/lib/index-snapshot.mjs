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
import { currentPublication } from "./publications.mjs";

const TTL_MS = 60_000;

/* Built per call rather than once, because which publications a deployment
 * serves is read from the environment at request time. A module constant would
 * freeze the answer an instance booted with, and would also let this server
 * answer from a different build than the reader on the same deployment. */
const query = () =>
  `select=id,published_at,is_public,payload,documents,constitutions,governance,overview&`
  + currentPublication();

let memo = null;

/** Drop the memo. Tests only; nothing in the request path calls this. */
export function forgetSnapshot() {
  memo = null;
}

/**
 * `{ publication: { id, published_at, is_public }, payload, documents, notes }`.
 *
 * Current means the newest PUBLIC publication, exactly as the reader resolves
 * it: a build exists before anyone has looked at it, and `is_public` is how an
 * operator says they have.
 *
 * On a development deployment current means the newest build, published or not,
 * which is why `is_public` travels with the publication. Every MCP answer quotes
 * it, and a draft quoted there with nothing to mark it would be cited as the
 * index's published data.
 */
export async function indexSnapshot(fetchImpl = fetch, now = () => Date.now()) {
  if (memo && now() - memo.at < TTL_MS) return memo.snapshot;

  const [row] = await select("aci_publications", query(), fetchImpl);
  if (!row) throw new Error("nothing published yet");

  const snapshot = {
    // Strictly true: a row that came back without the column is not called public.
    publication: { id: row.id, published_at: row.published_at, is_public: row.is_public === true },
    payload: row.payload,
    documents: row.documents,
    // The two boards the publication froze, or null for one built before
    // boards were: the board tools then say it is not compatible.
    constitutions: row.constitutions ?? null,
    governance: row.governance ?? null,
    overview: row.overview ?? null,
    notes: await behaviourNotes(fetchImpl, row.id),
  };
  // Memoised only once the whole snapshot is in hand: a half-read one would
  // serve a minute of answers with no behaviour notes in them.
  memo = { at: now(), snapshot };
  return snapshot;
}
