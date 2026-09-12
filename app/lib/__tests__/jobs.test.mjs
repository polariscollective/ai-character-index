/**
 * Starting a job. Neither fetch nor spawn is real here, so no process starts and
 * no request leaves.
 * Run: node --test app/lib/__tests__/jobs.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { startJob } from "../jobs.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "KEY";

const JOB = "11111111-2222-3333-4444-555555555555";

/* PostgREST for the job table, plus whatever the trigger is made to answer. */
function stub({ trigger } = {}) {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url, ...init });
    if (!url.includes("/rest/v1/")) return trigger(url, init);
    const body = init.body ? JSON.parse(init.body) : null;
    const row = init.method === "POST"
      ? { id: JOB, ...body[0] }
      : { id: JOB, ...body };
    return { ok: true, status: 200, json: async () => [row], text: async () => "" };
  };
  return { seen, fetchImpl };
}

function fakeSpawn() {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    return { pid: 4242, unref() { this.unreffed = true; } };
  };
  return { calls, spawnImpl };
}

function withEnv(values, body) {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  for (const [k, v] of Object.entries(values)) if (v === undefined) delete process.env[k];
  return (async () => { try { return await body(); } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  } })();
}

test("with an interpreter named, the job is a local subprocess", async () => {
  await withEnv({ ACI_PYTHON: "/usr/bin/python3", NODE_ENV: "development" }, async () => {
    const { seen, fetchImpl } = stub();
    const { calls, spawnImpl } = fakeSpawn();
    const job = await startJob("judge", { run_id: "r" }, "me@example.com",
                               { fetchImpl, spawnImpl });
    assert.equal(job.execution, "local:4242");
    assert.equal(JSON.parse(seen[0].body)[0].origin, "local");
    assert.equal(calls[0].command, "/usr/bin/python3");
    assert.deepEqual(calls[0].args, ["engine/job.py"]);
    assert.equal(calls[0].options.env.ACI_JOB_ID, JOB);
    assert.equal(calls[0].options.env.ACI_JOB_MODE, "judge");
    assert.equal(calls[0].options.detached, true);
  });
});

test("in production an interpreter is ignored: a serverless instance is not an execution machine", async () => {
  await withEnv({ ACI_PYTHON: "/usr/bin/python3", NODE_ENV: "production",
                  BATCH_TRIGGER_URL: "https://trigger.example", BATCH_TRIGGER_SECRET: "s" },
    async () => {
      const { fetchImpl } = stub({
        trigger: async () => ({ ok: true, json: async () => ({ execution: "exec-9" }) }),
      });
      const { calls, spawnImpl } = fakeSpawn();
      const job = await startJob("judge", {}, "me@example.com", { fetchImpl, spawnImpl });
      assert.equal(calls.length, 0, "a process was started in production");
      assert.equal(job.execution, "exec-9");
    });
});

test("the trigger is called with the job name and the id in the environment", async () => {
  await withEnv({ ACI_PYTHON: undefined, NODE_ENV: "development",
                  BATCH_TRIGGER_URL: ' "https://trigger.example" ',
                  BATCH_TRIGGER_SECRET: " secret " }, async () => {
    let asked;
    const { fetchImpl } = stub({
      trigger: async (url, init) => {
        asked = { url, headers: init.headers, body: JSON.parse(init.body) };
        return { ok: true, json: async () => ({ execution: "exec-1" }) };
      },
    });
    await startJob("publish", { notes: "x" }, "me@example.com", { fetchImpl });
    // Quotes and spaces as a paste leaves them, stripped: otherwise the secret
    // is wrong in a way indistinguishable from the wrong secret.
    assert.equal(asked.url, "https://trigger.example");
    assert.equal(asked.headers.Authorization, "Bearer secret");
    assert.equal(asked.body.job, "ai-character-index-runner");
    assert.deepEqual(asked.body.env, { ACI_JOB_ID: JOB, ACI_JOB_MODE: "publish" });
  });
});

test("the arguments travel in the row, never in the environment", async () => {
  await withEnv({ ACI_PYTHON: undefined, NODE_ENV: "development",
                  BATCH_TRIGGER_URL: "https://trigger.example",
                  BATCH_TRIGGER_SECRET: "s" }, async () => {
    const many = { behaviours: Array.from({ length: 200 }, (_, i) => `behaviour-${i}`) };
    let env;
    const { seen, fetchImpl } = stub({
      trigger: async (url, init) => {
        env = JSON.parse(init.body).env;
        return { ok: true, json: async () => ({ execution: "e" }) };
      },
    });
    await startJob("compose", many, "me@example.com", { fetchImpl });
    assert.deepEqual(Object.keys(env), ["ACI_JOB_ID", "ACI_JOB_MODE"]);
    assert.deepEqual(JSON.parse(seen[0].body)[0].params, many);
  });
});

test("a trigger that refuses leaves the row behind carrying the error", async () => {
  await withEnv({ ACI_PYTHON: undefined, NODE_ENV: "development",
                  BATCH_TRIGGER_URL: "https://trigger.example",
                  BATCH_TRIGGER_SECRET: "s" }, async () => {
    const { seen, fetchImpl } = stub({
      trigger: async () => ({ ok: false, status: 401,
                              json: async () => ({ error: "unauthorized" }) }),
    });
    await assert.rejects(() => startJob("judge", {}, "me@example.com", { fetchImpl }),
                         /unauthorized/);
    const patch = seen.findLast(call => call.method === "PATCH");
    assert.deepEqual(JSON.parse(patch.body).status, "error");
    assert.match(JSON.parse(patch.body).error, /unauthorized/);
  });
});

test("an unreachable trigger says so rather than throwing whatever fetch threw", async () => {
  await withEnv({ ACI_PYTHON: undefined, NODE_ENV: "development",
                  BATCH_TRIGGER_URL: "https://trigger.example",
                  BATCH_TRIGGER_SECRET: "s" }, async () => {
    const { fetchImpl } = stub({ trigger: async () => { throw new Error("ENOTFOUND"); } });
    await assert.rejects(() => startJob("judge", {}, "me@example.com", { fetchImpl }),
                         /batch trigger unreachable: ENOTFOUND/);
  });
});

test("neither a trigger nor an interpreter says which one to set", async () => {
  await withEnv({ ACI_PYTHON: undefined, NODE_ENV: "development",
                  BATCH_TRIGGER_URL: undefined, BATCH_TRIGGER_SECRET: undefined },
    async () => {
      const { fetchImpl } = stub();
      await assert.rejects(() => startJob("judge", {}, "me@example.com", { fetchImpl }),
                           /ACI_PYTHON/);
    });
});

test("an unknown mode is refused before a row is written", async () => {
  let called = false;
  await assert.rejects(
    () => startJob("rejudge", {}, "me@example.com", { fetchImpl: async () => { called = true; } }),
    /unknown job mode rejudge/);
  assert.equal(called, false);
});
