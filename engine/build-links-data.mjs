/**
 * What a publication carries about links, written to a file for publish.py.
 *
 * The third builder, beside engine/panel/build_site_data.py and
 * engine/build-spec-reader-data.py. This one is JavaScript because the assembly
 * it needs already exists in app/lib/links.mjs, and a Python port would be a
 * second copy of it. This repository has paid for that kind of drift before:
 * bands.shown_by_default drifted from the reader's own DEFAULT_BANDS, and the
 * depth figures published off the difference were wrong until somebody asked
 * why one cell read 1.0.
 *
 * The runs are named, never guessed. Which runs the public sees is a decision a
 * publication records, not something a filter on a script name decides.
 */
import { writeFileSync } from "node:fs";
import { readerLinks } from "../app/lib/links.mjs";

export async function buildLinks(runIds, fetchImpl = fetch) {
  if (!Array.isArray(runIds) || !runIds.length) {
    throw new Error("build-links-data: name at least one run with --link-runs");
  }
  return readerLinks(fetchImpl, runIds);
}

/* Two space indentation and no trailing newline. Not a style choice: the
 * verifier re-serialises the stored JSON with
 * json.dumps(obj, **publish.FORMATS["links"]) and holds it to the recorded
 * digest, and Python's json.dumps(indent=2, ensure_ascii=False) writes exactly
 * this and cannot write a trailing newline. */
export function serialise(value) {
  return JSON.stringify(value, null, 2);
}

function argument(name) {
  const found = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
}

async function main() {
  const out = argument("out");
  if (!out) throw new Error("build-links-data: --out is required");
  const runIds = (argument("link-runs") || "").split(",").filter(Boolean);
  writeFileSync(out, serialise(await buildLinks(runIds)));
}

if (process.argv[1] && process.argv[1].endsWith("build-links-data.mjs")) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
