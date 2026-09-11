#!/usr/bin/env node
// Tier-1 feature harness for the site's spec reader (site/spec-reader/),
// driven against TWO data states: the bundled payloads that ship in the repo,
// against the fixture index served through the reader's two routes (the
// two payloads it serves). Covers the reader's URL/DOM-state
// features and the user-data path; interactive-only features (resizer drags,
// focus toggles, scroll behaviour) stay manual (Tier 2). The reader's passage
// anchoring against the shipped payload is covered by verify-reader-test.mjs
// and is not repeated here.
//
// Usage:  node engine/verify-reader-features.mjs   (needs Chrome + python3)
// Exits 0 when every check passes, 1 otherwise.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { readFile as readFileAsync } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { serveReaderRoute, CURRENT_PUBLICATION } from "./reader-routes.mjs";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
               ".md": "text/markdown", ".txt": "text/plain" };

// --- The fixture index --------------------------------------------------------
// This walker used to run twice: once against the committed payloads and once
// against a user-extended staging, which demonstrated the clone-and-fork path.
// That path is gone -- the index lives in Supabase and a reader without
// credentials cannot register a spec -- so the staging went with it. What is
// served here is the fixture: the parser corpus as the one document, and two
// behaviours, one carrying a boundary and one not.
const SITE = join(fileURLToPath(new URL("..", import.meta.url)), "site");
const DATA = join(fileURLToPath(new URL("..", import.meta.url)),
                  "tests", "fixtures", "reader");
const payloadDoc = JSON.parse(readFileSync(join(DATA, "behaviours.json"), "utf8"));
const keepSet = payloadDoc.behaviours;
const fixtureDocs = JSON.parse(readFileSync(join(DATA, "documents.json"), "utf8")).documents;
const DOC_ID = fixtureDocs[0].id;
const DOC_B = fixtureDocs[1].id;
const DEFINED = "defined-behaviour";
const UNDEFINED = "undefined-behaviour";

