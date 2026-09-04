import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Signup email-domain gate.
 *
 * NAME IS HISTORICAL. This started as ".edu student verification" and the
 * env var still says EDU. Since 0013 there is no student badge: the
 * platform is not campus-scoped (§3), and a badge that ends up meaning
 * "has an email address" reads as an endorsement while guaranteeing
 * nothing. What survives is purely a signup allowlist.
 *
 * Two knobs:
 *  - MODE (env `EDU_VERIFICATION_MODE`): "restrict" blocks sign-up from
 *    domains not on the allowlist; "badge" lets anyone sign up. Default is
 *    "restrict" — anything that is not exactly "badge" restricts.
 *  - Allowed domains: the single source of truth is the DB table
 *    `allowed_email_domains` (admin-editable), matched via the
 *    `is_allowed_student_email` SQL function. This module only holds the
 *    mode + a display hint; it does NOT hardcode the domain list.
 */

export type VerificationMode = "restrict" | "badge";

export function getVerificationMode(): VerificationMode {
  return process.env.EDU_VERIFICATION_MODE === "badge" ? "badge" : "restrict";
}

/**
 * Human-readable list of the domains that may sign up, read from the DB
 * so it can never drift from the actual gate.
 *
 * A hardcoded hint used to live here and said ".edu". Once 0013 opened
 * signup to mainstream providers that string became a lie told to the
 * exact user it was rejecting — the worst kind of error message, because
 * it names a requirement that is not the real one. The list is small and
 * this only runs on the rejection path, so the extra read is free.
 */
export async function allowedDomainsHint(
  supabase: SupabaseClient,
): Promise<string> {
  try {
    const { data } = await supabase.from("allowed_email_domains").select("suffix");
    const list = (data ?? []).map((d) => d.suffix).sort();
    if (list.length === 0) return "an allowed email provider";
    if (list.length === 1) return list[0];
    return `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
  } catch {
    return "an allowed email provider";
  }
}

/** Derive a coarse "school" label from an email domain, e.g. berkeley.edu. */
export function schoolFromEmail(email: string): string | null {
  const domain = email.split("@")[1];
  return domain ? domain.toLowerCase() : null;
}
