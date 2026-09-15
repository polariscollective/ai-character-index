# AGENTS.md: working in this repo with an LLM agent

Pointer file for any agent working in this repo (Claude Code, Qwen Code, or any
other). Nothing here is Claude-specific. It points at the canonical documents
rather than repeating them.

## Read these first

- `README.md`: what the index is and holds, how it fits together, running it
  with and without credentials, and the checks.
- `SYSTEM.md`: the whole-repo map and the contracts between components.
- `CLAUDE.md`: where this fork has parted from upstream, and the defects found in
  what it inherited. Read it before changing judging, publishing or the reader.
- `ROOT.md`: the Next.js application at the root.
- `<dir>/OVERVIEW.md`: per-directory notes (`engine/`, `site/`, `specs/`,
  `research/`, `methodology/`, `design/`, `vision/`, `.github/`,
  `.claude/skills/`). Several predate the move into Supabase and still describe
  committed data files, runlogs and a manifest that are gone, so check them
  against the code.

`CLOSEOUT-LIST.md`, `PLAN.md` and `experiments-branches.md` are dated records,
not descriptions of the current system.

## The system in brief, as of September 2026

- The index lives in the `aci_` tables of the shared `evals` Supabase project.
  This repository holds code, fixtures and `engine/published-artefacts.sha256.json`.
- Schema changes are migrations in the `polaris-supabase` repository. This
  application reads and writes its tables and never migrates them.
- The site is a Next.js application on Vercel
  (https://ai-character-index.vercel.app): the reader at `/spec-reader/`, the
  prose pages `/how-it-works` and `/mcp`, the MCP endpoint at `/api/mcp`, the
  proposal route `/api/submit`, and the admin portal at `/admin`.
- Judging uses one panel, `frontier_fast` (`sol`, `fable`, `deepseek`), under
  rubric v5. Each judge also gives a 0 to 4 depth per cell, and a publication
  carries the mean. Declared substitutes for a seat are in
  `engine/panel/panel-config.json` under `substitutes`, and each use is a row of
  `aci_seat_substitutions`.
- A document is a version, named `<lab>--<document>@<version>`.
- Composing a run, judging it and building a publication are modes of one Cloud
  Run job (`engine/job.py`), started from the portal through
  `polaris-batch-trigger`.

## Procedures

**Judging a document with no database.** `engine/local_run.py` takes one
markdown file and one behaviour file, needs only `OPENROUTER_API_KEY`, and
writes its results into the gitignored `artefacts/`. The README shows the
command and what each file holds. It calls the providers, so it spends money.

**Changing the index.** Registering a behaviour or a specification version,
composing and launching a run, building a publication and making it public, and
reading proposals all belong to the admin portal (`/admin`), which needs the
Supabase credentials. The command-line equivalents are in the README. Composing
prices a run and writes nothing without `--go`; launching a run spends money, so
read the price first. A publication is built as a draft and is public only once
someone marks it so.

**Panel mechanics.** The module docstrings of `engine/local_run.py`,
`engine/panel/compose_run.py`, `engine/panel/batch_job.py`,
`engine/panel/depth_call.py` and `engine/publish.py` describe the current
pipeline. `engine/panel/README.md` still describes the runlog and manifest
pipeline in parts.

## Verification

Offline, with no credentials: the battery `.github/workflows/ci.yml` runs, listed
under "Checks" in `README.md`. With credentials:
`python3 engine/verify_supabase_provenance.py` (also run daily by
`.github/workflows/provenance.yml`) and `node engine/verify-portal.mjs`.

## Conventions

- Never commit the index's data or any key. Data belongs in the database, local
  judging output in `artefacts/`, and credentials in the environment or a
  gitignored `.env` (`.env.example` is the template).
- Specification versions and publications are insert-only. A correction is a new
  version or a new publication, never an edit.
- A schema change is a pull request against `polaris-supabase`, not a migration
  in this repository.
