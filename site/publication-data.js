/* What the front page's boards are read from: the publication being served.
 *
 * A publication is the whole of what the site shows at one moment, the reader's
 * data and both boards, so a board is read from the publication and never from
 * a file the site ships. With ?publication= in the address it is that
 * publication; with none, the current one.
 *
 * Whatever keeps a board from being drawn, a publication that carries none, a
 * key the page looks for and does not find, a request that fails, the reader is
 * told one thing: this publication cannot be read with this version of the
 * site. Which of those it was is ours to find out, not theirs.
 */

import { DEPLOYMENT } from "./deployment.js";

/* The publication the address pins, if any. Read when asked rather than when
 * this module loads: the MCP server imports governance.js, and with it this
 * file, in node, where there is no address to read. */
export const pinned = () => (typeof location === "undefined"
  ? null : new URLSearchParams(location.search).get("publication"));

export const INCOMPATIBLE = "This publication is not compatible with this version of the site. "
  + "To ask for its raw data, send us a note with the Feedback button at the bottom right of "
  + "the page.";

/* On a developer's own machine the boards can be read from the files in the
 * repository instead, as they stand now, so an edit to constitutions.json or
 * governance.json shows without building a publication. The choice is kept in
 * the browser and made with the switch dev-tag.js puts beside its tag. The
 * server honours it only under next dev (app/lib/board-files.mjs), so the
 * check here decides only whether the switch is offered.
 *
 * A Vercel preview of a working branch, any branch but develop and main, reads
 * the files too, and by default: that is what the branch is there to show. It
 * reads the copy of site/ the build put in public/, which is the branch as it
 * was pushed, and the switch is offered to compare with the publication.
 * Production and develop never do. */
const SOURCE_KEY = "aci-board-source";

/* Whether this copy was built as a preview of a working branch. */
export function branchPreview(deployment) {
  return deployment?.env === "preview" && Boolean(deployment.branch)
    && !["develop", "main"].includes(deployment.branch);
}
const onBranchPreview = () => branchPreview(DEPLOYMENT);

/* This machine, or another device on the same private network reaching the
 * development server by its address, such as a phone on the same Wi-Fi. */
const PRIVATE = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/;
export const isLocal = () => typeof location !== "undefined" && PRIVATE.test(location.hostname);

/* Whether the switch between the publication and the files is offered. */
export const offersFiles = () => isLocal() || onBranchPreview();

export function readsFiles() {
  if (!offersFiles()) return false;
  try {
    const chosen = localStorage.getItem(SOURCE_KEY);
    // A branch preview reads the files unless the publication was chosen.
    return onBranchPreview() ? chosen !== "publication" : chosen === "files";
  } catch {
    return onBranchPreview();
  }
}

export function setReadsFiles(on) {
  try {
    if (on) localStorage.setItem(SOURCE_KEY, "files");
    else if (onBranchPreview()) localStorage.setItem(SOURCE_KEY, "publication");
    else localStorage.removeItem(SOURCE_KEY);
  } catch { /* Storage refused: the page stays where it opened. */ }
}

/* The id of the publication being served, asked once per page. The answer is
 * small and changes when a publication is made public, so it is cached for a
 * minute; everything read after it names the publication by id, and a pinned
 * publication is cached at the edge for good. A cold function then costs one
 * small lookup rather than every board, and a page cannot mix two publications
 * when a new one goes public in the middle of its loading. */
let current = null;
function currentPublication() {
  current ??= fetch("/api/reader/publication")
    .then(response => (response.ok ? response.json() : null))
    .then(row => row?.id || null)
    .catch(() => null);
  return current;
}

/* One board of the publication being served, or null when it cannot be had. */
export async function loadBoard(name) {
  const files = readsFiles();
  const pin = files ? null : (pinned() || await currentPublication());
  const query = files ? "?source=files"
    : pin ? `?publication=${encodeURIComponent(pin)}` : "";
  // Locally the files are read live through the route; on a branch preview,
  // from the copy the build made, which the route does not serve there.
  const address = files && !isLocal() ? `/${name}.json` : `/api/reader/${name}${query}`;
  try {
    const response = await fetch(address);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
