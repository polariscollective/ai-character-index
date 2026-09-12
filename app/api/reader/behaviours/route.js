import { behaviourNotes } from "../../../lib/behaviours.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await behaviourNotes(), {
    // Registry state, not publication state: it changes when someone edits a
    // behaviour rather than when someone publishes, so it is revalidated often
    // and cached briefly.
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" },
  });
}
