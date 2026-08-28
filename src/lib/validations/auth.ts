/**
 * Lightweight, dependency-free validation for auth forms.
 * (Swap for zod later if schemas grow — kept minimal for Phase 1.)
 */

export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export function validateSignUp(raw: {
  email: string;
  password: string;
  displayName: string;
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

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { email, password, displayName } };
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
