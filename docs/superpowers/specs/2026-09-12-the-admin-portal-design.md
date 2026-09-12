# The admin portal

> Design doc, 2026-09-12. What an operator can do to the index from a browser,
> and why each capability is shaped the way it is.

## The problem

Every artifact of the index now lives in Supabase, and nothing in the repository
can put one there. Registering a behaviour, registering a specification,
composing a run, spending money on it, and deciding what the public reader shows
are all operations someone performs with a terminal, a service role key, and a
Python environment. Two of them have no code path at all: publishing, whose
script was deleted with the migration that was its only caller, and registration,
whose CLI still writes a JSON file under a `data/` directory that no longer
exists.

The portal is where those operations live. One operator, the repository owner, on
a laptop or a phone, with no terminal.

## What it is not

It is not the public submission button. Someone outside the collective proposing
a specification uploads a file and sends a message; that is a bucket and a Slack
webhook, it is deliberately separate, and it is not in this document.

It is not a second implementation of anything. Judging, pricing and payload
building are Python, they are tested, and they are the only implementations. The
portal's routes start them and read what they wrote. Where that forces an
asynchronous shape on an operation that feels synchronous, the asynchronous shape
wins: a second implementation in JavaScript would be a second truth, and the
first thing it would diverge on is money.

## Surfaces

| Path | What it answers |
|---|---|
| `/signin` | Who are you, and are you on the list |
| `/admin` | What is public, what is in flight, what is registered |
| `/admin/behaviours` | Register a behaviour; see every one and whether it is written for a panel and judged |
| `/admin/specifications` | Register a version of a document; see every version and its digest |
| `/admin/runs` | Compose a run, read its price, launch it, watch it, cancel it |
| `/admin/publications` | Build a publication, preview it, make it public, withdraw it |

These are React server components under `app/admin/`, which is the first
rendered page in this repository: until now the application served two reader
routes and a directory of static files. The split is deliberate and stays. The
public reader is a document reader, it is plain files, and it must keep working
as plain files. The portal is an authenticated application with a session, and it
belongs on the framework that carries the session.

## The door

Google sign-in through Auth.js, refused in the `signIn` callback unless the
address is on the list, exactly as `evals-playground/web/auth.ts` does it. The
same two variables name the list: `ALLOWED_EMAILS` and `ALLOWED_DOMAINS`, both
empty meaning nobody, which is the restrictive and therefore harmless default.

Two rules carried over from that application because each was learned from a
failure:

1. `trustHost: true`. Behind Vercel the host the application sees is not the one
   it serves, and Auth.js refuses the request with `UntrustedHost`.
2. The access check lives in one function every route calls, and a missing
   `AUTH_SECRET` answers 503 naming the variable rather than 500 naming nothing.

The `/admin` layout calls it once, so a page cannot be reached without it; every
mutating route calls it again, because a route is reachable without its page.

## Jobs

Three operations are Python: composing a run, judging it, and building a
publication. Vercel has no Python and no GCP identity, so each one is a launch of
the Cloud Run job through `polaris-batch-trigger`, the same generic service
evals-playground uses, with the secret this application was given.

The job already takes everything through the environment, because Cloud Run Jobs
substitute environment variables and not arguments. It gains a mode:

```
ACI_JOB_MODE=judge     ACI_RUN_ID=<uuid>          python -m panel.batch_job
ACI_JOB_MODE=compose   ACI_JOB_ID=<uuid>          python -m panel.compose_run
ACI_JOB_MODE=publish   ACI_JOB_ID=<uuid>          python -m publish
```

`engine/job.py` is the single entry point the container runs, and it dispatches
on the mode. One image, one job resource, one IAM grant; a mode is a string
rather than a deployment.

**In development the job is a subprocess.** When `ACI_PYTHON` names an
interpreter and `NODE_ENV` is not production, the route spawns it detached
instead of calling the trigger. This is what makes the portal usable on a laptop
with no GCP, and it is locked on both conditions together: a variable forgotten
on a deployment must not turn a Vercel instance into an execution machine.

### Why compose is a job

`compose_run.plan()` prices a run from the panel's own model prices and from the
number of passages in the document, which it gets from `cite.py`. Pricing it in
the route would mean a JavaScript copy of the price table and the passage walker.
So the portal asks the job to compose, and the price arrives as a row: a run
exists, `pending`, with its calls and its `estimated_usd`, and nothing has been
spent. Launching is a second, separate click on a number the operator has read.

A run composed and never launched is a row and a decision not taken. Cancelling
it is a status change.

### Why publishing is a job

A publication carries both payloads the reader serves, and they are built by
`engine/panel/build_site_data.py` and `engine/build-spec-reader-data.py` from the
database. Building them in the route would mean a JavaScript copy of the band
arithmetic, the citation filter and the markdown walker — the code the provenance
verifier holds to a digest. So publishing is a job, and it takes seconds rather
than minutes.

## The new tables

One migration in `polaris-supabase`, the only repository that migrates this
database.

### `aci_jobs` — one row per launch

The portal needs something to poll, for every mode, including the two that
produce no run. It also needs to say where a job ran: the local subprocess and
the deployed service write into the same database, and without a marker a
throwaway trial on a laptop looks like production work. That is the lesson
`evals-playground`'s `origin` column records, and this table is where it lands
here.

