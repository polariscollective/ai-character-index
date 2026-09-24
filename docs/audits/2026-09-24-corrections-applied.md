# Corrections applied after the audit of 23 September 2026

The audit is `2026-09-23-every-figure-defended.md`. This is the log of what was
changed because of it, one entry per change, with the value before and the value
after, so that any of it can be undone by reading this file rather than by
reading a diff.

Each entry says which audit finding it answers, or says that it answers none.

---

## 1. The board carries one column per company, its newest document

**Answers:** the whole of the audit's section on `openai-2025-12`, and the cause
behind sixteen of the forty-one wrong cells.

**Before.** `site/constitutions.json` carried an eleventh entry, `openai-2025-12`,
the OpenAI Model Spec of 18 December 2025, scored on every row and reached from
the OpenAI column's profile. Every behaviour cell of every company could then
compare itself against a version of a document rather than against a document,
and sixteen cells did so wrongly.

**After.** The entry is gone. The board shows nine companies, each with its
newest document.

**What this does not change.** The December 2025 version stays in the database,
in the publication, and in the doc reader, where two versions of one document are
two documents and a reader can open either. It leaves the board only.

**Why.** The owner never asked for a comparison between two versions of one
company's document. It arrived with a generic treatment of the links between
paragraphs of every document, and the board inherited it.

---

## 2. The figures are the judges' own means, not a rounded copy of them

**Answers:** the audit's finding that the criteria shown do not add to the total
shown, in three of the four scored columns.

**Before.** `site/constitutions.json` stored every criterion and every behaviour
depth already rounded to one decimal, and stored `whole.total` as the sum of five
halved means each rounded once. Three numbers were therefore rounded twice on
their way to the screen, by two different rules, and the parts could read 0.2
away from their own total.

**After.** Every criterion, every behaviour depth and every `whole.total` is
computed from the judges' own integers in
`docs/prototypes/2026-09-22-depth-out-of-ten/data.json` and stored unrounded.
Fifty figures moved, none by more than 0.04, and not one moved because a
judgement changed.

`whole.total` is now exactly the mean of the five criteria taken to a scale of
ten. The board rounds once, when it draws.

**What this does not change.** The display. Each figure is shown out of 10 as the
board has shown it since 24 September, and the scale it was given on is in the
popover.

**The figures that moved, in full.**

| Company | Field | Before | After |
|---|---|---|---|
| openai | criterion rule_force | 3.7 | 3.6667 |
| openai | criterion reasons | 3.3 | 3.3333 |
| openai | whole.total | 9.5 | 9.5 |
| openai | 6 of 13 behaviour depths | one decimal | exact |
| alibaba | criterion rule_force | 3.7 | 3.6667 |
| alibaba | criterion reasons | 2.3 | 2.3333 |
| alibaba | criterion situations | 3.7 | 3.6667 |
| alibaba | whole.total | 8.8 | 8.8333 |
| alibaba | 10 of 13 behaviour depths | one decimal | exact |
| anthropic | criterion conflict_rules | 2.3 | 2.3333 |
| anthropic | criterion rule_force | 2.7 | 2.6667 |
| anthropic | criterion reasons | 3.7 | 3.6667 |
| anthropic | criterion situations | 2.7 | 2.6667 |
| anthropic | whole.total | 6.6 | 6.6667 |
| anthropic | 9 of 13 behaviour depths | one decimal | exact |

The complete list of the fifty, field by field, is in the commit that carries
this entry.

**What the board reads now.** Final score: OpenAI 8.5, Alibaba 8.4, Anthropic
7.4. The document as a whole: 9.5, 8.8, 6.7. The behaviours: 7.4, 8.0, 8.1. The
order is unchanged and the gap at the top is still a tenth.

**To undo.** Round every figure in `site/constitutions.json` to one decimal and
restore `whole.total` to the sum of the five halved means. Nothing else depends
on it.

---

## 3. The rubric describes the level Claude's Constitution sits on

**Answers:** the audit's finding that Anthropic's conflict-rules figure breaches
the ceiling the cell itself quoted.

