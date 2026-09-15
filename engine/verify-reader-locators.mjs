#!/usr/bin/env node
// Every passage's block carries the passage's locator, over a whole publication.
//
// Serves the reader with a data directory holding documents.json and
// behaviours.json (a documents payload and a behaviour payload, as the reader's
// routes return them), opens each document with nothing ticked, and resolves every
// passage the payload carries the way the reader does (reader-locator-proof.mjs).
// It also reports how long each document took to open and how many blocks
// carry a locator.
//
// Usage: node engine/verify-reader-locators.mjs [dataDir]
//        (default tests/fixtures/reader; needs Chrome)
// Exits 0 when no passage's block carries a locator other than its own, 1 otherwise.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { serveReaderRoute } from "./reader-routes.mjs";
import { resolverSource, proveDocument } from "./reader-locator-proof.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = join(ROOT, "site");
const DATA = resolve(process.argv[2] || join(ROOT, "tests", "fixtures", "reader"));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const server = createServer(async (request, response) => {
  if (await serveReaderRoute(request, response, DATA, "behaviours")) return;
  let path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  if (path.endsWith("/")) path += "index.html";
  if (!extname(path)) path += ".html";
  try {
    const body = await readFile(join(SITE, path));
    response.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}/spec-reader/`;

const documents = JSON.parse(await readFile(join(DATA, "documents.json"), "utf8")).documents;
const behaviours = JSON.parse(await readFile(join(DATA, "behaviours.json"), "utf8")).behaviours;
const source = await resolverSource();

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));

const totals = { passages: 0, unresolved: 0, noLocator: 0, wrong: 0 };
for (const doc of documents) {
  const passages = behaviours.flatMap(behaviour => behaviour.coverage?.[doc.id]?.passages || []);
  const started = Date.now();
  await page.goto(`${base}?spec=${encodeURIComponent(doc.id)}&behavior=`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const count = document.querySelector(".passage-count");
    return count && !count.textContent.startsWith("Loading")
      && document.querySelectorAll(".document-body [data-block]").length > 0;
  }, undefined, { timeout: 60000, polling: "raf" });
  const opened = Date.now() - started;
  const blocks = await page.evaluate(() => ({
    blocks: document.querySelectorAll(".document-body [data-block]").length,
    located: document.querySelectorAll(".document-body [data-locator]").length,
  }));
  const proof = await proveDocument(page, passages, source);
  for (const key of Object.keys(totals)) totals[key] += proof[key];
  console.log(`${proof.mismatches ? "FAIL" : "PASS"}  ${doc.id}: ${proof.passages} passages,`
    + ` ${proof.mismatches} mismatches (${proof.wrong} wrong, ${proof.noLocator} on a block with no locator),`
    + ` ${proof.unresolved} unresolved; ${blocks.located} of ${blocks.blocks} blocks carry a locator;`
    + ` opened in ${opened} ms`);
  for (const example of proof.examples) console.log(`      ${JSON.stringify(example)}`);
}

const mismatches = totals.wrong + totals.noLocator;
console.log(`\n${totals.passages} passages, ${mismatches} mismatches (${totals.wrong} wrong,`
  + ` ${totals.noLocator} on a block with no locator), ${totals.unresolved} unresolved`
  + (errors.length ? `; page errors: ${errors.join("; ")}` : ""));
await browser.close();
server.close();
process.exit(mismatches || errors.length ? 1 : 0);
