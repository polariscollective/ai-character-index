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
import { serveReaderRoute, CURRENT_PUBLICATION, DRAFT_PUBLICATION } from "./reader-routes.mjs";

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
// The draft publication's own documents, served only to a pin on DRAFT_PUBLICATION.
const draftDocs = JSON.parse(readFileSync(join(DATA, "draft", "documents.json"), "utf8")).documents;
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
  // The documents fall back with the payload: a pinned documents request would
  // 404 the same way, and a reader that asked for it would have nothing to show.
  const fellBack = await page.evaluate(() =>
    document.querySelector(".document-panel")?.dataset.documentId ?? null);
  check(fixtureDocs.some(doc => doc.id === fellBack),
    "a pin that falls back reads the current publication's documents too", String(fellBack));
}

await at("?publication=behaviours-v5-reader");
check(pageErrors.length === 0 && (await sidebar()).includes("Defined behaviour"),
  "a pin that is not a uuid is refused and degrades to the current one (no error)",
  pageErrors.join("; "));

/* A pinned draft reads its documents from the publication it names. The reader
 * used to fetch the documents unpinned and pair the draft's payload with the
 * current publication's documents. Since documents became per publication their
 * ids carry a version, so nothing matched: every tier read 0, and ?spec= was
 * rewritten to a document the draft does not carry. */
await at(`?publication=${DRAFT_PUBLICATION}`);
{
  const draftIds = draftDocs.map(doc => doc.id);
  const currentIds = fixtureDocs.map(doc => doc.id);
  const seen = await page.evaluate(() => ({
    panels: [...document.querySelectorAll(".document-panel")].map(panel => panel.dataset.documentId),
    labs: [...document.querySelectorAll(".provider-tab")].map(button => button.dataset.lab),
    passages: document.querySelectorAll("[data-passage-id]").length,
    tierCounts: [...document.querySelectorAll(".document-panel .tier-toggle")]
      .reduce((total, button) => total + Number((button.textContent.match(/\((\d+)\)/) || [])[1] || 0), 0),
    spec: new URL(location.href).searchParams.get("spec"),
    sidebar: document.querySelector("#behaviour-list")?.textContent || "",
  }));
  const errors = [...pageErrors];
  await page.click(".document-picker");
  await page.waitForTimeout(150);
  const offered = await page.evaluate(() =>
    [...document.querySelectorAll(".spec-choice")].map(option => option.dataset.spec));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check(seen.sidebar.includes("Draft behaviour"),
    "a pin on a draft publication loads its payload", seen.sidebar.replace(/\s+/g, " ").slice(0, 80));
  check(seen.panels.length === 1 && draftIds.includes(seen.panels[0]) && seen.spec === seen.panels[0],
    "a pinned draft opens on one of its own documents, and ?spec= names it",
    `panels ${seen.panels.join(", ")}; spec=${seen.spec}`);
  check(seen.passages > 0 && seen.tierCounts > 0,
    "a pinned draft's passages render on its documents, and its tiers count them",
    `${seen.passages} passages, tier counts sum to ${seen.tierCounts}`);
  const shown = [...seen.panels, ...offered, seen.spec];
  check(offered.length > 0
      && shown.every(id => draftIds.includes(id))
      && !shown.some(id => currentIds.includes(id))
      && seen.labs.length > 0 && seen.labs.every(lab => draftDocs.some(doc => doc.lab === lab)),
    "a pinned draft never shows the current publication's documents",
    `offered ${offered.join(", ")}; publishers ${seen.labs.join(", ")}`);
  check(errors.length === 0, "a pinned draft: no console errors", errors.join("; "));
}

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
  const ticked = await page.evaluate(() => [...document.querySelectorAll("[data-behaviour]")]
    .filter(input => input.checked).map(input => input.dataset.behaviour));
  check(ticked.join(",") === DEFINED, "?behavior= ticks the defined behaviour in the menu",
    ticked.join(","));
  // The strip under the header that repeated the selection and the definition is
  // gone. The definition is read in the behaviour's note, beside its name.
  await page.click(`[data-behaviour-note="${DEFINED}"]`);
  await page.waitForTimeout(150);
  const note = await page.evaluate(() => document.querySelector("#key-note-body")?.textContent || "");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check(note.includes("say what it means"),
    "the behaviour's definition is read in its note in the menu",
    note.replace(/\s+/g, " ").slice(0, 60));
}
await at("?behavior=no-such-behaviour");
check(pageErrors.length === 0 && (await page.evaluate(() =>
  document.querySelectorAll(".document-panel").length === 1
  && !document.querySelector(".passage-count").textContent.startsWith("Loading"))),
  "unknown ?behavior= still opens a document, without errors",
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
  // Reading one document, the full sentence is the counter everyone sees; the
  // short N/M form is compare mode's, where the row has half the width.
  const counters = await page.evaluate(() => {
    const full = document.querySelector(".passage-count");
    const short = document.querySelector(".passage-count-short");
    const box = full.getBoundingClientRect();
    return {
      full: full.textContent,
      fullShown: box.width > 1 && box.height > 1 && getComputedStyle(full).clip === "auto",
      shortShown: short ? getComputedStyle(short).display !== "none" : null,
    };
  });
  check(counters.fullShown && /^\d+ of \d+ passages$/.test(counters.full) && counters.shortShown === false,
    "one document: the full passage counter shows, and the compact one does not",
    JSON.stringify(counters));
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
  check(c.a !== c.b, "the opening pair is two different documents", `${c.a} / ${c.b}`);

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

  // A tier toggle rebuilds both headers too. With one document on both sides its
  // id cannot say which side pressed the toggle, so focus has to go back by
  // position, to the side that pressed it.
  await at(`?compare=1&compare-with=${DOC_ID},${DOC_ID}&behavior=${DEFINED}`);
  for (const side of [1, 0]) {
    await page.locator(".document-panel").nth(side)
      .locator('.tier-toggle[data-tier="related"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const focus = await page.evaluate(() => {
      const panels = [...document.querySelectorAll(".document-panel")];
      const focused = document.activeElement;
      return {
        tier: focused?.dataset?.tier ?? null,
        side: panels.indexOf(focused?.closest?.(".document-panel")),
      };
    });
    check(focus.tier === "related" && focus.side === side,
      `comparing one document twice, a tier toggle pressed on the ${side ? "right" : "left"}`
        + " keeps focus on that side", JSON.stringify(focus));
  }
  check(pageErrors.length === 0, "publishers: no console errors", pageErrors.join("; "));
}

