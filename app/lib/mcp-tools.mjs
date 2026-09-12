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

/** The verdict words the judging rubric itself uses, keyed by its four points. */
const VERDICT_WORDS = { 3: "defining", 2: "core", 1: "adjacent", 0: "neither" };

const NO_COVERAGE =
  "No passages at this strength. Absence of coverage is an index finding, not "
  + "missing data.";

/*
 * The defect the site hides, travelling with the data.
 *
 * The reader's band maths scores every cell against its own maximum, so a cell
 * swept by six judges and one swept by three both render on a full scale. An
 * agent handed two lists and left to count does not have that protection. This
 * sentence describes the publication the index carries today; when the missing
 * calls on the model spec are filled, the design document for that work owns
 * removing it from here, from the tool description in app/api/mcp/route.js and
 * from site/mcp.html.
 */
const COMPARABILITY =
  "Passage counts are not comparable between these documents. Four behaviours "
  + "were swept by more judges against Claude's Constitution than against the "
  + "OpenAI Model Spec, so the constitution surfaced more candidate passages "
  + "for them. The bands each passage carries are sound; the totals are not a "
  + "like-for-like measure of coverage.";

/** Four fields, and the judges in the rubric's own vocabulary. */
function shapePassage(passage) {
  const judges = {};
  for (const [judge, verdict] of Object.entries(passage.verdicts || {})) {
    judges[judge] = VERDICT_WORDS[verdict] ?? String(verdict);
  }
  return {
    locator: passage.locator,
    quote: passage.quote,
    strength: passage.band,
    judges,
  };
}

/** How the numbers were made, once per answer rather than once per passage. */
function panelOf(provenance = {}) {
  return {
    method: provenance.method ?? null,
    rubric: provenance.rubric ?? null,
    config: provenance.panel_config ?? null,
    judges: provenance.panel ?? [],
    run_date: provenance.runDate ?? null,
  };
}

/**
 * The passages of one or more specifications that bear on one or more
 * behaviours.
 *
 * A cell is one behaviour against one specification, and it is the unit: cells
 * follow the order of the arguments, and within a cell the passages are
 * strongest first, which is the order the published payload already holds.
 *
 * `behaviours` is required and non-empty because it is what bounds the answer.
 * An unknown slug is an error naming what there is rather than an empty result:
 * a typo that answered with silence would read as a finding of no coverage.
 */
export function retrievePassages({ publication, payload, documents }, args = {}) {
  const specifications = documents.documents || [];
  const specById = new Map(specifications.map(document => [document.id, document]));
  const behaviourBySlug = new Map(
    (payload.behaviours || []).map(behaviour => [behaviour.slug, behaviour]));

  const wanted = args.behaviours || [];
  if (!wanted.length) {
    throw new ToolError(
      "behaviours must name at least one behaviour. This publication carries: "
      + `${[...behaviourBySlug.keys()].join(", ")}`);
  }
  const unknown = wanted.filter(slug => !behaviourBySlug.has(slug));
  if (unknown.length) {
    throw new ToolError(
      `no such behaviour: ${unknown.join(", ")}. This publication carries: `
      + `${[...behaviourBySlug.keys()].join(", ")}`);
  }

  const modelSpecIds = args.model_spec_ids?.length
    ? args.model_spec_ids
    : specifications.map(document => document.id);
  const unknownSpecs = modelSpecIds.filter(id => !specById.has(id));
  if (unknownSpecs.length) {
    throw new ToolError(
      `no such model spec: ${unknownSpecs.join(", ")}. This publication carries: `
      + `${[...specById.keys()].join(", ")}`);
  }

  const strength = args.strength || "core";
  if (!TIERS.includes(strength)) {
    throw new ToolError(`strength must be one of: ${TIERS.join(", ")}`);
  }

  const cells = [];
  for (const slug of wanted) {
    for (const modelSpecId of modelSpecIds) {
      cells.push({
        slug,
        modelSpecId,
        passages: passagesOf(behaviourBySlug.get(slug), modelSpecId)
          .filter(passage => atLeastBand(passage.band, strength)),
      });
    }
  }

  return {
    publication,
    model_specs_read: modelSpecIds.map(id => {
      const document = specById.get(id);
      return {
        id: document.id,
        lab: document.lab,
        title: document.title,
        version: document.version,
        source_url: document.sourceUrl,
      };
    }),
    // The request decides, not the page: a two specification walk whose first
    // page happens to hold one cell is still a comparison being assembled.
    ...(modelSpecIds.length > 1 ? { comparability: COMPARABILITY } : {}),
    panel: panelOf(payload.provenance),
    results: cells.map(cell => ({
      behaviour: cell.slug,
      model_spec_id: cell.modelSpecId,
      passages: cell.passages.map(shapePassage),
      ...(cell.passages.length ? {} : { note: NO_COVERAGE }),
    })),
  };
}
