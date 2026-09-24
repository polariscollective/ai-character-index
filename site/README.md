# site/

The public site's source: plain HTML and vanilla JS, with no build step of its own. `predev` and `prebuild` copy it into the gitignored `public/`, and the Next.js application serves it, deployed on Vercel at https://ai-character-index.vercel.app. Its data comes from the application's routes, never from files here.

**Pages:**

- `index.html`: a minimal redirect to `spec-reader/` (the reader is the landing surface). The core-page prototype it carried is retired; its design history lives in [`design/`](../design/).
- `about.html`: what the index is, how to cite it, how to run it yourself, and the two
  proposal forms, in a dialog, posting to `/api/submit`. Served at `/about` by a rewrite
  in `next.config.mjs`; `methodology.html` and `propose.html` are redirects to it, kept because
  links to both are already shared.
- `overview.html`: the front page at `/`, two views behind tabs. The first is the constitutions board, drawn by `constitutions.js` from the written file `constitutions.json`; the second is the governance board, from `governance.json`. Both are `board.js`, and both carry each company's mark from `company-marks.js`.
- `coverage.html`: the board built from the publication, at `/coverage`. It led the front page until 23 September 2026 and keeps the figures whose passages a reader can open.
- `mcp.html`: how to connect to the public MCP endpoint at `/api/mcp`. Served at `/mcp`.
- `spec-reader/`: the spec reader, over the documents of the current publication. It takes the documents, the behaviour payload and the behaviour notes from `/api/reader/documents`, `/api/reader/payload` and `/api/reader/behaviours`; a `?publication=` pin reaches any publication. See its own README.

The two engine verifiers (`engine/verify-reader-test.mjs`, `engine/verify-reader-features.mjs`) boot Chrome against the page, answer its routes from `tests/fixtures/reader/`, and assert every renderable passage anchors; run them after changing markup.

The page map and layout sketches in [PLAN.md §3](../PLAN.md) are the original design of July 2026 (the Astro stack sketched there was not adopted, and its homepage map retired with the index prototype); aesthetics discussion is in [`design/`](../design/).
