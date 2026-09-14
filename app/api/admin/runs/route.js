/* Composing a run, launching it, cancelling it.
 *
 * Three verbs, one route, because they are three things one does to the same
 * object and a form says which. Composing and launching are separate on purpose:
 * composing writes the calls and their price and spends nothing, so the number the
 * operator reads before launching is the number the job wrote rather than an
 * estimate made twice.
 *
 * Launching is also how failed calls are retried. The job takes every call that is
 * not done, so relaunching a run that came back with failures keeps its cells'
 * judges in one run, which is what a publication needs of a cell. */
import { select, update } from "../../../lib/supabase.mjs";
import { startJob } from "../../../lib/jobs.mjs";
import { byStatus, launchRefusal, unfinished } from "../../../lib/runs.mjs";
import { requireOperator } from "../../../auth.mjs";
import { formRoute, refuse } from "../../../lib/admin-routes.mjs";

export const POST = formRoute("/admin/runs", requireOperator, async (fields, email) => {
  const verb = fields.one("verb");

  if (verb === "compose") {
    const behaviours = fields.many("behaviours");
    const specs = fields.many("specs");
    const panel = fields.one("panel");
    const rubric = fields.one("rubric") || "v5";
    const again = fields.on("again");
    if (!behaviours.length) refuse("choose at least one behaviour");
    if (!specs.length) refuse("choose at least one document");
    if (!panel) refuse("choose a panel");
    // Who the verdicts are credited to, which a publication reads back when it
    // builds its own citation. An address identifies the operator; it does not
    // read as an author, so the form asks for a name and falls back to the
    // address rather than inventing one.
    const credit = fields.one("credit") || email;
    const job = await startJob("compose",
                               { behaviours, specs, panel, rubric, again, created_by: credit },
                               email);
    return `Composing: ${behaviours.length} behaviours x ${specs.length} documents `
         + `x panel ${panel}${again ? ", judging again what is already judged" : ""}. `
         + `Nothing is spent yet -- the job writes the calls and `
         + `their price, and the run appears here with a launch control. `
         + `Job ${job.id.slice(0, 8)}, ${job.origin}.`;
  }

  if (verb === "launch") {
    const runId = fields.one("run_id");
    const [[run], calls] = await Promise.all([
      select("aci_runs", `select=id,status,estimated_usd&id=eq.${runId}`),
      select("aci_judge_calls", `select=status&run_id=eq.${runId}`),
    ]);
    const counts = byStatus(calls);
    const refusal = launchRefusal(run, counts);
    if (refusal) refuse(refusal);
    // A cancelled run may be launched again: cancelling is a pause an operator
    // took, and resume is a filter over calls that are not done.
    const job = await startJob("judge", { run_id: runId }, email);
    if (run.status === "cancelled") {
      await update("aci_runs", `id=eq.${runId}`, { status: "pending", error: null });
    }
    if (run.status === "done") {
      return `Retrying the ${unfinished(counts)} calls of that run that are not done. `
           + `They are paid for again. Job ${job.id.slice(0, 8)}, ${job.origin}.`;
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
