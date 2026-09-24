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
money, and nobody outside has credentials. `/about` (`site/about.html`, at
`/how-it-works` until 18 September 2026) is what replaced it: two forms, opened in a dialog and
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

### A reader can photograph the page and draw on it

The index took two kinds of words from outside and not the third. A proposal
asks us to run something; a note disagrees with a panel's reading of one
paragraph. Neither takes "this page is broken", which is mostly a picture: a
sentence describing a layout fault is a sentence somebody has to reconstruct
into a screen, and half the time they reconstruct a different one.

A pill at the bottom right of the four public pages photographs the viewport,
takes a box, a circle, an arrow, a freehand line or a line of text over it in
one of two colours, a sentence and an address, and files all of it in
`aci_page_feedback` and a private bucket, with a Slack message carrying the
picture. `site/page-feedback.js` is one file for four pages, like `dev-tag.js`
and `brand.js`, for the reason that file already records: copied four times it
drifts the first time one copy is edited. The dialog also gives an address to
write to instead, which is somebody's, on a public page, and will be harvested.

Private throughout, and that is the difference from `aci_feedback` rather than
a detail. A note about a paragraph records what a reader permits, because it
might one day be shown beside that paragraph. A capture of somebody's browser
never will be, so there is nothing to ask and nothing to record: the form says
it stays private and the table has no visibility column.

**The capture is a redrawing, not a photograph.** html2canvas walks the DOM and
paints it, so what it produces is the page as the styles describe it and not
the pixels the screen had. It was chosen over `getDisplayMedia`, which is
exact, because that API does not exist on mobile at all and asks permission on
every send. It was chosen over the `foreignObject` libraries because it draws
text with `fillText` using the fonts already loaded, where they need every font
file inlined or the capture comes back in a fallback face. `capture_method` is
stored on every row so a later method is distinguishable in the record rather
than silently replacing this one, which matters because html2canvas has had no
release since 2022.

**Three things the clone does not know, and how each was found.** All three are
fixed in the `onclone` hook, which hands the module the cloned document before
it is painted, and all three were found by looking at the pictures rather than
by reading the library.

A `position: sticky` element is drawn at its static position, and all four
pages use sticky. The first attempt pinned them absolutely, which took them out
of flow and took their space with them: the overview's table header collapsed
onto its own rows and the about page's contents rail was drawn on top of the
prose while its flex sibling swallowed the column. What sticky actually does is
occupy its static place and paint elsewhere, which is `position: relative`, so
what is recorded is the shift, measured by turning every sticky element static
at once and back inside one synchronous block.

An element that scrolls inside the page is drawn from its own top. The doc
reader scrolls its column rather than the window, so `window.scrollY` stayed at
zero however far down somebody had read and the capture came back showing the
top of the document. Every inner scroll offset is carried into the clone, and
carried instantly: the reader's column asks for `scroll-behavior: smooth`, the
clone inherits it, and a smooth programmatic scroll does not take effect on
the spot, so the offset was silently dropped and the capture still showed the
top. That survived a first fix and its tests because every test set
`scroll-behavior` to auto in order to position the column, and the clone
inherited that too: the tests had built the one condition under which the bug
could not appear. The walker scrolls the way a reader does now, and the check
fails when the line that forces instant scrolling in the clone is taken out.

A pop-up open at the moment of capture is not in the clone's top layer, where a
popover is back to `display: none`. Measuring it and forcing it back was the
easy half. The hard half was when to measure, and it took two mistakes. Doing
it inside the capture was too late, because showing the bubble's own modal
dialog closes every open popover natively. Doing it in the pill's click handler
was still too late for a mouse, because the browser's light dismiss is a
default action of the press: measured in real Chrome with a trusted click,
there is one popover open at `pointerdown`, none at `pointerup`, none at
`click`. It is measured in a capture-phase `pointerdown` listener, read once
and emptied, and an abandoned press is cleared by the next one.

