# Index artifacts into Supabase — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every artifact the index publishes lives in the `evals` Supabase
project under the `aci_` prefix, and the reader payload rebuilt from the
database is byte-identical to the one committed today.

**Architecture:** Eleven tables behind PostgREST, reached by a stdlib-only
client in `engine/store.py`. `cite.py` gains an additive document-source hook so
it can read spec text from a row instead of a file, with the file read as the
untouched default. A one-shot importer loads the committed artifacts, and the
existing provenance verifier is pointed at the database to prove nothing was
lost.

**Tech Stack:** Python 3.10+ standard library only (no new dependency),
PostgREST over HTTPS, Supabase CLI for migrations, `polaris-supabase` as the
migration repository.

**Design:** `docs/superpowers/specs/2026-09-10-index-artifacts-to-supabase-design.md`

## Global Constraints

- **Stdlib only on the Python side.** CI installs nothing; `validate_data.py`
  already falls back to a built-in schema checker when `jsonschema` is absent.
  No `supabase-py`, no `requests`, no `httpx`.
- **Migrations live in `polaris-supabase`, never here.** The `evals` project's
  migration history is single and shared with two other applications.
- **Table prefix `aci_`.** No foreign key crosses into another tenant's tables.
- **English in the repository.** Identifiers, comments, commit messages, test
  names, log strings.
- **Insert-only tables are enforced by grants**, not by convention:
  `aci_spec_versions`, `aci_judgements`, `aci_publications`,
  `aci_publication_cells`, `aci_coverage` get `select, insert` and nothing else.
- **Secrets never enter the repository.** `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` come from the gitignored `.env` or the process
  environment.
- **The bench already in production has ragged panels**, and the migration
  reproduces it exactly. Four behaviours carry more judges on the constitution
  than on the model spec. The publication the migration writes is the single
  `grandfathered` one, and filling the nine missing calls is separate, later
  work.
- **The site is not touched by this plan.** Serving from the database is the
  next plan; here the committed payload stays exactly as it is, because it is
  the oracle the acceptance test compares against.

---

### Task 1: The tables

**Files:**
- Create: `polaris-supabase/evals/supabase/migrations/<ts>_create_aci_tables.sql`
- Create: `polaris-supabase/evals/supabase/migrations/<ts>_grant_service_role_on_aci_tables.sql`
- Modify: `polaris-supabase/README.md` (the ownership table gains a row)

**Interfaces:**
- Consumes: nothing.
- Produces: the eleven `aci_` tables, and the grant regime every later task
  depends on.

- [ ] **Step 1: Create the migration files**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase/evals
supabase migration new create_aci_tables
supabase migration new grant_service_role_on_aci_tables
```

- [ ] **Step 2: Write the schema**

Into `<ts>_create_aci_tables.sql`, with this header comment:

```sql
-- ai-character-index: the index's own artifacts. Third tenant of this project,
-- alongside cop-subtask-decomposition-evals and evals-playground. No foreign
-- key crosses that boundary.
--
-- Design: ai-character-index/docs/superpowers/specs/
--         2026-09-10-index-artifacts-to-supabase-design.md
```

Then the eleven `create table` statements exactly as the design document gives
them, in this order (foreign keys require it): `aci_labs`, `aci_specs`,
`aci_spec_versions`, `aci_behaviours`, `aci_runs`, `aci_judge_calls`,
`aci_judgements`, `aci_publications`, `aci_publication_cells`,
`aci_cell_curation`, `aci_coverage`.

Add the homogeneity trigger and the partial unique index exactly as the design
document gives them, then these indexes, which the design implies and the
builders need:

```sql
create index aci_spec_versions_spec_idx on aci_spec_versions (spec_id);
create index aci_judge_calls_run_idx on aci_judge_calls (run_id, status);
create index aci_judge_calls_cell_idx on aci_judge_calls (behaviour_slug, spec_version_id);
create index aci_judgements_call_idx on aci_judgements (call_id);
create index aci_publication_cells_pub_idx on aci_publication_cells (publication_id);
```

- [ ] **Step 3: Write the grants**

Into `<ts>_grant_service_role_on_aci_tables.sql`:

```sql
-- The service role is the only caller: the browser never reaches this database.
-- Five tables are insert-only, which is what makes the byte-exact citation
-- guarantee structural rather than conventional. aci_judge_calls is the
-- exception among the work tables: its status has to move pending -> running ->
-- done, so it takes update. Nothing it records is a citation.

