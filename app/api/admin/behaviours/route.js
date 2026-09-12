/* Registering a behaviour.
 *
 * The judging half is required. A behaviour registered without it reaches a panel
 * with "Scope (optional): none provided" -- the defect this migration found once,
 * by composing the text a model would be sent rather than by comparing records.
 * The registry already carries one row in that state, and one is the number that
 * can be explained. */
import { requireOperator } from "../../../auth.mjs";
import { insert, select } from "../../../lib/supabase.mjs";
import { formRoute, refuse } from "../../../lib/admin-routes.mjs";
import { problems, slugProblem } from "../../../lib/locator-safe.mjs";

const SETS = ["index", "reader-test", "user"];

export const POST = formRoute("/admin/behaviours", requireOperator, async (fields, email) => {
  const slug = fields.one("slug");
  const name = fields.one("name");
  const set = fields.one("set");
  const group = fields.one("group");
  const definition = fields.one("definition");
  const query = fields.one("query");
  const boundary = fields.one("boundary");
  const source = fields.one("source");

  const found = problems([[slugProblem, slug, "slug"]]);
  if (!SETS.includes(set)) found.push(`set must be one of ${SETS.join(", ")}`);
  for (const [value, what] of [[name, "name"], [group, "group"], [query, "query"],
                               [boundary, "boundary"], [source, "source"]]) {
    if (!value) found.push(`${what} is required`);
  }
  if (found.length) refuse(found.join("\n"));

  const existing = await select("aci_behaviours", `select=slug,numeric_id,set_name`);
  if (existing.some(row => row.slug === slug)) {
    refuse(`${slug} is already registered. A behaviour's slug is its identity `
           + "across every run and every publication, so it is never reused.");
  }

  // numeric_id is namespaced per set and unique within it, enforced by the table.
  const next = Math.max(0, ...existing.filter(row => row.set_name === set)
                                      .map(row => row.numeric_id)) + 1;

  await insert("aci_behaviours", [{
    slug, name, set_name: set, numeric_id: next, group_name: group,
    definition: definition || query,
    judging: { query, boundary, source: `${source} (registered by ${email})` },
  }]);
  return `Registered ${slug} as ${set} #${next}. It reaches a panel when a run `
       + "names it, and the reader when a publication carries it.";
});