**A modal takes the pill in, because the platform allows nothing else.** A
modal dialog makes everything outside its own subtree inert, and the top layer
is no exception: a pill raised into it with `showPopover` is drawn above the
backdrop and still refuses a click and a focus, which was measured against
this application rather than assumed. The one place left operable is inside
the dialog, so that is where the pill goes while one is open, and back to the
body when it closes. `position: fixed` puts it in the same corner either way.
This is what lets somebody report a panel: the overview opens its evidence
with `showModal`, and a reader who wants to say that panel is wrong has to be
able to reach the pill while looking at it.

**What is still wrong with the capture, and is not hidden.** On `/about`, a
link the page draws as a 2px chartreuse underline comes out as a filled
chartreuse block behind the text, so links in that capture look hovered. The
reader's own navigation link renders correctly, so it is per-page CSS rather
than universal.

**Slack is told twice when it has to be.** Slack fetches `image_url` itself and
refuses the whole message when one block displeases it, so a signed link it
will not accept would cost the notification entirely. The message goes out with
the image block and again without it if the first is refused. The link lives
seven days: after that the picture leaves the channel's history and the portal
link, which does not expire, is what is left. A permanent link would mean a
public bucket, and a capture of somebody's browser can hold anything they had
on screen.

**Marks are shapes, never pixels.** A box, a circle, an arrow, a freehand line
and a line of text are stored in the image's own coordinate space, which is
what makes undo one line and what keeps a mark under the pointer at any display
size, including a phone's. The glyph on each tool is inline SVG in the hand the
reader's copy icons already use: the framework carries no icon library and no
emoji, and the word stays beside the glyph because a glyph alone is a guess.

Console logs are deliberately not collected, and they were asked about.
Collecting them means patching `console` on every page load for every reader,
which is a change to what the four public pages do to everybody in order to
serve the few who report a bug. It is separable, and if it is ever wanted it
should be argued for on its own.

**Three more things left as they are.** A report whose image lands in the
bucket and whose row then fails to insert leaves the object there with nothing
pointing at it: the order is deliberate, because a row must never point at an
object that is not there, and the cost of that choice is orphans with no
sweeper to collect them. The Slack message carries the page address and a link
to the portal but not the row's id, so matching a message to a row is done by
eye. And the hourly cap counts rows rather than requests, as both sibling
routes do, so it bounds what is stored and not what is sent: a request refused
for any reason is never counted.

The design is `docs/superpowers/specs/2026-09-20-feedback-on-a-page-design.md`;
the table and the bucket are `20260920120000_aci_page_feedback.sql` in
`polaris-supabase`.

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
the mean. That is the scale every publication so far was built on. Depth runs to
10 now, given in a pass of its own rather than in the judging job; see `Depth
runs to ten, and a document is scored as a whole`.

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
quietly. That describes the scale of four. A depth out of ten is shown a second
block beside the panel's citations, the passages stating the document's general
rules for conflicts, so it is a reading of those citations and of that block;
see `Depth runs to ten, and a document is scored as a whole`.

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

**What the method takes from its sources, and what it does not.** Since 21
September 2026 the board shows the text its method comes from. The four questions
are the four asks of Polaris Collective's working paper "Model spec governance
and transparency" (draft of 10 September 2026). The supporting practices come
from "Emerging International Best Practices for AI Model Specs", a working paper
by Edward Kembery and colleagues that is under review. Neither paper splits a
question into checks, weighs one question against another, or says what earns a
score. The research note did all three. It wrote ten checks, three for each of
the first two questions because the memo calls those two its minimum and two for
the others, and added them up, so the questions weighed 12, 12, 8 and 8. It also
wrote every 0, 2 and 4 description.