grant select, insert on
  aci_spec_versions, aci_judgements, aci_publications,
  aci_publication_cells, aci_coverage
  to service_role;

grant select, insert, update, delete on
  aci_labs, aci_specs, aci_behaviours, aci_cell_curation
  to service_role;

grant select, insert, update on aci_runs, aci_judge_calls to service_role;

grant usage, select on sequence aci_judgements_id_seq to service_role;
grant usage, select on sequence aci_coverage_id_seq to service_role;
```

- [ ] **Step 4: Review what would be applied**

Run: `supabase db push --dry-run`
Expected: the two new migrations listed, and nothing else. If any other
migration appears, stop: the local history is behind the remote and pushing
would apply someone else's work.

- [ ] **Step 5: Apply**

Run: `supabase db push`
Expected: `Finished supabase db push.`

- [ ] **Step 6: Verify the grant regime from outside**

Run, from `ai-character-index`:

```bash
set -a; . ./.env; set +a
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/aci_labs?select=id&limit=1"
```

Expected: `200`.

- [ ] **Step 7: Commit, in `polaris-supabase`**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase
git add evals/supabase/migrations evals/supabase/schema.sql README.md
git commit -m "feat(evals): the ai-character-index tables"
```

---

### Task 2: The store

**Files:**
- Create: `engine/store.py`
- Create: `engine/test_store.py`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from the environment.
- Produces:
  - `Store(url: str, key: str)`
  - `Store.from_env() -> Store` — exits loudly when either variable is missing
  - `Store.select(table: str, params: dict | None = None) -> list[dict]`
  - `Store.insert(table: str, rows: list[dict], chunk: int = 1000) -> None`
  - `Store.update(table: str, match: dict, patch: dict) -> None`
  - `StoreError(Exception)`

- [ ] **Step 1: Write the failing tests**

Into `engine/test_store.py`. The transport is injectable, so no network is
touched and CI stays offline.

```python
"""Store tests. The transport is injected, so nothing here touches a network."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from store import Store, StoreError


class FakeTransport:
    """Records requests and replays canned responses."""

    def __init__(self, responses=None):
        self.calls = []
        self.responses = list(responses or [])

    def __call__(self, method, url, headers, body):
        self.calls.append({"method": method, "url": url,
                           "headers": headers, "body": body})
        if self.responses:
            return self.responses.pop(0)
        return 200, b"[]"


class StoreTest(unittest.TestCase):
    def store(self, transport):
        return Store("https://example.supabase.co", "KEY", transport=transport)

    def test_select_builds_a_postgrest_query(self):
        t = FakeTransport([(200, b'[{"id": "anthropic"}]')])
        rows = self.store(t).select("aci_labs", {"select": "id", "limit": "1"})
        self.assertEqual(rows, [{"id": "anthropic"}])
        self.assertEqual(t.calls[0]["method"], "GET")
        self.assertIn("/rest/v1/aci_labs?", t.calls[0]["url"])
        self.assertIn("select=id", t.calls[0]["url"])

    def test_the_key_travels_in_both_headers(self):
        t = FakeTransport()
        self.store(t).select("aci_labs")
        headers = t.calls[0]["headers"]
        self.assertEqual(headers["apikey"], "KEY")
        self.assertEqual(headers["Authorization"], "Bearer KEY")

    def test_insert_chunks_so_one_request_never_carries_a_whole_runlog(self):
        t = FakeTransport()
        self.store(t).insert("aci_judgements",
                             [{"locator": str(i)} for i in range(2500)],
                             chunk=1000)
        self.assertEqual(len(t.calls), 3)
        self.assertEqual(len(json.loads(t.calls[0]["body"])), 1000)
        self.assertEqual(len(json.loads(t.calls[2]["body"])), 500)

    def test_insert_of_nothing_makes_no_request(self):
        t = FakeTransport()
        self.store(t).insert("aci_judgements", [])
        self.assertEqual(t.calls, [])

    def test_update_matches_with_postgrest_equality(self):
        t = FakeTransport()
        self.store(t).update("aci_judge_calls", {"id": "abc"},
                             {"status": "done"})
        self.assertEqual(t.calls[0]["method"], "PATCH")
        self.assertIn("id=eq.abc", t.calls[0]["url"])
        self.assertEqual(json.loads(t.calls[0]["body"]), {"status": "done"})

    def test_a_refused_write_is_loud_and_quotes_the_body(self):
        t = FakeTransport([(403, b'{"message":"permission denied"}')])
        with self.assertRaises(StoreError) as caught:
            self.store(t).insert("aci_spec_versions", [{"markdown": "x"}])
        self.assertIn("403", str(caught.exception))
        self.assertIn("permission denied", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 engine/test_store.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'store'`

