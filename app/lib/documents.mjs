/**
 * What a document is called, and how a form lists them.
 *
 * A document is a version of a specification. A specification's id is
 * `<lab>--<name>`: the double hyphen splits the lab from a name that may carry
 * single hyphens, and a document's id is that followed by `@<version>`, the head
 * of every locator into it. The citation grammar reads a specification name as
 * [a-z-]+ and a version as a date, so those are what a name and a version may be.
 */
import { resolveCredit } from "./credit.mjs";

const NAME = /^[a-z]+(-[a-z]+)*$/;
const VERSION = /^\d{4}-\d{2}-\d{2}$/;

export function specificationId(lab, name) {
  return `${lab}--${name}`;
}

export function nameProblem(name) {
  if (!name) return "the document name is required";
  if (!NAME.test(name)) {
    return "the document name must be lowercase words joined by single hyphens, "
         + "such as model-spec: a citation reads it as letters and hyphens";
  }
  return null;
}

export function versionProblem(version) {
  if (!version) return "the version is required";
  if (!VERSION.test(version)) {
    return "the version must be the release date, written 2026-08-18: a citation reads it as a date";
  }
  return null;
}

/** Why a label cannot be registered for a document, or null.
 *
 * The label is part of the document's id, so a second text under the same label
 * would share the first one's id; the table's unique key is on the digest only.
 * A corrected text is a new version with a label of its own. */
export function labelTaken(versions, specId, version) {
  return versions.some(row => row.spec_id === specId && row.version === version)
    ? `${specId}@${version} is already registered. A document is a version and its `
      + "label is part of its id, so a corrected text needs a label of its own."
    : null;
}

/** Whether a specification is named `<lab>--<name>`: its own lab, then a name
 * `nameProblem` accepts.
 *
 * The expand migration copied the two documents the index carried under such
 * names and left the old rows until a cleanup migration. A row that fails this is
 * one of those, and offering it would list its document twice. */
function namedByLab(spec) {
  const name = spec.id.slice(specificationId(spec.lab_id, "").length);
  return Boolean(spec.lab_id) && specificationId(spec.lab_id, name) === spec.id
    && nameProblem(name) === null;
}

/** Every version as its own document, in the order the specifications list them.
 * Only specifications named by their lab are offered. */
export function documentChoices(specs) {
  return specs.filter(namedByLab).flatMap(spec => spec.versions.map(version => ({
    value: version.id,
    label: `${spec.title} ${version.version}`,
  })));
}

/**
 * The row a registered version writes.
 *
 * `credit` is the form's field, not the operator's address -- this is the one
 * place the row is assembled, so it is the one place a reviewer needs to check
 * that an address cannot land in `added_by`. It never does: `resolveCredit`
 * reads only what was typed, and the operator's e-mail is not among this
 * function's arguments at all.
 */
export function newVersionRow({ specId, version, markdown, digest, sourceUrl, credit }) {
  return {
    spec_id: specId, version, markdown, content_sha256: digest,
    source_url: sourceUrl, added_by: resolveCredit(credit),
  };
}