Since 21 September 2026 a question is the average of its checks, on their own 0
to 4 scale, and the overall score is the sum of the four questions, out of 16.
Every question weighs the same whatever its number of checks, a question opened
into its checks shows figures on one scale, and the overall score reads as a
different kind of figure. The order of the nine is unchanged, but two ties
appear: OpenAI and Anthropic on 9.0, Meta and xAI on 2.0. The best practices put
Meta ahead of xAI, as the note broke its own tie. OpenAI and Anthropic are level on
the best practices as well, 10 of 18 each, so they share first place and the next
rank is third; nothing else is invented to separate them. The sentence under the
table is written from the scores, so it cannot name a tie the table does not have.
One finding had quoted "the four lowest scores" for four companies when a fifth,
xAI, tied with one of them; it says four of the five lowest now. The one check with no ask
behind it is 4.1, hard constraints listed, which rewards what a specification
contains rather than how it changes, and gives Alibaba 4 of its 10 points.

The supporting practices are called best practices on the page now, after the
title of the paper they come from, under a line across the table that says they
are outside the total. They open one by one, each scored 0, 1 or 2. The note's
profiles score every practice in parentheses and in order, except Google's one
point, which the note gives to an evaluation pilot without naming the practice.
It is filed under S3, outside testers, where Meta's and xAI's points for outside
evaluators sit, and its popover says so. The test holds every other lab's
figures to the order of its paragraph. The note never described what 0, 1 and 2
mean. The board sums up how it scored and says the summary is ours.

The same group goes on with five practices from Kembery's paper that nobody
outside a company can see. Four of them the paper asks companies to state
publicly: whether the models are trained on the specification and how, whether
internal models follow it, whether the published text is the one used inside, and
whether models in use are monitored and serious violations reported. Those four
are scored 0, 1 or 2 on what each company publishes, and 0 when it publishes
nothing, under a note saying that a company may well do these things without
saying so and that we found no public evidence or verifiable audit that it does.
The scores come from research on 21 September 2026, one agent per practice across
all nine companies so that each practice is judged the same way everywhere, and
every score above 0 rests on a quoted passage with its address in
`internal_evidence`. The fifth, a separate sign-off on changes, the paper raises
as an open problem without asking anyone to publish it, so it stays NA for every
company and the test fails if it is ever scored.

One reading in that research is a judgement call and is worth knowing. For
training on the specification, five of the six companies with no specification
score 1, because they describe training against an internal safety or refusal
policy, and the anchor allowed an internal behaviour document to count. Read
strictly, as a document that works like a specification, Google, xAI and DeepSeek
would score 0.

**The minimum is named where it applies, and the headline figures are gone.**
The memo calls its first two asks its "minimum viable version": a governing spec
for every deployed model, and one change log with its scope and timeline stated up
front, the other two being "the direction of travel". The board used to open with
three headline figures, the first of them the best score on that minimum, and it
could not be read without knowing what the minimum was. The three figures were
removed on 21 September 2026, since the findings say the same things with their
context. The first two questions now carry "part of the minimum" under their
names, their popover explains it, the memo's own passage is among their quotes,
and the finding on the minimum says that meeting it means 4 out of 4 on both
questions. A reviewer's comment in the memo proposes a different minimum; the
board follows the memo's text, not the comment.

**Every row carries the text it rests on.** Each question, check and practice has
a `reading`, what it asks in our words, and `quotes`, the passages of the two
working papers it rests on. The page shows them, folded, in the popover a row's
name opens. They are meant to be what a judge is given when these scores are judged
again, which is why they are the papers' words and not a summary. The quotes were
cut out of the papers by a one-off script, from a start and an end, never typed:
footnote markers, markdown and link targets are dropped, spaces collapsed, and a
passage containing a long dash is quoted in fragments joined by "[...]". The
papers are not in this repository, because the memo is an unpublished draft and
Kembery and colleagues' paper is under review, so a quote cannot be checked
against its source here and the test holds only their shape.

