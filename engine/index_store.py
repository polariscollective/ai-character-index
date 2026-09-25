"""The index, read back out of its tables in the shapes the builders expect.

Every function here returns what a committed file used to hold, so the builders
downstream keep working on the shape they already know. The seam is deliberate:
the builders' logic is the part that has been proved byte-identical for a year,
and moving the data should not disturb it.

One convention is worth stating. A reader document is a version, and its id is
`<spec id>@<version>`, which is also the head of every locator into it. Two
versions of one specification are two documents.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "spec-cite"))
import cite  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent / "panel"))
import depth_call  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import manual_review  # noqa: E402


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


def cell_depths(store, cells, assessment_run_id=None, depth_prompt=None):
    """The depth of each cell a publication carries, from its own run.

    {(behaviour_slug, spec_version_id): {"mean": float, "judges": {model: {"depth",
    "rationale"}}}}. A cell any of whose done calls has no done depth is left out:
    the caller decides whether that refuses a publication.

    With no assessment run, this reads `aci_depths`, the scale of four, exactly
    as every publication built so far was, and `depth_prompt` is not read. With
    one, it reads `aci_depths_out_of_ten` instead, for that assessment run and
    the digest `depth_prompt` names, which is required: the digest a build was
    given, and a publication recorded, rather than the digest of the prompt of
    ten as it stands on disk, so a publication still reads its own depths after
    the prompt is edited. A row of another assessment run or another prompt
    digest is not read. The cell's entry then gains "scale": 10, and a judge's
    entry gains "model" and "substitution_reason" when a declared substitute
    gave that depth.

    A depth out of ten is given from the conflict rules of an assessment run's
    criteria, so an assessment run that takes its criteria from an earlier run
    reads the depths given against that run (`criteria_run_id`).
    """
    wanted = {(c["run_id"], c["behaviour_slug"], c["spec_version_id"]) for c in cells}
    # The manual call is not a judge: its depth, where it gave one, is read by
    # manual_reviews and only for a build that asks.
    calls = [c for c in _rows(store, "aci_judge_calls")
             if (c["run_id"], c["behaviour_slug"], c["spec_version_id"]) in wanted
             and c["status"] == "done" and not manual_review.is_manual(c)]

    if assessment_run_id is None:
        depths = {d["call_id"]: d for d in _rows(store, "aci_depths")}
    else:
        if depth_prompt is None:
            raise ValueError("depths out of ten are read by the digest of the prompt they were "
                             "given under: pass depth_prompt")
        given_with = criteria_run_id(store, assessment_run_id)
        depths = {d["call_id"]: d for d in _rows(store, "aci_depths_out_of_ten")
                  if d.get("assessment_run_id") == given_with
                  and d.get("prompt_sha256") == depth_prompt}

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


def manual_reviews(store, cells, assessment_run_id=None, depth_prompt=None):
    """The owner's corrections to the cells a publication carries.

    {(behaviour_slug, spec_version_id): {"passages": {locator: {"verdict", "note"}},
    "depth": {"depth", "rationale"} or None}}, for a cell whose run holds a
    manual call (manual_review.MANUAL), done, and nothing for any other. Only the
    run the cell is taken from counts, as for the judges.

    A manual depth is read on the scale of ten only, against the same
    assessment run and prompt digest as the judges' depths of the cell
    (cell_depths): a correction given against another reading of the document
    is not this publication's. With no assessment run, no depth is read.
    """
    wanted = {(c["run_id"], c["behaviour_slug"], c["spec_version_id"]) for c in cells}
    calls = [c for c in _rows(store, "aci_judge_calls", {"model": f"eq.{manual_review.MANUAL}"})
             if manual_review.is_manual(c) and c["status"] == "done"
             and (c["run_id"], c["behaviour_slug"], c["spec_version_id"]) in wanted]
    if not calls:
        return {}
    ids = "in.(" + ",".join(f'"{c["id"]}"' for c in calls) + ")"
    by_call = {c["id"]: (c["behaviour_slug"], c["spec_version_id"]) for c in calls}
    out = {key: {"passages": {}, "depth": None} for key in by_call.values()}
    for row in _rows(store, "aci_judgements", {"call_id": ids}):
        key = by_call.get(row["call_id"])
        if key is not None:
            out[key]["passages"][row["locator"]] = {"verdict": row["verdict"],
                                                    "note": row.get("note") or ""}
    if assessment_run_id is not None:
        given_with = criteria_run_id(store, assessment_run_id)
        for row in _rows(store, "aci_depths_out_of_ten", {"call_id": ids}):
            key = by_call.get(row["call_id"])
            if (key is not None and row.get("status") == "done"
                    and row.get("assessment_run_id") == given_with
                    and row.get("prompt_sha256") == depth_prompt):
                out[key]["depth"] = {"depth": row["depth"],
                                     "rationale": row.get("rationale") or ""}
    return out


SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def depth_scale(depth_prompt=None, assessment_run_id=None):
    """The scale a build reads its depths on, 4 or 10, from the depth prompt and
    the assessment run it names.

    Naming nothing, or the prompt of four, reads the scale of four, as every
    publication built before the scale of ten did. Depths out of ten are read
    with the assessment run they were given with, because the conflict rules
    each of those depths was shown come from that run, and under the digest of
    the prompt of ten they were given under, which must be named. That digest
    may be an earlier prompt of ten than the one on disk: a publication is
    rebuilt with the digest it recorded, and whether a new publication uses the
    current prompt of ten is `publish.py`'s check, not this one. Any other
    pairing is refused, naming the digest given and the digest expected, rather
    than building a payload on a scale nobody asked for.
    """
    four, ten = depth_call.prompt_sha256(4), depth_call.prompt_sha256(10)
    if assessment_run_id is not None:
        if depth_prompt is None or depth_prompt == four:
            named = depth_prompt or f"{four}, the prompt of four, by default"
            raise SystemExit(
                f"--assessment-run={assessment_run_id} reads depths out of ten, given under "
                f"a depth prompt of ten ({ten} as it stands), and --depth-prompt names "
                f"{named}. Pass --depth-prompt= with the digest the depths were given under.")
        if not SHA256_RE.match(depth_prompt):
            raise SystemExit(
                f"--depth-prompt={depth_prompt} is not a sha256 digest: name the digest of "
                f"the prompt of ten the depths were given under ({ten} as it stands).")
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


UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
                     re.IGNORECASE)


def assessment_run_id(value, flag="--assessment-run"):
    """`value` as an assessment run id, in lowercase as the database writes it,
    or a refusal naming what was given.

    Checked before anything is read: PostgREST answers a filter on a uuid column
    that holds something else with an error about the query, which says nothing
    about the id that was mistyped."""
    if UUID_RE.match(value or ""):
        return value.lower()
    raise SystemExit(
        f"{flag}={value} is not an assessment run id. An assessment run id is a uuid, "
        "36 characters of hexadecimal digits and hyphens, as engine/assess.py prints it "
        "and aci_assessment_runs holds it.")


def _any_of(values):
    """A PostgREST `in.()` filter, each value quoted, as seat_substitutions sends."""
    return "in.(" + ",".join(f'"{value}"' for value in sorted(values)) + ")"


def _assessment_run(store, assessment_run_id):
    """The row of assessment run `assessment_run_id`, or None."""
    runs = [row for row in _rows(store, "aci_assessment_runs",
                                 {"id": f"eq.{assessment_run_id}"})
            if row["id"] == assessment_run_id]
    return runs[0] if runs else None


def _criteria_from(run):
    """The id of the run whose criteria `run` takes, or None."""
    return ((run or {}).get("config") or {}).get("criteria_from")


def criteria_run_id(store, assessment_run_id):
    """The id of the run whose criteria, conflict rules and depths out of ten
    stand for assessment run `assessment_run_id`: the run it takes its
    criteria from (`config["criteria_from"]`, `assess.py --criteria-from`), or
    the run itself."""
    return _criteria_from(_assessment_run(store, assessment_run_id)) or assessment_run_id


def _run_rows(store, assessment_run_id, wanted, claims=True, pooled=True):
    """{version id: {"calls", "scores", "claims", "verdicts"}}, what run
    `assessment_run_id` wrote about the versions `wanted`, its claims and
    verdicts left unread unless `claims`. With `claims` and `pooled`, a
    version the run pooled with versions it holds calls on and `wanted` leaves
    out also carries them (`_pooled_with`)."""
    by_version = {version_id: {"calls": [], "scores": [], "claims": [], "verdicts": []}
                  for version_id in wanted}

    def everything(table):
        return [row for row in _rows(store, table, {"run_id": f"eq.{assessment_run_id}"})
                if row["run_id"] == assessment_run_id]

    def mine(table):
        return [row for row in everything(table) if row["spec_version_id"] in wanted]

    every_call = everything("aci_assessment_calls")
    calls = [call for call in every_call if call["spec_version_id"] in wanted]
    claim_rows = mine("aci_assessment_claims") if claims else []
    version_of_call = {call["id"]: call["spec_version_id"] for call in calls}
    version_of_claim = {claim["id"]: claim["spec_version_id"] for claim in claim_rows}
    scores = ([row for row in _rows(store, "aci_assessment_scores",
                                    {"call_id": _any_of(version_of_call)})
               if row["call_id"] in version_of_call] if calls else [])
    verdicts = ([row for row in _rows(store, "aci_assessment_verdicts",
                                      {"claim_id": _any_of(version_of_claim)})
                 if row["claim_id"] in version_of_claim] if claim_rows else [])
    for call in calls:
        by_version[call["spec_version_id"]]["calls"].append(call)
    for claim in claim_rows:
        by_version[claim["spec_version_id"]]["claims"].append(claim)
    for score in scores:
        by_version[version_of_call[score["call_id"]]]["scores"].append(score)
    for verdict in verdicts:
        by_version[version_of_claim[verdict["claim_id"]]]["verdicts"].append(verdict)
    if claims and pooled:
        _pooled_with(store, by_version, every_call)
    return by_version


def _pools_versions(run):
    """Whether assessment run `run` pooled the findings of a document's
    versions together, as the second method does. The first method, told by
    its contradictions prompt, pooled each version on its own, so no version
    of one of its runs stands on another's finders."""
    import assessment_call  # noqa: E402
    return not assessment_call.of_the_first_method((run or {}).get("prompts"))


