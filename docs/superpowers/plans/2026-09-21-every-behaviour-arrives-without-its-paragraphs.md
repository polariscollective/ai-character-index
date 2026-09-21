# Every behaviour arrives, its paragraphs do not: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The reader opens with all thirteen behaviours in its sidebar, each with
its title, definition and depth figures, and downloads the paragraphs of only the
behaviours the address names.

**Architecture:** The server seam stops throwing whole entries away and starts
cutting inside them. `sliceColumn` keeps every behaviour and every document, and
removes `passages` from the coverage of behaviours nobody asked for and
`markdown`/`original` from documents nobody is reading. A cut cell is marked
`passagesWithheld`, which is a third answer beside "no coverage" and "no
passages". The reader learns that third answer in one helper, and its four
existing paragraph readers go through it.

**Tech Stack:** Plain ES modules under node (no bundler, no framework). Tests are
`node --test` for `app/lib`, and the text-extraction harnesses in `engine/panel`
for `site/spec-reader/app.js`, driven by `engine/panel/test_panel.py` under
`python3 -m unittest`.

## Global Constraints

- No long dashes anywhere: not in code, not in comments, not in commit messages.
- Everything written into the repository is in English.
- The marker field is spelled exactly `passagesWithheld`, a boolean, on the
  coverage entry. Nowhere else, under no other spelling.
- Absent, empty and withheld are three different claims. A withheld cell must
  never be serialised as `passages: []` on the wire.
- Nothing stored changes: no migration, no change to `publish.py`, the builders
  or `verify_supabase_provenance.py`.
- `citationIndex` must keep running over the whole, unsliced payload. It exists
  so a `?passage=` link can find a citing behaviour that was not requested, and
  building it after paragraphs are removed would silently empty it.
- The design is `docs/superpowers/specs/2026-09-21-every-behaviour-arrives-without-its-paragraphs-design.md`.

---

## File structure

| file | responsibility after this plan |
|---|---|
| `app/lib/slice.mjs` | cuts inside entries rather than between them, for both the payload and the documents column |
| `app/lib/__tests__/slice.test.mjs` | holds the three states apart, and pins that the slicer never writes into its input |
| `site/spec-reader/app.js` | one helper answering what a cell's paragraphs are; four existing readers go through it; the sidebar builds from the full set; `loadDocuments` passes its slice |
| `engine/panel/test_appjs_withheld.js` | new harness: the helper and the sidebar, extracted as text and driven against fixtures |
| `engine/panel/test_panel.py` | registers the new harness beside the eleven already there |
| `site/overview.js` | asks for the new shape. It reads no paragraphs, so it needs no guard |

`app/lib/publications.mjs` is not modified. It already parses `spec`, `behavior`
and `compare-with` and hands them to `sliceColumn`; what those words govern
changes underneath it.

---

### Task 1: The payload keeps every behaviour and withholds paragraphs

**Files:**
- Modify: `app/lib/slice.mjs:86-102`
- Test: `app/lib/__tests__/slice.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `sliceColumn("payload", payload, { documents, behaviours })` returns
  every behaviour. A behaviour in `behaviours` keeps `coverage[doc].passages`. A
  behaviour not in `behaviours` has `passages` removed from each of its coverage
  entries and gains `passagesWithheld: true` on each. `citedBy` is still added
  whenever `behaviours` is non-null.

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/__tests__/slice.test.mjs`:

