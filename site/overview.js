/* The grid: how deeply each specification covers each behaviour.
 *
 * Four sources, and only the last two are ours to lose. The payload and the
 * documents are the reader's own endpoints, so the figures here and the figures
 * there are the same publication's. overview.json and depths.json are written
 * beside the site by engine/panel/link_overview.py and link_depth.py and are not
 * deployed: the page renders without either and simply has less to say when a
 * figure is pressed, which is the honest behaviour for a file that may not be
 * there.
 *
 * Nothing is built with innerHTML. The passages are a model's words and the
 * rationales are a model's words, so every one of them lands as a text node.
 *
 * The page carries a second view since September 2026, how each lab governs its
 * rules, built by governance.js. This file owns the tabs between the two.
 */

import { initializeGovernance } from "./governance.js";
/* The depth scales, their words and the colour a figure wears: one module for
 * this page and the reader, which used to carry a copy each. */
import { depthScaleOf, levelsOf, depthWords, depthPhrase, rampAt, inkOver }
  from "./depth-scale.js";

/* Labs the index carries no specification for. They are shown at nought across
 * every behaviour, which is what was asked for, and the caption says why: a
 * nought here is the absence of a document to read, not a document that was
 * read and found to say nothing. Those are different claims and the grid must
 * not let one pass for the other.
 *
 * Mistral AI, Moonshot AI and DeepSeek joined in September 2026, when the
 * governance view took them on: none publishes a model spec either, and a lab
 * the other view ranks should not be missing from this one. */
const WITHOUT_A_SPECIFICATION = ["Google DeepMind", "xAI", "Meta", "Mistral AI", "Moonshot AI",
  "DeepSeek"];

const elements = {
  caption: document.querySelector("#grid-caption"),
  head: document.querySelector("#grid-head"),
  body: document.querySelector("#grid-body"),
  gridScroll: document.querySelector("#grid-scroll"),
  remaining: document.querySelector("#grid-remaining"),
  legend: document.querySelector("#legend"),
  legendList: document.querySelector("#legend-list"),
  sheet: document.querySelector("#sheet"),
  sheetTitle: document.querySelector("#sheet-title"),
  sheetLink: document.querySelector("#sheet-link"),
  sheetBody: document.querySelector("#sheet-body"),
  sheetClose: document.querySelector("#sheet-close"),
};

/* `scale` is the publication's, read from its payload: 10 on a publication out
 * of ten and 4 on every one before it. */
const state = { behaviours: [], columns: [], passages: {}, depths: {}, registry: {}, scale: 4 };

/* A ?publication= pin reaches the grid as it reaches the doc reader: every
 * route the grid reads from is asked for that publication, so a link from the
 * change log shows the depths as that publication published them. The
 * governance view is not part of any publication and does not change with it. */
const PIN = new URLSearchParams(location.search).get("publication");
const PINNED = PIN ? `?publication=${encodeURIComponent(PIN)}` : "";

