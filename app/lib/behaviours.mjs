/**
 * What a behaviour is, as opposed to what a run found.
 *
 * Read live from the registry rather than carried in the published payload, and
 * that is a design choice with a reason. The payload is materialised at
 * publication time, so adding a field to it means republishing, and a
 * publication must pass the homogeneity check. What a behaviour *is* — its
 * definition, the frontier of its construct, where that definition came from —
 * is registry state, and registry state can be read as it stands.
 */

const SELECT = "slug,name,set_name,numeric_id,group_name,definition,judging";

function credentials() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function rows(table, query, fetchImpl) {
  const { url, key } = credentials();
  const response = await fetchImpl(`${url}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${table} -> ${response.status}`);
  return response.json();
}

/**
 * One entry per behaviour in the registry, keyed by slug.
 *
 * Every set is returned and none is named here. The slug is the primary key of
 * `aci_behaviours`, so it identifies a behaviour across sets, and which
 * behaviours a reader shows is the payload's business — naming a set in this
 * file would put that decision in two places.
 *
 * The judges' brief and the index's own description are reported separately,
 * because they are not the same sentence and one behaviour has the second
 * without the first. Folding them together would print a display definition
 * under "what the judges are asked" for a behaviour no judge was ever asked
 * about. `defined` and `judged` are likewise independent: a behaviour is
 * defined once someone has written its construct for a panel, and judged once a
 * call for it reaches `done`.
 */
export async function behaviourNotes(fetchImpl = fetch) {
  const [registry, calls] = await Promise.all([
    rows("aci_behaviours", `select=${SELECT}`, fetchImpl),
    rows("aci_judge_calls", "select=behaviour_slug&status=eq.done", fetchImpl),
  ]);
  const judged = new Set(calls.map(call => call.behaviour_slug));

  const notes = {};
  for (const row of registry) {
    const judging = row.judging || {};
    const query = judging.query || null;
    const described = row.definition || null;
    notes[row.slug] = {
      name: row.name,
      group: row.group_name,
      set: row.set_name,
      query,
      // Suppressed where it repeats the brief, which is the usual case: the
      // registry was written by copying one into the other.
      described: described === query ? null : described,
      boundary: judging.boundary || null,
      source: judging.source || null,
      defined: Boolean(query),
      judged: judged.has(row.slug),
    };
  }
  return notes;
}
