/* The second route open to the internet that writes.
 *
 * It records what a reader thinks of one paragraph. It registers nothing,
 * judges nothing, spends nothing and publishes nothing: what a reader permits
 * is stored, and showing any of it is a separate decision a person makes.
 *
 * Everything it does is in app/lib/feedback.mjs, where it can be tested without
 * a server. */
import { handle } from "../../lib/feedback.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  return handle(request);
}
