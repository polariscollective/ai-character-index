# The database is the only source — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: executed, 2026-09-12.** All six tasks are done. Three things went
differently from the plan. The corpus goldens were never committed as text, only
as digests, so the pattern this plan applied to the payloads was already in the
repository one level down. The builder's run ledger went too: timestamped run
files and a manifest were how a local run got pinned by `?data=`, and they lived
in a directory this plan deletes. And seventeen smoke tests on the judging CLIs
were lost rather than rewritten, because they ran against a staged file tree that
cannot exist now; the Cloud Run job supersedes those CLIs.

**Goal:** No module reads the index from a file. The `aci_` tables are the only
place the behaviour registry, the spec text, the judgements and the payloads
live.

**Architecture:** The digest oracle is recorded first, while the files are still
there to be trusted. Then the two readers that default to disk — `cite.py` and
`harness.load_registry()` — flip to the database, with fixtures installed
through the existing `use_registry` seam for the tests that must stay offline.
Only then are the files deleted, and only then do the gates whose subject is
gone go with them.

**Tech Stack:** Python standard library, PostgREST.

**Design:** `docs/superpowers/specs/2026-09-10-the-database-is-the-only-source-design.md`

## Global Constraints

- **Order matters.** Record the digests before deleting anything; delete only
  after every reader has flipped. A deletion that precedes its readers turns a
  loud failure into a silent one.
- **CI stays offline and knows no secret.** Every test either uses a fixture or
  moves to the scheduled provenance job.
- **A fixture is not a source of truth.** It is small, synthetic, and chosen to
  exercise a case. It never describes the real index.
- **Stdlib only on the Python side. English in the repository.**

---

### Task 1: The digest oracle

**Files:**
- Create: `engine/published-artefacts.sha256.json`
- Create: `engine/record_published_artefacts.py`
- Modify: `engine/verify_supabase_provenance.py`

**Interfaces:**
- Produces: a digest per artifact, and a verifier that compares against it
  rather than against a file.

- [ ] **Step 1: Record the digests from the verified state**

`record_published_artefacts.py` writes the SHA-256 of the two committed payloads
and of each source the migration read, with the date and the commit they were
recorded at. Run it once, now, while the files are still present and the
verifier still passes against them.

- [ ] **Step 2: Make the verifier compare digests**

The two rebuild checks stop reading `site/spec-reader/data/*.json` and compare
the rebuilt bytes' digest against the recorded one. The two stored-payload
checks do the same against the publication's own `payload_sha256` and
`documents_sha256`.

- [ ] **Step 3: Both ways must agree, once**

Run the verifier against the files and against the digests and confirm the
same verdict. This is the only moment both exist; if they disagree, the digests
are wrong and everything after is built on sand.

- [ ] **Step 4: Commit**

---

### Task 2: Fixtures for the tests that survive

**Files:**
- Create: `tests/fixtures/index/behaviours.json`, `.../judging.json`,
  `.../spec.md`, `.../runlog.jsonl`
- Create: `tests/fixtures/index/__init__.py` helper that installs them through
  `cite.use_registry` and returns a registry for `harness`

**Interfaces:**
- Produces: `install_fixture_index()` — one call that puts a small synthetic
  index in front of `cite` and `harness`, for any test that needs one.

- [ ] **Step 1: Write the fixture**

Two behaviours, one with a boundary and one without, so the defined and
undefined states are both exercised. One spec of a few sections, with an anchor
heading and a path heading, so both locator styles resolve. A runlog covering
one behaviour against it.

- [ ] **Step 2: Prove the fixture exercises what the real data did**

A test asserting the fixture resolves a locator, composes a judge prompt with a
scope and one without, and builds a payload.

- [ ] **Step 3: Commit**

---

### Task 3: `cite.py` and `harness` read the database

**Files:**
- Modify: `engine/spec-cite/cite.py`
- Modify: `engine/panel/harness.py`
- Modify: `engine/index_store.py`
- Modify: the tests that read the real registries

