/* The mark of a company, drawn above its name on both boards.
 *
 * WHY THEY ARE HERE. The Polaris framework's "do not" list names icon libraries,
 * and these are not one: they are the marks of the companies being assessed, the
 * way a row of an assessment carries the mark of what it assesses. Nothing else
 * on either board is drawn rather than written, and no mark is used as a bullet,
 * a section marker or decoration anywhere else.
 *
 * WHERE THEY LIVE. In the boards' own files, one `mark` per company, so a
 * publication freezes the marks it was shown with like everything else on the
 * page, and a company added later brings its mark with it. Each carries its
 * path, its grid and its source; where a company has no mark of its own and one
 * is drawn with a parent's, a division's or a sibling's, `drawn_as` says so.
 * They come from Simple Icons, released under CC0 1.0. A mark is a trademark of
 * its owner whatever the licence on the drawing of it, and it is used here to
 * identify the company assessed, which is what these boards do.
 *
 * WHAT A MARK IS. One path filled with `currentColor`, so the colour is the
 * stylesheet's and a mark is one quiet tone rather than a company's brand
 * colours. It is decorative: the company's name is written under it and is what
 * a screen reader announces, and the mark itself carries aria-hidden.
 */

/* The mark a company's entry carries, and where it carries none, the space it
 * would have taken. The blank is deliberate: without it a company with no mark
 * would have its name a line higher than its neighbours', which reads as a
 * fault in the table rather than as a company nobody has a drawing for. */
export function companyMark(mark) {
  if (!mark?.path) {
    const blank = document.createElement("span");
    blank.className = "company-mark";
    blank.setAttribute("aria-hidden", "true");
    return blank;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "company-mark");
  svg.setAttribute("viewBox", mark.view_box || "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const node = document.createElementNS("http://www.w3.org/2000/svg", "path");
  node.setAttribute("d", mark.path);
  node.setAttribute("fill", "currentColor");
  svg.append(node);
  return svg;
}
