# The Cloud Run judging job — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run's judge calls are executed on Cloud Run, writing judgements to
Supabase as they land, started by an HTTP request rather than a terminal.

**Architecture:** The work already exists as rows when the job starts: it reads
the pending calls of one run, composes each prompt from the database, issues the
calls concurrently with a cap per provider, and walks each row from `pending` to
`done`. Resume is a filter, not a log replay. A failed call keeps its raw output
and the run carries on.

**Tech Stack:** Python standard library plus `openai` (every provider is reached
through an OpenAI-compatible endpoint), PostgREST, Cloud Run Jobs, Terraform.

**Design:** `docs/superpowers/specs/2026-09-10-cloud-run-judging-job-design.md`

## Global Constraints

- **The job invents no work.** Every call exists `pending` before it starts, so
  the size of a run is known before a token is spent.
- **One provider key in the container.** `harness.resolve()` prefers a native
  route whenever its key is present, so mounting `ANTHROPIC_API_KEY` beside
  `OPENROUTER_API_KEY` would silently send the Anthropic seat direct. Only
  `OPENROUTER_API_KEY` is mounted, and a test proves every seat resolves to its
  mirror.
- **Everything through the environment.** Cloud Run Jobs substitute environment
  variables at launch, not arguments.
- **English in the repository. No secrets in it.**

---

### Task 1: Composing one call, offline

**Files:**
- Create: `engine/panel/judge_call.py`
- Create: `engine/panel/test_judge_call.py`

**Interfaces:**
- Produces:
  - `compose(call, run, registry, passages) -> (system, user)`
  - `parse(reply, passage_count, rubric) -> (verdicts, unparsed)`
  - `judgements(call_id, passages, verdicts) -> list[dict]`

- [ ] **Step 1: Write the failing tests**

Against the fixture index, so they need no network and no credentials. Pin what
matters: the prompt carries the behaviour's boundary when it has one; a reply
missing more than two percent of its lines is a parse failure rather than a
silent zero; and a judgement row is produced per passage, in document order.

- [ ] **Step 2: Run them, watch them fail**

- [ ] **Step 3: Write the module**

`compose` is `whole_doc.py`'s prompt construction lifted out of its loop and
given its inputs rather than reading them. `parse` is `parse_verdicts4` with the
ninety-eight percent gate returning the count rather than printing it.

- [ ] **Step 4: Run them, watch them pass**

- [ ] **Step 5: Commit**

---

### Task 2: The job

**Files:**
- Create: `engine/panel/batch_job.py`
- Create: `engine/panel/test_batch_job.py`

**Interfaces:**
- Produces: `python -m panel.batch_job`, reading `ACI_RUN_ID`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`.
- `run(store, run_id, call_model, concurrency) -> report` — the loop, with the
  model call injected so the tests drive it without a network.

- [ ] **Step 1: Write the failing tests**

Against a fake store and a stub model. Pin the behaviours that matter and that a
subprocess test would not see:

```python
def test_only_pending_calls_are_taken(self): ...
def test_a_call_walks_from_pending_to_done(self): ...
def test_judgements_are_written_once_per_passage(self): ...
def test_a_parse_failure_keeps_its_raw_output_and_writes_no_judgement(self): ...
def test_a_failed_call_does_not_stop_the_run(self): ...
def test_a_cancelled_run_stops_between_calls(self): ...
def test_relaunching_resumes_and_repeats_nothing(self): ...
def test_the_run_is_finished_with_its_cost_summed_from_its_calls(self): ...
```

- [ ] **Step 2: Run them, watch them fail**

- [ ] **Step 3: Write the job**

Calls run concurrently under a cap keyed by each model's *native* provider, even
though the transport is OpenRouter: a slow Anthropic budget must not throttle the
DeepSeek seat. One process, so one place where state is written.

- [ ] **Step 4: Run them, watch them pass**

- [ ] **Step 5: Commit**

---

### Task 3: Composing a run, until there is a button

**Files:**
- Create: `engine/panel/compose_run.py`
- Create: `engine/panel/test_compose_run.py`

**Interfaces:**
- Produces: `python3 engine/panel/compose_run.py --behaviours=a,b --specs=x,y
  --panel=frontier_fast [--go]` — priced and printed by default, written with
  `--go`.

- [ ] **Step 1: Write the failing tests**

The cell arithmetic is what can be wrong: the calls are the product of the
behaviours, the spec versions and the panel's seats, minus the cells a `done`
call already covers. And the estimate comes from the panel's own prices and the
documents' token counts.

- [ ] **Step 2: Run them, watch them fail**

- [ ] **Step 3: Write the composer**

It writes one `aci_runs` row carrying the rubric, the prompt and its digest, the
panel, the config, and the behaviour snapshot; then one `aci_judge_calls` row per
cell and seat, `pending`.

- [ ] **Step 4: Run them, watch them pass**

- [ ] **Step 5: Commit**

---

### Task 4: The image

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Create: `.github/workflows/deploy-runner.yml`

- [ ] **Step 1: Write the Dockerfile**

`python:3.12-slim`, the engine and nothing else: no site, no reader, no Next.
Dependencies before code, so changing a line of Python does not reinstall
`openai`.

- [ ] **Step 2: Build it and run the job against a run with no pending calls**

Expected: it finishes immediately and changes nothing. That is the cheapest
end-to-end proof that the image can reach the database and read a run.

- [ ] **Step 3: The deploy workflow**

Builds and pushes to the shared `polaris-docker` registry, then updates the job.

- [ ] **Step 4: Commit**

---

### Task 5: Terraform

**Files:**
- Create: `polaris-tf/environments/app/ai_character_index_batch.tf`

- [ ] **Step 1: Write it**

Modelled on `evals_playground_batch.tf`: a service account, the job with a
24-hour timeout and `max_retries = 0`, `roles/run.developer` for the trigger's
service account, and a secret for `OPENROUTER_API_KEY`. Not created: the image
registry, which is shared, and the Supabase secrets, which the index reuses.

- [ ] **Step 2: Hand over what needs the account holder**

The OpenRouter key must be given a version **before** the first apply, or Cloud
Run refuses to create a container mounting a secret with no version. And the new
caller entry in `BATCH_TRIGGER_CALLERS` is a secret version posted by hand: this
repository never manages a secret's value.

- [ ] **Step 3: Commit**

---

## What needs the account holder

`terraform apply`, the OpenRouter secret's value, and the callers entry. Tasks 1
to 4 run and are tested without any of them.
