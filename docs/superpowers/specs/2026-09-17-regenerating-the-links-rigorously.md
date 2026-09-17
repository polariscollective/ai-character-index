# Regenerating the links, rigorously

Written 17 September 2026, at the end of the session that produced the links the
index now serves. Not a plan and not a decision: a record of how this run was
actually made, what was wrong with it, and what a defensible second run would
require. Whoever does that run should disagree with parts of this.

## What was done, plainly

Four pairs of documents, thirteen behaviours each, judged in both directions.
One seat: `opus-5`, answering in a Claude Code session through question and
answer files rather than through a provider. 3,052 links, 170 arbitrations, 52
comparison paragraphs, 430 passage paragraphs, 39 depth paragraphs, 39 standing
passages. No API spend, and no metered cost: every row reads `finish_reason`
`in-session` with `cost_usd` null, which is what says so.

## What is wrong with it, and should be said before it is cited

**One judge is not a panel.** Every reading in this run is `opus-5`'s. Where the
index's depth figures are the mean of three seats, these links are one model's
opinion with nothing to disagree with it. The arbitration that exists settles
cases where the *same* model, asked under two different behaviours, answered two
different ways. That is a real disagreement and worth settling, but it is not
independence.

**The arbiter was a party.** `aci_link_arbitrations.arbiter_was_a_party` records
it, and it is true throughout: the seat that settled the dispute is the seat that
created it. The column exists because upstream met the same problem, and the
honest reading of a settled pair here is "the model reconsidered", not "a third
party decided".

**The two directions rarely meet.** Measured during the run: the two directions
of a pair agree on only 8 to 16 per cent of cross-lab pairs. 568 of 2,092
one-direction readings assert that one document demands more than the other
without the other direction having been consulted. A comparison drawn from one
direction is a claim about what one passage was shown, not about the pair.

**The judge and the arbiter see different things.** A judge receives the retained
passages of the source and the whole of the target document. An arbiter receives
both documents whole. So an arbiter can see a counterpart the judge was never
shown, and a judge can call a passage absent that the arbiter would have linked.
Several findings in this run trace to that asymmetry rather than to disagreement.

## What a rigorous regeneration would need

**More than one provider, and the seats recorded per link.** The depth rubric
already seats three models and records substitutions; links should do the same.
`aci_link_calls.model` carries the seat, so the shape is there: what is missing
is a second and third seat and a rule for combining them. Combining is the hard
part, and it should be decided before the run rather than after: a mean has no
meaning over a vocabulary of six relations, so it is either a majority, or a
disagreement kept and shown as one.

**An arbiter that is not a party.** If a seat's readings are what is being
settled, the arbiter must be a model that produced none of them. Where that is
impossible, `arbiter_was_a_party` must be set and the surface must say so; today
nothing on the page does.

**Both directions before any comparison.** A pair should not be reported until
both directions have been asked, or the report should say which direction asked.
The current data cannot distinguish "both agreed" from "only one was asked", and
that distinction is the difference between a finding and an impression.

**The prompt digest is already the right mechanism.** Every table here carries
`prompt_sha256` in its unique key, so a second run under an improved prompt
writes new rows beside the old ones rather than over them, and a reader takes the
newest. Nothing needs designing for that: it needs using.

**A generation file rather than a sequence of commands.** This run was driven by
`link_self.py` subcommands invoked by hand, in an order that lived in one
session's memory. What it produced is reproducible only by someone who watched it
happen. A run should be declared: the pairs, the seats, the prompts and their
digests, the arbitration policy, in one file that the engine reads and that is
stored with the run. `aci_link_runs` already keeps `panel`, `prompt` and
`prompt_sha256`; it does not keep the pairing or the policy.

## What not to repeat

Three files beside the site (`links.json`, `depths.json`, `overview.json`) were
generated into the working tree and gitignored, so they existed on one machine
and no deployment. The reader read them, which meant the reader showed one
person's local state. That is now fixed -- the rows are in the database and a
route serves them -- but the shape of the mistake is worth naming: a generator
that writes a file the application reads is a generator that has to be re-run by
hand, on the right machine, before anything is true.

## Where the pieces are

- `engine/panel/link_self.py` -- the subcommands that drove this run
- `engine/panel/link_reader_data.py` -- builds the reader's shape into a file
- `app/lib/links.mjs` -- the same shape, read from the tables, and what the
  application serves. Held to the Python by comparison across all four runs:
  4,070 pairs, none missing, none added, no difference in relation, settled,
  judge or behaviours.
- `engine/panel/link_store_notes.py` -- the one-off that carried the paragraphs
  from the files into `aci_passage_notes` and `aci_document_notes`
