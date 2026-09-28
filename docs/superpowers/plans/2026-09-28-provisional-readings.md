# Provisional readings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Microsoft AI's Code of Conduct passages per behaviour, a depth out of ten and a depth summary in the doc reader, read by one model in session and labelled provisional, without a panel run.

**Architecture:** A provisional run is an ordinary run of one seat flagged `provisional`; the judging, assessment and depth pipelines run unchanged with their model call replaced by a file wire answered by the session's agents. The publisher takes a provisional cell only where no panel cell exists, reads each document's depths with the assessment run that assessed it, and the builder marks every provisional cell, depth and assessment so the reader and the MCP say so.

**Tech Stack:** Python 3 engine (`engine/`), Supabase Postgres (`polaris-supabase`), vanilla JS reader (`site/spec-reader/app.js`), Node MCP (`app/lib`).

**Spec:** `docs/superpowers/specs/2026-09-28-provisional-readings-design.md`. Comparisons (links) are out of scope.

## Global Constraints

- Everything written to the repository is English, British spelling, and carries no em dash or en dash.
- A company's own text names no other company (`tests/test_company_texts_are_absolute.py`).
- Quorums follow the seats: `min(QUORUM, number of seats)`, so a panel of three keeps two and a run of one seat needs one.
- A publication built without provisional cells is byte for byte what it was (`engine/test_publication_rebuilds.py`).
- Migrations are merged on `polaris-supabase` `main` and pushed from `main` with `supabase db push` from `evals/` (CI is broken).
- No provider is called and nothing is spent: the seat `opus-5.5` carries no price.
- Tests: `python3 -m pytest -q tests engine` and `node --test app/lib/__tests__/*.test.mjs` both pass before every commit; `node engine/panel/test_appjs_depth.js` for the reader.

---

### Task 1: The database knows a provisional run

**Files:**
- Create: `polaris-supabase/evals/supabase/migrations/20260928120000_aci_provisional_readings.sql`

- [ ] **Step 1: Write the migration**

```sql
-- A provisional reading: one model answering in a working session, recorded in
-- the tables the panel writes to, published only where no panel reading exists.
-- Design: ai-character-index docs/superpowers/specs/2026-09-28-provisional-readings-design.md

alter table public.aci_runs
  add column provisional boolean not null default false;
alter table public.aci_runs
  add constraint aci_runs_provisional_has_one_seat
  check (not provisional or cardinality(panel) = 1);

alter table public.aci_assessment_runs
  add column provisional boolean not null default false;
alter table public.aci_assessment_runs
  add constraint aci_assessment_runs_provisional_has_one_seat
  check (not provisional or (
    jsonb_array_length(panels -> 'criteria') = 1
    and jsonb_array_length(panels -> 'contradictions') = 1));

-- A provisional cell is held to its own run's one seat; every other cell to the
-- publication's panel as seated, exactly as before.
create or replace function aci_publication_cell_is_publishable()
returns trigger language plpgsql as $$
declare
  pub  aci_publications%rowtype;
  run  aci_runs%rowtype;
  seen text[];
  want text[];
begin
  select * into pub from aci_publications where id = new.publication_id;
  select * into run from aci_runs where id = new.run_id;

  if run.rubric is distinct from pub.rubric then
    raise exception 'run % does not carry rubric % of publication %',
      new.run_id, pub.rubric, new.publication_id;
  end if;

  select array_agg(model order by model) into seen
    from aci_judge_calls
   where run_id = new.run_id
     and behaviour_slug = new.behaviour_slug
     and spec_version_id = new.spec_version_id
     and status = 'done'
     and model <> 'manual';

  if run.provisional then
    want := run.panel;
  else
    select array_agg(coalesce(s.substitute, p.seat) order by coalesce(s.substitute, p.seat))
      into want
      from unnest(pub.panel) as p(seat)
      left join aci_seat_substitutions s
        on s.run_id = new.run_id
       and s.behaviour_slug = new.behaviour_slug
       and s.spec_version_id = new.spec_version_id
       and s.seat = p.seat;
  end if;

  if seen is distinct from want then
    raise exception 'cell %/% was judged by %, publication panel as seated for this cell is %',
      new.behaviour_slug, new.spec_version_id, coalesce(seen, '{}'), want;
  end if;

  return new;
end;
$$;
```

