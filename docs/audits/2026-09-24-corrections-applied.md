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
