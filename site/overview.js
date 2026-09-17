/* The grid: how deeply each specification covers each behaviour.
 *
 * Three sources, and only the third is ours to lose. The payload and the
 * documents are the reader's own endpoints, so the figures here and the figures
 * there are the same publication's. overview.json is written beside the site by
 * engine/panel/link_overview.py and is not deployed: the page renders without it
 * and simply has less to say when a figure is pressed, which is the honest
 * behaviour for a file that may not be there.
 *
 * Nothing is built with innerHTML. The passages are a model's words and the
 * rationales are a model's words, so every one of them lands as a text node.
 */

const DEPTH_WORDS = ["absent", "named", "discussed", "prescribed", "demonstrated"];

/* Labs the index carries no specification for. They are shown at nought across
 * every behaviour, which is what was asked for, and the caption says why: a
 * nought here is the absence of a document to read, not a document that was
 * read and found to say nothing. Those are different claims and the grid must
 * not let one pass for the other. */
const WITHOUT_A_SPECIFICATION = ["Google", "xAI", "Meta"];

/* Red to green, against the framework's own palette, because the grid is read
 * as a comparison and a single hue at varying strength does not say which end
 * is which. Three stops interpolated in between. */
const RAMP = [
  { at: 0, rgb: [180, 71, 47] },
  { at: 2, rgb: [217, 162, 39] },
  { at: 4, rgb: [76, 140, 63] },
];

function rampAt(value) {
  const held = Math.max(0, Math.min(4, value));
  const upper = RAMP.find(stop => stop.at >= held) || RAMP[RAMP.length - 1];
  const lower = [...RAMP].reverse().find(stop => stop.at <= held) || RAMP[0];
  if (upper === lower) return upper.rgb;
  const across = (held - lower.at) / (upper.at - lower.at);
  return lower.rgb.map((channel, i) =>
    Math.round(channel + across * (upper.rgb[i] - channel)));
}

/* Black or white over the ramp, by the luminance underneath rather than by
 * eye: the amber middle needs dark text where both ends need light. */
function inkOver([r, g, b]) {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#23281B" : "#F1EFE3";
}

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

const state = { behaviours: [], columns: [], passages: {}, registry: {} };

/* The rubric each judge scored against, copied from the reader's own
 * DEPTH_LEVELS. Copied rather than fetched because this page is standalone and
 * has no endpoint for it: the drift that costs is the wording, so if the reader's
 * levels change these must be brought over with them. The source of truth is
 * methodology/spec-coverage-depth-rubric.md. */
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
function updateRemaining() {
  const scroll = elements.gridScroll;
  if (!scroll || !elements.remaining) return;
  const foot = scroll.getBoundingClientRect().bottom;
  const below = [...elements.body.querySelectorAll("tr")]
    .filter(row => row.getBoundingClientRect().top >= foot - 1).length;
  elements.remaining.textContent = below
    ? `${below} more ${below === 1 ? "behaviour" : "behaviours"} below`
    : "";
}

function depthOf(behaviour, documentId) {
  const depth = (behaviour.coverage || {})[documentId]?.depth;
  return depth && Number.isFinite(depth.mean) ? depth : null;
}

