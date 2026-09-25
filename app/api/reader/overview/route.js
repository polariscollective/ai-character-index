/* The overview a publication froze: site/overview.json as it stood when the
 * publication was built, held to a digest, beside the two boards. A publication
 * built before the overview was frozen answers 404, and the page says it cannot
 * show it. See the migration
 * 20260924200000_aci_a_publication_carries_the_overview.sql in polaris-supabase.
 */
import { readerResponse } from "../../../lib/publications.mjs";
import { boardFromFiles } from "../../../lib/board-files.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  // On a developer's machine only: the file as it stands. See board-files.mjs.
  const fromFiles = await boardFromFiles("overview", params);
  if (fromFiles) return Response.json(fromFiles, { headers: { "Cache-Control": "no-store" } });
  const { status, body, cacheControl } = await readerResponse("overview", params);
  return Response.json(body, {
    status,
    headers: cacheControl ? { "Cache-Control": cacheControl } : {},
  });
}
