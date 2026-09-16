# panel-judges

Panel of LLM judges over spec passages. Per passage, each model votes **relevant / not**;
the published score is **0..N = how many models voted relevant**. See `FINDINGS.md` for why
we're here (lexical → semantic → panel) and `docs/matts-personal-notes.md` `[LADDER]` for the
experiment ladder + log.

## Pipeline
```
python3 harness.py <behaviour> <spec> <tag[,tag,...]> [--reason] [--v2|--v3]   # judge -> runlog.jsonl
python3 aggregate.py [behaviour]                                    # runlog -> scores-*.json + agreement
```
Rubrics: `v1` binary (frozen baseline), `v2` ternary + Scope (frozen -- runlog rows and export
provenance hashes key on it), `v3` ternary + coverage-report framing + labelled behaviour
fields (current; see `example-prompt-v3.txt`).

## Behaviour input (the v3 contract -- what we need from the user)
The prompt has three parts: the fixed task rubric (`SYSTEM_V3`), the behaviour block
populated from the user's form, and the passages. The behaviour block is a FIXED template
(`BEHAVIOUR_TEMPLATE_V3`; full prompt with raw variables in `prompt-template-v3.txt`) with
one variable per form field -- no lines appear or disappear, so a form can populate it later:
- `{title}` -- short name of the behaviour. **Required.**
- `{definition}` -- one or a few sentences stating what the behaviour requires. This is
  the construct the judges grade against. **Required.**
- `{clarifications}` -- notes resolving ambiguities in the definition. **Optional**; a
  blank form field renders as `none provided`.
- `{scope}` -- the construct's edges, naming neighbouring behaviours that are NOT this
  one. **Optional** (blank -> `none provided`) but strongly recommended: it is what keeps
  topic-adjacent passages out of the coverage report.
The rubric marks both optional fields "(optional)" and tells judges `none provided` means
only that the field was left blank. `behaviours.json` sources them as `title` (falls back
to `label`) / `query` (`query_v2` wins) / `clarifications` / `boundary`; entries whose
labels carry experiment annotations (e.g. "(tight / well-defined)") set a clean `title`.
- **Durable:** every verdict is appended to `runlog.jsonl` as it arrives; nothing is held only
  in memory.
- **Resumable:** re-running skips any `(behaviour, spec, model, locator)` already in the runlog.
- **Uniform:** one system+user prompt + "verdict per line" for every model, via each provider's
  OpenAI-compatible endpoint (`PROVIDERS` / `MODELS` in `harness.py`).
- `--reason` also logs the raw model output to `reasons.jsonl` (calibration/debug only).

`aggregate.py` writes `scores-<behaviour>-<model>.json` and `scores-<behaviour>-panel.json` in
the same shape the semantic-coverage demo (`build_demo.py`, parked branch) renders, so we can
visualise the panel in real context.

## Setup
- Keys in `.env` (gitignored): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPINFRA_API_KEY`,
  `TOGETHER_API_KEY`, `GEMINI_API_KEY` (only the ones you use).
- Populate `behaviours.json` from `behaviours-for-adria`.

## Ladder (this dir = R0 onward; prior phase parked in `experiment/semantic-coverage`, PR #15)
R1 format smoke test · R2 approach sound (2 behaviours × models) · R3 cheapest model/family ·
R4 full run (10 behaviours) → publish.