**The two figures are added now, and the order changed with it.** Since 24
September 2026 the board leads with a final score out of 20, the sum of what is
published and what it engages, and ranks the companies by it. Before, it ranked
on what is published alone and said the two were never added, on the ground that
the checks are anchored and the practices share one generic scale. The audit of
23 September (`docs/audits/2026-09-23-every-figure-defended.md`) had already
found that ground false for `I1` to `I4`, which carry anchors of their own, so the
explanation under the sum says only what is true: the two measure different
things, and both stay on the board so a reader can see which half a company
earned its score on. The order moved a lot. Meta goes from sixth to third on the
strength of what it engages, Alibaba from third to fifth, and Mistral AI from
fifth to eighth, and the ties of 21 September disappear. The practices of what
it engages also fold now, into three groups of `column.groups` that show their
mean and change nothing about the figure.

### Depth runs to ten, and a document is scored as a whole

The grid was green wherever a lab had published anything. Of the 52 cells of the
public publication, `1919ee6b`, none is below 2.3 and 24 are at 3.7 or more,
because the step from 3 to 4 asks for one worked example and the model specs put
examples under nearly every rule. The scale had nothing left to say about a
document that already covers a behaviour with rules and examples, which is most
of the grid.

Depth runs from 0 to 10 now. The six described levels sit on the even numbers,
and the five that existed keep their wording: 0 absent, 2 named, 4 discussed, 6
prescribed, 8 demonstrated. The new top, 10, is bounded: demonstrated, and the
document meets three conditions, all of them, and for every facet the
behaviour's brief names rather than for one instance. The edge is shown, where
two cases differing in one feature the document names receive opposite
sanctioned responses. A conflict is settled, where the document names another of
its own rules that pulls against this behaviour, says which prevails and under
what condition, and shows it on a case. A default is given for the undecidable
case, where the model cannot tell which side of the edge it is on because intent
is unclear, a claim cannot be checked or context is missing, or the acceptable
second-best responses are ordered. An odd value means the level below is fully
met and the level above met in part, and its rationale has to name which part; a
judge that cannot name one gives the even value below. The prompt is
`engine/panel/prompts/depth-v2.txt`, digest `d856c646`, and the rubric it
restates is `methodology/spec-coverage-depth-rubric.md`, which carries both
scales now.

**A depth out of ten is given in a pass of its own, against an assessment.** It
reads what a depth out of four reads, the passages the panel cited for the cell,
and one block besides: the passages in which the document states its general
rules for conflicts. Those come from the assessment of the whole document, so a
depth on this scale cannot be given inside the judging job that composed the
cell, which ran before any document had been assessed.
`engine/panel/depth_pass.py` takes runs already judged and the assessment run
whose conflict rules its depths are shown, prices itself with an estimate and a
ceiling, and writes only with `--go`. The block is evidence of what the general
rules say and never settles the second condition on its own, so a behaviour
whose conflict is settled only by a general order of authority does not reach 10
on that account.

**The document as a whole is scored by the same panel, five criteria out of 4
each.** `engine/assess.py` gives each seat the document whole, as the passage
calls present it, and asks two questions of it. Four criteria in one call: what
the document says in general when two of its own rules conflict, and which
passages state those rules; whether a reader can tell of each rule whether it is
absolute or a default and who may change it; whether the rules say why they
exist; and whether the six situations a model is actually used in have rules of
their own. The fifth, unresolved contradictions, is a question of its own,
because it is a search with a list for an answer rather than a score. The total
is out of 20, and the criteria are `methodology/document-assessment-rubric.md`.

**Six tables, and depths out of ten got one of their own rather than a column.**
`20260921180000_aci_depth_out_of_ten_and_the_document_as_a_whole.sql` in
`polaris-supabase` adds `aci_assessment_runs`, `aci_assessment_calls`,
`aci_assessment_scores`, `aci_assessment_claims`, `aci_assessment_verdicts` and
`aci_depths_out_of_ten`. The first version of it added a scale and a prompt to
`aci_depths` and keyed the table by both. Its review found that the code running
in production treats `call_id` as the key of `aci_depths`: once a second row
existed for a call, the judging job could overwrite either row, a publication
built from the portal could read either one, and the portal would count a
pending depth out of ten as work left to launch on a run that is done. A table
of its own removes the order in which code and schema would otherwise have had
to be deployed, and the backfill with it. `aci_depths_out_of_ten` is keyed by
the call, the depth prompt and the assessment run, because the conflict rules a
depth was shown come from that run, so a document assessed again gives new
depths beside the old ones rather than over them. Scores, claims and verdicts
are evidence and take insert and select only; the three review columns of a
claim are the one thing on any of them that is ever updated.

