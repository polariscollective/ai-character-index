import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { boardFromFiles } from "../board-files.mjs";

async function repo(contents) {
  const root = await mkdtemp(path.join(os.tmpdir(), "board-files-"));
  await mkdir(path.join(root, "site"));
  await writeFile(path.join(root, "site", "governance.json"), JSON.stringify(contents));
  return root;
}

const files = new URLSearchParams("source=files");

test("under next dev, ?source=files reads the file as it stands", async () => {
  const root = await repo({ edited: true });
  assert.deepEqual(
    await boardFromFiles("governance", files, { env: "development", root }),
    { edited: true });
});

test("any other deployment ignores the parameter", async () => {
  const root = await repo({ edited: true });
  assert.equal(await boardFromFiles("governance", files, { env: "production", root }), null);
});

test("without the parameter the publication is served", async () => {
  const root = await repo({ edited: true });
  assert.equal(
    await boardFromFiles("governance", new URLSearchParams(), { env: "development", root }),
    null);
});

test("only the two boards have a file to read", async () => {
  const root = await repo({});
  assert.equal(await boardFromFiles("payload", files, { env: "development", root }), null);
});
