#!/usr/bin/env python3
"""Executing a link run's calls.

    ACI_LINK_RUN_ID=<uuid> python3 engine/panel/link_job.py

The job invents no work. The calls exist, `pending`, before it starts, so the
size of a run is known before a token is spent. Resume is a filter, not a log
replay: relaunching takes every call that is not `done`.

A reply that does not cover every source passage is a first-class outcome, not
an exception. The call keeps its raw output, writes no link, and the run carries
on. There is no automatic retry: the usual causes are a content filter or a
truncation, and a blind retry spends money on the same failure.
"""

import concurrent.futures
import os
import sys
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                  # noqa: E402
import compose_links              # noqa: E402
import index_store                # noqa: E402
import link_call                  # noqa: E402
import whole_doc                  # noqa: E402
from store import Store           # noqa: E402

h = link_call.h


def _cancelled(store, run_id):
    row = next((r for r in store.select("aci_link_runs") if r["id"] == run_id), None)
    return bool(row) and row["status"] == "cancelled"


def run(store, run_id, call_model=None, registry=None, passages_for=None,
        retained_for=None, concurrency=None, config=None):
    """Execute every call of `run_id` that is not done.

    The model call, the passage reader and the retained-passage reader are
    injected for the reason the store's transport is: what the loop takes, what
    it writes and what it does with a failure is provable without a network.
    """
    call_model = call_model or batch_job.call_openrouter
    config = config or h.load_config()
    passages_for = passages_for or h.passages
    retained_for = retained_for or compose_links.retained_passages
    if registry is None:
        index_store.install_registry(store)
        registry = index_store.judging_registry(store)

    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    pending = [c for c in store.select("aci_link_calls")
               if c["run_id"] == run_id and c["status"] != "done"]

    report = {"attempted": 0, "done": 0, "failed": 0, "cancelled": False}
    if _cancelled(store, run_id):
        report["cancelled"] = True
        return report

    store.update("aci_link_runs", {"id": run_id},
                 {"status": "running", "started_at": batch_job.now()})

    lock = threading.Lock()
    gates = {}

    def gate_for(tag):
        provider = config["models"].get(tag, {}).get("provider", tag)
        with lock:
            return gates.setdefault(provider,
                                    threading.Semaphore(batch_job.PER_PROVIDER))

    def execute(call):
        if _cancelled(store, run_id):
            report["cancelled"] = True
            return
        with gate_for(call["model"]):
            if _cancelled(store, run_id):
                report["cancelled"] = True
                return
            one_call(store, call, registry, versions, passages_for, retained_for,
                     call_model, config, report, lock)

    workers = concurrency if concurrency is not None else batch_job.PER_PROVIDER * 2
    if workers <= 1:
        for call in pending:
            execute(call)
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(execute, pending))

    if not report["cancelled"]:
        finish(store, run_id)
    return report


def one_call(store, call, registry, versions, passages_for, retained_for,
             call_model, config, report, lock):
    store.update("aci_link_calls", {"id": call["id"]},
                 {"status": "running", "started_at": batch_job.now()})
    with lock:
        report["attempted"] += 1

    source = versions[call["source_version_id"]]
    target = versions[call["target_version_id"]]
    sources = retained_for(store, call["behaviour_slug"], source)
    targets = passages_for(target["spec_id"], target["version"])

    system, user = link_call.compose(
        call["behaviour_slug"], registry, sources, targets,
        compose_links.document_id(source), compose_links.document_id(target))
    # A call whose links are already stored has been answered: a death between
    # the insert and the PATCH that marks it done leaves exactly that. The
    # insert is a single chunk, so any row for this call means the whole set
    # landed. Finish it rather than paying a frontier model to read a whole
    # document again, which is the check batch_job makes for the same reason.
    if store.select("aci_links", {"call_id": f"eq.{call['id']}"}):
        store.update("aci_link_calls", {"id": call["id"]},
                     {"status": "done", "error": None,
                      "finished_at": batch_job.now()})
        with lock:
            report["done"] += 1
        return

    provider, model_id = h.resolve(call["model"], config)

    try:
        reply, usage, finish_reason, seconds = call_model(
            provider=provider, model_id=model_id, system=system, user=user,
            kwargs=whole_doc.judge_kwargs(call["model"], model_id, config))
    except Exception as refused:                      # noqa: BLE001
        store.update("aci_link_calls", {"id": call["id"]},
                     {"status": "error", "error": str(refused)[:1000],
                      "finished_at": batch_job.now()})
        with lock:
            report["failed"] += 1
        return

    links, uncovered = link_call.parse(reply, len(sources), len(targets))
    meter = {"sources": len(sources), "uncovered": len(uncovered),
             "finish_reason": finish_reason, "seconds": seconds,
             "prompt_tokens": usage.get("prompt_tokens"),
             "completion_tokens": usage.get("completion_tokens"),
             "cost_usd": batch_job.cost_of(call["model"], usage, config),
             "finished_at": batch_job.now()}

    if not link_call.covered_enough(uncovered):
        store.update("aci_link_calls", {"id": call["id"]}, dict(meter, **{
            "status": "error", "raw_output": reply[:20000],
            "error": f"{len(sources) - len(uncovered)} of {len(sources)} source "
                     f"passages answered for (finish_reason={finish_reason})"}))
        with lock:
            report["failed"] += 1
        return

    rows = link_call.link_rows(call["id"], sources, targets, links)
    try:
        store.insert("aci_links", rows, chunk=max(len(rows), 1))
    except batch_job.StoreError as failed_insert:
        # A death between this insert and the PATCH below leaves a call that is
        # not done whose links are already stored, and the relaunch that follows
        # meets the unique key on (call_id, source_locator, target_locator).
        # That is what a 23505 here means: the rows are on record, so finish the
        # call instead of letting a constraint stop the run. Re-count rather
        # than assume, because a partial set is a different and worse state.
        if "23505" not in str(failed_insert):
            raise
        landed = len(store.select("aci_links", {"call_id": f"eq.{call['id']}"}))
        if landed != len(rows):
            store.update("aci_link_calls", {"id": call["id"]}, dict(meter, **{
                "status": "error",
                "error": f"this call holds {landed} of {len(rows)} links from an "
                         "earlier attempt and cannot be completed in place (the "
                         "job has insert-only access to aci_links): compose a "
                         "new run for this cell."}))
            with lock:
                report["failed"] += 1
            return
    store.update("aci_link_calls", {"id": call["id"]},
                 dict(meter, status="done", error=None, raw_output=None))
    with lock:
        report["done"] += 1


def finish(store, run_id):
    calls = [c for c in store.select("aci_link_calls") if c["run_id"] == run_id]
    metered = [c["cost_usd"] for c in calls if c.get("cost_usd") is not None]
    patch = {"status": "done", "finished_at": batch_job.now()}
    # Null means unknown and zero means free, and they are not the same claim.
    if metered:
        patch["cost_usd"] = round(sum(metered), 6)
    store.update("aci_link_runs", {"id": run_id}, patch)


def main():
    run_id = os.environ.get("ACI_LINK_RUN_ID")
    if not run_id:
        sys.exit("ACI_LINK_RUN_ID must name the link run to execute")
    report = run(Store.from_env(), run_id)
    print(f"link run {run_id}: {report['attempted']} attempted, {report['done']} done, "
          f"{report['failed']} failed" + (", cancelled" if report["cancelled"] else ""))
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
