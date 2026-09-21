# Depth out of ten: the data and the engine, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store depths out of ten and the assessment of each document in Supabase, produce them for the four published documents with the panel, and build a draft publication (not public) that carries both.

**Architecture:** One migration in `polaris-supabase` keys `aci_depths` by prompt so the scale of four and the scale of ten live side by side, and adds five tables for the assessment. The pilot's logic moves into two engine modules (`depth_ladder.py`, `assessment_run.py`) that the pilot and two new command-line tools share: `engine/assess.py` runs and stores an assessment, `engine/panel/depth_pass.py` gives depths out of ten to the calls of existing runs. `publish.py` and `build_site_data.py` gain a depth prompt and an assessment run; with neither, every existing publication rebuilds byte for byte. The site is the next plan: nothing here is made public.

**Tech Stack:** Python 3 standard library, `unittest` through `pytest`, PostgreSQL through Supabase migrations, Node for the links builder.

**Design:** `docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md`, including its two "What the pilot showed" sections, which amend it.

## Decisions taken since the design (owner, 21 September 2026)

- A depth that does not parse is asked again with a format reminder, then a one-shot example, then given by the seat's declared substitute (`kimi` for `deepseek`, `opus` then `kimi` for `fable`). Done in the pilot in `a36edf3`.
- The contradictions of the assessment are found and confirmed by `sol`, `fable` and `kimi`: `kimi` sits in `deepseek`'s place for those two questions. The criteria are scored by `sol`, `fable` and `deepseek`.
- The published list of contradictions comes from the judges alone for now and is shown as not read by a person. The database keeps room for a person's reading later.
- The first publication on the scale of ten carries neither the comparison paragraphs nor the depth notes, since all 53 comparison paragraphs and all 39 depth notes quote figures out of 4. They are written again in a later plan.

## Global Constraints

- The ai-character-index work happens in the worktree `/Users/sverbo/Desktop/Codes/Polaris/ai-character-index-depth-to-ten`, branch `feat/depth-to-ten-and-document-assessment`. The main checkout carries another session's uncommitted work; do not touch it.
- The polaris-supabase work happens in a new worktree `/Users/sverbo/Desktop/Codes/Polaris/polaris-supabase-depth-to-ten` on a new branch `aci-depth-out-of-ten` from `origin/main`. The main polaris-supabase checkout sits on someone's branch `aci-page-feedback`; do not touch it.
- Everything written to either repository is in English, with British spelling. No long dashes (`—` or `–`) anywhere, and no `--` used as a dash in new prose.
- Every existing publication must rebuild byte for byte: with no depth prompt and no assessment run, `build_site_data.py` writes exactly what it writes today, and `verify_supabase_provenance.py` passes on `1919ee6b` as it does today.
- The scale of four stays the default everywhere it is today: `compose_run`, `batch_job`, the portal's publish route and `publish.py` without the new flags behave as they do now.
- Nothing spends money or writes to the database without an explicit `--go`, and no task applies the migration or runs a paid command: those are Task 6, with the owner's go.
- Tests run with `python3 -m pytest` from the ai-character-index worktree root, and `node --test app/lib/__tests__/*.test.mjs` for the JavaScript. `engine/test_job.py::JobDispatchTest::test_publish_takes_documents_and_no_panel` fails already on `develop` and is out of scope.
- Every commit message, in either repository, ends with exactly:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SyUZkS2ecDtKxgjs1CxSG7
```

---

### Task 1: The migration

**Files:**
- Create (polaris-supabase worktree): `evals/supabase/migrations/20260921180000_aci_depth_out_of_ten_and_the_document_as_a_whole.sql`

**Steps:**

- [ ] Create the worktree: `cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase && git fetch origin && git worktree add -b aci-depth-out-of-ten ../polaris-supabase-depth-to-ten origin/main`.
- [ ] Read `evals/supabase/migrations/20260914150000_aci_depths_and_documents_named_by_lab.sql` and `20260917120000_aci_a_paragraph_about_one_passage_and_one_document.sql` for the house style of comments.
- [ ] Write the migration below. Its header comment explains, in the house style, why depths are keyed by prompt (two scales side by side, and every earlier publication keeps rebuilding), why the backfill reads `finished_at` (the three runs' configs name `bd096eba`, but the 12 rows finished before the prompt changed at 08:28:31 UTC on 16 September were given under `20df8c4d`), and why claims carry room for a person's reading.

```sql
-- 1. The assessment of a document as a whole.

