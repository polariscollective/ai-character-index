#!/usr/bin/env python3
"""Batch-API path for the panel harness (50% price, ~24h) -- OpenAI + Anthropic.

Reuses harness.py's exact prompt composition (same SYSTEM/user text as realtime),
so batch and realtime verdicts are directly comparable. Cheap providers without a
batch API (OpenRouter/DeepInfra) should just run realtime -- their savings are cents.

  python3 batch_panel.py submit <behaviour[,behaviour...]> <spec[,spec...]> <tag[,tag...]> [--v2|--v3]
  python3 batch_panel.py status
  python3 batch_panel.py ingest          # downloads finished batches -> runlog rows

State in batches.json (submitted ids); results append to the runlog like realtime rows,
tagged "via": "batch". Resume-safe: submit skips (behaviour,spec,model,locator) keys
already in the runlog, and ingest skips batches already ingested.
"""
import importlib.util
import json
import os
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec_ = importlib.util.spec_from_file_location("harness", HERE / "harness.py")
h = importlib.util.module_from_spec(spec_)
spec_.loader.exec_module(h)

STATE = HERE / "batches.json"
RUNLOG = HERE / "runlog-v2.jsonl"   # batch path is v2-era; override with --runlog=


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {"submitted": [], "ingested": []}


def save_state(s):
    STATE.write_text(json.dumps(s, indent=1))


def key_env(provider):
    name = h.PROVIDERS[provider][1]
    v = os.environ.get(name)
    if not v and (HERE / ".env").exists():
        for line in (HERE / ".env").read_text().splitlines():
            if line.startswith(name + "="):
                v = line.split("=", 1)[1].strip()
    if not v:
        sys.exit(f"no {name} for provider {provider}")
    return v


def request_bodies(behaviour, spec, tag, rubric, done):
    provider, model = h.resolve(tag)
    qblock = h.compose_query(behaviour, rubric)   # same builders as realtime -- byte-identical
    sysmsg = h.SYSTEMS[rubric].format(reason="")
    ps = [p for p in h.passages(spec) if (behaviour, spec, tag, p[0]) not in done]
    out = []
    bs = h.BATCH
    for k in range(0, len(ps), bs):
        chunk = ps[k:k + bs]
        user = h.user_msg(qblock, chunk)
        cid = f"{behaviour}__{spec}__{tag}__{k//bs}"   # __ separator: anthropic custom_id forbids |
        locs = [loc for loc, _, _ in chunk]
        out.append((cid, sysmsg, user, model, locs))
    return provider, out


def submit(behaviours, specs, tags, rubric):
    state = load_state()
    done = h.done_keys(rubric)
    for tag in tags:
        provider = h.resolve(tag)[0]   # openrouter-resolved tags have no batch path (below)
        reqs, locmap = [], {}
        for behaviour in behaviours:
            for spec in specs:
                prov, bodies = request_bodies(behaviour, spec, tag, rubric, done)
                for cid, sysmsg, user, model, locs in bodies:
                    locmap[cid] = locs
                    if provider == "openai":
                        reqs.append({"custom_id": cid, "method": "POST", "url": "/v1/chat/completions",
                                     "body": {"model": model,
                                              "max_completion_tokens": 8192, "reasoning_effort": "low",
                                              "messages": [{"role": "system", "content": sysmsg},
                                                           {"role": "user", "content": user}]}})
                    elif provider == "anthropic":
                        reqs.append({"custom_id": cid,
                                     "params": {"model": model, "max_tokens": 8192,
                                                "system": sysmsg,
                                                "messages": [{"role": "user", "content": user}]}})
                    else:
                        sys.exit(f"no batch path for provider {provider} -- run {tag} realtime")
        if not reqs:
            print(f"{tag}: nothing to submit (all resumed)")
            continue
        if provider == "openai":
            from openai import OpenAI
            client = OpenAI(api_key=key_env("openai"))
            fpath = HERE / f"batch-input-{tag}.jsonl"
            fpath.write_text("\n".join(json.dumps(r) for r in reqs))
            up = client.files.create(file=fpath.open("rb"), purpose="batch")
            b = client.batches.create(input_file_id=up.id, endpoint="/v1/chat/completions",
                                      completion_window="24h")
            bid = b.id
        else:  # anthropic message batches (REST)
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages/batches",
                data=json.dumps({"requests": reqs}).encode(),
                headers={"x-api-key": key_env("anthropic"),
                         "anthropic-version": "2023-06-01",
                         "content-type": "application/json"})
            bid = json.loads(urllib.request.urlopen(req).read())["id"]
        state["submitted"].append({"id": bid, "tag": tag, "provider": provider,
                                   "rubric": rubric, "n_requests": len(reqs), "locmap": locmap})
        save_state(state)   # durable per submission
        print(f"{tag} ({provider}): submitted batch {bid} with {len(reqs)} requests")


