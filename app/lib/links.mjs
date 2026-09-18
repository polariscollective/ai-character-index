/**
 * What one document's passage does to another's, read from the tables.
 *
 * A port of engine/panel/link_reader_data.py, which built the same shape into a
 * file beside the reader. That file was a rendering of rows that were already in
 * the database, and being a file it could only ever hold one run: the reader has
 * been showing a single pair of documents because link_reader_data was pointed at
 * one run's report at a time. Reading the tables lifts that limit, so every pair
 * the index has compared arrives at once and the reader picks the pair it is
 * showing.
 *
 * The rules below are the Python's, and the reasons are its reasons. Where the
 * two differ it is because the arbitration table is flat and the file it replaced
 * was nested: `relation` plus `stricter_document` here, one `settled` object
 * there.
 *
 * ORDER IS NOT SET HERE
 *
 * The Python sorted a paragraph's bubbles into the order their targets appear in
 * the other document, which it could do because it had the document text to
 * number. A route would have to load megabytes to answer the same question, and
 * the reader already computes that order to render the page. So bubbles come
 * unsorted and the reader sorts them.
 */

import { select } from "./supabase.mjs";

/* Labs name themselves. capitalize() would write "Openai". */
const LABS = { openai: "OpenAI", anthropic: "Anthropic", alibaba: "Alibaba" };

/**
 * "the Anthropic constitution", from a locator or a document id.
 *
 * The id is <lab>--<document>@<version>, and a reader wants the lab and the
 * document, not the version they are already looking at.
 */
export function documentName(locator) {
  const head = String(locator || "").split(" > ")[0].split("@")[0];
  const cut = head.indexOf("--");
  const lab = cut < 0 ? head : head.slice(0, cut);
  const name = cut < 0 ? "" : head.slice(cut + 2);
  const said = LABS[lab] || (lab ? lab[0].toUpperCase() + lab.slice(1) : lab);
  return `the ${said} ${name.replace(/-/g, " ")}`.trimEnd();
}

/**
 * A sentence with our document ids replaced by their names.
 *
 * A judge writes "openai--model-spec@2026-08-18 permits...", which is exact and
 * unreadable. The reader is a person looking at two specifications, not at our
 * identifier scheme. Longest first, so a bare spec id inside a full document id
 * is not replaced before the whole of it.
 */
export function inPlainWords(sentence, documentIds) {
  let said = String(sentence || "");
  for (const id of [...documentIds].sort((a, b) => b.length - a.length)) {
    said = said.split(id).join(documentName(id));
    said = said.split(id.split("@")[0]).join(documentName(id));
  }
  return said;
}

/**
 * A judge's sentence with its deictics replaced by the documents they meant.
 *
 * The judges wrote "the source requires... while the target imposes...", which is
 * true of the call they answered and false of the reader's page: the same link is
 * shown under both documents, and there "the source" points at whichever one you
 * are standing in. The referent is known exactly, so it is substituted.
 */
export function sayWhich(comment, sourceLocator, targetLocator) {
  let said = String(comment || "");
  if (!said) return said;
  for (const [word, locator] of [["source", sourceLocator], ["target", targetLocator]]) {
    const name = documentName(locator);
    for (const phrase of [`the ${word} document`, `The ${word} document`,
                          `the ${word}`, `The ${word}`]) {
      const replacement = phrase[0] === phrase[0].toLowerCase()
        ? name
        : name[0].toUpperCase() + name.slice(1);
      said = said.split(phrase).join(replacement);
    }
  }
  return said;
}

/**
 * An arbiter's relation, expressed from the passage the bubble sits on.
 *
 * The arbiter names the document that demands more, which is the same claim from
 * either side. A bubble is read from one side, so the relative word is put back
 * here, at the last moment, where the side is known.
 */
export function asSeenFrom(relation, sourceLocator) {
  if (!relation || !relation.startsWith("stricter ")) return relation;
  const stricter = relation.slice("stricter ".length).trim();
  return String(sourceLocator).startsWith(stricter) ? "stricter_source" : "stricter_target";
}

/**
 * A judge's direction-relative relation, with the document named instead.
 *
 * "stricter_source" is a fact about the call, not about the pair: read from the
 * other side the same claim is "stricter_target". Named once, it survives being
 * read from either end.
 */
