/* Which publication the reader is serving, and nothing else.
 *
 * The payloads carry what was judged. This carries which build of the index you
 * are looking at: its id, when it was published, the panel behind it and the
 * digests of the two files it serves. A citation of a dataset that changes has
 * to name the version it read, and this is how a page learns that without
 * downloading three hundred kilobytes of coverage to find a date. */
import { isPublicationId, publicationRow, servesDevelopment }
  from "../../../lib/publications.mjs";

export const dynamic = "force-dynamic";

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
  return Response.json({ ...row, development: servesDevelopment() }, {
    headers: {
      "Cache-Control": pin
        ? "public, max-age=31536000, immutable"
        : "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
