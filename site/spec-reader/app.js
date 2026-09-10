/*
 * Spec reader -- both specifications in full with a behaviour menu laid over them.
 * The behaviour set and its per-passage citations come from a panel run
 * (engine/panel/build_site_data.py), resolved in order from a ?data=<name> pin,
 * data/manifest.json "latest", or the shipped data/behaviours.json fallback (see
 * loadBehaviours); each citation carries per-model verdicts scored into tiers --
 * defining / core / related -- which the header band toggles show or hide
 * (applyPanelThreshold); and the menu is a checklist, so any number of behaviours
 * can be read over the same text at once, side by side in the compare view when it
 * is open. Each behaviour carries its own colour, a core passage is that colour at
 * full strength and a related one the same colour washed out, and a passage cited
 * by more than one selected behaviour blends their colours and shows one gutter
 * rule per behaviour. Colour distinguishes the behaviours; the margin rule's
 * texture distinguishes the groups -- see GROUP_TEXTURE below. The spec text is
 * data/documents.json, built by engine/build-spec-reader-data.py.
 */

const DOCUMENTS_URL = "./data/documents.json";
/* Which behaviour payload the reader loads, resolved in this order:
 *   1. ?data=<name>  -- a pin, name only, no paths (lets prompt-calibration iterations
 *      sit side by side, e.g. ?data=behaviours-v4a, or any timestamped run);
 *   2. data/manifest.json "latest" -- the newest timestamped run emitted by
 *      engine/panel/build_site_data.py (run files and the manifest stay local);
 *   3. data/behaviours.json -- the shipped fallback, always tracked.
 * A source that fails to fetch or parse falls through to the next, so a stale pin,
 * a dangling manifest entry, or a fresh clone (no manifest at all) never breaks the
 * page. The same chain, CLI-side, is engine/panel/select_run.py. */
const MANIFEST_URL = "./data/manifest.json";
const FALLBACK_DATA_URL = "./data/behaviours.json";
const FALLBACK_DATA_NAME = "behaviours.json";
const DATA_NAME = /^[\w.-]+$/;

function dataUrl(name) {
  return `./data/${dataName(name)}`;
}

/* payloadName() is a predicate; this is the filename it approves. */
function dataName(name) {
  return `${name.replace(/\.json$/, "")}.json`;
}

/* Whether a ?data= pin or a manifest "latest" entry may resolve as a payload. It must
 * pass the DATA_NAME charset AND be a behaviours payload -- never the manifest. Loading
 * manifest.json itself would render the run ledger as if it were a behaviour set, so the
 * chain refuses it; only behaviours*.json files are payloads here. Mirrors
 * engine/panel/build_site_data.py's _payload_name(). */
function payloadName(name) {
  if (typeof name !== "string" || !name) return false;
  if (!DATA_NAME.test(name)) return false;
  const fname = name.endsWith(".json") ? name : `${name}.json`;
  if (fname === "manifest.json") return false;
  return fname.startsWith("behaviours");
}

/* Resolves the payload AND records which source won, in state.payloadSource:
 * {origin: "pin"|"latest"|"fallback", name, requested}. The fall-through itself is
 * deliberate -- a stale pin must never break the page -- but the viewer has to be able
 * to tell that it happened, or a dead link is indistinguishable from a live one. The
 * sidebar run block reads this; `requested` is set only when a pin was asked for and
 * not served, which is exactly the case worth flagging. */
