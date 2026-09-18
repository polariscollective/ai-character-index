# Links belong to a publication: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze what the reader is served about links into the publication row, so that a pinned publication serves its own bubbles and a write to a table no longer changes what the public sees.

**Architecture:** `aci_publications` gains a third frozen column, `links`, built the way `payload` and `documents` already are: a builder writes JSON to a file, `publish.py` digests those exact bytes and inserts them. The builder is JavaScript and imports the assembly that already exists in `app/lib/links.mjs`, so the logic moves out of the route rather than being copied into Python. The route then serves the column through `readerResponse`, exactly as the payload route does.

**Tech Stack:** Node 20 with `node:test`, Next.js route handlers, Python 3 with `unittest` for `engine/publish.py`, PostgREST through `app/lib/supabase.mjs` and `engine/store.py`, Supabase migrations in the separate `polaris-supabase` repository.

## Global Constraints

- No long dashes anywhere: not in code, comments, commit messages or documents.
- Everything written into a repository is in English, including commit messages.
- The column is `json`, never `jsonb`: jsonb reorders keys and the digest describes exact bytes.
- **The builder's bytes must be reproducible by `json.dumps(obj, **FORMATS["links"])`.** `verify_supabase_provenance.py` re-serialises the stored JSON in Python and holds it to the recorded digest. This is why the builder writes `JSON.stringify(value, null, 2)` with **no trailing newline**: Python's `json.dumps(indent=2, ensure_ascii=False)` produces those exact bytes, and cannot produce a trailing one.
- Database schemas live only in `polaris-supabase`. This repository reads and writes tables; it never migrates them.
- `aci_publications` is insert only. A row is built complete or not at all.
- The assembly logic exists in exactly one copy, in `app/lib/links.mjs`.
- Python tests are `unittest`, live beside their module, and run as `python3 engine/test_<name>.py`. There is no pytest in this repository.
- Route tests run with `npm run test:routes` (`node --test app/lib/__tests__/*.test.mjs`) and inject `fetch`; no test touches a network.
- Spec: `docs/superpowers/specs/2026-09-18-links-belong-to-a-publication-design.md`.

---

### Task 1: The two columns

**Files:**
- Create: `../polaris-supabase/evals/supabase/migrations/20260918090000_aci_links_belong_to_a_publication.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `aci_publications.links` (`json`, nullable) and `aci_publications.links_sha256` (`text`, nullable). Nullable because every existing row predates the column, and an insert only table cannot backfill.

- [ ] **Step 1: Write the migration**

```sql
-- ai-character-index: the links a publication carries, frozen like its payload.
--
-- payload and documents are bytes copied into the publication row and held to a
-- digest. The bubbles, the comparisons, the arbitrations and the paragraph
-- notes were not: /api/reader/links read the live tables on every page view. So
-- pinning an old publication served yesterday's documents under today's
-- readings, and storing a run changed what the public saw with no publication
-- and no deploy. 739 paragraph notes went live that way on 2026-09-17 and
-- 2026-09-18.
--
-- json and not jsonb, for the reason the earlier migrations recorded: jsonb
-- reorders keys on the way in, which breaks the recorded digest permanently and
-- silently.
--
-- Both columns are nullable. Every row that exists predates them, and
-- aci_publications is insert only, so there is nothing to backfill and no
-- default worth inventing. The verifier skips a publication carrying null
-- rather than failing it, because those rows never claimed to carry links.

alter table "public"."aci_publications"
  add column if not exists "links" json,
  add column if not exists "links_sha256" text;

comment on column "public"."aci_publications"."links" is
  'What /api/reader/links serves for this publication: bubbles, comparisons, arbitrations and paragraph notes, as engine/build-links-data.mjs wrote them.';

comment on column "public"."aci_publications"."links_sha256" is
  'sha256 of the exact bytes engine/build-links-data.mjs wrote for the links column.';
