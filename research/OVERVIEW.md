# research/ — the canonical behaviour list

> Current-state doc, as of September 2026: describes what exists now, not what should exist.

## Purpose
Defines the behaviours the index measures (`core-behaviour-list.md`). The per-behaviour sweep records that used to live under `sweeps/` are retired with the publish path, and the coverage ledger they fed is frozen, now as the `aci_coverage` table. Candidate-pool provenance (`sources/`) and the evidence-discovery sweep stages 1–3 were retired by the scope ruling (2026-08-19).

## Contents
| Path | Holds |
|---|---|
| `core-behaviour-list.md` | Canonical list: 12 behaviours (10 Tier 1, 2 Tier 2) + parked table; inclusion criteria; per-behaviour spec-coverage blocks and eval facets; stated as kept in sync with the Notion "Behaviours to track" page |
| `archive/behaviours-to-track.md` | Earlier draft, superseded 2026-07-10; 13 rows with older numbering/titles |

## Relationships
`core-behaviour-list.md` is prose, not machine-parsed: its definitions and facets reach the system only by hand, as rows of the behaviour registry `aci_behaviours`, which feeds the panel's judge prompts and the reader's behaviour names. The quotes in the frozen ledger were taken from the spec mirrors via `specs/CITATION.md` + `engine/spec-cite/cite.py`, and the ledger was migrated from `data/coverage.json` into `aci_coverage`, which the cleanup migration drops. `site/index.html` is a redirect to the reader. The preserved cross-spec strict-reading judgment (the only analysis of its kind in the repo) lives in the repo-root `archive/general-welfare-strict-reading/`.

## Dependency map
```mermaid
graph LR
  CBL["core-behaviour-list.md"] -->|hand-copied definitions + facets| REG["aci_behaviours (registry)"]
  REG -->|judge prompts, behaviour names| PANEL["engine/panel/ + site/"]
  SPECS["spec texts"] -->|verbatim quotes (frozen)| DATA["aci_judgements (one row per verdict)"]
```

## As-is observations
- The frozen ledger covers only behaviours 1–3 (6 rows, as migrated from `data/coverage.json`). Behaviour identity lives in `aci_behaviours`; `data/evals.json` was retired by the scope ruling.
- `methodology/mentee-project-archetypes.md` states `core-behaviour-list.md` is stale vs Notion for rows 11–13 (Notion has an "Interaction with others" group absent here).
