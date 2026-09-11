"""Executing a run's judge calls, inside a Cloud Run job.

Entry point: `python -m panel.batch_job`.

Everything comes through the environment, never the command line: Cloud Run Jobs
substitute environment variables at launch, not arguments.

    ACI_RUN_ID          the run to execute, already in the database with its calls
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    OPENROUTER_API_KEY  every judge, and the only provider key in this container

The job invents no work. The calls exist, `pending`, before it starts, so the
size of a run is known before a token is spent and progress is a count rather
than an estimate. Resume is a filter, not a log replay: relaunching takes every
call that is not `done`, which is what the old runlog's `done_keys` gave without
needing a file to survive.

A reply that will not parse is a first-class outcome, not an exception. The call
keeps its raw output, writes no judgement, and the run carries on. There is no
automatic retry: the usual causes are a content filter or a truncation, and a
blind retry spends money on the same failure. Relaunching is the retry, and it is
a person's decision.
"""

import concurrent.futures
import importlib.util
import os
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import index_store               # noqa: E402
import judge_call                # noqa: E402
from store import Store          # noqa: E402

_spec = importlib.util.spec_from_file_location("h", HERE / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

# Calls in flight per NATIVE provider, even though the transport is OpenRouter:
# a slow Anthropic budget must not throttle the DeepSeek seat. These are network
# waits, so the ceiling that matters is the provider's rate limit rather than the
# container's CPU.
PER_PROVIDER = 3


def now():
    return datetime.now(timezone.utc).isoformat()


def cost_of(tag, usage, config):
    """What a call cost, from the panel's own prices. The mirror's price when the
    mirror is what was called, since that is what OpenRouter bills."""
    model = config["models"].get(tag, {})
    prices = (model.get("openrouter") or model).get("price_per_mtok")
    if not prices or not usage:
        return None
    return round((usage.get("prompt_tokens", 0) or 0) * prices[0] / 1e6
                 + (usage.get("completion_tokens", 0) or 0) * prices[1] / 1e6, 6)


def call_openrouter(provider, model_id, system, user, kwargs):
    """One request, through whatever route harness.resolve chose."""
    client = h.client_for(provider, h.load_config())
    started = time.perf_counter()
    reply = client.chat.completions.create(
        timeout=3600,            # a frontier model over a whole document needs it
        model=model_id,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        **kwargs)
    seconds = round(time.perf_counter() - started, 2)
    usage = getattr(reply, "usage", None)
    return (reply.choices[0].message.content or "",
            {"prompt_tokens": getattr(usage, "prompt_tokens", None),
             "completion_tokens": getattr(usage, "completion_tokens", None)},
            getattr(reply.choices[0], "finish_reason", None),
            seconds)


def run(store, run_id, call_model=None, registry=None, passages_for=None,
        concurrency=None, config=None):
    """Execute every call of `run_id` that is not already done.

    The model call is injected for the same reason the store's transport is: the
    loop's behaviour -- what it takes, what it writes, what it does with a
    failure -- is provable without a network or a key.
    """
    call_model = call_model or call_openrouter
    config = config or h.load_config()

    run_row = next(r for r in store.select("aci_runs") if r["id"] == run_id)
    if registry is None:
        index_store.install_registry(store)
        registry = index_store.judging_registry(store)
    if passages_for is None:
        passages_for = h.passages

    spec_of_version = {v["id"]: v["spec_id"] for v in store.select("aci_spec_versions")}
    pending = [c for c in store.select("aci_judge_calls")
               if c["run_id"] == run_id and c["status"] != "done"]

    report = {"attempted": 0, "done": 0, "failed": 0, "cancelled": False}
    if cancelled(store, run_id):
        report["cancelled"] = True
        return report
    if not pending:
        finish(store, run_id, report)
        return report

    store.update("aci_runs", {"id": run_id}, {"status": "running", "started_at": now()})

    lock = threading.Lock()
    gates = {}

    def gate_for(tag):
        provider = config["models"].get(tag, {}).get("provider", tag)
        with lock:
            return gates.setdefault(provider, threading.Semaphore(PER_PROVIDER))

    def execute(call):
        if cancelled(store, run_id):
            report["cancelled"] = True
            return
        with gate_for(call["model"]):
            if cancelled(store, run_id):
                report["cancelled"] = True
                return
            one_call(store, call, run_row, registry, passages_for,
                     spec_of_version, call_model, config, report, lock)

    workers = concurrency if concurrency is not None else PER_PROVIDER * 2
    if workers <= 1:
        for call in pending:
            execute(call)
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(execute, pending))

    if not report["cancelled"]:
        finish(store, run_id, report)
    return report


def one_call(store, call, run_row, registry, passages_for, spec_of_version,
             call_model, config, report, lock):
    store.update("aci_judge_calls", {"id": call["id"]},
                 {"status": "running", "started_at": now()})
    with lock:
        report["attempted"] += 1

    spec = spec_of_version[call["spec_version_id"]]
    passages = passages_for(spec)
    rubric = run_row["rubric"]
    system, user = judge_call.compose(call["behaviour_slug"], rubric, registry, passages)
    provider, model_id = h.resolve(call["model"], config)

    try:
        reply, usage, finish_reason, seconds = call_model(
            provider=provider, model_id=model_id, system=system, user=user,
            kwargs=h.judge_kwargs(call["model"], model_id, config)
            if hasattr(h, "judge_kwargs") else {})
    except Exception as refused:                      # noqa: BLE001
        # The provider refused or the request died. The call carries why, and the
        # run carries on: one seat failing is not the run failing.
        store.update("aci_judge_calls", {"id": call["id"]},
                     {"status": "error", "error": str(refused)[:1000],
                      "finished_at": now()})
        with lock:
            report["failed"] += 1
        return

    verdicts, unparsed = judge_call.parse(reply, len(passages))
    meter = {"passages": len(passages), "unparsed": unparsed,
             "finish_reason": finish_reason, "seconds": seconds,
             "prompt_tokens": usage.get("prompt_tokens"),
             "completion_tokens": usage.get("completion_tokens"),
             "cost_usd": cost_of(call["model"], usage, config),
             "finished_at": now()}

    if not judge_call.parsed_enough(unparsed, len(passages)):
        store.update("aci_judge_calls", {"id": call["id"]}, dict(meter, **{
            "status": "error", "raw_output": reply[:20000],
            "error": f"{unparsed} of {len(passages)} passages unparsed "
                     f"(finish_reason={finish_reason})"}))
        with lock:
            report["failed"] += 1
        return

    store.insert("aci_judgements",
                 judge_call.judgements(call["id"], passages, verdicts))
    store.update("aci_judge_calls", {"id": call["id"]}, dict(meter, status="done"))
    with lock:
        report["done"] += 1


def cancelled(store, run_id):
    row = next((r for r in store.select("aci_runs") if r["id"] == run_id), None)
    return bool(row) and row["status"] == "cancelled"


def finish(store, run_id, report):
    calls = [c for c in store.select("aci_judge_calls") if c["run_id"] == run_id]
    cost = sum(c["cost_usd"] or 0 for c in calls)
    store.update("aci_runs", {"id": run_id},
                 {"status": "done", "finished_at": now(), "cost_usd": cost})


def main():
    run_id = os.environ.get("ACI_RUN_ID")
    if not run_id:
        sys.exit("ACI_RUN_ID must name the run to execute")
    report = run(Store.from_env(), run_id)
    print(f"run {run_id}: {report['attempted']} attempted, {report['done']} done, "
          f"{report['failed']} failed"
          + (", cancelled" if report["cancelled"] else ""))
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
