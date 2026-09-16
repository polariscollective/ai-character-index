# Feedback on a paragraph: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reader can say what they think of any paragraph of any document, in a dialog opened from a third icon beside the two copy icons, and what they say lands in `aci_feedback` with the publication it was said about and one explicit decision about who may see it.

**Architecture:** The static reader posts JSON to `/api/feedback`, a public Next.js route holding the service key, exactly as `/api/submit` does for proposals: honeypot, per-source hourly cap, length caps, Slack after the row rather than before it. The rules and the writes live in `app/lib/feedback.mjs` so they can be tested against an injected `fetch`; `app/api/feedback/route.js` is a two-line shell. The reader's side is three additions to `site/spec-reader/`: one icon in the existing icon group, one `<dialog>`, and the code that fills it, sends it and remembers the reader's address.

**Tech Stack:** Next.js 15 App Router (JavaScript, no TypeScript), plain browser JavaScript for the reader (no framework, no build step), PostgREST through `app/lib/supabase.mjs`, `node --test` for the route libraries, a Node harness plus a Playwright walker for the reader, Supabase migrations in the separate `polaris-supabase` repository.

**Design:** `docs/superpowers/specs/2026-09-16-feedback-on-a-paragraph-design.md`

## Global Constraints

- **Everything written to disk is in English.** Code, comments, commit messages, test names, UI copy. The conversation that asked for this was in French; that changes nothing on disk.
- **Polaris design framework v1.1**, as written in `/Users/sverbo/Desktop/Codes/Polaris/CLAUDE.md`. For this work specifically: British spelling; sentence case everywhere including buttons and legends; no em-dashes in UI copy (commas, colons, full stops, parentheses); no icon libraries and no emoji, so every glyph is inline SVG; no cards, no shadows, no gradients; structure drawn with 1px `--line` rules and whitespace; inputs 1px `--line` border, 4px radius, focus ring `2px solid var(--energy)`; buttons are pills (999px radius), primary `--olive-deep` on `--paper` text, secondary 1px `--olive` border on transparent; errors are plain sentences saying what is wrong and how to fix it, never vague, never apologetic; interaction feedback is colour change at 150ms and nothing moves; `prefers-reduced-motion` disables what is not essential.
- **Reader colour tokens** are the ones already defined in `site/spec-reader/styles.css` per palette: `--paper`, `--reading`, `--ink`, `--muted`, `--faint`, `--line`, `--line-light`, `--accent`, `--energy`, `--mono`, `--display`, `--ui`. Never hardcode a hex in new reader CSS.
- **No new dependency.** `package.json` gains nothing. The route libraries import only from `node:*` and the existing `app/lib/*.mjs`.
- **The database is migrated from `polaris-supabase` only.** This repository never writes a migration.
- **Table and column names** are exactly as in Task 1 and are used verbatim everywhere after it.
- **Commit messages** end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XLRKTYAnoVBUKA7J89iD54
  ```

---

## File structure

| File | Responsibility |
|---|---|
| `polaris-supabase/evals/supabase/migrations/20260916140000_aci_feedback.sql` | the table, its constraints, its indexes, its grant |
| `app/lib/feedback.mjs` | what a submission must be, what it is recorded as, what Slack is told, and the whole of the route's behaviour as one testable function |
| `app/api/feedback/route.js` | the shell that gives that function the platform's `Request` |
| `app/lib/slack.mjs` | the webhook, and the escaping that stops a public form pinging the channel |
| `app/lib/submissions.mjs` | `recentFrom` counts in a named table; its Slack message goes through `slack.mjs` |
| `app/lib/admin-data.mjs` | `feedback()`, the portal's read |
| `app/admin/feedback/page.jsx` | the portal's page |
| `app/api/admin/feedback/route.js` | moving a row's status |
| `app/admin/layout.jsx` | one nav entry |
| `site/spec-reader/index.html` | the dialog's markup |
| `site/spec-reader/app.js` | the icon, the subject it is about, the body it sends, the browser's memory |
| `site/spec-reader/styles.css` | the icon's reveal, the dialog, the thumbs, the radio group |
| `engine/panel/test_appjs_feedback.js` | the pure functions of the reader's side, held to their output |
| `engine/panel/test_panel.py` | drives that harness from the Python suite |
| `engine/reader-routes.mjs` | answers `/api/feedback` for the browser walker |
| `engine/verify-reader-features.mjs` | the walker's checks for the icon and the dialog |
| `app/lib/__tests__/feedback.test.mjs` | every rule, every refusal, Slack's silence |

---

### Task 1: The table

**Files:**
- Create: `/Users/sverbo/Desktop/Codes/Polaris/polaris-supabase/evals/supabase/migrations/20260916140000_aci_feedback.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: the table `public.aci_feedback` with columns `id, created_at, publication_id, locator, document_id, behaviours, vote, comment, submitter, display_name, visibility, source_hash, status, notes`. Every later task uses these names verbatim.

This task happens in a **different repository**. Work on a branch there and open a PR; the application tasks that follow do not need the table to exist, because every test injects `fetch`.

- [ ] **Step 1: Branch the schema repository**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase
git checkout main && git pull
git checkout -b aci-feedback
```

- [ ] **Step 2: Write the migration**

Create `evals/supabase/migrations/20260916140000_aci_feedback.sql`:

```sql
-- ai-character-index: what a reader says about one paragraph.
--
-- Design: ai-character-index/docs/superpowers/specs/
--         2026-09-16-feedback-on-a-paragraph-design.md
--
-- The index says things about paragraphs, and every one of those things is a
-- panel's reading. This is where a reader disagrees, or agrees with one click.
-- Nothing here is displayed anywhere yet: what a reader permits is recorded now
-- so that the surface, when it exists, is built from consent that was given
-- rather than assumed afterwards.

create table aci_feedback (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  -- Which build of the index was on screen. A locator names the text, and it
  -- carries the document's version, so the text is pinned without this; what is
  -- not pinned is the reading laid over it, which is a publication's.
  --
  -- No foreign key, deliberately. A publication can be archived out of
  -- aci_publications and removed -- this happened on 16 September 2026 to the
  -- inherited publication and five drafts -- and a reader's words must survive
  -- the cleanup of the thing they were about.
  publication_id uuid,

  locator        text not null,
  -- The locator's head, which is the document id. Derivable, and stored because
  -- every question worth asking of this table is asked per document, and a
  -- split_part in each of them is a filter no index helps.
  document_id    text not null,
  -- The behaviours highlighting that paragraph for the reader who wrote this:
  -- of the behaviours ticked in the menu, the ones citing this paragraph.
  behaviours     text[] not null default '{}',

  -- Two words rather than 1 and -1. A thumb is not a quantity, and summing it is
  -- a decision nobody has made; two signed integers invite an average.
  vote           text check (vote in ('up', 'down')),
  comment        text not null default '',

  -- The address. Never shown on the site, at any visibility: what publication
  -- could ever show is display_name, which the reader types for the purpose.
  submitter      text not null,
  display_name   text not null default '',
  visibility     text not null default 'private'
                 check (visibility in ('private', 'anonymous', 'attributed')),

  -- A salted hash of the caller's address, never the address, for the same
  -- reason as aci_submissions: it exists to refuse the thirty-first submission
  -- in an hour from one place, and an address that could be read back would be
  -- a record of who read the site.
  source_hash    text not null,

  status         text not null default 'new'
                 check (status in ('new', 'read', 'actioned', 'declined')),
  notes          text not null default '',

  -- A thumb alone is a submission; nothing at all is not.
  constraint aci_feedback_says_something
    check (comment <> '' or vote is not null),
  -- A name is shown exactly when somebody asked to be named. The form carries
  -- the same rule, and this is what stops the two from ever disagreeing.
  constraint aci_feedback_named_when_attributed
    check ((visibility = 'attributed') = (display_name <> ''))
);

create index aci_feedback_recent on aci_feedback (created_at desc);
-- The rate-limit query: this source, this hour.
create index aci_feedback_by_source on aci_feedback (source_hash, created_at desc);
-- Everything said about one paragraph, and about one document.
create index aci_feedback_by_locator on aci_feedback (locator);
create index aci_feedback_by_document on aci_feedback (document_id, created_at desc);

-- Insert from the public route, select and update from the portal. No anon
-- grant: the route is public, the table is not.
grant select, insert, update on public.aci_feedback to service_role;
```

- [ ] **Step 3: Check the migration is the only pending one and see what it would do**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase/evals
supabase db push --dry-run
```

Expected: the output names `20260916140000_aci_feedback.sql` and nothing else. If it names other files, stop and report: an unapplied migration from someone else must not ride along with this one.

- [ ] **Step 4: Commit and open the PR**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase
git add evals/supabase/migrations/20260916140000_aci_feedback.sql
git commit -m "$(cat <<'EOF'
feat(aci): a reader can say what they think of a paragraph

aci_feedback holds a comment, a thumb, or both, the locator of the paragraph
and the publication that was on screen, and one explicit decision about who may
see it. The address is never public at any visibility; a typed display name
stands in its place, and a check constraint holds the name and the choice to
each other.

No foreign key on publication_id: a publication can be archived out of the
table, and a reader's words outlive it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLRKTYAnoVBUKA7J89iD54
EOF
)"
git push -u origin aci-feedback
gh pr create --title "aci_feedback: what a reader says about a paragraph" --body "$(cat <<'EOF'
The table behind the feedback dialog in the spec reader.

Design: `ai-character-index/docs/superpowers/specs/2026-09-16-feedback-on-a-paragraph-design.md`

A row is a comment, a thumb, or both, about one paragraph of one document, with
the publication that was on screen and one explicit decision about who may see
it: `private`, `anonymous` or `attributed`. Two check constraints carry the two
rules the form carries, so the form and the database cannot disagree: a
submission must say something, and a name is stored exactly when somebody asked
to be named.

`publication_id` has no foreign key on purpose. Publications get archived out of
`aci_publications` by the cleanup migrations, and feedback must survive that.

Granted to `service_role` only. The route that writes it is public; the table is
not.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XLRKTYAnoVBUKA7J89iD54
EOF
)"
```

- [ ] **Step 5: Push it once the PR is approved**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase/evals
supabase db push
```

Expected: `Applying migration 20260916140000_aci_feedback.sql...` then `Finished supabase db push.` Report the output rather than assuming it worked.

---

### Task 2: What the route refuses

**Files:**
- Create: `app/lib/feedback.mjs`
- Create: `app/lib/slack.mjs`
- Modify: `app/lib/submissions.mjs` (`recentFrom` takes a table; `forSlack` and the send move to `slack.mjs`)
- Create: `app/lib/__tests__/feedback.test.mjs`
- Modify: `app/lib/__tests__/submissions.test.mjs` (one test for the new argument)