```javascript
/* Three states, and the whole design rests on telling them apart. A behaviour
 * nobody asked for keeps its heading and its figures and loses its paragraphs,
 * which is not the same as a document it does not cover (no entry at all) and
 * not the same as a document it covers with nothing (an empty array). */
test("a behaviour nobody asked for keeps its coverage and loses its paragraphs", () => {
  const payload = { behaviours: [
    { id: 1, slug: "helpfulness", name: "Helpfulness", definition: "d1",
      coverage: { [A]: { depth: { mean: 2.7 }, substitutions: [{ seat: "fable" }],
                         passages: [{ locator: `${A} > s > ¶1` }] } } },
    { id: 2, slug: "no-sycophancy", name: "No sycophancy", definition: "d2",
      coverage: { [A]: { depth: { mean: 1.0 }, passages: [{ locator: `${A} > s > ¶2` }] } } },
  ] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set(["helpfulness"]) });

  assert.deepEqual(out.behaviours.map(b => b.slug), ["helpfulness", "no-sycophancy"],
                   "every behaviour is still listed");

  const asked = out.behaviours[0].coverage[A];
  assert.equal(asked.passages.length, 1, "the behaviour asked for keeps its paragraphs");
  assert.equal(asked.passagesWithheld, undefined, "and is not marked withheld");

  const withheld = out.behaviours[1].coverage[A];
  assert.equal(withheld.passagesWithheld, true, "the others are marked withheld");
  assert.equal("passages" in withheld, false, "and carry no passages key at all");
  assert.deepEqual(withheld.depth, { mean: 1.0 }, "the figure survives, which is the point");
});

test("a withheld cell keeps its recorded substitutions, which are a claim the index makes", () => {
  const payload = { behaviours: [
    { id: 1, slug: "helpfulness", name: "Helpfulness",
      coverage: { [A]: { depth: { mean: 2 }, substitutions: [{ seat: "fable", substitute: "opus" }],
                         passages: [{ locator: `${A} > s > ¶1` }] } } },
  ] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set() });
  assert.deepEqual(out.behaviours[0].coverage[A].substitutions, [{ seat: "fable", substitute: "opus" }]);
});

test("an empty behaviour set withholds every paragraph and still lists everyone", () => {
  const payload = { behaviours: [
    { id: 1, slug: "helpfulness", name: "Helpfulness",
      coverage: { [A]: { depth: { mean: 2 }, passages: [{ locator: `${A} > s > ¶1` }] } } },
  ] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set() });
  assert.equal(out.behaviours.length, 1);
  assert.equal(out.behaviours[0].coverage[A].passagesWithheld, true);
});

/* citationIndex is what lets a ?passage= link find a behaviour the address never
 * named. It has to read the paragraphs of every behaviour, so it must run before
 * any of them are removed. Built afterwards it would index only what was asked
 * for, which is exactly the case it exists to cover. */
test("the citation index still names behaviours whose paragraphs were withheld", () => {
  const payload = { behaviours: [
    { id: 1, slug: "helpfulness", name: "Helpfulness",
      coverage: { [A]: { passages: [{ locator: `${A} > s > ¶1` }] } } },
    { id: 2, slug: "no-sycophancy", name: "No sycophancy",
      coverage: { [A]: { passages: [{ locator: `${A} > s > ¶1` }, { locator: `${A} > s > ¶2` }] } } },
  ] };
  const out = sliceColumn("payload", payload, { documents: null, behaviours: new Set(["helpfulness"]) });
  assert.deepEqual(out.citedBy, { [`${A} > s > ¶1`]: [1, 2], [`${A} > s > ¶2`]: [2] });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test app/lib/__tests__/slice.test.mjs`

Expected: FAIL. The first new test fails on the behaviour list, which today is
`["helpfulness"]` because the slicer drops the others.

Read which test falls by its name. A count alone does not tell you whether the
suite ran.

- [ ] **Step 3: Rewrite the payload branch**

In `app/lib/slice.mjs`, replace the `payload` branch of `sliceColumn`:

```javascript
  if (column === "payload") {
    if (!behaviours) return payload;
    /* citationIndex reads the paragraphs of every behaviour, so it is built from
     * the whole column before anything is taken out of it. */
    const citedBy = citationIndex(payload);
    return { ...payload,
             behaviours: (payload.behaviours || []).map(b =>
               behaviours.has(b.slug) ? b : withheldParagraphs(b)),
             citedBy };
  }
```

and add above `sliceColumn`:

```javascript
/* A behaviour nobody asked for, with its heading and its figures and none of its
 * text. The cell says so rather than reading as empty: an empty passages array
 * is the index saying this document is silent on this behaviour, which is the
 * one claim it must never make by accident. */
function withheldParagraphs(behaviour) {
  const coverage = {};
  for (const [id, cell] of Object.entries(behaviour.coverage || {})) {
    const { passages, ...rest } = cell;
    coverage[id] = { ...rest, passagesWithheld: true };
  }
  return { ...behaviour, coverage };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test app/lib/__tests__/slice.test.mjs`

Expected: PASS, with every previously passing test still passing. In particular
`the slicer never writes into the column it was given` must still pass: the code
above builds new objects and never assigns into `cell`.

- [ ] **Step 5: Commit**

```bash
git add app/lib/slice.mjs app/lib/__tests__/slice.test.mjs
git commit -m "feat: the payload keeps every behaviour and withholds their paragraphs"
```

---

### Task 2: The documents column keeps every document and withholds the text

**Files:**
- Modify: `app/lib/slice.mjs`, the `documents` branch of `sliceColumn`
- Test: `app/lib/__tests__/slice.test.mjs`

**Interfaces:**
- Consumes: `withheldParagraphs` exists in the module from Task 1 (not used here).
- Produces: `sliceColumn("documents", column, { documents, behaviours })` returns
  every document. A document in `documents` is untouched. A document not in it
  loses `markdown` and `original` and gains `textWithheld: true`.

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/__tests__/slice.test.mjs`:

```javascript
test("every document is listed, and only the ones asked for carry their text", () => {
  const column = { documents: [
    { id: A, lab: "Anthropic", title: "Claude's Constitution", version: "2026-01-20",
      markdown: "# a", original: ["a"] },
    { id: B, lab: "OpenAI", title: "Model Spec", version: "2026-08-18",
      markdown: "# b", original: ["b"] },
  ] };
  const out = sliceColumn("documents", column, { documents: new Set([A]), behaviours: null });

  assert.deepEqual(out.documents.map(d => d.id), [A, B], "both are still listed");
  assert.equal(out.documents[0].markdown, "# a", "the one on screen keeps its text");
  assert.equal(out.documents[0].textWithheld, undefined);

  const other = out.documents[1];
  assert.equal(other.textWithheld, true, "the other says its text was not asked for");
  assert.equal("markdown" in other, false);
  assert.equal("original" in other, false);
  assert.equal(other.lab, "OpenAI", "and keeps the metadata the menu is drawn from");
  assert.equal(other.version, "2026-08-18");
});