def _pooled_with(store, by_version, calls):
    """Give each version of `by_version` that the run pooled with versions
    `by_version` leaves out, `pooled_with`: [{"name", "calls"}], one per such
    version, `name` its `<spec id>@<version>` and `calls` its finding calls.

    An assessment run of the second method pools the findings of every
    version of one document it assesses, and writes their claims only once
    every contradictions seat has answered on all of them; so a version named
    alone stands on the finders of versions it does not name. A run of the
    first method is not given it (`_pools_versions`). Nothing is read, and the rows keep
    their shape, when every version the run holds a call on is named."""
    others = {call["spec_version_id"] for call in calls} - set(by_version)
    if not others:
        return
    ids = others | set(by_version)
    versions = {row["id"]: row for row in _rows(store, "aci_spec_versions", {
        "select": "id,spec_id,version", "id": _any_of(ids)}) if row["id"] in ids}
    for version_id, rows in by_version.items():
        spec_id = (versions.get(version_id) or {}).get("spec_id")
        pooled = [{"name": f"{versions[other]['spec_id']}@{versions[other]['version']}",
                   "calls": [call for call in calls if call["spec_version_id"] == other
                             and call["question"] == "contradictions"]}
                  for other in sorted(others, key=lambda other: (
                      (versions.get(other) or {}).get("version") or "", other))
                  if spec_id is not None and (versions.get(other) or {}).get("spec_id") == spec_id]
        if pooled:
            rows["pooled_with"] = pooled


