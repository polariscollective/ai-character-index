/* The overview's second view: how each lab governs the rules its models follow.
 *
 * A board rather than a document. Three headline figures, then a heat map that
 * shows the four questions at once or breaks one of them down into its checks,
 * and a panel beside it that answers whatever was pressed: a company's profile,
 * the evidence behind one score, or what a check asks. With nothing pressed, the
 * panel carries the six findings.
 *
 * Everything comes from governance.json: the scores, what each score means, and
 * the text of the research note, lab by lab and question by question. Totals and
 * rank are computed here rather than stored, so the ranking cannot disagree with
 * the checks it is the sum of, and a profile's opening line, "Rulebook, 8 out of
 * 12", is written from the same sums rather than typed beside them.
 *
 * Nothing is built with innerHTML, as in overview.js. The text here is ours
 * rather than a model's, but one rule for the whole page is easier to keep.
 */

/* Per question, the sum of its checks; then the total out of 40 and the
 * supporting practices, which are reported beside the total and never in it. */
export function totalsFor(data, labId) {
  const scores = data.scores[labId];
  const byQuestion = {};
  data.questions.forEach(question => {
    byQuestion[question.id] = question.checks
      .reduce((sum, check) => sum + scores[check.id], 0);
  });
  const total = Object.values(byQuestion).reduce((sum, value) => sum + value, 0);
  return { byQuestion, total, supporting: data.supporting_totals[labId] };
}

/* By total, and a tie broken on the supporting practices. That is the research
 * note's own rule, and the one tie it has to break is Meta and xAI on 5. */
export function ranked(data) {
  return data.labs
    .map(lab => ({ ...lab, ...totalsFor(data, lab.id) }))
    .sort((a, b) => b.total - a.total || b.supporting - a.supporting);
}

const TOTAL = 40;
const SUPPORTING = 10;
const maxOf = question => question.checks.length * 4;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const board = {
  data: null,
  labs: [],
  /* "overall", or a question's id when that question is broken down. */
  mode: "overall",
  /* What the panel answers: null for the findings, or
   *   { kind: "lab", lab, open }        a company's profile, one question unfolded
   *   { kind: "score", lab, question, check }  one check's score for one company
   *   { kind: "check", question, check }       what one check asks */
  selection: null,
  paint: null,
  nodes: {},
};

const question = id => board.data.questions.find(q => q.id === id);
const labOf = id => board.labs.find(lab => lab.id === id);

/* A score painted the way the grid paints a depth. `share` is a score over its
 * maximum, so 8 of 12 and 2.67 of 4 wear the same colour. */
function paintShare(node, value, max) {
  board.paint(node, (value / max) * 4);
}

function chip(value, max) {
  const node = element("span", "chip", String(value));
  paintShare(node, value, max);
  return node;
}

/* ---- The headline figures ------------------------------------------------ */

function renderKpis() {
  const { data, labs } = board;
  // The first two questions together are the minimum the proposal asks for.
  const minimum = labs
    .map(lab => ({ lab, value: lab.byQuestion["1"] + lab.byQuestion["2"] }))
    .sort((a, b) => b.value - a.value)[0];
  const minimumMax = maxOf(question("1")) + maxOf(question("2"));
  const meeting = check => labs.filter(lab => data.scores[lab.id][check] === 4).length;

  const figures = [
    { figure: `${minimum.value}`, small: ` out of ${minimumMax}`,
      caption: `The best score on the minimum we propose, ${minimum.lab.name}'s: a `
        + "published rulebook for every model, and one record of every change." },
    { figure: `${meeting("4.2")}`, small: ` of ${labs.length}`,
      caption: "Companies that let the public comment before a firm limit is loosened." },
    { figure: `${meeting("1.3")}`, small: ` of ${labs.length}`,
      caption: "Companies that publish the rules their models follow in government, "
        + "defence and other special deployments." },
  ];
  const row = document.createDocumentFragment();
  figures.forEach(({ figure, small, caption }) => {
    const tile = element("p", "gov-kpi");
    const number = element("span", "gov-kpi-figure", figure);
    number.append(element("small", "", small));
    tile.append(number, element("span", "gov-kpi-caption", caption));
    row.append(tile);
  });
  board.nodes.kpis.replaceChildren(row);
}

