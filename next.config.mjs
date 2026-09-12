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
      // The prose pages. Each is a file on disk and that is an implementation
      // detail; its address is a name.
      { source: "/how-it-works", destination: "/how-it-works.html" },
    ];
  },
};

export default nextConfig;
