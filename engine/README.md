# engine/

The code that judges the index, builds what it publishes, and checks both. The index itself lives in the `aci_` tables of the `evals` Supabase project, not here. The system map is [SYSTEM.md](../SYSTEM.md).

## spec-watch/

`pull-latest.sh` predates the migration and no longer runs: it reads `cite.BUNDLED_SPECS`, which `cite.py` no longer defines, and writes into [`specs/`](../specs/), which no longer holds the spec texts. A new document or version is registered through the admin portal, which writes `aci_spec_versions`. Nothing detects when a lab publishes a new version.

## spec-cite/

`cite.py` resolves and verifies the locators defined in [`specs/CITATION.md`](../specs/CITATION.md). The head of a locator names the document and its version, `<lab>--<document>@<version>`. `cite.py` registers nothing at import time: a caller installs a registry through `use_registry`, from the database (`index_store.install_registry`) or from a fixture. The command line installs the database's, so it needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`:

```sh
python3 engine/spec-cite/cite.py outline anthropic--constitution                  # section tree + anchors
python3 engine/spec-cite/cite.py show "anthropic--constitution > Being broadly ethical > Being honest"   # numbered ¶/s
python3 engine/spec-cite/cite.py resolve "anthropic--constitution@2026-01-20 > Being broadly ethical > Being honest > ¶18 s1-4"
python3 engine/spec-cite/cite.py find anthropic--constitution "some remembered phrase"   # text to locator
```

CI tests the parser offline against `tests/fixtures/parser-corpus.md`. `verify_supabase_provenance.py` re-resolves every locator a publication cites against the stored text.

### User specs (bring your own document)

The user manifest (`specs/user/specs.json`, `SPEC_CITE_USER_SPECS`) went with the bundled registry, although `cite.py`'s docstring still describes it. To judge a document of your own, give its markdown file to `engine/local_run.py` (below).

## panel/

The judging pipeline: prompt composition and verdict parsing (`harness.py`, `judge_call.py`, `depth_call.py`), composing a run (`compose_run.py`), executing it (`batch_job.py`), the reader's tier bands (`bands.py`) and the behaviour payload builder (`build_site_data.py`). The index judges with one panel, `frontier_fast`, under rubric v5 (`panel/prompts/v5.txt`), and each judge gives every cell a 0 to 4 depth (`panel/prompts/depth-v1.txt`). See [`panel/README.md`](panel/README.md); `python3 engine/panel/test_panel.py` runs its offline tests (no network, no keys).

## job.py, publish.py and local_run.py

`job.py` is what the judging image runs. It reads its own `aci_jobs` row and dispatches on `ACI_JOB_MODE`: `compose` prices a run and writes its calls, `judge` executes them through `panel/batch_job.py`, and `publish` builds a publication through `publish.py`, as a draft that is not public. The portal starts it as a Cloud Run job through `polaris-batch-trigger`, or as a local subprocess when `ACI_PYTHON` is set outside production. As of September 2026 jobs are run locally, because `deploy-runner.yml` has not once succeeded: it fails at Google Cloud authentication.

`local_run.py` judges one markdown document against one behaviour with one key, `OPENROUTER_API_KEY`, and no database. It uses the same composer, parser and prompt as the job, and writes raw results to the gitignored `artefacts/`.

## site builders and checks

A publication's three payloads are built by `publish.py` for the cells it selects and stored on its `aci_publications` row; `/api/reader/payload`, `/api/reader/documents` and `/api/reader/links` serve them from there. All three builders read the database. The third is JavaScript because the assembly it needs already lives in `app/lib/links.mjs`, and `publish.py` picks each builder's interpreter from its file extension:

```sh
python3 engine/panel/build_site_data.py --out=PATH [--cells=PATH]    # the behaviour payload
python3 engine/build-spec-reader-data.py [--out=PATH] [--cells=PATH]  # the documents payload
node engine/build-links-data.mjs --link-runs=ID,ID [--note-prompts=SHA,SHA] --out=PATH  # the links payload
node engine/verify-reader-test.mjs          # every behaviour x document view of the reader (needs Chrome)
node engine/verify-reader-features.mjs      # the reader's URL and DOM features, a draft pin included (needs Chrome)
node engine/verify-portal.mjs [url]         # the admin portal, read-only, against a running server with credentials
```

The two reader walkers serve `tests/fixtures/reader/` through `reader-routes.mjs` in place of the database routes, so they need no credentials and CI runs them. The portal walker reads the database, so no workflow runs it.

## provenance

`verify_supabase_provenance.py` checks one publication: the newest public one, or the one `--publication=<uuid>` names, a draft included. It holds each stored payload to its digest, rebuilds the publication from its own cells, composes every boundary a judge would be sent, and re-resolves every locator the publication cites. It needs credentials, and runs as `--publication=<uuid>` when a publication is built rather than on a schedule: the Supabase service role key is not a GitHub secret.

## notion-sync/ (Phase 3)

An empty placeholder (`.gitkeep` only; nothing syncs). The Notion-to-pull-request design in PLAN.md assumed git was where data became official, which the move to Supabase ended.
