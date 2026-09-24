/**
 * The light markup the board of constitutions reads out of site/constitutions.json:
 * a blank line between paragraphs, `**bold**` inside a sentence, a line opening
 * `- ` as a bullet and a line opening `### ` as a small heading.
 *
 * What is tested here is the parser and the builder. What the board does with
 * them in a page is walked by engine/verify-reader-features.mjs, which reads the
 * same parser rather than a copy of it.
 *
 * Run: node --test app/lib/__tests__/constitutions-markup.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { markupBlocks, markupPlain, renderMarkup } from "../../../site/constitutions.js";

/* Just enough of a document for `element` and for text nodes. The board's own
 * tests stub it the same way: nothing here reads the page back. */
function withStubDocument(run) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "document");
  globalThis.document = {
    createElement: tag => ({ tag, className: "", textContent: undefined, children: [],
                             append(...kids) { this.children.push(...kids); } }),
    createTextNode: text => ({ tag: "#text", text }),
  };
  try {
    return run();
  } finally {
    if (had) Object.defineProperty(globalThis, "document", had);
    else delete globalThis.document;
  }
}

const stubParent = () => ({ children: [], append(...kids) { this.children.push(...kids); } });

const drawn = (text, className) => withStubDocument(() => {
  const parent = stubParent();
  renderMarkup(parent, text, className);
  return parent.children;
});

/* What a node says, its bold spans marked, so a run that should be bold cannot
 * pass as a run that is not. */
const said = node => node.children.map(kid =>
  (kid.tag === "#text" ? kid.text : `*${kid.textContent}*`)).join("");

test("a blank line separates paragraphs, and wrapped lines make one", () => {
  const blocks = markupBlocks("One sentence.\nStill the first.\n\nA second paragraph.");
  assert.deepEqual(blocks.map(block => block.kind), ["paragraph", "paragraph"]);
  assert.deepEqual(markupPlain("One sentence.\nStill the first.\n\nA second paragraph."),
    ["One sentence. Still the first.", "A second paragraph."]);
});

test("bold inside a sentence is a run of its own, and the marks are not in the words", () => {
  const [block] = markupBlocks("The rule is **root level**, and nothing above it.");
  assert.deepEqual(block.runs, [
    { text: "The rule is ", bold: false },
    { text: "root level", bold: true },
    { text: ", and nothing above it.", bold: false },
  ]);
  assert.deepEqual(markupPlain("The rule is **root level**, and nothing above it."),
    ["The rule is root level, and nothing above it."]);
});

test("lines opening with a dash make one list, and a paragraph closes it", () => {
  const blocks = markupBlocks("It has three parts:\n- a ranked scale\n- a rule for one rank\n"
    + "- cases\n\nAnd it says so.");
  assert.deepEqual(blocks.map(block => block.kind), ["paragraph", "list", "paragraph"]);
  assert.equal(blocks[1].items.length, 3);
  assert.deepEqual(markupPlain("- a ranked scale\n- cases"), ["a ranked scale", "cases"]);
});

test("a line opening with three hashes is a small heading", () => {
  const blocks = markupBlocks("### What wins\nThe higher level.");
  assert.deepEqual(blocks.map(block => block.kind), ["heading", "paragraph"]);
  assert.deepEqual(markupPlain("### What wins\nThe higher level."),
    ["What wins", "The higher level."]);
});

test("prose with none of the marks is one paragraph and stays as it was written", () => {
  const plain = "The document does not do this, and says nothing else about it.";
  assert.deepEqual(markupBlocks(plain).map(block => block.kind), ["paragraph"]);
  assert.deepEqual(markupPlain(plain), [plain]);
});

test("an empty field draws nothing, so no blank paragraph is printed", () => {
  assert.deepEqual(markupBlocks(""), []);
  assert.deepEqual(markupPlain(""), []);
  assert.deepEqual(drawn(""), []);
});

test("the blocks are built as elements, with bold as a strong and the rest as text", () => {
  const nodes = drawn("A **ranked** scale.\n\n### The parts\n- first\n- second");
  assert.deepEqual(nodes.map(node => node.tag), ["p", "h3", "ul"]);
  assert.equal(said(nodes[0]), "A *ranked* scale.");
  assert.equal(said(nodes[1]), "The parts");
  assert.deepEqual(nodes[2].children.map(item => item.tag), ["li", "li"]);
  assert.deepEqual(nodes[2].children.map(said), ["first", "second"]);
});

test("a list takes the framework's own bullet, and a class the caller gives", () => {
  assert.equal(drawn("- one")[0].className, "gov-bullets");
  const muted = drawn("A sentence.\n\n- one\n\n### A heading", "subtitle");
  assert.deepEqual(muted.map(node => node.className),
    ["subtitle", "gov-bullets subtitle", "subtitle"]);
});

/* The strings are ours, and the page builds them anyway: a field carrying what
 * looks like an element is drawn as the characters it is. */
test("markup the parser does not know is drawn as text, never as an element", () => {
  const nodes = drawn("An <em>angled</em> word and an unpaired ** mark.");
  assert.equal(said(nodes[0]), "An <em>angled</em> word and an unpaired ** mark.");
  assert.equal(nodes[0].children.every(kid => kid.tag === "#text"), true);
});
