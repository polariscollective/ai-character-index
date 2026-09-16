/*
 * Spec reader -- every specification in full with a behaviour menu laid over them.
 * The behaviour set and its per-passage citations come from a panel run
 * (engine/panel/build_site_data.py), served by /api/reader/payload and resolved
 * from a ?publication=<uuid> pin or the current publication (see loadBehaviours);
 * each citation carries per-model verdicts scored into tiers --
 * defining / core / related -- which the header band toggles show or hide
 * (applyPanelThreshold); and the menu is a checklist, so any number of behaviours
 * can be read over the same text at once, side by side in the compare view when it
 * is open. Each behaviour carries its own colour, a core passage is that colour at
 * full strength and a related one the same colour washed out, and a passage cited
 * by more than one selected behaviour blends their colours and shows one gutter
 * rule per behaviour. Colour distinguishes the behaviours; the margin rule's
 * texture distinguishes the groups -- see GROUP_TEXTURE below. The spec text is
 * /api/reader/documents, built by engine/build-spec-reader-data.py.
 */

const DOCUMENTS_URL = "/api/reader/documents";
/* Which publication the reader shows, resolved in this order:
 *   1. ?publication=<uuid> -- a pin, which lets one publication be linked to and
 *      compared against another long after a newer one has gone live;
 *   2. the current publication, which is the newest one.
 * A pin that fails falls through to the current publication, so a stale link never
 * breaks the page; the sidebar run block says when that happened, because a dead
 * link and a live one are otherwise indistinguishable.
 *
 * There is no third step any more. The manifest was a ledger of local runs and the
 * shipped fallback existed for a fresh clone, and neither has anything left to
 * protect now that the payload comes from a route. */
const PAYLOAD_URL = "/api/reader/payload";
/* What a behaviour IS, as opposed to what a run found: its definition, the
 * frontier of its construct, where that definition came from, and whether
 * anyone has written either. Read from the registry rather than carried in the
 * payload, because a payload is materialised at publication time and this
 * changes when someone edits a behaviour. */
const BEHAVIOUR_NOTES_URL = "/api/reader/behaviours";
const PUBLICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Whether a ?publication= pin may be asked for. The route validates it too; this
 * side refuses first so a malformed link costs no request. Mirrors
 * app/lib/publications.mjs::isPublicationId(). */
function payloadName(id) {
  return typeof id === "string" && PUBLICATION_ID.test(id);
}

function payloadUrl(id) {
  return id ? `${PAYLOAD_URL}?publication=${encodeURIComponent(id)}` : PAYLOAD_URL;
}

/* A link to one passage: ?passage=<locator>. The locator is the citation the
 * export already prints, and its head names the document it points into, so the
 * link needs nothing else to open the reader at it (see openPassageLink). */
const PASSAGE_PARAM = "passage";

/* "openai--model-spec@2026-08-18 > #levels_of_authority > ¶2" -> its document. */
function locatorHead(locator) {
  return String(locator || "").split(" > ")[0].trim();
}

/* The document a locator's head names. A head is the document id; locators
 * written before ids carried their lab end the id instead ("second@2026-02-01"
 * for "acme--second@2026-02-01"), and still find it. */
function documentForLocator(documents, locator) {
  const head = locatorHead(locator);
  if (!head) return null;
  return documents.find(doc => doc.id === head)
    || documents.find(doc => String(doc.id).endsWith(`--${head}`))
    || null;
}

/* A link that opens the reader at a passage. Only the passage travels, and the
 * publication when the reader is pinned to one: the rest of the view is the
 * reader's who copied it, and the link chooses what it needs when it opens. */
function passageLink(href, locator, publication) {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  if (publication) url.searchParams.set("publication", publication);
  url.searchParams.set(PASSAGE_PARAM, locator);
  return url.toString();
}

function passageFromSearch(search) {
  return new URLSearchParams(search).get(PASSAGE_PARAM);
}

/* The link opened the reader once. Once the reader moves on, stepping to
 * another passage included, it no longer describes the page. */
function dropPassageParam() {
  const params = new URLSearchParams(location.search);
  if (!params.has(PASSAGE_PARAM)) return;
  params.delete(PASSAGE_PARAM);
  history.replaceState(null, "", `${location.pathname}?${params}${location.hash}`);
}

/* Resolves the payload AND records which source won, in state.payloadSource:
 * {origin: "pin"|"current", name, requested}. `requested` is set only when a pin was
 * asked for and not served, which is exactly the case worth flagging. */
async function loadBehaviours() {
  const pinned = new URLSearchParams(location.search).get("publication");
  if (payloadName(pinned)) {
    const url = payloadUrl(pinned);
    try {
      const payload = await loadJSON(url);
      state.payloadSource = { origin: "pin", name: pinned };
      return payload;
    } catch (error) {
      console.warn(`Pinned publication ${pinned} unavailable (${error.message}); falling back.`);
    }
  }
  // Two different failures, and the reader deserves to know which: a well-formed pin
  // that could not be fetched (a publication that is gone) versus one payloadName()
  // refuses outright. Both fall through by design.
  const requested = pinned ? { name: pinned, refused: !payloadName(pinned) } : null;
  const payload = await loadJSON(payloadUrl(null));
  state.payloadSource = { origin: "current", name: "current publication", requested };
  return payload;
}

/* Loaded once, beside the payload. A behaviour the registry does not describe
 * still gets a note saying so, because "nobody has written what this means" is
 * an answer and an empty popover is not. */
let behaviourNotes = null;

async function loadBehaviourNotes() {
  try {
    // The same publication the payload came from, so a pinned draft's notes
    // describe that draft rather than what the public is being shown.
    const pinned = state.payloadSource?.origin === "pin" ? state.payloadSource.name : null;
    behaviourNotes = await loadJSON(
      pinned ? `${BEHAVIOUR_NOTES_URL}?publication=${encodeURIComponent(pinned)}`
             : BEHAVIOUR_NOTES_URL);
  } catch (error) {
    console.warn(`Behaviour notes unavailable (${error.message}).`);
    behaviourNotes = {};
  }
}

/* The specification text, from the publication the payload resolved to.
 *
 * Documents are per publication and their ids carry a version, so a draft's
 * payload beside the current publication's documents matches nothing: every
 * tier reads 0 and the reader settles on a document the draft does not carry,
 * which is what fetching them unpinned did. Read after loadBehaviours and from
 * state.payloadSource rather than from the URL, so a pin that fell back reads
 * the current publication's documents with its payload. */
async function loadDocuments() {
  const pinned = state.payloadSource?.origin === "pin" ? state.payloadSource.name : null;
  return loadJSON(
    pinned ? `${DOCUMENTS_URL}?publication=${encodeURIComponent(pinned)}` : DOCUMENTS_URL);
}

/* The note a reader opens beside a behaviour. It answers the question an
 * unexpected label raises -- where does this behaviour stop -- which the reader
 * could not answer at all: the passage popover says what the judges decided,
 * and nothing said what they were asked. */
function openBehaviourNote(button) {
  const note = elements.keyNote;
  if (!note || typeof note.showPopover !== "function") return;
  const slug = button.dataset.behaviourNote;
  const entry = (behaviourNotes || {})[slug];
  if (!entry) return;

  elements.keyNoteTitle.textContent = entry.name;
  const body = document.createElement("div");

  /* Four states, not two. Written-for-a-panel and judged are independent, and
   * the combination that reads like a contradiction is the one that exists: this
   * index carries a behaviour a panel answered for without the brief it was
   * given being recorded beside it. Saying "nobody has written what this means"
   * there would be half a truth; saying nothing would be none. What is NOT
   * claimed here is anything about the panel's composition -- whether the same
   * models answered for every specification is a property of a publication, not
   * of the registry this note reads. */
  const line = document.createElement("p");
  line.className = "behaviour-note-state";
  line.textContent = entry.defined
    ? (entry.judged ? "Written for a panel, and judged."
                    : "Written for a panel, not yet judged.")
    : (entry.judged ? "Judged, but the brief the panel was given was not recorded with the behaviour."
                    : "Tracked, written for no panel, and not yet judged.");
  body.append(line);

  const section = (heading, text) => {
    if (!text) return;
    const h = document.createElement("h3");
    h.textContent = heading;
    const p = document.createElement("p");
    p.textContent = text;          // never innerHTML: this is registry prose
    body.append(h, p);
  };
  section("What the judges are asked", entry.query);
  // A separate heading, because it is a separate sentence. One behaviour here is
  // described by the index and was never written for a panel, and printing its
  // description as the brief would claim a judge had read it.
  section("How the index describes it", entry.described);
  section("Where the construct stops", entry.boundary);
  section("Where the definition comes from", entry.source);

  /* The depth figure beside the behaviour's name lives in a hover title, which a
   * keyboard user never reaches and a screen reader never hears: this section says
   * the same thing in words, reusing depthSummaryLine so it is the same words as
   * the figure's own tooltip, not a second copy of the formatting. The judges'
   * individual depths and rationale live only here -- the figure has no room for
   * them and the tooltip never carried them past a parenthesis. */
  const behaviour = payloadBehaviours().find(b => b.slug === slug);
  const shownDocuments = visibleDocuments().filter(Boolean);
  if (shownDocuments.length) {
    const depthHeading = document.createElement("h3");
    depthHeading.textContent = "How deeply the documents on screen cover it";
    body.append(depthHeading);
    shownDocuments.forEach(doc => {
      const depth = panelDepth(behaviour, doc.id);
      const p = document.createElement("p");
      p.textContent = depthSummaryLine(doc, depth);   // never innerHTML: rationale is model output
      body.append(p);
      /* A judge that could not answer this cell at all was replaced here, and the
       * database published the cell only because the substitution was recorded.
       * The judges listed below then name the substitute, which is true; this says
       * why, beside the document it happened on and no other. */
      const substitutions = behaviour?.coverage?.[doc.id]?.substitutions;
      (Array.isArray(substitutions) ? substitutions : []).forEach(({ seat, substitute, reason }) => {
        const said = document.createElement("p");
        // The reason is a database column, not composed copy: it may end mid-sentence.
        said.textContent = `On ${doc.title} ${doc.version}, ${substitute} judged in place of ${seat}: ${endedSentence(reason)}`;
        body.append(said);
      });
      if (depth) {
        const judges = document.createElement("ul");
        judges.className = "behaviour-note-depth-judges";
        Object.entries(depth.judges || {}).forEach(([judge, given]) => {
          const item = document.createElement("li");
          const rationale = given.rationale ? ` ${given.rationale}` : "";
          item.textContent = `${judge}: ${given.depth}.${rationale}`;
          judges.append(item);
        });
        body.append(judges);
      }
    });
  }

  elements.keyNoteBody.replaceChildren(...body.childNodes);
  if (note.matches(":popover-open")) note.hidePopover();
  note.showPopover();
  placeKeyNote(button);
}

/* Shown for a document when no behaviour is under test. */
const NO_COVERAGE = { passages: [] };

/* Behaviour colours live in the stylesheet, one --hue-N per slot and one set per
 * surface, so a palette switch repaints every highlight without re-annotating. */
const HUE_SLOTS = 12;

/* Colour separates the behaviours; texture separates the groups they belong to. A group
 * whose rows are defined by a filter over the specs -- passages that bear on the subject
 * without ever naming it -- carries a broken margin rule where the others carry a solid
 * one, so the indirectness of the reading is legible beside the passage. The texture is
 * kept in the margin and out of the wash on purpose: anything laid over the text itself,
 * added or knocked out, costs more in legibility than the distinction is worth. Groups not
 * listed here take the solid rule. Keyed by the `category` the ledger gives the behaviour. */
const GROUP_TEXTURE = { "General Guidelines": "stipple" };

function behaviourTexture(behaviour) {
  return GROUP_TEXTURE[behaviour.category] || "wash";
}

const state = {
  payload: null,
  rawBehaviours: null,   // unfiltered panel data; the tier toggles re-filter from this
  bands: null,           // Set of "defining" | "core" | "related" -- which tiers render
  selectedSlugs: [],
  /* Which document is on screen. Null until the payload arrives: it used to
   * default to the string "anthropic", which assumed a lab the index happens to
   * carry and rendered nothing at all against a payload without it. */
  selectedSpec: null,
  comparing: false,
  embedded: false,
  /* Which panel the keyboard walks. The passages themselves live on the panels
   * — `panel._anchors` and `panel._passageIndex` — because the panels are
   * re-cloned on every rebuild and so is their contents; only the choice of
   * which one has the reader's attention outlives that. */
  activePanel: null,
  documentFocus: { anthropic: false, openai: false },
  sidebarWidth: 292,
  sidebarCollapsed: false,
  compareFirst: 50,
  comparePair: null,   // [idA, idB]; null = the first two documents
  /* The document that was on the right the last time the reader compared.
   * Leaving compare keeps the left-hand document and drops the right one from
   * the screen; coming back to a different second document than the one you
   * chose would undo a choice the reader made rather than restore it. */
  compareRight: null,
  /* What the open feedback dialog is about -- {locator, behaviours} from
   * feedbackSubject, or null while it is closed. Read by the send handler. */
  feedbackTarget: null,
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  behaviourCount: document.querySelector("#behaviour-count"),
  behaviourList: document.querySelector("#behaviour-list"),
  behaviourToolbar: document.querySelector("#behaviour-toolbar"),
  clearBehaviours: document.querySelector("#clear-behaviours"),
  documentReader: document.querySelector("#document-reader"),
  downloadHint: document.querySelector("#download-hint"),
  downloadPassages: document.querySelector("#download-passages"),
  mode: document.querySelector("#mode"),
  compareToggle: document.querySelector("#compare-toggle"),
  readerStatus: document.querySelector("#reader-status"),
  selectAllBehaviours: document.querySelector("#select-all-behaviours"),
  sidebarResizer: document.querySelector("#sidebar-resizer"),
  sidebarToggle: document.querySelector("#sidebar-toggle"),
  specPicker: document.querySelector("#spec-picker"),
  keyNote: document.querySelector("#key-note"),
  keyNoteTitle: document.querySelector("#key-note-title"),
  keyNoteBody: document.querySelector("#key-note-body"),
  originalNote: document.querySelector("#original-note"),
  originalNoteLabel: document.querySelector("#original-note-label"),
  originalNoteBody: document.querySelector("#original-note-body"),
  depthNote: document.querySelector("#depth-note"),
  depthNoteTitle: document.querySelector("#depth-note-title"),
  depthNoteBody: document.querySelector("#depth-note-body"),
  template: document.querySelector("#document-template"),
  feedbackDialog: document.querySelector("#feedback-dialog"),
  feedbackForm: document.querySelector("#feedback-form"),
  feedbackTitle: document.querySelector("#feedback-title"),
  feedbackClose: document.querySelector("#feedback-close"),
  feedbackCancel: document.querySelector("#feedback-cancel"),
  feedbackSend: document.querySelector("#feedback-send"),
  feedbackLocator: document.querySelector("#feedback-locator"),
  feedbackBehavioursField: document.querySelector("#feedback-behaviours-field"),
  feedbackBehaviours: document.querySelector("#feedback-behaviours"),
  feedbackComment: document.querySelector("#feedback-comment"),
  feedbackEmail: document.querySelector("#feedback-email"),
  feedbackPrivate: document.querySelector("#feedback-private"),
  feedbackName: document.querySelector("#feedback-name"),
  feedbackWebsite: document.querySelector("#feedback-website"),
  feedbackOutcome: document.querySelector("#feedback-outcome"),
};

/* Display tiers for panel-scored passages, strongest first. Per cell with j judges:
 * defining is score >= 2j+1 (a "3" vote must be present -- on 3-point data this
 * clamps to unanimous core), core is score >= 2j (unanimous-core strength), related
 * is score >= j+1 (at least two judges behind it) -- except a single-judge cell has
 * no consensus to demand (the clone/fork cheap-run case): the sole judge's verdict
 * IS the whole evidence, so their related vote renders at its own weight instead of
 * dying under the multi-judge floor. Weaker citations never render: with two-plus
 * judges a lone related vote is recorded in the data, not shown. Each tier is a
 * toggle in the document headers. The defaults show all three: related is drawn in
 * the same colour thinned (--tint-related, --rule-related), so it reads as the weaker
 * claim without waiting behind a toggle, and the toggles still narrow the view. */
const TIERS = ["defining", "core", "related"];
const DEFAULT_BANDS = ["defining", "core", "related"];

/* The tier band for one passage score in one cell, or null when below every tier.
 * `related` is the related-vote weight (display tuning, default 1): for a
 * single-judge cell it sets the related cut so the lone vote renders at its own
 * weight; with the weight set to 0 the user has zeroed related votes, so they
 * stay hidden (cut falls back to 1). Extracted verbatim-friendly for
 * engine/panel/test_appjs_tiers.js. */
/* The scores a cell can actually produce. applyPanelThreshold tallies each passage as
 * `sum over judges of (v >= 2 ? v : v === 1 ? related : 0)`, so a judge contributes one
 * of {0, related, 2..maxVerdict} -- NOT any integer. With a fractional ?related= weight
 * the reachable set is sparse, and assuming a contiguous 0..maxCell range invents scores
 * no passage can hold. */
function achievableScores(judges, maxCell, related) {
  const maxVerdict = judges > 0 ? Math.round(maxCell / judges) : 2;
  const perJudge = [0, ...(related > 0 ? [related] : []),
                    ...Array.from({ length: Math.max(0, maxVerdict - 1) }, (_, i) => i + 2)];
  let sums = new Set([0]);
  for (let j = 0; j < judges; j += 1) {
    const next = new Set();
    sums.forEach(s => perJudge.forEach(v => next.add(s + v)));
    sums = next;
  }
  return sums;
}

/* The strongest band among several, or null if none is set. A block can carry more
 * than one behaviour's citation, and a passage that is defining for one and related to
 * another should be named by the stronger claim. */
function strongestBand(bands) {
  return TIERS.find(tier => bands.includes(tier)) || null;
}

/* "defining" -> "Defining". The tier vocabulary is what the header toggles call these,
 * so the rail and the export must use the same words. */
function bandLabel(band) {
  return band ? band[0].toUpperCase() + band.slice(1) : "Scored";
}

/* Which tiers a cell can actually put a passage in. The cuts can collide: on a 3-point
 * rubric maxCell is 2j, so the defining cut clamps onto the core cut and NO score can
 * land in core -- its toggle would sit in the header doing nothing. Answered by asking
 * tierBand about every score the cell can actually produce, so the two cannot disagree
 * by construction: a band is reachable exactly when some achievable score lands in it.
 * (Deriving it from the cuts alone gets j=2 / maxCell=4 / ?related=0.5 wrong -- the
 * related cut of 3 sits between the achievable 2.5 and 4.) Pure, like tierBand, so
 * engine/panel/test_appjs_tiers.js can extract and pin it. */
function bandReachable(judges, maxCell, related) {
  const hit = { defining: false, core: false, related: false };
  achievableScores(judges, maxCell, related).forEach(score => {
    const band = tierBand(score, judges, maxCell, related);
    if (band) hit[band] = true;
  });
  return hit;
}

function tierBand(score, judges, maxCell, related) {
  const defCut = Math.min(2 * judges + 1, maxCell || 2 * judges + 1);
  const relatedCut = judges > 1 ? judges + 1 : related > 0 ? related : 1;
  return score >= defCut ? "defining"
    : score >= 2 * judges ? "core"
    : score >= relatedCut ? "related"
    : null;
}

const initialParams = new URLSearchParams(location.search);
state.embedded = initialParams.get("embedded") === "1";
document.body.classList.toggle("embedded", state.embedded);

function payloadBehaviours() {
  return state.payload?.behaviours || [];
}

/* The ticked behaviours, always in menu order: the order decides which colour a passage
 * blend starts from and the order of the rules in a shared passage's gutter. */
function selectedBehaviours() {
  return payloadBehaviours().filter(behaviour => state.selectedSlugs.includes(behaviour.slug));
}

function highlightsActive() {
  return selectedBehaviours().length > 0;
}

/* A behaviour's colour is fixed by its place in the published set, not by what else is
 * ticked, so a passage keeps the same colour as the selection changes around it. */
function behaviourHue(behaviour) {
  const index = payloadBehaviours().indexOf(behaviour);
  return `var(--hue-${(Math.max(0, index) % HUE_SLOTS) + 1})`;
}