async function loadJSON(url, fallback) {
  try {
    const response = await fetch(url);
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

/* One column per specification at its newest version. A document id is the
 * specification and its version, and versions are dated strings, so the highest
 * string is the newest. Keyed by specification rather than by lab: they are the
 * same thing while each lab carries one document, and a lab that publishes a
 * second one deserves a column rather than being folded into the other. */
function newestPerSpecification(documents) {
  const newest = new Map();
  documents.forEach(document => {
    const spec = String(document.id).split("@", 1)[0];
    const held = newest.get(spec);
    if (!held || String(document.version) > String(held.version)) {
      newest.set(spec, document);
    }
  });
  // Alphabetical over all of them, mixing the labs with a document into the
  // labs without one. Grouping the examined ones first would read as a ranking
  // of its own, and a reader looking for a lab should find it where its name
  // falls rather than where its coverage does.
  return [...newest.values()]
    .concat(WITHOUT_A_SPECIFICATION.map(lab => ({ lab, absent: true })))
    .sort((a, b) => a.lab.localeCompare(b.lab, "en", { sensitivity: "base" }));
}

/* A version whose day is 00 has no day recorded, so it is shown without one.
 * "2026-04-00" is a date nobody can read, and that nought is the absence of a
 * day rather than a day. Written as a rule rather than a case, so the next
 * specification dated to the month is handled without an edit here. */
const shownVersion = version => String(version || "").replace(/-00$/, "");

/* How many behaviours are still below the fold of the scrolling grid. Measured
 * from the rows themselves rather than from a scroll offset and a row height,
 * because a row's height is whatever its longest name makes it and a sum of
 * assumed heights drifts from what is actually on screen.
 *
 * Nothing is said at the end of the list rather than "0 more below", which is a
 * line that tells a reader what they can already see. */
/* What sits under the grid and must stay on screen: the count of what is below,
 * the caption, and the room the shell keeps for the footer fixed over it. */
const BELOW_THE_GRID = 54;
/* Never less than this, however short the window: a grid showing one row is a
 * list, and a list is not what this page is. */
const LEAST_GRID = 240;
/* How much of the room left under the grid it actually takes. */
const GRID_SHARE = 0.88;

/* The grid takes the height the window leaves it.
 *
 * It was 430px everywhere, which is five rows on a laptop, four on a short
 * window with the caption pushed under the fold, and a third of the screen
 * wasted on a tall one. Measured from where the grid actually begins, so a lede
 * that wraps to three lines at a narrow width moves the grid down and the grid
 * shortens with it, and nothing here has to be kept in step by hand.
 *
 * From the document's top rather than the viewport's, so the answer does not
 * change with how far the page happens to be scrolled. */
function fitGrid() {
  const scroll = elements.gridScroll;
  if (!scroll) return;
  const top = scroll.getBoundingClientRect().top + window.scrollY;
  const below = (elements.remaining?.offsetHeight || 0)
    + (elements.caption?.offsetHeight || 0) + BELOW_THE_GRID;
  /* A share of what is left rather than all of it. Taking the whole of the room
     filled the window to its last pixel, which reads as a page with no end; at
     four fifths the grid still grows with the screen and the page still breathes
     under it. */
  const room = (window.innerHeight - top - below) * GRID_SHARE;
  scroll.style.setProperty("--grid-max", `${Math.max(LEAST_GRID, Math.round(room))}px`);
}

function updateRemaining() {
  const scroll = elements.gridScroll;
  if (!scroll || !elements.remaining) return;
  const foot = scroll.getBoundingClientRect().bottom;
  // Behaviours, not rows: the dividers between groups are rows too, and counting
  // them would promise more below the fold than there is to read.
  const below = [...elements.body.querySelectorAll("tr:not(.group-row)")]
    .filter(row => row.getBoundingClientRect().top >= foot - 1).length;
  elements.remaining.textContent = below
    ? `${below} more ${below === 1 ? "behaviour" : "behaviours"} below`
    : "";
}

function depthOf(behaviour, documentId) {
  const depth = (behaviour.coverage || {})[documentId]?.depth;
  return depth && Number.isFinite(depth.mean) ? depth : null;
}

function paint(button, value, max) {
  const rgb = rampAt(value, max);
  button.style.background = `rgb(${rgb.join(" ")})`;
  button.style.color = inkOver(rgb);
}

/* `link` is the way out of the note and into the passages themselves, offered
 * only where there is a document to open. The reader takes the behaviour and
 * the specification in its query string, so the grid can hand a reader straight
 * to the text a figure was judged from. */
function sheet(title, build, link) {
  elements.sheetTitle.textContent = title;
  if (link) {
    elements.sheetLink.href = link;
    elements.sheetLink.hidden = false;
  } else {
    elements.sheetLink.removeAttribute("href");
    elements.sheetLink.hidden = true;
  }
  const body = document.createDocumentFragment();
  build(body);
  elements.sheetBody.replaceChildren(body);
  elements.sheetBody.scrollTop = 0;
  elements.sheet.showModal();
}

function heading(text) {
  const node = document.createElement("h3");
  node.textContent = text;
  return node;
}

function paragraph(text, className) {
  const node = document.createElement("p");
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

/* A behaviour's own note: what the index means by it. The definition is the
 * brief the panel was given, so it is what the figures in this row were judged
 * against and the right thing to read before them. */
/* The same two sections the reader's own behaviour note prints, from the same
 * endpoint and under the same headings. The boundary was nearly rebuilt here
 * out of the registry and written into the generated file; it is served
 * already, and two sources for one sentence drift apart the first time one of
 * them is edited. */
function openBehaviour(behaviour) {
  const entry = state.registry[behaviour.slug] || {};
  sheet(behaviour.name, body => {
    const asked = entry.query || entry.definition || behaviour.definition;
    body.append(heading("What the judges are asked"));
    body.append(asked
      ? paragraph(asked)
      : paragraph("No brief is recorded for this behaviour.", "missing"));
    if (entry.boundary) {
      body.append(heading("Where the construct stops"));
      body.append(paragraph(entry.boundary));
    }
  });
}

/* A nought that means the index holds no document, rather than a document that
 * was read and found to say nothing. The grid cannot show that difference in a
 * figure, so pressing one says it in words. */
function openAbsent(behaviour, column) {
  sheet(`${column.lab}: ${behaviour.name}`, body => {
    /* What we know, rather than what the lab has done. "Meta has published no
     * specification" is a claim about Meta; "we know of none" is a claim about
     * us, and it is the only one of the two this index can stand behind. */
    body.append(paragraph(
      `We know of no model behaviour specification from ${column.lab}, and none `
      + "appears to have been published, so there is no public document to set "
      + "beside the others."));
    body.append(paragraph(
      "The nought therefore stands for that absence. Nobody has examined a "
      + `${column.lab} specification and found it silent on this behaviour.`,
      "missing"));
    const ask = document.createElement("p");
    const link = document.createElement("a");
    link.href = "/about?propose&kind=specification#propose";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "propose it";
    ask.append(document.createTextNode("If that seems wrong to you, "), link,
               document.createTextNode("."));
    body.append(ask);
  });
}

/* A figure's note: how it was reached, then where this specification stands
 * beside the others. The first comes from the publication and is always there;
 * the second is written from the comparisons already made between each pair and
 * may not be, in which case the note says so rather than showing an empty
 * heading. */
function openCell(behaviour, document_, depth) {
  /* Named by the column that was pressed rather than by the document's short
   * title. The passage below is written from the comparisons, which call the
   * constitution Anthropic's, and a heading calling it Claude's would leave two
   * documents on screen where there is one. */
  const reader = `/spec-reader/?behavior=${encodeURIComponent(behaviour.slug)}`
    + `&spec=${encodeURIComponent(document_.id)}`
    + (PIN ? `&publication=${encodeURIComponent(PIN)}` : "");
  sheet(`${document_.lab}: ${behaviour.name}`, body => {
    const figure = paragraph("");
    const number = document.createElement("span");
    number.className = "sheet-figure";
    number.textContent = depth.mean.toFixed(1);
    figure.append(number,
      document.createTextNode(` out of ${state.scale}, ${depthWords(depth.mean, state.scale)}.`));
    body.append(figure);

    /* Why the figure is what it is, in one voice rather than in three named
     * ones. A reader has no way to weigh one model's name against another's, so
     * the names were noise laid over the only thing that was wanted, which is
     * the reason. Where the panel divided the paragraph says so, because a mean
     * that hides a split is a figure a reader would be wrong to trust. */
    const why = state.depths[`${behaviour.slug}\n${document_.id}`];
    body.append(heading("Why this figure"));
    body.append(why && why.text
      ? paragraph(why.text)
      : paragraph("Not written yet for this specification and behaviour.",
                  "missing"));

    /* The readings it was written from, closed. They are the record, and a
     * record that cannot be reached is a claim; but they are evidence rather
     * than reading, so they sit one press away instead of in the path. */
    const judges = Object.entries(depth.judges || {});
    if (judges.length) {
      const fold = document.createElement("details");
      fold.className = "panel-readings";
      const label = document.createElement("summary");
      label.textContent = `The ${judges.length} readings this was written from`;
      fold.append(label);
      const list = document.createElement("ul");
      list.className = "judges";
      judges.sort(([a], [b]) => a.localeCompare(b)).forEach(([judge, given]) => {
        const item = document.createElement("li");
        const who = document.createElement("span");
        who.className = "who";
        who.textContent = `${judge} gave ${given.depth}`;
        item.append(who);
        if (given.rationale) item.append(paragraph(given.rationale));
        list.append(item);
      });
      fold.append(list);
      body.append(fold);
    }

    const passage = state.passages[`${behaviour.slug}\n${document_.id}`];
    body.append(heading("Where this specification stands"));
    if (passage && passage.text) {
      passage.text.split(/\n{2,}/).forEach(block => {
        const lines = block.split("\n").filter(Boolean);
        lines.forEach(line => body.append(
          /^[A-Z][A-Z ]+:$/.test(line.trim())
            ? heading(line.trim().replace(/:$/, "").toLowerCase()
                .replace(/^./, c => c.toUpperCase()))
            : paragraph(line)));
      });
    } else {
      body.append(paragraph(
        "Not written yet for this specification and behaviour.", "missing"));
    }
  }, reader);
}

function render() {
  const { behaviours, columns } = state;
  const head = document.createDocumentFragment();
  const subject = document.createElement("th");
  subject.scope = "col";
  subject.className = "subject";
  subject.textContent = "Behaviour";
  head.append(subject);
  columns.forEach(column => {
    const cell = document.createElement("th");
    cell.scope = "col";
    const lab = document.createElement("span");
    lab.className = "lab";
    lab.textContent = column.lab;
    const version = document.createElement("span");
    version.className = "version";
    if (column.absent) {
      // A hyphen where a version would be: "unpublished" no longer fits nine
      // columns. A screen reader hears the words rather than "hyphen".
      version.textContent = "-";
      version.setAttribute("aria-hidden", "true");
      const said = document.createElement("span");
      said.className = "visually-hidden";
      said.textContent = "no published specification";
      cell.append(lab, version, said);
    } else {
      version.textContent = shownVersion(column.version);
      cell.append(lab, version);
    }
    head.append(cell);
  });
  elements.head.replaceChildren(head);

  /* Grouped the way the reader's menu groups them, from the same field and by
   * first appearance rather than alphabetically, so the two pages carve the set
   * the same way. Collected into a map rather than compared with the row before,
   * because a payload is free to interleave its categories and a "changed since
   * last" test would then head the same group twice.
   *
   * A divider row inside the one table, not a table per group: one table is what
   * keeps every column aligned down the whole grid, which is the point of it. */
  const grouped = new Map();
  behaviours.forEach(behaviour => {
    const name = behaviour.category || "Behaviours under test";
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(behaviour);
  });

  const rows = document.createDocumentFragment();
  grouped.forEach((members, groupName) => {
    const divider = document.createElement("tr");
    divider.className = "group-row";
    const heading = document.createElement("th");
    heading.scope = "rowgroup";
    heading.colSpan = 1 + columns.length;
    heading.textContent = groupName;
    divider.append(heading);
    rows.append(divider);

    members.forEach(behaviour => {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "subject-button";
      const label = document.createElement("span");
      label.textContent = behaviour.name;
      open.append(label);
      open.addEventListener("click", () => openBehaviour(behaviour));
      name.append(open);
      row.append(name);

      columns.forEach(column => {
        const cell = document.createElement("td");
        cell.className = "cell";
        const depth = column.absent ? null : depthOf(behaviour, column.id);
        if (!depth && !column.absent) {
          const empty = document.createElement("span");
          empty.className = "cell-empty";
          empty.textContent = "–";
          cell.append(empty);
        } else {
          const mean = depth ? depth.mean : 0;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "cell-button";
          paint(button, mean, state.scale);
          // The accessible name says what the cell shows. A screen reader that
          // heard something the sighted reader cannot see would be reading a
          // different grid.
          button.setAttribute("aria-label",
            `${behaviour.name} in ${column.lab}: ${depthPhrase(mean, state.scale)}`);
          // The figure alone. The rubric's word under it ("prescribed") no longer
          // fits once nine specifications share the width, and the scale beside
          // the grid gives every level its word and its sentence; the accessible
          // name above still says the word. Nor the maximum it is read against:
          // every figure on this grid shares one, and the scale says it once.
          const number = document.createElement("span");
          number.className = "cell-figure";
          number.textContent = mean.toFixed(1);
          button.append(number);
          button.addEventListener("click", () => column.absent
            ? openAbsent(behaviour, column)
            : openCell(behaviour, column, depth));
          cell.append(button);
        }
        row.append(cell);
      });
      rows.append(row);
    });
  });
  elements.body.replaceChildren(rows);

  /* Each level with the rubric's own sentence under it, in the rail rather than
   * behind a control: a reader meeting a colour needs to know what it was given
   * for, and a scale that hides its definition is a legend that explains
   * nothing. It makes the rail tall, which is the right trade. */
  const scale = document.createDocumentFragment();
  levelsOf(state.scale).forEach(({ level, anchor, bar }) => {
    const item = document.createElement("li");
    const head = document.createElement("span");
    head.className = "scale-head";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = `rgb(${rampAt(level, state.scale).join(" ")})`;
    const number = document.createElement("span");
    number.className = "level";
    number.textContent = String(level);
    head.append(swatch, number, document.createTextNode(anchor));
    const sentence = document.createElement("span");
    sentence.className = "scale-bar";
    sentence.textContent = bar;
    item.append(head, sentence);
    scale.append(item);
  });
  elements.legendList.replaceChildren(scale);
  elements.legend.hidden = false;

  fitGrid();
  updateRemaining();
  // The caption under the grid said how many behaviours and specifications it
  // held and why some columns stand at nought. It was taken out on review: the
  // noughts are explained where they are pressed, and the count is in the grid.
  elements.caption.textContent = "";
}

async function initialize() {
  const [payload, documents, registry, links] = await Promise.all([
    /* Both sets present and empty: every behaviour and every document is still
     * listed with its heading and its figures, and none of them carries the
     * paragraphs or the document text this page never reads. Measured on
     * 9b7ce377: the payload falls from 888 KB to 131 and the documents from
     * 1069 KB to 1. Of that 131, about half is a citedBy index this page never
     * reads, which sliceColumn attaches whenever a behaviour set is present. */
    loadJSON(`/api/reader/payload${PINNED ? `${PINNED}&` : "?"}behavior=`, null),
    loadJSON(`/api/reader/documents${PINNED ? `${PINNED}&` : "?"}spec=`, null),
    loadJSON(`/api/reader/behaviours${PINNED}`, null),
    /* One route for both, where two gitignored files used to sit. They were
     * never on any deployment, so this page has shown its figures with nothing
     * under them everywhere but on the machine that wrote the files.
     *
     * Asked for with both sets present and empty, which is not the same as
     * leaving them out: absent means every behaviour and every document,
     * present and empty means none of either. This page reads notes.standing
     * and notes.depth and nothing else, and those two travel whole whatever is
     * asked for, so the empty sets drop byLocator and comparisons and keep
     * everything used. Measured on 9b7ce377: 88 KB in place of 5324.
     *
     * The separator is built rather than appended because PINNED is the empty
     * string on an unpinned page, where a bare & would make a query no route
     * can read. */
    loadJSON(`/api/reader/links${PINNED ? `${PINNED}&` : "?"}behavior=&spec=`, null),
  ]);
  if (!payload?.behaviours?.length || !documents?.documents?.length) {
    elements.caption.textContent = "The grid could not be loaded.";
    return;
  }
  state.behaviours = payload.behaviours;
  state.scale = depthScaleOf(payload);
  state.columns = newestPerSpecification(documents.documents);
  state.passages = links?.notes?.standing || {};
  state.depths = links?.notes?.depth || {};
  state.registry = registry || {};
  render();
}

elements.gridScroll?.addEventListener("scroll", updateRemaining, { passive: true });
// A narrower window rewraps the behaviour names, which changes how many rows
// fit; a shorter one changes how many there is room for at all.
window.addEventListener("resize", () => { fitGrid(); updateRemaining(); },
                        { passive: true });

elements.sheetClose.addEventListener("click", () => elements.sheet.close());
elements.sheet.addEventListener("click", event => {
  // <dialog> attributes a click on its backdrop to the dialog itself, and the
  // head and body fill its box, so this fires only outside them.
  if (event.target === elements.sheet) elements.sheet.close();
});

/* Two views of one index, behind tabs: what the specifications say, and how
 * they are governed. The view has an address, ?view=governance, so a link can
 * open on it; the first view is the one with no parameter, which keeps every
 * link already shared pointing where it did.
 *
 * replaceState rather than pushState: a tab is a way of looking at the page,
 * not a page, and filling the back button with tab changes would take a reader
 * back through views rather than out to where they came from. Other parameters,
 * a ?publication= pin among them, are kept. */
const VIEWS = ["coverage", "governance"];
const tabs = [...document.querySelectorAll(".view-tab")];

function viewFromAddress() {
  const asked = new URLSearchParams(location.search).get("view");
  return VIEWS.includes(asked) ? asked : VIEWS[0];
}

function showView(view, { write = false, focus = false } = {}) {
  tabs.forEach(tab => {
    const on = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
    if (on && focus) tab.focus();
  });
  if (write) {
    const url = new URL(location.href);
    if (view === VIEWS[0]) url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    url.hash = "";
    history.replaceState(null, "", url);
  }
  // A hidden grid measures as nothing, so it is measured again on the way back.
  if (view === "coverage") { fitGrid(); updateRemaining(); }
}

tabs.forEach(tab => tab.addEventListener("click", () =>
  showView(tab.dataset.view, { write: true })));
document.querySelector(".views")?.addEventListener("keydown", event => {
  const at = tabs.indexOf(document.activeElement);
  if (at < 0) return;
  const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  showView(tabs[(next + tabs.length) % tabs.length].dataset.view, { write: true, focus: true });
});

showView(viewFromAddress());
initialize();
initializeGovernance({ paint });
