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
 * The depth the index's panel gave a cell, or null. Every depth an answer
 * carries is read through here.
 *
 * A depth counts only as an object with a finite numeric mean. The grandfathered
 * publication was written by the old builder and carries a human curation's
 * integer in this field; answering with it would present the curation's figure
 * as the panel's mean.
 */
function panelDepth(behaviour, modelSpecId) {
  const depth = behaviour?.coverage?.[modelSpecId]?.depth;
  return depth !== null && typeof depth === "object" && Number.isFinite(depth.mean)
    ? depth : null;
}

/**
 * The seats of a cell's panel that another model judged, and why, or null.
 *
 * A judge that cannot answer a cell at all is replaced there, and the database
 * publishes the cell only when the substitution is recorded. The payload carries
 * it on that cell and on no other, so an absent field means the panel as
 * configured. Three fields travel and nothing else the payload might grow.
 */
function substitutionsOf(behaviour, modelSpecId) {
  const recorded = behaviour?.coverage?.[modelSpecId]?.substitutions;
  if (!Array.isArray(recorded) || !recorded.length) return null;
  return recorded.map(({ seat, substitute, reason }) => ({ seat, substitute, reason }));
}

/** The fields that identify a specification, without its text. */
function specSummary(document) {
  return {
    id: document.id,
    lab: document.lab,
    title: document.title,
    version: document.version,
    source_url: document.sourceUrl,
  };
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
      ...specSummary(document),
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
        const substitutions = substitutionsOf(behaviour, modelSpecId);
        coverage[modelSpecId] = {
          passages: passages.length,
          strongest: TIERS.find(
            tier => passages.some(passage => passage.band === tier)) || null,
          depth: panelDepth(behaviour, modelSpecId),
          ...(substitutions ? { substitutions } : {}),
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

/* The same sentence would be a false claim about a document no panel has read.
 * "Nothing here governs that behaviour" is a finding; "nobody has looked" is
 * not, and an answer that cannot tell them apart invites a caller to publish
 * the second as the first.
 *
 * Only a documents payload built with judged_version_ids carries the `judged`
 * flag this note is selected by, and publish builds none today:
 * engine/build-spec-reader-data.py passes no such set, and publish.py refuses a
 * cell no run answered. So no published answer carries this note yet, and the
 * reader fixture is the only place it is reached. */
const NOT_JUDGED =
  "No panel has judged this document, so the index holds no passages for it. "
  + "That is not a finding about the document.";

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

  const wanted = [...new Set(args.behaviours || [])];
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
    ? [...new Set(args.model_spec_ids)]
    : specifications.map(document => document.id);
  const unknownSpecs = modelSpecIds.filter(id => !specById.has(id));
  if (unknownSpecs.length) {
    throw new ToolError(
      `no such model spec: ${unknownSpecs.join(", ")}. This publication carries: `
      + `${[...specById.keys()].join(", ")}`);
  }

  // Every band unless the caller narrows it, as the spec reader opens on every
  // band. Each passage carries its strength, so a client can still filter.
  const strength = args.strength || "related";
  if (!TIERS.includes(strength)) {
    throw new ToolError(`strength must be one of: ${TIERS.join(", ")}`);
  }

  const limit = args.limit ?? 40;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new ToolError("limit must be a whole number between 1 and 200");
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

  let from = 0;
  if (args.cursor) {
    if (args.cursor.publication !== publication.id) {
      throw new ToolError(
        `this cursor was issued against publication ${args.cursor.publication}, `
        + `and the current publication is ${publication.id}. Start again without `
        + "a cursor.");
    }
    from = cells.findIndex(cell => cell.slug === args.cursor.behaviour
                                && cell.modelSpecId === args.cursor.model_spec_id);
    if (from < 0) {
      throw new ToolError("this cursor does not name a cell of this request");
    }
  }

  // Whole cells until the budget is met, and never fewer than one: half a cell
  // is worse than a big one, so a cell over the budget comes back alone. An
  // empty cell costs nothing and always rides along, which keeps its
  // no-coverage note with the walk that reached it.
  const page = [];
  let taken = 0;
  let next = from;
  while (next < cells.length) {
    const cell = cells[next];
    if (page.length && cell.passages.length && taken + cell.passages.length > limit) break;
    page.push(cell);
    taken += cell.passages.length;
    next += 1;
  }
  const rest = cells.slice(next);

  return {
    publication,
    model_specs_read: modelSpecIds.map(id => specSummary(specById.get(id))),
    panel: panelOf(payload.provenance),
    results: page.map(cell => {
      const behaviour = behaviourBySlug.get(cell.slug);
      const substitutions = substitutionsOf(behaviour, cell.modelSpecId);
      return {
        behaviour: cell.slug,
        model_spec_id: cell.modelSpecId,
        depth: panelDepth(behaviour, cell.modelSpecId),
        ...(substitutions ? { substitutions } : {}),
        passages: cell.passages.map(shapePassage),
        // Two silences, and they are different claims: a panel read this
        // document and found nothing, or no panel has read it at all. Only a
        // payload built with judged_version_ids carries `judged`, and publish
        // builds none today (see NOT_JUDGED), so a published answer always
        // takes the second branch.
        ...(cell.passages.length ? {} : {
          note: specById.get(cell.modelSpecId)?.judged === false ? NOT_JUDGED : NO_COVERAGE,
        }),
      };
    }),
    next_cursor: rest.length
      ? { publication: publication.id,
          behaviour: cells[next].slug,
          model_spec_id: cells[next].modelSpecId }
      : null,
    remaining: {
      cells: rest.length,
      passages: rest.reduce((total, cell) => total + cell.passages.length, 0),
    },
  };
}

/** The document a locator points into: `<lab>--<document>@<version>`. */
function headOf(locator) {
  return String(locator || "").split(" > ", 1)[0];
}

/**
 * A relation named by the document it is about, never by a call's direction.
 *
 * `stricter_source` is a fact about the one call a judge answered. The same pair
 * read from the other side comes back `stricter_target`, so two readings of one
 * pair carry labels that look contradictory and are not. Named, a reading is the
 * same claim from either end, which is what lets the two directions be merged at
 * all.
 */
function namedRelation(relation, sourceLocator, targetLocator) {
  if (relation === "stricter_source") {
    return { relation: "stricter", stricter_document: headOf(sourceLocator) };
  }
  if (relation === "stricter_target") {
    return { relation: "stricter", stricter_document: headOf(targetLocator) };
  }
  return { relation, stricter_document: null };
}

const NOT_COMPARED =
  "No run has compared these two documents on this behaviour. That is not a "
  + "finding about either document.";

/* A pair is two passages, whichever direction found it. Sorting the two locators
 * gives both directions the same key, which is what merges a judge's two
 * readings of one pair rather than reporting them as two links. */
const pairKey = (a, b) => [a, b].sort().join(" ");

/**
 * Everything one run found between two documents on one behaviour.
 *
 * Deliberately one answer rather than a walk. The unit a caller asked for is the
 * comparison, and a comparison split across pages is one a client has to
 * reassemble before it can say anything. `detail` is the lever instead: counts
 * first if the size matters, then the whole thing.
 *
 * `evidence` is app/lib/links.mjs's, passed in rather than fetched, so this stays
 * a function of its arguments and a fixture can exercise it with no network.
 */
export function compareDocuments({ publication, payload, documents, notes },
                                 evidence, args = {}) {
  const specifications = documents.documents || [];
  const specById = new Map(specifications.map(document => [document.id, document]));
  const behaviourBySlug = new Map(
    (payload.behaviours || []).map(behaviour => [behaviour.slug, behaviour]));

  const slug = args.behaviour;
  if (!slug || !behaviourBySlug.has(slug)) {
    throw new ToolError(
      `behaviour must name one behaviour of this publication: `
      + `${[...behaviourBySlug.keys()].join(", ")}`);
  }
  const wanted = [...new Set(args.model_spec_ids || [])];
  if (wanted.length !== 2) {
    throw new ToolError(
      "model_spec_ids must name exactly two different specifications. A "
      + "comparison is between two documents, and this publication carries: "
      + `${[...specById.keys()].join(", ")}`);
  }
  const unknown = wanted.filter(id => !specById.has(id));
  if (unknown.length) {
    throw new ToolError(
      `no such model spec: ${unknown.join(", ")}. This publication carries: `
      + `${[...specById.keys()].join(", ")}`);
  }
  const detail = args.detail || "full";
  if (!["counts", "full"].includes(detail)) {
    throw new ToolError("detail must be counts or full");
  }

  const behaviour = behaviourBySlug.get(slug);
  const note = notes?.[slug] || {};
  const head = {
    publication,
    behaviour: {
      slug,
      name: behaviour.name,
      group: note.group || behaviour.category || null,
      definition: note.query || null,
      boundary: note.boundary || null,
      ...(note.query ? {} : { note: NO_BRIEF }),
    },
    model_specs_read: wanted.map(id => specSummary(specById.get(id))),
  };

  // The passages each document carries for this behaviour, and the quote of
  // every locator the publication knows. A link may name a paragraph outside
  // that set: the judges were shown the whole of the other document, which is
  // what lets a counterpart filed under another behaviour be found at all.
  const passages = {};
  const quoteOf = new Map();
  for (const id of wanted) {
    passages[id] = passagesOf(behaviour, id).map(shapePassage);
    for (const passage of behaviour.coverage?.[id]?.passages || []) {
      quoteOf.set(passage.locator, passage.quote);
    }
  }

  if (!evidence) {
    return {
      ...head,
      depth: Object.fromEntries(wanted.map(id => [id, panelDepth(behaviour, id)])),
      passages: detail === "full" ? passages : undefined,
      comparison: null,
      note: NOT_COMPARED,
    };
  }

  for (const row of evidence.arbitrations || []) {
    if (row.first_quote) quoteOf.set(row.first_locator, row.first_quote);
    if (row.second_quote) quoteOf.set(row.second_locator, row.second_quote);
  }
  const settledBy = new Map(
    (evidence.arbitrations || []).map(row => [
      pairKey(row.first_locator, row.second_locator), row]));

  // One entry per pair, carrying every judge's reading of it. A judge that read
  // the pair in both directions appears twice, which is a fact about that judge
  // rather than about the pair, so both are kept.
  const pairs = new Map();
  const silences = [];
  for (const link of evidence.links || []) {
    if (!link.target_locator) {
      // A judge saying nothing in the other document bears on this passage.
      // That is the comparison's strongest claim, so it travels as its own kind
      // rather than as a pair with a hole in it.
      silences.push({
        locator: link.source_locator,
        quote: quoteOf.get(link.source_locator) ?? null,
        judge: link.judge,
        rationale: link.rationale,
      });
      continue;
    }
    const key = pairKey(link.source_locator, link.target_locator);
    if (!pairs.has(key)) {
      const [first, second] = [link.source_locator, link.target_locator].sort();
      pairs.set(key, {
        passages: [
          { locator: first, quote: quoteOf.get(first) ?? null },
          { locator: second, quote: quoteOf.get(second) ?? null },
        ],
        judges: [],
        arbitration: null,
      });
    }
    pairs.get(key).judges.push({
      judge: link.judge,
      ...namedRelation(link.relation, link.source_locator, link.target_locator),
      // Who may lift each rule, in one vocabulary rather than each document's
      // own. Reported against the documents rather than against the direction.
      force: {
        [headOf(link.source_locator)]: link.source_force,
        [headOf(link.target_locator)]: link.target_force,
      },
      rationale: link.rationale,
    });
  }

  for (const [key, pair] of pairs) {
    const settled = settledBy.get(key);
    if (!settled) continue;
    pair.arbitration = {
      arbiter: settled.arbiter,
      // A verdict from a model that gave one of the readings it was settling is
      // still a verdict. It says which it is so a caller can weigh it.
      arbiter_was_a_party: settled.arbiter_was_a_party,
      why_disputed: settled.why_disputed,
      // What was put to the arbiter is not repeated here: `judges` above is the
      // same readings, and echoing them cost 27,651 of the first comparison's
      // 344,001 characters to say twice what the answer already says once.
      // aci_link_arbitrations keeps them, because an answer stored without its
      // question is not evidence; an answer that carries the question twice is
      // only long.
      relation: settled.relation,
      stricter_document: settled.stricter_document,
      agrees: settled.agrees,
      why: settled.why,
    };
  }

  // What a reader is shown: the arbiter's verdict where there was one, and
  // otherwise the judges' relation when they agree. Where they disagree and
  // nobody settled it, this is null rather than a winner picked by counting.
  for (const pair of pairs.values()) {
    if (pair.arbitration) {
      pair.settled = {
        relation: pair.arbitration.relation,
        stricter_document: pair.arbitration.stricter_document,
        by: pair.arbitration.arbiter,
        why: pair.arbitration.why,
      };
      continue;
    }
    const said = new Set(pair.judges.map(
      judge => `${judge.relation} ${judge.stricter_document || ""}`));
    pair.settled = said.size === 1
      ? { relation: pair.judges[0].relation,
          stricter_document: pair.judges[0].stricter_document,
          by: "the judges agreed", why: null }
      : null;
  }

  const listed = [...pairs.values()];
  const relations = {};
  for (const pair of listed) {
    const named = pair.settled?.relation ?? "unsettled";
    relations[named] = (relations[named] || 0) + 1;
  }

  const comparison = {
    run: evidence.run,
    // Who was asked and who answered. A judge whose call failed is named here
    // rather than dropped: an answer reporting two judges where three were asked
    // would describe a panel that never sat.
    judges: evidence.calls,
    pairs: listed,
    silences,
    summary: evidence.summary
      ? { written_by: evidence.summary.model,
          prompt_sha256: evidence.summary.prompt_sha256,
          text: evidence.summary.body }
      : null,
  };

  const full = {
    ...head,
    depth: Object.fromEntries(wanted.map(id => [id, panelDepth(behaviour, id)])),
    passages,
    comparison,
  };

  if (detail === "full") return full;

  // The same work, a smaller answer. What `counts` saves is what a caller has to
  // read, not what this has to compute, and the character figure is the exact
  // size of the full answer rather than a guess at it.
  return {
    ...head,
    counts: {
      passages: Object.fromEntries(
        wanted.map(id => [id, passages[id].length])),
      pairs: listed.length,
      relations,
      arbitrated: listed.filter(pair => pair.arbitration).length,
      silences: silences.length,
      summary_characters: comparison.summary?.text.length || 0,
    },
    full_answer_characters: JSON.stringify(full).length,
  };
}
