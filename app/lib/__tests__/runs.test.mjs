/**
 * Whether a run can be launched, which is also whether its failed calls can be
 * tried again.
 * Run: node --test app/lib/__tests__/runs.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { depthTally, launchRefusal, mergeCounts } from "../runs.mjs";

test("a pending run is launched", () => {
  assert.equal(launchRefusal({ status: "pending" }, { pending: 6 }), null);
});

test("a done run whose calls failed can be launched again, to retry them", () => {
  // A run is marked done once every call has come back, failed or not. Refusing
  // it here left a failed seat with only one way forward, a second run, and a
  // cell whose judges are split across two runs cannot be published.
  assert.equal(launchRefusal({ status: "done" }, { done: 5, error: 1 }), null);
});

test("a done run with every call done is refused, and says what to do instead", () => {
  assert.match(launchRefusal({ status: "done" }, { done: 6 }), /every call.*done.*Compose/s);
});

test("a run already running is refused", () => {
  assert.match(launchRefusal({ status: "running" }, { running: 2, pending: 4 }),
               /already running/);
});

test("a cancelled run is launched again: cancelling is a pause", () => {
  assert.equal(launchRefusal({ status: "cancelled" }, { done: 2, pending: 4 }), null);
});

test("no run is refused as no run", () => {
  assert.equal(launchRefusal(undefined, {}), "no such run");
});

test("a run's work is its passage calls and its depths, counted as one", () => {
  assert.deepEqual(mergeCounts({ done: 6 }, { done: 4, pending: 2 }), { done: 10, pending: 2 });
});

test("a done run whose depths are not all given can be launched again", () => {
  assert.equal(launchRefusal({ status: "done" }, mergeCounts({ done: 6 }, { error: 1, done: 5 })), null);
});

test("a call's depth is counted as an object, as an array, and not at all when missing", () => {
  // Read through the foreign key, so a run of any size is one query. PostgREST
  // embeds a one-to-one relation as an object or null; an array is taken too.
  const calls = [
    { id: "a", status: "done", aci_depths: { status: "done" } },
    { id: "b", status: "done", aci_depths: null },
    { id: "c", status: "error", aci_depths: [{ status: "error" }] },
    { id: "d", status: "pending", aci_depths: [] },
    { id: "e", status: "pending" },
  ];
  assert.deepEqual(depthTally(calls), { done: 1, error: 1 });
});
