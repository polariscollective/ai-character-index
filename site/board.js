/* The board the overview draws, in both of its views.
 *
 * One table with the labs across the top and the figures down the side, each
 * row painted over its own maximum, each group opening into the rows it is made
 * of, and one popover that fills with whatever was pressed and sits beside it.
 * The governance view was drawn this way first (September 2026) and the
 * coverage view took its design in September 2026, so the two take one
 * implementation: a second copy of a popover is a second set of bugs.
 *
 * A view brings its own data, its own rows and the text of its own popovers.
 * Nothing here knows about a lab, a check, a behaviour or a criterion. What it
 * does know is where its own popover is: a board takes its nodes, and the id its
 * headings carry is read off the popover it was given, so two boards on one page
 * label their popovers apart.
 *
 * Three class names are the governance view's, because that view was written
 * first: `gov-pop-close` on the popover's cross, `gov-button` on the buttons
 * inside it, and `gov-pop` on the popover itself in the markup. A second board
 * has to carry the same names to be styled, since the rules that draw them sit
 * under those selectors in site/overview.html. They were left rather than
 * renamed: the prototype this series implements
 * (docs/prototypes/2026-09-22-depth-out-of-ten/index.html) names them the same
 * way, so renaming would put this file out of step with the design the later
 * tasks copy from, for no change to anything a reader sees.
 *
 * Nothing is built with innerHTML: every string a model wrote lands as a text
 * node, wherever it came from.
 */

import { rampAt, inkOver } from "./depth-scale.js";

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* A figure, a version string or a model id: mono is for data and never for
 * prose, which is the framework's rule and the reason this is a helper rather
 * than a style on a paragraph. */
export const mono = text => element("span", "mono", text);

export const paragraph = (text, className) => element("p", className, text);

export const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh",
                         "eighth", "ninth"];

/* Two figures that are the same figure. Scores are sums and means of small
 * whole numbers, so two that should be equal can differ in the last bit. */
export const level = (a, b) => Math.abs(a - b) < 1e-9;

/* A rank is one more than the number of items ahead, so items nothing separates
 * share a place and the place after a shared one is skipped. The order of the
 * items is the caller's, and so is `ahead`: a view that breaks a tie on a second
 * figure says so there, and a view that breaks none leaves the tie standing. */
export function rankBy(items, ahead) {
  return items.map(item => ({
    ...item,
    rank: 1 + items.filter(other => ahead(other, item)).length,
  }));
}

/* One board. `nodes.table` is the table it draws into, `nodes.pop` the popover
 * every press fills, `nodes.expandAll` the button above the table that opens
 * every group at once; `everyRow` is what that button says, shut and open, in
 * the view's own words. */