**A publication carries the scale and the assessment only when it names both
flags.** `publish.py` takes `--depth-prompt` and `--assessment-run`, and with
neither it publishes what it published before any of this existed: depths out of
four read from `aci_depths`, and no assessment. `depthScale` and the
`assessment` object appear in the payload only on the other path, inside the
bytes the existing digest already covers, so no column was added for them. A
publication built on the scale of four therefore rebuilds byte for byte with
these tables full, which `engine/test_publication_rebuilds.py` holds every
publication built so far to. The portal names neither flag.

**The contradictions were scored a second way on 22 September 2026.** The first
full run showed four faults in the first way. A seat that found a contradiction
counted as a vote for it without ever seeing another seat's objection, and on
the OpenAI Model Spec of December 2025 two finders outvoted a third seat whose
objection quoted the text that settled the clash. A contradiction was marked
absolute when any seat said so, including a seat that said it does not hold. Two
versions of one document carrying the same two passages word for word got
different outcomes, because what each seat happens to find varies from one
reading to the next. And the finding prompt asked for at most eight, the most
serious first, where the owner wants the list exhaustive, since the list is
worth more than the score.

Finding and reading are kept apart now. Each contradictions seat reads each
document whole, lists every contradiction it finds however minor and gives no
score (`assessment-contradictions-v2.txt`). The candidates found on all the
versions of one document in a run are pooled by their pair of passages, each
passage named without its version head, and a candidate is carried to every
version where both passages exist with exactly the same text, so each version
has one claim per pair. Every contradictions seat then reads every claim of each
version, the ones it found included, and says whether it holds and whether it
involves a rule the document calls absolute (`assessment-confirm-v2.txt`). No
"found it" verdict is written any more. A claim is confirmed when at least two
readings say it holds, and absolute when at least two say both that it holds and
that it is absolute. The score is unchanged: 4 when no claim is confirmed, 2
when one or two are and none is absolute, 0 when three or more are or any
confirmed claim is absolute.

What moved is the reading rather than the finding. Listing exhaustively more
than doubled the claims on the two OpenAI versions, 29 across the run becoming
49, and left the constitution and the Alibaba Model Spec at the counts they had.
But under the first method a seat that found a claim counted as a holding
reading of it, so a pair two seats proposed was confirmed with no second reader
at all; under the second nobody votes for what they found, and the
constitution's confirmed claims fell from three of eight to two, the Alibaba
Model Spec's from three of four to none.

| Document | Claims, first method | Confirmed | Score | Claims, second method | Confirmed | Score |
|---|---|---|---|---|---|---|
| `anthropic--constitution@2026-01-20` | 8 | 3 | 0 | 8 | 2 | 2 |
| `openai--model-spec@2025-12-18` | 8 | 2 | 2 | 18 | 2 | 2 |
| `openai--model-spec@2026-08-18` | 9 | 0 | 4 | 19 | 0 | 4 |
| `alibaba--model-spec@2026-04-00` | 4 | 3 | 0 | 4 | 0 | 4 |

**A run can take its criteria from an earlier run.** The 168 depths out of ten
had already been given against `b4acc896`, from the conflict rules its criteria
cited, so asking the contradictions again the second way would have meant giving
the criteria and every depth again with them.
`engine/assess.py --criteria-from=<run id>` starts a run that asks only the
contradictions and their reading and records the earlier run in its config. It
is refused unless that run is done, took no criteria of its own from a third
run, asked its criteria of the seats and under the prompt the configuration
gives now, and assessed the criteria of every document named. A publication that
names the new run carries the earlier run's criteria and the depths given
against it, read by that run's id, with the new run's contradictions.

