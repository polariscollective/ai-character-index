# Judging runs on Cloud Run — design

Date: 2026-09-10
Status: approved, not started

## Why

The judge panel runs on a laptop. `whole_doc.py` loops over behaviours, specs
and models, appends to a local JSONL, and holds the whole thing in one terminal
for as long as it takes. A run that dies takes its terminal with it, and a run
someone else needs cannot be started by anyone but its author.

The index is heading for a surface where an admin adds a spec and asks for it to
be judged. That asks for the work to happen somewhere it can be started by an
HTTP request, watched by someone who did not start it, and resumed after a
crash.

## Scope

This is the second of three documents.

1. **Artifacts in Supabase.** Written: the tables, the migration, the citation
   guarantee, and the move to Vercel.
2. **The Cloud Run job.** This document.
3. **The admin surface.** The authenticated pages that register a spec, compose
   a run, and publish a result. Its own document.

This document assumes the tables of the first exist. It stops at the point where
a run and its calls are rows: what puts them there is a small CLI here, and the
admin surface later. Nothing here renders anything.

## The shape

The pattern is `evals-playground`'s, and this repository takes its conventions
rather than inventing others.

```
the admin surface, or the CLI  ──►  aci_runs + aci_judge_calls, all pending
                                          │
                                          ├──►  POST BATCH_TRIGGER_URL
                                          │       { job, env: { ACI_RUN_ID } }
                                          │           │
polaris-batch-trigger  ◄──────────────────┘ ◄─────────┘
  validates the caller's secret, starts the job with its own GCP identity
                                                      │
Cloud Run Job — ai-character-index-runner  ◄──────────┘
  python -m panel.batch_job
  reads the pending calls, judges, writes each one as it lands
                                                      │
Supabase  ◄───────────────────────────────────────────┘
  aci_judge_calls · aci_judgements
```

Nothing changes in `polaris-batch-trigger`. It already takes a job name and an
environment map, and already keeps each caller to its own jobs.

Everything reaches the job through the environment, because Cloud Run Jobs can
substitute environment variables at launch and not command-line arguments.

| variable | role |
|---|---|
| `ACI_RUN_ID` | the run to execute, already in the database with its calls |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | the store |
| `OPENROUTER_API_KEY` | every judge, see Routing |

## The loop

The job invents no work. The calls exist, `pending`, before it starts, so the
size of the run is known before the first token is spent and progress is a
count rather than an estimate.

For each pending call the job reads the spec version's markdown from the
database, splits it into numbered passages, composes the prompt from the run's
frozen rubric and the behaviour snapshot the run carries, and makes one request.
A parsed reply becomes one `aci_judgements` row per passage, written in one
statement, and the call goes to `done` with its tokens, seconds, finish reason
and cost.

**Calls run concurrently, capped per provider.** These are network waits, not
computation, so the ceiling that matters is the provider's rate limit rather
than the container's CPU. The cap is keyed by each model's *native* provider
even when the transport is OpenRouter, so a slow Anthropic budget does not
throttle the DeepSeek seat. One process, so one place where state is written,
and a single query answers what is left.

**Resume is a filter, not a log replay.** Relaunching a run picks up every call
that is not `done`, which is the same semantics `done_keys` gives today and
needs no file to survive. Cancelling is a status the job reads between calls.

**A failed call is a first-class outcome, not an exception.** Today a reply that
parses below ninety-eight percent writes nothing, saves its raw text beside the
script, and is described in the code as retryable. Here it goes to `error` with
its raw output on the row, writes no judgements, and the run carries on. There
is no automatic retry: the usual causes are a content filter or a truncation,
and a blind retry spends money on the same failure. Relaunching the run is the
retry, and it is a person's decision.

That is what makes a partial run useful rather than wasted. Cells are durable
and a publication selects per cell, so the cells that finished are publishable
whatever happened to the rest.

## Routing

