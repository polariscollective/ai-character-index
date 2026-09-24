# Links between the passages of two model specs

> Design doc, 2026-09-16. How the index says what two documents share, where one
> is stricter than the other, where they diverge, where they cannot both be
> obeyed, and where one is silent. The unit is a link between two passages,
> judged by the panel, in both directions. This designs the engine and its first
> run only: publication, the reader, the MCP server and any ranking are later
> work, each named at the end.

## The problem

The index answers one question per cell: where does this document address this
behaviour, and how deeply. It says nothing about the relation between two
documents. A reader who wants that opens compare mode and does the work by eye,
across 185 KB and 275 KB of text.

The publication public as of September 2026 carries thirteen behaviours over four
documents, so the comparison a reader is left to make by hand is 78 pairs of
cells.

What the index should be able to say, per behaviour and per pair of documents:

- these two passages say the same thing;
- this one is stricter than that one;
- these two are compatible, and neither implies the other;
- these two cannot both be obeyed;
- nothing in that document bears on this passage at all.

The last one is the point. Absence of coverage is an index finding, and today it
can only be found by reading a whole document and noticing that something is
missing from it.

## What this measures, and what it does not

It measures coverage, and it does not take sides. Where two documents take
opposite positions, the index reports two positions. It never says which lab is
right, which is the posture it holds everywhere else.

A consequence worth stating: a contradiction is not a defect. It is a fact about
two texts, and a reader who wants to know whether a lab is right has to decide
that themselves.

## Decisions

1. The unit is a link between one passage of one document and one passage of
   another, not a shared list of topics. A link carries its relation, the force
   of each rule, and one sentence saying what the relation is about.
2. Five relations, each defined by a test a judge can apply: would a response
   that respects one passage respect the other.
3. Sources are chosen by behaviour, targets are not. The source passages of a
   call are a cell's reader-visible passages; the target is the whole of the
   other document.
4. Both directions. A passage of B with no counterpart in A is only discoverable
   from B's side.
5. No forced link. A source passage with no counterpart is a finding, and it is
   recorded as a row rather than inferred from an absence of rows.
6. One link per pair of passages. Where a pair relates two ways at once, the more
   severe relation is the one recorded, and the sentence says the rest.
7. Each side of a link records who may lift that rule. Two passages can state the
   same norm with entirely different force, and a comparison that ignores this
   calls a root rule and a default the same thing.
8. The panel is the index's one panel, `frontier_fast`, three judges, as
   everywhere else.

## What a link is

### The five relations

Each is defined by a compliance test, in the idiom of the depth rubric's boundary
tests. `A` is the document a call reads from, `B` the document it searches.

| relation | test |
|---|---|
| `same` | in the situations both address, a response respects one if and only if it respects the other |
| `stricter_source` | every response that respects A's passage respects B's, and not the reverse |
| `stricter_target` | every response that respects B's passage respects A's, and not the reverse |
| `nuance` | neither implies the other, and a single response can respect both |
| `contradiction` | there is a situation both address in which no response can respect both |
| `absent` | nothing in B bears on what A's passage says |

The vocabulary the operator asked for maps onto this without a special case: the
same thing said twice is `same`, a nuance is `nuance` or one of the two
`stricter` values, a contradiction is `contradiction`, and a gap is `absent`.

Two rules for the judges, and they point in the same direction. In doubt between
two relations, the less severe one is given. A permission facing a prohibition is
`stricter`, not `contradiction`: a response that declines to use the permission
respects both documents. Claiming publicly that one lab contradicts another is
the strongest thing this analysis says, and it is not said by accident.

### The force of a rule

Both sides of a link record who may lift that rule, in one vocabulary rather than
each document's own. The OpenAI Model Spec tags its sections `root`, `system`,
`developer`, `user` and `guideline`; the Alibaba Model Spec sets permission
levels under a Root Principle; the Anthropic constitution names hard constraints,
instructable behaviours, and a priority ordering it calls holistic rather than
strict. The three ladders answer one question differently, and the question is
what we store.

| value | meaning |
|---|---|
| `nobody` | no principal may lift it |
| `priority` | no principal may lift it, but the document's own ordering can outweigh it |
| `operator` | an operator or developer may lift it, and so may a user |
| `user` | only the user may lift it |
| `unstated` | the document does not say |

