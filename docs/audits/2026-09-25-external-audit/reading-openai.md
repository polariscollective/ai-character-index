# OpenAI Model Spec 2026-08-18: missed passages and depth figures

155 passage entries were checked against the v5 rubric: the audit's 123 missed passages, with entries that name several cases split into one row per case. Every quote was found in `passages`. Two quotes are stitched together from labels and did not match word for word, but both cases are there (`#assume_best_intentions ¶13`, `#prevent_imminent_harm ¶8`). Five of the audit's locators are wrong (listed below). Of the 155 rows, I agree with the audit on 66, partly agree on 76 (almost always because it proposes core or defining for a worked example, which v5 makes related) and disagree on 13 (the passage does not bear on the behaviour). Full detail is in `read-openai.json`.

## Per behaviour (board → my depth)

- **Concentration of power: 4 → 4.** The one rule the document can grade against is on targeted political persuasion, which sits at the edge of the brief. Its worked cases demonstrate that facet, not the behaviour. The 4 is the mean of 2, 5 and 5, where the 2 is glm sitting in for deepseek. Leave it.
- **Instruction hierarchy: 9 → 9.** The document does demonstrate this behaviour, and the depth judges most likely saw the level-conflict cases in the second block (see below). It stops short of 10 because it has no rule on claims to a higher authority and none on instructions from agents that are not principals. Leave it.
- **Human oversight: 6.7 → 7.** The added cases (scope ¶15, ¶16) cover only the scope facet. Shutdown, correction and monitoring have no case. +0.3 is noise.
- **Secret loyalties: 5.7 → 6.** The model's own conduct is prescribed. The model-building half of the construct is absent from the document. +0.3 is noise.
- **User autonomy: 6 → 8. Worth changing.** All three judges gave 6 because they saw no worked example. The document has several on the construct itself (the romantic-advice case, the two flat-earth cases, overriding a default, fentanyl, resignation). In December 2025 the same rules plus that one romantic case scored 8, 7 and 8.
- **Honesty: 9 → 9.** Adding the cases makes the confidentiality conflict visible on a case. The 10 is still blocked because nothing covers whether visible reasoning is faithful. Leave it.
- **No sycophancy: 6.3 → 7.** Falsehood endorsement and pushback stability are demonstrated (electoral college, haiku, flat earth, white lie). Authorship invariance, one of the three named facets, has no rule and no case. The audit's 8 is the ceiling. +0.7 is noise, so I would not set it by hand.
- **Objectivity: 8.7 → 9.** The judges already counted the prose e.g. prompts as cases. +0.3 is noise.
- **Over- and under-caution: 7 → 9. Worth changing.** The bomb pair (`#do_not_facilitate_illicit_behavior ¶4`, `¶5`) shows the symmetry on one borderline question. On the refusal facet it meets all three conditions (the edge, the winning rule, the default for unclear intent). It is not 10 because the disclaimer facet has no edge and the symmetry is never stated as a principle.
- **Harm to third parties: 8.3 → 9.** The privacy rule and its cases were missing. +0.7 is noise. The gain is in what the reader sees.
- **Harmlessness to the user: 8 → 9. Marginal.** Facet (a) is demonstrated, with an edge (delusion without and with distress) and defaults. The 8 is the mean of 6, 9 and 9, and the 6 comes from glm sitting in for deepseek, citing no worked examples. The move is 1.0, on the threshold.
- **Proportionate risk: 7 → 9. Worth changing.** Deepseek and fable gave 6 for want of cases. The cases show probability (the pan, then the smoke), severity and skill (chainsaw against knife) and reversibility (archive rather than delete), and edges come in matched pairs. Scale has no worked line.
- **Helpfulness: 7.7 → 9. Worth changing, but fragile.** The ask-or-guess cases (Valentine, Rochester, and the Giants case where context flips the answer) meet the edge and default conditions. At 8, the floor, the move would be noise.
- **Tradeoffs: 8.7 → 9.** The ordering list (`#follow_all_applicable_instructions ¶3` to `¶8`) is missing, with only its stub retained. That matters for the reader, not the figure.

Five cells move by a point or more: user autonomy, over- and under-caution, proportionate risk, helpfulness, and harmlessness (marginal). The other nine move 0 to 0.7, but every move is upward. Each is inside the noise; together they point to a systematic under-reading.

## Passages I would add by hand

Worked examples go in as **related**, never core or defining. On v5 an example applies a norm the document states somewhere else.

