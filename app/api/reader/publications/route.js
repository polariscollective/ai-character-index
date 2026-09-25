/* The publications a reader may open, newest first, for the change log.
 *
 * On production, the ones an operator has made public and nothing else, as every
 * other route on production reads. On a development deployment, every
 * publication, drafts included, each marked with whether it was made public, so
 * an unpublished build can be found and opened there. Identity only: none of the
 * frozen columns, which are megabytes.
 */
import { select } from "../../../lib/supabase.mjs";
import { servesDevelopment } from "../../../lib/publications.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const development = servesDevelopment();
  const rows = await select("aci_publications",
    "select=id,published_at,notes,is_public&order=published_at.desc"
    + (development ? "" : "&is_public=is.true"));
  return Response.json({ development, publications: rows }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400" },
  });
}
