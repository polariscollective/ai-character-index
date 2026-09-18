# The reader loads what the URL asks for: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the reader only what its address names, cutting a page load from 7425 KB to roughly 480 KB, without changing a byte of what a publication stores.

**Architecture:** The three reader routes already hand their whole `searchParams` to `readerResponse`, so `spec`, `behavior` and `compare-with` arrive there today and are ignored. The slicing rules go in a new `app/lib/slice.mjs`, the publication column is resolved to an id and held once per id, and the client fetches at four moments and merges rather than replaces.

**Tech Stack:** Node 20 with `node:test`, Next.js route handlers, framework-free JavaScript in `site/spec-reader/app.js`, PostgREST through `app/lib/supabase.mjs`.

## Global Constraints

- No long dashes anywhere: not in code, comments, commit messages or documents. The doubled ASCII `--` used as prose punctuation is this repository's established style and is correct.
- Everything written into a repository is in English, including commit messages.
- Nothing that a publication stores changes. No migration, no touch to `engine/publish.py`, the builders, or `engine/verify_supabase_provenance.py`.
- The assembly and the knowledge of what links look like live in one place each. Slicing rules go in `app/lib/slice.mjs`, never duplicated into a route.
- Route tests run with `npm run test:routes` and inject `fetch`; no test touches a network.
- A test file that reaches `select()` must set `process.env.SUPABASE_URL` and `process.env.SUPABASE_SERVICE_ROLE_KEY` itself, or it passes only in a shell that happens to carry them.
- Spec: `docs/superpowers/specs/2026-09-18-the-reader-loads-what-the-url-asks-for-design.md`.
- End every commit message with exactly:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DrosviAgufvq3UjRcuZpAT
  ```

## File structure

| file | responsibility |
|---|---|
| `app/lib/slice.mjs` | new. Given a column's payload and the URL's parameters, return the slice. Knows the shape of each of the three columns and nothing about HTTP or the database. |
| `app/lib/publications.mjs` | resolves a pin or the current publication to an id, holds each column by id, and calls the slicer. |
| `app/lib/feedback.mjs` | untouched, but named because it is the seam's second consumer: `resolvePublication` calls `publicationColumn("id", ...)` twice, lines 140 and 143. Only `readerResponse` is sliced, so feedback keeps whole columns, but a change to that seam reaches here and its tests. |
| `engine/reader-routes.mjs` | answers `/api/reader/links` from a fixture, so the browser walkers stop exercising the failure path. |
| `site/spec-reader/app.js` | fetches at four moments and merges; writes an empty `behavior` rather than deleting it; validates a requested slug against the registry. |

---

### Task 1: a publication is resolved to an id, and held by it

**Files:**
- Modify: `app/lib/publications.mjs`
- Test: `app/lib/__tests__/publications.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `resolvePublicationId(pin, fetchImpl)` returning an id string or null, and `publicationColumn(column, id, fetchImpl)` unchanged in signature but reading by resolved id and holding the result.

**Why this comes first.** `currentPublication()` is `order=published_at.desc&limit=1`, so the unpinned path fetches a column without ever learning which publication it served. Holding a column "by publication id" is therefore impossible until the id is resolved separately. Every later task depends on this.

- [ ] **Step 1: Write the failing tests**

Add to `app/lib/__tests__/publications.test.mjs`, reusing the `stub(rows, status)` helper at line 15 and the `ID` constant at line 10:

```javascript
test("an unpinned read resolves which publication it is serving, then reads it by id", async () => {
  const { calls, fetchImpl } = stub([{ id: ID }]);
  const got = await resolvePublicationId(null, fetchImpl);
  assert.equal(got, ID);
  assert.match(calls[0].url, /select=id/);
  assert.match(calls[0].url, /order=published_at\.desc/);
});

test("a pin is its own answer and costs no request", async () => {
  const { calls, fetchImpl } = stub([]);
  assert.equal(await resolvePublicationId(ID, fetchImpl), ID);
  assert.equal(calls.length, 0);
});

test("nothing published yet resolves to null", async () => {
  const { fetchImpl } = stub([]);
  assert.equal(await resolvePublicationId(null, fetchImpl), null);
});

test("a column is fetched once per publication and held", async () => {
  const { calls, fetchImpl } = stub([{ payload: { ok: 1 } }]);
  const first = await publicationColumn("payload", ID, fetchImpl);
  const second = await publicationColumn("payload", ID, fetchImpl);
  assert.deepEqual(first, { ok: 1 });
  assert.deepEqual(second, { ok: 1 });
  assert.equal(calls.length, 1, "the second read came from memory");
});
```

