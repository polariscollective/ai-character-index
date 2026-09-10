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

## Where the fork is heading

Away from git as the gate. Artifacts move to Supabase, judging moves to a Cloud
Run job, and the site moves from Cloudflare Pages to Vercel. Upstream keeps the
property this fork gives up, which is running from a bare clone.

The reasoning, the data model and the costs are in
`docs/superpowers/specs/`, and the work is planned in `docs/superpowers/plans/`.