test("no document parameter still returns the column untouched", () => {
  const column = { documents: [{ id: A, markdown: "# a" }] };
  assert.deepEqual(sliceColumn("documents", column, all), column);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test app/lib/__tests__/slice.test.mjs`

Expected: FAIL on `both are still listed`, which today returns `[A]`.

- [ ] **Step 3: Rewrite the documents branch**

Replace the `documents` branch of `sliceColumn`:

```javascript
  if (column === "documents") {
    if (!documents) return payload;
    return { ...payload,
             documents: (payload.documents || []).map(d =>
               documents.has(d.id) ? d : withheldText(d)) };
  }
```

and add beside `withheldParagraphs`:

```javascript
/* A document the reader is not looking at: everything the menu needs to name it
 * and offer it, and none of the 309 KB of `original` or 118 KB of `markdown`
 * that only the panel on screen reads. */
function withheldText(document) {
  const { markdown, original, ...rest } = document;
  return { ...rest, textWithheld: true };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test app/lib/__tests__/slice.test.mjs`

Expected: PASS.

- [ ] **Step 5: Run the whole route suite, which must be unmoved**

Run: `node --test app/lib/__tests__/*.test.mjs`

Expected: every test passes. Note the totals: the suite stood at 316 before this
plan began.

- [ ] **Step 6: Commit**

```bash
git add app/lib/slice.mjs app/lib/__tests__/slice.test.mjs
git commit -m "feat: the documents column keeps every document and withholds the text"
```

---

### Task 3: The reader learns the third answer

**Files:**
- Modify: `site/spec-reader/app.js:367` (beside `NO_COVERAGE`), and the four
  readers at `1602`, `1673`, `2918`, `3634`
- Create: `engine/panel/test_appjs_withheld.js`
- Modify: `engine/panel/test_panel.py`

**Interfaces:**
- Consumes: coverage cells may carry `passagesWithheld: true` and no `passages`
  key (Task 1).
- Produces: `paragraphsOf(behaviour, documentId)` returning an object that always
  has a `passages` array and may have `withheld: true`. Every reader of a cell's
  paragraphs goes through it.

Why a helper and not four guards: `selectedPassageTotal` and the published count
carry the identical expression `behaviour.coverage?.[doc.id]?.passages.length || 0`
at two call sites. Patching the same shape twice is how two copies of one rule
drift apart, which this repository has already paid for once when
`bands.shown_by_default` drifted from the reader's own `DEFAULT_BANDS`.

- [ ] **Step 1: Write the failing harness**

Create `engine/panel/test_appjs_withheld.js`:

```javascript
#!/usr/bin/env node
/* Guard for paragraphsOf in site/spec-reader/app.js: the three answers a cell
 * can give about its paragraphs, and which of them the reader may count.
 *
 * app.js runs DOM code at module scope and cannot be imported, so the function
 * is extracted verbatim from the real file, as the sibling harnesses do.
 *
 * Exits 0 when every check holds, 1 otherwise.
 * Run:  node engine/panel/test_appjs_withheld.js
 * (driven from test_panel.py::TestAppJSWithheld; needs Node, no browser/keys)
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
function extractConst(name) {
  const line = lines.find(l => l.startsWith(`const ${name} =`));
  if (line === undefined) throw new Error(`not found in app.js: const ${name}`);
  return line.replace(/^const /, "var ");
}

eval(extractConst("NO_COVERAGE"));
eval(extractConst("WITHHELD"));
eval(extractFn("function paragraphsOf(behaviour, documentId) {"));

const DOC = "anthropic--constitution@2026-01-20";

let checks = 0, failures = 0;
function check(name, run, expected) {
  checks++;
  let got;
  try { got = run(); } catch (err) { got = `threw: ${err.message}`; }
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${JSON.stringify(got)} `
    + `(expected ${JSON.stringify(expected)})`);
}

/* ---- the three answers ---- */
check("a behaviour that does not cover the document has no passages and is not withheld",
      () => { const r = paragraphsOf({ coverage: {} }, DOC);
              return [r.passages.length, !!r.withheld]; }, [0, false]);
check("a behaviour the panel cited nothing for is empty and is not withheld",
      () => { const r = paragraphsOf({ coverage: { [DOC]: { passages: [] } } }, DOC);
              return [r.passages.length, !!r.withheld]; }, [0, false]);
check("a cell whose paragraphs were withheld says so",
      () => { const r = paragraphsOf(
                { coverage: { [DOC]: { depth: { mean: 2 }, passagesWithheld: true } } }, DOC);
              return [r.passages.length, !!r.withheld]; }, [0, true]);
check("a cell that carries paragraphs hands them back",
      () => paragraphsOf(
              { coverage: { [DOC]: { passages: [{ locator: "x" }, { locator: "y" }] } } },
              DOC).passages.length, 2);

/* ---- what must never throw ---- */
check("a withheld cell can be walked like any other, and walks over nothing",
      () => { let n = 0;
              paragraphsOf({ coverage: { [DOC]: { passagesWithheld: true } } }, DOC)
                .passages.forEach(() => n++);
              return n; }, 0);
check("a behaviour with no coverage object at all does not throw",
      () => paragraphsOf({}, DOC).passages.length, 0);

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it and watch it fail on load**

Run: `node engine/panel/test_appjs_withheld.js`

Expected: FAIL, with `not found in app.js: const WITHHELD`. The harness dies as
it loads rather than failing a check by name, which is what a missing extraction
always does. Do not read that as the suite passing.

- [ ] **Step 3: Add the constant and the helper**

In `site/spec-reader/app.js`, directly after `const NO_COVERAGE = { passages: [] };`
at line 367:

```javascript
/* A cell whose paragraphs this page never asked for. It carries an empty array
 * so that anything walking paragraphs walks over nothing instead of throwing,
 * and a flag so that anything COUNTING or REPORTING them can tell this apart
 * from a panel that cited nothing. The two are different claims: one is the
 * index saying a document is silent on a behaviour, the other is this page
 * saying it did not ask. */
const WITHHELD = { passages: [], withheld: true };

/* What a cell says about its paragraphs. Three answers, not two, and every
 * reader of paragraphs goes through here so the difference cannot be forgotten
 * at one call site and honoured at another. */
function paragraphsOf(behaviour, documentId) {
  const coverage = behaviour?.coverage?.[documentId];
  if (!coverage) return NO_COVERAGE;
  if (coverage.passagesWithheld) return WITHHELD;
  return coverage;
}
```

- [ ] **Step 4: Run the harness and watch it pass**

Run: `node engine/panel/test_appjs_withheld.js`

Expected: `6 checks, 0 failures`, exit 0.

- [ ] **Step 5: Send the four readers through the helper**

In `site/spec-reader/app.js`, replace `selectedPassageTotal` (at line 1599):

```javascript
/* Counts only what it can count. A withheld cell holds an unknown number of
 * paragraphs, not zero, so the hint says so rather than printing a total that
 * quietly leaves out most of the publication. */
function selectedPassageTotal() {
  let total = 0, unknown = false;
  selectedBehaviours().forEach(behaviour => {
    (state.payload?.documents || []).forEach(doc => {
      const cell = paragraphsOf(behaviour, doc.id);
      if (cell.withheld) unknown = true;
      else total += cell.passages.length;
    });
  });
  return { total, unknown };
}
```

In the export, replace the two lines at 1668 and 1673:

```javascript
      const coverage = paragraphsOf(behaviour, doc.id);
```

```javascript
      if (coverage.withheld) {
        lines.push("", "Paragraphs not exported: this reader did not load them.");
        return;
      }
      if (!coverage.passages.length) {
```

In `annotatePassages`, replace the line at 2917:

```javascript
    const coverage = paragraphsOf(behaviour, doc.id);
```

And the published count at 3633:

```javascript
  const published = selectedBehaviours()
    .reduce((total, behaviour) => total + paragraphsOf(behaviour, doc.id).passages.length, 0);
```

- [ ] **Step 6: Fix the one caller of selectedPassageTotal**

`selectedPassageTotal` now returns an object. It has exactly one caller, at
`site/spec-reader/app.js:1617`, inside `updateExportControl`. Replace lines 1617
to 1622, which currently read:

```javascript
  const passages = selectedPassageTotal();
  const documents = state.payload?.documents || [];
  elements.downloadHint.textContent =
    `${behaviours.length} ${behaviours.length === 1 ? "behaviour" : "behaviours"}`
    + `, ${passages} ${passages === 1 ? "passage" : "passages"}`
    + `, ${documents.length} ${documents.length === 1 ? "document" : "documents"}`;
```

with:

```javascript
  const { total, unknown } = selectedPassageTotal();
  const documents = state.payload?.documents || [];
  /* The middle clause is dropped rather than guessed when any selected cell had
   * its paragraphs withheld: a number that silently leaves most of the
   * publication out is worse than no number. */
  elements.downloadHint.textContent =
    `${behaviours.length} ${behaviours.length === 1 ? "behaviour" : "behaviours"}`
    + (unknown ? "" : `, ${total} ${total === 1 ? "passage" : "passages"}`)
    + `, ${documents.length} ${documents.length === 1 ? "document" : "documents"}`;
```

- [ ] **Step 7: Register the harness with the python driver**

In `engine/panel/test_panel.py`, beside the other harness classes. `HERE`,
`shutil`, `subprocess` and `unittest` are already imported at the top of that
file, so nothing needs adding to the imports:

```python
class TestAppJSWithheld(unittest.TestCase):
    """A cell can say three things about its paragraphs, and the reader must tell
    them apart: no coverage for this document, coverage the panel cited nothing
    for, and coverage whose paragraphs this page never asked for. Reading the
    third as the second would have the index claim a specification is silent on
    a behaviour, which is the one claim it must never make by accident."""

    HARNESS = HERE / "test_appjs_withheld.js"

    def setUp(self):
        if shutil.which("node") is None:
            self.skipTest("node is not available")

    def test_the_reader_tells_the_three_states_apart(self):
        out = subprocess.run(["node", str(self.HARNESS)],
                             capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("0 failures", out.stdout)
```

- [ ] **Step 8: Run everything the CI runs**

Run: `python3 -m unittest discover -s engine/panel -p "test_*.py"`

Expected: `OK`, and the `Ran N tests` line larger than before by the number of
methods you added. It stood at 236 before this plan. A discover run that finds
nothing also exits 0, so read the count, not the exit code.

- [ ] **Step 9: Commit**

```bash
git add site/spec-reader/app.js engine/panel/test_appjs_withheld.js engine/panel/test_panel.py
git commit -m "feat: the reader can tell a withheld cell from an empty one"
```

---

### Task 4: The sidebar lists every behaviour

**Files:**
- Modify: `engine/panel/test_appjs_withheld.js` (the only file this task changes)
- Read, do not modify: `site/spec-reader/app.js:1216-1228` (`behaviourGroups`)
  and `app.js:592-595` (`behaviourHue`), which are extracted as text by the
  harness and must stay exactly as they are

**Interfaces:**
- Consumes: `paragraphsOf` from Task 3, and a payload carrying every behaviour
  from Task 1.
- Produces: no new function. `behaviourGroups` groups whatever
  `state.payload.behaviours` holds, which is now the full set.

`behaviourGroups` needs no change at all: it already reads
`state.payload?.behaviours`, and Task 1 makes that the complete list. This task
exists to prove it, because the regression this plan fixes was invisible until
something asserted it.

- [ ] **Step 1: Write the failing check**

Append to `engine/panel/test_appjs_withheld.js`, before the final count line:

```javascript
/* ---- the sidebar lists what exists, not what arrived ---- */
var GROUP_TEXTURE = {};
var state = { payload: null };
eval(extractFn("function behaviourGroups() {"));

const MIXED = { behaviours: [
  { id: 1, slug: "a", name: "A", category: "One",
    coverage: { [DOC]: { depth: { mean: 2 }, passages: [{ locator: "x" }] } } },
  { id: 2, slug: "b", name: "B", category: "One",
    coverage: { [DOC]: { depth: { mean: 1 }, passagesWithheld: true } } },
  { id: 3, slug: "c", name: "C", category: "Two",
    coverage: { [DOC]: { depth: { mean: 3 }, passagesWithheld: true } } },
] };

check("every behaviour is listed, whether or not its paragraphs came",
      () => { state.payload = MIXED;
              return behaviourGroups().flatMap(g => g.behaviours.map(b => b.slug)); },
      ["a", "b", "c"]);
check("and they keep their groups",
      () => { state.payload = MIXED;
              return behaviourGroups().map(g => g.name); }, ["One", "Two"]);
check("a behaviour whose paragraphs were withheld still shows its figure",
      () => { state.payload = MIXED;
              const b = behaviourGroups()[0].behaviours[1];
              return b.coverage[DOC].depth.mean; }, 1);

/* ---- the colour does not depend on what arrived ---- */
/* behaviourHue draws its slot from indexOf on the loaded array. The design says
 * this closes by construction, because the array is now always complete and in
 * publication order, and that it stays fragile. This is the guard that turns
 * "by construction" into something that fails loudly if a later change makes the
 * array partial again. */
var HUE_SLOTS = 12;
eval(extractFn("function payloadBehaviours() {"));
eval(extractFn("function behaviourHue(behaviour) {"));

check("each behaviour keeps its own slot, withheld paragraphs or not",
      () => { state.payload = MIXED;
              return MIXED.behaviours.map(b => behaviourHue(b)); },
      ["var(--hue-1)", "var(--hue-2)", "var(--hue-3)"]);
check("and the slot does not move when a neighbour's paragraphs are withheld",
      () => { state.payload = { behaviours: MIXED.behaviours.map(b => ({
                ...b, coverage: { [DOC]: { depth: b.coverage[DOC].depth,
                                           passagesWithheld: true } } })) };
              return state.payload.behaviours.map(b => behaviourHue(b)); },
      ["var(--hue-1)", "var(--hue-2)", "var(--hue-3)"]);

/* The fragility itself, and the reason these checks exist at all. indexOf
 * returns -1 for a behaviour the loaded array does not hold, and Math.max(0, -1)
 * turns that into slot 1, which is the first behaviour's own colour. So a
 * partial array does not fail, it quietly paints two behaviours alike. This
 * check is what makes that audible if anyone makes the array partial again. */
check("a behaviour missing from the loaded set takes the first one's colour, which is the trap",
      () => { state.payload = { behaviours: [MIXED.behaviours[0]] };
              return [behaviourHue(MIXED.behaviours[0]),
                      behaviourHue(MIXED.behaviours[2])]; },
      ["var(--hue-1)", "var(--hue-1)"]);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node engine/panel/test_appjs_withheld.js`

Expected: all six new checks PASS, because `behaviourGroups` and `behaviourHue`
need no change: Task 1 is what makes the array complete, and these assert it.
Passing on the first run is the expected outcome here and is not a reason to
skip the step, because the checks are the regression guard rather than the fix.

The only way this step fails is `not found in app.js: function behaviourGroups() {`,
which means a header no longer matches character for character. That kills the
harness as it loads rather than failing a check by name, so read the error, not
the absence of failures.

If you want to see them bite before trusting them, temporarily make
`behaviourGroups` return only the first behaviour, watch the first check fail by
name, and put it back.

- [ ] **Step 3: Run the full harness set**

Run: `node --test engine/panel/test_appjs_*.js`

Expected: 12 files, 12 pass, 0 fail.

- [ ] **Step 4: Commit**

```bash
git add engine/panel/test_appjs_withheld.js
git commit -m "test: the sidebar lists every behaviour, withheld paragraphs or not"
```

---

### Task 5: loadDocuments passes its slice

**Files:**
- Modify: `site/spec-reader/app.js:192-196`
- Modify: `engine/panel/test_appjs_fallthrough.js`

**Interfaces:**
- Consumes: `sliceParams(pinned, { behaviours, specs })` already exists at
  `app.js:50` and already builds `spec=` from a list. `ensureBehaviours`
  (`app.js:4624`) is the pattern the new loader mirrors.
- Produces: `loadDocuments` asks for `?spec=<the documents on screen>`, and
  `ensureDocument(id)` fetches a withheld document's text when the reader opens
  it.

This is the whole of the saving: 1070 KB down to 186. The other three loaders
already pass their slice; this one was missed when they were written.

**Read this before you start.** Passing the slice is not enough on its own, and
the plan said so too late. Measured against `9b7ce377`: asking for one document
returns four, of which **three come back withheld** carrying no `markdown`.
`loadDocuments()` is called from exactly one place, inside `initialize()`, and
nothing refetches it. Five sites read `doc.markdown`, and `renderDocument`
(`app.js:3451`) builds a heading index from it and renders the body with it. So
Step 3 alone would make the reader draw nothing, or throw, the moment anyone
switches document. Steps 4 and 5 are what keep that from happening, and this
task is not done without them.

- [ ] **Step 1: Write the failing check**

In `engine/panel/test_appjs_fallthrough.js`, in the documents section near the
end, append a scenario:

```javascript
    {
      const DOCS_SPEC_URL = `${DOCS_CURRENT_URL}?spec=${encodeURIComponent(SPEC_A)}`;
      const docs = await readDocuments(`?spec=${SPEC_A}`, {
        [CURRENT_URL]: CURRENT, [DOCS_SPEC_URL]: DOCS_CURRENT });
      check(docs.documents[0] === "CURRENT",
            "the documents request names the document the address asks for",
            docs.error || JSON.stringify(readAsked()));
    }
```

and beside the other constants near `PINNED_ID`:

```javascript
const SPEC_A = "anthropic--constitution@2026-01-20";
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node engine/panel/test_appjs_fallthrough.js`

Expected: FAIL on the new check, because `loadDocuments` asks for
`/api/reader/documents` with no `spec` and the stub has no such entry, so
`readDocuments` catches the 404 and returns `{ documents: [] }`.

- [ ] **Step 3: Make loadDocuments pass its slice**

Replace `loadDocuments` at `site/spec-reader/app.js:192`:

```javascript
/* Sliced like the payload and the links beside it. The documents column is
 * 1161 KB for four documents and the panel shows one, or two when comparing;
 * every other loader already said which it wanted and this one did not. */
async function loadDocuments() {
  const pinned = state.payloadSource?.origin === "pin" ? state.payloadSource.name : null;
  return loadJSON(`${DOCUMENTS_URL}${sliceParams(pinned, { specs: urlSpecs() })}`);
}
```

- [ ] **Step 4: Teach the reader to fetch a document's text when it opens one**

Step 3 means three of the four documents now arrive with no `markdown`. Nothing
refetches them, so this is what makes switching document work at all.

Add beside `ensureBehaviours` in `site/spec-reader/app.js`, mirroring its shape:

```javascript
/* A document whose text was withheld, fetched when the reader opens it. The
 * documents column is sliced like the payload now, so the panel is handed the
 * metadata of every document and the text of the ones it was showing at the
 * time. Keyed by id and held, like inFlight beside it: opening a document twice
 * costs one request, and a fetch in flight is not raced by its own repeat. */
const documentsInFlight = new Map();

async function ensureDocument(id) {
  if (!id) return;
  const held = (state.payload?.documents || []).find(doc => doc.id === id);
  if (held && !held.textWithheld) return;
  if (documentsInFlight.has(id)) return documentsInFlight.get(id);

  const pinned = state.payloadSource?.origin === "pin" ? state.payloadSource.name : null;
  const fetching = (async () => {
    const answered = await loadJSON(
      `${DOCUMENTS_URL}${sliceParams(pinned, { specs: [id] })}`);
    const text = (answered.documents || []).find(doc => doc.id === id);
    if (!text || text.textWithheld) return;
    state.payload.documents = (state.payload.documents || [])
      .map(doc => (doc.id === id ? text : doc));
  })();
  // A failed fetch is not a fact worth remembering: drop the id so a retry can
  // ask again, guarded by identity so a slower rejection cannot delete an entry
  // a fresher call has since taken over.
  fetching.catch(() => {
    if (documentsInFlight.get(id) === fetching) documentsInFlight.delete(id);
  });
  documentsInFlight.set(id, fetching);
  return fetching;
}
```

Then await it where a document is opened. In `chooseSpec`, after
`state.selectedSpec = id;` and `syncURL();`, beside the existing
`ensureBehaviours` await:

```javascript
  await Promise.all([
    ensureDocument(id).catch(() => {}),
    ensureBehaviours(state.selectedSlugs).catch(() => {}),
  ]);
```

And in `setComparePair`, replacing its `ensureBehaviours` await, so both halves
of the pair are fetched:

```javascript
  await Promise.all([
    ...next.filter(Boolean).map(docId => ensureDocument(docId).catch(() => {})),
    ensureBehaviours(state.selectedSlugs).catch(() => {}),
  ]);
```

Both stay unconditional and both swallow rejections, for the reason already
written beside them: the state is changed before the await, so a failure must
not skip the repaint that follows.

- [ ] **Step 5: Make the panel refuse to draw text it has not got**

`renderDocument` (`site/spec-reader/app.js:3451`) calls
`buildHeadingIndex(doc.markdown)` and `renderMarkdown(doc.markdown, ...)`. A
withheld document has no `markdown` at all, so both break. Step 4 means this
should not happen, and this step is what makes it visible rather than a blank
panel if it ever does.

At the top of `renderDocument`, before the `markdownContext` is built:

```javascript
  /* Step 4 fetches a document's text before it is shown, so reaching here
     without it means that fetch failed or was skipped. Say so in the panel
     rather than rendering `undefined`, which is how a reader would otherwise
     be shown an empty specification and have no idea why. */
  if (doc.textWithheld || typeof doc.markdown !== "string") {
    const panel = elements.template.content.firstElementChild.cloneNode(true);
    panel.querySelector(".document-body").textContent =
      "This specification's text has not loaded. Reload the page to try again.";
    return panel;
  }
```

- [ ] **Step 6: Run the fall-through harness and watch it pass**

Run: `node engine/panel/test_appjs_fallthrough.js`

Expected: every check PASS, and the closing line
`app.js payload resolution: PASS (...)`.

- [ ] **Step 7: Run the harness set and the python driver**

Run: `node --test engine/panel/test_appjs_*.js`
Expected: 12 files, 12 pass, 0 fail.

Run: `python3 -m unittest discover -s engine/panel -p "test_*.py"`
Expected: `OK`, with its `Ran N tests` line at or above 236. A discover run that
finds nothing also exits 0, so read the count and not the exit code.

- [ ] **Step 8: Look at it in a browser, because no harness covers this**

The harnesses extract pure functions as text and none of them renders a panel,
so Steps 4 and 5 have no automated cover. Serve the reader and switch documents
by hand:

```bash
npm run dev -- -p 4641
```

Open `/spec-reader/?publication=9b7ce377-d2eb-452e-a8fc-4552a7801487&spec=anthropic--constitution@2026-01-20`,
then use the document picker to switch to each of the other three in turn, and
press compare. Every one must render its text. If any panel shows the "has not
loaded" sentence from Step 5, Step 4 is not working. Stop the server when done.

- [ ] **Step 9: Commit**

```bash
git add site/spec-reader/app.js engine/panel/test_appjs_fallthrough.js
git commit -m "fix: the reader asks for the document it is showing, and fetches one it opens"
```

---

### Task 6: The overview asks for the new shape

**Files:**
- Modify: `site/overview.js:518-538` (`initialize`)

**Interfaces:**
- Consumes: the payload and documents shapes from Tasks 1 and 2.
- Produces: nothing other tasks read.

The overview reads `coverage[documentId]?.depth` in `depthOf` and never touches
paragraphs, and it reads `id`, `lab`, `title` and `version` from documents and
never the text. So it needs no guard: only the two requests change.

- [ ] **Step 1: Ask for the new shape**

In `site/overview.js`, replace the first two entries of the `Promise.all`:

```javascript
    /* Both sets present and empty: every behaviour and every document is still
     * listed with its heading and its figures, and none of them carries the
     * paragraphs or the document text this page never reads. Measured on
     * 9b7ce377: the payload falls from 914 KB to 66 and the documents from
     * 1161 KB to 1. */
    loadJSON(`/api/reader/payload${PINNED ? `${PINNED}&` : "?"}behavior=`, null),
    loadJSON(`/api/reader/documents${PINNED ? `${PINNED}&` : "?"}spec=`, null),
```

- [ ] **Step 2: Check it parses**

Run: `node --check site/overview.js`
Expected: no output.

- [ ] **Step 3: Serve it and measure**

Run, from the repository root:

```bash
npm run dev -- -p 4640
```

Then, in another shell, with `P` set to a publication that carries links:

```bash
P=9b7ce377-d2eb-452e-a8fc-4552a7801487
for u in "payload?publication=$P&behavior=" "documents?publication=$P&spec=" \
         "behaviours?publication=$P" "links?publication=$P&behavior=&spec="; do
  printf "%-46s %s KB\n" "$u" \
    "$(curl -s -o /dev/null -w '%{size_download}' "http://127.0.0.1:4640/api/reader/$u" \
       | awk '{printf "%.0f", $1/1024}')"
done
```

Expected: payload about 66 KB, documents about 1 KB, behaviours about 15 KB,
links about 88 KB. Around 170 KB in all, against the 2062 KB the page pulls
today.

- [ ] **Step 4: Look at the page**

Open `http://127.0.0.1:4640/?publication=<the id>` and check the grid still draws
every figure, that pressing a cell still opens its evidence, and that the
governance tab still works. Stop the server when done.

- [ ] **Step 5: Commit**

```bash
git add site/overview.js
git commit -m "perf: the overview asks for headings and figures without the text"
```

---

### Task 7: The record

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write what changed and what it cost**

Add this section to `CLAUDE.md` under `## Changes of substance we made`, after
the section on links belonging to a publication:

```markdown
### A cell can say three things about its paragraphs

**Found by a reader opening a shared link. Fixed.**

Teaching the reader to send only what its address names had a consequence nobody
looked for: `behaviourGroups` builds the sidebar from `state.payload.behaviours`,
which is the sliced payload, so a link naming one behaviour listed one behaviour
and hid the other twelve. The count above the list read "1 of 13" the whole time,
because `updateBehaviourCount` totals on the registry, so the page contradicted
itself in two adjacent elements. It was introduced on 18 September 2026 and was
on the development deployment for three days.

The slicing now cuts inside an entry instead of throwing the entry away. Every
behaviour travels with its title, definition, depth and recorded substitutions;
only the behaviours the address names bring their paragraphs. Every document
travels with the metadata the menu is drawn from; only the documents on screen
bring `markdown` and `original`.

That made a third state necessary. A cell whose paragraphs were not asked for
carries `passagesWithheld: true` and no `passages` key, because serialising it
as `passages: []` would be the index saying this specification is silent on this
behaviour, which is the one claim it must never make by accident. Absent, empty
and withheld are three different answers and `paragraphsOf` in `app.js` is the
one place that tells them apart; every reader of a cell's paragraphs goes
through it.

Two things are worth recording about the cost, because both were measured and
neither was what the work was started for. Listing every behaviour is free: the
payload is 92.2 KB under the new shape against 93 KB under the old, since the
thirteen headings with their depths come to 66.1 KB and one behaviour's
paragraphs to about 26. So the regression made the sidebar wrong and saved
nothing. The whole saving was elsewhere and was an omission rather than a new
idea: `loadDocuments` passed no slice, so the reader fetched 1070 KB of four
documents to show one, and it now fetches 186. A first load of one behaviour on
one document went from 1339 KB to 454.
```

- [ ] **Step 2: Check the rules**

Run: `grep -n '[—–]' CLAUDE.md`
Expected: no output. Long dashes are forbidden everywhere.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: three states for a cell, and where the saving actually was"
```

---

## Verifying the whole thing

Run, in this order:

```bash
node --test app/lib/__tests__/*.test.mjs
node --test engine/panel/test_appjs_*.js
python3 -m unittest discover -s engine/panel -p "test_*.py"
```

Expected: the first at 316 tests or more with none failing, the second at 12
files all passing, the third `OK` with its `Ran N tests` line above 236.

Then serve the reader and open a link naming one behaviour:

```
/spec-reader/?publication=<id>&behavior=avoiding-illegitimate-concentration-of-power&spec=anthropic--constitution@2026-01-20
```

The sidebar must list thirteen behaviours with their figures, the count above it
must read `1 of 13 selected`, and ticking a second behaviour must bring its
highlights in without reloading the page.
