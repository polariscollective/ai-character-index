/**
 * What an address asks for, cut out of what a publication froze.
 *
 * The reader downloads 7425 KB and shows a fraction of it: linkBubbles already
 * filters to the pair on screen and the ticked behaviours, and the panel shows
 * one document or two. This is that same narrowing, done before the bytes leave
 * the server instead of after they arrive.
 *
 * Pure by design. It knows the shape of the three columns and nothing about
 * HTTP or the database, so it can be tested with object literals, and the
 * knowledge of what links look like stays in one place rather than being spelt
 * out again in a route.
 *
 * A null set means everything. That is what a caller with no such parameter is
 * asking for, and it keeps the unsliced case free rather than special.
 */

const documentOf = locator => String(locator).split(" > ")[0];

/* comparisons and notes.passage are keyed with newlines: the behaviour first,
 * the two documents last, and for a passage note its locator in between. */
const partsOf = key => String(key).split("\n");

function sliceLinks(links, { documents, behaviours }) {
  /* Without this, the code below would still compute the right values, but it
   * would rebuild the object to hold them, and a rebuild is not a projection:
   * it can add a key (notes, when links carries none) that the input never
   * had. The payload and documents branches get this for free from their one
   * relevant field; links has two, so it needs the check spelt out. */
  if (!documents && !behaviours) return links;

  const shown = id => !documents || documents.has(id);
  const asked = slugs => !behaviours || (slugs || []).some(slug => behaviours.has(slug));

  const byLocator = {};
  for (const [locator, rows] of Object.entries(links.byLocator || {})) {
    if (!shown(documentOf(locator))) continue;
    const kept = rows.filter(row => asked(row.behaviours));
    if (kept.length) byLocator[locator] = kept;
  }

  const pairKept = key => {
    const parts = partsOf(key);
    return asked([parts[0]]) && parts.slice(-2).every(shown);
  };
  const keep = table => Object.fromEntries(
    Object.entries(table || {}).filter(([key]) => pairKept(key)));

  return {
    ...links,
    byLocator,
    comparisons: keep(links.comparisons),
    notes: {
      ...links.notes,
      passage: keep(links.notes?.passage),
    },
  };
}

/**
 * Which behaviours cite which paragraph, by numeric id.
 *
 * A ?passage= link has to know this before it knows what to load: it opens the
 * document, ticks a behaviour that cites the paragraph, and reveals it. Reading
 * that out of the behaviours themselves works only while all of them are in
 * memory, which is exactly what slicing ends. 67 KB for 785 cited locators,
 * against the 914 KB payload it replaces for this one purpose.
 *
 * Numeric ids rather than slugs because the payload's own behaviours already
 * carry `id`, and it is a third of the bytes a slug would cost.
 */
export function citationIndex(payload) {
  const index = {};
  for (const behaviour of payload.behaviours || []) {
    const id = behaviour.id;
    for (const coverage of Object.values(behaviour.coverage || {})) {
      for (const passage of coverage.passages || []) {
        (index[passage.locator] ||= []).push(id);
      }
    }
  }
  for (const ids of Object.values(index)) ids.sort((a, b) => a - b);
  return index;
}

/* A behaviour nobody asked for, with its heading and its figures and none of its
 * text. The cell says so rather than reading as empty: an empty passages array
 * is the index saying this document is silent on this behaviour, which is the
 * one claim it must never make by accident. */
function withheldParagraphs(behaviour) {
  const coverage = {};
  for (const [id, cell] of Object.entries(behaviour.coverage || {})) {
    const { passages, ...rest } = cell;
    coverage[id] = { ...rest, passagesWithheld: true };
  }
  return { ...behaviour, coverage };
}

/* A document the reader is not looking at: everything the menu needs to name it
 * and offer it, and none of the 309 KB of `original` or 118 KB of `markdown`
 * that only the panel on screen reads. */
function withheldText(document) {
  const { markdown, original, ...rest } = document;
  return { ...rest, textWithheld: true };
}

export function sliceColumn(column, payload, wanted) {
  if (payload === null || payload === undefined) return payload;
  const { documents, behaviours } = wanted;
  if (column === "payload") {
    if (!behaviours) return payload;
    /* citationIndex reads the paragraphs of every behaviour, so it is built from
     * the whole column before anything is taken out of it. */
    const citedBy = citationIndex(payload);
    return { ...payload,
             behaviours: (payload.behaviours || []).map(b =>
               behaviours.has(b.slug) ? b : withheldParagraphs(b)),
             citedBy };
  }
  if (column === "documents") {
    if (!documents) return payload;
    return { ...payload,
             documents: (payload.documents || []).map(d =>
               documents.has(d.id) ? d : withheldText(d)) };
  }
  if (column === "links") return sliceLinks(payload, wanted);
  return payload;
}
