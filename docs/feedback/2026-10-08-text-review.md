# Text review, 8 October 2026

Gabriel Levie's review of the development site's text, in the Google Doc
"20261008_AICI_Text Review" (71 suggested edits, 24 comment threads), with the
owner's replies there and the working session of the same afternoon. The
session's Granola transcript is mostly speech-to-text noise; a point taken from
it alone is marked "call, low confidence".

Status: **done** (on `feat/overview-letter-grades`), **decide** (needs the
owner's or Gabriel's word), **content** (needs text or research first),
**later** (agreed, not scheduled).

## Phrasing applied (commit 06943c6)

Gabriel's suggested wording, with its slips mended (double full stops, a plural
pronoun after "constitution", missing spaces), on the overview unless named:

- the introduction's two paragraphs, with the completeness claim dated "as of
  October 2026";
- takeaways 1, 2, 3 (title), 4 and 6;
- the two final scores' descriptions without ", together";
- the descriptions of "Document as a whole", "What is published", "What it
  engages" ("controlling changes to it") and "Behaviours covered" ("should
  follow", the owner's first answer);
- the two context rows renamed "Capabilities" and "Model usage", their limits
  reworded, and "For people," in the usage row's sources said in full;
- Alibaba's "other policy documents it does not publish", on the overview and
  the governance board;
- a group of one practice said in the singular in its popover
  (`site/governance.js`, `aboutGroup`).

Four of the suggestions remove substance as well as wording, and were applied
as suggested. Revert any the owner does not want:

- the introduction no longer says a constitution must be published, clear
  enough to test, trained on and followed "for it to mean anything";
- it no longer says the list of behaviours is not exhaustive;
- takeaway 4 no longer says "these asks belong in regulation as well as in
  voluntary commitments", which the governance board's findings still say;
- takeaway 6 no longer says Microsoft AI's figures are one model's provisional
  reading (its company summary still does).

The grid's scale sentence that Gabriel found confusing ("each is shown out of 10
as its share of that scale") was already replaced on this branch when the rows
began to open.

## Still to do

| | Change | Where | Status |
|---|---|---|---|
| 1 | Takeaway 5 still ranks ("lead", "the highest grades any company gets there"); Gabriel asks whether to speak in relative terms at all, and to say plainly that results are poor | `site/overview.json` `takeaways[4]` | decide |
| 2 | Make the takeaways mutually exclusive, one point each (2 and 5 both cover change records; 3 and 4 both turn on rules that are not public; 6 is a caveat, not a finding) | `site/overview.json` `takeaways` | content |
| 3 | Group each board's takeaways under its two halves (document as a whole and behaviours covered; what is published and what it engages), and find them again on the overview | `site/constitutions.json` `takeaways`, `site/governance.json` `findings`, the overview | decide |
| 4 | Rename "Document as a whole" to "Clarity of the document" (the owner's question, not yet a decision); a rename reaches both boards, the MCP and about forty places in code | everywhere the name appears | decide |
| 5 | "Behaviours covered": "should follow" (applied) or "should demonstrate" (the owner's second thought) | `site/overview.json` | decide |
| 6 | "Specific domains" in the description of the document as a whole can be read as subject areas; the criterion counts six situations of use (conversation, tools, images and audio, minors, other agents, customised deployments) | `site/overview.json` `grid.groups[1].rows[0].plain` | decide |
| 7 | Alibaba's "current Qwen line": find which line is current and name it (likely the 3.8 generation) | four texts in `site/overview.json` and `site/governance.json` | content |
| 8 | Split Alibaba's "gaps" sentence; ambiguous whether by the two halves of what the constitutions say or against governance; if the former, it applies to every company's summary that names gaps | `site/overview.json` `summaries.*.constitutions` | decide |
| 9 | Remove "Motivation" and "What comes next" from the board pages (the owner: "Shouldn't be there"); if motivation moves, `/about` already has "Why it matters" | `site/constitutions.json`, `site/governance.json` `page.sections` | decide (one or both) |
| 10 | Context cell popovers repeat the row's explanation; keep it only in the row's own popover | `site/overview.js` `aboutContextCell` | later |
| 11 | Remove the weight fractions under row names ("1/8 of the figure") across the boards and their popovers; reverses the 24 September rule | `site/constitutions.js` `weightLine`, `site/governance.js` `rowWeight`, `aboutColumn` | decide |
| 12 | Remove the "From Kembery et al." source lines in popovers, across the boards | `site/governance.js` `aboutColumn`, `fromLine` | decide |
| 13 | "What this column does not count" (I5) in the column popover: remove or reword | `site/governance.js` `aboutColumn` | decide |
| 14 | Make the Constitutions page introduction agree with the overview's, or remove it | `site/constitutions.json` `page.intro` | content |
| 15 | The governance page's first sentence may go; its second and third could inform the overview's wording | `site/governance.json` `page.intro` | content |
| 16 | Add the public comment window and the open licence to the description of "What is published" (call, low confidence) | `site/overview.json` `grid.groups[0].rows[0].plain` | decide |
| 17 | A short FAQ: questions about the tool and how to use it (call) | `/about` or a new page | content |
| 18 | Scoring methodology review with outside experts (call) | method | later |
| 19 | Keep the overview's takeaway 3 title and the governance board's finding ("armed forces") saying the same thing | `site/governance.json` `findings[3]` | decide |
