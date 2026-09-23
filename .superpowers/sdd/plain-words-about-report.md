# Task 6: the about page, in plain words

Worktree `/Users/sverbo/Desktop/Codes/Polaris/aci-pw-about`, branch `pw-about`.
One file changed: `site/about.html`. `site/brand.js` was not touched.

## What the page says now

- `#tldr` is headed "What this is". Its lead names the documents as constitutions
  in the first clause. The third paragraph describes the overview as two boards
  and says what each one scores, in place of "two heat maps" and a 0 to 4 scale
  that the newest publications no longer use.
- `#why` was already what Task 6 asks for and is unchanged.
- The glossary lost the entry that explained the old jargon term, on the owner's
  instruction. `AI Constitutions Index` is now two sentences: what these documents
  are, and that the index is named after them. `site/brand.js` finds that entry by
  its `<dt>` text and copies its `<p>` elements, both of which still hold, so the
  note behind the wordmark keeps working with no code change.
- `Depth` says 0 to 10 for the newest publications and 0 to 4 for the earlier ones.
- "Documents, behaviours and how they are read" is now "What the index reads, and
  who reads it". The panel name `frontier_fast`, the rubric version, the seat
  vocabulary and the named substitute models are gone; three models from three
  companies read each document, and where one could not answer the index records
  which model read in its place and why.
- The behaviour proposal no longer mentions the portal or "the run".
- "What it does not tell you" drops the antithesis and says "figure" where it said
  "depth".
- "Citing what you find" loses the sentence about a scheduled job.
- The change log's withdrawn entry no longer names `frontier_fast`.
- The two closing sections became one, `#run-it-yourself`, headed "The repository,
  and running it yourself". It is the only technical section and it is last.

## Deviations from the plan's Task 6, and why

1. **The `Constitution` glossary entry was deleted rather than rewritten.** Task 6
   Step 3 supplies one. The owner's instruction for this pass says the entry that
   explained the old term "has no reason to exist", so it is gone and the word is
   defined once, in the entry above it.
2. **The `AI Constitutions Index` entry is one paragraph of two sentences**, not
   the plan's two paragraphs. The owner asked for one or two sentences, and the
   plan's second paragraph is the aspirational reading he asked to remove.
3. **The change log and the behaviour proposal were touched**, which Task 6 does
   not list. Both carried machine names or internal words ("frontier_fast",
   "portal") that the owner's rule about leaving no trace of how the work is
   carried out reaches.

## Tests

No test broke, so none needed editing. Only `tests/test_page_feedback_bubble.py`
reads `site/about.html`, and only for the three script tags, which are untouched.
The browser walker was not run: nothing pointed at it, and
`engine/verify-reader-features.mjs` never loads this page.

- `node --test app/lib/__tests__/*.test.mjs` - 363 pass, 0 fail
- `python3 -m unittest discover -s tests` - 78 tests, OK
- `python3 -m pytest engine -q` - 804 passed, 87 subtests passed

## Left undone

- Nobody has looked at the rendered page. Speed was asked for over screenshots, so
  Step 9 of Task 6 is not done: the rail's entries, the wordmark popover and the
  page's length on a phone are unverified by eye.
- The glossary's `Behaviour` and `Passage` entries still say "the judges", where
  the rewritten section above them says "three models". The plan asks for those two
  entries to be kept, so the two vocabularies now sit on one page.
