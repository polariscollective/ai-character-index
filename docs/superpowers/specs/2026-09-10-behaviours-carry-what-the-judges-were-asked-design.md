# Behaviours carry what the judges were asked — design

Date: 2026-09-10
Status: approved, not started

## Why

There are two behaviour registries in this repository and only one of them
migrated.

`data/behaviours.json` is the display registry: name, set, numeric id, group,
definition, facets. That is what `aci_behaviours` holds today.

`engine/panel/behaviours.json` is the judging registry, keyed by the same slugs.
It carries what the panel is actually told: `query`, the definition the judges
are given; `boundary`, the frontier of the construct, which says what counts and
what explicitly does not; `source`, where the definition came from; and for one
behaviour a `query_v2` that the current rubric prefers over `query`, with a
`note_v2` saying why.

The migration design listed the first file and not the second. This closes that.

## What it costs to leave

The behaviour block of the judge prompt has four slots: title, definition,
clarifications, scope. `harness.compose_query` fills scope from `boundary`, and
`harness._panel_shape` adapts a display-shape entry by supplying a title and a
definition and nothing else. A behaviour judged out of the database today would
therefore reach the panel with its scope rendered as the literal value the
rubric documents as "the user left this field blank".

All ten entries of the judging registry carry a real boundary. So a rerun from
the database would not reproduce the bench, and it would not say so.

Two further consequences, both already true rather than hypothetical.

`aci_runs.behaviours` was meant to freeze what a run judged against, and the
migration filled it from the display registry. It therefore records definitions
the run did not use.

And behaviours are about to become things people add. A behaviour registered
through the admin surface with no boundary is not a behaviour the panel can
judge properly; it is one the panel will judge against a blank field.

## Defined and judged are different states

A behaviour can be defined without having been judged, and that is the normal
state between someone adding it and a run covering it. The two must be
separable.

**Defined** means the behaviour carries a judging entry with a non-empty query.
**Judged** means some `aci_judge_calls` row for it reached `done`.

`general-welfare-impacts-strict` is neither. It appears in the sidebar beside
nine others, it has no entry in the judging registry, and no panel has ever
scored it. The reader gives no way to tell.

## The column

One column, `aci_behaviours.judging jsonb`, holding the judging registry's entry
whole.

Field by field was the alternative and it is worse. The judging entry is a
contract owned by `harness.compose_query`, not by the database: it already has
seven distinct fields across ten entries, four of them optional, and it will
gain more as rubrics change. Stored whole, the job hands the column straight to
`compose_query` with no mapping in between, and a new field costs no migration.

It is nullable, because undefined is a legitimate state. Where it is null the
existing adaptation still applies, so the clone-and-fork path — register a
behaviour with a definition only, judge it, read it — keeps working exactly as
it does now.

```sql
alter table aci_behaviours add column judging jsonb;
```

## The migration

`engine/migrate_to_supabase.py` reads `engine/panel/behaviours.json` and fills
`judging` for the ten slugs it names. Every one of them already exists in the
display registry, so nothing new is created and no slug is invented.

`aci_runs.behaviours` is corrected in the same pass: the snapshot becomes the
judging entry the run used, joined to the display entry it displayed, rather
than the display entry alone. The column takes an update, so the correction is
made in place and no judgement is touched.

## Verification

Three checks, added to `engine/verify_supabase_provenance.py`.

- Every slug in the judging registry has a `judging` column in the database
  equal to it, field for field.
- Composing the judge prompt for each of the ten from the database produces the
  same text as composing it from the file. This is the check that matters: it
  is the only one that would have caught the omission, because it compares what
  the model would actually be sent.
- The run's snapshot names the judging definitions, and for
  `animal-welfare-impacts` names the `query_v2` the rubric prefers rather than
  the `query` it supersedes.

## Boundary with the popup

Nothing here is visible. The sidebar popup that shows a reader the boundary,
the source and whether a behaviour is defined and judged is the next document,
and it is only possible once this one has landed.
