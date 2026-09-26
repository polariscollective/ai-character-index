# Governance board: numbered source citations

Worktree `/Users/sverbo/Desktop/Codes/Polaris/aci-unanalysed`, branch `feat/manual-corrections`. Nothing committed, no browser check. `site/governance.json` differs from HEAD only by the markers, the `ref` on each quoted passage, the registry and the "Sources reviewed" section: stripped of those, every text is word for word what it was (checked by script). Serialisation kept (indent 1, ensure_ascii off, trailing newline). No long dash in anything written.

**Heads-up.** While I worked, six commits landed on this branch (`362cb2a` to `7e929fa`, constitutions board, overview, CLAUDE.md). None touches a file I changed, and both suites pass on top of them.

## Tests

- `python3 -m pytest -q tests engine`: 931 passed, 362 subtests.
- `node --test app/lib/__tests__/*.test.mjs`: 397 passed, 0 failed.

## The registry

`governance.json` has a top-level `sources` (after `evidence`): 160 entries, 136 with quotes and 24 without, 322 quotes. Built by `cite-build.py` from the evidence, quotes copied rather than typed. Numbered company by company, then in the board's row order (checks, then S1 to S5, then I1 to I4), then the old list's sources that no row quotes, in the list's order.

| Company | Code | Entries |
|---|---|---|
| OpenAI | OA | 25 |
| Anthropic | AN | 20 |
| Alibaba | AL | 5 |
| Google DeepMind | GO | 27 |
| Mistral AI | MI | 16 |
| Meta | ME | 9 |
| xAI | XA | 26 |
| Moonshot AI | MO | 14 |
| DeepSeek | DS | 10 |
| Several companies | CO | 8 |

Decisions to check:
- **CO1 and CO2 are the two working papers.** They have no address (`url: null`, `paper: "memo"` or `"kembery"`), and their quotes are the rows' own passages, deduplicated (28 and 19). CO3 is OpenAI's joint safety evaluation with Anthropic, which the old list filed under "More than one company". CO4 to CO8 are the old list's other sources on several companies.
- **Six addresses were merged into the entry of the same document.** Three came from the old list: gemini.google/policy-guidelines, arXiv abs/2507.06261 and the Markey press release. The other three are variants of one paper version: R1 v2 at three arXiv addresses, and Kimi K2 v1 as page and PDF. The two versions of the Gemini 2.5 report (v1 and current) stay separate.
- **A document cited under several section titles is one entry.** The section goes into each quote's `where`. A quote that another quote of the same entry already holds whole is dropped.
- **Three entries mix dates.** Anthropic's RSP (AN7), Mistral's changelog (MI10) and Kimi's platform changelog (MO4) have `date: null`, and each quote carries its own date.
- **Every evidence and internal_evidence source gained `ref`.** Its other fields are unchanged.
- **Two entries rest under no sentence.** GO27, Google's Gemini for Government deployment guide, is named only in a note saying we found nothing, which takes no code. MI14, NewsGuard's audit of Le Chat, is mentioned by no text at all. Your two asks conflict here: "keep them" and "every entry is cited". I kept both and named them in the test (`READ_NOT_CITED`, in the style of the existing `UNQUOTED`). Cite them somewhere or drop them.

## Markers placed: 721

| Field | Markers |
|---|---|
| profiles (incl. asides) | 277 |
| column_readings | 89 |
| looked | 259 |
| findings | 74 |
| page sections | 22 |

By company (profiles / column_readings / looked):

| Company | Profiles | Column readings | Looked | Total |
|---|---|---|---|---|
| OpenAI | 37 | 11 | 28 | 76 |
| Anthropic | 31 | 14 | 26 | 71 |
| Alibaba | 14 | 6 | 17 | 37 |
| Google DeepMind | 34 | 16 | 35 | 85 |
| Mistral AI | 41 | 5 | 29 | 75 |
| Meta | 25 | 8 | 22 | 55 |
| xAI | 43 | 16 | 43 | 102 |
| Moonshot AI | 25 | 7 | 28 | 60 |
| DeepSeek | 27 | 6 | 31 | 64 |

Nine parallel passes, one per company, each read every sentence against the quotes. Where the quotes did not settle a sentence, they read the documents themselves (cached copies or live pages). I placed the findings and page markers (`cite-shared.py`), each anchored on the exact end of its sentence. `cite-merge.py` applied everything after checking that stripping the markers gives back each text.

