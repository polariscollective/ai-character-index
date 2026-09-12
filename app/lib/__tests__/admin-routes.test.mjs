/**
 * The shape every mutating route has: check, read a form, act, redirect.
 * Run: node --test app/lib/__tests__/admin-routes.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Fields, formRoute, refuse } from "../admin-routes.mjs";

const ALLOW = async () => ({ email: "me@example.com" });
const DENY = async () => ({ response: Response.json({ error: "not signed in" }, { status: 401 }) });

function post(fields = {}) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const one of [].concat(value)) body.append(name, one);
  }
  return new Request("https://example.test/api/admin/thing", { method: "POST", body });
}

test("the guard answers first: the action never runs unsigned", async () => {
  let ran = false;
  const route = formRoute("/admin/thing", DENY, async () => { ran = true; });
  const response = await route(post({ verb: "go" }));
  assert.equal(response.status, 401);
  assert.equal(ran, false, "the action ran for somebody with no session");
});

test("what the action returns comes back on the page that asked", async () => {
  const route = formRoute("/admin/thing", ALLOW, async () => "Registered nine-lives.");
  const response = await route(post());
  // 303, never 302: a browser may repeat a POST across a 302, and repeating one
  // of these launches a second job.
  assert.equal(response.status, 303);
  const to = new URL(response.headers.get("location"));
  assert.equal(to.pathname, "/admin/thing");
  assert.equal(to.searchParams.get("done"), "Registered nine-lives.");
  assert.equal(to.searchParams.get("problem"), null);
});

test("a refusal comes back as a problem, not as a five hundred", async () => {
  const route = formRoute("/admin/thing", ALLOW, async () => refuse("slug is required"));
  const response = await route(post());
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("location")).searchParams.get("problem"),
               "slug is required");
});

test("an unexpected failure is still a sentence on the page", async () => {
  const route = formRoute("/admin/thing", ALLOW, async () => { throw new TypeError("undefined is not a function"); });
  const response = await route(post());
  assert.match(response.headers.get("location"), /problem=undefined\+is\+not/);
});

test("the operator's address reaches the action", async () => {
  let seen;
  const route = formRoute("/admin/thing", ALLOW, async (fields, email) => { seen = email; return "ok"; });
  await route(post());
  assert.equal(seen, "me@example.com");
});

test("a form's values are trimmed, repeated, and read as checkboxes", async () => {
  const fields = new Fields((() => {
    const data = new FormData();
    data.append("name", "  spaced  ");
    data.append("markdown", "  keep my edges  ");
    data.append("behaviours", " a ");
    data.append("behaviours", "");
    data.append("behaviours", "b");
    data.append("public", "on");
    return data;
  })());
  assert.equal(fields.one("name"), "spaced");
  assert.equal(fields.raw("markdown"), "  keep my edges  ");
  assert.deepEqual(fields.many("behaviours"), ["a", "b"]);
  assert.equal(fields.on("public"), true);
  assert.equal(fields.on("private"), false);
  assert.equal(fields.one("absent"), "", "an absent field is empty, never undefined");
});
