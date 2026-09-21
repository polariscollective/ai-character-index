/* The overview's second view: how each lab governs the rules its models follow.
 *
 * A board rather than a document: one table that takes the whole width, the
 * companies across in rank order, and down the side the total, the four
 * questions and, outside the total, the best practices (called supporting
 * practices in the data). Each question opens into its checks. The best
 * practices open into the five anyone can check, the four only the company can
 * show, scored on what it publishes, and the one only an internal audit could
 * show, NA for every company. Anything more, what a row asks, how it is scored,
 * or why a company scored what it did, opens in a popover beside what was
 * pressed, so the table never gives up its width to it.
 *
 * Everything comes from governance.json: the scores, what each score means, and
 * the text of the research note, lab by lab and question by question. A
 * question is the average of its checks, on their own scale of 0 to 4, and the
 * overall score is the sum of the four questions, out of 16, so every question
 * weighs the same whatever its number of checks and the overall score reads as
 * a different kind of figure. They are computed here rather than stored, so the
 * ranking cannot disagree with the checks it is made of, and a profile's opening
 * line, "Model behaviour specification, 2.7 out of 4", is written from the same
 * averages rather than typed beside them.
 *
 * Nothing is built with innerHTML, as in overview.js. The text here is ours
 * rather than a model's, but one rule for the whole page is easier to keep.
 */

/* Per question, the average of its checks; then the overall score, the sum of
 * the four questions; and the best practices, reported beside the overall
 * score and never in it. */
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

/* The practices that only a company can show: four the paper asks it to
 * publish, scored on what it publishes, and one it does not, left NA. */
const disclosedOf = data => data.internal.filter(practice => practice.asked_to_publish);
const auditOnlyOf = data => data.internal.filter(practice => !practice.asked_to_publish);

export function totalsFor(data, labId) {
  const scores = data.scores[labId];
  const byQuestion = {};
  data.questions.forEach(question => {
    byQuestion[question.id] = average(question.checks.map(check => scores[check.id]));
  });
  const total = Object.values(byQuestion).reduce((sum, value) => sum + value, 0);
  const supporting = [
    ...data.supporting.map(practice => data.supporting_scores[labId][practice.id]),
    ...disclosedOf(data).map(practice => data.internal_scores[labId][practice.id]),
  ].reduce((sum, value) => sum + value, 0);
  return { byQuestion, total, supporting };
}

/* By overall score, and a tie broken on the best practices. That is the research
 * note's own rule. On averages it breaks two ties: OpenAI and Anthropic, and
 * Meta and xAI. */
const level = (a, b) => Math.abs(a - b) < 1e-9;
const ahead = (a, b) => (level(a.total, b.total) ? a.supporting > b.supporting : a.total > b.total);

/* Labs level on both the overall score and the best practices share a place:
 * a rank is one more than the number of labs ahead. */
export function ranked(data) {
  const labs = data.labs
    .map(lab => ({ ...lab, ...totalsFor(data, lab.id) }))
    .sort((a, b) => (level(a.total, b.total) ? b.supporting - a.supporting : b.total - a.total));
  return labs.map(lab => ({ ...lab, rank: 1 + labs.filter(other => ahead(other, lab)).length }));
}

const SCALE = 4;
const OVERALL = 16;
const PRACTICE = 2;
/* A question or an overall score, to one decimal. A check stays a whole number. */
const shown = value => value.toFixed(1);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const board = { data: null, labs: [], paint: null, expanded: new Set(), nodes: {}, bestMax: 0 };

const questionOf = id => board.data.questions.find(q => q.id === id);

/* What opens in the table: each question into its checks, and the supporting
 * practices into theirs, the internal ones included. */
const GROUPS = { supporting: "Best practices" };
const groupIds = () => [...board.data.questions.map(q => q.id), ...Object.keys(GROUPS)];
const groupName = id => GROUPS[id] || questionOf(id).name;
const partsOf = id => (GROUPS[id] ? "practices" : "checks");
const rowId = id => `gov-check-${id.replace(".", "-")}`;

/* A score painted the way the grid paints a depth, as a share of its maximum,
 * so 8 of 12 wears the colour 2.7 of 4 would. The figure is always light, where
 * the grid picks dark or light by the colour underneath: across one table of
 * scores, figures that change colour from cell to cell read as a second code. */
