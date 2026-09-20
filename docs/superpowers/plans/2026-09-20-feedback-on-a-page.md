# Feedback on a page implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pill fixed to the bottom right of the four public pages that
photographs the viewport, takes an annotation and a sentence, and files the
result in Supabase and Slack.

**Architecture:** One vanilla ES module served statically (`site/page-feedback.js`),
loading a vendored html2canvas on first press. One public POST route taking
multipart, all of whose logic sits in `app/lib/page-feedback.mjs` so it is
testable under plain node with an injected fetch. One new table and one new
private bucket in the `evals` Supabase project. One portal page that reads them.

**Tech Stack:** Vanilla ES modules and Canvas 2D on the client, html2canvas
1.4.1 vendored, Next 15 route handlers, PostgREST and Supabase Storage through
`app/lib/supabase.mjs`, `node --test` for the route, `unittest` for the pages,
playwright-core against real Chrome for the browser.

**Design:** `docs/superpowers/specs/2026-09-20-feedback-on-a-page-design.md`

## Global constraints

- Everything written into the repository is in English: identifiers, comments,
  commit messages, test names, UI copy. The chat may be in French; the disk is
  not.
- No em-dashes and no en-dashes anywhere, including in code comments and commit
  messages. Use commas, colons, full stops or parentheses.
- British spelling in UI copy. Sentence case everywhere, buttons and table
  headers included.
- Polaris colour tokens, hard-coded in the client module as `dev-tag.js`
  hard-codes them: `--paper` `#F1EFE3`, `--ink` `#23281B`, `--olive-deep`
  `#333D22`, `--olive` `#5C6B3C`, `--chartreuse` `#B7C94B`, `--fail` `#A0522D`.
  Never `#000` and never `#111`.
- Buttons are pills, 999px radius. Primary: `--olive-deep` background, `--paper`
  text, hover `--chartreuse` background with `--ink` text. Secondary: 1px
  `--olive` border, `--ink` text, transparent background.
- Focus states are a 2px `--chartreuse` outline, always visible. Interaction
  feedback is a colour change at 150ms, disabled under
  `prefers-reduced-motion`.
- No icon library, no emoji, no gradients, no shadows, no all-caps.
- **No backtick may appear inside the `STYLE` template literal in
  `site/page-feedback.js`, comments included.** `dev-tag.js` records why: one
  backtick in a comment closes the literal, the result is still valid
  JavaScript, `node --check` sees nothing, and the page throws on load.
- Every `site/` change must be mirrored into `public/` before it is served
  locally. `pnpm predev` and `pnpm prebuild` do that with `cp -R site/. public/`.

## File structure

| path | responsibility |
|---|---|
| `polaris-supabase/evals/supabase/migrations/20260920120000_aci_page_feedback.sql` | the table, the bucket, the grants |
| `site/vendor/html2canvas.min.js` | the capture library, vendored, loaded on first press |
| `site/page-feedback.js` | the pill, the dialog, the capture, the editor, the send |
| `site/overview.html`, `site/about.html`, `site/mcp.html`, `site/spec-reader/index.html` | one script tag each |
| `app/lib/page-feedback.mjs` | the whole route as testable functions |
| `app/api/page-feedback/route.js` | the six lines that call it |
| `app/lib/feedback.mjs` | exports its address regex so there is one copy |
| `app/lib/admin-data.mjs` | one reader for the new table, minting signed links |
| `app/admin/page-feedback/page.jsx` | where the reports are read |
| `app/api/admin/page-feedback/route.js` | moving a report's status |
| `app/admin/layout.jsx` | one nav entry |
| `app/lib/__tests__/page-feedback.test.mjs` | the route's tests, no network |
| `tests/test_page_feedback_bubble.py` | the four pages carry the module |
| `engine/reader-routes.mjs` | a fixture route the walker can read back |
| `engine/verify-reader-features.mjs` | the browser checks |
| `CLAUDE.md` | the divergence record |

---

### Task 1: The table and the bucket

**Files:**
- Create: `/Users/sverbo/Desktop/Codes/Polaris/polaris-supabase/evals/supabase/migrations/20260920120000_aci_page_feedback.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `aci_page_feedback` with columns `id`, `created_at`,
  `page_url`, `comment`, `submitter`, `screenshot`, `capture_method`,
  `viewport`, `user_agent`, `source_hash`, `status`, `notes`; private bucket
  `aci-page-feedback` limited to 4 MB PNGs.

- [ ] **Step 1: Write the migration**

```sql
-- ai-character-index: what a reader says about a whole page, with the page.
--
-- Design: ai-character-index/docs/superpowers/specs/
--         2026-09-20-feedback-on-a-page-design.md
--
-- aci_feedback is about a paragraph and every column says so: a locator, a
-- document, the behaviours highlighting it, a thumb. None of that applies to
-- "this page is broken", and that report is mostly a picture, which that table
-- has nowhere to put. Its consent model is three-valued because a note about a
-- paragraph might one day be shown beside that paragraph; a screenshot of
-- somebody's browser never will be. So: a second table, private throughout.

create table aci_page_feedback (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  -- The address as the browser had it, query string and all. No publication
  -- column: the pin is already in the URL when there is one, and the URL is the
  -- honest record of what was on screen. Long, because the reader's URLs carry
  -- a document, a publication and a list of behaviours at once.
  page_url       text not null,
  comment        text not null,

  -- Never shown anywhere. It exists so we can write back, and that is the whole
  -- of what the form promises.
  submitter      text not null,

  -- The path in the bucket, null when the sender dropped the image rather than
  -- send something their screen happened to be carrying.
  screenshot     text,
  -- How the image was obtained. One value today, 'html2canvas'. It is stored so
  -- a later method is distinguishable in the record rather than silently
  -- replacing this one, the way a run records the digest of the prompt it used.
  capture_method text,

  viewport       text not null default '',
  user_agent     text not null default '',

  -- A salted hash of the caller's address, never the address, for the same
  -- reason as aci_submissions and aci_feedback: it exists to refuse the
  -- eleventh report in an hour from one place, and an address that could be
  -- read back would be a record of who read the site.
  source_hash    text not null,

  status         text not null default 'new'
                 check (status in ('new', 'read', 'actioned', 'declined')),
  notes          text not null default '',

  -- A picture with no words is a puzzle. Words with no picture are a report.
  constraint aci_page_feedback_says_something check (comment <> ''),
  constraint aci_page_feedback_has_a_sender   check (submitter <> '')
);

create index aci_page_feedback_recent on aci_page_feedback (created_at desc);
-- The rate-limit query: this source, this hour.
create index aci_page_feedback_by_source
  on aci_page_feedback (source_hash, created_at desc);

-- Private, PNG only, and capped below what the route accepts so a bucket that
-- is asked for more refuses rather than fills.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aci-page-feedback', 'aci-page-feedback', false, 4 * 1024 * 1024,
        array['image/png'])
on conflict (id) do nothing;

-- Insert from the public route, select and update from the portal. No anon
-- grant: the route is public, the table is not. Update because the status moves
-- as somebody reads it; the row itself is never rewritten.
grant select, insert, update on public.aci_page_feedback to service_role;
```

- [ ] **Step 2: Apply it by hand**

The `Migrations` workflow in `polaris-supabase` has failed on every run since
PR #30 with `Authorization failed for the access token and project ref pair`,
so the last four migrations were applied by hand and this one is too.

Run:
```bash
cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase/evals && supabase db push
```
Expected: the new migration listed as applied, no error.

- [ ] **Step 3: Verify the table and the bucket exist**

Run, from `ai-character-index`, with the environment the app uses:
```bash
node --env-file=.env --input-type=module -e '
const u = process.env.SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: k, Authorization: `Bearer ${k}` };
const rows = await (await fetch(`${u}/rest/v1/aci_page_feedback?select=id&limit=1`, { headers: h })).json();
console.log("table:", JSON.stringify(rows));
const buckets = await (await fetch(`${u}/storage/v1/bucket`, { headers: h })).json();
console.log("bucket:", buckets.filter(b => b.id === "aci-page-feedback"));
'
```
Expected: `table: []` and a bucket line showing `public: false` and
`file_size_limit: 4194304`.

- [ ] **Step 4: Commit and open the PR in polaris-supabase**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase
git checkout -b aci-page-feedback
git add evals/supabase/migrations/20260920120000_aci_page_feedback.sql
git commit -m "feat: a reader says something about a whole page, with the page

aci_feedback is about a paragraph and carries no room for a screenshot.
This is the second table and the second private bucket, for the report
that is mostly a picture. Applied by hand: the Migrations workflow has
failed since #30 on the access token and project ref pair.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
gh pr create --fill
```

---

### Task 2: The route's rules

**Files:**
- Create: `app/lib/page-feedback.mjs`
- Create: `app/lib/__tests__/page-feedback.test.mjs`
- Modify: `app/lib/feedback.mjs` (export the address regex)

**Interfaces:**
- Consumes: `callerAddress`, `sourceHash`, `recentFrom` from
  `app/lib/submissions.mjs`.
- Produces: `TABLE`, `BUCKET`, `PER_HOUR`, `MAX_REQUEST_BYTES`,
  `MAX_IMAGE_BYTES`, `LIMITS`, `SIGNED_FOR`, `normalise(form) -> fields`,
  `pageProblems(fields) -> string[]`. `fields` is
  `{ comment, email, page_url, viewport, user_agent, capture_method, website, image }`
  where `image` is a `File` or `null`.
  `app/lib/feedback.mjs` gains `export const ADDRESS`.

- [ ] **Step 1: Export the address regex from feedback.mjs**

In `app/lib/feedback.mjs`, change the declaration at line 39 from `const` to
`export const`, and extend the comment to say why it is shared:

```js
/* Enough to refuse what is plainly not an address. Nothing here verifies that
 * an address exists: the proposal form made the same call, and a submission is
 * judged on what it says.
 *
 * Exported because the page-feedback route asks the same question of the same
 * kind of field, and two copies of a regular expression are two regular
 * expressions the day one of them is loosened. */
export const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
```

- [ ] **Step 2: Write the failing tests**

Create `app/lib/__tests__/page-feedback.test.mjs`:

```js
/**
 * The page-feedback route's library. The third door of this application open to
 * the internet that writes, so what it refuses is what these tests are about.
 * No network: every call takes an injected fetch.
 * Run: node --test app/lib/__tests__/page-feedback.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIMITS, MAX_IMAGE_BYTES, MAX_REQUEST_BYTES, PER_HOUR,
  normalise, pageProblems,
} from "../page-feedback.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

/** A form in the shape the browser sends, with only the given fields changed. */
function form(changed = {}) {
  const data = new FormData();
  const fields = {
    comment: "The table runs off the right of my phone.",
    email: "reader@example.org",
    page_url: "https://example.org/overview?view=governance",
    viewport: "390x844 @3",
    user_agent: "Mozilla/5.0 (iPhone)",
    capture_method: "html2canvas",
    ...changed,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null) data.set(key, value);
  }
  return data;
}

/** A PNG part of a given size, which is all these rules look at. */
function png(bytes) {
  return new File([new Uint8Array(bytes)], "page.png", { type: "image/png" });
}

test("a report with words, an address and a picture is accepted", () => {
  const data = form();
  data.set("screenshot", png(1024));
  assert.deepEqual(pageProblems(normalise(data)), []);
});

test("a report with no picture is still a report", () => {
  assert.deepEqual(pageProblems(normalise(form())), []);
  assert.equal(normalise(form()).image, null);
});

test("words are required: a picture on its own is a puzzle", () => {
  const data = form({ comment: "   " });
  data.set("screenshot", png(1024));
  assert.deepEqual(pageProblems(normalise(data)), ["tell us what you see"]);
});

test("the address is required, because a reply needs somewhere to go", () => {
  assert.deepEqual(pageProblems(normalise(form({ email: "" }))),
                   ["your address is required, so we can write back"]);
});

test("an address that is not an address is refused before it is stored", () => {
  for (const wrong of ["reader", "reader@", "@example.org", "a b@example.org"]) {
    assert.deepEqual(pageProblems(normalise(form({ email: wrong }))),
                     ["your address does not look like an address"], wrong);
  }
});

test("every field is bounded, and every problem is reported at once", () => {
  const found = pageProblems(normalise(form({
    comment: "x".repeat(LIMITS.comment + 1),
    email: `${"x".repeat(LIMITS.email)}@example.org`,
    page_url: `https://example.org/${"x".repeat(LIMITS.page_url)}`,
    user_agent: "x".repeat(LIMITS.user_agent + 1),
    viewport: "x".repeat(LIMITS.viewport + 1),
    capture_method: "x".repeat(LIMITS.capture_method + 1),
  })));
  assert.equal(found.length, 6, JSON.stringify(found));
});

test("an image larger than the cap is refused, and named as the reason", () => {
  const data = form();
  data.set("screenshot", png(MAX_IMAGE_BYTES + 1));
  assert.deepEqual(pageProblems(normalise(data)),
                   ["that screenshot is larger than 3 MB"]);
});

test("a screenshot part that is not a PNG is refused", () => {
  const data = form();
  data.set("screenshot", new File(["x"], "page.gif", { type: "image/gif" }));
  assert.deepEqual(pageProblems(normalise(data)), ["a screenshot must be a PNG"]);
});

test("an empty file part is no file at all rather than a bad one", () => {
  const data = form();
  data.set("screenshot", new File([], "page.png", { type: "image/png" }));
  assert.equal(normalise(data).image, null);
  assert.deepEqual(pageProblems(normalise(data)), []);
});

test("the honeypot is read and never confused with a real field", () => {
  assert.equal(normalise(form()).website, "");
  assert.equal(normalise(form({ website: "http://spam" })).website, "http://spam");
});

