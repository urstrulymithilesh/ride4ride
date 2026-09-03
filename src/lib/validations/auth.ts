/**
 * Lightweight, dependency-free validation for auth forms.
 * (Swap for zod later if schemas grow — kept minimal for Phase 1.)
 */

export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Current version of the Terms. Bump this whenever the Terms change in a
 * way that should require re-acceptance; `profiles.tos_version` records
 * what each user actually agreed to, so `profiles_missing_tos()` can find
 * everyone still on an older one.
 */
export const TOS_VERSION = "2026-09-03";

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  ageConfirmed18: boolean;
}

export interface SignInInput {
  email: string;
  password: string;
}

export function validateSignUp(raw: {
  email: string;
  password: string;
  displayName: string;
  ageConfirmed18: boolean;
}): { ok: true; data: SignUpInput } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const email = raw.email.trim().toLowerCase();
  const displayName = raw.displayName.trim();
  const password = raw.password;

  if (!EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (displayName.length < 2)
    fieldErrors.displayName = "Display name must be at least 2 characters.";
  if (displayName.length > 50)
    fieldErrors.displayName = "Display name must be 50 characters or fewer.";
  if (password.length < 8)
    fieldErrors.password = "Password must be at least 8 characters.";
  // Blocking, not advisory: the attestation cannot be applied
  // retroactively to a ride that has already happened.
  if (!raw.ageConfirmed18)
    fieldErrors.ageConfirmed18 =
      "You must be 18 or older and accept the Terms to create an account.";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    data: { email, password, displayName, ageConfirmed18: true },
  };
}

export function validateSignIn(raw: {
  email: string;
  password: string;
}): { ok: true; data: SignInInput } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const email = raw.email.trim().toLowerCase();

  if (!EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (!raw.password) fieldErrors.password = "Enter your password.";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { email, password: raw.password } };
}

/**
 * HOOK for a later phase: .edu student verification.
 * Right now sign-up accepts any email and profiles default to 'unverified'.
 * When we add verification, gate/flag accounts using this helper.
 */
export function isEduEmail(email: string): boolean {
  return /\.edu$/i.test(email.trim().toLowerCase());
}

/**
 * Only allow internal, single-slash paths as post-auth redirect targets.
 * Prevents open-redirect via `?redirectTo=//evil.com`.
 */
export function sanitizeRedirect(
  path: string | null | undefined,
  fallback = "/",
): string {
  if (!path) return fallback;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