**What failed is replayed, and a replayed group is not what a fresh run would
have given.** `engine/assess.py --resume --replay` asks a failed finding again
in its own row, pools what it finds with the claims already written, and asks
each seat a supplementary reading of the new claims alone, recorded among the
attempts of its existing reading call. A written claim is never updated, because
the grants forbid it: a pair the replayed seat found that was already claimed
goes into the run's config as `also_found`. Before it spends, it rebuilds the
pool the first readings were given on and refuses if that pool no longer gives
the claims written and the verdicts stored against them. Each replay writes a
record in `config.replays` naming the calls it asked, the groups it touched and
how each one ended, with a note that finishes "A fresh run pools every finding
before any reading, so this is not exactly what a fresh run would give." The
readings of the two OpenAI versions were given on a list that grew afterwards,
and the supplementary readings saw the new claim by itself rather than beside
the others.

**Three substitutes were declared for this work, each for a refusal already
met.** `opus` takes `fable`'s seat on the contradictions and their reading,
because `fable` came back empty with `finish_reason=content_filter` when asked
to find contradictions in all four documents. `glm` stands behind `opus` there,
since every Anthropic model is refused on the Alibaba Model Spec and `kimi`
already holds a contradictions seat of its own, so nobody else could take that
seat on that document. `glm` is also first behind `deepseek`, where `kimi` used
to be: the audition of 17 August 2026 named it `deepseek`'s substitute, it costs
about a tenth of `kimi` per token, and it is seated nowhere else, so it is free
where `kimi` already sits in `fable`'s place. `glm` is last behind `fable`,
after `opus` and `kimi`, for the same reason read the other way round.

**What the full run gave.** `b4acc896`, begun on 22 September 2026, read the
constitution (374 passages), the OpenAI Model Spec of December 2025 (589) and of
August 2026 (592), and the Alibaba Model Spec (247). Criteria by `sol`, `fable`
and `deepseek`; contradictions and their confirmation by `sol`, `fable` and
`kimi`, under the first method. Priced at 14.95 dollars, it cost 17.30, the
difference being the refusals: the price counts each seat's own model once, and
a refused attempt is billed before its substitute answers. The contradictions
column below is the second method's, from `e2c00b2e`, which took its criteria
from this run.

| Document | Conflict rules | Force of each rule | Reasons given | Situations covered | Contradictions | Out of 20 |
|---|---|---|---|---|---|---|
| `anthropic--constitution@2026-01-20` | 2.3 | 2.7 | 3.7 | 2.7 | 2 | 13.3 |
| `openai--model-spec@2025-12-18` | 4.0 | 3.3 | 3.3 | 4.0 | 2 | 16.7 |
| `openai--model-spec@2026-08-18` | 4.0 | 3.7 | 3.3 | 4.0 | 4 | 19.0 |
| `alibaba--model-spec@2026-04-00` | 4.0 | 3.7 | 2.3 | 3.7 | 4 | 17.7 |

A total is rounded once, from the means before they are shown rounded, so the
five figures of a row do not always add to the sixth on the page.

The tightened conflict-rules anchor, which asks a strict order that decides who
wins and puts an order weighed as a whole at 2, did what was asked of it: the
constitution scored 2, 3 and 2 where every judge gave 4 to all three model
specs.

