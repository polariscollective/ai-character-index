import { chromium } from "playwright-core";
const OUT = "/private/tmp/claude-501/-Users-sverbo-Desktop-Codes-Polaris-ai-character-index/ce18f5a1-b19d-45d9-b9f0-56fbbca54e9e/scratchpad";
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
await ctx.clearCookies();
const p = await ctx.newPage();
const errors = [];
p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
p.on("response", r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
await p.goto("http://127.0.0.1:8080/spec-reader/?behavior=helpfulness&spec=anthropic",
             { waitUntil: "load" });
await p.waitForFunction(() => {
  const el = document.querySelector(".document-body");
  return el && el.textContent.trim().length > 500;
}, null, { timeout: 30000 }).catch(e => errors.push("render timeout"));
await p.waitForTimeout(1500);
const seen = await p.evaluate(() => ({
  passages: document.querySelectorAll("[data-passage-id]").length,
  behaviour: document.querySelector("#finding-behaviour")?.textContent.trim(),
  run: document.querySelector(".sidebar-run > summary")?.textContent.trim(),
  title: document.querySelector(".document-title")?.textContent.trim(),
}));
console.log(JSON.stringify(seen, null, 1));
console.log("errors:", errors.length ? errors : "none");
await p.screenshot({ path: `${OUT}/served-from-supabase.png` });
await b.close();