const FIGURE = "#F1EFE3";
function paintShare(node, value, max) {
  board.paint(node, (value / max) * 4);
  node.style.color = FIGURE;
}

function chip(value, max, text = String(value)) {
  const node = element("span", "chip", text);
  paintShare(node, value, max);
  return node;
}

/* Not assessed: there is no score, so there is no colour either. */
const naChip = () => element("span", "chip chip-na", "NA");

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

function practicesOf(lab) {
  const list = element("ul", "check-list");
  board.data.supporting.forEach(practice => {
    const item = element("li");
    item.append(chip(board.data.supporting_scores[lab.id][practice.id], PRACTICE),
      element("span", "check-id", practice.id), element("span", "", practice.label));
    list.append(item);
  });
  return list;
}

/* The four practices scored on what a company publishes, each with the sentence
 * that says what it publishes. */
function disclosedList(lab) {
  const list = element("ul", "check-list");
  disclosedOf(board.data).forEach(practice => {
    const item = element("li");
    item.append(chip(board.data.internal_scores[lab.id][practice.id], PRACTICE),
      element("span", "check-id", practice.id),
      element("span", "", board.data.internal_evidence[lab.id][practice.id].sentence));
    list.append(item);
  });
  return list;
}

function internalList(marked) {
  const list = element("ul", "check-list");
  auditOnlyOf(board.data).forEach(practice => {
    const item = element("li");
    if (marked) item.append(naChip());
    item.append(element("span", "check-id", practice.id), element("span", "", practice.label));
    list.append(item);
  });
  return list;
}

/* What 0, 1 and 2 mean for a supporting practice, with the score's place
 * marked. The research note never wrote these down, and the list says so. */
function scaleList(score, anchors = board.data.supporting_scale) {
  const list = element("ol", "anchors");
  [0, 1, 2].forEach(level => {
    const item = element("li");
    if (score === level) item.classList.add("is-here");
    item.append(element("span", "anchor-level", String(level)),
      element("span", "", anchors[String(level)]));
    list.append(item);
  });
  const fragment = document.createDocumentFragment();
  fragment.append(list);
  if (anchors.note) fragment.append(element("p", "subtitle", anchors.note));
  return fragment;
}

/* One passage a company published, with a link to where it says it. */
function sourceQuote(source) {
  const block = element("blockquote", "paper-quote");
  block.append(element("p", "", source.quote));
  if (source.translation) block.append(element("p", "paper-where", `Our translation: ${source.translation}`));
  const where = element("p", "paper-where");
  const link = element("a", "", source.title);
  link.href = source.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  where.append(link, document.createTextNode(`, ${source.date}`));
  block.append(where);
  return block;
}

/* What the working paper says about a question, a check or a practice: our
 * reading of it, then the passages it rests on, quoted exactly and grouped by
 * paper. It sits, folded, in the popover a row's name opens, so it is there for
 * whoever wants the source and in nobody's way. It is also the text a judge
 * will be given, which is why the quotes are the papers' own words. */
function paperFold(item) {
  const byPaper = new Map();
  item.quotes.forEach(quote => {
    if (!byPaper.has(quote.paper)) byPaper.set(quote.paper, []);
    byPaper.get(quote.paper).push(quote);
  });
  const fold = element("details", "paper-fold");
  fold.append(element("summary", "",
    byPaper.size > 1 ? "What the working papers say" : "What the working paper says"),
  element("p", "", item.reading));
  byPaper.forEach((quotes, id) => {
    const paper = board.data.papers[id];
    fold.append(element("p", "paper-name", `${paper.by}, "${paper.title}", ${paper.status}.`));
    quotes.forEach(quote => {
      const block = element("blockquote", "paper-quote");
      block.append(element("p", "", quote.text), element("p", "paper-where", quote.where));
      fold.append(block);
    });
  });
  return fold;
}

/* A button that opens a group's rows in the table, from a popover about it. */
function showInTable(groupId) {
  const shown = board.expanded.has(groupId);
  const whose = GROUPS[groupId] ? "the" : "its";
  const toggle = element("button", "gov-button",
    `${shown ? "Hide" : "Show"} ${whose} ${partsOf(groupId)} in the table`);
  toggle.type = "button";
  toggle.addEventListener("click", () => {
    board.nodes.pop.hidePopover();
    setExpanded(groupId, !shown);
  });
  return toggle;
}