export function namedRelation(relation, sourceLocator, targetLocator) {
  if (relation === "stricter_source") return `stricter ${String(sourceLocator).split(" > ")[0]}`;
  if (relation === "stricter_target") return `stricter ${String(targetLocator).split(" > ")[0]}`;
  return relation;
}

const pairKey = (a, b) => [a, b].sort().join("\n");

/**
 * {pair: verdict} for every dispute an arbiter answered.
 *
 * The table is flat where the file this replaced was nested: a relation of
 * "stricter" carries the document in its own column, and the named form the rest
 * of this module speaks is rebuilt here rather than stored twice.
 */
export function verdictsByPair(arbitrations) {
  const out = new Map();
  for (const row of arbitrations) {
    if (!row.relation) continue;
    const named = row.relation === "stricter"
      ? `stricter ${row.stricter_document}`
      : row.relation;
    out.set(pairKey(row.first_locator, row.second_locator), {
      named,
      why: row.why || "",
      agrees: row.agrees,
      arbiter: row.arbiter,
      readings: row.readings || {},
    });
  }
  return out;
}

/**
 * (what the page shows, what the record keeps).
 *
 * The page gets the sentence that decided the relation and nothing else: a reader
 * wants to know how these two paragraphs stand to each other, and a name like
 * "fable" answers a question they did not ask. The rest is kept beside it, where
 * it is what a bug report needs.
 */
export function explain(verdict, sourceLocator, targetLocator, documentIds) {
  const shown = inPlainWords(verdict.why, documentIds);
  const trace = [];
  for (const judge of Object.keys(verdict.readings).sort()) {
    for (const reading of verdict.readings[judge] || []) {
      const was = asSeenFrom(reading.relation, sourceLocator);
      const said = sayWhich(reading.comment || "", sourceLocator, targetLocator);
      trace.push(`${judge} had said ${was}${said ? `: ${said}` : ""}`);
    }
  }
  if (verdict.agrees) trace.push(`${verdict.arbiter} agrees with ${verdict.agrees}`);
  return { shown, trace: trace.join("; ") };
}

/**
 * {locator: [{to, relation, comment, judge, settled, trace, behaviours}]}.
 *
 * A relation is a fact about a PAIR of paragraphs, so both of them carry it.
 * Emitting it only under the passage a call happened to start from left one
 * paragraph pointing at another that pointed back at nothing, which reads as an
 * inconsistency and is only an artefact of which direction found it first.
 *
 * `behaviours` is every behaviour whose call drew the pair, so the reader can
 * show a bubble under the subject it was found for rather than under all of them
 * at once. A pair drawn under several keeps one entry and lists them all: a
 * relation is a fact about two paragraphs, and the behaviour is the context the
 * question was asked in, not part of the answer.
 *
 * Where an arbiter settled a pair, its relation is the one shown and its sentence
 * is the explanation; a pair it called `none` carries no bubble at all. The
 * arbiter corrects the judge on screen and never adds to it: a pair no judge drew
 * does not appear, however well settled it is.
 */
export function byLocator(links, verdicts, documentIds) {
  const pairs = new Map();

  /* A pair found from both sides carries two rationales, one written looking
   * each way. Both are true and only one is shown, so which one is kept must not
   * depend on the order rows came back in: sorted here, the same pair yields the
   * same sentence on every read. The side whose document sorts first wins, for
   * no reason beyond needing a rule that is stable and can be stated. */
  const ordered = [...links].sort((a, b) =>
    String(a.source_locator).localeCompare(String(b.source_locator))
    || String(a.target_locator || "").localeCompare(String(b.target_locator || "")));

  for (const link of ordered) {
    if (!link.target_locator) continue;      // an absence is not a bubble
    const key = pairKey(link.source_locator, link.target_locator);
    const held = pairs.get(key);
    if (held) {
      held.behaviours.add(link.behaviour_slug);
      continue;
    }
    const verdict = verdicts.get(key);
    if (verdict) {
      const { shown, trace } = explain(verdict, link.source_locator,
                                       link.target_locator, documentIds);
      pairs.set(key, {
        named: verdict.named, comment: shown, trace, settled: true,
        judge: verdict.arbiter, behaviours: new Set([link.behaviour_slug]),
        locators: [link.source_locator, link.target_locator],
      });
      continue;
    }
    pairs.set(key, {
      named: namedRelation(link.relation, link.source_locator, link.target_locator),
      comment: inPlainWords(
        sayWhich(link.rationale || "", link.source_locator, link.target_locator),
        documentIds),
      trace: "", settled: false, judge: link.model,
      behaviours: new Set([link.behaviour_slug]),
      locators: [link.source_locator, link.target_locator],
    });
  }

  const out = {};
  for (const entry of pairs.values()) {
    const [left, right] = entry.locators;
    for (const [from, to] of [[left, right], [right, left]]) {
      const relation = asSeenFrom(entry.named, from);
      if (!relation || relation === "none") continue;
      const row = {
        to, relation, judge: entry.judge, settled: entry.settled,
        comment: entry.comment, behaviours: [...entry.behaviours].sort(),
      };
      if (entry.trace) row.trace = entry.trace;
      (out[from] ||= []).push(row);
    }
  }
  return out;
}

