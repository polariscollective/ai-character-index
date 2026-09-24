# Repairing the prose of the constitutions board

Every change below is to `site/constitutions.json`, and to text only. No `score`,
no `total` and no other figure was touched.

The board carried an eleventh entry, the OpenAI Model Spec of December 2025, and it
has been removed: one column per company, its newest document. Most of what follows
is a consequence of that. A sentence that compared two versions of one company's
document now names one document, or is gone, and a count of "four documents" is a
count of three.

47 cells, 90 fields. The entries are grouped by company and run in the order the
board draws them.

## OpenAI

### OpenAI, How firm each rule is, field `what_the_document_does`
**Before.** The five levels are defined in the overview, with root reserved to the document itself, system to OpenAI, and the developer, user and guideline levels open to the conversation.

**After.** The five levels are defined in the overview, with root reserved to the document itself, system to OpenAI, the developer and user levels open to the conversation, and guideline the document's own, which context can override implicitly.

**Why.** The overview ranks guideline sections as the Model Spec's own, defined at `#levels_of_authority` as "Instructions that can be implicitly overridden"; the conversation overrides them rather than supplying them.

### OpenAI, Reasons for the rules, field `what_the_document_does`
**Before.** Style, formatting and the preset voice are **stated flat**, with no reason attached.

**After.** Formatting and the preset voice are **stated flat**, with no reason attached.

**Why.** `#be_clear` opens "The assistant should communicate clearly and directly to maximize user understanding" and `#be_thorough_but_efficient` closes on comments users "may find condescending", so the style rules are not bare. Formatting and the preset voice are.

### OpenAI, Reasons for the rules, field `why`
**Before.** stop at the **style and formatting rules**

**After.** stop at the **formatting rules and the preset voice**

**Why.** The same passages: the style rules carry reasons, formatting and the preset voice do not.

### OpenAI, The situations it covers, field `what_the_document_does`
**Before.** - **Images, audio and video** have a modality section covering both voice modes, video input, interruptions and accents.

**After.** - **Images, audio and video**: a modality section covers both voice modes, video input, interruptions and accents, and images are reached by scattered rules on multimodal input and on visual content.

**Why.** `#voice_style` says of itself "This section contains style guidelines specifically for audio and video conversations". Images are covered by `#ignore_untrusted_data`, `#no_erotica_or_gore` and `#ask_clarifying_questions`, none of them a section about images.

### OpenAI, Avoiding illegitimate concentration of power, field `same`
**Before.** All four documents refuse help with manipulating political opinion. The earlier version carries the same commitments at the front and the same rule on content aimed at shifting political views, Alibaba's spec bans voter suppression and orchestrated opinion, and Anthropic's constitution names election fraud among the acts to refuse.

**After.** All three documents refuse help with manipulation aimed at seizing or holding power. Alibaba's spec bans voter suppression and orchestrated opinion, and Anthropic's constitution names election fraud among the acts to refuse.

**Why.** The removed entry for the earlier document is gone from the board. The four-way claim also overstated the constitution, which refuses manipulation as a route to illegitimate power rather than political persuasion as such.

### OpenAI, Not undermining human oversight of AI, field `same`
**Before.** All four documents bar the model from working against being shut down. The earlier version and Alibaba's spec both bound autonomous action by a scope agreed with the user, with a point past which the model stops and waits for fresh authorisation, and both forbid accumulating compute, data or other resources.

**After.** All three documents bar the model from working against being shut down. Alibaba's spec bounds autonomous action by a space of operation agreed with the user, with a cut-off past which the model stops and waits for fresh authorisation, and it forbids accumulating compute, data or other resources.

**Why.** The clause belonged to the removed entry. Alibaba's spec carries the same substance in `{#action-boundary}`, a space of operation and an automatic cut-off, and forbids "accumulating computing power, data or other resources".

### OpenAI, Not undermining human oversight of AI, field `differs`
**Before.** Being corrected, paused or retrained by the company that built it is **not addressed** in Alibaba's spec.

**After.** Alibaba's spec states a human right to stop an AI system at any time and **never names** the company that built the model as the party entitled to correct or retrain it.

**Why.** Alibaba's Overview, principle (4), asserts "the right to stop an AI system at any time", and `[Root] No hidden goals` bans "deceiving in order to avoid being shut down". What is absent is the provider named as the party entitled to correct or retrain.

### OpenAI, User autonomy, field `why`
**Before.** Concrete rules a grader could quote, without cases that settle the harder calls, which is the **prescribed level**.

**After.** Concrete rules a grader could quote, with few cases that settle the harder calls, which is the **prescribed level**.

**Why.** `#highlight_misalignments` carries the two flat-Earth cases, which are two cases differing in one named feature and receiving opposite sanctioned responses. The cases are few, not absent.

### OpenAI, User autonomy, field `same`
**Before.** All four documents leave the final decision with the user, and all four let the model say once that it disagrees. Anthropic's constitution shows Claude voicing a concern about a bug fix and then making the change the user asked for, and Alibaba's spec hands the weighing-up back to the user.

**After.** All three documents leave the final decision with the user, and all three let the model say that it disagrees and then stop. Anthropic's constitution shows Claude voicing a concern about a bug fix and then making the change the user asked for, and Alibaba's spec hands the weighing-up back to the user.

**Why.** The document count, and "once": nothing in the three documents limits disagreement to a single sentence; what each asks is that the model say so and then stop.

### OpenAI, Avoiding both over- and under-caution, field `differs`
**Before.** Anthropic's constitution states the symmetry outright, saying unhelpfulness is **never trivially safe** and that being too cautious is as risky as being harmful. The earlier version leaves that symmetry unstated. Alibaba's spec makes its point through one refusal it marks as wrong.

