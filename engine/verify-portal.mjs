#!/usr/bin/env node
// A walk through the admin portal, against a server that is already running.
//
//   pnpm dev            (with ACI_DEV_OPERATOR set, or signed in)
//   node engine/verify-portal.mjs [http://localhost:3000]
//
// Unlike the two reader walkers, this one cannot run in CI: the portal reads the
// index out of Supabase on every page, so it needs credentials, and CI is
// deliberately secretless. It is the credentialed check the provenance verifier
// already is.
//
// It READS. No form is submitted: the portal's forms compose runs, register
// specifications and build publications, and a check that pressed them would be
// writing to the index the site serves. What it verifies is that every page
// renders, that each form declares what its route requires, and that the gate is
// where it should be.
//
// Exits 0 when every check passes, 1 otherwise.

import { chromium } from "playwright-core";

const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -- ${detail}` : ""}`);
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let consoleErrors = [];
page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", e => consoleErrors.push(String(e)));
// The browser's own message for a failed request names no url, and the commonest
// cause of one here is a development server whose build was replaced underneath
// it. Naming the url is the difference between "restart the server" and a hunt.
page.on("response", r => {
  if (r.status() === 404) consoleErrors.push(`404 ${new URL(r.url()).pathname}`);
});

async function open(path) {
  consoleErrors = [];
  const response = await page.goto(base + path, { waitUntil: "networkidle" });
  return response?.status() ?? 0;
}

const PAGES = [
  ["/admin", "Overview", ["What the public sees", "The registry", "Runs", "Jobs"]],
  ["/admin/behaviours", "Behaviours", ["Behaviours", "Register a behaviour"]],
  ["/admin/specifications", "Specifications", ["Documents", "Register a version"]],
  ["/admin/runs", "Runs", ["Runs", "Compose a run", "Jobs"]],
  ["/admin/publications", "Publications", ["Publications", "Build a publication"]],
];

for (const [path, name, headings] of PAGES) {
  const status = await open(path);
  const seen = await page.$$eval("h2", nodes => nodes.map(node => node.textContent.trim()));
  const missing = headings.filter(heading => !seen.includes(heading));
  check(status === 200 && missing.length === 0 && consoleErrors.length === 0,
        `${name} renders`,
        `${status}, ${seen.length} sections`
        + (missing.length ? `, missing: ${missing.join(", ")}` : "")
        + (consoleErrors.length ? `, console: ${consoleErrors[0]}` : ""));
}

// The bar is the same on every page, and every link in it goes somewhere.
await open("/admin");
const bar = await page.$$eval(".bar nav a", links => links.map(link => link.getAttribute("href")));
const answers = await Promise.all(bar.map(async href => {
  const response = await page.request.get(base + href);
  return [href, response.status()];
}));
check(answers.every(([, status]) => status === 200), "every link in the bar resolves",
      answers.map(([href, status]) => `${href} ${status}`).join(", "));

// Each form posts to its route, with the fields that route refuses without.
// This is the pairing a rename breaks silently: the form still submits, the route
// reads an empty string, and the operator is told a required field is required.
const FORMS = [
  ["/admin/behaviours", "/api/admin/behaviours",
   ["slug", "name", "set", "group", "query", "boundary", "source", "definition"]],
  ["/admin/specifications", "/api/admin/specifications",
   ["id", "version", "source_url", "markdown", "lab", "title", "short_title",
    "locator_style"]],
  ["/admin/runs", "/api/admin/runs", ["verb", "behaviours", "specs", "panel", "rubric"]],
  ["/admin/publications", "/api/admin/publications",
   ["verb", "behaviours", "specs", "panel", "rubric", "notes"]],
];

for (const [path, action, fields] of FORMS) {
  await open(path);
  const form = await page.$$eval(
    "form.panel",
    (forms, wanted) => {
      const one = forms.find(f => f.getAttribute("action") === wanted);
      if (!one) return null;
      return {
        method: (one.getAttribute("method") || "get").toLowerCase(),
        names: [...new Set([...one.elements].map(el => el.name).filter(Boolean))],
      };
    },
    action);
  const missing = form ? fields.filter(name => !form.names.includes(name)) : fields;
  check(Boolean(form) && form.method === "post" && missing.length === 0,
        `the form on ${path} posts what ${action} reads`,
        form ? `${form.method}, ${form.names.length} fields`
               + (missing.length ? `, missing: ${missing.join(", ")}` : "")
             : "no form with that action");
}

// Every control that changes something is a POST. A link that changed the index
// would be followed by a crawler, a prefetch, or a mistaken bookmark.
await open("/admin/publications");
const verbs = await page.$$eval("form[action^='/api/admin']",
                                forms => forms.map(f => (f.getAttribute("method") || "get").toLowerCase()));
check(verbs.length > 0 && verbs.every(method => method === "post"),
      "nothing that changes the index is a link",
      `${verbs.length} forms, methods: ${[...new Set(verbs)].join(", ")}`);

// The routes answer the browser, not just the page: a POST with no session is
// refused. Checked through the API rather than the UI, because that is the door
// a page does not guard.
const unsigned = await page.request.post(`${base}/api/admin/behaviours`, {
  form: { slug: "walker-should-never-write-this" },
  headers: { cookie: "" },
  // Do not follow: the redirect is the answer being checked, and following it
  // reports the page's 200 instead.
  maxRedirects: 0,
});
// With a development operator configured the route accepts, and refuses the
// write on its own validation; without one it is a 401. Both are correct, and
// what must never happen is a 500 or a silent success.
check([303, 401].includes(unsigned.status()),
      "a post without a page still meets the guard",
      `${unsigned.status()}`);

await browser.close();
console.log(failures ? `${failures} failures` : "The portal answers for itself.");
process.exit(failures ? 1 : 0);
