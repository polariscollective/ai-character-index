/**
 * Reading publications out of the index tables.
 *
 * Plain fetch against PostgREST, no client library. The python half of this
 * repository talks to the same API through a hundred lines of stdlib for the
 * same reason: one HTTP interface, two thin callers, and nothing to keep in
 * step across a dependency upgrade.
 *
 * The service key lives here and only here. The browser reads routes; routes
 * read the database.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPublicationId(value) {
  return typeof value === "string" && UUID.test(value);
}

function credentials() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return { url: url.replace(/\/$/, ""), key };
}

/**
 * One column of one publication: the pinned one, or the current one.
 *
 * `column` is never user input -- the two routes pass their own literal -- so
 * it goes into the query unescaped and must stay that way.
 */
export async function publicationColumn(column, id, fetchImpl = fetch) {
  const { url, key } = credentials();
  const query = id
    ? `id=eq.${id}&select=${column}`
    : `select=${column}&order=published_at.desc&limit=1`;

  const response = await fetchImpl(`${url}/rest/v1/aci_publications?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`aci_publications -> ${response.status}`);
  }
  const rows = await response.json();
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
