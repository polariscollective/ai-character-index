/**
 * Telling Slack, for the routes open to the internet.
 *
 * Two of them now, saying different things through one webhook. What is shared
 * is not the message: it is the escaping that stops a stranger's words pinging
 * the channel, and a send that reports what went wrong rather than throwing it
 * at a caller who has already recorded the thing it is about.
 *
 * Each caller builds its own blocks. This sends them.
 */

/* Slack reads a few sequences out of message text, and one of them is a way to
 * ping everyone in the channel. These forms are open to the internet, so a
 * submission could carry <!channel> and would otherwise send it. Escaping the
 * three characters Slack asks for is also what stops that being parsed at all. */
export function forSlack(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Post a message. Returns what went wrong, or null; never throws.
 *
 * The row it describes is already written by the time this runs, so a failure
 * here is a message nobody got rather than words nobody has. `title` is the
 * notification and the fallback for clients that do not render blocks: sending
 * blocks without it makes a silent push.
 */
export async function postToSlack(title, blocks, fetchImpl = fetch) {
  const hook = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!hook) return "SLACK_WEBHOOK_URL is not set";
  try {
    const response = await fetchImpl(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: forSlack(title), blocks }),
    });
    return response.ok ? null : `slack returned ${response.status}`;
  } catch (error) {
    return `slack unreachable: ${error.message}`;
  }
}
