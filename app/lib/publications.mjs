/**
 * Reading publications out of the index tables.
 *
 * The browser reads routes; routes read the database. Nothing here is reachable
 * without a publication id or the word "newest", which is the whole of what the
 * public reader needs.
 */
import { select } from "./supabase.mjs";
import { sliceColumn } from "./slice.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPublicationId(value) {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Which publications a deployment serves as the current one.
 *
 * Production serves what an operator has published and nothing else. A
 * development deployment is for the opposite: looking at the build nobody has
 * published yet, on a real surface rather than a local fixture.
 *
 * One variable, absent by default, so a deployment that forgets it hides
 * development builds rather than showing them -- the same direction as
 * `is_public` defaulting to false, and for the same reason. Only the exact
 * string "true" opens it: a variable left as "0", "no" or an empty string is a
 * variable somebody meant to turn off.
 *
 * Read per call rather than at module load, so a test can set it and a
 * long-lived serverless instance cannot answer from the value it booted with.
 *
 * Every surface that resolves "the current publication" must ask this, or a
 * development deployment would show one build in the reader and another in the
 * behaviour notes and the MCP server, which is worse than either alone.
 */
export const SERVES_DEVELOPMENT = "ACI_SERVES_DEVELOPMENT";

export function servesDevelopment(env = process.env) {
  if (env[SERVES_DEVELOPMENT] !== "true") return false;
  // And never on the production deployment, whatever it carries. One variable
  // set by mistake there would put every unread build in front of the public,
  // with nobody pressing anything: the switch that shows a draft must not be
  // reachable by a typo in a settings page. The platform says where it is.
  const where = env.VERCEL_ENV || env.NODE_ENV;
  return where !== "production";
}

/** The query fragment that picks the current publication. */
export function currentPublication(env = process.env) {
  const newest = "order=published_at.desc&limit=1";
  return servesDevelopment(env) ? newest : `is_public=is.true&${newest}`;
}

/**
 * Which publication a request is about, as an id confirmed to still exist.
 *
 * A pin names a publication, not a promise that it is still there: a row can
 * be deleted. `delete from aci_publications` is how an operator withdraws a
 * build whose figures were wrong, and it has happened. So a pin is checked
 * against the table on every call rather than trusted as given -- it is not
 * "already the answer" the way it looks. Without a pin, the current
 * publication is asked for by name, because currentPublication() is an
 * ordering and not an address: it says "the newest public one" and the caller
 * never learns which that was. Either way this always asks the database and
 * holds nothing, which is what lets a deleted row, or a newly published one,
 * be noticed on the very next call.
 */
export async function resolvePublicationId(pin, fetchImpl = fetch) {
  if (pin) {
    const rows = await select("aci_publications",
                              `id=eq.${pin}&select=id`, fetchImpl);
    return rows.length ? rows[0].id : null;
  }
  const rows = await select("aci_publications",
                            `select=id&${currentPublication()}`, fetchImpl);
  return rows.length ? rows[0].id : null;
}

/* Immutability only settles half of this. The bytes of a publication that
 * still exists never change, so a column keyed by its id would be a harmless
 * constant if the row lived forever -- but it does not, a withdrawn build is
 * deleted rather than edited, and that is a real event this hold has to
 * survive. What makes it safe is resolvePublicationId() above: it reconfirms
 * the id against the table on every request, before this map is ever
 * consulted, so only an id it just vouched for can reach a key here. The
 * price is one light `select=id` per request, paid so a column, once fetched,
 * can be held indefinitely without ever serving a publication that is gone.
 *
 * Capped, because these columns are megabytes and a serverless instance that
 * lived through a dozen publications would hold all of them. Three is two more
 * than the reader needs: the current publication, and whatever pin someone is
 * looking at. */
const HELD = new Map();
const HOLD = 3;

/**
 * Forget every held column.
 *
 * Test-only. Production never calls this: there is no event in a running
 * deployment that should make it forget a publication's bytes, since a
 * deleted row is already caught on the next request by the check above. It
 * exists so tests that share this module's state can each start from a clean
 * slate instead of reading a value an earlier test left behind.
 */
export function resetHeldColumns() {
  HELD.clear();
}

/**
 * One column of one publication: the pinned one, or the current one.
 *
 * `column` is never user input -- the three routes pass their own literal -- so
 * it goes into the query unescaped and must stay that way.
 *
 * Current means the newest PUBLIC one. A build exists before anyone has looked
 * at it, and is_public is how an operator says they have: without that filter,
 * pressing publish would put a payload in front of the public in the same
 * motion that produced it. A pin reaches any publication, public or not, which
 * is how the draft gets previewed and how an old one gets checked.
 */
