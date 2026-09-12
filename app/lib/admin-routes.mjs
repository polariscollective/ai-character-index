/**
 * The shape every mutating route of the portal has.
 *
 * Plain form posts, answered with a redirect back to the page that asked,
 * carrying the outcome in the query string. No client-side state: the result of
 * pressing a button survives a reload and can be linked to, and the portal needs
 * no JavaScript to work at all.
 *
 * Each route calls requireOperator itself. The layout's check keeps a page from
 * rendering; it says nothing about a POST, and a route is reachable without its
 * page.
 */
/** Where to send the browser back to, with what to say when it gets there. */
function back(request, to, outcome) {
  const url = new URL(to, request.url);
  for (const [key, value] of Object.entries(outcome)) {
    if (value) url.searchParams.set(key, value);
  }
  // 303: the browser must follow with GET. A 302 after a POST is allowed to
  // repeat the POST, which on these routes would launch a second job.
  return Response.redirect(url, 303);
}

/**
 * Wrap an action so it reads a form, runs, and redirects.
 *
 * The guard is passed in rather than imported. Every route names the check it
 * makes, which is the point -- a route is reachable without its page, and the
 * layout's check says nothing about a POST. It also lets this file be tested
 * under plain node, where the authentication library cannot be loaded at all.
 *
 * `act(fields, email)` returns the sentence to show, or throws. A thrown message
 * is what the operator reads, so the actions throw sentences rather than stack
 * traces -- and the stack still reaches the platform log.
 */
export function formRoute(to, guard, act) {
  return async function POST(request) {
    const who = await guard();
    if (who.response) return who.response;

    let fields;
    try {
      fields = await request.formData();
    } catch {
      return back(request, to, { problem: "that was not a form" });
    }

    try {
      const done = await act(new Fields(fields), who.email);
      return back(request, to, { done });
    } catch (error) {
      console.error(`${to}: ${error.stack || error}`);
      return back(request, to, { problem: error.message || String(error) });
    }
  };
}

/** A form's values, read the way these routes want them. */
export class Fields {
  constructor(data) {
    this.data = data;
  }

  /** One value, trimmed, or "" -- never undefined, so a check is one comparison. */
  one(name) {
    const value = this.data.get(name);
    return typeof value === "string" ? value.trim() : "";
  }

  /** One value with its edges kept, for a document's text. */
  raw(name) {
    const value = this.data.get(name);
    return typeof value === "string" ? value : "";
  }

  /** Every value of a repeated field, empties dropped. */
  many(name) {
    return this.data.getAll(name)
      .filter(value => typeof value === "string")
      .map(value => value.trim())
      .filter(Boolean);
  }

  /** A checkbox: present means on, whatever its value. */
  on(name) {
    return this.data.has(name);
  }
}

/** Throw a sentence the operator will read. */
export function refuse(message) {
  throw new Error(message);
}
