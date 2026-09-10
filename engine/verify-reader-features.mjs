#!/usr/bin/env node
// Tier-1 feature harness for the site's spec reader (site/spec-reader/),
// driven against TWO data states: the bundled payloads that ship in the repo,
// and a user-extended staging built by engine/stage_user_demo.py (synthetic
// user spec + set:user behaviour, staged into a scratch copy of site/ -- the
// repo itself is restored untouched). Covers the reader's URL/DOM-state
// features and the user-data path; interactive-only features (resizer drags,
// focus toggles, scroll behaviour) stay manual (Tier 2). The reader's passage
// anchoring against the shipped payload is covered by verify-reader-test.mjs
// and is not repeated here.
//
// Usage:  node engine/verify-reader-features.mjs   (needs Chrome + python3)
// Exits 0 when every check passes, 1 otherwise.

import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ENGINE = join(fileURLToPath(new URL("..", import.meta.url)), "engine");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
               ".md": "text/markdown", ".txt": "text/plain" };

// --- Stage the user-extended site into a scratch dir -------------------------
const scratch = mkdtempSync(join(tmpdir(), "reader-features-"));
const staged = spawnSync("python3", [join(ENGINE, "stage_user_demo.py"), "--out", scratch],
                         { encoding: "utf8" });
if (staged.status !== 0) {
  console.error("staging failed:\n" + staged.stdout + staged.stderr);
  process.exit(2);
}
const stageInfo = JSON.parse(staged.stdout);
const SITE = stageInfo.site;
const USER = stageInfo.userBehaviour;          // acme-transparency
const USER_SPEC = stageInfo.userSpec;          // acme-spec
const PAYLOAD = stageInfo.payload;             // behaviours-<ts>.json
const userPayload = JSON.parse(readFileSync(join(SITE, "spec-reader/data", PAYLOAD), "utf8"));
// The band-filtered keep-set variant: used below to exercise the ?data= pin
// path; untouched by staging.
const keepSet = JSON.parse(readFileSync(join(SITE, "spec-reader/data/behaviours-v5-reader.json"), "utf8")).behaviours;

