/**
 * What the portal's pages read.
 *
 * Every page is a server component, so these run on the server with the service
 * key and the page receives rows. Nothing here writes: the routes do that, and
 * keeping the two apart means a page cannot change the index by being looked at.
 *
 * Counts are computed here rather than asked of PostgREST. The tables are small
 * -- tens of runs, thousands of calls -- and one query whose shape is obvious
 * beats four whose aggregation lives in a query string.
 */
import panelConfig from "../../engine/panel/panel-config.json" with { type: "json" };
import { select, signedLink } from "./supabase.mjs";

const byStatus = (rows) => rows.reduce((counts, row) => {
  counts[row.status] = (counts[row.status] || 0) + 1;
  return counts;
}, {});

/** Every behaviour, with the two independent states the registry can be in. */
export async function behaviours(fetchImpl = fetch) {
  const [rows, calls] = await Promise.all([
    select("aci_behaviours",
           "select=slug,name,set_name,numeric_id,group_name,definition,judging"
           + "&order=set_name.asc,numeric_id.asc", fetchImpl),
    select("aci_judge_calls", "select=behaviour_slug,status", fetchImpl),
  ]);
  const judged = new Set(calls.filter(c => c.status === "done").map(c => c.behaviour_slug));
  return rows.map(row => ({
    ...row,
    defined: Boolean(row.judging?.query),
    judged: judged.has(row.slug),
  }));
}

/** Each document, newest version first, with what a locator would name. */
export async function specifications(fetchImpl = fetch) {
  const [specs, versions, labs] = await Promise.all([
    select("aci_specs", "select=*&order=id.asc", fetchImpl),
    select("aci_spec_versions",
           "select=id,spec_id,version,content_sha256,source_url,added_at,added_by"
           + "&order=version.desc", fetchImpl),
    select("aci_labs", "select=id,name", fetchImpl),
  ]);
  const labName = Object.fromEntries(labs.map(lab => [lab.id, lab.name]));
  return specs.map(spec => ({
    ...spec,
    lab_name: labName[spec.lab_id] || spec.lab_id,
    versions: versions.filter(version => version.spec_id === spec.id),
  }));
}

/** Runs, newest first, each with its calls counted by status. */
export async function runs(limit = 25, fetchImpl = fetch) {
  const [rows, calls] = await Promise.all([
    select("aci_runs",
           "select=id,created_at,created_by,status,rubric,panel,estimated_usd,cost_usd,"
           + "error,started_at,finished_at&order=created_at.desc"
           + `&limit=${limit}`, fetchImpl),
    select("aci_judge_calls", "select=run_id,status", fetchImpl),
  ]);
  return rows.map(run => {
    const mine = calls.filter(call => call.run_id === run.id);
    return { ...run, calls: mine.length, by_status: byStatus(mine) };
  });
}

/** Publications, newest first, with their cell count and their visibility. */
export async function publications(fetchImpl = fetch) {
  const [rows, cells] = await Promise.all([
    // Never the payload columns. They are megabytes, and no page shows them.
    select("aci_publications",
           "select=id,published_at,published_by,notes,panel,rubric,grandfathered,"
           + "is_public,payload_sha256,documents_sha256,build_params"
           + "&order=published_at.desc", fetchImpl),
    select("aci_publication_cells", "select=publication_id", fetchImpl),
  ]);
  return rows.map(row => ({
    ...row,
    cells: cells.filter(cell => cell.publication_id === row.id).length,
  }));
}

/** Proposals from outside, newest first, each with a link to its document.
 *
 * The link is minted here and expires, because the bucket is private and a
 * permanent link to a private object is a public object with extra steps. */
export async function submissions(limit = 50, fetchImpl = fetch) {
  const rows = await select("aci_submissions",
                            `select=*&order=created_at.desc&limit=${limit}`, fetchImpl);
  return Promise.all(rows.map(async row => ({
    ...row,
    link: row.document ? await signedLink("aci-submissions", row.document, 3600, fetchImpl)
                       : null,
  })));
}

/** The most recent job launches, newest first. */
export async function jobs(limit = 12, fetchImpl = fetch) {
  return select("aci_jobs", `select=*&order=created_at.desc&limit=${limit}`, fetchImpl);
}

/** What the front page says, in one read. */
export async function overview(fetchImpl = fetch) {
  const [behaviourRows, specRows, runRows, publicationRows, jobRows, submissionRows] =
    await Promise.all([
      behaviours(fetchImpl), specifications(fetchImpl), runs(6, fetchImpl),
      publications(fetchImpl), jobs(6, fetchImpl), submissions(50, fetchImpl),
    ]);
  const live = publicationRows.find(row => row.is_public) || null;
  return {
    live,
    drafts: publicationRows.filter(row => !row.is_public),
    behaviours: {
      total: behaviourRows.length,
      defined: behaviourRows.filter(row => row.defined).length,
      judged: behaviourRows.filter(row => row.judged).length,
    },
    documents: specRows.length,
    versions: specRows.reduce((n, spec) => n + spec.versions.length, 0),
    runs: runRows,
    jobs: jobRows,
    unread: submissionRows.filter(row => row.status === "new").length,
  };
}

/** The panels the judging configuration offers, and the models in each.
 *
 * Imported rather than read from disk. The configuration is a committed file and
 * not a table -- it is what the judging engine reads, and a copy in the database
 * would be the second truth this whole migration exists to remove -- but a path
 * read at runtime is not traced into the serverless bundle, so the file would be
 * there in development and missing in deployment. An import is traced.
 */
export function panels() {
  // The panels dict carries notes beside the panels: keys beginning with an
  // underscore, whose value is a paragraph rather than a list of seats.
  return Object.entries(panelConfig.panels || {})
    .filter(([name, seats]) => !name.startsWith("_") && Array.isArray(seats))
    .map(([name, seats]) => ({ name, seats }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
