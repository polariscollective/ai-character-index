#!/usr/bin/env python3
"""One link run as a page you can read.

    python3 engine/panel/link_viewer.py artefacts/<run folder>/links.json

Writes `links.html` beside it: one self-contained file, no server, no network.
The report next to it is for the record; this is for looking. It puts the
disagreements first, because a page that opens on eighty passages that say the
same thing teaches nothing.

Each source passage is shown whole, with every counterpart whole beside it, the
relation between them, who may lift each rule, and what each judge said. That is
the only way to tell whether a link is worth anything: the relation alone is an
opinion, the two passages are the evidence.
"""

import argparse
import html
import json
import sys
from pathlib import Path

# Most divergent first. A page that opens on agreement hides what it is for.
ORDER = ["contradiction", "nuance", "stricter_source", "stricter_target", "same", None]

WORDS = {
    "contradiction": "cannot both be obeyed",
    "nuance": "differ, both satisfiable",
    "stricter_source": "the first demands more",
    "stricter_target": "the second demands more",
    "same": "the same rule",
    None: "the judges did not settle it",
}

FORCE_WORDS = {
    "nobody": "nobody may lift it",
    "priority": "no principal may lift it, the document's own ordering can outweigh it",
    "operator": "an operator may lift it",
    "user": "only the user may lift it",
    "unstated": "the document does not say",
}

STYLE = """
:root {
  --paper: #F1EFE3; --ink: #23281B; --olive-deep: #333D22; --olive: #5C6B3C;
  --chartreuse: #B7C94B; --fail: #A0522D; --warn: #C9A227; --neutral: #8A8F7A;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink);
       font: 16px/1.6 "Instrument Sans", system-ui, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 32px 16px 96px; }
h1 { font-size: 28px; margin: 0 0 8px; font-weight: 600; }
h2 { font-size: 20px; font-weight: 600; margin: 48px 0 8px; padding-top: 16px;
     border-top: 1px solid var(--olive); }
.meta { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 13px;
        color: var(--olive); }
.warn { border: 1px solid var(--fail); padding: 12px 16px; margin: 16px 0;
        color: var(--fail); }
.filters { position: sticky; top: 0; background: var(--paper); padding: 12px 0;
           border-bottom: 1px solid var(--olive); margin-bottom: 8px; z-index: 2; }
button { font: inherit; font-size: 14px; border: 1px solid var(--olive);
         background: transparent; color: var(--ink); border-radius: 999px;
         padding: 4px 14px; margin: 2px 4px 2px 0; cursor: pointer; }
button[aria-pressed="true"] { background: var(--chartreuse); border-color: var(--chartreuse); }
.link { margin: 24px 0; padding-left: 14px; border-left: 3px solid var(--neutral); }
.link[data-relation="contradiction"] { border-left-color: var(--fail); }
.link[data-relation="nuance"], .link[data-relation="stricter_source"],
.link[data-relation="stricter_target"] { border-left-color: var(--warn); }
.link[data-relation="same"] { border-left-color: var(--olive); }
.relation { font-weight: 600; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px; }
@media (max-width: 760px) { .pair { grid-template-columns: 1fr; } }
.side { border-top: 1px solid var(--olive); padding-top: 8px; }
.loc { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px;
       color: var(--olive); display: block; margin-bottom: 6px; word-break: break-word; }
.quote { margin: 0; }
.force { font-size: 13px; color: var(--olive); margin-top: 6px; }
.judges { margin-top: 10px; font-size: 14px; }
.judges li { margin-bottom: 4px; }
.judges b { font-family: "IBM Plex Mono", ui-monospace, monospace; font-weight: 500; }
.hidden { display: none; }
"""

