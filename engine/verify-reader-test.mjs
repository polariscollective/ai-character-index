#!/usr/bin/env node
// Verify the spec reader (site/spec-reader/) against its behaviour payload --
// the shipped panel run it resolves by default (its own data/behaviours.json:
// the resolution chain is a ?publication= pin, then the current publication,
// both answered here from the committed files) -- and the
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
import { serveReaderRoute } from "./reader-routes.mjs";

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
// The reader's payloads come from routes, and those routes read the database.
// This walker tests the page, so it serves a fixture pair instead: a small
// synthetic index built on the parser corpus, whose locators are real.
const READER_DATA = join(fileURLToPath(new URL("..", import.meta.url)),
                         "tests", "fixtures", "reader");

const server = createServer(async (request, response) => {
  // The reader takes its two payloads from routes now. Answered here from the
  // committed files: this walker tests the page, not the database.
  if (await serveReaderRoute(request, response, READER_DATA, "behaviours")) return;
  let path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  if (path.endsWith("/")) path += "index.html";
  // The same rewrite next.config.mjs carries: a prose page's address is a name,
  // not the file it happens to be stored in. Without it this server answers 404
  // where the deployment answers 200, and the walker's nav check would be a
  // check on the walker.
  if (!extname(path)) path += ".html";
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
  await readFile(join(READER_DATA, "behaviours.json"), "utf8"),
).behaviours;
/* The band keep-set: same v5 run, cut at the boundary the client's lowest band
 * applies. What the reader can render IS this set, so its coverage is the
 * passage-count oracle for every view below. */
const keepSet = new Map(JSON.parse(
  await readFile(join(READER_DATA, "behaviours.json"), "utf8"),
).behaviours.map(behaviour => [behaviour.slug, behaviour]));
const documents = JSON.parse(
  await readFile(join(READER_DATA, "documents.json"), "utf8"),
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
  /* Every view walks as a reader opens it, with no ?tiers= in the URL. The
   * default is all three bands, so the rendered anchors must equal the keep-set
   * count; a default that dropped a band would come up short here.
   * verify-reader-features.mjs covers the band cuts and the toggles. */
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !document.querySelector(".passage-count").textContent.startsWith("Loading"),
    { timeout: 10000 },
  );
  await page.waitForTimeout(150);
  return page.evaluate(() => ({
    passages: document.querySelectorAll("[data-passage-id]").length,
    status: document.querySelector("#reader-status").textContent.trim(),
    count: document.querySelector(".passage-count").textContent,
    // Body text of every rendered panel, to prove the spec itself is there to read.
    panels: [...document.querySelectorAll(".document-panel")].map(panel => ({
      // The publisher is the pressed button of the panel's own row of them.
      lab: panel.querySelector('.provider-tab[aria-pressed="true"]')?.textContent ?? null,
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

/* The behaviour a view is about is the one ticked in the menu. It used to be read
 * off the strip of behaviour tags under the header, which is gone. */
async function expectView(url, expected, label) {
  const seen = await readView(url);
  const ticked = seen.ticked.join(",");
  const ok = seen.passages === expected.passages
    && seen.status === ""
    && ticked === expected.ticked.join(",");
  report(ok, label, `${seen.passages}/${expected.passages} passages`
    + (seen.status ? `  status: ${seen.status}` : "")
    + (ticked !== expected.ticked.join(",") ? `  ticked: ${ticked}` : ""));
}

// The depth beside a behaviour also has to reach keyboard, touch and screen-reader
// users, none of whom can read a hover title. Opens the note the "i" button opens
// (the same popover a mouse user never needs for this) and reads back its depth
// section: a heading, one paragraph per document on screen, and, where a depth was
// given, one list item per judge.

// A seat another model judged is said in the same section, one sentence per
// substitution, for each document on screen whose cell carries one. Expected from
// the fixture, so a cell with none must say none.
//
// No document named in the sentence. It used to open "On <document>, ...",
// because the depths lived in the behaviour note where several documents ran on
// in one body and a sentence had to say which it was about. In the figure's own
// popover each document has its own section under its own heading, so naming it
// again in the sentence says it twice.
const substitutionSentences = (behaviour, docs) => docs.flatMap(document =>
  (behaviour.coverage[document.id]?.substitutions || []).map(({ seat, substitute, reason }) =>
    `${substitute} judged in place of ${seat}: ${reason}`));
const saidSubstitutions = note => note.paragraphs.filter(p => p.includes(" judged in place of "));

async function readDepthNote(slug) {
  /* The figure's own popover, not the behaviour note. This used to read the
   * behaviour note, which carried a depth section until that section was taken
   * out for repeating what pressing the figure already said. Read there since,
   * it found no heading and no judges and reported it against every document. */
  await page.click(`[data-behaviour-depth="${slug}"]`);
  await page.waitForTimeout(150);
  const note = await page.evaluate(() => {
    const body = document.querySelector("#depth-note-body");
    /* The judges sit behind a disclosure now, under the paragraph written from
     * them. Opened here so this reads what a reader can reach rather than only
     * what is shown before anything is pressed. */
    body.querySelectorAll("details").forEach(fold => { fold.open = true; });
    return {
      headings: [...body.querySelectorAll("h3")].map(h => h.textContent),
      paragraphs: [...body.querySelectorAll("p")].map(p => p.textContent),
      judgeItems: [...body.querySelectorAll("li")].map(li => li.textContent),
    };
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  return note;
}

// The checkbox's hidden description: what a screen reader hears when it lands on
// the checkbox, which must be the same text as the figure's hover title (one text,
// not two) and must name the document, or documents, on screen.
async function readDepthDescription(slug) {
  return page.$eval(`[data-behaviour="${slug}"]`, input => {
    const id = input.getAttribute("aria-describedby");
    const target = id ? document.getElementById(id) : null;
    return {
      id,
      exists: Boolean(target),
      text: target ? target.textContent : null,
      title: input.closest(".behaviour-option-row").querySelector("[data-behaviour-depth]").title,
    };
  });
}

// Navigation: the expected links must be present and every one must resolve
// (any #fragment to a real id in its target).
await readView(base);
const expectedNav = ["./", "/how-it-works"];
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
  navIssues.length ? navIssues.join("; ") : navHrefs.join(", "));

// The committed state resolves to the current publication: no ?publication= pin, and no
// manifest (it is gitignored run output). A local manifest would shadow the
// fallback and silently swap the payload under test, so fail loud on it; and
// the fallback file itself must serve, or the menu empties.
/* The manifest and the shipped fallback were the second and third steps of a
 * resolution chain that no longer exists: a payload comes from a route now. */

if (behaviours.length === 0) {
  // The behaviour set is empty: the point is that both specs are fully readable and untouched.
  for (const document of documents) {
    const seen = await readView(`${base}?spec=${encodeURIComponent(document.id)}`);
    const panel = seen.panels[0];
    report(
      seen.passages === 0
        && seen.status === ""
        && seen.emptyMenu
        && seen.menuItems === 0
        && seen.count === "No behaviours under test"
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
        `${base}?behavior=${behaviour.slug}&spec=${encodeURIComponent(document.id)}`,
        { passages, ticked: [behaviour.slug] },
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
      { passages: total, ticked: [behaviour.slug] },
      `${behaviour.slug} · compare`,
    );
  }

  // The substitution checks below compare what the note says with what the fixture
  // carries, and would pass on a fixture carrying none.
  report(
    behaviours.some(behaviour => Object.values(behaviour.coverage)
      .some(cell => cell.substitutions?.length)),
    "the fixture carries a cell judged with a substitute",
    "so the substitution checks are not vacuous",
  );

  // Depth beside each behaviour: the panel's mean for the document on screen, a
  // dash where no depth was given. A dash and a zero are different claims.
  for (const behaviour of behaviours) {
    for (const document of documents) {
      await readView(`${base}?behavior=${behaviour.slug}&spec=${encodeURIComponent(document.id)}`);
      const shown = await page.$eval(`[data-behaviour-depth="${behaviour.slug}"]`,
                                     cell => cell.textContent);
      const depth = behaviour.coverage[document.id]?.depth;
      const expected = depth ? depth.mean.toFixed(1) : "–";
      report(shown === expected, `${behaviour.slug} · ${document.id} · depth`,
             `${shown} (expected ${expected})`);

      // The figure is bare on screen. What a screen reader hears carries the scale,
      // which a sighted reader gets once, from the column's header, and a screen
      // reader would not hear with each value: once beside the name, in the hidden
      // form the checkbox carries, and once as the name of the figure's own button,
      // which opens the cell behind it and so cannot be hidden from anyone.
      const spoken = await page.$eval(`[data-behaviour-depth="${behaviour.slug}"]`, cell => ({
        tag: cell.tagName,
        label: cell.getAttribute("aria-label"),
        expanded: cell.getAttribute("aria-expanded"),
        text: cell.closest(".behaviour-option-row")?.querySelector(".depth-spoken")?.textContent ?? null,
      }));
      const expectedSpoken = depth ? `depth ${depth.mean.toFixed(1)} out of 4` : "no depth given";
      report(spoken.text === expectedSpoken && spoken.tag === "BUTTON"
               && spoken.label === `${behaviour.name}: ${expectedSpoken}`
               && spoken.expanded === "false",
             `${behaviour.slug} · ${document.id} · depth, spoken with its scale`,
             `${JSON.stringify(spoken)} (expected ${expectedSpoken})`);

      // The checkbox describes itself: the description exists, matches the
      // figure's own hover title exactly, and names the document on screen.
      const described = await readDepthDescription(behaviour.slug);
      report(
        Boolean(described.id) && described.exists
          && described.text === described.title
          && described.text.includes(document.title)
          && described.text.includes(document.version),
        `${behaviour.slug} · ${document.id} · depth description`,
        described.text,
      );

      // Opening the note surfaces the same detail: the heading, a paragraph naming
      // this document's mean (or that none was given), and every judge who scored it.
      const note = await readDepthNote(behaviour.slug);
      const expectedFigure = depth ? depth.mean.toFixed(1) : "No depth given";
      const expectedJudges = depth ? Object.keys(depth.judges) : [];
      report(
        // The document names the section it heads; the figure is the paragraph
        // under it. They were one sentence when this note was part of another.
        note.headings.some(heading => heading.includes(document.title))
          && note.paragraphs.some(p => p.includes(expectedFigure)
            // A depth on its own, in a sentence, says its scale in that sentence.
            && (!depth || p.includes(`${expectedFigure} out of 4`)))
          && expectedJudges.every(judge => note.judgeItems.some(item => item.startsWith(judge))),
        `${behaviour.slug} · ${document.id} · depth note`,
        `headings: ${note.headings.join(" | ")}; judges: ${note.judgeItems.join(" | ")}`,
      );

      // And where a seat was judged by a substitute, the note says so in a sentence.
      const said = saidSubstitutions(note);
      report(
        JSON.stringify(said) === JSON.stringify(substitutionSentences(behaviour, [document])),
        `${behaviour.slug} · ${document.id} · substitutions`,
        said.join(" | ") || "none said",
      );
    }
  }

  // Comparing, each document on screen gives its figure, in pane order, joined by " / ".
  // One behaviour of the fixture has a depth on one document and none on the other,
  // so this also holds the dash beside a figure.
  for (const behaviour of behaviours) {
    await readView(`${base}?behavior=${behaviour.slug}&compare=1`);
    const shown = await page.$eval(`[data-behaviour-depth="${behaviour.slug}"]`,
                                   cell => cell.textContent);
    const expected = documents.slice(0, 2).map(document => {
      const depth = behaviour.coverage[document.id]?.depth;
      return depth ? depth.mean.toFixed(1) : "–";
    }).join(" / ");
    report(shown === expected, `${behaviour.slug} · compare · depth`,
           `${shown} (expected ${expected})`);
    const spokenCompare = await page.$eval(`[data-behaviour-depth="${behaviour.slug}"]`, cell =>
      cell.closest(".behaviour-option-row")?.querySelector(".depth-spoken")?.textContent ?? null);
    const paneDepths = documents.slice(0, 2).map(document => behaviour.coverage[document.id]?.depth);
    const expectedSpokenCompare = paneDepths.some(Boolean)
      ? `depth ${paneDepths.map(depth => (depth ? `${depth.mean.toFixed(1)} out of 4` : "not given")).join(" and ")}`
      : "no depth given";
    report(spokenCompare === expectedSpokenCompare, `${behaviour.slug} · compare · depth, spoken with its scale`,
           `${spokenCompare} (expected ${expectedSpokenCompare})`);

    // In compare mode the description and the note both name both documents on
    // screen -- the same requirement as the single-document view, with two panes
    // to satisfy instead of one.
    const paneDocs = documents.slice(0, 2);
    const described = await readDepthDescription(behaviour.slug);
    report(
      Boolean(described.id) && described.exists
        && described.text === described.title
        && paneDocs.every(document => described.text.includes(document.title)),
      `${behaviour.slug} · compare · depth description`,
      described.text,
    );

    const note = await readDepthNote(behaviour.slug);
    report(
      // One section per document on screen, each headed by its name.
      paneDocs.every(document => note.headings.some(h => h.includes(document.title)))
        && paneDocs.every(document => {
          const depth = behaviour.coverage[document.id]?.depth;
          const figure = depth ? depth.mean.toFixed(1) : "No depth given";
          return note.paragraphs.some(p => p.includes(figure));
        }),
      `${behaviour.slug} · compare · depth note`,
      `headings: ${note.headings.join(" | ")}; paragraphs: ${note.paragraphs.length}`,
    );

    const said = saidSubstitutions(note);
    report(
      JSON.stringify(said) === JSON.stringify(substitutionSentences(behaviour, paneDocs)),
      `${behaviour.slug} · compare · substitutions`,
      said.join(" | ") || "none said",
    );
  }

  // The scale, once, at the top of the depth column. Each group's heading carries it,
  // on the heading's own line and flush with the figures below, and the heading is no
  // taller for it; the figures themselves stay bare. With one document and with two,
  // where each figure becomes a pair.
  for (const [mode, url] of [
    ["one document", `${base}?behavior=${behaviours[0].slug}&spec=${encodeURIComponent(documents[0].id)}`],
    ["compare", `${base}?behavior=${behaviours[0].slug}&compare=1`],
  ]) {
    await readView(url);
    const heads = await page.evaluate(() => [...document.querySelectorAll(".behaviour-group")].map(group => {
      const heading = group.querySelector("h2");
      const head = group.querySelector(".depth-head");
      const figures = [...group.querySelectorAll(".behaviour-option-row .depth")]
        .map(cell => cell.getBoundingClientRect());
      const box = head?.getBoundingClientRect();
      const name = heading.getBoundingClientRect();
      const row = (head?.closest(".behaviour-group-head") ?? heading).getBoundingClientRect();
      const style = getComputedStyle(heading);
      return {
        text: head?.textContent ?? null,
        sameLine: box ? Math.abs((box.top + box.bottom) / 2 - (name.top + name.bottom) / 2) <= 3 : false,
        offRight: box && figures.length
          ? Math.round(Math.max(...figures.map(figure => Math.abs(figure.right - box.right))) * 10) / 10
          : null,
        rowHeight: Math.round(row.height * 10) / 10,
        oneLine: Math.round((15 + 7 + parseFloat(style.lineHeight)) * 10) / 10,
      };
    }));
    report(heads.length > 0 && heads.every(head => head.text === "Depth, out of 4" && head.sameLine
        && head.offRight !== null && head.offRight <= 2 && head.rowHeight <= head.oneLine + 1),
      `depth column · ${mode} · the scale is stated once, in the column's header`,
      JSON.stringify(heads));
  }

  // Several behaviours read over the same text. Each must still anchor exactly its own
  // published passages; where two of them cite one passage it is highlighted once and
  // marked as shared, rather than counted twice or overwritten by the last one drawn.
  const selections = [behaviours.slice(0, 3), behaviours];
  for (const selection of selections) {
    const slugs = selection.map(behaviour => behaviour.slug);
    for (const document of documents) {
      const seen = await readView(`${base}?behavior=${slugs.join(",")}&spec=${encodeURIComponent(document.id)}`);
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
  await readView(`${base}?behavior=${first.slug},${second.slug}&spec=${encodeURIComponent(documents[0].id)}`);
  // Read the whole document, not the focused extract. Focus mode hides every section
  // that carries no highlight, so unticking a behaviour there removes text rather than
  // only its highlights -- on this fixture, most of what was on screen. Keeping one's
  // place is a promise about the reading mode where the text stays put, and that is the
  // mode this check measures; the focused view's own arithmetic is checked above, where
  // hidden blocks and collapsed sections are counted.
  const unfocused = await page.evaluate(id => {
    const panel = document.querySelector(`.document-panel[data-document-id="${id}"]`);
    panel.querySelector(".document-focus-toggle").click();
    return panel.querySelectorAll(".section-collapsed").length;
  }, documents[0].id);
  await page.waitForTimeout(100);
  // A third of the way down, not a fixed pixel count: the document under test is
  // whatever the fixture carries, and a number chosen for a four-thousand-line
  // spec clamps to the bottom of a shorter one, which is not the same place.
  const scrolled = await page.evaluate(() => {
    const panel = document.querySelector(".document-scroll");
    panel.scrollTop = Math.round((panel.scrollHeight - panel.clientHeight) / 3);
    return panel.scrollTop;
  });
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
    scrollRange: document.querySelector(".document-scroll").scrollHeight
                 - document.querySelector(".document-scroll").clientHeight,
    passages: document.querySelectorAll("[data-passage-id]").length,
    ticked: [...document.querySelectorAll("[data-behaviour]")]
      .filter(input => input.checked).map(input => input.dataset.behaviour),
    url: new URL(location.href).searchParams.get("behavior"),
  }));
  report(
    // Proportional, not absolute. Unticking removes that behaviour's passages,
    // which shortens the document; on a four-thousand-line spec that moved the
    // position by a pixel or two, on a short one by the same fraction. What must
    // hold is that the reader kept its place, not that nothing moved.
    Math.abs(after.scrollTop - before) < Math.max(4, after.scrollRange * 0.1)
      && unfocused === 0
      && after.passages === anchorCount(renderable(second.slug, documents[0].id))
      && after.ticked.join(",") === second.slug
      && after.url === second.slug,
    "unticking one of two · acme--corpus@2026-01-01",
    `scroll ${before} → ${after.scrollTop}, ${after.passages} passages left,`
    + ` ${unfocused} sections collapsed, ticked ${after.ticked.join(",")}, url ${after.url}`,
  );

  // And with the last behaviour unticked, the specification is readable in full again.
  await page.click("#clear-behaviours");
  await page.waitForTimeout(250);
  const cleared = await page.evaluate(() => ({
    passages: document.querySelectorAll("[data-passage-id]").length,
    hiddenBlocks: [...document.querySelectorAll(".document-body > *")].filter(child => child.hidden).length,
    collapsedSections: document.querySelectorAll(".section-collapsed").length,
    count: document.querySelector(".passage-count").textContent,
    focusToggleHidden: getComputedStyle(document.querySelector(".document-focus-toggle")).display === "none",
    url: new URL(location.href).searchParams.get("behavior"),
  }));
  report(
    cleared.passages === 0
      && cleared.hiddenBlocks === 0
      && cleared.collapsedSections === 0
      && cleared.count === "No behaviours selected"
      && cleared.focusToggleHidden
      && cleared.url === null,
    "nothing ticked · anthropic",
    `${cleared.passages} passages, ${cleared.hiddenBlocks} hidden,`
    + ` ${cleared.collapsedSections} collapsed, counter reads ${cleared.count}`,
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
  await readView(`${base}?behavior=${exported.map(behaviour => behaviour.slug).join(",")}&spec=${encodeURIComponent(documents[0].id)}`);
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
  const expectedHint = `${exported.length} ${exported.length === 1 ? "behaviour" : "behaviours"}`
    + `, ${citations.length} ${citations.length === 1 ? "passage" : "passages"}`
    + `, ${documents.length} ${documents.length === 1 ? "document" : "documents"}`;
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

/* A document the index read in translation carries its original beside it, and
 * says so. The fixture carries two. Acme's has not been judged, and its
 * translator field has the real column's shape, exceptions and all. Zenith's
 * carries no `judged` field, which is what every document of a published payload
 * looks like today. The plain documents prove the feature reaches no document
 * that does not ask for it. */
{
  const translated = documents.find(document => document.translation && document.judged === false);
  const judgedTranslation = documents.find(
    document => document.translation && document.judged !== false);
  const plain = documents.find(document => !document.translation);
  report(Boolean(translated && judgedTranslation),
    "translated: the fixture carries a judged and an unjudged translation",
    "so neither band check below is vacuous");

  await readView(`${base}?spec=${encodeURIComponent(translated.id)}`);
  // The notice's words, without the control that dismisses it.
  const note = await page.$eval(".document-translation", el => ({
    text: (el.querySelector(".translation-text") ?? el).textContent,
    hidden: el.hidden,
  }));
  report(
    !note.hidden
      // Both models named, both as names, and the column's list of the parts the
      // reviser never reached left out of a strip read at a glance. The claim
      // goes with the list: what is left says "in part", because a reviser that
      // skipped sections did not revise the document. The fixture carries the
      // shape the real field has, exceptions and all -- asserting the simple
      // case is what let raw ids through into the band in the first place.
      && note.text.includes(
        "Machine translation from Chinese by Claude Opus 5, revised in part by Claude Fable 5")
      && !note.text.includes("except")
      && !note.text.includes("refuse-violence")
      // No panel has judged this one, and the reader says "Not judged yet" just
      // below. A band that still said the index judged it would contradict that
      // note on the same screen.
      && !note.text.includes("The index judged this translation"),
    "translated, unjudged: the band names the translators and does not say the index judged it",
    note.text,
  );

  const marks = await page.locator(".original-open").count();
  report(marks === translated.original.length, "translated · one mark per passage",
         `${marks}/${translated.original.length}`);

  // Each mark carries the original of the passage it sits in, which is what makes
  // the pairing worth anything: marks that all carried the document's first
  // original would pass a count and say nothing true. Read from the DOM rather
  // than by clicking each one, because a mark inside a section focus mode has
  // collapsed is not clickable -- correctly, since its text is not on screen
  // either.
  const carried = await page.evaluate(() => [...document.querySelectorAll(".original-open")]
    .map(button => button.dataset.original));
  report(
    carried.length === translated.original.length
      && carried.every((source, i) => source === translated.original[i].original),
    "translated · each mark carries its own passage's original",
    `${carried.length} marks, `
    + `${carried.filter((source, i) => source === translated.original[i]?.original).length} paired`,
  );

  // And the first of them opens, which is the part a reader does.
  await page.locator(".original-open").first().click();
  await page.waitForSelector("#original-note:popover-open");
  const opened = await page.evaluate(() => ({
    label: document.querySelector("#original-note-label").textContent,
    body: document.querySelector("#original-note-body").textContent,
    lang: document.querySelector("#original-note-body").lang,
  }));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  report(
    opened.body === translated.original[0].original
      && opened.lang === translated.translation.from
      && opened.label === "Chinese original",
    "translated · a mark opens the original beside it",
    `${opened.label} (${opened.lang}): ${opened.body.slice(0, 24)}`,
  );

  await readView(`${base}?spec=${encodeURIComponent(plain.id)}`);
  const clean = await page.evaluate(() => ({
    noteHidden: document.querySelector(".document-translation").hidden,
    marks: document.querySelectorAll(".original-open").length,
  }));
  report(clean.noteHidden && clean.marks === 0, "untranslated · no note and no marks",
         `${clean.marks} marks`);

  // Judged and unjudged are different claims. A document no panel has read must
  // not say that its silence is a finding about the document.
  await readView(`${base}?behavior=${behaviours[0].slug}&spec=${encodeURIComponent(translated.id)}`);
  const unjudged = await page.$eval(".zero-coverage", el => el.textContent.replace(/\s+/g, " ").trim());
  report(
    unjudged.includes("Not judged yet") && !unjudged.includes("index finding"),
    "translated · an unjudged document says so",
    unjudged.slice(0, 90),
  );

  // A translation a panel has read says so, in the same band and the same words
  // the unjudged one leaves out.
  await readView(`${base}?spec=${encodeURIComponent(judgedTranslation.id)}`);
  const judgedNote = await page.$eval(".document-translation", el => ({
    text: (el.querySelector(".translation-text") ?? el).textContent,
    hidden: el.hidden,
  }));
  report(
    !judgedNote.hidden
      && judgedNote.text === "Machine translation from Chinese by Claude Opus 5, "
        + "reviewed by a person. The index judged this translation.",
    "judged translation: the band says the index judged it",
    judgedNote.text,
  );
  const judgedMarks = await page.locator(".original-open").count();
  report(judgedMarks === judgedTranslation.original.length,
    "judged translation: one mark per passage",
    `${judgedMarks}/${judgedTranslation.original.length}`);

  /* The band is read at 11px, so its text has to clear 4.5:1 on the band's own
   * ground in both palettes. Rust is the band's marker by the operator's choice,
   * and it stays as the band's left rule, where a colour needs 3:1 rather than
   * text's 4.5. Measured from computed colours, not from the stylesheet, so a
   * token that moves is caught too. Left-aligned like everything else. */
  const palette = await page.evaluate(() => document.body.dataset.palette);
  for (const name of ["daylight", "umber"]) {
    const band = await page.evaluate(name => {
      document.body.dataset.palette = name;
      const style = getComputedStyle(document.querySelector(".document-translation"));
      const probe = document.createElement("span");
      probe.style.color = "var(--fail)";
      document.body.append(probe);
      const fail = getComputedStyle(probe).color;
      probe.remove();
      const luminance = value => {
        const [r, g, b] = value.match(/[\d.]+/g).slice(0, 3).map(channel => {
          const c = Number(channel) / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const [lighter, darker] = [luminance(style.color), luminance(style.backgroundColor)]
        .sort((a, b) => b - a);
      return {
        ratio: (lighter + 0.05) / (darker + 0.05),
        align: style.textAlign,
        rule: `${style.borderLeftWidth} ${style.borderLeftStyle} ${style.borderLeftColor}`,
        fail,
      };
    }, name);
    report(
      band.ratio >= 4.5 && band.align === "left" && band.rule === `2px solid ${band.fail}`,
      `translation band, ${name}: its text clears AA, it is left-aligned, and rust is its rule`,
      `${band.ratio.toFixed(2)}:1, ${band.align}, rule ${band.rule}`,
    );
  }
  await page.evaluate(name => { document.body.dataset.palette = name; }, palette);
}

/* One document on both sides of a comparison.
 *
 * The pair used to be deduplicated, and choosing the document already opposite
 * swapped the two sides instead. The operator asked for the opposite rule: any
 * document may sit on either side, including the same one twice. It is a
 * decision rather than an oversight, so it is pinned here -- an id carries its
 * version, so this is the identical text twice and not two versions of one
 * document, which was always a valid pair. */
{
  const [first] = documents;
  await readView(`${base}?compare=1&compare-with=${encodeURIComponent(first.id)},${encodeURIComponent(first.id)}`);
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll(".document-panel")].map(panel => panel.dataset.documentId));
  report(ids.length === 2 && ids.every(id => id === first.id),
         "compare · the same document may sit on both sides",
         ids.join(" | "));
}

/* The lighter reading surface is the document's text, and nothing above it.
 *
 * The user asked for the document paler, not the menus at its top: the
 * publishers, the name and version, Show original, the counter and arrows,
 * Expand all and the band toggles stay on the page's own --paper, and only the
 * text area takes --reading, including what a short document leaves below its
 * last line. Held with one document and two, the menu open and folded, in both
 * palettes; umber has one ground for both. */
{
  const surfaces = () => page.evaluate(() => {
    const ground = element => {
      for (let node = element; node; node = node.parentElement) {
        const colour = getComputedStyle(node).backgroundColor;
        if (colour !== "rgba(0, 0, 0, 0)" && colour !== "transparent") return colour;
      }
      return null;
    };
    const token = name => {
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    };
    return {
      paper: token("--paper"),
      reading: token("--reading"),
      panels: [...document.querySelectorAll(".document-panel")].map(panel => {
        const scroll = panel.querySelector(".document-scroll").getBoundingClientRect();
        // In the text's left gutter, just above the bottom of the scroll area:
        // below the last line of a short document, and clear of any passage.
        const below = document.elementFromPoint(scroll.left + 8, scroll.bottom - 6);
        return {
          id: panel.dataset.documentId,
          top: {
            publishers: ground(panel.querySelector(".provider-tabs")),
            name: ground(panel.querySelector(".document-name")),
            showOriginal: ground(panel.querySelector(".source-link")),
            walk: ground(panel.querySelector(".passage-nav")),
            expandAll: ground(panel.querySelector(".document-focus-toggle")),
            bands: ground(panel.querySelector(".rail-legend")),
          },
          text: ground(panel.querySelector(".document-body")),
          belowText: below && panel.contains(below) ? ground(below) : "outside the panel",
        };
      }),
    };
  });
  const setMenu = async open => {
    if ((await page.getAttribute("#sidebar-toggle", "aria-expanded")) !== String(open)) {
      await page.click("#sidebar-toggle");
      await page.waitForTimeout(200);
    }
  };
  const [first] = behaviours;
  const translatedDoc = documents.find(document => document.translation) || documents[1];
  const initialPalette = await page.evaluate(() => document.body.dataset.palette);
  for (const [mode, query] of [
    ["one document", `?behavior=${first.slug}&spec=${encodeURIComponent(documents[0].id)}`],
    ["compare", `?behavior=${first.slug}&compare=1&compare-with=`
      + `${encodeURIComponent(translatedDoc.id)},${encodeURIComponent(documents[0].id)}`],
  ]) {
    await readView(`${base}${query}`);
    for (const open of [true, false]) {
      await setMenu(open);
      for (const palette of ["daylight", "umber"]) {
        await page.evaluate(name => { document.body.dataset.palette = name; }, palette);
        const seen = await surfaces();
        const topOnPaper = seen.panels.every(panel =>
          Object.values(panel.top).every(colour => colour === seen.paper));
        const textOnReading = seen.panels.every(panel =>
          panel.text === seen.reading && panel.belowText === seen.reading);
        const distinct = palette === "daylight" ? seen.paper !== seen.reading : seen.paper === seen.reading;
        report(topOnPaper && textOnReading && distinct,
          `reading surface, ${mode}, menu ${open ? "open" : "folded"}, ${palette}:`
            + " the top rows on --paper, the text on --reading",
          `paper ${seen.paper}, reading ${seen.reading}; `
            + seen.panels.map(panel => `${panel.id} top ${JSON.stringify(panel.top)}`
              + ` text ${panel.text} below ${panel.belowText}`).join("; "));
      }
    }
    await setMenu(true);
  }
  await page.evaluate(name => { document.body.dataset.palette = name; }, initialPalette);
}

/* 404 audit: every path the page asks for must exist. There used to be one
 * exception, the manifest, whose absence was the fresh-clone state the reader
 * fell through; the chain that needed it is gone. */
/* The one address the reader asks for that this walker cannot answer.
 *
 * It was three gitignored files -- a run's links and the two kinds of paragraph
 * beside them -- and they are rows in the database now, served by a Next route.
 * This walker serves the page from a static tree and has no routes, so the
 * request 404s and the reader renders without bubbles, which is exactly what it
 * did when the files were missing. The page under test is the same either way;
 * what the bubbles contain is tested in app/lib/__tests__/links.test.mjs. */
const GENERATED_AND_ABSENT = [
  "/api/reader/links",
];
const unexpectedMissing = [...new Set(missingPaths)]
  .filter(path => !GENERATED_AND_ABSENT.includes(path));
report(unexpectedMissing.length === 0, "nothing unexpected 404s",
  unexpectedMissing.join(", ") || "only the generated files no checkout carries");
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
