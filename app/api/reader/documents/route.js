import { readerResponse } from "../../../lib/publications.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { status, body, cacheControl } = await readerResponse(
    "documents", new URL(request.url).searchParams);
  return Response.json(body, {
    status,
    headers: cacheControl ? { "Cache-Control": cacheControl } : {},
  });
}