```

- [ ] **Step 2: Check whether the grants name columns**

`aci_publications` grants select and insert only, and the record says the grant is column-level. A column added by `alter table` is not covered by an existing column-level grant, so a missing grant here would make the new column invisible to the reader with no error anywhere.

Run: `grep -rn 'grant.*aci_publications' ../polaris-supabase/evals/supabase/migrations/`
Expected: the grant statements for this table.

If they enumerate columns, append to the same migration file, matching the roles the existing statements actually name:

```sql
grant select ("links", "links_sha256") on "public"."aci_publications" to anon, authenticated;
grant insert ("links", "links_sha256") on "public"."aci_publications" to service_role;
```

If the grants are table-wide, nothing is needed and this step is done.

- [ ] **Step 3: Commit in polaris-supabase and open the pull request**

```bash
cd ../polaris-supabase
git checkout -b aci-links-belong-to-a-publication
git add evals/supabase/migrations/20260918090000_aci_links_belong_to_a_publication.sql
git commit -m "aci: a publication carries the links it was built with"
git push -u origin aci-links-belong-to-a-publication
gh pr create --fill
```

- [ ] **Step 4: Stop here until the pull request is merged and applied**

Nothing that writes the column can run before it exists. Tasks 2 to 6 touch only this repository's code and its tests, and may proceed while the pull request waits. Task 7, which publishes for real, may not.

---

### Task 2: readerLinks reads the runs it is given

**Files:**
- Modify: `app/lib/links.mjs` (the head of `readerLinks`)
- Test: `app/lib/__tests__/links.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `readerLinks(fetchImpl = fetch, runIds = null)`. When `runIds` is a non empty array of run id strings, those runs are used and `panelRuns` is not called. When it is null, behaviour is exactly what it is today, so the live route keeps working until Task 5 switches it. The returned object is unchanged: `{documents, runs, byLocator, comparisons, notes: {passage, depth, standing}}`.

- [ ] **Step 1: Write the failing test**

Add to `app/lib/__tests__/links.test.mjs`, and make sure `readerLinks` is in the import list at the head of that file.

This file has never reached `select()` before, so unlike its siblings it sets no credentials. Add these two lines below the imports, worded exactly as `publications.test.mjs` has them, or the new test throws `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set` in every shell that does not happen to carry them, and passes only on the machine that wrote it:

```javascript
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";
```

Then the test itself:

```javascript
test("readerLinks reads the runs it is given and never asks which are current", async () => {
  const asked = [];
  const fetchImpl = async url => {
    asked.push(String(url));
    return { ok: true, status: 200, json: async () => [], text: async () => "" };
  };
  const out = await readerLinks(fetchImpl, ["11111111-1111-4111-8111-111111111111"]);
  assert.equal(asked.some(url => url.includes("aci_link_runs")), false);
  assert.deepEqual(out.runs, ["11111111-1111-4111-8111-111111111111"]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test app/lib/__tests__/links.test.mjs`
Expected: FAIL. `readerLinks` ignores its second argument and calls `panelRuns`, so it fetches `aci_link_runs` and `asked.some(...)` is true.

- [ ] **Step 3: Take the runs as an argument**

In `app/lib/links.mjs`, replace the signature, the `panelRuns` call and the set that follows it with:

```javascript
export async function readerLinks(fetchImpl = fetch, runIds = null) {
  /* A publication names the runs it carries. Without that list this falls back
   * to asking which runs look current, which is what the reader did before
   * links were frozen into a publication. The fallback goes in Task 6, once the
   * route no longer needs it. See the spec at
   * docs/superpowers/specs/2026-09-18-links-belong-to-a-publication-design.md. */
  const runs = Array.isArray(runIds) && runIds.length
    ? runIds.map(id => ({ id }))
    : await panelRuns(fetchImpl);
  const runIdSet = new Set(runs.map(run => run.id));
  if (!runIdSet.size) return { documents: [], byLocator: {}, comparisons: {}, notes: {} };
```

The old constant was called `runIds`, which is now the parameter name, so every later use inside this function has to move to `runIdSet` or it will silently read the raw argument array instead of the set.

Run: `grep -n 'runIds' app/lib/links.mjs`
Expected: after the lines above, every remaining match is a `runIds.has(...)`. Change each one to `runIdSet.has(...)`.

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:routes`
Expected: PASS, the new test included and everything that passed before still passing.

- [ ] **Step 5: Commit**

```bash
git add app/lib/links.mjs app/lib/__tests__/links.test.mjs
git commit -m "feat: readerLinks reads the runs it is given"
```

---

### Task 3: The builder

**Files:**
- Create: `engine/build-links-data.mjs`
- Test: `app/lib/__tests__/build-links-data.test.mjs`

**Interfaces:**
- Consumes: `readerLinks(fetchImpl, runIds)` from Task 2.
- Produces: `buildLinks(runIds, fetchImpl)` returning the object to serialise, `serialise(value)` returning the exact bytes to write, and a command line `node engine/build-links-data.mjs --link-runs=<id>,<id> --out=<path>`.

- [ ] **Step 1: Write the failing test**

Create `app/lib/__tests__/build-links-data.test.mjs`:

```javascript
/**
 * The links builder. fetch is injected, so nothing here touches a network.
 * Run: npm run test:routes
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLinks, serialise } from "../../../engine/build-links-data.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

const RUN = "11111111-1111-4111-8111-111111111111";

function stub() {
  return async () => ({
    ok: true, status: 200, json: async () => [], text: async () => "",
  });
}

test("buildLinks refuses to build with no run named", async () => {
  await assert.rejects(() => buildLinks([], stub()), /at least one run/);
});

test("buildLinks carries the runs it was given", async () => {
  const out = await buildLinks([RUN], stub());
  assert.deepEqual(out.runs, [RUN]);
});

/* The digest publish.py records describes these exact bytes, and
 * verify_supabase_provenance.py reproduces them in Python with
 * json.dumps(obj, indent=2, ensure_ascii=False). That call cannot emit a
 * trailing newline, so this must not either, or the digest check fails for the
 * life of every publication. engine/test_publish.py runs the two side by side. */
