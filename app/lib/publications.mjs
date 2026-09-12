/**
 * Reading publications out of the index tables.
 *
 * The browser reads routes; routes read the database. Nothing here is reachable
 * without a publication id or the word "newest", which is the whole of what the
 * public reader needs.
 */
import { select } from "./supabase.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPublicationId(value) {
  return typeof value === "string" && UUID.test(value);
}

/**
 * One column of one publication: the pinned one, or the current one.
 *
 * `column` is never user input -- the two routes pass their own literal -- so
 * it goes into the query unescaped and must stay that way.
 *
 * Current means the newest PUBLIC one. A build exists before anyone has looked
 * at it, and is_public is how an operator says they have: without that filter,
 * pressing publish would put a payload in front of the public in the same
 * motion that produced it. A pin reaches any publication, public or not, which
 * is how the draft gets previewed and how an old one gets checked.
 */
export async function publicationColumn(column, id, fetchImpl = fetch) {
  const query = id
    ? `id=eq.${id}&select=${column}`
    : `select=${column}&is_public=is.true&order=published_at.desc&limit=1`;
  const rows = await select("aci_publications", query, fetchImpl);
  return rows.length ? rows[0][column] : null;
}

/**
 * The body and headers of a reader route.
 *
 * A pinned publication is immutable, so it is cached for a year. The current
 * one changes the moment someone publishes, so it is cached briefly at the edge
 * and revalidated behind the reader's back.
 */
export async function readerResponse(column, searchParams, fetchImpl = fetch) {
  const pin = searchParams.get("publication");
  if (pin !== null && !isPublicationId(pin)) {
    return { status: 400, body: { error: "publication must be a uuid" } };
  }

  const payload = await publicationColumn(column, pin, fetchImpl);
  if (payload === null) {
    return {
      status: 404,
      body: { error: pin ? "no such publication" : "nothing published yet" },
    };
  }
  return {
    status: 200,
    body: payload,
    cacheControl: pin
      ? "public, max-age=31536000, immutable"
      : "public, s-maxage=60, stale-while-revalidate=300",
  };
}