def assessment_run_rows(store, assessment_run_id, spec_version_ids):
    """(run, {version id: {"calls", "scores", "claims", "verdicts"}}): what one
    assessment run itself wrote, restricted to the documents named. The run is
    None when no run carries that id. This is what taking a run up again reads;
    what a run stands on is `assessment_rows`.

    Each read is filtered to the run, or to the calls and claims already read,
    and every row is held to the run and the documents again once read, so a
    store that answered a filter loosely could not bring another run's rows in.
    """
    wanted = set(spec_version_ids)
    run = _assessment_run(store, assessment_run_id)
    if run is None:
        return None, {version_id: {"calls": [], "scores": [], "claims": [], "verdicts": []}
                      for version_id in wanted}
    return run, _run_rows(store, assessment_run_id, wanted, pooled=_pools_versions(run))


def assessment_rows(store, assessment_run_id, spec_version_ids):
    """(run, {version id: {"calls", "scores", "claims", "verdicts"}}): the rows
    one assessment run stands on, restricted to the documents named, in
    `assessment_run_rows`'s shape. The run is None when no run carries that id.

    A run that takes its criteria from an earlier run (`criteria_from` in its
    config) stands on that run's criteria calls and their scores, and on its
    own contradictions, readings, claims and verdicts. Its row is then returned
    with `criteria_run`, the earlier run's row, or None when no run carries
    that id, so the gaps can be checked half by half. A run that takes nothing
    stands on its own rows, as `assessment_run_rows` reads them.
    """
    wanted = set(spec_version_ids)
    run, by_version = assessment_run_rows(store, assessment_run_id, wanted)
    taken_from = _criteria_from(run)
    if taken_from is None:
        return run, by_version
    criteria_run = _assessment_run(store, taken_from)
    theirs = (_run_rows(store, taken_from, wanted, claims=False) if criteria_run is not None
              else {version_id: {"calls": [], "scores": []} for version_id in wanted})
    for version_id, own in by_version.items():
        criteria = [call for call in theirs[version_id]["calls"] if call["question"] == "criteria"]
        asked = {call["id"] for call in criteria}
        own_calls = [call for call in own["calls"] if call["question"] != "criteria"]
        kept = {call["id"] for call in own_calls}
        by_version[version_id] = {
            "calls": criteria + own_calls,
            "scores": ([score for score in theirs[version_id]["scores"]
                        if score["call_id"] in asked]
                       + [score for score in own["scores"] if score["call_id"] in kept]),
            "claims": own["claims"], "verdicts": own["verdicts"]}
        if "pooled_with" in own:
            by_version[version_id]["pooled_with"] = own["pooled_with"]
    return dict(run, criteria_run=criteria_run), by_version


