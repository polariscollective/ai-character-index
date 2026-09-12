/**
 * The one place a route talks to PostgREST.
 *
 * Two libraries had grown their own copy of the credentials check and the
 * request, which is how the third would have grown a fourth. The service role
 * key bypasses row-level security, so every guard this database has is the
 * secrecy of that key plus whatever the caller checked first: nothing here
 * authenticates anybody, and a route that calls it without checking the session
 * is open.
 *
 * `fetchImpl` is injected everywhere so the tests touch no network.
 */

function credentials() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return { url: url.replace(/\/$/, ""), key };
}

/* PostgREST answers at most this many rows whatever the limit asks for, so a
 * reader that does not page silently sees a prefix. The engine's Python client
 * learned this the hard way -- it reported thirty thousand rows missing from a
 * complete table -- and the same ceiling applies here. */
const PAGE = 1000;

async function request(method, path, { body, headers = {}, fetchImpl = fetch } = {}) {
  const { url, key } = credentials();
  const response = await fetchImpl(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${method} ${path} -> ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return response;
}

/** Every row a query matches, paged. `query` is a PostgREST query string. */
export async function select(table, query = "", fetchImpl = fetch) {
  // A caller that asked for its own window gets exactly that window: an explicit
  // limit is a decision, and paging past it would overrule it.
  if (/(^|&)limit=/.test(query)) {
    const response = await request("GET", `${table}?${query}`, { fetchImpl });
    return response.json();
  }
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await (await request(
      "GET", `${table}?${query}${query ? "&" : ""}limit=${PAGE}&offset=${offset}`,
      { fetchImpl },
    )).json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** Insert rows and return them as written, defaults filled in. */
export async function insert(table, rows, fetchImpl = fetch) {
  const response = await request("POST", table, {
    body: rows, headers: { Prefer: "return=representation" }, fetchImpl,
  });
  return response.json();
}

/** Patch the rows a query matches, and return them. */
export async function update(table, query, patch, fetchImpl = fetch) {
  if (!query) throw new Error("update needs a filter: an unfiltered patch hits every row");
  const response = await request("PATCH", `${table}?${query}`, {
    body: patch, headers: { Prefer: "return=representation" }, fetchImpl,
  });
  return response.json();
}