/**
 * The newest row per key wins.
 *
 * Every table here carries the prompt's digest in its unique key, so improving a
 * prompt writes a new row beside the old one rather than over it. A reader takes
 * the newest, the way the engine already takes the newest run of a cell.
 */
function newestBy(rows, key) {
  const out = new Map();
  for (const row of [...rows].sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || "")))) {
    if (row.body) out.set(key(row), row);
  }
  return out;
}

/**
 * The two documents each run compared, sorted, by run id.
 *
 * A run IS a pair: every call in it names the same two versions, in one order or
 * the other. That was implicit while the Python built one file per run, and it
 * has to be carried explicitly now that four runs are merged into one answer.
 */
export function pairsByRun(calls, documentOf) {
  const pairs = new Map();
  for (const call of calls) {
    const seen = pairs.get(call.run_id) || new Set();
    seen.add(documentOf.get(call.source_version_id));
    seen.add(documentOf.get(call.target_version_id));
    seen.delete(undefined);
    pairs.set(call.run_id, seen);
  }
  return new Map([...pairs].map(([id, seen]) => [id, [...seen].sort()]));
}

/**
 * The reading of a paragraph's counterparts, as a row the reader can filter.
 *
 * `about` is the whole point. This paragraph's note was written against ONE
 * other document, and it names that document in its first sentence. Without the
 * pair on the row the reader cannot tell which comparison it belongs to, and it
 * showed the Anthropic note beside an OpenAI-against-OpenAI bubble: one bubble
 * on screen, and a sentence summarising seven that were not.
 */
export function summaryRow(note, about) {
  return {
    relation: "summary",
    comment: note.body,
    behaviours: [note.behaviour_slug],
    settled: false,
    judge: note.model || null,
    about: about || [],
  };
}

/**
 * How a comparison text is addressed: its behaviour, then its two documents.
 *
 * The documents are sorted, so the reader can build the same key from the pair
 * on screen without knowing which side each document was read from. The reader
 * writes this key by hand, in comparisonFor: the two spellings must agree, and
 * the test below is what holds them to it.
 */
export function comparisonKey(slug, documents) {
  return [slug, ...[...(documents || [])].sort()].join("\n");
}

/**
 * How a passage's reading is addressed: behaviour, paragraph, then its pair.
 *
 * The pair is the load-bearing part, and it was missing. A passage that takes
 * part in three comparisons gets three readings, one per pair, each naming the
 * document it was written against. Deduplicating them on behaviour and locator
 * alone keeps one and drops the rest, so two comparisons out of three would show
 * no reading at all: the same collapse that served one pair's text everywhere,
 * in a third place. It is invisible today only because these exist for one pair.
 */
export function passageNoteKey(slug, locator, documents) {
  return [slug, locator, ...[...(documents || [])].sort()].join("\n");
}

/**
 * Everything the reader needs about links, in the shape its file carried.
 *
 * One request per table rather than one per run: the tables are small enough to
 * read whole, and four round trips beat sixteen.
 */