`priority` exists because of texts like the constitution's treatment of honesty,
which is not a hard constraint but is meant to "function as something quite
similar to one", under an ordering that is "holistic rather than strict". Without
this value a judge must code that rule as `nobody`, which is false, or as
`unstated`, which discards the most interesting fact about it.

### An absence is a row

A row with `relation = 'absent'` and no target is the judge saying that nothing in
the target document bears on this passage. A source passage with no row at all is
a different thing: the judge was asked and did not answer. `aci_judgements` makes
the same distinction with its `parsed` column, and for the same reason.

## Where it lives

Three new tables. Nothing existing is altered, so `main` keeps working and
`publish.py` and the publication trigger are untouched. `aci_judge_calls` is not
reused: it knows one document, and the publication logic reads it.

```sql
create table aci_link_runs (
  id              uuid primary key,
  created_by      text not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'running', 'done', 'cancelled', 'error')),
  panel           text[] not null,
  prompt          text not null,
  prompt_sha256   text not null,
  behaviours      jsonb not null,      -- the briefs the judges were given
  config          jsonb,
  estimated_usd   numeric(12, 2),
  cost_usd        numeric(12, 6),
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);

create table aci_link_calls (
  id                uuid primary key,
  run_id            uuid not null references aci_link_runs(id) on delete cascade,
  behaviour_slug    text not null references aci_behaviours(slug),
  source_version_id uuid not null references aci_spec_versions(id),
  target_version_id uuid not null references aci_spec_versions(id),
  model             text not null,
  status            text not null default 'pending'
                    check (status in ('pending', 'running', 'done', 'error')),
  sources           integer,           -- how many source passages it was given
  unparsed          integer,           -- sources its reply did not cover
  raw_output        text,              -- kept when a reply will not parse
  error             text,
  finish_reason     text,
  prompt_tokens     integer,
  completion_tokens integer,
  cost_usd          numeric(12, 6),
  seconds           numeric(10, 2),
  started_at        timestamptz,
  finished_at       timestamptz,
  check (source_version_id <> target_version_id),
  unique (run_id, behaviour_slug, source_version_id, target_version_id, model)
);

create table aci_links (
  id             uuid primary key,
  call_id        uuid not null references aci_link_calls(id) on delete cascade,
  source_locator text not null,
  target_locator text,                 -- null exactly when the relation is absent
  relation       text not null
                 check (relation in ('same', 'stricter_source', 'stricter_target',
                                     'nuance', 'contradiction', 'absent')),
  source_force   text check (source_force in ('nobody', 'priority', 'operator',
                                              'user', 'unstated')),
  target_force   text check (target_force in ('nobody', 'priority', 'operator',
                                              'user', 'unstated')),
  rationale      text not null,
  check ((relation = 'absent') = (target_locator is null)),
  check ((relation = 'absent') = (source_force is null and target_force is null)),
  unique (call_id, source_locator, target_locator)
);

create unique index aci_links_one_absence
  on aci_links (call_id, source_locator) where relation = 'absent';
```

The partial index is there because Postgres counts nulls as distinct, so the
unique key above it would let one judge record the same passage absent twice.

Granted to `service_role` like the other `aci_` tables.

**These tables are a pull request in `polaris-supabase`, not here.** One Postgres
database has one migration history, and the workspace keeps every schema in that
repository. The code in this repository cannot run until that PR is merged, and
the implementation plan has to order the two.

## How a call is composed

One call is one behaviour, one source document, one target document, one judge.

- **The sources** are the cell's reader-visible passages, computed by
  `bands.shown_by_default` from the cell's judgements, exactly as the depth call
  chooses what it grades. These are the passages the reader shows by default, so
  the links are about what the index displays.
- **The target** is the whole other document, numbered in reading order by
  `harness.passages(spec, version)`, as a passage call receives it. Only this
  makes a silence sayable, and only this finds a counterpart filed under another
  behaviour.
- **The prompt** is `engine/panel/prompts/link-v1.txt`, whose digest is recorded
  on the run, as the depth prompt's is.
- A cell with no retained passage is refused at composition, naming the cell.
  There is nothing to compare, and a call with no sources would be paid for.