`depth_pass.py` then gave 168 depths against `b4acc896`, fourteen behaviours
over the four documents, 56 cells of three judges each, all of them done and all
under the one prompt. Priced at 6.22 dollars, they cost 8.35; the difference is
the ladder, which asks a depth again when the reply does not parse. The
distribution is one 1, two 2s, two 4s, twelve 5s, twenty-six 6s, twenty-five 7s,
thirty-five 8s, sixty-four 9s and a single 10, and nobody gave 0 or 3. Exactly
one depth of ten was given, by `deepseek` on `honesty-and-non-deception` against
the constitution, where `sol` and `fable` both gave 9; that cell's mean of 9.3
is the highest of the 56, so no cell reached ten. `glm` answered ten of
`deepseek`'s 56 depths in its seat, each recorded with the reason `off-scale
reply after two reminders`, and they are the only substitutions in the pass.

**Two output caps were ours and not the providers', and the readings that
followed were paid on lists that were short.** `kimi`, listing the
contradictions of the OpenAI Model Spec of August 2026, stopped at the 65536
tokens `panel-config.json` allowed it, where OpenRouter allows 943718; the
attempt came back empty with `finish_reason=length` and was billed 1.18 dollars.
`glm`, standing in for `opus` on the Alibaba Model Spec after two content-filter
refusals, had no cap of its own and was sent with the 32768 a model without one
gets, where OpenRouter allows 131072; that attempt cost 0.06 dollars. The
code then went on as though nothing had happened: it wrote each version's claims
and had every seat read them, on a pool short of one seat's findings, and those
readings were paid for, 1.27 dollars on the August OpenAI spec, 1.26 on the
December one and 0.49 on the Alibaba Model Spec, 3.01 in all. Of the 10.15
dollars the run had cost before any replay, 7.87 was spent on those three
documents, about four fifths of it, and the constitution, whose three finders all
answered, was the only document left standing. Both caps are 131072 now, and a
document stops before its readings when a finder has failed: no claim is
written and nobody reads one, because what that seat would have found could
change them.

**Two versions of one document settle the same pair differently, although the
claims are now shared.** Sixteen pairs are carried to both OpenAI versions,
which means both passages read the same word for word in each. Two of the
sixteen are confirmed on the December version and neither on the August one:
`#assume_objective_pov ¶17` against `¶18`, held by `opus` and `sol` on December
and by nobody on August, and `#no_topic_off_limits ¶4` against `#refusal_style
¶3`, held by `kimi` and `sol` on December and by `sol` alone on August. Pooling
fixed what each seat happened to find. It did not fix what a seat says about the
same words read twice, and the two versions score 2 and 4 on that. The column is
worth 4 of the 20 and it is the only one of the five that can swing its whole
range on what three models happen to notice in one reading: between the two runs
the Alibaba Model Spec moved 4 points out of 20 and the constitution 2, on four
criteria rows that are literally the same rows underneath.

**No person has reviewed any contradiction.** `reviewed_verdict` is null on all
78 claims of the two runs. The second pilot's recommendation was that the judges
find and cross-check candidates and a person decides which ones a published list
carries, as the governance view's scores are decided by hand. The columns are in
the table and nothing is in them, so every contradictions figure above is the
panel's alone.

**The independence problem is what it was, and the full run carries it into
every figure.** `sol` is OpenAI's model and it read both versions of the OpenAI
Model Spec, on every question of both runs. The constitution's criteria were
scored by `fable`, its contradictions listed by `opus` in `fable`'s seat and
confirmed by `fable` in `b4acc896`, and both listed and confirmed by `opus` in
`e2c00b2e`: every one of those is an Anthropic model reading Anthropic's own
document. Nothing in these runs was arranged to avoid that, and nothing in the
figures corrects for it.

**None of it is published.** No publication names either flag, so none carries a
depth out of ten or an assessment; the public publication is still `1919ee6b` on
the scale of four, and the reader and the overview still say "Depth, out of 4".
The depth notes and the comparison paragraphs quote a figure out of 4 and have
not been written since 17 September 2026, so a publication on the new scale
would carry neither. The display decisions were taken with the owner on 22
September 2026 and a prototype exists on `feat/depth-to-ten-site`, but the scale
read from the payload, the colour ramp, the legend, the row for the document as
a whole, the MCP server and the copy are not written. The design is
`docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md`;
the migration is applied and its pull request, `polaris-supabase` #37, is open.

### The front board reads a written file, and the old one kept its figures

