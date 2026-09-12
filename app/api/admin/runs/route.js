/* Composing a run, launching it, cancelling it.
 *
 * Three verbs, one route, because they are three things one does to the same
 * object and a form says which. Composing and launching are separate on purpose:
 * composing writes the calls and their price and spends nothing, so the number the
 * operator reads before launching is the number the job wrote rather than an
 * estimate made twice. */
import { select, update } from "../../../lib/supabase.mjs";
import { startJob } from "../../../lib/jobs.mjs";
import { requireOperator } from "../../../auth.mjs";
import { formRoute, refuse } from "../../../lib/admin-routes.mjs";

export const POST = formRoute("/admin/runs", requireOperator, async (fields, email) => {
  const verb = fields.one("verb");

  if (verb === "compose") {
    const behaviours = fields.many("behaviours");
    const specs = fields.many("specs");
    const panel = fields.one("panel");
    const rubric = fields.one("rubric") || "v5";
    if (!behaviours.length) refuse("choose at least one behaviour");
    if (!specs.length) refuse("choose at least one document");
    if (!panel) refuse("choose a panel");
    const job = await startJob("compose",
                               { behaviours, specs, panel, rubric, created_by: email },
                               email);
    return `Composing: ${behaviours.length} behaviours x ${specs.length} documents `
         + `x panel ${panel}. Nothing is spent yet -- the job writes the calls and `
         + `their price, and the run appears here with a launch control. `
         + `Job ${job.id.slice(0, 8)}, ${job.origin}.`;
  }

  if (verb === "launch") {
    const runId = fields.one("run_id");
    const [run] = await select("aci_runs", `select=id,status,estimated_usd&id=eq.${runId}`);
    if (!run) refuse("no such run");
    if (run.status === "running") refuse("that run is already running");
    if (run.status === "done") refuse("that run is done. Compose a new one to judge more cells.");
    // A cancelled run may be launched again: cancelling is a pause an operator
    // took, and resume is a filter over calls that are not done.
    const job = await startJob("judge", { run_id: runId }, email);
    if (run.status === "cancelled") {
      await update("aci_runs", `id=eq.${runId}`, { status: "pending", error: null });
    }
    return `Launched. Every call that is not done will be attempted, at about `
         + `$${run.estimated_usd ?? "?"}. Job ${job.id.slice(0, 8)}, ${job.origin}.`;
  }

  if (verb === "cancel") {
    const runId = fields.one("run_id");
    await update("aci_runs", `id=eq.${runId}`, { status: "cancelled" });
    return "Cancelled. The job stops between calls, so a call already in flight "
         + "finishes and is recorded -- it is paid for either way.";
  }

  refuse(`unknown action ${verb || "(none)"}`);
});
