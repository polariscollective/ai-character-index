/**
 * What one run found between two documents on one behaviour, read from the
 * database.
 *
 * The publication is not the source here, and that is the point. A publication
 * says how deeply each document covers a behaviour; a link says what one
 * document's passage does to another's, and links belong to a run rather than to
 * a publication. So this reads the five link tables directly, bounded by the
 * behaviour and the pair of documents a caller named.
 *
 * Read per call rather than memoised like index-snapshot.mjs. A snapshot is one
 * row and every tool needs it; link evidence is hundreds of rows per pair, and
 * holding every pair anyone ever asked for would trade a request for a leak.
 *
 * Shaping this into an answer is mcp-tools.mjs's job, which stays pure so a
 * fixture can exercise it with no network. Everything here is the fetching.
 */
import { select } from "./supabase.mjs";

/** `<spec_id>@<version>`, which is the head of every locator into a document. */
function documentId(version) {
  return `${version.spec_id}@${version.version}`;
}

/** PostgREST's in.(…) list, with each value quoted so commas cannot split it. */
function inList(values) {
  return `in.(${values.map(value => `"${value}"`).join(",")})`;
}

/**
 * The version rows for a set of document ids, keyed both ways.
 *
 * A locator carries the document id and a call carries version uuids, so
 * answering about a pair needs both directions of that map.
 */
export async function versionsOf(documentIds, fetchImpl = fetch) {
  const rows = await select(
    "aci_spec_versions", "select=id,spec_id,version", fetchImpl);
  const byDocument = new Map();
  const byVersionId = new Map();
  for (const row of rows) {
    const id = documentId(row);
    byVersionId.set(row.id, id);
    if (documentIds.includes(id)) byDocument.set(id, row.id);
  }
  return { byDocument, byVersionId };
}

/**
 * `{ run, calls, links, arbitrations, summary }` for one behaviour over one pair
 * of documents, or null when no run has compared them.
 *
 * The newest run that produced calls for this cell wins, the way the engine
 * already takes the newest run of a cell: a pair judged twice is two readings,
 * and the answer is the later one rather than both interleaved.
 *
 * A call that failed is carried, not dropped. `deepseek` could not answer this
 * task at all on the first run, and an answer that silently reported two judges
 * where three were asked would be describing a panel that never sat.
 */
export async function linkEvidence(behaviourSlug, documentIds, fetchImpl = fetch) {
  const { byDocument, byVersionId } = await versionsOf(documentIds, fetchImpl);
  const versionIds = documentIds.map(id => byDocument.get(id)).filter(Boolean);
  if (versionIds.length !== 2) return null;

  const calls = await select(
    "aci_link_calls",
    "select=id,run_id,behaviour_slug,source_version_id,target_version_id,model,"
    + "status,sources,uncovered,finish_reason,cost_usd"
    + `&behaviour_slug=eq.${encodeURIComponent(behaviourSlug)}`
    + `&source_version_id=${inList(versionIds)}`
    + `&target_version_id=${inList(versionIds)}`,
    fetchImpl);
  if (!calls.length) return null;

  const runs = await select(
    "aci_link_runs",
    `select=id,status,panel,prompt_sha256,created_at,cost_usd&id=${inList(
      [...new Set(calls.map(call => call.run_id))])}`,
    fetchImpl);
  // Newest first, and only a run that finished: a run still going would answer
  // with whichever calls happen to have landed.
  const [run] = runs
    .filter(row => row.status === "done")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (!run) return null;

  const ofRun = calls.filter(call => call.run_id === run.id);
  const answered = ofRun.filter(call => call.status === "done");
  const links = answered.length
    ? await select(
        "aci_links",
        "select=call_id,source_locator,target_locator,relation,source_force,"
        + `target_force,rationale&call_id=${inList(answered.map(call => call.id))}`,
        fetchImpl)
    : [];

  const arbitrations = await select(
    "aci_link_arbitrations",
    "select=first_locator,second_locator,first_quote,second_quote,why_disputed,"
    + "readings,arbiter,arbiter_was_a_party,relation,stricter_document,agrees,why"
    + `&run_id=eq.${run.id}&behaviour_slug=eq.${encodeURIComponent(behaviourSlug)}`,
    fetchImpl);

  // Newest wins: the prompt digest is part of that table's key, so improving the
  // wording leaves the older text in place beside the newer one.
  const summaries = await select(
    "aci_link_summaries",
    "select=model,prompt_sha256,body,finish_reason,cost_usd,created_at,document_ids"
    + `&run_id=eq.${run.id}&behaviour_slug=eq.${encodeURIComponent(behaviourSlug)}`,
    fetchImpl);
  const [summary] = summaries
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  return {
    run: {
      id: run.id,
      panel: run.panel || [],
      prompt_sha256: run.prompt_sha256,
      run_date: run.created_at,
    },
    calls: ofRun.map(call => ({
      judge: call.model,
      status: call.status,
      source_document: byVersionId.get(call.source_version_id) || null,
      target_document: byVersionId.get(call.target_version_id) || null,
      passages_given: call.sources,
      passages_unanswered: call.uncovered,
      finish_reason: call.finish_reason,
    })),
    // The judge is on the call, not on the link, so it is carried onto each row
    // here once rather than looked up by every reader downstream.
    links: links.map(link => ({
      ...link,
      judge: answered.find(call => call.id === link.call_id)?.model || null,
    })),
    arbitrations,
    summary: summary || null,
  };
}