Add `resolvePublicationId` to the import list at the head of that file.

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test app/lib/__tests__/publications.test.mjs`
Expected: FAIL. `resolvePublicationId` is not exported, and `publicationColumn` fetches twice.

- [ ] **Step 3: Write the resolver and the hold**

In `app/lib/publications.mjs`, replace `publicationColumn` with:

```javascript
/**
 * Which publication a request is about, as an id.
 *
 * A pin is already the answer. Without one, the current publication has to be
 * asked for by name before its bytes can be, because currentPublication() is an
 * ordering and not an address: it says "the newest public one" and the caller
 * never learns which that was. Holding a column by publication id is impossible
 * until this runs, which is why it exists.
 */
export async function resolvePublicationId(pin, fetchImpl = fetch) {
  if (pin) return pin;
  const rows = await select("aci_publications",
                            `select=id&${currentPublication()}`, fetchImpl);
  return rows.length ? rows[0].id : null;
}

/* The bytes of an existing publication never change, so a column of one can be
 * held. Existence is another matter and is rechecked on every request: a
 * publication can be deleted, and has been, by the cleanup migration that
 * removed one withdrawn for carrying wrong figures. Holding without rechecking
 * would let a warm instance go on serving a publication an operator believes
 * gone, which is the one failure this index cannot afford. So the hold is of
 * bytes only, behind a resolution that runs every time.
 *
 * Capped, because these columns are megabytes and a serverless instance that
 * lived through a dozen publications would hold all of them. Three is two more
 * than the reader needs: the current publication, and whatever pin someone is
 * looking at. */
const HELD = new Map();
const HOLD = 3;

