"""A seat of the panel judged by another model, on one cell of one run.

A publication holds every cell to one panel, and a judge can be unable to answer
a cell at all: fable's output is content-filtered on harm-avoidance-to-third-parties
against the OpenAI Model Spec, every attempt. Such a cell is judged with a
substitute in that seat, and `aci_seat_substitutions` records it. The record is
the whole of the permission. The database's publication trigger holds a cell to
the panel with that cell's recorded substitutions applied, and nothing else, so
this module states the same rule for the code that refuses before a row is
written and for the builder that files the verdicts.

Standard library only, like the rest of the engine.
"""

TABLE = "aci_seat_substitutions"


def recorded(store, **filters):
    """{(run_id, behaviour_slug, spec_version_id): [{"seat", "substitute", "reason"}]}.

    Each keyword names a column and the values it may take, sent as a PostgREST
    `in.()` filter so the read stays the size of the question. A filter with no
    values matches nothing, and is answered without a request. Values are quoted:
    slugs and uuids need no quoting, but an unquoted comma in any value would
    silently split it into two.
    """
    params = {}
    for column, values in filters.items():
        values = sorted(set(values))
        if not values:
            return {}
        params[column] = "in.(" + ",".join(f'"{value}"' for value in values) + ")"

    out = {}
    for row in store.select(TABLE, params):
        key = (row["run_id"], row["behaviour_slug"], row["spec_version_id"])
        out.setdefault(key, []).append({"seat": row["seat"],
                                        "substitute": row["substitute"],
                                        "reason": row["reason"]})
    return {key: sorted(rows, key=lambda row: row["seat"]) for key, rows in out.items()}


def seats(panel, substitutions=()):
    """The panel as one cell was seated, sorted: each substituted seat replaced by
    its substitute, every other seat as configured.

    Applied once, against the configured seats. A substitution naming a model the
    panel does not seat changes nothing, and a substitute that is already a seat
    yields a duplicate no set of done calls can equal, which is a refusal -- both
    exactly as the trigger's join reads them.
    """
    by_seat = {row["seat"]: row["substitute"] for row in substitutions}
    return sorted(by_seat.get(seat, seat) for seat in panel)