def _criteria_gaps(name, calls, scores, seats, where=""):
    """Every criteria seat of `seats` with no done call among `calls`, or
    whose done call left a criterion unscored in `scores`."""
    scored = {}
    for score in scores:
        scored.setdefault(score["call_id"], set()).add(score["criterion"])
    gaps = []
    for seat in seats:
        done = [call for call in calls if call["question"] == "criteria"
                and call["seat"] == seat and call["status"] == "done"]
        if not done:
            gaps.append(f"{name}: {seat} gave no criteria answer{where}")
            continue
        missing = [criterion for criterion in _criteria() if criterion not in
                   scored.get(done[0]["id"], set())]
        if missing:
            gaps.append(f"{name}: {seat}'s criteria answer scored no {', '.join(missing)}{where}")
    return gaps


def _silent(calls, seats):
    """Every seat of `seats` with no done finding among `calls`."""
    return [seat for seat in seats
            if not any(call["question"] == "contradictions" and call["seat"] == seat
                       and call["status"] == "done" for call in calls)]


def _contradictions_gaps(name, calls, claims, verdicts, seats, where="", pooled_with=()):
    """Every contradictions seat of `seats` with no done finding among
    `calls`, or among the calls of a version `pooled_with` names, every
    reading asked that did not finish, and every seat that left a claim of
    `claims` unread in `verdicts`."""
    gaps = [f"{name}: {seat} gave no contradictions answer{where}"
            for seat in _silent(calls, seats)]
    gaps += [f"{name}: {seat} gave no contradictions answer on {other['name']}, whose "
             f"contradictions are pooled with this version's{',' if where else ''}{where}"
             for other in pooled_with for seat in _silent(other["calls"], seats)]
    unfinished = sorted(call["seat"] for call in calls
                        if call["question"] == "confirm" and call["status"] != "done")
    if unfinished:
        gaps.append(f"{name}: the confirmation asked of {', '.join(unfinished)} "
                    f"did not finish{where}")
    # One reading per seat per claim, the table's primary key being (claim,
    # seat), so a claim is read in full when every seat has a row on it.
    read_by = {}
    for verdict in verdicts:
        read_by.setdefault(verdict["claim_id"], set()).add(verdict["seat"])
    for seat in seats:
        unread = [claim for claim in claims if seat not in read_by.get(claim["id"], set())]
        if unread:
            gaps.append(f"{name}: {seat} gave no reading of {len(unread)} of its "
                        f"{len(claims)} claimed contradictions{where}")
    return gaps


