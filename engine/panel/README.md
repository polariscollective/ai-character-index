# engine/panel

Pipeline that produces the LLM-panel relevance data for `site/spec-reader/`.

Credentials: `panel-config.json` holds env-var NAMES only; keys live in the
environment or a gitignored `.env` in this directory (`.env.example` is the
template -- one OpenRouter key suffices, native keys optional).

## Pieces
- `panel-config.json` -- providers, model tags, panels, rubric, display behaviours.
- `harness.py` -- shared library: config load, prompt builders (rubrics v1 binary /
  v2 ternary+scope / v3 ternary+form-fields, frozen for provenance), verdict
  parsing, run-log resume conventions. Not a CLI.
- Registering a behaviour is the admin portal's, and writes `aci_behaviours`.
  `new_behaviour.py` did it by writing `data/behaviours.json`, a file under a
  directory that no longer exists; it went with the directory.
- `whole_doc.py` -- whole-document judging (entire spec in one prompt, all verdicts
  in one response). Runs the v5 rubric by default -- the shipped bench's prompt,
  `prompts/v5.txt` -- with the legacy v3 prompts behind `--rubric=v3w`/`v3s`; rows
  land in the gitignored `runlog-user.jsonl` unless `--runlog=` says otherwise.
  This mode produced the shipped data, winning an empirical dense-vs-sparse
  comparison.
- `select_strata.py` + `smoke-*.txt` -- stratified validation sample (pinned).
- `run_rollout.py` -- the driver: full-dataset plan, dry-run by default, --go to spend.
- `build_site_data.py` -- runlog -> site payload; behaviour metadata is
  registry-driven (see "Behaviour metadata is registry-driven" below) and run
  outputs are timestamped (see "Run outputs" below).
