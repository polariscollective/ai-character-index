/* Write public/deployment.js from the variables Vercel sets while it builds:
 * VERCEL_ENV (production, preview or development) and VERCEL_GIT_COMMIT_REF
 * (the branch). site/publication-data.js reads it to know whether this copy is
 * a preview of a working branch, where the boards are read from the files the
 * branch carries rather than from the publication. Off Vercel both are absent
 * and the file says so, as site/deployment.js already does.
 *
 * Run: node engine/write-deployment.mjs (the build runs it after copying site/). */
import { writeFileSync } from "node:fs";

const deployment = {
  env: process.env.VERCEL_ENV || null,
  branch: process.env.VERCEL_GIT_COMMIT_REF || null,
};
writeFileSync(new URL("../public/deployment.js", import.meta.url),
  "/* Written by engine/write-deployment.mjs when the site was built. */\n"
  + `export const DEPLOYMENT = ${JSON.stringify(deployment)};\n`);
console.log(`public/deployment.js: ${JSON.stringify(deployment)}`);