// =============================================================================
console.log("== Reader: a document chosen in a panel opens at its top ==");
/* A panel's scroll belongs to the document in it. Choosing another document
 * opens that one at its top, and the other panel stays where its reader is; the
 * same document drawn again keeps its place. Checked with a contents link
 * followed first, because the heading it puts in the URL is what the rebuild
 * used to scroll back to. The Zenith guidelines are long enough to scroll, so a
 * panel reading 0 there is at its top and not merely unable to move; nothing is
 * ticked for the switches, so no section is folded away. */
{
  const [labA, labB] = [...new Set(fixtureDocs.map(doc => doc.lab))];
  const newestOf = lab => fixtureDocs.filter(doc => doc.lab === lab)
    .sort((a, b) => String(b.version).localeCompare(String(a.version)))[0].id;
  const scrolls = () => page.evaluate(() => [...document.querySelectorAll(".document-panel")]
    .map(panel => {
      const scroll = panel.querySelector(".document-scroll");
      return { id: panel.dataset.documentId, top: Math.round(scroll.scrollTop),
               range: scroll.scrollHeight - scroll.clientHeight };
    }));
  const scrollSide = (side, fraction) => page.evaluate(([side, fraction]) => {
    const scroll = document.querySelectorAll(".document-scroll")[side];
    scroll.scrollTo({ top: Math.round((scroll.scrollHeight - scroll.clientHeight) * fraction),
                      behavior: "instant" });
  }, [side, fraction]);
  const settle = () => page.waitForTimeout(600);
  const same = (a, b, range) => Math.abs(a - b) <= Math.max(4, range * 0.02);

  // By keyboard, on the right, after a contents link was followed on the left.
  await at(`?compare=1&compare-with=${DOC_ID},${DOC_ID}&behavior=`);
  await page.evaluate(() => document.querySelectorAll(".document-panel")[0]
    .querySelector('.document-body a[href^="#"]').click());
  await settle();
  await scrollSide(0, 0.3);
  await scrollSide(1, 0.7);
  await settle();
  let before = await scrolls();
  await page.locator(".document-panel").nth(1).locator(`.provider-tab[data-lab="${labB}"]`).focus();
  await page.keyboard.press("Enter");
  await settle();
  let after = await scrolls();
  const hash = await page.evaluate(() => location.hash);
  check(after[1].id === newestOf(labB) && after[1].range > 200 && after[1].top === 0,
    "comparing, a publisher chosen by keyboard on the right opens its document at the top",
    `hash ${hash}; right ${before[1].id} at ${before[1].top} -> ${after[1].id} at ${after[1].top} of ${after[1].range}`);
  check(after[0].id === before[0].id && same(after[0].top, before[0].top, after[0].range),
    "comparing, a switch on the right leaves the left panel where its reader is",
    `left ${before[0].top} -> ${after[0].top} of ${after[0].range}`);

  // By click, on the left.
  await at(`?compare=1&compare-with=${DOC_ID},${DOC_ID}&behavior=`);
  await scrollSide(0, 0.7);
  await scrollSide(1, 0.4);
  await settle();
  before = await scrolls();
  await page.locator(".document-panel").nth(0).locator(`.provider-tab[data-lab="${labB}"]`).click();
  await settle();
  after = await scrolls();
  check(after[0].id === newestOf(labB) && after[0].range > 200 && after[0].top === 0,
    "comparing, a publisher clicked on the left opens its document at the top",
    `left ${before[0].id} at ${before[0].top} -> ${after[0].id} at ${after[0].top} of ${after[0].range}`);
  check(after[1].id === before[1].id && same(after[1].top, before[1].top, after[1].range),
    "comparing, a switch on the left leaves the right panel where its reader is",
    `right ${before[1].top} -> ${after[1].top} of ${after[1].range}`);

  // One document on screen.
  await at(`?spec=${DOC_ID}&behavior=`);
  await scrollSide(0, 0.6);
  await settle();
  before = await scrolls();
  await page.locator(`.provider-tab[data-lab="${labB}"]`).click();
  await settle();
  after = await scrolls();
  check(after[0].id === newestOf(labB) && after[0].range > 200 && after[0].top === 0,
    "reading one document, a publisher chosen opens its document at the top",
    `${before[0].id} at ${before[0].top} -> ${after[0].id} at ${after[0].top} of ${after[0].range}`);

  // The same document drawn again keeps its place: a tier toggle rebuilds both
  // panels, and neither reader should lose the line they were on.
  await at(`?compare=1&compare-with=${DOC_ID},${DOC_ID}&behavior=${DEFINED}`);
  await scrollSide(0, 0.3);
  await scrollSide(1, 0.6);
  await settle();
  before = await scrolls();
  await page.locator(".document-panel").nth(1).locator('.tier-toggle[data-tier="related"]').click();
  await settle();
  after = await scrolls();
  check(before.every(side => side.top > 0)
      && after.every((side, i) => side.id === before[i].id
        && Math.abs(side.top - before[i].top) <= Math.max(4, side.range * 0.1)),
    "comparing, a tier toggle keeps both panels where their readers are",
    before.map((side, i) => `${side.top} -> ${after[i].top} of ${after[i].range}`).join(", "));
  await page.locator(".document-panel").nth(1).locator('.tier-toggle[data-tier="related"]').click();
  await settle();
  check(labA !== labB && pageErrors.length === 0, "switching documents: no console errors",
    pageErrors.join("; "));
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
  /* The sidebar's own header row and each document panel's first row, its
   * publishers with Compare at the right of the last panel's, sit side by side,
   * so their bottom rules fall on one line: expanded or collapsed (the arrow
   * button, not a class swapped in by the walker), one document or two, at a
   * wide and a narrow desktop width. The strip of behaviour tags that used to
   * hold that line, and Compare with it, is gone. */
  const topRows = () => page.evaluate(() => {
    const panels = [...document.querySelectorAll(".document-panel")];
    const toggle = document.querySelector("#compare-toggle");
    const lastRow = panels.at(-1)?.querySelector(".provider-row");
    const tabs = panels.at(-1)?.querySelector(".provider-tabs");
    const t = toggle?.getBoundingClientRect();
    const r = lastRow?.getBoundingClientRect();
    const g = tabs?.getBoundingClientRect();
    return {
      sidebar: document.querySelector(".sidebar-intro").getBoundingClientRect().bottom,
      rows: panels.map(panel => panel.querySelector(".provider-row")?.getBoundingClientRect().bottom ?? null),
      strip: Boolean(document.querySelector(".finding-bar, .behaviour-chip, #finding-behaviour")),
      toggle: toggle && r && g ? {
        inRow: lastRow.contains(toggle),
        visible: t.width > 0 && t.height > 0,
        rightOfTabs: Math.round(t.left - g.right),
        withinRow: t.top >= r.top && t.bottom <= r.bottom && t.right <= r.right,
      } : null,
    };
  });
  const setMenu = async open => {
    if ((await page.getAttribute("#sidebar-toggle", "aria-expanded")) !== String(open)) {
      await page.click("#sidebar-toggle");
      await page.waitForTimeout(200);
    }
  };
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    for (const [mode, query] of [
      ["one document", `?behavior=${DEFINED}&spec=${DOC_ID}`],
      ["compare", `?behavior=${DEFINED}&compare=1&compare-with=${DOC_ID},${DOC_B}`],
    ]) {
      await at(query);
      await setMenu(true);
      const expanded = await topRows();
      await setMenu(false);
      const collapsed = await topRows();
      await setMenu(true);
      const off = seen => seen.rows.map(bottom => (bottom === null ? Infinity : Math.abs(bottom - seen.sidebar)));
      check([...off(expanded), ...off(collapsed)].every(diff => diff <= 1),
        `${mode} ${width}x${height}: the sidebar's rule and each panel's publisher row rule are one line,`
          + " expanded and collapsed",
        `expanded ${off(expanded).map(d => d.toFixed(2)).join("/")}px,`
          + ` collapsed ${off(collapsed).map(d => d.toFixed(2)).join("/")}px`);
      check(!expanded.strip && !collapsed.strip,
        `${mode} ${width}x${height}: no strip of behaviour tags under the header`);
      check([expanded.toggle, collapsed.toggle].every(seen =>
          seen?.inRow && seen.visible && seen.rightOfTabs >= 0 && seen.withinRow),
        `${mode} ${width}x${height}: Compare sits at the right of the publishers, on their row`,
        JSON.stringify({ expanded: expanded.toggle, collapsed: collapsed.toggle }));
    }
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
      // The compact counter: "3/12" after the arrows, while "3 of 12 passages"
      // stays the counter a screen reader reads.
      const counter = panel.querySelector(".passage-count-short");
      const full = panel.querySelector(".passage-count");
      const next = panel.querySelector(".next-passage").getBoundingClientRect();
      const cRect = counter?.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const anchors = panel._anchors || [];
      const position = anchors.length ? `${panel._passageIndex + 1}/${anchors.length}` : "0/0";
      return {
        counter: counter ? {
          text: counter.textContent,
          position,
          // Visible: a box with area that the browser draws, not clipped away
          // the way the full counter is in compare mode.
          visible: cRect.width > 0 && cRect.height > 0 && counter.checkVisibility({ visibilityProperty: true })
            && getComputedStyle(counter).clip === "auto",
          inside: cRect.left >= headerRect.left && cRect.right <= headerRect.right
            && cRect.top >= headerRect.top && cRect.bottom <= headerRect.bottom,
          afterArrows: cRect.left - next.right,
          centreDiff: (cRect.top + cRect.bottom) / 2 - (next.top + next.bottom) / 2,
          spoken: full.textContent,
          spokenMatches: anchors.length
            ? full.textContent === `${panel._passageIndex + 1} of ${anchors.length} passages`
            : !/\d/.test(full.textContent),
          hiddenFromScreenReaders: counter.getAttribute("aria-hidden") === "true",
        } : null,
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
    // The passage counter came back in compare mode, compact: visible in both
    // panels, on the arrows' row and to their right, saying where the walk is.
    const counterDetail = measured.map(p => `${p.documentId} ${JSON.stringify(p.counter)}`).join("; ");
    check(measured.every(p => p.counter?.visible && p.counter.inside),
      `compare ${width}x${height}: the passage counter is visible in both panels, not clipped`,
      counterDetail);
    check(measured.every(p => p.counter && p.counter.afterArrows >= 0 && p.counter.afterArrows <= 12
        && Math.abs(p.counter.centreDiff) <= 3),
      `compare ${width}x${height}: the counter sits on the arrows' row, just to their right`,
      counterDetail);
    check(measured.every(p => p.counter && p.counter.text === p.counter.position
        && p.counter.spokenMatches && p.counter.hiddenFromScreenReaders),
      `compare ${width}x${height}: the counter reads N/M for the passage position,`
        + " and the full sentence stays what a screen reader hears", counterDetail);
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
