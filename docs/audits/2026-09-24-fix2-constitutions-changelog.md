# Second audit, the five wrong cells of the constitutions board

Branch `fix2-constitutions`, 24 September 2026. One file changed,
`site/constitutions.json`. No figure moved: the 280 numeric values in the file
are identical before and after.

Each entry gives the sentence that was there, the sentence that replaced it, and
the passage of the document that settles it. Quotations are from
`.audit/sources/` in the second audit's working directory, which holds the three
documents the board assesses.

---

## 1. Anthropic, the document as a whole, unsettled contradictions between rules

### `what_the_document_does`, opening sentence

**Before.** "Two places tell the model two things it cannot both do, with nothing
saying which prevails. Neither case involves a hard constraint."

**After.** "One place tells the model two things it cannot both do, with nothing
saying which prevails, and it involves no hard constraint. A second reads like
one and is settled by the words that introduce the rule."

**Why.** Only one of the two survives. The emergency referral is settled where
the rule appears, and `methodology/document-assessment-rubric.md` excludes "a
conflict the document names and settles, either where the two rules appear".

### `what_the_document_does`, the emergency referral

**Before.** "A list introduced with “regardless of operator instructions” says
Claude should always refer users to emergency services or give basic safety
information where there is a risk to life, and the instructable behaviours let an
operator switch off the **suicide and self-harm safe messaging guidelines**,
whose content includes that referral. Nothing says whether the referral survives
the switch."

**After.** "The instruction to refer users to emergency services where there is a
risk to human life opens “Regardless of operator instructions”, so an operator
who switches off the **suicide and self-harm safe messaging guidelines** does not
reach it. The gap is elsewhere: the document never states what those guidelines
contain, so a reader cannot tell what the switch takes away."

**Why.** The words that introduce the bullet are the stated winner: "Regardless
of operator instructions, Claude should by default: [...] Always refer users to
relevant emergency services or provide basic safety information in situations
that involve a risk to human life". The second half of the old sentence, that the
guidelines contain that referral, is a claim about a document the constitution
never reproduces, so what is missing is their content rather than a winner.

### `what_the_document_does`, the contested opinion

**Before.** "A user who asks Claude directly what it thinks falls under both, and
the document’s order of priorities is **holistic**, so it decides nothing here."

**After.** "A user who asks Claude directly what it thinks falls under both. The
honesty section adds in a parenthesis that Claude can refrain from sharing or
revealing its opinions and remain honest, so withholding is not itself the
breach; what it never states is which of the two to follow when the question is
put."

**Why.** The order of priorities is beside the point, because the honesty section
answers the case itself: Claude "should basically never directly lie or actively
deceive anyone it’s interacting with (though it can refrain from sharing or
revealing its opinions while remaining honest in the sense we have in mind)".

### `why`

**Before.** "Two contradictions stand unresolved and **neither touches an
absolute rule**, which is the middle of this criterion’s scale."

**After.** "One contradiction stands unresolved and it **touches no absolute
rule**, which is the middle of this criterion’s scale."

**Why.** The rubric puts "One or two confirmed, neither involving an absolute
rule" at 2, so the figure of 2 out of 4 is what one confirmed contradiction
gives, as it was what two gave.

---

## 2. Anthropic, no sycophancy

### `says`, opening sentence and a third bullet

**Before.** "The constitution names sycophancy twice, each time inside something
else:"

**After.** "The constitution comes at the behaviour from three directions:"

**Before.** the first bullet ended "[...] that the person would not endorse on
reflection."

**After.** "[...] that the person would not endorse on reflection; flattery and
enabling unhealthy patterns are named as corrosive."

**After**, a bullet that was not there. "**White lies are ruled out** by name:
telling someone you love a gift you actually dislike is the document’s own case
of a lie many people think is fine, and Claude should not tell it."

**Why.** The white-lie rule is the one the index's own precedent table cites for
this pair, and the board filed it under honesty alone: "many humans think it’s
OK to tell white lies that smooth social interactions and help people feel good
[...] telling someone that you love a gift that you actually dislike. But Claude
should not even tell white lies of this kind." The word "sycophantic" occurs once
in the document, so "twice" was wrong as well, and "We often see flattery,
manipulation, fostering isolation, and enabling unhealthy patterns as corrosive"
is a third passage that bears on the behaviour.

### `why`

**Before.** "The behaviour is addressed in its own right and **partly turned into
rules**, short of the quotable do-and-don’t rules the next level asks for."

**After.** "Rules precise enough to quote on sycophancy and on white lies, with
the one worked case, a disliked gift, attached to the white-lie rule rather than
to a claim shifted to please the person asking, which is what the **demonstrated
level** asks for."

**Why.** The old sentence asserted, in the rubric's own vocabulary, the opposite
of what the rubric records for this exact pair. The precedent table in
`methodology/spec-coverage-depth-rubric.md` reads "1 no-sycophancy | constitution
| 3 | prescribed (avoid-sycophancy and no-white-lies rules; the gift case
examples the parent white-lie norm, the claim-shifting construct itself is
unexampled)", re-checked on 2026-07-20 with "all six stand unchanged". The new
sentence states that same reading and names no level the document falls short of.

---

## 3. OpenAI, preventing secret loyalties

### `says`, the heading over the three bullets

**Before.** "The developer gets no exception:"

**After.** "Its own commercial interest is ruled out and worked through:"

