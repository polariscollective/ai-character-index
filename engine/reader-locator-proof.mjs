/**
 * Proof that a block's locator in the reader is the locator a citation of it carries.
 *
 * The reader gives every paragraph a locator of its own (documentLocators), and a
 * passage's locator comes from the engine. The two meet on the block the reader
 * anchors a passage to: for every passage, the locator of that block must be the
 * passage's, sentence span aside. So this resolves each passage the way the reader
 * does, with the reader's own functions taken verbatim from app.js and run in the
 * page against the document as rendered with nothing ticked, and compares.
 *
 * Shared by verify-reader-features.mjs, which holds the fixture to it, and
 * verify-reader-locators.mjs, which runs it over a publication's data.
 */
import { readFile } from "node:fs/promises";

const APP_JS = new URL("../site/spec-reader/app.js", import.meta.url);

function extract(lines, header) {
  const start = lines.findIndex(line => line.startsWith(header));
  if (start < 0) throw new Error(`not found in app.js: ${header}`);
  let depth = 0;
  let began = false;
  for (let i = start; i < lines.length; i += 1) {
    for (const ch of lines[i]) {
      if (ch === "{") { depth += 1; began = true; }
      else if (ch === "}") depth -= 1;
    }
    if (began && depth === 0) return lines.slice(start, i + 1).join("\n");
  }
  throw new Error(`unbalanced braces in app.js for: ${header}`);
}

/** The reader's passage resolution, as a script a page can run. */
export async function resolverSource() {
  const lines = (await readFile(APP_JS, "utf8")).split("\n");
  return [
    "function normalize(value) {",
    "function passageFragments(quote) {",
    "function containsInOrder(haystack, fragments) {",
    "function quoteBeforeFence(quote) {",
    "function findPassageBlocks(body, passage) {",
  ].map(header => extract(lines, header)).join("\n")
    + "\nwindow.__readerProof = { findPassageBlocks };";
}

/**
 * For the document on the page, every passage given: how many the reader cannot
 * place, how many land on a block with no locator, and each whose block's locator
 * is not its own. A locator names its document by its head, which older fixture
 * locators write without the lab, so heads compare by what they end in.
 */
export async function proveDocument(page, passages, source) {
  const loaded = await page.evaluate(() => Boolean(window.__readerProof));
  if (!loaded) await page.addScriptTag({ content: source });
  return page.evaluate(passages => {
    const body = document.querySelector(".document-body");
    const withoutSpan = locator => locator.replace(/ s\d+(?:\s*-\s*(?:s?\d+|¶\d+\s*s\d+))?$/, "");
    const head = locator => locator.split(" > ")[0];
    const tail = locator => withoutSpan(locator).split(" > ").slice(1).join(" > ");
    const sameHead = (a, b) => a === b || a.endsWith(`--${b}`) || b.endsWith(`--${a}`);
    const result = { passages: passages.length, unresolved: 0, noLocator: 0, wrong: 0, examples: [] };
    for (const passage of passages) {
      const found = window.__readerProof.findPassageBlocks(body, passage);
      if (!found) { result.unresolved += 1; continue; }
      const computed = found.anchor.dataset.locator || null;
      const ok = computed && sameHead(head(computed), head(passage.locator))
        && tail(computed) === tail(passage.locator);
      if (ok) continue;
      if (computed) result.wrong += 1;
      else result.noLocator += 1;
      if (result.examples.length < 12) {
        result.examples.push({ locator: passage.locator, computed, block: found.anchor.tagName.toLowerCase(),
                               quote: passage.quote.slice(0, 80) });
      }
    }
    result.mismatches = result.wrong + result.noLocator;
    return result;
  }, passages);
}
