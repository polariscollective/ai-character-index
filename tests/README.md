> **What these tests read.** The index lives in Supabase and CI knows no
> secret, so everything here runs against fixtures: `parser-corpus.md`, a
> document carrying every construction `cite.py` recognises; `index.py`, two
> behaviours, one defined and one not; and `reader/`, the two payloads the
> reader's routes serve. A fixture is a test input, never a second copy of
> the index. The published data is verified by `.github/workflows/provenance.yml`.

# tests/

Regression tests for the spec-coverage tooling.

## Running

```sh
python3 -m unittest discover -s tests        # the tests/ suite (~20s)
python3 engine/test_coverage_payload.py      # engine/: reader payload builder
python3 engine/test_validate_data.py         # engine/: data-validation gate
python3 -m unittest discover -s tests -v     # verbose
```

All three commands together are the fast gate: run them before committing
any change to `engine/` (the engine-side test files live next to the code
they pin). This does not replace the slow end-to-end checks, which need
Node deps (`pnpm install`) and Chrome:

```sh
node engine/verify-reader-test.mjs           # every behaviour x spec view + nav presence/resolution + the fallback-and-manifest state
node engine/verify-reader-features.mjs        # Tier-1 site features × bundled + user-extended data (run it alone; it stages through the real manifest)
```

## What is covered

One test file per subject under test:

- `test_cite.py` -- everything pinning `cite.py`. Golden-master snapshots
  diffed against `tests/golden/`: the full corpus (`outline`/`show`/
  `resolve` for **every** section of both pinned specs, catching drift even
  in sections no published citation touches) and `find` for a fixed query
  set (the `match_normalize` folding and sentence-span arithmetic the
  corpus commands never exercise). Plus unit tests for the pure functions
  (`normalize`, `match_normalize`, `split_sentences`, `parse_locator`) and
  the corpus-wide invariant that every published quote stays findable
  under folding.
- `test_reader_v5_payload.py` -- pins the reader payload: 363 citations (not the
  unfiltered 3,630 nor the retired bench's 294), the score/votes cuts,
  adjacent-vs-band agreement against `tierBand` extracted from app.js (three
  enumerated ragged exceptions), quote re-resolution, and a golden
  byte-identical rebuild.
- `test_coverage_json.py` -- re-resolves **every** locator in
  `data/coverage.json` against `cite.py` and byte-compares the quote: the
  machine-verification the frozen ledger keeps. Resolution is in-process
  (one spec load per spec), so this stays near-instant.
- `test_behaviour_registry.py` -- the drift gate for behaviour identity:
  `data/behaviours.json` is the source of truth, and the derived constants
  (`BEHAVIOURS` in `engine/build-spec-reader-data.py`, the panel slug
  lists) must equal `engine/generate_behaviour_constants.py`'s rendering of
  it. Also pins the
  registry against the published ledger it mirrors (`data/coverage.json`
  names) and proves the gate
  has teeth by mutating scratch copies (--check must fail). After an
  intentional registry change, run the generator and commit both sides.

The engine-side files in the gate live next to the code they pin and are
documented in `engine/README.md`: `engine/test_coverage_payload.py` and
`engine/test_validate_data.py`.

To run one class during a tight edit loop (the goldens take ~20s; the unit
tests are instant):

```sh
python3 -m unittest tests.test_cite.MatchNormalizeTest -v
```

## Regenerating the golden snapshots

```sh
python3 tests/dump_goldens.py --write            # all goldens
python3 tests/dump_goldens.py --write corpus     # or one family: corpus | find
```

Do this only after an **intentional** change: a spec mirror update
(spec-watch) or a deliberate change to `cite.py`'s behaviour. Then review
the git diff of `tests/golden/` before committing -- the diff *is* the
record of what changed. Never regenerate just to turn a red test green:
a red snapshot means cite.py's output moved, and that is a finding.

## Adding tests

Every change to the pipeline lands with its test in this directory. Pin
outputs (golden files) for behaviour that must stay byte-stable; write
plain unit tests for logic with edge cases. Keep the suite dependency-free
and fast enough that nobody hesitates to run it.
