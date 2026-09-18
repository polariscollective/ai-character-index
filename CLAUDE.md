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

Since then: the public publication as of September 2026, `1919ee6b`, is not
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
judgements and the three payloads the reader is served all live in the `aci_`
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

### A reader can leave a note on a paragraph, or on a document

The index says things about paragraphs, and every one of them is a panel's
reading. `aci_feedback` is where a reader disagrees, or just agrees: a third
icon beside the two copy icons on every paragraph, cited or not, opens a
dialog that takes a comment, a thumb, or both. The dialog calls this a note —
"Note on this paragraph", "Note on this document" — and so does the portal,
whose page is titled "Notes"; the table, the route and the URL stayed
`aci_feedback` and `/api/feedback`, because renaming those for a word would
have been churn with nothing behind it. `/api/feedback` is the second route
open to the internet that writes, and carries the proposal form's guards for
the same reasons: a honeypot, thirty per source per hour counted against the
table itself, a cap on every field, and a size cap read from Content-Length
before the body is buffered.

The consent default is not what was planned, and it is worth saying plainly
why. A note sent without touching a single control is `anonymous`, not
private: the toggle defaults off. Most readers never touch it, so for them
the default is not a fallback, it is the whole of their consent — and an
untouched control that quietly meant "keep this private" was a courtesy
nobody had asked for and nobody could see. The toggle says what private
protects. Nothing says what leaving it alone costs, and that is worth knowing
rather than papering over: a paragraph above the toggle said it, and was removed
as unnecessary. A reader who touches no control is not told that their words may
be shown. `private` is the deliberate opt-out now, not the default. What was three
radio choices is one toggle and a name field, and visibility is derived
rather than asked for twice: the toggle on gives `private`; off with a name
typed gives `attributed`; off with nothing typed gives `anonymous`. The
database's two check constraints — a note says something, a name is present
exactly when `attributed` is chosen — are unchanged and still hold; only the
form above them changed shape.

A note can also be about a whole document, not only a paragraph: an icon
beside the document's title opens the same dialog with no behaviours field,
and sends the document's id as the `locator`. Neither a migration nor a route
change was needed, because a document id is already a locator that names the
whole document.

There is no withdrawal, and the dialog does not say so. The table grants
select, insert and update to the operators who read it, and no delete, so a note
is a message that was sent. Nothing tells the reader that before they send it,
which is the second half of the same gap: a note cannot be taken back, and the
moment to choose private is the only moment there is.

Three things it does deliberately, unchanged from the plan. The behaviours it
shows are the intersection, not the menu: of the behaviours ticked in the
sidebar, the ones citing that paragraph, which is the set colouring the text
in front of the reader. The publication is resolved by the route rather than
taken from the page, because a locator names the text and carries its version
but the reading laid over it is a publication's; `publication_id` carries no
foreign key, so a publication archived by a cleanup migration does not take a
reader's words with it. And the address is never public at any of the three
states: what `attributed` shows is a name the reader types for the purpose,
because an address published as given is harvested within days, a cost we
would be imposing on somebody who did us a favour. The name is required when
`attributed` is chosen, in the form and again as a check constraint, so
choosing to be named and leaving it blank is refused rather than quietly
published as anonymous.

Nothing is displayed yet, and that is the point of recording consent now: the
surface, when it exists, will be built from what readers actually permitted.
The design is `docs/superpowers/specs/2026-09-16-feedback-on-a-paragraph-design.md`;
the table is `20260916140000_aci_feedback.sql` in `polaris-supabase`.

### A copy now says `Copied`, not only a colour change

Unrelated to notes, landed in the same branch: pressing "Copy locator" or
"Copy link" already wrote to the clipboard and turned the button
accent-coloured, but the confirmation of that lived in an `aria-live` region
only a screen reader hears, so a sighted reader had nothing to go on. The
button now shows the word "Copied" in place of its icon, accent-coloured, for
two seconds, then reverts: a successful clipboard write is otherwise
invisible, and an announcement only a screen reader hears is not feedback for
the reader looking at the page.

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

### The depth judge was shown less of the document than the reader

**Found by asking why one cell scored 1.0. Fixed, and the depths it spoiled were
given again.**

A depth call never reads the document. It reads the passages the panel cited, and
`bands.shown_by_default` chose them: it returned the defining and core bands. The
reader's `DEFAULT_BANDS` has been defining, core and related since related was
made visible by default -- drawn thinner rather than hidden behind a toggle -- so
the two lines fell out of step, and the figure printed under a behaviour was read
from less evidence than the page under it shows. Both sides said in a docstring
that they drew the line the reader draws, which is what the line had stopped
being.