export async function publicationColumn(column, id, fetchImpl = fetch) {
  const resolved = await resolvePublicationId(id, fetchImpl);
  if (resolved === null) return null;
  const key = `${resolved}\n${column}`;
  if (!HELD.has(key)) {
    const rows = await select("aci_publications",
                              `id=eq.${resolved}&select=${column}`, fetchImpl);
    if (HELD.size >= HOLD) HELD.delete(HELD.keys().next().value);
    HELD.set(key, rows.length ? rows[0][column] : null);
  }
  return HELD.get(key);
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:routes`, then again as `env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY npm run test:routes`. Both must pass.
Expected: PASS. Watch in particular that the pre-existing tests of `readerResponse` still pass: they stub one row and now provoke two fetches on an unpinned read, so any that assert on `calls.length` or on `calls[0].url` need their expectation moved to the second call rather than loosened away.

- [ ] **Step 5: Commit**

```bash
git add app/lib/publications.mjs app/lib/__tests__/publications.test.mjs
git commit -m "feat: a publication column is read once per publication id"
```

---

### Task 2: the slicer

**Files:**
- Create: `app/lib/slice.mjs`
- Test: `app/lib/__tests__/slice.test.mjs`

**Interfaces:**
- Consumes: nothing. This file is pure: payload in, payload out, no fetch and no database.
- Produces: `sliceColumn(column, payload, wanted)` where `wanted` is `{documents: Set|null, behaviours: Set|null}`. A null set means "everything", which is what a caller with no such parameter asks for.

**The shapes it must know.** `payload` is `{generatedFrom, provenance, behaviours: [{slug, ...}]}`. `documents` is `{documents: [{id, ...}]}`. `links` is `{documents, runs, byLocator, comparisons, notes: {passage, depth, standing}}`, where a `byLocator` key is a locator whose head before `" > "` names its document, each value is a list of rows carrying a `behaviours` array, and a `comparisons` or `notes.passage` key is newline separated, beginning with a behaviour slug and ending with two document ids.

- [ ] **Step 1: Write the failing tests**

Create `app/lib/__tests__/slice.test.mjs`:

```javascript
/**
 * Cutting a frozen column down to what an address names. Pure: no fetch here.
 * Run: npm run test:routes
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sliceColumn } from "../slice.mjs";

const A = "anthropic--constitution@2026-01-20";
const B = "openai--model-spec@2026-08-18";
const all = { documents: null, behaviours: null };

test("a null set means everything, which is what no parameter asks for", () => {
  const payload = { behaviours: [{ slug: "helpfulness" }, { slug: "no-sycophancy" }] };
  assert.deepEqual(sliceColumn("payload", payload, all), payload);
});

test("the payload keeps only the behaviours named, and its other keys", () => {
  const payload = { provenance: { runDate: "2026-09-18" },
                    behaviours: [{ slug: "helpfulness" }, { slug: "no-sycophancy" }] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(out.behaviours, [{ slug: "helpfulness" }]);
  assert.deepEqual(out.provenance, { runDate: "2026-09-18" });
});

test("the documents column keeps only the documents named", () => {
  const documents = { documents: [{ id: A, markdown: "a" }, { id: B, markdown: "b" }] };
  const out = sliceColumn("documents", documents, { documents: new Set([A]), behaviours: null });
  assert.deepEqual(out.documents, [{ id: A, markdown: "a" }]);
});

test("byLocator keeps the locators of the documents shown", () => {
  const links = { byLocator: { [`${A} > s > ¶1`]: [{ behaviours: ["helpfulness"] }],
                               [`${B} > s > ¶1`]: [{ behaviours: ["helpfulness"] }] },
                  comparisons: {}, notes: { passage: {}, depth: {}, standing: {} } };
  const out = sliceColumn("links", links, { documents: new Set([A]), behaviours: null });
  assert.deepEqual(Object.keys(out.byLocator), [`${A} > s > ¶1`]);
});

test("a row belonging to several behaviours survives if any one is asked for", () => {
  const links = { byLocator: { [`${A} > s > ¶1`]: [
                    { id: 1, behaviours: ["helpfulness", "no-sycophancy"] },
                    { id: 2, behaviours: ["user-autonomy"] }] },
                  comparisons: {}, notes: { passage: {}, depth: {}, standing: {} } };
  const out = sliceColumn("links", links, { documents: null, behaviours: new Set(["no-sycophancy"]) });
  assert.deepEqual(out.byLocator[`${A} > s > ¶1`], [{ id: 1, behaviours: ["helpfulness", "no-sycophancy"] }]);
});

test("a locator left with no row at all is dropped rather than left empty", () => {
  const links = { byLocator: { [`${A} > s > ¶1`]: [{ behaviours: ["user-autonomy"] }] },
                  comparisons: {}, notes: { passage: {}, depth: {}, standing: {} } };
  const out = sliceColumn("links", links, { documents: null, behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(out.byLocator, {});
});

test("a comparison is kept when its behaviour is asked for and both its documents are shown", () => {
  const key = `helpfulness\n${A}\n${B}`;
  const other = `helpfulness\n${A}\nalibaba--model-spec@2026-04-00`;
  const links = { byLocator: {}, comparisons: { [key]: { text: "yes" }, [other]: { text: "no" } },
                  notes: { passage: {}, depth: {}, standing: {} } };
  const out = sliceColumn("links", links,
                          { documents: new Set([A, B]), behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(Object.keys(out.comparisons), [key]);
});

test("the depth and standing paragraphs travel whole, being 87 KB in all", () => {
  const links = { byLocator: {}, comparisons: {},
                  notes: { passage: {}, depth: { a: 1 }, standing: { b: 2 } } };
  const out = sliceColumn("links", links, { documents: new Set([A]), behaviours: new Set(["x"]) });
  assert.deepEqual(out.notes.depth, { a: 1 });
  assert.deepEqual(out.notes.standing, { b: 2 });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test app/lib/__tests__/slice.test.mjs`
Expected: FAIL with a module not found error for `../slice.mjs`.

- [ ] **Step 3: Write the slicer**

Create `app/lib/slice.mjs`:

```javascript
/**
 * What an address asks for, cut out of what a publication froze.
 *
 * The reader downloads 7425 KB and shows a fraction of it: linkBubbles already
 * filters to the pair on screen and the ticked behaviours, and the panel shows
 * one document or two. This is that same narrowing, done before the bytes leave
 * the server instead of after they arrive.
 *
 * Pure by design. It knows the shape of the three columns and nothing about
 * HTTP or the database, so it can be tested with object literals, and the
 * knowledge of what links look like stays in one place rather than being spelt
 * out again in a route.
 *
 * A null set means everything. That is what a caller with no such parameter is
 * asking for, and it keeps the unsliced case free rather than special.
 */

const documentOf = locator => String(locator).split(" > ")[0];

/* comparisons and notes.passage are keyed with newlines: the behaviour first,
 * the two documents last, and for a passage note its locator in between. */
const partsOf = key => String(key).split("\n");

function sliceLinks(links, { documents, behaviours }) {
  const shown = id => !documents || documents.has(id);
  const asked = slugs => !behaviours || (slugs || []).some(slug => behaviours.has(slug));

  const byLocator = {};
  for (const [locator, rows] of Object.entries(links.byLocator || {})) {
    if (!shown(documentOf(locator))) continue;
    const kept = rows.filter(row => asked(row.behaviours));
    if (kept.length) byLocator[locator] = kept;
  }

  const pairKept = key => {
    const parts = partsOf(key);
    return asked([parts[0]]) && parts.slice(-2).every(shown);
  };
  const keep = table => Object.fromEntries(
    Object.entries(table || {}).filter(([key]) => pairKept(key)));

  return {
    ...links,
    byLocator,
    comparisons: keep(links.comparisons),
    notes: {
      ...links.notes,
      passage: keep(links.notes?.passage),
    },
  };
}

export function sliceColumn(column, payload, wanted) {
  if (payload === null || payload === undefined) return payload;
  const { documents, behaviours } = wanted;
  if (column === "payload") {
    if (!behaviours) return payload;
    return { ...payload,
             behaviours: (payload.behaviours || []).filter(b => behaviours.has(b.slug)) };
  }
  if (column === "documents") {
    if (!documents) return payload;
    return { ...payload,
             documents: (payload.documents || []).filter(d => documents.has(d.id)) };
  }
  if (column === "links") return sliceLinks(payload, wanted);
  return payload;
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:routes`, then `env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY npm run test:routes`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/slice.mjs app/lib/__tests__/slice.test.mjs
git commit -m "feat: a slicer that cuts a column down to what an address names"
```

---

### Task 3: the routes serve the slice

**Files:**
- Modify: `app/lib/publications.mjs` (`readerResponse`)
- Test: `app/lib/__tests__/publications.test.mjs`

**Interfaces:**
- Consumes: `sliceColumn(column, payload, wanted)` from Task 2, `publicationColumn` from Task 1.
- Produces: `readerResponse(column, searchParams, fetchImpl)` unchanged in signature and in its 400, 404 and 200 behaviour, now returning the slice the parameters name.

**No route file changes.** Each of the three is the same three lines handing its whole `searchParams` to `readerResponse`. The parameters already arrive; they are simply ignored today.

- [ ] **Step 1: Write the failing tests**

Add to `app/lib/__tests__/publications.test.mjs`:

```javascript
test("readerResponse returns only the behaviours the address names", async () => {
  const { fetchImpl } = stub([{ id: ID }, { payload: {
    behaviours: [{ slug: "helpfulness" }, { slug: "no-sycophancy" }] } }]);
  const out = await readerResponse("payload",
    new URLSearchParams(`publication=${ID}&behavior=helpfulness`), fetchImpl);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.behaviours, [{ slug: "helpfulness" }]);
});

test("with no behavior parameter the whole column is served, as before", async () => {
  const whole = { behaviours: [{ slug: "helpfulness" }, { slug: "no-sycophancy" }] };
  const { fetchImpl } = stub([{ payload: whole }]);
  const out = await readerResponse("payload", new URLSearchParams(`publication=${ID}`), fetchImpl);
  assert.deepEqual(out.body, whole);
});

test("an empty behavior parameter names no behaviour, which is not the same as none given", async () => {
  const { fetchImpl } = stub([{ payload: {
    behaviours: [{ slug: "helpfulness" }] } }]);
  const out = await readerResponse("payload",
    new URLSearchParams(`publication=${ID}&behavior=`), fetchImpl);
  assert.deepEqual(out.body.behaviours, []);
});
```

The stub returns the same rows for every call, so where a test needs the resolver and the column to answer differently, pin the publication so the resolver costs no request.

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test app/lib/__tests__/publications.test.mjs`
Expected: FAIL. `readerResponse` returns the whole column.

- [ ] **Step 3: Read the parameters and slice**

In `app/lib/publications.mjs`, add the import at the head beside `select`:

```javascript
import { sliceColumn } from "./slice.mjs";
```

and in `readerResponse`, between the 404 branch and the return:

```javascript
  /* The reader has always said what it wants in its own URL: spec, behavior and
   * compare-with are written by syncURL on every interaction and read back on
   * arrival. They arrive here already; until now they were ignored. A parameter
   * that is absent means everything, and a parameter that is present and empty
   * means nothing, which are different answers and both worth honouring. */
  const list = name => {
    const raw = searchParams.get(name);
    return raw === null ? null : raw.split(",").map(s => s.trim()).filter(Boolean);
  };
  const specs = list("spec");
  const pair = list("compare-with");
  const shown = specs === null && pair === null
    ? null
    : new Set([...(specs || []), ...(pair || [])]);
  const slugs = list("behavior");

  const body = sliceColumn(column, payload,
                           { documents: shown, behaviours: slugs && new Set(slugs) });
```

and return `body` in place of `payload`.

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:routes`, then `env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY npm run test:routes`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/publications.mjs app/lib/__tests__/publications.test.mjs
git commit -m "feat: a reader route serves the slice its address names"
```

---

### Task 4: the fixture server answers the links route

**Files:**
- Modify: `engine/reader-routes.mjs`
- Create: `tests/fixtures/reader/links.json`
- Create: `tests/fixtures/reader/draft/links.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `/api/reader/links` answered from `links.json`, so the three browser walkers exercise a reader that has bubbles instead of one that swallowed a 404.

**Why it belongs here and not after.** `engine/reader-routes.mjs` answers `documents` and `payload` and returns 404 for anything else, so `loadReaderLinks` has always failed in the walkers and the reader has always rendered its no-bubbles fallback there. Tasks 5 and 6 add three more fetch moments to that same unexercised path. All three walkers, `verify-reader-test.mjs`, `verify-reader-features.mjs` and `verify-reader-locators.mjs`, call `serveReaderRoute` with the same signature, so one change reaches all of them.

- [ ] **Step 1: Write the fixtures**

The reader reads four things out of this payload and nothing else: `comparisons[key]`, `notes.depth`, `notes.standing` and `byLocator`. `tests/fixtures/reader/links.json`:

```json
{
  "documents": ["defined--document@2026-01-01", "other--document@2026-01-01"],
  "runs": ["11111111-1111-4111-8111-111111111111"],
  "byLocator": {
    "defined--document@2026-01-01 > A section > ¶1": [
      {
        "relation": "same",
        "comment": "The other document says this too, in the same words.",
        "behaviours": ["defined-behaviour"],
        "settled": true,
        "judge": "fixture",
        "to": "other--document@2026-01-01 > A section > ¶1"
      }
    ]
  },
  "comparisons": {
    "defined-behaviour\ndefined--document@2026-01-01\nother--document@2026-01-01": {
      "text": "The two documents agree on this behaviour."
    }
  },
  "notes": {
    "passage": {
      "defined-behaviour\ndefined--document@2026-01-01 > A section > ¶1\ndefined--document@2026-01-01\nother--document@2026-01-01": {
        "text": "In short, they agree."
      }
    },
    "depth": { "defined-behaviour\ndefined--document@2026-01-01": { "text": "Depth reads 3." } },
    "standing": { "defined-behaviour\ndefined--document@2026-01-01": { "text": "Where this document stands." } }
  }
}
```

Copy the same file to `tests/fixtures/reader/draft/links.json`, changing the comparison text to `"The draft says something else."` so a test can tell the two publications apart, which is what `DRAFT_PUBLICATION` exists for.

Check the document ids against `tests/fixtures/reader/documents.json` before writing, and use whatever ids that file actually carries rather than the ones above.

- [ ] **Step 2: Teach the route**

In `engine/reader-routes.mjs`, the file table currently reads:

```javascript
  const file = which === "documents" ? "documents.json"
    : which === "payload" ? `${name}.json`
    : null;
```

Extend it:

```javascript
  const file = which === "documents" ? "documents.json"
    : which === "links" ? "links.json"
    : which === "payload" ? `${name}.json`
    : null;
```

Then correct the docstring above `serveReaderRoute`, which says it answers two routes, and the file's own opening line, which says "The reader's two routes". They answer three now, plus the behaviours branch.

- [ ] **Step 3: Check a walker now sees bubbles**

Run: `node engine/verify-reader-test.mjs 2>&1 | tail -20`
Expected: the walk completes. Before this change `loadReaderLinks` caught a 404 and set `linkRows` to null; it now has a row. If a walker asserts a count that this fixture changes, update that assertion rather than the fixture, and say which in your report.

- [ ] **Step 4: Commit**

```bash
git add engine/reader-routes.mjs tests/fixtures/reader/links.json tests/fixtures/reader/draft/links.json
git commit -m "fix: the fixture server answers the links route the reader asks for"
```

---

### Task 5: an index of which behaviour cites which paragraph

**Files:**
- Modify: `app/lib/slice.mjs`
- Modify: `app/lib/publications.mjs`
- Test: `app/lib/__tests__/slice.test.mjs`

**Interfaces:**
- Consumes: `sliceColumn` from Task 2.
- Produces: `citationIndex(payload)` returning `{locator: [numeric_id, ...]}`, served on the payload column as `citedBy` whenever the payload is sliced.

**Why this task exists, and why it is not optional.** `openPassageLink` decides what a
`?passage=` link opens by reading `state.rawBehaviours` and looking inside
`behaviour.coverage[doc.id].passages` for the locator. It therefore needs to know which
behaviours cite a paragraph *before* it can decide what to load. Under a sliced payload it
would see only the behaviours the URL already named, find no citation, and open a shared
link to a cited paragraph as though it were an ordinary one: no bubble, no highlight, no
explanation. That is a visible regression on the one kind of link people actually pass
around.

The index answers it in 67 KB for 785 cited locators, using the numeric ids the registry
already carries, against the 914 KB payload it replaces for this purpose. It costs about
what one more behaviour costs and removes the regression entirely.

- [ ] **Step 1: Write the failing test**

Add to `app/lib/__tests__/slice.test.mjs`:

```javascript
test("the payload carries an index of which behaviours cite which locator", () => {
  const payload = { behaviours: [
    { slug: "helpfulness", numeric_id: 1,
      coverage: { [A]: { passages: [{ locator: `${A} > s > ¶1` }] } } },
    { slug: "no-sycophancy", numeric_id: 2,
      coverage: { [A]: { passages: [{ locator: `${A} > s > ¶1` }, { locator: `${A} > s > ¶2` }] } } },
  ] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(out.behaviours.map(b => b.slug), ["helpfulness"]);
  assert.deepEqual(out.citedBy, { [`${A} > s > ¶1`]: [1, 2], [`${A} > s > ¶2`]: [2] });
});

test("an unsliced payload carries no index, having no need of one", () => {
  const payload = { behaviours: [{ slug: "helpfulness", numeric_id: 1, coverage: {} }] };
  assert.equal(sliceColumn("payload", payload, all).citedBy, undefined);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test app/lib/__tests__/slice.test.mjs`
Expected: FAIL. `out.citedBy` is undefined.

- [ ] **Step 3: Build the index**

In `app/lib/slice.mjs`, add above `sliceColumn`:

```javascript
/**
 * Which behaviours cite which paragraph, by numeric id.
 *
 * A ?passage= link has to know this before it knows what to load: it opens the
 * document, ticks a behaviour that cites the paragraph, and reveals it. Reading
 * that out of the behaviours themselves works only while all of them are in
 * memory, which is exactly what slicing ends. 67 KB for 785 cited locators,
 * against the 914 KB payload it replaces for this one purpose.
 *
 * Numeric ids rather than slugs because the registry already carries them and
 * they are a third of the bytes.
 */
export function citationIndex(payload) {
  const index = {};
  for (const behaviour of payload.behaviours || []) {
    const id = behaviour.numeric_id;
    for (const coverage of Object.values(behaviour.coverage || {})) {
      for (const passage of coverage.passages || []) {
        (index[passage.locator] ||= []).push(id);
      }
    }
  }
  for (const ids of Object.values(index)) ids.sort((a, b) => a - b);
  return index;
}
```

and in `sliceColumn`'s payload branch, attach it when and only when the payload is sliced:

```javascript
  if (column === "payload") {
    if (!behaviours) return payload;
    return { ...payload,
             behaviours: (payload.behaviours || []).filter(b => behaviours.has(b.slug)),
             citedBy: citationIndex(payload) };
  }
```

The index is built from the whole payload before the filter, which is the point: it
describes behaviours the response does not carry.

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:routes`, then `env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY npm run test:routes`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/slice.mjs app/lib/__tests__/slice.test.mjs
git commit -m "feat: a sliced payload says which behaviours cite which paragraph"
```

---

### Task 6: the client asks for what it needs, when it needs it

**Files:**
- Modify: `site/spec-reader/app.js`

**Interfaces:**
- Consumes: the sliced routes from Task 3 and the `citedBy` index from Task 5.
- Produces: a reader that fetches at four moments and merges rather than replaces.

**A trap in the existing code, which this task must fix or it will silently drop
behaviours.** `setSelection` orders the new selection with
`payloadBehaviours().map(b => b.slug)`, which reads `state.payload.behaviours`, which
under slicing holds only what is loaded. Ticking a behaviour that is not yet in memory
would therefore filter it straight back out. The order has to come from the registry.

- [ ] **Step 1: Keep the registry's order, and a record of what is held**

Add beside `payloadUrl` near line 47:

```javascript
/* The address the routes slice by. A parameter left out means everything, which
 * is what an unpinned first load wants; a parameter present and empty means the
 * reader has asked for none. The routes read the difference. */
function sliceParams(pinned, { behaviours, specs } = {}) {
  const params = new URLSearchParams();
  if (pinned) params.set("publication", pinned);
  if (behaviours) params.set("behavior", behaviours.join(","));
  if (specs && specs.length) params.set("spec", specs.join(","));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/* Every behaviour slug the registry knows, in its order, which is not the same
 * as the order of the ones currently loaded. setSelection sorts by this: sorting
 * by the loaded payload would filter out the very behaviour just ticked. */
let registrySlugs = [];

/* What has already been asked for, so a second tick costs nothing and a fetch in
 * flight is not raced by its own repeat. Keyed by slug, holding the promise. */
const inFlight = new Map();
```

- [ ] **Step 2: Fetch a behaviour once, and merge what comes back**

```javascript
/* Bubbles arrive per behaviour and accumulate. Replacing would throw away the
 * ones already on screen, which is what a merge is for: byLocator gains rows,
 * the keyed tables gain keys, and a behaviour already held is not asked for
 * twice. */
function mergeLinks(into, extra) {
  if (!into) return extra;
  for (const [locator, rows] of Object.entries(extra.byLocator || {})) {
    into.byLocator[locator] = [...(into.byLocator[locator] || []), ...rows];
  }
  Object.assign(into.comparisons, extra.comparisons || {});
  Object.assign(into.notes.passage, extra.notes?.passage || {});
  return into;
}

async function ensureBehaviours(slugs) {
  const pinned = state.payloadSource?.origin === "pin" ? state.payloadSource.name : null;
  const missing = slugs.filter(slug => !inFlight.has(slug));
  if (!missing.length) return Promise.all(slugs.map(slug => inFlight.get(slug)));
  const shown = [...new Set([state.selectedSpec, ...(state.comparing ? comparePair() : [])])];
  const fetching = (async () => {
    const [payload, links] = await Promise.all([
      loadJSON(`${PAYLOAD_URL}${sliceParams(pinned, { behaviours: missing })}`),
      loadJSON(`${LINKS_URL}${sliceParams(pinned, { behaviours: missing, specs: shown })}`),
    ]);
    state.rawBehaviours = [...state.rawBehaviours, ...(payload.behaviours || [])];
    state.payload.behaviours =
      applyPanelThreshold({ behaviours: structuredClone(state.rawBehaviours) }).behaviours;
    linkRows = mergeLinks(linkRows, links);
  })();
  for (const slug of missing) inFlight.set(slug, fetching);
  return fetching;
}
```

- [ ] **Step 3: setSelection waits for what it is about to highlight**

`setSelection` is called from exactly three places: `toggleBehaviour` at line 1676, the
select-all button at 4092, and the clear button at 4094. It becomes asynchronous:

```javascript
async function setSelection(slugs) {
  const chosen = new Set(slugs);
  /* From the registry, not from the loaded payload: a behaviour ticked before it
   * is loaded is not in payloadBehaviours() yet, and sorting by that list would
   * drop it. */
  state.selectedSlugs = registrySlugs.filter(slug => chosen.has(slug));
  await ensureBehaviours(state.selectedSlugs);

  elements.behaviourList.querySelectorAll(".behaviour-check").forEach(input => {
    const on = chosen.has(input.dataset.behaviour);
    input.checked = on;
    input.closest(".behaviour-option").classList.toggle("checked", on);
  });
  updateBehaviourCount();
  syncURL();
  applyHighlights();
}
```

The three callers do not await it, deliberately: a tick should mark the box at once and
let the bubbles arrive, rather than freezing the menu on a network round trip. Say so in a
comment at each of the three, so the floating promise reads as a decision rather than an
oversight.

- [ ] **Step 4: The first load asks for what the URL named**

`initialize` awaits `loadBehaviours()` then a `Promise.all` of the other three. The
payload and links fetches gain the address, and the first draw waits for them. Insert the
load between `renderBehaviourList()` and `rebuildReader()` in the arrival path near line
4890, which is where the reader has read the URL but has not yet drawn.

- [ ] **Step 5: Check it by hand, because nothing else will**

Run `npm run dev` and open
`http://127.0.0.1:3000/spec-reader/?spec=<a document id>&behavior=<a slug>`.
Use `127.0.0.1` and not `localhost`: another project on this machine holds `[::1]:3000`,
and `localhost` resolves there first.
Expected: the page renders with that behaviour highlighted, and the network panel shows a
payload of tens of kilobytes rather than 914. Tick a second behaviour: one more request,
and the first behaviour's bubbles stay on screen. Tick it again after unticking: no
request at all.

- [ ] **Step 6: Commit**

```bash
git add site/spec-reader/app.js
git commit -m "feat: the reader fetches what its address names, and merges"
```

---

### Task 7: an empty selection survives a reload

**Files:**
- Modify: `site/spec-reader/app.js` (`syncURL` near line 535, the arrival rule near line 4871)

**Interfaces:**
- Consumes: Task 6.
- Produces: a URL that can say "no behaviours", and an arrival rule that validates a
  requested slug against the registry rather than against what happens to be loaded.

- [ ] **Step 1: Write the empty selection instead of deleting it**

`syncURL` reads:

```javascript
  if (state.selectedSlugs.length) params.set("behavior", state.selectedSlugs.join(","));
  else params.delete("behavior");
```

Deleting produces exactly the URL a fresh arrival produces, and the arrival rule opens on
the first behaviour when the parameter is absent. So unticking everything and reloading
comes back with a behaviour ticked. Replace with:

```javascript
  /* Absent and empty are different answers, and the arrival rule already reads
   * them as such: no parameter opens on the first behaviour, an empty one opens
   * on none. Deleting threw that difference away. */
  params.set("behavior", state.selectedSlugs.join(","));
```

- [ ] **Step 2: Validate against the registry**

The arrival rule filters `?behavior=` against `loaded`, which is
`state.payload.behaviours`. Sound while all thirteen are loaded, wrong the moment they are
not: a slug the URL legitimately names would be dropped without a word. Replace the filter
with the registry, which `loadBehaviourNotes` has already fetched and which is 1.8 KB:

```javascript
    const known = new Set(Object.keys(behaviourNotes || {}));
    const requested = (params.get("behavior") || "")
      .split(",")
      .map(slug => slug.trim())
      .filter(slug => known.has(slug) || loaded.some(behaviour => behaviour.slug === slug));
```

The `loaded` half of that test stays as a fallback: if the notes failed to arrive, a
reader that still honours the URL beats one that silently ignores it.

- [ ] **Step 3: Check the round trip by hand**

Run `npm run dev`, open `http://127.0.0.1:3000/spec-reader/`, untick every behaviour, copy
the URL from the address bar, reload it.
Expected: nothing is highlighted, and the URL carries `behavior=` with nothing after it.
Then delete the parameter entirely and reload: the first behaviour is selected.

- [ ] **Step 4: Commit**

```bash
git add site/spec-reader/app.js
git commit -m "fix: a reader that has chosen no behaviour can say so in its URL"
```

---

### Task 8: the record

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-18-the-reader-loads-what-the-url-asks-for-design.md`

- [ ] **Step 1: Write the entry**

Add an entry to `CLAUDE.md` under "Changes of substance we made", in that file's
established voice: a claim as a heading, then what was wrong, what was done, what it
costs. Read three neighbouring entries first and match their register.

It must carry the measured before and after, 7425 KB against roughly 480 KB; that nothing
a publication stores changed, because the digest describes stored bytes and what crosses
the wire is a projection of them; that the slicing lives in one file because a second copy
of the selection rules is what this repository has been burned by before; that the fixture
server learning the links route closed a gap the previous entry recorded as open; and the
citation index, with why a `?passage=` link needed it.

- [ ] **Step 2: Correct the spec where the code disagreed with it**

Two places. The spec says the server work is in `app/lib/publications.mjs`; it is in
`app/lib/slice.mjs` and `publications.mjs`, because the knowledge of what links look like
belongs with the links. And the spec calls the passage link one of four fetch moments,
which understates it: it is the one moment that needs to know before it can load, and the
citation index is what answers it.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-18-the-reader-loads-what-the-url-asks-for-design.md
git commit -m "docs: record that the reader loads what its URL asks for"
```