async function loadBehaviours() {
  const pinned = new URLSearchParams(location.search).get("data");
  if (payloadName(pinned)) {
    const url = dataUrl(pinned);
    try {
      const payload = await loadJSON(url);
      state.payloadSource = { origin: "pin", name: dataName(pinned) };
      return payload;
    } catch (error) {
      console.warn(`Pinned panel data ${url} unavailable (${error.message}); falling back.`);
    }
  }
  // Two different failures, and the reader deserves to know which: a validly-named
  // pin that could not be fetched (stale link) versus a name payloadName() refuses
  // outright (manifest.json, a traversal attempt). Both fall through by design.
  const requested = pinned ? { name: pinned, refused: !payloadName(pinned) } : null;
  let latest = null;
  try {
    latest = (await loadJSON(MANIFEST_URL)).latest;
  } catch {
    /* No manifest (fresh clone) or an unreadable one -- fall through to the shipped data. */
  }
  if (payloadName(latest)) {
    const url = dataUrl(latest);
    try {
      const payload = await loadJSON(url);
      state.payloadSource = { origin: "latest", name: dataName(latest), requested };
      return payload;
    } catch (error) {
      console.warn(`Latest run ${url} unavailable (${error.message}); falling back.`);
    }
  }
  state.payloadSource = { origin: "fallback", name: FALLBACK_DATA_NAME, requested };
  return loadJSON(FALLBACK_DATA_URL);
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
  selectedSpec: "anthropic",
  comparing: false,
  embedded: false,
  passageIndex: 0,
  anchors: [],
  documentFocus: { anthropic: false, openai: false },
  sidebarWidth: 292,
  sidebarCollapsed: false,
  compareFirst: 50,
  comparePair: null,   // [idA, idB]; null = the first two documents
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
  findingBehaviour: document.querySelector("#finding-behaviour"),
  findingDefinition: document.querySelector("#finding-definition"),
  mode: document.querySelector("#mode"),
  nextPassage: document.querySelector("#next-passage"),
  passageCount: document.querySelector("#passage-count"),
  previousPassage: document.querySelector("#previous-passage"),
  readerStatus: document.querySelector("#reader-status"),
  selectAllBehaviours: document.querySelector("#select-all-behaviours"),
  sidebarResizer: document.querySelector("#sidebar-resizer"),
  sidebarToggle: document.querySelector("#sidebar-toggle"),
  specPicker: document.querySelector("#spec-picker"),
  keyNote: document.querySelector("#key-note"),
  keyNoteTitle: document.querySelector("#key-note-title"),
  keyNoteBody: document.querySelector("#key-note-body"),
  template: document.querySelector("#document-template"),
};

/* Display tiers for panel-scored passages, strongest first. Per cell with j judges:
 * defining is score >= 2j+1 (a "3" vote must be present -- on 3-point data this
 * clamps to unanimous core), core is score >= 2j (unanimous-core strength), related
 * is score >= j+1 (at least two judges behind it) -- except a single-judge cell has
 * no consensus to demand (the clone/fork cheap-run case): the sole judge's verdict
 * IS the whole evidence, so their related vote renders at its own weight instead of
 * dying under the multi-judge floor. Weaker citations never render: with two-plus
 * judges a lone related vote is recorded in the data, not shown. Each tier is a
 * toggle in the document headers; the defaults show defining + core. */
const TIERS = ["defining", "core", "related"];
const DEFAULT_BANDS = ["defining", "core"];

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
      "the document rather than absolute — a judge who finds no passage standing " +
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
      "behaviour. The rubric sets no quota in either direction — a behaviour " +
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
      "tier is off until you ask for it — the toggles in the document header " +
      "beside the version turn it on.",
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
  const label = collapsed ? "Show the behavior menu" : "Hide the behavior menu";
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

/* Compare is a two-document view. With exactly two documents registered there is
 * nothing to choose and the picker stays hidden; with more, the reader picks the two.
 * An unknown or duplicated id in ?compare-with= falls back to the first two, so a
 * stale link still renders something coherent. */
