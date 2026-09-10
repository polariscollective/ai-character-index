# The database is the only source — design

Date: 2026-09-10
Status: approved, not started

## Why

Since the migration there have been two copies of the index: the `aci_` tables
and the files they were built from. They are provably equal, and that was the
point — the equality is what proved nothing was lost. But it was meant to be a
moment, not a state.

Two sources with one default is worse than either alone. The reader serves from
the database; every engine script still reads files unless told otherwise. A
behaviour registered through a button will exist in one of those places and be
invisible to the other, and the failure will be silent: a script that reads the
file registry will simply not see it, and report nothing missing.

So the files go.

## What goes

| what | size |
|---|---|
| `data/` entire: the behaviour registry, the frozen ledger, labs, cell curation, `schema/` | 64 KB |
| `engine/panel/behaviours.json`, the judging registry | 12 KB |
| `engine/panel/runlog-v5.jsonl` and `runlog-v3.jsonl` | 10.3 MB |
| the two spec texts under `specs/` | 452 KB |
| `site/spec-reader/data/`, the built payloads | 9.8 MB |

Roughly twenty megabytes, all of it recoverable: a file deleted from the branch
stays in git history and `git show <commit>:<path>` returns it. What changes is
the working tree, and what the code is allowed to read.

`specs/` does not disappear: `CITATION.md` defines the locator grammar, and the
two `README.md` files record where each mirror came from. Those are documents
about the data, not the data.

## What replaces the proof

The deleted files were not data any more; they were the oracle.
`verify_supabase_provenance.py` rebuilds both payloads from the database and
compares them byte for byte against the committed ones.

That comparison becomes a digest. `engine/published-artefacts.sha256.json`
records the SHA-256 of each artifact as it stood when the migration was
verified, and the check becomes: the database still produces the artifact that
carried this digest. The proof survives in a few lines; the twenty megabytes do
not.

This repository already has the pattern. `tests/golden/corpus-sha256.json` pins
the digests of the citation corpus for exactly this reason.

## What changes its default

`cite.py` loses `BUNDLED_SPECS` and stops building a registry at import time.
The seam already exists: `use_registry(entries, defaults, meta, source)` was
added for the database and becomes the only way in. A caller that forgets to
install one gets a loud error naming the fix, rather than a silent fall back to
files that are no longer there.

`harness.load_registry()` reads the database instead of `engine/panel/behaviours.json`.

Both builders lose `--from-supabase`, because there is nothing else to read
from, and `build-spec-reader-data.py` loses its `DOCUMENTS` and `BEHAVIOURS`
constants with it.

Three gates lose their subject and go with it: the registry drift gate, which
existed because constants were derived from a file; `validate_data.py` and its
schemas, which will have no JSON to validate; and `tests/test_coverage_json.py`,
whose re-resolution the Supabase verifier already performs against the stored
text.

## What the tests read

Eleven test files read the real data. They split in two.

Those whose subject is gone go with it, listed above.

Those whose subject survives get fixtures: a small synthetic spec, a handful of
behaviours, a short runlog. A fixture is not a second source of truth — it is a
test input, chosen to exercise a case rather than to describe the index — and
this repository already keeps some under `tests/fixtures/` and `tests/golden/`.

This is what keeps CI offline, which is a property the repository has defended
explicitly and which is worth more than the convenience of testing against
production. CI verifies the code, on fixtures, knowing no secret. The scheduled
provenance job verifies the published data, where the credentials already live.

## What dies

The clone-and-fork pathway. Someone without credentials will not be able to run
the panel, register a spec, or rebuild a payload.

This was announced rather than discovered: the README says this fork is heading
for a hosted authenticated surface and will in time lose the property of running
from a bare clone, and points at `AndresCotton/ai-character-index`, which keeps
it. `stage_user_demo.py`, `tests/test_custom_spec_decoupling.py` and the
user-extended half of the feature harness exist to prove that property and go
with it.

## Verification

The acceptance test is that the site does not change. The two payloads the
routes serve must still carry the digests recorded in
`engine/published-artefacts.sha256.json`, and both browser walkers must pass
against fixtures.

Three checks alongside it:

- Importing `cite` and resolving a locator without installing a registry fails
  loudly, naming `use_registry`.
- No module reads a path under `data/`, `site/spec-reader/data/`, or the two
  deleted registries. Grep is the test, and it is worth having: the point of
  this work is that no such read remains.
- The scheduled provenance job runs the eleven checks against the real database
  and reports.

## Boundary with what follows

Nothing here is visible. Three things depend on it and none belong in it: the
sidebar popup that explains a behaviour, the Cloud Run job that judges a new
one, and the admin surface that registers and launches. Each gets its own
document, and each is simpler for the database being the only place to look.