The board the index leads with is built from `site/constitutions.json`, a file
people write, the way the governance board is built from `site/governance.json`.
It keeps the shape the publication board had: a final score out of 20, the
document as a whole out of 10 opening into five criteria out of 2, and each
behaviour category opening into its behaviours out of 10, with companies ranked
by the final score. What it no longer keeps is the account of how any figure was
arrived at. No judge, no panel, no rationale appears anywhere on it, and every
word a popover shows is a sentence out of the file: what the constitution says on
a behaviour, how that stands beside the others, and why the figure is what it is.
The two scales are written once under the table and never repeated inside a
popover.

There is no NA on it. A company that publishes no constitution scores nought on
every row, and its cells say, in the file's own words, that it publishes none and
that a document of this kind may exist inside the company unpublished. The file
carries a figure and no prose for those cells, so the company's own line is what
such a cell shows; anything written into the code instead would be the board
making that claim rather than the file.

The board built from a publication is at `/coverage`, unchanged. It is the one
board whose figures open on the passages behind them and on the contradictions in
the sheet, and the front board links to it in one line carrying the publication
its file names. `site/overview.js` is now the tabs and nothing else;
`site/coverage.js` is the file that used to be `overview.js`, and the `<style>`
block both pages need is `site/board.css`.

One entry of the file is not a column. `openai-2025-12` is the December 2025
version of the same company's document, and two columns under one name would read
as two companies, so a company's column is its newest document and the earlier
version is reached from that column's profile, unranked.

**The companies carry their own marks.** Above each name, on both boards of the
front page, one path filled with `currentColor` so the colour is the stylesheet's
olive-deep rather than a company's brand colours. They are decorative and hidden
from assistive technology: the name under the mark is what is announced, and a
company the set has no mark for keeps the space so every name starts on one line.
The framework's "do not" list names icon libraries; these are the marks of the
companies being assessed, which is the ground the owner asked for them on. They
are Simple Icons 16.32.0, CC0 1.0, copied in as path data in
`site/company-marks.js` so no request leaves the page. That set carries no mark
for OpenAI and none for xAI, so those two show their name alone; Alibaba is drawn
with the Alibaba Cloud mark and Google DeepMind with Google's, both recorded in
that file.

### The reader opens in two rounds of requests

**Found by timing a cold arrival. Fixed.** On the `develop` preview, opening
`/spec-reader/` with no parameters took 5.6 seconds to show any text when the
edge cache was cold, and 0.37 seconds when it was warm. The requests themselves
were fast enough. `initialize()` made four rounds of them, each waiting for the
one before: the payload, then the documents' metadata with the notes and a
links request, then the text of the opening document, then the opening
behaviour's paragraphs and links. On a bare address the links request of the
second round named no behaviour and no document, so it returned nothing
useful, and it was the slowest of the round at 2.4 seconds. The routes cache
the current publication for 60 seconds plus 300 stale, so any visitor arriving
after six quiet minutes paid the whole chain again.

The documents' metadata and the notes are now asked for beside the payload,
for the pin the URL names, and asked again only when that pin falls back. The
opening document's text and the opening behaviour's paragraphs and links then
go together. With 800 ms added to every reader request, a bare arrival went
from 8.6 to 2.0 seconds against the same data, with the same passages marked.

Found on the way, and fixed with it: `ensureBehaviours` fetched a behaviour's
paragraphs and its links in one `Promise.all`, and `initialize` awaited it
uncaught. A publication without links answers 404 on the links route, so the
reader showed its "could not be loaded" error in place of the text. That is
true of `1919ee6b`, the public publication as of September 2026, so `develop`
would have broken the public reader on deploy; the preview never showed it
because it serves a newer build that carries links. The links now fail alone.

**Not fixed, and it grows with the index.** Every cold serverless instance
fetches a whole column from Supabase and slices it in Node
(`app/lib/slice.mjs`). The `links` column is 4.5 MB as of September 2026 and
the reader wants one behaviour over one or two documents of it. The column is
kept whole because its digest is taken over its exact bytes, which is also why
it is `json` rather than `jsonb`. Storing the slices beside the whole file at
publication time, or slicing in a SQL function, would let a request read what
it needs. Either one is a migration in `polaris-supabase` and a change to
`publish.py`.

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