The page sections got markers in five places:
- "Where the rows come from" (CO1, CO2).
- The best practices (CO2).
- The outside sources "How we looked" names (AN12, MI5, MO10, DS8, DS9, CO7).
- "How to read the scores".
- Three Limitations bullets (AL1, AL3, CO7).

**Heavy groups, for you to trim if you want.** Summary sentences that rest on many documents carry long runs. The heaviest is `column_readings.anthropic.engages`, with 10 codes on one sentence. Then 6 each on:
- xAI's two readings,
- Meta's published reading,
- Google's engages reading,
- finding 2's first sentence,
- the "How we looked" sentence.

## Sentences I could not source

These are positive claims with no registry document behind them. "Partly" means the sentence carries a code for its other half.

**Findings and page (mine)**
- Finding 3: the spokesperson on military models (TIME, not in the registry).
- Finding 3: Meta opening Llama to NATO and EU institutions. Partly: ME2 covers the use policy.
- Finding 3: Mistral's chief executive's quote. Partly: MI6 covers the usage policy.
- Finding 4: "The Max product is served through the API ... published for anyone to download on 12 August 2026" (the Qwen3.8 model card is not in the registry).
- Finding 6: Qwen "among the most used open-weight models".
- Finding 6: DeepSeek's "1.6-trillion-parameter". Partly: DS1 covers the MIT licence.
- Finding 6: Mistral Large 3 under Apache 2.0 with its model card sentence. Partly: MI15 covers Medium 3.5.
- Finding 1: the "shutdown timer" wording of the December 2025 Model Spec, which is not in the registry. OA1 and OA7 cover the rest.
- Limitations: Anthropic's July 2025 post ("intends to sign").
- Limitations: TIME and the Claude Mythos system card coverage.
- Limitations: the Kimi K3 release date dispute (Moonshot blog, AISI, Wikipedia).
- Limitations: "three" undated Google documents (the registry holds two undated Google entries, GO1 and GO2).
- "Who the companies are": the legal names.

**OpenAI**
- ChatGPT Gov and OpenAI for Government announced with reference to the usage policies. Partly: OA24 covers GenAI.mil.
- ChatGPT Mil live on 31 August 2026, in profile 1 and the 1.3 note (Nextgov).
- The age-prediction help article.
- Outside testing of "models improving themselves". Partly: OA16.

**Anthropic**
- The spokesperson (TIME). Partly: AN2.
- Government usage-policy exceptions (post of 26 June 2024).
- Fable 5 and Mythos 5 routing (launch post).
- Collective Constitutional AI 2023.
- The Jakkli et al. "March 2026" and "working from public access". Partly: CO4.

**Alibaba**
- Kelp and YuFeng-XGuard-Reason. Partly: CO5 covers Qwen3Guard.
- The CAC filing numbers and the fourteen models.
- "The current Qwen3.8 line", in practices_engaged and the engages reading.
- The Oyster-II paper, in the S2 note.

**Google DeepMind**
- ShieldGemma.
- Election restriction "still in force a year later" (TechCrunch).
- The Gemini API changelog's two safety entries.
- The second half of the 2.2 note (see errors below).

**Mistral AI**
- safe_prompt and its deprecation.
- The French defence agreement and the chief executive's remarks (two sentences).
- "powers the moderation service in Le Chat".
- 30 days' notice (Commercial Terms).
- The Mistral 3 launch post and the Large 3 model card.
- The FMTI index page figures.
- The Vibe Work and Vibe Code pages.

**Meta**
- CyberSecEval. Partly: ME3, ME9.
- The Krishnaswamy quote (Rest of World).
- "announced as public relations": "to Reuters", and the TechCrunch exclusive of January 2026.
- The Llama 4 licence date.

**xAI**
- The CAISI testing agreement, in three places.
- "X has belonged to xAI since 2025", in two places.
- The Grok 4.7 card of 21 September 2026, in two places.

**Moonshot AI**
- About forty GitHub repositories.
- CAC as author of the labelling rules. Partly: MO3.
- The version number v2. Partly: MO3.
- The K3 chat template. Partly: MO1.

**DeepSeek**
- "of the kind the regulator requires", in profile 1 and the published reading.
- The V4-Pro and V4.1-Flash model cards.
- The V3-0324 card and the R1 README. Partly: DS10.
- The V3.2 and V4 reports having no safety section.

## Wording problems found in passing (no words changed)

