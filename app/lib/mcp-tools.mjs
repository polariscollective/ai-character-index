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

/**
 * What the server says about itself when a client connects, and the opening of
 * `about`.
 *
 * One text in one place. It lives here rather than in the route because `about`
 * returns it verbatim, and two tellings of the same explanation drift: the one
 * an agent happened to read would be the stale one, with nothing to say so.
 *
 * Data-free on purpose. `initialize` happens before any publication is read, so
 * nothing here may name a document, a count or a panel. Everything of that kind
 * is `about`'s, derived from the publication in hand.
 */
export const INSTRUCTIONS = `The AI Character Index reports where model specifications
address a behaviour, and how strongly. It holds published specifications, a set
of behaviours, and passages of those specifications that a panel of language
model judges marked as bearing on each behaviour. It reports what those
documents say, not how the models behave.

A passage carries a strength: defining is the document's fullest statement of
the behaviour, core establishes it there, related bears on it without
establishing it. Every passage is quoted verbatim at the version named in the
answer.

retrieve_passages answers with every band unless its strength argument narrows
it, which is what the spec reader shows before any toggle is touched. Every
passage carries its strength, so a client can also filter what comes back.

Where a behaviour and specification pair carries a depth, it is the mean the
index's panel gave it, from 0 (absent) to 4 (rules with worked examples). A pair
with no depth answers null.

Where one judge of the panel could not answer a pair at all, another model judged
it in that seat, and the pair carries substitutions: the seat, the substitute and
the reason. A pair without that field was judged by the panel as configured.

Every answer names the publication it was read from. A publication whose
is_public is false is a build nobody has published, served by a development
deployment, and what it answers is not the index's published data.

Start with list_behaviours to learn the slugs, then retrieve_passages.`;

/** "1 behaviour", "13 behaviours". A count in prose still has to read. */
const count = (total, noun) => `${total} ${noun}${total === 1 ? "" : "s"}`;

/** A real locator out of the payload, or null where no passage has one. */
function exampleLocator(behaviours) {
  for (const behaviour of behaviours) {
    for (const cell of Object.values(behaviour.coverage || {})) {
      const [passage] = cell.passages || [];
      if (passage?.locator) return passage.locator;
    }
  }
  return null;
}

/**
 * The index introduced to an assistant that arrives knowing nothing.
 *
 * It exists because most clients never show a server's instructions to the
 * model: the tool list is the whole of what an agent sees, so the entry point
 * has to be a tool. It opens with INSTRUCTIONS verbatim rather than a second
 * telling of them, and says as much, so an agent whose client did show them
 * knows it has missed nothing.
 *
 * Everything after them is read from the publication in hand. Nothing here may
 * be a figure somebody typed: a document list or a behaviour count written into
 * prose is true until the next publication and false afterwards, with nothing to
 * mark the difference. Where a fact cannot be derived the sentence carrying it
 * is left out instead, which is why `site` is injected by the route and a
 * deployment that knows no address of its own gives none.
 */