export function createBoard({ nodes, everyRow }) {
  /* The groups that open into rows: `id -> {name, parts}`, filled by the
   * toggles as the table is built, and read again when one is opened, so a
   * board knows how many groups it has without being told twice. */
  const groups = new Map();
  const expanded = new Set();
  const pop = { trigger: null, closedTrigger: null, closedAt: 0 };

  /* Beside what opened it, never over it: below if it fits, else above, else to
   * the right or the left, and held inside the window whichever it is. Fixed to
   * the window, so it is placed again when the page scrolls under it. */
  function placePopover() {
    const node = nodes.pop;
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

  const board = {
    nodes,
    groups,

    /* A figure over its own maximum: a score of 8 out of 12 and a depth of 2.7
     * out of 4 wear the same colour, because the ramp runs over the fraction.
     *
     * The figure was light paper on every colour until 23 September 2026, on the
     * argument that one ink across a table reads as one code. What that cost was
     * measured: paper on the amber middle of the ramp is 2.2:1, and a figure
     * nobody can read is no code either. It takes the ink with more contrast on
     * the colour under it now, on both boards. */
    paint(node, value, max) {
      const rgb = rampAt(value, max);
      node.style.background = `rgb(${rgb.join(" ")})`;
      node.style.color = inkOver(rgb);
    },

    chip(value, max, text = String(value)) {
      const node = element("span", "chip", text);
      board.paint(node, value, max);
      return node;
    },

    /* Not assessed: there is no score, so there is no colour either. */
    naChip: () => element("span", "chip chip-na", "NA"),

    /* ---- The popover ------------------------------------------------------ */

    /* Fill the popover and show it beside `trigger`. A press on the trigger of
     * an open popover is meant to close it, which the browser's own light
     * dismiss does on the way down; the click that follows must not open it
     * again. */
    openPopover(trigger, build) {
      const node = nodes.pop;
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
    },

    /* The same popover, same place, new contents: a score's popover leads on to
     * the whole profile without the reader losing their place. Closing it on the
     * way marks its trigger as just closed, which is forgotten here, or the
     * reopening would be taken for a press meant to close it. */
    refill(build) {
      const trigger = pop.trigger;
      if (!trigger) return;
      nodes.pop.hidePopover();
      pop.closedTrigger = null;
      board.openPopover(trigger, build);
    },

    /* Listened for before the popover closes rather than after: the browser's
     * light dismiss closes it on the press that lands on its own trigger, and
     * the click that follows has to find the trigger already marked as just
     * closed. `scrollers` are the elements that scroll under the board besides
     * the window, which a view whose table sits in its own frame passes in, so
     * the popover is placed again when that frame moves. */
    wirePopover(scrollers = []) {
      const node = nodes.pop;
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
      scrollers.forEach(frame => frame?.addEventListener("scroll", placePopover, { passive: true }));
    },

    /* ---- What a popover is built from ------------------------------------- */

    /* The heading carries the id its own popover is labelled by, read off that
     * popover rather than written here: two boards on one page would otherwise
     * both claim one id, and `aria-labelledby` would resolve to whichever of the
     * two headings the browser reached first. A view may hand the id in as
     * `nodes.popTitle` where its markup names it somewhere else. */
    titled(content, title, subtitle) {
      const heading = element("h2", "", title);
      const labelledBy = nodes.popTitle || nodes.pop.getAttribute("aria-labelledby");
      if (labelledBy) heading.id = labelledBy;
      content.append(heading);
      if (subtitle) content.append(element("p", "subtitle", subtitle));
    },

    figure(value, rest) {
      const line = element("p", "figure");
      line.append(element("strong", "", String(value)), document.createTextNode(rest));
      return line;
    },

    h3: text => element("h3", "", text),

    popButton(text, onPress) {
      const button = element("button", "gov-button", text);
      button.type = "button";
      button.addEventListener("click", onPress);
      return button;
    },

    /* A button that opens a group's rows in the table, from a popover about it.
     * `parts` is the whole phrase after the verb, "its checks" or "the
     * criteria", because whose they are is the view's word and not the board's. */
    showInTable(groupId, parts) {
      const shown = expanded.has(groupId);
      return board.popButton(`${shown ? "Hide" : "Show"} ${parts} in the table`, () => {
        nodes.pop.hidePopover();
        board.setExpanded(groupId, !shown);
      });
    },

    /* ---- The table -------------------------------------------------------- */

    rowName(name, sub, build, label) {
      const button = element("button", "row-name");
      button.type = "button";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", label);
      button.append(element("span", "head-name", name));
      if (sub) button.append(element("span", "head-sub", sub));
      button.addEventListener("click", () => board.openPopover(button, build));
      return button;
    },

    /* `dataset` is what the cell is addressed by, every key of it written on the
     * button: the governance view writes a lab and a row, and a walker selects
     * on both. */
    cellButton(dataset, label, build, className) {
      const cell = element("td", "cell");
      const button = element("button", className);
      button.type = "button";
      Object.entries(dataset).forEach(([key, value]) => { button.dataset[key] = value; });
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", label);
      button.addEventListener("click", () => board.openPopover(button, build));
      cell.append(button);
      return { cell, button };
    },

    /* `note` is what the view has to say about the figure beyond the figure
     * itself, and it lands at the end of the accessible name: a depth's rubric
     * word, which the scale under the table spells out and which a cell four
     * characters wide cannot. */
    scoreCell({ name, rowLabel, value, max, text = String(value), note, build, dataset,
                className = "cell-button" }) {
      const { cell, button } = board.cellButton(dataset,
        `${name}, ${rowLabel}: ${text} out of ${max}${note ? `, ${note}` : ""}`, build, className);
      board.paint(button, value, max);
      // What the score is out of, small and to the right. The accessible name
      // already says it, so a screen reader does not hear it twice.
      const out = element("span", "cell-max", `/${max}`);
      out.setAttribute("aria-hidden", "true");
      button.append(element("span", "cell-figure", text), out);
      return cell;
    },

    /* A row nothing scored: NA, and no colour. */
    naCell({ name, rowLabel, build, dataset }) {
      const { cell, button } = board.cellButton(dataset,
        `${name}, ${rowLabel}: not assessed`, build, "cell-button cell-na");
      button.append(element("span", "cell-figure", "NA"));
      return cell;
    },

    /* The round button that opens a row into the rows under it. It takes the DOM
     * ids of those rows, which the view has already given them, and the group's
     * name and what its rows are called, which is also what the button says when
     * it is opened and shut again. */
    rowToggle(groupId, rowIds, { parts, name }) {
      groups.set(groupId, { parts, name });
      const toggle = element("button", "row-toggle");
      toggle.type = "button";
      toggle.dataset.question = groupId;
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", rowIds.join(" "));
      toggle.setAttribute("aria-label", `Show the ${parts} of ${name}`);
      toggle.addEventListener("click", () => board.setExpanded(groupId, !expanded.has(groupId)));
      return toggle;
    },

    /* A row of a group, folded under the row it belongs to until that opens. */
    subRow(domId, parent, name) {
      const row = element("tr", "check-row");
      row.id = domId;
      row.dataset.parent = parent;
      row.hidden = true;
      const head = element("th");
      head.scope = "row";
      head.append(name);
      row.append(head);
      return row;
    },

    /* A row's head: a fold for a group, an empty space the same width for the
     * rows that have nothing to fold, so every name starts on one line. */
    rowHead(first, name) {
      const head = element("th");
      head.scope = "row";
      const line = element("div", "row-head");
      line.append(first || element("span", "row-spacer"), name);
      head.append(line);
      return head;
    },

    /* A group opens into its rows, and the button above the table opens or
     * shuts them all at once. */
    setExpanded(groupId, open) {
      if (open) expanded.add(groupId);
      else expanded.delete(groupId);
      nodes.table.querySelectorAll(`tr.check-row[data-parent="${groupId}"]`)
        .forEach(row => { row.hidden = !open; });
      const toggle = nodes.table.querySelector(`.row-toggle[data-question="${groupId}"]`);
      const group = groups.get(groupId);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label",
        `${open ? "Hide" : "Show"} the ${group.parts} of ${group.name}`);
      const all = expanded.size === groups.size;
      nodes.expandAll.setAttribute("aria-pressed", String(all));
      nodes.expandAll.textContent = all ? everyRow.hide : everyRow.show;
    },

    expandEvery() {
      const open = expanded.size !== groups.size;
      [...groups.keys()].forEach(groupId => board.setExpanded(groupId, open));
    },

    /* The strip of colour under the table: the ramp at the figures a view names,
     * over its own maximum. The words either side are the view's own. */
    swatches(values, max) {
      const strip = element("span", "swatches");
      values.forEach(value => {
        const swatch = element("span", "swatch");
        board.paint(swatch, value, max);
        strip.append(swatch);
      });
      return strip;
    },
  };

  return board;
}