/* The note's text, one paragraph per blank line. */
function paragraphs(text) {
  const fragment = document.createDocumentFragment();
  String(text || "").split(/\n{2,}/).forEach(block => fragment.append(element("p", "", block)));
  return fragment;
}

function toProfile(lab, open) {
  const button = element("button", "gov-button", `The whole profile of ${lab.name}`);
  button.type = "button";
  button.addEventListener("click", () => refill(content => profile(content, lab, open)));
  return button;
}

/* ---- What each popover says ------------------------------------------------ */

function profile(content, lab, open) {
  const alongside = board.labs.filter(other => other !== lab && other.rank === lab.rank);
  const text = board.data.profiles[lab.id];
  titled(content, lab.name, [
    `Ranked ${lab.rank} of ${board.labs.length}`
      + `${alongside.length ? `, level with ${alongside.map(other => other.name).join(" and ")}` : ""}.`,
    lab.open_weights ? "Its flagship model, or nearly, can be downloaded by anyone (open weights)." : "",
    lab.legal || "",
  ].filter(Boolean).join(" "));
  content.append(figure(shown(lab.total), ` out of ${OVERALL}`));
  board.data.questions.forEach(question => {
    const fold = element("details");
    fold.open = open === question.id;
    const summary = element("summary");
    summary.append(chip(lab.byQuestion[question.id], SCALE, shown(lab.byQuestion[question.id])),
      element("span", "", `${question.name}, ${shown(lab.byQuestion[question.id])} out of ${SCALE}`));
    fold.append(summary, checksOf(lab, question), paragraphs(text[question.id]));
    content.append(fold);
  });
  const supporting = element("details");
  supporting.open = open === "supporting";
  const summary = element("summary");
  summary.append(chip(lab.supporting, board.bestMax),
    element("span", "", `Best practices, ${lab.supporting} out of ${board.bestMax}, not counted`));
  supporting.append(summary, practicesOf(lab), paragraphs(text.supporting),
    element("h3", "", "What only the company can show"), disclosedList(lab),
    element("p", "subtitle", `*${board.data.disclosure_note}`),
    element("h3", "", "Only an internal audit could score this"), internalList(true),
    element("p", "", board.data.internal_note));
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
  content.append(figure(shown(lab.byQuestion[question.id]), ` out of ${SCALE}`),
    element("p", "subtitle", "The average of its checks."), checksOf(lab, question));
  content.append(element("h3", "", "What we found"),
    paragraphs(board.data.profiles[lab.id][question.id]), toProfile(lab, question.id));
}

function checkScore(content, lab, question, check) {
  const value = board.data.scores[lab.id][check.id];
  titled(content, `${lab.name}: ${check.short.toLowerCase()}`, `${check.id} ${check.label}.`);
  content.append(figure(value, " out of 4"));
  content.append(element("h3", "", "What the scores mean for this check"), anchorsList(check, value));
  content.append(element("h3", "", `What we found on ${lab.name}'s ${question.name.toLowerCase()}`),
    paragraphs(board.data.profiles[lab.id][question.id]), toProfile(lab, question.id));
}

function supportingScore(content, lab) {
  titled(content, `${lab.name}: best practices`, "From a second working paper, and left out of the total.");
  content.append(figure(lab.supporting, ` out of ${board.bestMax}`), practicesOf(lab),
    element("h3", "", "What we found"), paragraphs(board.data.profiles[lab.id].supporting),
    element("h3", "", "What only the company can show"), disclosedList(lab),
    element("p", "subtitle", `*${board.data.disclosure_note}`),
    element("h3", "", "Only an internal audit could score this"), internalList(true),
    toProfile(lab, "supporting"));
}

function practiceScore(content, lab, practice) {
  const value = board.data.supporting_scores[lab.id][practice.id];
  titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, `${practice.id} ${practice.label}`);
  content.append(figure(value, ` out of ${PRACTICE}`));
  const note = board.data.supporting_notes[lab.id]?.[practice.id];
  if (note) content.append(element("p", "", note));
  content.append(element("h3", "", "What the scores mean for this practice"), scaleList(value));
  content.append(element("h3", "", `What we found on ${lab.name}'s best practices`),
    paragraphs(board.data.profiles[lab.id].supporting), toProfile(lab, "supporting"));
}

