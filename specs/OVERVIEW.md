> **The spec texts are no longer here.** They live in `aci_spec_versions`,
> insert-only and keyed by content digest, which is what makes the byte-exact
> citation guarantee structural. What remains in this directory is the locator
> grammar (`CITATION.md`) and each mirror's provenance note — documents about
> the data rather than the data.

# specs/ — version-pinned mirrors of the lab specs every citation resolves against
> As-is snapshot of origin/main @ 72e2e6b (2026-08-18); the documentation set itself is added by this PR. Describes what exists now, not what should exist.

## Purpose
Local copies of the two published lab behaviour specs, pinned by version, plus `CITATION.md`, which defines the locator grammar that makes every stored quote resolvable to an exact span. Per `CITATION.md`, a locator is only valid if `engine/spec-cite/cite.py` resolves it against these files.

## Contents
| Path | Holds |
|---|---|
| `CITATION.md` | Locator format `<spec>@<version> > <section-ref> > ¶<n>[ s<a>[-<b>]]` (`>` / `›` interchangeable); section refs are `#anchor` for the Model Spec and heading-title paths for the constitution; block (¶) and sentence (s) counting rules; the three mechanical normalizations applied to quotes; cite.py command reference |
| `claude-constitution/20260120-constitution.md` | Anthropic constitution mirror, 830 lines / 182K; no `{#anchor}` syntax — cited by heading path only |
| `claude-constitution/README.md`, `LICENSE` | Mirrored upstream readme and CC0 1.0 license |
| `openai-model-spec/model_spec.md` | OpenAI Model Spec mirror, 4692 lines / 265K; 80 lines carry `{#anchor}` markers (59 also carry `authority=` tags); worked examples are `~~~`-fenced transcripts paired with `**Example**:` captions |
| `openai-model-spec/CHANGELOG.md` | Upstream changelog, v2024.05.08 → v2025.12.18 |
| `openai-model-spec/README.md` | Mirrored readme |

## Relationships
Writer: `engine/spec-watch/pull-latest.sh` (run manually; needs an authenticated `gh` CLI) pulls files from `openai/model_spec` and `anthropics/claude-constitution` via the GitHub API and base64-decodes them into this directory; nothing else writes here. The script checks upstream versions against cite.py's registry before touching anything and aborts loud on mismatch; it does not fetch the dated release archives (nothing consumes them, and they exceed the contents API's 1 MB inline limit). Readers: `engine/spec-cite/cite.py` parses both mirrors (headings → sections → blocks → sentences) for its `outline/show/resolve/find` commands; its `SPECS` registry pins `constitution@2026-01-20` → `claude-constitution/20260120-constitution.md` and `model-spec@2025-12-18` → `openai-model-spec/model_spec.md`. `tests/test_coverage_json.py` re-resolves every stored quote of the frozen `data/coverage.json` through cite.py in CI. `engine/build-spec-reader-data.py` inlines both mirrors' full markdown into `site/spec-reader/data/documents.json`. `data/labs.json` `local_copy` fields point here but are string data no code reads.

## Dependency map
```mermaid
graph LR
  upstream["GitHub: openai/model_spec + anthropics/claude-constitution"] -->|"pull-latest.sh (manual, gh API)"| mirrors["specs/ mirrored markdown"]
  mirrors -->|"parse + resolve locators"| cite["engine/spec-cite/cite.py"]
  citation["specs/CITATION.md"] -.->|"locator grammar"| cite
  cite -->|"quote re-verification (CI)"| coverage["tests/test_coverage_json.py (frozen data/coverage.json)"]
  mirrors -->|"full markdown inlined"| build["engine/build-spec-reader-data.py"]
```

## As-is observations
- The pinned versions (`constitution@2026-01-20`, `model-spec@2025-12-18`) are restated in `cite.py` `SPECS`/`DEFAULT_VERSION`, `engine/build-spec-reader-data.py` `DOCUMENTS`, `data/labs.json`, and every stored locator prefix; nothing reads cite.py's registry to keep the others in sync.
- `pull-latest.sh` still fetches the upstream dated release archives although they exceed the GitHub contents API's 1 MB inline limit and arrive as 0-byte files; the empty artifacts have been removed from the repo and the fetch needs fixing (closeout list). Version detection (knowing when upstream has moved past the pinned registry) is an open closeout-list item too, and will need its own signal (e.g. a `docs/` listing or CHANGELOG diff).
- PLAN.md §1.2 and `engine/README.md` describe a weekly spec-watch Action that opens a PR when a spec changes; `.github/workflows/README.md` confirms `spec-watch.yml` is "still to come" — pulls are manual only.
- `CITATION.md` says CI re-resolves locators against `specs/` "so a spec update that moves text fails loudly"; `.github/workflows/ci.yml` does — the `tests/` suite re-resolves every published locator, and `tests/test_coverage_json.py` byte-compares every quote in the frozen ledger.
- The constitution mirror has no anchors, so its locators depend on exact heading-title paths; `CITATION.md` notes a trailing path subset resolves "when unique" today, and stored citations should carry full paths to survive future duplicate titles.