test("the caps are the numbers the design fixed", () => {
  assert.equal(PER_HOUR, 10);
  assert.equal(MAX_REQUEST_BYTES, 4 * 1024 * 1024);
  assert.equal(MAX_IMAGE_BYTES, 3 * 1024 * 1024);
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `node --test app/lib/__tests__/page-feedback.test.mjs`
Expected: FAIL, `Cannot find module .../page-feedback.mjs`.

- [ ] **Step 4: Write the module**

Create `app/lib/page-feedback.mjs`:

```js
/**
 * What a reader says about a whole page, with the page attached.
 *
 * Not a proposal and not a note on a paragraph. A proposal asks us to run
 * something; a note disagrees with a panel's reading of one paragraph. This is
 * the third thing, and the commonest: this page is broken, and here is what I
 * was looking at when it broke.
 *
 * Third route of the application open to the internet that writes, so it wears
 * the same three defences the other two wear, imported rather than copied: a
 * honeypot, a cap per source per hour counted against this table, and a size
 * cap read from the headers before a byte of the body is buffered.
 *
 * Private throughout. aci_feedback records what a reader permits because a note
 * about a paragraph might one day be shown beside it; a screenshot of somebody
 * else's browser never will be, so there is nothing to ask and nothing to
 * record.
 */
import { ADDRESS } from "./feedback.mjs";

export const TABLE = "aci_page_feedback";
export const BUCKET = "aci-page-feedback";

/* One source, one hour. The proposal form's number rather than the note
 * dialog's thirty, because every one of these carries a file. */
export const PER_HOUR = 10;

/* What a whole request may weigh, read from Content-Length before the body is
 * buffered. Under Vercel's own ceiling for a serverless request, with room over
 * the image cap for multipart framing and the text fields. */
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

/* What the image may weigh. The sender already halves and re-encodes anything
 * over this, so a request that carries more is not a browser of ours. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/* How long the link in the Slack message lives. After that the picture goes
 * from the channel's history and the portal link, which does not expire, is
 * what is left. A permanent link would mean a public bucket, and a capture of
 * somebody's browser can hold anything they had on screen. */
export const SIGNED_FOR = 7 * 24 * 3600;

/* Long enough for the longest honest answer, and bounded, because an unbounded
 * text field on an open route is a way to fill a database. page_url is the
 * large one on purpose: the reader's address carries a document, a publication
 * and a list of behaviours at once, and truncating it would hand an operator a
 * link that goes somewhere else. */
export const LIMITS = {
  comment: 5000, email: 200, page_url: 2000,
  user_agent: 500, viewport: 50, capture_method: 40,
};

const text = value => (typeof value === "string" ? value.trim() : "");

/**
 * What arrived, in the shape the rules are written against.
 *
 * One normalisation is a decision rather than tidying: a file part with no
 * bytes becomes no file at all. A browser that sends an empty part for a
 * screenshot the sender dropped is saying the same thing as a browser that
 * sends no part, and reading it as a broken image would refuse an honest
 * report.
 */
export function normalise(form) {
  const field = name => text(form?.get?.(name));
  const sent = form?.get?.("screenshot");
  const image = sent && typeof sent === "object"
             && typeof sent.arrayBuffer === "function" && sent.size > 0
    ? sent : null;
  return {
    comment: field("comment"),
    email: field("email"),
    page_url: field("page_url"),
    viewport: field("viewport"),
    user_agent: field("user_agent"),
    capture_method: field("capture_method"),
    website: field("website"),
    image,
  };
}

function tooLong(value, limit, what) {
  return value.length > limit ? `the ${what} is longer than ${limit} characters` : null;
}

/** Everything wrong with a report, at once. */
export function pageProblems(fields) {
  const found = [];
  if (!fields.comment) found.push("tell us what you see");
  if (!fields.email) found.push("your address is required, so we can write back");
  else if (!ADDRESS.test(fields.email)) {
    found.push("your address does not look like an address");
  }
  for (const [value, limit, what] of [
    [fields.comment, LIMITS.comment, "comment"],
    [fields.email, LIMITS.email, "address"],
    [fields.page_url, LIMITS.page_url, "page address"],
    [fields.user_agent, LIMITS.user_agent, "browser string"],
    [fields.viewport, LIMITS.viewport, "window size"],
    [fields.capture_method, LIMITS.capture_method, "capture method"],
  ]) {
    const long = tooLong(value, limit, what);
    if (long) found.push(long);
  }
  if (fields.image) {
    if (fields.image.size > MAX_IMAGE_BYTES) {
      found.push(`that screenshot is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
    }
    if (fields.image.type !== "image/png") found.push("a screenshot must be a PNG");
  }
  return found;
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `node --test app/lib/__tests__/page-feedback.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 6: Run the whole route suite, to prove the regex export broke nothing**

Run: `pnpm test:routes`
Expected: every test passes, including `feedback.test.mjs`.

- [ ] **Step 7: Commit**

```bash
git add app/lib/page-feedback.mjs app/lib/__tests__/page-feedback.test.mjs app/lib/feedback.mjs
git commit -m "feat: the rules a page report is held to

Third public route that writes, and the first whose body carries a file.
The address regex moves out of feedback.mjs rather than being written a
second time: two copies are two regular expressions the day one of them
is loosened.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Recording and announcing

**Files:**
- Modify: `app/lib/page-feedback.mjs`
- Modify: `app/lib/__tests__/page-feedback.test.mjs`

**Interfaces:**
- Consumes: `insert`, `upload`, `signedLink` from `app/lib/supabase.mjs`;
  `forSlack`, `postToSlack` from `app/lib/slack.mjs`; `LIMITS`, `BUCKET`,
  `TABLE`, `SIGNED_FOR` from Task 2.
- Produces: `record({ fields, hash }, { fetchImpl }) -> row` and
  `announce(row, fetchImpl, site) -> string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/__tests__/page-feedback.test.mjs`, and add `announce`,
`record` and `BUCKET` to the import list at the top of the file:

```js
/** A fetch that records what it was asked and answers what it is told to. */
function fakeFetch(answers = {}) {
  const seen = [];
  const impl = async (url, options = {}) => {
    seen.push({ url: String(url), options });
    for (const [fragment, answer] of Object.entries(answers)) {
      if (String(url).includes(fragment)) return answer();
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  impl.seen = seen;
  return impl;
}

const ROW = () => new Response(JSON.stringify([{ id: "row-1" }]), {
  status: 201, headers: { "content-type": "application/json" },
});

test("the image lands in the bucket before the row that describes it", async () => {
  const order = [];
  const impl = fakeFetch({
    "/storage/v1/object/aci-page-feedback/": () => {
      order.push("upload");
      return new Response("{}", { status: 200 });
    },
    "/rest/v1/aci_page_feedback": () => {
      order.push("insert");
      return ROW();
    },
  });
  const data = form();
  data.set("screenshot", png(64));
  const row = await record({ fields: normalise(data), hash: "H" }, { fetchImpl: impl });
  assert.deepEqual(order, ["upload", "insert"]);
  assert.equal(row.id, "row-1");
  const wrote = JSON.parse(impl.seen.find(c => c.url.includes("/rest/v1/")).options.body)[0];
  assert.match(wrote.screenshot, /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.png$/);
  assert.equal(wrote.capture_method, "html2canvas");
  assert.equal(wrote.source_hash, "H");
  assert.equal(wrote.submitter, "reader@example.org");
});

test("a report with no image writes a null path and uploads nothing", async () => {
  const impl = fakeFetch({ "/rest/v1/aci_page_feedback": ROW });
  await record({ fields: normalise(form()), hash: "H" }, { fetchImpl: impl });
  assert.equal(impl.seen.filter(c => c.url.includes("/storage/")).length, 0);
  const wrote = JSON.parse(impl.seen[0].options.body)[0];
  assert.equal(wrote.screenshot, null);
  assert.equal(wrote.capture_method, null);
});

test("Slack carries the picture, and a refused message is sent again without it", async () => {
  let posts = 0;
  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/x";
  const impl = fakeFetch({
    "/storage/v1/object/sign/": () => new Response(
      JSON.stringify({ signedURL: "/object/sign/aci-page-feedback/a.png?token=t" }),
      { status: 200, headers: { "content-type": "application/json" } }),
    "hooks.slack.test": () => {
      posts += 1;
      return new Response("invalid_blocks", { status: posts === 1 ? 400 : 200 });
    },
  });
  const silent = await announce(
    { id: "row-1", page_url: "https://example.org/overview", comment: "Broken.",
      submitter: "reader@example.org", screenshot: "2026-09-20/a.png",
      viewport: "390x844 @3" },
    impl, "https://example.org");
  assert.equal(silent, null);
  assert.equal(posts, 2);
  const [first, second] = impl.seen.filter(c => c.url.includes("hooks.slack.test"))
    .map(c => JSON.parse(c.options.body));
  assert.ok(first.blocks.some(b => b.type === "image"), "the first try carries the image");
  assert.ok(!second.blocks.some(b => b.type === "image"), "the second does not");
  assert.ok(second.blocks.some(b => JSON.stringify(b).includes("/admin/page-feedback")));
});

test("a stranger's words cannot ping the channel", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/x";
  const impl = fakeFetch({ "hooks.slack.test": () => new Response("ok", { status: 200 }) });
  await announce({ id: "r", page_url: "https://example.org/", comment: "<!channel> look",
                   submitter: "spam@example.org" }, impl, "https://example.org");
  const body = impl.seen.find(c => c.url.includes("hooks.slack.test")).options.body;
  assert.ok(!body.includes("<!channel>"), body);
  assert.ok(body.includes("&lt;!channel&gt;"), body);
});

test("no webhook is a message nobody got, not an error thrown at the caller", async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  const silent = await announce({ id: "r", page_url: "https://example.org/", comment: "x" },
                                fakeFetch(), "https://example.org");
  assert.equal(silent, "SLACK_WEBHOOK_URL is not set");
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test app/lib/__tests__/page-feedback.test.mjs`
Expected: FAIL, `record is not a function` and `announce is not a function`.

- [ ] **Step 3: Write record and announce**

Append to `app/lib/page-feedback.mjs`, and add the imports at the top of the
file:

```js
import { randomUUID } from "node:crypto";
import { insert, signedLink, upload } from "./supabase.mjs";
import { forSlack, postToSlack } from "./slack.mjs";
```

```js
/**
 * Record a report: the image first, then the row that describes it.
 *
 * That order is the other two routes' order and it is the point: a row never
 * points at an object that is not there. The Slack message is a courtesy the
 * caller pays afterwards, so a webhook that is missing or refuses leaves the
 * report intact.
 */
export async function record({ fields, hash }, { fetchImpl = fetch } = {}) {
  let path = null;
  if (fields.image) {
    // The date in the path so a year of reports is browsable, the uuid so two
    // captures of the same page never meet.
    path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.png`;
    await upload(BUCKET, path, await fields.image.arrayBuffer(), "image/png", fetchImpl);
  }
  const [row] = await insert(TABLE, [{
    page_url: fields.page_url,
    comment: fields.comment,
    submitter: fields.email,
    screenshot: path,
    capture_method: path ? fields.capture_method || null : null,
    viewport: fields.viewport,
    user_agent: fields.user_agent,
    source_hash: hash,
  }], fetchImpl);
  return row;
}

/* Long enough to judge a report from the message, short enough to read. */
const IN_SLACK = 700;

const TITLE = "Feedback on a page";

/**
 * Tell Slack. Returns what went wrong, or null; never throws.
 *
 * Two attempts rather than one, and the reason is Slack's own behaviour: it
 * fetches image_url itself and refuses the WHOLE message when a block displeases
 * it. A signed link it will not accept would otherwise cost us the notification
 * entirely, and a report that arrives without its picture is worth more than a
 * report that does not arrive.
 *
 * The address is in the message because the message goes to us. It is the one
 * place it appears outside the database, and it appears nowhere public.
 */
