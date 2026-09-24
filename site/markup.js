/* The light markup the boards' files are written in, and how it is drawn.
 *
 * Every word the front page shows comes out of constitutions.json and
 * governance.json, which a publication freezes, so the files carry the page's
 * prose as well as its figures. They are written for a reader who is scanning,
 * so they carry five marks and no more: a blank line between paragraphs,
 * `**bold**` inside a sentence, `[words](address)` for a link, a line opening
 * `- ` as a bullet, and a line opening `### ` as a small heading. Anything else
 * is prose.
 *
 * The parser is kept apart from the drawing, and returns what to draw rather
 * than drawing it, so that it can be tested with no page and so that the walker
 * can compare a popover against the plain text of the file.
 *
 * Nothing is built with innerHTML: every run lands as a text node or an element
 * made here, and an address is only ever one of the kinds a link may take.
 */

const RUN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/* An address a link may carry: the site's own pages and anchors, and the web. */
const ADDRESS = /^(\/|#|https?:\/\/|mailto:)/;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* A sentence cut at its bold spans and its links: each run is a string, and
 * whether it is bold or where it leads. An address of any other kind, and an
 * unpaired mark, are left where they are and read as text. */
function runsOf(text) {
  const runs = [];
  let at = 0;
  for (const match of text.matchAll(RUN)) {
    if (match[2] !== undefined && !ADDRESS.test(match[3])) continue;
    if (match.index > at) runs.push({ text: text.slice(at, match.index), bold: false });
    runs.push(match[1] !== undefined
      ? { text: match[1], bold: true }
      : { text: match[2], bold: false, href: match[3] });
    at = match.index + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at), bold: false });
  return runs;
}

/* The blocks of one field, in the order the page draws them: a paragraph, a
 * heading, or a list with its items. Lines that are neither a heading nor a
 * bullet and sit together make one paragraph, so a field wrapped over several
 * lines reads as the sentence it is. */
export function markupBlocks(text) {
  const blocks = [];
  let lines = [];
  const closeParagraph = () => {
    if (lines.length) blocks.push({ kind: "paragraph", runs: runsOf(lines.join(" ")) });
    lines = [];
  };
  String(text == null ? "" : text).split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) {
      closeParagraph();
      return;
    }
    if (line.startsWith("### ")) {
      closeParagraph();
      blocks.push({ kind: "heading", runs: runsOf(line.slice(4).trim()) });
      return;
    }
    if (line.startsWith("- ")) {
      closeParagraph();
      const item = runsOf(line.slice(2).trim());
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
      return;
    }
    lines.push(line);
  });
  closeParagraph();
  return blocks;
}

const plainOf = runs => runs.map(run => run.text).join("");

/* One string per block the page draws, with a list given as its items, and the
 * marks gone. This is what a reader sees, and what the walker compares the
 * popover against. */
export function markupPlain(text) {
  return markupBlocks(text).flatMap(block =>
    (block.kind === "list" ? block.items.map(plainOf) : [plainOf(block.runs)]));
}

/* The runs of one line, drawn into `node`. A link that leaves the site opens in
 * its own tab, so a reader checking a source keeps their place; a link whose
 * words are a lone asterisk is the site's footnote mark, drawn as the pages
 * draw it. */
export function filled(node, runs) {
  runs.forEach(run => {
    if (run.bold) {
      node.append(element("strong", null, run.text));
      return;
    }
    if (run.href) {
      const link = element("a", run.text === "*" ? "asterisk" : null, run.text);
      link.href = run.href;
      // A lone asterisk says nothing read aloud: it is named for what it opens.
      if (run.text === "*") link.setAttribute("aria-label", "What this word means here");
      if (/^https?:/.test(run.href)) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      node.append(link);
      return;
    }
    node.append(document.createTextNode(run.text));
  });
  return node;
}

/* One line of markup, drawn into `node` without a paragraph around it: for a
 * table cell or a note, which are already the block. */
export function renderInline(node, text) {
  return filled(node, markupBlocks(text).flatMap((block, index) =>
    [...(index ? [{ text: " ", bold: false }] : []),
     ...(block.kind === "list" ? block.items.flat() : block.runs)]));
}

/* The blocks of one field, drawn into `parent`. `className` is carried by every
 * block of it, which is how a field the popover shows as an aside stays muted
 * once it is more than one paragraph. */
export function renderMarkup(parent, text, className) {
  markupBlocks(text).forEach(block => {
    if (block.kind === "heading") {
      parent.append(filled(element("h3", className), block.runs));
      return;
    }
    if (block.kind === "list") {
      /* The framework's own bullet, a chartreuse circle, which the reference
       * text under the board already draws with this class. */
      const list = element("ul", ["gov-bullets", className].filter(Boolean).join(" "));
      block.items.forEach(item => list.append(filled(element("li"), item)));
      parent.append(list);
      return;
    }
    parent.append(filled(element("p", className), block.runs));
  });
}
