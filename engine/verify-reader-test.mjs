#!/usr/bin/env node
// Verify the spec reader (site/spec-reader/) against its behaviour payload --
// the shipped panel run it resolves by default (its own data/behaviours.json:
// the resolution chain is ?data= pin -> data/manifest.json latest -> fallback,
// and the committed state carries neither a pin nor a manifest) -- and the
// spec text it renders. The client's band math renders nothing below the
// related cut, so the view at all tiers shows exactly the band keep-set: the
// committed data/behaviours-v5-reader.json (the same v5 run cut at that
// boundary) is the oracle for every expected passage count here. Every
// behaviour x spec view must anchor exactly its keep-set count, the nav must
// be intact and every nav link must resolve, the shipped fallback payload
// must return 200, with no unresolved-anchor warnings and no console errors;
// with an empty behaviour set, both specs must render in full with nothing
// highlighted.
// Usage: node engine/verify-reader-test.mjs   (requires Chrome installed)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const SITE = join(fileURLToPath(new URL("..", import.meta.url)), "site");
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/* Every 404 this server emits, audited at the end: the committed state has no
 * manifest, so the reader's manifest fetch is EXPECTED to 404 (it falls through
 * to the shipped data) -- but Chrome logs each one as a console error, and so
 * would a genuinely moved file. The server-side audit tells the two apart. */