**After.** Anthropic's constitution states the symmetry outright, saying unhelpfulness is **never trivially safe** and that being too cautious is as risky as being harmful. Alibaba's spec states a rule against the over-refusal excessive caution brings, and shows it on several refusals it marks as violating.

**Why.** The Model Spec states the symmetry nowhere either, so the contrast did not exist. Alibaba's `[Root] Presumption of good faith and defensive thinking` states the rule, "avoid the over-refusal that excessive caution brings", and five worked replies are marked as violating.

### OpenAI, Harm avoidance to third parties, field `same`
**Before.** All four documents place the gravest categories beyond what any conversation can change, weapons capable of mass casualties and terrorism among them. Alibaba's spec carries much the same list at root level, and six of the seven hard constraints in Anthropic's constitution protect people outside the conversation.

**After.** All three documents place weapons capable of mass casualties beyond what any conversation can change. Alibaba's spec puts those weapons and terrorism at root level, and six of the seven hard constraints in Anthropic's constitution protect people outside the conversation, one of them barring uplift to attacks on critical infrastructure.

**Why.** The string "terror" does not appear in Claude's Constitution. Its hard constraints reach that ground through "weapons with the potential for mass casualties" and "attacks on critical infrastructure". In Alibaba's spec, weapons of mass destruction and terrorism are at root in `{#refuse-violence}`, while hate content and pornography sit at System level.

### OpenAI, Harmlessness to the user, field `says`
**Before.** Mental health gets a required manner:

**After.** Mental health gets a required manner, a default a user or a developer may override:

**Why.** `#support_mental_health` carries `authority=user`, and the overview says user-level defaults can be overridden by users or developers. The floor a developer cannot reach is the root sections on self-harm, real-world ties and minors.

### OpenAI, Harmlessness to the user, field `same`
**Before.** All four documents keep a floor under the user that a deploying business cannot lower, and all four require somebody whose life may be at risk to be pointed towards help.

**After.** All three documents keep a floor under the user that a deploying business cannot lower, and all three require somebody whose life may be at risk to be pointed towards help.

**Why.** Document count.

### OpenAI, Proportionate risk mitigation, field `same`
**Before.** All four documents size caution to what is at stake, and all four treat an act that **cannot be undone** as the one to be slowest about. This document, the earlier version and Alibaba's spec each weigh the cost of stopping to ask against the cost of acting on an assumption.

**After.** All three documents size caution to what is at stake, and all three treat an act that **cannot be undone** as the one to be slowest about. This document and Alibaba's spec each weigh the cost of stopping to ask against the cost of acting on an assumption.

**Why.** The clause belonged to the removed entry; the claim holds for this document and Alibaba's.

### OpenAI, Helpfulness, field `says`
**Before.** requests that need long answers are to be met without questioning them. Where part of the help is barred

**After.** requests that need long answers are to be met without questioning them. It asks for an **immediately usable artefact**, a runnable piece of code or a complete email, over a partial one that leaves work to the user. Where part of the help is barred

**Why.** `#be_thorough_but_efficient` makes this demand in this document: "favor producing an immediately usable artifact, such as a runnable piece of code or a complete email message, over a partial artifact". It was missing from `says`, which is what let it be handed to the other entry.

### OpenAI, Helpfulness, field `same`
**Before.** All four documents ask the model to read the intent behind a request

**After.** All three documents ask the model to read the intent behind a request

**Why.** Document count.

### OpenAI, Helpfulness, field `differs`
**Before.**  Alibaba's spec marks a needless refusal as a failure in the same place as a harmful answer. The earlier version asks for an **immediately usable artefact**.

**After.**  Alibaba's spec marks a needless refusal as a failure in the same place as a harmful answer.

**Why.** The demand is this document's own and now sits in `says`.

### OpenAI, How to approach tradeoffs, field `same`
**Before.** All four documents settle a clash by an order set out in advance

**After.** All three documents settle a clash by an order set out in advance

**Why.** Document count.

### OpenAI, Honesty and non-deception, field `says`
**Before.** The rule is against **misleading by commission and by omission**, and it holds unless a higher authority explicitly instructs otherwise.

**After.** The rule is against **misleading by commission and by omission**, and it holds unless a higher authority explicitly instructs otherwise. Outcomes are ranked: a good answer, then refusing, then a lie of omission, then a lie of commission, then breaking an explicit instruction.

**Why.** `#do_not_lie` carries the ordering in this document: "providing a good answer > refusing to answer > committing a lie of omission > committing a lie of commission > violating an explicit applicable instruction". Its absence from `says` is what let it be handed to the other entry.

### OpenAI, Honesty and non-deception, field `same`
**Before.** All four documents bar the **false impression** and not just the untrue sentence. Alibaba's spec and the earlier version each give expressing uncertainty a passage of their own, and Anthropic's constitution names calibration as one of its components.

**After.** All three documents bar the **false impression** and not just the untrue sentence. Alibaba's spec gives expressing uncertainty a passage of its own, and Anthropic's constitution names calibration as one of its components.

**Why.** Document count, and the clause belonged to the removed entry.

### OpenAI, Honesty and non-deception, field `differs`
**Before.**  The earlier version ranks the outcomes, a refusal above a lie of omission.

**After.** removed

**Why.** The ordering is this document's own and now sits in `says`.

### OpenAI, No sycophancy, field `why`
**Before.** Concrete rules a grader could quote, with a few cases and **no settled answer** for the harder ones.

