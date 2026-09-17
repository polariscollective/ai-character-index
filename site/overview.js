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

const elements = {
  caption: document.querySelector("#grid-caption"),
  head: document.querySelector("#grid-head"),
  body: document.querySelector("#grid-body"),
  legend: document.querySelector("#legend"),
  legendList: document.querySelector("#legend-list"),
  sheet: document.querySelector("#sheet"),
  sheetTitle: document.querySelector("#sheet-title"),
  sheetBody: document.querySelector("#sheet-body"),
  sheetClose: document.querySelector("#sheet-close"),
};

const state = { behaviours: [], columns: [], passages: {} };

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
  return [...newest.values()].sort((a, b) => a.lab.localeCompare(b.lab));
}

function depthOf(behaviour, documentId) {
  const depth = (behaviour.coverage || {})[documentId]?.depth;
  return depth && Number.isFinite(depth.mean) ? depth : null;
}

/* The tint runs across the figures actually present rather than across the
 * whole nought to four scale. Every figure in this publication sits between 2.3
 * and 4.0, and spread over the full scale they would all read as the same
 * shade, which is a grid that shows nothing. */
function tintScale(values) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return value => {
    const across = high === low ? 1 : (value - low) / (high - low);
    return (0.07 + across * 0.45).toFixed(3);
  };
}

function sheet(title, build) {
  elements.sheetTitle.textContent = title;
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
function openBehaviour(behaviour) {
  sheet(behaviour.name, body => {
    body.append(heading("What this behaviour means here"));
    body.append(behaviour.definition
      ? paragraph(behaviour.definition)
      : paragraph("No brief is recorded for this behaviour.", "missing"));
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
  });
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
    version.textContent = column.version;
    cell.append(lab, version);
    head.append(cell);
  });
  elements.head.replaceChildren(head);

  const figures = behaviours.flatMap(behaviour =>
    columns.map(column => depthOf(behaviour, column.id))
      .filter(Boolean).map(depth => depth.mean));
  const tint = tintScale(figures.length ? figures : [0, 4]);

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
      const depth = depthOf(behaviour, column.id);
      if (!depth) {
        const empty = document.createElement("span");
        empty.className = "cell-empty";
        empty.textContent = "–";
        cell.append(empty);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cell-button";
        button.style.setProperty("--tint", tint(depth.mean));
        button.setAttribute("aria-label",
          `${behaviour.name} in ${column.lab}: ${depth.mean.toFixed(1)} out of 4`);
        const number = document.createElement("span");
        number.className = "cell-figure";
        number.textContent = depth.mean.toFixed(1);
        const word = document.createElement("span");
        word.className = "cell-word";
        word.textContent = DEPTH_WORDS[Math.round(depth.mean)];
        button.append(number, word);
        button.addEventListener("click", () => openCell(behaviour, column, depth));
        cell.append(button);
      }
      row.append(cell);
    });
    rows.append(row);
  });
  elements.body.replaceChildren(rows);

  const scale = document.createDocumentFragment();
  DEPTH_WORDS.forEach((word, level) => {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.setProperty("--tint", tint(
      figures.length ? Math.min(...figures) + (level / 4)
        * (Math.max(...figures) - Math.min(...figures)) : level));
    const number = document.createElement("span");
    number.className = "level";
    number.textContent = String(level);
    item.append(swatch, number, document.createTextNode(word));
    scale.append(item);
  });
  elements.legendList.replaceChildren(scale);
  elements.legend.hidden = false;

  elements.caption.textContent =
    `${behaviours.length} behaviours over ${columns.length} specifications. `
    + "Each figure is the mean of the panel's judges.";
}

async function initialize() {
  const [payload, documents, passages] = await Promise.all([
    loadJSON("/api/reader/payload", null),
    loadJSON("/api/reader/documents", null),
    loadJSON("./overview.json", null),
  ]);
  if (!payload?.behaviours?.length || !documents?.documents?.length) {
    elements.caption.textContent = "The grid could not be loaded.";
    return;
  }
  state.behaviours = payload.behaviours;
  state.columns = newestPerSpecification(documents.documents);
  state.passages = passages?.cells || {};
  render();
}

elements.sheetClose.addEventListener("click", () => elements.sheet.close());
elements.sheet.addEventListener("click", event => {
  // <dialog> attributes a click on its backdrop to the dialog itself, and the
  // head and body fill its box, so this fires only outside them.
  if (event.target === elements.sheet) elements.sheet.close();
});

initialize();