function comparePair() {
  const ids = state.payload.documents.map(doc => doc.id);
  const [a, b] = state.comparePair || [];
  const first = ids.includes(a) ? a : ids[0];
  const second = ids.includes(b) && b !== first ? b : ids.find(id => id !== first);
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

setupSidebarResizer();
setupSidebarToggle();
setupKeyNotes();

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
        <strong>No behaviors under test yet.</strong>
        <p>Both specifications are shown here in full, with no passages highlighted.
        Behaviors appear in this menu once their passage mappings are published to this reader.</p>
      </div>`;
    updateExportControl();
    return;
  }

  const selected = new Set(state.selectedSlugs);
  elements.behaviourList.innerHTML = groups.map(group => `
    <section class="behaviour-group texture-${group.texture}">
      <h2>${escapeHTML(group.name)}</h2>
      <ul>
        ${group.behaviours.map(behaviour => {
          const checked = selected.has(behaviour.slug);
          const texture = behaviourTexture(behaviour);
          return `
          <li>
            <label class="behaviour-option${checked ? " checked" : ""} texture-${texture}" style="--bh: ${behaviourHue(behaviour)}">
              <input
                class="behaviour-check"
                type="checkbox"
                data-behaviour="${escapeHTML(behaviour.slug)}"
                ${checked ? "checked" : ""}
              >
              <span class="behaviour-box" aria-hidden="true"></span>
              <span class="number">${String(behaviour.id).padStart(2, "0")}</span>
              <span class="name">${escapeHTML(behaviour.name)}</span>
            </label>
          </li>
        `;}).join("")}
      </ul>
    </section>
  `).join("");
  elements.behaviourList.querySelectorAll(".behaviour-check").forEach(input => {
    input.addEventListener("change", () => toggleBehaviour(input.dataset.behaviour, input.checked));
  });
  updateBehaviourCount();
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
 * sentence saying why it was picked. Both specifications are written out whichever one is
 * open, because a behaviour's coverage is the pair -- and a spec that maps nothing to it
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
    elements.downloadHint.textContent = "Tick a behavior to export its passages.";
    return;
  }
  const passages = selectedPassageTotal();
  elements.downloadHint.textContent =
    `${behaviours.length} ${behaviours.length === 1 ? "behavior" : "behaviors"}`
    + ` · ${passages} ${passages === 1 ? "passage" : "passages"}, both specs`;
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
    `Behaviors: ${behaviours.map(behaviour => `${paddedNumber(behaviour)} ${behaviour.name}`).join(", ")}.`,
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
    : `${behaviours.length}-behaviors`;
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

function behaviourChip(behaviour) {
  return `<span class="behaviour-chip" style="--bh: ${behaviourHue(behaviour)}">${escapeHTML(behaviour.name)}</span>`;
}

function updateFindingBar(overlaps = null) {
  const behaviours = selectedBehaviours();
  if (!behaviours.length) {
    const loaded = payloadBehaviours().length;
    elements.findingBehaviour.textContent = loaded ? "No behaviors selected" : "No behavior under test";
    elements.findingDefinition.textContent = loaded
      ? "Both specifications are shown in full. Tick a behavior in the menu to highlight the passages that bear on it."
      : "Reading both specifications in full -- nothing is highlighted until a behavior is published to this reader.";
    return;
  }

  elements.findingBehaviour.innerHTML = behaviours.map(behaviourChip).join("");
  if (behaviours.length === 1) {
    elements.findingDefinition.textContent = behaviours[0].definition;
    return;
  }
  const shared = overlaps === null
    ? ""
    : ` · ${overlaps} ${overlaps === 1 ? "passage is" : "passages are"} cited by more than one`;
  elements.findingDefinition.textContent = `${behaviours.length} behaviors read over the same text${shared}.`;
}

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

function renderMarkdown(markdown, context) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let blockNumber = 0;
  const blockAttr = () => `data-block="${++blockNumber}"`;
  const usedHeadingIds = context?.usedHeadingIds || new Map();

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
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
      output.push(`<h${heading.level} ${blockAttr()}${id}>${inlineMarkdown(heading.text, context)}</h${heading.level}>`);
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
      output.push(`<pre class="code-block" ${blockAttr()} data-language="${escapeHTML(language)}">${renderCodeBlock(content.join("\n"), context)}</pre>`);
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
        <aside class="admonition" ${blockAttr()}>
          <div class="admonition-label">${inlineMarkdown(admonition[2] || admonition[1], context)}</div>
          ${renderMarkdown(content.join("\n"), context)}
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
      output.push(`<blockquote ${blockAttr()}>${renderMarkdown(content.join("\n"), context)}</blockquote>`);
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
        items.push(`<li ${blockAttr()}>${inlineMarkdown(item[2], context)}</li>`);
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
      output.push(`<pre class="raw-table" ${blockAttr()}>${escapeHTML(tableLines.join("\n"))}</pre>`);
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
    output.push(`<p ${blockAttr()}>${inlineMarkdown(paragraph.join(" "), context)}</p>`);
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

function findPassageBlocks(body, passage) {
  const needle = normalize(passage.quote);
  const fragments = passageFragments(passage.quote);
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
      <span class="passage-reason-role">${passage.adjacent ? "Related · " : ""}${
        applyInlineFormatting(escapeHTML(passage.role))}</span>
    </span>
  `).join("");
  const panelId = `${passageId}-why`;
  return `
    <span class="passage-head">
      ${chips}
      <button type="button" class="passage-why" aria-expanded="false" aria-controls="${panelId}"
        aria-label="Why was this passage selected?" data-tip="Why was this passage selected?">?</button>
    </span>
    <span class="passage-rationale" id="${panelId}" role="note" hidden>${reasons}</span>
  `;
}