SCRIPT = """
const buttons = document.querySelectorAll("[data-filter]");
buttons.forEach(b => b.addEventListener("click", () => {
  b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
  const on = [...buttons].filter(x => x.getAttribute("aria-pressed") === "true")
                         .map(x => x.dataset.filter);
  document.querySelectorAll(".link").forEach(el => {
    el.classList.toggle("hidden", on.length > 0 && !on.includes(el.dataset.relation));
  });
  document.querySelectorAll("section").forEach(s => {
    const any = [...s.querySelectorAll(".link")].some(el => !el.classList.contains("hidden"));
    s.classList.toggle("hidden", !any);
  });
}));
"""


def e(text):
    return html.escape(str(text if text is not None else ""))


def links_of(direction):
    """Every (source, target) pair of a direction, most divergent first."""
    pairs = []
    for source in direction["sources"]:
        for target in source["targets"]:
            pairs.append((source, target))
    return sorted(pairs, key=lambda p: ORDER.index(p[1]["relation"])
                  if p[1]["relation"] in ORDER else len(ORDER))


def render(data):
    run = data["run"]
    out = [f"<title>Links {e(run['id'][:8])}</title>", f"<style>{STYLE}</style>", "<main>"]
    out.append(f"<h1>What one document does to the other</h1>")
    out.append(f"<p class='meta'>Run {e(run['id'])} &middot; panel "
               f"{e(', '.join(run.get('panel') or []))} &middot; cost ${e(run.get('cost_usd'))}</p>")

    seats = {c["model"]: c["status"] for d in data["directions"] for c in d.get("calls", [])}
    absent = [m for m, s in seats.items() if s != "done"]
    if absent:
        out.append(f"<p class='warn'>{e(', '.join(sorted(absent)))} did not answer, so these "
                   "links are what the other judges said. Nothing here is the panel's finding, "
                   "and nothing here can be published.</p>")

    out.append("<div class='filters'>Show: ")
    for relation in ORDER:
        name = relation or "unsettled"
        out.append(f"<button data-filter='{e(name)}' aria-pressed='false'>{e(name)}</button>")
    out.append("<span class='meta'>&nbsp;none pressed shows everything</span></div>")

    for direction in data["directions"]:
        pairs = links_of(direction)
        counts = direction["counts"]
        out.append("<section>")
        out.append(f"<h2>{e(direction['source'])} &rarr; {e(direction['target'])}</h2>")
        out.append(f"<p class='meta'>{e(counts['sources'])} source passages, "
                   f"{len(pairs)} links, {e(counts['contradictions'])} contradictions the panel "
                   f"asserts, {e(counts['silent'])} silences</p>")
        for source, target in pairs:
            relation = target["relation"] or "unsettled"
            out.append(f"<div class='link' data-relation='{e(relation)}'>")
            out.append(f"<span class='relation'>{e(relation)}</span> "
                       f"<span class='meta'>{e(WORDS.get(target['relation'], ''))} &middot; "
                       f"{e(', '.join(target['judges']))}</span>")
            out.append("<div class='pair'>")
            for locator, quote, force in (
                    (source["locator"], source["quote"], source["source_force"]),
                    (target["locator"], target["quote"], target["target_force"])):
                out.append("<div class='side'>")
                out.append(f"<span class='loc'>{e(locator)}</span>")
                out.append(f"<p class='quote'>{e(quote)}</p>")
                out.append(f"<p class='force'>{e(FORCE_WORDS.get(force, force))}</p>")
                out.append("</div>")
            out.append("</div>")
            out.append("<ul class='judges'>")
            for judge, rationale in target["rationales"].items():
                out.append(f"<li><b>{e(judge)}</b>: {e(rationale)}</li>")
            out.append("</ul></div>")
        out.append("</section>")

    out.append("</main>")
    out.append(f"<script>{SCRIPT}</script>")
    return "\n".join(out)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("links_json", help="the links.json of a run's report folder")
    args = parser.parse_args(argv)

    source = Path(args.links_json)
    data = json.loads(source.read_text(encoding="utf-8"))
    page = source.with_name("links.html")
    page.write_text(render(data), encoding="utf-8")
    print(f"written to {page}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