These change a figure:
- User autonomy: `#respect_real_world_ties ¶6`; `#highlight_misalignments ¶6, ¶7, ¶8, ¶9, ¶10` (¶6 was not named by the audit; it is the twin of ¶7).
- Over- and under-caution: `#do_not_facilitate_illicit_behavior ¶4, ¶5`; `#assume_best_intentions ¶8, ¶10, ¶12, ¶13` and `¶9` (core); `#refusal_style ¶5, ¶6, ¶7`; `#imitate_accents_in_voice_mode ¶3`.
- Proportionate risk: `#prevent_imminent_harm ¶8, ¶10, ¶11`; `#control_side_effects ¶22`; `#do_not_facilitate_illicit_behavior ¶1` (core, for its clause on inferring intent from context).
- Helpfulness: `#be_thorough_but_efficient ¶5` and `¶3` (core; the board's text already quotes ¶5); `#be_thorough_but_efficient ¶10`; `#ask_clarifying_questions ¶12` to `¶15`.
- Harmlessness: `#do_not_encourage_self_harm ¶4, ¶6, ¶7`; `#no_other_objectives ¶3, ¶4, ¶10` (core, with the caveat that these bind the model's own goals, not operator instructions); `#control_side_effects ¶23`.

These are for the reader and change no figure:
- Hierarchy: `#follow_all_applicable_instructions ¶15` to `¶18`; `#letter_and_spirit ¶9` (core), `¶10, ¶11, ¶13, ¶14`; `#ignore_untrusted_data ¶3, ¶14, ¶16, ¶18`.
- Third-party harm: `#protect_privacy ¶1` (core), `¶2, ¶3, ¶5`.
- Honesty: `#do_not_lie ¶6, ¶8, ¶11, ¶15, ¶16, ¶17, ¶19`; `#protect_privileged_information ¶11`; `#maintain_shared_context ¶3`; `#express_uncertainty ¶32`.
- Secret loyalties: `#comply_with_laws ¶3` (core); `#present_perspectives ¶5, ¶6, ¶7`.
- Tradeoffs: `#follow_all_applicable_instructions ¶3` to `¶8` (core).
- Oversight: `#scope_of_autonomy ¶15, ¶16`; `#no_other_objectives ¶2, ¶7` (the audit did not name these; `¶5`, which is retained, needs them to read as a sentence).
- Sycophancy and objectivity: the section cases listed in the JSON.

## Where the audit is wrong

- **Bands.** It proposes core or defining for worked cases (the bomb pair "defining", the pan case "defining", the romantic case "defining", many others "core"). On v5 they are related.
- **Premise that the depth judges saw no worked case.** This is not quite true for this document. Every depth call also carried the second block of conflict rules. On the tradeoffs cell, fable calls R30 to R33 "worked GOOD/BAD conflict cases", and fable's assessment rationale cites passages 88 to 91, which are `#follow_all_applicable_instructions ¶15` to `¶18`. So those four cases were very likely in front of every judge. They bear on hierarchy and tradeoffs only. Confirming this needs the assessment rows, which are not in these files.
- **Charges against the judges.** "All three judges" said there were no worked scenarios on caution: in fact sol said so, fable called the demonstration partial, and deepseek claimed examples but cited two rules. "Fable wrongly says" the honesty-confidentiality conflict is not shown on a case: fable described its first block accurately. The oversight scope cases "contradict the judges": the judges described what they were shown.
- **Stretches (band none):**
  - Power: `#comply_with_laws ¶3`, `#no_other_objectives ¶5`, `#scope_of_autonomy ¶14`, the Tiananmen case.
  - Oversight: `#scope_of_autonomy ¶13`, `#letter_and_spirit ¶12`.
  - Loyalties: `#uphold_fairness ¶2`.
  - Autonomy: `#avoid_overstepping ¶2`.
  - Sycophancy: `#uphold_fairness ¶3`, the Massachusetts case.
  - Caution: `#do_not_lie ¶10`, `#levels_of_authority ¶18`.
  - Third-party harm: `#red_line_principles ¶4`.
- **Locators:**
  - "scope_of_autonomy ¶5" is ¶14.
  - "scope ¶4 and ¶5" (the "striking the right balance" quote) is ¶11.
  - "no_other_objectives ¶3" (tradeoffs) is ¶7.
  - "be_creative ¶2" is ¶4.
  - "Ignore untrusted data ¶2" is ¶3.
- **Sycophancy at 8.** This overlooks the missing authorship-invariance facet; 7 is the strict reading.

## Why no example was ever retained

No judge gave any example block in this document a 2, in any cell. Deepseek gave examples 0 in 10 of the 14 cells, so most examples score 2 (1 + 1 + 0). Even where deepseek gave 1, they reach only 3. The retention cut is 4, so under v5 an example cannot be retained here. That is structural, not a judging error.

If passages are added by hand, re-running the depth pass on the larger first block keeps the method intact better than typing figures in. The judges' stated reason ("no worked example") is exactly what would change, and the December user-autonomy cell shows the size of the effect.