/* Opening a rationale changes the height of the block it sits in, so the rail marks -- which
 * are positioned from block offsets -- have to be measured again once it has laid out. */
function setupPassageDisclosure(panel) {
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
  body.querySelectorAll(".passage-head, .passage-rationale").forEach(part => part.remove());
  body.querySelectorAll(":scope > .zero-coverage").forEach(note => note.remove());
  body.querySelectorAll(".passage").forEach(block => {
    block.classList.remove("passage", "passage-continuation", "adjacent", "passage-overlap", "current");
    ["passageId", "documentId", "passageNumber", "role", "behaviours"]
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
      if (passage.exampleBlock) {
        const example = followingExampleBlock(found.anchor);
        if (example) record(example, behaviour, passage, false);
      }
    });
  });

  const behaviours = selectedBehaviours();
  const blocks = [...body.querySelectorAll("[data-block]")].filter(block => contributions.has(block));
  let overlaps = 0;
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
    if (marks.length > 1) overlaps += 1;

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
    block._railTint = railTint(marks);
    block.insertAdjacentHTML("afterbegin", passageLabels(marks, block.dataset.passageId));
  });

  return { missing, overlaps };
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

function renderDocument(doc) {
  const panel = elements.template.content.firstElementChild.cloneNode(true);
  const markdownContext = {
    headings: buildHeadingIndex(doc.markdown),
    idPrefix: doc.id,
    usedHeadingIds: new Map(),
  };
  panel.dataset.documentId = doc.id;
  panel.querySelector(".document-lab").textContent = doc.lab;
  panel.querySelector(".document-name").textContent = doc.title;
  panel.querySelector(".document-version").textContent = `Version ${doc.version}`;
  // Each panel points at its own source. That is the whole reason this link left
  // the row above: up there it could only ever name one of two documents, and
  // when comparing it gave up and said "Sources".
  const source = panel.querySelector(".source-link");
  source.href = doc.sourceUrl;
  source.title = `Open ${doc.title} at its publisher`;
  panel.querySelector(".compare-toggle").setAttribute("aria-pressed", String(state.comparing));
  // Toggle state comes from the shared band set; in compare mode the twin header
  // is kept in step by the rebuild that toggleBand triggers.
  panel.querySelectorAll(".tier-toggle").forEach(button => {
    button.setAttribute("aria-pressed", String(Boolean(state.bands?.has(button.dataset.tier))));
  });
  panel.querySelector(".document-body").innerHTML = renderMarkdown(doc.markdown, markdownContext);
  setupSectionFocus(panel);
  setupInternalLinks(panel);
  setupPassageDisclosure(panel);
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
 * It doubles as the fall-through signal: when a ?data= pin cannot be served the page
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
  summary.textContent = bits.length ? bits.join(" · ") : "Run details";
  box.classList.toggle("fell-through", Boolean(src.requested));

  const rows = [];
  if (src.requested) {
    rows.push(["Requested", src.requested.refused
      ? `${src.requested.name} — not a loadable payload name`
      : `${src.requested.name} — not available`]);
  }
  rows.push(["Showing", `${src.name || "—"}${src.origin ? ` (${src.origin})` : ""}`]);
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
    panel.querySelector(".document-body").insertAdjacentHTML(
      "afterbegin",
      filtered > 0
        ? `<div class="zero-coverage" role="note">
            <strong>No passages in the selected tiers.</strong>
            <span>${filtered} scored ${filtered === 1 ? "passage sits" : "passages sit"} in tiers toggled off -- turn one back on above to see them.</span>
          </div>`
        : `<div class="zero-coverage" role="note">
            <strong>${several
              ? "None of the selected behaviors map to a passage in this specification."
              : "No mapped passages in this specification."}</strong>
            <span>Absence of coverage is an index finding, not missing data.</span>
          </div>`,
    );
  }
}

/* Lay the current selection over documents that are already rendered. Nothing here
 * touches the specification text, so ticking a behaviour cannot move the reader. */
