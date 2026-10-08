/**
 * The sections a board's page draws from its file (site/page-content.js), and
 * the one block kind that folds a part of a section on its own.
 *
 * The page is drawn into a stub document, as the markup tests do: nothing here
 * reads the page back, so a plain object per element is enough.
 *
 * Run: node --test app/lib/__tests__/page-content.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderPage } from "../../../site/page-content.js";

function stubElement(tag) {
  return {
    tag, className: "", id: "", textContent: undefined, children: [], dataset: {},
    attributes: {}, open: false,
    append(...kids) { this.children.push(...kids); },
    replaceChildren(...kids) { this.children = kids; },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

/* The page as renderPage leaves it: the three elements it looks up by id. */
function drawnPage(page) {
  const byId = {
    "x-intro": stubElement("h1"),
    "x-lede": stubElement("div"),
    "x-sections": stubElement("div"),
  };
  const had = Object.getOwnPropertyDescriptor(globalThis, "document");
  globalThis.document = {
    createElement: stubElement,
    createTextNode: text => ({ tag: "#text", text }),
    getElementById: id => byId[id],
  };
  try {
    renderPage("x", page);
  } finally {
    if (had) Object.defineProperty(globalThis, "document", had);
    else delete globalThis.document;
  }
  return byId;
}

const text = node => (node.tag === "#text" ? node.text
  : node.textContent ?? node.children.map(text).join(""));

/* A section is a <section> holding its own fold; what the section says is in
 * the fold's body, after the summary. */
const sectionBody = page => {
  const [section] = drawnPage(page)["x-sections"].children;
  const [fold] = section.children;
  return fold.children[1];
};

const page = blocks => ({ title: "T", intro: "I", sections: [{ id: "s", title: "S", blocks }] });

test("a section without folds draws its blocks as it always has", () => {
  const body = sectionBody(page(["### A heading", "A paragraph."]));
  assert.deepEqual(body.children.map(node => node.tag), ["h3", "p"]);
  assert.equal(text(body.children[1]), "A paragraph.");
});

test("a fold is a part of the section that opens and shuts under its own heading", () => {
  const body = sectionBody(page([
    "Before.",
    { kind: "fold", title: "How it is scored", blocks: ["Inside.", "- one\n- two"] },
    "After.",
  ]));
  assert.deepEqual(body.children.map(node => node.tag), ["p", "details", "p"]);
  const fold = body.children[1];
  // The section's own fold, so it carries the same chevron, and shut.
  assert.equal(fold.className, "section-fold");
  assert.equal(fold.open, false);
  const [summary, inside] = fold.children;
  assert.equal(summary.tag, "summary");
  assert.deepEqual(summary.children.map(node => node.tag), ["h3"]);
  assert.equal(summary.children[0].textContent, "How it is scored");
  assert.deepEqual(inside.children.map(node => node.tag), ["p", "ul"]);
  assert.equal(text(inside.children[0]), "Inside.");
  // It is not a section: the side menu does not list it.
  assert.equal(fold.dataset.menu, undefined);
});

test("a fold holds the other kinds of block as a section does", () => {
  const body = sectionBody(page([
    { kind: "fold", title: "F", blocks: [{ slot: "filled-later", tag: "ul", class: "c" }] },
  ]));
  const [slot] = body.children[0].children[1].children;
  assert.equal(slot.tag, "ul");
  assert.equal(slot.id, "filled-later");
  assert.equal(slot.className, "c");
});
