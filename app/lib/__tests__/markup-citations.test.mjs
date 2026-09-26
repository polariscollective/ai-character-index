/**
 * Citations in the light markup: `[^OA3]` after a sentence names the source it
 * rests on. The page draws it as a superscript leading to the source's entry
 * under "Sources reviewed", and the plain words of a field leave it out.
 *
 * Run: node --test app/lib/__tests__/markup-citations.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { markupBlocks, markupPlain, renderInline, CITATION } from "../../../site/markup.js";

/* Just enough of a document for the drawing: elements that keep their class,
 * their text, their attributes and their children, and text nodes. */
function withStubDocument(run) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "document");
  globalThis.document = {
    createElement: tag => ({
      tag, className: "", textContent: undefined, children: [], attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      append(...kids) { this.children.push(...kids); },
    }),
    createTextNode: text => ({ tag: "#text", text }),
  };
  try {
    return run();
  } finally {
    if (had) Object.defineProperty(globalThis, "document", had);
    else delete globalThis.document;
  }
}

const drawn = text => withStubDocument(() =>
  renderInline({ children: [], append(...kids) { this.children.push(...kids); } }, text).children);

test("a citation is a run of its own, with no words", () => {
  const [block] = markupBlocks("The log summarises updates.[^OA7] It gives no reasons.");
  assert.deepEqual(block.runs, [
    { text: "The log summarises updates.", bold: false },
    { text: "", bold: false, cite: "OA7" },
    { text: " It gives no reasons.", bold: false },
  ]);
});

test("the plain words of a field leave its citations out", () => {
  assert.deepEqual(markupPlain("One.[^OA1][^CO2] Two.[^AN12]\n\n- **Bold.**[^XA3] Then more."),
    ["One. Two.", "Bold. Then more."]);
});

test("a citation is never read as the start of a link", () => {
  const [block] = markupBlocks("Scored (1).[^OA15](and a bracket after)");
  assert.deepEqual(block.runs.map(run => run.cite || run.href || run.text),
    ["Scored (1).", "OA15", "(and a bracket after)"]);
  const [linked] = markupBlocks("[its April 2026 version](/doc-reader/?spec=x).[^AL1]");
  assert.deepEqual(linked.runs, [
    { text: "its April 2026 version", bold: false, href: "/doc-reader/?spec=x" },
    { text: ".", bold: false },
    { text: "", bold: false, cite: "AL1" },
  ]);
});

test("a citation is drawn as a superscript link to the source's entry", () => {
  const [text, sup, rest] = drawn("It is dated.[^OA1] It is open.");
  assert.equal(text.text, "It is dated.");
  assert.equal(sup.tag, "sup");
  assert.equal(sup.className, "cite");
  const [link] = sup.children;
  assert.equal(link.tag, "a");
  assert.equal(link.textContent, "OA1");
  assert.equal(link.href, "#src-OA1");
  assert.equal(link.attributes["aria-label"], "Source OA1");
  assert.equal(rest.text, " It is open.");
});

test("citations written back to back share one superscript", () => {
  const nodes = drawn("Both say so.[^OA3][^OA7]");
  assert.equal(nodes.length, 2);
  const [, sup] = nodes;
  assert.deepEqual(sup.children.map(kid => kid.textContent ?? kid.text), ["OA3", ", ", "OA7"]);
  assert.deepEqual(sup.children.filter(kid => kid.tag === "a").map(kid => kid.href),
    ["#src-OA3", "#src-OA7"]);
});

test("the pattern the MCP answer rewrites is the same one", () => {
  assert.equal("One.[^OA1] Two.[^CO12]".replace(CITATION, "[$1]"), "One.[OA1] Two.[CO12]");
});