test("serialise writes what Python's json.dumps(indent=2) writes", () => {
  assert.equal(serialise({ b: 1, a: [2, 3] }),
               '{\n  "b": 1,\n  "a": [\n    2,\n    3\n  ]\n}');
  assert.equal(serialise({}), "{}");
  assert.equal(serialise({ e: "caractère" }), '{\n  "e": "caractère"\n}');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test app/lib/__tests__/build-links-data.test.mjs`
Expected: FAIL with a module not found error for `engine/build-links-data.mjs`.

- [ ] **Step 3: Write the builder**

Create `engine/build-links-data.mjs`:

```javascript
/**
 * What a publication carries about links, written to a file for publish.py.
 *
 * The third builder, beside engine/panel/build_site_data.py and
 * engine/build-spec-reader-data.py. This one is JavaScript because the assembly
 * it needs already exists in app/lib/links.mjs, and a Python port would be a
 * second copy of it. This repository has paid for that kind of drift before:
 * bands.shown_by_default drifted from the reader's own DEFAULT_BANDS, and the
 * depth figures published off the difference were wrong until somebody asked
 * why one cell read 1.0.
 *
 * The runs are named, never guessed. Which runs the public sees is a decision a
 * publication records, not something a filter on a script name decides.
 */
import { writeFileSync } from "node:fs";
import { readerLinks } from "../app/lib/links.mjs";

export async function buildLinks(runIds, fetchImpl = fetch) {
  if (!Array.isArray(runIds) || !runIds.length) {
    throw new Error("build-links-data: name at least one run with --link-runs");
  }
  return readerLinks(fetchImpl, runIds);
}

/* Two space indentation and no trailing newline. Not a style choice: the
 * verifier re-serialises the stored JSON with
 * json.dumps(obj, **publish.FORMATS["links"]) and holds it to the recorded
 * digest, and Python's json.dumps(indent=2, ensure_ascii=False) writes exactly
 * this and cannot write a trailing newline. */
export function serialise(value) {
  return JSON.stringify(value, null, 2);
}

function argument(name) {
  const found = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
}

async function main() {
  const out = argument("out");
  if (!out) throw new Error("build-links-data: --out is required");
  const runIds = (argument("link-runs") || "").split(",").filter(Boolean);
  writeFileSync(out, serialise(await buildLinks(runIds)));
}

if (process.argv[1] && process.argv[1].endsWith("build-links-data.mjs")) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
```

`publish.py` passes `--cells=` to every builder. This one ignores it, because `argument()` reads only the flags it knows.

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:routes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/build-links-data.mjs app/lib/__tests__/build-links-data.test.mjs
git commit -m "feat: a builder writes what a publication carries about links"
```

---

### Task 4: publish.py builds and inserts the column

**Files:**
- Modify: `engine/publish.py` (`FORMATS` and `BUILDERS` near line 52, `build()` at line 240, `publish()` at line 269, `main()` at line 306)
- Test: `engine/test_publish.py` (extend `BuildTest` near line 391, and add two classes after it)

**Interfaces:**
- Consumes: the command line of Task 3, and the columns of Task 1.
- Produces: `build(name, cells, behaviours, run_date=None, panel_name=None, link_runs=())` choosing its interpreter from the builder's file extension, and `publish(store, behaviours, document_ids, rubric, published_by, notes="", run_date=None, config=None, link_runs=())` writing `links`, `links_sha256`, and `link_runs` inside `build_params`.

- [ ] **Step 1: Write the failing tests**

Add to the existing `BuildTest` class in `engine/test_publish.py`:

```python
    def test_a_javascript_builder_is_launched_with_node(self):
        seen = {}

        def fake_run(argv, capture_output, text):
            seen["argv"] = argv
            out = next(a.split("=", 1)[1] for a in argv if a.startswith("--out="))
            Path(out).write_text("{}")
            return type("Done", (), {"returncode": 0, "stderr": "", "stdout": ""})()

        with mock.patch.object(publish.subprocess, "run", fake_run):
            publish.build("links", [], ["helpfulness"], link_runs=["r1", "r0"])
        self.assertEqual(seen["argv"][0], "node")
        self.assertTrue(seen["argv"][1].endswith("build-links-data.mjs"))
        # Sorted, because the runs reach the builder's output through the object
        # it assembles, and the digest describes bytes.
        self.assertIn("--link-runs=r0,r1", seen["argv"])
```

Add a new class after `BuildTest`:

```python
class LinksFormatTest(unittest.TestCase):
    """The builder's bytes must be reproducible in Python.

    verify_supabase_provenance.py re-serialises the stored links column with
    json.dumps(obj, **FORMATS["links"]) and holds it to the recorded digest. If
    the two disagree by a single byte, every publication fails that check for
    good, so this runs the real builder's serialiser and compares.
    """

    SAMPLE = {"documents": ["a", "b"], "runs": [], "byLocator": {},
              "comparisons": {}, "notes": {"passage": {"k": {"text": "caractère"}}}}

    def test_python_reproduces_what_the_javascript_builder_writes(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not on PATH")
        script = (
            "import { serialise } from "
            f"{json.dumps(str(HERE / 'build-links-data.mjs'))};"
            f"process.stdout.write(serialise({json.dumps(self.SAMPLE)}));"
        )
        written = subprocess.run([node, "--input-type=module", "-e", script],
                                 capture_output=True, text=True)
        self.assertEqual(written.returncode, 0, written.stderr)
        self.assertEqual(written.stdout,
                         json.dumps(self.SAMPLE, **publish.FORMATS["links"]))
```

And a third class, for the refusal `publish()` gains in Step 5. This file tests its
refusals everywhere else with `assertRaises(SystemExit)`, and a hard refusal that nothing
exercises is a behaviour nobody will notice breaking. The refusal sits at the very top of
`publish()`, before the store is touched, so `None` is a safe first argument:

```python
class LinkRunsRequiredTest(unittest.TestCase):
    def test_a_publication_names_the_link_runs_it_carries(self):
        with self.assertRaises(SystemExit) as refused:
            publish.publish(None, ["helpfulness"], ["v1"], "v5", "tester")
        self.assertIn("link-runs", str(refused.exception))
```

Add `import json`, `import shutil` and `import subprocess` to the head of
`engine/test_publish.py`. None of the three is there today: it imports only `sys`,
`unittest`, `Path` and `mock`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `python3 engine/test_publish.py`
Expected: FAIL. `build("links", ...)` raises `KeyError: 'links'` because `BUILDERS` has no such entry, and `FORMATS["links"]` raises the same.

- [ ] **Step 3: Register the builder**

In `engine/publish.py`, extend the two tables:

```python
FORMATS = {
    "payload": dict(indent=1, ensure_ascii=False),
    "documents": dict(ensure_ascii=False, separators=(",", ":")),
    # What engine/build-links-data.mjs writes, byte for byte. Its serialise() is
    # JSON.stringify(value, null, 2) with no trailing newline, which is exactly
    # this call's output. test_publish.LinksFormatTest holds the two together.
    "links": dict(indent=2, ensure_ascii=False),
}
BUILDERS = {
    "payload": (HERE / "panel" / "build_site_data.py",
                ["--threshold=4", "--solid-threshold=6"]),
    "documents": (ROOT / "engine" / "build-spec-reader-data.py", []),
    "links": (ROOT / "engine" / "build-links-data.mjs", []),
}
```

- [ ] **Step 4: Teach build() to launch node, and to pass the runs**

Replace the signature and the subprocess call in `build()`:

```python
def build(name, cells, behaviours, run_date=None, panel_name=None, link_runs=()):
    script, args = BUILDERS[name]
    # The interpreter follows the builder's extension rather than a second
    # table. The links builder is JavaScript because the assembly it needs lives
    # in app/lib/links.mjs, and a Python port would be a second copy of it.
    runner = ["node"] if script.suffix == ".mjs" else [sys.executable]
    with tempfile.TemporaryDirectory() as scratch:
        cells_file = Path(scratch) / "cells.json"
        cells_file.write_text(json.dumps(cells))
        out = Path(scratch) / f"{name}.json"
        extra = [f"--run-date={run_date}"] if run_date and name == "payload" else []
        if name == "payload":
            extra.append("--behaviours=" + ",".join(sorted(behaviours)))
            if panel_name:
                extra.append(f"--panel={panel_name}")
        if name == "links":
            extra.append("--link-runs=" + ",".join(sorted(link_runs)))
        result = subprocess.run(
            [*runner, str(script), *args, *extra,
             f"--cells={cells_file}", f"--out={out}"],
            capture_output=True, text=True)
        if result.returncode != 0:
            raise SystemExit(f"{script.name} failed:\n"
                             + (result.stderr or result.stdout).strip())
        raw = out.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()
```

- [ ] **Step 5: Build and insert the column**

In `publish()`, add the parameter and the refusal:

```python
def publish(store, behaviours, document_ids, rubric, published_by, notes="",
            run_date=None, config=None, link_runs=()):
    if not link_runs:
        raise SystemExit("publish: --link-runs is required, because a publication "
                         "names the link runs it carries")
```

Beside the two existing builds:

```python
    links, links_sha256 = build("links", cells, behaviours, link_runs=link_runs)
```

In the `publication` dict, after `documents_sha256`:

```python
        "links": links,
        "links_sha256": links_sha256,
```

And in `build_params`, without which the verifier cannot rebuild the column:

```python
        "build_params": {"behaviours": sorted(behaviours),
                         "documents": sorted(document_ids),
                         "panel": panel_name, "rubric": rubric,
                         "run_date": run_date,
                         "link_runs": sorted(link_runs)},
```

- [ ] **Step 6: Add the flag**

In `main()`, after the `--run-date` argument:

```python
    parser.add_argument("--link-runs", required=True,
                        help="comma-separated aci_link_runs ids this publication carries")
```

and pass it to `publish`, adding `links` to the digests reported:

```python
    row, cells = publish(
        store,
        [s for s in args.behaviours.split(",") if s],
        [s for s in args.documents.split(",") if s],
        args.rubric, args.by, args.notes, args.run_date,
        link_runs=[s for s in args.link_runs.split(",") if s])
    print(f"published {row['id']} (not public): {len(cells)} cells")
    print(f"  payload   {row['payload_sha256'][:16]}")
    print(f"  documents {row['documents_sha256'][:16]}")
    print(f"  links     {row['links_sha256'][:16]}")
    return 0
```

The first three print lines are already worded exactly like that; the fourth is the
addition. Keep the `return 0`: replacing the block without it leaves `main()` falling
off its end.

- [ ] **Step 7: Run the tests**

Run: `python3 engine/test_publish.py`
Expected: PASS, every test in the file, the two new ones and the `test_the_payload_is_built_for_the_publication_panel` that was already there included.

- [ ] **Step 8: Commit**

```bash
git add engine/publish.py engine/test_publish.py
git commit -m "feat: a publication is built with the link runs it names"
```

---

### Task 5: The route serves the column

**Files:**
- Modify: `app/api/reader/links/route.js`
- Modify: `site/spec-reader/app.js` (`LINKS_URL`, `loadReaderLinks`, and the comment above the call)
- Test: `app/lib/__tests__/publications.test.mjs`

**Interfaces:**
- Consumes: `readerResponse(column, searchParams, fetchImpl)` from `app/lib/publications.mjs`, unchanged. It is already generic over the column name, which is what makes this task small.
- Produces: `GET /api/reader/links` and `GET /api/reader/links?publication=<uuid>` answering from the column.

- [ ] **Step 1: Write the tests**

Add to `app/lib/__tests__/publications.test.mjs`, reusing the stub helper and id constant that file already defines. If it names them differently from `stub` and `ID`, use its names rather than introducing new ones:

```javascript
test("readerResponse serves the links column, and a pin is immutable for a year", async () => {
  const { fetchImpl } = stub([{ links: { byLocator: {}, comparisons: {} } }]);
  const out = await readerResponse("links", new URLSearchParams(`publication=${ID}`), fetchImpl);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { byLocator: {}, comparisons: {} });
  assert.match(out.cacheControl, /immutable/);
});

test("readerResponse answers 404 for a publication carrying no links", async () => {
  const { fetchImpl } = stub([{ links: null }]);
  const out = await readerResponse("links", new URLSearchParams(), fetchImpl);
  assert.equal(out.status, 404);
});
```

- [ ] **Step 2: Run them**

Run: `node --test app/lib/__tests__/publications.test.mjs`
Expected: PASS already, because `readerResponse` takes the column as an argument. These pin the behaviour the route is about to depend on rather than driving a change. If either fails, stop and report it: the assumption this task rests on is wrong, and the route must not be rewritten until that is understood.

- [ ] **Step 3: Rewrite the route**

Replace the whole of `app/api/reader/links/route.js`. The file currently carries a comment saying it is not scoped to a publication, deliberately. That sentence is precisely what this task makes false, so it goes with the rest:

```javascript
/* What one document's passage does to another's, as the publication froze it.
 *
 * This read the live tables until 2026-09-18, which meant two things: pinning an
 * old publication served its documents under today's readings, and storing a run
 * changed what the public saw with no publication and no deploy. The links are a
 * column of the publication row now, built by engine/build-links-data.mjs and
 * held to a digest, so this route is the payload route with a different column
 * name. See docs/superpowers/specs/2026-09-18-links-belong-to-a-publication-design.md.
 */
import { readerResponse } from "../../../lib/publications.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { status, body, cacheControl } = await readerResponse(
    "links", new URL(request.url).searchParams);
  return Response.json(body, {
    status,
    headers: cacheControl ? { "Cache-Control": cacheControl } : {},
  });
}
```

- [ ] **Step 4: The reader forwards its pin**

Without this step the whole plan misses its point. `site/spec-reader/app.js` forwards the
`?publication=` pin to three of the four reader routes and not to this one, which was
harmless only while the route ignored publications. From Step 3 onwards, a pinned page
would serve frozen documents under the current publication's links, which is the exact
defect the spec exists to remove.

Add the constant beside its three siblings, after `BEHAVIOUR_NOTES_URL` at line 36:

```javascript
const LINKS_URL = "/api/reader/links";
```

Then in `loadReaderLinks` at line 4605, keep the existing comment block and add the pin
above the `try`, copying `loadDocuments` at line 147, which is the pattern and the
reason both:

```javascript
  /* Pinned like the payload and the documents, and for the same reason: a
   * publication carries its own links now, so a pinned page fetching them
   * unpinned would lay today's readings over yesterday's text. Read from
   * state.payloadSource rather than from the URL, so a pin that fell back reads
   * the current publication's links with its payload. */
  const pinned = state.payloadSource?.origin === "pin" ? state.payloadSource.name : null;
  try {
    const answered = await loadJSON(
      pinned ? `${LINKS_URL}?publication=${encodeURIComponent(pinned)}` : LINKS_URL);
```

The ordering this depends on already holds: `loadBehaviours()` is awaited before the
`Promise.all` that calls `loadReaderLinks`, and it is what sets `state.payloadSource`.

Last, the comment above that `Promise.all` near line 4845 says the payload's resolution
decides where the documents and the behaviour notes are read from, "so all three describe
the same publication". They are four now. Change `three` to `four`, or the sentence is
false by omission about the one route that used to be the exception.

`site/overview.js:506` also calls the route bare. Leave it: that page has no pin, so the
current publication is the right answer there.

- [ ] **Step 5: Run the whole suite**

Run: `npm run test:routes`
Expected: PASS. If a test asserted the old route's shape, read it before changing it: it may be pinning behaviour that still matters.

- [ ] **Step 6: Commit**

```bash
git add app/api/reader/links/route.js site/spec-reader/app.js \
        app/lib/__tests__/publications.test.mjs
git commit -m "feat: the links route serves the publication's own column"
```

---

### Task 6: The verifier covers the third column, and the filter goes

**Files:**
- Modify: `engine/verify_supabase_provenance.py` (the loop at line 103, the loop at line 125)
- Modify: `app/lib/links.mjs` (delete `panelRuns`)
- Test: `engine/test_verify_supabase_provenance.py` (`RebuildTest` at line 108, `StoredDigestTest` at line 156)
- Test: `app/lib/__tests__/links.test.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: a verifier that checks three columns and skips the link columns when a publication carries null; `readerLinks(fetchImpl, runIds)` with no fallback; no exported `panelRuns`.

- [ ] **Step 1: Repair the fake that a third column breaks**

`RebuildTest.test_a_publication_is_rebuilt_from_its_own_cells_with_the_publish_builders` patches `publish.build` with a fake whose signature has no `link_runs`. Give it one, or the rebuild loop will fail with a TypeError that looks like a verifier bug:

```python
        def build(name, cells, behaviours, run_date=None, panel_name=None, link_runs=()):
            seen.append((name, cells, behaviours, run_date, panel_name))
            return ({"payload": PAYLOAD, "documents": DOCUMENTS}[name],
                    row[f"{name}_sha256"])
```

- [ ] **Step 2: Write the failing tests**

Add to `RebuildTest`:

```python
    def test_a_publication_carrying_no_links_is_skipped_rather_than_failed(self):
        row = publication(PUBLIC_ID, published_at="2026-09-12", is_public=True)
        seen = []

        def build(name, cells, behaviours, run_date=None, panel_name=None, link_runs=()):
            seen.append(name)
            return ({"payload": PAYLOAD, "documents": DOCUMENTS}[name],
                    row[f"{name}_sha256"])

        with mock.patch.object(verify.publish, "build", side_effect=build):
            printed, failed = run(verify.check_the_publication_rebuilds_to_its_digests,
                                  self.store(row), row)
        self.assertEqual(failed, [], printed)
        self.assertNotIn("links", seen)
```

Add to `StoredDigestTest`:

```python
    def test_a_publication_that_carries_links_is_the_bytes_its_digest_describes(self):
        links = {"documents": [], "runs": [], "byLocator": {}, "comparisons": {}}
        raw = json.dumps(links, **verify.publish.FORMATS["links"]).encode()
        row = dict(publication(PUBLIC_ID, published_at="2026-09-12", is_public=True),
                   links=links, links_sha256=hashlib.sha256(raw).hexdigest())
        printed, failed = run(verify.check_the_published_artefacts_still_carry_their_digests, row)
        self.assertEqual(failed, [], printed)

    def test_altered_links_fail_their_digest(self):
        links = {"documents": [], "runs": [], "byLocator": {}, "comparisons": {}}
        raw = json.dumps(links, **verify.publish.FORMATS["links"]).encode()
        row = dict(publication(PUBLIC_ID, published_at="2026-09-12", is_public=True),
                   links=dict(links, byLocator={"altered": []}),
                   links_sha256=hashlib.sha256(raw).hexdigest())
        printed, failed = run(verify.check_the_published_artefacts_still_carry_their_digests, row)
        self.assertEqual(failed, ["the stored links is the bytes its digest describes"], printed)
```

The expected failure string must match what the loop actually prints for `payload`. Read the loop at line 103 and copy its wording rather than trusting the sentence above.

- [ ] **Step 3: Run them and watch them fail**

Run: `python3 engine/test_verify_supabase_provenance.py`
Expected: FAIL on the new tests, because neither loop knows the third column.

- [ ] **Step 4: Extend the verifier's two loops**

In `check_the_published_artefacts_still_carry_their_digests`:

```python
    for name, column in (("payload", "payload_sha256"),
                         ("documents", "documents_sha256"),
                         ("links", "links_sha256")):
        if publication.get(name) is None:
            continue
```

In `check_the_publication_rebuilds_to_its_digests`:

```python
    for name in ("payload", "documents", "links"):
        if publication.get(name) is None:
            continue
```

A publication written before Task 1 carries null in both link columns, and skipping is the honest answer: those rows never claimed to carry frozen links. Use the name the surrounding function actually gives the publication row; it may not be `publication`.

The rebuild loop must also pass the runs it rebuilds from, which `publish()` recorded
in `build_params`. The call as it stands reads:

```python
            _built, got = publish.build(name, cells, params.get("behaviours") or [],
                                        run_date, panel_name)
```

`params` is already bound at the top of that function to
`publication.get("build_params") or {}`, so take the runs from it rather than indexing
`publication["build_params"]`, which would raise on a row carrying none:

```python
            _built, got = publish.build(name, cells, params.get("behaviours") or [],
                                        run_date, panel_name,
                                        link_runs=params.get("link_runs") or ())
```

- [ ] **Step 5: Delete the filter**

In `app/lib/links.mjs`, delete `panelRuns` entirely, its comment block included, and simplify the head of `readerLinks`:

```javascript
export async function readerLinks(fetchImpl = fetch, runIds = null) {
  /* A publication names the runs it carries. Nothing guesses them: which runs
   * the public sees is a decision a publication records. */
  const runs = (runIds || []).map(id => ({ id }));
  const runIdSet = new Set(runs.map(run => run.id));
  if (!runIdSet.size) return { documents: [], byLocator: {}, comparisons: {}, notes: {} };
```

Run: `grep -rn 'panelRuns' app/ engine/ site/`
Expected: no match. If one remains, it is a caller to update or a test to delete.

- [ ] **Step 6: Delete the tests that pinned the filter**

In `app/lib/__tests__/links.test.mjs`, remove the tests naming `panelRuns` and its import. The test written in Task 2 covers what replaces it. Read each before deleting: if one pins something other than the script-name filter, keep that assertion by moving it into a test that still applies.

- [ ] **Step 7: Run everything**

Run: `npm run test:routes && python3 engine/test_publish.py && python3 engine/test_verify_supabase_provenance.py`
Expected: PASS on all three.

- [ ] **Step 8: Commit**

```bash
git add engine/verify_supabase_provenance.py engine/test_verify_supabase_provenance.py \
        app/lib/links.mjs app/lib/__tests__/links.test.mjs
git commit -m "feat: a publication names its link runs, and nothing guesses them"
```

---

### Task 7: Publish once, and read it before anyone else does

**Files:** none changed. This task produces a draft publication, not a commit.

**Interfaces:** consumes the whole plan. Requires Task 1 to be merged and applied to the database.

- [ ] **Step 1: Read what the current publication was built from**

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, "engine")
from store import Store
rows = Store.from_env().select("aci_publications",
    {"select": "id,is_public,build_params", "is_public": "eq.true"})
for row in rows:
    print(row["id"], row["build_params"])
PY
```

Expected: `1919ee6b...` with its `behaviours`, `documents`, `panel`, `rubric` and `run_date`. Copy those lists verbatim into Step 3; do not retype them from memory.

- [ ] **Step 2: Read the link runs**

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, "engine")
from store import Store
for row in Store.from_env().select("aci_link_runs", {"select": "id,created_by,status"}):
    print(row["id"], row["status"], row["created_by"])
PY
```

Expected: five runs, four written by `link_self.py` and one, `cc8930bd...`, by `compose_links.py`. The four are what the public sees today. Naming the fifth as well would publish 176 links the site has never shown, which is a decision for the operator, so do not include it without asking.

- [ ] **Step 3: Publish a draft**

```bash
python3 engine/publish.py \
  --behaviours=<the list from Step 1> \
  --documents=<the list from Step 1> \
  --link-runs=<the four run ids from Step 2> \
  --notes="The links, comparisons, arbitrations and paragraph notes are frozen into this publication."
```

Expected: four lines, the fourth reading `links` followed by sixteen hex characters. The row is written `is_public = False`.

- [ ] **Step 4: Verify it**

Run: `python3 engine/verify_supabase_provenance.py --publication=<the new id>`
Expected: every check passes, the two that now cover `links` included. A rebuild mismatch on `links` here means the builder's bytes and `FORMATS["links"]` disagree, which is what Task 4's `LinksFormatTest` exists to catch earlier and more cheaply.

- [ ] **Step 5: Read it before anyone else can**

Run: `npm run dev`, then open `http://127.0.0.1:3000/spec-reader/?publication=<the new id>&compare=1`
Expected: bubbles under compared paragraphs, a comparison behind the compare button, and the "in short" notes where a paragraph has more than one counterpart. Open the same page without the `?publication=` pin and compare: the two should agree, because this publication carries the four runs the live route was already serving.

- [ ] **Step 6: Stop, and hand back**

Making the publication public is a separate and reversible decision, and it belongs to the operator. Report the new id, what verified, and what the page looked like.

---

## What the whole-branch review found

The seven tasks above are what was planned, and they are left as they were
written. A review of the finished branch found four things the plan had not
named. Each was fixed before the branch was closed, and each is recorded here
rather than folded back into the tasks, because a plan that quietly grows the
work it prescribed stops being a record of what was decided in advance.

**The portal could not have published anything.** `--link-runs` is required, and
nothing on the build form supplied it, so the one route that builds publications
would have refused every one of them. The plan stopped at the command line. The
chain it needed is a `Link runs` group on the build form, `publishJobParams` in
`app/lib/publish.mjs`, the admin route refusing a build that names no link run,
and `engine/job.py`'s `run_publish` passing `link_runs` through to `publish()`.

**The judging image had no interpreter for the new builder.** Publishing is one
of the three modes of that image, so the image is where the builder runs, and it
carried Python only. It gains a Node runtime and copies exactly two library
files: `app/lib/links.mjs` and the `app/lib/supabase.mjs` it imports in turn,
which are the whole of the builder's import graph. Not the site, not the reader,
not Next, and not the rest of `app/lib`.

**Document notes had nothing pinning them.** `--link-runs` reaches everything in
the column through a run id, and document notes have no run. A publication would
therefore have served whichever document notes existed when it was read rather
than when it was built, which is the defect this plan exists to remove, surviving
in one corner of the column. `aci_document_notes` cannot honestly gain a run: its
rows were imported from two JSON files in a single batch, and its unique key ends
in `prompt_sha256`. So the prompt is what a publication pins, `--note-prompts`,
derived at build time and recorded in `build_params` beside the runs. Absent
means take every note; a list that is present pins exactly what it names,
including nothing.

**The migration let the two columns disagree.** Nullable separately, a row could
carry a digest and no bytes. That is the one shape that crashes the verifier
rather than failing it, because the verifier skips a publication on
`links is null` and would then read `links_sha256` on a row that has one. The
migration carries a check that the two are null together.
