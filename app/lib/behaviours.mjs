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

import { select } from "./supabase.mjs";

const SELECT = "slug,name,set_name,numeric_id,group_name,definition,judging";

/**
 * The behaviours a publication shows, which is not the same as the cells it
 * judged: the reader's menu carries a behaviour whose coverage is a re-reading
 * of other behaviours' judgements, and no cell answers for it.
 *
 * `build_params` records the list, so this is one small request. The publication
 * the migration wrote predates that and records only its thresholds, so its
 * payload is read for the list instead -- once, and then cached with the
 * response. There is no third case: the table is insert-only, so what is missing
 * from that one row cannot be added to it.
 */
async function publishedSlugs(publicationId, fetchImpl) {
  const query = publicationId
    ? `select=id,build_params&id=eq.${publicationId}`
    : "select=id,build_params&is_public=is.true&order=published_at.desc&limit=1";
  const [publication] = await select("aci_publications", query, fetchImpl);
  if (!publication) return null;

  const recorded = publication.build_params?.behaviours;
  if (Array.isArray(recorded)) return new Set(recorded);

  const [{ payload }] = await select(
    "aci_publications", `select=payload&id=eq.${publication.id}`, fetchImpl);
  return new Set((payload?.behaviours || []).map(behaviour => behaviour.slug));
}

/**
 * One entry per behaviour the reader shows, keyed by slug.
 *
 * Scoped to the publication rather than to the registry, and no set is named
 * here: the slug is the primary key of `aci_behaviours`, and which behaviours a
 * reader shows is the publication's decision. That scoping is also what keeps a
 * behaviour registered but not yet published out of a public response -- this
 * route would otherwise describe work nobody has decided to show.
 *
 * The judges' brief and the index's own description are reported separately,
 * because they are not the same sentence and one behaviour has the second
 * without the first. Folding them together would print a display definition
 * under "what the judges are asked" for a behaviour no judge was ever asked
 * about. `defined` and `judged` are likewise independent: a behaviour is
 * defined once someone has written its construct for a panel, and judged once a
 * call for it reaches `done`.
 */
export async function behaviourNotes(fetchImpl = fetch, publicationId = null) {
  const [registry, calls, shown] = await Promise.all([
    select("aci_behaviours", `select=${SELECT}`, fetchImpl),
    select("aci_judge_calls", "select=behaviour_slug&status=eq.done", fetchImpl),
    publishedSlugs(publicationId, fetchImpl),
  ]);
  const judged = new Set(calls.map(call => call.behaviour_slug));

  const notes = {};
  for (const row of registry) {
    // Nothing published means nothing to describe. An empty answer is right
    // here: the reader has no sidebar to open a note beside.
    if (shown === null || !shown.has(row.slug)) continue;
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
