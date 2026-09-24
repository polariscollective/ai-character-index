/* The third route open to the internet that writes.
 *
 * It records what a reader thinks of a page, with a picture of the page. It
 * registers nothing, judges nothing, spends nothing and publishes nothing.
 *
 * Everything it does is in app/lib/page-feedback.mjs, where it can be tested
 * without a server. */
import { handle } from "../../lib/page-feedback.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  return handle(request);
}