The prompt states the five relations with their tests, the five forces, the two
doubt rules, and one further instruction the drafting of this document produced:
a passage that describes tone or manner is not a counterpart to a passage that
states a norm. A warm phrase and an honesty rule are not the same kind of claim,
and pairing them would manufacture agreement.

### The reply

One line per link, and every source accounted for:

```
[3] -> [214] stricter_source (nobody/user): A forbids every white lie; B permits politeness at user level.
[7] -> none: nothing in the document bears on this passage.
```

Read like the depth reply: each line is stripped of list markers, emphasis and
code spans before it is matched, because models wrap answers in markdown often
enough that refusing those replies pays for each of them twice.

A line naming a relation or a force outside the vocabulary is dropped. A line
naming a source number the call did not give is dropped.

**The floor is completeness.** Every source number from 1 to N must be covered by
at least one accepted line. Otherwise the call ends `error`, keeps its
`raw_output` and writes no link at all. Half a reply stored would be a page of
invented absences, which is the same failure `PARSE_FLOOR` exists to prevent on a
passage call.

## Running a link run

Two CLIs, in the shape `compose_run.py` and `batch_job.py` already have:

- `engine/panel/compose_links.py` prices the run and prints it; `--go` writes the
  run and its calls. Pricing counts the prompt, the source passages and the whole
  target document at four characters per token, with an output allowance per
  source passage.
- `engine/panel/link_job.py` executes every call of a run that is not `done`.

Relaunching is the retry, there is no automatic one, a judge that fails does not
fail the run, cancellation is checked between calls, and the run's cost is the
sum of its calls' meters. None of that is new; it is what the judging job does,
and the reasons are recorded there.

The container mode and the portal button wait for v2, with publication. A run of
six calls is composed and executed from the command line.

## What the panel asserts

Everything each judge said is stored. What the index asserts is derived at read
time by a stated rule, the way the reader's bands are derived from verdicts
rather than frozen into a column. Redrawing a threshold then costs nothing.

**The unit of agreement is the source passage, not the pair.** A norm can sit
across two adjacent paragraphs, so one judge cites the ¶12 and another the ¶13.
Counting agreement pair by pair would report a disagreement where the three
judges say the same thing.

| state of a source passage | rule |
|---|---|
| `linked` | at least two judges found it a counterpart |
| `silent` | all three answered `absent` |
| `contested` | anything else |

The relation asserted is the one at least two judges give, taking each judge's
most severe relation on that passage; otherwise the relation is unsettled. The
targets shown are the union of what the judges cited, each with the number of
judges who named it. Each force follows the same two-of-three rule and falls back
to `unstated`.

Two asymmetries, both deliberate:

- **A contradiction needs two judges.** One model's word is not enough to publish
  that one lab contradicts another. A lone contradiction stays in the data and
  reaches the operator as a lead.
- **A silence needs all three.** "This document says nothing about that" is the
  strongest claim the comparison makes, and the one a lab would answer by quoting
  its own text. One judge finding a counterpart is enough to withhold it.

These thresholds are written down so the first run can test them, not because
they are known to be right.

## What is read

`engine/panel/link_report.py` takes a run and writes two files into `artefacts/`:
a markdown report to read, and the same content as JSON for later work.

Per direction, each source passage appears with its locator and quote, its state,
its relation, both forces, the target passages with their quotes and their
support, and the judges' sentences. Then a summary: how many sources, how many
linked, how many contradictions, how many silences, how many contested.

And a table of agreement between judges, because that is the first run's real
question.

## The first run

`honesty-and-non-deception`, the Anthropic constitution `@2026-01-20` against the
OpenAI Model Spec `@2026-08-18`, both directions, three judges: six calls. The
cell holds 16 reader-visible passages on the constitution and 21 on the model
spec, and both documents are judged at depth 3.7, the deepest either of them
reaches for any behaviour. The
target documents are about 46,000 and 69,000 tokens, so the run costs two to
three dollars, before the judges' reasoning, which no estimate here counts.

Two pairs are already known to be in it, and they are the calibration:

