/* Building a publication, and deciding whether the public sees it.
 *
 * Building is a job: the three payloads are built by the builders the provenance
 * verifier holds to a digest. Two are Python, because a JavaScript copy of the band
 * arithmetic and the citation filter would be a second truth about what the index
 * says; the links payload is JavaScript for the mirror of that reason, because the
 * assembly it needs already lives in app/lib/links.mjs.
 *
 * Visibility and the description are the only updates this table allows -- the
 * grants are column-level, on is_public and on notes, so a publication's bytes
 * stay immutable while its visibility and what is said of it move. */
import { select, update } from "../../../lib/supabase.mjs";
import { isPublicationId } from "../../../lib/publications.mjs";
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
    const linkRuns = fields.many("link_runs");
    const rubric = fields.one("rubric") || "v5";
    const notes = fields.one("notes");
    // Who a citation credits this build to. Never the operator's address: an
    // empty field credits the Collective, and an address-shaped one is refused.
    const credit = fields.one("credit");
    if (!behaviours.length) refuse("choose at least one behaviour");
    if (!documents.length) refuse("choose at least one document");
    if (!linkRuns.length) refuse("choose at least one link run");
    const creditIssue = creditProblem(credit);
    if (creditIssue) refuse(creditIssue);
    // email still reaches startJob's own argument below, for aci_jobs.created_by
    // -- the audit trail of who pressed the button, which this fix leaves alone.
    const job = await startJob("publish",
                               publishJobParams({ behaviours, documents, rubric, notes, credit,
                                                  linkRuns }),
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

  if (verb === "describe") {
    const id = fields.one("publication_id");
    if (!isPublicationId(id)) refuse("no such publication");
    const notes = (fields.one("notes") || "").trim();
    if (notes.length > 2000) refuse("a description is at most 2000 characters");
    const [row] = await select("aci_publications", `select=id&id=eq.${id}`);
    if (!row) refuse("no such publication");
    await update("aci_publications", `id=eq.${id}`, { notes });
    return "Description saved. No digest covers it, so nothing published has moved.";
  }

  refuse(`unknown action ${verb || "(none)"}`);
});
