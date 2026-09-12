/* Moving a proposal's state. That is the whole of what the portal does to one:
 * accepting a proposal registers nothing, because turning a stranger's words
 * into the index's is a person retyping them into the registration form. */
import { update } from "../../../lib/supabase.mjs";
import { requireOperator } from "../../../auth.mjs";
import { formRoute, refuse } from "../../../lib/admin-routes.mjs";

const STATES = ["new", "reviewing", "accepted", "declined"];

export const POST = formRoute("/admin/submissions", requireOperator, async (fields) => {
  const id = fields.one("submission_id");
  const status = fields.one("status");
  if (!id) refuse("no proposal named");
  if (!STATES.includes(status)) refuse(`state must be one of ${STATES.join(", ")}`);
  const [row] = await update("aci_submissions", `id=eq.${id}`, { status });
  if (!row) refuse("no such proposal");
  return `Marked ${status}.`;
});