def status():
    state = load_state()
    for b in state["submitted"]:
        if b["id"] in state["ingested"]:
            print(f"{b['id']} [{b['tag']}] INGESTED")
            continue
        if b["provider"] == "openai":
            from openai import OpenAI
            s = OpenAI(api_key=key_env("openai")).batches.retrieve(b["id"])
            print(f"{b['id']} [{b['tag']}] {s.status}  {getattr(s.request_counts, 'completed', '?')}/{b['n_requests']}")
        else:
            req = urllib.request.Request(f"https://api.anthropic.com/v1/messages/batches/{b['id']}",
                                         headers={"x-api-key": key_env("anthropic"),
                                                  "anthropic-version": "2023-06-01"})
            s = json.loads(urllib.request.urlopen(req).read())
            print(f"{b['id']} [{b['tag']}] {s['processing_status']}  {s['request_counts']}")


def ingest():
    state = load_state()
    for b in state["submitted"]:
        if b["id"] in state["ingested"]:
            continue
        rows = []
        if b["provider"] == "openai":
            from openai import OpenAI
            client = OpenAI(api_key=key_env("openai"))
            s = client.batches.retrieve(b["id"])
            if s.status != "completed":
                print(f"{b['id']} [{b['tag']}] not done ({s.status}); skipping")
                continue
            content = client.files.content(s.output_file_id).text
            results = [json.loads(l) for l in content.splitlines() if l.strip()]
            get = lambda r: (r["custom_id"], r["response"]["body"]["choices"][0]["message"]["content"] or "")
        else:
            req = urllib.request.Request(f"https://api.anthropic.com/v1/messages/batches/{b['id']}",
                                         headers={"x-api-key": key_env("anthropic"),
                                                  "anthropic-version": "2023-06-01"})
            s = json.loads(urllib.request.urlopen(req).read())
            if s["processing_status"] != "ended":
                print(f"{b['id']} [{b['tag']}] not done ({s['processing_status']}); skipping")
                continue
            req = urllib.request.Request(s["results_url"],
                                         headers={"x-api-key": key_env("anthropic"),
                                                  "anthropic-version": "2023-06-01"})
            results = [json.loads(l) for l in urllib.request.urlopen(req).read().decode().splitlines() if l.strip()]
            get = lambda r: (r["custom_id"],
                             "".join(c.get("text", "") for c in r["result"]["message"]["content"])
                             if r["result"]["type"] == "succeeded" else "")
        # older state entries stored a "v2" boolean; newer ones store the rubric string
        rubric = b.get("rubric") or ("v2" if b.get("v2") else "v1")
        for r in results:
            cid, txt = get(r)
            locs = b["locmap"][cid]
            behaviour, spec, tag, _ = cid.split("__") if "__" in cid else cid.split("|")
            verdicts = h.parse_verdicts(txt, len(locs))
            for i, loc in enumerate(locs):
                v = verdicts.get(i + 1, 0)
                rows.append({"behaviour": behaviour, "spec": spec, "model": tag, "locator": loc,
                             "verdict": v, "relevant": int(v == 2) if rubric != "v1" else int(v),
                             "parsed": (i + 1) in verdicts,
                             "rubric": rubric, "via": "batch"})
        with RUNLOG.open("a") as f:
            for row in rows:
                f.write(json.dumps(row) + "\n")
        state["ingested"].append(b["id"])
        save_state(state)
        unp = sum(1 for r in rows if not r["parsed"])
        print(f"{b['id']} [{b['tag']}] ingested {len(rows)} verdicts ({unp} unparsed)")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "submit":
        behaviours, specs, tags = (sys.argv[2].split(","), sys.argv[3].split(","), sys.argv[4].split(","))
        tags = [m for t in tags for m in (h.PANELS.get(t) or [t])]
        rubric = "v3" if "--v3" in sys.argv else "v2" if "--v2" in sys.argv else "v1"
        submit(behaviours, specs, tags, rubric)
    elif cmd == "status":
        status()
    elif cmd == "ingest":
        ingest()
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
