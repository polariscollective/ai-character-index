/**
 * The reader is static and stays static. `site/` is its source; a prebuild step
 * copies it into `public/`, which Next serves directly.
 *
 * `skipTrailingSlashRedirect` is the load-bearing line. The reader is a
 * directory of assets referenced relatively, so it must be served at
 * `/spec-reader/`; Next's default is to redirect that to `/spec-reader`, where
 * every `./styles.css` resolves against the root and 404s. Turning the redirect
 * off keeps the URL as asked, and the rewrites below hand each directory URL its
 * index file -- Next serves `public/index.html` at `/index.html` but not at `/`.
 */
const nextConfig = {
  skipTrailingSlashRedirect: true,
  /* About was How it works and contribute, at /how-it-works, until 18 September
     2026. Links to the old address are already shared, CITATION.cff among them,
     so it redirects rather than disappears. A redirect keeps the query string,
     which is how ?propose and ?publication= survive it. */
  async redirects() {
    return [
      { source: "/how-it-works", destination: "/about", permanent: true },
      { source: "/how-it-works/", destination: "/about", permanent: true },
    ];
  },
  async rewrites() {
    return [
      /* The grid is the front page. It was the spec reader, reached through a
         meta refresh in index.html; the grid says what the index holds before a
         reader has chosen anything to read, which is the better first thing to
         meet. /overview still answers, so a link already shared still works.

         index.html is gone rather than left to be shadowed. An array returned
         from rewrites() is applied AFTER the filesystem, so a real file at a
         path always wins and this rewrite never fired while that file existed:
         / went on serving the old redirect into the reader. The comment this
         replaces claimed Next serves public/index.html "at /index.html but not
         at /", which was wrong -- it serves it at both, and the rewrite beneath
         it had been redundant all along. */
      { source: "/", destination: "/overview.html" },
      { source: "/spec-reader", destination: "/spec-reader/index.html" },
      { source: "/spec-reader/", destination: "/spec-reader/index.html" },
      // The grid and the prose pages. Each is a file on disk and that is an
      // implementation detail; its address is a name.
      //
      // Overview was briefly a directory with an index file instead, which
      // served locally and would have 404ed here: Next hands a directory URL its
      // index only where a rewrite below says so, and none said so for that one.
      // It is a file like its three siblings now, addressed the same way.
      { source: "/overview", destination: "/overview.html" },
      { source: "/overview/", destination: "/overview.html" },
      /* The board the front page led with until 23 September 2026, which is
         built from the publication rather than from a written file. It moved
         here rather than being deleted: its figures open on the passages behind
         them, and nothing else on the site does. */
      { source: "/coverage", destination: "/coverage.html" },
      { source: "/coverage/", destination: "/coverage.html" },
      { source: "/about", destination: "/about.html" },
      { source: "/about/", destination: "/about.html" },
      { source: "/mcp", destination: "/mcp.html" },
      { source: "/mcp/", destination: "/mcp.html" },
    ];
  },
};

export default nextConfig;