- [ ] **Step 2: Branch, commit, PR, merge, push**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase
git checkout main && git pull -q && git checkout -b aci-provisional-readings
git add evals/supabase/migrations/20260928120000_aci_provisional_readings.sql
git commit -m "feat(aci): a provisional run, one model in session, publishable where no panel read"
git push -u origin aci-provisional-readings
gh pr create --title "aci: provisional readings" --body "..."
gh pr merge --merge
git checkout main && git pull -q
cd evals && supabase db push
```

Expected: `supabase db push` applies `20260928120000_aci_provisional_readings.sql`.

- [ ] **Step 3: Check it live**

Insert a provisional run with two seats through the service role: expect the check constraint to refuse it (nothing is written).

---

### Task 2: A session seat, and a provisional run of judge calls

**Files:**
- Modify: `engine/panel/panel-config.json` (models: `opus-5.5`; panels: `session_opus_5_5`)
- Modify: `engine/panel/compose_run.py` (`plan(..., provisional=False)`)
- Create: `engine/panel/session_seat.py`
- Test: `engine/panel/test_session_seat.py`

**Interfaces:**
- Produces: `compose_run.plan(store, behaviours, documents, panel_name, rubric, config, again, provisional=False) -> (run, calls)`; a provisional run carries `"provisional": True` and its `created_by` is set by the caller.
- Produces: `session_seat.SEAT = "opus-5.5"`, `session_seat.PANEL = "session_opus_5_5"`, `session_seat.judge_questions(store, calls, registry, versions, rubric) -> [(key, call, system, user)]`, `session_seat.Pending(BaseException)`, `session_seat.stopping_wire(folder)`.

- [ ] **Step 1: Config**

In `models`, beside `opus-5`:

```json
"opus-5.5": {
  "provider": "anthropic",
  "id": "claude-opus-5-5",
  "_note": "Not a hosted seat, and no request for it is ever sent to a provider. It names Claude Opus 5.5 answering from inside a Claude Code session, driven by engine/panel/session_seat.py, for a provisional reading. It carries no price_per_mtok deliberately: batch_job.cost_of then records null, which this project reads as unknown rather than as free."
}
```

In `panels`: `"session_opus_5_5": ["opus-5.5"]`, with `"_session_opus_5_5_note"` saying it is one seat, provisional, published only where no panel reading exists, and never the display panel.

- [ ] **Step 2: Failing tests** (`engine/panel/test_session_seat.py`)

```python
def test_a_provisional_plan_is_one_seat_and_says_so(self):
    run, calls = compose_run.plan(store, ["helpfulness"], ["v1"], "session_opus_5_5",
                                  config=CONFIG, provisional=True)
    self.assertTrue(run["provisional"])
    self.assertEqual(run["panel"], ["opus-5.5"])
    self.assertEqual({c["model"] for c in calls}, {"opus-5.5"})

def test_a_plan_that_is_not_provisional_carries_no_flag(self):
    run, _ = compose_run.plan(store, ["helpfulness"], ["v1"], "frontier_fast", config=CONFIG)
    self.assertNotIn("provisional", run)

def test_the_question_is_the_one_batch_job_would_send(self):
    [(key, call, system, user)] = session_seat.judge_questions(store, calls, REGISTRY, VERSIONS, "v5")
    expected = judge_call.compose("helpfulness", "v5", REGISTRY, PASSAGES)
    self.assertEqual((system, user), expected)
    self.assertEqual(key, link_self.key_of(user))

def test_a_stopping_wire_writes_the_question_and_raises_past_exception_handlers(self):
    wire = session_seat.stopping_wire(tmp)
    with self.assertRaises(session_seat.Pending):
        try:
            wire(provider="anthropic", model_id="claude-opus-5-5", system="S", user="U", kwargs={})
        except Exception:
            self.fail("an Exception handler caught it")
    self.assertTrue((tmp / f"{link_self.key_of('U')}.question").exists())

def test_a_stopping_wire_returns_an_answer_once_written(self):
    (tmp / f"{link_self.key_of('U')}.answer").write_text("DEPTH: 3")
    reply, usage, finish, seconds = session_seat.stopping_wire(tmp)(
        provider="a", model_id="b", system="S", user="U", kwargs={})
    self.assertEqual((reply, usage, finish, seconds), ("DEPTH: 3", {}, "in-session", None))
```

- [ ] **Step 3: Implement**

`compose_run.plan` gains `provisional=False`; when true, `run["provisional"] = True` and `run["created_by"] = "session_seat.py"`.

`session_seat.py`:

```python
class Pending(BaseException):
    """A question written and not yet answered. BaseException, so no handler
    written for a provider's failure catches it: the pipeline stops where it
    stands, records no refusal, and is taken up again once the answer exists."""

