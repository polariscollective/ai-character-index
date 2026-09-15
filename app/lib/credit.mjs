/**
 * The name a public credit is written under, never the operator's address.
 *
 * A signed-in identity is for the audit trail: `aci_jobs.created_by` records who
 * pressed the button, and that column is never touched here. A credit is
 * different -- it is read back by `creditFor()` and served to anyone reading
 * `/api/reader/publication`, so an address read there is a leak of somebody's
 * personal e-mail rather than an attribution. A credit field therefore never
 * falls back to the address that signed the operator in: left empty, it credits
 * the Collective, and a value that looks like an address is refused before
 * anything is written.
 */

/** What an empty credit becomes. */
export const DEFAULT_CREDIT = "Polaris Collective";

/** Why a credit cannot be written, or null. */
export function creditProblem(value) {
  if (value && value.includes("@")) {
    return "credit must not be an e-mail address: it is shown publicly in a "
         + "citation, so write a name instead, such as your own or "
         + '"Polaris Collective"';
  }
  return null;
}

/** The credit to write: what was typed, or the Collective if the field was left empty. */
export function resolveCredit(value) {
  return value || DEFAULT_CREDIT;
}
