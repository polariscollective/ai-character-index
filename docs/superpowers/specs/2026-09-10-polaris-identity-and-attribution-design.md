# Polaris identity and attribution — design

Date: 2026-09-10
Status: approved, in implementation

## Why

`polariscollective/ai-character-index` is a fork of
[`AndresCotton/ai-character-index`](https://github.com/AndresCotton/ai-character-index).
Andrés Cotton, who created the project, agreed to Polaris Collective taking it
over and reshaping it, under attribution conditions he stated explicitly. This
document records those conditions, the visual work that goes with them, and the
boundary with the platform work that follows.

## Scope

Three work items, each its own pull request, in this order.

1. **Attribution and provenance.** Andrés's conditions, met to the letter.
2. **Polaris identity.** The site adopts the collective's palette and typefaces.
3. **The platform.** An authenticated admin surface that launches Cloud Run
   jobs. Out of scope here; it gets its own design document.

Items 1 and 2 ship together: the credit line needs a footer, and the footer is
part of the identity work.

## Attribution — the conditions

Andrés asked for three things, and Polaris asked for a fourth.

| What | Where |
|---|---|
| "Run by Polaris Collective, started by Andres Cotton" | Site footer, and the README |
| His copyright line kept | `LICENSE` |
| Matt Stults credited for production-readiness work | README contributors section |
| An explicit pointer to the original version and repo | README, and the site footer |

Two notes on where the copyright actually lives. `LICENSE` is the bare Apache
2.0 text whose appendix was never filled in, so there is no copyright line in it
to keep. The copyright statement is in `NOTICE`, which already reads
"Copyright 2026 Andrés Cotton and Matt Stults", and both authors are listed in
`CITATION.cff`. Those two files stay exactly as they are, and the appendix of
`LICENSE` is filled in with the same line, so the request is met where it was
made as well as where it already held.

The fourth item is Polaris's own, and it does double duty. The upstream repo is
the standalone artifact: it clones, it runs under `python3 -m http.server`, and
it needs neither Supabase nor GCP. Once the platform work lands, this fork will
not be that any more. So the pointer to Andrés's repo is both the credit he
asked for and the honest answer to a researcher who wants to run the tool
locally. It is one line with two reasons to exist.

## Identity

The reader is already close to the collective's palette: cream ground `#F8F3E7`,
brown-black ink `#26221A`. Three things change.

**The accent.** Indigo `#4A53B3` becomes Polaris olive `#5F6B3A`, the exact
accent of `polariscollective.org`. The reader carries two palettes, `daylight`
and `umber`, each with its own accent; olive has nothing to stand against on the
umber ground, so it lightens to `#B2BD8B` there — the same substitution
`evals-playground` makes on its dark panels.

**The typefaces.** Spectral for display, Inter for chrome, the two faces of
`polariscollective.org`. The reading surface keeps EB Garamond: the spec text is
the thing this tool exists to read, and Garamond was chosen for it.
`--reader` therefore stays, `--ui` becomes Inter, and a new `--display` carries
Spectral.

**The mark.** The Polaris star, the one in `evals-playground`'s nav bar, enters
the site header beside the wordmark and becomes the favicon, replacing the `§`
glyph.

What does not change: the twelve behaviour hues. They encode which behaviour a
passage belongs to. They are data, not brand.

**The footer.** The reader is a full-height application — `body` has
`overflow: hidden` and the shell is sized `calc(100vh - header)`. A footer
therefore costs vertical reading space, and is kept to a single slim bar. The
shell's height math moves into a variable so the two chrome heights are stated
once rather than repeated.

## Boundary with the platform work

Nothing here anticipates the platform. No Next.js, no Supabase, no build step:
after this work the site still serves as static files, exactly as it does now.
The platform design document supersedes that, and will say so.
