/**
 * The reader is static and stays static. `site/` is its source; a prebuild step
 * copies it into `public/`, which Next serves directly.
 *
 * `skipTrailingSlashRedirect` is the load-bearing line. The reader is a
 * directory of assets referenced relatively, so it must be served at
 * `/doc-reader/`; Next's default is to redirect that to `/doc-reader`, where
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
    /* main-wip: the index is built in private, so a production deployment of
       this branch shows a holding page (site/wip.html) at every public address.
       Every page of the site is sent to it, the files behind them included.
       The portal and the routes stay, since the holding page's form uses one. */
    const holding = ["/overview", "/index", "/doc-reader", "/spec-reader", "/about", "/mcp",
      "/coverage", "/how-it-works", "/propose"].flatMap(page => [
      { source: page, destination: "/", permanent: false },
      { source: `${page}/:path*`, destination: "/", permanent: false },
    ]);
    return [
      ...holding,
      { source: "/:page(overview|boards|about|mcp|coverage|propose).html", destination: "/",
        permanent: false },
      { source: "/how-it-works", destination: "/about", permanent: true },
      { source: "/how-it-works/", destination: "/about", permanent: true },
      /* The Doc reader was at /spec-reader/ until 25 September 2026, and links
         to it are shared, so the page redirects with its query string. Only the
         page: its assets are still served where they are, for a page already
         open that asks for them. */
      { source: "/spec-reader", destination: "/doc-reader/", permanent: true },
      { source: "/spec-reader/", destination: "/doc-reader/", permanent: true },
      { source: "/spec-reader/index.html", destination: "/doc-reader/", permanent: true },
    ];
  },
  async rewrites() {
    return [
      /* The overview is the front page, since 24 September 2026: what the
         index finds, on one page, before a reader chooses a board or a
         document. The grid of the two boards held the front page before it, at
         /index now, and the spec reader, reached through a meta refresh in
         index.html, before that. /overview answers too.

         index.html is gone rather than left to be shadowed. An array returned
         from rewrites() is applied AFTER the filesystem, so a real file at a
         path always wins and this rewrite never fired while that file existed:
         / went on serving the old redirect into the reader. The comment this
         replaces claimed Next serves public/index.html "at /index.html but not
         at /", which was wrong -- it serves it at both, and the rewrite beneath
         it had been redundant all along. */
      // main-wip: the front page is the holding page.
      { source: "/", destination: "/wip.html" },
      /* The Doc reader's address is /doc-reader/ since 25 September 2026, the
         name every page gives it. Its files stay in site/spec-reader/, which is
         a name the code and the tests use and nobody reads, so the address is
         mapped onto them: the page, and every asset it asks for relatively. */
      /* Next reads /doc-reader and /doc-reader/ as one path, so the bare name
         cannot be redirected to the slashed one here without redirecting the
         slashed one to itself. The page adds the slash itself, first thing. */
      { source: "/doc-reader", destination: "/spec-reader/index.html" },
      { source: "/doc-reader/", destination: "/spec-reader/index.html" },
      { source: "/doc-reader/:path+", destination: "/spec-reader/:path+" },
      // The grid and the prose pages. Each is a file on disk and that is an
      // implementation detail; its address is a name.
      //
      // Overview was briefly a directory with an index file instead, which
      // served locally and would have 404ed here: Next hands a directory URL its
      // index only where a rewrite below says so, and none said so for that one.
      // It is a file like its three siblings now, addressed the same way.
      { source: "/overview", destination: "/overview.html" },
      { source: "/overview/", destination: "/overview.html" },
      /* The two boards, which were the front page until 24 September 2026: the
         overview took the front page, and a reader reaches the boards from the
         Index menu in the header. The file is boards.html because index.html at
         the root would be served at / ahead of every rewrite here. */
      { source: "/index", destination: "/boards.html" },
      { source: "/index/", destination: "/boards.html" },
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
