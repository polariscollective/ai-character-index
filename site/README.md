# site/

The public static site. Two surfaces, plain HTML + vanilla JS, no build step — what is committed here is what deploys to Cloudflare Pages (see `.github/workflows/deploy.yml`; the manual twin is `pnpm deploy:site`).

**Tabs:**

- `index.html` — minimal redirect to `spec-reader/` (the reader is the landing surface). The core-page prototype it carried is retired; its design history lives in [`design/`](../design/).
- `how-it-works.html` — what the index is, how to run it yourself, and the two
  proposal forms. `methodology.html` and `propose.html` are redirects to it,
  kept because links to both are already shared.
- `spec-reader/` — the spec reader: both specifications in full, with a behaviour menu that highlights the cited passages, each citation carrying raw per-judge verdicts scored client-side into tiers. Renders the spec text from `spec-reader/data/documents.json` (built by `engine/build-spec-reader-data.py`) and its behaviour data from `spec-reader/data/behaviours.json` (built by `engine/panel/build_site_data.py`), resolved ?data=<name> pin -> `data/manifest.json` latest -> the shipped fallback. `data/` also holds the calibration variants and the band-filtered keep-set (`behaviours-v5-reader.json`), each loadable as a `?data=` pin; `engine/verify-reader-test.mjs` walks the default state (no pin, no manifest) and holds every view to the keep-set counts, so a moved or renamed payload fails loud.

The two engine verifiers (`engine/verify-reader-test.mjs`, `engine/verify-reader-features.mjs`) boot Chrome against the page and assert every renderable passage anchors; run them after changing markup or payloads.

Page map and layout sketches in [PLAN.md §3](../PLAN.md) (the Astro stack sketched there was not adopted; its homepage map retired with the index prototype -- the reader is the landing surface); aesthetics discussion in [`design/`](../design/).
