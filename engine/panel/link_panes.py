#!/usr/bin/env python3
"""Two documents side by side, with the links drawn between them.

    python3 engine/panel/link_panes.py artefacts/<run folder>/links.json
    python3 engine/panel/link_panes.py <links.json> --judge=sol --left=anthropic

Writes `panes.html` beside it. The report is the record and `link_viewer.py` is
the list of links; this is the thing you read a document in, with what the other
document does to each passage shown against it.

Both documents are rendered whole, in reading order, in their own scrolling
pane. A passage the panel judged carries its bubbles: one per counterpart, the
word for the relation, coloured by the gravest reading any judge gave it.
Clicking a bubble scrolls the other pane to that paragraph and flashes it.

Links from both directions of a run live in the same page, so the bubbles appear
on both sides: what A says about B's passage, and what B says about A's.

`--judge` shows one judge's readings and nothing else, which is what exploring a
run wants: the panel's summary is a publishing rule, and with one seat it says
nothing at all. `--left` names the document to put on the left, by any prefix of
its id.

It reads the documents through the panel's own passage cutter, so a locator here
is the locator the index publishes, and the paragraph under it is the one the
judges were shown.
"""

import argparse
import html
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import index_store                # noqa: E402
import link_call                  # noqa: E402
from store import Store           # noqa: E402

h = link_call.h

# Gravest first: the colour and the sort follow the worst reading any judge gave.
ORDER = ["contradiction", "nuance", "stricter_source", "stricter_target", "same"]

SHORT = {
    "contradiction": "contradiction",
    "nuance": "nuance",
    "stricter_source": "stricter here",
    "stricter_target": "stricter there",
    "same": "same",
}

STYLE = """
:root {
  --paper: #F1EFE3; --ink: #23281B; --olive-deep: #333D22; --olive: #5C6B3C;
  --chartreuse: #B7C94B; --fail: #A0522D; --warn: #C9A227; --neutral: #8A8F7A;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink);
       font: 15px/1.55 "Instrument Sans", system-ui, sans-serif; height: 100vh;
       display: flex; flex-direction: column; }
header { padding: 10px 16px; border-bottom: 1px solid var(--olive); }
h1 { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
.meta { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px;
        color: var(--olive); }
.warn { color: var(--fail); }
.panes { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 0; min-height: 0; }
.pane { overflow-y: auto; padding: 16px 20px 60vh; border-right: 1px solid var(--olive); }
.pane:last-child { border-right: none; }
.pane h2 { position: sticky; top: -16px; background: var(--paper); margin: 0 0 12px;
           padding: 8px 0; font-size: 14px; font-weight: 600; color: var(--olive-deep);
           border-bottom: 1px solid var(--olive); }
p.para { margin: 0 0 12px; }
p.para.judged { background: rgba(183, 201, 75, 0.22); padding: 6px 8px; border-radius: 3px; }
p.para.flash { animation: flash 1.4s ease-out; }
@keyframes flash { from { background: var(--chartreuse); } to { background: transparent; } }
p.para.judged.flash { animation: flashjudged 1.4s ease-out; }
@keyframes flashjudged { from { background: var(--chartreuse); }
                         to { background: rgba(183, 201, 75, 0.22); } }
.bubbles { margin: 2px 0 12px; display: flex; flex-wrap: wrap; gap: 4px; }
.bubble { font-size: 12px; border-radius: 999px; padding: 1px 9px; text-decoration: none;
          border: 1px solid var(--neutral); color: var(--ink); cursor: pointer;
          font-family: "IBM Plex Mono", ui-monospace, monospace; }
.bubble[data-relation="contradiction"] { border-color: var(--fail); color: var(--fail); }
.bubble[data-relation="nuance"] { border-color: var(--warn); }
.bubble[data-relation="stricter_source"], .bubble[data-relation="stricter_target"] {
  border-color: var(--olive-deep); }
.bubble[data-relation="same"] { border-color: var(--olive); color: var(--olive); }
.bubble.parted { border-style: dashed; }
.bubble:hover { background: var(--chartreuse); border-color: var(--chartreuse); color: var(--ink); }
"""

SCRIPT = """
document.querySelectorAll(".bubble").forEach(b => b.addEventListener("click", ev => {
  ev.preventDefault();
  const target = document.getElementById(b.dataset.goto);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("flash");
  void target.offsetWidth;
  target.classList.add("flash");
}));
"""


def e(text):
    return html.escape(str(text if text is not None else ""))


def gravest(relations):
    known = [r for r in relations if r in ORDER]
    return sorted(known, key=ORDER.index)[0] if known else None