function syncURL() {
  const params = new URLSearchParams(location.search);
  if (state.selectedSlugs.length) params.set("behavior", state.selectedSlugs.join(","));
  else params.delete("behavior");
  params.set("spec", state.selectedSpec);
  if (state.comparing) {
    params.set("compare", "1");
    // Always, now that each panel picks its own document from its own title. With
    // two specifications the pair used to be forced and was left out of the URL;
    // it no longer is, because which of them sits on the left is a choice the
    // reader made and a shared link should carry.
    params.set("compare-with", comparePair().join(","));
  } else {
    params.delete("compare");
    params.delete("compare-with");
  }
  if (state.bands) {
    params.set("tiers", TIERS.filter(t => state.bands.has(t)).join(",") || "none");
    params.delete("tier");        // the toggles supersede the legacy score params
    params.delete("threshold");
    params.delete("solid");
  }
  if (state.embedded) params.set("embedded", "1");
  else params.delete("embedded");
  // A passage link is kept only while the reader is still where it opened; any
  // choice written here after that is a view of the reader's own.
  if (!state.keepPassageParam) params.delete(PASSAGE_PARAM);
  history.replaceState(null, "", `${location.pathname}?${params}${location.hash}`);
  if (state.embedded) {
    window.parent.postMessage(
      {
        type: "aci-spec-reader-state",
        spec: state.selectedSpec,
        comparing: state.comparing,
      },
      location.origin,
    );
  }
}

function setPalette(palette) {
  const selected = ["daylight", "umber"].includes(palette) ? palette : "daylight";
  document.body.dataset.palette = selected;
  const night = selected === "umber";
  elements.mode.textContent = night ? "☼" : "☾";
  elements.mode.title = night ? "Back to daylight" : "Switch to umber";
  elements.mode.setAttribute(
    "aria-label",
    night ? "Switch to the daylight surface" : "Switch to the umber night surface",
  );
  try { localStorage.setItem("aci-palette", selected); } catch (error) {}
}

elements.mode.addEventListener("click", () => {
  setPalette(document.body.dataset.palette === "umber" ? "daylight" : "umber");
});

const paletteParam = new URLSearchParams(location.search).get("palette");
let savedPalette = null;
try { savedPalette = localStorage.getItem("aci-palette"); } catch (error) {}
setPalette(paletteParam || savedPalette || "daylight");

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function savedNumber(key, fallback) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch (error) {
    return fallback;
  }
}

function saveNumber(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (error) {}
}

/* Flags do not go through savedNumber, which reads anything not greater than
 * zero as absent and hands back the fallback — a deliberately expanded menu
 * would come back collapsed the day the default changed. */
function savedFlag(key) {
  try { return localStorage.getItem(key) === "1"; } catch (error) { return false; }
}

function saveFlag(key, value) {
  try { localStorage.setItem(key, value ? "1" : "0"); } catch (error) {}
}

/* A plain string remembered across sessions, empty rather than absent when
 * nothing was ever saved or the browser refuses storage -- the feedback
 * dialog's address and name fields read these back as "", never "null". */
function savedString(key) {
  try { return localStorage.getItem(key) || ""; } catch (error) { return ""; }
}

function saveString(key, value) {
  try { localStorage.setItem(key, value); } catch (error) {}
}

function setSidebarWidth(width, persist = false) {
  const desktop = window.matchMedia("(min-width: 901px)").matches;
  const maximum = desktop
    ? Math.max(200, Math.min(480, elements.appShell.clientWidth - 420))
    : 480;
  state.sidebarWidth = Math.round(clamp(width, 200, maximum));
  elements.appShell.style.setProperty("--sidebar-width", `${state.sidebarWidth}px`);
  elements.sidebarResizer.setAttribute("aria-valuenow", String(state.sidebarWidth));
  elements.sidebarResizer.setAttribute("aria-valuemax", String(maximum));
  elements.sidebarResizer.setAttribute("aria-valuetext", `${state.sidebarWidth} pixels wide`);
  if (persist) saveNumber("aci-sidebar-width", state.sidebarWidth);
}

function setCompareFirst(percent, persist = false) {
  const width = elements.documentReader.clientWidth;
  const minimum = width > 0 ? Math.min(40, (260 / width) * 100) : 20;
  const maximum = 100 - minimum - (width > 0 ? (9 / width) * 100 : 0);
  state.compareFirst = Math.round(clamp(percent, minimum, maximum) * 10) / 10;
  elements.documentReader.style.setProperty("--compare-first", `${state.compareFirst}%`);
  const resizer = elements.documentReader.querySelector(".document-resizer");
  if (resizer) {
    resizer.setAttribute("aria-valuemin", String(Math.ceil(minimum)));
    resizer.setAttribute("aria-valuemax", String(Math.floor(maximum)));
    resizer.setAttribute("aria-valuenow", String(Math.round(state.compareFirst)));
    resizer.setAttribute("aria-valuetext", `First specification ${Math.round(state.compareFirst)} percent wide`);
  }
  if (persist) saveNumber("aci-compare-first", state.compareFirst);
  requestAnimationFrame(updateRails);
}

function startColumnDrag(event, resizer, update, finish) {
  if (event.button !== 0) return;
  event.preventDefault();
  resizer.setPointerCapture(event.pointerId);
  resizer.classList.add("dragging");
  document.body.classList.add("resizing-columns");

  const move = moveEvent => update(moveEvent.clientX);
  const end = () => {
    resizer.classList.remove("dragging");
    document.body.classList.remove("resizing-columns");
    resizer.removeEventListener("pointermove", move);
    resizer.removeEventListener("pointerup", end);
    resizer.removeEventListener("pointercancel", end);
    finish();
  };
  resizer.addEventListener("pointermove", move);
  resizer.addEventListener("pointerup", end);
  resizer.addEventListener("pointercancel", end);
}

/* What each mark in the key means, and what the panel was asked for it.
 *
 * Two different things, and every note keeps them apart. A judge grades one
 * passage on a four-point scale, alone and against the behaviour's definition;
 * the reader draws a tier from what the whole panel returned. "Core" is the
 * same word on both sides of that and does not mean the same thing — one judge
 * saying core is a verdict, every judge saying core is a tier — and leaving
 * that unsaid was the confusion this key stood on for as long as it was five
 * bare words.
 *
 * The judge halves paraphrase the v5 rubric, which is the authority and lives
 * with the pipeline. Rewriting that prompt dates these. */
const KEY_NOTES = {
  defining: {
    title: "Defining",
    judge:
      "A 3, the top of the scale, and the only grade the rubric rations. It is " +
      "reserved for the document's fullest statement of the behaviour: the passage " +
      "a reader citing one single place would be sent to. The bar is relative to " +
      "the document rather than absolute. A judge who finds no passage standing " +
      "above the rest is told to award no 3 at all, and most behaviours draw " +
      "between none and three across a whole specification.",
    reader:
      "Drawn when the panel's total clears unanimous core by at least a point, " +
      "which takes a 3 from some judge on top of a panel that all called it core. " +
      "On the default three-seat panel that is seven of a possible nine.",
  },
  core: {
    title: "Core",
    judge:
      "A 2. The document establishes the behaviour here: the passage states the " +
      "norm itself, defines its criteria or factors, or sets out its decision " +
      "procedure. A single clause or list item counts for what it says about this " +
      "behaviour. The rubric sets no quota in either direction: a behaviour " +
      "carried by one load-bearing passage and merely applied everywhere else " +
      "should collect one core mark, not many, because promoting the applications " +
      "buries the passage that actually carries it.",
    reader:
      "Drawn when every judge marked the passage at least core. On the default " +
      "three-seat panel that is six of nine.",
  },
  related: {
    title: "Related",
    judge:
      "A 1, which the rubric calls adjacent. The passage bears materially on the " +
      "behaviour without establishing it: it applies or exemplifies a norm set out " +
      "elsewhere, restates it in passing while making some other point, carries " +
      "machinery the behaviour depends on, sets one of its boundaries, or is a " +
      "cross-reference a careful reader should see. However clearly such a passage " +
      "reflects the behaviour, echoing a norm is not establishing it.",
    reader:
      "Drawn when at least two judges are behind it, which is four of nine on the " +
      "default panel. A lone related vote is kept in the data and not drawn. This " +
      "tier is shown from the start, in a paler wash and a fainter margin rule than " +
      "core, so it reads as the weaker claim. The toggles in the document header " +
      "beside the version hide it, or any other tier.",
  },
  overlap: {
    title: "Shared",
    judge:
      "Nothing. No judge is asked about this, and no verdict produces it. Each " +
      "behaviour is judged against the document on its own, and none of them knows " +
      "what the others were given.",
    reader:
      "A passage that more than one of the behaviours you have ticked cites. Its " +
      "gutter then carries one rule per behaviour side by side, the wash behind it " +
      "blends their colours, and the tier it is named with is the strongest claim " +
      "any one of them makes for it. Tick a single behaviour and this mark cannot " +
      "appear.",
  },
  stipple: {
    title: "Guideline",
    judge:
      "Nothing here either. It is a property of the behaviour, decided when the " +
      "behaviour was registered, not of any passage or any verdict.",
    reader:
      "Marks the rows of the General Guidelines group. Those behaviours are defined " +
      "by a filter laid over the specifications rather than by a norm either " +
      "document names, so their passages bear on the subject without ever naming " +
      "it. Their margin rule is broken rather than solid, and that texture is the " +
      "only thing telling them apart in the text.",
  },
};

/* Beside the entry that opened it, not in the middle of the window.
 *
 * A popover renders in the top layer, where the browser centres it by default
 * and where nothing in the page can push it around. So the corner is set here,
 * from the button's own rectangle, and clamped: the note is wider than the
 * column it hangs off, and on a narrow window there is no room to its right. */
function placeKeyNote(anchor) {
  const note = elements.keyNote;
  const rect = anchor.getBoundingClientRect();
  const box = note.getBoundingClientRect();
  const gap = 10;
  const edge = 12;

  // Out of the column, not over it: anchored on the sidebar's right edge rather
  // than the entry's own, which is a 50px word in the middle of it and would
  // leave the note lying across the key it explains.
  const column = document.querySelector(".behaviour-sidebar");
  const from = column ? column.getBoundingClientRect().right : rect.right;
  let left = from + gap;
  if (left + box.width > window.innerWidth - edge) {
    left = Math.max(edge, rect.left - box.width - gap);
  }
  // Bottom-aligned on the entry: the key sits at the foot of the column, so a
  // note dropped below it would leave the window every time.
  let top = Math.min(rect.bottom - box.height, window.innerHeight - box.height - edge);
  note.style.left = `${Math.round(left)}px`;
  note.style.top = `${Math.round(Math.max(edge, top))}px`;
}

function setupKeyNotes() {
  const note = elements.keyNote;
  // No popover in this browser: the entries stay as they read, plain labels.
  // Better a key that explains nothing than one whose buttons do nothing.
  if (!note || typeof note.showPopover !== "function") {
    document.querySelectorAll(".key-item").forEach(button => { button.disabled = true; });
    return;
  }

  document.querySelectorAll(".key-item").forEach(button => {
    button.addEventListener("click", () => {
      const entry = KEY_NOTES[button.dataset.key];
      if (!entry) return;
      elements.keyNoteTitle.textContent = entry.title;
      // Our own literals, never anything read from a payload.
      elements.keyNoteBody.innerHTML =
        `<h3>What the judge is asked</h3><p>${entry.judge}</p>` +
        `<h3>What the reader draws</h3><p>${entry.reader}</p>`;
      // Re-opening an open popover throws, and moving between two entries can
      // land the click before the light dismiss has run.
      if (note.matches(":popover-open")) note.hidePopover();
      note.showPopover();
      placeKeyNote(button);
    });
  });

  // The corner was measured against a window that no longer has those edges.
  window.addEventListener("resize", () => {
    if (note.matches(":popover-open")) note.hidePopover();
  });
}

/* Folding the menu away, and remembering it folded.
 *
 * `--sidebar-width` is left alone on purpose: the grid override in the
 * stylesheet is what hides the column, so the width the reader dragged to
 * survives the fold and comes back with it. Re-applying it on expand is not
 * redundant — the ceiling setSidebarWidth clamps against is derived from the
 * shell's width, which may have changed while the menu was away. */
function setSidebarCollapsed(collapsed, persist = false) {
  state.sidebarCollapsed = collapsed;
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  const label = collapsed ? "Show the behaviour menu" : "Hide the behaviour menu";
  elements.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  elements.sidebarToggle.setAttribute("aria-label", label);
  elements.sidebarToggle.title = label;
  if (!collapsed) setSidebarWidth(state.sidebarWidth);
  if (persist) saveFlag("aci-sidebar-collapsed", collapsed);
  // The passage rail is positioned against the document's width, which the fold
  // has just changed. Without this its marks keep the old column's coordinates.
  requestAnimationFrame(updateRails);
}

function setupSidebarToggle() {
  setSidebarCollapsed(savedFlag("aci-sidebar-collapsed"));
  elements.sidebarToggle.addEventListener("click", () => {
    setSidebarCollapsed(!state.sidebarCollapsed, true);
  });
}

function setupSidebarResizer() {
  state.sidebarWidth = savedNumber("aci-sidebar-width", state.sidebarWidth);
  setSidebarWidth(state.sidebarWidth);
  elements.sidebarResizer.addEventListener("pointerdown", event => {
    const shellLeft = elements.appShell.getBoundingClientRect().left;
    startColumnDrag(
      event,
      elements.sidebarResizer,
      clientX => setSidebarWidth(clientX - shellLeft),
      () => setSidebarWidth(state.sidebarWidth, true),
    );
  });
  elements.sidebarResizer.addEventListener("keydown", event => {
    const step = event.shiftKey ? 40 : 16;
    let next = state.sidebarWidth;
    if (event.key === "ArrowLeft") next -= step;
    else if (event.key === "ArrowRight") next += step;
    else if (event.key === "Home") next = 200;
    else if (event.key === "End") next = 480;
    else return;
    event.preventDefault();
    setSidebarWidth(next, true);
  });
}

/* Compare is always exactly two documents, split at the persisted --compare-first
 * boundary. Showing every registered document instead divided the width without a
 * floor: five documents left a 37px text column inside 116px of padding, and the
 * panes overflowed the page. Which two is the reader's choice once there are more
 * than two to choose from. */

/* Compare is a two-document view, and each side is chosen on its own.
 *
 * A pair naming the same id twice is kept rather than corrected, because the
 * operator asked that any document be placeable on either side. Two versions of
 * one document were never the case at issue: an id carries its version, so
 * openai--model-spec@2025-12-18 and @2026-08-18 are two ids and always paired.
 * What this allows is the identical document on both sides, which is a reader
 * lining up one text against itself -- and, before this, a choice the reader
 * made that the reader silently overrode by swapping the sides.
 *
 * An id the payload does not carry is another matter -- a stale ?compare-with=
 * link, or a publication that no longer holds that version -- and falls back to
 * what a comparison opens on, so the view renders something either way. */
function comparePair() {
  const ids = state.payload.documents.map(doc => doc.id);
  const [a, b] = state.comparePair || [];
  // With no pair chosen, the left panel is the document the reader opened on.
  const first = ids.includes(a) ? a : ids.includes(state.selectedSpec) ? state.selectedSpec : ids[0];
  const second = ids.includes(b) ? b : defaultComparison(first);
  return [first, second];
}

function createDocumentResizer() {
  const resizer = document.createElement("div");
  resizer.className = "column-resizer document-resizer";
  resizer.role = "separator";
  resizer.tabIndex = 0;
  resizer.setAttribute("aria-label", "Resize specification panels");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-valuemin", "0");
  resizer.setAttribute("aria-valuemax", "100");
  resizer.addEventListener("pointerdown", event => {
    const bounds = elements.documentReader.getBoundingClientRect();
    startColumnDrag(
      event,
      resizer,
      clientX => setCompareFirst(((clientX - bounds.left) / bounds.width) * 100),
      () => setCompareFirst(state.compareFirst, true),
    );
  });
  resizer.addEventListener("keydown", event => {
    const step = event.shiftKey ? 10 : 2;
    let next = state.compareFirst;
    if (event.key === "ArrowLeft") next -= step;
    else if (event.key === "ArrowRight") next += step;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 100;
    else return;
    event.preventDefault();
    setCompareFirst(next, true);
  });
  return resizer;
}

/* The depth column's two popovers, in one element.
 *
 * The heading opens the rubric, a figure opens the cell behind it, and both land
 * in the same box: two elements would let the scale and a cell sit on screen
 * together saying different things about the same column. The browser's light
 * dismiss and Escape close it; what is added here is the focus, which goes into
 * the box on the way in so a long rationale can be scrolled by keyboard, and
 * back to the control that opened it on the way out. */
let depthNoteTrigger = null;

function releaseDepthTrigger() {
  if (depthNoteTrigger) depthNoteTrigger.setAttribute("aria-expanded", "false");
  depthNoteTrigger = null;
}

function closeDepthNote() {
  const popover = elements.depthNote;
  if (popover?.matches?.(":popover-open")) popover.hidePopover();
  releaseDepthTrigger();
}

/* Beside the column it belongs to, level with the row that opened it.
 *
 * A popover renders in the top layer, where the browser would centre it in the
 * window, so the corner is set here. Out of the menu rather than over it, and
 * clamped: below the breakpoint the menu is the full width of the window and
 * there is nothing to its right, so the box falls back to the trigger's own
 * left edge and then to the window's. */
