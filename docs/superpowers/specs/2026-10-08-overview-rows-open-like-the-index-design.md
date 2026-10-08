# The overview's scores open into the Index's rows

Date: 8 October 2026. Status: approved in conversation, to be planned.

## Why

The overview shows two final scores per company, each a letter. Everything they
are made of lives on the two boards of the Index, behind a link in a popover. The
owner wants the overview to carry all of it: each final score opens, in place,
into the rows the Index shows under it, indented in the Index's style, down to
the last row, and every cell and row name opens what it opens in the Index. For
now the overview is the page that matters; the Index is not removed, and is not
changed by this work.

No written sentence of the three board files changes, with one exception named
below because the display it describes changes.

## The rule for a cell

- **A row that adds up other rows is a letter**: the final scores, the document
  as a whole, the behaviours, each category of behaviours, what is published,
  what it engages, each question and each group of practices. The letter is
  read from the row's figure out of 10, the figure the Index shows, on the
  overview's scale (`grid.grades`, A from 9.3 down to F, None at 0), by
  `gradeOf` in `site/grades.js`, and painted where its threshold sits on the
  ramp, as the final scores already are.
- **A row scored directly is its figure on its own scale**: a criterion out of 4,
  a check out of 4, a practice out of 2, a behaviour's depth out of 10. The cell
  shows the figure and its scale in the corner the Index boards already draw
  (`/4`, `/2`, `/10`), painted over that scale. A whole score is written whole
  (`4`, `1`) and a mean to one decimal (`3.7`, `8.3`).
- **A practice nobody scored** (I5) is NA, as in the Index.

Nothing in the data changes: the figures are the ones the Index computes, so no
letter moves. As of 8 October 2026, OpenAI's column opened reads: what the
constitutions say B; document as a whole A, its criteria 4, 3.7, 3, 4 and 4 out
of 4; behaviours C+; how constitutions are governed D; what is published C-,
published constitution B, its checks 4, 4 and 2 out of 4, change log F, public
access A, open licence 2 out of 2; what it engages F, training and use C.

## What the reader sees

- Each final score's row carries the Index's fold button. Pressed, it shows the
  rows the Index shows under that board's final score, and each of those that
  has rows under it carries its own fold, down to the checks, the behaviours and
  the practices. The rows keep the Index's names, the line under a name saying
  what the row counts for ("1/5 of the document", "3/11 of what is published"),
  its levels of indentation and its sizes.
- The page opens with only the two final scores showing, as today. A button
  above the grid, "Show every row" and "Hide every row", opens or shuts every
  fold at once, as on the Index.
- Every cell of an opened row, and every opened row's name, opens the popover
  the Index opens for it, with the same sentences. A popover of the Index says a
  figure out of 10; that is the figure behind the letter or the score in the
  cell.
- The Index boards number notes under their tables and mark a row's name with
  the numbers that apply. Those notes are not on the overview, so an opened row
  carries no note mark there.
- The rows still in preparation and the context rows stay under the scores,
  unchanged.

## How it is built

The rows are built once, by the code that builds them for the Index, so the two
pages cannot show a row two ways.

- `site/constitutions.js` and `site/governance.js` each export a function that
  builds the rows of their board below its final score, given the board
  instance to draw with (`createBoard` in `site/board.js`), the board's file,
  the order of the companies' columns, a function that draws a cell, the group
  id the top rows fold under (none on the Index), and whether rows carry note
  marks. Each module's own preparation of its file (the figures, the ranking,
  the categories, the companies' totals) moves into a function both its
  initialiser and this export call.
- The cell function receives what the row is: its kind (`total` or `scored`),
  its figure out of 10, its figure and scale as scored where it is scored, and
  the popover to open. The Index passes the function it uses today, so its
  table is drawn exactly as before. The overview passes one that draws a total
  as a letter and a scored row on its own scale.
- The modules keep their state at module level, which their popovers read. The
  overview never runs either board's initialiser, so each module's state is set
  by the export and serves the overview's popovers.
- Every row id and fold id on the overview is unique across the two boards.

## The one sentence that changes

`grid.scale` in `site/overview.json` ends: "The parts behind a figure are each
given on a scale of their own, 0 to 4 for a criterion or a check, 0 to 10 for a
behaviour and 0 to 2 for a practice, and each is shown out of 10 as its share of
that scale." That stops being true. It becomes: "Opened, a score shows the rows
it is made of: a row that adds up others is a letter on the same scale, and a
row scored directly keeps its own scale, 0 to 4 for a criterion or a check, 0 to
10 for a behaviour and 0 to 2 for a practice."

The labels of the new button, "Show every row" and "Hide every row", are the
Index's, and go into `overview.json` as `grid.every_row` so the overview's words
stay in its file.

## Not in this change

- The overview's own popovers (a final score's, a company's) keep showing their
  parts as they do today, figures out of 10.
- The Index pages, their popovers and their links are unchanged.
- The MCP's `overview_board` still answers the final scores' letters only.

## Tests

- The Index draws the same table as before: its rows, ids, cells and labels,
  built through the exported function with the Index's cell function, against
  the repository's files.
- The overview's cell function: a total gives its letter, a scored row its own
  scale, an unscored practice NA, a total at 0 None.
- Every id in the overview's table is unique.
- In the browser, on Repository files: each final score folds and unfolds, every
  fold opens, "Show every row" opens all of them, the cells read as the rule
  says, a sub-row's cell and name open the Index's popover, and no console
  error.