// --- Serve the staged site ----------------------------------------------------
const server = createServer(async (req, res) => {
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
  const el = document.querySelector("#passage-count");
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
check((await sidebar()).includes("Acme transparency"),
  "default load resolves manifest latest = the user-extended run");
check(pageErrors.length === 0, "default load: no console errors", pageErrors.join("; "));

await at("?data=behaviours");
{
  const sb = await sidebar();
  check(!sb.includes("Acme transparency"), "?data=behaviours pin loads the shipped fallback");
}
await at(`?data=${PAYLOAD.replace(/\.json$/, "")}`);
check((await sidebar()).includes("Acme transparency"),
  "?data=<staged run> pin loads the user-extended run");
await at("?data=manifest.json");
check(pageErrors.length === 0 && (await sidebar()).includes("Acme transparency"),
  "?data=manifest.json is refused as a pin and degrades to manifest latest (no error)",
  pageErrors.join("; "));

// The reader loads the band-filtered keep-set variant (a legal behaviours*
// pin) and runs applyPanelThreshold's full path against the 9-scale + ragged
// shapes.
await at("?data=behaviours-v5-reader&behavior=helpfulness&spec=anthropic"
  + "&tiers=defining,core,related");
await page.waitForTimeout(400);
{
  const expected = new Set(keepSet.find(b => b.slug === "helpfulness")
    .coverage.anthropic.passages.map(p => blockOf(p.locator))).size;
  const anchors = await page.evaluate(
    () => document.querySelectorAll("[data-passage-id]").length);
  const role = await page.evaluate(
    () => document.querySelector(".passage-reason-role")?.textContent ?? "");
  check(anchors === expected, `keep-set pin loads (${expected} helpfulness/anthropic passages)`,
    `${anchors} anchors`);
  check(/score \d+\/9/.test(role), "reader rewrites role fractions to the 9-scale", role.slice(0, 40));
  check(pageErrors.length === 0, "keep-set pin: no console errors",
    pageErrors.join("; "));
}

// =============================================================================
console.log("== Reader: sidebar + behaviour selection ==");
await at("");
{
  const sb = await sidebar();
  check(sb.includes("Behaviours under test"),
    "group header present (user behaviour shares the bundled group spelling)",
    sb.replace(/\s+/g, " ").slice(0, 100));
  check(sb.includes("Helpfulness"), "bundled behaviour present in the user-extended payload");
}
await at(`?behavior=${USER}&spec=${USER_SPEC}&tiers=defining,core,related`);
{
  const finding = await page.evaluate(() => ({
    name: document.querySelector("#finding-behaviour")?.textContent.trim(),
    def: document.querySelector("#finding-definition")?.textContent.trim() || "",
  }));
  check(finding.name === "Acme transparency", "?behavior= selects the user behaviour", finding.name);
  check(finding.def.includes("disclose compute usage"), "user behaviour definition renders");
}
await at("?behavior=no-such-behaviour");
check(pageErrors.length === 0 && (await page.evaluate(() =>
  document.querySelector("#finding-behaviour")?.textContent.trim().length > 0)),
  "unknown ?behavior= degrades to a real behaviour without errors",
  pageErrors.join("; "));

// =============================================================================
console.log("== Reader: tier bands (incl. the single-judge floor, B1) ==");
const acmeAll = q => at(`?behavior=${USER}&spec=${USER_SPEC}${q}`);
await acmeAll("");                       // default bands: defining + core
{
  const n = await cards();
  check(n === 1, "default bands: lone core vote renders, lone related vote waits in the related band", `${n} cards`);
}
await acmeAll("&tiers=defining,core,related");
{
  const n = await cards();
  check(n === 2, "all bands on: the single judge's related vote is reachable", `${n} cards`);
  const role = await page.evaluate(() =>
    [...document.querySelectorAll(".passage")].some(p => /score 2\/2/.test(p.textContent)));
  check(role, "passage card carries the recomputed score text (score 2/2)");
  const countText = await page.evaluate(() =>
    document.querySelector("#passage-count").textContent.trim());
  check(/of 2 passages/.test(countText), "passage counter total tracks the rendered anchors", countText);
}
await acmeAll("&tiers=none");
check((await cards()) === 0, "?tiers=none hides every band");
await acmeAll("&tiers=defining,core,related&related=0");
check((await cards()) === 1, "?related=0 zeroes the lone related vote (weight tuning survives B1)");

// The toggles report what they hold, and a tier this data cannot reach is disabled
// rather than left inert. On the staged single-judge v3w cell the defining cut clamps
// onto the core cut, so core is structurally empty -- the case the counts exist for.
await at(`?behavior=${USER}&spec=${USER_SPEC}&tiers=defining,core,related`);
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
await at(`?behavior=${USER}&spec=${USER_SPEC}&tiers=defining,core,related`);
{
  const href = await page.evaluate(() =>
    document.querySelector(".source-link")?.getAttribute("href") || "");
  check(href === "https://acme.example.com/spec",
    "source link carries the user spec's sourceUrl", href);
  const bodyText = await page.evaluate(() =>
    document.querySelector("#document-reader")?.textContent || "");
  check(bodyText.includes("disclose compute usage"), "user spec text renders behind the cards");
}
await at(`?behavior=${USER}&spec=no-such-spec`);
check(pageErrors.length === 0, "unknown ?spec= degrades to the default document without errors",
  pageErrors.join("; "));
// The list of documents is generated from documents.json and opens from the
// panel's own title, which replaced the row of tabs above the reader.
await at(`?behavior=${USER}`);
await page.click(".document-picker");
await page.waitForTimeout(150);
{
  const options = await page.evaluate(() =>
    [...document.querySelectorAll(".spec-choice")].map(o => o.dataset.spec));
  check(options.includes(USER_SPEC),
    "spec options are generated from documents.json (user spec included)",
    options.join(","));
}
await page.click(`.spec-choice[data-spec="${USER_SPEC}"]`);
await page.waitForTimeout(250);
{
  const href = await page.evaluate(() =>
    document.querySelector(".source-link")?.getAttribute("href") || "");
  check(href === "https://acme.example.com/spec",
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
  check(out.link === "Original ↗",
    "each pane links its own document rather than a shared 'Sources'", out.link);
}
await at("?embedded=1");
check(await page.evaluate(() => document.body.classList.contains("embedded")),
  "?embedded=1 sets the embedded body class");

// =============================================================================
console.log("== Reader: toolbar controls ==");
await at(`?behavior=${USER}&spec=${USER_SPEC}&tiers=defining,core,related`);
{
  const enabled = await page.evaluate(() =>
    !document.querySelector("#download-passages").disabled);
  check(enabled, "export-passages button enabled with a behaviour selected");
  const prevNext = await page.evaluate(() => ({
    prev: !document.querySelector("#previous-passage").disabled,
    next: !document.querySelector("#next-passage").disabled,
  }));
  check(prevNext.prev && prevNext.next, "prev/next passage buttons enabled with anchors present");
}
await at(`?behavior=${USER}&spec=${USER_SPEC}&tiers=defining,core,related`);
await page.click("#clear-behaviours");
await page.waitForTimeout(250);
check((await cards()) === 0, "clear-behaviours empties the view");
await page.click("#select-all-behaviours");
await page.waitForTimeout(250);
check((await cards()) > 0, "select-all-behaviours restores the view");
await at("?behavior=helpfulness");
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
    check(options.length === 3, "the picker offers every registered document", options.join(","));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }

  // Choosing the user spec must actually swap a pane, and survive into the URL.
  await pick("b", USER_SPEC);
  c = await compareState();
  check(c.b === USER_SPEC && c.titles.some(t => /Acme/i.test(t)),
    "choosing the user spec renders it as the second pane", c.titles.join(" | "));
  check(new URL(page.url()).searchParams.get("compare-with") === `${c.a},${USER_SPEC}`,
    "the chosen pair is written to ?compare-with=", new URL(page.url()).searchParams.get("compare-with"));

  // A shared link restores the pair.
  await load(base, `?compare=1&compare-with=${USER_SPEC},openai`);
  c = await compareState();
  check(c.a === USER_SPEC && c.b === "openai",
    "?compare-with= restores the pair from a shared link", `${c.a} / ${c.b}`);

  // Choosing the document already on the other side swaps rather than duplicating.
  await pick("a", "openai");
  c = await compareState();
  check(c.a === "openai" && c.b !== "openai",
    "picking the other side's document swaps them instead of duplicating", `${c.a} / ${c.b}`);

  // A stale or nonsense pair degrades to the first two documents rather than breaking.
  await load(base, "?compare=1&compare-with=nope,alsonope");
  c = await compareState();
  check(c.panes === 2 && c.a !== c.b,
    "an unknown ?compare-with= falls back to two real documents", `${c.a} / ${c.b}`);
  check(pageErrors.length === 0, "compare picker: no console errors", pageErrors.join("; "));

}

// =============================================================================
console.log("== Local mode: a run of your own is marked ==");
// The staged site registers a user specification, so the reader is showing local
// data and should say so. The reader is linked from the site's navs by default;
// local mode adds a status marker only, never a second nav entry for the page
// you are already on.
{
  await load(base, "");
  const out = await page.evaluate(() => ({
    marked: document.body.dataset.localData === "true",
    badge: (document.querySelector("#local-data-note")?.textContent || "").trim(),
    badgeVisible: !!document.querySelector("#local-data-note")?.offsetParent,
    noteInNav: !!document.querySelector('nav #local-data-note'),
    selfLinks: [...document.querySelectorAll("nav a")]
      .filter(a => a.getAttribute("aria-current") === "page").length,
  }));
  check(out.marked, "local data is marked on the document");
  check(out.badgeVisible && /local/i.test(out.badge),
    "a visible note says the data is local", out.badge);
  // A status marker is not a destination. Inside <nav> it reads as a link to
  // anything traversing the list, screen readers included.
  check(!out.noteInNav, "the marker is not inside the navigation list");
  check(out.selfLinks === 1,
    "exactly one nav entry marks the page you are on", `${out.selfLinks} entries`);
  check(pageErrors.length === 0, "local mode: no console errors", pageErrors.join("; "));
}

// =============================================================================
console.log("== Reader: user-extended documents ==");
await load(base, "");
await page.click(".document-picker");
await page.waitForTimeout(150);
{
  const options = await page.evaluate(() =>
    [...document.querySelectorAll(".spec-choice")].map(o => o.dataset.spec));
  check(options.join(",") === `anthropic,openai,${USER_SPEC}`,
    "reader spec options are generated from documents.json, incl. the user spec",
    options.join(","));
}
// Selecting the user spec VIA ITS GENERATED ENTRY renders it.
await page.click(`.spec-choice[data-spec="${USER_SPEC}"]`);
await page.waitForTimeout(250);
{
  const out = await page.evaluate(() => ({
    body: document.querySelector("#document-reader")?.textContent || "",
    passages: document.querySelectorAll("[data-passage-id]").length,
  }));
  check(out.body.includes("disclose compute usage"),
    "clicking the generated user-spec option renders the user doc");
  check(out.passages === 0, "user spec view shows 0 published passages (graceful empty state)");
  check(pageErrors.length === 0, "reader user-spec view: no console errors", pageErrors.join("; "));
}
await page.click(".document-picker");
await page.waitForTimeout(150);
await page.click('.spec-choice[data-spec="anthropic"]');
await page.waitForTimeout(250);
{
  const n = await page.evaluate(() => document.querySelectorAll("[data-passage-id]").length);
  check(n > 0, "clicking a bundled spec option returns to its coverage", `${n} passages`);
}
{
  // Anchoring regression: the staged surface resolves the staged manifest latest,
  // so a published view must anchor exactly the staged run's own coverage.
  const expected = new Set(userPayload.behaviours.find(x => x.slug === "helpfulness")
    .coverage.anthropic.passages.map(p => blockOf(p.locator))).size;
  await load(base, "?behavior=helpfulness&spec=anthropic");
  const seen = await page.evaluate(() =>
    document.querySelectorAll("[data-passage-id]").length);
  check(seen === expected, "staged coverage anchors exactly (helpfulness · anthropic)",
    `${seen}/${expected} passages`);
}

// =============================================================================
console.log("== Reader: interactions (Tier-2) ==");
await at(`?behavior=${USER}&spec=${USER_SPEC}&tiers=defining,core,related`);
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
await at("?behavior=helpfulness&spec=anthropic&tiers=defining,core,related");
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
await at(`?behavior=${USER}&spec=${USER_SPEC}&tiers=defining,core,related`);
{
  const counter = () => page.evaluate(() =>
    document.querySelector("#passage-count").textContent.trim());
  const before = await counter();
  await page.click("#next-passage");
  await page.waitForTimeout(250);
  const after = await counter();
  check(after !== before, "next-passage advances the passage counter",
    `${before} -> ${after}`);
}
await at(`?behavior=${USER}&spec=${USER_SPEC}&tiers=defining,core,related`);
{
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#download-passages"),
  ]);
  const exportPath = join(scratch, "export-check.md");
  await download.saveAs(exportPath);
  const text = readFileSync(exportPath, "utf8");
  check(text.includes("disclose compute usage"),
    "export downloads markdown containing the selected passages", `${text.length} chars`);
}
await at("");
{
  await page.evaluate((user) => {
    const label = [...document.querySelectorAll(".behaviour-option")]
      .find(l => l.textContent.includes("Acme transparency"));
    label.click();
  }, USER);
  await page.waitForTimeout(300);
  const search = await page.evaluate(() => decodeURIComponent(location.search));
  check(search.includes(USER),
    "clicking a sidebar behaviour syncs it into ?behavior=", search);
}

// =============================================================================
console.log("== Reader: compare toggle (click path) ==");
// The URL path into compare is covered above; this is the button a reader
// actually clicks, from an ordinary one-document view.
await load(base, "?behavior=helpfulness");
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
rmSync(scratch, { recursive: true, force: true });
console.log(failures ? `${failures} FAILURES` : "ALL FEATURE CHECKS PASSED.");
process.exit(failures ? 1 : 0);
