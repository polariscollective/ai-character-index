import { behaviourNotes } from "../../../lib/behaviours.mjs";
import { isPublicationId } from "../../../lib/publications.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  // The same pin the payload route takes, so a reader looking at a draft reads
  // that draft's behaviours rather than the public one's.
  const pin = new URL(request.url).searchParams.get("publication");
  if (pin !== null && !isPublicationId(pin)) {
    return Response.json({ error: "publication must be a uuid" }, { status: 400 });
  }
  return Response.json(await behaviourNotes(fetch, pin), {
    // Registry state, not publication state: it changes when someone edits a
    // behaviour rather than when someone publishes, so it is revalidated often
    // and cached briefly.
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" },
  });
}