export async function publicationColumn(column, id, fetchImpl = fetch) {
  const resolved = await resolvePublicationId(id, fetchImpl);
  if (resolved === null) return null;
  const key = `${resolved}\n${column}`;
  if (!HELD.has(key)) {
    // Held as a promise, not its resolved value, so two requests that arrive
    // for the same uncached key before either finishes share one fetch: the
    // second caller awaits the first's promise instead of starting its own.
    const promise = select("aci_publications",
                           `id=eq.${resolved}&select=${column}`, fetchImpl)
      .then(rows => (rows.length ? rows[0][column] : null));
    // A failed fetch is not a fact worth remembering: drop it so the next
    // caller gets a fresh try rather than a permanently cached rejection.
    promise.catch(() => { if (HELD.get(key) === promise) HELD.delete(key); });
    if (HELD.size >= HOLD) HELD.delete(HELD.keys().next().value);
    HELD.set(key, promise);
  }
  return HELD.get(key);
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
  /* The reader has always said what it wants in its own URL: spec, behavior and
   * compare-with are written by syncURL on every interaction and read back on
   * arrival. They arrive here already; until now they were ignored. A parameter
   * that is absent means everything, and a parameter that is present and empty
   * means nothing, which are different answers and both worth honouring. */
  const list = name => {
    const raw = searchParams.get(name);
    return raw === null ? null : raw.split(",").map(s => s.trim()).filter(Boolean);
  };
  const specs = list("spec");
  const pair = list("compare-with");
  const shown = specs === null && pair === null
    ? null
    : new Set([...(specs || []), ...(pair || [])]);
  const slugs = list("behavior");

  const body = sliceColumn(column, payload,
                           { documents: shown, behaviours: slugs && new Set(slugs) });

  return {
    status: 200,
    body,
    cacheControl: pin
      ? "public, max-age=31536000, immutable"
      : "public, s-maxage=60, stale-while-revalidate=300",
  };
}

/**
 * Which publication is being served, without its payloads.
 *
 * The two payload columns are megabytes and nothing here wants them. What a
 * citation needs is the identity: which build, published when, judged by whom,
 * and the digests that say the bytes have not moved since.
 */
export async function publicationRow(id, fetchImpl = fetch) {
  // is_public travels with the identity because a surface that cites a build has
  // to know whether anyone published it: on a development deployment this row
  // can be a draft, and a citation that called it the index's published data
  // would be a false claim made by the page rather than by anyone.
  const columns = "id,published_at,published_by,notes,panel,rubric,"
                + "is_public,payload_sha256,documents_sha256";
  const query = id
    ? `id=eq.${id}&select=${columns}`
    : `select=${columns}&${currentPublication()}`;
  const rows = await select("aci_publications", query, fetchImpl);
  if (!rows.length) return null;
  return { ...rows[0], credit: await creditFor(rows[0].id, fetchImpl) };
}

/* The method: the rubric, the prompt, the citation grammar, the code that
 * resolves a locator back to the text. It does not vary by publication and is
 * not derived from one, because it is the same method every build uses. */
export const METHOD = {
  authors: ["Andrés Cotton", "Matt Stults"],
  work: "https://github.com/AndresCotton/ai-character-index",
};

/* A recorded author is either somebody's address or the name of a project. Both
 * are shown as they were written: guessing a display name from an address would
 * be inventing one. */
const unique = (values) => [...new Set(values.filter(Boolean))].sort();

/**
 * Who this publication owes credit to, computed from the artifacts it carries.
 *
 * Attribution as a property of the data rather than a list somebody maintains.
 * The verdicts came from runs and a run names who composed it; the documents and
 * the behaviours name who registered and wrote them. A build that carries
 * somebody's work says so without anyone remembering to add them.
 */
export async function creditFor(publicationId, fetchImpl = fetch) {
  const cells = await select("aci_publication_cells",
    `select=run_id,behaviour_slug,spec_version_id&publication_id=eq.${publicationId}`,
    fetchImpl);
  if (!cells.length) return { judged_by: [], behaviours_by: [], documents_by: [], method: METHOD };

  const list = (values) => `(${[...new Set(values)].join(",")})`;
  const [runs, behaviours, versions] = await Promise.all([
    select("aci_runs",
           `select=created_by&id=in.${list(cells.map(c => c.run_id))}`, fetchImpl),
    select("aci_behaviours",
           `select=added_by&slug=in.${list(cells.map(c => c.behaviour_slug))}`, fetchImpl),
    select("aci_spec_versions",
           `select=added_by&id=in.${list(cells.map(c => c.spec_version_id))}`, fetchImpl),
  ]);

  return {
    // Whose runs produced the verdicts this build serves. This is the dataset's
    // authorship, and the only one of these that belongs in a citation's authors.
    judged_by: unique(runs.map(run => run.created_by)),
    behaviours_by: unique(behaviours.map(row => row.added_by)),
    documents_by: unique(versions.map(row => row.added_by)),
    method: METHOD,
  };
}
