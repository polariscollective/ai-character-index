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
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
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
      { source: "/how-it-works", destination: "/how-it-works.html" },
      { source: "/how-it-works/", destination: "/how-it-works.html" },
      { source: "/mcp", destination: "/mcp.html" },
      { source: "/mcp/", destination: "/mcp.html" },
    ];
  },
};

export default nextConfig;
