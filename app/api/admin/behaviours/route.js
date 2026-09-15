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
import { creditProblem, resolveCredit } from "../../../lib/credit.mjs";

export const POST = formRoute("/admin/behaviours", requireOperator, async (fields) => {
  const slug = fields.one("slug");
  const name = fields.one("name");
  const group = fields.one("group");
  const definition = fields.one("definition");
  const query = fields.one("query");
  const boundary = fields.one("boundary");
  const source = fields.one("source");
  const credit = fields.one("credit");

  const found = problems([[slugProblem, slug, "slug"]]);
  for (const [value, what] of [[name, "name"], [group, "group"], [query, "query"],
                               [boundary, "boundary"], [source, "source"]]) {
    if (!value) found.push(`${what} is required`);
  }
  const creditIssue = creditProblem(credit);
  if (creditIssue) found.push(creditIssue);
  if (found.length) refuse(found.join("\n"));

  const existing = await select("aci_behaviours", `select=slug,numeric_id,set_name`);
  if (existing.some(row => row.slug === slug)) {
    refuse(`${slug} is already registered. A behaviour's slug is its identity `
           + "across every run and every publication, so it is never reused.");
  }

  // numeric_id is unique within set_name, a column nothing reads any more and
  // which a cleanup migration removes. Until then every behaviour is written
  // into `user`, numbered after the last one there.
  const next = Math.max(0, ...existing.filter(row => row.set_name === "user")
                                      .map(row => row.numeric_id)) + 1;

  await insert("aci_behaviours", [{
    slug, name, set_name: "user", numeric_id: next, group_name: group,
    definition: definition || query,
    judging: { query, boundary, source },
    // Who wrote it. A behaviour's two sentences are the whole of what a verdict
    // is a verdict on, so whoever wrote them is owed the credit for it, and a
    // publication computes that from this column rather than from a list. Never
    // the operator's address: left empty this credits the Collective instead.
    added_by: resolveCredit(credit),
  }]);
  return `Registered ${slug}. It reaches a panel when a run names it, and the `
       + "reader when a publication carries it.";
});