**Interfaces:**
- Consumes: `sourceHash`, `callerAddress`, `recentFrom` from `./submissions.mjs`; `forSlack`, `postToSlack` from `./slack.mjs`.
- Produces:
  - `PER_HOUR = 30`, `MAX_REQUEST_BYTES = 65536`, `TABLE = "aci_feedback"`, `VISIBILITIES = ["private", "anonymous", "attributed"]`, `LIMITS`, `MAX_BEHAVIOURS = 20`
  - `normalise(sent) -> {locator, behaviours, vote, comment, email, visibility, display_name, publication, website}` (every string trimmed, `behaviours` an array of non-empty trimmed strings, `visibility` defaulted to `"private"`, `display_name` emptied unless the visibility is `attributed`, `vote` `"up"`/`"down"`/`null`)
  - `feedbackProblems(fields) -> string[]`
  - `documentOf(locator) -> string`
  - `recentFrom(hash, fetchImpl, table)` in `submissions.mjs`, the third argument defaulting to `"aci_submissions"`
  - `forSlack(value) -> string` and `postToSlack(title, blocks, fetchImpl) -> string|null` in `app/lib/slack.mjs`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/__tests__/feedback.test.mjs`:

```javascript
/**
 * The feedback route's library. The second door of this application open to the
 * internet that writes, so what it refuses is what these tests are about.
 * Run: node --test app/lib/__tests__/feedback.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIMITS, MAX_BEHAVIOURS, MAX_REQUEST_BYTES, PER_HOUR, VISIBILITIES,
  documentOf, feedbackProblems, normalise,
} from "../feedback.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

const GOOD = {
  locator: "openai--model-spec@2026-08-18 > #levels_of_authority > ¶2",
  comment: "This paragraph is about escalation, not authority.",
  email: "reader@example.org",
};

test("a submission that says nothing is not a submission", () => {
  assert.deepEqual(feedbackProblems(normalise({ ...GOOD, comment: "" })),
                   ["write a comment or leave a thumb"]);
  assert.deepEqual(feedbackProblems(normalise({ ...GOOD, comment: "", vote: "up" })), []);
  assert.deepEqual(feedbackProblems(normalise(GOOD)), []);
});

test("the address is required, because a reply needs somewhere to go", () => {
  const found = feedbackProblems(normalise({ ...GOOD, email: "" }));
  assert.deepEqual(found, ["your address is required, so we can write back"]);
});

test("an address that is not an address is refused before it is stored", () => {
  for (const wrong of ["reader", "reader@", "@example.org", "a b@example.org"]) {
    const found = feedbackProblems(normalise({ ...GOOD, email: wrong }));
    assert.deepEqual(found, ["your address does not look like an address"], wrong);
  }
});

test("a paragraph must be named: the dialog opens from one", () => {
  assert.deepEqual(feedbackProblems(normalise({ ...GOOD, locator: "" })),
                   ["a paragraph must be named"]);
});

test("a thumb is up or down and nothing else", () => {
  assert.deepEqual(feedbackProblems(normalise({ ...GOOD, vote: "sideways" })),
                   ["a thumb is either up or down"]);
});

test("being named needs a name, and the choice is not quietly overruled", () => {
  const found = feedbackProblems(normalise({ ...GOOD, visibility: "attributed" }));
  assert.deepEqual(found, ["the name to show is required, or choose to be shown without a name"]);
  assert.deepEqual(
    feedbackProblems(normalise({ ...GOOD, visibility: "attributed", display_name: "A reader" })),
    []);
});

test("a name typed and then not asked for is not stored", () => {
  const fields = normalise({ ...GOOD, visibility: "anonymous", display_name: "A reader" });
  assert.equal(fields.display_name, "", "anonymous means anonymous");
  assert.deepEqual(feedbackProblems(fields), []);
});

test("private is what an unstated visibility means", () => {
  assert.equal(normalise(GOOD).visibility, "private");
  assert.deepEqual(VISIBILITIES, ["private", "anonymous", "attributed"]);
  assert.deepEqual(feedbackProblems(normalise({ ...GOOD, visibility: "public" })),
                   ["how we may use this must be one of private, anonymous, attributed"]);
});

test("an unbounded field is not a field", () => {
  const long = (key, size) => feedbackProblems(normalise({ ...GOOD, [key]: "x".repeat(size) }));
  assert.match(long("comment", LIMITS.comment + 1).join(" "), /comment is longer than 5000/);
  assert.match(long("locator", LIMITS.locator + 1).join(" "), /locator is longer than 500/);
  const named = feedbackProblems(normalise({
    ...GOOD, visibility: "attributed", display_name: "n".repeat(LIMITS.name + 1) }));
  assert.match(named.join(" "), /name to show is longer than 100/);
});

test("the behaviours a paragraph carries are bounded too", () => {
  const many = normalise({ ...GOOD, behaviours: Array(MAX_BEHAVIOURS + 1).fill("Helpfulness") });
  assert.match(feedbackProblems(many).join(" "), /more behaviours than a paragraph can carry/);
  const long = normalise({ ...GOOD, behaviours: ["b".repeat(LIMITS.behaviour + 1)] });
  assert.match(feedbackProblems(long).join(" "), /behaviour's name is longer than 200/);
});

test("behaviours arrive as an array of names, whatever was sent", () => {
  assert.deepEqual(normalise({ ...GOOD, behaviours: ["  Helpfulness ", "", null, 7] }).behaviours,
                   ["Helpfulness", "7"]);
  assert.deepEqual(normalise({ ...GOOD, behaviours: "Helpfulness" }).behaviours, []);
  assert.deepEqual(normalise(GOOD).behaviours, []);
});

test("everything wrong is said at once, not one refusal per attempt", () => {
  const found = feedbackProblems(normalise({ locator: "", comment: "", email: "" }));
  assert.equal(found.length, 3);
});

test("the document is the locator's head, which is how a document groups", () => {
  assert.equal(documentOf(GOOD.locator), "openai--model-spec@2026-08-18");
  assert.equal(documentOf(""), "");
});

test("a request may not weigh more than the fields it can honestly carry", () => {
  // The caps above add up to a few kilobytes. 64 KB is slack, not a second cap.
  assert.equal(MAX_REQUEST_BYTES, 64 * 1024);
  assert.ok(MAX_REQUEST_BYTES > LIMITS.comment * 2);
  assert.equal(PER_HOUR, 30);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test app/lib/__tests__/feedback.test.mjs`
Expected: FAIL, `Cannot find module` for `../feedback.mjs`.

- [ ] **Step 3: Make `recentFrom` count in a named table**

In `app/lib/submissions.mjs`, replace the `recentFrom` function with:

```javascript
/**
 * How many submissions this source has made in the last hour, in one table.
 *
 * The table is an argument because two public routes are rate-limited the same
 * way against two tables, and the reasoning behind this query -- an hour, this
 * source, counted against the table itself so it needs no second store and
 * survives a cold start -- is worth writing down once.
 */
export async function recentFrom(hash, fetchImpl = fetch, table = "aci_submissions") {
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const rows = await select(
    table, `select=id&source_hash=eq.${hash}&created_at=gte.${since}`, fetchImpl);
  return rows.length;
}
```

- [ ] **Step 3b: Move the Slack send into its own module**

Two public routes now tell Slack about two different things through one webhook, and the part that is the same for both is the part that must not be got wrong twice: the escaping that stops a stranger's words pinging the channel, and a send that reports rather than throws. Create `app/lib/slack.mjs`:

```javascript
/**
 * Telling Slack, for the routes open to the internet.
 *
 * Two of them now, saying different things through one webhook. What is shared
 * is not the message: it is the escaping that stops a stranger's words pinging
 * the channel, and a send that reports what went wrong rather than throwing it
 * at a caller who has already recorded the thing it is about.
 *
 * Each caller builds its own blocks. This sends them.
 */

/* Slack reads a few sequences out of message text, and one of them is a way to
 * ping everyone in the channel. These forms are open to the internet, so a
 * submission could carry <!channel> and would otherwise send it. Escaping the
 * three characters Slack asks for is also what stops that being parsed at all. */
export function forSlack(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Post a message. Returns what went wrong, or null; never throws.
 *
 * The row it describes is already written by the time this runs, so a failure
 * here is a message nobody got rather than words nobody has. `title` is the
 * notification and the fallback for clients that do not render blocks: sending
 * blocks without it makes a silent push.
 */
export async function postToSlack(title, blocks, fetchImpl = fetch) {
  const hook = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!hook) return "SLACK_WEBHOOK_URL is not set";
  try {
    const response = await fetchImpl(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: forSlack(title), blocks }),
    });
    return response.ok ? null : `slack returned ${response.status}`;
  } catch (error) {
    return `slack unreachable: ${error.message}`;
  }
}
```

In `app/lib/submissions.mjs`, delete the module-private `forSlack`, import both from the new module (`import { forSlack, postToSlack } from "./slack.mjs";`), and replace the tail of `announce` — from `const hook = process.env.SLACK_WEBHOOK_URL?.trim();` down to its final `}` — so that it builds `title` and `blocks` exactly as it does today and ends with:

```javascript
  return postToSlack(title, blocks, fetchImpl);
```

The `blocks` array, the `title`, the field list and the truncation stay exactly as they are: this moves the send, not the message. `submissions.test.mjs` exercises all of it through `announce` and must pass unchanged.

- [ ] **Step 4: Hold the new argument with a test**

Add to `app/lib/__tests__/submissions.test.mjs`, after the existing rate-limit test:

```javascript
test("the same rate limit counts in whichever table it is asked about", async () => {
  let asked;
  await recentFrom("abc", async (url) => {
    asked = url;
    return { ok: true, status: 200, json: async () => [], text: async () => "" };
  }, "aci_feedback");
  assert.match(asked, /aci_feedback\?/);
  assert.match(asked, /source_hash=eq\.abc/);
});
```

- [ ] **Step 5: Write `app/lib/feedback.mjs`**

```javascript
/**
 * What a reader says about one paragraph.
 *
 * Not a proposal. A proposal is somebody asking us to run something, and an
 * operator retypes it into the portal; this is somebody telling us that a
 * paragraph reads wrong, or agreeing with one click. Nothing here registers,
 * judges, spends or publishes.
 *
 * This is the second route of the application open to the internet that writes,
 * so what it refuses matters as much as what it accepts. The defences are the
 * proposal form's, because they were built for exactly this: a honeypot, a cap
 * per source per hour, a cap on every field, and a size cap read from the
 * headers before a byte of the body is buffered.
 */
import { insert, select } from "./supabase.mjs";
import { callerAddress, recentFrom, sourceHash } from "./submissions.mjs";
import { forSlack, postToSlack } from "./slack.mjs";
import { currentPublication, isPublicationId } from "./publications.mjs";

export const TABLE = "aci_feedback";

/* One source, one hour. Three times the proposal form's, because a reader
 * working through a document may honestly have something to say about a dozen
 * paragraphs in a sitting, and nothing here costs money to act on. */
export const PER_HOUR = 30;

/* What a whole request may weigh, read from Content-Length before the body is
 * buffered. There is no file here and the caps below add up to a few kilobytes;
 * this is slack, not a second cap. */
export const MAX_REQUEST_BYTES = 64 * 1024;

export const VISIBILITIES = ["private", "anonymous", "attributed"];

/* Long enough for the longest honest answer, and bounded, because an unbounded
 * text field on an open route is a way to fill a database. */
export const LIMITS = { comment: 5000, email: 200, name: 100, locator: 500, behaviour: 200 };

/* More behaviours than the reader's menu holds. A paragraph cited by twenty is
 * already a paragraph nobody selected carefully. */
export const MAX_BEHAVIOURS = 20;

/* Enough to refuse what is plainly not an address. Nothing here verifies that
 * an address exists: the proposal form made the same call, and a submission is
 * judged on what it says. */
const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const text = value => (typeof value === "string" ? value.trim() : "");

/** The document a locator points into: its head, which is the document id. */
export function documentOf(locator) {
  return String(locator || "").split(" > ")[0].trim();
}

/**
 * What arrived, in the shape the rules are written against.
 *
 * Two normalisations are decisions rather than tidying. An unstated visibility
 * is private, because the default must be the one that shows nothing. And a
 * name typed before the reader chose "without my name" is dropped, because the
 * choice they ended on is the choice: the database says the same thing with a
 * check constraint, and this is what keeps the two from disagreeing.
 */
export function normalise(sent = {}) {
  const visibility = VISIBILITIES.includes(sent.visibility) || sent.visibility
    ? text(sent.visibility) || "private"
    : "private";
  const vote = text(sent.vote);
  return {
    locator: text(sent.locator),
    behaviours: (Array.isArray(sent.behaviours) ? sent.behaviours : [])
      .map(name => (name === null || name === undefined ? "" : String(name).trim()))
      .filter(Boolean),
    vote: vote || null,
    comment: text(sent.comment),
    email: text(sent.email),
    visibility,
    display_name: visibility === "attributed" ? text(sent.display_name) : "",
    publication: text(sent.publication),
    website: text(sent.website),
  };
}

function tooLong(value, limit, what) {
  return value.length > limit ? `the ${what} is longer than ${limit} characters` : null;
}

