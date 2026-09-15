"""PostgREST access to the index's aci_ tables.

Standard library only. CI installs nothing on the python side, and the panel
half of this repository has always run on the stdlib; a client is a hundred
lines and not worth a dependency that would have to be installed in the runner,
in the Cloud Run image and on every contributor's machine.

The transport is injectable so the tests never touch a network.
"""

import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


class StoreError(Exception):
    """A request PostgREST refused. Carries the status and the body."""


def _urllib_transport(method, url, headers, body):
    request = urllib.request.Request(
        url, method=method, headers=headers,
        data=body.encode("utf-8") if body else None)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


# Whether a failed request is safe to retry depends on whether it can have
# reached the database, not just on the exception it raised:
#
# - A `URLError` that is not an `HTTPError` -- a TLS handshake timeout, a
#   refused or reset connection, a DNS failure -- means `urlopen` never
#   finished sending the request: it wraps failures of connecting and sending
#   this way, so nothing was processed. Retried for every method, POST
#   included.
# - A raw `TimeoutError`/`socket.timeout`, `http.client.RemoteDisconnected` or
#   `ConnectionResetError` raised while reading the response, or an
#   `HTTPError` with status 502, 503 or 504, means the request may already
#   have been processed. Retried only for a method that is idempotent here:
#   GET, PATCH (which writes an absolute value) and DELETE. A POST is never
#   retried past this point, since retrying an insert could duplicate a row.
# - Everything else -- other 4xx/5xx, errors in this code -- fails
#   immediately, as before.
IDEMPOTENT_METHODS = {"GET", "PATCH", "DELETE"}
RETRYABLE_STATUSES = {502, 503, 504}
RETRY_BACKOFF_SECONDS = (2, 4, 8, 16)
MAX_RETRIES = len(RETRY_BACKOFF_SECONDS)


class Store:
    def __init__(self, url, key, transport=None, sleep=None):
        self.url = url.rstrip("/")
        self.key = key
        self.transport = transport or _urllib_transport
        self.sleep = sleep or time.sleep

    @classmethod
    def from_env(cls):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set "
                     "(a gitignored .env at the root of this repo is the usual place)")
        return cls(url, key)

    def _headers(self, extra=None):
        headers = {"apikey": self.key,
                   "Authorization": f"Bearer {self.key}",
                   "Content-Type": "application/json"}
        headers.update(extra or {})
        return headers

    @staticmethod
    def _log_retry(method, table, attempt, reason):
        # Never a header or a key: only the method, the table, the attempt
        # number and a short reason.
        print(f"store retry: {method} {table} attempt {attempt}/{MAX_RETRIES}: "
              f"{reason}", file=sys.stderr)

    def _call_transport(self, method, table, url, headers, body):
        """The one place `self.transport` is called, retried on a transient
        failure. See the module-level comment above IDEMPOTENT_METHODS for
        which failures are retried, and for which methods."""
        attempt = 0
        while True:
            try:
                status, payload = self.transport(method, url, headers, body)
            except urllib.error.HTTPError as e:
                status, payload = e.code, e.read()
            except urllib.error.URLError as e:
                if attempt >= MAX_RETRIES:
                    raise
                attempt += 1
                self._log_retry(method, table, attempt, f"{type(e).__name__}: {e}")
                self.sleep(RETRY_BACKOFF_SECONDS[attempt - 1])
                continue
            except (TimeoutError, http.client.RemoteDisconnected,
                    ConnectionResetError) as e:
                if method not in IDEMPOTENT_METHODS or attempt >= MAX_RETRIES:
                    raise
                attempt += 1
                self._log_retry(method, table, attempt, f"{type(e).__name__}: {e}")
                self.sleep(RETRY_BACKOFF_SECONDS[attempt - 1])
                continue

            if (status in RETRYABLE_STATUSES and method in IDEMPOTENT_METHODS
                    and attempt < MAX_RETRIES):
                attempt += 1
                self._log_retry(method, table, attempt, f"HTTP {status}")
                self.sleep(RETRY_BACKOFF_SECONDS[attempt - 1])
                continue
            return status, payload

    def _request(self, method, table, query=None, body=None, extra_headers=None):
        url = f"{self.url}/rest/v1/{table}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        status, payload = self._call_transport(
            method, table, url, self._headers(extra_headers),
            json.dumps(body) if body is not None else None)
        if status >= 300:
            raise StoreError(f"{method} {table} -> {status}: "
                             f"{payload.decode('utf-8', 'replace')[:500]}")
        return payload

    PAGE = 1000   # PostgREST's own ceiling on one response

    def select(self, table, params=None):
        """Every matching row, paged.

        PostgREST answers at most a thousand rows and does not say so anywhere
        the caller trips over, so a naive select over a big table quietly
        returns a prefix and everything downstream is wrong about a smaller
        world. A caller that passes its own `limit` is asking for one page and
        gets exactly that.
        """
        params = dict(params or {})
        if "limit" in params:
            return json.loads(self._request("GET", table, query=params) or b"[]")
        rows, offset = [], 0
        while True:
            page = json.loads(self._request(
                "GET", table,
                query=params | {"limit": str(self.PAGE), "offset": str(offset)}) or b"[]")
            rows.extend(page)
            if len(page) < self.PAGE:
                return rows
            offset += self.PAGE

    def insert(self, table, rows, chunk=1000, returning=False):
        """Rows in batches. A whole runlog is thirty thousand rows, and one
        request carrying all of them is several megabytes of JSON.

        `returning` asks for the rows as written, which is how a caller learns the
        id and the defaults the database filled in. It is not the default: the
        bulk inserts here write tens of thousands of rows, and asking for all of
        them back doubles the traffic to no purpose.
        """
        written = []
        for start in range(0, len(rows), chunk):
            payload = self._request(
                "POST", table, body=rows[start:start + chunk],
                extra_headers={"Prefer": "return=representation" if returning
                               else "return=minimal"})
            if returning:
                written.extend(json.loads(payload or b"[]"))
        return written if returning else None

    def update(self, table, match, patch):
        query = {column: f"eq.{value}" for column, value in match.items()}
        self._request("PATCH", table, query=query, body=patch,
                      extra_headers={"Prefer": "return=minimal"})