- The constitution rules out even the white lie of praising a disliked gift; the
  model spec allows politeness in answering "Do I look fat in these jeans?" while
  refusing white lies that amount to sycophancy. This must come back
  `stricter_source`. A judge calling it a contradiction means the prompt is
  miscalibrated, because a truthful answer respects both.
- The model spec ranks its outcomes "providing a good answer > refusing to answer
  > committing a lie of omission > committing a lie of commission > violating an
  explicit applicable instruction", so violating an explicit instruction is worse
  than lying. The constitution wants honesty to function nearly as a hard
  constraint and asks for a transparent conscientious objector instead. This is
  the contradiction candidate, and it needs two judges to be asserted.

What the run has to answer:

1. Do the three judges agree often enough for the thresholds to assert anything?
   If `silent` is never reached, either the bar or the task is wrong.
2. Does the white-lie pair come back `stricter_source`?
3. Does the outcome-ordering pair come back `contradiction`, from two judges?
4. Does the reply clear the completeness floor, and is the cost the estimated one?
5. Are counterparts found outside the behaviour's own retained passages? That is
   the only thing that justifies giving the whole document as the target.

## Testing

Test first, as the repository does.

- **The parser**: a line with a target, a line with `none`, a line wrapped in
  markdown, a relation outside the vocabulary, a force outside it, an unknown
  source number, a rationale containing a colon, and the completeness floor.
- **Composition**: the sources are exactly the cell's reader-visible passages
  against a fixture, the target is the whole document numbered, the price, `--go`
  writing the three tables, and the refusal of a cell with nothing retained.
- **The job**, with an injected `call_model` as `test_batch_job.py` has: a run
  executes, a reply that will not parse keeps its raw output and writes no link,
  a relaunch takes only what is not done, a cancellation stops between calls, and
  the run's cost is the sum of its calls.
- **Agreement**: two of three asserts, one of three does not, three of three
  asserts a silence, two against one is contested, two adjacent targets count as
  one linked source, and a contradiction needs two judges.

## Out of scope

Each of these is later work, and none is blocked by this design.

- **Publication, the reader and the MCP server.** Links are read from the
  database and from the report. Putting them in a payload engages the digest, the
  publication trigger and the homogeneity rule, and displaying them should be
  designed against real links rather than guessed.
- **A ranking.** Counting links counts paragraphs, not ideas: a document that
  states one norm in five paragraphs collects five absences against a document
  that states it once. A ranking has to group links into ideas first, and the
  first run is what tells us how. The five provisions proposed for international
  consensus in the practitioner literature are a candidate external yardstick,
  which would keep the scale from being ours alone.
- **Comparing the two documents' conflict-resolution architectures**: a goal
  ordering against a ladder of authority levels. `force` carries enough of it to
  keep a link honest; comparing the architectures head on is its own analysis,
  and it is per document, not per behaviour.
- **A rubric for the quality of a norm**: whether the document says what happens
  when this norm collides with another, whether it states its exceptions, whether
  it reaches beyond chat to agentic settings and third parties. This is a sibling
  of the depth rubric and deserves the same anchors and boundary tests. It is not
  folded into this run, which would confound two experiments that have never been
  tried.
- **Contradictions inside one document.** A document against itself is a
  different claim from one lab against another, and the constitution resolves its
  own tensions by an ordering that a passage-level reading would miss. The same
  machinery can run a document against itself later.
- **Measurability as a separate score.** The depth scale already measures it:
  level 3 is a rule specific enough that a grader can quote the document's own
  sentences, and level 4 adds worked examples as an answer key. A second score
  for the same property would eventually disagree with the first.

## What informed this

The depth rubric in `methodology/spec-coverage-depth-rubric.md` and the design at
`docs/superpowers/specs/2026-09-14-one-panel-documents-as-versions-and-judged-depth-design.md`,
whose call, reply, floor, retry and meter patterns this follows deliberately.

The counts, quotes and depths above were read from the publication public in
September 2026 in the session that wrote this document, not from memory.

An unpublished draft on model spec practice, read while this was written, which
is why `force` carries `priority` and why the prompt separates tone from norm. Its
text is deliberately used nowhere in any prompt: it carries a clause reserving it
for human reference. The public criteria it cites, from Forethought's work on
what belongs in a model spec, are what a later rubric would build on.
