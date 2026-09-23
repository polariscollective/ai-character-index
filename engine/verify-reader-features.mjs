#!/usr/bin/env node
// Tier-1 feature harness for the site's spec reader (site/spec-reader/),
// driven against TWO data states: the bundled payloads that ship in the repo,
// against the fixture index served through two of the reader's routes (the
// payload and the documents; the links route is not staged, so the reader
// renders without bubbles). Covers the reader's URL/DOM-state
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
import { serveReaderRoute, serveFeedbackRoute, lastFeedbackReceived,
         servePageFeedbackRoute, lastPageFeedbackReceived,
         CURRENT_PUBLICATION, DRAFT_PUBLICATION, TEN_PUBLICATION } from "./reader-routes.mjs";
import { resolverSource, proveDocument } from "./reader-locator-proof.mjs";

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

/* Nothing is declared missing any more, and the reason is worth keeping.
 *
 * The reader used to ask for three gitignored files -- a run's links and the two
 * kinds of paragraph beside them -- which no checkout carried, so their absence
 * had to be declared here or every machine but the one that generated them
 * failed. They are rows in the database now, asked for at /api/reader/links, and
 * reader-routes.mjs answers that address itself with a 404 for a route it does
 * not stage. It never reaches the file branch below, so the audit never sees it
 * and has nothing to forgive. The reader renders without bubbles, exactly as it
 * did when the files were missing; what the bubbles contain is held to the
 * Python in app/lib/__tests__/links.test.mjs.
 *
 * If that ever changes -- if the fixture router stops answering it -- the audit
 * should fail, which is why there is no allowance left here to hide it. */
/* Every 404 this server emitted, audited at the end. Chrome logs each one into
 * the console, and the collector below cannot tell which file it was: the
 * message carries no URL. So the console line is dropped there and the real
 * check lives here, where the path is known. */
const missingPaths = [];