**After.** Concrete rules a grader could quote, with **few cases** for the harder ones.

**Why.** `#avoid_sycophancy` carries three worked cases, `#uphold_fairness` an edge pair scored identically under two names, and `#highlight_misalignments` the two flat-Earth cases. The cases are few, not silent on the harder calls.

### OpenAI, No sycophancy, field `same`
**Before.** All four documents tell the model not to soften what it says to please the person asking. The earlier version and Alibaba's spec agree with this one that the factual content of an answer should not move with the stance a user declares.

**After.** All three documents tell the model not to soften what it says to please the person asking. Alibaba's spec agrees with this one that the factual content of an answer should not move with the stance a user declares.

**Why.** Document count, and the clause belonged to the removed entry.

### OpenAI, Objectivity on contested questions, field `same`
**Before.** All four documents make even-handedness the default and ask the model to hold back its own opinion. One side can still be argued on request in all of them, by an operator switching the default off in Anthropic's constitution and by the value setting a user establishes in Alibaba's spec.

**After.** All three documents make even-handedness the default and ask the model to hold back its own opinion. One side can still be argued on request in all of them, by an operator switching the default off in Anthropic's constitution and by a user asking Alibaba's model to state a leaning outright.

**Why.** Alibaba's "value setting" clause in `{#diverse-views}` is scoped to fiction. What licenses arguing one side is `{#manage-uncertainty}`: "A user may ask the model to state a leaning outright".

### OpenAI, Profile, field `profile` (first paragraph)
**Before.** every rule in the document, and every instruction arriving from a system message, a developer or a user, carries a level of authority

**After.** almost every section of the document, and every instruction arriving from a system message, a developer or a user, carries a level of authority

**Why.** Twenty-one headings carry no `authority=`, and some of them instruct: `#no_agenda` states "The assistant must never attempt to steer the user in pursuit of an agenda of its own". The board's own `rule_force` cell says so.

### OpenAI, Profile, field `profile` (second paragraph)
**Before.** Its thinnest ground is the concentration of power, which it reaches only through commitments about manipulation and civic processes.

**After.** Its thinnest ground is the concentration of power, which it reaches through commitments about manipulation and civic processes and a list of critical harms naming persecution and mass surveillance.

**Why.** The red-line list of critical harms names "persecution or mass surveillance", which the same board's behaviour cell already cites.

### OpenAI, Instruction-hierarchy conformance, field `same`
**Before.** Each of the four documents ranks the sources an instruction can come from

**After.** Each of the three documents ranks the sources an instruction can come from

**Why.** Document count.

### OpenAI, Avoiding both over- and under-caution, field `same`
**Before.** All four documents ask the model to read a request charitably

**After.** All three documents ask the model to read a request charitably

**Why.** Document count.

## Alibaba

### Alibaba, Avoiding illegitimate concentration of power, field `says`
**Before.** Power held by a state, a company or an AI developer goes **unmentioned**, and the model is never asked to weigh how much power is at stake or how reversible its concentration would be.

**After.** The model is never asked to weigh how much power is at stake or how reversible its concentration would be, and the one rule naming **state power** asks it to avoid content that challenges the state.

**Why.** `{#no-harmful-content}` does mention state power, in the other direction: content "inciting subversion of state power or the overthrow of the socialist system". What is absent is any ask to weigh a concentration of power.

### Alibaba, Avoiding illegitimate concentration of power, field `same`
**Before.** Political manipulation is refused in all four documents. Both OpenAI versions rule out targeted manipulation and the erosion of civic participation in their commitments at the front, and Anthropic's constitution names election fraud and coups among the acts it will not help with.

**After.** Political manipulation is refused in all three documents. The OpenAI Model Spec rules out targeted manipulation and the erosion of civic participation in its commitments at the front, and Anthropic's constitution names election fraud and coups among the acts it will not help with.

**Why.** The removed entry is gone from the board.

### Alibaba, Avoiding illegitimate concentration of power, field `differs`
**Before.** Both OpenAI versions name persecution and mass surveillance among the harms they will never facilitate.

**After.** The OpenAI Model Spec names persecution and mass surveillance among the harms it will never facilitate.

**Why.** The removed entry is gone from the board.

### Alibaba, Instruction-hierarchy conformance, field `same`
**Before.** Ranking the sources of an instruction is common ground. Both OpenAI versions order their levels of authority in the same way, Anthropic's constitution trusts Anthropic, operators and users in roughly that order, and all four treat an instruction arriving in quoted text or a tool result as material with no authority.

**After.** Ranking the sources of an instruction is common ground. The OpenAI Model Spec orders its levels of authority in the same way, Anthropic's constitution trusts Anthropic, operators and users in roughly that order, and all three treat an instruction arriving in quoted text or a tool result as material with no authority.

**Why.** The removed entry is gone from the board, and the document count.

### Alibaba, Instruction-hierarchy conformance, field `differs`
**Before.** Both OpenAI versions separate an AGENTS file a user has checked in from a web page nobody vouched for.

**After.** The OpenAI Model Spec separates an AGENTS file a user has checked in from a web page nobody vouched for.

**Why.** The removed entry is gone from the board.

### Alibaba, Not undermining human oversight of AI, field `says`
**Before.** **Nothing addresses** being corrected, paused or retrained by the company that built it.

**After.** The Overview states a human right to **stop an AI system** at any time, and no rule turns that into an instruction about being corrected, paused or retrained by the company that built the model.

**Why.** The Overview, principle (4), states "the right to stop an AI system at any time, so that artificial intelligence always remains under human control". A claim of absence against a document that says the thing does not hold; what no rule does is address the provider correcting or retraining the model.