function disclosedScore(content, lab, practice) {
  const value = board.data.internal_scores[lab.id][practice.id];
  const found = board.data.internal_evidence[lab.id][practice.id];
  titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, `${practice.id} ${practice.label}`);
  content.append(figure(value, ` out of ${PRACTICE}`), element("p", "", found.sentence));
  if (value === 0) content.append(element("p", "subtitle", `*${board.data.disclosure_note}`));
  if (found.sources.length) {
    content.append(element("h3", "", `What ${lab.name} publishes`));
    found.sources.forEach(source => content.append(sourceQuote(source)));
  }
  content.append(element("h3", "", "What the scores mean for this practice"),
    scaleList(value, practice.anchors), paperFold(practice), toProfile(lab, "supporting"));
}

function aboutDisclosedPractice(content, practice) {
  titled(content, practice.short, `${practice.id} ${practice.label}`);
  content.append(
    element("p", "subtitle", "One of the best practices only the company can show, scored on what it publishes."),
    paperFold(practice), element("h3", "", "What the scores mean"), scaleList(null, practice.anchors),
    element("p", "subtitle", `*${board.data.disclosure_note}`));
}

function internalScore(content, lab, practice) {
  titled(content, `${lab.name}: ${practice.short.toLowerCase()}`, `${practice.id} ${practice.label}`);
  content.append(figure("NA", ", not assessed"),
    element("p", "", `Whether ${lab.name} does this cannot be confirmed from what it `
      + "publishes. It would take an internal audit."),
    element("h3", "", "What an audit would look at"), element("p", "", practice.audit),
    toProfile(lab, "supporting"));
}

function aboutTotal(content) {
  titled(content, `Overall, out of ${OVERALL}`, "The sum of the four questions.");
  content.append(element("p", "", "Each question is scored from 0 to 4, as the average of "
    + "its checks, and the overall score is the sum of the four. Every question weighs "
    + "the same, whatever its number of checks."));
  const list = element("ul", "check-list");
  board.data.questions.forEach(question => {
    const item = element("li");
    item.append(element("span", "check-id", question.id),
      element("span", "", `${question.name}: ${question.question}`));
    list.append(item);
  });
  content.append(list, element("p", "", "Companies are ranked by this score. A tie is "
    + "broken on the best practices, and companies level on both share a place."));
}

function aboutQuestion(content, question) {
  titled(content, question.name, question.question);
  content.append(element("p", "", question.explainer));
  if (question.minimum) {
    content.append(element("h3", "", "Part of the minimum"), element("p", "", board.data.minimum_note));
  }
  content.append(paperFold(question));
  content.append(element("h3", "", "How it is scored"));
  content.append(element("p", "", `${question.checks.length} checks, each scored from 0 to 4. `
    + "The question's score is their average. Open a check to see what earns each score."));
  question.checks.forEach(check => {
    const fold = element("details");
    const summary = element("summary");
    summary.append(element("span", "check-id", check.id), element("span", "", check.label));
    fold.append(summary, anchorsList(check, null));
    content.append(fold);
  });
  content.append(showInTable(question.id));
}

function aboutCheck(content, question, check) {
  titled(content, check.short, `${check.id} ${check.label}.`);
  content.append(element("p", "subtitle",
    `One of the checks on the ${question.name.toLowerCase()} question, scored from 0 to 4.`),
  paperFold(check));
  content.append(element("h3", "", "What the scores mean"), anchorsList(check, null),
    element("p", "subtitle", "A score of 1 or 3 falls between the descriptions either side of it."));
}

function aboutSupporting(content) {
  titled(content, `Best practices, out of ${board.bestMax}`, "From a second working paper, and left out of the total.");
  content.append(element("p", "", "Practices taken from Kembery et al., Emerging International "
    + "Best Practices for AI Model Specs. Five can be checked by anyone from public sources. "
    + "Four more only the company can show, and are scored on what it publishes. One only an "
    + "internal audit could show, and is not scored. Each scored practice is worth 0, 1 or 2. "
    + "They measure related good practice, so they are kept out of the total."));
  const list = element("ul", "check-list");
  board.data.supporting.forEach(practice => {
    const item = element("li");
    item.append(element("span", "check-id", practice.id), element("span", "", practice.label));
    list.append(item);
  });
  content.append(list, element("h3", "", "What the scores mean"), scaleList(null),
    element("h3", "", "What only the company can show"),
    element("p", "", board.data.disclosed_intro), disclosedAbout(),
    element("h3", "", "Only an internal audit could score this"),
    element("p", "", board.data.internal_note), internalList(false),
    showInTable("supporting"));
}