// --- Serve the staged site ----------------------------------------------------
const server = createServer(async (req, res) => {
  // Answered from the staged tree's own payloads, so the fixture index is
  if (await serveReaderRoute(req, res, DATA, "behaviours")) return;
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFileAsync(join(SITE, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/spec-reader/`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
let pageErrors = [];
page.on("console", m => { if (m.type() === "error") pageErrors.push(m.text()); });
page.on("pageerror", e => pageErrors.push(String(e)));

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -- ${detail}` : ""}`);
};
const ready = () => {
  const el = document.querySelector(".passage-count");
  return el && !el.textContent.startsWith("Loading");
};
async function load(base, query) {
  pageErrors = [];
  await page.goto(base + query, { waitUntil: "networkidle" });
  await page.waitForFunction(ready, undefined, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(250);
}
const sidebar = () => page.evaluate(() =>
  document.querySelector("#behaviour-list")?.textContent || "");
const cards = () => page.evaluate(() =>
  document.querySelectorAll(".passage").length);

const at = q => load(base, q);
// Two citations in one paragraph light one rendered block, so counts are per
// distinct block: strip the sentence suffix and count.
const blockOf = locator => locator.replace(/ s\d+(?:-s?\d+)?$/, "");

// =============================================================================
console.log("== Reader: payload resolution (bundled vs user-extended) ==");
await at("");
check((await sidebar()).includes("Defined behaviour"),
  "no pin resolves the current publication = the fixture index");
check(pageErrors.length === 0, "default load: no console errors", pageErrors.join("; "));

await at(`?publication=${CURRENT_PUBLICATION}`);
check((await sidebar()).includes("Defined behaviour"),
  "a pin on the current publication loads it");

await at("?publication=00000000-0000-0000-0000-000000000000");
{
  // A well-formed pin that names nothing can only be found out by asking, so the
  // 404 is the correct observable and the browser logs it. What must hold is
  // that it is the only complaint and that the page still renders.
  const unexpected = pageErrors.filter(text => !/404|Not Found/.test(text));
  check(unexpected.length === 0 && (await sidebar()).includes("Defined behaviour"),
    "a pin naming no publication degrades to the current one, with only its 404",
    unexpected.join("; "));
}

await at("?publication=behaviours-v5-reader");
check(pageErrors.length === 0 && (await sidebar()).includes("Defined behaviour"),
  "a pin that is not a uuid is refused and degrades to the current one (no error)",
  pageErrors.join("; "));

// =============================================================================
console.log("== Reader: sidebar + behaviour selection ==");
await at("");
{
  const sb = await sidebar();
  check(sb.includes("Behaviours under test"),
    "group header present (user behaviour shares the bundled group spelling)",
    sb.replace(/\s+/g, " ").slice(0, 100));
  check(sb.includes("Undefined behaviour"),
    "every behaviour of the payload is listed, defined or not");
}
await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
{
  const finding = await page.evaluate(() => ({
    name: document.querySelector("#finding-behaviour")?.textContent.trim(),
    def: document.querySelector("#finding-definition")?.textContent.trim() || "",
  }));
  check(finding.name === "Defined behaviour", "?behavior= selects the defined behaviour", finding.name);
  check(finding.def.includes("say what it means"),
    "the behaviour definition renders", finding.def.slice(0, 50));
}
await at("?behavior=no-such-behaviour");
check(pageErrors.length === 0 && (await page.evaluate(() =>
  document.querySelector("#finding-behaviour")?.textContent.trim().length > 0)),
  "unknown ?behavior= degrades to a real behaviour without errors",
  pageErrors.join("; "));

// =============================================================================
console.log("== Reader: tier bands (incl. the single-judge floor, B1) ==");
const definedAll = q => at(`?behavior=${DEFINED}&spec=${DOC_ID}${q}`);
await definedAll("");                       // default bands: defining + core
{
  const n = await cards();
  check(n === 1, "default bands: lone core vote renders, lone related vote waits in the related band", `${n} cards`);
}
await definedAll("&tiers=defining,core,related");
{
  const n = await cards();
  check(n === 2, "all bands on: the single judge's related vote is reachable", `${n} cards`);
  const role = await page.evaluate(() =>
    [...document.querySelectorAll(".passage")].some(p => /score 2\/2/.test(p.textContent)));
  check(role, "passage card carries the recomputed score text (score 2/2)");
  const countText = await page.evaluate(() =>
    document.querySelector(".passage-count").textContent.trim());
  check(/of 2 passages/.test(countText), "passage counter total tracks the rendered anchors", countText);
}
await definedAll("&tiers=none");
check((await cards()) === 0, "?tiers=none hides every band");
await definedAll("&tiers=defining,core,related&related=0");
check((await cards()) === 1, "?related=0 zeroes the lone related vote (weight tuning survives B1)");

// The toggles report what they hold, and a tier this data cannot reach is disabled
// rather than left inert. On the staged single-judge v3w cell the defining cut clamps
// onto the core cut, so core is structurally empty -- the case the counts exist for.
await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
{
  const tiers = () => page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll(".document-panel .tier-toggle")].map(b => [
      b.dataset.tier,
      { count: (b.textContent.match(/\((\d+)\)/) || [])[1], disabled: b.disabled },
    ])));
  const t = await tiers();
  check(t.core?.disabled === true && t.core?.count === "0",
    "unreachable tier is disabled and reports (0)", JSON.stringify(t.core));
  check(t.defining?.disabled === false && t.related?.disabled === false,
    "reachable tiers stay live", `defining=${JSON.stringify(t.defining)} related=${JSON.stringify(t.related)}`);
  const rendered = await cards();
  const shown = Object.values(t).filter(x => !x.disabled)
    .reduce((a, x) => a + Number(x.count || 0), 0);
  check(shown >= rendered,
    "tier counts account for every rendered passage", `counts ${shown} >= rendered ${rendered}`);
}

// =============================================================================
console.log("== Reader: document view, source link, compare, embedded ==");
await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
{
  const href = await page.evaluate(() =>
    document.querySelector(".source-link")?.getAttribute("href") || "");
  check(href === "https://example.invalid/corpus",
    "the source link carries the document's sourceUrl", href);
  const bodyText = await page.evaluate(() =>
    document.querySelector("#document-reader")?.textContent || "");
  check(bodyText.includes("A document written to exercise"),
    "the document text renders behind the cards");
}
await at(`?behavior=${DEFINED}&spec=no-such-spec`);
check(pageErrors.length === 0, "unknown ?spec= degrades to the default document without errors",
  pageErrors.join("; "));
// The list of documents is generated from documents.json and opens from the
// panel's own title, which replaced the row of tabs above the reader.
await at(`?behavior=${DEFINED}`);
await page.click(".document-picker");
await page.waitForTimeout(150);
{
  const options = await page.evaluate(() =>
    [...document.querySelectorAll(".spec-choice")].map(o => o.dataset.spec));
  check(options.includes(DOC_B),
    "spec options are generated from the documents payload",
    options.join(","));
}
await page.click(`.spec-choice[data-spec="${DOC_ID}"]`);
await page.waitForTimeout(250);
{
  const href = await page.evaluate(() =>
    document.querySelector(".source-link")?.getAttribute("href") || "");
  check(href === "https://example.invalid/corpus",
    "choosing the user spec from the title selects it", href);
}
await at(`?compare=1`);
{
  const out = await page.evaluate(() => ({
    panels: document.querySelectorAll(".document-panel").length,
    comparing: document.querySelector("#document-reader")?.classList.contains("compare"),
    toggle: document.querySelector(".compare-toggle")?.getAttribute("aria-pressed"),
    link: document.querySelector(".source-link")?.textContent.trim(),
  }));
  // Compare is a two-document view: exactly two panes and one boundary, whichever
  // pair the reader chose.
  const resizers = await page.evaluate(() =>
    document.querySelectorAll(".document-resizer").length);
  check(out.panels === 2 && resizers === 1 && out.comparing,
    "?compare=1 renders the chosen two documents",
    `${out.panels} panels, ${resizers} resizers`);
  check(out.toggle === "true", "compare toggle reflects ?compare=1");
  check(out.link === "Original",
    "each pane links its own document rather than a shared 'Sources'", out.link);
}
await at("?embedded=1");
check(await page.evaluate(() => document.body.classList.contains("embedded")),
  "?embedded=1 sets the embedded body class");

// =============================================================================
console.log("== Reader: toolbar controls ==");
await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
{
  const enabled = await page.evaluate(() =>
    !document.querySelector("#download-passages").disabled);
  check(enabled, "export-passages button enabled with a behaviour selected");
  const prevNext = await page.evaluate(() => ({
    prev: !document.querySelector(".previous-passage").disabled,
    next: !document.querySelector(".next-passage").disabled,
  }));
  check(prevNext.prev && prevNext.next, "prev/next passage buttons enabled with anchors present");
}
await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
await page.click("#clear-behaviours");
await page.waitForTimeout(250);
check((await cards()) === 0, "clear-behaviours empties the view");
await page.click("#select-all-behaviours");
await page.waitForTimeout(250);
check((await cards()) > 0, "select-all-behaviours restores the view");
await at("?behavior=${DEFINED}");
{
  const before = await page.evaluate(() => document.body.dataset.palette);
  await page.click("#mode");
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => document.body.dataset.palette);
  check(before !== after && ["daylight", "umber"].includes(after),
    "mode button toggles the palette", `${before} -> ${after}`);
}

// =============================================================================
console.log("== Reader: compare is a two-document choice ==");
// The staged fixture registers one user spec on top of the two bundled ones, so the
// reader has three documents and therefore a choice to make.
{
  // The pair is read off the panels themselves now. The two selects that used to
  // report it are gone: each panel picks its own document from its own title, so
  // the panels ARE the state and there is nothing else left to disagree with them.
  const compareState = () => page.evaluate(() => ({
    panes: document.querySelectorAll(".document-panel").length,
    resizers: document.querySelectorAll(".document-grid .column-resizer").length,
    titles: [...document.querySelectorAll(".document-name")].map(t => t.textContent.trim()),
    pickers: document.querySelectorAll(".document-picker").length,
    a: document.querySelectorAll(".document-panel")[0]?.dataset.documentId,
    b: document.querySelectorAll(".document-panel")[1]?.dataset.documentId,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  /* Choose a document for one side, through the control a reader would use.
   * Indexed on the panels rather than with :nth-of-type, which counts among
   * siblings of the same element type and so is thrown by the resizer div
   * sitting between the two panels. */
  const pickerFor = side =>
    page.locator(".document-panel").nth(side === "a" ? 0 : 1).locator(".document-picker");

  const pick = async (side, id) => {
    await pickerFor(side).click();
    await page.waitForTimeout(150);
    await page.click(`.spec-choice[data-spec="${id}"]`);
    await page.waitForTimeout(300);
  };

  await load(base, "?compare=1");
  let c = await compareState();
  check(c.panes === 2 && c.resizers === 1,
    "compare renders exactly two panes and one boundary", `${c.panes} panes, ${c.resizers} resizers`);
  check(c.overflow === 0, "compare does not overflow the page", `${c.overflow}px`);
  check(c.pickers === 2, "each pane carries its own document picker", `${c.pickers} pickers`);
  check(c.a !== c.b, "the two sides are never the same document", `${c.a} / ${c.b}`);

  {
    await pickerFor("a").click();
    await page.waitForTimeout(150);
    const options = await page.evaluate(() =>
      [...document.querySelectorAll(".spec-choice")].map(o => o.dataset.spec));
    check(options.length === fixtureDocs.length,
      "the picker offers every registered document", options.join(","));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }

  // Choosing the user spec must actually swap a pane, and survive into the URL.
  await pick("b", DOC_B);
  c = await compareState();
  check(c.b === DOC_B && c.titles.some(t => /Second/i.test(t)),
    "choosing a document renders it as the second pane", c.titles.join(" | "));
  check(new URL(page.url()).searchParams.get("compare-with") === `${c.a},${DOC_B}`,
    "the chosen pair is written to ?compare-with=", new URL(page.url()).searchParams.get("compare-with"));

  // A shared link restores the pair.
  await load(base, `?compare=1&compare-with=${DOC_B},${DOC_ID}`);
  c = await compareState();
  check(c.a === DOC_B && c.b === DOC_ID,
    "?compare-with= restores the pair from a shared link", `${c.a} / ${c.b}`);

  // Choosing the document already on the other side swaps rather than duplicating.
  await pick("a", DOC_ID);
  c = await compareState();
  check(c.a === DOC_ID && c.b !== DOC_ID,
    "picking the other side's document swaps them instead of duplicating", `${c.a} / ${c.b}`);

  // A stale or nonsense pair degrades to the first two documents rather than breaking.
  await load(base, "?compare=1&compare-with=nope,alsonope");
  c = await compareState();
  check(c.panes === 2 && c.a !== c.b,
    "an unknown ?compare-with= falls back to two real documents", `${c.a} / ${c.b}`);
  check(pageErrors.length === 0, "compare picker: no console errors", pageErrors.join("; "));

}

// =============================================================================
console.log("== Navigation: exactly one entry marks the page you are on ==")
{
  await load(base, "");
  const selfLinks = await page.evaluate(() =>
    [...document.querySelectorAll("nav a")]
      .filter(a => a.getAttribute("aria-current") === "page").length);
  check(selfLinks === 1,
    "exactly one nav entry marks the page you are on", `${selfLinks} entries`);
  check(pageErrors.length === 0, "navigation: no console errors", pageErrors.join("; "));
}

// =============================================================================
console.log("== Reader: interactions (Tier-2) ==");
await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
{
  await page.focus("#sidebar-resizer");
  await page.keyboard.press("Home");
  const atHome = await page.evaluate(() =>
    document.querySelector("#sidebar-resizer").getAttribute("aria-valuenow"));
  await page.keyboard.press("End");
  const atEnd = await page.evaluate(() =>
    document.querySelector("#sidebar-resizer").getAttribute("aria-valuenow"));
  check(atHome === "200" && Number(atEnd) > Number(atHome),
    "sidebar resizer: keyboard Home/End resize", `${atHome} -> ${atEnd}`);
}
await at("?compare=1");
{
  const widths = () => page.evaluate(() =>
    [...document.querySelectorAll(".document-resizer")].map(r =>
      Number(r.getAttribute("aria-valuenow"))));
  const before = await widths();
  const first = page.locator(".document-resizer").first();
  await first.press("ArrowRight");
  const afterRight = await widths();
  await first.press("Home");
  const afterHome = await widths();
  check(before.length === 1 && afterRight[0] !== before[0] && afterHome[0] !== afterRight[0],
    "compare: the single boundary responds to the keyboard",
    JSON.stringify({ before, afterRight, afterHome }));
}
await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
{
  const collapsed = () => page.evaluate(() =>
    document.querySelectorAll(".section-collapsed").length);
  const c0 = await collapsed();
  await page.click(".document-focus-toggle");
  await page.waitForTimeout(250);
  const c1 = await collapsed();
  await page.click(".document-focus-toggle");
  await page.waitForTimeout(250);
  const c2 = await collapsed();
  check(c0 !== c1 && c2 === c0,
    "document focus toggle collapses/expands sections (reversible)",
    `${c0} -> ${c1} -> ${c2} collapsed`);
}
await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
{
  const counter = () => page.evaluate(() =>
    document.querySelector(".passage-count").textContent.trim());
  const before = await counter();
  await page.locator(".next-passage").first().click();
  await page.waitForTimeout(250);
  const after = await counter();
  check(after !== before, "next-passage advances the passage counter",
    `${before} -> ${after}`);
}
await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
{
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#download-passages"),
  ]);
  const exportPath = join(tmpdir(), "export-check.md");
  await download.saveAs(exportPath);
  const text = readFileSync(exportPath, "utf8");
  check(text.includes("say what it means"),
    "export downloads markdown containing the selected passages", `${text.length} chars`);
}
await at("");
{
  // The one the reader did not open on: clicking the selected behaviour unticks
  // it, which takes it out of the URL rather than putting it in.
  await page.evaluate(() => {
    [...document.querySelectorAll(".behaviour-option")]
      .find(l => l.textContent.includes("Undefined behaviour")).click();
  });
  await page.waitForTimeout(300);
  const search = await page.evaluate(() => decodeURIComponent(location.search));
  check(search.includes(UNDEFINED),
    "clicking a sidebar behaviour syncs it into ?behavior=", search);
}

// =============================================================================
console.log("== Reader: compare toggle (click path) ==");
// The URL path into compare is covered above; this is the button a reader
// actually clicks, from an ordinary one-document view.
await load(base, "?behavior=${DEFINED}");
await page.click(".compare-toggle");
await page.waitForTimeout(250);
{
  const out = await page.evaluate(() => ({
    pressed: document.querySelector(".compare-toggle").getAttribute("aria-pressed"),
    comparing: document.querySelector("#document-reader").classList.contains("compare"),
  }));
  check(out.pressed === "true" && out.comparing,
    "clicking the compare toggle switches to the compare view");
}

// =============================================================================
await browser.close();
server.close();
console.log(failures ? `${failures} FAILURES` : "ALL FEATURE CHECKS PASSED.");
process.exit(failures ? 1 : 0);