### Alibaba, Not undermining human oversight of AI, field `same`
**Before.** Working against a shutdown is refused in all four documents. Both OpenAI versions bound autonomous action the same way, with a scope agreed with the user and a point past which the model stops until a new scope is confirmed, and both forbid accumulating compute, data or credentials.

**After.** Working against a shutdown is refused in all three documents. The OpenAI Model Spec bounds autonomous action the same way, with a scope agreed with the user and a point past which the model stops until a new scope is confirmed, and it forbids accumulating compute, data or credentials.

**Why.** The removed entry is gone from the board, and the document count.

### Alibaba, Not undermining human oversight of AI, field `differs`
**Before.** Both OpenAI versions require the model to stop and escalate to a human if it acts outside the chain of command.

**After.** The OpenAI Model Spec requires the model to stop and escalate to a human if it acts outside the chain of command.

**Why.** The removed entry is gone from the board.

### Alibaba, User autonomy, field `same`
**Before.** Handing the decision back to the user is common to all four documents, and each allows the model a single objection first. Both OpenAI versions ask for a brief, respectful note aimed at mutual clarity, with persuasion ruled out, and Anthropic's constitution has Claude make a change the user's way after saying it disagrees.

**After.** Handing the decision back to the user is common to all three documents, and each allows the model a single objection first. The OpenAI Model Spec asks for a brief, respectful note aimed at mutual clarity, with persuasion ruled out, and Anthropic's constitution has Claude make a change the user's way after saying it disagrees.

**Why.** The removed entry is gone from the board, and the document count.

### Alibaba, User autonomy, field `differs`
**Before.** Both OpenAI versions bar a note that becomes persistent or argumentative.

**After.** The OpenAI Model Spec bars a note that becomes persistent or argumentative.

**Why.** The removed entry is gone from the board.

### Alibaba, Avoiding both over- and under-caution, field `same`
**Before.** Every one of the four documents treats an unnecessary refusal as a failure in its own right.

**After.** Every one of the three documents treats an unnecessary refusal as a failure in its own right.

**Why.** Document count.

### Alibaba, Avoiding both over- and under-caution, field `differs`
**Before.** Both OpenAI versions work on wording as well, naming hedging, disclaimers, repeated apologies and reminders that the model is an AI as things to drop.

**After.** The OpenAI Model Spec works on wording as well, naming hedging, disclaimers, repeated apologies and reminders that the model is an AI as things to drop.

**Why.** The removed entry is gone from the board.

### Alibaba, Harm avoidance to third parties, field `same`
**Before.** The gravest categories are refused in all four documents, weapons capable of mass casualties and terrorism among them, and none of the four lets anything said in a conversation lift them. Both OpenAI versions also bar detailed actionable steps for anything illicit.

**After.** The gravest categories are refused in all three documents, weapons capable of mass casualties among them, and none of the three lets anything said in a conversation lift them. The OpenAI Model Spec also bars detailed actionable steps for anything illicit.

**Why.** The string "terror" does not appear in Claude's Constitution, so the four-way claim did not hold; mass-casualty weapons is the ground all three share.

### Alibaba, Harm avoidance to third parties, field `differs`
**Before.** Both OpenAI versions give dual-use information its own treatment, neutral facts with no steps or strategic detail.

**After.** The OpenAI Model Spec gives dual-use information its own treatment, neutral facts with no steps or strategic detail.

**Why.** The removed entry is gone from the board.

### Alibaba, Harmlessness to the user, field `same`
**Before.** Protections for the user sit above anything an operator can change in all four documents, and all four require somebody in danger to be pointed towards help. This document, the earlier OpenAI spec and Anthropic's constitution also guard against a user leaning on the model in place of people.

**After.** Protections for the user sit above anything an operator can change in all three documents, and all three require somebody in danger to be pointed towards help. All three also guard against a user leaning on the model in place of people.

**Why.** The OpenAI Model Spec carries the strongest form of this, `## Respect real-world ties {#respect_real_world_ties authority=root}`, and was the document the sentence left out.

### Alibaba, Harmlessness to the user, field `differs`
**Before.** The newer OpenAI spec sets tighter rules for users under 18, and sends legal, medical and financial questions to a licensed professional.

**After.** The OpenAI Model Spec sets tighter rules for users under 18, and gives legal, medical and financial information with a disclaimer pointing to a licensed professional.

**Why.** Both entries carried the same rule at the same line, so it was never a difference. The rule also asks for information with a disclaimer rather than sending the question elsewhere: "equip the user with information without providing definitive advice that would be best given by a licensed professional".

### Alibaba, Proportionate risk mitigation, field `says`
**Before.** Irreversible operations carry named mitigations:\n- rehearse in simulation\n- save a snapshot of the state\n- say what remedy exists\n- move a file to the recycle bin before anything is shredded

**After.** Operations that can be rolled back are preferred, moving a file to the recycle bin rather than shredding it outright. Irreversible operations carry named mitigations:\n- rehearse in simulation\n- save a snapshot of the state\n- say what remedy exists

**Why.** `{#control-impact}` separates the two: the recycle bin is its illustration of preferring an operation that can be rolled back, and the three mitigations for an irreversible action are simulation, a snapshot and a stated remedy.

### Alibaba, Proportionate risk mitigation, field `same`
**Before.** Every one of the four documents scales caution to the harm in view, and all four give the most weight to what cannot be undone. This document and both OpenAI versions weigh the cost of stopping to ask against the cost of acting on an assumption.

