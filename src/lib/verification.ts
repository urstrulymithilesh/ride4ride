/**
 * Student (.edu) verification configuration.
 *
 * Two knobs:
 *  - MODE (env `EDU_VERIFICATION_MODE`): "restrict" blocks sign-up from
 *    non-allowed domains; "badge" allows anyone but only marks allowed
 *    domains as a verified student. Default: "restrict".
 *  - Allowed domains: the single source of truth is the DB table
 *    `allowed_email_domains` (admin-editable), matched via the
 *    `is_allowed_student_email` SQL function. This module only holds the
 *    mode + a display hint; it does NOT hardcode the domain list.
 */

export type VerificationMode = "restrict" | "badge";

export function getVerificationMode(): VerificationMode {
  return process.env.EDU_VERIFICATION_MODE === "badge" ? "badge" : "restrict";
}

/** Short hint shown in the UI (purely cosmetic). */
export const STUDENT_DOMAIN_HINT = ".edu";

/** Derive a coarse "school" label from an email domain, e.g. berkeley.edu. */
export function schoolFromEmail(email: string): string | null {
  const domain = email.split("@")[1];
  return domain ? domain.toLowerCase() : null;
}
