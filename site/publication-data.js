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

/* One board of the publication being served, or null when it cannot be had. */
export async function loadBoard(name) {
  const pin = pinned();
  const query = pin ? `?publication=${encodeURIComponent(pin)}` : "";
  try {
    const response = await fetch(`/api/reader/${name}${query}`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