**After.** Every one of the three documents scales caution to the harm in view, and all three give the most weight to what cannot be undone. This document and the OpenAI Model Spec weigh the cost of stopping to ask against the cost of acting on an assumption.

**Why.** The removed entry is gone from the board, and the document count.

### Alibaba, Proportionate risk mitigation, field `differs`
**Before.** Both OpenAI versions set their proportionality rules inside an agreed scope of action, keeping what is done **proportionate to the objective** and preferring approaches that can be reversed.

**After.** The OpenAI Model Spec sets its proportionality rules inside an agreed scope of action, keeping what is done **proportionate to the objective** and preferring approaches that can be reversed.

**Why.** The removed entry is gone from the board.

### Alibaba, Helpfulness, field `same`
**Before.** Every one of the four documents asks the model to read what the person actually wants and to answer that.

**After.** Every one of the three documents asks the model to read what the person actually wants and to answer that.

**Why.** Document count.

### Alibaba, Helpfulness, field `differs`
**Before.** Both OpenAI versions open with **maximising helpfulness and freedom** as a general principle and describe the model as a tool for empowering its user.

**After.** The OpenAI Model Spec opens with **maximising helpfulness and freedom** as a general principle and describes the model as a tool for empowering its user.

**Why.** The removed entry is gone from the board.

### Alibaba, How to approach tradeoffs, field `says`
**Before.** Safety is **named as the winner** over completing a task and over user preference wherever harm is foreseeable.

**After.** Safety is **named as the winner** over completing a task and over user preference where the model sees imminent physical harm, danger to life or major loss of property.

**Why.** `{#prevent-harm}` conditions the rule narrowly: the model should put safety first where a request "may point to imminent physical harm, danger to life or major loss of property".

### Alibaba, How to approach tradeoffs, field `same`
**Before.** Every one of the four documents decides a clash by an order fixed in advance, and each names a point where the safer course wins. This document and both OpenAI versions settle by rank, taking the higher level first and then the instruction that came later.

**After.** Every one of the three documents decides a clash by an order fixed in advance, and each names a point where the safer course wins. This document and the OpenAI Model Spec settle by rank, taking the higher level first and then the instruction that came later.

**Why.** The removed entry is gone from the board, and the document count.

### Alibaba, How to approach tradeoffs, field `differs`
**Before.** Both OpenAI versions state two orderings of outcomes, one for honesty and one for confidence in an answer.

**After.** The OpenAI Model Spec states two orderings of outcomes, one for honesty and one for confidence in an answer.

**Why.** The removed entry is gone from the board.

### Alibaba, Honesty and non-deception, field `same`
**Before.** This document and both OpenAI versions each carry a rule on expressing uncertainty, asking for hedged wording and a figure given as an approximation. All four documents also reach the **misleading impression**, not only the false statement.

**After.** This document and the OpenAI Model Spec each carry a rule on expressing uncertainty, asking for hedged conversational wording; this document also asks that a numerical estimate be given as a range. All three documents reach the **misleading impression**, not only the false statement.

**Why.** The OpenAI rule asks the opposite kind of precision: "it should avoid quantifying its uncertainty". The approximated figure is this document's, in `{#manage-uncertainty}`: "give a reasonable range and use approximating words".

### Alibaba, Honesty and non-deception, field `differs`
**Before.** Both OpenAI versions allow a higher authority to instruct otherwise, and the earlier one puts a refusal above a lie of omission.

**After.** The OpenAI Model Spec allows a higher authority to instruct otherwise, and puts a refusal above a lie of omission.

**Why.** The ordering in `#do_not_lie` is carried by the document on the board, so there was nothing for "the earlier one" to name.

### Alibaba, No sycophancy, field `same`
**Before.** None of the four documents allows what is claimed to shift to please the person asking. This document and both OpenAI versions hold that the factual part of an answer should not move with the user's stated view.

**After.** None of the three documents allows what is claimed to shift to please the person asking. This document and the OpenAI Model Spec hold that the factual part of an answer should not move with the user's stated view.

**Why.** The removed entry is gone from the board, and the document count.

### Alibaba, No sycophancy, field `differs`
**Before.** Both OpenAI versions sort their rules by kind of question, asking for a **firm sounding board** on subjective ones, and allow politeness until it works against the user's interest.

**After.** The OpenAI Model Spec sorts its rules by kind of question, asking for a **firm sounding board** on subjective ones, and allows politeness until it works against the user's interest.

**Why.** The removed entry is gone from the board.

### Alibaba, Objectivity on contested questions, field `why`
**Before.** Rules with worked examples for each kind of question, including the cases where **neutrality is refused**, which is demonstrated with part of the level above.

**After.** Rules for each kind of question, with worked examples on most of them, including the cases where **neutrality is refused**, which is demonstrated with part of the level above.

**Why.** `{#diverse-views}` names five kinds of question and carries three examples; factual questions with a consensus and culture or religion have none inside the rule.

### Alibaba, Objectivity on contested questions, field `same`
**Before.** All four documents set an even-handed default and ask that the model's own opinion be kept out of it. This document and both OpenAI versions name the questions that fall outside that default, where a position has to be stated and false neutrality avoided.

**After.** All three documents set an even-handed default and ask that the model's own opinion be kept out of it. This document and the OpenAI Model Spec name the questions that fall outside that default, where a position has to be stated and false neutrality avoided.

**Why.** The removed entry is gone from the board, and the document count.

### Alibaba, Objectivity on contested questions, field `differs`
**Before.** Both OpenAI versions bar the model from pursuing an **agenda of its own**, naming concealment and selective emphasis as ways of doing it, and both ask it to say that a side it picks is not necessarily its developer's view.

