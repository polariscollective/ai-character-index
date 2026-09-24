# Dashboard feedback, 24 September 2026

A reviewer's feedback on the public site, page by page, with the owner's
additions in the same session, and where each point stands. Kept here so it does
not have to be said twice. Update the status column as work lands.

Status: **done** (in `develop`), **now** (being done, needs no new content),
**content** (needs text written or a decision first), **later** (agreed, not
scheduled), **parked** (set aside on purpose).

## Rules that came out of the discussion

These hold for every page, not only where they were raised.

- **A company's own text never compares it with another company.** Profiles,
  criterion readings and behaviour readings talk about that document alone. The
  one place a comparison belongs is the fold "How it stands beside the other
  constitutions" inside a behaviour's popover, which says so in its title.
- **Every figure on a board is out of 10.** A score given on a scale of its own
  is shown as its share of that scale, and the popover says the score as given.
- **A row above others is their weighted average**, and each row says under its
  name what it counts for, as a fraction of the figure it belongs to ("1/13 of
  the behaviours"), never as a percentage.
- **Nothing sits under a row's name but its weight.** Sources, "part of the
  minimum" and definitions go into numbered notes, and the row carries the note's
  number.
- **The user checks the look.** Start the preview early and give the address;
  run the test suites once before committing.

## What the constitutions say (front page, first tab)

| point | status |
|---|---|
| Intro sentence "scores each one twice ... added together" makes no sense. Say plainly that the board assesses two things: the document as a whole (its consistency and coherence) and how well each desirable model behaviour is addressed. | done |
| "Missing a constitution, or a behaviour the index should be asking about?" becomes "... a behaviour that this index should be assessing?" | done |
| Assessments must be absolute, not relative: Alibaba's profile talked about OpenAI and Claude. | done (profile edited; no other text compares) |
| Remove "Companies level on it share a place, and the next rank skips." from the final score's popover. | done |
| Rename "What wins when two rules clash" to "Clarity when two rules are contradictory". | done |
| Rename "Clashes the document leaves unsettled" to "Unsettled contradictions between rules". | done |
| Scoring should be simpler; why are the document's criteria out of 2? | done (everything out of 10, weights written) |
| "As of September 2026" should carry an exact date and time. | done on the constitutions board: the date and time its publication was put online. The governance board is scored by hand and keeps its month. |
| A behaviour on secret loyalties, or folded into an existing one, citing the paper mentioned by a colleague. | done: "Preventing secret loyalties" was judged in publication `06d17d90`, and the board now carries it as a fourteenth behaviour, under autonomy, oversight and authority, with its readings and comparison. The takeaways were revised for the new figures. The paper is not yet cited anywhere on the site. |

## How constitutions are governed (second tab)

| point | status |
|---|---|
| Title becomes "How constitutions are governed". | done |
| Intro: the two things scored are the transparency of the constitutions published and the extent to which they are made to bind the models. | done (the final score is their average, not a sum out of 20) |
| Scoring method should be simpler. | done in part (out of 10, fractions); revisit after the page restructure |
| Remove "part of the minimum", "Polaris Collective", "Kembery et al." under rows. | done (numbered notes) |

## Doc reader

| point | status |
|---|---|
| Slow to load when arriving from another page (reviewer's screenshot shows an empty state). | done in part: the menu said "No behaviours under test yet" while loading and now says it is loading. The wait itself is Vercel's cold start, about 2 s for each of the reader's two rounds of requests after a quiet spell; warm, each request answers in 0.1 to 0.2 s. Longer CDN caching would hide it but risks a payload and its documents coming from two publications for a moment after a new one is made public, so it is not done. |
| Behaviour categories foldable. | done |
| Ticking a behaviour opens the document at once, then after about 0.2 s goes to that behaviour's first "defining" passage. | done (falls back to the behaviour's first passage where no passage defines it) |
| A small "Propose a behaviour" in the behaviours tab. | done (under the list) |
| A discreet "Propose a constitution" tab beside the providers. | done |

## About

| point | status |
|---|---|
| Update for a site with tabs, not only the original index. There will be four: what the constitutions say, how constitutions are governed, how constitutions are regulated (forthcoming), adherence of models to constitutions (forthcoming). Mention all four in the Ambition section. | done; the two views to come are disabled tabs marked "In preparation" |
| "How constitutions are regulated" as a work-in-progress tab: track how far constitutions are mentioned in regulation, from the owner's governance memo. | content: needs the memo, which is not in this repository |
| "Adherence of models to constitutions": link the evals, the missing link between a constitution's quality and governance and how models actually behave. | later |

## Every board page

| point | status |
|---|---|
| Each board page gets sections like Guidelight's assessments page (https://guidelight.ai/assessments#takeaways): takeaways, motivation, detailed scoring, limitations, what comes next. Reuse Guidelight's section titles. | done for the sections whose text exists: governance has Takeaways, Notes, Detailed scoring, Limitations and Sources reviewed; the constitutions page has Notes and the behaviour scale. Motivation, What we assessed and What comes next need writing |
| A small, discreet menu on the left listing the page's sections, as Guidelight has. | done on the front page, in the left margin from 1400 px wide |
| Takeaways for the constitutions page. | done (seven, figures checked against the board) |
| Motivation and what comes next, both pages. | done |
