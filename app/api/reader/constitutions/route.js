/* The constitutions board a publication froze: site/constitutions.json as it stood when
 * the publication was built, held to a digest. A publication is the whole of
 * what the site shows at one moment, so the front page reads its boards from
 * here and never from a file. A publication built before boards were frozen
 * answers 404, and the page says it cannot show it. See the migration
 * 20260924160000_aci_a_publication_carries_both_boards.sql in polaris-supabase.
 */
import { readerResponse } from "../../../lib/publications.mjs";
import { boardFromFiles } from "../../../lib/board-files.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  // On a developer's machine only: the file as it stands. See board-files.mjs.
  const fromFiles = await boardFromFiles("constitutions", params);
  if (fromFiles) return Response.json(fromFiles, { headers: { "Cache-Control": "no-store" } });
  const { status, body, cacheControl } = await readerResponse("constitutions", params);
  return Response.json(body, {
    status,
    headers: cacheControl ? { "Cache-Control": cacheControl } : {},
  });
}
