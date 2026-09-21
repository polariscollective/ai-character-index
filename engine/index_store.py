"""The index, read back out of its tables in the shapes the builders expect.

Every function here returns what a committed file used to hold, so the builders
downstream keep working on the shape they already know. The seam is deliberate:
the builders' logic is the part that has been proved byte-identical for a year,
and moving the data should not disturb it.

One convention is worth stating. A reader document is a version, and its id is
`<spec id>@<version>`, which is also the head of every locator into it. Two
versions of one specification are two documents.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "spec-cite"))
import cite  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent / "panel"))
import assessment_call  # noqa: E402
import depth_call  # noqa: E402


def _rows(store, table, params=None):
    return store.select(table, params)


def spec_registry(store):
    """(entries, defaults, meta, source), the four arguments cite.use_registry
    takes. The markdown arrives with the version rows, so `source` is a lookup
    and never a second query."""
    specs = {row["id"]: row for row in _rows(store, "aci_specs")}
    versions = _rows(store, "aci_spec_versions")

    entries, meta, text = {}, {}, {}
    newest = {}
    for version in versions:
        spec = specs[version["spec_id"]]
        key = (spec["id"], version["version"])
        entries[key] = version["id"]
        text[version["id"]] = version["markdown"]
        meta[key] = {"title": spec["title"], "sourceUrl": version["source_url"],
                     "locatorStyle": spec.get("locator_style")}
        if version["version"] > newest.get(spec["id"], ""):
            newest[spec["id"]] = version["version"]

    return entries, newest, meta, text.__getitem__


def install_registry(store):
    """Point cite.py at the database for the rest of this process."""
    cite.use_registry(*spec_registry(store))


def _sections(markdown, spec_id, version, by_anchor):
    """Every section of a document, with the passages it holds.

    [(section, [(¶ index, locator, text)])], one entry per heading, including a
    heading with no passage under it. Cut the way the judges' passages are cut --
    engine/panel/harness.py's `passages`: the same sections, the same blocks, the
    same filter for a block that is only a repeated heading. A citation and a
    paired original must name the same thing, so the two are cut by one set of
    rules.
    """
    lines = markdown.splitlines()
    sections = cite.parse_sections(lines)
    titles = {cite.normalize(section.path_str.split(" > ")[-1]) for section in sections}
    out = []
    for section in sections:
        ref = f"#{section.anchor}" if (by_anchor and section.anchor) else section.path_str
        passages = []
        for index, raw in enumerate(
                cite.segment_blocks(lines, section.start, section.end), 1):
            text = cite.normalize(raw)
            if text.strip() and text not in titles:
                passages.append((index, f"{spec_id}@{version} > {ref} > ¶{index}", text))
        out.append((section, passages))
    return out


def _shape(entry):
    """What two languages must share at one section: its heading level and the ¶
    indices of its passages. Titles cannot be compared, being in two languages."""
    section, passages = entry
    return section.level, [index for index, _, _ in passages]


def _described(entry):
    if entry is None:
        return "no section"
    section, passages = entry
    held = ", ".join(f"¶{index}" for index, _, _ in passages) or "no passages"
    return f"'{section.path_str}' (heading level {section.level}, {held})"


def _pairing(version, spec, document_id):
    """Every passage of a translation beside the same passage of its original.

    The pairing is the order of the two texts, which is sound only while both cut
    the same way. Equal totals do not show that they do. cite.py joins a fence to
    a preceding `**Example**` caption and to no other, so a Chinese `**示例**`
    caption leaves its fence a block apart; one merged paragraph elsewhere brings
    the totals level again, and every pair in between opens the wrong original
    with a straight face.

    So the two are held to each other section by section: the same headings at
    the same levels, in the same order, and in each section the same passages at
    the same ¶ indices. The first section where they part is named. A registered
    version cannot be edited, so this fails the build rather than publishing a
    pairing nobody could trust.
    """
    by_anchor = spec.get("locator_style") == "anchor"
    translated = _sections(version["markdown"], spec["id"], version["version"], by_anchor)
    original = _sections(version["original_markdown"], spec["id"], version["version"],
                         by_anchor)
    for position in range(max(len(translated), len(original))):
        mine = translated[position] if position < len(translated) else None
        theirs = original[position] if position < len(original) else None
        if mine is None or theirs is None or _shape(mine) != _shape(theirs):
            raise SystemExit(
                f"{document_id}: the translation and its original part at heading "
                f"{position + 1}: the translation has {_described(mine)}, and the "
                f"original has {_described(theirs)}. Pairing past it would put "
                "passages beside other passages' originals. The original and its "
                "translation must keep the same structure: the same headings at the "
                "same levels, and the same blocks in each section, in the same order.")
    return [{"locator": locator, "text": text, "original": source}
            for (_, mine), (_, theirs) in zip(translated, original)
            for (_, locator, text), (_, _, source) in zip(mine, theirs)]


def documents(store, spec_version_ids=None, judged_version_ids=None):
    """The `documents` entries of the reader payload, markdown included.

    Ordered by document id, `<spec id>@<version>`.

    A version registered with an original carries its translation's provenance
    and the original passage by passage, so the reader can say whose translation
    it is showing and put each paragraph's source beside it.

    `judged_version_ids` is the set a run has actually judged. A version outside
    it is marked `judged: false`, which is a different claim from an empty
    coverage record: "no panel has read this" and "a panel read this and found
    nothing" must not render as the same sentence. Left None, nothing is said.
    """
    labs = {row["id"]: row for row in _rows(store, "aci_labs")}
    specs = {row["id"]: row for row in _rows(store, "aci_specs")}
    versions = _rows(store, "aci_spec_versions")
    reviews = _rows(store, "aci_translation_reviews")
    if spec_version_ids is not None:
        wanted = set(spec_version_ids)
        versions = [v for v in versions if v["id"] in wanted]
    else:
        newest = {}
        for version in versions:
            if version["version"] > newest.get(version["spec_id"], {}).get("version", ""):
                newest[version["spec_id"]] = version
        versions = list(newest.values())

    out = []
    for version in versions:
        spec = specs[version["spec_id"]]
        lab = labs[spec["lab_id"]]
        document = {
            "id": f"{spec['id']}@{version['version']}",
            "lab": lab["name"],
            "title": spec["title"],
            "shortTitle": spec["short_title"],
            "version": version["version"],
        }
        if version["source_url"]:
            document["sourceUrl"] = version["source_url"]
        document["markdown"] = version["markdown"]
        if version.get("original_markdown"):
            document["translation"] = {
                "from": version["original_language"],
                "by": version["translated_by"],
                # A reading by a person and a reading by a model are different
                # evidence; only the first earns the reader's "reviewed by a
                # person", so only the first counts here.
                "reviewed": any(review["spec_version_id"] == version["id"]
                                and review["reviewer_kind"] == "person"
                                for review in reviews),
            }
            document["original"] = _pairing(version, spec, document["id"])
        if judged_version_ids is not None:
            document["judged"] = version["id"] in judged_version_ids
        out.append(document)
    return sorted(out, key=lambda d: d["id"])


def behaviours(store):
    """The behaviour registry in the shape data/behaviours.json holds, keyed by
    slug. `group` is a reserved word in SQL and could not carry its own name in
    the table, so it is renamed back. Sets decide nothing since the one-panel
    redesign, so `set_name` is not carried."""
    out = {}
    for row in _rows(store, "aci_behaviours"):
        out[row["slug"]] = {
            "name": row["name"],
            "numeric_id": row["numeric_id"],
            "group": row["group_name"],
            "definition": row["definition"],
            "facets": row["facets"],
        }
        # Carried through rather than dropped: judging_registry() below reads it,
        # and the payload builders ignore what they do not use.
        if row.get("judging") is not None:
            out[row["slug"]]["judging"] = row["judging"]
    return out


def runlog_rows(store, run_id):
    """A run's judgements in the JSONL row shape the builders already consume.

    Only calls that finished contribute. A call in `error` kept its raw output
    and wrote no judgement, and one still `pending` has nothing to say; neither
    belongs in a log that stands for what the panel decided.
    """
    run = next(r for r in _rows(store, "aci_runs") if r["id"] == run_id)
    spec_of_version = {v["id"]: v["spec_id"]
                       for v in _rows(store, "aci_spec_versions")}
    calls = {c["id"]: c for c in _rows(store, "aci_judge_calls")
             if c["run_id"] == run_id and c["status"] == "done"}

    via = (run.get("config") or {}).get("via")
    rows = []
    for judgement in _rows(store, "aci_judgements"):
        call = calls.get(judgement["call_id"])
        if call is None:
            continue
        rows.append({
            "behaviour": call["behaviour_slug"],
            "spec": spec_of_version[call["spec_version_id"]],
            "model": call["model"],
            "locator": judgement["locator"],
            "verdict": judgement["verdict"],
            "relevant": judgement["relevant"],
            "parsed": judgement["parsed"],
            "rubric": run["rubric"],
            "via": via,
        })
    return rows


def cell_depths(store, cells, assessment_run_id=None):
    """The depth of each cell a publication carries, from its own run.

    {(behaviour_slug, spec_version_id): {"mean": float, "judges": {model: {"depth",
    "rationale"}}}}. A cell any of whose done calls has no done depth is left out:
    the caller decides whether that refuses a publication.

    With no assessment run, this reads `aci_depths`, the scale of four, exactly
    as every publication built so far was. With one, it reads
    `aci_depths_out_of_ten` instead, for that assessment run and the current
    prompt of ten (`depth_call.prompt_sha256(10)`); a row of another assessment
    run or another prompt digest is not read. The cell's entry then gains
    "scale": 10, and a judge's entry gains "model" and "substitution_reason"
    when a declared substitute gave that depth.
    """
    wanted = {(c["run_id"], c["behaviour_slug"], c["spec_version_id"]) for c in cells}
    calls = [c for c in _rows(store, "aci_judge_calls")
             if (c["run_id"], c["behaviour_slug"], c["spec_version_id"]) in wanted
             and c["status"] == "done"]

    if assessment_run_id is None:
        depths = {d["call_id"]: d for d in _rows(store, "aci_depths")}
    else:
        prompt_sha256 = depth_call.prompt_sha256(10)
        depths = {d["call_id"]: d for d in _rows(store, "aci_depths_out_of_ten")
                  if d.get("assessment_run_id") == assessment_run_id
                  and d.get("prompt_sha256") == prompt_sha256}

    by_cell = {}
    for call in calls:
        by_cell.setdefault((call["behaviour_slug"], call["spec_version_id"]), []).append(call)

    out = {}
    for key, cell in by_cell.items():
        given = [depths.get(call["id"]) for call in cell]
        if any(d is None or d["status"] != "done" for d in given):
            continue
        judges = {}
        for call, d in zip(cell, given):
            entry = {"depth": d["depth"], "rationale": d.get("rationale") or ""}
            if d.get("model") is not None:
                entry["model"] = d["model"]
                entry["substitution_reason"] = d.get("substitution_reason")
            judges[call["model"]] = entry
        cell_entry = {"mean": round(sum(j["depth"] for j in judges.values()) / len(judges), 1),
                     "judges": dict(sorted(judges.items()))}
        if assessment_run_id is not None:
            cell_entry["scale"] = 10
        out[key] = cell_entry
    return out


def depth_scale(depth_prompt=None, assessment_run_id=None):
    """The scale a build reads its depths on, 4 or 10, from the depth prompt and
    the assessment run it names.

    Naming nothing, or the prompt of four, reads the scale of four, as every
    publication built before the scale of ten did. The prompt of ten is read with
    the assessment run its depths were given with, because the conflict rules
    each of those depths was shown come from that run, and `cell_depths` reads no
    other prompt of ten. Any other pairing is refused, naming the digest given
    and the digest expected, rather than building a payload on a scale nobody
    asked for.
    """
    four, ten = depth_call.prompt_sha256(4), depth_call.prompt_sha256(10)
    if assessment_run_id is not None:
        if depth_prompt != ten:
            named = depth_prompt or f"{four}, the prompt of four, by default"
            raise SystemExit(
                f"--assessment-run={assessment_run_id} reads depths out of ten, given under "
                f"the depth prompt {ten}, and --depth-prompt names {named}. Pass "
                f"--depth-prompt={ten}.")
        return 10
    if depth_prompt is None or depth_prompt == four:
        return 4
    if depth_prompt == ten:
        raise SystemExit(
            f"--depth-prompt={ten} is the prompt of ten, and a depth out of ten is read "
            "with the assessment run it was given with: name it with --assessment-run=<id>.")
    raise SystemExit(
        f"--depth-prompt={depth_prompt} is neither depth prompt: the scale of four is "
        f"{four}, and the scale of ten is {ten}, read with --assessment-run=<id>.")


def _any_of(values):
    """A PostgREST `in.()` filter, each value quoted, as seat_substitutions sends."""
    return "in.(" + ",".join(f'"{value}"' for value in sorted(values)) + ")"


def assessment_rows(store, assessment_run_id, spec_version_ids):
    """(run, {version id: {"calls", "scores", "claims", "verdicts"}}) for one
    assessment run, restricted to the documents named. The run is None when no
    run carries that id.

    Each read is filtered to the run, or to the calls and claims already read,
    and every row is held to the run and the documents again once read, so a
    store that answered a filter loosely could not bring another run's rows in.
    """
    runs = [row for row in _rows(store, "aci_assessment_runs",
                                 {"id": f"eq.{assessment_run_id}"})
            if row["id"] == assessment_run_id]
    wanted = set(spec_version_ids)
    by_version = {version_id: {"calls": [], "scores": [], "claims": [], "verdicts": []}
                  for version_id in wanted}
    if not runs:
        return None, by_version

    def mine(table):
        return [row for row in _rows(store, table, {"run_id": f"eq.{assessment_run_id}"})
                if row["run_id"] == assessment_run_id and row["spec_version_id"] in wanted]

    calls, claims = mine("aci_assessment_calls"), mine("aci_assessment_claims")
    version_of_call = {call["id"]: call["spec_version_id"] for call in calls}
    version_of_claim = {claim["id"]: claim["spec_version_id"] for claim in claims}
    scores = ([row for row in _rows(store, "aci_assessment_scores",
                                    {"call_id": _any_of(version_of_call)})
               if row["call_id"] in version_of_call] if calls else [])
    verdicts = ([row for row in _rows(store, "aci_assessment_verdicts",
                                      {"claim_id": _any_of(version_of_claim)})
                 if row["claim_id"] in version_of_claim] if claims else [])
    for call in calls:
        by_version[call["spec_version_id"]]["calls"].append(call)
    for claim in claims:
        by_version[claim["spec_version_id"]]["claims"].append(claim)
    for score in scores:
        by_version[version_of_call[score["call_id"]]]["scores"].append(score)
    for verdict in verdicts:
        by_version[version_of_claim[verdict["claim_id"]]]["verdicts"].append(verdict)
    return runs[0], by_version


def assessment_gaps(assessment_run_id, run, by_version, versions):
    """What keeps an assessment run from standing for each document named, one
    sentence per gap, or nothing when it assessed them all.

    A document is assessed when every seat of the run's criteria answered with
    all four criteria scored, every seat of its contradictions answered, and
    every confirmation it asked finished. A seat that could not answer and
    whose substitutes could not either leaves its call in error, and a total
    built without it would be a mean of fewer judges presented as the panel's.
    """
    if run is None:
        return [f"there is no assessment run {assessment_run_id}"]
    panels = run.get("panels") or {}
    gaps = []
    for version in versions:
        name = f"{version['spec_id']}@{version['version']}"
        rows = by_version.get(version["id"]) or {}
        calls = rows.get("calls") or []
        if not calls:
            gaps.append(f"{name}: the assessment run did not assess it")
            continue
        scored = {}
        for score in rows.get("scores") or []:
            scored.setdefault(score["call_id"], set()).add(score["criterion"])
        for question in assessment_call.QUESTIONS:
            for seat in panels.get(question, []):
                done = [call for call in calls if call["question"] == question
                        and call["seat"] == seat and call["status"] == "done"]
                if not done:
                    gaps.append(f"{name}: {seat} gave no {question} answer")
                elif question == "criteria":
                    missing = [criterion for criterion in assessment_call.CRITERIA
                               if criterion not in scored.get(done[0]["id"], set())]
                    if missing:
                        gaps.append(f"{name}: {seat}'s criteria answer scored no "
                                    + ", ".join(missing))
        unfinished = sorted(call["seat"] for call in calls
                            if call["question"] == "confirm" and call["status"] != "done")
        if unfinished:
            gaps.append(f"{name}: the confirmation asked of {', '.join(unfinished)} "
                        "did not finish")
    return gaps


def assessment(store, assessment_run_id, versions):
    """(run, {version id: rows}) for an assessment run that assessed every
    document in `versions`, or a refusal naming every gap at once."""
    run, by_version = assessment_rows(store, assessment_run_id,
                                      [version["id"] for version in versions])
    gaps = assessment_gaps(assessment_run_id, run, by_version, versions)
    if gaps:
        raise SystemExit(
            f"assessment run {assessment_run_id} does not assess every document this "
            "publication carries:\n  " + "\n  ".join(gaps)
            + "\nAssess the documents missing, or retry the calls that failed, then "
            "build again.")
    return run, by_version


def current_publication(store):
    """The publication the reader serves: the newest PUBLIC one.

    A publication is insert-only, so it never changes after it is built -- but it
    is built before anyone has read it, and `is_public` is how an operator says
    they have. Newest alone would put a payload in front of the public in the
    same motion that produced it.
    """
    publications = [row for row in _rows(store, "aci_publications")
                    if row.get("is_public")]
    if not publications:
        return None
    return max(publications, key=lambda row: row["published_at"])


def published_runlog_rows(store, publication=None, cells=None):
    """The judgement rows behind a publication, in the JSONL shape.

    A publication selects a run per cell, so this is the union over the runs it
    names, restricted to the cells it actually published. A run may hold cells
    an older publication used and this one did not.

    `cells` answers for a publication that does not exist yet. A publication
    carries its payloads as columns and is insert-only, so the payloads have to
    be built BEFORE the row: there is no insert-then-fill. A publish job
    therefore chooses its cells, builds from them, and inserts the result in one
    go. Passing them here is how the builders see a selection no publication
    names yet.
    """
    if cells is None:
        publication = publication or current_publication(store)
        if publication is None:
            return []
        cells = [c for c in _rows(store, "aci_publication_cells")
                 if c["publication_id"] == publication["id"]]
    wanted = {(c["behaviour_slug"], c["spec_version_id"]) for c in cells}
    spec_of_version = {v["id"]: v["spec_id"]
                       for v in _rows(store, "aci_spec_versions")}

    rows = []
    for run_id in sorted({c["run_id"] for c in cells}):
        for row in runlog_rows(store, run_id):
            rows.append(row)
    # runlog_rows keys by spec name; the cell filter is by version id, so map back.
    spec_names = {spec_of_version[version_id]: version_id
                  for _, version_id in wanted}
    return [row for row in rows
            if (row["behaviour"], spec_names.get(row["spec"])) in wanted]


def published_spec_version_ids(store, publication=None, cells=None):
    if cells is not None:
        return sorted({c["spec_version_id"] for c in cells})
    publication = publication or current_publication(store)
    if publication is None:
        # Nothing published yet: the newest version of each spec, which is what
        # documents() does with None. The migration builds the very first
        # documents payload in exactly this state.
        return None
    return sorted({c["spec_version_id"] for c in _rows(store, "aci_publication_cells")
                   if c["publication_id"] == publication["id"]})


def judging_registry(store):
    """{slug: entry} in the shape harness.load_registry() returns.

    The judging entry where a behaviour has one, the display entry where it does
    not. harness._panel_shape adapts the second, which is what lets a behaviour
    someone has just registered be judged before anyone has written its
    boundary -- against a blank scope, which is a weaker instruction and says so.
    """
    out = {}
    for slug, entry in behaviours(store).items():
        judging = entry.pop("judging", None)
        out[slug] = judging or entry
    return out