def _criteria():
    # Imported here rather than at the top, so that a build naming no
    # assessment run loads only the modules it loaded before assessments existed.
    import assessment_call  # noqa: E402
    return assessment_call.CRITERIA


def criteria_gaps(name, rows, seats):
    """What keeps the criteria of the rows one run wrote about one document
    from standing, by the rule `assessment_gaps` applies to them: every seat of
    `seats` answered, with all four criteria scored. One sentence per gap, each
    opening with `name`, the document's."""
    calls = [call for call in rows.get("calls") or [] if call["question"] == "criteria"]
    if not calls:
        return [f"{name}: the assessment run did not assess it"]
    return _criteria_gaps(name, calls, rows.get("scores") or [], seats)


def assessment_gaps(assessment_run_id, run, by_version, versions):
    """What keeps an assessment run from standing for each document named, one
    sentence per gap, or nothing when it assessed them all.

    The run must have finished: one left `running` or `error` stopped somewhere,
    and what it never wrote cannot be told apart from what nobody found. A
    document is then assessed when every seat of the run's criteria answered
    with all four criteria scored, every seat of its contradictions answered,
    every reading it asked finished, and every claim written about it carries a
    reading from every seat of the contradictions. A seat that could not answer
    and whose substitutes could not either leaves its call in error, and a
    total built without it would be a mean of fewer judges presented as the
    panel's; a claim a seat never read would be settled on fewer readings than
    the rule counts on, and could be left unconfirmed by a reading that was
    never given. In a run of the second method, a version's claims are pooled
    with those of every other version of its document the run assessed, so it
    is held to the finders of those versions too, named or not
    (`pooled_with`): a version whose claims were never written because a
    finder failed on another version reads exactly like one with none.

    A run that takes its criteria from an earlier run (`assessment_rows` gives
    its row a `criteria_run`) is held to each half in its own run: the
    criteria to the earlier run, which must exist and have finished, under the
    criteria seats that run recorded, and the contradictions to the run itself.
    Each of its gaps then names the run it is in.
    """
    if run is None:
        return [f"there is no assessment run {assessment_run_id}"]
    panels = run.get("panels") or {}
    taken_from = _criteria_from(run)
    gaps = []
    if taken_from is not None:
        criteria_run = run.get("criteria_run")
        taken = (f"assessment run {taken_from}, whose criteria assessment run "
                 f"{assessment_run_id} takes")
        if criteria_run is None:
            gaps.append(f"there is no {taken}")
        elif criteria_run.get("status") != "done":
            gaps.append(f"{taken}, has status {criteria_run.get('status')}, not done, so what "
                        "it wrote may stop short of what it would have written")
    if run.get("status") != "done":
        names = ", ".join(f"{version['spec_id']}@{version['version']}" for version in versions)
        gaps.append(f"the run's status is {run.get('status')}, not done, so what it wrote about "
                    f"{names} may stop short of what it would have written"
                    + (f" (assessment run {assessment_run_id})" if taken_from else ""))
    for version in versions:
        name = f"{version['spec_id']}@{version['version']}"
        rows = by_version.get(version["id"]) or {}
        calls = rows.get("calls") or []
        claims, verdicts = rows.get("claims") or [], rows.get("verdicts") or []
        if taken_from is None:
            if not calls:
                gaps.append(f"{name}: the assessment run did not assess it")
                continue
            gaps += _criteria_gaps(name, calls, rows.get("scores") or [],
                                   panels.get("criteria", []))
            gaps += _contradictions_gaps(name, calls, claims, verdicts,
                                         panels.get("contradictions", []),
                                         pooled_with=rows.get("pooled_with") or ())
            continue
        if criteria_run is not None:
            criteria = [call for call in calls if call["question"] == "criteria"]
            if not criteria:
                gaps.append(f"{name}: {taken}, did not assess it")
            else:
                gaps += _criteria_gaps(name, criteria, rows.get("scores") or [],
                                       (criteria_run.get("panels") or {}).get("criteria", []),
                                       f" in assessment run {taken_from}")
        own = [call for call in calls if call["question"] != "criteria"]
        if not own:
            gaps.append(f"{name}: the assessment run did not assess it "
                        f"(assessment run {assessment_run_id})")
        else:
            gaps += _contradictions_gaps(name, own, claims, verdicts,
                                         panels.get("contradictions", []),
                                         f" in assessment run {assessment_run_id}",
                                         pooled_with=rows.get("pooled_with") or ())
    return gaps


