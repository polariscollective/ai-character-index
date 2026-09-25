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
 * check here decides only whether the switch is offered. */
const SOURCE_KEY = "aci-board-source";

/* This machine, or another device on the same private network reaching the
 * development server by its address, such as a phone on the same Wi-Fi. */
const PRIVATE = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/;
export const isLocal = () => typeof location !== "undefined" && PRIVATE.test(location.hostname);

export function readsFiles() {
  if (!isLocal()) return false;
  try { return localStorage.getItem(SOURCE_KEY) === "files"; } catch { return false; }
}

export function setReadsFiles(on) {
  try {
    if (on) localStorage.setItem(SOURCE_KEY, "files");
    else localStorage.removeItem(SOURCE_KEY);
  } catch { /* Storage refused: the page stays on the publication. */ }
}

/* One board of the publication being served, or null when it cannot be had. */
export async function loadBoard(name) {
  const pin = pinned();
  const query = readsFiles() ? "?source=files"
    : pin ? `?publication=${encodeURIComponent(pin)}` : "";
  try {
    const response = await fetch(`/api/reader/${name}${query}`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
