/**
 * Who is allowed in.
 *
 * One definition, serving the Google front door and any route that checks again.
 * Two definitions diverge, and it is the more permissive one that wins.
 *
 * Both lists empty means nobody, which is restrictive and therefore harmless:
 * the failure of a forgotten variable is a locked door, not an open one.
 */
function parseList(value) {
  return (value || "").split(",").map(entry => entry.trim().toLowerCase()).filter(Boolean);
}

export function isAllowedEmail(email) {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return false;
  if (parseList(process.env.ALLOWED_EMAILS).includes(normalized)) return true;
  const domain = normalized.split("@")[1];
  return Boolean(domain && parseList(process.env.ALLOWED_DOMAINS).includes(domain));
}
