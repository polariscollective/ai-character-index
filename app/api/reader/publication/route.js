/* Which publication the reader is serving, and nothing else.
 *
 * The payloads carry what was judged. This carries which build of the index you
 * are looking at: its id, when it was published, the panel behind it and the
 * digests of the two files it serves. A citation of a dataset that changes has
 * to name the version it read, and this is how a page learns that without
 * downloading three hundred kilobytes of coverage to find a date. */
import { isPublicationId, publicationRow, servesDevelopment }
  from "../../../lib/publications.mjs";
import { select } from "../../../lib/supabase.mjs";

export const dynamic = "force-dynamic";

/**
 * Where the build on screen stands: `published`, `unpublished` or `superseded`.
 *
 * A page that warns a reader has to say which of the three it is looking at,
 * and `is_public` alone answers only the middle one. The third needs the newest
 * public publication to compare against, which is asked for here rather than in
 * the page, because a page asking twice would have to know that a development
 * deployment's unpinned answer is the newest build and not the newest public
 * one.
 *
 * Nothing is claimed where nothing is known: a row with no date, or a table
 * with nothing public in it, stands as published when it is public and
 * unpublished when it is not.
 */
async function standingOf(row, fetchImpl = fetch) {
  if (row.is_public !== true) return "unpublished";
  const [newest] = await select(
    "aci_publications",
    "select=id,published_at&is_public=is.true&order=published_at.desc&limit=1",
    fetchImpl);
  if (!newest || newest.id === row.id) return "published";
  return new Date(row.published_at) < new Date(newest.published_at)
    ? "superseded" : "published";
}

export async function GET(request) {
  const pin = new URL(request.url).searchParams.get("publication");
  if (pin !== null && !isPublicationId(pin)) {
    return Response.json({ error: "publication must be a uuid" }, { status: 400 });
  }
  const row = await publicationRow(pin);
  if (!row) {
    return Response.json({ error: pin ? "no such publication" : "nothing published yet" },
                         { status: 404 });
  }
  /* Whether this deployment serves development, said alongside the build it is
   * serving. It is a fact about where the code is running and not about the
   * publication, which is why it rides on the response rather than in the row.
   *
   * A page needs it because is_public alone cannot mark a development site: a
   * development deployment serves the newest build whether or not anyone
   * published it, and when the newest happens to be public there is nothing for
   * is_public to say. The site would then look like production to a reader while
   * being the place unreviewed work lands. */
  return Response.json(
    { ...row, development: servesDevelopment(), standing: await standingOf(row) },
    {
      /* One rule for both, where a pinned row used to be cached for a year. The
       * row itself is still immutable; `standing` is not, because publishing a
       * newer build turns this one into an earlier publication without touching
       * it. A year of that answer would be a year of a page saying a figure is
       * current when it has moved. */
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
}
