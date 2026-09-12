# AI Character Index

Run by Polaris Collective, started by Andres Cotton.

An index of AI character: behaviours on one axis, the labs' model specifications
on the other, and in each cell a passage-level coverage map. Every verdict is a
panel of frontier models reading a whole document, and every claim anchors to a
verbatim quote with a locator that resolves back into the text.

- **Assess coverage.** How well does a specification address a behaviour? Is it a
  defining commitment, a passing mention, or a gap?
- **Locate the exact text.** Every verdict anchors to a passage, so you see
  precisely where a behaviour is addressed.
- **Select passages for downstream work.** Every citation is a stable,
  re-resolvable locator plus a verbatim quote, ready to feed adherence evals.

The reader is open to everyone at **[/spec-reader/](/spec-reader/)**. Nothing
below is needed to read it.

## Origins

This repository is Polaris Collective's continuation of the AI Character Index,
created by [Andrés Cotton](https://github.com/AndresCotton) with the help of Matt
Stults. The vision and the initial execution are his, including the first version
of the spec reader. The project passed to Polaris Collective in September 2026,
with Andrés's agreement, to be carried further.

**[`AndresCotton/ai-character-index`](https://github.com/AndresCotton/ai-character-index)
is the repository to clone if you want to run the tool yourself.** It stands
alone: Python, a browser, nothing else. This fork no longer does. The index lives
in Supabase, judging runs as a Cloud Run job, and the site is a Next.js
application on Vercel — so someone without credentials cannot run the panel,
register a specification, or rebuild a payload. That property was given up
deliberately, and the upstream repository keeps it.

What changed of substance, and what we found in what we inherited, is recorded in
[CLAUDE.md](CLAUDE.md). The map of the system is [SYSTEM.md](SYSTEM.md).

## How it fits together

```
Vercel: Next.js — the reader's routes, the proposal form, the admin portal
   │
   ├── reads and writes ───►  Supabase: the aci_ tables and one bucket
   │                             behaviours · specifications · runs ·
   │                             judgements · publications · proposals
   └── starts ─────────────►  polaris-batch-trigger  ──►  Cloud Run job
                                                            compose · judge · publish
```

**The database is the only source.** The behaviours, the specification text, the
judgements, the frozen ledger and the two payloads the reader is served all live
in the `aci_` tables. What this repository holds is code, fixtures, and
`engine/published-artefacts.sha256.json`, which records what the index published
when the migration was verified against it.

**Publishing is not a deploy.** A publication row decides what the reader shows,
and making one public is a database write.

## Running it without credentials

**If you cloned this to judge a document, you do not need an account, a database,
or anything of ours.** One key, one document, one behaviour:

```sh
export OPENROUTER_API_KEY=sk-or-v1...
cat > behaviour.json <<'JSON'
{
  "slug": "bribery-resistance",
  "title": "Bribery resistance",
  "query": "The model should not change its behaviour in response to offers of payment, reward or favours, and should not solicit them.",
  "boundary": "The construct is resistance to inducements aimed at the model. NOT this behaviour: whether the model will discuss bribery as a topic."
}
JSON
python3 engine/local_run.py     --document=my-spec@2026-09-12:path/to/spec.md     --behaviour=behaviour.json     --panel=frontier_fast
```

Results land in `artefacts/<timestamp>-<document>-<behaviour>/`:

| File | What it holds |
|---|---|
| `run.json` | what was asked, the document's digest, and what each call returned |
| `judgements.jsonl` | one line per model per passage: locator, verdict, and the text judged |
| `passages.jsonl` | the document as the panel saw it, written before any call is made |
| `<model>.reply.txt` | each reply exactly as it came back |

They are files, so they diff. Two runs of the same behaviour against two drafts
of a document, and `git diff` is the answer to whether the rewrite changed what
the document covers.

`--panel` takes a name from `engine/panel/panel-config.json` or a comma-separated
list of model tags. `--behaviour` takes either registry shape; a boundary is
optional and worth writing, because without one each judge draws its own line.

**The tool that stands alone is
[`AndresCotton/ai-character-index`](https://github.com/AndresCotton/ai-character-index).**
It needs no infrastructure at all and is the one to clone if running the panel is
what you came for. This repository carries the hosted index as well, which is why
everything below it needs credentials.

## Running the whole thing locally

You need the Supabase project's URL and service role key. Ask the team.

```sh
cp .env.example .env        # then fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
pnpm install
pnpm dev                    # http://localhost:3000
```

That serves the real index out of Supabase: the reader at
[/spec-reader/](http://localhost:3000/spec-reader/), and the admin portal at
[/admin](http://localhost:3000/admin).

**Signing in locally.** The portal's door is Google sign-in against an
allow-list, which needs an OAuth client. To skip that on a development machine,
set `ACI_DEV_OPERATOR` to the address you want to be. It is ignored when
`NODE_ENV` is production, so it cannot open a deployment.

**Running a job locally.** Composing a run, judging it and building a publication
are Python, and in deployment each one is a Cloud Run job started through
`polaris-batch-trigger`. On a laptop there is no such service, so setting
`ACI_PYTHON=python3` makes the portal start the job as a subprocess instead —
same code, same database, and the job row says `local` so a trial is never
mistaken for production work. Without it, set `BATCH_TRIGGER_URL` and
`BATCH_TRIGGER_SECRET` and the local portal starts the deployed job.

A job can also be run by hand, which is what the portal does for you:

```sh
python3 engine/publish.py --behaviours=helpfulness --specs=constitution,model-spec \
    --panel=sol,fable,deepseek --rubric=v5
python3 engine/panel/compose_run.py --behaviours=helpfulness --specs=constitution   # priced
python3 engine/panel/compose_run.py --behaviours=helpfulness --specs=constitution --go
ACI_RUN_ID=<uuid> python3 engine/panel/batch_job.py                                 # spends money
```

## Proposing something

The pull-request pathway is gone with the clone-and-fork one, and
`/how-it-works` replaces it: one page explaining the index, with the two proposal
forms on it. A proposal is recorded in `aci_submissions`, its document
goes to a private Supabase Storage bucket, and Slack is told.

Nothing more happens by itself. Running a proposal costs money, so an operator
reads it in the portal and registers it there if it is worth the spend, which is
the only place either decision is taken.

## The admin portal

`/admin`, behind Google sign-in and an allow-list (`ALLOWED_EMAILS`,
`ALLOWED_DOMAINS`; both empty lets nobody in).

| Page | What it does |
|---|---|
| Overview | What the public sees, what is registered, what is in flight |
| Behaviours | The registry, and the form that adds to it |
| Specifications | Each document, its versions and their digests; register a version |
| Runs | Compose a run and read its price, launch it, watch it, cancel it |
| Publications | Build a publication, read it before anyone else, make it public |
| Proposals | What arrived through the public form, and what you did about it |

Composing and launching are separate on purpose: composing writes the calls and
prices them and spends nothing, so the number read before launching is the number
the job wrote. A publication is built as a draft and is invisible until someone
marks it public.

## Judging

A run is a batch of judge calls, one per behaviour × specification version ×
model. Every call exists in the database before the work starts, so the size of a
run is known before a token is spent, progress is a count rather than an estimate,
and resuming is a filter over the calls that are not done.

A reply that will not parse is a first-class outcome, not an exception: the call
keeps its raw output, writes no judgement, and the run carries on. There is no
automatic retry — the usual causes are a content filter or a truncation, and a
blind retry spends money on the same failure.

Every judge is reached through OpenRouter, and that is a requirement rather than
an economy: the harness prefers a native route whenever that provider's key is
present, so a stray `ANTHROPIC_API_KEY` would silently send the Anthropic seat
direct instead of through the mirror the run was priced against.

## Citations

Every claim carries a locator — `constitution@2026-01-20 > Being honest > ¶18 s1-4`
— that resolves to an exact span of the stored text. The grammar is
[`specs/CITATION.md`](specs/CITATION.md) and the resolver is
[`engine/spec-cite/cite.py`](engine/spec-cite/cite.py).

Specification versions are insert-only, enforced by database privilege rather than
by convention: no code path can move text a stored locator points at, because none
holds the privilege to. A correction is a new version, and the two coexist.

## Checks

Offline, no credentials — what CI runs:

```sh
python3 -m unittest discover -s tests      # the citation resolver and its corpus
python3 engine/panel/test_panel.py         # the judging pipeline
python3 engine/panel/test_judge_call.py
python3 engine/panel/test_batch_job.py
python3 engine/panel/test_compose_run.py
python3 engine/test_job.py                 # the job's dispatch
python3 engine/test_publish.py             # which run answers for a cell
python3 engine/test_local_run.py           # judging with no database
python3 engine/test_store.py
python3 engine/test_index_store.py
node --test app/lib/__tests__/*.test.mjs   # the application's libraries
node engine/verify-reader-test.mjs         # the reader, in a browser
node engine/verify-reader-features.mjs
```

With credentials — what the scheduled provenance job runs:

```sh
python3 engine/verify_supabase_provenance.py   # the database still publishes what was verified
node engine/verify-portal.mjs                  # the portal renders and its forms match its routes
```

## Where things live

| Path | What it is |
|---|---|
| [`app/`](app/) | The Next.js application: the reader's routes, and the admin portal |
| [`engine/`](engine/) | The judging engine, the payload builders, the job, the verifiers |
| [`engine/local_run.py`](engine/local_run.py) | Judging one document against one behaviour, with no database |
| [`engine/spec-cite/cite.py`](engine/spec-cite/cite.py) | The citation resolver behind every quote |
| [`site/`](site/) | The reader's source, copied into `public/` at build time |
| [`specs/`](specs/) | The locator grammar, and the mirrors' provenance notes |
| [`docs/superpowers/`](docs/superpowers/) | Why the index moved, and how each piece was planned |

The remaining directories (`research/`, `methodology/`, `design/`, and friends)
are the project's editorial records; none of them are needed to run it.

## Contributors

- **[Andrés Cotton](https://github.com/AndresCotton)** -- creator. The vision and
  the initial execution, including the first version of the spec reader.
- **Matt Stults** -- helped Andrés with that initial work.
- **[Polaris Collective](https://polariscollective.org)** -- maintains the project
  from September 2026.

The original authors' copyright and citation metadata are unchanged: see
[`NOTICE`](NOTICE) and [`CITATION.cff`](CITATION.cff).

## Licence and citation

Dual-licensed, by what the file is rather than where it sits:

| | Licence | Covers |
|---|---|---|
| Software | [Apache-2.0](LICENSE) | `.py`, `.js`, `.mjs`, `.html`, `.css`, `.sh`, `.yml`, plus dependency manifests |
| Written work and data | [CC BY 4.0](LICENSE-CC-BY-4.0) | `.md`, `.json`, `.jsonl`, `.txt` — coverage data, judged runlogs, methodology, docs |

Both require attribution. CC BY is the licence academic work expects for data
and written material; Apache-2.0 carries the patent grant that matters for code.

**`specs/` is not ours.** It holds verbatim copies of specifications published by
Anthropic and OpenAI, both released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — a public-domain
dedication that imposes no conditions and requires no attribution. We attribute
them anyway. Cite those documents to their publishers, never to this project.
CC0 covers copyright, not trademarks; nothing here is endorsed by or affiliated
with either organisation. See [NOTICE](NOTICE) for the full statement.

To cite this project, use [CITATION.cff](CITATION.cff) — GitHub renders it as a
"Cite this repository" button with BibTeX and APA output.
