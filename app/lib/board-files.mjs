/* A board read from the file in this repository, for a developer on their own
 * machine.
 *
 * The public site reads the two boards and the overview from the publication
 * being served. Someone editing site/constitutions.json, site/governance.json or
 * site/overview.json wants to see the file as it stands now, without building a
 * publication for every change, so a request carrying ?source=files is answered
 * from site/ on disk.
 *
 * Only under `next dev`. On any other deployment the parameter is ignored and
 * the publication is served, because what the public sees is a publication and
 * never a file. The file is read on every request from site/ rather than from
 * public/: public/ is a copy taken when the server starts, and a long-running
 * server would otherwise show the file as it was that morning.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const BOARDS = new Set(["constitutions", "governance", "overview"]);

/* The board as it stands on disk, or null when this request is not asking for
 * it or is not allowed to. */
export async function boardFromFiles(name, searchParams, {
  env = process.env.NODE_ENV, root = process.cwd(),
} = {}) {
  if (env !== "development") return null;
  if (searchParams.get("source") !== "files" || !BOARDS.has(name)) return null;
  const text = await readFile(path.join(root, "site", `${name}.json`), "utf8");
  return JSON.parse(text);
}
