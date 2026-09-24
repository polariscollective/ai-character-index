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

/* `comparisons: false` leaves the comparison paragraphs out, which a publication
 * on the scale of ten asks for: every paragraph written so far quotes each
 * document's figure out of 4. The key stays, empty and in its place, so a
 * reader looking for a comparison finds none rather than a missing field, and
 * nothing else in the file moves. */
export async function buildLinks(runIds, notePrompts, fetchImpl = fetch,
                                 { comparisons = true } = {}) {
  if (!Array.isArray(runIds) || !runIds.length) {
    throw new Error("build-links-data: name at least one run with --link-runs");
  }
  const links = await readerLinks(fetchImpl, runIds, notePrompts);
  return comparisons ? links : { ...links, comparisons: {} };
}

/* Two space indentation and no trailing newline. Not a style choice: the
 * verifier re-serialises the stored JSON with
 * json.dumps(obj, **publish.FORMATS["links"]) and holds it to the recorded
 * digest, and Python's json.dumps(indent=2, ensure_ascii=False) writes exactly
 * this and cannot write a trailing newline. */
export function serialise(value) {
  return JSON.stringify(value, null, 2);
}

/* What the command line asks for. */
export function options(argv) {
  const argument = name => {
    const found = argv.find(arg => arg.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : null;
  };
  /* Absent and empty are different answers. No flag means take every note, which
   * is what a reader outside a publication wants; an empty flag means this
   * publication pinned no notes at all, and must not silently acquire the ones
   * written since. */
  const notes = argument("note-prompts");
  return {
    out: argument("out"),
    runIds: (argument("link-runs") || "").split(",").filter(Boolean),
    notePrompts: notes === null ? null : notes.split(",").filter(Boolean),
    comparisons: !argv.includes("--without-comparisons"),
  };
}

async function main() {
  const { out, runIds, notePrompts, comparisons } = options(process.argv);
  if (!out) throw new Error("build-links-data: --out is required");
  writeFileSync(out, serialise(await buildLinks(runIds, notePrompts, fetch, { comparisons })));
}

if (process.argv[1] && process.argv[1].endsWith("build-links-data.mjs")) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