```sql
create table aci_jobs (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  created_by      text not null,              -- the signed-in address
  mode            text not null check (mode in ('compose', 'judge', 'publish')),
  params          jsonb not null default '{}'::jsonb,   -- what the mode needs
  origin          text not null check (origin in ('local', 'cloud-run')),
  execution       text,                       -- the Cloud Run execution, or local:<pid>
  status          text not null default 'pending'
                  check (status in ('pending', 'running', 'done', 'error')),
  error           text,
  started_at      timestamptz,
  finished_at     timestamptz,
  run_id          uuid references aci_runs(id),          -- what compose wrote
  publication_id  uuid references aci_publications(id)   -- what publish wrote
);
```

`params` carries the operation's arguments rather than the environment: the
environment carries one id, and the job reads its own row. A behaviour list in an
environment variable would be a length limit waiting to be found.

### `aci_publications.is_public`

The reader serves the newest publication. That was right while a publication
could only be made by a migration, and it is wrong as soon as a button can make
one: the build would go live before anyone had looked at it.

```sql
alter table aci_publications
  add column is_public boolean not null default false;
update aci_publications set is_public = true;   -- the one that is already live
```

Default false, deliberately: a publish that forgets the flag stays invisible,
which is the safe failure. The reader takes the newest publication **with
`is_public`**, and `?publication=<uuid>` still pins any of them, which is how an
operator previews a draft and how provenance is checked against an old one. A
draft is therefore readable by anyone holding its uuid, and that is accepted: the
id is unguessable, the content is a reading of public documents, and the
alternative is an authenticated reader route.

## Registration

### A behaviour

Slug, name, set, group, the display definition, and the judging half: the query
the panel is given, the boundary of the construct, and the provenance. The form
insists on the judging half, because a behaviour registered without it reaches a
panel with `Scope (optional): none provided` — the defect this migration already
found once, and the reason the popup now has four states rather than two.

`engine/panel/new_behaviour.py` is rewritten to write the row instead of a file
under `data/`, and the route and the CLI call the same function. It is the last
file in the repository that still believed in the JSON registry.

### A specification version

Id, lab, title, source url, locator style, the version label, and the markdown.
Inserts the `aci_specs` row when the document is new and always inserts a version
row; versions are insert-only by grant, so a correction is a new version and the
two coexist.

**The validation the manifest took with it.** A locator reads
`name@version > section > ¶1 s2`, so a specification id or a version label
containing `@` or ` > ` would produce locators that cannot be parsed back. The
old guards were a slug pattern and a date pattern; the date pattern was never the
real constraint and a lab that labels a release `v3` is not wrong. The form
forbids exactly what the grammar cannot carry: `@`, ` > `, leading or trailing
whitespace, and an empty string. The same check runs in the route.

## Composing and launching

The compose form takes behaviours, specifications, a panel name and a rubric, and
writes an `aci_jobs` row in mode `compose`. The job runs `plan()`, inserts the
run and its pending calls, and writes the run id back onto its own row.

The run page then reads what exists: a panel, a call count, an estimate, and a
launch control. Launching writes a `judge` job; its progress is the count of
calls by status, which is a query rather than a log. Cancelling sets the run's
status, which `batch_job` already checks between calls.

Nothing here re-prices or re-plans. The number the operator reads before
launching is the number the job wrote.

## Publishing

The form takes the behaviours and the specifications to publish, a panel, a
rubric and a note, and writes a `publish` job. The job builds both payloads,
selects for each cell the newest run that judged it with exactly that panel, and
inserts the publication and its cells. The homogeneity trigger refuses a cell
judged by any other panel, which means a publication that would have compared
unequal panels fails at the database rather than on the site — including the one
the inherited bench would produce, until its nine missing calls are filled.

The publication is written with `is_public = false`. The portal then offers a
preview link and a control to make it public, which is a single update, and
withdrawing is the same update back. An operator can therefore look at exactly
what the public will see before the public sees it.

## What the portal does not do

- It does not edit a behaviour or a specification version. Versions are
  insert-only by grant; a behaviour's row can be updated, and a form that did so
  would silently change what an old run claims it judged. Correcting a behaviour
  is a new row, and that is a later decision, not an omission here.
- It does not delete a run or a publication. Withdrawing a publication is the
  operation that exists.
- It does not show judgements passage by passage. The reader does that.

## Testing

- The allow-list, the locator-safe validation, the job launcher's local and
  remote branches, and the compose/publish argument shapes are unit-tested with
  an injected `fetch` and an injected spawn, as `app/lib/` already is.
- `engine/job.py`'s dispatch is tested per mode against a fake store, beside
  `test_batch_job.py`.
- `new_behaviour.py`'s rewrite keeps its existing tests' intent — duplicate slug
  refused, bad slug refused, next numeric id per set — against a fake store
  rather than a temporary file.
- The portal's pages are checked by a browser walker in the shape of the two that
  already exist, against a stub door that grants a fixed identity. What it
  verifies is that each page renders, each form posts what it says it posts, and
  no page reachable without a session.