function applyHighlights() {
  const previous = state.anchors[state.passageIndex] || null;
  const panels = [...elements.documentReader.querySelectorAll(".document-panel")];
  const missing = [];
  let overlaps = 0;

  panels.forEach(panel => {
    const doc = state.payload.documents.find(item => item.id === panel.dataset.documentId);
    clearHighlights(panel);
    const annotated = annotatePassages(panel, doc);
    missing.push(...annotated.missing);
    overlaps += annotated.overlaps;
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
  updateFindingBar(overlaps);

  requestAnimationFrame(() => {
    collectAnchors();
    updateRails();
    // Hold the reader's place: the passage it was on keeps the cursor if it survived
    // the change of selection, and nothing scrolls if it did not.
    const index = previous ? state.anchors.indexOf(previous) : -1;
    focusPassage(Math.max(0, index), false);
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

  picker.replaceChildren(...(state.payload?.documents || []).map(doc => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "spec-choice";
    option.role = "option";
    option.dataset.spec = doc.id;
    option.setAttribute("aria-selected", String(doc.id === current));
    const name = document.createElement("span");
    name.className = "spec-choice-lab";
    name.textContent = doc.lab;
    const detail = document.createElement("small");
    const version = (doc.version || "").replaceAll("-", ".");
    detail.textContent = version ? `${doc.title} · ${version}` : doc.title;
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

/* Picking a document that is already on the other side swaps them rather than
 * refusing: comparing a document with itself is the one selection with no meaning. */
function setComparePair(side, id) {
  const [a, b] = comparePair();
  const next = side === "a" ? [id, b] : [a, id];
  if (next[0] === next[1]) next[side === "a" ? 1 : 0] = side === "a" ? a : b;
  state.comparePair = next;
  syncURL();
  rebuildReader();
}

function rebuildReader() {
  elements.documentReader.classList.toggle("compare", state.comparing);
  const panels = visibleDocuments().map(renderDocument);
  const children = state.comparing
    ? panels.flatMap((panel, i) => (i < panels.length - 1 ? [panel, createDocumentResizer()] : [panel]))
    : panels;
  elements.documentReader.replaceChildren(...children);
  {
    elements.documentReader.style.gridTemplateColumns = "";
    if (state.comparing) setCompareFirst(state.compareFirst);
  }
  state.passageIndex = 0;
  state.anchors = [];

  applyHighlights();
  requestAnimationFrame(revealHashTarget);
}

function collectAnchors() {
  state.anchors = [...elements.documentReader.querySelectorAll("[data-passage-id]")];
  elements.previousPassage.disabled = state.anchors.length === 0;
  elements.nextPassage.disabled = state.anchors.length === 0;

  if (!state.anchors.length) {
    if (!payloadBehaviours().length) elements.passageCount.textContent = "No behaviors under test";
    else if (!highlightsActive()) elements.passageCount.textContent = "No behaviors selected";
    else if (state.comparing) elements.passageCount.textContent = "No passages in either spec";
    else elements.passageCount.textContent = "No passages in this spec";
  }
}

function updatePassageCount() {
  const total = state.anchors.length;
  if (!total) return;
  const current = state.anchors[state.passageIndex];
  const panel = current.closest(".document-panel");
  const lab = panel.querySelector(".document-lab").textContent;
  elements.passageCount.textContent = state.comparing
    ? `${lab} · ${state.passageIndex + 1} of ${total}`
    : `${state.passageIndex + 1} of ${total} passages`;
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
        + ` passage ${localIndex + 1}, ${anchor.dataset.behaviours}: ${anchor.dataset.role}`,
      );
      mark.title = `${anchor.dataset.behaviours} · ${anchor.dataset.role}`;
      mark.addEventListener("click", () => focusPassage(state.anchors.indexOf(anchor)));
      return mark;
    }));
  });
}

function focusPassage(index, shouldScroll = true) {
  if (!state.anchors.length) return;
  state.passageIndex = (index + state.anchors.length) % state.anchors.length;
  document.querySelectorAll(".passage.current, .rail-mark.current").forEach(item => item.classList.remove("current"));

  const anchor = state.anchors[state.passageIndex];
  const body = anchor.closest(".document-body");
  let sectionChild = anchor;
  while (sectionChild.parentElement && sectionChild.parentElement !== body) {
    sectionChild = sectionChild.parentElement;
  }
  const panel = anchor.closest(".document-panel");
  (sectionChild._sectionAncestors || []).forEach(info => { info.collapsed = false; });
  updateSectionVisibility(panel);
  anchor.classList.add("current");
  document
    .querySelector(`.rail-mark[data-for-passage="${CSS.escape(anchor.dataset.passageId)}"]`)
    ?.classList.add("current");

  if (shouldScroll) {
    anchor.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  updatePassageCount();
}

elements.selectAllBehaviours.addEventListener("click", () => {
  setSelection(payloadBehaviours().map(behaviour => behaviour.slug));
});
elements.clearBehaviours.addEventListener("click", () => setSelection([]));

/* The title opens the list of documents; the Compare button beside it switches
 * the mode. Both are re-cloned by every rebuildReader, so both are delegated.
 *
 * Turning comparison ON carries the document you were reading onto the left,
 * rather than falling back to the first two registered. Reading OpenAI and
 * asking to compare should not silently put Anthropic in front of you. */
elements.documentReader.addEventListener("click", event => {
  const picker = event.target.closest?.(".document-picker");
  if (picker) {
    openSpecPicker(picker);
    return;
  }
  const compare = event.target.closest?.(".compare-toggle");
  if (!compare) return;
  const from = compare.closest(".document-panel")?.dataset.documentId;
  state.comparing = !state.comparing;
  if (state.comparing && from) {
    const other = state.payload.documents.find(doc => doc.id !== from);
    if (other) state.comparePair = [from, other.id];
  } else if (!state.comparing && from) {
    state.selectedSpec = from;
  }
  syncURL();
  rebuildReader();
});

elements.previousPassage.addEventListener("click", () => focusPassage(state.passageIndex - 1));
elements.nextPassage.addEventListener("click", () => focusPassage(state.passageIndex + 1));

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
  if (event.key === "j") focusPassage(state.passageIndex + 1);
  if (event.key === "k") focusPassage(state.passageIndex - 1);
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
  updateFindingBar();
  updateExportControl();
  syncURL();
  rebuildReader();
}

/* The toggles live in the document headers, which rebuildReader re-clones, so the
 * listener is delegated and focus is put back on the equivalent button afterwards. */
elements.documentReader.addEventListener("click", (event) => {
  const button = event.target.closest?.(".tier-toggle");
  if (!button || !TIERS.includes(button.dataset.tier)) return;
  const panelId = button.closest(".document-panel")?.dataset.documentId;
  toggleBand(button.dataset.tier);
  elements.documentReader
    .querySelector(`.document-panel[data-document-id="${panelId}"] .tier-toggle[data-tier="${button.dataset.tier}"]`)
    ?.focus({ preventScroll: true });
});

async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}


