"""What the panel asserts, from what each judge said.

Every link a judge gave is stored. What the index asserts is derived here, at
read time, so a threshold can be redrawn without paying for another run. It is
the same division the reader keeps between verdicts, which are data, and bands,
which are a display rule over them.

The unit of agreement is the source passage, not the pair. A norm can sit across
two adjacent paragraphs, so one judge cites the ¶12 and another the ¶13, and
counting agreement pair by pair would report a disagreement where the three
judges say the same thing.
"""

import collections

import link_call

# Two of the index's three judges. Stated as a number rather than a fraction
# because the panel is three and a fraction would invite rounding.
MAJORITY = 2

LINKED = "linked"
SILENT = "silent"
CONTESTED = "contested"


def _gravest(relations):
    return min(relations, key=link_call.SEVERITY.index)


def _agreed(values, floor=MAJORITY, fallback=None):
    """The value at least `floor` judges give, or `fallback`."""
    if not values:
        return fallback
    value, count = collections.Counter(values).most_common(1)[0]
    return value if count >= floor else fallback


def assertions(rows_by_judge):
    """{source_locator: what the panel asserts about it}.

    `rows_by_judge` is {judge: [aci_links row]} for one cell and one direction.
    Every judge of the panel must appear, including one whose rows are empty:
    how many judges were asked is what a silence is measured against.
    """
    judges = sorted(rows_by_judge)
    by_source = collections.defaultdict(lambda: collections.defaultdict(list))
    for judge in judges:
        for row in rows_by_judge[judge]:
            by_source[row["source_locator"]][judge].append(row)

    out = {}
    for source_locator, rows_of in sorted(by_source.items()):
        linking = {judge: [r for r in rows if r["relation"] != "absent"]
                   for judge, rows in rows_of.items()}
        linking = {judge: rows for judge, rows in linking.items() if rows}
        silences = {judge: rows[0]["rationale"] for judge, rows in rows_of.items()
                    if judge not in linking and rows}

        if len(linking) >= MAJORITY:
            state = LINKED
        elif not linking and len(silences) == len(judges):
            state = SILENT
        else:
            state = CONTESTED

        # Each judge speaks once about the passage, with its gravest relation:
        # a judge that found a contradiction anywhere on it has said so about
        # the passage, whatever else it also linked.
        relation = _agreed([_gravest([r["relation"] for r in rows])
                            for rows in linking.values()]) if linking else None
        source_force = _agreed([rows[0]["source_force"] for rows in linking.values()],
                               fallback="unstated") if linking else "unstated"

        targets = collections.defaultdict(dict)
        for judge, rows in linking.items():
            for row in rows:
                targets[row["target_locator"]][judge] = row

        out[source_locator] = {
            "state": state,
            "relation": relation,
            "source_force": source_force,
            "judges_linking": len(linking),
            "judges": judges,
            "silences": silences,
            "targets": [{
                "locator": locator,
                "relation": _agreed([row["relation"] for row in named.values()]),
                # What each judge said, beside what the panel asserts from it. The
                # assertion is a summary and drops the most interesting case there
                # is: one judge reading a contradiction where another reads a
                # stricter rule. That disagreement is a finding about the two
                # passages, and a reader who only sees "unsettled" cannot tell it
                # from a pair nobody looked at closely.
                "judge_relations": {judge: row["relation"]
                                    for judge, row in sorted(named.items())},
                "target_force": _agreed([row["target_force"] for row in named.values()],
                                        fallback="unstated"),
                "judges": sorted(named),
                "rationales": {judge: row["rationale"]
                               for judge, row in sorted(named.items())},
            } for locator, named in sorted(targets.items())],
        }
    return out