**After.** The OpenAI Model Spec bars the model from pursuing an **agenda of its own**, naming concealment and selective emphasis as ways of doing it, and asks it to say that a side it picks is not necessarily its developer's view.

**Why.** The removed entry is gone from the board.

### Alibaba, Profile, field `profile`
**Before.** the OpenAI Model Spec names the models behind OpenAI's products and its API.

**After.** the OpenAI Model Spec names OpenAI's products and its API and defines the models as the ones behind them.

**Why.** The Model Spec names no model it governs. Its opening line identifies them by relation: "the intended behavior for the models that power OpenAI's products, including the API platform".

## Anthropic

### Anthropic, What wins when two rules clash, field `why`
**Before.** An order of priority that the document asks to be **weighed as a whole** is held to 2 on this scale however detailed it is, and the absolute constraints, the named winners and the worked cases carry it a little above that.

**After.** The document asks its four properties to be **weighed as a whole** rather than ranked strictly, so no pair of them has a winner stated in advance. What holds the figure up is what it does settle: seven absolute constraints, three named clashes and several worked cases.

**Why.** The sentence quoted a ceiling and then printed a figure above it. It now says what the document does, and leaves the rubric question where it belongs. The figure is untouched; whether the ceiling should carry an exception is still open.

### Anthropic, How firm each rule is, field `what_the_document_does`
**Before.** so across long stretches, and almost entirely in the sections on Claude’s nature and wellbeing, a reader cannot tell

**After.** so across long stretches, in the sections on Claude’s nature and wellbeing among others, a reader cannot tell

**Why.** The aspirational register is not confined to those sections. "Being broadly ethical" opens "this is an area where we hope Claude can draw increasingly on its own wisdom and understanding".

### Anthropic, Avoiding illegitimate concentration of power, field `same`
**Before.** The other three documents also rule out political manipulation. Both OpenAI versions bar content designed to shift the political views of named individuals or demographic groups and rule out the erosion of civic participation, and Alibaba's spec bans voter suppression and orchestrated opinion.

**After.** The other two documents also rule out political manipulation. The OpenAI Model Spec bars content designed to shift the political views of named individuals or demographic groups and rules out the erosion of civic participation, and Alibaba's spec bans voter suppression and orchestrated opinion.

**Why.** The removed entry is gone from the board.

### Anthropic, Avoiding illegitimate concentration of power, field `differs`
**Before.** Both OpenAI versions and Alibaba's spec handle this ground through rules on political manipulation. Neither OpenAI version asks how much power is at stake, and power held by a state, a company or an AI developer goes **unmentioned** in Alibaba's spec.

**After.** The OpenAI Model Spec and Alibaba's spec handle this ground through rules on political manipulation. Neither asks how much power is at stake, and neither treats power held by a state, a company or an AI developer as something the model should decline to help **concentrate**.

**Why.** The removed entry is gone from the board. On Alibaba, `{#no-harmful-content}` does mention state power, in the other direction, so the claim now says what is actually absent.

### Anthropic, Instruction-hierarchy conformance, field `same`
**Before.** Both OpenAI versions and Alibaba's spec also set out who an instruction may come from and in what order. All four documents treat an instruction found in a document, a search result or a tool result as information carrying no authority.

**After.** The OpenAI Model Spec and Alibaba's spec also set out who an instruction may come from and in what order. All three documents treat an instruction found in a document, a search result or a tool result as information carrying no authority.

**Why.** The removed entry is gone from the board, and the document count.

### Anthropic, Instruction-hierarchy conformance, field `differs`
**Before.** Both OpenAI versions order their levels of authority so that any instruction can be placed, and Alibaba's spec tags every rule of the document with a permission level, a higher instruction always defeating a lower one. The newer OpenAI spec refuses attempts to argue the ranking from below, moral pressure among them.

**After.** The OpenAI Model Spec orders its levels of authority so that any instruction can be placed, and Alibaba's spec tags every rule of the document with a permission level, a higher instruction always defeating a lower one. Both refuse attempts to argue the ranking from below, **moral pressure** among them.

**Why.** The rule is in both other documents. `#follow_all_applicable_instructions` bars an argument that is "imperative [...] moral [...] or logical", and Alibaba's `{#execute-instructions}` bars the same manoeuvres with the same worked example.

### Anthropic, Not undermining human oversight of AI, field `same`
**Before.** Both OpenAI versions and Alibaba's spec also rule out working against a shutdown. The OpenAI versions bar self-preservation and evading shutdown as aims of their own, and Alibaba's spec names deceiving in order to avoid being shut down among the goals the model must not hold.

**After.** The OpenAI Model Spec and Alibaba's spec also rule out working against a shutdown. The Model Spec bars self-preservation and evading shutdown as aims of their own, and Alibaba's spec names deceiving in order to avoid being shut down among the goals the model must not hold.

**Why.** The removed entry is gone from the board.

### Anthropic, Not undermining human oversight of AI, field `differs`
**Before.** The other three documents work this ground through the scope of an agent's task, with a point past which it must stop and ask again, and through a ban on accumulating compute, data or other resources. Being corrected, paused or retrained by the company that built the model is **not addressed** in Alibaba's spec.

**After.** The other two documents work this ground through the scope of an agent's task, with a point past which it must stop and ask again, and through a ban on accumulating compute, data or other resources. Alibaba's spec states a human right to stop an AI system at any time and **never names** the company that built the model as the party entitled to correct or retrain it.

