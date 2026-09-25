"""A manual review: the owner's reading of a cell, written as one more judge.

A correction is stored the way the judges' readings are, as the rows of a call
whose model is `manual`, in the run that holds the cell: a verdict in
aci_judgements for each paragraph corrected (3 defining, 2 core, 1 related, 0
not shown), with its reason in `note`, and a depth in aci_depths_out_of_ten with
its reason in `rationale`. The design is
docs/superpowers/specs/2026-09-25-manual-review-design.md.

The manual call is not a seat. Everything that counts a cell's judges -- the
panel check, the depths a cell must have, the depth pass -- leaves it out, and
only a build asked for `--manual-review` reads its rows, so a publication built
without it rebuilds byte for byte whatever corrections exist.

Standard library only, like the rest of the engine.
"""

MANUAL = "manual"

BANDS = {3: "defining", 2: "core", 1: "related", 0: None}


def is_manual(call):
    """Whether a judge call is the owner's rather than a judge's."""
    return call.get("model") == MANUAL


def band_of(verdict):
    """The band a manual verdict sets: None for 0, which takes a passage off."""
    if verdict not in BANDS:
        raise ValueError(f"a manual verdict is 0, 1, 2 or 3, not {verdict!r}")
    return BANDS[verdict]
