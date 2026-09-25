# External audit of 25 September 2026: what was applied and what is held

An audit of the dev publication `fb79e4b7` checked every figure and text of the
overview, the constitutions board, the governance board and the doc reader, one
auditor and one second reader per row, both language models. Its synthesis is
`audit-synthesis.txt`.

What was applied, file by file, with every held item and the reason it is held:

- `governance-applied.md`: twenty-six score changes and the texts that follow them.
- `constitutions-applied.md`: seventy-six text corrections, no figure changed.
- `overview-applied.md`: the overview brought into line with both boards.

A correction was applied when the second reader confirmed it, it did not raise
Anthropic (the auditors are Claude, an Anthropic model), it was not a scoring
rule or a method decision, and it could be checked against the documents or the
board itself. Everything else is held for the owner.

The three `reading-*` files are a second, independent reading of the passages
the audit says the panel missed, one per document, with the band each passage
should carry and the depth that follows. The `read-*.json` files carry the same
at passage level, with locators.

Two findings of the audit did not hold on inspection. The Model Spec's worked
examples were not dropped at ingestion: the judges were given all of them and
scored them, and the judging rubric caps a worked example at 1, so three judges
can give it at most 3 against a retention cut of 4. And the judges saw more than
the retained passages: every depth out of ten also carried the conflict-rules
block of assessment run `b4acc896`, which holds some worked cases.