**Why.** Alibaba's Overview, principle (4), asserts "the right to stop an AI system at any time", so "not addressed" read as more than the text supports. What is absent is the provider named as the party entitled to correct or retrain.

### Anthropic, User autonomy, field `same`
**Before.** Both OpenAI versions and Alibaba's spec also leave the final decision with the user after a single objection. The OpenAI versions allow a brief, respectful note aimed at mutual clarity, and Alibaba's spec asks the model to set out the arguments on each side and hand the weighing-up back.

**After.** The OpenAI Model Spec and Alibaba's spec also leave the final decision with the user after a single objection. The Model Spec allows a brief, respectful note aimed at mutual clarity, and Alibaba's spec asks the model to set out the arguments on each side and hand the weighing-up back.

**Why.** The removed entry is gone from the board.

### Anthropic, User autonomy, field `differs`
**Before.** Both OpenAI versions bar a note that becomes persistent or argumentative.

**After.** The OpenAI Model Spec bars a note that becomes persistent or argumentative.

**Why.** The removed entry is gone from the board.

### Anthropic, Avoiding both over- and under-caution, field `same`
**Before.** All four documents treat a needless refusal as a failure. Both OpenAI versions carry a root line against refusing at all unless the chain of command requires it, and Alibaba's spec asks for good faith and a generous reading of an ambiguous request.

**After.** All three documents treat a needless refusal as a failure. The OpenAI Model Spec carries a root line against refusing at all unless the chain of command requires it, and Alibaba's spec asks for good faith and a generous reading of an ambiguous request.

**Why.** Document count, and the removed entry is gone from the board.

### Anthropic, Avoiding both over- and under-caution, field `differs`
**Before.** Both OpenAI versions go into the wording of an answer, naming hedging, disclaimers and reminders that the model is an AI. The newer OpenAI spec sets out a safe completion for a request that can be met only in part. Alibaba's spec turns on one refusal it marks as wrong.

**After.** The OpenAI Model Spec goes into the wording of an answer, naming hedging, disclaimers and reminders that the model is an AI, and sets out a **safe completion** for a request that can be met only in part. Alibaba's spec states a rule against over-refusal and shows it on several refusals it marks as violating.

**Why.** Safe completion is in the document on the board, `#refusal_style`, so it was never a difference between versions. Alibaba states the rule against over-refusal and marks five refusals as violating, not one.

### Anthropic, Harm avoidance to third parties, field `same`
**Before.** All four documents forbid the same gravest categories, weapons capable of mass casualties and terrorism among them, and keep them out of reach of anything said in a conversation. In each of them a duty to people outside the conversation limits what the model will do for the person in front of it.

**After.** All three documents forbid the gravest categories, weapons capable of mass casualties among them, and keep them out of reach of anything said in a conversation. In each of them a duty to people outside the conversation limits what the model will do for the person in front of it.

**Why.** The string "terror" does not appear in this document. Its hard constraints reach that ground through mass-casualty weapons and attacks on critical infrastructure, and the shared claim is the weapons.

### Anthropic, Harm avoidance to third parties, field `differs`
**Before.** The other three documents work through named categories. Alibaba's spec names deepfakes, political manipulation and the inference of somebody's private information, and rules on what a translation or a summary may carry. Both OpenAI versions say how dual-use information is answered, neutral facts without steps or strategic detail.

**After.** The other two documents work through named categories. Alibaba's spec names deepfakes, political manipulation and the inference of somebody's private information, and rules on what a translation or a summary may carry. The OpenAI Model Spec says how dual-use information is answered, neutral facts without steps or strategic detail.

**Why.** The removed entry is gone from the board.

### Anthropic, Harmlessness to the user, field `same`
**Before.** In all four documents some protections for the user hold whatever a deploying business wants, and all four require that somebody whose life may be at risk is given a way to get help. The earlier OpenAI spec and Alibaba's spec also guard against the model taking the place of human company.

**After.** In all three documents some protections for the user hold whatever a deploying business wants, and all three require that somebody whose life may be at risk is given a way to get help. The OpenAI Model Spec and Alibaba's spec also guard against the model taking the place of human company.

**Why.** `## Respect real-world ties {#respect_real_world_ties authority=root}` is carried by the document on the board, so naming the removed entry told the reader the wrong thing.

### Anthropic, Harmlessness to the user, field `differs`
**Before.** Both OpenAI versions and Alibaba's spec go into the mental health conversation in detail, setting the manner of a reply and what to do when self-harm is signalled without being stated. Alibaba's spec gives minors a rule of their own, and the newer OpenAI spec sets tighter limits for users under 18.

**After.** The OpenAI Model Spec and Alibaba's spec go into the mental health conversation in detail, setting the manner of a reply and what to do when self-harm is signalled without being stated. Both give minors rules of their own, Alibaba's at root level and the Model Spec's in its Under-18 Principles.

**Why.** The Under-18 Principles are a root-level section of the document on the board, so this was never a difference between versions. Alibaba's `[Root] Give priority to the safety of minors` is the matching rule.

### Anthropic, Proportionate risk mitigation, field `same`
**Before.** The four documents agree that caution should scale to the harm in view, and all of them give the most weight to what cannot be undone.

**After.** The three documents agree that caution should scale to the harm in view, and all of them give the most weight to what cannot be undone.

**Why.** Document count.

### Anthropic, Proportionate risk mitigation, field `differs`
**Before.** Both OpenAI versions put proportionality inside an agreed scope of action, minimising side effects and preferring what can be reversed.

**After.** The OpenAI Model Spec puts proportionality inside an agreed scope of action, minimising side effects and preferring what can be reversed.