/** Everything wrong with a submission, at once. */
export function feedbackProblems(fields) {
  const found = [];
  if (!fields.locator) found.push("a paragraph must be named");
  if (!fields.comment && !fields.vote) found.push("write a comment or leave a thumb");
  if (fields.vote && fields.vote !== "up" && fields.vote !== "down") {
    found.push("a thumb is either up or down");
  }
  if (!fields.email) found.push("your address is required, so we can write back");
  else if (!ADDRESS.test(fields.email)) found.push("your address does not look like an address");
  if (!VISIBILITIES.includes(fields.visibility)) {
    found.push(`how we may use this must be one of ${VISIBILITIES.join(", ")}`);
  }
  if (fields.visibility === "attributed" && !fields.display_name) {
    found.push("the name to show is required, or choose to be shown without a name");
  }
  for (const [value, limit, what] of [
    [fields.comment, LIMITS.comment, "comment"],
    [fields.email, LIMITS.email, "address"],
    [fields.display_name, LIMITS.name, "name to show"],
    [fields.locator, LIMITS.locator, "locator"],
  ]) {
    const long = tooLong(value, limit, what);
    if (long) found.push(long);
  }
  if (fields.behaviours.length > MAX_BEHAVIOURS) {
    found.push("that is more behaviours than a paragraph can carry");
  }
  if (fields.behaviours.some(name => name.length > LIMITS.behaviour)) {
    found.push(`a behaviour's name is longer than ${LIMITS.behaviour} characters`);
  }
  return found;
}
```

- [ ] **Step 6: Run both suites to verify they pass**

Run: `node --test app/lib/__tests__/feedback.test.mjs app/lib/__tests__/submissions.test.mjs`
Expected: PASS, no failures. The submissions suite must still pass unchanged apart from the test added in Step 4: `recentFrom(hash, fetchImpl)` keeps working because the table is the third argument with a default.

- [ ] **Step 7: Commit**

```bash
git add app/lib/feedback.mjs app/lib/slack.mjs app/lib/submissions.mjs \
        app/lib/__tests__/feedback.test.mjs app/lib/__tests__/submissions.test.mjs
git commit -m "$(cat <<'EOF'
feat: what the feedback route refuses

A submission must name a paragraph, carry an address, and say something: a
comment, a thumb, or both. Being named needs a name, so that choosing to be
named and leaving the field empty is refused rather than quietly published as
anonymous, and a name typed before the reader chose otherwise is dropped.

recentFrom counts in a named table now, because two public routes are
rate-limited the same way against two tables, and the Slack send moves to its
own module: what two public forms share is not the message but the escaping
that stops a stranger's words pinging the channel, and that is worth writing
down once.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLRKTYAnoVBUKA7J89iD54
EOF
)"
```

---

### Task 3: Recording it, and telling Slack

**Files:**
- Modify: `app/lib/feedback.mjs`
- Modify: `app/lib/__tests__/feedback.test.mjs`

**Interfaces:**
- Consumes: everything Task 2 produced; `insert`, `select` from `./supabase.mjs`; `forSlack`, `postToSlack` from `./slack.mjs`; `currentPublication`, `isPublicationId` from `./publications.mjs`.
- Produces:
  - `resolvePublication(pin, fetchImpl) -> string|null`
  - `record({fields, publication_id, hash}, {fetchImpl}) -> row`
  - `announce(row, fetchImpl, site) -> string|null` (what went wrong, or null; never throws)

- [ ] **Step 1: Write the failing tests**

Add to `app/lib/__tests__/feedback.test.mjs`. Extend the import at the top of the file to `announce, documentOf, feedbackProblems, normalise, record, resolvePublication`:

```javascript
/* A fetch that answers every PostgREST call with `rows`, remembering what was asked. */
const spy = (rows = [{ id: "f1" }]) => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url, method: init.method || "GET", body: init.body });
    return { ok: true, status: 200, text: async () => "",
             json: async () => (typeof rows === "function" ? rows(url) : rows) };
  };
  return { seen, fetchImpl };
};

test("a pin that exists is the publication the feedback is about", async () => {
  const { seen, fetchImpl } = spy([{ id: "8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37" }]);
  const id = await resolvePublication("8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37", fetchImpl);
  assert.equal(id, "8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37");
  assert.match(seen[0].url, /aci_publications\?id=eq\.8d3f7a2e/);
});

test("no pin means the current publication, resolved as the reader resolves it", async () => {
  const { seen, fetchImpl } = spy([{ id: "3114dd65-c6f2-5cb3-bf98-af5b314381c3" }]);
  const id = await resolvePublication("", fetchImpl);
  assert.equal(id, "3114dd65-c6f2-5cb3-bf98-af5b314381c3");
  assert.match(seen[0].url, /is_public=is\.true/);
  assert.match(seen[0].url, /order=published_at\.desc/);
});

test("a pin that is not a publication falls through rather than being stored", async () => {
  const { seen, fetchImpl } = spy(url => (url.includes("id=eq.") ? [] : [{ id: "current" }]));
  assert.equal(await resolvePublication("00000000-0000-0000-0000-000000000000", fetchImpl),
               "current");
  assert.equal(seen.length, 2, "it asked for the pin, then for the current one");
  assert.equal(await resolvePublication("not-a-uuid", fetchImpl), "current");
});

test("nothing published yet is a null, not a refusal", async () => {
  const { fetchImpl } = spy([]);
  assert.equal(await resolvePublication("", fetchImpl), null);
});

test("the row carries the paragraph, the reading, and who may see it", async () => {
  const { seen, fetchImpl } = spy();
  const fields = normalise({
    ...GOOD, vote: "down", behaviours: ["Helpfulness", "Proportionate risk mitigation"],
    visibility: "attributed", display_name: "A reader",
  });
  await record({ fields, publication_id: "pub-1", hash: "abc" }, { fetchImpl });
  assert.match(seen[0].url, /aci_feedback/);
  const row = JSON.parse(seen[0].body)[0];
  assert.deepEqual(row, {
    publication_id: "pub-1",
    locator: GOOD.locator,
    document_id: "openai--model-spec@2026-08-18",
    behaviours: ["Helpfulness", "Proportionate risk mitigation"],
    vote: "down",
    comment: GOOD.comment,
    submitter: "reader@example.org",
    display_name: "A reader",
    visibility: "attributed",
    source_hash: "abc",
  });
});

test("the comment is stored as it was written, not as we would like it", async () => {
  const { seen, fetchImpl } = spy();
  const comment = "  it says  authority,  not escalation  ";
  await record({ fields: normalise({ ...GOOD, comment }), publication_id: null, hash: "h" },
               { fetchImpl });
  // Trimmed at the edges by normalise, untouched within: somebody's words.
  assert.equal(JSON.parse(seen[0].body)[0].comment, "it says  authority,  not escalation");
});

test("no webhook is a message nobody got, never feedback nobody has", async () => {
  const hook = process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_WEBHOOK_URL;
  assert.match(await announce({ locator: "x", comment: "y" }, async () => {}, ""),
               /SLACK_WEBHOOK_URL/);
  if (hook) process.env.SLACK_WEBHOOK_URL = hook;
});

test("an unreachable webhook is reported, not thrown", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.example/none";
  const said = await announce({ locator: "x", comment: "y" },
                              async () => { throw new Error("no route to host"); }, "");
  assert.match(said, /slack unreachable: no route to host/);
  delete process.env.SLACK_WEBHOOK_URL;
});

test("feedback cannot make the message ping the channel", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.example/one";
  let sent;
  await announce({ locator: "spec@1 > #a > ¶1", comment: "<!channel> read this",
                   vote: "up", visibility: "private", submitter: "r@e.org", behaviours: [] },
                 async (url, init) => { sent = JSON.parse(init.body); return { ok: true }; },
                 "https://example.org");
  const whole = JSON.stringify(sent);
  assert.ok(!whole.includes("<!channel>"), whole);
  assert.match(whole, /&lt;!channel&gt;/);
  delete process.env.SLACK_WEBHOOK_URL;
});