function disclosedAbout() {
  const list = element("ul", "check-list");
  disclosedOf(board.data).forEach(practice => {
    const item = element("li");
    item.append(element("span", "check-id", practice.id), element("span", "", practice.label));
    list.append(item);
  });
  return list;
}

function aboutDisclosed(content) {
  titled(content, "What only the company can show", "Four of the best practices, scored on what the company publishes.");
  content.append(element("p", "", board.data.disclosed_intro), disclosedAbout(),
    element("p", "subtitle", `*${board.data.disclosure_note}`));
}

function aboutPractice(content, practice) {
  titled(content, practice.short, `${practice.id} ${practice.label}`);
  content.append(
    element("p", "subtitle", "One of the best practices, scored 0, 1 or 2 and left out of the total."),
    paperFold(practice), element("h3", "", "What the scores mean"), scaleList(null));
}

function aboutInternal(content) {
  titled(content, "Only an internal audit could score this", "One of the best practices, not scored.");
  content.append(element("p", "", board.data.internal_note), internalList(false));
}

function aboutInternalPractice(content, practice) {
  titled(content, practice.short, `${practice.id} ${practice.label}`);
  content.append(
    element("p", "subtitle", "Not assessed for any company, because no internal audit has been done."),
    paperFold(practice),
    element("h3", "", "What an audit would look at"), element("p", "", practice.audit));
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

function cellButton(lab, row, label, build, className) {
  const cell = element("td", "cell");
  const button = element("button", className);
  button.type = "button";
  button.dataset.lab = lab.id;
  button.dataset.row = row;
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => openPopover(button, build));
  cell.append(button);
  return { cell, button };
}

function scoreCell(lab, rowLabel, value, max, build, row, text = String(value)) {
  const { cell, button } = cellButton(lab, row,
    `${lab.name}, ${rowLabel}: ${text} out of ${max}`, build, "cell-button");
  paintShare(button, value, max);
  // What the score is out of, small and to the right. The accessible name
  // already says it, so a screen reader does not hear it twice.
  const out = element("span", "cell-max", `/${max}`);
  out.setAttribute("aria-hidden", "true");
  button.append(element("span", "cell-figure", text), out);
  return cell;
}

/* A practice only an internal audit could check: NA, and no colour. */
function naCell(lab, rowLabel, build, row) {
  const { cell, button } = cellButton(lab, row,
    `${lab.name}, ${rowLabel}: not assessed`, build, "cell-button cell-na");
  button.append(element("span", "cell-figure", "NA"));
  return cell;
}

/* The round button that opens a row into the rows under it. */
function rowToggle(groupId, children) {
  const toggle = element("button", "row-toggle");
  toggle.type = "button";
  toggle.dataset.question = groupId;
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", children.map(child => rowId(child.id)).join(" "));
  toggle.setAttribute("aria-label", `Show the ${partsOf(groupId)} of ${groupName(groupId)}`);
  toggle.addEventListener("click", () => setExpanded(groupId, !board.expanded.has(groupId)));
  return toggle;
}

/* A check or a practice, folded under the row it belongs to until that opens. */
function subRow(id, parent, name) {
  const row = element("tr", "check-row");
  row.id = rowId(id);
  row.dataset.parent = parent;
  row.hidden = true;
  const head = element("th");
  head.scope = "row";
  head.append(name);
  row.append(head);
  return row;
}

