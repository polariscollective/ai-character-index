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

const state = { behaviours: [], columns: [], passages: {}, depths: {}, registry: {} };

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
    /* What we know, rather than what the lab has done. "Meta has published no
     * specification" is a claim about Meta; "we know of none" is a claim about
     * us, and it is the only one of the two this index can stand behind. */
    body.append(paragraph(
      `We know of no model specification from ${column.lab}. None appears to `
      + "have been published, and that is worth saying plainly rather than "
      + "leaving as a blank: there is no public document to hold beside the "
      + "others."));
    body.append(paragraph(
      "So the nought is that absence. It is not a reading: nobody has examined "
      + `a ${column.lab} specification and found it silent on this behaviour.`,
      "missing"));
    const ask = document.createElement("p");
    const link = document.createElement("a");
    link.href = "/how-it-works?kind=specification#propose";
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
    + `&spec=${encodeURIComponent(document_.id)}`;
  sheet(`${document_.lab}: ${behaviour.name}`, body => {
    const figure = paragraph("");
    const number = document.createElement("span");
    number.className = "sheet-figure";
    number.textContent = depth.mean.toFixed(1);
    figure.append(number,
      document.createTextNode(` out of 4, ${DEPTH_WORDS[Math.round(depth.mean)]}.`));
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
    version.textContent = column.absent ? "unpublished" : shownVersion(column.version);
    cell.append(lab, version);
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
  fitGrid();
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
  const [payload, documents, registry, links] = await Promise.all([
    loadJSON("/api/reader/payload", null),
    loadJSON("/api/reader/documents", null),
    loadJSON("/api/reader/behaviours", null),
    /* One route for both, where two gitignored files used to sit. They were
     * never on any deployment, so this page has shown its figures with nothing
     * under them everywhere but on the machine that wrote the files. */
    loadJSON("/api/reader/links", null),
  ]);
  if (!payload?.behaviours?.length || !documents?.documents?.length) {
    elements.caption.textContent = "The grid could not be loaded.";
    return;
  }
  state.behaviours = payload.behaviours;
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

initialize();