const missingPaths = [];
const server = createServer(async (request, response) => {
  let path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(join(SITE, path));
    response.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    response.end(body);
  } catch {
    missingPaths.push(path);
    response.writeHead(404).end("not found");
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/spec-reader/`;

const behaviours = JSON.parse(
  await readFile(join(SITE, "spec-reader/data/behaviours.json"), "utf8"),
).behaviours;
/* The band keep-set: same v5 run, cut at the boundary the client's lowest band
 * applies. What the reader can render IS this set, so its coverage is the
 * passage-count oracle for every view below. */
const keepSet = new Map(JSON.parse(
  await readFile(join(SITE, "spec-reader/data/behaviours-v5-reader.json"), "utf8"),
).behaviours.map(behaviour => [behaviour.slug, behaviour]));
const documents = JSON.parse(
  await readFile(join(SITE, "spec-reader/data/documents.json"), "utf8"),
).documents;

/* The two payloads above are built by different scripts and can legally diverge.
 * The behaviour payload carries no document list of its own, so the list comes
 * from the spec text payload -- which grows a document the moment a user
 * registers a spec (build-spec-reader-data.py --user-manifest=), while the
 * behaviour set still covers the bundled pair. A document the behaviour set says
 * nothing about anchors nothing: assert that, rather than dereferencing a
 * coverage record that was never written. On the committed two-document tree
 * every document has a record, so this is a no-op. */
const coveredPassages = (behaviour, id) => behaviour.coverage[id]?.passages ?? [];
/* The keep-set coverage for a behaviour slug. */
const renderable = (slug, id) => coveredPassages(keepSet.get(slug) ?? { coverage: {} }, id);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", error => consoleErrors.push(String(error)));

let failures = 0;

// Two citations that pin different sentences of one paragraph resolve to the same rendered
// block, and a block carries one passage marker however many citations land on it. So what
// a view must show is the number of distinct blocks the behaviour cites, not the number of
// citations: strip the sentence suffix (`¶3 s2`, `¶18 s2-s4`, `¶9 s2-4`) and count.
const blockOf = locator => locator.replace(/ s\d+(?:-s?\d+)?$/, "");
const anchorCount = passages => new Set(passages.map(passage => blockOf(passage.locator))).size;

function report(ok, label, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
}

async function readView(url) {
  /* Every view walks with all three bands on so the rendered anchors must equal
   * the keep-set count; the default view keeps the related band collapsed (and
   * verify-reader-features.mjs covers the band cuts). */
  url += (url.includes("?") ? "&" : "?") + "tiers=defining,core,related";
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !document.querySelector(".passage-count").textContent.startsWith("Loading"),
    { timeout: 10000 },
  );
  await page.waitForTimeout(150);
  return page.evaluate(() => ({
    passages: document.querySelectorAll("[data-passage-id]").length,
    status: document.querySelector("#reader-status").textContent.trim(),
    behaviour: document.querySelector("#finding-behaviour").textContent,
    // Body text of every rendered panel, to prove the spec itself is there to read.
    panels: [...document.querySelectorAll(".document-panel")].map(panel => ({
      lab: panel.querySelector(".document-lab").textContent,
      blocks: panel.querySelectorAll(".document-body [data-block]").length,
      // Nothing may be collapsed out of view while there is no behaviour to focus on.
      hiddenBlocks: [...panel.querySelectorAll(".document-body > *")]
        .filter(child => child.hidden).length,
      collapsedSections: panel.querySelectorAll(".section-collapsed").length,
      // Computed display, not the property: a stylesheet rule that sets its own display
      // silently beats [hidden], which is how the highlight legend first leaked through.
      focusToggleHidden: getComputedStyle(panel.querySelector(".document-focus-toggle")).display === "none",
      legendHidden: getComputedStyle(panel.querySelector(".rail-legend")).display === "none",
    })),
    emptyMenu: Boolean(document.querySelector(".behaviour-empty")),
    menuItems: document.querySelectorAll("[data-behaviour]").length,
    ticked: [...document.querySelectorAll("[data-behaviour]")]
      .filter(input => input.checked).map(input => input.dataset.behaviour),
    // A passage carries the name of every behaviour that cites it, so a selection of
    // several can be accounted for behaviour by behaviour.
    byBehaviour: [...document.querySelectorAll("[data-passage-id]")]
      .reduce((tally, anchor) => {
        anchor.dataset.behaviours.split(" · ").forEach(name => {
          tally[name] = (tally[name] || 0) + 1;
        });
        return tally;
      }, {}),
    // Marked as shared, and cited by more than one: the same passages, counted two ways.
    sharedMarked: document.querySelectorAll(".passage-overlap[data-passage-id]").length,
    sharedCited: [...document.querySelectorAll("[data-passage-id]")]
      .filter(anchor => anchor.dataset.behaviours.includes(" · ")).length,
  }));
}

async function expectView(url, expected, label) {
  const seen = await readView(url);
  const ok = seen.passages === expected.passages
    && seen.status === ""
    && seen.behaviour === expected.behaviour;
  report(ok, label, `${seen.passages}/${expected.passages} passages`
    + (seen.status ? `  status: ${seen.status}` : "")
    + (seen.behaviour !== expected.behaviour ? `  behaviour: ${seen.behaviour}` : ""));
}

// Navigation: the expected links must be present and every one must resolve
// (any #fragment to a real id in its target).
await readView(base);
const expectedNav = ["./", "../methodology.html"];
const navHrefs = await page.evaluate(
  () => [...document.querySelectorAll('nav[aria-label="Primary navigation"] a')].map(a => a.getAttribute("href")),
);
const missingNav = expectedNav.filter(href => !navHrefs.includes(href));
report(missingNav.length === 0, "navigation presence",
  missingNav.length ? `missing nav link(s): ${missingNav.join(", ")}` : "all expected nav links present");
const navIssues = await page.evaluate(async expected => {
  const issues = [];
  for (const href of expected) {
    const url = new URL(href, location.href);
    const response = await fetch(url.pathname);
    if (!response.ok) { issues.push(`${href} -> HTTP ${response.status}`); continue; }
    if (!url.hash) continue;
    const id = decodeURIComponent(url.hash.slice(1));
    const target = url.pathname === location.pathname
      ? document
      : new DOMParser().parseFromString(await response.text(), "text/html");
    if (!target.getElementById(id)) issues.push(`${href} -> no element #${id}`);
  }
  return issues;
}, navHrefs);
report(navIssues.length === 0, "navigation links resolve",
  navIssues.length ? navIssues.join("; ") : "self-link, methodology");

// The committed state resolves to the shipped fallback: no ?data= pin, and no
// manifest (it is gitignored run output). A local manifest would shadow the
// fallback and silently swap the payload under test, so fail loud on it; and
// the fallback file itself must serve, or the menu empties.
const manifestStatus = await page.evaluate(async () =>
  (await fetch("./data/manifest.json")).status);
report(manifestStatus === 404, "no manifest shadows the shipped fallback",
  `HTTP ${manifestStatus}`);
const fallbackStatus = await page.evaluate(async () =>
  (await fetch("./data/behaviours.json")).status);
report(fallbackStatus === 200, "shipped fallback payload returns 200",
  `HTTP ${fallbackStatus}`);