export async function announce(row = {}, fetchImpl = fetch, site = "") {
  const comment = String(row?.comment || "");
  const shown = comment.length > IN_SLACK ? `${comment.slice(0, IN_SLACK)}...` : comment;
  const said = [
    `*Said:* ${forSlack(shown)}`,
    `*On:* ${forSlack(row.page_url || "no page given")}`,
  ].join("\n");

  const base = [
    { type: "header", text: { type: "plain_text", text: TITLE } },
    { type: "section", text: { type: "mrkdwn", text: said } },
    { type: "context", elements: [{ type: "mrkdwn",
      text: `From ${forSlack(row.submitter || "no address given")}`
          + (row.viewport ? ` | ${forSlack(row.viewport)}` : "")
          + (row.screenshot ? "" : " | no screenshot")
          + ` | <${site}/admin/page-feedback|read it in the portal>` }] },
  ];

  let link = null;
  if (row.screenshot) {
    try {
      link = await signedLink(BUCKET, row.screenshot, SIGNED_FOR, fetchImpl);
    } catch {
      // A link that could not be minted is a message without a picture, which
      // is what the retry below sends anyway.
    }
  }

  if (link) {
    const withImage = [base[0], base[1],
      { type: "image", image_url: link, alt_text: "the page as the sender saw it" },
      base[2]];
    const refused = await postToSlack(TITLE, withImage, fetchImpl);
    if (!refused) return null;
    console.error(`page-feedback: slack refused the image block: ${refused}`);
  }
  return postToSlack(TITLE, base, fetchImpl);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test app/lib/__tests__/page-feedback.test.mjs`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/page-feedback.mjs app/lib/__tests__/page-feedback.test.mjs
git commit -m "feat: a page report reaches the bucket, the table and Slack

The image lands before the row, as the other two routes do it, so a row
never points at an object that is not there. Slack gets two attempts:
it fetches image_url itself and refuses the whole message over one bad
block, and a report without its picture beats a report nobody sees.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The route

**Files:**
- Modify: `app/lib/page-feedback.mjs`
- Modify: `app/lib/__tests__/page-feedback.test.mjs`
- Create: `app/api/page-feedback/route.js`

**Interfaces:**
- Consumes: `normalise`, `pageProblems`, `record`, `announce` from Tasks 2 and 3;
  `callerAddress`, `sourceHash`, `recentFrom` from `app/lib/submissions.mjs`.
- Produces: `handle(request, { fetchImpl }) -> Response` and the route file.

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/__tests__/page-feedback.test.mjs`, adding `handle` and
`MAX_REQUEST_BYTES` to the import list:

```js
/** A request in the shape the browser sends, without a server. */
function request(data, headers = {}) {
  return new Request("https://example.org/api/page-feedback", {
    method: "POST", body: data, headers,
  });
}

const THANKS = "Thank you. We read every one.";

test("a good report is recorded and answered with one sentence", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/x";
  const impl = fakeFetch({
    "/rest/v1/aci_page_feedback?select=id": () => new Response("[]", { status: 200 }),
    "/rest/v1/aci_page_feedback": ROW,
    "hooks.slack.test": () => new Response("ok", { status: 200 }),
  });
  const data = form();
  data.set("screenshot", png(64));
  const answer = await handle(request(data), { fetchImpl: impl });
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { done: THANKS });
});

test("a body declared larger than the cap is refused before it is read", async () => {
  // A string body rather than a FormData, because what is under test is the
  // header and not the parse: the route must refuse before it buffers. This is
  // the idiom feedback.test.mjs already uses for its own cap.
  const impl = fakeFetch();
  const answer = await handle(new Request("https://example.org/api/page-feedback", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x",
               "content-length": String(MAX_REQUEST_BYTES + 1) },
    body: "--x--\r\n",
  }), { fetchImpl: impl });
  assert.equal(answer.status, 413);
  assert.match((await answer.json()).problem, /larger than this form takes/);
  assert.equal(impl.seen.length, 0, "nothing was asked of the database");
});

test("the eleventh report in an hour from one place is refused", async () => {
  const impl = fakeFetch({
    "/rest/v1/aci_page_feedback?select=id": () => new Response(
      JSON.stringify(Array.from({ length: PER_HOUR }, (_, i) => ({ id: i }))),
      { status: 200, headers: { "content-type": "application/json" } }),
  });
  const answer = await handle(request(form()), { fetchImpl: impl });
  assert.equal(answer.status, 429);
  assert.match((await answer.json()).problem, /already sent are safe/);
});

test("the rate-limit read failing does not refuse an honest report", async () => {
  const impl = fakeFetch({
    "/rest/v1/aci_page_feedback?select=id": () => new Response("no", { status: 500 }),
    "/rest/v1/aci_page_feedback": ROW,
  });
  const answer = await handle(request(form()), { fetchImpl: impl });
  assert.equal(answer.status, 200);
});

test("the honeypot is answered as a success and recorded nowhere", async () => {
  const impl = fakeFetch({ "/rest/v1/aci_page_feedback": ROW });
  const answer = await handle(request(form({ website: "http://spam" })), { fetchImpl: impl });
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { done: THANKS });
  assert.equal(impl.seen.filter(c => c.options.method === "POST").length, 0);
});

test("a report with problems is refused with every problem at once", async () => {
  const answer = await handle(request(form({ comment: "", email: "nope" })),
                              { fetchImpl: fakeFetch() });
  assert.equal(answer.status, 400);
  const { problem } = await answer.json();
  assert.match(problem, /tell us what you see/);
  assert.match(problem, /does not look like an address/);
});

test("a body that is not a form is refused rather than thrown", async () => {
  const answer = await handle(
    new Request("https://example.org/api/page-feedback",
                { method: "POST", body: "{}", headers: { "content-type": "application/json" } }),
    { fetchImpl: fakeFetch() });
  assert.equal(answer.status, 400);
});

test("a database that will not take it says so, and says nothing was kept", async () => {
  const impl = fakeFetch({
    "/rest/v1/aci_page_feedback?select=id": () => new Response("[]", { status: 200 }),
    "/rest/v1/aci_page_feedback": () => new Response("no", { status: 500 }),
  });
  const answer = await handle(request(form()), { fetchImpl: impl });
  assert.equal(answer.status, 500);
  assert.match((await answer.json()).problem, /Nothing was recorded/);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test app/lib/__tests__/page-feedback.test.mjs`
Expected: FAIL, `handle is not a function`.

- [ ] **Step 3: Write handle**

Append to `app/lib/page-feedback.mjs`, and add to the imports at the top:

```js
import { callerAddress, recentFrom, sourceHash } from "./submissions.mjs";
```

```js
const said = (status, outcome) => Response.json(outcome, { status });

/* What a reader is told when it worked. The same sentence the paragraph note
 * answers with, because it is the same promise: reading every one is a promise
 * we keep, and answering every one is not. */
const THANKS = "Thank you. We read every one.";

/**
 * The whole of the route, in one function so it can be tested without a server.
 *
 * Multipart in, JSON out. Multipart because the body carries a PNG, and
 * base64 in a JSON field would add a third to every request for nothing. JSON
 * out because the caller is a script on a page whose state cost something to
 * arrange, and the redirect /api/submit answers with would throw that away.
 */
export async function handle(request, { fetchImpl = fetch } = {}) {
  // Everything that can be judged from the headers is judged before a byte of
  // the body is read. Parsing a form buffers the whole of it, so a check that
  // runs afterwards has already paid for the request it means to refuse.
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_REQUEST_BYTES) {
    return said(413, {
      problem: `That is larger than this form takes. A screenshot may be up to `
             + `${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    });
  }

  const hash = sourceHash(callerAddress(request.headers));
  try {
    if (await recentFrom(hash, fetchImpl, TABLE) >= PER_HOUR) {
      return said(429, {
        problem: `That is ${PER_HOUR} within the hour from here, which is as many as this `
               + "form takes. The ones already sent are safe; try again later.",
      });
    }
  } catch (error) {
    // The rate-limit read failing must not refuse an honest report.
    console.error(`page-feedback: counting recent reports failed: ${error.message}`);
  }

  let sent;
  try {
    sent = await request.formData();
  } catch {
    return said(400, { problem: "That was not a report." });
  }

  const fields = normalise(sent);

  // Hidden from people, filled in by machinery that posts to every form it
  // finds. Answered exactly as a real report is, and recorded nowhere: saying
  // "refused" would teach the next attempt what to leave blank.
  if (fields.website) return said(200, { done: THANKS });

  const found = pageProblems(fields);
  if (found.length) return said(400, { problem: found.join("\n") });

  let row;
  try {
    row = await record({ fields, hash }, { fetchImpl });
  } catch (error) {
    console.error(`page-feedback: ${error.stack || error}`);
    return said(500, {
      problem: "Something on our side would not take that. Nothing was recorded, "
             + "so it is worth trying again.",
    });
  }

  const silent = await announce(row, fetchImpl, new URL(request.url).origin);
  if (silent) console.error(`page-feedback: ${row.id} recorded, not announced: ${silent}`);

  return said(200, { done: THANKS });
}
```

- [ ] **Step 4: Write the route file**

Create `app/api/page-feedback/route.js`:

```js
/* The third route open to the internet that writes.
 *
 * It records what a reader thinks of a page, with a picture of the page. It
 * registers nothing, judges nothing, spends nothing and publishes nothing.
 *
 * Everything it does is in app/lib/page-feedback.mjs, where it can be tested
 * without a server. */
import { handle } from "../../lib/page-feedback.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  return handle(request);
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `node --test app/lib/__tests__/page-feedback.test.mjs`
Expected: PASS, 24 tests.

- [ ] **Step 6: Run the whole suite**

Run: `pnpm test:routes`
Expected: every test passes.

- [ ] **Step 7: Commit**

```bash
git add app/lib/page-feedback.mjs app/lib/__tests__/page-feedback.test.mjs app/api/page-feedback/route.js
git commit -m "feat: POST /api/page-feedback takes a report and a picture

Multipart in, JSON out. Multipart because base64 in a JSON field costs a
third of every request for nothing; JSON out because the caller is a
script on a page whose state cost something to arrange.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Where the reports are read

**Files:**
- Modify: `app/lib/admin-data.mjs`
- Create: `app/admin/page-feedback/page.jsx`
- Create: `app/api/admin/page-feedback/route.js`
- Modify: `app/admin/layout.jsx:13-22`

**Interfaces:**
- Consumes: table `aci_page_feedback` from Task 1; `select` and `signedLink`
  from `app/lib/supabase.mjs`; `formRoute`, `refuse` from
  `app/lib/admin-routes.mjs`; `Outcome`, `When` from `app/admin/parts.jsx`.
- Produces: `pageFeedback(limit, fetchImpl) -> rows` where each row carries an
  extra `link`, a signed URL to its capture or null.

- [ ] **Step 1: Add the reader to admin-data.mjs**

Insert after `submissions()`, which it mirrors:

```js
/** What readers said about whole pages, newest first, each with its capture.
 *
 * The link is minted here and expires, because the bucket is private and a
 * permanent link to a private object is a public object with extra steps. This
 * is the only surface that can open one: a private bucket with nothing that
 * reads it is a bucket nobody can open. */
export async function pageFeedback(limit = 50, fetchImpl = fetch) {
  const rows = await select("aci_page_feedback",
                            `select=*&order=created_at.desc&limit=${limit}`, fetchImpl);
  return Promise.all(rows.map(async row => ({
    ...row,
    link: row.screenshot
      ? await signedLink("aci-page-feedback", row.screenshot, 3600, fetchImpl)
      : null,
  })));
}
```

- [ ] **Step 2: Write the portal page**

Create `app/admin/page-feedback/page.jsx`:

```jsx
/* What readers said about whole pages, with the page attached.
 *
 * None of it is shown on the site and none of it ever will be: a capture of
 * somebody's browser is private, which is what the form promised. What this
 * page is for is reading them, opening the picture, and saying which have been
 * acted on. */
import { pageFeedback } from "../../lib/admin-data.mjs";
import { Outcome, When } from "../parts.jsx";

const NEXT = {
  new: ["read", "declined"],
  read: ["actioned", "declined"],
  actioned: ["read"],
  declined: ["read"],
};