export function about({ publication, payload, documents, notes }, { site = null } = {}) {
  const behaviours = payload.behaviours || [];
  const specifications = documents.documents || [];
  const panel = panelOf(payload.provenance);
  const published = publication.published_at?.slice(0, 10) || null;

  const sections = new Map();
  for (const behaviour of behaviours) {
    const section = notes?.[behaviour.slug]?.group
      || behaviour.category || "No section recorded";
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(behaviour.slug);
  }

  const translated = specifications.filter(document => document.translation);
  const substituted = behaviours.reduce(
    (total, behaviour) => total + Object.keys(behaviour.coverage || {})
      .filter(id => substitutionsOf(behaviour, id)).length, 0);
  const locator = exampleLocator(behaviours);

  // The panel as the payload recorded it, skipping what it did not record.
  const judged = [
    panel.judges.length ? panel.judges.join(", ") : null,
    panel.config ? `configuration ${panel.config}` : null,
    panel.rubric ? `rubric ${panel.rubric}` : null,
    panel.run_date ? `run ${panel.run_date}` : null,
  ].filter(Boolean).join(", ");

  return [
    INSTRUCTIONS,
    "",
    "Everything above is also sent as this server's instructions at initialize, "
    + "when a client connects, so if you have read it there you have missed "
    + "nothing. Everything below is read from the publication being served rather "
    + "than written down, and it changes when a new publication is made public.",
    "",
    "The documents. A specification is a document a laboratory publishes saying "
    + "how its models should behave. Each version is a document of its own, named "
    + "<lab>--<document>@<version>, which is also the head of every locator into "
    + "it, so two versions of one document are two documents and a citation says "
    + `which of them it read. This publication carries `
    + `${count(specifications.length, "document")}:`,
    ...specifications.map(document =>
      `  ${document.id}: ${document.lab}, ${document.title}, version ${document.version}`),
    ...(translated.length ? ["",
      (translated.length === 1
        ? "One of these documents was"
        : `${translated.length} of these documents were`)
      + " read in an English machine translation, so a quote from "
      + (translated.length === 1 ? "it" : "one of them")
      + " is a quote from the translation rather than from the document as "
      + `published: ${translated.map(document => document.id).join(", ")}.`] : []),
    "",
    "The behaviours. A behaviour is one thing a document might commit a model to, "
    + "written down closely enough that a careful reader could go through a "
    + "document and mark every passage that bears on it. This publication carries "
    + `${count(behaviours.length, "behaviour")} in `
    + `${count(sections.size, "section")}:`,
    ...[...sections].map(([section, slugs]) => `  ${section}: ${slugs.join(", ")}`),
    "",
    "list_behaviours gives the brief each behaviour was judged against, which is "
    + "the question its verdicts answer. A verdict means little without it.",
    "",
    `The panel. Every cell of this publication was judged by one panel: ${judged}. `
    + "Each judge reads a whole document against one behaviour's brief and marks "
    + "every passage in it, and the three bands are what their verdicts agree on.",
    "",
    "Each judge also gives the document a depth for the behaviour, 0 to 4, and "
    + "the publication carries the mean of the panel: 0 absent, no passage bears "
    + "on the behaviour; 1 named, it appears in a word or a clause and the "
    + "document says nothing further; 2 discussed, addressed in its own right but "
    + "in terms too general to grade a response against; 3 prescribed, concrete "
    + "rules or procedures specific enough that a grader could quote the "
    + "document's own sentences as pass criteria; 4 demonstrated, prescribed plus "
    + "worked examples showing the sanctioned response. A judge scoring a depth "
    + "is shown the passages the panel cited for that behaviour and nothing else, "
    + "so a depth reads those citations rather than the whole document. It "
    + "measures how far a document develops a behaviour, not how much its "
    + "laboratory cares about it and not whether anyone agrees with what it says.",
    ...(substituted ? ["",
      `In this publication ${count(substituted, "pair")} of behaviour and document `
      + `${substituted === 1 ? "was" : "were"} judged with a recorded substitute `
      + "in one seat, and every answer naming such a pair carries the seat, the "
      + "substitute and the reason."] : []),
    "",
    "Quoting. Every passage comes back with its quote and a locator naming the "
    + "document, its version, the section and the sentences."
    + (locator ? " One from this publication:" : ""),
    ...(locator ? [`  ${locator}`] : []),
    "A locator resolves to verbatim text of that fixed version, so quote the "
    + "words as they came back and give the locator beside them. A laboratory "
    + "reissuing a document makes a new document rather than moving these words.",
    "",
    "The other tools, and when to reach for each.",
    "  list_model_specs: the documents above with their source URLs, how many "
    + "behaviours were judged against each and how many passages each holds. "
    + "Reach for it to see what there is to read, or to get a document's id "
    + "exactly right. No arguments.",
    "  list_behaviours: every behaviour with the brief it was judged against, "
    + "where that brief stops, and per document its passage count, the strongest "
    + "band any passage reaches and the panel's depth. Reach for it first: the "
    + "slugs come from here. No arguments.",
    "  retrieve_passages: the passages themselves, quoted and located, for the "
    + "behaviours you name and the documents you choose. Reach for it to answer a "
    + "question about what a document says. It needs at least one slug from "
    + "list_behaviours, which is what bounds the size of the answer.",
    "",
    "Citing. These figures belong to one publication and change when a new one is "
    + `made public, so name the one you read: publication ${publication.id}`
    + (published ? `, published ${published}` : "") + ".",
    site
      ? `  ${site}/spec-reader/?publication=${publication.id}`
      : "  The same publication is on the site that serves this endpoint, at "
        + `/spec-reader/?publication=${publication.id}`,
    ...(publication.is_public === false ? ["",
      "This publication is not public: it is a draft nobody has released, served "
      + "by a development deployment. Do not cite it as the index's published "
      + "data."] : []),
  ].join("\n");
}
