/* The overview's second view: how each lab governs the rules its models follow.
 *
 * A board rather than a document. Three headline figures, then one table that
 * takes the whole width: the companies across in rank order, and down the side
 * the total, the four questions and the supporting practices. Each question
 * opens into its checks. Anything more, what a row asks, how its points are
 * shared out, or why a company scored what it did, opens in a popover beside
 * what was pressed, so the table never gives up its width to it.
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

const board = { data: null, labs: [], paint: null, expanded: new Set(), nodes: {} };

const questionOf = id => board.data.questions.find(q => q.id === id);

/* A score painted the way the grid paints a depth, as a share of its maximum,
 * so 8 of 12 wears the colour 2.7 of 4 would. */
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
  const minimumMax = maxOf(questionOf("1")) + maxOf(questionOf("2"));
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

/* ---- The popover ----------------------------------------------------------- */

const pop = { trigger: null, closedTrigger: null, closedAt: 0 };

/* Beside what opened it, never over it: below if it fits, else above, else to
 * the right or the left, and held inside the window whichever it is. Fixed to
 * the window, so it is placed again when the page scrolls under it. */
function placePopover() {
  const node = board.nodes.pop;
  if (!pop.trigger || !node.matches(":popover-open")) return;
  const box = pop.trigger.getBoundingClientRect();
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  const gap = 8;
  const room = { width: window.innerWidth, height: window.innerHeight };
  const clampTop = top => Math.max(gap, Math.min(top, room.height - height - gap));
  const clampLeft = left => Math.max(gap, Math.min(left, room.width - width - gap));
  let top;
  let left;
  if (box.bottom + gap + height <= room.height - gap) {
    [top, left] = [box.bottom + gap, clampLeft(box.left)];
  } else if (box.top - gap - height >= gap) {
    [top, left] = [box.top - gap - height, clampLeft(box.left)];
  } else if (box.right + gap + width <= room.width - gap) {
    [top, left] = [clampTop(box.top + box.height / 2 - height / 2), box.right + gap];
  } else if (box.left - gap - width >= gap) {
    [top, left] = [clampTop(box.top + box.height / 2 - height / 2), box.left - gap - width];
  } else {
    // A phone: no side has room, so it takes the window and scrolls inside.
    [top, left] = [clampTop(box.bottom + gap), clampLeft(box.left)];
  }
  node.style.top = `${top}px`;
  node.style.left = `${left}px`;
}

/* Fill the popover and show it beside `trigger`. A press on the trigger of an
 * open popover is meant to close it, which the browser's own light dismiss does
 * on the way down; the click that follows must not open it again. */
