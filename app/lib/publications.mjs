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
  return env[SERVES_DEVELOPMENT] === "true";
}

/** The query fragment that picks the current publication. */
export function currentPublication(env = process.env) {
  const newest = "order=published_at.desc&limit=1";
  return servesDevelopment(env) ? newest : `is_public=is.true&${newest}`;
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
    : `select=${column}&${currentPublication()}`;
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

/**
 * Which publication is being served, without its payloads.
 *
 * The two payload columns are megabytes and nothing here wants them. What a
 * citation needs is the identity: which build, published when, judged by whom,
 * and the digests that say the bytes have not moved since.
 */
export async function publicationRow(id, fetchImpl = fetch) {
  const columns = "id,published_at,published_by,notes,panel,rubric,grandfathered,"
                + "payload_sha256,documents_sha256";
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
