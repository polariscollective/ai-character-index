/**
 * The params a "publish" job is started with.
 *
 * Assembling them is its own function for the same reason `newVersionRow` is
 * (documents.mjs): it is the one place a reviewer needs to check that the
 * operator's address cannot land in a public credit. `credit` is the build
 * form's field; `created_by` here is what `engine/job.py`'s `run_publish`
 * reads back as `published_by` (`engine/publish.py`), and the operator's
 * e-mail is not among this function's arguments at all. It still reaches
 * `aci_jobs.created_by`, the audit trail of who pressed the button, but only
 * as `startJob`'s own separate argument, which this function does not touch.
 *
 * `linkRuns` names which link runs the publication carries: the bubbles,
 * comparisons and notes the reader shows come only from the runs chosen here.
 */
import { resolveCredit } from "./credit.mjs";

export function publishJobParams({ behaviours, documents, rubric, notes, credit, linkRuns }) {
  return { behaviours, documents, rubric, notes, link_runs: linkRuns,
           created_by: resolveCredit(credit) };
}