/* ---- The ways to break the scores down --------------------------------------- */

function renderModes() {
  const row = document.createDocumentFragment();
  const modes = [{ id: "overall", label: "All four questions" }]
    .concat(board.data.questions.map(q => ({ id: q.id, label: q.name })));
  modes.forEach(({ id, label }) => {
    const button = element("button", "gov-mode", label);
    button.type = "button";
    button.dataset.mode = id;
    button.setAttribute("aria-pressed", String(board.mode === id));
    button.addEventListener("click", () => setMode(id));
    row.append(button);
  });
  board.nodes.modes.replaceChildren(row);

  const note = board.nodes.modeNote;
  if (board.mode === "overall") {
    note.replaceChildren(document.createTextNode(
      "Press a question's name to break it down into its checks, a company's name "
      + "for its profile, or any score for the evidence behind it."));
  } else {
    const q = question(board.mode);
    note.replaceChildren(element("strong", "", `${q.name}. `),
      document.createTextNode(`${q.question} ${q.explainer}`));
  }
}

function setMode(mode) {
  board.mode = mode;
  // A score picked in one breakdown has no cell in another.
  if (board.selection?.kind === "score" || board.selection?.kind === "check") {
    board.selection = null;
  }
  render();
}

/* ---- The heat map ------------------------------------------------------------- */

/* The columns of the current breakdown: what each shows, its maximum, and what
 * pressing its head does. */
function columns() {
  const { data } = board;
  if (board.mode === "overall") {
    return [
      { id: "total", name: "Overall", sub: `out of ${TOTAL}`, max: TOTAL,
        value: lab => lab.total, open: lab => ({ kind: "lab", lab: lab.id, open: null }) },
      ...data.questions.map(q => ({
        id: q.id, name: q.name, sub: `out of ${maxOf(q)}`, max: maxOf(q),
        value: lab => lab.byQuestion[q.id],
        head: () => setMode(q.id),
        headLabel: `${q.name}, out of ${maxOf(q)}: break it down into its checks`,
        open: lab => ({ kind: "lab", lab: lab.id, open: q.id }),
      })),
      { id: "supporting", name: "Supporting practices", sub: `out of ${SUPPORTING}, not counted`,
        max: SUPPORTING, apart: true, value: lab => lab.supporting,
        open: lab => ({ kind: "lab", lab: lab.id, open: "supporting" }) },
    ];
  }
  const q = question(board.mode);
  return [
    { id: `total-${q.id}`, name: q.name, sub: `out of ${maxOf(q)}`, max: maxOf(q),
      value: lab => lab.byQuestion[q.id],
      open: lab => ({ kind: "lab", lab: lab.id, open: q.id }) },
    ...q.checks.map(check => ({
      id: check.id, name: check.short, sub: check.id, max: 4,
      value: lab => data.scores[lab.id][check.id],
      head: () => select({ kind: "check", question: q.id, check: check.id }),
      headLabel: `${check.id} ${check.label}: what its scores mean`,
      open: lab => ({ kind: "score", lab: lab.id, question: q.id, check: check.id }),
    })),
  ];
}

function sameSelection(a, b) {
  return Boolean(a && b) && a.kind === b.kind && a.lab === b.lab
    && a.question === b.question && a.check === b.check && a.open === b.open;
}

