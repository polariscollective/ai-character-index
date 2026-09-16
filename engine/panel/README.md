# engine/panel

The judging pipeline behind the index: it composes each judge call, parses the reply, and builds the reader's behaviour payload. It reads and writes the `aci_` tables of the `evals` Supabase project.

Credentials: `panel-config.json` holds env-var NAMES only; keys live in the
environment or a gitignored `.env` in this directory (`.env.example` is the
template). Every judge is reached through OpenRouter, so `OPENROUTER_API_KEY` is
the one key a job needs: the harness prefers a native route whenever that
provider's key is present.

## Pieces
- `panel-config.json`: providers, models, panels, the declared `substitutes`,
  rubric and display settings. The index judges and publishes with one panel,
  `frontier_fast` (`sol`, `fable`, `deepseek`), under rubric v5.
- `harness.py`: shared library for config, the behaviour registry (from
  `aci_behaviours` unless a file is named), a document's passages through
  `cite.py`, prompt composition and verdict parsing. Not a CLI.
- Registering a behaviour is the admin portal's, and writes `aci_behaviours`.
  `new_behaviour.py` did it by writing `data/behaviours.json`, a file under a
  directory that no longer exists; it went with the directory.
- `judge_call.py`: one passage call, on the v5 prompt (`prompts/v5.txt`). A reply
  that parses for fewer than 98% of the passages writes no judgement.
- `depth_call.py`: one depth call, a 0 to 4 depth per judge per cell on
  `methodology/spec-coverage-depth-rubric.md`, from the passages a reader sees by
  default -- defining, core and related (`prompts/depth-v1.txt`). The judge never
  sees the document, so a depth reads the panel's citations, not the text.
- `bands.py`: the reader's tier bands in Python, held to `app/lib/bands.mjs` by
  `test_bands.py`, which also holds its `DEFAULT_BANDS` to the reader's own.
- `compose_run.py`: writes a run's calls, priced first. Nothing is written
  without `--go`; `--again` judges cells that are already covered.
- `batch_job.py`: executes a run's pending calls, then its depths. There is no
  automatic retry; relaunching the run is the retry.
- `build_site_data.py`: the behaviour payload for the publication the reader
  serves or, with `--cells=`, for a selection a publication is about to carry.
- `whole_doc.py`: the pre-migration whole-document CLI. Its `judge_kwargs` sets
  every call's `temperature`, `max_tokens` and `reasoning_effort`; the rest of it
  appends to a gitignored runlog nothing reads.
- `run_rollout.py`, `select_strata.py` + `smoke-*.txt`: the pre-migration driver
  and validation sampler, kept with their pinned samples as a record.

## Run outputs, manifest, pinning
There are no run files and no manifest any more. A run is rows (`aci_runs`,
`aci_judge_calls`, `aci_judgements`, `aci_depths`), and a publication stores both
payloads as columns of its `aci_publications` row, which is insert-only.

The page (`site/spec-reader/app.js`) takes its payload from `/api/reader/payload`,
in this order:
1. `?publication=<uuid>`, a pin, which reaches any publication, a draft included;
2. the current publication, the newest one marked `is_public`.
A pin that fails falls through to the current publication, so a stale link never
breaks the page.

- `runlog-v5.md` and `runlog-v3.md` record the two logs the inherited payloads
  were built from. The logs left the branch with the migration and remain in git
  history at `085fd2e`.

## Behaviour metadata is registry-driven
The displayed behaviours (names, definitions, groups) come from `aci_behaviours`,
the only registry. A publication shows every behaviour it selects, whatever its
set, and reads no human verdict. A passage is filed under the document its locator
names, `<lab>--<document>@<version>`. `--run-date=YYYY-MM-DD` pins
`provenance.runDate`, so a rebuild can reproduce a stored payload byte for byte.

## The procedure
From the admin portal: register a behaviour or a document version, compose a run
and read its price, launch it, build a publication from its cells, read the draft,
and make it public. The portal's Readme page walks through it, and the root
`README.md` gives the same steps as commands.

## Tests
`python3 engine/panel/test_panel.py`: unit tests for the pure logic (verdict
parsing, cost estimate, per-model API params, builder guards), no network or keys.
The job's suites sit beside their modules: `test_judge_call.py`,
`test_passages.py`, `test_bands.py`, `test_depth_call.py`, `test_batch_job.py`,
`test_compose_run.py` and `test_build_site_data.py`. The `test_appjs_*.js`
harnesses exercise the reader's `app.js` without a browser.

## Verifying + reproducing the shipped data
`python3 engine/verify_supabase_provenance.py` checks the publication the reader
serves, or any other with `--publication=<uuid>`, a draft included. It holds each
stored payload to its digest, rebuilds the publication from its own cells with the
builds `publish.py` makes, composes every boundary a judge would be sent, and
re-resolves every cited locator against the stored text. It needs `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY`, and runs as `--publication=<uuid>` when a
publication is built rather than on a schedule: the service role key is not a
GitHub secret.

A new panel run is new rows, never an edit: a run freezes what it judged against,
and a publication names the run that answers each of its cells. To judge a
document without the database, use `engine/local_run.py`.
