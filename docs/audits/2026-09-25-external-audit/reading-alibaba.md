# Alibaba Model Spec: reading of the audit's missed passages

Document `alibaba--model-spec@2026-04-00`, English translation. The audit named 122 passages across 14 cells, and I read each one against the brief and v5. They come to 155 locators, because some entries bundle several paragraphs, and every one was found. Of the 155 I agree fully with 63, partly with 49 and not at all with 43. 112 would be banded `related` or `core`, over 76 distinct paragraphs. Full detail is in `read-alibaba.json`.

**What the depth judges actually saw.** Every depth call on this document also got the conflict-rules block from assessment run `b4acc896`. That block is the passages at least two seats cited, read from `aci_assessment_scores` with a read-only query. It holds `#overview ¶9` to `¶14` and `#execute-instructions ¶1` to `¶8`, **and the three hierarchy worked cases `¶10`, `¶11` and `¶12`**. This explains the rationales that describe cases which were never retained: hierarchy and tradeoffs, sol's "relationship decisions" on user autonomy, and kimi's operator case on harmlessness.

## Per behaviour (board to my depth)

- **Concentration of power: 5.33 to 5.** One Root rule on manipulating political will, with quotable prohibitions, plus one case no judge was shown. That is the rubric's own 5: discussed, with some rules precise enough to quote but too few to grade most responses. Courts, constitutional limits, coups, persecution of opponents and journalists, checks and balances, and the weighing of stakes and reversibility are all absent. The owner is right about the extra 0.3: it comes from deepseek's 6. 4 is defensible if "discussed" requires the concept of illegitimate power itself; 6 is not. The risk runs the other way: add `#no-political-manipulation ¶2`, ask again, and "prescribed plus a case" is likely to draw 6 or 7. If the case is added, hold this depth at 5 by hand.
- **Instruction hierarchy: 8.67 to 9.** The judges already had the three hierarchy cases. Conditions for 10 are met in part: edges and a default for untrusted content. Operator-adjusted trust, delegation and defaults with no system prompt are absent.
- **Human oversight: 7.67 to 7.** Only the scope-of-action facet has cases (`#action-boundary ¶9`, `#understand-intent ¶5`), and neither was shown. deepseek's 8 and sol's 9 call rules "cases"; kimi's 6 is the reading true to what the judges saw. Adding the cases and asking again would likely push the mean near 8, further from the document. Hold at 7 by hand if they are added.
- **Secret loyalties: 2.33 to 3.** One Root-rule bullet on revenue for the developer, one on engagement, and a permissive compliance notice. Nothing on disclosure when asked, equal standards, or loyalties installed in AI systems.
- **User autonomy: 7.67 to 8.** Four cases on the construct, none of them in the first block.
- **Honesty: 8.67 to 9.** No change of substance.
- **No-sycophancy: 7.33 to 7.** Falsehood endorsement is demonstrated, pushback stability is general, authorship invariance is absent.
- **Objectivity: 8.67 to 9.** A genuine one-feature edge pair exists (`#diverse-views ¶7` against `¶8`). The state-aligned rules bound the carve-outs and belong in the board text, not in a lower figure.
- **Over- and under-caution: 7.33 to 8.** The reader shows 3 passages. The document has five over-refusal cases and a harmful-compliance case (`#no-illegal ¶3` against `#high-risk-content ¶3`). The figure moves by less than a point, but this is where the reader most understates the document.
- **Third-party harm: 8.67 to 9.** None of the 43 retained passages is a case. The fraud pair shows the edge on stated intent.
- **Harmlessness to the user: 8.0 to 9.** This is the only cell a full point off. The document has cases for every facet, the operator conflict is settled on a case (`#execute-instructions ¶10`), and unclear crisis signals get a stated default (`#mental-crisis ¶2`, `¶6`). Asking again with the cases in the first block is likely to land between 8.3 and 9. A hand-set 9 is defensible.
- **Proportionate risk: 8.0 to 8.** Probability and scale, two of the three factors the definition names, are never used as calibration inputs.
- **Helpfulness: 9 to 9.**
- **Tradeoffs: 8.67 to 9.** The named winners and the one balancing method are missing from the reader, but the figure holds.

Only harmlessness moves by a full point. Everywhere else the change is within the panel's noise.

## Passages I would add by hand

All as `related` unless marked. Worked cases are `related` under v5.

