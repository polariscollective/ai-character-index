# The overview on the depth scale of ten, as a prototype

`index.html` is a standing prototype of the overview grid once a publication
carries depths out of ten and each document's assessment as a whole, decided
with the owner on 22 September 2026. `index-two-rows.html` is the variant that
put the final score's two parts on the board as rows, kept because parts of it
may come back.

It is here and not under `site/` because everything under `site/` is copied into
`public/` and served: a prototype carrying figures no publication has published
must not be reachable on the deployed site.

It reads `data.json`, which holds real figures of 22 September 2026: the 168
depths out of ten of assessment run `b4acc896`, and the assessment of each
document as a whole from run `e2c00b2e`, whose contradictions were found and
read by the second method. Nothing in it is invented.

To look at it, serve this directory and open `index.html`:

```sh
python3 -m http.server 4620 --directory docs/prototypes/2026-09-22-depth-out-of-ten
```

What it shows, and what the site itself must do, is the Display section of
`docs/superpowers/specs/2026-09-21-depth-out-of-ten-and-the-document-as-a-whole-design.md`
and the plan `docs/superpowers/plans/2026-09-22-depth-out-of-ten-site.md`. The
plan predates the prototype and still describes a foot row and a scale beside
the grid, which the prototype replaced with the governance board's design: the
final score out of 20 at the top, the document as a whole and the behaviour
categories as foldable groups, NA for a company with no specification, and the
depth scale under the table.
