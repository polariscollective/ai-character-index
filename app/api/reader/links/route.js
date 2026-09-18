/* What one document's passage does to another's, as the publication froze it.
 *
 * This read the live tables until 2026-09-18, which meant two things: pinning an
 * old publication served its documents under today's readings, and storing a run
 * changed what the public saw with no publication and no deploy. The links are a
 * column of the publication row now, built by engine/build-links-data.mjs and
 * held to a digest, so this route is the payload route with a different column
 * name. See docs/superpowers/specs/2026-09-18-links-belong-to-a-publication-design.md.
 */
import { readerResponse } from "../../../lib/publications.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { status, body, cacheControl } = await readerResponse(
    "links", new URL(request.url).searchParams);
  return Response.json(body, {
    status,
    headers: cacheControl ? { "Cache-Control": cacheControl } : {},
  });
}