function placeDepthNote(anchor) {
  const popover = elements.depthNote;
  const rect = anchor.getBoundingClientRect();
  const box = popover.getBoundingClientRect();
  const gap = 10;
  const edge = 12;
  const column = document.querySelector(".behaviour-sidebar");
  const from = column ? column.getBoundingClientRect().right : rect.right;
  let left = from + gap;
  if (left + box.width > window.innerWidth - edge) {
    left = Math.max(edge, Math.min(rect.left, window.innerWidth - box.width - edge));
  }
  // Level with the row, not below it: a figure halfway down a long menu has room
  // under it and a figure at the foot has none, and the clamp is what tells them
  // apart. Never taller than the window: the box scrolls, the page does not.
  const top = Math.min(Math.max(edge, rect.top - 4), window.innerHeight - box.height - edge);
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(Math.max(edge, top))}px`;
}

/* One note, drawn from the structure depthScaleNote and depthFigureNote return.
 * Nothing here is ever innerHTML: a judge's rationale is model output and a
 * document's title comes out of a publication. */
function openDepthNote(trigger, note) {
  const popover = elements.depthNote;
  if (!popover || typeof popover.showPopover !== "function") return;
  elements.depthNoteTitle.textContent = note.title;
  const body = document.createElement("div");
  const span = (className, text) => {
    const element = document.createElement("span");
    element.className = className;
    element.textContent = text;
    return element;
  };

  if (note.levels) {
    body.append(span("depth-note-lede", note.lede));
    const list = document.createElement("ul");
    list.className = "depth-note-scale";
    note.levels.forEach(level => {
      const item = document.createElement("li");
      // The spaces are for whoever reads the row as one string -- a screen
      // reader, the walker -- and cost the grid nothing: whitespace between
      // grid items is not an item.
      item.append(span("depth-note-level", String(level.level)), " ",
                  span("depth-note-anchor", level.anchor), " ",
                  span("depth-note-bar", level.bar));
      list.append(item);
    });
    body.append(list);
  } else {
    note.documents.forEach(cell => {
      const heading = document.createElement("h3");
      heading.textContent = cell.document;
      const summary = document.createElement("p");
      summary.className = "depth-note-mean";
      // The figure is data and the rest of the sentence is prose, so only the
      // figure is set in the mono face. One text either way: the words are the
      // ones depthCellNote wrote, cut at the figure it already gave.
      if (cell.figure) {
        summary.append(span("depth-note-figure", cell.figure),
                       document.createTextNode(cell.summary.slice(cell.figure.length)));
      } else {
        summary.textContent = cell.summary;
      }
      body.append(heading, summary);
      cell.substitutions.forEach(sentence => {
        const said = document.createElement("p");
        said.className = "depth-note-substitution";
        said.textContent = sentence;
        body.append(said);
      });
      if (cell.judges.length) {
        const list = document.createElement("ul");
        list.className = "depth-note-judges";
        cell.judges.forEach(given => {
          const item = document.createElement("li");
          item.append(span("depth-note-judge", given.judge), " ",
                      span("depth-note-score", String(given.depth)), " ",
                      span("depth-note-rationale", given.rationale));
          list.append(item);
        });
        body.append(list);
      }
    });
  }

  elements.depthNoteBody.replaceChildren(...body.childNodes);
  // Re-opening an open popover throws, and moving between two triggers can land
  // the click before the light dismiss has run.
  if (popover.matches(":popover-open")) popover.hidePopover();
  releaseDepthTrigger();
  depthNoteTrigger = trigger;
  trigger.setAttribute("aria-expanded", "true");
  popover.showPopover();
  placeDepthNote(trigger);
  popover.focus();
}

function setupDepthNotes() {
  const popover = elements.depthNote;
  if (!popover || typeof popover.showPopover !== "function") return;
  popover.addEventListener("toggle", event => {
    if (event.newState === "open") return;
    // The toggle event is queued, so a second trigger clicked while the first
    // note was open runs this after the new one is already up: that note's
    // trigger owns the state now, and this one has nothing left to say.
    if (popover.matches(":popover-open")) return;
    const trigger = depthNoteTrigger;
    releaseDepthTrigger();
    /* Escape, or the trigger clicked again: the reader goes back where it was.
     * A click on some other control is not stolen from it, which is why this
     * asks where the focus is rather than moving it unconditionally. */
    const inside = popover.contains(document.activeElement);
    if (trigger && trigger.isConnected
        && (inside || document.activeElement === document.body)) {
      trigger.focus();
    }
  });
  // The corner was measured against a window that no longer has those edges.
  window.addEventListener("resize", () => {
    if (popover.matches(":popover-open")) popover.hidePopover();
  });
}

setupSidebarResizer();
setupSidebarToggle();
setupKeyNotes();
setupDepthNotes();

function behaviourGroups() {
  const groups = new Map();
  (state.payload?.behaviours || []).forEach(behaviour => {
    const name = behaviour.category || "Behaviours under test";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(behaviour);
  });
  return [...groups].map(([name, behaviours]) => ({
    name,
    behaviours,
    texture: GROUP_TEXTURE[name] || "wash",
  }));
}

function renderBehaviourList() {
  const groups = behaviourGroups();
  const empty = groups.length === 0;
  document.body.classList.toggle("no-behaviours", empty);
  elements.behaviourToolbar.hidden = empty;

  if (empty) {
    elements.behaviourList.innerHTML = `
      <div class="behaviour-empty">
        <strong>No behaviours under test yet.</strong>
        <p>Every specification is shown here in full, with no passages highlighted.
        Behaviours appear in this menu once their passage mappings are published to this reader.</p>
      </div>`;
    updateExportControl();
    return;
  }

  const selected = new Set(state.selectedSlugs);
  elements.behaviourList.innerHTML = groups.map(group => `
    <section class="behaviour-group texture-${group.texture}">
      <!-- The depth column's scale, said once at its top rather than beside every
           figure; each figure's spoken form carries it for a screen reader. It is
           also the way into the rubric the figures are scored on: a reader who
           wants to know what a 1 means asks the scale, in place, rather than
           leaving for the methodology page. -->
      <div class="behaviour-group-head">
        <h2>${escapeHTML(group.name)}</h2>
        <button
          type="button"
          class="depth-head"
          aria-haspopup="dialog"
          aria-expanded="false"
        >Depth, out of 4</button>
      </div>
      <ul>
        ${group.behaviours.map(behaviour => {
          const checked = selected.has(behaviour.slug);
          const texture = behaviourTexture(behaviour);
          return `
          <li class="behaviour-option-row" style="--bh: ${behaviourHue(behaviour)}">
            <!-- The row as it is drawn: the tick target and the depth figure share one
                 box, because they are one row, but the figure is a button and a button
                 may not sit inside a label -- it is labelable itself, and the label
                 would tick the behaviour on the way past. So the frame holds both and
                 carries the hover and the ticked ground the label used to carry. -->
            <span class="behaviour-option-frame">
            <label class="behaviour-option${checked ? " checked" : ""} texture-${texture}">
              <input
                class="behaviour-check"
                type="checkbox"
                data-behaviour="${escapeHTML(behaviour.slug)}"
                aria-describedby="depth-description-${escapeHTML(behaviour.slug)}"
                ${checked ? "checked" : ""}
              >
              <span class="behaviour-box" aria-hidden="true"></span>
              <span class="number">${String(behaviour.id).padStart(2, "0")}</span>
              <span class="name">${escapeHTML(behaviour.name)}</span>
              <span class="depth-spoken visually-hidden"></span>
            </label>
            <!-- The figure, and the way into the cell behind it: the mean, each judge
                 with its own score and its rationale, and any recorded substitute.
                 updateBehaviourDepths writes its text and its name. -->
            <button
              type="button"
              class="depth"
              data-behaviour-depth="${escapeHTML(behaviour.slug)}"
              aria-haspopup="dialog"
              aria-expanded="false"
            ></button>
            </span>
            <!-- Outside the label, so it never joins the checkbox's accessible name; named
                 by aria-describedby instead, which reads a hidden element's text aloud. -->
            <span class="depth-description" id="depth-description-${escapeHTML(behaviour.slug)}" hidden></span>
            <button
              type="button"
              class="behaviour-why"
              data-behaviour-note="${escapeHTML(behaviour.slug)}"
              aria-label="What ${escapeHTML(behaviour.name)} means"
              title="What this behaviour means"
            >i</button>
          </li>
        `;}).join("")}
      </ul>
    </section>
  `).join("");
  elements.behaviourList.querySelectorAll(".behaviour-check").forEach(input => {
    input.addEventListener("change", () => toggleBehaviour(input.dataset.behaviour, input.checked));
  });
  elements.behaviourList.querySelectorAll("[data-behaviour-note]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();          // the row is a label: a click would tick it
      openBehaviourNote(button);
    });
  });
  elements.behaviourList.querySelectorAll(".depth-head").forEach(button => {
    button.addEventListener("click", () =>
      openDepthNote(button, depthScaleNote(payloadBehaviours())));
  });
  elements.behaviourList.querySelectorAll("[data-behaviour-depth]").forEach(button => {
    button.addEventListener("click", () => {
      const behaviour = payloadBehaviours().find(b => b.slug === button.dataset.behaviourDepth);
      openDepthNote(button, depthFigureNote(behaviour, visibleDocuments().filter(Boolean)));
    });
  });
  updateBehaviourCount();
  updateBehaviourDepths();
}

/* How deeply each document on screen covers each behaviour, beside its name.
 *
 * The mean of the panel's depths on the 0 to 4 scale, one figure per document on
 * screen, so comparing two documents puts two figures side by side. A cell with
 * no depth shows a dash: zero is a finding, a dash is the absence of one.
 *
 * The figures are bare. The scale is said once, at the top of the column, in each
 * group's heading ("Depth, out of 4"): "3.7 / 4" beside every name read poorly,
 * and comparing already puts " / " between two documents' figures. A sentence
 * that gives one depth on its own says the scale in that sentence. */
/* The 0 to 4 scale itself, in the rubric's own terms.
 *
 * methodology/spec-coverage-depth-rubric.md is what the judges were given, and
 * this is that table: the anchor and the bar of each level, so the popover the
 * column's heading opens quotes the rubric rather than paraphrasing it into a
 * second rubric nobody maintains. The rubric writes its asides with a double
 * hyphen and this surface takes commas instead; nothing else is changed.
 *
 * DEPTH_WORDS, the word said beside a mean, is these anchors and not a second
 * list of them. */
const DEPTH_LEVELS = [
  { level: 0, anchor: "absent",
    bar: "No passage bears on the behaviour." },
  { level: 1, anchor: "named",
    bar: "The behaviour appears, a word or clause, typically inside a list or a "
      + "passage about something else, but the spec says nothing further about it." },
  { level: 2, anchor: "discussed",
    bar: "The spec addresses the behaviour in its own right, what the norm is and "
      + "why it matters, but only in terms too general to grade a response against." },
  { level: 3, anchor: "prescribed",
    bar: "The spec states concrete do/don't rules or procedures for the behaviour, "
      + "specific enough that a grader can quote the spec's own sentences as pass criteria." },
  { level: 4, anchor: "demonstrated",
    bar: "Prescribed, plus worked examples: concrete scenarios where the spec shows the "
      + "sanctioned response, usable as an answer key for borderline cases." },
];

const DEPTH_WORDS = DEPTH_LEVELS.map(level => level.anchor);

/* Small counts read as words in a sentence, not as digits. Beyond this list a
 * figure is a figure; no panel of the index has ever seated nine. */
const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];

/* A sentence out of a database column ends like one. The reason a substitution
 * carries was typed by an operator and may stop mid-air; nothing else is added. */
function endedSentence(reason) {
  const text = String(reason ?? "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/* How many judges a cell of this publication carries, or null when its cells
 * disagree. The scale's sentence says the figure is a mean, and a mean is only
 * worth naming a size for when every cell was reached the same way: a payload
 * whose cells were judged by different numbers says "the panel's judges" and
 * counts nothing. */
function depthJudgeCount(behaviours) {
  const counts = new Set();
  (behaviours || []).forEach(behaviour => {
    Object.keys(behaviour?.coverage || {}).forEach(id => {
      const depth = panelDepth(behaviour, id);
      if (depth) counts.add(Object.keys(depth.judges || {}).length);
    });
  });
  return counts.size === 1 ? [...counts][0] : null;
}

/* The one sentence under the scale: what depth measures, what it does not, and
 * what the figure beside a behaviour is an average of. */
function depthScaleLede(behaviours) {
  const judges = depthJudgeCount(behaviours);
  const panel = judges === null ? "the panel's judges"
    : judges === 1 ? "the panel's single judge"
    : `the panel's ${NUMBER_WORDS[judges] ?? judges} judges`;
  return "Depth measures how far a document develops a behaviour, not whether it "
    + `agrees with it, and each figure is the mean of ${panel}.`;
}

/* What the column's heading opens: the rubric, once, for the whole column. */
function depthScaleNote(behaviours) {
  return { title: "Depth, out of 4", lede: depthScaleLede(behaviours), levels: DEPTH_LEVELS };
}

/* What one figure is: the mean, the judges behind it with their own scores and
 * their rationales, and the seat a recorded substitute sat in. A cell nobody
 * judged says that in a sentence rather than opening on nothing, because an
 * empty popover reads as a broken one. */
function depthCellNote(behaviour, doc) {
  const depth = panelDepth(behaviour, doc.id);
  const recorded = behaviour?.coverage?.[doc.id]?.substitutions;
  return {
    document: `${doc.title} ${doc.version}`,
    figure: depth ? depth.mean.toFixed(1) : null,
    summary: depth
      ? `${depth.mean.toFixed(1)} out of 4, ${DEPTH_WORDS[Math.round(depth.mean)]}.`
      : "No depth given: this behaviour was not judged on this document.",
    substitutions: (Array.isArray(recorded) ? recorded : [])
      .map(({ seat, substitute, reason }) =>
        `${substitute} judged in place of ${seat}: ${endedSentence(reason)}`),
    judges: depth
      ? Object.entries(depth.judges || {}).map(([judge, given]) => ({
          judge, depth: given.depth, rationale: given.rationale || "" }))
      : [],
  };
}

/* What one figure opens. Comparing, the figure is a pair and so is the note:
 * one section per document on screen, in the order the panes are in. */
function depthFigureNote(behaviour, documents) {
  return {
    title: behaviour?.name || "",
    documents: (documents || []).filter(Boolean).map(doc => depthCellNote(behaviour, doc)),
  };
}

/* The depth the index's panel gave a behaviour on a document, or null. Every read of
 * a depth in this file goes through here.
 *
 * A depth counts only as an object with a finite numeric mean. The grandfathered
 * publication was written by the old builder and carries a human curation's integer
 * in the same field; that is not the panel's mean, and reading it as one threw on
 * every visit, which the reader reported as a payload that could not be loaded. */
function panelDepth(behaviour, documentId) {
  const depth = behaviour?.coverage?.[documentId]?.depth;
  return depth !== null && typeof depth === "object" && Number.isFinite(depth.mean)
    ? depth : null;
}

/* One line naming a document's depth for a behaviour: the mean out of 4 and the
 * rubric word, or that none was given. Shared by the figure's hover title, the
 * hidden description a screen reader hears, and the note's own paragraph -- one
 * text, not three copies of the same wording. */
function depthSummaryLine(doc, depth) {
  if (!depth) return `${doc.title} ${doc.version}: no depth given.`;
  return `${doc.title} ${doc.version}: ${depth.mean.toFixed(1)} out of 4, `
    + `${DEPTH_WORDS[Math.round(depth.mean)]}.`;
}

/* The figures as a screen reader hears them beside the behaviour's name. The
 * column's header, which gives sighted readers the scale, is not read with each
 * value, so every value is spoken with its scale. */
function depthSpoken(depths) {
  if (!depths.some(Boolean)) return "no depth given";
  return `depth ${depths
    .map(depth => (depth ? `${depth.mean.toFixed(1)} out of 4` : "not given"))
    .join(" and ")}`;
}

function updateBehaviourDepths() {
  if (!state.payload) return;
  const shown = visibleDocuments().filter(Boolean);
  /* An open note was assembled for the documents that were on screen when it
   * opened. Whatever brought us here changed them, so it is stale rather than
   * wrong, and a stale note is worse: it reads as the answer to the question
   * just asked. */
  closeDepthNote();
  elements.behaviourList.querySelectorAll("[data-behaviour-depth]").forEach(cell => {
    const behaviour = payloadBehaviours().find(b => b.slug === cell.dataset.behaviourDepth);
    const depths = shown.map(doc => panelDepth(behaviour, doc.id));
    cell.textContent = depths.map(depth => (depth ? depth.mean.toFixed(1) : "–")).join(" / ");
    /* The figure is a control, so it cannot be hidden from screen readers the way
     * a bare span was: it is named instead, with the behaviour it belongs to and
     * the same spoken figures the checkbox carries. */
    cell.setAttribute("aria-label", `${behaviour?.name || ""}: ${depthSpoken(depths)}`);
    const summary = shown.map((doc, i) => depthSummaryLine(doc, depths[i])).join("\n");
    // Kept for mouse users; a keyboard, touch or screen-reader user reaches the same
    // words through the checkbox's aria-describedby instead (see renderBehaviourList).
    cell.title = summary;
    const description = cell.closest(".behaviour-option-row")?.querySelector(".depth-description");
    if (description) description.textContent = summary;
    // The figure is aria-hidden; this is the part of the checkbox's name that says it.
    const spoken = cell.closest(".behaviour-option-row")?.querySelector(".depth-spoken");
    if (spoken) spoken.textContent = depthSpoken(depths);
  });
}

function updateBehaviourCount() {
  const total = payloadBehaviours().length;
  updateExportControl();
  if (!total) return;
  const chosen = state.selectedSlugs.length;
  elements.behaviourCount.textContent = `${chosen} of ${total} selected`;
  elements.selectAllBehaviours.disabled = chosen === total;
  elements.clearBehaviours.disabled = chosen === 0;
}

/* ---------- taking the reading away ---------- */

/* What the export is for: the passages a behaviour rests on, read away from the reader --
 * pasted into a review, diffed against a later spec version, or annotated by hand. So it
 * carries the whole citation and not just the quote: the definition the passage was read
 * against, the locator that pins it to a section of a pinned spec version, and the role
 * sentence saying why it was picked. Every specification is written out whichever one is
 * open, because a behaviour's coverage is the whole set -- and a spec that maps nothing to it
 * is a finding of the index, so it is named and stated rather than left out. */

function paddedNumber(behaviour) {
  return String(behaviour.id).padStart(2, "0");
}

function selectedPassageTotal() {
  return selectedBehaviours().reduce((total, behaviour) => total
    + (state.payload?.documents || []).reduce(
      (count, doc) => count + (behaviour.coverage?.[doc.id]?.passages.length || 0), 0), 0);
}

function updateExportControl() {
  const behaviours = selectedBehaviours();
  const loaded = payloadBehaviours().length;
  elements.downloadPassages.disabled = behaviours.length === 0;
  if (!loaded) {
    elements.downloadHint.textContent = "";
    return;
  }
  if (!behaviours.length) {
    elements.downloadHint.textContent = "Tick a behaviour to export its passages.";
    return;
  }
  const passages = selectedPassageTotal();
  const documents = state.payload?.documents || [];
  elements.downloadHint.textContent =
    `${behaviours.length} ${behaviours.length === 1 ? "behaviour" : "behaviours"}`
    + `, ${passages} ${passages === 1 ? "passage" : "passages"}`
    + `, ${documents.length} ${documents.length === 1 ? "document" : "documents"}`;
}

/* The reader's own date, not UTC: an export made in the evening is dated the day it was
   made, and the file names of a day's exports sort together. */
function today() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/* A quote can run to several lines; every one of them has to carry the marker, or the
 * markdown closes the quotation early and the rest of the passage reads as commentary. */
function blockquote(value) {
  return value
    .trim()
    .split("\n")
    .map(line => `> ${line}`.trimEnd())
    .join("\n");
}

function passagesMarkdown() {
  const behaviours = selectedBehaviours();
  const documents = state.payload?.documents || [];
  const lines = [
    "# LLM panel -- specification passages",
    "",
    `Exported from the AI Character Index LLM panel on ${today()}.`,
    "",
    `Behaviours: ${behaviours.map(behaviour => `${paddedNumber(behaviour)} ${behaviour.name}`).join(", ")}.`,
    "",
    `Specifications read: ${documents.map(doc => `${doc.lab} · ${doc.title} (${doc.version})`).join("; ")}.`,
    "",
    "Each passage is quoted verbatim from the specification version named above; the locator"
    + " pins it to the section it was read in, and the role sentence records why it was cited.",
  ];

  behaviours.forEach(behaviour => {
    lines.push("", "---", "", `## ${paddedNumber(behaviour)} · ${behaviour.name}`);
    if (behaviour.category) lines.push("", `*${behaviour.category}*`);
    lines.push("", `**Definition.** ${behaviour.definition}`);

    documents.forEach(doc => {
      const coverage = behaviour.coverage?.[doc.id] || NO_COVERAGE;
      lines.push("", `### ${doc.lab} · ${doc.title} (${doc.version})`);
      lines.push("", `Source: ${doc.sourceUrl}`);
      // Coverage notes are curation-era prose; the reader ships passage sets only
      // (removed from the export per Andres 2026-08-17 -- stale beside re-run panel data).
      if (!coverage.passages.length) {
        lines.push(
          "",
          "No mapped passages in this specification."
          + " Absence of coverage is an index finding, not missing data.",
        );
        return;
      }
      coverage.passages.forEach((passage, index) => {
        lines.push(
          "",
          `#### ${index + 1}. ${bandLabel(passage.band)} passage`,
          "",
          `\`${passage.locator}\``,
          "",
          blockquote(passage.quote),
          "",
          `**Why this passage.** ${passage.role}`,
        );
      });
    });
  });

  return `${lines.join("\n")}\n`;
}

function exportFilename() {
  const behaviours = selectedBehaviours();
  const subject = behaviours.length === 1
    ? behaviours[0].slug
    : `${behaviours.length}-behaviours`;
  return `spec-reader-${subject}-passages-${today()}.md`;
}

