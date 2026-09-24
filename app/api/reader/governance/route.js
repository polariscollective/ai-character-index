/* The governance board a publication froze: site/governance.json as it stood when
 * the publication was built, held to a digest. A publication is the whole of
 * what the site shows at one moment, so the front page reads its boards from
 * here and never from a file. A publication built before boards were frozen
 * answers 404, and the page says it cannot show it. See the migration
 * 20260924160000_aci_a_publication_carries_both_boards.sql in polaris-supabase.
 */
import { readerResponse } from "../../../lib/publications.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { status, body, cacheControl } = await readerResponse(
    "governance", new URL(request.url).searchParams);
  return Response.json(body, {
    status,
    headers: cacheControl ? { "Cache-Control": cacheControl } : {},
  });
}
