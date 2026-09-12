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
judgements, the frozen ledger and the two payloads the reader is served all live
in the `aci_` tables of the shared `evals` Supabase project. What is committed
here is code, fixtures, and `engine/published-artefacts.sha256.json`, which
records what the index published when the migration was verified against it.

Roughly twenty megabytes of data left the branch and remain in git history at the
commit that file names.

### The clone-and-fork pathway is gone

Someone without credentials cannot run the panel, register a specification, or
rebuild a payload. This was announced rather than discovered: the README says
this fork is heading for a hosted authenticated surface and will in time lose the
property of running from a bare clone.
[`AndresCotton/ai-character-index`](https://github.com/AndresCotton/ai-character-index)
keeps it, and it is still the repository to clone to run the tool yourself.

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
judgements. It is in the inherited publication's menu and will not be in the next
one until somebody judges it.

### Proposals replaced pull requests, and they are only proposals

The upstream project takes contributions as pull requests against a repository
anyone can clone. This fork cannot: the artifacts are in Supabase, judging costs
money, and nobody outside has credentials. `site/propose.html` is what replaced
it — two forms writing to `aci_submissions`, a private bucket and a Slack
webhook.

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

## Where the fork is heading

Away from git as the gate, and it has arrived. The artifacts are in Supabase,
judging runs as a Cloud Run job, the site is a Next.js application on Vercel, and
the index is operated from a portal rather than a terminal. Upstream keeps the
property this fork gave up, which is running from a bare clone.

What is left: the twelve calls that would equalise the ragged bench, until which
no new publication can carry the four behaviours whose panels are unequal.

The reasoning, the data model and the costs are in
`docs/superpowers/specs/`, and the work is planned in `docs/superpowers/plans/`.