def stopping_wire(folder):
    def call_model(provider, model_id, system, user, kwargs):
        key = link_self.key_of(user)
        answer = folder / f"{key}.answer"
        if answer.exists():
            return answer.read_text(encoding="utf-8"), {}, "in-session", None
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{key}.question").write_text(f"{system}\n\n---- the call ----\n\n{user}",
                                                encoding="utf-8")
        raise Pending(f"question written as {key}.question")
    return call_model

def judge_questions(store, calls, registry, versions, rubric):
    out = []
    for call in calls:
        version = versions[call["spec_version_id"]]
        passages = h.passages(version["spec_id"], version["version"])
        system, user = judge_call.compose(call["behaviour_slug"], rubric, registry, passages)
        out.append((link_self.key_of(user), call, system, user))
    return out
```

Subcommands: `judge compose --behaviours=... --documents=<version id> [--go]` writes the run (`aci_runs`, provisional) and its calls (no `aci_depths` rows), then each question to `artefacts/session-<run8>/judge/<key>.question` and an `index.json`; `judge store <folder>` refuses until every question has an answer, then runs `batch_job.run(store, run_id, call_model=link_self.replies_from-like reader over judge/, concurrency=1)`.

- [ ] **Step 4: Run tests, commit**

`python3 -m pytest -q engine/panel/test_session_seat.py` passes; commit `feat: a session seat composes a provisional run of judge calls`.

---

### Task 3: A provisional assessment, quorum by seats

**Files:**
- Modify: `engine/panel/assessment_run.py` (`quorum_of(seats)`, `settle` uses it)
- Modify: `engine/assessment_store.py` (`Assessment(..., provisional=False)`, run row flag)
- Modify: `engine/assess.py` (`assess(..., panels=None, provisional=False)`)
- Modify: `engine/panel/session_seat.py` (`assess` subcommand)
- Test: `engine/panel/test_assessment_run.py`, `engine/test_assess.py`

**Interfaces:**
- Produces: `assessment_run.quorum_of(seats) -> int` = `min(QUORUM, len(seats))`.
- Produces: `assess.assess(store, config, version_ids, passages_for, call_model=None, go=False, created_by=..., panel=PANEL, resume=None, criteria_from=None, replay=False, panels=None, provisional=False)`.

- [ ] **Step 1: Failing tests**

```python
def test_a_claim_read_by_the_one_seat_of_a_run_is_confirmed(self):
    [one] = assessment_run.settle(POOLED_ONE_CLAIM, {"opus-5.5": {1: {"holds": True, "absolute": False}}},
                                  ["opus-5.5"], PASSAGES)
    self.assertTrue(one["confirmed"])

def test_a_panel_of_three_still_needs_two_readings(self):
    [one] = assessment_run.settle(POOLED_ONE_CLAIM, {"sol": {1: {"holds": True, "absolute": False}}},
                                  ["sol", "fable", "kimi"], PASSAGES)
    self.assertFalse(one["confirmed"])

def test_a_provisional_assessment_run_row_says_so(self):
    assess.assess(store, CONFIG, ["v1"], passages_for, call_model=answers, go=True,
                  panels={"criteria": ["opus-5.5"], "contradictions": ["opus-5.5"]},
                  provisional=True)
    [row] = store.tables["aci_assessment_runs"]
    self.assertTrue(row["provisional"])
```

- [ ] **Step 2: Implement.** `settle` replaces `QUORUM` with `quorum_of(seats)`; `Assessment.start` writes `"provisional": True` only when set; `assess.assess` takes `panels` in place of `assessment_panels(config)` when given, and passes `provisional` through; `session_seat.py assess --documents=<id> [--resume=<run>]` runs `assess.assess` with the session panels, `provisional=True`, `created_by="session_seat.py"` and `stopping_wire(artefacts/session-assess-<doc>/)`, catching `Pending` to print which question waits and the `--resume` that takes it up.

- [ ] **Step 3: Run tests, commit** `feat: a provisional assessment of one seat, its quorum one`.

---

### Task 4: Depths against a provisional assessment

**Files:**
- Modify: `engine/panel/depth_pass.py` (`conflict_rules_for(..., quorum)`, `jobs_for` reads the assessment run's criteria seats)
- Modify: `engine/panel/session_seat.py` (`depth` subcommand)
- Test: `engine/panel/test_depth_pass.py`

- [ ] **Step 1: Failing test**

```python
def test_one_seat_citing_a_rule_is_enough_for_a_one_seat_run(self):
    rules = depth_pass.conflict_rules_for(ROWS_ONE_SEAT, VERSION, passages_for, quorum=1)
    self.assertEqual([p[0] for p in rules], ["doc > ¶2"])