**Likely errors**
- **Google, 2.2 note:** section 5.3 of the Frontier Safety Framework summarises only version 3.1, not "what each one changed".
- **OpenAI, profile 2:** "it gives no reasons" overstates. The v2025.09.12 entry gives one.
- **OpenAI:** profile 2 and the 2.3 note describe the GPT-6 Astra card's version citations differently.
- **OpenAI:** the 3.1 and 3.2 notes disagree on whether the change log carries guardrail changes.
- **Anthropic, RSP history:** "each with a summary" may not hold for versions 2.0 and 1.0.
- **Mistral, profile 2:** "three" safety entries, where the changelog shows four.
- **DeepSeek, profile 4:** changes "take effect as soon as they are published" is untrue of the developer agreement (DS7, seven days).

**Points to review**
- **xAI:** the 2.2 note's "that one message" is never named.
- **xAI:** "two Grok incidents" may undercount.
- **xAI:** the 9 January image limit was announced by Grok, not X's Safety account.
- **Meta:** the framework's update trigger is in section 5.1, not Appendix II.
- **Meta:** the spokesperson's statement went to TechCrunch, not Reuters.
- **Moonshot, the engages reading:** it calls the training criteria "internal policies", where MO11 publishes them as rubrics.
- **Alibaba, the 3.2 note:** its 404 claim is unconfirmed.

## Rendering and behaviour

- **`site/markup.js`: `[^OA3]` is a run of its own with no words.** `markupPlain` drops it. `renderInline` and `renderMarkup` draw `<sup class="cite"><a href="#src-OA3">OA3</a></sup>`, and codes written back to back share one superscript with ", " between, so a long run can wrap. The pattern is exported as `CITATION`.
- **`site/governance.js` draws the marked fields through the markup.** Profiles, asides, column readings, findings and looked notes; they were plain text before, and none contained markup by accident (checked). Every quoted passage in a popover shows its code, linking to its entry.
- **"Sources reviewed" is the registry, drawn into the slot `gov-source-list`.** Entries are grouped by company under their own heading, then "More than one company". Each entry, anchored `src-<id>`, shows its code, its title linked to the address in a new tab, its date, its read dates and its quoted passages.
- **Pressing a code, anywhere on the view, brings the reader to its entry.** It closes the popover, opens the section if folded, scrolls to the entry (instant under `prefers-reduced-motion`) and focuses it. It also marks the entry with chartreuse at 25% for 1.6 s, a 150 ms colour change with no transition under reduced motion. An address carrying `#src-XX` opens there too.
- **The section's introduction gained one sentence:** "Each document carries the code the texts on this page cite it by, and the passages we quote from it." The hand-written list is gone.
- **`site/board.css`:** superscripts in the link style (ink, 2px chartreuse underline), codes in mono like the numbered notes, and the entries' layout. `.page-prose a` now takes the framework's link style too. The one existing link in Limitations was a browser-default link before.
- **MCP (`app/lib/board-tools.mjs`):** `governanceBoard` answers `sources`, narrowed to the companies answered plus CO, and every `[^OA3]` in the answer becomes `[OA3]`.
- **The MCP tool description (`app/api/mcp/route.js`) says what the codes are.** Its size figures were stale (it said 90,000 characters; it was about 335,000). They are now measured: about 455,000 characters for all nine and 67,000 to 104,000 for one company. `site/mcp.html` gained one sentence on the codes.

## Tests added

In `tests/test_governance_tab.py`, the class `EverySourceHasACode` checks that:
- codes run 1 to n per company with the right prefix;
- one address maps to one entry;
- every quoted passage has a `ref` whose entry holds the passage;
- every registry quote comes from the evidence or a paper;
- every marker resolves, and nothing looks like a marker without being one;
- every entry is cited, bar the two named;
- a marker follows sentence punctuation;
- a company's texts cite only its own codes or CO;
- the sources section is the slot.

The finding and practice assertions now read texts with their markers stripped (`bare()`, and `plain()` strips them too).

`app/lib/__tests__/markup-citations.test.mjs` is new: it checks that a marker is parsed, stripped and drawn, that grouped codes share one superscript, and that a marker is never read as the start of a link. `board-tools.test.mjs` checks that `sources` is answered, that no `[^` is left, that every code resolves, and that a company argument narrows the sources.

## Files changed

- `site/governance.json`
- `site/governance.js`
- `site/markup.js`
- `site/board.css`
- `site/mcp.html`
- `app/lib/board-tools.mjs`
- `app/api/mcp/route.js`
- `tests/test_governance_tab.py`
- `app/lib/__tests__/board-tools.test.mjs`
- `app/lib/__tests__/markup-citations.test.mjs` (new)

Scripts and work files are in this folder, all named `cite-*`: the build, packet, shared and merge scripts; one packet, marked output and check per company; `cite-original-governance.json`, the file before any change.
