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
// Carries a translation band; DOC_ID does not, which is the pair the header
// layout check below wants: one panel with the band, one without.
const DOC_TRANSLATED = fixtureDocs.find(doc => doc.translation)?.id;
const DEFINED = "defined-behaviour";
const UNDEFINED = "undefined-behaviour";

// --- Serve the staged site ----------------------------------------------------
const server = createServer(async (req, res) => {
  // Answered from the staged tree's own payloads, so the fixture index is
  if (await serveReaderRoute(req, res, DATA, "behaviours")) return;
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (path.endsWith("/")) path += "index.html";
  // The same rewrite next.config.mjs carries: a prose page's address is a name,
  // not the file it happens to be stored in.
  if (!extname(path)) path += ".html";
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
await definedAll("");                       // default bands: all three
{
  const n = await cards();
  check(n === 2, "default bands: all three show, so the lone related vote renders beside the core one",
    `${n} cards`);
  const tiers = new URL(page.url()).searchParams.get("tiers");
  check(tiers === "defining,core,related", "the default bands are written to ?tiers=", tiers);
}
await definedAll("&tiers=defining,core");
check((await cards()) === 1, "an explicit ?tiers= still wins: leaving related out hides the related vote");
// The toggles still narrow the default view band by band, and give each band back.
await definedAll("");
{
  const toggle = tier => `.document-panel .tier-toggle[data-tier="${tier}"]`;
  const press = async tier => {
    await page.click(toggle(tier));
    await page.waitForTimeout(250);
    return {
      cards: await cards(),
      tiers: new URL(page.url()).searchParams.get("tiers"),
      pressed: await page.getAttribute(toggle(tier), "aria-pressed"),
    };
  };
  let seen = await press("related");
  check(seen.cards === 1 && seen.tiers === "defining,core" && seen.pressed === "false",
    "the related toggle hides the related band", JSON.stringify(seen));
  seen = await press("related");
  check(seen.cards === 2 && seen.tiers === "defining,core,related" && seen.pressed === "true",
    "pressed again, the related toggle shows it", JSON.stringify(seen));
  seen = await press("defining");
  check(seen.cards === 1 && seen.tiers === "core,related" && seen.pressed === "false",
    "the defining toggle hides the defining band and leaves related", JSON.stringify(seen));
  seen = await press("defining");
  check(seen.cards === 2 && seen.pressed === "true",
    "pressed again, the defining toggle shows it", JSON.stringify(seen));
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
  check(out.link === "Show original",
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
    // The documents of this side's own publisher. Another lab is chosen in the
    // row of publishers above, so the picker does not repeat it.
    const sameLab = fixtureDocs.filter(doc => doc.lab === fixtureDocs[0].lab);
    check(options.length === sameLab.length,
      "the picker offers every document of the side's publisher", options.join(","));
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

  // Choosing the document already on the other side puts it on both sides. It
  // used to swap the two instead, which quietly undid the choice the reader had
  // just made; the operator asked that either side take any document, including
  // the one already opposite.
  await pick("a", DOC_ID);
  c = await compareState();
  check(c.a === DOC_ID && c.b === DOC_ID,
    "picking the other side's document puts it on both sides", `${c.a} / ${c.b}`);

  // A stale or nonsense pair degrades to the first two documents rather than breaking.
  await load(base, "?compare=1&compare-with=nope,alsonope");
  c = await compareState();
  check(c.panes === 2 && c.a !== c.b,
    "an unknown ?compare-with= falls back to two real documents", `${c.a} / ${c.b}`);
  check(pageErrors.length === 0, "compare picker: no console errors", pageErrors.join("; "));

}

// =============================================================================
console.log("== Reader: publishers ==");
/* The row of publishers above each document. Choosing one rebuilds the reader,
 * which re-clones the header the control lives in, so focus has to be put back
 * or a keyboard user is dropped at the top of the page. They are buttons in a
 * labelled group rather than tabs: a tablist promises arrow keys and a roving
 * tabindex, and a promise the page does not keep is worse than none. */
{
  const labs = [...new Set(fixtureDocs.map(doc => doc.lab))];
  check(labs.length >= 2, "the fixture carries two publishers, so switching between them is tested",
    labs.join(", "));
  const [home, other] = labs;
  const otherDocs = fixtureDocs.filter(doc => doc.lab === other)
    .sort((a, b) => String(b.version).localeCompare(String(a.version)));

  const publishers = () => page.evaluate(() => {
    const panels = [...document.querySelectorAll(".document-panel")];
    const focused = document.activeElement;
    return {
      groups: [...document.querySelectorAll(".provider-tabs")].map(group =>
        `${group.getAttribute("role")}: ${group.getAttribute("aria-label")}`),
      tabRoles: document.querySelectorAll('[role="tab"], [role="tablist"]').length,
      panels: panels.map(panel => ({
        id: panel.dataset.documentId,
        pressed: [...panel.querySelectorAll('.provider-tab[aria-pressed="true"]')]
          .map(button => button.dataset.lab).join(","),
      })),
      focus: {
        publisher: Boolean(focused?.matches?.(".provider-tab")),
        lab: focused?.dataset?.lab ?? null,
        side: panels.indexOf(focused?.closest?.(".document-panel")),
      },
    };
  });

  await at(`?spec=${DOC_ID}`);
  let seen = await publishers();
  check(seen.groups.join(" | ") === "group: Publisher" && seen.tabRoles === 0,
    "the publishers are a labelled group of buttons, not tabs", seen.groups.join(" | "));
  check(seen.panels[0].pressed === home, "the publisher being read is the pressed one",
    seen.panels[0].pressed);

  // By keyboard: focus a publisher, press Enter.
  await page.focus(`.provider-tab[data-lab="${other}"]`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  seen = await publishers();
  check(seen.panels[0].id === otherDocs[0].id && seen.panels[0].pressed === other,
    "Enter on a publisher opens its newest document", `${seen.panels[0].id}, pressed ${seen.panels[0].pressed}`);
  check(seen.focus.publisher && seen.focus.lab === other && seen.focus.side === 0,
    "focus lands back on the publisher just chosen", JSON.stringify(seen.focus));

  await page.click(".document-picker");
  await page.waitForTimeout(150);
  const options = await page.evaluate(() =>
    [...document.querySelectorAll(".spec-choice")].map(option => option.dataset.spec));
  check(options.join(",") === otherDocs.map(doc => doc.id).join(","),
    "the document picker lists that publisher's documents, newest first, and no other's",
    options.join(", "));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // Comparing, each side has its own group, named for its side, and the side that
  // chose keeps the focus.
  await at(`?compare=1&compare-with=${DOC_ID},${DOC_B}`);
  seen = await publishers();
  check(seen.groups.join(" | ")
      === "group: Publisher, left document | group: Publisher, right document",
    "comparing, each side's publishers are named for their side", seen.groups.join(" | "));
  await page.locator(".document-panel").nth(1).locator(`.provider-tab[data-lab="${other}"]`).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  seen = await publishers();
  check(seen.panels[0].id === DOC_ID && seen.panels[1].id === otherDocs[0].id,
    "comparing, a publisher chosen on the right changes the right side only",
    seen.panels.map(panel => panel.id).join(" | "));
  check(seen.focus.publisher && seen.focus.lab === other && seen.focus.side === 1,
    "comparing, focus lands back on the right side's publisher", JSON.stringify(seen.focus));
  check(pageErrors.length === 0, "publishers: no console errors", pageErrors.join("; "));
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
{
  // The sidebar's own header row and the reader's finding bar sit side by
  // side, so their bottom rules have to fall on the same line -- expanded or
  // collapsed (the arrow button, not a class swapped in by the walker), at a
  // wide and a narrow desktop width.
  const dividerBottoms = () => page.evaluate(() => ({
    sidebar: document.querySelector(".sidebar-intro").getBoundingClientRect().bottom,
    finding: document.querySelector(".finding-bar").getBoundingClientRect().bottom,
  }));
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
    const expanded = await dividerBottoms();
    await page.click("#sidebar-toggle");
    await page.waitForTimeout(200);
    const collapsed = await dividerBottoms();
    const diffExpanded = Math.abs(expanded.sidebar - expanded.finding);
    const diffCollapsed = Math.abs(collapsed.sidebar - collapsed.finding);
    check(diffExpanded <= 1 && diffCollapsed <= 1,
      `sidebar/finding-bar dividers align at ${width}x${height}, expanded and collapsed`,
      `expanded diff ${diffExpanded.toFixed(2)}px, collapsed diff ${diffCollapsed.toFixed(2)}px`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
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
{
  // The passage arrows sit below the name/version/Show original row, on a
  // row of their own shared with the tier toggles, arrows first at the
  // left -- whatever wrapped above: a long title, a translation band on one
  // side only (it sits below the header, not in it, so it cannot move this
  // row), a narrower half. Checked at both viewports, for a pair where one
  // side carries the translation band and the other does not and with a
  // behaviour selected (so the tier toggles carry counts and the passage
  // counter reads "N of M", the widest either gets), so a shared answer
  // cannot be an accident of both panels wrapping alike or of an empty,
  // narrow-text state. The resizer tests just above leave an off-centre
  // compare split and a widened sidebar in localStorage; reset both so the
  // panels start from the defaults this check means to cover.
  await page.evaluate(() => {
    localStorage.setItem("aci-compare-first", "50");
    localStorage.removeItem("aci-sidebar-width");
  });
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await at(`?compare=1&compare-with=${DOC_TRANSLATED},${DOC_ID}`
      + `&behavior=${DEFINED}&tiers=defining,core,related`);
    const measured = await page.evaluate(() => [...document.querySelectorAll(".document-panel")].map(panel => {
      const header = panel.querySelector(".document-header");
      const documentRow = panel.querySelector(".document-row");
      const nav = panel.querySelector(".passage-nav");
      const legend = panel.querySelector(".rail-legend");
      const style = getComputedStyle(header);
      const rowRect = documentRow.getBoundingClientRect();
      const nRect = nav.getBoundingClientRect();
      const lRect = legend.getBoundingClientRect();
      return {
        documentId: panel.dataset.documentId,
        hasBand: !panel.querySelector(".document-translation").hidden,
        // Left edge against the header's own content-left (its border box
        // left plus its own padding), not the viewport, so this holds
        // however the two panels are split.
        leftDiff: nRect.left - (header.getBoundingClientRect().left + parseFloat(style.paddingLeft)),
        // Both arrows and toggles must clear the name/version/Show original
        // row -- that row's own bottom already includes Show original where
        // it is present.
        navBelowIdentity: nRect.top - rowRect.bottom,
        legendBelowIdentity: lRect.top - rowRect.bottom,
        // Sharing one row: vertical centres a few px apart, not stacked.
        centreDiff: (nRect.top + nRect.bottom) / 2 - (lRect.top + lRect.bottom) / 2,
      };
    }));
    check(measured.length === 2 && measured.some(p => p.hasBand) && measured.some(p => !p.hasBand),
      `compare header layout ${width}x${height}: fixture pair has one banded panel and one plain one`,
      measured.map(p => `${p.documentId} band=${p.hasBand}`).join(", "));
    check(
      measured.every(p => Math.abs(p.leftDiff) <= 1 && p.navBelowIdentity >= 0 && p.legendBelowIdentity >= 0
        && Math.abs(p.centreDiff) <= 4),
      `compare ${width}x${height}: arrows lead the tier toggles on one row below the name/version row`,
      measured.map(p => `${p.documentId} left ${p.leftDiff.toFixed(1)}px, nav below ${p.navBelowIdentity.toFixed(1)}px,`
        + ` legend below ${p.legendBelowIdentity.toFixed(1)}px, centre diff ${p.centreDiff.toFixed(1)}px`)
        .join("; "));
  }
  await page.setViewportSize({ width: 1280, height: 720 });
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