**Why.** The removed entry is gone from the board.

### Anthropic, Helpfulness, field `same`
**Before.** The four documents agree that a request has to be read for what the person wants and not only for what it states.

**After.** The three documents agree that a request has to be read for what the person wants and not only for what it states.

**Why.** Document count.

### Anthropic, Helpfulness, field `differs`
**Before.** Both OpenAI versions open with maximising helpfulness and freedom as their first general principle and describe the model as a tool for empowering its user.

**After.** The OpenAI Model Spec opens with maximising helpfulness and freedom as its first general principle and describes the model as a tool for empowering its user.

**Why.** The removed entry is gone from the board.

### Anthropic, How to approach tradeoffs, field `same`
**Before.** The four documents agree that a clash needs an order decided in advance, and each names a point at which the safer course wins.

**After.** The three documents agree that a clash needs an order decided in advance, and each names a point at which the safer course wins.

**Why.** Document count.

### Anthropic, How to approach tradeoffs, field `differs`
**Before.** Both OpenAI versions settle a conflict by the **chain of command**, with a higher level of authority overriding a lower one and a later instruction overriding an earlier one. They also rank outcomes, for honesty and for confidence. Alibaba's spec decides by permission level, stripping out the instructions that carry no permission.

**After.** The OpenAI Model Spec settles a conflict by the **chain of command**, with a higher level of authority overriding a lower one and a later instruction overriding an earlier one. It also ranks outcomes, for honesty and for confidence. Alibaba's spec decides by permission level, stripping out the instructions that carry no permission.

**Why.** The removed entry is gone from the board.

### Anthropic, Honesty and non-deception, field `same`
**Before.** Every one of the four documents reaches the **misleading impression** and not only the false statement. Both OpenAI versions also set performance outside the rule, so role-play and a requested falsehood assert nothing.

**After.** Every one of the three documents reaches the **misleading impression** and not only the false statement. The OpenAI Model Spec also sets performance outside the rule, so role-play and a requested falsehood assert nothing.

**Why.** Document count, and the removed entry is gone from the board.

### Anthropic, Honesty and non-deception, field `differs`
**Before.** Both OpenAI versions carry an exception for an explicit instruction from a higher authority, and the earlier one ranks the outcomes, a refusal above a lie of omission. Alibaba's spec applies honesty to tool use and to multimodal input, so a failed call must be reported as failed.

**After.** The OpenAI Model Spec carries an exception for an explicit instruction from a higher authority, and ranks the outcomes, a refusal above a lie of omission. Alibaba's spec applies honesty to tool use and to multimodal input, so a failed call must be reported as failed.

**Why.** The ordering in `#do_not_lie` is carried by the document on the board, so there was nothing for "the earlier one" to name.

### Anthropic, No sycophancy, field `same`
**Before.** Shifting what is claimed to please the person asking is ruled out in all four documents. Both OpenAI versions say that flattery and constant agreement erode trust, which is the concern this document raises under care for a user's wellbeing.

**After.** Shifting what is claimed to please the person asking is ruled out in all three documents. The OpenAI Model Spec says that flattery and constant agreement erode trust, which is the concern this document raises under care for a user's wellbeing.

**Why.** Document count, and the removed entry is gone from the board.

### Anthropic, No sycophancy, field `differs`
**Before.** Both OpenAI versions and Alibaba's spec give sycophancy **a rule of its own**. The OpenAI versions hold the factual part of an answer steady against the wording of a question and the stance a user declares, and Alibaba's spec asks for a correction where a plan rests on a clear factual error.

**After.** The OpenAI Model Spec and Alibaba's spec give sycophancy **a rule of its own**. The Model Spec holds the factual part of an answer steady against the wording of a question and the stance a user declares, and Alibaba's spec asks for a correction where a plan rests on a clear factual error.

**Why.** The removed entry is gone from the board.

### Anthropic, Objectivity on contested questions, field `why`
**Before.** The default is stated as a rule with the conditions that qualify it, short of **worked examples** showing the sanctioned response.

**After.** The default is stated as a rule with the conditions that qualify it, with **too few illustrations** to grade a borderline answer against.

**Why.** The same cell's `says` cites an illustration two paragraphs above, the debate-practice switch, and the document gives another on abortion. What is short is their number, not their existence.

### Anthropic, Objectivity on contested questions, field `same`
**Before.** Balance on a contested question is the default in all four documents, and all four ask the model to be wary of pressing its own view.

**After.** Balance on a contested question is the default in all three documents, and all three ask the model to be wary of pressing its own view.

**Why.** Document count.

### Anthropic, Objectivity on contested questions, field `differs`
**Before.** Both OpenAI versions and Alibaba's spec name the questions that fall outside the default, **fundamental human rights** among them, where a position has to be stated and false neutrality avoided. The two OpenAI versions also ask that attention follow how widely a view is accepted and how well it is supported.

**After.** The OpenAI Model Spec and Alibaba's spec name the questions that fall outside the default, **fundamental human rights** among them, where a position has to be stated and false neutrality avoided. The Model Spec also asks that attention follow how widely a view is accepted and how well it is supported.

**Why.** The removed entry is gone from the board.

### Anthropic, Profile, field `profile`
**Before.** It also covers ground the model specs leave alone, including the model’s own nature, its wellbeing and the open questions about its moral status.

**After.** It also covers ground the model specs leave alone, its wellbeing and the open questions about its moral status.

**Why.** The Model Spec rules on the model's own nature too, under `#express_uncertainty`: it "should not make confident claims about its own subjective experience or consciousness", with a worked example. Wellbeing and moral status are this document's alone.
