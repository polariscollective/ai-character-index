#!/usr/bin/env python3
"""One link run, read.

    python3 engine/panel/link_report.py --run=<uuid>

Writes two files into artefacts/: links.md to read, and links.json for whatever
comes next. The report is what the first run is for, so it carries the numbers a
reader has to weigh -- how many passages were linked, contradicted or found
unanswered, and how often the three judges agreed -- beside the passages
themselves.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import compose_links              # noqa: E402
import index_store                # noqa: E402
import link_consensus             # noqa: E402
from store import Store           # noqa: E402

h = compose_links.h


def report(store, run_id, passages_for=None, retained_for=None):
    """The whole run as a plain dictionary: one entry per direction."""
    passages_for = passages_for or h.passages
    retained_for = retained_for or compose_links.retained_passages

    run = next(r for r in store.select("aci_link_runs") if r["id"] == run_id)
    calls = [c for c in store.select("aci_link_calls") if c["run_id"] == run_id]
    links = store.select("aci_links")
    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    by_call = {}
    for row in links:
        by_call.setdefault(row["call_id"], []).append(row)

    cells = {}
    for call in calls:
        key = (call["behaviour_slug"], call["source_version_id"],
               call["target_version_id"])
        cells.setdefault(key, []).append(call)

    directions = []
    for (slug, source_id, target_id), cell in sorted(cells.items()):
        source, target = versions[source_id], versions[target_id]
        quotes = {p[0]: p[2] for p in retained_for(store, slug, source)}
        quotes.update({p[0]: p[2]
                       for p in passages_for(target["spec_id"], target["version"])})
        asserted = link_consensus.assertions(
            {call["model"]: by_call.get(call["id"], []) for call in cell})

        sources = []
        for locator, entry in asserted.items():
            sources.append({
                "locator": locator,
                "quote": quotes.get(locator, ""),
                "state": entry["state"],
                "relation": entry["relation"],
                "source_force": entry["source_force"],
                "judges_linking": entry["judges_linking"],
                "silences": entry["silences"],
                "targets": [dict(found, quote=quotes.get(found["locator"], ""))
                            for found in entry["targets"]],
            })

        counts = {
            "sources": len(sources),
            "linked": sum(1 for s in sources if s["state"] == link_consensus.LINKED),
            "silent": sum(1 for s in sources if s["state"] == link_consensus.SILENT),
            "contested": sum(1 for s in sources if s["state"] == link_consensus.CONTESTED),
            "contradictions": sum(1 for s in sources if s["relation"] == "contradiction"),
        }
        # Unanimity is the three judges saying the same thing, and "nobody
        # linked it" is not that. A source is silent when every judge answered
        # absent, and contested when one of them never answered at all, which is
        # what a failed call leaves behind. Counting the second as agreement
        # would report the judges unanimous on exactly the cells a failure
        # spoiled, which is the reading this number exists to prevent.
        unanimous = sum(1 for s in sources
                        if s["state"] == link_consensus.SILENT
                        or s["judges_linking"] == len(cell))
        directions.append({
            "behaviour": slug,
            "source": compose_links.document_id(source),
            "target": compose_links.document_id(target),
            "judges": sorted(call["model"] for call in cell),
            "counts": counts,
            "agreement": {"sources": len(sources), "unanimous": unanimous},
            "sources": sources,
        })

    return {"run": {"id": run["id"], "panel": run["panel"],
                    "status": run["status"],
                    "estimated_usd": run.get("estimated_usd"),
                    "cost_usd": run.get("cost_usd"),
                    "prompt_sha256": run.get("prompt_sha256")},
            "directions": directions}


def render(data):
    """The markdown. Plain, and in the order a reader wants: the counts first,
    then every passage with what the panel made of it."""
    out = [f"# Link run {data['run']['id']}", ""]
    run = data["run"]
    out.append(f"Panel: {', '.join(run['panel'])}. Status: {run['status']}. "
               f"Estimated ${run.get('estimated_usd')}, cost ${run.get('cost_usd')}.")
    out.append("")
    for direction in data["directions"]:
        counts = direction["counts"]
        out.append(f"## {direction['behaviour']}: {direction['source']} "
                   f"-> {direction['target']}")
        out.append("")
        out.append(f"{counts['sources']} source passages: {counts['linked']} linked "
                   f"({counts['contradictions']} contradictions), {counts['silent']} "
                   f"silent, {counts['contested']} contested. The judges were "
                   f"unanimous on {direction['agreement']['unanimous']} of "
                   f"{direction['agreement']['sources']}.")
        out.append("")
        for source in direction["sources"]:
            relation = source["relation"] or "unsettled"
            out.append(f"### [{source['state']}, {relation}] {source['locator']}")
            out.append("")
            out.append(f"> {source['quote']}")
            out.append("")
            out.append(f"Force: {source['source_force']}.")
            out.append("")
            for target in source["targets"]:
                out.append(f"- **{target['relation'] or 'unsettled'}** "
                           f"({', '.join(target['judges'])}, force "
                           f"{target['target_force']}) {target['locator']}")
                out.append(f"  > {target['quote']}")
                for judge, rationale in target["rationales"].items():
                    out.append(f"  - {judge}: {rationale}")
            for judge, rationale in source["silences"].items():
                out.append(f"- **none** ({judge}): {rationale}")
            out.append("")
    return "\n".join(out) + "\n"


def write(store, run_id, out_dir, passages_for=None, retained_for=None):
    data = report(store, run_id, passages_for, retained_for)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    folder = Path(out_dir) / f"{stamp}-links-{run_id[:8]}"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "links.md").write_text(render(data), encoding="utf-8")
    (folder / "links.json").write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return folder


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--run", required=True, help="an aci_link_runs id")
    parser.add_argument("--out", default=str(ROOT / "artefacts"),
                        help="where the report goes (default: artefacts/)")
    args = parser.parse_args(argv)

    store = Store.from_env()
    index_store.install_registry(store)
    folder = write(store, args.run, args.out)
    print(f"written to {folder}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
