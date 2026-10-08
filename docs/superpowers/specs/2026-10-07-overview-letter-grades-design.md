# The overview grades companies with letters, and drops the relative mode

Date: 7 October 2026. Status: approved in conversation, implemented on feat/overview-letter-grades.

## Why

The overview shows two final scores per company, each out of 10, and a switch to
a relative mode that places each company against the best score on its row. The
owner wants neither the switch nor the figure out of 10 on the grid. Most
companies score poorly on both boards as of October 2026, and the grid should say
so plainly: a 6.3 should not read as a good mark.

A relative mode says how a company stands beside the others, which is a ranking.
A letter set against fixed thresholds says whether a company meets a standard,
which is what the index means to say. Ratings in the same field grade the same
way: the Future of Life Institute's AI Safety Index grades companies A to F
against absolute standards, not against each other.

## The scale

Each final score on the overview is a letter, read from the figure out of 10 the
Index gives:

| letter | from | letter | from | letter | from |
|---|---|---|---|---|---|
| A | 9.3 | A- | 9.0 | | |
| B+ | 8.7 | B | 8.3 | B- | 8.0 |
| C+ | 7.7 | C | 7.3 | C- | 7.0 |
| D+ | 6.7 | D | 6.3 | D- | 6.0 |
| F | above 0 | | | | |

A figure of 0 shows the row's own word for nothing, "None", as the relative mode
already did: a company that publishes no constitution has nothing to grade, and
an F would put it level with a weak document.

These are the thresholds of American school grades, chosen because a reader
knows them without being told, and because they are strict: as of October 2026
no company reaches A on either board, and eight of ten get F on governance.

The first version had no plus or minus, on the argument that figures partly set
by hand and partly read by one model do not carry that precision. On 8 October
2026 the owner asked for them, on the American scale exactly: a minus in the
bottom three tenths of a band, a plus in its top three, A with no plus and F
with neither. As of that day they move two letters, Alibaba's constitution to
B- (8.0) and Anthropic's governance to D- (6.2), and give nobody a plus. The
cost was said before the decision: the governance minus rests on 0.1 of hand-set
figures beside OpenAI's D (6.3).

The letter is read from the figure **rounded to one decimal**, the figure the
page shows. Otherwise 8.96 would show "9.0" beside a B.

As of the repository files on 8 October 2026, with plus and minus:

| company | constitutions | governance |
|---|---|---|
| OpenAI | B (8.6) | D (6.3) |
| Alibaba | B- (8.0) | F (2.5) |
| Anthropic | C (7.6) | D- (6.2) |
| Microsoft AI | D (6.3) | F (4.2) |
| Google DeepMind, xAI, Meta, Mistral AI, DeepSeek, Moonshot AI | None | F (0.8 to 3.4) |

The cost is known and accepted: below 6 every figure is F, so 4.2 and 0.8 carry
the same letter, and the difference is read only by opening the cell.

## What the reader sees

- The toolbar loses the Absolute and Relative buttons. The legend shows six
  swatches, one per plain letter: A, B, C, D, F and None. It is a button: it
  opens the whole scale, every letter with the figures out of 10 it covers
  ("9.3 to 10.0", "9.0 to 9.2", down to "0.1 to 5.9" for F and "0.0" for
  None), under a title and a sentence from `grid.grade_scale` in the file.
- The grid's corner reads "Grade" over "companies in alphabetical order", in
  place of "Score (out of 10)".
- A cell shows its letter alone, painted on the boards' colour ramp where its
  threshold sits on the ramp the Index uses (A at 9.3, A- at 9.0, and so on down
  to D- at 6.0, F at 0), so every letter's text passes WCAG AA, which the ramp
  does everywhere from 3 up and at 0; an even spread put F at 3.93:1.
  None is unpainted, with the dashed edge of a cell not assessed. Its accessible
  name carries the letter and the figure: "OpenAI, what the constitutions say:
  B, 8.6 out of 10".
- A cell's popover shows the letter large with "8.6 out of 10" beside it. The
  rest of the popover is unchanged, and the parts a final score is made of keep
  their figure out of 10, because each leads to its cell in the Index, which
  stays in figures.
- A company's popover lists its two final scores the same way, letter and
  figure.
- The numbered note "Relative" leaves the notes under the grid, and its mark
  leaves the toolbar.

The boards of the Index and `/coverage` are unchanged and keep their figures out
of 10.

## The file

`site/overview.json`, which a publication freezes:

- `grid.tiers` and `grid.relative_note` are removed.
- `grid.grades` is added: `[{ "letter": "A", "from": 9 }, { "letter": "B",
  "from": 8 }, { "letter": "C", "from": 7 }, { "letter": "D", "from": 6 },
  { "letter": "F", "from": 0 }]`, highest first. F's `from` of 0 means any figure
  above 0; a figure of 0 has no letter.
- `grid.scale` is rewritten to say where the letters come from, that the
  thresholds are those of American school grades and were set in advance, that
  None means nothing the company publishes meets what the row measures, and that
  the figure out of 10 shows when a cell is opened.
- `grid.caption` drops "shown against the other companies or as a score out of
  10" and says the scores are letters.
- The fifth takeaway names letters where it named the relative tiers ("best in
  class", "middle tier", "behind"). Takeaways are findings across companies, so
  they may compare.

## The MCP server

`overviewBoard` in `app/lib/board-tools.mjs` answers each of the two final
scores with its `grade` (the letter, or "None" at 0, as the page shows) beside
`figure` and `max`. A part row (the document as a whole, the behaviours covered,
what is published, what it engages) carries no `grade` at all, because the page
grades only the final scores, and `measures.rows` says which rows are graded
with `final_score`. `measures` carries `grades` (the thresholds) and the scale
text in place of `tiers` and `tiers_mean`. It reads the thresholds from the frozen overview, and reads the
letter through the same function the page uses: `gradeOf(value, grades)` in a
new `site/grades.js`, which `board-tools.mjs` imports the way it already imports
`site/governance.js`. One function, so the page and the MCP cannot give a figure
two letters.

The descriptions of `overview_board` in `app/lib/mcp-tools.mjs`,
`app/api/mcp/route.js` and `site/mcp.html` say letters against fixed thresholds
instead of a tier against the best on each row.

## Publications built before this

A publication built before this carries `tiers` and no `grades`. The rule the
index already follows applies: a publication that lacks a key the page reads is
not drawn, and the page says the one "not compatible" sentence
(`site/publication-data.js`); `overview_board` answers the same, as it does today
for a publication without an overview. The development site therefore shows
that sentence on the overview from the moment this deploys until a new
development publication is built. Locally, the "Repository files" switch reads
`site/overview.json` from disk and shows the letters at once.

## Rules to update

`CLAUDE.md`, under "Rules for the site's text", names "the relative mode of the
overview's grid" among the places a comparison is allowed. That place is gone,
and the sentence drops it. The assistant's memory note on absolute company texts
says the same and is updated with it.

## Tests

- `app/lib/__tests__/board-tools.test.mjs`: every non-zero figure carries a
  letter by the thresholds; a figure of 0 carries none; a figure that rounds up
  to a threshold takes the higher letter; an overview without `grades` answers
  `INCOMPATIBLE`.
- `site/grades.js` has a unit test of its own covering the same cases.
- In the browser, locally on "Repository files": the grid shows letters, the
  legend six swatches, no switch, the popovers letter and figure, and no
  console error.