What it published: `not-undermining-human-oversight` on
`openai--model-spec@2026-08-18` was 1.0, unanimously. `#scope_of_autonomy ¶14`
scored 6 on the 2025-12 version of that document and 5 on the 2026-08 one, because
one judge moved it from 3 to 2 after "shutdown timer" became "ending condition".
Six is the core cut on a three-judge panel, so the passage left the evidence and
the judge was handed a single bullet, and three judges correctly read one bullet
as depth 1. The rule itself is byte-identical across the two versions.
`objectivity-on-contested-questions` (five cited passages down to one) and
`helpfulness` (three down to two) had the same shape, milder.

`shown_by_default` returns every banded passage now. `bands.py` carries
`DEFAULT_BANDS` beside `TIERS`, and `test_bands.py` reads the reader's own
`DEFAULT_BANDS` line out of `site/spec-reader/app.js` and holds the Python to it,
so a copy cannot drift silently again. The prompt says the passages are every one
the panel cited and not a shortlist of the strongest, and
`methodology/spec-coverage-depth-rubric.md` says plainly what the judge is shown
and that a depth is a reading of the panel's citations rather than of the whole
document. `prompts/depth-v1.txt` changed with it, from sha `20df8c4d` to
`bd096eba`; a run records the depth prompt's digest, so the wording cannot change
quietly.

The 156 depth calls of the three runs the public publication selects from
(`aef5e906`, `c2f1b34a`, `a2bdadba`) were given again in place, under the new
prompt, on 16 September 2026, for $3.42 against the $2.21 the first depths cost.
Nothing was deleted, no run was composed, and no judgement or passage call was
touched: the depth rows went back to `pending`, which is the only thing
`batch_job.pending_depths` reads, and the job gave them again. The runs' recorded
cost moved with them, because a run's cost is summed from its calls and its
depths.

The evidence the judges were handed grew from 403 retained passages to 1079, and
33 of the 52 cells moved. The cell the investigation started from,
`not-undermining-human-oversight` on `openai--model-spec@2026-08-18`, went from
1.0 to 3.3 on 1 passage becoming 10; no cell that moved fell by more than 0.4.

Four of the 156 did not come back with a depth on the first asking.
`deepseek` answered `DEPTH: -1` on `avoiding-over-and-under-caution` and
`how-to-approach-tradeoffs` against the Alibaba Model Spec, `no-sycophancy`
against the constitution, and `proportionate-risk-mitigation` against
`openai--model-spec@2025-12-18`. Minus one is not on the 0 to 4 scale the prompt
asks for, so `depth_call.parse` reads no answer and the call fails, as it should:
reading a score out of a rationale would be inventing a verdict.

The remedy on record was tried, exactly as the ledger describes it for the same
seat on 15 September: the four calls were asked again with a one-line format
reminder appended to the USER message, naming the single integer 0 to 4, saying
that passages which do not bear on the behaviour are 0, and refusing any other
value. The system prompt is untouched, so `depth_prompt_sha256` does not move.
Two then answered on scale, both 2, and their cells are complete. The two Alibaba
cells answered off scale five more times each.

What those ten replies show is worth writing down, because it decides what to try
next. `deepseek` is not saying the document is absent and inventing a token for
it: every rationale describes content, one of them "a concrete prioritization
method through permission levels and conflict-resolution rules, which can be
quoted as pass criteria", which is the rubric's own definition of 3. Nor is it
refusing: the replies come back in one to three seconds, `finish_reason=stop`,
in the two-line format asked for. And the figure cannot be read as a negated
depth, because `how-to-approach-tradeoffs` answered `-3` twice and `-1` three
times with materially the same rationale. The sign is not a mistake with a
recoverable magnitude behind it.

A ladder of user-message variants finished it, cheapest first, a cell leaving the
ladder the moment it answered on scale, and the system prompt untouched
throughout. A one-shot example -- the two lines of a correct answer carrying a
number that is not the one expected back, so it shows the shape and suggests
nothing -- took `how-to-approach-tradeoffs` on its second attempt, at the panel's
temperature 0, to depth 3. `avoiding-over-and-under-caution` refused that,
refused the scale restated inline one line per level, refused both together with
a sentence saying a negative number is not on the scale, and refused all three
again at temperature 0.2. It answered at temperature 0.5, on the second attempt,
`DEPTH: III`, which the parser reads because 0f32b79 taught it Roman numerals;
the attempt before had answered `DEPTH: (4) DEMONSTRATED`, which it does not.