function renderHeatmap() {
  const cols = columns();
  const head = element("tr");
  const corner = element("th", "lab-col");
  corner.scope = "col";
  corner.append(element("span", "head-name", "Company"),
    element("span", "head-sub", "by rank"));
  head.append(corner);
  cols.forEach(col => {
    const cell = element("th", col.apart ? "apart" : "");
    cell.scope = "col";
    const name = element("span", "head-name", col.name);
    const sub = element("span", "head-sub", col.sub);
    if (col.head) {
      const button = element("button", "head-button");
      button.type = "button";
      button.setAttribute("aria-label", col.headLabel);
      button.append(name, sub);
      button.addEventListener("click", col.head);
      cell.append(button);
    } else {
      cell.append(name, sub);
    }
    head.append(cell);
  });

  const rows = document.createDocumentFragment();
  board.labs.forEach((lab, index) => {
    const row = element("tr");
    const name = element("th");
    name.scope = "row";
    const button = element("button", "lab-button");
    button.type = "button";
    button.append(element("span", "rank", String(index + 1)), element("span", "lab-name", lab.name));
    button.setAttribute("aria-label", `${lab.name}, ranked ${index + 1}: open its profile`);
    if (board.selection?.kind === "lab" && board.selection.lab === lab.id) {
      button.classList.add("is-selected");
    }
    button.addEventListener("click", () => select({ kind: "lab", lab: lab.id, open: null }));
    name.append(button);
    row.append(name);

    cols.forEach(col => {
      const value = col.value(lab);
      const cell = element("td", col.apart ? "cell apart" : "cell");
      const score = element("button", "cell-button");
      score.type = "button";
      score.dataset.lab = lab.id;
      score.dataset.column = col.id;
      paintShare(score, value, col.max);
      const said = `${lab.name}, ${col.name}: ${value} out of ${col.max}`;
      score.setAttribute("aria-label", said);
      score.dataset.tip = said;
      score.append(element("span", "cell-figure", String(value)));
      const target = col.open(lab);
      if (sameSelection(board.selection, target)) score.classList.add("is-selected");
      score.setAttribute("aria-pressed", String(sameSelection(board.selection, target)));
      score.addEventListener("click", () => select(target));
      cell.append(score);
      row.append(cell);
    });
    rows.append(row);
  });

  const table = board.nodes.heatmap;
  table.tHead.replaceChildren(head);
  table.tBodies[0].replaceChildren(rows);
  board.nodes.caption.textContent = board.mode === "overall"
    ? "Each company's score on each of the four questions, ranked by total"
    : `Each company's score on the checks of the ${question(board.mode).name.toLowerCase()} question`;

  board.nodes.foot.textContent = board.mode === "overall"
    ? "Meta and xAI tie on 5. Meta is placed fifth on the supporting practices and on "
      + "its direction of travel: it has committed in writing to publish a rulebook, "
      + "and it already tests its models against an internal one."
    : "A score of 1 or 3 falls between the descriptions either side of it. Press a "
      + "check's name for what its scores mean.";
}

function renderLegend() {
  const legend = document.createDocumentFragment();
  legend.append(element("span", "", board.mode === "overall"
    ? "Share of the points available:" : "Score out of 4:"));
  const swatches = element("span", "swatches");
  [0, 1, 2, 3, 4].forEach(level => {
    const swatch = element("span", "swatch");
    board.paint(swatch, level);
    swatches.append(swatch);
  });
  legend.append(element("span", "", board.mode === "overall" ? "none" : "0"), swatches,
    element("span", "", board.mode === "overall" ? "all" : "4"));
  board.nodes.legend.replaceChildren(legend);
}

/* ---- The panel ----------------------------------------------------------------- */

function select(selection) {
  board.selection = sameSelection(board.selection, selection) ? null : selection;
  render();
  const detail = board.nodes.detail;
  // Stacked under the map on a narrow screen, the answer would otherwise open
  // below the fold with nothing to say it had.
  if (board.selection && getComputedStyle(detail).position !== "sticky") {
    detail.scrollIntoView({ block: "start" });
  }
  detail.scrollTop = 0;
  board.nodes.announce.textContent = board.selection
    ? `Details: ${detail.querySelector("h2")?.textContent || ""}`
    : "Details: what the ranking shows";
}

function backButton() {
  const back = element("button", "gov-back", "Back to the findings");
  back.type = "button";
  back.addEventListener("click", () => select(null));
  return back;
}

function heading(text, subtitle) {
  const fragment = document.createDocumentFragment();
  fragment.append(element("h2", "", text));
  if (subtitle) fragment.append(element("p", "subtitle", subtitle));
  return fragment;
}

function findingsPanel(panel) {
  panel.append(heading("What the ranking shows",
    "Six findings from the scores. Open one to read it, or press any score."));
  board.data.findings.forEach(finding => {
    const fold = element("details");
    fold.append(element("summary", "", finding.title), element("p", "", finding.text));
    panel.append(fold);
  });
}

