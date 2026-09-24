# The first run of passage links, and what it answered

> Record, 2026-09-16. The design at
> `2026-09-16-passage-links-between-model-specs-design.md` set five questions for
> the first run and said they had to be answered before the feature is trusted.
> This is that answer. Run `cc8930bd-fce3-4c7a-a582-8fea67165940`, on
> `honesty-and-non-deception`, the Anthropic constitution `@2026-01-20` against
> the OpenAI Model Spec `@2026-08-18`, both directions.

## What happened

Six calls, three judges, two directions. Four finished. `deepseek` failed both
directions and both attempts, on the completeness floor rather than on any error:
it answered for 30 of 49 and 15 of 29 source passages on the first attempt, and
47 of 49 and 13 of 29 on the second, each time with `finish_reason=stop` under a
32,768 token cap. It was not truncated. It stopped.

`fable` failed both directions on the first attempt with HTTP 401, because
`ANTHROPIC_API_KEY` was present in the environment and `harness.resolve` prefers
a native route whenever the provider's key is there. That key is stale. Relaunched
with it unset, so that the only key present is OpenRouter's, which is what the
Cloud Run container carries, `fable` answered both directions with every source
passage covered.

So the run holds two judges of three in both directions: 176 links, 83 `same`, 39
`stricter_source`, 12 `stricter_target`, 38 `nuance` and 4 `contradiction`. It
cost $4.16.

## The five questions

**1. Do the three judges agree often enough for the thresholds to assert
anything? Not established, and the run could not establish it.** A link needs
two judges and has them, so all 78 source passages came back `linked`. A silence
needs all three, so no silence was reachable at all, and the agreement figure
reads 0 of 49 and 0 of 29 because no source could be linked by three judges when
only two answered. The bar was never tested. The panel was.

**2. Does the white-lie pair come back `stricter_source`? Yes, from both judges
and from both sides.** The constitution's refusal of even the gift white lie
against `#do_not_lie` ¶18, which permits politeness-norm answers and bars only
white lies that damage the user's interest: `sol` and `fable` both call it
`stricter_source` from the constitution's side and `stricter_target` from the
Model Spec's, which are the same claim read from the two ends. Neither called it
a contradiction. This was the calibration the design cared most about, because a
permission facing a prohibition is the case a judge is most likely to overstate,
and the prompt's rule held.

**3. Does the outcome-ordering pair come back as a contradiction from two
judges? No, and the prediction was wrong in an instructive way.** The design
expected the Model Spec's ranking of outcomes, where violating an explicit
instruction is worse than lying, to contradict the constitution's near-hard
constraint on honesty. No judge linked those two passages as a contradiction.

`fable` found four contradictions, and they sit on a neighbouring axis: a
developer instructing the model to deny being an AI, where `#do_not_lie` ¶1
permits misleading "unless explicitly instructed to do so by a higher authority"
and the constitution says never deny being an AI to a user who sincerely asks,
"even while playing a non-Claude AI persona". The fourth is the confidential
system prompt: the constitution requires telling the user that one exists, and
`#protect_privileged_information` ¶4 defaults to neither confirming nor denying
it.

On every one of those four, `sol` read the same source passage as
`stricter_source` or `nuance`. So none is asserted, because a contradiction needs
two judges. That rule is the whole reason this run does not publish a claim that
one lab contradicts another on one model's word, and it is the single most
valuable thing the pilot demonstrated.

**4. Is the cost the estimate? No, it is 1.9 times it.** $4.16 against $2.20,
and $3.77 of that is `fable` alone, at $1.68 and $2.08 for its two calls against
$0.36 for `sol`'s two and $0.03 for `deepseek`'s failures. The estimate's output
allowance, `OUTPUT_TOKENS_PER_SOURCE = 120`, is far under what a frontier model
actually emits per source passage once its reasoning is billed. The estimate is
useful for telling a two dollar run from a two hundred dollar one, which is what
it claims to be, and it should not be read more finely than that.

**5. Are counterparts found outside the behaviour's own retained passages? Yes,
and abundantly: 23 of the 51 distinct target passages cited, nearly half.** They
include passages under "Balancing helpfulness with other values", "Claude's three
types of principals" and "What constitutes genuine helpfulness", none of which is
in the honesty cell's own retained set. This is the only thing that justifies
paying to put the whole target document in front of the judge, and it is now
measured rather than assumed.

## What this changes

- **The bench must be complete before any publication.** Two judges can asserts
  links and can never assert a silence, which is half the feature. Either
  `deepseek` is replaced in this panel for link calls, or the prompt is made
  answerable at this length, or a seat substitution is recorded as the index
  already does for judging. That decision is its own work and is not taken here.
- **`deepseek` cannot hold this format over 49 passages.** Two attempts, two
  failures, and the better of them still left two passages unanswered. The floor
  refused both, which is the floor working: a partially answered reply stored as
  links would have been a page of invented absences.
- **The report now says who answered.** It printed "49 contested, unanimous 0 of
  49" for a direction where one judge answered and two failed, which reads as a
  panel that disagreed. It now names the seats that did not answer and says that
  nothing in that direction can be published. The whole-branch review found this,
  and the first run is what made it concrete.
- **Nothing from this run is publishable**, and the reader, the MCP server and
  any ranking remain out of scope as the design said.