- [ ] **Step 3: Write the store**

Into `engine/store.py`:

```python
"""PostgREST access to the index's aci_ tables.

Standard library only. CI installs nothing on the python side, and the panel
half of this repository has always run on the stdlib; a client is a hundred
lines and not worth a dependency that would have to be installed in the runner,
the Cloud Run image and every contributor's machine.

The transport is injectable so the tests never touch a network.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


class StoreError(Exception):
    """A request PostgREST refused. Carries the status and the body."""


def _urllib_transport(method, url, headers, body):
    request = urllib.request.Request(url, method=method, headers=headers,
                                     data=body.encode("utf-8") if body else None)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


class Store:
    def __init__(self, url, key, transport=None):
        self.url = url.rstrip("/")
        self.key = key
        self.transport = transport or _urllib_transport

    @classmethod
    def from_env(cls):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set "
                     "(a gitignored .env next to this repo is the usual place)")
        return cls(url, key)

    def _headers(self, extra=None):
        headers = {"apikey": self.key,
                   "Authorization": f"Bearer {self.key}",
                   "Content-Type": "application/json"}
        headers.update(extra or {})
        return headers

    def _request(self, method, table, query=None, body=None, extra_headers=None):
        url = f"{self.url}/rest/v1/{table}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        status, payload = self.transport(method, url, self._headers(extra_headers),
                                         json.dumps(body) if body is not None else None)
        if status >= 300:
            raise StoreError(f"{method} {table} -> {status}: "
                             f"{payload.decode('utf-8', 'replace')[:500]}")
        return payload

    def select(self, table, params=None):
        return json.loads(self._request("GET", table, query=params or {}) or b"[]")

    def insert(self, table, rows, chunk=1000):
        """Rows in batches. A whole runlog is thirty thousand rows, and one
        request carrying all of them is several megabytes of JSON."""
        for start in range(0, len(rows), chunk):
            self._request("POST", table, body=rows[start:start + chunk],
                          extra_headers={"Prefer": "return=minimal"})

    def update(self, table, match, patch):
        query = {column: f"eq.{value}" for column, value in match.items()}
        self._request("PATCH", table, query=query, body=patch,
                      extra_headers={"Prefer": "return=minimal"})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 engine/test_store.py -v`
Expected: `Ran 6 tests`, `OK`

- [ ] **Step 5: Commit**

```bash
git add engine/store.py engine/test_store.py
git commit -m "feat: a stdlib PostgREST client for the index tables"
```

---

### Task 3: `cite.py` learns to read a document from somewhere else

**Files:**
- Modify: `engine/spec-cite/cite.py` (the registry globals near line 79, and
  `load_spec` / `first_heading_title` near line 375)
- Create: `tests/test_cite_document_source.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `cite.use_registry(entries: dict[tuple[str, str], object], defaults: dict[str, str], meta: dict, document_source)` — installs a registry and a reader
  - `cite.reset_registry()` — restores the bundled plus user-manifest state
  - The value stored in `SPECS` is no longer required to be a path; it is
    whatever the installed document source understands. The default source
    treats it as a repository-relative path, which is the behaviour every
    existing test pins.

- [ ] **Step 1: Write the failing test**

Into `tests/test_cite_document_source.py`:

```python
"""The document-source seam: cite.py can read a spec's text from somewhere
other than a file, without changing anything for the file-backed default."""
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "engine" / "spec-cite"))
import cite


DOC = "\n".join([
    "# Acme Spec",
    "",
    "## First section",
    "",
    "A paragraph that exists only in memory.",
])