def bubbles_by_locator(data, judge=None):
    """{source locator: [bubble]}, over both directions of the run.

    A bubble is what one passage's counterpart is, and where it lives. Judges
    that part are kept apart: the tooltip says who read what, and the bubble is
    coloured by the gravest of them.

    With `judge`, only that seat's readings are shown, and the relation is its
    own rather than the panel's. A run explored one seat at a time has no
    consensus to report, and reporting one would be a claim nobody made.
    """
    out = {}
    for direction in data["directions"]:
        for source in direction["sources"]:
            for target in source["targets"]:
                per_judge = target.get("judge_relations") or {}
                if judge is not None:
                    if judge not in per_judge:
                        continue
                    per_judge = {judge: per_judge[judge]}
                said = list(per_judge.values()) or [target["relation"]]
                worst = gravest(said) or "same"
                told = ", ".join(f"{j}: {r}" for j, r in per_judge.items()) \
                    or ", ".join(target["judges"])
                rationales = " | ".join(
                    f"{j}: {r}" for j, r in target["rationales"].items()
                    if judge is None or j == judge)
                out.setdefault(source["locator"], []).append({
                    "to": target["locator"],
                    "relation": worst,
                    "parted": len({s for s in said if s}) > 1,
                    "title": f"{told}\n\n{rationales}",
                })
    for bubbles in out.values():
        bubbles.sort(key=lambda b: ORDER.index(b["relation"]))
    return out


def documents_of(data, left=None):
    """The two document ids of a run, left then right.

    The run's own order by default, which is its first direction's. `left` names
    the one to put first, by any prefix of its id."""
    first = data["directions"][0]
    pair = [first["source"], first["target"]]
    if left and not pair[0].startswith(left):
        if pair[1].startswith(left):
            pair.reverse()
        else:
            sys.exit(f"--left={left!r} names neither {pair[0]} nor {pair[1]}")
    return pair


def passages_of(document_id):
    spec_id, version = document_id.split("@", 1)
    return h.passages(spec_id, version)


def render(data, panes, judge=None):
    run = data["run"]
    out = [f"<title>{e(' vs '.join(d for d, _ in panes))}</title>",
           f"<style>{STYLE}</style>"]
    out.append("<header>")
    out.append("<h1>What each document does to the other, passage by passage</h1>")
    behaviours = sorted({d["behaviour"] for d in data["directions"]})
    seats = e(judge) if judge else e(", ".join(run.get("panel") or []))
    out.append(f"<p class='meta'>{e(', '.join(behaviours))} &middot; run {e(run['id'][:8])} "
               f"&middot; {'read by ' if judge else 'panel '}{seats}</p>")
    if judge:
        out.append(f"<p class='meta'>One judge's readings. There is no panel finding here, "
                   f"and no silence can be asserted from one seat.</p>")
    else:
        absent = sorted({c["model"] for d in data["directions"] for c in d.get("calls", [])
                         if c["status"] != "done"})
        if absent:
            out.append(f"<p class='meta warn'>{e(', '.join(absent))} did not answer. These are "
                       "the other judges' readings, not the panel's finding.</p>")
    out.append("</header>")

    ids = {}
    for pane, (document_id, passages) in enumerate(panes):
        for index, (locator, _section, _text) in enumerate(passages):
            ids[locator] = f"p{pane}-{index}"

    bubbles = bubbles_by_locator(data, judge)

    out.append("<div class='panes'>")
    for document_id, passages in panes:
        out.append("<div class='pane'>")
        out.append(f"<h2>{e(document_id)}</h2>")
        for locator, _section, text in passages:
            here = bubbles.get(locator, [])
            classes = "para judged" if here else "para"
            out.append(f"<p class='{classes}' id='{e(ids[locator])}'>{e(text)}</p>")
            if here:
                out.append("<div class='bubbles'>")
                for bubble in here:
                    goto = ids.get(bubble["to"])
                    if not goto:
                        continue
                    parted = " parted" if bubble["parted"] else ""
                    out.append(f"<a class='bubble{parted}' data-relation='{e(bubble['relation'])}' "
                               f"data-goto='{e(goto)}' title='{e(bubble['title'])}' href='#'>"
                               f"{e(SHORT.get(bubble['relation'], bubble['relation']))}</a>")
                out.append("</div>")
        out.append("</div>")
    out.append("</div>")
    out.append(f"<script>{SCRIPT}</script>")
    return "\n".join(out)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("links_json", help="the links.json of a run's report folder")
    parser.add_argument("--judge", default=None,
                        help="show one seat's readings only, for example sol")
    parser.add_argument("--left", default=None,
                        help="the document to put on the left, by any prefix of its id")
    args = parser.parse_args(argv)

    source = Path(args.links_json)
    data = json.loads(source.read_text(encoding="utf-8"))

    index_store.install_registry(Store.from_env())
    left, right = documents_of(data, args.left)
    panes = [(left, passages_of(left)), (right, passages_of(right))]

    page = source.with_name("panes.html")
    page.write_text(render(data, panes, args.judge), encoding="utf-8")
    print(f"written to {page}")
    for document_id, passages in panes:
        print(f"  {document_id}: {len(passages)} paragraphs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