if (behaviours.length === 0) {
  // The behaviour set is empty: the point is that both specs are fully readable and untouched.
  for (const document of documents) {
    const seen = await readView(`${base}?spec=${document.id}`);
    const panel = seen.panels[0];
    report(
      seen.passages === 0
        && seen.status === ""
        && seen.emptyMenu
        && seen.menuItems === 0
        && seen.behaviour === "No behavior under test"
        && panel?.blocks > 100
        && panel.hiddenBlocks === 0
        && panel.collapsedSections === 0
        && panel.focusToggleHidden
        && panel.legendHidden,
      `empty behaviour set · ${document.id}`,
      `${seen.passages} passages, ${panel?.blocks} blocks, ${panel?.hiddenBlocks} hidden,`
      + ` menu items ${seen.menuItems}`
      + (seen.status ? `, status: ${seen.status}` : ""),
    );
  }
  const compared = await readView(`${base}?compare=1`);
  report(
    compared.panels.length === 2
      && compared.passages === 0
      && compared.panels.every(panel => panel.blocks > 100 && panel.hiddenBlocks === 0),
    "empty behaviour set · compare",
    compared.panels.map(panel => `${panel.lab} ${panel.blocks} blocks, ${panel.hiddenBlocks} hidden`).join(", "),
  );
} else {
  for (const behaviour of behaviours) {
    let total = 0;
    for (const document of documents) {
      const passages = anchorCount(renderable(behaviour.slug, document.id));
      total += passages;
      await expectView(
        `${base}?behavior=${behaviour.slug}&spec=${document.id}`,
        { passages, behaviour: behaviour.name },
        `${behaviour.slug} · ${document.id}`,
      );
      // Tint/role agreement, continuously: every Related-tinted passage must
      // carry the "Related," role prefix and every solid passage must not.
      const tint = await page.evaluate(() => {
        const ps = [...document.querySelectorAll("[data-passage-id]")];
        let bad = 0;
        for (const el of ps) {
          const adj = el.classList.contains("adjacent");
          const role = el.querySelector(".passage-reason-role")?.textContent ?? "";
          if (adj !== role.includes("Related,")) bad++;
        }
        return { n: ps.length, bad };
      });
      report(tint.bad === 0, `${behaviour.slug} · ${document.id} · tint/role agreement`,
        `${tint.n} passages`);
    }
    await expectView(
      `${base}?behavior=${behaviour.slug}&compare=1`,
      { passages: total, behaviour: behaviour.name },
      `${behaviour.slug} · compare`,
    );
  }

  // Several behaviours read over the same text. Each must still anchor exactly its own
  // published passages; where two of them cite one passage it is highlighted once and
  // marked as shared, rather than counted twice or overwritten by the last one drawn.
  const selections = [behaviours.slice(0, 3), behaviours];
  for (const selection of selections) {
    const slugs = selection.map(behaviour => behaviour.slug);
    for (const document of documents) {
      const seen = await readView(`${base}?behavior=${slugs.join(",")}&spec=${document.id}`);
      const short = selection.map(behaviour =>
        `${behaviour.slug} ${seen.byBehaviour[behaviour.name] || 0}/${anchorCount(renderable(behaviour.slug, document.id))}`);
      const accounted = selection.every(behaviour =>
        (seen.byBehaviour[behaviour.name] || 0) === anchorCount(renderable(behaviour.slug, document.id)));
      report(
        accounted
          && seen.status === ""
          && seen.sharedMarked === seen.sharedCited
          && seen.ticked.join(",") === slugs.join(","),
        `${slugs.length} behaviours · ${document.id}`,
        `${seen.passages} passages, ${seen.sharedMarked} shared`
        + (accounted ? "" : `  unaccounted: ${short.join(", ")}`)
        + (seen.status ? `, status: ${seen.status}` : ""),
      );
    }
  }

  // Ticking the menu must change only the highlight layer: the reader keeps its place in
  // the text, and the behaviour taken away takes its passages with it.
  const [first, second] = behaviours;
  await readView(`${base}?behavior=${first.slug},${second.slug}&spec=anthropic`);
  await page.evaluate(() => { document.querySelector(".document-scroll").scrollTop = 2400; });
  // The panel scrolls smoothly, so wait for two readings in a row that agree before
  // taking the position the toggle is supposed to leave alone.
  await page.waitForFunction(() => {
    const scroll = document.querySelector(".document-scroll");
    const settled = scroll.scrollTop > 0 && scroll.scrollTop === scroll._previousTop;
    scroll._previousTop = scroll.scrollTop;
    return settled;
  });
  const before = await page.evaluate(() => document.querySelector(".document-scroll").scrollTop);
  await page.click(`.behaviour-option:has([data-behaviour="${first.slug}"])`);
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    scrollTop: document.querySelector(".document-scroll").scrollTop,
    passages: document.querySelectorAll("[data-passage-id]").length,
    behaviour: document.querySelector("#finding-behaviour").textContent,
    url: new URL(location.href).searchParams.get("behavior"),
  }));
  report(
    Math.abs(after.scrollTop - before) < 4
      && after.passages === anchorCount(renderable(second.slug, "anthropic"))
      && after.behaviour === second.name
      && after.url === second.slug,
    "unticking one of two · anthropic",
    `scroll ${before} → ${after.scrollTop}, ${after.passages} passages left,`
    + ` menu reads ${after.behaviour}, url ${after.url}`,
  );

  // And with the last behaviour unticked, the specification is readable in full again.
  await page.click("#clear-behaviours");
  await page.waitForTimeout(250);
  const cleared = await page.evaluate(() => ({
    passages: document.querySelectorAll("[data-passage-id]").length,
    hiddenBlocks: [...document.querySelectorAll(".document-body > *")].filter(child => child.hidden).length,
    collapsedSections: document.querySelectorAll(".section-collapsed").length,
    behaviour: document.querySelector("#finding-behaviour").textContent,
    focusToggleHidden: getComputedStyle(document.querySelector(".document-focus-toggle")).display === "none",
    url: new URL(location.href).searchParams.get("behavior"),
  }));
  report(
    cleared.passages === 0
      && cleared.hiddenBlocks === 0
      && cleared.collapsedSections === 0
      && cleared.behaviour === "No behaviours selected"
      && cleared.focusToggleHidden
      && cleared.url === null,
    "nothing ticked · anthropic",
    `${cleared.passages} passages, ${cleared.hiddenBlocks} hidden,`
    + ` ${cleared.collapsedSections} collapsed, menu reads ${cleared.behaviour}`,
  );

  // Nothing ticked is nothing to take away.
  report(
    await page.evaluate(() => document.querySelector("#download-passages").disabled),
    "export · nothing ticked",
    "download disabled",
  );

  // The export carries the reading away from the reader: every published citation of every
  // ticked behaviour, in both specifications, as the whole citation -- quote and locator and
  // role sentence -- and counted per citation rather than per highlighted block, because two
  // sentences of one paragraph are two citations even where they light one passage. What the
  // reader publishes is the keep-set, so the export must carry exactly the keep-set citations.
  const exported = behaviours.slice(0, 3);
  const citations = exported.flatMap(behaviour =>
    documents.flatMap(document => renderable(behaviour.slug, document.id)));
  await readView(`${base}?behavior=${exported.map(behaviour => behaviour.slug).join(",")}&spec=anthropic`);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#download-passages"),
  ]);
  const markdown = await readFile(await download.path(), "utf8");
  const missing = citations.filter(passage =>
    !markdown.includes(`\`${passage.locator}\``)
    || !markdown.includes(`> ${passage.quote.trim().split("\n")[0]}`.trimEnd())
    || !markdown.includes(passage.role));
  const written = (markdown.match(/^#### /gm) || []).length;
  const hint = (await page.textContent("#download-hint")).trim();
  const expectedHint = `${exported.length} behaviours, ${citations.length} passages, both specs`;
  report(
    missing.length === 0
      && written === citations.length
      && hint === expectedHint
      && exported.every(behaviour =>
        markdown.includes(`## ${String(behaviour.id).padStart(2, "0")} · ${behaviour.name}`)
        && markdown.includes(behaviour.definition))
      && documents.every(document =>
        markdown.includes(`### ${document.lab} · ${document.title} (${document.version})`)),
    `export · ${exported.length} behaviours`,
    `${download.suggestedFilename()}, ${written}/${citations.length} citations, menu reads ${hint}`
    + (missing.length ? `, missing ${missing.slice(0, 3).map(passage => passage.locator).join("; ")}` : ""),
  );
}

/* 404 audit: the only path allowed to miss is the manifest (its absence is the
 * fresh-clone state the reader is designed to fall through). Anything else
 * missing is a moved or renamed file failing loud, exactly as intended. */
const unexpectedMissing = [...new Set(missingPaths)].filter(path => path !== "/spec-reader/data/manifest.json");
report(unexpectedMissing.length === 0, "nothing unexpected 404s",
  unexpectedMissing.join(", ") || "only the absent manifest");
/* Chrome echoes every 404 -- including the audited manifest one -- into the
 * console as "Failed to load resource ... 404"; the audit above is the real
 * check, so only that exact message is filtered here. */
const realConsoleErrors = consoleErrors.filter(message =>
  message !== "Failed to load resource: the server responded with a status of 404 (Not Found)");
if (realConsoleErrors.length) {
  failures += 1;
  console.log("console errors:", realConsoleErrors);
}
await browser.close();
server.close();
console.log(failures ? `${failures} failures` : "All views verified.");
process.exit(failures ? 1 : 0);
