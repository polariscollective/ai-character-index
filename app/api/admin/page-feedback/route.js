/* Moving a page report's state. That is the whole of what the portal does to
 * one: there is nothing to accept, because nothing here asked us to run
 * anything. Marking it actioned says somebody did something about it. */
import { update } from "../../../lib/supabase.mjs";
import { requireOperator } from "../../../auth.mjs";
import { formRoute, refuse } from "../../../lib/admin-routes.mjs";

const STATES = ["new", "read", "actioned", "declined"];

export const POST = formRoute("/admin/page-feedback", requireOperator, async (fields) => {
  const id = fields.one("report_id");
  const status = fields.one("status");
  if (!id) refuse("no report named");
  if (!STATES.includes(status)) refuse(`state must be one of ${STATES.join(", ")}`);
  const [row] = await update("aci_page_feedback", `id=eq.${id}`, { status });
  if (!row) refuse("no such report");
  return `Marked ${status}.`;
});
