/**
 * What a stored citation's grammar forbids in a name.
 *
 * A locator reads `<spec>@<version> > <section> > ¶3 s2` (specs/CITATION.md), so
 * the document id and the version label are parsed OUT of a string by splitting
 * on `@` and on the path separator. A name carrying either character produces
 * locators that cannot be read back, and every judgement the index stores points
 * through one.
 *
 * This replaces a guard that died quietly. The user manifest carried a slug
 * pattern and a date pattern; when the manifest went, both became unused
 * constants. The date pattern was never the real constraint either -- a lab that
 * labels a release `v3` is not wrong, and refusing it would have been this
 * repository's convention imposed on someone else's document. What the grammar
 * actually cannot carry is the two separators, and that is what is refused here.
 */

/* `>` and `›` are interchangeable separators, so both are out. Whitespace at
 * either end is out because a locator is compared after being split, not
 * trimmed, and a trailing space would make two names that look identical fail
 * to match. */
const FORBIDDEN = /[@>›]/;

export function locatorSafe(value, what) {
  if (typeof value !== "string" || value === "") {
    return `${what} is required`;
  }
  if (value !== value.trim()) {
    return `${what} must not begin or end with whitespace`;
  }
  const found = value.match(FORBIDDEN);
  if (found) {
    return `${what} must not contain ${found[0]}: a citation reads `
         + `name@version > section, so that character would make its locators unparseable`;
  }
  return null;
}

/* A behaviour's slug is a url and a database key as well as a label, and it has
 * always been this shape. Every stored slug matches it. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugProblem(value) {
  if (typeof value !== "string" || value === "") return "slug is required";
  if (!SLUG.test(value)) {
    return "slug must be lowercase words joined by single hyphens, "
         + "such as user-autonomy";
  }
  return null;
}

/** Every problem with a set of fields, so a form reports them all at once. */
export function problems(checks) {
  return checks.map(([check, value, what]) => check(value, what)).filter(Boolean);
}
