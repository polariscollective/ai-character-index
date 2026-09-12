/**
 * Starting the container that does the work, and saying where it ran.
 *
 * Three operations are Python -- pricing a run, judging it, building a
 * publication -- and Vercel has neither a Python runtime nor a GCP identity. In
 * deployment the request therefore goes to `polaris-batch-trigger`, the generic
 * Cloud Run service that holds the identity Vercel lacks and starts the job with
 * environment overrides. In development it goes to a subprocess, which is the
 * only way to keep the portal usable on a laptop without introducing a second
 * implementation of the work.
 *
 * A job row exists before anything starts. The environment carries its id and
 * nothing else: the job reads its own row for what to do, so a long behaviour
 * list is a jsonb column rather than an environment variable with a length limit
 * waiting to be found.
 */
import { spawn } from "node:child_process";
import { insert, select, update } from "./supabase.mjs";

const JOB_NAME = process.env.ACI_JOB_NAME || "ai-character-index-runner";

/* The interpreter that runs the job in development, named only by the
 * environment. No literal path in the code: bundlers analyse spawn's first
 * argument and follow it, and a virtualenv symlink pointing outside the project
 * root breaks the build. Naming it through a variable also makes explicit that
 * this is a convenience of a development machine. */
const LOCAL_PYTHON = "ACI_PYTHON";

export const MODES = ["compose", "judge", "publish"];

/* Can the subprocess stand in for the Cloud Run service?
 *
 * Both conditions together, deliberately. A variable left behind on a deployment
 * must not turn a serverless instance into an execution machine: it has no
 * provider key, so every call of the run would fail, and the run would look
 * attempted rather than never started. */
function canRunLocally() {
  return process.env.NODE_ENV !== "production" && Boolean(process.env[LOCAL_PYTHON]);
}

/* A variable as someone pasted it into a deployment's settings.
 *
 * Quotes left around a value, or a leading space, give a 401 indistinguishable
 * from a wrong secret -- the HTTP layer trims the trailing edge but not the
 * leading one. Those are the two accidents a paste really produces. */
function pasted(value) {
  const clean = value?.trim().replace(/^["']|["']$/g, "");
  return clean || undefined;
}

function runLocally(jobId, mode, spawnImpl) {
  const root = process.cwd();
  const child = spawnImpl(process.env[LOCAL_PYTHON], ["engine/job.py"], {
    cwd: root,
    env: { ...process.env, ACI_JOB_ID: jobId, ACI_JOB_MODE: mode },
    // Detached with no inherited channels: the HTTP request that started the job
    // ends immediately and the job carries on. An attached child dies with the
    // dev server's next reload.
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return `local:${child.pid}`;
}

async function runRemotely(jobId, mode, fetchImpl) {
  const url = pasted(process.env.BATCH_TRIGGER_URL);
  const secret = pasted(process.env.BATCH_TRIGGER_SECRET);
  if (!url || !secret) {
    throw new Error(
      process.env.NODE_ENV === "production"
        ? "BATCH_TRIGGER_URL and BATCH_TRIGGER_SECRET must both be set."
        : `Set BATCH_TRIGGER_URL to use the deployed trigger, or ${LOCAL_PYTHON}`
          + " to run the job locally.");
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        job: JOB_NAME,
        env: { ACI_JOB_ID: jobId, ACI_JOB_MODE: mode },
      }),
      cache: "no-store",
    });
  } catch (error) {
    // An unreachable trigger -- DNS, a cold start that timed out -- makes fetch
    // throw, and without this the caller receives an HTML error page where it
    // expects JSON.
    throw new Error(`batch trigger unreachable: ${error.message}`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `batch trigger returned ${response.status}`);
  }
  return body.execution || "";
}

/**
 * Write the job row, start the container, and record what started.
 *
 * A launch that fails leaves the row behind carrying its error rather than
 * disappearing: the operator pressed a button, and something has to say what
 * came of it.
 */
export async function startJob(mode, params, createdBy,
                               { fetchImpl = fetch, spawnImpl = spawn } = {}) {
  if (!MODES.includes(mode)) throw new Error(`unknown job mode ${mode}`);
  const local = canRunLocally();
  const [job] = await insert("aci_jobs", [{
    created_by: createdBy,
    mode,
    params,
    origin: local ? "local" : "cloud-run",
    status: "pending",
  }], fetchImpl);

  try {
    const execution = local
      ? runLocally(job.id, mode, spawnImpl)
      : await runRemotely(job.id, mode, fetchImpl);
    const [started] = await update("aci_jobs", `id=eq.${job.id}`, { execution }, fetchImpl);
    return started;
  } catch (error) {
    await update("aci_jobs", `id=eq.${job.id}`,
                 { status: "error", error: error.message, finished_at: new Date().toISOString() },
                 fetchImpl).catch(() => {});
    throw error;
  }
}

/** The most recent jobs, newest first. */
export async function recentJobs(limit = 20, fetchImpl = fetch) {
  return select("aci_jobs", `select=*&order=created_at.desc&limit=${limit}`, fetchImpl);
}