**Before.** `methodology/document-assessment-rubric.md`, criterion 1, described 0,
2 and 4 and said of the 2 that an order weighed as a whole is "at most 2, however
detailed". Elsewhere the same rubric says an odd number means between the two
levels around it. A document that pairs a holistic order with absolute
constraints and named winners therefore had two rules pointing at two answers,
and Claude's Constitution is that document. Its three readings were 2, 3 and 2,
so the mean sat above a ceiling.

**After.** The rubric writes out the 3: that order, and beside it rules that
decide a clash in advance, being constraints the document calls absolute, or a
named winner for a particular pair of its rules, or worked cases. The ceiling on
2 now says "at most 2 on its own", and a paragraph under the levels says why the
level was missing.

**What this does not change.** No figure. Anthropic's 2.3333 is the mean of 2, 3
and 2, and it stands because the 3 is now a described level rather than a reading
against the rule.

**To undo.** Restore the flat ceiling and lower the cell to 2.0, which costs
Anthropic 0.08 on the document figure and nothing on its rank.

---

## 4. A figure inside a sentence is rounded to one decimal

**Answers:** nothing in the audit. It is a fault entry 2 introduced.

**Before.** Storing the judges' own means put thirds into the file, and two
sentences printed a score without formatting it: "Scored 3.3333333333 on its own
scale of 0 to 4" in the constitutions board's criterion popover, and the same
sentence on the governance board.

**After.** Both take one decimal, and none where the figure is whole: "Scored 2.3
on its own scale of 0 to 4", "Scored 4 on its own scale of 0 to 4". The helper
is `onScale` in `site/constitutions.js` and `onItsScale` in `site/governance.js`.

Every text node of the six public pages was then swept, with each fold and each
popover opened, for a figure carrying three or more decimals. Two remain and both
are arXiv identifiers.

**To undo.** Interpolate the score directly again.

---

## 5. The rubric's new level reaches the prompt, the page and the tests

**Answers:** a fault entry 3 introduced, found by the second audit.

**Before.** Entry 3 wrote the level 3 into
`methodology/document-assessment-rubric.md` and nowhere else. That rubric says of
itself that it is "the canonical source they restate: a change of substance here
has to land in the prompt too", and the change did not.
`engine/panel/prompts/assessment-criteria-v1.txt` went on asking judges for a
ceiling the index had withdrawn, and `site/document-assessment.js` went on
showing a reader three levels where the rubric described four.

**After.** The prompt carries the level 3 in the rubric's own words. The site's
anchor table carries it, so a reader opening the criterion sees the level a
figure of 3 sits on. Two tests moved with the rule and one parser opened:
`test_assessment_call.py` holds the prompt to "at most 2 on its own" and to the
new line, `test_site_rubrics.py` reads any level the prompt describes rather than
only the even ones, and its guard expects 0, 2, 3 and 4 on conflict rules.

**What this does not change.** No figure. The readings on the board were taken
under the old prompt, which is worth knowing: two of Anthropic's three readings
gave 2 because of the ceiling, so its 2.3333 may understate the document under
the rule as it now stands. Judging that cell again would cost money and is the
owner's call.

**To undo.** Restore the flat ceiling in all three places.

---

## 6. The fourteenth behaviour's figures are means again

**Answers:** the second audit, all three of its document readers independently.

**Before.** `preventing-secret-loyalties` joined the board on 24 September from
publication `06d17d90` with OpenAI at 5.7 and Anthropic at 5.3, stored to one
decimal, while Alibaba on the same row carried 2.3333333333. Those were the only
two figures on the board that were not a panel's mean, which is the fault entry 2
removed everywhere else.

**After.** OpenAI 5.6666666667 and Anthropic 5.3333333333.

**How the values were established.** Not read from the publication, which is not
in this repository, but derived: a mean of three integers is a multiple of a
third, and the only third that rounds to 5.7 at one decimal is 17/3, as the only
third that rounds to 5.3 is 16/3. Alibaba's 7/3 on the same row confirms three
seats. Both are worth checking against `06d17d90` when someone next has the
database open.

**What moves with it.** A takeaway that called no sycophancy level with
preventing secret loyalties as Anthropic's lowest behaviour is false against the
stored figures and true against these, which is the second audit's finding and is
not yet applied.

**To undo.** Write 5.7 and 5.3 back.