Every judge goes through OpenRouter. All three seats of the shipped panel carry
an OpenRouter mirror, and so does the `opus` substitute, so one key covers the
panel.

The container therefore mounts no native provider key, and this is a
requirement rather than an economy. `harness.resolve()` prefers the native route
and falls back to the mirror only when the native key is absent: mounting
`ANTHROPIC_API_KEY` beside `OPENROUTER_API_KEY` would silently send the Anthropic
seat direct. One provider key in this container.

It is also cheaper. The `sol` seat is half price through the mirror; the other
two are within a percent of their native rates.

## Cost

A run is priced before it is launched, from the panel's own prices and the token
count of the documents it will read, and the estimate is stored on the run. The
job sums the real cost from its calls as they land.

Estimates for the shipped panel, through OpenRouter:

| what is launched | calls | estimated |
|---|---|---|
| the whole bench | 60 | $20 |
| one more spec, judged on every behaviour | 30 | $10 |
| one more behaviour, judged on every spec | 6 | $2 |

There is no hard ceiling. The amounts do not warrant one, an interrupted run
loses only the calls that had not landed, and a ceiling that stops a run
mid-cell produces exactly the half-judged cell a publication then refuses.

## The image

A Dockerfile in this repository, carrying the engine and nothing else. No site,
no reader, no builders: those run where the site is served.

The base is `python:3.12-slim`. The engine's only third-party dependency is
`openai`, which every provider is reached through, plus a Supabase client. The
image is built and pushed by a workflow here on each deploy, into the shared
`polaris-docker` registry that already exists in the seed environment.

## Terraform

A new file in `polaris-tf`, `environments/app/ai_character_index_batch.tf`,
modelled on `evals_playground_batch.tf`.

To create:

- a service account for the job;
- `google_cloud_run_v2_job` named `ai-character-index-runner`, with a 24-hour
  timeout, one CPU and 2Gi, and `max_retries = 0` because a retry is a decision
  taken against the calls rather than against the container;
- `google_cloud_run_v2_job_iam_member` granting `roles/run.developer` to the
  trigger's service account. Plain `run.invoker` covers a run with no
  overrides, and the run id arrives as one;
- a `google_secret_manager_secret` for `OPENROUTER_API_KEY`.

Not to create: the image registry, which is shared and already exists; and the
Supabase secrets, since the index lives in the same project as
`evals-playground` and reuses `COP_SUPABASE_URL` and
`COP_SUPABASE_SERVICE_ROLE_KEY`. Those secrets are named for the application
that first needed them, and renaming them would destroy and recreate secrets a
live service depends on to fix nothing but a label.

Two things are deliberately outside Terraform, because this repository never
manages a secret's value:

- the OpenRouter key itself. It must be given a version **before** the first
  apply, or Cloud Run refuses to create a container mounting a secret with no
  version, and the apply fails;
- the new entry in `BATCH_TRIGGER_CALLERS`, giving this application its own
  secret and naming the one job that secret may start.

## Verification

The run that already exists is the oracle. Take the migrated v5 run, delete one
call's judgements, relaunch, and the rebuilt payload must be byte-identical to
the committed one. That proves the job produces what the laptop produced.

Four checks alongside it:

- A run with no pending calls finishes immediately and changes nothing.
- A call whose reply is deliberately unparseable lands in `error` with its raw
  output, writes no judgement, and leaves the rest of the run to finish.
- Cancelling a run mid-flight stops it between calls, and the calls already
  `done` keep their judgements.
- With `OPENROUTER_API_KEY` alone in the environment, every seat of the panel
  resolves to its mirror. This is the requirement from Routing, and it is worth
  a test because the failure is silent and expensive.

## What this does not do

It does not publish. A finished run changes nothing a reader sees until someone
selects its cells, which is the third document.

It does not compose runs either. Deciding that a new spec should be judged on
every behaviour is a decision made where the button is, and this job receives
the result of it as rows.