function openPopover(trigger, build) {
  const node = board.nodes.pop;
  if (trigger === pop.closedTrigger && performance.now() - pop.closedAt < 300) return;
  if (node.matches(":popover-open")) node.hidePopover();

  const content = document.createDocumentFragment();
  const close = element("button", "gov-pop-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => node.hidePopover());
  content.append(close);
  build(content);
  node.replaceChildren(content);

  pop.trigger = trigger;
  trigger.setAttribute("aria-expanded", "true");
  trigger.classList.add("is-open");
  node.showPopover();
  node.scrollTop = 0;
  placePopover();
  node.focus({ preventScroll: true });
}

/* The same popover, same place, new contents: a score's popover leads on to the
 * company's whole profile without the reader losing their place. Closing it on
 * the way marks its trigger as just closed, which is forgotten here, or the
 * reopening would be taken for a press meant to close it. */
function refill(build) {
  const trigger = pop.trigger;
  if (!trigger) return;
  board.nodes.pop.hidePopover();
  pop.closedTrigger = null;
  openPopover(trigger, build);
}

/* Listened for before the popover closes rather than after: the browser's light
 * dismiss closes it on the press that lands on its own trigger, and the click
 * that follows has to find the trigger already marked as just closed. */
function wirePopover() {
  const node = board.nodes.pop;
  node.addEventListener("beforetoggle", event => {
    if (event.newState !== "closed") return;
    const trigger = pop.trigger;
    pop.trigger = null;
    if (!trigger) return;
    trigger.setAttribute("aria-expanded", "false");
    trigger.classList.remove("is-open");
    pop.closedTrigger = trigger;
    pop.closedAt = performance.now();
    // Back where the reader was, when the popover held the focus.
    if (node.contains(document.activeElement)) trigger.focus({ preventScroll: true });
  });
  window.addEventListener("scroll", placePopover, { passive: true });
  window.addEventListener("resize", placePopover, { passive: true });
}

function titled(content, title, subtitle) {
  const heading = element("h2", "", title);
  heading.id = "gov-pop-title";
  content.append(heading);
  if (subtitle) content.append(element("p", "subtitle", subtitle));
}

function figure(value, rest) {
  const line = element("p", "figure");
  line.append(element("strong", "", String(value)), document.createTextNode(rest));
  return line;
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

function checksOf(lab, question) {
  const list = element("ul", "check-list");
  question.checks.forEach(check => {
    const item = element("li");
    item.append(chip(board.data.scores[lab.id][check.id], 4),
      element("span", "check-id", check.id), element("span", "", check.label));
    list.append(item);
  });
  return list;
}

function toProfile(lab, open) {
  const button = element("button", "gov-button", `The whole profile of ${lab.name}`);
  button.type = "button";
  button.addEventListener("click", () => refill(content => profile(content, lab, open)));
  return button;
}

/* ---- What each popover says ------------------------------------------------ */

function profile(content, lab, open) {
  const rank = board.labs.indexOf(lab) + 1;
  const text = board.data.profiles[lab.id];
  titled(content, lab.name, `Ranked ${rank} of ${board.labs.length}.`);
  content.append(figure(lab.total, ` out of ${TOTAL}`));
  board.data.questions.forEach(question => {
    const fold = element("details");
    fold.open = open === question.id;
    const summary = element("summary");
    summary.append(chip(lab.byQuestion[question.id], maxOf(question)),
      element("span", "", `${question.name}, ${lab.byQuestion[question.id]} out of ${maxOf(question)}`));
    fold.append(summary, checksOf(lab, question), element("p", "", text[question.id]));
    content.append(fold);
  });
  const supporting = element("details");
  supporting.open = open === "supporting";
  const summary = element("summary");
  summary.append(chip(lab.supporting, SUPPORTING),
    element("span", "", `Supporting practices, ${lab.supporting} out of ${SUPPORTING}, not counted`));
  supporting.append(summary, element("p", "", text.supporting));
  content.append(supporting);
  if (text.aside) {
    const aside = element("div", "aside");
    const line = element("p");
    line.append(element("strong", "", `${text.aside.title}. `), document.createTextNode(text.aside.text));
    aside.append(line);
    content.append(aside);
  }
}

function questionScore(content, lab, question) {
  titled(content, `${lab.name}: ${question.name.toLowerCase()}`, question.question);
  content.append(figure(lab.byQuestion[question.id], ` out of ${maxOf(question)}`),
    checksOf(lab, question));
  content.append(element("h3", "", "What we found"),
    element("p", "", board.data.profiles[lab.id][question.id]), toProfile(lab, question.id));
}

function checkScore(content, lab, question, check) {
  const value = board.data.scores[lab.id][check.id];
  titled(content, `${lab.name}: ${check.short.toLowerCase()}`, `${check.id} ${check.label}.`);
  content.append(figure(value, " out of 4"));
  content.append(element("h3", "", "What the scores mean for this check"), anchorsList(check, value));
  content.append(element("h3", "", `What we found on ${lab.name}'s ${question.name.toLowerCase()}`),
    element("p", "", board.data.profiles[lab.id][question.id]), toProfile(lab, question.id));
}

function supportingScore(content, lab) {
  titled(content, `${lab.name}: supporting practices`, "Reported beside the total, not counted in it.");
  content.append(figure(lab.supporting, ` out of ${SUPPORTING}`),
    element("p", "", board.data.profiles[lab.id].supporting), toProfile(lab, "supporting"));
}

function aboutTotal(content) {
  titled(content, "Overall, out of 40", "The sum of the four questions.");
  content.append(element("p", "", "The first two questions are worth 12 points each, "
    + "because together they are the minimum we propose: a published rulebook for every "
    + "model in use, and one public record of every change. The other two are worth 8."));
  const list = element("ul", "check-list");
  board.data.questions.forEach(question => {
    const item = element("li");
    item.append(element("span", "check-id", String(maxOf(question))),
      element("span", "", `${question.name}: ${question.question}`));
    list.append(item);
  });
  content.append(list, element("p", "", "Companies are ranked by this total. A tie is "
    + "broken on the supporting practices, which is how Meta is placed above xAI."));
}

function aboutQuestion(content, question) {
  titled(content, question.name, question.question);
  content.append(element("p", "", question.explainer));
  content.append(element("h3", "", `How its ${maxOf(question)} points are shared out`));
  content.append(element("p", "", `${question.checks.length} checks, each scored from 0 to 4. `
    + "Open one to see what earns each score."));
  question.checks.forEach(check => {
    const fold = element("details");
    const summary = element("summary");
    summary.append(element("span", "check-id", check.id), element("span", "", check.label));
    fold.append(summary, anchorsList(check, null));
    content.append(fold);
  });
  const shown = board.expanded.has(question.id);
  const toggle = element("button", "gov-button",
    shown ? "Hide its checks in the table" : "Show its checks in the table");
  toggle.type = "button";
  toggle.addEventListener("click", () => {
    board.nodes.pop.hidePopover();
    setExpanded(question.id, !shown);
  });
  content.append(toggle);
}

function aboutCheck(content, question, check) {
  titled(content, check.short, `${check.id} ${check.label}.`);
  content.append(element("p", "subtitle",
    `One of the checks on the ${question.name.toLowerCase()} question, scored from 0 to 4.`));
  content.append(element("h3", "", "What the scores mean"), anchorsList(check, null),
    element("p", "subtitle", "A score of 1 or 3 falls between the descriptions either side of it."));
}

function aboutSupporting(content) {
  titled(content, "Supporting practices, out of 10", "Reported beside the total, not counted in it.");
  content.append(element("p", "", "Five practices that an outsider can check from public "
    + "sources, taken from Kembery and colleagues, Emerging International Best Practices for "
    + "AI Model Specs. Each is scored 0, 1 or 2. They measure neighbouring good practice "
    + "rather than how changes are governed, which is why they are kept out of the total."));
  const list = element("ul", "check-list");
  board.data.supporting.forEach(practice => {
    const item = element("li");
    item.append(element("span", "check-id", practice.id), element("span", "", practice.label));
    list.append(item);
  });
  content.append(list);
}

/* ---- The table --------------------------------------------------------------- */

function rowName(name, sub, build, label) {
  const button = element("button", "row-name");
  button.type = "button";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", label);
  button.append(element("span", "head-name", name));
  if (sub) button.append(element("span", "head-sub", sub));
  button.addEventListener("click", () => openPopover(button, build));
  return button;
}

function scoreCell(lab, rowLabel, value, max, build, row) {
  const cell = element("td", "cell");
  const button = element("button", "cell-button");
  button.type = "button";
  button.dataset.lab = lab.id;
  button.dataset.row = row;
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", `${lab.name}, ${rowLabel}: ${value} out of ${max}`);
  paintShare(button, value, max);
  // What the score is out of, small and to the right. The accessible name
  // already says it, so a screen reader does not hear it twice.
  const out = element("span", "cell-max", `/${max}`);
  out.setAttribute("aria-hidden", "true");
  button.append(element("span", "cell-figure", String(value)), out);
  button.addEventListener("click", () => openPopover(button, build));
  cell.append(button);
  return cell;
}

function headRow() {
  const row = element("tr");
  const corner = element("th", "row-col");
  corner.scope = "col";
  corner.append(element("span", "head-name", "Score"),
    element("span", "head-sub", "companies by rank"));
  row.append(corner);
  board.labs.forEach((lab, index) => {
    const cell = element("th");
    cell.scope = "col";
    const button = element("button", "company-button");
    button.type = "button";
    button.dataset.lab = lab.id;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", `${lab.name}, ranked ${index + 1}: its profile`);
    button.append(element("span", "rank", String(index + 1)),
      element("span", "company-name", lab.name));
    button.addEventListener("click", () =>
      openPopover(button, content => profile(content, lab, null)));
    cell.append(button);
    row.append(cell);
  });
  return row;
}

/* A row's head: a fold for a question, an empty space the same width for the
 * rows that have nothing to fold, so every name starts on one line. */
function rowHead(first, name) {
  const head = element("th");
  head.scope = "row";
  const line = element("div", "row-head");
  line.append(first || element("span", "row-spacer"), name);
  head.append(line);
  return head;
}

function renderTable() {
  const body = document.createDocumentFragment();

  const total = element("tr", "total-row");
  total.append(rowHead(null, rowName("Overall", `out of ${TOTAL}`, aboutTotal,
    `Overall, out of ${TOTAL}: what it adds up`)));
  board.labs.forEach(lab => total.append(scoreCell(lab, "overall", lab.total, TOTAL,
    content => profile(content, lab, null), "total")));
  body.append(total);

  board.data.questions.forEach(question => {
    const row = element("tr", "question-row");
    row.dataset.question = question.id;
    const toggle = element("button", "row-toggle");
    toggle.type = "button";
    toggle.dataset.question = question.id;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls",
      question.checks.map(check => `gov-check-${check.id.replace(".", "-")}`).join(" "));
    toggle.setAttribute("aria-label", `Show the checks of ${question.name}`);
    toggle.addEventListener("click", () =>
      setExpanded(question.id, !board.expanded.has(question.id)));
    row.append(rowHead(toggle, rowName(question.name, `out of ${maxOf(question)}`,
      content => aboutQuestion(content, question), `${question.name}: what it asks`)));
    board.labs.forEach(lab => row.append(scoreCell(lab, question.name.toLowerCase(),
      lab.byQuestion[question.id], maxOf(question),
      content => questionScore(content, lab, question), question.id)));
    body.append(row);

    question.checks.forEach(check => {
      const sub = element("tr", "check-row");
      sub.id = `gov-check-${check.id.replace(".", "-")}`;
      sub.dataset.parent = question.id;
      sub.hidden = true;
      const head = element("th");
      head.scope = "row";
      head.append(rowName(check.short, check.id, content => aboutCheck(content, question, check),
        `${check.id} ${check.short}: what its scores mean`));
      sub.append(head);
      board.labs.forEach(lab => sub.append(scoreCell(lab, check.short.toLowerCase(),
        board.data.scores[lab.id][check.id], 4,
        content => checkScore(content, lab, question, check), check.id)));
      body.append(sub);
    });
  });

  const supporting = element("tr", "supporting-row");
  supporting.append(rowHead(null, rowName("Supporting practices",
    `out of ${SUPPORTING}, not counted`, aboutSupporting,
    `Supporting practices, out of ${SUPPORTING}, not counted: what they are`)));
  board.labs.forEach(lab => supporting.append(scoreCell(lab, "supporting practices",
    lab.supporting, SUPPORTING, content => supportingScore(content, lab), "supporting")));
  body.append(supporting);

  const table = board.nodes.table;
  table.tHead.replaceChildren(headRow());
  table.tBodies[0].replaceChildren(body);
}

/* A question opens into its checks, and the button above the table opens or
 * shuts them all at once. */
function setExpanded(questionId, open) {
  if (open) board.expanded.add(questionId);
  else board.expanded.delete(questionId);
  const question = questionOf(questionId);
  board.nodes.table.querySelectorAll(`tr.check-row[data-parent="${questionId}"]`)
    .forEach(row => { row.hidden = !open; });
  const toggle = board.nodes.table.querySelector(`.row-toggle[data-question="${questionId}"]`);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", `${open ? "Hide" : "Show"} the checks of ${question.name}`);
  const all = board.expanded.size === board.data.questions.length;
  board.nodes.expandAll.setAttribute("aria-pressed", String(all));
  board.nodes.expandAll.textContent = all ? "Hide every check" : "Show every check";
}

function renderLegend() {
  const legend = document.createDocumentFragment();
  legend.append(element("span", "", "Colour is the share of the points available:"),
    element("span", "", "none"));
  const swatches = element("span", "swatches");
  [0, 1, 2, 3, 4].forEach(level => {
    const swatch = element("span", "swatch");
    board.paint(swatch, level);
    swatches.append(swatch);
  });
  legend.append(swatches, element("span", "", "all"));
  board.nodes.legend.replaceChildren(legend);
}

function renderFindings() {
  const list = document.createDocumentFragment();
  board.data.findings.forEach(finding => {
    const fold = element("details");
    fold.append(element("summary", "", finding.title), element("p", "", finding.text));
    list.append(fold);
  });
  board.nodes.findings.replaceChildren(list);
}

/* ---- The reference text under the board ----------------------------------------- */

function renderScoring() {
  const blocks = document.createDocumentFragment();
  board.data.questions.forEach(question => {
    blocks.append(element("h3", "",
      `${question.id}. ${question.name}, out of ${maxOf(question)}: ${question.question}`));
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
    question.checks.forEach(check => {
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
    status: byId("gov-status"), kpis: byId("gov-kpis"), table: byId("gov-heatmap"),
    legend: byId("gov-legend"), findings: byId("gov-findings"), pop: byId("gov-pop"),
    expandAll: byId("gov-expand-all"), scoring: byId("gov-scoring"),
    supporting: byId("gov-supporting"),
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
  renderTable();
  renderLegend();
  renderFindings();
  renderScoring();
  wirePopover();
  board.nodes.expandAll.addEventListener("click", () => {
    const open = board.expanded.size !== data.questions.length;
    data.questions.forEach(question => setExpanded(question.id, open));
  });
  board.nodes.status.textContent = "";
}
