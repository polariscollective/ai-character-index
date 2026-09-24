# Vendored, not bundled

`site/` is copied into `public/` by `cp -R` and served as files. There is no
bundler, so a library used by `page-feedback.js` has to be a file here.

`html2canvas.min.js` is html2canvas 1.4.1, MIT, copied from
`node_modules/html2canvas/dist/`. The devDependency in `package.json` records
the version; updating is `pnpm up html2canvas` and the same copy again.

It is loaded by a script tag the first time somebody presses the feedback pill,
so the four public pages carry no cost until then.

Why this library and not a newer one: it does not render through an SVG
`foreignObject`. It walks the DOM and draws text with `fillText`, using the
fonts already loaded in the document, so the three Google fonts these pages
carry need no inlining. That is the failure mode that makes the `foreignObject`
libraries unusable here.