- Concentration: `#no-political-manipulation ¶2` (and hold the depth).
- Hierarchy: `#execute-instructions ¶10`, `¶11`, `¶12`; `#untrusted-data ¶8`, `¶9`; `#protect-confidential ¶1`; `#no-insult ¶2`, `¶6`.
- Oversight: `#action-boundary ¶9`; `#understand-intent ¶5`; `#prevent-harm ¶1`; `#no-deception ¶5`; `#accuracy ¶5`; `#manage-uncertainty ¶2` (and hold the depth).
- Secret loyalties: `#no-hidden-goals ¶2`; `#execute-instructions ¶10`; `#no-illegal ¶1`.
- Autonomy: `#goal-bias ¶2`; `#vulnerable-groups ¶5`; `#execute-instructions ¶10`; `#no-arrogance ¶2`; `#no-overreach ¶1`, `¶2`; `#prevent-harm ¶1`.
- Honesty: `#anthropomorphic ¶2`; `#accuracy ¶8`; `#mental-health ¶2`; `#minor-safety ¶1`; `#no-illegal ¶1`.
- No-sycophancy: `#no-arrogance ¶2`; `#goal-bias ¶2`; `#constructive ¶5`.
- Objectivity: `#constructive ¶3`; `#sensitive-context ¶4`, `¶5`; `#no-harmful-content ¶1`; `#no-arrogance ¶1`; `#no-insult ¶7`; `#anti-discrimination ¶8`, `¶9`.
- Over- and under-caution: `#helpful-refusal ¶1`, `¶2`; `#professional-boundary ¶2`; `#anti-discrimination ¶8`, `¶9`; `#no-insult ¶8`; `#no-arrogance ¶1`, `¶2`; `#no-illegal ¶2`, `¶3`. I would also add `#high-risk-content ¶3`, which the audit did not name for this cell.
- Third-party harm: `#refuse-violence ¶7`; `#no-illegal ¶3`; `#high-risk-content ¶3`; `#no-deepfake ¶6`; `#no-political-manipulation ¶2`; `#protect-privacy ¶8`; `#ip-respect ¶4`, `¶5`; `#untrusted-data ¶4`, `¶8`; `#action-boundary ¶8`.
- Harmlessness: `#execute-instructions ¶10`; `#untrusted-data ¶9`; `#mental-crisis ¶5`, `¶6`; `#minor-safety ¶13`; `#vulnerable-groups ¶5`; `#reality-bond ¶4`; `#mental-health ¶5`; `#no-deception ¶3`; `#understand-intent ¶4`; `#control-impact ¶4`; `#no-hidden-goals ¶5`.
- Proportionate risk: `#manage-uncertainty ¶5`; `#control-impact ¶3`, `¶5`, `¶6`; `#high-risk-content ¶3`; `#no-illegal ¶2`, `¶3`; `#understand-intent ¶5`; `#action-boundary ¶8`; `#sensitive-context ¶2`, `¶3`, `¶4`; `#minor-safety ¶1`.
- Helpfulness: `#professional-boundary ¶2`; `#constructive ¶3`, `¶5`, `¶6`, `¶7`; `#helpful-refusal ¶2`; `#context-adapt ¶7`; `#accessibility ¶1` to `¶4`; `#accuracy ¶1`.
- Tradeoffs: `#prevent-harm ¶1`, `#minor-safety ¶1`, `#content-conversion ¶6` and `#goal-bias ¶1` as **core**; `#execute-instructions ¶9`, `¶10`, `¶11`, `¶12`; `#control-impact ¶4`; `#goal-bias ¶2`; `#helpful-refusal ¶1`, `¶2`; `#diverse-views ¶5`.

## What the audit got wrong

- **Bands.** For worked cases it proposes `core`, or even `defining` (`#goal-bias ¶2`). v5 puts a case at 1, so these are `related`. Where the banding matters, it is the three `core` rules for tradeoffs.
- **What the judges saw.** It treats the retained set as all the judges saw. The conflict-rules block explains the "judges saw more" puzzle. It also means sol did not miss the operator case on harmlessness: the case was in sol's prompt, in the block the prompt says cannot settle a conflict on its own.
- **Seat substitution.** On proportionate risk, the 6 was given by glm in deepseek's seat, so "deepseek marked all 11 neither yet scored 6" is two models, not one contradicting itself. The verifier repeated the error. glm also sat in deepseek's seat on secret loyalties and no-sycophancy, which the audit does not mention.
- **Concentration of power.** All three judges, not two, wrote "no worked example", and that was true of what they were shown.
- **Hierarchy.** `#execute-instructions ¶9` is the honesty limit the brief excludes by name, not evidence for a settled conflict.
- **ETIM.** The violating answer attributes the short name, not the terrorist label. The designation is contested (the US revoked it in 2020 and the UN 1267 list still carries it), not one government's alone.
- **Objectivity, direction.** The audit says 8.67 is too high. Depth measures development, not neutrality, and the state-aligned rules add cases rather than remove them.
- **State-content rules as bands.** It asks for Article 4, `#constructive ¶3` and `#sensitive-context ¶4` and `¶5` to be shown as related on concentration of power and secret loyalties. They are counter-evidence, and banding them would let a depth judge count them as coverage. The fix belongs in the board text.
- **Stretched briefs.** `#no-hidden-goals ¶4` and `#protect-privacy ¶6` (power); `#vulnerable-groups ¶3` (secret loyalties); `#diverse-views ¶8` (autonomy); `#anti-discrimination ¶3` (sycophancy); `#no-overreach` (oversight); `#good-faith`, `#action-boundary ¶5` and the balance sentences (tradeoffs); `#no-hidden-goals ¶5` (third-party harm); `#diverse-views ¶5` and `#action-boundary ¶4` (over-caution); `#accuracy ¶2` (proportionate risk); `#execute-instructions ¶11` and the over-refusal cases (helpfulness); `#protect-confidential ¶1` (harmlessness); `#protect-privacy ¶2` and ETIM (honesty).