function headRow() {
  const row = element("tr");
  const corner = element("th", "row-col");
  corner.scope = "col";
  corner.append(element("span", "head-name", "Score"),
    element("span", "head-sub", "companies by rank"));
  row.append(corner);
  board.labs.forEach(lab => {
    const cell = element("th");
    cell.scope = "col";
    const button = element("button", "company-button");
    button.type = "button";
    button.dataset.lab = lab.id;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", `${lab.name}, ranked ${lab.rank}`
      + `${lab.open_weights ? ", open weights" : ""}: its profile`);
    button.append(element("span", "rank", String(lab.rank)),
      element("span", "company-name", lab.name));
    if (lab.open_weights) button.append(element("span", "company-flag", "Open weights"));
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
  total.append(rowHead(null, rowName("Overall", `out of ${OVERALL}`, aboutTotal,
    `Overall, out of ${OVERALL}: how it is worked out`)));
  board.labs.forEach(lab => total.append(scoreCell(lab, "overall", lab.total, OVERALL,
    content => profile(content, lab, null), "total", shown(lab.total))));
  body.append(total);

  board.data.questions.forEach(question => {
    const row = element("tr", "question-row");
    row.dataset.question = question.id;
    row.append(rowHead(rowToggle(question.id, question.checks),
      rowName(question.name, `out of ${SCALE}${question.minimum ? ", part of the minimum" : ""}`,
        content => aboutQuestion(content, question), `${question.name}: what it asks`)));
    board.labs.forEach(lab => row.append(scoreCell(lab, question.name.toLowerCase(),
      lab.byQuestion[question.id], SCALE,
      content => questionScore(content, lab, question), question.id,
      shown(lab.byQuestion[question.id]))));
    body.append(row);

    question.checks.forEach(check => {
      const sub = subRow(check.id, question.id, rowName(check.short, check.id,
        content => aboutCheck(content, question, check),
        `${check.id} ${check.short}: what its scores mean`));
      board.labs.forEach(lab => sub.append(scoreCell(lab, check.short.toLowerCase(),
        board.data.scores[lab.id][check.id], 4,
        content => checkScore(content, lab, question, check), check.id)));
      body.append(sub);
    });
  });

  // A line across the table before the best practices, so nobody reads them as
  // a fifth question: they come from another paper and add to nothing above.
  const outside = element("tr", "outside-row");
  const outsideHead = element("th", "", "Outside the total");
  outsideHead.scope = "row";
  const outsideNote = element("td", "divider-note",
    "Best practices from a second working paper, by Kembery et al.");
  outsideNote.colSpan = board.labs.length;
  outside.append(outsideHead, outsideNote);
  body.append(outside);

  const supporting = element("tr", "supporting-row");
  supporting.append(rowHead(rowToggle("supporting",
    [...board.data.supporting, { id: "disclosed" }, ...disclosedOf(board.data),
      { id: "internal" }, ...auditOnlyOf(board.data)]),
    rowName("Best practices", `out of ${board.bestMax}`, aboutSupporting,
      `Best practices, out of ${board.bestMax}, not counted: what they are`)));
  board.labs.forEach(lab => supporting.append(scoreCell(lab, "best practices",
    lab.supporting, board.bestMax, content => supportingScore(content, lab), "supporting")));
  body.append(supporting);
  board.data.supporting.forEach(practice => {
    const sub = subRow(practice.id, "supporting", rowName(practice.short, practice.id,
      content => aboutPractice(content, practice),
      `${practice.id} ${practice.short}: what its scores mean`));
    board.labs.forEach(lab => sub.append(scoreCell(lab, practice.short.toLowerCase(),
      board.data.supporting_scores[lab.id][practice.id], PRACTICE,
      content => practiceScore(content, lab, practice), practice.id)));
    body.append(sub);
  });

  // The same group goes on, under a line of their own, with the practices only
  // the company can show. The paper asks companies to publish them, so they are
  // scored on what each publishes, and a 0 carries the note that says so.
  const disclosedLine = subRow("disclosed", "supporting", rowName("What only the company can show*",
    "scored on what it publishes", aboutDisclosed, "Practices only the company can show: how they are scored"));
  disclosedLine.classList.add("practice-divider");
  const scoredOn = element("td", "divider-note", `*${board.data.disclosure_note}`);
  scoredOn.colSpan = board.labs.length;
  disclosedLine.append(scoredOn);
  body.append(disclosedLine);
  disclosedOf(board.data).forEach(practice => {
    const sub = subRow(practice.id, "supporting", rowName(practice.short, practice.id,
      content => aboutDisclosedPractice(content, practice),
      `${practice.id} ${practice.short}: what its scores mean`));
    board.labs.forEach(lab => sub.append(scoreCell(lab, practice.short.toLowerCase(),
      board.data.internal_scores[lab.id][practice.id], PRACTICE,
      content => disclosedScore(content, lab, practice), practice.id)));
    body.append(sub);
  });

  // Last, what the paper does not ask anyone to publish. No audit has been
  // done, so every cell is NA, and it counts towards nothing.
  const divider = subRow("internal", "supporting", rowName("Only an internal audit could score this",
    "not scored", aboutInternal, "Practices only an internal audit could score: what they are"));
  divider.classList.add("practice-divider");
  const why = element("td", "divider-note", "No internal audit has been done, so every company is NA.");
  why.colSpan = board.labs.length;
  divider.append(why);
  body.append(divider);
  auditOnlyOf(board.data).forEach(practice => {
    const sub = subRow(practice.id, "supporting", rowName(practice.short, practice.id,
      content => aboutInternalPractice(content, practice),
      `${practice.id} ${practice.short}: what it asks`));
    board.labs.forEach(lab => sub.append(naCell(lab, practice.short.toLowerCase(),
      content => internalScore(content, lab, practice), practice.id)));
    body.append(sub);
  });

  const table = board.nodes.table;
  table.tHead.replaceChildren(headRow());
  table.tBodies[0].replaceChildren(body);
}

/* A question opens into its checks and a group of practices into its
 * practices, and the button above the table opens or shuts them all at once. */
function setExpanded(groupId, open) {
  if (open) board.expanded.add(groupId);
  else board.expanded.delete(groupId);
  board.nodes.table.querySelectorAll(`tr.check-row[data-parent="${groupId}"]`)
    .forEach(row => { row.hidden = !open; });
  const toggle = board.nodes.table.querySelector(`.row-toggle[data-question="${groupId}"]`);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label",
    `${open ? "Hide" : "Show"} the ${partsOf(groupId)} of ${groupName(groupId)}`);
  const all = board.expanded.size === groupIds().length;
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
  const na = element("span", "legend-na");
  na.append(naChip(), document.createTextNode(" not assessed, needs an internal audit"));
  legend.append(na);
  board.nodes.legend.replaceChildren(legend);
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];

