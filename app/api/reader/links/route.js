/* What one document's passage does to another's, and the paragraphs written
 * about both.
 *
 * The reader took all of this from flat files beside it -- links.json, and later
 * depths.json and overview.json -- which were renderings of rows already in the
 * database. Being files, they were gitignored, so no deployment ever carried
 * them: the bubbles, the comparisons and the readings existed only on the
 * machine that generated them. This is the same shape, read from the tables, so
 * a deployment shows what the index actually holds.
 *
 * Not scoped to a publication, deliberately. A link is attached to a pair of
 * locators and to nothing else: it needs no publication id, and a reader looking
 * at a draft and a reader looking at the public build are looking at the same
 * links. What a publication decides is which verdicts and depths are shown, and
 * those come from the payload route.
 */
import { readerLinks } from "../../../lib/links.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await readerLinks(), {
    /* Links change when a run is stored, which is rarely and never from the
     * browser. Cached at the edge for a few minutes and revalidated behind the
     * reader's back: a stale answer here costs a reader nothing, and the payload
     * this accompanies is cached the same way. */
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
  });
}
