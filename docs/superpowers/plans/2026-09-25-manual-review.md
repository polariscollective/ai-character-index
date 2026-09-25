# Manual review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `manual` judge's rows override a passage's band and a cell's depth in a publication built with `--manual-review`.

**Architecture:** The migration (polaris-supabase #58, applied) adds `aci_judgements.note` and lets a `manual` call sit in a cell. Everything that counts a cell's judges ignores the manual call. With `--manual-review`, `build_site_data.py` reads the manual rows of each selected cell and writes them into the payload: `manual` on a passage, `manual` on a cell's depth whose `mean` becomes the manual figure. The reader and the MCP honour `manual` where they band and where they show a depth.

**Tech Stack:** Python 3 (engine, pytest), plain ES modules (site, node --test).

## Global Constraints

- Repository text in English; British spelling on the site; no long dashes.
- A build without `--manual-review` produces the same bytes as before, whatever manual rows exist.
- The judges' verdicts and depths stay in the payload beside the manual values.
- Spec: `docs/superpowers/specs/2026-09-25-manual-review-design.md`.

---

### Task 1: The manual call is not a seat

**Files:** `engine/index_store.py` (`cell_depths`), `engine/publish.py` (`choose_cells`, `require_depths` through `cell_depths`), `engine/panel/depth_pass.py` (`ready_cells`, the pending-depth insert), new `engine/panel/manual_review.py` (`MANUAL = "manual"`, `is_manual(call)`), tests in `engine/panel/test_manual_review.py`.

- [ ] Test: `cell_depths` over a cell whose run holds three judged calls and a manual call with no depth returns the judges' mean, not a missing depth.
- [ ] Test: `choose_cells` still matches a cell with a manual call to the panel.
- [ ] Test: `depth_pass` does not insert a pending depth for a manual call.
- [ ] Implement the filters with `manual_review.is_manual`.
- [ ] Run `python3 -m pytest -q engine tests`, commit.

### Task 2: The builder reads manual rows when asked

**Files:** `engine/index_store.py` (`runlog_rows` carries `note`; new `manual_reviews(store, cells, assessment_run_id, depth_prompt)` returning `{(slug, version_id): {"passages": {locator: {"verdict", "note"}}, "depth": {"depth", "rationale"} | None}}`), `engine/panel/build_site_data.py` (`--manual-review`, `build_behaviours(..., manual=None)`), `engine/publish.py` (`--manual-review` passed to the builder and recorded as `build_params.manual_review = true`).

Payload shape:
- passage: `"manual": {"band": "defining"|"core"|"related"|null, "note": str}`; a manually banded paragraph the judges did not carry is added with the judges' verdicts it has (possibly none); the `role` text opens with `Manual review: <band>. <note>`.
- cell depth: `"mean"` is the manual figure, `"judgesMean"` the judges' mean, `"manual": {"depth", "rationale"}`.

- [ ] Test: `build_behaviours` without `manual` gives the same output as before.
- [ ] Test: a manual 3 on a passage the judges scored 1+1+0 carries it with `manual.band == "defining"`; a manual 0 on a retained passage carries `manual.band is None`.
- [ ] Test: a manual depth sets `mean` and keeps `judgesMean` and `judges`.
- [ ] Implement, run tests, commit.

### Task 3: The reader and the MCP honour `manual`

**Files:** `site/spec-reader/app.js` (banding loop near `const band = p => tierBand(...)`; `depthCellNote`), `app/lib/bands.mjs` (`bandCell`), `app/lib/mcp-tools.mjs` (passage and depth shapes).

- [ ] Test (`app/lib/__tests__/bands.test.mjs`): `bandCell` gives a passage its `manual.band`, including null over a defining score.
- [ ] Implement in `bands.mjs` and in the reader's loop (`band(p)` returns `p.manual.band` when `p.manual` exists).
- [ ] `depthCellNote`: when `depth.manual` exists, the summary reads "Corrected by hand from <judgesMean>: <rationale>" after the figure.
- [ ] MCP: `manual_review` on a passage and on a depth.
- [ ] Run `node --test app/lib/__tests__/*.test.mjs`, commit.

### Task 4: A script to write a correction

**Files:** `engine/manual_review.py` CLI.

`python3 engine/manual_review.py --run=<id> --behaviour=<slug> --document=<lab--doc@version> (--locator=<locator> --band=defining|core|related|none --note=<text> | --depth=<0-10> --reason=<text> --assessment-run=<id>)`

- [ ] Refuses a run that does not hold the cell, a locator the document does not have, a depth off scale, an empty note.
- [ ] Creates the manual call once per cell and run (the unique index enforces it), then inserts the row.
- [ ] Commit.