/* The ties the ranking has to break, or cannot, said under the table. */
function renderTies() {
  const lines = [];
  board.labs.forEach((lab, index) => {
    const next = board.labs[index + 1];
    if (!next || !level(next.total, lab.total)) return;
    lines.push(lab.supporting === next.supporting
      ? `${lab.name} and ${next.name} tie on ${shown(lab.total)} and on the best practices, `
        + `${lab.supporting} each, so they share ${ORDINALS[lab.rank - 1]} place.`
      : `${lab.name} and ${next.name} tie on ${shown(lab.total)}, and ${lab.name} is `
        + `placed ahead on the best practices, ${lab.supporting} against ${next.supporting}.`);
  });
  board.nodes.ties.textContent = lines.join(" ");
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
      `${question.id}. ${question.name}: ${question.question}`));
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

  const practice = item => element("li", "",
    `${item.id} ${item.label} Kembery et al., ${item.source.toLowerCase()}.`);
  const practices = document.createDocumentFragment();
  board.data.supporting.forEach(item => practices.append(practice(item)));
  board.nodes.supporting.replaceChildren(practices);
  const disclosed = document.createDocumentFragment();
  disclosedOf(board.data).forEach(item => disclosed.append(practice(item)));
  board.nodes.disclosed.replaceChildren(disclosed);
  const internal = document.createDocumentFragment();
  auditOnlyOf(board.data).forEach(item => internal.append(practice(item)));
  board.nodes.internal.replaceChildren(internal);
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
    status: byId("gov-status"), table: byId("gov-heatmap"),
    legend: byId("gov-legend"), findings: byId("gov-findings"), pop: byId("gov-pop"),
    expandAll: byId("gov-expand-all"), scoring: byId("gov-scoring"),
    supporting: byId("gov-supporting"), disclosed: byId("gov-disclosed"), internal: byId("gov-internal"),
    ties: byId("gov-ties"),
  };
  board.paint = paint;
  const data = await loadGovernance();
  if (!data) {
    board.nodes.status.textContent = "The governance scores could not be loaded.";
    return;
  }
  board.data = data;
  board.bestMax = PRACTICE * (data.supporting.length + disclosedOf(data).length);
  board.labs = ranked(data);
  renderTable();
  renderLegend();
  renderTies();
  renderFindings();
  renderScoring();
  wirePopover();
  board.nodes.expandAll.addEventListener("click", () => {
    const open = board.expanded.size !== groupIds().length;
    groupIds().forEach(id => setExpanded(id, open));
  });
  board.nodes.status.textContent = "";
}
