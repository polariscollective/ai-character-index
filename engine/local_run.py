#!/usr/bin/env python3
"""Judge one document against one behaviour, with no database at all.

    python3 engine/local_run.py \\
        --document=my-spec@2026-09-12:path/to/spec.md \\
        --behaviour=path/to/behaviour.json \\
        --panel=frontier_fast

Everything the hosted index does, this does too, except decide what the public
sees. It needs one key, `OPENROUTER_API_KEY`, and writes raw results into
`artefacts/` — the replies as they came back, the verdicts as they parsed, and
what each call cost.

Why it exists: the index moved into Supabase, and a clone without credentials
could no longer run anything. That is a real loss and this is what answers it.
The results are files, so they diff, and diffing two runs of the same behaviour
against two drafts of a document is the thing this tool is actually for.

`--behaviour` takes either registry shape:

    {"slug": "bribery-resistance",
     "title": "Bribery resistance",
     "query": "The model should not change its behaviour in response to offers...",
     "boundary": "The construct is resistance to inducements. NOT this: ..."}

or the display shape (`name` / `definition` / `facets`), which the harness
adapts. A boundary is optional and worth writing: without one the judges draw
their own line and each draws a different one.
"""

import argparse
import hashlib
import importlib.util
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "panel"))
sys.path.insert(0, str(HERE / "spec-cite"))

import cite                      # noqa: E402
import judge_call                # noqa: E402