```

- [ ] **Step 2: Implement.** `conflict_rules_for(rows, version, passages_for, quorum=assessment_run.QUORUM)` passes `quorum` on; `jobs_for` computes it once from the assessment run row: `assessment_run.quorum_of(run["panels"]["criteria"])`. `session_seat.py depth compose --run=<provisional run> --assessment-run=<provisional assessment run>` writes the question of every job `depth_pass.jobs_for` returns, composed exactly as `give_one` composes it (`depth_call.compose(slug, registry, retained, scale=10, conflict_rules=rules)`), to `artefacts/session-<run8>/depth/<key>.question`; nothing is written to the database. `depth store` runs `depth_pass.give_pass(..., call_model=stopping_wire(folder), go=True)`: every answered depth is stored, and a reply the parser refuses makes the ladder ask its reminder, which the wire writes as a further question before raising `Pending`; that reminder is answered and `depth store` run again.

- [ ] **Step 3: Run tests, commit** `feat: depths out of ten against a provisional assessment`.

---

### Task 5: The publisher takes a provisional cell where no panel cell exists

**Files:**
- Modify: `engine/publish.py` (`choose_cells`, `_depth_complete_keys`, `require_depths`, `publish`, `build`)
- Modify: `engine/index_store.py` (`cell_depths`, `manual_reviews`, `assessment` take `provisional={version id: assessment run id}`)
- Modify: `engine/verify_supabase_provenance.py` (recorded params)
- Test: `engine/test_publish.py`, `engine/test_index_store.py`

**Interfaces:**
- Produces: `publish.provisional_assessments(store, versions, assessment_run_id) -> {version id: provisional assessment run id}` for every version the named run did not assess and a done provisional assessment run did (newest).
- Produces: `choose_cells(store, behaviours, spec_versions, panel, rubric, assessment_run_id=None, provisional=None)`.
- Produces: builder flag `--provisional-assessments=<version id>:<run id>,...`; `build_params["provisional_assessment_runs"] = {version id: run id}` when any.

- [ ] **Step 1: Failing tests**

```python
def test_a_provisional_run_answers_a_cell_no_panel_judged(self):
    s = store([{"id": "p1", "rubric": "v5", "created_at": "2026-09-28",
                "provisional": True, "panel": ["opus-5.5"]}],
              calls("p1", "helpfulness", "v1", ["opus-5.5"]))
    [cell] = publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")
    self.assertEqual(cell["run_id"], "p1")

def test_a_panel_run_wins_over_a_newer_provisional_one(self):
    s = store([{"id": "r1", "rubric": "v5", "created_at": "2026-09-01"},
               {"id": "p1", "rubric": "v5", "created_at": "2026-09-28",
                "provisional": True, "panel": ["opus-5.5"]}],
              calls("r1", "helpfulness", "v1", PANEL) + calls("p1", "helpfulness", "v1", ["opus-5.5"]))
    [cell] = publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")
    self.assertEqual(cell["run_id"], "r1")

def test_a_provisional_run_with_a_second_seat_is_not_an_answer(self):
    s = store([{"id": "p1", "rubric": "v5", "created_at": "2026-09-28",
                "provisional": True, "panel": ["opus-5.5"]}],
              calls("p1", "helpfulness", "v1", ["opus-5.5", "sol"]))
    with self.assertRaises(SystemExit):
        publish.choose_cells(s, ["helpfulness"], [V1], PANEL, "v5")

def test_a_provisional_cell_needs_its_one_seat_s_depth(self): ...  # require_depths
def test_depths_of_a_provisionally_assessed_version_are_read_with_its_own_run(self): ...  # cell_depths
```

- [ ] **Step 2: Implement.** In `choose_cells`, a key whose run is provisional matches when its done models equal the run's `panel`; per cell, panel keys are chosen as today, provisional keys only when there are none. `_depth_complete_keys` and `cell_depths` read each key's depths with `provisional.get(version_id)` or the named run's `criteria_run_id`. `require_depths` holds a provisional cell to its run's panel. `publish` computes `provisional_assessments`, passes it to `choose_cells`, `require_depths`, `index_store.assessment` (per version) and the builder, and records it. `verify_supabase_provenance` passes the recorded mapping back to a rebuild.

- [ ] **Step 3: Run tests, commit** `feat: a publication takes a provisional cell where no panel judged it`.

---

### Task 6: The payload marks what is provisional

**Files:**
- Modify: `engine/panel/build_site_data.py` (`admits`, `keeps_citation` per cell, `build_behaviours(..., provisional=None)`, `MODEL_LABEL`, `--provisional-assessments=`, per-document assessment)
- Test: `engine/panel/test_build_site_data.py`, `engine/test_publication_rebuilds.py`

- [ ] **Step 1: Failing tests**

```python
def test_a_provisional_cell_keeps_every_passage_its_one_seat_banded(self):
    out = build_behaviours(BEH, {("helpfulness", "d > ¶1"): {"opus-5.5": 1}}, TEXT, ["d"],
                           {}, PANEL, DISPLAY_CUT_4,
                           provisional={("helpfulness", "d"): {"seat": "opus-5.5", "run": "p1"}})
    cov = out[0]["coverage"]["d"]
    self.assertEqual([p["locator"] for p in cov["passages"]], ["d > ¶1"])
    self.assertEqual(cov["provisional"], {"seat": "opus-5.5", "run": "p1"})