function paint(button, value) {
  const rgb = rampAt(value);
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
    body.append(paragraph(
      `The index carries no specification from ${column.lab}, so there is `
      + "nothing here to have been judged."));
    body.append(paragraph(
      "The nought is the absence of a document to read. It is not a reading of "
      + `one: nobody has examined a ${column.lab} specification and found it `
      + "silent on this behaviour.", "missing"));
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
    + `&spec=${encodeURIComponent(document_.id)}`;
  sheet(`${document_.lab}: ${behaviour.name}`, body => {
    const figure = paragraph("");
    const number = document.createElement("span");
    number.className = "sheet-figure";
    number.textContent = depth.mean.toFixed(1);
    figure.append(number,
      document.createTextNode(` out of 4, ${DEPTH_WORDS[Math.round(depth.mean)]}.`));
    body.append(figure);

    const judges = Object.entries(depth.judges || {});
    body.append(heading("How this figure was reached"));
    if (judges.length) {
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
      body.append(list);
    } else {
      body.append(paragraph("No judge's reasoning is recorded.", "missing"));
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
    version.textContent = column.absent ? "unpublished" : shownVersion(column.version);
    cell.append(lab, version);
    head.append(cell);
  });
  elements.head.replaceChildren(head);

  const rows = document.createDocumentFragment();
  behaviours.forEach(behaviour => {
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
        paint(button, mean);
        // The accessible name says what the cell shows. A screen reader that
        // heard something the sighted reader cannot see would be reading a
        // different grid.
        button.setAttribute("aria-label",
          `${behaviour.name} in ${column.lab}: ${mean.toFixed(1)} out of 4, `
          + DEPTH_WORDS[Math.round(mean)]);
        const number = document.createElement("span");
        number.className = "cell-figure";
        number.textContent = mean.toFixed(1);
        const word = document.createElement("span");
        word.className = "cell-word";
        // The rubric's own word either way: nought is "absent" on this scale,
        // and a column with no document is nought, so the cell says the same
        // thing every other cell says. What that nought means differently is
        // the caption's job and the note's, not the cell's.
        word.textContent = DEPTH_WORDS[Math.round(mean)];
        button.append(number, word);
        button.addEventListener("click", () => column.absent
          ? openAbsent(behaviour, column)
          : openCell(behaviour, column, depth));
        cell.append(button);
      }
      row.append(cell);
    });
    rows.append(row);
  });
  elements.body.replaceChildren(rows);

  /* Each level with the rubric's own sentence under it, in the rail rather than
   * behind a control: a reader meeting a colour needs to know what it was given
   * for, and a scale that hides its definition is a legend that explains
   * nothing. It makes the rail tall, which is the right trade. */
  const scale = document.createDocumentFragment();
  DEPTH_LEVELS.forEach(({ level, anchor, bar }) => {
    const item = document.createElement("li");
    const head = document.createElement("span");
    head.className = "scale-head";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = `rgb(${rampAt(level).join(" ")})`;
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

  const judged = columns.filter(column => !column.absent).length;
  const unjudged = columns.filter(column => column.absent).map(c => c.lab);
  updateRemaining();
  elements.caption.textContent =
    `${behaviours.length} behaviours over ${judged} specifications. `
    + "Each figure is the mean of the panel's judges."
    + (unjudged.length
      ? ` ${unjudged.join(", ")} stand at nought throughout because the index `
        + "carries no specification from them, which is the absence of a "
        + "document rather than a reading of one."
      : "");
}

async function initialize() {
  const [payload, documents, registry, passages] = await Promise.all([
    loadJSON("/api/reader/payload", null),
    loadJSON("/api/reader/documents", null),
    loadJSON("/api/reader/behaviours", null),
    loadJSON("./overview.json", null),
  ]);
  if (!payload?.behaviours?.length || !documents?.documents?.length) {
    elements.caption.textContent = "The grid could not be loaded.";
    return;
  }
  state.behaviours = payload.behaviours;
  state.columns = newestPerSpecification(documents.documents);
  state.passages = passages?.cells || {};
  state.registry = registry || {};
  render();
}

elements.gridScroll?.addEventListener("scroll", updateRemaining, { passive: true });
// A narrower window rewraps the behaviour names, which changes how many rows fit.
window.addEventListener("resize", updateRemaining, { passive: true });

elements.sheetClose.addEventListener("click", () => elements.sheet.close());
elements.sheet.addEventListener("click", event => {
  // <dialog> attributes a click on its backdrop to the dialog itself, and the
  // head and body fill its box, so this fires only outside them.
  if (event.target === elements.sheet) elements.sheet.close();
});

initialize();