function questionPanel(panel, q) {
  panel.append(heading(q.name, q.question));
  panel.append(element("p", "", q.explainer));
  panel.append(element("h3", "", "Its checks, each scored from 0 to 4"));
  q.checks.forEach(check => {
    const fold = element("details");
    const summary = element("summary");
    summary.append(element("span", "check-id", check.id), element("span", "", check.label));
    fold.append(summary, anchorsList(check, null));
    panel.append(fold);
  });
}

/* What 0, 2 and 4 mean for one check. Where a score sits on them is marked: on
 * its own description when it is even, on the two either side when it is odd. */
function anchorsList(check, score) {
  const list = element("ol", "anchors");
  [0, 2, 4].forEach(level => {
    const item = element("li");
    if (score !== null && Math.abs(score - level) <= 1) item.classList.add("is-here");
    item.append(element("span", "anchor-level", String(level)),
      element("span", "", check.anchors[String(level)]));
    list.append(item);
  });
  return list;
}

function checksOf(lab, q) {
  const list = element("ul", "check-list");
  q.checks.forEach(check => {
    const item = element("li");
    item.append(chip(board.data.scores[lab.id][check.id], 4),
      element("span", "check-id", check.id), element("span", "", check.label));
    list.append(item);
  });
  return list;
}

function labPanel(panel, { lab: labId, open }) {
  const lab = labOf(labId);
  const rank = board.labs.indexOf(lab) + 1;
  const profile = board.data.profiles[lab.id];
  panel.append(backButton());
  panel.append(heading(lab.name,
    `Ranked ${rank} of ${board.labs.length}. Supporting practices ${lab.supporting} `
    + `out of ${SUPPORTING}, not counted in the total.`));
  const figure = element("p", "figure");
  figure.append(element("strong", "", String(lab.total)),
    document.createTextNode(` out of ${TOTAL}`));
  panel.append(figure);

  board.data.questions.forEach(q => {
    const fold = element("details");
    fold.open = open === q.id;
    const summary = element("summary");
    summary.append(chip(lab.byQuestion[q.id], maxOf(q)),
      element("span", "", `${q.name}, ${lab.byQuestion[q.id]} out of ${maxOf(q)}`));
    fold.append(summary, checksOf(lab, q), element("p", "", profile[q.id]));
    panel.append(fold);
  });
  const supporting = element("details");
  supporting.open = open === "supporting";
  const summary = element("summary");
  summary.append(chip(lab.supporting, SUPPORTING),
    element("span", "", `Supporting practices, ${lab.supporting} out of ${SUPPORTING}`));
  supporting.append(summary, element("p", "", profile.supporting));
  panel.append(supporting);

  if (profile.aside) {
    const aside = element("div", "aside");
    const text = element("p");
    text.append(element("strong", "", `${profile.aside.title}. `),
      document.createTextNode(profile.aside.text));
    aside.append(text);
    panel.append(aside);
  }
}

function scorePanel(panel, { lab: labId, question: questionId, check: checkId }) {
  const lab = labOf(labId);
  const q = question(questionId);
  const check = q.checks.find(c => c.id === checkId);
  const score = board.data.scores[lab.id][check.id];
  panel.append(backButton());
  panel.append(heading(`${lab.name}: ${check.short.toLowerCase()}`, `${check.id} ${check.label}.`));
  const figure = element("p", "figure");
  figure.append(element("strong", "", String(score)), document.createTextNode(" out of 4"));
  panel.append(figure);
  panel.append(element("h3", "", "What the scores mean for this check"), anchorsList(check, score));
  panel.append(element("h3", "", `What we found on ${lab.name}'s ${q.name.toLowerCase()}`),
    element("p", "", board.data.profiles[lab.id][q.id]));
  const open = element("button", "gov-back gov-open-profile", `Open the full profile of ${lab.name}`);
  open.type = "button";
  open.addEventListener("click", () => select({ kind: "lab", lab: lab.id, open: q.id }));
  panel.append(open);
}

function checkPanel(panel, { question: questionId, check: checkId }) {
  const q = question(questionId);
  const check = q.checks.find(c => c.id === checkId);
  panel.append(backButton());
  panel.append(heading(check.short, `${check.id} ${check.label}.`));
  panel.append(element("p", "", `One of the checks on the ${q.name.toLowerCase()} question: ${q.question}`));
  panel.append(element("h3", "", "What the scores mean"), anchorsList(check, null));
  panel.append(element("h3", "", "How the six companies score"));
  const list = element("ul", "check-list");
  board.labs.forEach(lab => {
    const item = element("li");
    item.append(chip(board.data.scores[lab.id][check.id], 4), element("span", "", lab.name));
    list.append(item);
  });
  panel.append(list);
}