def test_a_cell_that_is_not_provisional_carries_no_key(self):
    out = build_behaviours(BEH, VOTES_PANEL, TEXT, ["d"], {}, PANEL, DISPLAY_CUT_4)
    self.assertNotIn("provisional", out[0]["coverage"]["d"])
```

- [ ] **Step 2: Implement.** `admits` takes the provisional seats by cell: a row votes when its model is the provisional seat of its cell. `keeps_citation` is called with the cell's own seat count and, for a provisional cell, the lone-judge cut of 1. The coverage entry of a provisional cell gains `provisional: {seat, run}` and its depth `provisional: true`; an assessment read from a provisional run gains `provisional: true`. `MODEL_LABEL["opus-5.5"] = "Claude Opus 5.5"`.

- [ ] **Step 3: Run tests, commit** `feat: the payload marks a provisional cell, depth and assessment`.

---

### Task 7: The reader and the MCP say it

**Files:**
- Modify: `site/spec-reader/app.js` (behaviour note sentence, depth note fold title and sentence)
- Modify: `app/lib/mcp-tools.mjs` (`provisional` on a pair and on a depth; `about`)
- Test: `engine/panel/test_appjs_depth.js`, `engine/panel/test_panel.py` (check count), `app/lib/__tests__/mcp-tools.test.mjs`

- [ ] **Step 1: Failing tests.** For a cell with `provisional`, `depthCellNote` returns `provisional` with the sentence "Provisional: these passages were marked by one model, Claude Opus 5.5, reading in one session. The panel of three judges has not read this document yet."; the fold title is "The reading of one model". The MCP answer for a provisional pair carries `provisional: {seat, note}` with the same sentence.

- [ ] **Step 2: Implement, run, commit** `feat: the reader and the MCP say a reading is provisional`.

---

### Task 8: Read Microsoft's Code in session

No code. Commands, and agents answering files.

- [ ] **Step 1:** `python3 engine/panel/session_seat.py judge compose --behaviours=<14 slugs> --documents=cb0a2e09-3550-4edd-9c4a-b6d995f7ca4e --go`. 14 questions.
- [ ] **Step 2:** Agents, each given a few question files and nothing else, write `<key>.answer` in the reply format the question asks for. Check every answer parses (`judge_call.parse`, no unparsed passage) before storing.
- [ ] **Step 3:** `session_seat.py judge store <folder>`; the run is done, 14 calls done, 236 judgements each.
- [ ] **Step 4:** `session_seat.py assess --documents=cb0a2e09-...`, answer the criteria question, `--resume`, answer contradictions, `--resume`, answer the confirmation, `--resume`; the assessment run is done.
- [ ] **Step 5:** `session_seat.py depth --run=<run> --assessment-run=<assessment run>`, answer the 14 depth questions, store; 14 depths done.

---

### Task 9: The board follows the reading, then a draft publication

- [ ] **Step 1:** Microsoft AI's figures in `site/constitutions.json` become the provisional depths and the assessment's criteria and contradictions score; each `says` and `why` is checked against its figure and passages, and its marker becomes `provisional: {seat, note}`; `whole.total`, the takeaways and the method note are recomputed and reread.
- [ ] **Step 2:** `site/overview.json`: Microsoft AI's summaries and every cross-company count.
- [ ] **Step 3:** Both test suites pass; commit.
- [ ] **Step 4:** Build a draft publication with the parameters of `a66751c0` (`--manual-review`, `--depth-prompt`, `--assessment-run`, the same `--link-runs`) and Microsoft's version among the documents; run `verify_supabase_provenance.py` on it.