export async function readerLinks(fetchImpl = fetch, runIds = null, notePrompts = null) {
  /* A publication names the runs it carries. Nothing guesses them: which runs
   * the public sees is a decision a publication records. */
  const runs = (runIds || []).map(id => ({ id }));
  const runIdSet = new Set(runs.map(run => run.id));
  if (!runIdSet.size) return { documents: [], byLocator: {}, comparisons: {}, notes: {} };

  const [calls, versions, arbitrations, summaries, passageNotes, documentNotes] =
    await Promise.all([
      select("aci_link_calls",
             "select=id,run_id,behaviour_slug,model,status,source_version_id,target_version_id",
             fetchImpl),
      select("aci_spec_versions", "select=id,spec_id,version", fetchImpl),
      select("aci_link_arbitrations",
             "select=run_id,first_locator,second_locator,relation,stricter_document,"
             + "why,agrees,arbiter,readings", fetchImpl),
      select("aci_link_summaries",
             "select=run_id,behaviour_slug,document_ids,model,body,created_at", fetchImpl),
      select("aci_passage_notes",
             "select=run_id,behaviour_slug,locator,body,model,created_at", fetchImpl),
      select("aci_document_notes",
             "select=behaviour_slug,document_id,kind,body,created_at,prompt_sha256", fetchImpl),
    ]);

  const documentOf = new Map(versions.map(v => [v.id, `${v.spec_id}@${v.version}`]));
  const mine = calls.filter(call => runIdSet.has(call.run_id) && call.status === "done");
  const pairOf = pairsByRun(mine, documentOf);
  const callById = new Map(mine.map(call => [call.id, call]));
  const documentIds = new Set();
  for (const call of mine) {
    documentIds.add(documentOf.get(call.source_version_id));
    documentIds.add(documentOf.get(call.target_version_id));
  }
  documentIds.delete(undefined);

  const rows = await select(
    "aci_links", "select=call_id,source_locator,target_locator,relation,rationale", fetchImpl);
  const links = [];
  for (const row of rows) {
    const call = callById.get(row.call_id);
    if (!call) continue;                       // another run's, or the pilot's
    links.push({ ...row, behaviour_slug: call.behaviour_slug, model: call.model });
  }

  const verdicts = verdictsByPair(arbitrations.filter(row => runIdSet.has(row.run_id)));

  /* One text per behaviour AND per pair, because that is how they were written.
   *
   * Keyed by behaviour alone, the four pairs collapsed onto one another and the
   * newest won: all thirteen behaviours served the Alibaba against OpenAI text,
   * whichever two documents the reader had on screen. The pair was in the table
   * the whole time, in document_ids, and this did not even ask for it. */
  const comparisons = {};
  for (const [key, row] of newestBy(
    summaries.filter(s => runIdSet.has(s.run_id)),
    s => comparisonKey(s.behaviour_slug, s.document_ids))) {
    comparisons[key] = { writtenBy: row.model, text: row.body };
  }

  const cells = (map) => Object.fromEntries(
    [...map.values()].map(row => [
      row.locator ? `${row.behaviour_slug}\n${row.locator}`
                  : `${row.behaviour_slug}\n${row.document_id}`,
      { text: row.body },
    ]));

  const rowsByLocator = byLocator(links, verdicts, documentIds);

  /* The reading of a paragraph's counterparts, at the head of its own row.
   *
   * It is not a counterpart itself, so it carries no locator to travel to, and
   * its words ride in `comment` because that is the field the reader already
   * discloses under a pill. A paragraph gets one per behaviour: the bubbles
   * under it are filtered by behaviour, and a summary of a row the reader is not
   * looking at would describe the wrong thing.
   *
   * These were briefly returned beside the bubbles rather than among them, which
   * reads as a tidier shape and loses every "in short" pill on the page: the
   * reader looks for them in byLocator and nowhere else. */
  const passageNewest = newestBy(
    passageNotes.filter(n => runIdSet.has(n.run_id)),
    n => passageNoteKey(n.behaviour_slug, n.locator, pairOf.get(n.run_id)));
  for (const note of passageNewest.values()) {
    (rowsByLocator[note.locator] ||= []).unshift(
      summaryRow(note, pairOf.get(note.run_id)));
  }

  /* Document notes carry no run: they are keyed by the prompt that wrote them, and
   * that is what a publication pins. Given no list, take them all, which is what a
   * reader outside a publication wants. */
  const notes = Array.isArray(notePrompts) && notePrompts.length
    ? documentNotes.filter(note => notePrompts.includes(note.prompt_sha256))
    : documentNotes;

  return {
    documents: [...documentIds].sort(),
    runs: runs.map(run => run.id),
    byLocator: rowsByLocator,
    comparisons,
    notes: {
      passage: Object.fromEntries(
        [...passageNewest].map(([key, row]) => [key, { text: row.body }])),
      depth: cells(newestBy(notes.filter(n => n.kind === "depth"),
                            n => `${n.behaviour_slug}\n${n.document_id}`)),
      standing: cells(newestBy(notes.filter(n => n.kind === "standing"),
                               n => `${n.behaviour_slug}\n${n.document_id}`)),
    },
  };
}