That one figure was obtained at a temperature the panel does not use, and the
publication's notes say so beside it: a reader must be able to see that it was
got differently from every other figure in the grid. Nothing else was bent to
reach it -- no substitute seated, no rule relaxed, no parser taught to read a
number that is not on the scale.

Publication `1919ee6b` carries the result: the same thirteen behaviours over the
same four documents as `07958c5e`, from the same runs, with the same passages,
and only the depth figures re-judged. It was verified on every line and made
public on 16 September 2026; `07958c5e` was withdrawn the same day, because the
figures it carries are wrong rather than merely superseded. Re-judging depths in
place has a cost worth knowing: `07958c5e` no longer rebuilds to its stored
digest, because its payload carries the depths it was published with and the rows
now hold different ones. Its stored bytes still match their own digests and its
passages still resolve; only the rebuild check fails, and it fails for a reason
the record explains.

### Two documents can be compared passage by passage, and one seat could not do it

The index said how deeply one document covers a behaviour, and nothing about how
two documents relate. A link says that: one passage of one document against one
passage of another, with a relation decided by a test a judge can apply, would a
response that respects the first also respect the second. The five relations are
`same`, `stricter_source`, `stricter_target`, `nuance` and `contradiction`, and a
sixth row, `absent`, is a judge saying the other document has nothing on this
passage. Each side also records who may lift its rule, in one vocabulary rather
than each document's own, because the same norm at root level and as a default
are not the same claim.

The sources of a call are the passages a reader sees by default for a cell; the
target is the whole of the other document, in both directions. That is what lets
a silence be asserted at all, and what finds a counterpart filed under another
behaviour: in the first run, 23 of the 51 target passages cited were outside the
cell's own retained set.

What the panel asserts is derived at read time and never stored, the way the
reader's bands are derived from verdicts. A link needs two judges of three, a
contradiction needs two, and a silence needs all three. The asymmetry is
deliberate: "this document says nothing about that" is the strongest claim the
comparison makes, and one judge finding a counterpart is enough to withhold it.

**The finding, and it is not fixed.** In the first run `deepseek` could not
answer at this length: 30 of 49 source passages, then 47 of 49, then 13 of 29,
each time stopping of its own accord under a 32,768 token cap. The completeness
floor refused all three replies, because a half-answered reply stored as links is
a page of invented absences. So the run holds two judges of three, which can
assert links and can never assert a silence. Nothing from it is publishable, and
what to do about the seat is separate work.

`fable` failed the same run first time with HTTP 401 against Anthropic's own API.
That is not a defect: `harness.resolve` prefers a native route whenever that
provider's key is in the environment, the repository's `.env` carries a stale
`ANTHROPIC_API_KEY`, and the container carries only OpenRouter's. Running the job
from a developer machine means unsetting it.

The design, the plan and the first run's answers are in
`docs/superpowers/specs/2026-09-16-passage-links-between-model-specs-design.md`,
`docs/superpowers/plans/2026-09-16-passage-links-between-model-specs.md` and
`docs/superpowers/specs/2026-09-16-passage-links-first-run.md`. The three tables
are `aci_link_runs`, `aci_link_calls` and `aci_links`, migrated in
`polaris-supabase`. Publication, the MCP server and any ranking are not built: a
ranking would count paragraphs rather than ideas, and the first run is what the
formula should be designed against.

**What the reader shows is a test, not a publication.** With two documents on
screen, each judged paragraph carries a bubble per counterpart, clicking one
travels to that counterpart and opens both ends of the link, and the behaviour
note ends with a paragraph saying how the two documents stand. That paragraph is
written by `engine/panel/link_summary.py` from the panel's own output -- the
retained passages, the judged depth with every judge's reason, and every pair
with what each judge said and how it was settled -- rather than from a fresh
reading of the documents, so every claim in it has passages behind it that a
reader can click. Its prompt forbids ranking in those words.

None of it is published, and none of it is served from the database. The bubbles
and the summary are read from `site/spec-reader/links.json`, which is gitignored
and generated by hand from one run's artefacts. That run holds one judge's
readings, `sol`, and the disputes were arbitrated by `sol` as well.

