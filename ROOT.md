# Repo root — plan, front-door README, and the Next.js application that serves the site

> Current-state doc: describes what exists now, not what should exist. Brought current when the admin portal landed and the application gained its first rendered pages.

## Purpose
The root holds the project's two entry documents (`PLAN.md`, `README.md`) and the Next.js application: `app/` for the reader's three routes, the public proposal route and the admin portal, `next.config.mjs`, and a pnpm setup carrying Next, React and Auth.js (plus `playwright-core` for the engine's browser checks).

`app/` has three parts sharing `app/lib/`. The reader's routes serve payloads to a static reader and are open. `/api/submit` is open too and writes, which is why its library is mostly about what it refuses. The portal is rendered React behind a Google door and an allow-list, and holds every write that changes what the index says. The public pages stay plain files served from `public/` — a document reader and a form must keep working as plain files — while the portal is an application with a session, which is why it is the framework's.

## Contents
| File | Role |
|---|---|
| `PLAN.md` | Build plan & system design (written 2026-07-10): three-layer architecture, data model, page map, CI/CD table (§5), build phases (§6), repo map (§8). The source of the "what should exist" claims cross-checked in this doc set |
| `README.md` | Front door: positioning paragraph, short how-it-works, repo-map table, Contributing points to the Issues-page contact link |
| `package.json` | Root package `ai-character-index` (private); `packageManager: pnpm@11.26.0`; `engines.node >=22.13 <25`; scripts: `dev`/`build`/`start` for Next, `test:routes` (every suite under `app/lib/__tests__/`), and the `predev`/`prebuild` pair that copies `site/` into the gitignored `public/`; deps: `next`, `react`, `react-dom`, `next-auth` (v5 beta, the version Auth.js ships for the App Router); devDep: `playwright-core ^1.61.1` |
| `pnpm-workspace.yaml` | Declares no packages; only `allowBuilds` (esbuild, sharp, workerd) — the pnpm ≥10 allowlist for transitive deps that run postinstall builds |
| `pnpm-lock.yaml` | Lockfile v9; exactly one importer (`.` = root) |
| `.gitignore` | Standard entries (node_modules, dist, .env, logs, .DS_Store), `.claude/` local settings, `public/` (a build-time copy of `site/`), `.next/`, local panel runlogs and metrics via `engine/panel/.gitignore`, plus two repo-specific private paths: `research/sources/Founding an AI Charter organisation.pdf` and `outreach/` |

## Relationships
- The site is a Next.js application, deployed to Vercel. `site/` remains the reader's source and is copied into `public/` by `predev`/`prebuild`; `public/` is gitignored, so the tracked tree has one copy of the reader and not two.
- In `ci.yml`, `pnpm/action-setup@v4` reads `packageManager` from `package.json`, and `actions/setup-node` caches against `pnpm-lock.yaml` (pnpm 11.12 needs Node ≥ 22.13, hence `node-version: 22`).
- `playwright-core` is consumed by `engine/verify-reader-test.mjs` and `engine/verify-reader-features.mjs` (both `import { chromium } from "playwright-core"`); the browser job of `.github/workflows/ci.yml` runs them.
- `README.md`'s repo-map links resolve in the post-merge tree (`SYSTEM.md` is added by this documentation set; `outreach/` is gitignored and unlinked): `research/` (+ `core-behaviour-list.md`), `.claude/skills/` (+ its README), `specs/`, `methodology/`, `data/` (+ `data/README.md`), `engine/` (+ `engine/README.md`), `site/`, `design/`, `vision/` (+ `features to build.md`); the README points onward to `SYSTEM.md` for the system map and frames `PLAN.md` as the original design.

## Dependency map
```mermaid
graph LR
  PJ[package.json] -->|packageManager pnpm@11.12| AS[pnpm/action-setup]
  LOCK[pnpm-lock.yaml] -->|cache + pins| SN[setup-node 22]
  AS --> CI[ci.yml]
  SN --> CI
  PJ -->|prebuild copies site/| PUB[public/]
  PUB --> NX[next build]
  NX -->|deployed| VC[Vercel]
  PW[playwright-core] -->|chromium| VE[engine/verify-*.mjs]
```

## As-is observations
- The "pnpm workspace" is the root package alone: `pnpm-workspace.yaml` has no `packages:` key and `pnpm-lock.yaml` has a single importer.
- PLAN.md §8's repo map lists `outreach/` as a repo folder, but `.gitignore` excludes `outreach/` — it can only exist in local clones, never on main.
- PLAN.md and the older overviews describe a `data/` directory of canonical JSON. It is gone: the index lives in Supabase, and `engine/published-artefacts.sha256.json` is what stands in the repository for what it published.
- PLAN.md §5's CI/CD table promises `ci.yml`, `notion-sync.yml`, `spec-watch.yml` alongside a deploy workflow; only `ci.yml` exists now — deployment is Vercel's, fired by a push rather than by a workflow here (see `.github/OVERVIEW.md`).
- `engines`/`scripts` nothing calls: none — `playwright-core` is used by the two `engine/verify-*.mjs`, in CI's browser job and locally.
- `engines.node` is `>=22.13 <25`: the floor is the one pnpm actually needs, and the ceiling stops the runtime following every new Node major on its own — a deploy warned about exactly that. It was `>=22`, which admitted Node 22.0–22.12, versions the pinned packageManager will not run on.
