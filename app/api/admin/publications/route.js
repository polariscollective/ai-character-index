/* Building a publication, and deciding whether the public sees it.
 *
 * Building is a job: both payloads are built by the Python that the provenance
 * verifier holds to a digest, and a JavaScript copy of the band arithmetic and the
 * citation filter would be a second truth about what the index says.
 *
 * Visibility is an update of one column, and the only update this table allows --
 * the grant is column-level, so a publication's bytes stay immutable while its
 * visibility moves. */
import { select, update } from "../../../lib/supabase.mjs";
import { startJob } from "../../../lib/jobs.mjs";
import { requireOperator } from "../../../auth.mjs";
import { formRoute, refuse } from "../../../lib/admin-routes.mjs";
import { creditProblem } from "../../../lib/credit.mjs";
import { publishJobParams } from "../../../lib/publish.mjs";

export const POST = formRoute("/admin/publications", requireOperator, async (fields, email) => {
  const verb = fields.one("verb");

  if (verb === "build") {
    const behaviours = fields.many("behaviours");
    const documents = fields.many("documents");
    const rubric = fields.one("rubric") || "v5";
    const notes = fields.one("notes");
    // Who a citation credits this build to. Never the operator's address: an
    // empty field credits the Collective, and an address-shaped one is refused.
    const credit = fields.one("credit");
    if (!behaviours.length) refuse("choose at least one behaviour");
    if (!documents.length) refuse("choose at least one document");
    const creditIssue = creditProblem(credit);
    if (creditIssue) refuse(creditIssue);
    // email still reaches startJob's own argument below, for aci_jobs.created_by
    // -- the audit trail of who pressed the button, which this fix leaves alone.
    const job = await startJob("publish",
                               publishJobParams({ behaviours, documents, rubric, notes, credit }),
                               email);
    return `Building. Every cell must have been judged by the index's panel under `
         + `rubric ${rubric}, in one run, with a depth from each judge; the job refuses `
         + `and names the cells that were not. It is written as a draft. `
         + `Job ${job.id.slice(0, 8)}, ${job.origin}.`;
  }

  if (verb === "publish" || verb === "withdraw") {
    const id = fields.one("publication_id");
    const [row] = await select("aci_publications",
                               `select=id,is_public,published_at&id=eq.${id}`);
    if (!row) refuse("no such publication");
    const on = verb === "publish";
    if (row.is_public === on) {
      refuse(on ? "that publication is already public" : "that publication is already a draft");
    }
    await update("aci_publications", `id=eq.${id}`, { is_public: on });
    return on
      ? "Public. The reader serves it from now on, and publishing was a database "
        + "write rather than a deploy."
      : "Withdrawn. The reader falls back to the newest publication still public, "
        + "and this one stays readable by its link.";
  }

  refuse(`unknown action ${verb || "(none)"}`);
});