That is the shape of the exercise as of 16 September 2026: look at what a
comparison makes visible before deciding how it should be produced. What a
publishable version needs, and what is not here, is a panel independent of the
documents it judges, a silence three judges can assert, and a methodology note
the reader can see. `sol` is OpenAI's model and it judged OpenAI's document
against Anthropic's; that is worth knowing before anything on this page is read
as a finding.

**The arbitration and the summary are rows now, and the MCP server answers a
comparison.** `aci_link_arbitrations` and `aci_link_summaries`, migrated in
`polaris-supabase` as `20260916170000` (PR #33), hold what had only been files
beside a run. A file is nowhere a hosted reader or an MCP client can reach, so
what the reader showed and what a caller was told could never have been the same
thing.

Arbitration is a table rather than a column on `aci_links`, and the reason is
cardinality rather than taste. A row of `aci_links` is one judge's reading in one
direction, so a single pair of passages has up to four of them; a verdict about
the pair would have to be written on all four or on an arbitrarily chosen one.
Some disputes have no row to annotate at all, one kind being a pair one judge
linked and another, shown the same passage, did not. A verdict of `none` is a
fact about rows rather than in them. And `aci_links` carries no update grant on
purpose, so a column there would have meant granting update on a table of
evidence. For the first run: 176 link rows, 82 arbitrations, and the 82
correspond to no subset of the 176.

`compare_documents` is the fourth MCP tool. Given a behaviour and exactly two
specifications it answers with each document's passages, every pair the judges
linked with what each judge said and the force of each rule, the arbiter's
verdict where there was one, the passages one document has nothing facing, and
the paragraph written from all of it. It comes whole rather than in pages,
because a comparison split across pages is one a client has to reassemble before
it can say anything; `detail: "counts"` is the lever instead, answering with the
shape and with `full_answer_characters`, which is the exact size of the full
answer rather than a guess at it. Relations there are named by the document they
are about and never by a direction, because `stricter_source` read from the other
side is `stricter_target` and two judges who agree would look like two who do
not.

The size is worth writing down, because it is larger than it sounds.
`honesty-and-non-deception` over the constitution and the model spec answers in
**315,569 characters**, about 79,000 tokens: 29 passages against 49, 106 pairs of
which 82 were arbitrated and none left unsettled, and a 15,786-character summary.
The `counts` probe of the same call is 2,638 characters, a hundred and twentieth
of it. The tool's description gives those figures rather than calling the answer
long, because an agent reads that description to decide whether to pull it, and
"long" is not a size.

Measuring it found duplication worth removing. The answer first came to 344,001
characters, of which `arbitration.readings` was 27,651: what was put to the
arbiter, which the same answer already carries as each pair's `judges`.
`aci_link_arbitrations` still stores it, because an answer kept without its
question is not evidence, but an answer that carries the question twice is only
long. One duplication is left and is not removed: 101 distinct passages fill 212
slots inside the pairs, because a passage is quoted in every pair it belongs to.
Quoting each once in a map keyed by locator would save about 63,000 characters
more and lose nothing, and it would change the shape of a pair.

The fetching lives in `app/lib/links.mjs` and the shaping in `mcp-tools.mjs`,
which keeps its own rule that a tool is a pure function of its arguments and a
fixture can exercise it with no network. Link evidence is read per call rather
than memoised like the publication snapshot: a snapshot is one row every tool
needs, and link evidence is hundreds of rows per pair.

Two things to know about it. The `silences` branch is exercised by the fixture
and not yet by data: the first run recorded no `absent` row, because the
completeness floor meant both judges that answered linked every source passage.
And the `Migrations` workflow in `polaris-supabase` has failed on every run since
#30 with `Authorization failed for the access token and project ref pair`, so
this migration, like those, was applied by hand with `supabase db push` from
`evals/`. `evals/supabase/schema.sql` has not been refreshed since 12 September
2026 and is behind the migrations that followed.

### Four pairs were judged by one seat, which was a party to every dispute

Overnight on 16 to 17 September 2026 the comparison was run over four pairs of
documents, thirteen behaviours each, by a single seat: this assistant, in
session, under `opus-5`. No provider was called and nothing was spent.
`engine/panel/link_self.py` is what allows that. Where `link_job.run`,
`link_arbitrate.settle` and `link_summary.main` take a `call_model` that reaches
a provider, it passes one that writes the question to a file beside the run and
reads the answer back from its sibling. The seat is the session and the file is
the wire, so the same composer, the same parser and the same prompts produce the
same kind of evidence with no key in the environment.

| pair | passages | links | disputes |
|---|---|---|---|
| `anthropic--constitution@2026-01-20` against `openai--model-spec@2026-08-18` | 582 | 935 | 59 |
| `openai--model-spec@2025-12-18` against `openai--model-spec@2026-08-18` | 555 | 637 | 3 |
| `anthropic--constitution@2026-01-20` against `alibaba--model-spec@2026-04-00` | 524 | 771 | 73 |
| `alibaba--model-spec@2026-04-00` against `openai--model-spec@2026-08-18` | 440 | 709 | 35 |

104 calls in all, 26 per pair, being thirteen behaviours read in both directions:
103 done and one error. 3,052 link rows, 170 arbitrations, and 52 comparison
paragraphs, thirteen per pair, 873,453 characters in all. No source passage went
unanswered in any completed call, so the completeness floor refused nothing. Over all four pairs
the relations are `same` 1626, `nuance` 684, `stricter_source` 417,
`stricter_target` 298, `absent` 26 and `contradiction` 1.

**The arbiter was a party to all 170.** `aci_link_arbitrations.arbiter_was_a_party`
is true on every row of this run, because the seat that settled each dispute is
the seat that gave the readings in dispute. That is the weakest position an
arbiter can be in, and the column exists to say so rather than to be satisfied.
It shows in the figures: the arbiter upheld its own earlier reading 155 times and
rejected both of them 15 times. A panel of three would have produced the other
two kinds of dispute this design names, two judges differing and one judge
linking where another did not; with one seat only self-inconsistency can fire, so
170 disputes out of 3,052 links is a floor on disagreement and not a measure of
it. Settled, they are `stricter` 92, `nuance` 63 and `same` 15, and where one
document was found stricter it was the Alibaba Model Spec 37 times, the OpenAI
Model Spec 30 and the Anthropic constitution 25.

**What those disputes are is not what a single seat suggests.** 125 of the 170,
74%, are one pair of paragraphs read differently under two different behaviours,
and every one of the 125 was caught: none escaped arbitration. Their substrate
is the passage shared between behaviours, which is a third of the retained set
(139 of 419 passages for the constitution against the OpenAI spec, 124 of 381
against Alibaba), and 91% to 100% of the divergences carry one. The seat is
therefore not mainly inconsistent with itself inside a call. It is inconsistent
across the question it was asked: shown the same two paragraphs under two
subjects, it answered differently.

That the readings are incompatible rather than merely different is what makes
arbitrating across behaviours right. The relation is defined without reference
to a subject, would a response respecting one passage respect the other, so
`same`, `nuance` and `stricter` exclude each other whatever the behaviour. The
125 break down as 60 `same` against `stricter`, 34 `nuance` against `stricter`,
25 `same` against `nuance`, and 6 that are flagrant: 5 where each document was
called the stricter one and 1 where a contradiction faced a compatible reading.

It also explains a figure this section reports without explaining it. The two
OpenAI versions produced 3 disputes not because two close documents are easy,
but because that pair is 98% consistent between behaviours where the cross-lab
pairs run 56% to 75%. The dispute count measured the seat's steadiness under
rephrasing, not the difficulty of the documents.

The reader was showing all of it at once, and no longer is. A row of
`byLocator` now carries every behaviour whose call drew the pair, and a bubble
appears only under a behaviour the reader has ticked. Before that, one paragraph
of the OpenAI Model Spec carried seventeen bubbles, seven of them drawn while
judging behaviours the reader was not reading. Restricting what a judge may cite
to the other document's retained set was measured as the alternative and
rejected: it would drop 59% to 62% of the links on cross-lab pairs, take that
paragraph from 13 bubbles to 12, and cost the whole-document reading that makes
`absent` an honest answer.

**A passage with several counterparts now says what they add up to.** Filtering
by behaviour fixed the wrong bubbles being shown and not the crowding: the worst
passage of the constitution still carried thirteen counterparts under one
behaviour, all of them legitimately its own. A row of pills cannot say which of
thirteen to open, and several usually restate one requirement while one carries
the only real difference. `link_paragraph` writes the paragraph that says which
is which, from the panel's own links rather than from a fresh reading, and
`link_reader_data` folds it in as a row at the head of its passage's list. It is
not a counterpart, so it carries no locator and travels nowhere; its words ride
in `comment`, the field the reader already discloses under a pill.

One per behaviour per passage, and only where a passage has more than one
counterpart: the median passage has a single bubble and needs no help. For the
constitution against the OpenAI spec that is 430 cells of 1,036, 331,483
characters, median 126 words and none over 150. The effect on the passage this
started from: seventeen bubbles shown at once became fourteen under
`honesty-and-non-deception`, its thirteen counterparts and their reading, with
three and three under two other behaviours.

Written in session under `opus-5` by sixteen agents, one per hexadecimal bucket
of the question filename, which partitions the work without any agent needing to
know what the others hold. Every cost is null. It is written beside the run and
not to the database, deliberately: `aci_link_summaries` is keyed by behaviour and
pair of documents and carries no locator, so migrating for a shape nobody had
read yet would have fixed the wrong thing first.

**What the prompt got wrong, twice, and what is still wrong with it.** A pilot
over ten passages showed the first wording held at two and three counterparts and
broke at four or more, producing a semicolon list that walked through each bubble
in turn, which is the second copy of the parts the paragraph exists to replace.
The rule that a group is named by the single claim its members share, with at
most two counterparts described separately and never counted, was added and held
against the three most crowded passages in the run, at 13, 11 and 9.

Two faults are recorded and not fixed, because no run exists to validate a change
against. The dominant defect across the sixteen buckets was a paragraph naming
only the document its passage came from and leaving the other as "it": seven
agents caught it in their own output and rewrote it, which is the prompt leaning
on the writer's judgement where it should state a rule. And the ban on "the
source" and "the target" is read as a ban on the English words, so "the source of
more specific guidelines" was rewritten twice for no reason; it is meant to
forbid naming a document by its direction of reading, and it should say so.

One operational note, since it will recur. Subagents dispatched in parallel share
a single scratchpad directory, and several had helper scripts overwritten
mid-run by siblings choosing the same obvious filename. Nothing was lost here,
because the buckets write disjoint files and the writes had already landed, but
an agent that writes a helper and runs it later executes another agent's code
with no symptom.

Every `cost_usd` and every `batch_cost_usd` in this run is null, and null is the
right value. `batch_job.cost_of` returns None for a seat carrying no
`price_per_mtok`, which is what an in-session judge is, and this repository has
already settled that null means unknown while zero means free. `link_summary`
printed `$0.00` for such a call until it crashed on the None it was formatting,
which killed twelve of thirteen behaviours after the first; it says "no cost
recorded" now, because a claim of free is a claim nobody can support.

**One call was refused on safety grounds and was left refused.** The
`harmlessness-to-the-user` call reading the OpenAI Model Spec against the Alibaba
Model Spec terminated against a safeguard, flagged `[bio]`. It was not retried
and it was not reworded: it is recorded as `error`, which is the same treatment
the `fable` `content_filter` refusal already has in this file. Rewording a prompt
until a safeguard stops firing is not a way to obtain evidence.

**Two versions of one document show what a single seat gets wrong.** The pair of
OpenAI versions produced 637 links of which 537 are `same` and only 3 disputes,
which is what two close versions should look like. In two of those three the
arbiter settled by finding that the older version already carried the same rule
somewhere else: the root-authority paragraph putting teen safety first, and the
"No other objectives" rule naming time-on-site, revenue, self-preservation and
acting as an enforcer of laws or morality. The seat, shown a pair of passages,
had read an added rule; the arbiter, who reads both documents whole, could see
the text was shared. That is an argument for the arbiter having the documents,
and against trusting a passage-level reading about what a version introduced.

**The two directions almost never meet, so most readings are never crossed.** A
call hands the judge the retained passages of one document and the whole of the
other, and the run makes that call both ways. It is tempting to read the second
direction as a cross-check on the first: whatever a judge misses about its own
document, the opposite call has that document whole. It does not work out that
way. Counting the distinct pairs of each run, the two directions land on the same
pair 9% of the time for the constitution against the OpenAI spec, 8% for the
constitution against Alibaba and 16% for Alibaba against OpenAI. Only the two
OpenAI versions reach 59%, and only because documents that alike retain
overlapping passages. Each direction starts from its own retained set and
searches the other document, so the pairs found from one side are mostly not the
pairs found from the other.

The cost is measurable. Of the 2,092 readings on pairs that only one direction
ever saw, 568, or 27%, assert that one document demands more than the other,
which is precisely the claim a judge cannot check without its own document whole.
Where both directions did see a pair, that assertion is made 145 times. And the
arbiter does not cover the gap: the version pair this section opened with became
a dispute because two behaviours read it differently in the same direction, not
because two directions disagreed. A dispute needs two readings of one pair, and a
pair only one direction ever saw has one.

**The `absent` rows are the first data on that branch, and they prove less than
they look like.** This file recorded that `silences` was exercised by a fixture
and not by data. There are 26 `absent` rows now. But a silence is meant to need
every judge of the panel, and a panel of one satisfies that rule trivially, so
these rows carry a one-seat assertion where the design intends a unanimous one.
They exercise the code path. They do not yet test the claim.

The reader was wrong about multi-behaviour runs until this, and is fixed:
`link_reader_data` read the comparison from the `summary.json` beside a run,
which holds whichever behaviour was written last, so a thirteen-behaviour run
would have filed one paragraph under all thirteen. The comparisons come from
`aci_link_summaries` now, keyed by behaviour as that table already is, and the
payload carries `comparisons` keyed by slug in place of a single `comparison`.

What this run cannot claim is the same thing the `sol` pilot could not claim, and
more of it. One seat is not a panel. The seat arbitrated its own disputes. And
the seat is an Anthropic model that judged the Anthropic constitution against
three other labs' documents, which is the independence problem stated plainly
rather than avoided. Nothing here is published: `site/spec-reader/links.json` and
`artefacts/` are gitignored, and what is in the database is evidence of what one
seat said, recorded so that it can be compared against a panel that has some
claim to independence.

### Links belong to a publication, and a table write no longer reaches the public

The reader was served two frozen columns and one live query. `payload` and
`documents` are bytes copied into the publication row and held to a digest; the
bubbles, the comparisons, the arbitrations and the paragraph notes were fetched
from the live tables on every page view. Two things followed, and the second is
the one that mattered. Pinning an old publication gave you that publication's
text under today's readings, with nothing on the page saying so. And writing a
row changed what the public saw, with no publication and no deploy: 739
paragraph notes went live that way over 2026-09-17 and 2026-09-18, and the only
reason that was safe is that the text was good.

Underneath both sat a rule nobody would defend if it were proposed today.
`panelRuns()` kept an early pilot off the site by testing the prefix of the
script name that created a run, `created_by` starting with `link_self.py`. It
worked, and it was a filter on a string rather than a decision anyone recorded.
A publication names its link runs now, `--link-runs`, required, the way
`--cells` already names the cells the payload is built from, and the filter is
gone.

The third builder is JavaScript, and that is the point rather than an accident.
`engine/build-links-data.mjs` imports the assembly in `app/lib/links.mjs` that
the reader's route already used. A Python port would have been a second copy of
it, and this repository has already published wrong figures off exactly that
kind of duplication: `bands.shown_by_default` drifted from the reader's own
`DEFAULT_BANDS`, and the depth figures published off the difference were wrong
until somebody asked why one cell read 1.0. `publish.py` picks each builder's
interpreter from its file extension rather than from a second table, and the
judging image gained a Node runtime and the two library files that builder's
import graph actually reaches.

Document notes are pinned by prompt digest and not by run, and the reason is
that they have no run to be pinned by. `aci_document_notes` carries none and
cannot honestly gain one: its rows were imported from two JSON files in a single
batch, and its unique key ends in `prompt_sha256`. The prompt is the identity of
a document note, so that is what a publication records, `--note-prompts`, in
`build_params` beside the runs. Absent and empty are different answers: no list
means take every note, which is what a reader outside a publication wants, and a
list that is present pins exactly what it names, including nothing.

The cost is the thing being bought rather than a side effect. A corrected note
does not reach the public until the next publication is built and made public.
Rebuilding is cheap, because `publish.py` calls no model -- it selects,
assembles and inserts -- and a draft is written not public, so it can be read
before anyone sees it.

**The standing condition, until a publication carries the column.** The
publication that is public today, `1919ee6b`, predates the column and carries
null in both halves of it. `/api/reader/links` answers 404 for such a row, and
the reader catches that and renders as it did before any of this existed. So
from the moment this deploys the site shows no bubbles, no comparisons and no
"in short" notes, and it will go on showing none until a publication built with
`--link-runs` is made public. The operator was told this plainly and accepted it.

**What nothing tests.** The reader forwards its pin to this route the way it
already forwarded it to three others, and nothing exercises that. There is no
unit test, which is defensible on its own: the three sibling call sites have
none either, and the only `app.js` harness extracts pure synchronous functions
from the file as text, which `loadReaderLinks` is not. What is not defensible is
the reason recorded at the time, that the browser walkers covered it. They
cannot. They run against `engine/reader-routes.mjs`, which answers
`/api/reader/documents` and `/api/reader/payload` and not this route at all, so
a walker's reader takes the swallowing path described above and renders with no
bubbles, never once building a pinned URL. That was checkable when it was
claimed, and it was claimed in this repository's own record before it was
checked. The gap itself predates this work, since that route read the live
tables before and failed in the walkers for want of credentials just the same.
It was reported as covered, and it is not.

The two columns are nullable and move together, checked in the migration: a
digest without its bytes describes nothing, and the verifier skips a publication
on `links is null` rather than failing it, because those rows never claimed to
carry links. The portal carries the choice as a `Link runs` group on the build
form. The design is
`docs/superpowers/specs/2026-09-18-links-belong-to-a-publication-design.md`; the
migration is `20260918090000_aci_links_belong_to_a_publication.sql` in
`polaris-supabase`.

### The overview carries figures no panel produced

The front page gained a second view on 18 September 2026, behind a tab:
`/?view=governance`, how each lab governs its model spec rather than what the
model spec says. It is a board: one table with the nine labs across and their
scores down, each of the four questions opening into its checks scored 0 to 4,
and a popover with the evidence for any score. It was written for regulators and
legislators rather than for engineers, so the text is the research note "Spec
governance ranking" (Notion, second pass of 18 September 2026) rewritten in
plain words, with every score, date, quotation and source kept, and with the
note's own terms: model spec, system prompt, guardrails, hard constraints.

One of the note's figures is not reproduced. It prints Moonshot AI's total as 3,
and its own four question scores for Moonshot AI add to 4. The board computes
every total from the checks, so it shows 4.

What matters about it is where its numbers come from. Every other figure on the
site is a panel's reading, recorded in the database and held to a publication.
These are scores Polaris Collective gave by hand from public documents, and the
note says so of itself: its anchors are its own and a different reading could
move a lab by a few points. They live in `site/governance.json`, committed,
rather than in Supabase, because nothing judges them and nothing edits them from
the portal. `tests/test_governance_tab.py` holds the note's sentences to the
scores wherever the two quote each other.

The note lists points to re-check before anything is published outside, and the
board carries them under "What we could not check" rather than resolving them.
The one that could move a score is Alibaba: its model spec was read through this
index's own passages, not at its address, and a scope clause in a preface the
index does not keep would change check 1.2. The design is
`docs/superpowers/specs/2026-09-18-governance-tab-design.md`.

## Where the fork is heading

Away from git as the gate, and it has arrived. The artifacts are in Supabase,
judging runs as a job the portal launches, the site is a Next.js application on
Vercel, and the index is operated from a portal rather than a terminal. Upstream
keeps the property this fork gave up, which is running from a bare clone.

`develop` was merged into `main` on 15 September 2026 (PR #1, `119fa63`), Vercel
deployed it to production, and further releases followed on 16 September. The
public publication is `1919ee6b`, thirteen behaviours over four documents, on
https://ai-character-index.vercel.app.

The cleanup migration `20260916090000_aci_cleanup_after_the_one_panel_redesign.sql`
(`polaris-supabase` PR #30) was applied on 16 September 2026, once the code that
stops reading what it drops was in production. It copied into an unexposed
`aci_archive` schema, then removed, the grandfathered publication, five
superseded drafts, six runs, the legacy `constitution` and `model-spec`
documents, three unbriefed behaviours, and the `aci_cell_curation` and
`aci_coverage` tables, and dropped the exemption. `tests/test_schema_after_cleanup.py`
fails if code names a dropped table or column again.

What is left, as of 16 September 2026:

- Dropping `aci_behaviours.set_name`, which the design also lists, once the
  registration route stops writing it.
- Exercising the judging image on Cloud Run. `deploy-runner.yml` failed on every
  run until 16 September 2026, first at Google Cloud authentication, because the
  workload identity condition naming this repository had been committed to
  `polaris-tf`'s seed environment and never applied, then on the push, because
  the workflow addressed the registry in the dev project while the shared
  registry is in polaris-seed, and last on `gcloud run jobs update`, because the
  deploy account could not act as `aci-runner`. All three are fixed and the
  workflow is green, so the Cloud Run job carries the real image. No run has been
  started through it yet: jobs are still launched from a local portal with
  `ACI_PYTHON` set.

The reasoning, the data model and the costs are in
`docs/superpowers/specs/`, and the work is planned in `docs/superpowers/plans/`.