_spec = importlib.util.spec_from_file_location("h", HERE / "panel" / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

SAFE = re.compile(r"[^a-z0-9]+")


def now():
    return datetime.now(timezone.utc).isoformat()


def slugify(value):
    return SAFE.sub("-", value.lower()).strip("-") or "unnamed"


def read_document(pinned):
    """`name@version:path` installed as the only document cite.py knows.

    The same shape SPEC_CITE_DOCUMENT takes, because this is the same need: a
    caller with a file and no credentials. cite.py registers nothing at import
    time, so without this the first locator would exit naming use_registry.
    """
    try:
        pin, path = pinned.split(":", 1)
        name, version = pin.split("@", 1)
    except ValueError:
        raise SystemExit(f"--document must read name@version:path, got {pinned!r}")
    text = Path(path).read_text(encoding="utf-8")
    cite.use_registry({(name, version): path}, {name: version},
                      {(name, version): {"title": name}}, lambda key: text)
    return name, version, text


def read_behaviour(path):
    """One behaviour, in either registry shape, as the panel wants it."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    # A file holding one entry, or a registry holding several and naming one.
    if "query" in raw or "definition" in raw or "name" in raw or "title" in raw:
        slug = raw.get("slug") or slugify(raw.get("title") or raw.get("name") or "behaviour")
        entry = raw
    else:
        entries = {k: v for k, v in raw.items() if isinstance(v, dict)}
        if len(entries) != 1:
            raise SystemExit(
                f"{path} holds {len(entries)} behaviours; this judges one. "
                "Give a file with a single entry, or one behaviour's fields at the top level.")
        slug, entry = next(iter(entries.items()))
    return slug, {slug: entry}


def one_call(tag, system, user, config, passages, call_model):
    """One model reading the whole document. Returns what came back, unjudged."""
    provider, model_id = h.resolve(tag, config)
    kwargs = h.judge_kwargs(tag, model_id, config) if hasattr(h, "judge_kwargs") else {}
    reply, usage, finish_reason, seconds = call_model(
        provider=provider, model_id=model_id, system=system, user=user, kwargs=kwargs)
    verdicts, unparsed = judge_call.parse(reply, len(passages))
    return {
        "model": tag, "provider": provider, "model_id": model_id,
        "reply": reply, "usage": usage, "finish_reason": finish_reason,
        "seconds": round(seconds, 2) if seconds else None,
        "verdicts": verdicts, "unparsed": unparsed,
        "enough": judge_call.parsed_enough(unparsed, len(passages)),
    }


def run(document, behaviour_path, panel, out_dir, rubric="v5",
        config=None, call_model=None):
    """Judge, and write everything down. Returns the directory it wrote."""
    if call_model is None:
        import batch_job                                  # noqa: E402
        call_model = batch_job.call_openrouter
    config = config or h.load_config()

    name, version, text = read_document(document)
    slug, registry = read_behaviour(behaviour_path)
    passages = h.passages(name)
    if not passages:
        raise SystemExit(f"{name}@{version} yielded no passages. Is it markdown with headings?")

    seats = config["panels"].get(panel)
    if seats is None:
        seats = [seat.strip() for seat in panel.split(",") if seat.strip()]
    if not seats:
        raise SystemExit(f"no panel named {panel!r}, and no models in it")

    system, user = judge_call.compose(slug, rubric, registry, passages)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    folder = Path(out_dir) / f"{stamp}-{slugify(name)}-{slugify(slug)}"
    folder.mkdir(parents=True, exist_ok=True)

    # The document as the panel saw it, before any call is made. A run that dies
    # halfway still says what it was reading.
    with (folder / "passages.jsonl").open("w", encoding="utf-8") as out:
        for locator, section, passage in passages:
            out.write(json.dumps({"locator": locator, "section": section,
                                  "text": passage}, ensure_ascii=False) + "\n")

    manifest = {
        "started_at": now(),
        "document": {"name": name, "version": version,
                     "sha256": hashlib.sha256(text.encode()).hexdigest(),
                     "passages": len(passages)},
        "behaviour": {"slug": slug, **registry[slug]},
        "panel": seats, "rubric": rubric,
        "prompt_sha256": hashlib.sha256(system.encode()).hexdigest(),
        "calls": [],
    }

    judgements = folder / "judgements.jsonl"
    with judgements.open("w", encoding="utf-8") as out:
        for tag in seats:
            print(f"  {tag} reading {name}@{version} for {slug} ...", flush=True)
            try:
                call = one_call(tag, system, user, config, passages, call_model)
            except Exception as refused:                  # noqa: BLE001
                # One seat failing is not the run failing. The others still
                # answer, and what went wrong is written down rather than raised.
                print(f"  {tag}: {refused}", file=sys.stderr)
                manifest["calls"].append({"model": tag, "error": str(refused)})
                continue

            # The reply exactly as it arrived, beside what we made of it. The
            # first is the evidence; the second is an interpretation of it.
            (folder / f"{slugify(tag)}.reply.txt").write_text(call["reply"], encoding="utf-8")
            for number, verdict in sorted(call["verdicts"].items()):
                locator, section, passage = passages[number - 1]
                out.write(json.dumps({"model": tag, "locator": locator, "section": section,
                                      "verdict": verdict, "text": passage},
                                     ensure_ascii=False) + "\n")
            manifest["calls"].append({
                k: call[k] for k in ("model", "provider", "model_id", "usage",
                                     "finish_reason", "seconds", "unparsed", "enough")
            } | {"scored": len(call["verdicts"]),
                 "reply_file": f"{slugify(tag)}.reply.txt"})
            if not call["enough"]:
                print(f"  {tag}: only {len(call['verdicts'])} of {len(passages)} "
                      "passages parsed; the reply is kept as it came back",
                      file=sys.stderr)

    manifest["finished_at"] = now()
    (folder / "run.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return folder


def main(argv=None):
    parser = argparse.ArgumentParser(
        description=__doc__.splitlines()[0],
        epilog="Needs OPENROUTER_API_KEY. Needs no database and no account.")
    parser.add_argument("--document", required=True,
                        help="name@version:path to the markdown to judge")
    parser.add_argument("--behaviour", required=True,
                        help="path to a JSON file holding the behaviour")
    parser.add_argument("--panel", default="frontier_fast",
                        help="a panel name from engine/panel/panel-config.json, "
                             "or a comma-separated list of model tags")
    parser.add_argument("--out", default=str(ROOT / "artefacts"),
                        help="where the results go (default: artefacts/)")
    args = parser.parse_args(argv)

    if not os.environ.get("OPENROUTER_API_KEY"):
        raise SystemExit("OPENROUTER_API_KEY must be set: this calls models, and they cost money")

    folder = run(args.document, args.behaviour, args.panel, args.out)
    print(f"\nWritten to {folder}")
    print("  run.json         what was asked, what each call cost")
    print("  judgements.jsonl one line per model per passage")
    print("  passages.jsonl   the document as the panel saw it")
    print("  *.reply.txt      each reply exactly as it came back")
    return 0


if __name__ == "__main__":
    sys.exit(main())