test("the message names the paragraph, the thumb, and where to read it", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.example/two";
  let sent;
  await announce({ locator: "openai--model-spec@2026-08-18 > #a > ¶1",
                   comment: "It reads wrong.", vote: "down", visibility: "anonymous",
                   submitter: "r@e.org", behaviours: ["Helpfulness"] },
                 async (url, init) => { sent = JSON.parse(init.body); return { ok: true }; },
                 "https://example.org");
  const whole = JSON.stringify(sent);
  assert.match(whole, /Feedback on a paragraph/);
  assert.match(whole, /thumb down/);
  assert.match(whole, /Helpfulness/);
  assert.match(whole, /anonymous/);
  assert.match(whole, /https:\/\/example\.org\/admin\/feedback/);
  assert.equal(typeof sent.text, "string", "a notification, or the push is silent");
  delete process.env.SLACK_WEBHOOK_URL;
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test app/lib/__tests__/feedback.test.mjs`
Expected: FAIL, `The requested module '../feedback.mjs' does not provide an export named 'record'`.

- [ ] **Step 3: Write the implementation**

Append to `app/lib/feedback.mjs`:

```javascript
/**
 * Which publication this is about.
 *
 * Resolved here rather than taken from the page. A locator names the text and
 * carries its version, so the text needs no help; what it does not name is the
 * reading laid over it, which is a publication's. A pin is honoured when it
 * names a publication that exists, and anything else falls through to the
 * current one, resolved exactly as the reader's payload route resolves it.
 */
export async function resolvePublication(pin, fetchImpl = fetch) {
  if (isPublicationId(pin)) {
    const rows = await select("aci_publications", `id=eq.${pin}&select=id`, fetchImpl);
    if (rows.length) return rows[0].id;
  }
  const rows = await select("aci_publications", `select=id&${currentPublication()}`, fetchImpl);
  return rows.length ? rows[0].id : null;
}

/** Write the row. The durable act; Slack is a courtesy the caller pays after. */
export async function record({ fields, publication_id, hash }, { fetchImpl = fetch } = {}) {
  const [row] = await insert(TABLE, [{
    publication_id,
    locator: fields.locator,
    document_id: documentOf(fields.locator),
    behaviours: fields.behaviours,
    vote: fields.vote,
    comment: fields.comment,
    submitter: fields.email,
    display_name: fields.display_name,
    visibility: fields.visibility,
    source_hash: hash,
  }], fetchImpl);
  return row;
}

/* Long enough to judge a comment from the message, short enough to read. */
const IN_SLACK = 700;

const THUMB = { up: "thumb up", down: "thumb down" };

/**
 * Tell Slack. Returns what went wrong, or null; never throws.
 *
 * The row is already written by the time this runs, so a failure here is a
 * message nobody got rather than words nobody has. That is why the caller
 * records first and announces second, and why this swallows everything.
 *
 * The address is in the message because the message goes to us. It is the one
 * place it appears outside the database, and it appears nowhere public.
 */
export async function announce(row, fetchImpl = fetch, site = "") {
  const comment = String(row.comment || "");
  const shown = comment.length > IN_SLACK ? `${comment.slice(0, IN_SLACK)}...` : comment;
  const lines = [
    `*Paragraph:* \`${forSlack(row.locator)}\``,
    ...(row.behaviours?.length ? [`*Highlighted for:* ${forSlack(row.behaviours.join(", "))}`] : []),
    ...(row.vote ? [`*Verdict:* ${THUMB[row.vote] || forSlack(row.vote)}`] : []),
    ...(shown ? [`*Said:* ${forSlack(shown)}`] : []),
  ];

  const title = row.vote
    ? `Feedback on a paragraph (${THUMB[row.vote] || row.vote})`
    : "Feedback on a paragraph";

  const blocks = [
    { type: "header", text: { type: "plain_text", text: forSlack(title).slice(0, 150) } },
    { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
    { type: "context", elements: [{ type: "mrkdwn",
      text: `From ${forSlack(row.submitter || "no address given")}`
          + ` | may be shown: ${forSlack(row.visibility || "private")}`
          + (row.display_name ? ` as ${forSlack(row.display_name)}` : "")
          + ` | <${site}/admin/feedback|read it in the portal>` }] },
  ];

  return postToSlack(title, blocks, fetchImpl);
}
```

and remove the `if (!hook) return "SLACK_WEBHOOK_URL is not set";` lines from the top of this `announce`: `postToSlack` makes that check, and making it twice is how the two would drift apart. The function's first line becomes `const comment = String(row.comment || "");`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test app/lib/__tests__/feedback.test.mjs`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add app/lib/feedback.mjs app/lib/__tests__/feedback.test.mjs
git commit -m "$(cat <<'EOF'
feat: record a reader's feedback, and say so in Slack

The publication is resolved by the route rather than taken from the page: a
locator names the text and carries its version, but the reading laid over it is
a publication's. A pin is honoured when it names one that exists, and anything
else falls through to the current publication, resolved the way the payload
route resolves it.

The row is written first and Slack is told after, so a webhook that is missing
or refuses leaves the words intact and says so in the log.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLRKTYAnoVBUKA7J89iD54
EOF
)"
```

---

### Task 4: The route

**Files:**
- Modify: `app/lib/feedback.mjs`
- Create: `app/api/feedback/route.js`
- Modify: `app/lib/__tests__/feedback.test.mjs`

**Interfaces:**
- Consumes: everything Tasks 2 and 3 produced.
- Produces: `handle(request, {fetchImpl}) -> Response` in `app/lib/feedback.mjs`, and `POST` in `app/api/feedback/route.js`. The response body is `{done: string}` or `{problem: string}`, never both.

- [ ] **Step 1: Write the failing tests**

Add to `app/lib/__tests__/feedback.test.mjs`, extending the import with `handle`:

```javascript
/* A request the way the platform hands one over. */
const post = (body, headers = {}) => new Request("https://index.example/api/feedback", {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

const answered = async (response) => ({ status: response.status, body: await response.json() });

test("a good submission is recorded and thanked", async () => {
  const { seen, fetchImpl } = spy(url => (url.includes("aci_publications")
    ? [{ id: "3114dd65-c6f2-5cb3-bf98-af5b314381c3" }] : [{ id: "f1" }]));
  const { status, body } = await answered(await handle(post(GOOD), { fetchImpl }));
  assert.equal(status, 200);
  assert.match(body.done, /Thank you/);
  const write = seen.find(call => call.method === "POST" && call.url.includes("aci_feedback"));
  assert.ok(write, JSON.stringify(seen.map(call => call.url)));
  assert.equal(JSON.parse(write.body)[0].publication_id,
               "3114dd65-c6f2-5cb3-bf98-af5b314381c3");
});

test("a refusal says everything that is wrong, and writes nothing", async () => {
  const { seen, fetchImpl } = spy();
  const { status, body } = await answered(
    await handle(post({ ...GOOD, email: "" }), { fetchImpl }));
  assert.equal(status, 400);
  assert.match(body.problem, /your address is required/);
  assert.ok(!seen.some(call => call.url.includes("aci_feedback") && call.method === "POST"));
});

test("the honeypot is answered exactly as an honest submission is, and stored nowhere", async () => {
  const { seen, fetchImpl } = spy();
  const { status, body } = await answered(
    await handle(post({ ...GOOD, website: "https://buy.example" }), { fetchImpl }));
  assert.equal(status, 200);
  assert.match(body.done, /Thank you/);
  assert.ok(!seen.some(call => call.method === "POST" && call.url.includes("aci_feedback")));
});

test("a body larger than the cap is refused before it is read", async () => {
  let touched = false;
  const fetchImpl = async () => { touched = true; return { ok: true, json: async () => [] }; };
  const { status, body } = await answered(await handle(
    post(GOOD, { "content-length": String(MAX_REQUEST_BYTES + 1) }), { fetchImpl }));
  assert.equal(status, 413);
  assert.match(body.problem, /larger than this form takes/);
  assert.equal(touched, false, "nothing was asked of the database");
});

test("the thirty-first submission in an hour from one place is refused", async () => {
  const many = Array.from({ length: PER_HOUR }, (_, i) => ({ id: `f${i}` }));
  const { fetchImpl } = spy(url => (url.includes("aci_feedback") ? many : [{ id: "p" }]));
  const { status, body } = await answered(await handle(post(GOOD), { fetchImpl }));
  assert.equal(status, 429);
  assert.match(body.problem, /as many as this form takes/);
  assert.match(body.problem, /already sent are safe/);
});

test("a rate-limit read that fails must not refuse an honest submission", async () => {
  let asked = 0;
  const fetchImpl = async (url, init = {}) => {
    asked += 1;
    if (init.method === undefined && url.includes("aci_feedback")) throw new Error("no route");
    return { ok: true, status: 200, text: async () => "", json: async () => [{ id: "f1" }] };
  };
  const { status } = await answered(await handle(post(GOOD), { fetchImpl }));
  assert.equal(status, 200);
  assert.ok(asked > 1);
});

test("a body that is not feedback is refused in a sentence", async () => {
  const { fetchImpl } = spy();
  const { status, body } = await answered(await handle(post("not json{"), { fetchImpl }));
  assert.equal(status, 400);
  assert.match(body.problem, /was not feedback/);
});

test("a database that will not take it says so, and does not claim success", async () => {
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "POST" && url.includes("aci_feedback")) {
      return { ok: false, status: 400, text: async () => "violates check constraint" };
    }
    return { ok: true, status: 200, text: async () => "", json: async () => [{ id: "p" }] };
  };
  const { status, body } = await answered(await handle(post(GOOD), { fetchImpl }));
  assert.equal(status, 500);
  assert.match(body.problem, /worth trying again/);
  assert.equal(body.done, undefined);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test app/lib/__tests__/feedback.test.mjs`
Expected: FAIL, no export named `handle`.

- [ ] **Step 3: Write `handle` in `app/lib/feedback.mjs`**

Append:

```javascript
const said = (status, outcome) => Response.json(outcome, { status });

/* What a reader is told when it worked. One sentence, and it does not promise a
 * reply: reading every one is a promise we keep, answering every one is not. */
const THANKS = "Thank you. We read every one.";

/**
 * The whole of the route, in one function so it can be tested without a server.
 *
 * JSON in, JSON out, where /api/submit takes a form and answers with a 303. The
 * difference is the surface: the proposal page is a page, and a redirect there
 * means the outcome survives a reload with no JavaScript at all. The reader is
 * an application that has already fetched three payloads, and a navigation
 * would throw away the document position, the behaviour selection and the
 * compare view the reader had arranged.
 */
export async function handle(request, { fetchImpl = fetch } = {}) {
  // Everything that can be judged from the headers is judged before a byte of
  // the body is read. Parsing buffers the whole of it, so a check that runs
  // afterwards has already paid for the request it means to refuse.
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_REQUEST_BYTES) {
    return said(413, { problem: "That is larger than this form takes." });
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
    // The rate-limit read failing must not refuse honest feedback.
    console.error(`feedback: counting recent submissions failed: ${error.message}`);
  }

  let sent;
  try {
    sent = await request.json();
  } catch {
    return said(400, { problem: "That was not feedback." });
  }

  const fields = normalise(sent);

  // Hidden from people, filled in by machinery that posts to every form it
  // finds. Answered exactly as a real submission is, and recorded nowhere:
  // saying "refused" would teach the next attempt what to leave blank.
  if (fields.website) return said(200, { done: THANKS });

  const found = feedbackProblems(fields);
  if (found.length) return said(400, { problem: found.join("\n") });

  let publication_id = null;
  try {
    publication_id = await resolvePublication(fields.publication, fetchImpl);
  } catch (error) {
    // Which publication it was about is worth having and not worth losing the
    // words over.
    console.error(`feedback: resolving the publication failed: ${error.message}`);
  }

  let row;
  try {
    row = await record({ fields, publication_id, hash }, { fetchImpl });
  } catch (error) {
    console.error(`feedback: ${error.stack || error}`);
    return said(500, {
      problem: "Something on our side would not take that. Nothing was recorded, "
             + "so it is worth trying again.",
    });
  }

  const silent = await announce(row, fetchImpl, new URL(request.url).origin);
  if (silent) console.error(`feedback: ${row.id} recorded, not announced: ${silent}`);

  return said(200, { done: THANKS });
}
```

- [ ] **Step 4: Write the route shell**

Create `app/api/feedback/route.js`:

```javascript
/* The second route open to the internet that writes.
 *
 * It records what a reader thinks of one paragraph. It registers nothing,
 * judges nothing, spends nothing and publishes nothing: what a reader permits
 * is stored, and showing any of it is a separate decision a person makes.
 *
 * Everything it does is in app/lib/feedback.mjs, where it can be tested without
 * a server. */
import { handle } from "../../lib/feedback.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  return handle(request);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test app/lib/__tests__/feedback.test.mjs`
Expected: PASS, every test.

- [ ] **Step 6: Check the application still builds**

Run: `pnpm build`
Expected: the build completes, and the route list includes `ƒ /api/feedback`.

- [ ] **Step 7: Commit**

```bash
git add app/lib/feedback.mjs app/api/feedback/route.js app/lib/__tests__/feedback.test.mjs
git commit -m "$(cat <<'EOF'
feat: the route that takes feedback on a paragraph

JSON in, JSON out, where the proposal form takes a form and answers with a 303.
The difference is the surface: a redirect suits a page and would throw away the
document position, the behaviour selection and the compare view a reader had
arranged.

The guards are the proposal form's, for the same reasons: the size cap is read
from the headers before the body is buffered, the honeypot is answered exactly
as an honest submission is, and a rate-limit read that fails does not refuse
honest feedback.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLRKTYAnoVBUKA7J89iD54
EOF
)"
```

---

### Task 5: The icon, and the dialog it opens

**Files:**
- Modify: `site/spec-reader/app.js` (the icon group, `feedbackSubject`, `feedbackBody`, `savedText`/`saveText`, the click handlers)
- Modify: `site/spec-reader/index.html` (the dialog)
- Modify: `site/spec-reader/styles.css` (the icon's reveal, the dialog)
- Create: `engine/panel/test_appjs_feedback.js`
- Modify: `engine/panel/test_panel.py`

**Interfaces:**
- Consumes: `state.payloadSource` (already in `app.js`), `block.dataset.locator`, `block.dataset.locators`, `block.dataset.behaviours` (all already set by `attachLocators` and `annotatePassages`).
- Produces, in `app.js`:
  - `const FEEDBACK_ICON` and `const PASSAGE_ICONS` (the three icons as one group)
  - `function feedbackSubject(button) -> {locator, behaviours}|null`
  - `function feedbackBody(subject, form, pinned) -> object` (the request body; pure, no `state`, no DOM)
  - `function savedText(key) -> string`, `function saveText(key, value)`
  - `const FEEDBACK_KEYS = {email, name, visibility}`

- [ ] **Step 1: Write the failing harness**

Create `engine/panel/test_appjs_feedback.js`:

```javascript
#!/usr/bin/env node
/* Guard for the feedback dialog's pure parts, extracted verbatim from
 * site/spec-reader/app.js: what the dialog is about (feedbackSubject) and what
 * it sends (feedbackBody).
 *
 * What matters here is that the behaviours travelling with a comment are the
 * ones highlighting that paragraph and not the whole menu, that an ordinary
 * paragraph sends its own locator, and that the address never travels twice.
 *
 * Exits 0 when every check holds, 1 otherwise, and prints a final count line the
 * Python driver asserts on.
 * Run:  node engine/panel/test_appjs_feedback.js
 * (driven from test_panel.py::TestAppJSFeedback; needs Node, no browser/keys)
 */
const fs = require("fs");
const path = require("path");

const APP_JS = path.join(__dirname, "..", "..", "site", "spec-reader", "app.js");
const lines = fs.readFileSync(APP_JS, "utf8").split("\n");

function extractFn(header) {
  const start = lines.findIndex(l => l.startsWith(header));
  if (start < 0) throw new Error(`not found in app.js: ${header}`);
  let depth = 0, began = false;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") { depth++; began = true; }
      else if (ch === "}") { depth--; }
    }
    if (began && depth === 0) return lines.slice(start, i + 1).join("\n");
  }
  throw new Error(`unbalanced braces in app.js for: ${header}`);
}

eval(extractFn("function feedbackSubject("));
eval(extractFn("function feedbackBody("));

/* The two shapes the reader's DOM presents: a paragraph no passage cites, whose
 * icons sit in a .block-copy toolbar inside it, and a cited passage, whose icons
 * sit in its .passage-head. Only what these functions read is modelled. */
function uncited(locator) {
  const block = { dataset: { locator }, classList: { contains: () => false } };
  const toolbar = { parentElement: block };
  return { closest: selector => (selector === ".block-copy" ? toolbar : null) };
}
function cited(locators, behaviours) {
  const block = { dataset: { locators, behaviours } };
  return { closest: selector => (selector === ".block-copy" ? null : block) };
}

let checks = 0, failures = 0;
function check(label, got, want) {
  checks += 1;
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (!same) {
    failures += 1;
    console.log(`FAIL ${label}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

const LOC = "openai--model-spec@2026-08-18 > #levels_of_authority > ¶2";

check("an ordinary paragraph is about its own locator, with no behaviours",
  feedbackSubject(uncited(LOC)), { locator: LOC, behaviours: [] });

check("a cited passage is about the first locator it is cited by",
  feedbackSubject(cited(`${LOC}\nopenai--model-spec@2026-08-18 > #other > ¶9`,
                        "Helpfulness · Proportionate risk mitigation")),
  { locator: LOC, behaviours: ["Helpfulness", "Proportionate risk mitigation"] });

check("the separator is a delimiter, and a behaviour is not split on its own punctuation",
  feedbackSubject(cited(LOC, "Avoiding over- and under-caution")),
  { locator: LOC, behaviours: ["Avoiding over- and under-caution"] });

check("a block with no locator is nothing to send feedback about",
  feedbackSubject(uncited("")), null);

const FORM = { vote: "down", comment: "It reads wrong.", email: "reader@example.org",
               visibility: "attributed", name: "A reader", website: "" };

check("the body carries the paragraph, the reading and the choice",
  feedbackBody({ locator: LOC, behaviours: ["Helpfulness"] }, FORM, null),
  { locator: LOC, behaviours: ["Helpfulness"], publication: null, vote: "down",
    comment: "It reads wrong.", email: "reader@example.org", visibility: "attributed",
    display_name: "A reader", website: "" });

check("a name typed and then not asked for does not travel",
  feedbackBody({ locator: LOC, behaviours: [] }, { ...FORM, visibility: "anonymous" }, null)
    .display_name, "");

check("a pinned reader says which publication it was reading",
  feedbackBody({ locator: LOC, behaviours: [] }, FORM,
               "8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37").publication,
  "8d3f7a2e-5b1c-4e9a-b6d0-2c4f8e1a9b37");

check("the address travels in one field only",
  Object.entries(feedbackBody({ locator: LOC, behaviours: [] }, FORM, null))
    .filter(([, value]) => String(value).includes("@")).map(([key]) => key),
  ["email"]);

console.log(`${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the harness to verify it fails**

Run: `node engine/panel/test_appjs_feedback.js`
Expected: FAIL, `Error: not found in app.js: function feedbackSubject(`.

- [ ] **Step 3: Add the icon to the group in `app.js`**

In `site/spec-reader/app.js`, immediately after the `COPY_ICONS` constant (it ends with the `</svg></button>` of the chain icon, just before `/* What a copy says, done and refused. */`), add:

```javascript
/* Say something about this paragraph.
 *
 * A third icon in the same group as the two copy icons, so it reaches a cited
 * passage's head and an ordinary paragraph's gutter from one addition, and
 * inherits their reveal: out of sight until the pointer is over the block, focus
 * is inside it, or it is tapped. A speech bubble drawn inline, because the
 * framework carries no icon library and no emoji.
 *
 * Its own class, not .passage-copy: the browser walker counts the copy icons of
 * a passage, and an icon that copies nothing must not be counted among them. */
const FEEDBACK_ICON = `
      <button type="button" class="passage-feedback"
        aria-label="Send feedback on this paragraph" title="Send feedback on this paragraph"><svg
        viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path
        d="M3.4 2.9h9.2c.9 0 1.6.7 1.6 1.6v4.8c0 .9-.7 1.6-1.6 1.6H7.2l-2.9 2.2v-2.2H3.4c-.9 0-1.6-.7-1.6-1.6V4.5c0-.9.7-1.6 1.6-1.6Z"
        fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></button>`;

/* The icons a paragraph carries, cited or not: copy its locator, copy a link to
 * it, say something about it. */
const PASSAGE_ICONS = `${COPY_ICONS}${FEEDBACK_ICON}`;
```

Then use the group in both places that drew the copy icons:

- in `passageLabels`, replace the line `      ${COPY_ICONS}` with `      ${PASSAGE_ICONS}`;
- in the `BLOCK_COPY` constant, replace `const BLOCK_COPY = \`<span class="block-copy">${COPY_ICONS}</span>\`;` with:

```javascript
const BLOCK_COPY = `<span class="block-copy">${PASSAGE_ICONS}</span>`;
```

- [ ] **Step 4: Add the two pure functions to `app.js`**

Immediately after `copyFromPassage` (before the `/* The same two icons for every paragraph no passage cites. */` comment), add:

```javascript
/* What a feedback dialog is about: the paragraph whose icon was pressed.
 *
 * The same two shapes copyFromPassage reads. A paragraph's own icons sit in a
 * .block-copy toolbar inside it and it carries one locator; a cited passage
 * keeps its icons in its head and carries the locators it is cited by, newest
 * first, and the behaviours citing it.
 *
 * The behaviours are the intersection and not the menu, because that is what
 * annotatePassages writes: of the behaviours ticked in the sidebar, the ones
 * citing this paragraph. That is exactly the set colouring the text in front of
 * the reader, and the only set the dialog can honestly show them. */
function feedbackSubject(button) {
  const holder = button.closest(".block-copy")?.parentElement;
  const block = holder || button.closest("[data-passage-id]");
  if (!block) return null;
  const locator = holder ? holder.dataset.locator : (block.dataset.locators || "").split("\n")[0];
  if (!locator) return null;
  // " · " is the delimiter app.js writes and verify-reader-test.mjs splits on.
  // It is not punctuation: a behaviour's own hyphens and commas survive it.
  const behaviours = holder ? []
    : (block.dataset.behaviours || "").split(" · ").map(name => name.trim()).filter(Boolean);
  return { locator, behaviours };
}

/* What is sent. Pure, and given everything it needs, so the harness can hold it
 * to its output without a browser.
 *
 * `display_name` is emptied for anything but "attributed": a name typed before
 * the reader chose to be unnamed is not a name they asked us to show. The route
 * does the same on arrival and the database says it as a check constraint, so
 * all three agree. */
function feedbackBody(subject, form, pinned) {
  return {
    locator: subject.locator,
    behaviours: subject.behaviours,
    publication: pinned,
    vote: form.vote,
    comment: form.comment,
    email: form.email,
    visibility: form.visibility,
    display_name: form.visibility === "attributed" ? form.name : "",
    website: form.website,
  };
}
```

- [ ] **Step 5: Run the harness to verify it passes**

Run: `node engine/panel/test_appjs_feedback.js`
Expected: `9 checks, 0 failures`, exit 0.

- [ ] **Step 6: Drive the harness from the Python suite**

In `engine/panel/test_panel.py`, beside the other `TestAppJS*` classes (copy the shape of `TestAppJSOpening`, which is at roughly line 486), add:

```python
class TestAppJSFeedback(unittest.TestCase):
    """The feedback dialog's pure parts: what it is about, and what it sends."""

    HARNESS = HERE / "test_appjs_feedback.js"

    def test_harness_passes(self):
        result = subprocess.run(["node", str(self.HARNESS)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertRegex(result.stdout, r"\d+ checks, 0 failures")
```

Read the neighbouring class first and match it exactly: if it skips when node is absent, or asserts a specific check count, do the same here.

- [ ] **Step 7: Add the dialog to `site/spec-reader/index.html`**

Immediately after the `<div id="original-note" ...>` block and before `<footer class="site-footer">`, add:

```html
  <!-- What a reader says about one paragraph. Opened from the third icon on any
       paragraph; app.js fills the locator and the behaviours from the paragraph
       itself, and neither can be typed. Modal, so the document behind it stops
       taking the keyboard, and `novalidate` so the sentences a reader is refused
       with are ours rather than the browser's. -->
  <dialog id="feedback-dialog" class="feedback-dialog" aria-labelledby="feedback-title">
    <form id="feedback-form" class="feedback-form" novalidate>
      <div class="feedback-head">
        <h2 id="feedback-title">Feedback on this paragraph</h2>
        <button type="button" class="feedback-close" id="feedback-close"
          aria-label="Close">×</button>
      </div>
      <p class="feedback-locator" id="feedback-locator"></p>

      <p class="feedback-field" id="feedback-behaviours-field" hidden>
        <label for="feedback-behaviours">Behaviours highlighting it</label>
        <input id="feedback-behaviours" type="text" readonly aria-readonly="true">
      </p>

      <fieldset class="feedback-vote">
        <legend>Does the index get this paragraph right? (optional)</legend>
        <div class="feedback-thumbs">
          <button type="button" class="thumb" data-vote="up" aria-pressed="false"><svg
            viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path
            d="M4.6 14V6.8h1.9L9 2.4c.9 0 1.5.7 1.5 1.6v2.1h2.6c.8 0 1.4.8 1.2 1.6l-1 4.8c-.1.6-.7 1-1.3 1H4.6ZM4.6 6.8H1.8V14h2.8"
            fill="none" stroke="currentColor" stroke-width="1.3"
            stroke-linejoin="round"/></svg> Yes</button>
          <button type="button" class="thumb" data-vote="down" aria-pressed="false"><svg
            viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path
            d="M4.6 2v7.2h1.9L9 13.6c.9 0 1.5-.7 1.5-1.6V9.9h2.6c.8 0 1.4-.8 1.2-1.6l-1-4.8c-.1-.6-.7-1-1.3-1H4.6ZM4.6 9.2H1.8V2h2.8"
            fill="none" stroke="currentColor" stroke-width="1.3"
            stroke-linejoin="round"/></svg> No</button>
        </div>
      </fieldset>

      <p class="feedback-field">
        <label for="feedback-comment">Your comment (optional)</label>
        <textarea id="feedback-comment" rows="4" maxlength="5000"></textarea>
      </p>

      <p class="feedback-field">
        <label for="feedback-email">Your address</label>
        <input id="feedback-email" type="email" maxlength="200" autocomplete="email">
        <span class="feedback-note">We use it to write back. It is never shown on the site.</span>
      </p>

      <fieldset class="feedback-visibility">
        <legend>How may we use this?</legend>
        <label class="feedback-choice">
          <input type="radio" name="visibility" value="private" checked>
          <span class="choice-title">Keep it private</span>
          <span class="choice-note">Only we read it.</span>
        </label>
        <label class="feedback-choice">
          <input type="radio" name="visibility" value="anonymous">
          <span class="choice-title">Show it, without my name</span>
          <span class="choice-note">The comment and the vote may appear on the site.</span>
        </label>
        <label class="feedback-choice">
          <input type="radio" name="visibility" value="attributed">
          <span class="choice-title">Show it, and say it came from me</span>
          <span class="choice-note">Your address stays private.</span>
        </label>
      </fieldset>

      <p class="feedback-field" id="feedback-name-field" hidden>
        <label for="feedback-name">Name to show</label>
        <input id="feedback-name" type="text" maxlength="100" autocomplete="nickname">
      </p>

      <!-- Hidden from people, filled in by machinery that posts to every form it
           finds. A submission carrying it is thanked and recorded nowhere. -->
      <p class="feedback-trap" aria-hidden="true">
        <label for="feedback-website">Leave this empty</label>
        <input id="feedback-website" type="text" tabindex="-1" autocomplete="off">
      </p>

      <p class="feedback-outcome" id="feedback-outcome" role="status"></p>

      <div class="feedback-actions">
        <button type="button" class="feedback-cancel" id="feedback-cancel">Cancel</button>
        <button type="submit" class="feedback-send" id="feedback-send">Send feedback</button>
      </div>
    </form>
  </dialog>
```

- [ ] **Step 8: Let the third icon reveal as the first two do**

In `site/spec-reader/styles.css`, the reveal rules name `.passage-copy` (near line 1678, and again near 1720 for the gutter toolbar). The third icon must reveal identically, so every one of those selectors gains it. Change exactly these nine lines, leaving every declaration as it is:

```css
/* was: .passage-copy {  */
:is(.passage-copy, .passage-feedback) {

/* was: .passage-copy svg { display: block; width: 14px; height: 14px; } */
:is(.passage-copy, .passage-feedback) svg { display: block; width: 14px; height: 14px; }

/* was: .passage-head .passage-copy ~ .passage-why { margin-left: 0; } */
.passage-head :is(.passage-copy, .passage-feedback) ~ .passage-why { margin-left: 0; }

/* was: .passage:hover .passage-copy,
        .passage:focus-within .passage-copy { opacity: .55; } */
.passage:hover :is(.passage-copy, .passage-feedback),
.passage:focus-within :is(.passage-copy, .passage-feedback) { opacity: .55; }

/* was: .passage .passage-copy:hover,
        .passage .passage-copy:focus-visible { opacity: 1; color: var(--ink); } */
.passage :is(.passage-copy, .passage-feedback):hover,
.passage :is(.passage-copy, .passage-feedback):focus-visible { opacity: 1; color: var(--ink); }

/* was: .passage.current .passage-copy,
        .passage.touched .passage-copy { opacity: .55; }        (inside @media (hover: none)) */
  .passage.current :is(.passage-copy, .passage-feedback),
  .passage.touched :is(.passage-copy, .passage-feedback) { opacity: .55; }

/* was: .block-copy .passage-copy { margin: 0; } */
.block-copy :is(.passage-copy, .passage-feedback) { margin: 0; }

/* was: .holds-copy:hover > .block-copy .passage-copy,
        .holds-copy:focus-within > .block-copy .passage-copy { opacity: .55; } */
.holds-copy:hover > .block-copy :is(.passage-copy, .passage-feedback),
.holds-copy:focus-within > .block-copy :is(.passage-copy, .passage-feedback) { opacity: .55; }

/* was: .holds-copy .block-copy .passage-copy:hover,
        .holds-copy .block-copy .passage-copy:focus-visible { opacity: 1; color: var(--ink); } */
.holds-copy .block-copy :is(.passage-copy, .passage-feedback):hover,
.holds-copy .block-copy :is(.passage-copy, .passage-feedback):focus-visible { opacity: 1; color: var(--ink); }

/* was: .holds-copy.touched > .block-copy .passage-copy,
        .linked-block > .block-copy .passage-copy { opacity: .55; }   (inside @media (hover: none)) */
  .holds-copy.touched > .block-copy :is(.passage-copy, .passage-feedback),
  .linked-block > .block-copy :is(.passage-copy, .passage-feedback) { opacity: .55; }

/* was: .passage-copy { transition: none; }   (inside @media (prefers-reduced-motion: reduce), near line 1883) */
  :is(.passage-copy, .passage-feedback) { transition: none; }
```

`.passage-copy[data-copy="locator"] { margin-left: auto; }` is the one rule that stays as it is: it pushes the whole group to the right of a passage head and belongs to the first icon of the group, which is still a copy icon.

- [ ] **Step 9: Style the dialog**

Append at the end of `site/spec-reader/styles.css`:

```css
/* ---------- feedback on a paragraph ---------- */

/* Modal, centred, and no wider than prose wants to be. The framework's one
   permitted box: a 1px rule around a single highlighted element per view. */
.feedback-dialog {
  width: min(520px, calc(100vw - 32px));
  max-height: min(86vh, 720px);
  padding: 0;
  border: 1px solid var(--muted);
  border-radius: 4px;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--ui);
}
.feedback-dialog::backdrop { background: rgba(35, 40, 27, .55); }
.feedback-form { display: block; padding: 18px 20px 20px; overflow-y: auto; max-height: inherit; }

.feedback-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}
.feedback-head h2 {
  margin: 0;
  font-family: var(--display);
  font-size: 18px;
  font-weight: 600;
}
.feedback-close {
  border: 0;
  background: none;
  padding: 2px 6px;
  color: var(--faint);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}
.feedback-close:hover { background: var(--energy); color: var(--ink); }
.feedback-close:focus-visible { outline: 2px solid var(--energy); outline-offset: 2px; }

/* The paragraph this is about, in the family the index writes data in. */
.feedback-locator {
  margin: 6px 0 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line-light);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.feedback-field { margin: 0 0 16px; }
.feedback-field[hidden] { display: none; }
.feedback-field label,
.feedback-vote legend,
.feedback-visibility legend {
  display: block;
  margin-bottom: 6px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
}
.feedback-field input,
.feedback-field textarea {
  display: block;
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--reading);
  color: var(--ink);
  font-family: var(--ui);
  font-size: 14px;
  line-height: 1.5;
}
.feedback-field textarea { resize: vertical; min-height: 72px; }
.feedback-field input:focus-visible,
.feedback-field textarea:focus-visible {
  outline: 2px solid var(--energy);
  outline-offset: 1px;
}
/* Shown, not editable: the behaviours are read off the paragraph. Readonly
   rather than disabled, so it keeps its place in the tab order and a screen
   reader still reads the context every other reader can see. */
.feedback-field input[readonly] {
  background: transparent;
  border-style: dashed;
  color: var(--muted);
}
.feedback-note {
  display: block;
  margin-top: 5px;
  color: var(--faint);
  font-size: 12px;
  line-height: 1.45;
}

.feedback-vote, .feedback-visibility {
  margin: 0 0 16px;
  padding: 0;
  border: 0;
}
.feedback-thumbs { display: flex; gap: 8px; }
/* A pill, as every button on a Polaris surface is. Pressed, it takes the energy
   colour at the weight a selected table row takes it. */
.thumb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  font-family: var(--ui);
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease, color .15s ease;
}
.thumb svg { width: 14px; height: 14px; display: block; }
.thumb:hover { border-color: var(--muted); }
.thumb:focus-visible { outline: 2px solid var(--energy); outline-offset: 2px; }
/* Pressed, it takes the energy colour at full strength with ink text, which is
   what every other active control in this reader does (.depth-head, the tier
   toggles). color-mix appears nowhere in this file and does not start here. */
.thumb[aria-pressed="true"] {
  background: var(--energy);
  border-color: var(--muted);
  color: var(--ink);
}

.feedback-choice {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  margin-bottom: 10px;
  font-weight: 400;
  cursor: pointer;
}
.feedback-choice input { grid-row: 1 / span 2; margin-top: 3px; accent-color: var(--accent); }
.feedback-choice input:focus-visible { outline: 2px solid var(--energy); outline-offset: 2px; }
.feedback-choice .choice-title { font-size: 14px; }
.feedback-choice .choice-note { color: var(--faint); font-size: 12px; line-height: 1.45; }

/* Never seen, never reached by the keyboard, and not announced. */
.feedback-trap {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.feedback-outcome {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-line;
}
.feedback-outcome:empty { display: none; }
.feedback-outcome.problem { color: var(--fail); }
.feedback-outcome.done { color: var(--muted); }

.feedback-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--line-light);
  margin-top: 4px;
  padding-top: 16px;
}
.feedback-cancel, .feedback-send {
  padding: 7px 18px;
  border-radius: 999px;
  font-family: var(--ui);
  font-size: 14px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}
.feedback-cancel { border: 1px solid var(--muted); background: transparent; color: var(--ink); }
.feedback-cancel:hover { border-color: var(--ink); }
.feedback-send { border: 1px solid var(--accent); background: var(--accent); color: var(--paper); }
.feedback-send:hover { background: var(--energy); border-color: var(--energy); color: var(--ink); }
.feedback-send[disabled] { opacity: .55; cursor: default; }
.feedback-cancel:focus-visible, .feedback-send:focus-visible {
  outline: 2px solid var(--energy);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .feedback-close, .thumb, .feedback-cancel, .feedback-send { transition: none; }
}
```

`--fail` is already defined in both palettes (`#A0522D` on daylight, `#C97A4D` on umber), so `.feedback-outcome.problem` needs no new token.

- [ ] **Step 10: Verify the harness and the offline suites still pass**

Run:
```bash
node engine/panel/test_appjs_feedback.js
python3 -m unittest discover -s engine/panel -p "test_*.py"
```
Expected: `9 checks, 0 failures`, then `OK` from unittest with the new `TestAppJSFeedback` among the tests run.

- [ ] **Step 11: Commit**

```bash
git add site/spec-reader/app.js site/spec-reader/index.html site/spec-reader/styles.css \
        engine/panel/test_appjs_feedback.js engine/panel/test_panel.py
git commit -m "$(cat <<'EOF'
feat: every paragraph carries an icon for saying what you think of it

A third icon in the group the two copy icons already form, so it reaches a cited
passage's head and an ordinary paragraph's gutter from one addition and reveals
itself the same way. Its own class, not .passage-copy: an icon that copies
nothing must not be counted among the copy icons.

The behaviours the dialog shows are the intersection, not the menu: of the
behaviours ticked in the sidebar, the ones citing that paragraph, which is
exactly the set colouring the text in front of the reader.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLRKTYAnoVBUKA7J89iD54
EOF
)"
```

---

### Task 6: Opening it, sending it, and what the browser remembers

**Files:**
- Modify: `site/spec-reader/app.js`
- Modify: `engine/reader-routes.mjs`
- Modify: `engine/verify-reader-features.mjs`

**Interfaces:**
- Consumes: `feedbackSubject`, `feedbackBody`, `FEEDBACK_KEYS`, `savedText`, `saveText` from Task 5; `state.payloadSource`; the `#feedback-*` elements from the dialog.
- Produces: `setupFeedback()`, called once from `initialize()`; `openFeedback(button)`, called from the two click handlers.

- [ ] **Step 1: Add the browser's memory helpers to `app.js`**

Find `savedFlag` and `saveFlag` (near line 507). Immediately after them, add:

```javascript
/* What the feedback dialog remembers between visits: the address, the name to
 * show, and the standing decision about publication.
 *
 * localStorage rather than sessionStorage, and they are not the same thing:
 * sessionStorage is cleared when the tab closes, localStorage survives the
 * browser being quit. What is remembered here is somebody's address and their
 * answer to a question about consent, and neither should have to be given again
 * next week. Nothing else is remembered: every send is a row, so the browser
 * does not record what has already been said about a paragraph. */
const FEEDBACK_KEYS = {
  email: "aci-feedback-email",
  name: "aci-feedback-name",
  visibility: "aci-feedback-visibility",
};

function savedText(key) {
  try { return localStorage.getItem(key) || ""; } catch (error) { return ""; }
}

function saveText(key, value) {
  try { localStorage.setItem(key, value); } catch (error) {}
}
```

- [ ] **Step 2: Add the dialog's wiring to `app.js`**

After `feedbackBody` (added in Task 5), add:

```javascript
/* The dialog, wired once. Its fields are filled per paragraph by openFeedback.
 *
 * One dialog for the whole reader rather than one per paragraph, for the reason
 * the copy toolbar is one: several hundred paragraphs would otherwise carry
 * several hundred forms, and the tab order would grow by thousands of stops. */
const feedback = {};

function feedbackForm() {
  return {
    vote: feedback.vote,
    comment: feedback.comment.value.trim(),
    email: feedback.email.value.trim(),
    visibility: feedback.dialog.querySelector("input[name=visibility]:checked")?.value || "private",
    name: feedback.name.value.trim(),
    website: feedback.website.value.trim(),
  };
}

function setFeedbackVote(vote) {
  feedback.vote = feedback.vote === vote ? null : vote;   // pressing it again takes it back
  feedback.thumbs.forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.vote === feedback.vote));
  });
}

/* The name to show belongs to one choice, so it appears with it and nowhere
 * else. A name typed and then abandoned never travels: feedbackBody drops it. */
function syncFeedbackVisibility() {
  const chosen = feedback.dialog.querySelector("input[name=visibility]:checked")?.value;
  feedback.nameField.hidden = chosen !== "attributed";
}

function sayFeedback(kind, sentence) {
  feedback.outcome.className = `feedback-outcome ${kind}`;
  feedback.outcome.textContent = sentence;
}

function openFeedback(button) {
  const subject = feedbackSubject(button);
  if (!subject) return;
  feedback.subject = subject;
  feedback.locator.textContent = subject.locator;
  feedback.behavioursField.hidden = subject.behaviours.length === 0;
  feedback.behaviours.value = subject.behaviours.join(", ");
  feedback.comment.value = "";
  feedback.website.value = "";
  setFeedbackVote(null);
  sayFeedback("", "");
  feedback.send.disabled = false;
  // Remembered, so the address is typed once and the choice about publication
  // is made once.
  feedback.email.value = savedText(FEEDBACK_KEYS.email);
  feedback.name.value = savedText(FEEDBACK_KEYS.name);
  const remembered = savedText(FEEDBACK_KEYS.visibility);
  const radio = remembered
    && feedback.dialog.querySelector(`input[name=visibility][value="${remembered}"]`);
  (radio || feedback.dialog.querySelector('input[name=visibility][value="private"]')).checked = true;
  syncFeedbackVisibility();
  feedback.dialog.showModal();
  (feedback.email.value ? feedback.comment : feedback.email).focus();
}

async function sendFeedback() {
  const form = feedbackForm();
  const body = feedbackBody(
    feedback.subject, form,
    state.payloadSource?.origin === "pin" ? state.payloadSource.name : null);
  feedback.send.disabled = true;
  sayFeedback("", "Sending…");
  let answer;
  try {
    const response = await fetch(FEEDBACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    answer = await response.json();
  } catch (error) {
    feedback.send.disabled = false;
    sayFeedback("problem", "That did not reach us. Nothing was recorded, so it is worth "
                         + "trying again.");
    return;
  }
  if (answer.problem) {
    feedback.send.disabled = false;
    sayFeedback("problem", answer.problem);
    return;
  }
  // Remembered only once something was accepted: an address refused as
  // malformed is not an address worth offering back next time.
  saveText(FEEDBACK_KEYS.email, form.email);
  saveText(FEEDBACK_KEYS.name, form.visibility === "attributed" ? form.name : "");
  saveText(FEEDBACK_KEYS.visibility, form.visibility);
  sayFeedback("done", answer.done || "Thank you. We read every one.");
  setTimeout(() => { if (feedback.dialog.open) feedback.dialog.close(); }, 1200);
}

function setupFeedback() {
  const dialog = document.getElementById("feedback-dialog");
  if (!dialog) return;
  Object.assign(feedback, {
    dialog,
    form: document.getElementById("feedback-form"),
    locator: document.getElementById("feedback-locator"),
    behavioursField: document.getElementById("feedback-behaviours-field"),
    behaviours: document.getElementById("feedback-behaviours"),
    comment: document.getElementById("feedback-comment"),
    email: document.getElementById("feedback-email"),
    name: document.getElementById("feedback-name"),
    nameField: document.getElementById("feedback-name-field"),
    website: document.getElementById("feedback-website"),
    outcome: document.getElementById("feedback-outcome"),
    send: document.getElementById("feedback-send"),
    thumbs: [...dialog.querySelectorAll(".thumb")],
    vote: null,
    subject: null,
  });
  feedback.thumbs.forEach(button => {
    button.addEventListener("click", () => setFeedbackVote(button.dataset.vote));
  });
  dialog.querySelectorAll("input[name=visibility]").forEach(radio => {
    radio.addEventListener("change", syncFeedbackVisibility);
  });
  document.getElementById("feedback-close").addEventListener("click", () => dialog.close());
  document.getElementById("feedback-cancel").addEventListener("click", () => dialog.close());
  // A click on the backdrop lands on the dialog itself, never on its contents.
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  feedback.form.addEventListener("submit", event => {
    event.preventDefault();
    sendFeedback();
  });
}
```

Add the route's address beside the other three, under the `BEHAVIOUR_NOTES_URL` constant near the top of the file:

```javascript
/* Where a reader's words about a paragraph go. The only route this page posts
 * to; everything else it does is a read. */
const FEEDBACK_URL = "/api/feedback";
```

- [ ] **Step 3: Open it from both places an icon can be pressed**

In `setupPassageDisclosure`, the first click listener already handles `.passage-copy`. Extend it so the feedback button is handled beside it:

```javascript
  panel.querySelector(".document-body").addEventListener("click", event => {
    const copy = event.target.closest(".passage-copy");
    if (copy) {
      copyFromPassage(copy);
      return;
    }
    const say = event.target.closest(".passage-feedback");
    if (say) {
      openFeedback(say);
      return;
    }
    // Where there is no pointer to hover with, a tapped passage shows its icons.
    event.target.closest("[data-passage-id]")?.classList.add("touched");
  });
```

`setupBlockCopy` needs no listener of its own, and must not get one. Its toolbar is appended **inside** the paragraph (`block.append(toolbar)`), which is inside `.document-body`, so a click on a gutter icon already reaches the listener above: that is how the gutter's copy icons have always worked. A second listener on the toolbar would run `copyFromPassage` twice for one click.

The one edit inside `setupBlockCopy` is to keep the toolbar's own clicks from being read as clicks on the paragraph. Its existing `click` listener already guards with `if (!event.target.closest?.(".block-copy"))`, so it needs no change either. Read both handlers before editing to confirm this still holds, and change nothing in `setupBlockCopy` if it does.

- [ ] **Step 4: Call it once, at startup**

In `initialize()`, beside the other one-time setup, add `setupFeedback();` immediately before `rebuildReader();`.

- [ ] **Step 5: Answer the route in the fixture server**

In `engine/reader-routes.mjs`, at the top of `serveReaderRoute`, before the `/api/reader/` guard:

```javascript
  // The one route the reader posts to. The walkers test the dialog, not the
  // database: what must be proved is that a reader's words leave the page in the
  // shape the route reads, and the route's own rules are tested under node.
  if (url.pathname === "/api/feedback" && request.method === "POST") {
    const body = await new Promise(resolve => {
      let raw = "";
      request.on("data", chunk => { raw += chunk; });
      request.on("end", () => resolve(raw));
    });
    lastFeedback = JSON.parse(body || "{}");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ done: "Thank you. We read every one." }));
    return true;
  }
```

and beside `CURRENT_PUBLICATION`, add:

```javascript
/** What the reader last posted to /api/feedback, for the walker to read back. */
export let lastFeedback = null;
export const readLastFeedback = () => lastFeedback;
```

(`let` exported directly is read live by an importing module; `readLastFeedback` is there for a caller that destructures.)

- [ ] **Step 6: Add the walker's checks**

In `engine/verify-reader-features.mjs`, after the existing check `"a cited passage keeps its icons in its head, and gets none in the gutter"` (near line 597), add:

```javascript
  // The third icon: on a cited passage and on an ordinary paragraph alike.
  const feedbackIcons = await page.evaluate(() => {
    const block = document.querySelector("[data-passage-id]");
    return { head: block.querySelectorAll(".passage-head .passage-feedback").length,
             copies: block.querySelectorAll(".passage-head .passage-copy").length };
  });
  check(feedbackIcons.head === 1 && feedbackIcons.copies === 2,
    "a cited passage carries one feedback icon beside its two copy icons",
    JSON.stringify(feedbackIcons));

  await page.locator("[data-passage-id] .passage-feedback").first().click();
  const opened = await page.evaluate(() => {
    const dialog = document.getElementById("feedback-dialog");
    return {
      open: dialog.open,
      locator: document.getElementById("feedback-locator").textContent,
      behaviours: document.getElementById("feedback-behaviours").value,
      behavioursShown: !document.getElementById("feedback-behaviours-field").hidden,
      readonly: document.getElementById("feedback-behaviours").readOnly,
      visibility: dialog.querySelector("input[name=visibility]:checked").value,
      nameShown: !document.getElementById("feedback-name-field").hidden,
    };
  });
  check(opened.open && opened.locator.includes(" > ") && opened.behavioursShown
    && opened.readonly && opened.visibility === "private" && !opened.nameShown,
    "the dialog opens on the paragraph, names its behaviours, and defaults to private",
    JSON.stringify(opened));

  // Choosing to be named is the only thing that asks for a name.
  await page.locator('#feedback-dialog input[name=visibility][value="attributed"]').check();
  const named = await page.evaluate(() =>
    !document.getElementById("feedback-name-field").hidden);
  check(named, "choosing to be named asks for the name", String(named));

  await page.locator('#feedback-dialog input[name=visibility][value="private"]').check();
  await page.locator("#feedback-comment").fill("The panel read this as authority.");
  await page.locator("#feedback-email").fill("reader@example.org");
  await page.locator('#feedback-dialog .thumb[data-vote="down"]').click();
  await page.locator("#feedback-send").click();
  await page.waitForTimeout(400);
  const sentBody = readLastFeedback();
  check(Boolean(sentBody) && sentBody.email === "reader@example.org"
    && sentBody.vote === "down" && sentBody.display_name === ""
    && sentBody.visibility === "private" && sentBody.locator.includes(" > "),
    "what leaves the page is the paragraph, the thumb, the comment and the choice",
    JSON.stringify(sentBody));

  const remembered = await page.evaluate(() => localStorage.getItem("aci-feedback-email"));
  check(remembered === "reader@example.org",
    "the address is typed once and remembered after", String(remembered));
```

Import `readLastFeedback` at the top of the file from `./reader-routes.mjs`, beside whatever it already imports from there.

- [ ] **Step 7: Run the walker**

Run:
```bash
pnpm predev
node engine/verify-reader-features.mjs
```
Expected: every check prints `ok`, including the five added here, and the process exits 0. If Chrome is not available the walker says so and cannot be counted as passing: report that rather than treating a skip as a pass.

- [ ] **Step 8: Run every offline suite**

Run:
```bash
python3 -m unittest discover -s engine -p "test_*.py"
python3 -m unittest discover -s engine/panel -p "test_*.py"
python3 -m unittest discover -s tests
node --test app/lib/__tests__/*.test.mjs
```
Expected: `OK` from each unittest run and no failures from `node --test`.

- [ ] **Step 9: Commit**

```bash
git add site/spec-reader/app.js engine/reader-routes.mjs engine/verify-reader-features.mjs
git commit -m "$(cat <<'EOF'
feat: the feedback dialog sends, and the browser remembers the address

One dialog for the whole reader, filled per paragraph, for the reason the copy
toolbar is one: several hundred paragraphs would otherwise carry several hundred
forms and thousands of tab stops.

The address, the name to show and the choice about publication are kept in
localStorage, not sessionStorage: sessionStorage is cleared when the tab closes
and these are answers nobody should have to give again next week. They are kept
only once something was accepted, so an address refused as malformed is not
offered back.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLRKTYAnoVBUKA7J89iD54
EOF
)"
```

---

### Task 7: Reading them in the portal

**Files:**
- Modify: `app/lib/admin-data.mjs`
- Create: `app/admin/feedback/page.jsx`
- Create: `app/api/admin/feedback/route.js`
- Modify: `app/admin/layout.jsx`
- Modify: `app/lib/__tests__/admin-routes.test.mjs`

**Interfaces:**
- Consumes: `select` from `./supabase.mjs`; `formRoute`, `refuse` from `./admin-routes.mjs`; `requireOperator` from `../../auth.mjs`; `Outcome`, `When` from `../parts.jsx`.
- Produces: `feedback(limit, fetchImpl)` in `admin-data.mjs`; the page at `/admin/feedback`; `POST` at `/api/admin/feedback`.

- [ ] **Step 1: Write the failing test for the read**

Add to `app/lib/__tests__/feedback.test.mjs`, with `import { feedback as adminFeedback } from "../admin-data.mjs";` beside its other imports. It goes here rather than in `admin-routes.test.mjs`, which tests the route wrapper and imports no data module:

```javascript
test("the portal reads feedback newest first", async () => {
  let asked;
  const fetchImpl = async (url) => {
    asked = url;
    return { ok: true, status: 200, text: async () => "",
             json: async () => [{ id: "f1", locator: "a > b > ¶1" }] };
  };
  const rows = await adminFeedback(50, fetchImpl);
  assert.equal(rows.length, 1);
  assert.match(asked, /aci_feedback\?select=\*&order=created_at\.desc&limit=50/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test app/lib/__tests__/feedback.test.mjs`
Expected: FAIL, no export named `feedback` from `../admin-data.mjs`.

- [ ] **Step 3: Add the read**

In `app/lib/admin-data.mjs`, beside `submissions`:

```javascript
/** What readers said about paragraphs, newest first. */
export async function feedback(limit = 50, fetchImpl = fetch) {
  return select("aci_feedback", `select=*&order=created_at.desc&limit=${limit}`, fetchImpl);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test app/lib/__tests__/feedback.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write the status route**

Create `app/api/admin/feedback/route.js`:

```javascript
/* Moving a piece of feedback's state. That is the whole of what the portal does
 * to one: there is nothing to accept, because nothing here asked us to run
 * anything. Marking it actioned says somebody did something about it. */
import { update } from "../../../lib/supabase.mjs";
import { requireOperator } from "../../../auth.mjs";
import { formRoute, refuse } from "../../../lib/admin-routes.mjs";

const STATES = ["new", "read", "actioned", "declined"];

export const POST = formRoute("/admin/feedback", requireOperator, async (fields) => {
  const id = fields.one("feedback_id");
  const status = fields.one("status");
  if (!id) refuse("no feedback named");
  if (!STATES.includes(status)) refuse(`state must be one of ${STATES.join(", ")}`);
  const [row] = await update("aci_feedback", `id=eq.${id}`, { status });
  if (!row) refuse("no such feedback");
  return `Marked ${status}.`;
});
```

- [ ] **Step 6: Write the page**

Create `app/admin/feedback/page.jsx`:

```jsx
/* What readers said about paragraphs.
 *
 * Nothing here is displayed on the site, whatever a reader permitted: the
 * visibility column records consent, and showing any of it is a separate
 * decision with its own surface. What this page is for is reading them, and
 * saying which have been acted on. */
import { feedback } from "../../lib/admin-data.mjs";
import { Outcome, When } from "../parts.jsx";

const NEXT = {
  new: ["read", "declined"],
  read: ["actioned", "declined"],
  actioned: ["read"],
  declined: ["read"],
};

const THUMB = { up: "thumb up", down: "thumb down" };

const SHOWN = {
  private: "private",
  anonymous: "may be shown, unnamed",
  attributed: "may be shown, named",
};

/* A link that opens the reader at the paragraph, the way a copied link does. */
function readerLink(row) {
  const query = new URLSearchParams({ passage: row.locator });
  if (row.publication_id) query.set("publication", row.publication_id);
  return `/spec-reader/?${query}`;
}

export default async function Feedback({ searchParams }) {
  const params = await searchParams;
  const rows = await feedback();
  const waiting = rows.filter(row => row.status === "new").length;

  return (
    <section>
      <h2>Feedback</h2>
      <p className="why">
        What readers said about single paragraphs, through the dialog in the spec
        reader. None of it is shown on the site: the visibility column is what a
        reader permitted, not what has been published. {waiting} waiting to be read.
      </p>
      <Outcome done={params?.done} problem={params?.problem} />

      {rows.length === 0 ? <p className="empty">Nobody has said anything yet.</p> : (
        <table>
          <thead>
            <tr>
              <th>Arrived</th><th>Paragraph</th><th>Said</th><th>May be shown</th>
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
                <td style={{ maxWidth: "30ch" }}>
                  <a className="mono" href={readerLink(row)}>{row.locator}</a>
                  {row.behaviours?.length > 0 && (
                    <div style={{ color: "var(--faint)", marginTop: 4 }}>
                      {row.behaviours.join(", ")}
                    </div>
                  )}
                </td>
                <td style={{ maxWidth: "42ch" }}>
                  {row.vote && (
                    <div className="mono" style={{ marginBottom: 4 }}>{THUMB[row.vote]}</div>
                  )}
                  {row.comment}
                </td>
                <td>
                  {SHOWN[row.visibility] || row.visibility}
                  {row.display_name && (
                    <>
                      <br />
                      <span style={{ color: "var(--faint)" }}>as {row.display_name}</span>
                    </>
                  )}
                </td>
                <td><span className={`state ${row.status === "new" ? "pending" : "done"}`}>
                  {row.status}
                </span></td>
                <td>
                  {(NEXT[row.status] || []).map(to => (
                    <form key={to} method="post" action="/api/admin/feedback">
                      <input type="hidden" name="feedback_id" value={row.id} />
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

- [ ] **Step 7: Add the nav entry**

In `app/admin/layout.jsx`, after `["/admin/submissions", "Proposals"],` add:

```jsx
  ["/admin/feedback", "Feedback"],
```

- [ ] **Step 8: Build and check the page renders**

Run: `pnpm build`
Expected: the build completes and the route list includes `/admin/feedback` and `ƒ /api/admin/feedback`.

Then, with the environment's Supabase variables set (they are in `.env`), run `pnpm dev` and open `http://127.0.0.1:3000/admin/feedback`. Expected: the page renders, signed in as an operator, and says "Nobody has said anything yet." if Task 1 has been pushed and no feedback exists yet. If Task 1's migration has not been applied, the page will fail on a missing table: that is the expected failure, and it is the check that Task 1 is done.

- [ ] **Step 9: Commit**

```bash
git add app/lib/admin-data.mjs app/admin/feedback/page.jsx app/api/admin/feedback/route.js \
        app/admin/layout.jsx app/lib/__tests__/feedback.test.mjs
git commit -m "$(cat <<'EOF'
feat: read a reader's feedback in the portal

Newest first, each row linking into the reader at the paragraph it is about, so
reading one means seeing what the reader saw. The visibility column says what
was permitted, not what has been published: nothing here is shown on the site,
and showing any of it is a separate decision with its own surface.

There is nothing to accept, because nothing here asked us to run anything. The
states are read, actioned and declined.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLRKTYAnoVBUKA7J89iD54
EOF
)"
```

---

### Task 8: Saying so in the documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `site/OVERVIEW.md`
- Modify: `site/spec-reader/README.md`
- Modify: `engine/OVERVIEW.md`
- Modify: `.github/workflows/ci.yml` (the comment listing the app.js harnesses)

**Interfaces:**
- Consumes: everything built. Produces: nothing code depends on.

- [ ] **Step 1: Record the divergence in `CLAUDE.md`**

Under `## Changes of substance we made`, after the section `### A publication is built before it is shown`, add:

```markdown
### A reader can answer a paragraph

The index says things about paragraphs, and every one of them is a panel's
reading. `aci_feedback` is where a reader disagrees: a third icon beside the two
copy icons on every paragraph, cited or not, opening a dialog that takes a
comment, a thumb, or both. `/api/feedback` is the second route open to the
internet that writes, and carries the proposal form's guards for the same
reasons: a honeypot, thirty per source per hour counted against the table
itself, a cap on every field, and a size cap read from Content-Length before the
body is buffered.

Three things it does deliberately. The behaviours it shows are the intersection,
not the menu: of the behaviours ticked in the sidebar, the ones citing that
paragraph, which is the set colouring the text in front of the reader. The
publication is resolved by the route rather than taken from the page, because a
locator names the text and carries its version but the reading laid over it is a
publication's; `publication_id` carries no foreign key, so a publication archived
by a cleanup migration does not take a reader's words with it. And what a reader
permits is one explicit choice of three -- private, anonymous, attributed -- with
private the default and stated in words rather than implied by an empty box.

The address is never public at any of the three. What `attributed` shows is a
name the reader types for the purpose, because an address published as given is
harvested within days and that is a cost we would be imposing on somebody who did
us a favour. The name is required when `attributed` is chosen, in the form and
again as a check constraint, so choosing to be named and leaving it blank is
refused rather than quietly published as anonymous.

Nothing is displayed yet, and that is the point of recording consent now: the
surface, when it exists, will be built from what readers actually permitted. The
design is `docs/superpowers/specs/2026-09-16-feedback-on-a-paragraph-design.md`;
the table is `20260916140000_aci_feedback.sql` in `polaris-supabase`.
```

- [ ] **Step 2: Update `site/OVERVIEW.md`**

Its first paragraph lists the routes the site fetches. Add `/api/feedback` to that list as the one route the reader posts to, and add a row to the file's table for the reader saying it carries the feedback dialog. Read the file first and match its sentence shapes.

- [ ] **Step 3: Update `site/spec-reader/README.md`**

This file is stale in places (it still describes `data/behaviours.json` and a manifest, both gone). Do not rewrite it here; that is separate work. Add one section at its end:

```markdown
## Saying something about a paragraph
Every paragraph carries three icons, revealed on hover, on focus or on a tap:
copy its locator, copy a link to it, and say what you think of it. The third
opens a dialog that takes a comment, a thumb, or both, with the paragraph's
locator and the behaviours highlighting it shown but not editable, and one choice
of three about who may see what was said: private, without my name, or with a
name you type. Private is the default. The address is required, is used to write
back, and is never shown on the site at any of the three.

It posts to `/api/feedback`, the one route this page writes to. The address, the
name and the choice are remembered in `localStorage` after the first accepted
send. Nothing is displayed anywhere yet.
```

- [ ] **Step 4: Update `engine/OVERVIEW.md` and the CI comment**

In `engine/OVERVIEW.md`, add `test_appjs_feedback.js` wherever the other `test_appjs_*.js` harnesses are listed.

In `.github/workflows/ci.yml`, the comment above the panel step lists the harnesses by name: add `_feedback` to that list. The command itself does not change, because discovery picks up the new `TestAppJSFeedback` class on its own.

- [ ] **Step 5: Check nothing else names what changed**

Run:
```bash
grep -rn "COPY_ICONS" site engine tests
grep -rn "recentFrom" app
```
Expected: `COPY_ICONS` appears only in `app.js`, inside the definition and inside `PASSAGE_ICONS`; `recentFrom` appears in `submissions.mjs`, `feedback.mjs`, `app/api/submit/route.js` and the two test files, and every call passes arguments in the order `(hash, fetchImpl, table)`.

- [ ] **Step 6: Run everything one last time**

Run:
```bash
python3 -m unittest discover -s engine -p "test_*.py"
python3 -m unittest discover -s engine/panel -p "test_*.py"
python3 -m unittest discover -s tests
node --test app/lib/__tests__/*.test.mjs
pnpm build
```
Expected: `OK` from each unittest run, no failures from `node --test`, and a completed build. Report the actual output; a suite that was not run is not a suite that passed.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md site/OVERVIEW.md site/spec-reader/README.md engine/OVERVIEW.md \
        .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
docs: record that a reader can answer a paragraph

CLAUDE.md carries the three choices worth knowing about: the behaviours shown
are the intersection and not the menu, the publication is resolved by the route
because a locator names the text but not the reading laid over it, and what a
reader permits is one explicit choice of three with private stated rather than
implied.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLRKTYAnoVBUKA7J89iD54
EOF
)"
```

---

## When it is done

The branch carries eight commits here and one PR in `polaris-supabase`. Before
calling it finished:

- the migration is applied (Task 1, Step 5) and its output was read, not assumed;
- `/admin/feedback` renders against the real table;
- the walker passed with Chrome present, not skipped;
- a real send was made through `pnpm dev` against the deployed Supabase, and the
  row is visible in `/admin/feedback` with its publication id filled in.

That last one is the only check that exercises the whole path at once, and it is
the one worth doing by hand.
