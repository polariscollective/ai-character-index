# Divergence from the upstream project

This fork is `polariscollective/ai-character-index`, from
[`AndresCotton/ai-character-index`](https://github.com/AndresCotton/ai-character-index).
This file records where the two have parted on **substance**: behaviour we
changed, and defects we found in what we inherited. Palette, typefaces and
copy are not recorded here; they are visible in the diff and change nothing
about what the tool computes.

Every claim below was checked against the committed artifacts in the session
that recorded it, and says so. Where something is a finding rather than a fix,
it says that too.

## Defects found in what we inherited

### The published bench compares unequal panels across labs

**Not fixed. Reproduced deliberately by the migration.**

`engine/panel/runlog-v5.jsonl` is the log the shipped payload is built from. It
holds 67 judge calls over 18 cells, not the 54 that nine behaviours times two
specs times three judges would give, because four behaviours were judged by more
models on the Anthropic constitution than on the OpenAI model spec.

| behaviour | judges on the constitution | judges on the model spec |
|---|---|---|
| avoiding-over-and-under-caution | 6 | 3 |
| how-to-approach-tradeoffs | 6 | 3 |
| proportionate-risk-mitigation | 6 | 5 |
| helpfulness | 5 | 3 |

The other five behaviours are three against three. The extra seats are `glm`,
`qwen38-max` and `deepseek-v4`, beyond the `frontier_fast` trio of `sol`,
`fable` and `deepseek`.

This matters because the index exists to compare labs. The reader hides it: its
band maths scores every cell against its own maximum, so a cell judged by six
and a cell judged by three both render on a full scale. But a depth reached
before six judges and a depth reached before three are not the same claim, and
the site presents them side by side as though they were.

Filling the nine missing calls on the model spec is the fix, and it is separate,
dated work. Until then the constraint that forbids this is written into the
database, with the historic publication as its single exemption. See
`docs/superpowers/specs/2026-09-10-index-artifacts-to-supabase-design.md`.

Since then: the public publication as of September 2026, `07958c5e`, is not
grandfathered. Every one of its cells was judged by `frontier_fast`, with recorded
substitutions, so the site no longer shows this bench. The cleanup migration,
`20260916090000_aci_cleanup_after_the_one_panel_redesign.sql` in
`polaris-supabase`, archives the inherited publication, its run and the exemption
into an unexposed `aci_archive` schema and removes them from the tables the index
reads.

### `panel-config.json`'s note about opus describes a different run

**Not fixed.**

`_opus_note` in `engine/panel/panel-config.json` says opus substituted for fable
on `harm-avoidance-to-third-parties` against the model spec. That is true of
`runlog-v3.jsonl`, which carries 963 opus rows. It is false of
`runlog-v5.jsonl`, which carries none. The note sits unqualified in a config
whose `rubric` is `v5`, so a reader naturally applies it to the shipped payload,
where it describes nothing.

### One behaviour was judged without the brief its panel was given

**Not fixed. Reported to the reader rather than hidden.**

`general-welfare-impacts-strict` carries judge calls that reached `done` and no
judging entry: no query, no boundary, no provenance. It is the strict re-reading
variant, and what the panel was actually asked for it survives only in the calls
themselves. Every other behaviour of the reader set carries its brief.

This was invisible until the behaviour note had to print it. The note now says
so in those words rather than claiming nobody has written what the behaviour
means, which is what a two-state reading of the registry made it say first --
defined and judged are independent, and this row is the combination that reads
like a contradiction.

Since then: the strict variant has left the reader. See `The index was reshaped
before it was judged again`. The cleanup migration,
`20260916090000_aci_cleanup_after_the_one_panel_redesign.sql`, archives and
removes its row, with its last call and its curation rows.

### The behaviour registrar wrote to a directory that no longer existed

**Fixed by deleting it.**

`engine/panel/new_behaviour.py` registered a behaviour by writing
`data/behaviours.json`. That directory left the branch with the migration, so the
CLI could only ever have created it fresh and written a registry nothing reads.
Its tests passed throughout, because they wrote to a temporary file. Registering a
behaviour is the admin portal's now, and writes `aci_behaviours`.

### The payload builder accepted two flags it silently ignored

**Fixed.**

`build_site_data.py` took `--runlog=` and `--registry=` and overwrote both before
using them: the runlog file is gone and the registry is the database. A flag that
is accepted and ignored is worse than one that is refused, because the operator
believes it worked. Its docstring described timestamped payloads and a manifest
that no longer exist either.

### Nothing held a published payload to its own digest

**Fixed, by a new check.**

`verify_supabase_provenance.py` compared the stored digest with the recorded one,
and the rebuilt file with the recorded one. Neither asks whether the digest
describes the bytes the reader is served. It does now: each column is
re-serialised the way the builder that wrote it does — `indent=1` for the
behaviour payload, compact for the documents payload — and held to the digest
stored beside it.

This is also what `json` rather than `jsonb` was for. jsonb reorders keys on the
way in, which breaks that equality permanently and silently. It did, once, and the
tables were recreated.

### Every hosted call went out with none of the panel's settings

**Fixed.**

`batch_job.one_call`, `batch_job.one_depth` and `local_run.one_call` built each
call's settings with `h.judge_kwargs(...) if hasattr(h, "judge_kwargs") else {}`.
`h` is harness.py, loaded by each of those modules the same way, and harness.py
carries no `judge_kwargs`: that function lives in whole_doc.py. The `hasattr`
check was therefore always false, and every call the job made went out with
`kwargs={}` -- no `temperature`, no `max_tokens` cap, no `reasoning_effort`,
whatever the model. This has been true since 52bb6a7, the job's first commit, so
every run the hosted job has executed carries it, including the smoke run
`29d490e8` and the full `frontier_fast` rerun of 2026-09-15, `aef5e906`: both ran
every seat at the provider's default settings.

It showed on deepseek, called at the provider's default temperature: its depth
replies came back garbled on repeated attempts, for example `DEPTH:计量2`,
`DEPTH: infant` and `DEPTH:{JUDGMENT}`. sol ran without its `reasoning_effort`,
and no model had its output capped.

The three call sites now import whole_doc.py and call `whole_doc.judge_kwargs`
directly, with no guard. `judge_kwargs` reads a model's quirk off its resolved id
after stripping any OpenRouter vendor prefix, so a native call and its mirror --
`deepseek-ai/DeepSeek-V3.2` and `deepseek/deepseek-v3.2`, alike for fable and sol
-- get the same settings.

## Changes of substance we made

### The reader's data attributes stay machine-readable, its prose does not

`app.js` writes `data-behaviours` and `data-role` on every passage, joined by
` · `, and `verify-reader-test.mjs` splits on that separator to attribute
passages behaviour by behaviour. It is a delimiter, not punctuation. The rail
tooltip and the aria-label are built from the same attributes and are prose, so
they now pass through a `spoken()` helper that renders the delimiter as a comma.

### The `?behavior=` parameter keeps its American spelling

The reader's copy is British throughout. The URL parameter is not, deliberately:
links already shared point at it, and renaming it would break them silently.

### The database is the only source

The index does not live in this repository. The behaviours, the spec text, the
judgements and the two payloads the reader is served all live in the `aci_`
tables of the shared `evals` Supabase project. What is committed here is code and
fixtures.

Roughly twenty megabytes of data left the branch and remain in git history at
`085fd2e`. `engine/published-artefacts.sha256.json` recorded their digests, for
the one publication built from them; it was deleted with that publication in the
cleanup (`20260916090000_aci_cleanup_after_the_one_panel_redesign.sql`), and is in
git history too.

### The clone-and-fork pathway is gone

Someone without credentials cannot run the panel, register a specification, or
rebuild a payload. This was announced rather than discovered: the README says
this fork is heading for a hosted authenticated surface and will in time lose the
property of running from a bare clone.
[`AndresCotton/ai-character-index`](https://github.com/AndresCotton/ai-character-index)
keeps it, and it is still the repository to clone to run the tool yourself.

Since then: `engine/local_run.py` judges a document with one key and no database.
See `A clone can judge again, with no database`.

### The reader opens on the first document it is given

`app.js` defaulted `selectedSpec` to the string `"anthropic"`, which assumed a lab
the index happens to carry. Against any other payload it rendered nothing at all.

The same assumption sat in the focused-reading state, keyed `{ anthropic, openai }`.
Against the test fixture, whose documents are named otherwise, focus mode was
therefore off where production had it on -- so the browser walker had been
checking the unfocused reader all along while the published site served the
focused one. Both are now keyed by the documents the payload carries, and the
walker turns focus off explicitly where it measures that the reader keeps your
place, because in focus mode unticking a behaviour removes text rather than only
its highlights.

It prefers a lab now, and keeps that fallback. With no `?spec=`, the reader opens
on the newest document of `PREFERRED_LAB` (`anthropic`, matched on the head of
the document id) when the publication carries one, and on its first document
when it does not. The fallback stays because the preference is the same
assumption that once rendered nothing: a payload without the lab, the test
fixture among them, must still open on something. `?spec=` still wins, and
`engine/panel/test_appjs_opening.js` holds the three cases.

### A publication's menu is the selection, not the configuration

Found by building one. The payload builder takes its behaviour list from
`display.behaviours` in `panel-config.json`, so the first publication built
through the portal asked for five behaviours and rendered ten — the other five
with no passages at all. A reader reads an empty behaviour as "this specification
says nothing about this", which is the one claim the index must never make by
accident.

`publish.py` passes the selection explicitly now. A consequence worth stating:
`general-welfare-impacts-strict` cannot be published this way, because it has no
cell any panel answered for — its coverage is a re-reading of other behaviours'
judgements. It was in the inherited publication's menu, and the cleanup migration,
`20260916090000_aci_cleanup_after_the_one_panel_redesign.sql`, removes the
behaviour and that publication both.

### A clone can judge again, with no database

The migration took the index into Supabase and took the clone-and-fork pathway
with it: a copy of this repository without our credentials could run nothing at
all. `engine/local_run.py` answers that. One key, one markdown file, one
behaviour written in either registry shape, and the results land in `artefacts/`
as raw files: every reply exactly as it came back, every verdict with its locator
and the text it judged, and what each call cost.

It uses the same composer, the same parser and the same prompt as the hosted job,
so what it produces is the same kind of evidence. What it does not do is publish,
because publishing is a decision about what the public sees.

The upstream repository is still the one to clone for this, and the page says so.
What this adds is that our own repository is no longer a dead end for somebody
who wants to judge a document.

### A dict's default is evaluated whether or not it is needed

**Found by writing a behaviour by hand. Fixed.**

`harness.compose_query` read `beh.get("title", beh["label"])`, which raises
KeyError on `label` for any entry carrying a title and no label — Python
evaluates a default argument before calling `get`. Every entry the index carries
has both fields, so it never fired; the first hand-written behaviour, in the
shape the documentation asks for, hit it immediately.

### Proposals replaced pull requests, and they are only proposals

The upstream project takes contributions as pull requests against a repository
anyone can clone. This fork cannot: the artifacts are in Supabase, judging costs
money, and nobody outside has credentials. `/how-it-works`
(`site/how-it-works.html`) is what replaced it: two forms, opened in a dialog and
posted to `/api/submit`, writing to `aci_submissions`, a private bucket and a
Slack webhook. `site/propose.html`, where the forms first lived, now only
redirects there.

What it deliberately does not do is act. A public route that could start a run
would be a public route that spends money, so a proposal is recorded and read,
and an operator retypes what they accept into the portal's registration form.
That retyping is the moment a stranger's words become the index's, and it is a
person's.

`source_hash` is a salted hash of the caller's address and the salt is the
service key, without which a hash of an address is an address: the space is small
enough to enumerate. It exists to refuse the tenth proposal in an hour from one
place, and nothing else reads it.

### A publication is built before it is shown

`aci_publications` gained `is_public`, and the reader serves the newest
publication carrying it rather than the newest publication. Building one and
showing it were the same act while only a migration could build one; as soon as a
button can, they must be two, or the first thing the public sees is a build nobody
has read.

The default is false, so a publish that forgets the flag stays invisible. The
grant is column-level: `aci_publications` holds select and insert only, because a
publication's bytes are what a digest was recorded against, and granting update on
the table would have given that away to buy one boolean. A pin, `?publication=`,
still reaches any publication, which is how a draft is previewed and how an old
one is checked.

### Every launch of the container is a row

`aci_jobs` records each run of the judging image: its mode, its arguments, where
it ran, and what it produced. Two of the three modes produce no run — composing
prices one, publishing builds payloads — so a table of runs could not answer
"what happened when I pressed that". The `origin` column is the lesson
evals-playground already learned: the local subprocess and the deployed job write
into the same database, and without a marker a throwaway trial looks like
production work.

### A cell can be judged again, and a failed call is retried in its run

**Found by writing the portal's readme. Fixed.**

The composer left out every judge that had already scored a cell, whichever run
held the verdict, and a publication needs all of a cell's judges in one run.
Together those were a dead end. A panel sharing one judge with an earlier run was
composed without that judge, and no publication could use the result; and the
calls that would equalise the ragged bench could not be composed at all, because
every one of their judges had already answered. Composing now takes an explicit
"judge again", which writes the whole panel and pays for it.

The second dead end was a run with failures. `batch_job` marks a run done once
every call has come back, failed or not, and the launch route refused a done run,
so a failed seat could only go into a second run and split its cell. The route and
the Runs page now ask the calls rather than the run (`app/lib/runs.mjs`): a run
with calls that are not done is launched again, in place.

Not fixed, and worth knowing: a retried call's meter reading replaces the failed
attempt's, and a retried depth's replaces its failed attempt's the same way, so a
run's summed cost undercounts what a parse failure spent.

The registration form had a smaller trap beside these. It offered only the sets
rows already carried, so `user`, the set a publication build accepts a new
behaviour in, was not offered, and the default was `reader-test`, which a build
refuses without a hand-written curation row per lab.

Sets were removed later. See `The index was reshaped before it was judged again`.

### A publication shows the display panel, whatever panel it names

**Found while checking the readme's advice. Fixed.**

`publish.py` never passed `--panel` to `build_site_data.py`, which therefore
filtered verdicts to `display.panel`. It passes the publication's panel now, and
the portal composes and publishes with that one panel only.

### The index was reshaped before it was judged again

Sets, human verdicts and the strict variant decide nothing any more: the payload
builder shows every behaviour a publication selects and reads no curation, and
`general-welfare-impacts-strict`, whose reader row was fed by
`animal-welfare-impacts`, leaves the reader. A document is a version, named
`<lab>--<document>@<version>`, which is also the head of every locator into it,
so two versions of one lab's document are two documents. And each judge of the
panel gives a 0 to 4 depth per cell, in a small call after the passages, on the
rubric in `methodology/spec-coverage-depth-rubric.md`; the publication carries
the mean.

Found on the way, and fixed with it: `harness.passages` read a spec's newest
version whatever version a call named, so judging an older version after
registering a newer one would have judged the newer text.

The design is `docs/superpowers/specs/2026-09-14-one-panel-documents-as-versions-and-judged-depth-design.md`.
The database only gained while `develop` was built. `develop` was merged into
`main` on 15 September 2026, and the cleanup migration the design lists is
`20260916090000_aci_cleanup_after_the_one_panel_redesign.sql` in
`polaris-supabase`; see `Where the fork is heading`. It leaves
`aci_behaviours.set_name` in place, because the portal's registration route still
writes that column.

### A seat can be judged by a recorded substitute

**Added because a judge cannot answer one behaviour on one document.** `fable`
returns `finish_reason=content_filter` with empty output on
`harm-avoidance-to-third-parties` against both versions of the OpenAI Model Spec,
`@2025-12-18` and `@2026-08-18`: four attempts on each cell in run `aef5e906`,
none answered. Upstream met the same refusal on the same cell and seated `opus`
instead; `_opus_note` in `panel-config.json` records it for `runlog-v3.jsonl`.
Without a way to say so, those cells could never be published, and dropping the
seat would judge them with two models where every other cell has three.

A substitution is a row of `aci_seat_substitutions`: the cell of the run it
happened in, the seat, the model that judged in its place, and a plain sentence
saying why. The row is the whole of the permission. The publication trigger holds
a cell to the panel with its recorded substitutions applied, exact equality as
before, so a substitute nobody recorded is refused like any stranger in a seat,
and so is a cell judged by both the seat and its substitute. `publish.py` refuses
by the same rule before writing, and counts depths over the seats as substituted.

It is not hidden. The builder files the substitute's verdicts in the seat's place
and writes `substitutions: [{seat, substitute, reason}]` on that cell's coverage
entry and no other, so every other cell's bytes are unchanged. The reader's
behaviour note says it in a sentence beside the document, and the MCP answers
carry the same array.

Which model may take a seat is declared now, not only recorded. `panel-config.json`
carries a `substitutes` block, one ordered list per panel per seat:
`frontier_fast`'s `fable` seat declares `opus`, then `kimi`. Opus is first because
upstream met the same refusal and seated it there, recorded in `_opus_note`. Kimi
follows because on 15 September 2026, judging the Alibaba Model Spec, every
Anthropic model was refused on input: fable through Anthropic's own API, and
fable, opus and sonnet through OpenRouter. Kimi, fable's panel mate in
`frontier_primary`, took the seat instead. A substitute is used only when the
seat's own model cannot answer a cell at all, and each use is still recorded in
`aci_seat_substitutions` with a reason.

Trying the declared order, opus before kimi, is policy for whoever records a
substitution, not a rule the code enforces: nothing stops a reason naming kimi
where opus was never tried. What the code enforces is that the substitute is on
the declared list at all. `publish.py` refuses to build a publication when a
selected cell carries a recorded substitution the panel does not declare for
that seat, naming the cell and the declared order.

## Where the fork is heading

Away from git as the gate, and it has arrived. The artifacts are in Supabase,
judging runs as a job the portal launches, the site is a Next.js application on
Vercel, and the index is operated from a portal rather than a terminal. Upstream
keeps the property this fork gave up, which is running from a bare clone.

`develop` was merged into `main` on 15 September 2026 (PR #1, `119fa63`), Vercel
deployed it to production, and publication `07958c5e`, thirteen behaviours over
four documents, is public on https://ai-character-index.vercel.app.

What is left, as of 16 September 2026:

- Applying the cleanup migration,
  `20260916090000_aci_cleanup_after_the_one_panel_redesign.sql`
  (`polaris-supabase` PR #30), and only once the code that stops reading what it
  drops is deployed: until then the reader's `/api/reader/publication` route
  selects `aci_publications.grandfathered`. It copies into an unexposed
  `aci_archive` schema, then removes, the grandfathered publication, five
  superseded drafts, six runs, the legacy `constitution` and `model-spec`
  documents, three unbriefed behaviours, and the `aci_cell_curation` and
  `aci_coverage` tables, and drops the exemption. `tests/test_schema_after_cleanup.py`
  fails if code names a dropped table or column again.
- Dropping `aci_behaviours.set_name`, which the design also lists, once the
  registration route stops writing it.
- The judging image's deploy. `deploy-runner.yml` has failed on every run, at
  Google Cloud authentication, so jobs are launched from a local portal with
  `ACI_PYTHON` set rather than on Cloud Run.

The reasoning, the data model and the costs are in
`docs/superpowers/specs/`, and the work is planned in `docs/superpowers/plans/`.