- `select_run.py` -- resolve/verify which payload the site page will load; the CLI
  half of run pinning (the other half is the page's `?data=` URL param).

## Run outputs, manifest, pinning
Each `build_site_data.py` run emits its own timestamped file
`site/spec-reader/data/behaviours-<YYYY-MM-DDTHH-MM-SS>.json` (hyphen-separated:
lexicographically sortable = chronological, URL-safe) and updates
`site/spec-reader/data/manifest.json`:
`{"latest": <filename>, "runs": [newest-first entries with filename, timestamp,
rubric, panel and citation metadata]}`. A second build in the same second takes a
numeric sequence suffix (`behaviours-<ts>-02.json`, then `-03`, ... -- zero-padded to
two digits) so a run is never silently overwritten; the suffix sorts after the bare
stamp and before the next second, so lexical order stays chronological. Run files and
the manifest are
gitignored -- they stay local; the tracked `behaviours.json` is the fallback a fresh
clone loads.

The page (`site/spec-reader/app.js`) resolves its payload in this order:
1. `?data=<name>` URL param (a pin; name only, no paths);
2. manifest `latest`;
3. the shipped `behaviours.json`.
A source that fails to fetch or parse falls through to the next, so a stale pin or a
missing manifest never breaks the page. Pin and `latest` targets are validated the same
way on both sides (`build_site_data.py::_payload_name` / `app.js::payloadName`): only
`behaviours*.json` payloads resolve -- the manifest itself is never loadable as a
payload. Pinning is the inclusive OR of the URL param and the CLI:

```
python3 engine/panel/select_run.py                   # run ledger + what the page loads now
python3 engine/panel/select_run.py --pin <name>      # verify a ?data= value before sharing it
python3 engine/panel/select_run.py --latest          # verify the manifest's latest run
```

Both paths resolve the same way: a name counts only when the file exists and parses
as JSON. To rebuild the shipped fallback (or any fixed filename) instead of emitting
a timestamped run, pass `--out=` -- e.g. `--out=behaviours.json`; the manifest is
left alone on that path. The name is validated (URL-safe chars, no path separators
or `..`), so `--out=` cannot write outside the data dir.
- `runlog-v5.jsonl` -- the committed canonical runlog that produces the shipped
  payload (`runlog-v5.md` documents its contents and provenance); the v3-era
  log `runlog-v3.jsonl` stays committed alongside its record `runlog-v3.md`.
  Every other `runlog*.jsonl` stays gitignored.
- `verify_panel_provenance.py` -- proves the shipped payload rebuilds from that
  log; `test_verify_panel_provenance.py` is its test suite.

## Behaviour metadata is registry-driven
The displayed behaviours (sidebar names, definitions, categories, numeric ids)
come from the behaviour registry `data/behaviours.json`, not from the payload's
source runlog: the reader set in registry `numeric_id` order (the
shipped order), then any `set:user` behaviours the run covers. A `set:user`
runlog key is its registry slug (the clone/fork seam: a user behaviour's panel
run flows straight into the page once it is registered in a local registry
copy). A `--behaviours=` entry the registry does not carry fails the build
loudly. Flags: `--registry=PATH` (default `data/behaviours.json`; tests and
user forks point it elsewhere) and `--run-date=YYYY-MM-DD` (pins
`provenance.runDate`, default today, so a rebuild can reproduce a committed
payload byte-for-byte).

## The procedure
There is no end-to-end coverage procedure any more: the sweep pipeline was
retired with the publish path, and the coverage ledger (`data/coverage.json`)
is frozen. This README covers the mechanics of the individual scripts.

## Tests
`python3 engine/panel/test_panel.py` -- unit tests for the pure logic (verdict
parsing, resume planning, cost estimate, per-model API params, builder guards),
no network or keys, sub-second. Each test class names the shipped bug it guards.
`python3 engine/panel/test_verify_panel_provenance.py` -- tests for the
provenance check below (green rebuild, tamper detection, missing-input failure).

## Verifying + reproducing the shipped data
The canonical runlog behind the shipped payload is committed here:
`runlog-v5.jsonl` (see `runlog-v5.md` for its contents and provenance record --
the v5 full bench: 4-point verdicts, 9-point cells on the frontier_fast panel).

```sh
python3 engine/panel/verify_panel_provenance.py
```

rebuilds the payload from that log into a scratch directory and proves
`site/spec-reader/data/behaviours.json` matches byte-for-byte, with one
documented exception: `provenance.runDate`, which the builder stamps with the
build date (`date.today()`) and which cannot be re-derived because the log
schema carries no timestamps. Exit 0 = verified.

Manual rebuild: `python3 build_site_data.py` (defaults `--runlog=runlog-v5.jsonl`
plus the display config `rubric: v5`, `panel: frontier_fast` are the shipped
configuration). Without `--out=` the build lands in a new timestamped run file
(see "Run outputs, manifest, pinning" above) -- what ordinary re-runs should
do; `--out=behaviours.json` rebuilds the shipped payload in place, whose
`runDate` a plain rebuild re-stamps with today's date (byte-identity rebuilds
pin `--run-date=`). The score cut honours `display.threshold` (1 = keep
everything scored, matching every shipped payload), so a defaults build
reproduces the shipped payload; `--threshold=`/`--solid-threshold=` override
both for derived builds (the reader payload is cut at 4/6, the 3-judge band boundary).

The derived payload `behaviours-v5-reader.json` is the band keep-set: the same v5
run cut at the boundary the reader's lowest band applies (363 citations against
the panel payloads' ~3,600). The reader (`site/spec-reader/`) renders nothing
below that cut in the first place, so the keep-set is exactly what it can show;
the walker holds the two together -- `engine/verify-reader-test.mjs` walks the
reader's default state and asserts every view anchors exactly the keep-set's
passage counts, so a drift between the client's band math and the builder's cut
fails loud in CI. It is also loadable directly: `?data=behaviours-v5-reader`.

A NEW panel run must write a new runlog, and a regenerated payload needs its
own committed log + passing check -- provenance travels with the data.
(Regenerating verdicts from scratch: `python3 whole_doc.py <behaviour> <spec>
frontier_fast` per cell -- v5 is the default rubric since the prompt port
(`prompts/v5.txt`, byte-identical to the calibration source that produced the
canonical log, pinned by `test_panel.py`); the runlog is append-only +
resume-safe, landing in the gitignored `runlog-user.jsonl` unless `--runlog=`
names another file. v3-family reruns sit behind `--rubric=v3w`/`v3s` and belong
in a v3 log.)
