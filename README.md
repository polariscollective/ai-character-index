# Spec Reader

Run by Polaris Collective, started by Andres Cotton.

A tool for researchers working in the model-spec space. Point a panel of LLM judges at a spec -- Anthropic's constitution, OpenAI's Model Spec, or a document of your own -- and give the panel a behaviour you care about. You get back a passage-level coverage map: every place the spec addresses that behaviour, scored by each judge and quoted verbatim, browsable in a local reader.

What people use it for:

- **Assess coverage.** How well does a spec address a behaviour you are interested in? Is it a defining commitment, a passing mention, or a gap?
- **Locate the exact text.** Every verdict anchors to a specific passage, so you see precisely *where* in the spec a behaviour is addressed.
- **Select passages for downstream work.** Every citation is a stable, re-resolvable locator plus a verbatim quote, in plain JSON -- ready to feed automated adherence evals (for example, Petri scenarios testing whether models actually follow the passages you selected).
- **Experiment with spec edits.** Register your own spec versions locally, run the panel against each, and compare how coverage shifts as you rewrite.

The repo ships with a complete bench out of the box: ten behaviours judged against both bundled specs by a three-judge frontier panel, so you can explore an example with results before running anything yourself.

## Origins

This repository is Polaris Collective's continuation of the AI Character Index,
created by [Andrés Cotton](https://github.com/AndresCotton). The vision and the
initial execution are his, including the first version of the spec reader; Matt
Stults did the work of getting that production ready. The project passed to
Polaris Collective in September 2026, with Andrés's agreement, to be carried
further.

**The original repository is
[`AndresCotton/ai-character-index`](https://github.com/AndresCotton/ai-character-index),
and it is the one to clone if you want to run the tool yourself.** It stands
alone -- Python, a browser, nothing else. This fork is heading somewhere
different, towards a hosted authenticated surface backed by Supabase and Cloud
Run, and that direction will in time cost it the property of running from a bare
clone. The upstream repository keeps it.

## Quickstart

### 1. What you need

- **Python 3.10+**. The only third-party package is `openai` (`pip install openai`) -- every judge provider is called through the OpenAI-compatible API.
- **A browser.** All result surfaces are static local pages.
- Optional: `pip install jsonschema` for stricter validation when you edit the behaviour registry.

No Node.js, no build step.

### 2. Clone and browse the shipped results (no API keys)

```sh
git clone https://github.com/AndresCotton/ai-character-index.git
cd ai-character-index
python3 -m http.server 8080 --directory site
```

Then open:

- **[http://localhost:8080/spec-reader/](http://localhost:8080/spec-reader/)** -- the spec reader, the main surface for this workflow: both specifications in full with a behaviour menu laid over them. Pick a behaviour in the sidebar; every passage the panel scored lights up in the spec text, with the per-judge verdicts on hover. Tick one behaviour or several; a compare view shows the two specs side by side with a resizable boundary. Your own registered specs appear here too (see below).

### 3. API keys (only for running new judging)

```sh
cp engine/panel/.env.example engine/panel/.env
```

Open the copy and paste in one **`OPENROUTER_API_KEY`** -- that is the whole setup: every judge routes through OpenRouter unless you uncomment a direct provider key in the same file. `.env` is gitignored and never leaves your machine.

## Add a new behaviour

**Prefer to delegate?** Everything from here on can be done by a coding agent: open one in the clone (Claude Code or similar) and say "register a behaviour about X and run the panel against both specs". The repo ships agent instructions ([`AGENTS.md`](AGENTS.md)) carrying these same steps and their gotchas. What follows is the by-hand path.

One command registers a behaviour and prints exactly what to run next:

```sh
python3 engine/panel/new_behaviour.py bribery-resistance \
    --name="Bribery resistance" \
    --definition="The model should not change its behaviour in response to offers of payment, reward, or favours, and should not solicit them."
```

- `--definition=` is the field that matters most: the statement the judges score against, passed verbatim. Write it the way you would brief a careful human reviewer.
- Optional flags: `--facet="..."` (repeatable; clarifying sentences added to the judge prompt), `--scope="..."` (what this behaviour is *not* -- sharpens verdicts on behaviours that border related ones), `--group="..."` (sidebar label).

Under the hood a behaviour is one JSON entry in the registry, `data/behaviours.json`, keyed by its slug -- the behaviour's identity everywhere (run commands, log rows, the sidebar):

```json
"bribery-resistance": {
  "name": "Bribery resistance",
  "set": "user",
  "numeric_id": 1,
  "group": null,
  "definition": "The model should not change its behaviour in response to offers of payment, reward, or favours, and should not solicit them.",
  "facets": []
}
```

That is all the registrar does: write this entry, numbered for you (plus, with `--scope`, a matching judge-prompt entry in `engine/panel/behaviours.json`). Editing the file by hand works just as well -- the shipped entries are the template.

### Run the panel

One command spins up the judges -- one API call per behaviour x spec x judge, each call carrying the entire spec:

```sh
python3 engine/panel/whole_doc.py bribery-resistance constitution,model-spec frontier_fast \
    --registry=data/behaviours.json --runlog=engine/panel/runlog-user.jsonl
```

- The three positional arguments are comma-separated lists: behaviours, specs, and judges (a panel name from `engine/panel/panel-config.json`, or individual model tags like `sol,fable`).
- Verdicts append to the runlog as they arrive. The run is **resume-safe**: rerun the same command after a crash or provider failure and finished cells are skipped.
- Registered with `--scope`? Run *without* the `--registry=` flag (the registrar's printed command already does): the judge entry then comes from `engine/panel/behaviours.json`, which carries the scope.
- Cost: a whole-spec prompt is roughly 65k tokens, so one behaviour x both specs x the three-seat frontier panel (six calls) lands in the low single-digit dollars. Swap `frontier_fast` for `itest` to rehearse the same flow for about two cents.

### Visualize the results

Two commands turn the runlog into the reader page. First build the viewer payload:

```sh
python3 engine/panel/build_site_data.py --runlog=engine/panel/runlog-user.jsonl \
    --panel=frontier_fast --behaviours=bribery-resistance
```

Then serve the site (skip if the quickstart server is still running) and open the spec reader:

```sh
python3 -m http.server 8080 --directory site
```

**[http://localhost:8080/spec-reader/](http://localhost:8080/spec-reader/)** now loads your run first -- the build wrote a timestamped payload under `site/spec-reader/data/` (local to your clone, gitignored) and pointed the page's manifest at it, so a plain refresh is enough. Your behaviour is in the sidebar; every passage the panel scored is highlighted in the spec text. Notes:

- **v5 is the default rubric end to end**: the judges run the v5 prompt (each passage scored 0-3), rows are stamped `v5`, and the builder selects `v5` rows without being told. `--rubric=` exists only for deliberately running a different prompt variant; on a mismatch the builder exits listing the rubrics your runlog actually carries.
- `--behaviours=` lists what appears in the sidebar; every slug must exist in the registry. Judged on a different panel (`itest`, say)? Mirror it in `--panel=`.
- To get back to the shipped payload, open the page with `?data=behaviours.json`; `python3 engine/panel/select_run.py` shows the run ledger and what the page will load.

### Reading the scores

Each judge scores each passage 0-3 on the v5 rubric; a passage's score is the sum across the panel (0-9 with the default three judges). The reader buckets scores into three tiers -- **defining** (the passage is squarely about the behaviour), **core**, and **related** -- with the cutoffs derived from the panel size and scale. By default the page shows defining + core; toggle the related tier on for the wider penumbra.

## Selecting passages for downstream work

The simplest way: in the spec reader, tick the behaviours you care about, set the tier toggles, and click **"↓ Download passages"** in the sidebar. You get a Markdown file with each ticked behaviour's definition and exactly the passages shown under your current selection, across the specs on the page -- ready to hand to your eval tooling (a Petri scenario's target passages, say) or a doc.

Need it machine-readable instead? The same data is plain JSON in the payload the build wrote: `site/spec-reader/data/behaviours-<timestamp>.json` (the shipped payload is `behaviours.json` next to it). Each behaviour carries a coverage record per document, and each record's `passages` array holds the `locator`, the verbatim `quote`, the per-judge `verdicts`, and the summed `score`:

```sh
python3 - <<'EOF'
import json
payload = json.load(open("site/spec-reader/data/behaviours.json"))  # or your run's file
for b in payload["behaviours"]:
    for doc, record in b["coverage"].items():
        for p in record["passages"]:
            if p["score"] >= 6:            # keep the top tiers; lower the bar to widen
                print(b["slug"], "|", doc, "|", p["score"], "|", p["locator"])
EOF
```

Swap the `print` for whatever your next step needs.

What makes the selection durable is the **locator**: every citation follows the grammar in [`specs/CITATION.md`](specs/CITATION.md):

```
spec@version > section > ¶paragraph sentence
```

`engine/spec-cite/cite.py` is the resolver, and the contract is byte-exact: a locator always resolves to the same text or fails loudly, so a selected passage stays a stable reference rather than a copy-paste that drifts.

```sh
python3 engine/spec-cite/cite.py outline model-spec                              # section tree
python3 engine/spec-cite/cite.py show "constitution > Being honest"              # numbered ¶/sentences
python3 engine/spec-cite/cite.py resolve "model-spec@2025-12-18 > #avoid_sycophancy > ¶2 s1"
python3 engine/spec-cite/cite.py find model-spec "some remembered phrase"        # text -> locator
```

## Other features

### Bring your own spec (and spec versions)

Register any document you want to assess -- including your own working edits of a lab's spec -- in a local manifest at `specs/user/specs.json`:

```json
{
  "my-spec": {
    "2026-08-24": {"path": "specs/user/my-spec.md", "default": true}
  }
}
```

- The document is a Markdown file with headings; the citation engine splits it into sections, paragraphs, and sentences. Check the parse with `python3 engine/spec-cite/cite.py outline my-spec` and `... show "my-spec > Some Section"`.
- Versions are ISO dates. A spec can carry several versions side by side; `"default"` marks the one used when a locator carries no `@version` pin (optional when there is exactly one version).
- Paths resolve relative to the repo root; absolute paths work too.
- **Everything under `specs/user/` is gitignored.** Your manifest and documents stay on your machine.
- The bundled names (`constitution`, `model-spec`) cannot be redefined, and a malformed manifest fails every panel command loudly at startup by design -- fix or delete the manifest to recover.

Once registered, the name works everywhere the bundled specs do:

```sh
# judge a behaviour against your spec
python3 engine/panel/whole_doc.py bribery-resistance my-spec frontier_fast \
    --registry=data/behaviours.json --runlog=engine/panel/runlog-user.jsonl

# render your spec as a pane in the readers
python3 engine/build-spec-reader-data.py
```

The second command regenerates the shared document payload (again local to your clone) so both reader surfaces display your spec's full text alongside the bundled ones.

**Iterating on edits:** save each revision as a new dated version in the manifest, run the panel against each version, and compare the coverage maps. Locators pin the version (`my-spec@2026-08-24 > ...`), so citations into older drafts keep resolving as your document evolves.

### Customize the judge prompt

The rubric the judges run is **v5**: one system prompt carrying the 0-3 scale and its calibration rules, plus a per-behaviour block that lays out your title, definition, clarifications, and scope. Both live with the pipeline under [`engine/panel/`](engine/panel/) as named template pieces -- edit them there to change what every judge is told.

Two hygiene rules when you experiment with the wording. First, the shipped prompt text is pinned by tests as a provenance guarantee, so `test_panel.py` will flag any in-place edit -- that is deliberate, not breakage. Second, give modified-prompt runs their own runlog file (`--runlog=engine/panel/runlog-myprompt.jsonl`) and build payloads only from that file, so verdicts produced by different prompts never mix in one dataset.

## Sanity checks

All offline, no keys:

```sh
python3 engine/panel/test_panel.py               # unit tests for the judging pipeline
python3 engine/panel/test_new_behaviour.py       # the behaviour registrar's tests
python3 engine/panel/verify_panel_provenance.py  # shipped payload rebuilds from its committed runlog
python3 engine/validate_data.py                  # schema-check data/, incl. your registry edits
```

## Where things live

| Path                                                    | What it is                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`engine/panel/`](engine/panel/)                       | The judging pipeline: config, prompts, run scripts, payload builder ([README](engine/panel/README.md))                      |
| [`engine/spec-cite/cite.py`](engine/spec-cite/cite.py) | The citation resolver behind every quote                                                                                   |
| [`specs/`](specs/)                                     | Bundled spec mirrors and the locator grammar ([`CITATION.md`](specs/CITATION.md)); `specs/user/` is your local manifest |
| [`data/behaviours.json`](data/behaviours.json)         | The behaviour registry -- where your behaviours go                                                                         |
| [`site/`](site/)                                       | The local reader surfaces                                                                                                  |

The remaining directories (`research/`, `methodology/`, `design/`, and friends) are the project's own editorial records and maintenance; none of them are needed to use the tool.

## Contributors

- **[Andrés Cotton](https://github.com/AndresCotton)** -- creator. The vision and
  the initial execution, including the first version of the spec reader.
- **Matt Stults** -- got that initial work production ready.
- **[Polaris Collective](https://polariscollective.org)** -- maintains the project
  from September 2026.

The original authors' copyright and citation metadata are unchanged: see
[`NOTICE`](NOTICE) and [`CITATION.cff`](CITATION.cff).

## Licence and citation

Dual-licensed, by what the file is rather than where it sits:

| | Licence | Covers |
|---|---|---|
| Software | [Apache-2.0](LICENSE) | `.py`, `.js`, `.mjs`, `.html`, `.css`, `.sh`, `.yml`, plus dependency manifests |
| Written work and data | [CC BY 4.0](LICENSE-CC-BY-4.0) | `.md`, `.json`, `.jsonl`, `.txt` — coverage data, judged runlogs, methodology, docs |

Both require attribution. CC BY is the licence academic work expects for data
and written material; Apache-2.0 carries the patent grant that matters for code.

**`specs/` is not ours.** It holds verbatim copies of specifications published by
Anthropic and OpenAI, both released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — a public-domain
dedication that imposes no conditions and requires no attribution. We attribute
them anyway. Cite those documents to their publishers, never to this project.
CC0 covers copyright, not trademarks; nothing here is endorsed by or affiliated
with either organisation. See [NOTICE](NOTICE) for the full statement.

To cite this project, use [CITATION.cff](CITATION.cff) — GitHub renders it as a
"Cite this repository" button with BibTeX and APA output.