function downloadPassages() {
  if (!selectedBehaviours().length) return;
  const blob = new Blob([passagesMarkdown()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFilename();
  document.body.append(link);
  link.click();
  link.remove();
  // Held open until the browser has taken the blob, then released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

elements.downloadPassages.addEventListener("click", downloadPassages);

/* Ticking or unticking never re-renders the specification, only its highlight layer, so
 * the reader keeps its place in the text while a behaviour is added or taken away. */
function setSelection(slugs) {
  const order = payloadBehaviours().map(behaviour => behaviour.slug);
  const chosen = new Set(slugs);
  state.selectedSlugs = order.filter(slug => chosen.has(slug));

  elements.behaviourList.querySelectorAll(".behaviour-check").forEach(input => {
    const on = chosen.has(input.dataset.behaviour);
    input.checked = on;
    input.closest(".behaviour-option").classList.toggle("checked", on);
  });
  updateBehaviourCount();
  syncURL();
  applyHighlights();
}

function toggleBehaviour(slug, checked) {
  const next = new Set(state.selectedSlugs);
  if (checked) next.add(slug);
  else next.delete(slug);
  setSelection([...next]);
}

function escapeHTML(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function plainHeadingTitle(source) {
  return source
    .replace(/\[\^([^\]]+)\]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function generatedHeadingAnchor(source) {
  return plainHeadingTitle(source)
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, "-");
}

function buildHeadingIndex(markdown) {
  const headings = new Map();
  markdown.replace(/\r\n/g, "\n").split("\n").forEach(line => {
    const heading = headingDetails(line);
    if (!heading) return;
    const anchor = heading.id || generatedHeadingAnchor(heading.text);
    if (anchor && !headings.has(anchor)) {
      headings.set(anchor, plainHeadingTitle(heading.text));
    }
  });
  return headings;
}

function scopedAnchor(prefix, anchor) {
  return `${prefix}--${anchor}`;
}

function applyInlineFormatting(value) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function inlineMarkdown(source, context) {
  let value = source
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/\{#[^}]+\}/g, "");
  value = escapeHTML(value);
  const renderedLinks = [];
  value = value.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]+)\)/g,
    (match, label, href) => {
      let renderedLink;
      if (!href.startsWith("#")) {
        renderedLink = `<a href="${href}">${applyInlineFormatting(label)}</a>`;
      } else {
        const target = href.slice(1);
        const title = context?.headings.get(target);
        const placeholder = /^\s*\?\s*$/.test(label);
        const renderedLabel = placeholder && title
          ? escapeHTML(title)
          : applyInlineFormatting(label);
        const renderedHref = context
          ? `#${scopedAnchor(context.idPrefix, target)}`
          : href;
        const ariaLabel = placeholder && title
          ? ` aria-label="See section: ${escapeHTML(title)}"`
          : "";
        renderedLink = `<a href="${escapeHTML(renderedHref)}"${ariaLabel}>${renderedLabel}</a>`;
      }

      const token = `\uE000${renderedLinks.length}\uE001`;
      renderedLinks.push(renderedLink);
      return token;
    },
  );
  value = applyInlineFormatting(value);
  return value.replace(/\uE000(\d+)\uE001/g, (match, index) => renderedLinks[Number(index)]);
}

function renderCodeBlock(source, context) {
  return escapeHTML(source).replace(
    /\[([^\]]+)\]\(#([^)\s]+)\)/g,
    (match, label, target) => {
      const title = context?.headings.get(target);
      const placeholder = /^\s*\?\s*$/.test(label);
      const renderedLabel = placeholder && title ? escapeHTML(title) : label;
      const renderedHref = context
        ? `#${scopedAnchor(context.idPrefix, target)}`
        : `#${target}`;
      const ariaLabel = placeholder && title
        ? ` aria-label="See section: ${escapeHTML(title)}"`
        : "";
      return `<a href="${escapeHTML(renderedHref)}"${ariaLabel}>${renderedLabel}</a>`;
    },
  );
}

function headingDetails(line) {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return null;
  const attrs = match[2].match(/\{#([^\s}]+)[^}]*\}\s*$/);
  return {
    level: match[1].length,
    text: match[2].replace(/\s*\{#[^}]+\}\s*$/, ""),
    id: attrs?.[1] || "",
  };
}

function isSpecialLine(lines, index) {
  const line = lines[index];
  return (
    !line.trim()
    || headingDetails(line)
    || /^(~~~|```)/.test(line)
    || /^!!!\s/.test(line)
    || /^>\s?/.test(line)
    || /^\s*([-*+]|\d+\.)\s+/.test(line)
    || /^\s*\|/.test(line)
    || /^-{3,}\s*$/.test(line)
  );
}

/* The engine's paragraph grammar, for locators.
 *
 * A passage's locator is the engine's: engine/spec-cite/cite.py cuts a document
 * into sections and blocks, and engine/panel/harness.py::passages numbers each
 * section's blocks and leaves out any that only repeats a heading, as a contents
 * list does. The reader gives every block the locator the engine would give it,
 * so a copy or a link names what a citation names. This is a copy of that grammar,
 * held to the engine locator for locator by engine/panel/test_appjs_citeblocks.js,
 * which runs it; a second grammar that only looked right would drift. The
 * expressions are cite.py's.
 *
 * Lines are split as renderMarkdown splits them, so a block's line numbers are the
 * reader's. Python's splitlines also breaks on a bare \r and a few rarer
 * separators; no document of the index carries one, as of September 2026. */
const CITE_HEADING = /^(#{1,6})\s+(.*?)\s*(?:\{#([A-Za-z0-9_-]+)(?:\s+authority=\S+)?\})?\s*$/;
const CITE_FENCE = /^(```|~~~)/;
const CITE_LIST_ITEM = /^([-*+]|\d+[.)])\s+/;
const CITE_FOOTNOTE = /\[\^[^\]]+\]/g;
const CITE_XREF = /\[\?\]\((#[A-Za-z0-9_-]+)\)/g;
const CITE_LINK = /\[([^\]]+)\]\([^)]+\)/g;

/* cite.normalize: a block's text once its syntax is gone. */
function citeNormalize(text) {
  return text
    .replace(CITE_FOOTNOTE, "")
    .replace(CITE_XREF, "$1")
    .replace(CITE_LINK, "$1")
    .replace(CITE_LIST_ITEM, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* cite.parse_sections: every heading outside a fence opens a section that runs to
 * the next heading of any level, named by its anchor and by its heading path. */
function citeSections(lines) {
  const sections = [];
  let stack = [];
  let inFence = null;
  lines.forEach((line, i) => {
    const fence = line.match(CITE_FENCE);
    if (fence) {
      if (inFence === null) inFence = fence[1];
      else if (line.startsWith(inFence)) inFence = null;
      return;
    }
    if (inFence) return;
    const heading = line.match(CITE_HEADING);
    if (!heading || line.startsWith("#!")) return;
    const level = heading[1].length;
    const title = heading[2].replace(/\s+/g, " ").trim();
    sections.forEach(section => { if (section.end === null) section.end = i; });
    stack = stack.filter(([depth]) => depth < level);
    stack.push([level, title]);
    sections.push({ anchor: heading[3] || null, path: stack.map(([, name]) => name), start: i + 1, end: null });
  });
  sections.forEach(section => { if (section.end === null) section.end = lines.length; });
  return sections;
}

/* cite.segment_blocks, with the lines each block spans: a blank line ends a block,
 * each top-level list item starts one, a fence is one, and a fence after an
 * **Example** caption joins the caption's block. */
function citeBlocks(lines, start, end) {
  const blocks = [];
  let current = [];
  let first = -1;
  let last = -1;
  const flush = () => {
    if (current.length) blocks.push({ raw: current.join("\n"), first, last });
    current = [];
  };
  let i = start;
  while (i < end) {
    const line = lines[i];
    const fence = line.match(CITE_FENCE);
    if (fence) {
      flush();
      const fenced = [line];
      const opened = i;
      i += 1;
      while (i < end) {
        fenced.push(lines[i]);
        if (lines[i].startsWith(fence[1])) break;
        i += 1;
      }
      const closed = Math.min(i, end - 1);
      const previous = blocks[blocks.length - 1];
      if (previous && /^\*\*Example\*\*/.test(previous.raw)) {
        previous.raw = `${previous.raw}\n\n${fenced.join("\n")}`;
        previous.last = closed;
      } else {
        blocks.push({ raw: fenced.join("\n"), first: opened, last: closed });
      }
      i += 1;
      continue;
    }
    if (!line.trim()) {
      flush();
    } else if (CITE_LIST_ITEM.test(line)) {
      flush();
      current.push(line);
      first = i;
      last = i;
    } else {
      if (!current.length) first = i;
      current.push(line);
      last = i;
    }
    i += 1;
  }
  flush();
  return blocks;
}

/* harness.passages: the locator of every block of a document that the engine
 * numbers and keeps, with the lines it spans, in document order. A block counts
 * towards its section's numbering even where it is left out. */
function documentLocators(markdown, head, byAnchor) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections = citeSections(lines);
  const titles = new Set(sections.map(section =>
    citeNormalize(section.path.join(" > ").split(" > ").pop())));
  const located = [];
  for (const section of sections) {
    const ref = byAnchor && section.anchor ? `#${section.anchor}` : section.path.join(" > ");
    citeBlocks(lines, section.start, section.end).forEach((block, i) => {
      const text = citeNormalize(block.raw);
      if (text && !titles.has(text)) {
        located.push({ locator: `${head} > ${ref} > ¶${i + 1}`, first: block.first, last: block.last });
      }
    });
  }
  return located;
}

/* Whether a document's sections are named by anchor or by heading path. The engine
 * reads it from the document's registry row, which the reader is not sent, so it
 * is read off the locators the document's passages carry; a document no passage
 * cites is anchored when its headings carry anchors. Both rules agree with every
 * document of the index, as of September 2026. */
function locatesByAnchor(doc) {
  const cited = (state.rawBehaviours || [])
    .flatMap(behaviour => behaviour.coverage?.[doc.id]?.passages || []);
  if (cited.length) return cited.some(passage => (passage.locator.split(" > ")[1] || "").startsWith("#"));
  return doc.markdown.split("\n").some(line => Boolean(line.match(CITE_HEADING)?.[3]));
}

/* Each rendered block takes the locator of the engine block its first source line
 * falls in. That is what makes the shapes where the two cut differently agree: a
 * list item and the nested items the reader renders as items of their own, an
 * example caption and the fence the engine attaches to it, a paragraph that runs
 * into a quote. A heading falls in no block. A quote or an admonition carries the
 * locator of the block its first line opens, as the paragraphs inside it carry
 * theirs: a passage citing a whole "!!! meta" commentary is anchored to the
 * admonition itself, and its first line is the one the engine's block begins on. */
function attachLocators(panel, doc) {
  const located = documentLocators(doc.markdown, doc.id, locatesByAnchor(doc));
  if (!located.length) return;
  panel.querySelectorAll(".document-body [data-line]").forEach(block => {
    if (/^H[1-6]$/.test(block.tagName)) return;
    const line = Number(block.dataset.line);
    let low = 0;
    let high = located.length - 1;
    let hit = null;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (located[middle].first <= line) { hit = located[middle]; low = middle + 1; }
      else high = middle - 1;
    }
    if (hit && line <= hit.last) block.dataset.locator = hit.locator;
  });
}

function renderMarkdown(markdown, context, lineOffset = 0) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let blockNumber = 0;
  // Each block says which source line it starts on, for its locator (attachLocators).
  const blockAttr = line => `data-block="${++blockNumber}" data-line="${lineOffset + line}"`;
  const usedHeadingIds = context?.usedHeadingIds || new Map();

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const first = index;
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = headingDetails(line);
    if (heading) {
      const anchor = heading.id || generatedHeadingAnchor(heading.text);
      const occurrence = (usedHeadingIds.get(anchor) || 0) + 1;
      usedHeadingIds.set(anchor, occurrence);
      const uniqueAnchor = occurrence === 1 ? anchor : `${anchor}--${occurrence}`;
      const id = anchor
        ? ` id="${escapeHTML(scopedAnchor(context.idPrefix, uniqueAnchor))}"`
        : "";
      output.push(`<h${heading.level} ${blockAttr(first)}${id}>${inlineMarkdown(heading.text, context)}</h${heading.level}>`);
      index += 1;
      continue;
    }

    const fence = line.match(/^(~~~|```)(.*)$/);
    if (fence) {
      const marker = fence[1];
      const language = fence[2].trim();
      const content = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith(marker)) {
        content.push(lines[index]);
        index += 1;
      }
      index += 1;
      output.push(`<pre class="code-block" ${blockAttr(first)} data-language="${escapeHTML(language)}">${renderCodeBlock(content.join("\n"), context)}</pre>`);
      continue;
    }

    const admonition = line.match(/^!!!\s+(\w+)(?:\s+"([^"]+)")?/);
    if (admonition) {
      const content = [];
      index += 1;
      while (index < lines.length && (!lines[index].trim() || /^\s{4}/.test(lines[index]))) {
        content.push(lines[index].replace(/^\s{4}/, ""));
        index += 1;
      }
      output.push(`
        <aside class="admonition" ${blockAttr(first)}>
          <div class="admonition-label">${inlineMarkdown(admonition[2] || admonition[1], context)}</div>
          ${renderMarkdown(content.join("\n"), context, lineOffset + first + 1)}
        </aside>
      `);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const content = [];
      while (index < lines.length && (/^>\s?/.test(lines[index]) || !lines[index].trim())) {
        content.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      output.push(`<blockquote ${blockAttr(first)}>${renderMarkdown(content.join("\n"), context, lineOffset + first)}</blockquote>`);
      continue;
    }

    const listMatch = line.match(/^\s*([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1]);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]|\d+\.)\s+(.+)$/);
        if (!item || /\d+\./.test(item[1]) !== ordered) break;
        items.push(`<li ${blockAttr(index)}>${inlineMarkdown(item[2], context)}</li>`);
        index += 1;
      }
      output.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    if (/^\s*\|/.test(line)) {
      const tableLines = [];
      while (index < lines.length && /^\s*\|/.test(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      output.push(`<pre class="raw-table" ${blockAttr(first)}>${escapeHTML(tableLines.join("\n"))}</pre>`);
      continue;
    }

    if (/^-{3,}\s*$/.test(line)) {
      output.push("<hr>");
      index += 1;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !isSpecialLine(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    output.push(`<p ${blockAttr(first)}>${inlineMarkdown(paragraph.join(" "), context)}</p>`);
  }

  return output.join("\n");
}

function normalize(value) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/&(?:amp|quot|#39);/g, " ")
    .replace(/[*_`[\]{}()<>]/g, " ")
    .replace(/[’‘“”"'—–-]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Two places where resolver output and rendered text legitimately differ, so the
 * quote has to be matched in pieces rather than as one literal run:
 *
 *   - an admonition opens "!!! meta "Commentary"" in the source and in the
 *     resolver's output, while the reader renders the label alone;
 *   - a cross-reference is written "[?](#letter_and_spirit)" in the source and
 *     resolved to "#letter_and_spirit", while the reader renders the title of
 *     the section it points at.
 *
 * Dropping the marker and splitting on the references leaves fragments that are
 * identical on both sides and must appear, in order, inside one block. A quote
 * with neither feature yields a single fragment, i.e. the whole normalized quote. */
function passageFragments(quote) {
  return quote
    .replace(/^!!!\s+\w+\s*/, "")
    .split(/#[A-Za-z0-9_]+/)
    .map(normalize)
    .filter(Boolean);
}

function containsInOrder(haystack, fragments) {
  // A quote that yields no fragments (only an admonition marker and/or cross
  // references) must not match every block -- treat it as unresolved instead of
  // silently anchoring the first block.
  if (!fragments.length) return false;
  let cursor = 0;
  for (const fragment of fragments) {
    const at = haystack.indexOf(fragment, cursor);
    if (at < 0) return false;
    cursor = at + fragment.length;
  }
  return true;
}

/* A quote can carry its example's code after a bold intro, flattened into one
 * string ("Example: <title> ```text User: … ```"), while the reader renders the
 * intro as a paragraph and the fence as a code block. Neither block holds the
 * whole quote; the run of the two does not either, because the fence's language
 * word is in the quote and not in the code; and an intro shorter than the
 * fallback's eighteen words runs the fallback's opening into the code. So a quote
 * with a fence is resolved on the text before it, and annotatePassages highlights
 * the fence as the intro's continuation, as it does for an exampleBlock passage.
 * A quote that opens with its fence has nothing before it and is matched whole. */
function quoteBeforeFence(quote) {
  const at = quote.indexOf("```");
  return at > 0 && normalize(quote.slice(0, at)) ? quote.slice(0, at) : quote;
}

function findPassageBlocks(body, passage) {
  const quote = quoteBeforeFence(passage.quote);
  const needle = normalize(quote);
  const fragments = passageFragments(quote);
  const blocks = [...body.querySelectorAll("[data-block]")];
  const exact = blocks.find(block => containsInOrder(normalize(block.textContent), fragments));
  if (exact) return { anchor: exact, continuation: [] };

  // A whole-block citation can flatten a labelled list cluster (a bold intro
  // plus its nested items) into one resolver line, while the reader renders
  // each item as its own block. Match the needle across a run of consecutive
  // blocks, anchoring the first and highlighting the rest as continuation.
  const texts = blocks.map(block => normalize(block.textContent));
  for (let start = 0; start < blocks.length; start += 1) {
    if (!texts[start] || !needle.startsWith(texts[start])) continue;
    let combined = texts[start];
    const run = [blocks[start]];
    for (let next = start + 1; next < blocks.length && combined.length < needle.length; next += 1) {
      combined = `${combined} ${texts[next]}`;
      if (!needle.startsWith(combined) && !combined.startsWith(needle)) break;
      run.push(blocks[next]);
    }
    if (combined.startsWith(needle) && run.length > 1) {
      return { anchor: run[0], continuation: run.slice(1) };
    }
  }

  // Last resort for a passage the two paths above both miss: the opening clause
  // of its first fragment is the longest run of the quote that no rendering
  // difference can reach, and stays stable for a pinned spec version.
  const opening = (fragments[0] || needle).split(" ").slice(0, 18).join(" ");
  const fallback = blocks.find(block => normalize(block.textContent).includes(opening));
  return fallback ? { anchor: fallback, continuation: [] } : null;
}

/* The example a passage introduces is rendered as its own code block, which the citation
 * does not quote; it is highlighted as continuation of the passage that announces it. */
function followingExampleBlock(block) {
  let next = block.nextElementSibling;
  while (next && !next.classList.contains("code-block")) {
    if (/^H[1-6]$/.test(next.tagName)) return null;
    next = next.nextElementSibling;
  }
  return next?.classList.contains("code-block") ? next : null;
}

/* One wash per behaviour on the block, blended left to right where several land on the
 * same passage. Core carries the colour at full strength, related the same colour thinned;
 * the alphas are palette variables so daylight and umber can weigh the tint differently. */
function tintGradient(marks, strong) {
  const suffix = strong ? "-strong" : "";
  const colors = marks.map(mark =>
    `rgb(${mark.hue} / var(--tint-${mark.adjacent ? "related" : "core"}${suffix}))`);
  if (colors.length === 1) return `linear-gradient(${colors[0]}, ${colors[0]})`;
  const step = 100 / (colors.length - 1);
  return `linear-gradient(100deg, ${colors.map((color, index) => `${color} ${Math.round(index * step)}%`).join(", ")})`;
}

/* The margin rules: one per behaviour, side by side, so a shared passage is legible as
 * two or three behaviours at a glance rather than as one indeterminate blend. One layer
 * per behaviour rather than one gradient across all of them, because a stippled group's
 * rule is broken down its length -- the same reading as its dotted wash, at rule width. */
function gutterRules(marks) {
  const bar = marks.length > 4 ? 1 : 2;
  const pitch = bar + 1;
  const dash = bar > 1 ? 3 : 2;
  const layers = [];
  const sizes = [];
  const positions = [];
  marks.forEach((mark, index) => {
    const color = `rgb(${mark.hue} / var(--rule-${mark.adjacent ? "related" : "core"}))`;
    layers.push(mark.texture === "stipple"
      ? `repeating-linear-gradient(to bottom, ${color} 0 ${dash}px, transparent ${dash}px ${dash * 2}px)`
      : `linear-gradient(${color}, ${color})`);
    sizes.push(`${bar}px 100%`);
    positions.push(`${index * pitch}px 0`);
  });
  return {
    image: layers.join(", "),
    size: sizes.join(", "),
    position: positions.join(", "),
    width: marks.length * pitch - 1,
  };
}

/* The same reading, banded down the height of a 4px rail mark. */
function railTint(marks) {
  const colors = marks.map(mark =>
    `rgb(${mark.hue} / var(--rule-${mark.adjacent ? "related" : "core"}))`);
  if (colors.length === 1) return `linear-gradient(${colors[0]}, ${colors[0]})`;
  const step = 100 / colors.length;
  return `linear-gradient(to bottom, ${colors
    .map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`)
    .join(", ")})`;
}

/* The strip above an anchored passage. It names the behaviours that cite the passage and
 * nothing else: the role sentences are the reason a passage was picked, not part of reading
 * it, and set above every highlight they crowded the specification off the page. They move
 * behind the question mark at the right of the strip, one per anchored passage.
 *
 * Every element here is inline, because a block is whatever the markdown made it -- often a
 * <p>, where insertAdjacentHTML would drop a <div> straight back out again. */
const spoken = value => (value || "").split(" · ").join(", ");

function passageLabels(marks, passageId) {
  const naming = marks.filter(mark => mark.anchored.length);
  const chips = naming.map(mark => `
    <span class="passage-label" style="--bh: ${mark.hue}">
      <span class="passage-label-behaviour">${escapeHTML(mark.behaviour.name)}</span>
    </span>
  `).join("");
  // One reason needs no name: the strip above it already carries the only behaviour there is.
  const pairs = naming.flatMap(mark => mark.anchored.map(passage => ({ mark, passage })));
  const reasons = pairs.map(({ mark, passage }) => `
    <span class="passage-reason" style="--bh: ${mark.hue}">
      ${pairs.length > 1
        ? `<span class="passage-reason-behaviour">${escapeHTML(mark.behaviour.name)}</span>`
        : ""}
      <span class="passage-reason-role">${passage.adjacent ? "Related, " : ""}${
        applyInlineFormatting(escapeHTML(passage.role))}</span>
      <span class="passage-locator">${escapeHTML(passage.locator)}</span>
    </span>
  `).join("");
  const panelId = `${passageId}-why`;
  return `
    <span class="passage-head">
      ${chips}
      ${PASSAGE_ICONS}
      <button type="button" class="passage-why" aria-expanded="false" aria-controls="${panelId}"
        aria-label="Why was this passage selected?" data-tip="Why was this passage selected?">?</button>
    </span>
    <span class="passage-rationale" id="${panelId}" role="note" hidden>${reasons}<span class="passage-link" hidden></span></span>
  `;
}

/* Copy a passage's locator, or a link that opens the reader at it.
 *
 * Two icons in the passage's head, drawn inline: the framework carries no icon
 * library, and the user asked for icons rather than words, so they are SVG in
 * the markup and nothing is loaded for them. A text snippet for the locator, a
 * chain for the link. They stay out of sight until the pointer is over the block
 * or focus is inside it (see .passage-copy). */
const COPY_ICONS = `
      <button type="button" class="passage-copy" data-copy="locator"
        aria-label="Copy locator" title="Copy locator"><svg viewBox="0 0 16 16" aria-hidden="true"
        focusable="false"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none"
        stroke="currentColor" stroke-width="1.4"/><path d="M5 6h6M5 8.5h6M5 11h3.5" fill="none"
        stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>
      <button type="button" class="passage-copy" data-copy="link"
        aria-label="Copy link" title="Copy link"><svg viewBox="0 0 16 16" aria-hidden="true"
        focusable="false"><path d="M6.8 9.2a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.9.9M9.2 6.8a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.9-.9"
        fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>`;

/* Say something about this paragraph.
 *
 * A third icon in the same group as the two copy icons, so it reaches a cited
 * passage's head and an ordinary paragraph's gutter from one addition, and
 * inherits their reveal: out of sight until the pointer is over the block, focus
 * is inside it, or it is tapped. A speech bubble drawn inline, because the
 * framework carries no icon library and no emoji.
 *
 * Its own class, not .passage-copy: the browser walker counts the copy icons of
 * a passage, and an icon that copies nothing must not be counted among them. */
const FEEDBACK_ICON = `
      <button type="button" class="passage-feedback"
        aria-label="Note on this paragraph" title="Note on this paragraph"><svg
        viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path
        d="M3.4 2.9h9.2c.9 0 1.6.7 1.6 1.6v4.8c0 .9-.7 1.6-1.6 1.6H7.2l-2.9 2.2v-2.2H3.4c-.9 0-1.6-.7-1.6-1.6V4.5c0-.9.7-1.6 1.6-1.6Z"
        fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></button>`;

/* The icons a paragraph carries, cited or not: copy its locator, copy a link to
 * it, say something about it. */
const PASSAGE_ICONS = `${COPY_ICONS}${FEEDBACK_ICON}`;

/* What a copy says, done and refused. */
const COPY_SAID = {
  locator: ["Locator copied", "The clipboard was refused. The locator is selected: press copy."],
  link: ["Link copied", "The clipboard was refused. The link is selected: press copy."],
};

// How long "Copied" shows before the button reverts to its own icon, named so
// the call site reads as a decision rather than a bare number.
const COPY_TICK_MS = 2000;

async function copyFromPassage(button) {
  // A paragraph's own icons (setupBlockCopy) copy the paragraph's locator; a cited
  // passage's icons, in its head, copy the locator it is cited by.
  const holder = button.closest(".block-copy")?.parentElement;
  const block = holder || button.closest("[data-passage-id]");
  const locator = holder ? holder.dataset.locator : (block?.dataset.locators || "").split("\n")[0];
  if (!locator) return;
  const kind = button.dataset.copy === "link" ? "link" : "locator";
  const pinned = state.payloadSource?.origin === "pin" ? state.payloadSource.name : null;
  const text = kind === "link" ? passageLink(location.href, locator, pinned) : locator;
  const status = document.getElementById("copy-status");
  const say = sentence => {
    if (!status) return;
    status.textContent = "";          // the same words twice are still announced twice
    status.textContent = sentence;
  };
  try {
    await navigator.clipboard.writeText(text);
    say(COPY_SAID[kind][0]);
    markCopied(button);
  } catch {
    /* A refused clipboard is not a dead end: open the passage's note and select
       what would have been copied, so the usual keyboard copy works. A paragraph
       no passage cites has no note, so the text is written under it instead. */
    const note = holder ? null : block.querySelector(".passage-rationale");
    if (holder) {
      let line = holder.querySelector(":scope > .block-copy-fallback");
      if (!line) {
        line = document.createElement("span");
        line.className = "block-copy-fallback";
        holder.append(line);
      }
      line.textContent = text;
      const range = document.createRange();
      range.selectNodeContents(line);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      say(COPY_SAID[kind][1]);
      return;
    }
    if (!note) return;
    if (note.hidden) {
      note.hidden = false;
      block.querySelector(".passage-why")?.setAttribute("aria-expanded", "true");
      requestAnimationFrame(updateRails);
    }
    let target = [...note.querySelectorAll(".passage-locator")].find(item => item.textContent === locator);
    if (kind === "link") {
      target = note.querySelector(".passage-link");
      target.textContent = text;
      target.hidden = false;
    }
    if (!target) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    say(COPY_SAID[kind][1]);
  }
}

/* Shows the word "Copied" on a successful copy, and puts the button's own icon
 * back after COPY_TICK_MS. The icon is cached in a data attribute the first time
 * this runs and never touched again, so a second press while the word still
 * shows restarts the timer rather than caching the word itself as though it
 * were the button's real content -- the bug that would otherwise leave it
 * permanently. In the button rather than beside it (see .passage-copy.copied):
 * more discreet, one thing instead of two, and the button simply grows to fit
 * the word for the two seconds it shows. */
function markCopied(button) {
  if (button.dataset.icon === undefined) button.dataset.icon = button.innerHTML;
  button.innerHTML = `<span class="copied-label">Copied</span>`;
  button.classList.add("copied");
  clearTimeout(button._copiedTimer);
  button._copiedTimer = setTimeout(() => {
    button.innerHTML = button.dataset.icon;
    button.classList.remove("copied");
  }, COPY_TICK_MS);
}

/* Puts a copy button's own icon back at once, whatever its timer was doing. Called
 * from setupBlockCopy's holdAt whenever the floating toolbar changes paragraph: the
 * toolbar is one shared element, so without this a tick from the paragraph just left
 * would keep showing on the paragraph the pointer lands on next, claiming a copy the
 * reader never made there. */
function resetCopied(scope) {
  scope.querySelectorAll(".passage-copy.copied").forEach(button => {
    clearTimeout(button._copiedTimer);
    button.innerHTML = button.dataset.icon;
    button.classList.remove("copied");
  });
}

/* What a feedback dialog is about: the paragraph whose icon was pressed.
 *
 * The same two shapes copyFromPassage reads. A paragraph's own icons sit in a
 * .block-copy toolbar inside it and it carries one locator; a cited passage
 * keeps its icons in its head and carries the locators it is cited by, newest
 * first, and the behaviours citing it.
 *
 * The behaviours are the intersection and not the menu, because that is what
 * annotatePassages writes: of the behaviours ticked in the sidebar, the ones
 * citing this paragraph. That is exactly the set colouring the text in front of
 * the reader, and the only set the dialog can honestly show them.
 *
 * A third shape, beside a paragraph's own icons and a cited passage's: the icon
 * beside the document's title, whose subject is the document itself -- its id is
 * also what documentOf() in app/lib/feedback.mjs reads as the document, and it
 * carries no behaviours, because a document-wide note is about no passage and no
 * behaviour. */
function feedbackSubject(button) {
  if (button.classList.contains("document-feedback")) {
    const locator = button.closest(".document-panel")?.dataset.documentId;
    return locator ? { locator, behaviours: [] } : null;
  }
  const holder = button.closest(".block-copy")?.parentElement;
  const block = holder || button.closest("[data-passage-id]");
  if (!block) return null;
  const locator = holder ? holder.dataset.locator : (block.dataset.locators || "").split("\n")[0];
  if (!locator) return null;
  // " · " is the delimiter app.js writes and verify-reader-test.mjs splits on.
  // It is not punctuation: a behaviour's own hyphens and commas survive it.
  const behaviours = holder ? []
    : (block.dataset.behaviours || "").split(" · ").map(name => name.trim()).filter(Boolean);
  return { locator, behaviours };
}

/* What is sent. Pure, and given everything it needs, so the harness can hold it
 * to its output without a browser.
 *
 * Visibility is derived, never asked for twice:
 *
 *   private | name    | visibility  | display_name
 *   --------|---------|-------------|-------------
 *   on      | either  | private     | ""
 *   off     | empty   | anonymous   | ""
 *   off     | filled  | attributed  | the name
 *
 * `display_name` is emptied for anything but "attributed": a name typed before
 * the reader chose to be private is not a name they asked us to show. The
 * route does the same on arrival and the database says it as a check
 * constraint, so all three agree. */
function feedbackBody(subject, form, pinned) {
  const visibility = form.private ? "private" : (form.name ? "attributed" : "anonymous");
  return {
    locator: subject.locator,
    behaviours: subject.behaviours,
    publication: pinned,
    vote: form.vote,
    comment: form.comment,
    email: form.email,
    visibility,
    display_name: visibility === "attributed" ? form.name : "",
    website: form.website,
  };
}

/* Opens the note dialog for the paragraph or document whose icon was pressed,
 * filled with what feedbackSubject reads off it. Every field a previous opening
 * may have left behind is reset, because nothing about a paragraph is
 * remembered between paragraphs: a comment or a vote belongs to the paragraph
 * it was written against. Native <dialog> modality traps focus and closes the
 * dialog on Escape on its own; only its own buttons close it otherwise.
 *
 * The address, the name and the private toggle are the exception: they are the
 * reader's own standing answers, not the paragraph's, so they come back from
 * localStorage (see sendFeedback) rather than being blanked here. */
function openFeedbackDialog(button) {
  const subject = feedbackSubject(button);
  if (!subject) return;
  state.feedbackTarget = subject;

  const documentWide = button.classList.contains("document-feedback");
  elements.feedbackTitle.textContent = documentWide ? "Note on this document" : "Note on this paragraph";
  elements.feedbackLocator.textContent = subject.locator;

  const hasBehaviours = subject.behaviours.length > 0;
  elements.feedbackBehavioursField.hidden = !hasBehaviours;
  elements.feedbackBehaviours.value = hasBehaviours ? subject.behaviours.join(", ") : "";

  elements.feedbackForm.querySelectorAll(".thumb").forEach(thumb =>
    thumb.setAttribute("aria-pressed", "false"));
  elements.feedbackComment.value = "";
  elements.feedbackEmail.value = savedString("aci-feedback-email");
  elements.feedbackPrivate.checked = savedFlag("aci-feedback-private");
  elements.feedbackName.value = savedString("aci-feedback-name");
  elements.feedbackName.disabled = elements.feedbackPrivate.checked;
  elements.feedbackWebsite.value = "";
  elements.feedbackOutcome.textContent = "";
  elements.feedbackOutcome.className = "feedback-outcome";
  elements.feedbackSend.disabled = elements.feedbackEmail.value.trim() === "";

  elements.feedbackDialog.showModal();
  elements.feedbackComment.focus();
}

function closeFeedbackDialog() {
  state.feedbackTarget = null;
  elements.feedbackDialog.close();
}

/* What "Send" does: posts feedbackBody(...) to /api/feedback and shows
 * whatever the route said. Disabled for the whole round trip, as a lock
 * against a second click sending the same note twice; a refusal or a network
 * failure re-enables it so the reader can fix what was wrong and try again,
 * and only a success leaves it disabled, because the dialog is about to close
 * on its own.
 *
 * What is remembered is remembered only once something was accepted: an
 * address the route refused is not offered back next time. */
async function sendFeedback() {
  const subject = state.feedbackTarget;
  if (!subject) return;
  const pressed = elements.feedbackForm.querySelector('.thumb[aria-pressed="true"]');
  const pinned = state.payloadSource?.origin === "pin" ? state.payloadSource.name : null;
  const form = {
    vote: pressed?.dataset.vote || null,
    comment: elements.feedbackComment.value,
    email: elements.feedbackEmail.value.trim(),
    private: elements.feedbackPrivate.checked,
    name: elements.feedbackName.value.trim(),
    website: elements.feedbackWebsite.value,
  };

  elements.feedbackSend.disabled = true;
  elements.feedbackOutcome.textContent = "";
  elements.feedbackOutcome.className = "feedback-outcome";

  let outcome;
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(feedbackBody(subject, form, pinned)),
    });
    outcome = await response.json();
  } catch (error) {
    elements.feedbackOutcome.textContent = "That did not reach us. Check your connection and try again.";
    elements.feedbackOutcome.classList.add("problem");
    elements.feedbackSend.disabled = false;
    return;
  }

  if (outcome.problem) {
    elements.feedbackOutcome.textContent = outcome.problem;
    elements.feedbackOutcome.classList.add("problem");
    elements.feedbackSend.disabled = false;
    return;
  }

  elements.feedbackOutcome.textContent = outcome.done || "Thank you.";
  elements.feedbackOutcome.classList.add("done");
  saveString("aci-feedback-email", form.email);
  saveString("aci-feedback-name", form.name);
  saveFlag("aci-feedback-private", form.private);
  setTimeout(closeFeedbackDialog, 1000);
}

/* The dialog's own controls: closing it, the two-way thumbs (a second press on
 * the pressed one clears the vote, since it is optional), the private toggle
 * disabling the name field it would otherwise attach a name to nobody reads,
 * the send button staying disabled until there is an address to write back to,
 * a click on the backdrop, and the submit that actually sends. Called once
 * from initialize(), not eagerly at module load: its wiring only needs the
 * dialog's own elements, which exist as soon as the page does, but it belongs
 * beside the rest of what initialize() sets up rather than ahead of it. */
function setupFeedback() {
  elements.feedbackClose.addEventListener("click", closeFeedbackDialog);
  elements.feedbackCancel.addEventListener("click", closeFeedbackDialog);

  elements.feedbackForm.querySelectorAll(".thumb").forEach(thumb => {
    thumb.addEventListener("click", () => {
      const pressed = thumb.getAttribute("aria-pressed") === "true";
      elements.feedbackForm.querySelectorAll(".thumb").forEach(other =>
        other.setAttribute("aria-pressed", "false"));
      thumb.setAttribute("aria-pressed", String(!pressed));
    });
  });

  elements.feedbackPrivate.addEventListener("change", () => {
    elements.feedbackName.disabled = elements.feedbackPrivate.checked;
  });

  elements.feedbackEmail.addEventListener("input", () => {
    elements.feedbackSend.disabled = elements.feedbackEmail.value.trim() === "";
  });

  // <dialog> attributes a click on its own backdrop to the dialog element
  // itself, since the backdrop is outside every element in it: the form fills
  // the whole of the dialog's box, so this only fires outside that box.
  elements.feedbackDialog.addEventListener("click", event => {
    if (event.target === elements.feedbackDialog) closeFeedbackDialog();
  });

  elements.feedbackForm.addEventListener("submit", event => {
    event.preventDefault();
    sendFeedback();
  });
}

/* The same two icons for every paragraph no passage cites.
 *
 * One toolbar per panel, moved into the paragraph the pointer is over, the one
 * that takes focus (a link opens on it) or the one tapped, rather than a pair of
 * buttons in each of several hundred paragraphs: the document stays as light as
 * it was, and the tab order does not grow by a thousand stops. It sits in the
 * gutter at the paragraph's right (see .block-copy). A cited passage keeps the
 * icons in its head, and none go on a heading, which carries no locator, or on a
 * code block or a table, which scroll sideways and would clip them or put them
 * over their text. Those blocks still open from a link. */
const BLOCK_COPY = `<span class="block-copy">${PASSAGE_ICONS}</span>`;

function setupBlockCopy(panel) {
  const body = panel.querySelector(".document-body");
  const holder = document.createElement("template");
  holder.innerHTML = BLOCK_COPY.trim();
  const toolbar = holder.content.firstElementChild;
  panel._blockCopy = toolbar;
  const holdAt = target => {
    const block = target?.closest?.("[data-locator]");
    if (!block || !body.contains(block) || block.classList.contains("passage")
        || /^(H[1-6]|PRE)$/.test(block.tagName)) return null;
    if (toolbar.parentElement !== block) {
      toolbar.parentElement?.classList.remove("holds-copy", "touched");
      resetCopied(toolbar);   // a tick belongs to the paragraph it copied, not the one the toolbar lands on next
      block.classList.add("holds-copy");
      block.append(toolbar);
    }
    return block;
  };
  body.addEventListener("pointerover", event => holdAt(event.target));
  body.addEventListener("focusin", event => {
    if (!event.target.closest?.(".block-copy")) holdAt(event.target);
  });
  // Where there is no pointer to hover with, a tapped paragraph shows its icons.
  body.addEventListener("click", event => {
    if (!event.target.closest?.(".block-copy")) holdAt(event.target)?.classList.add("touched");
  });
}

/* A paragraph a link names, no passage citing it: its section opened if focus mode
 * had folded it, scrolled to, focused, and outlined for a moment. No behaviour is
 * ticked for it and it is not a passage, so the arrows do not take it as theirs. */
function revealBlock(panel, block) {
  const body = block.closest(".document-body");
  let sectionChild = block;
  while (sectionChild.parentElement && sectionChild.parentElement !== body) {
    sectionChild = sectionChild.parentElement;
  }
  (sectionChild._sectionAncestors || []).forEach(info => { info.collapsed = false; });
  updateSectionVisibility(panel);
  block.scrollIntoView({ behavior: "smooth", block: "center" });
  block.setAttribute("tabindex", "-1");
  block.focus({ preventScroll: true });
  block.classList.add("linked-block");
  setTimeout(() => block.classList.remove("linked-block"), 2500);
  requestAnimationFrame(updateRails);
}

/* Opening a rationale changes the height of the block it sits in, so the rail marks -- which
 * are positioned from block offsets -- have to be measured again once it has laid out. */
function setupPassageDisclosure(panel) {
  panel.querySelector(".document-body").addEventListener("click", event => {
    const copy = event.target.closest(".passage-copy");
    if (copy) {
      copyFromPassage(copy);
      return;
    }
    const feedback = event.target.closest(".passage-feedback");
    if (feedback) {
      openFeedbackDialog(feedback);
      return;
    }
    // Where there is no pointer to hover with, a tapped passage shows its icons.
    event.target.closest("[data-passage-id]")?.classList.add("touched");
  });
  panel.querySelector(".document-body").addEventListener("click", event => {
    const button = event.target.closest(".passage-why");
    if (!button) return;
    const panelEl = panel.querySelector(`#${CSS.escape(button.getAttribute("aria-controls"))}`);
    if (!panelEl) return;
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    panelEl.hidden = open;
    requestAnimationFrame(updateRails);
  });
}

/* Strip every trace of the previous selection, so the next one can be laid over text that
 * reads exactly as the specification does -- passage matching runs against textContent. */
function clearHighlights(panel) {
  const body = panel.querySelector(".document-body");
  // A paragraph that is about to become a passage gets its icons in its head.
  panel._blockCopy?.parentElement?.classList.remove("holds-copy", "touched");
  panel._blockCopy?.remove();
  body.querySelectorAll(".passage-head, .passage-rationale").forEach(part => part.remove());
  body.querySelectorAll(":scope > .zero-coverage").forEach(note => note.remove());
  body.querySelectorAll(".passage").forEach(block => {
    block.classList.remove("passage", "passage-continuation", "adjacent", "passage-overlap", "current", "touched");
    ["passageId", "documentId", "passageNumber", "role", "behaviours", "locators"]
      .forEach(key => { delete block.dataset[key]; });
    ["--tint", "--tint-strong", "--gutter", "--gutter-size", "--gutter-pos",
      "--gutter-width", "--bh-primary"]
      .forEach(property => block.style.removeProperty(property));
    delete block._railTint;
  });
}

function annotatePassages(panel, doc) {
  const body = panel.querySelector(".document-body");
  const missing = [];
  const contributions = new Map();
  const record = (block, behaviour, passage, anchored) => {
    if (!contributions.has(block)) contributions.set(block, []);
    contributions.get(block).push({ behaviour, passage, anchored });
  };

  // Collected for every ticked behaviour before anything is painted: the labels this pass
  // inserts would otherwise sit inside the text the next behaviour's quote is matched against.
  selectedBehaviours().forEach(behaviour => {
    const coverage = behaviour.coverage?.[doc.id] || NO_COVERAGE;
    coverage.passages.forEach(passage => {
      const found = findPassageBlocks(body, passage);
      if (!found) {
        missing.push(passage.locator);
        return;
      }
      record(found.anchor, behaviour, passage, true);
      found.continuation.forEach(extra => record(extra, behaviour, passage, false));
      // An exampleBlock passage, or a quote resolved on the intro before its fence
      // (quoteBeforeFence): either way the code block after the anchor is its example.
      if (passage.exampleBlock || quoteBeforeFence(passage.quote) !== passage.quote) {
        const example = followingExampleBlock(found.anchor);
        if (example) record(example, behaviour, passage, false);
      }
    });
  });

  const behaviours = selectedBehaviours();
  const blocks = [...body.querySelectorAll("[data-block]")].filter(block => contributions.has(block));
  let number = 0;

  blocks.forEach(block => {
    const items = contributions.get(block);
    const marks = behaviours
      .map(behaviour => {
        const own = items.filter(item => item.behaviour === behaviour);
        if (!own.length) return null;
        return {
          behaviour,
          hue: behaviourHue(behaviour),
          texture: behaviourTexture(behaviour),
          adjacent: own.every(item => item.passage.adjacent),
          band: strongestBand(own.map(item => item.passage.band)),
          anchored: own.filter(item => item.anchored).map(item => item.passage),
        };
      })
      .filter(Boolean);

    const anchored = marks.some(mark => mark.anchored.length);
    const gutter = gutterRules(marks);

    block.classList.add("passage");
    block.classList.toggle("adjacent", marks.every(mark => mark.adjacent));
    // The rail and the export read this rather than inferring a tier from the
    // `adjacent` class, which can only ever answer "related or not".
    block.dataset.band = strongestBand(marks.map(mark => mark.band)) || "";
    block.classList.toggle("passage-continuation", !anchored);
    block.classList.toggle("passage-overlap", marks.length > 1);
    block.style.setProperty("--tint", tintGradient(marks, false));
    block.style.setProperty("--tint-strong", tintGradient(marks, true));
    block.style.setProperty("--gutter", gutter.image);
    block.style.setProperty("--gutter-size", gutter.size);
    block.style.setProperty("--gutter-pos", gutter.position);
    block.style.setProperty("--gutter-width", `${gutter.width}px`);
    block.style.setProperty("--bh-primary", marks[0].hue);
    if (!anchored) return;

    number += 1;
    block.dataset.passageId = `${doc.id}-passage-${number}`;
    block.dataset.documentId = doc.id;
    block.dataset.passageNumber = String(number);
    block.dataset.behaviours = marks.map(mark => mark.behaviour.name).join(" · ");
    block.dataset.role = marks
      .flatMap(mark => mark.anchored.map(passage => passage.role))
      .join(" · ");
    // One per line: a locator carries " > " and "·" is prose here, so neither can
    // separate them. What a ?passage= link finds its passage by.
    block.dataset.locators = marks
      .flatMap(mark => mark.anchored.map(passage => passage.locator))
      .join("\n");
    block._railTint = railTint(marks);
    block.insertAdjacentHTML("afterbegin", passageLabels(marks, block.dataset.passageId));
  });

  return { missing };
}

function addContentsSection(body) {
  const children = [...body.children];
  const titleIndex = children.findIndex(child => child.tagName === "H1");
  const firstSectionIndex = children.findIndex((child, index) => index > titleIndex && child.tagName === "H2");
  if (titleIndex < 0 || firstSectionIndex < 0) return;

  const opening = children.slice(titleIndex + 1, firstSectionIndex);
  const linkedRows = opening.filter(child => child.matches("p") && child.querySelector(":scope > a"));
  if (opening.length < 8 || linkedRows.length / opening.length < .7) return;

  const heading = document.createElement("h2");
  heading.dataset.block = "contents";
  heading.dataset.syntheticSection = "true";
  heading.textContent = "Document contents";
  body.insertBefore(heading, opening[0]);
}

function panelFocused(panel) {
  return highlightsActive() && Boolean(state.documentFocus[panel.dataset.documentId]);
}

function updateSectionVisibility(panel) {
  const focused = panelFocused(panel);
  const infos = panel._sectionInfos || [];

  infos.forEach(info => {
    info.heading.classList.toggle("section-collapsed", info.collapsed);
    info.button.setAttribute("aria-expanded", String(!info.collapsed));
  });

  [...panel.querySelector(".document-body").children].forEach(child => {
    const ancestors = child._sectionAncestors || [];
    child.hidden = ancestors.some(info => info.collapsed);
  });

  const toggle = panel.querySelector(".document-focus-toggle");
  // The label names the action the click performs, so this is a command button, not
  // a state toggle: aria-pressed would describe a "focus highlights" mode that the
  // label is already offering to leave. Announcing "Focus highlights, pressed" while
  // nothing is focused -- the default state -- is worse than announcing no state.
  toggle.textContent = focused ? "Expand all" : "Focus highlights";
  toggle.removeAttribute("aria-pressed");
}

/* Focus mode is re-applied whenever the selection changes, so the sections a document
 * opens on follow the behaviours currently ticked. With focus off, sections the reader
 * collapsed by hand are left alone -- unless nothing is highlighted at all, when the
 * toggle is hidden and everything has to be readable again. */
function applyPanelFocus(panel, { expandAll = false } = {}) {
  const focused = panelFocused(panel);
  const infos = panel._sectionInfos || [];
  if (focused) infos.forEach(info => { info.collapsed = !info.hasPassage; });
  else if (expandAll || !highlightsActive()) infos.forEach(info => { info.collapsed = false; });
  updateSectionVisibility(panel);
  requestAnimationFrame(updateRails);
}

/* Which sections carry a highlight changes with every tick of the menu. */
function refreshSectionPassages(panel) {
  const children = [...panel.querySelector(".document-body").children];
  (panel._sectionInfos || []).forEach(info => {
    info.hasPassage = children.some(child => {
      if (!(child._sectionAncestors || []).includes(info)) return false;
      return child.matches(".passage") || Boolean(child.querySelector(".passage"));
    });
    info.heading.classList.toggle("section-has-passage", info.hasPassage);
  });
  applyPanelFocus(panel);
}

function setupSectionFocus(panel) {
  const body = panel.querySelector(".document-body");
  addContentsSection(body);
  const children = [...body.children];
  const stack = [];
  const infos = [];

  children.forEach(child => {
    const headingMatch = child.tagName.match(/^H([2-5])$/);
    if (headingMatch) {
      const level = Number(headingMatch[1]);
      while (stack.length && stack.at(-1).level >= level) stack.pop();

      const title = child.textContent.trim();
      const button = document.createElement("button");
      button.className = "section-heading-button";
      button.type = "button";
      button.innerHTML = `<span class="section-title">${child.innerHTML}</span><span class="section-chevron" aria-hidden="true">▾</span>`;
      button.setAttribute("aria-label", `${title}: toggle section`);
      child.replaceChildren(button);
      child.classList.add("section-heading");

      const info = {
        heading: child,
        button,
        level,
        title,
        ancestors: [...stack],
        hasPassage: false,
        collapsed: false,
      };
      child._sectionAncestors = [...stack];
      infos.push(info);
      stack.push(info);
      return;
    }
    child._sectionAncestors = [...stack];
  });

  infos.forEach(info => {
    info.button.addEventListener("click", () => {
      info.collapsed = !info.collapsed;
      updateSectionVisibility(panel);
      requestAnimationFrame(updateRails);
    });
  });

  panel._sectionInfos = infos;
  panel.querySelector(".document-focus-toggle").addEventListener("click", () => {
    const next = !panelFocused(panel);
    state.documentFocus[panel.dataset.documentId] = next;
    applyPanelFocus(panel, { expandAll: !next });
  });
}

function revealInternalTarget(panel, heading, shouldUpdateHash = true) {
  const body = panel.querySelector(".document-body");
  let sectionChild = heading;
  while (sectionChild.parentElement && sectionChild.parentElement !== body) {
    sectionChild = sectionChild.parentElement;
  }
  (sectionChild._sectionAncestors || []).forEach(info => { info.collapsed = false; });
  updateSectionVisibility(panel);

  const scroll = panel.querySelector(".document-scroll");
  const top = heading.getBoundingClientRect().top
    - scroll.getBoundingClientRect().top
    + scroll.scrollTop
    - 32;
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
  scroll.scrollTo({
    top: Math.max(0, top),
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });

  if (shouldUpdateHash) {
    history.replaceState(null, "", `${location.pathname}${location.search}#${heading.id}`);
  }
  requestAnimationFrame(updateRails);
}

function setupInternalLinks(panel) {
  panel.querySelector(".document-body").addEventListener("click", event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute("href").slice(1);
    const heading = panel.querySelector(`#${CSS.escape(id)}`);
    if (!heading) return;
    event.preventDefault();
    revealInternalTarget(panel, heading);
  });
}

function revealHashTarget() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const heading = elements.documentReader.querySelector(`#${CSS.escape(id)}`);
  const panel = heading?.closest(".document-panel");
  if (heading && panel) revealInternalTarget(panel, heading, false);
}

/* A document the index read in translation.
 *
 * What the panel judged is the translation, so that is what the reader renders
 * and what a citation quotes. The original is carried beside it, passage by
 * passage, and the note in the header says whose translation the judgements are
 * about. A value these maps do not carry prints as it stands: a note naming a
 * translator nobody has named before is worth more than one that says nothing. */
const LANGUAGE_NAMES = { zh: "Chinese", en: "English", fr: "French", es: "Spanish" };
const TRANSLATOR_NAMES = {
  "claude-opus-5": "Claude Opus 5",
  "claude-fable-5": "Claude Fable 5",
};

const languageName = code => LANGUAGE_NAMES[code] || code;

/* Who translated it is free text on an insert-only column, not a model id. The
   one translated document the index carries names two models and the parts the
   second left untouched, so looking the whole field up as a key matched nothing
   and printed raw ids into a sentence the public reads. Every known id is
   replaced wherever it appears instead. An id we do not know still passes
   through as written, which is what it did before, and the column cannot be
   rewritten to suit us: aci_spec_versions takes inserts and nothing else. */
function translatorNames(by) {
  return Object.entries(TRANSLATOR_NAMES).reduce(
    (said, [id, name]) => said.split(id).join(name), by || "");
}

/* The band names who did the work and stops there. The column may go on to list
   which parts a reviser never reached, which is a sentence of section names in a
   strip meant to be read at a glance, so the reader cuts the list at "except".
   What cannot be cut with it is the claim the exceptions qualify. A reviser that
   skipped part of a document did not revise the document, and a translator with
   parts excepted did not translate all of it, so whenever anything is cut the
   band says "in part": on the last "<verb> by" before the cut ("revised in part
   by", "reviewed in part by"), or on the attribution itself where there is none
   ("in part by"). Shorter, and still true.

   Returns the attribution as the band says it, "by" included, because where "in
   part" goes depends on what was cut. With nobody left to name, a field that is
   empty or starts at "except", it returns nothing: "in part by ." credits nobody. */
function shortenTranslator(by) {
  const cut = by.search(/\bexcept\b/i);
  if (cut < 0) return by.trim() ? `by ${by}` : "";
  const kept = by.slice(0, cut).replace(/[\s,;:]+$/, "");
  if (!kept.trim()) return "";
  const clause = [...kept.matchAll(/\b\w+ (by)\b/gi)].at(-1);
  if (!clause) return `in part by ${kept}`;
  const at = clause.index + clause[0].length - clause[1].length;
  return `by ${kept.slice(0, at)}in part ${kept.slice(at)}`;
}

/* `judged` is the document's own flag. Only a documents payload built with
   judged_version_ids carries it, and publish builds none today, so a published
   document has no flag at all; every document of a publication comes from a
   cell some run judged, so the last sentence is true there. A document marked
   `judged: false` sits above "Not judged yet", and saying the index judged it
   would contradict that note on the same screen. */
function translationNote(translation, judged) {
  const by = shortenTranslator(translatorNames(translation.by));
  // A review is worth saying; its absence is the ordinary case for a machine
  // translation and saying so every time buys nothing but length.
  return `Machine translation from ${languageName(translation.from)}${by ? ` ${by}` : ""}`
       + `${translation.reviewed ? ", reviewed by a person" : ""}.`
       + (judged === false ? "" : " The index judged this translation.");
}

/* A viewer may dismiss a translated document's notice. The choice is kept in this
 * browser for that document version only, so another translated document, or a
 * new version of this one, shows its notice. Where storage is refused, savedFlag
 * reads false and the notice shows, the safe direction for a disclosure. */
function translationDismissedKey(documentId) {
  return `aci-translation-dismissed:${documentId}`;
}

/* The notice, or once it is dismissed the short "Translated" label beside Show
 * original, which is what still says the text is a translation. */
function showTranslationNotice(panel) {
  const band = panel.querySelector(".document-translation");
  const flag = panel.querySelector(".translation-flag");
  const translated = Boolean(band?.querySelector(".translation-text")?.textContent);
  const dismissed = translated && savedFlag(translationDismissedKey(panel.dataset.documentId));
  if (band) band.hidden = !translated || dismissed;
  if (flag) flag.hidden = !dismissed;
}

/* The × closes the notice at once: every panel showing this document, since an
 * identical pair shows it twice, and no other. The band sits above the text's
 * scroll box, so the reader's place in the text is untouched; focus goes to the
 * label that remains, since the button it was on has gone. */
elements.documentReader.addEventListener("click", event => {
  const button = event.target.closest?.(".translation-dismiss");
  if (!button) return;
  const panel = button.closest(".document-panel");
  const id = panel?.dataset.documentId;
  if (!id) return;
  saveFlag(translationDismissedKey(id), true);
  panels().filter(item => item.dataset.documentId === id).forEach(showTranslationNotice);
  panel.querySelector(".translation-flag")?.focus({ preventScroll: true });
  requestAnimationFrame(updateRails);
});

/* Each passage's original, reachable from the passage itself.
 *
 * The payload pairs translation with original in document order, both cut the
 * same way by cite.py. The reader cannot name a rendered block with a locator --
 * its own numbering counts headings and cuts lists differently -- so the two
 * lists are walked together instead. A pair matches the block that carries its
 * text, or the block that opens it: an example is one passage, while the reader
 * renders its caption and its dialogue as two blocks, and the caption is where
 * the mark belongs. Blocks the pairs do not cover, headings above all, are
 * stepped over and consume nothing. */
function attachOriginals(panel, doc) {
  const pairs = doc.original;
  if (!pairs?.length || !doc.translation) return;
  const label = `${languageName(doc.translation.from)} original`;
  let next = 0;
  panel.querySelectorAll(".document-body [data-block]").forEach(block => {
    if (next >= pairs.length) return;
    const text = normalize(block.textContent);
    if (!text) return;
    const pair = normalize(pairs[next].text);
    if (pair !== text && !pair.startsWith(text)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "original-open";
    button.dataset.original = pairs[next].original;
    button.dataset.originalLang = doc.translation.from;
    button.dataset.originalLabel = label;
    button.setAttribute("aria-label", `Show the ${label} of this passage`);
    button.title = `Show the ${label}`;
    block.append(button);
    next += 1;
  });
}

/* One popover for every mark on the page, like the key's notes: opening it
 * again from another passage refills it, and light dismiss and Escape come from
 * the browser. A browser without popovers gets marks that do nothing, so the
 * marks are removed rather than left inert. */
function setupOriginalNotes(panel) {
  const note = elements.originalNote;
  if (!note || typeof note.showPopover !== "function") {
    panel.querySelectorAll(".original-open").forEach(button => button.remove());
    return;
  }
  panel.querySelector(".document-body").addEventListener("click", event => {
    const button = event.target.closest(".original-open");
    if (!button) return;
    elements.originalNoteLabel.textContent = button.dataset.originalLabel;
    elements.originalNoteBody.textContent = button.dataset.original;
    elements.originalNoteBody.lang = button.dataset.originalLang;
    if (note.matches(":popover-open")) note.hidePopover();
    note.showPopover();
    placeUnder(note, button);
  });
}

/* A version label as a reader would say it: "14th of August 2026".
 *
 * The label is the date the publisher gave the document, and it is stored as
 * one string because that is what a locator carries. A day of 00 says the
 * publisher dated the month and no more, which is how Alibaba dates its Model
 * Spec, so the label says the month and no more. Anything that is not a date in
 * that shape passes through untouched: a publisher who labels a release "v3" is
 * not wrong, and rewriting it would be this reader inventing a date. */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];

function ordinal(day) {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10] || "th"}`;
}

function versionLabel(version) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(version || "");
  if (!parts) return version || "";
  const [, year, month, day] = parts;
  const name = MONTHS[Number(month) - 1];
  if (!name) return version;
  return day === "00" ? `${name} ${year}` : `${ordinal(Number(day))} of ${name} ${year}`;
}

/* Publishers, and what each publishes.
 *
 * The payload carries documents; a reader thinks in labs first and documents
 * second, which is why the header asks the two questions in two rows. Order is
 * the payload's for labs, and newest first within a lab: a version label sorts
 * as a string because it is a date, and the index has said so since the first
 * locator was written. */
function labsOf(documents = state.payload?.documents || []) {
  const labs = [];
  for (const doc of documents) if (!labs.includes(doc.lab)) labs.push(doc.lab);
  return labs;
}

function documentsOfLab(lab, documents = state.payload?.documents || []) {
  return documents
    .filter(doc => doc.lab === lab)
    .sort((a, b) => String(b.version).localeCompare(String(a.version)));
}

/** The newest document a lab has in this publication. */
function latestOfLab(lab) {
  return documentsOfLab(lab)[0] || null;
}

/* What the second panel opens on.
 *
 * Anthropic's newest, or OpenAI's when Anthropic's is already the one being
 * read. An opening pair is one the reader did not choose, so it shows two
 * different texts. The identical document on both sides is still allowed as the
 * reader's explicit choice, and kept when made (see comparePair). Against a
 * payload carrying neither lab, the first document that is not the one on the
 * left, so a comparison opens on something rather than refusing.
 */
const COMPARISON_ORDER = ["Anthropic", "OpenAI"];

/* The lab a visitor with no ?spec= opens on, when the publication carries it.
 *
 * A preference with a fallback, not an assumption: the reader once defaulted to
 * the id "anthropic" and rendered nothing against a payload without it, so a
 * payload without this lab still opens on its first document. Matched on the head
 * of the document id, which names the lab the same way in every publication
 * (<lab>--<document>@<version>), and the newest version of it wins. */
const PREFERRED_LAB = "anthropic";

function openingDocument(documents, requested) {
  if (documents.some(doc => doc.id === requested)) return requested;
  const preferred = documents
    .filter(doc => String(doc.id).startsWith(`${PREFERRED_LAB}--`))
    .sort((a, b) => String(b.version).localeCompare(String(a.version)))[0];
  return (preferred || documents[0])?.id ?? null;
}

function defaultComparison(leftId) {
  const preferred = COMPARISON_ORDER
    .map(lab => latestOfLab(lab))
    .filter(Boolean)
    .find(doc => doc.id !== leftId);
  if (preferred) return preferred.id;
  return (state.payload?.documents || []).find(doc => doc.id !== leftId)?.id || null;
}

/* One button per publisher, the panel's own. Choosing a publisher shows its
 * newest document, which is the version a reader means unless they say
 * otherwise; the row below is where they say otherwise.
 *
 * Buttons in a labelled group, not tabs. A tablist promises arrow keys, a roving
 * tabindex and a panel each tab controls, and this row keeps none of those
 * promises: each publisher is a stop of its own, and Enter or Space chooses it.
 * The pressed one is the publisher being read. Comparing, both groups would be
 * announced as "Publisher", so each is named for its side. */
const PUBLISHER_GROUP_LABELS = ["Publisher, left document", "Publisher, right document"];

function renderProviderTabs(panel, doc, side = 0) {
  const group = panel.querySelector(".provider-tabs");
  if (!group) return;
  group.setAttribute("aria-label",
    state.comparing ? PUBLISHER_GROUP_LABELS[side] || "Publisher" : "Publisher");
  group.replaceChildren(...labsOf().map(lab => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "provider-tab";
    button.dataset.lab = lab;
    button.textContent = lab;
    button.setAttribute("aria-pressed", String(lab === doc.lab));
    return button;
  }));
}

/* `side` is the panel's position, 0 on the left, which is what names a control
 * when two panels carry the same ones. */
function renderDocument(doc, side = 0) {
  const panel = elements.template.content.firstElementChild.cloneNode(true);
  const markdownContext = {
    headings: buildHeadingIndex(doc.markdown),
    idPrefix: doc.id,
    usedHeadingIds: new Map(),
  };
  panel.dataset.documentId = doc.id;
  // Comparing, document-meta becomes the header's own last child: a row
  // beneath document-row (the name, version and Show original) rather than
  // one more thing squeezed onto that row. That is what puts the arrows
  // first and leftmost on the header's own last row, spanning its full
  // content width whatever wrapped above -- a long title, Show original
  // present on one side only, a resizer split leaving the two panels
  // different widths. The translation band is unaffected: it is already a
  // sibling below the whole header, not one of its rows.
  //
  // On that row the walk is at the left, "N/M" and then the arrows, and what
  // changes the view is at the right: Expand all, then the band toggles. Those
  // two are grouped, so where the row is too narrow for both sides (two panels
  // at 1024px) they wrap below the walk together and stay at the right, rather
  // than one at a time. The moves are in the DOM, not only reordered in CSS, so
  // tab order follows the rows they sit in.
  if (state.comparing) {
    const meta = panel.querySelector(".document-meta");
    panel.querySelector(".document-header").append(meta);
    const actions = document.createElement("span");
    actions.className = "meta-actions";
    actions.append(panel.querySelector(".document-focus-toggle"), panel.querySelector(".rail-legend"));
    meta.append(actions);
  }
  renderProviderTabs(panel, doc, side);
  panel.querySelector(".document-name").textContent = doc.title;
  panel.querySelector(".document-version").textContent = versionLabel(doc.version);
  // Each panel points at its own source. That is the whole reason this link left
  // the row above: up there it could only ever name one of two documents, and
  // when comparing it gave up and said "Sources".
  const source = panel.querySelector(".source-link");
  source.href = doc.sourceUrl;
  source.title = `Open ${doc.title} at its publisher`;
  // Toggle state comes from the shared band set; in compare mode the twin header
  // is kept in step by the rebuild that toggleBand triggers.
  panel.querySelectorAll(".tier-toggle").forEach(button => {
    button.setAttribute("aria-pressed", String(Boolean(state.bands?.has(button.dataset.tier))));
  });
  if (doc.translation) {
    const note = translationNote(doc.translation, doc.judged);
    panel.querySelector(".document-translation .translation-text").textContent = note;
    panel.querySelector(".translation-flag").title = note;
  }
  showTranslationNotice(panel);
  panel.querySelector(".document-body").innerHTML = renderMarkdown(doc.markdown, markdownContext);
  attachLocators(panel, doc);
  attachOriginals(panel, doc);
  setupSectionFocus(panel);
  setupInternalLinks(panel);
  setupPassageDisclosure(panel);
  setupBlockCopy(panel);
  setupOriginalNotes(panel);
  return panel;
}

/* Tier toggles report what they hold and stop pretending to be live when they
 * cannot hold anything. Counts are summed over the ticked behaviours for THIS
 * document, from the same cells the rail renders, so the number on the button and
 * the passages on the page can never disagree. A tier no contributing cell can
 * reach is disabled rather than left inert: on a 3-point rubric the defining cut
 * clamps onto the core cut, so "Core" is structurally empty and a user toggling
 * it would otherwise get silence and no reason for it. */
function updateTierToggles(panel, doc) {
  const cells = selectedBehaviours()
    .map(behaviour => behaviour.coverage?.[doc.id])
    .filter(cov => cov && cov.bandCounts);
  panel.querySelectorAll(".tier-toggle").forEach(button => {
    const tier = button.dataset.tier;
    const count = cells.reduce((total, cov) => total + (cov.bandCounts[tier] || 0), 0);
    const reachable = cells.length === 0 || cells.some(cov => cov.bandReachable?.[tier]);
    button.querySelector(".tier-count").textContent = ` (${count})`;
    button.disabled = !reachable;
    button.classList.toggle("unreachable", !reachable);
    if (!reachable) {
      button.title = `No ${tier} band in this data: on a 3-point rubric the defining `
        + `cut clamps onto the core cut, so no passage can score into ${tier}.`;
    } else if (button.dataset.titleDefault) {
      button.title = button.dataset.titleDefault;
    }
  });
}

/* The run block: which payload is on screen and who judged it. The payload has always
 * carried this -- rubric, panel, the judges actually seen in the data, and any
 * substitution -- and the page has never drawn any of it, so a reader could not tell
 * one run from another, could not see that a judge was substituted on some cells, and
 * had no way to know the judge count that sets the tier cuts they are toggling.
 * It doubles as the fall-through signal: when a ?publication= pin cannot be served the page
 * still renders (by design), and this is where it says so. */
/* The judge count that MATTERS is the per-PASSAGE one: applyPanelThreshold bands each
 * passage on its own verdict count, so that is the number explaining its tier. This
 * comment used to argue the opposite -- that the cell's maximum was the number to
 * report, because a passage missing a verdict did not lower its cell's cut. That was
 * accurate then and it was the bug: a 2-judge passage in a 3-judge cell was measured
 * against a cut it could not reach. Reported as a range only when passages genuinely
 * differ from each other.
 *
 * It is also not the length of judges_seen_in_data: the shipped payload lists five
 * judges across the run while each cell was scored by three, because two of the five
 * are substitutes standing in on single cells. */
function judgesPerCellLabel() {
  const perCell = [];
  (state.rawBehaviours || []).forEach(behaviour => {
    Object.values(behaviour.coverage || {}).forEach(cov => {
      (cov.passages || [])
        .filter(p => p.verdicts)
        .forEach(p => perCell.push(Math.max(1, Object.values(p.verdicts).length)));   // mirrors applyPanelThreshold
    });
  });
  if (!perCell.length) return null;
  const lo = Math.min(...perCell), hi = Math.max(...perCell);
  const n = lo === hi ? `${lo}` : `${lo}\u2013${hi}`;
  return `${n} judge${hi === 1 ? "" : "s"} per passage`;
}

function renderRunProvenance() {
  const box = document.getElementById("run-provenance");
  const summary = document.getElementById("run-summary");
  const detail = document.getElementById("run-detail");
  if (!box || !summary || !detail) return;
  const prov = state.provenance || {};
  const src = state.payloadSource || {};
  const bits = [
    prov.panel_config,
    prov.rubric,
    judgesPerCellLabel(),
    prov.runDate,
  ].filter(Boolean);
  summary.textContent = bits.length ? bits.join(", ") : "Run details";
  box.classList.toggle("fell-through", Boolean(src.requested));

  const rows = [];
  if (src.requested) {
    rows.push(["Requested", src.requested.refused
      ? `${src.requested.name}, not a loadable payload name`
      : `${src.requested.name}, not available`]);
  }
  rows.push(["Showing", `${src.name || "none"}${src.origin ? ` (${src.origin})` : ""}`]);
  if (prov.method) rows.push(["Method", prov.method]);
  if (prov.rubric) rows.push(["Rubric", prov.rubric]);
  if ((prov.panel || []).length) rows.push(["Panel", prov.panel.join(", ")]);
  if ((prov.judges_seen_in_data || []).length) {
    rows.push(["Judges appearing anywhere in this run", prov.judges_seen_in_data.join(", ")]);
  }
  const perCell = judgesPerCellLabel();
  // Spelled out because it is not the length of the list above, and it is the number
  // the tier cuts are derived from.
  if (perCell) rows.push(["Judges scoring each cell", perCell.replace(" per cell", "")]);
  // Published verdicts partly come from substitute judges. Concealing that while
  // publishing the verdicts it produced would misrepresent the panel.
  if (prov.substitution) rows.push(["Substitutions", prov.substitution]);

  detail.replaceChildren(...rows.flatMap(([term, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));
}

function updatePanelMeta(panel, doc) {
  const tracking = highlightsActive();
  panel.querySelector(".rail-legend").hidden = !tracking;
  panel.querySelector(".document-focus-toggle").hidden = !tracking;
  if (tracking) updateTierToggles(panel, doc);

  // Counted from the published set, not from what resolved: a passage that failed to
  // anchor is an unresolved-anchor warning, not an absence of coverage.
  const published = selectedBehaviours()
    .reduce((total, behaviour) => total + (behaviour.coverage?.[doc.id]?.passages.length || 0), 0);
  if (tracking && published === 0) {
    const several = selectedBehaviours().length > 1;
    const filtered = selectedBehaviours()
      .reduce((total, behaviour) => total + (behaviour.coverage?.[doc.id]?.panelFiltered || 0), 0);
    // "Not judged yet" is selected by the document's own `judged` flag. Only a
    // documents payload built with judged_version_ids carries it, and publish
    // builds none today, so a published document always takes one of the other
    // two branches; the reader fixture is what reaches this one.
    panel.querySelector(".document-body").insertAdjacentHTML(
      "afterbegin",
      doc.judged === false
        ? `<div class="zero-coverage" role="note">
            <strong>Not judged yet.</strong>
            <span>No panel has scored this document, so it shows no passages. That is not a finding about the document.</span>
          </div>`
        : filtered > 0
        ? `<div class="zero-coverage" role="note">
            <strong>No passages in the selected tiers.</strong>
            <span>${filtered} scored ${filtered === 1 ? "passage sits" : "passages sit"} in tiers toggled off -- turn one back on above to see them.</span>
          </div>`
        : `<div class="zero-coverage" role="note">
            <strong>${several
              ? "None of the selected behaviours map to a passage in this specification."
              : "No mapped passages in this specification."}</strong>
            <span>Absence of coverage is an index finding, not missing data.</span>
          </div>`,
    );
  }
}

/* Lay the current selection over documents that are already rendered. Nothing here
 * touches the specification text, so ticking a behaviour cannot move the reader. */
function applyHighlights() {
  // One remembered passage per panel: the two documents hold their places
  // independently, and a change of selection must not shuffle one because the
  // other moved.
  const previous = new Map(panels().map(panel =>
    [panel.dataset.documentId, panel._anchors?.[panel._passageIndex] || null]));
  const rendered = panels();
  const missing = [];

  rendered.forEach(panel => {
    const doc = state.payload.documents.find(item => item.id === panel.dataset.documentId);
    clearHighlights(panel);
    const annotated = annotatePassages(panel, doc);
    missing.push(...annotated.missing);
    updatePanelMeta(panel, doc);
    refreshSectionPassages(panel);
  });

  elements.readerStatus.classList.toggle("visible", missing.length > 0);
  elements.readerStatus.textContent = missing.length
    ? `${missing.length} cached passage ${missing.length === 1 ? "anchor could" : "anchors could"} not be resolved against this document version.`
    : "";
  if (missing.length) {
    elements.readerStatus.title = missing.join(" ; ");
    console.info("[anchors] unresolved:", missing);
  }

  requestAnimationFrame(() => {
    collectAnchors();
    updateRails();
    // Hold each reader's place: the passage a panel was on keeps its cursor if it
    // survived the change of selection, and nothing scrolls if it did not.
    panels().forEach(panel => {
      const was = previous.get(panel.dataset.documentId);
      const index = was ? panel._anchors.indexOf(was) : -1;
      focusPassage(panel, Math.max(0, index), false);
    });
  });
}

function visibleDocuments() {
  if (state.comparing) {
    const byId = new Map(state.payload.documents.map(doc => [doc.id, doc]));
    return comparePair().map(id => byId.get(id)).filter(Boolean);
  }
  return [state.payload.documents.find(doc => doc.id === state.selectedSpec)];
}

/* The picker is the only new control, and it earns its place only when there is a
 * choice to make: with the two bundled documents it stays hidden and compare behaves
 * exactly as it always has. A user spec registered locally is what brings it out. */
/* Which document a panel shows, chosen from the panel's own title.
 *
 * This replaces both the row of tabs above the reader and the pair of selects
 * that appeared beside them when comparing. One control, in the one place that
 * names the thing it changes, and in compare mode each side carries its own —
 * so choosing the other half of a comparison no longer means finding a second
 * widget somewhere else on the page.
 *
 * A popover, like the key's notes: light dismiss and Escape come from the
 * browser, and the top layer keeps the list off the document it hangs over. */
function openSpecPicker(button) {
  const panel = button.closest(".document-panel");
  const current = panel?.dataset.documentId;
  const picker = elements.specPicker;
  if (!picker || typeof picker.showPopover !== "function") return;

  // This publisher's documents, newest first. The publisher itself is chosen in
  // the row above, so a list of every document in the index would be a second
  // way to do what the tabs already do, and a longer one.
  const lab = (state.payload?.documents || [])
    .find(doc => doc.id === current)?.lab;
  picker.replaceChildren(...documentsOfLab(lab).map(doc => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "spec-choice";
    option.role = "option";
    option.dataset.spec = doc.id;
    option.setAttribute("aria-selected", String(doc.id === current));
    const name = document.createElement("span");
    name.className = "spec-choice-lab";
    name.textContent = doc.title;
    const detail = document.createElement("small");
    detail.textContent = versionLabel(doc.version);
    option.append(name, detail);
    option.addEventListener("click", () => {
      picker.hidePopover();
      chooseSpec(panel, doc.id);
    });
    return option;
  }));

  if (picker.matches(":popover-open")) picker.hidePopover();
  picker.showPopover();
  placeUnder(picker, button);
}

/* What choosing a document means depends on how many are on screen.
 *
 * Comparing, it replaces this panel's half of the pair, and which half is read
 * from the panel's position rather than stored: the reader already knows the
 * order, and a second source of truth for it would be one to keep in step.
 * Alone, it is simply the document being read. */
function chooseSpec(panel, id) {
  if (!panel) return;
  if (state.comparing) {
    const panels = [...elements.documentReader.querySelectorAll(".document-panel")];
    setComparePair(panels.indexOf(panel) === 1 ? "b" : "a", id);
    return;
  }
  state.selectedSpec = id;
  syncURL();
  rebuildReader();
}

/* A popover under the control that opened it, clamped to the window. The top
 * layer is outside the page's own layout, so the corner is set from script —
 * the same reason the key's notes place themselves. */
function placeUnder(popover, anchor) {
  const rect = anchor.getBoundingClientRect();
  const box = popover.getBoundingClientRect();
  const edge = 12;
  const left = Math.max(edge, Math.min(rect.left, window.innerWidth - box.width - edge));
  const below = rect.bottom + 6;
  const top = below + box.height > window.innerHeight - edge
    ? Math.max(edge, rect.top - box.height - 6)
    : below;
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

/* Each side is chosen on its own, and a document may be put on both.
 *
 * Choosing the document already on the other side used to swap the two. Two
 * versions of one specification were never affected: an id carries its version,
 * so the same document at two dates is two ids and was always a valid pair. What
 * the swap overrode was the identical document on both sides, which is kept now
 * because putting it there is the reader's explicit choice (see comparePair). */
function setComparePair(side, id) {
  const [a, b] = comparePair();
  const next = side === "a" ? [id, b] : [a, id];
  state.comparePair = next;
  // Remembered so that leaving compare and coming back restores the pair the
  // reader chose rather than the one the reader was given.
  state.compareRight = next[1];
  syncURL();
  rebuildReader();
}

/* Every rebuild discards both panels and clones them afresh, so a panel's place
 * is kept only by carrying it across: taken per side before the panels go, and
 * given back to a side still showing the same document. A side whose document
 * changed opens at its top, and the other side keeps its place.
 *
 * The URL's heading is not replayed here. It is revealed once, on load
 * (initialize): replayed on every rebuild, a contents link followed long ago
 * scrolled whichever panel first carried that heading back to it, the other
 * panel included, whenever anything was chosen or toggled. */
function rebuildReader() {
  // Compare's switch sits in the last panel's publisher row, so it leaves with the
  // panels; a keyboard user who pressed it gets it back focused.
  const compareFocused = document.activeElement === elements.compareToggle;
  const kept = [...elements.documentReader.querySelectorAll(".document-panel")].map(panel => ({
    id: panel.dataset.documentId,
    top: panel.querySelector(".document-scroll")?.scrollTop || 0,
    passage: panel._anchors?.[panel._passageIndex]?.dataset.passageId ?? null,
  }));
  elements.documentReader.classList.toggle("compare", state.comparing);
  const rendered = visibleDocuments().map((doc, side) => renderDocument(doc, side));
  const children = state.comparing
    ? rendered.flatMap((panel, i) => (i < rendered.length - 1 ? [panel, createDocumentResizer()] : [panel]))
    : rendered;
  elements.documentReader.replaceChildren(...children);
  const compareRow = rendered.at(-1)?.querySelector(".provider-row");
  if (compareRow) {
    compareRow.append(elements.compareToggle);
    elements.compareToggle.hidden = false;
    if (compareFocused) elements.compareToggle.focus({ preventScroll: true });
  }
  {
    elements.documentReader.style.gridTemplateColumns = "";
    if (state.comparing) setCompareFirst(state.compareFirst);
  }

  applyHighlights();
  updateBehaviourDepths();

  const keepPlace = restoreCursor => rendered.forEach((panel, side) => {
    const was = kept[side];
    if (!was || was.id !== panel.dataset.documentId) return;
    if (restoreCursor && was.passage) {
      const index = (panel._anchors || []).findIndex(anchor => anchor.dataset.passageId === was.passage);
      if (index >= 0) focusPassage(panel, index, false);
    }
    // Instant: the stylesheet scrolls this box smoothly, and a place given back
    // should not be travelled to.
    panel.querySelector(".document-scroll").scrollTo({ top: was.top, behavior: "instant" });
  });
  // Now, so the panel is never drawn at its top first; and again after the
  // frame in which applyHighlights collects the passages and sets the cursor.
  keepPlace(false);
  requestAnimationFrame(() => keepPlace(true));
}

/* Each document counts and walks its own passages.
 *
 * It used to be one list spanning both panels, with a single pair of arrows
 * above them, so stepping through Anthropic eventually crossed into OpenAI and
 * the counter said which one you had landed in. Two documents scored against
 * the same behaviour are two separate readings; walking one should not walk out
 * of it. */
function collectAnchors() {
  panels().forEach(panel => {
    panel._anchors = [...panel.querySelectorAll("[data-passage-id]")];
    if (panel._passageIndex === undefined) panel._passageIndex = 0;
    const empty = panel._anchors.length === 0;
    panel.querySelector(".previous-passage").disabled = empty;
    panel.querySelector(".next-passage").disabled = empty;
    if (empty) {
      panel.querySelector(".passage-count").textContent =
        !payloadBehaviours().length ? "No behaviours under test"
        : !highlightsActive() ? "No behaviours selected"
        : "No passages";
      const short = panel.querySelector(".passage-count-short");
      if (short) short.textContent = "0/0";
    }
  });
  if (!panels().includes(state.activePanel)) state.activePanel = panels()[0] || null;
}

function panels() {
  return [...elements.documentReader.querySelectorAll(".document-panel")];
}

/* Two forms of one count. The sentence is what a screen reader hears everywhere
 * and what a sighted reader sees on one document; comparing, the header has half
 * the width and shows the short form after the arrows instead. */
function updatePassageCount(panel) {
  const total = panel._anchors?.length || 0;
  if (!total) return;
  panel.querySelector(".passage-count").textContent =
    `${panel._passageIndex + 1} of ${total} passages`;
  const short = panel.querySelector(".passage-count-short");
  if (short) short.textContent = `${panel._passageIndex + 1}/${total}`;
}

function updateRails() {
  document.querySelectorAll(".document-panel").forEach(panel => {
    const body = panel.querySelector(".document-body");
    const rail = panel.querySelector(".passage-rail");
    const anchors = [...panel.querySelectorAll("[data-passage-id]")];
    rail.replaceChildren(...anchors.map((anchor, localIndex) => {
      const overlap = anchor.classList.contains("passage-overlap");
      const mark = document.createElement("button");
      mark.type = "button";
      mark.className = "rail-mark"
        + (anchor.classList.contains("adjacent") ? " adjacent" : "")
        + (overlap ? " overlap" : "");
      mark.dataset.forPassage = anchor.dataset.passageId;
      mark.style.setProperty("--rail", anchor._railTint || "");
      mark.style.top = `${Math.min(98, (anchor.offsetTop / body.scrollHeight) * 100)}%`;
      mark.style.height = `max(5px, ${(anchor.offsetHeight / body.scrollHeight) * 100}%)`;
      mark.setAttribute(
        "aria-label",
        `${overlap ? "Shared" : bandLabel(anchor.dataset.band)}`
        + ` passage ${localIndex + 1}, ${spoken(anchor.dataset.behaviours)}: ${spoken(anchor.dataset.role)}`,
      );
      mark.title = `${spoken(anchor.dataset.behaviours)}: ${spoken(anchor.dataset.role)}`;
      mark.addEventListener("click", () => focusPassage(panel, localIndex));
      return mark;
    }));
  });
}

/* Walk one document's passages. The wrap is inside that document: the last
 * passage of a spec leads back to its own first, never into the other pane. */
function focusPassage(panel, index, shouldScroll = true) {
  if (!panel?._anchors?.length) return;
  const total = panel._anchors.length;
  panel._passageIndex = (index + total) % total;
  state.activePanel = panel;
  panel.querySelectorAll(".passage.current, .rail-mark.current")
    .forEach(item => item.classList.remove("current"));

  const anchor = panel._anchors[panel._passageIndex];
  const body = anchor.closest(".document-body");
  let sectionChild = anchor;
  while (sectionChild.parentElement && sectionChild.parentElement !== body) {
    sectionChild = sectionChild.parentElement;
  }
  (sectionChild._sectionAncestors || []).forEach(info => { info.collapsed = false; });
  updateSectionVisibility(panel);
  anchor.classList.add("current");
  panel
    .querySelector(`.rail-mark[data-for-passage="${CSS.escape(anchor.dataset.passageId)}"]`)
    ?.classList.add("current");

  if (shouldScroll) {
    anchor.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  updatePassageCount(panel);
}

elements.selectAllBehaviours.addEventListener("click", () => {
  setSelection(payloadBehaviours().map(behaviour => behaviour.slug));
});
elements.clearBehaviours.addEventListener("click", () => setSelection([]));

/* The title opens the list of documents. Re-cloned by every rebuildReader, so
 * delegated. */
elements.documentReader.addEventListener("click", event => {
  const picker = event.target.closest?.(".document-picker");
  if (picker) {
    openSpecPicker(picker);
    return;
  }
});

/* Beside the document's title: opens the same dialog, about the document as a
 * whole. Re-cloned with the header, so delegated like the picker above. */
elements.documentReader.addEventListener("click", event => {
  const icon = event.target.closest?.(".document-feedback");
  if (icon) openFeedbackDialog(icon);
});

/* The arrows belong to a document and are re-cloned with it, so they delegate
 * and each one steps the panel it sits in. */
elements.documentReader.addEventListener("click", event => {
  const step = event.target.closest?.(".previous-passage, .next-passage");
  if (!step) return;
  const panel = step.closest(".document-panel");
  const delta = step.classList.contains("next-passage") ? 1 : -1;
  focusPassage(panel, (panel._passageIndex || 0) + delta);
  dropPassageParam();
});

/* Choosing a publisher, in the panel that asked. Delegated like the tier
 * toggles, because every rebuild re-clones the headers these buttons live in.
 *
 * The rebuild takes the focused button away with the header, which would drop a
 * keyboard user at the top of the page, so focus goes back to the same publisher
 * in the same panel afterwards. The panel is found by position rather than by
 * document id: comparing, both sides may carry the same document. */
elements.documentReader.addEventListener("click", event => {
  const button = event.target.closest?.(".provider-tab");
  if (!button) return;
  const panel = button.closest(".document-panel");
  const side = panels().indexOf(panel);
  const lab = button.dataset.lab;
  const latest = latestOfLab(lab);
  if (latest && latest.id !== panel?.dataset.documentId) chooseSpec(panel, latest.id);
  panels()[side]
    ?.querySelector(`.provider-tab[data-lab="${CSS.escape(lab)}"]`)
    ?.focus({ preventScroll: true });
});

/* Comparison is one mode over both panels, so it has one switch rather than one in
 * each header: at the right of the last panel's publisher row, where rebuildReader
 * puts it every time the panels are drawn.
 *
 * Turning it on carries the document being read onto the left; turning it off
 * keeps the left-hand document rather than reverting to whatever was selected
 * before. Either way the reader stays with the text they were looking at. */
elements.compareToggle.addEventListener("click", () => {
  const first = panels()[0]?.dataset.documentId;
  if (state.comparing) state.compareRight = comparePair()[1] || state.compareRight;
  state.comparing = !state.comparing;
  if (state.comparing && first) {
    // The side you chose last time, if the payload still carries it; otherwise
    // the opening default. Not refused for being the document already on the
    // left: putting one document on both sides is a choice the reader is
    // allowed to make, so it is a choice worth restoring.
    const remembered = state.payload.documents.some(doc => doc.id === state.compareRight)
      ? state.compareRight
      : defaultComparison(first);
    if (remembered) state.comparePair = [first, remembered];
  } else if (!state.comparing && first) {
    state.selectedSpec = first;
  }
  elements.compareToggle.setAttribute("aria-pressed", String(state.comparing));
  syncURL();
  rebuildReader();
});

document.addEventListener("keydown", event => {
  // Text entry keeps its keys; a checkbox in the behaviour menu does not, so j and k
  // still walk the passages while the reader is ticking behaviours from the keyboard.
  if (event.target.matches("textarea, select, input:not([type=checkbox])")) return;
  if (event.key === "Escape" && state.embedded) {
    window.parent.postMessage({ type: "aci-spec-reader-close" }, location.origin);
    return;
  }
  // Browser/OS shortcuts keep their keys: Ctrl/Cmd/Alt + a letter must not move the
  // passage cursor (e.g. Ctrl+J opens the browser's downloads).
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // The panel the reader last stepped through, or the only one there is.
  const panel = state.activePanel || panels()[0];
  if (event.key === "j") { focusPassage(panel, (panel?._passageIndex || 0) + 1); dropPassageParam(); }
  if (event.key === "k") { focusPassage(panel, (panel?._passageIndex || 0) - 1); dropPassageParam(); }
});

window.addEventListener("resize", () => {
  setSidebarWidth(state.sidebarWidth);
  if (state.comparing) setCompareFirst(state.compareFirst);
  requestAnimationFrame(updateRails);
});

/* Panel-score display filter. Which tiers render is state.bands (the header toggles,
 * ?tiers= in the URL; legacy ?tier=/?threshold= links are mapped once at load by
 * initialBands). One score param remains, URL-only:
 *   ?related=W    weight of a "related" (1) verdict when scoring; core is always 2 and,
 *                 in 4-point rubric data (v5+), defining is always 3.
 *                 [default 1; try 0.5 to demote related votes, or 0 for core-votes-only]
 * Scores are recomputed from each citation's per-model verdicts, so the params compose. */
function applyPanelThreshold(payload) {
  const params = new URLSearchParams(location.search);
  const related = Number(params.get("related") ?? 1);
  (payload.behaviours || []).forEach(behaviour => {
    Object.values(behaviour.coverage || {}).forEach(cov => {
      if (!cov.passages) return;
      // cell scale: 2 on the classic rubric, 3 when any judge awarded a "defining" (v5+)
      const maxVerdict = Math.max(2, ...cov.passages.flatMap(p => p.verdicts ? Object.values(p.verdicts) : []));
      cov.passages.forEach(p => {
        if (!p.verdicts) return;
        const vs = Object.values(p.verdicts);
        p.score = vs.reduce((a, v) => a + (v >= 2 ? v : v === 1 ? related : 0), 0);
        p.maxScore = maxVerdict * vs.length;
      });
      const maxCell = Math.max(0, ...cov.passages.map(p => p.maxScore || 0));
      // Tier bands (the header toggles): per-cell cuts derived from the judge count, so
      // the same tier means the same thing on 3-point and 4-point cells alike. On 3-point
      // cells the defining cut clamps to unanimous core, whose passages then count as
      // defining and the core band sits empty.
      const judges = Math.max(1, ...cov.passages.map(p => p.verdicts ? Object.values(p.verdicts).length : 0));
      /* Cuts follow the passage, not the cell. `judges` above is the cell's LARGEST
       * verdict count, but a passage scored by fewer judges tops out lower -- and
       * compared against the cell's cut it can be structurally incapable of reaching
       * the band it earned. Three passages in behaviours-v4a-ds.json scored a
       * unanimous 4/4 and rendered as "Related · (score 4/4)": no verdict combination
       * could have done better. Each passage is banded on its own scale instead. */
      const passageJudges = p => Math.max(1, Object.keys(p.verdicts || {}).length);
      const band = p => tierBand(p.score, passageJudges(p), p.maxScore || maxCell, related);
      const shownBands = state.bands ?? new Set(DEFAULT_BANDS);
      const before = cov.passages.length;
      // Per-band tallies and reachability, taken BEFORE the toggle filter so the
      // header can report what a tier holds even while that tier is switched off.
      cov.bandCounts = { defining: 0, core: 0, related: 0 };
      cov.bandReachable = bandReachable(judges, maxCell, related);
      cov.passages.forEach(p => {
        if (p.score === undefined) return;
        const b = band(p);
        if (b) cov.bandCounts[b] += 1;
      });
      let subTier = 0;   // below every tier -- never rendered, so never "toggled off"
      cov.passages = cov.passages.filter(p => {
        if (p.score === undefined) return true;
        const b = band(p);
        if (b === null) { subTier += 1; return false; }
        return shownBands.has(b);
      });
      cov.panelFiltered = before - subTier - cov.passages.length;   // hidden by the tier toggles, NOT absent
      cov.passages.forEach(p => {
        if (p.score === undefined) return;
        // The band is what the passage IS; `adjacent` is one question about it, kept
        // because the tint and gutter styling key off it.
        p.band = band(p);
        p.adjacent = p.band === "related";
        // the baked role text carries the build-time score; rewrite it with the recomputed one
        const shown = Number.isInteger(p.score) ? p.score : p.score.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
        p.role = (p.role || "").replace(/\(score [^)]*\)/, `(score ${shown}/${p.maxScore})`);
      });
    });
  });
  return payload;
}

/* Bands a legacy ?threshold=<score> link should select. Named and standalone so
 * engine/panel/test_appjs_tiers.js can extract it verbatim -- a test that copies
 * this arithmetic instead would keep passing after the real code regressed. */
function legacyThresholdBands(t, judges, scale) {
  const defCut = judges > 0 ? Math.min(2 * judges + 1, scale || 2 * judges + 1) : 7;
  const coreCut = judges > 0 ? 2 * judges : 6;
  return t >= defCut ? ["defining"] : t >= coreCut ? ["defining", "core"] : TIERS;
}

/* Judge count and cell scale, read from the loaded payload. Both vary per cell --
 * maxVerdict is 2 on the classic rubric and 3 once any judge awards a "defining", so
 * one payload can carry 6-scale and 9-scale cells at once (behaviours-v5.json does).
 * These take the largest, which is what a score cut written into a URL meant. */
function judgesPerCell() {
  const counts = (state.rawBehaviours || []).flatMap(b =>
    Object.values(b.coverage || {}).flatMap(cov =>
      (cov.passages || []).map(p => Object.keys(p.verdicts || {}).length)));
  return counts.length ? Math.max(...counts) : 0;
}

function maxCellScore() {
  const scales = (state.rawBehaviours || []).flatMap(b =>
    Object.values(b.coverage || {}).map(cov => {
      const ps = cov.passages || [];
      if (!ps.length) return 0;
      const maxVerdict = Math.max(2, ...ps.flatMap(p => Object.values(p.verdicts || {})));
      return maxVerdict * Math.max(0, ...ps.map(p => Object.keys(p.verdicts || {}).length));
    }));
  return scales.length ? Math.max(...scales) : 0;
}

/* Initial tier selection: ?tiers= list, else legacy single-position params mapped to
 * the bands they showed (?tier= gauge links; ?threshold= score links), else defaults. */
function initialBands() {
  const listed = (initialParams.get("tiers") || "")
    .split(",").map(part => (part.trim() === "adjacent" ? "related" : part.trim()))
    .filter(tier => TIERS.includes(tier));
  if (listed.length || initialParams.get("tiers") === "none") return new Set(listed);
  const tier = initialParams.get("tier") === "adjacent" ? "related" : initialParams.get("tier");
  if (TIERS.includes(tier)) return new Set(TIERS.slice(0, TIERS.indexOf(tier) + 1));
  if (initialParams.has("threshold")) {
    // Legacy score links. The cuts are 2j+1 / 2j / j+1, so they depend on the judge
    // count and the cell scale -- 7/6 were those values for a 3-judge 3-point cell,
    // frozen. A 4-point cell (v5+) tops out at 9 and a 2-judge cell at 4, so the same
    // ?threshold= meant different bands on different data. Derive them instead.
    return new Set(legacyThresholdBands(
      Number(initialParams.get("threshold")), judgesPerCell(), maxCellScore()));
  }
  return new Set(DEFAULT_BANDS);
}

function toggleBand(tier) {
  if (!state.rawBehaviours || !state.bands) return;   // data not loaded yet
  if (state.bands.has(tier)) state.bands.delete(tier);
  else state.bands.add(tier);
  state.payload.behaviours =
    applyPanelThreshold({ behaviours: structuredClone(state.rawBehaviours) }).behaviours;
  updateExportControl();
  syncURL();
  rebuildReader();
}

/* The toggles live in the document headers, which rebuildReader re-clones, so the
 * listener is delegated and focus is put back on the equivalent button afterwards.
 * The panel is found by position rather than by document id, as the publisher row
 * does: comparing, both sides may carry the same document, and its id would send
 * focus from a toggle pressed on the right to the one on the left. */
elements.documentReader.addEventListener("click", (event) => {
  const button = event.target.closest?.(".tier-toggle");
  if (!button || !TIERS.includes(button.dataset.tier)) return;
  const side = panels().indexOf(button.closest(".document-panel"));
  toggleBand(button.dataset.tier);
  panels()[side]
    ?.querySelector(`.tier-toggle[data-tier="${button.dataset.tier}"]`)
    ?.focus({ preventScroll: true });
});

async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}


/* What a ?passage= link needs before the panels are drawn: the document its
 * locator names (over ?spec= and the default), a behaviour citing the passage
 * ticked if none already is, and the band it sits in turned on. The band is
 * scored as the reader scores it, with every band on, because the link may name
 * one the rest of the URL left off. A locator the publication carries no passage
 * for changes nothing, and revealPassageLink says so. */
function openPassageLink(locator) {
  if (!locator) return null;
  const doc = documentForLocator(state.payload.documents, locator);
  const cites = behaviour => (behaviour.coverage?.[doc?.id]?.passages || [])
    .some(passage => passage.locator === locator);
  const citing = doc ? (state.rawBehaviours || []).filter(cites) : [];
  if (!doc) return { locator, resolved: false };

  let band = null;
  if (citing.length) {
    const bands = state.bands;
    state.bands = new Set(TIERS);
    band = applyPanelThreshold({ behaviours: structuredClone(citing) }).behaviours
      .flatMap(behaviour => behaviour.coverage?.[doc.id]?.passages || [])
      .find(passage => passage.locator === locator)?.band || null;
    state.bands = bands;
  }
  if (!band) {
    /* No passage the reader shows is cited by it, so it is a paragraph like any
       other: open it if the engine numbers such a block, sentence span aside, and
       tick nothing. A locator the engine gives no block stays unresolved. */
    const withoutSpan = locator.replace(/ s\d+(?:\s*-\s*(?:s?\d+|¶\d+\s*s\d+))?$/, "");
    const blockLocator = [doc.id, ...withoutSpan.split(" > ").slice(1)].join(" > ");
    const known = documentLocators(doc.markdown, doc.id, locatesByAnchor(doc))
      .some(entry => entry.locator === blockLocator);
    if (!known) return { locator, resolved: false };
    state.selectedSpec = doc.id;
    if (state.comparing) state.comparePair = [doc.id, defaultComparison(doc.id)];
    return { locator, blockLocator, documentId: doc.id, resolved: true, uncited: true };
  }

  state.selectedSpec = doc.id;
  if (state.comparing) state.comparePair = [doc.id, defaultComparison(doc.id)];
  if (!citing.some(behaviour => state.selectedSlugs.includes(behaviour.slug))) {
    const chosen = new Set([...state.selectedSlugs, citing[0].slug]);
    state.selectedSlugs = payloadBehaviours().map(behaviour => behaviour.slug)
      .filter(slug => chosen.has(slug));
  }
  if (!state.bands.has(band)) {
    state.bands.add(band);
    state.payload.behaviours =
      applyPanelThreshold({ behaviours: structuredClone(state.rawBehaviours) }).behaviours;
  }
  return { locator, documentId: doc.id, resolved: true };
}

/* The passage itself, once drawn: current for the arrows, scrolled to and
 * focused. Where it cannot be reached, the reader status says so in a sentence
 * and the reader stays as it opened. */
function revealPassageLink(linked) {
  const say = sentence => {
    elements.readerStatus.classList.add("visible");
    elements.readerStatus.textContent = sentence;
  };
  if (!linked.resolved) {
    say(`The passage this link names is not in this publication: ${linked.locator}. `
      + "The reader has opened as it would without the link.");
    return;
  }
  const panel = panels().find(item => item.dataset.documentId === linked.documentId);
  if (linked.uncited) {
    const block = panel?.querySelector(`.document-body [data-locator="${CSS.escape(linked.blockLocator)}"]`);
    if (!block) {
      say(`The passage this link names could not be found in the document: ${linked.locator}.`);
      return;
    }
    revealBlock(panel, block);
    return;
  }
  const index = (panel?._anchors || [])
    .findIndex(anchor => (anchor.dataset.locators || "").split("\n").includes(linked.locator));
  if (index < 0) {
    say(`The passage this link names could not be found in the document: ${linked.locator}.`);
    return;
  }
  focusPassage(panel, index, true);
  const anchor = panel._anchors[index];
  anchor.setAttribute("tabindex", "-1");
  anchor.focus({ preventScroll: true });
}

async function initialize() {
  setupFeedback();
  renderBehaviourList();
  try {
    // The payload first: which publication it resolved to decides where the
    // documents and the behaviour notes are read from, so all three describe the
    // same publication.
    const behaviours = await loadBehaviours();
    // The notes beside the documents, not before them: a note that fails to load
    // must not stop the reader rendering, so its failure is swallowed.
    const [documents] = await Promise.all([loadDocuments(), loadBehaviourNotes()]);
    state.rawBehaviours = behaviours.behaviours || [];
    state.provenance = behaviours.provenance || {};
    state.bands = initialBands();
    state.payload = {
      documents: documents.documents,
      behaviours: applyPanelThreshold({ behaviours: structuredClone(state.rawBehaviours) }).behaviours,
    };
    renderRunProvenance();
    const loaded = state.payload.behaviours;
    state.documentFocus = Object.fromEntries(
      state.payload.documents.map(document => [document.id, loaded.length > 0]));
    const params = initialParams;
    // ?behavior= takes one slug or a comma-separated list; with none given the reader
    // opens on the first behaviour of the set, as the single-choice menu used to.
    const requested = (params.get("behavior") || "")
      .split(",")
      .map(slug => slug.trim())
      .filter(slug => loaded.some(behaviour => behaviour.slug === slug));
    if (requested.length) state.selectedSlugs = requested;
    else if (!params.has("behavior") && loaded.length) state.selectedSlugs = [loaded[0].slug];

    // ?spec= when the payload carries it, else the preferred lab's newest document,
    // else the first document (openingDocument).
    state.selectedSpec = openingDocument(state.payload.documents, params.get("spec"));
    state.comparing = params.get("compare") === "1";
    const pair = (params.get("compare-with") || "").split(",").filter(Boolean);
    if (pair.length === 2) state.comparePair = pair;   // validated by comparePair()
    state.compareFirst = savedNumber("aci-compare-first", state.compareFirst);
    // A link to a passage chooses the document, a behaviour and a band before
    // anything is drawn, and is followed to the passage once the panels are.
    const linked = openPassageLink(params.get(PASSAGE_PARAM));
    elements.compareToggle.setAttribute("aria-pressed", String(state.comparing));
    renderBehaviourList();
    state.keepPassageParam = Boolean(linked?.resolved);
    syncURL();
    state.keepPassageParam = false;
    rebuildReader();
    // A link into a heading is followed once, when the page opens on it.
    requestAnimationFrame(revealHashTarget);
    // Two frames: after the one in which applyHighlights collects the passages.
    if (linked) requestAnimationFrame(() => requestAnimationFrame(() => revealPassageLink(linked)));
  } catch (error) {
    elements.readerStatus.classList.add("visible");
    elements.readerStatus.textContent = "The cached spec documents or the reader's behaviour set could not be loaded. Serve this directory over HTTP and reload.";
    console.error(error);
  }
}

initialize();