**Interfaces:**
- Produces: `index_store.judging_registry(store)`; `cite` with no registry until
  one is installed; `harness.load_registry()` reading the database.

- [ ] **Step 1: Write the failing test**

Importing `cite` and calling `load_spec` with no registry installed must exit
with a message naming `use_registry`. Silence here is the failure mode this
whole plan exists to remove.

- [ ] **Step 2: Remove the bundled registry**

`BUNDLED_SPECS`, `BUNDLED_DEFAULT_VERSION`, the user manifest and the
import-time `load_user_manifest()` call go. `SPECS` starts empty.

- [ ] **Step 3: Flip `harness.load_registry()`**

It reads `index_store.judging_registry(store)`, which returns the `judging`
column where there is one and the display-shape adaptation where there is not.

- [ ] **Step 4: Point the surviving tests at the fixture**

- [ ] **Step 5: Run the whole suite**

- [ ] **Step 6: Commit**

---

### Task 4: The builders lose their flag

**Files:**
- Modify: `engine/panel/build_site_data.py`, `engine/build-spec-reader-data.py`

- [ ] **Step 1: Remove `--from-supabase` and the file branch**

Both builders read the database, always. `DOCUMENTS` and `BEHAVIOURS` go.

- [ ] **Step 2: Rebuild and check the digests**

Run: `python3 engine/verify_supabase_provenance.py`
Expected: the rebuilt payloads still carry the recorded digests.

- [ ] **Step 3: Commit**

---

### Task 5: The files go, and the gates that have nothing left to guard

**Files:**
- Delete: `data/`, `engine/panel/behaviours.json`, both runlogs, the two spec
  texts, `site/spec-reader/data/`
- Delete: `engine/validate_data.py`, `engine/test_validate_data.py`,
  `engine/generate_behaviour_constants.py`, `tests/test_behaviour_registry.py`,
  `tests/test_coverage_json.py`, `engine/stage_user_demo.py`,
  `tests/test_custom_spec_decoupling.py`
- Modify: `engine/panel/verify_panel_provenance.py`, both browser walkers

- [ ] **Step 1: Delete the data**

- [ ] **Step 2: Delete the gates whose subject is gone**

Each with a reason in the commit message: a drift gate for constants that no
longer exist, a schema gate with no JSON left, a re-resolution the Supabase
verifier already performs, and the staging for a clone-and-fork path this fork
gave up on the record.

- [ ] **Step 3: Point the browser walkers at fixtures**

`engine/reader-routes.mjs` serves the fixture payloads rather than the committed
ones, and the user-extended half of the feature harness goes with the staging it
depended on.

- [ ] **Step 4: Grep is the test**

Run a grep for reads of the deleted paths across `engine/`, `tests/`, `app/`,
`.github/`. Nothing may match. The point of this work is that no such read
remains, so the check is the absence itself.

- [ ] **Step 5: Run everything**

- [ ] **Step 6: Commit**

---

### Task 6: CI, the scheduled job, and the documents

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/provenance.yml`
- Modify: `SYSTEM.md`, `ROOT.md`, `README.md`, `CLAUDE.md`, `tests/README.md`,
  `engine/README.md`, `engine/panel/README.md`, `specs/OVERVIEW.md`

- [ ] **Step 1: CI drops what it no longer runs**

- [ ] **Step 2: The provenance job**

A scheduled workflow running `verify_supabase_provenance.py` against the real
database, with the Supabase secrets, reporting on failure. This is where the
credentials live; CI keeps knowing none.

- [ ] **Step 3: Bring the current-state documents current**

`SYSTEM.md`'s dependency map and its contracts describe a file-fed pipeline.
They are current-state documents and must say what is true.

- [ ] **Step 4: Record the divergence**

`CLAUDE.md` gains a line: the clone-and-fork path is gone here and lives
upstream.

- [ ] **Step 5: Run everything, commit, push**
