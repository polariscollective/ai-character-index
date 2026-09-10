# Behaviours carry what the judges were asked — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: executed, 2026-09-10.** All three tasks are done. The composition
check was confirmed to bite rather than merely pass: composed from the display
half alone, the prompt reads `Scope (optional): none provided` where the real one
carries the construct's frontier.

**Goal:** `aci_behaviours` carries the judging registry entry for every slug that
has one, and the run snapshot records the definitions the run actually used.

**Architecture:** One nullable jsonb column holding the judging entry whole. The
importer fills it from `engine/panel/behaviours.json` and reconciles rows that
already exist, because the behaviours were migrated before the column existed.

**Tech Stack:** Python standard library, PostgREST, Supabase CLI.

**Design:** `docs/superpowers/specs/2026-09-10-behaviours-carry-what-the-judges-were-asked-design.md`

## Global Constraints

- **Stdlib only on the Python side.**
- **Migrations live in `polaris-supabase`.** Pull before writing one: that repo
  has moved under this session twice already.
- **`judging` is nullable.** Undefined is a legitimate state, and where it is
  null `harness._panel_shape` still adapts the display fields, so the
  clone-and-fork path keeps working.
- **English in the repository.**

---

### Task 1: The column

**Files:**
- Create: `polaris-supabase/evals/supabase/migrations/<ts>_aci_behaviours_carry_the_judging_entry.sql`

- [ ] **Step 1: Pull, then write the migration**

```sql
-- What the panel is told about a behaviour, held whole rather than field by
-- field: the judging entry is a contract owned by harness.compose_query, it
-- already has seven fields across ten entries, and it will gain more as rubrics
-- change. Stored whole, the job hands this column straight to compose_query.
--
-- Nullable because undefined is a legitimate state: a behaviour someone has just
-- registered is defined when it carries a query, and judged only once a call for
-- it reaches done. Where this is null, harness._panel_shape still adapts the
-- display fields, which is the clone-and-fork path.

alter table aci_behaviours add column judging jsonb;
```

- [ ] **Step 2: Dry-run, then apply**

Run: `supabase db push --dry-run`, then `supabase db push`.
Expected: the one migration listed. If anything else appears, stop and read it:
this project has three tenants and the others push too.

- [ ] **Step 3: Commit in `polaris-supabase`**

---

### Task 2: The importer fills it, and corrects the run snapshot

**Files:**
- Modify: `engine/migrate_to_supabase.py`
- Modify: `engine/test_migrate_to_supabase.py`

**Interfaces:**
- Produces: `JUDGING` (the path constant), `plan()` rows carrying `judging`, and
  a reconcile pass in `migrate()` that updates rows already present.

- [ ] **Step 1: Write the failing tests**

```python
def test_every_judging_slug_exists_in_the_display_registry(self): ...
def test_behaviours_carry_their_judging_entry_whole(self): ...
def test_a_behaviour_with_no_judging_entry_carries_null(self): ...
def test_the_run_snapshot_names_the_judging_definitions(self): ...
def test_reconcile_updates_a_row_that_is_already_there(self): ...
```

The first three read the two committed registries, so they are facts about the
shipped files: ten judging entries, all of them slugs the display registry
already knows, and `general-welfare-impacts-strict` with none.

- [ ] **Step 2: Run them, watch them fail**

Run: `python3 engine/test_migrate_to_supabase.py -v`

- [ ] **Step 3: Fill the column and reconcile**

`plan()` adds `judging` to each behaviour row, and merges the judging entry into
the run's `behaviours` snapshot so it records what the run was told rather than
what the reader displays.

`migrate()` gains a reconcile pass. Insert-only was enough while every table was
being filled for the first time; a column added afterwards means the rows are
there and wrong. Reconcile compares the planned row against the stored one on
the columns the plan owns, and updates where they differ. It runs on
`aci_behaviours` and on `aci_runs`, the two tables that take an update, and
nowhere else.

- [ ] **Step 4: Run them, watch them pass**

- [ ] **Step 5: Run it against the database, twice**

Run: `python3 engine/migrate_to_supabase.py`
Expected: `aci_behaviours 23 rows, 0 to insert, 10 to update` and
`aci_runs 1 rows, 0 to insert, 1 to update`.

Run it again.
Expected: nothing to insert and nothing to update.

- [ ] **Step 6: Commit**

---

### Task 3: The check that would have caught the omission

**Files:**
- Modify: `engine/verify_supabase_provenance.py`

- [ ] **Step 1: Add three checks**

- Every slug in the judging registry has a `judging` column equal to it.
- **Composing the judge prompt from the database produces the same text as
  composing it from the file**, for all ten. This is the one that matters: the
  other two compare records, and this one compares what a model would be sent.
  It is what the missing column actually broke.
- The run snapshot names the judging definitions, and for
  `animal-welfare-impacts` names the `query_v2` the rubric prefers.

- [ ] **Step 2: Run the verifier**

Run: `python3 engine/verify_supabase_provenance.py`
Expected: eleven OK lines.

- [ ] **Step 3: Run every gate**

- [ ] **Step 4: Commit**

---

## What this plan does not do

Nothing here is visible to a reader. The sidebar popup is the next document.
