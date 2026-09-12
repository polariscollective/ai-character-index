#!/usr/bin/env python3
"""The one thing the container runs. Dispatches on the mode.

    ACI_JOB_ID=<uuid> ACI_JOB_MODE=compose|judge|publish python3 engine/job.py

Everything arrives through the environment, because Cloud Run Jobs substitute
environment variables and not arguments -- and through the environment travels
one id, never the arguments themselves. The job reads its own `aci_jobs` row for
what to do, so a list of two hundred behaviours is a jsonb column rather than an
environment variable with a length limit waiting to be found.

One image, one job resource, one IAM grant. A mode is a string, not a deployment.

The row is the only channel back. A job that crashes before it can write its own
failure leaves a `running` row, which is a worse lie than an `error` row, so the
last thing this file does is always a write.
"""

import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "panel"))
sys.path.insert(0, str(HERE / "spec-cite"))

import index_store               # noqa: E402
import publish as publish_mode   # noqa: E402
from store import Store          # noqa: E402


def now():
    return datetime.now(timezone.utc).isoformat()


def run_compose(store, params):
    """Price a run and write it, spending nothing.

    Pricing lives here rather than in the portal because it reads the panel's own
    model prices and counts the passages of a document through cite.py. A
    JavaScript copy of either would be a second truth, and the first thing it
    would diverge on is money.
    """
    import compose_run
    # plan() resolves passages through cite.py, which registers nothing at import
    # time: a caller installs the registry or gets a loud error naming this line.
    index_store.install_registry(store)
    run, calls = compose_run.plan(
        store, params["behaviours"], params["specs"],
        params.get("panel", "frontier_fast"), params.get("rubric", "v5"))
    run["created_by"] = params.get("created_by", "admin portal")
    if not calls:
        # Every cell already has a done call. Nothing to write, and saying so is
        # the answer: the run the operator asked for exists already.
        return {"run_id": None, "detail": "every cell already has a done call"}
    store.insert("aci_runs", [run])
    store.insert("aci_judge_calls", calls)
    return {"run_id": run["id"],
            "detail": f"{len(calls)} calls, ${run['estimated_usd']} estimated"}


def run_judge(store, params):
    """Spend the money. Resume is a filter: every call not done is attempted."""
    import batch_job
    run_id = params["run_id"]
    report = batch_job.run(store, run_id)
    return {"run_id": run_id,
            "detail": f"{report['attempted']} attempted, {report['done']} done, "
                      f"{report['failed']} failed"}


def run_publish(store, params):
    index_store.install_registry(store)
    row, cells = publish_mode.publish(
        store, params["behaviours"], params["specs"], params["panel"],
        params.get("rubric", "v5"), params.get("created_by", "admin portal"),
        params.get("notes", ""), params.get("run_date"))
    return {"publication_id": row["id"],
            "detail": f"{len(cells)} cells, not public"}


MODES = {"compose": run_compose, "judge": run_judge, "publish": run_publish}


def main():
    job_id = os.environ.get("ACI_JOB_ID")
    mode = os.environ.get("ACI_JOB_MODE")
    if not job_id:
        sys.exit("ACI_JOB_ID must name the job row to execute")
    if mode not in MODES:
        sys.exit(f"ACI_JOB_MODE must be one of {', '.join(sorted(MODES))}, got {mode!r}")

    store = Store.from_env()
    job = next((row for row in store.select("aci_jobs") if row["id"] == job_id), None)
    if job is None:
        sys.exit(f"no job {job_id}")
    # The row says what it is. A mode in the environment that disagrees with the
    # row means the launcher and the container are not talking about the same work.
    if job["mode"] != mode:
        sys.exit(f"job {job_id} is a {job['mode']} job, ACI_JOB_MODE says {mode}")

    store.update("aci_jobs", {"id": job_id}, {"status": "running", "started_at": now()})
    try:
        result = MODES[mode](store, job["params"] or {})
    except BaseException as failure:            # noqa: BLE001
        # Every exit, including SystemExit from a refusal and a KeyboardInterrupt
        # from a cancelled execution. A row left `running` says the work may still
        # be happening, which is the one thing it must never say falsely.
        detail = str(failure) or failure.__class__.__name__
        store.update("aci_jobs", {"id": job_id},
                     {"status": "error", "error": detail[:4000], "finished_at": now()})
        print(traceback.format_exc(), file=sys.stderr)
        return 1

    patch = {"status": "done", "finished_at": now()}
    for column in ("run_id", "publication_id"):
        if result.get(column):
            patch[column] = result[column]
    store.update("aci_jobs", {"id": job_id}, patch)
    print(f"{mode} {job_id}: {result.get('detail', 'done')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