class DocumentSourceTest(unittest.TestCase):
    def tearDown(self):
        cite.reset_registry()

    def test_the_default_registry_is_the_bundled_files(self):
        self.assertIn(("constitution", "2026-01-20"), cite.SPECS)
        version, sections, lines = cite.load_spec("constitution", None)
        self.assertEqual(version, "2026-01-20")
        self.assertGreater(len(lines), 100)

    def test_an_installed_source_supplies_the_text(self):
        seen = []

        def source(key):
            seen.append(key)
            return DOC

        cite.use_registry({("acme", "2026-01-01"): "row-1"},
                          {"acme": "2026-01-01"},
                          {("acme", "2026-01-01"): {"title": "Acme Spec"}},
                          source)
        version, sections, lines = cite.load_spec("acme", None)
        self.assertEqual(version, "2026-01-01")
        self.assertEqual(seen, ["row-1"])
        self.assertEqual(lines[0], "# Acme Spec")
        self.assertTrue(any(s.title == "First section" for s in sections))

    def test_an_installed_registry_replaces_the_bundled_one(self):
        cite.use_registry({("acme", "2026-01-01"): "row-1"},
                          {"acme": "2026-01-01"}, {}, lambda key: DOC)
        self.assertNotIn(("constitution", "2026-01-20"), cite.SPECS)

    def test_reset_puts_the_bundled_registry_back(self):
        cite.use_registry({("acme", "2026-01-01"): "row-1"},
                          {"acme": "2026-01-01"}, {}, lambda key: DOC)
        cite.reset_registry()
        self.assertIn(("constitution", "2026-01-20"), cite.SPECS)
        self.assertIn("Anthropic", "\n".join(cite.load_spec("constitution", None)[2]))

    def test_spec_meta_uses_the_source_for_a_derived_title(self):
        cite.use_registry({("acme", "2026-01-01"): "row-1"},
                          {"acme": "2026-01-01"}, {}, lambda key: DOC)
        self.assertEqual(cite.spec_meta("acme")["title"], "Acme Spec")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m unittest tests.test_cite_document_source -v`
Expected: FAIL, `AttributeError: module 'cite' has no attribute 'reset_registry'`

- [ ] **Step 3: Add the seam**

In `engine/spec-cite/cite.py`, immediately after the `USER_SPEC_META = {}`
declaration, add:

```python
# What turns a registry value into markdown. None is the file-backed default:
# the value is a repository-relative path, which is what the bundled registry
# and the user manifest both hold. The Supabase store installs one that takes a
# spec-version row id instead. Additive on purpose -- every existing test and
# corpus golden runs through the default and is untouched.
DOCUMENT_SOURCE = None


def use_registry(entries, defaults, meta, document_source):
    """Install a registry and the reader that resolves its values.

    entries: {(name, version): key}, defaults: {name: version},
    meta: {(name, version): {"title": ..., "sourceUrl": ...}},
    document_source: key -> markdown text.
    """
    global SPECS, DEFAULT_VERSION, USER_SPEC_META, DOCUMENT_SOURCE
    SPECS = dict(entries)
    DEFAULT_VERSION = dict(defaults)
    USER_SPEC_META = dict(meta)
    DOCUMENT_SOURCE = document_source


def reset_registry():
    """Back to bundled specs plus the user manifest, reading from disk."""
    global DOCUMENT_SOURCE
    DOCUMENT_SOURCE = None
    load_user_manifest()


def _read_document(spec, version, key):
    if DOCUMENT_SOURCE is not None:
        return DOCUMENT_SOURCE(key)
    try:
        return (REPO_ROOT / key).read_text(encoding="utf-8")
    except OSError as e:
        sys.exit(f"cannot read spec document '{key}' for {spec}@{version}: {e}")
```

Then replace the body of `load_spec`:

```python
def load_spec(spec, version):
    version, key = resolve_spec(spec, version)
    lines = _read_document(spec, version, key).splitlines()
    return version, parse_sections(lines), lines
```

And the body of `first_heading_title`, keeping its docstring and its loud
failure:

```python
def first_heading_title(path, spec, version):
    """Derive a display title from the document's first heading. Used when a
    user-spec manifest entry omits 'title'. Loud if there is no heading."""
    sections = parse_sections(_read_document(spec, version, path).splitlines())
    if not sections:
        sys.exit(
            f"user spec '{spec}@{version}' has no 'title' in its manifest "
            f"entry and no heading in {path} to derive one from -- "
            "add a 'title' to the entry"
        )
    return sections[0].title