export default async function PageFeedback({ searchParams }) {
  const params = await searchParams;
  const rows = await pageFeedback();
  const waiting = rows.filter(row => row.status === "new").length;

  return (
    <section>
      <h2>Page reports</h2>
      <p className="why">
        What readers said about a whole page, through the bubble at the bottom
        right of the public pages. Each one may carry a capture of what they
        were looking at, annotated. None of it is shown on the site: the form
        says it stays private. {waiting} waiting to be read.
      </p>
      <Outcome done={params?.done} problem={params?.problem} />

      {rows.length === 0 ? <p className="empty">Nobody has reported anything yet.</p> : (
        <table>
          <thead>
            <tr>
              <th>Arrived</th><th>Page</th><th>Said</th><th>Saw</th>
              <th>State</th><th>Do</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td>
                  <When at={row.created_at} />
                  <br />
                  <span className="mono" style={{ color: "var(--faint)" }}>
                    {row.submitter}
                  </span>
                </td>
                <td style={{ maxWidth: "28ch" }}>
                  <a className="mono" href={row.page_url}>{row.page_url}</a>
                  <div className="mono" style={{ color: "var(--faint)", marginTop: 4 }}>
                    {row.viewport}
                  </div>
                </td>
                <td style={{ maxWidth: "40ch" }}>{row.comment}</td>
                <td>
                  {row.link
                    ? (
                      <a href={row.link} target="_blank" rel="noopener noreferrer">
                        <img src={row.link} alt="the page as the sender saw it"
                             style={{ display: "block", width: 160, height: "auto",
                                      border: "1px solid var(--muted)" }} />
                      </a>
                      )
                    : <span className="empty">no capture</span>}
                </td>
                <td><span className={`state ${row.status === "new" ? "pending" : "done"}`}>
                  {row.status}
                </span></td>
                <td>
                  {(NEXT[row.status] || []).map(to => (
                    <form key={to} method="post" action="/api/admin/page-feedback">
                      <input type="hidden" name="report_id" value={row.id} />
                      <input type="hidden" name="status" value={to} />
                      <button className="quiet" type="submit">{to}</button>
                    </form>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Write the status route**

Create `app/api/admin/page-feedback/route.js`:

```js
/* Moving a page report's state. That is the whole of what the portal does to
 * one: there is nothing to accept, because nothing here asked us to run
 * anything. Marking it actioned says somebody did something about it. */
import { update } from "../../../lib/supabase.mjs";
import { requireOperator } from "../../../auth.mjs";
import { formRoute, refuse } from "../../../lib/admin-routes.mjs";

const STATES = ["new", "read", "actioned", "declined"];

export const POST = formRoute("/admin/page-feedback", requireOperator, async (fields) => {
  const id = fields.one("report_id");
  const status = fields.one("status");
  if (!id) refuse("no report named");
  if (!STATES.includes(status)) refuse(`state must be one of ${STATES.join(", ")}`);
  const [row] = await update("aci_page_feedback", `id=eq.${id}`, { status });
  if (!row) refuse("no such report");
  return `Marked ${status}.`;
});
```

- [ ] **Step 4: Add the nav entry**

In `app/admin/layout.jsx`, append one line to `PAGES`, after the notes entry:

```js
  ["/admin/feedback", "Notes"],
  ["/admin/page-feedback", "Page reports"],
];
```

- [ ] **Step 5: Check the build sees no error**

Run: `pnpm build`
Expected: a successful build listing `/admin/page-feedback` and
`/api/admin/page-feedback` among the routes.

- [ ] **Step 6: Look at the page**

Run: `pnpm dev`, sign in, open `http://127.0.0.1:3000/admin/page-feedback`.
Expected: the heading, the explanation, `Nobody has reported anything yet.`,
and `Page reports` in the nav bar. Leave the server running for Task 7.

- [ ] **Step 7: Commit**

```bash
git add app/lib/admin-data.mjs app/admin/page-feedback app/api/admin/page-feedback app/admin/layout.jsx
git commit -m "feat: the portal reads page reports and opens their captures

A private bucket with no surface that reads it is a bucket nobody can
open, so this page is not optional. The link is minted per render and
expires: a permanent link to a private object is a public object with
extra steps.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The bubble, with no camera yet

**Files:**
- Create: `site/page-feedback.js`
- Modify: `site/overview.html`, `site/about.html`, `site/mcp.html`,
  `site/spec-reader/index.html` (one script tag each, before `</body>`)
- Create: `tests/test_page_feedback_bubble.py`
- Modify: `engine/reader-routes.mjs`
- Modify: `engine/verify-reader-features.mjs`

**Interfaces:**
- Consumes: `POST /api/page-feedback` from Task 4.
- Produces: the DOM ids the walker and later tasks address: `#pf-pill`,
  `#pf-note`, `#pf-comment`, `#pf-email`, `#pf-website`, `#pf-send`, `#pf-said`.
  `engine/reader-routes.mjs` gains `servePageFeedbackRoute(request, response)`
  and `lastPageFeedbackReceived()`, the latter returning
  `{ comment, email, page_url, viewport, user_agent, capture_method, website, screenshot }`
  where `screenshot` is `{ bytes, type, png }` or null.

- [ ] **Step 1: Write the module**

Create `site/page-feedback.js`:

```js
/**
 * The bubble that photographs the page it is on.
 *
 * WHAT IT IS FOR
 *
 * Two forms already take words from outside. /about takes a proposal, which is
 * somebody asking us to run something. The reader's paragraph dialog takes a
 * note about one paragraph, which is somebody disagreeing with a panel's
 * reading. Neither takes the third and commonest thing anybody has to offer:
 * this page is broken, this table runs off my phone, this heading says the
 * wrong date. That report is mostly a picture, and a sentence describing a
 * layout fault is a sentence somebody has to reconstruct into a screen.
 *
 * WHY IT IS ONE FILE
 *
 * Four pages carry it and each keeps its own stylesheet. Copied four times, the
 * wording and the route would drift the first time one of them was edited.
 * Everything here is built as nodes: a page gains one script tag. That is
 * dev-tag.js's reasoning and dev-tag.js's shape.
 *
 * NO BACKTICK MAY APPEAR INSIDE STYLE, COMMENTS INCLUDED. One backtick closes
 * the literal, what follows is still valid JavaScript, node --check sees
 * nothing, and the page throws on load. dev-tag.js learned that the hard way.
 */

const ROUTE = "/api/page-feedback";

/* The same key the reader's paragraph dialog writes. One person, one site, one
 * address: typing it into one dialog should save typing it into the other. */
const REMEMBER = "aci-feedback-email";

const STYLE = `
.pf-pill {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 90;
  padding: 9px 18px;
  border: 0;
  border-radius: 999px;
  background: #333D22;
  color: #F1EFE3;
  font-family: "Instrument Sans", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
  transition: background 150ms, color 150ms;
}
.pf-pill:hover { background: #B7C94B; color: #23281B; }
.pf-pill:focus-visible { outline: 2px solid #B7C94B; outline-offset: 2px; }

.pf-note {
  /* What centres a modal is its auto margin, and two of the four pages carry a
     universal reset that zeroes every margin: without this the dialog opens in
     the top left corner there and centred everywhere else. dev-tag.js puts it
     back the same way, with the same note beside it. */
  margin: auto;
  width: min(820px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  padding: 18px 20px 20px;
  border: 1px solid #5C6B3C;
  border-radius: 4px;
  background: #F1EFE3;
  color: #23281B;
  font-family: "Instrument Sans", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.55;
}
.pf-note::backdrop { background: rgb(35 40 27 / .5); }
.pf-note h2 { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
.pf-note label { display: block; margin: 0 0 4px; font-weight: 600; }
.pf-note textarea,
.pf-note input[type="email"] {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #5C6B3C;
  border-radius: 4px;
  background: #F1EFE3;
  color: #23281B;
  font: inherit;
}
.pf-note textarea { min-height: 84px; resize: vertical; }
.pf-note textarea:focus-visible,
.pf-note input:focus-visible { outline: 2px solid #B7C94B; outline-offset: 1px; }
.pf-field { margin: 0 0 12px; }
.pf-why { margin: 4px 0 0; font-size: 12px; color: #5C6B3C; }
.pf-trap { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.pf-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0 0; }
.pf-send,
.pf-cancel {
  padding: 8px 18px;
  border-radius: 999px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms, color 150ms;
}
.pf-send { border: 0; background: #333D22; color: #F1EFE3; }
.pf-send:hover:not(:disabled) { background: #B7C94B; color: #23281B; }
.pf-send:disabled { opacity: .5; cursor: default; }
.pf-cancel { border: 1px solid #5C6B3C; background: transparent; color: #23281B; }
.pf-cancel:hover { background: #B7C94B; }
.pf-send:focus-visible,
.pf-cancel:focus-visible { outline: 2px solid #B7C94B; outline-offset: 2px; }
.pf-said { margin: 10px 0 0; min-height: 1.55em; }
.pf-said.bad { color: #A0522D; }

@media (prefers-reduced-motion: reduce) {
  .pf-pill, .pf-send, .pf-cancel { transition: none; }
}
`;

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids.filter(kid => kid !== null && kid !== undefined));
  return node;
}

function remembered() {
  try {
    return localStorage.getItem(REMEMBER) || "";
  } catch {
    return "";        // a private window, or site data blocked
  }
}

function remember(address) {
  try {
    localStorage.setItem(REMEMBER, address);
  } catch {
    // Not worth a word to the sender: their report is already sent.
  }
}

function say(node, words, bad) {
  node.textContent = words;
  node.className = bad ? "pf-said bad" : "pf-said";
}

/**
 * Send what the dialog holds.
 *
 * The three context fields are named on the form above the button rather than
 * collected quietly. Nothing else leaves the page.
 */
async function send(parts) {
  const { comment, email, trap, said, sendButton, note } = parts;
  const words = comment.value.trim();
  const address = email.value.trim();
  if (!words || !address) return;

  sendButton.disabled = true;
  say(said, "Sending.", false);

  const form = new FormData();
  form.set("comment", words);
  form.set("email", address);
  form.set("page_url", location.href);
  form.set("viewport",
           `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}`);
  form.set("user_agent", navigator.userAgent);
  form.set("website", trap.value);

  try {
    const response = await fetch(ROUTE, { method: "POST", body: form });
    const outcome = await response.json().catch(() => ({}));
    if (!response.ok) {
      say(said, outcome.problem || "That did not go through. It is worth trying again.", true);
      sendButton.disabled = false;
      return;
    }
    remember(address);
    comment.value = "";
    say(said, outcome.done || "Thank you. We read every one.", false);
    setTimeout(() => note.close(), 1200);
  } catch {
    say(said, "That did not go through. It is worth trying again.", true);
    sendButton.disabled = false;
  }
}

function build() {
  document.head.append(el("style", { textContent: STYLE }));

  const comment = el("textarea", { id: "pf-comment", name: "comment", rows: 4 });
  const email = el("input", {
    id: "pf-email", name: "email", type: "email",
    autocomplete: "email", value: remembered(),
  });

  // Hidden from people, filled in by machinery that posts to every form it
  // finds. The route answers it exactly as it answers a real report.
  const trap = el("input", {
    className: "pf-trap", id: "pf-website", name: "website",
    type: "text", tabIndex: -1, autocomplete: "off",
  });
  trap.setAttribute("aria-hidden", "true");

  const said = el("p", { className: "pf-said", id: "pf-said" });
  said.setAttribute("role", "status");

  const sendButton = el("button", {
    type: "button", className: "pf-send", id: "pf-send", textContent: "Send feedback",
  });
  const cancel = el("button", {
    type: "button", className: "pf-cancel", id: "pf-cancel", textContent: "Cancel",
  });

  const note = el("dialog", { className: "pf-note", id: "pf-note" },
    el("h2", { textContent: "Tell us what you see" }),
    el("div", { className: "pf-field" },
      el("label", { htmlFor: "pf-comment", textContent: "What you want to tell us" }),
      comment),
    el("div", { className: "pf-field" },
      el("label", { htmlFor: "pf-email", textContent: "Your address" }),
      email,
      el("p", { className: "pf-why", textContent:
        "Your note and your address stay private. We use your address only to "
        + "write back." })),
    trap,
    el("p", { className: "pf-why", textContent:
      "Sent with this: the address of this page, the size of your window, and "
      + "your browser's identification string." }),
    said,
    el("div", { className: "pf-row" }, cancel, sendButton));

  const ready = () => {
    sendButton.disabled = !(comment.value.trim() && email.value.trim());
  };
  comment.addEventListener("input", ready);
  email.addEventListener("input", ready);
  ready();

  cancel.addEventListener("click", () => note.close());
  sendButton.addEventListener("click",
    () => send({ comment, email, trap, said, sendButton, note }));

  const pill = el("button", {
    type: "button", className: "pf-pill", id: "pf-pill", textContent: "Feedback",
  });
  pill.setAttribute("aria-haspopup", "dialog");
  pill.addEventListener("click", () => {
    say(said, "", false);
    ready();
    note.showModal();
    comment.focus();
  });

  document.body.append(note, pill);
}

build();
```

- [ ] **Step 2: Check it parses**

Run: `node --check site/page-feedback.js`
Expected: no output, exit 0. A backtick hidden in a comment inside `STYLE`
would not be caught here, which is why Step 1 puts the warning at the top of
the file and Step 6 opens the page in a browser.

- [ ] **Step 3: Add the script tag to all four pages**

Append the same two lines to each of `site/overview.html`, `site/about.html`,
`site/mcp.html` and `site/spec-reader/index.html`, immediately after the
`brand.js` tag and before `</body>`:

```html
<!-- The bubble at the bottom right: a screenshot of this page, annotated, with
     a sentence. One file for four pages, like dev-tag.js and brand.js. -->
<script type="module" src="/page-feedback.js"></script>
```

- [ ] **Step 4: Write the Python test**

Create `tests/test_page_feedback_bubble.py`:

```python
"""The feedback bubble is on every public page, and reaches the right route.

site/page-feedback.js is one file for four pages, like dev-tag.js and brand.js:
copied into each, its wording and its route would drift, and the page nobody
remembered would be the one posting somewhere else. This holds the four pages
to carrying it.

No network, no keys. Run: python3 -m unittest discover -s tests
"""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ["site/overview.html", "site/about.html", "site/mcp.html",
         "site/spec-reader/index.html"]
TAG = '<script type="module" src="/page-feedback.js"></script>'
MODULE = ROOT / "site" / "page-feedback.js"


class TheBubbleIsOnEveryPublicPage(unittest.TestCase):
    def test_every_public_page_loads_the_module(self):
        for page in PAGES:
            with self.subTest(page=page):
                self.assertIn(TAG, (ROOT / page).read_text(encoding="utf-8"))

    def test_the_module_posts_to_the_route_that_exists(self):
        source = MODULE.read_text(encoding="utf-8")
        self.assertIn('const ROUTE = "/api/page-feedback";', source)
        self.assertTrue((ROOT / "app" / "api" / "page-feedback" / "route.js").exists())

    def test_the_form_carries_its_honeypot(self):
        """The route answers a filled honeypot as a success and records nothing.
        A form that stopped sending the field would send every spam post
        straight into the table instead."""
        self.assertIn('id: "pf-website"', MODULE.read_text(encoding="utf-8"))
```

- [ ] **Step 5: Run the Python tests**

Run: `python3 -m unittest discover -s tests -v 2>&1 | tail -20`
Expected: every test passes, including the three new ones.

- [ ] **Step 6: Add the fixture route for the walker**

Append to `engine/reader-routes.mjs`, after `lastFeedbackReceived`:

```js
/** The body of the most recent POST /api/page-feedback, or null before one
 * arrives. Module-level for the same reason lastFeedback is: the walker reads
 * it back well after the click that set it. */
let lastPageFeedback = null;

/**
 * Answers POST /api/page-feedback the way app/api/page-feedback does when it
 * accepts. A fixture for the browser walkers, not a rebuild of the route's own
 * rules: those are tested under node against app/lib/page-feedback.mjs with no
 * browser and no database. What this exists for is letting a walker prove what
 * the bubble actually sent, picture included.
 *
 * The multipart body is parsed by handing it to Response, which is the same
 * parser the route itself gets from the platform.
 */
export async function servePageFeedbackRoute(request, response) {
  const url = new URL(request.url, "http://x");
  if (url.pathname !== "/api/page-feedback" || request.method !== "POST") return false;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": request.headers["content-type"] || "" },
    }).formData();
    const shot = form.get("screenshot");
    lastPageFeedback = {
      comment: form.get("comment"),
      email: form.get("email"),
      page_url: form.get("page_url"),
      viewport: form.get("viewport"),
      user_agent: form.get("user_agent"),
      capture_method: form.get("capture_method"),
      website: form.get("website"),
      screenshot: shot && typeof shot === "object" && shot.size
        ? { bytes: shot.size, type: shot.type,
            png: Buffer.from(await shot.arrayBuffer()) }
        : null,
    };
  } catch {
    lastPageFeedback = null;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ done: "Thank you. We read every one." }));
  return true;
}

/** What the last POST /api/page-feedback sent, for a walker to assert against. */
export function lastPageFeedbackReceived() {
  return lastPageFeedback;
}
```

`Buffer` is already available to this module under node; add
`import { Buffer } from "node:buffer";` at the top of the file if it is not
already imported there.

- [ ] **Step 7: Wire the fixture route into the walker and add the checks**

In `engine/verify-reader-features.mjs`, extend the import at line 22:

```js
import { serveReaderRoute, serveFeedbackRoute, lastFeedbackReceived,
         servePageFeedbackRoute, lastPageFeedbackReceived,
         CURRENT_PUBLICATION, DRAFT_PUBLICATION } from "./reader-routes.mjs";
```

and the server, immediately after the `serveFeedbackRoute` line near line 79:

```js
  // The bubble's own send: a fixture that always accepts, recording what it was
  // sent, picture included, for the page-feedback section below to read back.
  if (await servePageFeedbackRoute(req, res)) return;
```

Then insert this section immediately before the final `// ====` audit block at
the foot of the file:

```js
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

  await page.locator("#pf-send").click();
  await page.waitForTimeout(400);
  const sent = lastPageFeedbackReceived();
  check(Boolean(sent)
      && sent.comment === "The governance table runs off the right."
      && sent.email === "reader@example.org"
      && sent.page_url.endsWith("/overview.html")
      && /^\d+x\d+ @\d/.test(sent.viewport)
      && sent.user_agent.length > 0
      && sent.website === "",
    "the send posts the words, the address, the page, the window and the browser string",
    JSON.stringify({ ...sent, screenshot: Boolean(sent?.screenshot) }));

  const kept = await page.evaluate(() => {
    try { return localStorage.getItem("aci-feedback-email"); } catch { return null; }
  });
  check(kept === "reader@example.org",
    "the address is remembered under the key the paragraph dialog already uses", kept);

  await page.waitForTimeout(1200);
  const closed = await page.evaluate(() => !document.querySelector("#pf-note").open);
  check(closed, "the dialog closes on its own after a successful send");

  // The reader is the fourth page and the only one that is an application
  // rather than a document, so the pill is checked there too.
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  const onReader = await page.evaluate(() => Boolean(document.querySelector("#pf-pill")));
  check(onReader, "the pill is on the reader as well as the prose pages");

  check(pageErrors.length === 0, "the feedback bubble: no console errors",
    pageErrors.join("; "));
}
```

- [ ] **Step 8: Run the walker**

Run: `node engine/verify-reader-features.mjs 2>&1 | tail -30`
The walker serves `site/` itself, so nothing needs copying into `public/`.
Expected: `ALL FEATURE CHECKS PASSED.` with the eight new PASS lines among
them.

- [ ] **Step 9: Commit**

```bash
git add site/page-feedback.js site/overview.html site/about.html site/mcp.html \
        site/spec-reader/index.html tests/test_page_feedback_bubble.py \
        engine/reader-routes.mjs engine/verify-reader-features.mjs
git commit -m "feat: a bubble on every public page takes a sentence

The pill, the dialog and the send, with no camera yet. One file for four
pages, like dev-tag.js and brand.js, because a copy per page drifts the
first time one of them is edited. The walker drives it and reads back
what the route was actually sent.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The camera

**Files:**
- Create: `site/vendor/html2canvas.min.js`
- Modify: `package.json` (the library as a devDependency, recording the version)
- Modify: `site/page-feedback.js`
- Modify: `tests/test_page_feedback_bubble.py`
- Modify: `engine/verify-reader-features.mjs`

**Interfaces:**
- Consumes: `#pf-note` and the dialog parts from Task 6.
- Produces: in `site/page-feedback.js`, `capture() -> HTMLCanvasElement | null`,
  `compose(base, shapes) -> Blob | null` and a `state` object
  `{ base, shapes }`. The form gains `capture_method` and `screenshot` parts
  when `state.base` is set. New DOM ids: `#pf-shot`, `#pf-drop`.

- [ ] **Step 1: Vendor the library**

```bash
pnpm add -D html2canvas@1.4.1
mkdir -p site/vendor
cp node_modules/html2canvas/dist/html2canvas.min.js site/vendor/html2canvas.min.js
```

The devDependency is there to record the version and make the next update one
command. Nothing imports it: `site/` has no bundler, so the copy in
`site/vendor/` is what is served.

Verify: `ls -l site/vendor/html2canvas.min.js`
Expected: about 195 KB.

- [ ] **Step 2: Write a note beside the vendored file**

Create `site/vendor/README.md`:

```markdown
# Vendored, not bundled

`site/` is copied into `public/` by `cp -R` and served as files. There is no
bundler, so a library used by `page-feedback.js` has to be a file here.

`html2canvas.min.js` is html2canvas 1.4.1, MIT, copied from
`node_modules/html2canvas/dist/`. The devDependency in `package.json` records
the version; updating is `pnpm up html2canvas` and the same copy again.

It is loaded by a script tag the first time somebody presses the feedback pill,
so the four public pages carry no cost until then.

Why this library and not a newer one: it does not render through an SVG
`foreignObject`. It walks the DOM and draws text with `fillText`, using the
fonts already loaded in the document, so the three Google fonts these pages
carry need no inlining. That is the failure mode that makes the `foreignObject`
libraries unusable here.
```

- [ ] **Step 3: Add the capture to the module**

In `site/page-feedback.js`, add these constants below `REMEMBER`:

```js
const LIBRARY = "/vendor/html2canvas.min.js";

/* What the image may weigh before it is halved and re-encoded. The route
 * refuses more, and a page of flat colour and sharp text rarely reaches it. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/* What the capture is filed as. Stored on the row so that a later method is
 * distinguishable in the record rather than silently replacing this one. */
const METHOD = "html2canvas";
```

Add these rules to `STYLE`, before the reduced-motion block:

```css
.pf-shot {
  position: relative;
  margin: 0 0 8px;
  border: 1px solid #5C6B3C;
  background: #F1EFE3;
}
.pf-shot img { display: block; width: 100%; height: auto; }
.pf-waiting { margin: 0; padding: 24px 16px; color: #5C6B3C; }
.pf-drop {
  padding: 4px 12px;
  border: 1px solid #5C6B3C;
  border-radius: 999px;
  background: transparent;
  color: #23281B;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.pf-drop:hover { background: #B7C94B; }
.pf-drop:focus-visible { outline: 2px solid #B7C94B; outline-offset: 2px; }
```

Add the capture, above `send`:

```js
/* What the dialog is holding: the photograph, the marks drawn on it, and
 * whether the sender said they did not want the photograph after all. Reset
 * every time the pill is pressed. */
const state = { base: null, shapes: [], dropped: false };

let library = null;

/** Load html2canvas once, on the first press, and never on page load. */
function loadLibrary() {
  if (library) return library;
  library = new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = LIBRARY;
    tag.addEventListener("load", () => resolve(window.html2canvas));
    tag.addEventListener("error", () => reject(new Error("the library did not load")));
    document.head.append(tag);
  });
  return library;
}

/* Where a sticky element really is, written onto it so the clone can be told.
 * html2canvas draws a sticky element at its STATIC position, so a reader who
 * has scrolled would otherwise send a capture with the header they were looking
 * at missing from the top and floating somewhere up the page. All four pages
 * use sticky: the header on each, the contents rail on two, a table header on
 * the overview. */
function tagSticky() {
  const tagged = [];
  for (const node of document.querySelectorAll("body *")) {
    if (getComputedStyle(node).position !== "sticky") continue;
    const box = node.getBoundingClientRect();
    node.dataset.pfSticky = JSON.stringify({
      top: box.top + window.scrollY,
      left: box.left + window.scrollX,
      width: box.width,
    });
    tagged.push(node);
  }
  return tagged;
}

/* Pin them in the clone. Matched by attribute rather than by walking the two
 * trees in parallel, because nothing guarantees the clone is node for node
 * identical to the document it came from. */
function pinSticky(clone) {
  for (const node of clone.querySelectorAll("[data-pf-sticky]")) {
    let at;
    try {
      at = JSON.parse(node.dataset.pfSticky);
    } catch {
      continue;
    }
    node.style.position = "absolute";
    node.style.top = `${at.top}px`;
    node.style.left = `${at.left}px`;
    node.style.width = `${at.width}px`;
    node.style.margin = "0";
  }
}

/**
 * Photograph the visible viewport.
 *
 * The viewport and not the whole document: that is what a screenshot of the
 * page means to the person pressing the button, and the reader scrolled out to
 * its full height is twenty thousand pixels nobody asked for.
 *
 * `ignoreElements` keeps our own pill and dialog out of the picture, which is
 * what lets the dialog be open while this runs. Without it the capture would
 * have to happen before anything appeared on screen, and a second of nothing
 * after a click reads as a broken button.
 */
async function capture(mine) {
  const html2canvas = await loadLibrary();
  const tagged = tagSticky();
  try {
    return await html2canvas(document.body, {
      x: window.scrollX,
      y: window.scrollY,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      scale: Math.min(2, window.devicePixelRatio || 1),
      logging: false,
      useCORS: true,
      ignoreElements: node => mine.includes(node),
      onclone: clone => pinSticky(clone),
    });
  } finally {
    for (const node of tagged) delete node.dataset.pfSticky;
  }
}

function blobOf(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

/**
 * The photograph and the marks, as one PNG.
 *
 * PNG rather than JPEG because these pages are flat areas of four colours and
 * sharp text, which is what PNG compresses well and JPEG smears. One retry at
 * half the linear size if the first encoding is over the cap, and no more: a
 * loop here would be a page that never sends.
 */
async function compose(base, shapes) {
  const out = document.createElement("canvas");
  out.width = base.width;
  out.height = base.height;
  const ink = out.getContext("2d");
  ink.drawImage(base, 0, 0);
  for (const shape of shapes) draw(ink, shape);

  let blob = await blobOf(out);
  if (blob && blob.size > MAX_IMAGE_BYTES) {
    const small = document.createElement("canvas");
    small.width = Math.round(out.width / 2);
    small.height = Math.round(out.height / 2);
    small.getContext("2d").drawImage(out, 0, 0, small.width, small.height);
    blob = await blobOf(small);
  }
  return blob;
}

/* Filled in by the editor. Until it exists, a capture carries no marks. */
function draw() {}
```

- [ ] **Step 4: Put the picture in the dialog and in the form**

In `build()`, create the shot area and the drop button before the comment
field, and insert them at the head of the dialog:

```js
  const waiting = el("p", { className: "pf-waiting",
                            textContent: "Photographing the page." });
  const shot = el("div", { className: "pf-shot", id: "pf-shot" }, waiting);
  const drop = el("button", {
    type: "button", className: "pf-drop", id: "pf-drop",
    textContent: "Drop the screenshot",
  });
  drop.hidden = true;
  const shotRow = el("div", { className: "pf-row" }, drop);
```

Pass `shot`, `waiting` and `drop` into the dialog's children, first, before the
`h2`'s following field:

```js
  const note = el("dialog", { className: "pf-note", id: "pf-note" },
    el("h2", { textContent: "Tell us what you see" }),
    shot,
    shotRow,
    el("div", { className: "pf-field" },
    /* ... unchanged from here ... */
```

Give the drop button its behaviour, beside the cancel handler:

```js
  drop.addEventListener("click", () => {
    state.base = null;
    state.shapes = [];
    state.dropped = true;
    shot.replaceChildren(el("p", { className: "pf-waiting",
                                   textContent: "No screenshot will be sent." }));
    drop.hidden = true;
  });
```

Replace the pill's click handler with one that opens first and photographs
second:

```js
  // Which opening this is. The camera takes a second or two, and in that time
  // the sender can drop the screenshot or close the dialog; comparing the token
  // after the await is how a late picture knows it is no longer wanted.
  let opening = 0;

  pill.addEventListener("click", async () => {
    const mine = ++opening;
    say(said, "", false);
    state.base = null;
    state.shapes = [];
    state.dropped = false;
    drop.hidden = true;
    shot.replaceChildren(el("p", { className: "pf-waiting",
                                   textContent: "Photographing the page." }));
    ready();
    note.showModal();
    comment.focus();
    try {
      const canvas = await capture([pill, note]);
      // Dropped, closed, or opened again while the camera was working.
      if (mine !== opening || !note.open || state.dropped) return;
      state.base = canvas;
      const picture = el("img", { alt: "This page, as it was when you pressed the button" });
      picture.src = canvas.toDataURL("image/png");
      shot.replaceChildren(picture);
      drop.hidden = false;
    } catch {
      if (mine !== opening) return;
      shot.replaceChildren(el("p", { className: "pf-waiting", textContent:
        "The screenshot could not be taken. You can still send your words." }));
    }
  });
```

The privacy line was written when there was no picture to promise anything
about. Change it, in the email field's `pf-why` paragraph, to the sentence the
design fixed:

```js
      el("p", { className: "pf-why", textContent:
        "Your note, your address and this screenshot stay private. We use your "
        + "address only to write back." })),
```

In `send`, attach the picture after the honeypot line:

```js
  if (state.base) {
    const picture = await compose(state.base, state.shapes);
    if (picture) {
      form.set("capture_method", METHOD);
      form.set("screenshot", picture, "page.png");
    }
  }
```

- [ ] **Step 5: Check it parses**

Run: `node --check site/page-feedback.js`
Expected: no output, exit 0.

- [ ] **Step 6: Extend the Python test**

Add to `tests/test_page_feedback_bubble.py`:

```python
    def test_the_capture_library_is_vendored(self):
        """The module fetches it by path at runtime. A missing file is a pill
        that opens a dialog saying the screenshot could not be taken."""
        library = ROOT / "site" / "vendor" / "html2canvas.min.js"
        self.assertTrue(library.exists(), "site/vendor/html2canvas.min.js is missing")
        self.assertGreater(library.stat().st_size, 100_000)
        self.assertIn('const LIBRARY = "/vendor/html2canvas.min.js";',
                      MODULE.read_text(encoding="utf-8"))

    def test_sticky_elements_are_pinned_before_the_clone_is_painted(self):
        """html2canvas draws a sticky element at its static position, so a
        reader who has scrolled would send a capture missing the header they
        were looking at. All four pages use sticky."""
        source = MODULE.read_text(encoding="utf-8")
        self.assertIn("function tagSticky()", source)
        self.assertIn("onclone: clone => pinSticky(clone)", source)
```

Run: `python3 -m unittest discover -s tests -v 2>&1 | tail -20`
Expected: every test passes.

- [ ] **Step 7: Add the walker checks**

In the feedback bubble section of `engine/verify-reader-features.mjs`, add this
helper above the section, beside the other top-level helpers:

```js
/* A PNG's dimensions, read out of its IHDR chunk: width and height are two
 * big-endian 32-bit integers at bytes 16 and 20. No dependency for four bytes
 * each. */
function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
```

Then, inside the section, replace the send block with one that waits for the
picture and asserts it:

```js
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

  check(sent?.comment === "The governance table runs off the right."
      && sent?.email === "reader@example.org"
      && sent?.page_url.endsWith("/overview.html")
      && /^\d+x\d+ @\d/.test(sent.viewport)
      && sent.user_agent.length > 0
      && sent.website === "",
    "the send posts the words, the address, the page, the window and the browser string",
    JSON.stringify({ ...sent, screenshot: true }));
```

The viewport is pinned to 1200 by 800 so the capture has a known shape, and
the assertion compares the PNG with `document.documentElement.clientWidth` and
`clientHeight` rather than with those two numbers: a classic scrollbar takes its
own width out of the client area, and the capture is cropped to the client area.
Chrome's `devicePixelRatio` is 1 headless, so `scale` is 1 and the PNG is the
viewport pixel for pixel.

And add a check that dropping the picture sends the words alone:

```js
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
```

- [ ] **Step 8: Run the walker**

Run: `node engine/verify-reader-features.mjs 2>&1 | tail -30`
Expected: `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 9: Look at the sticky fix with your own eyes**

This is the part no test covers, and the one the design says to check by hand.

Run `pnpm dev`. For each of `http://127.0.0.1:3000/overview`,
`/about`, `/mcp` and `/spec-reader/`: scroll to the middle of the page, press
the pill, and compare the capture in the dialog with the screen behind it.

Expected, on each: the sticky header appears at the top of the capture where it
is on screen, not floating in the middle or missing. On `/about` and `/mcp`,
the contents rail is beside the prose. On `/overview?view=governance`, the
table's header row is where it is on screen.

If a header lands in the wrong place, the fault is in `tagSticky` or
`pinSticky`, not in html2canvas: log what `tagSticky` measured and compare it
with `getBoundingClientRect` in the console.

- [ ] **Step 10: Commit**

```bash
git add site/vendor package.json pnpm-lock.yaml site/page-feedback.js \
        tests/test_page_feedback_bubble.py engine/verify-reader-features.mjs
git commit -m "feat: the bubble photographs the viewport it sits in

html2canvas 1.4.1, vendored because site/ has no bundler, loaded by a
script tag on the first press so the four pages carry no cost until
somebody wants to say something. Sticky elements are measured on the
live page and pinned in the clone: html2canvas draws them at their
static position, which would send a capture missing the header the
reader was looking at.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The editor

**Files:**
- Modify: `site/page-feedback.js`
- Modify: `engine/verify-reader-features.mjs`

**Interfaces:**
- Consumes: `state.base`, `state.shapes` and the `draw` stub from Task 7.
- Produces: `draw(ink, shape)` implemented; a shape is
  `{ tool: "box" | "arrow" | "pen", colour: string, width: number,
     from?: {x, y}, to?: {x, y}, points?: [{x, y}] }` in image coordinates.
  New DOM ids: `#pf-tools`, `#pf-tool-box`, `#pf-tool-arrow`, `#pf-tool-pen`,
  `#pf-colour-fail`, `#pf-colour-energy`, `#pf-undo`, `#pf-clear`, `#pf-marks`.

- [ ] **Step 1: Add the editor's styles**

In `STYLE`, add before the reduced-motion block:

```css
.pf-shot canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
}
.pf-tool, .pf-swatch {
  padding: 4px 12px;
  border: 1px solid #5C6B3C;
  border-radius: 999px;
  background: transparent;
  color: #23281B;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.pf-tool[aria-pressed="true"] { background: #333D22; color: #F1EFE3; border-color: #333D22; }
.pf-tool:hover, .pf-swatch:hover { background: #B7C94B; color: #23281B; }
.pf-tool:focus-visible, .pf-swatch:focus-visible {
  outline: 2px solid #B7C94B;
  outline-offset: 2px;
}
.pf-swatch { width: 28px; padding: 4px 0; }
.pf-swatch[aria-pressed="true"] { border-width: 3px; }
```

- [ ] **Step 2: Implement draw**

Replace the `function draw() {}` stub with:

```js
/* Three CSS pixels, scaled by the ratio between the image's natural width and
 * the width it is shown at, so a mark looks the same whatever the capture scale
 * and whatever the screen. */
const STROKE = 3;

/* Rust by default, the framework's only warm colour and the one it reserves for
 * failure, which is what an annotation on a bug report is. Chartreuse second,
 * for marks that land on an olive-deep band where rust cannot be read. */
const COLOURS = [["fail", "#A0522D"], ["energy", "#B7C94B"]];

function draw(ink, shape) {
  ink.strokeStyle = shape.colour;
  ink.lineWidth = shape.width;
  ink.lineCap = "round";
  ink.lineJoin = "round";

  if (shape.tool === "box") {
    ink.strokeRect(shape.from.x, shape.from.y,
                   shape.to.x - shape.from.x, shape.to.y - shape.from.y);
    return;
  }

  if (shape.tool === "pen") {
    ink.beginPath();
    shape.points.forEach((point, i) => (i ? ink.lineTo(point.x, point.y)
                                          : ink.moveTo(point.x, point.y)));
    ink.stroke();
    return;
  }

  // An arrow rather than a bare line, because what somebody wants to do with a
  // line is point at something.
  const { from, to } = shape;
  ink.beginPath();
  ink.moveTo(from.x, from.y);
  ink.lineTo(to.x, to.y);
  ink.stroke();
  const along = Math.atan2(to.y - from.y, to.x - from.x);
  const head = Math.min(6 * shape.width,
                        Math.hypot(to.x - from.x, to.y - from.y) / 3);
  for (const turn of [Math.PI / 6, -Math.PI / 6]) {
    ink.beginPath();
    ink.moveTo(to.x, to.y);
    ink.lineTo(to.x - head * Math.cos(along - turn),
               to.y - head * Math.sin(along - turn));
    ink.stroke();
  }
}
```

- [ ] **Step 3: Add the overlay and its pointer handling**

Add above `build()`:

```js
/* Where a pointer is, in the image's own coordinates. The overlay is stretched
 * by CSS to the width the picture is shown at, so every event has to be scaled
 * back or a mark would land somewhere else on the PNG than it did on screen. */
function at(event, canvas) {
  const box = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - box.left) * (canvas.width / box.width),
    y: (event.clientY - box.top) * (canvas.height / box.height),
  };
}

/** Repaint every committed mark, and the one being drawn. */
function repaint(canvas, drawing) {
  const ink = canvas.getContext("2d");
  ink.clearRect(0, 0, canvas.width, canvas.height);
  for (const shape of state.shapes) draw(ink, shape);
  if (drawing) draw(ink, drawing);
}

/**
 * The overlay, sized to the photograph and stretched over it.
 *
 * Marks are held as shapes rather than as pixels, which is what makes undo one
 * line: drop the last entry and repaint. Pointer Events throughout, so mouse,
 * stylus and finger take one path.
 */
function overlay(base, tools) {
  const canvas = el("canvas", { id: "pf-marks" });
  canvas.width = base.width;
  canvas.height = base.height;

  let drawing = null;

  canvas.addEventListener("pointerdown", event => {
    event.preventDefault();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Throws for a pointer id that is not an active pointer, which is every
      // synthetic event. Capture is a convenience, not the mechanism.
    }
    const start = at(event, canvas);
    const box = canvas.getBoundingClientRect();
    const width = STROKE * (canvas.width / box.width);
    drawing = tools.tool === "pen"
      ? { tool: "pen", colour: tools.colour, width, points: [start] }
      : { tool: tools.tool, colour: tools.colour, width, from: start, to: start };
    repaint(canvas, drawing);
  });

  canvas.addEventListener("pointermove", event => {
    if (!drawing) return;
    const now = at(event, canvas);
    if (drawing.tool === "pen") drawing.points.push(now);
    else drawing.to = now;
    repaint(canvas, drawing);
  });

  const finish = () => {
    if (!drawing) return;
    // A tap that never moved is not a mark: it would store a zero-length arrow
    // or an empty box that nobody can see and nobody can undo on purpose.
    const moved = drawing.tool === "pen"
      ? drawing.points.length > 1
      : Math.hypot(drawing.to.x - drawing.from.x, drawing.to.y - drawing.from.y) > 2;
    if (moved) state.shapes.push(drawing);
    drawing = null;
    repaint(canvas, null);
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);

  return canvas;
}
```

- [ ] **Step 4: Build the toolbar**

In `build()`, before the dialog is assembled, add:

```js
  const tools = { tool: "box", colour: COLOURS[0][1] };

  const toolButton = (name, label) => {
    const button = el("button", {
      type: "button", className: "pf-tool", id: `pf-tool-${name}`, textContent: label,
    });
    button.setAttribute("aria-pressed", String(tools.tool === name));
    button.addEventListener("click", () => {
      tools.tool = name;
      for (const other of toolbar.querySelectorAll(".pf-tool")) {
        other.setAttribute("aria-pressed", String(other === button));
      }
    });
    return button;
  };

  const swatch = ([name, value]) => {
    const button = el("button", {
      type: "button", className: "pf-swatch", id: `pf-colour-${name}`, textContent: " ",
    });
    button.style.background = value;
    button.setAttribute("aria-label", name === "fail" ? "Rust" : "Chartreuse");
    button.setAttribute("aria-pressed", String(tools.colour === value));
    button.addEventListener("click", () => {
      tools.colour = value;
      for (const other of toolbar.querySelectorAll(".pf-swatch")) {
        other.setAttribute("aria-pressed", String(other === button));
      }
    });
    return button;
  };

  const undo = el("button", {
    type: "button", className: "pf-tool", id: "pf-undo", textContent: "Undo",
  });
  const clear = el("button", {
    type: "button", className: "pf-tool", id: "pf-clear", textContent: "Clear",
  });
  const toolbar = el("div", { className: "pf-row", id: "pf-tools" },
    toolButton("box", "Box"), toolButton("arrow", "Arrow"), toolButton("pen", "Pen"),
    swatch(COLOURS[0]), swatch(COLOURS[1]), undo, clear);
  toolbar.hidden = true;

  undo.addEventListener("click", () => {
    state.shapes.pop();
    const canvas = shot.querySelector("canvas");
    if (canvas) repaint(canvas, null);
  });
  clear.addEventListener("click", () => {
    state.shapes = [];
    const canvas = shot.querySelector("canvas");
    if (canvas) repaint(canvas, null);
  });
```

Insert `toolbar` into the dialog immediately before `shot`:

```js
  const note = el("dialog", { className: "pf-note", id: "pf-note" },
    el("h2", { textContent: "Tell us what you see" }),
    toolbar,
    shot,
    shotRow,
```

In the pill's handler, show the toolbar and add the overlay when the picture
arrives, and hide the toolbar when it is dropped:

```js
      shot.replaceChildren(picture, overlay(canvas, tools));
      toolbar.hidden = false;
      drop.hidden = false;
```

```js
  drop.addEventListener("click", () => {
    state.base = null;
    state.shapes = [];
    shot.replaceChildren(el("p", { className: "pf-waiting",
                                   textContent: "No screenshot will be sent." }));
    toolbar.hidden = true;
    drop.hidden = true;
  });
```

and hide it again at the head of the handler, beside the other resets:

```js
    toolbar.hidden = true;
```

- [ ] **Step 5: Check it parses**

Run: `node --check site/page-feedback.js`
Expected: no output, exit 0.

- [ ] **Step 6: Add the walker checks**

Insert into the bubble section of `engine/verify-reader-features.mjs`, after
the capture appears and before the send:

```js
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

  const afterUndo = await page.evaluate(() => {
    document.querySelector("#pf-undo").click();
    const canvas = document.querySelector("#pf-marks");
    const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
    return painted;
  });
  check(afterUndo === 0, "undo takes the last mark off the overlay", String(afterUndo));

  const tooling = await page.evaluate(() => {
    document.querySelector("#pf-tool-arrow").click();
    return {
      arrow: document.querySelector("#pf-tool-arrow").getAttribute("aria-pressed"),
      box: document.querySelector("#pf-tool-box").getAttribute("aria-pressed"),
    };
  });
  check(tooling.arrow === "true" && tooling.box === "false",
    "choosing a tool unpresses the one before it", JSON.stringify(tooling));

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
```

Then, after the send that carries the picture, add:

```js
  /* The mark is in the bytes, not only on the overlay. Rust is #A0522D, and no
   * page of this site paints that colour anywhere, so finding it in the PNG is
   * finding the annotation. Read out of the decoded image rather than the file,
   * since a PNG's pixels are compressed. */
  const marked = await page.evaluate(async encoded => {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
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
  }, sent.screenshot.png.toString("base64"));
  check(marked > 100, "the box drawn on the overlay is in the PNG that was sent",
    `rust pixels: ${marked}`);
```

- [ ] **Step 7: Run the walker**

Run: `node engine/verify-reader-features.mjs 2>&1 | tail -40`
Expected: `ALL FEATURE CHECKS PASSED.`

- [ ] **Step 8: Draw on it yourself**

Run `pnpm dev`, open `http://127.0.0.1:3000/overview`, press the pill, and draw
one of each: a box, an arrow, a freehand line. Switch to chartreuse and draw on
a dark band. Press undo three times and clear once.

Expected: each mark lands under the pointer, the arrow's head is at the end you
released, chartreuse reads on the olive-deep band, undo removes one mark at a
time, clear removes all of them.

On a phone-width window (400px), the same by touch: the marks land under the
finger and the page behind does not scroll while drawing.

- [ ] **Step 9: Commit**

```bash
git add site/page-feedback.js engine/verify-reader-features.mjs
git commit -m "feat: a box, an arrow and a pen on the capture

Marks are shapes in image coordinates rather than pixels, which is what
makes undo one line and what keeps a mark under the pointer whatever the
picture is scaled to. An arrow rather than a bare line, because what
somebody wants to do with a line is point at something.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The record, and one real send

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-20-feedback-on-a-page-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code depends on.

- [ ] **Step 1: Correct the one figure the implementation moved**

The design fixed `page_url` at 500 characters. The reader's addresses carry a
document, a publication and a list of behaviours at once and reach past that,
and a truncated URL hands an operator a link that goes somewhere else. Task 2
set it to 2000. In
`docs/superpowers/specs/2026-09-20-feedback-on-a-page-design.md`, find the line

```
Field caps: comment 5000, address 200, `page_url` 500, `user_agent` 500,
```

and replace 500 with 2000, adding the reason:

```
Field caps: comment 5000, address 200, `page_url` 2000, `user_agent` 500,
`viewport` 50, `capture_method` 40. `page_url` is the large one on purpose: the
reader's address carries a document, a publication and a list of behaviours at
once, and a truncated URL hands an operator a link that goes somewhere else.
```

- [ ] **Step 2: One real send, end to end**

With the migration applied and `.env` carrying the real credentials, run
`pnpm dev`, open `http://127.0.0.1:3000/overview`, press the pill, draw a box,
write a sentence, send.

Then check all three destinations:

```bash
node --env-file=.env --input-type=module -e '
const u = process.env.SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: k, Authorization: `Bearer ${k}` };
const rows = await (await fetch(`${u}/rest/v1/aci_page_feedback?select=*&order=created_at.desc&limit=1`, { headers: h })).json();
console.log(JSON.stringify(rows[0], null, 1));
'
```
Expected: one row carrying the comment, the address, `capture_method`
`html2canvas`, a `screenshot` path of the form `YYYY-MM-DD/<uuid>.png`, and the
page URL.

Then open `http://127.0.0.1:3000/admin/page-feedback` and confirm the thumbnail
renders and opens full size.

Then look at the Slack channel. Expected: one message headed `Feedback on a
page`, carrying the sentence, the page address, the picture with the box drawn
on it, and a link to the portal.

If the picture is missing from Slack but the message arrived, the retry fired:
the platform log will carry `page-feedback: slack refused the image block`.
Record what Slack said in the CLAUDE.md entry rather than working round it.

- [ ] **Step 3: Write the divergence record**

Add to `CLAUDE.md`, under `## Changes of substance we made`, after `A reader
can leave a note on a paragraph, or on a document`:

```markdown
### A reader can photograph the page and draw on it

The index took two kinds of words from outside and not the third. A proposal
asks us to run something; a note disagrees with a panel's reading of one
paragraph. Neither takes "this page is broken", which is mostly a picture: a
sentence describing a layout fault is a sentence somebody has to reconstruct
into a screen, and half the time they reconstruct a different one.

A pill at the bottom right of the four public pages photographs the viewport,
takes a box, an arrow or a freehand line over it, a sentence and an address, and
files all of it in `aci_page_feedback` and a private bucket, with a Slack
message carrying the picture. `site/page-feedback.js` is one file for four
pages, like `dev-tag.js` and `brand.js`, for the reason that file already
records: copied four times it drifts the first time one copy is edited.

Private throughout, and that is the difference from `aci_feedback` rather than a
detail. A note about a paragraph records what a reader permits, because it might
one day be shown beside that paragraph. A capture of somebody's browser never
will be, so there is nothing to ask and nothing to record: the form says it
stays private and the table has no visibility column.

**The capture is html2canvas, and it is a redrawing rather than a photograph.**
The library walks the DOM and paints it, so what it produces is the page as the
styles describe it and not the pixels the screen had. It was chosen over
`getDisplayMedia`, which is exact, because that API does not exist on mobile at
all and asks permission on every send. It was chosen over the `foreignObject`
libraries because it draws text with `fillText` using the fonts already loaded,
where they need every font file inlined or the capture comes back in a fallback
face. `capture_method` is stored on every row so a later method is
distinguishable in the record rather than silently replacing this one, which
matters because html2canvas has had no release since 2022.

**The sticky fix, and what it says about the rest.** html2canvas draws a
`position: sticky` element at its static position, and all four pages use
sticky: the header on each, the contents rail on two, a table header on the
overview. A reader who had scrolled would have sent a capture with the header
they were looking at missing from the top. Every sticky element is measured on
the live page into a `data-pf-sticky` attribute and pinned absolutely in the
clone `onclone` hands over, matched by attribute rather than by walking the two
trees in parallel, because nothing guarantees the clone is node for node
identical. What is not fixed, and is expected rather than verified: a dialog or
popover open at the moment of capture. The reader's notes are `position: fixed`
with their corner set inline, which the library does support, and their
`::backdrop` is not drawn at all.

**Slack is told twice when it has to be.** Slack fetches `image_url` itself and
refuses the whole message when one block displeases it, so a signed link it will
not accept would cost the notification entirely. The message goes out with the
image block and again without it if the first is refused. The link lives seven
days: after that the picture leaves the channel's history and the portal link,
which does not expire, is what is left. A permanent link would mean a public
bucket, and a capture of somebody's browser can hold anything they had on
screen.

Console logs are deliberately not collected, though the same author's other
feedback widget collects them. Doing it means patching `console` on every page
load for every reader, which is a change to what the four public pages do to
everybody in order to serve the few who report a bug.

The design is `docs/superpowers/specs/2026-09-20-feedback-on-a-page-design.md`;
the table and the bucket are `20260920120000_aci_page_feedback.sql` in
`polaris-supabase`.
```

- [ ] **Step 4: Run everything**

```bash
pnpm test:routes
python3 -m unittest discover -s tests
pnpm predev && node engine/verify-reader-features.mjs 2>&1 | tail -5
pnpm build
```
Expected: all four green.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-20-feedback-on-a-page-design.md
git commit -m "docs: the bubble is recorded, and page_url is 2000 not 500

The reader's addresses carry a document, a publication and a list of
behaviours at once, so the cap the design fixed would have truncated an
honest URL into one that goes somewhere else.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Words on the picture, a circle, and a way round the form

> Added on 20 September 2026, after the editor was working and the operator
> had used it. Four additions asked for in one breath: a text mark, a circle,
> a glyph on each tool so the toolbar reads at a glance, and a line offering
> the address of a person for anyone who would rather not use a form. Runs
> after Task 11, which is a defect, and before Task 9, so the record Task 9
> writes describes the editor as it ships.

**Files:**
- Modify: `site/page-feedback.js`
- Modify: `tests/test_page_feedback_bubble.py`
- Modify: `engine/verify-reader-features.mjs`

**Interfaces:**
- Consumes: `state.shapes`, `draw(ink, shape)`, `at(event, canvas)`,
  `repaint(canvas, drawing)`, `overlay(base, tools)`, `el`, `STROKE`,
  `COLOURS`, and the `toolButton`/`.pf-pick` toolbar from Task 8.
- Produces: two more shapes, `{ tool: "circle", colour, width, from, to }` and
  `{ tool: "text", colour, size, at: {x, y}, text }`, where `size` is in image
  pixels. New DOM ids: `#pf-tool-circle`, `#pf-tool-text`. New class:
  `.pf-typing`.

**On emoji.** The operator asked for "des petites emojis" on the tool buttons.
The Polaris framework forbids them in as many words ("Do not: icon libraries
and emoji"), and the repository already draws its own icons: the reader's copy
and locator icons are inline SVG on a 16 unit grid at 1.4 stroke in
`currentColor`. These glyphs are in that hand, which serves what was asked for
(a toolbar that reads at a glance) without breaking the rule the same person
wrote. The word stays beside the glyph: a glyph alone is a guess.

- [ ] **Step 1: Add the styles**

In `STYLE`, after the `.pf-swatch` rules and before the reduced-motion block:

```css
.pf-tool { display: inline-flex; align-items: center; gap: 6px; }
.pf-tool svg { flex: none; }
.pf-note .pf-why a {
  color: #23281B;
  text-decoration: underline 2px #B7C94B;
  text-underline-offset: 3px;
}
.pf-note .pf-why a:hover { background: #B7C94B; }
.pf-typing {
  position: absolute;
  z-index: 1;
  min-width: 140px;
  padding: 0 2px;
  border: 1px dashed #5C6B3C;
  border-radius: 2px;
  background: rgb(241 239 227 / .85);
  font-family: "Instrument Sans", system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.2;
}
.pf-typing:focus-visible { outline: 2px solid #B7C94B; outline-offset: 0; }
```

Dashed, because a box being typed into and a box that has been drawn should
not look alike.

- [ ] **Step 2: Add the constants**

Beside `STROKE` and `COLOURS`:

```js
/* Sixteen CSS pixels, scaled into the image the same way a stroke is, so what
 * the reader typed is the size they saw themselves type. */
const TEXT_SIZE = 16;

/* The tool glyphs, drawn here rather than fetched. The framework carries no
 * icon library and no emoji, and the reader's copy icons are already inline
 * SVG on a 16 unit grid at 1.4 stroke in currentColor; these are the same
 * hand. The word stays beside the glyph, because a glyph alone is a guess. */
const GLYPH = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"'
  + ' fill="none" stroke="currentColor" stroke-width="1.4"'
  + ' stroke-linecap="round" stroke-linejoin="round">';

const GLYPHS = {
  box: '<rect x="2.7" y="4.2" width="10.6" height="7.6" rx="1"/>',
  circle: '<circle cx="8" cy="8" r="5"/>',
  arrow: '<path d="M3.2 12.8 12.8 3.2M12.8 3.2H8.3M12.8 3.2v4.5"/>',
  pen: '<path d="M3 13l1-3.4 6.1-6.1 2.4 2.4-6.1 6.1z"/>',
  text: '<path d="M3.6 4.2h8.8M8 4.2v7.6"/>',
};
```

- [ ] **Step 3: Teach draw the circle and the words**

In `draw(ink, shape)`, immediately after the four `ink.` lines that set the
stroke and before the `if (shape.tool === "box")` branch:

```js
  if (shape.tool === "text") {
    ink.fillStyle = shape.colour;
    ink.textBaseline = "top";
    ink.font = `${shape.size}px "Instrument Sans", system-ui, sans-serif`;
    ink.fillText(shape.text, shape.at.x, shape.at.y);
    return;
  }

  // The ellipse inscribed in the drag, so a circle is drawn the way a box is
  // and needs nothing of its own in the pointer handling.
  if (shape.tool === "circle") {
    ink.beginPath();
    ink.ellipse((shape.from.x + shape.to.x) / 2, (shape.from.y + shape.to.y) / 2,
                Math.abs(shape.to.x - shape.from.x) / 2,
                Math.abs(shape.to.y - shape.from.y) / 2, 0, 0, Math.PI * 2);
    ink.stroke();
    return;
  }
```

- [ ] **Step 4: Write the field**

Above `overlay()`:

```js
/**
 * A field where the pointer landed, for a mark made of words.
 *
 * A real input rather than keystrokes collected by hand, so the caret, the
 * selection, backspace, paste and a phone's own keyboard all work without
 * being reimplemented. It commits on Enter or on losing focus, and an empty
 * one commits nothing, which is the rule a tap that never moved already obeys.
 *
 * The field is placed in display pixels and the shape is stored in image
 * pixels, because those are two different spaces and the picture is usually
 * shown smaller than it is. The field's font size is the one it will be drawn
 * at, so what the reader types is the size they get.
 */
function typeHere(canvas, tools, where, event) {
  const shot = canvas.parentElement;
  const box = canvas.getBoundingClientRect();
  const shown = box.width / canvas.width;

  const field = el("input", { type: "text", className: "pf-typing" });
  field.setAttribute("aria-label", "Text to place on the screenshot");
  field.style.left = `${event.clientX - box.left}px`;
  field.style.top = `${event.clientY - box.top}px`;
  field.style.color = tools.colour;

  // Enter removes the field, and removing a focused element fires blur, so
  // without this the words would be stored twice.
  let done = false;
  const finish = keep => {
    if (done) return;
    done = true;
    const words = field.value.trim();
    field.remove();
    if (!keep || !words) return;
    state.shapes.push({
      tool: "text",
      colour: tools.colour,
      size: TEXT_SIZE / shown,
      at: where,
      text: words,
    });
    repaint(canvas, null);
  };

  field.addEventListener("keydown", key => {
    if (key.key === "Enter") {
      key.preventDefault();
      finish(true);
    }
    if (key.key === "Escape") {
      key.preventDefault();
      finish(false);
    }
  });
  field.addEventListener("blur", () => finish(true));

  shot.append(field);
  field.focus();
}
```

- [ ] **Step 5: Send a text press to the field rather than to a drag**

In `overlay()`, at the head of the `pointerdown` handler, after
`event.preventDefault()` and before the pointer capture:

```js
    if (tools.tool === "text") {
      typeHere(canvas, tools, at(event, canvas), event);
      return;
    }
```

Nothing else in `overlay` changes. A circle takes the same `{ from, to }`
branch a box and an arrow already take, including the threshold that discards
a press that never moved.

- [ ] **Step 6: Give each tool its glyph**

In `toolButton`, after the button is created and before its `aria-pressed` is
set:

```js
    button.insertAdjacentHTML("afterbegin", `${GLYPH}${GLYPHS[name]}</svg>`);
```

A controlled literal from a constant in this file, never anything a reader
typed.

- [ ] **Step 7: Put the circle in the toolbar**

In `build()`, the toolbar's tool buttons become:

```js
    toolButton("box", "Box"), toolButton("circle", "Circle"),
    toolButton("arrow", "Arrow"), toolButton("pen", "Pen"),
    toolButton("text", "Text"),
```

- [ ] **Step 8: Offer a person instead of a form**

In `build()`, immediately after the "Sent with this" paragraph and before
`said`:

```js
    el("p", { className: "pf-why" },
      document.createTextNode("Or contact us at "),
      el("a", { href: "mailto:sam@polariscollective.org",
                textContent: "sam@polariscollective.org" }),
      document.createTextNode(".")),
```

Asked for by the operator, whose address it is. Worth knowing and not worth
arguing: an address on a public page is harvested, which is the reasoning this
repository already records for never publishing a reader's.

- [ ] **Step 9: Check it parses**

Run: `node --check site/page-feedback.js`
Expected: no output, exit 0.

- [ ] **Step 10: Add the Python tests**

In `tests/test_page_feedback_bubble.py`:

```python
    def test_words_can_be_placed_on_the_picture(self):
        """A box says where, a circle says which, an arrow says that one, a
        pen says roughly. None of them says what. A text mark is a shape like
        the others, so undo and clear need no special case and compose draws
        it into the PNG that is sent rather than only onto the overlay."""
        source = MODULE.read_text(encoding="utf-8")
        self.assertIn('toolButton("text", "Text")', source)
        self.assertIn('if (shape.tool === "text")', source)
        self.assertIn("ink.fillText(shape.text, shape.at.x, shape.at.y)", source)

    def test_the_toolbar_carries_five_tools_each_with_a_drawn_glyph(self):
        """The framework forbids icon libraries and emoji, and the repository
        draws its own icons: inline SVG on a 16 unit grid at 1.4 stroke in
        currentColor, the same hand as the reader's copy icons. The word stays
        beside the glyph, because a glyph alone is a guess."""
        source = MODULE.read_text(encoding="utf-8")
        for tool, label in [("box", "Box"), ("circle", "Circle"), ("arrow", "Arrow"),
                            ("pen", "Pen"), ("text", "Text")]:
            with self.subTest(tool=tool):
                self.assertIn(f'toolButton("{tool}", "{label}")', source)
                self.assertIn(f"{tool}: '<", source)
        self.assertIn('stroke-width="1.4"', source)

    def test_the_dialog_offers_a_person_as_well_as_a_form(self):
        """Somebody who would rather write a sentence to a human than fill in
        a form should not have to fill in the form."""
        self.assertIn("mailto:sam@polariscollective.org",
                      MODULE.read_text(encoding="utf-8"))
```

Run: `python3 -m unittest discover -s tests 2>&1 | tail -5`
Expected: every test passes.

- [ ] **Step 11: Add the walker checks**

In `engine/verify-reader-features.mjs`, in the feedback bubble section,
immediately after the `check(afterClear === 0, "clear removes what undo left", ...)`
call:

```js
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
```

The last block puts the box tool back and empties the overlay, because the
block below it draws the box whose rust pixels prove an annotation reaches the
sent PNG.

- [ ] **Step 12: Produce the image the controller will judge**

Regenerate the phone-width evidence beside the earlier ones in the scratchpad
at
`/private/tmp/claude-501/-Users-sverbo-Desktop-Codes-Polaris-ai-character-index/3abc866b-7c91-4c99-b3c1-0f1c66b51a1b/scratchpad/`,
never in the repository, as `editor-phone.png`: `/overview.html` at 400 by 800
with the dialog open, one circle drawn and one text mark placed, so the
controller can see whether a five-button toolbar still fits at phone width and
whether the field is usable there. Save a desktop one too, `editor-tools.png`,
at 1200 by 800, showing all five glyphs and one of each mark.

- [ ] **Step 13: Run everything**

```bash
node --check site/page-feedback.js
python3 -m unittest discover -s tests 2>&1 | tail -5
node engine/verify-reader-features.mjs
pnpm test:routes
```

The walker must end at `2 FAILURES`, being only `focus lands back on the
publisher just chosen` and `comparing, focus lands back on the right side's
publisher`.

- [ ] **Step 14: Commit**

```bash
git add site/page-feedback.js tests/test_page_feedback_bubble.py engine/verify-reader-features.mjs
git commit -m "feat: a circle, words on the picture, a glyph per tool, and a person to write to

A box says where and an arrow says which; neither says what, and writing
it in the comment box below costs the reader the job of saying where on
the picture they mean. The text mark is a real input rather than
keystrokes collected by hand, so the caret, paste and a phone keyboard
work without being reimplemented, and it is a shape like every other
tool so undo and clear need no special case. The circle is the ellipse
inscribed in the drag, which is the box's own pointer handling. The
glyphs are inline SVG in the hand the reader's copy icons already use,
because the framework carries no icon library and no emoji, and the word
stays beside the glyph."
```

### Task 11: What the capture misses

> Added on 20 September 2026, reported by the operator against the running
> build. Two faults, both in the same place, both invisible on the four prose
> pages and both obvious in the reader. Runs before Task 10 and Task 9,
> because it is a defect and they are additions.

**The two faults.**

The doc reader does not scroll the window. It scrolls its own document column,
so `window.scrollY` stays at zero however far down the reader has read, the
capture is cropped at the top of the page, and the scrollable element inside is
drawn from its own top. The reader sends a picture of a passage they were not
looking at.

And a pop-up open at the moment of capture does not appear in it. A showing
`<dialog>` and an open `[popover]` live in the top layer, which the cloned
document html2canvas renders has no notion of: in the clone they are ordinary
elements again, and a popover is back to `display: none`. The reader who wants
to report something about a note cannot photograph the note.

**Files:**
- Modify: `site/page-feedback.js`
- Modify: `tests/test_page_feedback_bubble.py`
- Modify: `engine/verify-reader-features.mjs`

**Interfaces:**
- Consumes: `capture(mine)`, `tagSticky`, `pinSticky` from Task 7.
- Produces: `tagScrolled()`, `rescroll(clone)`, `tagFloating(mine)`,
  `placeFloating(clone)`, and a `capture` whose `onclone` calls all four
  pinning functions. New attributes: `data-pf-scrolled`, `data-pf-floating`.

- [ ] **Step 1: Carry the inner scroll into the clone**

Beside `tagSticky` and `pinSticky` in `site/page-feedback.js`:

```js
/* How far a scrollable element inside the page has been scrolled.
 *
 * The prose pages scroll the window and the reader does not: it scrolls its
 * own document column, so window.scrollY stays at zero however far down
 * somebody has read. html2canvas crops the capture at the window's scroll and
 * draws each element from its own top, so without this the reader sends a
 * picture of a passage they were not looking at. */
function tagScrolled() {
  const scrolled = [];
  for (const node of document.querySelectorAll("body *")) {
    if (!node.scrollTop && !node.scrollLeft) continue;
    node.dataset.pfScrolled = JSON.stringify({
      top: node.scrollTop, left: node.scrollLeft,
    });
    scrolled.push(node);
  }
  return scrolled;
}

/* Put the clone's copies where their originals were scrolled to. The clone is
 * a live document in an iframe, so its elements really do scroll. */
function rescroll(clone) {
  for (const node of clone.querySelectorAll("[data-pf-scrolled]")) {
    let to;
    try {
      to = JSON.parse(node.dataset.pfScrolled);
    } catch {
      continue;
    }
    node.scrollTop = to.top;
    node.scrollLeft = to.left;
  }
}
```

**If setting `scrollTop` on the clone turns out not to move what html2canvas
draws,** the fallback is to shift the scroll container's contents instead: in
`rescroll`, wrap the element's children in the offset by setting
`node.style.transform = translate(-left px, -top px)` on its single element
child when it has exactly one, and report that you used the fallback. Do not
reach for the fallback until you have an image showing the first way failing.

- [ ] **Step 2: Carry an open pop-up into the clone**

Beside them:

```js
/* A dialog or a popover that is open right now.
 *
 * Both live in the top layer, which the cloned document has no notion of: in
 * the clone a dialog is an ordinary element again and a popover is back to
 * display: none. Measured here and forced back into place there, because a
 * reader who wants to report something about a note has to be able to
 * photograph the note.
 *
 * Fixed rather than relative, unlike a sticky element: a pop-up genuinely is
 * out of flow on the real page, so putting it out of flow in the clone is
 * what matches rather than what breaks. */
function tagFloating(mine) {
  const floating = [];
  for (const node of document.querySelectorAll("dialog[open], [popover]")) {
    if (mine.includes(node) || mine.some(ours => ours.contains(node))) continue;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) continue;   // a popover nobody has opened
    node.dataset.pfFloating = JSON.stringify({
      top: box.top, left: box.left, width: box.width, height: box.height,
    });
    floating.push(node);
  }
  return floating;
}

function placeFloating(clone) {
  for (const node of clone.querySelectorAll("[data-pf-floating]")) {
    let box;
    try {
      box = JSON.parse(node.dataset.pfFloating);
    } catch {
      continue;
    }
    node.style.display = "block";
    node.style.position = "fixed";
    node.style.margin = "0";
    node.style.top = `${box.top}px`;
    node.style.left = `${box.left}px`;
    node.style.width = `${box.width}px`;
    node.style.maxHeight = `${box.height}px`;
    // Above the page, below nothing: it was the top layer a moment ago.
    node.style.zIndex = "2147483646";
  }
}
```

- [ ] **Step 3: Call all four, and clean up all three attributes**

In `capture(mine)`, replace the tagging, the `onclone` and the `finally` with:

```js
async function capture(mine) {
  const html2canvas = await loadLibrary();
  const sticky = tagSticky();
  const scrolled = tagScrolled();
  const floating = tagFloating(mine);
  try {
    return await html2canvas(document.body, {
      x: window.scrollX,
      y: window.scrollY,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      scale: Math.min(2, window.devicePixelRatio || 1),
      logging: false,
      useCORS: true,
      ignoreElements: node => mine.includes(node),
      onclone: clone => {
        pinSticky(clone);
        rescroll(clone);
        placeFloating(clone);
      },
    });
  } finally {
    for (const node of sticky) delete node.dataset.pfSticky;
    for (const node of scrolled) delete node.dataset.pfScrolled;
    for (const node of floating) delete node.dataset.pfFloating;
  }
}
```

Keep the rest of the function, and the rest of the module, as it is.

- [ ] **Step 4: Check it parses**

Run: `node --check site/page-feedback.js`
Expected: no output, exit 0.

- [ ] **Step 5: Add the Python tests**

In `tests/test_page_feedback_bubble.py`:

```python
    def test_an_inner_scroll_is_carried_into_the_clone(self):
        """The prose pages scroll the window and the reader does not: it
        scrolls its own document column, so window.scrollY stays at zero
        however far down somebody has read. Without this the reader sends a
        picture of a passage they were not looking at."""
        source = MODULE.read_text(encoding="utf-8")
        self.assertIn("function tagScrolled()", source)
        self.assertIn("rescroll(clone)", source)

    def test_an_open_pop_up_is_carried_into_the_clone(self):
        """A showing dialog and an open popover live in the top layer, which
        the cloned document has no notion of. A reader who wants to report
        something about a note has to be able to photograph the note."""
        source = MODULE.read_text(encoding="utf-8")
        self.assertIn("function tagFloating(mine)", source)
        self.assertIn("placeFloating(clone)", source)
```

Run: `python3 -m unittest discover -s tests 2>&1 | tail -5`
Expected: every test passes.

- [ ] **Step 6: Prove the scroll fault is gone, in the walker**

In `engine/verify-reader-features.mjs`, after the feedback bubble section's
existing checks and before the section's final console-error check, add a block
that loads the reader, scrolls its document column well down, presses the pill,
and reads the capture back:

```js
  /* The reader scrolls its own column, not the window, so a capture cropped at
   * window.scrollY would show the top of the document however far down the
   * reader has read. What proves it is not the picture's size but its
   * content: the same region rendered twice should agree, so this compares a
   * band of the capture against the same band of Playwright's own screenshot
   * and asks whether they are mostly the same colour. */
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const scrolledBy = await page.evaluate(() => {
    const column = [...document.querySelectorAll("*")]
      .find(node => node.scrollHeight > node.clientHeight + 400
                 && getComputedStyle(node).overflowY !== "visible");
    if (!column) return 0;
    column.scrollTop = 800;
    return column.scrollTop;
  });
  check(scrolledBy > 0, "the reader has a column that scrolls inside the page",
    String(scrolledBy));

  await page.locator("#pf-pill").click();
  await page.waitForSelector("#pf-shot img", { timeout: 20000 });
  const agrees = await page.evaluate(async () => {
    const img = document.querySelector("#pf-shot img");
    const drawn = document.createElement("canvas");
    drawn.width = img.naturalWidth;
    drawn.height = img.naturalHeight;
    drawn.getContext("2d").drawImage(img, 0, 0);
    // The first non-blank row of the captured document area, as a fingerprint
    // of which part of the document was photographed.
    const { data } = drawn.getContext("2d")
      .getImageData(0, Math.round(drawn.height / 2), drawn.width, 1);
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) ink += 1;
    }
    return { width: drawn.width, height: drawn.height, ink };
  });
  check(agrees.ink > 20,
    "the capture of a scrolled reader carries text across its middle rather than blank paper",
    JSON.stringify(agrees));
```

This is a weak check by design: it proves the middle of the capture is not
blank, which is what a capture cropped at the wrong offset looks like on the
reader. The real verdict is the image in step 7.

- [ ] **Step 7: Produce the images the controller will judge**

Write or adapt a throwaway script in
`/private/tmp/claude-501/-Users-sverbo-Desktop-Codes-Polaris-ai-character-index/3abc866b-7c91-4c99-b3c1-0f1c66b51a1b/scratchpad/`,
never in the repository, saving four images at a 1200 by 800 viewport:

- `reader-scrolled-real.png` and `reader-scrolled-capture.png`: the doc reader
  with its document column scrolled well down, Playwright's own screenshot
  beside the bubble's capture.
- `popup-real.png` and `popup-capture.png`: the doc reader with one of its
  notes open (the behaviour note behind the `i` beside a behaviour, or the
  depth note behind a figure), the same pair.

List the paths in your report and say what you saw, but do not treat your own
answer as the verdict.

- [ ] **Step 8: Run everything**

```bash
node --check site/page-feedback.js
python3 -m unittest discover -s tests 2>&1 | tail -5
node engine/verify-reader-features.mjs
pnpm test:routes
```

The walker must end at `2 FAILURES`, being only `focus lands back on the
publisher just chosen` and `comparing, focus lands back on the right side's
publisher`.

- [ ] **Step 9: Commit**

```bash
git add site/page-feedback.js tests/test_page_feedback_bubble.py engine/verify-reader-features.mjs
git commit -m "fix: the capture follows the reader down its own column, and keeps the pop-up

The prose pages scroll the window and the reader does not: it scrolls
its own document column, so window.scrollY stayed at zero however far
down somebody had read and the capture came back showing the top of the
document. And a dialog or popover open at the moment of capture lives in
the top layer, which the cloned document has no notion of, so the reader
who wanted to report something about a note could not photograph the
note. Both are carried across in the same onclone hook the sticky fix
already uses, and a pop-up is pinned fixed rather than relative because
unlike a sticky element it genuinely is out of flow."
```
