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
import { byStatus, depthTally, launchRefusal, mergeCounts, unfinished } from "../../../lib/runs.mjs";
import { requireOperator } from "../../../auth.mjs";
import { formRoute, refuse } from "../../../lib/admin-routes.mjs";
import { creditProblem, resolveCredit } from "../../../lib/credit.mjs";

const counted = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export const POST = formRoute("/admin/runs", requireOperator, async (fields, email) => {
  const verb = fields.one("verb");

  if (verb === "compose") {
    const behaviours = fields.many("behaviours");
    const documents = fields.many("documents");
    const rubric = fields.one("rubric") || "v5";
    const again = fields.on("again");
    if (!behaviours.length) refuse("choose at least one behaviour");
    if (!documents.length) refuse("choose at least one document");
    // Who the verdicts are credited to, which a publication reads back when it
    // builds its own citation. An address identifies the operator, not an
    // author, so this never falls back to it: left empty, the run is credited
    // to the Collective instead, and an address-shaped credit is refused.
    const credit = fields.one("credit");
    const creditIssue = creditProblem(credit);
    if (creditIssue) refuse(creditIssue);
    // email still travels to startJob below: aci_jobs.created_by is the audit
    // trail of who pressed the button, a column this fix leaves alone.
    const job = await startJob("compose",
                               { behaviours, documents, rubric, again,
                                 created_by: resolveCredit(credit) },
                               email);
    return `Composing: ${behaviours.length} behaviours x ${documents.length} documents`
         + `${again ? ", judging again what is already judged" : ""}. `
         + `Nothing is spent yet: the job writes the calls, their depths and `
         + `their price, and the run appears here with a launch control. `
         + `Job ${job.id.slice(0, 8)}, ${job.origin}.`;
  }

  if (verb === "launch") {
    const runId = fields.one("run_id");
    // Each call's depth comes through the foreign key, in the same select: a list
    // of call ids in the query string outgrows a url past a few hundred calls.
    // Ordered, because the select pages past a thousand rows.
    const [[run], calls] = await Promise.all([
      select("aci_runs", `select=id,status,estimated_usd&id=eq.${runId}`),
      select("aci_judge_calls",
             `select=id,status,aci_depths(status)&run_id=eq.${runId}&order=id.asc`),
    ]);
    const callCounts = byStatus(calls);
    const depthCounts = depthTally(calls);
    const refusal = launchRefusal(run, mergeCounts(callCounts, depthCounts));
    if (refusal) refuse(refusal);
    // A cancelled run may be launched again: cancelling is a pause an operator
    // took, and resume is a filter over calls and depths that are not done.
    const job = await startJob("judge", { run_id: runId }, email);
    if (run.status === "cancelled") {
      await update("aci_runs", `id=eq.${runId}`, { status: "pending", error: null });
    }
    if (run.status === "done") {
      return `Retrying the calls and depths of that run that are not done: `
           + `${counted(unfinished(callCounts), "call")} and `
           + `${counted(unfinished(depthCounts), "depth")}. They are paid for again. `
           + `Job ${job.id.slice(0, 8)}, ${job.origin}.`;
    }
    return `Launched. Every call and depth that is not done will be attempted, at about `
         + `$${run.estimated_usd ?? "?"}. Job ${job.id.slice(0, 8)}, ${job.origin}.`;
  }

  if (verb === "cancel") {
    const runId = fields.one("run_id");
    await update("aci_runs", `id=eq.${runId}`, { status: "cancelled" });
    return "Cancelled. The job stops between calls, so a call already in flight "
         + "finishes and is recorded. It is paid for either way.";
  }

  refuse(`unknown action ${verb || "(none)"}`);
});