function renderDetail() {
  const panel = document.createDocumentFragment();
  const { selection } = board;
  if (!selection) {
    if (board.mode === "overall") findingsPanel(panel);
    else questionPanel(panel, question(board.mode));
  } else if (selection.kind === "lab") labPanel(panel, selection);
  else if (selection.kind === "score") scorePanel(panel, selection);
  else if (selection.kind === "check") checkPanel(panel, selection);
  board.nodes.detail.replaceChildren(panel);
}

/* ---- The reference text under the board ----------------------------------------- */

function renderScoring() {
  const blocks = document.createDocumentFragment();
  board.data.questions.forEach(q => {
    blocks.append(element("h3", "", `${q.id}. ${q.name}, out of ${maxOf(q)}: ${q.question}`));
    const wrap = element("div", "table-scroll");
    const table = element("table", "gov-table gov-scoring-table");
    const head = element("tr");
    ["Check", "0", "2", "4"].forEach((text, index) => {
      const cell = element("th", index ? "" : "check-col", text);
      cell.scope = "col";
      head.append(cell);
    });
    const thead = element("thead");
    thead.append(head);
    const tbody = element("tbody");
    q.checks.forEach(check => {
      const row = element("tr");
      const name = element("th");
      name.scope = "row";
      name.append(element("span", "check-id", `${check.id} `), element("span", "", check.label));
      row.append(name);
      ["0", "2", "4"].forEach(level => row.append(element("td", "", check.anchors[level])));
      tbody.append(row);
    });
    table.append(thead, tbody);
    wrap.append(table);
    blocks.append(wrap);
  });
  board.nodes.scoring.replaceChildren(blocks);

  const practices = document.createDocumentFragment();
  board.data.supporting.forEach(practice => practices.append(element("li", "", practice.label)));
  board.nodes.supporting.replaceChildren(practices);
}

/* ---- The tooltip ------------------------------------------------------------------- */

function wireTooltip() {
  const tip = board.nodes.tip;
  const show = event => {
    const cell = event.target.closest?.(".cell-button[data-tip]");
    if (!cell) return;
    tip.textContent = cell.dataset.tip;
    tip.hidden = false;
    const box = cell.getBoundingClientRect();
    const width = tip.offsetWidth;
    const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2),
      window.innerWidth - width - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, box.top - tip.offsetHeight - 8)}px`;
  };
  const hide = () => { tip.hidden = true; };
  const map = board.nodes.heatmap;
  map.addEventListener("pointerover", show);
  map.addEventListener("pointerleave", hide);
  map.addEventListener("focusin", show);
  map.addEventListener("focusout", hide);
  window.addEventListener("scroll", hide, { passive: true });
}

function render() {
  renderModes();
  renderHeatmap();
  renderLegend();
  renderDetail();
}

async function loadGovernance() {
  try {
    const response = await fetch("/governance.json");
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/* `paint` is the grid's own, so a score of 3 out of 4 here wears the colour a
 * depth of 3 wears in the other view. */
export async function initializeGovernance({ paint }) {
  const byId = id => document.getElementById(id);
  board.nodes = {
    status: byId("gov-status"), kpis: byId("gov-kpis"), modes: byId("gov-modes"),
    modeNote: byId("gov-mode-note"), heatmap: byId("gov-heatmap"),
    caption: byId("gov-heatmap-caption"), legend: byId("gov-legend"), foot: byId("gov-foot"),
    detail: byId("gov-detail"), announce: byId("gov-announce"), tip: byId("gov-tip"),
    scoring: byId("gov-scoring"), supporting: byId("gov-supporting"),
  };
  board.paint = paint;
  const data = await loadGovernance();
  if (!data) {
    board.nodes.status.textContent = "The governance scores could not be loaded.";
    return;
  }
  board.data = data;
  board.labs = ranked(data);
  renderKpis();
  renderScoring();
  render();
  wireTooltip();
  board.nodes.status.textContent = "";
}