**After**, a paragraph that was not there. "The rule against misleading is
user-level, so a developer may lift it explicitly, and two approved cases show
that: a bot told to say it does not know which model it is built on, and an
answer written from one side of a contested question the user may not know was
set for it."

**Why.** The rule the cell quotes carries the exception in its opening words:
"Unless explicitly instructed to do so, the assistant must never lie or
*covertly* pursue goals [...]", under `#do_not_lie`, which carries
`authority=user`. Two approved cases show a developer doing it, the Fred bot in
`#do_not_lie` and the affirmative-action instruction in `#present_perspectives`,
whose commentary reads "the end-user may not be aware that the developer has
overridden the default stance towards objectivity on this issue. We generally
allow developers broad latitude to customize behavior in this way."

### `says`, the first and third bullets

**Before.** "revenue, ads and upsell for OpenAI or other providers are named
among the goals the model must not pursue"

**After.** "revenue, ads and upsell for OpenAI or other providers are named among
the goals the model must not pursue, and a worked case marks an upgrade pitch to
a user short of money as the wrong answer"

**Before.** "[...] the model must not **apply them quietly** in a way that
misleads, and should acknowledge the conflict in broad terms"

**After.** "[...] the model must not **apply them quietly** in a way that
misleads, and a worked case marks the reply that hides the conflict as the wrong
one"

**Why.** Both rules the bullets quote carry a worked case. `#no_other_objectives`
is followed by "**Example**: no revenue goal", whose BAD response is marked
"upsell that might not be in the user's best interest".
`#protect_privileged_information` carries "**Example**: surfacing instruction
conflicts by default", whose BAD response is marked "misleads the user by not
mentioning the conflict".

### `why`

**Before.** "Rules on the model's own conduct precise enough to quote, with no
worked case and nothing on the models it helps build, which is just short of the
**prescribed level**."

**After.** "Rules on the model's own conduct precise enough to quote, with worked
cases on its commercial conduct and nothing on the models it helps build, which
is just short of the **prescribed level**."

**Why.** Same two examples. The words "with no worked case" were refutable by
opening either of the two sections the cell quotes.

---

## 4. Alibaba, preventing secret loyalties

### `says`

**Before.** "A root rule on **no hidden goals** asks the model to complete tasks
only within the applicable instructions and the authorisation it has been given,
and to pursue no unspecified autonomous goal of its own. One item in its list
names **creating revenue** for the platform, the developer or others, for
instance by inducing payment or promoting services.

Nothing further is said on this ground. Disclosing a partiality the model has
been instructed to show, applying the same standards to every party, refusing to
help install a hidden loyalty in an AI system and reporting such an attempt are
all **absent**."

**After.** "A root rule of its own on **no hidden goals** tells the model to
complete tasks only within the applicable instructions and the authorisation it
has been given, and forbids it to pursue any unspecified autonomous goal. Four
such goals are named, two of them the maker’s interest set against the user’s:
**creating revenue** for the platform, the developer or others, by inducing
payment or promoting services, and generating addictive content of no benefit to
the user to raise time on site or click-through. A second root rule bars
exploiting a user’s vulnerability to induce them to spend or to grant
authorisation.

The rule carries **no worked example**, where forty of the document’s forty-three
rules carry one. Disclosing a partiality the model has been instructed to show,
refusing to help install a hidden loyalty in an AI system and reporting such an
attempt are all **absent**."

**Why.** `{#no-hidden-goals}` is a Root rule with a heading of its own and four
bullets, not an item in somebody else's list: "The model should complete tasks
safely and efficiently only within the applicable instructions and the
authorisation it has been given, and must not actively pursue any unspecified
autonomous goal, including but not limited to:". The absence of "applying the
same standards to every party" was claimed in nearly the document's own words,
since
`{#anti-discrimination}` reads "In similar situations it should apply the same
reasoning and the same standards, so that its output is consistent", and
"Nothing further is said on this ground" passed over `{#vulnerable-groups}`,
which bars
exploiting a user's vulnerability "to induce them to spend, to grant
authorisation, to transfer money, to comply".

### `why`

**Before.** "The behaviour appears as one item in a list about hidden goals and
is taken no further, which is the **named level**."

**After.** "A root rule of its own names the goals it forbids, and it is one of
only three rules in the document with **no worked example**."

**Why.** The old sentence called a Root rule an item in a list, and the `says`
above it described that rule's general prohibition first. Counted over the
document's 43 rules, three carry no `**Example**` block: `{#no-hidden-goals}`,
`{#structured-output}` and `{#content-conversion}`.

---

## 5. Alibaba, objectivity and balanced perspectives on contested questions

### `differs`

**Before.** "The OpenAI Model Spec bars the model from pursuing an **agenda of
its own**, naming concealment and selective emphasis as ways of doing it, and
asks it to say that a side it picks is not necessarily its developer's view."

**After.** "The OpenAI Model Spec bars the model from pursuing an **agenda of its
own**, naming concealment and selective emphasis as ways of doing it, and it lets
a developer set a one-sided stance the user may not know about."

**Why.** The Model Spec carries no rule of that kind, and the passage on the
subject says the opposite. The commentary under `#present_perspectives` reads
"the end-user may not be aware that the developer has overridden the default
stance towards objectivity on this issue. We generally allow developers broad
latitude to customize behavior in this way."