create table aci_assessment_runs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  created_by    text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'running', 'done', 'error', 'cancelled')),
  error         text,
  -- The seats of each question, for example
  -- {"criteria": ["sol", "fable", "deepseek"], "contradictions": ["sol", "fable", "kimi"]}.
  -- The confirmation is asked of the contradictions' seats.
  panels        jsonb not null,
  -- {"criteria": <sha256>, "contradictions": <sha256>, "confirm": <sha256>}
  prompts       jsonb not null,
  config        jsonb not null,
  estimated_usd numeric(12, 6),
  cost_usd      numeric(12, 6)
);

create table aci_assessment_calls (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references aci_assessment_runs(id) on delete cascade,
  spec_version_id   uuid not null references aci_spec_versions(id),
  question          text not null check (question in ('criteria', 'contradictions', 'confirm')),
  seat              text not null,
  -- The model that answered, which differs from the seat when a declared
  -- substitute did; null until the call has answered.
  model             text,
  status            text not null default 'pending'
                    check (status in ('pending', 'running', 'done', 'error', 'cancelled')),
  error             text,
  -- Every attempt, in order: {"model", "finish_reason", "cost_usd", "reason"}.
  attempts          jsonb not null default '[]'::jsonb,
  raw_output        text,
  finish_reason     text,
  prompt_tokens     integer,
  completion_tokens integer,
  cost_usd          numeric(12, 6),
  seconds           numeric(10, 2),
  started_at        timestamptz,
  finished_at       timestamptz,
  unique (run_id, spec_version_id, question, seat)
);

create table aci_assessment_scores (
  call_id    uuid not null references aci_assessment_calls(id) on delete cascade,
  criterion  text not null
             check (criterion in ('conflict_rules', 'contradictions', 'rule_force',
                                  'reasons', 'situations')),
  score      smallint not null check (score between 0 and 4),
  rationale  text not null default '',
  -- For conflict_rules, the passages the judge cited as the document's general
  -- rules for conflicts.
  locators   text[] not null default '{}',
  primary key (call_id, criterion)
);

create table aci_assessment_claims (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references aci_assessment_runs(id) on delete cascade,
  spec_version_id  uuid not null references aci_spec_versions(id),
  -- The pair, in a fixed order so that one pair is one row.
  first_locator    text not null,
  second_locator   text not null,
  situation        text not null,
  why              text not null,
  found_by         text[] not null,
  -- A person's reading. Null until someone has read the claim.
  reviewed_verdict text check (reviewed_verdict in ('holds', 'does not hold')),
  reviewed_by      text,
  reviewed_at      timestamptz,
  check (first_locator < second_locator),
  check ((reviewed_verdict is null) = (reviewed_by is null)
         and (reviewed_by is null) = (reviewed_at is null)),
  unique (run_id, spec_version_id, first_locator, second_locator)
);

create table aci_assessment_verdicts (
  claim_id  uuid not null references aci_assessment_claims(id) on delete cascade,
  call_id   uuid not null references aci_assessment_calls(id) on delete cascade,
  seat      text not null,
  holds     boolean not null,
  absolute  boolean,
  reason    text not null default '',
  primary key (claim_id, seat)
);

create index aci_assessment_calls_by_run on aci_assessment_calls (run_id);
create index aci_assessment_claims_by_run on aci_assessment_claims (run_id);

-- 2. Depths keyed by their prompt, on the scale they were given on.

alter table aci_depths
  add column scale               smallint not null default 4 check (scale in (4, 10)),
  add column prompt_sha256       text,
  add column assessment_run_id   uuid references aci_assessment_runs(id),
  add column model               text,
  add column substitution_reason text,
  add column attempts            jsonb not null default '[]'::jsonb;

update aci_depths
   set prompt_sha256 = case
         when finished_at < timestamptz '2026-09-16 08:28:31+00'
           then '20df8c4df239bc782e652a681431ab71e7dba630e93f6279dbd634033ded8c3f'
         else 'bd096ebada4c197579570c3f39a5e9be03e605b8ea701e4658fa4289a2c74a1e'
       end;

do $$
begin
  if (select count(*) from aci_depths
       where prompt_sha256 = '20df8c4df239bc782e652a681431ab71e7dba630e93f6279dbd634033ded8c3f') <> 12
  or (select count(*) from aci_depths
       where prompt_sha256 = 'bd096ebada4c197579570c3f39a5e9be03e605b8ea701e4658fa4289a2c74a1e') <> 156
  then
    raise exception 'aci_depths backfill: expected 12 rows under 20df8c4d and 156 under bd096eba';
  end if;
