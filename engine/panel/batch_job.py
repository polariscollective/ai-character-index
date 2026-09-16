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
sys.path.insert(0, str(HERE))          # judge_call, harness: this directory
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import index_store               # noqa: E402
import judge_call                # noqa: E402
import bands                     # noqa: E402
import depth_call                # noqa: E402
import whole_doc                 # noqa: E402
from store import Store, StoreError  # noqa: E402

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
    """Execute every call of `run_id` that is not done, then every depth.

    The model call is injected for the same reason the store's transport is: the
    loop's behaviour -- what it takes, what it writes, what it does with a
    failure -- is provable without a network or a key.

    A cell's depths wait for every passage call of the cell to be done, because a
    depth grades the passages the reader shows, and those come from all of the
    cell's judges.
    """
    call_model = call_model or call_openrouter
    config = config or h.load_config()

    run_row = next(r for r in store.select("aci_runs") if r["id"] == run_id)
    if registry is None:
        index_store.install_registry(store)
        registry = index_store.judging_registry(store)
    if passages_for is None:
        passages_for = h.passages

    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    pending = [c for c in store.select("aci_judge_calls")
               if c["run_id"] == run_id and c["status"] != "done"]

    report = {"attempted": 0, "done": 0, "failed": 0, "cancelled": False,
              "depths": {"done": 0, "failed": 0}}
    if cancelled(store, run_id):
        report["cancelled"] = True
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
                     versions, call_model, config, report, lock)

    def execute_depth(job):
        call, retained = job
        if cancelled(store, run_id):
            report["cancelled"] = True
            return
        with gate_for(call["model"]):
            if cancelled(store, run_id):
                report["cancelled"] = True
                return
            one_depth(store, call, registry, retained, call_model, config, report, lock)

    workers = concurrency if concurrency is not None else PER_PROVIDER * 2

    def each(work, items):
        if workers <= 1:
            for item in items:
                work(item)
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                list(pool.map(work, items))

    each(execute, pending)
    if not report["cancelled"]:
        each(execute_depth, pending_depths(store, run_id, passages_for, versions))
    if not report["cancelled"]:
        finish(store, run_id, report)
    return report


def stored_count(store, call_id):
    """How many judgements are already written for this call.

    One small read, filtered on `call_id`, never the whole table: a relaunch
    checks this before paying for the model again, and the insert path
    re-checks it after a duplicate-key failure to tell a landed write from a
    partial one.
    """
    return len(store.select("aci_judgements", {"call_id": f"eq.{call_id}"}))


def partial_stored_error(stored, total):
    return (f"this call holds {stored} of {total} judgements from an earlier "
            f"attempt and cannot be completed in place (the job has insert-only "
            f"access to aci_judgements): compose a new run for this cell.")


def one_call(store, call, run_row, registry, passages_for, versions,
             call_model, config, report, lock):
    store.update("aci_judge_calls", {"id": call["id"]},
                 {"status": "running", "started_at": now()})
    with lock:
        report["attempted"] += 1

    version = versions[call["spec_version_id"]]
    passages = passages_for(version["spec_id"], version["version"])

    stored = stored_count(store, call["id"])
    if stored == len(passages):
        # A relaunch of a call whose earlier attempt stored every judgement but
        # died before the done PATCH (step 4 succeeded, step 5 never ran). The
        # reply is fully on record: finish the call without paying for the
        # model again. Whatever meter the row already carries is kept as is --
        # the crashed attempt's usage was never written, and none is invented.
        store.update("aci_judge_calls", {"id": call["id"]}, {
            "status": "done", "error": None, "finished_at": now(),
            "passages": len(passages)})
        with lock:
            report["done"] += 1
        return
    if stored:
        # A partial set from an earlier attempt. The job cannot delete the
        # stray rows (insert-only) and cannot tell which passages are missing
        # without risking a second duplicate, so it does not call the model
        # again and does not touch aci_judgements.
        store.update("aci_judge_calls", {"id": call["id"]}, {
            "status": "error", "finished_at": now(),
            "error": partial_stored_error(stored, len(passages))})
        with lock:
            report["failed"] += 1
        return

    rubric = run_row["rubric"]
    system, user = judge_call.compose(call["behaviour_slug"], rubric, registry, passages)
    provider, model_id = h.resolve(call["model"], config)

    try:
        reply, usage, finish_reason, seconds = call_model(
            provider=provider, model_id=model_id, system=system, user=user,
            kwargs=whole_doc.judge_kwargs(call["model"], model_id, config))
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

    rows = judge_call.judgements(call["id"], passages, verdicts)
    try:
        # One POST whatever the passage count, so a death mid-insert can never
        # again leave "some but not all" of a call's judgements stored.
        store.insert("aci_judgements", rows, chunk=max(len(rows), 1))
    except StoreError as failed_insert:
        if "23505" not in str(failed_insert):
            raise
        # The insert may have landed before its response was lost -- that is
        # exactly what a 409 duplicate on this table means. Re-count rather
        # than assume either outcome.
        landed = stored_count(store, call["id"])
        if landed == len(passages):
            store.update("aci_judge_calls", {"id": call["id"]},
                         dict(meter, status="done", error=None))
            with lock:
                report["done"] += 1
            return
        store.update("aci_judge_calls", {"id": call["id"]}, dict(meter, **{
            "status": "error", "error": partial_stored_error(landed, len(passages))}))
        with lock:
            report["failed"] += 1
        return

    store.update("aci_judge_calls", {"id": call["id"]},
                 dict(meter, status="done", error=None))
    with lock:
        report["done"] += 1


