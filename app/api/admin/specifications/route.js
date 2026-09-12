/* Registering a version of a document.
 *
 * Versions are insert-only by grant, which is what makes the citation guarantee
 * structural: no code path can move text a stored locator points at, because none
 * holds the privilege. A correction is therefore a new version, and the two
 * coexist -- which is the truth about a lab that reissues a document.
 *
 * The name and the version label are checked against the locator grammar. This is
 * the guard that died when the user manifest was deleted: its constants stopped
 * being read and nothing noticed, because a dead constant raises nothing. */
import { createHash } from "node:crypto";
import { insert, select } from "../../../lib/supabase.mjs";
import { requireOperator } from "../../../auth.mjs";
import { formRoute, refuse } from "../../../lib/admin-routes.mjs";
import { locatorSafe, problems } from "../../../lib/locator-safe.mjs";

const STYLES = ["path", "anchor"];

export const POST = formRoute("/admin/specifications", requireOperator, async (fields, email) => {
  const id = fields.one("id");
  const version = fields.one("version");
  const markdown = fields.raw("markdown");
  const sourceUrl = fields.one("source_url");
  const lab = fields.one("lab");
  const title = fields.one("title");
  const shortTitle = fields.one("short_title");
  const style = fields.one("locator_style");

  const found = problems([
    [locatorSafe, id, "the document id"],
    [locatorSafe, version, "the version label"],
  ]);
  if (!markdown.trim()) found.push("the document's markdown is required");
  if (!sourceUrl) found.push("a source url is required: a stored version says where it came from");
  if (found.length) refuse(found.join("\n"));

  const [specs, labs] = await Promise.all([
    select("aci_specs", "select=*"),
    select("aci_labs", "select=id"),
  ]);
  const spec = specs.find(row => row.id === id);

  if (!spec) {
    // A new document needs everything a locator and a reader will ask of it.
    const missing = [];
    if (!labs.some(row => row.id === lab)) {
      missing.push(`lab must be one of ${labs.map(row => row.id).join(", ")}`);
    }
    if (!title) missing.push("title is required for a document the index has not seen");
    if (!shortTitle) missing.push("short title is required");
    if (!STYLES.includes(style)) missing.push(`locator style must be ${STYLES.join(" or ")}`);
    if (missing.length) refuse(missing.join("\n"));
    await insert("aci_specs", [{
      id, lab_id: lab, title, short_title: shortTitle,
      source_url: sourceUrl, locator_style: style,
    }]);
  }

  const digest = createHash("sha256").update(markdown).digest("hex");
  const versions = await select("aci_spec_versions",
                                `select=version,content_sha256&spec_id=eq.${id}`);
  const same = versions.find(row => row.content_sha256 === digest);
  if (same) {
    refuse(`Those exact bytes are already registered as ${id}@${same.version}. `
           + "A version is identified by its content, so the same text cannot be "
           + "registered twice under two labels.");
  }

  await insert("aci_spec_versions", [{
    spec_id: id, version, markdown, content_sha256: digest,
    source_url: sourceUrl, added_by: email,
  }]);
  return `Registered ${id}@${version}, ${markdown.length.toLocaleString("en-GB")} `
       + `characters, digest ${digest.slice(0, 12)}. Nothing judges it until a run `
       + "names it.";
});