end $$;

alter table aci_depths alter column prompt_sha256 set not null;
alter table aci_depths drop constraint aci_depths_depth_check;
alter table aci_depths add constraint aci_depths_depth_on_its_scale
  check (depth between 0 and scale);
alter table aci_depths drop constraint aci_depths_pkey;
alter table aci_depths add primary key (call_id, prompt_sha256);
alter table aci_depths add constraint aci_depths_a_substitute_says_why
  check ((model is null) = (substitution_reason is null));
alter table aci_depths add constraint aci_depths_ten_reads_an_assessment
  check ((scale = 10) = (assessment_run_id is not null));

-- 3. Grants. Evidence is inserted and read; statuses move; a person's reading
-- of a claim is the only thing on a claim that is ever updated.

grant select, insert, update on public.aci_assessment_runs to service_role;
grant select, insert, update on public.aci_assessment_calls to service_role;
grant select, insert on public.aci_assessment_scores to service_role;
grant select, insert on public.aci_assessment_verdicts to service_role;
grant select, insert on public.aci_assessment_claims to service_role;
grant update (reviewed_verdict, reviewed_by, reviewed_at)
  on public.aci_assessment_claims to service_role;
```

- [ ] Check the two constraint names the migration drops exist under those names: `grep -n "aci_depths" evals/supabase/migrations/*.sql` shows the table was created with an unnamed column check and an unnamed primary key, which PostgreSQL names `aci_depths_depth_check` and `aci_depths_pkey`. Say so in a comment above the two `drop constraint` lines.
- [ ] Commit in the polaris-supabase worktree with the message `aci: depths keyed by their prompt, and the document as a whole` followed by a body of two or three sentences and the two attribution lines. Do not push and do not apply: Task 6 does both with the owner.

---

### Task 2: Depth rows keyed by their prompt

**Files:**
- Modify: `engine/panel/compose_run.py` (`depth_rows`)
- Modify: `engine/panel/batch_job.py` (`pending_depths`, `one_depth`, the cost roll-up)
- Modify: `engine/index_store.py` (`cell_depths`)
- Modify: `engine/publish.py` (`_depth_complete_keys`, `require_depths`)
- Tests: `engine/panel/test_compose_run.py`, `engine/panel/test_batch_job.py`, `engine/test_index_store.py`, `engine/test_publish.py`

**Requirements:**

1. `compose_run.depth_rows(calls)` writes `{"call_id", "status": "pending", "scale": 4, "prompt_sha256": depth_call.prompt_sha256(4)}` per call.
2. `batch_job` reads and writes only the depth rows of the scale-of-four prompt: `pending_depths` selects `aci_depths` rows with `prompt_sha256=eq.<digest of four>`, and every `store.update("aci_depths", match, ...)` in `one_depth` matches on `{"call_id", "prompt_sha256"}`. The run's cost roll-up sums every depth row of the run's calls, whatever its prompt, since every one was paid for.
3. `index_store.cell_depths(store, cells, prompt_sha256=None)` reads only the depth rows of `prompt_sha256` (the scale-of-four digest when None). Each judge's entry is `{"depth", "rationale"}` as today, plus `"model"` and `"substitution_reason"` only when the row's `model` is not null. The cell's entry gains `"scale"` only when the rows' scale is 10; a cell whose rows disagree on scale raises `SystemExit`. With no argument, the output is exactly what it is today.
4. `publish._depth_complete_keys` and `require_depths` take the digest they are checking (default the scale-of-four digest) and pass it down.
5. A test in `engine/test_index_store.py` holds `cell_depths(store, cells)` for a store holding both a row of four and a row of ten for the same call to the row of four, byte for byte as today's output, and `cell_depths(store, cells, <digest of ten>)` to the row of ten with `"scale": 10`.

Commit message: `feat: a depth row belongs to its prompt` with a short body and the attribution lines.

---

### Task 3: The ladder and the assessment, as engine modules, and a command to run an assessment

**Files:**
- Create: `engine/panel/depth_ladder.py`
- Create: `engine/panel/assessment_run.py`
- Create: `engine/assess.py`
- Modify: `engine/pilot_scale_ten.py` (imports the two modules instead of defining their logic)
- Modify: `engine/panel/panel-config.json` (an `assessment` block)
- Tests: `engine/panel/test_depth_ladder.py`, `engine/panel/test_assessment_run.py`, `engine/test_assess.py`; `engine/test_pilot_scale_ten.py` keeps passing unchanged.

**Requirements:**

1. `panel-config.json` gains `"assessment": {"criteria": ["sol", "fable", "deepseek"], "contradictions": ["sol", "fable", "kimi"]}`. Substitutes stay in the `substitutes` block of `frontier_fast`.
2. `depth_ladder.give(tag, system, user, config, call_model, panel="frontier_fast") -> dict` is the pilot's `depth_with_ladder`, moved: the model three times (plain, reminder 1, reminder 2), then each declared substitute of `tag` twice (plain, reminder 1), the first parsing attempt answering, every attempt recorded with its model, reminder, finish reason, cost and whether it parsed. It returns `{"depth", "rationale", "model", "substitution_reason", "attempts", "replies"}`, where `replies` lists every attempt's text in order so a caller can save them. The pilot calls it and keeps its files and summary exactly as today.
3. `assessment_run.py` holds, moved from the pilot and unchanged in behaviour: calling a seat with its substitutes (`ask_with_substitutes`, which now also skips a substitute already seated for the same question, recorded as `{"model", "reason": "already seated"}`), pooling claims by unordered pair, choosing each seat's claims to confirm, the confirmed and absolute rules, the score from confirmed claims, and the general conflict rules (passages cited by at least two seats). Each function takes plain data and a `call_model`, and none reads or writes the store. The pilot imports them.
4. `engine/assess.py --documents=<version ids> [--go]`:
   - Prices the assessment of each document: per seat of each question, the whole labelled document plus the question's output allowance, and for confirmation the whole document plus 3,000 characters of claims. Prints the price. Without `--go` it writes nothing.
   - With `--go`, inserts one `aci_assessment_runs` row (`created_by` from `--by`, default the user name; `panels` from the config's `assessment` block; `prompts` the three digests; `config` the substitutes block; `estimated_usd`), then for each document the calls in order: criteria per criteria seat, contradictions per contradictions seat, confirmation per contradictions seat that has claims to confirm. Each call row is inserted `pending`, set `running`, then `done` with `model`, `attempts`, `raw_output` (kept only when the reply does not parse completely), tokens, cost and seconds, or `error` with its reason.
   - Writes `aci_assessment_scores` for each criteria call (four rows, with `locators` for conflict_rules) and for each contradictions call (one row, `contradictions`, the judge's own score), `aci_assessment_claims` for every pooled claim (locators ordered so `first_locator < second_locator`), and `aci_assessment_verdicts` for every confirmation verdict and for every finder (`holds` true, `absolute` null, reason `found it`).
   - Sets the run `done` with its summed cost, or `error` with the first failure that stopped it. A seat that could not answer any candidate leaves its call in `error` and the run goes on.
   - Prints the run id.
5. Tests drive `assess.py`'s functions against a FakeStore that records inserts and updates (like `engine/test_job.py`'s) and a scripted model: the rows written for one document with three seats, a claim found by two seats and confirmed by the third, a seat refused by a content filter answered by its substitute, a substitute already seated skipped, and price mode writing nothing.

Commit message: `feat: an assessment of a whole document is run and stored` with a short body and the attribution lines.

---

### Task 4: Depths out of ten for existing runs

**Files:**
- Create: `engine/panel/depth_pass.py`
- Test: `engine/panel/test_depth_pass.py`

**Requirements:**

1. `python3 engine/panel/depth_pass.py --runs=<run ids> --assessment-run=<id> [--go]`.
2. For every done call of the named runs, a depth row of the scale-of-ten prompt is pending if none exists: `{"call_id", "prompt_sha256": depth_call.prompt_sha256(10), "scale": 10, "assessment_run_id", "status": "pending"}`. Existing rows of that prompt are left alone, so the command resumes.
3. A cell's depths are given when all its calls are done, over the passages `batch_job.pending_depths` would retain for the scale of four (the same bands, from the same judgements), with the conflict rules of that cell's document taken from the assessment run: the `locators` of its `conflict_rules` scores cited by at least two seats, resolved through `h.passages`. A document the assessment run did not assess stops the command before anything is written, naming it.
4. Each depth goes through `depth_ladder.give`. The row is updated `done` with `depth`, `rationale`, `passages`, `attempts`, tokens and cost summed over the attempts, `model` and `substitution_reason` when a substitute answered, or `error` when nothing parsed, keeping the last reply in `raw_output`. A cell with nothing retained is depth 0 without a call, as today.
5. Without `--go` it prices the pass (one call per depth, plus a line saying the ladder can make up to five) and writes nothing.
6. Tests with a FakeStore that records writes: pending rows inserted once and not twice, the rules block built from the assessment's locators, a substitute recorded, the price mode writing nothing, and an unassessed document refused.

Commit message: `feat: the depths of existing runs, given out of ten` with a short body and the attribution lines.

---

### Task 5: A publication that carries depths out of ten and the assessment

**Files:**
- Modify: `engine/panel/build_site_data.py`
- Modify: `engine/publish.py`
- Modify: `engine/build-links-data.mjs`
- Modify: `engine/verify_supabase_provenance.py`
- Tests: `engine/panel/test_build_site_data.py`, `engine/test_publish.py`, `app/lib/__tests__/build-links-data.test.mjs`, and a new rebuild test

**Requirements:**

1. `build_site_data.py` takes `--depth-prompt=<sha256>` (default the scale-of-four digest) and `--assessment-run=<id>` (default none). Depths come from `index_store.cell_depths(store, cells, <digest>)`. When the depths are out of ten, the payload gains a top-level `"depthScale": 10`. When an assessment run is named, the payload gains a top-level `"assessment"` object keyed by document id, each holding:
   - `"criteria"`: for `conflict_rules`, `rule_force`, `reasons` and `situations`, `{"mean", "judges": {seat: {"score", "rationale", "model"?}}}`, the mean rounded to one decimal;
   - `"contradictions"`: the claims, each `{"first", "second", "situation", "why", "foundBy", "holds", "doesNotHold", "absolute", "confirmed", "reviewed": null}` plus the text of both passages, and `"score"`, computed from confirmed claims by the rule of the second pilot;
   - `"total"`: the four criteria means plus the contradictions score, rounded to one decimal, out of 20.
   With neither flag, the payload is byte for byte what it is today.
2. `publish.py` takes `--depth-prompt` and `--assessment-run` (the portal's job passes neither, so its publications are unchanged). A publication out of ten requires an assessment run that assessed every document it carries, and refuses otherwise before anything is written. `build_params` records `depth_prompt_sha256` and `assessment_run_id` only when they were given. For a publication out of ten, the links build is asked to leave out comparisons, and `note_prompts` holds only the digests of `standing` notes, so no paragraph quoting a figure out of 4 is carried; `build_params` records `"comparisons": false`.
3. `build-links-data.mjs` takes `--without-comparisons`, which writes `comparisons: {}`. Without it, its output is unchanged.
4. `verify_supabase_provenance.py` rebuilds a publication with its recorded `depth_prompt_sha256`, `assessment_run_id` and `comparisons` when present, and as today when absent.
5. A test holds that `publish.build("payload", ...)` for `1919ee6b`'s recorded build parameters, against a FakeStore holding rows of both scales, produces the same bytes as with rows of four only.

Commit message: `feat: a publication can carry depths out of ten and the document as a whole` with a short body and the attribution lines.

---

### Task 6: With the owner: migrate, assess, give depths, build a draft

Each step that writes to the production database or spends money needs the owner's go at that step, after the price is shown.

- [ ] Apply the migration: in the polaris-supabase worktree, push the branch and open a pull request; the `Migrations` workflow has failed on every run since #30, so apply by hand from `evals/` with `supabase db push`, after the owner's go. Check afterwards that `aci_depths` has 12 rows under `20df8c4d` and 156 under `bd096eba`, and that `python3 engine/verify_supabase_provenance.py` still passes on `1919ee6b`.
- [ ] Price and run the assessment of the four documents: `python3 engine/assess.py --documents=<the four version ids>`, then with `--go` after the owner's go.
- [ ] Price and run the depth pass over the runs `1919ee6b` selects (`aef5e906`, `c2f1b34a`, `a2bdadba`, full ids from `aci_publication_cells`): `python3 engine/panel/depth_pass.py --runs=... --assessment-run=<id>`, then with `--go` after the owner's go.
- [ ] Build the draft: `python3 engine/publish.py --behaviours=<the thirteen> --documents=<the four> --link-runs=<the link runs 9b7ce377 names> --depth-prompt=<digest of ten> --assessment-run=<id>`. It is written not public. Run `python3 engine/verify_supabase_provenance.py --publication=<id>` on it.
- [ ] Append "What the full run showed" to the design: the costs, the depth grid out of ten, the four documents' assessments, and anything refused. Commit it, and report to the owner in French. The site is the next plan.