```

- [ ] **Step 4: Run the new test and the whole existing suite**

Run: `python3 -m unittest tests.test_cite_document_source -v`
Expected: `Ran 5 tests`, `OK`

Run: `python3 -m unittest discover -s tests`
Expected: `Ran 118 tests`, `OK` — the 113 that passed before, plus these five.
Any failure among the original 113 means the seam changed the default path,
which it must not.

- [ ] **Step 5: Commit**

```bash
git add engine/spec-cite/cite.py tests/test_cite_document_source.py
git commit -m "feat: cite.py can take its spec text from a source other than disk"
```

---

### Task 4: The index reads itself out of the database

**Files:**
- Create: `engine/index_store.py`
- Create: `engine/test_index_store.py`

**Interfaces:**
- Consumes: `store.Store` (Task 2), `cite.use_registry` (Task 3).
- Produces:
  - `spec_registry(store) -> (entries, defaults, meta, source)` — the four
    arguments `cite.use_registry` takes, built from `aci_specs` and
    `aci_spec_versions`; `source` caches each document after its first read
  - `install_registry(store) -> None` — calls `cite.use_registry` with them
  - `behaviours(store) -> dict[str, dict]` — the registry in the shape
    `data/behaviours.json` has, keyed by slug
  - `cell_curation(store) -> list[dict]` — the shape `data/panel-cell-curation.json`
    carries under `cells`
  - `runlog_rows(store, run_id) -> list[dict]` — judgements in the JSONL row
    shape the builders already consume: `behaviour`, `spec`, `model`,
    `locator`, `verdict`, `relevant`, `parsed`, `rubric`, `via`

- [ ] **Step 1: Write the failing tests**

Into `engine/test_index_store.py`. A fake store replays rows, so no network.

```python
"""index_store shapes database rows back into what the builders already read."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "engine" / "spec-cite"))
import cite
import index_store


class FakeStore:
    def __init__(self, tables):
        self.tables = tables
        self.selects = []

    def select(self, table, params=None):
        self.selects.append((table, params or {}))
        return self.tables.get(table, [])


SPECS = [{"id": "acme", "lab_id": "acme-labs", "title": "Acme Spec",
          "short_title": "Acme", "source_url": "https://example.com/spec",
          "locator_style": "path"}]
VERSIONS = [{"id": "row-1", "spec_id": "acme", "version": "2026-01-01",
             "markdown": "# Acme Spec\n\n## A section\n\nA paragraph.",
             "content_sha256": "abc", "source_url": "https://example.com/spec"}]


class SpecRegistryTest(unittest.TestCase):
    def tearDown(self):
        cite.reset_registry()

    def test_entries_are_keyed_by_name_and_version_and_hold_the_row_id(self):
        entries, defaults, meta, source = index_store.spec_registry(
            FakeStore({"aci_specs": SPECS, "aci_spec_versions": VERSIONS}))
        self.assertEqual(entries, {("acme", "2026-01-01"): "row-1"})
        self.assertEqual(defaults, {"acme": "2026-01-01"})
        self.assertEqual(meta[("acme", "2026-01-01")]["title"], "Acme Spec")

    def test_the_source_reads_the_markdown_and_then_caches_it(self):
        fake = FakeStore({"aci_specs": SPECS, "aci_spec_versions": VERSIONS})
        _, _, _, source = index_store.spec_registry(fake)
        before = len(fake.selects)
        self.assertIn("# Acme Spec", source("row-1"))
        self.assertIn("# Acme Spec", source("row-1"))
        self.assertEqual(len(fake.selects), before,
                         "the markdown came with the version rows; "
                         "reading it twice must not query twice")

    def test_installing_it_lets_cite_resolve_a_locator_against_a_row(self):
        index_store.install_registry(
            FakeStore({"aci_specs": SPECS, "aci_spec_versions": VERSIONS}))
        version, sections, lines = cite.load_spec("acme", None)
        self.assertEqual(version, "2026-01-01")
        self.assertEqual(lines[0], "# Acme Spec")

    def test_the_newest_version_is_the_default_when_several_exist(self):
        versions = VERSIONS + [dict(VERSIONS[0], id="row-2", version="2026-06-01")]
        _, defaults, _, _ = index_store.spec_registry(
            FakeStore({"aci_specs": SPECS, "aci_spec_versions": versions}))
        self.assertEqual(defaults, {"acme": "2026-06-01"})


class BehaviourTest(unittest.TestCase):
    def test_behaviours_come_back_in_the_registry_file_shape(self):
        rows = [{"slug": "helpfulness", "name": "Helpfulness",
                 "set_name": "reader-test", "numeric_id": 1,
                 "group_name": "Behaviours under test",
                 "definition": "A definition.", "facets": []}]
        got = index_store.behaviours(FakeStore({"aci_behaviours": rows}))
        self.assertEqual(got["helpfulness"], {
            "name": "Helpfulness", "set": "reader-test", "numeric_id": 1,
            "group": "Behaviours under test",
            "definition": "A definition.", "facets": [],
        })


class RunlogTest(unittest.TestCase):
    def test_judgements_come_back_in_the_jsonl_row_shape(self):
        calls = [{"id": "call-1", "run_id": "run-1",
                  "behaviour_slug": "helpfulness", "spec_version_id": "row-1",
                  "model": "sol", "status": "done"}]
        judgements = [{"call_id": "call-1", "locator": "acme@2026-01-01 > A > 1",
                       "verdict": 2, "relevant": 1, "parsed": True}]
        rows = index_store.runlog_rows(
            FakeStore({"aci_specs": SPECS, "aci_spec_versions": VERSIONS,
                       "aci_runs": [{"id": "run-1", "rubric": "v5",
                                     "config": {"via": "wholedoc-v5"}}],
                       "aci_judge_calls": calls,
                       "aci_judgements": judgements}),
            "run-1")
        self.assertEqual(rows, [{
            "behaviour": "helpfulness", "spec": "acme", "model": "sol",
            "locator": "acme@2026-01-01 > A > 1", "verdict": 2,
            "relevant": 1, "parsed": True, "rubric": "v5",
            "via": "wholedoc-v5",
        }])

    def test_a_call_that_is_not_done_contributes_nothing(self):
        calls = [{"id": "call-1", "run_id": "run-1",
                  "behaviour_slug": "helpfulness", "spec_version_id": "row-1",
                  "model": "sol", "status": "error"}]
        rows = index_store.runlog_rows(
            FakeStore({"aci_specs": SPECS, "aci_spec_versions": VERSIONS,
                       "aci_runs": [{"id": "run-1", "rubric": "v5", "config": {}}],
                       "aci_judge_calls": calls, "aci_judgements": []}),
            "run-1")
        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python3 engine/test_index_store.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'index_store'`

- [ ] **Step 3: Write the module**

Into `engine/index_store.py`, with the five functions the Interfaces block
names. Notes that the tests above pin:

- `spec_registry` selects `aci_spec_versions` once with its `markdown` column
  and keeps the text in a dict, so `source(key)` never queries again.
- The default version of a spec is its newest `version` label, string-sorted,
  which is a date in every case the registry allows.
- `behaviours` renames three columns back: `set_name` to `set`, `group_name` to
  `group`, and leaves the rest.
- `runlog_rows` joins judgements to their call, drops any call whose status is
  not `done`, resolves `spec_version_id` to the spec's name, and stamps the
  run's `rubric` and its config's `via` on every row.

- [ ] **Step 4: Run them to verify they pass**

Run: `python3 engine/test_index_store.py -v`
Expected: `Ran 7 tests`, `OK`

- [ ] **Step 5: Commit**

```bash
git add engine/index_store.py engine/test_index_store.py
git commit -m "feat: read the index's registry and judgements back out of the tables"
```

---

### Task 5: The importer

**Files:**
- Create: `engine/migrate_to_supabase.py`
- Create: `engine/test_migrate_to_supabase.py`

**Interfaces:**
- Consumes: `store.Store`, the committed artifacts.
- Produces: a `--dry-run` that reports counts without writing, and a real run
  that fills the eleven tables. Idempotent: re-running inserts nothing twice,
  keyed on `aci_spec_versions.content_sha256` and on the unique constraints of
  `aci_judge_calls` and `aci_judgements`.

- [ ] **Step 1: Write the failing tests**

Into `engine/test_migrate_to_supabase.py`, against a recording fake store. Pin
these, which are the mappings that can silently go wrong:

```python
def test_every_runlog_slug_resolves_against_the_registry(self): ...
def test_the_v5_log_becomes_sixty_seven_calls(self): ...
def test_judgements_hang_off_their_call(self): ...
def test_coverage_numeric_ids_resolve_to_slugs_of_the_index_set(self): ...
def test_a_second_run_inserts_nothing(self): ...
def test_the_first_publication_selects_every_cell_of_the_v5_run(self): ...
def test_the_first_publication_is_the_grandfathered_one(self): ...
```

The first three read the real committed `engine/panel/runlog-v5.jsonl`, which is
what makes them worth having: the counts are facts about the shipped artifact,
not about a fixture. Sixty-seven is `len({(behaviour, spec, model)})` over that
file, and it is not `9 x 2 x 3` precisely because the panels are ragged.

- [ ] **Step 2: Run them to verify they fail**

Run: `python3 engine/test_migrate_to_supabase.py -v`
Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write the importer**

Into `engine/migrate_to_supabase.py`. Order matters, foreign keys enforce it:
labs and specs, spec versions, behaviours, runs, judge calls, judgements, cell
curation, coverage, and last the publication with its cells.

Each source maps as the design document's migration table says. Two mappings
need care and both are pinned by the tests above: coverage rows carry the index
set's file-local `behaviour_id` and resolve through the registry's per-set
numeric space to a slug, and the runlog has no notion of a call so one is
reconstructed per distinct behaviour, spec and model, with its meter columns
left null.

- [ ] **Step 4: Run them to verify they pass**

Run: `python3 engine/test_migrate_to_supabase.py -v`
Expected: `Ran 6 tests`, `OK`

- [ ] **Step 5: Dry-run against the real database**

Run: `python3 engine/migrate_to_supabase.py --dry-run`
Expected: a table of counts ending `judgements 31293`, and `nothing written`.

- [ ] **Step 6: Run it**

Run: `python3 engine/migrate_to_supabase.py`
Expected: the same counts, written.

- [ ] **Step 7: Run it again, and confirm it is idempotent**

Run: `python3 engine/migrate_to_supabase.py`
Expected: the same counts reported, `0 inserted`.

- [ ] **Step 8: Commit**

```bash
git add engine/migrate_to_supabase.py engine/test_migrate_to_supabase.py
git commit -m "feat: import the committed artifacts into the index tables"
```

---

### Task 6: The builders read the database, and the payload still matches byte for byte

**Files:**
- Modify: `engine/panel/build_site_data.py` (a `--from-supabase` source)
- Modify: `engine/build-spec-reader-data.py` (the same)
- Create: `engine/verify_supabase_provenance.py`

**Interfaces:**
- Consumes: `index_store` (Task 4), a migrated database (Task 5).
- Produces: `verify_supabase_provenance.py`, exit 0 when the payload built from
  the database is byte-identical to `site/spec-reader/data/behaviours-v5-reader.json`
  and the documents payload matches `site/spec-reader/data/documents.json`.

- [ ] **Step 1: Write the verifier as the failing test**

It is the acceptance test of the whole plan, so it is written first and fails
until the builders can read the database.

```bash
python3 engine/verify_supabase_provenance.py
```

Expected before the builders move: FAIL, `build_site_data.py has no
--from-supabase`.

- [ ] **Step 2: Give `build_site_data.py` a database source**

The behaviour metadata already comes from a registry the flag `--registry=PATH`
selects. Add `--from-supabase`, which installs the registry from
`index_store.behaviours`, the runlog rows from `index_store.runlog_rows`, and
the cell curation from `index_store.cell_curation`, leaving every other code
path exactly as it is.

- [ ] **Step 3: Give `build-spec-reader-data.py` the same**

`--from-supabase` calls `index_store.install_registry` before it resolves
anything, so `cite.py` reads spec text from rows. Everything downstream is
unchanged, which is the point of the seam in Task 3.

- [ ] **Step 4: Run the verifier**

Run: `python3 engine/verify_supabase_provenance.py`
Expected:
```
OK  behaviours-v5-reader.json rebuilt from Supabase, byte-identical
OK  documents.json rebuilt from Supabase, byte-identical
```

- [ ] **Step 5: Run every existing gate, which must be untouched**

Run:
```bash
python3 engine/panel/verify_panel_provenance.py
python3 -m unittest discover -s tests
python3 engine/validate_data.py
python3 engine/test_builders_reproduce_payloads.py
```
Expected: all pass. The file-backed path is still the default everywhere, so a
failure here means the flag leaked into it.

- [ ] **Step 6: Commit**

```bash
git add engine/panel/build_site_data.py engine/build-spec-reader-data.py \
        engine/verify_supabase_provenance.py
git commit -m "feat: the builders can read the index out of Supabase, provably identically"
```

---

## What this plan does not do

The site still serves the committed payloads from Cloudflare Pages. Moving it to
routes on Vercel is the next plan, and it depends on this one being provably
finished: the byte comparison in Task 6 is what says the database holds
everything the files held.

The judging harness still writes a local JSONL. The Cloud Run job is the third
plan.