def assessment(store, assessment_run_id, versions):
    """(run, {version id: rows}) for an assessment run that assessed every
    document in `versions`, or a refusal naming every gap at once.

    The remedy it names is to take the run up where it stopped, which asks only
    the calls not done and says when a document can only be assessed in a new
    assessment run instead; with no run of that id, a new run. A depth out of
    ten belongs to the assessment run it was given with, so the depths are
    given against the run that stands, or read from the run whose criteria it
    takes.
    """
    run, by_version = assessment_rows(store, assessment_run_id,
                                      [version["id"] for version in versions])
    gaps = assessment_gaps(assessment_run_id, run, by_version, versions)
    if gaps:
        if run is None:
            first = ("Assess these documents in a new assessment run (engine/assess.py "
                     "--documents=... --go)")
        else:
            first = (f"Take the run up where it stopped (engine/assess.py "
                     f"--resume={assessment_run_id} --documents=... --go), which asks only the "
                     "calls not done and says when a document can only be assessed in a new "
                     "assessment run instead")
        taken_from = _criteria_from(run)
        depths = (f"depths out of ten are read from assessment run {taken_from}, whose "
                  "criteria this run takes, so a gap in those criteria is that run's"
                  if taken_from else
                  "depths out of ten belong to the run they were given with: give them "
                  "against the run that stands (engine/panel/depth_pass.py --runs=... "
                  "--assessment-run=<id> --go), then build with --assessment-run=<id>")
        raise SystemExit(
            f"assessment run {assessment_run_id} does not assess every document this "
            "publication carries:\n  " + "\n  ".join(gaps) + f"\n{first}, and {depths}.")
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
