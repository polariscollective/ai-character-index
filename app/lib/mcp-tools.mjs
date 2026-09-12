/**
 * What the MCP server answers, as functions of a snapshot.
 *
 * Pure on purpose. A snapshot is a plain object -- the publication's two
 * columns plus the registry notes -- so every answer here is testable against
 * a fixture with no network, no credentials and no server. Reading the
 * snapshot is app/lib/index-snapshot.mjs's job, and registering these as tools
 * is app/api/mcp/route.js's.
 */
import { TIERS, bandCell, atLeastBand } from "./bands.mjs";

/** A caller's mistake. The route reports it; anything else is a fault. */
export class ToolError extends Error {}

const NO_BRIEF =
  "Judged without a recorded brief. What the panel was asked survives only in "
  + "the judge calls.";

/** Every passage of a cell, banded but unfiltered. */
function passagesOf(behaviour, modelSpecId) {
  return bandCell(behaviour.coverage?.[modelSpecId]?.passages || []);
}

/**
 * Every specification the publication carries, with what the index holds
 * against each.
 *
 * `passages` counts every passage, not the ones a display default would show:
 * it describes the index, and a number that moved with a toggle would be a
 * worse one to publish. The markdown is deliberately absent -- the two
 * documents are hundreds of kilobytes and `source_url` is in the answer.
 */
export function listModelSpecs({ publication, payload, documents }) {
  const behaviours = payload.behaviours || [];
  return {
    publication,
    model_specs: (documents.documents || []).map(document => ({
      id: document.id,
      lab: document.lab,
      title: document.title,
      version: document.version,
      source_url: document.sourceUrl,
      behaviours_judged: behaviours.filter(
        behaviour => behaviour.coverage?.[document.id]).length,
      passages: behaviours.reduce(
        (total, behaviour) =>
          total + (behaviour.coverage?.[document.id]?.passages?.length || 0), 0),
    })),
  };
}

/**
 * Every behaviour the publication shows, as the panel was asked it.
 *
 * `definition` is the judges' brief and not the index's display copy, because
 * the brief is what the numbers were produced against. One behaviour of the
 * published set was judged with no brief on file; it says so rather than
 * returning a null that reads as "nobody has defined this", which is a
 * different and false claim.
 */
export function listBehaviours({ publication, payload, notes }) {
  return {
    publication,
    behaviours: (payload.behaviours || []).map(behaviour => {
      const note = notes?.[behaviour.slug] || {};
      const coverage = {};
      for (const modelSpecId of Object.keys(behaviour.coverage || {})) {
        const passages = passagesOf(behaviour, modelSpecId);
        coverage[modelSpecId] = {
          passages: passages.length,
          strongest: TIERS.find(
            tier => passages.some(passage => passage.band === tier)) || null,
        };
      }

      const definition = note.query || null;
      return {
        slug: behaviour.slug,
        name: behaviour.name,
        group: note.group || behaviour.category || null,
        definition,
        boundary: note.boundary || null,
        source: note.source || null,
        ...(definition ? {} : { note: NO_BRIEF }),
        coverage,
      };
    }),
  };
}