def pending_depths(store, run_id, passages_for, versions):
    """[(call, retained passages)] for every depth still to give.

    A cell's depths wait until all its passage calls are done. A call no depth row
    was written for -- a run composed before depths existed -- has none to give.
    The retained passages are the ones a reader shows by default, from the cell's
    parsed judgements: every banded passage, related included, because that is
    what the reader opens on."""
    calls = [c for c in store.select("aci_judge_calls") if c["run_id"] == run_id]
    depths = {d["call_id"]: d for d in store.select("aci_depths")}
    cells = {}
    for call in calls:
        cells.setdefault((call["behaviour_slug"], call["spec_version_id"]), []).append(call)

    jobs, judgements = [], None
    for (_slug, version_id), cell in sorted(cells.items()):
        todo = [c for c in cell if c["id"] in depths and depths[c["id"]]["status"] != "done"]
        if not todo or any(c["status"] != "done" for c in cell):
            continue
        if judgements is None:
            judgements = store.select("aci_judgements")
        model_of = {c["id"]: c["model"] for c in cell}
        votes = {}
        for row in judgements:
            if row["call_id"] in model_of and row.get("parsed", True):
                votes.setdefault(row["locator"], {})[model_of[row["call_id"]]] = row["verdict"]
        shown = set(bands.shown_by_default(votes))
        version = versions[version_id]
        retained = [p for p in passages_for(version["spec_id"], version["version"])
                    if p[0] in shown]
        jobs.extend((call, retained) for call in todo)
    return jobs


def one_depth(store, call, registry, retained, call_model, config, report, lock):
    """One judge's depth for its call's cell. A cell with nothing retained is
    depth 0 without a call; a reply with no DEPTH line keeps its text and fails."""
    match = {"call_id": call["id"]}
    store.update("aci_depths", match, {"status": "running", "started_at": now()})
    if not retained:
        store.update("aci_depths", match, {
            "status": "done", "depth": 0, "rationale": depth_call.NOTHING_RETAINED,
            "passages": 0, "cost_usd": 0, "finished_at": now()})
        with lock:
            report["depths"]["done"] += 1
        return

    system, user = depth_call.compose(call["behaviour_slug"], registry, retained)
    provider, model_id = h.resolve(call["model"], config)
    try:
        reply, usage, finish_reason, seconds = call_model(
            provider=provider, model_id=model_id, system=system, user=user,
            kwargs=whole_doc.judge_kwargs(call["model"], model_id, config))
    except Exception as refused:                      # noqa: BLE001
        store.update("aci_depths", match, {"status": "error", "error": str(refused)[:1000],
                                           "finished_at": now()})
        with lock:
            report["depths"]["failed"] += 1
        return

    depth, rationale = depth_call.parse(reply)
    meter = {"passages": len(retained), "seconds": seconds,
             "prompt_tokens": usage.get("prompt_tokens"),
             "completion_tokens": usage.get("completion_tokens"),
             "cost_usd": cost_of(call["model"], usage, config),
             "finished_at": now()}
    if depth is None:
        store.update("aci_depths", match, dict(meter, **{
            "status": "error", "raw_output": (reply or "")[:20000],
            "error": f"no DEPTH line in the reply (finish_reason={finish_reason})"}))
        with lock:
            report["depths"]["failed"] += 1
        return
    store.update("aci_depths", match, dict(meter, status="done", depth=depth,
                                           rationale=rationale or "", error=None,
                                           raw_output=None))
    with lock:
        report["depths"]["done"] += 1


def cancelled(store, run_id):
    row = next((r for r in store.select("aci_runs") if r["id"] == run_id), None)
    return bool(row) and row["status"] == "cancelled"


def finish(store, run_id, report):
    calls = [c for c in store.select("aci_judge_calls") if c["run_id"] == run_id]
    ids = {c["id"] for c in calls}
    depths = [d for d in store.select("aci_depths") if d["call_id"] in ids]
    metered = [row["cost_usd"] for row in calls + depths
               if row.get("cost_usd") is not None]
    patch = {"status": "done", "finished_at": now()}
    # Null means unknown and zero means free, and they are not the same claim.
    # The migrated bench carries no per-call cost -- its meter readings lived in
    # a gitignored metrics file -- so summing its calls must leave it unknown.
    if metered:
        patch["cost_usd"] = round(sum(metered), 6)
    store.update("aci_runs", {"id": run_id}, patch)


def main():
    run_id = os.environ.get("ACI_RUN_ID")
    if not run_id:
        sys.exit("ACI_RUN_ID must name the run to execute")
    report = run(Store.from_env(), run_id)
    print(f"run {run_id}: {report['attempted']} attempted, {report['done']} done, "
          f"{report['failed']} failed, depths {report['depths']['done']} done "
          f"{report['depths']['failed']} failed"
          + (", cancelled" if report["cancelled"] else ""))
    return 1 if report["failed"] or report["depths"]["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