async function initialize() {
  renderBehaviourList();
  try {
    const [documents, behaviours] = await Promise.all([
      loadJSON(DOCUMENTS_URL),
      loadBehaviours(),
    ]);
    state.rawBehaviours = behaviours.behaviours || [];
    state.provenance = behaviours.provenance || {};
    state.bands = initialBands();
    state.payload = {
      documents: documents.documents,
      behaviours: applyPanelThreshold({ behaviours: structuredClone(state.rawBehaviours) }).behaviours,
    };
    renderRunProvenance();
    const loaded = state.payload.behaviours;
    state.documentFocus = { anthropic: loaded.length > 0, openai: loaded.length > 0 };
    const params = initialParams;
    // ?behavior= takes one slug or a comma-separated list; with none given the reader
    // opens on the first behaviour of the set, as the single-choice menu used to.
    const requested = (params.get("behavior") || "")
      .split(",")
      .map(slug => slug.trim())
      .filter(slug => loaded.some(behaviour => behaviour.slug === slug));
    if (requested.length) state.selectedSlugs = requested;
    else if (!params.has("behavior") && loaded.length) state.selectedSlugs = [loaded[0].slug];

    const requestedSpec = params.get("spec");
    if (state.payload.documents.some(document => document.id === requestedSpec)) {
      state.selectedSpec = requestedSpec;
    }
    state.comparing = params.get("compare") === "1";
    const pair = (params.get("compare-with") || "").split(",").filter(Boolean);
    if (pair.length === 2) state.comparePair = pair;   // validated by comparePair()
    state.compareFirst = savedNumber("aci-compare-first", state.compareFirst);
    updateFindingBar();
    renderBehaviourList();
    syncURL();
    rebuildReader();
  } catch (error) {
    elements.readerStatus.classList.add("visible");
    elements.readerStatus.textContent = "The cached spec documents or the reader's behavior set could not be loaded. Serve this directory over HTTP and reload.";
    elements.passageCount.textContent = "Documents unavailable";
    console.error(error);
  }
}

initialize();