// --- Serve the staged site ----------------------------------------------------
const server = createServer(async (req, res) => {
  // Answered from the staged tree's own payloads, so the fixture index is
  if (await serveReaderRoute(req, res, DATA, "behaviours")) return;
  // The dialog's own send: a fixture that always accepts, recording what it
  // was sent for the feedback dialog section below to read back.
  if (await serveFeedbackRoute(req, res)) return;
  // The bubble's own send: a fixture that always accepts, recording what it was
  // sent, picture included, for the page-feedback section below to read back.
  if (await servePageFeedbackRoute(req, res)) return;
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  /* The front page is the grid, as next.config.mjs rewrites it. That rewrite is
   * also why site/index.html no longer exists: an array returned from rewrites()
   * is applied after the filesystem, so a real file at / always won and the old
   * redirect into the reader went on being served whatever the config said.
   *
   * Without this line the walker answers 404 for the one address every menu
   * points at, which would be a check on the walker rather than on the page. */
  if (path === "/") path = "/overview.html";
  if (path.endsWith("/")) path += "index.html";
  // The same rewrite next.config.mjs carries: a prose page's address is a name,
  // not the file it happens to be stored in.
  if (!extname(path)) path += ".html";
  try {
    const body = await readFileAsync(join(SITE, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch { missingPaths.push(path); res.writeHead(404).end("not found"); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/spec-reader/`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
let pageErrors = [];
page.on("console", m => {
  // Chrome echoes every 404 here as one fixed sentence carrying no URL, so a
  // file that is meant to be missing and one that has been lost read alike.
  // The audit at the foot tells them apart; this would only report both.
  if (m.type() === "error"
      && m.text() !== "Failed to load resource: the server responded with a status of 404 (Not Found)") {
    pageErrors.push(m.text());
  }
});
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
// The copy icons' tick turns --accent, which differs between the daylight and umber
// palettes, so proving the CSS rule actually won means resolving the token through the
// page itself and comparing computed colour strings, not just checking opacity.
const resolveVar = name => page.evaluate(name => {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}, name);

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

/* A quote that carries its example's code after a short bold intro, flattened into
 * one string, the shape six passages of the Alibaba publication have. The reader
 * renders the intro and the fence as two blocks, so the quote resolves on the intro
 * and the fence is highlighted as its continuation. The draft carries one. */
await at(`?publication=${DRAFT_PUBLICATION}&spec=nadir--charter@2026-08-18`
  + "&behavior=draft-behaviour&tiers=defining,core,related");
{
  const seen = await page.evaluate(() => {
    const status = document.querySelector("#reader-status");
    const anchor = [...document.querySelectorAll("[data-passage-id]")]
      .find(block => /Keep the boundary/.test(block.textContent));
    let code = anchor?.nextElementSibling;
    while (code && !code.classList.contains("code-block")) code = code.nextElementSibling;
    return {
      unresolved: status.classList.contains("visible") ? status.textContent : "",
      anchored: Boolean(anchor),
      codeHighlighted: Boolean(code?.classList.contains("passage")),
    };
  });
  check(seen.unresolved === "" && seen.anchored,
    "a quote carrying its example's code after the intro resolves, with no unresolved anchors",
    JSON.stringify(seen));
  check(seen.codeHighlighted,
    "the example's code block is highlighted as that passage's continuation", JSON.stringify(seen));
}

/* A link to a passage opens the reader at it. The locator names its document by
 * its head, so the reader opens that document whatever ?spec= says, ticks a
 * behaviour that cites the passage and turns on the band it sits in, and puts
 * the passage in view, focused and current for the arrows. The link is not
 * sticky: the first thing the reader does afterwards drops it from the URL. The
 * passage chosen is related, on a document other than the one ?spec= names, for
 * a behaviour the URL does not tick, so the link has all three to do. */
{
  const linked = keepSet.find(behaviour => behaviour.slug === UNDEFINED)
    .coverage["acme--second@2026-02-01"].passages[0];
  const readLink = () => page.evaluate(() => {
    const panel = document.querySelector(".document-panel");
    const current = panel?.querySelector("[data-passage-id].current");
    const scroll = panel?.querySelector(".document-scroll").getBoundingClientRect();
    const box = current?.getBoundingClientRect();
    const status = document.querySelector("#reader-status");
    return {
      document: panel?.dataset.documentId ?? null,
      ticked: [...document.querySelectorAll("[data-behaviour]")]
        .filter(input => input.checked).map(input => input.dataset.behaviour),
      tiers: new URL(location.href).searchParams.get("tiers"),
      currentLocators: current?.dataset.locators?.split("\n") ?? [],
      inView: Boolean(box && box.top >= scroll.top - 1 && box.bottom <= scroll.bottom + 1),
      focused: Boolean(current && current.contains(document.activeElement)),
      shownLocator: current?.querySelector(".passage-locator")?.textContent ?? null,
      status: status.classList.contains("visible") ? status.textContent : "",
      urlPassage: new URL(location.href).searchParams.get("passage"),
    };
  });

  await at(`?passage=${encodeURIComponent(linked.locator)}&spec=${DOC_ID}`
    + `&behavior=${DEFINED}&tiers=defining,core`);
  await page.waitForTimeout(700);   // the passage is scrolled to smoothly
  let seen = await readLink();
  check(seen.document === "acme--second@2026-02-01",
    "a ?passage= link opens the document its locator names, over ?spec=", JSON.stringify(seen));
  check(seen.ticked.includes(UNDEFINED) && (seen.tiers || "").split(",").includes("related"),
    "a ?passage= link ticks a behaviour citing the passage and turns on its band", JSON.stringify(seen));
  check(seen.currentLocators.includes(linked.locator) && seen.inView && seen.focused,
    "the linked passage is current for the arrows, in view and focused", JSON.stringify(seen));
  check(seen.shownLocator === linked.locator,
    "the passage's note shows its locator", JSON.stringify(seen.shownLocator));
  check(seen.status === "" && seen.urlPassage === linked.locator && pageErrors.length === 0,
    "a link that resolves says nothing, and stays in the URL until the reader moves on",
    `${JSON.stringify(seen)} ${pageErrors.join("; ")}`);

  await page.click(`.behaviour-option:has([data-behaviour="${DEFINED}"])`);
  await page.waitForTimeout(250);
  check(new URL(page.url()).searchParams.get("passage") === null,
    "ticking a behaviour afterwards drops ?passage= from the URL", page.url());

  await at(`?passage=${encodeURIComponent(linked.locator)}`);
  await page.waitForTimeout(700);
  await page.locator(".next-passage").first().click();
  await page.waitForTimeout(250);
  check(new URL(page.url()).searchParams.get("passage") === null,
    "stepping to another passage drops ?passage= from the URL too", page.url());

  await at(`?passage=${encodeURIComponent("nowhere--nothing@2026-01-01 > #gone > ¶9")}&spec=${DOC_ID}`);
  seen = await readLink();
  check(/not in this publication/.test(seen.status) && seen.document === DOC_ID && pageErrors.length === 0,
    "a ?passage= the publication does not carry says so, and the reader opens as usual",
    `${JSON.stringify(seen)} ${pageErrors.join("; ")}`);
}

/* Copying a passage's locator, or a link to it. Two small icon buttons in the
 * highlighted block's head, drawn as inline SVG with no icon library and no glyph,
 * hidden until the pointer is over the block or focus is inside it. A copy is said
 * politely for a screen reader. A refused clipboard is not a dead end: what would
 * have been copied is selected in the passage's note instead. A copied link
 * reopens the reader at the passage it was copied from, and a pinned reader's link
 * keeps its publication. */
{
  const stubClipboard = refuse => page.evaluate(refuse => {
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async text => {
        if (refuse) throw new Error("refused");
        window.__copied.push(text);
      } },
    });
  }, refuse);
  const copyButton = kind => page.locator(`[data-passage-id] .passage-copy[data-copy="${kind}"]`).first();
  // "Copied" is the word markCopied (in app.js) puts in the button in place of
  // its own icon: a cheap, exact way to tell the two apart without duplicating
  // the markup here.
  const readIcons = () => page.evaluate(() => {
    const block = document.querySelector("[data-passage-id]");
    const scroll = block.closest(".document-scroll").getBoundingClientRect();
    const head = block.querySelector(".passage-head").getBoundingClientRect();
    const status = document.querySelector("#copy-status");
    return {
      locator: (block.dataset.locators || "").split("\n")[0],
      buttons: [...block.querySelectorAll(".passage-copy")].map(button => {
        const box = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          label: button.getAttribute("aria-label"),
          title: button.title,
          svg: Boolean(button.querySelector("svg")),
          text: button.textContent.trim(),
          opacity: Math.round(Number(style.opacity) * 100) / 100,
          color: style.color,
          copied: button.classList.contains("copied"),
          tick: button.innerHTML.includes("Copied"),
          inHead: box.top >= head.top - 1 && box.bottom <= head.bottom + 1,
          clearOfRail: box.right <= scroll.right - 14,
          motion: style.transitionDuration,
        };
      }),
      status: status?.textContent ?? null,
      polite: status?.getAttribute("aria-live") === "polite",
      copied: window.__copied || [],
      selected: String(getSelection()),
      noteOpen: !block.querySelector(".passage-rationale")?.hidden,
    };
  });
  const awayFromPassages = async () => { await page.mouse.move(2, 700); await page.waitForTimeout(350); };
  const accentColor = await resolveVar("--accent");

  await page.setViewportSize({ width: 1280, height: 720 });
  await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
  await awayFromPassages();
  let seen = await readIcons();
  check(seen.buttons.map(button => button.label).join(",") === "Copy locator,Copy link"
      && seen.buttons.every(button => button.title === button.label && button.svg && button.text === ""
        && button.inHead && button.clearOfRail),
    "a passage carries Copy locator and Copy link as labelled inline-SVG icons in its head, clear of the rail",
    JSON.stringify(seen.buttons));
  check(seen.buttons.length === 2 && seen.buttons.every(button => button.opacity === 0),
    "the copy icons are hidden while the pointer is elsewhere", JSON.stringify(seen.buttons));

  await page.locator("[data-passage-id]").first().hover();
  await page.waitForTimeout(350);
  seen = await readIcons();
  check(seen.buttons.length === 2 && seen.buttons.every(button => button.opacity > 0 && button.opacity < 1),
    "over the block the copy icons fade in, lightly", JSON.stringify(seen.buttons));

  await awayFromPassages();
  await copyButton("locator").focus();
  await page.waitForTimeout(350);
  const focused = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return { opacity: Number(style.opacity), ring: `${style.outlineWidth} ${style.outlineStyle}`,
             sibling: Number(getComputedStyle(document.activeElement.nextElementSibling).opacity) };
  });
  check(focused.opacity === 1 && focused.ring === "2px solid" && focused.sibling > 0,
    "a keyboard user reaches the copy icons, with the focus ring, and focus shows them both",
    JSON.stringify(focused));

  await stubClipboard(false);
  await page.locator("[data-passage-id]").first().hover();
  await copyButton("locator").click();
  await page.waitForTimeout(200);
  seen = await readIcons();
  check(seen.copied[0] === seen.locator && seen.status === "Locator copied" && seen.polite,
    "Copy locator copies the passage's locator, and says so politely", JSON.stringify(seen));
  check(seen.buttons[0].copied && seen.buttons[0].tick && seen.buttons[0].opacity === 1
      && seen.buttons[0].color === accentColor,
    "a successful copy turns the pressed icon into a tick, fully opaque, in --accent, in a passage head",
    JSON.stringify(seen.buttons[0]));
  await copyButton("link").click();
  await page.waitForTimeout(200);
  seen = await readIcons();
  const link = seen.copied[1];
  check(Boolean(link) && new URL(link).searchParams.get("passage") === seen.locator
      && seen.status === "Link copied",
    "Copy link copies a link naming that passage, and says so", JSON.stringify(seen));
  check(seen.buttons[1].copied && seen.buttons[1].tick && seen.buttons[1].opacity === 1
      && seen.buttons[1].color === accentColor,
    "copying the link shows the same tick on its own icon", JSON.stringify(seen.buttons[1]));

  // COPY_TICK_MS in app.js is 2000; the locator click above is already ~400ms in, so
  // this margin covers both buttons' independent timers.
  await page.waitForTimeout(1900);
  seen = await readIcons();
  check(seen.buttons.every(button => !button.copied && !button.tick && button.color !== accentColor),
    "after two seconds both icons are back to themselves, and neither is marked copied",
    JSON.stringify(seen.buttons));

  await page.goto(link, { waitUntil: "networkidle" });
  await page.waitForFunction(ready, undefined, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  const reopened = await page.evaluate(() =>
    (document.querySelector("[data-passage-id].current")?.dataset.locators || "").split("\n"));
  check(reopened.includes(seen.locator), "the copied link reopens the reader at the same passage",
    `${link} -> ${JSON.stringify(reopened)}`);

  await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
  await stubClipboard(true);
  await page.locator("[data-passage-id]").first().hover();
  await copyButton("locator").click();
  await page.waitForTimeout(200);
  seen = await readIcons();
  check(seen.selected === seen.locator && seen.noteOpen && /press/i.test(seen.status || ""),
    "a refused clipboard selects the locator in the opened note instead, and says how to copy it",
    JSON.stringify(seen));
  check(seen.buttons.every(button => !button.copied && !button.tick),
    "a refused clipboard shows no tick: nothing was copied", JSON.stringify(seen.buttons));
  await copyButton("link").click();
  await page.waitForTimeout(200);
  seen = await readIcons();
  let selectedLink = null;
  try { selectedLink = new URL(seen.selected).searchParams.get("passage"); } catch {}
  check(selectedLink === seen.locator && /press/i.test(seen.status || ""),
    "a refused clipboard selects the link in the note instead", JSON.stringify(seen));
  check(seen.buttons.every(button => !button.copied && !button.tick),
    "a refused clipboard shows no tick for the link icon either", JSON.stringify(seen.buttons));

  await at(`?publication=${DRAFT_PUBLICATION}&behavior=draft-behaviour&tiers=defining,core,related`);
  await stubClipboard(false);
  await page.locator("[data-passage-id]").first().hover();
  await copyButton("link").click();
  await page.waitForTimeout(200);
  seen = await readIcons();
  check(new URL(seen.copied[0] || "http://x/").searchParams.get("publication") === DRAFT_PUBLICATION,
    "a pinned reader's copied link keeps its publication", JSON.stringify(seen.copied));

  await page.emulateMedia({ reducedMotion: "reduce" });
  await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
  seen = await readIcons();
  check(seen.buttons.length === 2 && seen.buttons.every(button => button.motion === "0s"),
    "with reduced motion the copy icons do not fade", JSON.stringify(seen.buttons));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  check(pageErrors.length === 0, "copying: no console errors", pageErrors.join("; "));
}

/* A translated document's notice can be dismissed. The × closes the band at once,
 * the choice is kept for that document version in this browser, and the document
 * still says it is a translation: a short "Translated" label beside Show original,
 * which does not grow the header's row. Another translated document keeps its
 * notice, and comparing, each panel follows its own document. The keys are cleared
 * afterwards, so the checks that follow still see the band. */
{
  const otherTranslated = fixtureDocs.find(doc => doc.translation && doc.id !== DOC_TRANSLATED)?.id;
  const clearDismissals = () => page.evaluate(ids => ids.filter(Boolean)
    .forEach(id => localStorage.removeItem(`aci-translation-dismissed:${id}`)), [DOC_TRANSLATED, otherTranslated]);
  const readNotice = () => page.evaluate(() => [...document.querySelectorAll(".document-panel")].map(panel => {
    const band = panel.querySelector(".document-translation");
    const dismiss = band?.querySelector(".translation-dismiss");
    const flag = panel.querySelector(".translation-flag");
    return {
      id: panel.dataset.documentId,
      bandShown: Boolean(band && !band.hidden && band.getBoundingClientRect().height > 0),
      dismiss: dismiss ? { label: dismiss.getAttribute("aria-label"), title: dismiss.title,
                           text: dismiss.textContent.trim() } : null,
      flagShown: Boolean(flag && !flag.hidden && flag.getBoundingClientRect().height > 0),
      flagText: flag?.textContent.trim() ?? null,
      identityRow: Math.round(panel.querySelector(".document-row").getBoundingClientRect().height * 10) / 10,
      scrollTop: Math.round(panel.querySelector(".document-scroll").scrollTop),
    };
  }));

  await page.setViewportSize({ width: 1440, height: 900 });
  await at("");
  await clearDismissals();
  await at(`?spec=${DOC_TRANSLATED}`);
  let [panel] = await readNotice();
  check(panel.bandShown && !panel.flagShown && panel.dismiss?.label === "Dismiss translation notice"
      && panel.dismiss.title === panel.dismiss.label && panel.dismiss.text === "×",
    "a translated document's notice carries a × labelled Dismiss translation notice", JSON.stringify(panel));
  const before = panel;
  await page.click(".document-translation .translation-dismiss");
  await page.waitForTimeout(200);
  [panel] = await readNotice();
  const stored = await page.evaluate(id => localStorage.getItem(`aci-translation-dismissed:${id}`), DOC_TRANSLATED);
  check(!panel.bandShown && panel.flagShown && panel.flagText === "Translated"
      && panel.identityRow === before.identityRow && panel.scrollTop === before.scrollTop && stored === "1",
    "the × hides the notice, keeps the reader's place, leaves a Translated label without growing the row,"
      + " and saves the choice for that document", JSON.stringify({ before, after: panel, stored }));

  await at(`?spec=${DOC_TRANSLATED}`);
  [panel] = await readNotice();
  check(!panel.bandShown && panel.flagShown, "after a reload the notice stays dismissed for that document",
    JSON.stringify(panel));

  if (otherTranslated) {
    await at(`?spec=${otherTranslated}`);
    [panel] = await readNotice();
    check(panel.bandShown && !panel.flagShown, "another translated document still shows its notice",
      JSON.stringify(panel));
    await at(`?compare=1&compare-with=${DOC_TRANSLATED},${otherTranslated}`);
    const pair = await readNotice();
    check(pair.length === 2 && !pair[0].bandShown && pair[0].flagShown && pair[1].bandShown && !pair[1].flagShown,
      "comparing, each panel's notice follows its own document", JSON.stringify(pair));
  }
  check(pageErrors.length === 0, "translation notice: no console errors", pageErrors.join("; "));
  await clearDismissals();
  await page.setViewportSize({ width: 1280, height: 720 });
}

/* Every paragraph carries the locator the engine gives it, not only the passages a
 * behaviour cites. The proof: every fixture passage, resolved the way the reader
 * resolves it, lands on a block whose locator is the passage's own. Then the
 * shapes where the rendered blocks and the engine's blocks part company: a list
 * item and its nested items are one engine block, an example caption and its
 * fence are one, a bare fence is numbered like a paragraph, and a heading is none.
 * The expected locators are the engine's, from harness.passages() on the fixture. */
{
  const source = await resolverSource();
  const totals = { passages: 0, mismatches: 0, unresolved: 0 };
  const details = [];
  for (const doc of fixtureDocs) {
    const passages = keepSet.flatMap(behaviour => behaviour.coverage?.[doc.id]?.passages || []);
    if (!passages.length) continue;
    await at(`?spec=${encodeURIComponent(doc.id)}&behavior=`);
    const proof = await proveDocument(page, passages, source);
    totals.passages += proof.passages;
    totals.mismatches += proof.mismatches;
    totals.unresolved += proof.unresolved;
    details.push(`${doc.id}: ${proof.passages} passages, ${proof.mismatches} mismatches,`
      + ` ${proof.unresolved} unresolved ${JSON.stringify(proof.examples)}`);
  }
  check(totals.passages > 0 && totals.mismatches === 0 && totals.unresolved === 0,
    "every fixture passage's block carries the passage's own locator", details.join("; "));

  await at(`?spec=${DOC_ID}&behavior=`);
  const located = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll(".document-body [data-block]")];
    const find = (selector, text) => blocks.find(block => block.matches(selector) && block.textContent.includes(text));
    const locator = block => (block ? block.dataset.locator ?? null : "not rendered");
    return {
      uncited: locator(find("p", "A blank line ends a block.")),
      parentItem: locator(find("li", "A second item with a nested list under it")),
      nestedItem: locator(find("li", "The nested content belongs to the item above")),
      caption: locator(find("p", "a caption, followed by its fence")),
      captionFence: locator(find("pre", "The fenced content belongs to the caption above it.")),
      fence: locator(find("pre", "This is not a heading.")),
      heading: locator(find("h2", "Blocks")),
    };
  });
  const corpus = "acme--corpus@2026-01-01";
  check(located.uncited === `${corpus} > #blocks > ¶1`,
    "a paragraph no passage cites carries the engine's locator for it", JSON.stringify(located));
  check(located.parentItem === `${corpus} > #lists > ¶3` && located.nestedItem === located.parentItem,
    "a list item and its nested items carry the item's one locator", JSON.stringify(located));
  check(located.caption === `${corpus} > #examples > ¶2` && located.captionFence === located.caption,
    "an example caption and its fence carry one locator", JSON.stringify(located));
  check(located.fence === `${corpus} > #fences > ¶2` && located.heading === null,
    "a bare fence is numbered as the engine numbers it, and a heading carries no locator",
    JSON.stringify(located));
}

/* Copy icons and links for every paragraph, not only the passages a behaviour
 * cites. A paragraph no passage cites shows the same two icons while the pointer
 * is over it, in the gutter at its right, clear of its text and of the rail; a
 * cited passage keeps its icons in its head. A link to an uncited paragraph opens
 * its document, puts the paragraph in view, focuses it and outlines it briefly,
 * and ticks nothing; from there the keyboard reaches its icons. */
{
  const corpus = "acme--corpus@2026-01-01";
  const uncited = `${corpus} > #blocks > ¶1`;
  const blockSelector = `.document-body [data-locator="${uncited}"]`;
  const stubClipboard = () => page.evaluate(() => {
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async text => { window.__copied.push(text); } },
    });
  });
  const readBlock = () => page.evaluate(selector => {
    const block = document.querySelector(selector);
    const scroll = block.closest(".document-scroll").getBoundingClientRect();
    const box = block.getBoundingClientRect();
    return {
      buttons: [...block.querySelectorAll(":scope > .block-copy .passage-copy")].map(button => {
        const icon = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          label: button.getAttribute("aria-label"),
          svg: Boolean(button.querySelector("svg")),
          opacity: Math.round(Number(style.opacity) * 100) / 100,
          color: style.color,
          copied: button.classList.contains("copied"),
          tick: button.innerHTML.includes("Copied"),
          inGutter: icon.left >= box.right,
          clearOfRail: icon.right <= scroll.right - 14,
        };
      }),
      status: document.querySelector("#copy-status")?.textContent ?? null,
      copied: window.__copied || [],
    };
  }, blockSelector);
  // The toolbar itself, wherever it currently sits -- used to prove a tick does not
  // survive the toolbar moving to a paragraph nobody copied.
  const readToolbar = () => page.evaluate(() => {
    const toolbar = document.querySelector(".block-copy");
    return {
      holderLocator: toolbar?.parentElement?.dataset.locator ?? null,
      buttons: toolbar ? [...toolbar.querySelectorAll(".passage-copy")].map(button => ({
        copied: button.classList.contains("copied"),
        tick: button.innerHTML.includes("Copied"),
      })) : [],
    };
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  const started = Date.now();
  await at(`?spec=${DOC_ID}&behavior=`);
  const opened = Date.now() - started;
  await stubClipboard();
  await page.mouse.move(2, 700);
  await page.waitForTimeout(300);
  await page.locator(blockSelector).hover();
  await page.waitForTimeout(350);
  let seen = await readBlock();
  check(seen.buttons.map(button => button.label).join(",") === "Copy locator,Copy link"
      && seen.buttons.every(button => button.svg && button.opacity > 0 && button.opacity < 1
        && button.inGutter && button.clearOfRail),
    "over a paragraph no passage cites, the copy icons fade in, in the gutter clear of its text and the rail",
    JSON.stringify(seen.buttons));

  await page.locator(`${blockSelector} .passage-copy[data-copy="locator"]`).click();
  await page.waitForTimeout(200);
  await page.locator(`${blockSelector} .passage-copy[data-copy="link"]`).click();
  await page.waitForTimeout(200);
  seen = await readBlock();
  const link = seen.copied[1];
  check(seen.copied[0] === uncited && Boolean(link) && new URL(link).searchParams.get("passage") === uncited
      && seen.status === "Link copied",
    "an uncited paragraph's icons copy its locator and a link to it", JSON.stringify(seen.copied));
  check(seen.buttons.every(button => button.copied && button.tick && button.opacity === 1),
    "both gutter icons show a tick, fully opaque, after copying", JSON.stringify(seen.buttons));

  // Requirement 3: the toolbar is one shared element, so moving it to a paragraph
  // nobody copied must clear the tick at once -- not wait out the timer.
  let toolbar = await readToolbar();
  check(toolbar.holderLocator === uncited && toolbar.buttons.every(button => button.copied && button.tick),
    "before the toolbar moves, its buttons still show the tick on the paragraph that was copied",
    JSON.stringify(toolbar));
  await page.locator(".document-body li", { hasText: "A second item with a nested list under it" }).hover();
  await page.waitForTimeout(100);
  toolbar = await readToolbar();
  check(toolbar.holderLocator !== null && toolbar.holderLocator !== uncited
      && toolbar.buttons.every(button => !button.copied && !button.tick),
    "moving the toolbar to another paragraph puts the real icons back immediately",
    JSON.stringify(toolbar));

  await page.locator(".document-body h2", { hasText: "Blocks" }).first().hover();
  await page.waitForTimeout(250);
  const headingIcons = await page.evaluate(() =>
    document.querySelectorAll(".document-body :is(h1, h2, h3, h4, h5, h6) .block-copy").length);
  check(headingIcons === 0, "a heading carries no copy icons", `${headingIcons} in headings`);

  await at(`?spec=${DOC_ID}&behavior=${DEFINED}&tiers=defining,core,related`);
  await page.locator("[data-passage-id]").first().hover();
  await page.waitForTimeout(300);
  const anchor = await page.evaluate(() => {
    const block = document.querySelector("[data-passage-id]");
    return { head: block.querySelectorAll(".passage-head .passage-copy").length,
             gutter: block.querySelectorAll(":scope > .block-copy").length };
  });
  check(anchor.head === 2 && anchor.gutter === 0,
    "a cited passage keeps its icons in its head, and gets none in the gutter", JSON.stringify(anchor));

  await page.goto(link, { waitUntil: "networkidle" });
  await page.waitForFunction(ready, undefined, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  const linked = await page.evaluate(selector => {
    const block = document.querySelector(selector);
    const scroll = block?.closest(".document-scroll").getBoundingClientRect();
    const box = block?.getBoundingClientRect();
    const status = document.querySelector("#reader-status");
    return {
      found: Boolean(block),
      focused: Boolean(block) && document.activeElement === block,
      outlined: block?.classList.contains("linked-block") ?? false,
      inView: Boolean(box && box.height > 0 && box.top >= scroll.top - 1 && box.bottom <= scroll.bottom + 1),
      ticked: [...document.querySelectorAll("[data-behaviour]")]
        .filter(input => input.checked).map(input => input.dataset.behaviour),
      status: status.classList.contains("visible") ? status.textContent : "",
    };
  }, blockSelector);
  check(linked.found && linked.focused && linked.outlined && linked.inView && linked.status === "",
    "a link to an uncited paragraph opens it in view, focused and outlined", JSON.stringify(linked));
  check(linked.ticked.join(",") === keepSet[0].slug,
    "a link to an uncited paragraph ticks nothing beyond the reader's default", JSON.stringify(linked.ticked));
  await page.keyboard.press("Tab");
  const tabbed = await page.evaluate(() => ({
    label: document.activeElement?.getAttribute("aria-label") ?? null,
    inBlock: Boolean(document.activeElement?.closest(".block-copy")),
  }));
  check(tabbed.label === "Copy locator" && tabbed.inBlock,
    "from the linked paragraph, the keyboard reaches its copy icons", JSON.stringify(tabbed));

  check(opened < 5000, "opening a document with every block located stays quick", `${opened} ms to first render`);
  check(pageErrors.length === 0, "block copy: no console errors", pageErrors.join("; "));
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
  /* The umber surface is no longer offered. Its switch, its palette and
   * setPalette all remain -- the button carries `hidden` and ?palette=umber
   * still reaches the surface -- but nothing on the page presses it, because the
   * Overview page has no second palette and a control the menus disagreed about
   * was worse than none.
   *
   * So this no longer clicks it: a click on a hidden control never resolves, and
   * this walker hung on it for fifty-eight retries rather than failing. What is
   * checked instead is that the switch is there and not offered, and that the
   * surface it used to reach still works when asked for directly, which is how
   * every other palette check in this file already drives it. */
  const offered = await page.evaluate(() => {
    const button = document.querySelector("#mode");
    return { present: Boolean(button), hidden: button?.hidden ?? null };
  });
  check(offered.present && offered.hidden === true,
    "the palette switch is kept and not offered", JSON.stringify(offered));

  const before = await page.evaluate(() => document.body.dataset.palette);
  await page.evaluate(() => { document.body.dataset.palette = "umber"; });
  await page.waitForTimeout(150);
  const ground = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor);
  await page.evaluate(name => { document.body.dataset.palette = name; }, before);
  const daylight = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor);
  // That the ground changes, not what it changes to: the body takes --chrome
  // rather than --paper, and a colour written in here is a fourth place the
  // palette would have to be kept true.
  check(before === "daylight" && ground !== daylight,
    "the umber surface still answers when it is asked for",
    `${daylight} -> ${ground}`);
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
{
  /* The publisher tabs: labels large enough to read at a glance, in a row that
   * does not grow (the rule above holds it on the sidebar's line), and the chosen
   * publisher unmistakable. Chosen: ink at 600 with the chartreuse marker under
   * it. The others: quieter, at most about half the chosen tab's contrast, and
   * still AA. Chartreuse marks, it never writes. The focus ring must survive the
   * strip, which scrolls sideways and so clips whatever sits outside it. Held
   * with one document and two, in both palettes, at the narrower desktop width. */
  const tabStyles = () => page.evaluate(() => {
    const channels = colour => colour.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = colour => {
      const [r, g, b] = channels(colour).map(value => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (light + 0.05) / (dark + 0.05);
    };
    const ground = element => {
      for (let node = element; node; node = node.parentElement) {
        const colour = getComputedStyle(node).backgroundColor;
        if (colour !== "rgba(0, 0, 0, 0)" && colour !== "transparent") return colour;
      }
      return "rgb(255, 255, 255)";
    };
    const token = name => {
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    };
    const ink = token("--ink");
    const energy = token("--energy");
    return [...document.querySelectorAll(".document-panel")].map(panel => ({
      rowHeight: Math.round(panel.querySelector(".provider-row").getBoundingClientRect().height * 10) / 10,
      headerHeight: parseFloat(getComputedStyle(document.body).getPropertyValue("--panel-header-height")),
      tabs: [...panel.querySelectorAll(".provider-tab")].map(tab => {
        const style = getComputedStyle(tab);
        return {
          lab: tab.dataset.lab,
          pressed: tab.getAttribute("aria-pressed") === "true",
          size: parseFloat(style.fontSize),
          weight: Number(style.fontWeight),
          ink: style.color === ink,
          textIsChartreuse: style.color === energy,
          contrast: Math.round(contrast(style.color, ground(tab)) * 100) / 100,
          marker: { width: parseFloat(style.borderBottomWidth), chartreuse: style.borderBottomColor === energy },
        };
      }),
    }));
  });
  const ringOf = selector => page.evaluate(selector => {
    const tab = document.querySelector(selector);
    const style = getComputedStyle(tab);
    const reach = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
    const box = tab.getBoundingClientRect();
    const clip = tab.closest(".provider-tabs").getBoundingClientRect();
    const probe = document.createElement("span");
    probe.style.color = "var(--energy)";
    document.body.append(probe);
    const energy = getComputedStyle(probe).color;
    probe.remove();
    return {
      focusVisible: tab.matches(":focus-visible"),
      ring: `${style.outlineWidth} ${style.outlineStyle}`,
      chartreuse: style.outlineColor === energy,
      unclipped: box.left - reach >= clip.left - 0.5 && box.right + reach <= clip.right + 0.5
        && box.top - reach >= clip.top - 0.5 && box.bottom + reach <= clip.bottom + 0.5,
    };
  }, selector);
  await page.setViewportSize({ width: 1024, height: 768 });
  const initialPalette = await page.evaluate(() => document.body.dataset.palette);
  for (const [mode, query] of [
    ["one document", `?behavior=${DEFINED}&spec=${DOC_ID}`],
    ["compare", `?behavior=${DEFINED}&compare=1&compare-with=${DOC_ID},${DOC_B}`],
  ]) {
    await at(query);
    for (const palette of ["daylight", "umber"]) {
      await page.evaluate(name => { document.body.dataset.palette = name; }, palette);
      // The tabs change colour over 150ms; read them once the palette has landed.
      await page.waitForTimeout(300);
      const panels = await tabStyles();
      const label = `publisher tabs, ${mode}, ${palette}`;
      check(panels.every(panel => panel.tabs.every(tab => tab.size >= 15)
          && Math.abs(panel.rowHeight - panel.headerHeight) <= 0.5),
        `${label}: labels at 15px or more, in a row still --panel-header-height tall`,
        panels.map(panel => `row ${panel.rowHeight}/${panel.headerHeight}, sizes `
          + panel.tabs.map(tab => tab.size).join("/")).join("; "));
      check(panels.every(panel => {
          const chosen = panel.tabs.filter(tab => tab.pressed);
          const others = panel.tabs.filter(tab => !tab.pressed);
          return chosen.length === 1 && others.length >= 1
            && chosen[0].ink && chosen[0].weight >= 600
            && chosen[0].marker.chartreuse && chosen[0].marker.width >= 3
            && others.every(tab => tab.weight <= 400 && !tab.marker.chartreuse
              && tab.contrast >= 4.5 && tab.contrast <= chosen[0].contrast * 0.55)
            && panel.tabs.every(tab => !tab.textIsChartreuse);
        }),
        `${label}: the chosen publisher in ink at 600 over a chartreuse marker,`
          + " the others quieter and still AA",
        panels.map(panel => JSON.stringify(panel.tabs)).join("; "));
    }
    await page.evaluate(name => { document.body.dataset.palette = name; }, initialPalette);
    // By keyboard, on a publisher that is not the chosen one.
    const selector = '.document-panel .provider-tab[aria-pressed="false"]';
    await page.locator(selector).first().focus();
    await page.keyboard.press("Shift");
    const ring = await ringOf(selector);
    check(ring.focusVisible && ring.ring === "2px solid" && ring.chartreuse && ring.unclipped,
      `publisher tabs, ${mode}: a focused publisher shows the whole chartreuse focus ring`,
      JSON.stringify(ring));
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
  /* Comparing, each header ends in one row below the name/version/Show original
   * line, whatever wrapped above it: a long title, a translation band on one side
   * only (it sits below the header, not in it), a narrower half. At the left the
   * walk, "N/M" and then the arrows; at the right what changes the view, Expand all
   * and then the band toggles, flush with the header's right edge. Where the row
   * has the width, both groups share one line (1440x900); where it does not (two
   * panels at 1024x768) the view controls wrap below, still at the right, and
   * nothing leaves the header. Checked for a pair where one side carries the
   * translation band and the other does not, with a behaviour selected so the
   * toggles carry counts, the widest they get. The resizer tests just above leave
   * an off-centre compare split and a widened sidebar in localStorage; reset both
   * so the panels start from the defaults this check means to cover. */
  await page.evaluate(() => {
    localStorage.setItem("aci-compare-first", "50");
    localStorage.removeItem("aci-sidebar-width");
  });
  for (const [width, height] of [[1440, 900], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await at(`?compare=1&compare-with=${DOC_TRANSLATED},${DOC_ID}`
      + `&behavior=${DEFINED}&tiers=defining,core,related`);
    const measured = await page.evaluate(() => [...document.querySelectorAll(".document-panel")].map(panel => {
      const rect = element => element.getBoundingClientRect();
      const centre = box => (box.top + box.bottom) / 2;
      const header = panel.querySelector(".document-header");
      const style = getComputedStyle(header);
      const h = rect(header);
      // The header's content box: its border box less its own side padding, so
      // this holds however the two panels are split.
      const contentLeft = h.left + parseFloat(style.paddingLeft);
      const contentRight = h.right - parseFloat(style.paddingRight);
      const identity = rect(panel.querySelector(".document-row"));
      const nav = rect(panel.querySelector(".passage-nav"));
      const previous = rect(panel.querySelector(".previous-passage"));
      const next = rect(panel.querySelector(".next-passage"));
      const expand = rect(panel.querySelector(".document-focus-toggle"));
      const legend = rect(panel.querySelector(".rail-legend"));
      // Last in the view controls since the note icon joined them, so it, not the
      // band toggles, is what has to sit against the header's right edge.
      const note = rect(panel.querySelector(".document-feedback"));
      const inside = box => box.left >= h.left - 0.5 && box.right <= h.right + 0.5
        && box.top >= h.top - 0.5 && box.bottom <= h.bottom + 0.5;
      // The compact counter, "3/12", while "3 of 12 passages" stays the counter
      // a screen reader reads.
      const counter = panel.querySelector(".passage-count-short");
      const full = panel.querySelector(".passage-count");
      const c = counter ? rect(counter) : null;
      const anchors = panel._anchors || [];
      const expandOnBandsRow = Math.abs(centre(expand) - centre(legend)) <= 4;
      return {
        documentId: panel.dataset.documentId,
        hasBand: !panel.querySelector(".document-translation").hidden,
        walk: {
          leads: Math.round((nav.left - contentLeft) * 10) / 10,
          belowIdentity: Math.round(nav.top - identity.bottom),
          arrowsInOrder: previous.right <= next.left,
        },
        counter: counter ? {
          text: counter.textContent,
          position: anchors.length ? `${panel._passageIndex + 1}/${anchors.length}` : "0/0",
          // Visible: a box with area that the browser draws, not clipped away
          // the way the full counter is in compare mode.
          visible: c.width > 0 && c.height > 0 && counter.checkVisibility({ visibilityProperty: true })
            && getComputedStyle(counter).clip === "auto",
          beforeArrows: Math.round(previous.left - c.right),
          centreDiff: Math.round(centre(c) - centre(previous)),
          spokenMatches: anchors.length
            ? full.textContent === `${panel._passageIndex + 1} of ${anchors.length} passages`
            : !/\d/.test(full.textContent),
          hiddenFromScreenReaders: counter.getAttribute("aria-hidden") === "true",
        } : null,
        view: {
          expandBeforeBands: expandOnBandsRow ? expand.right <= legend.left : expand.bottom <= legend.top,
          /* After the band toggles, which at two panels on a narrow screen can
             mean on the line below them rather than beside them: .meta-actions
             wraps, as the legend itself does. Either is "after"; what would be
             wrong is the icon before them. */
          bandsBeforeNote: legend.right <= note.left + 0.5 || legend.bottom <= note.top + 0.5,
          flushRight: Math.round((contentRight - note.right) * 10) / 10,
          belowIdentity: Math.round(Math.min(expand.top, legend.top) - identity.bottom),
        },
        oneRow: Math.abs(centre(nav) - centre(legend)) <= 4 && expandOnBandsRow,
        viewWrappedBelow: Math.min(expand.top, legend.top) >= nav.bottom - 0.5,
        nothingLeaves: [nav, expand, legend, ...(c ? [c] : [])].every(inside),
      };
    }));
    const detail = key => measured.map(p => `${p.documentId} ${JSON.stringify(p[key])}`).join("; ");
    check(measured.length === 2 && measured.some(p => p.hasBand) && measured.some(p => !p.hasBand),
      `compare header layout ${width}x${height}: fixture pair has one banded panel and one plain one`,
      measured.map(p => `${p.documentId} band=${p.hasBand}`).join(", "));
    check(measured.every(p => Math.abs(p.walk.leads) <= 1 && p.walk.belowIdentity >= 0 && p.walk.arrowsInOrder),
      `compare ${width}x${height}: the walk leads the row at the left, below the name/version line`,
      detail("walk"));
    check(measured.every(p => p.counter?.visible),
      `compare ${width}x${height}: the passage counter is visible in both panels, not clipped`,
      detail("counter"));
    check(measured.every(p => p.counter && p.counter.beforeArrows >= 0 && p.counter.beforeArrows <= 12
        && Math.abs(p.counter.centreDiff) <= 3),
      `compare ${width}x${height}: the counter comes first, just left of the arrows, on their row`,
      detail("counter"));
    check(measured.every(p => p.counter && p.counter.text === p.counter.position
        && p.counter.spokenMatches && p.counter.hiddenFromScreenReaders),
      `compare ${width}x${height}: the counter reads N/M for the passage position,`
        + " and the full sentence stays what a screen reader hears", detail("counter"));
    check(measured.every(p => p.view.expandBeforeBands && p.view.bandsBeforeNote
        && p.view.flushRight >= -0.5 && p.view.flushRight <= 1.5 && p.view.belowIdentity >= 0),
      `compare ${width}x${height}: at the right, Expand all, the band toggles, then the note icon flush right`,
      detail("view"));
    if (width >= 1440) {
      check(measured.every(p => p.oneRow),
        `compare ${width}x${height}: the walk and the view controls share one row`,
        measured.map(p => `${p.documentId} oneRow=${p.oneRow}`).join("; "));
    }
    check(measured.every(p => (p.oneRow || p.viewWrappedBelow) && p.nothingLeaves),
      `compare ${width}x${height}: the row fits or wraps below, and nothing leaves the header`,
      measured.map(p => `${p.documentId} oneRow=${p.oneRow} wrapped=${p.viewWrappedBelow}`
        + ` inside=${p.nothingLeaves}`).join("; "));
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
console.log("== Reader: the depth column explains itself ==");
/* Two popovers hang off the depth column: the scale, from the heading that states
 * it, and one cell, from a figure. A reader looking at a 1.0 has to be able to ask
 * what a 1 is, and who gave it, without leaving the reader. Both are opened here,
 * read, and closed with Escape; only one of them is ever on screen, and the
 * control that opened it has the focus back afterwards. */
{
  const figure = `[data-behaviour-depth="${DEFINED}"]`;
  const read = () => page.evaluate(() => {
    const note = document.querySelector("#depth-note");
    const box = note?.getBoundingClientRect();
    return {
      open: document.querySelectorAll(":popover-open").length,
      title: document.querySelector("#depth-note-title")?.textContent ?? "",
      body: document.querySelector("#depth-note-body")?.textContent ?? "",
      headings: [...(note?.querySelectorAll("h3") ?? [])].map(h => h.textContent),
      judges: [...(note?.querySelectorAll(".depth-note-judges li") ?? [])].map(li => li.textContent),
      role: note?.getAttribute("role") ?? null,
      labelled: note?.getAttribute("aria-labelledby") ?? null,
      focusInside: note ? note.contains(document.activeElement) : false,
      scrolls: note ? getComputedStyle(note).overflowY : null,
      // The box stays in the window and the page keeps its width: a long
      // rationale scrolls inside the box rather than stretching the page.
      insideWindow: box ? box.top >= -0.5 && box.bottom <= window.innerHeight + 0.5
        && box.left >= -0.5 && box.right <= window.innerWidth + 0.5 : false,
      pageKeepsWidth: document.documentElement.scrollWidth <= window.innerWidth + 0.5,
      // Which of the column's own controls says it is open. The sidebar's fold
      // toggle carries aria-expanded too, and is not one of these.
      marked: [...document.querySelectorAll('.depth-head[aria-expanded="true"],'
          + ' .depth[aria-expanded="true"]')]
        .map(el => el.dataset.behaviourDepth ?? "scale").join(","),
    };
  });
  const brief = seen => `${seen.open} open, marked "${seen.marked}", `
    + `title "${seen.title}", ${seen.judges.length} judges`;
  const escape = selector => page.keyboard.press("Escape")
    .then(() => page.waitForTimeout(200))
    .then(() => page.evaluate(sel => ({
      open: document.querySelectorAll(":popover-open").length,
      // The control itself, not merely one of its kind.
      focused: document.activeElement === document.querySelector(sel),
      expanded: document.querySelector(sel)?.getAttribute("aria-expanded") ?? null,
    }), selector));

  await at(`?behavior=${DEFINED}&spec=${DOC_ID}`);
  await page.locator(".depth-head").first().click();
  await page.waitForTimeout(250);
  const scale = await read();
  check(scale.title === "Depth, out of 4" && scale.marked === "scale",
    "the column's heading opens a popover of its own", brief(scale));
  check(["absent", "named", "discussed", "prescribed", "demonstrated"]
      .every(anchor => scale.body.includes(anchor))
    && scale.body.includes("No passage bears on the behaviour.")
    && scale.body.includes("usable as an answer key for borderline cases."),
    "the scale popover gives the rubric's five levels in the rubric's own words",
    scale.body.replace(/\s+/g, " ").slice(0, 110));
  check(scale.body.includes("not whether it agrees with it")
    && scale.body.includes("the mean of the panel's three judges"),
    "the scale popover says what depth is not, and what the figure averages",
    scale.body.replace(/\s+/g, " ").slice(0, 160));
  check(scale.open === 1 && scale.role === "dialog" && scale.labelled === "depth-note-title"
    && scale.focusInside && scale.scrolls === "auto" && scale.insideWindow,
    "one popover, labelled, focused, scrolling inside the window rather than stretching it",
    `${brief(scale)}, role ${scale.role}, labelled by ${scale.labelled},`
      + ` focus inside ${scale.focusInside}, overflow ${scale.scrolls},`
      + ` in window ${scale.insideWindow}`);

  let closed = await escape(".depth-head");
  check(closed.open === 0 && closed.focused && closed.expanded === "false",
    "Escape closes the scale popover and gives the heading its focus back",
    JSON.stringify(closed));

  await page.click(figure);
  await page.waitForTimeout(250);
  const cell = await read();
  check(cell.title === "Defined behaviour" && cell.headings.join(" | ") === "Parser corpus 2026-01-01"
    && cell.marked === DEFINED,
    "a figure opens the cell behind it, under the document it was judged on",
    `${brief(cell)}, headings ${cell.headings.join(" | ")}`);
  check(cell.body.includes("2.7 out of 4, prescribed."),
    "the cell popover leads with the mean and the word it rounds to",
    cell.body.replace(/\s+/g, " ").slice(0, 80));
  check(cell.judges.length === 3
    && cell.judges.some(line => line === "c 2 Discussed in general terms.")
    && cell.judges.every(line => /^[abc] [0-4] \S/.test(line)),
    "the cell popover names each judge with its own 0 to 4 and its rationale",
    cell.judges.join(" | "));
  check(cell.open === 1 && cell.focusInside && cell.insideWindow,
    "the cell popover is the only one open, and holds the focus", brief(cell));

  closed = await escape(figure);
  check(closed.open === 0 && closed.focused && closed.expanded === "false",
    "Escape closes the cell popover and gives the figure its focus back",
    JSON.stringify(closed));

  // A seat another model judged is named in the cell it happened in.
  await at(`?behavior=${DEFINED}&spec=${DOC_B}`);
  await page.click(figure);
  await page.waitForTimeout(250);
  const substituted = await read();
  check(substituted.body.includes("d judged in place of c: c returned no output for"
      + " this document on every attempt."),
    "the cell popover names the substitute recorded in that seat",
    substituted.body.replace(/\s+/g, " ").slice(0, 150));

  // A document a behaviour was never judged on says so, rather than opening empty.
  await at(`?behavior=${UNDEFINED}&spec=${DOC_B}`);
  await page.click(`[data-behaviour-depth="${UNDEFINED}"]`);
  await page.waitForTimeout(250);
  const unjudged = await read();
  check(unjudged.open === 1 && unjudged.judges.length === 0
    && unjudged.body.includes("No depth given: this behaviour was not judged on this document."),
    "a cell with no depth says so plainly instead of opening on nothing",
    unjudged.body.replace(/\s+/g, " ").slice(0, 110));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // The scale and a cell can never be on screen together, and neither can one of
  // them and a behaviour's note.
  await at(`?behavior=${DEFINED}&spec=${DOC_ID}`);
  await page.locator(".depth-head").first().click();
  await page.waitForTimeout(200);
  await page.click(figure);
  await page.waitForTimeout(250);
  const one = await read();
  check(one.open === 1 && one.title === "Defined behaviour" && one.marked === DEFINED,
    "opening a figure closes the scale: one popover, and one trigger marked open",
    brief(one));
  await page.click(`[data-behaviour-note="${DEFINED}"]`);
  await page.waitForTimeout(250);
  const swapped = await read();
  check(swapped.open === 1 && swapped.marked === "",
    "opening a behaviour's note closes the depth note and unmarks its trigger",
    brief(swapped));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // Phone width: the box fits the window and the page keeps its width.
  await page.setViewportSize({ width: 400, height: 780 });
  await at(`?behavior=${DEFINED}&spec=${DOC_ID}`);
  await page.click(figure);
  await page.waitForTimeout(250);
  const narrow = await read();
  check(narrow.open === 1 && narrow.insideWindow && narrow.pageKeepsWidth,
    "at 400px wide the popover stays in the window and the page is not pushed sideways",
    `${brief(narrow)}, in window ${narrow.insideWindow}, page keeps width ${narrow.pageKeepsWidth}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.setViewportSize({ width: 1280, height: 720 });

  check(pageErrors.length === 0, "depth popovers: no console errors", pageErrors.join("; "));
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

  /* Comparing moves the view controls into a .meta-actions group, and the note
     icon has to travel with them: left as a direct child of the row it lands
     between the walk and the controls, which is the one place in the header it
     means nothing. Last in the group, past Related, on both panels. */
  const noteLast = await page.evaluate(() => [...document.querySelectorAll(".document-panel")]
    .map(panel => {
      const actions = panel.querySelector(".meta-actions");
      const icon = panel.querySelector(".document-feedback");
      return Boolean(actions && icon && actions.lastElementChild === icon
        && icon.previousElementSibling?.classList.contains("rail-legend"));
    }));
  check(noteLast.length === 2 && noteLast.every(Boolean),
    "comparing, each panel's note icon is last in the view controls, after Related",
    JSON.stringify(noteLast));
}

// =============================================================================
console.log("== Reader: the note dialog ==");
// A note on a paragraph, and the same dialog on a whole document: it opens
// naming its subject, the send button gates on an address and nothing else,
// the private toggle disables the name field, and a send posts the body the
// derivation table promises and is remembered for next time.
{
  const openFromPassage = async () => {
    await page.locator("[data-passage-id]").first().hover();
    await page.waitForTimeout(200);
    await page.locator("[data-passage-id] .passage-feedback").first().click();
    await page.waitForTimeout(150);
  };
  const dialogState = () => page.evaluate(() => {
    const block = document.querySelector("[data-passage-id]");
    return {
      open: document.querySelector("#feedback-dialog").open,
      title: document.querySelector("#feedback-title").textContent,
      locator: document.querySelector("#feedback-locator").textContent,
      behavioursHidden: document.querySelector("#feedback-behaviours-field").hidden,
      behaviours: document.querySelector("#feedback-behaviours").value,
      sendDisabled: document.querySelector("#feedback-send").disabled,
      nameDisabled: document.querySelector("#feedback-name").disabled,
      blockLocator: block ? (block.dataset.locators || "").split("\n")[0] : null,
    };
  });

  await at(`?behavior=${DEFINED}&spec=${DOC_ID}&tiers=defining,core,related`);
  await page.evaluate(() => {
    try {
      localStorage.removeItem("aci-feedback-email");
      localStorage.removeItem("aci-feedback-name");
      localStorage.removeItem("aci-feedback-private");
    } catch {}
  });

  await openFromPassage();
  let seen = await dialogState();
  check(seen.open && seen.title === "Note on this paragraph" && seen.locator === seen.blockLocator
      && !seen.behavioursHidden && seen.behaviours.length > 0 && seen.sendDisabled,
    "the dialog opens from a paragraph, names its locator, shows the behaviours field filled, and disables send with no address",
    JSON.stringify(seen));

  await page.locator("#feedback-email").fill("reader@example.org");
  await page.waitForTimeout(100);
  seen = await dialogState();
  check(!seen.sendDisabled, "typing an address enables the send button", JSON.stringify(seen));

  await page.locator("#feedback-private").check();
  await page.waitForTimeout(100);
  seen = await dialogState();
  check(seen.nameDisabled, "the private toggle disables the name field", JSON.stringify(seen));
  await page.locator("#feedback-private").uncheck();
  await page.waitForTimeout(100);

  await page.locator("#feedback-comment").fill("It reads wrong.");
  await page.locator('.thumb[data-vote="up"]').click();
  await page.locator("#feedback-send").click();
  await page.waitForTimeout(300);
  let sent = lastFeedbackReceived();
  check(Boolean(sent) && sent.locator === seen.blockLocator && sent.vote === "up"
      && sent.comment === "It reads wrong." && sent.email === "reader@example.org"
      && sent.visibility === "anonymous" && sent.display_name === "",
    "a send with a comment, a thumb and an address posts locator, vote, comment and email as typed, anonymous with no name",
    JSON.stringify(sent));

  const remembered = await page.evaluate(() => {
    try { return { email: localStorage.getItem("aci-feedback-email") }; } catch { return {}; }
  });
  check(remembered.email === "reader@example.org", "the address is in localStorage afterwards",
    JSON.stringify(remembered));

  await page.waitForTimeout(900);   // sendFeedback closes the dialog ~1s after a done outcome
  const closedAfterSend = await page.evaluate(() => !document.querySelector("#feedback-dialog").open);
  check(closedAfterSend, "the dialog closes on its own after a successful send");

  await openFromPassage();
  await page.locator("#feedback-name").fill("A reader");
  await page.locator("#feedback-send").click();
  await page.waitForTimeout(300);
  sent = lastFeedbackReceived();
  check(sent?.visibility === "attributed" && sent?.display_name === "A reader",
    "a name typed with the toggle off sends attributed and that name", JSON.stringify(sent));
  await page.waitForTimeout(900);

  await openFromPassage();
  await page.locator("#feedback-private").check();
  await page.locator("#feedback-send").click();
  await page.waitForTimeout(300);
  sent = lastFeedbackReceived();
  check(sent?.visibility === "private" && sent?.display_name === "",
    "the toggle on sends private and an empty display_name", JSON.stringify(sent));
  await page.waitForTimeout(900);

  // The document's own icon: same dialog, no behaviours, and a line that says what
  // the note is about in words. The document id is what travels, not what is shown:
  // printing it at the reader was printing a machine's name for the thing in front
  // of them, so the line is prose and the id is proved by what gets sent, below.
  await page.locator(".document-feedback").first().click();
  await page.waitForTimeout(150);
  const docSeen = await page.evaluate(() => ({
    open: document.querySelector("#feedback-dialog").open,
    title: document.querySelector("#feedback-title").textContent,
    locator: document.querySelector("#feedback-locator").textContent,
    prose: document.querySelector("#feedback-locator").classList.contains("prose"),
    behavioursHidden: document.querySelector("#feedback-behaviours-field").hidden,
    voteHidden: document.querySelector("#feedback-vote").hidden,
  }));
  check(docSeen.open && docSeen.title === "Note on this document"
      && docSeen.locator.startsWith("General comment about ")
      && !docSeen.locator.includes(DOC_ID) && docSeen.prose
      && docSeen.behavioursHidden && !docSeen.voteHidden,
    "the icon beside the document title opens the dialog on the document, named in words, with its thumbs",
    JSON.stringify(docSeen));

  // A click on the backdrop closes it, same as Cancel.
  await page.mouse.click(4, 4);
  await page.waitForTimeout(150);
  const closedByBackdrop = await page.evaluate(() => !document.querySelector("#feedback-dialog").open);
  check(closedByBackdrop, "a click on the backdrop closes the dialog");

  check(pageErrors.length === 0, "the note dialog: no console errors", pageErrors.join("; "));
}

// =============================================================================
/* The overview's second view, how each lab governs its rules: one table with the
 * companies across and their scores down, each question opening into its
 * checks, and a popover beside whatever was pressed. Its numbers and words are
 * site/governance.json, and tests/test_governance_tab.py holds the two together;
 * what only a browser can show is that the tabs, the address, the folds and the
 * popover join them. */
console.log("== Overview: the governance view ==");
{
  const root = new URL("/", base).href;
  pageErrors = [];
  await page.goto(`${root}?view=governance`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelectorAll("#gov-heatmap tbody tr").length > 0,
    undefined, { timeout: 10000 }).catch(() => {});
  const seen = await page.evaluate(() => ({
    governanceShown: !document.querySelector("#view-governance").hidden,
    coverageHidden: document.querySelector("#view-coverage").hidden,
    selected: document.querySelector('.view-tab[aria-selected="true"]')?.dataset.view,
    companies: [...document.querySelectorAll("#gov-heatmap thead .company-name")].map(n => n.textContent),
    overall: [...document.querySelectorAll('#gov-heatmap .cell-button[data-row="total"] .cell-figure')]
      .map(b => b.textContent),
    outOf: [...new Set([...document.querySelectorAll('#gov-heatmap .cell-button[data-row="total"] .cell-max')]
      .map(b => b.textContent))],
    flagged: [...document.querySelectorAll("#gov-heatmap thead .company-button")]
      .filter(b => b.querySelector(".company-flag")).map(b => b.querySelector(".company-name").textContent),
    rows: [...document.querySelectorAll("#gov-heatmap tbody tr:not([hidden]) .row-name .head-name")]
      .map(n => n.textContent),
    findings: document.querySelectorAll("#gov-findings details").length,
  }));
  check(seen.governanceShown && seen.coverageHidden && seen.selected === "governance",
    "?view=governance opens on the governance view with the grid hidden", JSON.stringify(seen));
  check(seen.companies.join(", ") === "OpenAI, Anthropic, Alibaba, Google DeepMind, Mistral AI, "
        + "Meta, xAI, Moonshot AI, DeepSeek"
      && seen.overall.join(",") === "9.0,9.0,4.3,3.8,2.7,2.0,2.0,1.5,0.8" && seen.outOf.join() === "/16"
      && seen.flagged.join(", ") === "Mistral AI, Moonshot AI, DeepSeek",
    "the nine companies run across in the note's order, both ties broken as the note breaks them, "
      + "each overall score out of 16, the open-weight ones marked",
    `${seen.companies.join(", ")} / ${seen.overall.join(",")}`);
  check(seen.rows.join(", ") === "Overall, Model behaviour specification, Change log, Guardrails, "
        + "Hard constraints, Best practices"
      && seen.findings === 8,
    "the scores run down from the total, the checks folded, the eight findings under the table",
    JSON.stringify(seen.rows));

  // The board paints every row over its own maximum now. This view's maxima are
  // its own, so not one of its colours moved. 9.0 of 16 is OpenAI's total and 10
  // of 18 its best practices, which is the row whose maximum is not four times a
  // power of two and so the one the arithmetic could have lost.
  const colours = await page.evaluate(() => {
    const paintOf = row => getComputedStyle(
      document.querySelector(`#gov-heatmap .cell-button[data-row="${row}"]`)).backgroundColor;
    return {
      total: paintOf("total"),
      supporting: paintOf("supporting"),
      legend: [...document.querySelectorAll("#gov-legend .swatch")]
        .map(swatch => getComputedStyle(swatch).backgroundColor),
    };
  });
  check(colours.total === "rgb(199, 159, 42)" && colours.supporting === "rgb(201, 160, 42)"
      && colours.legend.join(" | ") === "rgb(180, 71, 47) | rgb(199, 117, 43) | rgb(217, 162, 39)"
        + " | rgb(147, 151, 51) | rgb(76, 140, 63)",
    "the governance view wears the colours it wore: 9.0 of 16, 10 of 18, and its five swatches",
    JSON.stringify(colours));

  // A question opens into its checks.
  await page.locator('.row-toggle[data-question="2"]').click();
  await page.waitForTimeout(100);
  const opened = await page.evaluate(() => ({
    checks: [...document.querySelectorAll('#gov-heatmap tr.check-row[data-parent="2"]:not([hidden]) .head-name')]
      .map(n => n.textContent),
    expanded: document.querySelector('.row-toggle[data-question="2"]').getAttribute("aria-expanded"),
  }));
  check(opened.checks.join(", ") === "Versions kept, Changes explained, Scope of the log"
      && opened.expanded === "true",
    "the change log opens into its three checks", JSON.stringify(opened));

  // The best practices open into the five anyone can check, then the four only
  // the company can show, scored on what it publishes, then the one only an
  // internal audit could score, NA for everyone.
  await page.locator('.row-toggle[data-question="supporting"]').click();
  await page.waitForTimeout(100);
  const practices = await page.evaluate(() => {
    const shown = [...document.querySelectorAll('#gov-heatmap tr.check-row[data-parent="supporting"]:not([hidden])')];
    const openai = id => document.querySelector(`.cell-button[data-lab="openai"][data-row="${id}"]`);
    const figures = ids => [...new Set(ids.flatMap(id =>
      [...document.querySelectorAll(`.cell-button[data-row="${id}"] .cell-figure`)].map(n => n.textContent)))];
    return {
      rows: shown.map(row => row.id.replace("gov-check-", "")).join(),
      openai: ["S1", "S2", "S3", "S4", "S5"].map(id => openai(id)?.querySelector(".cell-figure")?.textContent),
      outOf: openai("S1")?.querySelector(".cell-max")?.textContent,
      disclosed: figures(["I1", "I2", "I3", "I4"]).every(mark => ["0", "1", "2"].includes(mark)),
      marks: figures(["I5"]),
    };
  });
  check(practices.rows === "S1,S2,S3,S4,S5,disclosed,I1,I2,I3,I4,internal,I5"
      && practices.openai.join() === "2,1,0,0,1" && practices.outOf === "/2"
      && practices.disclosed && practices.marks.join() === "NA",
    "the best practices open into five anyone can check, four scored on what the company publishes, one NA",
    JSON.stringify(practices));
  await page.locator('.row-toggle[data-question="supporting"]').click();

  // A check's score opens a popover beside it, with its place on the scale marked.
  const cell = page.locator('.cell-button[data-lab="anthropic"][data-row="2.1"]');
  await cell.click();
  await page.waitForTimeout(150);
  const popover = await page.evaluate(() => {
    const pop = document.querySelector("#gov-pop");
    const cellBox = document.querySelector('.cell-button[data-lab="anthropic"][data-row="2.1"]')
      .getBoundingClientRect();
    const box = pop.getBoundingClientRect();
    return {
      open: pop.matches(":popover-open"),
      title: pop.querySelector("h2")?.textContent,
      here: [...pop.querySelectorAll(".anchors li.is-here .anchor-level")].map(n => n.textContent),
      covers: !(box.right <= cellBox.left || box.left >= cellBox.right
        || box.bottom <= cellBox.top || box.top >= cellBox.bottom),
    };
  });
  check(popover.open && popover.title === "Anthropic: versions kept"
      && popover.here.join() === "0,2" && !popover.covers,
    "a score opens a popover beside it, and a score of 1 sits between 0 and 2",
    JSON.stringify(popover));

  // The heading the popover is labelled by carries the id the markup names, and
  // that id belongs to one element in the whole page: a board reads it off its
  // own popover rather than writing a constant, so a second board cannot claim
  // the same one.
  const labelled = await page.evaluate(() => {
    const pop = document.querySelector("#gov-pop");
    const named = pop.getAttribute("aria-labelledby");
    return { named, heading: pop.querySelector("h2")?.id,
             everywhere: document.querySelectorAll(`[id="${named}"]`).length };
  });
  check(labelled.named === "gov-pop-title" && labelled.heading === labelled.named
      && labelled.everywhere === 1,
    "the popover is labelled by its own heading, and that id is used once in the page",
    JSON.stringify(labelled));

  // Pressing the same score again closes it rather than opening it once more.
  await cell.click();
  await page.waitForTimeout(150);
  const closed = await page.evaluate(() => !document.querySelector("#gov-pop").matches(":popover-open"));
  check(closed, "pressing the same score again closes the popover");

  // A question's name says what it asks and how its points are shared out.
  await page.locator('.question-row[data-question="3"] .row-name').click();
  await page.waitForTimeout(150);
  const about = await page.evaluate(() => {
    const pop = document.querySelector("#gov-pop");
    return {
      title: pop.querySelector("h2")?.textContent,
      shares: [...pop.querySelectorAll("h3")].map(n => n.textContent),
      checks: pop.querySelectorAll("details:not(.paper-fold)").length,
    };
  });
  check(about.title === "Guardrails" && about.shares.includes("How it is scored")
      && about.checks === 2,
    "a question's name opens what it asks and how it is scored", JSON.stringify(about));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  // A check's name opens, folded, what the working paper says about it: our
  // reading, then the paper's own words.
  await page.locator('#gov-check-2-3 .row-name').click();
  await page.waitForTimeout(150);
  const paper = await page.evaluate(() => {
    const fold = document.querySelector("#gov-pop .paper-fold");
    return {
      open: fold?.open,
      summary: fold?.querySelector("summary")?.textContent,
      quotes: fold?.querySelectorAll(".paper-quote").length,
      first: fold?.querySelector(".paper-quote p")?.textContent.slice(0, 40),
    };
  });
  check(paper.open === false && paper.summary === "What the working paper says" && paper.quotes === 3
      && paper.first === "the log opens with a one-paragraph scope",
    "a check's name opens the working paper's own words, folded", JSON.stringify(paper));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  await page.locator("#tab-coverage").click();
  await page.waitForTimeout(150);
  const back = await page.evaluate(() => ({
    coverageShown: !document.querySelector("#view-coverage").hidden,
    governanceHidden: document.querySelector("#view-governance").hidden,
    view: new URL(location.href).searchParams.get("view"),
  }));
  check(back.coverageShown && back.governanceHidden && back.view === null,
    "the first tab returns to the grid and drops ?view= from the address", JSON.stringify(back));

  // The tabs are one stop for the keyboard, and the arrows move between them.
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  const keyed = await page.evaluate(() => ({
    focused: document.activeElement?.id,
    view: new URL(location.href).searchParams.get("view"),
    governanceShown: !document.querySelector("#view-governance").hidden,
  }));
  check(keyed.focused === "tab-governance" && keyed.view === "governance" && keyed.governanceShown,
    "the right arrow on the first tab selects the second and writes its address",
    JSON.stringify(keyed));

  check(pageErrors.length === 0, "the governance view: no console errors", pageErrors.join("; "));
}

/* A PNG's dimensions, read out of its IHDR chunk: width and height are two
 * big-endian 32-bit integers at bytes 16 and 20. No dependency for four bytes
 * each. */
function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/* Rust pixels in a decoded PNG: #A0522D, and no page of this site paints that
 * colour anywhere, so finding it in the PNG is finding an annotation. Takes
 * the PNG's own bytes, base64-encoded, and decodes them inside the page
 * rather than in Node, since a PNG's pixels are compressed. */
const rustIn = async png => page.evaluate(async encoded => {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ink = canvas.getContext("2d");
  ink.drawImage(bitmap, 0, 0);
  const { data } = ink.getImageData(0, 0, bitmap.width, bitmap.height);
  let rust = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - 0xA0) < 12 && Math.abs(data[i + 1] - 0x52) < 12
     && Math.abs(data[i + 2] - 0x2D) < 12) rust += 1;
  }
  return rust;
}, png.toString("base64"));

// =============================================================================
console.log("== Overview: the board, on the scale of four and on the scale of ten ==");
/* The board reads its scale and its assessment from the publication. The
 * current fixture is out of four and carries no assessment, so the board is its
 * categories and nothing else; the publication of ten, answered to a pin,
 * carries the final score, the document as a whole and its contradictions. */
{
  const root = new URL("/", base).href;
  const S1 = "corpus@2026-01-01 > #sentences > ¶1";
  const S2 = "corpus@2026-01-01 > #sentences > ¶2";
  const B2 = "corpus@2026-01-01 > #blocks > ¶2";
  const openBoard = async query => {
    pageErrors = [];
    await page.goto(`${root}${query}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#board tbody tr").length > 0,
      undefined, { timeout: 10000 }).catch(() => {});
  };
  const readBoard = () => page.evaluate(() => {
    const rows = [...document.querySelectorAll("#board tbody tr")];
    const rowOf = name => rows.find(tr => tr.querySelector(".head-name")?.textContent === name);
    const read = button => (button ? {
      text: button.querySelector(".cell-figure")?.textContent ?? "",
      max: button.querySelector(".cell-max")?.textContent ?? "",
      label: button.getAttribute("aria-label"),
      background: getComputedStyle(button).backgroundColor,
    } : null);
    const cell = (name, column) =>
      read(rowOf(name)?.querySelectorAll("td")[column]?.querySelector(".cell-button"));
    return {
      heads: [...document.querySelectorAll("#board thead .company-button")].map(button => ({
        rank: button.querySelector(".rank")?.textContent.trim(),
        lab: button.querySelector(".company-name")?.textContent,
      })),
      caption: document.querySelector("#board caption")?.textContent ?? "",
      names: rows.map(tr => tr.querySelector(".head-name")?.textContent),
      subs: rows.map(tr => tr.querySelector(".head-sub")?.textContent ?? ""),
      folded: rows.filter(tr => tr.classList.contains("check-row")).every(tr => tr.hidden),
      cell,
      levels: [...document.querySelectorAll("#depth-key > li .anchor-level")].map(n => n.textContent),
      anchors: [...document.querySelectorAll("#depth-key > li .anchor-name")].map(n => n.textContent),
      conditions: [...document.querySelectorAll("#depth-key .depth-key-conditions li")]
        .map(n => n.textContent),
      keyTitle: document.querySelector("#depth-key-title")?.textContent,
      odd: document.querySelector("#depth-key-odd")?.textContent ?? "",
      ties: document.querySelector("#ties")?.textContent ?? "",
      method: document.querySelector("#method-body")?.textContent ?? "",
      methodOpen: document.querySelector("#method")?.open,
    };
  });
  const cellOf = async (name, column) => page.evaluate(([name, column]) => {
    const row = [...document.querySelectorAll("#board tbody tr")]
      .find(tr => tr.querySelector(".head-name")?.textContent === name);
    const button = row.querySelectorAll("td")[column].querySelector(".cell-button");
    return { text: button.querySelector(".cell-figure")?.textContent ?? "",
             max: button.querySelector(".cell-max")?.textContent ?? "",
             label: button.getAttribute("aria-label"),
             background: getComputedStyle(button).backgroundColor };
  }, [name, column]);
  const press = (name, column) => page.evaluate(([name, column]) => {
    const row = [...document.querySelectorAll("#board tbody tr")]
      .find(tr => tr.querySelector(".head-name")?.textContent === name);
    (column === null ? row.querySelector(".row-name")
      : row.querySelectorAll("td")[column].querySelector(".cell-button")).click();
  }, [name, column]);
  const fold = name => page.evaluate(name => {
    [...document.querySelectorAll("#board tbody tr")]
      .find(tr => tr.querySelector(".head-name")?.textContent === name)
      .querySelector(".row-toggle").click();
  }, name);
  const readPop = () => page.evaluate(() => ({
    open: document.querySelector("#grid-pop").matches(":popover-open"),
    title: document.querySelector("#grid-pop h2")?.textContent,
    subtitle: document.querySelector("#grid-pop .subtitle")?.textContent,
    body: document.querySelector("#grid-pop").textContent.replace(/\s+/g, " ").trim(),
    headings: [...document.querySelectorAll("#grid-pop h3")].map(h => h.textContent),
    here: [...document.querySelectorAll("#grid-pop .anchors li.is-here .anchor-name")]
      .map(n => n.textContent),
    judges: [...document.querySelectorAll("#grid-pop .judges .who")]
      .map(n => n.textContent.replace(/\s+/g, " ").trim()),
    buttons: [...document.querySelectorAll("#grid-pop .gov-button")].map(b => b.textContent),
  }));
  const readSheet = () => page.evaluate(() => ({
    open: document.querySelector("#sheet").open,
    title: document.querySelector("#sheet-title").textContent,
    body: document.querySelector("#sheet-body").textContent.replace(/\s+/g, " ").trim(),
    statuses: [...document.querySelectorAll("#sheet-body .claim-status")]
      .map(n => n.textContent.trim()),
    links: [...document.querySelectorAll("#sheet-body .passage-cite a")]
      .map(a => a.getAttribute("href")),
    readings: [...document.querySelectorAll("#sheet-body .readings tbody tr")]
      .map(tr => [...tr.querySelectorAll("td")].map(td => td.textContent.trim()).join("|")),
  }));
  const closeSheet = () => page.evaluate(() => document.querySelector("#sheet").close());
  const closePop = () => page.evaluate(() => document.querySelector("#grid-pop").hidePopover());

  // ---- the publication of four
  await openBoard("");
  const four = await readBoard();
  check(!four.names.includes("Final score") && !four.names.includes("The document as a whole"),
    "a publication of four has no final score and no document as a whole",
    JSON.stringify(four.names));
  check(four.names[0] === "Behaviours under test" && four.subs[0] === "out of 4, 2 behaviours"
      && four.folded,
    "its categories are the board's groups, folded", JSON.stringify([four.names, four.subs]));
  check(four.caption === "Each lab's behaviours by category, with each group's rows available "
      + "to open",
    "the caption promises the rows a publication of four has, and no others", four.caption);
  check(four.keyTitle === "Depth of a behaviour, out of 4"
      && four.levels.join() === "0,1,2,3,4" && four.conditions.length === 0 && four.odd === "",
    "the scale under the table is the scale of four, with no conditions and no line on odd figures",
    JSON.stringify([four.keyTitle, four.levels, four.odd]));
  check((await cellOf("Behaviours under test", 0)).label
      === "Acme, behaviours under test: 3.4 out of 4"
      && (await cellOf("Behaviours under test", 0)).background === "rgb(118, 147, 56)",
    "a category's figure is the plain mean of its behaviours, painted over 4",
    JSON.stringify(await cellOf("Behaviours under test", 0)));
  await fold("Behaviours under test");
  check((await cellOf("Defined behaviour", 0)).background === "rgb(168, 154, 47)"
      && (await cellOf("Defined behaviour", 0)).label
        === "Acme, defined behaviour: 2.7 out of 4",
    "a behaviour out of four wears the colour it always wore",
    JSON.stringify(await cellOf("Defined behaviour", 0)));
  check(pageErrors.length === 0, "the board out of four: no console errors", pageErrors.join("; "));

  // ---- the publication of ten
  await openBoard(`?publication=${TEN_PUBLICATION}`);
  const ten = await readBoard();
  check(ten.names.slice(0, 2).join(" | ") === "Final score | The document as a whole"
      && ten.subs.slice(0, 2).join(" | ") === "out of 20 | out of 10, five criteria"
      && ten.folded,
    "the final score leads, the document as a whole follows, and every group starts folded",
    JSON.stringify([ten.names, ten.subs, ten.folded]));
  check(ten.caption === "Each lab's final score, its document as a whole and its behaviours by "
      + "category, with each group's rows available to open",
    "the caption names the two rows a publication of ten adds", ten.caption);
  check(ten.heads[0].rank === "1" && ten.heads[0].lab === "Acme",
    "the rank sits above the lab's name", JSON.stringify(ten.heads.slice(0, 3)));
  const final = await cellOf("Final score", 0);
  check(final.text === "11.8" && final.max === "/20"
      && final.label === "Acme, final score: 11.8 out of 20"
      && final.background === "rgb(192, 158, 43)",
    "the final score is the behaviours plus the document as a whole, marked out of 20",
    JSON.stringify(final));
  const whole = await cellOf("The document as a whole", 0);
  check(whole.text === "6.0" && whole.max === "/10" && whole.background === "rgb(189, 158, 44)",
    "the document as a whole is its five criteria, out of 10", JSON.stringify(whole));
  const na = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#board tbody tr")];
    const cells = name => [...rows.find(tr => tr.querySelector(".head-name")?.textContent === name)
      .querySelectorAll("td .cell-button")].map(b => ({ text: b.textContent,
        na: b.classList.contains("cell-na"), label: b.getAttribute("aria-label") }));
    return { final: cells("Final score"), whole: cells("The document as a whole") };
  });
  check(na.final.filter(one => one.na).length === 7 && na.whole.filter(one => one.na).length === 7
      && na.final.every(one => one.na === (one.text === "NA"))
      && na.final.some(one => one.label === "Nowhere, final score: not assessed") === false,
    "a document with no assessment and a lab with no specification read NA on both rows",
    JSON.stringify(na.final.map(one => one.text)));
  check(ten.keyTitle === "Depth of a behaviour, out of 10"
      && ten.levels.join() === "0,2,4,6,8,10"
      && ten.anchors.join() === "absent,named,discussed,prescribed,demonstrated,bounded"
      && ten.conditions.length === 3
      && ten.conditions[0].startsWith("The edge is shown:")
      && ten.odd === "An odd figure means the level below is fully met and part of the next.",
    "the scale of ten sits under the table, with the three conditions under 10 and the odd line",
    JSON.stringify([ten.levels, ten.conditions, ten.odd]));

  await fold("Behaviours under test");
  const behaviour = await cellOf("Defined behaviour", 0);
  check(behaviour.text === "7.3" && behaviour.max === "/10"
      && behaviour.label === "Acme, defined behaviour: 7.3 out of 10"
      && behaviour.background === "rgb(152, 152, 50)",
    "a behaviour out of ten is painted over ten", JSON.stringify(behaviour));
  await press("Defined behaviour", 0);
  let popover = await readPop();
  check(popover.open && popover.body.includes("7.3 out of 10, prescribed and partly demonstrated")
      && popover.here.join() === "prescribed,demonstrated"
      && popover.judges.length === 3
      && popover.headings.includes("Why this figure")
      && popover.headings.includes("Where this specification stands"),
    "a figure opens on its words, its readings, its place on the scale and both notes",
    JSON.stringify([popover.headings, popover.here]));
  await closePop();

  await fold("The document as a whole");
  const criterion = await cellOf("Unresolved contradictions", 0);
  check(criterion.text === "1.0" && criterion.max === "/2",
    "each criterion is shown out of 2", JSON.stringify(criterion));
  await press("Unresolved contradictions", 0);
  popover = await readPop();
  check(popover.body.includes("1 confirmed of 2 listed")
      && popover.body.includes("No person has reviewed the list.")
      && popover.buttons.includes("Read the contradictions"),
    "the contradictions say how many were confirmed, that nobody reviewed them, and open the list",
    JSON.stringify([popover.body.slice(0, 200), popover.buttons]));
  await page.evaluate(() => [...document.querySelectorAll("#grid-pop .gov-button")]
    .find(button => button.textContent === "Read the contradictions").click());
  const sheet = await readSheet();
  check(sheet.open && sheet.title === "Acme: Unresolved contradictions"
      && sheet.statuses.join(" | ") === "Confirmed | Not confirmed",
    "the list opens in the sheet, confirmed first", JSON.stringify([sheet.title, sheet.statuses]));
  check(sheet.body.includes("Each seat lists every contradiction it finds")
      && sheet.body.includes("reads every claim, its own included")
      && !sheet.body.includes("put to the others"),
    "the sheet says how a contradiction was settled, by the second method",
    sheet.body.slice(0, 300));
  const links = sheet.links.map(href => new URL(href, root));
  check(links.length === 4
      && links.every(url => url.pathname === "/spec-reader/"
        && url.searchParams.get("publication") === TEN_PUBLICATION)
      && links.map(url => url.searchParams.get("passage")).join(" | ")
        === [S2, B2, S1, S2].join(" | "),
    "each claim quotes both its passages, each a link into the reader on that passage",
    JSON.stringify(sheet.links));
  check(sheet.readings.length === 6
      && sheet.readings.some(row => row.startsWith("b answered by d|"))
      && sheet.readings.filter(row => row.includes("|Yes|")).length >= 2,
    "every seat's reading is there, and a substitute is named in its seat",
    JSON.stringify(sheet.readings));
  await closeSheet();

  check(ten.method.includes("Final score, out of 20")
      && ten.method.includes("the plain mean of the document's behaviour depths")
      && ten.method.includes("reads every claim, its own included")
      && !ten.method.includes("put to the others")
      && !/sol|fable|deepseek|kimi/.test(ten.method)
      && ten.methodOpen === false,
    "how the scores are made is folded, says the second method, and names the payload's own seats",
    ten.method.slice(0, 300));
  check(ten.ties === "" || /share (first|second|third)/.test(ten.ties),
    "the ties line says which place is shared, or says nothing", ten.ties);
  check(pageErrors.length === 0, "the board out of ten: no console errors", pageErrors.join("; "));

  pageErrors = [];
  await page.goto(links[0].href, { waitUntil: "networkidle" });
  await page.waitForFunction(ready, undefined, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(700);
  const opened = await page.evaluate(() => {
    const status = document.querySelector("#reader-status");
    return {
      document: document.querySelector(".document-panel")?.dataset.documentId ?? null,
      current: document.querySelector(".document-panel [data-passage-id].current")
        ?.dataset.locators?.split("\n") ?? [],
      status: status.classList.contains("visible") ? status.textContent : "",
    };
  });
  check(opened.document === DOC_ID && opened.current.includes(S2) && opened.status === ""
      && pageErrors.length === 0,
    "a contradiction's passage opens the reader on that passage, in the same publication",
    `${JSON.stringify(opened)} ${pageErrors.join("; ")}`);
}

/* The bubble at the bottom right of every public page. What a walker can show
 * that no unit test can is that the pill is there on a page that is not the
 * reader, that the dialog refuses to send without both fields, and that what
 * arrives at the route is what was typed. */
console.log("== Every page: the feedback bubble ==");
{
  const root = new URL("/", base).href;
  pageErrors = [];
  await page.goto(`${root}overview.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);

  /* The paragraph-note dialog ran earlier in this walker and left its address
   * in localStorage under the key the bubble deliberately shares, so that
   * typing an address into one dialog saves typing it into the other. That is
   * a feature, and it is asserted here before it is cleared, because every
   * check below is about a dialog nobody has typed an address into yet. */
  const carried = await page.evaluate(() => {
    const field = document.querySelector("#pf-email");
    const was = field?.value;
    try {
      localStorage.removeItem("aci-feedback-email");
    } catch {
      // A private window. Nothing was remembered, so nothing needs clearing.
    }
    return was;
  });
  check(Boolean(carried) && carried.includes("@"),
    "an address the paragraph dialog remembered prefills the bubble", carried);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(250);

  const resting = await page.evaluate(() => {
    const pill = document.querySelector("#pf-pill");
    const box = pill?.getBoundingClientRect();
    return {
      there: Boolean(pill),
      label: pill?.textContent,
      // Near the corner rather than exactly 16px from it: a classic scrollbar
      // takes its own width out of innerWidth and the pill is positioned
      // against the viewport, which excludes it.
      corner: box ? (window.innerWidth - box.right) < 40
                 && (window.innerHeight - box.bottom) < 40 : false,
      closed: !document.querySelector("#pf-note").open,
    };
  });
  check(resting.there && resting.label === "Feedback" && resting.corner && resting.closed,
    "the pill rests in the bottom right corner of the overview, dialog closed",
    JSON.stringify(resting));

  await page.locator("#pf-pill").click();
  await page.waitForTimeout(150);
  let seen = await page.evaluate(() => ({
    open: document.querySelector("#pf-note").open,
    sendDisabled: document.querySelector("#pf-send").disabled,
    focused: document.activeElement?.id,
  }));
  check(seen.open && seen.sendDisabled && seen.focused === "pf-comment",
    "the dialog opens focused on the comment, with send refused while it is empty",
    JSON.stringify(seen));

  const named = await page.evaluate(() => {
    const note = document.querySelector("#pf-note");
    const by = note?.getAttribute("aria-labelledby");
    return { by, names: by ? document.getElementById(by)?.textContent : null };
  });
  check(named.by === "pf-title" && named.names === "Tell us what you see",
    "the dialog carries an accessible name, as every other dialog here does",
    JSON.stringify(named));

  await page.locator("#pf-comment").fill("The governance table runs off the right.");
  await page.waitForTimeout(80);
  seen = await page.evaluate(() => ({
    sendDisabled: document.querySelector("#pf-send").disabled,
  }));
  check(seen.sendDisabled, "words with no address still cannot be sent",
    JSON.stringify(seen));

  await page.locator("#pf-email").fill("reader@example.org");
  await page.waitForTimeout(80);
  seen = await page.evaluate(() => ({
    sendDisabled: document.querySelector("#pf-send").disabled,
  }));
  check(!seen.sendDisabled, "an address enables the send button", JSON.stringify(seen));

  // The checks above left the dialog open, and a native modal dialog's
  // backdrop makes everything behind it unclickable. Close it before asking
  // for a second opening.
  await page.evaluate(() => document.querySelector("#pf-note").close());
  await page.waitForTimeout(100);

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.locator("#pf-pill").click();
  await page.waitForSelector("#pf-shot img", { timeout: 20000 });
  const framed = await page.evaluate(() => ({
    shown: Boolean(document.querySelector("#pf-shot img")),
    wide: document.querySelector("#pf-shot img")?.naturalWidth,
    tall: document.querySelector("#pf-shot img")?.naturalHeight,
    // What the capture is cropped to, so the assertion below compares the PNG
    // with what the page says its own client area is rather than with a number
    // a scrollbar can move.
    clientWide: document.documentElement.clientWidth,
    clientTall: document.documentElement.clientHeight,
    dropOffered: !document.querySelector("#pf-drop").hidden,
  }));
  check(framed.shown && framed.dropOffered,
    "the capture appears in the dialog and the drop button is offered",
    JSON.stringify(framed));

  const drawn = await page.evaluate(async () => {
    const canvas = document.querySelector("#pf-marks");
    if (!canvas) return { there: false };
    const box = canvas.getBoundingClientRect();
    const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, bubbles: true, clientX: box.left + x, clientY: box.top + y,
    }));
    send("pointerdown", 40, 40);
    send("pointermove", 200, 160);
    send("pointerup", 200, 160);
    const ink = canvas.getContext("2d");
    const { data } = ink.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
    return { there: true, painted };
  });
  check(drawn.there && drawn.painted > 100,
    "a drag on the overlay paints a box onto it", JSON.stringify(drawn));

  /* A second mark, so undo can be told from clear. With one mark on the
   * overlay, an undo that wrongly emptied the whole list would look exactly
   * like an undo that popped the last one. */
  const twoMarks = await page.evaluate(() => {
    const canvas = document.querySelector("#pf-marks");
    const box = canvas.getBoundingClientRect();
    const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: 3, bubbles: true, clientX: box.left + x, clientY: box.top + y,
    }));
    send("pointerdown", 320, 40);
    send("pointermove", 460, 150);
    send("pointerup", 460, 150);
    const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
    return painted;
  });
  check(twoMarks > drawn.painted, "a second drag adds a mark rather than replacing the first",
    JSON.stringify({ one: drawn.painted, two: twoMarks }));

  const afterUndo = await page.evaluate(() => {
    document.querySelector("#pf-undo").click();
    const canvas = document.querySelector("#pf-marks");
    const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
    return painted;
  });
  check(afterUndo > 0 && afterUndo < twoMarks,
    "undo removes one mark and leaves the other",
    JSON.stringify({ two: twoMarks, afterUndo }));

  const afterClear = await page.evaluate(() => {
    document.querySelector("#pf-clear").click();
    const canvas = document.querySelector("#pf-marks");
    const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
    return painted;
  });
  check(afterClear === 0, "clear removes what undo left", String(afterClear));

  const typed = await page.evaluate(() => {
    document.querySelector("#pf-tool-text").click();
    const canvas = document.querySelector("#pf-marks");
    const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 5, bubbles: true, clientX: box.left + 80, clientY: box.top + 220,
    }));
    const field = document.querySelector(".pf-typing");
    if (!field) return { field: false };
    field.value = "This heading says the wrong date";
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
    return { field: true, gone: !document.querySelector(".pf-typing"), painted };
  });
  check(typed.field && typed.gone && typed.painted > 100,
    "the text tool takes words and paints them onto the overlay",
    JSON.stringify(typed));

  /* The check above only proves something was painted, not that it was the
   * words typed: a fixed placeholder in place of shape.text would paint just
   * as many pixels for a long sentence. Typing a single character in the
   * same place with the same tool and colour, and comparing the two rust
   * counts, tells them apart. The text tool is already selected from the
   * check above; the block reselects it anyway, so it does not depend on
   * that. */
  const byLength = await page.evaluate(() => {
    const canvas = document.querySelector("#pf-marks");
    const box = canvas.getBoundingClientRect();
    const ink = canvas.getContext("2d");
    const rustOn = () => {
      const { data } = ink.getImageData(0, 0, canvas.width, canvas.height);
      let rust = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0 && Math.abs(data[i] - 0xA0) < 12
         && Math.abs(data[i + 1] - 0x52) < 12 && Math.abs(data[i + 2] - 0x2D) < 12) rust += 1;
      }
      return rust;
    };
    const type = words => {
      document.querySelector("#pf-clear").click();
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        pointerId: 7, bubbles: true, clientX: box.left + 80, clientY: box.top + 260,
      }));
      const field = document.querySelector(".pf-typing");
      field.value = words;
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return rustOn();
    };
    document.querySelector("#pf-tool-text").click();
    const long = type("This heading says the wrong date");
    const short = type("X");
    return { long, short };
  });
  check(byLength.long > byLength.short * 3,
    "the words painted are the words typed, not a fixed string",
    JSON.stringify(byLength));

  const ringed = await page.evaluate(() => {
    document.querySelector("#pf-clear").click();
    document.querySelector("#pf-tool-circle").click();
    const canvas = document.querySelector("#pf-marks");
    const box = canvas.getBoundingClientRect();
    const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: 6, bubbles: true, clientX: box.left + x, clientY: box.top + y,
    }));
    send("pointerdown", 120, 300);
    send("pointermove", 280, 400);
    send("pointerup", 280, 400);
    const ink = canvas.getContext("2d");
    const { data } = ink.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
    // The middle of a circle is empty and the middle of a box's drag is too,
    // so what tells them apart is the corner: a box paints its corner, a
    // circle does not.
    const corner = ink.getImageData(
      Math.round((120 + 4) * (canvas.width / box.width)),
      Math.round((300 + 4) * (canvas.height / box.height)), 3, 3).data;
    let inked = 0;
    for (let i = 3; i < corner.length; i += 4) if (corner[i] > 0) inked += 1;
    return { painted, inked };
  });
  check(ringed.painted > 100 && ringed.inked === 0,
    "the circle tool paints a ring, and leaves the corner of its drag empty",
    JSON.stringify(ringed));

  const glyphs = await page.evaluate(() => {
    const tools = ["box", "circle", "arrow", "pen", "text"];
    return tools.map(name => {
      const button = document.querySelector(`#pf-tool-${name}`);
      return { name, there: Boolean(button),
               glyph: Boolean(button?.querySelector("svg")),
               word: button?.textContent.trim() };
    });
  });
  check(glyphs.every(tool => tool.there && tool.glyph && tool.word),
    "every tool carries a drawn glyph and keeps its word",
    JSON.stringify(glyphs));

  const reachable = await page.evaluate(() => {
    const link = document.querySelector("#pf-note a[href^='mailto:']");
    return { there: Boolean(link), href: link?.getAttribute("href") };
  });
  check(reachable.href === "mailto:sam@polariscollective.org",
    "the dialog offers a person as well as a form", JSON.stringify(reachable));

  await page.evaluate(() => {
    document.querySelector("#pf-clear").click();
    document.querySelector("#pf-tool-box").click();
  });

  const tooling = await page.evaluate(() => {
    document.querySelector("#pf-tool-arrow").click();
    return {
      arrow: document.querySelector("#pf-tool-arrow").getAttribute("aria-pressed"),
      box: document.querySelector("#pf-tool-box").getAttribute("aria-pressed"),
      undo: document.querySelector("#pf-undo").hasAttribute("aria-pressed"),
      clear: document.querySelector("#pf-clear").hasAttribute("aria-pressed"),
    };
  });
  check(tooling.arrow === "true" && tooling.box === "false"
      && !tooling.undo && !tooling.clear,
    "choosing a tool unpresses the one before it and leaves undo and clear alone",
    JSON.stringify(tooling));

  // Back to the box, and draw one that survives into the PNG the send carries.
  await page.evaluate(() => {
    document.querySelector("#pf-tool-box").click();
    const canvas = document.querySelector("#pf-marks");
    const box = canvas.getBoundingClientRect();
    const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: 2, bubbles: true, clientX: box.left + x, clientY: box.top + y,
    }));
    send("pointerdown", 60, 60);
    send("pointermove", 260, 200);
    send("pointerup", 260, 200);
  });

  await page.locator("#pf-comment").fill("The governance table runs off the right.");
  await page.locator("#pf-email").fill("reader@example.org");
  await page.locator("#pf-send").click();
  await page.waitForTimeout(800);
  const sent = lastPageFeedbackReceived();
  const size = sent?.screenshot ? pngSize(sent.screenshot.png) : null;
  check(Boolean(sent?.screenshot)
      && sent.screenshot.type === "image/png"
      && sent.capture_method === "html2canvas"
      && size.width === framed.clientWide && size.height === framed.clientTall,
    "a PNG of exactly the viewport arrives, filed as html2canvas",
    JSON.stringify({ ...size, want: [framed.clientWide, framed.clientTall],
                     bytes: sent?.screenshot?.bytes, method: sent?.capture_method }));

  /* The mark is in the bytes, not only on the overlay. Rust is #A0522D, and no
   * page of this site paints that colour anywhere, so finding it in the PNG is
   * finding the annotation. Read out of the decoded image rather than the file,
   * since a PNG's pixels are compressed. */
  const marked = await rustIn(sent.screenshot.png);
  check(marked > 100, "the box drawn on the overlay is in the PNG that was sent",
    `rust pixels: ${marked}`);

  check(sent?.comment === "The governance table runs off the right."
      && sent?.email === "reader@example.org"
      && sent?.page_url.endsWith("/overview.html")
      && /^\d+x\d+ @\d/.test(sent.viewport)
      && sent.user_agent.length > 0
      && sent.website === "",
    "the send posts the words, the address, the page, the window and the browser string",
    JSON.stringify({ ...sent, screenshot: true }));

  const kept = await page.evaluate(() => {
    try { return localStorage.getItem("aci-feedback-email"); } catch { return null; }
  });
  check(kept === "reader@example.org",
    "the address is remembered under the key the paragraph dialog already uses", kept);

  await page.waitForTimeout(1200);
  const closed = await page.evaluate(() => !document.querySelector("#pf-note").open);
  check(closed, "the dialog closes on its own after a successful send");

  /* The box above proved a mark reaches the posted PNG. A box paints its
   * corner and its middle stays empty either way, so it cannot stand for the
   * other tools: the same proof is owed to text and to a circle, each sent on
   * its own so the PNG being inspected carries exactly one kind of mark. */
  await page.locator("#pf-pill").click();
  await page.waitForSelector("#pf-shot img", { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector("#pf-tool-text").click();
    const canvas = document.querySelector("#pf-marks");
    const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 8, bubbles: true, clientX: box.left + 80, clientY: box.top + 220,
    }));
    const field = document.querySelector(".pf-typing");
    field.value = "This heading says the wrong date";
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await page.locator("#pf-comment").fill("A text mark, sent on its own.");
  await page.locator("#pf-send").click();
  await page.waitForTimeout(800);
  const sentText = lastPageFeedbackReceived();
  const textRust = sentText?.screenshot ? await rustIn(sentText.screenshot.png) : 0;
  check(textRust > 100, "a text mark reaches the PNG that is sent, not only the overlay",
    `rust pixels: ${textRust}`);

  await page.waitForTimeout(1200);
  await page.locator("#pf-pill").click();
  await page.waitForSelector("#pf-shot img", { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector("#pf-tool-circle").click();
    const canvas = document.querySelector("#pf-marks");
    const box = canvas.getBoundingClientRect();
    const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: 9, bubbles: true, clientX: box.left + x, clientY: box.top + y,
    }));
    send("pointerdown", 120, 300);
    send("pointermove", 280, 400);
    send("pointerup", 280, 400);
  });
  await page.locator("#pf-comment").fill("A circle mark, sent on its own.");
  await page.locator("#pf-send").click();
  await page.waitForTimeout(800);
  const sentCircle = lastPageFeedbackReceived();
  const circleRust = sentCircle?.screenshot ? await rustIn(sentCircle.screenshot.png) : 0;
  check(circleRust > 100, "a circle mark reaches the PNG that is sent, not only the overlay",
    `rust pixels: ${circleRust}`);

  await page.waitForTimeout(1200);
  await page.locator("#pf-pill").click();
  await page.waitForSelector("#pf-shot img", { timeout: 20000 });
  await page.locator("#pf-drop").click();
  await page.locator("#pf-comment").fill("No picture for this one.");
  await page.locator("#pf-send").click();
  await page.waitForTimeout(400);
  const wordsOnly = lastPageFeedbackReceived();
  check(wordsOnly?.comment === "No picture for this one."
      && wordsOnly.screenshot === null,
    "dropping the screenshot sends the words alone",
    JSON.stringify({ ...wordsOnly, screenshot: Boolean(wordsOnly?.screenshot) }));

  // The reader is the fourth page and the only one that is an application
  // rather than a document, so the pill is checked there too.
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  const onReader = await page.evaluate(() => Boolean(document.querySelector("#pf-pill")));
  check(onReader, "the pill is on the reader as well as the prose pages");

  /* The reader scrolls its own column, not the window, so a capture cropped at
   * window.scrollY would show the top of the document however far down the
   * reader has read. Asserting only that the capture is not blank would pass
   * whether or not the scroll is carried into it: a capture that ignored the
   * inner scroll would still show the column's top, which is not blank
   * either. What proves the fix is that the picture changes with the scroll,
   * so this takes two captures of the same page, one with the column at the
   * top and one scrolled well down, and counts how many pixels differ across
   * the whole image: nearly none would mean the capture never moved. */
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  const captureReaderShot = async () => {
    await page.locator("#pf-pill").click();
    await page.waitForSelector("#pf-shot img", { timeout: 20000 });
    const dataUrl = await page.evaluate(() => document.querySelector("#pf-shot img").src);
    await page.evaluate(() => document.querySelector("#pf-note")?.close());
    await page.waitForTimeout(100);
    return dataUrl;
  };

  const atTop = await captureReaderShot();

  /* Scrolled the way a reader scrolls it, and the column left exactly as the
   * stylesheet made it.
   *
   * This check used to set scroll-behavior to auto first, on the grounds that
   * a smooth scroll cannot be read back on the spot, and called that a
   * property of the measurement rather than of the reader. It was neither: it
   * was the one condition under which the capture worked. The clone inherits
   * that inline style, and a clone whose column scrolls instantly takes the
   * offset the capture gives it, where a clone that kept smooth silently
   * ignored it and photographed the top of the document. The test had built
   * the thing it was meant to catch.
   *
   * So it waits for the animation instead: ask, then poll until it settles. */
  const column = page.locator(".document-scroll").first();
  const found = await column.count();
  if (found) {
    await column.evaluate(node => { node.scrollTop = 900; });
    await page.waitForFunction(
      () => document.querySelector(".document-scroll").scrollTop > 700,
      undefined, { timeout: 5000 }).catch(() => {});
  }
  const scrolledBy = found
    ? await column.evaluate(node => node.scrollTop)
    : 0;
  check(scrolledBy > 0, "the reader has a column that scrolls inside the page",
    String(scrolledBy));

  const scrolledDown = await captureReaderShot();

  const scrollDiff = await page.evaluate(async ({ a, b }) => {
    const decode = async url => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      return canvas;
    };
    const [canvasA, canvasB] = await Promise.all([decode(a), decode(b)]);
    const width = Math.min(canvasA.width, canvasB.width);
    const height = Math.min(canvasA.height, canvasB.height);
    const dataA = canvasA.getContext("2d").getImageData(0, 0, width, height).data;
    const dataB = canvasB.getContext("2d").getImageData(0, 0, width, height).data;
    let differing = 0;
    for (let i = 0; i < dataA.length; i += 4) {
      if (Math.abs(dataA[i] - dataB[i]) > 10
       || Math.abs(dataA[i + 1] - dataB[i + 1]) > 10
       || Math.abs(dataA[i + 2] - dataB[i + 2]) > 10) differing += 1;
    }
    return { differing, total: width * height, width, height };
  }, { a: atTop, b: scrolledDown });

  check(scrollDiff.total > 0 && scrollDiff.differing / scrollDiff.total > 0.1,
    "a capture with the column scrolled down differs substantially from one at the top",
    JSON.stringify(scrollDiff));

  /* A popover open when the pill is pressed must survive into the picture:
   * showModal on the bubble's own dialog closes every open auto popover
   * natively, so the fix measures a popover's box before that happens rather
   * than after. Proved by comparing two captures of the same page, one taken
   * with a popover open and one with nothing open: if the popover were not
   * drawn, the two would agree everywhere, including inside its own box.
   *
   * Two ways of pressing the pill are checked, because they reach the fix
   * differently. A real pointer click dismisses any open auto popover on its
   * own, natively, on pointerdown's default action, before the "click" event
   * is even dispatched: measured directly with a document.querySelectorAll(
   * ":popover-open").length count taken at three capture-phase listeners on
   * the pill (pointerdown, pointerup, click), the popover was still open at
   * pointerdown and already gone by pointerup and click. That is why the
   * pill's own pointerdown listener, not its click handler, is what tags the
   * floating elements now: a listener runs before the default action of its
   * own event, so pointerdown sees the popover the click handler cannot. A
   * keyboard activation fires "click" with no pointerdown before it, so it
   * is checked too, on the fallback path that re-tags inside the click
   * handler itself. */
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);

  const pressPillByKeyboard = async () => {
    await page.focus("#pf-pill");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#pf-shot img", { timeout: 20000 });
    const dataUrl = await page.evaluate(() => document.querySelector("#pf-shot img").src);
    await page.evaluate(() => document.querySelector("#pf-note")?.close());
    await page.waitForTimeout(100);
    return dataUrl;
  };

  const pressPillByMouse = async () => {
    const box = await page.locator("#pf-pill").boundingBox();
    // A real mouse click, not locator.click(): the point of this path is the
    // browser's own native light dismiss, which only fires for trusted
    // pointer input.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector("#pf-shot img", { timeout: 20000 });
    const dataUrl = await page.evaluate(() => document.querySelector("#pf-shot img").src);
    await page.evaluate(() => document.querySelector("#pf-note")?.close());
    await page.waitForTimeout(100);
    return dataUrl;
  };

  const diffWithinBox = (a, b, box) => page.evaluate(async ({ a, b, box }) => {
    const clientWide = document.documentElement.clientWidth;
    const clientTall = document.documentElement.clientHeight;
    const decode = async url => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      return canvas;
    };
    const [canvasA, canvasB] = await Promise.all([decode(a), decode(b)]);
    const scaleX = canvasA.width / clientWide;
    const scaleY = canvasA.height / clientTall;
    const x = Math.max(0, Math.floor(box.left * scaleX));
    const y = Math.max(0, Math.floor(box.top * scaleY));
    const w = Math.max(1, Math.min(canvasA.width - x, Math.ceil(box.width * scaleX)));
    const h = Math.max(1, Math.min(canvasA.height - y, Math.ceil(box.height * scaleY)));
    const dataA = canvasA.getContext("2d").getImageData(x, y, w, h).data;
    const dataB = canvasB.getContext("2d").getImageData(x, y, w, h).data;
    let differing = 0;
    for (let i = 0; i < dataA.length; i += 4) {
      if (Math.abs(dataA[i] - dataB[i]) > 10
       || Math.abs(dataA[i + 1] - dataB[i + 1]) > 10
       || Math.abs(dataA[i + 2] - dataB[i + 2]) > 10) differing += 1;
    }
    return { differing, total: w * h, width: w, height: h };
  }, { a, b, box });

  const noteTrigger = `[data-behaviour-note="${DEFINED}"]`;
  const triggerThere = await page.evaluate(
    sel => Boolean(document.querySelector(sel)), noteTrigger);
  if (!triggerThere) {
    check(false, "a popover is reachable in the fixture, to prove it reaches the capture",
      "no [data-behaviour-note] trigger found on the reader");
  } else {
    const withoutNote = await pressPillByKeyboard();

    await page.click(noteTrigger);
    await page.waitForTimeout(150);
    const noteBox = await page.evaluate(() => {
      const note = document.querySelector("#key-note");
      if (!note?.matches(":popover-open")) return null;
      const rect = note.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    });
    check(Boolean(noteBox) && noteBox.width > 0 && noteBox.height > 0,
      "the behaviour note is open as a popover before the pill is pressed",
      JSON.stringify(noteBox));

    const withNote = await pressPillByKeyboard();

    const popoverDiff = noteBox && await diffWithinBox(withoutNote, withNote, noteBox);

    check(Boolean(popoverDiff) && popoverDiff.total > 0
        && popoverDiff.differing / popoverDiff.total > 0.3,
      "a popover open when the pill is pressed is drawn into the capture, not closed by the dialog",
      JSON.stringify(popoverDiff));

    // Same proof again, this time with a real mouse click on the pill: the
    // path the pointerdown fix exists for.
    const withoutNoteMouse = await pressPillByMouse();

    await page.click(noteTrigger);
    await page.waitForTimeout(150);
    const noteBoxMouse = await page.evaluate(() => {
      const note = document.querySelector("#key-note");
      if (!note?.matches(":popover-open")) return null;
      const rect = note.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    });
    check(Boolean(noteBoxMouse) && noteBoxMouse.width > 0 && noteBoxMouse.height > 0,
      "the behaviour note is open as a popover before the pill is pressed by mouse",
      JSON.stringify(noteBoxMouse));

    const withNoteMouse = await pressPillByMouse();

    const popoverDiffMouse = noteBoxMouse
      && await diffWithinBox(withoutNoteMouse, withNoteMouse, noteBoxMouse);

    check(Boolean(popoverDiffMouse) && popoverDiffMouse.total > 0
        && popoverDiffMouse.differing / popoverDiffMouse.total > 0.3,
      "a popover open when the pill is pressed by mouse is drawn into the capture, "
      + "not closed by light dismiss",
      JSON.stringify(popoverDiffMouse));
  }

  /* Finding 3: the reader's own document-level keydown handler bails on a
   * focused textarea, select or checkbox-less input, but not on a focused
   * button, and this dialog is mostly buttons. With a tool button focused
   * and the dialog open, j must stay inside the dialog rather than reach the
   * reader behind it, where it would step to the next passage, scroll the
   * document column and rewrite the address (dropPassageParam calls
   * history.replaceState). Read before and after rather than asserting
   * nothing moved by construction, so a regression here would fail loudly. */
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  await page.locator("#pf-pill").click();
  await page.waitForSelector("#pf-shot img", { timeout: 20000 });
  await page.focus("#pf-tool-box");

  const readerState = () => page.evaluate(() => {
    const column = [...document.querySelectorAll("*")]
      .find(node => node.scrollHeight > node.clientHeight + 400
                 && getComputedStyle(node).overflowY !== "visible");
    return { href: location.href, scrollTop: column ? column.scrollTop : null };
  });

  const beforeJ = await readerState();
  await page.keyboard.press("j");
  await page.waitForTimeout(150);
  const afterJ = await readerState();

  check(afterJ.href === beforeJ.href && afterJ.scrollTop === beforeJ.scrollTop,
    "with the bubble's dialog open and a tool button focused, j does not change "
  + "location.href and does not scroll the reader's column",
    JSON.stringify({ beforeJ, afterJ }));

  await page.evaluate(() => document.querySelector("#pf-note")?.close());

  /* Every capture above tags data-pf-sticky, data-pf-scrolled and
   * data-pf-floating onto live page elements, and the last of the three is
   * only ever removed by a click that runs its course: a press abandoned
   * before it becomes a click, or a capture that throws, must not leave any
   * of them behind on a page a reader goes on looking at. */
  const leftover = await page.evaluate(() =>
    document.querySelectorAll("[data-pf-sticky], [data-pf-scrolled], [data-pf-floating]").length);
  check(leftover === 0,
    "no capture-only attribute is left on the page once a capture has run",
    String(leftover));

  /* A modal dialog makes everything outside its own subtree inert, the top
   * layer included: a pill raised into it with showPopover is drawn above the
   * backdrop and still refuses a click, measured against this application. So
   * the pill moves into whatever modal is open, which is the one place the
   * platform leaves operable. The overview opens the contradictions of a
   * document in a modal sheet, and somebody who wants to report that sheet has
   * to reach the pill while looking at it.
   *
   * Under the pin, because that sheet holds a publication's assessment and the
   * fixture the front page answers with carries none. Every other press on the
   * board opens a popover, which is not a modal and takes nothing in. */
  await page.goto(`${root}?publication=${TEN_PUBLICATION}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelectorAll("#board tbody tr").length > 0,
    undefined, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  const atRest = await page.evaluate(() =>
    document.querySelector("#pf-pill")?.parentElement?.tagName);
  check(atRest === "BODY", "with nothing open the pill lives on the body", atRest);

  const openedTheSheet = await page.evaluate(() => {
    const rowOf = name => [...document.querySelectorAll("#board tbody tr")]
      .find(tr => tr.querySelector(".head-name")?.textContent === name);
    rowOf("The document as a whole")?.querySelector(".row-toggle")?.click();
    rowOf("Unresolved contradictions")?.querySelector("td .cell-button")?.click();
    const read = [...document.querySelectorAll("#grid-pop .gov-button")]
      .find(button => button.textContent === "Read the contradictions");
    read?.click();
    return Boolean(read);
  });
  if (openedTheSheet) {
    await page.waitForTimeout(300);
    const tookItIn = await page.evaluate(() => {
      const pill = document.querySelector("#pf-pill");
      const box = pill.getBoundingClientRect();
      const over = document.elementFromPoint(box.left + box.width / 2,
                                             box.top + box.height / 2);
      return {
        modals: [...document.querySelectorAll("dialog[open]")].map(one => one.id),
        host: pill.parentElement?.id || pill.parentElement?.tagName,
        reachable: over === pill,
      };
    });
    check(tookItIn.modals.length > 0 && tookItIn.host === tookItIn.modals[tookItIn.modals.length - 1]
        && tookItIn.reachable,
      "a modal panel takes the pill in, where it can still be pressed",
      JSON.stringify(tookItIn));

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const gaveItBack = await page.evaluate(() =>
      document.querySelector("#pf-pill")?.parentElement?.tagName);
    check(gaveItBack === "BODY", "closing the panel gives the pill back to the body", gaveItBack);
  } else {
    check(false, "the overview has a modal panel to test the pill against");
  }

  /* The cross. Escape closed this dialog before there was one, and still does,
   * but a cross is what somebody looks for. */
  await page.locator("#pf-pill").click();
  await page.waitForTimeout(200);
  const crossPressed = await page.evaluate(() => {
    const cross = document.querySelector("#pf-close");
    if (!cross) return { there: false };
    const its = cross.getBoundingClientRect();
    const dialog = document.querySelector("#pf-note").getBoundingClientRect();
    cross.click();
    return {
      there: true,
      label: cross.getAttribute("aria-label"),
      topRight: its.top - dialog.top < 40 && dialog.right - its.right < 40,
      closed: !document.querySelector("#pf-note").open,
    };
  });
  check(crossPressed.there && crossPressed.label === "Close" && crossPressed.topRight && crossPressed.closed,
    "the cross sits at the dialog's top right, is labelled, and closes it",
    JSON.stringify(crossPressed));

  check(pageErrors.length === 0, "the feedback bubble: no console errors",
    pageErrors.join("; "));
}

// =============================================================================
const unexpectedMissing = [...new Set(missingPaths)];
check(unexpectedMissing.length === 0, "nothing unexpected 404s",
  unexpectedMissing.join(", ") || "nothing");

await browser.close();
server.close();
console.log(failures ? `${failures} FAILURES` : "ALL FEATURE CHECKS PASSED.");
process.exit(failures ? 1 : 0);
