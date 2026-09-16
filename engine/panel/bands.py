"""The reader's tier bands, in Python.

The depth judge is shown the passages a reader sees by default, so the job has to
draw the same line the reader draws. app/lib/bands.mjs already carries the
reader's arithmetic for the server; this carries that file's, and test_bands.py
runs both over every score a cell can hold."""

TIERS = ("defining", "core", "related")

# The bands a reader opens on, before touching a toggle. site/spec-reader/app.js
# owns this decision in its own DEFAULT_BANDS, and test_bands.py reads that line
# out of the file to hold this one to it: the two drifted once, when related was
# made visible by default and this list was not told, and the depth judge went on
# being handed a narrower evidence base than the reader draws.
DEFAULT_BANDS = ("defining", "core", "related")


def tier_band(score, judges, max_cell, related=1):
    """The band a score lands in for a cell of `judges` judges, or None.

    Defining is score >= 2j+1, clamped to the cell's maximum; core is >= 2j;
    related is >= j+1 (at least two judges), or the lone judge's own weight."""
    defining_cut = min(2 * judges + 1, max_cell or 2 * judges + 1)
    related_cut = judges + 1 if judges > 1 else (related if related > 0 else 1)
    if score >= defining_cut:
        return "defining"
    if score >= 2 * judges:
        return "core"
    if score >= related_cut:
        return "related"
    return None


def band_cell(verdicts, related=1):
    """{key: band or None} for one cell, from {key: {judge: verdict}}.

    The cell's scale is the largest verdict any judge gave in it, at least 2; each
    passage is scored on its own judge count."""
    max_verdict = max([2] + [v for judged in verdicts.values() for v in judged.values()])
    out = {}
    for key, judged in verdicts.items():
        values = list(judged.values())
        if not values:
            out[key] = None
            continue
        score = sum(v if v >= 2 else (related if v == 1 else 0) for v in values)
        out[key] = tier_band(score, max(1, len(values)), max_verdict * len(values), related)
    return out


def shown_by_default(verdicts):
    """The keys a reader shows before touching a toggle: every banded passage.

    Defining, core and related alike. Related is drawn thinner, not hidden, so a
    passage one point under the core cut is on the reader's page and belongs in
    the depth judge's evidence with the rest."""
    return [key for key, band in band_cell(verdicts).items() if band in DEFAULT_BANDS]
